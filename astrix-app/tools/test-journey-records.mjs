import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JourneyManifestService} from '../pages/journey/journey-manifest.mjs';
import {resolveRecordTree,findDestinationNodes,patternTypeKey,seasonRankProgress} from '../pages/journey/journey-record-model.mjs';
import {GuardianManifestService} from '../pages/guardian-workspace-v2/guardian-manifest-service.mjs';
const base=new URL('../data/journey-index/',import.meta.url);
const index=JSON.parse(await readFile(new URL('index.json',base)));
const calls=[];
const service=new JourneyManifestService({fetchImpl:async input=>{const url=new URL(input);calls.push(url.pathname.split('/').at(-1));return Response.json(JSON.parse(await readFile(new URL(url.pathname.split('/').at(-1),base))));},fallback:{checkVersion:async()=>index.manifestVersion,getMany:async()=>{throw new Error('Unexpected full-manifest fallback');}}});
const officialDestinationRecordCounts=new Map();
for(const rootHash of [1163735237,1866538467,0]){
 const payload={profile:{profileRecords:{data:{recordCategoriesRootNodeHash:rootHash}},profilePresentationNodes:{data:{nodes:{}}}}};
 const tree=await resolveRecordTree(payload,service);
 assert.equal(tree.hash,'1163735237');assert.equal(tree.triumphs.hash,'1866538467');
 assert.ok(tree.roots.some(row=>row.definition.displayProperties.name==='Medals'));
 for(const name of ['The Pale Heart','Neomuna','Europa','Throne World','Dreaming City','Nessus','European Dead Zone','The Moon','Cosmodrome']){
  const nodes=await findDestinationNodes(tree.triumphs,service,label=>label===name);
  assert.ok(nodes.length,`${name}: official destination branch must resolve from root ${rootHash}`);
  const foundRecords=new Set();const seen=new Set();let pending=nodes.map(n=>Number(n.hash));
  while(pending.length){const defs=await service.getMany('DestinyPresentationNodeDefinition',pending);pending=[];for(const n of Object.values(defs)){if(seen.has(n.hash))continue;seen.add(n.hash);for(const r of n.children?.records||[])foundRecords.add(r.recordHash);pending.push(...(n.children?.presentationNodes||[]).map(e=>e.presentationNodeHash));}}
  assert.ok(foundRecords.size,`${name}: catalogue must contain record leaves`);
  const records=await service.getMany('DestinyRecordDefinition',foundRecords);assert.equal(Object.keys(records).length,foundRecords.size,`${name}: all record definitions resolve`);
  if(rootHash===1163735237){officialDestinationRecordCounts.set(name,foundRecords.size);console.log(`${name}: ${foundRecords.size} official records`);}
 }
}
assert.equal(patternTypeKey(['Patterns & Catalysts','Primary Weapon Patterns','Auto Rifles']),'primary');
assert.equal(patternTypeKey(['Heavy Weapon Patterns','Swords']),'heavy');
assert.equal(patternTypeKey(['Not a weapon pattern'] ),null);
const rankPayload={profile:{characterProgressions:{data:{c:{progressions:{10:{level:100,levelCap:100},11:{level:7,progressToNextLevel:20,nextLevelAt:100}}}}}}};
const rank=seasonRankProgress(rankPayload,'c',{pass:{rewardProgressionHash:10,prestigeProgressionHash:11}});assert.equal(rank.rank,107);assert.equal(rank.active.progressToNextLevel,20);
assert.equal(seasonRankProgress({},'c',{}).rank,null);
// Real catalogue has the extra Patterns & Catalysts wrapper that broke grouping.
const patterns=await service.getAsync('DestinyPresentationNodeDefinition',2642502414);
assert.equal(patterns.children.presentationNodes[0].presentationNodeHash,3442838224);
for(const type of Object.keys(index.tables)){
 const {shards}=index.tables[type];for(let i=0;i<shards.length;i++)await service.shard(index,type,i);
 assert.ok(service.status().shards<=8);assert.ok(service.status().retainedBytes<=6*1024*1024);
}
let attempts=0;
const retry=new JourneyManifestService({fetchImpl:async()=>{if(attempts++===0)return new Response(null,{status:503});return Response.json(index);},fallback:{checkVersion:async()=>index.manifestVersion}});
await assert.rejects(retry.index());assert.equal((await retry.index()).manifestVersion,index.manifestVersion);
let legacyCalls=[];
const selective=new GuardianManifestService({selective:true,maxFallbackDefinitions:4,storage:{available:false},fetchImpl:async input=>{const u=new URL(input);legacyCalls.push(u.pathname);return Response.json({definition:{hash:Number(u.searchParams.get('hash'))}});}});
await selective.getMany('DestinyRecordDefinition',[1,2,3,4,5,6]);assert.equal(selective.fallbackDefinitions.size,0);assert.deepEqual(legacyCalls,[],'Unprepared Journey definitions must not issue per item requests');
const before=calls.length;
const concurrent=new JourneyManifestService({fetchImpl:service.fetchImpl,fallback:service.fallback});
await Promise.all([concurrent.getAsync('DestinyPresentationNodeDefinition',1163735237),concurrent.getAsync('DestinyPresentationNodeDefinition',1866538467)]);
assert.equal(calls.slice(before).filter(p=>p==='DestinyPresentationNodeDefinition-0.json').length,1,'Concurrent views must share the same pending shard');
console.log('JOURNEY_RECORD_MAPPING_AND_MEMORY=PASS');
// Execute production data-joining functions, not a second implementation.
const {runInNewContext}=await import('node:vm');
const source=await readFile(new URL('../pages/journey/journey.mjs',import.meta.url),'utf8');
const names=['titleRecordFor','titleRequirementRow','bungieIconUrl','bungiePresentationIcon','presentationRecordCategories','presentationLeafCategories','recordPresentationTree','journeyCharacterFor','destinationRecordItem','destinationCategoryItem','destinationRecordSections','verifiedCraftablePatternTypes'];
const functions=names.map(name=>{const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const end=source.indexOf('\n}',start)+2;return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,end);}).join('\n');
const destinationNames={'pale-heart':'The Pale Heart',neomuna:'Neomuna',europa:'Europa','throne-world':'Throne World','dreaming-city':'Dreaming City',nessus:'Nessus',edz:'European Dead Zone',moon:'The Moon',cosmodrome:'Cosmodrome'};
const context={guardianManifest:service,resolveRecordTree,findDestinationNodes,patternTypeKey,selectedCharacterId:'test',BUNGIE_ORIGIN:'https://www.bungie.net',URL,finiteNumber:v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null,recordCategoryKey:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'),destinationNameKey:v=>String(v||'').toLowerCase(),destinationNameMatches:(k,n)=>n===destinationNames[k],PATTERN_CATALYST_TYPE_DEFINITIONS:[{key:'primary'},{key:'special'},{key:'heavy'},{key:'catalysts'}]};
runInNewContext(functions+'\nthis.joins={destinationRecordSections,verifiedCraftablePatternTypes,presentationRecordCategories,titleRequirementRow};',context);
const profile={profile:{characters:{data:{test:{characterId:'test'}}},profileRecords:{data:{recordCategoriesRootNodeHash:1866538467,records:{}}},profilePresentationNodes:{data:{nodes:{}}},characterCraftables:{data:{test:{craftingRootNodeHash:2642502414,craftables:{}}}}}};
let destinationRecordTotal=0;
for(const [destination,label] of Object.entries(destinationNames)){
 const result=await context.joins.destinationRecordSections(profile,destination,'test');
 assert.equal(Object.hasOwn(result,'triumphs'),false,`${destination}: duplicate Triumph destination rows must not be retained`);
 const recordRows=result.records.filter(row=>row.hash);
 assert.equal(recordRows.length,officialDestinationRecordCounts.get(label),`${destination}: the single Records view must retain every official destination record`);
 assert.equal(new Set(recordRows.map(row=>row.hash)).size,recordRows.length,`${destination}: destination Record hashes must be unique`);
 assert.ok(recordRows.some(row=>row.completed===null),'Absent profile states must stay unknown');
 destinationRecordTotal+=recordRows.length;
}
console.log(`JOURNEY_DESTINATION_RECORD_DEDUP=PASS destinations=${Object.keys(destinationNames).length} records=${destinationRecordTotal}`);
const patternsJoined=await context.joins.verifiedCraftablePatternTypes(profile,'test');
for(const type of patternsJoined){assert.ok(type.categories.length,`${type.key} must have real pattern categories`);assert.ok(type.categories.some(c=>c.items.length));}
const medals=await context.joins.presentationRecordCategories([{presentationNodeHash:4227847809}],{},'test','medals');
assert.ok(medals.length>=3);assert.ok(medals.every(c=>c.recordEntries.length));
console.log('JOURNEY_PRODUCTION_JOINS=PASS patterns='+patternsJoined.reduce((sum,t)=>sum+t.total,0)+' medalCategories='+medals.length);

const noCrafting=structuredClone(profile);delete noCrafting.profile.characterCraftables;
const publicPatterns=await context.joins.verifiedCraftablePatternTypes(noCrafting,'test');
assert.equal(publicPatterns.reduce((sum,t)=>sum+t.total,0),patternsJoined.reduce((sum,t)=>sum+t.total,0),'Missing craftable instances must not hide public pattern definitions');
assert.ok(publicPatterns.every(t=>t.completed===null),'Unknown personal pattern progress must not become zero');
const {resolveCollectionBadges}=await import('../pages/journey/journey-collection-model.mjs');

const fullBadges=await resolveCollectionBadges({profile:{profileCollectibles:{data:{collectionBadgesRootNodeHash:498211331,collectibles:{}}}}},service,'test');
assert.equal(fullBadges.badges.length,39,'Every official badge in this snapshot must resolve');
assert.deepEqual(fullBadges.coverage.unresolved,[],'All badge collectible identities must resolve from compact shards');
assert.ok(fullBadges.badges.every(b=>b.requirements.length&&b.completed===null),'Unknown badge progress must remain unknown');
assert.ok(service.status().retainedBytes<=service.status().maxBytes);
console.log('JOURNEY_BADGE_CATALOGUE=PASS badges='+fullBadges.badges.length+' requirements='+fullBadges.badges.reduce((sum,b)=>sum+b.requirements.length,0));
