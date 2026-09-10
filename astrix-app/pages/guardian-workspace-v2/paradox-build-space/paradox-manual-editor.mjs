import {ARMOUR_BUCKETS,WEAPON_BUCKETS} from '../guardian-perk-change-plan.mjs';
import {classifyArmourPlug,classifyWeaponPlug,normaliseWeaponPerkModel} from '../guardian-semantic-resolver.mjs?v=20260910-tier-zero-evidence-1';

const CLASS_TYPES={titan:0,hunter:1,warlock:2};
const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const hashOf=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
const itemId=item=>String(item?.itemInstanceId||item?.instanceId||'');
const isExotic=item=>item?.isExotic===true||String(item?.tier||item?.rarity||'').toLowerCase().includes('exotic');
const exactRemoteSocketEvidence=option=>option?.remoteInsertEvidence==='exact-item-reusable-plug'||option?.source==='bungie-item-reusable-plugs';

function manualEquipmentSourceAllowed(item,characterId){
  const source=item?.source||{},kind=String(source.kind||''),owner=String(source.characterId||''),active=String(characterId||'');
  return kind==='vault'||(['equipped','carried'].includes(kind)&&Boolean(active)&&owner===active);
}

function filterManualEquipmentSources(items=[],characterId=''){
  return (Array.isArray(items)?items:[]).filter(item=>manualEquipmentSourceAllowed(item,characterId));
}

function clearGeneratedClaims(build,component='manual'){
  for(const key of ['recommendationGeneratedAt','recommendationElement','recommendationStatus','forgeIntelligence','liveTransferPreflight','liveTransferPlan','liveTransferResult'])delete build[key];
  if(component==='weapon'){delete build.weaponSelectionRecommendation;delete build.weaponRollAdvice;}
  if(component==='armour'){delete build.armourModRecommendation;delete build.forgeLoaderDecision;delete build.vaultArmourSelection;}
  return build;
}

function recordManualEdit(build,entry={}){
  const edits=Array.isArray(build.manualEdits)?build.manualEdits.slice(-199):[];
  edits.push({schemaVersion:1,at:new Date().toISOString(),source:'user-manual-editor',...entry});
  build.manualEdits=edits;
  build.manualEditedAt=edits.at(-1).at;
  build.editMode='manual';
  return build;
}

function validateEquipmentChoice(build,kind,slotIndex,item){
  const expected=(kind==='weapon'?WEAPON_BUCKETS:ARMOUR_BUCKETS)[slotIndex],actual=Number(item?.bucketHash??item?.definition?.inventory?.bucketTypeHash);
  if(actual!==expected)throw new TypeError(`This item does not belong in ${kind} slot ${slotIndex+1}.`);
  if(!/^\d+$/.test(itemId(item)))throw new TypeError('Manual equipment choices require an exact owned Bungie instance.');
  if(!manualEquipmentSourceAllowed(item,build.characterId))throw new TypeError('Manual equipment choices are limited to this Guardian’s carried or equipped items plus the Vault.');
  if(kind==='armour'){
    const expectedClass=CLASS_TYPES[String(build.characterClass||'').toLowerCase()],classType=Number(item?.classType??item?.definition?.classType);
    if(Number.isInteger(expectedClass)&&Number.isInteger(classType)&&classType!==3&&classType!==expectedClass)throw new TypeError(`This armour is not compatible with the selected ${build.characterClass} Guardian.`);
  }
  const collection=[...((kind==='weapon'?build.weapons:build.armour)||[])];collection[slotIndex]=item;
  if(collection.filter(isExotic).length>1)throw new TypeError(`Destiny permits only one Exotic ${kind==='weapon'?'weapon':'armour piece'} in a loadout.`);
  return true;
}

function stageEquipmentChoice(build,kind,slotIndex,item){
  if(!['weapon','armour'].includes(kind))throw new TypeError('Unsupported equipment collection.');
  validateEquipmentChoice(build,kind,slotIndex,item);
  const key=kind==='weapon'?'weapons':'armour',before=build[key]?.[slotIndex]||null;
  if(itemId(before)===itemId(item))return build;
  build[key]=[...(build[key]||[])];
  build[key][slotIndex]=clone(item);
  if(itemId(before)!==itemId(item))build.manualSocketChanges=(build.manualSocketChanges||[]).filter(change=>String(change.itemInstanceId)!==itemId(before));
  clearGeneratedClaims(build,kind);
  recordManualEdit(build,{component:kind,slotIndex,beforeItemInstanceId:itemId(before)||null,afterItemInstanceId:itemId(item),itemHash:Number(item?.itemHash??item?.hash)||null,itemName:String(item?.name||'Destiny item')});
  return build;
}

function socketGroups(item,kind){
  const options=item?.[kind==='armour'?'armourModOptions':'socketOptions']||{},current=item?.socketCoverage?.plugs||[],groups=[];
  for(const [key,rows] of Object.entries(options)){
    const socketIndex=Number(key),allowed=(Array.isArray(rows)?rows:[]).filter(option=>{
      if(option?.canInsert!==true)return false;
      const role=kind==='armour'?classifyArmourPlug(option):classifyWeaponPlug(option);
      return kind==='armour'?['general-mod','slot-mod'].includes(role):['perk','weapon-mod'].includes(role);
    });
    if(!allowed.length)continue;
    const selected=current.find(row=>Number(row?.socketIndex)===socketIndex)||null,role=kind==='armour'?classifyArmourPlug(allowed[0]):classifyWeaponPlug(allowed[0]);
    groups.push({socketIndex,role,label:role==='general-mod'?'GENERAL MOD':role==='slot-mod'?'ARMOUR MOD':role==='weapon-mod'?'WEAPON MOD':'PERK',current:selected,options:allowed});
  }
  return groups.sort((left,right)=>left.socketIndex-right.socketIndex);
}

function replaceSocketPlug(item,socketIndex,option){
  item.socketCoverage=item.socketCoverage||{plugs:[],requested:[],resolved:[],unresolved:[],complete:true};
  const plugs=[...(item.socketCoverage.plugs||[])],at=plugs.findIndex(row=>Number(row?.socketIndex)===socketIndex),next={...clone(option),socketIndex};
  if(at>=0)plugs[at]=next;else plugs.push(next);
  item.socketCoverage={...item.socketCoverage,plugs,requested:plugs.map(hashOf).filter(Number.isInteger),resolved:plugs.map(hashOf).filter(Number.isInteger)};
  return next;
}

function updateWeaponSocket(item,socketIndex,option){
  const semantics=clone(item.weaponSemantics||{}),role=classifyWeaponPlug(option);
  if(role==='perk'){
    const selected=[...(semantics.selectedPerks||item.selectedPerks||[])],at=selected.findIndex(row=>Number(row?.socketIndex)===socketIndex),next={...clone(option),socketIndex};
    if(at>=0)selected[at]=next;else selected.push(next);
    const columns=semantics.perkModel?.columns||semantics.alternativePerkColumns||[];
    const model=normaliseWeaponPerkModel({gearTier:semantics.gearTier??item.gearTier,selectedPerks:selected,alternativePerkColumns:columns});
    semantics.selectedPerks=selected;semantics.perkModel=model;semantics.perkRows=model.rows;semantics.perkRowCount=model.expectedRowCount;
    item.selectedPerks=selected;item.weaponPerkModel=model;item.weaponPerkRows=model.rows;item.weaponPerkRowCount=model.expectedRowCount;
  }else if(role==='weapon-mod'){
    const next={...clone(option),socketIndex};semantics.mod=next;item.weaponMod=next;
  }
  item.weaponSemantics=semantics;
}

function updateArmourSocket(item,socketIndex,option){
  const semantics=clone(item.armourSemantics||{}),role=classifyArmourPlug(option),key=role==='general-mod'?'generalMods':'slotMods',rows=[...(semantics[key]||item[key]||[])],at=rows.findIndex(row=>Number(row?.socketIndex)===socketIndex),next={...clone(option),socketIndex};
  if(at>=0)rows[at]=next;else rows.push(next);
  semantics[key]=rows;item.armourSemantics=semantics;item[key]=rows;
  const masterwork=item.masterwork||semantics.masterwork;item.mods=[masterwork,...(item.generalMods||[]),...(item.slotMods||[])].filter(Boolean);
}

function stageSocketChoice(build,kind,slotIndex,socketIndex,option){
  if(!['weapon','armour'].includes(kind)||option?.canInsert!==true)throw new TypeError('Only a verified insertable socket option can be staged.');
  const key=kind==='weapon'?'weapons':'armour',item=clone(build[key]?.[slotIndex]);
  if(!item||!/^\d+$/.test(itemId(item)))throw new TypeError('Select an exact owned item before editing its sockets.');
  const verified=socketGroups(item,kind).find(group=>group.socketIndex===Number(socketIndex))?.options.some(row=>hashOf(row)===hashOf(option));
  if(!verified)throw new TypeError('This socket option is not in the item’s verified reusable plug set.');
  const current=item.socketCoverage?.plugs?.find(row=>Number(row?.socketIndex)===Number(socketIndex))||null,currentPlugHash=hashOf(current),plugHash=hashOf(option);
  replaceSocketPlug(item,Number(socketIndex),option);
  if(kind==='weapon')updateWeaponSocket(item,Number(socketIndex),option);else updateArmourSocket(item,Number(socketIndex),option);
  build[key]=[...(build[key]||[])];build[key][slotIndex]=item;
  const changes=[...(build.manualSocketChanges||[])],changeAt=changes.findIndex(row=>row.itemInstanceId===itemId(item)&&Number(row.socketIndex)===Number(socketIndex)),prior=changeAt>=0?changes[changeAt]:null,originalHash=Number.isInteger(Number(prior?.currentPlugHash))?Number(prior.currentPlugHash):Number.isInteger(currentPlugHash)?currentPlugHash:null;
  if(originalHash===plugHash){if(changeAt>=0)changes.splice(changeAt,1);}
  else{
    const change={schemaVersion:1,itemInstanceId:itemId(item),itemHash:Number(item.itemHash??item.hash)||null,itemName:String(item.name||'Destiny item'),socketIndex:Number(socketIndex),socketArrayType:0,currentPlugHash:originalHash,plugHash,plugName:String(option.name||'Socket option'),component:kind==='weapon'?(classifyWeaponPlug(option)==='weapon-mod'?'weapon-mod':'weapon-perk'):'armour-mod',source:String(option.source||'bungie-reusable-plugs'),remoteSupported:exactRemoteSocketEvidence(option),reversible:true};
    if(changeAt>=0)changes[changeAt]=change;else changes.push(change);
  }
  build.manualSocketChanges=changes;
  clearGeneratedClaims(build,kind);
  recordManualEdit(build,{component:`${kind}-socket`,slotIndex,socketIndex:Number(socketIndex),itemInstanceId:itemId(item),beforePlugHash:Number.isInteger(currentPlugHash)?currentPlugHash:null,afterPlugHash:plugHash,plugName:String(option.name||'Socket option')});
  return build;
}

function stageSubclassSocketChoice(build,before,option,component='socket'){
  const socketIndex=Number(option?.socketIndex),plugHash=hashOf(option),currentPlugHash=hashOf(before),subclassItem=build.subclassItem||null,subclassItemInstanceId=String(build.subclassItemInstanceId||itemId(subclassItem)||'');
  if(!Number.isInteger(socketIndex)||!Number.isInteger(plugHash)||plugHash<=0)throw new TypeError('This subclass choice has no verified socket identity.');
  const changes=[...(build.manualSocketChanges||[])],changeAt=changes.findIndex(row=>String(row.itemInstanceId)===subclassItemInstanceId&&Number(row.socketIndex)===socketIndex),prior=changeAt>=0?changes[changeAt]:null,originalHash=Number.isInteger(Number(prior?.currentPlugHash))?Number(prior.currentPlugHash):Number.isInteger(currentPlugHash)?currentPlugHash:null;
  if(originalHash===plugHash){if(changeAt>=0)changes.splice(changeAt,1);}
  else{
    const change={schemaVersion:1,itemInstanceId:subclassItemInstanceId,itemHash:Number(subclassItem?.itemHash??subclassItem?.hash)||null,itemName:String(build.subclassName||subclassItem?.name||'Subclass'),socketIndex,socketArrayType:0,currentPlugHash:originalHash,plugHash,plugName:String(option.name||'Subclass option'),component:`subclass-${component}`,source:String(option.source||'bungie-reusable-plugs'),remoteSupported:option.canInsert===true&&exactRemoteSocketEvidence(option),reversible:true};
    if(changeAt>=0)changes[changeAt]=change;else changes.push(change);
  }
  build.manualSocketChanges=changes;
  return build;
}

function eligibleEquipment(catalogue=[],build={},kind,slotIndex){
  const expected=(kind==='weapon'?WEAPON_BUCKETS:ARMOUR_BUCKETS)[slotIndex],expectedClass=CLASS_TYPES[String(build.characterClass||'').toLowerCase()];
  return (Array.isArray(catalogue)?catalogue:[]).filter(item=>{
    if(Number(item?.bucketHash??item?.definition?.inventory?.bucketTypeHash)!==expected)return false;
    if(kind==='armour'){
      const classType=Number(item?.classType??item?.definition?.classType);
      if(Number.isInteger(expectedClass)&&Number.isInteger(classType)&&classType!==3&&classType!==expectedClass)return false;
    }
    return /^\d+$/.test(itemId(item));
  }).sort((left,right)=>Number(right.isExotic)-Number(left.isExotic)||Number(right.power||0)-Number(left.power||0)||String(left.name||'').localeCompare(String(right.name||'')));
}

export {clearGeneratedClaims,recordManualEdit,manualEquipmentSourceAllowed,filterManualEquipmentSources,validateEquipmentChoice,stageEquipmentChoice,socketGroups,stageSocketChoice,stageSubclassSocketChoice,eligibleEquipment,exactRemoteSocketEvidence};
