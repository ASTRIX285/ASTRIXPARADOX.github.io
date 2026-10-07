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
function planSkills(build, catalogue, level, model, facts) {
  const slotLevels = specialtySlotLevels(facts);
  const picksBySkill = new Map((build.specialties ?? []).map(entry => [entry.skill, entry.picks]));
  return (build.coreSkills ?? []).map(core => {
    const info = catalogue.get(core.name) ?? null;
    const unlockLevel = info && !isPending(info.unlockLevel) ? info.unlockLevel : null;
    const unlocked = unlockLevel === null ? null : level >= unlockLevel;
    const owned = modelSkill(model, core.name);
    const skillLevel = owned?.acquired ? owned.skillLevel : null;
    const nextSlot = skillLevel === null ? slotLevels[0] : slotLevels.find(threshold => threshold > skillLevel) ?? null;
    const picks = picksBySkill.get(core.name) ?? [];
    return {
      name: core.name,
      priority: core.priority,
      target: core.target,
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
    alternatives: (build.stigmas.alternatives ?? []).map(alt => ({ ...alt, icon: iconOf(alt.name) })),
    confidence: build.stigmas.confidence,
    note: build.stigmas.note ?? null,
    refs: build.stigmas.refs,
    noneAcquired: acquired ? acquired.length === 0 : null,
    // What the Daeva has equipped now (armory), so the page can say what to swap.
    equippedNow: owned ? owned.filter(skill => skill.equipped).map(skill => ({ name: skill.name, icon: skill.icon ?? null })) : null
  };
}

function planBoards(build, level, model, facts) {
  const boards = (facts['daevanion-boards']?.value ?? []).map(board => {
    const live = model?.daevanion?.find(item => item.id === board.id || item.name === board.name) ?? null;
    return {
      ...board,
      open: live ? Boolean(live.open) : level >= board.unlockLevel,
      nodesTaken: live ? live.nodesTaken : null,
      nodesTotal: live ? live.nodesTotal : null
    };
  });
  return {
    boards,
    priorities: isPending(build.daevanion) ? build.daevanion : build.daevanion.priorities,
    // Skills whose +1 nodes the board planner routes to first, in order (falls back to the core skills).
    skillNodes: (!isPending(build.daevanion) && build.daevanion.skillNodes) || (build.coreSkills ?? []).map(skill => skill.name),
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

const enchantFix = slot => !slot.empty && slot.enchant === 0;

/**
 * The ranked "do this now" list. Fixes from the armory come first (they are about this exact
 * character), then the build steps that apply at this level.
 */
function nowList(level, build, skills, stigmas, boards, model) {
  const list = [];
  const push = (rank, title, detail, refs = [], kind = 'build', view = 'mastery') => list.push({ rank, title, detail, refs, kind, view });

  if (model) {
    const empty = model.gear.filter(slot => slot.empty);
    if (empty.length) push(10, `Fill ${empty.length} empty gear ${empty.length === 1 ? 'slot' : 'slots'}`, `Nothing is worn in: ${empty.map(slot => slot.slot.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}. Any item beats an empty slot.`, [], 'armory', 'gear');
    const bare = model.gear.filter(enchantFix);
    if (bare.length) push(30, `Enchant ${bare.length} worn ${bare.length === 1 ? 'item' : 'items'} above +0`, `Still at +0: ${bare.map(slot => slot.name).join(', ')}.`, [], 'armory', 'gear');
    const openUnspent = boards.boards.filter(board => board.open && board.nodesTaken === 0);
    if (openUnspent.length) push(20, `Spend points on the ${openUnspent.map(board => board.name).join(' and ')} Daevanion ${openUnspent.length === 1 ? 'board' : 'boards'}`, `${openUnspent.length === 1 ? 'It is' : 'They are'} open with no nodes taken. Start with: ${Array.isArray(boards.priorities) ? boards.priorities[0] : 'your rotation skill nodes'}.`, boards.refs, 'armory', 'daevanion');
    if (!stigmas.pending && level >= stigmas.unlockLevel && stigmas.noneAcquired) push(15, 'Do the stigma quest', `You are Lv ${level} and no stigma is unlocked. Finish ${stigmas.quest ?? 'the stigma quest'} to open them.`, stigmas.refs, 'armory', 'stigma');
    for (const skill of skills) {
      if (skill.unlocked && skill.skillLevel !== null && skill.equipped === false) push(25, `Put ${skill.name} on your skill bar`, 'You have it but it is not equipped.', skill.refs, 'armory', 'mastery');
    }
  }

  const ready = skills.filter(skill => skill.unlocked !== false);
  if (ready.length && model) {
    const owned = ready.filter(skill => skill.skillLevel !== null).sort((a, b) => a.skillLevel - b.skillLevel || a.priority - b.priority);
    const focus = owned.find(skill => skill.skillLevel < 8) ?? owned[0] ?? ready[0];
    push(40, `Level ${focus.name}${focus.skillLevel !== null ? ` (now Lv ${focus.skillLevel})` : ''}`, `${focus.why} Target: ${focus.target}.${focus.skillLevel !== null && focus.skillLevel < 8 ? ' Skill Lv 8 opens its first Specialty perk.' : ''}`, focus.refs);
  } else if (ready.length) {
    push(40, `Level your skills in this order: ${ready.map(skill => skill.name).join(', ')}`, 'Spend Wisdom Stones on the first one until it reaches skill Lv 8, which opens its first Specialty perk, then move down the list.', ready.flatMap(skill => skill.refs));
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
    // The game's icon for each skill the armory lists (empty without a Daeva).
    skillIcons: { ...Object.fromEntries([...gameIcons.values()].map(skill => [skill.name, skill.icon])), ...Object.fromEntries((model?.skills ?? []).filter(skill => skill.icon).map(skill => [skill.name, skill.icon])) }
  };
  if (build.status === 'pending') {
    return { ...base, pending: build.build, now: [], skills: [], stigmas: { pending: build.build }, daevanion: planBoards({ daevanion: build.build }, lvl, model, facts), stats: build.build, rotation: build.build, upcoming: [] };
  }
  const catalogue = skillIndex(data.skills, className);
  const skills = planSkills(build, catalogue, lvl, model, facts);
  const stigmas = planStigmas(build, lvl, model, facts, gameIcons);
  const daevanion = planBoards(build, lvl, model, facts);
  const mastery = planMastery(build, catalogue, lvl, model, facts, gameIcons);
  const rotation = planRotation(build.rotation, catalogue, lvl, stigmas);
  return {
    ...base,
    pending: null,
    now: nowList(lvl, build, skills, stigmas, daevanion, model),
    skills,
    stigmas,
    daevanion,
    stats: build.stats,
    rotation,
    levelNotes: (build.levelNotes ?? []).filter(note => lvl <= note.to),
    upcoming: upcoming(lvl, skills, stigmas, daevanion, facts),
    mastery,
    skillBar: planSkillBar({ build, rotation, stigmas, gameIcons, level: lvl, facts })
  };
}

/**
 * Where each skill goes on the game's skill bar: 4 bars (0 is the one you fight on), keys 1 to 8,
 * Q, E, left click and right click. Left click always holds the class's basic skill and cannot be
 * moved (in-game capture). The rest follows the build: key skills on 1 to 4 in the order you level
 * them, then the macro's skills, skills the build fires by hand on Q and E, stigmas on 5 to 8, and
 * every other skill on bar 1.
 */
export const SKILL_BAR_KEYS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E', 'LMB', 'RMB']);
const manualNames = (rotation, nameIn) => (isPending(rotation) || !rotation ? [] : (rotation.manual ?? []).map(nameIn).filter(Boolean));
function planSkillBar({ build, rotation, stigmas, gameIcons, level, facts }) {
  const skills = [...gameIcons.values()];
  if (!skills.length) return null;
  const actives = skills.filter(skill => skill.category === 'Active');
  const byName = new Map(skills.map(skill => [skill.name, skill]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const nameIn = text => names.find(name => String(text).startsWith(name)) ?? null;
  const basic = actives[0];
  const placed = new Set([basic.name]);
  const cell = (key, name, role, rank = null) => {
    const skill = byName.get(name);
    placed.add(name);
    const unlockLevel = role === 'stigma' ? (stigmas.slots.find(slot => slot.name === name)?.slotLevel ?? skill.needLevel) : skill.needLevel;
    return { key, name, icon: skill.icon, role, rank, unlockLevel, locked: level < unlockLevel };
  };
  const bars = [0, 1, 2, 3].map(() => Object.fromEntries(SKILL_BAR_KEYS.map(key => [key, null])));
  bars[0].LMB = { ...cell('LMB', basic.name, 'fixed'), fixed: true };

  const keySkills = (build.coreSkills ?? []).slice().sort((a, b) => a.priority - b.priority).map(skill => skill.name).filter(name => byName.has(name) && !placed.has(name));
  const macro = isPending(rotation) || !rotation ? [] : rotation.steps.map(step => nameIn(step.text)).filter(Boolean);
  const manual = isPending(rotation) || !rotation ? [] : (rotation.manual ?? []).map(nameIn).filter(Boolean);
  const stigmaNames = stigmas.pending ? [] : stigmas.slots.map(slot => slot.name).filter(name => byName.has(name));

  const queue = [];
  for (const name of keySkills) queue.push([name, 'key', keySkills.indexOf(name) + 1]);
  for (const name of macro) if (!keySkills.includes(name) && !stigmaNames.includes(name)) queue.push([name, 'macro', null]);
  // Then the skills the build takes Daevanion nodes for, then any other active, in unlock order.
  const nodeSkills = isPending(build.daevanion) ? [] : (build.daevanion?.skillNodes ?? []).filter(name => byName.has(name));
  for (const name of nodeSkills) if (!queue.some(([item]) => item === name) && !stigmaNames.includes(name)) queue.push([name, 'build', null]);
  for (const skill of actives) if (!queue.some(([item]) => item === skill.name) && !manualNames(rotation, nameIn).includes(skill.name)) queue.push([skill.name, 'spare', null]);
  const free = key => !bars[0][key];
  for (const key of ['1', '2', '3', '4', 'RMB']) {
    const next = queue.find(([name]) => !placed.has(name));
    if (next && free(key)) bars[0][key] = cell(key, next[0], next[1], next[2]);
  }
  for (const key of ['Q', 'E']) {
    const name = manual.find(item => !placed.has(item) && !stigmaNames.includes(item));
    if (name) { bars[0][key] = cell(key, name, 'manual'); continue; }
    const next = queue.find(([item]) => !placed.has(item));
    if (next) bars[0][key] = cell(key, next[0], next[1], next[2]);
  }
  ['5', '6', '7', '8'].forEach((key, index) => { if (stigmaNames[index] && !placed.has(stigmaNames[index])) bars[0][key] = cell(key, stigmaNames[index], 'stigma'); });
  // Anything left from the build first, then every other active, on bar 1 in unlock order.
  const rest = [...queue.map(([name]) => name), ...manual, ...actives.map(skill => skill.name)].filter((name, index, all) => all.indexOf(name) === index && !placed.has(name));
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E', 'RMB']) {
    const name = rest.find(item => !placed.has(item));
    if (!name) break;
    bars[1][key] = cell(key, name, 'spare');
  }
  return { keys: SKILL_BAR_KEYS, bars, basic: basic.name, macroKey: facts['macro-order']?.value ? true : false };
}

/**
 * The Mastery tab: every active and passive skill (from the armory when a Daeva is loaded, otherwise
 * the build's key skills), each with its build priority, the Specialty picks for its three slots, all
 * five perks, and where the next skill points should go.
 */
function planMastery(build, catalogue, level, model, facts, gameIcons = new Map()) {
  const slotLevels = specialtySlotLevels(facts);
  const core = new Map((build.coreSkills ?? []).map(skill => [skill.name, skill]));
  const picks = new Map((build.specialties ?? []).map(entry => [entry.skill, entry.picks]));
  const goalOf = target => Number(/Lv\s*(\d+)/i.exec(target ?? '')?.[1]) || null;
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
        pick: skillPicks[index] ?? null
      }))
    };
  });
  const byPriority = (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || (a.needLevel ?? 0) - (b.needLevel ?? 0);
  const active = entries.filter(entry => entry.category === 'Active').sort(byPriority);
  const passive = entries.filter(entry => entry.category === 'Passive').sort((a, b) => (a.needLevel ?? 0) - (b.needLevel ?? 0));
  // Skill points: key skills you have, below their target, highest priority first. Each step aims for
  // the next Specialty slot or the target, whichever comes first.
  const spend = active
    .filter(entry => entry.priority !== null && entry.unlocked !== false && entry.goal)
    .map(entry => {
      const from = entry.skillLevel ?? 1;
      const nextSlot = slotLevels.find(slotLevel => slotLevel > from) ?? null;
      const to = nextSlot ? Math.min(nextSlot, entry.goal) : entry.goal;
      return { name: entry.name, from: entry.skillLevel, to, reason: nextSlot && to === nextSlot ? `opens Specialty slot ${slotLevels.indexOf(nextSlot) + 1}` : 'reaches the build target', priority: entry.priority };
    })
    .filter(step => step.from === null || step.from < step.to);
  return { active, passive, spend, slotLevels, fromArmory: Boolean(model) };
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
