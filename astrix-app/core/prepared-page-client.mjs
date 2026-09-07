import {assertRenderablePagePayload} from './page-ready-contract.mjs?v=20260907-shared-page-load-1';
import {cacheBungieProfile,markPreparedPageCheckSuccess,readCachedBungieProfile} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';

const PAGE_KINDS=Object.freeze(['character','build-forge','journey','vault','loadout']);
const PAGE_KIND_SET=new Set(PAGE_KINDS);
const REQUEST_TIMEOUT_MS=30_000;
const requests=new Map();

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

function preparedPageUrl(page,{authOrigin=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com'}={}){
  return new URL(`/bungie/page/${pageKind(page)}`,authOrigin);
}

async function requestPreparedPagePayload(page,{fetchImpl=globalThis.fetch?.bind(globalThis),signal,timeoutMs=REQUEST_TIMEOUT_MS}={}){
  if(!fetchImpl)throw new Error('Prepared page network access is unavailable.');
  const controller=signal?null:new AbortController();
  const activeSignal=signal||controller.signal;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    reportPreparedPageStage('request',page);
    const response=await fetchImpl(preparedPageUrl(page),{credentials:'include',headers:{Accept:'application/json'},signal:activeSignal});
    const raw=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(raw?.error||`Prepared ${page} request failed (${response.status}).`);
    reportPreparedPageStage('join',page);
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

function publishCoverage(payload,page,source){
  const complete=payload?.pageReady?.coverage?.complete===true;
  if(globalThis.document?.documentElement){
    globalThis.document.documentElement.dataset.preparedPageState=complete?'complete':'partial';
    globalThis.document.documentElement.dataset.preparedPageKind=page;
  }
  globalThis.document?.dispatchEvent?.(new CustomEvent('forge:prepared-page-loaded',{detail:{page,payload,source,complete,missing:payload?.pageReady?.coverage?.missing||[]}}));
}

async function loadPreparedPagePayload(session,pageValue,{force=false,sharedPayload=null,fetchImpl}={}){
  const page=pageKind(pageValue);
  reportPreparedPageStage('start',page);
  reportPreparedPageStage('session',page);
  if(!force&&sharedPayload?.pageReady?.page===page&&sharedPayload?.profile){
    const payload=normalizePreparedPagePayload(sharedPayload,page);
    assertRenderablePagePayload(payload,page);
    reportPreparedPageStage('join',page,{source:'shared'});
    publishCoverage(payload,page,'shared');
    return payload;
  }
  if(!force&&session?.authenticated===true){
    const cached=await readCachedBungieProfile(session,page);
    if(cached?.pageReady?.page===page&&cached?.profile){
      const payload=normalizePreparedPagePayload(cached,page);
      assertRenderablePagePayload(payload,page);
      reportPreparedPageStage('join',page,{source:'cache'});
      publishCoverage(payload,page,'cache');
      return payload;
    }
  }
  const active=requests.get(page)||requests.get(`${page}:force`);
  if(active)return active;
  const key=force?`${page}:force`:page;
  if(!requests.has(key))requests.set(key,(async()=>{
    const payload=await requestPreparedPagePayload(page,{fetchImpl});
    if(session?.authenticated===true){
      await cacheBungieProfile(session,payload,page);
      markPreparedPageCheckSuccess(session,page);
    }
    publishCoverage(payload,page,'backend');
    return payload;
  })());
  try{return await requests.get(key);}
  finally{requests.delete(key);}
}

export {PAGE_KINDS,PREPARED_PAGE_STAGES,loadPreparedPagePayload,normalizePreparedPagePayload,preparedPageUrl,reportPreparedPageStage,requestPreparedPagePayload};
