const DEFAULT_AUTH_ORIGIN=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com';
const VAULT_BUCKET=138197802;
const POSTMASTER_BUCKET=215593132;
const SOCIAL_ACTIVITY_MODE_TYPE=40;

const EMPTY_LIVE_ACTION_CAPABILITIES=Object.freeze({
  captureSnapshot:false,
  transferItems:false,
  equipItems:false,
  verifyEquipment:false,
  insertSocketPlugFree:false,
  verifyFinalState:false,
  equipLoadout:false,
  snapshotLoadout:false,
  updateLoadoutIdentifiers:false,
  clearLoadout:false
});
const ACTION_THROTTLE_MS=250;
const SOCKET_THROTTLE_MS=550;
const THROTTLE_RETRY_LIMIT=2;
const TRANSFER_READBACK_DELAYS_MS=Object.freeze([250,500,1000]);

const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const decimal=value=>/^\d+$/.test(String(value??''));

function sessionBinding(session={}){
  const membership=session.activeDestinyMembership||{};
  return {membershipId:String(membership.membershipId||session.primaryMembershipId||''),membershipType:String(membership.membershipType??'')};
}

function liveActionCapabilities(session={}){
  const advertised=session?.capabilities?.destinyActions||session?.liveActionCapabilities||{};
  return Object.fromEntries(Object.keys(EMPTY_LIVE_ACTION_CAPABILITIES).map(key=>[key,advertised[key]===true]));
}

function assertSessionBinding(plan,session){
  const binding=sessionBinding(session);
  if(!session?.authenticated||!session.csrfToken)throw new Error('Reconnect Bungie before applying live changes.');
  if(binding.membershipId!==String(plan.membershipId||'')||binding.membershipType!==String(plan.membershipType??''))throw new Error('The current Destiny membership does not match this Working Build.');
  if(!decimal(plan.characterId))throw new Error('The Working Build has no valid Guardian binding.');
  return binding;
}

function assertAdvertisedPlanCapabilities(plan,session){
  const advertised=liveActionCapabilities(session);
  const missing=(plan?.phases||[]).filter(phase=>phase?.required===true&&advertised[phase.capability]!==true).map(phase=>phase.label||phase.capability);
  if(missing.length)throw new Error(`The Bungie route no longer supports: ${missing.join(', ')}.`);
  return advertised;
}

async function responsePayload(response){
  const payload=await response.json().catch(()=>({}));
  const bungieError=payload?.ErrorCode!==undefined&&Number(payload.ErrorCode)!==1;
  if(!response.ok||bungieError){
    const error=new Error(payload?.Message||payload?.error||`Bungie action failed (${response.status}).`);
    error.status=response.status;
    error.payload=payload;
    throw error;
  }
  return payload;
}

async function requestAction(path,body,{session,fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN}={}){
  if(!session?.csrfToken)throw new Error('The Bungie session is missing its live-action token. Reconnect Bungie.');
  const response=await fetchImpl(new URL(path,authOrigin),{
    method:'POST',credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)
  });
  return responsePayload(response);
}

function isExplicitThrottle(error){
  const payload=error?.payload||{},status=String(payload?.ErrorStatus||payload?.error||'').toLowerCase();
  return Number(error?.status)===429||Number(payload?.ThrottleSeconds)>0||status.includes('throttl');
}

function throttleDelay(error){
  const advertised=Number(error?.payload?.ThrottleSeconds);
  return Math.max(ACTION_THROTTLE_MS,Number.isFinite(advertised)&&advertised>0?Math.ceil(advertised*1000):ACTION_THROTTLE_MS);
}

async function requestActionWithThrottleRetry(path,body,{session,fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN,waitImpl=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),onRetry=()=>{}}={}){
  for(let attempt=0;attempt<=THROTTLE_RETRY_LIMIT;attempt+=1){
    try{return await requestAction(path,body,{session,fetchImpl,authOrigin});}
    catch(error){
      if(!isExplicitThrottle(error)||attempt===THROTTLE_RETRY_LIMIT)throw error;
      const delay=throttleDelay(error);onRetry({attempt:attempt+1,delay,error});await waitImpl(delay);
    }
  }
  throw new Error('Bungie action retry limit reached.');
}

async function requestFreshProfile({fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN}={}){
  const url=new URL('/bungie/profile',authOrigin);url.searchParams.set('scope','character');url.searchParams.set('definitions','client-manifest');
  const response=await fetchImpl(url,{credentials:'include',headers:{Accept:'application/json'}});
  return responsePayload(response);
}

function inventoryLocations(payload={}){
  const profile=payload.profile||payload.Response||{},locations=new Map(),put=(item,source)=>{
    const id=String(item?.itemInstanceId||'');if(!id)return;
    locations.set(id,{itemInstanceId:id,itemHash:Number(item.itemHash),bucketHash:Number(item.bucketHash),source});
  };
  for(const item of profile?.profileInventory?.data?.items||[])put(item,{kind:Number(item?.bucketHash)===VAULT_BUCKET?'vault':'profile',characterId:null});
  for(const [characterId,row] of Object.entries(profile?.characterInventories?.data||{}))for(const item of row?.items||[])put(item,{kind:Number(item?.bucketHash)===POSTMASTER_BUCKET?'postmaster':'carried',characterId:String(characterId)});
  for(const [characterId,row] of Object.entries(profile?.characterEquipment?.data||{}))for(const item of row?.items||[])put(item,{kind:'equipped',characterId:String(characterId)});
  return {profile,locations};
}

function freshTransferSteps(plan,payload){
  const {locations}=inventoryLocations(payload),steps=[],blockers=[];
  for(const target of plan?.equipment?.targets||[]){
    const location=locations.get(String(target.itemInstanceId||''));
    if(!location){blockers.push(`${target.name} is no longer present in the Bungie account inventory.`);continue;}
    if(Number.isInteger(Number(target.itemHash))&&Number(location.itemHash)!==Number(target.itemHash)){blockers.push(`${target.name} no longer matches its saved Bungie item identity.`);continue;}
    const source=location.source,sourceCharacterId=String(source.characterId||''),targetCharacterId=String(plan.characterId||'');
    if(['equipped','carried'].includes(source.kind)&&sourceCharacterId===targetCharacterId)continue;
    if(['vault','profile'].includes(source.kind)){steps.push({itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId:targetCharacterId,transferToVault:false,label:`Move ${target.name} from Vault to target Guardian`});continue;}
    if(source.kind==='carried'&&sourceCharacterId&&sourceCharacterId!==targetCharacterId){steps.push({itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId:sourceCharacterId,transferToVault:true,label:`Move ${target.name} from source Guardian to Vault`},{itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId:targetCharacterId,transferToVault:false,label:`Move ${target.name} from Vault to target Guardian`});continue;}
    if(source.kind==='equipped')blockers.push(`${target.name} is equipped on another Guardian. Unequip it there before retrying.`);
    else if(source.kind==='postmaster')blockers.push(`${target.name} must be collected from Postmaster before retrying.`);
    else blockers.push(`${target.name} has an unsupported inventory location.`);
  }
  return {steps,blockers};
}

function freshSocketChanges(plan,payload){
  const {profile,locations}=inventoryLocations(payload),targetIds=new Set((plan?.equipment?.targets||[]).map(row=>String(row.itemInstanceId||''))),changes=[],alreadyApplied=[],blockers=[];
  const reusable=profile?.itemComponents?.reusablePlugs?.data||{},sockets=profile?.itemComponents?.sockets?.data||{};
  for(const change of plan?.socketChanges||[]){
    const itemInstanceId=String(change?.itemInstanceId||''),socketIndex=Number(change?.socketIndex),plugHash=Number(change?.plugHash),label=`${change?.plugName||plugHash} on ${change?.itemName||itemInstanceId}`;
    if(!targetIds.has(itemInstanceId)){blockers.push(`${label} is not attached to an exact equipment target in this Working Build.`);continue;}
    if(!locations.has(itemInstanceId)){blockers.push(`${label} cannot be checked because its exact item instance is no longer owned.`);continue;}
    const current=Number(sockets?.[itemInstanceId]?.sockets?.[socketIndex]?.plugHash);
    if(current===plugHash){alreadyApplied.push(change);continue;}
    const options=reusable?.[itemInstanceId]?.plugs?.[String(socketIndex)]||[];
    const compatible=(Array.isArray(options)?options:[]).some(option=>Number(option?.plugItemHash??option?.plugHash)===plugHash&&option?.canInsert===true&&option?.enabled!==false);
    if(!compatible){blockers.push(`${label} is not currently exposed as a free, reversible choice for that exact item socket.`);continue;}
    changes.push(change);
  }
  return {changes,alreadyApplied,blockers};
}

function characterActivityRestriction(plan,payload){
  const profile=payload.profile||payload.Response||{},component=profile?.characterActivities;
  if(!component||!component.data||typeof component.data!=='object')return {allowed:false,state:'unverified',reason:'Apply was blocked because Bungie did not return CharacterActivities (component 204) for this fresh profile.'};
  const activity=component.data[String(plan.characterId)]||null,currentActivityHash=Number(activity?.currentActivityHash)||0,currentActivityModeType=Number(activity?.currentActivityModeType)||0,currentActivityModeTypes=[currentActivityModeType,...(Array.isArray(activity?.currentActivityModeTypes)?activity.currentActivityModeTypes:[])].map(Number).filter(Number.isInteger);
  if(!activity||currentActivityHash===0)return {allowed:true,state:activity?'orbit':'offline',currentActivityHash,currentActivityModeType,reason:''};
  if(currentActivityModeTypes.includes(SOCIAL_ACTIVITY_MODE_TYPE))return {allowed:true,state:'social-space',currentActivityHash,currentActivityModeType,currentActivityModeTypes,reason:''};
  return {allowed:false,state:'active-activity',currentActivityHash,currentActivityModeType,reason:`Apply is blocked while this Guardian is in activity ${currentActivityHash}. Return to orbit, a social space, or go offline before retrying.`};
}

const LIVE_PREFLIGHT_ORDER=Object.freeze(['guardian','ownership','instance-location','compatibility','exotic','socket-legality','activity-state']);
function freshLivePlanInspection(plan,payload,advertised={}){
  const {profile,locations}=inventoryLocations(payload),targets=plan?.equipment?.targets||[],checks=[];
  const add=(key,label,blockers=[],detail={})=>checks.push({key,label,status:blockers.length?'blocked':'passed',blockers:[...new Set(blockers)],detail});

  const characters=profile?.characters?.data||{},characterId=String(plan.characterId||''),guardianBlockers=Object.hasOwn(characters,characterId)?[]:[`Guardian ${characterId} is not present in the latest Bungie profile.`];
  add('guardian','Guardian binding',guardianBlockers,{characterId});

  const ownershipBlockers=[];
  for(const target of targets){
    const location=locations.get(String(target.itemInstanceId||''));
    if(!location)ownershipBlockers.push(`${target.name} is no longer present in the Bungie account inventory.`);
    else if(Number.isInteger(Number(target.itemHash))&&Number(location.itemHash)!==Number(target.itemHash))ownershipBlockers.push(`${target.name} no longer matches its saved Bungie item identity.`);
  }
  add('ownership','Exact item ownership',ownershipBlockers,{targetCount:targets.length,ownedTargetCount:targets.length-ownershipBlockers.length});

  const resolved=freshTransferSteps(plan,payload),locationBlockers=[...resolved.blockers];
  if(plan.kind==='weapon-perk-only'&&resolved.steps.length)locationBlockers.push('This weapon moved. Refresh its card before changing perks.');
  if(resolved.steps.length&&advertised.transferItems!==true)locationBlockers.push('Fresh inventory state requires item transfer, but the Bungie route does not advertise that capability.');
  add('instance-location','Exact item locations',locationBlockers,{transferCount:resolved.steps.length});

  const compatibilityBlockers=[];
  for(const target of targets){
    const location=locations.get(String(target.itemInstanceId||'')),expectedBucket=Number(target.bucketHash),liveBucket=Number(location?.bucketHash);
    if(location&&['carried','equipped'].includes(location.source.kind)&&Number.isInteger(expectedBucket)&&Number.isInteger(liveBucket)&&liveBucket!==expectedBucket)compatibilityBlockers.push(`${target.name} no longer matches its staged Destiny equipment bucket.`);
  }
  add('compatibility','Guardian and equipment compatibility',compatibilityBlockers,{targetCount:targets.length});

  const weaponExotics=targets.filter(row=>row.kind==='weapon'&&row.isExotic).length,armourExotics=targets.filter(row=>row.kind==='armour'&&row.isExotic).length,exoticBlockers=[];
  if(weaponExotics>1)exoticBlockers.push('Destiny permits only one Exotic weapon.');
  if(armourExotics>1)exoticBlockers.push('Destiny permits only one Exotic armour piece.');
  add('exotic','Destiny Exotic limits',exoticBlockers,{weaponExotics,armourExotics});

  const resolvedSockets=freshSocketChanges(plan,payload),socketBlockers=[...resolvedSockets.blockers];
  if(resolvedSockets.changes.length&&advertised.insertSocketPlugFree!==true)socketBlockers.push('Fresh socket state requires a socket mutation, but the Bungie route does not advertise that capability.');
  add('socket-legality','Exact socket legality',socketBlockers,{changeCount:resolvedSockets.changes.length,alreadyAppliedCount:resolvedSockets.alreadyApplied.length});

  const activity=characterActivityRestriction(plan,payload),activityBlockers=activity.allowed?[]:[activity.reason];
  add('activity-state','Guardian activity state',activityBlockers,{state:activity.state,currentActivityHash:activity.currentActivityHash||0});

  const blockers=checks.flatMap(row=>row.blockers);
  return {checks,blockers,resolved,resolvedSockets,activity};
}

async function stageLiveTransferPreflight(plan,{session,fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN}={}){
  if(!plan?.ready||plan?.status!=='staged')throw new Error(plan?.blockers?.[0]||'A ready staged Working Build is required for live preflight.');
  assertSessionBinding(plan,session);
  const advertised=assertAdvertisedPlanCapabilities(plan,session),fresh=await requestFreshProfile({fetchImpl,authOrigin}),inspection=freshLivePlanInspection(plan,fresh,advertised),ready=inspection.blockers.length===0;
  return {...clone(plan),status:ready?'staged':'blocked',ready,blockers:[...new Set([...(plan.blockers||[]),...inspection.blockers])],livePreflight:{schemaVersion:1,source:'authenticated-fresh-profile',checkedAt:new Date().toISOString(),status:ready?'passed':'blocked',validationOrder:[...LIVE_PREFLIGHT_ORDER],checks:inspection.checks}};
}

function verifyEquippedItems(plan,payload){
  const profile=payload.profile||payload.Response||{},equipment=profile?.characterEquipment?.data?.[String(plan.characterId)]?.items||[],equippedIds=new Set(equipment.map(row=>String(row?.itemInstanceId||'')).filter(Boolean));
  const missingEquipment=(plan?.equipment?.targets||[]).filter(row=>!equippedIds.has(String(row.itemInstanceId))).map(row=>({itemInstanceId:row.itemInstanceId,name:row.name,kind:row.kind}));
  return {verified:missingEquipment.length===0,missingEquipment,equippedInstanceIds:[...equippedIds]};
}

function verifyItemsReadyToEquip(plan,payload){
  const {locations}=inventoryLocations(payload),characterId=String(plan.characterId||''),readyInstanceIds=[],missingEquipment=[];
  for(const target of plan?.equipment?.targets||[]){
    const location=locations.get(String(target.itemInstanceId||'')),onTarget=location&&['carried','equipped'].includes(location.source.kind)&&String(location.source.characterId||'')===characterId;
    if(onTarget)readyInstanceIds.push(String(target.itemInstanceId));
    else missingEquipment.push({itemInstanceId:target.itemInstanceId,name:target.name,kind:target.kind,location:location?.source||null});
  }
  return {verified:missingEquipment.length===0,missingEquipment,readyInstanceIds};
}

async function waitForItemsReadyToEquip(plan,{fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN,waitImpl=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}={}){
  let verification={verified:false,missingEquipment:[],readyInstanceIds:[]};
  for(const delay of TRANSFER_READBACK_DELAYS_MS){
    await waitImpl(delay);
    verification=verifyItemsReadyToEquip(plan,await requestFreshProfile({fetchImpl,authOrigin}));
    if(verification.verified)return verification;
  }
  return verification;
}

function verifyReadback(plan,payload){
  const equipment=plan.kind==='weapon-perk-only'?verifyItemsReadyToEquip(plan,payload):verifyEquippedItems(plan,payload),profile=payload.profile||payload.Response||{};
  const sockets=profile?.itemComponents?.sockets?.data||{},socketMismatches=(plan.socketChanges||[]).filter(change=>Number(sockets?.[change.itemInstanceId]?.sockets?.[change.socketIndex]?.plugHash)!==Number(change.plugHash)).map(change=>({itemInstanceId:change.itemInstanceId,itemName:change.itemName,socketIndex:change.socketIndex,expectedPlugHash:change.plugHash,actualPlugHash:Number(sockets?.[change.itemInstanceId]?.sockets?.[change.socketIndex]?.plugHash)||null}));
  return {...equipment,verified:equipment.verified&&socketMismatches.length===0,socketMismatches};
}

function equipResponseFailures(payload,itemIds=[]){
  const rows=payload?.Response?.equipResults;
  if(!Array.isArray(rows))return itemIds.map(value=>({itemInstanceId:String(value),equipStatus:null,reason:'missing-equip-results'}));
  const byId=new Map(rows.map(row=>[String(row?.itemInstanceId||''),row]));
  return itemIds.map(value=>String(value)).map(itemInstanceId=>{
    const row=byId.get(itemInstanceId),equipStatus=Number(row?.equipStatus);
    if(row&&equipStatus===1)return null;
    return {itemInstanceId,equipStatus:Number.isInteger(equipStatus)?equipStatus:null,reason:row?'bungie-equip-status':'missing-equip-result'};
  }).filter(Boolean);
}

function confirmLiveTransferPlan(plan){
  if(!plan?.ready||plan?.status!=='staged')throw new Error(plan?.blockers?.[0]||'The Working Build is not ready for Apply.');
  return {...clone(plan),status:'confirmed',confirmedAt:new Date().toISOString()};
}

async function executeLiveTransferPlan(plan,{session,fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN,onProgress=()=>{},waitImpl=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}={}){
  if(!plan?.ready||plan?.status!=='confirmed'||!plan?.confirmedAt)throw new Error('Final user confirmation is required before Apply can contact Bungie mutation routes.');
  const binding=assertSessionBinding(plan,session),advertised=assertAdvertisedPlanCapabilities(plan,session);
  const result={schemaVersion:1,kind:'destiny-live-apply-result',status:'running',startedAt:new Date().toISOString(),characterId:plan.characterId,membershipId:binding.membershipId,steps:[],inGameSteps:clone(plan.inGameSteps||[]),readback:null};
  let fresh=null,equipmentApplied=false;
  const record=(phase,status,label,detail=null)=>{const row={phase,status,label,at:new Date().toISOString(),detail};result.steps.push(row);onProgress(row);return row;};
  let mutationStarted=false;
  const mutate=async(path,body,{gap=ACTION_THROTTLE_MS,label='Bungie action'}={})=>{
    if(mutationStarted)await waitImpl(gap);
    mutationStarted=true;
    return requestActionWithThrottleRetry(path,body,{session,fetchImpl,authOrigin,waitImpl,onRetry:({attempt,delay})=>onProgress({phase:'throttle',status:'retrying',label:`${label} paused for ${delay} ms before retry ${attempt}.`})});
  };
  try{
    onProgress({phase:'snapshot',status:'running',label:'Reading fresh Bungie ownership and equipment…'});
    fresh=await requestFreshProfile({fetchImpl,authOrigin});
    const inspection=freshLivePlanInspection(plan,fresh,advertised),{activity,resolved,resolvedSockets}=inspection,freshBlockers=inspection.blockers;
    if(freshBlockers.length){record('snapshot','blocked','Fresh activity, ownership or socket compatibility validation blocked Apply.',freshBlockers);result.status='blocked';result.finishedAt=new Date().toISOString();return result;}
    record('snapshot','complete','Fresh Bungie activity, ownership, equipment and socket compatibility captured.',{validationOrder:inspection.checks.map(row=>row.key),activityState:activity.state,targetCount:plan.equipment.targets.length,transferCount:resolved.steps.length,socketChangeCount:resolvedSockets.changes.length,socketsAlreadyApplied:resolvedSockets.alreadyApplied.length});

    for(const step of resolved.steps){
      try{
        onProgress({phase:'transfer',status:'running',label:step.label});
        const payload=await mutate('/bungie/actions/transfer-item',{membershipType:Number(plan.membershipType),characterId:step.characterId,itemId:step.itemInstanceId,itemReferenceHash:step.itemHash,stackSize:1,transferToVault:step.transferToVault},{label:step.label});
        record('transfer','complete',step.label,{ErrorCode:payload?.ErrorCode??1});
      }catch(error){record('transfer','failed',step.label,{message:error.message,payload:error.payload||null});result.status='partial';result.finishedAt=new Date().toISOString();return result;}
    }

    if(resolved.steps.length){
      onProgress({phase:'verify-transfer',status:'running',label:'Confirming every selected item is ready on the target Guardian…'});
      const transferVerification=await waitForItemsReadyToEquip(plan,{fetchImpl,authOrigin,waitImpl});
      if(!transferVerification.verified){record('verify-transfer','mismatch','Not every selected item reached the target Guardian, so equip was not started.',transferVerification);result.status='partial';result.finishedAt=new Date().toISOString();return result;}
      record('verify-transfer','complete','Every selected item is ready on the target Guardian for the exact equip request.',transferVerification);
    }

    if(plan.kind==='weapon-perk-only')equipmentApplied=true;
    else try{
      onProgress({phase:'equip',status:'running',label:'Equipping exact Working Build items…'});
      const itemIds=(plan.equipment.targets||[]).map(row=>row.itemInstanceId);
      const payload=await mutate('/bungie/actions/equip-items',{membershipType:Number(plan.membershipType),characterId:plan.characterId,itemIds},{label:'Equip exact Working Build items'});
      const failures=equipResponseFailures(payload,itemIds);
      if(failures.length)record('equip','failed','Bungie reported one or more exact equipment failures; socket changes were skipped.',{itemIds,failures,ErrorCode:payload?.ErrorCode??1});
      else{equipmentApplied=true;record('equip','complete','Exact Working Build equipment request completed.',{itemIds,ErrorCode:payload?.ErrorCode??1});}
    }catch(error){record('equip','failed','Exact Working Build equipment request failed.',{message:error.message,payload:error.payload||null});}

    if(equipmentApplied&&plan.kind!=='weapon-perk-only'){
      try{
        onProgress({phase:'verify-equipment',status:'running',label:'Verifying equipped items from a fresh Bungie profile…'});
        const equippedProfile=await requestFreshProfile({fetchImpl,authOrigin}),verification=verifyEquippedItems(plan,equippedProfile);
        if(verification.verified)record('verify-equipment','complete','Fresh profile confirms every expected item is equipped.',verification);
        else{equipmentApplied=false;record('verify-equipment','mismatch','Fresh profile did not confirm every expected item; all socket changes were skipped.',verification);}
      }catch(error){equipmentApplied=false;record('verify-equipment','failed','Fresh equipped-item verification failed; all socket changes were skipped.',{message:error.message});}
    }

    if(equipmentApplied){
      const weaponSocketChanges=resolvedSockets.changes.filter(change=>change.component!=='armour-mod'),armourModChanges=resolvedSockets.changes.filter(change=>change.component==='armour-mod');
      const applySocketPhase=async(changes,phase,phaseLabel)=>{
        for(const change of changes){
          const label=`${phaseLabel}: set ${change.plugName||change.plugHash} on ${change.itemName||change.itemInstanceId}`;
          try{
            onProgress({phase,status:'running',label});
            const payload=await mutate('/bungie/actions/socket-plug-free',{membershipType:Number(plan.membershipType),characterId:plan.characterId,itemId:change.itemInstanceId,plug:{socketIndex:change.socketIndex,socketArrayType:change.socketArrayType??0,plugItemHash:change.plugHash}},{gap:SOCKET_THROTTLE_MS,label});
            record(phase,'complete',label,{ErrorCode:payload?.ErrorCode??1});
          }catch(error){record(phase,'failed',label,{message:error.message,payload:error.payload||null});return false;}
        }
        return true;
      };
      const weaponsApplied=await applySocketPhase(weaponSocketChanges,'weapon-sockets','Weapon/socket phase');
      if(weaponsApplied)await applySocketPhase(armourModChanges,'armour-mods','Armour-mod phase');
    }
  }finally{
    try{
      onProgress({phase:'readback',status:'running',label:'Reading back final Bungie state…'});
      const payload=await requestFreshProfile({fetchImpl,authOrigin}),verification=verifyReadback(plan,payload);
      result.readback=verification;record('readback',verification.verified?'complete':'mismatch',verification.verified?'Final Bungie state matches every remotely applied target.':'Final Bungie state differs from one or more requested targets.',verification);
    }catch(error){record('readback','failed','Final Bungie readback failed.',{message:error.message});}
  }
  const failures=result.steps.filter(row=>['failed','mismatch','blocked'].includes(row.status));
  result.status=!failures.length&&result.readback?.verified?'applied':'partial';
  result.finishedAt=new Date().toISOString();
  return result;
}

const LOADOUT_ACTION_PATHS=Object.freeze({equip:'/bungie/actions/loadout/equip',snapshot:'/bungie/actions/loadout/snapshot',identifiers:'/bungie/actions/loadout/identifiers',clear:'/bungie/actions/loadout/clear'});
function stageBungieLoadoutAction(action,{characterId,index,loadoutName=''}={}){
  if(!LOADOUT_ACTION_PATHS[action])throw new TypeError('Unsupported Bungie loadout action.');
  if(!decimal(characterId)||!Number.isInteger(Number(index))||Number(index)<0||Number(index)>19)throw new TypeError('A valid Guardian and Bungie loadout slot are required.');
  return {schemaVersion:1,kind:'bungie-loadout-action-intent',status:'staged',action,characterId:String(characterId),index:Number(index),loadoutName:String(loadoutName||''),requiresUserConfirmation:true,confirmedAt:null};
}
function confirmBungieLoadoutAction(intent){
  if(intent?.kind!=='bungie-loadout-action-intent'||intent?.status!=='staged'||!intent?.requiresUserConfirmation)throw new Error('A staged in-game loadout action is required before confirmation.');
  return {...clone(intent),status:'confirmed',confirmedAt:new Date().toISOString()};
}
async function executeBungieLoadoutAction(action,{characterId,index,session,confirmation=null,identifiers={},fetchImpl=fetch,authOrigin=DEFAULT_AUTH_ORIGIN}={}){
  const path=LOADOUT_ACTION_PATHS[action];
  if(!path)throw new TypeError('Unsupported Bungie loadout action.');
  if(!decimal(characterId)||!Number.isInteger(Number(index))||Number(index)<0||Number(index)>19)throw new TypeError('A valid Guardian and Bungie loadout slot are required.');
  if(confirmation?.kind!=='bungie-loadout-action-intent'||confirmation?.status!=='confirmed'||!confirmation?.confirmedAt||confirmation.action!==action||confirmation.characterId!==String(characterId)||confirmation.index!==Number(index))throw new Error('Final user confirmation is required before changing an in-game Bungie loadout slot.');
  const binding=sessionBinding(session);if(!session?.authenticated||!session.csrfToken||!decimal(binding.membershipType))throw new Error('Reconnect Bungie before changing an in-game loadout.');
  const capability={equip:'equipLoadout',snapshot:'snapshotLoadout',identifiers:'updateLoadoutIdentifiers',clear:'clearLoadout'}[action];
  if(!liveActionCapabilities(session)[capability])throw new Error('The Bungie session has not advertised support for this in game loadout action.');
  const body={membershipType:Number(binding.membershipType),characterId:String(characterId),loadoutIndex:Number(index)};
  for(const key of ['colorHash','iconHash','nameHash'])if(Number.isInteger(Number(identifiers[key])))body[key]=Number(identifiers[key]);
  return requestAction(path,body,{session,fetchImpl,authOrigin});
}

export {EMPTY_LIVE_ACTION_CAPABILITIES,ACTION_THROTTLE_MS,SOCKET_THROTTLE_MS,THROTTLE_RETRY_LIMIT,TRANSFER_READBACK_DELAYS_MS,SOCIAL_ACTIVITY_MODE_TYPE,LIVE_PREFLIGHT_ORDER,liveActionCapabilities,sessionBinding,assertAdvertisedPlanCapabilities,inventoryLocations,freshTransferSteps,freshSocketChanges,characterActivityRestriction,verifyItemsReadyToEquip,verifyEquippedItems,verifyReadback,equipResponseFailures,stageLiveTransferPreflight,confirmLiveTransferPlan,requestAction,requestFreshProfile,executeLiveTransferPlan,stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction};
