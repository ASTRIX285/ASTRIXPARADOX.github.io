// Forge Matrix results: its own URL, its own page. The whole selection (character, Exotic armour, optional
// Exotic weapon anchor, set protocol, stat targets and priorities) lives in the query string, so this page
// reruns the same real backend search on load. A reload, a bookmark or a shared link all work the same way.
import {AUTH_ORIGIN,authStartUrl,getBungieSession} from '../../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1&perf=20260927-1&recovery=20260927-4';
import {guardianManifest} from '../../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1&fix=20260909-set-list-1&plain=20260925-2&refresh=20260927-1&recovery=20260927-4';
import {cacheForgeLoaderTransfer,markGuardianFastReturn,releaseGuardianSessionStorageFallbacks} from '../../guardian-workspace-v2/guardian-session-cache.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1&recovery=20260927-4';
import {ARMOUR_BUCKETS,createVaultCatalogue,itemKey,prepareArmourSelection} from '../../vault/vault-inventory.mjs?v=20260910-fixed-intrinsic-evidence-1';
import {ARMOUR_STAT_CAP,ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector} from '../../vault/vault-armour-matcher.mjs?v=20260904-top-50-scan-1';
import {createVaultArmourSelection,writeVaultArmourSelection} from '../../vault/vault-selection-state.mjs?v=20260904-exotic-equip-rule-1';
import {exoticCatalogueGroups,ownedExoticGroups,ownedExoticWeaponGroups,weaponCatalystState,rankOpenProtocolCandidates,setBonusOptions} from '../forge-loader-model.mjs?v=20260913-backend-solver-1&plain=20260925-2&anchor=20260927-1';
import {writeForgeLoaderBuildSnapshot} from '../forge-loader-build-handoff.mjs?v=20260906-review-layout-1&results=20260927-1&perf=20260927-1';
import {preloadForgeLoaderPayload} from '../forge-loader-preload.mjs?v=20260913-workspace-preload-1&resident=20260910-source-coverage-2&transport=20260911-compact-plugs-1&navigation=20260920-1&plain=20260925-2&refresh=20260927-1&recovery=20260927-4';
import {forgeLoaderEvaluateReady,forgeLoaderResidency} from '../forge-loader-residency.mjs?v=20260910-source-coverage-1&plain=20260925-2';
import {reportPreparedPageStage} from '../../../core/prepared-page-client.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260920-ready-1&plain=20260925-2&refresh=20260927-1&perf=20260927-1&recovery=20260927-4';
import {mountForgeShell} from '../../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';
import {itemTileMarkup} from '../../../shared/guardian-inventory-workspace.mjs?v=20260913-breaker-icon-2';
import {CANDIDATE_BATCH_SIZE,candidateMarkup,decodeForgeResultsUrl,forgeLoaderDecision,scanArmourCombinations,stagedMarkup} from '../forge-loader-scan.mjs?v=20260927-1&layoutfix=20260927-1&statlabels=20260927-1';
import {EngineHandoffClient} from '../../../core/engine-handoff-client.mjs?v=20260927-1';
import {runProfileTask} from '../../../core/engine-profile-client.mjs?v=20260927-1&recovery=20260927-4';
import {beginEngineTiming} from '../../../core/engine-timing.mjs?v=20260927-1';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

// Same worker pattern as Forge Loader: the packed handoff envelope is built off the main thread, kept
// warm from the moment the profile resolves, so Enter Build Forge only waits on whatever prewarming
// has not yet finished.
const engineHandoff=new EngineHandoffClient();
window.addEventListener('pagehide',()=>engineHandoff.dispose());

const CLASS_NAMES=['titan','hunter','warlock'];
const byId=id=>document.getElementById(id);
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const selection=decodeForgeResultsUrl(location.search);

const activeCharacterId=selection.characterId;

let session=null;
let payload=null;
let catalogue={armour:[],items:[],postmasterByCharacter:{}};
let profileBuild=null;
let activeCharacterClass='';
let backendSolverReady=false;
let exoticGroup=null;
let weaponGroup=null;
let matchedBuilds=[];
let selectedCandidateIndex=-1;
let expandedCandidateIndex=-1;
let visibleCandidateCount=0;
const selectedSlots=new Map();

function characterClass(character){return CLASS_NAMES[Number(character?.classType)]||'';}
function armourItems(){return catalogue.armour.filter(item=>!activeCharacterClass||item?.characterClass==='any'||item?.characterClass===activeCharacterClass);}
function weaponItems(){return (catalogue.items||[]).filter(item=>item?.equipmentGroup?.kind==='weapon');}
function membershipBinding(){
  const membership=session?.activeDestinyMembership||{};
  return {characterId:selection.characterId,membershipId:text(membership.membershipId||session?.primaryMembershipId||session?.bungieMembershipId),membershipType:text(membership.membershipType)};
}

function inspectItemFromTarget(target){
  const key=target?.dataset?.inspectItem;
  return catalogue.armour.find(item=>itemKey(item)===String(key||''))||null;
}
function inspectStatsMarkup(item){
  const stats=armourStatVector(item);
  return `<div class="forge-inspect-stats">${ARMOUR_STAT_KEYS.map(key=>{const value=Number(stats[key]||0),maximum=Math.max(1,...armourItems().map(row=>Number(armourStatVector(row)[key]||0)));return `<div class="forge-inspect-stat"><span>${esc(ARMOUR_STAT_LABELS[key])}</span><span class="forge-inspect-bar"><i style="width:${Math.min(100,value/maximum*100)}%"></i></span><b>${value}</b></div>`;}).join('')}</div>`;
}
function inspectOwnershipLabel(item){
  if(!item?.isExotic)return String(item?.source?.label||'ITEMS').toUpperCase();
  const group=ownedExoticGroups(catalogue.armour,activeCharacterClass).find(row=>row.instances.some(instance=>itemKey(instance)===itemKey(item)));
  const instances=group?.instances||[item];
  const ordinal=Math.max(0,instances.findIndex(instance=>itemKey(instance)===itemKey(item)))+1;
  return instances.length>1?`THIS ROLL ${ordinal} OF ${instances.length} IN VAULT CATALOGUE`:'THIS ROLL';
}
function positionInspect(panel,anchor){
  const gap=12,bounds=anchor.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;
  let left=bounds.right+gap;if(left+width>innerWidth-gap)left=bounds.left-width-gap;
  left=Math.max(gap,Math.min(left,innerWidth-width-gap));
  const top=Math.max(gap,Math.min(bounds.top,innerHeight-height-gap));
  panel.style.left=`${Math.round(left)}px`;panel.style.top=`${Math.round(top)}px`;panel.style.right='auto';
}
function showInspect(target){
  const item=inspectItemFromTarget(target),panel=byId('forgeItemInspect');if(!item?.itemInstanceId||!panel)return;
  if(panel.parentElement!==document.documentElement)document.documentElement.append(panel);
  const statSummary=`${item.power!==null?`✦ ${esc(item.power)} · `:''}Σ ${Number(item.totalStats||0)}`;
  panel.innerHTML=`<div class="forge-inspect-brand">ASTRIX PARADOX</div><div class="forge-inspect-tier"><h3>${esc(item.name)}</h3><p>${esc(`${item.slotLabel} · ${item.tier||'Exotic armour'}`)}</p></div><div class="forge-inspect-main">${item.icon?`<img src="${esc(item.icon)}" alt="">`:''}<div><strong>${statSummary}</strong><p>${esc(item.exoticPerk?.name||item.archetype?.name||'Armour')}</p><p>${esc(item.exoticPerk?.description||item.description||'')}</p></div></div>${inspectStatsMarkup(item)}<div class="forge-inspect-foot"><span>${esc(inspectOwnershipLabel(item))}</span><span>EXACT BUNGIE DATA</span></div>`;
  panel.hidden=false;panel.setAttribute('aria-hidden','false');requestAnimationFrame(()=>positionInspect(panel,target));
}
function hideInspect(){const panel=byId('forgeItemInspect');if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true');}}

function renderResidency(){
  return forgeLoaderResidency(payload||{},{characterId:activeCharacterId,catalogue,profileBuild,manifestStatus:guardianManifest.status(),phase:profileBuild&&backendSolverReady?'ready':payload?'resident':'verifying',backendSolverReady,durationMs:0});
}

function renderCurrentResidency(){
  const view=renderResidency();
  const enter=byId('forgeEvaluate');
  if(enter){const ready=forgeLoaderEvaluateReady(view,selectedSlots,activeCharacterId);if(!enterBusy){enter.disabled=!ready;enter.classList.toggle('is-ready',ready);}}
  return view;
}

function renderStaged(){
  byId('forgeStagedSlots').innerHTML=ARMOUR_BUCKETS.map((slot,index)=>stagedMarkup(slot,index,selectedSlots)).join('');
  byId('forgeStagedStatus').textContent=selectedSlots.size===5?'COMPLETE LOAD':`${selectedSlots.size} OF 5 STAGED`;
  renderCurrentResidency();
}

function renderCandidates(){
  const shown=Math.min(visibleCandidateCount,matchedBuilds.length),remaining=matchedBuilds.length-shown;
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  byId('forgeResultStatus').textContent=matchedBuilds.length?`${shown} OF ${evaluated.toLocaleString()} COMBINATIONS`:'0 COMBINATIONS';
  byId('forgeCandidateBuilds').innerHTML=matchedBuilds.length?matchedBuilds.slice(0,shown).map((candidate,index)=>candidateMarkup(candidate,index,{
    activeTargetCount:ARMOUR_STAT_KEYS.filter(key=>Number(selection.targets[key])>0).length,expandedCandidateIndex,selectedCandidateIndex,exoticIcon:exoticGroup?.icon||'',payload,targets:selection.targets,setSelections:selection.setSelections
  })).join(''):'<div class="forge-empty">No complete armour combination is available for this Exotic and set protocol.</div>';
  const more=byId('forgeShowMore');more.hidden=remaining<=0;more.textContent=remaining>0?`SHOW NEXT ${Math.min(CANDIDATE_BATCH_SIZE,remaining)} OF ${remaining}`:'';
}

function stageCandidate(index){
  const candidate=matchedBuilds[Number(index)];if(!candidate)return;
  selectedCandidateIndex=Number(index);selectedSlots.clear();for(const item of candidate.items)selectedSlots.set(item.slotIndex,item);
  renderStaged();renderCandidates();
}
function toggleCandidateBreakdown(index){
  const candidate=matchedBuilds[Number(index)];if(!candidate)return;
  expandedCandidateIndex=expandedCandidateIndex===Number(index)?-1:Number(index);
  renderCandidates();
}

let enterBusy=false;
function setEnterState(step,label){
  const enter=byId('forgeEvaluate'),labelNode=byId('forgeEvaluateLabel');if(!enter)return;
  enterBusy=step!==null;
  enter.classList.toggle('is-active',enterBusy);
  if(enterBusy){enter.disabled=true;enter.setAttribute('aria-busy','true');enter.style.setProperty('--forge-enter-progress',`${Math.round(step*100)}%`);if(labelNode)labelNode.textContent=label;}
  else{enter.removeAttribute('aria-busy');enter.style.removeProperty('--forge-enter-progress');if(labelNode)labelNode.textContent='ENTER BUILD FORGE';renderStaged();}
}

async function evaluateInBuildForge(){
  const residency=renderCurrentResidency();
  if(!forgeLoaderEvaluateReady(residency,selectedSlots,activeCharacterId))return;
  if(enterBusy)return;
  const candidate=matchedBuilds[selectedCandidateIndex];if(!candidate)return;
  const binding=membershipBinding();
  const timing=beginEngineTiming('handoff.results-click-to-navigate');
  const fail=message=>{timing.end('error');byId('forgeResultsRuntimeStatus').textContent=message;setEnterState(null);};
  setEnterState(.35,'PACKING YOUR LOAD…');
  await new Promise(resolve=>requestAnimationFrame(resolve));
  timing.mark('paint');
  const setOptions=setBonusOptions(armourItems(),exoticGroup,selection.setSelections);
  const decision=forgeLoaderDecision({exoticGroup,candidate,index:selectedCandidateIndex,setOptions,setSelections:selection.setSelections,weaponGroup,targetValues:selection.targets,priorityValues:selection.priorities,combinationsEvaluated:matchedBuilds.combinationsEvaluated||matchedBuilds.length});
  let snapshotEnvelope;
  try{snapshotEnvelope=await engineHandoff.prepare(profileBuild,binding);}catch(error){fail(error.message);return;}
  timing.mark('handoff');
  const selected=prepareArmourSelection(payload,[...selectedSlots.values()]);
  const armourSelection=createVaultArmourSelection({binding,slots:selected.map(item=>({slot:item.slotIndex,item})),sourcePage:'forge-loader',forgeLoaderDecision:decision});
  if(!snapshotEnvelope||!armourSelection){fail('Build Forge could not open. Your build is unchanged.');return;}
  setEnterState(.65,'SECURING TRANSFER…');
  const transferStored=await cacheForgeLoaderTransfer(binding,{snapshotEnvelope,armourSelection});
  let baselineStored=transferStored,selectionStored=transferStored;
  // IndexedDB is the atomic primary route. Use quota-limited Web Storage only
  // when that route is unavailable, rather than retaining three large copies.
  if(!transferStored){
    baselineStored=writeForgeLoaderBuildSnapshot(profileBuild,binding,{stores:[sessionStorage,localStorage],snapshotEnvelope});
    selectionStored=writeVaultArmourSelection(armourSelection);
    if(!selectionStored){releaseGuardianSessionStorageFallbacks();selectionStored=writeVaultArmourSelection(armourSelection);}
  }
  if(!selectionStored){fail('The protected staged load could not be stored on this device. No build was changed.');return;}
  if(!baselineStored&&!transferStored){
    byId('forgeResultsRuntimeStatus').textContent='Browser storage is full. Build Forge will recover the protected Original Build directly from Bungie.';
    console.warn('[Forge Loader Results] Browser storage rejected the protected baseline; Build Forge will recover it from the authenticated Bungie profile.');
  }
  const url=new URL('../../guardian-workspace-v2/paradox-build-space/',location.href);url.searchParams.set('vault','selection');url.searchParams.set('prewarm','forge-loader');
  if(!baselineStored&&!transferStored)url.searchParams.set('baseline','bungie-recovery');
  for(const [key,value] of Object.entries(binding))if(value)url.searchParams.set(key,value);
  setEnterState(.9,'OPENING BUILD FORGE…');
  timing.mark('navigate');timing.end();
  markGuardianFastReturn();location.href=url;
}

async function runSearch(){
  byId('forgeResultsRuntimeStatus').textContent='Searching Forge Matrix…';
  const sourceItems=armourItems();
  const manifestVersion=text(payload?.pageReady?.manifestVersion||guardianManifest.status().version);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  try{
    const {matchedBuilds:next,targetMaximums}=await scanArmourCombinations({authOrigin:AUTH_ORIGIN,session,binding:membershipBinding(),manifestVersion,sourceItems,exotic:exoticGroup,setSelections:selection.setSelections,targets:selection.targets,priorities:selection.priorities,limit:CANDIDATE_BATCH_SIZE,signal:controller.signal});
    matchedBuilds=selection.setSelections.length?next:rankOpenProtocolCandidates(next,exoticGroup);
    void targetMaximums;
  }catch(error){
    matchedBuilds=[];renderCandidates();
    throw error?.name==='AbortError'?new Error('Forge Matrix search timed out. Retry loading the results.'):error;
  }finally{clearTimeout(timer);}
  visibleCandidateCount=Math.min(CANDIDATE_BATCH_SIZE,matchedBuilds.length);
  if(matchedBuilds.length)stageCandidate(Math.min(selection.selectIndex,matchedBuilds.length-1));else{renderStaged();renderCandidates();}
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  byId('forgeResultsRuntimeStatus').textContent=matchedBuilds.length?`${evaluated.toLocaleString()} combinations scanned. Load 1 is the best fit with ${exoticGroup.name} locked${weaponGroup?`, ${weaponGroup.name} anchored`:''}.`:'No complete armour combination satisfies this Exotic and set protocol.';
}

function installEvents(){
  byId('forgeCandidateBuilds')?.addEventListener('click',event=>{
    const evaluate=event.target.closest('[data-candidate-evaluate]');if(evaluate){stageCandidate(evaluate.dataset.candidateEvaluate);void evaluateInBuildForge();return;}
    const stage=event.target.closest('[data-candidate-index]');if(stage){stageCandidate(stage.dataset.candidateIndex);return;}
    const expand=event.target.closest('[data-candidate-expand]');if(expand)toggleCandidateBreakdown(expand.dataset.candidateExpand);
  });
  byId('forgeEvaluate')?.addEventListener('click',()=>void evaluateInBuildForge());
  byId('forgeShowMore')?.addEventListener('click',()=>{visibleCandidateCount=Math.min(matchedBuilds.length,visibleCandidateCount+CANDIDATE_BATCH_SIZE);renderCandidates();});
  document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showInspect(target);});
  document.addEventListener('pointerout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideInspect();});
  document.addEventListener('focusin',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showInspect(target);});
  document.addEventListener('focusout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideInspect();});
  addEventListener('resize',hideInspect,{passive:true});addEventListener('scroll',hideInspect,{passive:true,capture:true});
}

async function init(){
  installEvents();
  byId('forgeConnectButton').href=authStartUrl();
  byId('forgeResultsBack').href=selection.characterId?`../index.html?characterId=${encodeURIComponent(selection.characterId)}`:'../';
  if(!selection.characterId||!selection.exoticHash){byId('forgeResultsRuntimeStatus').textContent='This link is missing its Forge Loader selection. Return to Forge Loader and search again.';globalThis.ForgeLoader?.done?.();return;}
  try{
    session=await getBungieSession();
    if(session?.authenticated!==true&&!(session?.authenticated===false&&session?.status===401&&session?.error==='bungie_reauthentication_required'))throw new Error('Bungie session could not be checked. Retry loading the profile.');
    if(session?.authenticated===false){byId('forgeSignedOut').hidden=false;byId('forgeResultsConnectionState').textContent='SIGNED OUT';globalThis.ForgeLoader?.authRequired?.(authStartUrl());return;}
    reportPreparedPageStage('session','loadout');
    const next=await preloadForgeLoaderPayload(session,{});
    if(!next?.profile)throw new Error('Inventory unavailable. Retry.');
    guardianManifest.seedPayload(next);
    if(next.forgeArmourIndex)guardianManifest.applyForgeArmourIndex(next,next.forgeArmourIndex);
    await guardianManifest.hydratePayload(next,{waitForManifest:false,armourOnly:Boolean(next.forgeArmourIndex),includeReusable:true,allowNetwork:false});
    payload=next;
    catalogue=createVaultCatalogue(payload);
    const character=Object.values(payload?.profile?.characters?.data||{}).find(row=>text(row.characterId)===selection.characterId);
    activeCharacterClass=characterClass(character);
    profileBuild=await runProfileTask('normalise',{payload,session,characterId:activeCharacterId});
    backendSolverReady=Boolean(session?.authenticated&&text(payload?.pageReady?.manifestVersion||guardianManifest.status().version));
    void engineHandoff.prepare(profileBuild,membershipBinding()).catch(()=>{});
    const inventoryDefinitions=guardianManifest.tables.get('DestinyInventoryItemDefinition')||payload?.definitions||{};
    const groups=exoticCatalogueGroups(catalogue.armour,inventoryDefinitions,activeCharacterClass,ARMOUR_BUCKETS);
    exoticGroup=groups.find(group=>group.owned&&Number(group.hash)===selection.exoticHash)||null;
    if(!exoticGroup){byId('forgeResultsRuntimeStatus').textContent='This Exotic is no longer in this Guardian’s inventory. Return to Forge Loader and search again.';globalThis.ForgeLoader?.done?.();return;}
    if(selection.weaponInstanceId){
      const weaponGroups=ownedExoticWeaponGroups(weaponItems());
      const group=weaponGroups.find(group=>group.instances.some(item=>item.itemInstanceId===selection.weaponInstanceId));
      if(!group)throw new Error('The selected Exotic weapon is no longer in inventory. Return to Forge Loader to choose another weapon or clear the optional anchor.');
      const representative=group.instances.find(item=>item.itemInstanceId===selection.weaponInstanceId);
      weaponGroup={...group,representative,catalyst:weaponCatalystState(representative)};
      byId('forgeResultsWeaponAnchor').textContent=`Weapon anchor: ${weaponGroup.name}`;
      byId('forgeResultsWeaponAnchor').hidden=false;
    }
    byId('forgeResultsConnectionState').textContent='LOADING';
    await runSearch();
    reportPreparedPageStage('ready','loadout');
    globalThis.ForgeLoader?.done?.();
  }catch(error){
    console.error('[Forge Loader Results]',error);
    byId('forgeResultsRuntimeStatus').textContent=error?.message||'Bungie armour is unavailable.';
    globalThis.ForgeLoader?.blocked?.(error?.message||'Bungie armour is unavailable.');
  }
}

init();
