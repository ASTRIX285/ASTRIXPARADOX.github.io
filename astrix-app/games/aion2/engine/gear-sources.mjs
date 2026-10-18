/**
 * Where to get it (The Aetherium Guide, phase 3, 18 Oct 2026): for one worn slot and the Daeva's build, which content
 * drops a better piece, the reward to look for, its entry gate (character level and item level) and the cycle it runs
 * on. Pure functions, no network. Everything comes from data/advisor/gear-sources.json; a slot no source covers, and
 * side missions, say pending. Grades come from grades.json through gradeInfo; the Unique-gear level from progression.json.
 * It never blocks: a gate the Daeva has not reached is shown with the gap, and a slot that strays (an enhanced piece
 * below Unique, past the level Unique gear starts) is flagged with what it costs.
 */
import { gradeInfo, indexGrades, uniqueGearLevel } from './ascent-advisor.mjs';
import { classNeeds } from './item-assessor.mjs';

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const slotKey = name => String(name ?? '').replace(/[\s_-]/g, '').toLowerCase();
const grouped = number => (Number.isFinite(number) ? number.toLocaleString('en-GB') : '-');

/** Plain words for a slot in a sentence ("Unique gloves"). */
const SLOT_WORDS = {
  mainhand: 'weapon', subhand: 'guard', helmet: 'helm', shoulder: 'pauldrons', torso: 'breastplate', pants: 'greaves',
  gloves: 'gloves', boots: 'boots', cape: 'cloak', necklace: 'necklace', earring1: 'earring', earring2: 'earring',
  ring1: 'ring', ring2: 'ring', bracelet1: 'bracelet', bracelet2: 'bracelet', belt: 'belt', amulet: 'amulet',
  rune1: 'rune', rune2: 'rune', arcana1: 'Arcana', arcana2: 'Arcana', arcana3: 'Arcana', arcana4: 'Arcana', arcana5: 'Arcana'
};
export const slotWord = name => SLOT_WORDS[slotKey(name)] ?? String(name ?? 'piece').toLowerCase();

/** The order slots are worked on: the weapon, the guard, the armour, the accessories, the belt, then Arcana. */
const GROUP_ORDER = ['weapon', 'guard', 'armour', 'accessory', 'belt', 'arcana'];

/** gear-sources.json in lookups: records by id, slot to group, the Expeditions and Transcendence dungeons, the cycles. */
export function indexGearSources(data) {
  if (data?.byId instanceof Map) return data;
  const records = data?.records ?? [];
  const byId = new Map(records.map(record => [record.id, record]));
  const groupsRecord = byId.get('slot-groups');
  const slotGroup = new Map();
  for (const group of groupsRecord?.groups ?? []) for (const slot of group.slots) slotGroup.set(slotKey(slot), group);
  return {
    byId,
    slotGroup,
    unlisted: new Set((groupsRecord?.unlisted?.slots ?? []).map(slotKey)),
    unlistedReason: groupsRecord?.unlisted?.reason ?? 'No source names where this slot drops yet.',
    expeditions: records.filter(record => record.kind === 'expedition'),
    transcendence: records.filter(record => record.kind === 'transcendence'),
    cycles: new Map(records.filter(record => record.kind === 'cycle').map(record => [record.id, record])),
    sideMissions: byId.get('side-missions') ?? null
  };
}

/** The slot group (weapon, guard, armour, accessory, belt, arcana) a slot name belongs to, or null. */
export function slotGroupOf(slotName, data) {
  return indexGearSources(data).slotGroup.get(slotKey(slotName)) ?? null;
}

/** A cycle in short: { id, label, text, status } with the weekly reset it rolls over on, when it has one. */
export function cycleOf(id, data) {
  const index = indexGearSources(data);
  const cycle = index.cycles.get(id);
  if (!cycle) return null;
  const reset = cycle.resets ? index.cycles.get(cycle.resets) : null;
  return {
    id: cycle.id,
    label: cycle.label,
    text: cycle.text,
    status: cycle.status,
    reset: reset ? { label: reset.label, day: reset.day, timeUtc: reset.timeUtc, status: reset.status } : null
  };
}

/** Is a gate open: true, false, or null when the item level is not known. */
function gateOpen(gate, level, itemLevel) {
  if (Number.isFinite(gate.level) && Number.isFinite(level) && level < gate.level) return false;
  if (!Number.isFinite(gate.itemLevel)) return Number.isFinite(level) ? true : null;
  if (!Number.isFinite(itemLevel)) return null;
  return itemLevel >= gate.itemLevel;
}

/** "Fire Temple, Conquest: Unique gloves, entry item level 2,100": the reward said the way a player looks for it. */
export function highlightText(offer) {
  const where = offer.difficulty ? `${offer.source}, ${offer.difficulty}` : offer.source;
  const what = offer.reward;
  const gate = Number.isFinite(offer.gate?.itemLevel) ? `, entry item level ${grouped(offer.gate.itemLevel)}` : '';
  return `${where}: ${what}${gate}`;
}

/** Every Expedition drop for a slot group, on the difficulties whose loot is listed. */
export function dropsForGroup(groupId, data) {
  const index = indexGearSources(data);
  const out = [];
  for (const source of index.expeditions) {
    for (const difficulty of source.difficulties ?? []) {
      if (!Array.isArray(difficulty.loot)) continue;
      for (const item of difficulty.loot) if (item.group === groupId) out.push({ source, difficulty, item });
    }
  }
  return out;
}

/** How a worn piece compares with a drop: 'better' (the drop is an upgrade), 'same-or-worse', or 'unknown'. */
export function compareDrop(worn, drop, grades) {
  if (!worn || worn.empty) return 'better';
  const index = grades?.byCode instanceof Map ? grades : indexGrades(grades);
  const have = gradeInfo(worn.grade, index, worn.gradeName ?? null);
  const want = gradeInfo(drop.grade, index);
  if (have.order === null || want.order === null) return 'unknown';
  if (want.order > have.order) return 'better';
  if (want.order < have.order) return 'same-or-worse';
  if (!Number.isFinite(worn.level) || !Number.isFinite(drop.itemLevel)) return 'unknown';
  return drop.itemLevel > worn.level ? 'better' : 'same-or-worse';
}

const sortOffers = offers => offers.sort((a, b) => {
  const rank = offer => (offer.open === true ? 0 : offer.open === null ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) === 0) return (b.itemLevel ?? 0) - (a.itemLevel ?? 0) || (a.gate.itemLevel ?? 0) - (b.gate.itemLevel ?? 0);
  return (a.gate.itemLevel ?? 0) - (b.gate.itemLevel ?? 0) || (b.itemLevel ?? 0) - (a.itemLevel ?? 0);
});

function expeditionOffers(slot, group, { level, itemLevel, data, grades }) {
  const word = slotWord(slot.slot);
  const offers = [];
  for (const { source, difficulty, item } of dropsForGroup(group.id, data)) {
    const compare = compareDrop(slot, item, grades);
    if (compare === 'same-or-worse') continue;
    const gate = { level: difficulty.level ?? null, itemLevel: difficulty.entryItemLevel ?? null };
    const open = gateOpen(gate, level, itemLevel);
    const offer = {
      kind: 'expedition',
      sourceId: source.id,
      source: source.name,
      difficulty: difficulty.name,
      difficultyId: difficulty.id,
      item: item.name,
      grade: item.grade,
      itemLevel: item.itemLevel ?? null,
      reward: `${item.grade} ${word}`,
      slotsStatus: group.status,
      compare,
      gate,
      open,
      gap: open === false ? { level: Number.isFinite(level) && level < (gate.level ?? 0) ? gate.level - level : 0, itemLevel: Number.isFinite(itemLevel) && Number.isFinite(gate.itemLevel) ? Math.max(0, gate.itemLevel - itemLevel) : null } : null,
      dropRates: difficulty.dropRates ?? null,
      cycle: cycleOf(source.cycle, data),
      status: item.status
    };
    offer.highlight = highlightText(offer);
    offers.push(offer);
  }
  return sortOffers(offers);
}

function cubeOffer(slot, offers, data) {
  const cube = indexGearSources(data).byId.get('conquest-cube');
  if (!cube || !offers.length) return null;
  const conquest = offers.filter(offer => offer.difficultyId === 'conquest');
  if (!conquest.length) return null;
  const open = conquest.some(offer => offer.open === true) ? true : conquest.some(offer => offer.open === null) ? null : false;
  const offer = {
    kind: 'cube',
    sourceId: cube.id,
    source: cube.label,
    difficulty: null,
    reward: `pick a Unique ${slotWord(slot.slot)}`,
    text: cube.text,
    claimsNeeded: cube.claimsNeeded,
    choices: cube.choices,
    gate: { level: null, itemLevel: null },
    open,
    cycle: cycleOf(cube.cycle, data),
    status: cube.status
  };
  offer.highlight = `Expedition Conquest claims, ${cube.label}: ${offer.reward}`;
  return offer;
}

function arcanaOffers(slot, { level, itemLevel, data, grades }) {
  const index = indexGearSources(data);
  const gradeIndex = grades?.byCode instanceof Map ? grades : indexGrades(grades);
  const have = slot.empty ? 0 : gradeInfo(slot.grade, gradeIndex).order;
  const order = name => gradeInfo(name === 'Epic' ? 'Legend' : name, gradeIndex).order;
  const offers = [];
  for (const source of index.transcendence) {
    const better = (source.stages ?? []).filter(stage => have === null || stage.arcanaGrades.some(name => (order(name) ?? 0) > have));
    if (!better.length) continue;
    const gated = better.map(stage => ({ stage, open: gateOpen({ level: null, itemLevel: stage.entryItemLevel }, level, itemLevel) }));
    // The highest Stage the Daeva can enter now, else the first one that drops a better Arcana.
    const pick = [...gated].reverse().find(entry => entry.open === true) ?? gated[0];
    const top = pick.stage.arcanaGrades[pick.stage.arcanaGrades.length - 1];
    const gate = { level: null, itemLevel: pick.stage.entryItemLevel };
    const offer = {
      kind: 'transcendence',
      sourceId: source.id,
      source: source.name,
      difficulty: `Stage ${pick.stage.stage}`,
      item: `${(source.arcana ?? []).map(id => id[0].toUpperCase() + id.slice(1)).join(', ')} Arcana`,
      grade: top,
      itemLevel: null,
      reward: `${pick.stage.guaranteed ? `${pick.stage.guaranteed.toLowerCase()} guaranteed` : `Arcana up to ${top}`}`,
      arcana: source.arcana,
      gate,
      open: pick.open,
      gap: pick.open === false && Number.isFinite(itemLevel) ? { level: 0, itemLevel: gate.itemLevel - itemLevel } : null,
      cycle: cycleOf(source.cycle, data),
      status: source.status
    };
    offer.highlight = highlightText(offer);
    offers.push(offer);
  }
  return offers;
}

function beltOffers(data) {
  const index = indexGearSources(data);
  const stronghold = index.byId.get('strongholds');
  if (!stronghold) return [];
  const offer = {
    kind: 'stronghold',
    sourceId: stronghold.id,
    source: stronghold.name,
    difficulty: null,
    reward: 'Noble Belt Enhance Scrolls',
    text: stronghold.belt?.text ?? null,
    gate: { level: null, itemLevel: null },
    open: true,
    cycle: cycleOf(stronghold.cycle, data),
    status: stronghold.status
  };
  offer.highlight = `${stronghold.name}: ${offer.reward}`;
  return [offer];
}

/**
 * Where to get a better piece for one slot.
 * slot: a worn slot from the character model ({ slot, grade, level?, enchant, empty }); level and itemLevel: the Daeva's.
 * Returns { slot, word, group, status, offers, best, goal, pending, stray, lookFor, hold } where status is 'offers'
 * (something better drops), 'top' (nothing we know drops better), or 'pending' (no source covers the slot).
 */
export function whereToGet(slot, { level = null, itemLevel = null, data, grades = null, progression = null, build = null } = {}) {
  const index = indexGearSources(data);
  const gradeIndex = grades?.byCode instanceof Map ? grades : indexGrades(grades);
  const word = slotWord(slot?.slot);
  const group = slotGroupOf(slot?.slot, index);
  const uniqueFrom = uniqueGearLevel(progression);
  const have = slot && !slot.empty ? gradeInfo(slot.grade, gradeIndex, slot.gradeName ?? null) : null;
  const unique = gradeInfo('Unique', gradeIndex).order;
  const base = {
    slot: slot?.slot ?? null,
    slotPos: slot?.slotPos ?? null,
    word,
    group: group ? { id: group.id, name: group.name, status: group.status, note: group.note ?? null } : null,
    worn: slot && !slot.empty ? { name: slot.name, grade: have?.name ?? slot.grade ?? null, gradeId: have?.id ?? null, level: Number.isFinite(slot.level) ? slot.level : null, enchant: slot.enchant ?? 0, icon: slot.icon ?? null } : null,
    lookFor: build ? (classNeeds(build)?.order ?? []).slice(0, 3) : [],
    hold: Number.isFinite(level) && level < uniqueFrom ? { uniqueFrom, text: `Unique gear starts at Lv ${uniqueFrom}. Until then, wear what drops, save your Enhance Stones and level your crafting.` } : null,
    stray: null
  };
  // A piece below Unique that has been enhanced, past the level Unique gear starts: it will be replaced, and the stones go with it.
  if (have && have.order !== null && unique !== null && have.order < unique && (slot.enchant ?? 0) > 0 && Number.isFinite(level) && level >= uniqueFrom && group && !['belt', 'arcana'].includes(group.id)) {
    base.stray = { text: `This ${have.name} ${word} is at +${slot.enchant}. A Unique piece replaces it, so the stones spent on it are lost. Enhance only Unique gear.` };
  }
  if (!group) {
    const reason = index.unlisted.has(slotKey(slot?.slot)) ? index.unlistedReason : 'This slot is not in our source record yet.';
    return { ...base, status: 'pending', offers: [], best: null, goal: null, pending: { reason } };
  }
  let offers;
  if (group.id === 'arcana') offers = arcanaOffers(slot, { level, itemLevel, data: index, grades: gradeIndex });
  else if (group.id === 'belt') offers = beltOffers(index);
  else {
    offers = expeditionOffers(slot, group, { level, itemLevel, data: index, grades: gradeIndex });
    const cube = cubeOffer(slot, offers, index);
    if (cube) offers.push(cube);
  }
  const best = offers.find(offer => offer.open === true) ?? null;
  const goal = offers.find(offer => offer.open !== true && offer.kind !== 'cube' && (!best || (offer.itemLevel ?? 0) > (best.itemLevel ?? 0))) ?? null;
  return { ...base, status: offers.length ? 'offers' : 'top', offers, best, goal, pending: null };
}

/**
 * The whole Where to get it panel for a linked Daeva: every worn or empty slot, in the order to work on them, with what
 * drops better, plus the side-mission note (pending) and the weekly reset.
 */
export function gearSourcePlan(model, { data, grades = null, progression = null, build = null } = {}) {
  const index = indexGearSources(data);
  const gradeIndex = grades?.byCode instanceof Map ? grades : indexGrades(grades);
  const level = Number.isFinite(model?.profile?.level) ? model.profile.level : null;
  const itemLevel = Number.isFinite(model?.profile?.itemLevel) ? model.profile.itemLevel : null;
  const slots = (model?.gear ?? []).map(slot => whereToGet(slot, { level, itemLevel, data: index, grades: gradeIndex, progression, build }));
  const rank = entry => {
    const at = GROUP_ORDER.indexOf(entry.group?.id);
    return at >= 0 ? at : GROUP_ORDER.length;
  };
  slots.sort((a, b) => rank(a) - rank(b) || (a.slotPos ?? 99) - (b.slotPos ?? 99));
  const side = index.sideMissions;
  const reset = index.cycles.get('weekly-reset');
  return {
    level,
    itemLevel,
    itemLevelKnown: itemLevel !== null,
    uniqueFrom: uniqueGearLevel(progression),
    slots,
    upgrades: slots.filter(entry => entry.status === 'offers'),
    sideMissions: side ? { status: side.status, reason: isPending(side.rewards) ? side.rewards.reason : null } : null,
    weeklyReset: reset ? { day: reset.day, timeUtc: reset.timeUtc, text: reset.text, status: reset.status } : null
  };
}
