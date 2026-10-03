import {resolveDimLoadout,inventoryIndex,dimWorkingBuild} from './resolve.mjs';
import {classifyArmourPlug,classifyWeaponPlug} from '../../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {subclassPlugComponent} from '../../pages/guardian-workspace-v2/guardian-subclass-plug-classifier.mjs';
import {matchDimGuardian} from './guardian.mjs';
import {bungieArtwork,loadoutWorkingBuild} from '../../shared/loadout-details-model.mjs';
import {createBuildState,normalizeBuild} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {ARMOUR_SLOT_NAMES,TITLE_MATCH_LABEL,itemStats,modsBySlot,pickArmour,rankOwnedExotics,titleNamedExotics} from './fill.mjs';
import {placeMods} from './mods.mjs';
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
// The shared mods and per-slot cosmetics written into the chosen armour's own sockets.
function placeChoiceMods(selected,parameters,snapshot,profile){
  const tables=snapshot.tables,armour=selected.filter(row=>row.kind==='armour');
  const {byBucket,unplaced}=placeMods(new Map(armour.map(row=>[row.bucketHash,row])),parameters,tables,profile);
  for(const row of armour){
    const mods=byBucket.get(row.bucketHash)||[],taken=new Set(mods.map(mod=>mod.socketIndex));
    const plugs=mods.map(mod=>{
      const categoryHash=row.definition?.sockets?.socketCategories?.find(entry=>entry.socketIndexes?.includes(mod.socketIndex))?.socketCategoryHash;
      const plug={hash:mod.hash,socketIndex:mod.socketIndex,definition:mod.definition,name:mod.name,description:mod.definition?.displayProperties?.description||'',icon:mod.icon,empty:false,unresolved:!mod.definition,socketCategoryHash:categoryHash,socketCategoryDefinition:tables.DestinySocketCategoryDefinition?.[categoryHash],armourItemTierType:row.definition?.inventory?.tierType,componentType:''};
      plug.semanticRole=classifyArmourPlug(plug);return plug;
    });
    row.sockets=[...row.sockets.filter(plug=>!taken.has(plug.socketIndex)),...plugs].sort((a,b)=>a.socketIndex-b.socketIndex);
  }
  const slot=bucket=>ARMOUR_SLOT_NAMES[bucket]||'';
  return {placed:armour.map(row=>({bucketHash:row.bucketHash,slot:slot(row.bucketHash),item:row.name,mods:(byBucket.get(row.bucketHash)||[]).map(({hash,name,icon,socketIndex,cost})=>({hash,name,icon,socketIndex,cost}))})),unplaced:unplaced.map(({hash,name,icon,reason})=>({hash,name,icon,reason}))};
}
/** Names of the shared plugs an owned item cannot take. */
export function sharedSocketGaps(target,item,profile){
  const {desired,bySocket}=requestedSocketMatches(target,item,profile),matched=new Set(bySocket.values());
  return desired.filter((plug,i)=>!matched.has(i)&&!plug.empty&&plug.semanticRole!=='appearance').map(plug=>plug.name);
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
// choices (Build Fit): the user's decision per slot, Map(bucketHash -> {itemInstanceId|null,status,reasons}).
// With choices the shared mods are also placed on the chosen pieces.
export function adaptDimLoadout(loadout,{snapshot,profile,binding,preferredCharacterId='',currentSeasonNumber=null,choices=null}){
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
    const decided=choices?.get(row.bucketHash);
    if(decided)item=decided.itemInstanceId?(index.byBucket.get(row.bucketHash)||[]).find(candidate=>String(candidate.itemInstanceId)===String(decided.itemInstanceId))||null:null;
    else if(row.kind==='armour')item=armour.get(row.bucketHash);
    else{
      const pool=(index.byBucket.get(row.bucketHash)||[]).filter(candidate=>row.kind==='subclass'||row.isExotic?candidate.itemHash===row.itemHash:candidate.definition.inventory?.tierType!==6);
      const ranked=pool.map(candidate=>({item:candidate,...candidateScore(row,candidate,profile)})).sort((a,b)=>b.score-a.score||stable(a.item,b.item));
      item=ranked[0]?.item||null;
    }
    if(decided)reasons=decided.reasons||[];
    else if(item){reasons=candidateScore(row,item,profile).reasons;}
    const sockets=item?adaptSockets(row,item,profile,snapshot):{sockets:[],gaps:row.sockets.map(p=>p.name)};
    if(!item&&decided?.status==='empty')blockers.push(`${row.name}: left empty by your choice.`);
    else if(!item){blockers.push(`${row.name}: ${row.isExotic?'the original Exotic is missing; its effect cannot be reproduced':'no compatible item in your inventory'}.`);}
    const choice=item?{...row,itemHash:item.itemHash,hash:item.itemHash,name:item.definition.displayProperties?.name||'',icon:bungieArtwork(item.definition.displayProperties?.icon),description:item.definition.displayProperties?.description||'',definition:item.definition,energy:{capacity:profile.itemComponents?.instances?.data?.[item.itemInstanceId]?.energy?.energyCapacity},itemInstanceId:item.itemInstanceId,source:item.source,match:null,alternative:null,notOwned:false,sockets:sockets.sockets,groups:[],isExotic:item.definition.inventory?.tierType===6}:null;
    if(choice)selected.push(choice);
    comparisons.push({kind:row.kind,bucketHash:row.bucketHash,target:{itemHash:row.itemHash,name:row.name,icon:row.icon},selected:choice?{itemHash:choice.itemHash,itemInstanceId:choice.itemInstanceId,name:choice.name,icon:choice.icon}:null,status:decided?.status&&decided.status!=='matched'?decided.status:!item?'missing':item.itemHash===row.itemHash?'matched':'substituted',reasons:reasons.length?reasons:[`Same slot as ${row.name}. It shares no set, requested socket or weapon type with it.`],missingSockets:sockets.gaps});
  }
  const placed=choices?placeChoiceMods(selected,model.parameters,snapshot,profile):null;
  const sharedBuild=fillSharedBuild({portable,model,target,rows,index,profile,snapshot,characterId:guardian.characterId,selected,comparisons});
  const build=loadoutWorkingBuild({...model,items:selected},profile);
  const stats={};let statsAvailable=selected.filter(row=>row.kind==='armour').length===5;
  for(const item of selected.filter(row=>row.kind==='armour')){const data=profile.itemComponents?.stats?.data?.[item.itemInstanceId]?.stats;if(!data)statsAvailable=false;for(const [hash,stat] of Object.entries(data||{}))stats[hash]=(stats[hash]||0)+Number(stat.value||0);}
  const statTargets=model.statConstraints.map(row=>({name:row.name,statHash:row.statHash,min:row.minStat??0,max:row.maxStat??200,current:statsAvailable?stats[row.statHash]??0:null,legacy:row.legacy===true}));
  const sets={};for(const item of selected.filter(row=>row.kind==='armour')){const set=setOf(item.definition);if(set)sets[set]=(sets[set]||0)+1;}
  const setTargets=Object.entries(model.parameters.setBonuses||{}).map(([hash,count])=>({hash:Number(hash),name:snapshot.tables.DestinyEquipableItemSetDefinition?.[hash]?.displayProperties?.name||String(hash),required:count,current:sets[hash]||0}));
  const parameterSteps=model.items.filter(row=>row.kind==='parameters').flatMap(row=>row.groups).filter(group=>!['Stat targets','Set bonuses','Exotic armour','In-game identifiers'].includes(group.label)).map(group=>({label:group.label,items:group.plugs.map(plug=>({name:plug.name,icon:plug.icon,hash:plug.hash,retired:plug.retired===true,availableOn:selected.filter(item=>options(item,profile).hashes.has(plug.hash)).map(item=>item.name)}))}));
  const anchors=rows.filter(row=>row.isExotic).map(row=>({name:row.name,description:row.description,icon:row.icon,kind:row.kind}));
  if(target.subclassBuild.super)anchors.push({name:target.subclassBuild.super.name,description:target.subclassBuild.super.description,icon:target.subclassBuild.super.icon,kind:'super'});
  const report={schemaVersion:1,fit:Boolean(choices),mods:placed,anchors,sourceName:model.name,characterClass:model.characterClass,comparisons,blockers,statTargets,setTargets,parameterSteps,sharedBuild,method:'Weapons prefer matching items and requested sockets, then weapon type and element. Armour prioritises requested sets, current item stat targets, then matching items and sockets. Armour search: up to 32 candidates per slot and 128 retained combinations per step.'};
  const adapted={...build,name:model.name,source:'dim-import',loadoutSource:'dim-import',equipment:target.equipment,dimImport:target.dimImport,importedParameters:structuredClone(model.parameters),statConstraints:target.statConstraints,dimTarget:target,dimAdaptation:report};
  return {model:{...model,autoMatchedGuardian:true},target,build:adapted,report};
}
// The share's own content, plus what Paradox filled from the user's inventory.
// Picks are marked as picks; nothing here is presented as the sharer's item.
function ownedChoice(row,profile,snapshot){
  const definition=row.definition,{sockets}=adaptSockets({kind:'armour',sockets:[]},row,profile,snapshot);
  return {kind:'armour',equipped:true,bucketHash:definition.inventory?.bucketTypeHash,itemHash:row.itemHash,hash:row.itemHash,name:definition.displayProperties?.name||'',icon:bungieArtwork(definition.displayProperties?.icon),description:definition.displayProperties?.description||'',definition,energy:{capacity:profile.itemComponents?.instances?.data?.[row.itemInstanceId]?.energy?.energyCapacity},itemInstanceId:row.itemInstanceId,source:row.source,match:null,alternative:null,notOwned:false,sockets,groups:[],isExotic:definition.inventory?.tierType===6,pickedFromInventory:true};
}
function sharedStats(model,rows,tables){
  const known=rows.length===5&&rows.every(row=>row.stats),totals={};
  for(const row of rows)for(const [hash,value] of Object.entries(row.stats||{}))totals[hash]=(totals[hash]||0)+value;
  const name=hash=>tables.DestinyStatDefinition?.[hash]?.displayProperties?.name||`Stat ${hash}`;
  return {
    targets:model.statConstraints.filter(row=>!row.legacy).map(row=>{const value=totals[row.statHash]||0;return {statHash:row.statHash,name:row.name,min:row.minStat??0,max:row.maxStat??200,reached:known?value:null,met:known?value>=(row.minStat??0)&&value<=(row.maxStat??200):null};}),
    totals:known?Object.entries(totals).map(([hash,value])=>({statHash:Number(hash),name:name(hash),value})):[]
  };
}
function fillSharedBuild({portable,model,target,rows,index,profile,snapshot,characterId,selected,comparisons}){
  const tables=snapshot.tables,parameters=model.parameters||{},sharedArmour=rows.filter(row=>row.kind==='armour');
  const groupOf=label=>model.items.find(row=>row.kind==='parameters')?.groups.find(group=>group.label===label)?.plugs||[];
  const owned=hash=>(index.byHash.get(Number(hash))||[]).length>0;
  const describe=hash=>tables[ITEM]?.[hash]?.displayProperties||{};
  const pinnedHash=parameters.exoticArmorHash>0?Number(parameters.exoticArmorHash):null,sharedExotic=sharedArmour.find(row=>row.isExotic);
  const pinned=pinnedHash?{hash:pinnedHash,name:describe(pinnedHash).name||'',icon:bungieArtwork(describe(pinnedHash).icon),owned:owned(pinnedHash),source:'pinned'}
    :sharedExotic?{hash:sharedExotic.itemHash,name:sharedExotic.name,icon:sharedExotic.icon,owned:owned(sharedExotic.itemHash),source:'share-item'}:null;
  let titleMatches=[],suggestions=[],exoticChoice=null;
  if(!pinned){
    const subclass={name:target.subclassName||'',element:target.subclass,subclassBuild:target.subclassBuild};
    const ranked=rankOwnedExotics({index,profile,tables,subclass,characterId});
    titleMatches=titleNamedExotics(portable,tables).map(match=>{
      const copy=ranked.find(row=>match.hashes.includes(row.hash));
      const definition=tables[ITEM]?.[copy?.hash??match.hashes[0]];
      return {name:match.name,hashes:match.hashes,owned:Boolean(copy),itemInstanceId:copy?.itemInstanceId||'',icon:copy?.icon||bungieArtwork(definition?.displayProperties?.icon),bucketHash:definition?.inventory?.bucketTypeHash,slot:ARMOUR_SLOT_NAMES[definition?.inventory?.bucketTypeHash]||'',location:copy?.location||'Not in your inventory',reasons:copy?.reasons||[],label:TITLE_MATCH_LABEL,row:copy?.row||null};
    });
    const titled=new Set(titleMatches.flatMap(match=>match.hashes));
    suggestions=ranked.filter(row=>!titled.has(row.hash)).slice(0,5).map(row=>({...row,label:'Suggestion'}));
    const first=titleMatches.find(match=>match.owned);
    exoticChoice=first?{bucketHash:first.bucketHash,row:first.row,reason:`Suggested Exotic. ${TITLE_MATCH_LABEL}.`}
      :suggestions[0]?{bucketHash:suggestions[0].bucketHash,row:suggestions[0].row,reason:'Suggested Exotic: ranked first of your Exotic armour for this subclass.'}:null;
  }
  const mods=modsBySlot(parameters.mods,tables);
  const armour=sharedArmour.length?null:pickArmour({index,profile,tables,parameters,constraints:model.statConstraints,exotic:exoticChoice});
  if(armour)for(const pick of armour.picks){
    if(!pick.row){comparisons.push({kind:'armour',bucketHash:pick.bucketHash,target:null,selected:null,status:'unfilled',reasons:pick.reasons,missingSockets:[]});continue;}
    const choice=ownedChoice(pick.row,profile,snapshot);selected.push(choice);
    comparisons.push({kind:'armour',bucketHash:pick.bucketHash,target:null,selected:{itemHash:choice.itemHash,itemInstanceId:choice.itemInstanceId,name:choice.name,icon:choice.icon},status:'picked',reasons:pick.reasons,missingSockets:[]});
  }
  const strip=({row,...rest})=>rest;
  const armourRows=armour
    ?armour.picks.map(pick=>({bucketHash:pick.bucketHash,slot:pick.slot,from:pick.row?'inventory':'none',itemHash:pick.row?Number(pick.row.itemHash):null,itemInstanceId:pick.row?String(pick.row.itemInstanceId):'',name:pick.row?.definition?.displayProperties?.name||'',icon:pick.row?bungieArtwork(pick.row.definition.displayProperties?.icon):'',isExotic:pick.row?.definition?.inventory?.tierType===6,reasons:pick.reasons,stats:pick.stats||null,mods:mods.slots.get(pick.bucketHash)||[]}))
    :sharedArmour.map(row=>{
      const comparison=comparisons.find(entry=>entry.bucketHash===row.bucketHash),chosen=selected.find(entry=>entry.bucketHash===row.bucketHash);
      return {bucketHash:row.bucketHash,slot:ARMOUR_SLOT_NAMES[row.bucketHash],from:'share',status:comparison?.status||'missing',itemHash:row.itemHash,itemInstanceId:chosen?.itemInstanceId||'',name:row.name,icon:row.icon,isExotic:row.isExotic,selectedName:comparison?.selected?.name||'',reasons:comparison?.reasons||[],stats:chosen?itemStats(chosen,profile):null,mods:mods.slots.get(row.bucketHash)||[]};
    });
  const plug=item=>({hash:item.hash,name:item.name,icon:item.icon,description:item.description,retired:item.retired===true});
  const modSlot=hash=>[...mods.slots].find(([,list])=>list.some(mod=>mod.hash===Number(hash)))?.[0]??null;
  const emblem=groupOf('In-game identifiers').map(plug);
  return {
    exotic:{pinned,titleMatches:titleMatches.map(strip),suggestions:suggestions.map(strip)},
    armour:{source:armour?'inventory':'share',rows:armourRows},
    stats:armour?{targets:armour.statTargets,totals:armour.statTotals}:sharedStats(model,armourRows,tables),
    sets:armour?{requested:armour.requestedSets,formed:armour.formedSets}:{requested:Object.entries(parameters.setBonuses||{}).map(([hash,count])=>({hash:Number(hash),name:tables.DestinyEquipableItemSetDefinition?.[hash]?.displayProperties?.name||'',required:Number(count)})),formed:[]},
    mods:{all:(parameters.mods||[]).map(hash=>({hash:Number(hash),name:describe(hash).name||'',icon:bungieArtwork(describe(hash).icon),slot:modSlot(hash),unresolved:!tables[ITEM]?.[hash]})),perks:groupOf('Armour perks').map(plug)},
    artifact:{unlocks:groupOf('Artifact unlocks').map(plug)},
    emblem:emblem.length?emblem:null,
    weapons:{shared:rows.filter(row=>row.kind==='weapon').length}
  };
}
export function createDimForgeState(build){
  const state=createBuildState(build.dimTarget||build);
  return {...state,workingBuild:normalizeBuild(build)};
}
