import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import audit from '../pages/journey/europa-marker-data.mjs';
import catalogue from '../pages/journey/assets/map-data/europa.mjs';
import {applySourcedMapMarkers,canRenderSourcedMapMarker} from '../pages/journey/journey-map-model.mjs';

const result=applySourcedMapMarkers(catalogue,audit);
assert.equal(audit.markers.length,2);
assert.equal(audit.dropped.length,58);
assert.equal(new Set([...audit.markers,...audit.dropped].map(e=>e.id)).size,60);
assert.deepEqual(result.entries.filter(canRenderSourcedMapMarker).map(e=>e.name),['Deep Stone Crypt','Variks the Loyal']);
assert.equal(result.entries.filter(e=>e.position).length,2,'Every uncited legacy position is removed');
assert.equal(audit.dropped.filter(e=>e.type==='chest').length,9);
for(const type of ['landing','lost-sector','dungeon','vendor','chest'])assert(audit.dropped.some(e=>e.type===type&&e.reason));
for(const entry of audit.markers){
  assert(canRenderSourcedMapMarker(entry));
  assert.equal(new URL(audit.sources[entry.definition.table].url).origin,'https://www.bungie.net');
  for(const mutate of [
    e=>delete e.name,e=>e.name+=' made up',e=>delete e.icon,e=>e.icon='/img/misc/missing_icon_d2.png',
    e=>delete e.definition,e=>delete e.definition.hash,e=>e.definition.table='DestinyLocationDefinition',
    e=>e.definition.iconField='description',e=>delete e.position,e=>e.position.x=101,
    e=>delete e.position.source,e=>delete e.position.source.url,e=>e.position.source.url='javascript:alert(1)',
    e=>delete e.position.source.publisher,e=>delete e.position.source.sha256,e=>e.position.source.pixel=[-1,0],
    e=>e.position.basis='director-graph',e=>e.type='unknown'
  ]){const invalid=structuredClone(entry);mutate(invalid);assert.equal(canRenderSourcedMapMarker(invalid),false);}
}
assert.throws(()=>applySourcedMapMarkers(catalogue,{...audit,manifestVersion:'other'}),/mismatch/);
const file=await readFile(new URL('../pages/journey/assets/maps/'+audit.coordinateFrame.asset,import.meta.url));
assert.equal(createHash('sha256').update(file).digest('hex'),audit.coordinateFrame.sha256,'Hand placement must be reviewed when map art changes');
// Optional authoritative refresh check; normal CI is offline and uses the pinned audit.
if(process.env.JOURNEY_MANIFEST_DIR){
  for(const [table,source] of Object.entries(audit.sources)){
    const bytes=await readFile(`${process.env.JOURNEY_MANIFEST_DIR}/${table}.json`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
    const definitions=JSON.parse(bytes);
    for(const entry of audit.markers.filter(e=>e.definition.table===table)){
      const props=definitions[entry.definition.hash].displayProperties;
      assert.equal(entry.name,props.name);assert.equal(entry.icon,props[entry.definition.iconField]);
    }
    for(const candidate of audit.dropped)for(const definition of candidate.definitions||[]){
      if(definition.table!==table)continue;
      const props=definitions[definition.hash].displayProperties;
      for(const [key,value] of Object.entries(definition.displayProperties))assert.equal(props[key]??null,value);
    }
  }
}
console.log('EUROPA_MARKER_SOURCES=PASS verified=2 dropped=58');
