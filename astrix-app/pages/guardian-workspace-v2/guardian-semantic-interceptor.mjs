import "./guardian-paradox-live-adapter.mjs?v=20260905-weapon-audit-1";
import { resolveArmourSet } from "./guardian-armour-set-resolver.mjs";
import {characterPlugSetsForItem} from '../../core/bungie-profile-plugs.mjs';
import {
  classifyArmourPlug,
  normaliseArmourSemantics,
  normaliseWeaponSemantics,
  normaliseGuardianStats,
  validateArtifact
} from "./guardian-semantic-resolver.mjs?v=20260905-weapon-audit-1&roll=20260909-apply-1";

const rawFetch=globalThis.fetch?.bind(globalThis);
let livePayload=null;
const loadoutPayloads=new Map();

function rememberPayload(url,payload){
  if(!payload||typeof payload!=="object")return;
  if(url.includes("/bungie/profile"))livePayload=payload;
  if(url.includes("/bungie/loadout")){
    const characterId=String(payload.characterId||"");
    const index=Number(payload.index);
    if(characterId&&Number.isInteger(index))loadoutPayloads.set(`${characterId}:${index}`,payload);
  }
}

document.addEventListener("forge:manifest-payload-hydrated",event=>{
  const payload=event.detail;
  rememberPayload(Array.isArray(payload?.selectedItems)?"/bungie/loadout":"/bungie/profile",payload);
});

if(rawFetch){
  globalThis.fetch=async (...args)=>{
    const response=await rawFetch(...args);
    try{
      const url=String(args[0]?.url||args[0]||"");
      if((url.includes("/bungie/profile")||url.includes("/bungie/loadout"))&&typeof response?.clone==="function"){
        const clone=response.clone();
        const payload=await clone.json().catch(()=>null);
        rememberPayload(url,payload);
      }
    }catch(error){
      console.warn("[Forge semantics] raw payload capture failed",String(error));
    }
    return response;
  };
}

function payloadFor(detail){
  const characterId=String(detail?.characterId||"");
  const index=Number(detail?.selectedLoadoutIndex);
  if(detail?.loadoutSource==="bungie-live"&&characterId&&Number.isInteger(index)){
    return loadoutPayloads.get(`${characterId}:${index}`)||livePayload;
  }
  return livePayload;
}

function profileFor(detail,payload){
  return payload?.profile||livePayload?.profile||null;
}

function rawEquipment(detail,payload,profile){
  if(detail?.loadoutSource==="bungie-live"&&Array.isArray(payload?.selectedItems))return payload.selectedItems;
  return profile?.characterEquipment?.data?.[String(detail?.characterId||"")]?.items||[];
}

function definitionFor(payload,hash){
  return payload?.definitions?.[String(hash)]||livePayload?.definitions?.[String(hash)]||null;
}

function rawItemFor(normalised,rows,payload){
  if(!normalised)return null;
  const instanceId=String(normalised.itemInstanceId||'');
  if(instanceId){
    const exact=(rows||[]).find(item=>String(item?.itemInstanceId||'')===instanceId);
    if(exact)return exact;
  }
  const bucket=Number(normalised.bucketHash);
  const candidates=(rows||[]).filter(item=>{
    const def=definitionFor(payload,item.itemHash);
    return Number(def?.inventory?.bucketTypeHash)===bucket;
  });
  return candidates.find(item=>Number(item.itemHash)===Number(normalised.hash))||candidates[0]||null;
}

function allOwnedItems(profile){
  return [
    ...(profile?.profileInventory?.data?.items||[]),
    ...Object.values(profile?.characterInventories?.data||{}).flatMap(row=>row?.items||[]),
    ...Object.values(profile?.characterEquipment?.data||{}).flatMap(row=>row?.items||[])
  ];
}

function statContributions(payload,definition){
  return (definition?.investmentStats||[]).map(row=>{
    const hash=Number(row?.statTypeHash),stat=payload?.statDefinitions?.[String(hash)]||livePayload?.statDefinitions?.[String(hash)]||null;
    return {hash:Number.isInteger(hash)?hash:null,name:String(stat?.displayProperties?.name||''),value:Number(row?.value||0),isConditionallyActive:Boolean(row?.isConditionallyActive)};
  }).filter(row=>row.hash&&Number.isFinite(row.value)&&row.value!==0);
}

function enrichedPlugs(normalised,rawItem,profile){
  const plugs=normalised?.socketCoverage?.plugs||[];
  if(!rawItem?.itemInstanceId)return plugs;
  const states=profile?.itemComponents?.sockets?.data?.[rawItem.itemInstanceId]?.sockets||[];
  const occurrences=new Map();
  return plugs.map(plug=>{
    const hash=Number(plug?.hash);
    const matchingIndexes=states.map((state,index)=>Number(state?.plugHash)===hash?index:-1).filter(index=>index>=0);
    const occurrence=occurrences.get(hash)||0;
    const socketIndex=matchingIndexes[occurrence]??-1;
    occurrences.set(hash,occurrence+1);
    const state=socketIndex>=0?states[socketIndex]:null;
    return {
      ...plug,
      socketIndex:socketIndex>=0?socketIndex:null,
      isEnabled:state?state.isEnabled!==false:true,
      isVisible:state?state.isVisible!==false:true
    };
  });
}

function alternativeColumnsFor(rawItem,profile,payload){
  if(!rawItem?.itemInstanceId)return {};
  const reusable=profile?.itemComponents?.reusablePlugs?.data?.[rawItem.itemInstanceId]?.plugs||{};
  const itemDefinition=definitionFor(payload,rawItem.itemHash),entries=itemDefinition?.sockets?.socketEntries||[],indexes=new Set([...Object.keys(reusable).map(Number),...entries.map((_,index)=>index)]),profileSets=profile?.profilePlugSets?.data?.plugs||{},characterSets=characterPlugSetsForItem(profile,rawItem);
  return Object.fromEntries([...indexes].sort((a,b)=>a-b).map(socketIndex=>{
    const entry=entries[socketIndex]||{},setHashes=[entry?.reusablePlugSetHash].map(Number).filter(hash=>Number.isInteger(hash)&&hash>0),setRows=setHashes.flatMap(hash=>[...(profileSets?.[String(hash)]||[]),...characterSets.flatMap(sets=>sets?.[String(hash)]||[])]),rows=[...(reusable?.[String(socketIndex)]||[]),...setRows],seen=new Set();
    return [String(socketIndex),rows.map(row=>{
      const hash=Number(row?.plugItemHash??row?.plugHash);
      const definition=definitionFor(payload,hash);
      if(!Number.isInteger(hash)||seen.has(hash))return null;seen.add(hash);
      const category=(itemDefinition?.sockets?.socketCategories||[]).find(item=>(item?.socketIndexes||[]).map(Number).includes(Number(socketIndex)))||null;
      const socketCategoryHash=Number(category?.socketCategoryHash);
      const socketCategoryDefinition=Number.isFinite(socketCategoryHash)?payload?.socketCategoryDefinitions?.[String(socketCategoryHash)]||null:null;
      return {hash,bungieHash:hash,name:definition?.displayProperties?.name||`Unresolved Destiny definition ${hash}`,description:definition?.displayProperties?.description||"",icon:definition?.displayProperties?.icon||"",definition,socketIndex:Number(socketIndex),socketCategoryHash:Number.isFinite(socketCategoryHash)?socketCategoryHash:null,socketCategoryDefinition,socketTypeHash:entry.socketTypeHash??null,canInsert:row.canInsert===true,isEnabled:row.enabled,source:'bungie-profile-reusable-plugs',unresolved:!definition,statContributions:statContributions(payload,definition)};
    }).filter(Boolean)
  ]}).filter(([,rows])=>rows.length));
}

function instanceData(profile,rawItem){
  if(!rawItem?.itemInstanceId)return null;
  return profile?.itemComponents?.instances?.data?.[rawItem.itemInstanceId]||null;
}

function statData(profile,rawItem){
  if(!rawItem?.itemInstanceId)return null;
  return profile?.itemComponents?.stats?.data?.[rawItem.itemInstanceId]||null;
}

function armourEvidence(item){
  const semantic=item?.armourSemantics;
  if(!semantic)return [];
  const rows=[];
  const add=(source,role)=>{
    if(!source)return;
    rows.push({
      sourceKind:"armour",
      sourceHash:Number(source.hash)||null,
      sourceName:source.name||"Armour effect",
      semanticRole:role,
      description:source.description||"",
      verified:Boolean(source.definition&&Object.keys(source.definition).length),
      active:source.active!==false&&source.isEnabled!==false
    });
  };
  add(semantic.exoticPerk,"exotic-perk");
  add(semantic.archetype,"archetype");
  add(semantic.set?.twoPiece,"set-bonus-2");
  add(semantic.set?.fourPiece,"set-bonus-4");
  semantic.generalMods.forEach(mod=>add(mod,"general-mod"));
  semantic.slotMods.forEach(mod=>add(mod,"slot-mod"));
  return rows;
}

function enrichArmour(detail,payload,profile,rows){
  const equippedArmour=(detail.armour||[]).filter(Boolean);
  detail.armour=(detail.armour||[]).map(item=>{
    if(!item)return item;
    const rawItem=rawItemFor(item,rows,payload);
    const plugs=enrichedPlugs(item,rawItem,profile);
    const armourSemantics=normaliseArmourSemantics({
      plugs,
      instance:instanceData(profile,rawItem),
      stats:statData(profile,rawItem)
    });
    armourSemantics.stats=Object.fromEntries(Object.entries(armourSemantics.stats||{}).map(([hash,row])=>{
      const definition=payload?.statDefinitions?.[String(hash)]||livePayload?.statDefinitions?.[String(hash)]||null;
      const value=Number(row?.value??row);
      return [String(hash),{
        ...(row&&typeof row==="object"?row:{}),
        hash:Number(hash),
        name:String(definition?.displayProperties?.name||row?.name||""),
        icon:String(definition?.displayProperties?.icon||row?.icon||""),
        value:Number.isFinite(value)?value:0
      }];
    }));
    const exactSet=resolveArmourSet(payload,item,equippedArmour);
    if(exactSet)armourSemantics.set=exactSet;
    const masterworkSlot=armourSemantics.masterwork?{
      ...armourSemantics.masterwork,
      semanticRole:"masterwork",
      energyCost:armourSemantics.tier
    }:null;
    const cachedMods=Array.isArray(item.mods)?item.mods:[];
    const cachedGeneralMods=cachedMods.filter(plug=>classifyArmourPlug(plug)==="general-mod");
    const cachedSlotMods=cachedMods.filter(plug=>classifyArmourPlug(plug)==="slot-mod");
    const generalMods=armourSemantics.generalMods.length>=cachedGeneralMods.length?armourSemantics.generalMods:cachedGeneralMods;
    const slotMods=armourSemantics.slotMods.length>=cachedSlotMods.length?armourSemantics.slotMods:cachedSlotMods;
    armourSemantics.generalMods=generalMods;
    armourSemantics.slotMods=slotMods;
    const resolvedFunctionalMods=[...generalMods,...slotMods];
    return {
      ...item,
      itemInstanceId:rawItem?.itemInstanceId||null,
      armourSemantics,
      armourTier:armourSemantics.tier,
      masterwork:armourSemantics.masterwork,
      energy:armourSemantics.energy,
      archetype:armourSemantics.archetype||item.archetype||null,
      exoticPerk:armourSemantics.exoticPerk,
      setBonus:armourSemantics.set,
      generalMods,
      slotMods,
      armourModOptions:alternativeColumnsFor(rawItem,profile,payload),
      // Position 1 is permanently reserved for the verified armour upgrade
      // level. The following five positions retain Bungie's socket order.
      // Do not erase Bungie's cached socket list when the original network
      // payload is unavailable and semantic reclassification is incomplete.
      mods:resolvedFunctionalMods.length
        ? [masterworkSlot,...generalMods.slice(0,2),...slotMods.slice(0,3)]
        : cachedMods,
      intrinsicTrait:armourSemantics.exoticPerk||item.intrinsicTrait||null
    };
  });
}

function enrichWeaponCollection(collection,payload,profile,rows){
  return (collection||[]).map(item=>{
    if(!item)return item;
    const rawItem=rawItemFor(item,rows,payload);
    const plugs=enrichedPlugs(item,rawItem,profile);
    const weaponInstance=instanceData(profile,rawItem);
    const weaponSemantics=normaliseWeaponSemantics({
      profile,
      item:rawItem,
      itemDefinition:item?.definition||definitionFor(payload,rawItem?.itemHash),
      plugs,
      instance:weaponInstance,
      stats:statData(profile,rawItem),
      alternativeColumns:alternativeColumnsFor(rawItem,profile,payload),
      isExotic:item?.isExotic===true||Number(item?.tierType??item?.definition?.inventory?.tierType)===6
    });
    return {
      ...item,
      itemInstanceId:rawItem?.itemInstanceId||null,
      gearTier:Number.isInteger(Number(item?.gearTier))?Number(item.gearTier):(Number.isInteger(Number(weaponInstance?.gearTier))?Number(weaponInstance.gearTier):null),
      weaponSemantics,
      intrinsic:weaponSemantics.intrinsic,
      selectedPerks:weaponSemantics.selectedPerks,
      weaponPerkModel:weaponSemantics.perkModel,
      weaponPerkRows:weaponSemantics.perkRows,
      weaponPerkRowCount:weaponSemantics.perkRowCount,
      exoticWeaponTraits:weaponSemantics.exoticTraits,
      weaponMasterwork:weaponSemantics.masterwork,
      weaponMod:weaponSemantics.mod,
      catalyst:weaponSemantics.catalyst,
      championCapability:weaponSemantics.champion,
      weaponStats:weaponSemantics.stats
    };
  });
}

function enrichWeapons(detail,payload,profile,rows){
  detail.weapons=enrichWeaponCollection(detail.weapons,payload,profile,rows);
  detail.ownedWeapons=enrichWeaponCollection(detail.ownedWeapons,payload,profile,allOwnedItems(profile));
}

function aggregateCoverage(items=[]){
  const requested=[];
  const resolved=[];
  const unresolved=[];
  const semanticUnknown=[];
  for(const item of items.filter(Boolean)){
    requested.push(...(item.socketCoverage?.requested||[]));
    resolved.push(...(item.socketCoverage?.resolved||[]));
    unresolved.push(...(item.socketCoverage?.unresolved||[]));
    const semantics=item.armourSemantics||item.weaponSemantics;
    semanticUnknown.push(...(semantics?.unknownPlugs||[]).map(plug=>Number(plug.hash)).filter(Number.isFinite));
    if(semantics?.set?.unresolved&&Number.isInteger(Number(semantics.set.hash)))semanticUnknown.push(Number(semantics.set.hash));
  }
  return {
    requested:[...new Set(requested.map(Number))],
    resolved:[...new Set(resolved.map(Number))],
    unresolved:[...new Set(unresolved.map(Number))],
    semanticUnknown:[...new Set(semanticUnknown)],
    complete:unresolved.length===0&&semanticUnknown.length===0
  };
}

function enrich(detail){
  if(!detail||detail.source!=="bungie-live")return detail;
  const payload=payloadFor(detail);
  const profile=profileFor(detail,payload);
  if(!profile)return detail;
  const rows=rawEquipment(detail,payload,profile);
  enrichArmour(detail,payload,profile,rows);
  enrichWeapons(detail,payload,profile,rows);
  detail.statModel=normaliseGuardianStats(detail.stats||[]);
  detail.artifactValidation=validateArtifact(detail.artifact);
  detail.hashCoverage=detail.hashCoverage||{};
  detail.hashCoverage.armour=aggregateCoverage(detail.armour);
  detail.hashCoverage.weapons=aggregateCoverage(detail.weapons);
  detail.hashCoverage.ownedWeapons=aggregateCoverage(detail.ownedWeapons);
  detail.hashCoverage.armourSets=payload.armourSetCoverage||null;
  detail.paradoxEvidence=detail.paradoxEvidence||{};
  detail.paradoxEvidence.armour=detail.armour.flatMap(armourEvidence).filter(row=>row.active&&row.verified);
  detail.paradoxEvidence.artifact=(detail.artifact?.activePerks||[]).map(perk=>({
    sourceKind:"artifact",
    sourceHash:Number(perk.hash)||null,
    sourceName:perk.name||"Artifact perk",
    semanticRole:"artifact-applied-perk",
    description:perk.description||"",
    verified:Boolean(perk.definition&&Object.keys(perk.definition).length),
    active:true
  })).filter(row=>row.verified);
  return detail;
}

document.addEventListener("forge:guardian-selection-changed",event=>{
  try{enrich(event.detail);}
  catch(error){console.error("[Forge semantics] enrichment failed",error);}
});

export {enrich};
