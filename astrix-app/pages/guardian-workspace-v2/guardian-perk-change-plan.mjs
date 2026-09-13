const clone=value=>value==null?value:structuredClone(value);
const WEAPON_BUCKETS=[1498876634,2465295065,953998645];
const ARMOUR_BUCKETS=[3448274439,3551918588,14239492,20886954,1585787867];
const SUBCLASS_BUCKET=3284755031;
const CLASS_TYPES={titan:0,hunter:1,warlock:2};

const hashOf=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
const itemIdOf=item=>String(item?.itemInstanceId||item?.instanceId||'');
const itemName=item=>String(item?.name||item?.displayName||'Destiny item');
const sourceOf=item=>item?.source&&typeof item.source==='object'?item.source:{};
const exotic=item=>item?.isExotic===true||String(item?.tier||item?.rarity||'').toLowerCase().includes('exotic');
const exactRemoteSocketEvidence=option=>option?.remoteInsertEvidence==='exact-item-reusable-plug'||option?.source==='bungie-item-reusable-plugs';
const SUBCLASS_KEYS=['arc','solar','void','stasis','strand','prismatic'];

function subclassKey(value={}){
  const label=[value?.element,value?.subclass,value?.key,value?.name,value?.displayName,value?.definition?.displayProperties?.name].filter(Boolean).join(' ').toLowerCase();
  return SUBCLASS_KEYS.find(key=>label.includes(key))||'';
}

function selectedSubclassItem(build={}){
  const catalogue=Array.isArray(build.subclassCatalog)?build.subclassCatalog.filter(item=>itemIdOf(item)):[];
  const embedded=build.subclassItem&&itemIdOf(build.subclassItem)?build.subclassItem:null;
  const requestedId=String(build.subclassItemInstanceId||itemIdOf(embedded)||'');
  if(requestedId)return catalogue.find(item=>itemIdOf(item)===requestedId)||embedded;
  const requestedHash=hashOf(embedded);
  if(Number.isInteger(requestedHash)){
    const exactHash=catalogue.find(item=>hashOf(item)===requestedHash);
    if(exactHash)return exactHash;
  }
  const requestedKey=subclassKey({element:build.subclass,subclass:build.subclass,name:build.subclassName});
  return requestedKey?catalogue.find(item=>subclassKey(item)===requestedKey)||null:null;
}

function validChange(change){
  return /^\d+$/.test(String(change?.itemInstanceId||''))&&Number.isInteger(Number(change?.socketIndex))&&Number(change.socketIndex)>=0&&Number(change.socketIndex)<=99&&Number.isInteger(Number(change?.plugHash))&&Number(change.plugHash)>0;
}

function normalizedChange(change={},component='socket'){
  return {
    itemInstanceId:String(change.itemInstanceId||''),
    itemHash:Number.isInteger(Number(change.itemHash))?Number(change.itemHash):null,
    itemName:String(change.itemName||''),
    socketIndex:Number(change.socketIndex),
    socketArrayType:Number.isInteger(Number(change.socketArrayType))?Number(change.socketArrayType):0,
    plugHash:Number(change.plugHash),
    plugName:String(change.plugName||change.recommended?.name||''),
    currentPlugHash:Number.isInteger(Number(change.currentPlugHash))?Number(change.currentPlugHash):null,
    component:String(change.component||component),
    source:String(change.source||'bungie-reusable-plugs'),
    reversible:change.reversible!==false,
    remoteSupported:change.remoteSupported!==false
  };
}

function createPerkChangePlan({characterId,advice}={}){
  const changes=(advice?.stagedChanges||[]).filter(validChange).map(change=>normalizedChange(change,'weapon-perk'));
  return {schemaVersion:1,kind:'destiny-insert-socket-plug-free',status:'staged',createdAt:new Date().toISOString(),characterId:String(characterId||''),requiresUserConfirmation:true,confirmedAt:null,changes,remotePerkMutationSupported:Boolean(advice?.remotePerkMutationSupported)};
}

function booleanCapabilities(value={}){
  return {
    captureSnapshot:value.captureSnapshot===true,
    transferItems:value.transferItems===true||value.transferItem===true,
    equipItems:value.equipItems===true,
    verifyEquipment:value.verifyEquipment===true,
    insertSocketPlugFree:value.insertSocketPlugFree===true||value.insertWeaponPerks===true||value.insertArmourMods===true,
    verifyFinalState:value.verifyFinalState===true
  };
}

function equipmentTarget(item,kind,slotIndex){
  const source=sourceOf(item);
  return {
    kind,
    slotIndex,
    itemInstanceId:itemIdOf(item),
    itemHash:Number.isInteger(Number(item?.itemHash??item?.hash))?Number(item.itemHash??item.hash):null,
    bucketHash:Number.isInteger(Number(item?.bucketHash??item?.definition?.inventory?.bucketTypeHash))?Number(item.bucketHash??item.definition.inventory.bucketTypeHash):null,
    name:itemName(item),
    isExotic:exotic(item),
    classType:Number.isInteger(Number(item?.classType??item?.definition?.classType))?Number(item.classType??item.definition.classType):null,
    source:{kind:String(source.kind||''),characterId:source.characterId==null?null:String(source.characterId),label:String(source.label||'')}
  };
}

function transferStepsForTarget(target,characterId){
  const source=target.source||{},kind=String(source.kind||'').toLowerCase(),sourceCharacterId=String(source.characterId||'');
  if(['equipped','carried'].includes(kind)&&sourceCharacterId===characterId)return {steps:[],blocker:''};
  if(['vault','profile'].includes(kind))return {steps:[{itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId,transferToVault:false,label:`Move ${target.name} from Vault to target Guardian`}],blocker:''};
  if(kind==='carried'&&sourceCharacterId&&sourceCharacterId!==characterId)return {steps:[
    {itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId:sourceCharacterId,transferToVault:true,label:`Move ${target.name} from source Guardian to Vault`},
    {itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,characterId,transferToVault:false,label:`Move ${target.name} from Vault to target Guardian`}
  ],blocker:''};
  if(kind==='equipped'&&sourceCharacterId&&sourceCharacterId!==characterId)return {steps:[],blocker:`${target.name} is equipped on another Guardian. Unequip it there before applying this build.`};
  if(kind==='postmaster')return {steps:[],blocker:`${target.name} is in Postmaster and must be collected before it can be applied.`};
  return {steps:[],blocker:`${target.name} does not have verified owned-location evidence.`};
}

function subclassSelections(build={}){
  const sb=build.subclassBuild||{};
  return [sb.super,...(sb.abilities||[]),...(sb.aspects||[]),...(sb.fragments||[]),...(sb.transcendenceSlots||[]).map(row=>row?.equipped)].filter(Boolean);
}

function inferredSubclassChanges(build={},originalBuild={}){
  const subclassItem=selectedSubclassItem(build),originalSubclassItem=selectedSubclassItem(originalBuild);
  const itemInstanceId=itemIdOf(subclassItem),originalItemInstanceId=itemIdOf(originalSubclassItem);
  // Equipping a different subclass instance carries that instance's existing
  // configuration; do not also replay its current sockets against the old item.
  if(itemInstanceId&&originalItemInstanceId&&itemInstanceId!==originalItemInstanceId)return {changes:[],manual:[]};
  const beforeBySocket=new Map(subclassSelections(originalBuild).filter(row=>Number.isInteger(Number(row?.socketIndex))).map(row=>[Number(row.socketIndex),row]));
  const changes=[],manual=[];
  for(const row of subclassSelections(build)){
    const socketIndex=Number(row?.socketIndex),plugHash=hashOf(row);
    if(!Number.isInteger(socketIndex)||!Number.isInteger(plugHash))continue;
    const before=beforeBySocket.get(socketIndex),currentPlugHash=hashOf(before);
    if(Number.isInteger(currentPlugHash)&&currentPlugHash===plugHash)continue;
    const candidate=normalizedChange({itemInstanceId,itemHash:hashOf(subclassItem),itemName:build.subclassName||'Subclass',socketIndex,plugHash,plugName:itemName(row),currentPlugHash:Number.isInteger(currentPlugHash)?currentPlugHash:null,component:`subclass-${row.componentType||'socket'}`,source:row.source||'bungie-reusable-plugs',remoteSupported:row.canInsert===true&&exactRemoteSocketEvidence(row)},'subclass');
    if(candidate.itemInstanceId&&candidate.remoteSupported)changes.push(candidate);
    else manual.push(`Set ${itemName(row)} on ${build.subclassName||build.subclass||'the selected subclass'} in Destiny; a verified free socket mapping was not exposed.`);
  }
  return {changes,manual};
}

function generatedSocketChanges(build={},advice=null){
  const resolvedAdvice=advice||build.weaponRollAdvice||build.paradoxAnalysis?.weaponRollAdvice||{};
  const weapon=(resolvedAdvice.stagedChanges||[]).filter(validChange).map(change=>normalizedChange({...change,remoteSupported:change.remoteSupported===true&&exactRemoteSocketEvidence(change)},'weapon-perk'));
  const armour=(build.armourModRecommendation?.decisions||[]).filter(change=>change?.action&&change.action!=='KEEP').map(change=>normalizedChange({
    itemInstanceId:change.armourItemInstanceId,
    itemHash:change.armourItemHash,
    itemName:change.armourItemName,
    socketIndex:change.socketIndex,
    currentPlugHash:hashOf(change.current),
    plugHash:hashOf(change.recommended),
    plugName:itemName(change.recommended),
    component:'armour-mod',
    source:'bungie-reusable-plugs',
    remoteSupported:change.recommended?.canInsert===true&&exactRemoteSocketEvidence(change.recommended)
  },'armour-mod')).filter(validChange);
  return [...weapon,...armour];
}

function intendedArtifactStep(build={}){
  // Permanent Forge Artifact protection rule: intended Artifact changes stay
  // manual/in-game by design and never enter Apply; this is not a gap or TODO.
  const configuration=build.artifactConfiguration||{},intended=(configuration.selectedPerkHashes||[]).map(Number).filter(Number.isInteger).sort((a,b)=>a-b),current=(build.artifact?.activePerks||[]).filter(row=>row?.isActive!==false).map(hashOf).filter(Number.isInteger).sort((a,b)=>a-b);
  if(!intended.length||JSON.stringify(intended)===JSON.stringify(current))return '';
  return `Configure ${intended.length} intended perk${intended.length===1?'':'s'} on ${build.artifact?.name||'the Seasonal Artifact'} in Destiny. Artifact unlocks are preserved as an explicit in-game step.`;
}

function subclassCompatibilityViolations(build={}){
  const sb=build.subclassBuild||{},violations=[],aspects=(sb.aspects||[]).filter(Boolean),fragments=(sb.fragments||[]).filter(Boolean),abilities=(sb.abilities||[]).filter(Boolean),unique=rows=>new Set(rows.map(hashOf).filter(Number.isInteger)).size===rows.length;
  if(aspects.length>2)violations.push('The Working Build contains more than two subclass Aspects.');
  if(!unique(aspects))violations.push('The Working Build contains the same Aspect more than once.');
  if(!unique(fragments))violations.push('The Working Build contains the same Fragment more than once.');
  const fragmentLimit=aspects.reduce((sum,item)=>sum+Math.max(0,Number(item?.fragmentSlots)||0),0);
  if(fragmentLimit&&fragments.length>fragmentLimit)violations.push(`The selected Aspects expose ${fragmentLimit} Fragment slot${fragmentLimit===1?'':'s'}, but ${fragments.length} Fragments are staged.`);
  const abilitySockets=abilities.map(row=>Number(row?.socketIndex)).filter(Number.isInteger);
  if(new Set(abilitySockets).size!==abilitySockets.length)violations.push('The Working Build contains conflicting ability choices for the same subclass socket.');
  return violations;
}

function createLiveTransferPlan({build={},originalBuild={},advice=null,capabilities={}}={}){
  const supported=booleanCapabilities(capabilities),characterId=String(build.characterId||''),membershipId=String(build.membershipId||build.bungieMembershipId||''),membershipType=String(build.membershipType??'');
  const weapons=(build.weapons||[]).filter(Boolean),armour=(build.armour||[]).filter(Boolean),expectedClass=CLASS_TYPES[String(build.characterClass||'').toLowerCase()];
  const targets=[...weapons.map((item,index)=>equipmentTarget(item,'weapon',index)),...armour.map((item,index)=>equipmentTarget(item,'armour',index))];
  const subclassItem=selectedSubclassItem(build);
  if(subclassItem&&itemIdOf(subclassItem))targets.push(equipmentTarget(subclassItem,'subclass',0));
  const blockers=[];
  if(!/^\d+$/.test(characterId)||!/^\d+$/.test(membershipId)||!/^\d+$/.test(membershipType))blockers.push('The Working Build is not bound to a Bungie Guardian and Destiny membership.');
  if(weapons.length!==3)blockers.push('Three exact owned weapon instances are required before Apply.');
  if(armour.length!==5)blockers.push('Five exact armour instances are required before Apply.');
  if(targets.some(row=>!/^\d+$/.test(row.itemInstanceId)))blockers.push('Every applied item must have an exact owned Bungie instance ID.');
  if(targets.some(row=>!Number.isInteger(row.itemHash)||row.itemHash<0))blockers.push('Every applied item must retain its exact Bungie item hash.');
  if(new Set(targets.map(row=>row.itemInstanceId)).size!==targets.length)blockers.push('Each equipment target must use a distinct Bungie item instance.');
  weapons.forEach((item,index)=>{const bucket=Number(item?.bucketHash??item?.definition?.inventory?.bucketTypeHash);if(bucket!==WEAPON_BUCKETS[index])blockers.push(`Weapon slot ${index+1} does not match its Destiny equipment bucket.`);});
  armour.forEach((item,index)=>{const bucket=Number(item?.bucketHash??item?.definition?.inventory?.bucketTypeHash);if(bucket!==ARMOUR_BUCKETS[index])blockers.push(`Armour slot ${index+1} does not match its Destiny equipment bucket.`);});
  if(subclassItem){
    const bucket=Number(subclassItem?.bucketHash??subclassItem?.definition?.inventory?.bucketTypeHash),classType=Number(subclassItem?.classType??subclassItem?.definition?.classType);
    if(bucket!==SUBCLASS_BUCKET)blockers.push('The selected subclass item does not match Destiny’s subclass equipment bucket.');
    if(Number.isInteger(expectedClass)&&Number.isInteger(classType)&&classType!==3&&classType!==expectedClass)blockers.push(`The selected subclass is not compatible with this ${build.characterClass} Guardian.`);
  }
  if(weapons.filter(exotic).length>1)blockers.push('Destiny permits only one Exotic weapon.');
  if(armour.filter(exotic).length>1)blockers.push('Destiny permits only one Exotic armour piece.');
  blockers.push(...subclassCompatibilityViolations(build));
  armour.forEach(item=>{const classType=Number(item?.classType??item?.definition?.classType);if(Number.isInteger(expectedClass)&&Number.isInteger(classType)&&classType!==3&&classType!==expectedClass)blockers.push(`${itemName(item)} is not compatible with this ${build.characterClass} Guardian.`);});

  const transfers=[];
  for(const target of targets){const resolved=transferStepsForTarget(target,characterId);transfers.push(...resolved.steps);if(resolved.blocker)blockers.push(resolved.blocker);}

  const inferred=inferredSubclassChanges(build,originalBuild),generated=generatedSocketChanges(build,advice),manual=(build.manualSocketChanges||[]).filter(validChange).map(change=>normalizedChange(change,change.component||'manual-socket'));
  const bySocket=new Map();
  for(const change of [...generated,...inferred.changes,...manual])bySocket.set(`${change.itemInstanceId}:${change.socketIndex}`,change);
  const socketChanges=[],inGameSteps=[...inferred.manual];
  for(const change of bySocket.values()){
    if(change.remoteSupported&&change.reversible&&targets.some(target=>target.itemInstanceId===change.itemInstanceId))socketChanges.push(change);
    else if(change.remoteSupported&&!targets.some(target=>target.itemInstanceId===change.itemInstanceId))blockers.push(`${change.plugName||`Plug ${change.plugHash}`} is not attached to an exact equipment target.`);
    else inGameSteps.push(`Set ${change.plugName||`plug ${change.plugHash}`} on ${change.itemName||`item ${change.itemInstanceId}`} in Destiny; this socket was not verified as a free remote insertion.`);
  }
  const artifactStep=intendedArtifactStep(build);if(artifactStep)inGameSteps.push(artifactStep);

  const weaponSocketChanges=socketChanges.filter(row=>row.component!=='armour-mod'),armourModChanges=socketChanges.filter(row=>row.component==='armour-mod');
  const requirements=[
    {key:'captureSnapshot',capability:'captureSnapshot',label:'Capture fresh ownership, equipment and activity state',changes:targets.length,required:true},
    {key:'transferItems',capability:'transferItems',label:'Transfer target items to the selected Guardian',changes:transfers.length,required:transfers.length>0},
    {key:'equipItems',capability:'equipItems',label:'Equip exact item instances',changes:targets.length,required:targets.length>0},
    {key:'verifyEquipment',capability:'verifyEquipment',label:'Verify equipped instance IDs from a fresh profile',changes:targets.length,required:targets.length>0},
    {key:'applyWeaponSockets',capability:'insertSocketPlugFree',label:'Apply verified weapon and subclass socket changes',changes:weaponSocketChanges.length,required:weaponSocketChanges.length>0},
    {key:'applyArmourMods',capability:'insertSocketPlugFree',label:'Apply verified armour mod changes',changes:armourModChanges.length,required:armourModChanges.length>0},
    {key:'verifyFinalState',capability:'verifyFinalState',label:'Read back the final Bungie profile',changes:targets.length+socketChanges.length,required:true}
  ];
  const phases=requirements.map((phase,index)=>({...phase,order:index+1,status:!phase.required?'skipped':supported[phase.capability]?'supported':'blocked'}));
  phases.filter(row=>row.required&&row.status==='blocked').forEach(row=>blockers.push(`${row.label} is not available through the current Bungie route.`));
  return {
    schemaVersion:3,
    kind:'destiny-complete-loadout-transfer',
    status:blockers.length?'blocked':'staged',
    ready:blockers.length===0,
    createdAt:new Date().toISOString(),
    characterId,membershipId,membershipType,
    requiresUserConfirmation:true,
    confirmedAt:null,
    executionPolicy:'fresh-read-activity-check-transfer-equip-verify-weapon-sockets-armour-mods-final-readback',
    equipment:{weapons:weapons.map(itemIdOf),armour:armour.map(itemIdOf),subclass:subclassItem?itemIdOf(subclassItem):null,targets},
    transfers,
    socketChanges,
    weaponSocketChanges,
    weaponPerkChanges:socketChanges.filter(row=>row.component==='weapon-perk'),
    armourModChanges,
    artifact:{artifactHash:Number(build.artifactConfiguration?.artifactHash)||null,selectedPerkHashes:(build.artifactConfiguration?.selectedPerkHashes||[]).map(Number).filter(Number.isInteger)},
    inGameSteps:[...new Set(inGameSteps)],
    capabilities:supported,
    phases,
    blockers:[...new Set(blockers)]
  };
}

function confirmPerkChangePlan(plan){
  if(!plan?.changes?.length)throw new Error('No verified perk changes are staged.');
  if(!plan.remotePerkMutationSupported)throw new Error('The Bungie socket action route is not enabled.');
  return {...clone(plan),status:'confirmed',confirmedAt:new Date().toISOString()};
}

async function applyConfirmedPerkChangePlan(plan,{fetchImpl=fetch,endpoint='https://auth.astrixparadox.com/bungie/actions/socket-plug-free',csrfToken=''}={}){
  if(plan?.status!=='confirmed'||!plan?.confirmedAt)throw new Error('User confirmation is required before applying perk changes.');
  const headers={'content-type':'application/json'};if(csrfToken)headers['X-CSRF-Token']=csrfToken;
  const response=await fetchImpl(endpoint,{method:'POST',credentials:'include',headers,body:JSON.stringify({schemaVersion:plan.schemaVersion,characterId:plan.characterId,changes:plan.changes})});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.ErrorCode&&Number(payload.ErrorCode)!==1)throw Object.assign(new Error(payload?.Message||payload?.error||`Bungie perk action failed (${response.status})`),{status:response.status,payload});
  return {...clone(plan),status:'applied',appliedAt:new Date().toISOString(),result:payload};
}

export {WEAPON_BUCKETS,ARMOUR_BUCKETS,SUBCLASS_BUCKET,booleanCapabilities,equipmentTarget,transferStepsForTarget,subclassCompatibilityViolations,createPerkChangePlan,createLiveTransferPlan,confirmPerkChangePlan,applyConfirmedPerkChangePlan};
