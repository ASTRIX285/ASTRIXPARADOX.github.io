/**
 * Gear page (The Aetherium, hub/aetherium/gear/equipment/): what one Daeva wears, laid out like the game's equipment
 * window. An icon grid of 20 slots in two rows of 10 (weapons and armour, then accessories and runes), each item on its
 * grade tile with the enchant level and the item level on its corners. Hover or focus shows the name; a click or tap opens
 * the item card with what to do first. An item the grade rule says to enchant has a pulsing gold edge, one to replace a
 * quieter edge and a chevron, a fully enchanted one a check. Pet, wings, title and Arcana sit beside the grid as small tiles.
 * Item details load in the background after first paint (at most 3 at a time, kept for the session).
 * Skills and Daevanion boards have their own pages (see the character menu).
 */
import { ArmoryUnavailable, ascentUrl, cardUrl, explain, loadBuilds, loadCatalogue, loadEnhancement, loadGrades, loadItemDetail, loadMechanics, loadProgression, loadStats, preloadItemDetails, rolePick } from './aetherium-data.mjs';
import { $, esc, gradeTile, infoCardHtml, isPending, openInfo, slotLabel } from './aetherium-ui.mjs';
import { renderStatsPanel } from './stats-panel.mjs';
import { failPage, startCharacterPage, windowBar } from './character-page.mjs';
import { buildFor, enchantAdvice, enchantSteps, gearMoves, gradeInfo, indexGrades, indexMechanics, indexProgression } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { enhancementPlan, indexEnhancement, roleWords } from '/astrix-app/games/aion2/engine/enhancement-advisor.mjs';
import { rankPointStats, subStatTag } from '/astrix-app/games/aion2/engine/stat-advisor.mjs';

/* The game's equipment window: row 1 weapons and armour, row 2 accessories and the two runes. Arcana have their own row. */
const GRID = ['MAINHAND', 'SUBHAND', 'HELMET', 'SHOULDER', 'TORSO', 'PANTS', 'GLOVES', 'BOOTS', 'CAPE', 'BELT',
  'NECKLACE', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'AMULET', 'RUNE1', 'RUNE2'];
const ARCANA = ['ARCANA1', 'ARCANA2', 'ARCANA3', 'ARCANA4', 'ARCANA5'];
const keyOf = name => String(name ?? '').toUpperCase().replace(/[\s_]/g, '');
const TAG_WORD = { high: 'High', useful: 'Useful', low: 'Low' };
const state = { looks: [], model: null, source: null, ref: null, selected: null, slotNames: new Map(), grades: null, progression: null, ring: null, later: new Set(), stats: null, build: null, enhancement: null, mechanics: null, plan: null };

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
  const next = enhanceMark(slot, index);
  return `<button type="button" class="ae-slot ae-gbtn" data-slot="${index}" data-grade="${esc(grade.id ?? '')}" aria-haspopup="dialog" aria-label="${esc(tileName(slot))}"${next ? ` aria-describedby="aeEmark${index}"` : ''} data-gtip="${index}">
      ${gradeTile({ icon: slot.icon, grade: grade.id, enchant: slot.enchant, size: 88, extra: `${level}${exceed}${sign}` })}${tileWords(slot)}
    </button>${next}`;
}
const cellOf = (key, worn) => {
  if (!worn) return `<li class="ae-gcell is-empty" data-slot-key="${esc(key)}"><span class="ae-gempty" role="img" aria-label="${esc(slotLabel(state.slotNames.get(key) ?? key))}: empty"></span></li>`;
  const { slot, index } = worn;
  const mark = markOf(slot);
  const enhance = planOf(slot)?.mark;
  return `<li class="ae-gcell" data-gear-index="${index}" data-slot-pos="${esc(slot.slotPos)}" data-slot-key="${esc(key)}"${mark ? ` data-advice="${mark}"` : ''}${enhance ? ` data-enhance="${enhance}"` : ''}>${tileHtml(slot, index)}</li>`;
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
  const enhance = planOf(slot)?.mark;
  if (enhance) li.dataset.enhance = enhance; else delete li.dataset.enhance;
}

/** After an item detail lands the plan can change: every tile's mark and the Do this next line follow. */
function refreshEnhance() {
  state.plan = null;
  for (const li of document.querySelectorAll('#aeGear li[data-gear-index]')) {
    const index = Number(li.dataset.gearIndex);
    const slot = state.model.gear[index];
    const before = li.dataset.enhance ?? '';
    const after = planOf(slot)?.mark ?? '';
    if (before !== after || li.querySelector('.ae-emark')?.dataset.title !== (planOf(slot)?.next?.title ?? '')) refreshTile(index);
  }
  renderEnhanceStrip();
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
  // The Enhancement window's facts for this item (manastones, Theostone slots, Soul Binding rate and lines).
  if (detail.enhance) Object.assign(slot, detail.enhance);
  state.plan = null;
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
      ${risky.length && pity ? `<p class="ae-card-line">${pity.confirmed ? 'Each failed try past +10 adds 5 points to the next try at that step.' : `Each failed try past +10 may add 5 points to the next try at that step. ${NOT_CONFIRMED(pity.test)}`}</p>` : ''}
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

/* Enhancement (docs/ENHANCEMENT.md): the game's Enhancement window, item by item. The plan comes from the engine
   (enhancement-advisor.mjs) with the role the player picked; each tile gets a small mark for its next tab, the item card an
   Enhance panel drawn like the window's five tabs, and the page a How enhancing works strip with one Do this next line.
   Facts carry their status: Confirmed, Reported (guides agree) or Not confirmed yet. No cost numbers: check them in game. */

/* Our own icons for the five tabs, 16 by 16, stroke only. */
const ENHANCE_ICONS = {
  growth: '<path d="M8 13.5V3M3.5 7.5 8 3l4.5 4.5M3.5 13.5h9"/>',
  manastone: '<path d="M8 1.75 13.25 7 8 14.25 2.75 7Z"/><path d="M2.75 7h10.5M8 1.75 6 7l2 7.25L10 7Z"/>',
  theostone: '<path d="M9.25 1.5 3.5 9h4l-1 5.5L12.5 7h-4Z"/>',
  'soul-binding': '<circle cx="6" cy="8" r="3.5"/><circle cx="10" cy="8" r="3.5"/>',
  transfer: '<path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13"/>',
  done: '<path d="M3 8.5l3.2 3.2L13 4.8"/>'
};
const enhanceIcon = id => `<svg class="ae-eicon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ENHANCE_ICONS[id] ?? ''}</svg>`;
const STATUS_TAG = {
  confirmed: '<span class="ae-tag is-confirmed">Confirmed</span>',
  reported: '<span class="ae-tag is-reported">Reported</span>',
  unknown: '<span class="ae-tag is-unconfirmed">Not confirmed yet</span>'
};
const statusTag = status => STATUS_TAG[status] ?? STATUS_TAG.unknown;
const enhanceRecords = () => (state.enhancement ? indexEnhancement(state.enhancement) : null);

/** The plan for this Daeva, worked out once and again whenever an item detail lands. null until the record has loaded. */
function enhancePlan() {
  if (!state.enhancement || !state.grades || !state.model) return null;
  state.plan ??= enhancementPlan(state.model, state.build?.role ?? null, state.model.profile.level, { grades: state.grades, progression: state.progression, mechanics: state.mechanics, enhancement: state.enhancement });
  return state.plan;
}
function planOf(slot) { return enhancePlan()?.items.find(item => item.slotPos === slot?.slotPos) ?? null; }

/** The small mark under a tile: the next tab's icon and one word (Growth, Stones, Bind, Theostone, Done). */
function enhanceMark(slot, index) {
  const item = planOf(slot);
  if (!item?.mark) return '';
  const said = item.next ? `Enhance next, ${item.label}: ${item.next.title}.` : 'Enhance: nothing left to do on this item.';
  return `<span class="ae-emark" id="aeEmark${index}" data-mark="${esc(item.mark)}" data-title="${esc(item.next?.title ?? '')}" aria-hidden="true">${enhanceIcon(item.mark)}<span class="ae-emark-word">${esc(item.label)}</span><span class="ae-sr">${esc(said)}</span></span>`;
}

/** One fact line with its status tag. */
const factLine = fact => `<li><span>${esc(fact.text)}</span> ${statusTag(fact.status)}</li>`;
const factsHtml = facts => (facts?.length ? `<ul class="ae-efacts">${facts.map(factLine).join('')}</ul>` : '');

/** A bar for a value within its range: a meter when the range is known, a dashed empty track when it is not. */
function barHtml(percent, label) {
  if (!Number.isFinite(percent)) return `<span class="ae-ebar is-unknown" aria-hidden="true"></span>`;
  const value = Math.max(0, Math.min(100, percent));
  return `<span class="ae-ebar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${esc(label)}"><i style="width:${value}%"></i></span>`;
}

/** The Growth tab for one item: +N of the cap, the next step's chance and the most tries, where to check the cost. */
function growthPanel(slot, item) {
  const advice = item.advice;
  const cap = Number.isFinite(advice?.cap) ? advice.cap : null;
  const step = item.steps.find(entry => entry.tab === 'growth') ?? null;
  const rows = [`<li><span>Enhance</span><b>+${esc(advice?.from ?? slot.enchant)}${cap !== null ? ` of ${advice.about ? 'about ' : ''}${esc(cap)}` : ''}</b></li>`];
  if (step?.kind === 'growth') rows.push(`<li><span>Next steps</span><b>+${esc(step.from + 1)} to +${esc(step.to)}: always succeeds</b></li>`);
  if (step?.kind === 'growth-risky') {
    rows.push(`<li><span>Next step</span><b>+${esc(step.to)}: ${Number.isFinite(step.rate) ? `${esc(step.rate)}% now` : 'chance not confirmed yet'}</b></li>`);
    if (step.tries) rows.push(`<li><span>Most tries</span><b>${esc(step.tries)}, with the failure bonus</b></li>`);
  }
  const say = step ? '' : advice?.action === 'replace' ? '<p class="ae-card-line">No more Growth: replace this piece.</p>'
    : advice?.action === 'full' ? '<p class="ae-card-line">At its cap.</p>' : advice?.action === 'done' ? `<p class="ae-card-line">${esc(advice.why)}</p>` : '';
  return `<ul class="ae-advice-facts ae-erows">${rows.join('')}</ul>${say}<p class="ae-card-line">Check the cost in the Growth tab.</p>`;
}

/** The Manastone tab: each slot filled or empty, with the role's best stone for an empty one. */
function stonesPanel(slot, item) {
  if (isPending(slot.manastoneSlots) || isPending(slot.manastones)) return '<p class="ae-card-line">Reading this item\'s manastone slots.</p>';
  if (!Number.isInteger(slot.manastoneSlots) || !slot.manastoneSlots) return '<p class="ae-card-line">No manastone slots on this item.</p>';
  const accessory = /^(necklace|earring\d|ring\d|bracelet\d|amulet)$/i.test(String(slot.slot).replace(/[\s_]/g, ''));
  const record = enhanceRecords()?.manastone;
  const who = roleWords(state.build?.role ?? null);
  const rows = item.sockets.map(socket => {
    if (socket.filled) {
      const fits = socket.fits === false ? ` <i class="ae-stat-tag is-low">Not for ${esc(who.replace(/^a /, ''))}</i>` : socket.fits ? ' <i class="ae-stat-tag is-useful">Fits</i>' : '';
      return `<li class="ae-estone is-filled"><span>Slot ${socket.n + 1}</span><b>${esc(socket.stone.name)} ${esc(socket.stone.value)}${fits}</b></li>`;
    }
    const best = !accessory && socket.best ? `Best for ${esc(who)}: ${esc(socket.best.name)}${socket.best.top ? ` (top ${esc(socket.best.top)})` : ''}` : 'Empty';
    return `<li class="ae-estone is-empty"><span>Slot ${socket.n + 1}</span><b>${best}</b></li>`;
  }).join('');
  const status = accessory ? statusTag(record?.accessories?.status ?? 'unknown') : isPending(item.stones) ? statusTag('unknown') : statusTag(item.stones.status);
  const note = accessory ? esc(record?.accessories?.text ?? '') : isPending(item.stones) ? esc(item.stones.reason) : esc(item.stones.note ?? '');
  return `<ul class="ae-advice-facts ae-erows">${rows}</ul><p class="ae-card-line">${note} ${status}</p>`;
}

/** The Theostone tab: the slot count from the data, what the role wants, and that the data never says what is engraved. */
function theostonePanel(slot) {
  if (isPending(slot.theostoneSlots)) return `<p class="ae-card-line">${esc(slot.theostoneSlots.reason)}</p>`;
  if (!slot.theostoneSlots) return '<p class="ae-card-line">No Theostone slot on this item.</p>';
  const weapon = /^main\s*hand$/i.test(String(slot.slot));
  const advice = enhanceRecords()?.theostone?.roles?.[state.build?.role ?? ''];
  const role = advice && !isPending(advice) ? `<p class="ae-card-line">${esc(advice.text)} ${statusTag(advice.status)}</p>` : `<p class="ae-card-line">Which Theostone suits ${esc(roleWords(state.build?.role ?? null))}: ${statusTag('unknown')}</p>`;
  return `<ul class="ae-advice-facts ae-erows"><li><span>Theostone slots</span><b>${esc(slot.theostoneSlots)}</b></li><li><span>Engraved</span><b>${statusTag('unknown')}</b></li></ul>
    <p class="ae-card-line">The official data does not say which Theostone is engraved. Check the Theostone tab in game.</p>
    ${weapon ? `${role}<p class="ae-card-line">Do it last, on the weapon you will keep. ${statusTag('reported')}</p>` : `<p class="ae-card-line">Guides speak of the weapon only. ${statusTag('reported')}</p>`}`;
}

/** The Soul Binding tab: the rate as a bar, each line as a bar within its range, weak lines for the role marked. */
function bindPanel(slot, item) {
  if (isPending(slot.soulBindRate)) return `<p class="ae-card-line">${esc(slot.soulBindRate.reason)}</p>`;
  const rate = slot.soulBindRate;
  const who = roleWords(state.build?.role ?? null);
  const lines = item.lines.map(line => {
    const range = line.maxed ? `${esc(line.text)}, maxed` : Number.isFinite(line.max) ? `${esc(line.text)} of ${esc(line.max)}` : `${esc(line.text)}, range not in the data`;
    return `<li class="ae-eline${line.weak ? ' is-weak' : ''}"><span class="ae-eline-name">${esc(line.name)}${line.weak ? ` <i class="ae-stat-tag is-low">Weak for ${esc(who.replace(/^a /, ''))}</i>` : ''}</span><span class="ae-eline-value">${range}</span>${barHtml(line.percent, `${line.name} within its range`)}</li>`;
  }).join('');
  const skills = Array.isArray(slot.skillLines) && slot.skillLines.length ? `<ul class="ae-efacts">${slot.skillLines.map(perk => `<li><span>${esc(perk.name)}</span> <b>+${esc(perk.level ?? '')}</b></li>`).join('')}</ul>` : '';
  const linesNote = isPending(item.linesFor) ? `<p class="ae-card-line">${esc(item.linesFor.reason)} ${statusTag('unknown')}</p>` : `<p class="ae-card-line">Lines for ${esc(who)}: ${esc(item.linesFor.lines.map(entry => entry.name).join(', '))}. ${statusTag(item.linesFor.status)}</p>`;
  return `<div class="ae-eline is-rate"><span class="ae-eline-name">Soul Binding rate</span><span class="ae-eline-value">${esc(rate)}%</span>${barHtml(rate, 'Soul Binding rate')}</div>
    ${lines ? `<ul class="ae-elines">${lines}</ul>` : '<p class="ae-card-line">No Soul Binding lines on this item.</p>'}
    ${skills}${linesNote}
    <p class="ae-card-line">${rate >= 100 ? 'At 100% the lines are maxed.' : 'Fix weak lines first, then Bind. Check the cost in the Soul Binding tab.'}</p>`;
}

/** The Transfer tab: what moves and what is lost, with the status of each. */
function transferPanel() {
  return factsHtml(enhanceRecords()?.transfer?.facts?.filter(fact => fact.status !== 'unknown')) || '<p class="ae-card-line">Not confirmed yet.</p>';
}

/** The Enhance panel in the item card: the Next line, then the window's five tabs with the next one lit. */
function enhanceHtml(slot) {
  const item = planOf(slot);
  const plan = enhancePlan();
  if (!item || !plan) return '';
  const lit = item.next?.tab ?? 'growth';
  const next = item.next
    ? `<b>Next:</b> ${esc(item.next.title)}. ${esc(item.next.why)}`
    : item.mark === 'done' ? '<b>Next:</b> nothing. Every tab is done for this item.'
      : item.advice?.action === 'replace' ? '<b>Next:</b> nothing to enhance. Replace it with a Unique piece.'
        : item.partial ? '<b>Next:</b> reading this item\'s details.' : '<b>Next:</b> no enhance advice for this item yet.';
  const panels = { growth: growthPanel(slot, item), manastone: stonesPanel(slot, item), theostone: theostonePanel(slot), 'soul-binding': bindPanel(slot, item), transfer: transferPanel() };
  const tabs = plan.tabs.map(tab => `<button type="button" role="tab" class="ae-planner-tab ae-etab${tab.id === item.next?.tab ? ' is-next' : ''}" id="aeEtab-${esc(tab.id)}" data-etab="${esc(tab.id)}" aria-controls="aeEpanel-${esc(tab.id)}" aria-selected="${tab.id === lit}" tabindex="${tab.id === lit ? 0 : -1}">${enhanceIcon(tab.id)}<span>${esc(tab.name)}</span></button>`).join('');
  const bodies = plan.tabs.map(tab => `<div class="ae-epanel" role="tabpanel" id="aeEpanel-${esc(tab.id)}" aria-labelledby="aeEtab-${esc(tab.id)}" tabindex="0"${tab.id === lit ? '' : ' hidden'}><p class="ae-epanel-purpose">${esc(tab.purpose)}</p>${panels[tab.id] ?? ''}</div>`).join('');
  return `<section class="ae-enhance" id="aeEnhancePanel" aria-labelledby="aeEnhanceHead">
      <p class="ae-item-sec" id="aeEnhanceHead">Enhance</p>
      <p class="ae-enext-line">${next}</p>
      <div class="ae-etabs" role="tablist" aria-label="Enhancement window">${tabs}</div>
      ${bodies}
    </section>`;
}

/** Tab switching in the Enhance panel: click, or the arrow keys, Home and End. */
function selectEnhanceTab(id, focus = false) {
  const card = $('#aeEnhancePanel');
  if (!card) return;
  for (const tab of card.querySelectorAll('[data-etab]')) {
    const on = tab.dataset.etab === id;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of card.querySelectorAll('.ae-epanel')) panel.hidden = panel.id !== `aeEpanel-${id}`;
}
document.addEventListener('click', event => {
  const tab = event.target.closest?.('#aeEnhancePanel [data-etab]');
  if (tab) selectEnhanceTab(tab.dataset.etab);
});
document.addEventListener('keydown', event => {
  const tab = event.target.closest?.('#aeEnhancePanel [data-etab]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('#aeEnhancePanel [data-etab]')];
  const at = tabs.indexOf(tab);
  const to = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  selectEnhanceTab(tabs[to].dataset.etab, true);
});

/** How enhancing works: one Do this next line for the whole Daeva, then one line per tab that opens the full explanation. */
function renderEnhanceStrip() {
  const box = $('#aeEnhance');
  const plan = enhancePlan();
  if (!box) return;
  box.hidden = !plan;
  if (!plan) return;
  const next = plan.next;
  const index = next ? state.model.gear.findIndex(slot => slot.slotPos === next.slotPos) : -1;
  $('#aeEnhanceNext').innerHTML = next
    ? `<b>Do this next:</b> <button type="button" class="ae-linkish" data-enext="${index}">${esc(next.name)}</button> <span>${esc(next.title)}. ${esc(next.why.split('. ')[0].replace(/\.$/, ''))}.</span>`
    : '<b>Do this next:</b> nothing to enhance right now.';
  if (!$('#aeEnhanceHow').childElementCount) {
    $('#aeEnhanceHow').innerHTML = [...plan.tabs.map(tab => `<li><button type="button" class="ae-linkish ae-ehow-row" data-ehow="${esc(tab.id)}" aria-haspopup="dialog">${enhanceIcon(tab.id)}<b>${esc(tab.name)}</b><span>${esc(tab.purpose)}</span></button></li>`),
      '<li><button type="button" class="ae-linkish ae-ehow-row is-order" data-ehow="order" aria-haspopup="dialog"><b>The order</b><span>What to do first, from levelling to the gear you keep.</span></button></li>'].join('');
  }
}

/** The full explanation of one tab (or the order), every fact with its status. Names only for where things come from. */
function openHow(id, from) {
  hideTip();
  const records = enhanceRecords();
  const plan = enhancePlan();
  if (!records || !plan) return;
  const tab = plan.tabs.find(entry => entry.id === id);
  const list = items => `<ul class="ae-odds-list">${items.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`;
  let body = '';
  if (id === 'order') {
    body = `<ol class="ae-efacts is-order">${records.order.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><p class="ae-card-line">${statusTag(records.order.status)}</p>`;
  } else if (id === 'growth') {
    const rates = indexMechanics(state.mechanics, null)['enchant-rates']?.value?.rates ?? {};
    const tries = Object.entries(plan.tries).map(([to, most]) => `+${to}: ${rates[to]}% to start, at most ${most} tries`);
    const sources = records['enhance-stone-sources'];
    body = `${factsHtml(records.growth.facts)}
      <div class="ae-item-block"><p class="ae-item-sec">Most tries per step past +10</p>${list(tries)}<p class="ae-card-line">Worked out from the chance of each step and the failure bonus. ${statusTag('confirmed')}</p></div>
      <div class="ae-item-block"><p class="ae-item-sec">Where Enhance Stones come from ${statusTag(sources.status)}</p>${list(sources.sources.map(source => source.name))}</div>`;
  } else if (id === 'manastone') {
    const stones = records.manastone.roles?.[state.build?.role ?? ''];
    const role = stones && !isPending(stones)
      ? `<div class="ae-item-block"><p class="ae-item-sec">Stones for ${esc(roleWords(state.build.role))} ${statusTag(stones.status)}</p>${list(stones.stones.map(stone => `${stone.name}, top ${stone.top}`))}${stones.note ? `<p class="ae-card-line">${esc(stones.note)}</p>` : ''}</div>`
      : `<p class="ae-card-line">Which stones suit ${esc(roleWords(state.build?.role ?? null))}: ${statusTag('unknown')}</p>`;
    body = `${factsHtml(records.manastone.facts)}${role}<p class="ae-card-line">${esc(records.manastone.accessories.text)} ${statusTag(records.manastone.accessories.status)}</p>`;
  } else if (id === 'theostone') {
    body = factsHtml(records.theostone.facts);
  } else if (id === 'soul-binding') {
    const codex = records['soul-binding'].codexSources;
    body = `${factsHtml(records['soul-binding'].facts)}<div class="ae-item-block"><p class="ae-item-sec">Where Soul Codices come from ${statusTag(codex.status)}</p>${list(codex.list)}</div>`;
  } else if (id === 'transfer') {
    body = factsHtml(records.transfer.facts);
  }
  openInfo(infoCardHtml({ icon: null, iconHtml: tab ? enhanceIcon(tab.id) : enhanceIcon('growth'), title: tab?.name ?? 'The order', sub: 'Enhancement window', lines: tab ? [tab.purpose] : [], body }), from);
}

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
    openInfo(infoCardHtml({ ...head(null), status: statusOf(adviceOf(slot)), lines: [result.reason], body: `${arcanaNote(slot)}${adviceHtml(slot, rules)}${enhanceHtml(slot)}${chipsHtml([`+${slot.enchant}`, exceedText(slot)])}` }), from);
    return;
  }
  const d = result.detail;
  applyDetail(slot, d);
  refreshTile(index);
  refreshEnhance();
  openInfo(infoCardHtml({
    ...head(d), status: statusOf(adviceOf(slot)),
    body: `${arcanaNote(slot)}${adviceHtml(slot, rules)}${enhanceHtml(slot)}${chipsHtml([exceedText(slot), Number.isFinite(d.level) ? `Item level ${d.level}` : null, d.equipLevel ? `Wear from Lv ${d.equipLevel}` : null, d.soulBindRate ? `Soul bind ${d.soulBindRate}%` : null])}${itemCardBody(slot, d)}`
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
    loadItemDetail(state.model, slot).then(result => { applyDetail(slot, result.detail); refreshTile(index); refreshEnhance(); }).catch(() => state.later.add(slot));
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
  Object.assign(state, { model, source, ref, selected: null, later: new Set(), plan: null });
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
            <section class="ae-ehow" id="aeEnhance" aria-labelledby="aeEnhanceTitle" hidden>
              <h3 class="ae-section-title" id="aeEnhanceTitle">How enhancing works</h3>
              <p class="ae-enext" id="aeEnhanceNext"></p>
              <ul class="ae-ehow-list" id="aeEnhanceHow"></ul>
            </section>
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
  renderEnhanceStrip();
  renderStats();
  renderExtras();
  showRing();
  const panel = $('#aeGearPanel');
  wireTips(panel);
  panel.addEventListener('click', event => {
    const how = event.target.closest('[data-ehow]');
    if (how) { openHow(how.dataset.ehow, how); return; }
    const named = event.target.closest('[data-enext]');
    if (named) { const tile = panel.querySelector(`[data-slot="${CSS.escape(named.dataset.enext)}"]`); selectSlot(Number(named.dataset.enext), tile ?? named).catch(error => console.error(error)); return; }
    const mark = event.target.closest('.ae-emark');
    if (mark) { const tile = mark.closest('li')?.querySelector('[data-slot]'); if (tile) selectSlot(Number(tile.dataset.slot), tile).catch(error => console.error(error)); return; }
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
      onDetail: (slot, result) => { if (state.model !== model) return; applyDetail(slot, result.detail); refreshTile(indexOf.get(slot)); refreshEnhance(); }
    }).then(later => { later.forEach(slot => state.later.add(slot)); })
      .catch(() => {})
      .finally(() => { if (state.model === model) document.documentElement.dataset.aeGearDetails = 'done'; });
  }, 0);
}

startCharacterPage({
  // The grade record and the game facts are small static files: they load while the official site answers.
  prefetch: className => { loadGrades().catch(() => {}); loadProgression().catch(() => {}); loadStats().catch(() => {}); loadEnhancement().catch(() => {}); loadMechanics().catch(() => {}); if (className) loadBuilds(className).catch(() => {}); },
  async render({ model, source, ref }) {
    const [catalogue, grades, progression, stats, builds, enhancement, mechanics] = await Promise.all([loadCatalogue(), loadGrades().catch(() => null), loadProgression().catch(() => null), loadStats().catch(() => null), loadBuilds(model.profile.class).catch(() => null), loadEnhancement().catch(() => null), loadMechanics().catch(() => null)]);
    state.stats = stats;
    // The Enhancement window record and the enchant rules: without them the page simply has no enhance marks.
    state.enhancement = enhancement;
    state.mechanics = mechanics;
    // Tags follow the role the player picked for this Daeva (a Block roll is Useful for a tank), else the main role.
    state.build = builds ? buildFor(builds, rolePick(ref)) : null;
    state.slotNames = new Map(catalogue.slots.map(slot => [keyOf(slot.slotPosName), slot.slotPosName]));
    state.grades = grades ? indexGrades(grades) : null;
    state.progression = progression;
    render(model, source, ref);
  },
  next: ({ model, ref }) => ({ label: 'Next: Your next moves', href: `${ascentUrl(ref, model.profile.class)}#aeNow`, note: 'Step 3 of 3: the gear moves are on the Ascent Plan' })
}).catch(error => failPage('Gear page', error));
