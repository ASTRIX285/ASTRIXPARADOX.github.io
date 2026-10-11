/**
 * Gear page (The Aetherium, hub/aetherium/gear/equipment/): what one Daeva wears. Each item sits on its grade tile like
 * the game's (grade colour, enchant level on the corner) with a flag from the grade rule: ENCHANT +3 to +10, REPLACE or
 * FULL. Tap a tile or its flag for the item card (like the game's tooltip, plus why, how far, how safe and what it costs).
 * Stats on the left under the gear; pet, wings and title on the right, both columns ending level.
 * Skills and Daevanion boards have their own pages (see the character menu).
 */
import { ArmoryUnavailable, ascentUrl, cardUrl, explain, loadCatalogue, loadGrades, loadItemDetail, loadMechanics, loadProgression } from './aetherium-data.mjs';
import { $, esc, gradeTile, iconImg, infoCardHtml, isPending, number, openInfo, slotLabel, slotRank } from './aetherium-ui.mjs';
import { failPage, startCharacterPage, windowBar } from './character-page.mjs';
import { enchantAdvice, enchantSteps, gearMoves, gradeInfo, indexGrades, indexMechanics } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';

const PRIMARY_STATS = ['STR', 'DEX', 'INT', 'CON', 'AGI', 'WIS'];
const state = { model: null, source: null, ref: null, selected: null, listedSlots: new Set(), grades: null, progression: null, ring: null };

const adviceOf = slot => enchantAdvice(slot, { level: state.model.profile.level, grades: state.grades, progression: state.progression });
const gradeOf = slot => gradeInfo(slot.grade, state.grades, slot.gradeName ?? null);
const enchantText = slot => {
  const { cap, about } = adviceOf(slot) ?? {};
  return `+${slot.enchant}${Number.isFinite(cap) ? ` of ${about ? 'about ' : ''}${cap}` : ''}`;
};

/** The slot list in the game's order: the eight listed slots as the site sends them, then accessories (necklace, earrings, rings, bracelets, belt, cape). */
function orderedGear(gear) {
  const items = gear.map((slot, index) => ({ slot, index }));
  const listed = items.filter(item => state.listedSlots.has(item.slot.slotPos));
  const extra = items.filter(item => !state.listedSlots.has(item.slot.slotPos))
    .sort((a, b) => slotRank(a.slot.slot) - slotRank(b.slot.slot) || a.slot.slotPos - b.slot.slotPos);
  return [...listed, ...extra];
}

/** The flag on a tile, from the grade rule. It opens the item card in place, never another page. */
function flagHtml(slot, index) {
  const advice = adviceOf(slot);
  if (!advice?.flag) return '';
  const say = advice.action === 'enchant' ? `Enchant ${slot.name} from +${advice.from} to +${advice.to}` : advice.action === 'replace' ? `Replace ${slot.name}` : `${slot.name} is fully enchanted`;
  return `<button type="button" class="ae-flag is-${esc(advice.action)}${advice.costly ? ' is-costly' : ''}" data-enchant-flag="${esc(slot.slotPos)}" data-flag-slot="${index}" aria-haspopup="dialog" aria-label="${esc(say)}. Open the item card for why.">${esc(advice.flag)}</button>`;
}

function slotMeta(slot) {
  const grade = gradeOf(slot);
  return `<span class="ae-grade-name"${grade.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(grade.name)}</span> · ${esc(enchantText(slot))}`;
}

function renderGear() {
  const { gear } = state.model;
  $('#aeGearCount').textContent = `${gear.filter(slot => !slot.empty).length} of ${gear.length} worn`;
  $('#aeGear').innerHTML = orderedGear(gear).map(({ slot, index }) => {
    if (slot.empty) return `<li data-gear-index="${index}"><div class="ae-slot is-empty"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>Empty</strong></div></li>`;
    const advice = adviceOf(slot);
    const flag = flagHtml(slot, index);
    return `<li data-gear-index="${index}" data-slot-pos="${esc(slot.slotPos)}"${advice?.action ? ` data-advice="${esc(advice.action)}"` : ''}${flag ? ' class="has-flag"' : ''}><button type="button" class="ae-slot" data-slot="${index}" data-grade="${esc(gradeOf(slot).id ?? '')}" aria-haspopup="dialog">
        ${gradeTile({ icon: slot.icon, grade: gradeOf(slot).id, enchant: slot.enchant, size: 80 })}
        <span class="ae-slot-text"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>${esc(slot.name)}</strong><span class="ae-slot-meta">${slotMeta(slot)}</span></span>
      </button>${flag}</li>`;
  }).join('');
  const accessories = state.model.accessorySlots;
  // Slots outside the slot list (cape, belt, accessories) only reach the official site once something is worn there.
  const extra = gear.filter(slot => !state.listedSlots.has(slot.slotPos)).length;
  $('#aeAccessories').textContent = !isPending(accessories)
    ? `Accessories: ${accessories.filter(slot => !slot.empty).length} worn.`
    : extra
      ? 'Other slots, such as accessories, show here once something is worn in them.'
      : 'Accessories: none worn. The official AION 2 site only lists an accessory slot once something is worn in it.';
  state.ring?.forEach(slotPos => document.querySelector(`#aeGear [data-slot-pos="${CSS.escape(String(slotPos))}"]`)?.classList.add('is-ringed'));
}

/** Refreshes one tile after the item detail lands (its real cap): the meta line and the flag follow the rule again. */
function refreshTile(index) {
  const slot = state.model.gear[index];
  const li = document.querySelector(`#aeGear [data-gear-index="${index}"]`);
  if (!li || slot.empty) return;
  li.querySelector('.ae-slot-meta').innerHTML = slotMeta(slot);
  li.querySelector('.ae-flag')?.remove();
  const flag = flagHtml(slot, index);
  if (flag) li.insertAdjacentHTML('beforeend', flag);
  li.classList.toggle('has-flag', Boolean(flag));
  const action = adviceOf(slot)?.action;
  if (action) li.dataset.advice = action; else delete li.dataset.advice;
}

const NOT_CONFIRMED = test => `<span class="ae-tag is-unconfirmed">Not confirmed yet</span>${test ? ` <span class="ae-tag-test">Check: ${esc(test)}</span>` : ''}`;

/**
 * The advice block of the item card: grade and cap, now and target, why, the chance of each next step, that a failure
 * never drops a level or breaks the item, the cost and where Enhance Stones come from. Every rule shows its status.
 */
function adviceHtml(slot, rules) {
  const advice = adviceOf(slot);
  if (!advice) return '';
  const grade = advice.grade;
  const rows = [];
  const capText = Number.isFinite(advice.cap) ? `${advice.about ? 'about ' : ''}+${advice.cap}` : 'not known yet';
  rows.push(`<li><span>Grade</span><b class="ae-grade-name"${grade.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(grade.name)}</b></li>`);
  rows.push(`<li><span>Enchant cap</span><b>${esc(capText)}</b></li>`);
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
  return `<section class="ae-advice is-${esc(advice.action ?? 'none')}" id="aeAdvice" aria-label="Enchant advice">
      <p class="ae-advice-head">${esc(head)}</p>
      <p class="ae-card-line ae-advice-why">${esc(advice.why)}</p>
      <ul class="ae-advice-facts">${rows.join('')}</ul>
      ${odds}${cost}${from}
    </section>`;
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
    ${d.subStats.length || d.bonusStatSlots ? `<div class="ae-item-block"><p class="ae-item-sec">Bonus stats${d.bonusStatsRandom ? ' <small>rolled</small>' : ''}</p>${d.subStats.length ? `<ul class="ae-item-rows is-bonus">${rows(d.subStats)}</ul>` : '<p class="ae-empty">None rolled yet</p>'}</div>` : ''}
    ${d.skillPerkSlots || d.skillPerks.length ? `<div class="ae-item-block"><p class="ae-item-sec">Skill perks <small>${d.skillPerks.length} of ${d.skillPerkSlots}</small></p><ul class="ae-perk-list">
      ${d.skillPerks.map(perk => `<li class="ae-perk">${perk.icon ? `<img src="${esc(perk.icon)}" alt="" width="36" height="36" referrerpolicy="no-referrer">` : '<span class="ae-perk-empty"></span>'}<span>${esc(perk.name)}</span><b>+${esc(perk.level)}</b></li>`).join('')}
      ${Array.from({ length: emptyPerks }, () => '<li class="ae-perk is-empty"><span class="ae-perk-empty"></span><span>Empty perk slot</span></li>').join('')}
    </ul></div>` : ''}
    ${stones ? `<div class="ae-item-block"><p class="ae-item-sec">Manastone slots</p><span class="ae-sockets" aria-label="${stones} manastone slots">${Array.from({ length: stones }, () => '<i></i>').join('')}</span></div>` : ''}
    ${d.sources.length || d.appearance ? `<ul class="ae-card-chips">${d.sources.map(source => `<li>From: ${esc(source)}</li>`).join('')}${d.appearance ? `<li>Look: ${esc(d.appearance)}</li>` : ''}</ul>` : ''}
    ${d.description ? d.description.split('\n').map(line => `<p class="ae-card-line ae-item-desc">${esc(line)}</p>`).join('') : ''}`;
}

/** The card's status line, from the same rule as the flag. */
function statusOf(advice) {
  if (!advice) return null;
  if (advice.action === 'enchant') return ['go', `Enchant it: ${advice.to - advice.from} more ${advice.to - advice.from === 1 ? 'level' : 'levels'} to +${advice.to}`];
  if (advice.action === 'replace') return ['go', 'Replace it with a Unique piece'];
  if (advice.action === 'full') return ['keep', 'Fully enchanted'];
  if (advice.action === 'done') return ['keep', `+${advice.from} reached`];
  return null;
}

let rulesPromise = null;
const loadRules = () => (rulesPromise ??= loadMechanics().then(mechanics => indexMechanics(mechanics, null)).catch(() => { rulesPromise = null; return {}; }));

async function selectSlot(index, from, { advice: toAdvice = false } = {}) {
  const slot = state.model.gear[index];
  state.selected = index;
  const head = detail => ({
    icon: (detail ?? slot).icon, title: (detail ?? slot).name, grade: gradeOf(slot).id,
    sub: [slotLabel(slot.slot), detail?.category, gradeOf(slot).name].filter(Boolean).join(' · ')
  });
  const rules = await loadRules();
  const focusAdvice = () => { if (toAdvice) $('#aeAdvice')?.scrollIntoView({ block: 'nearest' }); };
  openInfo(infoCardHtml({ ...head(null), status: statusOf(adviceOf(slot)), body: `${adviceHtml(slot, rules)}<p class="ae-card-line">Reading ${esc(slot.name)}.</p>` }), from);
  focusAdvice();
  let result;
  try {
    result = await loadItemDetail(state.model, slot);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    result = { detail: null, reason: explain(error, 'The official AION 2 site is not answering right now. Try this item again in a minute.') };
  }
  if (state.selected !== index || $('#aeInfo')?.hidden) return;
  if (!result.detail) {
    openInfo(infoCardHtml({ ...head(null), status: statusOf(adviceOf(slot)), chips: [`+${slot.enchant}`], lines: [result.reason], body: adviceHtml(slot, rules) }), from);
    focusAdvice();
    return;
  }
  const d = result.detail;
  // The detail call is the only source of max enchant, manastone slots and the client's grade name: keep them on the tile too.
  if (!isPending(d.maxEnchant)) slot.maxEnchant = d.maxEnchant;
  if (!isPending(d.manastoneSlots)) slot.manastoneSlots = d.manastoneSlots;
  if (d.gradeName) slot.gradeName = d.gradeName;
  refreshTile(index);
  openInfo(infoCardHtml({
    ...head(d), status: statusOf(adviceOf(slot)),
    chips: [d.level ? `Item level ${d.level}` : null, d.equipLevel ? `Wear from Lv ${d.equipLevel}` : null, d.soulBindRate ? `Soul bind ${d.soulBindRate}%` : null],
    body: `${adviceHtml(slot, rules)}${itemCardBody(slot, d)}`
  }), from);
  focusAdvice();
}

/* Base stats as the official site sends them. When every one is 0 the site is not showing them, so the page says that
   once instead of six zeros. Real values show as they are. */
function renderStats() {
  const primary = state.model.stats.filter(row => PRIMARY_STATS.includes(row.type));
  const none = !primary.length || primary.every(row => row.value === 0);
  $('#aeStats').hidden = none;
  $('#aeStats').innerHTML = none ? '' : primary.map(row => `<div class="ae-stat"><dt>${esc(row.name)}</dt><dd>${number(row.value)}</dd></div>`).join('');
  $('#aeStatsNone').hidden = !none;
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
  const nodes = [...document.querySelectorAll('#aeGear li.is-ringed')];
  nodes[0]?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Pet, wings and title as three big cards that share the column's height equally. */
function renderExtras() {
  const { model } = state;
  const card = (label, icon, name, meta) => `<li class="ae-extra">${iconImg(icon, '', 88)}<span><small>${label}</small><strong>${esc(name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span></li>`;
  $('#aeExtras').innerHTML = [
    isPending(model.pet) ? card('Pet', null, 'None equipped', null) : card('Pet', model.pet.icon, model.pet.name, `Lv ${model.pet.level}`),
    isPending(model.wings) ? card('Wings', null, 'None equipped', null) : card('Wings', model.wings.icon, model.wings.name, `${gradeInfo(model.wings.grade, state.grades).name} · +${model.wings.enchant}`),
    card('Title', null, model.profile.title || 'No title', null)
  ].join('');
  // Nothing to show (no pet, no wings, no title): the tall column would stay empty, so the page collapses it.
  const bare = isPending(model.pet) && isPending(model.wings) && !model.profile.title;
  document.querySelector('.ae-gear-page').classList.toggle('is-single', bare);
  $('#aeExtrasCol').hidden = bare;
}

function render(model, source, ref) {
  Object.assign(state, { model, source, ref, selected: null });
  const ring = ringOf(location.hash);
  state.ring = ring ? new Set(ring.slots) : null;
  // Came from Show me on a gear move: the back link returns to where it was pressed (the Ascent Plan's moves, or the
  // Daeva Card for #...:card), never round to this page again.
  const fromCard = location.hash.endsWith(':card');
  const back = !ring ? null : fromCard ? { href: cardUrl(ref), label: 'Daeva Card' } : { href: `${ascentUrl(ref, model.profile.class)}#aeNow`, label: 'Plan' };
  $('#aeStage').innerHTML = `<div class="ae-gw ae-gear-window">
    ${windowBar({ title: 'Gear', model, ref, back })}
    <div class="ae-gw-body">
      <div class="ae-ledger ae-gear-page">
        <div class="ae-col">
          <section class="ae-panel" aria-labelledby="aeGearTitle">
            <h2 class="ae-section-title" id="aeGearTitle">Equipped gear <small id="aeGearCount"></small></h2>
            <p class="ae-ring-note" id="aeGearRingNote" role="status" hidden></p>
            <ul class="ae-gear" id="aeGear"></ul>
            <p class="ae-accessories" id="aeAccessories"></p>
          </section>
          <section class="ae-panel is-grow" aria-labelledby="aeStatTitle">
            <h2 class="ae-section-title" id="aeStatTitle">Stats <small>from the official AION 2 site</small></h2>
            <dl class="ae-stats" id="aeStats"></dl>
            <p class="ae-empty ae-stats-none" id="aeStatsNone" hidden>Not shown by the official AION 2 site</p>
            <p class="ae-note" id="aeCombatNote">Attack, Defense, Accuracy and other combat stats are not in the public character data. Check them on your in-game character screen.</p>
          </section>
        </div>
        <div class="ae-col" id="aeExtrasCol">
          <section class="ae-panel is-grow" aria-labelledby="aeExtraTitle">
            <h2 class="ae-section-title" id="aeExtraTitle">Pet, wings and title</h2>
            <ul class="ae-extras" id="aeExtras"></ul>
          </section>
        </div>
      </div>
    </div>
  </div>`;
  renderGear();
  renderStats();
  renderExtras();
  showRing();
  $('#aeGear').addEventListener('click', event => {
    const flag = event.target.closest('[data-flag-slot]');
    if (flag) { selectSlot(Number(flag.dataset.flagSlot), flag, { advice: true }).catch(error => console.error(error)); return; }
    const button = event.target.closest('[data-slot]');
    if (button) selectSlot(Number(button.dataset.slot), button).catch(error => console.error(error));
  });
}

startCharacterPage({
  // The grade record and the game facts are small static files: they load while the official site answers.
  prefetch: () => { loadGrades().catch(() => {}); loadProgression().catch(() => {}); },
  async render({ model, source, ref }) {
    const [catalogue, grades, progression] = await Promise.all([loadCatalogue(), loadGrades().catch(() => null), loadProgression().catch(() => null)]);
    state.listedSlots = new Set(catalogue.slots.map(slot => slot.slotPos));
    state.grades = grades ? indexGrades(grades) : null;
    state.progression = progression;
    render(model, source, ref);
  },
  next: ({ model, ref }) => ({ label: 'Next: Your next moves', href: `${ascentUrl(ref, model.profile.class)}#aeNow`, note: 'Step 3 of 3: the gear moves are on the Ascent Plan' })
}).catch(error => failPage('Gear page', error));
