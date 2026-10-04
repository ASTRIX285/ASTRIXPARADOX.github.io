// ASTRIX PARADOX Armoury editor: a visual loadout editor for one saved build.
// Behaviour follows DIM's editor (click a slot or socket, pick from what you own);
// the look is ours. Pure state and markup: the Armoury page owns the dialog and
// routes clicks here, so this module never touches the DOM and is unit testable.
// Every choice goes through the existing staging helpers, so the same rules apply
// here as in Build Forge. Nothing is equipped until the user presses APPLY.
import {eligibleEquipment,filterManualEquipmentSources,socketGroups,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice,recordManualEdit} from '../guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import {toggleIntendedArtifactPerk} from '../guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {subclassCompatibilityViolations} from '../guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {itemTileMarkup} from '../../shared/guardian-inventory-workspace.mjs';
import {paradoxItemCardMarkup} from '../guardian-workspace-v2/paradox-item-hover.mjs';

export const EMPTY_PLUG_HASH=2166136261;
const HISTORY_LIMIT=100;
const WEAPON_SLOTS=['KINETIC','ENERGY','POWER'];
const ARMOUR_SLOTS=['HELMET','ARMS','CHEST','LEGS','CLASS ITEM'];
const SUBCLASS_GROUPS=[['super','SUPER','superOptions'],['abilities','ABILITIES','abilityOptionsBySocket'],['aspects','ASPECTS','aspectOptionsBySocket'],['fragments','FRAGMENTS','fragmentOptionsBySocket']];
const ABILITY_KEYS=Object.freeze([['classAbility','Class ability'],['movement','Jump'],['melee','Melee'],['grenade','Grenade']]);

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const hashOf=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
const itemId=item=>String(item?.itemInstanceId||item?.instanceId||'');
const nameOf=item=>String(item?.name||item?.displayProperties?.name||item?.definition?.displayProperties?.name||'');
const isExotic=item=>item?.isExotic===true||String(item?.tier||item?.rarity||'').toLowerCase().includes('exotic');
const isEmptyPlug=plug=>plug==null||hashOf(plug)===EMPTY_PLUG_HASH||/^Empty (?:Mod|Fragment|Aspect|Ability)? ?Socket$/i.test(nameOf(plug).trim());
function iconOf(item){
  const value=item?.icon||item?.displayProperties?.icon||item?.definition?.displayProperties?.icon||'';
  if(typeof value!=='string'||!value)return '';
  if(value.startsWith('/')&&!value.startsWith('//'))return `https://www.bungie.net${value}`;
  try{const url=new URL(value);return url.protocol==='https:'||url.origin===globalThis.location?.origin?url.href:'';}catch{return '';}
}
/** Energy cost from Bungie plug data. null means the cost is not known, never zero. */
export function energyCostOf(plug){
  const raw=plug?.energyCost??plug?.definition?.plug?.energyCost?.energyCost??plug?.definition?.plug?.energyCost;
  const value=Number(typeof raw==='object'&&raw?raw.energyCost:raw);
  return Number.isFinite(value)&&value>=0?value:null;
}

// A plug tile: Bungie art untouched, an honest empty tile for empty sockets.
function plugTile(plug,{label='',empty='Empty socket',locked=false,selected=false,attrs='',note='',badge=''}={}){
  const blank=isEmptyPlug(plug),icon=blank?'':iconOf(plug),name=blank?empty:nameOf(plug)||'Unresolved plug';
  const title=[label,name,note].filter(Boolean).join(': ');
  return `<button type="button" class="ae-tile ae-plug ae-tip${blank?' is-empty':''}${locked?' is-locked':''}${selected?' is-selected':''}" data-name="${esc(name)}"${attrs.includes('data-ed-preview')?'':` title="${esc(title)}"`} aria-label="${esc(title)}"${locked?' disabled':''} ${attrs}>${icon?`<img src="${esc(icon)}" alt="" loading="lazy" decoding="async">`:'<span class="ae-empty-mark" aria-hidden="true">◇</span>'}${badge!==''?`<small>${esc(badge)}</small>`:''}</button>`;
}
function gearTile(item,kind,{label,attrs=''}={}){
  const tile=!item?`<button type="button" class="ae-tile ae-gear is-empty" ${attrs} aria-label="${esc(`${label}: empty slot, choose an item`)}"><span class="ae-empty-mark" aria-hidden="true">+</span></button>`
    :`<button type="button" class="ae-tile ae-gear${isExotic(item)?' is-exotic':''}" ${attrs} title="${esc(nameOf(item))}" aria-label="${esc(`${label}: ${nameOf(item)}. Choose another`)}">${itemTileMarkup({...item,source:{...item.source}},{kind})||`<span class="ae-art">${iconOf(item)?`<img src="${esc(iconOf(item))}" alt="">`:''}</span>`}</button>`;
  return `<div class="ae-slot">${tile}<span class="ae-slot-label" aria-hidden="true">${esc(label)}</span></div>`;
}

/** Live armour stat totals from the selected pieces' own Bungie stat values. */
export function armourStatTotals(armour=[]){
  const pieces=(armour||[]).filter(Boolean),totals=new Map(),missing=[];let complete=pieces.length===5;
  for(const piece of pieces){
    const stats=Array.isArray(piece.stats)?piece.stats:[];
    if(!stats.length){complete=false;missing.push(nameOf(piece)||'Unnamed piece');}
    for(const stat of stats){
      const hash=Number(stat?.hash),value=Number(stat?.value);
      if(!Number.isInteger(hash)||!Number.isFinite(value))continue;
      const row=totals.get(hash)||{hash,name:String(stat.name||''),icon:iconOf(stat),value:0};
      row.value+=value;totals.set(hash,row);
    }
  }
  return {complete,stats:[...totals.values()],missing};
}

/** Each armour piece's mod sockets, energy and anything that no longer fits. */
export function modPlacement(armour=[],carried=[]){
  const pieces=ARMOUR_SLOTS.map((label,index)=>{
    const item=armour?.[index]||null;
    if(!item)return {index,label,item:null,sockets:[],capacity:null,used:0,over:false};
    const groups=socketGroups(item,'armour'),capacity=Number.isFinite(Number(item.energy?.capacity))?Number(item.energy.capacity):null;
    let used=0,unknownCost=false;
    const sockets=groups.map((group,position)=>{
      const plug=isEmptyPlug(group.current)?null:group.current,cost=plug?energyCostOf(plug):0;
      if(cost===null)unknownCost=true;else used+=cost;
      return {...group,position:position+1,total:groups.length,plug,cost};
    });
    return {index,label,item,sockets,capacity,used,unknownCost,over:capacity!==null&&used>capacity};
  });
  const unassigned=[];
  for(const piece of pieces){
    if(!piece.over)continue;
    // Keep mods in socket order until the piece's energy runs out; the rest do not fit.
    let running=0;
    for(const socket of piece.sockets){
      if(!socket.plug)continue;
      running+=socket.cost||0;
      if(running>piece.capacity)unassigned.push({mod:socket.plug,piece:piece.label,reason:`Needs ${socket.cost} energy. ${piece.label} has ${piece.capacity} energy and ${piece.used} is staged.`});
    }
  }
  for(const row of carried||[])unassigned.push(row);
  return {pieces,unassigned};
}

/** Fragment sockets the selected Aspects open, from Bungie Aspect data. null when unknown. */
export function aspectFragmentSlots(plug){
  const value=plug?.fragmentSlots??plug?.definition?.plug?.energyCapacity?.capacityValue??plug?.plug?.energyCapacity?.capacityValue??plug?.energyCapacity?.capacityValue;
  return value===undefined||value===null||!Number.isFinite(Number(value))?null:Math.max(0,Number(value));
}
export function fragmentSlotLimit(subclassBuild={},resolve=plug=>plug){
  const aspects=(subclassBuild?.aspects||[]).map(plug=>resolve(plug)).filter(plug=>!isEmptyPlug(plug));
  if(!aspects.length)return 0;
  const slots=aspects.map(aspectFragmentSlots);
  return slots.every(value=>value!==null)?slots.reduce((sum,value)=>sum+value,0):null;
}

export function createArmouryEditor({record,catalogue=[],subclasses=[],artifact=null,artifacts=[]}={}){
  const state={record:clone(record),carried:[],history:[],future:[],picker:null,query:'',view:'build',notice:'',error:''};
  if(!state.record.build)state.record.build={};
  const build=()=>state.record.build;
  const snapshot=()=>({build:clone(state.record.build),carried:clone(state.carried)});
  function mutate(change){
    const before=snapshot();
    try{change(build());state.history.push(before);if(state.history.length>HISTORY_LIMIT)state.history.shift();state.future=[];state.error='';return true;}
    catch(error){state.record.build=before.build;state.carried=before.carried;state.error=error?.message||String(error);return false;}
  }
  const restore=value=>{state.record.build=value.build;state.carried=value.carried;};

  function clearSlot(kind,index,reason){
    const key=kind==='weapon'?'weapons':'armour',before=build()[key]?.[index]||null;
    build()[key]=[...(build()[key]||[])];build()[key][index]=null;
    build().manualSocketChanges=(build().manualSocketChanges||[]).filter(change=>String(change.itemInstanceId)!==itemId(before));
    recordManualEdit(build(),{component:kind,slotIndex:index,beforeItemInstanceId:itemId(before)||null,afterItemInstanceId:null,reason});
  }
  function swapEquipment(kind,index,item){
    return mutate(current=>{
      const key=kind==='weapon'?'weapons':'armour',collection=current[key]||[];
      const previous=collection[index]||null;
      // Destiny allows one Exotic per collection: the picked Exotic replaces the other one.
      if(isExotic(item))collection.forEach((other,at)=>{if(at!==index&&isExotic(other))clearSlot(kind,at,'replaced-by-exotic');});
      stageEquipmentChoice(current,kind,index,item);
      if(kind==='armour'&&previous)carryMods(current,index,previous);
    });
  }
  // A swapped armour piece keeps the previous piece's mods where its sockets accept them.
  function carryMods(current,index,previous){
    const label=ARMOUR_SLOTS[index],mods=[...(previous.generalMods||previous.armourSemantics?.generalMods||[]),...(previous.slotMods||previous.armourSemantics?.slotMods||[])].filter(plug=>!isEmptyPlug(plug));
    for(const mod of mods){
      const group=socketGroups(current.armour[index],'armour').find(row=>row.options.some(option=>hashOf(option)===hashOf(mod))&&(isEmptyPlug(row.current)||hashOf(row.current)===hashOf(mod)));
      if(group){stageSocketChoice(current,'armour',index,group.socketIndex,group.options.find(option=>hashOf(option)===hashOf(mod)));continue;}
      state.carried.push({mod:clone(mod),piece:label,reason:`${nameOf(current.armour[index])} has no free socket that accepts ${nameOf(mod)||'this mod'}.`});
    }
  }
  function setMod(index,socketIndex,option){
    return mutate(current=>{
      const item=current.armour?.[index];
      const placement=modPlacement(current.armour).pieces[index],socket=placement.sockets.find(row=>row.socketIndex===socketIndex);
      const cost=energyCostOf(option),freed=socket?.cost||0;
      if(placement.capacity!==null&&cost!==null&&placement.used-freed+cost>placement.capacity)throw new Error(`${nameOf(option)} needs ${cost} energy. ${nameOf(item)} has ${placement.capacity-(placement.used-freed)} energy free.`);
      stageSocketChoice(current,'armour',index,socketIndex,option);
    });
  }
  function freshSubclass(){return subclasses.find(item=>item&&itemId(item)===String(build().subclassItemInstanceId))?.subclassBuild||{};}
  function resolvePlug(plug){
    if(!plug||nameOf(plug)&&(plug.definition||plug.fragmentSlots!==undefined))return plug;
    const fresh=freshSubclass(),pool=[...(fresh.superOptions||[]),...Object.values(fresh.abilityOptionsBySocket||{}).flat(),...Object.values(fresh.aspectOptionsBySocket||{}).flat(),...Object.values(fresh.fragmentOptionsBySocket||{}).flat(),...(fresh.availableAspects||[]),...(fresh.availableFragments||[])];
    const match=pool.find(row=>hashOf(row)===hashOf(plug));
    return match?{...match,...plug,name:nameOf(plug)||nameOf(match),definition:plug.definition||match.definition}:plug;
  }
  // Ability sockets: the four ability rows, each with its own socket number from Bungie's options.
  function abilitySockets(){
    const fresh=freshSubclass(),sb=build().subclassBuild||{},current=sb.abilities||[];
    return ABILITY_KEYS.map(([key,label])=>{
      const options=fresh.abilityOptionsBySocket?.[key]||[],typed=current.find(row=>row?.componentType===(key==='movement'?'movementAbility':key));
      const socketIndex=Number(options.find(row=>Number.isInteger(Number(row?.socketIndex)))?.socketIndex??typed?.socketIndex);
      const plug=current.find(row=>Number(row?.socketIndex)===socketIndex)||typed||null;
      return {key,label,socketIndex:Number.isInteger(socketIndex)?socketIndex:null,plug,options};
    });
  }
  // Duplicate and limit checks never count an empty socket as a selection.
  function compatibilityView(current){
    const sb=current.subclassBuild||{},clean=rows=>(rows||[]).map(resolvePlug).filter(plug=>plug&&!isEmptyPlug(plug)).map(plug=>({...plug,fragmentSlots:aspectFragmentSlots(plug)??plug.fragmentSlots}));
    return {...current,subclassBuild:{...sb,aspects:clean(sb.aspects),fragments:clean(sb.fragments)}};
  }
  function setSubclass(option){
    return mutate(current=>{
      const oldId=current.subclassItemInstanceId;
      current.subclassItem=clone(option);current.subclassItemInstanceId=itemId(option);current.subclass=option.element||option.subclass;current.subclassName=option.name;current.subclassIcon=option.icon;current.subclassBuild=clone(option.subclassBuild||{});
      current.manualSocketChanges=(current.manualSocketChanges||[]).filter(change=>String(change.itemInstanceId)!==String(oldId));
      recordManualEdit(current,{component:'subclass',beforeItemInstanceId:oldId,afterItemInstanceId:itemId(option)});
      for(const key of ['super','abilities','aspects','fragments'])current[key]=clone(current.subclassBuild?.[key]??null);
    });
  }
  function setSubclassSocket(key,socketIndex,option){
    return mutate(current=>{
      const sb=current.subclassBuild=current.subclassBuild||{};
      const prior=key==='super'?sb.super:(sb[key]||[]).find(item=>Number(item?.socketIndex)===socketIndex);
      if(key==='fragments'&&!isEmptyPlug(option)&&(sb.fragments||[]).some(item=>hashOf(item)===hashOf(option)&&Number(item?.socketIndex)!==socketIndex))throw new Error(`${nameOf(option)} is already in another Fragment socket.`);
      if(key==='aspects'&&(sb.aspects||[]).some(item=>hashOf(item)===hashOf(option)&&Number(item?.socketIndex)!==socketIndex))throw new Error(`${nameOf(option)} is already in the other Aspect socket.`);
      stageSubclassSocketChoice(current,prior,{...option,socketIndex},key);
      if(key==='super')sb.super=clone({...option,socketIndex});
      else{const rows=[...(sb[key]||[])],at=rows.findIndex(item=>Number(item?.socketIndex)===socketIndex);if(at>=0)rows[at]=clone({...option,socketIndex});else rows.push(clone({...option,socketIndex}));sb[key]=rows;}
      recordManualEdit(current,{component:`subclass-${key}`,beforePlugHash:hashOf(prior)||null,afterPlugHash:hashOf(option)});
      for(const name of ['super','abilities','aspects','fragments'])current[name]=clone(sb[name]??null);
    });
  }
  const ownedArtifacts=()=>{const rows=[...(artifacts||[]),artifact].filter(row=>row&&Array.isArray(row.perks)&&row.perks.length);return rows.filter((row,index)=>rows.findIndex(other=>hashOf(other)===hashOf(row))===index);};
  const chosenArtifactHash=()=>{const config=build().artifactConfiguration||{};if(Number.isInteger(Number(config.artifactHash))&&Number(config.artifactHash)>0)return Number(config.artifactHash);return (config.selectedPerkHashes||[]).length&&artifact?hashOf(artifact):null;};
  const artifactData=()=>{const hash=chosenArtifactHash();return hash===null?null:ownedArtifacts().find(row=>hashOf(row)===hash)||null;};
  function setArtifact(option){
    return mutate(current=>{
      const same=Number(current.artifactConfiguration?.artifactHash)===hashOf(option);
      current.artifactConfiguration={...(current.artifactConfiguration||{}),artifactHash:hashOf(option),selectedPerkHashes:same?[...(current.artifactConfiguration?.selectedPerkHashes||[])]:[]};
      recordManualEdit(current,{component:'artifact',afterPlugHash:hashOf(option)});
    });
  }
  const selectedPerks=()=>new Set((build().artifactConfiguration?.selectedPerkHashes||[]).map(Number));
  function toggleArtifact(index){
    return mutate(current=>{
      const data=artifactData();if(!data)throw new Error('Artifact perks are unavailable for this build.');
      const perk=data.perks[index];if(!perk||perk.tierUnlocked===false||perk.isVisible===false)throw new Error('Only unlocked Artifact perks can be chosen.');
      const limit=Number(data.selectionLimit),chosen=selectedPerks();
      const next=toggleIntendedArtifactPerk(data,current.artifactConfiguration,index);
      if(Number.isFinite(limit)&&limit>0&&next.selectedPerkHashes.length>limit)throw new Error(`The Artifact allows ${limit} perks. Remove one first.`);
      if(!chosen.has(hashOf(perk))&&next.selectedPerkHashes.length===chosen.size&&!next.selectedPerkHashes.includes(hashOf(perk)))throw new Error('That Artifact column is full. Remove a perk from it first.');
      current.artifactConfiguration={...next,artifactHash:hashOf(data)};
      recordManualEdit(current,{component:'artifact',afterPlugHash:hashOf(perk)});
    });
  }

  // Picker options for the open picker, with the reason any choice is blocked.
  function pickerOptions(){
    const picker=state.picker;if(!picker)return [];
    const query=state.query.trim().toLowerCase(),matches=item=>!query||`${nameOf(item)} ${item?.itemTypeDisplayName||''}`.toLowerCase().includes(query);
    if(picker.type==='weapon'||picker.type==='armour'){
      const key=picker.type==='weapon'?'weapons':'armour',current=build()[key]||[];
      // Owned only: this Guardian's equipped or carried items, plus the Vault.
      return filterManualEquipmentSources(eligibleEquipment(catalogue,build(),picker.type,picker.index),build().characterId).filter(matches).map(item=>{
        const other=isExotic(item)?current.find((row,at)=>at!==picker.index&&isExotic(row)):null;
        return {item,selected:itemId(item)===itemId(current[picker.index]),note:other?`Replaces ${nameOf(other)} as your Exotic`:''};
      });
    }
    if(picker.type==='mod'){
      const placement=modPlacement(build().armour).pieces[picker.index],socket=placement.sockets.find(row=>row.socketIndex===picker.socketIndex);
      if(!socket)return [];
      const freed=socket.cost||0;
      return socket.options.filter(matches).map(option=>{
        const cost=energyCostOf(option),over=placement.capacity!==null&&cost!==null&&placement.used-freed+cost>placement.capacity;
        return {item:option,cost,selected:hashOf(option)===hashOf(socket.current),blocked:over?`Needs ${cost} energy, ${placement.capacity-(placement.used-freed)} free`:''};
      });
    }
    if(picker.type==='subclass')return subclasses.filter(Boolean).filter(matches).map(item=>({item,selected:itemId(item)===String(build().subclassItemInstanceId)}));
    if(picker.type==='subclass-socket'){
      const [,,optionsKey]=SUBCLASS_GROUPS.find(([key])=>key===picker.key),fresh=freshSubclass();
      const rows=picker.key==='super'?fresh.superOptions||[]
        :picker.key==='abilities'?abilitySockets().find(socket=>socket.socketIndex===picker.socketIndex)?.options||[]
        :fresh[optionsKey]?.[String(picker.socketIndex)]||[];
      const current=picker.key==='super'?build().subclassBuild?.super:(build().subclassBuild?.[picker.key]||[]).find(item=>Number(item?.socketIndex)===picker.socketIndex);
      // The equipped plug is insertable by definition; Bungie only flags reusable options.
      return rows.filter(row=>row&&row.canInsert!==false).filter(matches).map(item=>({item:{...item,socketIndex:Number.isInteger(Number(item.socketIndex))?Number(item.socketIndex):picker.socketIndex},selected:hashOf(item)===hashOf(current)}))
        .sort((a,b)=>Number(isEmptyPlug(b.item))-Number(isEmptyPlug(a.item)));
    }
    if(picker.type==='artifact')return ownedArtifacts().filter(matches).map(item=>({item,selected:hashOf(item)===chosenArtifactHash()}));
    return [];
  }
  function pick(position){
    const picker=state.picker,option=pickerOptions()[Number(position)];
    if(!picker||!option)return false;
    if(option.blocked){state.error=option.blocked;return false;}
    const done=picker.type==='weapon'||picker.type==='armour'?swapEquipment(picker.type,picker.index,option.item)
      :picker.type==='mod'?setMod(picker.index,picker.socketIndex,option.item)
      :picker.type==='subclass'?setSubclass(option.item)
      :picker.type==='artifact'?setArtifact(option.item)
      :setSubclassSocket(picker.key,picker.socketIndex,option.item);
    if(done){state.picker=null;state.query='';}
    return done;
  }

  function open(target){
    const [type,a,b]=String(target).split(':');
    state.error='';state.query='';
    if(type==='weapon'||type==='armour')state.picker={type,index:Number(a)};
    else if(type==='mod')state.picker={type,index:Number(a),socketIndex:Number(b)};
    else if(type==='subclass')state.picker={type};
    else if(type==='artifact')state.picker={type};
    else if(type==='subclass-socket')state.picker={type,key:a,socketIndex:Number(b)};
    else return false;
    return true;
  }
  function undo(){if(!state.history.length)return false;state.future.push(snapshot());restore(state.history.pop());state.error='';return true;}
  function redo(){if(!state.future.length)return false;state.history.push(snapshot());restore(state.future.pop());state.error='';return true;}

  // ---------- Markup ----------
  function pickerTitle(){
    const picker=state.picker;
    if(picker.type==='weapon')return `${WEAPON_SLOTS[picker.index]} WEAPON`;
    if(picker.type==='armour')return ARMOUR_SLOTS[picker.index];
    if(picker.type==='mod'){const socket=modPlacement(build().armour).pieces[picker.index].sockets.find(row=>row.socketIndex===picker.socketIndex);return `${ARMOUR_SLOTS[picker.index]} ARMOUR MOD (${socket?.position||'?'}/${socket?.total||'?'})`;}
    if(picker.type==='subclass')return 'SUBCLASS';
    if(picker.type==='artifact')return 'CHOOSE ARTIFACT';
    return SUBCLASS_GROUPS.find(([key])=>key===picker.key)?.[1]||'SUBCLASS';
  }
  function pickerMarkup(){
    if(!state.picker)return '';
    const options=pickerOptions(),gear=state.picker.type==='weapon'||state.picker.type==='armour';
    const energy=state.picker.type==='mod'?(()=>{const piece=modPlacement(build().armour).pieces[state.picker.index];return piece.capacity===null?'<p class="ae-picker-note">Energy capacity unavailable for this piece.</p>':`<p class="ae-picker-note">${esc(nameOf(piece.item))}: ${piece.used}/${piece.capacity} energy staged.</p>`;})():'';
    const preview=Number.isInteger(state.picker.preview)?options[state.picker.preview]:null;
    if(preview)return previewMarkup(preview,state.picker.preview,gear,energy);
    const list=options.map((option,position)=>gear
      ?`<li><button type="button" class="ae-tile ae-choice ae-tip${option.selected?' is-selected':''}" data-ed-preview="${position}" data-name="${esc(nameOf(option.item))}" aria-label="${esc(nameOf(option.item))}">${itemTileMarkup({...option.item,source:{...option.item.source}},{kind:state.picker.type})}</button></li>`
      :`<li>${plugTile(option.item,{selected:option.selected,attrs:`data-ed-preview="${position}"`,note:option.blocked,badge:state.picker.type==='mod'&&option.cost!==null?option.cost:''})}</li>`).join('');
    return `<div class="ae-backdrop" data-ed="close-picker" aria-hidden="true"></div><section class="ae-picker" role="dialog" aria-modal="true" aria-labelledby="aePickerTitle"><header class="ae-picker-head"><h3 id="aePickerTitle">${esc(pickerTitle())}</h3><button type="button" class="ae-picker-close" data-ed="close-picker" aria-label="Close picker">CLOSE</button></header><label class="ae-search"><span>Search</span><input type="search" data-ed-search value="${esc(state.query)}" placeholder="Search by name" autocomplete="off"></label>${energy}${state.error?`<p class="ae-error" role="alert">${esc(state.error)}</p>`:''}<ul class="ae-choices ae-icon-grid${gear?' is-gear':''}">${list||`<li class="ae-none">${state.query?'Nothing matches that search.':gear?'You own nothing else for this slot on this Guardian or in the Vault.':'Bungie offers no insertable options for this socket.'}</li>`}</ul></section>`;
  }
  // The card for one option: the existing item info card for gear, a plug card otherwise.
  // The one-Exotic note sits above Select. Select sets the slot and closes the picker.
  function previewMarkup(option,position,gear,energy){
    const item=option.item,kind=state.picker.type;
    const card=gear?paradoxItemCardMarkup({...item,source:{...item.source}},kind,{presentation:'inspect'})
      :`<div class="ae-plug-card">${iconOf(item)&&!isEmptyPlug(item)?`<img src="${esc(iconOf(item))}" alt="" width="64" height="64">`:'<span class="ae-empty-mark" aria-hidden="true">◇</span>'}<div><h4>${esc(isEmptyPlug(item)?'Empty socket':nameOf(item)||'Unresolved plug')}</h4>${item?.itemTypeDisplayName||item?.definition?.itemTypeDisplayName?`<p class="ae-plug-type">${esc(item.itemTypeDisplayName||item.definition.itemTypeDisplayName)}</p>`:''}${item?.description||item?.definition?.displayProperties?.description?`<p>${esc(item.description||item.definition.displayProperties.description)}</p>`:''}${kind==='mod'?`<p class="ae-plug-type">${option.cost===null?'Energy cost unavailable':`${option.cost} energy`}</p>`:''}</div></div>`;
    const note=option.note?`<p class="ae-card-note">${esc(option.note)}</p>`:'';
    const blocked=option.blocked?`<p class="ae-error" role="alert">${esc(option.blocked)}</p>`:'';
    return `<div class="ae-backdrop" data-ed="close-picker" aria-hidden="true"></div><section class="ae-picker is-card" role="dialog" aria-modal="true" aria-labelledby="aePickerTitle"><header class="ae-picker-head"><h3 id="aePickerTitle">${esc(pickerTitle())}</h3><button type="button" class="ae-picker-close" data-ed="close-picker" aria-label="Close picker">CLOSE</button></header>${energy}<div class="ae-card">${card}${note}${blocked}${state.error?`<p class="ae-error" role="alert">${esc(state.error)}</p>`:''}<div class="ae-card-actions"><button type="button" data-ed="preview-back">BACK</button><button type="button" class="is-primary" data-ed-pick="${position}"${option.blocked?' disabled':''}>SELECT</button></div></div></section>`;
  }
  function subclassPanel(){
    const current=build(),sb=current.subclassBuild||{},fresh=freshSubclass(),limit=fragmentSlotLimit(sb,resolvePlug);
    const subclassTile=`<button type="button" class="ae-tile ae-subclass" data-ed="open" data-ed-target="subclass" title="${esc(current.subclassName||'Subclass')}" aria-label="${esc(`Subclass: ${current.subclassName||'not saved'}. Choose another`)}">${iconOf(current.subclassItem)||current.subclassIcon?`<img src="${esc(iconOf(current.subclassItem)||iconOf({icon:current.subclassIcon}))}" alt="">`:'<span class="ae-empty-mark" aria-hidden="true">◆</span>'}</button>`;
    const groups=SUBCLASS_GROUPS.map(([key,label,optionsKey])=>{
      const sockets=key==='super'?[{socketIndex:Number(sb.super?.socketIndex??fresh.superOptions?.[0]?.socketIndex),plug:sb.super}]
        :key==='abilities'?abilitySockets().map(socket=>({socketIndex:socket.socketIndex,plug:socket.plug,label:socket.label}))
        :[...new Set([...Object.keys(fresh[optionsKey]||{}).map(Number),...(sb[key]||[]).map(row=>Number(row?.socketIndex)).filter(Number.isInteger)])].sort((a,b)=>a-b).map(socketIndex=>({socketIndex,plug:(sb[key]||[]).find(row=>Number(row?.socketIndex)===socketIndex)||null}));
      const tiles=sockets.map((socket,position)=>{
        const locked=key==='fragments'&&limit!==null&&position>=limit;
        return plugTile(resolvePlug(socket.plug),{label:socket.label||label,empty:`Empty ${label.toLowerCase().replace(/s$/,'')} socket`,locked,note:locked?'Locked. Needs an Aspect with more Fragment slots':'',attrs:Number.isInteger(socket.socketIndex)?`data-ed="open" data-ed-target="subclass-socket:${key}:${socket.socketIndex}"`:''});
      }).join('');
      const count=key==='fragments'?`<span class="ae-count">${(sb.fragments||[]).map(resolvePlug).filter(plug=>plug&&!isEmptyPlug(plug)).length}/${limit===null?'slots unknown':limit}</span>`:'';
      return `<div class="ae-subgroup"><h4>${label}${count}</h4><div class="ae-tiles">${tiles||'<p class="ae-none">Not saved</p>'}</div></div>`;
    }).join('');
    const issues=subclassCompatibilityViolations(compatibilityView(current));
    return `<section class="ae-panel ae-panel-subclass" aria-labelledby="aeSubclass"><h3 id="aeSubclass">SUBCLASS</h3><div class="ae-tiles">${subclassTile}</div>${groups}${issues.length?`<ul class="ae-issues">${issues.map(row=>`<li>${esc(row)}</li>`).join('')}</ul>`:''}</section>`;
  }
  function weaponsPanel(){
    const weapons=build().weapons||[];
    return `<section class="ae-panel ae-panel-weapons" aria-labelledby="aeWeapons"><h3 id="aeWeapons">WEAPONS</h3><div class="ae-gear-row">${WEAPON_SLOTS.map((label,index)=>gearTile(weapons[index]||null,'weapon',{label,attrs:`data-ed="open" data-ed-target="weapon:${index}"`})).join('')}</div><p class="ae-hint">One Exotic weapon at a time.</p></section>`;
  }
  function armourPanel(){
    const armour=build().armour||[],totals=armourStatTotals(armour);
    const stats=totals.stats.length?`<div class="ae-stats" role="group" aria-label="Armour stat totals">${totals.stats.map(stat=>`<span class="ae-stat" title="${esc(stat.name)}">${stat.icon?`<img src="${esc(stat.icon)}" alt="">`:''}<b>${esc(stat.value)}</b><small>${esc(stat.name)}</small></span>`).join('')}${totals.complete?'':`<em class="ae-hint">${totals.missing.length?`No Bungie stat data for ${esc(totals.missing.join(', '))}. Totals cover the other pieces.`:'Totals cover the pieces chosen so far.'}</em>`}</div>`:`<p class="ae-hint">${totals.missing.length?`No Bungie stat data for ${esc(totals.missing.join(', '))}.`:'Choose armour to see stat totals.'}</p>`;
    return `<section class="ae-panel ae-panel-armour" aria-labelledby="aeArmour"><h3 id="aeArmour">ARMOUR</h3><div class="ae-gear-row">${ARMOUR_SLOTS.map((label,index)=>gearTile(armour[index]||null,'armour',{label,attrs:`data-ed="open" data-ed-target="armour:${index}"`})).join('')}</div>${stats}</section>`;
  }
  function modsPanel(){
    const placement=modPlacement(build().armour,state.carried);
    const rows=placement.pieces.map(piece=>`<div class="ae-mod-piece${piece.over?' is-over':''}"><h4>${esc(piece.label)}<span class="ae-count">${piece.item?(piece.capacity===null?'energy unavailable':`${piece.used}/${piece.capacity} energy`):''}</span></h4><div class="ae-tiles">${piece.item?(piece.sockets.map(socket=>plugTile(socket.plug,{label:`${piece.label} mod ${socket.position}`,empty:'Empty mod socket',note:socket.plug&&socket.cost!==null?`${socket.cost} energy`:'',badge:socket.plug&&socket.cost!==null?socket.cost:'',attrs:`data-ed="open" data-ed-target="mod:${piece.index}:${socket.socketIndex}"`})).join('')||'<p class="ae-none">No editable mod sockets</p>'):'<p class="ae-none">Choose armour first</p>'}</div></div>`).join('');
    const placementView=state.view==='placement'?`<div class="ae-placement" aria-label="Mod placement"><h4>MOD PLACEMENT</h4>${placement.pieces.map(piece=>`<div class="ae-placement-row"><b>${esc(piece.item?nameOf(piece.item):`${piece.label}: empty`)}</b><span>${piece.capacity===null?'Energy unavailable':`${piece.used}/${piece.capacity} energy`}</span><span>${piece.sockets.filter(socket=>socket.plug).map(socket=>esc(nameOf(socket.plug))).join(', ')||'No mods'}</span></div>`).join('')}<div class="ae-unassigned"><h4>UNASSIGNED MODS</h4>${placement.unassigned.length?`<ul>${placement.unassigned.map(row=>`<li>${plugTile(row.mod)}<span><b>${esc(nameOf(row.mod)||'Mod')}</b> ${esc(row.reason)}</span></li>`).join('')}</ul>`:'<p class="ae-none">Every mod fits.</p>'}</div></div>`:'';
    return `<section class="ae-panel ae-panel-mods" aria-labelledby="aeMods"><h3 id="aeMods">MODS<button type="button" class="ae-view-toggle" data-ed="view" aria-pressed="${state.view==='placement'}">${state.view==='placement'?'HIDE PLACEMENT':'MOD PLACEMENT'}</button></h3>${rows}${placementView}</section>`;
  }
  function artifactPanel(){
    const owned=ownedArtifacts(),data=artifactData();
    const pickTile=data?plugTile(data,{label:'Artifact',attrs:'data-ed="open" data-ed-target="artifact"',note:'Choose another artifact'}):`<button type="button" class="ae-tile ae-plug is-empty ae-tip" data-name="Choose an artifact" data-ed="open" data-ed-target="artifact" aria-label="Choose an artifact"${owned.length?'':' disabled'}><span class="ae-empty-mark" aria-hidden="true">◇</span></button>`;
    if(!data)return `<section class="ae-panel ae-panel-artifact" aria-labelledby="aeArtifact"><h3 id="aeArtifact">ARTIFACT</h3><div class="ae-tiles">${pickTile}</div><p class="ae-hint">${owned.length?'Step 1: choose the artifact. Its own perks open next.':'No artifact on this account in the Bungie data.'}</p></section>`;
    const chosen=selectedPerks(),limit=Number(data.selectionLimit),count=[...chosen].length;
    // Step 2: the chosen artifact's own perks, in its in-game tier columns.
    const tiers=[...new Set(data.perks.filter(Boolean).map(perk=>Number(perk.tierIndex)).filter(Number.isInteger))].sort((a,b)=>a-b);
    const columns=(tiers.length?tiers:[null]).map(tier=>{
      const rows=data.perks.map((perk,index)=>({perk,index})).filter(({perk})=>perk&&perk.isVisible!==false&&(tier===null||Number(perk.tierIndex)===tier));
      const capacity=(data.selectionSlots||[]).find(slot=>Number(slot?.tierIndex)===tier)?.capacity;
      return `<div class="ae-artifact-column" role="group" aria-label="Tier ${tier===null?'':tier+1}"><h4>${tier===null?'PERKS':`TIER ${tier+1}`}${Number.isFinite(Number(capacity))?`<span class="ae-count">${rows.filter(({perk})=>chosen.has(hashOf(perk))).length}/${capacity}</span>`:''}</h4>${rows.map(({perk,index})=>plugTile(perk,{selected:chosen.has(hashOf(perk)),locked:perk.tierUnlocked===false,note:perk.tierUnlocked===false?'Not unlocked yet':'',attrs:`data-ed="artifact" data-ed-index="${index}" aria-pressed="${chosen.has(hashOf(perk))}"`})).join('')}</div>`;
    }).join('');
    return `<section class="ae-panel ae-panel-artifact" aria-labelledby="aeArtifact"><h3 id="aeArtifact">ARTIFACT<span class="ae-count">${count}/${Number.isFinite(limit)&&limit>0?limit:'limit unknown'}</span></h3><div class="ae-tiles">${pickTile}</div><div class="ae-artifact-grid">${columns}</div><p class="ae-hint">Artifact choices are made in Destiny when you apply.</p></section>`;
  }
  function html(){
    const record=state.record;
    return `<div class="ae-editor"><header class="ae-head"><h2 id="paradoxDialogTitle">EDIT ${esc(record.name||'BUILD')}</h2><label>Build name<input id="paradoxEditName" maxlength="80" required value="${esc(record.name)}"></label><label>Notes<textarea id="paradoxEditDescription" maxlength="400">${esc(record.description||'')}</textarea></label></header>${state.error&&!state.picker?`<p class="ae-error" role="alert">${esc(state.error)}</p>`:''}<div class="ae-panels">${subclassPanel()}${weaponsPanel()}${armourPanel()}${modsPanel()}${artifactPanel()}</div><p class="paradox-dialog-error" id="paradoxDialogError" role="alert"></p><footer class="ae-foot"><button type="button" data-ed="undo"${state.history.length?'':' disabled'}>UNDO</button><button type="button" data-ed="redo"${state.future.length?'':' disabled'}>REDO</button><button type="button" data-dialog-close>CANCEL</button><button type="button" data-dialog-action="save-record-new">SAVE AS NEW</button><button type="button" class="is-primary" data-dialog-action="save-record">SAVE CHANGES</button></footer>${pickerMarkup()}</div>`;
  }

  /** Routes a click from the dialog. Returns true when the editor needs a re-render. */
  function handle(control){
    const action=control?.dataset?.ed;
    if(control?.dataset?.edPick!==undefined)return pick(control.dataset.edPick)||true;
    if(control?.dataset?.edPreview!==undefined&&state.picker){state.picker={...state.picker,preview:Number(control.dataset.edPreview)};state.error='';return true;}
    if(action==='preview-back'&&state.picker){const {preview,...rest}=state.picker;state.picker=rest;state.error='';return true;}
    if(action==='open')return open(control.dataset.edTarget);
    if(action==='close-picker'){state.picker=null;state.query='';state.error='';return true;}
    if(action==='undo')return undo();
    if(action==='redo')return redo();
    if(action==='view'){state.view=state.view==='placement'?'build':'placement';return true;}
    if(action==='artifact')return toggleArtifact(Number(control.dataset.edIndex))||true;
    return false;
  }
  function search(value){state.query=String(value||'');return true;}
  function setText(name,description){state.record.name=String(name??state.record.name);state.record.description=String(description??state.record.description??'');}

  return {state,html,handle,search,setText,undo,redo,open,pick,pickerOptions,swapEquipment,setMod,setSubclass,setSubclassSocket,toggleArtifact,setArtifact,abilitySockets,get record(){return state.record;}};
}
