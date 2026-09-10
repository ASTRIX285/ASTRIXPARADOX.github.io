import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260906-tool-intro-1';
import {loadPreparedPagePayload} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&contract=20260910-owned-weapon-1';

const PAGE_PATH='/astrix-app/pages/forge-loader/';
const FORGE_LOADER_PRELOAD_RECEIPT_KEY='astrix:forge-loader-preload-receipt:v1';

function writeForgeLoaderPreloadReceipt(value){
  try{sessionStorage.setItem(FORGE_LOADER_PRELOAD_RECEIPT_KEY,JSON.stringify(value));return true;}
  catch{return false;}
}

function readForgeLoaderPreloadReceipt(){
  try{
    const value=JSON.parse(sessionStorage.getItem(FORGE_LOADER_PRELOAD_RECEIPT_KEY)||'null');
    return value&&Number(value.completedAt)>0&&Date.now()-Number(value.completedAt)<12*60*60*1000?value:null;
  }catch{return null;}
}

function forgeLoaderTargetUrl(value=location.href){
  const source=new URL(String(value),location.href);
  const target=new URL(PAGE_PATH,location.origin);
  for(const key of ['from','characterId','membershipId','membershipType','slot']){
    const entry=source.searchParams.get(key);
    if(entry)target.searchParams.set(key,entry);
  }
  return target;
}

async function preloadForgeLoaderPayload(session,{force=false,sharedPayload=null,reason='forge-loader'}={}){
  if(session?.authenticated!==true)return null;
  const startedAt=Date.now();
  const request=loadPreparedPagePayload(session,'loadout',{force,sharedPayload});
  globalThis.FORGE_LOADER_PRELOAD_PROMISE=request;
  const payload=await request;
  globalThis.FORGE_LOADER_PRELOAD_PAYLOAD=payload;
  const completedAt=Date.now();
  writeForgeLoaderPreloadReceipt({startedAt,completedAt,durationMs:completedAt-startedAt,reason,manifestVersion:String(payload?.pageReady?.manifestVersion||''),complete:payload?.pageReady?.coverage?.complete===true});
  return payload;
}

async function prepareForgeLoaderEntry(target=forgeLoaderTargetUrl(),resolvedSession=null){
  const session=resolvedSession||await getBungieSession();
  if(session?.authenticated!==true)return {kind:'authentication',session,target,authUrl:authStartUrl(target)};
  return {kind:'payload',session,target,promise:preloadForgeLoaderPayload(session,{force:true})};
}

export {FORGE_LOADER_PRELOAD_RECEIPT_KEY,forgeLoaderTargetUrl,prepareForgeLoaderEntry,preloadForgeLoaderPayload,readForgeLoaderPreloadReceipt,writeForgeLoaderPreloadReceipt};
