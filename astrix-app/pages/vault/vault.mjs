import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1';
import {bindPreparedPageRefreshControl,createPreparedPageRefreshController,markGuardianFastReturn} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';
import {ARMOUR_BUCKETS,createVaultCatalogue,filterVaultArmour,itemKey,prepareArmourSelection} from './vault-inventory.mjs?v=20260905-weapon-audit-1';
import {ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector,armourTargetMaximums,matchArmourBuilds,statKey} from './vault-armour-matcher.mjs';
import {createVaultArmourSelection,writeVaultArmourSelection} from './vault-selection-state.mjs';
import {assertRenderablePagePayload} from '../../core/page-ready-contract.mjs?v=20260906-page-data-recovery-1';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';

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
let catalogue={armour:[],totals:{all:0,armour:0,other:0,ownedArmour:0,unresolvedDefinitions:0},postmasterByCharacter:{}};
let activeCharacterId=text(params.get('characterId'));
let activeCharacterClass='';
let visibleLimit=PAGE_SIZE;
let matchedBuilds=[];
let targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));
let vaultRefreshController=null;
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

function itemCompatible(item){return !activeCharacterClass||item?.characterClass==='any'||item?.characterClass===activeCharacterClass;}

function selectedKeySet(){return new Set([...selectedSlots.values()].map(itemKey));}

function selectionSlotMarkup(slot,index){
  const item=selectedSlots.get(index);
  return `<div class="vault-selection-slot" data-selection-slot="${index}">${item?.icon?`<img src="${esc(item.icon)}" alt="">`:'<span class="vault-slot-empty" aria-hidden="true">◇</span>'}<span><b>${esc(item?.name||slot.label)}</b><small>${esc(item?`${item.source?.label||'Owned'} · ${item.totalStats} total`:'No item staged')}</small></span></div>`;
}

function renderSelection(){
  byId('vaultSelectionSlots').innerHTML=ARMOUR_BUCKETS.map(selectionSlotMarkup).join('');
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

function inspectStatsMarkup(item){
  const vector=armourStatVector(item);
  return `<div class="vault-inspect-stats">${ARMOUR_STAT_KEYS.map(key=>`<span>${esc(ARMOUR_STAT_LABELS[key])}<b>${Number(vector[key]||0)}</b></span>`).join('')}</div>`;
}

function positionItemInspect(panel,anchor){
  const gap=12,bounds=anchor.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;
  let left=bounds.right+gap;
  if(left+width>innerWidth-gap)left=bounds.left-width-gap;
  left=Math.max(gap,Math.min(left,innerWidth-width-gap));
  const top=Math.max(gap,Math.min(bounds.top,innerHeight-height-gap));
  panel.style.left=`${Math.round(left)}px`;
  panel.style.top=`${Math.round(top)}px`;
  panel.style.right='auto';
}

function showItemInspect(key,anchor){
  const item=inspectedItem(key),panel=byId('vaultItemInspect');
  if(!item||!panel||!anchor)return;
  if(panel.parentElement!==document.documentElement)document.documentElement.append(panel);
  const setName=item.setBonus?.identity?.name||'';
  panel.innerHTML=`<div class="vault-inspect-head">${item.icon?`<img src="${esc(item.icon)}" alt="">`:''}<div class="vault-inspect-copy"><h4>${esc(item.name)}</h4><p>${esc(`${item.slotLabel} · ${item.characterClass==='any'?'Any class':item.characterClass}`)}</p><strong>Σ ${item.totalStats} TOTAL${item.power!==null?` · ✦ ${esc(item.power)}`:''}</strong>${setName?`<p class="vault-inspect-set">${esc(setName)}</p>`:''}</div></div>${inspectStatsMarkup(item)}<div class="vault-inspect-foot"><span>${esc(String(item.source?.label||'Owned').toUpperCase())}</span><span>EXACT BUNGIE INSTANCE</span></div>`;
  panel.hidden=false;
  panel.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=>positionItemInspect(panel,anchor));
}

function hideItemInspect(){
  const panel=byId('vaultItemInspect');
  if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true');}
}

function itemMarkup(item){
  const compatible=itemCompatible(item);
  const setName=item.setBonus?.identity?.name||'';
  const className=['vault-item',item.isExotic?'is-exotic':'',compatible?'':'is-incompatible'].filter(Boolean).join(' ');
  return `<button type="button" class="${className}" data-inspect-item="${esc(itemKey(item))}" data-armour-slot="${item.slotIndex}" ${compatible?`aria-label="Inspect ${esc(item.name)}"`:`disabled aria-label="${esc(item.name)} is not compatible with the selected ${activeCharacterClass||'Guardian'}"`}>
    <span class="vault-item-art">${item.icon?`<img src="${esc(item.icon)}" alt="" loading="lazy" decoding="async">`:''}${item.power!==null?`<span class="vault-item-power">✦ ${esc(item.power)}</span>`:''}<span class="vault-item-source">${esc(String(item.source?.label||'Owned').toUpperCase())}</span><span class="vault-item-total">Σ ${item.totalStats}</span></span>
    <span class="vault-item-copy"><b>${esc(item.name)}</b><small>${esc(`${item.slotLabel} · ${item.characterClass==='any'?'Any class':item.characterClass}`)}</small>${setName?`<small class="vault-item-set">${esc(setName)}</small>`:''}${statLineMarkup(item)}</span>
  </button>`;
}

function renderInventory(){
  const rows=filterVaultArmour(catalogue.armour,filters());
  const visible=rows.slice(0,visibleLimit);
  byId('vaultResultCount').textContent=`${rows.length} VERIFIED ITEM${rows.length===1?'':'S'}`;
  byId('vaultItemGrid').innerHTML=visible.length?visible.map(item=>itemMarkup(item)).join(''):'<div class="vault-empty">No verified armour matches these filters.</div>';
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

function renderAll(){renderContext();renderSelection();renderInventory();}

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
  document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showItemInspect(target.dataset.inspectItem,target);});
  document.addEventListener('pointerout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideItemInspect();});
  document.addEventListener('focusin',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showItemInspect(target.dataset.inspectItem,target);});
  document.addEventListener('focusout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideItemInspect();});
  addEventListener('resize',hideItemInspect,{passive:true});
  addEventListener('scroll',hideItemInspect,{passive:true,capture:true});
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
  const images=[...document.querySelectorAll('#vaultItemGrid img')].slice(0,24).filter(image=>!image.complete);
  await Promise.race([
    Promise.all(images.map(image=>new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))),
    new Promise(resolve=>setTimeout(resolve,3500))
  ]);
}

async function init(){
  installEvents();
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
    setStatus(`${catalogue.totals.ownedArmour} verified armour item${catalogue.totals.ownedArmour===1?'':'s'} loaded${unresolved?` · ${unresolved} item definition${unresolved===1?'':'s'} unresolved`:''}${postmasterStatus()}.`,'good');
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
