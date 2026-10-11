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

import { nodeSkill } from './daevanion-planner.mjs';

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

/** The build for a role, or the class's main build when the role is not one it plays. */
export function pickBuild(builds, role) {
  const records = builds?.records ?? builds ?? [];
  return records.find(build => build.role === role) ?? records.find(build => build.main) ?? records[0] ?? null;
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
    const base = { name: skill.name, icon: skill.icon ?? null };
    if (inBuild.has(skill.name)) return { ...base, verdict: 'keep', slot: slots.findIndex(slot => slot.name === skill.name) + 1, for: null };
    const place = free.shift() ?? null;
    return { ...base, verdict: alts.has(skill.name) ? 'swap' : 'out', slot: place ? place.index + 1 : null, for: place ? place.slot.name : null, why: alternatives.find(alt => alt.name === skill.name)?.why ?? null };
  });
}

/** The skills whose +1 Daevanion nodes a build takes first, in order (the core skills when the build names none). */
export function daevanionSkillNodes(build) {
  return (!isPending(build.daevanion) && build.daevanion.skillNodes) || (build.coreSkills ?? []).map(skill => skill.name);
}

function planBoards(build, level, model, facts) {
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
  return {
    boards,
    priorities: isPending(build.daevanion) ? build.daevanion : build.daevanion.priorities,
    // Skills whose +1 nodes the board planner routes to first, in order (falls back to the core skills).
    skillNodes: daevanionSkillNodes(build),
    refs: isPending(build.daevanion) ? [] : build.daevanion.refs,
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

/** True for a worn item the plan wants enchanted: still at +0. The Gear page flags the same items. */
export const needsEnchant = slot => !slot.empty && slot.enchant === 0;
const enchantFix = needsEnchant;

/**
 * The ranked "do this now" list. Fixes read from the character come first (they are about this exact
 * character), then the build steps that apply at this level.
 */
function nowList(level, build, skills, stigmas, boards, model, mastery = null, skillBar = null) {
  const list = [];
  const push = (rank, title, detail, refs = [], kind = 'build', view = 'mastery', extra = {}) => list.push({ rank, title, detail, refs, kind, view, ...extra });

  if (model) {
    const empty = model.gear.filter(slot => slot.empty);
    if (empty.length) push(10, `Fill ${empty.length} empty gear ${empty.length === 1 ? 'slot' : 'slots'}`, `Nothing is worn in: ${empty.map(slot => slot.slot.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}. Any item beats an empty slot.`, [], 'armory', 'gear', { slots: empty.map(slot => slot.slotPos), ring: 'empty' });
    const bare = model.gear.filter(enchantFix);
    if (bare.length) push(30, `Enchant ${bare.length} worn ${bare.length === 1 ? 'item' : 'items'} above +0`, `Still at +0: ${bare.map(slot => slot.name).join(', ')}.`, [], 'armory', 'gear', { slots: bare.map(slot => slot.slotPos), ring: 'enchant' });
    // Only a board with nothing spent on it is offered. A board with any node taken (a finished one included) is never the move.
    const openUnspent = boards.boards.filter(board => board.open && board.nodesTaken === 0);
    // The move carries the character's own board id (Elyos 11 to 16, Asmodian 31 to 36), so Show me opens the board it names.
    if (openUnspent.length) push(20, `Spend points on the ${openUnspent.map(board => board.name).join(' and ')} Daevanion ${openUnspent.length === 1 ? 'board' : 'boards'}`, `${openUnspent.length === 1 ? 'It is' : 'They are'} open with no nodes taken. Start with: ${Array.isArray(boards.priorities) ? boards.priorities[0] : 'your rotation skill nodes'}.`, boards.refs, 'armory', 'daevanion', { board: openUnspent[0].id, boards: openUnspent.map(board => ({ id: board.id, name: board.name })) });
    if (!stigmas.pending && level >= stigmas.unlockLevel && stigmas.noneAcquired) push(15, 'Do the stigma quest', `You are Lv ${level} and no stigma is unlocked. Finish ${stigmas.quest ?? 'the stigma quest'} to open them.`, stigmas.refs, 'armory', 'stigma');
    // A skill the Daeva has but has not equipped, said by its place in the stacks ("Put Overhead Slam above Ruinous Blow on key 1": row 1 sits above row 0).
    const placeOf = name => {
      for (const stack of Object.values(skillBar?.stacks ?? {})) { const row = stack.skills.findIndex(item => item.name === name); if (row >= 0) return { key: stack.key, row, below: row ? stack.skills[row - 1].name : null }; }
      return null;
    };
    for (const skill of skills) {
      if (!(skill.unlocked && skill.skillLevel !== null && skill.equipped === false)) continue;
      const place = placeOf(skill.name);
      if (place) push(25, `Put ${skill.name}${place.below ? ` above ${place.below}` : ''} on key ${place.key}`, `You have it but it is not equipped. Row ${place.row} of key ${place.key} in the build's stack.`, skill.refs, 'armory', 'skill-bar', { key: place.key, row: place.row });
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
  if (!stigmas.pending && stigmas.open) push(50, `Slot ${stigmas.slots.filter(slot => slot.open).map(slot => slot.name).join(', ')}`, `You have ${stigmas.open} stigma ${stigmas.open === 1 ? 'slot' : 'slots'} open at Lv ${level}.`, stigmas.refs, 'build', 'stigma');
  if (!model) {
    const open = boards.boards.filter(board => board.open);
    if (open.length && Array.isArray(boards.priorities)) push(55, `Daevanion: ${boards.priorities[0]}`, `Open boards at Lv ${level}: ${open.map(board => board.name).join(', ')}.`, boards.refs, 'build', 'daevanion');
  }
  return list.sort((a, b) => a.rank - b.rank).map(({ rank, ...item }, index) => ({ step: index + 1, ...item }));
}

/** name -> { name, icon (full URL), category, needLevel } from data/advisor/icons/<class>.json. */
function iconIndex(icons, className) {
  const record = (icons?.records ?? []).find(item => item.class === className);
  if (!record) return new Map();
  return new Map(record.skills.map(skill => [skill.name, { ...skill, icon: `${record.iconBase}${skill.icon}` }]));
}

/**
 * The full Ascent Plan.
 * @param {object} input
 * @param {string} input.className  One of AION2_CLASSES.
 * @param {string} [input.role]     tank, healer, support or dps. Falls back to the class's main role.
 * @param {number} [input.level]    Character level. Taken from the model when one is given.
 * @param {object} input.data       { progression, skills, builds } from data/advisor/ (builds for this class).
 * @param {object} [input.model]    The armory character model (armory-adapter.mjs), when one is loaded.
 */
export function buildAscentPlan({ className, role, level, data, model = null }) {
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
  const build = pickBuild(data.builds, role);
  if (!build) throw new TypeError(`No ${className} builds are loaded.`);
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
  const skills = planSkills(build, catalogue, lvl, model, facts, capRule);
  const stigmas = planStigmas(build, lvl, model, facts, gameIcons);
  const daevanion = planBoards(build, lvl, model, facts);
  const mastery = planMastery(build, catalogue, lvl, model, facts, gameIcons, capRule, daevanion.boards);
  const rotation = planRotation(build.rotation, catalogue, lvl, stigmas);
  const chains = planChains({ catalogue, className, mechanics });
  // A follow-up that opens above the Mastery cap says how the build gets there, or that it names no way (Reckless Strike: no Keen Strike node).
  for (const chain of chains.chains) chain.reach = chain.opensAt && chain.leadIns[0] ? reachSkillLevel(chain.leadIns[0], chain.opensAt, { ...capRule, nodeSkills: daevanionSkillNodes(build) }) : null;
  const skillBar = planSkillStacks({ build, rotation, stigmas, gameIcons, catalogue, level: lvl, facts, mechanics, chains });
  for (const entry of [...mastery.active, ...mastery.passive]) entry.chains = chainsOf(chains, entry.name);
  return {
    ...base,
    pending: null,
    now: nowList(lvl, build, skills, stigmas, daevanion, model, mastery, skillBar),
    skills,
    stigmas,
    daevanion,
    stats: build.stats,
    rotation,
    levelNotes: (build.levelNotes ?? []).filter(note => lvl <= note.to),
    upcoming: upcoming(lvl, skills, stigmas, daevanion, facts),
    mastery,
    skillBar,
    chains,
    macro: planMacro({ rotation, skillBar, mechanics, level: lvl }),
    mechanics
  };
}

/**
 * Where each skill goes on the game's skill bar: keys 1 to 8, Q, E, left click and right click, each
 * key a stack of up to four rows (planSkillStacks). Left click always holds the class's basic skill and
 * cannot be moved (in-game capture). The rest follows the build: the rotation stacked on the first keys,
 * skills the build fires by hand on Q and E, stigmas outside the rotation on 5 to 8.
 */
export const SKILL_BAR_KEYS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E', 'LMB', 'RMB']);
/** Rows on a key: 0 is nearest the key and fires first, 3 is the top. */
export const STACK_ROWS = 4;

/* Game mechanics (data/advisor/mechanics.json): one record per rule with a status. The pages show a "Not confirmed yet" tag,
   with the rule's in-game test, wherever an unconfirmed rule is used; flipping the status in the data removes it everywhere. */
export const RULE_IDS = Object.freeze(['skill-stack', 'chain-follow-up', 'macro-order', 'mastery-cap']);
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

/**
 * The skill bar as the game works it: every key holds a stack of up to four skills (rows 0 to 3). Pressing the key fires
 * the lowest ready one. So cooldown skills go low and a no-cooldown filler goes on the top filled row, and a skill the
 * build fires by hand (heals, defensives, buffs), a charged skill or a stigma gets a key of its own. From the build only:
 *   left click: the class's basic skill, fixed by the game;
 *   5 to 8: the build's stigmas, one per key, in slot order (a stigma is never in a stack);
 *   key 1 (then 2 to 4 when it overflows): the rotation's cooldown skills in the build's order, a filler on top;
 *   Q and E, then free keys: charged skills and skills the build fires by hand, one per key;
 *   free keys: key skills and Daevanion node skills the rotation does not use, then other actives in unlock order.
 * A filler is a skill with a captured 0 s cooldown, or one the build calls its filler (the rotation's filler line, or a
 * key skill whose reason says filler), so a pending cooldown counts only on the build's word. A class whose only filler
 * is its basic skill (fixed on left click) has no filler for its stacks: those stacks say so, with the reason.
 * Skills that get no key are listed with the reason. bars[row][key] is the same thing by row, for the page grid.
 */
const cooldownOf = info => (info && typeof info.cooldownSeconds === 'number' ? info.cooldownSeconds : null);
const STIGMA_KEYS = Object.freeze(['5', '6', '7', '8']);
const STACK_KEYS = Object.freeze(['1', '2', '3', '4']);

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

function planSkillStacks({ build, rotation, stigmas, gameIcons, catalogue, level, facts, mechanics, chains = null }) {
  const skills = [...gameIcons.values()];
  if (!skills.length) return null;
  const rule = ruleOf(mechanics, 'skill-stack');
  const actives = skills.filter(skill => skill.category === 'Active');
  const byName = new Map(skills.map(skill => [skill.name, skill]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const nameIn = text => names.find(name => String(text).startsWith(name)) ?? null;
  const rot = isPending(rotation) || !rotation ? null : rotation;
  const steps = rot ? rot.steps.map(step => ({ name: nameIn(step.text ?? step), text: step.text ?? step, charged: /charged/i.test(step.text ?? step) })).filter(step => step.name) : [];
  const manual = rot ? (rot.manual ?? []).map(nameIn).filter(Boolean) : [];
  const stigmaSlots = stigmas.pending ? [] : stigmas.slots.filter(slot => byName.has(slot.name));
  const stigmaNames = stigmaSlots.map(slot => slot.name);
  const coreNames = (build.coreSkills ?? []).slice().sort((a, b) => a.priority - b.priority).map(skill => skill.name).filter(name => byName.has(name));
  const corePriority = new Map(coreNames.map((name, index) => [name, index + 1]));
  const basic = actives[0];
  const fillers = buildFillers(build, [...byName.keys()], catalogue);
  // Fillers a stack can use: not the basic skill (left click keeps it), not a stigma, not one fired by hand. Rotation fillers first.
  const stackFillers = fillers
    .filter(name => name !== basic.name && !stigmaNames.includes(name) && !manual.includes(name))
    .sort((a, b) => (steps.findIndex(step => step.name === a) + 1 || 99) - (steps.findIndex(step => step.name === b) + 1 || 99));

  const placed = new Set();
  const entry = (name, role) => {
    const skill = byName.get(name);
    const info = catalogue.get(name) ?? null;
    const slot = stigmaSlots.find(item => item.name === name) ?? null;
    const unlockLevel = slot ? slot.slotLevel : skill.needLevel;
    const cooldown = cooldownOf(info);
    const filler = fillers.includes(name);
    placed.add(name);
    return {
      name, icon: skill.icon, role, rank: corePriority.get(name) ?? null, unlockLevel, locked: level < unlockLevel,
      // A filler has no cooldown by the build's word; a captured 0 is the same thing. A pending cooldown is placed by role and said so.
      cooldownSeconds: cooldown, noCooldown: filler || cooldown === 0, cooldownPending: !filler && cooldown === null, filler,
      stigma: Boolean(slot), charged: steps.some(step => step.name === name && step.charged)
    };
  };
  const stacks = Object.fromEntries(SKILL_BAR_KEYS.map(key => [key, { key, skills: [], solo: false, reason: null, fillerMissing: null }]));
  const solo = (key, name, role, reason) => { stacks[key] = { key, skills: [entry(name, role)], solo: true, reason, fillerMissing: null }; };
  solo('LMB', basic.name, 'fixed', `The game keeps ${basic.name} on left click.`);

  // Stigmas first, on 5 to 8 in slot order, so nothing else takes their keys and no stack ever holds one.
  stigmaNames.slice(0, STIGMA_KEYS.length).forEach((name, index) => solo(STIGMA_KEYS[index], name, 'stigma', 'A stigma: its own key, so you choose when it fires.'));

  // The rotation's cooldown skills, in the build's order, stacked on 1 to 4 with a filler on the top filled row.
  const cooldownSkills = steps
    .filter(step => !step.charged && !manual.includes(step.name) && step.name !== basic.name && !stigmaNames.includes(step.name) && !fillers.includes(step.name))
    .map(step => step.name).filter((name, index, all) => all.indexOf(name) === index);
  const fillerQueue = [...stackFillers];
  const noFillerReason = () => (stackFillers.length
    ? "The build names one filler and it tops an earlier key, so nothing tops this stack. When every skill here is on cooldown, the key does nothing."
    : fillers.includes(basic.name)
      ? `The build's filler, ${basic.name}, stays on left click and the build names no other, so nothing tops this stack. When every skill here is on cooldown, the key does nothing.`
      : "The build names no no-cooldown skill to top this stack. When every skill here is on cooldown, the key does nothing.");
  let keyIndex = 0;
  while (cooldownSkills.length && keyIndex < STACK_KEYS.length) {
    const key = STACK_KEYS[keyIndex];
    const filler = fillerQueue.shift() ?? null;
    const take = cooldownSkills.splice(0, STACK_ROWS - 1).map(name => entry(name, 'macro'));
    if (filler) take.push(entry(filler, 'macro'));
    stacks[key] = { key, skills: take, solo: false, reason: null, fillerMissing: take.length > 1 && !filler ? noFillerReason() : null };
    keyIndex += 1;
  }
  // A filler no stack used still goes on the bar, on its own key: it never needs a stack.
  const freeKeys = () => SKILL_BAR_KEYS.filter(key => !stacks[key].skills.length);
  for (const name of fillerQueue) {
    if (placed.has(name)) continue;
    const key = STACK_KEYS.find(item => !stacks[item].skills.length) ?? freeKeys()[0];
    if (key) solo(key, name, 'macro', 'The filler: no cooldown, so it never needs a stack.');
  }
  // Charged skills and skills the build fires by hand: a key of their own, Q and E first.
  const soloQueue = [
    ...steps.filter(step => step.charged && !placed.has(step.name)).map(step => [step.name, 'charged', 'A charged skill: hold the key, so it gets a key of its own (stack rule).']),
    ...manual.filter(name => !placed.has(name)).map(name => [name, 'manual', 'The build fires it by hand when you need it, so it gets a key of its own (stack rule: heals, defensives, big buffs and charged skills stay out of stacks).'])
  ];
  for (const key of ['Q', 'E']) { const next = soloQueue.shift(); if (next) solo(key, ...next); }
  for (const next of soloQueue) { const key = freeKeys()[0]; if (!key) break; solo(key, ...next); }
  // Key skills and Daevanion node skills the rotation does not use, then other actives in unlock order, one per free key.
  const nodeSkills = isPending(build.daevanion) ? [] : (build.daevanion?.skillNodes ?? []).filter(name => byName.has(name));
  const rest = [...coreNames, ...nodeSkills, ...actives.map(skill => skill.name)].filter((name, index, all) => all.indexOf(name) === index && !placed.has(name) && !stigmaNames.includes(name));
  const notOnBar = [];
  for (const name of rest) {
    const key = freeKeys()[0];
    if (key) { stacks[key] = { key, skills: [entry(name, corePriority.has(name) ? 'key' : nodeSkills.includes(name) ? 'build' : 'other')], solo: false, reason: null, fillerMissing: null }; continue; }
    const skill = byName.get(name);
    notOnBar.push({ name, icon: skill.icon, unlockLevel: skill.needLevel, reason: 'No key left: the build does not use it. Swap it in if you like it.' });
  }
  // A follow-up goes above its lead-in only once the chain rule is confirmed, and always under the stack's filler.
  if (chains?.confirmed) {
    for (const chain of chains.chains) {
      if (chain.pending || !byName.has(chain.followUp) || placed.has(chain.followUp)) continue;
      const stack = Object.values(stacks).find(item => !item.solo && item.skills.length < STACK_ROWS && item.skills.some(skill => chain.leadIns.includes(skill.name)));
      if (!stack) continue;
      const at = stack.skills.findIndex(skill => chain.leadIns.includes(skill.name));
      stack.skills.splice(at + 1, 0, entry(chain.followUp, 'chain'));
    }
  }
  // What each key fires at this level: the open skills in row order, and the level the next locked one opens.
  for (const stack of Object.values(stacks)) {
    const locked = stack.skills.filter(skill => skill.locked);
    stack.firesNow = stack.skills.filter(skill => !skill.locked).map(skill => skill.name);
    stack.nextUnlock = locked.length ? Math.min(...locked.map(skill => skill.unlockLevel)) : null;
  }
  const bars = Array.from({ length: STACK_ROWS }, (_, row) => Object.fromEntries(SKILL_BAR_KEYS.map(key => {
    const skill = stacks[key].skills[row] ?? null;
    return [key, skill ? { ...skill, key, row, fixed: skill.role === 'fixed' } : null];
  })));
  bars[0].LMB.fixed = true;
  const result = {
    keys: SKILL_BAR_KEYS, rows: STACK_ROWS, stacks, bars, basic: basic.name, notOnBar, stigmas: stigmaNames, fillers, stackFillers,
    rule: { status: rule.status, confirmed: rule.confirmed, text: rule.text, rules: rule.rules ?? [] }, macroKey: facts['macro-order']?.value ? true : false
  };
  result.problems = [...stackProblems(result), ...fillerProblems(result), ...stigmaKeyProblems(result)];
  return result;
}

/** Stack rule check: a no-cooldown skill never sits below a cooldown skill, at most one filler per key, at most four rows. The data fails when this returns anything. */
export function stackProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    const list = stack.skills;
    if (list.length > STACK_ROWS) problems.push(`key ${stack.key}: ${list.length} skills, the game holds ${STACK_ROWS}`);
    if (list.filter(skill => skill.noCooldown).length > 1) problems.push(`key ${stack.key}: two no-cooldown skills, only the lowest would ever fire`);
    list.forEach((skill, row) => {
      if (!skill.noCooldown) return;
      const above = list.slice(row + 1).find(item => (item.cooldownSeconds ?? 0) > 0 || item.cooldownPending);
      if (above) problems.push(`key ${stack.key}: ${skill.name} (no cooldown) on row ${row} blocks ${above.name} above it`);
    });
  }
  return problems;
}

/**
 * Filler rule check: a key that holds two or more skills has a no-cooldown skill on its top filled row, so the key always
 * does something. A stack the build has no filler for passes only when it carries the reason (fillerMissing).
 */
export function fillerProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    const list = stack.skills;
    if (list.length < 2) continue;
    if (!list.at(-1).noCooldown && !stack.fillerMissing) problems.push(`key ${stack.key}: ${list.at(-1).name} on the top row has a cooldown and the stack names no reason`);
    if (stack.fillerMissing && (skillBar.stackFillers ?? []).some(name => !Object.values(skillBar.stacks).some(other => other.skills.some(skill => skill.name === name)))) problems.push(`key ${stack.key}: no filler on top, but the build's filler is not on the bar`);
  }
  return problems;
}

/** Stigma rule check: a stigma is never in a stack, and with four stigmas, keys 5 to 8 hold them in slot order. */
export function stigmaKeyProblems(skillBar) {
  const problems = [];
  for (const stack of Object.values(skillBar?.stacks ?? {})) {
    if (stack.skills.length > 1 && stack.skills.some(skill => skill.stigma)) problems.push(`key ${stack.key}: a stigma in a stack (${stack.skills.filter(skill => skill.stigma).map(skill => skill.name).join(', ')})`);
  }
  const names = skillBar?.stigmas ?? [];
  if (names.length === STIGMA_KEYS.length) {
    STIGMA_KEYS.forEach((key, index) => {
      const held = skillBar.stacks[key]?.skills.map(skill => skill.name) ?? [];
      if (held.length !== 1 || held[0] !== names[index]) problems.push(`key ${key}: holds ${held.join(', ') || 'nothing'}, the build's stigma ${index + 1} is ${names[index]}`);
    });
  }
  return problems;
}

/**
 * Macro 1 from the keys: the keys the rotation uses, in the build's order, each with its stack, so a stacked key goes
 * into the macro once and never doubles up with its own skills. How the game picks the next entry is the macro-order
 * rule (unconfirmed: listed order, or a stack); a stacked key running its whole stack is a guide note, not tested. The
 * fallback is the rotation's skills one by one, for when a test shows a key fires only row 0. Facts (slots, delay,
 * hold, binding) come from progression.json through that rule.
 */
function planMacro({ rotation, skillBar, mechanics, level }) {
  const rule = ruleOf(mechanics, 'macro-order');
  const base = { status: rule.status, confirmed: rule.confirmed, text: rule.text ?? '', options: rule.options ?? [], notes: rule.notes ?? [], test: rule.test ?? null, facts: rule.facts ?? null };
  if (!rotation || isPending(rotation) || !skillBar) return { ...base, pending: isPending(rotation) ? rotation : null, entries: [], keys: [], slots: [], later: [], fallback: [], manual: [], filler: null };
  const where = name => {
    for (const stack of Object.values(skillBar.stacks)) { const row = stack.skills.findIndex(skill => skill.name === name); if (row >= 0) return { key: stack.key, row, solo: stack.solo || stack.skills.length === 1 }; }
    return null;
  };
  const barNames = Object.values(skillBar.stacks).flatMap(stack => stack.skills.map(skill => skill.name)).sort((a, b) => b.length - a.length);
  const entries = rotation.steps.map(step => {
    const name = barNames.find(item => String(step.text).startsWith(item)) ?? null;
    const at = name ? where(name) : null;
    return { ...step, name, key: at?.key ?? null, row: at?.row ?? null, soloKey: at?.solo ?? false, charged: /charged/i.test(step.text) };
  });
  const keys = entries.filter(item => item.key).map(item => item.key).filter((key, index, all) => all.indexOf(key) === index);
  // One macro entry per key: the whole stack, each row with its lock. A key fires now when any of its skills is open.
  const slots = keys.map(key => {
    const stack = skillBar.stacks[key];
    const skills = stack.skills.map((skill, row) => ({ name: skill.name, row, locked: skill.locked, unlockLevel: skill.unlockLevel }));
    const open = skills.filter(skill => !skill.locked);
    return { key, stacked: skills.length > 1, skills, usable: open.length > 0, firesNow: open.map(skill => skill.name), unlockLevel: open.length ? null : Math.min(...skills.map(skill => skill.unlockLevel)) };
  });
  // The fallback: the rotation's open skills one by one, in the build's order, each once.
  const fallback = entries.filter(item => item.name && !item.locked).map(item => item.name).filter((name, index, all) => all.indexOf(name) === index);
  // Skills the build fires by hand: kept on their own keys once open, under Add later until then.
  const manual = (rotation.manual ?? []).map(text => {
    const name = barNames.find(item => String(text).startsWith(item)) ?? null;
    const cell = name ? Object.values(skillBar.stacks).flatMap(stack => stack.skills).find(skill => skill.name === name) : null;
    return { text, name, locked: Boolean(cell?.locked), unlockLevel: cell?.unlockLevel ?? null };
  });
  return {
    ...base, pending: null, entries, keys, slots,
    later: slots.filter(slot => !slot.usable),
    fallback,
    filler: rotation.filler ?? null,
    manual,
    level
  };
}

/**
 * The Mastery tab: every active and passive skill (from the armory when a Daeva is loaded, otherwise
 * the build's key skills), each with its build priority, the Specialty picks for its three slots, all
 * five perks, and where the next skill points should go.
 */
function planMastery(build, catalogue, level, model, facts, gameIcons = new Map(), capRule = { cap: null, beyond: [], nodeBoards: 0 }, boards = []) {
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
  // Skill points: key skills you have, below their target, highest priority first. Each step aims for
  // the next Specialty slot or the target, whichever comes first.
  // Never a step past the Mastery cap: a skill there is listed under atCap with its next +1 source instead.
  const spend = active
    .filter(entry => entry.priority !== null && entry.unlocked !== false && entry.goal && (cap === null || entry.skillLevel === null || entry.skillLevel < cap))
    .map(entry => {
      const from = entry.skillLevel ?? 1;
      const nextSlot = slotLevels.find(slotLevel => slotLevel > from) ?? null;
      const to = Math.min(nextSlot ? Math.min(nextSlot, entry.goal) : entry.goal, cap ?? Infinity);
      const reason = nextSlot && to === nextSlot ? `opens Specialty slot ${slotLevels.indexOf(nextSlot) + 1}` : cap !== null && to === cap ? 'reaches the Mastery cap' : 'reaches the build target';
      return { name: entry.name, from: entry.skillLevel, to, reason, priority: entry.priority };
    })
    .filter(step => step.from === null || step.from < step.to);
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
