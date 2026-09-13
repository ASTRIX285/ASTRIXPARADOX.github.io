import assert from 'node:assert/strict';
import {COMPONENT_TYPES,GuardianManifestService} from '../pages/guardian-workspace-v2/guardian-manifest-service.mjs';
import {characterPlugSetsForItem} from '../core/bungie-profile-plugs.mjs';

class MemoryStorage{
  available=true;
  records=new Map();
  async readCurrent(){return this.records.get('current')||null;}
  async readTable(version,type){return this.records.get(`${version}:${type}`)||null;}
  async writeTable(version,type,definitions){this.records.set(`${version}:${type}`,{version,type,definitions});return true;}
  async commitVersion(version){this.records.set('current',{version,types:[...COMPONENT_TYPES]});return true;}
  async removeOtherVersions(version){for(const key of this.records.keys())if(key!=='current'&&!key.startsWith(`${version}:`))this.records.delete(key);return true;}
}

const tables={
  DestinyInventoryItemDefinition:{
    '100':{hash:100,itemType:3,displayProperties:{name:'Freshly Rolled Weapon',icon:'/weapon.png',description:'Weapon definition'},sockets:{socketEntries:[{singleInitialItemHash:201,reusablePlugItems:[{plugItemHash:202}],reusablePlugSetHash:444}],socketCategories:[{socketCategoryHash:500,socketIndexes:[0]}]},perks:[{perkHash:900}]},
    '201':{hash:201,displayProperties:{name:'Rolled Perk',icon:'/perk.png',description:'Real rolled perk'}},
    '202':{hash:202,displayProperties:{name:'Alternative Perk',icon:'/alternate.png',description:'Real alternative perk'}},
    '203':{hash:203,displayProperties:{},perks:[{perkHash:900}]},
    '300':{hash:300,displayProperties:{name:'Active Artifact Perk',icon:'/artifact-perk.png',description:'Real artifact perk'}}
  },
  DestinySandboxPerkDefinition:{'900':{hash:900,displayProperties:{name:'Sandbox Effect',description:'Sandbox effect description'}}},
  DestinyArtifactDefinition:{'700':{hash:700,displayProperties:{name:'Current Artifact',icon:'/artifact.png'},tiers:[{items:[{itemHash:300}]}]}},
  DestinyPlugSetDefinition:{},
  DestinyStatDefinition:{'600':{hash:600,displayProperties:{name:'Guardian Stat',icon:'/stat.png'}}},
  DestinySocketCategoryDefinition:{'500':{hash:500,displayProperties:{name:'Weapon Perks',description:'Weapon perk sockets'}}},
  DestinyEquipableItemSetDefinition:{'800':{hash:800,displayProperties:{name:'Armour Set Bonus',icon:'/set.png'},setPerks:[{sandboxPerkHash:900}]}}
};

let version='v1';
const componentCalls=[];
const fetchImpl=async input=>{
  const url=new URL(String(input));
  if(url.pathname==='/bungie/manifest')return Response.json({version,jsonWorldComponentContentPaths:{en:Object.fromEntries(COMPONENT_TYPES.map(type=>[type,`/${type}.json`]))}});
  if(url.pathname==='/bungie/manifest/component'){
    const type=url.searchParams.get('type');
    componentCalls.push(`${version}:${type}`);
    return new Response(JSON.stringify(tables[type]),{headers:{'Content-Type':'application/json','Content-Length':String(JSON.stringify(tables[type]).length)}});
  }
  return new Response(null,{status:404});
};

const storage=new MemoryStorage();
const first=new GuardianManifestService({fetchImpl,storage,authOrigin:'https://auth.test'});
await first.ready();
assert.equal(first.status().mode,'indexeddb');
assert.equal(first.status().versionMatched,false);
assert.equal(componentCalls.length,COMPONENT_TYPES.length,'first version must download every supported manifest component');
assert.equal(first.identity(201).name,'Rolled Perk');
assert.equal(first.identity(201).icon,'https://www.bungie.net/perk.png');
assert.equal(first.identity(203).name,'Sandbox Effect');

const compactArtifact={
  hash:2001,
  name:'Compact Artifact 2.0',
  availabilityModel:'artifact-2-socket-buckets',
  selectionLimit:1,
  selectionSlots:[{tierIndex:0,bucket:1,capacity:1,perkHashes:[2101]}],
  perks:[{hash:2101,name:'Compact Artifact Perk',description:'Void grenade final blows improve grenade recharge.',displayResolved:true}],
  activePerks:[]
};
const compactPayload={};
assert.equal(first.applyForgeArmourIndex(compactPayload,{
  schemaVersion:4,
  manifestVersion:'v1',
  definitions:{'400':{hash:400,itemType:2,displayProperties:{name:'Compact Armour'}}},
  socketLayouts:{},
  equipableItemSets:{},
  sandboxPerks:{},
  statDefinitions:{},
  plugDefinitions:{},
  socketCategoryDefinitions:{},
  artifactCatalog:[compactArtifact]
}),true,'matching compact Forge armour and Artifact evidence must merge');
assert.deepEqual(compactPayload.artifactCatalog,[compactArtifact]);
assert.deepEqual(compactPayload.artifactCatalogCoverage,{model:'artifact-2-socket-buckets',artifactCount:1,complete:true,source:'hourly-compact-manifest',version:'v1'});
assert.equal(compactPayload.forgeArmourIndexCoverage.artifactCatalog,1);

const payload={
  profile:{
    characterEquipment:{data:{c1:{items:[{itemHash:100,itemInstanceId:'weapon-1'}]}}},
    itemComponents:{sockets:{data:{'weapon-1':{sockets:[{plugHash:201}]}}},reusablePlugs:{data:{'weapon-1':{plugs:{'0':[{plugItemHash:202}]}}}}},
    profilePlugSets:{data:{plugs:{'444':[{plugItemHash:202,canInsert:true,enabled:true}]}}},
    characterProgressions:{data:{c1:{seasonalArtifact:{tiers:[{items:[{itemHash:300,isActive:true,isVisible:true}]}]}}}},
    profileProgression:{data:{seasonalArtifact:{artifactHash:700}}},
    characters:{data:{c1:{stats:{600:25}}}}
  }
};
await first.hydratePayload(payload);
assert.equal(payload.definitions['201'].displayProperties.name,'Rolled Perk');
assert.equal(payload.definitions['202'].displayProperties.name,'Alternative Perk');
assert.equal(payload.definitions['300'].displayProperties.name,'Active Artifact Perk');
assert.equal(payload.definitions['100'].resolvedSandboxPerks[0].displayProperties.name,'Sandbox Effect');
assert.equal(payload.socketCategoryDefinitions['500'].displayProperties.name,'Weapon Perks');
assert.equal(payload.artifactDefinition.displayProperties.name,'Current Artifact');
assert.equal(payload.definitionCoverage.complete,true);
assert.equal(first.get('DestinyInventoryItemDefinition',999999),null,'missing definitions must remain unresolved');

const second=new GuardianManifestService({fetchImpl,storage,authOrigin:'https://auth.test'});
await second.ready();
assert.equal(second.status().versionMatched,true);
assert.equal(componentCalls.length,COMPONENT_TYPES.length,'matching version must skip every component download');

version='v2';
const third=new GuardianManifestService({fetchImpl,storage,authOrigin:'https://auth.test'});
await third.ready();
assert.equal(third.status().version,'v2');
assert.equal(componentCalls.length,COMPONENT_TYPES.length*2,'new version must download each component table once');

const fallback=new GuardianManifestService({fetchImpl,storage:{available:false},authOrigin:'https://auth.test'});
await fallback.ready();
assert.equal(fallback.status().mode,'live-fallback');
assert.equal(await fallback.getAsync('DestinyInventoryItemDefinition',1234),null);
assert.equal(fallback.get('DestinyInventoryItemDefinition',1234),null);

console.log(`MANIFEST_FIRST_DOWNLOAD=${componentCalls.slice(0,COMPONENT_TYPES.length).join(',')}`);
console.log('MANIFEST_VERSION_MATCH_SKIP=PASS componentDownloads=0');
console.log(`MANIFEST_VERSION_CHANGE_DOWNLOAD=${componentCalls.slice(COMPONENT_TYPES.length).join(',')}`);
console.log('MANIFEST_LOCAL_ROLL_RESOLUTION=PASS weapon=Freshly Rolled Weapon perk=Rolled Perk alternative=Alternative Perk');
console.log('MANIFEST_ARTIFACT_RESOLUTION=PASS artifact=Current Artifact activePerk=Active Artifact Perk');
console.log('MANIFEST_COMPACT_ARTIFACT_CATALOGUE=PASS artifacts=1');
console.log('MANIFEST_UNPREPARED_DEFINITION_REJECTION=PASS networkRequests=0');

let lazyDownloads=0,attempts=0;
const lazyFetch=async input=>{
  const url=new URL(String(input));
  if(url.pathname==='/bungie/manifest')return Response.json({version:'lazy-v1',paths:{DestinyCollectibleDefinition:'/collectibles.json'}});
  if(url.pathname.endsWith('/component')){
    lazyDownloads++;assert.equal(url.searchParams.get('version'),'lazy-v1');
    return Response.json({'10':{hash:10,displayProperties:{name:'Collection item'}}});
  }
  attempts++;assert.equal(url.searchParams.get('version'),'lazy-v1');
  if(attempts===1)throw new Error('Transient upstream failure');
  return Response.json({definition:{hash:20}});
};
const lazyStorage=new MemoryStorage();
const lazy=new GuardianManifestService({fetchImpl:lazyFetch,storage:lazyStorage,authOrigin:'https://auth.test'});
const results=await Promise.all(Array.from({length:12},()=>lazy.getAsync('DestinyCollectibleDefinition',10)));
assert.ok(results.every(row=>row.hash===10));
assert.equal(lazyDownloads,1,'Journey must coalesce simultaneous component loads');
assert.equal(await lazy.getAsync('DestinyCollectibleDefinition',11),null,'Absent known-table definitions remain unresolved without per-hash requests');
assert.equal(attempts,0);
const lazyReload=new GuardianManifestService({fetchImpl:lazyFetch,storage:lazyStorage,authOrigin:'https://auth.test'});
assert.equal((await lazyReload.getAsync('DestinyCollectibleDefinition',10)).hash,10);
assert.equal(lazyDownloads,1,'Journey must reuse the persisted matching component');
assert.equal(await lazy.getAsync('DestinyInventoryItemDefinition',20),null);
const retried=await Promise.all(Array.from({length:8},()=>lazy.getAsync('DestinyInventoryItemDefinition',20)));
assert.ok(retried.every(row=>row===null));assert.equal(attempts,0,'Missing prepared definitions must never trigger a per item request');
console.log('JOURNEY_LAZY_COMPONENT_CACHE_AND_ZERO_PER_ITEM_REQUESTS=PASS');
const scoped={characterEquipment:{data:{a:{items:[{itemInstanceId:'owned-a'}]},b:{items:[{itemInstanceId:'owned-b'}]}}},characterPlugSets:{data:{a:{plugs:{1:[{plugItemHash:101}]}},b:{plugs:{1:[{plugItemHash:102}]}}}}};
assert.equal(characterPlugSetsForItem(scoped,{itemInstanceId:'owned-a'})[0][1][0].plugItemHash,101);
assert.equal(characterPlugSetsForItem(scoped,{itemInstanceId:'owned-b'})[0][1][0].plugItemHash,102);
assert.deepEqual(characterPlugSetsForItem(scoped,{itemInstanceId:'vault'}),[]);
console.log('CHARACTER_PLUG_AVAILABILITY_ISOLATION=PASS');
