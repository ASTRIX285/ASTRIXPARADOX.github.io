import {assertRenderablePagePayload} from './page-ready-contract.mjs?v=20260907-shared-page-load-1';
import {cacheBungieProfile,markPreparedPageCheckSuccess,readCachedBungieProfile} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs?v=20260913-live-character-2';

const PAGE_KINDS=Object.freeze(['character','build-forge','journey','vault','loadout']);
const PAGE_KIND_SET=new Set(PAGE_KINDS);
const REQUEST_TIMEOUT_MS=30_000;
const requests=new Map();
const WORKSPACE_PRELOAD_PAGES=Object.freeze(['character','build-forge','vault','loadout']);

const PREPARED_PAGE_STAGES=Object.freeze({
  start:Object.freeze({percent:8,label:'Preparing verified Guardian data'}),
  session:Object.freeze({percent:18,label:'Checking Bungie session'}),
  request:Object.freeze({percent:42,label:'Loading prepared bulk manifest and Guardian data'}),
  join:Object.freeze({percent:72,label:'Joining verified Guardian data to the prepared bulk manifest'}),
  render:Object.freeze({percent:92,label:'Rendering verified page data'}),
  ready:Object.freeze({percent:96,label:'Page ready'})
});

function pageKind(value){
  const page=String(value||'');
  if(!PAGE_KIND_SET.has(page))throw new Error(`Unknown prepared page ${page}`);
  return page;
}

function reportPreparedPageStage(stage,page,detail={}){
  const row=PREPARED_PAGE_STAGES[stage];
  if(!row)throw new Error(`Unknown prepared page stage ${stage}`);
  globalThis.ForgeLoader?.set?.(row.percent);
  globalThis.ForgeLoader?.status?.(row.label);
  const eventDetail={stage,page:pageKind(page),...row,...detail};
  globalThis.document?.dispatchEvent?.(new CustomEvent('forge:prepared-page-progress',{detail:eventDetail}));
  globalThis.document?.dispatchEvent?.(new CustomEvent('forge:guardian-profile-progress',{detail:eventDetail}));
  return eventDetail;
}

function mergeTables(target={},source={}){
  for(const [type,rows] of Object.entries(source||{})){
    if(!rows||typeof rows!=='object'||Array.isArray(rows))continue;
    if(target[type])Object.assign(target[type],rows);
    else target[type]=rows;
  }
  return target;
}

function expandPreparedPlugLists(profile={}){
  const compact=profile?.preparedPlugLists;
  if(compact?.schemaVersion!==1||!Array.isArray(compact.dictionary))return profile;
  const rows=index=>{
    const value=compact.dictionary[Number(index)];
    const fields=['plugItemHash','plugHash','canInsert','enabled','isEnabled','isVisible','enableFailIndexes','insertFailIndexes'];
    return Array.isArray(value)?value.map(tuple=>Object.fromEntries(fields
      .map((field,position)=>[field,tuple?.[position]])
      .filter(([,entry])=>entry!==undefined&&entry!==null))):[];
  };
  profile.itemComponents=profile.itemComponents||{};
  profile.itemComponents.reusablePlugs=profile.itemComponents.reusablePlugs||{data:{}};
  const reusableData=profile.itemComponents.reusablePlugs.data||{};
  profile.itemComponents.reusablePlugs.data=Object.fromEntries(Object.entries(compact.itemRefs||{}).map(([instanceId,refs])=>[
    instanceId,
    {...(reusableData[instanceId]||{}),plugs:Object.fromEntries(Object.entries(refs||{}).map(([socketIndex,index])=>[socketIndex,rows(index)]))}
  ]));
  if(Object.keys(compact.profileSetRefs||{}).length){
    profile.profilePlugSets=profile.profilePlugSets||{data:{plugs:{}}};
    profile.profilePlugSets.data=profile.profilePlugSets.data||{plugs:{}};
    profile.profilePlugSets.data.plugs=Object.fromEntries(Object.entries(compact.profileSetRefs).map(([setHash,index])=>[setHash,rows(index)]));
  }
  if(Object.keys(compact.characterSetRefs||{}).length){
    profile.characterPlugSets=profile.characterPlugSets||{data:{}};
    const characterData=profile.characterPlugSets.data||{};
    profile.characterPlugSets.data=Object.fromEntries(Object.entries(compact.characterSetRefs).map(([characterId,refs])=>[
      characterId,
      {...(characterData[characterId]||{}),plugs:Object.fromEntries(Object.entries(refs||{}).map(([setHash,index])=>[setHash,rows(index)]))}
    ]));
  }
  delete profile.preparedPlugLists;
  return profile;
}

function completeEnvelopeCoverage(payload,page){
  const missing=new Set(Array.isArray(payload?.pageReady?.coverage?.missing)?payload.pageReady.coverage.missing:[]);
  missing.delete('prepared-page-bundle');
  if(page==='journey'){
    if(payload?.journeyCoverage?.complete!==true)missing.add('journey-public-catalogue');
    if(!payload?.manifestTables?.DestinyStatDefinition)missing.add('guardian-stat-definitions');
  }
  if(page==='loadout'){
    if(!payload?.forgeArmourIndex)missing.add('forge-armour-index');
    if(payload?.loadoutCoverage?.complete!==true)missing.add('loadout-acquisition-sources');
  }
  if((page==='character'||page==='build-forge')&&(!Array.isArray(payload?.artifactCatalog)||!payload.artifactCatalog.length))missing.add('artifact-catalogue');
  if((page==='character'||page==='build-forge')&&payload?.characterBuildCoverage?.complete!==true)missing.add('character-build-coverage');
  payload.pageReady={
    ...(payload.pageReady||{}),
    page,
    coverage:{complete:missing.size===0,missing:[...missing]}
  };
  return payload;
}

function normalizePreparedPagePayload(raw,pageValue){
  const page=pageKind(pageValue);
  if(raw?.transport!=='prepared-page-stream-v1'||!raw?.account||!raw?.prepared)return raw;
  const prepared=raw.prepared&&typeof raw.prepared==='object'?raw.prepared:{};
  const account=raw.account&&typeof raw.account==='object'?raw.account:{};
  expandPreparedPlugLists(account.profile);
  const payload={...prepared,...account};
  if(page==='journey'){
    payload.manifestTables=mergeTables(prepared.manifestTables||{},account.journeyAccountManifestTables||{});
    payload.definitions=payload.manifestTables.DestinyInventoryItemDefinition||account.definitions||{};
    payload.statDefinitions=payload.manifestTables.DestinyStatDefinition||account.statDefinitions||{};
    payload.collectibleDefinitions=payload.manifestTables.DestinyCollectibleDefinition||account.collectibleDefinitions||{};
  }else if(page==='loadout'){
    payload.forgeArmourIndex=prepared.forgeArmourIndex||account.forgeArmourIndex||null;
    payload.collectibleDefinitions=prepared.collectibleDefinitions||account.collectibleDefinitions||{};
    payload.loadoutCoverage=prepared.loadoutCoverage||account.loadoutCoverage||null;
    payload.statDefinitions=prepared.forgeArmourIndex?.statDefinitions||account.statDefinitions||{};
    payload.artifactCatalog=prepared.forgeArmourIndex?.artifactCatalog||prepared.artifactCatalog||account.artifactCatalog||[];
  }else if(Array.isArray(prepared.artifactCatalog)){
    payload.artifactCatalog=prepared.artifactCatalog;
  }
  delete payload.journeyAccountManifestTables;
  return completeEnvelopeCoverage(payload,page);
}

function preparedPageUrl(page,{authOrigin=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com',freshness='display'}={}){
  const url=new URL(`/bungie/page/${pageKind(page)}`,authOrigin);
  url.searchParams.set('freshness',freshness==='live'?'live':'display');
  return url;
}

async function requestPreparedPagePayload(page,{fetchImpl=globalThis.fetch?.bind(globalThis),signal,timeoutMs=REQUEST_TIMEOUT_MS,freshness='display',quiet=false}={}){
  if(!fetchImpl)throw new Error('Prepared page network access is unavailable.');
  const controller=signal?null:new AbortController();
  const activeSignal=signal||controller.signal;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    if(!quiet)reportPreparedPageStage('request',page);
    const response=await fetchImpl(preparedPageUrl(page,{freshness}),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'},signal:activeSignal});
    const raw=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(raw?.error||`Prepared ${page} request failed (${response.status}).`);
    if(!quiet)reportPreparedPageStage('join',page);
    const payload=normalizePreparedPagePayload(raw,page);
    assertRenderablePagePayload(payload,page);
    return payload;
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`Prepared ${page} request timed out.`);
    throw error;
  }finally{
    if(timer!==null)clearTimeout(timer);
  }
}

function membershipIdentity(session){
  const membership=session?.activeDestinyMembership||{};
  return `${membership.membershipType??''}:${membership.membershipId||session?.primaryMembershipId||session?.bungieMembershipId||''}`;
}
function assertCurrentAccount(session,payload){
  const current=globalThis.FORGE_BUNGIE_SESSION;
  if(current&&(current.authenticated!==true||membershipIdentity(current)!==membershipIdentity(session)))throw new Error('Bungie membership changed while loading this page.');
  if(payload?.membership?.membershipId&&`${payload.membership.membershipType}:${payload.membership.membershipId}`!==membershipIdentity(session))throw new Error('Prepared data belongs to a different Bungie membership.');
}

function publishCoverage(payload,page,source){
  const complete=payload?.pageReady?.coverage?.complete===true;
  if(globalThis.document?.documentElement){
    globalThis.document.documentElement.dataset.preparedPageState=complete?'complete':'partial';
    globalThis.document.documentElement.dataset.preparedPageKind=page;
  }
  globalThis.document?.dispatchEvent?.(new CustomEvent('forge:prepared-page-loaded',{detail:{page,payload,source,complete,missing:payload?.pageReady?.coverage?.missing||[]}}));
}

async function loadPreparedPagePayload(session,pageValue,{force=false,preferBackend=false,sharedPayload=null,fetchImpl,quiet=force}={}){
  const page=pageKind(pageValue);
  if(!quiet){reportPreparedPageStage('start',page);reportPreparedPageStage('session',page);}
  if(!force&&!preferBackend&&sharedPayload?.pageReady?.page===page&&sharedPayload?.profile){
    const payload=normalizePreparedPagePayload(sharedPayload,page);
    assertCurrentAccount(session,payload);
    assertRenderablePagePayload(payload,page);
    if(!quiet)reportPreparedPageStage('join',page,{source:'shared'});
    publishCoverage(payload,page,'shared');
    return payload;
  }
  if(!force&&!preferBackend&&session?.authenticated===true){
    const cached=await readCachedBungieProfile(session,page);
    if(cached?.pageReady?.page===page&&cached?.profile){
      try{
        const payload=normalizePreparedPagePayload(cached,page);
        assertCurrentAccount(session,payload);
        assertRenderablePagePayload(payload,page);
        if(!quiet)reportPreparedPageStage('join',page,{source:'cache'});
        publishCoverage(payload,page,'cache');
        return payload;
      }catch(error){console.info('[Forge] Cached page needs a new display snapshot',error);}
    }
  }
  if(!quiet)globalThis.ForgeLoader?.requireData?.();
  const freshness=force?'live':'display';
  assertCurrentAccount(session);
  const key=`${membershipIdentity(session)}:${page}:${freshness}`;
  const active=requests.get(key);
  if(active)return active;
  if(!requests.has(key))requests.set(key,(async()=>{
    const payload=await requestPreparedPagePayload(page,{fetchImpl,freshness,quiet});
    assertCurrentAccount(session,payload);
    if(session?.authenticated===true){
      await cacheBungieProfile(session,payload,page);
      markPreparedPageCheckSuccess(session,page);
    }
    assertCurrentAccount(session,payload);
    publishCoverage(payload,page,'backend');
    return payload;
  })());
  try{return await requests.get(key);}
  finally{requests.delete(key);}
}

async function preloadPreparedWorkspace(session,{pages=WORKSPACE_PRELOAD_PAGES,fetchImpl}={}){
  if(session?.authenticated!==true)return {complete:false,ready:[],failed:[]};
  const ready=[],failed=[];
  for(const value of pages){
    const page=pageKind(value);
    if(page==='journey')continue;
    try{
      // Revisiting Journey must not download the entire workspace again.
      // Active pages retain their existing background freshness controllers.
      const cached=await readCachedBungieProfile(session,page);
      let usable=false;
      try{assertRenderablePagePayload(cached,page);usable=true;}catch{}
      if(!usable)await loadPreparedPagePayload(session,page,{preferBackend:true,fetchImpl,quiet:true});
      ready.push(page);
      globalThis.document?.dispatchEvent?.(new CustomEvent('forge:workspace-page-prepared',{detail:{page}}));
    }catch(error){
      failed.push({page,message:error?.message||String(error)});
    }
  }
  const result={complete:failed.length===0,ready,failed};
  globalThis.document?.dispatchEvent?.(new CustomEvent('forge:workspace-prepared',{detail:result}));
  return result;
}

export {PAGE_KINDS,PREPARED_PAGE_STAGES,WORKSPACE_PRELOAD_PAGES,loadPreparedPagePayload,normalizePreparedPagePayload,preloadPreparedWorkspace,preparedPageUrl,reportPreparedPageStage,requestPreparedPagePayload};
