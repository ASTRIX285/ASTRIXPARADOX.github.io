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
    return Array.isArray(rows)?rows.map(validateParadoxLoadoutRecord).filter(Boolean):[];
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
  return new Promise(resolve=>{
    const transaction=db.transaction(STORE_NAME,mode),store=transaction.objectStore(STORE_NAME);
    let request=null,result;
    try{request=operation(store);}
    catch{db.close();resolve(fallback());return;}
    if(request){request.onsuccess=()=>{result=request.result;};request.onerror=()=>{};}
    transaction.oncomplete=()=>{db.close();resolve(result);};
    transaction.onerror=()=>{db.close();resolve(fallback());};
    transaction.onabort=()=>{db.close();resolve(fallback());};
  });
}

async function listParadoxLoadouts(){
  const rows=await databaseRequest('readonly',store=>store.getAll(),readFallback);
  return (Array.isArray(rows)?rows:[]).map(validateParadoxLoadoutRecord).filter(Boolean).sort((left,right)=>String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function getParadoxLoadout(id){
  const key=String(id||'');
  if(!key)return null;
  const row=await databaseRequest('readonly',store=>store.get(key),()=>readFallback().find(value=>value.id===key)||null);
  return validateParadoxLoadoutRecord(row);
}

async function saveParadoxLoadout(input={}){
  const prior=input.id?await getParadoxLoadout(input.id):null;
  const record=createParadoxLoadoutRecord({...input,createdAt:prior?.createdAt,revision:prior?.revision||0});
  const fallback=()=>{
    const rows=readFallback(),index=rows.findIndex(row=>row.id===record.id);
    if(index>=0)rows[index]=record;else rows.push(record);
    return writeFallback(rows)?record:null;
  };
  const saved=await databaseRequest('readwrite',store=>store.put(record),fallback);
  if(saved===null)return null;
  return record;
}

async function deleteParadoxLoadout(id){
  const key=String(id||'');
  if(!key)return false;
  const fallback=()=>{
    const rows=readFallback(),next=rows.filter(row=>row.id!==key);
    return rows.length!==next.length&&writeFallback(next);
  };
  const result=await databaseRequest('readwrite',store=>store.delete(key),fallback);
  return result!==false;
}

export {
  RECORD_SCHEMA_VERSION,
  bindingOf,
  compactBuild,
  createParadoxLoadoutRecord,
  validateParadoxLoadoutRecord,
  listParadoxLoadouts,
  getParadoxLoadout,
  saveParadoxLoadout,
  deleteParadoxLoadout
};
