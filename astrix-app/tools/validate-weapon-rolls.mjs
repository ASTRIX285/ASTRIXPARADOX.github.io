// Deterministic validation for authored weapon rollPerks + engine integrity.
// Runs the same loader/engine the app uses, then asserts invariants that no AI
// reviewer is trusted to check by eye. Exits non-zero on any violation.
//
// Usage (from repo root):
//   node astrix-app/tools/validate-weapon-rolls.mjs
//   node astrix-app/tools/validate-weapon-rolls.mjs --base /tmp/base-fixtures.json
//
// --base <path> enables the scoped-diff check: asserts the only change vs the
// base fixture file is the ADDITION of rollPerks on equipped weapon entries.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dataRoot = path.join(root, 'astrix-app/data/paradox-forge/beta');
const pageRoot = path.join(root, 'astrix-app/pages/guardian-workspace-v2');
const FIXTURE_FILE = 'ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json';
const CACHE_FILE = 'beta-bungie-manifest-cache.json';
const files = [FIXTURE_FILE, 'beta-component-identities.json', CACHE_FILE,
  'beta-bungie-manifest-cache-trait-direction-extension.json','beta-bungie-manifest-cache-weapon-perk-extension.json'];
const routes = new Map(files.map(n => [n, path.join(dataRoot, n)]));

// The one real verified weapon role that must never regress (Prometheus Lens / PF-BETA-13).
const KNOWN_VERIFIED_WEAPON = 19024058;

const failures = [];
const fail = m => failures.push(m);

// ---- DOM/fetch stubs so the browser modules run headless ----
globalThis.document = { readyState: 'complete', addEventListener() {}, dispatchEvent() { return true; },
  getElementById() { return null; }, querySelector() { return null; },
  createElement() { return { setAttribute() {}, appendChild() {}, style: {}, addEventListener() {} }; } };
globalThis.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
globalThis.fetch = async input => {
  // This authored-roll test has no live definition data. Model the backend's
  // explicit unresolved response, as the previous single-definition stub did.
  if(String(input).endsWith('/bungie/manifest'))return Response.json({version:'fixture-test',paths:{}});
  if(String(input).includes('/bungie/manifest/definitions?'))return Response.json({manifestVersion:'fixture-test',definitions:{}});
  const s = String(input), n = [...routes.keys()].find(k => s.endsWith(k));
  if (!n) return { ok: false, status: 404, json: async () => ({}) };
  const txt = await fs.readFile(routes.get(n), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(txt) };
};

const loader = await import(pathToFileURL(path.join(pageRoot, 'guardian-fixture-loader.mjs')).href + '?v=' + Date.now());
const engine = await import(pathToFileURL(path.join(pageRoot, 'guardian-paradox-engine.mjs')).href + '?v=' + Date.now());
const semantics = await import(pathToFileURL(path.join(pageRoot, 'guardian-semantic-resolver.mjs')).href + '?v=' + Date.now());
const rawFixtures = JSON.parse(await fs.readFile(routes.get(FIXTURE_FILE), 'utf8'));
const baseCache = JSON.parse(await fs.readFile(routes.get(CACHE_FILE), 'utf8'));
const perkExtension = JSON.parse(await fs.readFile(routes.get('beta-bungie-manifest-cache-weapon-perk-extension.json'), 'utf8'));
const cache = {...baseCache,inventoryItems:{...(baseCache.inventoryItems||{}),...(perkExtension.inventoryItems||{})}};
const perkResolves = h => Boolean(cache.inventoryItems && cache.inventoryItems[String(h)]);

// ============================================================
// CHECK 1 — Self-test invariants (synthetic, real Voltshot text)
// ============================================================
try {
  const volt = cache.inventoryItems['2173046394'];
  if (!volt) throw new Error('Voltshot 2173046394 missing from manifest cache');
  const consumer = { hash: 4194622036, bungieHash: 4194622036, name: 'Flow State', componentType: 'aspect',
    description: 'Defeating a jolted target makes you amplified.', traitIds: ['keywords.debuffs.arc.jolt'] };
  const weapon = { hash: 900000001, bungieHash: 900000001, name: 'Synthetic owned Arc weapon', sourceKind: 'weapon',
    description: '', rollPerks: [{ perkHash: 2173046394, socket: 'trait2' }],
    resolvedPerks: [{ perkHash: 2173046394, socket: 'trait2', definition: { hash: 2173046394, bungieHash: 2173046394,
      name: volt.display.name, description: volt.display.description, traitIds: volt.traitIds ?? [], sourceKind: 'gameComponent' } }] };
  const before = { source: 'paradox-beta-fixture', fixtureId: 'VALIDATE-SELFTEST', aspects: [consumer], weapons: [weapon], synergyChains: [] };
  const after = { ...before, weapons: [{ hash: 900000002, bungieHash: 900000002, name: 'Swapped', sourceKind: 'weapon', description: '' }] };
  const ba = engine.analyzeGuardianBuild(before), aa = engine.analyzeGuardianBuild(after);
  const link = ba.buildLoop.find(x => x.from.hash === 900000001 && x.output === 'jolt' && x.to.hash === 4194622036);
  if (!link) fail('C1: self-test weapon->jolt->consumer link did not form');
  else if (link.source !== 'runtime-weapon-perk-parsing') fail('C1: weapon link missing runtime-weapon-perk-parsing source');
  if (aa.buildLoop.some(x => x.from.hash === 900000001 || x.to.hash === 900000001)) fail('C1: stale weapon link survived swap (mutation staleness broken)');
  const wc = ba.weaponContribution.find(x => x.hash === 900000001);
  if (!wc || wc.status !== 'verified-loop-contributor' || !wc.contributions?.some(x => x.roleType === 'verb-applicator'))
    fail('C1: expected verb-applicator verified weapon contribution');
} catch (e) { fail('C1: self-test threw: ' + e.message); }

// ============================================================
// CHECK 2 — Debuff-guardrail invariant
// ============================================================
try {
  const consumer = { hash: 4194622036, bungieHash: 4194622036, name: 'Flow State', componentType: 'aspect',
    description: 'Defeating a jolted target makes you amplified.', traitIds: ['keywords.debuffs.arc.jolt'] };
  const weapon = { hash: 900000101, bungieHash: 900000101, name: 'Debuff-tag-only weapon', sourceKind: 'weapon', description: '',
    rollPerks: [{ perkHash: 999000001, socket: 'trait2' }],
    resolvedPerks: [{ perkHash: 999000001, socket: 'trait2', definition: { hash: 999000001, name: 'Tag Only',
      description: '', traitIds: ['keywords.debuffs.arc.jolt'], sourceKind: 'gameComponent' } }] };
  const b = { source: 'paradox-beta-fixture', fixtureId: 'VALIDATE-GUARDRAIL', aspects: [consumer], weapons: [weapon], synergyChains: [] };
  const a = engine.analyzeGuardianBuild(b);
  if (a.buildLoop.some(x => x.from.hash === 900000101 && x.output === 'jolt'))
    fail('C2: debuff-tag-only perk produced a weapon emit (guardrail breached)');
} catch (e) { fail('C2: guardrail test threw: ' + e.message); }

// ============================================================
// CHECK 3 — rollPerks resolution gate (no manufactured perks)
// ============================================================
for (const fx of rawFixtures.fixtures) {
  for (const eq of (fx.rawDim?.equipped ?? [])) {
    for (const rp of (eq.rollPerks ?? [])) {
      if (!perkResolves(rp.perkHash))
        fail(`C3: ${fx.fixtureId} weapon ${eq.hash} rollPerks perkHash ${rp.perkHash} has no curated reasoning evidence`);
      if (rp.socket == null)
        fail(`C3: ${fx.fixtureId} weapon ${eq.hash} rollPerks entry missing socket`);
    }
  }
}

// ============================================================
// CHECK 4 — Engine analysis integrity across every fixture
// ============================================================
let sawKnownVerified = false;
for (const fx of rawFixtures.fixtures) {
  let build;
  try { build = await loader.loadBetaFixture(fx.fixtureId); }
  catch (e) { fail(`C4: ${fx.fixtureId} failed to load: ${e.message}`); continue; }
  const analysis = engine.analyzeGuardianBuild(build);
  const rollByHash = new Map();
  for (const eq of (fx.rawDim?.equipped ?? [])) if ((eq.rollPerks ?? []).length) rollByHash.set(Number(eq.hash), eq.rollPerks);
  for (const w of analysis.weaponContribution) {
    if (Number(w.hash) === KNOWN_VERIFIED_WEAPON && w.status === 'verified-loop-contributor') sawKnownVerified = true;
    if (w.status === 'verified-loop-contributor' && Number(w.hash) !== KNOWN_VERIFIED_WEAPON && !rollByHash.has(Number(w.hash)))
      fail(`C4: ${fx.fixtureId} weapon ${w.hash} is verified-loop-contributor with NO authored rollPerks (fabricated role)`);
  }
}
if (!sawKnownVerified) fail(`C4: known verified weapon ${KNOWN_VERIFIED_WEAPON} (PF-BETA-13) regressed — no longer verified`);

// ============================================================
// CHECK 5 — Hardcoding scan of the engine source
// ============================================================
try {
  const src = await fs.readFile(path.join(pageRoot, 'guardian-paradox-engine.mjs'), 'utf8');
  const fixtureLits = src.match(/PF-(BETA|COMM)-\d+/g);
  if (fixtureLits) fail(`C5: engine contains fixture-ID literal(s): ${[...new Set(fixtureLits)].join(', ')}`);
  const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hashLits = (codeOnly.match(/\b\d{6,}\b/g) || []).filter(n => n !== '200');
  if (hashLits.length) fail(`C5: engine contains bare numeric hash-like literal(s) in logic: ${[...new Set(hashLits)].join(', ')}`);
} catch (e) { fail('C5: hardcoding scan threw: ' + e.message); }

// ============================================================
// CHECK 6 — Guardian armour semantic contract
// ============================================================
try {
  const plug=(hash,name,category,description='')=>({hash,name,description,definition:{plug:{plugCategoryIdentifier:category}}});
  const armour=semantics.normaliseArmourSemantics({
    instance:{gearTier:5,energy:{energyType:1,energyTypeHash:123,energyCapacity:10,energyUsed:7}},
    stats:{stats:{health:{value:20}}},
    plugs:[
      plug(1,'Infuse','armor.infusion'),
      plug(2,'Armour Masterwork Level 5','armor.masterworks'),
      plug(3,'General Mod','armor.mods.general'),
      plug(4,'General Mod 2','armor.mods.general'),
      plug(5,'Helmet Mod','armor.mods.helmet'),
      plug(6,'Bulwark Armour Archetype','armor.archetype'),
      plug(7,'Close Enough Exotic Armour Perk','armor.exotic.perk'),
      plug(8,'Ionic Overclock 2 Piece','armor.set_bonus'),
      plug(9,'Shock and Clear 4 Piece','armor.set_bonus')
    ]
  });
  if (armour.tier !== 5) fail('C6: armour gearTier did not normalize');
  if (armour.energy?.capacity !== 10 || armour.energy?.used !== 7) fail('C6: armour energy did not normalize');
  if (armour.generalMods.length !== 2 || armour.slotMods.length !== 1) fail('C6: armour mod families were not separated');
  if (!armour.masterwork || !armour.archetype || !armour.exoticPerk) fail('C6: armour intrinsic semantic families missing');
  if (!armour.set.twoPiece || !armour.set.fourPiece) fail('C6: armour set 2/4 piece split failed');
  if (!armour.discarded.some(x => x.semanticRole === 'infuse')) fail('C6: Infuse was not explicitly discarded');
  if (armour.unknownPlugs.length) fail('C6: known synthetic armour plugs became unknown');
} catch (e) { fail('C6: armour semantic contract threw: ' + e.message); }

// ============================================================
// CHECK 7 — Weapon/catalyst/champion semantic contract
// ============================================================
try {
  const plug=(hash,name,category,extra={})=>({hash,name,definition:{plug:{plugCategoryIdentifier:category}},isEnabled:true,...extra});
  const catalyst=plug(22,'Test Catalyst','weapon.catalyst');
  const profile={itemComponents:{plugObjectives:{data:{abc:{objectivesPerPlug:{'22':[{complete:false,progress:3,completionValue:100}]}}}}}};
  const weapon=semantics.normaliseWeaponSemantics({
    profile,
    item:{itemInstanceId:'abc'},
    instance:{gearTier:5,breakerType:2,breakerTypeHash:456},
    stats:{stats:{range:{value:80}}},
    plugs:[
      plug(20,'Adaptive Frame','intrinsics'),
      plug(21,'Weapon Masterwork Level 10','weapon.masterworks'),
      catalyst,
      plug(23,'Weapon Mod','weapon.mods'),
      plug(24,'Trait Perk','traits')
    ]
  });
  if (!weapon.intrinsic || !weapon.masterwork || !weapon.mod || !weapon.catalyst) fail('C7: weapon semantic families missing');
  if (weapon.selectedPerks.length !== 1) fail('C7: weapon selected perk classification failed');
  if (weapon.perkRowCount !== 3 || weapon.perkRows.length !== 3) fail('C7: Tier 5 weapon did not retain its three-row perk model');
  if (semantics.weaponPerkRowCountForTier(4) !== 2 || semantics.weaponPerkRowCountForTier(3) !== 2 || semantics.weaponPerkRowCountForTier(2) !== 1) fail('C7: weapon tier-to-row rules drifted');
  if ([1,2,3,4,5].map(column=>semantics.weaponPerkColumnRowCountForTier(5,column)).join(',') !== '2,2,3,3,2') fail('C7: Tier 5 weapon column capacity drifted from 2,2,3,3,2');
  if (weapon.champion?.source !== 'bungie-item-instance') fail('C7: champion capability lacks direct Bungie instance source');
  if (weapon.catalyst.progress?.completed !== false || weapon.catalyst.progress?.active !== false) fail('C7: incomplete catalyst incorrectly became active');
} catch (e) { fail('C7: weapon semantic contract threw: ' + e.message); }

// ============================================================
// CHECK 8 — Guardian stat threshold + Artifact applied-perk integrity
// ============================================================
try {
  const stats=semantics.normaliseGuardianStats([['Grenade',110],['Weapons',105],['Health',100],['Class',95]]);
  if (!stats.Grenade.enhancedThresholdReached || !stats.Weapons.enhancedThresholdReached) fail('C8: >100 enhanced stat threshold failed');
  if (stats.Health.enhancedThresholdReached || stats.Class.enhancedThresholdReached) fail('C8: <=100 stat incorrectly marked enhanced');
  const activePerks=Array.from({length:7},(_,i)=>({hash:1000+i}));
  const artifact=semantics.validateArtifact({activePerks});
  if (artifact.activeCount !== 7 || artifact.uniqueActiveCount !== 7 || !artifact.noDuplicateActiveHashes) fail('C8: Artifact 7/7 integrity failed');
} catch (e) { fail('C8: stat/Artifact contract threw: ' + e.message); }

// ============================================================
// CHECK 9 — Semantic safety: unknowns cannot silently become mods/evidence
// ============================================================
try {
  const unknown={hash:999,name:'Mystery Socket',description:'',definition:{plug:{plugCategoryIdentifier:'unknown.future.system'}}};
  const armour=semantics.normaliseArmourSemantics({plugs:[unknown]});
  if (armour.generalMods.length || armour.slotMods.length) fail('C9: unknown armour plug was manufactured into a mod');
  if (armour.complete || armour.unknownPlugs.length !== 1) fail('C9: unknown armour plug was not surfaced explicitly');
} catch (e) { fail('C9: semantic safety check threw: ' + e.message); }

// ============================================================
// CHECK 10 (optional) — scoped diff vs base: only rollPerks added
// ============================================================
const baseIdx = process.argv.indexOf('--base');
if (baseIdx !== -1 && process.argv[baseIdx + 1]) {
  try {
    const base = JSON.parse(await fs.readFile(process.argv[baseIdx + 1], 'utf8'));
    const strip = fixObj => {
      const c = JSON.parse(JSON.stringify(fixObj));
      for (const fx of c.fixtures) for (const eq of (fx.rawDim?.equipped ?? [])) delete eq.rollPerks;
      return c;
    };
    if (JSON.stringify(strip(base)) !== JSON.stringify(strip(rawFixtures)))
      fail('C10: fixture file changed OUTSIDE weapon rollPerks (scoped-diff violation)');
  } catch (e) { fail('C10: base-diff threw: ' + e.message); }
}

// ---- report ----
if (failures.length) {
  console.error('PARADOX VALIDATION FAILED:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('PARADOX VALIDATION PASSED (weapon + Guardian semantic checks green).');
