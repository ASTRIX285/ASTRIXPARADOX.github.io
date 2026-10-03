#!/usr/bin/env node
/**
 * Tests for build-forever-db.mjs using synthetic fixtures only.
 * Needs astrix-app dev dependencies (npm ci in astrix-app) for schema checks.
 * Prints FOREVER_DB_TEST=PASS and exits 0 when green.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCsv, makeTable, buildDatabase, headerSnapshot, headerDrift, decodeClassMask, writeDatabase
} from './build-forever-db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'test-fixtures');
const SCHEMA_DIR = path.join(HERE, '..', 'schema');
const RULES_FILE = path.join(HERE, '..', 'data', 'rules.json');
const PLATFORM_PROVENANCE = path.join(HERE, '..', '..', '..', 'platform', 'contracts', 'provenance.schema.json');
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); } catch (err) { results.push(`FAIL ${name}: ${err.message}`); }
};

const sources = JSON.parse(await readFile(path.join(FIX, 'sources.test.json'), 'utf8'));
const loadAll = async (overrides = {}) => {
  const tables = {};
  for (const t of sources.tables) {
    const text = overrides[t] ?? await readFile(path.join(FIX, `${t}.csv`), 'utf8');
    tables[t] = makeTable(t, text, sources);
  }
  return tables;
};

await test('CSV parses quotes, escaped quotes and CRLF', () => {
  const { header, rows } = parseCsv('ID,Name\r\n1,"a, ""b"""\r\n2,c\r\n');
  assert.deepEqual(header, ['ID', 'Name']);
  assert.deepEqual(rows, [['1', 'a, "b"'], ['2', 'c']]);
});

await test('CSV rejects ragged rows and open quotes', () => {
  assert.throws(() => parseCsv('ID,Name\n1\n'), /fields/);
  assert.throws(() => parseCsv('ID,Name\n1,"open\n'), /quoted/);
});

await test('class mask decodes bit (classId - 1) against known classes only', () => {
  assert.deepEqual(decodeClassMask(1, [1, 2]), [1]);
  assert.deepEqual(decodeClassMask(3, [1, 2]), [1, 2]);
  assert.deepEqual(decodeClassMask(4, [1, 2]), []);
  assert.deepEqual(decodeClassMask({ pending: true, reason: 'x' }, [1, 2]), []);
});

const db = buildDatabase(await loadAll(), sources);

await test('items keep names with commas and drop zero-amount stats', () => {
  const chest = db.items.find(i => i.id === 900101);
  assert.equal(chest.name, 'TEST Chest, of Commas');
  assert.deepEqual(chest.stats, [{ statTypeId: 900, amount: 7 }]);
  assert.equal(chest.itemClass, 4);
});

await test('item without an Item row is pending, not guessed', () => {
  const ring = db.items.find(i => i.id === 900102);
  assert.equal(ring.itemClass.pending, true);
  assert.match(ring.itemClass.reason, /No Item row/);
});

await test('every record carries provenance with the source sha256', () => {
  const all = [...db.items, ...db.itemSets, ...db.talentTrees, ...db.spells, ...db.classes];
  for (const r of all) {
    assert.equal(r.provenance.build, '0.0.0.0-test');
    assert.match(r.provenance.sourceSha256, /^[0-9a-f]{64}$/);
  }
});

await test('set bonuses join by set id and reference their spell', () => {
  const set = db.itemSets[0];
  assert.deepEqual(set.itemIds, [900101, 900102]);
  assert.equal(set.bonuses[0].threshold, 2);
  assert.ok(db.spells.some(s => s.id === 900402));
});

await test('talents nest under trees, empty trees are dropped, prereq rank is 1-based', () => {
  assert.equal(db.talentTrees.length, 1);
  const [tree] = db.talentTrees;
  assert.deepEqual(tree.classIds, [1]);
  assert.deepEqual(tree.talents[0].rankSpellIds, [900401, 900403]);
  assert.deepEqual(tree.talents[1].prerequisites, [{ talentId: 900601, rank: 2 }]);
});

await test('referenced spell missing from both spell tables stays pending', () => {
  const missing = db.spells.find(s => s.id === 900404);
  assert.equal(missing.name.pending, true);
  assert.equal(missing.description.pending, true);
  assert.ok(db.manifest.pendingCounts['spell.name'] >= 1);
});

await test('missing column becomes pending with the columns it tried', async () => {
  const noLevel = 'ID,Display_lang,OverallQualityID,RequiredLevel,InventoryType,ItemSet,AllowableClass,StatModifier_bonusStat_0,StatModifier_bonusAmount_0\n900101,TEST,1,1,1,0,-1,900,1\n';
  const d = buildDatabase(await loadAll({ ItemSparse: noLevel }), sources);
  assert.equal(d.items[0].itemLevel.pending, true);
  assert.match(d.items[0].itemLevel.reason, /tried ItemLevel/);
  assert.equal(d.manifest.pendingCounts['item.itemLevel'], 1);
});

await test('prereq rank base is proven from the data, recorded, and checked against config', async () => {
  const head = 'ID,TabID,TierID,ColumnIndex,SpellRank_0,SpellRank_1,SpellRank_2,PrereqTalent_0,PrereqRank_0\n';
  const base = '900601,900501,0,1,900401,900403,0,0,0\n';
  const zero = head + base + '900602,900501,1,1,900404,0,0,900601,0\n';
  const one = head + base + '900602,900501,1,1,900404,0,0,900601,2\n';
  const both = zero + '900603,900501,2,1,900404,0,0,900601,2\n';
  const silent = head + base + '900602,900501,1,1,900404,0,0,900601,1\n';
  const bad = head + base + '900602,900501,1,1,900404,0,0,900601,3\n';
  const run = async (talentCsv, prereqRankBase) => buildDatabase(await loadAll({ Talent: talentCsv }), { ...sources, prereqRankBase });

  const z = await run(zero, null);
  assert.equal(z.manifest.prereqRankBase.value, 0);
  assert.equal(z.manifest.prereqRankBase.method, 'detected');
  assert.deepEqual(z.manifest.prereqRankBase.examples[0], { talentId: 900602, prereqTalentId: 900601, prereqRankValue: 0, prereqMaxRank: 2 });
  assert.deepEqual(z.talentTrees[0].talents[1].prerequisites, [{ talentId: 900601, rank: 1 }]);

  const o = await run(one, null);
  assert.equal(o.manifest.prereqRankBase.value, 1);
  assert.deepEqual(o.talentTrees[0].talents[1].prerequisites, [{ talentId: 900601, rank: 2 }]);

  assert.equal((await run(zero, 0)).manifest.prereqRankBase.method, 'configured and confirmed by data');
  await assert.rejects(run(zero, 1), /data proves 0/);
  await assert.rejects(run(both, null), /conflicts/);
  await assert.rejects(run(bad, null), /outside any rank range/);
  await assert.rejects(run(silent, null), /cannot be proven/);
  assert.equal((await run(silent, 0)).manifest.prereqRankBase.method, 'configured by hand, data silent');
});

await test('header drift is reported both ways', async () => {
  const snap = headerSnapshot(await loadAll());
  assert.deepEqual(headerDrift(snap, snap), []);
  const locked = { ...snap, Talent: [...snap.Talent, 'Gone'], Spell: snap.Spell.slice(1) };
  const drift = headerDrift(locked, snap);
  assert.ok(drift.some(d => d.includes('Talent: removed Gone')));
  assert.ok(drift.some(d => d.includes('Spell: added ID')));
});

await test('output is deterministic and validates against the schemas', async () => {
  const a = await mkdtemp(path.join(tmpdir(), 'forever-a-'));
  const b = await mkdtemp(path.join(tmpdir(), 'forever-b-'));
  const snap = headerSnapshot(await loadAll());
  await writeDatabase(db, snap, a);
  await writeDatabase(buildDatabase(await loadAll(), sources), snap, b);
  for (const f of ['manifest.json', 'classes.json', 'itemSets.json', 'talentTrees.json', 'spells.json', 'items/items-000.json']) {
    assert.equal(await readFile(path.join(a, f), 'utf8'), await readFile(path.join(b, f), 'utf8'), f);
  }
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(await readFile(PLATFORM_PROVENANCE, 'utf8')));
  for (const f of await readdir(SCHEMA_DIR)) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, f), 'utf8'));
    ajv.addSchema(schema, f);
  }
  const check = (schemaFile, list) => {
    const v = ajv.getSchema(schemaFile);
    for (const rec of list) assert.ok(v(rec), `${schemaFile} #${rec.id}: ${ajv.errorsText(v.errors)}`);
  };
  check('item.schema.json', JSON.parse(await readFile(path.join(a, 'items/items-000.json'), 'utf8')));
  check('item-set.schema.json', db.itemSets);
  check('talent-tree.schema.json', db.talentTrees);
  check('spell.schema.json', db.spells);
  const build = { schemaVersion: 1, dataBuild: '0.0.0.0-test', classId: 1, raceId: null, level: 60, ruleset: null, talents: { 900601: 2 }, legacy: {}, gear: { chest: 900101 }, goal: 'raid' };
  check('character-build.schema.json', [build]);
  check('rule.schema.json', JSON.parse(await readFile(RULES_FILE, 'utf8')).records);
});

await test('game module passes the platform contract and resolves a fixture build', async () => {
  const { createGameModuleRegistry } = await import('../../../platform/index.mjs');
  const { createWowForeverModule, WOW_FOREVER_GAME_MODULE } = await import('../index.mjs');
  const reg = createGameModuleRegistry();
  reg.register(WOW_FOREVER_GAME_MODULE);
  const mod = reg.register(createWowForeverModule(db));
  const build = { classId: 1, level: 60, dataBuild: '0.0.0.0-test', talents: { 900601: 2, 900602: 1 }, gear: { chest: 900101 }, legacy: {} };
  assert.equal(mod.normaliseCharacter(build).className, 'TEST Class One');
  const [bonus] = mod.normalisePassives(build);
  assert.equal(bonus.active, false);
  assert.equal(bonus.equipped, 1);
  assert.equal(mod.normaliseAbilities(build)[1].spell.name.pending, true);
  assert.equal(mod.explainRecommendation({ summary: 'no evidence' }).pending, true);
  assert.equal(WOW_FOREVER_GAME_MODULE.normaliseEquipment(build)[0].record.pending, true);
});

await test('rules engine passes a legal build and reports unsourced rules as pending', async () => {
  const { reviewBuild } = await import('../engine/build-rules.mjs');
  const rules = JSON.parse(await readFile(RULES_FILE, 'utf8'));
  const build = { classId: 1, level: 60, talents: { 900601: 2, 900602: 1 }, legacy: { a: 10, b: 6 }, gear: { chest: 900101, ring: 900102 } };
  const r = reviewBuild(build, db, rules);
  assert.equal(r.valid, true, JSON.stringify(r.findings.filter(f => f.severity === 'error')));
  assert.equal(r.talents.spent, 3);
  assert.equal(r.legacy.cap, 16);
  assert.deepEqual(r.findings.filter(f => f.severity === 'pending').map(f => f.code).sort(), ['legacy.perk-costs', 'talent.points-available', 'talent.row-unlock']);
  assert.deepEqual(r.stats.map(s => [s.statTypeId, s.amount]), [[900, 10]]);
  assert.equal(r.stats[0].name.pending, true);
  assert.equal(r.stats[0].evidence.length, 2);
});

await test('rules engine catches prerequisites, max rank, class, Legacy cap and unknown items with evidence', async () => {
  const { reviewBuild } = await import('../engine/build-rules.mjs');
  const rules = JSON.parse(await readFile(RULES_FILE, 'utf8'));
  const codes = b => reviewBuild(b, db, rules).findings.filter(f => f.severity === 'error').map(f => f.code);
  assert.deepEqual(codes({ classId: 1, talents: { 900602: 1 } }), ['talent.prereq-missing']);
  assert.deepEqual(codes({ classId: 1, talents: { 900601: 1, 900602: 1 } }), ['talent.prereq-missing']);
  assert.deepEqual(codes({ classId: 1, talents: { 900601: 3 } }), ['talent.over-max']);
  assert.deepEqual(codes({ classId: 2, talents: { 900601: 1 } }), ['talent.wrong-class']);
  assert.deepEqual(codes({ classId: 1, talents: { 123: 1 } }), ['talent.unknown']);
  assert.deepEqual(codes({ classId: 1, legacy: { a: 17 } }), ['legacy.over-cap']);
  assert.deepEqual(codes({ classId: 1, gear: { chest: 5 } }), ['gear.unknown']);
  const over = reviewBuild({ classId: 1, legacy: { a: 17 } }, db, rules).findings.find(f => f.code === 'legacy.over-cap');
  assert.equal(over.evidence[0].kind, 'official-post');
  const prereq = reviewBuild({ classId: 1, talents: { 900602: 1 } }, db, rules).findings[0];
  assert.deepEqual(prereq.evidence.map(e => e.rowId), [900602, 900601]);
});

await test('rules engine names stats only from a sourced map and drops the Legacy cap when unsourced', async () => {
  const { reviewBuild } = await import('../engine/build-rules.mjs');
  const named = reviewBuild({ classId: 1, gear: { chest: 900101 } }, db, { records: [] }, { source: 'test', types: { 900: 'TEST Stat' } });
  assert.equal(named.stats[0].name, 'TEST Stat');
  assert.ok(named.findings.some(f => f.code === 'legacy.cap-unknown' && f.severity === 'pending'));
  const unsourced = reviewBuild({ classId: 1, gear: { chest: 900101 } }, db, { records: [] }, { source: null, types: { 900: 'TEST Stat' } });
  assert.equal(unsourced.stats[0].name.pending, true);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL'));
console.log(failed.length ? `FOREVER_DB_TEST=FAIL (${failed.length})` : 'FOREVER_DB_TEST=PASS');
process.exit(failed.length ? 1 : 0);
