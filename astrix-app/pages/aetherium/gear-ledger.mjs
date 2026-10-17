/**
 * Gear page (The Aetherium, hub/aetherium/gear/equipment/): what one Daeva wears, laid out like the game's equipment
 * window. An icon grid of 20 slots in two rows of 10 (weapons and armour, then accessories and runes), each item on its
 * grade tile with the enchant level and the item level on its corners. Hover or focus shows the name; a click or tap opens
 * the item card with what to do first. An item the grade rule says to enchant has a pulsing gold edge, one to replace a
 * quieter edge and a chevron, a fully enchanted one a check. Pet, wings, title and Arcana sit beside the grid as small tiles.
 * Item details load in the background after first paint (at most 3 at a time, kept for the session).
 * Skills and Daevanion boards have their own pages (see the character menu).
 */
import { ArmoryUnavailable, ascentUrl, cardUrl, explain, loadBuilds, loadCatalogue, loadGrades, loadItemDetail, loadMechanics, loadProgression, loadStats, preloadItemDetails, rolePick } from './aetherium-data.mjs';
import { $, esc, gradeTile, infoCardHtml, isPending, openInfo, slotLabel } from './aetherium-ui.mjs';
import { renderStatsPanel } from './stats-panel.mjs';
import { failPage, startCharacterPage, windowBar } from './character-page.mjs';
import { buildFor, enchantAdvice, enchantSteps, gearMoves, gradeInfo, indexGrades, indexMechanics, indexProgression } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { rankPointStats, subStatTag } from '/astrix-app/games/aion2/engine/stat-advisor.mjs';

/* The game's equipment window: row 1 weapons and armour, row 2 accessories and the two runes. Arcana have their own row. */
const GRID = ['MAINHAND', 'SUBHAND', 'HELMET', 'SHOULDER', 'TORSO', 'PANTS', 'GLOVES', 'BOOTS', 'CAPE', 'BELT',
  'NECKLACE', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'AMULET', 'RUNE1', 'RUNE2'];
const ARCANA = ['ARCANA1', 'ARCANA2', 'ARCANA3', 'ARCANA4', 'ARCANA5'];
const keyOf = name => String(name ?? '').toUpperCase().replace(/[\s_]/g, '');
const TAG_WORD = { high: 'High', useful: 'Useful', low: 'Low' };
const state = { looks: [], model: null, source: null, ref: null, selected: null, slotNames: new Map(), grades: null, progression: null, ring: null, later: new Set(), stats: null, build: null };

const adviceOf = slot => enchantAdvice(slot, { level: state.model.profile.level, grades: state.grades, progression: state.progression });
const gradeOf = slot => gradeInfo(slot.grade, state.grades, slot.gradeName ?? null);
const capText = slot => {
  const { cap, about } = adviceOf(slot) ?? {};
  return `+${slot.enchant}${Number.isFinite(cap) ? ` of ${about ? 'about ' : ''}${cap}` : ''}`;
};
/** What the tile's marker says, in words (the accessible name never relies on colour alone). */
const MARK_WORDS = { enchant: 'needs enchanting', replace: 'replace with a Unique piece', full: 'fully enchanted' };
const markOf = slot => (Object.hasOwn(MARK_WORDS, adviceOf(slot)?.action ?? '') ? adviceOf(slot).action : null);

const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* The title has no icon in the data: a laurel badge drawn here, never game art. */
const LAUREL = '<svg class="ae-title-badge" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40c-7-2-13-8-14-17M24 40c7-2 13-8 14-17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 30c-3 0-5-2-5-4 3 0 5 1 5 4zM10 23c-3-1-4-3-4-5 3 1 4 3 4 5zM11 16c-2-1-3-4-2-6 2 1 3 3 2 6zM36 30c3 0 5-2 5-4-3 0-5 1-5 4zM38 23c3-1 4-3 4-5-3 1-4 3-4 5zM37 16c2-1 3-4 2-6-2 1-3 3-2 6z" fill="currentColor"/><path d="M24 12l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor"/></svg>';

/** Exceed level beside the enchant: only above 0 (the data sends 0 for none). */
const exceedText = slot => (Number.isFinite(slot.exceed) && slot.exceed > 0 ? `Exceed ${slot.exceed}` : null);

/** The tile's accessible name: the item, its grade, +N of the cap and the marker in words, then item level and slot. */
function tileName(slot) {
  const mark = markOf(slot);
  return [slot.name, gradeOf(slot).name, capText(slot), exceedText(slot), mark ? MARK_WORDS[mark] : null, Number.isFinite(slot.itemLevel) ? `item level ${slot.itemLevel}` : null, slotLabel(slot.slot)].filter(Boolean).join(', ');
}
/** The slot, name, grade and cap as page text, visually hidden (the button's name comes from tileName). */
function tileWords(slot) {
  return `<span class="ae-sr" aria-hidden="true"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>${esc(slot.name)}</strong><span class="ae-slot-meta">${esc([gradeOf(slot).name, capText(slot), exceedText(slot)].filter(Boolean).join(' · '))}</span></span>`;
}

/** One worn tile: the icon on its grade, +N bottom corner, item level top corner when known, the marker. */
function tileHtml(slot, index) {
  const grade = gradeOf(slot);
  const mark = markOf(slot);
  const level = Number.isFinite(slot.itemLevel) ? `<b class="ae-gtile-lv" aria-hidden="true">${esc(slot.itemLevel)}</b>` : '';
  const exceed = exceedText(slot) ? `<b class="ae-gtile-ex" aria-hidden="true">E${esc(slot.exceed)}</b>` : '';
  const sign = mark === 'replace' ? `<span class="ae-gmark" aria-hidden="true">${CHEVRON}</span>` : mark === 'full' ? `<span class="ae-gmark" aria-hidden="true">${CHECK}</span>` : '';
  return `<button type="button" class="ae-slot ae-gbtn" data-slot="${index}" data-grade="${esc(grade.id ?? '')}" aria-haspopup="dialog" aria-label="${esc(tileName(slot))}" data-gtip="${index}">
      ${gradeTile({ icon: slot.icon, grade: grade.id, enchant: slot.enchant, size: 88, extra: `${level}${exceed}${sign}` })}${tileWords(slot)}
    </button>`;
}
const cellOf = (key, worn) => {
  if (!worn) return `<li class="ae-gcell is-empty" data-slot-key="${esc(key)}"><span class="ae-gempty" role="img" aria-label="${esc(slotLabel(state.slotNames.get(key) ?? key))}: empty"></span></li>`;
  const { slot, index } = worn;
  const mark = markOf(slot);
  return `<li class="ae-gcell" data-gear-index="${index}" data-slot-pos="${esc(slot.slotPos)}" data-slot-key="${esc(key)}"${mark ? ` data-advice="${mark}"` : ''}>${tileHtml(slot, index)}</li>`;
};

function renderGear() {
  const { gear } = state.model;
  $('#aeGearCount').textContent = `${gear.filter(slot => !slot.empty).length} of ${gear.length} worn`;
  const worn = new Map(gear.map((slot, index) => [keyOf(slot.slot), { slot, index }]).filter(([, entry]) => !entry.slot.empty));
  // A worn slot the grid does not name yet (a new slot type) is kept at the end of the grid, never dropped.
  const extra = [...worn.keys()].filter(key => !GRID.includes(key) && !ARCANA.includes(key));
  $('#aeGear').innerHTML = [...GRID, ...extra].map(key => cellOf(key, worn.get(key))).join('');
  // The five Arcana slots always show, worn or empty, in the data's order (Arcana1 to Arcana5). Each one opens a card.
  const anyArcana = state.model.arcana.some(slot => !slot.empty);
  $('#aeArcanaCount').textContent = `${state.model.arcana.filter(slot => !slot.empty).length} of ${state.model.arcana.length} worn`;
  $('#aeArcana').innerHTML = state.model.arcana.map((slot, n) => (slot.empty
    ? `<li class="ae-gcell is-empty" data-slot-key="${esc(keyOf(slot.slot))}" data-arcana-slot="${n + 1}"><button type="button" class="ae-slot ae-gbtn ae-arcana-empty" data-arcana-empty="${n + 1}" aria-haspopup="dialog" aria-label="${esc(slotLabel(slot.slot))}: empty" data-extra-tip="${esc(slotLabel(slot.slot))}" data-extra-line="Empty"><span class="ae-gempty" aria-hidden="true"></span></button></li>`
    : cellOf(keyOf(slot.slot), worn.get(keyOf(slot.slot))).replace('<li class="ae-gcell"', `<li class="ae-gcell" data-arcana-slot="${n + 1}"`))).join('');
  $('#aeArcanaNone').hidden = anyArcana;
  const accessories = state.model.accessorySlots;
  // Slots outside the always-listed eight (cape, belt, accessories) only reach the official site once something is worn there.
  const listed = new Set(gear.filter(slot => slot.empty || [1, 2, 3, 4, 5, 6, 7, 8].includes(slot.slotPos)).map(slot => slot.slotPos));
  const others = gear.filter(slot => !listed.has(slot.slotPos)).length;
  $('#aeAccessories').textContent = !isPending(accessories)
    ? `Accessories: ${accessories.filter(slot => !slot.empty).length} worn.`
    : others
      ? 'Other slots, such as accessories, show here once something is worn in them.'
      : 'Accessories: none worn. The official AION 2 site only lists an accessory slot once something is worn in it.';
  state.ring?.forEach(slotPos => document.querySelector(`#aeGearPanel [data-slot-pos="${CSS.escape(String(slotPos))}"]`)?.classList.add('is-ringed'));
}

/** Redraws one tile after its item detail lands: the real cap, the item level and the marker follow. */
function refreshTile(index) {
  const slot = state.model.gear[index];
  const li = document.querySelector(`#aeGearPanel [data-gear-index="${index}"]`);
  if (!li || slot.empty) return;
  li.innerHTML = tileHtml(slot, index);
  const mark = markOf(slot);
  if (mark) li.dataset.advice = mark; else delete li.dataset.advice;
}

/** Keeps what an item detail adds on the slot itself (the tile and the rule read it there). */
function applyDetail(slot, detail) {
  // Only the detail of the very item worn here (the same id) may change the tile.
  if (!detail || (detail.id !== undefined && slot.itemId !== undefined && detail.id !== slot.itemId)) return;
  if (!isPending(detail.maxEnchant)) slot.maxEnchant = detail.maxEnchant;
  if (!isPending(detail.manastoneSlots)) slot.manastoneSlots = detail.manastoneSlots;
  if (detail.gradeName) slot.gradeName = detail.gradeName;
  // The detail's level is the item level the game's tooltip shows (ENDPOINTS.md, 11 Oct 2026). levelValue is the enchant level.
  if (Number.isFinite(detail.level)) slot.itemLevel = detail.level;
}

/** The stats record's Arcana source line (stats.json source arcana), with its status. */
function arcanaSource() {
  const record = state.stats?.records?.find(item => item.id === 'arcana' && item.kind === 'source') ?? null;
  return { confirmed: record?.stats?.status === 'confirmed' };
}
const isArcana = slot => /^arcana\d$/i.test(String(slot?.slot ?? ''));
/** The plain Arcana line on an Arcana card, tagged with its status from stats.json. */
function arcanaNote(slot) {
  if (!isArcana(slot)) return '';
  const source = arcanaSource();
  return `<p class="ae-card-line" data-arcana-line>Arcana are the main source of deity stats.${source.confirmed ? '' : ` ${NOT_CONFIRMED(null)}`}</p>`;
}
/** An empty Arcana slot: "No Arcana yet" when none is worn, else this slot is empty. Nothing else is claimed. */
function openArcanaEmpty(n, from) {
  hideTip();
  const none = !state.model.arcana.some(slot => !slot.empty);
  const slot = state.model.arcana[n - 1];
  openInfo(infoCardHtml({ icon: null, title: none ? 'No Arcana yet' : 'Empty Arcana slot', sub: slotLabel(slot.slot), body: arcanaNote(slot) }), from);
}

const NOT_CONFIRMED = test => `<span class="ae-tag is-unconfirmed">Not confirmed yet</span>${test ? ` <span class="ae-tag-test">Check: ${esc(test)}</span>` : ''}`;

/**
 * What to do, first in the item card: the grade rule's move, why, grade and cap, now and target, the chance of each next
 * step, that a failure never drops a level or breaks the item, the cost and where Enhance Stones come from.
 */
function adviceHtml(slot, rules) {
  const advice = adviceOf(slot);
  if (!advice) return '';
  const grade = advice.grade;
  const rows = [];
  const cap = Number.isFinite(advice.cap) ? `${advice.about ? 'about ' : ''}+${advice.cap}` : 'not known yet';
  rows.push(`<li><span>Grade</span><b class="ae-grade-name"${grade.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(grade.name)}</b></li>`);
  rows.push(`<li><span>Enchant cap</span><b>${esc(cap)}</b></li>`);
  rows.push(`<li><span>Now</span><b>+${esc(advice.from)}</b></li>`);
  if (advice.action === 'enchant') rows.push(`<li><span>Target</span><b>+${esc(advice.to)}</b></li>`);
  const head = { enchant: `Enchant it to +${advice.to}`, replace: 'Replace it with a Unique piece', full: 'Fully enchanted', done: `+${advice.from} is enough here` }[advice.action] ?? 'No advice yet';
  const rates = rules['enchant-rates'];
  const pity = rules['enchant-pity'];
  const stones = rules['enhance-stones'];
  const ownScroll = /^(amulet|belt)$/i.test(String(slot.slot));
  let odds = '';
  if (advice.action === 'enchant') {
    const steps = enchantSteps(advice.from, advice.to, rates);
    const safe = steps.filter(step => step.rate === 100);
    const risky = steps.filter(step => step.rate !== 100);
    const lines = [];
    if (safe.length) lines.push(`<li>+${safe[0].to}${safe.length > 1 ? ` to +${safe.at(-1).to}` : ''}: every step succeeds</li>`);
    for (const step of risky) lines.push(`<li>+${step.to}: ${step.rate === null ? 'chance not known yet' : `${step.rate}% chance`}</li>`);
    odds = `<div class="ae-item-block ae-odds"><p class="ae-item-sec">Chance of each step${rates?.confirmed ? '' : ` ${NOT_CONFIRMED(rates?.test)}`}</p><ul class="ae-odds-list">${lines.join('')}</ul>
      ${rates?.value?.keepsLevel ? '<p class="ae-card-line">A failure costs the attempt, never a level, and never breaks the item.</p>' : ''}
      ${risky.length && pity ? `<p class="ae-card-line">Each failed try past +10 may add 5 points to the next try at that step. ${pity.confirmed ? '' : NOT_CONFIRMED(pity.test)}</p>` : ''}
    </div>`;
  }
  const cost = advice.action === 'enchant'
    ? `<div class="ae-item-block"><p class="ae-item-sec">Cost</p><p class="ae-card-line">${ownScroll ? 'It uses its own enhance scroll, not Enhance Stones. ' : ''}Check the cost in your Enchant window.${advice.costly ? ' Past +10 it is a big Kina and stone cost.' : ''}</p></div>`
    : '';
  const from = advice.action === 'enchant' && !ownScroll && Array.isArray(stones?.value?.from)
    ? `<div class="ae-item-block"><p class="ae-item-sec">Where ${esc(stones.value.name)}s come from ${stones.confirmed ? '' : NOT_CONFIRMED(stones.test)}</p><ul class="ae-odds-list">${stones.value.from.map(place => `<li>${esc(place)}</li>`).join('')}</ul></div>`
    : '';
  return `<section class="ae-advice is-${esc(advice.action ?? 'none')}" id="aeAdvice" aria-labelledby="aeAdviceTitle">
      <p class="ae-item-sec" id="aeAdviceTitle">What to do</p>
      <p class="ae-advice-head">${esc(head)}</p>
      <p class="ae-card-line ae-advice-why">${esc(advice.why)}</p>
      <ul class="ae-advice-facts">${rows.join('')}</ul>
      ${odds}${cost}${from}
    </section>`;
}

/** Bonus stat lines, each tagged High, Useful or Low for this Daeva's class (stats.json and the class's stat order). */
function subRows(list) {
  const rank = state.stats && state.build ? rankPointStats(state.build, state.stats) : null;
  return list.map(row => {
    const tag = subStatTag(row, rank, state.build, state.stats);
    return `<li${tag ? ` data-line-tag="${tag}"` : ''}><span>${esc(row.name)}${tag ? ` <i class="ae-stat-tag is-${tag}">${TAG_WORD[tag]}</i>` : ''}</span><b>${esc(row.value)}${row.extra ? ` <em>+${esc(row.extra)}</em>` : ''}</b></li>`;
  }).join('');
}

/** The item card body: everything the official site gives for one worn item, laid out like the game's tooltip. */
function itemCardBody(slot, d) {
  const rows = list => list.map(row => `<li><span>${esc(row.name)}</span><b>${esc(row.value)}${row.extra ? ` <em>+${esc(row.extra)}</em>` : ''}</b></li>`).join('');
  const max = isPending(d.maxEnchant) ? null : d.maxEnchant;
  const stones = isPending(d.manastoneSlots) ? 0 : d.manastoneSlots;
  const emptyPerks = Math.max(0, d.skillPerkSlots - d.skillPerks.length);
  return `
    ${max ? `<div class="ae-item-enchant" aria-label="Enchant +${esc(d.enchant)} of ${esc(max)}"><span class="ae-item-sec">Enchant</span><span class="ae-pips">${Array.from({ length: max }, (_, n) => `<i class="${n < d.enchant ? 'is-on' : ''}"></i>`).join('')}</span><b>+${esc(d.enchant)} / ${esc(max)}</b></div>` : ''}
    ${d.mainStats.length ? `<div class="ae-item-block"><p class="ae-item-sec">Stats</p><ul class="ae-item-rows">${rows(d.mainStats)}</ul></div>` : ''}
    ${d.subStats.length || d.bonusStatSlots ? `<div class="ae-item-block"><p class="ae-item-sec">Bonus stats${d.bonusStatsRandom ? ' <small>rolled</small>' : ''}</p>${d.subStats.length ? `<ul class="ae-item-rows is-bonus">${subRows(d.subStats)}</ul>` : '<p class="ae-empty">None rolled yet</p>'}</div>` : ''}
    ${d.skillPerkSlots || d.skillPerks.length ? `<div class="ae-item-block"><p class="ae-item-sec">Skill perks <small>${d.skillPerks.length} of ${d.skillPerkSlots}</small></p><ul class="ae-perk-list">
      ${d.skillPerks.map(perk => `<li class="ae-perk">${perk.icon ? `<img src="${esc(perk.icon)}" alt="" width="36" height="36" referrerpolicy="no-referrer">` : '<span class="ae-perk-empty"></span>'}<span>${esc(perk.name)}</span><b>+${esc(perk.level)}</b></li>`).join('')}
      ${Array.from({ length: emptyPerks }, () => '<li class="ae-perk is-empty"><span class="ae-perk-empty"></span><span>Empty perk slot</span></li>').join('')}
    </ul></div>` : ''}
    ${stones ? `<div class="ae-item-block"><p class="ae-item-sec">Manastone slots</p><span class="ae-sockets" aria-label="${stones} manastone slots">${Array.from({ length: stones }, () => '<i></i>').join('')}</span></div>` : ''}
    ${d.sources.length || d.appearance ? `<ul class="ae-card-chips">${d.sources.map(source => `<li>From: ${esc(source)}</li>`).join('')}${d.appearance ? `<li>Look: ${esc(d.appearance)}</li>` : ''}</ul>` : ''}
    ${d.description ? d.description.split('\n').map(line => `<p class="ae-card-line ae-item-desc">${esc(line)}</p>`).join('') : ''}`;
}

/** The card's status line, from the same rule as the marker. */
function statusOf(advice) {
  if (!advice) return null;
  if (advice.action === 'enchant') return ['go', `Enchant it: ${advice.to - advice.from} more ${advice.to - advice.from === 1 ? 'level' : 'levels'} to +${advice.to}`];
  if (advice.action === 'replace') return ['go', 'Replace it with a Unique piece'];
  if (advice.action === 'full') return ['keep', 'Fully enchanted'];
  if (advice.action === 'done') return ['keep', `+${advice.from} reached`];
  return null;
}
const chipsHtml = chips => (chips.filter(Boolean).length ? `<ul class="ae-card-chips">${chips.filter(Boolean).map(chip => `<li>${esc(chip)}</li>`).join('')}</ul>` : '');

let rulesPromise = null;
const loadRules = () => (rulesPromise ??= loadMechanics().then(mechanics => indexMechanics(mechanics, null)).catch(() => { rulesPromise = null; return {}; }));

async function selectSlot(index, from) {
  const slot = state.model.gear[index];
  state.selected = index;
  hideTip();
  const head = detail => ({
    icon: (detail ?? slot).icon, title: (detail ?? slot).name, grade: gradeOf(slot).id,
    sub: [slotLabel(slot.slot), detail?.category, gradeOf(slot).name].filter(Boolean).join(' · ')
  });
  const rules = await loadRules();
  openInfo(infoCardHtml({ ...head(null), status: statusOf(adviceOf(slot)), body: `${arcanaNote(slot)}${adviceHtml(slot, rules)}<p class="ae-card-line">Reading ${esc(slot.name)}.</p>` }), from);
  let result;
  try {
    result = await loadItemDetail(state.model, slot);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    result = { detail: null, reason: explain(error, 'The official AION 2 site is not answering right now. Try this item again in a minute.') };
  }
  if (state.selected !== index || $('#aeInfo')?.hidden) return;
  if (!result.detail) {
    openInfo(infoCardHtml({ ...head(null), status: statusOf(adviceOf(slot)), lines: [result.reason], body: `${arcanaNote(slot)}${adviceHtml(slot, rules)}${chipsHtml([`+${slot.enchant}`, exceedText(slot)])}` }), from);
    return;
  }
  const d = result.detail;
  applyDetail(slot, d);
  refreshTile(index);
  openInfo(infoCardHtml({
    ...head(d), status: statusOf(adviceOf(slot)),
    body: `${arcanaNote(slot)}${adviceHtml(slot, rules)}${chipsHtml([exceedText(slot), Number.isFinite(d.level) ? `Item level ${d.level}` : null, d.equipLevel ? `Wear from Lv ${d.equipLevel}` : null, d.soulBindRate ? `Soul bind ${d.soulBindRate}%` : null])}${itemCardBody(slot, d)}`
  }), document.querySelector(`#aeGearPanel [data-slot="${index}"]`) ?? from);
}

/* The hover name: the item name in its grade colour, the grade, the slot and +N of the cap. Mouse hover or keyboard focus
   only; a tap opens the card instead. */
function tipFor(el) {
  const extra = el.dataset.extraTip;
  if (extra) return { name: extra, grade: el.dataset.grade || null, line: el.dataset.extraLine ?? '' };
  const slot = state.model.gear[Number(el.dataset.gtip)];
  if (!slot || slot.empty) return null;
  const grade = gradeOf(slot);
  return { name: slot.name, grade: grade.id, line: [grade.name, slotLabel(slot.slot), capText(slot), exceedText(slot), Number.isFinite(slot.itemLevel) ? `Item level ${slot.itemLevel}` : null].filter(Boolean).join(' · ') };
}
function showTip(el) {
  const tip = tipFor(el);
  if (!tip) return;
  let box = $('#aeGearTip');
  if (!box) { box = document.createElement('div'); box.id = 'aeGearTip'; box.className = 'ae-gtip'; box.setAttribute('role', 'tooltip'); document.body.append(box); }
  box.innerHTML = `<strong class="ae-grade-name"${tip.grade ? ` data-grade="${esc(tip.grade)}"` : ''}>${esc(tip.name)}</strong>${tip.line ? `<span>${esc(tip.line)}</span>` : ''}`;
  box.hidden = false;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  box.style.left = `${Math.max(6, Math.min(innerWidth - b.width - 6, r.left + r.width / 2 - b.width / 2))}px`;
  box.style.top = `${r.top - b.height - 8 < 4 ? r.bottom + 8 : r.top - b.height - 8}px`;
  // A tile the background loader left for later reads its detail now, so its card opens at once.
  const index = Number(el.dataset.gtip);
  const slot = state.model.gear[index];
  if (slot && state.later.has(slot)) {
    state.later.delete(slot);
    loadItemDetail(state.model, slot).then(result => { applyDetail(slot, result.detail); refreshTile(index); }).catch(() => state.later.add(slot));
  }
}
function hideTip() { const box = $('#aeGearTip'); if (box) box.hidden = true; }
function wireTips(root) {
  root.addEventListener('pointerover', event => { const el = event.target.closest?.('[data-gtip],[data-extra-tip]'); if (el && event.pointerType === 'mouse') showTip(el); });
  root.addEventListener('pointerout', event => { if (event.target.closest?.('[data-gtip],[data-extra-tip]')) hideTip(); });
  root.addEventListener('focusin', event => { const el = event.target.closest?.('[data-gtip],[data-extra-tip]'); if (el?.matches(':focus-visible')) showTip(el); });
  root.addEventListener('focusout', hideTip);
  addEventListener('scroll', hideTip, { passive: true });
}

/* The 6 main and 10 deity stats with the official effect lines and the class tags (stats-panel.mjs). A 0 is shown as 0:
   low numbers are normal before Unique gear, and the line at the top says where points come from. */
function renderStats() {
  if (!state.stats) { $('#aeStatsPanel').hidden = true; $('#aeStatsNone').hidden = false; return; }
  const boards = indexProgression(state.progression)['daevanion-boards']?.value ?? [];
  renderStatsPanel({ model: state.model, stats: state.stats, build: state.build, boards });
}

/* Show me from a gear move (#enchant-1, #replace-epic, #empty): only the items that move names are ringed, the first is
   scrolled into view, and the line at the top says what the move says. The moves are the advisor's own (gearMoves).
   The older #enchant rings every item the rule says to enchant. */
function ringOf(hash) {
  const id = hash.replace(/^#/, '').split(':')[0];
  if (!id) return null;
  const moves = gearMoves(state.model, { level: state.model.profile.level, grades: state.grades, progression: state.progression });
  const move = moves.find(item => item.id === id);
  if (move) return { slots: move.slots, say: move.title };
  if (id === 'enchant') {
    const list = moves.filter(item => item.id.startsWith('enchant-'));
    return list.length ? { slots: list.flatMap(item => item.slots), say: list.map(item => item.title).join('. ') } : null;
  }
  return null;
}
function showRing() {
  const note = $('#aeGearRingNote');
  const ring = state.ring ? ringOf(location.hash) : null;
  note.hidden = !ring;
  if (!ring) return;
  note.textContent = ring.say;
  const nodes = [...document.querySelectorAll('#aeGearPanel li.is-ringed')];
  nodes[0]?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Pet, wings and title as three tiles the size of the gear tiles. Hover names them; a click opens a small card. */
function renderExtras() {
  const { model } = state;
  const wingsGrade = isPending(model.wings) ? null : gradeInfo(model.wings.grade, state.grades);
  const titleGrade = model.profile.titleGrade ? gradeInfo(model.profile.titleGrade, state.grades) : null;
  const tile = (kind, label, name, inner, grade, line) => `<li class="ae-gcell ae-xcell" data-extra="${kind}">
      <button type="button" class="ae-slot ae-gbtn" data-extra-tip="${esc(name)}" data-extra-line="${esc(line)}" data-grade="${esc(grade?.id ?? '')}" aria-haspopup="dialog">
        <span class="ae-gtile"${grade?.id ? ` data-grade="${esc(grade.id)}"` : ''}>${inner}</span><span class="ae-sr"><small>${esc(label)}</small>: <strong>${esc(name)}</strong>${line ? `, ${esc(line)}` : ''}</span>
      </button><span class="ae-extra-label" aria-hidden="true">${esc(label)}</span></li>`;
  const img = icon => (icon ? `<img src="${esc(icon)}" alt="" width="88" height="88" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="ae-icon-empty" aria-hidden="true"></span>');
  $('#aeExtras').innerHTML = [
    isPending(model.pet) ? tile('pet', 'Pet', 'None equipped', img(null), null, '') : tile('pet', 'Pet', model.pet.name, img(model.pet.icon), null, `Lv ${model.pet.level}`),
    isPending(model.wings) ? tile('wings', 'Wings', 'None equipped', img(null), null, '') : tile('wings', 'Wings', model.wings.name, img(model.wings.icon), wingsGrade, `${wingsGrade.name} · +${model.wings.enchant}`),
    tile('title', 'Title', model.profile.title || 'No title', LAUREL, titleGrade, titleGrade ? titleGrade.name : '')
  ].join('');
  renderAppearance();
  // Nothing to show (no pet, no wings, no title): the side column would stay empty, so the page collapses it.
  const bare = isPending(model.pet) && isPending(model.wings) && !model.profile.title;
  document.querySelector('.ae-gear-page').classList.toggle('is-single', bare);
  $('#aeExtrasCol').hidden = bare;
}

/* Appearance: gear skins and the wing skin from the data, as small tiles (name on hover, card on tap). Only when there are any. */
function renderAppearance() {
  const { skins, wingSkin } = state.model.appearance ?? { skins: [], wingSkin: null };
  const items = [...skins.map(skin => ({ ...skin, kind: slotLabel(skin.slot ?? '') || 'Skin' })), ...(wingSkin ? [{ ...wingSkin, kind: 'Wings' }] : [])];
  $('#aeAppearance').hidden = !items.length;
  state.looks = items;
  $('#aeLooks').innerHTML = items.map((item, n) => {
    const grade = item.grade ? gradeInfo(item.grade, state.grades) : null;
    return `<li class="ae-gcell ae-xcell" data-look="${n}">
        <button type="button" class="ae-slot ae-gbtn" data-look-open="${n}" data-extra-tip="${esc(item.name)}" data-extra-line="${esc(item.kind)}" data-grade="${esc(grade?.id ?? '')}" aria-haspopup="dialog" aria-label="${esc(`${item.kind}: ${item.name}`)}">
          ${gradeTile({ icon: item.icon, grade: grade?.id ?? null, size: 88 })}</button><span class="ae-extra-label" aria-hidden="true">${esc(item.kind)}</span></li>`;
  }).join('');
}
function openLook(n, from) {
  const item = state.looks?.[n];
  if (!item) return;
  hideTip();
  const grade = item.grade ? gradeInfo(item.grade, state.grades) : null;
  openInfo(infoCardHtml({ icon: item.icon, title: item.name, grade: grade?.id ?? null, sub: ['Appearance', item.kind, grade?.name].filter(Boolean).join(' · '), lines: ['A look only: it changes how the item appears, not its stats.'] }), from);
}

/** The small card for the pet, the wings or the title: only what the data has. */
function openExtra(kind, from) {
  const { model } = state;
  hideTip();
  if (kind === 'pet') {
    openInfo(infoCardHtml(isPending(model.pet) ? { icon: null, title: 'No pet', sub: 'Pet', lines: ['No pet is equipped.'] } : { icon: model.pet.icon, title: model.pet.name, sub: 'Pet', lines: [`Pet level ${model.pet.level}.`] }), from);
  } else if (kind === 'wings') {
    if (isPending(model.wings)) { openInfo(infoCardHtml({ icon: null, title: 'No wings', sub: 'Wings', lines: ['No wings are equipped.'] }), from); return; }
    const grade = gradeInfo(model.wings.grade, state.grades);
    openInfo(infoCardHtml({ icon: model.wings.icon, title: model.wings.name, grade: grade.id, sub: `Wings · ${grade.name}`, chips: [`+${model.wings.enchant}`], lines: ['The official data does not say how far wings enchant, so the page gives no enchant advice for them.'] }), from);
  } else {
    const effects = model.profile.titleEffects ?? [];
    const grade = model.profile.titleGrade ? gradeInfo(model.profile.titleGrade, state.grades) : null;
    openInfo(infoCardHtml({ icon: null, title: model.profile.title || 'No title', grade: grade?.id ?? null, sub: ['Title', grade?.name].filter(Boolean).join(' · '),
      lines: model.profile.title ? (effects.length ? effects : ['The official data sends no effect for this title.']) : ['No title is worn.'] }), from);
    const icon = $('#aeInfo .ae-card-icon');
    if (icon) icon.innerHTML = LAUREL;
  }
}

function render(model, source, ref) {
  Object.assign(state, { model, source, ref, selected: null, later: new Set() });
  const ring = ringOf(location.hash);
  state.ring = ring ? new Set(ring.slots) : null;
  // Came from Show me on a gear move: the back link returns to where it was pressed (the Ascent Plan's moves, or the
  // Daeva Card for #...:card), never round to this page again.
  const fromCard = location.hash.endsWith(':card');
  const back = !ring ? null : fromCard ? { href: cardUrl(ref), label: 'Daeva Card' } : { href: `${ascentUrl(ref, model.profile.class)}#aeNow`, label: 'Plan' };
  $('#aeStage').innerHTML = `<div class="ae-gw ae-gear-window">
    ${windowBar({ title: 'Gear', model, ref, back })}
    <div class="ae-gw-body">
      <div class="ae-ledger ae-gear-page" id="aeGearPanel">
        <div class="ae-col">
          <section class="ae-panel" aria-labelledby="aeGearTitle">
            <h2 class="ae-section-title" id="aeGearTitle">Equipped gear <small id="aeGearCount"></small></h2>
            <p class="ae-ring-note" id="aeGearRingNote" role="status" hidden></p>
            <p class="ae-gear-legend" id="aeGearLegend"><span class="ae-legend-swatch" aria-hidden="true"></span>Gold pulse: enchant it. Tap any item for what to do.</p>
            <ul class="ae-ggrid" id="aeGear" aria-label="Equipped gear, in the game's order"></ul>
            <p class="ae-accessories" id="aeAccessories"></p>
            <div class="ae-arcana-block" id="aeArcanaBlock">
              <h3 class="ae-section-title" id="aeArcanaTitle">Arcana <small id="aeArcanaCount"></small></h3>
              <ul class="ae-ggrid is-arcana" id="aeArcana" aria-labelledby="aeArcanaTitle"></ul>
              <p class="ae-note" id="aeArcanaNone" hidden>No Arcana yet. Arcana are the main source of deity stats.</p>
            </div>
          </section>
          <section class="ae-panel" id="aeAppearance" aria-labelledby="aeAppearanceTitle" hidden>
            <h2 class="ae-section-title" id="aeAppearanceTitle">Appearance</h2>
            <ul class="ae-ggrid is-row" id="aeLooks" aria-labelledby="aeAppearanceTitle"></ul>
          </section>
          <section class="ae-panel is-grow" aria-labelledby="aeStatTitle">
            <h2 class="ae-section-title" id="aeStatTitle">Stats <small>from the official AION 2 site</small></h2>
            <p class="ae-stats-low" id="aeStatsLow" hidden>These come from sub stat lines on Unique and crafted gear, and from Arcana for the deity stats. Low numbers are normal until then.</p>
            <p class="ae-stats-low" id="aeStatsOrder" hidden>No stat order for this class yet, so the tiles show what each stat does without a tag.</p>
            <div id="aeStatsPanel">
              <h3 class="ae-stats-group">Main stats</h3>
              <dl class="ae-stats" id="aeStats"></dl>
              <h3 class="ae-stats-group">Deity stats</h3>
              <dl class="ae-stats is-deity" id="aeDeity"></dl>
            </div>
            <p class="ae-empty ae-stats-none" id="aeStatsNone" hidden>Not shown by the official AION 2 site</p>
            <p class="ae-note" id="aeCombatNote">Attack, Defense, Accuracy and other combat stats are not in the public character data. Check them on your in-game character screen.</p>
          </section>
        </div>
        <div class="ae-col" id="aeExtrasCol">
          <section class="ae-panel is-grow" aria-labelledby="aeExtraTitle">
            <h2 class="ae-section-title" id="aeExtraTitle">Pet, wings and title</h2>
            <ul class="ae-ggrid is-row" id="aeExtras"></ul>
          </section>
        </div>
      </div>
    </div>
  </div>`;
  renderGear();
  renderStats();
  renderExtras();
  showRing();
  const panel = $('#aeGearPanel');
  wireTips(panel);
  panel.addEventListener('click', event => {
    const look = event.target.closest('[data-look-open]');
    if (look) { openLook(Number(look.dataset.lookOpen), look); return; }
    const emptyArcana = event.target.closest('[data-arcana-empty]');
    if (emptyArcana) { openArcanaEmpty(Number(emptyArcana.dataset.arcanaEmpty), emptyArcana); return; }
    const extra = event.target.closest('[data-extra] button');
    if (extra) { openExtra(extra.closest('[data-extra]').dataset.extra, extra); return; }
    const button = event.target.closest('[data-slot]');
    if (button) selectSlot(Number(button.dataset.slot), button).catch(error => console.error(error));
  });
  // Item details load after first paint, in the background, in the grid's order: tiles fill in as each one lands.
  const order = [...GRID, ...ARCANA];
  const worn = model.gear.map((slot, index) => ({ slot, index })).filter(({ slot }) => !slot.empty)
    .sort((a, b) => (order.indexOf(keyOf(a.slot.slot)) + 1 || 99) - (order.indexOf(keyOf(b.slot.slot)) + 1 || 99));
  const indexOf = new Map(worn.map(({ slot, index }) => [slot, index]));
  setTimeout(() => {
    preloadItemDetails(model, worn.map(({ slot }) => slot), {
      onDetail: (slot, result) => { if (state.model !== model) return; applyDetail(slot, result.detail); refreshTile(indexOf.get(slot)); }
    }).then(later => { later.forEach(slot => state.later.add(slot)); })
      .catch(() => {})
      .finally(() => { if (state.model === model) document.documentElement.dataset.aeGearDetails = 'done'; });
  }, 0);
}

startCharacterPage({
  // The grade record and the game facts are small static files: they load while the official site answers.
  prefetch: className => { loadGrades().catch(() => {}); loadProgression().catch(() => {}); loadStats().catch(() => {}); if (className) loadBuilds(className).catch(() => {}); },
  async render({ model, source, ref }) {
    const [catalogue, grades, progression, stats, builds] = await Promise.all([loadCatalogue(), loadGrades().catch(() => null), loadProgression().catch(() => null), loadStats().catch(() => null), loadBuilds(model.profile.class).catch(() => null)]);
    state.stats = stats;
    // Tags follow the role the player picked for this Daeva (a Block roll is Useful for a tank), else the main role.
    state.build = builds ? buildFor(builds, rolePick(ref)) : null;
    state.slotNames = new Map(catalogue.slots.map(slot => [keyOf(slot.slotPosName), slot.slotPosName]));
    state.grades = grades ? indexGrades(grades) : null;
    state.progression = progression;
    render(model, source, ref);
  },
  next: ({ model, ref }) => ({ label: 'Next: Your next moves', href: `${ascentUrl(ref, model.profile.class)}#aeNow`, note: 'Step 3 of 3: the gear moves are on the Ascent Plan' })
}).catch(error => failPage('Gear page', error));
