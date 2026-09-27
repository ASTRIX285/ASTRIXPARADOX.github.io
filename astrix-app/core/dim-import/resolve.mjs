import {accountItems,bungieArtwork,hashValue,loadoutWorkingBuild} from '../../shared/loadout-details-model.mjs?v=20260927-loadout-details-1';
import {WEAPON_BUCKETS,ARMOUR_BUCKETS,SUBCLASS_BUCKET} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {subclassPlugComponent} from '../../pages/guardian-workspace-v2/guardian-subclass-plug-classifier.mjs';
import {classifyArmourPlug,classifyWeaponPlug} from '../../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
const ITEM='DestinyInventoryItemDefinition';
const STAT_HASHES=new Set([2996146975,392767087,1943323491,1735777505,144602215,4244567218]);
const kindOf=bucket=>bucket===SUBCLASS_BUCKET?'subclass':WEAPON_BUCKETS.includes(bucket)?'weapon':ARMOUR_BUCKETS.includes(bucket)?'armour':'item';
const setOf=definition=>definition?.equipableItemSetHash||definition?.equippingBlock?.equipableItemSetHash;
export function collectDimHashes(loadout){
  const requests={};const add=(type,hash)=>{if(!hashValue(hash))throw new Error(`Invalid DIM hash in ${type}.`);(requests[type]??=new Set()).add(Number(hash));};
  for(const item of [...loadout.equipped,...(loadout.unequipped||[])]){add(ITEM,item.hash);for(const [index,hash] of Object.entries(item.socketOverrides||{})){if(!/^\d+$/.test(index)||Number(index)>1000)throw new Error('Invalid DIM socket index.');if(hash!==0)add(ITEM,hash);}}
  const p=loadout.parameters||{};
  for(const hash of [...(p.mods||[]),...(p.artifactUnlocks?.unlockedItemHashes||[])])add(ITEM,hash);
  for(const hash of p.perks||[])add('DestinySandboxPerkDefinition',hash);
  for(const [bucket,hashes] of Object.entries(p.modsByBucket||{})){add('DestinyInventoryBucketDefinition',bucket);for(const hash of hashes)add(ITEM,hash);}
  for(const hash of Object.keys(p.setBonuses||{}))add('DestinyEquipableItemSetDefinition',hash);
  if(p.exoticArmorHash&&p.exoticArmorHash!==-1)add(ITEM,p.exoticArmorHash);
  for(const row of p.statConstraints||[])add('DestinyStatDefinition',row.statHash);
  for(const [key,type] of [['nameHash','Name'],['iconHash','Icon'],['colorHash','Color']])if(p.inGameIdentifiers?.[key])add(`DestinyLoadout${type}Definition`,p.inGameIdentifiers[key]);
  return Object.fromEntries(Object.entries(requests).map(([type,hashes])=>[type,[...hashes]]));
}
export function inventoryIndex(profile,tables,characterId){
  const byHash=new Map(),byBucket=new Map();
  for(const item of accountItems(profile).values()){
    const definition=tables[ITEM]?.[item.itemHash];if(!definition||definition.retired||item.source.kind==='postmaster')continue;
    const character=profile.characters?.data?.[characterId];
    if(definition.classType<3&&character&&definition.classType!==character.classType)continue;
    const bucket=definition.inventory?.bucketTypeHash;
    if(bucket===SUBCLASS_BUCKET&&String(item.source.characterId)!==String(characterId))continue;
    const row={...item,definition,bucketHash:bucket};
    for(const [map,key] of [[byHash,item.itemHash],[byBucket,bucket]]){if(!map.has(Number(key)))map.set(Number(key),[]);map.get(Number(key)).push(row);}
  }
  return {byHash,byBucket};
}
function perkScore(item,overrides,profile){
  return Object.entries(overrides||{}).reduce((score,[index,hash])=>{
    const current=profile.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets?.[index]?.plugHash;
    const reusable=profile.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs?.[index]||[];
    return score+(Number(current)===hash?2:reusable.some(plug=>Number(plug.plugItemHash)===hash&&plug.enabled!==false)?1:0);
  },0);
}
const stable=(a,b)=>String(a.itemInstanceId).localeCompare(String(b.itemInstanceId));
function closest(candidates,definition,profile,overrides,bucketPlugs=[]){return [...candidates].sort((a,b)=>{
  const score=row=>{
    const current=profile.itemComponents?.sockets?.data?.[row.itemInstanceId]?.sockets||[];
    const reusable=Object.values(profile.itemComponents?.reusablePlugs?.data?.[row.itemInstanceId]?.plugs||{}).flat();
    const shared=bucketPlugs.reduce((n,hash)=>n+Number(current.some(plug=>plug.plugHash===hash)||reusable.some(plug=>plug.plugItemHash===hash&&plug.enabled!==false)),0);
    return (perkScore(row,overrides,profile)+shared)*10+Number(row.definition.itemSubType===definition.itemSubType)*3+Number(row.definition.defaultDamageTypeHash===definition.defaultDamageTypeHash)*2+Number(Boolean(setOf(row.definition))&&setOf(row.definition)===setOf(definition))*5;
  };
  return score(b)-score(a)||stable(a,b);
})[0]||null;}
function chooseArmour(items,index,profile,parameters,constraints){
  const pools=items.filter(row=>row.equipped&&row.kind==='armour').map(row=>({row,candidates:row.isExotic?index.byHash.get(row.itemHash)||[]:(index.byBucket.get(row.bucketHash)||[]).filter(item=>item.definition.inventory?.tierType===5)}));
  const selected=new Map(pools.map(({row,candidates})=>[row.bucketHash,candidates.find(item=>item.itemHash===row.itemHash)||[...candidates].sort(stable)[0]||null]));
  const loss=()=>{
    let missing=0;const sets={},stats={};
    for(const item of selected.values()){if(!item){missing+=1;continue;}const set=setOf(item.definition);if(set)sets[set]=(sets[set]||0)+1;for(const [hash,stat] of Object.entries(profile.itemComponents?.stats?.data?.[item.itemInstanceId]?.stats||{}))stats[hash]=(stats[hash]||0)+Number(stat.value||0);}
    const setDeficit=Object.entries(parameters.setBonuses||{}).reduce((n,[hash,count])=>n+Math.max(0,Number(count)-(sets[hash]||0)),0);
    const statDeficit=constraints.filter(row=>!row.legacy).reduce((n,row)=>n+Math.max(0,(row.minStat??0)-(stats[row.statHash]||0))+Math.max(0,(stats[row.statHash]||0)-(row.maxStat??200)),0);
    return missing*1e9+setDeficit*1e6+statDeficit;
  };
  // Deterministic bounded coordinate search. A preselection, not a promise that
  // every target is achievable. Exact measured stats drive the cost.
  for(let pass=0;pass<5;pass++){let changed=false;for(const {row,candidates} of pools){const old=selected.get(row.bucketHash);let best=old,bestLoss=loss();for(const candidate of [...candidates].sort(stable)){selected.set(row.bucketHash,candidate);const next=loss();if(next<bestLoss){best=candidate;bestLoss=next;}}selected.set(row.bucketHash,best);changed||=best!==old;}if(!changed)break;}
  return selected;
}
export function resolveDimLoadout(loadout,{snapshot,profile={},binding={}}){
  const {tables,version}=snapshot,requests=collectDimHashes(loadout),missing=[];let requested=0;
  for(const [type,hashes] of Object.entries(requests))for(const hash of hashes){requested++;if(!tables[type]?.[hash])missing.push(`${type}:${hash}`);}
  if(missing.length){const error=new Error(`The full manifest is missing ${missing.length} shared definitions. Retry after the manifest updates.`);error.unresolved=missing;throw error;}
  const get=(type,hash)=>tables[type]?.[hash];
  const describe=(type,hash)=>{const definition=get(type,hash);return {hash:Number(hash),name:definition?.displayProperties?.name||definition?.name||'',description:definition?.displayProperties?.description||'',icon:bungieArtwork(definition?.displayProperties?.icon||definition?.iconImagePath||definition?.colorImagePath),definition,retired:definition?.retired===true,empty:false,unresolved:false};};
  const parameters=loadout.parameters||{};
  const statConstraints=(parameters.statConstraints||[]).map(row=>({...row,...describe('DestinyStatDefinition',row.statHash),legacy:row.minTier!==undefined||row.maxTier!==undefined||!STAT_HASHES.has(row.statHash)}));
  for(const row of statConstraints)if(!row.legacy&&((row.minStat!==undefined&&(!Number.isFinite(row.minStat)||row.minStat<0||row.minStat>200))||(row.maxStat!==undefined&&(!Number.isFinite(row.maxStat)||row.maxStat<0||row.maxStat>200))||(row.minStat??0)>(row.maxStat??200)))throw new Error('Invalid DIM stat constraint.');
  const index=inventoryIndex(profile,tables,binding.characterId);
  const equipped=loadout.equipped.map(item=>({...item,equipped:true}));
  const pinned=parameters.exoticArmorHash>0?get(ITEM,parameters.exoticArmorHash):null;
  if(pinned&&!pinned.retired&&ARMOUR_BUCKETS.includes(pinned.inventory?.bucketTypeHash)&&pinned.inventory?.tierType===6){
    const position=equipped.findIndex(item=>get(ITEM,item.hash)?.inventory?.bucketTypeHash===pinned.inventory.bucketTypeHash);
    if(position<0)equipped.push({hash:pinned.hash,equipped:true});
    else if(equipped[position].hash!==pinned.hash)equipped[position]={hash:pinned.hash,equipped:true};
  }
  const items=[...equipped,...(loadout.unequipped||[]).map(item=>({...item,equipped:false}))].map(saved=>{
    const base=describe(ITEM,saved.hash),definition=base.definition,bucket=definition.inventory?.bucketTypeHash,kind=kindOf(bucket);
    const sockets=Object.entries(saved.socketOverrides||{}).map(([socketIndex,hash])=>{
      if(!hash)return {hash:null,socketIndex:Number(socketIndex),empty:true,unresolved:false,name:'Empty socket',icon:''};
      const plug={...describe(ITEM,hash),socketIndex:Number(socketIndex)};
      const categoryHash=definition.sockets?.socketCategories?.find(row=>row.socketIndexes?.includes(Number(socketIndex)))?.socketCategoryHash;
      plug.socketCategoryHash=categoryHash;plug.socketCategoryDefinition=get('DestinySocketCategoryDefinition',categoryHash);plug.armourItemTierType=definition.inventory?.tierType;
      plug.componentType=kind==='subclass'?subclassPlugComponent(plug):'';
      plug.semanticRole=kind==='armour'?classifyArmourPlug(plug):kind==='weapon'?classifyWeaponPlug(plug):plug.componentType;
      plug.statFocus=(plug.definition.investmentStats||[]).flatMap(stat=>{const name=get('DestinyStatDefinition',stat.statTypeHash)?.displayProperties?.name;return name?[{name,value:stat.value,conditional:stat.isConditionallyActive===true}]:[];});return plug;
    });
    const groups=new Map();for(const plug of sockets){const label=kind==='subclass'?({super:'Super',classAbility:'Abilities',movementAbility:'Abilities',melee:'Abilities',grenade:'Abilities',aspect:'Aspects',fragment:'Fragments'})[plug.componentType]||'Other sockets':plug.semanticRole==='appearance'?'Cosmetics':plug.statFocus?.length?'Stat focus':['perk','intrinsic'].includes(plug.semanticRole)?'Selected perks':'Mods';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(plug);}
    const bucketPlugs=parameters.modsByBucket?.[bucket]||[];
    const exact=index.byHash.get(saved.hash)||[],selected=closest(exact,definition,profile,saved.socketOverrides,bucketPlugs);
    const alternative=!selected?closest(index.byBucket.get(bucket)||[],definition,profile,saved.socketOverrides,bucketPlugs):null;
    return {...base,itemHash:saved.hash,bucketHash:bucket,kind,equipped:saved.equipped,isExotic:definition.inventory?.tierType===6,sockets,groups:[...groups].map(([label,plugs])=>({label,plugs})),notOwned:!selected,match:selected,alternative,overrides:saved.socketOverrides||{},itemInstanceId:selected?.itemInstanceId||'',source:selected?.source||{}};
  });
  const armour=chooseArmour(items,index,profile,parameters,statConstraints);
  for(const row of items)if(row.equipped&&row.kind==='armour'&&armour.get(row.bucketHash)){row.match=armour.get(row.bucketHash);row.itemInstanceId=row.match.itemInstanceId;row.source=row.match.source;}
  const extraGroups=[];const group=(label,plugs)=>{if(plugs.length)extraGroups.push({label,plugs});};
  group('Mods',(parameters.mods||[]).map(hash=>describe(ITEM,hash)));
  group('Armour perks',(parameters.perks||[]).map(hash=>describe('DestinySandboxPerkDefinition',hash)));
  for(const [hash,mods] of Object.entries(parameters.modsByBucket||{}))group(get('DestinyInventoryBucketDefinition',hash)?.displayProperties?.name||'Slot cosmetics',mods.map(hash=>describe(ITEM,hash)));
  group('Artifact unlocks',(parameters.artifactUnlocks?.unlockedItemHashes||[]).map(hash=>describe(ITEM,hash)));
  group('Set bonuses',Object.entries(parameters.setBonuses||{}).map(([hash,count])=>({...describe('DestinyEquipableItemSetDefinition',hash),description:`${count} pieces requested`})));
  group('Stat targets',statConstraints.map(row=>({...row,description:row.legacy?'Legacy stat target. Not applied.':`${row.minStat??0} to ${row.maxStat??200}`})));
  if(parameters.exoticArmorHash>0)group('Exotic armour',[describe(ITEM,parameters.exoticArmorHash)]);
  group('In-game identifiers',Object.entries(parameters.inGameIdentifiers||{}).flatMap(([key,hash])=>{const type={nameHash:'Name',iconHash:'Icon',colorHash:'Color'}[key];return type?[describe(`DestinyLoadout${type}Definition`,hash)]:[];}));
  if(extraGroups.length)items.push({kind:'parameters',name:'Build settings',icon:'',groups:extraGroups,sockets:[],unresolved:false});
  return {schemaVersion:1,source:{kind:'dim',label:'Imported from DIM'},name:loadout.name,notes:loadout.notes||'',icon:bungieArtwork(get('DestinyLoadoutIconDefinition',parameters.inGameIdentifiers?.iconHash)?.iconImagePath),items,manifestVersion:version,binding:{...binding,index:null},characterClass:['titan','hunter','warlock'][loadout.classType]||'',classType:loadout.classType,parameters,statConstraints,coverage:{requested,resolved:requested,unresolved:[],rate:1},warning:statConstraints.some(row=>row.legacy)?'Legacy stat targets are shown for reference and are not applied.':'',portableLoadout:structuredClone(loadout)};
}
export function dimWorkingBuild(model,profile,{forApply=false}={}){
  const selected=model.items.filter(row=>row.equipped&&['weapon','armour','subclass'].includes(row.kind)).map(row=>{
    const match=row.match;
    if(forApply&&(!match||row.retired))throw new Error(`Choose an item from your inventory for ${row.name} before Apply.`);
    if(!match)return {...row,itemInstanceId:'',source:{},notOwned:true};
    // Preserve the imported display row; a chosen armour replacement uses its
    // own definition and reusable socket indices, never the donor instance ID.
    const sockets=row.sockets.map(plug=>{
      if(match.itemHash===row.itemHash)return plug;
      const entries=profile.itemComponents?.reusablePlugs?.data?.[match.itemInstanceId]?.plugs||{};
      const index=Object.keys(entries).find(key=>entries[key].some(p=>p.plugItemHash===plug.hash&&p.canInsert===true));
      return {...plug,socketIndex:index===undefined?null:Number(index)};
    }).filter(plug=>plug.socketIndex!==null);
    return {...row,definition:match.definition,itemHash:match.itemHash,name:match.definition.displayProperties?.name||row.name,icon:bungieArtwork(match.definition.displayProperties?.icon),itemInstanceId:match.itemInstanceId,source:match.source,sockets};
  });
  const build=loadoutWorkingBuild({...model,items:selected},profile);
  return {...build,source:'dim-import',loadoutSource:'dim-import',selectedLoadoutIndex:null,dimImport:{loadout:model.portableLoadout,manifestVersion:model.manifestVersion},statConstraints:model.statConstraints.filter(row=>!row.legacy).map(({statHash,minStat,maxStat})=>({statHash,minStat,maxStat})),importedParameters:structuredClone(model.parameters)};
}
