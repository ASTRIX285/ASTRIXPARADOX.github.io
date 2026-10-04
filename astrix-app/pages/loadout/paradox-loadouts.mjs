import {runProfileTask} from '../../core/engine-profile-client.mjs';
import {itemTileMarkup} from '../../shared/guardian-inventory-workspace.mjs';
import {listParadoxLoadouts,saveParadoxLoadout,deleteParadoxLoadout} from '../guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs';
import {classifyArmourPlug,normaliseArmourSemantics} from '../guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {normalisePreparedPagePayload,normaliseLiveProfile,profileWithSelectedLoadout} from '../guardian-workspace-v2/guardian-bungie-profile.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs';
import {LOADOUT_DEFINITIONS} from '../guardian-workspace-v2/guardian-loadout-definitions.mjs';
import {createVaultCatalogue} from '../vault/vault-inventory.mjs';
import {filterManualEquipmentSources} from '../guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import {createLiveTransferPlan} from '../guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {liveActionCapabilities,sessionBinding,inventoryLocations,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan,requestFreshProfile,verifyReadback,stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction} from '../guardian-workspace-v2/guardian-live-actions.mjs';
import {createPreparedPageRefreshController} from '../guardian-workspace-v2/guardian-session-cache.mjs';
import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {createArmouryEditor} from './armoury-editor.mjs';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf=item=>String(item?.name||item?.displayName||'Unresolved item');
const hashOf=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
// Bungie loadouts store 2166136261 (the FNV-1a hash of an empty input) for a socket
// with no plug. It is never a real item, so it renders and applies as an empty socket.
const EMPTY_PLUG_HASH=2166136261;
const isEmptyPlug=item=>item==null||hashOf(item)===EMPTY_PLUG_HASH;

function component(title,rows,{wide=false}={}){return `<section class="paradox-loadout-component${wide?' wide':''}"><h3>${esc(title)}</h3><ul>${rows.length?rows.map(row=>`<li>${esc(row)}</li>`).join(''):'<li>Not staged</li>'}</ul></section>`;}
// Render the saved snapshot, never substitute the currently equipped Guardian.
function savedIcon(item){
  const value=item?.icon||item?.displayProperties?.icon||item?.definition?.displayProperties?.icon||'';
  if(typeof value!=='string')return '';
  if(value.startsWith('/')&&!value.startsWith('//'))return `https://www.bungie.net${value}`;
  try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}
}
function savedTile(item,{compact=false,equipment=false,kind='',tooltip=''}={}){
  if(!item)return '';
  if(isEmptyPlug(item))return `<figure class="saved-build-tile${compact?' is-compact':''} is-empty" title="Empty socket" aria-label="Empty socket" role="img" tabindex="0"><div class="saved-build-art"><span class="saved-build-empty-socket" aria-hidden="true">◇</span></div></figure>`;
  const name=item.name||item.displayName||item.displayProperties?.name||item.definition?.displayProperties?.name||`Unresolved item ${hashOf(item)||''}`,icon=savedIcon(item);
  const power=item.power==null||item.power===''?null:Number(item.power);
  const label=[name,tooltip,!icon?'No icon':'',equipment&&!Number.isFinite(power)?'Power unavailable':''].filter(Boolean).join('\n');
  const empty='<span class="saved-build-empty-socket" aria-hidden="true">◇</span>';
  const shared=equipment&&['weapon','armour'].includes(kind)?itemTileMarkup({...item,icon,source:{...item.source,kind:'saved'}},{kind}):'';
  const count=Number(item.count??item.quantity);
  return `<figure class="saved-build-tile${compact?' is-compact':''}${equipment?' is-equipment':''}${item.isExotic?' is-exotic':''}" title="${esc(label)}" aria-label="${esc(label)}" role="img" tabindex="0">${shared||`<div class="saved-build-art">${icon?`<img src="${esc(icon)}" alt="" loading="lazy" decoding="async">`:empty}</div>`}${!equipment&&Number.isInteger(count)&&count>1?`<span class="saved-build-count" aria-label="Count ${count}">${count}</span>`:''}</figure>`;
}
function savedMods(item){
  const mods=[...(item.generalMods||item.armourSemantics?.generalMods||[]),...(item.slotMods||item.armourSemantics?.slotMods||[])].filter(mod=>!isEmptyPlug(mod));
  // Classified legacy rows may lack definitions. Raw sockets require positive
  // mod evidence; archetypes, cosmetics and intrinsic plugs are never mods.
  return mods.length?mods.filter(mod=>['general-mod','slot-mod','unknown'].includes(classifyArmourPlug(mod))):(item.mods||[]).filter(mod=>!isEmptyPlug(mod)&&['general-mod','slot-mod'].includes(classifyArmourPlug(mod)));
}
function savedEquipment(title,items){
  return `<div class="saved-build-equipment" role="group" aria-label="${esc(title)}">${items.filter(Boolean).map(item=>{
    const model=item.weaponSemantics?.perkModel||item.weaponPerkModel;
    const perks=(model?.columns||[]).map(column=>(column.options||[]).find(option=>hashOf(option)===Number(column.selectedPlugHash))).filter(Boolean);
    const appearance=title==='Armour'?[item.shader,item.ornament].filter(plug=>!isEmptyPlug(plug)):[];
    return `<div class="saved-build-equipment-item">${savedTile(item,{equipment:true,kind:title==='Weapons'?'weapon':title==='Armour'?'armour':'equipment',tooltip:perks.map(nameOf).join('\n')})}${title==='Armour'?`<div class="saved-build-attached-mods" role="group" aria-label="${esc(nameOf(item))} mods">${savedMods(item).map(mod=>savedTile(mod,{compact:true})).join('')}</div>`:''}${appearance.length?`<div class="saved-build-appearance" role="group" aria-label="${esc(nameOf(item))} appearance">${appearance.map(plug=>savedTile(plug,{compact:true})).join('')}</div>`:''}</div>`;
  }).join('')||'<p class="saved-build-missing">Not saved</p>'}</div>`;
}
function savedStats(stats=[]){
  const rows=stats.slice(0,6).map(row=>Array.isArray(row)?{name:row[0],value:row[1],icon:row[2]}:row).filter(Boolean);
  const valueOf=row=>row.value==null||row.value===''?null:Number(row.value);
  const total=rows.length===6&&rows.every(row=>Number.isFinite(valueOf(row)))?rows.reduce((sum,row)=>sum+valueOf(row),0):null;
  return `<div class="saved-build-stats" role="group" aria-label="Saved build stats">${total!==null?`<b class="saved-build-stat-total">Total: ${esc(total)}</b>`:''}${rows.map(row=>{
    const value=valueOf(row),label=`${row.name||'Stat'}: ${Number.isFinite(value)?value:'unavailable'}`,icon=savedIcon(row);
    return `<span class="saved-build-stat" title="${esc(label)}" aria-label="${esc(label)}">${icon?`<img src="${esc(icon)}" alt="">`:'<span class="saved-build-empty-socket" aria-hidden="true">◇</span>'}<b>${Number.isFinite(value)?esc(value):'—'}</b></span>`;
  }).join('')||'<span class="saved-build-missing">Stats not saved</span>'}</div>`;
}
export function savedBuildOverview(build={}){
  const sb=build.subclassBuild||{};
  const perks=build.artifact?.perks||build.artifact?.activePerks||[];
  const hashes=build.artifactConfiguration?.selectedPerkHashes;
  const selected=Array.isArray(hashes)?hashes.map(hash=>perks.find(perk=>hashOf(perk)===Number(hash))||{hash,name:`Unresolved Artifact perk ${hash}`}):perks.filter(perk=>perk.isActive===true);
  const armour=(build.armour||[]).filter(Boolean),mods=armour.flatMap(item=>savedMods(item).map(mod=>({item:mod,owner:nameOf(item)})));
  const equipment=[build.ghost||build.equipment?.ghost,build.ship||build.equipment?.ship,build.sparrow||build.equipment?.sparrow].filter(Boolean);
  const subclassName=build.subclassName||build.subclass||'Subclass';
  const components=[...(sb.abilities||[]),...(sb.aspects||[]),...(sb.fragments||[])].filter(plug=>plug!=null);
  return `<div class="saved-build-overview" role="region" aria-label="Saved build equipment" tabindex="0"><div class="saved-build-row"><div class="saved-build-subclass" role="group" aria-label="Subclass and abilities"><div class="saved-build-super">${savedTile(sb.super||{name:subclassName,icon:build.subclassIcon},{tooltip:subclassName})}</div><div class="saved-build-subclass-icons">${components.map(item=>savedTile(item)).join('')||'<p class="saved-build-missing">Not saved</p>'}</div></div><div class="saved-build-weapons">${savedEquipment('Weapons',build.weapons||[])}</div><div class="saved-build-armour">${savedEquipment('Armour',armour)}${savedStats(build.stats||[])}</div><div class="saved-build-cosmetics">${equipment.length?savedEquipment('Ghost, Ship and Sparrow',equipment):''}</div><div class="saved-build-sockets"><div class="saved-build-mods" role="group" aria-label="Armour mods">${mods.map(mod=>savedTile(mod.item,{tooltip:mod.owner})).join('')||'<p class="saved-build-missing">Mods not saved</p>'}</div><div class="saved-build-artifact" role="group" aria-label="Artifact"><span class="saved-build-section-label">Artifact</span><div class="saved-build-artifact-icons">${[build.artifact,...selected].filter(item=>!isEmptyPlug(item)).map(item=>savedTile(item,{compact:true})).join('')||'<p class="saved-build-missing">Not saved</p>'}</div></div></div></div></div>`;
}
function artifactRequiresInGameStep(build={}){const intended=[...new Set((build.artifactConfiguration?.selectedPerkHashes||[]).map(Number).filter(Number.isInteger))].sort((a,b)=>a-b),active=[...new Set((build.artifact?.activePerks||[]).filter(row=>row?.isActive!==false).map(hashOf).filter(Number.isInteger))].sort((a,b)=>a-b);return intended.length>0&&JSON.stringify(intended)!==JSON.stringify(active);}

// Pure Loadout-page boundaries, also exercised without a Bungie session.
export function matchingLoadouts(rows,characterId,binding={}){
  if(!characterId||!binding.membershipId||!binding.membershipType)return [];
  return rows.filter(row=>String(row.binding?.characterId)===String(characterId)&&String(row.binding?.membershipId)===String(binding.membershipId)&&String(row.binding?.membershipType)===String(binding.membershipType))
    .sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))||String(a.id).localeCompare(String(b.id)));
}
const itemId=item=>String(item?.itemInstanceId||item?.instanceId||'');
const copy=value=>structuredClone(value);
function subclassRows(build){const sb=build.subclassBuild||{};return [sb.super,...(sb.abilities||[]),...(sb.aspects||[]),...(sb.fragments||[]),...(sb.transcendenceSlots||[]).map(row=>row?.equipped)].filter(plug=>!isEmptyPlug(plug));}
export function selectedSocketTargets(build){
  const rows=new Map();
  const add=(item,plug,component)=>{
    const socketIndex=Number(plug?.socketIndex),plugHash=hashOf(plug);
    if(plug?.source==='bungie-manifest-fixed-intrinsic'||!itemId(item)||plug?.socketIndex==null||!Number.isInteger(socketIndex)||socketIndex<0||!Number.isInteger(plugHash)||plugHash<=0||plugHash===EMPTY_PLUG_HASH)return;
    rows.set(`${itemId(item)}:${socketIndex}`,{itemInstanceId:itemId(item),itemHash:hashOf(item),itemName:nameOf(item),socketIndex,plugHash,plugName:nameOf(plug),component,reversible:true});
  };
  for(const [key,component] of [['weapons','weapon-perk'],['armour','armour-mod']])for(const item of build[key]||[]){
    if(!item)continue;
    for(const plug of item.socketCoverage?.plugs||[])add(item,plug,component);
    const model=item.weaponSemantics?.perkModel||item.weaponPerkModel;
    for(const column of model?.columns||[]){const plug=(column.options||[]).find(row=>hashOf(row)===Number(column.selectedPlugHash));if(plug)add(item,{...plug,socketIndex:plug.socketIndex??column.socketIndex},component);}
    for(const plug of [...(item.selectedPerks||item.weaponSemantics?.selectedPerks||[]),...savedMods(item),item.weaponMod,item.shader,item.ornament].filter(plug=>!isEmptyPlug(plug)))add(item,plug,component);
  }
  const subclass={...build.subclassItem,itemInstanceId:build.subclassItemInstanceId||itemId(build.subclassItem)};
  for(const plug of subclassRows(build))add(subclass,plug,'subclass-socket');
  for(const change of build.manualSocketChanges||[]){
    if(!change?.itemInstanceId||!Number.isInteger(Number(change.socketIndex))||Number(change.plugHash)<=0)continue;
    rows.set(`${change.itemInstanceId}:${Number(change.socketIndex)}`,copy(change));
  }
  return [...rows.values()];
}
export function restoreSavedSocketIntent(build,payload){
  const next=copy(build),{profile,locations}=inventoryLocations(payload);
  // Older saved snapshots can lack the empty-plug name. Resolve the same hash
  // from fresh definitions, without replacing the saved socket selection.
  const enrich=plug=>{
    const definition=payload?.definitions?.[String(hashOf(plug))];
    return plug&&definition?{...plug,definition,name:definition.displayProperties?.name||plug.name}:plug;
  };
  if(next.subclassBuild){
    next.subclassBuild.super=enrich(next.subclassBuild.super);
    for(const key of ['abilities','aspects','fragments'])next.subclassBuild[key]=(next.subclassBuild[key]||[]).map(enrich);
  }
  for(const key of ['weapons','armour'])next[key]=(next[key]||[]).map(item=>item?{...item,source:locations.get(itemId(item))?.source||{}}:item);
  if(next.subclassItem)next.subclassItem={...next.subclassItem,source:locations.get(itemId(next.subclassItem))?.source||{}};
  // Old catalogues must not override the chosen subclass's fresh location.
  next.subclassCatalog=next.subclassItem?[next.subclassItem]:[];
  next.manualSocketChanges=selectedSocketTargets(next).map(change=>{
    const current=profile?.itemComponents?.sockets?.data?.[change.itemInstanceId]?.sockets?.[change.socketIndex]?.plugHash;
    const options=profile?.itemComponents?.reusablePlugs?.data?.[change.itemInstanceId]?.plugs?.[String(change.socketIndex)]||[];
    const exact=options.some(row=>Number(row.plugItemHash??row.plugHash)===Number(change.plugHash)&&row.canInsert===true&&row.enabled!==false);
    return {...change,currentPlugHash:current==null?null:Number(current),remoteSupported:Number(current)===Number(change.plugHash)||exact,source:'bungie-item-reusable-plugs',remoteInsertEvidence:exact?'exact-item-reusable-plug':null};
  });
  delete next.weaponRollAdvice;delete next.paradoxAnalysis;delete next.armourModRecommendation;
  return next;
}
export function verifySavedSlot(plan,payload,index){
  const slot=payload?.profile?.characterLoadouts?.data?.[plan.characterId]?.loadouts?.[index];
  if(!slot)return false;
  const rows=[...(slot.items||[]),...(slot.subclassOverrides||[])];
  return (plan.equipment?.targets||[]).every(target=>rows.some(row=>String(row.itemInstanceId)===String(target.itemInstanceId)))
    &&(plan.socketChanges||[]).every(change=>rows.some(row=>String(row.itemInstanceId)===String(change.itemInstanceId)&&Number(row.plugItemHashes?.[change.socketIndex])===Number(change.plugHash)));
}
export async function applyThenSaveSlot({plan,index,session,assertCurrent,onProgress=()=>{},executeApply=executeLiveTransferPlan,readFresh=requestFreshProfile,executeSlot=executeBungieLoadoutAction}){
  assertCurrent();
  const result=await executeApply(confirmLiveTransferPlan(plan),{session,onProgress});
  if(result.status!=='applied'||result.readback?.verified!==true)throw new Error(`Apply ${result.status||'incomplete'}. The in-game slot was not overwritten. ${result.steps?.find(row=>['failed','blocked','mismatch'].includes(row.status))?.label||''}`);
  if(index==null)return result;
  assertCurrent();
  const fresh=await readFresh();
  if(!verifyReadback(plan,fresh).verified)throw new Error('Equipment changed after Apply. The in-game slot was not overwritten.');
  assertCurrent();
  const intent=stageBungieLoadoutAction('snapshot',{characterId:plan.characterId,index});
  await executeSlot('snapshot',{characterId:plan.characterId,index,session,confirmation:confirmBungieLoadoutAction(intent)});
  const readback=await readFresh();
  if(!verifySavedSlot(plan,readback,index))throw new Error(`Bungie accepted the save, but slot ${index+1} could not confirm the equipment and sockets. Refresh and retry.`);
  return result;
}
function editableSnapshotItem(item,fresh,kind){
  if(!item)return item;
  const semantics=kind==='armour'?normaliseArmourSemantics({plugs:item.socketCoverage?.plugs||item.mods||[]}):null;
  return {...copy(item),...(semantics?{armourSemantics:{...semantics,...item.armourSemantics},generalMods:item.generalMods||item.armourSemantics?.generalMods||semantics.generalMods,slotMods:item.slotMods||item.armourSemantics?.slotMods||semantics.slotMods}:{}),socketOptions:fresh?.socketOptions||{},armourModOptions:fresh?.armourModOptions||{},
    // Stats and energy come from the live instance: a saved snapshot may predate them.
    ...(fresh?.stats?.length?{stats:copy(fresh.stats),totalStats:fresh.totalStats}:{}),...(fresh?.energy?{energy:copy(fresh.energy)}:{})};
}
// End pure Loadout-page boundaries.

let records=[],session=null,payload=null,equipped=null,characterId='',selectedId='equipped',loading=true,busy=false;
let selectionVersion=0,refreshVersion=0,dialogState=null;
let savedReadSequence=0,appliedSavedReadSequence=0;
async function refreshSavedRecords(){
  const sequence=++savedReadSequence;
  const rows=await listParadoxLoadouts();
  // Read order, not completion order: a late older result cannot replace newer rows.
  if(sequence<appliedSavedReadSequence)return;
  appliedSavedReadSequence=sequence;records=rows;
}
const trashIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
const dialog=()=>byId('paradoxLoadoutDialog');
let profileUnavailable=false;
// When the profile could not load, keep this account's cached builds visible rather than none.
const visibleRecords=()=>{const binding=sessionBinding(session||{});if(characterId||!profileUnavailable||!binding.membershipId)return matchingLoadouts(records,characterId,binding);return records.filter(row=>String(row.binding?.membershipId)===String(binding.membershipId)&&String(row.binding?.membershipType)===String(binding.membershipType)).sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));};
const recordById=id=>visibleRecords().find(row=>row.id===id);
const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
function status(message,error=false){const node=byId('paradoxLoadoutStatus');node.hidden=!message;node.textContent=message;node.classList.toggle('is-error',error);}
const OUTAGE_MESSAGE='Bungie is unavailable right now. Your builds are safe. Try again in a few minutes.';
const MISSING_DATA_MESSAGE='Bungie did not return your Guardian data. Retry.';
const SLOW_MESSAGE='Loading your Guardian took too long. Retry.';
const PARTIAL_LOAD_MESSAGE='Some builds could not refresh. Showing the builds saved on this device.';
// 20s per step. Tests shorten it through ARMOURY_STEP_TIMEOUT_MS on their sandbox global.
const STEP_TIMEOUT_MS=Number(globalThis.ARMOURY_STEP_TIMEOUT_MS)||20000;
// A load failure the user can retry: RETRY reruns the same action from the start.
class RetryableLoadError extends Error{constructor(message,cause){super(message);this.name='RetryableLoadError';this.retryable=true;if(cause)this.cause=cause;}}
const isOutage=error=>Number(error?.status)>=500||error?.payload?.error==='bungie_unavailable'||/bungie_unavailable/.test(String(error?.message||''));
function logError(error){globalThis.console?.error?.('[Armoury]',error);}
function reportError(error){logError(error);status(error?.message||'The Armoury action could not finish.',true);}
// Every profile step is bounded and logged, so a stalled step names itself in the console.
async function timedStep(name,work,ms=STEP_TIMEOUT_MS){
  const started=Date.now();let timer=null;
  const timeout=typeof globalThis.setTimeout==='function'?new Promise((_,reject)=>{timer=globalThis.setTimeout(()=>reject(new RetryableLoadError(SLOW_MESSAGE)),ms);}):null;
  try{
    const value=await (timeout?Promise.race([Promise.resolve().then(work),timeout]):work());
    globalThis.console?.info?.(`[Armoury] ${name} ${Date.now()-started}ms`);
    return value;
  }catch(error){globalThis.console?.info?.(`[Armoury] ${name} failed after ${Date.now()-started}ms`);throw error;}
  finally{if(timer!==null)globalThis.clearTimeout?.(timer);}
}
function guardContext(){
  const version=selectionVersion,binding=sessionBinding(session||{}),id=characterId;
  return ()=>{const now=sessionBinding(session||{});if(version!==selectionVersion||id!==characterId||binding.membershipId!==now.membershipId||binding.membershipType!==now.membershipType)throw new Error('The selected Guardian or membership changed. Reopen this action for the selected Guardian.');};
}
function enrichSavedBuild(build){
  const next=copy(build),definitions=payload?.definitions||{};
  for(const item of next.armour||[])if(item){
    const enrich=rows=>(rows||[]).map(row=>row?{...row,definition:row.definition||definitions[String(hashOf(row))]}:row);
    for(const key of ['generalMods','slotMods','mods'])if(item[key])item[key]=enrich(item[key]);
    if(item.armourSemantics)for(const key of ['generalMods','slotMods'])if(item.armourSemantics[key])item.armourSemantics[key]=enrich(item.armourSemantics[key]);
  }
  return next;
}
function actionButton(action,label,id,{trash=false}={}){return `<button type="button" data-build-action="${action}" data-build-id="${esc(id)}"${trash?` class="is-danger paradox-trash" title="Delete ${esc(label)}" aria-label="Delete ${esc(label)}"`:''}${busy?' disabled':''}>${trash?trashIcon:label}</button>`;}
function buildArticle(record,number,{current=false}={}){
  const build=current?record.build:enrichSavedBuild(record.build),id=current?'equipped':record.id;
  const actions=current?actionButton('save','SAVE PARADOX',id)+actionButton('ingame','SAVE TO IN-GAME',id):actionButton('apply','APPLY',id)+actionButton('edit','EDIT',id)+actionButton('ingame','SAVE TO IN-GAME',id)+actionButton('delete',record.name,id,{trash:true});
  const manualSteps=(build.manualSocketChanges||[]).filter(change=>change.remoteSupported===false).map(change=>`In game: set ${change.plugName||change.plugHash} on ${change.itemName||change.itemInstanceId}`).concat(artifactRequiresInGameStep(build)?'Artifact choices remain an in-game step.':[]);
  return `<article class="apx-section paradox-loadout-detail" id="loadout-${esc(id)}" data-build-record="${esc(id)}"><div class="paradox-loadout-detail-head"><div><small>${current?'CURRENTLY EQUIPPED':`PARADOX SAVED BUILD · REVISION ${Number(record.revision||1)}`}</small><h2>#${number} ${esc(current?'EQUIPPED':record.name)}</h2></div><div class="paradox-loadout-detail-actions">${actions}</div></div>${record.description?`<p class="paradox-loadout-description">${esc(record.description)}</p>`:''}${savedBuildOverview(build)}${manualSteps.length?component('IN-GAME STEPS',manualSteps):''}${current?'':`<details class="paradox-loadout-provenance"><summary>Build details</summary>${component('PROVENANCE',[`${record.summary?.manualEditCount||0} manual edits`,record.source?.bungieLoadoutIndex==null?'Current equipped source':`Copied from Bungie slot ${record.source.bungieLoadoutIndex+1}`])}<div class="paradox-loadout-binding">GUARDIAN ${esc(record.binding.characterId)} · UPDATED ${esc(new Date(record.updatedAt).toLocaleString())}</div></details>`}</article>`;
}
function slotIdentity(slot){
  const find=(key,hash)=>LOADOUT_DEFINITIONS?.[key]?.[String(hash)]||{};
  return {name:find('names',slot?.nameHash).name||'Saved loadout',icon:savedIcon({icon:find('icons',slot?.iconHash).iconImagePath}),color:savedIcon({icon:find('colors',slot?.colorHash).colorImagePath})};
}
function savedSlotStatus(slot,index,current){
  if(current.equippedLoadoutIndex===index)return '<span class="saved-slot-status is-match" aria-label="Matches equipped loadout">✓</span>';
  if(slot?.hasIssues===true||slot?.validation?.issues?.length)return '<span class="saved-slot-status is-issue" aria-label="Loadout issue">!</span>';
  return '';
}
function renderSlots(){
  const host=byId('guardianLoadouts');
  if(loading||!equipped?.loadoutsAvailable){host.innerHTML=`<p class="guardian-loadouts-status" role="status">${loading?'Loading selected Guardian...':session?.authenticated?'In-game loadout data unavailable.':'Connect Bungie to view in-game loadouts.'}</p>`;return;}
  host.innerHTML=Array.from({length:20},(_,index)=>{
    const slot=equipped.loadouts?.[index],saved=Boolean(slot?.items?.length||slot?.subclassOverrides?.length),identity=slotIdentity(slot),label=`${saved?identity.name:'Empty slot'} · Bungie ${index+1}`;
    return `<button type="button" class="guardian-loadout-slot ${saved?'is-saved':'is-empty'}${equipped.equippedLoadoutIndex===index?' is-active':''}" data-in-game-slot="${index}" title="${esc(label)}" aria-label="${esc(label)}"${identity.color?` style="--loadout-color-image:url('${esc(identity.color)}')"`:''}${busy?' disabled':''}>${saved&&identity.icon?`<img class="guardian-loadout-icon" src="${esc(identity.icon)}" alt="">`:saved?'<span class="guardian-loadout-icon-fallback" aria-hidden="true">◆</span>':'<span class="guardian-loadout-empty-label" aria-hidden="true">EMPTY</span>'}${saved?savedSlotStatus(slot,index,equipped):''}<small>${index+1}</small></button>`;
  }).join('');
}
function render(){
  hideItemTooltip();
  const rows=visibleRecords();byId('paradoxLoadoutCount').textContent=`${rows.length} SAVED`;
  byId('paradoxLoadoutList').innerHTML=[{id:'equipped',name:'EQUIPPED',summary:{subclass:equipped?.subclassName||'Selected Guardian'}},...rows].map((record,index)=>`<button type="button" class="paradox-loadout-card${record.id===selectedId?' is-active':''}" data-jump-id="${esc(record.id)}"${record.id===selectedId?' aria-current="true"':''}><span><b>#${index+1} ${esc(record.name)}</b><span>${esc(record.summary?.subclass||'')}</span></span>${index?`<em>R${Number(record.revision||1)}</em>`:''}</button>`).join('');
  const current=equipped?buildArticle({build:equipped},1,{current:true}):`<article class="apx-section paradox-loadout-detail" id="loadout-equipped"><div class="paradox-loadout-detail-head"><h2>#1 EQUIPPED</h2></div><p>${loading?'Loading the selected Guardian...':session?.authenticated?'Current equipment is unavailable. Refresh to try again.':'Connect Bungie to view this Guardian’s builds.'}</p></article>`;
  byId('paradoxLoadoutDetail').innerHTML=current+rows.map((record,index)=>buildArticle(record,index+2)).join('');
  renderSlots();
}
function initialCharacter(){
  const dom=document.querySelector('#guardianCharacterCards .is-selected[data-character-id]')?.dataset.characterId;
  if(dom&&payload?.profile?.characters?.data?.[dom])return dom;
  return Object.values(payload?.profile?.characters?.data||{}).sort((a,b)=>String(b.dateLastPlayed||'').localeCompare(String(a.dateLastPlayed||'')))[0]?.characterId||'';
}
async function setCharacter(id){
  if(!id||!payload?.profile?.characters?.data?.[id])return;
  if(id!==characterId){characterId=String(id);selectionVersion++;selectedId='equipped';closeDialog();}
  const check=guardContext(),prepared=await runProfileTask('normalise',{payload,session,characterId});check();
  equipped=prepared;render();
}
async function preparePayload(raw){
  const normalized=normalisePreparedPagePayload(raw);
  // Loadout carries armour definitions and plugs in its separate prepared index.
  guardianManifest.seedPayload(normalized);
  if(normalized.forgeArmourIndex&&!guardianManifest.applyForgeArmourIndex(normalized,normalized.forgeArmourIndex))throw new Error('The armour index does not match this profile. Refresh Loadout to retry.');
  return guardianManifest.hydratePayload(normalized,{allowNetwork:false,waitForManifest:false});
}
// The fresh read replaces current equipment, sockets and in-game slots. Components it does
// not carry (reusable plugs, for example) keep their prepared values instead of vanishing.
function mergedProfilePayload(base,fresh){
  const before=base?.profile||{},after=fresh?.profile||{};
  return {...base,...fresh,profile:{...before,...after,itemComponents:{...before.itemComponents,...after.itemComponents}},definitions:{...base?.definitions,...fresh?.definitions}};
}
async function refreshProfile({force=true}={}){
  const request=++refreshVersion,check=guardContext();
  const nextSession=await timedStep('session',()=>getBungieSession({force}));
  check();
  // authenticated null means the session service did not answer: an outage, not a sign-out.
  if(nextSession?.authenticated!==true&&nextSession?.authenticated!==false)throw new RetryableLoadError(OUTAGE_MESSAGE);
  const previous=sessionBinding(session||{}),next=sessionBinding(nextSession||{});
  if(!nextSession?.authenticated||previous.membershipId!==next.membershipId||previous.membershipType!==next.membershipType){session=nextSession;payload=null;equipped=null;characterId='';selectionVersion++;render();throw new Error('Bungie membership changed. Reload this page before continuing.');}
  session=nextSession;
  // Character scope carries sockets, item instances and in-game slots. The inventory
  // scope has none of them, so Edit and Save to In-Game must never build on it.
  let raw;
  try{raw=await timedStep('profile',()=>requestFreshProfile({scope:'character'}));}
  catch(error){throw error instanceof RetryableLoadError?error:isOutage(error)?new RetryableLoadError(OUTAGE_MESSAGE,error):error;}
  check();
  const fresh=raw?.profile;
  if(!characterId||!fresh?.characters?.data?.[characterId]||!fresh?.characterEquipment?.data?.[characterId])throw new RetryableLoadError(MISSING_DATA_MESSAGE);
  const prepared=await timedStep('prepare',()=>preparePayload(mergedProfilePayload(payload,raw)));check();
  if(request!==refreshVersion)throw new Error('A newer profile refresh replaced this action. Please try again.');
  const normalized=await timedStep('normalise',()=>runProfileTask('normalise',{payload:prepared,session,characterId}));check();
  if(request!==refreshVersion)throw new Error('A newer profile refresh replaced this action. Please try again.');
  if(!normalized)throw new RetryableLoadError(MISSING_DATA_MESSAGE);
  profileUnavailable=false;
  payload=prepared;equipped=normalized;
  globalThis.FORGE_HERO_PROFILE_PAYLOAD=payload;
  emit('forge:prepared-page-refreshed',{page:'loadout',payload});render();return payload;
}
function closeDialog(){if(busy)return;dialog()?.close();dialog()?.classList.remove('is-armoury-editor');dialogState=null;}
function showDialog(title,content,footer,state){
  const node=dialog();dialogState=state;node.classList.remove('is-armoury-editor');
  node.innerHTML=`<h2 id="paradoxDialogTitle">${esc(title)}</h2>${content}<p class="paradox-dialog-error" id="paradoxDialogError" role="alert"></p><footer><button type="button" data-dialog-close>CANCEL</button>${footer}</footer>`;
  if(!node.open)node.showModal();
  node.querySelector('input,select,button')?.focus();
}
function dialogError(error){logError(error);const node=byId('paradoxDialogError');if(node)node.textContent=error?.message||String(error);else status(error?.message||'The Armoury action could not finish.',true);}
let retryAction=null;
// Failures always surface in the dialog. A load failure replaces the checking dialog
// with its reason and a RETRY button that reruns the same action.
function showFailure(error,work){
  logError(error);
  if(error?.retryable){retryAction=work;showDialog('COULD NOT LOAD',`<p>${esc(error.message)}</p>`,'<button type="button" class="is-primary" data-dialog-retry>RETRY</button>',{kind:'retry',check:()=>{}});return;}
  if(dialog()?.open&&dialogState?.kind!=='checking'){dialogError(error);return;}
  showDialog('ACTION NOT COMPLETED',`<p>${esc(error?.message||'The Armoury action could not finish.')}</p>`,'',{kind:'failure',check:()=>{}});
}
async function runBusy(work){
  if(busy)return;
  busy=true;render();dialog()?.querySelectorAll('button').forEach(node=>node.disabled=true);
  const hero=byId('guardianCharacterCards');if(hero)hero.inert=true;
  try{await work();}catch(error){showFailure(error,work);}
  finally{busy=false;if(hero)hero.inert=false;render();dialog()?.querySelectorAll('button').forEach(node=>node.disabled=false);}
}
function draftFor(id){if(id==='equipped'){if(!equipped)throw new Error('Current equipment is unavailable.');return {build:copy(equipped),name:`${equipped.characterClass.toUpperCase()} · ${equipped.subclassName}`,description:''};}const record=recordById(id);if(!record)throw new Error('This saved build is not for the selected Guardian.');return copy(record);}
function nameFields(record){return `<label>Loadout name<input id="paradoxEditName" maxlength="80" required value="${esc(record.name)}"></label><label>Description<textarea id="paradoxEditDescription" maxlength="400">${esc(record.description||'')}</textarea></label>`;}
function openSave(record){showDialog('SAVE TO ARMOURY',`${nameFields(record)}<p class="paradox-dialog-note">Saved locally, then synced to your Bungie account in the background. PARADOX copies are separate from Bungie’s 20 slots.</p>`,'<button type="button" class="is-primary" data-dialog-action="save-record">SAVE PARADOX COPY</button>',{kind:'save',record:{...copy(record),id:null},check:guardContext()});}
async function saveDialogRecord({asNew=false}={}){
  const state=dialogState;state.check();
  const record=state.editor?state.editor.record:state.record;
  const name=byId('paradoxEditName').value.trim();if(!name)throw new Error('Enter a loadout name.');
  const build=copy(record.build);
  // Captured totals are not a prediction for edited equipment.
  if(state.editor?.state.history.length)build.stats=[];
  // Saving a draft never equips it; Apply performs compatibility checks. SAVE CHANGES keeps
  // the build's id so its revision goes up; SAVE AS NEW writes a separate Armoury build.
  const saved=await saveParadoxLoadout({id:asNew?null:record.id||null,expectedRevision:asNew?undefined:record.revision,name,description:byId('paradoxEditDescription').value,build});
  if(!saved)throw new Error('This browser could not store the loadout. Free some browser storage and try again.');
  await refreshSavedRecords();selectedId=saved.id;dialog().close();dialog().classList.remove('is-armoury-editor');dialogState=null;status(`Saved ${saved.name}${asNew?' as a new build':''}.`);
}

// The visual editor (armoury-editor.mjs) owns the build draft, pickers and undo history.
// This page keeps the dialog, saving and the Guardian guard around it.
// Picker tiles are icon only: their name shows in a small tooltip on hover and keyboard focus.
// It lives inside the dialog so the modal top layer never hides it.
function bindPickerTooltip(node){
  if(!node?.dataset||typeof node.addEventListener!=='function'||node.dataset.pickerTip)return;node.dataset.pickerTip='1';
  const show=target=>{
    const tile=target?.closest?.('.ae-choices [data-name]');let tip=node.querySelector('.ae-floating-tip');
    if(!tile||!tile.dataset.name){tip?.remove();return;}
    if(!tip){tip=document.createElement('div');tip.className='ae-floating-tip';tip.setAttribute('role','tooltip');node.append(tip);}
    const box=tile.getBoundingClientRect(),frame=node.getBoundingClientRect();
    tip.textContent=tile.dataset.name;tip.style.left=`${box.left-frame.left+box.width/2}px`;tip.style.top=`${box.top-frame.top+node.scrollTop}px`;
  };
  node.addEventListener('pointerover',event=>show(event.target));
  node.addEventListener('focusin',event=>show(event.target));
  node.addEventListener('pointerleave',()=>node.querySelector('.ae-floating-tip')?.remove());
}
function renderEditor(state){
  const node=dialog(),focusSearch=document.activeElement?.matches?.('[data-ed-search]');
  bindPickerTooltip(node);
  dialogState=state;node.classList.add('is-armoury-editor');
  node.innerHTML=state.editor.html();
  if(!node.open)node.showModal();
  if(focusSearch||state.editor.state.picker){const search=node.querySelector('[data-ed-search]');if(search){search.focus();search.setSelectionRange?.(search.value.length,search.value.length);}}
}
async function openEditor(record,{asCopy=false}={}){
  const check=guardContext();await refreshProfile();check();
  if(!equipped)throw new RetryableLoadError(MISSING_DATA_MESSAGE);
  const draft=copy(record);draft.build=enrichSavedBuild(draft.build);if(asCopy)draft.id=null;
  const all=createVaultCatalogue(payload).items||[];
  const catalogue=filterManualEquipmentSources(all,characterId);
  for(const key of ['weapons','armour'])draft.build[key]=(draft.build[key]||[]).map(item=>{
    if(!item)return item;
    const fresh=all.find(row=>itemId(row)===itemId(item));
    return editableSnapshotItem(item,fresh,key==='armour'?'armour':'weapon');
  });
  // Unlocked perks and the selection limit come from the live Artifact, not the saved snapshot.
  const artifact=Array.isArray(equipped.artifact?.perks)&&equipped.artifact.perks.length?equipped.artifact:draft.build.artifact||null;
  const subclasses=(equipped.subclassCatalog||[]).filter(item=>item&&itemId(item));
  const artifacts=(equipped.availableArtifacts||[]).filter(row=>Array.isArray(row?.perks)&&row.perks.length);
  renderEditor({kind:'edit',editor:createArmouryEditor({record:draft,catalogue,subclasses,artifact,artifacts}),check});
}
function editorClick(control){
  const state=dialogState;if(state?.kind!=='edit')return;state.check();
  state.editor.setText(byId('paradoxEditName')?.value,byId('paradoxEditDescription')?.value);
  if(state.editor.handle(control))renderEditor(state);
}
function editorSearch(input){
  const state=dialogState;if(state?.kind!=='edit')return;
  state.editor.setText(byId('paradoxEditName')?.value,byId('paradoxEditDescription')?.value);
  state.editor.search(input.value);renderEditor(state);
}
function slotOptions(){return Array.from({length:20},(_,index)=>{const slot=equipped?.loadouts?.[index],saved=Boolean(slot?.items?.length||slot?.subclassOverrides?.length);return `<option value="${index}">${index+1} · ${saved?`${esc(slotIdentity(slot).name)} (overwrite)`:'Empty'}</option>`;}).join('');}
async function reviewBuildAction(id,toGame){
  const check=guardContext(),record=draftFor(id);
  showDialog(toGame?'CHECKING IN-GAME SAVE':'CHECKING LOADOUT',`<p>Checking ${esc(record.name)} against your current Guardian, items and socket permissions.</p><p class="paradox-dialog-note">Your in-game equipment stays unchanged until you confirm.</p>`,'',{kind:'checking',check});
  await refreshProfile();check();
  const build=restoreSavedSocketIntent(id==='equipped'?equipped:record.build,payload);
  // Compare intended Artifact perks with fresh live perks, not the saved
  // snapshot's old active list. Artifact changes always remain in game.
  build.artifact={...build.artifact,activePerks:copy(equipped.artifact?.activePerks||[])};
  if(!build.subclassItemInstanceId||!build.subclassItem)throw new Error('This build has no exact saved subclass instance. Edit or resave it from equipment before Apply.');
  let plan=createLiveTransferPlan({build,originalBuild:build,capabilities:liveActionCapabilities(session)});
  if(!plan.ready)throw new Error(plan.blockers.join('\n'));
  plan=await stageLiveTransferPreflight(plan,{session});check();
  if(!plan.ready)throw new Error(plan.blockers.join('\n'));
  if(toGame&&!liveActionCapabilities(session).snapshotLoadout)throw new Error('This Bungie session does not support saving in-game loadouts.');
  const unsupported=build.manualSocketChanges.filter(change=>!change.remoteSupported);
  if(toGame&&unsupported.length)throw new Error(`This build needs ${unsupported.length} socket change(s) in Destiny before it can be saved exactly to an in-game slot. ${unsupported.map(row=>row.plugName).join(', ')}`);
  const equippedOnly=id==='equipped';
  const text=toGame?(equippedOnly?'Save the selected Guardian’s currently equipped build to the chosen Bungie slot.':`Apply ${record.name} to ${build.characterClass.toUpperCase()}, verify its equipment and sockets, then save it to the chosen Bungie slot.`):`Apply ${record.name} to ${build.characterClass.toUpperCase()}.`;
  showDialog(toGame?'SAVE TO IN-GAME':'APPLY LOADOUT',`<p>${esc(text)}</p><p>${plan.equipment.targets.length} equipment targets · ${plan.socketChanges.length} socket targets</p>${toGame?`<label>In-game slot<select id="paradoxTargetSlot"><option value="">Choose a slot</option>${slotOptions()}</select></label><p class="paradox-dialog-note">A saved Bungie slot will be overwritten. This keeps the PARADOX copy.</p>`:''}${plan.inGameSteps.length?component('IN-GAME STEPS',plan.inGameSteps):''}`,
    `<button type="button" class="is-primary" data-dialog-action="execute-build">${toGame?(equippedOnly?'SAVE TO SLOT':'APPLY & SAVE TO SLOT'):'CONFIRM APPLY'}</button>`,{kind:'apply',record,plan,toGame,equippedOnly,check});
}
async function executeBuildAction(){
  const state=dialogState;state.check();
  const index=state.toGame?Number(byId('paradoxTargetSlot').value):null;
  if(state.toGame&&byId('paradoxTargetSlot').value==='')throw new Error('Choose the Bungie slot to save into.');
  let mutationStarted=false;
  try{
    // Recheck the account before any mutation, keeping the reviewed build fixed.
    const freshSession=await getBungieSession({force:true});state.check();
    const old=sessionBinding(session),next=sessionBinding(freshSession);
    if(!freshSession.authenticated||old.membershipId!==next.membershipId||old.membershipType!==next.membershipType)throw new Error('The Bungie membership changed. Reopen this action.');
    session=freshSession;mutationStarted=true;
    await applyThenSaveSlot({plan:state.plan,index,session,assertCurrent:state.check,
      ...(state.equippedOnly?{executeApply:async()=>{const fresh=await requestFreshProfile();if(!verifyReadback(state.plan,fresh).verified)throw new Error('Equipped gear changed. Close this dialog and refresh before saving.');return {status:'applied',readback:{verified:true}};}}:{}),
      onProgress:row=>{const node=byId('paradoxDialogError');if(node)node.textContent=row.label;}});
    dialog().close();dialogState=null;
    status(index==null?`Applied ${state.record.name}.${state.plan.inGameSteps.length?' Complete the listed in-game steps separately.':''}`:`Saved and Bungie slot ${index+1}.${state.plan.inGameSteps.length?' Artifact choices remain an in-game step.':''}`);
  }finally{
    if(mutationStarted)try{await refreshProfile();}catch(error){status(`Refresh needed: ${error.message}`,true);}
  }
}
// Resolves Bungie's empty-plug sockets to the item's live plug. Returns null (keep live
// sockets untouched) when an empty-plug socket has no live value to fall back on.
function livePlugHashes(hashes,liveSockets=[]){
  if(!Array.isArray(hashes))return null;
  const resolved=hashes.map((hash,index)=>Number(hash)===EMPTY_PLUG_HASH?liveSockets?.[index]?.plugHash:hash);
  return resolved.some(hash=>hash==null)?null:resolved;
}
async function loadoutSnapshot(index){
  const check=guardContext();
  const slot=equipped?.loadouts?.[index];if(!slot?.items?.length&&!slot?.subclassOverrides?.length)throw new Error('This Bungie slot is empty.');
  const {locations}=inventoryLocations(payload),selectedItems=[];
  for(const row of [...(slot.items||[]),...(slot.subclassOverrides||[])]){
    const id=String(row.itemInstanceId||'');
    const source=[...(payload.profile.profileInventory?.data?.items||[]),...Object.values(payload.profile.characterInventories?.data||{}).flatMap(value=>value.items||[]),...Object.values(payload.profile.characterEquipment?.data||{}).flatMap(value=>value.items||[])].find(item=>String(item.itemInstanceId)===id);
    if(!source||!locations.has(id))throw new Error(`Bungie slot ${index+1} contains an unavailable item (${id||'no instance ID'}). Resolve missing items in Destiny before copying this build.`);
    const prior=selectedItems.find(item=>String(item.itemInstanceId)===id);
    const plugItemHashes=livePlugHashes(row.plugItemHashes,payload.profile?.itemComponents?.sockets?.data?.[id]?.sockets);
    if(prior){if(plugItemHashes)prior.plugItemHashes=plugItemHashes;}else selectedItems.push({...source,...(plugItemHashes?{plugItemHashes}:{})});
  }
  const projected=profileWithSelectedLoadout({...payload,characterId,selectedItems});
  const build=await runProfileTask('normalise',{payload:{...payload,profile:projected},session,characterId});check();
  // Bungie slots do not persist character totals or an Artifact configuration.
  build.stats=[];build.artifact=null;build.artifactConfiguration=null;build.selectedLoadoutIndex=index;
  for(const key of ['weapons','armour'])build[key]=(build[key]||[]).map(item=>item?{...item,source:locations.get(itemId(item))?.source||{}}:item);
  return {name:`${build.characterClass.toUpperCase()} · ${slotIdentity(slot).name}`,description:'',build};
}
function openSlot(index){
  if(!equipped?.loadoutsAvailable)return;
  const slot=equipped.loadouts?.[index],saved=Boolean(slot?.items?.length||slot?.subclassOverrides?.length);
  const identity=slotIdentity(slot);
  showDialog(`BUNGIE SLOT ${index+1}`,`<p>${esc(saved?identity.name:'Empty slot')} · ${esc(equipped.characterClass.toUpperCase())}</p>`,
    `${saved?'<button type="button" data-dialog-action="view-slot">VIEW</button><button type="button" data-dialog-action="copy-slot">SAVE PARADOX COPY</button><button type="button" data-dialog-action="edit-slot">EDIT COPY</button><button type="button" data-dialog-action="equip-slot">APPLY</button>':''}<button type="button" data-dialog-action="snapshot-slot">SAVE EQUIPPED HERE</button>${saved?'<button type="button" data-dialog-action="clear-slot">CLEAR SLOT</button>':''}`,{kind:'slot',index,check:guardContext()});
}
function confirmSlotAction(action,state){
  state.check();
  const intent=stageBungieLoadoutAction(action,{characterId,index:state.index});
  showDialog(action==='clear'?'CLEAR IN-GAME SLOT':'APPLY IN-GAME LOADOUT',`<p>${action==='clear'?`Clear Bungie slot ${state.index+1}? PARADOX copies are kept.`:`Equip Bungie slot ${state.index+1} on ${esc(equipped.characterClass.toUpperCase())}?`}</p>`,'<button type="button" class="is-primary" data-dialog-action="execute-slot">CONFIRM</button>',{kind:'slot-action',action,intent,index:state.index,check:state.check});
}
async function executeSlotAction(){
  const state=dialogState;state.check();
  const freshSession=await getBungieSession({force:true});state.check();
  const a=sessionBinding(session),b=sessionBinding(freshSession);
  if(!freshSession.authenticated||a.membershipId!==b.membershipId||a.membershipType!==b.membershipType)throw new Error('Bungie membership changed. Reload before continuing.');
  session=freshSession;
  const previous=copy(equipped.loadouts?.[state.index]);
  try{
    await executeBungieLoadoutAction(state.action,{characterId:state.intent.characterId,index:state.index,session,confirmation:confirmBungieLoadoutAction(state.intent)});
    await refreshProfile();state.check();
    const now=equipped.loadouts?.[state.index];
    if(state.action==='clear'&&(now?.items?.length||now?.subclassOverrides?.length))throw new Error('Bungie accepted Clear, but the slot still has items on readback. Refresh before retrying.');
    if(state.action==='equip'){
      const raw=[...(previous?.items||[]),...(previous?.subclassOverrides||[])];
      const plan={characterId,equipment:{targets:raw.map(item=>({itemInstanceId:String(item.itemInstanceId)}))},socketChanges:raw.flatMap(item=>(item.plugItemHashes||[]).flatMap((hash,index)=>Number(hash)>0&&Number(hash)!==EMPTY_PLUG_HASH?[{itemInstanceId:String(item.itemInstanceId),socketIndex:index,plugHash:Number(hash)}]:[]))};
      if(!verifyReadback(plan,payload).verified)throw new Error('Bungie accepted Apply, but the equipped build did not fully verify. Check missing items and mods in Destiny.');
    }
    dialog().close();dialogState=null;status(`Bungie slot ${state.index+1} ${state.action==='clear'?'cleared':'applied'}.`);
  }catch(error){try{await refreshProfile();}catch{}throw error;}
}
async function handleDialogAction(action){
  const state=dialogState;if(!state)return;state.check();
  if(action==='save-record')return saveDialogRecord();
  if(action==='save-record-new')return saveDialogRecord({asNew:true});
  if(action==='execute-build')return executeBuildAction();
  if(action==='execute-slot')return executeSlotAction();
  if(action==='delete-record'){
    if(!await deleteParadoxLoadout(state.record.id,state.record.revision))throw new Error('This browser could not delete the saved build.');
    await refreshSavedRecords();selectedId='equipped';dialog().close();dialogState=null;return;
  }
  if(action==='equip-slot'||action==='clear-slot')return confirmSlotAction(action==='equip-slot'?'equip':'clear',state);
  if(action==='snapshot-slot'){await reviewBuildAction('equipped',true);byId('paradoxTargetSlot').value=String(state.index);return;}
  await refreshProfile();state.check();
  // VIEW opens the same compact Loadout details as the Character page, over this page's profile.
  if(action==='view-slot'){
    const {openGuardianLoadoutDetails}=await import('../guardian-workspace-v2/guardian-loadout-details.mjs');
    dialog().close();dialogState=null;
    await openGuardianLoadoutDetails({characterId,index:state.index,getCharacterId:()=>characterId,getPayload:()=>payload});
    return;
  }
  const record=await loadoutSnapshot(state.index);
  if(action==='copy-slot')return openSave(record);
  if(action==='edit-slot')return openEditor(record,{asCopy:true});
}

let itemTooltip=null,itemTooltipTarget=null,itemTooltipTitle=null;
function hideItemTooltip(){
  if(itemTooltipTarget){itemTooltipTarget.removeAttribute('aria-describedby');if(itemTooltipTitle!=null)itemTooltipTarget.setAttribute('title',itemTooltipTitle);itemTooltipTarget=null;itemTooltipTitle=null;}
  if(itemTooltip){if(itemTooltip.hidePopover&&itemTooltip.matches(':popover-open'))itemTooltip.hidePopover();itemTooltip.hidden=true;}
}
function showItemTooltip(tile){
  if(tile===itemTooltipTarget)return;
  hideItemTooltip();
  if(!tile?.getAttribute('aria-label'))return;
  if(!itemTooltip){
    itemTooltip=document.createElement('div');itemTooltip.id='savedItemTooltip';itemTooltip.className='saved-item-tooltip';
    itemTooltip.setAttribute('role','tooltip');itemTooltip.setAttribute('popover','manual');
  }
  (tile.closest('dialog')||document.body).append(itemTooltip);
  itemTooltipTarget=tile;itemTooltip.textContent=tile.getAttribute('aria-label');itemTooltip.hidden=false;
  itemTooltipTitle=tile.getAttribute('title');tile.removeAttribute('title');
  tile.setAttribute('aria-describedby',itemTooltip.id);
  // Top-layer placement prevents the horizontal equipment scroller clipping names.
  if(itemTooltip.showPopover)itemTooltip.showPopover();
  const anchor=tile.getBoundingClientRect(),tip=itemTooltip.getBoundingClientRect(),gap=8;
  itemTooltip.style.left=`${Math.max(gap,Math.min(anchor.left,innerWidth-tip.width-gap))}px`;
  itemTooltip.style.top=`${Math.max(gap,anchor.bottom+gap+tip.height<=innerHeight?anchor.bottom+gap:anchor.top-tip.height-gap)}px`;
}
document.addEventListener('pointerover',event=>{const tile=event.target.closest?.('.saved-build-tile');if(tile)showItemTooltip(tile);});
document.addEventListener('focusin',event=>{const tile=event.target.closest?.('.saved-build-tile');if(tile)showItemTooltip(tile);});
document.addEventListener('pointerout',event=>{if(itemTooltipTarget?.contains(event.target)&&!itemTooltipTarget.contains(event.relatedTarget))hideItemTooltip();});
document.addEventListener('focusout',event=>{if(itemTooltipTarget?.contains(event.target))hideItemTooltip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideItemTooltip();});
document.addEventListener('scroll',hideItemTooltip,true);
window.addEventListener('resize',hideItemTooltip);

document.addEventListener('click',event=>{
  const jump=event.target.closest?.('[data-jump-id]');if(jump){selectedId=jump.dataset.jumpId;render();byId(`loadout-${selectedId}`)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(event.target.closest?.('[data-dialog-close]')){closeDialog();return;}
  if(busy)return;
  const editorControl=event.target.closest?.('[data-ed],[data-ed-pick]');if(editorControl){try{editorClick(editorControl);}catch(error){dialogError(error);}return;}
  if(event.target.closest?.('[data-dialog-retry]')){const work=retryAction;retryAction=null;dialog().close();dialogState=null;if(work)void runBusy(work);return;}
  const action=event.target.closest?.('[data-dialog-action]');if(action){void runBusy(()=>handleDialogAction(action.dataset.dialogAction));return;}
  const slot=event.target.closest?.('[data-in-game-slot]');if(slot){openSlot(Number(slot.dataset.inGameSlot));return;}
  const button=event.target.closest?.('[data-build-action]');if(!button)return;
  const id=button.dataset.buildId,kind=button.dataset.buildAction;
  void runBusy(async()=>{
    const check=guardContext();
    if(kind==='save'){await refreshProfile();check();openSave(draftFor(id));}
    else if(kind==='edit')await openEditor(draftFor(id));
    else if(kind==='apply'||kind==='ingame')await reviewBuildAction(id,kind==='ingame');
    else if(kind==='delete'){const record=draftFor(id);showDialog('DELETE ARMOURY BUILD',`<p>Delete ${esc(record.name)}? This keeps the Bungie in-game slots.</p>`,'<button type="button" class="is-primary" data-dialog-action="delete-record">DELETE</button>',{kind:'delete',record,check});}
  });
});
document.addEventListener('input',event=>{if(event.target.matches?.('[data-ed-search]'))try{editorSearch(event.target);}catch(error){dialogError(error);}});
dialog().addEventListener('cancel',event=>{
  // Escape closes an open editor picker first, then the dialog.
  if(dialogState?.editor?.state.picker){event.preventDefault();dialogState.editor.handle({dataset:{ed:'close-picker'}});renderEditor(dialogState);return;}
  if(busy)event.preventDefault();else{dialog().classList.remove('is-armoury-editor');dialogState=null;}
});
document.addEventListener('forge:character-selected',event=>{if(busy)return;void setCharacter(String(event.detail?.characterId||'')).catch(reportError);});
document.addEventListener('forge:hero-cards-render-complete',()=>{if(!busy&&!loading)void setCharacter(initialCharacter()).catch(reportError);});
window.addEventListener('forge:bungie-session',event=>{
  const next=event.detail;if(!session||!next||next.recovering||(next.authenticated!==true&&next.authenticated!==false))return;
  const before=sessionBinding(session),after=sessionBinding(next);
  if(next.authenticated===true&&before.membershipId===after.membershipId&&before.membershipType===after.membershipType)return;
  session=next;payload=null;equipped=null;characterId='';selectionVersion++;loading=false;
  closeDialog();render();status('Bungie membership changed. Reload to view this account’s loadouts.');
});
window.addEventListener('forge:paradox-loadouts-changed',()=>{void refreshSavedRecords().then(()=>{if(!busy&&!loading)render();}).catch(reportError);});
window.addEventListener('forge:paradox-sync',event=>{
  const node=byId('paradoxSyncStatus');if(!node)return;
  const {state,conflicts,message}=event.detail||{};
  const messages={syncing:'Syncing builds...',synced:'Builds synced',pending:'Saved locally. Sync pending.',offline:'Offline. Builds will sync when connected.','signed-out':'Sign in to sync saved builds.'};
  node.textContent=conflicts?'Sync conflict: both versions kept, or a newer edit prevented deletion. Review your builds.':message||messages[state]||'';
  node.hidden=!node.textContent;
});
window.addEventListener('storage',event=>{if(event.key==='astrix:paradox-saved-loadouts:v1'&&!busy)void refreshSavedRecords().then(()=>{render();}).catch(reportError);});
let displayRefreshController=null;
async function refreshDisplayedLoadout(){
  if(busy||dialog().open||loading||!session?.authenticated)return null;
  const check=guardContext(),revision=refreshVersion;
  const raw=await loadPreparedPagePayload(session,'loadout',{force:true,quiet:true});
  check();
  if(busy||dialog().open||revision!==refreshVersion)return null;
  const prepared=await preparePayload(raw);
  check();
  if(busy||dialog().open||revision!==refreshVersion)return null;
  const normalized=await runProfileTask('normalise',{payload:prepared,session,characterId});check();
  if(busy||dialog().open||revision!==refreshVersion)return null;
  payload=prepared;equipped=normalized;
  globalThis.FORGE_HERO_PROFILE_PAYLOAD=payload;
  emit('forge:prepared-page-refreshed',{page:'loadout',payload});render();
  return payload;
}
function checkDisplayRefresh(){
  if(document.visibilityState!=='hidden'&&!busy&&!dialog().open)void displayRefreshController?.check()?.catch(()=>{});
}
window.addEventListener('focus',checkDisplayRefresh);
document.addEventListener('visibilitychange',checkDisplayRefresh);

reportPreparedPageStage('start','loadout');
const savedPromise=refreshSavedRecords();
// A cancelled or slow prepared page is retried once with a fresh request. If it still
// fails, the page keeps this account's cached builds and says that some could not refresh.
async function loadInitialPayload(){
  try{return await loadPreparedPagePayload(session,'loadout',{sharedPayload:globalThis.FORGE_HERO_PROFILE_PAYLOAD});}
  catch(error){logError(error);return loadPreparedPagePayload(session,'loadout',{force:true});}
}
let startupNote='';
try{
  session=await getBungieSession();reportPreparedPageStage('session','loadout');
  if(session?.authenticated){
    const raw=await loadInitialPayload();
    payload=await preparePayload(raw);globalThis.FORGE_HERO_PROFILE_PAYLOAD=payload;
    characterId=String(initialCharacter());
    if(characterId){const check=guardContext(),normalized=await runProfileTask('normalise',{payload,session,characterId});check();equipped=normalized;}
  }
}catch(error){logError(error);profileUnavailable=true;startupNote=isOutage(error)?OUTAGE_MESSAGE:PARTIAL_LOAD_MESSAGE;}
try{await savedPromise;}catch(error){reportError(error);}
loading=false;reportPreparedPageStage('render','loadout');render();if(startupNote)status(startupNote,true);reportPreparedPageStage('ready','loadout');
window.ForgeLoader?.ready?.(document.querySelector('.apx-page-shell'));

if(session?.authenticated){
  displayRefreshController=createPreparedPageRefreshController({session,page:'loadout',refresh:refreshDisplayedLoadout,onError:error=>console.info('[Forge Loadout] Background refresh deferred',error)});
  displayRefreshController.start();
  // The header refresh icon (astrix-destination-ribbon.js) runs this page's own refresh.
  globalThis.FORGE_REFRESH=()=>displayRefreshController.refreshNow();
}
