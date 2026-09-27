/** Public data only. Account inventory and credentials never enter this database. */
export function createImportStorage(indexedDB=globalThis.indexedDB){
  let pending;
  const open=()=>pending??=(new Promise((resolve,reject)=>{
    if(!indexedDB){resolve(null);return;}
    const request=indexedDB.open('astrix-dim-import',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('public',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  })).catch(()=>null);
  return {
    async get(key){const db=await open();if(!db)return null;return new Promise(resolve=>{const request=db.transaction('public').objectStore('public').get(key);request.onsuccess=()=>resolve(request.result?.value??null);request.onerror=()=>resolve(null);});},
    async put(key,value){const db=await open();if(!db)return false;return new Promise(resolve=>{const tx=db.transaction('public','readwrite');tx.objectStore('public').put({key,value});tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);});}
  };
}
export const IMPORT_TABLES=Object.freeze(['DestinyInventoryItemDefinition','DestinySeasonDefinition','DestinySandboxPerkDefinition','DestinyStatDefinition','DestinySocketCategoryDefinition','DestinySocketTypeDefinition','DestinyPlugSetDefinition','DestinyEquipableItemSetDefinition','DestinyInventoryBucketDefinition','DestinyLoadoutNameDefinition','DestinyLoadoutIconDefinition','DestinyLoadoutColorDefinition']);
export class ImportManifest {
  constructor({storage=createImportStorage(),fetchImpl=globalThis.fetch,origin=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com'}={}){Object.assign(this,{storage,fetchImpl,origin});this.snapshot=null;this.pending=null;this.restorePending=null;}
  async json(path){const response=await this.fetchImpl(`${this.origin}/bungie/manifest/import/${path}`,{credentials:'omit',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('The full manifest is unavailable. Retry when it finishes updating.');return response.json();}
  async ready(){
    if(this.snapshot)return this.snapshot;
    if(!this.restorePending)this.restorePending=(async()=>{
      const current=await this.storage.get('manifest:current');
      if(current?.version){const rows=await Promise.all(IMPORT_TABLES.map(type=>this.storage.get(`manifest:${current.version}:${type}`)));if(rows.every(Boolean))this.snapshot={version:current.version,tables:Object.fromEntries(IMPORT_TABLES.map((type,i)=>[type,rows[i]]))};}
      if(this.snapshot){void this.refresh().catch(()=>{});return this.snapshot;}
      return this.refresh();
    })().finally(()=>{this.restorePending=null;});
    return this.restorePending;
  }
  refresh(){
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      const index=await this.json('status');const version=index.manifestVersion;
      if(!version)throw new Error('The manifest version is unavailable.');
      if(version===this.snapshot?.version)return this.snapshot;
      const tables={};
      // Bounded downloads; an incomplete generation never replaces the usable snapshot.
      for(const type of IMPORT_TABLES){
        const cached=await this.storage.get(`manifest:${version}:${type}`);
        if(cached){tables[type]=cached;continue;}
        const current=index.tables?.[type],archive=index.retiredTables?.[type];
        if(!current)throw new Error(`Full manifest table unavailable: ${type}`);
        const rows={},jobs=[];
        for(const [descriptor,retired] of [[archive,true],[current,false]]){
          if(!descriptor)continue;
          if(!Number.isInteger(descriptor.shards)||descriptor.shards<1||descriptor.shards>4096)throw new Error('Invalid manifest shard index.');
          for(let shard=0;shard<descriptor.shards;shard++)jobs.push({shard,retired});
        }
        // Keep archives and current definitions separate so current always wins.
        const old={},live={};let cursor=0;
        await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length){const {shard,retired}=jobs[cursor++];const query=new URLSearchParams({type,version,shard:String(shard),archive:retired?'1':'0'});const result=await this.json(`shard?${query}`);if(result.manifestVersion!==version||result.type!==type||result.shard!==shard||result.archive!==retired||!result.definitions)throw new Error('Manifest generation changed. Retry.');Object.assign(retired?old:live,result.definitions);}}));
        if(Object.keys(live).length!==current.definitions||(archive&&Object.keys(old).length!==archive.definitions))throw new Error('The full manifest is incomplete.');
        Object.assign(rows,old,live);tables[type]=rows;await this.storage.put(`manifest:${version}:${type}`,rows);
      }
      this.snapshot={version,tables};await this.storage.put('manifest:current',{version});return this.snapshot;
    })().finally(()=>{this.pending=null;});return this.pending;
  }
}
