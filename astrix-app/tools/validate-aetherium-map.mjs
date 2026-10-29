#!/usr/bin/env node
// Atreia Atlas data (feature/aetherium-map-foundation, 28 Oct 2026): zones.json, layers.json and markers.json under
// astrix-app/games/aion2/data/map/. Every marker sits in a known zone and layer, has x and y between 0 and 1 and carries
// provenance (engine/atlas-data.mjs); every zone's base map is a WebP in our repo, under 400 KB, with its real size in
// zones.json; the files match their JSON schemas when ajv is installed (npm install --prefix astrix-app).
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const json=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const DATA='astrix-app/games/aion2/data/map/';
const zones=json(`${DATA}zones.json`),layers=json(`${DATA}layers.json`),markers=json(`${DATA}markers.json`);
const {atlasProblems}=await import(pathToFileURL(resolve(root,'astrix-app/games/aion2/engine/atlas-data.mjs')).href);

const problems=atlasProblems({zones,layers,markers});
assert.deepEqual(problems,[],`Atlas data:\n${problems.join('\n')}`);
assert.deepEqual(layers.layers.map(layer=>layer.id),['empyrean-trace','monolith','field-boss','kibelisk','merchant','crafting','storage','gathering','named-monster','dungeon-entrance','rift','place','area'],'Layer order');
assert.ok(!layers.layers.some(layer=>layer.id==='hidden-cube'),'No Hidden Cubes layer: their spots only come from the game client (Miguel, 29 Oct 2026)');
const DASH=/[–—]/;
for(const [name,data] of [['zones',zones],['layers',layers],['markers',markers]])assert.ok(!DASH.test(JSON.stringify(data)),`No en or em dash in ${name}.json`);

/* Base maps: ours, WebP, under 400 KB, and the size zones.json gives is the image's real size. */
function webpSize(buffer){
  assert.equal(buffer.toString('ascii',0,4),'RIFF');assert.equal(buffer.toString('ascii',8,12),'WEBP');
  const chunk=buffer.toString('ascii',12,16);
  if(chunk==='VP8X')return {width:1+buffer.readUIntLE(24,3),height:1+buffer.readUIntLE(27,3)};
  if(chunk==='VP8 ')return {width:buffer.readUInt16LE(26)&0x3fff,height:buffer.readUInt16LE(28)&0x3fff};
  if(chunk==='VP8L'){const b=buffer.readUInt32LE(21);return {width:(b&0x3fff)+1,height:((b>>14)&0x3fff)+1};}
  throw new Error(`Unknown WebP chunk ${chunk}`);
}
for(const zone of zones.records.filter(zone=>zone.image)){
  const full=resolve(root,`.${zone.image}`);
  const bytes=statSync(full).size;
  assert.ok(bytes<400*1024,`${zone.id}: ${zone.image} is ${Math.round(bytes/1024)} KB, keep it under 400 KB`);
  assert.deepEqual(webpSize(readFileSync(full)),{width:zone.width,height:zone.height},`${zone.id}: width and height match the image`);
  if(zone.imageSmall){
    const small=resolve(root,`.${zone.imageSmall}`);
    assert.ok(statSync(small).size<400*1024,`${zone.id}: small map under 400 KB`);
    assert.equal(webpSize(readFileSync(small)).width,zone.smallWidth,`${zone.id}: smallWidth matches the small image`);
  }
}

const require=createRequire(import.meta.url);
let Ajv2020,addFormats;
try{Ajv2020=require(resolve(root,'astrix-app/node_modules/ajv/dist/2020.js'));addFormats=require(resolve(root,'astrix-app/node_modules/ajv-formats'));}
catch{try{Ajv2020=require('ajv/dist/2020.js');addFormats=require('ajv-formats');}catch{console.log('AETHERIUM_MAP schema check skipped (run npm install --prefix astrix-app)');}}
if(Ajv2020){
  const ajv=new (Ajv2020.default??Ajv2020)({allErrors:true,strict:true});
  (addFormats.default??addFormats)(ajv);
  for(const [schema,data] of [['atlas-zones',zones],['atlas-layers',layers],['atlas-markers',markers]]){
    const validate=ajv.compile(json(`astrix-app/games/aion2/schema/${schema}.schema.json`));
    assert.ok(validate(data),`${schema}: ${ajv.errorsText(validate.errors)}`);
  }
}
console.log(`AETHERIUM_MAP=ok zones=${zones.records.length} captured=${zones.records.filter(zone=>zone.image).length} layers=${layers.layers.length} markers=${markers.records.length}`);
