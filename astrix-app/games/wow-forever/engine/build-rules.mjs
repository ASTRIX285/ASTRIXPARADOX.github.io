/**
 * The Caster rules engine (WoW Forever).
 *
 * Pure functions. No game values live here: talent shapes, ranks and
 * prerequisites come from the generated database, rule values come from
 * data/rules.json (official sources only). A rule with no source is reported
 * as a pending check, never assumed.
 *
 * Every finding has: code, severity (error | warning | pending), message,
 * and evidence (a list of provenance blocks). A finding without evidence is
 * only allowed for pending checks and for input errors about the user's build.
 */

const PENDING_RULES = Object.freeze([
  ['talent.points-available', 'Total talent points at each level is not confirmed by Blizzard yet.'],
  ['talent.row-unlock', 'Points needed to unlock each talent row is not confirmed for Forever yet.'],
  ['legacy.perk-costs', 'Legacy perk ranks and costs are not published yet.']
]);

export function indexRules(rulesData) {
  const map = new Map();
  for (const r of rulesData?.records ?? []) map.set(r.id, r);
  return map;
}

export function indexDatabase(db) {
  const talents = new Map();
  for (const tree of db?.talentTrees ?? []) for (const t of tree.talents ?? []) talents.set(t.id, { talent: t, tree });
  return {
    talents,
    items: new Map((db?.items ?? []).map(i => [i.id, i])),
    trees: db?.talentTrees ?? []
  };
}

const isPending = v => Boolean(v && typeof v === 'object' && v.pending === true);
const finding = (code, severity, message, evidence = []) => ({ code, severity, message, evidence });

/** Talent checks that the client data can prove: ownership, rank range, prerequisites. */
export function checkTalents(build, index) {
  const out = [];
  const spentByTree = new Map();
  const picks = Object.entries(build?.talents ?? {}).map(([id, rank]) => ({ id: Number(id), rank }));

  for (const { id, rank } of picks) {
    const hit = index.talents.get(id);
    if (!hit) { out.push(finding('talent.unknown', 'error', `Talent ${id} is not in the pinned build.`)); continue; }
    const { talent, tree } = hit;
    const ev = [talent.provenance];
    if (!tree.classIds.includes(build.classId)) {
      out.push(finding('talent.wrong-class', 'error', `Talent ${id} belongs to another class.`, [tree.provenance, ...ev]));
      continue;
    }
    if (!Number.isInteger(rank) || rank < 1) { out.push(finding('talent.bad-rank', 'error', `Talent ${id} has rank ${rank}; ranks start at 1.`, ev)); continue; }
    if (isPending(talent.rankSpellIds)) {
      out.push(finding('talent.max-rank-unknown', 'pending', `Max rank for talent ${id} is not resolved in the data.`, ev));
    } else if (rank > talent.rankSpellIds.length) {
      out.push(finding('talent.over-max', 'error', `Talent ${id} is at rank ${rank}, max is ${talent.rankSpellIds.length}.`, ev));
    }
    spentByTree.set(tree.id, (spentByTree.get(tree.id) ?? 0) + rank);
    for (const pre of talent.prerequisites ?? []) {
      const have = build.talents[pre.talentId] ?? build.talents[String(pre.talentId)] ?? 0;
      if (have < pre.rank) {
        const preHit = index.talents.get(pre.talentId);
        out.push(finding('talent.prereq-missing', 'error',
          `Talent ${id} needs talent ${pre.talentId} at rank ${pre.rank} (you have ${have}).`,
          preHit ? [...ev, preHit.talent.provenance] : ev));
      }
    }
  }
  return { findings: out, spentByTree: Object.fromEntries(spentByTree), spent: [...spentByTree.values()].reduce((a, b) => a + b, 0) };
}

/** Legacy checks against the sourced cap. Perk contents stay pending. */
export function checkLegacy(build, rules) {
  const out = [];
  const spent = Object.values(build?.legacy ?? {}).reduce((a, b) => a + b, 0);
  const cap = rules.get('legacy.points-cap-per-character');
  if (!cap) out.push(finding('legacy.cap-unknown', 'pending', 'The Legacy points cap has no source in rules.json.'));
  else if (spent > cap.value) out.push(finding('legacy.over-cap', 'error', `${spent} Legacy points spent, the cap is ${cap.value}.`, [cap.provenance]));
  for (const v of Object.values(build?.legacy ?? {})) {
    if (!Number.isInteger(v) || v < 0) { out.push(finding('legacy.bad-points', 'error', 'Legacy points must be whole numbers, 0 or more.')); break; }
  }
  return { findings: out, spent, cap: cap ? cap.value : null };
}

/** Sums gear stats by raw client stat id. Names come from stat-types.json only when sourced. */
export function statTotals(build, index, statTypes = null) {
  const totals = new Map();
  const missing = [];
  for (const [slot, itemId] of Object.entries(build?.gear ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const item = index.items.get(itemId);
    if (!item) { missing.push({ slot, itemId }); continue; }
    if (isPending(item.stats)) continue;
    for (const { statTypeId, amount } of item.stats) {
      const row = totals.get(statTypeId) ?? { statTypeId, amount: 0, evidence: [] };
      row.amount += amount;
      row.evidence.push(item.provenance);
      totals.set(statTypeId, row);
    }
  }
  const sourced = statTypes && statTypes.source ? statTypes.types ?? {} : {};
  const rows = [...totals.values()].sort((a, b) => a.statTypeId - b.statTypeId).map(r => ({
    ...r,
    name: sourced[r.statTypeId] ?? { pending: true, reason: `Stat type ${r.statTypeId} has no sourced name yet.` }
  }));
  return { rows, missing };
}

/** Runs every check and lists the rules that could not be checked yet. */
export function reviewBuild(build, db, rulesData, statTypes = null) {
  const index = indexDatabase(db);
  const rules = indexRules(rulesData);
  const talents = checkTalents(build, index);
  const legacy = checkLegacy(build, rules);
  const stats = statTotals(build, index, statTypes);
  const gearFindings = stats.missing.map(m => finding('gear.unknown', 'error', `Item ${m.itemId} in ${m.slot} is not in the pinned build.`));
  const pending = PENDING_RULES.filter(([id]) => !rules.has(id)).map(([code, reason]) => finding(code, 'pending', reason));
  const findings = [...talents.findings, ...legacy.findings, ...gearFindings, ...pending];
  return {
    valid: !findings.some(f => f.severity === 'error'),
    findings,
    talents: { spent: talents.spent, spentByTree: talents.spentByTree },
    legacy: { spent: legacy.spent, cap: legacy.cap },
    stats: stats.rows
  };
}
