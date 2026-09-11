import {resolveArmourSet} from '../guardian-workspace-v2/guardian-armour-set-resolver.mjs';
import {classifyArmourPlug,normaliseArmourSemantics,normaliseWeaponSemantics} from '../guardian-workspace-v2/guardian-semantic-resolver.mjs?v=20260910-tier-zero-evidence-1';
import {resolveItemWatermark,weaponTypeIdentity} from '../../core/bungie-item-identity.mjs';

const BUNGIE_ORIGIN='https://www.bungie.net';
const VAULT_BUCKET=138197802;
const POSTMASTER_BUCKET=215593132;
const ARMOUR_ITEM_TYPE=2;
const WEAPON_ITEM_TYPE=3;
const CLASS_NAMES=['titan','hunter','warlock'];
const WEAPON_BUCKETS=Object.freeze([
  Object.freeze({hash:1498876634,key:'primary',label:'Primary',kind:'weapon'}),
  Object.freeze({hash:2465295065,key:'special',label:'Special',kind:'weapon'}),
  Object.freeze({hash:953998645,key:'heavy',label:'Heavy',kind:'weapon'})
]);
const ARMOUR_BUCKETS=Object.freeze([
  Object.freeze({hash:3448274439,key:'helmet',label:'Helmet',kind:'armour'}),
  Object.freeze({hash:3551918588,key:'gauntlets',label:'Gauntlets',kind:'armour'}),
  Object.freeze({hash:14239492,key:'chest',label:'Chest',kind:'armour'}),
  Object.freeze({hash:20886954,key:'legs',label:'Legs',kind:'armour'}),
  Object.freeze({hash:1585787867,key:'class-item',label:'Class Item',kind:'armour'})
]);
const EQUIPMENT_GROUPS=Object.freeze([...WEAPON_BUCKETS,...ARMOUR_BUCKETS]);
const EQUIPMENT_GROUP_BY_HASH=new Map(EQUIPMENT_GROUPS.map((row,index)=>[row.hash,{...row,index}]));
const ARMOUR_SLOT_BY_HASH=new Map(ARMOUR_BUCKETS.map((row,index)=>[row.hash,{...row,index}]));
const SOURCE_PRIORITY={profile:0,vault:1,postmaster:2,carried:3,equipped:4};

const clone=value=>{
  try{return structuredClone(value);}
  catch{return JSON.parse(JSON.stringify(value??null));}
};
const finite=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const absoluteIcon=path=>path?new URL(path,BUNGIE_ORIGIN).toString():'';
const definitionFor=(payload,hash)=>payload?.definitions?.[String(hash)]||null;
const itemKey=item=>String(item?.itemInstanceId||`${item?.itemHash||'unknown'}:${item?.source?.kind||'unknown'}:${item?.source?.characterId||''}`);

function displayIdentity(payload,hash){
  const definition=definitionFor(payload,hash)||{};
  const display=definition.displayProperties||{};
  return {
    hash:Number(hash),
    bungieHash:Number(hash),
    name:String(display.name||`Unresolved Destiny item ${hash}`),
    description:String(display.description||''),
    icon:absoluteIcon(display.icon),
    tier:String(definition.inventory?.tierTypeName||''),
    tierType:finite(definition.inventory?.tierType),
    itemTypeDisplayName:String(definition.itemTypeDisplayName||''),
    definition
  };
}

function socketCategory(payload,itemDefinition,socketIndex){
  const category=(itemDefinition?.sockets?.socketCategories||[]).find(row=>(row?.socketIndexes||[]).map(Number).includes(socketIndex))||null;
  const hash=finite(category?.socketCategoryHash);
  return {hash,definition:hash===null?null:payload?.socketCategoryDefinitions?.[String(hash)]||null};
}

function socketPlugs(payload,rawItem){
  if(!rawItem?.itemInstanceId)return [];
  const states=payload?.profile?.itemComponents?.sockets?.data?.[rawItem.itemInstanceId]?.sockets||[];
  const itemDefinition=definitionFor(payload,rawItem.itemHash)||{};
  const rows=states.map((state,socketIndex)=>{
    const hash=finite(state?.plugHash);
    if(hash===null)return null;
    const identity=displayIdentity(payload,hash);
    const category=socketCategory(payload,itemDefinition,socketIndex);
    return {
      ...identity,
      socketIndex,
      socketCategoryHash:category.hash,
      socketCategoryDefinition:category.definition,
      armourItemTierType:finite(itemDefinition?.inventory?.tierType),
      isEnabled:state?.isEnabled!==false,
      isVisible:state?.isVisible!==false,
      statContributions:statContributions(payload,identity.definition)
    };
  }).filter(Boolean),resolvedSocketIndexes=new Set(rows.map(row=>Number(row.socketIndex)));
  const fixedIntrinsicRows=(itemDefinition?.sockets?.socketEntries||[]).map((entry,socketIndex)=>{
    if(resolvedSocketIndexes.has(socketIndex))return null;
    const hash=finite(entry?.singleInitialItemHash),plugDefinition=hash===null?null:definitionFor(payload,hash),plugCategory=String(plugDefinition?.plug?.plugCategoryIdentifier||'').toLowerCase();
    if(hash===null||!plugDefinition||!plugCategory.includes('intrinsic'))return null;
    const identity=displayIdentity(payload,hash),category=socketCategory(payload,itemDefinition,socketIndex);
    return {...identity,socketIndex,socketCategoryHash:category.hash,socketCategoryDefinition:category.definition,armourItemTierType:finite(itemDefinition?.inventory?.tierType),isEnabled:true,isVisible:entry?.defaultVisible!==false,source:'bungie-manifest-fixed-intrinsic',statContributions:statContributions(payload,identity.definition)};
  }).filter(Boolean);
  return [...rows,...fixedIntrinsicRows].sort((left,right)=>Number(left.socketIndex)-Number(right.socketIndex));
}

function statContributions(payload,definition){
  return (definition?.investmentStats||[]).map(row=>{
    const hash=finite(row?.statTypeHash),stat=hash===null?null:payload?.statDefinitions?.[String(hash)]||null;
    return {hash,name:String(stat?.displayProperties?.name||''),value:Number(row?.value||0),isConditionallyActive:Boolean(row?.isConditionallyActive)};
  }).filter(row=>row.hash!==null&&Number.isFinite(row.value)&&row.value!==0);
}

function armourModOptions(payload,rawItem){
  if(!rawItem?.itemInstanceId)return {};
  const profile=payload?.profile||{},reusable=profile?.itemComponents?.reusablePlugs?.data?.[rawItem.itemInstanceId]?.plugs||{},itemDefinition=definitionFor(payload,rawItem.itemHash)||{},entries=itemDefinition?.sockets?.socketEntries||[],indexes=new Set([...Object.keys(reusable).map(Number),...entries.map((_,index)=>index)]),profileSets=profile?.profilePlugSets?.data?.plugs||{},characterSets=Object.values(profile?.characterPlugSets?.data||{}).map(row=>row?.plugs||{});
  return Object.fromEntries([...indexes].sort((a,b)=>a-b).map(socketIndex=>{
    const entry=entries[socketIndex]||{},setHashes=[entry?.reusablePlugSetHash].map(Number).filter(Number.isInteger),setRows=setHashes.flatMap(hash=>[...(profileSets?.[String(hash)]||[]),...characterSets.flatMap(sets=>sets?.[String(hash)]||[])]),rows=[...(reusable?.[String(socketIndex)]||[]).map(row=>({row,source:'bungie-item-reusable-plugs'})),...setRows.map(row=>({row,source:'bungie-profile-plug-set'}))],seen=new Set();
    return [String(socketIndex),(Array.isArray(rows)?rows:[]).filter(({row})=>row?.canInsert!==false&&row?.enabled!==false).map(({row,source})=>{
      const hash=finite(row?.plugItemHash??row?.plugHash),definition=hash===null?null:definitionFor(payload,hash);
      if(hash===null||!definition||seen.has(hash))return null;seen.add(hash);
      const category=(itemDefinition?.sockets?.socketCategories||[]).find(value=>(value?.socketIndexes||[]).map(Number).includes(Number(socketIndex)))||null;
      const socketCategoryHash=finite(category?.socketCategoryHash),identity=displayIdentity(payload,hash);
      return {...identity,socketIndex:Number(socketIndex),socketCategoryHash,socketCategoryDefinition:socketCategoryHash===null?null:payload?.socketCategoryDefinitions?.[String(socketCategoryHash)]||null,canInsert:row.canInsert===true,source,remoteInsertEvidence:source==='bungie-item-reusable-plugs'?'exact-item-reusable-plug':'compatible-plug-set',statContributions:statContributions(payload,definition)};
    }).filter(Boolean)];
  }).filter(([,rows])=>rows.length));
}

function sourceRows(profile={}){
  const rows=[];
  for(const item of profile?.profileInventory?.data?.items||[]){
    rows.push({item,source:{kind:Number(item?.bucketHash)===VAULT_BUCKET?'vault':'profile',characterId:null,label:Number(item?.bucketHash)===VAULT_BUCKET?'Vault':'Shared inventory'}});
  }
  for(const [characterId,inventory] of Object.entries(profile?.characterInventories?.data||{})){
    for(const item of inventory?.items||[]){
      const postmaster=Number(item?.bucketHash)===POSTMASTER_BUCKET;
      rows.push({item,source:{kind:postmaster?'postmaster':'carried',characterId:String(characterId),label:postmaster?'Postmaster':'Carried'}});
    }
  }
  for(const [characterId,equipment] of Object.entries(profile?.characterEquipment?.data||{})){
    for(const item of equipment?.items||[])rows.push({item,source:{kind:'equipped',characterId:String(characterId),label:'Equipped'}});
  }
  return rows;
}

function deduplicateRows(rows=[]){
  const unique=new Map();
  for(const row of rows){
    const key=String(row?.item?.itemInstanceId||'');
    if(!key){unique.set(`uninstanced:${unique.size}`,row);continue;}
    const prior=unique.get(key);
    if(!prior||SOURCE_PRIORITY[row.source.kind]>SOURCE_PRIORITY[prior.source.kind])unique.set(key,row);
  }
  return [...unique.values()];
}

function armourStats(payload,rawItem,plugs=[]){
  const component=payload?.profile?.itemComponents?.stats?.data?.[rawItem?.itemInstanceId]?.stats||{};
  return Object.entries(component).map(([hash,row])=>{
    const definition=payload?.statDefinitions?.[String(hash)]||null;
    const modFree=modFreeArmourStatValue(payload,hash,row?.value,plugs);
    return {
      hash:Number(hash),
      name:String(definition?.displayProperties?.name||`Destiny stat ${hash}`),
      icon:absoluteIcon(definition?.displayProperties?.icon),
      value:modFree.rawValue,
      installedModContribution:modFree.installedModContribution
    };
  }).filter(row=>Number.isFinite(row.value)).sort((left,right)=>right.value-left.value);
}

function modFreeArmourStatValue(payload,statHash,reportedValue,plugs=[]){
  const installed=(Array.isArray(plugs)?plugs:[]).filter(plug=>['general-mod','slot-mod'].includes(classifyArmourPlug(plug))&&plug?.isEnabled!==false);
  const contribution=installed.reduce((sum,plug)=>sum+statContributions(payload,plug.definition).filter(stat=>Number(stat.hash)===Number(statHash)&&stat.isConditionallyActive!==true).reduce((value,stat)=>value+Number(stat.value||0),0),0);
  // Bungie's ItemStats component is the item's provided instanced stat source;
  // socket plugs are separate components. Preserve that raw value and carry the
  // installed plug contribution beside it for current/projected comparisons.
  return {rawValue:Math.max(0,Number(reportedValue||0)),installedModContribution:contribution};
}

function normaliseArmourItem(payload,row){
  const rawItem=row?.item||{};
  const definition=definitionFor(payload,rawItem.itemHash);
  if(!definition||Number(definition.itemType)!==ARMOUR_ITEM_TYPE)return null;
  const equipmentBucket=finite(definition.inventory?.bucketTypeHash);
  const slot=ARMOUR_SLOT_BY_HASH.get(equipmentBucket);
  if(!slot)return null;
  const identity=displayIdentity(payload,rawItem.itemHash);
  const instance=payload?.profile?.itemComponents?.instances?.data?.[rawItem.itemInstanceId]||null;
  const statsComponent=payload?.profile?.itemComponents?.stats?.data?.[rawItem.itemInstanceId]||null;
  const plugs=socketPlugs(payload,rawItem);
  const armourSemantics=normaliseArmourSemantics({plugs,instance,stats:statsComponent});
  const stats=armourStats(payload,rawItem,plugs);
  const versionNumber=Number.isInteger(Number(rawItem?.versionNumber))?Number(rawItem.versionNumber):null;
  const releaseWatermark=resolveItemWatermark({...rawItem,versionNumber},definition,{powerCapDefinitions:payload?.powerCapDefinitions,currentPowerCap:payload?.currentPowerCap});
  const masterworkSlot=armourSemantics.masterwork?{...armourSemantics.masterwork,semanticRole:'masterwork',energyCost:armourSemantics.tier}:null;
  const functionalMods=[...armourSemantics.generalMods,...armourSemantics.slotMods];
  const base={
    ...identity,
    itemHash:Number(rawItem.itemHash),
    itemInstanceId:String(rawItem.itemInstanceId||''),
    bucketHash:equipmentBucket,
    storageBucketHash:finite(rawItem.bucketHash),
    slotIndex:slot.index,
    slotKey:slot.key,
    slotLabel:slot.label,
    classType:finite(definition.classType),
    characterClass:CLASS_NAMES[Number(definition.classType)]||'any',
    source:clone(row.source),
    power:finite(instance?.primaryStat?.value),
    itemLevel:finite(instance?.itemLevel),
    gearTier:finite(instance?.gearTier),
    quality:finite(instance?.quality),
    versionNumber,
    releaseWatermark,
    tierIcon:releaseWatermark.icon,
    state:Number(rawItem.state||0),
    stats,
    totalStats:stats.reduce((sum,stat)=>sum+stat.value,0),
    socketCoverage:{
      plugs,
      requested:plugs.map(plug=>Number(plug.hash)).filter(Number.isFinite),
      resolved:plugs.filter(plug=>plug.definition&&Object.keys(plug.definition).length).map(plug=>Number(plug.hash)),
      unresolved:plugs.filter(plug=>!plug.definition||!Object.keys(plug.definition).length).map(plug=>Number(plug.hash)),
      complete:plugs.every(plug=>plug.definition&&Object.keys(plug.definition).length)
    },
    socketsAvailable:Boolean(rawItem.itemInstanceId&&payload?.profile?.itemComponents?.sockets?.data?.[rawItem.itemInstanceId]),
    armourSemantics,
    armourTier:armourSemantics.tier,
    masterwork:armourSemantics.masterwork,
    energy:armourSemantics.energy,
    archetype:armourSemantics.archetype,
    exoticPerk:armourSemantics.exoticPerk,
    generalMods:armourSemantics.generalMods,
    slotMods:armourSemantics.slotMods,
    armourModOptions:armourModOptions(payload,rawItem),
    mods:functionalMods.length?[masterworkSlot,...armourSemantics.generalMods.slice(0,2),...armourSemantics.slotMods.slice(0,3)]:[],
    intrinsicTrait:armourSemantics.exoticPerk,
    isExotic:String(identity.tier).toLowerCase()==='exotic'
  };
  const set=resolveArmourSet(payload,base,[]);
  if(set){base.armourSemantics.set=set;base.setBonus=set;}
  return base;
}

function normaliseWeaponItem(payload,row,group){
  const rawItem=row?.item||{},definition=definitionFor(payload,rawItem.itemHash);
  if(!definition||Number(definition.itemType)!==WEAPON_ITEM_TYPE)return null;
  const identity=displayIdentity(payload,rawItem.itemHash),instance=payload?.profile?.itemComponents?.instances?.data?.[rawItem.itemInstanceId]||null,plugs=socketPlugs(payload,rawItem),socketOptions=armourModOptions(payload,rawItem),stats=payload?.profile?.itemComponents?.stats?.data?.[rawItem.itemInstanceId]||null,isExotic=String(identity.tier).toLowerCase()==='exotic',weaponSemantics=normaliseWeaponSemantics({profile:payload?.profile,item:rawItem,itemDefinition:definition,plugs,instance,stats,alternativeColumns:socketOptions,isExotic}),versionNumber=Number.isInteger(Number(rawItem?.versionNumber))?Number(rawItem.versionNumber):null,releaseWatermark=resolveItemWatermark({...rawItem,versionNumber},definition,{powerCapDefinitions:payload?.powerCapDefinitions,currentPowerCap:payload?.currentPowerCap}),weaponType=weaponTypeIdentity(definition);
  return {
    ...identity,itemHash:Number(rawItem.itemHash),itemInstanceId:String(rawItem.itemInstanceId||''),bucketHash:group.hash,storageBucketHash:finite(rawItem.bucketHash),source:clone(row.source),quantity:Math.max(1,Number(rawItem.quantity)||1),equipmentGroup:group,
    power:finite(instance?.primaryStat?.value),itemLevel:finite(instance?.itemLevel),gearTier:finite(instance?.gearTier),quality:finite(instance?.quality),state:Number(rawItem.state||0),versionNumber,releaseWatermark,tierIcon:releaseWatermark.icon,isExotic,
    weaponType:weaponType.label,weaponTypeId:weaponType.id,damageTypeHash:finite(instance?.damageTypeHash??definition?.defaultDamageTypeHash),elementDefinition:payload?.damageDefinitions?.[String(instance?.damageTypeHash??definition?.defaultDamageTypeHash)]||null,breakerDefinition:payload?.breakerDefinitions?.[String(instance?.breakerTypeHash??definition?.breakerTypeHash)]||null,
    socketsAvailable:Boolean(rawItem.itemInstanceId&&payload?.profile?.itemComponents?.sockets?.data?.[rawItem.itemInstanceId]),socketCoverage:{plugs,requested:plugs.map(plug=>Number(plug.hash)).filter(Number.isFinite),resolved:plugs.filter(plug=>plug.definition&&Object.keys(plug.definition).length).map(plug=>Number(plug.hash)),unresolved:plugs.filter(plug=>!plug.definition||!Object.keys(plug.definition).length).map(plug=>Number(plug.hash)),complete:plugs.every(plug=>plug.definition&&Object.keys(plug.definition).length)},socketOptions,
    weaponSemantics,intrinsic:weaponSemantics.intrinsic,selectedPerks:weaponSemantics.selectedPerks,weaponPerkModel:weaponSemantics.perkModel,weaponPerkRows:weaponSemantics.perkRows,weaponPerkRowCount:weaponSemantics.perkRowCount,exoticWeaponTraits:weaponSemantics.exoticTraits,weaponMasterwork:weaponSemantics.masterwork,weaponMod:weaponSemantics.mod,catalyst:weaponSemantics.catalyst,championCapability:weaponSemantics.champion,weaponStats:weaponSemantics.stats
  };
}

function normaliseVaultWorkspaceItem(payload,row){
  const rawItem=row?.item||{},definition=definitionFor(payload,rawItem.itemHash),equipmentBucket=finite(definition?.inventory?.bucketTypeHash),group=EQUIPMENT_GROUP_BY_HASH.get(equipmentBucket)||null;
  if(group?.kind==='armour'){
    const armour=normaliseArmourItem(payload,row);
    return armour?{...armour,quantity:Math.max(1,Number(rawItem.quantity)||1),equipmentGroup:group}:null;
  }
  if(group?.kind==='weapon'){
    return normaliseWeaponItem(payload,row,group);
  }
  if(row?.source?.kind!=='postmaster')return null;
  const identity=displayIdentity(payload,rawItem.itemHash);
  return {...identity,itemHash:Number(rawItem.itemHash),itemInstanceId:String(rawItem.itemInstanceId||''),bucketHash:equipmentBucket,storageBucketHash:finite(rawItem.bucketHash),quantity:Math.max(1,Number(rawItem.quantity)||1),source:clone(row.source),equipmentGroup:null,power:finite(payload?.profile?.itemComponents?.instances?.data?.[rawItem.itemInstanceId]?.primaryStat?.value)};
}

function sortVaultWorkspaceItems(items=[]){
  return [...(Array.isArray(items)?items:[])].sort((left,right)=>{
    const leftOrder=left?.equipmentGroup?.index??EQUIPMENT_GROUPS.length,rightOrder=right?.equipmentGroup?.index??EQUIPMENT_GROUPS.length;
    if(leftOrder!==rightOrder)return leftOrder-rightOrder;
    if(Boolean(left?.isExotic)!==Boolean(right?.isExotic))return left.isExotic?-1:1;
    if(Number(right?.power||0)!==Number(left?.power||0))return Number(right?.power||0)-Number(left?.power||0);
    return String(left?.name||'').localeCompare(String(right?.name||''));
  });
}

function groupVaultWorkspaceItems(items=[]){
  const sorted=sortVaultWorkspaceItems(items);
  return EQUIPMENT_GROUPS.map(group=>({...group,items:sorted.filter(item=>item?.equipmentGroup?.key===group.key)}));
}

function createVaultCatalogue(payload={}){
  const profile=payload?.profile||{};
  const rawRows=deduplicateRows(sourceRows(profile));
  const workspaceRows=rawRows.map(row=>normaliseVaultWorkspaceItem(payload,row)).filter(Boolean),items=sortVaultWorkspaceItems(workspaceRows.filter(item=>item.equipmentGroup)),armour=items.filter(item=>item.equipmentGroup?.kind==='armour'),postmasterItems=sortVaultWorkspaceItems(workspaceRows.filter(item=>item.source?.kind==='postmaster'));
  const stored=profile?.profileInventory?.data?.items||[];
  const vaultStored=stored.filter(item=>Number(item?.bucketHash)===VAULT_BUCKET);
  const vaultArmour=vaultStored.filter(item=>Number(definitionFor(payload,item?.itemHash)?.itemType)===ARMOUR_ITEM_TYPE).length;
  const postmasterByCharacter=Object.fromEntries(Object.entries(profile?.characterInventories?.data||{}).map(([characterId,row])=>[
    String(characterId),(row?.items||[]).filter(item=>Number(item?.bucketHash)===POSTMASTER_BUCKET).length
  ]));
  return {
    items,
    armour,
    postmasterItems,
    totals:{
      all:vaultStored.length,
      armour:vaultArmour,
      other:Math.max(0,vaultStored.length-vaultArmour),
      ownedArmour:armour.length,
      unresolvedDefinitions:rawRows.filter(row=>!definitionFor(payload,row?.item?.itemHash)).length
    },
    postmasterByCharacter
  };
}

function prepareArmourSelection(payload,items=[]){
  const selected=(Array.isArray(items)?items:[]).filter(Boolean).map(clone);
  return selected.map(item=>{
    const set=resolveArmourSet(payload,item,selected);
    if(!set)return item;
    return {...item,armourSemantics:{...(item.armourSemantics||{}),set},setBonus:set};
  });
}

function filterVaultArmour(items=[],filters={}){
  const search=String(filters.search||'').trim().toLowerCase();
  return (Array.isArray(items)?items:[]).filter(item=>{
    if(filters.characterClass&&filters.characterClass!=='all'&&item.characterClass!=='any'&&item.characterClass!==filters.characterClass)return false;
    if(filters.slot&&filters.slot!=='all'&&item.slotKey!==filters.slot)return false;
    if(filters.source&&filters.source!=='all'&&item.source?.kind!==filters.source)return false;
    if(search&&!String([item.name,item.description,item.slotLabel,item.characterClass,item.source?.label,item.archetype?.name,item.setBonus?.identity?.name].filter(Boolean).join(' ')).toLowerCase().includes(search))return false;
    return true;
  }).sort((left,right)=>{
    if(left.slotIndex!==right.slotIndex)return left.slotIndex-right.slotIndex;
    if(Boolean(left.isExotic)!==Boolean(right.isExotic))return left.isExotic?-1:1;
    if(right.totalStats!==left.totalStats)return right.totalStats-left.totalStats;
    return left.name.localeCompare(right.name);
  });
}

export {
  ARMOUR_BUCKETS,
  ARMOUR_ITEM_TYPE,
  CLASS_NAMES,
  EQUIPMENT_GROUPS,
  POSTMASTER_BUCKET,
  VAULT_BUCKET,
  WEAPON_BUCKETS,
  WEAPON_ITEM_TYPE,
  createVaultCatalogue,
  filterVaultArmour,
  groupVaultWorkspaceItems,
  itemKey,
  modFreeArmourStatValue,
  prepareArmourSelection,
  sortVaultWorkspaceItems
};
