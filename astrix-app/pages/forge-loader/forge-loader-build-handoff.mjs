import {bindingOf,bindingsEqual,compactBungieLoadouts,createHandoffEnvelope} from '../guardian-workspace-v2/paradox-build-binding.mjs';

const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';
const BUILD_SNAPSHOT_KEY='astrix:guardian-build-snapshot:v1';
const LAST_LOADOUT_KEY='astrix:paradox-last-bungie-loadout:v1';

const text=value=>String(value??'').trim();
const compactDisplayProperties=value=>({name:text(value?.name),description:text(value?.description),icon:text(value?.icon),highResIcon:text(value?.highResIcon)});
const compactPlugRules=value=>Array.isArray(value)?value.map(row=>({failureMessage:text(row?.failureMessage)})).filter(row=>row.failureMessage):[];
const compactTooltipNotifications=value=>Array.isArray(value)?value.map(row=>({displayString:text(row?.displayString??row?.displayText),displayStyle:text(row?.displayStyle)})).filter(row=>row.displayString):[];
const compactLoadouts=compactBungieLoadouts;
function compactDefinition(value={}){
  const insertionRules=compactPlugRules(value?.plug?.insertionRules),enabledRules=compactPlugRules(value?.plug?.enabledRules),tooltipNotifications=compactTooltipNotifications(value?.tooltipNotifications),plug=value?.plug?{plugCategoryIdentifier:text(value.plug.plugCategoryIdentifier),energyCost:value.plug.energyCost??null}:null;
  if(plug&&insertionRules.length)plug.insertionRules=insertionRules;if(plug&&enabledRules.length)plug.enabledRules=enabledRules;
  const compact={
    hash:Number(value?.hash)||null,
    displayProperties:compactDisplayProperties(value?.displayProperties),
    itemType:Number.isFinite(Number(value?.itemType))?Number(value.itemType):null,
    itemTypeDisplayName:text(value?.itemTypeDisplayName),
    traitIds:Array.isArray(value?.traitIds)?value.traitIds.map(text).filter(Boolean):[],
    inventory:value?.inventory?{tierType:Number(value.inventory.tierType)||0,tierTypeName:text(value.inventory.tierTypeName),tierTypeHash:Number(value.inventory.tierTypeHash)||null,bucketTypeHash:Number(value.inventory.bucketTypeHash)||null}:null,
    plug,
    investmentStats:Array.isArray(value?.investmentStats)?value.investmentStats.map(row=>({statTypeHash:Number(row?.statTypeHash)||null,value:Number(row?.value)||0,isConditionallyActive:Boolean(row?.isConditionallyActive)})):[],
    defaultDamageTypeHash:Number(value?.defaultDamageTypeHash)||null,
    breakerTypeHash:Number(value?.breakerTypeHash)||null,
    iconWatermark:text(value?.iconWatermark),
    quality:value?.quality?{displayVersionWatermarkIcons:Array.isArray(value.quality.displayVersionWatermarkIcons)?value.quality.displayVersionWatermarkIcons.map(text).filter(Boolean):[]}:null,
    equipableItemSetHash:Number(value?.equipableItemSetHash)||null,
    equippingBlock:value?.equippingBlock?{equipableItemSetHash:Number(value.equippingBlock.equipableItemSetHash)||null}:null
  };if(tooltipNotifications.length)compact.tooltipNotifications=tooltipNotifications;return compact;
}
function compactValue(value,key=''){
  if(value===null||value===undefined||typeof value!=='object')return value;
  if(['definition','socketCategoryDefinition','elementDefinition','breakerDefinition'].includes(key))return compactDefinition(value);
  if(Array.isArray(value))return value.map(row=>compactValue(row));
  const output={};
  for(const [childKey,childValue] of Object.entries(value)){
    if(['itemRenderData','gearAssets','renderData','loadouts','resolvedSandboxPerks','socketOptions'].includes(childKey))continue;
    output[childKey]=compactValue(childValue,childKey);
  }
  return output;
}

function compactForgeLoaderProfileBuild(profileBuild={},binding={}){
  const subclassBuild=profileBuild.subclassBuild&&typeof profileBuild.subclassBuild==='object'?profileBuild.subclassBuild:{};
  return {
    version:1,
    capturedAt:new Date().toISOString(),
    source:'bungie-live',
    characterId:text(binding.characterId),
    membershipId:text(binding.membershipId),
    membershipType:text(binding.membershipType),
    characterClass:profileBuild.characterClass||'',
    displayName:profileBuild.displayName||'Guardian',
    power:profileBuild.power??null,
    guardianRank:profileBuild.guardianRank??null,
    titleHash:profileBuild.titleHash??null,
    title:profileBuild.title||'',
    selectedLoadoutIndex:Number.isInteger(profileBuild.selectedLoadoutIndex)?profileBuild.selectedLoadoutIndex:null,
    subclass:profileBuild.subclass||'',
    subclassName:profileBuild.subclassName||'',
    subclassIcon:profileBuild.subclassIcon||'',
    subclassItemInstanceId:text(profileBuild.subclassItemInstanceId||profileBuild.subclassItem?.itemInstanceId),
    subclassItem:compactValue(profileBuild.subclassItem||null),
    subclassCatalog:compactValue(profileBuild.subclassCatalog||[]),
    subclassBuild:compactValue(subclassBuild),
    super:compactValue(profileBuild.super??subclassBuild.super??null),
    abilities:compactValue(profileBuild.abilities||subclassBuild.abilities||[]),
    aspects:compactValue(profileBuild.aspects||subclassBuild.aspects||[]),
    fragments:compactValue(profileBuild.fragments||subclassBuild.fragments||[]),
    artifact:compactValue(profileBuild.artifact||null),
    artifactConfiguration:compactValue(profileBuild.artifactConfiguration||profileBuild.artifact?.artifactConfiguration||null),
    availableArtifacts:compactValue(profileBuild.availableArtifacts||[]),
    artifactOptions:compactValue(profileBuild.artifactOptions||[]),
    currentSeasonNumber:Number.isInteger(Number(profileBuild.currentSeasonNumber))?Number(profileBuild.currentSeasonNumber):null,
    currentSeason:compactValue(profileBuild.currentSeason||null),
    loadoutsAvailable:profileBuild.loadoutsAvailable===true,
    loadouts:compactLoadouts(profileBuild.loadouts||[]),
    weapons:compactValue(profileBuild.weapons||[]),
    ownedWeapons:compactValue(profileBuild.ownedWeapons||profileBuild.weapons||[]),
    armour:compactValue(profileBuild.armour||[]),
    mods:compactValue(profileBuild.mods||profileBuild.armourMods||[]),
    stats:compactValue(profileBuild.stats||[]),
    emblem:compactValue(profileBuild.emblem||null),
    ghost:compactValue(profileBuild.ghost||null),
    shader:compactValue(profileBuild.shader||null),
    ornaments:compactValue(profileBuild.ornaments||[]),
    hashCoverage:compactValue(profileBuild.hashCoverage||null),
    semanticCoverage:compactValue(profileBuild.semanticCoverage||null),
    paradoxAnalysis:null,
    weaponRollAdvice:null,
    locks:{},
    objective:null,
    activityContext:null
  };
}

function createForgeLoaderBuildSnapshot(profileBuild={},binding={}){
  const expected={
    characterId:text(binding.characterId),
    membershipId:text(binding.membershipId),
    membershipType:text(binding.membershipType)
  };
  if(!expected.characterId||!expected.membershipId||!expected.membershipType)return null;
  if(text(profileBuild.characterId)!==expected.characterId)return null;
  const source=compactForgeLoaderProfileBuild(profileBuild,expected);
  if(!bindingsEqual(bindingOf(source),expected))return null;
  return createHandoffEnvelope(source);
}

function writeForgeLoaderBuildSnapshot(profileBuild,binding,{stores=[],snapshotEnvelope=null}={}){
  let envelope=null,json='';
  try{
    envelope=snapshotEnvelope||createForgeLoaderBuildSnapshot(profileBuild,binding);
    if(!envelope)return false;
    if(!bindingsEqual(bindingOf(envelope.binding||{}),binding))return false;
    json=JSON.stringify(envelope);
  }catch{return false;}
  let stored=false;
  for(const store of stores){
    if(!store)continue;
    try{
      store.removeItem(BUILD_SPACE_KEY);
      store.removeItem(BUILD_SNAPSHOT_KEY);
      store.setItem(BUILD_SNAPSHOT_KEY,json);
      stored=true;
    }catch{
      try{
        store.removeItem(LAST_LOADOUT_KEY);
        store.setItem(BUILD_SNAPSHOT_KEY,json);
        stored=true;
      }catch{}
    }
  }
  return stored;
}

export {BUILD_SNAPSHOT_KEY,BUILD_SPACE_KEY,LAST_LOADOUT_KEY,compactLoadouts,compactForgeLoaderProfileBuild,createForgeLoaderBuildSnapshot,writeForgeLoaderBuildSnapshot};
