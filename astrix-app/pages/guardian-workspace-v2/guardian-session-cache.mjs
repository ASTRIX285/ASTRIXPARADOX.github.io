const SESSION_KEY="astrix:bungie-session-cache:v1";
const PROFILE_MARKER_PREFIX="astrix:bungie-page-cache:v3:";
const PROFILE_FALLBACK_PREFIX="astrix:bungie-page-cache-fallback:v3:";
const PREPARED_PAGE_CHECK_PREFIX="astrix:bungie-page-check:v1:";
const LOADOUT_FALLBACK_PREFIX="astrix:bungie-loadout-cache-fallback:v2:";
const FAST_RETURN_KEY="astrix:guardian-fast-return:v1";
const PORTAL_TRANSITION_KEY="astrix:guardian-portal-transition:v1";
const DB_NAME="astrix-guardian-session";
const DB_VERSION=2;
const STORE_NAME="guardian-data";
const MANIFEST_STORE_NAME="manifest-data";
const FORGE_TRANSFER_PREFIX="forge-loader-transfer:v1";
const BUILD_FORGE_STATE_PREFIX="build-forge-state:v1";
// The profile cache belongs to the current browser session. Keep the last
// verified Guardian available for a full working session so Main <-> Build
// navigation never collapses to placeholders while Bungie refreshes.
const PROFILE_TTL_MS=12*60*60*1000;
const PREPARED_PAGE_REFRESH_MS=10*60*1000;
const PREPARED_PAGE_RETRY_MS=60*1000;
const FORGE_TRANSFER_TTL_MS=30*60*1000;
const FORGE_TRANSFER_IO_TIMEOUT_MS=4000;
const BUILD_FORGE_STATE_TTL_MS=12*60*60*1000;
const profileCacheSavedAt=new WeakMap();

const safeSessionRead=key=>{
  try{return JSON.parse(sessionStorage.getItem(key)||"null");}
  catch{return null;}
};

const safeSessionWrite=(key,value)=>{
  try{sessionStorage.setItem(key,JSON.stringify(value));return true;}
  catch{return false;}
};

function sessionIdentity(session={}){
  const membership=session.activeDestinyMembership||{};
  const membershipId=String(membership.membershipId||session.primaryMembershipId||session.bungieMembershipId||"");
  const membershipType=String(membership.membershipType??"");
  return membershipId?`${membershipType}:${membershipId}`:"";
}

function preparedPageCheckKey(session,page){
  const identity=sessionIdentity(session);
  return identity?`${PREPARED_PAGE_CHECK_PREFIX}${identity}:${pageKind(page)}`:"";
}

function readPreparedPageCheck(session,page,{storage=globalThis.localStorage}={}){
  const key=preparedPageCheckKey(session,page);
  if(!key||!storage)return 0;
  try{
    const checkedAt=Number(storage.getItem(key)||0);
    return Number.isFinite(checkedAt)&&checkedAt>0?checkedAt:0;
  }catch{return 0;}
}

function markPreparedPageCheckSuccess(session,page,{storage=globalThis.localStorage,now=Date.now}={}){
  const key=preparedPageCheckKey(session,page);
  if(!key||!storage)return 0;
  const checkedAt=Number(now());
  if(!Number.isFinite(checkedAt)||checkedAt<=0)return 0;
  try{storage.setItem(key,String(checkedAt));return checkedAt;}
  catch{return 0;}
}

function createPreparedPageRefreshController({
  session,
  page,
  refresh,
  intervalMs=PREPARED_PAGE_REFRESH_MS,
  retryMs=PREPARED_PAGE_RETRY_MS,
  storage=globalThis.localStorage,
  now=Date.now,
  setTimer=(callback,delay)=>globalThis.setTimeout(callback,delay),
  clearTimer=timer=>globalThis.clearTimeout(timer),
  onError=()=>{}
}={}){
  if(!sessionIdentity(session))throw new Error("Prepared page refresh requires an authenticated membership.");
  if(typeof refresh!=="function")throw new TypeError("Prepared page refresh requires a refresh function.");
  let timer=null;
  let activeRequest=null;
  let running=false;

  const cancelTimer=()=>{
    if(timer===null)return;
    clearTimer(timer);
    timer=null;
  };
  const schedule=delay=>{
    cancelTimer();
    if(!running)return;
    timer=setTimer(()=>{
      timer=null;
      void run("poll").catch(()=>{});
    },Math.max(0,Number(delay)||0));
  };
  const scheduleFromLastSuccess=()=>{
    const checkedAt=readPreparedPageCheck(session,page,{storage});
    const elapsed=checkedAt?Math.max(0,Number(now())-checkedAt):intervalMs;
    schedule(Math.max(0,intervalMs-elapsed));
  };
  const run=reason=>{
    if(activeRequest)return activeRequest;
    cancelTimer();
    const request=Promise.resolve().then(()=>refresh({reason,force:true}));
    activeRequest=request.then(result=>{
      if(result===null||result===false)throw new Error("Prepared page refresh returned no payload.");
      markPreparedPageCheckSuccess(session,page,{storage,now});
      if(running)schedule(intervalMs);
      return result;
    }).catch(error=>{
      if(running)schedule(Math.min(intervalMs,retryMs));
      onError(error,reason);
      throw error;
    }).finally(()=>{
      activeRequest=null;
    });
    return activeRequest;
  };

  return {
    start(){if(!running){running=true;scheduleFromLastSuccess();}return this;},
    stop(){running=false;cancelTimer();},
    check(){
      const checkedAt=readPreparedPageCheck(session,page,{storage});
      if(!checkedAt||Number(now())-checkedAt>=intervalMs)return run("poll");
      schedule(intervalMs-(Number(now())-checkedAt));
      return null;
    },
    refreshNow(){return run("manual");},
    lastSuccessfulAt(){return readPreparedPageCheck(session,page,{storage});}
  };
}

function bindPreparedPageRefreshControl(button,controller,{onError=()=>{}}={}){
  if(!button||!controller)return ()=>{};
  const handleClick=async()=>{
    if(button.disabled)return;
    button.disabled=true;
    button.setAttribute("aria-busy","true");
    button.textContent="Refreshing";
    try{await controller.refreshNow();}
    catch(error){onError(error);}
    finally{
      button.textContent="Refresh";
      button.setAttribute("aria-busy","false");
      button.disabled=false;
    }
  };
  button.disabled=false;
  button.addEventListener("click",handleClick);
  return ()=>button.removeEventListener("click",handleClick);
}

function cacheBungieSession(session){
  if(!session?.authenticated)return false;
  return safeSessionWrite(SESSION_KEY,{savedAt:Date.now(),session});
}

function readCachedBungieSession(){
  const row=safeSessionRead(SESSION_KEY);
  const session=row?.session;
  // Live mutations must never be enabled from an older cached session that
  // predates the CSRF token and the Worker's explicit capability contract.
  return session?.authenticated&&session?.csrfToken&&session?.capabilities?.destinyActions
    ?{...session,sessionCacheRestored:true}
    :null;
}

function openDatabase(){
  if(typeof indexedDB==="undefined")return Promise.resolve(null);
  return new Promise(resolve=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"key"});
      if(!db.objectStoreNames.contains(MANIFEST_STORE_NAME))db.createObjectStore(MANIFEST_STORE_NAME,{keyPath:"key"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
}

async function writeRecord(record){
  const db=await openDatabase();
  if(!db)return false;
  return new Promise(resolve=>{
    const transaction=db.transaction(STORE_NAME,"readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete=()=>{db.close();resolve(true);};
    transaction.onerror=()=>{db.close();resolve(false);};
    transaction.onabort=()=>{db.close();resolve(false);};
  });
}

async function readRecord(key){
  const db=await openDatabase();
  if(!db)return null;
  return new Promise(resolve=>{
    const transaction=db.transaction(STORE_NAME,"readonly");
    const request=transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>resolve(null);
    transaction.oncomplete=()=>db.close();
    transaction.onerror=()=>db.close();
    transaction.onabort=()=>db.close();
  });
}

async function deleteRecord(key){
  const db=await openDatabase();
  if(!db)return false;
  return new Promise(resolve=>{
    const transaction=db.transaction(STORE_NAME,"readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete=()=>{db.close();resolve(true);};
    transaction.onerror=()=>{db.close();resolve(false);};
    transaction.onabort=()=>{db.close();resolve(false);};
  });
}

function forgeTransferBinding(value={}){
  return {
    characterId:String(value.characterId||""),
    membershipId:String(value.membershipId||value.bungieMembershipId||""),
    membershipType:String(value.membershipType??"")
  };
}

function forgeTransferRecordKey(value={}){
  const binding=forgeTransferBinding(value);
  if(!binding.characterId||!binding.membershipId||!binding.membershipType)return "";
  return `${FORGE_TRANSFER_PREFIX}:${binding.membershipType}:${binding.membershipId}:${binding.characterId}`;
}

function buildForgeStateRecordKey(value={}){
  const binding=forgeTransferBinding(value);
  if(!binding.characterId||!binding.membershipId||!binding.membershipType)return "";
  return `${BUILD_FORGE_STATE_PREFIX}:${binding.membershipType}:${binding.membershipId}:${binding.characterId}`;
}

function boundedForgeTransferIo(task,fallback){
  return Promise.race([task,new Promise(resolve=>setTimeout(()=>resolve(fallback),FORGE_TRANSFER_IO_TIMEOUT_MS))]);
}

async function cacheForgeLoaderTransfer(binding,transfer){
  const normalized=forgeTransferBinding(binding),key=forgeTransferRecordKey(normalized);
  if(!key||!transfer?.snapshotEnvelope||!transfer?.armourSelection)return false;
  try{return await boundedForgeTransferIo(writeRecord({key,binding:normalized,savedAt:Date.now(),transfer}),false);}
  catch{return false;}
}

async function readForgeLoaderTransfer(binding){
  const normalized=forgeTransferBinding(binding),key=forgeTransferRecordKey(normalized);
  if(!key)return null;
  let record=null;
  try{record=await boundedForgeTransferIo(readRecord(key),null);}catch{return null;}
  const stored=forgeTransferBinding(record?.binding||{});
  if(!record||Date.now()-Number(record.savedAt||0)>FORGE_TRANSFER_TTL_MS)return null;
  if(stored.characterId!==normalized.characterId||stored.membershipId!==normalized.membershipId||stored.membershipType!==normalized.membershipType)return null;
  return record.transfer?.snapshotEnvelope&&record.transfer?.armourSelection?record.transfer:null;
}

async function cacheBuildForgeState(binding,snapshot,{writeRecord:writeBuildRecord=writeRecord,now=Date.now}={}){
  const normalized=forgeTransferBinding(binding),key=buildForgeStateRecordKey(normalized);
  if(!key||!snapshot)return false;
  try{return await boundedForgeTransferIo(writeBuildRecord({key,binding:normalized,savedAt:now(),snapshot}),false);}
  catch{return false;}
}

async function readBuildForgeState(binding,{readRecord:readBuildRecord=readRecord,now=Date.now}={}){
  const normalized=forgeTransferBinding(binding),key=buildForgeStateRecordKey(normalized);
  if(!key)return null;
  let record=null;
  try{record=await boundedForgeTransferIo(readBuildRecord(key),null);}catch{return null;}
  const stored=forgeTransferBinding(record?.binding||{});
  if(!record||now()-Number(record.savedAt||0)>BUILD_FORGE_STATE_TTL_MS)return null;
  if(stored.characterId!==normalized.characterId||stored.membershipId!==normalized.membershipId||stored.membershipType!==normalized.membershipType)return null;
  return record.snapshot||null;
}

function pageKind(value){return String(value||"shared").trim().toLowerCase()||"shared";}
function profileRecordKey(identity,page){return `profile:v3:${identity}:${pageKind(page)}`;}
function profileMarkerKey(page){return `${PROFILE_MARKER_PREFIX}${pageKind(page)}`;}
function profileFallbackKey(page){return `${PROFILE_FALLBACK_PREFIX}${pageKind(page)}`;}
function loadoutRecordKey(identity,characterId,index){return `loadout:v2:${identity}:${characterId}:${index}`;}
function isFresh(record){return Boolean(record&&Date.now()-Number(record.savedAt||0)<=PROFILE_TTL_MS);}
function hasCurrentPreparedProfileContract(payload,scope){
  return scope!=='loadout'||payload?.weaponDefinitionCoverage?.schemaVersion===1;
}

async function cacheBungieProfile(session,payload,page=payload?.pageReady?.page){
  const identity=sessionIdentity(session);
  if(!identity||!payload)return false;
  const scope=pageKind(page);
  const inheritedSavedAt=payload&&typeof payload==="object"?profileCacheSavedAt.get(payload):0;
  const savedAt=Number(inheritedSavedAt)||Date.now();
  if(payload&&typeof payload==="object")profileCacheSavedAt.set(payload,savedAt);
  const key=profileRecordKey(identity,scope);
  cacheBungieSession(session);
  safeSessionWrite(profileMarkerKey(scope),{key,identity,scope,savedAt});
  const written=await writeRecord({key,identity,scope,savedAt,payload});
  if(!written)safeSessionWrite(profileFallbackKey(scope),{key,identity,scope,savedAt,payload});
  return written;
}

async function readCachedBungieProfile(session,page="shared"){
  const identity=sessionIdentity(session);
  const scope=pageKind(page);
  const marker=safeSessionRead(profileMarkerKey(scope));
  if(!identity||marker?.identity!==identity||marker?.scope!==scope||!isFresh(marker))return null;
  const stored=await readRecord(marker.key);
  if(stored?.identity===identity&&stored?.scope===scope&&isFresh(stored)&&stored.payload&&hasCurrentPreparedProfileContract(stored.payload,scope)){
    if(typeof stored.payload==="object")profileCacheSavedAt.set(stored.payload,Number(stored.savedAt));
    return stored.payload;
  }
  const fallback=safeSessionRead(profileFallbackKey(scope));
  if(fallback?.identity===identity&&fallback?.scope===scope&&fallback?.key===marker.key&&isFresh(fallback)&&hasCurrentPreparedProfileContract(fallback.payload,scope)){
    if(fallback.payload&&typeof fallback.payload==="object")profileCacheSavedAt.set(fallback.payload,Number(fallback.savedAt));
    return fallback.payload;
  }
  return null;
}

function releaseGuardianSessionStorageFallbacks(storage=globalThis.sessionStorage){
  if(!storage)return 0;
  try{
    const keys=[];
    for(let index=0;index<storage.length;index+=1){const key=String(storage.key(index)||'');if(key.startsWith(PROFILE_FALLBACK_PREFIX)||key.startsWith(LOADOUT_FALLBACK_PREFIX))keys.push(key);}
    for(const key of keys)storage.removeItem(key);
    return keys.length;
  }catch{return 0;}
}

async function cacheBungieLoadoutDetail(session,characterId,index,detail){
  const identity=sessionIdentity(session);
  if(!identity||!characterId||!Number.isInteger(Number(index))||!detail)return false;
  const key=loadoutRecordKey(identity,String(characterId),Number(index));
  const record={key,identity,savedAt:Date.now(),detail};
  const written=await writeRecord(record);
  if(!written)safeSessionWrite(`${LOADOUT_FALLBACK_PREFIX}${characterId}:${Number(index)}`,record);
  return written;
}

async function readCachedBungieLoadoutDetail(session,characterId,index){
  const identity=sessionIdentity(session);
  if(!identity||!characterId||!Number.isInteger(Number(index)))return null;
  const key=loadoutRecordKey(identity,String(characterId),Number(index));
  const stored=await readRecord(key);
  if(stored?.identity===identity&&isFresh(stored))return stored.detail||null;
  const fallback=safeSessionRead(`${LOADOUT_FALLBACK_PREFIX}${characterId}:${Number(index)}`);
  return fallback?.key===key&&fallback?.identity===identity&&isFresh(fallback)?fallback.detail||null:null;
}

async function invalidateBungieLoadoutDetail(session,characterId,index){
  const identity=sessionIdentity(session),slot=Number(index),guardian=String(characterId||"");
  if(!identity||!guardian||!Number.isInteger(slot))return false;
  const key=loadoutRecordKey(identity,guardian,slot),fallbackKey=`${LOADOUT_FALLBACK_PREFIX}${guardian}:${slot}`;
  let fallbackRemoved=false;
  try{fallbackRemoved=sessionStorage.getItem(fallbackKey)!==null;sessionStorage.removeItem(fallbackKey);}catch{}
  return (await deleteRecord(key))||fallbackRemoved;
}

function armGuardianPortalTransition(){
  const fromBuild=String(globalThis.location?.pathname||"").includes("/paradox-build-space/");
  const label=fromBuild?"Opening Guardian workspace":"Opening Build Forge";
  try{
    sessionStorage.removeItem(FAST_RETURN_KEY);
    sessionStorage.setItem(PORTAL_TRANSITION_KEY,JSON.stringify({armedAt:Date.now(),label}));
  }catch{}
  globalThis.APX_SKIP_PORTAL=false;
  globalThis.ForgeLoader?.mount?.();
  globalThis.ForgeLoader?.set?.(0);
  globalThis.ForgeLoader?.status?.(label);
}

function markGuardianFastReturn(){
  armGuardianPortalTransition();
}

export {
  FAST_RETURN_KEY,
  PORTAL_TRANSITION_KEY,
  cacheBungieSession,
  readCachedBungieSession,
  cacheBungieProfile,
  readCachedBungieProfile,
  PROFILE_TTL_MS,
  PREPARED_PAGE_REFRESH_MS,
  readPreparedPageCheck,
  markPreparedPageCheckSuccess,
  createPreparedPageRefreshController,
  bindPreparedPageRefreshControl,
  cacheForgeLoaderTransfer,
  readForgeLoaderTransfer,
  cacheBuildForgeState,
  readBuildForgeState,
  releaseGuardianSessionStorageFallbacks,
  cacheBungieLoadoutDetail,
  readCachedBungieLoadoutDetail,
  invalidateBungieLoadoutDetail,
  markGuardianFastReturn,
  armGuardianPortalTransition,
  openDatabase as openGuardianDatabase,
  MANIFEST_STORE_NAME
};
