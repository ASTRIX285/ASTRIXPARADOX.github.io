import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

globalThis.CustomEvent=class CustomEvent{
  constructor(type,options={}){this.type=type;this.detail=options.detail;}
};
const events=[];
globalThis.document={documentElement:{dataset:{}},dispatchEvent:event=>{events.push(event);return true;}};
globalThis.ForgeLoader={set(){},status(){}};

const root=new URL('../',import.meta.url);
const {PAGE_KINDS,PREPARED_PAGE_STAGES,WORKSPACE_PRELOAD_PAGES,normalizePreparedPagePayload,preloadPreparedWorkspace,requestPreparedPagePayload}=await import('../core/prepared-page-client.mjs');

assert.deepEqual(Object.values(PREPARED_PAGE_STAGES).map(row=>row.percent),[8,18,42,72,92,96]);
assert.equal(PREPARED_PAGE_STAGES.request.label,'Loading prepared bulk manifest and Guardian data');
assert.deepEqual(WORKSPACE_PRELOAD_PAGES,['character','build-forge','vault','loadout'],'Journey must prepare every downstream workspace page, Character first.');
assert.deepEqual(await preloadPreparedWorkspace({authenticated:false}),{complete:false,ready:[],failed:[]},'Anonymous Journey visits must not start private workspace preparation.');

function envelope(page){
  const account={
    profile:{characters:{data:{'1':{characterId:'1',stats:{}}}}},
    definitionCoverage:{complete:true,unresolved:[]},
    pageReady:{page,manifestVersion:'real-manifest-version',definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}
  };
  const prepared={manifestVersion:'real-manifest-version',page:page==='journey'?'journey':page==='loadout'?'loadout':'common'};
  if(page==='journey')Object.assign(prepared,{manifestTables:{DestinyStatDefinition:{'2996146975':{hash:2996146975}}},journeyIndex:{endgameByDestination:{}},journeyCoverage:{complete:true}});
  if(page==='loadout')Object.assign(prepared,{forgeArmourIndex:{statDefinitions:{'2996146975':{hash:2996146975}},artifactCatalog:[]},loadoutCoverage:{complete:true}});
  if(page==='character'||page==='build-forge')prepared.artifactCatalog=[{hash:1}];
  return {schemaVersion:2,transport:'prepared-page-stream-v1',account,prepared};
}

for(const page of PAGE_KINDS){
  const normalized=normalizePreparedPagePayload(envelope(page),page);
  assert.equal(normalized.pageReady.page,page);
  assert.ok(normalized.profile.characters.data,'A prepared page must remain renderable');
  let calls=0;
  const payload=await requestPreparedPagePayload(page,{fetchImpl:async request=>{
    calls+=1;
    assert.equal(new URL(request).pathname,`/bungie/page/${page}`);
    assert.equal(new URL(request).searchParams.get('freshness'),'display');
    return Response.json(envelope(page));
  }});
  assert.equal(calls,1);
  assert.equal(payload.pageReady.page,page);
}

let liveRequest=null;
await requestPreparedPagePayload('character',{freshness:'live',fetchImpl:async request=>{
  liveRequest=new URL(request);
  return Response.json(envelope('character'));
}});
assert.equal(liveRequest.searchParams.get('freshness'),'live','A live Character refresh must be explicit on the prepared route.');

const runtimes=[
  'pages/guardian-workspace-v2/guardian-bungie-profile.mjs',
  'pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',
  'pages/journey/journey.mjs',
  'pages/vault/vault.mjs',
  'pages/forge-loader/forge-loader-preload.mjs',
  'pages/loadout/paradox-loadouts.mjs',
  'shared/astrix-hero-cards.mjs'
];
for(const path of runtimes){
  const source=await readFile(new URL(path,root),'utf8');
  assert.match(source,/prepared-page-client\.mjs/,`${path} must use the shared prepared page client`);
  assert.doesNotMatch(source,/new URL\(['"]\/bungie\/page\//,`${path} must not build its own prepared page request`);
}

const backend=await readFile(new URL('../forge-auth-worker/src/index.ts',root),'utf8');
const preparedClient=await readFile(new URL('core/prepared-page-client.mjs',root),'utf8');
const authRecord=await readFile(new URL('../forge-auth-worker/src/auth-record.ts',root),'utf8');
const preparedCache=await readFile(new URL('../forge-auth-worker/src/prepared-page-cache.ts',root),'utf8');
assert.match(backend,/preparedPageEnvelope[\s\S]*?prepared\.body\?\.getReader\(\)/,'The auth Worker must stream the prepared page bundle');
assert.doesNotMatch(backend,/bundleResponse\?\.ok\s*\?\s*await bundleResponse\.json/,'The auth Worker must not parse a prepared page bundle');
assert.doesNotMatch(backend,/seedTables[\s\S]*?Object\.entries\(seedTables\)/,'Journey must not copy public manifest tables on the auth Worker heap');
assert.match(backend,/WORKSPACE_PREPARED_PAGES[^=]*= \["character", "build-forge", "vault", "loadout"\]/,'The backend must enumerate every downstream workspace page in display order.');
assert.match(backend,/requestedFreshness === "display"[\s\S]*?readPreparedPage\(sessionId, page, preparedStatus\.manifestVersion/,'Display requests must read a session cache bound to the current live manifest version.');
assert.match(backend,/page === "journey"[\s\S]*?context\.waitUntil\(warmPreparedWorkspace\(request, env\)\)/,'Journey must trigger backend preparation for its downstream workspace.');
assert.match(backend,/async function warmPreparedWorkspace[\s\S]*?for \(const page of WORKSPACE_PREPARED_PAGES\)[\s\S]*?freshness", "display"/,'The backend workspace warm must prepare each complete display payload.');
assert.match(authRecord,/new PreparedPageCache\(this\.ctx\.storage\)[\s\S]*?path === "\/prepared-page"/,'Prepared page data must remain private inside the authenticated session Durable Object.');
assert.match(preparedCache,/PREPARED_PAGE_TTL_MS = 10 \* 60_000[\s\S]*?meta\.manifestVersion !== manifestVersion/,'Prepared page cache entries must expire and be invalidated by a live manifest change.');
assert.match(preparedClient,/for\(const value of pages\)[\s\S]*?preferBackend:true[\s\S]*?quiet:true/,'Journey must quietly transfer backend-prepared pages into the existing browser cache in order.');

const shellRuntimes=[
  'pages/guardian-workspace-v2/guardian-character-cards.mjs',
  'pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',
  'pages/journey/journey.mjs',
  'pages/vault/vault.mjs',
  'pages/forge-loader/forge-loader.mjs',
  'pages/loadout/paradox-loadouts.mjs'
];
for(const path of shellRuntimes){
  const source=await readFile(new URL(path,root),'utf8');
  assert.match(source,/mountForgeShell/,`${path} must mount the shared page shell`);
}

const progressEvents=events.filter(event=>event.type==='forge:prepared-page-progress');
assert.ok(progressEvents.length>=PAGE_KINDS.length*2,'Every prepared page request must publish shared progress');
console.log('SHARED_PAGE_CLIENT=PASS');
console.log('SHARED_PAGE_PROGRESS=PASS');
console.log('SHARED_PAGE_SHELL=PASS');
console.log('WORKER_STREAMING_PAGE_BUNDLE=PASS');
console.log('BACKEND_PREPARED_WORKSPACE=PASS');

// Synthetic browser storage: exercise warm navigation through the real client.
const {loadPreparedPagePayload}=await import('../core/prepared-page-client.mjs');
const {cacheBungieProfile}=await import('../pages/guardian-workspace-v2/guardian-session-cache.mjs');
const memoryStorage=()=>{const rows=new Map();return {getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key)};};
globalThis.sessionStorage=memoryStorage();globalThis.localStorage=memoryStorage();
const account={authenticated:true,activeDestinyMembership:{membershipId:'synthetic-a',membershipType:3}};
const journeyCache=normalizePreparedPagePayload(envelope('journey'),'journey');
await cacheBungieProfile(account,journeyCache,'journey');
let gateRequests=0,foregroundProgress=0;
globalThis.ForgeLoader={requireData(){gateRequests++;},set(){foregroundProgress++;},status(){}};
const cached=await loadPreparedPagePayload(account,'journey',{fetchImpl:()=>{throw new Error('Warm navigation must not wait for the network');}});
assert.equal(cached.pageReady.page,'journey');assert.equal(gateRequests,0);
const oldProgress=foregroundProgress;
let liveRelease;
const refreshing=loadPreparedPagePayload(account,'journey',{force:true,fetchImpl:request=>{
  assert.equal(new URL(request).searchParams.get('freshness'),'live');
  return new Promise(resolve=>{liveRelease=()=>resolve(Response.json(envelope('journey')));});
}});
assert.equal(foregroundProgress,oldProgress,'Background live requests must not emit loader progress');
assert.equal(gateRequests,0,'Background live requests must not reopen the gate');
assert.ok(liveRelease,'A forced refresh must still reach the live backend');
liveRelease();await refreshing;
await assert.rejects(loadPreparedPagePayload(account,'journey',{force:true,fetchImpl:async()=>{throw new Error('synthetic offline');}}),/synthetic offline/);
assert.equal((await loadPreparedPagePayload(account,'journey',{fetchImpl:()=>{throw new Error('Cache lost after refresh failure');}})).pageReady.page,'journey');

// Different memberships must never share an in-flight response.
const otherAccount={authenticated:true,activeDestinyMembership:{membershipId:'synthetic-b',membershipType:3}};
const releases=[];
const fetchPending=async()=>new Promise(resolve=>releases.push(()=>resolve(Response.json(envelope('vault')))));
const first=loadPreparedPagePayload(account,'vault',{force:true,fetchImpl:fetchPending});
const second=loadPreparedPagePayload(otherAccount,'vault',{force:true,fetchImpl:fetchPending});
assert.equal(releases.length,2,'Requests must be deduplicated within a membership, never across accounts');
releases.forEach(release=>release());await Promise.all([first,second]);

await cacheBungieProfile(account,{...journeyCache,pageReady:{...journeyCache.pageReady,manifestVersion:null}},'journey');
const priorGates=gateRequests;
let recovered=0;
await loadPreparedPagePayload(account,'journey',{fetchImpl:async()=>{recovered++;return Response.json(envelope('journey'));}});
assert.equal(recovered,1,'An invalid cached render contract must fetch a new display snapshot');
assert.equal(gateRequests,priorGates+1,'A warm hint with missing usable data must restore the cold loader');

for(const page of WORKSPACE_PRELOAD_PAGES){
  const entry=normalizePreparedPagePayload(envelope(page),page);
  entry.characterBuildCoverage={schemaVersion:2,complete:true};
  entry.weaponDefinitionCoverage={schemaVersion:1};
  await cacheBungieProfile(account,entry,page);
}
const warmed=await preloadPreparedWorkspace(account,{fetchImpl:()=>{throw new Error('Repeat Journey navigation must reuse already prepared pages');}});
assert.deepEqual(warmed.ready,WORKSPACE_PRELOAD_PAGES);assert.deepEqual(warmed.failed,[]);
console.log('WARM_PAGE_CACHE_AND_QUIET_REFRESH=PASS');
console.log('PAGE_REQUEST_MEMBERSHIP_ISOLATION=PASS');
let releaseSwitched;
globalThis.FORGE_BUNGIE_SESSION=account;
const switchedRequest=loadPreparedPagePayload(account,'journey',{force:true,fetchImpl:async()=>new Promise(resolve=>{releaseSwitched=()=>resolve(Response.json(envelope('journey')));})});
globalThis.FORGE_BUNGIE_SESSION=otherAccount;
releaseSwitched();await assert.rejects(switchedRequest,/membership changed/,'A late response must not be cached or published after switching accounts');
delete globalThis.FORGE_BUNGIE_SESSION;
await assert.rejects(loadPreparedPagePayload(account,'journey',{force:true,fetchImpl:async()=>Response.json({...journeyCache,membership:{membershipId:'another-account',membershipType:3}})}),/different Bungie membership/);
console.log('LATE_RESPONSE_ACCOUNT_GUARD=PASS');
const eventsBeforePreparation=events.length;
const currentPage=globalThis.document.documentElement.dataset.preparedPageKind;
await loadPreparedPagePayload(account,'journey',{quiet:true,publish:false});
assert.equal(events.length,eventsBeforePreparation,'Preparing another destination must not publish events into the visible page');
assert.equal(globalThis.document.documentElement.dataset.preparedPageKind,currentPage,'Preparation must not replace the visible page identity');
console.log('BACKGROUND_DESTINATION_PREPARATION_ISOLATED=PASS');
