import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

globalThis.CustomEvent=class CustomEvent{
  constructor(type,options={}){this.type=type;this.detail=options.detail;}
};
const events=[];
globalThis.document={documentElement:{dataset:{}},dispatchEvent:event=>{events.push(event);return true;}};
globalThis.ForgeLoader={set(){},status(){}};

const root=new URL('../',import.meta.url);
const {PAGE_KINDS,PREPARED_PAGE_STAGES,normalizePreparedPagePayload,requestPreparedPagePayload}=await import('../core/prepared-page-client.mjs');

assert.deepEqual(Object.values(PREPARED_PAGE_STAGES).map(row=>row.percent),[8,18,42,72,92,96]);
assert.equal(PREPARED_PAGE_STAGES.request.label,'Loading prepared bulk manifest and Guardian data');

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
    return Response.json(envelope(page));
  }});
  assert.equal(calls,1);
  assert.equal(payload.pageReady.page,page);
}

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
assert.match(backend,/preparedPageEnvelope[\s\S]*?prepared\.body\?\.getReader\(\)/,'The auth Worker must stream the prepared page bundle');
assert.doesNotMatch(backend,/bundleResponse\?\.ok\s*\?\s*await bundleResponse\.json/,'The auth Worker must not parse a prepared page bundle');
assert.doesNotMatch(backend,/seedTables[\s\S]*?Object\.entries\(seedTables\)/,'Journey must not copy public manifest tables on the auth Worker heap');

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
