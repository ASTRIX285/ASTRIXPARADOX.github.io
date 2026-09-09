import {getBungieSession} from "./guardian-bungie-auth.mjs?v=20260905-manual-editor-1";
import {createArtifactConfiguration,resolveArtifactByProvenance} from "./guardian-artifact-provenance.mjs";
import {subclassPlugComponent} from "./guardian-subclass-plug-classifier.mjs";
import {normaliseWeaponSemantics} from "./guardian-semantic-resolver.mjs?v=20260905-weapon-audit-1&roll=20260909-apply-1";
import {guardianManifest} from "./guardian-manifest-service.mjs?v=20260906-all-page-data-1&roll=20260909-apply-1";
import {createBuildState} from "./paradox-build-space/paradox-build-state.mjs";
import {createHandoffEnvelope} from "./paradox-build-binding.mjs";
import {mergeSubclassCatalog} from "./guardian-super-catalog.mjs?v=20260829-subclass-identity-1";
import {paradoxDefinitionId,resolveItemWatermark,weaponTypeIdentity} from '../../core/bungie-item-identity.mjs';
import {characterPlugSetsForItem} from '../../core/bungie-profile-plugs.mjs';
import {assertRenderablePagePayload} from '../../core/page-ready-contract.mjs?v=20260906-page-data-recovery-1';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';
import {
  cacheBungieProfile,
  readCachedBungieProfile,
  cacheBungieLoadoutDetail,
  readCachedBungieLoadoutDetail,
  invalidateBungieLoadoutDetail
} from "./guardian-session-cache.mjs?v=20260906-all-page-data-1";

const BUNGIE_ORIGIN="https://www.bungie.net";
const CLASS_NAMES=["titan","hunter","warlock"];
const BUCKETS={kinetic:1498876634,energy:2465295065,power:953998645,helmet:3448274439,gauntlets:3551918588,chest:14239492,legs:20886954,classItem:1585787867,ghost:4023194814,subclass:3284755031};
const ARMOUR_ORDER=[BUCKETS.helmet,BUCKETS.gauntlets,BUCKETS.chest,BUCKETS.legs,BUCKETS.classItem];
const WEAPON_ORDER=[BUCKETS.kinetic,BUCKETS.energy,BUCKETS.power];
const STAT_ORDER=[
  2996146975,
  392767087,
  1943323491,
  1735777505,
  144602215,
  4244567218
];
const SELECTED_CHARACTER_KEY="astrix:selected-character-id";
const SELECTED_LOADOUT_KEY="astrix:selected-bungie-loadout-v1";
const BUILD_SPACE_KEY="astrix:paradox-build-space:v1";
const BUILD_SNAPSHOT_KEY="astrix:guardian-build-snapshot:v1";
const loadoutCache=new Map();
const invalidatedLoadoutCacheKeys=new Set();
let liveProfilePayload=null;
let liveProfileSession=null;
let fixtureProfileDetail=null;
let latestResolvedBuild=null;
let authenticatedSession=globalThis.FORGE_BUNGIE_SESSION?.authenticated?globalThis.FORGE_BUNGIE_SESSION:null;
let explicitlySelectedCharacterId="";
let preparedPagePayloadResolved=false;
let resolvePreparedPagePayload=()=>{};
if(!globalThis.FORGE_PAGE_PAYLOAD_PROMISE)globalThis.FORGE_PAGE_PAYLOAD_PROMISE=new Promise(resolve=>{resolvePreparedPagePayload=resolve;});

const currentAuthenticatedSession=()=>authenticatedSession?.authenticated?authenticatedSession:(globalThis.FORGE_BUNGIE_SESSION?.authenticated?globalThis.FORGE_BUNGIE_SESSION:null);
const isFixtureDetail=detail=>detail?.source==="paradox-beta-fixture";

const cloneBuildValue=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
function resolvedBuildSnapshot(detail={}){
  const characterId=String(detail.characterId||detail.fixtureId||"");
  if(!characterId)return null;
  const sourceBuild=detail.subclassBuild&&typeof detail.subclassBuild==="object"?detail.subclassBuild:{};
  const superItem=detail.super??sourceBuild.super??null;
  const abilities=Array.isArray(detail.abilities)?detail.abilities:Array.isArray(sourceBuild.abilities)?sourceBuild.abilities:[];
  const aspects=Array.isArray(detail.aspects)?detail.aspects:Array.isArray(sourceBuild.aspects)?sourceBuild.aspects:[];
  const fragments=Array.isArray(detail.fragments)?detail.fragments:Array.isArray(sourceBuild.fragments)?sourceBuild.fragments:[];
  const membership=liveProfileSession?.activeDestinyMembership||detail.membership||{};
  const subclassBuild={...cloneBuildValue(sourceBuild),super:cloneBuildValue(superItem),abilities:cloneBuildValue(abilities),aspects:cloneBuildValue(aspects),fragments:cloneBuildValue(fragments)};
  return {
    version:1,
    capturedAt:new Date().toISOString(),
    source:detail.source||detail.loadoutSource||"current-guardian",
    characterId,
    membershipId:String(detail.membershipId||detail.bungieMembershipId||membership.membershipId||""),
    membershipType:String(detail.membershipType??membership.membershipType??""),
    characterClass:detail.characterClass||detail.className||"",
    displayName:detail.displayName||"Guardian",
    selectedLoadoutIndex:Number.isInteger(detail.selectedLoadoutIndex)?detail.selectedLoadoutIndex:null,
    subclass:detail.subclass||"",
    subclassName:detail.subclassName||"",
    subclassIcon:detail.subclassIcon||"",
    subclassItemInstanceId:String(detail.subclassItemInstanceId||detail.subclassItem?.itemInstanceId||""),
    subclassItem:cloneBuildValue(detail.subclassItem||null),
    subclassCatalog:cloneBuildValue(detail.subclassCatalog||[]),
    subclassBuild,
    super:cloneBuildValue(superItem),
    abilities:cloneBuildValue(abilities),
    aspects:cloneBuildValue(aspects),
    fragments:cloneBuildValue(fragments),
    weapons:cloneBuildValue(detail.weapons||[]),
    ownedWeapons:cloneBuildValue(detail.ownedWeapons||detail.weapons||[]),
    armour:cloneBuildValue(detail.armour||[]),
    mods:cloneBuildValue(detail.mods||detail.armourMods||[]),
    artifact:cloneBuildValue(detail.artifact||null),
    artifactConfiguration:cloneBuildValue(detail.artifactConfiguration||detail.artifact?.artifactConfiguration||null),
    availableArtifacts:cloneBuildValue(detail.availableArtifacts||[]),
    artifactOptions:cloneBuildValue(detail.artifactOptions||[]),
    currentSeasonNumber:Number.isInteger(Number(detail.currentSeasonNumber))?Number(detail.currentSeasonNumber):null,
    currentSeason:cloneBuildValue(detail.currentSeason||null),
    stats:cloneBuildValue(detail.stats||[]),
    hashCoverage:cloneBuildValue(detail.hashCoverage||null),
    semanticCoverage:cloneBuildValue(detail.semanticCoverage||null),
    paradoxAnalysis:cloneBuildValue(detail.paradoxAnalysis||null),
    weaponRollAdvice:cloneBuildValue(detail.weaponRollAdvice||null)
  };
}
function rememberResolvedBuild(detail={}){const snapshot=resolvedBuildSnapshot(detail);if(snapshot)latestResolvedBuild=snapshot;return snapshot;}
function persistResolvedBuildSnapshot(){
  if(!latestResolvedBuild?.characterId)return false;
  const envelope=createHandoffEnvelope(createBuildState(latestResolvedBuild));
  const json=JSON.stringify(envelope);
  let stored=false;
  for(const store of [sessionStorage,localStorage]){try{store.removeItem(BUILD_SPACE_KEY);store.setItem(BUILD_SNAPSHOT_KEY,json);stored=true;}catch{}}
  return stored;
}

const setRenderStatus=(title,message,detail="")=>{
  const host=document.querySelector("#guardianHero.guardian-render-status");
  if(!host)return;
  const heading=host.querySelector("strong");
  const messageNode=host.querySelector(":scope > span:not(.guardian-render-status__icon)");
  const detailNode=host.querySelector("small");
  if(heading)heading.textContent=title;
  if(messageNode)messageNode.textContent=message;
  if(detailNode)detailNode.textContent=detail;
};

function setSourceCaption(detail={},source="bungie-live"){
  const title=document.getElementById("stageStateTitle");
  const message=document.getElementById("stageStateMessage");
  if(title)title.textContent=source==="bungie-live"?"GUARDIAN PROFILE ACTIVE":"FIXTURE PROFILE ACTIVE";
  if(!message)return;
  const characterClass=String(detail.className||detail.characterClass||"Guardian").toUpperCase();
  const subclass=String(detail.subclassName||detail.subclass||"Subclass").toUpperCase();
  const caption=document.createElement("small");
  caption.style.color="#8e7bb0";
  caption.textContent=source==="bungie-live"&&detail.loadoutSource==="currently-equipped"?"Currently equipped items · active Guardian default":source==="bungie-live"?"Live Bungie Guardian":"Guardian data ready";
  message.replaceChildren(document.createTextNode(`${characterClass} · ${subclass}`),document.createElement("br"),caption);
}

function setLiveProfileUnavailable(message){
  const stage=document.querySelector(".stage");
  const title=document.getElementById("stageStateTitle");
  const detail=document.getElementById("stageStateMessage");
  if(stage)stage.dataset.state="error";
  if(title)title.textContent="LIVE PROFILE UNAVAILABLE";
  if(detail)detail.textContent=`${message} Retry or reconnect Bungie.`;
}

function blockAuthenticatedFixture(event){
  if(!isFixtureDetail(event.detail)||!currentAuthenticatedSession())return;
  event.stopImmediatePropagation();
}

// The profile route returns the definitions required for the initial display.
// The browser only joins that prepared payload; it must not fan out definition
// requests while the portal is waiting at the authenticated profile gate.
const INITIAL_PROFILE_HYDRATION=Object.freeze({equippedOnly:true,allowNetwork:false});

function currentPagePayloadKind(){
  return location.pathname.includes('/pages/journey/')?'journey':location.pathname.includes('/paradox-build-space/')?'build-forge':'character';
}

const PROFILE_RUNTIME_ENABLED=location.pathname.includes('/pages/guardian-workspace-v2/');

async function hydrateManifestPayload(payload,options={}){
  await guardianManifest.hydratePayload(payload,options);
  document.dispatchEvent(new CustomEvent("forge:manifest-payload-hydrated",{detail:payload}));
  return payload;
}

const absoluteIcon=path=>path?new URL(path,BUNGIE_ORIGIN).toString():"";
const definition=(definitions,hash)=>definitions?.[String(hash)]||null;
const displayItem=(definitions,hash)=>{
  const row=definition(definitions,hash)||{};
  const displays=[row.displayProperties,...(row.resolvedSandboxPerks||[]).map(perk=>perk?.displayProperties)].filter(Boolean);
  const displayValue=key=>displays.find(display=>display?.[key])?.[key]||"";
  return {hash:Number(hash),bungieHash:Number(hash),paradoxId:paradoxDefinitionId('DestinyInventoryItemDefinition',hash),name:displayValue("name")||`Unresolved Destiny item ${hash}`,description:displayValue("description"),icon:absoluteIcon(displayValue("icon")),tier:row.inventory?.tierTypeName||"",tierType:Number(row.inventory?.tierType??0),tierTypeHash:row.inventory?.tierTypeHash??null,tierIcon:resolveItemWatermark({},row).icon,itemTypeDisplayName:row.itemTypeDisplayName||"",bucketHash:row.inventory?.bucketTypeHash??null,definition:row};
};

function classifySubclass(item){
  const text=[item?.name,item?.description,...(item?.definition?.traitIds||[])].join(" ").toLowerCase();
  for(const name of ["prismatic","strand","stasis","solar","arc","void"]){if(text.includes(name))return name;}
  return "void";
}

function activeCharacter(profile){
  const rows=Object.values(profile?.characters?.data||{});
  return rows.sort((a,b)=>String(b.dateLastPlayed||"").localeCompare(String(a.dateLastPlayed||"")))[0]||null;
}

function rememberCharacterId(characterId){
  try{sessionStorage.setItem(SELECTED_CHARACTER_KEY,String(characterId||""));}
  catch{}
}

function rememberLoadoutSelection(characterId,index){
  try{localStorage.setItem(SELECTED_LOADOUT_KEY,JSON.stringify({characterId:String(characterId||""),index:Number(index)}));}
  catch{}
}

function forgetLoadoutSelection(){
  try{localStorage.removeItem(SELECTED_LOADOUT_KEY);}
  catch{}
}

function guardianRank(profile){
  const progression=profile?.profileProgression?.data||{};
  const rank=progression.currentGuardianRank??progression.highestCurrentGuardianRank;
  return Number.isFinite(Number(rank))?Number(rank):null;
}

function equippedTitle(payload,character){
  const hash=character?.titleRecordHash;
  if(!hash)return {hash:null,name:""};
  const row=payload?.recordDefinitions?.[String(hash)]||payload?.definitions?.[String(hash)]||null;
  return {hash:Number(hash),name:String(row?.displayProperties?.name||"")};
}

function characterStats(payload,character){
  return STAT_ORDER.map(hash=>{
    const row=payload?.statDefinitions?.[String(hash)]||null;
    return [row?.displayProperties?.name||`Unresolved Destiny stat ${hash}`,Number(character?.stats?.[hash]??0),absoluteIcon(row?.displayProperties?.icon),hash];
  });
}

function characterRoster(payload,selectedCharacterId=null){
  const profile=payload?.profile||{};
  const rank=guardianRank(profile);
  const order={hunter:0,warlock:1,titan:2};
  return Object.values(profile?.characters?.data||{}).map(character=>{
    const characterClass=CLASS_NAMES[Number(character.classType)]||"hunter";
    const title=equippedTitle(payload,character);
    return {
      characterId:String(character.characterId||""),
      characterClass,
      dateLastPlayed:String(character.dateLastPlayed||""),
      power:character.light??null,
      guardianRank:rank,
      titleHash:title.hash,
      title:title.name,
      stats:characterStats(payload,character),
      emblem:{hash:character.emblemHash??null,icon:absoluteIcon(character.emblemPath),background:absoluteIcon(character.emblemBackgroundPath)},
      selected:String(character.characterId||"")===String(selectedCharacterId||"")
    };
  }).sort((a,b)=>(order[a.characterClass]??9)-(order[b.characterClass]??9));
}

function fixtureCharacterRoster(detail={}){
  const characterId=String(detail.characterId||detail.fixtureId||"");
  const characterClass=String(detail.characterClass||detail.className||"").toLowerCase();
  if(!characterId||!CLASS_NAMES.includes(characterClass))return [];
  const emblem=detail.emblem||{};
  return [{
    characterId,
    characterClass,
    power:detail.power??null,
    guardianRank:null,
    titleHash:null,
    title:"",
    stats:(Array.isArray(detail.stats)?detail.stats:[]).slice(0,6).map(([name,value,icon,hash])=>[name,Number(value??0),absoluteIcon(icon),hash??null]),
    emblem:{hash:emblem.hash??null,icon:absoluteIcon(emblem.icon),background:absoluteIcon(emblem.background)},
    selected:true
  }];
}

function publishCharacterRoster(payload,selectedCharacterId,{source="bungie-live"}={}){
  const characters=Array.isArray(payload?.characters)?payload.characters:characterRoster(payload,selectedCharacterId);
  document.dispatchEvent(new CustomEvent("forge:bungie-character-roster",{detail:{source,selectedCharacterId:String(selectedCharacterId||""),characters}}));
}

function publishFixtureRoster(detail={}){
  const characterId=String(detail.characterId||detail.fixtureId||"");
  publishCharacterRoster({characters:fixtureCharacterRoster(detail)},characterId,{source:"fixture"});
}

function socketResolution(profile,definitions,item,payload={}){
  if(!item?.itemInstanceId)return {plugs:[],requested:[],resolved:[],unresolved:[],complete:true};
  const sockets=profile?.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets||[];
  const socketCategories=definition(definitions,item.itemHash)?.sockets?.socketCategories||[];
  const requested=sockets.map(socket=>Number(socket.plugHash)).filter(hash=>Number.isInteger(hash)&&hash>0);
  const rows=sockets.map((socket,socketIndex)=>{
    const hash=Number(socket?.plugHash);
    const category=socketCategories.find(row=>(row?.socketIndexes||[]).map(Number).includes(socketIndex))||null;
    const socketCategoryHash=Number(category?.socketCategoryHash);
    const socketCategoryDefinition=Number.isFinite(socketCategoryHash)?payload?.socketCategoryDefinitions?.[String(socketCategoryHash)]||null:null;
    const entry=definition(definitions,item.itemHash)?.sockets?.socketEntries?.[socketIndex]||{};
    const plug=Number.isInteger(hash)&&hash>0?displayItem(definitions,hash):null;
    return plug?{...plug,socketIndex,socketCategoryHash:Number.isFinite(socketCategoryHash)?socketCategoryHash:null,socketCategoryDefinition,socketTypeHash:entry.socketTypeHash??null,socketTypeDefinition:payload?.socketTypeDefinitions?.[String(entry.socketTypeHash)]||null,isEnabled:socket.isEnabled,isVisible:socket.isVisible,statContributions:plugStatContributions(payload,plug.definition)}:null;
  }).filter(Boolean);
  const plugs=rows;
  const resolved=plugs.filter(row=>row.definition&&Object.keys(row.definition).length>0).map(row=>Number(row.hash));
  const unresolved=requested.filter(hash=>!definition(definitions,hash));
  return {plugs,requested,resolved,unresolved,complete:unresolved.length===0};
}

function socketPlugs(profile,definitions,item,payload={}){
  return socketResolution(profile,definitions,item,payload).plugs;
}

function plugStatContributions(payload={},plugDefinition={}){
  return (plugDefinition?.investmentStats||[]).map(row=>{
    const hash=Number(row?.statTypeHash),stat=payload?.statDefinitions?.[String(hash)]||null;
    return {
      hash:Number.isInteger(hash)?hash:null,
      name:String(stat?.displayProperties?.name||''),
      value:Number(row?.value||0),
      isConditionallyActive:Boolean(row?.isConditionallyActive)
    };
  }).filter(row=>row.hash&&Number.isFinite(row.value)&&row.value!==0);
}

function reusableSocketOptions(profile,definitions,item,payload={}){
  if(!item?.itemInstanceId)return {};
  const reusable=profile?.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs||{};
  const itemDefinition=definition(definitions,item.itemHash)||{};
  const entries=itemDefinition?.sockets?.socketEntries||[],indexes=new Set([...Object.keys(reusable).map(Number),...entries.map((_,index)=>index)]),profileSets=profile?.profilePlugSets?.data?.plugs||{},characterSets=characterPlugSetsForItem(profile,item);
  return Object.fromEntries([...indexes].sort((a,b)=>a-b).map(socketIndex=>{
    const entry=entries[socketIndex]||{},setHashes=[entry?.reusablePlugSetHash].map(Number).filter(hash=>Number.isInteger(hash)&&hash>0),setRows=setHashes.flatMap(hash=>[...(profileSets?.[String(hash)]||[]),...characterSets.flatMap(sets=>sets?.[String(hash)]||[])]),rows=[...(reusable?.[String(socketIndex)]||[]).map(row=>({row,source:'bungie-item-reusable-plugs'})),...setRows.map(row=>({row,source:'bungie-profile-plug-set'}))];
    return [String(socketIndex),uniqueItems((Array.isArray(rows)?rows:[]).map(({row,source})=>{
      const hash=Number(row?.plugItemHash??row?.plugHash),plugDefinition=definition(definitions,hash);
      if(!Number.isInteger(hash)||!plugDefinition)return null;
      const category=(itemDefinition?.sockets?.socketCategories||[]).find(value=>(value?.socketIndexes||[]).map(Number).includes(Number(socketIndex)))||null;
      const socketCategoryHash=Number(category?.socketCategoryHash);
      return {
        ...displayItem(definitions,hash),
        socketIndex:Number(socketIndex),
        socketCategoryHash:Number.isFinite(socketCategoryHash)?socketCategoryHash:null,
        socketCategoryDefinition:Number.isFinite(socketCategoryHash)?payload?.socketCategoryDefinitions?.[String(socketCategoryHash)]||null:null,
        canInsert:row.canInsert===true,
        isEnabled:row.enabled,
        socketTypeHash:entry.socketTypeHash??null,
        source,
        remoteInsertEvidence:source==='bungie-item-reusable-plugs'?'exact-item-reusable-plug':'compatible-plug-set',
        statContributions:plugStatContributions(payload,plugDefinition)
      };
    }).filter(Boolean))];
  }).filter(([,rows])=>rows.length));
}

function plugType(plug){
  return [
    plug?.itemTypeDisplayName,
    plug?.name,
    plug?.definition?.plug?.plugCategoryIdentifier,
    plug?.socketCategoryDefinition?.displayProperties?.name,
    plug?.socketCategoryDefinition?.displayProperties?.description,
    ...(plug?.definition?.traitIds||[])
  ].filter(Boolean).join(" ").toLowerCase();
}

/* Bungie subclass plug categories are authoritative. Descriptions can mention
 * other component types (an Aspect commonly mentions Fragment slots), so a
 * descriptive substring must never cross-classify the same plug into two
 * lanes. */
const plugCategory=plug=>String(plug?.definition?.plug?.plugCategoryIdentifier||"").toLowerCase();
const isSuperPlug=plug=>subclassPlugComponent(plug)==="super";
const isClassAbilityPlug=plug=>subclassPlugComponent(plug)==="classAbility";
const isMovementPlug=plug=>subclassPlugComponent(plug)==="movementAbility";
const isMeleePlug=plug=>subclassPlugComponent(plug)==="melee";
const isGrenadePlug=plug=>subclassPlugComponent(plug)==="grenade";
const isAspectPlug=plug=>subclassPlugComponent(plug)==="aspect";
const isFragmentPlug=plug=>subclassPlugComponent(plug)==="fragment";
const isTranscendencePlug=plug=>{
  const itemType=String(plug?.itemTypeDisplayName||plug?.definition?.itemTypeDisplayName||"").toLowerCase();
  const name=String(plug?.name||plug?.definition?.displayProperties?.name||"").toLowerCase();
  return itemType==="utility ability"||itemType==="prismatic grenade"||name==="transcendence"||plugCategory(plug).includes("transcend");
};

const uniqueItems=rows=>rows.filter((row,index,all)=>row&&Number.isFinite(Number(row.hash))&&all.findIndex(other=>Number(other?.hash)===Number(row.hash))===index);

function subclassCandidatePlugs(profile,definitions,item,characterId=""){
  const payload={characterPlugSets:profile?.characterPlugSets};
  const options=reusableSocketOptions(profile,definitions,item,payload);
  const rows=Object.values(options).flatMap(value=>Array.isArray(value)?value:[]);
  if(rows.length)return rows;
  const itemDef=definition(definitions,item?.itemHash)||{};
  return (itemDef.sockets?.socketEntries||[]).map((entry,socketIndex)=>{
    const hash=Number(entry?.singleInitialItemHash);
    return Number.isInteger(hash)?{...displayItem(definitions,hash),socketIndex,canInsert:false,source:'bungie-manifest-initial-socket'}:null;
  }).filter(Boolean);
}

function normaliseItem(profile,definitions,item,payload={}){
  const base=displayItem(definitions,item.itemHash);
  const override=Number.isInteger(Number(item?.overrideStyleItemHash))?displayItem(definitions,Number(item.overrideStyleItemHash)):null;
  const instance=item.itemInstanceId?profile?.itemComponents?.instances?.data?.[item.itemInstanceId]:null;
  const socketCoverage=socketResolution(profile,definitions,item,payload);
  const plugs=socketCoverage.plugs;
  const shader=plugs.find(plug=>/shader/.test(plugType(plug)))||null;
  const ornament=plugs.find(plug=>/skin|ornament/.test(plugType(plug)))||null;
  const intrinsicTrait=plugs.find(plug=>/intrinsic|exotic perk/.test(plugType(plug)))||null;
  const mods=plugs.filter(plug=>{
    const type=plugType(plug);
    const isAppearance=/shader|skin|ornament/.test(type);
    const isSubclass=isSuperPlug(plug)||isClassAbilityPlug(plug)||isMovementPlug(plug)||isMeleePlug(plug)||isGrenadePlug(plug)||isAspectPlug(plug)||isFragmentPlug(plug);
    return !isAppearance&&!isSubclass&&intrinsicTrait?.hash!==plug.hash&&(
      /mod|enhancement|armour\.mods|armor\.mods/.test(type)
      ||Number(plug.definition?.itemType)===19
    );
  });
  const socketOptions=reusableSocketOptions(profile,definitions,item,payload);
  const isExotic=String(base.tier).toLowerCase()==="exotic";
  const weaponSemantics=WEAPON_ORDER.includes(Number(base.bucketHash))?normaliseWeaponSemantics({profile,item,itemDefinition:base.definition,plugs,instance,stats:profile?.itemComponents?.stats?.data?.[item.itemInstanceId]||null,alternativeColumns:socketOptions,isExotic}):null;
  const releaseWatermark=resolveItemWatermark(item,base.definition,{powerCapDefinitions:payload.powerCapDefinitions,currentPowerCap:payload.currentPowerCap});
  return {
    ...base,
    releaseWatermark,tierIcon:releaseWatermark.icon,
    ...(weaponSemantics?{weaponType:weaponTypeIdentity(base.definition).label,weaponTypeId:weaponTypeIdentity(base.definition).id}:{}),
    itemHash:Number(item.itemHash),
    itemInstanceId:String(item.itemInstanceId||''),
    icon:override?.definition&&Object.keys(override.definition).length?override.icon:base.icon,
    exactStyleHash:override?.definition&&Object.keys(override.definition).length?Number(item.overrideStyleItemHash):null,
    isHolofoil:Boolean((override?.definition||base.definition)?.isHolofoil),
    versionNumber:Number.isInteger(Number(item?.versionNumber))?Number(item.versionNumber):null,
    power:instance?.primaryStat?.value??null,
    itemLevel:Number.isFinite(Number(instance?.itemLevel))?Number(instance.itemLevel):null,
    gearTier:Number.isFinite(Number(instance?.gearTier))?Number(instance.gearTier):null,
    quality:Number.isFinite(Number(instance?.quality))?Number(instance.quality):null,
    state:Number(item?.state??0),
    damageTypeHash:instance?.damageTypeHash??base.definition?.defaultDamageTypeHash??null,
    elementDefinition:payload?.damageDefinitions?.[String(instance?.damageTypeHash??base.definition?.defaultDamageTypeHash)]||null,
    breakerDefinition:payload?.breakerDefinitions?.[String(instance?.breakerTypeHash??base.definition?.breakerTypeHash)]||null,
    isExotic,
    shader,
    ornament,
    intrinsicTrait,
    appearancePlugs:[shader,ornament].filter(Boolean),
    mods,
    socketOptions,
    ...(weaponSemantics?{weaponSemantics,intrinsic:weaponSemantics.intrinsic,selectedPerks:weaponSemantics.selectedPerks,weaponPerkModel:weaponSemantics.perkModel,weaponPerkRows:weaponSemantics.perkRows,weaponPerkRowCount:weaponSemantics.perkRowCount,exoticWeaponTraits:weaponSemantics.exoticTraits,weaponMasterwork:weaponSemantics.masterwork,weaponMod:weaponSemantics.mod,catalyst:weaponSemantics.catalyst,championCapability:weaponSemantics.champion,weaponStats:weaponSemantics.stats}:{}),
    socketsAvailable:Boolean(item?.itemInstanceId&&profile?.itemComponents?.sockets?.data?.[item.itemInstanceId]),
    socketCoverage
  };
}

function ownedItemRows(profile={}){
  const priority={profile:0,vault:1,carried:2,postmaster:3,equipped:4},rows=[];
  for(const item of profile?.profileInventory?.data?.items||[])rows.push({item,source:{kind:Number(item?.bucketHash)===138197802?'vault':'profile',characterId:null,label:Number(item?.bucketHash)===138197802?'Vault':'Shared inventory'}});
  for(const [characterId,inventory] of Object.entries(profile?.characterInventories?.data||{}))for(const item of inventory?.items||[])rows.push({item,source:{kind:Number(item?.bucketHash)===215593132?'postmaster':'carried',characterId:String(characterId),label:Number(item?.bucketHash)===215593132?'Postmaster':'Carried'}});
  for(const [characterId,equipment] of Object.entries(profile?.characterEquipment?.data||{}))for(const item of equipment?.items||[])rows.push({item,source:{kind:'equipped',characterId:String(characterId),label:'Equipped'}});
  const unique=new Map();
  for(const row of rows){
    const key=String(row?.item?.itemInstanceId||'');
    if(!key)continue;
    const prior=unique.get(key);
    if(!prior||priority[row.source.kind]>priority[prior.source.kind])unique.set(key,row);
  }
  return [...unique.values()];
}

function subclassConfiguration(profile,definitions,item,payload={},characterId=""){
  const socketCoverage=socketResolution(profile,definitions,item,payload);
  const plugs=socketCoverage.plugs;
  const typed=(row,type)=>row?{...row,componentType:type}:null;
  const superItem=typed(plugs.find(isSuperPlug),"super");
  console.log("[TRACE super] subclassItem:", item?.itemHash, "instance:", item?.itemInstanceId, "→ super:", superItem?.hash, superItem?.name, "| cat:", superItem?.definition?.plug?.plugCategoryIdentifier);
  const classAbility=typed(plugs.find(isClassAbilityPlug),"classAbility");
  const movement=typed(plugs.find(isMovementPlug),"movementAbility");
  const melee=typed(plugs.find(isMeleePlug),"melee");
  const grenade=typed(plugs.find(isGrenadePlug),"grenade");

  const candidates=subclassCandidatePlugs(profile,definitions,item,characterId);
  const optionsFor=(equipped,predicate,type)=>uniqueItems([...candidates.filter(predicate),equipped]).map(row=>typed(row,type));
  const optionsBySocket=(predicate,type)=>Object.fromEntries([...new Set([...plugs,...candidates].filter(predicate).map(row=>Number(row?.socketIndex)).filter(Number.isInteger))].sort((a,b)=>a-b).map(socketIndex=>[
    String(socketIndex),uniqueItems([...candidates,...plugs].filter(row=>predicate(row)&&Number(row?.socketIndex)===socketIndex)).map(row=>typed(row,type))
  ]));

  const superOptions=[
    superItem,
    ...candidates.filter(isSuperPlug)
  ].filter((row,index,rows)=>row&&rows.findIndex(other=>Number(other.hash)===Number(row.hash))===index)
    .map(row=>{
      const damageHash=Number(row?.damageTypeHash??row?.definition?.defaultDamageTypeHash??row?.definition?.damageTypeHashes?.[0]);
      const elementDefinition=Number.isFinite(damageHash)?payload?.damageDefinitions?.[String(damageHash)]||null:null;
      return {...row,componentType:"super",damageTypeHash:Number.isFinite(damageHash)?damageHash:null,elementDefinition};
    });
  const transcendenceOptions=plugs.filter(isTranscendencePlug);
  const transcendenceSlots=transcendenceOptions.slice(0,2).map(row=>({socketIndex:row.socketIndex,equipped:row,options:[row]}));
  const abilityOptionsBySocket={
    classAbility:optionsFor(classAbility,isClassAbilityPlug,"classAbility"),
    movement:optionsFor(movement,isMovementPlug,"movementAbility"),
    melee:optionsFor(melee,isMeleePlug,"melee"),
    grenade:optionsFor(grenade,isGrenadePlug,"grenade")
  };
  const availableAspects=optionsFor(null,isAspectPlug,"aspect");
  const availableFragments=optionsFor(null,isFragmentPlug,"fragment");
  const aspectOptionsBySocket=optionsBySocket(isAspectPlug,"aspect");
  const fragmentOptionsBySocket=optionsBySocket(isFragmentPlug,"fragment");

  return {
    super:superItem||null,
    superOptions,
    transcendenceOptions,
    transcendenceSlots,
    classAbility,
    movement,
    melee,
    grenade,
    abilities:[classAbility,movement,melee,grenade].filter(Boolean),
    abilityOptionsBySocket,
    availableAbilities:uniqueItems(Object.values(abilityOptionsBySocket).flat()),
    aspects:plugs.filter(isAspectPlug).map(row=>typed(row,"aspect")),
    fragments:plugs.filter(isFragmentPlug).map(row=>typed(row,"fragment")),
    availableAspects,
    aspectOptions:availableAspects,
    aspectOptionsBySocket,
    availableFragments,
    fragmentOptions:availableFragments,
    fragmentOptionsBySocket,
    socketsAvailable:Boolean(item?.itemInstanceId&&profile?.itemComponents?.sockets?.data?.[item.itemInstanceId]),
    reusablePlugsAvailable:Boolean(item?.itemInstanceId&&profile?.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]),
    socketCoverage
  };
}

function currentArtifact(payload,characterId){
  return resolveArtifactByProvenance(payload,characterId);
}

function availableArtifactItems(payload,current){
  const artifactCatalog=Array.isArray(payload?.artifactCatalog)?payload.artifactCatalog:[];
  if(artifactCatalog.length)return uniqueItems(artifactCatalog);
  const profile=payload?.profile||{};
  const definitions=payload?.definitions||{};
  const inventoryItems=[
    ...(profile?.profileInventory?.data?.items||[]),
    ...Object.values(profile?.characterInventories?.data||{}).flatMap(row=>row?.items||[]),
    ...Object.values(profile?.characterEquipment?.data||{}).flatMap(row=>row?.items||[])
  ];
  const inventoryArtifacts=inventoryItems.map(item=>displayItem(definitions,item?.itemHash)).filter(item=>{
    const type=[item?.itemTypeDisplayName,item?.definition?.itemTypeAndTierDisplayName,item?.definition?.displayProperties?.name].join(" ").toLowerCase();
    return type.includes("artifact");
  });
  return uniqueItems([current,...inventoryArtifacts]);
}

function equippedArtifactFromCatalog(profile,equipment,availableArtifacts,seasonNumber){
  const catalog=(availableArtifacts||[]).filter(item=>item?.availabilityModel==="artifact-2-socket-buckets");
  if(!catalog.length)return null;
  const byHash=new Map(catalog.map(item=>[Number(item.hash),item]));
  const equipped=equipment.find(item=>byHash.has(Number(item?.itemHash)));
  if(!equipped)return null;
  const source=byHash.get(Number(equipped.itemHash));
  const sockets=profile?.itemComponents?.sockets?.data?.[equipped.itemInstanceId]?.sockets||[];
  const selected=new Set(sockets.map(socket=>Number(socket?.plugHash)).filter(Number.isFinite));
  const perks=(source.perks||[]).map(perk=>({...perk,isActive:selected.has(Number(perk.hash))}));
  const activePerks=perks.filter(perk=>perk.isActive);
  const artifactConfiguration=createArtifactConfiguration({
    artifactHash:source.hash,
    seasonNumber,
    selectedPerkHashes:activePerks.map(perk=>perk.hash),
    source:'bungie-artifact-2-item-sockets',
    provenance:{provider:'bungie',endpoint:'Destiny2.GetProfile',component:305,componentName:'ItemSockets',itemInstanceId:equipped.itemInstanceId||null,path:`itemComponents.sockets.data.${equipped.itemInstanceId}.sockets[].plugHash`,state:activePerks.length?'resolved':'none-active'}
  });
  return {...source,itemInstanceId:equipped.itemInstanceId||null,state:activePerks.length?'resolved':'none-active',perks,activePerks,artifactConfiguration,stateMessage:activePerks.length?`${activePerks.length} Artifact 2.0 perk(s) resolved from the equipped item sockets.`:'Artifact 2.0 item resolved with no active socket selections.'};
}

function identityCosmetics(profile,definitions,equipment,character,payload={}){
  const ghostItem=equipment.find(item=>definition(definitions,item.itemHash)?.inventory?.bucketTypeHash===BUCKETS.ghost);
  const allPlugs=equipment.flatMap(item=>socketPlugs(profile,definitions,item,payload));
  const shader=allPlugs.find(plug=>String(plug.definition?.plug?.plugCategoryIdentifier||"").includes("shader"))||null;
  return {ghost:ghostItem?normaliseItem(profile,definitions,ghostItem,payload):null,shader,emblem:{hash:character.emblemHash??null,icon:absoluteIcon(character.emblemPath),background:absoluteIcon(character.emblemBackgroundPath)}};
}

function normaliseLiveProfile(payload,session,preferredCharacterId=null){
  const profile=payload.profile||{};
  const definitions=payload.definitions||{};
  const explicitCharacterId=String(preferredCharacterId||"");
  const character=explicitCharacterId?profile?.characters?.data?.[explicitCharacterId]:activeCharacter(profile);
  console.log("[TRACE resolve] preferred:", preferredCharacterId, "→ resolved:", character?.characterId, "class:", character?.classType);
  if(explicitCharacterId&&!character)throw new Error(`Selected Bungie character was not found: ${explicitCharacterId}`);
  if(!character?.characterId)throw new Error("No Destiny character was returned for this membership.");
  const equipment=profile?.characterEquipment?.data?.[character.characterId]?.items||[];
  const byBucket=hash=>equipment.find(item=>definition(definitions,item.itemHash)?.inventory?.bucketTypeHash===hash)||null;
  const weapons=WEAPON_ORDER.map(hash=>byBucket(hash)).filter(Boolean).map(item=>({...normaliseItem(profile,definitions,item,payload),source:{kind:'equipped',characterId:String(character.characterId),label:'Equipped'}}));
  const weaponBuckets=new Set(WEAPON_ORDER);
  const ownedWeapons=ownedItemRows(profile).filter(row=>weaponBuckets.has(Number(definition(definitions,row.item?.itemHash)?.inventory?.bucketTypeHash))).map(row=>({...normaliseItem(profile,definitions,row.item,payload),source:row.source})).sort((left,right)=>WEAPON_ORDER.indexOf(Number(left.bucketHash))-WEAPON_ORDER.indexOf(Number(right.bucketHash))||Number(right.source?.kind==='equipped')-Number(left.source?.kind==='equipped')||String(left.name).localeCompare(String(right.name)));
  const armour=ARMOUR_ORDER.map(hash=>byBucket(hash)).map(item=>item?{...normaliseItem(profile,definitions,item,payload),source:{kind:'equipped',characterId:String(character.characterId),label:'Equipped'}}:null);
  const subclassItem=byBucket(BUCKETS.subclass);
  const subclass=subclassItem?displayItem(definitions,subclassItem.itemHash):null;
  const characterClass=CLASS_NAMES[Number(character.classType)]||"hunter";
  const subclassRows=[
    subclassItem?{item:subclassItem,source:{kind:'equipped',characterId:String(character.characterId),label:'Equipped'}}:null,
    ...(profile?.characterInventories?.data?.[character.characterId]?.items||[]).map(item=>({item,source:{kind:'carried',characterId:String(character.characterId),label:'Carried'}}))
  ].filter(row=>row?.item&&definition(definitions,row.item.itemHash)?.inventory?.bucketTypeHash===BUCKETS.subclass);
  const subclassCatalog=subclassRows.map(row=>{const item=row.item,display=displayItem(definitions,item.itemHash),element=classifySubclass(display);return {...display,itemInstanceId:item.itemInstanceId||null,source:row.source,element,subclass:element,key:element,subclassBuild:subclassConfiguration(profile,definitions,item,payload,character.characterId)}}).filter((item,index,rows)=>rows.findIndex(other=>other.element===item.element)===index);
  const verifiedSubclassCatalog=mergeSubclassCatalog(subclassCatalog,characterClass);
  const normalizedSubclassItem=verifiedSubclassCatalog.find(item=>Number(item.hash)===Number(subclassItem?.itemHash))||null;
  const subclassBuild=verifiedSubclassCatalog.find(item=>Number(item.hash)===Number(subclassItem?.itemHash))?.subclassBuild||{super:null,superOptions:[],classAbility:null,movement:null,melee:null,grenade:null,abilities:[],abilityOptionsBySocket:{classAbility:[],movement:[],melee:[],grenade:[]},availableAbilities:[],aspects:[],availableAspects:[],aspectOptions:[],aspectOptionsBySocket:{},fragments:[],availableFragments:[],fragmentOptions:[],fragmentOptionsBySocket:{},socketsAvailable:false,reusablePlugsAvailable:false,socketCoverage:{plugs:[],requested:[],resolved:[],unresolved:[],complete:true}};
  const cosmetics=identityCosmetics(profile,definitions,equipment,character,payload);
  const legacyArtifact=currentArtifact(payload,character.characterId);
  const availableArtifacts=availableArtifactItems(payload,legacyArtifact);
  const currentSeasonNumber=Number.isInteger(Number(payload?.currentSeasonNumber??payload?.currentSeason?.seasonNumber))?Number(payload.currentSeasonNumber??payload.currentSeason.seasonNumber):null;
  const artifact=equippedArtifactFromCatalog(profile,equipment,availableArtifacts,currentSeasonNumber)||legacyArtifact;
  const characterLoadouts=profile?.characterLoadouts?.data?.[character.characterId];
  const loadoutsAvailable=Array.isArray(characterLoadouts?.loadouts);
  const rank=guardianRank(profile);
  const title=equippedTitle(payload,character);
  const membership=session?.activeDestinyMembership||payload.membership||{};
  const hashCoverage={
    definitions:payload?.definitionCoverage||null,
    subclass:subclassBuild.socketCoverage,
    artifact:payload?.artifactCoverage||null
  };
  if(hashCoverage.subclass?.unresolved?.length){
    console.warn("[Forge hash coverage] unresolved subclass plug hashes",hashCoverage.subclass.unresolved);
  }
  return {
    source:"bungie-live",
    characterId:character.characterId,
    membershipId:String(membership.membershipId||session?.primaryMembershipId||session?.bungieMembershipId||""),
    membershipType:String(membership.membershipType??""),
    characterClass,
    subclass:classifySubclass(subclass),
    subclassName:subclass?.name||"Subclass",
    subclassIcon:subclass?.icon||"",
    subclassItemInstanceId:String(subclassItem?.itemInstanceId||""),
    subclassItem:normalizedSubclassItem,
    subclassCatalog:verifiedSubclassCatalog,
    subclassBuild,
    super:subclassBuild.super,
    superOptions:subclassBuild.superOptions,
    classAbility:subclassBuild.classAbility,
    movement:subclassBuild.movement,
    melee:subclassBuild.melee,
    grenade:subclassBuild.grenade,
    abilities:subclassBuild.abilities,
    abilityOptionsBySocket:subclassBuild.abilityOptionsBySocket,
    availableAbilities:subclassBuild.availableAbilities,
    aspects:subclassBuild.aspects,
    fragments:subclassBuild.fragments,
    availableAspects:subclassBuild.availableAspects,
    aspectOptions:subclassBuild.aspectOptions,
    availableFragments:subclassBuild.availableFragments,
    fragmentOptions:subclassBuild.fragmentOptions,
    artifact,
    availableArtifacts,
    artifactOptions:availableArtifacts,
    artifactConfiguration:artifact?.artifactConfiguration||null,
    currentSeasonNumber,
    currentSeason:cloneBuildValue(payload?.currentSeason||null),
    hashCoverage,
    power:character.light??null,
    guardianRank:rank,
    titleHash:title.hash,
    title:title.name,
    stats:characterStats(payload,character),
    weapons,
    ownedWeapons,
    armour,
    ...cosmetics,
    ornaments:armour.map(item=>item?.ornament).filter(Boolean),
    renderData:profile?.characterRenderData?.data?.[character.characterId]||null,
    itemRenderData:profile?.itemComponents?.renderData?.data||{},
    gearAssets:payload.gearAssets||{},
    loadoutsAvailable,
    loadouts:loadoutsAvailable?characterLoadouts.loadouts:[],
    displayName:payload.membership?.displayName||session?.activeDestinyMembership?.displayName||"Guardian"
  };
}

function profileWithSelectedLoadout(payload){
  const profile=structuredClone(payload.profile||{});
  const characterId=String(payload.characterId||"");
  const items=Array.isArray(payload.selectedItems)?payload.selectedItems:[];
  profile.characterEquipment=profile.characterEquipment||{data:{}};
  profile.characterEquipment.data=profile.characterEquipment.data||{};
  profile.characterEquipment.data[characterId]={items:items.map(({plugItemHashes,...item})=>item)};
  profile.itemComponents=profile.itemComponents||{};
  profile.itemComponents.sockets=profile.itemComponents.sockets||{data:{}};
  profile.itemComponents.sockets.data=profile.itemComponents.sockets.data||{};
  items.forEach(item=>{
    if(!item.itemInstanceId)return;
    if(Array.isArray(item.plugItemHashes)){
      profile.itemComponents.sockets.data[item.itemInstanceId]={sockets:item.plugItemHashes.map(plugHash=>({plugHash}))};
    }
  });
  const statData=profile?.itemComponents?.stats?.data||{};
  const character=profile?.characters?.data?.[characterId];
  if(character){
    const totals={};
    STAT_ORDER.forEach(hash=>{totals[hash]=items.reduce((sum,item)=>sum+Number(statData?.[item.itemInstanceId]?.stats?.[hash]?.value||0),0)});
    character.stats=totals;
  }
  return profile;
}

function mergeLoadoutContext(payload){
  if(!liveProfilePayload)return payload;
  const live=liveProfilePayload;
  payload.profile={
    ...(live.profile||{}),
    ...(payload.profile||{}),
    characters:payload.profile?.characters||live.profile?.characters,
    profileInventory:payload.profile?.profileInventory||live.profile?.profileInventory,
    characterInventories:payload.profile?.characterInventories||live.profile?.characterInventories,
    characterLoadouts:payload.profile?.characterLoadouts||live.profile?.characterLoadouts,
    characterProgressions:payload.profile?.characterProgressions||live.profile?.characterProgressions,
    profileProgression:payload.profile?.profileProgression||live.profile?.profileProgression,
    itemComponents:{
      ...(live.profile?.itemComponents||{}),
      ...(payload.profile?.itemComponents||{})
    }
  };
  payload.definitions={...(live.definitions||{}),...(payload.definitions||{})};
  payload.damageDefinitions={...(live.damageDefinitions||{}),...(payload.damageDefinitions||{})};
  payload.breakerDefinitions={...(live.breakerDefinitions||{}),...(payload.breakerDefinitions||{})};
  payload.recordDefinitions={...(live.recordDefinitions||{}),...(payload.recordDefinitions||{})};
  payload.gearAssets={...(live.gearAssets||{}),...(payload.gearAssets||{})};
  payload.artifactDefinition=payload.artifactDefinition||live.artifactDefinition||null;
  payload.artifactCoverage=payload.artifactCoverage||live.artifactCoverage||null;
  payload.currentSeasonNumber=Number.isInteger(Number(payload.currentSeasonNumber))?Number(payload.currentSeasonNumber):live.currentSeasonNumber??null;
  payload.currentSeason=payload.currentSeason||live.currentSeason||null;
  payload.definitionCoverage=payload.definitionCoverage||live.definitionCoverage||null;
  payload.membership=payload.membership||live.membership;
  return payload;
}

function preparedLoadoutPayload(characterId,index){
  if(!liveProfilePayload?.profile)return null;
  const profile=liveProfilePayload.profile;
  const loadout=profile.characterLoadouts?.data?.[characterId]?.loadouts?.[index];
  if(!loadout)return null;
  const allItems=[
    ...(profile.profileInventory?.data?.items||[]),
    ...Object.values(profile.characterInventories?.data||{}).flatMap(row=>row?.items||[]),
    ...Object.values(profile.characterEquipment?.data||{}).flatMap(row=>row?.items||[])
  ];
  const byInstance=new Map(allItems.filter(item=>item?.itemInstanceId).map(item=>[String(item.itemInstanceId),item]));
  const selected=new Map();
  for(const row of [...(loadout.items||[]),...(loadout.subclassOverrides||[])]){
    const id=String(row?.itemInstanceId||''),item=byInstance.get(id);
    if(!item)continue;
    selected.set(id,{...item,plugItemHashes:Array.isArray(row?.plugItemHashes)?row.plugItemHashes:[]});
  }
  return mergeLoadoutContext({...liveProfilePayload,characterId,index,loadout,selectedItems:[...selected.values()]});
}

function loadoutCoverage(detail){
  const missing=[];
  if(!detail.super)missing.push("super");
  if(detail.abilities.length<4)missing.push("abilities");
  if(!detail.aspects.length)missing.push("aspects");
  if(!detail.fragments.length)missing.push("fragments");
  if(detail.weapons.length<3)missing.push("weapons");
  if(detail.armour.filter(Boolean).length<5)missing.push("armour");
  if(!detail.subclassBuild?.socketsAvailable)missing.push("subclass sockets");
  if(detail.subclassBuild?.socketCoverage?.unresolved?.length)missing.push(`unresolved subclass hashes: ${detail.subclassBuild.socketCoverage.unresolved.join(",")}`);
  detail.armour.forEach((item,index)=>{
    if(item&&!item.socketsAvailable)missing.push(`armour ${index+1} sockets`);
  });
  return {complete:missing.length===0,missing};
}

async function loadSelectedLoadout(selection){
  const characterId=String(selection?.characterId||"");
  const index=Number(selection?.index);
  const actionIntent=String(selection?.intent||"");
  const forAction=detail=>actionIntent?{...detail,loadoutActionIntent:actionIntent}:detail;
  if(!characterId||!Number.isInteger(index))throw new Error("Invalid Bungie loadout selection.");
  const cacheKey=`${characterId}:${index}`;
  const cacheInvalidated=invalidatedLoadoutCacheKeys.has(cacheKey),cached=cacheInvalidated?null:loadoutCache.get(cacheKey);
  if(cached){
    rememberLoadoutSelection(characterId,index);
    document.documentElement.dataset.guardianSource="bungie-live";
    const published=forAction(cached);
    document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail:published}));
    document.dispatchEvent(new CustomEvent("forge:bungie-loadout-loaded",{detail:published}));
    return published;
  }
  const stored=cacheInvalidated?null:await readCachedBungieLoadoutDetail(liveProfileSession||globalThis.FORGE_BUNGIE_SESSION,characterId,index);
  if(stored&&Array.isArray(stored.subclassCatalog)){
    loadoutCache.set(cacheKey,stored);
    rememberLoadoutSelection(characterId,index);
    document.documentElement.dataset.guardianSource="bungie-live";
    const published=forAction({...stored,sessionCacheRestored:true});
    document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail:published}));
    document.dispatchEvent(new CustomEvent("forge:bungie-loadout-loaded",{detail:published}));
    return published;
  }
  setRenderStatus("LOADING SAVED LOADOUT",`Opening Bungie loadout ${index+1}`,"Resolving equipment and subclass configuration");
  document.dispatchEvent(new CustomEvent("forge:loadout-loading",{detail:{characterId,index}}));
  const prepared=preparedLoadoutPayload(characterId,index);
  if(!prepared)throw new Error(`Bungie loadout ${index+1} is not available in the prepared account payload.`);
  const payload=await hydrateManifestPayload(prepared,{allowNetwork:false});
  payload.profile=profileWithSelectedLoadout(payload);
  const detail={...normaliseLiveProfile(payload,null,characterId),selectedLoadoutIndex:index,loadoutSource:"bungie-live"};
  detail.coverage=loadoutCoverage(detail);

  if(!detail.coverage.complete){
    console.warn(`[Forge] Bungie loadout ${index+1} partial: ${detail.coverage.missing.join(", ")}`);
  }

  loadoutCache.set(cacheKey,detail);
  invalidatedLoadoutCacheKeys.delete(cacheKey);
  await cacheBungieLoadoutDetail(liveProfileSession||globalThis.FORGE_BUNGIE_SESSION,characterId,index,detail);
  rememberCharacterId(characterId);
  rememberLoadoutSelection(characterId,index);
  document.documentElement.dataset.guardianSource="bungie-live";
  setRenderStatus("BUILD INTELLIGENCE",`Bungie loadout ${index+1} ready`,"Saved build loaded for analysis");
  const published=forAction(detail);
  document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail:published}));
  document.dispatchEvent(new CustomEvent("forge:bungie-loadout-loaded",{detail:published}));
  return published;
}

async function activateLiveProfile(payload,session,{fromCache=false}={}){
  assertRenderablePagePayload(payload,currentPagePayloadKind());
  globalThis.FORGE_PAGE_PAYLOAD=payload;
  if(!preparedPagePayloadResolved){preparedPagePayloadResolved=true;resolvePreparedPagePayload(payload);}
  liveProfilePayload=payload;
  liveProfileSession=session;
  const explicitCharacter=payload.profile?.characters?.data?.[explicitlySelectedCharacterId]||null;
  const selectedCharacterId=String(explicitCharacter?.characterId||activeCharacter(payload.profile)?.characterId||"");
  if(selectedCharacterId)rememberCharacterId(selectedCharacterId);
  publishCharacterRoster(payload,selectedCharacterId);

  document.documentElement.dataset.guardianSource="bungie-live";
  document.documentElement.dataset.equippedActive="true";
  if(fromCache){
    document.documentElement.dataset.guardianSessionRestored="true";
    document.dispatchEvent(new CustomEvent("forge:bungie-profile-cache-restored",{detail:{source:"bungie-session-cache",characterId:selectedCharacterId}}));
  }

  if(!selectedCharacterId){
    setRenderStatus("SELECT GUARDIAN","Choose Hunter, Warlock or Titan","Waiting for an explicit Bungie character selection");
    document.dispatchEvent(new CustomEvent("forge:bungie-profile-loaded",{detail:{source:"bungie-live",pendingSelection:true,characterId:"",sessionCacheRestored:fromCache,definitionCoverage:payload.definitionCoverage||null,artifactCoverage:payload.artifactCoverage||null}}));
    return null;
  }

  if(document.documentElement.dataset.guardianProfileMode==="roster-only"){
    const detail=normaliseLiveProfile(payload,session,selectedCharacterId);
    document.dispatchEvent(new CustomEvent("forge:guardian-loadout-context",{detail:{...detail,sessionCacheRestored:fromCache}}));
    return detail;
  }

  forgetLoadoutSelection();
  const detail={...normaliseLiveProfile(payload,session,selectedCharacterId),selectedLoadoutIndex:null,loadoutSource:"currently-equipped"};
  setRenderStatus("CURRENTLY EQUIPPED LOADOUT","Live equipped items ready","Active Guardian default · saved Bungie slots load only when selected");
  document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail:{...detail,sessionCacheRestored:fromCache}}));
  document.dispatchEvent(new CustomEvent("forge:bungie-profile-loaded",{detail:{...detail,sessionCacheRestored:fromCache}}));
  return detail;
}

async function loadLiveProfile(session,{background=false}={}){
  if(!background){
    setRenderStatus("LOADING CHARACTER PROFILE","Retrieving live Bungie appearance","Equipment, ornaments and shaders");
    document.dispatchEvent(new CustomEvent("forge:guardian-loading"));
  }
  const page=currentPagePayloadKind();
  const profilePayload=await loadPreparedPagePayload(session,page,{force:true});
  const payload=await hydrateManifestPayload(profilePayload,INITIAL_PROFILE_HYDRATION);
  reportPreparedPageStage('render',page);
  const detail=await activateLiveProfile(payload,session);
  void cacheBungieProfile(session,payload,page).catch(error=>console.warn("[Forge Bungie profile] profile cache write failed",error));
  return detail;
}

function selectLiveCharacter(characterId,expectedClass=""){
  console.log("[TRACE select] clicked id:", characterId, "| exists in profile?", !!liveProfilePayload?.profile?.characters?.data?.[characterId]);
  if(!liveProfilePayload){
    const session=currentAuthenticatedSession();
    if(session){
      document.documentElement.dataset.guardianSource="bungie-live-loading";
      setRenderStatus("LOADING CHARACTER PROFILE","Waiting for your live Bungie Guardian","Local selection is unavailable while live Guardian data is active");
      ensureLiveProfile(session,{background:false,silent:false});
      return null;
    }
    const fixtureId=String(fixtureProfileDetail?.characterId||fixtureProfileDetail?.fixtureId||"");
    if(fixtureProfileDetail&&fixtureId===String(characterId)){
      const detail=fixtureProfileDetail;
      const expected=String(expectedClass||"").trim().toLowerCase();
      if(expected&&String(detail.characterClass||detail.className||"").toLowerCase()!==expected)throw new Error(`Selected ${expected} fixture card resolved different fixture data for character ${characterId}.`);
      document.documentElement.dataset.guardianSource="fixture";
      publishFixtureRoster(detail);
      document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail}));
      return detail;
    }
    throw new Error("Bungie character roster is not loaded; character selection cannot fall back to last played.");
  }
  const detail=normaliseLiveProfile(liveProfilePayload,liveProfileSession,characterId);
  const expected=String(expectedClass||"").trim().toLowerCase();
  if(expected&&detail.characterClass!==expected)throw new Error(`Selected ${expected} card resolved ${detail.characterClass} data for character ${characterId}.`);
  explicitlySelectedCharacterId=detail.characterId;
  forgetLoadoutSelection();
  rememberCharacterId(detail.characterId);
  document.documentElement.dataset.guardianSource="bungie-live";
  document.documentElement.dataset.equippedActive="true";
  setRenderStatus("BUILD INTELLIGENCE",`${detail.characterClass} profile ready`,"Live equipment and saved loadouts selected");
  document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail}));
  publishCharacterRoster(liveProfilePayload,detail.characterId);
  document.dispatchEvent(new CustomEvent("forge:bungie-character-selected",{detail}));
  return detail;
}

let liveProfileRequest=null;
let liveProfileReady=false;

function reportProfileError(error){
  const message=error?.message||"Guardian data could not be loaded.";
  console.error("[Forge Bungie profile]",error);
  document.documentElement.dataset.guardianSource="bungie-live-error";
  setRenderStatus("LIVE PROFILE UNAVAILABLE",message,"Retry or reconnect Bungie");
  document.dispatchEvent(new CustomEvent("forge:profile-error",{detail:{message}}));
  document.dispatchEvent(new CustomEvent("forge:guardian-error",{detail:{message}}));
  queueMicrotask(()=>setLiveProfileUnavailable(message));
}

function ensureLiveProfile(session,{background=false,silent=false}={}){
  if(liveProfileReady)return Promise.resolve(null);
  if(liveProfileRequest)return liveProfileRequest;
  liveProfileRequest=(async()=>{
    const cachedPayload=await readCachedBungieProfile(session,currentPagePayloadKind());
    if(cachedPayload?.profile){
      try{assertRenderablePagePayload(cachedPayload,currentPagePayloadKind());await activateLiveProfile(await hydrateManifestPayload(cachedPayload,INITIAL_PROFILE_HYDRATION),session,{fromCache:true});}
      catch(error){console.warn("[Forge Bungie profile] cached live profile could not render; requesting a fresh profile",error);}
    }
    return loadLiveProfile(session,{background});
  })()
    .then(detail=>{
      liveProfileReady=true;
      return detail;
    })
    .catch(error=>{
      if(!silent)reportProfileError(error);
      return null;
    })
    .finally(()=>{
      if(!liveProfileReady)liveProfileRequest=null;
    });
  return liveProfileRequest;
}

async function handleAuthenticatedSession(session){
  if(!session?.authenticated){
    authenticatedSession=null;
    return null;
  }
  authenticatedSession=session;
  fixtureProfileDetail=null;
  document.documentElement.dataset.guardianSource="bungie-live-loading";
  // One authenticated profile request only. The earlier silent 15-second
  // attempt immediately launched a second request when the Worker was still
  // resolving Bungie manifest evidence, leaving the UI on empty placeholders.
  return ensureLiveProfile(session,{background:false,silent:false});
}

if(PROFILE_RUNTIME_ENABLED){
  globalThis.addEventListener("forge:bungie-session",event=>{handleAuthenticatedSession(event.detail);});

  document.addEventListener("forge:guardian-selection-changed",blockAuthenticatedFixture,true);
  document.addEventListener("forge:beta-fixture-loaded",blockAuthenticatedFixture,true);

  document.addEventListener("forge:guardian-selection-changed",event=>{
    rememberResolvedBuild(event.detail||{});
    if(event.detail?.source==="bungie-live"||event.detail?.loadoutSource==="bungie-live"){
      document.documentElement.dataset.guardianSource="bungie-live";
      queueMicrotask(()=>setSourceCaption(event.detail||{},"bungie-live"));
    }
  });

  document.addEventListener("click",event=>{
    if(!event.target?.closest?.(".improve-cta"))return;
    persistResolvedBuildSnapshot();
  },true);

  document.addEventListener("forge:loadout-selected",event=>{
    loadSelectedLoadout(event.detail).catch(error=>{
      const message=error.message||"Saved loadout could not be loaded.";
      console.error("[Forge Bungie loadout]",error);
      setRenderStatus("SAVED LOADOUT UNAVAILABLE",message,"Your current Guardian profile is still active");
      document.dispatchEvent(new CustomEvent("forge:loadout-error",{detail:{...event.detail,message}}));
    });
  });

  document.addEventListener("forge:beta-fixture-loaded",event=>{
    if(currentAuthenticatedSession()||liveProfilePayload)return;
    const detail=event.detail||{};
    if(detail.source!=="paradox-beta-fixture")return;
    fixtureProfileDetail=detail;
    document.documentElement.dataset.guardianSource="fixture";
    rememberResolvedBuild(detail);
    publishFixtureRoster(detail);
    queueMicrotask(()=>setSourceCaption(detail,"fixture"));
  });

  document.addEventListener("forge:character-selected",event=>{
    try{selectLiveCharacter(String(event.detail?.characterId||""),String(event.detail?.characterClass||""));}
    catch(error){reportProfileError(error);}
  });

  document.addEventListener("forge:bungie-profile-refresh-requested",event=>{
    const session=currentAuthenticatedSession();if(!session)return;
    const detail=event.detail||{},characterId=String(detail.characterId||""),index=Number(detail.index);
    if(String(detail.reason||"").startsWith("loadout-")&&characterId&&Number.isInteger(index)){
      const cacheKey=`${characterId}:${index}`;loadoutCache.delete(cacheKey);invalidatedLoadoutCacheKeys.add(cacheKey);
      void invalidateBungieLoadoutDetail(session,characterId,index);
    }
    liveProfileReady=false;liveProfileRequest=null;
    void ensureLiveProfile(session,{background:true,silent:false});
  });

  if(globalThis.FORGE_BUNGIE_SESSION?.authenticated)handleAuthenticatedSession(globalThis.FORGE_BUNGIE_SESSION);
  getBungieSession().then(handleAuthenticatedSession);
}

export {normaliseLiveProfile,loadSelectedLoadout,characterRoster,selectLiveCharacter,profileWithSelectedLoadout,subclassConfiguration,loadoutCoverage,socketResolution,currentArtifact};
