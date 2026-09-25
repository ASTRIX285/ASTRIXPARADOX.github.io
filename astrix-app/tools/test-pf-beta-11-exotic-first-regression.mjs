// Prompt 19: expected visible copy and resource tags updated; assertion coverage unchanged.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const engineUrl = new URL('pages/guardian-workspace-v2/guardian-paradox-engine.mjs', ROOT);
const prototypeUrl = new URL('data/paradox-forge/beta/prototypes/PF-BETA-11-exotic-first.json', ROOT);
const extensionUrl = new URL('data/paradox-forge/beta/beta-bungie-manifest-cache-exotic-first-extension.json', ROOT);

const engineSource = await readFile(engineUrl, 'utf8');
const functionStart = engineSource.indexOf('export function recommendBuildForExotic');
const functionEnd = engineSource.indexOf('export function analyzeGuardianBuild', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'recommendBuildForExotic() body not found');
const functionBody = engineSource.slice(functionStart, functionEnd);
for (const forbidden of [
  '1514173218',
  '2321824284',
  'kills with this weapon generate grenade energy',
  'final blows with grenades or this weapon',
  'grenade or melee kills of the same damage type',
  'PF-BETA-11',
  'Nothing Manacles'
]) {
  assert.equal(functionBody.includes(forbidden), false, `fixture/exotic-specific literal remains in recommender: ${forbidden}`);
}

globalThis.document ??= { addEventListener() {}, dispatchEvent() {} };
const { recommendBuildForExotic } = await import(engineUrl.href);
const pool = JSON.parse(await readFile(prototypeUrl, 'utf8'));
const extension = JSON.parse(await readFile(extensionUrl, 'utf8'));
const result = recommendBuildForExotic(pool.exotic.hash, pool, { extensions: [extension] });

const anchorFinalBlowEvidence = pool.anchorEvidence.synergyChains[1].evidence;
const candidate = name => pool.vaultPool.find(item => item.name === name);
const expectedRecommendations = [
  {
    name: 'Bane of Sorrow',
    chain: 'Bane of Sorrow -> grenade-energy -> Scatter Grenade',
    evidence: {
      producer: [candidate('Bane of Sorrow').evidence, candidate('Bane of Sorrow').ownedRoll[0].description],
      consumer: 'Documented Destiny ability mechanic: grenade energy is the resource spent to make the equipped grenade ability available.',
      source: 'bungie-manifest+documented-game-mechanic'
    }
  },
  {
    name: 'The Comedian',
    chain: 'Scatter Grenade -> grenade-final-blow -> The Comedian',
    evidence: {
      producer: anchorFinalBlowEvidence,
      consumer: [candidate('The Comedian').evidence, candidate('The Comedian').ownedRoll[0].description],
      source: 'curated-fixture+bungie-manifest'
    }
  },
  {
    name: '1000 Yard Stare',
    chain: 'Scatter Grenade -> matching-void-grenade-final-blow -> 1000 Yard Stare',
    evidence: {
      producer: anchorFinalBlowEvidence,
      consumer: [candidate('1000 Yard Stare').evidence, candidate('1000 Yard Stare').ownedRoll[0].description],
      source: 'curated-fixture+bungie-manifest'
    }
  }
];

assert.deepEqual(
  result.recommendedWeapons.map(row => ({ name: row.item.name, chain: row.chain.chain, evidence: row.evidence })),
  expectedRecommendations,
  'PF-BETA-11 recommendedWeapons/evidence changed'
);
assert.deepEqual(result.recommendedArmor, [], 'PF-BETA-11 should still recommend no armor');

const expectedRejections = [
  ['Buried Bloodline', 'Produces Devour, but PF-BETA-11 already has a Scatter Grenade -> Feed the Void -> Devour route; no new producer->consumer link was found.'],
  ['Le Monarque', 'No explicit producer/consumer relationship to the Nothing Manacles / Scatter Grenade / Feed the Void loop is present in the supplied data.'],
  ['Gnawing Hunger', 'No explicit producer/consumer relationship to the Nothing Manacles / Scatter Grenade / Feed the Void loop is present in the supplied data.'],
  ['Contraverse Hold', 'Cannot equip Contraverse Hold with anchor Exotic Nothing Manacles; both are Exotic armor.'],
  ["Verity's Brow", "Cannot equip Verity's Brow with anchor Exotic Nothing Manacles; both are Exotic armor."]
];
assert.deepEqual(
  result.rejectedCandidates.map(row => [row.item.name, row.reason]),
  expectedRejections,
  'PF-BETA-11 rejectedCandidates/reasons changed'
);

const expectedLoop = [
  'Chaos Accelerant -> enhanced-scatter-grenade -> Scatter Grenade',
  'Scatter Grenade -> void-ability-final-blow -> Feed the Void',
  'Bane of Sorrow -> grenade-energy -> Scatter Grenade',
  'Scatter Grenade -> grenade-final-blow -> The Comedian',
  'Scatter Grenade -> matching-void-grenade-final-blow -> 1000 Yard Stare'
];
assert.deepEqual(result.buildLoop.map(row => row.chain), expectedLoop, 'PF-BETA-11 five-link buildLoop changed');

console.log(JSON.stringify({
  exotic: result.exotic,
  recommendedWeapons: result.recommendedWeapons,
  recommendedArmor: result.recommendedArmor,
  rejectedCandidates: result.rejectedCandidates,
  buildLoop: result.buildLoop
}, null, 2));
console.error('PF-BETA-11 Exotic-first regression: PASS');
