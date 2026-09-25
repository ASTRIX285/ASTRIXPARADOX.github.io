import {catalogue} from './reports-model.mjs?v=20260925-reports-1';
const DB_NAME='astrix-reports-v1';
const VERSION=1;
export function accountKey(session){const m=session?.activeDestinyMembership;return session?.authenticated&&m?.membershipId?`${m.membershipType}:${m.membershipId}`:'';}
export function createReportsStore(indexedDB=globalThis.indexedDB){
  let pending;
  const memory=new Map();
  function database(){
    if(!indexedDB)return Promise.resolve(null);
    if(!pending)pending=new Promise(resolve=>{
      const request=indexedDB.open(DB_NAME,VERSION);
      request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=request.onblocked=()=>resolve(null);
    });
    return pending;
  }
  return {
    async get(key){const db=await database();if(!db)return memory.get(key)||null;return new Promise(resolve=>{const tx=db.transaction('snapshots');const r=tx.objectStore('snapshots').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null);});},
    async set(key,value){memory.set(key,value);const db=await database();if(!db)return;await new Promise(resolve=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(value,key);tx.oncomplete=tx.onerror=tx.onabort=resolve;});}
  };
}
export function createReportsLoader({origin='https://auth.astrixparadox.com',fetchImpl=globalThis.fetch?.bind(globalThis),store=createReportsStore(),now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),warmImages=async()=>{}}={}){
  const flights=new Map();
  async function request(url){
    for(let attempt=0;attempt<5;attempt++){
      const response=await fetchImpl(url,{credentials:new URL(url).origin===origin?'include':'omit',signal:AbortSignal.timeout(30_000)});
      const payload=await response.json();
      const seconds=Number(payload?.ThrottleSeconds)||Number(response.headers?.get('Retry-After'))||0;
      if(response.status===429||seconds>0&&payload?.ErrorCode!==1||payload?.ErrorCode===36){await sleep(Math.max(1000,seconds*1000));continue;}
      if(!response.ok||payload?.ErrorCode!==undefined&&payload.ErrorCode!==1)throw new Error('Reports unavailable');
      return payload.Response??payload;
    }
    throw new Error('Reports unavailable');
  }
  const route=(kind,characterId)=>{const url=new URL('/bungie/reports',origin);url.searchParams.set('kind',kind);if(characterId)url.searchParams.set('characterId',characterId);return url.href;};
  async function manifest(){
    const meta=await request(new URL('/bungie/manifest',origin).href);
    const key=`manifest:${meta.version}`;
    const cached=await store.get(key);if(cached)return cached;
    const path=meta.jsonWorldComponentContentPaths?.en?.DestinyActivityDefinition;
    const url=new URL(path||'', 'https://www.bungie.net');
    if(!path?.startsWith('/common/destiny2_content/json/')||url.origin!=='https://www.bungie.net')throw new Error('Activity definitions unavailable');
    const result=catalogue(await request(url.href));await store.set(key,result);return result;
  }
  async function load(session,{force=false}={}){
    const identity=accountKey(session);if(!identity)return null;
    if(flights.has(identity))return flights.get(identity);
    const task=(async()=>{
      const key=`account:${identity}`;
      const cached=force?null:await store.get(key);
      if(cached&&now()-cached.fetchedAt<10*60_000){await warmImages(cached.catalogue);return cached;}
      const [profile,groups]=await Promise.all([request(route('profile')),manifest()]);
      const characters=Object.values(profile.characters?.data||{}).map(row=>({characterId:String(row.characterId),classType:row.classType}));
      if(!characters.length)throw new Error('Characters unavailable');
      const results=await Promise.all(characters.map(async character=>[character.characterId,await request(route('aggregate',character.characterId))]));
      const snapshot={identity,fetchedAt:now(),characters,catalogue:groups,aggregates:Object.fromEntries(results),milestones:profile.characterProgressions?.data||{},records:{profile:profile.profileRecords?.data||null,characters:profile.characterRecords?.data||{}}};
      await warmImages(groups);
      await store.set(key,snapshot);return snapshot;
    })();
    flights.set(identity,task);try{return await task;}finally{flights.delete(identity);}
  }
  return {load};
}
