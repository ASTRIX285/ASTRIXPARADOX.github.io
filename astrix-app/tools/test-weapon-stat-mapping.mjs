import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WEAPON_STATS,weaponStatRows} from '../pages/guardian-workspace-v2/guardian-weapon-stat-definitions.mjs';

const manifest=JSON.parse(await readFile(new URL('../data/forge-armour-index.json',import.meta.url),'utf8'));
assert.equal(new Set(WEAPON_STATS.map(([hash])=>hash)).size,WEAPON_STATS.length);
for(const [hash,name] of WEAPON_STATS){
  assert.equal(manifest.statDefinitions[String(hash)]?.displayProperties?.name,name,`${hash} must match Bungie's stat definition`);
}

// Expected display values transcribed from Miguel's supplied in-game and DIM
// Unsworn screenshots on 2026-09-08. This is a display-mapping regression case,
// not a captured itemComponents response or proof of a bonus calculation.
const reference={
  'Impact':6,'Range':96,'Stability':81,'Handling':65,'Reload Speed':47,
  'Aim Assistance':100,'Zoom':16,'Airborne Effectiveness':15,
  'Ammo Generation':47,'Rounds Per Minute':1000,'Magazine':104,'Recoil Direction':97
};
const hashByName=Object.fromEntries(Object.entries(manifest.statDefinitions).map(([hash,definition])=>[definition.displayProperties?.name,hash]));
const referenceStats=Object.fromEntries(Object.entries(reference).map(([name,value])=>[hashByName[name],{value}]));
const rows=weaponStatRows(referenceStats);
assert.deepEqual(Object.fromEntries(rows.map(({name,value})=>[name,value])),reference);
assert.equal(rows.find(row=>row.name==='Airborne Effectiveness').hash,2714457168);
assert.equal(rows.find(row=>row.name==='Recoil Direction').hash,2715839340);
assert.equal(rows.find(row=>row.name==='Ammo Generation').hash,1931675084);
for(const row of rows)assert.equal(row.paradoxId,`paradox:bungie:DestinyStatDefinition:${row.hash}`);

// Verify all named stats in this shared mapping independently of weapon type.
// Test values here are display plumbing inputs, not claimed owned item stats.
for(const [hash,name] of WEAPON_STATS){
  assert.deepEqual(weaponStatRows({[hash]:{value:1}}).map(row=>[row.hash,row.name,row.value]),[[hash,name,1]]);
}
assert.deepEqual(weaponStatRows({}),[]);
assert.deepEqual(weaponStatRows(null),[]);
for(const missing of [null,undefined,'',false,true,NaN,Infinity]){
  assert.deepEqual(weaponStatRows({2714457168:{value:missing}}),[],'Missing or invalid stats must not become zero');
}
assert.equal(weaponStatRows({2714457168:{value:0}})[0].value,0,'A supplied zero is valid');
assert.equal(weaponStatRows({4284893193:{value:1000}})[0].value,1000,'RPM must not be capped to a bar width');

for(const file of ['guardian-semantic-ui.mjs','paradox-item-hover.mjs']){
  const source=await readFile(new URL(`../pages/guardian-workspace-v2/${file}`,import.meta.url),'utf8');
  assert.match(source,/import \{weaponStatBreakdown,weaponStatMarkup\} from '\.\/guardian-weapon-stat-model\.mjs'/,`${file} must use the shared mapping`);
  assert.doesNotMatch(source,/const WEAPON_STATS\s*=/,`${file} must not maintain a competing stat table`);
}
console.log(`WEAPON_STAT_MAPPING=PASS definitions=${WEAPON_STATS.length} Unsworn_display_stats=${rows.length}`);
