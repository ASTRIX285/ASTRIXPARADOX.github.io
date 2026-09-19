const DB_NAME='astrix-paradox-loadouts';
const DB_VERSION=1;
const STORE_NAME='loadouts';
const FALLBACK_KEY='astrix:paradox-saved-loadouts:v1';
const RECORD_SCHEMA_VERSION=1;
const MAX_NAME_LENGTH=80;
const MAX_DESCRIPTION_LENGTH=400;

const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const text=(value,limit)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,limit);
const decimal=value=>/^\d+$/.test(String(value??''));
const nowIso=()=>new Date().toISOString();
const newId=()=>globalThis.crypto?.randomUUID?.()||`paradox-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function bindingOf(build={}){
  return {
    characterId:String(build.characterId||''),
    membershipId:String(build.membershipId||build.bungieMembershipId||''),
    membershipType:String(build.membershipType??''),
    characterClass:text(build.characterClass||build.className,24).toLowerCase()
  };
}

function compactBuild(source={}){
  const build=clone(source?.workingBuild||source||{});
  // These catalogues can contain the entire account inventory or large activity
  // responses. A saved PARADOX record keeps every selected component and its
  // socket evidence, while the editor refreshes broad catalogues from Bungie.
  for(const key of [
    'ownedWeapons','vaultWeapons','inventoryWeapons','ownedArmour','availableActivities',
    'activityCatalog','gearAssets','itemRenderData','renderData','loadouts'
  ])delete build[key];
  delete build.loadoutActionIntent;
  delete build.liveTransferPreflight;
  delete build.liveTransferPlan;
  delete build.liveTransferResult;
  delete build.sessionCacheRestored;
  build.source='paradox-saved-loadout';
  build.savedBuildProvenance={
    provider:'forge-paradox',
    state:'user-saved-working-build',
    selectedEquipment:'exact-instance-ids',
    selectedSockets:'verified-options-or-explicit-in-game-steps'
  };
  return build;
}

function createParadoxLoadoutRecord({id=null,name,description='',build,createdAt=null,revision=0}={}){
  const normalizedName=text(name,MAX_NAME_LENGTH);
  if(!normalizedName)throw new TypeError('A PARADOX loadout name is required.');
  const snapshot=compactBuild(build);
  const binding=bindingOf(snapshot);
  if(!decimal(binding.characterId)||!decimal(binding.membershipId)||!/^\d+$/.test(binding.membershipType)){
    throw new TypeError('Saved PARADOX loadouts require a Bungie Guardian binding.');
  }
  if(!Array.isArray(snapshot.weapons)||!Array.isArray(snapshot.armour))throw new TypeError('The Working Build equipment snapshot is incomplete.');
  const timestamp=nowIso();
  return {
    schemaVersion:RECORD_SCHEMA_VERSION,
    id:String(id||newId()),
    name:normalizedName,
    description:text(description,MAX_DESCRIPTION_LENGTH),
    createdAt:createdAt||timestamp,
    updatedAt:timestamp,
    revision:Math.max(1,Number(revision||0)+1),
    binding,
    source:{kind:'paradox-working-build',bungieLoadoutIndex:Number.isInteger(snapshot.selectedLoadoutIndex)?snapshot.selectedLoadoutIndex:null},
    summary:{
      subclass:text(snapshot.subclassName||snapshot.subclass||'Subclass',80),
      weaponCount:snapshot.weapons.filter(Boolean).length,
      armourCount:snapshot.armour.filter(Boolean).length,
      artifactPerkCount:Array.isArray(snapshot.artifactConfiguration?.selectedPerkHashes)?snapshot.artifactConfiguration.selectedPerkHashes.length:0,
      manualEditCount:Array.isArray(snapshot.manualEdits)?snapshot.manualEdits.length:0
    },
    build:snapshot
  };
}

function validateParadoxLoadoutRecord(value){
  if(!value||value.schemaVersion!==RECORD_SCHEMA_VERSION||!String(value.id||'')||!text(value.name,MAX_NAME_LENGTH))return null;
  const binding=bindingOf(value.binding||value.build||{});
  if(!decimal(binding.characterId)||!decimal(binding.membershipId)||!/^\d+$/.test(binding.membershipType))return null;
  if(!value.build||!Array.isArray(value.build.weapons)||!Array.isArray(value.build.armour))return null;
  return {...clone(value),binding};
}

function readFallback(){
  try{
    const rows=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]');
    return Array.isArray(rows)?rows.map(validateStoredRecord).filter(Boolean):[];
  }catch{return [];}
}

function writeFallback(rows){
  try{localStorage.setItem(FALLBACK_KEY,JSON.stringify(rows));return true;}catch{return false;}
}

function openDatabase(){
  if(typeof indexedDB==='undefined')return Promise.resolve(null);
  return new Promise(resolve=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
}

async function databaseRequest(mode,operation,fallback){
  const db=await openDatabase();
  if(!db)return fallback();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,mode),store=transaction.objectStore(STORE_NAME);
    const failed=()=>{db.close();try{resolve(fallback());}catch(error){reject(error);}};
    let request=null,result;
    try{request=operation(store);}
    catch{failed();return;}
    if(request){request.onsuccess=()=>{result=request.result;};request.onerror=()=>{};}
    transaction.oncomplete=()=>{db.close();resolve(result);};
    transaction.onerror=failed;
    transaction.onabort=failed;
  });
}

// Sync intent lives in the same durable local record as the edit. A browser crash
// cannot commit an edit without also committing its pending upload/deletion.
function validateStoredRecord(value){
  if(value?._deleted&&String(value.id||'')&&decimal(value.binding?.membershipId)&&decimal(value.binding?.membershipType))return clone(value);
  return validateParadoxLoadoutRecord(value);
}
function newestLocal(left,right){
  if(!left)return right;if(!right)return left;
  return String(left.updatedAt)>String(right.updatedAt)?left:right;
}
async function readAllStored(){
  const rows=await databaseRequest('readonly',store=>store.getAll(),()=>[]),merged=new Map(readFallback().map(row=>[row.id,row]));
  for(const row of Array.isArray(rows)?rows:[]){const valid=validateStoredRecord(row);if(valid)merged.set(valid.id,newestLocal(merged.get(valid.id),valid));}
  return [...merged.values()];
}
async function readStored(id){
  const row=await databaseRequest('readonly',store=>store.get(id),()=>null);
  return newestLocal(readFallback().find(row=>row.id===id),validateStoredRecord(row))||null;
}
async function writeStored(record){
  const fallback=()=>{
    const rows=readFallback().filter(row=>row.id!==record.id);rows.push(record);
    if(!writeFallback(rows))throw new Error('This browser could not save the build. Free some storage and retry.');
    return record;
  };
  const result=await databaseRequest('readwrite',store=>store.put(record),fallback);
  // Remove an obsolete fallback only after IndexedDB has durably committed.
  if(typeof result==='string'){const rows=readFallback();if(rows.some(row=>row.id===record.id))writeFallback(rows.filter(row=>row.id!==record.id));}
  return record;
}
let localQueue=Promise.resolve();
function localLock(operation){
  if(globalThis.navigator?.locks)return navigator.locks.request('astrix-paradox-loadout-write',operation);
  const task=localQueue.then(operation);localQueue=task.catch(()=>{});return task;
}
function emitSync(type,detail){if(typeof window!=='undefined'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent(type,{detail}));}
let syncChannel=null,changeTimer=null,broadcastChange=false;
function changed(broadcast=true){
  if(typeof window==='undefined')return;
  broadcastChange=broadcastChange||broadcast;
  if(changeTimer)return;
  // Coalesce a large account import instead of rebuilding the page per record.
  changeTimer=setTimeout(()=>{changeTimer=null;emitSync('forge:paradox-loadouts-changed',{});if(broadcastChange)syncChannel?.postMessage('changed');broadcastChange=false;},500);
}
const pending=prior=>({version:Number(prior?._sync?.version||0),dirty:true,mutationId:newId()});

async function listParadoxLoadouts(){
  return (await readAllStored()).filter(row=>!row._deleted).sort((left,right)=>String(right.updatedAt).localeCompare(String(left.updatedAt)));
}
async function getParadoxLoadout(id){const row=await readStored(String(id||''));return row&&!row._deleted?row:null;}
async function saveParadoxLoadout(input={}){
  const record=await localLock(async()=>{
    const prior=input.id?await readStored(String(input.id)):null;
    // A draft can stay open while a newer remote revision arrives locally.
    // An unknown/stale edit base must become a copy rather than overwrite it.
    const fork=prior&&(prior._deleted||(input.expectedRevision!==undefined?input.expectedRevision!==prior.revision:Number(prior._sync?.version||0)>0));
    const value=createParadoxLoadoutRecord({...input,id:fork?null:input.id,name:fork?`${String(input.name).slice(0,64)} (conflict copy)`:input.name,createdAt:fork?null:prior?.createdAt,revision:fork?0:prior?.revision||0});
    if(prior&&!prior._deleted&&accountKey(prior.binding)!==accountKey(value.binding))throw new Error('This build belongs to another Bungie account.');
    value._sync=pending(fork?null:prior);
    return writeStored(value);
  });
  changed();scheduleParadoxSync();return record;
}
async function deleteParadoxLoadout(id,expectedRevision){
  const deleted=await localLock(async()=>{
    const prior=await readStored(String(id||''));if(!prior||prior._deleted)return false;
    if(expectedRevision!==undefined&&prior.revision!==expectedRevision)throw new Error('This build changed on another device. Review it before deleting.');
    await writeStored({...prior,_deleted:true,updatedAt:nowIso(),_sync:pending(prior)});return true;
  });
  if(deleted){changed();scheduleParadoxSync();}return deleted;
}
const accountKey=value=>`${value?.membershipType||''}:${value?.membershipId||''}`;
const wireRecord=row=>{const value=clone(row);delete value._sync;delete value._deleted;return value;};
const sameBuild=(a,b)=>a?.name===b?.name&&a?.description===b?.description&&JSON.stringify(a?.build)===JSON.stringify(b?.build);

// Dependency injection exercises the actual sync protocol with independent devices.
async function syncParadoxAccount({session,readAll=readAllStored,read=readStored,write=writeStored,lock=localLock,fetchImpl=globalThis.fetch?.bind(globalThis),signal,notify=changed,origin=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com'}={}){
  const account=session?.activeDestinyMembership;
  if(!session?.authenticated||!account?.membershipId||!session.csrfToken)return {state:'signed-out'};
  const key=accountKey(account),belongs=row=>accountKey(row?.binding)===key;
  const check=()=>{if(signal?.aborted)throw new Error('Sync interrupted by an account change.');};
  const request=async(params={},body=null)=>{
    check();const url=new URL('/paradox/loadouts',origin);
    for(const [name,value] of Object.entries({...params,membershipId:account.membershipId,membershipType:account.membershipType}))url.searchParams.set(name,String(value));
    const response=await fetchImpl(url,{method:body?'POST':'GET',credentials:'include',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),headers:{Accept:'application/json',...(body?{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
    check();const data=await response.json();
    if(!response.ok&&response.status!==409)throw new Error(response.status===413?'A build is too large to sync. Your local copy is safe.':`Background sync will retry (${response.status}).`);
    return {status:response.status,data};
  };
  const remoteRow=(remote,prior)=>{
    if(!remote||!Number.isSafeInteger(remote.version)||remote.version<1)throw new Error('Invalid cloud build version.');
    const record=remote.deleted?{id:remote.id,binding:prior?.binding||{...account},updatedAt:remote.updatedAt,_deleted:true}:validateParadoxLoadoutRecord(remote.record);
    if(!record||record.id!==remote.id||!belongs(record))throw new Error('Cloud build account mismatch.');
    return {...record,_sync:{version:remote.version,dirty:false}};
  };
  // One-time migration never pulls data from another locally cached membership.
  for(const row of await readAll())if(belongs(row)&&!row._sync)await lock(async()=>{
    check();const latest=await read(row.id);if(latest&&!latest._sync)await write({...latest,_sync:{...pending(null),legacy:true}});
  });
  let conflicts=0;
  for(const sent of await readAll()){
    if(!belongs(sent)||!sent._sync?.dirty)continue;
    const {status,data}=await request({id:sent.id},{baseVersion:sent._sync.version,mutationId:sent._sync.mutationId,deleted:Boolean(sent._deleted),record:sent._deleted?null:wireRecord(sent)});
    await lock(async()=>{
      check();const latest=await read(sent.id);if(!latest||!belongs(latest))return;
      const remote=status===409?data.current:data;
      const resolved=remoteRow(remote,latest);
      if(status===409){
        if(latest._sync?.mutationId!==sent._sync.mutationId&&Number(latest._sync?.version||0)>=remote.version)return;
        // Preserve a conflicting local edit under a deterministic new ID. Retrying
        // after a crash cannot create another copy of that same edit.
        if(latest._sync?.dirty&&!latest._deleted&&!(latest._sync.legacy&&remote.deleted)&&!sameBuild(latest,remote.record)){
          const id=`conflict-${latest._sync.mutationId}`;
          if(!await read(id))await write({...latest,id,name:`${latest.name.slice(0,64)} (conflict copy)`,_sync:{version:0,dirty:true,mutationId:newId(),conflictOf:sent.id}});
          conflicts++;
        }else if(latest._deleted&&!remote.deleted)conflicts++;
        await write(resolved);
      }else if(latest._sync?.mutationId===sent._sync.mutationId){
        await write(resolved);
      }else if(latest._sync?.dirty){
        // An edit made while its previous upload was in flight remains pending.
        await write({...latest,_sync:{...latest._sync,version:Math.max(latest._sync.version,remote.version)}});
      }
    });
    notify();
  }
  let cursor='';
  do{
    const {data}=await request(cursor?{cursor}:{});
    if(!Array.isArray(data.entries))throw new Error('Invalid cloud loadout list.');
    for(const meta of data.entries){
      const local=await read(meta.id);
      if(local?._sync?.dirty||Number(local?._sync?.version||0)>=meta.version)continue;
      const {data:remote}=await request({id:meta.id});
      await lock(async()=>{
        check();const latest=await read(meta.id);
        if(latest&&!belongs(latest))throw new Error('Local build account mismatch.');
        if(!latest?._sync?.dirty&&Number(latest?._sync?.version||0)<remote.version)await write(remoteRow(remote,latest));
      });
      notify();
    }
    if(data.cursor&&data.cursor===cursor)throw new Error('Cloud loadout list did not advance.');
    cursor=data.cursor||'';
  }while(cursor);
  const dirty=(await readAll()).some(row=>belongs(row)&&row._sync?.dirty);
  return {state:dirty?'pending':'synced',conflicts,account:key};
}

let syncTimer=null,syncRunning=false,syncAgain=false,syncAbort=null,retryDelay=5000,activeSyncAccount='',observedAccount='';
function scheduleParadoxSync(delay=250){
  if(typeof window==='undefined')return;
  if(syncRunning){syncAgain=true;return;}
  clearTimeout(syncTimer);syncTimer=setTimeout(runBackgroundSync,delay);
}
async function runBackgroundSync(){
  if(syncRunning)return;
  if(globalThis.navigator?.onLine===false){emitSync('forge:paradox-sync',{state:'offline'});scheduleParadoxSync(30000);return;}
  syncRunning=true;syncAgain=false;syncAbort=new AbortController();
  let next=60000;
  try{
    const {getBungieSession}=await import('../guardian-bungie-auth.mjs?v=20260913-live-character-2');
    const session=await getBungieSession({force:retryDelay>5000||!globalThis.FORGE_BUNGIE_SESSION?.authenticated});
    activeSyncAccount=session?.authenticated?accountKey(session.activeDestinyMembership):'';
    emitSync('forge:paradox-sync',{state:'syncing'});
    const result=await syncParadoxAccount({session,signal:syncAbort.signal});
    emitSync('forge:paradox-sync',result);retryDelay=5000;
    if(result.state==='pending')next=1000;
  }catch(error){
    emitSync('forge:paradox-sync',{state:'pending',message:error.message});
    next=retryDelay;retryDelay=Math.min(retryDelay*2,300000);
  }finally{
    syncRunning=false;syncAbort=null;activeSyncAccount='';scheduleParadoxSync(syncAgain?250:next);
  }
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('online',()=>scheduleParadoxSync());
  window.addEventListener('focus',()=>scheduleParadoxSync());
  window.addEventListener('storage',event=>{if(event.key===FALLBACK_KEY){changed();scheduleParadoxSync();}});
  window.addEventListener('forge:bungie-session',event=>{
    if(event.detail?.recovering)return;
    const next=event.detail?.authenticated?accountKey(event.detail.activeDestinyMembership):'';
    if(activeSyncAccount&&next!==activeSyncAccount)syncAbort?.abort();
    if(next!==observedAccount){observedAccount=next;scheduleParadoxSync();}
  });
  if(typeof BroadcastChannel!=='undefined'){
    syncChannel=new BroadcastChannel('astrix-paradox-loadouts');
    syncChannel.onmessage=()=>{changed(false);scheduleParadoxSync();};
  }
  scheduleParadoxSync();
}

export {
  RECORD_SCHEMA_VERSION,bindingOf,compactBuild,createParadoxLoadoutRecord,
  validateParadoxLoadoutRecord,listParadoxLoadouts,getParadoxLoadout,
  saveParadoxLoadout,deleteParadoxLoadout,syncParadoxAccount,scheduleParadoxSync
};
