import {normalizePreparedPagePayload} from './prepared-page-client.mjs?perf=20260927-1';
import {assertRenderablePagePayload} from './page-ready-contract.mjs?v=20260907-shared-page-load-1';
import {normaliseLiveProfile} from '../pages/guardian-workspace-v2/guardian-bungie-profile.mjs?perf=20260927-1';
import {createEnginePrecomputer} from './engine-precompute.mjs?v=20260927-1';
const prepare=createEnginePrecomputer();
export function handleProfileTask({id,type,text,page,payload,session,characterId},post){
  try{
    let result;
    if(type==='parse'){result=normalizePreparedPagePayload(JSON.parse(text),page);assertRenderablePagePayload(result,page);}
    else if(type==='normalise'){result=normaliseLiveProfile(payload,session,characterId);prepare(result);}
    else throw new Error('Unknown profile task.');
    post({id,result});
  }catch(error){post({id,error:error?.message||'Profile processing failed.'});}
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>handleProfileTask(event.data,message=>self.postMessage(message));
