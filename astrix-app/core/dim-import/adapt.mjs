import {resolveDimLoadout,inventoryIndex,dimWorkingBuild} from './resolve.mjs?v=20260927-adapt-1&grid=20261001-1';
import {classifyArmourPlug,classifyWeaponPlug} from '../../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {subclassPlugComponent} from '../../pages/guardian-workspace-v2/guardian-subclass-plug-classifier.mjs';
import {matchDimGuardian} from './guardian.mjs';
import {bungieArtwork,loadoutWorkingBuild} from '../../shared/loadout-details-model.mjs?v=20260927-loadout-details-1&grid=20261001-1';
import {createBuildState,normalizeBuild} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
const ITEM='DestinyInventoryItemDefinition';
const setOf=d=>d?.equipableItemSetHash||d?.equippingBlock?.equipableItemSetHash;
const equal=(a,b)=>a!==undefined&&a!==null&&b!==undefined&&a===b;
const stable=(a,b)=>String(a.itemInstanceId).localeCompare(String(b.itemInstanceId));
const compactLoadout=loadout=>({name:loadout.name,classType:loadout.classType,equipped:(loadout.equipped||[]).map(({hash,socketOverrides})=>({hash,socketOverrides})),unequipped:(loadout.unequipped||[]).map(({hash,socketOverrides})=>({hash,socketOverrides})),parameters:structuredClone(loadout.parameters||{})});
function options(item,profile){
  const current=profile.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets||[];
  const reusable=profile.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs||{};
  return {current,reusable,hashes:new Set([...current.map(p=>p.plugHash),...Object.values(reusable).flat().filter(p=>p.enabled!==false&&p.canInsert===true).map(p=>p.plugItemHash)])};
}
function requestedSocketMatches(target,item,profile){
  const {current,reusable}=options(item,profile),bySocket=new Map();
  const desired=(target.sockets||[]).filter(plug=>plug.hash&&!plug.retired);
  const indexes=[...new Set([...current.map((_,i)=>i),...Object.keys(reusable).map(Number)])];
  const available=desired.map(plug=>indexes.filter(i=>Number(current[i]?.plugHash)===plug.hash||(reusable[i]||[]).some(p=>Number(p.plugItemHash)===plug.hash&&p.canInsert===true&&p.enabled!==false)).sort((a,b)=>Number(b===plug.socketIndex)-Number(a===plug.socketIndex)||a-b));
  function place(index,visited){
    for(const socket of available[index]){
      if(visited.has(socket))continue;visited.add(socket);
      const prior=bySocket.get(socket);
      if(prior===undefined||place(prior,visited)){bySocket.set(socket,index);return true;}
    }
    return false;
  }
  for(let i=0;i<desired.length;i++)place(i,new Set());
  return {desired,bySocket};
}
function candidateScore(target,item,profile){
  const definition=item.definition,matched=requestedSocketMatches(target,item,profile);
  const perks=target.sockets.filter(p=>!p.empty&&!p.retired&&p.semanticRole!=='appearance');
  const matchedPlugs=new Set([...matched.bySocket.values()].map(i=>matched.desired[i]));
  const hits=perks.filter(p=>matchedPlugs.has(p)).length;
  const same=target.itemHash===item.itemHash,reasons=[];
  if(same)reasons.push('Same item');
  if(hits)reasons.push(`${hits}/${perks.length} requested sockets available`);
  let score=(same?1000:0)+hits*150;
  for(const [key,label,weight] of [['itemSubType','Same weapon type',80],['defaultDamageTypeHash','Same damage element',60]])if(equal(target.definition?.[key],definition?.[key])){score+=weight;if(target.kind==='weapon')reasons.push(label);}
  if(setOf(target.definition)&&setOf(target.definition)===setOf(definition)){score+=300;reasons.push('Same armour set');}
  return {score,reasons};
}
function selectArmour(rows,index,profile,parameters,constraints){
  // Bounded beam search considers complete sets, rather than replacing each
  // slot independently. Keep original Exotics pinned; never invent a substitute
  // for an Exotic effect. Missing anchors remain visible in the comparison.
  let beam=[{items:[],score:0,sets:{},stats:{}}];
  for(const target of rows){
    const pool=(index.byBucket.get(target.bucketHash)||[]).filter(item=>target.isExotic?item.itemHash===target.itemHash:item.definition.inventory?.tierType!==6)
      .map(item=>{const scored=candidateScore(target,item,profile),stats=profile.itemComponents?.stats?.data?.[item.itemInstanceId]?.stats||{};const progress=constraints.filter(c=>!c.legacy).reduce((n,c)=>n+Math.min(Number(stats[c.statHash]?.value||0),c.minStat||0)*1000,0);const setBonus=parameters.setBonuses?.[setOf(item.definition)]?1000000:0;return {item,...scored,poolRank:scored.score+progress+setBonus};}).sort((a,b)=>b.poolRank-a.poolRank||stable(a.item,b.item));
    const candidates=pool.slice(0,32);if(!candidates.length)candidates.push({item:null,score:-100000,reasons:[]});
    const expanded=[];
    for(const state of beam)for(const {item,score} of candidates){
      const sets={...state.sets},stats={...state.stats};const set=item&&setOf(item.definition);if(set)sets[set]=(sets[set]||0)+1;
      if(item)for(const [hash,stat] of Object.entries(profile.itemComponents?.stats?.data?.[item.itemInstanceId]?.stats||{}))stats[hash]=(stats[hash]||0)+Number(stat.value||0);
      const base=state.score+score;
      const setBonus=Object.entries(parameters.setBonuses||{}).reduce((n,[hash,count])=>n+Math.min(sets[hash]||0,count)*1000000,0);
      const statProgress=constraints.filter(c=>!c.legacy).reduce((n,c)=>n+Math.min(stats[c.statHash]||0,c.minStat||0)*1000-Math.max(0,(stats[c.statHash]||0)-(c.maxStat??200))*1000,0);
      expanded.push({items:[...state.items,item],score:base,sets,stats,rank:base+setBonus+statProgress});
    }
    expanded.sort((a,b)=>b.rank-a.rank||a.items.map(i=>i?.itemInstanceId||'').join(',').localeCompare(b.items.map(i=>i?.itemInstanceId||'').join(',')));
    beam=expanded.slice(0,128);
  }
  return new Map(rows.map((row,i)=>[row.bucketHash,beam[0]?.items[i]||null]));
}
function adaptSockets(target,item,profile,snapshot){
  const {current}=options(item,profile),{desired,bySocket}=requestedSocketMatches(target,item,profile);
  const used=new Set(bySocket.keys()),matched=new Set(bySocket.values());
  const gaps=[...desired.filter((plug,i)=>!matched.has(i)),...(target.sockets||[]).filter(plug=>plug.retired)].map(plug=>plug.name);
  const sockets=[...bySocket].map(([socketIndex,i])=>({...desired[i],socketIndex}));
  // A replacement displays its actual roll, including sockets that could not
  // match the share. The mismatch remains explicit in the comparison.
  current.forEach((entry,socketIndex)=>{
    if(used.has(socketIndex))return;const definition=snapshot.tables[ITEM]?.[entry.plugHash];if(!definition)return;
    const plug={hash:entry.plugHash,socketIndex,definition,name:definition.displayProperties?.name||'',description:definition.displayProperties?.description||'',icon:bungieArtwork(definition.displayProperties?.icon),empty:false};
    plug.componentType=target.kind==='subclass'?subclassPlugComponent(plug):'';
    plug.semanticRole=target.kind==='armour'?classifyArmourPlug(plug):target.kind==='weapon'?classifyWeaponPlug(plug):plug.componentType;
    sockets.push(plug);
  });
  return {sockets:sockets.sort((a,b)=>a.socketIndex-b.socketIndex),gaps};
}
export function adaptDimLoadout(loadout,{snapshot,profile,binding,preferredCharacterId='',currentSeasonNumber=null}){
  const guardian=matchDimGuardian(loadout,snapshot,profile,preferredCharacterId);
  const portable=compactLoadout({...loadout,classType:guardian.classType});
  const model=resolveDimLoadout(portable,{snapshot,profile,binding:{...binding,characterId:guardian.characterId},currentSeasonNumber});
  const target=dimWorkingBuild({...model,items:model.items.map(row=>({...row,match:null,itemInstanceId:'',source:{}}))},profile);
  target.dimImport.loadout=portable;
  const index=inventoryIndex(profile,snapshot.tables,guardian.characterId);
  const rows=model.items.filter(row=>row.equipped&&['weapon','armour','subclass'].includes(row.kind));
  if(new Set(rows.map(row=>row.bucketHash)).size!==rows.length)throw new Error('The share contains conflicting items in the same equipment slot.');
  for(const kind of ['weapon','armour'])if(rows.filter(row=>row.kind===kind&&row.isExotic).length>1)throw new Error('The share contains more than one Exotic in the same equipment category.');
  const armour=selectArmour(rows.filter(row=>row.kind==='armour'),index,profile,model.parameters,model.statConstraints);
  const selected=[],comparisons=[],blockers=[];
  // Handle the shared Exotic weapon before other weapon slots.
  const ordered=[...rows].sort((a,b)=>Number(b.kind==='weapon'&&b.isExotic)-Number(a.kind==='weapon'&&a.isExotic));
  for(const row of ordered){
    let item=null,reasons=[];
    if(row.kind==='armour')item=armour.get(row.bucketHash);
    else{
      const pool=(index.byBucket.get(row.bucketHash)||[]).filter(candidate=>row.kind==='subclass'||row.isExotic?candidate.itemHash===row.itemHash:candidate.definition.inventory?.tierType!==6);
      const ranked=pool.map(candidate=>({item:candidate,...candidateScore(row,candidate,profile)})).sort((a,b)=>b.score-a.score||stable(a.item,b.item));
      item=ranked[0]?.item||null;
    }
    if(item){reasons=candidateScore(row,item,profile).reasons;}
    const sockets=item?adaptSockets(row,item,profile,snapshot):{sockets:[],gaps:row.sockets.map(p=>p.name)};
    if(!item){blockers.push(`${row.name}: ${row.isExotic?'the original Exotic is missing; its effect cannot be reproduced':'no compatible item in your inventory'}.`);}
    const choice=item?{...row,itemHash:item.itemHash,hash:item.itemHash,name:item.definition.displayProperties?.name||'',icon:bungieArtwork(item.definition.displayProperties?.icon),description:item.definition.displayProperties?.description||'',definition:item.definition,energy:{capacity:profile.itemComponents?.instances?.data?.[item.itemInstanceId]?.energy?.energyCapacity},itemInstanceId:item.itemInstanceId,source:item.source,match:null,alternative:null,notOwned:false,sockets:sockets.sockets,groups:[],isExotic:item.definition.inventory?.tierType===6}:null;
    if(choice)selected.push(choice);
    comparisons.push({kind:row.kind,bucketHash:row.bucketHash,target:{itemHash:row.itemHash,name:row.name,icon:row.icon},selected:choice?{itemHash:choice.itemHash,itemInstanceId:choice.itemInstanceId,name:choice.name,icon:choice.icon}:null,status:!item?'missing':item.itemHash===row.itemHash?'matched':'substituted',reasons:reasons.length?reasons:['Compatible equipment slot'],missingSockets:sockets.gaps});
  }
  const build=loadoutWorkingBuild({...model,items:selected},profile);
  const stats={};let statsAvailable=selected.filter(row=>row.kind==='armour').length===5;
  for(const item of selected.filter(row=>row.kind==='armour')){const data=profile.itemComponents?.stats?.data?.[item.itemInstanceId]?.stats;if(!data)statsAvailable=false;for(const [hash,stat] of Object.entries(data||{}))stats[hash]=(stats[hash]||0)+Number(stat.value||0);}
  const statTargets=model.statConstraints.map(row=>({name:row.name,statHash:row.statHash,min:row.minStat??0,max:row.maxStat??200,current:statsAvailable?stats[row.statHash]??0:null,legacy:row.legacy===true}));
  const sets={};for(const item of selected.filter(row=>row.kind==='armour')){const set=setOf(item.definition);if(set)sets[set]=(sets[set]||0)+1;}
  const setTargets=Object.entries(model.parameters.setBonuses||{}).map(([hash,count])=>({hash:Number(hash),name:snapshot.tables.DestinyEquipableItemSetDefinition?.[hash]?.displayProperties?.name||String(hash),required:count,current:sets[hash]||0}));
  const parameterSteps=model.items.filter(row=>row.kind==='parameters').flatMap(row=>row.groups).filter(group=>!['Stat targets','Set bonuses','Exotic armour','In-game identifiers'].includes(group.label)).map(group=>({label:group.label,items:group.plugs.map(plug=>({name:plug.name,icon:plug.icon,hash:plug.hash,retired:plug.retired===true,availableOn:selected.filter(item=>options(item,profile).hashes.has(plug.hash)).map(item=>item.name)}))}));
  const anchors=rows.filter(row=>row.isExotic).map(row=>({name:row.name,description:row.description,icon:row.icon,kind:row.kind}));
  if(target.subclassBuild.super)anchors.push({name:target.subclassBuild.super.name,description:target.subclassBuild.super.description,icon:target.subclassBuild.super.icon,kind:'super'});
  const report={schemaVersion:1,anchors,sourceName:model.name,characterClass:model.characterClass,comparisons,blockers,statTargets,setTargets,parameterSteps,method:'Weapons prefer matching items and requested sockets, then weapon type and element. Armour prioritises requested sets, current item stat targets, then matching items and sockets. Armour search: up to 32 candidates per slot and 128 retained combinations per step.'};
  const adapted={...build,name:model.name,source:'dim-import',loadoutSource:'dim-import',equipment:target.equipment,dimImport:target.dimImport,importedParameters:structuredClone(model.parameters),statConstraints:target.statConstraints,dimTarget:target,dimAdaptation:report};
  return {model:{...model,autoMatchedGuardian:true},target,build:adapted,report};
}
export function createDimForgeState(build){
  const state=createBuildState(build.dimTarget||build);
  return {...state,workingBuild:normalizeBuild(build)};
}
