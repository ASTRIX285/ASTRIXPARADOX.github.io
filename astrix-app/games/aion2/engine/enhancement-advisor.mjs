/**
 * Enhancement advisor (The Aetherium): what to do next in the game's Enhancement window, item by item, in the window's
 * own tabs (Growth, Manastone, Theostone, Soul Binding, Transfer). Pure functions, no network.
 *
 * Inputs: the character model (each worn slot carries the item detail's enhance fields once read: manastones,
 * manastoneSlots, theostoneSlots, soulBindRate, bindLines), the role the player picked, the level, and the data:
 * grades.json (caps), mechanics.json (enchant-rates, enchant-pity), enhancement.json (tabs, role stones and lines).
 * The Growth step reads enchantAdvice, so a tile's enchant flag and its enhance mark never disagree.
 */
import { enchantAdvice, gradeInfo, indexGrades, isPending, uniqueGearLevel } from './ascent-advisor.mjs';

const slotKey = slot => String(slot?.slot ?? '').toUpperCase().replace(/[\s_]/g, '');
const OWN_RULE_SLOTS = /^(RUNE|ARCANA)\d*$/;
const ACCESSORY = /^(NECKLACE|EARRING\d|RING\d|BRACELET\d|AMULET)$/;
/** Growth order (docs/ENHANCEMENT.md): the weapon first, then the guard, then belt and amulet, then the rest. */
const GROWTH_ORDER = ['MAINHAND', 'SUBHAND', 'BELT', 'AMULET'];
const slotOrder = slot => {
  const at = GROWTH_ORDER.indexOf(slotKey(slot));
  return at >= 0 ? at : 10 + (Number.isFinite(slot.slotPos) ? slot.slotPos : 99);
};
const ROLE_WORD = { tank: 'tank', dps: 'DPS', healer: 'healer', support: 'support' };
/** 'a tank', 'a DPS' ... or 'your role' when no role is known. */
export const roleWords = role => (Object.hasOwn(ROLE_WORD, role ?? '') ? `a ${ROLE_WORD[role]}` : 'your role');

/** Step ranks, the order of the record (docs/ENHANCEMENT.md sections 6 and 9): Growth to +10, past +10, Soul Binding, manastones, Theostone. */
export const STEP_RANK = Object.freeze({ growth: 1, 'growth-risky': 2, 'soul-binding': 3, manastone: 4, theostone: 5 });
/** The one-word mark on a tile for each tab, and for an item with nothing left to do. */
export const TAB_MARKS = Object.freeze({ growth: 'Growth', manastone: 'Stones', theostone: 'Theostone', 'soul-binding': 'Bind', transfer: 'Transfer', done: 'Done' });

/** enhancement.json records by id. */
export function indexEnhancement(data) {
  return Object.fromEntries((data?.records ?? []).map(record => [record.id, record]));
}

/**
 * The most tries one enhance step can take: the chance climbs by perFailure after each failure until it reaches 100,
 * so it is the failures needed to get there plus the try that succeeds. null when the chance or the bonus is unknown.
 */
export function maxTries(rate, perFailure) {
  if (!Number.isFinite(rate)) return null;
  if (rate >= 100) return 1;
  if (!(perFailure > 0)) return null;
  return Math.ceil((100 - rate) / perFailure) + 1;
}

/** Max tries for every risky step in mechanics.json enchant-rates, with the enchant-pity bonus: { 11: 8, ... }. */
export function triesByStep(mechanics) {
  const rules = ruleMap(mechanics);
  const rates = rules['enchant-rates']?.value?.rates ?? {};
  const per = rules['enchant-pity']?.value?.perFailure;
  return Object.fromEntries(Object.entries(rates).map(([to, rate]) => [Number(to), maxTries(rate, per)]));
}
/** mechanics.json as a map by id, whether passed raw or already indexed. */
function ruleMap(mechanics) {
  if (Array.isArray(mechanics?.records)) return Object.fromEntries(mechanics.records.map(rule => [rule.id, rule]));
  return mechanics ?? {};
}

const matches = (entry, line) => (entry.ids ?? []).includes(line.id) || (entry.names ?? []).some(name => name.toLowerCase() === String(line.name ?? '').toLowerCase());

/** The role's stones (manastone record), or a pending object when the record has none for that role. */
export function roleStones(record, role) {
  const entry = record?.roles?.[role];
  if (!entry || isPending(entry)) return { pending: true, reason: entry?.reason ?? `No manastone order for ${roleWords(role)} yet.` };
  return entry;
}

/** The role's Soul Binding lines for one slot: the slot's own list, else the role's list for any slot, else pending. */
export function roleLines(record, role, slot) {
  const entry = record?.roles?.[role];
  if (!entry || isPending(entry)) return { pending: true, reason: entry?.reason ?? `No Soul Binding lines for ${roleWords(role)} yet.` };
  const list = entry.slots?.[slotKey(slot)] ?? entry.slots?.any ?? null;
  if (!list) return { pending: true, reason: `Which lines suit ${roleWords(role)} on this slot is not confirmed yet.` };
  return { status: entry.status, note: entry.note ?? null, lines: list };
}

/** The manastone slots of one item: each filled one (does it fit the role?) and each empty one with the role's stone for it. */
export function stoneSlots(slot, stones) {
  const count = Number.isInteger(slot.manastoneSlots) ? slot.manastoneSlots : 0;
  const engraved = Array.isArray(slot.manastones) ? slot.manastones : [];
  const list = isPending(stones) ? [] : stones.stones;
  const bySlot = new Map(engraved.map(stone => [stone.slot, stone]));
  let pick = 0;
  return Array.from({ length: count }, (_, n) => {
    const stone = bySlot.get(n);
    if (stone) return { n, filled: true, stone, fits: list.length ? list.some(entry => matches(entry, stone)) : null };
    const best = list.length ? list[Math.min(pick, list.length - 1)] : null;
    pick += 1;
    return { n, filled: false, best };
  });
}

/** Each Soul Binding line with where it sits (a bar when the range is known) and whether it is weak for the role. */
export function bindLines(slot, lines) {
  const rows = Array.isArray(slot.bindLines) ? slot.bindLines : [];
  const maxed = Number.isFinite(slot.soulBindRate) && slot.soulBindRate >= 100;
  return rows.map(line => {
    const percent = maxed ? 100 : (Number.isFinite(line.value) && Number.isFinite(line.max) && line.max > 0 ? Math.round((line.value / line.max) * 1000) / 10 : null);
    const known = !isPending(lines);
    return { ...line, percent, maxed, weak: known ? !lines.lines.some(entry => matches(entry, line)) : null };
  });
}

/**
 * The enhance plan of one worn item: every step that applies, in the record's order, and the next one.
 * null for an empty slot, a rune or an Arcana (they enhance their own way).
 */
export function itemPlan(slot, { role, level, grades, rules, enhancement, tries }) {
  if (!slot || slot.empty || OWN_RULE_SLOTS.test(slotKey(slot))) return null;
  const advice = enchantAdvice(slot, { level, grades: grades.index, progression: grades.progression });
  const grade = gradeInfo(slot.grade, grades.index, slot.gradeName ?? null);
  const uniqueOrder = grades.index.byCode.get('Unique')?.order?.value ?? Infinity;
  const keeper = Number.isFinite(grade.order) && grade.order >= uniqueOrder;
  const key = slotKey(slot);
  const steps = [];
  const add = (kind, tab, title, why, extra = {}) => steps.push({ kind, tab, rank: STEP_RANK[kind], order: slotOrder(slot), title, why, ...extra });
  const partial = ['manastoneSlots', 'manastones', 'soulBindRate'].some(field => isPending(slot[field]) || slot[field] === undefined);

  // 1. Growth to +10 (or a lower cap): every step succeeds.
  if (advice?.action === 'enchant' && !advice.costly) {
    add('growth', 'growth', `Growth: +${advice.from} to +${advice.to}`, `Always succeeds. ${advice.why}`, { from: advice.from, to: advice.to, rate: 100, tries: 1 });
  }
  // 4. Empty manastone slots on keepers only (Miguel, 18 Oct 2026: nothing is spent on gear below Unique).
  const stones = roleStones(enhancement.manastone, role);
  const sockets = Number.isInteger(slot.manastoneSlots) && Array.isArray(slot.manastones) ? stoneSlots(slot, stones) : [];
  const empty = sockets.filter(socket => !socket.filled).length;
  if (keeper && empty) {
    const accessory = ACCESSORY.test(key);
    const names = isPending(stones) ? [] : [...new Set(sockets.filter(socket => !socket.filled && socket.best).map(socket => socket.best.name))];
    const what = accessory
      ? (enhancement.manastone?.accessories?.text ?? 'Accessories take Soulstones.')
      : isPending(stones) ? `Which stones suit ${roleWords(role)} is not confirmed yet.` : `Engrave stones for ${roleWords(role)}: ${names.join(', ')}.`;
    add('manastone', 'manastone', `Stones: fill ${empty} empty ${empty === 1 ? 'slot' : 'slots'}`, what, { empty, status: accessory ? 'unknown' : isPending(stones) ? 'unknown' : stones.status });
  }
  // 2. Keeper gear past +10: one step at a time, with its chance and the most tries the failure bonus allows.
  if (advice?.action === 'enchant' && advice.costly) {
    const to = advice.from + 1;
    const rate = rules['enchant-rates']?.value?.rates?.[to] ?? null;
    const most = tries[to] ?? null;
    const odds = Number.isFinite(rate) ? `${rate}% now${most ? `, at most ${most} tries with the failure bonus` : ''}.` : 'The chance of this step is not confirmed yet.';
    add('growth-risky', 'growth', `Growth: +${advice.from} to +${to}`, `${odds} Check the cost in the Growth tab.`, { from: advice.from, to, rate, tries: most, cap: advice.cap });
  }
  // 3. Soul Binding on keepers below 100%: reroll the role's weak lines first, then Bind.
  const lines = roleLines(enhancement['soul-binding'], role, slot);
  const rows = bindLines(slot, lines);
  if (keeper && Number.isFinite(slot.soulBindRate) && slot.soulBindRate < 100) {
    const weak = rows.filter(row => row.weak).map(row => row.name);
    const rate = `${slot.soulBindRate}%`;
    if (weak.length) add('soul-binding', 'soul-binding', `Bind: reroll ${listWords(weak)} first`, `${listWords(weak)} ${weak.length === 1 ? 'is' : 'are'} weak for ${roleWords(role)}. Harmonise rerolls one line. Fix weak lines, then Bind from ${rate}.`, { weak, rate: slot.soulBindRate });
    else add('soul-binding', 'soul-binding', `Bind: raise ${rate} to 100%`, isPending(lines) ? `${lines.reason} Each Bind raises the rate. Check the cost in the Soul Binding tab.` : 'Every line suits your role. Each Bind raises the rate. Check the cost in the Soul Binding tab.', { weak: isPending(lines) ? null : [], rate: slot.soulBindRate });
  }
  // 5. Theostone on the weapon you keep: last. The data never says which one is engraved, so the step says so.
  if (key === 'MAINHAND' && keeper && Number.isInteger(slot.theostoneSlots) && slot.theostoneSlots > 0) {
    const advise = enhancement.theostone?.roles?.[role];
    const which = advise && !isPending(advise) ? advise.text : `Which Theostone suits ${roleWords(role)} is not confirmed yet.`;
    add('theostone', 'theostone', 'Theostone: last, on this weapon', `${which} The official data does not say whether one is engraved: if the slot is empty, engrave one after everything else.`);
  }
  steps.sort((a, b) => a.rank - b.rank);
  const next = steps[0] ?? null;
  const replace = advice?.action === 'replace' || advice?.action === 'hold';
  const mark = next ? next.tab : (replace || partial || !advice?.action ? null : 'done');
  return {
    slotPos: slot.slotPos, slot: slot.slot, name: slot.name, grade, keeper, advice,
    steps, next, mark, label: mark ? TAB_MARKS[mark] : null, partial,
    sockets, stones, lines: rows, linesFor: lines
  };
}
const listWords = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

/**
 * The whole enhance plan for one Daeva: a plan per worn item and one overall next step across all items, by the record's
 * order (Growth to +10, empty stones, past +10, Soul Binding, Theostone) and then the slot order (weapon first).
 * @param model  the character model (gear entries with their item detail fields once read)
 * @param role   tank, dps, healer or support (the role the player picked, else the class's main role)
 * @param level  the character level
 * @param data   { grades, progression, mechanics, enhancement }
 */
export function enhancementPlan(model, role, level, { grades = null, progression = null, mechanics = null, enhancement = null } = {}) {
  const index = grades?.byCode instanceof Map ? grades : indexGrades(grades);
  const rules = ruleMap(mechanics);
  const records = enhancement && !Array.isArray(enhancement.records) ? enhancement : indexEnhancement(enhancement);
  const tries = triesByStep(rules);
  const items = (model?.gear ?? []).map((slot, n) => {
    const plan = itemPlan(slot, { role, level, grades: { index, progression }, rules, enhancement: records, tries });
    return plan ? { ...plan, index: n } : null;
  }).filter(Boolean);
  const all = items.flatMap(item => item.steps.map(step => ({ item, step })));
  all.sort((a, b) => a.step.rank - b.step.rank || a.step.order - b.step.order);
  const top = all[0] ?? null;
  // The Daeva's stage in the decision logic (docs/ENHANCEMENT.md section 9): before Unique gear starts, prepare; after, build.
  const uniqueFrom = uniqueGearLevel(progression);
  return {
    role,
    tries,
    stage: { level, uniqueFrom, phase: level < uniqueFrom ? 'prepare' : 'build', keepers: items.filter(item => item.keeper).length, toReplace: items.filter(item => item.advice?.action === 'replace').length, toHold: items.filter(item => item.advice?.action === 'hold').length },
    logic: records.logic ?? null,
    tabs: records.tabs?.tabs ?? [],
    items,
    next: top ? { slotPos: top.item.slotPos, name: top.item.name, tab: top.step.tab, title: top.step.title, why: top.step.why, kind: top.step.kind } : null
  };
}
