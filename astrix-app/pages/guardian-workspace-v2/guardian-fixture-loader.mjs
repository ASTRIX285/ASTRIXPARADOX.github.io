/* ==========================================================================
   ASTRIX PARADOX - FIXTURE LOADER & MANIFEST BRIDGE
   Normalizes beta fixture payloads, maps Armor 3.0 stats, and exposes
   globalThis.ForgeBetaFixtures without DOM hijacking.
   ========================================================================== */

import {guardianManifest} from "./guardian-manifest-service.mjs?v=20260906-page-payload-1";

const FIXTURE_URL = "../../data/paradox-forge/beta/ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json";
const IDENTITY_URL = "../../data/paradox-forge/beta/beta-component-identities.json";
const MANIFEST_URL = "../../data/paradox-forge/beta/beta-bungie-manifest-cache.json";
const TRAIT_DIRECTION_URL = "../../data/paradox-forge/beta/beta-bungie-manifest-cache-trait-direction-extension.json";
const DEFAULT_FIXTURE_ID = "PF-BETA-03";
const BUNGIE_ROOT = "https://www.bungie.net";

let fixtures = null;
let identities = null;
let manifest = null;
let traitDirection = null;
let byHash = new Map();
let traitDirectionByHash = new Map();
let activeFixtureId = DEFAULT_FIXTURE_ID;

const absIcon = v => { const s=String(v??"").trim(); return !s?"":s.startsWith("http")?s:`${BUNGIE_ROOT}${s}`; };
function inferSourceKind(row){ const itemType=Number(row?.itemType); if(itemType===3)return "weapon"; if(itemType===2)return "armor"; return "gameComponent"; }
function manifestIdentity(hash){
  const h=Number(hash),row=guardianManifest.get("DestinyInventoryItemDefinition",h); if(!row)return null;
  const display=guardianManifest.identity(h);
  return {hash:h,bungieHash:h,name:display.name,description:display.description,icon:display.icon,itemType:row.itemType,itemSubType:row.itemSubType,itemTypeDisplayName:row.itemTypeDisplayName||"",classType:row.classType,itemCategoryHashes:row.itemCategoryHashes||[],traitIds:row.traitIds||[],equipmentSlotTypeHash:row.inventory?.bucketTypeHash??row.equippingBlock?.equipmentSlotTypeHash??null,ammoTypeCode:row.equippingBlock?.ammoType??null,uniqueLabelHash:row.equippingBlock?.uniqueLabelHash??null,intrinsicPlugHashes:(row.perks??[]).map(perk=>Number(perk?.perkHash)).filter(Number.isFinite),definition:row,sourceKind:inferSourceKind(row),identitySource:"bungie-full-manifest"};
}
function withTraitDirectionEvidence(item,hash){ const row=traitDirectionByHash.get(String(Number(hash))); return !item||!row?item:{...item,directionEvidence:{description:row.officialDescription??row.description??"",source:row.source??"bungie-official-description-extension"}}; }
function curatedSemantics(row){if(!row)return null;const {name,displayName,description,icon,...tags}=row;return tags;}
const resolve=hash=>{
  const h=Number(hash),legacy=curatedSemantics(byHash.get(String(h))??null),official=manifestIdentity(h);
  if(legacy&&official)return withTraitDirectionEvidence({...legacy,...official,sourceKind:legacy.sourceKind??official.sourceKind},h);
  if(official)return withTraitDirectionEvidence(official,h); if(legacy)return withTraitDirectionEvidence({...legacy,hash:h,bungieHash:h,name:`Unresolved Destiny definition ${h}`,icon:"",unresolved:true,identitySource:"unresolved"},h);
  const directional=traitDirectionByHash.get(String(h));
  if(directional)return {hash:h,bungieHash:h,name:`Unresolved Destiny definition ${h}`,icon:"",sourceKind:directional.sourceKind??"gameComponent",componentType:directional.componentType??null,identitySource:"unresolved",unresolved:true,directionEvidence:{description:directional.officialDescription??directional.description??"",source:directional.source??"bungie-official-description-extension"}};
  return {bungieHash:h,hash:h,name:`Unresolved Destiny definition ${h}`,icon:"",unresolved:true,identitySource:"unresolved"};
};
async function ensureData(){
  if(fixtures&&identities&&manifest&&traitDirection)return;
  const [fr,ir,mr,tr]=await Promise.all([fetch(FIXTURE_URL,{cache:"no-store"}),fetch(IDENTITY_URL,{cache:"no-store"}),fetch(MANIFEST_URL,{cache:"no-store"}),fetch(TRAIT_DIRECTION_URL,{cache:"no-store"}),guardianManifest.ready()]);
  if(!fr.ok)throw new Error(`Fixture load failed: ${fr.status}`); if(!ir.ok)throw new Error(`Identity load failed: ${ir.status}`); if(!mr.ok)throw new Error(`Manifest cache load failed: ${mr.status}`); if(!tr.ok)throw new Error(`Trait direction cache load failed: ${tr.status}`);
  fixtures=await fr.json(); identities=await ir.json(); manifest=await mr.json(); traitDirection=await tr.json();
  byHash=new Map((identities.identities??[]).map(row=>{const h=Number(row.bungieHash);return [String(h),{...row,hash:h,bungieHash:h}];}));
  traitDirectionByHash=new Map((traitDirection.items??[]).map(row=>[String(Number(row.bungieHash??row.hash)),row]));
  if(guardianManifest.status().mode!=="indexeddb")await guardianManifest.getMany("DestinyInventoryItemDefinition",(fixtures.fixtures??[]).flatMap(fixture=>fixture.allDestinyHashes??[]));
}
function inferredSubclassItem(fixture){ const candidates=(fixture.rawDim?.equipped??[]).filter(item=>{const socketHashes=Object.values(item?.socketOverrides??{});if(!socketHashes.length)return false;const componentTypes=socketHashes.map(resolve).map(part=>part?.componentType);return componentTypes.includes("aspect")&&componentTypes.includes("fragment");}); return candidates.length===1?candidates[0]:null; }
function subclassParts(fixture){
  const equipped=fixture.rawDim?.equipped??[],subclassItem=equipped.find(x=>fixture.subclassHash!=null&&Number(x.hash)===Number(fixture.subclassHash))??inferredSubclassItem(fixture),parts=Object.values(subclassItem?.socketOverrides??{}).map(resolve),out={super:null,classAbility:null,movement:null,melee:null,grenade:null,aspects:[],fragments:[]};
  for(const item of parts){switch(item.componentType){case "super":out.super=item;break;case "classAbility":out.classAbility=item;break;case "movementAbility":out.movement=item;break;case "melee":out.melee=item;break;case "grenade":out.grenade=item;break;case "aspect":out.aspects.push(item);break;case "fragment":out.fragments.push(item);break;}}
  return out;
}
function packedDisplayMods(modPool,index){return modPool.slice(index*5,index*5+5).map((mod,slotIndex)=>({...mod,displayPlacement:"dim-loadout-mod-pool",displaySlot:slotIndex,assignmentVerified:false}));}
function enrichArmourItem(item,fixture,displayMods=[]){
  const official=guardianManifest.get("DestinyInventoryItemDefinition",item.hash),bucketHash=official?.inventory?.bucketTypeHash??item.equipmentSlotTypeHash??null,appearanceByBucket=fixture.rawDim?.parameters?.modsByBucket??{},appearanceHashes=bucketHash!=null?(appearanceByBucket[String(bucketHash)]??[]):[],rarityText=String(item.rarity??item.tier??"").toLowerCase(),isExotic=item.isExotic===true||rarityText.includes("exotic")||Number(official?.inventory?.tierType)===6,intrinsicHashes=isExotic?(official?.perks??[]).map(perk=>Number(perk?.perkHash)).filter(Number.isFinite):[],intrinsicTraits=intrinsicHashes.map(resolve).filter(Boolean);
  return {...item,equipmentSlotTypeHash:bucketHash,armorSlot:item.itemTypeDisplayName||item.armorSlot||"",appearancePlugs:appearanceHashes.map(resolve),mods:displayMods,modAssignmentVerified:false,modDisplaySource:"dim-loadout-mod-pool",isExotic,intrinsicTraits,intrinsicTrait:isExotic?(intrinsicTraits[0]??null):null,rarity:item.rarity??(isExotic?"Exotic":null)};
}
function normalizeFixture(fixture){
  const equipped=(fixture.rawDim?.equipped??[]).map(item=>{const rollPerks=(item.rollPerks??[]).map(row=>({perkHash:Number(row.perkHash),socket:row.socket}));return {...resolve(item.hash),socketOverrides:item.socketOverrides??null,rollPerks,resolvedPerks:rollPerks.map(row=>({...row,definition:resolve(row.perkHash)})),fixtureSourceUrl:fixture.sourceUrl??null};});
  const subclass=subclassParts(fixture),weapons=equipped.filter(x=>x.sourceKind==="weapon"),modPool=(fixture.rawDim?.parameters?.mods??[]).map(resolve),armour=equipped.filter(x=>x.sourceKind==="armor").map((item,index)=>enrichArmourItem(item,fixture,packedDisplayMods(modPool,index))),artifactUnlocks=fixture.rawDim?.parameters?.artifactUnlocks??null,artifact=artifactUnlocks?{seasonNumber:artifactUnlocks.seasonNumber??fixture.artifactSeason??null,perks:(artifactUnlocks.unlockedItemHashes??[]).map(resolve)}:null,unresolvedHashes=(fixture.allDestinyHashes??[]).filter(h=>!guardianManifest.get("DestinyInventoryItemDefinition",h)),stats=fixture.stats??[["Mobility",100],["Resilience",65],["Recovery",105],["Discipline",100],["Intellect",40],["Strength",45]];
  const artifactConfiguration={schemaVersion:1,artifactHash:Number.isFinite(Number(artifact?.hash??artifact?.bungieHash))?Number(artifact?.hash??artifact?.bungieHash):null,seasonNumber:Number.isFinite(Number(artifactUnlocks?.seasonNumber??fixture.artifactSeason))?Number(artifactUnlocks?.seasonNumber??fixture.artifactSeason):null,selectedPerkHashes:artifactUnlocks?(artifactUnlocks.unlockedItemHashes??[]).map(Number).filter(Number.isFinite):[],source:"fixture-intent",provenance:{provider:"paradox-fixture",fixtureId:fixture.fixtureId,sourceUrl:fixture.sourceUrl??null}};
  return {source:"paradox-beta-fixture",fixtureId:fixture.fixtureId,dimId:fixture.dimId,sourceUrl:fixture.sourceUrl??null,characterId:fixture.fixtureId,displayName:fixture.displayName,classType:fixture.classType,className:fixture.className,characterClass:String(fixture.className??"").toLowerCase(),subclass:String(fixture.element??"").toLowerCase(),subclassName:fixture.subclassName,subclassHash:fixture.subclassHash,subclassIdentity:resolve(fixture.subclassHash),subclassIcon:resolve(fixture.subclassHash)?.icon??"",super:subclass.super,classAbility:subclass.classAbility,movement:subclass.movement,melee:subclass.melee,grenade:subclass.grenade,abilities:[subclass.classAbility,subclass.movement,subclass.melee,subclass.grenade].filter(Boolean),aspects:subclass.aspects,fragments:subclass.fragments,artifact,artifactConfiguration,weapons,armour,stats,armourModPool:modPool,modAssignmentVerified:false,buildFocus:fixture.buildFocus??null,synergyChains:fixture.synergyChains??[],weaponContribution:fixture.weaponContribution??[],activityProfile:fixture.activityProfile??{},knownStrengths:fixture.knownStrengths??[],knownWeakLinks:fixture.knownWeakLinks??[],mutationCases:fixture.mutationCases??[],beta:{evidenceStatus:fixture.evidenceStatus,resolved:(fixture.allDestinyHashes?.length??0)-unresolvedHashes.length,unresolved:unresolvedHashes.length,unresolvedHashes}};
}
export async function loadBetaFixture(id=DEFAULT_FIXTURE_ID){await ensureData();const fixture=(fixtures.fixtures??[]).find(f=>f.fixtureId===id||f.displayName===id);if(!fixture)throw new Error(`Unknown beta fixture: ${id}`);activeFixtureId=fixture.fixtureId;const detail=normalizeFixture(fixture),classLabel=document.querySelector(".char-switch b");if(classLabel)classLabel.textContent=`${detail.className} ▾`;document.dispatchEvent(new CustomEvent("forge:guardian-selection-changed",{detail}));document.dispatchEvent(new CustomEvent("forge:beta-fixture-loaded",{detail}));return detail;}
export async function listBetaFixtures(){await ensureData();return (fixtures.fixtures??[]).map(f=>({fixtureId:f.fixtureId,displayName:f.displayName,className:f.className,subclassName:f.subclassName,element:f.element}));}
async function start(){try{await ensureData();await loadBetaFixture(DEFAULT_FIXTURE_ID);}catch(error){console.error("[Paradox beta fixture loader]",error);}}
let started=false;function startOnce(){if(started)return;started=true;start();}
document.addEventListener("forge:guardian-workspace-ready",startOnce,{once:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(startOnce,0),{once:true});else setTimeout(startOnce,0);
globalThis.ForgeBetaFixtures={load:loadBetaFixture,list:listBetaFixtures,current:()=>activeFixtureId};
