import {SUBCLASSES} from '../pages/guardian-workspace-v2/guardian-super-catalog.mjs';
const SUBCLASS_ELEMENT_BY_HASH=new Map(Object.values(SUBCLASSES).flat().map(([hash,element,,icon])=>[Number(hash),{element,icon}]));
import {WEAPON_BUCKETS,ARMOUR_BUCKETS,SUBCLASS_BUCKET} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {subclassPlugComponent} from '../pages/guardian-workspace-v2/guardian-subclass-plug-classifier.mjs';
import {classifyArmourPlug,classifyWeaponPlug,normaliseArmourSemantics,normaliseWeaponSemantics} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';

export const hashValue=value=>Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=0xffffffff?Number(value):null;
export function bungieArtwork(path){
  if(typeof path!=='string'||!path||path.startsWith('//'))return '';
  try{const url=new URL(path,'https://www.bungie.net');return url.origin==='https://www.bungie.net'&&!url.username&&!url.password&&/^\/(?:common|img)\//.test(url.pathname)?url.href:'';}catch{return '';}
}
export const loadoutFingerprint=loadout=>JSON.stringify(loadout??null);
export function accountItems(profile){
  const rows=new Map();
  const put=(item,kind,characterId=null)=>{if(item?.itemInstanceId)rows.set(String(item.itemInstanceId),{...item,source:{kind,characterId}});};
  for(const item of profile?.profileInventory?.data?.items||[])put(item,'vault');
  for(const [id,row] of Object.entries(profile?.characterInventories?.data||{}))for(const item of row?.items||[])put(item,Number(item.bucketHash)===215593132?'postmaster':'carried',id);
  for(const [id,row] of Object.entries(profile?.characterEquipment?.data||{}))for(const item of row?.items||[])put(item,'equipped',id);
  return rows;
}
function socketGroups(item){
  const groups=new Map();
  const add=(label,plug)=>{if(!groups.has(label))groups.set(label,[]);groups.get(label).push(plug);};
  for(const plug of item.sockets){
    let label='Other sockets';
    if(item.kind==='subclass')label=({super:'Super',classAbility:'Abilities',movementAbility:'Abilities',melee:'Abilities',grenade:'Abilities',aspect:'Aspects',fragment:'Fragments'})[plug.componentType]||label;
    else if(plug.semanticRole==='appearance')label='Cosmetics';
    else if(item.kind==='weapon')label=['perk','intrinsic'].includes(plug.semanticRole)?'Selected perks':['weapon-mod','catalyst','masterwork'].includes(plug.semanticRole)?'Mods':label;
    else if(item.kind==='armour')label=['general-mod','slot-mod'].includes(plug.semanticRole)?'Mods':['archetype','masterwork'].includes(plug.semanticRole)?'Stat focus':label;
    add(label,plug);
  }
  return [...groups].map(([label,plugs])=>({label,plugs}));
}
/** Pure adapter. Never fill a missing saved plug with the currently equipped plug. */
export function resolveInGameLoadout({profile={},definitions={},manifestVersion='',manifest={},characterId,index,membershipId='',membershipType=''}){
  if(!Number.isInteger(index)||index<0||index>=20)throw new Error('Invalid loadout slot.');
  const loadout=profile.characterLoadouts?.data?.[String(characterId)]?.loadouts?.[index];
  if(!loadout)throw new Error('Loadout data unavailable. Refresh the Character page.');
  const tables=manifest.manifestVersion===manifestVersion?manifest.tables||{}:{};
  const get=(type,hash)=>tables[type]?.[String(hash)];
  const identity=(type,key)=>Object.entries(tables[type]||{}).filter(([,row])=>!row.retired&&row[key]).map(([hash,row])=>({hash:Number(hash),name:row.name||row.displayProperties?.name||'',icon:bungieArtwork(row[key])}));
  const inventory=accountItems(profile);
  const items=(Array.isArray(loadout.items)?loadout.items:[]).map(saved=>{
    const instanceId=String(saved.itemInstanceId||''),raw=inventory.get(instanceId),definition=raw?definitions[String(raw.itemHash)]:null;
    const bucket=hashValue(definition?.inventory?.bucketTypeHash)||hashValue(raw?.bucketHash);
    const kind=bucket===SUBCLASS_BUCKET?'subclass':WEAPON_BUCKETS.includes(bucket)?'weapon':ARMOUR_BUCKETS.includes(bucket)?'armour':'unresolved';
    const selected=Array.isArray(saved.plugItemHashes)?saved.plugItemHashes:[];
    const entries=definition?.sockets?.socketEntries||[];
    const socketIndexes=new Set(selected.map((_,i)=>i));
    entries.forEach((entry,i)=>{if(entry.defaultVisible)socketIndexes.add(i);});
    const sockets=[...socketIndexes].sort((a,b)=>a-b).map(socketIndex=>{
      const hash=hashValue(selected[socketIndex]),plug=hash?definitions[String(hash)]:null;
      const categoryHash=definition?.sockets?.socketCategories?.find(row=>row.socketIndexes?.includes(socketIndex))?.socketCategoryHash;
      const row={hash,socketIndex,name:plug?.displayProperties?.name||'Empty socket',description:plug?.displayProperties?.description||'',icon:bungieArtwork(plug?.displayProperties?.icon),definition:plug||null,socketCategoryHash:categoryHash,socketCategoryDefinition:get('DestinySocketCategoryDefinition',categoryHash),armourItemTierType:definition?.inventory?.tierType,empty:!plug,unresolved:Boolean(hash&&!plug),retired:plug?.retired===true};
      row.componentType=kind==='subclass'?subclassPlugComponent(row):'';
      row.semanticRole=kind==='armour'?classifyArmourPlug(row):kind==='weapon'?classifyWeaponPlug(row):row.componentType;
      row.statFocus=(plug?.investmentStats||[]).flatMap(stat=>{
        const statDefinition=get('DestinyStatDefinition',stat.statTypeHash);
        return statDefinition?.displayProperties?.name&&Number.isFinite(stat.value)?[{name:statDefinition.displayProperties.name,value:stat.value,conditional:stat.isConditionallyActive===true}]:[];
      });
      return row;
    });
    const row={itemInstanceId:instanceId,itemHash:raw?.itemHash??null,bucketHash:bucket,kind,name:definition?.displayProperties?.name||'Item unavailable',icon:bungieArtwork(definition?.displayProperties?.icon),description:definition?.displayProperties?.description||'',definition:definition||null,classType:definition?.classType,isExotic:definition?.inventory?.tierType===6,source:raw?.source||{},retired:definition?.retired===true,unresolved:!raw||!definition,sockets};
    row.groups=socketGroups(row);return row;
  });
  const order=item=>[SUBCLASS_BUCKET,...WEAPON_BUCKETS,...ARMOUR_BUCKETS].indexOf(item.bucketHash);
  items.sort((a,b)=>(order(a)<0?99:order(a))-(order(b)<0?99:order(b)));
  const name=get('DestinyLoadoutNameDefinition',loadout.nameHash)?.name||'Saved loadout';
  return {schemaVersion:1,source:{kind:'in-game',label:'In-game loadout'},name,icon:bungieArtwork(get('DestinyLoadoutIconDefinition',loadout.iconHash)?.iconImagePath),colorIcon:bungieArtwork(get('DestinyLoadoutColorDefinition',loadout.colorHash)?.colorImagePath),slotNumber:index+1,identifiers:{nameHash:loadout.nameHash,iconHash:loadout.iconHash,colorHash:loadout.colorHash},identifierChoices:{names:identity('DestinyLoadoutNameDefinition','name'),icons:identity('DestinyLoadoutIconDefinition','iconImagePath'),colors:identity('DestinyLoadoutColorDefinition','colorImagePath')},items,manifestVersion,binding:{characterId:String(characterId),membershipId:String(membershipId),membershipType:String(membershipType),index},fingerprint:loadoutFingerprint(loadout),characterClass:['titan','hunter','warlock'][profile.characters?.data?.[characterId]?.classType]||'',warning:items.some(item=>item.unresolved||item.sockets.some(plug=>plug.unresolved))?'Some saved items or sockets are unavailable. No current sockets have been substituted.':''};
}
export function loadoutWorkingBuild(model,profile={}){
  const asGear=item=>{
    const plugs=item.sockets.filter(plug=>plug.definition).map(plug=>({...plug,plugHash:plug.hash}));
    const semantics=item.kind==='armour'?normaliseArmourSemantics({plugs}):null;
    return {...item,hash:item.itemHash,socketCoverage:{plugs},mods:plugs,cosmetics:plugs.filter(plug=>plug.semanticRole==='appearance'),...(semantics?{armourSemantics:semantics,generalMods:semantics.generalMods,slotMods:semantics.slotMods}:{weaponSemantics:normaliseWeaponSemantics({plugs})})};
  };
  const rows=model.items.map(asGear),subclassItem=rows.find(item=>item.kind==='subclass')||null;
  const selected=subclassItem?.sockets||[];
  const changes=rows.flatMap(item=>item.sockets.filter(plug=>plug.hash).map(plug=>{
    const current=profile.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets?.[plug.socketIndex]?.plugHash;
    const candidates=profile.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs?.[plug.socketIndex]||[];
    const available=candidates.some(row=>Number(row.plugItemHash)===plug.hash&&row.canInsert===true&&row.enabled!==false);
    return {itemInstanceId:item.itemInstanceId,itemHash:item.itemHash,itemName:item.name,socketIndex:plug.socketIndex,plugHash:plug.hash,plugName:plug.name,currentPlugHash:current??null,component:item.kind==='armour'?'armour-mod':item.kind==='subclass'?`subclass-${plug.componentType||'socket'}`:'weapon-perk',remoteSupported:!plug.empty&&!plug.retired&&(Number(current)===plug.hash||available),reversible:true,source:'bungie-item-reusable-plugs'};
  }));
  return {schemaVersion:1,...model.binding,selectedLoadoutIndex:model.binding.index,characterClass:model.characterClass,name:model.name,source:'bungie-loadout',weapons:WEAPON_BUCKETS.map(bucket=>rows.find(item=>item.bucketHash===bucket)||null),armour:ARMOUR_BUCKETS.map(bucket=>rows.find(item=>item.bucketHash===bucket)||null),subclassItem,subclassItemInstanceId:subclassItem?.itemInstanceId,subclassName:subclassItem?.name||'',subclass:SUBCLASS_ELEMENT_BY_HASH.get(Number(subclassItem?.itemHash))?.element||'',subclassIcon:subclassItem?.icon||'',subclassBuild:{super:selected.find(plug=>plug.componentType==='super')||null,abilities:selected.filter(plug=>['classAbility','movementAbility','melee','grenade'].includes(plug.componentType)),aspects:selected.filter(plug=>plug.componentType==='aspect'),fragments:selected.filter(plug=>plug.componentType==='fragment')},manualSocketChanges:changes};
}
/** Portable selected content only. Account IDs, instance IDs and sessions never leave this adapter. */
export function loadoutShareDocument(model){
  return {schema:'astrix-paradox-loadout-v1',name:model.name,manifestVersion:model.manifestVersion,items:model.items.map(item=>({itemHash:item.itemHash,kind:item.kind,sockets:item.sockets.map(plug=>({socketIndex:plug.socketIndex,plugHash:plug.hash}))}))};
}
