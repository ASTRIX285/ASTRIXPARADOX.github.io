/**
 * The Ascent Plan advisor for AION 2 (The Aetherium).
 *
 * Pure functions, no network. Input is the advisor data (data/advisor/), a class, a role and a
 * character level, plus the armory character model when one is loaded. Output is a plan a new
 * player can follow: what to do now, which skills to level and which Specialty perks to pick,
 * which stigmas to slot, the Daevanion order, the macro and what unlocks next.
 *
 * Every recommendation carries the refs of the sources it came from. Anything no source covers
 * stays pending with a reason. Nothing is invented here: the engine only selects and orders.
 */

import { nodeSkill, planRoleRoute, routePriorities } from './daevanion-planner.mjs';
import { gearRows, rankPointStats, statChains } from './stat-advisor.mjs';
import { orderMastery, pickSpecialties, planLevelSetup, weightsFor } from './level-planner.mjs';

export const AION2_CLASSES = Object.freeze(['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter']);

export const ROLES = Object.freeze({
  tank: 'Tank',
  healer: 'Healer',
  support: 'Support',
  dps: 'DPS'
});

export const ROLE_ORDER = Object.freeze(['tank', 'healer', 'support', 'dps']);

const pending = reason => ({ pending: true, reason });
export const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);

export const classSlug = className => String(className).toLowerCase();

/** Game-wide facts by id, from data/advisor/progression.json. */
export function indexProgression(progression) {
  const records = progression?.records ?? progression ?? [];
  return Object.fromEntries(records.map(record => [record.id, record]));
}

export function levelCap(progression) {
  const cap = indexProgression(progression)['level-cap']?.value;
  return Number.isInteger(cap) ? cap : 45;
}

/** Mechanics records by id, raw, from data/advisor/mechanics.json (indexMechanics below adds the confirmed flag and facts). */
const recordsById = mechanics => Object.fromEntries((mechanics?.records ?? mechanics ?? []).map(record => [record.id, record]));

/**
 * The highest level Mastery (Wisdom Stones) takes a skill to, from the mastery-cap rule in mechanics.json.
 * Null when the file is not loaded: the plan then has no cap to hold to and says nothing about one.
 */
export function masteryCap(mechanics) {
  const cap = recordsById(mechanics)['mastery-cap']?.value?.cap;
  return Number.isInteger(cap) && cap > 0 ? cap : null;
}

/** Where levels above the Mastery cap come from, as the mastery-cap rule lists them ({ kind, label }). */
export function levelSourcesBeyondCap(mechanics) {
  const list = recordsById(mechanics)['mastery-cap']?.value?.beyond;
  return Array.isArray(list) ? list.filter(item => item && typeof item.label === 'string') : [];
}

const joinOr = items => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);
const shortLabel = label => label.replace(/ skill nodes$/, ' nodes');

/**
 * The guide's level target against the Mastery cap. A target at or under the cap stays as written.
 * One above it is reworded: "Mastery 11, then +N from Daevanion nodes" when the build takes this
 * skill's +1 nodes and the boards that carry them cover the extra levels (daevanion-boards facts);
 * otherwise +N comes from the sources the mastery-cap rule names, with no claim about which.
 */
export function targetAgainstCap(target, { cap, viaNodes = false, nodeBoards = 0, beyond = [] } = {}) {
  const text = typeof target === 'string' ? target : null;
  if (text === null || cap === null) return text;
  // A target the build already words against the cap ("Mastery 11, then +4 from Daevanion nodes ...") stands as written.
  if (/Mastery \d+/.test(text)) return text;
  const levels = [...text.matchAll(/\d+/g)].map(match => Number(match[0]));
  const top = levels.length ? Math.max(...levels) : null;
  if (top === null || top <= cap) return text;
  const extra = top - cap;
  const daevanion = beyond.find(item => item.kind === 'daevanion')?.label ?? 'Daevanion skill nodes';
  if (viaNodes && extra <= nodeBoards) return `Mastery ${cap}, then +${extra} from ${shortLabel(daevanion)}`;
  const sources = beyond.map(item => shortLabel(item.label));
  return sources.length ? `Mastery ${cap}, then +${extra} from ${joinOr(sources)}` : `Mastery ${cap}, then +${extra}`;
}

/**
 * Where a skill at the Mastery cap gets its next +1: its Daevanion skill node on the first open board
 * where that node is not taken (boards carry their nodes once read), else the other sources the
 * mastery-cap rule names, as text. A board not read yet stops the search so the page can read it.
 */
export function nextLevelSource(skillName, boards, beyond = []) {
  const wanted = String(skillName).toLowerCase();
  const open = (boards ?? []).filter(board => board.open).sort((a, b) => (a.unlockLevel ?? 0) - (b.unlockLevel ?? 0));
  for (const board of open) {
    if (!Array.isArray(board.nodes)) return { kind: 'unread', board: { id: board.id, name: board.name }, text: `a Daevanion skill node (${board.name} not read yet)` };
    const node = board.nodes.find(item => (nodeSkill(item) ?? '').toLowerCase() === wanted);
    if (node && !node.taken) return { kind: 'daevanion', board: { id: board.id, name: board.name }, nodeId: node.nodeId, nodeName: node.name, text: `${node.name} on ${board.name}` };
  }
  const others = beyond.filter(item => item.kind !== 'daevanion').map(item => item.label);
  return others.length ? { kind: 'other', text: joinOr(others) } : { kind: 'pending', text: 'not known yet' };
}

/**
 * How a skill gets to a skill level above the Mastery cap, from the build's own data only: Mastery to the cap, then
 * one +1 from each Daevanion board that carries skill nodes, and only when the build names this skill's nodes
 * (daevanion.skillNodes). Anything past that, or a skill the build names no node for, is not reachable from a source
 * the build names, and says so. Null for a level Mastery reaches.
 */
export function reachSkillLevel(skillName, skillLevel, { cap = null, nodeSkills = [], nodeBoards = 0 } = {}) {
  if (cap === null || !Number.isInteger(skillLevel) || skillLevel <= cap) return null;
  const extra = skillLevel - cap;
  const viaNodes = nodeSkills.includes(skillName);
  if (viaNodes && extra <= nodeBoards) return { reachable: true, via: 'daevanion', nodes: extra, text: `Mastery ${cap}, then +${extra} from Daevanion nodes`, note: `Mastery ${cap}, then +${extra} from Daevanion nodes` };
  if (viaNodes) return { reachable: false, via: null, nodes: nodeBoards, text: `needs skill level ${skillLevel}: Mastery ${cap} and +${nodeBoards} from Daevanion nodes reach ${cap + nodeBoards}, and the build names no other source`, note: `Mastery ${cap} and +${nodeBoards} from Daevanion nodes reach ${cap + nodeBoards}, and the build names no other source` };
  return { reachable: false, via: null, nodes: 0, text: `needs skill level ${skillLevel}: Mastery stops at ${cap} and the build names no other source`, note: `Mastery stops at ${cap} and the build names no other source` };
}

/** Clamps any input to a whole level the global servers allow. */
export function clampLevel(level, progression) {
  const value = Math.round(Number(level));
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, 1), levelCap(progression));
}

/** The roles a class can play, main role first, with each build's status. */
export function rolesFor(builds) {
  const records = builds?.records ?? builds ?? [];
  return [...records]
    .sort((a, b) => Number(b.main) - Number(a.main) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map(build => ({ role: build.role, label: ROLES[build.role], main: Boolean(build.main), status: build.status ?? 'sourced', buildLabel: build.label }));
}

/* Teams (17 Oct 2026). A build may define team variants (teamVariants): the team the player is in changes the build's
   stigmas and swaps one own key. Rules live on the build as data; the engine only applies them. */
export const TEAMS = Object.freeze({ 'main-tank': 'Main tank, no Templar', 'off-tank-templar': 'Off-tank, with a Templar', solo: 'Solo or levelling' });
export const DEFAULT_TEAM = 'solo';

/** The teams a build defines, in TEAMS order: [{ id, label, swap }]. Empty when the build has no team variants. */
export function teamsFor(build) {
  const variants = build?.teamVariants;
  if (!variants || typeof variants !== 'object') return [];
  return Object.keys(TEAMS).filter(id => variants[id]).map(id => ({ id, label: variants[id].label ?? TEAMS[id], swap: variants[id].swap ?? null }));
}

/**
 * The build as played in a team: the variant's four stigmas in slot order, and its swap (out for in) on the own keys and
 * the opener. Returns { build, team }; team is null for a build with no variants. An unknown team falls back to Solo.
 */
export function applyTeam(build, team) {
  const variants = build?.teamVariants;
  if (!variants || typeof variants !== 'object') return { build, team: null };
  const id = variants[team] ? team : variants[DEFAULT_TEAM] ? DEFAULT_TEAM : Object.keys(variants)[0];
  const variant = variants[id];
  const out = structuredClone(build);
  const swapName = name => (variant.swap && name === variant.swap.out ? variant.swap.in : name);
  if (out.stigmas && !isPending(out.stigmas) && Array.isArray(variant.stigmas)) {
    out.stigmas.slots = out.stigmas.slots.map((slot, index) => ({ ...slot, name: variant.stigmas[index] ?? slot.name }));
    const inSlots = new Set(out.stigmas.slots.map(slot => slot.name));
    out.stigmas.alternatives = (out.stigmas.alternatives ?? []).filter(alt => !inSlots.has(alt.name));
  }
  if (out.macro && typeof out.macro === 'object') {
    out.macro.ownKeys = (out.macro.ownKeys ?? []).map(item => (Array.isArray(item.stack) ? { ...item, stack: item.stack.map(swapName) } : { ...item, name: swapName(item.name), ...(variant.swap && item.name === variant.swap.out ? { why: variant.swap.why } : {}) }));
    out.macro.opener = (out.macro.opener ?? []).map(swapName);
  }
  return { build: out, team: { id, label: variant.label ?? TEAMS[id], swap: variant.swap ?? null, refs: variant.refs ?? [], options: teamsFor(build) } };
}

/** The build for a role, or the class's main build when the role is not one it plays. */
export function pickBuild(builds, role) {
  const records = builds?.records ?? builds ?? [];
  return records.find(build => build.role === role) ?? records.find(build => build.main) ?? records[0] ?? null;
}

/** The build a page judges by: the role the player picked (else the class's main build), as played in their team. */
export function buildFor(builds, { role = null, team = null } = {}) {
  const picked = pickBuild(builds, role);
  return picked ? applyTeam(picked, team).build : null;
}

/** The source list a build cites, keyed by ref, for footnotes. */
export function sourcesOf(build) {
  const map = new Map();
  for (const source of build?.provenance ?? []) if (source.ref) map.set(source.ref, source);
  return map;
}

const skillIndex = (skills, className) => {
  const records = skills?.records ?? skills ?? [];
  return new Map(records.filter(record => record.class === className).map(record => [record.name, record]));
};

const modelSkill = (model, name) => model?.skills?.find(skill => skill.name === name) ?? null;

/** Specialty slots open at these skill levels (three sources; not yet checked in game). */
function specialtySlotLevels(facts) {
  const value = facts['specialty-perks']?.value?.slotLevels;
  return Array.isArray(value) ? value : [8, 12, 20];
}

/** Core skills in priority order with unlock state, current level and the next Specialty step. */
function planSkills(build, catalogue, level, model, facts, capRule) {
  const slotLevels = specialtySlotLevels(facts);
  const picksBySkill = new Map((build.specialties ?? []).map(entry => [entry.skill, entry.picks]));
  const nodeSkills = daevanionSkillNodes(build);
  return (build.coreSkills ?? []).map(core => {
    const info = catalogue.get(core.name) ?? null;
    const unlockLevel = info && !isPending(info.unlockLevel) ? info.unlockLevel : null;
    const unlocked = unlockLevel === null ? null : level >= unlockLevel;
    const owned = modelSkill(model, core.name);
    const skillLevel = owned?.acquired ? owned.skillLevel : null;
    const nextSlot = skillLevel === null ? slotLevels[0] : slotLevels.find(threshold => threshold > skillLevel) ?? null;
    // A pick above the Mastery cap carries how the build gets there, or that it names no way.
    const picks = (picksBySkill.get(core.name) ?? []).map(pick => ({ ...pick, reach: reachSkillLevel(core.name, pick.skillLevel, { ...capRule, nodeSkills }) }));
    return {
      name: core.name,
      priority: core.priority,
      target: core.target,
      targetText: targetAgainstCap(core.target, { ...capRule, viaNodes: nodeSkills.includes(core.name) }),
      why: core.why,
      refs: core.refs,
      unlockLevel,
      unlocked,
      cooldownSeconds: info ? info.cooldownSeconds : pending('This skill is not in the skill catalogue yet.'),
      summary: info ? info.summary : null,
      perks: info && !isPending(info.specialties) ? info.specialties : [],
      picks,
      skillLevel,
      equipped: owned ? Boolean(owned.equipped) : null,
      nextSpecialtySlot: nextSlot,
      perksOpen: skillLevel === null ? [] : picks.filter(pick => pick.skillLevel <= skillLevel)
    };
  });
}

/**
 * The in-game badge of one Specialty pick (Miguel, 25 Oct 2026: show the player the icon they pick in game). The badge
 * is keyed by the game's perk id, the skill's game id plus 10 for each position in the skill's Specialty list (1 to 5,
 * the order the game lists them; checked against every skill in the catalogue). Only a pick that matches exactly one
 * Specialty line gets a badge: two lines at its level and no matching text means no badge, never a guess. Null when
 * the skill has no game id or the data names no badge source (icons/<class>.json, perkIconBase).
 */
export function specialtyIcon(skill, pick, gameSkill) {
  if (!Number.isInteger(gameSkill?.id) || !gameSkill.perkIconBase) return null;
  const perks = Array.isArray(skill?.perks) ? skill.perks : [];
  const atLevel = perks.filter(perk => perk.skillLevel === pick.skillLevel);
  const perk = atLevel.length === 1 ? atLevel[0] : atLevel.find(item => item.text === (pick.perk ?? pick.pick));
  if (!perk) return null;
  return `${gameSkill.perkIconBase}${gameSkill.id + 10 * (perks.indexOf(perk) + 1)}.webp`;
}

/**
 * Specialty targets (Miguel, 25 Oct 2026): for each key skill, every Specialty pick the build uses in skill-level order,
 * whether the Daeva has it open, and the skill level that puts the skill at its maximum for the build (the highest pick),
 * with how it is reached: Mastery up to the cap, then Daevanion nodes. A level the build's sources cannot reach says
 * exactly what is missing; nothing is assumed. skills: plan.skills. cap: the Mastery cap (mechanics, mastery-cap).
 */
export function specialtyTargets(skills, cap = null, gameIcons = new Map()) {
  return (skills ?? []).filter(skill => skill.picks?.length).map(skill => {
    const picks = [...skill.picks].sort((a, b) => a.skillLevel - b.skillLevel).map(pick => ({
      skillLevel: pick.skillLevel, pick: pick.pick, perk: pick.perk ?? pick.pick,
      open: skill.skillLevel === null ? null : skill.skillLevel >= pick.skillLevel,
      reach: pick.reach ?? null,
      icon: specialtyIcon(skill, pick, gameIcons.get(skill.name))
    }));
    const top = picks.at(-1);
    const reachable = !top.reach || top.reach.reachable !== false;
    const route = !top.reach ? `Mastery to Lv ${top.skillLevel}` : top.reach.reachable ? top.reach.text : null;
    // The highest level the build's own sources reach when the top pick is beyond it: the Mastery cap plus the Daevanion
    // nodes that raise this skill (reachSkillLevel gives their count; 0 when no node raises it).
    const best = reachable ? top.skillLevel : (cap ?? 0) + (top.reach?.nodes ?? 0);
    return {
      name: skill.name, priority: skill.priority, skillLevel: skill.skillLevel, picks, target: top.skillLevel, reachable, route,
      short: reachable ? null : { reaches: best, viaNodes: (top.reach?.nodes ?? 0) > 0, missing: top.reach?.text ?? null },
      next: skill.skillLevel === null ? picks[0] : picks.find(pick => pick.skillLevel > skill.skillLevel) ?? null
    };
  });
}

/** Stigma slots open at this level, with the build's pick for each. */
function planStigmas(build, level, model, facts, gameIcons = new Map()) {
  if (isPending(build.stigmas)) return { pending: build.stigmas };
  const unlock = facts['stigma-unlock']?.value?.level ?? 22;
  const slotLevels = facts['stigma-slots']?.value ?? [22, 27, 32, 37];
  const owned = model?.skills?.filter(skill => skill.category === 'Dp') ?? null;
  const acquired = owned ? owned.filter(skill => skill.acquired).map(skill => skill.name) : null;
  const iconOf = name => owned?.find(skill => skill.name === name)?.icon ?? gameIcons.get(name)?.icon ?? null;
  const slots = build.stigmas.slots.map((slot, index) => ({
    ...slot,
    slotLevel: slotLevels[index] ?? slot.slotLevel,
    open: level >= (slotLevels[index] ?? slot.slotLevel),
    acquired: acquired ? acquired.includes(slot.name) : null,
    equipped: owned ? Boolean(owned.find(skill => skill.name === slot.name)?.equipped) : null,
    icon: iconOf(slot.name)
  }));
  return {
    unlockLevel: unlock,
    quest: facts['stigma-unlock']?.value?.quest ?? null,
    open: slots.filter(slot => slot.open).length,
    slots,
    // A swap already equipped is not offered again (the equipped line says it once).
    alternatives: (build.stigmas.alternatives ?? []).filter(alt => !owned?.some(skill => skill.equipped && skill.name === alt.name)).map(alt => ({ ...alt, icon: iconOf(alt.name) })),
    confidence: build.stigmas.confidence,
    note: build.stigmas.note ?? null,
    refs: build.stigmas.refs,
    noneAcquired: acquired ? acquired.length === 0 : null,
    // What the Daeva has equipped now (armory), each with one verdict, so the screen never argues with itself.
    equippedNow: owned ? judgeEquipped(owned.filter(skill => skill.equipped), slots, build.stigmas.alternatives ?? []) : null
  };
}

/**
 * One verdict per equipped stigma: 'keep' (a build stigma), 'swap' (one of the build's listed swaps: keep it or switch
 * back) or 'out' (in neither list: swap it out). A swap or an out takes the place of the next open build slot whose
 * stigma is not equipped, in slot order, so the line can name that slot and the stigma it stands in for. The public
 * data does not say which slot a stigma sits in, so this is the build slot it replaces, not a position read in game.
 */
function judgeEquipped(equipped, slots, alternatives) {
  const inBuild = new Set(slots.map(slot => slot.name));
  const alts = new Set(alternatives.map(alt => alt.name));
  const free = slots.map((slot, index) => ({ slot, index })).filter(item => item.slot.open && item.slot.equipped === false);
  return equipped.map(skill => {
    // The stigma's level from the skill data, shown beside it as the official page does. It plays no part in the verdict.
    const base = { name: skill.name, icon: skill.icon ?? null, level: Number.isFinite(skill.skillLevel) ? skill.skillLevel : null };
    if (inBuild.has(skill.name)) return { ...base, verdict: 'keep', slot: slots.findIndex(slot => slot.name === skill.name) + 1, for: null };
    const place = free.shift() ?? null;
    return { ...base, verdict: alts.has(skill.name) ? 'swap' : 'out', slot: place ? place.index + 1 : null, for: place ? place.slot.name : null, why: alternatives.find(alt => alt.name === skill.name)?.why ?? null };
  });
}

/** The skills whose +1 Daevanion nodes a build takes first, in order (the core skills when the build names none). */
export function daevanionSkillNodes(build) {
  return (!isPending(build.daevanion) && build.daevanion.skillNodes) || (build.coreSkills ?? []).map(skill => skill.name);
}

function planBoards(build, level, model, facts, cap = null, { points = null } = {}) {
  const boards = (facts['daevanion-boards']?.value ?? []).map(board => {
    const live = model?.daevanion?.find(item => item.id === board.id || item.name === board.name) ?? null;
    return {
      ...board,
      // The character's own board id: Asmodian boards are 31 to 36, the facts list the Elyos ids.
      id: live?.id ?? board.id,
      open: live ? Boolean(live.open) : level >= board.unlockLevel,
      nodesTaken: live ? live.nodesTaken : null,
      nodesTotal: live ? live.nodesTotal : null,
      // The board's node grid once the page has read it (armory-adapter adaptCharacter boards), else null.
      nodes: Array.isArray(live?.nodes) ? live.nodes : null
    };
  });
  const budget = facts['daevanion-budget']?.value ?? null;
  const priorities = isPending(build.daevanion) ? [] : routePriorities(build.daevanion);
  // The route inside the budget, once a Daeva's boards have been read (every open board needs its nodes; else it stops there).
  const roleRoute = model && priorities.length ? planRoleRoute({ boards, priorities, budget, cap, skills: daevanionSkillNodes(build), have: Number.isFinite(points) ? points : null }) : null;
  return {
    boards,
    budget: budget ? { points: budget.points, boardCost: budget.boardCost ?? {}, status: facts['daevanion-budget'].status ?? null } : null,
    nodePriorities: priorities,
    roleRoute,
    priorities: isPending(build.daevanion) ? build.daevanion : build.daevanion.priorities,
    // Skills whose +1 nodes the board planner routes to first, in order (falls back to the core skills).
    skillNodes: daevanionSkillNodes(build),
    refs: isPending(build.daevanion) ? [] : build.daevanion.refs,
    status: isPending(build.daevanion) ? null : build.daevanion.status ?? null,
    general: facts['daevanion-priority'] ?? null
  };
}

/** Milestones still ahead of this level, soonest first: skills, boards, stigma slots, dungeons. */
function upcoming(level, skills, stigmas, boards, facts) {
  const items = [];
  for (const skill of skills) if (skill.unlockLevel && skill.unlockLevel > level) items.push({ level: skill.unlockLevel, kind: 'skill', text: `${skill.name} unlocks. ${String(skill.why).replace(/^Unlocks at Lv \d+\.\s*/, '')}` });
  if (!stigmas.pending) {
    stigmas.slots.forEach((slot, index) => {
      if (!slot.open) items.push({ level: slot.slotLevel, kind: 'stigma', text: index === 0 ? `Stigmas open (quest ${stigmas.quest ?? 'at Lv 22'}). Slot ${slot.name} first.` : `Stigma slot ${index + 1} opens. Slot ${slot.name}.` });
    });
  }
  for (const board of boards.boards) if (!board.open && board.unlockLevel > level) items.push({ level: board.unlockLevel, kind: 'daevanion', text: `${board.name} Daevanion board opens (${board.focus}).` });
  for (const dungeon of facts.dungeons?.value ?? []) if (dungeon.level > level) items.push({ level: dungeon.level, kind: 'dungeon', text: `${dungeon.name} opens for groups.` });
  return items.sort((a, b) => a.level - b.level || a.kind.localeCompare(b.kind));
}

/**
 * The one level order: which key skills to level next and how far, in the build's priority order. The Mastery screen's
 * "Level these next", its guide, the next moves and the Daeva Card's first move all read this list.
 */
export function levelOrder(plan) {
  return Array.isArray(plan?.mastery?.spend) ? plan.mastery.spend : [];
}

/* Item grades and enchant advice. The grade record (data/advisor/grades.json) gives the game's name, order, colour and
   cap for the code the official data sends (its "Legend" is the game's Epic). The item's own maxEnchantLevel always
   beats the grade's cap; the cap is only the fallback, said as "about" until the item detail is read. The Gear page,
   the item card and the plan's gear moves all read enchantAdvice, so a tile's flag and the move that names it agree. */

/** The level from which Common and Rare gear is replaced, not enchanted: the progression fact when there is one, else Lv 20. */
/** The level Unique gear starts at (Miguel, in game, 18 Oct 2026; progression.json unique-gear-level). */
export const UNIQUE_GEAR_LEVEL = 35;
/** Every enchant step up to this level succeeds (mechanics.json enchant-rates). */
export const SAFE_ENCHANT = 10;
/** Slots that go past +10 only on these (the rest stop at +10: past it every step can fail and the cost climbs). */
const WEAPON_AND_GUARD = new Set(['MAINHAND', 'SUBHAND']);
/** Slots with their own cap at every grade (grades.json slot-caps). */
const OWN_CAP_SLOTS = new Set(['AMULET', 'BELT']);
/** Slots the grade rule does not cover: runes enhance their own way (a failure can drop a level) and Arcana have their own small cap. */
const OWN_RULE_SLOTS = /^(RUNE|ARCANA)\d*$/;
const slotKey = slot => String(slot?.slot ?? '').toUpperCase().replace(/[\s_]/g, '');

/** Grades by the code the data sends, plus the slot caps. */
export function indexGrades(grades) {
  const records = grades?.records ?? [];
  const byCode = new Map();
  for (const record of records) {
    if (typeof record.code === 'string') byCode.set(record.code, record);
  }
  const caps = records.find(record => record.id === 'slot-caps')?.slots ?? {};
  return { byCode, slotCaps: Object.fromEntries(Object.entries(caps).map(([name, cap]) => [name.toUpperCase(), cap.value])) };
}
const gradeIndexOf = grades => (grades?.byCode instanceof Map ? grades : indexGrades(grades));

/**
 * One grade in the game's words: { id, name, order, colour, cap, known }. gradeName (the item detail's client name)
 * wins over the record's name. A code no record knows is never shown raw if it is "Legend".
 */
export function gradeInfo(code, grades, gradeName = null) {
  const record = gradeIndexOf(grades).byCode.get(code) ?? null;
  const fallback = code === 'Legend' ? 'Epic' : (typeof code === 'string' && code ? code : 'Unknown');
  return {
    id: record?.id ?? null,
    name: (typeof gradeName === 'string' && gradeName) ? gradeName : record?.name.value ?? fallback,
    order: Number.isFinite(record?.order?.value) ? record.order.value : null,
    colour: record?.colour?.value ?? null,
    cap: Number.isFinite(record?.cap?.value) ? record.cap.value : null,
    known: Boolean(record)
  };
}

/** The enchant cap of one worn item: { cap, about } (about: from the grade table, the item detail not read yet). */
export function enchantCap(slot, grades) {
  if (Number.isFinite(slot.maxEnchant)) return { cap: slot.maxEnchant, about: false };
  const index = gradeIndexOf(grades);
  const own = index.slotCaps[slotKey(slot)];
  if (Number.isFinite(own)) return { cap: own, about: true };
  const cap = gradeInfo(slot.grade, index).cap;
  return { cap, about: true };
}

export function uniqueGearLevel(progression) {
  const fact = indexProgression(progression)['unique-gear-level'];
  return Number.isFinite(fact?.value) ? fact.value : UNIQUE_GEAR_LEVEL;
}

/**
 * What to do with one worn item, by its grade. Returns null for an empty slot, else
 * { action, from, to, cap, about, costly, why, flag, grade }:
 *   enchant  to the target (to): Unique to +10 first, then +15 only on the weapon and guard (costly);
 *            amulets and belts to their own cap; Common and Rare only before the early-gear level;
 *   replace  Epic (never past +5), and Common and Rare from the early-gear level;
 *   full     at the cap; done: a Unique item at +10 that is not the weapon or guard (no flag);
 *   null     a grade the data does not know yet (no advice, never a guess).
 */
export function enchantAdvice(slot, { level = 1, grades = null, progression = null } = {}) {
  if (!slot || slot.empty) return null;
  const index = gradeIndexOf(grades);
  const grade = gradeInfo(slot.grade, index, slot.gradeName ?? null);
  const { cap, about } = enchantCap(slot, index);
  const from = Number.isFinite(slot.enchant) ? slot.enchant : 0;
  const base = { from, to: null, cap, about, costly: false, grade };
  const capText = `${about ? 'about ' : ''}+${cap}`;
  if (OWN_RULE_SLOTS.test(slotKey(slot))) {
    return { ...base, action: null, flag: null, why: 'Runes and Arcana enhance their own way.' };
  }
  if (!Number.isFinite(cap) || grade.order === null) {
    return { ...base, action: null, flag: null, why: `No enchant step for the ${grade.name} grade.` };
  }
  const full = { ...base, action: 'full', to: cap, flag: 'FULL', why: `Fully enchanted: +${from} is its cap.` };
  const enchantTo = (to, why, costly = false) => ({ ...base, action: 'enchant', to, costly, flag: `ENCHANT +${from} to +${to}`, why });
  if (OWN_CAP_SLOTS.has(slotKey(slot))) {
    return from >= cap ? full : enchantTo(cap, `${slotLabelOf(slot)}s go to ${capText} at every grade. They use their own enhance scroll.`);
  }
  // Below Unique (Miguel, 18 Oct 2026): never enhanced. Before Unique gear starts, wear it and save; after, replace it.
  const uniqueOrder = index.byCode.get('Unique')?.order?.value ?? Infinity;
  if (grade.order < uniqueOrder) {
    const from35 = uniqueGearLevel(progression);
    if (level < from35) {
      return { ...base, action: 'hold', flag: null, why: `Wear it, but do not enhance it: no Unique gear drops before Lv ${from35}, and this piece will be replaced. Save the stones, and gather and level your crafting instead.` };
    }
    return { ...base, action: 'replace', flag: 'REPLACE', why: grade.id === 'epic' ? 'Do not enhance Epic gear. Replace it with a Unique piece, from a drop or a craft.' : `${grade.name} gear is for the early levels. Replace it with a Unique piece, from a drop or a craft.` };
  }
  if (grade.order >= (index.byCode.get('Unique')?.order?.value ?? Infinity)) {
    if (from >= cap) return full;
    const safe = Math.min(SAFE_ENCHANT, cap);
    if (from < safe) return enchantTo(safe, `${grade.name} gear is worth enchanting. Every step to +${safe} succeeds.`);
    if (WEAPON_AND_GUARD.has(slotKey(slot))) {
      return enchantTo(cap, `Past +${SAFE_ENCHANT} each step can fail and costs a lot of Kina and Enhance Stones. Worth it on the weapon and guard only, the weapon first.`, true);
    }
    return { ...base, action: 'done', to: safe, flag: null, why: `+${from} reached. Past +${SAFE_ENCHANT} only pays on the weapon and guard.` };
  }
  return { ...base, action: null, flag: null, why: `No enchant step for the ${grade.name} grade.` };
}
const slotLabelOf = slot => String(slot.slot ?? '').toLowerCase().replace(/^./, c => c.toUpperCase());

/** The chance of each enchant step from one level to another, from mechanics.json enchant-rates: [{ to, rate }]. */
export function enchantSteps(from, to, rule) {
  const safeTo = rule?.value?.safeTo ?? SAFE_ENCHANT;
  const rates = rule?.value?.rates ?? {};
  const steps = [];
  for (let level = from + 1; level <= to; level += 1) steps.push({ to: level, rate: level <= safeTo ? 100 : (Number.isFinite(rates[level]) ? rates[level] : null) });
  return steps;
}

/**
 * The plan's gear moves, specific and in order: one per Unique item to enchant (the weapon first), amulets and belts
 * to their cap, Epic pieces to replace, Common and Rare to replace, then the costly steps past +10 (weapon, then guard).
 * Each move names its slots (slotPos) and an id, which is also the Gear page's ring (#enchant-1, #replace-epic).
 */
export function gearMoves(model, { level = 1, grades = null, progression = null } = {}) {
  if (!model) return [];
  const moves = [];
  const add = (rank, id, title, detail, slots) => moves.push({ rank, id, title, detail, slots: slots.map(slot => slot.slotPos), ring: id });
  const empty = model.gear.filter(slot => slot.empty);
  if (empty.length) add(10, 'empty', `Fill ${empty.length} empty gear ${empty.length === 1 ? 'slot' : 'slots'}`, `Nothing is worn in: ${empty.map(slot => slot.slot.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}. Any item beats an empty slot.`, empty);
  if (!grades) return moves;
  const advised = model.gear.filter(slot => !slot.empty).map(slot => ({ slot, advice: enchantAdvice(slot, { level, grades, progression }) }));
  const of = test => advised.filter(({ advice }) => advice && test(advice));
  const weaponFirst = (a, b) => (slotKey(a.slot) === 'MAINHAND' ? -1 : slotKey(b.slot) === 'MAINHAND' ? 1 : a.slot.slotPos - b.slot.slotPos);
  const one = ({ slot, advice }, rank, detail) => add(rank, `enchant-${slot.slotPos}`, `Enchant ${slot.name} +${advice.from} to +${advice.to}`, detail, [slot]);
  const plain = of(advice => advice.action === 'enchant' && !advice.costly);
  // Unique (and higher) to +10: the weapon and guard each get their own move, the rest one move when there are several.
  const uniqueSafe = plain.filter(({ slot, advice }) => advice.grade.id !== 'common' && advice.grade.id !== 'rare' && !OWN_CAP_SLOTS.has(slotKey(slot))).sort(weaponFirst);
  const keySlots = uniqueSafe.filter(({ slot }) => WEAPON_AND_GUARD.has(slotKey(slot)));
  const otherSafe = uniqueSafe.filter(({ slot }) => !WEAPON_AND_GUARD.has(slotKey(slot)));
  keySlots.forEach((entry, n) => one(entry, 30 + n / 10, `Every step succeeds. ${entry.advice.grade.name} gear goes on to +${entry.advice.cap} later.`));
  if (otherSafe.length === 1) one(otherSafe[0], 30.5, 'Every step succeeds.');
  else if (otherSafe.length) add(30.5, 'enchant-unique', `Enchant ${otherSafe.length} ${otherSafe[0].advice.grade.name} pieces to +${SAFE_ENCHANT}`, `Every step succeeds. ${otherSafe.map(({ slot }) => slot.name).join(', ')}.`, otherSafe.map(({ slot }) => slot));
  // Amulets and belts to their own cap.
  plain.filter(({ slot }) => OWN_CAP_SLOTS.has(slotKey(slot))).forEach((entry, n) => one(entry, 31 + n / 10, `${entry.advice.to - entry.advice.from === 1 ? 'One step' : `${entry.advice.to - entry.advice.from} steps`} to its +${entry.advice.cap} cap. It uses its own enhance scroll.`));
  // Before Unique gear starts (Miguel, 18 Oct 2026): nothing is enhanced but the belt and amulet. One move says so and
  // points at what to do instead: gather and level the crafting professions.
  const held = of(advice => advice.action === 'hold');
  if (held.length) {
    const from35 = uniqueGearLevel(progression);
    add(31.5, 'save-stones', `Save your Enhance Stones until Lv ${from35}`, `No Unique gear drops before Lv ${from35}, and the ${held.length === 1 ? 'piece' : `${held.length} pieces`} you wear now will be replaced. Do not enhance ${held.length === 1 ? 'it' : 'them'}. Gather materials and level your crafting instead, so you are ready to build Unique gear.`, held.map(({ slot }) => slot));
  }
  // Replace: Epic pieces, then Common and Rare.
  const replace = of(advice => advice.action === 'replace');
  const epic = replace.filter(({ advice }) => advice.grade.id === 'epic');
  const low = replace.filter(({ advice }) => advice.grade.id !== 'epic');
  const replaceMove = (rank, id, list) => add(rank, id,
    list.length === 1 ? `Replace ${list[0].slot.name} with a Unique piece` : `Replace ${list.length} ${namesOf(list)} pieces with Unique gear`,
    `${list[0].advice.grade.id === 'epic' ? 'Do not enhance Epic gear.' : 'Do not enchant them: the stones stay with the old item.'} Replace with a Unique piece, from a drop or a craft. ${list.map(({ slot }) => slot.name).join(', ')}.`,
    list.map(({ slot }) => slot));
  if (epic.length) replaceMove(32, 'replace-epic', epic);
  if (low.length) replaceMove(33, 'replace-early', low);
  // The costly steps past +10: the weapon, then the guard.
  of(advice => advice.action === 'enchant' && advice.costly).sort(weaponFirst).forEach((entry, n) => one(entry, 34 + n / 10,
    `Big Kina and Enhance Stone cost. Each step past +${SAFE_ENCHANT} can fail; a failure costs the attempt, never a level.${slotKey(entry.slot) === 'MAINHAND' ? '' : ' Do it after the weapon.'}`));
  return moves;
}
const namesOf = list => [...new Set(list.map(({ advice }) => advice.grade.name))].join(' and ');

/**
 * The ranked "do this now" list. Fixes read from the character come first (they are about this exact
 * character), then the build steps that apply at this level.
 */
function nowList(level, build, skills, stigmas, boards, model, mastery = null, skillBar = null, { grades = null, progression = null, setup = null } = {}) {
  const list = [];
  const push = (rank, title, detail, refs = [], kind = 'build', view = 'mastery', extra = {}) => list.push({ rank, title, detail, refs, kind, view, ...extra });

  if (model) {
    // The gear moves come from the grade rule (gearMoves), the same one the Gear page flags tiles with.
    for (const move of gearMoves(model, { level, grades, progression })) push(move.rank, move.title, move.detail, [], 'armory', 'gear', { slots: move.slots, ring: move.ring, move: move.id });
    // One board only (Miguel, 17 Oct 2026): the role route's current board, one board at a time in route order, inside the
    // budget. The move carries the character's own board id (Elyos 11 to 16, Asmodian 31 to 36), so Show me opens it.
    const move = daevanionMove(boards);
    if (move) push(20, move.title, move.detail, boards.refs, 'armory', 'daevanion', { board: move.board.id, boards: [{ id: move.board.id, name: move.board.name }] });
    if (!stigmas.pending && level >= stigmas.unlockLevel && stigmas.noneAcquired) push(15, 'Do the stigma quest', `You are Lv ${level} and no stigma is unlocked. Finish ${stigmas.quest ?? 'the stigma quest'} to open them.`, stigmas.refs, 'armory', 'stigma');
    // A skill the Daeva has but has not equipped, said by its place on the bar ("Put Overhead Slam above Rage Burst on stack A": row 1 sits above row 0).
    const placeOf = name => {
      for (const stack of Object.values(skillBar?.stacks ?? {})) { const at = stack.skills.findIndex(item => item.name === name); if (at >= 0) return { key: stack.key, row: stack.skills[at].row, below: at ? stack.skills[at - 1].name : null }; }
      return null;
    };
    for (const skill of skills) {
      if (!(skill.unlocked && skill.skillLevel !== null && skill.equipped === false)) continue;
      const place = placeOf(skill.name);
      const where = skillBar?.stacks?.[place?.key]?.name ? `the ${skillBar.stacks[place.key].name.toLowerCase()}` : place ? keyPhrase(place.key) : null;
      if (place) push(25, `Put ${skill.name}${place.below ? ` above ${place.below}` : ''} on ${where}`, place.below ? `You have it but it is not equipped. Row ${place.row} of ${where} in the build's bar.` : `You have it but it is not equipped. It goes on ${where}.`, skill.refs, 'armory', 'skill-bar', { key: place.key, row: place.row });
      else push(25, `Put ${skill.name} on your skill bar`, 'You have it but it is not equipped.', skill.refs, 'armory', 'mastery');
    }
  }

  // The level move reads the one level order (levelOrder: the Mastery "Level these next" list), so this screen,
  // Mastery, its guide and the Daeva Card's first move always name the same skill first.
  const order = levelOrder({ mastery });
  const cap = mastery?.cap ?? null;
  if (order.length && model) {
    const step = order[0];
    const focus = skills.find(skill => skill.name === step.name) ?? null;
    const refs = focus?.refs ?? [];
    const target = focus ? ` Target: ${focus.targetText ?? focus.target}.` : '';
    push(40, `Level ${step.name}${step.from !== null ? ` (now Lv ${step.from})` : ''}`, `${focus?.why ?? ''}${target} ${step.from !== null ? `Lv ${step.from} to ${step.to}` : `Up to Lv ${step.to}`}: that ${step.reason}.`.trim(), refs);
    // A key skill at the cap: its next +1 is a Daevanion node, so the move opens that board on that node.
    for (const entry of mastery?.atCap ?? []) {
      if (entry.next.kind !== 'daevanion') continue;
      push(42, `Take the ${entry.name} +1 node on ${entry.next.board.name}`, `${entry.name} is at the Mastery cap (${cap}). Its next level comes from the Daevanion node ${entry.next.nodeName}.`, entry.refs, 'build', 'daevanion', { board: entry.next.board.id, node: entry.next.nodeId });
    }
  } else if (order.length) {
    const named = order.map(step => skills.find(skill => skill.name === step.name)).filter(Boolean);
    push(40, `Level your skills in this order: ${order.map(step => step.name).join(', ')}`, 'Spend Wisdom Stones on the first one until it reaches skill Lv 8, which opens its first Specialty perk, then move down the list.', named.flatMap(skill => skill.refs));
  }
  for (const skill of skills) {
    const due = skill.picks.filter(pick => skill.skillLevel !== null && pick.skillLevel <= skill.skillLevel);
    if (due.length) push(45, `Pick ${skill.name} Specialty: ${due.map(pick => pick.pick).join(', ')}`, `Your ${skill.name} is Lv ${skill.skillLevel}, so ${due.length === 1 ? 'this perk is' : 'these perks are'} open.`, due.flatMap(pick => pick.refs));
  }
  // The main line for this level, when it is not yet the build's full line: the level planner put a stand-in in or left
  // a skill out, so the bar to set up now differs from the one at the cap.
  const line = skillBar?.stacks?.B?.skills?.length ? skillBar.stacks.B : skillBar?.stacks?.A;
  if (setup?.planned && line?.skills?.length && (line.skills.some(skill => skill.standIn) || setup.later.some(item => item.where !== 'own key'))) {
    push(47, `Set your ${String(line.name ?? 'stack').toLowerCase()}: ${line.skills.map(skill => skill.name).join(', ')}`, `What your Lv ${level} bar can fire now.${setup.later.length ? ` ${setup.later[0].name} joins ${setup.later[0].unlockLevel ? `at Lv ${setup.later[0].unlockLevel}` : 'later'}.` : ''}`, [], 'build', 'skill-bar', { key: line.key });
  }
  if (!stigmas.pending && stigmas.open) push(50, `Slot ${stigmas.slots.filter(slot => slot.open).map(slot => slot.name).join(', ')}`, `You have ${stigmas.open} stigma ${stigmas.open === 1 ? 'slot' : 'slots'} open at Lv ${level}.`, stigmas.refs, 'build', 'stigma');
  if (!model) {
    const open = boards.boards.filter(board => board.open);
    if (open.length && Array.isArray(boards.priorities)) push(55, `Daevanion: ${boards.priorities[0]}`, `Open boards at Lv ${level}: ${open.map(board => board.name).join(', ')}.`, boards.refs, 'build', 'daevanion');
  }
  return list.sort((a, b) => a.rank - b.rank).map(({ rank, ...item }, index) => ({ step: index + 1, ...item }));
}

/**
 * The Daevanion move: the current board of the role route, and once that board has been read its next node and the
 * steps to it ("Carry on with Nezekan: Overhead Slam +1 next (2 steps)"). Before a board is read the current board is the
 * first open board, in route order, with nodes left; nothing is said about its nodes. Null when the budget is spent.
 */
export function daevanionMove(boards) {
  const route = boards?.roleRoute ?? null;
  if (route?.known && route.left !== null && route.spent >= route.budget) return null;
  if (route?.current?.read) {
    const steps = route.steps.filter(step => step.boardId === route.current.id);
    const goal = steps.findIndex(step => step.target);
    if (goal < 0) return null;
    const board = boards.boards.find(item => item.id === route.current.id);
    const text = steps[goal].effects?.[0] || steps[goal].name;
    return { board, title: `${board.nodesTaken === 0 ? `Start ${board.name}` : `Carry on with ${board.name}`}: ${text} next (${goal + 1} ${goal ? 'steps' : 'step'})`, detail: `${board.name} is your board now. Work one board at a time: the route moves on once its nodes for your role are taken.` };
  }
  // Not read yet: the route's current board (a board read and done for the role, or finished by its counts, is skipped);
  // with no route, the first open board in route order that still has nodes to take.
  const board = route ? (route.current ? boards.boards.find(item => item.id === route.current.id) : null)
    : boards?.boards?.find(item => item.open && (item.nodesTaken === null || item.nodesTotal === null || item.nodesTaken < item.nodesTotal));
  if (!board) return null;
  return board.nodesTaken
    ? { board, title: `Carry on with ${board.name}`, detail: `Open ${board.name} to see your next node for your role. One board at a time.` }
    : { board, title: `Spend points on the ${board.name} Daevanion board`, detail: `It is open with no nodes taken. Start with: ${Array.isArray(boards.priorities) ? boards.priorities[0] : 'your rotation skill nodes'}.` };
}

/** name -> { id, name, icon (full URL), category, needLevel, perkIconBase } from data/advisor/icons/<class>.json. */
function iconIndex(icons, className) {
  const record = (icons?.records ?? []).find(item => item.class === className);
  if (!record) return new Map();
  return new Map(record.skills.map(skill => [skill.name, { ...skill, icon: `${record.iconBase}${skill.icon}`, perkIconBase: record.perkIconBase ?? null }]));
}

/**
 * The full Ascent Plan.
 * @param {object} input
 * @param {string} input.className  One of AION2_CLASSES.
 * @param {string} [input.role]     tank, healer, support or dps. Falls back to the class's main role.
 * @param {number} [input.level]    Character level. Taken from the model when one is given.
 * @param {object} input.data       { progression, skills, builds } from data/advisor/ (builds for this class).
 * @param {object} [input.model]    The armory character model (armory-adapter.mjs), when one is loaded.
 * @param {string} [input.team]     main-tank, off-tank-templar or solo, for a build with team variants (TEAMS).
 * @param {number} [input.daevanionPoints] The Daevanion points the player has to spend now (typed on the Daevanion screen).
 */
export function buildAscentPlan({ className, role, team = null, level, data, model = null, daevanionPoints = null }) {
  if (!AION2_CLASSES.includes(className)) throw new TypeError(`Unknown AION 2 class: ${className}`);
  const facts = indexProgression(data.progression);
  const capRule = {
    cap: masteryCap(data.mechanics),
    beyond: levelSourcesBeyondCap(data.mechanics),
    nodeBoards: (facts['daevanion-boards']?.value ?? []).filter(board => board.skillNodes === true).length
  };
  const gameIcons = iconIndex(data.icons, className);
  const lvl = clampLevel(model?.profile?.level ?? level ?? 1, data.progression);
  const roles = rolesFor(data.builds);
  const picked = pickBuild(data.builds, role);
  if (!picked) throw new TypeError(`No ${className} builds are loaded.`);
  const { build, team: teamPlan } = applyTeam(picked, team);
  const roleUsed = build.role;
  const base = {
    className,
    level: lvl,
    levelCap: levelCap(data.progression),
    role: roleUsed,
    roleLabel: ROLES[roleUsed],
    roleRequested: role ?? null,
    roleFallback: Boolean(role && role !== roleUsed),
    roles,
    build: { id: build.id, label: build.label, summary: build.summary, summaryRefs: build.roleRefs ?? [], main: Boolean(build.main), status: build.status ?? 'sourced', beginner: build.beginner ?? null },
    team: teamPlan,
    sources: [...sourcesOf(build).values()],
    character: model ? { name: model.profile.name, level: model.profile.level, className: model.profile.class } : null,
    macroOrder: facts['macro-order'] ?? null,
    specialtyRule: facts['specialty-perks'] ?? null,
    masteryCap: capRule.cap,
    // The game's icon for each skill the armory lists (empty without a Daeva).
    skillIcons: { ...Object.fromEntries([...gameIcons.values()].map(skill => [skill.name, skill.icon])), ...Object.fromEntries((model?.skills ?? []).filter(skill => skill.icon).map(skill => [skill.name, skill.icon])) }
  };
  if (build.status === 'pending') {
    return { ...base, pending: build.build, now: [], skills: [], stigmas: { pending: build.build }, daevanion: planBoards({ daevanion: build.build }, lvl, model, facts), stats: build.build, rotation: build.build, upcoming: [] };
  }
  const catalogue = skillIndex(data.skills, className);
  const mechanics = indexMechanics(data.mechanics, data.progression);
  // The level planner (level-planner.mjs): the setup this Daeva can run at this level, from the skill levels they have.
  // The build as the plan uses it here: the planner's stigma order, Specialty picks and the macro block for this level.
  const ctx = { build, team: teamPlan?.id ?? null, catalogue, icons: gameIcons, level: lvl, model, facts, cap: levelCap(data.progression) };
  const setup = planLevelSetup(ctx, { boards: facts['daevanion-boards']?.value ?? [] });
  const picks = pickSpecialties(ctx, weightsFor(build, ctx.team));
  const levelBuild = {
    ...build,
    stigmas: isPending(build.stigmas) ? build.stigmas : { ...build.stigmas, slots: build.stigmas.slots.map((slot, index) => ({ ...slot, name: setup.slots[index]?.name ?? slot.name, why: setup.slots[index]?.why ?? null, status: setup.slots[index]?.status ?? null })) },
    specialties: (build.specialties ?? []).map(entry => ({ ...entry, picks: picks.get(entry.skill) ?? entry.picks })),
    macro: setup.block ?? build.macro
  };
  const skills = planSkills(levelBuild, catalogue, lvl, model, facts, capRule);
  const stigmas = planStigmas(levelBuild, lvl, model, facts, gameIcons);
  const daevanion = planBoards(build, lvl, model, facts, capRule.cap, { points: daevanionPoints });
  const mastery = planMastery(levelBuild, catalogue, lvl, model, facts, gameIcons, capRule, daevanion.boards, { ctx, picks, stigmaSet: setup.stigmaSet });
  const rotation = planRotation(build.rotation, catalogue, lvl, stigmas);
  const chains = planChains({ catalogue, className, mechanics });
  // A follow-up that opens above the Mastery cap says how the build gets there, or that it names no way (Reckless Strike: no Keen Strike node).
  for (const chain of chains.chains) chain.reach = chain.opensAt && chain.leadIns[0] ? reachSkillLevel(chain.leadIns[0], chain.opensAt, { ...capRule, nodeSkills: daevanionSkillNodes(build) }) : null;
  const skillBar = planSkillStacks({ build: levelBuild, stigmas, gameIcons, catalogue, level: lvl, facts, mechanics, model, chains, later: setup.later });
  for (const entry of [...mastery.active, ...mastery.passive]) entry.chains = chainsOf(chains, entry.name);
  return {
    ...base,
    pending: null,
    setup: setupSummary(setup, { mastery, stigmas, daevanion, build, level: lvl, skillBar, ctx }),
    nextAt: setup.next,
    now: nowList(lvl, levelBuild, skills, stigmas, daevanion, model, mastery, skillBar, { grades: data.grades ?? null, progression: data.progression, setup }),
    skills,
    specialtyTargets: specialtyTargets(skills, capRule?.cap ?? null, gameIcons),
    stigmas,
    daevanion,
    stats: build.stats,
    // Stats explained (stats.json): the build's stat order linked to the point stats that feed it, with the Daeva's own
    // points when one is loaded, and what to look for on each kind of gear. null without the stats record.
    statPlan: data.stats ? { rank: rankPointStats(build, data.stats), chains: statChains(build, data.stats, model?.stats ?? null), gear: gearRows(rankPointStats(build, data.stats), data.stats), live: Boolean(model) } : null,
    rotation,
    levelNotes: (build.levelNotes ?? []).filter(note => lvl <= note.to),
    upcoming: upcoming(lvl, skills, stigmas, daevanion, facts),
    mastery,
    skillBar,
    chains,
    macro: planMacro({ build: levelBuild, skillBar, mechanics, facts, level: lvl, later: setup.later }),
    mechanics
  };
}

/**
 * The setup for now, in one record every screen and the Daeva Card read: the main line, the stigmas in their slots, the
 * first Mastery step, the Daevanion board to work on, the stat focus, what comes later, and the trends with the logic's
 * verdict. planned is false for a build with no ascent record: the screens then say "Not confirmed yet".
 */
function setupSummary(setup, { mastery, stigmas, daevanion, build, level, skillBar }) {
  const line = ['A', 'B'].map(key => skillBar?.stacks?.[key]).filter(stack => stack?.skills?.length).map(stack => ({ key: stack.key, name: stack.name ?? null, skills: stack.skills.map(skill => skill.name) }));
  const open = (daevanion.boards ?? []).filter(board => board.open);
  const tier = Array.isArray(daevanion.nodePriorities) && daevanion.nodePriorities.length ? daevanion.nodePriorities[0] : null;
  const known = name => (skillBar ? [...Object.values(skillBar.stacks).flatMap(stack => stack.skills.map(skill => skill.name)), ...(mastery?.active ?? []).filter(entry => entry.unlocked !== false).map(entry => entry.name)] : []).includes(name);
  const route = daevanion.roleRoute;
  const board = route?.current ? open.find(item => item.id === route.current.id) ?? null : open[0] ?? null;
  return {
    level,
    planned: setup.planned,
    confirmed: setup.confirmed,
    status: setup.status,
    weights: setup.weights,
    weightsWhy: setup.weightsWhy,
    refs: setup.refs,
    line,
    mainAttack: skillBar?.mainAttack ?? null,
    stigmas: stigmas.pending ? [] : stigmas.slots.map(slot => ({ slot: stigmas.slots.indexOf(slot) + 1, name: slot.name, open: slot.open, slotLevel: slot.slotLevel, why: slot.why ?? null, status: slot.status ?? null })),
    mastery: (mastery?.spend ?? [])[0] ?? null,
    daevanion: {
      open: open.map(item => item.name),
      board: board ? { id: board.id, name: board.name } : null,
      firstLevel: daevanion.boards?.[0]?.unlockLevel ?? null,
      // The first tier's skill nodes: the ones the Daeva has now, and the ones that wait for the skill.
      now: tier?.skills ? tier.skills.filter(known) : [],
      waits: tier?.skills ? tier.skills.filter(name => !known(name)) : [],
      left: route?.known ? route.left : null,
      have: route?.have ?? null
    },
    stats: isPending(build.stats) ? null : { first: build.stats.order[0], order: build.stats.order, status: build.stats.status ?? null },
    later: skillBar?.later ?? [],
    // Mastery trends against the planner's first step, in their level band.
    trends: [...setup.trends, ...(build.ascent?.preferences ?? []).filter(pref => pref.kind === 'mastery' && level >= (pref.from ?? 1) && level <= (pref.to ?? Infinity)).map(pref => {
      const first = (mastery?.spend ?? [])[0] ?? null;
      const used = first?.name === pref.skill;
      return { ...pref, used, verdict: used ? pref.why : first ? `${first.name} comes first now: ${first.why ?? 'it is worth more to this role and team.'}` : 'Nothing to level now.' };
    })]
  };
}

/**
 * Where each skill goes on the game's skill bar, from the build's macro block (builds/<class>.json, macro). The right-hand
 * block is stack A, the main attack, stack B (Miguel, in game, 16 Oct 2026): the two stacks either side of the main attack
 * are the macro's only entries. The main attack sits on left click, where the game keeps the class's basic skill. The
 * left-hand block holds every own-key skill on a key of its own, left to right in the order a player uses them: opener
 * and burst buffs (opener order), charged skills, stagger and situational skills, defensives and heals, movement last.
 * Each key is a stack of up to four rows (planSkillStacks); only stack A and stack B hold more than one skill.
 */
export const LEFT_KEYS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E', 'RMB']);
export const RIGHT_KEYS = Object.freeze(['A', 'LMB', 'B']);
/**
 * The order own keys are filled in, the way a player's hand sits (Miguel, in game, 17 Oct 2026): 1 to 4 sit right above
 * Q and E, so 1 to 4 come first, then Q and E, then 5 to 8. A key that holds a stack of skills goes on Q or E first: they
 * are easier to stack than 5 to 8.
 */
export const KEY_FILL = Object.freeze(['1', '2', '3', '4', 'Q', 'E', '5', '6', '7', '8', 'RMB']);
export const STACK_KEYS = Object.freeze(['Q', 'E']);
export const SKILL_BAR_KEYS = Object.freeze([...LEFT_KEYS, ...RIGHT_KEYS]);
/** The skill every class has on Space bar (Miguel, in game, 17 Oct 2026): Defiance, the crowd control break. It never takes
    a numbered key, a mouse button or a stack row; the bar shows it on Space. */
export const SPACE_SKILL = 'Defiance';
/** Rows on a key: 0 is nearest the key and fires first, 3 is the top. */
export const STACK_ROWS = 4;
/** The macro block's two stacks and the keys they sit on. */
export const MACRO_STACKS = Object.freeze([['stackA', 'A'], ['stackB', 'B']]);

/* Game mechanics (data/advisor/mechanics.json): one record per rule with a status. The pages show a "Not confirmed yet" tag,
   with the rule's in-game test, wherever an unconfirmed rule is used; flipping the status in the data removes it everywhere. */
export const RULE_IDS = Object.freeze(['skill-stack', 'chain-follow-up', 'macro-order', 'mastery-cap', 'enchant-rates', 'enchant-pity', 'enchant-carry', 'enhance-stones']);
const UNKNOWN_RULE = Object.freeze({ status: 'unconfirmed', confirmed: false, text: '', test: null, facts: null });

/** Rules by id, each with confirmed (boolean) and, for the macro rule, the facts it points at in progression.json. */
export function indexMechanics(mechanics, progression) {
  const facts = indexProgression(progression);
  const out = {};
  for (const rule of mechanics?.records ?? []) {
    const from = typeof rule.factsFrom === 'string' && rule.factsFrom.startsWith('progression:') ? facts[rule.factsFrom.slice('progression:'.length)] ?? null : null;
    out[rule.id] = { ...rule, confirmed: rule.status === 'confirmed', facts: from };
  }
  return out;
}
const ruleOf = (mechanics, id) => mechanics?.[id] ?? { ...UNKNOWN_RULE, id };

/* Chain skills. Only from the data: a Specialty perk that "Adds X chain skill" (lead-in: that skill, follow-up: X, open from
   the perk's skill level), a perk about a chain skill's trigger chance, and the follow-ups seen in game (mechanics.json),
   whose lead-ins stay pending until they are captured. Nothing here says how a chain is pressed: that is the chain rule. */
const CHAIN_ADDS = /^Adds (.+?) chain skill$/i;
const CHAIN_TRIGGER = /^(.+?) chain skill trigger chance/i;
export function planChains({ catalogue, className, mechanics }) {
  const rule = ruleOf(mechanics, 'chain-follow-up');
  const chains = [];
  for (const [name, info] of catalogue) {
    for (const perk of Array.isArray(info.specialties) ? info.specialties : []) {
      const followUp = CHAIN_ADDS.exec(perk.text)?.[1] ?? CHAIN_TRIGGER.exec(perk.text)?.[1] ?? null;
      if (followUp) chains.push({ leadIns: [name], followUp, opensAt: perk.skillLevel, from: 'specialty', pending: null });
    }
  }
  for (const seen of rule.observed ?? []) {
    if (seen.class !== className) continue;
    chains.push({ leadIns: Array.isArray(seen.leadIns) ? seen.leadIns : [], followUp: seen.followUp, opensAt: null, from: 'tooltip', pending: isPending(seen.leadIns) ? seen.leadIns : null });
  }
  return { status: rule.status, confirmed: rule.confirmed, test: rule.test ?? null, unknown: rule.unknown ?? null, chains };
}
/** The chains a skill takes part in, as a lead-in or as the follow-up. */
export const chainsOf = (chains, name) => (chains?.chains ?? []).filter(chain => chain.leadIns.includes(name) || chain.followUp === name);

const cooldownOf = info => (info && typeof info.cooldownSeconds === 'number' ? info.cooldownSeconds : null);

/** The skills a build calls its filler, in the build's order: the rotation's filler line, key skills whose reason says filler, then a captured 0 s cooldown. */
export function buildFillers(build, names, catalogue = new Map()) {
  const rot = isPending(build?.rotation) || !build?.rotation ? null : build.rotation;
  const inText = text => names.filter(name => String(text ?? '').includes(name)).sort((a, b) => String(text).indexOf(a) - String(text).indexOf(b));
  const out = [
    ...inText(rot?.filler),
    ...(build?.coreSkills ?? []).filter(core => /\bfiller\b/i.test(core.why ?? '')).map(core => core.name),
    ...[...catalogue].filter(([, info]) => info?.cooldownSeconds === 0).map(([name]) => name)
  ];
  return out.filter((name, index) => names.includes(name) && out.indexOf(name) === index);
}

/** Own-key reasons in the order the left-hand block runs, left to right (the opener goes before all of them). */
export const OWN_KEY_ORDER = Object.freeze(['buff', 'toggle', 'charged', 'stagger', 'other', 'defensive', 'heal', 'dash', 'movement']);
/** Why a skill is on its own key, by reason, when the build gives no line of its own (macro-rules, own-keys). */
export const OWN_KEY_WHY = Object.freeze({
  buff: 'Own key: a burst buff. Press it when you choose, not on trash.',
  toggle: 'Own key: a toggle. A macro would switch it off on the next pass.',
  charged: 'Own key: charged. A macro only fires stage 1.',
  stagger: 'Own key: use it in a stagger window.',
  other: 'Own key: most players keep it off the macro.',
  defensive: 'Own key: a defensive. You need it at a chosen moment.',
  heal: 'Own key: a heal. You choose when it fires.',
  dash: 'Own key: a dash. It pulls you out of position.',
  movement: 'Own key: it moves you. Keep it for when you mean to move.'
});
const macroUseOf = info => (info?.macroUse && typeof info.macroUse === 'object' ? info.macroUse : null);
const conditionOf = info => (Array.isArray(info?.triggers) ? info.triggers.find(item => item.type === 'condition' && item.skillLevel === null) ?? null : null);

/**
 * A skill's triggers (skills.json), each with whether the Daeva's skill level reaches it: reached true or false with a
 * Daeva, null without one. A trigger that needs a skill level the Daeva has not reached, or cannot be checked, is dim and
 * says "From skill Lv N".
 */
export function skillTriggers(info, skillLevel) {
  return (Array.isArray(info?.triggers) ? info.triggers : []).map(item => {
    const reached = item.skillLevel === null ? true : Number.isInteger(skillLevel) ? skillLevel >= item.skillLevel : null;
    return { ...item, reached, dim: reached !== true, from: item.skillLevel === null ? null : `From skill Lv ${item.skillLevel}` };
  });
}

function planSkillStacks({ build, stigmas, gameIcons, catalogue, level, facts, mechanics, model = null, chains = null, later = [] }) {
  const skills = [...gameIcons.values()];
  if (!skills.length) return null;
  const rule = ruleOf(mechanics, 'skill-stack');
  const block = build.macro && typeof build.macro === 'object' ? build.macro : null;
  const actives = skills.filter(skill => skill.category === 'Active');
  const byName = new Map(skills.map(skill => [skill.name, skill]));
  const basic = actives[0];
  const corePriority = new Map((build.coreSkills ?? []).slice().sort((a, b) => a.priority - b.priority).map((skill, index) => [skill.name, index + 1]));
  const slotted = stigmas.pending ? [] : stigmas.slots;
  const owned = name => model?.skills?.find(skill => skill.name === name) ?? null;
  const fillers = buildFillers(build, [...byName.keys()], catalogue);

  const cell = (name, place) => {
    const skill = byName.get(name);
    const info = catalogue.get(name) ?? null;
    const isStigma = skill.category === 'Stigma';
    const slot = slotted.find(item => item.name === name) ?? null;
    const mine = owned(name);
    // A stigma outside the build's four slots needs a swap first, unless the Daeva already has it equipped.
    const needsSlot = isStigma && !slot && !(mine?.equipped);
    const unlockLevel = slot ? slot.slotLevel : skill.needLevel;
    const cooldown = cooldownOf(info);
    const skillLevel = mine?.acquired && Number.isInteger(mine.skillLevel) ? mine.skillLevel : null;
    const condition = conditionOf(info);
    const noCooldown = Boolean(place.row?.noCooldown) || fillers.includes(name) || cooldown === 0;
    return {
      name, icon: skill.icon, key: place.key, row: place.index, role: place.role, reason: place.reason ?? null,
      why: place.why ?? null, rank: corePriority.get(name) ?? null, stigma: isStigma, needsSlot, unlockLevel, locked: level < unlockLevel,
      // From the Daeva's skill data: never learned, or at level 0, means it costs animation time in a macro for nothing.
      learned: mine ? Boolean(mine.acquired) && mine.skillLevel !== 0 : null,
      skillLevel, cooldownSeconds: cooldown, noCooldown, cooldownPending: !noCooldown && cooldown === null,
      filler: fillers.includes(name), conditional: Boolean(condition), condition: condition?.text ?? null,
      triggers: skillTriggers(info, skillLevel), macroUse: macroUseOf(info), charged: macroUseOf(info)?.reason === 'charged',
      fixed: place.role === 'main' && name === basic.name
    };
  };
  const stacks = Object.fromEntries(SKILL_BAR_KEYS.map(key => [key, { key, side: LEFT_KEYS.includes(key) ? 'left' : 'right', skills: [], solo: false, reason: null, label: null, fillerMissing: null, pending: null }]));
  const placed = new Set();
  const put = (key, entries, extra = {}) => { stacks[key] = { ...stacks[key], skills: entries, ...extra }; entries.forEach(item => placed.add(item.name)); };

  const notOnBar = [];
  if (block) {
    // The right-hand block: stack A, the main attack on left click, stack B, each row as the block lists it.
    for (const [id, key] of MACRO_STACKS) {
      const stack = block[id];
      if (!stack?.rows?.length) { stacks[key].pending = block[`${id}Pending`] ?? null; continue; }
      // A row the build leaves empty stays empty (the game skips it); the rows above keep their place.
      const rows = stack.rows.slice(0, STACK_ROWS).map((row, index) => (!row?.empty && row?.name !== SPACE_SKILL && byName.has(row?.name) ? cell(row.name, { key, index, role: id, why: row.why, row }) : null)).filter(Boolean);
      const top = rows.at(-1);
      put(key, rows, {
        label: stack.label ?? null,
        name: stack.name ?? null,
        empty: stack.rows.slice(0, STACK_ROWS).map((row, index) => (row?.empty ? { row: index, why: row.why ?? null } : null)).filter(Boolean),
        // A stack that does not end on a no-cooldown skill: the macro skips it when every row is on cooldown (macro-order facts).
        fillerMissing: rows.length > 1 && !(top.noCooldown && !top.conditional) ? 'No filler on top: when every skill here is on cooldown, the macro skips this entry and your held main attack fills the gap.' : null
      });
    }
    const main = block.mainAttack?.name && byName.has(block.mainAttack.name) ? block.mainAttack : { name: basic.name, why: null };
    // The main attack's line can change with the level ("You can leave it alone" at 45 for a build that runs the macro alone).
    const mainWhy = (main.atLevel ?? []).filter(item => level >= item.from).at(-1)?.why ?? main.why;
    put('LMB', [{ ...cell(main.name, { key: 'LMB', index: 0, role: 'main', why: mainWhy }), locked: false }], { solo: true, reason: `The game keeps ${basic.name} on left click. Hold it with the macro key.` });
    // The left-hand block: the opener first, in its order, then every other own key grouped by reason.
    // An own key is one skill, or a small stack the build names (two movement skills on one key).
    // Defiance is on Space bar for every class, so it never takes one of these keys; the keys after it move up one.
    const namesOf = item => (Array.isArray(item.stack) ? item.stack.filter(name => byName.has(name) && name !== SPACE_SKILL) : byName.has(item.name) && item.name !== SPACE_SKILL ? [item.name] : []);
    // A reserved key (level planner: its skill comes later) keeps its place in the order and stays free.
    const own = (block.ownKeys ?? []).filter(item => (item.reserved ? item.reserved.some(name => name !== SPACE_SKILL) : namesOf(item).length && !namesOf(item).some(name => placed.has(name))));
    const opener = block.opener ?? [];
    const first = item => namesOf(item).map(name => opener.indexOf(name)).filter(at => at >= 0).sort((a, b) => a - b)[0] ?? -1;
    const rank = item => (first(item) >= 0 ? first(item) - 100 : OWN_KEY_ORDER.indexOf(item.reason) === -1 ? OWN_KEY_ORDER.length : OWN_KEY_ORDER.indexOf(item.reason));
    // The build's own order when it gives one (the keys a published bar uses), else the opener first, then by reason.
    const ordered = own.map((item, index) => ({ ...item, index })).sort((a, b) => (block.ownKeysOrder === 'listed' ? a.index - b.index : rank(a) - rank(b) || a.index - b.index));
    // Keys by the hand: stacked own keys take Q and E first, then every key in its order takes the next free key.
    const free = [...KEY_FILL];
    const keyOf = new Map();
    // A key's full stack as the build lists it, open or still to come, so it keeps Q or E at every level.
    const fullSize = item => (item.reserved ?? [...(Array.isArray(item.stack) ? item.stack : [item.name]), ...(item.waiting ?? [])]).filter(name => name !== SPACE_SKILL).length;
    for (const item of ordered.filter(entry => fullSize(entry) > 1)) {
      const key = STACK_KEYS.find(name => free.includes(name));
      if (!key) break;
      free.splice(free.indexOf(key), 1);
      keyOf.set(item, key);
    }
    for (const item of ordered) if (!keyOf.has(item)) keyOf.set(item, free.shift() ?? null);
    for (const item of ordered) {
      const key = keyOf.get(item);
      if (item.reserved) { if (key) stacks[key].reserved = item.reserved.filter(name => byName.has(name) && name !== SPACE_SKILL); continue; }
      const why = item.why ?? OWN_KEY_WHY[item.reason] ?? OWN_KEY_WHY.other;
      const names = namesOf(item);
      if (!key) { for (const name of names) notOnBar.push({ name, icon: byName.get(name).icon, unlockLevel: byName.get(name).needLevel, reason: 'No key left on the left-hand block.' }); continue; }
      const cells = names.slice(0, STACK_ROWS).map((name, index) => cell(name, { key, index, role: opener.includes(name) ? 'opener' : 'own', reason: item.reason, why }));
      const stacked = cells.length > 1;
      const top = cells.at(-1);
      put(key, cells, {
        solo: !stacked, ownStack: stacked, label: item.label ?? null, reason: why, reserved: item.waiting?.length ? item.waiting.filter(name => byName.has(name)) : null, opener: !stacked && opener.includes(names[0]) ? opener.indexOf(names[0]) + 1 : null,
        fillerMissing: stacked && !(top.noCooldown && !top.conditional) ? 'Its own key, not a macro entry: it fires the lowest ready skill when you press it.' : null
      });
    }
    for (const extra of block.extras ?? []) if (byName.has(extra.name) && !placed.has(extra.name)) notOnBar.push({ name: extra.name, icon: byName.get(extra.name).icon, unlockLevel: byName.get(extra.name).needLevel, reason: extra.why, extra: true });
  } else {
    put('LMB', [cell(basic.name, { key: 'LMB', index: 0, role: 'main', why: null })], { solo: true, reason: `The game keeps ${basic.name} on left click.` });
  }
  // Space bar: Defiance, the same for every class. Before the level it opens it is in Comes later, never on the bar.
  const spaceCell = byName.has(SPACE_SKILL) ? cell(SPACE_SKILL, { key: 'Space', index: 0, role: 'space', why: 'Every class has Defiance on Space bar.' }) : null;
  const space = spaceCell && !spaceCell.locked ? spaceCell : null;
  if (spaceCell) placed.add(SPACE_SKILL);
  // Other actives the build does not place, that the Daeva can use now: listed with the reason, never guessed onto a key.
  // A skill that waits for a level or a slot is in the Comes later strip instead.
  const waiting = new Set(later.map(item => item.name));
  for (const skill of actives) if (!placed.has(skill.name) && !waiting.has(skill.name) && !(skill.needLevel > level) && !notOnBar.some(item => item.name === skill.name)) notOnBar.push({ name: skill.name, icon: skill.icon, unlockLevel: skill.needLevel, reason: 'Not in this build\'s bar. Swap it in if you like it.' });

  // A follow-up goes above its lead-in only once the chain rule is confirmed, only where the stack has a free row, under its filler.
  if (chains?.confirmed) {
    for (const chain of chains.chains) {
      if (chain.pending || !byName.has(chain.followUp) || placed.has(chain.followUp)) continue;
      const stack = MACRO_STACKS.map(([, key]) => stacks[key]).find(item => item.skills.length && item.skills.length < STACK_ROWS && item.skills.some(skill => chain.leadIns.includes(skill.name)));
      if (!stack) continue;
      const at = stack.skills.findIndex(skill => chain.leadIns.includes(skill.name));
      stack.skills.splice(at + 1, 0, cell(chain.followUp, { key: stack.key, index: at + 1, role: 'chain', why: `A follow-up to ${stack.skills[at].name}: it sits right above it.` }));
      stack.skills.forEach((skill, row) => { skill.row = row; });
      placed.add(chain.followUp);
    }
  }
  // What each key fires at this level: the open rows in order, and the level the next locked one opens.
  for (const stack of Object.values(stacks)) {
    const waiting = stack.skills.filter(skill => skill.locked);
    stack.firesNow = stack.skills.filter(skill => !skill.locked && !skill.needsSlot && skill.learned !== false).map(skill => skill.name);
    // Level planner: a skill the Daeva cannot place yet is off the bar, in Comes later, under the stack it joins.
    const joins = later.filter(item => item.unlockLevel && (item.where === stack.name || item.where === MACRO_STACKS.find(([, key]) => key === stack.key)?.[0]));
    const levels = [...waiting.map(skill => skill.unlockLevel), ...joins.map(item => item.unlockLevel)];
    stack.nextUnlock = levels.length ? Math.min(...levels) : null;
    stack.joinsLater = joins.map(item => ({ name: item.name, unlockLevel: item.unlockLevel }));
  }
  const bars = Array.from({ length: STACK_ROWS }, (_, row) => Object.fromEntries(SKILL_BAR_KEYS.map(key => {
    const skill = stacks[key].skills.find(item => item.row === row) ?? null;
    return [key, skill ? { ...skill, key, row } : null];
  })));
  const stackFillers = MACRO_STACKS.map(([, key]) => stacks[key].skills.at(-1)).filter(skill => skill && skill.noCooldown && !skill.conditional).map(skill => skill.name);
  const result = {
    keys: SKILL_BAR_KEYS, left: LEFT_KEYS, right: RIGHT_KEYS, rows: STACK_ROWS, stacks, bars, basic: basic.name, mainAttack: stacks.LMB.skills[0]?.name ?? basic.name,
    notOnBar, stigmas: slotted.map(slot => slot.name), fillers, stackFillers, fromBlock: Boolean(block), status: block?.status ?? null, space,
    // Skills the plan puts on the bar once the Daeva can place them (the Comes later strip), soonest first.
    later: later.map(item => ({ ...item, ...(item.name === SPACE_SKILL ? { where: 'Space bar', reason: `${item.reason ?? ''} It goes on Space bar.`.trim() } : {}), icon: byName.get(item.name)?.icon ?? null })),
    opener: (block?.opener ?? []).filter(name => placed.has(name)),
    // False for a class whose stacks are not checked against a published top-player build yet (the page tags them).
    verified: block ? block.verified !== false : null,
    rule: { status: rule.status, confirmed: rule.confirmed, text: rule.text, rules: rule.rules ?? [] }, macroKey: facts['macro-order']?.value ? true : false
  };
  result.copySteps = copySteps(result);
  result.problems = [...stackProblems(result), ...fillerProblems(result), ...stigmaKeyProblems(result), ...placementProblems(result)];
  return result;
}

const keyWords = key => (key === 'A' ? 'Stack A' : key === 'B' ? 'Stack B' : key === 'LMB' ? 'Left click' : key === 'RMB' ? 'Right click' : `Key ${key}`);
/** Where a skill sits, in words: "stack A", "left click", "key 3". */
export const keyPhrase = key => keyWords(key).replace(/^(Stack|Key)/, word => word.toLowerCase()).replace(/^Left click|^Right click/, words => words.toLowerCase());

/**
 * "Copy this bar": key by key, row by row, in the order to drag them in game (left-hand block left to right, then stack A
 * and stack B; left click is set by the game), ending with the macro step.
 */
function copySteps(bar) {
  const steps = [];
  if (bar.space) steps.push({ key: 'Space', label: 'Space bar', space: true, rows: [{ row: 0, name: bar.space.name, locked: bar.space.locked, needsSlot: false, unlockLevel: bar.space.unlockLevel }], empty: [] });
  for (const key of [...LEFT_KEYS, 'A', 'B']) {
    const stack = bar.stacks[key];
    if (!stack.skills.length) continue;
    steps.push({ key, label: stack.name ?? keyWords(key), rows: stack.skills.map(skill => ({ row: skill.row, name: skill.name, locked: skill.locked, needsSlot: skill.needsSlot, unlockLevel: skill.unlockLevel })), empty: stack.empty ?? [] });
  }
  const entries = ['A', 'B'].filter(key => bar.stacks[key].skills.length);
  const named = key => (bar.stacks[key].name ? `the ${bar.stacks[key].name.toLowerCase()}` : keyWords(key).replace(/^Stack/, 'stack'));
  if (entries.length) steps.push({ key: null, label: 'Macro 1', macro: true, text: entries.length === 2 ? `Then add ${named('A')} and ${named('B')} to Macro 1.` : `Then add ${named(entries[0])} to Macro 1.` });
  return steps;
}

/**
 * Stack rule check: at most four rows, at most one always-ready skill per key, and an always-ready skill never below a
 * cooldown skill (it would block it). A skill that only fires on a condition (a stagger, a window, a mark) is not always
 * ready, so it never blocks. The data fails when this returns anything.
 */
export function stackProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    const list = stack.skills;
    const always = skill => skill.noCooldown && !skill.conditional;
    if (list.length > STACK_ROWS) problems.push(`key ${stack.key}: ${list.length} skills, the game holds ${STACK_ROWS}`);
    if (list.filter(always).length > 1) problems.push(`key ${stack.key}: two no-cooldown skills, only the lowest would ever fire`);
    list.forEach((skill, row) => {
      if (!always(skill)) return;
      const above = list.slice(row + 1).find(item => (item.cooldownSeconds ?? 0) > 0 || item.cooldownPending);
      if (above) problems.push(`key ${stack.key}: ${skill.name} (no cooldown) on row ${row} blocks ${above.name} above it`);
    });
  }
  return problems;
}

/**
 * Filler rule check: a key that holds two or more skills has an always-ready skill on its top filled row, so the key always
 * does something, or carries the reason it has none (fillerMissing).
 */
export function fillerProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    const list = stack.skills;
    if (list.length < 2) continue;
    const top = list.at(-1);
    if (!(top.noCooldown && !top.conditional) && !stack.fillerMissing) problems.push(`key ${stack.key}: ${top.name} on the top row is not always ready and the stack names no reason`);
  }
  return problems;
}

/** Stigma rule check: a stigma sits in a stack only on stack A or B (the macro block puts it there); every other key holds one skill. */
export function stigmaKeyProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    if (stack.skills.length > 1 && !['A', 'B'].includes(stack.key) && !stack.ownStack) problems.push(`key ${stack.key}: ${stack.skills.length} skills, only stack A and stack B are stacks`);
    if (stack.skills.length > 1 && !['A', 'B'].includes(stack.key) && stack.skills.some(skill => skill.stigma)) problems.push(`key ${stack.key}: a stigma in a stack (${stack.skills.filter(skill => skill.stigma).map(skill => skill.name).join(', ')})`);
  }
  return problems;
}

/** Placement check: no skill in two places, nothing marked own-key in a stack, the main attack never in a stack. */
export function placementProblems(skillBar) {
  const problems = [];
  const seen = new Map();
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    for (const skill of stack.skills) {
      if (seen.has(skill.name)) problems.push(`${skill.name} is on ${seen.get(skill.name)} and ${stack.key}`);
      seen.set(skill.name, stack.key);
      if (['A', 'B'].includes(stack.key) && skill.macroUse?.value === 'own-key') problems.push(`${skill.name} is marked own-key (${skill.macroUse.reason}) but sits in stack ${stack.key}`);
      if (['A', 'B'].includes(stack.key) && skill.name === skillBar.mainAttack) problems.push(`${skill.name} is the main attack but sits in stack ${stack.key}`);
    }
  }
  return problems;
}

/** The most entries one macro holds: macro-order maxEntries in progression.json (confirmed in game). null when the data has none. */
export function macroMaxEntries(facts) {
  const limit = facts?.maxEntries?.value;
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}
/** A skill's role from the catalogue (skills.json), or null when the data does not say. */
export const skillRole = (catalogue, name) => catalogue?.get(name)?.role?.value ?? null;
/** Why a row of a stack is not in the macro right now, or null when it is. */
function outOfMacro(skill, level) {
  if (skill.locked) return `From Lv ${skill.unlockLevel}`;
  if (skill.needsSlot) return 'Needs a stigma slot';
  if (skill.learned === false) return 'Not learned yet';
  if (skill.macroUse?.value === 'own-key') return 'Own key';
  return null;
}

/**
 * Macro 1 from the macro block: entry 1 is stack A, entry 2 is stack B, 10 ms delay each, never more. Each entry fires
 * its stack's first ready row, so a row that is locked, needs a stigma slot, or is not learned (level 0 still costs
 * animation time) is out of the macro until it is ready, and says when. The main attack is held with the macro key and is
 * never an entry. Own keys come grouped by reason, the opener in order. Facts and rules come from progression.json.
 */
function planMacro({ build, skillBar, mechanics, facts, level, later: waiting = [] }) {
  const rule = ruleOf(mechanics, 'macro-order');
  const maxEntries = macroMaxEntries(rule.facts);
  const rules = facts['macro-rules'] ?? null;
  const delayRule = rules?.rules?.find(item => item.id === 'delay') ?? null;
  const delayMs = Number.isInteger(delayRule?.value?.delayMs) ? delayRule.value.delayMs : rule.facts?.value?.delayMs ?? 10;
  const base = { status: rule.status, confirmed: rule.confirmed, text: rule.text ?? '', options: rule.options ?? [], notes: rule.notes ?? [], test: rule.test ?? null, facts: rule.facts ?? null, maxEntries, rules, delayMs, level };
  const empty = { entries: [], keys: [], used: 0, ownKeys: [], opener: [], later: [], extras: [], mainAttack: null, levelNotes: [] };
  if (!skillBar || !skillBar.fromBlock) return { ...base, ...empty, pending: { pending: true, reason: 'No macro line is sourced for this build yet.' } };
  const block = build.macro;
  const entries = MACRO_STACKS.map(([, key]) => skillBar.stacks[key]).filter(stack => stack.skills.length).slice(0, 2).map((stack, index) => {
    const skills = stack.skills.map(skill => ({ name: skill.name, row: skill.row, icon: skill.icon, why: skill.why, locked: skill.locked, needsSlot: skill.needsSlot, unlockLevel: skill.unlockLevel, condition: skill.condition, triggers: skill.triggers, out: outOfMacro(skill, level), inMacro: outOfMacro(skill, level) === null }));
    const live = skills.filter(skill => skill.inMacro);
    const waiting = skills.filter(skill => skill.locked);
    return { entry: index + 1, key: stack.key, label: stack.label, name: stack.name ?? null, empty: stack.empty ?? [], delayMs, skills, firesNow: live.map(skill => skill.name), usable: live.length > 0, unlockLevel: live.length ? null : waiting.length ? Math.min(...waiting.map(skill => skill.unlockLevel)) : null, fillerMissing: stack.fillerMissing };
  });
  const ownCells = LEFT_KEYS.flatMap(key => skillBar.stacks[key].skills);
  const groups = [];
  for (const skill of ownCells) {
    const id = skill.reason ?? 'other';
    let group = groups.find(item => item.reason === id);
    if (!group) { group = { reason: id, skills: [] }; groups.push(group); }
    group.skills.push({ name: skill.name, icon: skill.icon, key: skill.key, why: skill.why, locked: skill.locked, needsSlot: skill.needsSlot, unlockLevel: skill.unlockLevel });
  }
  groups.sort((a, b) => OWN_KEY_ORDER.indexOf(a.reason) - OWN_KEY_ORDER.indexOf(b.reason));
  const main = skillBar.stacks.LMB.skills[0];
  return {
    ...base, ...empty, pending: null,
    status: rule.status, blockStatus: block.status ?? null,
    entries, keys: entries.map(entry => entry.key), used: entries.filter(entry => entry.usable).length, verified: skillBar.verified,
    mainAttack: main ? { name: main.name, icon: main.icon, why: main.why, triggers: main.triggers } : null,
    opener: skillBar.opener.map(name => ownCells.find(skill => skill.name === name)).filter(Boolean).map(skill => ({ name: skill.name, icon: skill.icon, key: skill.key, locked: skill.locked, needsSlot: skill.needsSlot, unlockLevel: skill.unlockLevel })),
    ownKeys: groups,
    // What joins the macro later, soonest first: rows locked at this level, with the level.
    // What joins the stacks later: the line skills the Daeva cannot place yet (the level planner), with the level when known.
    later: waiting.filter(item => item.where !== 'own key').map(item => ({ name: item.name, key: null, row: null, unlockLevel: item.unlockLevel, reason: item.reason })),
    extras: skillBar.notOnBar.filter(item => item.extra),
    levelNotes: block.levelNotes ?? []
  };
}

/**
 * The Mastery tab: every active and passive skill (from the armory when a Daeva is loaded, otherwise
 * the build's key skills), each with its build priority, the Specialty picks for its three slots, all
 * five perks, and where the next skill points should go.
 */
function planMastery(build, catalogue, level, model, facts, gameIcons = new Map(), capRule = { cap: null, beyond: [], nodeBoards: 0 }, boards = [], planner = null) {
  const slotLevels = specialtySlotLevels(facts);
  const cap = capRule.cap;
  const core = new Map((build.coreSkills ?? []).map(skill => [skill.name, skill]));
  const picks = new Map((build.specialties ?? []).map(entry => [entry.skill, entry.picks]));
  const nodeSkills = daevanionSkillNodes(build);
  // A key skill with a level target is levelled with Mastery up to the cap (the guide's own number when no cap is known).
  // A key skill is levelled with Mastery up to the cap: a guide number above it, and a "Keep levelled" with no number,
  // both stop there. With no cap known, only the guide's own number is a goal.
  const goalOf = target => (typeof target !== 'string' ? null : cap ?? (Number(/Lv\s*(\d+)/i.exec(target)?.[1]) || null));
  const source = model
    ? model.skills.filter(skill => skill.category !== 'Dp')
    : gameIcons.size
      // No Daeva: every class skill from the armory list, like the game's Mastery tab, levels unknown.
      ? [...gameIcons.values()].filter(skill => skill.category !== 'Stigma').map(skill => ({ name: skill.name, category: skill.category, needLevel: skill.needLevel, skillLevel: null, acquired: null, equipped: null, icon: skill.icon }))
      : [...core.values()].map(skill => ({ name: skill.name, category: 'Active', needLevel: catalogue.get(skill.name)?.unlockLevel ?? null, skillLevel: null, acquired: null, equipped: null, icon: null }));
  const entries = source.map(skill => {
    const info = catalogue.get(skill.name) ?? null;
    const key = core.get(skill.name) ?? null;
    const needLevel = Number.isInteger(skill.needLevel) ? skill.needLevel : null;
    const skillLevel = skill.acquired ? skill.skillLevel : null;
    const skillPicks = picks.get(skill.name) ?? [];
    return {
      name: skill.name,
      icon: skill.icon ?? null,
      category: skill.category === 'Passive' ? 'Passive' : 'Active',
      needLevel,
      unlocked: needLevel === null ? null : level >= needLevel,
      acquired: skill.acquired,
      equipped: skill.equipped,
      skillLevel,
      priority: key ? key.priority : null,
      target: key?.target ?? null,
      targetText: key ? targetAgainstCap(key.target, { ...capRule, viaNodes: nodeSkills.includes(key.name) }) : null,
      goal: goalOf(key?.target),
      why: key?.why ?? null,
      refs: key?.refs ?? [],
      cooldownSeconds: info ? info.cooldownSeconds : null,
      summary: info && !isPending(info.summary) ? info.summary : null,
      perks: info && Array.isArray(info.specialties) ? info.specialties : [],
      slots: slotLevels.map((slotLevel, index) => ({
        slot: index + 1,
        slotLevel,
        open: skillLevel !== null && skillLevel >= slotLevel,
        pick: skillPicks[index] ? { ...skillPicks[index], reach: reachSkillLevel(skill.name, skillPicks[index].skillLevel, { ...capRule, nodeSkills }) } : null,
        // The slot itself above the cap (slot 3 opens at skill Lv 20): how the build gets there, or that it names no way.
        reach: reachSkillLevel(skill.name, slotLevel, { ...capRule, nodeSkills })
      }))
    };
  });
  const byPriority = (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || (a.needLevel ?? 0) - (b.needLevel ?? 0);
  const active = entries.filter(entry => entry.category === 'Active').sort(byPriority);
  const passive = entries.filter(entry => entry.category === 'Passive').sort((a, b) => (a.needLevel ?? 0) - (b.needLevel ?? 0));
  // Skill points: the level planner's order (level-planner.mjs orderMastery) over every skill the Daeva can level now,
  // from the skill levels they have. Each step aims for the next Specialty slot or the target, whichever comes first,
  // and never past the Mastery cap: a skill there is listed under atCap with its next +1 source instead.
  const spend = planner
    ? orderMastery(planner.ctx, weightsFor(build, planner.ctx.team), { entries: [...active, ...passive], cap, slotLevels, picks: planner.picks, stigmaSet: planner.stigmaSet })
    : [];
  const atCap = cap === null ? [] : active
    .filter(entry => entry.priority !== null && entry.skillLevel !== null && entry.skillLevel >= cap)
    .map(entry => ({ name: entry.name, skillLevel: entry.skillLevel, cap, refs: entry.refs, next: nextLevelSource(entry.name, boards, capRule.beyond) }));
  return { active, passive, spend, atCap, cap, slotLevels, fromArmory: Boolean(model) };
}

/**
 * The macro: the build's priority list with skills you cannot use yet marked as locked.
 * How the game orders a macro is still disputed between sources, so the plan says so.
 */
function planRotation(rotation, catalogue, level, stigmas) {
  if (!rotation || isPending(rotation)) return rotation ?? pending('No rotation is sourced for this build yet.');
  const names = [...catalogue.keys()].sort((a, b) => b.length - a.length);
  const stigmaSlots = stigmas.pending ? [] : stigmas.slots;
  return {
    ...rotation,
    steps: rotation.steps.map(text => {
      const stigma = stigmaSlots.find(slot => text.startsWith(slot.name));
      if (stigma) return { text, kind: 'stigma', locked: level < stigma.slotLevel, unlockLevel: stigma.slotLevel };
      const name = names.find(item => text.startsWith(item));
      const unlockLevel = name && !isPending(catalogue.get(name).unlockLevel) ? catalogue.get(name).unlockLevel : null;
      return { text, kind: name ? 'skill' : 'other', locked: unlockLevel !== null && level < unlockLevel, unlockLevel };
    })
  };
}
