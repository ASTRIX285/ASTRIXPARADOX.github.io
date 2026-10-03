#!/usr/bin/env node
/**
 * WoW Forever database builder.
 *
 * Turns client DB2 CSV exports (wago.tools, pinned build) into the JSON records
 * described in ../schema/. Rules:
 *   - Every record carries provenance: product, build, table, row id, source sha256.
 *   - A field the pipeline cannot resolve from a real column becomes
 *     { pending: true, reason } and is never filled with a guess.
 *   - Header drift against a locked snapshot fails closed (exit 2).
 *   - Output is deterministic: no timestamps, sorted keys and ids.
 *
 * Usage:
 *   node build-forever-db.mjs --list-builds
 *   node build-forever-db.mjs --fetch --cache <dir> --out <dir>
 *   node build-forever-db.mjs --in <dir> --out <dir> [--sources <file>]
 *
 * Exit codes: 0 pass, 1 error, 2 header drift.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCES = path.join(HERE, 'forever-sources.json');
const ITEM_SHARD_SIZE = 2000;

/* Candidate column names, first present wins. Arrays use a base name and
   match both "Base_0" and "Base[0]" header styles. Nothing here is a game
   value; these are only the names the client tables are known to use. */
export const COLUMNS = Object.freeze({
  ChrClasses: { name: ['Name_lang', 'Name_male_lang'] },
  Item: { itemClass: ['ClassID'], itemSubclass: ['SubclassID'], inventoryType: ['InventoryType'] },
  ItemSparse: {
    name: ['Display_lang', 'Name_lang'],
    quality: ['OverallQualityID', 'Quality'],
    itemLevel: ['ItemLevel'],
    requiredLevel: ['RequiredLevel'],
    inventoryType: ['InventoryType'],
    itemSetId: ['ItemSet'],
    allowableClassMask: ['AllowableClass'],
    statTypeArray: ['StatModifier_bonusStat', 'StatType'],
    statAmountArray: ['StatModifier_bonusAmount', 'StatValue']
  },
  ItemSet: { name: ['Name_lang'], itemArray: ['ItemID'] },
  ItemSetSpell: { setId: ['ItemSetID'], spellId: ['SpellID'], threshold: ['Threshold'] },
  Spell: { rank: ['NameSubtext_lang'], description: ['Description_lang'] },
  SpellName: { name: ['Name_lang'] },
  Talent: {
    treeId: ['TabID'],
    row: ['TierID'],
    column: ['ColumnIndex'],
    rankArray: ['SpellRank'],
    prereqTalentArray: ['PrereqTalent'],
    prereqRankArray: ['PrereqRank']
  },
  TalentTab: { name: ['Name_lang'], order: ['OrderIndex'], classMask: ['ClassMask'] }
});

/* ---------- CSV ---------- */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else { field += ch; }
  }
  if (quoted) throw new Error('CSV ended inside a quoted field.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) throw new Error('CSV is empty.');
  const [header, ...body] = rows;
  for (const [n, r] of body.entries()) {
    if (r.length !== header.length) throw new Error(`CSV row ${n + 2} has ${r.length} fields, header has ${header.length}.`);
  }
  return { header, rows: body };
}

/* ---------- table wrapper ---------- */
const pending = reason => ({ pending: true, reason });

function arrayColumns(header, base) {
  const re = new RegExp(`^${base}(?:_(\\d+)|\\[(\\d+)\\])$`);
  return header
    .map((h, idx) => { const m = re.exec(h); return m ? { idx, n: Number(m[1] ?? m[2]) } : null; })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n)
    .map(c => c.idx);
}

export function makeTable(name, csvText, ctx) {
  const { header, rows } = parseCsv(csvText);
  const sha = createHash('sha256').update(csvText).digest('hex');
  const idIdx = header.indexOf('ID');
  if (idIdx < 0) throw new Error(`${name}: no ID column.`);
  const pick = key => {
    for (const c of COLUMNS[name]?.[key] ?? []) { const i = header.indexOf(c); if (i >= 0) return { idx: i, col: c }; }
    return null;
  };
  const pickArray = key => {
    for (const c of COLUMNS[name]?.[key] ?? []) { const idxs = arrayColumns(header, c); if (idxs.length) return { idxs, col: c }; }
    return null;
  };
  const byId = new Map();
  for (const r of rows) {
    const id = Number(r[idIdx]);
    if (!Number.isInteger(id)) throw new Error(`${name}: non-integer ID "${r[idIdx]}".`);
    byId.set(id, r);
  }
  return {
    name, header, rows, sha, byId,
    provenance(id) { return { product: ctx.product, build: ctx.build, table: name, rowId: id, sourceSha256: sha }; },
    str(r, key) {
      const p = pick(key);
      return p ? r[p.idx] : pending(`${name} has no column for ${key} (tried ${COLUMNS[name][key].join(', ')}).`);
    },
    int(r, key) {
      const p = pick(key);
      if (!p) return pending(`${name} has no column for ${key} (tried ${COLUMNS[name][key].join(', ')}).`);
      const v = Number(r[p.idx]);
      return Number.isInteger(v) ? v : pending(`${name}.${p.col} is not an integer ("${r[p.idx]}").`);
    },
    ints(r, key) {
      const p = pickArray(key);
      if (!p) return pending(`${name} has no array columns for ${key} (tried ${COLUMNS[name][key].join(', ')}).`);
      return p.idxs.map(i => Number(r[i]));
    }
  };
}

/* ---------- builders ---------- */
const isPending = v => v && typeof v === 'object' && v.pending === true;

export function decodeClassMask(mask, classIds) {
  if (isPending(mask)) return [];
  return classIds.filter(id => id >= 1 && id <= 31 && (mask & (1 << (id - 1))) !== 0);
}

export function buildDatabase(tables, sources) {
  const t = tables;
  const pendingCounts = {};
  const count = (entity, obj) => {
    for (const [k, v] of Object.entries(obj)) if (isPending(v)) pendingCounts[`${entity}.${k}`] = (pendingCounts[`${entity}.${k}`] ?? 0) + 1;
  };

  const classes = [...t.ChrClasses.byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, r]) => {
    const rec = { id, name: t.ChrClasses.str(r, 'name'), provenance: t.ChrClasses.provenance(id) };
    count('class', rec); return rec;
  });
  const classIds = classes.map(c => c.id);

  const items = [...t.ItemSparse.byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, r]) => {
    const base = t.Item.byId.get(id);
    const types = t.ItemSparse.ints(r, 'statTypeArray');
    const amounts = t.ItemSparse.ints(r, 'statAmountArray');
    let stats;
    if (isPending(types)) stats = types;
    else if (isPending(amounts)) stats = amounts;
    else if (types.length !== amounts.length) stats = pending('ItemSparse stat type and amount arrays differ in length.');
    else stats = types.map((statTypeId, i) => ({ statTypeId, amount: amounts[i] })).filter(s => s.amount !== 0 && s.statTypeId >= 0);
    const rec = {
      id,
      name: t.ItemSparse.str(r, 'name'),
      quality: t.ItemSparse.int(r, 'quality'),
      itemLevel: t.ItemSparse.int(r, 'itemLevel'),
      requiredLevel: t.ItemSparse.int(r, 'requiredLevel'),
      inventoryType: t.ItemSparse.int(r, 'inventoryType'),
      itemClass: base ? t.Item.int(base, 'itemClass') : pending('No Item row for this id.'),
      itemSubclass: base ? t.Item.int(base, 'itemSubclass') : pending('No Item row for this id.'),
      stats,
      itemSetId: t.ItemSparse.int(r, 'itemSetId'),
      allowableClassMask: t.ItemSparse.int(r, 'allowableClassMask'),
      provenance: t.ItemSparse.provenance(id)
    };
    count('item', rec); return rec;
  });

  const referencedSpells = new Set();

  const bonusesBySet = new Map();
  for (const [id, r] of t.ItemSetSpell.byId) {
    const setId = t.ItemSetSpell.int(r, 'setId');
    const spellId = t.ItemSetSpell.int(r, 'spellId');
    const threshold = t.ItemSetSpell.int(r, 'threshold');
    if ([setId, spellId, threshold].some(isPending)) {
      pendingCounts['itemSetBonus.row'] = (pendingCounts['itemSetBonus.row'] ?? 0) + 1;
      continue;
    }
    referencedSpells.add(spellId);
    if (!bonusesBySet.has(setId)) bonusesBySet.set(setId, []);
    bonusesBySet.get(setId).push({ threshold, spellId, provenance: t.ItemSetSpell.provenance(id) });
  }
  const itemSets = [...t.ItemSet.byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, r]) => {
    const ids = t.ItemSet.ints(r, 'itemArray');
    const rec = {
      id,
      name: t.ItemSet.str(r, 'name'),
      itemIds: isPending(ids) ? [] : ids.filter(n => n > 0),
      bonuses: (bonusesBySet.get(id) ?? []).sort((a, b) => a.threshold - b.threshold || a.spellId - b.spellId),
      provenance: t.ItemSet.provenance(id)
    };
    count('itemSet', rec); return rec;
  });

  const rankBase = sources.prereqRankBase;
  const talentsByTree = new Map();
  for (const [id, r] of [...t.Talent.byId.entries()].sort((a, b) => a[0] - b[0])) {
    const treeId = t.Talent.int(r, 'treeId');
    if (isPending(treeId)) { pendingCounts['talent.treeId'] = (pendingCounts['talent.treeId'] ?? 0) + 1; continue; }
    const ranks = t.Talent.ints(r, 'rankArray');
    const rankSpellIds = isPending(ranks) ? ranks : ranks.filter(n => n > 0);
    if (!isPending(rankSpellIds)) rankSpellIds.forEach(s => referencedSpells.add(s));
    const preIds = t.Talent.ints(r, 'prereqTalentArray');
    const preRanks = t.Talent.ints(r, 'prereqRankArray');
    let prerequisites = [];
    if (!isPending(preIds) && !isPending(preRanks)) {
      if (!Number.isInteger(rankBase)) throw new Error('forever-sources.json prereqRankBase must be set (0 or 1) and verified against a known talent before talents are built.');
      prerequisites = preIds
        .map((talentId, i) => ({ talentId, rank: preRanks[i] - rankBase + 1 }))
        .filter(p => p.talentId > 0);
    }
    const rec = {
      id, treeId,
      row: t.Talent.int(r, 'row'),
      column: t.Talent.int(r, 'column'),
      rankSpellIds: isPending(rankSpellIds) || rankSpellIds.length ? rankSpellIds : pending('Talent has no rank spells.'),
      prerequisites,
      provenance: t.Talent.provenance(id)
    };
    count('talent', rec);
    if (!talentsByTree.has(treeId)) talentsByTree.set(treeId, []);
    talentsByTree.get(treeId).push(rec);
  }
  const talentTrees = [...t.TalentTab.byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, r]) => {
    const rec = {
      id,
      name: t.TalentTab.str(r, 'name'),
      classIds: decodeClassMask(t.TalentTab.int(r, 'classMask'), classIds),
      order: t.TalentTab.int(r, 'order'),
      talents: talentsByTree.get(id) ?? [],
      provenance: t.TalentTab.provenance(id)
    };
    count('talentTree', rec); return rec;
  }).filter(tree => tree.classIds.length && tree.talents.length);

  const spells = [...referencedSpells].sort((a, b) => a - b).map(id => {
    const s = t.Spell.byId.get(id);
    const n = t.SpellName.byId.get(id);
    const rec = {
      id,
      name: n ? t.SpellName.str(n, 'name') : pending('No SpellName row for this id.'),
      rank: s ? t.Spell.str(s, 'rank') : pending('No Spell row for this id.'),
      description: s ? t.Spell.str(s, 'description') : pending('No Spell row for this id.'),
      provenance: (n ? t.SpellName : t.Spell).provenance(id)
    };
    count('spell', rec); return rec;
  });

  const manifest = {
    product: sources.product,
    build: sources.build,
    tables: Object.fromEntries(Object.values(t).sort((a, b) => a.name.localeCompare(b.name)).map(x => [x.name, { rows: x.rows.length, sha256: x.sha }])),
    counts: { classes: classes.length, items: items.length, itemSets: itemSets.length, talentTrees: talentTrees.length, talents: talentTrees.reduce((n, x) => n + x.talents.length, 0), spells: spells.length },
    itemShards: Math.ceil(items.length / ITEM_SHARD_SIZE),
    pendingCounts: Object.fromEntries(Object.entries(pendingCounts).sort())
  };
  return { manifest, classes, items, itemSets, talentTrees, spells };
}

export function headerSnapshot(tables) {
  return Object.fromEntries(Object.values(tables).sort((a, b) => a.name.localeCompare(b.name)).map(x => [x.name, x.header]));
}

export function headerDrift(locked, snapshot) {
  const drift = [];
  for (const [table, cols] of Object.entries(locked)) {
    const now = snapshot[table];
    if (!now) { drift.push(`${table}: table missing`); continue; }
    const gone = cols.filter(c => !now.includes(c));
    const added = now.filter(c => !cols.includes(c));
    if (gone.length) drift.push(`${table}: removed ${gone.join(', ')}`);
    if (added.length) drift.push(`${table}: added ${added.join(', ')}`);
  }
  return drift;
}

/* ---------- IO ---------- */
const url = (sources, route, vars) => sources.baseUrl + route.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k]));

async function fetchTables(sources, cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  for (const table of sources.tables) {
    const res = await fetch(url(sources, sources.csvRoute, { table, build: sources.build }));
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('text/csv')) throw new Error(`${table}: expected text/csv, got "${type}".`);
    const disposition = res.headers.get('content-disposition') ?? '';
    const expected = `${table}.${sources.build}.csv`;
    const named = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
    if (named && named !== expected) throw new Error(`${table}: served "${named}", expected "${expected}". Wrong build or table.`);
    if (!named) console.warn(`WARN ${table}: no filename header, build not confirmed by server.`);
    await writeFile(path.join(cacheDir, expected), await res.text());
  }
}

async function loadTables(sources, inDir) {
  const files = await readdir(inDir);
  const tables = {};
  for (const table of sources.tables) {
    const file = [`${table}.${sources.build}.csv`, `${table}.csv`].find(f => files.includes(f));
    if (!file) throw new Error(`Missing CSV for ${table} in ${inDir}.`);
    tables[table] = makeTable(table, await readFile(path.join(inDir, file), 'utf8'), sources);
  }
  return tables;
}

const json = v => `${JSON.stringify(v, null, 1)}\n`;

export async function writeDatabase(db, snapshot, outDir) {
  await mkdir(path.join(outDir, 'items'), { recursive: true });
  await writeFile(path.join(outDir, 'manifest.json'), json(db.manifest));
  await writeFile(path.join(outDir, 'header-snapshot.json'), json(snapshot));
  for (const key of ['classes', 'itemSets', 'talentTrees', 'spells']) await writeFile(path.join(outDir, `${key}.json`), json(db[key]));
  for (let i = 0; i < db.manifest.itemShards; i += 1) {
    const shard = db.items.slice(i * ITEM_SHARD_SIZE, (i + 1) * ITEM_SHARD_SIZE);
    await writeFile(path.join(outDir, 'items', `items-${String(i).padStart(3, '0')}.json`), json(shard));
  }
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i += 1; } else out[a.slice(2)] = true;
  }
  return out;
}

async function main() {
  const opt = args(process.argv.slice(2));
  const sources = JSON.parse(await readFile(opt.sources ?? DEFAULT_SOURCES, 'utf8'));
  if (opt['list-builds']) {
    const res = await fetch(url(sources, sources.buildsRoute, { product: sources.product }));
    if (!res.ok) throw new Error(`builds: HTTP ${res.status}`);
    console.log(JSON.stringify(await res.json(), null, 1));
    return 0;
  }
  if (!opt.out) throw new Error('--out <dir> is required.');
  let inDir = opt.in;
  if (opt.fetch) {
    inDir = opt.cache ?? path.join(opt.out, '..', '.forever-csv-cache');
    await fetchTables(sources, inDir);
  }
  if (!inDir || !existsSync(inDir)) throw new Error('Give --in <dir> or --fetch.');
  const tables = await loadTables(sources, inDir);
  const snapshot = headerSnapshot(tables);
  if (sources.lockedHeaders) {
    const drift = headerDrift(sources.lockedHeaders, snapshot);
    if (drift.length) {
      console.error(`FOREVER_DB=HEADER_DRIFT\n${drift.join('\n')}`);
      return 2;
    }
  }
  const db = buildDatabase(tables, sources);
  await writeDatabase(db, snapshot, opt.out);
  console.log(JSON.stringify(db.manifest.counts));
  const pendings = Object.entries(db.manifest.pendingCounts);
  if (pendings.length) console.log(`PENDING ${pendings.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log('FOREVER_DB=PASS');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), err => { console.error(`FOREVER_DB=FAIL ${err.message}`); process.exit(1); });
}
