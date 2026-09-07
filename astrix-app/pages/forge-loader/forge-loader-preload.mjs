import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260906-tool-intro-1';
import {loadPreparedPagePayload} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';

const PAGE_PATH='/astrix-app/pages/forge-loader/';

function forgeLoaderTargetUrl(value=location.href){
  const source=new URL(String(value),location.href);
  const target=new URL(PAGE_PATH,location.origin);
  for(const key of ['from','characterId','membershipId','membershipType','slot']){
    const entry=source.searchParams.get(key);
    if(entry)target.searchParams.set(key,entry);
  }
  return target;
}

async function preloadForgeLoaderPayload(session,{force=false,sharedPayload=null}={}){
  if(session?.authenticated!==true)return null;
  const request=loadPreparedPagePayload(session,'loadout',{force,sharedPayload});
  globalThis.FORGE_LOADER_PRELOAD_PROMISE=request;
  const payload=await request;
  globalThis.FORGE_LOADER_PRELOAD_PAYLOAD=payload;
  return payload;
}

async function prepareForgeLoaderEntry(target=forgeLoaderTargetUrl(),resolvedSession=null){
  const session=resolvedSession||await getBungieSession();
  if(session?.authenticated!==true)return {kind:'authentication',session,target,authUrl:authStartUrl(target)};
  return {kind:'payload',session,target,promise:preloadForgeLoaderPayload(session,{force:true})};
}

export {forgeLoaderTargetUrl,prepareForgeLoaderEntry,preloadForgeLoaderPayload};
