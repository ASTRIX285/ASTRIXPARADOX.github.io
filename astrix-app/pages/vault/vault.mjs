import {createVaultTransferFeedback} from './vault-transfer-feedback.mjs';
import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs';
import {bindPreparedPageRefreshControl,createPreparedPageRefreshController,markGuardianFastReturn} from '../guardian-workspace-v2/guardian-session-cache.mjs';
import {ARMOUR_BUCKETS,createVaultCatalogue,filterVaultArmour,itemKey,prepareArmourSelection} from './vault-inventory.mjs';
import {ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector,armourTargetMaximums,matchArmourBuilds,statKey} from './vault-armour-matcher.mjs';
import {createVaultArmourSelection,writeVaultArmourSelection} from './vault-selection-state.mjs';
import {assertRenderablePagePayload} from '../../core/page-ready-contract.mjs';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {bindParadoxItemInspect} from '../guardian-workspace-v2/paradox-item-hover.mjs';
import {confirmPostmasterCollectionIntent,confirmVaultTransferIntent,executePostmasterCollectionIntent,executeVaultTransferIntent,inventoryLocations,liveActionCapabilities,requestFreshProfile,stagePostmasterCollectionIntent,stageVaultTransferIntent} from '../guardian-workspace-v2/guardian-live-actions.mjs';
import {bindInventoryWorkspaceHovers,bindInventoryWorkspaceInteractions,equippedAndCarriedMarkup,inventoryGroupsMarkup,itemTileMarkup,postmasterMarkup as sharedPostmasterMarkup} from '../../shared/guardian-inventory-workspace.mjs';
import {bindItemSheet,decoratePostmasterPullButtons,isCompactInventory,postmasterFailure,postmasterPullState} from '../../shared/inventory-item-actions.mjs';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const PAGE_SIZE=48;
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
const CLASS_NAMES=['titan','hunter','warlock'];
const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const text=value=>String(value??'').trim();
const params=new URLSearchParams(location.search);

let session=null;
let payload=null;
let catalogue={items:[],armour:[],postmasterItems:[],totals:{all:0,armour:0,other:0,ownedArmour:0,unresolvedDefinitions:0},postmasterByCharacter:{}};
let activeCharacterId=text(params.get('characterId'));
let activeCharacterClass='';
let visibleLimit=PAGE_SIZE;
let matchedBuilds=[];
let targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));
let vaultRefreshController=null;
let draggedItemKey='';
let pendingVaultAction=null;
let vaultActionBusy=false;
const vaultActionQueue=[];
const queuedVaultActionKeys=new Set();
const selectedSlots=new Map();
const transferFeedback=createVaultTransferFeedback({board:byId('vaultTransferWorkspace'),itemKey,characterLabel,canDrop:validFeedbackDrop});

function membershipBinding(){
  const membership=session?.activeDestinyMembership||{};
  return {
    characterId:activeCharacterId,
    membershipId:text(membership.membershipId||session?.primaryMembershipId||session?.bungieMembershipId),
    membershipType:text(membership.membershipType)
  };
}

function setStatus(message,state=''){
  const node=byId('vaultRuntimeStatus');
  if(node){node.textContent=message;node.className=`vault-runtime-status${state?` is-${state}`:''}`;}
}

function characters(){return Object.values(payload?.profile?.characters?.data||{});}

function selectedCharacter(){return characters().find(character=>text(character.characterId)===activeCharacterId)||null;}

function mostRecentCharacter(){
  return characters().sort((left,right)=>text(right?.dateLastPlayed).localeCompare(text(left?.dateLastPlayed)))[0]||null;
}

function characterClass(character){return CLASS_NAMES[Number(character?.classType)]||'';}

function rememberActiveCharacter(characterId){
  try{sessionStorage.setItem(SELECTED_CHARACTER_KEY,text(characterId));}catch{}
}

function resolveActiveCharacter(requestedId=''){
  const rows=characters();
  let stored='';
  try{stored=text(sessionStorage.getItem(SELECTED_CHARACTER_KEY));}catch{}
  const requested=text(requestedId||activeCharacterId||stored);
  const character=rows.find(row=>text(row.characterId)===requested)||mostRecentCharacter();
  activeCharacterId=text(character?.characterId);
  activeCharacterClass=characterClass(character);
  if(activeCharacterId)rememberActiveCharacter(activeCharacterId);
  const classFilter=byId('vaultClassFilter');
  if(classFilter&&activeCharacterClass)classFilter.value=activeCharacterClass;
  return character;
}

async function fetchProfile(){
  return loadPreparedPagePayload(session,'vault',{force:true});
}

async function loadVerifiedPayload(){
  const shared=globalThis.FORGE_HERO_PROFILE_PAYLOAD||await globalThis.FORGE_HERO_PROFILE_PROMISE;
  const next=await loadPreparedPagePayload(session,'vault',{sharedPayload:shared});
  if(!next?.profile)throw new Error('Inventory unavailable. Retry.');
  assertRenderablePagePayload(next,'vault');
  reportPreparedPageStage('join','vault');
  await guardianManifest.hydratePayload(next,{waitForManifest:false,includeReusable:true,allowNetwork:false});
  return next;
}

function updateTotals(){
  byId('vaultTotalCount').textContent=String(catalogue.totals.all);
  byId('vaultArmourCount').textContent=String(catalogue.totals.armour);
  byId('vaultEquipmentCount').textContent=String(catalogue.totals.other);
  byId('vaultOwnedArmourCount').textContent=String(catalogue.totals.ownedArmour);
}

function characterLabel(characterId){
  const character=characters().find(row=>text(row.characterId)===text(characterId)),name=characterClass(character);
  return name?name[0].toUpperCase()+name.slice(1):`Guardian ${characterId}`;
}

function workspaceCharacters(){
  const order={hunter:0,warlock:1,titan:2};
  return characters().sort((left,right)=>(order[characterClass(left)]??9)-(order[characterClass(right)]??9));
}

function workspaceItem(key){
  return [...catalogue.items,...catalogue.postmasterItems].find(item=>itemKey(item)===String(key||''))||null;
}

function equipmentGroupsMarkup(items=[],{includeEmpty=false,equippedFirst=false,pullCharacterId=''}={}){
  return inventoryGroupsMarkup(items,{includeEmpty,equippedFirst,pullCharacterId,capabilities:liveActionCapabilities(session),activeCharacterId});
}

function postmasterMarkup(characterId){
  return sharedPostmasterMarkup({characterId,items:catalogue.postmasterItems,characterLabel:characterLabel(characterId),capabilities:liveActionCapabilities(session),activeCharacterId});
}

function characterColumnMarkup(character){
  const characterId=text(character?.characterId),equipped=catalogue.items.filter(item=>item.source?.kind==='equipped'&&text(item.source.characterId)===characterId),carried=catalogue.items.filter(item=>item.source?.kind==='carried'&&text(item.source.characterId)===characterId),active=characterId===activeCharacterId,emblem=character?.emblemBackgroundPath||character?.emblemPath||'',style=emblem?` style="--vault-character-emblem:url('${esc(new URL(emblem,'https://www.bungie.net').toString())}')"`:'';
  return `<article class="vault-character-column${active?' is-active':''}" data-drop-kind="character" data-drop-character-id="${esc(characterId)}"${style}>
    ${postmasterMarkup(characterId)}
    <div class="vault-character-inventory">
      <header class="vault-character-header"><div><span>${active?'ACTIVE GUARDIAN':'GUARDIAN'}</span><h3>${esc(characterLabel(characterId).toUpperCase())}</h3></div><strong>${character?.light===undefined?'':`✦ ${esc(character.light)}`}</strong></header>
      ${equippedAndCarriedMarkup({characterId,items:[...equipped,...carried],capabilities:liveActionCapabilities(session),activeCharacterId,sectionLabel:'EQUIPPED AND CARRIED'})}
    </div>
  </article>`;
}

function vaultOnlyMarkup(){
  const items=catalogue.items.filter(item=>item.source?.kind==='vault');
  return `<section class="vault-only-section" data-drop-kind="vault"><header><div><span>SHARED ACCOUNT STORAGE</span><h3>VAULT ONLY</h3></div><strong>${items.length} SORTED ITEM${items.length===1?'':'S'}</strong></header><p>Drop items here to move them to the Vault.</p>${equipmentGroupsMarkup(items,{includeEmpty:true})}</section>`;
}

// Phone and tablet: Postmaster items are icons only and nothing is dragged. A tap opens the item
// card (weapons and armour) or the shared action sheet with the moves this item can make:
// Pull to <Guardian> from the Postmaster, Move to <Guardian> from the Vault, Move to Vault from the
// active Guardian. Shared with Character (inventory-item-actions.mjs).
// The last failed pull per item, in plain words. Cleared when a pull of that item is confirmed.
const postmasterFailures=new Map();
function vaultPostmasterFailure(result,thrown=null){return postmasterFailure(result,thrown,actionFailureMessage);}
function moveState(item,destination){
  const capabilities=liveActionCapabilities(session);
  if(!session?.authenticated)return {ready:false,reason:'Connect Bungie to move items.'};
  if(capabilities.transferItems!==true)return {ready:false,reason:'Bungie has not allowed item transfers for this session. Reconnect Bungie to try again.'};
  if(item.source?.kind==='equipped'&&capabilities.equipItems!==true)return {ready:false,reason:'Bungie has not allowed equipping for this session, so an equipped item cannot be swapped out.'};
  if(destination.kind==='character'){
    const targetClass=characterClass(characters().find(row=>text(row.characterId)===destination.characterId));
    if(item.characterClass&&item.characterClass!=='any'&&item.characterClass!==targetClass)return {ready:false,reason:`This item is for another class, so it cannot move to ${characterLabel(destination.characterId)}.`};
  }
  try{stageVaultTransferIntent({item,destination,session,replacementItem:item.source?.kind==='equipped'?carriedReplacement(item):null});return {ready:true,reason:''};}
  catch(error){return {ready:false,reason:error?.message||'This item cannot be moved there.'};}
}
function itemActions(item){
  if(!isCompactInventory()||!item)return [];
  const kind=item.source?.kind;
  if(kind==='postmaster'){
    const characterId=text(item.source.characterId),{ready,reason}=postmasterPullState({session,capabilities:liveActionCapabilities(session),failure:postmasterFailures.get(itemKey(item))});
    return [{label:`Pull to ${characterLabel(characterId)}`,disabled:!ready,reason,run:()=>stagePostmasterCollection(characterId,itemKey(item))}];
  }
  const destination=kind==='vault'?(activeCharacterId?{kind:'character',characterId:activeCharacterId}:null):(text(item.source?.characterId)===activeCharacterId&&['carried','equipped'].includes(kind)?{kind:'vault',characterId:null}:null);
  if(!destination||!validDrop(item,destination))return [];
  const {ready,reason}=moveState(item,destination);
  return [{label:destination.kind==='vault'?'Move to Vault':`Move to ${characterLabel(destination.characterId)}`,disabled:!ready,reason,run:()=>stageTransfer(item,destination)}];
}
function itemSubtitle(item){
  const kind=item?.source?.kind,count=Number(item?.quantity||1),stack=count>1?` · STACK OF ${count}`:'';
  if(kind==='postmaster')return `${characterLabel(item.source.characterId).toUpperCase()} POSTMASTER${stack}`;
  if(kind==='vault')return `VAULT${stack}`;
  return `${characterLabel(item?.source?.characterId).toUpperCase()} · ${kind==='equipped'?'EQUIPPED':'CARRIED'}${stack}`;
}

function bindVaultWorkspaceHovers(root){
  bindInventoryWorkspaceHovers(root,{resolveItem:workspaceItem,bindInspect:(target,item,kind,options)=>bindParadoxItemInspect(target,item,kind,{...options,actions:()=>itemActions(item)})});
}

function renderTransferWorkspace(){
  const host=byId('vaultTransferWorkspace');
  if(!host)return;
  host.innerHTML=`<div class="vault-character-columns">${workspaceCharacters().map(characterColumnMarkup).join('')}</div>${vaultOnlyMarkup()}`;
  bindVaultWorkspaceHovers(host);
  decoratePostmasterPullButtons(host,postmasterFailures);
  transferFeedback.reconcile();
}

function carriedReplacement(item){
  return catalogue.items.filter(candidate=>candidate.source?.kind==='carried'&&text(candidate.source.characterId)===text(item?.source?.characterId)&&Number(candidate.bucketHash)===Number(item?.bucketHash)&&itemKey(candidate)!==itemKey(item)).sort((left,right)=>Number(Boolean(left.isExotic))-Number(Boolean(right.isExotic))||Number(left.power||0)-Number(right.power||0)||String(left.name).localeCompare(String(right.name)))[0]||null;
}

function stageTransfer(item,destination){
  if(transferFeedback.isSettling(itemKey(item))){setStatus(`${item.name} moved. Bungie is still updating its inventory, so it can move again in a moment.`);return;}
  if(transferFeedback.isMoving(itemKey(item)))return;
  try{
    const replacement=item?.source?.kind==='equipped'?carriedReplacement(item):null,intent=stageVaultTransferIntent({item,destination,session,replacementItem:replacement}),target=destination.kind==='vault'?'Vault':characterLabel(destination.characterId),replacementCopy=replacement?` ${replacement.name} will be equipped on ${characterLabel(item.source.characterId)} first so the currently equipped item can move.`:'';
    const queueKey=`transfer:${item.itemInstanceId}:${destination.kind}:${destination.characterId||''}`;
    if(queuedVaultActionKeys.has(queueKey)){setStatus(`${item.name} is already queued for that exact destination.`);return;}
    transferFeedback.begin(queueKey,item,destination);
    queuedVaultActionKeys.add(queueKey);vaultActionQueue.push({kind:'transfer',intent,queueKey});
    setStatus(`Moving ${item.name} from ${item.source.label||item.source.kind} to ${target}.${replacementCopy} Waiting for Bungie inventory feedback.`);
    void performPendingVaultAction();
  }catch(error){setStatus(error?.message||'This live transfer cannot be staged.','error');}
}

function stagePostmasterCollection(characterId,requestedItemKey=''){
  try{
    const items=catalogue.postmasterItems.filter(item=>text(item?.source?.characterId)===text(characterId)&&(/^\d+$/.test(String(item?.itemInstanceId||''))||(!item?.itemInstanceId&&Number(item?.itemHash)>0))&&(!requestedItemKey||itemKey(item)===text(requestedItemKey))),intent=stagePostmasterCollectionIntent({characterId,items,session});
    const queueKey=`postmaster:${characterId}:${requestedItemKey||'all'}`;
    if(queuedVaultActionKeys.has(queueKey)){setStatus('That exact Postmaster pull is already queued.');return;}
    queuedVaultActionKeys.add(queueKey);vaultActionQueue.push({kind:'postmaster',intent,queueKey,itemKeys:items.map(itemKey)});
    setStatus(`Pulling ${items.length===1?items[0].name:`${items.length} exact items`} from ${characterLabel(characterId)} Postmaster. Waiting for Bungie inventory feedback.`);
    void performPendingVaultAction();
  }catch(error){setStatus(error?.message||'The Postmaster pull could not be queued.','error');}
}

function transferToActiveCharacter(requestedItemKey){
  const item=workspaceItem(requestedItemKey);
  if(!item||!activeCharacterId)return;
  const sourceCharacterId=text(item.source?.characterId);
  if(item.source?.kind!=='vault'&&sourceCharacterId===activeCharacterId)return;
  stageTransfer(item,{kind:'character',characterId:activeCharacterId});
}

function actionFailureMessage(result){
  const failures=[...(result?.steps||[])].reverse().filter(row=>['failed','mismatch','blocked'].includes(row.status)),failed=failures.find(row=>row.phase!=='readback')||failures[0],detail=failed?.detail;
  return detail?.payload?.Message||detail?.message||(Array.isArray(detail)?detail[0]:'')||failed?.label||'Bungie did not confirm the requested inventory state.';
}

async function refreshAfterLiveAction(liveInventory=null){
  const live=liveInventory||await requestFreshProfile(),next={...payload,...live,profile:{...(payload?.profile||{}),...(live?.profile||{})},definitions:payload?.definitions||{},damageDefinitions:payload?.damageDefinitions||{},breakerDefinitions:payload?.breakerDefinitions||{},statDefinitions:payload?.statDefinitions||{},collectibleDefinitions:payload?.collectibleDefinitions||{},gearAssets:payload?.gearAssets||{}};
  await applyVaultRefresh(next,{reason:'mutation'});
}

// Every move ends within a fixed time: a tick, or a plain reason with the tile back
// where Bungie last showed it. Same transfer path as the item card and tap actions.
const LIVE_ACTION_DEADLINE_MS=30000,LIVE_REQUEST_TIMEOUT_MS=12000;
function boundedLiveFetch(signal,seen){
  return async(input,init={})=>{
    const response=await fetch(input,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS)])});
    // Keep Bungie's own refusal so a timed-out move can still say why.
    if(String(init.method||'').toUpperCase()==='POST')response.clone().json().then(body=>{if(body&&Number(body.ErrorCode)>1&&body.Message)seen.message=String(body.Message);}).catch(()=>{});
    return response;
  };
}
// After a deadline, one fresh read decides: the item is at the destination (done) or not (failed).
async function settleTransfer(action){
  const intent=action.intent,live=await requestFreshProfile({scope:'inventory',fetchImpl:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS)})});
  const location=inventoryLocations(live).locations.get(String(intent?.item?.itemInstanceId||''))?.source,destination=intent?.destination||{};
  const arrived=Boolean(location)&&(destination.kind==='vault'?location.kind==='vault':['carried','equipped'].includes(location.kind)&&String(location.characterId)===String(destination.characterId));
  return {arrived,live};
}

async function performPendingVaultAction(){
  if(vaultActionBusy)return;
  if(!pendingVaultAction)pendingVaultAction=vaultActionQueue.shift()||null;
  if(!pendingVaultAction)return;
  const action=pendingVaultAction,confirm=byId('vaultActionConfirm'),cancel=byId('vaultActionCancel'),progress=byId('vaultActionProgress');
  vaultActionBusy=true;
  if(confirm)confirm.disabled=true;
  if(cancel)cancel.disabled=true;
  if(progress)progress.textContent='Transferring…';
  let result=null,expired=false;
  const abort=new AbortController(),seen={message:''},fetchImpl=boundedLiveFetch(abort.signal,seen);
  let deadline=null;
  try{
    const onProgress=row=>{if(expired)return;const label=row.label||'Waiting for Bungie confirmation.';if(progress)progress.textContent=label;transferFeedback.progress(action.queueKey,row);setStatus(label);};
    // Show the move as done the moment Bungie accepts it; the fresh readback continues behind it.
    const onAccepted=async({liveInventory})=>{if(expired)return;if(action.kind==='transfer')transferFeedback.accept(action.queueKey);setStatus('Item moved.','good');await refreshAfterLiveAction(liveInventory);};
    const running=action.kind==='transfer'
      ?executeVaultTransferIntent(confirmVaultTransferIntent(action.intent),{session,fetchImpl,onProgress,onAccepted})
      :executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(action.intent),{session,fetchImpl,onProgress});
    running.catch(()=>{});
    result=await Promise.race([running,new Promise((_,reject)=>{deadline=setTimeout(()=>{expired=true;abort.abort();reject(Object.assign(new Error('Bungie did not confirm the move in time.'),{deadline:true}));},LIVE_ACTION_DEADLINE_MS);})]);
    clearTimeout(deadline);
    const confirmed=result.status==='applied'&&result.readback?.verified,failure=action.kind==='postmaster'&&!confirmed?vaultPostmasterFailure(result):null;
    if(action.kind==='postmaster')for(const key of action.itemKeys||[]){if(confirmed)postmasterFailures.delete(key);else if(failure)postmasterFailures.set(key,failure);}
    if(result.attemptCount>0||result.mutationCount>0||result.readback?.verified)await refreshAfterLiveAction(result.liveInventory);
    else if(failure)renderTransferWorkspace();
    transferFeedback.finish(action.queueKey,{success:confirmed,error:failure?.reason||actionFailureMessage(result)});
    if(confirmed)setStatus(action.kind==='transfer'?'Transfer complete.':'Collected from Postmaster.','good');
    else setStatus(`${result.status==='partial'?'Live action partially completed':'No live change confirmed'}: ${failure?.reason||actionFailureMessage(result)}`,'error');
  }catch(error){
    clearTimeout(deadline);expired=true;abort.abort();
    if(action.kind==='transfer'){
      // Decide from Bungie's own inventory, then show it: a moved item lands, anything else goes back.
      let settled=null;try{settled=await settleTransfer(action);}catch{}
      if(settled){try{await refreshAfterLiveAction(settled.live);}catch{}}
      if(settled?.arrived){transferFeedback.finish(action.queueKey,{success:true});setStatus('Transfer complete.','good');return;}
      const reason=seen.message||(error?.deadline?error.message:error?.payload?.Message||error?.message)||'Bungie did not confirm the move.';
      transferFeedback.finish(action.queueKey,{success:false,error:reason});
      setStatus(`No move confirmed: ${reason}`,'error');
      return;
    }
    if(result?.attemptCount>0||result?.mutationCount>0)try{await refreshAfterLiveAction();}catch{}
    const failure=action.kind==='postmaster'?vaultPostmasterFailure(null,error):null;
    if(failure){for(const key of action.itemKeys||[])postmasterFailures.set(key,failure);renderTransferWorkspace();}
    transferFeedback.finish(action.queueKey,{success:false,error:failure?.reason||error?.payload?.Message||error?.message});
    setStatus(failure?.reason||error?.message||'The Bungie action failed before confirmation.','error');
  }finally{
    vaultActionBusy=false;
    if(confirm)confirm.disabled=false;
    if(cancel)cancel.disabled=false;
    if(byId('vaultActionDialog')?.open)byId('vaultActionDialog').close();
    queuedVaultActionKeys.delete(action.queueKey);pendingVaultAction=null;
    if(vaultActionQueue.length)void performPendingVaultAction();
  }
}

function itemCompatible(item){return !activeCharacterClass||item?.characterClass==='any'||item?.characterClass===activeCharacterClass;}

function selectedKeySet(){return new Set([...selectedSlots.values()].map(itemKey));}

function selectionSlotMarkup(slot,index){
  const item=selectedSlots.get(index);
  return `<div class="vault-selection-slot" data-selection-slot="${index}">${item?`<span class="vault-selection-inspect" data-inspect-item="${esc(itemKey(item))}" tabindex="0" title="${esc(item.name)}">${itemTileMarkup(item,{kind:'armour'})}</span>`:'<span class="vault-slot-empty" aria-hidden="true">◇</span>'}<span><b>${esc(item?.name||slot.label)}</b><small>${esc(item?`${item.source?.label||'Items'} · ${item.totalStats} total`:'No item staged')}</small></span></div>`;
}

function bindVaultItemInspectors(root){
  root?.querySelectorAll?.('[data-inspect-item]').forEach(target=>bindParadoxItemInspect(target,inspectedItem(target.dataset.inspectItem),'armour'));
}

function renderSelection(){
  byId('vaultSelectionSlots').innerHTML=ARMOUR_BUCKETS.map(selectionSlotMarkup).join('');
  bindVaultItemInspectors(byId('vaultSelectionSlots'));
  const count=selectedSlots.size;
  byId('vaultSelectionStatus').textContent=count?`${count} of ${ARMOUR_BUCKETS.length} armour slots staged for ${activeCharacterClass||'selected Guardian'}`:'No armour selected';
  byId('vaultClearSelection').disabled=!count;
  byId('vaultEvaluate').disabled=!count||!activeCharacterId;
}

function filters(){
  return {
    search:byId('vaultSearch')?.value||'',
    characterClass:byId('vaultClassFilter')?.value||'all',
    slot:byId('vaultSlotFilter')?.value||'all',
    source:byId('vaultSourceFilter')?.value||'all'
  };
}

function optimiserItems(){return catalogue.armour.filter(itemCompatible);}

function targetValues(){
  return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>{
    const input=document.querySelector(`[data-target-stat="${key}"] input`);
    return [key,Number(input?.value||0)];
  }));
}

function targetCount(){return ARMOUR_STAT_KEYS.filter(key=>Number(targetValues()[key])>0).length;}

function updateTargetControl(label){
  const key=label?.dataset?.targetStat;
  const input=label?.querySelector('input');
  const output=label?.querySelector('output');
  if(!key||!input||!output)return;
  output.textContent=`${input.value} / ${targetMaximums[key]||'—'}`;
}

function configureOptimiser({reset=false}={}){
  const items=optimiserItems();
  targetMaximums=armourTargetMaximums(items);
  for(const label of document.querySelectorAll('[data-target-stat]')){
    const key=label.dataset.targetStat;
    const input=label.querySelector('input');
    if(!input)continue;
    const maximum=Number(targetMaximums[key]||0);
    input.max=String(maximum);
    input.disabled=maximum<=0;
    input.value=String(reset?0:Math.min(maximum,Number(input.value||0)));
    updateTargetControl(label);
  }
  const classLabel=activeCharacterClass?activeCharacterClass.toUpperCase():'SELECTED GUARDIAN';
  byId('vaultOptimiserClass').textContent=`${classLabel} · ${items.length} PIECES`;
  const hasRanges=ARMOUR_STAT_KEYS.some(key=>targetMaximums[key]>0);
  byId('vaultFindBuilds').disabled=!hasRanges||targetCount()===0;
  byId('vaultResetTargets').disabled=!hasRanges||targetCount()===0;
  byId('vaultOptimiserStatus').textContent=hasRanges?'Set one or more stat targets, then find the five closest sets.':'No recognised Armour 3.0 stat values were returned for this Guardian.';
  if(reset){matchedBuilds=[];renderCandidateBuilds();}
}

function candidateStatsMarkup(stats={}){
  return `<div class="vault-candidate-stats">${ARMOUR_STAT_KEYS.map(key=>`<span>${esc(ARMOUR_STAT_LABELS[key])}<b>${Number(stats[key]||0)}</b></span>`).join('')}</div>`;
}

function candidateItemMarkup(item){
  return `<article class="vault-candidate-item"><span class="vault-candidate-inspect" data-inspect-item="${esc(itemKey(item))}" tabindex="0" title="${esc(item.name)}">${itemTileMarkup(item,{kind:'armour'})}</span><span><b>${esc(item.name)}</b><small>${esc(`${item.slotLabel} · ${item.source?.label||'Items'}`)}</small></span></article>`;
}

function candidateMarkup(candidate,index){
  const result=candidate.score;
  const outcome=result.met?'ALL TARGETS MET':`${result.shortfall} TOTAL POINT${result.shortfall===1?'':'S'} SHORT`;
  return `<article class="vault-candidate${result.met?' is-target-met':''}"><div class="vault-candidate-rank"><b>MATCH ${index+1}</b><small>${esc(outcome)}</small><small>${result.total} total armour stats</small></div><div><div class="vault-candidate-items">${candidate.items.map(candidateItemMarkup).join('')}</div>${candidateStatsMarkup(candidate.stats)}</div><button class="vault-candidate-select" type="button" data-candidate-build="${index}">SELECT THIS SET</button></article>`;
}

function renderCandidateBuilds(){
  const host=byId('vaultCandidateBuilds');
  if(!host)return;
  host.hidden=matchedBuilds.length===0;
  host.innerHTML=matchedBuilds.map(candidateMarkup).join('');
  bindVaultItemInspectors(host);
}

async function findCandidateBuilds(){
  const targets=targetValues();
  if(!ARMOUR_STAT_KEYS.some(key=>targets[key]>0))return;
  const button=byId('vaultFindBuilds');
  button.disabled=true;
  button.textContent='CALCULATING SETS…';
  byId('vaultOptimiserStatus').textContent='Comparing item instances across all five armour slots…';
  await new Promise(resolve=>requestAnimationFrame(resolve));
  matchedBuilds=matchArmourBuilds(optimiserItems(),targets,{limit:5});
  renderCandidateBuilds();
  button.textContent='FIND 5 CLOSEST SETS';
  button.disabled=false;
  byId('vaultOptimiserStatus').textContent=matchedBuilds.length?`${matchedBuilds.length} closest complete set${matchedBuilds.length===1?'':'s'} found. Select one to stage its exact item instances.`:'No complete five-slot armour set is available for this Guardian.';
}

function selectCandidateBuild(index){
  const candidate=matchedBuilds[Number(index)];
  if(!candidate)return;
  selectedSlots.clear();
  for(const item of candidate.items)selectedSlots.set(item.slotIndex,item);
  renderSelection();
  renderInventory();
  setStatus(`Armour Picker match ${Number(index)+1} staged · ${candidate.score.total} total stats · ${candidate.score.met?'all requested targets met':`${candidate.score.shortfall} requested points short`}.`,'good');
  byId('vaultSelectionSlots')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function resetTargets(){
  for(const input of document.querySelectorAll('[data-target-stat] input'))input.value='0';
  configureOptimiser({reset:true});
}

function inspectedItem(key){return catalogue.armour.find(item=>itemKey(item)===String(key||''))||null;}

function itemMarkup(item){
  const compatible=itemCompatible(item);
  const className=['vault-item',item.isExotic?'is-exotic':'',compatible?'':'is-incompatible'].filter(Boolean).join(' ');
  return `<article class="${className}" title="${esc(item.name)}"><span class="vault-item-inspect" data-inspect-item="${esc(itemKey(item))}" tabindex="0">${itemTileMarkup(item,{kind:'armour'})}</span><button type="button" data-select-armour-item="${esc(itemKey(item))}" ${compatible?'':`disabled aria-label="${esc(item.name)} is not compatible with the selected ${activeCharacterClass||'Guardian'}"`}>${itemKey(selectedSlots.get(item.slotIndex))===itemKey(item)?'SELECTED':'SELECT'}</button></article>`;
}

function renderInventory(){
  const rows=filterVaultArmour(catalogue.armour,filters());
  const visible=rows.slice(0,visibleLimit);
  byId('vaultResultCount').textContent=`${rows.length} ITEM${rows.length===1?'':'S'}`;
  byId('vaultItemGrid').innerHTML=visible.length?visible.map(item=>itemMarkup(item)).join(''):'<div class="vault-empty">No armour matches these filters.</div>';
  bindVaultItemInspectors(byId('vaultItemGrid'));
  const loadMore=byId('vaultLoadMore');
  loadMore.hidden=visible.length>=rows.length;
  if(!loadMore.hidden)loadMore.textContent=`LOAD ${Math.min(PAGE_SIZE,rows.length-visible.length)} MORE ARMOUR`;
}

function postmasterStatus(){
  const count=Number(catalogue.postmasterByCharacter?.[activeCharacterId]||0);
  if(count)return ` · Postmaster reports ${count} item${count===1?'':'s'}`;
  return '';
}

function renderContext(){
  const source=text(params.get('from'));
  const character=selectedCharacter();
  const classLabel=activeCharacterClass?activeCharacterClass[0].toUpperCase()+activeCharacterClass.slice(1):'Guardian';
  byId('vaultReturnContext').textContent=`Browse ${classLabel} armour visually. Open Forge Loader to calculate and stage an armour combination.`;
  byId('vaultHeaderState').textContent=character?`${classLabel.toUpperCase()} INVENTORY`:'BUNGIE INVENTORY';
}

function renderAll(){renderContext();renderTransferWorkspace();renderSelection();renderInventory();}

function reconcileSelectedVaultItems(){
  const refreshedByKey=new Map(catalogue.armour.map(item=>[itemKey(item),item]));
  for(const [slot,item] of [...selectedSlots]){
    const refreshed=refreshedByKey.get(itemKey(item));
    if(refreshed)selectedSlots.set(slot,refreshed);
    else selectedSlots.delete(slot);
  }
  clearIncompatibleSelection();
}

async function applyVaultRefresh(next,{reason='poll'}={}){
  assertRenderablePagePayload(next,'vault');
  await guardianManifest.hydratePayload(next,{waitForManifest:false,includeReusable:true,allowNetwork:false});
  const classFilter=byId('vaultClassFilter')?.value||'all';
  payload=next;
  catalogue=createVaultCatalogue(payload);
  resolveActiveCharacter(activeCharacterId);
  if(byId('vaultClassFilter'))byId('vaultClassFilter').value=classFilter;
  reconcileSelectedVaultItems();
  matchedBuilds=[];
  renderCandidateBuilds();
  configureOptimiser();
  updateTotals();
  renderAll();
  setStatus(reason==='manual'?'Vault refreshed.':'Vault updated from Bungie.','good');
  document.dispatchEvent(new CustomEvent('forge:prepared-page-refreshed',{detail:{page:'vault',payload:next}}));
  return next;
}

function startVaultRefresh(){
  if(vaultRefreshController)return;
  vaultRefreshController=createPreparedPageRefreshController({
    session,
    page:'vault',
    refresh:async options=>applyVaultRefresh(await fetchProfile(),options),
    onError:error=>console.info('[Forge Vault] background inventory refresh unavailable',error)
  });
  const button=byId('vaultRefreshButton');
  bindPreparedPageRefreshControl(button,vaultRefreshController,{
    onError:error=>setStatus(error?.message||'Vault refresh unavailable.','error')
  });
  if(button){
    document.getElementById('bungieAuthControl')?.prepend(button);
    button.hidden=false;
  }
  vaultRefreshController.start();
}

function selectItem(key){
  const item=catalogue.armour.find(row=>itemKey(row)===key);
  if(!item||!itemCompatible(item))return;
  if(itemKey(selectedSlots.get(item.slotIndex))===itemKey(item))selectedSlots.delete(item.slotIndex);
  else selectedSlots.set(item.slotIndex,item);
  renderSelection();
  renderInventory();
}

function evaluateInBuildForge(){
  if(!selectedSlots.size||!activeCharacterId)return;
  const selected=prepareArmourSelection(payload,[...selectedSlots.values()]);
  const selection=createVaultArmourSelection({binding:membershipBinding(),slots:selected.map(item=>({slot:item.slotIndex,item})),sourcePage:text(params.get('from'))||'vault'});
  if(!writeVaultArmourSelection(selection)){
    setStatus('The staged armour could not be stored on this device. No build was changed.','error');
    return;
  }
  const url=new URL('../guardian-workspace-v2/paradox-build-space/',location.href);
  url.searchParams.set('vault','selection');
  const binding=membershipBinding();
  for(const [key,value] of Object.entries(binding))if(value)url.searchParams.set(key,value);
  markGuardianFastReturn();
  location.href=url;
}

function clearIncompatibleSelection(){
  for(const [slot,item] of selectedSlots)if(!itemCompatible(item))selectedSlots.delete(slot);
}

function dropDestination(target){
  target=target?.closest?.('[data-drop-kind]');
  if(!target)return null;
  return target.dataset.dropKind==='vault'?{kind:'vault',characterId:null}:{kind:'character',characterId:text(target.dataset.dropCharacterId)};
}

function validDrop(item,destination){
  if(!item||!destination)return false;
  if(destination.kind==='vault')return item.source?.kind!=='vault';
  return destination.characterId&&!(item.source?.kind!=='vault'&&text(item.source?.characterId)===destination.characterId);
}

function validFeedbackDrop(item,destination){
  if(!validDrop(item,destination)||liveActionCapabilities(session).transferItems!==true)return false;
  if(item.source?.kind==='equipped'&&liveActionCapabilities(session).equipItems!==true)return false;
  if(destination.kind==='character'){
    const targetClass=characterClass(characters().find(row=>text(row.characterId)===destination.characterId));
    if(item.characterClass&&item.characterClass!=='any'&&item.characterClass!==targetClass)return false;
  }
  try{stageVaultTransferIntent({item,destination,session,replacementItem:item.source?.kind==='equipped'?carriedReplacement(item):null});return true;}catch{return false;}
}
function clearDropTargets(){transferFeedback.clearDrag();}

function installTransferEvents(){
  const board=byId('vaultTransferWorkspace');
  let pointerDrag=null;
  const pointerTarget=(x,y)=>document.elementFromPoint(x,y)?.closest?.('.vault-transfer-group')||null;
  const updatePointerTarget=(x,y)=>{
    const target=pointerTarget(x,y),item=workspaceItem(pointerDrag?.key),destination=dropDestination(target);
    transferFeedback.hover(target);
    return {target,item,destination};
  };
  board?.addEventListener('dragstart',event=>{
    const tile=event.target.closest?.('[data-drag-item]'),item=workspaceItem(tile?.dataset?.dragItem);
    if(!tile||!item||transferFeedback.isMoving(itemKey(item))){event.preventDefault();return;}
    draggedItemKey=itemKey(item);
    tile.classList.add('is-dragging');
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',draggedItemKey);
    transferFeedback.startDrag(item,tile,event);
  });
  board?.addEventListener('dragend',event=>{
    event.target.closest?.('[data-drag-item]')?.classList.remove('is-dragging');
    draggedItemKey='';
    clearDropTargets();
  });
  board?.addEventListener('dragover',event=>{
    const target=event.target.closest?.('.vault-transfer-group'),item=workspaceItem(draggedItemKey),destination=dropDestination(target);
    transferFeedback.hover(target);
    if(!validDrop(item,destination)||!transferFeedback.validTarget(item,target))return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    target.classList.add('is-drop-target');
  });
  board?.addEventListener('dragleave',event=>{
    const target=event.target.closest?.('.vault-transfer-group');
    if(target&&!target.contains(event.relatedTarget))target.classList.remove('is-drop-target');
  });
  board?.addEventListener('drop',event=>{
    const target=event.target.closest?.('.vault-transfer-group'),key=draggedItemKey||event.dataTransfer.getData('text/plain'),item=workspaceItem(key),destination=dropDestination(target);
    clearDropTargets();
    draggedItemKey='';
    if(!validDrop(item,destination)||!transferFeedback.validTarget(item,target))return;
    event.preventDefault();
    stageTransfer(item,destination);
  });
  board?.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||event.button!==0||event.target.closest?.('button'))return;
    const tile=event.target.closest?.('[data-drag-item]'),item=workspaceItem(tile?.dataset?.dragItem);
    if(!tile||!item||transferFeedback.isMoving(itemKey(item)))return;
    pointerDrag={pointerId:event.pointerId,key:itemKey(item),tile,startX:event.clientX,startY:event.clientY,active:false};
    tile.setPointerCapture?.(event.pointerId);
  });
  board?.addEventListener('pointermove',event=>{
    if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
    if(!pointerDrag.active&&Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)<8)return;
    if(!pointerDrag.active)transferFeedback.startDrag(workspaceItem(pointerDrag.key),pointerDrag.tile,event);
    pointerDrag.active=true;
    transferFeedback.moveGhost(event.clientX,event.clientY);
    event.preventDefault();
    pointerDrag.tile.classList.add('is-dragging');
    updatePointerTarget(event.clientX,event.clientY);
  },{passive:false});
  const finishPointerDrag=event=>{
    if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
    const drag=pointerDrag,result=drag.active?updatePointerTarget(event.clientX,event.clientY):null;
    drag.tile.classList.remove('is-dragging');
    drag.tile.releasePointerCapture?.(event.pointerId);
    pointerDrag=null;
    clearDropTargets();
    if(result&&validDrop(result.item,result.destination)&&transferFeedback.validTarget(result.item,result.target)){event.preventDefault();stageTransfer(result.item,result.destination);}
  };
  board?.addEventListener('pointerup',finishPointerDrag);
  board?.addEventListener('pointercancel',event=>{
    if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
    pointerDrag.tile.classList.remove('is-dragging');
    pointerDrag=null;
    clearDropTargets();
  });
  bindInventoryWorkspaceInteractions(board,{onPullItem:stagePostmasterCollection,onPullAll:stagePostmasterCollection,onItemDoubleClick:transferToActiveCharacter});
}

function installEvents(){
  byId('vaultFilters')?.addEventListener('input',()=>{visibleLimit=PAGE_SIZE;renderInventory();});
  byId('vaultItemGrid')?.addEventListener('click',event=>{const button=event.target.closest('[data-select-armour-item]');if(button&&!button.disabled)selectItem(button.dataset.selectArmourItem);});
  byId('vaultStatTargets')?.addEventListener('input',event=>{
    const label=event.target.closest('[data-target-stat]');
    if(!label)return;
    updateTargetControl(label);
    matchedBuilds=[];
    renderCandidateBuilds();
    const count=targetCount();
    byId('vaultFindBuilds').disabled=count===0;
    byId('vaultResetTargets').disabled=count===0;
    byId('vaultOptimiserStatus').textContent=count?`${count} target stat${count===1?'':'s'} active. Find the five closest complete sets.`:'Set one or more stat targets.';
  });
  byId('vaultFindBuilds')?.addEventListener('click',findCandidateBuilds);
  byId('vaultResetTargets')?.addEventListener('click',resetTargets);
  byId('vaultCandidateBuilds')?.addEventListener('click',event=>{const button=event.target.closest('[data-candidate-build]');if(button)selectCandidateBuild(button.dataset.candidateBuild);});
  byId('vaultClearSelection')?.addEventListener('click',()=>{selectedSlots.clear();renderAll();});
  byId('vaultEvaluate')?.addEventListener('click',evaluateInBuildForge);
  byId('vaultLoadMore')?.addEventListener('click',()=>{visibleLimit+=PAGE_SIZE;renderInventory();});
  document.addEventListener('forge:character-selected',event=>{
    resolveActiveCharacter(event.detail?.characterId);
    clearIncompatibleSelection();
    visibleLimit=PAGE_SIZE;
    configureOptimiser({reset:true});
    renderAll();
    setStatus(`${activeCharacterClass.toUpperCase()} inventory active${postmasterStatus()}.`,'good');
  });
  document.addEventListener('forge:manifest-progress',()=>reportPreparedPageStage('request','vault'));
}

async function settleVisibleImages(){
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  // Ready means the first screen: only images inside the viewport. Lazy images further down never
  // load until scrolled to, so waiting on them only ran out the cap.
  const onScreen=image=>{const box=image.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth;};
  const images=[...document.querySelectorAll('#vaultTransferWorkspace img')].filter(image=>!image.complete&&onScreen(image)).slice(0,24);
  await Promise.race([
    Promise.all(images.map(image=>new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))),
    new Promise(resolve=>setTimeout(resolve,3500))
  ]);
}

async function init(){
  installEvents();
  installTransferEvents();
  bindItemSheet(byId('vaultTransferWorkspace'),{resolveItem:workspaceItem,actionsFor:itemActions,subtitleFor:itemSubtitle});

  try{
    session=await getBungieSession({force:true});
    if(session?.authenticated==null){
      byId('vaultSignedOut').hidden=true;
      byId('vaultConnectionState').textContent='CONNECTION UNAVAILABLE';
      setStatus('Bungie is not responding. Retry');
      globalThis.ForgeLoader?.authResolved?.();
      globalThis.ForgeLoader?.done?.();
      return;
    }
    if(session?.authenticated===false){
      byId('vaultConnectButton').href=authStartUrl();
      byId('vaultSignedOut').hidden=false;
      byId('vaultConnectionState').textContent='SIGNED OUT';
      byId('vaultHeaderState').textContent='CONNECT BUNGIE';
      setStatus('Connect Bungie to load your inventory.');
      globalThis.ForgeLoader?.authRequired?.(authStartUrl());
      return;
    }
    byId('vaultConnectionState').textContent='INVENTORY READY';
    payload=await loadVerifiedPayload();
    reportPreparedPageStage('render','vault');
    catalogue=createVaultCatalogue(payload);
    resolveActiveCharacter(activeCharacterId);
    configureOptimiser({reset:true});
    const requestedSlot=text(params.get('slot'));
    if(ARMOUR_BUCKETS.some(slot=>slot.key===requestedSlot))byId('vaultSlotFilter').value=requestedSlot;
    updateTotals();
    renderAll();
    startVaultRefresh();
    reportPreparedPageStage('render','vault');
    const unresolved=catalogue.totals.unresolvedDefinitions;
    const capabilities=liveActionCapabilities(session),liveReady=capabilities.transferItems&&capabilities.equipItems&&capabilities.pullFromPostmaster;
    setStatus(`${catalogue.items.length} exact grouped inventory item${catalogue.items.length===1?'':'s'} loaded across ${characters().length} Guardian${characters().length===1?'':'s'} and Vault${unresolved?` · ${unresolved} item definition${unresolved===1?'':'s'} unresolved`:''}. Live transfer ${liveReady?'ready':'unavailable for this session'}.`,'good');
    await settleVisibleImages();
    globalThis.ForgeLoader?.done?.();
    void refreshAfterLiveAction().catch(error=>console.info('[Forge Vault] initial live inventory overlay unavailable',error));
  }catch(error){
    console.error('[Forge Vault]',error);
    byId('vaultConnectionState').textContent='INVENTORY UNAVAILABLE';
    setStatus(error?.message||'Bungie inventory is unavailable.','error');
    globalThis.ForgeLoader?.status?.(error?.message||'Bungie inventory is unavailable.');
    globalThis.ForgeLoader?.blocked?.(error?.message||'Bungie inventory is unavailable.');
  }
}

init();
