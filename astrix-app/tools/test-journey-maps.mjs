import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {POINT_TYPES,hasMapPosition,mapCatalogueEntries,filterMapEntries,clusterMapEntries,regionChestEntries,directorIconUrl,directorViewBox,directorViewPosition} from '../pages/journey/journey-map-model.mjs';
import {destinationNameMatches} from '../pages/journey/journey-destination-model.mjs';

const dataRoot=new URL('../pages/journey/assets/map-data/',import.meta.url);
const provenance=JSON.parse(await readFile(new URL('../data/journey-map-provenance.json',import.meta.url),'utf8'));
let total=0,positioned=0;
for(const file of await readdir(dataRoot)){
  if(!file.endsWith('.mjs'))continue;
  const {default:data}=await import(new URL(file,dataRoot));
  assert.equal(file,`${data.key}.mjs`);
  assert.equal(data.manifestVersion,provenance.manifestVersion);
  assert.equal(data.destinationHash,provenance.destinations[data.key].destinationHash);
  const ids=new Set(),nodeIds=new Set();
  for(const entry of data.entries){
    assert(!ids.has(entry.id),`${data.key}: duplicate point ${entry.id}`);ids.add(entry.id);
    assert(entry.name?.trim());assert(POINT_TYPES[entry.type]);
    if(entry.nodeId)nodeIds.add(entry.nodeId);
    if(entry.position){assert(hasMapPosition(entry));assert(entry.position.basis);positioned++;}
    assert.equal(entry.completed,undefined,'Catalogue data cannot assert Guardian completion');
    for(const variant of entry.variants){assert(Number.isInteger(variant.hash));assert(variant.name);assert.equal(variant.completed,undefined);}
  }
  assert.equal(nodeIds.size+provenance.destinations[data.key].unnamedNodes.length,provenance.destinations[data.key].graphNodeCount,'Every named graph node must be linked');
  assert.equal(data.entries.length,provenance.destinations[data.key].entries);
  total+=data.entries.length;
}
assert.equal(Object.keys(provenance.destinations).length,10);
assert(!provenance.destinations.tower);assert(!provenance.destinations['lawless-frontier']);
assert(destinationNameMatches('nessus','Arcadian Valley'));
assert(!destinationNameMatches('nessus','Europa'));

const {default:nessus}=await import(new URL('nessus.mjs',dataRoot));
assert.equal(filterMapEntries(nessus.entries,'inverted spire').length,1);
assert.equal(filterMapEntries(nessus.entries,'inverted spire','vendor').length,0);
assert.equal(filterMapEntries(nessus.entries,'a name that does not exist').length,0);
assert.equal(filterMapEntries([{name:'Límíng Harbor',type:'landing'}],'liming').length,1);
assert(!hasMapPosition({position:{x:NaN,y:2}}));assert(!hasMapPosition({position:{x:102,y:2}}));
assert.equal(directorIconUrl({type:'strike',variants:[{icon:'/img/misc/missing_icon_d2.png'}]}),null,'Missing artwork must not become a fabricated type icon');
assert.equal(directorIconUrl({icon:'https://untrusted.example/icon.png'}),null);
const official='/common/destiny2_content/icons/3642cf9e2acd174dcab5b5f9e3a3a45d.png';
assert.equal(directorIconUrl({variants:[{icon:'/img/misc/missing_icon_d2.png'},{icon:official}]}),`https://www.bungie.net${official}`);
const paleView=directorViewBox('pale-heart');
const {default:pale}=await import(new URL('pale-heart.mjs',dataRoot));
for(const entry of pale.entries.filter(hasMapPosition)){
  const viewPosition=directorViewPosition(entry.position,paleView);
  assert(hasMapPosition({position:viewPosition}),`${entry.name}: cropped position outside artwork`);
  for(const resolution of [1,1.5]){
    // Round-trip every actual point through crop coordinates at both asset sizes.
    assert(Math.abs((viewPosition.x/100*paleView.width+paleView.x)*resolution-entry.position.x/100*3840*resolution)<1e-8);
    assert(Math.abs((viewPosition.y/100*paleView.height+paleView.y)*resolution-entry.position.y/100*2160*resolution)<1e-8);
  }
}
assert.deepEqual(directorViewPosition({x:25,y:75},directorViewBox('edz')),{x:25,y:75});
const points=[{id:'a',position:{x:40,y:50}},{id:'b',position:{x:42,y:50}},{id:'unknown',position:null}];
assert.equal(clusterMapEntries(points,1000,500,1).length,1);
assert.equal(clusterMapEntries(points,1000,500,3).length,2);
assert.equal(clusterMapEntries(points,390,220,1).flatMap(group=>group.entries).length,2);

const mapSource=await readFile(new URL('../pages/journey/journey-location-maps.mjs',import.meta.url),'utf8');
const approved=[...mapSource.matchAll(/key:'([^']+)',type:'([^']+)',name:('(?:[^']*)'|"(?:[^"]*)"),x:(\d+),y:(\d+)/g)].map(([,key,type,name,x,y])=>({key,type,name:name.slice(1,-1),x:Number(x),y:Number(y)}));
assert.equal(approved.length,9);
const {default:cosmodrome}=await import(new URL('cosmodrome.mjs',dataRoot));
const merged=mapCatalogueEntries(cosmodrome,approved);
assert.equal(merged.filter(hasMapPosition).length,9);
for(const marker of approved){const entry=merged.find(e=>e.markerKey===marker.key);assert(entry);assert.equal(entry.position.x,marker.x);assert.equal(entry.position.y,marker.y);}
assert.equal(cosmodrome.entries.filter(hasMapPosition).length,0,'Merging must not mutate the catalogue');
const chests=regionChestEntries({chests:[{name:'Region chest',location:'Trostland',collected:false}]});
assert.equal(chests[0].completed,false);assert.equal(chests[0].position,null);
assert.deepEqual(regionChestEntries(null),[]);

const manifest=JSON.parse(await readFile(new URL('../data/journey-map-assets.json',import.meta.url),'utf8'));
assert.equal(manifest.assets.length,18);
for(const asset of manifest.assets){
  const path=new URL(`../pages/journey/assets/maps/${asset.file}`,import.meta.url);
  const bytes=await readFile(path);
  assert(bytes.length>0,fileURLToPath(path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
console.log(`JOURNEY_MAPS=PASS destinations=10 entries=${total} positioned=${positioned+9} assets=18`);
