import assert from 'node:assert/strict';
import worker from '../../forge-manifest-worker/worker.mjs';
import {enrichLoadoutDetails} from '../../forge-auth-worker/src/loadout-details.ts';
import {enrichPreparedPageAccount} from '../../forge-auth-worker/src/page-semantics.ts';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';

const fixture=loadoutDetailsFixture(),version=fixture.manifestVersion;
const tables={...fixture.manifest.tables,DestinyInventoryItemDefinition:fixture.definitions};
const index={manifestVersion:version,tables:Object.fromEntries(Object.entries(tables).map(([type,rows])=>[type,{shards:1,definitions:Object.keys(rows).length,manifestVersion:version}]))};
const assets=new Map([['/index.json',index],...Object.entries(tables).map(([type,rows])=>[`/${type}/0.json`,rows])]),reads=[];
const manifestEnv={ASSETS:{fetch:async request=>{const url=new URL(request.url);assert.equal(url.host,'assets');reads.push(url.pathname);return assets.has(url.pathname)?Response.json(assets.get(url.pathname)):new Response(null,{status:404});}}};
const requests=[],env={MANIFEST_DATA:{fetch:async request=>{const url=new URL(request.url);assert.equal(url.host,'manifest');requests.push({path:url.pathname,body:request.method==='POST'?await request.clone().json():null});return worker.fetch(request,manifestEnv);}}};
const identifiers=()=>worker.fetch(new Request(`https://manifest/loadout-identifiers?version=${version}`),manifestEnv);
let response=await identifiers();assert.equal(response.status,200);const body=await response.json();assert.equal(body.manifestVersion,version);assert.equal(Object.keys(body.tables).length,3);
assert.equal((await worker.fetch(new Request('https://manifest/loadout-identifiers?version=stale'),manifestEnv)).status,409);
for(const type of ['DestinyLoadoutNameDefinition','DestinyLoadoutIconDefinition','DestinyLoadoutColorDefinition']){
  const descriptor=index.tables[type];
  index.tables[type]={...descriptor,manifestVersion:'stale'};assert.equal((await identifiers()).status,503);
  index.tables[type]={...descriptor,shards:100};assert.equal((await identifiers()).status,503);
  index.tables[type]=descriptor;const rows=assets.get(`/${type}/0.json`);assets.delete(`/${type}/0.json`);assert.equal((await identifiers()).status,503);assets.set(`/${type}/0.json`,rows);
}
let payload={profile:structuredClone(fixture.profile),definitions:{}};
// Saved weapon residing only in Vault must still gain its item and saved plug definitions.
const moved=payload.profile.characterEquipment.data['1'].items.shift();payload.profile.profileInventory.data.items.push({...moved,bucketHash:138197802});
await enrichLoadoutDetails(payload,env,version);
assert.ok(payload.definitions[moved.itemHash]);assert.ok(payload.definitions['101']);
assert.equal(payload.loadoutDetailsManifest.manifestVersion,version);assert.equal(payload.loadoutDetailsManifest.identifiersAvailable,true);assert.deepEqual(payload.loadoutDetailsManifest.unresolved,[]);
assert.ok(payload.loadoutDetailsManifest.tables.DestinySocketTypeDefinition['401']);assert.ok(payload.loadoutDetailsManifest.tables.DestinyStatDefinition['2996146975']);
assert.equal(requests.filter(row=>row.path==='/resolve').length,2,'One saved inventory batch, one socket/stat metadata batch');
assert.ok(requests.every(row=>['/resolve','/loadout-identifiers'].includes(row.path)),'No client or Bungie follow-up endpoints');
let base=requests.length;await enrichLoadoutDetails({},env,version);assert.equal(requests.length,base,'No component 206 means no speculative manifest work');
payload={profile:structuredClone(fixture.profile),definitions:{}};await enrichLoadoutDetails(payload,env,'stale');assert.equal(payload.loadoutDetailsManifest.identifiersAvailable,false);assert.deepEqual(payload.definitions,{});
payload={profile:structuredClone(fixture.profile),definitions:{}};await enrichLoadoutDetails(payload,{MANIFEST_DATA:{fetch:async()=>new Response(null,{status:503})}},version);assert.equal(payload.loadoutDetailsManifest.identifiersAvailable,false);assert.ok(payload.loadoutDetailsManifest.unresolved.length>0);
// Execute the actual prepared Character integration, including final compaction.
payload={profile:structuredClone(fixture.profile),definitions:{}};
await enrichPreparedPageAccount(payload,env,'character',{manifestVersion:version});
assert.ok(payload.loadoutDetailsManifest.tables.DestinyLoadoutNameDefinition);assert.ok(payload.definitions['301'].plug);
console.log('LOADOUT_DETAILS_BACKEND=PASS component 206 joins, Vault items, saved-only plugs, all identifier catalogues, exact versions, bounded backend-only batches, outage honesty, prepared Character wiring');
