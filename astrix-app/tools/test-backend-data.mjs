import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ProfileSnapshotCache,DISPLAY_TTL_MS} from '../../forge-auth-worker/src/profile-snapshot-cache.ts';
import {profileSections} from '../../forge-auth-worker/src/profile-sections.ts';
import {fetchDisplayProfile} from '../pages/guardian-workspace-v2/guardian-display-profile.mjs';
import dataWorker from '../../forge-manifest-worker/worker.mjs';
import {GuardianManifestService} from '../pages/guardian-workspace-v2/guardian-manifest-service.mjs';
import {bungieDefinitionHashes,enrichEquipableSets,enrichOwnedWeaponDefinitions,preparedDefinitions} from '../../forge-auth-worker/src/manifest-semantics.ts';
import {expandForgeArmourIndex} from '../core/forge-index-transport.mjs';
import {normalizePreparedPagePayload} from '../core/prepared-page-client.mjs';
import {resolveArmourSet} from '../pages/guardian-workspace-v2/guardian-armour-set-resolver.mjs';

// Regression evidence: Miguel's equipped Smoke Jumper Vestment, with its real
// manifest set and perks. No account identifier, roll or stat is fabricated.
const armourIndex=expandForgeArmourIndex(JSON.parse(await readFile(new URL('../data/forge-armour-index.json',import.meta.url),'utf8')));
const smokeDefinition=armourIndex.definitions['3788059976'];
assert.equal(smokeDefinition.displayProperties.name,'Smoke Jumper Vestment');
assert.equal(smokeDefinition.classType,2);
const definitionTables={DestinyEquipableItemSetDefinition:armourIndex.equipableItemSets,DestinySandboxPerkDefinition:armourIndex.sandboxPerks};
const setReads=[];
const setEnv={MANIFEST_DATA:{async fetch(request){
  const path=new URL(request.url).pathname;
  setReads.push(path);
  if(path==='/status')return Response.json({manifestVersion:armourIndex.manifestVersion});
  assert.equal(path,'/resolve');
  const body=await request.json();
  assert.equal(body.version,armourIndex.manifestVersion);
  return Response.json({manifestVersion:armourIndex.manifestVersion,tables:Object.fromEntries(Object.entries(body.requests).map(([type,hashes])=>[type,Object.fromEntries(hashes.filter(hash=>definitionTables[type]?.[hash]).map(hash=>[hash,definitionTables[type][hash]]))]))});
}}};
const gearSource=await readFile(new URL('../pages/guardian-workspace-v2/guardian-gear-layout.mjs',import.meta.url),'utf8');
const semanticWrapperSource=await readFile(new URL('../../forge-auth-worker/src/semantic-wrapper.ts',import.meta.url),'utf8');
assert.match(semanticWrapperSource,/const account = payload\?\.transport === "prepared-page-stream-v1" && payload\?\.account[\s\S]*?\? payload\.account[\s\S]*?resolveMissingInventoryDefinitions\(account, requested, env\)/,'Prepared Build Forge account envelopes must resolve live subclass socket definitions inside account data.');
assert.match(semanticWrapperSource,/account\.subclassCatalogCoverage = \{[\s\S]*?complete: unresolved\.length === 0/,'Prepared Build Forge subclass enrichment must publish exact socket definition coverage on the account payload.');
assert.match(semanticWrapperSource,/value !== "owned-item-definitions"[\s\S]*?coverage: \{complete: missing\.length === 0, missing\}/,'Resolved subclass definitions must repair the prepared page readiness contract before client validation.');
const setIconExpression=gearSource.match(/const setBonusIcon = ([^;]+);/)?.[1];
assert.ok(setIconExpression);
const renderSetIcon=new Function('armourSet','bungieIcon',`return ${setIconExpression};`);
for(const page of ['character','build-forge']){
  const account={profile:{},definitions:{3788059976:smokeDefinition},pageReady:{page,manifestVersion:armourIndex.manifestVersion}};
  const prepared={manifestVersion:armourIndex.manifestVersion};
  const envelope={transport:'prepared-page-stream-v1',account,prepared};
  const result=await enrichEquipableSets(envelope,setEnv);
  assert.equal(result,envelope);
  assert.equal(result.prepared,prepared,'Set enrichment must preserve the prepared manifest bundle.');
  assert.equal(result.equipableItemSets,undefined,'Do not write set data outside the account envelope.');
  const merged=normalizePreparedPagePayload(result,page);
  const set=resolveArmourSet(merged,{definition:smokeDefinition});
  assert.equal(set.identity.name,'Smoke Jumper Set',`${page}: prepared account sets must survive the client merge`);
  assert.equal(set.unresolved,false);
  assert.ok(set.twoPiece?.icon&&set.fourPiece?.icon,`${page}: both adjacent bonus icons must resolve`);
  assert.equal(set.identity.icon,'','This Bungie set has no separate identity icon.');
  assert.equal(renderSetIcon(set,value=>value),set.twoPiece.icon,'The existing renderer must use the real perk icon when the set identity icon is empty.');
  assert.equal(account.armourSetCoverage.complete,true);
}
const direct={definitions:{3788059976:smokeDefinition}};
await enrichEquipableSets(direct,setEnv);
assert.equal(direct.armourSetCoverage.complete,true,'Legacy direct profile responses must retain set enrichment.');
const readsBeforeEmpty=setReads.length;
await enrichEquipableSets({transport:'prepared-page-stream-v1',account:{definitions:{}},prepared:{}},setEnv);
assert.equal(setReads.length,readsBeforeEmpty,'Client-manifest loadout envelopes must not start per-set network expansion.');
console.log('PREPARED_ACCOUNT_ARMOUR_SET_ICONS=PASS');
console.log('PREPARED_ACCOUNT_SUBCLASS_SOCKET_DEFINITIONS=PASS');

// Captured from Miguel's equipped Prismatic Warlock configuration. A sixth
// fragment socket is empty, so Bungie reports its plugHash as null.
const prismaticCache=JSON.parse(await readFile(new URL('../data/paradox-forge/beta/beta-bungie-manifest-cache.json',import.meta.url),'utf8'));
const realPrismaticSocketHashes=[3893112950,1869939001,124726498,124726504,124726503,2626922120,2626922114];
assert.equal(prismaticCache.inventoryItems['3893112950'].display.name,'Prismatic Warlock');
assert.equal(prismaticCache.inventoryItems['1869939001'].display.name,'Needlestorm');
assert.equal(prismaticCache.inventoryItems['124726498'].display.name,'Facet of Purpose');
assert.deepEqual(bungieDefinitionHashes([...realPrismaticSocketHashes,null]),realPrismaticSocketHashes,'An empty real subclass socket must not become definition hash 0.');
let resolvedSubclassHashes=[];
const subclassEnv={MANIFEST_DATA:{async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/status')return Response.json({manifestVersion:prismaticCache.manifestVersion});
  assert.equal(path,'/resolve');
  const body=await request.json();
  resolvedSubclassHashes=body.requests.DestinyInventoryItemDefinition;
  assert.equal(resolvedSubclassHashes.every(hash=>Number.isInteger(hash)&&hash>0),true,'Manifest definition batches must contain only real positive Bungie hashes.');
  return Response.json({manifestVersion:prismaticCache.manifestVersion,tables:{DestinyInventoryItemDefinition:Object.fromEntries(resolvedSubclassHashes.map(hash=>[hash,prismaticCache.inventoryItems[String(hash)]]).filter(([,definition])=>definition))}});
}}};
const resolvedSubclassDefinitions=await preparedDefinitions('DestinyInventoryItemDefinition',[...realPrismaticSocketHashes,null],subclassEnv);
assert.deepEqual(resolvedSubclassHashes,realPrismaticSocketHashes);
assert.equal(Object.keys(resolvedSubclassDefinitions).length,realPrismaticSocketHashes.length,'The empty socket must not poison resolution of the real Super and fragment definitions.');
console.log('BACKEND_NULL_SUBCLASS_SOCKET_FILTER=PASS');

// Miguel's live Forge Loader page carried Vault-scoped weapon items, whose
// component bucket is the Vault rather than a weapon slot. The prepared worker
// must resolve the real item definition before it can identify and index them.
const weaponCatalogue=JSON.parse(await readFile(new URL('../data/weapon-catalogue/weapons-trace-rifle.json',import.meta.url),'utf8'));
const plugCatalogue=JSON.parse(await readFile(new URL('../data/weapon-catalogue/plugDefinitions-006.json',import.meta.url),'utf8'));
const realOwnedWeaponHash=1303313141;
const realSelectedPlugHash=1294026524;
const realOwnedWeaponDefinition=weaponCatalogue.weapons[String(realOwnedWeaponHash)];
const realSelectedPlugDefinition=plugCatalogue.plugDefinitions[String(realSelectedPlugHash)];
assert.equal(realOwnedWeaponDefinition.displayProperties.name,'Unsworn');
assert.equal(realSelectedPlugDefinition.displayProperties.name,'Adaptive Frame');
const capturedOwnedWeaponInstance='captured-owned-weapon-instance';
const weaponEnvelope={
  transport:'prepared-page-stream-v1',
  account:{
    profile:{
      profileInventory:{data:{items:[{itemHash:realOwnedWeaponHash,itemInstanceId:capturedOwnedWeaponInstance,bucketHash:138197802}]}},
      characterInventories:{data:{}},
      characterEquipment:{data:{}},
      itemComponents:{sockets:{data:{[capturedOwnedWeaponInstance]:{sockets:[{plugHash:realSelectedPlugHash}]}}}}
    },
    definitions:{}
  },
  prepared:{manifestVersion:armourIndex.manifestVersion}
};
const weaponDefinitions={[realOwnedWeaponHash]:realOwnedWeaponDefinition,[realSelectedPlugHash]:realSelectedPlugDefinition};
const weaponEnv={MANIFEST_DATA:{async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/status')return Response.json({manifestVersion:armourIndex.manifestVersion});
  assert.equal(path,'/resolve');
  const body=await request.json();
  return Response.json({manifestVersion:armourIndex.manifestVersion,tables:{DestinyInventoryItemDefinition:Object.fromEntries(body.requests.DestinyInventoryItemDefinition.filter(hash=>weaponDefinitions[hash]).map(hash=>[hash,weaponDefinitions[hash]]))}});
}}};
await enrichOwnedWeaponDefinitions(weaponEnvelope,weaponEnv);
assert.equal(weaponEnvelope.account.definitions[String(realOwnedWeaponHash)].displayProperties.name,'Unsworn','The prepared account envelope must receive the real Vault weapon definition.');
assert.equal(weaponEnvelope.account.definitions[String(realSelectedPlugHash)].displayProperties.name,'Adaptive Frame','The exact selected weapon socket must be resident before Forge Loader renders.');
assert.deepEqual(weaponEnvelope.account.weaponDefinitionCoverage.itemInstances,[capturedOwnedWeaponInstance]);
assert.equal(weaponEnvelope.account.weaponDefinitionCoverage.complete,true,'Real owned weapon and selected socket definitions must publish complete source coverage.');
console.log('PREPARED_ACCOUNT_OWNED_WEAPON_DEFINITIONS=PASS');

function storage(){
  const rows=new Map();
  return {rows,async get(key){return Array.isArray(key)?new Map(key.filter(k=>rows.has(k)).map(k=>[k,rows.get(k)])):rows.get(key);},async put(key,value){assert.ok(Buffer.byteLength(JSON.stringify(value))<128*1024);rows.set(key,value);},async delete(key){return rows.delete(key);}};
}
const disk=storage(),cache=new ProfileSnapshotCache(disk);
let calls=0;
const body=JSON.stringify({Response:{inventory:'🛡'.repeat(50_000)}});
const load=async()=>{calls++;return body;};
const results=await Promise.all([cache.read('account:character',load),cache.read('account:character',load)]);
assert.equal(calls,1);assert.equal(results[0].body,body);
const persisted=await new ProfileSnapshotCache(disk).read('account:character',load);
assert.equal(persisted.body,body);assert.equal(persisted.source,'snapshot');assert.equal(calls,1);
await cache.read('account:journey',load);assert.equal(calls,2);
await new ProfileSnapshotCache(storage()).read('account:character',load);assert.equal(calls,3);
await assert.rejects(()=>cache.read('account:character',async()=>{throw Error('Bungie unavailable');},Date.now()+DISPLAY_TTL_MS+1),/Bungie unavailable/);

const index={manifestVersion:'verified-test-version',tables:{DestinyInventoryItemDefinition:{shards:2}}};
let assets=0;
const env={ASSETS:{async fetch(request){assets++;const path=new URL(request.url).pathname;return Response.json(path==='/index.json'?index:path.endsWith('/1.json')?{'1':{hash:1},'3':{hash:3}}:{'2':{hash:2}});}}};
const route='https://data/definitions?type=DestinyInventoryItemDefinition&version=verified-test-version&hashes=';
let response=await dataWorker.fetch(new Request(route+'1,2,3'),env);
assert.deepEqual(Object.keys((await response.json()).definitions),['1','2','3']);assert.equal(assets,3);
assert.equal((await dataWorker.fetch(new Request(route+'0'),env)).status,400);
assert.equal((await dataWorker.fetch(new Request(route.replace('verified-test-version','old')+'1'),env)).status,409);
response=await dataWorker.fetch(new Request('https://data/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:index.manifestVersion,requests:{DestinyInventoryItemDefinition:[1,2,3]}})}),env);
assert.deepEqual(Object.keys((await response.json()).tables.DestinyInventoryItemDefinition),['1','2','3']);

const requests=[];
const service=new GuardianManifestService({backend:true,maxFallbackDefinitions:3,maxDefinitionBytes:1024,storage:{available:true,readCurrent(){throw Error('must not load full tables');}},fetchImpl:async input=>{
  const url=new URL(input);requests.push(url.pathname);throw Error(`unexpected client definition request ${url.pathname}`);
}});
const hashes=Array.from({length:100},(_,i)=>i+1);
service.seedPayload({pageReady:{page:'character',manifestVersion:index.manifestVersion},definitions:Object.fromEntries(hashes.map(hash=>[hash,{hash}]))});
const [a,b]=await Promise.all([service.getMany('DestinyInventoryItemDefinition',hashes),service.getMany('DestinyInventoryItemDefinition',hashes)]);
assert.equal(Object.keys(a).length,100);assert.deepEqual(a,b);
assert.equal(requests.length,0);
const live=await readFile(new URL('../pages/guardian-workspace-v2/guardian-live-actions.mjs',import.meta.url),'utf8');
assert.doesNotMatch(live,/freshness.*display|profile-snapshot/,'Apply must never use display snapshots');
const original={characters:{data:{test:{classType:1}}},profileInventory:{data:{items:[{itemInstanceId:'test-owned-instance'}]}}};
const first=await profileSections(original,'test-account');
const unchanged=await profileSections(original,'test-account',first.revisions);
assert.deepEqual(unchanged.changed,{});
const next={...original,profileInventory:{data:{items:[]}}};
assert.deepEqual(Object.keys((await profileSections(next,'test-account',first.revisions)).changed),['profileInventory']);
assert.deepEqual(Object.keys((await profileSections(original,'different-account',first.revisions)).changed),Object.keys(original));
let round=0;
const transport=async()=>Response.json({authenticated:true,membership:{membershipType:1,membershipId:'test-account'},profileSections:round++?unchanged:first});
const one=await fetchDisplayProfile('https://test/bungie/profile?scope=journey',{fetchImpl:transport});
const two=await fetchDisplayProfile('https://test/bungie/profile?scope=journey',{fetchImpl:transport});
assert.deepEqual(two.profile,original);assert.equal(two.profile.characters,one.profile.characters);
assert.deepEqual(two.changedSections,[]);
console.log('BACKEND_SECTION_REVISIONS_AND_CLIENT_REUSE=PASS');
console.log('BACKEND_SNAPSHOT_ISOLATION_FRESHNESS_COALESCING=PASS');
console.log('BACKEND_MANIFEST_BATCH_VERSION_AND_MEMORY_BOUNDS=PASS');
console.log('BACKEND_APPLY_CACHE_BYPASS=PASS');
