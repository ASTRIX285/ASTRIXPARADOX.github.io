import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1&roll=20260909-apply-1';
import {bindPreparedPageRefreshControl,createPreparedPageRefreshController,markGuardianFastReturn} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';
import {ARMOUR_BUCKETS,createVaultCatalogue,filterVaultArmour,itemKey,prepareArmourSelection} from './vault-inventory.mjs?v=20260912-shared-item-tile-4';
import {ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector,armourTargetMaximums,matchArmourBuilds,statKey} from './vault-armour-matcher.mjs';
import {createVaultArmourSelection,writeVaultArmourSelection} from './vault-selection-state.mjs';
import {assertRenderablePagePayload} from '../../core/page-ready-contract.mjs?v=20260906-page-data-recovery-1';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&transport=20260911-compact-plugs-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';
import {bindParadoxItemHover} from '../guardian-workspace-v2/paradox-item-hover.mjs?v=20260908-icon-hover-1&weapons=20260909-presentation-1&roll=20260909-apply-1&fix=20260909-apply-refresh-1&vault=20260911-live-transfer-1';
import {confirmPostmasterCollectionIntent,confirmVaultTransferIntent,executePostmasterCollectionIntent,executeVaultTransferIntent,liveActionCapabilities,stagePostmasterCollectionIntent,stageVaultTransferIntent} from '../guardian-workspace-v2/guardian-live-actions.mjs?v=20260911-vault-live-transfer-1';
import {bindInventoryWorkspaceHovers,bindInventoryWorkspaceInteractions,equippedAndCarriedMarkup,inventoryGroupsMarkup,postmasterMarkup as sharedPostmasterMarkup} from '../../shared/guardian-inventory-workspace.mjs?v=20260912-shared-item-tile-4';

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
const selectedSlots=new Map();

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
  if(!next?.profile)throw new Error('Bungie returned no verified profile inventory.');
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
  return `<section class="vault-only-section" data-drop-kind="vault"><header><div><span>SHARED ACCOUNT STORAGE</span><h3>VAULT ONLY</h3></div><strong>${items.length} SORTED ITEM${items.length===1?'':'S'}</strong></header><p>Drop carried or equipped items here. The shared account pool stays within the width of the three Guardian columns and wraps inside each Bungie category.</p>${equipmentGroupsMarkup(items,{includeEmpty:true})}</section>`;
}

function bindVaultWorkspaceHovers(root){
  bindInventoryWorkspaceHovers(root,{resolveItem:workspaceItem,bindHover:(target,item,kind)=>bindParadoxItemHover(target,item,kind,{contextLabel:item.source?.kind==='vault'?'VAULT':''})});
}

function renderTransferWorkspace(){
  const host=byId('vaultTransferWorkspace');
  if(!host)return;
  host.innerHTML=`<div class="vault-character-columns">${workspaceCharacters().map(characterColumnMarkup).join('')}</div>${vaultOnlyMarkup()}`;
  bindVaultWorkspaceHovers(host);
}

function carriedReplacement(item){
  return catalogue.items.filter(candidate=>candidate.source?.kind==='carried'&&text(candidate.source.characterId)===text(item?.source?.characterId)&&Number(candidate.bucketHash)===Number(item?.bucketHash)&&itemKey(candidate)!==itemKey(item)).sort((left,right)=>Number(Boolean(left.isExotic))-Number(Boolean(right.isExotic))||Number(left.power||0)-Number(right.power||0)||String(left.name).localeCompare(String(right.name)))[0]||null;
}

function closeVaultActionDialog(){
  if(vaultActionBusy)return;
  const dialog=byId('vaultActionDialog');
  if(dialog?.open)dialog.close();
  pendingVaultAction=null;
  byId('vaultActionProgress').textContent='';
}

function showVaultActionDialog(title,summary,action){
  pendingVaultAction=action;
  byId('vaultActionTitle').textContent=title;
  byId('vaultActionSummary').textContent=summary;
  byId('vaultActionProgress').textContent='Review the exact account change, then confirm.';
  const dialog=byId('vaultActionDialog');
  if(typeof dialog?.showModal==='function')dialog.showModal();
  else dialog?.setAttribute('open','');
}

function stageTransfer(item,destination){
  try{
    const replacement=item?.source?.kind==='equipped'?carriedReplacement(item):null,intent=stageVaultTransferIntent({item,destination,session,replacementItem:replacement}),target=destination.kind==='vault'?'Vault':characterLabel(destination.characterId),replacementCopy=replacement?` ${replacement.name} will be equipped on ${characterLabel(item.source.characterId)} first so the currently equipped item can move.`:'';
    showVaultActionDialog('Confirm live item transfer',`Move ${item.name} from ${item.source.label||item.source.kind} to ${target}.${replacementCopy}`,{kind:'transfer',intent});
  }catch(error){setStatus(error?.message||'This live transfer cannot be staged.','error');}
}

function stagePostmasterCollection(characterId,requestedItemKey=''){
  try{
    const items=catalogue.postmasterItems.filter(item=>text(item?.source?.characterId)===text(characterId)&&/^\d+$/.test(String(item?.itemInstanceId||''))&&(!requestedItemKey||itemKey(item)===text(requestedItemKey))),intent=stagePostmasterCollectionIntent({characterId,items,session}),subject=items.length===1?items[0].name:`${items.length} exact items`;
    showVaultActionDialog('Confirm Postmaster pull',`Pull ${subject} from ${characterLabel(characterId)} Postmaster into that Guardian's Bungie inventory. If Bungie reports no room or rejects an item, its position will not change here.`,{kind:'postmaster',intent});
  }catch(error){setStatus(error?.message||'Postmaster collection cannot be staged.','error');}
}

function stageDirectEquip(requestedItemKey){
  const item=workspaceItem(requestedItemKey);
  if(!item||!activeCharacterId)return;
  try{
    if(item.source?.kind==='vault'){
      const intent=stageVaultTransferIntent({item,destination:{kind:'character',characterId:activeCharacterId},session,equipAfterTransfer:true});
      showVaultActionDialog('Confirm direct live equip',`Move ${item.name} from Vault to ${characterLabel(activeCharacterId)}, then equip that exact item. Bungie must confirm the transfer and equip before this page changes.`,{kind:'transfer',intent});
      return;
    }
    if(item.source?.kind==='postmaster'){
      const sourceCharacterId=text(item.source.characterId),intent=stagePostmasterCollectionIntent({characterId:sourceCharacterId,targetCharacterId:activeCharacterId,items:[item],session,equipAfterCollection:true});
      showVaultActionDialog('Confirm direct live equip',`Collect ${item.name} from ${characterLabel(sourceCharacterId)} Postmaster, move it to ${characterLabel(activeCharacterId)} if required, then equip that exact item. Every step must be confirmed by Bungie.`,{kind:'postmaster',intent});
    }
  }catch(error){setStatus(error?.message||'This direct live equip cannot be staged.','error');}
}

function actionFailureMessage(result){
  const failed=[...(result?.steps||[])].reverse().find(row=>['failed','mismatch','blocked'].includes(row.status)),detail=failed?.detail;
  return detail?.payload?.Message||detail?.message||(Array.isArray(detail)?detail[0]:'')||failed?.label||'Bungie did not confirm the requested inventory state.';
}

async function refreshAfterLiveAction(){
  const next=await fetchProfile();
  await applyVaultRefresh(next,{reason:'mutation'});
}

async function performPendingVaultAction(){
  if(!pendingVaultAction||vaultActionBusy)return;
  const action=pendingVaultAction,confirm=byId('vaultActionConfirm'),cancel=byId('vaultActionCancel'),progress=byId('vaultActionProgress');
  vaultActionBusy=true;
  confirm.disabled=true;
  cancel.disabled=true;
  progress.textContent='Running fresh Bungie preflight. No local item position has changed.';
  let result=null;
  try{
    const onProgress=row=>{progress.textContent=row.label||'Waiting for Bungie confirmation.';};
    result=action.kind==='transfer'
      ?await executeVaultTransferIntent(confirmVaultTransferIntent(action.intent),{session,onProgress})
      :await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(action.intent),{session,onProgress});
    if(result.mutationCount>0)await refreshAfterLiveAction();
    if(result.status==='applied'&&result.readback?.verified)setStatus(action.kind==='transfer'?'Live transfer confirmed by Bungie and fresh inventory readback.':'Postmaster collection confirmed by Bungie and fresh inventory readback.','good');
    else setStatus(`${result.status==='partial'?'Live action partially completed':'No live change confirmed'}: ${actionFailureMessage(result)}`,'error');
  }catch(error){
    if(result?.mutationCount>0)try{await refreshAfterLiveAction();}catch{}
    setStatus(error?.message||'The Bungie action failed before confirmation.','error');
  }finally{
    vaultActionBusy=false;
    confirm.disabled=false;
    cancel.disabled=false;
    if(byId('vaultActionDialog')?.open)byId('vaultActionDialog').close();
    pendingVaultAction=null;
  }
}

function itemCompatible(item){return !activeCharacterClass||item?.characterClass==='any'||item?.characterClass===activeCharacterClass;}

function selectedKeySet(){return new Set([...selectedSlots.values()].map(itemKey));}

function selectionSlotMarkup(slot,index){
  const item=selectedSlots.get(index);
  return `<div class="vault-selection-slot" data-selection-slot="${index}"${item?` data-inspect-item="${esc(itemKey(item))}" tabindex="0"`:''}>${item?.icon?`<img src="${esc(item.icon)}" alt="">`:'<span class="vault-slot-empty" aria-hidden="true">◇</span>'}<span><b>${esc(item?.name||slot.label)}</b><small>${esc(item?`${item.source?.label||'Owned'} · ${item.totalStats} total`:'No item staged')}</small></span></div>`;
}

function bindVaultItemHovers(root){
  root?.querySelectorAll?.('[data-inspect-item]').forEach(target=>bindParadoxItemHover(target,inspectedItem(target.dataset.inspectItem),'armour'));
}

function renderSelection(){
  byId('vaultSelectionSlots').innerHTML=ARMOUR_BUCKETS.map(selectionSlotMarkup).join('');
  bindVaultItemHovers(byId('vaultSelectionSlots'));
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
  byId('vaultOptimiserClass').textContent=`${classLabel} · ${items.length} OWNED PIECES`;
  const hasRanges=ARMOUR_STAT_KEYS.some(key=>targetMaximums[key]>0);
  byId('vaultFindBuilds').disabled=!hasRanges||targetCount()===0;
  byId('vaultResetTargets').disabled=!hasRanges||targetCount()===0;
  byId('vaultOptimiserStatus').textContent=hasRanges?'Set one or more verified stat targets, then find the five closest sets.':'No recognised Armour 3.0 stat values were returned for this Guardian.';
  if(reset){matchedBuilds=[];renderCandidateBuilds();}
}

function statLineMarkup(item){
  const stats=armourStatVector(item);
  const strongest=ARMOUR_STAT_KEYS.map(key=>({key,value:Number(stats[key]||0)})).filter(row=>row.value>0).sort((left,right)=>right.value-left.value).slice(0,3);
  return strongest.length?`<span class="vault-item-statline">${strongest.map(row=>`<span>${esc(ARMOUR_STAT_LABELS[row.key].slice(0,3).toUpperCase())}<strong>${row.value}</strong></span>`).join('')}</span>`:'';
}

function candidateStatsMarkup(stats={}){
  return `<div class="vault-candidate-stats">${ARMOUR_STAT_KEYS.map(key=>`<span>${esc(ARMOUR_STAT_LABELS[key])}<b>${Number(stats[key]||0)}</b></span>`).join('')}</div>`;
}

function candidateItemMarkup(item){
  return `<button type="button" class="vault-candidate-item" data-inspect-item="${esc(itemKey(item))}" aria-label="Inspect ${esc(item.name)}"><img src="${esc(item.icon)}" alt="" loading="lazy"><span><b>${esc(item.name)}</b><small>${esc(`${item.slotLabel} · ${item.source?.label||'Owned'}`)}</small></span></button>`;
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
  bindVaultItemHovers(host);
}

async function findCandidateBuilds(){
  const targets=targetValues();
  if(!ARMOUR_STAT_KEYS.some(key=>targets[key]>0))return;
  const button=byId('vaultFindBuilds');
  button.disabled=true;
  button.textContent='CALCULATING VERIFIED SETS…';
  byId('vaultOptimiserStatus').textContent='Comparing exact owned item instances across all five armour slots…';
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
  const setName=item.setBonus?.identity?.name||'';
  const seasonIcon=item?.releaseWatermark?.icon||item?.tierIcon||'';
  const armourTier=Math.max(0,Math.min(5,Number(item?.armourTier)||0));
  const className=['vault-item',item.isExotic?'is-exotic':'',compatible?'':'is-incompatible'].filter(Boolean).join(' ');
  return `<button type="button" class="${className}" data-inspect-item="${esc(itemKey(item))}" data-armour-slot="${item.slotIndex}" ${compatible?`aria-label="Inspect ${esc(item.name)}"`:`aria-disabled="true" aria-label="${esc(item.name)} is not compatible with the selected ${activeCharacterClass||'Guardian'}"`}>
    <span class="vault-item-art">${item.icon?`<img src="${esc(item.icon)}" alt="" loading="lazy" decoding="async">`:''}${seasonIcon||armourTier?`<span class="vault-item-tier-rail">${seasonIcon?`<span class="vault-item-season-icon" title="Bungie season/source emblem"><img src="${esc(seasonIcon)}" alt=""></span>`:''}${Array.from({length:armourTier},()=>'<i class="vault-item-tier-diamond" aria-hidden="true"></i>').join('')}</span>`:''}${item.power!==null?`<span class="vault-item-power">✦ ${esc(item.power)}</span>`:''}<span class="vault-item-source">${esc(String(item.source?.label||'Owned').toUpperCase())}</span><span class="vault-item-total">Σ ${item.totalStats}</span></span>
    <span class="vault-item-copy"><b>${esc(item.name)}</b><small>${esc(`${item.slotLabel} · ${item.characterClass==='any'?'Any class':item.characterClass}`)}</small>${setName?`<small class="vault-item-set">${esc(setName)}</small>`:''}${statLineMarkup(item)}</span>
  </button>`;
}

function renderInventory(){
  const rows=filterVaultArmour(catalogue.armour,filters());
  const visible=rows.slice(0,visibleLimit);
  byId('vaultResultCount').textContent=`${rows.length} VERIFIED ITEM${rows.length===1?'':'S'}`;
  byId('vaultItemGrid').innerHTML=visible.length?visible.map(item=>itemMarkup(item)).join(''):'<div class="vault-empty">No verified armour matches these filters.</div>';
  bindVaultItemHovers(byId('vaultItemGrid'));
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
  byId('vaultReturnContext').textContent=`Browse verified ${classLabel} armour visually. Open Forge Loader to calculate and stage an armour combination.`;
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
  if(!target)return null;
  return target.dataset.dropKind==='vault'?{kind:'vault',characterId:null}:{kind:'character',characterId:text(target.dataset.dropCharacterId)};
}

function validDrop(item,destination){
  if(!item||!destination)return false;
  if(destination.kind==='vault')return item.source?.kind!=='vault';
  return destination.characterId&&!(item.source?.kind!=='vault'&&text(item.source?.characterId)===destination.characterId);
}

function clearDropTargets(){
  document.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));
}

function installTransferEvents(){
  const board=byId('vaultTransferWorkspace');
  board?.addEventListener('dragstart',event=>{
    const tile=event.target.closest?.('[data-drag-item]'),item=workspaceItem(tile?.dataset?.dragItem);
    if(!tile||!item){event.preventDefault();return;}
    draggedItemKey=itemKey(item);
    tile.classList.add('is-dragging');
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',draggedItemKey);
  });
  board?.addEventListener('dragend',event=>{
    event.target.closest?.('[data-drag-item]')?.classList.remove('is-dragging');
    draggedItemKey='';
    clearDropTargets();
  });
  board?.addEventListener('dragover',event=>{
    const target=event.target.closest?.('[data-drop-kind]'),item=workspaceItem(draggedItemKey),destination=dropDestination(target);
    clearDropTargets();
    if(!validDrop(item,destination))return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    target.classList.add('is-drop-target');
  });
  board?.addEventListener('dragleave',event=>{
    const target=event.target.closest?.('[data-drop-kind]');
    if(target&&!target.contains(event.relatedTarget))target.classList.remove('is-drop-target');
  });
  board?.addEventListener('drop',event=>{
    const target=event.target.closest?.('[data-drop-kind]'),key=draggedItemKey||event.dataTransfer.getData('text/plain'),item=workspaceItem(key),destination=dropDestination(target);
    clearDropTargets();
    draggedItemKey='';
    if(!validDrop(item,destination))return;
    event.preventDefault();
    stageTransfer(item,destination);
  });
  bindInventoryWorkspaceInteractions(board,{onPullItem:stagePostmasterCollection,onPullAll:stagePostmasterCollection,onDirectEquip:stageDirectEquip});
  byId('vaultActionCancel')?.addEventListener('click',closeVaultActionDialog);
  byId('vaultActionConfirm')?.addEventListener('click',performPendingVaultAction);
  byId('vaultActionDialog')?.addEventListener('cancel',event=>{if(vaultActionBusy)event.preventDefault();else{event.preventDefault();closeVaultActionDialog();}});
}

function installEvents(){
  byId('vaultFilters')?.addEventListener('input',()=>{visibleLimit=PAGE_SIZE;renderInventory();});
  byId('vaultStatTargets')?.addEventListener('input',event=>{
    const label=event.target.closest('[data-target-stat]');
    if(!label)return;
    updateTargetControl(label);
    matchedBuilds=[];
    renderCandidateBuilds();
    const count=targetCount();
    byId('vaultFindBuilds').disabled=count===0;
    byId('vaultResetTargets').disabled=count===0;
    byId('vaultOptimiserStatus').textContent=count?`${count} target stat${count===1?'':'s'} active. Find the five closest complete sets.`:'Set one or more verified stat targets.';
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
  const images=[...document.querySelectorAll('#vaultTransferWorkspace img')].slice(0,24).filter(image=>!image.complete);
  await Promise.race([
    Promise.all(images.map(image=>new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))),
    new Promise(resolve=>setTimeout(resolve,3500))
  ]);
}

async function init(){
  installEvents();
  installTransferEvents();
  byId('vaultConnectButton').href=authStartUrl();
  try{
    session=await getBungieSession();
    if(session?.authenticated!==true){
      byId('vaultSignedOut').hidden=false;
      byId('vaultConnectionState').textContent='SIGNED OUT';
      byId('vaultHeaderState').textContent='CONNECT BUNGIE';
      setStatus('Connect Bungie to load verified item instances. No inventory totals are estimated.');
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
  }catch(error){
    console.error('[Forge Vault]',error);
    byId('vaultConnectionState').textContent='INVENTORY UNAVAILABLE';
    setStatus(error?.message||'Verified Bungie inventory is unavailable.','error');
    globalThis.ForgeLoader?.status?.(error?.message||'Verified Bungie inventory is unavailable.');
    globalThis.ForgeLoader?.done?.();
  }
}

init();
