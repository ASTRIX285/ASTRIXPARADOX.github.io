import {openGuardianDatabase,MANIFEST_STORE_NAME} from "./guardian-session-cache.mjs?v=20260906-all-page-data-1";
import {resolveArtifactTwoCatalog} from "./guardian-artifact-catalog.mjs?v=20260904-artifact-sandbox-effects-1";
import {expandForgeArmourIndex} from '../../core/forge-index-transport.mjs';
import {paradoxDefinitionId} from '../../core/bungie-item-identity.mjs';

const AUTH_ORIGIN=globalThis.FORGE_AUTH_ORIGIN||"https://auth.astrixparadox.com";
const BUNGIE_ORIGIN="https://www.bungie.net";
const CURRENT_KEY="manifest:current";
const COMPONENT_TYPES=Object.freeze([
  "DestinyInventoryItemDefinition",
  "DestinySandboxPerkDefinition",
  "DestinyArtifactDefinition",
  "DestinyPlugSetDefinition",
  "DestinyStatDefinition",
  "DestinySocketCategoryDefinition",
  "DestinyEquipableItemSetDefinition"
]);
const COMPONENT_SET=new Set(COMPONENT_TYPES);
// Journey components are fetched on demand and cached by the same manifest
// version. Opening Journey never triggers the entire equipment download.
const LAZY_COMPONENT_TYPES=new Set([
  'DestinyPresentationNodeDefinition','DestinyRecordDefinition','DestinyObjectiveDefinition',
  'DestinyCollectibleDefinition','DestinyMetricDefinition','DestinyGuardianRankDefinition',
  'DestinyGuardianRankConstantsDefinition','DestinyDestinationDefinition','DestinyActivityDefinition',
  'DestinyChecklistDefinition','DestinyLocationDefinition','DestinySocketTypeDefinition',
  'DestinyDamageTypeDefinition','DestinyBreakerTypeDefinition','DestinyPowerCapDefinition','DestinyStatGroupDefinition'
]);

const tableKey=(version,type)=>`manifest:${version}:${type}`;
const numericHash=value=>{
  const hash=Number(value);
  return value!==null&&value!==undefined&&value!==''&&Number.isInteger(hash)&&hash>0&&hash<=0xffffffff?hash:null;
};
const definitionHash=(row,key)=>numericHash(row?.hash??row?.bungieHash??key);

function emitProgress(detail){
  if(typeof document==="undefined"||typeof CustomEvent==="undefined")return;
  document.dispatchEvent(new CustomEvent("forge:manifest-progress",{detail}));
}

function requestValue(request){
  return new Promise(resolve=>{
    request.onsuccess=()=>resolve(request.result??null);
    request.onerror=()=>resolve(null);
  });
}

function transactionDone(transaction,db){
  return new Promise(resolve=>{
    transaction.oncomplete=()=>{db.close();resolve(true);};
    transaction.onerror=()=>{db.close();resolve(false);};
    transaction.onabort=()=>{db.close();resolve(false);};
  });
}

function createIndexedDbStorage(){
  const available=typeof indexedDB!=="undefined";
  const read=async key=>{
    const db=await openGuardianDatabase();
    if(!db||!db.objectStoreNames.contains(MANIFEST_STORE_NAME)){db?.close();return null;}
    const transaction=db.transaction(MANIFEST_STORE_NAME,"readonly");
    const done=transactionDone(transaction,db);
    const value=await requestValue(transaction.objectStore(MANIFEST_STORE_NAME).get(key));
    await done;
    return value;
  };
  const write=async record=>{
    const db=await openGuardianDatabase();
    if(!db||!db.objectStoreNames.contains(MANIFEST_STORE_NAME)){db?.close();return false;}
    const transaction=db.transaction(MANIFEST_STORE_NAME,"readwrite");
    transaction.objectStore(MANIFEST_STORE_NAME).put(record);
    return transactionDone(transaction,db);
  };
  const removeOtherVersions=async version=>{
    const db=await openGuardianDatabase();
    if(!db||!db.objectStoreNames.contains(MANIFEST_STORE_NAME)){db?.close();return false;}
    const transaction=db.transaction(MANIFEST_STORE_NAME,"readonly");
    const done=transactionDone(transaction,db);
    const keys=await requestValue(transaction.objectStore(MANIFEST_STORE_NAME).getAllKeys());
    await done;
    const stale=(Array.isArray(keys)?keys:[]).map(String).filter(key=>key.startsWith("manifest:")&&key!==CURRENT_KEY&&!key.startsWith(`manifest:${version}:`));
    if(!stale.length)return true;
    const writeDb=await openGuardianDatabase();
    if(!writeDb||!writeDb.objectStoreNames.contains(MANIFEST_STORE_NAME)){writeDb?.close();return false;}
    const writeTransaction=writeDb.transaction(MANIFEST_STORE_NAME,"readwrite");
    const store=writeTransaction.objectStore(MANIFEST_STORE_NAME);
    stale.forEach(key=>store.delete(key));
    return transactionDone(writeTransaction,writeDb);
  };
  return {
    available,
    readCurrent:()=>read(CURRENT_KEY),
    readTable:(version,type)=>read(tableKey(version,type)),
    writeTable:(version,type,definitions)=>write({key:tableKey(version,type),version,type,definitions,savedAt:Date.now()}),
    commitVersion:version=>write({key:CURRENT_KEY,version,types:[...COMPONENT_TYPES],savedAt:Date.now()}),
    removeOtherVersions
  };
}

async function responseJsonWithProgress(response,onProgress){
  if(!response.body?.getReader)return response.json();
  const length=Number(response.headers.get("Content-Length"))||0;
  const reader=response.body.getReader();
  let loaded=0;
  const stream=new ReadableStream({
    async pull(controller){
      const {done,value}=await reader.read();
      if(done){controller.close();return;}
      loaded+=value.byteLength;
      onProgress(length?loaded/length:null,loaded,length);
      controller.enqueue(value);
    },
    cancel(reason){return reader.cancel(reason);}
  });
  return new Response(stream,{headers:{"Content-Type":response.headers.get("Content-Type")||"application/json"}}).json();
}

function collectPayloadHashes(payload={},options={}){
  const inventory=new Set();
  const stats=new Set();
  const profile=payload.profile||{};
  const armourOnly=options.armourOnly===true;
  const equippedOnly=options.equippedOnly===true;
  const includeReusable=options.includeReusable!==false;
  const armourInstances=new Set();
  const includedInstances=new Set();
  const addItem=item=>{
    const itemHash=numericHash(item?.itemHash);
    if(armourOnly&&Number(payload?.definitions?.[String(itemHash)]?.itemType)!==2)return;
    const styleHash=numericHash(item?.overrideStyleItemHash);
    if(itemHash!==null)inventory.add(itemHash);
    if(styleHash!==null)inventory.add(styleHash);
    for(const hash of item?.plugItemHashes||[]){const value=numericHash(hash);if(value!==null)inventory.add(value);}
    if(item?.itemInstanceId){armourInstances.add(String(item.itemInstanceId));includedInstances.add(String(item.itemInstanceId));}
  };
  if(!equippedOnly){
    for(const item of profile?.profileInventory?.data?.items||[])addItem(item);
    for(const row of Object.values(profile?.characterInventories?.data||{}))for(const item of row?.items||[])addItem(item);
  }
  for(const row of Object.values(profile?.characterEquipment?.data||{}))for(const item of row?.items||[])addItem(item);
  for(const item of payload.selectedItems||[])addItem(item);
  for(const [instanceId,row] of Object.entries(profile?.itemComponents?.sockets?.data||{}))if((!equippedOnly||includedInstances.has(String(instanceId)))&&(!armourOnly||armourInstances.has(String(instanceId))))for(const socket of row?.sockets||[]){const hash=numericHash(socket?.plugHash);if(hash!==null)inventory.add(hash);}
  if(includeReusable)for(const [instanceId,row] of Object.entries(profile?.itemComponents?.reusablePlugs?.data||{}))if((!equippedOnly||includedInstances.has(String(instanceId)))&&(!armourOnly||armourInstances.has(String(instanceId))))for(const plugs of Object.values(row?.plugs||{}))for(const plug of plugs||[]){const hash=numericHash(plug?.plugItemHash??plug?.plugHash);if(hash!==null)inventory.add(hash);}
  if(includeReusable&&!armourOnly&&!equippedOnly)for(const plugs of [profile?.profilePlugSets?.data?.plugs,...Object.values(profile?.characterPlugSets?.data||{}).map(row=>row?.plugs)])for(const rows of Object.values(plugs||{}))for(const plug of rows||[]){const hash=numericHash(plug?.plugItemHash??plug?.plugHash);if(hash!==null)inventory.add(hash);}
  if(!armourOnly)for(const progression of Object.values(profile?.characterProgressions?.data||{}))for(const tier of progression?.seasonalArtifact?.tiers||[])for(const item of tier?.items||[]){const hash=numericHash(item?.itemHash);if(hash!==null)inventory.add(hash);}
  for(const character of Object.values(profile?.characters?.data||{}))for(const hash of Object.keys(character?.stats||{})){const value=numericHash(hash);if(value!==null)stats.add(value);}
  for(const [instanceId,row] of Object.entries(profile?.itemComponents?.stats?.data||{}))if(!armourOnly||armourInstances.has(String(instanceId)))for(const hash of Object.keys(row?.stats||{})){const value=numericHash(hash);if(value!==null)stats.add(value);}
  return {inventory,stats};
}

class GuardianManifestService{
  constructor({fetchImpl=globalThis.fetch?.bind(globalThis),storage=createIndexedDbStorage(),authOrigin=AUTH_ORIGIN,selective=false,maxFallbackDefinitions=Infinity,backend=false,maxDefinitionBytes=12*1024*1024}={}){
    this.backend=backend;
    this.selective=selective||backend;
    this.maxDefinitionBytes=maxDefinitionBytes;
    this.definitionBytes=0;
    this.definitionSizes=new Map();
    this.batchRequests=new Map();
    this.maxFallbackDefinitions=maxFallbackDefinitions;
    this.fetchImpl=fetchImpl;
    this.storage=storage;
    this.authOrigin=authOrigin;
    this.tables=new Map();
    this.cachedTypes=new Set();
    this.fallbackDefinitions=new Map();
    this.definitionRequests=new Map();
    this.componentRequests=new Map();
    this.versionPromise=null;
    this.manifestPaths={};
    this.cachePromise=null;
    this.forgeIndexPromises=new Map();
    this.readyPromise=null;
    this.version="";
    this.mode="idle";
    this.versionMatched=false;
  }

  status(){return {mode:this.mode,version:this.version,versionMatched:this.versionMatched,types:[...this.tables.keys()],retainedDefinitionBytes:this.definitionBytes};}

  seedPayload(payload={}){
    const fields={
      DestinyInventoryItemDefinition:payload.definitions,
      DestinySandboxPerkDefinition:payload.sandboxPerks,
      DestinyArtifactDefinition:payload.artifactDefinition?.hash?{[payload.artifactDefinition.hash]:payload.artifactDefinition}:null,
      DestinyEquipableItemSetDefinition:payload.equipableItemSets,
      DestinyStatDefinition:payload.statDefinitions,
      DestinySocketCategoryDefinition:payload.socketCategoryDefinitions,
      DestinySocketTypeDefinition:payload.socketTypeDefinitions,
      DestinyDamageTypeDefinition:payload.damageDefinitions,
      DestinyBreakerTypeDefinition:payload.breakerDefinitions,
      DestinyCollectibleDefinition:payload.collectibleDefinitions
    };
    for(const [type,rows] of Object.entries({...fields,...(payload.manifestTables||{})})){
      if(!rows||typeof rows!=="object"||Array.isArray(rows))continue;
      const existing=this.tables.get(type);
      if(existing)Object.assign(existing,rows);
      else this.tables.set(type,rows);
      this.cachedTypes.add(type);
    }
    const version=String(payload?.pageReady?.manifestVersion||payload?.manifestVersion||payload?.manifestResolution?.version||"");
    if(version){this.version=version;this.versionMatched=true;}
    this.mode="backend";
    return this;
  }

  retainDefinition(key,definition){
    const bytes=new TextEncoder().encode(JSON.stringify(definition)).byteLength;
    if(bytes>this.maxDefinitionBytes)return;
    if(this.fallbackDefinitions.has(key)){this.definitionBytes-=this.definitionSizes.get(key)||0;this.fallbackDefinitions.delete(key);}
    while(this.fallbackDefinitions.size&&(this.fallbackDefinitions.size>=this.maxFallbackDefinitions||this.definitionBytes+bytes>this.maxDefinitionBytes)){
      const oldest=this.fallbackDefinitions.keys().next().value;
      this.definitionBytes-=this.definitionSizes.get(oldest)||0;this.definitionSizes.delete(oldest);this.fallbackDefinitions.delete(oldest);
    }
    this.fallbackDefinitions.set(key,definition);this.definitionSizes.set(key,bytes);this.definitionBytes+=bytes;
  }

  async fetchJson(url){
    if(!this.fetchImpl)throw new Error("Manifest network access is unavailable.");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
    try{
      const response=await this.fetchImpl(url,{credentials:"include",headers:{Accept:"application/json"},signal:controller.signal});
      if(!response.ok)throw new Error(`Manifest request failed (${response.status}).`);
      return await response.json();
    }finally{clearTimeout(timer);}
  }

  async initialise(){
    if(!this.storage?.available){
      this.mode="live-fallback";
      emitProgress({status:"fallback",percent:24,label:"IndexedDB unavailable · resolving definitions live"});
      return this;
    }
    try{
      emitProgress({status:"checking",percent:12,label:'Checking Bungie manifest'});
      const version=await this.checkVersion();
      const paths=this.manifestPaths;
      const downloadableTypes=COMPONENT_TYPES.filter(type=>paths[type]);
      if(downloadableTypes.length===0)throw new Error("Bungie manifest exposes no known component paths.");
      this.version=version;
      const current=await this.storage.readCurrent();
      if(current?.version===version){
        const records=await Promise.all(downloadableTypes.map(type=>this.storage.readTable(version,type)));
        if(records.every(record=>record?.definitions&&typeof record.definitions==="object")){
          downloadableTypes.forEach((type,index)=>{this.tables.set(type,records[index].definitions);this.cachedTypes.add(type);});
          this.mode="indexeddb";
          this.versionMatched=true;
          emitProgress({status:"ready",percent:58,label:'Bungie manifest loaded from local cache',version,versionMatched:true});
          return this;
        }
      }
      this.versionMatched=false;
      for(let index=0;index<downloadableTypes.length;index++){
        const type=downloadableTypes[index];
        const start=18+(index/downloadableTypes.length)*36;
        emitProgress({status:"downloading",percent:Math.round(start),label:`Downloading ${type}`,type,version});
        try{
          const url=new URL(`${this.authOrigin}/bungie/manifest/component`);
          url.searchParams.set("type",type);
          url.searchParams.set("version",version);
          const response=await this.fetchImpl(url,{credentials:"include",headers:{Accept:"application/json"}});
          if(!response.ok)throw new Error(`${type} download failed (${response.status}).`);
          const definitions=await responseJsonWithProgress(response,ratio=>{
            const percent=ratio===null?start:start+ratio*(36/downloadableTypes.length);
            emitProgress({status:"downloading",percent:Math.round(percent),label:`Downloading ${type}`,type,version});
          });
          if(!definitions||typeof definitions!=="object"||Array.isArray(definitions))throw new Error(`${type} did not return a definition table.`);
          if(!await this.storage.writeTable(version,type,definitions))throw new Error(`${type} could not be stored in IndexedDB.`);
          this.tables.set(type,definitions);
          this.cachedTypes.add(type);
          emitProgress({status:"indexing",percent:Math.round(start+36/downloadableTypes.length),label:`Indexed ${type}`,type,version});
        }catch(tableError){
          console.warn("manifest_table_skipped",{type,error:String(tableError?.message||tableError)});
          emitProgress({status:"downloading",percent:Math.round(start+36/downloadableTypes.length),label:`Skipped ${type} · resolving live`,type,version});
        }
      }
      if(this.cachedTypes.size===0)throw new Error("No manifest component tables could be cached.");
      if(!await this.storage.commitVersion(version))throw new Error('Manifest cache could not be stored.');
      await this.storage.removeOtherVersions(version);
      this.mode="indexeddb";
      emitProgress({status:"ready",percent:58,label:'Bungie manifest indexed',version,versionMatched:false});
      return this;
    }catch(error){
      this.mode="live-fallback";
      emitProgress({status:"fallback",percent:24,label:"Manifest cache unavailable · resolving definitions live",message:error?.message||String(error)});
      return this;
    }
  }

  checkVersion(){
    if(!this.versionPromise)this.versionPromise=(async()=>{
      const metadata=await this.fetchJson(`${this.authOrigin}/bungie/manifest?components=weapon-stats-1`);
      const paths=metadata?.jsonWorldComponentContentPaths?.en||metadata?.paths||{};
      const version=String(metadata?.version||"").trim();
      if(!version)throw new Error('Bungie manifest metadata is missing.');
      this.version=version;this.manifestPaths=paths;
      return version;
    })().catch(error=>{this.versionPromise=null;throw error;});
    return this.versionPromise;
  }

  async initialiseCached(){
    if(!this.storage?.available){this.mode="live-fallback";return this;}
    try{
      emitProgress({status:"checking",percent:12,label:"Checking cached Bungie manifest"});
      const version=await this.checkVersion();
      const paths=this.manifestPaths;
      const downloadableTypes=COMPONENT_TYPES.filter(type=>paths[type]);
      this.version=version;
      const current=await this.storage.readCurrent();
      if(current?.version===version&&downloadableTypes.length){
        const records=await Promise.all(downloadableTypes.map(type=>this.storage.readTable(version,type)));
        if(records.every(record=>record?.definitions&&typeof record.definitions==="object")){
          downloadableTypes.forEach((type,index)=>{this.tables.set(type,records[index].definitions);this.cachedTypes.add(type);});
          this.mode="indexeddb";this.versionMatched=true;
          emitProgress({status:"ready",percent:58,label:'Bungie manifest loaded from local cache',version,versionMatched:true});
          return this;
        }
      }
      this.mode="live-fallback";this.versionMatched=false;
      emitProgress({status:"selective",percent:24,label:"Backend manifest current · resolving owned armour only",version});
      return this;
    }catch(error){
      this.mode="live-fallback";this.versionMatched=false;
      emitProgress({status:"fallback",percent:24,label:"Manifest cache unavailable · resolving definitions live",message:error?.message||String(error)});
      return this;
    }
  }

  cached(){
    if(this.backend)return this.ready();
    if(!this.cachePromise)this.cachePromise=this.initialiseCached();
    return this.cachePromise;
  }

  loadForgeArmourIndex(url){
    const key=String(url||"");
    if(!key)return Promise.reject(new Error("Forge armour index URL is missing."));
    if(!this.forgeIndexPromises.has(key))this.forgeIndexPromises.set(key,(async()=>{
      await this.checkVersion();
      const requestUrl=new URL(key,globalThis.location?.href||this.authOrigin);
      requestUrl.searchParams.set("manifest",this.version);
      const payload=await this.fetchJson(requestUrl);
      const version=String(payload?.manifestVersion||"").trim();
      if(!version||version!==this.version)throw new Error(`Forge armour index is stale (${version||"unknown"}; expected ${this.version||"current"}).`);
      if(![4,5].includes(Number(payload?.schemaVersion)))throw new Error("Forge armour and Artifact index schema is unsupported.");
      if(!payload?.definitions||typeof payload.definitions!=="object"||Array.isArray(payload.definitions))throw new Error("Forge armour index contains no definition map.");
      if(!Array.isArray(payload?.artifactCatalog)||payload.artifactCatalog.length===0)throw new Error("Forge index contains no verified Artifact 2.0 catalogue.");
      return payload;
    })());
    return this.forgeIndexPromises.get(key);
  }

  applyForgeArmourIndex(payload={},index={}){
    index=expandForgeArmourIndex(index);
    const version=String(index?.manifestVersion||"").trim();
    if(!version||version!==this.version)return false;
    const socketLayouts=index.socketLayouts||{};
    const armourDefinitions=Object.fromEntries(Object.entries(index.definitions||{}).map(([hash,definition])=>{
      const sockets=socketLayouts[definition?.socketLayoutKey];
      return [hash,sockets?{...definition,sockets}:definition];
    }));
    payload.definitions={...armourDefinitions,...(index.plugDefinitions||{}),...(payload.definitions||{})};
    payload.equipableItemSets={...(index.equipableItemSets||{}),...(payload.equipableItemSets||{})};
    payload.sandboxPerks={...(index.sandboxPerks||{}),...(payload.sandboxPerks||{})};
    payload.statDefinitions={...(index.statDefinitions||{}),...(payload.statDefinitions||{})};
    payload.socketCategoryDefinitions={...(index.socketCategoryDefinitions||{}),...(payload.socketCategoryDefinitions||{})};
    if(Array.isArray(index.artifactCatalog)&&index.artifactCatalog.length){
      payload.artifactCatalog=index.artifactCatalog;
      payload.artifactCatalogCoverage={model:"artifact-2-socket-buckets",artifactCount:index.artifactCatalog.length,complete:true,source:"hourly-compact-manifest",version};
    }
    payload.forgeArmourIndexCoverage={
      version,
      definitions:Object.keys(index.definitions||{}).length,
      socketLayouts:Object.keys(socketLayouts).length,
      equipableItemSets:Object.keys(index.equipableItemSets||{}).length,
      sandboxPerks:Object.keys(index.sandboxPerks||{}).length,
      plugDefinitions:Object.keys(index.plugDefinitions||{}).length,
      socketCategories:Object.keys(index.socketCategoryDefinitions||{}).length,
      artifactCatalog:Array.isArray(index.artifactCatalog)?index.artifactCatalog.length:0,
      complete:Object.keys(index.definitions||{}).length>0,
      source:"hourly-compact-manifest"
    };
    payload.manifestResolution={mode:"forge-index",version,versionMatched:true,source:"hourly compact Forge armour manifest"};
    return true;
  }

  ready(){
    if(this.backend){
      if(!this.readyPromise)this.readyPromise=Promise.resolve().then(()=>{this.mode="backend";emitProgress({status:"ready",percent:58,label:"Prepared page data ready",version:this.version});return this;});
      return this.readyPromise;
    }
    if(!this.readyPromise)this.readyPromise=this.cached().then(()=>this.mode==="indexeddb"?this:this.initialise());
    return this.readyPromise;
  }

  get(type,hash){
    const numeric=numericHash(hash);
    if(numeric===null)return null;
    return this.tables.get(type)?.[String(numeric)]||this.fallbackDefinitions.get(`${type}:${numeric}`)||null;
  }

  identity(hash,type="DestinyInventoryItemDefinition"){
    const numeric=numericHash(hash);
    const definition=this.get(type,numeric);
    const display=definition?.displayProperties||{};
    const sandboxDisplays=(definition?.perks||[]).map(perk=>this.get("DestinySandboxPerkDefinition",perk?.perkHash)?.displayProperties).filter(Boolean);
    const first=(key)=>display[key]||sandboxDisplays.find(row=>row?.[key])?.[key]||"";
    const resolved=Boolean(definition);
    return {
      hash:numeric,
      bungieHash:numeric,
      paradoxId:paradoxDefinitionId(type,numeric),
      name:resolved?(first("name")||`Unnamed Destiny definition ${numeric}`):`Unresolved Destiny definition ${numeric}`,
      description:resolved?first("description"):"",
      icon:first("icon")?new URL(first("icon"),BUNGIE_ORIGIN).toString():"",
      definition,
      displayResolved:resolved,
      unresolved:!resolved,
      manifestVersion:this.version||null
    };
  }

  async getAsync(type,hash){
    const numeric=numericHash(hash);
    if(numeric===null)return null;
    if(this.backend)return this.get(type,numeric);
    if(!this.selective&&LAZY_COMPONENT_TYPES.has(type))await this.ensureComponent(type);
    const local=this.get(type,numeric);
    if(local||this.cachedTypes.has(type))return local;
    return null;
  }

  async ensureComponent(type){
    if(this.cachedTypes.has(type))return true;
    if(this.componentRequests.has(type))return this.componentRequests.get(type);
    const pending=(async()=>{
      try{
        const version=await this.checkVersion();
        if(!this.manifestPaths[type])return false;
        const cached=this.storage?.available?await this.storage.readTable(version,type):null;
        let definitions=cached?.definitions;
        if(!definitions){
          const url=new URL(`${this.authOrigin}/bungie/manifest/component`);
          url.searchParams.set('type',type);url.searchParams.set('version',version);
          definitions=await this.fetchJson(url);
          if(!definitions||typeof definitions!=='object'||Array.isArray(definitions))return false;
          if(this.storage?.available)await this.storage.writeTable(version,type,definitions).catch(()=>false);
        }
        this.tables.set(type,definitions);this.cachedTypes.add(type);
        return true;
      }catch{return false;}
    })();
    this.componentRequests.set(type,pending);
    try{return await pending;}finally{this.componentRequests.delete(type);}
  }

  async getMany(type,hashes){
    const unique=[...new Set([...hashes].map(numericHash).filter(hash=>hash!==null))];
    const rows={};
    if(this.backend){
      for(const hash of unique){const hit=this.get(type,hash);if(hit)rows[hash]=hit;}
      return rows;
    }
    for(let offset=0;offset<unique.length;offset+=6){
      const batch=unique.slice(offset,offset+6);
      const definitions=await Promise.all(batch.map(hash=>this.getAsync(type,hash)));
      definitions.forEach((definition,index)=>{if(definition)rows[String(batch[index])]=definition;});
    }
    return rows;
  }

  async hydratePayload(payload={},options={}){
    this.seedPayload(payload);
    if(options.waitForManifest!==false)await this.ready();
    const indexedDb=this.mode==="indexeddb";
    const allowNetwork=!this.backend&&options.allowNetwork!==false;
    const profile=payload?.profile||{};
    const {inventory,stats}=collectPayloadHashes(payload,options);
    let definitions=indexedDb?await this.getMany("DestinyInventoryItemDefinition",inventory):{...(payload.definitions||{})};
    if(!indexedDb){
      const missing=[...inventory].filter(hash=>!definitions[String(hash)]);
      if(allowNetwork&&missing.length)definitions={...definitions,...await this.getMany("DestinyInventoryItemDefinition",missing)};
    }
    const socketCategories=new Set();
    const sandboxPerkHashes=new Set();
    const equipableSetHashes=new Set();
    const damageTypeHashes=new Set();
    const breakerTypeHashes=new Set();
    const socketTypeHashes=new Set();
    const expandedHashes=new Set();
    const reusablePlugSetHashes=new Set();
    const inspectDefinition=definition=>{
      for(const entry of definition?.sockets?.socketEntries||[]){
        const socketType=numericHash(entry?.socketTypeHash);if(socketType!==null)socketTypeHashes.add(socketType);
        const initial=numericHash(entry?.singleInitialItemHash);if(initial!==null&&initial!==0)expandedHashes.add(initial);
        for(const plug of entry?.reusablePlugItems||[]){const hash=numericHash(plug?.plugItemHash);if(hash!==null)expandedHashes.add(hash);}
        const plugSet=numericHash(entry?.reusablePlugSetHash);if(plugSet!==null)reusablePlugSetHashes.add(plugSet);
      }
      for(const entry of definition?.sockets?.intrinsicSockets||[]){const hash=numericHash(entry?.plugItemHash);if(hash!==null)expandedHashes.add(hash);}
      for(const category of definition?.sockets?.socketCategories||[]){const hash=numericHash(category?.socketCategoryHash);if(hash!==null)socketCategories.add(hash);}
      for(const perk of definition?.perks||[]){const hash=numericHash(perk?.perkHash);if(hash!==null)sandboxPerkHashes.add(hash);}
      const setHash=numericHash(definition?.equipableItemSetHash??definition?.equippingBlock?.equipableItemSetHash);if(setHash!==null)equipableSetHashes.add(setHash);
      const damageHash=numericHash(definition?.defaultDamageTypeHash);if(damageHash!==null)damageTypeHashes.add(damageHash);
      const breakerHash=numericHash(definition?.breakerTypeHash);if(breakerHash!==null)breakerTypeHashes.add(breakerHash);
    };
    const definitionsToInspect=options.armourOnly===true?[...inventory].map(hash=>definitions[String(hash)]).filter(Boolean):Object.values(definitions);
    definitionsToInspect.forEach(inspectDefinition);
    if(options.includeReusable!==false&&reusablePlugSetHashes.size){
      const plugSets=[profile?.profilePlugSets?.data?.plugs,...Object.values(profile?.characterPlugSets?.data||{}).map(row=>row?.plugs)];
      for(const plugSetHash of reusablePlugSetHashes)for(const rows of plugSets)for(const plug of rows?.[String(plugSetHash)]||[]){
        if(plug?.canInsert===false||plug?.enabled===false)continue;
        const hash=numericHash(plug?.plugItemHash??plug?.plugHash);if(hash!==null)expandedHashes.add(hash);
      }
    }
    if(expandedHashes.size){
      const missingExpanded=[...expandedHashes].filter(hash=>!definitions[String(hash)]);
      const expanded=allowNetwork&&missingExpanded.length?await this.getMany("DestinyInventoryItemDefinition",missingExpanded):{};
      definitions={...definitions,...expanded};
      [...expandedHashes].map(hash=>definitions[String(hash)]).filter(Boolean).forEach(inspectDefinition);
    }
    for(const row of Object.values(profile?.itemComponents?.perks?.data||{}))for(const perk of row?.perks||[]){const hash=numericHash(perk?.perkHash);if(hash!==null)sandboxPerkHashes.add(hash);}
    for(const row of Object.values(payload?.profile?.itemComponents?.instances?.data||{})){
      const damageHash=numericHash(row?.damageTypeHash);if(damageHash!==null)damageTypeHashes.add(damageHash);
      const breakerHash=numericHash(row?.breakerTypeHash);if(breakerHash!==null)breakerTypeHashes.add(breakerHash);
    }
    let equipableItemSets=indexedDb?{}:{...(payload.equipableItemSets||{})};
    const missingSetHashes=[...equipableSetHashes].filter(hash=>!equipableItemSets[String(hash)]);
    if(allowNetwork&&missingSetHashes.length)equipableItemSets={...equipableItemSets,...await this.getMany("DestinyEquipableItemSetDefinition",missingSetHashes)};
    for(const set of Object.values(equipableItemSets))for(const perk of set?.setPerks||[]){const hash=numericHash(perk?.sandboxPerkHash);if(hash!==null)sandboxPerkHashes.add(hash);}
    const missingDefinitions=(existing,hashes)=>[...hashes].filter(hash=>!existing?.[String(hash)]);
    const existingSandbox=indexedDb?{}:{...(payload.sandboxPerks||{})};
    const existingStats=indexedDb?{}:{...(payload.statDefinitions||{})};
    const existingSockets=indexedDb?{}:{...(payload.socketCategoryDefinitions||{})};
    const existingDamage=indexedDb?{}:{...(payload.damageDefinitions||{})};
    const existingBreaker=indexedDb?{}:{...(payload.breakerDefinitions||{})};
    const localOrFetch=(type,hashes)=>allowNetwork?this.getMany(type,hashes):Promise.resolve(Object.fromEntries([...hashes].map(hash=>[String(hash),this.get(type,hash)]).filter(([,row])=>row)));
    const [fetchedSandbox,fetchedStats,fetchedSockets,fetchedDamage,fetchedBreaker]=await Promise.all([
      localOrFetch("DestinySandboxPerkDefinition",missingDefinitions(existingSandbox,sandboxPerkHashes)),
      localOrFetch("DestinyStatDefinition",missingDefinitions(existingStats,stats)),
      localOrFetch("DestinySocketCategoryDefinition",missingDefinitions(existingSockets,socketCategories)),
      localOrFetch("DestinyDamageTypeDefinition",missingDefinitions(existingDamage,damageTypeHashes)),
      localOrFetch("DestinyBreakerTypeDefinition",missingDefinitions(existingBreaker,breakerTypeHashes))
    ]);
    const sandboxPerks={...existingSandbox,...fetchedSandbox};
    const statDefinitions={...existingStats,...fetchedStats};
    const socketCategoryDefinitions={...existingSockets,...fetchedSockets};
    const damageDefinitions={...existingDamage,...fetchedDamage};
    const breakerDefinitions={...existingBreaker,...fetchedBreaker};
    const socketTypeDefinitions={...(payload.socketTypeDefinitions||{}),...await localOrFetch('DestinySocketTypeDefinition',missingDefinitions(payload.socketTypeDefinitions,socketTypeHashes))};
    const statGroupHashes=new Set(Object.values(definitions).filter(definition=>definition.itemType===3).map(definition=>numericHash(definition.stats?.statGroupHash)).filter(Boolean));
    const statGroups=await localOrFetch('DestinyStatGroupDefinition',statGroupHashes);
    definitions=Object.fromEntries(Object.entries(definitions).map(([hash,definition])=>{
      const resolvedSandboxPerks=(definition?.perks||[]).map(perk=>sandboxPerks[String(perk?.perkHash)]).filter(Boolean);
      const resolvedStatGroup=statGroups[definition.stats?.statGroupHash];
      return [hash,{...definition,...(resolvedSandboxPerks.length?{resolvedSandboxPerks}:{}),...(resolvedStatGroup?{resolvedStatGroup}:{})}];
    }));
    const resolveArtifact=options.armourOnly!==true;
    const artifactHash=resolveArtifact?numericHash(payload?.profile?.profileProgression?.data?.seasonalArtifact?.artifactHash):null;
    const artifactDefinition=resolveArtifact?(payload.artifactDefinition||(artifactHash===null?null:await this.getAsync("DestinyArtifactDefinition",artifactHash))):(payload.artifactDefinition||null);
    let artifactCatalog=resolveArtifact&&(payload.artifactCatalog||[]).length?payload.artifactCatalog:resolveArtifact?resolveArtifactTwoCatalog({
      inventoryDefinitions:this.tables.get("DestinyInventoryItemDefinition")||definitions,
      plugSetDefinitions:this.tables.get("DestinyPlugSetDefinition")||{},
      sandboxPerkDefinitions:this.tables.get("DestinySandboxPerkDefinition")||sandboxPerks,
      manifestVersion:this.version||null
    }):(payload.artifactCatalog||[]);
    if(resolveArtifact&&this.backend&&!artifactCatalog.length){
      // Keep the full Artifact picker available without retaining full manifest tables.
      if(!this.artifactCatalogPromise)this.artifactCatalogPromise=(async()=>{
        const index=await this.fetchJson(new URL('../../data/forge-armour-index.json',import.meta.url));
        if(index.manifestVersion!==this.version||!Array.isArray(index.artifactCatalog))throw new Error('Artifact catalogue does not match the current Bungie manifest.');
        return index.artifactCatalog;
      })().catch(error=>{this.artifactCatalogPromise=null;throw error;});
      artifactCatalog=await this.artifactCatalogPromise;
    }
    const requested=[...inventory,...expandedHashes];
    const unresolved=requested.filter(hash=>!definitions[String(hash)]);
    const artifactPerkHashes=[...new Set(Object.values(payload?.profile?.characterProgressions?.data||{}).flatMap(progression=>(progression?.seasonalArtifact?.tiers||[]).flatMap(tier=>(tier?.items||[]).map(item=>numericHash(item?.itemHash)).filter(hash=>hash!==null))))];
    payload.definitions=definitions;
    payload.sandboxPerks=sandboxPerks;
    payload.statDefinitions=statDefinitions;
    payload.socketCategoryDefinitions=socketCategoryDefinitions;
    payload.socketTypeDefinitions=socketTypeDefinitions;
    payload.damageDefinitions=damageDefinitions;
    payload.breakerDefinitions=breakerDefinitions;
    payload.semanticDefinitionCoverage={sandboxPerks:missingDefinitions(sandboxPerks,sandboxPerkHashes),socketCategories:missingDefinitions(socketCategoryDefinitions,socketCategories),socketTypes:missingDefinitions(socketTypeDefinitions,socketTypeHashes),damageTypes:missingDefinitions(damageDefinitions,damageTypeHashes),breakerTypes:missingDefinitions(breakerDefinitions,breakerTypeHashes)};
    payload.equipableItemSets=equipableItemSets;
    payload.artifactDefinition=artifactDefinition;
    payload.artifactCatalog=artifactCatalog;
    const resolutionSource=indexedDb?"indexeddb-manifest":"bungie-single-definition-endpoint";
    payload.definitionCoverage={requested:requested.length,resolved:requested.length-unresolved.length,unresolved,complete:unresolved.length===0,source:resolutionSource,version:this.version||null};
    const unresolvedArtifactPerks=artifactPerkHashes.filter(hash=>!definitions[String(hash)]);
    payload.artifactCoverage={hash:artifactHash,definitionResolved:Boolean(artifactDefinition),perkHashes:artifactPerkHashes,unresolvedPerkHashes:unresolvedArtifactPerks,complete:(artifactHash===null||Boolean(artifactDefinition))&&unresolvedArtifactPerks.length===0,source:resolutionSource,version:this.version||null};
    payload.artifactCatalogCoverage={model:'artifact-2-socket-buckets',artifactCount:artifactCatalog.length,complete:artifactCatalog.length>0,source:resolutionSource,version:this.version||null};
    payload.manifestResolution={mode:this.backend?"prepared-page-payload":indexedDb?"indexeddb":"live-fallback",version:this.version||null,versionMatched:indexedDb?this.versionMatched:false,source:this.backend?"prepared-bulk-manifest":indexedDb?"Destiny manifest component tables":"unavailable"};
    return payload;
  }
}

const sharedKey=Symbol.for('FORGE.guardianManifest.20260906-page-payload-1');
const guardianManifest=globalThis[sharedKey]||(globalThis[sharedKey]=new GuardianManifestService({backend:true,maxFallbackDefinitions:4096}));

export {COMPONENT_TYPES,GuardianManifestService,createIndexedDbStorage,collectPayloadHashes,guardianManifest};
