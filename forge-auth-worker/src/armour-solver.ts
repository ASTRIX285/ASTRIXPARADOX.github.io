const STAT_KEYS = ["health", "melee", "grenade", "super", "class", "weapon"] as const;
const STAT_CAP = 200;

type StatKey = typeof STAT_KEYS[number];
type StatVector = Record<StatKey, number>;

export type ArmourSolverItem = {
  itemInstanceId: string;
  itemHash: number;
  slotIndex: number;
  isExotic: boolean;
  stats: StatVector;
  setHash: number | null;
};

export type ArmourSolverRequest = {
  items: ArmourSolverItem[];
  fixedExoticHashes: number[];
  fixedExoticSlot: number;
  setSelections: Array<{ setHash: number; count: 2 | 4 }>;
  targets: StatVector;
  statPriorities: StatVector;
  openProtocolMasks: Array<{ setHash: number; two: number; four: number }>;
  limit: number;
};

type Score = {
  active: StatKey[];
  statPriorities: StatVector;
  priorityOrder: StatKey[];
  priorityShortfalls: number[];
  shortfallByStat: Partial<StatVector>;
  effectiveStats: StatVector;
  met: boolean;
  shortfall: number;
  overshoot: number;
  distance: number;
  total: number;
  effectiveTotal: number;
  priorityTotal: number;
};

export type ArmourSolverCandidate = {
  itemInstanceIds: string[];
  stats: StatVector;
  secondaryRank: number;
  signature: string;
  score: Score;
};

const finite = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const emptyVector = (): StatVector => Object.fromEntries(STAT_KEYS.map(key => [key, 0])) as StatVector;
const normaliseVector = (value: Partial<StatVector>, cap = Number.POSITIVE_INFINITY): StatVector => Object.fromEntries(STAT_KEYS.map(key => [key, Math.min(cap, Math.max(0, Math.round(finite(value?.[key]))))])) as StatVector;

function normalisePriorities(value: Partial<StatVector>): StatVector {
  const used = new Set<number>();
  return Object.fromEntries(STAT_KEYS.map(key => {
    const rank = Math.round(finite(value?.[key]));
    if (rank < 1 || rank > STAT_KEYS.length || used.has(rank)) return [key, 0];
    used.add(rank);
    return [key, rank];
  })) as StatVector;
}

function comparePriorityShortfalls(left: number[] = [], right: number[] = []): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = finite(left[index]) - finite(right[index]);
    if (delta) return delta;
  }
  return 0;
}

function scoreStats(stats: StatVector, targets: StatVector, priorities: StatVector): Score {
  const requested = normaliseVector(targets, STAT_CAP);
  const statPriorities = normalisePriorities(priorities);
  const effectiveStats = Object.fromEntries(STAT_KEYS.map(key => [key, Math.min(STAT_CAP, Math.max(0, finite(stats[key])))])) as StatVector;
  const active = STAT_KEYS.filter(key => requested[key] > 0);
  const priorityOrder = active.filter(key => statPriorities[key] > 0).sort((left, right) => statPriorities[left] - statPriorities[right]);
  let shortfall = 0, overshoot = 0, distance = 0;
  for (const key of active) {
    const delta = effectiveStats[key] - requested[key];
    if (delta < 0) shortfall += Math.abs(delta); else overshoot += delta;
    distance += Math.abs(delta);
  }
  const total = STAT_KEYS.reduce((sum, key) => sum + finite(stats[key]), 0);
  const effectiveTotal = STAT_KEYS.reduce((sum, key) => sum + effectiveStats[key], 0);
  const priorityTotal = active.reduce((sum, key) => sum + effectiveStats[key], 0);
  const shortfallByStat = Object.fromEntries(active.map(key => [key, Math.max(0, requested[key] - effectiveStats[key])])) as Partial<StatVector>;
  return { active: [...active], statPriorities, priorityOrder, priorityShortfalls: priorityOrder.map(key => finite(shortfallByStat[key])), shortfallByStat, effectiveStats, met: active.length > 0 && shortfall === 0, shortfall, overshoot, distance, total, effectiveTotal, priorityTotal };
}

function compareScores(left: Score, right: Score): number {
  return comparePriorityShortfalls(left.priorityShortfalls, right.priorityShortfalls)
    || left.shortfall - right.shortfall
    || right.priorityTotal - left.priorityTotal
    || right.effectiveTotal - left.effectiveTotal
    || right.total - left.total;
}

function compareCandidates(left: ArmourSolverCandidate, right: ArmourSolverCandidate): number {
  return comparePriorityShortfalls(left.score.priorityShortfalls, right.score.priorityShortfalls)
    || left.score.shortfall - right.score.shortfall
    || right.secondaryRank - left.secondaryRank
    || compareScores(left.score, right.score)
    || left.signature.localeCompare(right.signature);
}

function bitCount(value: number): number {
  let mask = value >>> 0, total = 0;
  while (mask) { total += mask & 1; mask >>>= 1; }
  return total;
}

export function solveArmourCombinations(input: ArmourSolverRequest): { candidates: ArmourSolverCandidate[]; combinationsEvaluated: number; targetMaximums: StatVector; completeScan: true } {
  const fixedHashes = new Set(input.fixedExoticHashes);
  const groups: ArmourSolverItem[][] = Array.from({ length: 5 }, () => []);
  for (const item of input.items) {
    if (item.isExotic && !fixedHashes.has(item.itemHash)) continue;
    if (!item.isExotic && item.slotIndex === input.fixedExoticSlot) continue;
    if (item.isExotic && item.slotIndex !== input.fixedExoticSlot) continue;
    groups[item.slotIndex].push(item);
  }
  if (groups.some(group => group.length === 0)) return { candidates: [], combinationsEvaluated: 0, targetMaximums: emptyVector(), completeScan: true };

  const requirements = input.setSelections;
  const masks = new Map(input.openProtocolMasks.map(row => [row.setHash, row]));
  const maskRows = [...masks.values()];
  const maskIndexes = new Map(maskRows.map((row, index) => [row.setHash, index]));
  const selected = Array<ArmourSolverItem>(5);
  const totals = STAT_KEYS.map(() => 0);
  const requirementCounts = requirements.map(() => 0);
  const openProtocolCounts = maskRows.map(() => 0);
  const heap: ArmourSolverCandidate[] = [];
  const targetMaximums = emptyVector();
  let combinationsEvaluated = 0;

  const requested = normaliseVector(input.targets, STAT_CAP);
  const statPriorities = normalisePriorities(input.statPriorities);
  const activeIndexes = STAT_KEYS.map((key, index) => requested[key] > 0 ? index : -1).filter(index => index >= 0);
  const priorityIndexes = activeIndexes.filter(index => statPriorities[STAT_KEYS[index]] > 0).sort((left, right) => statPriorities[STAT_KEYS[left]] - statPriorities[STAT_KEYS[right]]);
  const requestedValues = STAT_KEYS.map(key => requested[key]);

  const canComplete = (slot: number): boolean => requirements.every((requirement, requirementIndex) => {
    const remaining = groups.slice(slot).reduce((count, rows) => count + (rows.some(item => item.setHash === requirement.setHash) ? 1 : 0), 0);
    return requirementCounts[requirementIndex] + remaining >= requirement.count;
  });
  const secondaryRank = (): number => {
    let evidenceMask = 0;
    for (let index = 0; index < maskRows.length; index += 1) {
      const row = maskRows[index], count = openProtocolCounts[index];
      evidenceMask |= count >= 4 && row.four ? row.four : count >= 2 ? row.two : 0;
    }
    return bitCount(evidenceMask);
  };
  const worse = (left: ArmourSolverCandidate, right: ArmourSolverCandidate): boolean => compareCandidates(left, right) > 0;
  const siftUp = (start: number): void => {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!worse(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  };
  const siftDown = (start: number): void => {
    let index = start;
    while (true) {
      const left = index * 2 + 1, right = left + 1;
      if (left >= heap.length) break;
      let worst = left;
      if (right < heap.length && worse(heap[right], heap[left])) worst = right;
      if (!worse(heap[worst], heap[index])) break;
      [heap[index], heap[worst]] = [heap[worst], heap[index]];
      index = worst;
    }
  };
  const retain = (candidate: ArmourSolverCandidate): void => {
    if (heap.length < input.limit) { heap.push(candidate); siftUp(heap.length - 1); return; }
    if (compareCandidates(candidate, heap[0]) >= 0) return;
    heap[0] = candidate;
    siftDown(0);
  };
  const signature = (): string => `|${selected.map(item => item.itemInstanceId).join("|")}`;
  const compareCurrentTo = (candidate: ArmourSolverCandidate, currentSecondary: number): number => {
    for (let rank = 0; rank < priorityIndexes.length; rank += 1) {
      const index = priorityIndexes[rank], effective = Math.min(STAT_CAP, Math.max(0, totals[index]));
      const delta = Math.max(0, requestedValues[index] - effective) - finite(candidate.score.priorityShortfalls[rank]);
      if (delta) return delta;
    }
    let shortfall = 0, priorityTotal = 0, effectiveTotal = 0, total = 0;
    for (let index = 0; index < STAT_KEYS.length; index += 1) {
      const effective = Math.min(STAT_CAP, Math.max(0, totals[index]));
      if (requestedValues[index] > 0) { shortfall += Math.max(0, requestedValues[index] - effective); priorityTotal += effective; }
      effectiveTotal += effective;
      total += totals[index];
    }
    let delta = shortfall - candidate.score.shortfall;
    if (delta) return delta;
    delta = candidate.secondaryRank - currentSecondary;
    if (delta) return delta;
    delta = candidate.score.priorityTotal - priorityTotal;
    if (delta) return delta;
    delta = candidate.score.effectiveTotal - effectiveTotal;
    if (delta) return delta;
    delta = candidate.score.total - total;
    if (delta) return delta;
    return signature().localeCompare(candidate.signature);
  };
  const retainCurrent = (): void => {
    const currentSecondary = secondaryRank();
    if (heap.length >= input.limit && compareCurrentTo(heap[0], currentSecondary) >= 0) return;
    const stats = Object.fromEntries(STAT_KEYS.map((key, index) => [key, totals[index]])) as StatVector;
    const itemInstanceIds = selected.map(item => item.itemInstanceId);
    retain({ itemInstanceIds, stats, secondaryRank: currentSecondary, signature: `|${itemInstanceIds.join("|")}`, score: scoreStats(stats, requested, statPriorities) });
  };
  const visit = (slot: number, exoticCount: number): void => {
    if (slot === groups.length) {
      if (!requirements.every((requirement, index) => requirementCounts[index] >= requirement.count)) return;
      combinationsEvaluated += 1;
      STAT_KEYS.forEach((key, index) => { targetMaximums[key] = Math.min(STAT_CAP, Math.max(targetMaximums[key], totals[index])); });
      retainCurrent();
      return;
    }
    for (const item of groups[slot]) {
      const nextExoticCount = exoticCount + (item.isExotic ? 1 : 0);
      if (nextExoticCount > 1) continue;
      selected[slot] = item;
      STAT_KEYS.forEach((key, index) => { totals[index] += item.stats[key]; });
      const requirementIndex = requirements.findIndex(requirement => requirement.setHash === item.setHash);
      const maskIndex = item.setHash ? maskIndexes.get(item.setHash) : undefined;
      if (requirementIndex >= 0) requirementCounts[requirementIndex] += 1;
      if (maskIndex !== undefined) openProtocolCounts[maskIndex] += 1;
      if (canComplete(slot + 1)) visit(slot + 1, nextExoticCount);
      if (maskIndex !== undefined) openProtocolCounts[maskIndex] -= 1;
      if (requirementIndex >= 0) requirementCounts[requirementIndex] -= 1;
      STAT_KEYS.forEach((key, index) => { totals[index] -= item.stats[key]; });
    }
  };

  visit(0, 0);
  return { candidates: heap.sort(compareCandidates), combinationsEvaluated, targetMaximums, completeScan: true };
}

export { STAT_KEYS };
