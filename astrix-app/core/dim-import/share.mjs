import {createImportStorage} from './cache.mjs';
const SHARE_ID=/^[a-z0-9]{7,64}$/i;
const MAX_INPUT=250000;
export function validateLoadout(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.equipped)||!Array.isArray(value.unequipped||[])||typeof value.name!=='string'||![0,1,2,3].includes(value.classType))throw new Error('This DIM loadout is invalid.');
  if(value.equipped.length+(value.unequipped||[]).length>500)throw new Error('This DIM loadout is too large.');
  return value;
}
export function parseDimInput(input){
  const text=String(input||'').trim();if(text.length>MAX_INPUT)throw new Error('This DIM link is too large.');
  if(SHARE_ID.test(text))return {shareId:text.toLowerCase()};
  let url;try{url=new URL(/^dim\.gg\//i.test(text)?`https://${text}`:text);}catch{throw new Error('Paste a DIM share link or share ID.');}
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Paste a valid HTTPS DIM link.');
  if(url.hostname==='dim.gg'){const id=url.pathname.split('/')[1];if(SHARE_ID.test(id))return {shareId:id.toLowerCase()};}
  if(['app.destinyitemmanager.com','beta.destinyitemmanager.com'].includes(url.hostname)){
    const fragment=url.hash.includes('?')?new URLSearchParams(url.hash.slice(url.hash.indexOf('?')+1)):null;
    const id=url.searchParams.get('loadout')||fragment?.get('loadout');
    if(id){if(SHARE_ID.test(id))return {shareId:id.toLowerCase()};try{return {loadout:validateLoadout(JSON.parse(id))};}catch{throw new Error('The embedded DIM loadout is invalid.');}}
  }
  throw new Error('Paste a DIM share link or share ID.');
}
export class DimShareClient {
  constructor({storage=createImportStorage(),fetchImpl=globalThis.fetch}={}){Object.assign(this,{storage,fetchImpl});this.cache=new Map();this.pending=new Map();this.failures=new Map();}
  async load(input){const parsed=parseDimInput(input);if(parsed.loadout)return parsed.loadout;const id=parsed.shareId;if(this.cache.has(id))return this.cache.get(id);if(this.pending.has(id))return this.pending.get(id);
    const failed=this.failures.get(id);if(failed&&failed.until>Date.now())throw failed.error;
    const task=(async()=>{
      const stored=await this.storage.get(`share:${id}`);if(stored){const result=validateLoadout(stored);this.cache.set(id,result);return result;}
      let response;try{response=await this.fetchImpl.call(globalThis,`https://auth.astrixparadox.com/dim/share/${encodeURIComponent(id)}`,{credentials:'omit',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});}catch(error){console.error('[PARADOX DIM share fetch failed]',{name:error?.name,message:error?.message});throw new Error('DIM is unreachable. Please try again later.',{cause:error});}
      if(response.status===404||response.status===410){const error=new Error('This DIM share link has expired or no longer exists.');error.expired=true;throw error;}
      if(!response.ok)throw new Error('DIM is unreachable. Please try again later.');
      const payload=await response.json();const loadout=validateLoadout(payload.loadout);this.cache.set(id,loadout);await this.storage.put(`share:${id}`,loadout);return loadout;
    })().catch(error=>{if(error.expired)this.failures.set(id,{error,until:Date.now()+60000});throw error;}).finally(()=>this.pending.delete(id));this.pending.set(id,task);return task;
  }
}
