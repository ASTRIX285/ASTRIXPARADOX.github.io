import {normalizePreparedPagePayload} from './prepared-page-client.mjs?perf=20260927-1&recovery=20260927-4';
import {assertRenderablePagePayload} from './page-ready-contract.mjs?v=20260907-shared-page-load-1';
import {normaliseLiveProfile} from '../pages/guardian-workspace-v2/guardian-bungie-profile.mjs?perf=20260927-1&recovery=20260927-4';
import {MAX_PREPARED_PAGE_BYTES,PayloadSizeError} from './bounded-json.mjs';
import {joinPreparedBundle,savePreparedBundle} from './prepared-bundle-cache.mjs';
export function handleProfileTask({id,type,text,page,payload,session,characterId,cachedPrepared,returnEnvelope},post){
  try{
    let result,bundleToSave;
    if(type==='parse'){
      const bytes=new TextEncoder().encode(text).byteLength;
      if(bytes>MAX_PREPARED_PAGE_BYTES)throw new PayloadSizeError('profile worker parse',bytes,MAX_PREPARED_PAGE_BYTES);
      const raw=JSON.parse(text),joined=joinPreparedBundle(raw,cachedPrepared);
      result=normalizePreparedPagePayload(joined,page);assertRenderablePagePayload(result,page);
      if(!raw?.prepared?.bundleCached)bundleToSave=raw?.prepared;
      if(returnEnvelope)result={payload:result,preparedBundle:raw?.prepared?.bundleCached?null:raw?.prepared};
    }
    else if(type==='normalise'){result=normaliseLiveProfile(payload,session,characterId);}
    else throw new Error('Unknown profile task.');
    post({id,result});
    // Deliver renderable data first. IndexedDB cloning and persistence stay
    // on this worker and never hold the page response or its processing timer.
    if(bundleToSave)void savePreparedBundle(page,bundleToSave);
  }catch(error){post({id,error:error?.message||'Profile processing failed.',errorName:error?.name});}
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
  self.onmessage=event=>handleProfileTask(event.data,message=>self.postMessage(message));
  self.postMessage({type:'ready'});
}
