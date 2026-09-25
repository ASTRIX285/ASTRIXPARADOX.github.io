import {destinationNameMatches,destinationActivityMatches} from '../pages/journey/journey-destination-model.mjs';
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
 for(const name of ['Kepler','The Lawless Frontier','The Pale Heart','Neomuna','Europa','Throne World','Dreaming City','Nessus','European Dead Zone','The Moon','Cosmodrome']){
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
const destinationNames={kepler:'Kepler','lawless-frontier':'The Lawless Frontier','pale-heart':'The Pale Heart',neomuna:'Neomuna',europa:'Europa','throne-world':'Throne World','dreaming-city':'Dreaming City',nessus:'Nessus',edz:'European Dead Zone',moon:'The Moon',cosmodrome:'Cosmodrome'};
const context={guardianManifest:service,resolveRecordTree,findDestinationNodes,patternTypeKey,selectedCharacterId:'test',BUNGIE_ORIGIN:'https://www.bungie.net',URL,finiteNumber:v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null,recordCategoryKey:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'),destinationNameKey:v=>String(v||'').toLowerCase(),destinationNameMatches,destinationActivityMatches,PATTERN_CATALYST_TYPE_DEFINITIONS:[{key:'primary'},{key:'special'},{key:'heavy'},{key:'catalysts'}]};
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

// Prepared activity records must survive either bootstrap arrival order.
{
const vm=await import('node:vm');

const source=await readFile(process.argv[2]||new URL('../pages/journey/journey.mjs',import.meta.url),'utf8');
const between=(start,end)=>{
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert.ok(first>=0&&last>first,`Missing production section: ${start}`);
  return source.slice(first,last);
};
const bootstrap=source.slice(source.indexOf("\ntry{\n  reportPreparedPageStage('start','journey');"));
assert.ok(bootstrap.includes('const profile=await readVerifiedProfile(session)'));
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'account'}};
const profile=(rows={titan:[{instanceId:'titan-activity'}],warlock:[{instanceId:'warlock-activity'}]})=>({
  profile:{characters:{data:{titan:{},warlock:{}}}},
  preparedAccountData:{activityHistoryByCharacter:Object.fromEntries(Object.entries(rows).map(([id,activities])=>[id,{activities}]))}
});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function harness(){
  const h=vm.createContext({
    console:{info(){}},Date,Promise,Map,
    verifiedProfile:null,journeySession:null,selectedCharacterId:'',selectedClassName:'',
    currentActivityEvidence:null,journeyActivityRequest:0,journeyActivityCache:new Map(),
    PREPARED_PAGE_REFRESH_MS:600000,JOURNEY_BOOTSTRAP_UI_WAIT_MS:6000,
    card:{dataset:{characterId:'titan',class:'Titan'}},
    rendered:[],normaliseCalls:0,unavailable:[],
    FORGE_BUNGIE_SESSION:session,document:{},
    getBungieSession:async()=>session,
    readVerifiedProfile:async()=>profile(),
    reportPreparedPageStage(){},waitForHeroCards:async()=>{},
    bindProfileCards(){},bindDestinationProgress:async()=>{},
    showJourney:async()=>{},startJourneyBackgroundRefresh(){},
    preloadPreparedWorkspace:async()=>{},waitForJourneyAtmosphere:async()=>{},
    waitWithin:promise=>promise,finishJourneyLoader:async()=>{},
    showSignedOut(){throw new Error('Unexpected signed-out state');},
    renderJourneyContext(){},bindJourneyCrossPageEvidence(){},renderJourneyContextStatus(){},
    renderCurrentForm(){},renderEvidenceConfidence(){},renderMissionHighlights(){},renderMostUsed(){},
    buildMissionReportView:activities=>({count:activities.length})
  });
  h.heroCards={querySelector:()=>h.card};
  h.renderRecentActivity=activities=>{h.rendered=activities;};
  h.showJourneyUnavailable=message=>h.unavailable.push(message);
  h.normaliseActivityHistory=async prepared=>{h.normaliseCalls++;return prepared.activities;};
  vm.runInContext([
    between('function journeyActivityCacheKey','async function bindTitleAndProgression'),
    between('function selectJourneyCharacter','function selectJourneyView'),
    `async function bootstrapJourney(){${bootstrap}\n}`
  ].join('\n'),h);
  return h;
}

// Real bootstrap runs after the hero selection has arrived but before its
// shared profile request completes. Activity must recover without another click.
const early=harness(),ready=deferred(),selected=deferred();
early.readVerifiedProfile=async()=>{
  early.syncSelectedCharacterFromCards();
  selected.resolve();
  await ready.promise;
  return profile();
};
const starting=early.bootstrapJourney();
await selected.promise;
assert.equal(early.selectedCharacterId,'titan');
assert.equal(early.journeyActivityCache.size,0,'Selecting a Guardian before profile readiness must not cache a failed request');
ready.resolve();await starting;
assert.equal(early.currentActivityEvidence?.status,'ok','Bootstrap must bind the initial Guardian without a second selection');
assert.equal(early.rendered[0].instanceId,'titan-activity');
assert.equal(early.normaliseCalls,1,'Bootstrap and later selection must share the same resolved evidence');
assert.equal(early.unavailable.length,0);

// The reverse arrival order is valid too: the observer binds a later roster.
const late=harness();late.card=null;
await late.bootstrapJourney();
assert.equal(late.normaliseCalls,0);
late.card={dataset:{characterId:'warlock',class:'Warlock'}};
late.syncSelectedCharacterFromCards();
await late.bindJourneyActivityEvidence(session);
assert.equal(late.rendered[0].instanceId,'warlock-activity');

// A genuinely missing history must remain retryable after the payload refreshes.
const retry=harness();retry.verifiedProfile=profile({});
assert.equal((await retry.fetchJourneyActivityEvidence(session,'titan')).status,'unavailable');
assert.equal(retry.journeyActivityCache.size,0,'A settled missing-history failure must not leave a pending entry');
retry.verifiedProfile=profile();
assert.equal((await retry.fetchJourneyActivityEvidence(session,'titan',{force:true})).status,'ok');
assert.equal(retry.normaliseCalls,1);

// Concurrent callers normalize only once. A late result cannot replace the
// displayed evidence after the user has selected another Guardian.
const switching=harness(),slow=deferred();
switching.verifiedProfile=profile();switching.journeySession=session;
switching.normaliseActivityHistory=async prepared=>{
  switching.normaliseCalls++;
  if(prepared.activities[0]?.instanceId==='titan-activity')await slow.promise;
  return prepared.activities;
};
switching.selectJourneyCharacter('titan','Titan');
const oldSelection=switching.bindJourneyActivityEvidence(session);
switching.selectJourneyCharacter('warlock','Warlock');
await switching.bindJourneyActivityEvidence(session);
assert.equal(switching.rendered[0].instanceId,'warlock-activity');
slow.resolve();await oldSelection;
assert.equal(switching.rendered[0].instanceId,'warlock-activity','The previous Guardian must not overwrite the current selection');
assert.equal(switching.normaliseCalls,2,'Each Guardian must be normalized once across overlapping callers');

// Failed refresh preserves previously verified evidence without pinning the
// failure; the next refresh can still replace it with the new payload.
const refresh=harness();refresh.verifiedProfile=profile();
const original=await refresh.fetchJourneyActivityEvidence(session,'titan');
refresh.verifiedProfile=profile({});
assert.equal(await refresh.fetchJourneyActivityEvidence(session,'titan',{force:true}),original);
refresh.verifiedProfile=profile({titan:[{instanceId:'new-activity'}]});
assert.equal((await refresh.fetchJourneyActivityEvidence(session,'titan',{force:true})).activities[0].instanceId,'new-activity');
refresh.normaliseActivityHistory=async()=>{throw new Error('Unusable returned history');};
refresh.verifiedProfile=profile();
assert.equal((await refresh.fetchJourneyActivityEvidence(session,'warlock')).status,'unavailable');
assert.equal(refresh.journeyActivityCache.has(refresh.journeyActivityCacheKey(session,'warlock')),false);

const empty=harness();empty.verifiedProfile=profile({titan:[]});
const noActivities=await empty.fetchJourneyActivityEvidence(session,'titan');
assert.equal(noActivities.status,'ok','A returned empty history is valid evidence, not a missing payload');
assert.equal(noActivities.activities.length,0);
assert.equal(await empty.fetchJourneyActivityEvidence({authenticated:false},'titan'),null);

console.log('JOURNEY_ACTIVITY_STARTUP=PASS early/late roster, retry, concurrency, Guardian switch, refresh recovery and empty history');
}
