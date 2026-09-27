// Public, versioned manifest bundles only. Never store account/profile data here.
const memory=new Map();
export const bundleKind=page=>page==='journey'?'journey':page==='loadout'?'loadout':'common';
async function access(kind,bundle){
  if(typeof indexedDB==='undefined')return null;
  return new Promise(resolve=>{
    let db,settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();resolve(value);};
    const timer=setTimeout(()=>finish(null),800);
    const request=indexedDB.open('astrix-prepared-public-bundles',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('bundles',{keyPath:'kind'});
    request.onerror=request.onblocked=()=>finish(null);
    request.onsuccess=()=>{
      db=request.result;if(settled){db.close();return;}
      const tx=db.transaction('bundles',bundle?'readwrite':'readonly'),store=tx.objectStore('bundles');
      const operation=bundle?store.put({kind,bundle}):store.get(kind);
      tx.oncomplete=()=>finish(bundle||operation.result?.bundle||null);
      tx.onerror=tx.onabort=()=>finish(null);
    };
  }).catch(()=>null);
}
export async function readPreparedBundle(page){
  const kind=bundleKind(page),bundle=memory.get(kind)||await access(kind);
  if(!bundle?.manifestVersion||bundle.bundleCached||bundle.profile||bundle.account)return null;
  memory.set(kind,bundle);return bundle;
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
