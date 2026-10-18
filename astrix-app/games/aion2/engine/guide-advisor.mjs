/**
 * The Guide's path for AION 2 (The Aetherium): what is done, what to do now and what opens next at a level, the weekly
 * loop at the level cap, which content an item level enters, and the order to raise combat power. Pure functions, no
 * network and no storage: the page passes in what the player ticked and the time.
 *
 * Data it reads:
 *   guide.json: path (the steps by level), gates (content by level and item level), weekly (the loop and its resets)
 *   and power (the order to grow a Daeva).
 *   progression.json: a step that names a fact (fact, pick) takes its level and its source from that fact, so one value
 *   lives in one place.
 */

const listOf = value => (Array.isArray(value) ? value : []);
const recordOf = (data, id) => listOf(data?.records).find(record => record?.id === id) ?? null;
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const HOUR = 3600000;
const DAY = 24 * HOUR;

/** How many coming-up steps a page shows before "Later". */
export const NEXT_COUNT = 4;

/** The level a progression fact sets, or null. pick chooses one entry of a list fact (an index, or a board or dungeon name). */
export function factLevel(progression, factId, pick = null) {
  const fact = recordOf(progression, factId);
  if (!fact) return null;
  const value = fact.value;
  if (Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (Number.isInteger(pick)) return Number.isFinite(value[pick]) ? value[pick] : null;
    const entry = value.find(item => same(item?.name, pick));
    const level = entry?.unlockLevel ?? entry?.level;
    return Number.isFinite(level) ? level : null;
  }
  if (value && typeof value === 'object' && Number.isFinite(value.level)) return value.level;
  return null;
}

/** A level that is a number or a { fact, pick } reference. */
const levelOf = (value, progression) => (Number.isFinite(value) ? value : value && typeof value === 'object' ? factLevel(progression, value.fact, value.pick ?? null) : null);

/** The level cap (progression.json level-cap). */
export const levelCap = progression => factLevel(progression, 'level-cap');

/** The path steps with each step's level (and source) filled in, in level order. A step whose fact is missing is dropped. */
export function pathSteps({ guide, progression }) {
  const steps = listOf(recordOf(guide, 'path')?.steps).map((step, order) => {
    const fact = step.fact ? recordOf(progression, step.fact) : null;
    const level = step.fact ? factLevel(progression, step.fact, step.pick ?? null) : step.level;
    return {
      ...step,
      order,
      level,
      until: step.until === undefined ? null : levelOf(step.until, progression),
      status: step.status ?? (fact ? 'confirmed' : 'unknown'),
      provenance: fact ? listOf(fact.provenance) : listOf(step.provenance),
      source: fact ? { kind: 'fact', id: fact.id, label: fact.label } : { kind: 'guide' }
    };
  });
  return steps.filter(step => Number.isFinite(step.level)).sort((a, b) => a.level - b.level || a.order - b.order);
}

/** A level from the page: a whole number from 1 to the cap, else null. */
export function clampGuideLevel(level, cap = 45) {
  if (level === null || level === undefined || level === '') return null;
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(cap, Math.round(n)));
}

/**
 * The path at a level: { level, cap, done, now, next, later, weekly }.
 *   done: steps behind the Daeva (an older unlock, advice whose until level is passed, or a step the player ticked).
 *   now:  the latest unlock at or below the level, and every to-do step that applies at this level and is not ticked.
 *   next: the first NEXT_COUNT steps above the level; later holds the rest.
 *   weekly: the weekly loop (weeklyLoop) at the cap, else null.
 * ticked is a Set (or array) of step ids the player marked done.
 */
export function guidePath(level, data, { ticked = [], nextCount = NEXT_COUNT } = {}) {
  const cap = levelCap(data.progression) ?? 45;
  const at = clampGuideLevel(level, cap);
  if (at === null) throw new TypeError('guidePath needs a level');
  const tick = new Set(ticked);
  const steps = pathSteps(data);
  const latestUnlock = Math.max(0, ...steps.filter(step => step.kind === 'unlock' && step.level <= at).map(step => step.level));
  const done = [];
  const now = [];
  const ahead = [];
  for (const step of steps) {
    if (step.level > at) { ahead.push({ ...step, state: 'next' }); continue; }
    if (step.until !== null && at >= step.until) { done.push({ ...step, state: 'done', why: 'passed' }); continue; }
    if (tick.has(step.id)) { done.push({ ...step, state: 'done', why: 'ticked' }); continue; }
    if (step.kind === 'unlock' && step.level < latestUnlock) { done.push({ ...step, state: 'done', why: 'behind' }); continue; }
    now.push({ ...step, state: 'now' });
  }
  return {
    level: at,
    cap,
    done,
    now,
    next: ahead.slice(0, nextCount),
    later: ahead.slice(nextCount),
    weekly: at >= cap ? weeklyLoop(data) : null
  };
}

/* Resets. The game's day turns at the daily hour (UTC); its week turns on the weekly weekday and hour (UTC). */
function resetRule(data) {
  const reset = recordOf(data.guide, 'weekly')?.reset ?? {};
  return {
    dailyHour: Number.isFinite(reset.daily?.hourUtc) ? reset.daily.hourUtc : 7,
    weekday: Number.isFinite(reset.weekly?.weekdayUtc) ? reset.weekly.weekdayUtc : 3,
    weeklyHour: Number.isFinite(reset.weekly?.hourUtc) ? reset.weekly.hourUtc : 7
  };
}

/** The last reset at or before now (a Date or ms) for a cycle ('daily' or 'weekly'), as ms since 1970. */
export function lastReset(now, cycle, data) {
  const t = +now;
  const rule = resetRule(data);
  const day = new Date(t);
  const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  if (cycle === 'weekly') {
    let at = base - ((day.getUTCDay() - rule.weekday + 7) % 7) * DAY + rule.weeklyHour * HOUR;
    if (at > t) at -= 7 * DAY;
    return at;
  }
  let at = base + rule.dailyHour * HOUR;
  if (at > t) at -= DAY;
  return at;
}

/** The next reset after now for a cycle, as ms since 1970. */
export const nextReset = (now, cycle, data) => lastReset(now, cycle, data) + (cycle === 'weekly' ? 7 * DAY : DAY);

/** Time left until a moment, split for a countdown: { ms, days, hours, minutes }. */
export function countdown(now, until) {
  const ms = Math.max(0, +until - +now);
  return { ms, days: Math.floor(ms / DAY), hours: Math.floor((ms % DAY) / HOUR), minutes: Math.floor((ms % HOUR) / 60000) };
}

/** A tick still counts when it was made after the last reset of its item's cycle. An item with no reset cycle keeps it. */
export function tickValid(tickedAt, cycle, now, data) {
  const at = Date.parse(tickedAt);
  if (!Number.isFinite(at)) return false;
  if (cycle !== 'daily' && cycle !== 'weekly') return true;
  return at >= lastReset(now, cycle, data);
}

/** The weekly loop: { label, text, items, resets }. Each item keeps its cycle (daily, weekly or energy) and source. */
export function weeklyLoop(data) {
  const record = recordOf(data.guide, 'weekly');
  const gates = indexGates(data);
  return {
    label: record?.label ?? 'The weekly loop',
    text: record?.text ?? '',
    items: listOf(record?.items).map(item => ({ ...item, unlock: item.unlock === undefined ? null : levelOf(item.unlock, data.progression), gate: item.gate ? gates.get(item.gate) ?? null : null })),
    resets: resetRule(data)
  };
}

/** The weekly items with whether each is ticked for its current cycle. ticks maps item id to the time it was ticked. */
export function weeklyState(data, ticks = {}, now = Date.now()) {
  return weeklyLoop(data).items.map(item => ({ ...item, done: Boolean(ticks[item.id]) && tickValid(ticks[item.id], item.cycle, now, data) }));
}

function indexGates(data) {
  return new Map(listOf(recordOf(data.guide, 'gates')?.gates).map(gate => [gate.id, gate]));
}

/**
 * What an item level enters at a level: { itemLevel, open, closed, next, nextByLevel }.
 *   open: content both the level and the item level allow. closed: the rest, each with what it lacks.
 *   next: the closest gate the level allows that needs more item level (null when none, or no item level known).
 *   nextByLevel: the first gate that needs a higher level.
 * An item level of null means it is not known: everything level-allowed is listed as "item level not known".
 */
export function contentGates(itemLevel, level, data) {
  const known = Number.isFinite(itemLevel) && itemLevel >= 0;
  const gates = listOf(recordOf(data.guide, 'gates')?.gates).slice().sort((a, b) => a.itemLevel - b.itemLevel || a.level - b.level);
  const open = [];
  const closed = [];
  for (const gate of gates) {
    const levelOk = level >= gate.level;
    const itemOk = known && itemLevel >= gate.itemLevel;
    if (levelOk && itemOk) open.push(gate);
    else closed.push({ ...gate, needsLevel: levelOk ? 0 : gate.level - level, needsItemLevel: known ? Math.max(0, gate.itemLevel - itemLevel) : null });
  }
  const next = known ? closed.find(gate => gate.needsLevel === 0 && gate.needsItemLevel > 0) ?? null : null;
  const nextByLevel = closed.filter(gate => gate.needsLevel > 0).sort((a, b) => a.level - b.level || a.itemLevel - b.itemLevel)[0] ?? null;
  return { itemLevel: known ? itemLevel : null, open, closed, next, nextByLevel };
}

/**
 * The order to raise combat power at a level: { now, later }. A step applies from its from level until its until level
 * (exclusive). Steps stay in the data's order, which is the order to do them.
 */
export function powerSteps(level, data) {
  const steps = listOf(recordOf(data.guide, 'power')?.steps).map(step => ({
    ...step,
    from: levelOf(step.from, data.progression) ?? 1,
    until: step.until === undefined ? null : levelOf(step.until, data.progression)
  }));
  return {
    now: steps.filter(step => level >= step.from && (step.until === null || level < step.until)),
    later: steps.filter(step => level < step.from)
  };
}

/* Snapshots: what a Daeva looked like on a visit (level, combat power, item level, grade and enchant per slot). */

/** A snapshot from a character model: { level, combatPower, itemLevel, gear: { [slot]: { grade, enchant, name } } }. */
export function snapshotOf(model) {
  const p = model?.profile ?? {};
  const gear = {};
  for (const slot of listOf(model?.gear)) {
    if (!slot || slot.empty || !slot.slot) continue;
    gear[slot.slot] = { name: slot.name ?? null, grade: slot.grade ?? null, enchant: Number.isFinite(slot.enchant) ? slot.enchant : null };
  }
  return {
    level: Number.isFinite(p.level) ? p.level : null,
    combatPower: Number.isFinite(p.combatPower) ? p.combatPower : null,
    itemLevel: Number.isFinite(p.itemLevel) ? p.itemLevel : null,
    gear
  };
}

/**
 * What changed between two snapshots, as a list of { kind, slot?, from, to }. kind is level, combatPower, itemLevel,
 * grade, enchant, new (a slot filled) or removed. Same snapshots give an empty list.
 */
export function snapshotChanges(before, after) {
  if (!before || !after) return [];
  const out = [];
  for (const kind of ['level', 'combatPower', 'itemLevel']) {
    if (Number.isFinite(before[kind]) && Number.isFinite(after[kind]) && before[kind] !== after[kind]) out.push({ kind, from: before[kind], to: after[kind] });
  }
  // A snapshot with no gear (an older visit, or nothing read) is not compared slot by slot: every slot would read as new.
  const slots = Object.keys(before.gear ?? {}).length ? new Set([...Object.keys(before.gear ?? {}), ...Object.keys(after.gear ?? {})]) : new Set();
  for (const slot of slots) {
    const a = before.gear?.[slot];
    const b = after.gear?.[slot];
    if (!a && b) { out.push({ kind: 'new', slot, from: null, to: b }); continue; }
    if (a && !b) { out.push({ kind: 'removed', slot, from: a, to: null }); continue; }
    if (a.name !== b.name || a.grade !== b.grade) { out.push({ kind: 'grade', slot, from: a, to: b }); continue; }
    if (a.enchant !== b.enchant) out.push({ kind: 'enchant', slot, from: a.enchant, to: b.enchant });
  }
  return out;
}
