/**
 * Daevanion route planner for AION 2 (The Aetherium). Pure, no network.
 *
 * Input is one board's nodes from the armory (armory-adapter.mjs adaptDaevanionBoard: row, col,
 * type, grade, name, taken, effects) and the build's skill-node priorities. Output is the board
 * as a grid plus a numbered route: which node to take next, in order, and why.
 *
 * Rules the route follows:
 *   - A node can only be taken when it touches (side by side) a node you already have; the
 *     board starts from its centre Start node. This matches the in-game board, where taken
 *     nodes form one connected shape from the centre.
 *   - First the +1 skill nodes for the build's key skills, in the guide's order (MetaBot
 *     Daevanion guide: rotation skill nodes first).
 *   - Then the Unique corner nodes, nearest first (MetaBot: paths to the unique corners next).
 *   - Each step uses the shortest path from what you already have, so filler stat nodes are
 *     only taken when they are on the way.
 */

const key = (row, col) => `${row}:${col}`;

/**
 * Points per node by grade. MetaBot gives skill nodes 3 points and the Unique corners 4; Common 1 and
 * Rare 2 are the values that make each board add up to MetaBot's totals (Nezekan 134 points:
 * 62 x 1 + 10 x 2 + 12 x 3 + 4 x 4). Not shown by the armory, so the page says to check in game.
 */
export const NODE_COST = Object.freeze({ Common: 1, Rare: 2, Legend: 3, Unique: 4 });
export const nodeCost = node => (node.type === 'Start' ? 0 : NODE_COST[node.grade] ?? 1);
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** The skill a SkillLevel node raises ("Skill Level Up - Rending Blow" or effect "Rending Blow +1"). */
export function nodeSkill(node) {
  if (node.type !== 'SkillLevel') return null;
  const fromName = /Skill Level Up\s*-\s*(.+)$/.exec(node.name ?? '');
  if (fromName) return fromName[1].trim();
  const fromEffect = /^(.+?)\s*\+\d+$/.exec(node.effects?.[0] ?? '');
  return fromEffect ? fromEffect[1].trim() : null;
}

/** What kind of tile this is on screen. */
export function nodeKind(node) {
  if (node.type === 'Start') return 'start';
  if (node.type === 'SkillLevel') return node.grade === 'Legend' ? 'active-skill' : 'passive-skill';
  if (node.type === 'Stat') return node.grade === 'Unique' ? 'unique' : 'stat';
  return 'other';
}

/** Shortest paths from every owned node at once (breadth first over side-by-side nodes). */
function reachFrom(owned, cells) {
  const previous = new Map();
  const queue = [];
  for (const id of owned) { previous.set(id, null); queue.push(id); }
  for (let head = 0; head < queue.length; head++) {
    const current = cells.get(queue[head]);
    for (const [dr, dc] of SIDES) {
      const next = key(current.row + dr, current.col + dc);
      if (cells.has(next) && !previous.has(next)) { previous.set(next, queue[head]); queue.push(next); }
    }
  }
  return previous;
}

/** The new nodes on the way to a target, nearest first (empty when the target is unreachable). */
function pathTo(target, previous, owned) {
  if (!previous.has(target)) return null;
  const path = [];
  for (let at = target; at !== null && !owned.has(at); at = previous.get(at)) path.unshift({ id: at, from: previous.get(at) });
  return path;
}

/**
 * @param {object} input
 * @param {Array}  input.nodes       Board nodes (adaptDaevanionBoard).
 * @param {Array}  [input.skillOrder] Skill names whose +1 nodes come first, in priority order.
 */
export function planDaevanionBoard({ nodes, skillOrder = [] }) {
  const usable = (nodes ?? []).filter(node => node.type && node.type !== 'None');
  const cells = new Map(usable.map(node => [key(node.row, node.col), node]));
  const start = usable.find(node => node.type === 'Start') ?? null;
  const rows = usable.map(node => node.row), cols = usable.map(node => node.col);
  const bounds = usable.length
    ? { top: Math.min(...rows), bottom: Math.max(...rows), left: Math.min(...cols), right: Math.max(...cols) }
    : { top: 1, bottom: 1, left: 1, right: 1 };

  const owned = new Set(usable.filter(node => node.taken).map(node => key(node.row, node.col)));
  if (start) owned.add(key(start.row, start.col));
  const takenCount = usable.filter(node => node.taken && node.type !== 'Start').length;

  const wanted = skillOrder.map(name => String(name).toLowerCase());
  const skillTargets = wanted.flatMap(name => usable.filter(node => (nodeSkill(node) ?? '').toLowerCase() === name).map(node => key(node.row, node.col)));
  const uniqueTargets = usable.filter(node => nodeKind(node) === 'unique').map(node => key(node.row, node.col));

  const route = [];
  const stepOf = new Map();
  const take = (path, target, reason) => {
    for (const { id, from } of path) {
      const node = cells.get(id);
      const parent = cells.get(from);
      const isTarget = id === target;
      const cost = nodeCost(node);
      const total = (route.at(-1)?.totalCost ?? 0) + cost;
      route.push({ step: route.length + 1, nodeId: node.nodeId, row: node.row, col: node.col, name: node.name, effects: node.effects, kind: nodeKind(node), target: isTarget, targetName: cells.get(target).effects[0] || cells.get(target).name, from: parent ? { row: parent.row, col: parent.col } : null, cost, totalCost: total, reason: isTarget ? reason : `On the way to ${cells.get(target).effects[0] || cells.get(target).name}` });
      stepOf.set(id, route.length);
      owned.add(id);
    }
  };

  if (start) {
    // Skill nodes in the guide's order.
    for (const target of skillTargets) {
      if (owned.has(target)) continue;
      const path = pathTo(target, reachFrom(owned, cells), owned);
      if (path) take(path, target, `Key skill for this build: ${nodeSkill(cells.get(target))} +1`);
    }
    // Unique corners, nearest first.
    let left = uniqueTargets.filter(id => !owned.has(id));
    while (left.length) {
      const previous = reachFrom(owned, cells);
      const options = left.map(id => ({ id, path: pathTo(id, previous, owned) })).filter(option => option.path);
      if (!options.length) break;
      options.sort((a, b) => a.path.length - b.path.length);
      const best = options[0];
      take(best.path, best.id, `Unique corner: ${cells.get(best.id).effects[0] ?? cells.get(best.id).name}`);
      left = left.filter(id => id !== best.id);
    }
  }

  const skillDone = skillTargets.filter(id => cells.get(id).taken).length;
  return {
    bounds,
    hasStart: Boolean(start),
    takenCount,
    pointsSpent: usable.filter(node => node.taken).reduce((sum, node) => sum + nodeCost(node), 0),
    pointsTotal: usable.reduce((sum, node) => sum + nodeCost(node), 0),
    totalNodes: usable.filter(node => node.type !== 'Start').length,
    targets: { skills: skillTargets.length, skillsTaken: skillDone, uniques: uniqueTargets.length },
    route,
    tiles: usable.map(node => {
      const id = key(node.row, node.col);
      return {
        nodeId: node.nodeId,
        row: node.row,
        col: node.col,
        name: node.name,
        effects: node.effects,
        kind: nodeKind(node),
        type: node.type,
        grade: node.grade ?? null,
        skill: nodeSkill(node),
        taken: Boolean(node.taken),
        step: stepOf.get(id) ?? null,
        keySkill: skillTargets.includes(id)
      };
    })
  };
}

/** Splits the route at a points budget: the steps you can take now, and what the next one needs. */
export function affordable(route, points) {
  const budget = Number(points);
  if (!Number.isFinite(budget) || budget < 0) return { now: [], later: route, shortBy: null };
  const now = route.filter(step => step.totalCost <= budget);
  const later = route.slice(now.length);
  return { now, later, shortBy: later.length ? later[0].totalCost - budget : null };
}

/**
 * Why a node is (or is not) on the route, in plain words, for the node panel.
 * context: { skillOrder, cooldowns: Map(skill name -> seconds), boardName, boardFocus }
 */
export function explainNode(tile, route, context = {}) {
  const step = route.find(item => item.nodeId === tile.nodeId) ?? null;
  const effect = tile.effects?.[0] || tile.name;
  const order = (context.skillOrder ?? []).map(name => String(name).toLowerCase());
  const board = context.boardName ?? 'this board';
  if (tile.kind === 'start') return { title: tile.name, lines: ['Where every route on this board begins. Each node you take has to touch this one or another node you already have.'] };
  if (tile.taken) return { title: tile.name, lines: [`You already have this: ${effect}.`] };

  const lines = [];
  if (tile.kind === 'active-skill' && tile.skill && order.includes(tile.skill.toLowerCase())) {
    const rank = order.indexOf(tile.skill.toLowerCase()) + 1;
    lines.push(`Raises ${tile.skill} by 1 level. ${tile.skill} is key skill ${rank} of ${order.length} for this build, so the route heads here ${rank === 1 ? 'first' : 'early'}.`);
    lines.push('A higher skill level hits harder and reaches its Specialty perks (skill Lv 8, 12 and 16) sooner.');
  } else if (tile.kind === 'unique') {
    const percent = Number(/([\d.]+)%/.exec(effect)?.[1]);
    lines.push(`One of ${board}'s core corner nodes${context.boardFocus ? ` (${context.boardFocus})` : ''}.`);
    if (/cooldown/i.test(effect) && Number.isFinite(percent)) {
      const longest = [...(context.cooldowns ?? new Map())]
        .filter(([name, seconds]) => order.includes(name.toLowerCase()) && Number.isFinite(seconds))
        .sort((a, b) => b[1] - a[1])[0];
      lines.push(longest
        ? `Every skill cooldown gets ${percent}% shorter. On ${longest[0]} (${longest[1]} s) that is about ${(longest[1] * percent / 100).toFixed(1)} s back each time, so your big hits come round more often.`
        : `Every skill cooldown gets ${percent}% shorter, so your big hits come round more often.`);
    } else if (/combat speed/i.test(effect) && Number.isFinite(percent)) {
      lines.push(`Attacks and casts come out ${percent}% faster, so the whole rotation speeds up, filler hits included.`);
    } else {
      lines.push(`Gives ${effect}.`);
    }
    lines.push('Corners cost 4 points, so the route takes them after the key skill nodes, nearest first.');
  } else if (step && !step.target) {
    lines.push(`Taken to reach ${step.targetName}: every node has to touch one you already have. On its own it gives ${effect}.`);
  } else if (tile.kind === 'passive-skill') {
    lines.push(`Raises the passive ${tile.skill ?? 'skill'} by 1. Not on the route, so take it with spare points once the route is done.`);
  } else if (tile.kind === 'active-skill') {
    lines.push(`Raises ${tile.skill ?? 'a skill'} by 1. Not one of this build's key skills, so it waits until the route is done.`);
  } else {
    lines.push(`${effect}. Not on the route: it does not lead to a key skill or a corner. Take it with spare points later.`);
  }
  return { title: tile.name, lines, step: step?.step ?? null, cost: step?.cost ?? nodeCost({ type: tile.kind === 'start' ? 'Start' : 'Stat', grade: { 'active-skill': 'Legend', 'passive-skill': 'Rare', unique: 'Unique' }[tile.kind] ?? 'Common' }) };
}

/** "Combat Speed +1.5%" to { name, value, unit }. Null when the line has no number to add up. */
export function parseEffect(text) {
  const match = /^(.*?)\s*([+-]\d+(?:\.\d+)?)(%?)$/.exec(String(text ?? '').trim());
  return match && match[1] ? { name: match[1], value: Number(match[2]), unit: match[3] } : null;
}

const sum = values => Math.round(values.reduce((total, value) => total + value, 0) * 1000) / 1000;
const signed = (value, unit) => `${value < 0 ? '-' : '+'}${Math.abs(value)}${unit}`;

/**
 * What a character's taken nodes on one board add up to, and what is left. Pure.
 * nodes: the board's nodes (adaptDaevanionBoard). plan: anything with plan.daevanion.skillNodes (the build's key skills).
 * Skill nodes ("Rending Blow +1") raise a skill; every other node adds a stat. Units stay as the armory sends them (% stays %).
 */
export function summariseBoard(nodes, plan = null) {
  const usable = (nodes ?? []).filter(node => node.type && node.type !== 'None' && node.type !== 'Start');
  const taken = usable.filter(node => node.taken);
  const totals = (list, keyOf) => {
    const groups = new Map();
    for (const node of list) for (const effect of node.effects ?? []) {
      const parsed = parseEffect(effect);
      if (!parsed) continue;
      const key = keyOf(parsed);
      const group = groups.get(key) ?? { name: parsed.name, unit: parsed.unit, values: [] };
      group.values.push(parsed.value);
      groups.set(key, group);
    }
    return [...groups.values()].map(group => ({ name: group.name, unit: group.unit, total: sum(group.values), text: `${group.name} ${signed(sum(group.values), group.unit)}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  };
  const skillEffects = totals(taken.filter(node => node.type === 'SkillLevel'), parsed => parsed.name).map(({ name, total, text }) => ({ skill: name, total, text }));
  const statEffects = totals(taken.filter(node => node.type !== 'SkillLevel'), parsed => `${parsed.name}|${parsed.unit}`);
  const wanted = (plan?.daevanion?.skillNodes ?? []).map(name => String(name).toLowerCase());
  const open = usable.filter(node => !node.taken);
  const describe = node => ({ nodeId: node.nodeId, name: node.name, text: node.effects?.[0] || node.name, cost: nodeCost(node) });
  const keySkills = open.filter(node => nodeSkill(node) && wanted.includes(nodeSkill(node).toLowerCase()))
    .sort((a, b) => wanted.indexOf(nodeSkill(a).toLowerCase()) - wanted.indexOf(nodeSkill(b).toLowerCase())).map(describe);
  const corners = open.filter(node => nodeKind(node) === 'unique').map(describe);
  return {
    takenCount: taken.length,
    totalNodes: usable.length,
    skillEffects,
    statEffects,
    left: { keySkills, corners, count: open.length, points: open.reduce((total, node) => total + nodeCost(node), 0) }
  };
}
