import {runProfileTask} from '../../core/engine-profile-client.mjs?v=20260927-1';
import {forgeSetListOptions,forgeSetListMarkup,unresolvedForgeSets} from './forge-loader-set-list.mjs?v=20260909-layout-2&plain=20260925-2';
import {startForgeBackgroundRefresh,mergeExoticCheckCatalogue,bindExoticCheckControl,forgeInventorySignature} from './forge-loader-refresh.mjs?v=20260910-source-coverage-1&plain=20260925-2&refresh=20260927-1';
import {AUTH_ORIGIN,authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1&perf=20260927-1';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1&fix=20260909-set-list-1&plain=20260925-2&refresh=20260927-1';
import {ARMOUR_BUCKETS,createVaultCatalogue,itemKey} from '../vault/vault-inventory.mjs?v=20260910-fixed-intrinsic-evidence-1';
import {ARMOUR_STAT_CAP,ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector} from '../vault/vault-armour-matcher.mjs?v=20260904-top-50-scan-1';
import {compatibleWithClass,exoticCatalogueGroups,ownedExoticGroups,ownedExoticWeaponGroups,rankOpenProtocolCandidates,setBonusOptions,toggleSetSelection,unownedSetTargets} from './forge-loader-model.mjs?v=20260913-backend-solver-1&plain=20260925-2&anchor=20260927-1';
import {preloadForgeLoaderPayload,readForgeLoaderPreloadReceipt} from './forge-loader-preload.mjs?v=20260913-workspace-preload-1&resident=20260910-source-coverage-2&transport=20260911-compact-plugs-1&navigation=20260920-1&plain=20260925-2&refresh=20260927-1';
import {forgeLoaderResidency} from './forge-loader-residency.mjs?v=20260910-source-coverage-1&plain=20260925-2';
import {reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260920-ready-1&plain=20260925-2&refresh=20260927-1&perf=20260927-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';
import {bindParadoxItemHover} from '../guardian-workspace-v2/paradox-item-hover.mjs?v=20260911-forge-selector-hover-1&status=20260917-compact-1&plain=20260925-2&refresh=20260927-1';
import {classifyArmourPlug} from '../guardian-workspace-v2/guardian-semantic-resolver.mjs?v=20260910-tier-zero-evidence-1';
import {CANDIDATE_BATCH_SIZE,candidateMarkup,encodeForgeResultsUrl,scanArmourCombinations} from './forge-loader-scan.mjs?v=20260927-1';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const CLASS_NAMES=['titan','hunter','warlock'];
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
const ARMOUR_STAT_DEFINITION_HASHES=Object.freeze({health:392767087,melee:4244567218,grenade:1735777505,super:144602215,class:1943323491,weapon:2996146975});
const byId=id=>document.getElementById(id);
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const params=new URLSearchParams(location.search);
const pageReadyStartedAt=performance.now();
const incomingPreloadReceipt=readForgeLoaderPreloadReceipt();

let session=null;
let payload=null;
let catalogue={armour:[],postmasterByCharacter:{}};
let activeCharacterId=text(params.get('characterId'));
let activeCharacterClass='';
let selectedExoticKey='';
let selectedExoticWeaponKey='';
let setSelections=[];
let matchedBuilds=[];
let targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));
let activeSetUpgradeTarget=null;
let upgradeRenderSequence=0;
let forgeRefreshController=null;
let residentProfileBuild=null;
let residentReady=false;
let backendSolverReady=false;
const setUpgradeTargetCache=new Map();

function characters(){return Object.values(payload?.profile?.characters?.data||{});}
function selectedCharacter(){return characters().find(character=>text(character.characterId)===activeCharacterId)||null;}
function mostRecentCharacter(){return characters().sort((left,right)=>text(right?.dateLastPlayed).localeCompare(text(left?.dateLastPlayed)))[0]||null;}
function characterClass(character){return CLASS_NAMES[Number(character?.classType)]||'';}
function classLabel(value=activeCharacterClass){return value?value[0].toUpperCase()+value.slice(1):'Guardian';}
function rememberActiveCharacter(){try{sessionStorage.setItem(SELECTED_CHARACTER_KEY,activeCharacterId);}catch{}}

function resolveActiveCharacter(requestedId=''){
  let stored='';try{stored=text(sessionStorage.getItem(SELECTED_CHARACTER_KEY));}catch{}
  const requested=text(requestedId||activeCharacterId||stored);
  const character=characters().find(row=>text(row.characterId)===requested)||mostRecentCharacter();
  activeCharacterId=text(character?.characterId);
  activeCharacterClass=characterClass(character);
  if(activeCharacterId)rememberActiveCharacter();
  return character;
}

function membershipBinding(){
  const membership=session?.activeDestinyMembership||{};
  return {characterId:activeCharacterId,membershipId:text(membership.membershipId||session?.primaryMembershipId||session?.bungieMembershipId),membershipType:text(membership.membershipType)};
}

function residentDurationMs(){
  const introDuration=incomingPreloadReceipt?.reason==='tool-intro'?Math.max(0,Number(incomingPreloadReceipt.durationMs)||0):0;
  return introDuration+Math.max(0,performance.now()-pageReadyStartedAt);
}

function renderResidency(phase='verifying'){
  const view=forgeLoaderResidency(payload||{},{characterId:activeCharacterId,catalogue,profileBuild:residentProfileBuild,manifestStatus:guardianManifest.status(),phase,backendSolverReady,durationMs:residentDurationMs()});
  residentReady=view.ready;
  const host=byId('forgeResidentSources'),panel=host?.closest('.forge-residency'),status=byId('forgeResidencyStatus'),summary=byId('forgeResidentSummary');
  if(host)host.innerHTML=view.rows.map(row=>`<li data-resident-source="${esc(row.key)}" data-state="${esc(row.state)}"><span><b>${esc(row.label)}</b><small>${esc(row.detail)}</small></span><em>${esc(row.state==='verifying'?'LOADING':row.state.toUpperCase())}</em></li>`).join('');
  panel?.classList.toggle('is-ready',view.ready);
  if(status)status.textContent=view.ready?'ALL SOURCES READY':view.rows.some(row=>row.state==='resident')?'DATA RESIDENT':'LOADING';
  if(summary)summary.textContent=view.summary;
  return view;
}

function renderCurrentResidency(){
  return renderResidency(residentProfileBuild&&backendSolverReady?'ready':payload?'resident':'verifying');
}

async function prepareResidentProfileBuild(){
  const sourcePayload=payload,sourceSession=session,characterId=activeCharacterId;
  const prepared=await runProfileTask('normalise',{payload:sourcePayload,session:sourceSession,characterId});
  if(payload!==sourcePayload||session!==sourceSession||activeCharacterId!==characterId)return null;
  residentProfileBuild=prepared;
  return residentProfileBuild;
}

async function completeResidentPreparation(){
  backendSolverReady=false;
  residentProfileBuild=null;
  renderResidency('resident');
  await prepareResidentProfileBuild();
  backendSolverReady=Boolean(session?.authenticated&&text(payload?.pageReady?.manifestVersion||guardianManifest.status().version));
  return renderResidency('ready');
}

async function loadVerifiedPayload({force=false,showProgress=true}={}){
  if(showProgress)reportPreparedPageStage('session','loadout');
  const shared=force?null:globalThis.FORGE_LOADER_PRELOAD_PAYLOAD||globalThis.FORGE_HERO_PROFILE_PAYLOAD||await globalThis.FORGE_HERO_PROFILE_PROMISE;
  const next=await preloadForgeLoaderPayload(session,{force,sharedPayload:shared});
  if(!next?.profile)throw new Error('Inventory unavailable. Retry.');
  guardianManifest.seedPayload(next);
  if(next.forgeArmourIndex)guardianManifest.applyForgeArmourIndex(next,next.forgeArmourIndex);
  if(next.forgeArmourIndex&&!next.forgeArmourIndexCoverage)throw new Error('Forge armour index version does not match the prepared account data.');
  if(showProgress)reportPreparedPageStage('join','loadout');
  await guardianManifest.hydratePayload(next,{waitForManifest:false,armourOnly:Boolean(next.forgeArmourIndex),includeReusable:true,allowNetwork:false});
  return next;
}

function armourItems(){return catalogue.armour.filter(item=>compatibleWithClass(item,activeCharacterClass));}
// Exotic weapons are not class-restricted, and only the profile's owned instances are ever listed.
function weaponItems(){return (catalogue.items||[]).filter(item=>item?.equipmentGroup?.kind==='weapon');}
function exoticWeaponGroups(){return ownedExoticWeaponGroups(weaponItems());}
function selectedExoticWeapon(){return exoticWeaponGroups().find(group=>group.key===selectedExoticWeaponKey)||null;}
function inventoryDefinitions(){return guardianManifest.tables.get('DestinyInventoryItemDefinition')||payload?.definitions||{};}
function equipableSetDefinitions(){return guardianManifest.tables.get('DestinyEquipableItemSetDefinition')||payload?.equipableItemSets||{};}
function sandboxPerkDefinitions(){return guardianManifest.tables.get('DestinySandboxPerkDefinition')||payload?.sandboxPerks||{};}
function exoticGroups(){return exoticCatalogueGroups(catalogue.armour,inventoryDefinitions(),activeCharacterClass,ARMOUR_BUCKETS);}
function selectedExotic(){return exoticGroups().find(group=>group.owned&&group.key===selectedExoticKey)||null;}
function targetValues(){return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(document.querySelector(`[data-target-stat="${key}"] input`)?.value||0)]));}
function priorityValues(){return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(document.querySelector(`[data-stat-priority="${key}"]`)?.value||0)]));}
function activeTargetCount(){const targets=targetValues();return ARMOUR_STAT_KEYS.filter(key=>targets[key]>0).length;}
function activePriorityCount(){const priorities=priorityValues();return ARMOUR_STAT_KEYS.filter(key=>priorities[key]>0).length;}

function renderHero(){
  const character=selectedCharacter(),host=byId('forgeHeroCard'),label=classLabel();
  const displayName=text(payload?.membership?.displayName||session?.activeDestinyMembership?.displayName),subclassName=text(residentProfileBuild?.subclassName);
  byId('forgeGuardianTitle').textContent=displayName||'Bungie identity unavailable';
  byId('forgeGuardianClass').textContent=character?`${label.toUpperCase()} · ${subclassName?subclassName.toUpperCase():'LOADING SUBCLASS'} · POWER ${Number(character.light||0)||'—'}`:'UNAVAILABLE';
  byId('forgeHeaderState').textContent=character?`${label.toUpperCase()} FORGE`:'BUNGIE ARMOUR';
  if(!host)return;
  const emblem=character?.emblemBackgroundPath||character?.emblemPath||'';
  host.style.backgroundImage=emblem?`url("${esc(new URL(emblem,'https://www.bungie.net').toString())}")`:'';
  host.innerHTML=character?`<strong>${esc(displayName||'BUNGIE IDENTITY UNAVAILABLE')}</strong><span>${esc(label)} · ${esc(subclassName||'Loading subclass')}</span><b>✦ ${esc(character.light??'—')}</b>`:'<span>Guardian unavailable.</span>';
}

function definitionIdentity(hash){
  const definitions=inventoryDefinitions(),definition=definitions?.[String(hash)]||null,display=definition?.displayProperties||{};
  if(!definition||!text(display.name))return null;
  return {hash:Number(hash),bungieHash:Number(hash),name:text(display.name),description:text(display.description),icon:display.icon?new URL(display.icon,'https://www.bungie.net').toString():'',definition,identitySource:'DestinyInventoryItemDefinition'};
}

function selectorExoticIntrinsic(group){
  const prepared=group?.representative?.armourSemantics?.exoticPerk??group?.representative?.exoticPerk??null;
  if(prepared)return prepared;
  const definitions=inventoryDefinitions(),definition=group?.definition??group?.preview?.definition??definitions?.[String(group?.hash)]??null;
  const intrinsicHashes=(definition?.sockets?.intrinsicSockets||[]).map(row=>Number(row?.plugItemHash)).filter(hash=>Number.isInteger(hash)&&hash>0);
  const entryPlugs=(definition?.sockets?.socketEntries||[]).map(entry=>{
    const plug=definitionIdentity(entry?.singleInitialItemHash);
    return plug?{...plug,armourItemTierType:Number(definition?.inventory?.tierType)}:null;
  }).filter(plug=>plug&&classifyArmourPlug(plug)==='exotic-perk');
  return intrinsicHashes.map(definitionIdentity).find(Boolean)||entryPlugs[0]||null;
}

function selectorExoticHoverItem(group){
  const definition=group?.definition??group?.preview?.definition??group?.representative?.definition??inventoryDefinitions()?.[String(group?.hash)]??null;
  const tier=text(definition?.inventory?.tierTypeName||group?.preview?.tier||group?.representative?.tier||'Exotic');
  const intrinsic=selectorExoticIntrinsic(group),ownedCount=Array.isArray(group?.instances)?group.instances.length:0;
  return {itemHash:Number(group?.hash),name:text(group?.name),icon:text(group?.icon),slotLabel:text(group?.slotLabel||'Armour'),itemTypeDisplayName:text(group?.slotLabel||'Armour'),tier,isExotic:true,definition,exoticPerk:intrinsic,intrinsicTrait:intrinsic,armourSemantics:{exoticPerk:intrinsic},source:{label:`${ownedCount} ${ownedCount===1?'copy':'copies'} across account`}};
}

function bindSelectorExoticHovers(host,groups){
  const byKey=new Map(groups.map(group=>[group.key,group]));
  host?.querySelectorAll?.('[data-exotic-hover-key]').forEach(target=>{
    const group=byKey.get(target.dataset.exoticHoverKey);
    if(group)bindParadoxItemHover(target,selectorExoticHoverItem(group),'armour',{contextLabel:'BUILD ANCHOR',definitionOnly:true});
  });
}

function renderExotics(){
  const groups=exoticGroups(),host=byId('forgeExoticSlots');
  const ownedCount=groups.filter(group=>group.owned).length;
  byId('forgeExoticStatus').textContent=`${ownedCount} IN INVENTORY · ${groups.length} TOTAL`;
  host.innerHTML=ARMOUR_BUCKETS.map((slot,index)=>{
    const rows=groups.filter(group=>group.slotIndex===index);
    return `<section class="forge-exotic-slot"><h3>${esc(slot.label.toUpperCase())}</h3><div class="forge-exotic-grid">${rows.length?rows.map(group=>{
      const selected=group.owned&&group.key===selectedExoticKey;
      const ownership=group.owned?`${group.instances.length} ${group.instances.length===1?'copy':'copies'}`:'not in inventory';
      return `<button type="button" class="forge-exotic${selected?' is-selected':''}${group.owned?'':' is-unowned'}" data-exotic-hover-key="${esc(group.key)}" ${group.owned?`data-exotic-key="${esc(group.key)}"`:''} aria-pressed="${selected}" aria-disabled="${group.owned?'false':'true'}" aria-label="${group.owned?'Select':'Unavailable'} ${esc(group.name)}, ${ownership}"><img src="${esc(group.icon)}" alt="" loading="lazy" decoding="async"></button>`;
    }).join(''):'<div class="forge-empty">No Exotic definitions</div>'}</div></section>`;
  }).join('');
  bindSelectorExoticHovers(host,groups);
}

function bonusReason(row,count,choice){
  if(choice.checked)return `${count} PIECE SELECTED`;
  if(!choice.effect)return `${count} PIECE PERK UNAVAILABLE`;
  if(setSelections.some(selection=>selection.count===4))return 'FOUR-PIECE LOAD ACTIVE';
  if(count===4&&setSelections.some(selection=>selection.count===2))return 'LOCKED BY TWO-PIECE LOAD';
  if(count===2&&setSelections.filter(selection=>selection.count===2).length>=2)return 'TWO BONUS LIMIT REACHED';
  if(choice.disabled)return `${row.usableSlots} COMPATIBLE SLOT${row.usableSlots===1?'':'S'}`;
  return choice.effect.description||`${count}-piece set bonus`;
}

function renderExoticWeapons(){
  const host=byId('forgeExoticWeaponSlots');if(!host)return;
  const groups=exoticWeaponGroups();
  if(!groups.length){host.innerHTML='<div class="forge-empty">No Exotic weapons on this Guardian.</div>';byId('forgeWeaponAnchorStatus').textContent='No Exotic weapon anchor selected.';return;}
  host.innerHTML=groups.map(group=>{
    const selected=group.key===selectedExoticWeaponKey;
    const catalystBadge=!group.catalyst.present?'':`<em class="forge-weapon-catalyst${group.catalyst.active?' is-active':group.catalyst.unlocked?' is-unlocked':''}">${group.catalyst.active?'CATALYST ACTIVE':group.catalyst.unlocked?'CATALYST INSERTED':'CATALYST NOT COMPLETE'}</em>`;
    return `<button type="button" class="forge-weapon-slot${selected?' is-selected':''}" data-exotic-weapon-key="${esc(group.key)}" aria-pressed="${selected}" data-inspect-item="${esc(itemKey(group.representative))}"><img src="${esc(group.icon)}" alt="">
      <span><b>${esc(group.name)}</b><small>${esc(group.weaponType)}</small>${catalystBadge}</span></button>`;
  }).join('');
  const anchor=selectedExoticWeapon();
  byId('forgeWeaponAnchorStatus').textContent=anchor?`${anchor.name} anchored${anchor.catalyst.present?(anchor.catalyst.active?', catalyst active':anchor.catalyst.unlocked?', catalyst inserted but not complete':', catalyst not unlocked'):''}.`:'No Exotic weapon anchor selected. Optional: pick one to lock it into generation.';
}

function renderSetBonuses(){
  const exotic=selectedExotic(),host=byId('forgeSetList');
  upgradeRenderSequence+=1;activeSetUpgradeTarget=null;
  if(!exotic){byId('forgeSetStatus').textContent='SELECT EXOTIC';host.innerHTML='<div class="forge-empty">Select an Exotic to calculate compatible set bonuses.</div>';return;}
  const options=forgeSetListOptions(armourItems(),exotic,setSelections,payload,activeCharacterClass);
  const unresolved=unresolvedForgeSets(armourItems());
  const selectedLabel=setSelections.length?setSelections.map(row=>`${row.count}P`).join(' + '):'OPEN ARMOUR';
  byId('forgeSetStatus').textContent=`${options.length} SET${options.length===1?'':'S'} · ${selectedLabel}${unresolved.length?` · ${unresolved.length} SETS UNAVAILABLE`:''}`;
  const open=`<button type="button" class="forge-open-protocol${setSelections.length?'':' is-active'}" data-open-set-protocol aria-pressed="${setSelections.length===0}"><span><b>OPEN ARMOUR · NO SET BONUS REQUIRED</b><small>Rank the top 50 combinations, then use Exotic-to-set perk data as a tie-break.</small></span><em>${setSelections.length?'SELECT':'ACTIVE'}</em></button><article class="forge-set-upgrade" id="forgeSetUpgrade" hidden></article>`;
  const cards=forgeSetListMarkup(options);
  host.innerHTML=open+cards;
  if(!setSelections.length)void renderSetUpgradeRecommendation(exotic);
}

async function resolveSetUpgradeTarget(exotic){
  const key=`${guardianManifest.status().version}:${activeCharacterClass}:${exotic.key}`;
  if(!setUpgradeTargetCache.has(key))setUpgradeTargetCache.set(key,(async()=>{
    await new Promise(resolve=>typeof requestIdleCallback==='function'?requestIdleCallback(resolve,{timeout:1200}):setTimeout(resolve,0));
    const targets=unownedSetTargets({definitions:inventoryDefinitions(),setDefinitions:equipableSetDefinitions(),sandboxPerks:sandboxPerkDefinitions(),ownedItems:armourItems(),fixedExotic:exotic,className:activeCharacterClass,armourBuckets:ARMOUR_BUCKETS});
    const target=targets[0]||null;if(!target)return null;
    const sources=new Set(target.displaySources||[]);
    if(!sources.size){
      const hashes=target.missingPieces.map(piece=>piece?.collectibleHash).filter(Boolean).slice(0,6);
      const collectibles=Object.fromEntries(hashes.map(hash=>[String(hash),payload?.collectibleDefinitions?.[String(hash)]]).filter(([,row])=>row));
      for(const definition of Object.values(collectibles))if(text(definition?.sourceString))sources.add(text(definition.sourceString));
    }
    return {...target,sources:[...sources]};
  })());
  return setUpgradeTargetCache.get(key);
}

async function renderSetUpgradeRecommendation(exotic){
  const sequence=upgradeRenderSequence,host=byId('forgeSetUpgrade');if(!host)return;
  host.hidden=false;host.innerHTML='<span>OPTIONAL TARGET UPGRADE</span><strong>Checking Bungie set variants and acquisition sources…</strong>';
  const target=await resolveSetUpgradeTarget(exotic).catch(()=>null);
  if(sequence!==upgradeRenderSequence||selectedExoticKey!==exotic.key||setSelections.length)return;
  activeSetUpgradeTarget=target;
  if(!target){host.innerHTML='<span>OPTIONAL TARGET UPGRADE</span><strong>No new matching set found.</strong><p>Load 01 remains the best exact combination from this Guardian’s current vault.</p>';return;}
  const source=target.sources.length?target.sources.join(' · '):'Acquisition source unavailable.';
  host.innerHTML=`<span>OPTIONAL TARGET UPGRADE</span><strong>${target.count}P ${esc(target.setName)} · ${esc(target.trait.name)}</strong><p>${esc(target.trait.description)}</p><small>PERK MATCH · ${esc(target.evidence.join(' · ').toUpperCase())}</small><small>${target.ownedSlots} OF ${target.count} REQUIRED COMPATIBLE SLOTS · ${target.variantCount} VARIANT${target.variantCount===1?'':'S'} CHECKED</small><small>BUNGIE-LISTED SOURCE · ${esc(source)}</small><em>Check availability in Destiny 2. Load 01 uses your current gear.</em>`;
}

function updateTargetLabel(label){
  const key=label?.dataset?.targetStat,input=label?.querySelector('input'),output=label?.querySelector('output');
  if(key&&input&&output){
    const value=Math.min(ARMOUR_STAT_CAP,Math.max(0,Number(input.value||0)));
    const available=Math.min(ARMOUR_STAT_CAP,Math.max(0,Number(targetMaximums[key]||0)));
    output.textContent=`${value===0?available:value} / ${ARMOUR_STAT_CAP}`;
    if(value===0)output.dataset.available='true';else delete output.dataset.available;
    input.style.setProperty('--forge-slider-fill',`${value/ARMOUR_STAT_CAP*100}%`);
    input.style.setProperty('--forge-slider-available',`${(value===0?available:value)/ARMOUR_STAT_CAP*100}%`);
  }
}

function availableStatMaximums(exotic){
  const absolute=targetMaximums;
  if(!exotic||!matchedBuilds.length)return absolute;
  const targets=targetValues(),best=matchedBuilds[0]?.score||{},bestShortfalls=best.priorityShortfalls||[];
  const legalPriorityPool=matchedBuilds.filter(candidate=>Number(candidate.score?.shortfall||0)===Number(best.shortfall||0)&&(candidate.score?.priorityShortfalls||[]).every((value,index)=>value===bestShortfalls[index]));
  return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>{
    if(targets[key]>0)return [key,absolute[key]];
    const maximum=Math.max(0,...legalPriorityPool.map(candidate=>Number(candidate.score?.effectiveStats?.[key]??candidate.stats?.[key]??0)));
    return [key,Math.min(ARMOUR_STAT_CAP,maximum)];
  }));
}

function configureStats({reset=false}={}){
  const exotic=selectedExotic();
  targetMaximums=exotic?availableStatMaximums(exotic):Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));
  const available=Boolean(exotic)&&ARMOUR_STAT_KEYS.some(key=>targetMaximums[key]>0);
  for(const label of document.querySelectorAll('[data-target-stat]')){
    const key=label.dataset.targetStat,input=label.querySelector('input'),maxButton=label.querySelector('[data-max-stat]'),priority=label.querySelector('[data-stat-priority]');
    input.max=String(ARMOUR_STAT_CAP);input.disabled=!available;input.value=String(reset?0:Math.min(ARMOUR_STAT_CAP,Number(input.value||0)));maxButton.disabled=input.disabled;
    if(priority){priority.disabled=!available;if(reset)priority.value='';}
    updateTargetLabel(label);
  }
  const count=activeTargetCount(),priorityCount=activePriorityCount();
  byId('forgeFindBuilds').disabled=!available;byId('forgeResetTargets').disabled=!available||(count===0&&priorityCount===0);
  byId('forgeStatStatus').textContent=!exotic?'SELECT EXOTIC':available?(count||priorityCount?`${count} TARGET${count===1?'':'S'} · ${priorityCount} PRIORIT${priorityCount===1?'Y':'IES'}`:'AUTO MAXIMUM'):'NO COMPLETE LOAD';
}

const PREVIEW_COUNT=3;
let calculationToken=0,calculationController=null,openProtocolChosen=false,expandedPreviewIndex=-1;

function canSearch(){return Boolean(selectedExotic())&&(activeTargetCount()>0||activePriorityCount()>0||setSelections.length>0||openProtocolChosen);}

function resultsUrl({selectIndex=0}={}){
  const exotic=selectedExotic();if(!exotic)return null;
  return encodeForgeResultsUrl(new URL('./results/',location.href),{
    characterId:activeCharacterId,exoticHash:exotic.hash,weaponInstanceId:selectedExoticWeapon()?.representative?.itemInstanceId||'',
    setSelections,targets:targetValues(),priorities:priorityValues(),selectIndex
  });
}

// The top few loads update instantly here, on every slider or selection change, using the same
// forge-loader-scan.mjs markup the results page renders. Selecting or evaluating a previewed load
// hands off to the results page (its full list, staged armour and Enter Build Forge live there),
// carrying that load's position so it opens already staged.
function renderPreview(){
  const panel=byId('forgePreviewPanel'),host=byId('forgePreviewBuilds'),status=byId('forgePreviewStatus');
  if(!panel||!host)return;
  panel.hidden=!matchedBuilds.length;
  if(!matchedBuilds.length)return;
  const shown=Math.min(PREVIEW_COUNT,matchedBuilds.length);
  status.textContent=`TOP ${shown} OF ${matchedBuilds.length}`;
  const exotic=selectedExotic();
  host.innerHTML=matchedBuilds.slice(0,shown).map((candidate,index)=>candidateMarkup(candidate,index,{
    activeTargetCount:activeTargetCount(),expandedCandidateIndex:expandedPreviewIndex,selectedCandidateIndex:-1,exoticIcon:exotic?.icon||'',payload,targets:targetValues(),setSelections
  })).join('');
}

// Forge Matrix results, staged armour and Enter Build Forge all live on their own page now, at their own
// URL, so a result can be reloaded, bookmarked and shared. The whole selection travels in the query string.
function renderResultsCta(){
  const status=byId('forgeSearchStatus'),summary=byId('forgeSearchSummary'),open=byId('forgeOpenResults');
  renderPreview();
  if(!status||!open)return;
  if(!matchedBuilds.length){status.textContent='NOT SEARCHED';summary.textContent=selectedExotic()?'Search to rank this Guardian’s real armour combinations.':'Choose an Exotic to begin.';open.setAttribute('aria-disabled','true');open.removeAttribute('href');return;}
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  status.textContent=`${matchedBuilds.length} RESULT${matchedBuilds.length===1?'':'S'}`;
  summary.textContent=`${evaluated.toLocaleString()} combinations scanned. Load 1 is the best fit with ${selectedExotic()?.name} locked.`;
  const url=resultsUrl();
  open.href=url.href;open.removeAttribute('aria-disabled');
}

async function calculateBuilds(){
  const exotic=selectedExotic(),targets=targetValues();if(!exotic)return;
  // A newer search supersedes an older one, so a slow reply can never overwrite the latest selection.
  calculationController?.abort();const token=++calculationToken,controller=calculationController=new AbortController();
  const button=byId('forgeFindBuilds');button.disabled=true;button.textContent='SEARCHING…';
  byId('forgeRuntimeStatus').textContent=activeTargetCount()||activePriorityCount()?'Applying the Exotic anchor, set protocol and ranked stat constraints…':'No stat priority selected. Ranking the complete legal pool by maximum unmodded stats…';
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const scanStarted=performance.now();
  const sourceItems=armourItems();
  const manifestVersion=text(payload?.pageReady?.manifestVersion||payload?.manifestVersion||guardianManifest.status().version);
  const timer=setTimeout(()=>controller.abort(),30_000);
  try{
    const {matchedBuilds:next,targetMaximums:nextMaximums}=await scanArmourCombinations({authOrigin:AUTH_ORIGIN,session,binding:membershipBinding(),manifestVersion,sourceItems,exotic,setSelections,targets,priorities:priorityValues(),limit:CANDIDATE_BATCH_SIZE,signal:controller.signal});
    if(token!==calculationToken)return;
    targetMaximums=nextMaximums;
    matchedBuilds=setSelections.length?next:rankOpenProtocolCandidates(next,exotic);
  }catch(error){
    if(token!==calculationToken)return;
    matchedBuilds=[];renderResultsCta();
    byId('forgeRuntimeStatus').textContent=error?.name==='AbortError'?'Backend armour calculation timed out. Retry after Guardian data finishes refreshing.':error?.message||'Backend armour calculation is unavailable.';
    button.disabled=false;
    return;
  }finally{clearTimeout(timer);if(token===calculationToken)button.textContent='SEARCH FORGE MATRIX';}
  if(token!==calculationToken)return;
  const scanDuration=performance.now()-scanStarted;
  configureStats();
  renderResultsCta();
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  const durationLabel=scanDuration<1000?`${Math.max(1,Math.round(scanDuration))} ms`:`${(scanDuration/1000).toFixed(2)} s`;
  byId('forgeRuntimeStatus').textContent=matchedBuilds.length?`${evaluated.toLocaleString()} combinations scanned by the backend Worker in ${durationLabel}. Showing the top ${matchedBuilds.length}; Load 1 is the best fit with ${exotic.name} locked${activeSetUpgradeTarget?`; ${activeSetUpgradeTarget.setName} remains an optional target upgrade`:''}.`:'No complete armour combination satisfies the selected Exotic and set protocol.';
}

function resetResults(){matchedBuilds=[];targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));renderResultsCta();}

function selectExoticWeapon(key){
  const next=exoticWeaponGroups().find(group=>group.key===String(key||''));
  selectedExoticWeaponKey=next&&next.key===selectedExoticWeaponKey?'':next?.key||'';
  renderExoticWeapons();resetResults();
  byId('forgeRuntimeStatus').textContent=selectedExoticWeaponKey?`${next.name} anchored. Generation will keep it in the Exotic weapon slot.`:'Exotic weapon anchor cleared.';
}

function selectExotic(key){
  const next=exoticGroups().find(group=>group.owned&&group.key===String(key||''));if(!next)return;
  selectedExoticKey=next.key;setSelections=[];openProtocolChosen=false;resetResults();renderExotics();renderSetBonuses();configureStats({reset:true});
  const exotic=selectedExotic();
  byId('forgeRuntimeStatus').textContent=exotic?`${exotic.name} anchored. Ranking the maximum-stat load automatically.`:'Choose an Exotic to start.';
  if(exotic)void calculateBuilds();
}

function toggleBonus(input){
  const exotic=selectedExotic();if(!exotic)return;
  setSelections=toggleSetSelection(armourItems(),exotic,setSelections,{setHash:Number(input.dataset.setHash),count:Number(input.dataset.setCount)},input.checked);
  openProtocolChosen=false;
  resetResults();renderSetBonuses();configureStats();
  byId('forgeRuntimeStatus').textContent=setSelections.length?`Set protocol active: ${setSelections.map(row=>`${row.count}-piece`).join(' + ')}. Stat ceilings recalculated.`:'No set bonus required. Stat ceilings recalculated from all compatible armour.';
  void calculateBuilds();
}

function openSetProtocol(){
  if(!selectedExotic())return;
  setSelections=[];openProtocolChosen=true;resetResults();renderSetBonuses();configureStats();
  byId('forgeRuntimeStatus').textContent='Open armour active. Ranking the top combinations with Exotic-to-set perk data.';
  void calculateBuilds();
}

function setStatPriority(select){
  const rank=Number(select?.value||0);
  if(rank>0)for(const other of document.querySelectorAll('[data-stat-priority]'))if(other!==select&&Number(other.value)===rank)other.value='';
  resetResults();configureStats();
  byId('forgeRuntimeStatus').textContent=rank>0?`Priority ${rank} assigned. Re-ranking every legal armour combination.`:'Priority returned to AUTO. Re-ranking by the remaining directives and maximum stats.';
  if(selectedExotic())void calculateBuilds();
}

function inspectItemFromTarget(target){
  const key=target?.dataset?.inspectItem;
  return catalogue.armour.find(item=>itemKey(item)===String(key||''))||weaponItems().find(item=>itemKey(item)===String(key||''))||null;
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
  if(item.equipmentGroup?.kind==='weapon'){
    const catalyst=item.weaponSemantics?.catalyst,catalystLine=!catalyst?'':catalyst.progress?.masterworked?'Catalyst active.':catalyst.progress?.inserted?'Catalyst inserted, not complete.':'Catalyst not unlocked.';
    panel.innerHTML=`<div class="forge-inspect-brand">ASTRIX PARADOX</div><div class="forge-inspect-tier"><h3>${esc(item.name)}</h3><p>${esc(`${item.weaponType||'Weapon'} · ${item.elementDefinition?.displayProperties?.name||item.tier||'Exotic'}`)}</p></div><div class="forge-inspect-main">${item.icon?`<img src="${esc(item.icon)}" alt="">`:''}<div><strong>${item.power!==null?`✦ ${esc(item.power)}`:''}</strong><p>${esc(item.weaponSemantics?.intrinsic?.name||'')}</p><p>${esc(item.weaponSemantics?.intrinsic?.description||'')}</p>${catalystLine?`<p>${esc(catalystLine)}</p>`:''}</div></div><div class="forge-inspect-foot"><span>${esc(String(item.source?.label||'ITEMS').toUpperCase())}</span><span>EXACT BUNGIE DATA</span></div>`;
  }else{
    const statSummary=`${item.power!==null?`✦ ${esc(item.power)} · `:''}Σ ${Number(item.totalStats||0)}`;
    panel.innerHTML=`<div class="forge-inspect-brand">ASTRIX PARADOX</div><div class="forge-inspect-tier"><h3>${esc(item.name)}</h3><p>${esc(`${item.slotLabel} · ${item.tier||'Exotic armour'}`)}</p></div><div class="forge-inspect-main">${item.icon?`<img src="${esc(item.icon)}" alt="">`:''}<div><strong>${statSummary}</strong><p>${esc(item.exoticPerk?.name||item.archetype?.name||'Armour')}</p><p>${esc(item.exoticPerk?.description||item.description||'')}</p></div></div>${inspectStatsMarkup(item)}<div class="forge-inspect-foot"><span>${esc(inspectOwnershipLabel(item))}</span><span>EXACT BUNGIE DATA</span></div>`;
  }
  panel.hidden=false;panel.setAttribute('aria-hidden','false');requestAnimationFrame(()=>positionInspect(panel,target));
}

function hideInspect(){const panel=byId('forgeItemInspect');if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true');}}

function installEvents(){
  byId('forgeExoticSlots')?.addEventListener('click',event=>{const button=event.target.closest('[data-exotic-key]');if(button)selectExotic(button.dataset.exoticKey);});
  byId('forgeExoticWeaponSlots')?.addEventListener('click',event=>{const button=event.target.closest('[data-exotic-weapon-key]');if(button)selectExoticWeapon(button.dataset.exoticWeaponKey);});
  byId('forgeSetList')?.addEventListener('click',event=>{if(event.target.closest('[data-open-set-protocol]'))openSetProtocol();});
  byId('forgeSetList')?.addEventListener('change',event=>{const input=event.target.closest('[data-set-hash]');if(input)toggleBonus(input);});
  byId('forgeStatTargets')?.addEventListener('input',event=>{if(event.target.matches('[data-stat-priority]'))return;const label=event.target.closest('[data-target-stat]');if(!label)return;updateTargetLabel(label);resetResults();configureStats();byId('forgeRuntimeStatus').textContent='Stat target changed. Calculate to rank every legal combination.';});
  byId('forgeStatTargets')?.addEventListener('change',event=>{if(event.target.matches('[data-stat-priority]')){setStatPriority(event.target);return;}if(event.target.matches('input[type="range"]'))void calculateBuilds();});
  byId('forgeStatTargets')?.addEventListener('click',event=>{const button=event.target.closest('[data-max-stat]');if(!button)return;const label=button.closest('[data-target-stat]'),input=label?.querySelector('input'),key=label?.dataset?.targetStat;if(!input||!key)return;input.value=String(Math.min(ARMOUR_STAT_CAP,Math.max(0,Number(targetMaximums[key]||0))));updateTargetLabel(label);configureStats();void calculateBuilds();});
  byId('forgeFindBuilds')?.addEventListener('click',calculateBuilds);
  byId('forgeResetTargets')?.addEventListener('click',()=>{for(const input of document.querySelectorAll('[data-target-stat] input'))input.value='0';for(const select of document.querySelectorAll('[data-stat-priority]'))select.value='';resetResults();configureStats();byId('forgeRuntimeStatus').textContent='Stat targets and priorities reset. Ranking by maximum unmodded stats.';void calculateBuilds();});
  byId('forgePreviewBuilds')?.addEventListener('click',event=>{
    const expand=event.target.closest('[data-candidate-expand]');if(expand){expandedPreviewIndex=expandedPreviewIndex===Number(expand.dataset.candidateExpand)?-1:Number(expand.dataset.candidateExpand);renderPreview();return;}
    const select=event.target.closest('[data-candidate-index]')||event.target.closest('[data-candidate-evaluate]');if(select){const index=Number(select.dataset.candidateIndex??select.dataset.candidateEvaluate);const url=resultsUrl({selectIndex:index});if(url)location.href=url.href;}
  });
  document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showInspect(target);});
  document.addEventListener('pointerout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideInspect();});
  document.addEventListener('focusin',event=>{const target=event.target.closest('[data-inspect-item]');if(target)showInspect(target);});
  document.addEventListener('focusout',event=>{const target=event.target.closest('[data-inspect-item]');if(target&&!target.contains(event.relatedTarget))hideInspect();});
  addEventListener('resize',hideInspect,{passive:true});addEventListener('scroll',hideInspect,{passive:true,capture:true});
  document.addEventListener('forge:character-selected',event=>{if(!payload)return;void(async()=>{resolveActiveCharacter(event.detail?.characterId);selectedExoticKey='';selectedExoticWeaponKey='';setSelections=[];resetResults();renderHero();renderExotics();renderExoticWeapons();renderSetBonuses();configureStats({reset:true});byId('forgeRuntimeStatus').textContent=`${classLabel()} selected. Loading resident Forge sources.`;try{await completeResidentPreparation();renderHero();byId('forgeRuntimeStatus').textContent=residentReady?`${classLabel()} ready. Select an Exotic.`:'One or more Forge sources remain unavailable.';}catch(error){console.error('[Forge Loader] Resident character preparation failed.',error);renderResidency('resident');byId('forgeRuntimeStatus').textContent=error?.message||'Character sources remain unavailable.';}})();});
  document.addEventListener('forge:manifest-progress',()=>reportPreparedPageStage('request','loadout'));
}

function reconcileForgeRefresh(){
  const exotic=selectedExotic();
  if(!exotic){
    selectedExoticKey='';
    setSelections=[];
  }else{
    const availableSets=new Set(setBonusOptions(armourItems(),exotic,setSelections).map(row=>String(row.hash)));
    setSelections=setSelections.filter(row=>availableSets.has(String(row.setHash))&&(row.count===2||row.count===4));
  }
  matchedBuilds=[];
}

async function applyForgeRefresh(next,{reason='poll'}={}){
  if(payload&&forgeInventorySignature(payload)===forgeInventorySignature(next)){payload=next;return next;}
  const recovering=!payload;
  payload=next;
  catalogue=createVaultCatalogue(payload);
  resolveActiveCharacter(activeCharacterId);
  await completeResidentPreparation();
  reconcileForgeRefresh();
  renderHero();
  renderExotics();
  renderExoticWeapons();
  renderSetBonuses();
  configureStats();
  renderResultsCta();
  byId('forgeRuntimeStatus').textContent=selectedExotic()
    ?`${reason==='manual'?'Guardian data refreshed.':'Guardian data updated.'} Calculate to update ranked combinations.`
    :`${reason==='manual'?'Guardian data refreshed.':'Guardian data updated.'} Select an Exotic.`;
  if(recovering){byId('forgeConnectionState').textContent='ARMOUR READY';reportPreparedPageStage('ready','loadout');globalThis.ForgeLoader?.done?.();}
  document.dispatchEvent(new CustomEvent('forge:prepared-page-refreshed',{detail:{page:'loadout',payload:next}}));
  return next;
}

async function checkForNewExotic(){
  const next=await loadVerifiedPayload({force:true,showProgress:false});
  const freshCatalogue=createVaultCatalogue(next);
  const previous=new Set(catalogue.armour.filter(item=>item.isExotic).map(itemKey));
  catalogue=mergeExoticCheckCatalogue(catalogue,freshCatalogue);
  renderExotics();
  renderExoticWeapons();
  const added=catalogue.armour.filter(item=>item.isExotic&&!previous.has(itemKey(item))).length;
  byId('forgeRuntimeStatus').textContent=added?`${added} newly detected Exotic armour instance${added===1?'':'s'} available.`:'Exotic check complete. No new Exotic armour found.';
  return next;
}

function startForgeRefresh(){
  if(forgeRefreshController)return;
  forgeRefreshController=startForgeBackgroundRefresh({
    session,
    refresh:async options=>applyForgeRefresh(await loadVerifiedPayload({force:true,showProgress:false}),options),
    onError:error=>console.info('[Forge Loader] background inventory refresh unavailable',error)
  });
  const button=byId('forgeRefreshButton');
  bindExoticCheckControl(button,checkForNewExotic,{
    onError:error=>{byId('forgeRuntimeStatus').textContent=error?.message||'Exotic check unavailable.';}
  });
  if(button)document.getElementById('bungieAuthControl')?.prepend(button);
}

async function settleVisibleImages(){
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const images=[...document.querySelectorAll('#forgeExoticSlots img,#forgeHeroCard img')].slice(0,30).filter(image=>!image.complete);
  await Promise.race([Promise.all(images.map(image=>new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))),new Promise(resolve=>setTimeout(resolve,3500))]);
}

async function init(){
  installEvents();byId('forgeConnectButton').href=authStartUrl();renderResidency();renderResultsCta();
  try{
    session=await getBungieSession();
    if(session?.authenticated!==true){byId('forgeSignedOut').hidden=false;byId('forgeConnectionState').textContent='SIGNED OUT';byId('forgeHeaderState').textContent='CONNECT BUNGIE';globalThis.ForgeLoader?.authRequired?.(authStartUrl());return;}
    startForgeRefresh();
    byId('forgeConnectionState').textContent='LOADING';payload=await loadVerifiedPayload();
    reportPreparedPageStage('render','loadout');catalogue=createVaultCatalogue(payload);resolveActiveCharacter(activeCharacterId);renderExoticWeapons();renderResidency('resident');await completeResidentPreparation();
    renderHero();renderExotics();renderSetBonuses();configureStats({reset:true});
    void forgeRefreshController.refreshNow().catch(()=>{});
    byId('forgeConnectionState').textContent=residentReady?'FORGE SOURCES READY':'FORGE SOURCES INCOMPLETE';
    const groups=exoticGroups(),ownedCount=groups.filter(group=>group.owned).length;byId('forgeRuntimeStatus').textContent=!residentReady?'One or more Forge sources remain unavailable. Build Forge handoff stays locked.':ownedCount?`${ownedCount} in inventory of ${groups.length} ${classLabel()} Exotic definition${groups.length===1?'':'s'}. Select a piece to begin.`:`${groups.length} ${classLabel()} Exotic definition${groups.length===1?'':'s'} shown; no instance can be selected.`;
    reportPreparedPageStage('ready','loadout');await settleVisibleImages();globalThis.ForgeLoader?.done?.();
  }catch(error){console.error('[Forge Loader]',error);byId('forgeConnectionState').textContent='ARMOUR UNAVAILABLE';byId('forgeRuntimeStatus').textContent=error?.message||'Bungie armour is unavailable.';globalThis.ForgeLoader?.blocked?.(error?.message||'Bungie armour is unavailable.');}
}

init();
