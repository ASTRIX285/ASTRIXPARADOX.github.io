import {forgeSetListOptions,forgeSetListMarkup,unresolvedForgeSets} from './forge-loader-set-list.mjs?v=20260909-layout-2';
import {startForgeBackgroundRefresh,mergeExoticCheckCatalogue,bindExoticCheckControl,forgeInventorySignature} from './forge-loader-refresh.mjs?v=20260910-source-coverage-1';
import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260906-tool-intro-1';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1&fix=20260909-set-list-1';
import {cacheForgeLoaderTransfer,markGuardianFastReturn,releaseGuardianSessionStorageFallbacks} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';
import {ARMOUR_BUCKETS,createVaultCatalogue,itemKey,prepareArmourSelection} from '../vault/vault-inventory.mjs?v=20260910-fixed-intrinsic-evidence-1';
import {ARMOUR_STAT_CAP,ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourStatVector,armourTargetMaximums,matchTopArmourBuilds} from '../vault/vault-armour-matcher.mjs?v=20260904-top-50-scan-1';
import {createVaultArmourSelection,writeVaultArmourSelection} from '../vault/vault-selection-state.mjs?v=20260904-exotic-equip-rule-1';
import {compatibleWithClass,createOpenProtocolTieBreaker,exoticCatalogueGroups,naturalSetProtocols,ownedExoticGroups,rankOpenProtocolCandidates,setBonusOptions,toggleSetSelection,unownedSetTargets} from './forge-loader-model.mjs?v=20260904-top-50-scan-1';
import {createForgeLoaderBuildSnapshot,writeForgeLoaderBuildSnapshot} from './forge-loader-build-handoff.mjs?v=20260906-review-layout-1';
import {preloadForgeLoaderPayload,readForgeLoaderPreloadReceipt} from './forge-loader-preload.mjs?v=20260906-page-data-recovery-1&resident=20260910-source-coverage-2';
import {forgeLoaderEvaluateReady,forgeLoaderResidency} from './forge-loader-residency.mjs?v=20260910-source-coverage-1';
import {reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&contract=20260910-owned-weapon-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';
import {perkTooltipAttributes} from '../guardian-workspace-v2/guardian-perk-tooltip.mjs';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const CLASS_NAMES=['titan','hunter','warlock'];
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
const CANDIDATE_BATCH_SIZE=50;
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
let setSelections=[];
let matchedBuilds=[];
let selectedCandidateIndex=-1;
let expandedCandidateIndex=-1;
let visibleCandidateCount=0;
let targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,0]));
let activeSetUpgradeTarget=null;
let upgradeRenderSequence=0;
let forgeRefreshController=null;
let residentProfileBuild=null;
let residentReady=false;
let combinationsPrewarmed=false;
const selectedSlots=new Map();
const setUpgradeTargetCache=new Map();
const prewarmedTargetMaximums=new Map();

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
  const view=forgeLoaderResidency(payload||{},{characterId:activeCharacterId,catalogue,profileBuild:residentProfileBuild,manifestStatus:guardianManifest.status(),phase,combinationsPrewarmed,durationMs:residentDurationMs()});
  residentReady=view.ready;
  const host=byId('forgeResidentSources'),panel=host?.closest('.forge-residency'),status=byId('forgeResidencyStatus'),summary=byId('forgeResidentSummary');
  if(host)host.innerHTML=view.rows.map(row=>`<li data-resident-source="${esc(row.key)}" data-state="${esc(row.state)}"><span><b>${esc(row.label)}</b><small>${esc(row.detail)}</small></span><em>${esc(row.state.toUpperCase())}</em></li>`).join('');
  panel?.classList.toggle('is-ready',view.ready);
  if(status)status.textContent=view.ready?'ALL SOURCES READY':view.rows.some(row=>row.state==='resident')?'DATA RESIDENT':'VERIFYING';
  if(summary)summary.textContent=view.summary;
  const enter=byId('forgeEvaluate');if(enter)enter.disabled=!forgeLoaderEvaluateReady(view,selectedSlots,activeCharacterId);
  return view;
}

function renderCurrentResidency(){
  return renderResidency(residentProfileBuild&&combinationsPrewarmed?'ready':payload?'resident':'verifying');
}

async function prepareResidentProfileBuild(){
  const {normaliseLiveProfile}=await import('../guardian-workspace-v2/guardian-bungie-profile.mjs?v=20260910-fixed-intrinsic-evidence-1');
  residentProfileBuild=normaliseLiveProfile(payload,session,activeCharacterId);
  return residentProfileBuild;
}

function prewarmCombinationPools(){
  prewarmedTargetMaximums.clear();
  for(const exotic of exoticGroups().filter(row=>row.owned)){
    const options={fixedExoticHashes:exotic.hashes,fixedExoticSlot:exotic.slotIndex,setSelections:[],statPriorities:{},autoMaximum:true};
    prewarmedTargetMaximums.set(exotic.key,armourTargetMaximums(armourItems(),options));
  }
  combinationsPrewarmed=true;
}

async function completeResidentPreparation(){
  combinationsPrewarmed=false;
  residentProfileBuild=null;
  renderResidency('resident');
  await prepareResidentProfileBuild();
  prewarmCombinationPools();
  return renderResidency('ready');
}

async function loadVerifiedPayload({force=false,showProgress=true}={}){
  if(showProgress)reportPreparedPageStage('session','loadout');
  const shared=force?null:globalThis.FORGE_LOADER_PRELOAD_PAYLOAD||globalThis.FORGE_HERO_PROFILE_PAYLOAD||await globalThis.FORGE_HERO_PROFILE_PROMISE;
  const next=await preloadForgeLoaderPayload(session,{force,sharedPayload:shared});
  if(!next?.profile)throw new Error('Bungie returned no verified profile inventory.');
  guardianManifest.seedPayload(next);
  if(next.forgeArmourIndex)guardianManifest.applyForgeArmourIndex(next,next.forgeArmourIndex);
  if(next.forgeArmourIndex&&!next.forgeArmourIndexCoverage)throw new Error('Forge armour index version does not match the prepared account data.');
  if(showProgress)reportPreparedPageStage('join','loadout');
  await guardianManifest.hydratePayload(next,{waitForManifest:false,armourOnly:Boolean(next.forgeArmourIndex),includeReusable:true,allowNetwork:false});
  return next;
}

function armourItems(){return catalogue.armour.filter(item=>compatibleWithClass(item,activeCharacterClass));}
function inventoryDefinitions(){return guardianManifest.tables.get('DestinyInventoryItemDefinition')||payload?.definitions||{};}
function equipableSetDefinitions(){return guardianManifest.tables.get('DestinyEquipableItemSetDefinition')||payload?.equipableItemSets||{};}
function sandboxPerkDefinitions(){return guardianManifest.tables.get('DestinySandboxPerkDefinition')||payload?.sandboxPerks||{};}
function exoticGroups(){return exoticCatalogueGroups(catalogue.armour,inventoryDefinitions(),activeCharacterClass,ARMOUR_BUCKETS);}
function selectedExotic(){return exoticGroups().find(group=>group.owned&&group.key===selectedExoticKey)||null;}
function targetValues(){return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(document.querySelector(`[data-target-stat="${key}"] input`)?.value||0)]));}
function priorityValues(){return Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(document.querySelector(`[data-stat-priority="${key}"]`)?.value||0)]));}
function solverOptions(){const exotic=selectedExotic();return exotic?{fixedExoticHashes:exotic.hashes,fixedExoticSlot:exotic.slotIndex,setSelections,statPriorities:priorityValues(),autoMaximum:true}:{};}
function activeTargetCount(){const targets=targetValues();return ARMOUR_STAT_KEYS.filter(key=>targets[key]>0).length;}
function activePriorityCount(){const priorities=priorityValues();return ARMOUR_STAT_KEYS.filter(key=>priorities[key]>0).length;}

function renderHero(){
  const character=selectedCharacter(),host=byId('forgeHeroCard'),label=classLabel();
  const displayName=text(payload?.membership?.displayName||session?.activeDestinyMembership?.displayName),subclassName=text(residentProfileBuild?.subclassName);
  byId('forgeGuardianTitle').textContent=displayName||'Bungie identity unavailable';
  byId('forgeGuardianClass').textContent=character?`${label.toUpperCase()} · ${subclassName?subclassName.toUpperCase():'SUBCLASS VERIFYING'} · POWER ${Number(character.light||0)||'—'}`:'UNAVAILABLE';
  byId('forgeHeaderState').textContent=character?`${label.toUpperCase()} FORGE`:'BUNGIE ARMOUR';
  if(!host)return;
  const emblem=character?.emblemBackgroundPath||character?.emblemPath||'';
  host.style.backgroundImage=emblem?`url("${esc(new URL(emblem,'https://www.bungie.net').toString())}")`:'';
  host.innerHTML=character?`<strong>${esc(displayName||'BUNGIE IDENTITY UNAVAILABLE')}</strong><span>${esc(label)} · ${esc(subclassName||'Subclass verifying')}</span><b>✦ ${esc(character.light??'—')}</b>`:'<span>Verified Guardian unavailable.</span>';
}

function renderExotics(){
  const groups=exoticGroups(),host=byId('forgeExoticSlots');
  const ownedCount=groups.filter(group=>group.owned).length;
  byId('forgeExoticStatus').textContent=`${ownedCount} OWNED · ${groups.length} TOTAL`;
  host.innerHTML=ARMOUR_BUCKETS.map((slot,index)=>{
    const rows=groups.filter(group=>group.slotIndex===index);
    return `<section class="forge-exotic-slot"><h3>${esc(slot.label.toUpperCase())}</h3><div class="forge-exotic-grid">${rows.length?rows.map(group=>{
      const selected=group.owned&&group.key===selectedExoticKey;
      const ownership=group.owned?`${group.instances.length} owned ${group.instances.length===1?'copy':'copies'}`:'not owned';
      return `<button type="button" class="forge-exotic${selected?' is-selected':''}${group.owned?'':' is-unowned'}" ${group.owned?`data-exotic-key="${esc(group.key)}"`:''} aria-pressed="${selected}" aria-disabled="${group.owned?'false':'true'}" aria-label="${group.owned?'Select':'Unavailable'} ${esc(group.name)}, ${ownership}"><img src="${esc(group.icon)}" alt="" loading="lazy" decoding="async"></button>`;
    }).join(''):'<div class="forge-empty">No verified Exotic definitions</div>'}</div></section>`;
  }).join('');
}

function bonusReason(row,count,choice){
  if(choice.checked)return `${count} PIECE SELECTED`;
  if(!choice.effect)return `${count} PIECE PERK UNAVAILABLE`;
  if(setSelections.some(selection=>selection.count===4))return 'FOUR-PIECE LOAD ACTIVE';
  if(count===4&&setSelections.some(selection=>selection.count===2))return 'LOCKED BY TWO-PIECE LOAD';
  if(count===2&&setSelections.filter(selection=>selection.count===2).length>=2)return 'TWO BONUS LIMIT REACHED';
  if(choice.disabled)return `${row.usableSlots} COMPATIBLE SLOT${row.usableSlots===1?'':'S'}`;
  return choice.effect.description||`${count}-piece verified set bonus`;
}

function renderSetBonuses(){
  const exotic=selectedExotic(),host=byId('forgeSetList');
  upgradeRenderSequence+=1;activeSetUpgradeTarget=null;
  if(!exotic){byId('forgeSetStatus').textContent='SELECT EXOTIC';host.innerHTML='<div class="forge-empty">Select an Exotic to calculate compatible set bonuses.</div>';return;}
  const options=forgeSetListOptions(armourItems(),exotic,setSelections,payload,activeCharacterClass);
  const unresolved=unresolvedForgeSets(armourItems());
  const selectedLabel=setSelections.length?setSelections.map(row=>`${row.count}P`).join(' + '):'OPEN ARMOUR';
  byId('forgeSetStatus').textContent=`${options.length} VERIFIED SET${options.length===1?'':'S'} · ${selectedLabel}${unresolved.length?` · ${unresolved.length} SETS NOT YET VERIFIED`:''}`;
  const open=`<button type="button" class="forge-open-protocol${setSelections.length?'':' is-active'}" data-open-set-protocol aria-pressed="${setSelections.length===0}"><span><b>OPEN ARMOUR · NO SET BONUS REQUIRED</b><small>Rank the top 50 exact owned combinations, then use verified Exotic-to-set perk evidence as a tie-break.</small></span><em>${setSelections.length?'SELECT':'ACTIVE'}</em></button><article class="forge-set-upgrade" id="forgeSetUpgrade" hidden></article>`;
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
  host.hidden=false;host.innerHTML='<span>OPTIONAL TARGET UPGRADE</span><strong>Checking verified Bungie set variants and acquisition sources…</strong>';
  const target=await resolveSetUpgradeTarget(exotic).catch(()=>null);
  if(sequence!==upgradeRenderSequence||selectedExoticKey!==exotic.key||setSelections.length)return;
  activeSetUpgradeTarget=target;
  if(!target){host.innerHTML='<span>OPTIONAL TARGET UPGRADE</span><strong>No evidence-bound unowned set match identified.</strong><p>Load 01 remains the best exact combination from this Guardian’s current vault.</p>';return;}
  const source=target.sources.length?target.sources.join(' · '):'Bungie acquisition source is unresolved; no activity is claimed.';
  host.innerHTML=`<span>OPTIONAL TARGET UPGRADE</span><strong>${target.count}P ${esc(target.setName)} · ${esc(target.trait.name)}</strong><p>${esc(target.trait.description)}</p><small>PERK MATCH · ${esc(target.evidence.join(' · ').toUpperCase())}</small><small>OWNED ${target.ownedSlots} OF ${target.count} REQUIRED COMPATIBLE SLOTS · ${target.variantCount} VERIFIED VARIANT${target.variantCount===1?'':'S'} CHECKED</small><small>BUNGIE-LISTED SOURCE · ${esc(source)}</small><em>Availability is not assumed and future roll stats are unknown. Load 01 remains the best exact owned fallback.</em>`;
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
  const cached=!setSelections.length?prewarmedTargetMaximums.get(exotic?.key):null;
  const absolute=cached||armourTargetMaximums(armourItems(),solverOptions());
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

function stagedMarkup(slot,index){
  const item=selectedSlots.get(index);
  const contents=`${item?.icon?`<img src="${esc(item.icon)}" alt="">`:'<span class="forge-stage-empty">◇</span>'}<span><b>${esc(item?.name||slot.label)}</b><small>${esc(item?`${item.totalStats} total · ${item.source?.label||'Owned'}`:'No item staged')}</small></span>`;
  return item?`<button type="button" class="forge-staged-slot" data-inspect-item="${esc(itemKey(item))}" aria-label="Inspect staged ${esc(item.name)} roll">${contents}</button>`:`<div class="forge-staged-slot">${contents}</div>`;
}

function renderStaged(){
  byId('forgeStagedSlots').innerHTML=ARMOUR_BUCKETS.map(stagedMarkup).join('');
  byId('forgeStagedStatus').textContent=selectedSlots.size===5?'COMPLETE VERIFIED LOAD':`${selectedSlots.size} OF 5 STAGED`;
  renderCurrentResidency();
}

function candidateSetProtocol(candidate){
  if(!setSelections.length){
    const protocols=candidate?.openProtocol?.protocols||naturalSetProtocols(candidate);
    return protocols.length?`OPEN · ${protocols.map(row=>`${row.count}P ${row.setName}`).join(' + ')}`:'OPEN · NO ACTIVE SET';
  }
  return setSelections.map(selection=>{
    const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(selection.setHash));
    return `${selection.count}P ${match?.setBonus?.identity?.name||match?.armourSemantics?.set?.identity?.name||`SET ${selection.setHash}`}`;
  }).join(' + ');
}

function candidateSetProtocolIconMarkup(candidate){
  const protocols=!setSelections.length
    ?(candidate?.openProtocol?.protocols||naturalSetProtocols(candidate)).map(protocol=>{
      const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(protocol.setHash));
      return {...protocol,set:match?.setBonus||match?.armourSemantics?.set||null};
    })
    :setSelections.map(selection=>{
      const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(selection.setHash));
      const set=match?.setBonus||match?.armourSemantics?.set||null;
      return {count:selection.count,setName:set?.identity?.name||`SET ${selection.setHash}`,set,trait:selection.count===4?set?.fourPiece:set?.twoPiece};
    });
  const earnedTiers=protocols.flatMap(row=>{
    const tiers=[];
    if(Number(row.count)>=2&&(row.set?.twoPiece?.icon||(Number(row.count)===2&&row.trait?.icon)))tiers.push({...row,count:2,trait:row.set?.twoPiece||row.trait});
    if(Number(row.count)>=4&&(row.set?.fourPiece?.icon||row.trait?.icon))tiers.push({...row,count:4,trait:row.set?.fourPiece||row.trait});
    return tiers;
  });
  const icons=earnedTiers.map(row=>{
    const state=`${row.count} piece ${row.setName}`;
    return `<button type="button" class="forge-set-detail forge-matrix-protocol-icon" ${perkTooltipAttributes(row.trait,state)}><span class="forge-set-trait-icon"><img src="${esc(row.trait.icon)}" alt=""></span></button>`;
  });
  return icons.length?icons.join(''):'<span class="forge-matrix-protocol-empty" aria-label="No active set bonus">NONE</span>';
}

function verifiedTraitContext(effect){
  if(!effect)return null;
  const hash=Number(effect.hash??effect.plugHash??effect.bungieHash);
  return {hash:Number.isInteger(hash)&&hash>0?hash:null,name:text(effect.name),description:text(effect.description),icon:text(effect.icon)};
}

function forgeLoaderDecision(candidate,index){
  const exoticGroup=selectedExotic(),exoticItem=candidate?.items?.find(item=>item?.isExotic)||null;
  if(!exoticGroup||!exoticItem)return null;
  const exoticPerk=exoticItem.exoticPerk||exoticItem.armourSemantics?.exoticPerk||null;
  const setOptions=setBonusOptions(armourItems(),exoticGroup,setSelections);
  return {
    schemaVersion:1,
    buildAnchor:{
      identityKey:exoticGroup.key,
      name:exoticGroup.name,
      itemHashes:exoticGroup.hashes,
      selectedItemHash:Number(exoticItem.itemHash??exoticItem.hash)||null,
      selectedItemInstanceId:text(exoticItem.itemInstanceId||exoticItem.instanceId),
      perk:verifiedTraitContext(exoticPerk)
    },
    statDirective:{
      targets:targetValues(),
      priorities:priorityValues(),
      achieved:Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Math.min(ARMOUR_STAT_CAP,Number(candidate.stats?.[key]||0))])),
      allTargetsMet:Boolean(candidate.score?.met),
      shortfall:Number(candidate.score?.shortfall||0),
      rawTotal:Number(candidate.score?.total||0),
      modsApplied:false
    },
    setProtocol:(setSelections.length?setSelections.map(selection=>{
      const row=setOptions.find(option=>Number(option.hash)===Number(selection.setHash));
      const effect=selection.count===2?row?.two?.effect:row?.four?.effect;
      return {setHash:Number(selection.setHash),count:Number(selection.count),setName:text(row?.name),trait:verifiedTraitContext(effect)};
    }):naturalSetProtocols(candidate).map(row=>({setHash:Number(row.setHash),count:Number(row.count),setName:text(row.setName),trait:verifiedTraitContext(row.trait)}))),
    ranking:{position:Number(index)+1,totalCombinations:Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length),maximized:Number(index)===0}
  };
}

function armourStatIcon(key){
  const hash=ARMOUR_STAT_DEFINITION_HASHES[key],icon=text(payload?.statDefinitions?.[String(hash)]?.displayProperties?.icon);
  return icon?new URL(icon,'https://www.bungie.net').toString():'';
}

function candidateStatMarkup(candidate,{itemRow=false}={}){
  const stats=itemRow?armourStatVector(candidate):candidate.stats;
  const targets=itemRow?{}:targetValues();
  return ARMOUR_STAT_KEYS.map(key=>{
    const value=itemRow?Number(stats[key]||0):Math.min(ARMOUR_STAT_CAP,Number(stats[key]||0)),target=Number(targets[key]||0);
    const state=target>0?(value>=target?' is-met':' is-short'):'';
    const icon=itemRow?'':armourStatIcon(key);
    if(itemRow)return `<span class="forge-matrix-stat"><small>${esc(ARMOUR_STAT_LABELS[key].toUpperCase())}</small><b>${value}</b></span>`;
    const calculation=target>0?`TARGET ${target}`:'OPEN',label=`${ARMOUR_STAT_LABELS[key]} ${value}, ${calculation}`;
    return `<span class="forge-matrix-stat${state}" aria-label="${esc(label)}" title="${esc(label)}"><span class="forge-matrix-stat-reading">${icon?`<img class="forge-matrix-stat-icon" src="${esc(icon)}" alt="" aria-hidden="true" decoding="async">`:`<small>${esc(ARMOUR_STAT_LABELS[key].toUpperCase())}</small>`}<b>${value}</b></span><em>${calculation}</em></span>`;
  }).join('');
}

function candidateItemMeta(item){
  const details=[item.source?.label||'Owned'];
  if(item.power!==null&&item.power!==undefined)details.push(`Power ${item.power}`);
  if(Number.isFinite(Number(item.energy?.capacity)))details.push(`Energy ${Number(item.energy.capacity)}`);
  if((Number(item.state||0)&4)!==0)details.push('Masterworked');
  return details.join(' · ');
}

function candidateItemMarkup(item){
  return `<div class="forge-breakdown-item"><button type="button" class="forge-breakdown-identity" data-inspect-item="${esc(itemKey(item))}" aria-label="Inspect ${esc(item.name)}"><img src="${esc(item.icon)}" alt=""><span><b>${esc(item.name)}</b><small>${esc(item.slotLabel)} · ${esc(candidateItemMeta(item))}</small></span></button><div class="forge-breakdown-stats" aria-label="${esc(item.name)} armour stats">${candidateStatMarkup(item,{itemRow:true})}</div><span class="forge-breakdown-total"><small>TOTAL</small><b>${Number(item.totalStats||0)}</b></span></div>`;
}

function candidateMarkup(candidate,index){
  const hasTargets=activeTargetCount()>0,outcome=!hasTargets?'MAXIMUM STAT LOAD':candidate.score.met?'ALL TARGETS MET':`${candidate.score.shortfall} POINT${candidate.score.shortfall===1?'':'S'} SHORT`;
  const expanded=expandedCandidateIndex===index,selected=selectedCandidateIndex===index,maximized=index===0;
  const exotic=candidate.items.find(item=>item.isExotic)||candidate.items[0];
  return `<article class="forge-candidate${candidate.score.met?' is-target-met':''}${selected?' is-selected':''}${maximized?' is-maximized':''}"><div class="forge-matrix-row"><button type="button" class="forge-matrix-expand" data-candidate-expand="${index}" aria-expanded="${expanded}" aria-controls="forgeLoadBreakdown${index}"><span><small>LOAD</small><b>${String(index+1).padStart(4,'0')}</b></span><i aria-hidden="true">⌄</i></button><button type="button" class="forge-matrix-exotic" data-inspect-item="${esc(itemKey(exotic))}" aria-label="Inspect ${esc(exotic?.name||'matched Exotic')} matched roll">${exotic?.icon?`<img src="${esc(exotic.icon)}" alt="">`:''}<small>EXOTIC</small></button><div class="forge-matrix-stats" aria-label="Calculated unmodded armour stats">${candidateStatMarkup(candidate)}</div><span class="forge-matrix-protocol"><small>SET PROTOCOL</small><span class="forge-matrix-protocol-icons">${candidateSetProtocolIconMarkup(candidate)}</span></span><span class="forge-matrix-total"><small>RAW TOTAL</small><b>${candidate.score.total}</b></span><button type="button" class="forge-candidate-select" data-candidate-index="${index}">${selected?'STAGED':'STAGE LOAD'}</button></div><div class="forge-load-breakdown" id="forgeLoadBreakdown${index}" ${expanded?'':'hidden'}><div class="forge-breakdown-heading"><div><span>${maximized?'MAXIMIZED LOAD':'LOAD BREAKDOWN'}</span><strong>Five exact Bungie armour instances · no mods</strong></div><span>${esc(outcome)}</span></div><div class="forge-breakdown-items">${candidate.items.map(candidateItemMarkup).join('')}</div><div class="forge-breakdown-summary"><div><small>UNMODDED ARMOUR TOTAL</small><strong>${candidate.score.total}</strong></div><div><small>ACTIVE SET PROTOCOL</small><strong>${esc(candidateSetProtocol(candidate))}</strong></div><div class="forge-breakdown-actions"><button type="button" class="forge-candidate-select" data-candidate-index="${index}">${selected?'STAGED':'STAGE LOAD'}</button><button type="button" class="forge-candidate-evaluate" data-candidate-evaluate="${index}">EVALUATE IN BUILD FORGE</button></div></div></div></article>`;
}

function renderCandidates(){
  const panel=byId('forgeResults'),exotic=selectedExotic();panel.hidden=!exotic;
  const shown=Math.min(visibleCandidateCount,matchedBuilds.length),remaining=matchedBuilds.length-shown;
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  byId('forgeResultStatus').textContent=matchedBuilds.length?`${shown} OF ${evaluated.toLocaleString()} COMBINATIONS`:'0 COMBINATIONS';
  byId('forgeCandidateBuilds').innerHTML=matchedBuilds.length?matchedBuilds.slice(0,shown).map(candidateMarkup).join(''):'<div class="forge-empty">No complete owned-armour combination is available for this Exotic and set protocol.</div>';
  const more=byId('forgeShowMore');more.hidden=remaining<=0;more.textContent=remaining>0?`SHOW NEXT ${Math.min(CANDIDATE_BATCH_SIZE,remaining)} OF ${remaining}`:'';
}

function renderCandidateLoading(exotic){
  const panel=byId('forgeResults');panel.hidden=false;
  byId('forgeResultStatus').textContent='SCANNING OWNED ARMOUR';
  byId('forgeCandidateBuilds').innerHTML=`<div class="forge-empty">Locking ${esc(exotic.name)} into every load and finding the top ${CANDIDATE_BATCH_SIZE} exact owned combinations…</div>`;
  byId('forgeShowMore').hidden=true;
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

async function calculateBuilds(){
  const exotic=selectedExotic(),targets=targetValues();if(!exotic)return;
  const button=byId('forgeFindBuilds');button.disabled=true;button.textContent='CALCULATING VERIFIED LOADS…';
  renderCandidateLoading(exotic);
  byId('forgeRuntimeStatus').textContent=activeTargetCount()||activePriorityCount()?'Applying the Exotic anchor, set protocol and ranked stat constraints…':'No stat priority selected. Ranking the complete legal pool by maximum unmodded stats…';
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const scanStarted=performance.now();
  const secondaryScore=!setSelections.length?createOpenProtocolTieBreaker(exotic):null;
  matchedBuilds=matchTopArmourBuilds(armourItems(),targets,{...solverOptions(),limit:CANDIDATE_BATCH_SIZE,secondaryScore});
  if(!setSelections.length)matchedBuilds=rankOpenProtocolCandidates(matchedBuilds,exotic);
  const scanDuration=performance.now()-scanStarted;
  visibleCandidateCount=Math.min(CANDIDATE_BATCH_SIZE,matchedBuilds.length);
  selectedCandidateIndex=-1;selectedSlots.clear();configureStats();if(matchedBuilds.length)stageCandidate(0);else{renderStaged();renderCandidates();}
  button.textContent='REFRESH TOP 50 COMBINATIONS';button.disabled=false;
  const evaluated=Number(matchedBuilds.combinationsEvaluated||matchedBuilds.length);
  const durationLabel=scanDuration<1000?`${Math.max(1,Math.round(scanDuration))} ms`:`${(scanDuration/1000).toFixed(2)} s`;
  byId('forgeRuntimeStatus').textContent=matchedBuilds.length?`${evaluated.toLocaleString()} exact owned combinations scanned in ${durationLabel}. Showing the top ${matchedBuilds.length}; Load 1 is the best fit with ${exotic.name} locked${activeSetUpgradeTarget?`; ${activeSetUpgradeTarget.setName} remains an optional target upgrade`:''}.`:'No complete owned-armour combination satisfies the selected Exotic and set protocol.';
}

function resetResults(){matchedBuilds=[];selectedCandidateIndex=-1;expandedCandidateIndex=-1;visibleCandidateCount=0;selectedSlots.clear();renderStaged();renderCandidates();}

function selectExotic(key){
  const next=exoticGroups().find(group=>group.owned&&group.key===String(key||''));if(!next)return;
  selectedExoticKey=next.key;setSelections=[];resetResults();renderExotics();renderSetBonuses();configureStats({reset:true});
  const exotic=selectedExotic();
  byId('forgeRuntimeStatus').textContent=exotic?`${exotic.name} anchored. Ranking the maximum-stat owned load automatically.`:'Select an owned Exotic to initialise the Forge Loader.';
  if(exotic)void calculateBuilds();
}

function toggleBonus(input){
  const exotic=selectedExotic();if(!exotic)return;
  setSelections=toggleSetSelection(armourItems(),exotic,setSelections,{setHash:Number(input.dataset.setHash),count:Number(input.dataset.setCount)},input.checked);
  resetResults();renderSetBonuses();configureStats();
  byId('forgeRuntimeStatus').textContent=setSelections.length?`Set protocol active: ${setSelections.map(row=>`${row.count}-piece`).join(' + ')}. Stat ceilings recalculated.`:'No set bonus required. Stat ceilings recalculated from all compatible armour.';
  void calculateBuilds();
}

function openSetProtocol(){
  if(!selectedExotic())return;
  setSelections=[];resetResults();renderSetBonuses();configureStats();
  byId('forgeRuntimeStatus').textContent='Open armour active. Ranking the top owned combinations with verified Exotic-to-set perk evidence.';
  void calculateBuilds();
}

function setStatPriority(select){
  const rank=Number(select?.value||0);
  if(rank>0)for(const other of document.querySelectorAll('[data-stat-priority]'))if(other!==select&&Number(other.value)===rank)other.value='';
  resetResults();configureStats();
  byId('forgeRuntimeStatus').textContent=rank>0?`Priority ${rank} assigned. Re-ranking every legal owned-armour combination.`:'Priority returned to AUTO. Re-ranking by the remaining directives and maximum stats.';
  if(selectedExotic())void calculateBuilds();
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
  if(!item?.isExotic)return String(item?.source?.label||'OWNED').toUpperCase();
  const group=ownedExoticGroups(catalogue.armour,activeCharacterClass).find(row=>row.instances.some(instance=>itemKey(instance)===itemKey(item)));
  const instances=group?.instances||[item];
  const ordinal=Math.max(0,instances.findIndex(instance=>itemKey(instance)===itemKey(item)))+1;
  return instances.length>1?`THIS ROLL · OWNED ${ordinal} OF ${instances.length} IN VAULT CATALOGUE`:'THIS ROLL · OWNED';
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
  panel.innerHTML=`<div class="forge-inspect-brand">ASTRIX PARADOX · VERIFIED INSTANCE</div><div class="forge-inspect-tier"><h3>${esc(item.name)}</h3><p>${esc(`${item.slotLabel} · ${item.tier||'Exotic armour'}`)}</p></div><div class="forge-inspect-main">${item.icon?`<img src="${esc(item.icon)}" alt="">`:''}<div><strong>${statSummary}</strong><p>${esc(item.exoticPerk?.name||item.archetype?.name||'Verified armour')}</p><p>${esc(item.exoticPerk?.description||item.description||'')}</p></div></div>${inspectStatsMarkup(item)}<div class="forge-inspect-foot"><span>${esc(inspectOwnershipLabel(item))}</span><span>EXACT BUNGIE DATA</span></div>`;
  panel.hidden=false;panel.setAttribute('aria-hidden','false');requestAnimationFrame(()=>positionInspect(panel,target));
}

function hideInspect(){const panel=byId('forgeItemInspect');if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true');}}

async function evaluateInBuildForge(){
  const residency=renderCurrentResidency();
  if(!forgeLoaderEvaluateReady(residency,selectedSlots,activeCharacterId))return;
  const candidate=matchedBuilds[selectedCandidateIndex];if(!candidate)return;
  const binding=membershipBinding();
  byId('forgeRuntimeStatus').textContent='Protecting the verified equipped Guardian before Build Forge opens…';
  let profileBuild=residentProfileBuild?.characterId===activeCharacterId?residentProfileBuild:null;
  try{
    if(!profileBuild)profileBuild=await prepareResidentProfileBuild();
  }catch(error){
    console.error('[Forge Loader] The protected Guardian baseline could not be prepared.',error);
  }
  if(!profileBuild){byId('forgeRuntimeStatus').textContent='Build Forge could not resolve the equipped Guardian baseline. No build was changed.';return;}
  const snapshotEnvelope=createForgeLoaderBuildSnapshot(profileBuild,binding);
  const selected=prepareArmourSelection(payload,[...selectedSlots.values()]);
  const selection=createVaultArmourSelection({binding,slots:selected.map(item=>({slot:item.slotIndex,item})),sourcePage:'forge-loader',forgeLoaderDecision:forgeLoaderDecision(candidate,selectedCandidateIndex)});
  if(!snapshotEnvelope||!selection){byId('forgeRuntimeStatus').textContent='The verified Guardian transfer could not be prepared. No build was changed.';return;}
  byId('forgeRuntimeStatus').textContent='Securing the complete protected Build Forge transfer…';
  const transferStored=await cacheForgeLoaderTransfer(binding,{snapshotEnvelope,armourSelection:selection});
  let baselineStored=transferStored,selectionStored=transferStored;
  // IndexedDB is the atomic primary route. Use quota-limited Web Storage only
  // when that route is unavailable, rather than retaining three large copies.
  if(!transferStored){
    baselineStored=writeForgeLoaderBuildSnapshot(profileBuild,binding,{stores:[sessionStorage,localStorage],snapshotEnvelope});
    selectionStored=writeVaultArmourSelection(selection);
    if(!selectionStored){releaseGuardianSessionStorageFallbacks();selectionStored=writeVaultArmourSelection(selection);}
  }
  if(!selectionStored){byId('forgeRuntimeStatus').textContent='The protected staged load could not be stored on this device. No build was changed.';return;}
  if(!baselineStored&&!transferStored){
    byId('forgeRuntimeStatus').textContent='Browser storage is full. Build Forge will recover the protected Original Build directly from Bungie.';
    console.warn('[Forge Loader] Browser storage rejected the protected baseline; Build Forge will recover it from the authenticated Bungie profile.');
  }
  const url=new URL('../guardian-workspace-v2/paradox-build-space/',location.href);url.searchParams.set('vault','selection');url.searchParams.set('prewarm','forge-loader');
  if(!baselineStored&&!transferStored)url.searchParams.set('baseline','bungie-recovery');
  for(const [key,value] of Object.entries(binding))if(value)url.searchParams.set(key,value);
  markGuardianFastReturn();location.href=url;
}

function installEvents(){
  byId('forgeExoticSlots')?.addEventListener('click',event=>{const button=event.target.closest('[data-exotic-key]');if(button)selectExotic(button.dataset.exoticKey);});
  byId('forgeSetList')?.addEventListener('click',event=>{if(event.target.closest('[data-open-set-protocol]'))openSetProtocol();});
  byId('forgeSetList')?.addEventListener('change',event=>{const input=event.target.closest('[data-set-hash]');if(input)toggleBonus(input);});
  byId('forgeStatTargets')?.addEventListener('input',event=>{if(event.target.matches('[data-stat-priority]'))return;const label=event.target.closest('[data-target-stat]');if(!label)return;updateTargetLabel(label);resetResults();configureStats();byId('forgeRuntimeStatus').textContent='Stat target changed. Calculate to rank every legal combination.';});
  byId('forgeStatTargets')?.addEventListener('change',event=>{if(event.target.matches('[data-stat-priority]')){setStatPriority(event.target);return;}if(event.target.matches('input[type="range"]'))void calculateBuilds();});
  byId('forgeStatTargets')?.addEventListener('click',event=>{const button=event.target.closest('[data-max-stat]');if(!button)return;const label=button.closest('[data-target-stat]'),input=label?.querySelector('input'),key=label?.dataset?.targetStat;if(!input||!key)return;input.value=String(Math.min(ARMOUR_STAT_CAP,Math.max(0,Number(targetMaximums[key]||0))));updateTargetLabel(label);configureStats();void calculateBuilds();});
  byId('forgeFindBuilds')?.addEventListener('click',calculateBuilds);
  byId('forgeResetTargets')?.addEventListener('click',()=>{for(const input of document.querySelectorAll('[data-target-stat] input'))input.value='0';for(const select of document.querySelectorAll('[data-stat-priority]'))select.value='';resetResults();configureStats();byId('forgeRuntimeStatus').textContent='Stat targets and priorities reset. Ranking by maximum unmodded stats.';void calculateBuilds();});
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
  document.addEventListener('forge:character-selected',event=>{if(!payload)return;void(async()=>{resolveActiveCharacter(event.detail?.characterId);selectedExoticKey='';setSelections=[];resetResults();renderHero();renderExotics();renderSetBonuses();configureStats({reset:true});byId('forgeRuntimeStatus').textContent=`${classLabel()} selected. Verifying resident Forge sources.`;try{await completeResidentPreparation();renderHero();renderStaged();byId('forgeRuntimeStatus').textContent=residentReady?`${classLabel()} ready. Select an owned Exotic.`:'One or more verified Forge sources remain unavailable. Build Forge handoff stays locked.';}catch(error){console.error('[Forge Loader] Resident character preparation failed.',error);renderResidency('resident');byId('forgeRuntimeStatus').textContent=error?.message||'Verified character sources remain unavailable.';}})();});
  document.addEventListener('forge:manifest-progress',()=>reportPreparedPageStage('request','loadout'));
}

function reconcileForgeRefresh(){
  const refreshedByKey=new Map(catalogue.armour.map(item=>[itemKey(item),item]));
  for(const [slot,item] of [...selectedSlots]){
    const refreshed=refreshedByKey.get(itemKey(item));
    if(refreshed)selectedSlots.set(slot,refreshed);
    else selectedSlots.delete(slot);
  }
  const exotic=selectedExotic();
  if(!exotic){
    selectedExoticKey='';
    setSelections=[];
    selectedSlots.clear();
  }else{
    const availableSets=new Set(setBonusOptions(armourItems(),exotic,setSelections).map(row=>String(row.hash)));
    setSelections=setSelections.filter(row=>availableSets.has(String(row.setHash))&&(row.count===2||row.count===4));
  }
  matchedBuilds=[];
  selectedCandidateIndex=-1;
  expandedCandidateIndex=-1;
  visibleCandidateCount=0;
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
  renderSetBonuses();
  configureStats();
  renderStaged();
  renderCandidates();
  byId('forgeRuntimeStatus').textContent=selectedExotic()
    ?`${reason==='manual'?'Guardian data refreshed.':'Guardian data updated.'} Calculate to update ranked combinations.`
    :`${reason==='manual'?'Guardian data refreshed.':'Guardian data updated.'} Select an owned Exotic.`;
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
  installEvents();byId('forgeConnectButton').href=authStartUrl();renderResidency();renderStaged();
  try{
    session=await getBungieSession();
    if(session?.authenticated!==true){byId('forgeSignedOut').hidden=false;byId('forgeConnectionState').textContent='SIGNED OUT';byId('forgeHeaderState').textContent='CONNECT BUNGIE';globalThis.ForgeLoader?.authRequired?.(authStartUrl());return;}
    startForgeRefresh();
    byId('forgeConnectionState').textContent='VERIFYING SOURCES';payload=await loadVerifiedPayload();
    reportPreparedPageStage('render','loadout');catalogue=createVaultCatalogue(payload);resolveActiveCharacter(activeCharacterId);renderResidency('resident');await completeResidentPreparation();
    renderHero();renderExotics();renderSetBonuses();configureStats({reset:true});
    void forgeRefreshController.refreshNow().catch(()=>{});
    byId('forgeConnectionState').textContent=residentReady?'FORGE SOURCES READY':'FORGE SOURCES INCOMPLETE';
    const groups=exoticGroups(),ownedCount=groups.filter(group=>group.owned).length;byId('forgeRuntimeStatus').textContent=!residentReady?'One or more verified Forge sources remain unavailable. Build Forge handoff stays locked.':ownedCount?`${ownedCount} owned of ${groups.length} verified ${classLabel()} Exotic definition${groups.length===1?'':'s'}. Select an owned piece to begin.`:`${groups.length} verified ${classLabel()} Exotic definition${groups.length===1?'':'s'} shown; no owned instance can be selected.`;
    reportPreparedPageStage('ready','loadout');await settleVisibleImages();globalThis.ForgeLoader?.done?.();
  }catch(error){console.error('[Forge Loader]',error);byId('forgeConnectionState').textContent='ARMOUR UNAVAILABLE';byId('forgeRuntimeStatus').textContent=error?.message||'Verified Bungie armour is unavailable.';globalThis.ForgeLoader?.done?.();}
}

init();
