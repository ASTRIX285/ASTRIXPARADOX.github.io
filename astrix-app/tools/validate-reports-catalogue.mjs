import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REPORTS_SCHEMA,validateReleaseCoverage} from '../../forge-auth-worker/src/reports-catalogue.ts';
import {slimCatalogue,viewModel} from '../pages/reports/reports-model.mjs';
import {releaseOrder} from '../../forge-auth-worker/src/reports-release-order.ts';
const raw=await readFile(new URL('./fixtures/reports-catalogue-current.json',import.meta.url));
const catalogue=JSON.parse(raw);
assert.equal(catalogue.schema,REPORTS_SCHEMA);
assert.ok(catalogue.version);
validateReleaseCoverage(catalogue.activities);
assert.ok(catalogue.activities.some(row=>row.series==='raids'));
assert.ok(catalogue.activities.some(row=>row.series==='dungeons'));
for(const row of catalogue.activities){
  assert.deepEqual(Object.keys(row).sort(),['difficulty','hash','name','pgcrImage','releaseOrder','series']);
  assert.match(row.hash,/^\d+$/);
  assert.ok(row.pgcrImage===''||row.pgcrImage.startsWith('/img/'));
  if(['raids','dungeons','exotic'].includes(row.series))assert.equal(row.releaseOrder,releaseOrder(row.series,row.name));
}
assert.throws(()=>validateReleaseCoverage([{series:'raids',name:'Missing raid',releaseOrder:null}]),/Missing Reports release order/);
assert.throws(()=>validateReleaseCoverage([{series:'dungeons',name:'Missing dungeon',releaseOrder:null}]),/Missing Reports release order/);
console.log(`REPORTS_CATALOGUE=PASS version=${catalogue.version} bytes=${raw.byteLength} activities=${catalogue.activities.length}`);

// Prompt 20a-fix2: strict current-catalogue coverage and grouping remain CI gates.
const grouped=slimCatalogue(catalogue.activities);
const raids=grouped.filter(row=>row.series==='raids');
assert.equal(raids[0].name,'The Desert Perpetual');
assert.equal(raids.filter(row=>/Pantheon/.test(row.name)).length,1);
assert.equal(raids.filter(row=>row.name.includes('The Desert Perpetual')).length,1);
assert.ok(raids.find(row=>row.name==='The Desert Perpetual').variants.some(row=>row.difficulty==='Epic'));
const pantheon=raids.find(row=>row.name==='The Pantheon');
assert.equal(pantheon.variants.length,14);
assert.equal(new Set(pantheon.variants.map(row=>row.difficulty)).size,14);
assert.equal(grouped.flatMap(row=>row.variants).length,catalogue.activities.length);
for(const group of grouped)if(group.variants.some(row=>row.difficulty!=='-'))assert.ok(group.variants.every(row=>row.difficulty!=='-'),group.name);
const model=viewModel({catalogue:grouped,characters:[],aggregates:{}},'raids');
assert.equal(model.activities.find(row=>row.name==='The Pantheon').difficulties.length,14);

// Prompt 20c additions 4-6: one box per known mission, ordered by public debut.
const exotic=grouped.filter(row=>row.series==='exotic');
for(const name of ['Oblation',"Kell's Fall",'Encore']){
 assert.equal(exotic.filter(row=>row.name===name).length,1,name);
 assert.equal(exotic.filter(row=>row.name.startsWith(`${name}: `)).length,0,name);
}
assert.ok(exotic.every((row,index)=>!index||(exotic[index-1].releaseOrder??Infinity)>=(row.releaseOrder??Infinity)));
assert.equal(exotic[0].name,'Oblation');
for(const group of grouped){
 const peers=grouped.filter(other=>other!==group&&other.series===group.series);
 if(group.image&&peers.some(other=>other.image===group.image))assert.ok(group.imageCandidates.every(image=>peers.some(other=>other.image===image)),`${group.name}: shared art despite an available alternative`);
 assert.ok(!group.image||group.imageCandidates.includes(group.image),'Art comes from a variant of this box');
}
