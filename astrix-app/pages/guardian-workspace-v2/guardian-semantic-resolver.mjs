// Canonical semantic classification for live Bungie Guardian data.
// Keep this module deterministic and conservative: unknown evidence stays unknown.
import {paradoxDefinitionId,weaponSocketSection,weaponTypeIdentity} from '../../core/bungie-item-identity.mjs';

const norm=value=>String(value??"").trim().toLowerCase();
const WEAPON_PERK_MANIFEST_AUDIT=Object.freeze({source:'astrix-app/data/paradox-weapon-audit-report.json',method:'exhaustive-manifest-socket-and-plug-set-references'});
const uniq=rows=>rows.filter((row,index,all)=>row&&all.findIndex(other=>Number(other?.hash)===Number(row?.hash))===index);
const uniqTraits=rows=>rows.filter((row,index,all)=>row&&all.findIndex(other=>{
  return row?.paradoxId&&other?.paradoxId?row.paradoxId===other.paradoxId:Number(row?.hash)===Number(other?.hash)&&row?.identitySource===other?.identitySource;
})===index);
const uniqSockets=rows=>rows.filter((row,index,all)=>row&&all.findIndex(other=>{
  if(Number(other?.hash)!==Number(row?.hash))return false;
  const rowSocket=Number(row?.socketIndex),otherSocket=Number(other?.socketIndex);
  if(Number.isInteger(rowSocket)&&Number.isInteger(otherSocket))return rowSocket===otherSocket;
  return other===row;
})===index);

function weaponPerkIdentity(plug){
  if(!plug)return null;
  const hash=Number(plug?.hash??plug?.itemHash??plug?.bungieHash);
  const verifiedHash=Number.isInteger(hash)&&hash>0?hash:null;
  const definitionIcon=plug?.definition?.displayProperties?.icon||plug?.displayProperties?.icon||'';
  const icon=verifiedHash?(definitionIcon||plug?.icon||''):'';
  return {
    ...plug,
    hash:verifiedHash,
    bungieHash:verifiedHash,
    paradoxId:paradoxDefinitionId(plug.identitySource||'DestinyInventoryItemDefinition',verifiedHash),
    icon,
    iconItemHash:icon?verifiedHash:null,
    iconHash:icon?(plug?.definition?.displayProperties?.iconHash||plug?.displayProperties?.iconHash||null):null,
    iconSource:icon?(plug.identitySource||'DestinyInventoryItemDefinition'):null
  };
}

function semanticText(item){
  return [item?.name,item?.description,item?.itemTypeDisplayName,item?.definition?.plug?.plugCategoryIdentifier,item?.socketCategoryHash,item?.socketCategoryDefinition?.displayProperties?.name,item?.socketCategoryDefinition?.displayProperties?.description,...(item?.definition?.traitIds||[])].filter(Boolean).join(" ").toLowerCase();
}
function plugCategory(item){return norm(item?.definition?.plug?.plugCategoryIdentifier);}
function socketCategory(item){return norm([item?.socketCategoryDefinition?.displayProperties?.name,item?.socketCategoryDefinition?.displayProperties?.description].filter(Boolean).join(" "));}

const armourArchetypeNames=new Set([
  "paragon","grenadier","specialist","brawler","bulwark","gunner",
  "siegebreaker","skirmisher","demolitionist","colossus","reaver","powerhouse"
]);

function classifyArmourPlug(plug){
  const category=plugCategory(plug),text=semanticText(plug);
  if(/shader|ornament|skin/.test(text))return "appearance";
  if(/infus(e|ion)/.test(text)||category.includes("infusion"))return "infuse";
  // Armour 3.0 type plugs can arrive under a compound category containing
  // "masterwork". Type identity wins so its shield stays on the armour art.
  if(category.includes("archetype")||/armou?r[\s._-]*archetype/.test(text)||armourArchetypeNames.has(norm(plug?.name)))return "archetype";
  if(category.includes("masterwork")||/armou?r[\s._-]*masterwork|masterwork[\s._-]*level/.test(text))return "masterwork";
  if(category.includes("set_bonus")||category.includes("setbonus")||/\b[24][ -]?piece\b|set bonus/.test(text))return "set-bonus";
  if((Number(plug?.armourItemTierType)===6&&category.includes("intrinsic"))||(category.includes("exotic")&&(category.includes("intrinsic")||category.includes("perk")))||/exotic (armou?r )?(intrinsic|perk)/.test(text))return "exotic-perk";
  if(category.includes("armor.mods.general")||category.includes("armour.mods.general")||/general armou?r mod/.test(text))return "general-mod";
  if((category.includes("armor.mods")||category.includes("armour.mods")||/armou?r mod/.test(text))&&!/general armou?r mod/.test(text))return "slot-mod";
  return "unknown";
}

function setEffects(plugs){
  const effects=plugs.filter(plug=>classifyArmourPlug(plug)==="set-bonus");
  return {identity:null,twoPiece:effects.find(plug=>/\b2[ -]?piece\b/.test(semanticText(plug)))||null,fourPiece:effects.find(plug=>/\b4[ -]?piece\b/.test(semanticText(plug)))||null,effects};
}

function normaliseArmourSemantics({plugs=[],instance=null,stats=null}={}){
  const buckets={masterwork:[],generalMods:[],slotMods:[],archetype:[],exoticPerk:[],discarded:[],unknown:[]};
  for(const plug of plugs){
    const role=classifyArmourPlug(plug);
    if(role==="appearance")continue;
    if(role==="infuse")buckets.discarded.push({...plug,semanticRole:"infuse"});
    else if(role==="masterwork")buckets.masterwork.push(plug);
    else if(role==="general-mod")buckets.generalMods.push(plug);
    else if(role==="slot-mod")buckets.slotMods.push(plug);
    else if(role==="archetype")buckets.archetype.push(plug);
    else if(role==="exotic-perk")buckets.exoticPerk.push(plug);
    else if(role!=="set-bonus")buckets.unknown.push(plug);
  }
  const energy=instance?.energy||null;
  const tier=Number.isFinite(Number(instance?.gearTier))?Number(instance.gearTier):null;
  return {
    tier,masterwork:buckets.masterwork[0]||null,masterworkCandidates:uniq(buckets.masterwork),
    energy:energy?{type:energy.energyType??null,typeHash:energy.energyTypeHash??null,capacity:Number.isFinite(Number(energy.energyCapacity))?Number(energy.energyCapacity):null,used:Number.isFinite(Number(energy.energyUsed))?Number(energy.energyUsed):null}:null,
    archetype:buckets.archetype[0]||null,generalMods:uniqSockets(buckets.generalMods),slotMods:uniqSockets(buckets.slotMods),exoticPerk:buckets.exoticPerk[0]||null,
    set:setEffects(plugs),stats:stats?.stats||stats||null,discarded:uniq(buckets.discarded),unknownPlugs:uniq(buckets.unknown),complete:buckets.unknown.length===0
  };
}

function classifyWeaponPlug(plug){
  const category=plugCategory(plug),socket=socketCategory(plug),text=semanticText(plug);
  const section=weaponSocketSection(plug);
  // The same plug family (notably "frames") occurs in different sections.
  // Resolve the actual weapon's socket category before interpreting any words.
  if(section==='perks')return 'perk';
  if(section==='intrinsic')return 'intrinsic';
  if(section==='cosmetics')return 'appearance';
  if(section==='mods'){
    if(category.includes('infusion')||/^infuse$/i.test(plug.name||''))return 'infuse';
    if(category.includes('catalyst')||/\bcatalyst\b/i.test(plug.name||'')||/exotic.*masterwork/.test(category))return 'catalyst';
    if(category.includes('masterwork')&&!category.includes('tracker'))return 'masterwork';
    return 'weapon-mod';
  }
  if(/shader|ornament|skin/.test(text))return "appearance";
  if(category.includes("infusion")||/\binfus(e|ion)\b/.test(text))return "infuse";
  if(category.includes("catalyst")||/\bcatalyst\b/.test(text))return "catalyst";
  if(category.includes("masterwork")||/weapon masterwork|masterwork level/.test(text))return "masterwork";
  if(category.includes("intrinsic")||/\b(frame|intrinsic)\b/.test(text))return "intrinsic";
  // These two families are visually close in Bungie's inspection screen but
  // are not interchangeable. Level Boost is a weapon-mod socket; Kill Tracker
  // is a perk choice and stays in the final perk column.
  if(/weapon level boost|level boost socket/.test(text))return "weapon-mod";
  if(/\bkill tracker\b/.test(text))return "perk";
  if(category.includes("barrel")||category.includes("magazine")||category.includes("trait")||category.includes("perk"))return "perk";
  if(category.includes("weapon.mods")||/weapon mod/.test(text))return "weapon-mod";
  // Definition-level identity wins over a broad socket label. Exotic traits
  // can share a socket family whose display title contains "Mods" while the
  // inserted plug is still a real weapon trait.
  if(/\b(perk|trait|barrel|magazine)\b/.test(socket))return "perk";
  if(/\bmod(s|ification)?\b/.test(socket))return "weapon-mod";
  return "unknown";
}

function weaponPerkFamily(plug){
  const category=plugCategory(plug),value=semanticText(plug);
  if(category.includes("barrel"))return "barrel";
  if(category.includes("magazine"))return "magazine";
  if(category.includes("trait")||category.includes("perk"))return "trait";
  if(/\bbarrel\b/.test(value))return "barrel";
  if(/\bmagazine\b|\bmagwell\b/.test(value))return "magazine";
  if(/\b(stock|grip|sight|scope)\b/.test(value))return "tuning";
  if(/\btrait\b|\bperk\b/.test(value))return "trait";
  return "perk";
}

function weaponPerkRowCountForTier(value){
  const tier=Number(value);
  if(!Number.isInteger(tier)||tier<0)return null;
  if(tier>=5)return 3;
  if(tier>=3)return 2;
  return 1;
}

function weaponPerkColumnRowCountForTier(value,columnNumber){
  const tier=Number(value),column=Number(columnNumber);
  if(!Number.isInteger(tier)||tier<0||!Number.isInteger(column)||column<1)return null;
  // Tier 5 adds a third selectable perk only to visual columns 3 and 4.
  // The other columns remain two rows, exactly as Bungie's weapon inspection
  // model presents them. Tier 3 and 4 weapons use two rows throughout.
  if(tier>=5)return column===3||column===4?3:2;
  if(tier>=3)return 2;
  return 1;
}

function normaliseWeaponPerkModel({gearTier=null,selectedPerks=[],alternativePerkColumns=[]}={}){
  const weaponTier=Number.isInteger(Number(gearTier))&&Number(gearTier)>=0?Math.min(5,Number(gearTier)):null;
  let expectedRowCount=weaponPerkRowCountForTier(weaponTier)??1;
  const selectedBySocket=new Map((selectedPerks||[]).filter(perk=>Number.isInteger(Number(perk?.socketIndex))).map(perk=>[Number(perk.socketIndex),perk]));
  const alternativesBySocket=new Map((alternativePerkColumns||[]).filter(column=>Number.isInteger(Number(column?.socketIndex))).map(column=>[Number(column.socketIndex),(column.options||[]).filter(option=>classifyWeaponPlug(option)==="perk")]));
  const socketIndexes=[...new Set([...selectedBySocket.keys(),...alternativesBySocket.keys()])].sort((left,right)=>left-right);
  const columns=socketIndexes.map((socketIndex,columnIndex)=>{
    const selected=selectedBySocket.get(socketIndex)||null,available=uniq(alternativesBySocket.get(socketIndex)||[]);
    const selectedHash=Number(selected?.hash??selected?.itemHash??selected?.bungieHash);
    const selectedInAvailable=selected&&available.some(option=>Number(option?.hash??option?.itemHash??option?.bungieHash)===selectedHash);
    const options=selected&&!selectedInAvailable?uniq([selected,...available]):available;
    const columnNumber=columnIndex+1,columnRowCount=weaponPerkColumnRowCountForTier(weaponTier,columnNumber)??expectedRowCount;
    // Tier rules provide a baseline, never a cap on real instance evidence.
    const visibleOptions=options;
    const selectedVisible=!selected||visibleOptions.some(option=>Number(option?.hash??option?.itemHash??option?.bungieHash)===selectedHash);
    return {
      socketIndex,
      columnNumber,
      family:weaponPerkFamily(selected||options[0]),
      expectedRowCount:Math.max(columnRowCount,visibleOptions.length),
      tierRowCapacity:columnRowCount,
      selectedPlugHash:Number.isInteger(selectedHash)&&selectedHash>0?selectedHash:null,
      options:visibleOptions,
      overflowOptionCount:0,
      missingOptionCount:Math.max(0,columnRowCount-visibleOptions.length),
      selectedVisible
    };
  }).filter(column=>column.options.length||column.selectedPlugHash);
  expectedRowCount=Math.max(expectedRowCount,...columns.map(column=>column.options.length));
  const rows=Array.from({length:expectedRowCount},(_,rowIndex)=>{
    const slots=columns.map(column=>{
      const perk=column.options[rowIndex]||null,hash=Number(perk?.hash??perk?.itemHash??perk?.bungieHash);
      return {socketIndex:column.socketIndex,family:column.family,perk,isSelected:Boolean(perk&&column.selectedPlugHash&&hash===column.selectedPlugHash),verified:Boolean(perk&&Number.isInteger(hash)&&hash>0)};
    });
    return {rowIndex,tierRow:rowIndex+1,slots,perks:slots.map(slot=>slot.perk).filter(Boolean),verifiedPerkCount:slots.filter(slot=>slot.verified).length};
  });
  const unindexedPerks=(selectedPerks||[]).filter(perk=>!Number.isInteger(Number(perk?.socketIndex)));
  return {
    schemaVersion:3,
    source:"bungie-instance-gear-tier-and-reusable-plugs",
    weaponTier,
    expectedRowCount,
    rowPolicy:{tier0:1,tier1:1,tier2:1,tier3:2,tier4:2,tier5:{default:2,column3:3,column4:3}},
    columnCount:columns.length,
    columns,
    rows,
    unindexedPerks,
    complete:columns.every(column=>column.selectedVisible)&&unindexedPerks.length===0
  };
}

function catalystProgress(profile,itemInstanceId,catalyst){
  if(!itemInstanceId||!catalyst)return null;
  const row=profile?.itemComponents?.plugObjectives?.data?.[itemInstanceId]||null;
  const byPlug=row?.objectivesPerPlug||{};
  const objectives=byPlug[String(catalyst.hash)]||byPlug[catalyst.hash]||[];
  const completed=objectives.length>0&&objectives.every(objective=>Boolean(objective.complete));
  const inserted=Boolean(catalyst.isEnabled),masterworked=inserted&&completed;
  return {acquired:true,inserted,objectives,completed,masterworked,active:masterworked};
}

function enhancementState(item){
  const state=Number(item?.state)||0;
  return {rawState:state,masterworked:Boolean(state&4),crafted:Boolean(state&8),enhanced:Boolean(state&32)};
}

function normaliseAlternativeColumns(columns={}){
  return Object.entries(columns||{}).map(([socketIndex,plugs])=>({
    socketIndex:Number(socketIndex),
    options:uniq((plugs||[]).map(weaponPerkIdentity).filter(plug=>plug?.bungieHash&&["perk","intrinsic","weapon-mod","catalyst"].includes(classifyWeaponPlug(plug))))
  })).filter(column=>column.options.length);
}

function normaliseWeaponSemantics({profile=null,item=null,itemDefinition=null,plugs=[],instance=null,stats=null,alternativeColumns={},isExotic=false}={}){
  const groups={intrinsic:[],perks:[],masterwork:[],mod:[],catalyst:[],discarded:[],unknown:[]};
  for(const sourcePlug of plugs){
    if(sourcePlug?.isVisible===false)continue;
    const plug=weaponPerkIdentity(sourcePlug);
    if(!plug?.bungieHash){groups.unknown.push(plug);continue;}
    const role=classifyWeaponPlug(plug);
    if(role==="appearance")continue;
    if(role==="infuse")groups.discarded.push({...plug,semanticRole:"infuse"});
    if(role==="intrinsic")groups.intrinsic.push(plug);
    else if(role==="perk")groups.perks.push(plug);
    else if(role==="masterwork")groups.masterwork.push(plug);
    else if(role==="weapon-mod")groups.mod.push(plug);
    else if(role==="catalyst")groups.catalyst.push(plug);
    else if(role!=="infuse")groups.unknown.push(plug);
  }
  const catalyst=groups.catalyst[0]||null;
  const alternativePerkColumns=normaliseAlternativeColumns(alternativeColumns);
  const gearTier=Number.isInteger(Number(instance?.gearTier))&&Number(instance.gearTier)>=0?Math.min(5,Number(instance.gearTier)):null;
  const selectedPerks=uniqSockets(groups.perks),perkModel=normaliseWeaponPerkModel({gearTier,selectedPerks,alternativePerkColumns});
  const definitionTraits=(itemDefinition?.resolvedSandboxPerks||item?.definition?.resolvedSandboxPerks||[]).map(definition=>{
    const display=definition?.displayProperties||{},hash=Number(definition?.hash);
    return weaponPerkIdentity({hash,bungieHash:hash,name:display.name||"",description:display.description||"",icon:display.icon||"",definition,semanticRole:"intrinsic-trait",identitySource:"DestinySandboxPerkDefinition"});
  }).filter(trait=>trait?.bungieHash);
  const intrinsic=groups.intrinsic[0]||definitionTraits[0]||null,intrinsicTraits=uniqTraits([intrinsic,...groups.intrinsic.slice(1),...definitionTraits].filter(Boolean)),exoticTraits=isExotic?intrinsicTraits.slice(1):[];
  const modSockets=uniqSockets([...groups.masterwork,...groups.mod,...groups.catalyst]).sort((left,right)=>Number(left?.socketIndex??Number.MAX_SAFE_INTEGER)-Number(right?.socketIndex??Number.MAX_SAFE_INTEGER));
  const socketOrder=uniqSockets(plugs.map(weaponPerkIdentity).filter(plug=>plug?.bungieHash).map(plug=>({...plug,semanticRole:classifyWeaponPlug(plug)}))).filter(plug=>!['appearance','infuse','unknown'].includes(plug.semanticRole)).sort((left,right)=>Number(left?.socketIndex??Number.MAX_SAFE_INTEGER)-Number(right?.socketIndex??Number.MAX_SAFE_INTEGER)).map(plug=>({socketIndex:Number.isInteger(Number(plug.socketIndex))?Number(plug.socketIndex):null,plugHash:plug.bungieHash,role:plug.semanticRole,name:plug.name||''}));
  const iconItems=uniq([...intrinsicTraits,...groups.perks,...groups.masterwork,...groups.mod,...groups.catalyst,...alternativePerkColumns.flatMap(column=>column.options)]);
  const perkIconHashMap=Object.fromEntries(iconItems.filter(item=>item.icon&&item.iconItemHash===item.bungieHash).map(item=>[String(item.bungieHash),item.icon]));
  return {
    paradoxId:paradoxDefinitionId('DestinyInventoryItemDefinition',item?.itemHash??itemDefinition?.hash),weaponType:weaponTypeIdentity(itemDefinition||{}),
    gearTier,intrinsic,intrinsicTraits,selectedPerks,alternativePerkColumns,perkModel,perkRows:perkModel.rows,perkRowCount:perkModel.expectedRowCount,perkIconHashMap,exoticTraits,
    enhancementState:enhancementState(item),masterwork:groups.masterwork[0]||null,mod:groups.mod[0]||null,modSockets,
    catalyst:catalyst?{...catalyst,progress:catalystProgress(profile,item?.itemInstanceId,catalyst)}:null,
    champion:(instance?.breakerTypeHash||instance?.breakerType)?{breakerType:instance.breakerType??null,breakerTypeHash:instance.breakerTypeHash??null,source:"bungie-item-instance"}:null,
    socketModel:{schemaVersion:2,source:"bungie-instance-socket-order",socketOrder,sections:{perks:perkModel.columns.map(column=>column.socketIndex),mods:modSockets.map(plug=>Number.isInteger(Number(plug.socketIndex))?Number(plug.socketIndex):null),intrinsic:intrinsicTraits.map(plug=>Number.isInteger(Number(plug.socketIndex))?Number(plug.socketIndex):null),catalyst:catalyst&&Number.isInteger(Number(catalyst.socketIndex))?Number(catalyst.socketIndex):null}},
    statSockets:plugs.map(plug=>({...plug,semanticRole:classifyWeaponPlug(plug)})),
    stats:stats?.stats||stats||null,discarded:uniq(groups.discarded),unknownPlugs:uniq(groups.unknown),complete:groups.unknown.length===0
  };
}

function normaliseGuardianStats(statPairs=[]){
  return Object.fromEntries((statPairs||[]).map(([name,value])=>{const numeric=Number(value)||0;return [name,{value:numeric,enhancedThreshold:100,enhancedThresholdReached:numeric>100}];}));
}
function validateArtifact(artifact){
  const active=artifact?.activePerks||[],hashes=active.map(item=>Number(item?.hash)).filter(Number.isFinite);
  return {activeCount:active.length,uniqueActiveCount:new Set(hashes).size,noDuplicateActiveHashes:new Set(hashes).size===hashes.length};
}

export {WEAPON_PERK_MANIFEST_AUDIT,semanticText,plugCategory,classifyArmourPlug,normaliseArmourSemantics,classifyWeaponPlug,weaponPerkIdentity,weaponPerkFamily,weaponPerkRowCountForTier,weaponPerkColumnRowCountForTier,normaliseWeaponPerkModel,normaliseWeaponSemantics,normaliseGuardianStats,validateArtifact,enhancementState};
