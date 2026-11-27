// Public, versioned manifest bundles only. Never store account/profile data here.
const memory=new Map();
export const bundleKind=page=>page==='journey'?'journey':page==='loadout'?'loadout':'common';
// The Journey public bundle is tens of MB. Reading it back from IndexedDB takes
// hundreds of ms on a fast PC and can pass 1 s on slower ones. An 800 ms cap
// silently dropped the cache, so every Journey visit re-downloaded the whole
// catalogue and hit the 30 s request limit. Blocked or failed opens still
// resolve immediately through onblocked/onerror.
export const BUNDLE_CACHE_IO_TIMEOUT_MS=8000;
const versionKey=kind=>`${kind}@version`;
function writeVersion(kind,manifestVersion){
  return new Promise(resolve=>{
    const request=indexedDB.open('astrix-prepared-public-bundles',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('bundles',{keyPath:'kind'});
    request.onerror=request.onblocked=()=>resolve(false);
    request.onsuccess=()=>{
      const db=request.result;
      try{
        const tx=db.transaction('bundles','readwrite');
        tx.objectStore('bundles').put({kind:versionKey(kind),manifestVersion});
        tx.oncomplete=()=>{db.close();resolve(true);};
        tx.onerror=tx.onabort=()=>{db.close();resolve(false);};
      }catch{db.close();resolve(false);}
    };
  }).catch(()=>false);
}
async function access(kind,bundle){
  if(typeof indexedDB==='undefined')return null;
  return new Promise(resolve=>{
    let db,settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();resolve(value);};
    const timer=setTimeout(()=>finish(null),BUNDLE_CACHE_IO_TIMEOUT_MS);
    const request=indexedDB.open('astrix-prepared-public-bundles',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('bundles',{keyPath:'kind'});
    request.onerror=request.onblocked=()=>finish(null);
    request.onsuccess=()=>{
      db=request.result;if(settled){db.close();return;}
      const tx=db.transaction('bundles',bundle?'readwrite':'readonly'),store=tx.objectStore('bundles');
      // A small version record beside the bundle, written in the same transaction, lets the page
      // head (shared/forge-early-page-data.js) name the stored manifest without reading the bundle.
      if(bundle)store.put({kind:versionKey(kind),manifestVersion:bundle.manifestVersion});
      const operation=bundle?store.put({kind,bundle}):store.get(kind);
      const version=bundle?null:store.get(versionKey(kind));
      tx.oncomplete=()=>{
        const stored=operation.result?.bundle;
        // Bundles saved before the version record existed get one on their next read.
        if(!bundle&&stored?.manifestVersion&&version?.result?.manifestVersion!==stored.manifestVersion)void writeVersion(kind,stored.manifestVersion);
        finish(bundle||stored||null);
      };
      tx.onerror=tx.onabort=()=>finish(null);
    };
  }).catch(()=>null);
}
export async function readPreparedBundle(page){
  const kind=bundleKind(page),bundle=memory.get(kind)||await access(kind);
  if(!bundle?.manifestVersion||bundle.bundleCached||bundle.profile||bundle.account)return null;
  memory.set(kind,bundle);return bundle;
}
// Cheap presence check (key only, no 100 MB structured clone) for readiness UI.
export async function hasPreparedBundle(page){
  if(typeof indexedDB==='undefined')return false;
  const kind=bundleKind(page);
  return new Promise(resolve=>{
    let db,settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();resolve(value);};
    const timer=setTimeout(()=>finish(false),2000);
    const request=indexedDB.open('astrix-prepared-public-bundles',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('bundles',{keyPath:'kind'});
    request.onerror=request.onblocked=()=>finish(false);
    request.onsuccess=()=>{
      db=request.result;if(settled){db.close();return;}
      const tx=db.transaction('bundles','readonly'),lookup=tx.objectStore('bundles').getKey(kind);
      tx.oncomplete=()=>finish(lookup.result===kind);
      tx.onerror=tx.onabort=()=>finish(false);
    };
  }).catch(()=>false);
}
export async function savePreparedBundle(page,bundle){
  if(!bundle?.manifestVersion||bundle.bundleCached||bundle.profile||bundle.account)return;
  const kind=bundleKind(page);memory.set(kind,bundle);
  await access(kind,bundle);
}
export function joinPreparedBundle(raw,cached){
  if(!raw?.prepared?.bundleCached)return raw;
  if(!cached||cached.manifestVersion!==raw.prepared.manifestVersion){
    const error=new Error('Prepared manifest cache is unavailable.');error.code='prepared_manifest_cache_miss';throw error;
  }
  return {...raw,prepared:cached};
}
