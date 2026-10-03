import {normalizePreparedPagePayload} from './prepared-page-client.mjs?v=7ca1a2d187';
import {assertRenderablePagePayload} from './page-ready-contract.mjs?v=a5fcd4c480';
import {normaliseLiveProfile} from '../pages/guardian-workspace-v2/guardian-bungie-profile.mjs?v=22677d9424';
import {MAX_PREPARED_PAGE_BYTES,PayloadSizeError} from './bounded-json.mjs?v=3fb7642429';
import {joinPreparedBundle} from './prepared-bundle-cache.mjs?v=2da7748b41';
export function handleProfileTask({id,type,text,page,payload,session,characterId,cachedPrepared,returnEnvelope},post){
  try{
    let result;
    if(type==='parse'){
      const bytes=new TextEncoder().encode(text).byteLength;
      if(bytes>MAX_PREPARED_PAGE_BYTES)throw new PayloadSizeError('profile worker parse',bytes,MAX_PREPARED_PAGE_BYTES);
      const raw=JSON.parse(text),joined=joinPreparedBundle(raw,cachedPrepared);
      result=normalizePreparedPagePayload(joined,page);assertRenderablePagePayload(result,page);
      if(returnEnvelope)result={payload:result,preparedBundle:raw?.prepared?.bundleCached?null:raw?.prepared};
    }
    else if(type==='normalise'){result=normaliseLiveProfile(payload,session,characterId);}
    else throw new Error('Unknown profile task.');
    post({id,result});
  }catch(error){post({id,error:error?.message||'Profile processing failed.',errorName:error?.name});}
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
  self.onmessage=event=>handleProfileTask(event.data,message=>self.postMessage(message));
  self.postMessage({type:'ready'});
}
