/**
 * Item assessment for the Gear page's Enhance tab (Miguel, 17 Oct 2026): one worn piece judged for the Daeva's class and
 * role. Is it suitable, what on it helps (bonus lines the class wants, skill boosts on its key skills), what is weak, and
 * what to look out for on the next piece. Pure: everything comes from the build record (stat order, key skills, manastone
 * advice), the stat record (High, Useful and Low tags) and the grade rule (enchant or replace). Nothing is guessed: a part
 * the data does not cover is said to be pending.
 */
import { rankPointStats, subStatTag } from './stat-advisor.mjs';

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** The build's key skills, in priority order (coreSkills), as plain names. */
export function keySkills(build) {
  return (build?.coreSkills ?? []).slice().sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map(skill => skill.name);
}

/** What the class wants from gear overall: the stat order, the manastone advice and caps, the key skills to boost. */
export function classNeeds(build) {
  if (!build) return null;
  const stats = isPending(build.stats) ? null : build.stats ?? null;
  return {
    order: Array.isArray(stats?.order) ? stats.order : [],
    orderStatus: stats?.status ?? null,
    stones: stats?.manastones && !isPending(stats.manastones) ? { advice: stats.manastones.advice ?? null, caps: stats.manastones.caps ?? [], status: stats.manastones.status ?? null } : null,
    skills: keySkills(build)
  };
}

/**
 * One piece judged for the build.
 * slot: the worn slot with its detail applied (subStats, skillPerks, grade). advice: enchantAdvice for the slot, or null.
 * Returns { verdict, title, reasons, lines: { high, useful, low, untagged }, boosts: { key, other }, lookFor } where verdict is
 * 'replace', 'hold' (below Unique, before Unique gear starts), 'weak', 'good' or 'unknown'.
 */
export function assessItem({ slot, detail = null, advice = null, build = null, stats = null }) {
  const d = detail ?? slot;
  const rank = build && stats ? rankPointStats(build, stats) : null;
  const lines = { high: [], useful: [], low: [], untagged: [] };
  for (const line of d?.subStats ?? []) {
    const tag = subStatTag(line, rank, build, stats);
    (lines[tag] ?? lines.untagged).push(line.name);
  }
  const wanted = keySkills(build);
  const perks = (d?.skillPerks ?? []).filter(perk => perk?.name);
  const boosts = {
    key: perks.filter(perk => wanted.some(name => same(name, perk.name))).map(perk => ({ name: perk.name, level: perk.level ?? null })),
    other: perks.filter(perk => !wanted.some(name => same(name, perk.name))).map(perk => ({ name: perk.name, level: perk.level ?? null }))
  };
  const reasons = [];
  let verdict = 'unknown';
  if (advice?.action === 'replace' || advice?.action === 'hold') {
    verdict = advice.action;
    reasons.push(advice.why);
  } else if (!build || !rank) {
    reasons.push('No stat order for this class yet, so its lines are not judged.');
  } else {
    const good = lines.high.length + lines.useful.length + boosts.key.length;
    const bad = lines.low.length + boosts.other.length;
    verdict = good === 0 && bad > 0 ? 'weak' : 'good';
    if (lines.high.length) reasons.push(`${lines.high.join(', ')}: ${lines.high.length === 1 ? 'a line' : 'lines'} your class wants most.`);
    if (lines.useful.length) reasons.push(`${lines.useful.join(', ')}: useful for your class.`);
    if (boosts.key.length) reasons.push(`Boosts ${boosts.key.map(perk => perk.name).join(' and ')}, ${boosts.key.length === 1 ? 'a key skill' : 'key skills'} in your build.`);
    if (lines.low.length) reasons.push(`${lines.low.join(', ')}: little use to your class.`);
    if (boosts.other.length) reasons.push(`Boosts ${boosts.other.map(perk => perk.name).join(' and ')}, not ${boosts.other.length === 1 ? 'a skill' : 'skills'} your build uses.`);
    if (!reasons.length) reasons.push('No bonus lines or skill boosts on it yet.');
  }
  const title = { replace: 'Replace it', hold: 'Wear it, do not enhance it', weak: 'Usable, but its rolls are weak for you', good: 'Suits your class', unknown: 'Not judged yet' }[verdict];
  // What to look out for on this slot's next piece: the key skills it does not boost yet, and the class's first stats.
  const order = classNeeds(build)?.order ?? [];
  const lookFor = {
    skills: wanted.filter(name => !boosts.key.some(perk => same(perk.name, name))).slice(0, 3),
    stats: order.slice(0, 3)
  };
  return { verdict, title, reasons, lines, boosts, lookFor };
}
