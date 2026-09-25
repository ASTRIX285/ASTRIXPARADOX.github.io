import {ARMOUR_BUCKETS,WEAPON_BUCKETS} from '../guardian-perk-change-plan.mjs?plain=20260925-1';
import {ARMOUR_STAT_KEYS,armourStatVector} from '../../vault/vault-armour-matcher.mjs';
import {isExoticItem,validateExoticLoadout,validateArmourModLoadout} from './paradox-loadout-intelligence.mjs?v=20260916-weapon-combinations-1&plain=20260925-1';

const BUILD_ELEMENTS=Object.freeze(['arc','solar','strand','stasis','void','prismatic']);
const DIRECT_ENTRY_MODES=new Set(['equipped','owned']);
const CLASS_TYPES={titan:0,hunter:1,warlock:2};
const instanceId=item=>String(item?.itemInstanceId||'');
const itemHash=item=>Number(item?.itemHash??item?.hash);
const ownedSource=item=>['equipped','carried','vault','profile','postmaster'].includes(item?.source?.kind);
const matchesClass=(item,build)=>{const value=item?.classType??item?.definition?.classType;return value!=null&&[CLASS_TYPES[build.characterClass],3].includes(Number(value));};
const verifiedSockets=item=>item?.socketsAvailable===true&&item?.socketCoverage?.complete===true&&!(item.socketCoverage.unresolved||[]).length;
const directEntryMode=build=>DIRECT_ENTRY_MODES.has(build?.forgeLoaderDecision?.entryMode)?build.forgeLoaderDecision.entryMode:null;

function directArmourChoices(build={},slotIndex){
  return (build.ownedArmour||[]).filter(item=>/^\d+$/.test(instanceId(item))&&ownedSource(item)&&Number(item.bucketHash)===ARMOUR_BUCKETS[slotIndex]&&matchesClass(item,build));
}

// Adapt real owned-instance evidence to the existing engine input contract.
// No Loader ranking, maximized flag, stat target or optimiser result is invented.
function withDirectGenerationContext(build,mode=directEntryMode(build)){
  if(!DIRECT_ENTRY_MODES.has(mode))throw new Error('Choose a direct Build Forge entry.');
  const anchor=(build.armour||[]).find(isExoticItem),perk=anchor?.armourSemantics?.exoticPerk||anchor?.exoticPerk||anchor?.intrinsicTrait||null;
  const rawStats=(build.armour||[]).map(armourStatVector),achieved=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,rawStats.reduce((sum,stats)=>sum+stats[key],0)]));
  const setProtocol=[],seen=new Set();
  for(const item of build.armour||[]){
    const set=item?.armourSemantics?.set||item?.setBonus;
    for(const effect of set?.effects||[]){
      const count=Number(effect.requiredSetCount),key=`${set.hash}:${count}`;
      if(effect.active===true&&!seen.has(key)){seen.add(key);setProtocol.push({setHash:set.hash,count,setName:set.name||set.identity?.name,trait:effect});}
    }
  }
  return {...build,forgeLoaderDecision:{schemaVersion:1,source:'build-forge-owned-instance-entry',entryMode:mode,
    binding:{characterId:String(build.characterId||''),membershipId:String(build.membershipId||''),membershipType:String(build.membershipType||'')},
    buildAnchor:anchor?{name:anchor.name,selectedItemHash:itemHash(anchor),selectedItemInstanceId:instanceId(anchor),perk}:null,
    statDirective:{achieved,modsApplied:false},setProtocol}};
}

function createDirectGenerationBuild(equipped,{mode,armour,ownedArmour,ownedWeapons}){
  const build={...equipped,armour,ownedArmour,
    ownedWeapons:(ownedWeapons||[]).filter(item=>/^\d+$/.test(instanceId(item))&&ownedSource(item)&&matchesClass(item,equipped)&&verifiedSockets(item)),vaultWeapons:[],inventoryWeapons:[]};
  for(const key of ['forgeLoaderDecision','vaultArmourSelection','recommendationGeneratedAt','recommendationElement','recommendationStatus','forgeIntelligence','forgeEvidence','liveTransferPreflight','liveTransferPlan','liveTransferResult'])delete build[key];
  return withDirectGenerationContext(build,mode);
}

function validateForgeGenerationEntry(build={}){
  const mode=directEntryMode(build),exotic=validateExoticLoadout(build,{requireArmourAnchor:true});
  if(!mode){
    const tier=validateTierFiveArmour(build);
    return {ready:Boolean(build.forgeLoaderDecision)&&tier.ready&&exotic.ready,reason:!build.forgeLoaderDecision?'Choose a direct entry or stage a Forge Loader armour result.':tier.reason||exotic.reason};
  }
  const binding=build.forgeLoaderDecision.binding||{},fail=reason=>({ready:false,reason});
  for(const key of ['characterId','membershipId','membershipType'])if(!/^\d+$/.test(String(build[key]||''))||String(binding[key])!==String(build[key]))return fail('The direct entry must match the selected Guardian and Bungie membership.');
  if(!Object.hasOwn(CLASS_TYPES,build.characterClass))return fail('The selected Guardian class is unresolved.');
  for(const [kind,buckets,catalogue] of [['armour',ARMOUR_BUCKETS,build.ownedArmour],['weapons',WEAPON_BUCKETS,build.ownedWeapons]]){
    const items=build[kind]||[];
    if(items.length!==buckets.length||new Set(items.map(instanceId)).size!==buckets.length)return fail(`A complete set of ${kind} instances is required.`);
    for(const [index,item] of items.entries()){
      if(!/^\d+$/.test(instanceId(item))||!ownedSource(item)||Number(item?.bucketHash)!==buckets[index]||!(catalogue||[]).some(row=>instanceId(row)===instanceId(item)&&itemHash(row)===itemHash(item)&&ownedSource(row)))return fail(`The selected ${kind} must match inventory and its equipment slot.`);
      if(!matchesClass(item,build))return fail('The selected equipment does not match this Guardian class.');
      if(!verifiedSockets(item))return fail('Item socket data is required before generation.');
      const capacity=item?.energy?.capacity??item?.armourSemantics?.energy?.capacity;
      if(kind==='armour'&&(capacity==null||!Number.isFinite(Number(capacity))||Number(capacity)<0))return fail('Armour energy capacity is required before generation.');
    }
  }
  if(!exotic.ready)return fail(exotic.reason.replace('Return to Forge Loader and stage a legal armour result.','Choose a legal armour selection.').replace('The selected Forge Loader Exotic armour piece is missing from this build.','Choose one Exotic armour piece before generation.'));
  const mods=validateArmourModLoadout(build);if(!mods.ready)return fail(mods.reason);
  return {ready:true,reason:''};
}

function armourTierOf(item){
  const value=Number(item?.armourTier??item?.armourSemantics?.tier??item?.gearTier);
  return Number.isFinite(value)?value:null;
}

function verifiedMasterworkState(item){
  const semantics=item?.armourSemantics||{};
  const source=item?.masterwork??semantics.masterwork??null;
  const level=Number(item?.masterworkLevel??semantics.masterworkLevel);
  if(item?.isMasterworked===true||item?.masterworked===true)return 'MASTERWORK';
  if(source&&(/masterwork/i.test(String(source?.semanticRole||source?.name||source?.displayName||''))||Number.isFinite(level)))return 'MASTERWORK';
  return 'MASTERWORK NOT REPORTED';
}

function validateTierFiveArmour(build={}){
  const armour=Array.isArray(build.armour)?build.armour.filter(Boolean):[];
  const tiers=armour.map(armourTierOf);
  const complete=armour.length===5&&tiers.every(tier=>Number.isFinite(tier)&&tier>=5);
  const maximized=build?.forgeLoaderDecision?.ranking?.maximized===true;
  return {
    ready:complete&&maximized,
    complete,
    maximized,
    tiers,
    reason:armour.length!==5
      ?'Five exact armour instances are required.'
      :tiers.some(tier=>!Number.isFinite(tier))
        ?'An armour tier is missing.'
        :tiers.some(tier=>tier<5)
          ?'Generated builds require T5 armour in every slot.'
          :!maximized
            ?'Stage a Maximized Forge Loader result first.'
            :''
  };
}

export {BUILD_ELEMENTS,armourTierOf,verifiedMasterworkState,validateTierFiveArmour,directEntryMode,directArmourChoices,withDirectGenerationContext,createDirectGenerationBuild,validateForgeGenerationEntry};
