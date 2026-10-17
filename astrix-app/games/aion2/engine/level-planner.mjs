/**
 * The level planner for AION 2 (The Aetherium): the strongest setup a Daeva can run at any level, from the skill levels
 * they have. Pure functions, no network, and no class-specific code: a class adds data only.
 *
 * Data it reads:
 *   skills.json, per skill: values (what the skill gives: damage, enmity, survival, partyBuff, mp) and synergies (what it
 *   opens, its condition, the cooldowns it cuts or resets), each with the skill level it needs and a status.
 *   builds/<class>.json, per build: ascent (role and team weights, and the trends from published builds as preferences),
 *   plus the build's own macro block, stigmas, key skills and Specialty picks, which act as the Lv 45 target.
 *
 * How it decides: what the Daeva can place now comes first (character level, open stigma slots, skills learned). The
 * logic then scores each choice by the role and team weights over the skill's values and synergies. Trends only add a
 * small tie-breaker, and a trend the logic rejects is kept with the reason. Every choice carries a one-line reason.
 * A build with no ascent record keeps today's data and says it is not confirmed yet.
 */

export const VALUE_KEYS = Object.freeze(['damage', 'enmity', 'survival', 'partyBuff', 'mp']);
/** A trend is a tie-breaker: never more than this, so a value the role weighs always wins over it. */
const TREND_BONUS = 0.9;
/** A stigma in the build's own set of four (the Lv 45 target) beats a swap unless the swap is clearly better. */
const SET_BONUS = 3;
/** One or two levels from a Specialty slot: the step is cheap and opens a pick, so it goes up the order. */
const NEAR_SLOT_BONUS = 2;
const STACK_ROWS = 4;
/** A skill outside the build's key skills is levelled only when the role weighs it this much: Wisdom Stones are scarce. */
const EXTRA_SKILL_SCORE = 4;

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const listOf = value => (Array.isArray(value) ? value : []);
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/**
 * The weights for a build as played in a team: the build's own weights, with the team's overrides on top. Null for a
 * build with no ascent record (today's data, not confirmed yet).
 */
export function weightsFor(build, team = null) {
  const ascent = build?.ascent;
  if (!ascent || typeof ascent !== 'object' || !ascent.weights) return null;
  const override = team && ascent.teamWeights?.[team] ? ascent.teamWeights[team] : null;
  const weights = Object.fromEntries(VALUE_KEYS.map(key => [key, Number(override?.weights?.[key] ?? ascent.weights[key] ?? 0)]));
  return { weights, why: override?.why ?? ascent.why ?? null, status: ascent.status ?? 'reported', refs: [...listOf(ascent.refs), ...listOf(override?.refs)] };
}

/** A skill's own level from the Daeva's data, or null without a Daeva or when it is not learned. */
const levelOf = (ctx, name) => {
  const mine = ctx.model?.skills?.find(skill => skill.name === name);
  return mine?.acquired && Number.isInteger(mine.skillLevel) ? mine.skillLevel : null;
};
/** A value or synergy with a skill level counts only once the Daeva's skill reaches it (unknown by hand: not counted). */
const reached = (ctx, name, skillLevel) => skillLevel === null || skillLevel === undefined || (levelOf(ctx, name) ?? 0) >= skillLevel;

/**
 * Whether a skill can go on the bar at this level: { ok } or { ok: false, unlockLevel, reason }. A stigma needs one of
 * the open slots the plan fills; a skill the Daeva has not learned waits until they learn it.
 */
export function placeState(ctx, name, stigmaSet) {
  const icon = ctx.icons.get(name);
  if (!icon) return { ok: false, unlockLevel: null, reason: 'Not in this class\'s skill list.' };
  if (icon.category === 'Stigma') {
    const slot = stigmaSet.get(name);
    if (!slot) return { ok: false, unlockLevel: null, reason: 'Needs a stigma slot.' };
    if (!slot.open) return { ok: false, unlockLevel: slot.slotLevel, reason: `Stigma slot ${slot.slot} opens at Lv ${slot.slotLevel}.` };
  } else if (Number.isInteger(icon.needLevel) && ctx.level < icon.needLevel) {
    return { ok: false, unlockLevel: icon.needLevel, reason: `Unlocks at Lv ${icon.needLevel}.` };
  }
  const mine = ctx.model?.skills?.find(skill => skill.name === name);
  if (mine && (!mine.acquired || mine.skillLevel === 0)) return { ok: false, unlockLevel: null, reason: icon.category === 'Stigma' ? 'Get this stigma first.' : 'Learn it first.' };
  return { ok: true };
}

/** What one skill is worth to this role and team now: its values the level and skill level reach, weighed. */
export function valueOf(ctx, name, weights, { placeable = () => true } = {}) {
  const info = ctx.catalogue.get(name);
  let score = 0;
  let best = null;
  for (const value of listOf(info?.values)) {
    if (!reached(ctx, name, value.skillLevel ?? null)) continue;
    // A value that rests on another skill (a block's party buff needs the passive) counts once that skill is placeable.
    if (value.needs && !placeable(value.needs)) continue;
    const add = (weights?.[value.key] ?? 0) * (Number.isFinite(value.weight) ? value.weight : 1);
    score += add;
    if (add > 0 && (!best || add > best.add)) best = { add, text: value.text, status: value.status ?? info?.status ?? 'reported' };
  }
  return { score, best };
}

/** The synergies of one skill (skills.json), each with whether the Daeva's level and skill level reach it. */
export function synergiesOf(ctx, name) {
  return listOf(ctx.catalogue.get(name)?.synergies).map(item => ({ ...item, from: name, live: reached(ctx, name, item.skillLevel ?? null) }));
}
/** Every skill whose synergy opens a target skill, with the link. */
function enablersOf(ctx, target) {
  const out = [];
  for (const [name] of ctx.catalogue) for (const link of synergiesOf(ctx, name)) if (link.type === 'opens' && same(link.target, target) && link.live) out.push({ name, link });
  return out;
}
const conditionOf = (ctx, name) => synergiesOf(ctx, name).find(item => item.type === 'condition' && item.live) ?? null;
const macroUseOf = (ctx, name) => ctx.catalogue.get(name)?.macroUse ?? null;
const cooldownOf = (ctx, name) => (typeof ctx.catalogue.get(name)?.cooldownSeconds === 'number' ? ctx.catalogue.get(name).cooldownSeconds : null);

/* Stigmas. The candidates are the build's set of four (as played in the team) and its listed swaps. Each scores by the
   weights, plus the line it opens (a stigma that opens a skill in the main line is worth that skill's damage), plus the
   set bonus. Open slots take the best ones in order; the slots still to open show what goes in next. */
export function rankStigmas(ctx, weights) {
  const stigmas = ctx.build.stigmas;
  if (!stigmas || isPending(stigmas)) return [];
  const set = stigmas.slots.map(slot => slot.name);
  const names = [...set, ...listOf(stigmas.alternatives).map(alt => alt.name)].filter((name, index, all) => all.indexOf(name) === index);
  const lineNames = lineRows(ctx.build).map(row => row.name);
  const placeable = name => ctx.icons.get(name)?.category !== 'Stigma' && (!Number.isInteger(ctx.icons.get(name)?.needLevel) || ctx.icons.get(name).needLevel <= ctx.level);
  const scored = names.map((name, order) => {
    const own = weights ? valueOf(ctx, name, weights.weights, { placeable }) : { score: 0, best: null };
    const opens = synergiesOf(ctx, name).find(link => link.type === 'opens' && link.live && lineNames.some(row => same(row, link.target))) ?? null;
    const lineBonus = weights && opens ? weights.weights.damage : 0;
    const inSet = set.includes(name);
    const alt = listOf(stigmas.alternatives).find(item => item.name === name) ?? null;
    const score = weights ? own.score + lineBonus + (inSet ? SET_BONUS : 0) - order / 100 : -order;
    const why = opens ? opens.text : own.best?.text ?? alt?.why ?? (inSet ? 'In the build\'s set of four.' : null);
    return { name, score, inSet, why, status: opens?.status ?? own.best?.status ?? (weights ? 'reported' : null) };
  });
  return scored.sort((a, b) => b.score - a.score);
}

/** The four slots at this level: each with the stigma the plan puts in it, open or not, and why. */
export function planStigmaSlots(ctx, weights) {
  const ranked = rankStigmas(ctx, weights).filter(item => item.inSet || weights);
  const levels = ctx.facts['stigma-slots']?.value ?? [22, 27, 32, 37];
  // Without weights the build's own order stands (today's data). With weights, the best ones fill the open slots first.
  const order = weights ? ranked.slice(0, levels.length) : ranked.filter(item => item.inSet);
  return levels.map((slotLevel, index) => ({ slot: index + 1, slotLevel, open: ctx.level >= slotLevel, name: order[index]?.name ?? null, why: order[index]?.why ?? null, status: order[index]?.status ?? null }));
}

/** The rows of the build's macro block, every stack, in order. */
function lineRows(build) {
  const block = build?.macro && typeof build.macro === 'object' ? build.macro : null;
  return ['stackA', 'stackB'].flatMap(id => listOf(block?.[id]?.rows)).filter(row => row && !row.empty && row.name);
}

/** Does a stack break the stack rule: two always-ready skills, or an always-ready one below a cooldown skill? */
export function rowsBreakRule(ctx, rows) {
  const always = row => !row.empty && (row.noCooldown || cooldownOf(ctx, row.name) === 0) && !conditionOf(ctx, row.name);
  const filled = rows.filter(row => !row.empty);
  if (filled.length > STACK_ROWS) return 'more rows than a key holds';
  if (filled.filter(always).length > 1) return 'two always-ready skills on one key';
  const at = filled.findIndex(always);
  if (at >= 0 && at < filled.length - 1) return `${filled[at].name} is always ready and would block ${filled[at + 1].name}`;
  return null;
}

/**
 * The macro block at this level: every stack keeps only what the Daeva can place now. A skill that only fires on a
 * condition keeps a skill that opens it: when the build's opener is not placeable yet, the best placeable skill that
 * opens it takes its row. Line trends in their level band are tried next and kept only when the stack rule holds.
 * Own keys and the opener keep what is placeable. Everything else is listed in later, with when or why.
 */
export function planBlock(ctx, weights, stigmaSet) {
  const block = ctx.build.macro && typeof ctx.build.macro === 'object' ? ctx.build.macro : null;
  if (!block) return { block: null, later: [], trends: [] };
  const can = name => placeState(ctx, name, stigmaSet);
  const later = [];
  const trends = [];
  const placedNames = new Set();
  const ownNames = listOf(block.ownKeys).flatMap(item => (Array.isArray(item.stack) ? item.stack : [item.name]));
  const out = structuredClone(block);
  for (const id of ['stackA', 'stackB']) {
    const stack = out[id];
    if (!stack?.rows?.length) continue;
    const removed = [];
    let rows = [];
    stack.rows.forEach((row, index) => {
      if (row?.empty) { rows.push(row); return; }
      const state = can(row.name);
      if (state.ok) rows.push(row);
      else { removed.push({ ...row, index, state }); later.push({ name: row.name, where: stack.name ?? id, unlockLevel: state.unlockLevel, reason: state.reason }); }
    });
    // A conditional skill with no skill on the key to open it: bring in the best placeable one that does.
    for (const row of rows.filter(item => !item.empty)) {
      const condition = conditionOf(ctx, row.name);
      if (!condition) continue;
      const openers = enablersOf(ctx, row.name);
      if (openers.some(item => rows.some(r => r.name === item.name))) continue;
      const pick = openers
        .filter(item => !rows.some(r => r.name === item.name) && !ownNames.includes(item.name) && item.name !== block.mainAttack?.name && macroUseOf(ctx, item.name)?.value !== 'own-key' && can(item.name).ok)
        .map(item => ({ ...item, score: weights ? valueOf(ctx, item.name, weights.weights).score : 0 }))
        .sort((a, b) => b.score - a.score)[0];
      if (!pick) continue;
      const lost = removed.find(item => openers.some(opener => opener.name === item.name)) ?? null;
      const why = lost ? `${pick.link.text} It opens ${row.name} until ${lost.name} ${lost.state.unlockLevel ? `comes at Lv ${lost.state.unlockLevel}` : 'is in a slot'}.` : `${pick.link.text} It opens ${row.name}.`;
      // Below the skill it opens, so it fires first: the build's own row for the skill it stands in for, else row 0.
      const at = rows.findIndex(item => item.name === row.name);
      rows.splice(at, 0, { name: pick.name, why, standIn: lost?.name ?? null, status: pick.link.status ?? 'reported' });
    }
    // Line trends in their level band (data: ascent.preferences, kind "line"): kept only when the logic agrees.
    for (const pref of listOf(ctx.build.ascent?.preferences).filter(item => item.kind === 'line' && (item.stack ?? 'stackB') === id)) {
      if (ctx.level < (pref.from ?? 1) || ctx.level > (pref.to ?? Infinity)) continue;
      const verdict = tryLineTrend(ctx, rows, pref, can, ownNames, block);
      trends.push({ ...pref, used: verdict.ok, verdict: verdict.why });
      if (verdict.ok) rows = verdict.rows;
    }
    // Rows only keep their place relative to each other: what is gone closes up, the build's deliberate gaps stay
    // between two filled rows. A gap left at the top or the bottom says nothing and goes.
    while (rows.length && rows[0].empty) rows.shift();
    while (rows.length && rows.at(-1).empty) rows.pop();
    stack.rows = rows.slice(0, STACK_ROWS);
    rows.forEach(row => { if (!row.empty) placedNames.add(row.name); });
  }
  const keep = name => {
    const state = can(name);
    if (!state.ok && !later.some(item => item.name === name)) later.push({ name, where: 'own key', unlockLevel: state.unlockLevel, reason: state.reason });
    return state.ok;
  };
  // Every own key keeps its place: a skill the Daeva cannot place yet leaves its key free (reserved), so no skill moves
  // to another key as the Daeva levels. Copy this bar skips a free key.
  out.ownKeys = listOf(block.ownKeys).map(item => {
    const names = Array.isArray(item.stack) ? item.stack : [item.name];
    const live = names.filter(keep);
    if (!live.length) return { reserved: names, reason: item.reason ?? null, label: item.label ?? null };
    return Array.isArray(item.stack) ? { ...item, stack: live, waiting: names.filter(name => !live.includes(name)) } : item;
  });
  out.opener = listOf(block.opener).filter(name => can(name).ok);
  if (block.mainAttack?.name && !can(block.mainAttack.name).ok) delete out.mainAttack;
  return { block: out, later: later.sort((a, b) => (a.unlockLevel ?? 99) - (b.unlockLevel ?? 99)), trends };
}

/** One line trend against the logic: { ok, rows, why }. */
function tryLineTrend(ctx, rows, pref, can, ownNames, block) {
  const name = pref.skill;
  const state = can(name);
  if (!state.ok) return { ok: false, why: `Not placeable yet: ${state.reason}` };
  if (rows.some(row => row.name === name)) return { ok: false, why: 'Already on this key.' };
  if (ownNames.includes(name) || macroUseOf(ctx, name)?.value === 'own-key') return { ok: false, why: 'It belongs on its own key, not in the macro line.' };
  if (name === block.mainAttack?.name) return { ok: false, why: 'It is the main attack: held with the macro key, never in it.' };
  const filled = rows.filter(row => !row.empty);
  if (filled.length >= STACK_ROWS) return { ok: false, why: 'No free row: the key holds four.' };
  const next = rows.map(row => ({ ...row }));
  const gap = next.findIndex(row => row.empty);
  const entry = { name, why: pref.why ?? null, trend: pref.id, status: pref.status ?? 'reported' };
  // Into the build's gap when there is one, else just under the always-ready filler on top.
  if (gap >= 0) next.splice(gap, 1, entry);
  else next.splice(Math.max(0, next.length - 1), 0, entry);
  const broken = rowsBreakRule(ctx, next);
  if (broken) return { ok: false, why: `Breaks the stack rule: ${broken}.` };
  return { ok: true, rows: next, why: pref.why ?? 'Fits the stack rule and fills a free row.' };
}

/* Mastery. The skills the Daeva can level now, in the order the logic gives: what each is worth to the role and team,
   plus what its next Specialty pick opens, a bonus when it is one or two levels from that slot, and the build's own
   priority as a tie-breaker only. Every step stops at the next Specialty slot or the Mastery cap, never past it. */
export function orderMastery(ctx, weights, { entries, cap, slotLevels, picks = new Map(), stigmaSet = new Map() }) {
  const core = new Map(listOf(ctx.build.coreSkills).map(skill => [skill.name, skill]));
  const size = Math.max(1, core.size);
  const placeable = name => placeState(ctx, name, stigmaSet).ok;
  const steps = [];
  for (const entry of entries) {
    const key = core.get(entry.name) ?? null;
    if (entry.unlocked === false || entry.acquired === false) continue;
    const own = weights ? valueOf(ctx, entry.name, weights.weights, { placeable }) : { score: 0, best: null };
    // Without weights only the build's key skills are levelled (today's data). With weights, any skill worth something.
    if (!key && !(own.score >= EXTRA_SKILL_SCORE)) continue;
    if (!weights && (!key || entry.category !== 'Active')) continue;
    const goal = cap ?? (Number(/Lv\s*(\d+)/i.exec(key?.target ?? '')?.[1]) || null);
    if (!goal) continue;
    const from = entry.skillLevel;
    if (from !== null && from >= goal) continue;
    const at = from ?? 1;
    const nextSlot = slotLevels.find(level => level > at) ?? null;
    const to = Math.min(nextSlot ? Math.min(nextSlot, goal) : goal, cap ?? Infinity);
    if (from !== null && from >= to) continue;
    // What the next slot's pick is worth: its values, and a synergy it opens only once its target is placeable.
    const pick = (picks.get(entry.name) ?? []).find(item => item.skillLevel === to) ?? null;
    const pickValue = weights && pick?.values ? pick.values.reduce((sum, value) => sum + (weights.weights[value.key] ?? 0) * (Number.isFinite(value.weight) ? value.weight : 1) * (value.needs && !placeable(value.needs) ? 0 : 1), 0) : 0;
    const near = !waitsFor(ctx, entry.name, to) && from !== null && nextSlot === to && to - from <= 2 ? NEAR_SLOT_BONUS : 0;
    const trend = key ? TREND_BONUS * (size - key.priority + 1) / size : 0;
    const score = own.score + pickValue + near + trend;
    // The trainer sells a skill level only from a character level (tooltip training tables): a step it cannot reach yet
    // says so, and gets no "near the slot" bonus.
    const trainFrom = Number(ctx.catalogue.get(entry.name)?.training?.[String(to)]) || null;
    const waits = trainFrom && ctx.level < trainFrom ? trainFrom : null;
    const reason = nextSlot && to === nextSlot ? `opens Specialty slot ${slotLevels.indexOf(nextSlot) + 1}` : cap !== null && to === cap ? 'reaches the Mastery cap' : 'reaches the build target';
    const lead = waits ? `Train it as far as the game lets you: skill Lv ${to} is sold from character Lv ${waits}. ` : '';
    const why = lead + (near ? `${to - from === 1 ? 'One level' : 'Two levels'} from its Specialty slot ${slotLevels.indexOf(nextSlot) + 1}${pick ? `: ${pick.pick}` : ''}.`
      : pickValue > 0 && pick ? `Skill Lv ${to} opens its Specialty pick: ${pick.pick}.`
      : own.best ? own.best.text
      : key?.why ?? '');
    steps.push({ name: entry.name, from, to, reason, priority: key?.priority ?? null, score, why: why || null, waits, status: own.best?.status ?? null });
  }
  return steps.sort((a, b) => b.score - a.score || (a.priority ?? 99) - (b.priority ?? 99)).map((step, index) => ({ ...step, rank: index + 1 }));
}

const waitsFor = (ctx, name, to) => { const at = Number(ctx.catalogue.get(name)?.training?.[String(to)]) || null; return at && ctx.level < at ? at : null; };

/**
 * Specialty picks: in each slot the perks the catalogue lists at that skill level score by the weights; the build's own
 * pick is the tie-breaker. A slot with one perk, or perks with no values in the data, keeps the build's pick.
 */
export function pickSpecialties(ctx, weights) {
  const out = new Map();
  for (const entry of listOf(ctx.build.specialties)) {
    const info = ctx.catalogue.get(entry.skill);
    const perks = Array.isArray(info?.specialties) ? info.specialties : [];
    out.set(entry.skill, entry.picks.map(pick => {
      const options = perks.filter(perk => perk.skillLevel === pick.skillLevel && Array.isArray(perk.values));
      if (!weights || options.length < 2) return { ...pick, values: options.find(perk => perk.text === pick.perk)?.values ?? pick.values ?? null, why: pick.why ?? null };
      const score = perk => perk.values.reduce((sum, value) => sum + (weights.weights[value.key] ?? 0) * (Number.isFinite(value.weight) ? value.weight : 1), 0) + (perk.text === pick.perk ? TREND_BONUS : 0);
      const best = [...options].sort((a, b) => score(b) - score(a))[0];
      if (best.text === pick.perk) return { ...pick, values: best.values, why: best.values[0]?.text ?? pick.why ?? null };
      return { skillLevel: pick.skillLevel, pick: best.text, perk: best.text, values: best.values, refs: info.provenance?.map(source => source.ref).filter(Boolean) ?? [], why: best.values[0]?.text ?? null, over: pick.pick };
    }));
  }
  return out;
}

/* The setup at one level: stigmas, block, and a short key that says what changed between two levels. */
function setupAt(ctx, weights) {
  const slots = planStigmaSlots(ctx, weights);
  const stigmaSet = new Map(slots.filter(slot => slot.name).map(slot => [slot.name, slot]));
  const { block, later, trends } = planBlock(ctx, weights, stigmaSet);
  return { slots, stigmaSet, block, later, trends };
}
const setupKey = setup => ({
  line: ['stackA', 'stackB'].map(id => listOf(setup.block?.[id]?.rows).filter(row => !row.empty).map(row => row.name)),
  own: listOf(setup.block?.ownKeys).filter(item => !item.reserved).flatMap(item => (Array.isArray(item.stack) ? item.stack : [item.name])),
  stigmas: setup.slots.filter(slot => slot.open).map(slot => slot.name)
});

/**
 * The next level where the setup changes, with what changes and why: a stigma slot opening, a skill joining or leaving
 * the main line, a new own key, or a Daevanion board opening. Null at the cap, or when nothing changes before it.
 */
export function nextChange(ctx, weights, now, { cap = 45, boards = [] } = {}) {
  const before = setupKey(now);
  for (let level = ctx.level + 1; level <= cap; level += 1) {
    const at = setupAt({ ...ctx, level }, weights);
    const after = setupKey(at);
    const slot = at.slots.find(item => item.open && !now.slots.find(old => old.slot === item.slot)?.open);
    if (slot && slot.name) return { level, kind: 'stigma', text: `Stigma slot ${slot.slot} opens: put ${slot.name} in it.`, why: slot.why, status: slot.status };
    for (let index = 0; index < after.line.length; index += 1) {
      const joins = after.line[index].filter(name => !before.line[index].includes(name));
      const leaves = before.line[index].filter(name => !after.line[index].includes(name));
      if (!joins.length && !leaves.length) continue;
      const row = ['stackA', 'stackB'].map(id => at.block?.[id]?.rows ?? [])[index].find(item => item.name === joins[0]);
      const where = (['stackA', 'stackB'].map(id => at.block?.[id]?.name ?? null)[index] ?? 'your stack').toLowerCase();
      const both = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]);
      return { level, kind: 'line', text: joins.length && leaves.length ? `${both(joins)} ${joins.length > 1 ? 'take' : 'takes'} ${both(leaves)}'s place in the ${where}.` : joins.length ? `${both(joins)} ${joins.length > 1 ? 'join' : 'joins'} the ${where}.` : `${both(leaves)} ${leaves.length > 1 ? 'leave' : 'leaves'} the ${where}.`, why: row?.why ?? null, status: row?.status ?? null };
    }
    const own = after.own.find(name => !before.own.includes(name));
    if (own) {
      const item = listOf(at.block?.ownKeys).find(entry => entry.name === own || listOf(entry.stack).includes(own));
      return { level, kind: 'own', text: Array.isArray(item?.stack) && item.stack.length > 1 ? `${own} joins the ${String(item.label ?? 'shared').toLowerCase()} key.` : `${own} goes on its own key.`, why: item?.why ?? null, status: null };
    }
    const board = boards.find(item => item.unlockLevel === level);
    if (board) return { level, kind: 'daevanion', text: `The ${board.name} Daevanion board opens.`, why: board.focus ? `It gives ${board.focus}.` : null, status: null };
  }
  return null;
}

/**
 * The whole setup for now. ctx: { build (as played in the team), team, catalogue (Map), icons (Map), level, model,
 * facts, cap (level cap) }. Returns the stigma slots, the macro block for this level, what comes later, the trends with
 * the logic's verdict, the weights, and the next change.
 */
export function planLevelSetup(ctx, { boards = [] } = {}) {
  const weights = weightsFor(ctx.build, ctx.team);
  const now = setupAt(ctx, weights);
  // The stigma and Mastery trends: listed with the logic's verdict too, so a rejected one is never silent.
  const ranked = rankStigmas(ctx, weights);
  const stigmaTrends = listOf(ctx.build.ascent?.preferences).filter(item => item.kind === 'stigma').map(pref => {
    if (pref.slot) {
      const first = planStigmaSlots({ ...ctx, level: now.slots[pref.slot - 1]?.slotLevel ?? ctx.level }, weights)[pref.slot - 1];
      const used = Boolean(first && same(first.name, pref.skill));
      return { ...pref, used, verdict: used ? pref.why : `Slot ${pref.slot} takes ${first?.name ?? 'another stigma'}: ${first?.why ?? 'it is worth more to this role and team.'}` };
    }
    const at = ranked.findIndex(item => same(item.name, pref.skill));
    const used = at >= 0 && at < now.slots.length;
    return { ...pref, used, verdict: used ? (pref.why ?? 'In the four the logic picks.') : at < 0 ? "Not in this build's four or its swaps: no tooltip values are recorded for it yet." : `Ranked ${at + 1}: ${ranked.slice(0, now.slots.length).map(item => item.name).join(', ')} are worth more to this role and team.` };
  });
  return {
    level: ctx.level,
    confirmed: Boolean(weights) && ctx.build.ascent?.status === 'confirmed',
    planned: Boolean(weights),
    status: weights ? weights.status : null,
    weights: weights?.weights ?? null,
    weightsWhy: weights?.why ?? null,
    refs: weights?.refs ?? [],
    slots: now.slots,
    stigmaSet: now.stigmaSet,
    block: now.block,
    later: now.later,
    trends: [...now.trends, ...stigmaTrends],
    next: nextChange(ctx, weights, now, { cap: ctx.cap ?? 45, boards })
  };
}
