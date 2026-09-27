import assert from 'node:assert/strict';
import worker from '../../forge-manifest-worker/worker.mjs';

// Synthetic identity fixtures are isolated to this offline test.
const type='DestinyInventoryItemDefinition',version='synthetic-v2';
const descriptor={shards:1,definitions:1,manifestVersion:version};
const index={schemaVersion:2,manifestVersion:version,tables:{[type]:descriptor},pageTables:{[type]:descriptor},retiredTables:{[type]:descriptor}};
const live={hash:1,displayProperties:{name:'Synthetic current',icon:'/synthetic/current.png'},itemType:3};
const archive={hash:2,name:'Synthetic old',icon:'/synthetic/old.png',type,itemType:3,lastSeenVersion:'synthetic-v1',removedInVersion:version};
const assets=new Map([
 ['/index.json',index],
 [`/${type}/0.json`,{'1':live}],
 [`/page/${type}/0.json`,{'1':live}],
 [`/retired/${type}/0.json`,{'1':{...archive,hash:1},'2':archive}],
]);
let reads=[];
const env={ASSETS:{async fetch(request){const path=new URL(request.url).pathname;reads.push(path);return assets.has(path)?Response.json(assets.get(path)):new Response(null,{status:404});}}};
const get=hashes=>worker.fetch(new Request(`https://manifest/definitions?version=${version}&type=${type}&hashes=${hashes}`),env);
let response=await get('1');assert.equal(response.status,200);
assert.deepEqual((await response.json()).definitions['1'],live,'Live identity wins over history');
assert.equal(reads.length,2,'Current hits do not read archival shards');
response=await get('1,2,3');assert.equal(response.status,200);
let payload=await response.json();
assert.deepEqual(payload.unresolved,['3']);
assert.equal(payload.definitions['2'].displayProperties.name,'Retired: Synthetic old');
assert.equal(payload.definitions['2'].displayProperties.icon,archive.icon);
assert.equal(payload.definitions['2'].definitionType,type);
assert.equal(payload.definitions['2'].retirement.lastSeenVersion,'synthetic-v1');
assert.equal(payload.definitions['2'].retired,true);
assert.equal(payload.definitions['2'].itemType,3);
assert.equal(payload.definitions['2'].equippable,undefined,'Do not invent gameplay capability');
for(const projection of ['full','page']){
 response=await worker.fetch(new Request('https://manifest/resolve',{method:'POST',body:JSON.stringify({version,projection,requests:{[type]:[1,2,3]}})}),env);
 assert.equal(response.status,200);payload=await response.json();
 assert.equal(payload.manifestVersion,version);
 assert.deepEqual(payload.tables[type]['1'],live);
 assert.equal(payload.tables[type]['2'].displayProperties.name,'Retired: Synthetic old');
 assert.equal(payload.tables[type]['3'],undefined);
}
for(const field of ['name','icon']){
 assets.set(`/retired/${type}/0.json`,{'2':{...archive,[field]:null}});
 payload=await (await get('2')).json();
 assert.equal(payload.definitions['2'].displayProperties[field],undefined,'Missing metadata stays absent');
}
assets.set(`/retired/${type}/0.json`,{'2':archive});
for(const section of ['tables','pageTables','retiredTables']){
 const previous=index[section][type];index[section][type]={...descriptor,manifestVersion:'mixed-version'};
 response=section==='pageTables'?await worker.fetch(new Request('https://manifest/resolve',{method:'POST',body:JSON.stringify({version,projection:'page',requests:{[type]:[2]}})}),env):await get('2');
 assert.equal(response.status,503,`${section} rejects mixed versions`);
 index[section][type]=previous;
}
assets.delete(`/retired/${type}/0.json`);assert.equal((await get('2')).status,503);
assert.equal((await get('1')).status,200,'Missing archive does not invalidate a current identity');
const oldIndex={...index};delete oldIndex.retiredTables;assets.set('/index.json',oldIndex);
payload=await (await get('2')).json();assert.deepEqual(payload.unresolved,['2']);
assert.equal((await worker.fetch(new Request(`https://manifest/definitions?version=stale&type=${type}&hashes=1`),env)).status,409);
console.log('MANIFEST_RETIREMENT=PASS current precedence, archived identity, no fabricated fields, bulk/page resolution, version guards');
