// Prompt 19: expected visible copy and resource tags updated; assertion coverage unchanged.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const engineUrl = new URL('pages/guardian-workspace-v2/guardian-paradox-engine.mjs', ROOT);
const prototypeUrl = new URL('data/paradox-forge/beta/prototypes/PF-BETA-10-exotic-first.json', ROOT);
const extensionUrl = new URL('data/paradox-forge/beta/beta-bungie-manifest-cache-exotic-first-extension.json', ROOT);

globalThis.document ??= { addEventListener() {}, dispatchEvent() {} };
const { recommendBuildForExotic } = await import(engineUrl.href);
const pool = JSON.parse(await readFile(prototypeUrl, 'utf8'));
const extension = JSON.parse(await readFile(extensionUrl, 'utf8'));
const result = recommendBuildForExotic(pool.exotic.hash, pool, { extensions: [extension] });

assert.deepEqual(
  result.recommendedWeapons.map(row => [row.item.name, row.chain.chain]),
  [
    ['Pleiades Corrector', 'Pleiades Corrector -> grenade-energy -> Fusion Grenade'],
    ['The Summoner', 'Fusion Grenade -> matching-solar-grenade-final-blow -> The Summoner']
  ],
  'PF-BETA-10 generic recommendations changed'
);
assert.deepEqual(result.recommendedArmor, [], 'PF-BETA-10 should recommend no armor from this pool');
assert.deepEqual(
  result.rejectedCandidates.map(row => [row.item.name, row.reason]),
  [
    ['Le Monarque', 'No explicit producer/consumer relationship to the Starfire Protocol / Fusion Grenade loop is present in the supplied data.'],
    ['Gnawing Hunger', 'No explicit producer/consumer relationship to the Starfire Protocol / Fusion Grenade loop is present in the supplied data.'],
    ['Sunbracers', 'Cannot equip Sunbracers with anchor Exotic Starfire Protocol; both are Exotic armor.'],
    ['Phoenix Protocol', 'Cannot equip Phoenix Protocol with anchor Exotic Starfire Protocol; both are Exotic armor.']
  ],
  'PF-BETA-10 rejection behavior changed'
);
assert.deepEqual(
  result.buildLoop.map(row => row.chain),
  [
    'Starfire Protocol -> additional-fusion-grenade-charge -> Fusion Grenade',
    'Fusion Grenade -> solar-grenade-final-blow -> Starfire Protocol',
    'Pleiades Corrector -> grenade-energy -> Fusion Grenade',
    'Fusion Grenade -> matching-solar-grenade-final-blow -> The Summoner'
  ],
  'PF-BETA-10 buildLoop changed'
);

console.log(JSON.stringify({
  exotic: result.exotic,
  recommendedWeapons: result.recommendedWeapons,
  recommendedArmor: result.recommendedArmor,
  rejectedCandidates: result.rejectedCandidates,
  buildLoop: result.buildLoop
}, null, 2));
console.error('PF-BETA-10 Exotic-first generic verification: PASS');
