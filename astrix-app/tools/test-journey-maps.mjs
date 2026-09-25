import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {POINT_TYPES,hasMapPosition,canRenderMapMarker,markerGlyphMarkup,mapCatalogueEntries,filterMapEntries,clusterMapEntries,regionChestEntries,directorIconUrl,directorViewBox,directorViewPosition,normaliseRegionChestProgress} from '../pages/journey/journey-map-model.mjs';
import {destinationNameMatches,resolveRegionChestProgress,REGION_CHEST_CHECKLIST_HASH} from '../pages/journey/journey-destination-model.mjs';

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
assert.equal(paleView.width/paleView.height,16/9,'Pale Heart must retain the same frame shape as the other destinations');
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

// Real public checklist IDs, with representative profile states. Bungie supplies
// blank location releases for these chests; those blanks must not hide the list.
const checklistHash=String(REGION_CHEST_CHECKLIST_HASH);
const checklist={displayProperties:{name:'Region Chests'},scope:0,entries:[
  {hash:4166997609,displayProperties:{name:'109. The Pale Heart'},destinationHash:3998251206,locationHash:2257004215,scope:0},
  {hash:2008208662,displayProperties:{name:'110. The Pale Heart'},destinationHash:3998251206,locationHash:2257004212,scope:0},
  {hash:1505906871,displayProperties:{name:'111. The Pale Heart'},destinationHash:3998251206,locationHash:2257004213,scope:0},
  {hash:3156467474,displayProperties:{name:'1. European Dead Zone'},destinationHash:697502628,locationHash:3698639472,scope:0}
]};
const chestInputs={key:'pale-heart',checklists:{[checklistHash]:checklist},
  profileStates:{[checklistHash]:{4166997609:true,2008208662:false}},
  characterStates:{[checklistHash]:{4166997609:false,2008208662:true,1505906871:true}},
  destinations:{3998251206:{hash:3998251206,displayProperties:{name:'The Pale Heart'}},697502628:{hash:697502628,displayProperties:{name:'European Dead Zone'}}},
  locations:{2257004215:{locationReleases:[{destinationHash:3998251206,displayProperties:{name:'',description:''},worldPosition:[]}]}}
};
const chestProgress=resolveRegionChestProgress(chestInputs);
assert.deepEqual([chestProgress.total,chestProgress.discovered,chestProgress.missing,chestProgress.unknown],[3,1,1,1]);
assert.deepEqual(chestProgress.chests.map(chest=>chest.collected),[true,false,null],'Profile-scoped chests must not inherit another character state');
assert(chestProgress.chests.every(chest=>chest.location==='The Pale Heart'),'Nameless releases must retain the official destination');
const normalisedChests=normaliseRegionChestProgress('pale-heart',chestProgress);
assert.equal(normalisedChests.chests.length,3);
assert.equal(normalisedChests.missing,1,'Unknown is not missing');
assert.equal(normalisedChests.unknown,1);
assert(regionChestEntries(normalisedChests).every(chest=>chest.position===null),'Checklist location hashes do not establish map coordinates');
const unknownChests=resolveRegionChestProgress({...chestInputs,profileStates:{}});
assert.deepEqual([unknownChests.total,unknownChests.discovered,unknownChests.missing,unknownChests.unknown],[3,0,0,3]);
assert(normaliseRegionChestProgress('pale-heart',unknownChests));
assert.equal(normaliseRegionChestProgress('edz',chestProgress),null);
assert.equal(normaliseRegionChestProgress('pale-heart',{...chestProgress,total:4}),null);
assert.equal(resolveRegionChestProgress({...chestInputs,destinations:{}}),null,'Missing definitions must not become a false zero total');
assert.equal(resolveRegionChestProgress({...chestInputs,checklists:{}}),null);

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

// Prompt 24: missing art has an original type glyph; unknown positions/types stay off-map.
for(const type of Object.keys(POINT_TYPES)){
 const entry={type,position:{x:50,y:50}};
 assert.equal(canRenderMapMarker(entry),true);
 assert.equal(directorIconUrl(entry),null);
 assert.match(markerGlyphMarkup(type),/<svg[^>]+data-marker-glyph=[^>]+><path d="[^" ]/);
 assert.doesNotMatch(markerGlyphMarkup(type),/undefined|<image|https?:/);
}
for(const entry of [{type:'unknown',position:{x:50,y:50}},{type:'chest'}, {type:'vendor',position:{x:NaN,y:5}}, {type:'activity',position:{x:101,y:5}}])assert.equal(canRenderMapMarker(entry),false);
assert.equal(markerGlyphMarkup('unknown'),'');
assert.equal(directorIconUrl({icon:`https://www.bungie.net${official}`}),`https://www.bungie.net${official}`);
const palette=await readFile(new URL('../../css/astrix-palette.css',import.meta.url),'utf8');
const rgb=token=>palette.match(new RegExp(`--${token}:\\s*#([0-9a-f]{6})`,'i'))[1].match(/../g).map(v=>parseInt(v,16)/255);
const luminance=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const background=luminance(rgb('apx-colour-panel'));
for(const token of ['apx-colour-text','apx-colour-secondary'])assert.ok((luminance(rgb(token))+.05)/(background+.05)>=4.5,`${token}: chest text contrast`);
const styles=await readFile(new URL('../pages/journey/journey-2560-visual.css',import.meta.url),'utf8');
assert.match(styles,/\.journey-region-chests \*\{text-shadow:none;filter:none\}/);
assert.doesNotMatch(styles,/\.journey-region-chest\.is-missing[^{}]*\{[^}]*color:transparent/);
console.log('JOURNEY_MARKERS_CHESTS=PASS known types, original fallback glyphs, positions, tokens >=4.5:1');
