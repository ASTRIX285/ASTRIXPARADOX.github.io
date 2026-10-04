import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {boundedStringify,jsonByteLength,graphFingerprint,readBoundedJson,MAX_JSON_BYTES} from '../core/bounded-json.mjs';
globalThis.location={pathname:'/',search:''};
const {normaliseLiveProfile}=await import('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs');
const {normalizePreparedPagePayload,loadPreparedPagePayload}=await import('../core/prepared-page-client.mjs');
const {cacheBungieProfile,readCachedBungieProfile}=await import('../pages/guardian-workspace-v2/guardian-session-cache.mjs');
const {createEnginePrecomputer}=await import('../core/engine-precompute.mjs');
// Real account scale, synthetic identities: 900 items with 160 reusable cosmetics.
// Definitions use the production schema and typical description sizes. No player data.
const definitions={100:{hash:100,displayProperties:{name:'Fixture rifle'},itemType:3,inventory:{bucketTypeHash:1498876634,tierType:5},sockets:{socketEntries:[{socketTypeHash:1}],socketCategories:[]}}};
const choices=Array.from({length:160},(_,i)=>{const hash=1000+i;definitions[hash]={hash,displayProperties:{name:'Fixture shader '+i,description:'Cosmetic fixture description. '.repeat(12)},itemType:19,plug:{plugCategoryIdentifier:'shader'}};return [hash,null,true,true];});
const items=Array.from({length:900},(_,i)=>({itemHash:100,itemInstanceId:'fixture-'+i,bucketHash:138197802}));
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'fixture-account'}};
const raw={transport:'prepared-page-stream-v1',prepared:{artifactCatalog:[{hash:1}]},account:{definitions,characterBuildCoverage:{schemaVersion:2,complete:true},pageReady:{page:'character',coverage:{complete:true,missing:[]}},profile:{characters:{data:{'1':{characterId:'1',classType:1,light:2000}}},characterEquipment:{data:{'1':{items:[items[0]]}}},profileInventory:{data:{items}},preparedPlugLists:{schemaVersion:1,dictionary:[choices],itemRefs:Object.fromEntries(items.map(item=>[item.itemInstanceId,{0:0}]))}}}};
const wire=boundedStringify(raw,'profile fixture wire');
const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const sizes=[],keys=[];
for(let load=0;load<10;load++){
  const payload=normalizePreparedPagePayload(JSON.parse(wire),'character');
  await cacheBungieProfile(session,payload,'character');
  const restored=await readCachedBungieProfile(session,'character');assert.ok(restored?.profile);
  const bytes=jsonByteLength(restored,{limit:Infinity});sizes.push(bytes);
  assert.equal(bytes,jsonByteLength(payload,{limit:Infinity}));
  assert.equal(restored.payload,undefined,'cache must never embed a previous envelope');
  const normalised=normaliseLiveProfile(restored,session,'1');
  const keyInput=[normalised.manifestVersion||null,normalised.profileSnapshot||null,normalised.membershipType,normalised.membershipId,normalised.characterId,[...normalised.weapons,...normalised.ownedWeapons],normalised.armour.filter(Boolean)];
  keys.push(graphFingerprint(keyInput));
  assert.equal(normalised.ownedWeapons.length,900);
  await cacheBungieProfile(session,restored,'character');
  assert.equal(jsonByteLength(await readCachedBungieProfile(session,'character'),{limit:Infinity}),bytes);
  if(load===0){
    console.log('EXPANDED_OLD_KEY_BYTES',jsonByteLength(keyInput,{limit:Infinity}));
    console.log('NEW_KEY_BYTES',keys[0].length);
    const precompute=createEnginePrecomputer();assert.equal(precompute(normalised),precompute(normalised));
  }
}
assert.equal(new Set(sizes).size,1);assert.equal(new Set(keys).size,1);
console.log('PROFILE_TEN_LOAD_BYTES',JSON.stringify(sizes));console.log('PROFILE_WIRE_BYTES',Buffer.byteLength(wire));
// The production failure can be reached with shared data, without allocating a giant string.
const leaf={description:'x'.repeat(1024)};
let amplified=leaf;for(let i=0;i<20;i++)amplified={a:amplified,b:amplified};
assert.ok(jsonByteLength(amplified,{limit:Infinity})>512*1024*1024);
assert.throws(()=>boundedStringify(amplified,'amplified fixture'),error=>error.code==='profile_payload_too_large');
assert.ok(graphFingerprint(amplified).length<=21);
const hugeBuild={weapons:[{itemInstanceId:'fixture-huge',itemHash:100,definition:amplified}]};
assert.equal(createEnginePrecomputer()(hugeBuild).inventoryByHash.size,1);
const recursive={};recursive.previous=recursive;assert.throws(()=>boundedStringify(recursive),/recursive/);
for(const value of [{emoji:'🙂',escapes:'\n\u0000"\\'},[undefined,NaN,null,'é','\ud800'],{date:new Date('2026-01-01')}])assert.equal(jsonByteLength(value),Buffer.byteLength(JSON.stringify(value)));
let cancelled=false;
const oversized=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));
await assert.rejects(readBoundedJson(oversized),error=>error.code==='profile_payload_too_large');assert.ok(cancelled);
let authPrompts=0;globalThis.ForgeLoader={authRequired(){authPrompts++;},blocked(){},requireData(){}};globalThis.FORGE_BUNGIE_SESSION=session;
await assert.rejects(loadPreparedPagePayload(session,'character',{force:true,quiet:true,fetchImpl:async()=>Response.json({error:'profile_payload_too_large'},{status:503})}),error=>error.status===503&&error.code==='profile_payload_too_large');
assert.equal(globalThis.FORGE_BUNGIE_SESSION,session);assert.equal(authPrompts,0);
// Exercise the Forge Loader's real init path with failed session checks and profile loads.
const loader=readFileSync(new URL('../pages/forge-loader/forge-loader.mjs',import.meta.url),'utf8');
const init=loader.slice(loader.indexOf('async function init(){'),loader.lastIndexOf('\ninit();'));
for(const checkedSession of [{authenticated:null,error:'profile_payload_too_large'},session,{authenticated:false},{authenticated:false,status:401,error:'bungie_reauthentication_required'}]){
  let prompts=0,blocked=0;const elements=new Map();const byId=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
  const ctx={console:{error(){}},installEvents(){},byId,authStartUrl:()=>'/fresh-sign-in',renderResidency(){},renderStaged(){},renderResultsCta(){},startForgeRefresh(){},getBungieSession:async()=>checkedSession,loadVerifiedPayload:async()=>{throw new RangeError('Invalid string length');},ForgeLoader:{authRequired(){prompts++;},blocked(){blocked++;},recover(){blocked++;return 'bungie';}}};
  await runInNewContext(init+'\ninit()',ctx);
  assert.equal(prompts,checkedSession.error==='bungie_reauthentication_required'?1:0);
  if(!prompts)assert.equal(blocked,1);
}
console.log('PROFILE_SIZE_AND_AUTH_RECOVERY=PASS');
