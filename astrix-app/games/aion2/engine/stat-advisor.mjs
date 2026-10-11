/**
 * Stats explained (The Aetherium). Pure functions, no network.
 *
 * Input is data/advisor/stats.json (what each of the 16 point stats feeds, what each combat stat means, where points
 * come from), a class build's stats.order (data/advisor/builds/<class>.json) and, when a Daeva is loaded, its own stat
 * list from the official data. Nothing is guessed: a build's stat order is linked to the point stats only through the
 * combat stat names its text uses ("Accuracy (enough for your content)" names Accuracy; "Survival" names none). A point
 * stat matters as much as the highest combat stat it feeds. A build with no stat order gets no ranking.
 */

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
/** The first two entries of a build's stat order are what it chases; later ones are useful. */
export const HIGH_RANKS = 2;

/** stats.json by kind: { main, deity, combat (by name), sources, rules, byId, byType }. */
export function indexStats(stats) {
  const records = stats?.records ?? [];
  const of = kind => records.filter(record => record.kind === kind);
  return {
    main: of('main'),
    deity: of('deity'),
    point: [...of('main'), ...of('deity')],
    combat: of('combat'),
    combatByName: new Map(of('combat').map(record => [record.name, record])),
    sources: of('source'),
    rules: of('rule'),
    byId: new Map(records.map(record => [record.id, record])),
    byType: new Map([...of('main'), ...of('deity')].map(record => [record.type, record]))
  };
}
const indexOf = stats => (stats?.byId instanceof Map ? stats : indexStats(stats));

/**
 * The combat stats one line of a build's stat order names, matched as whole words, longest name first, so
 * "Critical Hit Resist" is not read as "Critical Hit" and "MP Cost" not as "MP".
 */
export function combatNamesIn(text, stats) {
  const index = indexOf(stats);
  let rest = ` ${String(text)} `;
  const found = [];
  for (const name of [...index.combatByName.keys()].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^A-Za-z]|$)`, 'i');
    const hit = pattern.exec(rest);
    if (!hit) continue;
    found.push({ name, at: hit.index });
    rest = rest.slice(0, hit.index + hit[1].length) + ' '.repeat(name.length) + rest.slice(hit.index + hit[1].length + name.length);
  }
  return found.sort((a, b) => a.at - b.at).map(item => item.name);
}

/** A build's stat order as [{ rank, text, combat: [names] }], or null when the build has none. */
export function statOrder(build, stats) {
  const order = build?.stats?.order;
  if (isPending(build?.stats) || !Array.isArray(order) || !order.length) return null;
  return order.map((text, rank) => ({ rank, text, combat: combatNamesIn(text, stats) }));
}

/**
 * How much each point stat matters for one build: { [statId]: { tag, rank, feeds: [{ name, rank }] } }.
 * tag is high (feeds one of the first two entries), useful (a later entry) or low (none). null without a stat order.
 */
export function rankPointStats(build, stats) {
  const index = indexOf(stats);
  const order = statOrder(build, index);
  if (!order) return null;
  const rankOf = new Map();
  for (const entry of order) for (const name of entry.combat) if (!rankOf.has(name)) rankOf.set(name, entry.rank);
  const out = {};
  for (const stat of index.point) {
    const feeds = stat.effects.value.filter(name => rankOf.has(name)).map(name => ({ name, rank: rankOf.get(name) })).sort((a, b) => a.rank - b.rank);
    const rank = feeds.length ? feeds[0].rank : null;
    out[stat.id] = { tag: rank === null ? 'low' : rank < HIGH_RANKS ? 'high' : 'useful', rank, feeds };
  }
  return out;
}

/** The classes whose main build ranks a point stat high: only from their own data. */
export function classesWanting(statId, mainBuilds, stats, except = null) {
  return Object.entries(mainBuilds ?? {})
    .filter(([className, build]) => className !== except && rankPointStats(build, stats)?.[statId]?.tag === 'high')
    .map(([className]) => className);
}

const listWords = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const plural = className => `${className}s`;

/** One sentence on why a stat matters, or not, for this class. others: the classes that rank it high. */
export function statReason(stat, rank, className, others = []) {
  if (!rank) return `${stat.name}: no stat order for ${className} yet.`;
  const effects = stat.effects.value;
  if (rank.tag === 'low') {
    const wanted = others.length ? ` ${listWords(others.map(plural))} want it.` : '';
    return `${stat.name}: low for ${className}. It ${effects.length === 1 ? 'only raises' : 'raises'} ${listWords(effects)}, which your build does not chase.${wanted}`;
  }
  const first = rank.feeds[0];
  return `${stat.name}: ${rank.tag} for ${className}. It raises ${first.name}, your ${ORDINALS[first.rank] ?? `number ${first.rank + 1}`} stat to reach.`;
}

/**
 * The plan's stat chain: each entry of the build's stat order with the point stats that feed the combat stats it
 * names, and the Daeva's own points when there are live stats ([{ type, value }]).
 */
export function statChains(build, stats, liveStats = null) {
  const index = indexOf(stats);
  const order = statOrder(build, index);
  if (!order) return null;
  const points = new Map((liveStats ?? []).map(row => [row.type, row.value]));
  return order.map(entry => ({
    ...entry,
    links: entry.combat.map(name => ({
      name,
      meaning: index.combatByName.get(name)?.meaning.value ?? null,
      from: index.point.filter(stat => stat.effects.value.includes(name))
        .map(stat => ({ id: stat.id, name: stat.name, kind: stat.kind, points: points.has(stat.type) ? points.get(stat.type) : null }))
    }))
  }));
}

/** The gear a player picks lines on: weapon, armour, accessories, and Arcana with the Abyssal Bracelet for deity stats. */
const GEAR_ROWS = [['weapon'], ['armour'], ['accessory'], ['arcana', 'abyssal-bracelet']];

/**
 * What to look for on each kind of gear: one row per kind, the lines this build wants in its order, and the rest as
 * skip. Without a ranking every line is listed and none is skipped.
 */
export function gearRows(rank, stats) {
  const index = indexOf(stats);
  return GEAR_ROWS.map(ids => ids.map(id => index.byId.get(id)).filter(Boolean)).filter(group => group.length).map(group => {
    const source = { ...group[0], id: group.map(item => item.id).join('+'), label: listWords(group.map(item => item.label)), text: null };
    const ids = source.stats.value.includes('deity') ? index.deity.map(stat => stat.id) : source.stats.value;
    const lines = ids.map(id => index.byId.get(id)).filter(Boolean);
    const wanted = rank ? lines.filter(stat => rank[stat.id].tag !== 'low').sort((a, b) => rank[a.id].rank - rank[b.id].rank) : lines;
    const skip = rank ? lines.filter(stat => rank[stat.id].tag === 'low') : [];
    return { id: source.id, label: source.label, text: source.text ?? null, status: source.stats.status, want: wanted.map(stat => ({ id: stat.id, name: stat.name, tag: rank?.[stat.id].tag ?? null })), skip: skip.map(stat => ({ id: stat.id, name: stat.name })) };
  });
}

/** Daevanion boards whose focus (progression.json) names a combat stat this point stat feeds: another source of it. */
export function boardSources(stat, boards, stats) {
  return (boards ?? []).filter(board => combatNamesIn(board.focus ?? '', stats).some(name => stat.effects.value.includes(name)))
    .map(board => ({ id: board.id, name: board.name, names: combatNamesIn(board.focus, stats).filter(name => stat.effects.value.includes(name)) }));
}

/**
 * A sub stat line on an item, tagged for this build: a point stat line (Might) by that stat's rank, a combat stat line
 * (Critical Hit) by its place in the stat order. null when the build has no stat order or the line names nothing known.
 */
export function subStatTag(line, rank, build, stats) {
  if (!rank) return null;
  const index = indexOf(stats);
  const point = index.byType.get(line.id) ?? index.point.find(stat => stat.name === line.name);
  if (point) return rank[point.id].tag;
  const order = statOrder(build, index);
  const at = order.find(entry => entry.combat.includes(line.name));
  if (!at && !index.combatByName.has(line.name)) return null;
  return !at ? 'low' : at.rank < HIGH_RANKS ? 'high' : 'useful';
}

/** Main stats count as near 0 below this: they come from sub stat lines on Unique and crafted gear. */
export const LOW_MAIN = 10;
/** True when no main stat has reached LOW_MAIN points yet: the page explains where they come from. */
export function mostlyLow(liveStats, stats) {
  const index = indexOf(stats);
  return index.main.every(stat => ((liveStats ?? []).find(row => row.type === stat.type)?.value ?? 0) < LOW_MAIN);
}
