import assert from "node:assert/strict";
import test from "node:test";
import { solveArmourCombinations } from "../src/armour-solver.ts";
import { armourTargetMaximums, matchTopArmourBuilds } from "../../astrix-app/pages/vault/vault-armour-matcher.mjs";

const statKeys = ["health", "melee", "grenade", "super", "class", "weapon"] as const;

test("backend solver matches the complete shared armour scan", () => {
  const items = [];
  for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      items.push({
        itemInstanceId: String(1_000 + slotIndex * 10 + copy),
        itemHash: slotIndex === 0 && copy === 0 ? 9_001 : 2_000 + slotIndex * 10 + copy,
        slotIndex,
        isExotic: slotIndex === 0 && copy === 0,
        stats: statKeys.map((name, statIndex) => ({ name, value: (slotIndex * 7 + copy * 11 + statIndex * 3) % 35 })),
        setBonus: copy % 2 ? { hash: 7_001 } : null
      });
    }
  }
  const targets = { health: 80, melee: 60, grenade: 0, super: 0, class: 0, weapon: 20 };
  const statPriorities = { health: 1, melee: 2, grenade: 0, super: 0, class: 0, weapon: 3 };
  const browser = matchTopArmourBuilds(items, targets, { fixedExoticHashes: [9_001], fixedExoticSlot: 0, setSelections: [{ setHash: 7_001, count: 2 }], statPriorities, autoMaximum: true, limit: 20 });
  const backend = solveArmourCombinations({
    items: items.map(item => ({ itemInstanceId: item.itemInstanceId, itemHash: item.itemHash, slotIndex: item.slotIndex, isExotic: item.isExotic, stats: Object.fromEntries(item.stats.map(stat => [stat.name, stat.value])) as Record<typeof statKeys[number], number>, setHash: item.setBonus?.hash || null })),
    fixedExoticHashes: [9_001], fixedExoticSlot: 0, setSelections: [{ setHash: 7_001, count: 2 }], targets, statPriorities, openProtocolMasks: [], limit: 20
  });
  assert.equal(backend.completeScan, true);
  assert.equal(backend.combinationsEvaluated, browser.combinationsEvaluated);
  assert.deepEqual(backend.targetMaximums, armourTargetMaximums(items, { fixedExoticHashes: [9_001], fixedExoticSlot: 0, setSelections: [{ setHash: 7_001, count: 2 }] }));
  assert.deepEqual(backend.candidates.map(candidate => candidate.itemInstanceIds), browser.map(candidate => candidate.items.map(item => item.itemInstanceId)));
});

test("backend solver applies open-protocol evidence before trimming the top results", () => {
  const items = [
    { itemInstanceId: "100", itemHash: 9_001, slotIndex: 0, isExotic: true, stats: statKeys.map(name => ({ name, value: 10 })), setBonus: null },
    ...[1, 2, 3, 4].flatMap(slotIndex => [
      { itemInstanceId: `${slotIndex}01`, itemHash: 3_000 + slotIndex, slotIndex, isExotic: false, stats: statKeys.map(name => ({ name, value: 10 })), setBonus: { hash: 7_001 } },
      { itemInstanceId: `${slotIndex}02`, itemHash: 4_000 + slotIndex, slotIndex, isExotic: false, stats: statKeys.map(name => ({ name, value: 10 })), setBonus: null }
    ])
  ];
  const zeroes = Object.fromEntries(statKeys.map(key => [key, 0])) as Record<typeof statKeys[number], number>;
  const evidenceScore = (selected: typeof items) => selected.filter(item => item.setBonus?.hash === 7_001).length >= 2 ? 1 : 0;
  const browser = matchTopArmourBuilds(items, zeroes, { fixedExoticHashes: [9_001], fixedExoticSlot: 0, setSelections: [], statPriorities: zeroes, autoMaximum: true, secondaryScore: evidenceScore, limit: 5 });
  const backend = solveArmourCombinations({
    items: items.map(item => ({ itemInstanceId: item.itemInstanceId, itemHash: item.itemHash, slotIndex: item.slotIndex, isExotic: item.isExotic, stats: Object.fromEntries(item.stats.map(stat => [stat.name, stat.value])) as Record<typeof statKeys[number], number>, setHash: item.setBonus?.hash || null })),
    fixedExoticHashes: [9_001], fixedExoticSlot: 0, setSelections: [], targets: zeroes, statPriorities: zeroes, openProtocolMasks: [{ setHash: 7_001, two: 1, four: 1 }], limit: 5
  });
  assert.equal(backend.combinationsEvaluated, 16);
  assert.deepEqual(backend.candidates.map(candidate => candidate.itemInstanceIds), browser.map(candidate => candidate.items.map(item => item.itemInstanceId)));
  assert.ok(backend.candidates.every(candidate => candidate.secondaryRank === 1));
});
