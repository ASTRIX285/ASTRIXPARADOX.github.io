import {ForgePreparationClient,preparationVariants} from './paradox-forge-preparation.mjs?v=20260909-super-evidence-1';
import {diffBuilds,createBuildState,createIntendedArtifactConfiguration,toggleIntendedArtifactPerk,createWorkingBuildPatch,createBuildPersistenceSnapshot,restoreBuildPersistenceSnapshot,protectBuildState,restoreWorkingBuild} from './paradox-build-state.mjs?v=20260904-memory-safe-transfer-1';
import {mountForgeShell} from '../platform-forge-shell.mjs';
import {armBuildTest,collectBuildTestResults,confirmCandidateActivity,captureMatchesCharacter,readCapture,readCaptureArchive} from '../guardian-shooting-range-capture.mjs?v=20260902-shared-account-orbit-1';
import {analyzeLiveGuardian,renderLiveAnalysis} from '../guardian-paradox-live-adapter.mjs?v=20260905-background-forge-1';
import {createLiveTransferPlan} from '../guardian-perk-change-plan.mjs?v=20260906-review-layout-1';
import {liveActionCapabilities,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan} from '../guardian-live-actions.mjs?v=20260906-live-equip-1&roll=20260909-apply-1';
import {armourCard} from '../guardian-gear-layout.mjs?v=20260908-set-icons-1&weapons=20260909-presentation-1&roll=20260909-apply-1&fix=20260909-apply-refresh-1';
import {openArmourDrawer} from '../guardian-beta-runtime.mjs?v=20260905-weapon-audit-1';
import {renderWeapons,openWeaponDetail,weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup} from '../guardian-semantic-ui.mjs?v=20260908-icon-hover-1&weapons=20260909-presentation-1&roll=20260909-apply-1&fix=20260909-apply-refresh-1';
import {adviseLiveWeaponRolls} from '../guardian-weapon-roll-advisor.mjs?v=20260905-worker-preflight-1';
import {renderEquippedSubclass,renderSubclassPicker,renderSuperFormation} from '../guardian-super-formation.mjs?v=20260829-subclass-identity-1';
import {mergeSubclassCatalog,mergeSuperOptions} from '../guardian-super-catalog.mjs?v=20260829-subclass-identity-1';
import {markGuardianFastReturn,readForgeLoaderTransfer,cacheBuildForgeState,readBuildForgeState} from '../guardian-session-cache.mjs?v=20260906-all-page-data-1';
import {guardianManifest} from '../guardian-manifest-service.mjs?v=20260906-all-page-data-1&roll=20260909-apply-1';
import {getBungieSession} from '../guardian-bungie-auth.mjs?v=20260905-manual-editor-1';
import {assertRenderablePagePayload} from '../../../core/page-ready-contract.mjs?v=20260906-page-data-recovery-1';
import {HANDOFF_SCHEMA,bindingOf,bindingsEqual,shouldReplaceBuildState,repairMissingBuildBinding,mergePreparedLoadoutContext,validateHandoffEnvelope} from '../paradox-build-binding.mjs?v=20260906-complete-build-transfer-2';
import {applyVaultArmourSelection,clearVaultArmourSelection,readVaultArmourSelection,validateVaultArmourSelection} from '../../vault/vault-selection-state.mjs?v=20260904-exotic-equip-rule-1';
import {applyForgeArtifactRecommendation,artifactPerkCatalogue} from './paradox-artifact-selection.mjs?v=20260906-complete-build-transfer-1';
import {BUILD_ELEMENTS,validateTierFiveArmour} from './paradox-build-recommendation.mjs';
import {composeForgeRecommendation,filterExoticCompatibleSubclasses,hasVerifiedSubclassSockets,rankExoticSuperSynergy,synchroniseSubclassProjection} from './paradox-forge-intelligence.mjs?v=20260909-super-evidence-1';
import {createLiveTransferPreflight,deriveLoadoutIntent,recommendArmourMods,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateLoadoutCoherence} from './paradox-loadout-intelligence.mjs?v=20260906-complete-build-transfer-1';
import {eligibleEquipment,filterManualEquipmentSources,recordManualEdit,socketGroups,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice} from './paradox-manual-editor.mjs?v=20260905-manual-editor-2';
import {saveParadoxLoadout} from './paradox-saved-loadouts.mjs?v=20260905-manual-editor-1';
import {createVaultCatalogue,prepareArmourSelection} from '../../vault/vault-inventory.mjs?v=20260905-manual-editor-1';
import {reportPreparedPageStage} from '../../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';
import '../guardian-character-cards.mjs?v=20260824-bungie-icons-3&loader=2';
import '../guardian-loadouts.mjs?v=20260905-loadout-actions-1';
import {normaliseLiveProfile} from '../guardian-bungie-profile.mjs?v=20260906-page-data-recovery-1&roll=20260909-apply-1';
import {revealRecommendedBuild} from './recommended-build-reveal.mjs?v=20260906-max-loadout-popup-1';
import '../guardian-portal-progress.mjs?v=20260906-all-page-data-1&loader=2';
import '../guardian-vault-access.mjs?v=20260902-forge-loader-1';
import {bindParadoxItemHover} from '../paradox-item-hover.mjs?v=20260908-icon-hover-1&weapons=20260909-presentation-1&roll=20260909-apply-1&fix=20260909-apply-refresh-1';

mountForgeShell({rootSelector:'.build-space',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie'});

const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';
const BUILD_SNAPSHOT_KEY='astrix:guardian-build-snapshot:v1';
const LOAD_STAGES=Object.freeze({SNAPSHOT:'start',VALIDATE:'session',PROFILE:'request',SOCKETS:'join',ARTIFACT:'render',READY:'ready'});
const BUNGIE='https://www.bungie.net';
const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const abs=path=>path?(String(path).startsWith('http')?path:`${BUNGIE}${path}`):'';
const iconOf=item=>item?.icon||item?.definition?.displayProperties?.icon||item?.displayProperties?.icon||'';
const elementOf=item=>{const text=[item?.element,item?.damageType,item?.name,item?.displayName,item?.definition?.itemTypeDisplayName,...(item?.definition?.traitIds||[])].filter(Boolean).join(' ').toLowerCase();return ['stasis','arc','strand','void','solar','prismatic'].find(value=>text.includes(value))||'unknown';};
const isPrismaticBuild=build=>[build?.subclass,build?.subclassName,build?.subclassBuild?.name].filter(Boolean).join(' ').toLowerCase().includes('prismatic');
let activeLoadError='';
let testDomain='pve';
let buildRenderSequence=0;
let volatileState=null;
let statePersistenceChain=Promise.resolve(true);
let statePersistenceRevision=0;
let selectedRecommendationElement='';
let selectedRecommendationObjective='';
let recommendationBusy=false;
let recommendationFailure='';
let preparationTimer=null;
let activePreparationKey='';
let explicitlySelectedCharacterId='';
let manualInventory=null;
let manualInventoryRequest=null;
let manualEditorState={kind:'weapon',slotIndex:0,search:'',visibleItems:[],socketOptions:new Map()};
let pendingApplyPlan=null;
let liveActionBusy=false;
let livePreflightBusy=false;
let livePreflightRequest=0;
const forgePreparation=new ForgePreparationClient({onStatus:message=>{
  const status=byId('forgePreparationStatus');
  if(status&&message.key===activePreparationKey)status.textContent=message.type==='ready'?'Build option ready':message.type==='error'?'This option needs additional verified data.':'Preparing build options…';
  if(recommendationBusy&&message.type==='progress'){const node=byId('forgeGenerationStatus');if(node)node.textContent=message.message;}
}});
function forgeVariants(build){return filterExoticCompatibleSubclasses(build,resolvedSubclassOptions(build).filter(hasVerifiedSubclassSockets)).map(candidate=>({element:elementOf(candidate),candidate})).filter(row=>BUILD_ELEMENTS.includes(row.element));}
function requestedForgeVariant(build,candidates=forgeVariants(build)){
  const candidate=candidates.find(row=>row.element===selectedRecommendationElement)?.candidate,sb=candidate?.subclassBuild||candidate?.build;
  const requested=Number(build.forgeRequestedSuperHash)||0;
  const superHash=requested&&[sb?.super,...(sb?.superOptions||[])].some(item=>Number(item?.hash??item?.bungieHash)===requested)?requested:0;
  return {element:selectedRecommendationElement,objective:selectedRecommendationObjective||'balanced',superHash};
}
async function prepareForgeBackground(build){
  if(!build?.forgeLoaderDecision||!validateTierFiveArmour(build).ready||!validateExoticLoadout(build,{requireArmourAnchor:true}).ready)return;
  const candidates=forgeVariants(build),variant=requestedForgeVariant(build,candidates);
  if(!candidates.some(row=>row.element===variant.element))return;
  const supplied=build.currentSeasonNumber??build.currentSeason?.seasonNumber,season=supplied!==null&&supplied!==undefined&&Number.isInteger(Number(supplied))?Number(supplied):await fetchCurrentArtifactSeason();
  if(currentBuild()!==build)return;
  forgePreparation.setInput(build,candidates,season);
  activePreparationKey=JSON.stringify([variant.element,variant.objective,variant.superHash]);
  forgePreparation.warm(preparationVariants(candidates,variant));
}
function scheduleForgePreparation(build,{immediate=false}={}){
  clearTimeout(preparationTimer);
  if(recommendationBusy||build?.recommendationGeneratedAt)return;
  const prepare=()=>void prepareForgeBackground(build).catch(error=>{const node=byId('forgePreparationStatus');if(node)node.textContent='Background preparation unavailable; Generate will retry.';console.info('[Forge preparation]',error.message);});
  if(immediate)queueMicrotask(prepare);else preparationTimer=setTimeout(prepare,200);
}
window.addEventListener('pagehide',()=>{clearTimeout(preparationTimer);forgePreparation.dispose();});
function validateBuildState(state,expectedBinding={},{protect=true}={}){
  if(!state||state.version!==1||!state.originalBuild||!state.workingBuild)return null;
  const originalBinding=bindingOf(state.originalBuild),workingBinding=bindingOf(state.workingBuild);
  if(!originalBinding.characterId||!bindingsEqual(originalBinding,workingBinding))return null;
  const expected=bindingOf(expectedBinding);
  if(expected.characterId&&expected.characterId!==originalBinding.characterId)return null;
  if(expected.membershipId&&expected.membershipId!==originalBinding.membershipId)return null;
  if(expected.membershipType&&expected.membershipType!==originalBinding.membershipType)return null;
  return protect?protectBuildState(state):state;
}
function decodeState(raw,{durable=false,expectedBinding={}}={}){
  if(!raw||typeof raw!=='object')return null;
  if(raw.schemaVersion===HANDOFF_SCHEMA){
    const payload=validateHandoffEnvelope(raw);
    const state=payload?.originalBuild?payload:(payload?.characterId?createBuildState(payload):null);
    return state?validateBuildState(state,expectedBinding):null;
  }
  return durable?null:validateBuildState(raw,expectedBinding);
}
function readState(){
  activeLoadError='';
  const params=new URLSearchParams(location.search),expectedCharacterId=params.get('characterId')||'',expectedMembershipId=params.get('membershipId')||'',expectedMembershipType=params.get('membershipType')||'';
  const expectedBinding={characterId:expectedCharacterId,membershipId:expectedMembershipId,membershipType:expectedMembershipType};
  if(volatileState){const state=validateBuildState(volatileState,expectedBinding,{protect:false});if(state)return state;volatileState=null;}
  // The explicit Character -> Build handoff contains the post-enrichment armour
  // state (including resolved set bonuses). The generic profile snapshot is a
  // recovery fallback only and must not replace that selected build.
  for(const key of [BUILD_SPACE_KEY,BUILD_SNAPSHOT_KEY]){
    for(const [store,durable] of [[sessionStorage,false],[localStorage,true]]){
      try{
        const raw=JSON.parse(store.getItem(key)||'null'),state=decodeState(raw,{durable,expectedBinding});
        if(state){
          writeState(state);
          for(const target of [sessionStorage,localStorage])for(const staleKey of [BUILD_SPACE_KEY,BUILD_SNAPSHOT_KEY]){try{target.removeItem(staleKey);}catch{}}
          return state;
        }
        if(raw)store.removeItem(key);
      }
      catch{activeLoadError='The protected Build Forge snapshot could not be read on this device.';}
    }
  }
  activeLoadError=activeLoadError||(params.get('baseline')==='bungie-recovery'?'Recovering the protected Original Build from the Bungie profile.':'No current Build Forge snapshot was found. Return to the Guardian page and choose Improve My Guardian again.');
  return null;
}
function emitLoad(stage,preparedStage,label,status='loading',message=''){
  const shared=reportPreparedPageStage(preparedStage,'build-forge',{buildStage:stage,status});
  window.dispatchEvent(new CustomEvent('forge:build-load-progress',{detail:{stage,percent:shared.percent,label:shared.label,status,message}}));
}
document.addEventListener('forge:manifest-progress',()=>reportPreparedPageStage('request','build-forge'));
function tile(item){if(!item)return '<span class="icon-tile empty">◆</span>';const icon=abs(iconOf(item)),name=esc(item.name||'Destiny item');return `<span class="icon-tile" title="${name}">${icon?`<img src="${esc(icon)}" alt="${name}">`:'◆'}</span>`;}
function weaponCardShell(index){return `<div class="weap"><div class="art ph"><span class="ph-glyph">⌖</span></div><div class="cap"><b>Weapon slot ${index+1}</b><small>Awaiting resolved weapon semantics</small></div></div>`;}
function gearCard(item,fallback){const index=Math.max(0,(Number(String(fallback).match(/\d+/)?.[0])||1)-1);return String(fallback).startsWith('Weapon')?weaponCardShell(index):armourCard(index,item);}
function blankArmourModCanvas(){
  const blankSlots=Array.from({length:6},()=>'<button class="gear-mod is-recommendation-pending" type="button" title="AI recommendation pending" aria-label="AI recommendation pending" disabled><span class="ph-glyph" aria-hidden="true">◇</span></button>').join('');
  document.querySelectorAll('#armourGrid .gear-mods').forEach(grid=>{grid.classList.add('is-recommendation-pending');grid.dataset.modPresentation='pending';grid.setAttribute('aria-label','Blank AI mod recommendation canvas');grid.innerHTML=blankSlots;});
}
function renderArmourRecommendationState(build={}){
  const generated=Boolean(build.recommendationGeneratedAt),manual=build.editMode==='manual',state=byId('armourBuildState'),instruction=byId('armourBuildInstruction'),evidence=byId('armourBuildEvidence');
  if(state)state.textContent=generated?'PARADOX RECOMMENDATION · REVIEW REQUIRED':manual?'MANUAL WORKING BUILD':'STAGED ARMOUR · MOD PLAN PENDING';
  if(instruction)instruction.textContent=generated?'AI mod plan generated · review the recommendation before live action':manual?'Exact owned armour and verified reusable mods staged manually.':'Choose exact owned armour manually, or select an elemental build and generate an AI sequence.';
  if(evidence)evidence.textContent=generated?'Original and installed mods remain protected':manual?'Every manual socket choice retains Bungie instance and reusable-plug evidence.':'Installed mods retained as evaluation evidence';
  if(!generated&&!manual)blankArmourModCanvas();
}
function renderBuildGear(build={}){byId('weaponGrid').innerHTML=Array.from({length:3},(_,i)=>gearCard(build.weapons?.[i],`Weapon slot ${i+1}`)).join('');byId('armourGrid').innerHTML=Array.from({length:5},(_,i)=>gearCard(build.armour?.[i],`Armour slot ${i+1}`)).join('');byId('armourGrid').querySelectorAll('.gear-slot .arm').forEach((node,index)=>bindParadoxItemHover(node,build.armour?.[index],'armour'));renderArmourRecommendationState(build);renderWeapons(build.weapons||[]);byId('weaponRecommendationState').textContent=build.recommendationGeneratedAt?'PARADOX VERIFIED SELECTION':build.editMode==='manual'?'MANUAL WORKING BUILD':'MANUAL OR PARADOX';}
function currentBuild(){const state=readState();return state?.workingBuild||state?.originalBuild||null;}

const manualItemId=item=>String(item?.itemInstanceId||item?.instanceId||'');
const manualHash=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
function setLiveActionBanner(message,state=''){
  const node=byId('liveActionBanner');if(!node)return;
  node.className=`live-action-banner${state?` is-${state}`:''}`;node.textContent=message;
}
function manualSlotLabels(kind){return kind==='weapon'?['KINETIC','ENERGY','POWER']:['HELMET','GAUNTLETS','CHEST','LEGS','CLASS ITEM'];}
function currentManualItem(build,kind,slotIndex){return (kind==='weapon'?build?.weapons:build?.armour)?.[slotIndex]||null;}
function manualInventoryKey(build={}){return `${build.membershipType}:${build.membershipId||build.bungieMembershipId}:${build.characterId}`;}
async function loadManualInventory(build={}){
  const key=manualInventoryKey(build);
  if(manualInventory?.key===key)return manualInventory;
  if(manualInventoryRequest?.key===key)return manualInventoryRequest.promise;
  const promise=(async()=>{
    await guardianManifest.ready();
    const payload=assertRenderablePagePayload(globalThis.FORGE_PAGE_PAYLOAD||await globalThis.FORGE_PAGE_PAYLOAD_PROMISE,'build-forge');
    await guardianManifest.hydratePayload(payload,{allowNetwork:false});
    const session=globalThis.FORGE_BUNGIE_SESSION||await getBungieSession(),normalized=normaliseLiveProfile(payload,session,build.characterId),vault=createVaultCatalogue(payload);
    const unique=(rows,current)=>{const map=new Map();for(const item of [...(rows||[]),...(current||[])])if(manualItemId(item))map.set(manualItemId(item),item);return [...map.values()];};
    const activeCharacterId=String(build.characterId||'');
    manualInventory={key,payload,weapons:filterManualEquipmentSources(unique(normalized.ownedWeapons,build.weapons),activeCharacterId),armour:prepareArmourSelection(payload,filterManualEquipmentSources(unique(vault.armour,build.armour),activeCharacterId)),loadedAt:new Date().toISOString()};
    return manualInventory;
  })();
  manualInventoryRequest={key,promise};
  try{return await promise;}finally{if(manualInventoryRequest?.promise===promise)manualInventoryRequest=null;}
}
function manualItemCard(item,index,selected){
  const icon=abs(iconOf(item)),name=esc(item?.name||'Destiny item'),source=esc(item?.source?.label||item?.source?.kind||'Owned'),power=Number(item?.power),meta=[source,Number.isFinite(power)?`POWER ${power}`:'',item?.weaponType||item?.slotLabel||item?.tier].filter(Boolean).join(' · '),exotic=Boolean(item?.isExotic||String(item?.tier||'').toLowerCase()==='exotic');
  return `<button type="button" class="manual-item-card${selected?' is-selected':''}${exotic?' is-exotic':''}" data-manual-item-index="${index}" aria-pressed="${selected}" title="${name} · exact instance ${esc(manualItemId(item))}"><span>${icon?`<img src="${esc(icon)}" alt="">`:'◆'}</span><span><b>${name}</b><small>${esc(meta)}</small></span></button>`;
}
function renderManualEditor(){
  const build=currentBuild(),kind=manualEditorState.kind,slotIndex=manualEditorState.slotIndex,labels=manualSlotLabels(kind),catalogue=manualInventory?.key===manualInventoryKey(build)?manualInventory[kind==='weapon'?'weapons':'armour']:[],current=currentManualItem(build,kind,slotIndex),search=manualEditorState.search.trim().toLowerCase();
  byId('manualEditorTitle').textContent=kind==='weapon'?'EDIT WEAPONS & PERKS':'EDIT ARMOUR & MODS';
  byId('manualEditorSubtitle').textContent=`${String(build?.characterClass||'Guardian').toUpperCase()} · ${labels[slotIndex]} · changes remain in the Working Build`;
  byId('manualEditorSlots').innerHTML=labels.map((label,index)=>`<button type="button" data-manual-slot="${index}" class="${index===slotIndex?'is-active':''}" aria-pressed="${index===slotIndex}">${label}</button>`).join('');
  let rows=eligibleEquipment(catalogue,build||{},kind,slotIndex);
  if(search)rows=rows.filter(item=>[item?.name,item?.source?.label,item?.source?.kind,item?.weaponType,item?.tier,item?.slotLabel].filter(Boolean).join(' ').toLowerCase().includes(search));
  manualEditorState.visibleItems=rows;
  byId('manualEditorItems').innerHTML=rows.length?rows.map((item,index)=>manualItemCard(item,index,manualItemId(item)===manualItemId(current))).join(''):'<div class="manual-editor-status is-bad">No exact owned item matches this slot and search.</div>';
  byId('manualEditorItems').querySelectorAll('[data-manual-item-index]').forEach(node=>bindParadoxItemHover(node,rows[Number(node.dataset.manualItemIndex)],manualEditorState.kind));
  const status=byId('manualEditorStatus');if(status){status.className='manual-editor-status';status.textContent=manualInventory?`${rows.length} exact owned option${rows.length===1?'':'s'} · select an item, then choose any verified reusable socket option below.`:'Loading exact owned inventory…';}
  const groups=socketGroups(current,kind),optionMap=new Map();manualEditorState.socketOptions=optionMap;
  byId('manualEditorSockets').innerHTML=groups.length?`<div class="manual-socket-groups">${groups.map(group=>`<div class="manual-socket-group"><strong>${esc(group.label)} · SOCKET ${group.socketIndex+1}</strong><div class="manual-socket-options">${group.options.map((option,index)=>{const key=`${group.socketIndex}:${index}`,selected=manualHash(group.current)===manualHash(option),icon=abs(iconOf(option));optionMap.set(key,{socketIndex:group.socketIndex,option});return `<button type="button" class="manual-socket-option${selected?' is-selected':''}" data-manual-socket-option="${key}" aria-pressed="${selected}" title="${esc(option?.description||option?.name||'Verified socket option')}">${icon?`<img src="${esc(icon)}" alt="">`:'<span>◆</span>'}<b>${esc(option?.name||'Verified option')}</b></button>`;}).join('')}</div></div>`).join('')}</div>`:'<div class="manual-editor-status">No free, reversible socket alternatives were verified for this exact item. Other changes remain available as explicit in-game steps.</div>';
}
async function openManualEditor(kind='weapon'){
  const build=currentBuild(),dialog=byId('manualBuildEditor');if(!build||!dialog)return;
  manualEditorState={kind:kind==='armour'?'armour':'weapon',slotIndex:0,search:'',visibleItems:[],socketOptions:new Map()};
  byId('manualEditorSearch').value='';dialog.hidden=false;document.body.classList.add('manual-editor-open');renderManualEditor();
  try{await loadManualInventory(build);if(!dialog.hidden&&manualInventoryKey(currentBuild())===manualInventory?.key)renderManualEditor();}
  catch(error){const status=byId('manualEditorStatus');if(status){status.className='manual-editor-status is-bad';status.textContent=error?.message||'Exact owned inventory could not be loaded.';}}
}
function closeManualEditor(){const dialog=byId('manualBuildEditor');if(dialog)dialog.hidden=true;document.body.classList.remove('manual-editor-open');document.querySelector(`[data-open-manual-editor="${manualEditorState.kind}"]`)?.focus();}
function stageManualItem(index){
  const item=manualEditorState.visibleItems[index];if(!item)return;
  try{stageWorkingBuild(working=>{stageEquipmentChoice(working,manualEditorState.kind,manualEditorState.slotIndex,item);if(manualEditorState.kind==='armour'&&manualInventory?.payload)working.armour=prepareArmourSelection(manualInventory.payload,working.armour);});renderManualEditor();setLiveActionBanner(`${item.name||'Item'} staged in the manual Working Build. Live Guardian unchanged.`,'good');}
  catch(error){const status=byId('manualEditorStatus');if(status){status.className='manual-editor-status is-bad';status.textContent=error?.message||'This equipment choice is not compatible.';}}
}
function stageManualSocket(key){
  const choice=manualEditorState.socketOptions.get(key);if(!choice)return;
  try{stageWorkingBuild(working=>{stageSocketChoice(working,manualEditorState.kind,manualEditorState.slotIndex,choice.socketIndex,choice.option);if(manualEditorState.kind==='armour'&&manualInventory?.payload)working.armour=prepareArmourSelection(manualInventory.payload,working.armour);});renderManualEditor();setLiveActionBanner(`${choice.option.name||'Socket option'} staged. Live Guardian unchanged.`,'good');}
  catch(error){const status=byId('manualEditorStatus');if(status){status.className='manual-editor-status is-bad';status.textContent=error?.message||'This socket option is not compatible.';}}
}

function openSaveParadoxDialog(suggestedName=''){
  const build=currentBuild(),dialog=byId('saveParadoxDialog');if(!build||!dialog)return;
  const updating=Boolean(build.savedParadoxLoadoutId),title=byId('saveParadoxTitle'),submit=byId('saveParadoxForm')?.querySelector('[type="submit"]');
  if(title)title.textContent=updating?'UPDATE PARADOX LOADOUT':'SAVE PARADOX LOADOUT';if(submit)submit.textContent=updating?'UPDATE PARADOX COPY':'SAVE PARADOX COPY';
  byId('saveParadoxName').value=suggestedName||build.savedParadoxLoadoutName||`${String(build.characterClass||'Guardian').toUpperCase()} · ${build.subclassName||build.subclass||'BUILD'}`;
  byId('saveParadoxDescription').value=build.savedParadoxLoadoutDescription||'';byId('saveParadoxStatus').textContent=updating?'This updates the named browser-only PARADOX record. Its Bungie source slot remains untouched.':'This creates a named copy in this browser only. It does not sync across devices or overwrite a Bungie slot.';dialog.hidden=false;document.body.classList.add('working-dialog-open');queueMicrotask(()=>byId('saveParadoxName')?.select());
}
function closeSaveParadoxDialog(){const dialog=byId('saveParadoxDialog');if(dialog)dialog.hidden=true;document.body.classList.remove('working-dialog-open');byId('saveParadoxBuild')?.focus();}
async function submitParadoxSave(event){
  event.preventDefault();const status=byId('saveParadoxStatus'),button=event.currentTarget.querySelector('[type="submit"]');if(button)button.disabled=true;
  try{const build=currentBuild(),record=await saveParadoxLoadout({id:build?.savedParadoxLoadoutId||null,name:byId('saveParadoxName').value,description:byId('saveParadoxDescription').value,build});if(!record)throw new Error('The browser could not persist this PARADOX loadout.');const state=readState();if(state?.workingBuild)writeState({...state,workingBuild:{...state.workingBuild,savedParadoxLoadoutId:record.id,savedParadoxLoadoutName:record.name,savedParadoxLoadoutDescription:record.description}});closeSaveParadoxDialog();setLiveActionBanner(`PARADOX loadout “${record.name}” saved separately from Bungie slots.`,'good');}
  catch(error){if(status){status.className='is-bad';status.textContent=error?.message||'Unable to save this PARADOX loadout.';}}
  finally{if(button)button.disabled=false;}
}

function buildLivePlan(){
  const state=readState(),build=state?.workingBuild||state?.originalBuild||{},advice=build.weaponRollAdvice||build.paradoxAnalysis?.weaponRollAdvice,preflight=createLiveTransferPreflight(build),capabilities=liveActionCapabilities(globalThis.FORGE_BUNGIE_SESSION),plan=createLiveTransferPlan({build,originalBuild:state?.originalBuild||{},advice,capabilities});
  if(!preflight.ready)plan.blockers=[...new Set([...(preflight.violations||[]),...(plan.blockers||[])])];
  plan.ready=preflight.ready&&plan.blockers.length===0;plan.status=plan.ready?'staged':'blocked';plan.preflight=preflight;return plan;
}
function renderApplyControls(build={}, {preserveBanner=false}={}){
  const plan=buildLivePlan(),reason=plan.blockers?.[0]||'The exact Working Build is not ready for Apply.';
  for(const id of ['applyBuild','applyWorkingBuild']){const button=byId(id);if(button){button.disabled=!plan.ready||liveActionBusy||livePreflightBusy;button.title=plan.ready?'Run a non-mutating live preflight, then review the exact transfer, equip, socket and readback sequence.':reason;}}
  const save=byId('saveParadoxBuild');if(save){save.disabled=!/^\d+$/.test(String(build.characterId||''));save.title=save.disabled?'Load a Bungie Guardian build first.':'Save a separate named PARADOX copy.';}
  if(!liveActionBusy&&!preserveBanner&&byId('liveActionBanner'))setLiveActionBanner(plan.ready?`Apply ready · ${plan.equipment.targets.length} exact items · ${plan.socketChanges.length} verified socket change${plan.socketChanges.length===1?'':'s'}${plan.inGameSteps.length?` · ${plan.inGameSteps.length} in-game step${plan.inGameSteps.length===1?'':'s'}`:''}.`:`Apply blocked · ${reason}`,plan.ready?'':'warn');
  return plan;
}
function closeApplyConfirmation(){livePreflightRequest+=1;livePreflightBusy=false;const dialog=byId('applyConfirmationDialog');if(dialog)dialog.hidden=true;document.body.classList.remove('working-dialog-open');pendingApplyPlan=null;}
async function openApplyConfirmation(){
  if(liveActionBusy||livePreflightBusy)return;
  const sourceState=readState(),plan=buildLivePlan(),dialog=byId('applyConfirmationDialog');if(!plan.ready||!dialog){setLiveActionBanner(`Apply blocked · ${plan.blockers?.[0]||'validation failed.'}`,'bad');return;}
  const request=++livePreflightRequest;livePreflightBusy=true;renderApplyControls(currentBuild()||{},{preserveBanner:true});setLiveActionBanner('Apply preflight · checking fresh Guardian, ownership, location, compatibility, Exotic, socket and activity evidence. No live changes are being made.','running');
  try{
    let session=globalThis.FORGE_BUNGIE_SESSION;if(!session?.csrfToken)session=await getBungieSession({force:true});
    const staged=await stageLiveTransferPreflight(plan,{session});
    if(request!==livePreflightRequest||readState()!==sourceState){setLiveActionBanner('Apply preflight cancelled because the Working Build changed. Review it and try again.','warn');return;}
    if(!staged.ready){setLiveActionBanner(`Apply blocked · ${staged.blockers?.[0]||'live preflight failed.'}`,'bad');return;}
    pendingApplyPlan=staged;byId('applyConfirmationGuardian').textContent=`Guardian ${staged.characterId} · membership ${staged.membershipType}:${staged.membershipId} · live preflight passed`;
    const equipment=staged.equipment.targets.map(row=>`<li>${esc(row.kind.toUpperCase())} · ${esc(row.name)} · ${esc(row.itemInstanceId)}</li>`).join(''),sockets=staged.socketChanges.map(row=>`<li>${esc(row.itemName||row.itemInstanceId)} · socket ${row.socketIndex+1} → ${esc(row.plugName||row.plugHash)}</li>`).join(''),steps=staged.inGameSteps.map(row=>`<li>${esc(row)}</li>`).join('');
    byId('applyConfirmationSummary').innerHTML=`<div class="apply-confirmation-summary"><section><h3>EXACT EQUIPMENT</h3><ul>${equipment}</ul></section><section><h3>REMOTE SOCKET CHANGES</h3><ul>${sockets||'<li>No remote socket changes staged.</li>'}</ul></section>${steps?`<section class="manual-steps"><h3>AFTER APPLY · IN-GAME STEPS</h3><ul>${steps}</ul></section>`:''}</div>`;
    dialog.hidden=false;document.body.classList.add('working-dialog-open');byId('confirmApplyBuild')?.focus();
  }catch(error){if(request===livePreflightRequest)setLiveActionBanner(`Apply blocked · ${error?.message||'live preflight failed.'}`,'bad');}
  finally{if(request===livePreflightRequest){livePreflightBusy=false;renderApplyControls(currentBuild()||{},{preserveBanner:true});}}
}
async function executeConfirmedApply(){
  const plan=pendingApplyPlan;if(!plan||liveActionBusy)return;
  liveActionBusy=true;const confirm=byId('confirmApplyBuild');if(confirm)confirm.disabled=true;const dialog=byId('applyConfirmationDialog');if(dialog)dialog.hidden=true;document.body.classList.remove('working-dialog-open');
  try{
    let session=globalThis.FORGE_BUNGIE_SESSION;if(!session?.csrfToken)session=await getBungieSession({force:true});
    const result=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{session,onProgress:row=>setLiveActionBanner(row.label||'Applying Working Build…','running')});
    const state=readState();if(state?.workingBuild)writeState({...state,workingBuild:{...state.workingBuild,liveTransferResult:result}});
    showRangeOutput(result);
    if(result.status==='applied')setLiveActionBanner(`Apply verified · Bungie readback matched all ${plan.equipment.targets.length} exact equipment targets${plan.socketChanges.length?` and ${plan.socketChanges.length} socket change${plan.socketChanges.length===1?'':'s'}`:''}.`,'good');
    else if(result.status==='blocked')setLiveActionBanner(`No live changes made · ${result.steps.find(row=>row.status==='blocked')?.detail?.[0]||'fresh ownership validation blocked Apply.'}`,'bad');
    else setLiveActionBanner('Apply partially completed. Review the detailed result before retrying; no automatic rollback was attempted.','bad');
    document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'post-apply',characterId:plan.characterId}}));
  }catch(error){setLiveActionBanner(`${error?.message||'Apply failed.'} No further live steps were attempted.`,'bad');showRangeOutput({status:'failed-before-completion',message:error?.message||String(error),plan});}
  finally{liveActionBusy=false;pendingApplyPlan=null;if(confirm)confirm.disabled=false;renderApplyControls(currentBuild()||{},{preserveBanner:true});}
}

function verifiedActivities(build,domain=testDomain){
  const sources=[build?.availableActivities,build?.activityCatalog?.activities,build?.catalog?.activities].find(Array.isArray)||[];
  return sources.filter(row=>{
    if(row?.source&&row.source!=='bungie-definition')return false;
    const declared=String(row?.domain||row?.testDomain||row?.activityModeCategory||'').toLowerCase();
    if(declared)return declared===domain;
    if(typeof row?.isPvP==='boolean')return domain==='pvp'?row.isPvP:!row.isPvP;
    return false;
  }).filter(row=>Number(row?.hash||row?.activityHash||row?.activityTypeHash||row?.mode)>0);
}
function selectedExpectedActivity(){const node=byId('expectedActivity'),row=verifiedActivities(currentBuild()).find(item=>String(item.hash||item.activityHash||item.activityTypeHash||item.mode)===node?.value);return row?{activityHash:Number(row.activityHash||row.hash)||null,activityTypeHash:Number(row.activityTypeHash)||null,mode:Number(row.mode)||null,mapHash:Number(row.mapHash)||null,modifierHashes:Array.isArray(row.modifierHashes)?row.modifierHashes:[],name:String(row.name||row.displayName||'Bungie activity'),source:'bungie-definition'}:null;}
function renderTestConfiguration(){const build=currentBuild(),node=byId('expectedActivity'),rows=verifiedActivities(build),destination=byId('expectedDestination'),destinationApi=globalThis.ForgeDestinations;if(destination&&destinationApi){destination.innerHTML=destinationApi.options().map(option=>'<option value="'+esc(option.key)+'">'+esc(option.label.toUpperCase())+'</option>').join('');destination.value=destinationApi.current();}if(node){node.innerHTML='<option value="">ANY COMPLETED ACTIVITY</option>'+rows.map(row=>'<option value="'+esc(row.hash||row.activityHash||row.activityTypeHash||row.mode)+'">'+esc(row.name||row.displayName||'Bungie activity '+(row.hash||row.activityHash))+'</option>').join('');}byId('testDomainLabel').textContent=testDomain.toUpperCase()+' BUILD TEST';byId('calibrationOption').hidden=testDomain!=='pve';byId('testContextNote').textContent=testDomain==='pvp'?'Crucible modes appear only when resolved from current Bungie activity definitions. Map and modifier context can attach to the same verified intake contract.':'Select a verified PvE activity, leave Any Activity selected, or use optional Shooting Range calibration.';document.querySelectorAll('[data-test-domain]').forEach(button=>{const active=button.dataset.testDomain===testDomain;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});}

function queueStatePersistence(state){
  const snapshot=createBuildPersistenceSnapshot(state),binding=bindingOf(state),revision=++statePersistenceRevision;
  statePersistenceChain=statePersistenceChain.catch(()=>false).then(()=>cacheBuildForgeState(binding,snapshot)).then(stored=>{
    if(!stored&&revision===statePersistenceRevision)setLiveActionBanner('This Working Build could not be saved for refresh. Keep this tab open and retry the edit.','warn');
    return stored;
  });
  return statePersistenceChain;
}
function writeState(next){
  const state=protectBuildState(next);
  if(volatileState!==state)forgePreparation.invalidate();
  volatileState=state;
  void queueStatePersistence(state);
  return true;
}
function requestedTransferBinding(){const params=new URLSearchParams(location.search);return {characterId:params.get('characterId')||'',membershipId:params.get('membershipId')||'',membershipType:params.get('membershipType')||''};}
async function restorePersistedBuildState(){
  const binding=requestedTransferBinding(),snapshot=await readBuildForgeState(binding),restored=restoreBuildPersistenceSnapshot(snapshot||{}),state=validateBuildState(restored,binding);
  if(!state)return null;
  volatileState=state;activeLoadError='';return state;
}
async function restoreAtomicForgeTransfer(){
  if(new URLSearchParams(location.search).get('vault')!=='selection')return null;
  const binding=requestedTransferBinding(),transfer=await readForgeLoaderTransfer(binding);
  if(!transfer)return null;
  const source=validateHandoffEnvelope(transfer.snapshotEnvelope,{expectedCharacterId:binding.characterId,expectedMembershipId:binding.membershipId,expectedMembershipType:binding.membershipType});
  const selection=validateVaultArmourSelection(transfer.armourSelection,{expectedBinding:binding});
  if(!source||!selection)return null;
  const baseline=source?.originalBuild?validateBuildState(source,binding):createBuildState(source);
  const applied=applyVaultArmourSelection(baseline,selection);
  if(!applied.applied)return null;
  writeState(applied.state);
  clearVaultArmourSelection();
  return volatileState;
}
function applyPendingVaultSelection(state){
  if(!state?.originalBuild||!state?.workingBuild||new URLSearchParams(location.search).get('vault')!=='selection')return state;
  const expectedBinding=bindingOf(state);
  const selection=readVaultArmourSelection({expectedBinding});
  if(!selection)return state;
  const result=applyVaultArmourSelection(state,selection);
  if(!result.applied)return state;
  try{
    const analysis=analyzeLiveGuardian(result.state.workingBuild);
    result.state.workingBuild.paradoxAnalysis=analysis||null;
  }catch(error){
    result.state.workingBuild.paradoxAnalysis=null;
    console.error('Build Forge retained the protected Forge Loader selection after PARADOX analysis failed.',error);
  }
  clearVaultArmourSelection();
  return result.state;
}
function switchBuildCharacter(detail={}){
  if(detail?.source!=="bungie-live"||!detail.characterId)return;
  const current=readState(),params=new URLSearchParams(location.search),incomingCharacterId=String(detail.characterId);
  const replace=shouldReplaceBuildState(current,detail,{vaultSelection:params.get('vault')==='selection',explicitlySelectedCharacterId});
  if(!replace){const repaired=repairMissingBuildBinding(current,detail),hydrated=mergePreparedLoadoutContext(repaired,detail);if(hydrated!==current){writeState(hydrated);render();}return;}
  if(explicitlySelectedCharacterId===incomingCharacterId)explicitlySelectedCharacterId='';
  const requested=requestedTransferBinding(),boundDetail={...detail,membershipId:detail.membershipId||requested.membershipId,membershipType:detail.membershipType??requested.membershipType};
  const next=applyPendingVaultSelection(createBuildState(boundDetail));writeState(next);render();
}
function recoverMissingBuild(detail={}){if(detail?.source!=="bungie-live"||!detail.characterId||readState())return;switchBuildCharacter(detail);}
function settleBuildImage(image){if(!image?.src||image.hidden||image.closest('[hidden]')||image.complete)return Promise.resolve();return Promise.race([typeof image.decode==='function'?image.decode().catch(()=>{}):new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}),new Promise(resolve=>setTimeout(resolve,5000))]);}
function completeBuildRender(build){
  const sequence=++buildRenderSequence;
  requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    if(sequence!==buildRenderSequence)return;
    const images=[...document.querySelectorAll('.build-space img,.build-character-selector img')].filter(image=>!image.closest('[hidden]'));
    await Promise.all(images.map(settleBuildImage));
    if(sequence!==buildRenderSequence)return;
    guardianManifest.ready().finally(()=>{
      if(sequence!==buildRenderSequence)return;
      const ready=Boolean(build),status=ready?'ready':'pending',label=ready?'Build Forge rendered':'Waiting for Guardian build';
      emitLoad('render',ready?LOAD_STAGES.READY:LOAD_STAGES.SNAPSHOT,label,status);
      document.dispatchEvent(new CustomEvent('forge:build-render-complete',{detail:{status,characterId:String(build?.characterId||''),selectedLoadoutIndex:Number.isInteger(build?.selectedLoadoutIndex)?build.selectedLoadoutIndex:null,renderedImages:images.filter(image=>image.complete&&image.naturalWidth>0).length}}));
    });
  }));
}
const list=(...values)=>values.find(Array.isArray)||[];
function resolvedSubclassOptions(build){const options=list(build?.subclassCatalog,build?.availableSubclasses,build?.subclassOptions,build?.resolvedSubclasses,build?.catalog?.subclasses);const current={name:build?.subclassName||build?.subclass||'Subclass',element:build?.subclass,icon:build?.subclassIcon,subclassBuild:build?.subclassBuild};return mergeSubclassCatalog(options.length?options:[current],build?.characterClass||'hunter');}
function resolvedOptions(build,kind){const sb=build?.subclassBuild||{},cap=kind[0].toUpperCase()+kind.slice(1),pluralCap=kind==='super'?'Supers':kind==='artifact'?'Artifacts':cap,equipped=kind==='super'?[sb.super].filter(Boolean):kind==='artifact'?[build.artifact].filter(Boolean):list(sb[kind],build?.[kind]),options=list(sb['available'+cap],sb['available'+pluralCap],sb[kind+'Options'],build?.['available'+cap],build?.['available'+pluralCap],build?.[kind+'Options'],build?.resolvedOptions?.[kind]),merged=[...equipped,...options].filter(Boolean);if(kind==='super')return mergeSuperOptions(build?.characterClass||'hunter',build?.subclass||build?.subclassName||'',merged);return merged.filter((item,index,all)=>{const key=item?.hash??item?.itemHash??item?.name??iconOf(item);return all.findIndex(other=>(other?.hash??other?.itemHash??other?.name??iconOf(other))===key)===index;});}
function itemKey(item){return String(item?.hash??item?.itemHash??item?.name??iconOf(item)??'');}
function selectorCard(item,{kind,index,selected=false,recommended=false}={}){const icon=abs(iconOf(item)),name=esc(item?.name||item?.displayName||'Resolved option'),element=elementOf(item);return '<button type="button" class="selector-card element-'+element+(selected?' is-selected':'')+(recommended?' is-recommended':'')+'" data-select-kind="'+esc(kind)+'" data-select-index="'+index+'" title="'+name+' · select to stage in Working Build">'+(icon?'<img src="'+esc(icon)+'" alt="">':'<span class="selector-glyph">◆</span>')+'<small>'+name+'</small></button>';}
function unavailableCard(label='Evidence unavailable'){return '<button type="button" class="selector-card is-unavailable" disabled title="Bungie did not supply a verified option for this slot"><span class="selector-glyph">◇</span><small>'+esc(label)+'</small></button>';}
function fillUnavailable(markup,count,label){return markup.concat(Array.from({length:Math.max(0,count-markup.length)},()=>unavailableCard(label)));}
function abilityGroups(build,equipped){const groups=build?.subclassBuild?.abilityOptionsBySocket||{},all=resolvedOptions(build,'abilities'),labels=[['classAbility','CLASS ABILITY'],['movement','MOVEMENT'],['melee','MELEE'],['grenade','GRENADE']];return labels.map(([key,label])=>{const options=Array.isArray(groups[key])?groups[key]:[],cards=options.map(item=>{const index=all.findIndex(value=>itemKey(value)===itemKey(item));return selectorCard(item,{kind:'abilities',index,selected:equipped.some(value=>itemKey(value)===itemKey(item))});});return '<section class="ability-option-group" data-ability-socket="'+esc(key)+'"><h4>'+label+'</h4><div class="socket-options">'+(cards.length?cards.join(''):unavailableCard(label+' unavailable'))+'</div></section>';}).join('');}
function artifactRecommendationMap(recommendation){return new Map((recommendation?.recommendations||[]).map(row=>[String(row?.artifactPerk?.hash),row]));}
function artifactPerkCard(perk,index,{compact=false,selected=null,recommended=false,recommendation=null}={}){
  const icon=abs(iconOf(perk)),name=esc(perk?.name||'Artifact perk'),description=esc(perk?.description||perk?.definition?.displayProperties?.description||'Verified Bungie Artifact perk');
  const active=selected===null?perk?.isActive===true:selected===true,liveActive=perk?.isActive===true,locked=!active&&(perk?.isVisible===false||perk?.tierUnlocked===false),reason=esc(recommendation?.reasons?.[0]?.label||'');
  const classes=['selector-card','artifact-perk',active?'is-selected':'',recommended?'is-recommended-choice':'',liveActive?'was-live-active':'',locked?'is-locked':'',compact?'is-compact':''].filter(Boolean).join(' ');
  const recommendationLabel=recommended?'<span class="artifact-best-badge">BEST</span>':'';
  return '<button type="button" class="'+classes+'" data-select-kind="artifactPerks" data-select-index="'+index+'" '+(locked?'disabled':'')+' title="'+name+' — '+description+(reason?' — PARADOX fit: '+reason:'')+'" data-evidence-name="'+name+'" data-evidence-description="'+description+'">'+recommendationLabel+(icon?'<img src="'+esc(icon)+'" alt="">':'<span class="selector-glyph">◆</span>')+'<small>'+name+'</small></button>';
}
function artifactRecommendationMarkup(build){
  const recommendation=build?.artifactRecommendation;
  if(!build?.forgeLoaderDecision)return '<div class="artifact-recommendation is-neutral"><b>FORGE LOADER INPUT REQUIRED</b><small>Load a staged Forge Loader result to calculate an Artifact fit.</small></div>';
  if(!recommendation)return '<div class="artifact-recommendation is-neutral"><b>VERIFYING CURRENT ARTIFACT</b><small>Checking the active Bungie season and legal perk matrix.</small></div>';
  if(recommendation.userOverride)return '<div class="artifact-recommendation is-manual"><b>MANUAL WORKING SELECTION</b><small>Your staged Artifact choices are preserved. The live Guardian remains unchanged.</small><button type="button" data-artifact-recommend>RESTORE PARADOX BEST FIT</button></div>';
  if(recommendation.selectionStatus!=='ready'){
    const blocker=esc(recommendation.blockers?.[0]||'A complete verified Artifact match is not available.');
    return '<div class="artifact-recommendation is-blocked"><b>BEST FIT NOT STAGED</b><small>'+blocker+' The live Guardian remains unchanged.</small><button type="button" data-artifact-recommend>CHECK VERIFIED ARTIFACT</button></div>';
  }
  const selected=new Set((recommendation.selectedPerkHashes||[]).map(String));
  const strongest=(recommendation.recommendations||[]).filter(row=>row?.selected&&selected.has(String(row?.artifactPerk?.hash))).slice(0,3);
  const reasons=strongest.map(row=>'<li><b>'+esc(row.artifactPerk?.name||'Artifact perk')+'</b><span>'+esc(row.reasons?.[0]?.label||'Verified Forge Loader compatibility')+'</span></li>').join('');
  const artifactChoice=recommendation.artifactCandidateCount>1?esc(`${recommendation.artifactName||'Artifact'} · best of ${recommendation.artifactCandidateCount} verified Artifacts`):esc(recommendation.artifactName||'Verified Artifact');
  const fullTarget=recommendation.planMode==='full-build-target';
  const planLabel=fullTarget?'PARADOX FULL TARGET PLAN':'PARADOX BEST VERIFIED FIT';
  const planDetail=fullTarget
    ?'This complete target plan is ranked from the current verified Artifact perk tree even when Bungie reports no unused unlock points. Apply the picks in game as they become available. Working Build only · currently unlocked and equipped perks remain unchanged.'
    :'Artifact 2.0 is ranked from its verified socket buckets, then each bucket is filled from the staged Exotic, stat priorities, armour-set traits, subclass/Super and weapons. Working Build only · currently unlocked and equipped perks remain unchanged.';
  return '<div class="artifact-recommendation is-ready"><div><b>'+planLabel+'</b><span>'+artifactChoice+' · '+Number(recommendation.selectedMatchedCount||0)+' OF '+Number(recommendation.selectionLimit||0)+' PICKS DIRECTLY MATCH</span></div>'+(reasons?'<ol>'+reasons+'</ol>':'')+'<small>'+planDetail+'</small><button type="button" data-artifact-recommend>RECALCULATE BEST FIT</button></div>';
}
function artifactMatrix(artifact,configuration,recommendation){
  const perks=Array.isArray(artifact?.perks)?artifact.perks:[];
  if(!perks.length)return '<div class="artifact-spectrum-unavailable"><b>FULL PERK SPECTRUM UNRESOLVED</b><small>Requires verified Artifact socket-bucket or CharacterProgressions perk definitions from Bungie.</small></div>';
  const selected=new Set((Array.isArray(configuration?.selectedPerkHashes)?configuration.selectedPerkHashes:[]).map(String)),ranked=artifactRecommendationMap(recommendation),automatic=recommendation?.selectionStatus==='ready'&&!recommendation?.userOverride,tiers=new Map();
  perks.forEach((perk,index)=>{const tier=Number.isInteger(perk?.tierIndex)?perk.tierIndex:0;if(!tiers.has(tier))tiers.set(tier,[]);tiers.get(tier).push({perk,index});});
  const artifactTwo=artifact?.availabilityModel==='artifact-2-socket-buckets';
  return [...tiers.entries()].sort((a,b)=>a[0]-b[0]).map(([tier,rows])=>{const requirement=Number(rows[0]?.perk?.minimumUnlockPointsUsedRequirement??rows[0]?.perk?.pointsToUnlock),capacity=Number(artifact?.selectionSlots?.find(slot=>Number(slot?.tierIndex)===tier)?.capacity??rows[0]?.perk?.bucketCapacity),tierTitle=esc(rows[0]?.perk?.tierTitle||((artifactTwo?'BUCKET ':'TIER ')+(tier+1))),suffix=artifactTwo&&Number.isFinite(capacity)?` · ${capacity} PICKS`:Number.isFinite(requirement)&&requirement>0?' · '+requirement+' PRIOR PICKS':'';return '<section class="artifact-tier" data-artifact-tier="'+tier+'"><h4>'+tierTitle+suffix+'</h4><div class="artifact-tier-perks">'+rows.sort((a,b)=>(a.perk.itemIndex||0)-(b.perk.itemIndex||0)).map(row=>{const key=String(row.perk?.hash),detail=ranked.get(key);return artifactPerkCard(row.perk,row.index,{selected:selected.has(key),recommended:automatic&&selected.has(key),recommendation:detail});}).join('')+'</div></section>';}).join('');
}
function stageWorkingBuild(mutator){const state=readState();if(!state?.originalBuild)return;const working=createWorkingBuildPatch(state.workingBuild||state.originalBuild);mutator(working);writeState({...state,workingBuild:working});render();}
async function fetchCurrentArtifactSeason(){
  const payload=globalThis.FORGE_PAGE_PAYLOAD;
  const seasonNumber=Number(payload?.currentSeasonNumber??payload?.currentSeason?.seasonNumber);
  return Number.isInteger(seasonNumber)?seasonNumber:null;
}
async function refreshForgeArtifactRecommendation({force=false}={}){
  const state=readState(),build=state?.workingBuild;
  if(!build?.forgeLoaderDecision)return;
  if(build.artifactRecommendation?.userOverride&&!force)return;
  const supplied=Number(build.currentSeasonNumber??build.currentSeason?.seasonNumber),currentSeasonNumber=Number.isInteger(supplied)?supplied:await fetchCurrentArtifactSeason();
  const result=applyForgeArtifactRecommendation(state,{currentSeasonNumber,force});
  if(result.state!==state)writeState(result.state);
  render();
}
function replaceEquipped(collection,candidate){const next=[...(collection||[])],socketIndex=Number(candidate?.socketIndex),type=String(candidate?.componentType||candidate?.abilityType||candidate?.type||candidate?.category||'').toLowerCase();let index=Number.isInteger(socketIndex)?next.findIndex(item=>Number(item?.socketIndex)===socketIndex):-1;if(index<0)index=next.findIndex(item=>type&&String(item?.componentType||item?.abilityType||item?.type||item?.category||'').toLowerCase()===type);if(index<0)next.push(candidate);else next[index]=candidate;return next;}
function subclassSocketChoices(build,kind){const sb=build?.subclassBuild||{},map=sb[kind==='aspects'?'aspectOptionsBySocket':'fragmentOptionsBySocket']||{},rows=Object.entries(map).flatMap(([socketIndex,options])=>(Array.isArray(options)?options:[]).map(option=>({...option,socketIndex:Number(socketIndex)})));return rows.length?rows:resolvedOptions(build,kind);}
function subclassSocketGroups(build,kind){const sb=build?.subclassBuild||{},equipped=kind==='aspects'?(sb.aspects||[]):(sb.fragments||[]),choices=subclassSocketChoices(build,kind),indexes=[...new Set([...equipped,...choices].map(row=>Number(row?.socketIndex)).filter(Number.isInteger))].sort((a,b)=>a-b);if(!indexes.length)return '';return indexes.map((socketIndex,position)=>{const selected=equipped.find(row=>Number(row?.socketIndex)===socketIndex),options=choices.filter(row=>Number(row?.socketIndex)===socketIndex),cards=options.map(option=>selectorCard(option,{kind:kind==='aspects'?'aspectSocket':'fragmentSocket',index:choices.indexOf(option),selected:itemKey(option)===itemKey(selected)}));return `<section class="ability-option-group" data-subclass-socket="${socketIndex}"><h4>${kind==='aspects'?'ASPECT':'FRAGMENT'} SLOT ${position+1}</h4><div class="socket-options">${cards.length?cards.join(''):unavailableCard('Verified socket options unavailable')}</div></section>`;}).join('');}
function applySubclassCandidate(working,candidate){working.subclassBuild=working.subclassBuild||{};const priorId=String(working.subclassItemInstanceId||working.subclassItem?.itemInstanceId||''),nextId=String(candidate.itemInstanceId||'');if(priorId&&priorId!==nextId)working.manualSocketChanges=(working.manualSocketChanges||[]).filter(change=>!String(change.component||'').startsWith('subclass-')&&String(change.itemInstanceId||'')!==priorId);working.subclassName=candidate.name||candidate.displayName||working.subclassName;working.subclass=candidate.key||candidate.element||candidate.name||working.subclass;working.subclassIcon=iconOf(candidate)||working.subclassIcon;working.subclassItemInstanceId=nextId;working.subclassItem=JSON.parse(JSON.stringify(candidate));if(candidate.subclassBuild||candidate.build)working.subclassBuild=JSON.parse(JSON.stringify(candidate.subclassBuild||candidate.build));return synchroniseSubclassProjection(working);}
function selectedSubclassSocket(working,kind,candidate){const sb=working.subclassBuild||{},rows=kind==='super'?[sb.super]:kind==='transcendence'?[sb.transcendenceSlots?.[Number(candidate?.transcendenceSlotPosition)]?.equipped]:kind==='abilities'?(sb.abilities||[]):kind==='aspectSocket'?(sb.aspects||[]):kind==='fragmentSocket'?(sb.fragments||[]):[],socketIndex=Number(candidate?.socketIndex),type=String(candidate?.componentType||candidate?.abilityType||candidate?.type||candidate?.category||'').toLowerCase();return rows.find(item=>Number.isInteger(socketIndex)&&Number(item?.socketIndex)===socketIndex)||rows.find(item=>type&&String(item?.componentType||item?.abilityType||item?.type||item?.category||'').toLowerCase()===type)||rows[0]||null;}
function resolvedTranscendenceSlots(build){const sb=build?.subclassBuild||{},mapped=Array.isArray(sb.transcendenceSlots)?sb.transcendenceSlots.filter(Boolean):[];if(mapped.length)return mapped.slice(0,2);return (Array.isArray(sb.transcendenceOptions)?sb.transcendenceOptions:[]).filter(Boolean).slice(0,2).map((item,socketIndex)=>({socketIndex,equipped:item,options:[item]}));}
function transcendenceChoices(build){return resolvedTranscendenceSlots(build).flatMap((slot,slotPosition)=>(Array.isArray(slot?.options)?slot.options:[]).map(option=>({...option,transcendenceSlotPosition:slotPosition})));}
function stageSelection(kind,index){
  const build=currentBuild(),candidate=kind==='subclass'?resolvedSubclassOptions(build)[index]:kind==='artifactPerks'?build?.artifact?.perks?.[index]:kind==='transcendence'?transcendenceChoices(build)[index]:kind==='aspectSocket'?subclassSocketChoices(build,'aspects')[index]:kind==='fragmentSocket'?subclassSocketChoices(build,'fragments')[index]:resolvedOptions(build,kind)[index];if(!candidate)return;
  stageWorkingBuild(working=>{
    working.subclassBuild=working.subclassBuild||{};
    for(const key of ['recommendationGeneratedAt','recommendationElement','recommendationStatus','forgeIntelligence','liveTransferPreflight','liveTransferPlan','liveTransferResult'])delete working[key];
    const before=selectedSubclassSocket(working,kind,candidate);
    if(kind==='subclass')applySubclassCandidate(working,candidate);
    else if(kind==='super'){working.subclassBuild.super=candidate;working.super=candidate;working.forgeRequestedSuperHash=Number(candidate.hash??candidate.bungieHash)||0;stageSubclassSocketChoice(working,before,candidate,'super');}
    else if(kind==='transcendence'){const slots=[...(working.subclassBuild.transcendenceSlots||[])],slotPosition=Number(candidate.transcendenceSlotPosition);if(slots[slotPosition])slots[slotPosition]={...slots[slotPosition],equipped:candidate};working.subclassBuild.transcendenceSlots=slots;stageSubclassSocketChoice(working,before,candidate,'transcendence');}
    else if(kind==='abilities'){working.subclassBuild.abilities=replaceEquipped(working.subclassBuild.abilities,candidate);stageSubclassSocketChoice(working,before,candidate,'ability');}
    else if(kind==='aspectSocket'){working.subclassBuild.aspects=replaceEquipped(working.subclassBuild.aspects,candidate);stageSubclassSocketChoice(working,before,candidate,'aspect');}
    else if(kind==='fragmentSocket'){working.subclassBuild.fragments=replaceEquipped(working.subclassBuild.fragments,candidate);stageSubclassSocketChoice(working,before,candidate,'fragment');}
    else if(kind==='artifactPerks'){working.artifactConfiguration=toggleIntendedArtifactPerk(working.artifact,working.artifactConfiguration||working.artifact?.artifactConfiguration,index);working.artifact.artifactConfiguration=JSON.parse(JSON.stringify(working.artifactConfiguration));if(working.artifactRecommendation)working.artifactRecommendation={...working.artifactRecommendation,userOverride:true};}
    else if(kind==='artifact'){const configuration=createIntendedArtifactConfiguration(candidate,working.artifactConfiguration||working.artifact?.artifactConfiguration);working.artifact={...JSON.parse(JSON.stringify(candidate)),artifactConfiguration:JSON.parse(JSON.stringify(configuration))};working.artifactConfiguration=configuration;}
    recordManualEdit(working,{component:kind,optionHash:Number(candidate.hash??candidate.itemHash??candidate.bungieHash)||null,optionName:String(candidate.name||candidate.displayName||'Verified option')});
    synchroniseSubclassProjection(working);
  });
  setLiveActionBanner(`${candidate.name||candidate.displayName||'Component'} staged manually. Live Guardian unchanged.`,'good');
}

function renderRecommendationControls(build={}){
  const subclassOptions=resolvedSubclassOptions(build),verified=subclassOptions.filter(hasVerifiedSubclassSockets),verifiedElements=new Set(verified.map(elementOf)),compatible=filterExoticCompatibleSubclasses(build,verified),supported=new Map(compatible.map(item=>[elementOf(item),item]).filter(([element])=>BUILD_ELEMENTS.includes(element)));
  const active=elementOf({element:build.subclass||build.subclassName||''}),armourValidation=validateTierFiveArmour(build),exoticValidation=validateExoticLoadout(build,{requireArmourAnchor:true}),hasVerifiedResult=Boolean(build.forgeLoaderDecision)&&armourValidation.ready&&exoticValidation.ready;
  if(!hasVerifiedResult)selectedRecommendationElement='';
  else if(!selectedRecommendationElement||!supported.has(selectedRecommendationElement))selectedRecommendationElement=supported.has(active)?active:(supported.keys().next().value||'');
  const elementButtons=[...document.querySelectorAll('[data-recommendation-element]')],elementGrid=byId('recommendationElements');
  elementGrid?.classList.toggle('has-multiple-options',hasVerifiedResult&&supported.size>1);
  elementButtons.forEach(button=>{const element=button.dataset.recommendationElement,available=hasVerifiedResult&&supported.has(element),selected=available&&element===selectedRecommendationElement;button.disabled=!available||recommendationBusy;button.classList.toggle('is-available',available);button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));button.title=!hasVerifiedResult?'Stage a verified Forge Loader armour result first.':available?`Evaluate a verified ${element} damage build with the staged Exotic armour result.`:verifiedElements.has(element)?`The selected Exotic armour perk is not compatible with the verified ${element} subclass components.`:`No verified ${element} build option is available for this Guardian.`;});
  if(!['balanced','dps','add-clear','survivability','ability-uptime'].includes(selectedRecommendationObjective))selectedRecommendationObjective=build.objective||'balanced';document.querySelectorAll('[data-build-objective]').forEach(button=>{const selected=button.dataset.buildObjective===selectedRecommendationObjective;button.disabled=!hasVerifiedResult||recommendationBusy;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});
  const hasElement=Boolean(selectedRecommendationElement&&supported.has(selectedRecommendationElement)),ready=hasVerifiedResult&&hasElement&&!recommendationBusy,button=byId('generateMaxLoadout'),status=byId('recommendationReadiness');
  if(button){button.disabled=!ready;button.textContent=recommendationBusy?'GENERATING VERIFIED BUILD…':build.recommendationGeneratedAt?'REGENERATE MAX LOADOUT':'GENERATE MAX LOADOUT';}
  const unresolvedCount=new Set([...(build?.hashCoverage?.subclass?.unresolved||[]),...subclassOptions.flatMap(item=>(item?.subclassBuild||item?.build||{})?.socketCoverage?.unresolved||[])]).size;
  const subclassBlocker=unresolvedCount?`Bungie subclass socket definitions are incomplete for ${unresolvedCount} resolved profile plug${unresolvedCount===1?'':'s'}. Refresh verified Guardian data before generating.`:verified.length?'The staged Exotic has no explicit compatibility evidence for the available verified elemental options.':'No complete live Bungie subclass socket set is available for this Guardian.';
  if(status){status.className='recommendation-readiness'+(ready?' is-ready':' is-blocked');status.textContent=recommendationBusy?'Resolving elemental damage, weapon and Artifact evidence…':recommendationFailure||(!hasVerifiedResult?'Stage a verified Forge Loader armour result to unlock compatible build options.':!hasElement?subclassBlocker:`Ready · ${selectedRecommendationElement.toUpperCase()} damage build · one verified Exotic armour anchor · Maximized Forge Loader result.`);}
  if(hasVerifiedResult)scheduleForgePreparation(build);
}

function renderSuperSynergyEvidence(build={},candidate=null){
  const host=byId('buildSuperSynergy');if(!host)return;
  const report=rankExoticSuperSynergy(build,candidate?[candidate]:[]),byHash=new Map(report.entries.map(row=>[String(row.superHash),row]));
  byId('buildSuperFeatureCluster')?.querySelectorAll('[data-super-slot]').forEach(slot=>{
    const row=byHash.get(String(slot.dataset.bungieHash||''));
    slot.classList.toggle('has-exotic-super-evidence',Boolean(row?.evidence?.length));
    slot.classList.toggle('is-exotic-super-best',Boolean(row?.recommended));
    slot.classList.toggle('has-no-exotic-super-evidence',Boolean(row&&row.evidenceStatus==='no-direct-evidence'));
    if(!row){delete slot.dataset.exoticSuperEvidence;return;}
    slot.dataset.exoticSuperEvidence=row.evidenceStatus;
    const reason=row.evidence?.[0]?.label||row.limitation;
    slot.title=[slot.title,reason].filter(Boolean).join(' · ');
    slot.setAttribute('aria-label',[row.superName,reason].filter(Boolean).join('. '));
  });
  if(!build.forgeLoaderDecision){host.className='super-synergy-evidence is-unknown';host.innerHTML='<b>EXOTIC TO SUPER EVIDENCE</b><p>Stage a verified Forge Loader Exotic to evaluate these Supers.</p>';return;}
  const tied=report.entries.filter(row=>row.recommended).length>1,source=report.anchor.description?`<blockquote>${esc(report.anchor.description)}</blockquote>`:'<blockquote>Verified Exotic effect text unavailable.</blockquote>';
  const rows=report.entries.map(row=>{
    const state=row.recommended?`BEST VERIFIED EVIDENCE${tied?' · TIED':''}`:row.evidenceStatus==='evidenced'?`EVIDENCE RANK ${row.rank}`:'NO DIRECT SYNERGY EVIDENCE';
    const reason=row.evidence?.[0]?.label||row.limitation;
    return `<li class="${row.recommended?'is-best':row.evidenceStatus==='evidenced'?'is-evidenced':'is-unsupported'}"><b>${esc(row.superName)}</b><em>${esc(state)}</em><span>${esc(reason)}</span></li>`;
  }).join('');
  const investment=report.entries[0]?.context?.[0]?.label||'';
  host.className=`super-synergy-evidence is-${report.status}`;
  host.innerHTML=`<b>EXOTIC TO SUPER EVIDENCE · ${esc(report.anchor.name)}</b>${source}${rows?`<ol>${rows}</ol>`:`<p>${esc(report.limitation||'No resolved Super definitions are available for this subclass.')}</p>`}${investment?`<small>${esc(investment)}</small>`:''}`;
}

function reviewIcon(item,label='Verified item'){const icon=abs(iconOf(item)),name=esc(item?.name||item?.displayName||label);return `<span class="review-icon" title="${name}">${icon?`<img src="${esc(icon)}" alt="">`:'◆'}<small>${name}</small></span>`;}
function decisionReasonText(row={}){const reason=row.reasons?.[0];return reason?.label||`${row.componentName||'Verified component'} retained because no resolved alternative proved a stronger directed evidence score.`;}
function reviewModIdentity(item,label='EMPTY'){if(!item)return `<span class="review-mod-empty">${esc(label)}</span>`;const icon=abs(iconOf(item)),name=esc(item?.name||label);return `<span class="review-mod-identity" title="${name}">${icon?`<img src="${esc(icon)}" alt="">`:'◆'}<b>${name}</b></span>`;}
function renderModRecommendation(build={}){
  const host=byId('recommendedModPlan'),plan=build.armourModRecommendation;if(!host)return;
  if(!plan){host.innerHTML='<div class="review-mod-unavailable">No verified armour-mod plan was generated.</div>';return;}
  const stats=plan.projectedStats||{},raw=stats.raw||{},current=stats.currentTotal||{},recommended=stats.recommendedTotal||{};
  const statRows=['health','melee','grenade','super','class','weapon'].map(key=>`<span><small>${esc(key.toUpperCase())}</small><b>${Number(raw[key]||0)}</b><i>${Number(current[key]||0)}</i><strong>${Number(recommended[key]||0)}</strong></span>`).join('');
  const changedItems=(plan.items||[]).map(item=>({...item,decisions:(item.decisions||[]).filter(row=>row.action!=='KEEP')})).filter(item=>item.decisions.length);
  const itemRows=changedItems.map(item=>`<article class="review-mod-item"><header><b>${esc(item.itemName)}</b><span>${item.projectedUsed==null?'ENERGY UNRESOLVED':`${item.projectedUsed}/${item.capacity} ENERGY`}</span></header><div>${item.decisions.map(row=>`<div class="review-mod-decision is-${String(row.action||'change').toLowerCase()}"><em>${esc(row.action)}</em><span class="review-mod-swap">${reviewModIdentity(row.current)}<i>→</i>${reviewModIdentity(row.recommended)}</span><small>${esc(row.reasons?.[0]?.label||`${row.verifiedOptions} verified insertable option${row.verifiedOptions===1?'':'s'} evaluated.`)}</small></div>`).join('')}</div></article>`).join('');
  const changeCount=Number(plan.summary?.replace||0)+Number(plan.summary?.add||0)+Number(plan.summary?.remove||0),changeSummary=[`${changeCount} PROPOSED MOD CHANGE${changeCount===1?'':'S'}`,plan.summary?.replace?`${Number(plan.summary.replace)} REPLACE`:'',plan.summary?.add?`${Number(plan.summary.add)} ADD`:'',plan.summary?.remove?`${Number(plan.summary.remove)} REMOVE`:''].filter(Boolean).join(' · ');
  host.innerHTML=`<div class="review-mod-summary"><div><b>RAW → CURRENT → RECOMMENDED</b><span>Forge Loader raw stats remain mod-free. Installed and proposed mod contributions are evaluated separately.</span></div><div class="review-mod-stats">${statRows}</div><small>${changeSummary}</small></div><div class="review-mod-items">${itemRows||'<div class="review-mod-no-changes">No verified mod change improves this Working Build.</div>'}</div>${plan.limitations?.length?`<ul class="review-mod-limitations">${plan.limitations.slice(0,5).map(row=>`<li>${esc(row)}</li>`).join('')}</ul>`:''}`;
}
function renderForgeDecision(build={}){
  const label=byId('forgeDecisionLabel'),detail=byId('forgeDecisionDetail'),listNode=byId('forgeDecisionReasons'),decision=build.forgeIntelligence;
  if(!label||!detail||!listNode)return;
  if(!build.forgeLoaderDecision){label.textContent='AWAITING ARMOUR EVIDENCE';detail.textContent='Stage a verified Forge Loader result to begin armour-led build reasoning.';listNode.innerHTML='<li>No component choice is claimed before generation.</li>';return;}
  if(!decision){const anchor=build.forgeLoaderDecision?.buildAnchor?.perk?.name||build.forgeLoaderDecision?.buildAnchor?.name||'verified Exotic',setName=build.forgeLoaderDecision?.setProtocol?.[0]?.setName||build.forgeLoaderDecision?.setProtocol?.[0]?.trait?.name||'verified armour-set protocol';label.textContent='ARMOUR EVIDENCE STAGED';detail.textContent='Generate Max Loadout to compare only the verified subclass catalogue against this Forge Loader result.';listNode.innerHTML=`<li>${esc(anchor)} anchors the recommendation.</li><li>${esc(setName)} is carried into the evidence score.</li>`;return;}
  const evidence=decision.evidence||{},coverage=decision.prismaticCoverage,rows=(decision.decisions||[]).filter(row=>row.score>0).slice(0,3);label.textContent=`${String(decision.element||'VERIFIED').toUpperCase()} BUILD READY FOR REVIEW`;detail.textContent=`${Number(evidence.directedLinks||0)} directed evidence link${Number(evidence.directedLinks||0)===1?'':'s'} · ${decision.decisions?.length||0} verified subclass component decisions${coverage?` · ${coverage.covered.length}/5 Prismatic elements evidenced`:''}.`;
  listNode.innerHTML=(rows.length?rows:(decision.decisions||[]).slice(0,3)).map(row=>`<li>${esc(decisionReasonText(row))}</li>`).join('')||(decision.limitations||[]).slice(0,2).map(row=>`<li>${esc(row)}</li>`).join('')||'<li>The verified equipped configuration remains the safest evidence-bound result.</li>';
}
function renderRecommendedBuildReview(build={}){
  const subclass=resolvedSubclassOptions(build).find(item=>elementOf(item)===elementOf({element:build.subclass||build.subclassName||''})),superItem=build.subclassBuild?.super||build.super,abilities=build.subclassBuild?.abilities||[],aspects=build.subclassBuild?.aspects||[],fragments=build.subclassBuild?.fragments||[],anchor=build.forgeLoaderDecision?.buildAnchor||{},anchorName=anchor.name||'VERIFIED EXOTIC',anchorPerk=anchor.perk||null,exoticRule=validateExoticLoadout(build,{requireArmourAnchor:true});
  byId('recommendedBuildSubtitle').textContent=`${String(build.characterClass||'Guardian').toUpperCase()} · ${String(build.recommendationElement||build.subclassName||build.subclass||'verified subclass').toUpperCase()} · ${String(build.objective||'balanced').toUpperCase()} · EXOTIC ANCHOR: ${String(anchorName).toUpperCase()}`;
  byId('recommendedSubclassSummary').innerHTML=`<div class="review-subclass-identity">${reviewIcon(subclass,'Subclass')}<div><b>${esc(build.subclassName||build.subclass||'VERIFIED SUBCLASS')}</b><span>${esc(superItem?.name||'SUPER NOT RESOLVED')}</span></div></div><div class="review-socket-group"><b>ABILITIES</b><div>${abilities.map(item=>reviewIcon(item,'Ability')).join('')||'<small>NO VERIFIED ABILITIES</small>'}</div></div><div class="review-socket-group"><b>ASPECTS</b><div>${aspects.map(item=>reviewIcon(item,'Aspect')).join('')||'<small>NO VERIFIED ASPECTS</small>'}</div></div><div class="review-socket-group"><b>FRAGMENTS</b><div>${fragments.map(item=>reviewIcon(item,'Fragment')).join('')||'<small>NO VERIFIED FRAGMENTS</small>'}</div></div>`;
  const intelligenceHost=byId('recommendedIntelligenceSummary'),decisions=build.forgeIntelligence?.decisions||[],matched=decisions.filter(row=>row.score>0).slice(0,4),reviewRows=matched.length?matched:decisions.slice(0,4),anchorReason=`EXOTIC ANCHOR · ${anchorName}${anchorPerk?.name?` · ${anchorPerk.name}`:''} drives the subclass, stat, mod, Artifact and weapon ranking.`;if(intelligenceHost)intelligenceHost.innerHTML=`<li>${esc(anchorReason)}</li>`+(reviewRows.map(row=>`<li>${esc(decisionReasonText(row))}</li>`).join('')||(build.forgeIntelligence?.limitations||[]).map(row=>`<li>${esc(row)}</li>`).join('')||'<li>No additional intelligence claim is available for this snapshot.</li>');
  const armourHost=byId('recommendedArmourSummary')?.querySelector('.gear-columns');if(armourHost){armourHost.innerHTML=Array.from({length:5},(_,index)=>armourCard(index,build.armour?.[index])).join('');armourHost.querySelectorAll('.gear-slot .arm').forEach((node,index)=>{node.addEventListener('click',()=>openArmourDrawer(index,build.armour?.[index]));bindParadoxItemHover(node,build.armour?.[index],'armour');});}
  const armourRule=byId('armourExoticRule');if(armourRule)armourRule.textContent=`DESTINY EQUIP RULE · ${exoticRule.exoticArmourCount}/1 EXOTIC ARMOUR`;
  renderModRecommendation(build);
  const advice=build.weaponRollAdvice||build.paradoxAnalysis?.weaponRollAdvice,recommendations=new Map((advice?.recommendations||[]).map(row=>[String(row.itemInstanceId||row.weaponHash||''),row]));
  const weaponSelections=new Map((build.weaponSelectionRecommendation?.decisions||[]).map(row=>[String(row.bucketHash),row])),weaponConstraint=build.weaponSelectionRecommendation?.constraints||{},weaponRule=byId('weaponExoticRule');
  if(weaponRule)weaponRule.textContent=`OWNED VAULT + CHARACTER INVENTORY · ${Number(weaponConstraint.selectedExoticWeaponCount||0)}/1 EXOTIC WEAPON`;
  const weaponReviewHost=byId('recommendedWeaponsSummary');weaponReviewHost.innerHTML=Array.from({length:3},(_,index)=>{
    const item=build.weapons?.[index];
    if(!item)return '<article class="review-weapon is-unresolved"><b>WEAPON SLOT '+(index+1)+'</b><small>Verified instance unavailable</small></article>';
    const key=String(item.itemInstanceId||item.hash||item.bungieHash||''),row=item.weaponRollAdvice||recommendations.get(key),options=row?.best?.options||[],recommendedHashes=options.map(option=>Number(option?.hash)).filter(Number.isInteger),selection=weaponSelections.get(String(item.bucketHash)),decisionLabel=selection?.action==='KEEP'?'CURRENT BEST FIT':(selection?.action||'CURRENT BEST FIT'),model=item.weaponSemantics?.perkModel||item.weaponPerkModel||{},tier=Number(model.weaponTier??item.weaponSemantics?.gearTier??item.gearTier),rowCount=Math.max(1,Number(model.expectedRowCount||item.weaponPerkRowCount)||1),perkMatrix=weaponPerkMatrixMarkup(item,{recommendedHashes}),traitHierarchy=weaponTraitHierarchyMarkup(item,{compact:true});
    return `<article class="review-weapon paradox-model-card" data-review-weapon="${index}" data-weapon-tier="${Number.isInteger(tier)?tier:''}" tabindex="0" role="button"><div>${reviewIcon(item,'Weapon')}<span><b>${esc(item.name||`Weapon ${index+1}`)}</b><small>${esc(item.itemTypeDisplayName||item.weaponType||'Verified owned weapon')}</small><em>${esc(decisionLabel)} · ${Number(selection?.candidateCount||0)} OWNED CANDIDATES</em></span></div><div class="review-weapon-tier-model"><b>${Number.isInteger(tier)&&tier>0?`TIER ${tier}`:'TIER UNRESOLVED'} · ${rowCount} PERK ROW${rowCount===1?'':'S'}</b>${perkMatrix||'<small>NO VERIFIED PERK MODEL</small>'}${traitHierarchy}</div><p>${esc(selection?.reasons?.[0]?.label||'Exact owned instance retained; no stronger explicit synergy evidence was proven.')}</p></article>`;
  }).join('');
  weaponReviewHost.querySelectorAll('[data-review-weapon]').forEach(node=>{const item=build.weapons?.[Number(node.dataset.reviewWeapon)];node.addEventListener('click',()=>item&&openWeaponDetail(item));node.addEventListener('keydown',event=>{if(item&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openWeaponDetail(item);}});bindParadoxItemHover(node,item,'weapon');});
  const artifact=build.artifact,recommendation=build.artifactRecommendation,selected=new Set((build.artifactConfiguration?.selectedPerkHashes||recommendation?.selectedPerkHashes||[]).map(String)),perkByHash=new Map((artifact?.perks||[]).map(perk=>[String(perk?.hash??perk?.itemHash??perk?.bungieHash),perk])),sequence=(recommendation?.selectionSequence||[]).filter(row=>selected.has(String(row?.artifactPerk?.hash))).sort((a,b)=>Number(a.order)-Number(b.order)),perks=sequence.length?sequence.map(row=>perkByHash.get(String(row.artifactPerk?.hash))||row.artifactPerk):(artifact?.perks||[]).filter(perk=>selected.has(String(perk?.hash??perk?.itemHash??perk?.bungieHash))),selectedRecommendations=(recommendation?.recommendations||[]).filter(row=>row.selected||selected.has(String(row?.artifactPerk?.hash))),artifactReasons=[...new Set(selectedRecommendations.flatMap(row=>(row.reasons||[]).map(reason=>reason.label)).filter(Boolean))].slice(0,6),artifactBlockers=(recommendation?.blockers||[]).slice(0,3),artifactReady=recommendation?.selectionStatus==='ready';
  const artifactSynergyRows=(artifactReady?artifactReasons:artifactBlockers).map(row=>`<li>${esc(row)}</li>`).join('')||'<li>No verified Artifact synergy claim is available from the supplied Bungie evidence.</li>';
  const artifactPlanLabel=recommendation?.planMode==='full-build-target'?'PARADOX FULL TARGET PLAN':'PARADOX BEST VERIFIED FIT';
  const pickOrder=new Map(sequence.map(row=>[String(row.artifactPerk?.hash),Number(row.order)]));byId('recommendedArtifactSummary').innerHTML=artifact?`<div class="review-artifact-identity">${reviewIcon(artifact,'Artifact')}<div><b>${esc(artifact.name||'VERIFIED ARTIFACT')}</b><span>${artifactReady?`${artifactPlanLabel} · ${Number(recommendation.selectionLimit||0)} LEGAL PICKS · ${Number(recommendation.totalScore||0)} SYNERGY SCORE`:'EVIDENCE LIMITED · CURRENT CONFIGURATION SHOWN'}</span><small>${artifactReady?'RECOMMENDED WORKING PLAN · APPLY PICKS IN NUMBERED ORDER':'No complete legal recommendation was resolved from the supplied Bungie evidence.'}</small></div></div><div class="review-artifact-perks">${perks.map((perk,index)=>`<span class="review-artifact-pick"><em>PICK ${pickOrder.get(String(perk?.hash??perk?.itemHash??perk?.bungieHash))||index+1}</em>${reviewIcon(perk,'Artifact perk')}</span>`).join('')||'<small>NO LEGAL VERIFIED PERK CHANGE RESOLVED</small>'}</div><div class="review-artifact-synergy"><b>ARTIFACT SYNERGY</b><ul>${artifactSynergyRows}</ul></div>`:'<small>ARTIFACT STATE UNAVAILABLE</small>';
  const transfer=byId('liveTransferStatus'),plan=renderApplyControls(build),canApply=plan.ready;if(transfer)transfer.textContent=canApply?`Apply is ready for ${plan.equipment.targets.length} exact items and ${plan.socketChanges.length} verified free socket change${plan.socketChanges.length===1?'':'s'}.${plan.inGameSteps.length?` ${plan.inGameSteps.length} unsupported change${plan.inGameSteps.length===1?' remains':'s remain'} as explicit in-game steps.`:''}`:`Apply blocked · ${plan.blockers?.[0]||'exact Working Build validation failed.'}`;
}
async function openRecommendedBuild(){
  const build=currentBuild(),dialog=byId('recommendedBuildReveal'),status=byId('recommendedBuildRenderStatus');
  if(status){status.hidden=true;status.textContent='';}
  const result=await revealRecommendedBuild({
    build,
    dialog,
    body:document.body,
    renderReview:renderRecommendedBuildReview,
    paint:()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),
    onRenderError:error=>{console.error('[Forge recommended build review]',error);if(status){status.textContent='The build was generated, but part of the review could not be displayed. Close this review and generate the loadout again.';status.hidden=false;}},
    focusTarget:byId('closeRecommendedBuild')
  });
  return result.opened;
}
function closeRecommendedBuild(){const dialog=byId('recommendedBuildReveal');if(dialog){dialog.hidden=true;dialog.setAttribute('aria-hidden','true');}document.body.classList.remove('recommended-build-open');byId('generateMaxLoadout')?.focus();}
function continueToBuildTest(){closeRecommendedBuild();const panel=document.querySelector('.validation-panel'),arm=byId('armRangeTest'),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;panel?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});setRangeStatus('Recommendation ready. Choose PvE or PvP, select the activity, then arm this exact Working Build.','good');arm?.focus();}
async function showForgeGenerationLoader(element){const loader=byId('forgeGenerationLoader'),panel=document.querySelector('.recommendation-panel'),status=byId('forgeGenerationStatus');if(!loader)return;loader.hidden=false;loader.dataset.element=element||'';if(panel)panel.setAttribute('aria-busy','true');if(status)status.textContent=`FORGING ${String(element||'VERIFIED').toUpperCase()} GUARDIAN BUILD…`;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
function hideForgeGenerationLoader(){const loader=byId('forgeGenerationLoader'),panel=document.querySelector('.recommendation-panel');if(loader)loader.hidden=true;if(panel)panel.removeAttribute('aria-busy');}
const FORGE_COMPUTATION_FIELDS=Object.freeze(['version','source','characterId','membershipId','membershipType','characterClass','selectedLoadoutIndex','subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments','artifact','artifactConfiguration','weapons','armour','mods','stats','hashCoverage','statModel','coverage','semanticCoverage','paradoxEvidence','forgeLoaderDecision','objective','activityContext','locks']);
const FORGE_COMPOSED_FIELDS=Object.freeze(['subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments']);
function forgeComputationProjection(build={}){return Object.fromEntries(FORGE_COMPUTATION_FIELDS.filter(key=>Object.hasOwn(build,key)).map(key=>[key,build[key]]));}
function mergeComposedRecommendation(build={},composed={}){const next={...build};for(const key of FORGE_COMPOSED_FIELDS)if(Object.hasOwn(composed,key))next[key]=composed[key];return next;}
async function updateForgeGenerationPhase(message){const status=byId('forgeGenerationStatus');if(status)status.textContent=message;await new Promise(resolve=>setTimeout(resolve,0));}
async function generateMaxLoadout(){
  if(recommendationBusy)return;
  recommendationBusy=true;
  recommendationFailure='';
  let failureMessage='';
  renderRecommendationControls(currentBuild()||{});
  try{
    let recoveredState=readState();
    if(!recoveredState){recoveredState=await restorePersistedBuildState();if(recoveredState)render();}
    if(!recoveredState)throw new Error(activeLoadError||'No protected Build Forge snapshot is available. Return to Forge Loader and evaluate the armour build again.');
    // Finish any in-flight Artifact refresh before capturing the generation
    // snapshot so an unrelated refresh cannot invalidate this review request.
    await refreshForgeArtifactRecommendation();
    const state=readState(),build=state?.workingBuild,armourValidation=validateTierFiveArmour(build||{}),exoticValidation=validateExoticLoadout(build||{},{requireArmourAnchor:true}),candidate=filterExoticCompatibleSubclasses(build||{},resolvedSubclassOptions(build||{}).filter(hasVerifiedSubclassSockets)).find(item=>elementOf(item)===selectedRecommendationElement);
    if(!state?.originalBuild||!build?.forgeLoaderDecision||!armourValidation.ready||!exoticValidation.ready||!candidate){const reason=!build?.forgeLoaderDecision?'Forge Loader decision required.':armourValidation.reason||exoticValidation.reason||'The selected elemental build option is not supported by this Guardian’s verified subclass catalogue.';throw new Error(reason);}
    await showForgeGenerationLoader(selectedRecommendationElement);
    clearTimeout(preparationTimer);
    await prepareForgeBackground(build);
    if(readState()!==state)throw new Error('The source build changed. Generate again for the current selection.');
    const prepared=await forgePreparation.get(requestedForgeVariant(build));
    if(readState()!==state)throw new Error('The source build changed. Generate again for the current selection.');
    let working={...build,...prepared.patch};
    // Recheck the prepared selection at the point of review; never execute live actions here.
    const coherence=validateLoadoutCoherence(working);if(!coherence.ready)throw new Error(coherence.reason);
    // Apply readiness is review information, not permission to hide a valid
    // generated recommendation. The review renders blockers and disables Apply.
    working.liveTransferPreflight=createLiveTransferPreflight(working);
    let next=protectBuildState({...state,workingBuild:working,recommendation:prepared.recommendation});
    await updateForgeGenerationPhase('PREPARING BUILD REVIEW…');
    if(readState()!==state)throw new Error('The source build changed. Generate again for the current selection.');
    next=protectBuildState({...next,workingBuild:working});writeState(next);render();hideForgeGenerationLoader();if(!await openRecommendedBuild())throw new Error('The recommendation was generated, but its protected review could not be opened. Reload this Build Forge page and try again.');
  }catch(error){failureMessage=error?.message||'Unable to generate a verified recommendation.';recommendationFailure=failureMessage;console.error('Build Forge recommendation generation failed.',error);}
  finally{
    hideForgeGenerationLoader();recommendationBusy=false;renderRecommendationControls(currentBuild()||{});
    if(failureMessage){const status=byId('recommendationReadiness');if(status){status.className='recommendation-readiness is-blocked';status.textContent=failureMessage;}setLiveActionBanner(`Generate blocked · ${failureMessage}`,'warn');}
  }
}

function renderBuildSurface(){
  emitLoad('snapshot',LOAD_STAGES.SNAPSHOT,'Locating protected build snapshot…');
  const state=readState(),original=state?.originalBuild||null,build=state?.workingBuild||original;
  if(!build||!original){
    const recovering=new URLSearchParams(location.search).get('baseline')==='bungie-recovery';
    byId('sourcePill').textContent=recovering?'BUILD SOURCE · RECOVERING BUNGIE':'BUILD SOURCE · ACTION REQUIRED';
    byId('sourceLabel').textContent=recovering?'RECOVERING VERIFIED GUARDIAN':'NO BUILD SNAPSHOT FOUND';byId('sourceDetail').textContent=recovering?'Rebuilding the protected Original Build before the staged armour is applied.':'Return to the Guardian page, load a Guardian or Bungie loadout, then press Improve My Guardian.';
    byId('buildStateLabel').textContent=recovering?'PROTECTING ORIGINAL BUILD':'SNAPSHOT UNAVAILABLE';byId('buildStateDetail').textContent=recovering?'The Working Build will remain separate from the equipped Bungie baseline.':'No verified Original or Working Build has been loaded.';
    byId('artifactStatus').textContent='NOT CHECKED';byId('artifactStatusDetail').textContent='Artifact resolution starts only after a verified build snapshot is loaded.';
    const notice=byId('buildStateNotice');if(notice)notice.innerHTML='<b>Build snapshot unavailable.</b> The previously painted equipment is not an active Working Build.';
    if(!recovering)setLiveActionBanner(activeLoadError||'No protected Working Build is available. Return to Forge Loader and evaluate the armour build again.','warn');
    const armButton=byId('armRangeTest');if(armButton)armButton.disabled=true;
    renderRecommendationControls({});renderForgeDecision({});renderApplyControls({});
    emitLoad('snapshot',LOAD_STAGES.SNAPSHOT,recovering?'Recovering Bungie Guardian…':'Build snapshot required',recovering?'loading':'error',activeLoadError);
    completeBuildRender(null);
    return;
  }
  const armButton=byId('armRangeTest');if(armButton)armButton.disabled=!String(build.characterId||'').trim();
  emitLoad('validation',LOAD_STAGES.VALIDATE,'Validating character-bound snapshot…');
  const changes=diffBuilds(original,build),loadoutNumber=Number.isInteger(build.selectedLoadoutIndex)?build.selectedLoadoutIndex+1:null,sourceName=loadoutNumber?`BUNGIE LOADOUT ${loadoutNumber}`:'CURRENT EQUIPPED GUARDIAN';
  byId('sourcePill').textContent=`BUILD SOURCE · ${sourceName}`;byId('sourceLabel').textContent=sourceName;byId('buildStateLabel').textContent='ORIGINAL SNAPSHOT CAPTURED';byId('buildStateDetail').textContent='Recommendations mutate a separate Working Build so the protected source can always be restored.';emitLoad('profile',LOAD_STAGES.PROFILE,'Resolving Guardian profile…');byId('sourceDetail').textContent=loadoutNumber?`Character ${build.characterClass||''} · Bungie slot ${loadoutNumber} · exact resolved loadout snapshot.`:`Character ${build.characterClass||''} · current equipped state captured at entry.`;byId('guardianHeading').textContent=String(build.characterClass||'Guardian').toUpperCase();
  const notice=byId('buildStateNotice'),restore=byId('restoreOriginal'),vaultCount=Array.isArray(build.vaultArmourSelection?.slots)?build.vaultArmourSelection.slots.length:0;if(notice)notice.innerHTML=changes.length?`<b>${changes.length} working change${changes.length===1?'':'s'}${vaultCount?` · ${vaultCount} from Vault`:''}.</b> Original build remains protected and can be restored.`:'<b>Baseline protected.</b> Working build currently matches the immutable original snapshot.';if(restore){restore.disabled=!changes.length;restore.title=changes.length?'Discard Working Build changes and restore the protected Original snapshot.':'Working Build already matches Original.';}
  try{
  const subclassOptions=resolvedSubclassOptions(build),activeElement=elementOf({element:build.subclass||build.subclassName||''}),activeSubclass=subclassOptions.find(item=>elementOf(item)===activeElement)||null;
  renderEquippedSubclass({root:byId('buildEquippedSubclassSummary'),iconNode:byId('buildEquippedSubclassIcon'),nameNode:byId('buildEquippedSubclassName'),metaNode:byId('buildEquippedSubclassMeta'),subclass:build.subclass||'',subclassName:build.subclassName||'',characterClass:build.characterClass||'Guardian',icon:iconOf(activeSubclass)||build.subclassIcon||''});
  renderSubclassPicker({root:byId('buildSubclassPicker'),characterClass:build.characterClass||'Guardian',subclass:build.subclass||build.subclassName||'',subclassOptions:resolvedSubclassOptions(build),selectKind:'subclass'});
  const prismatic=isPrismaticBuild(build),superItem=build.subclassBuild?.super,supers=resolvedOptions(build,'super'),superNode=byId('buildSuperFeatureCluster');renderSuperFormation({host:superNode,nameNode:byId('buildSuperName'),activeSuper:superItem,superOptions:supers,subclass:build.subclass||build.subclassName||'',subclassCatalog:subclassOptions,characterClass:build.characterClass||'hunter',selectKind:'super'});renderSuperSynergyEvidence(build,activeSubclass||{element:activeElement,subclassBuild:build.subclassBuild});
  const transcendenceSection=byId('transcendenceSection'),transcendenceNode=byId('transcendenceSummary');transcendenceSection.hidden=!prismatic;if(prismatic){const slots=resolvedTranscendenceSlots(build),choices=transcendenceChoices(build);transcendenceNode.innerHTML=Array.from({length:2},(_,slotPosition)=>{const slot=slots[slotPosition],options=Array.isArray(slot?.options)?slot.options:[],equipped=slot?.equipped,cards=options.map(item=>{const index=choices.findIndex(value=>itemKey(value)===itemKey(item)&&Number(value.transcendenceSlotPosition)===slotPosition);return selectorCard(item,{kind:'transcendence',index,selected:itemKey(item)===itemKey(equipped)});});return '<section class="transcendence-slot"><h4>SLOT '+(slotPosition+1)+'</h4><div class="transcendence-options">'+(cards.length?cards.join(''):unavailableCard('Verified slot unavailable'))+'</div></section>';}).join('');}else{transcendenceNode.innerHTML='';}
  const abilities=Array.isArray(build.subclassBuild?.abilities)?build.subclassBuild.abilities:[],aspects=Array.isArray(build.subclassBuild?.aspects)?build.subclassBuild.aspects:[],fragments=Array.isArray(build.subclassBuild?.fragments)?build.subclassBuild.fragments:[];byId('abilityRail').innerHTML=Array.from({length:4},(_,i)=>tile(abilities[i])).join('');byId('aspectRail').innerHTML=Array.from({length:2},(_,i)=>tile(aspects[i])).join('');byId('fragmentRail').innerHTML=Array.from({length:5},(_,i)=>tile(fragments[i])).join('');
  byId('abilityOptions').innerHTML=abilityGroups(build,abilities);
  for(const [kind,nodeId] of [['aspects','aspectOptions'],['fragments','fragmentOptions']]){const markup=subclassSocketGroups(build,kind);byId(nodeId).innerHTML=markup||unavailableCard('Compatible '+kind+' unavailable');}
  }catch(error){
    activeLoadError=error?.message||'The recovered subclass presentation could not be completed.';
    console.error('Build Forge retained the protected transfer after recovered subclass rendering failed.',error);
    byId('buildStateDetail').textContent='The transferred build remains protected while the remaining verified equipment evidence is displayed.';
  }
  emitLoad('sockets',LOAD_STAGES.SOCKETS,'Resolving equipped sockets and selections…');
  const artifact=build.artifact,artifactState=String(artifact?.state||'state-unavailable'),artifactUnavailable=!artifact||artifactState==='state-unavailable',recommendation=build.artifactRecommendation,allArtifactPerks=artifactPerkCatalogue(artifact,recommendation),activePerks=(Array.isArray(artifact?.activePerks)?artifact.activePerks:[]).filter(perk=>perk?.isActive!==false),artifactConfiguration=build.artifactConfiguration||artifact?.artifactConfiguration,configuredHashes=Array.isArray(artifactConfiguration?.selectedPerkHashes)?artifactConfiguration.selectedPerkHashes:null,displayPerks=configuredHashes?configuredHashes.map(hash=>allArtifactPerks.find(perk=>itemKey(perk)===String(hash))).filter(Boolean):activePerks,recommendationRows=artifactRecommendationMap(recommendation);emitLoad('artifact',LOAD_STAGES.ARTIFACT,'Resolving verified Artifact evidence…');const artIcon=byId('buildArtIcon'),artifactIcon=artifactUnavailable?'':abs(iconOf(artifact));byId('buildArtName').textContent=artifactUnavailable?'STATE UNAVAILABLE':String(artifact?.name||'ARTIFACT').toUpperCase();if(artIcon){artIcon.hidden=!artifactIcon;if(artifactIcon)artIcon.src=artifactIcon;else artIcon.removeAttribute('src');artIcon.alt=artifact?.name||'Artifact';artIcon.onerror=()=>{artIcon.hidden=true;};}const artifactItems=resolvedOptions(build,'artifact'),artifactItemCards=artifactItems.map((item,index)=>selectorCard(item,{kind:'artifact',index,selected:itemKey(item)===itemKey(artifact),recommended:recommendation?.selectionStatus==='ready'&&String(recommendation.artifactHash)===itemKey(item)}));byId('artifactItems').innerHTML=artifactItemCards.length?artifactItemCards.join(''):unavailableCard('Verified Artifact catalogue unavailable');const visiblePerks=displayPerks.slice(0,7),activePerkCards=visiblePerks.map(perk=>{const index=allArtifactPerks.findIndex(item=>itemKey(item)===itemKey(perk)),key=String(perk?.hash),automatic=recommendation?.selectionStatus==='ready'&&!recommendation?.userOverride;return artifactPerkCard(perk,index,{compact:true,selected:true,recommended:automatic&&(recommendation?.selectedPerkHashes||[]).map(String).includes(key),recommendation:recommendationRows.get(key)});}),artifactRail=byId('artifactRail'),hiddenPerkCount=Math.max(0,displayPerks.length-visiblePerks.length);artifactRail.dataset.artifactState=artifactUnavailable?'state-unavailable':(recommendation?.selectionStatus==='ready'&&!recommendation?.userOverride?'recommended':(activePerkCards.length?'staged':'none-active'));artifactRail.innerHTML=activePerkCards.length?activePerkCards.concat(hiddenPerkCount?['<span class="artifact-more-count">+'+hiddenPerkCount+' MORE</span>']:[],Array.from({length:Math.max(0,7-visiblePerks.length-hiddenPerkCount)},()=>'<span class="rail-empty-slot" aria-hidden="true"></span>')).join(''):`<span class="art-empty">${artifactUnavailable?'ARTIFACT STATE UNAVAILABLE':'NO ARTIFACT PERKS STAGED'}</span>`;byId('artifactRecommendation').innerHTML=artifactRecommendationMarkup(build);byId('artifactOptions').innerHTML=artifactMatrix({...artifact,perks:allArtifactPerks},artifactConfiguration,recommendation);
  const automaticArtifact=recommendation?.selectionStatus==='ready'&&!recommendation?.userOverride,fullArtifactTarget=automaticArtifact&&recommendation?.planMode==='full-build-target';byId('artifactStatus').textContent=artifactUnavailable?'ARTIFACT STATE UNAVAILABLE':(automaticArtifact?(fullArtifactTarget?'PARADOX FULL ARTIFACT PLAN STAGED':'PARADOX ARTIFACT 2.0 FIT STAGED'):(activePerks.length?'LIVE ARTIFACT RESOLVED':'NO ARTIFACT FIT STAGED'));byId('artifactStatusDetail').textContent=artifactUnavailable?'Verified Artifact socket data is unavailable.':automaticArtifact?(fullArtifactTarget?`${artifact.name||'Artifact'} · ${recommendation.selectionLimit} legal target picks staged from the verified perk tree. Current unlocks and equipped perks remain unchanged.`:`${artifact.name||'Artifact'} · best of ${recommendation.artifactCandidateCount||1} verified Artifact option(s) · ${recommendation.selectionLimit} socket-bucket picks staged for this Working Build. Current unlocks and equipped perks remain unchanged.`):`${artifact.name||'Artifact'} · ${activePerks.length} active perk(s) captured into this build snapshot.`;
  renderBuildGear(build);renderLiveAnalysis(build.paradoxAnalysis);renderForgeDecision(build);
  document.dispatchEvent(new CustomEvent('forge:guardian-loadout-context',{detail:build}));
  renderApplyControls(build);renderRecommendationControls(build);renderTestConfiguration();refreshRangeCapture();
  completeBuildRender(build);
}

function render(){
  try{return renderBuildSurface();}
  catch(error){
    console.error('Build Forge recovered from a synchronous render failure after protecting the transferred build.',error);
    activeLoadError=error?.message||'A Build Forge presentation stage could not be rendered.';
    let build=null;
    try{const state=readState();build=state?.workingBuild||state?.originalBuild||null;}catch{}
    const detail=byId('buildStateDetail');
    if(detail)detail.textContent='The transferred build remains protected while the available Build Forge evidence is displayed.';
    emitLoad('recovery',LOAD_STAGES.ARTIFACT,'Completing Build Forge with protected evidence…','loading',activeLoadError);
    completeBuildRender(build);
    return null;
  }
}

function restoreOriginal(){const state=readState();if(!state?.originalBuild)return;const restored=restoreWorkingBuild(state);writeState(restored);closeRecommendedBuild();render();}
function setRangeStatus(message,state=''){const node=byId('rangeCaptureStatus');if(!node)return;node.className=`range-capture-status${state?` is-${state}`:''}`;node.textContent=message;}
function showRangeOutput(value){const node=byId('rangeCaptureOutput');if(!node)return;node.hidden=false;node.textContent=JSON.stringify(value,null,2);}
function renderParadoxTestReview(capture=readCapture()){
  const host=byId('paradoxTestReview'),title=byId('paradoxTestReviewTitle'),summary=byId('paradoxTestReviewSummary'),metricsHost=byId('paradoxTestReviewMetrics');if(!host||!title||!summary||!metricsHost)return;
  if(capture?.status!=='collected'){host.hidden=true;metricsHost.innerHTML='';return;}
  host.hidden=false;const candidates=Array.isArray(capture.candidates)?capture.candidates:[],selectedId=String(capture.candidateSelection?.selectedInstanceId||''),selected=candidates.find(row=>String(row?.activity?.instanceId||'')===selectedId)||null,requiresConfirmation=capture.candidateSelection?.requiresUserConfirmation===true,verified=selected?.evidence?.classification==='verified-activity-pgcr-evidence',claims=selected?.pgcr?.claimMetrics||{};
  if(requiresConfirmation||!selected){title.textContent='ACTIVITY CONFIRMATION REQUIRED';summary.textContent=`${candidates.length} completed candidate${candidates.length===1?'':'s'} found. Confirm the exact activity before Paradox reviews performance.`;metricsHost.innerHTML=`<span><small>CANDIDATES</small><b>${candidates.length}</b></span>`;return;}
  title.textContent=verified?'VERIFIED RESULT REVIEWED':'RESULT EVIDENCE LIMITED';summary.textContent=verified?'Paradox reviewed the confirmed Bungie activity and PGCR metrics. Causal perk activation, DPS and uptime remain inference until direct telemetry exists.':'The completed activity was confirmed, but complete activity-hash and PGCR proof was not available; no performance claim is made.';
  const labels={kills:'KILLS',deaths:'DEATHS',assists:'ASSISTS',efficiency:'EFFICIENCY',score:'SCORE',timePlayedSeconds:'TIME PLAYED'};const metricRows=Object.keys(labels).filter(key=>Object.hasOwn(claims,key)).map(key=>`<span><small>${labels[key]}</small><b>${esc(claims[key])}${key==='timePlayedSeconds'?'s':''}</b></span>`).join('');metricsHost.innerHTML=metricRows||`<span><small>PGCR EVIDENCE</small><b>${verified?'VERIFIED':'LIMITED'}</b></span>`;
}
function renderCandidateConfirmation(capture){const node=byId('candidateConfirmation');if(!node)return;const selection=capture?.candidateSelection,rows=Array.isArray(capture?.candidates)?capture.candidates:[];if(!selection?.requiresUserConfirmation||!rows.length){node.hidden=true;node.innerHTML='';return;}node.hidden=false;node.innerHTML='<strong>CONFIRM COMPLETED ACTIVITY</strong><p>Confirm the exact post-arm activity before Paradox reviews its result. Build Forge will not guess.</p><div>'+rows.map(row=>{const activity=row.activity||{},pgcr=row.pgcr||{},name=capture.expectedActivity?.name||'Completed Bungie activity';return `<button type="button" data-confirm-instance="${esc(activity.instanceId)}"><b>${esc(name)}</b><span>${esc(activity.period||pgcr.period||'Time unavailable')} · ${esc(activity.instanceId)}</span></button>`;}).join('')+'</div>';}
function downloadRangeEvidence(){const capture=readCapture();if(!capture)return;const evidence={...capture,evidenceArchive:readCaptureArchive()};const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${capture.testId||'BF-TEST-EVIDENCE'}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
function refreshRangeCapture(){const capture=readCapture();const build=currentBuild(),characterId=String(build?.characterId||'').trim(),matches=captureMatchesCharacter(capture,characterId);const pull=byId('pullRangeResults');const arm=byId('armRangeTest');const download=byId('downloadRangeEvidence');renderCandidateConfirmation(capture);renderParadoxTestReview(capture);if(arm)arm.disabled=!characterId;if(download)download.disabled=capture?.status!=='collected';if(capture?.status==='armed'){arm?.classList.toggle('is-armed',matches);if(pull)pull.disabled=!matches;if(!matches)setRangeStatus(`CAPTURE GUARDIAN MISMATCH · saved character ${capture.characterId||'unknown'} · current character ${characterId||'unknown'}. Return to the captured Guardian before pulling results.`,'bad');else setRangeStatus(`ARMED ${String(capture.testDomain||'pve').toUpperCase()} BUILD TEST · ${capture.testId} · character ${capture.characterId}`,'warn');}else if(capture?.status==='collected'){arm?.classList.remove('is-armed');if(pull)pull.disabled=!matches;if(!matches)setRangeStatus(`RESULTS PRESERVED FOR DIFFERENT GUARDIAN · ${capture.testId} · saved character ${capture.characterId||'unknown'}. Raw evidence remains available to download.`,'bad');else setRangeStatus(`RESULTS COLLECTED · ${capture.testId} · ${capture.candidates?.length||0} completed candidate activity instance(s)`,'good');}else{arm?.classList.remove('is-armed');if(pull)pull.disabled=true;setRangeStatus('Choose PvE or PvP, then arm the exact Working Build before playing.');}}
async function armRange(){const build=currentBuild();if(!build?.characterId){setRangeStatus('No Guardian characterId is present in this Build Forge snapshot.','bad');return;}const button=byId('armRangeTest');try{if(button)button.disabled=true;setRangeStatus('Taking the pre-test Activity History baseline…','warn');const capture=await armBuildTest({characterId:build.characterId,buildSnapshot:build,testDomain,calibrationType:testDomain==='pve'&&byId('shootingRangeCalibration')?.checked?'shooting-range':null,expectedActivity:selectedExpectedActivity()});refreshRangeCapture();showRangeOutput(capture);if(capture.baselineError)setRangeStatus(`ARMED, but Activity History baseline failed: ${capture.baselineError.message}`,'warn');}catch(error){setRangeStatus(error?.message||'Unable to arm Build Test.','bad');showRangeOutput({error:error?.message||String(error),code:error?.code||null,status:error?.status||null,url:error?.url||null});}finally{if(button)button.disabled=!String(currentBuild()?.characterId||'').trim();}}
async function pullRange(){const button=byId('pullRangeResults'),build=currentBuild(),capture=readCapture();if(!captureMatchesCharacter(capture,build?.characterId)){setRangeStatus(`Capture blocked: saved character ${capture?.characterId||'unknown'} does not match current Build Forge Guardian ${build?.characterId||'unknown'}.`,'bad');showRangeOutput({error:'Build Test Guardian mismatch.',code:'capture-character-mismatch',captureCharacterId:capture?.characterId||null,currentCharacterId:build?.characterId||null});return;}try{if(button)button.disabled=true;setRangeStatus('Pulling completed post-arm activities and candidate PGCRs…','warn');const result=await collectBuildTestResults({expectedCharacterId:build.characterId});refreshRangeCapture();showRangeOutput(result);if(!result.candidates?.length)setRangeStatus('No completed post-arm Bungie activity candidate was found.','warn');else if(result.candidateSelection?.requiresUserConfirmation)setRangeStatus(`${result.candidates.length} candidates found. Confirm the correct completed activity; Build Forge will not guess.`,'warn');else if(!result.evidenceSummary?.verifiedActivityPgcrCount)setRangeStatus('Candidates pulled, but none has complete activity-hash + PGCR proof.','warn');else setRangeStatus(`${result.evidenceSummary.verifiedActivityPgcrCount} verified activity + PGCR record(s) pulled. Causal perk and uptime claims remain inference.`,'good');}catch(error){setRangeStatus(error?.message||'Unable to pull Build Test results.','bad');showRangeOutput({error:error?.message||String(error),code:error?.code||null,status:error?.status||null,url:error?.url||null,captureCharacterId:error?.captureCharacterId||null,currentCharacterId:error?.currentCharacterId||null});}finally{if(button)button.disabled=!captureMatchesCharacter(readCapture(),currentBuild()?.characterId);}}
document.addEventListener('click',event=>{const recommendationElement=event.target.closest('[data-recommendation-element]');if(recommendationElement&&!recommendationElement.disabled){recommendationFailure='';selectedRecommendationElement=recommendationElement.dataset.recommendationElement||'';renderRecommendationControls(currentBuild()||{});return;}const objective=event.target.closest('[data-build-objective]');if(objective&&!objective.disabled){recommendationFailure='';selectedRecommendationObjective=objective.dataset.buildObjective||'balanced';renderRecommendationControls(currentBuild()||{});return;}const artifactRecommend=event.target.closest('[data-artifact-recommend]');if(artifactRecommend){artifactRecommend.disabled=true;void refreshForgeArtifactRecommendation({force:true});return;}const candidate=event.target.closest('[data-confirm-instance]');if(candidate){try{const confirmed=confirmCandidateActivity(candidate.dataset.confirmInstance,{expectedCharacterId:currentBuild()?.characterId});refreshRangeCapture();showRangeOutput(confirmed);setRangeStatus(`COMPLETED ACTIVITY CONFIRMED · ${candidate.dataset.confirmInstance}`,'good');}catch(error){setRangeStatus(error?.message||'Unable to confirm this activity.','bad');}return;}const toggle=event.target.closest('[data-toggle-panel]');if(toggle){const panel=byId(toggle.dataset.togglePanel),expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!expanded));if(panel)panel.hidden=expanded;return;}const option=event.target.closest('[data-select-kind]');if(option){const kind=option.dataset.selectKind;stageSelection(kind,Number(option.dataset.selectIndex));if(kind!=='artifactPerks')queueMicrotask(()=>void refreshForgeArtifactRecommendation());}});
document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-open-manual-editor]');if(opener){void openManualEditor(opener.dataset.openManualEditor);return;}
  const slot=event.target.closest('[data-manual-slot]');if(slot){manualEditorState.slotIndex=Number(slot.dataset.manualSlot);manualEditorState.search='';byId('manualEditorSearch').value='';renderManualEditor();return;}
  const item=event.target.closest('[data-manual-item-index]');if(item){stageManualItem(Number(item.dataset.manualItemIndex));return;}
  const socket=event.target.closest('[data-manual-socket-option]');if(socket){stageManualSocket(socket.dataset.manualSocketOption);}
});
document.addEventListener('forge:character-selected',event=>{explicitlySelectedCharacterId=String(event.detail?.characterId||'');},true);
document.addEventListener('forge:guardian-selection-changed',event=>{const detail=event.detail||{};if(pendingApplyPlan||livePreflightBusy){closeApplyConfirmation();setLiveActionBanner('Apply confirmation cancelled because the selected Guardian or Bungie build changed. Review the current Working Build again.','warn');}if(manualInventory&&manualInventory.key!==manualInventoryKey(detail))manualInventory=null;switchBuildCharacter(detail);});
document.addEventListener('forge:guardian-loadout-context',event=>recoverMissingBuild(event.detail||{}));
document.addEventListener('forge:bungie-loadout-loaded',event=>{if(event.detail?.loadoutActionIntent==='save-paradox-copy')openSaveParadoxDialog(`BUNGIE SLOT ${Number(event.detail.selectedLoadoutIndex)+1} · ${String(event.detail.characterClass||'GUARDIAN').toUpperCase()}`);});
globalThis.addEventListener('forge:bungie-session',()=>renderApplyControls(currentBuild()||{}));
document.addEventListener('forge:loadout-loading',event=>{const slot=Number(event.detail?.index);byId('sourcePill').textContent=Number.isInteger(slot)?`BUILD SOURCE · LOADING BUNGIE SLOT ${slot+1}`:'BUILD SOURCE · LOADING BUNGIE SLOT';});
document.addEventListener('forge:loadout-error',()=>{byId('sourcePill').textContent='BUILD SOURCE · LOADOUT ERROR';});
document.querySelectorAll('[data-test-domain]').forEach(button=>button.addEventListener('click',()=>{testDomain=button.dataset.testDomain==='pvp'?'pvp':'pve';renderTestConfiguration();}));
byId('expectedDestination')?.addEventListener('change',event=>globalThis.ForgeDestinations?.set?.(event.target.value));
byId('backToGuardian')?.addEventListener('click',()=>{markGuardianFastReturn();location.href='../';});
byId('armRangeTest')?.addEventListener('click',armRange);
byId('pullRangeResults')?.addEventListener('click',pullRange);
byId('downloadRangeEvidence')?.addEventListener('click',downloadRangeEvidence);
byId('applyBuild')?.addEventListener('click',openApplyConfirmation);
byId('applyWorkingBuild')?.addEventListener('click',openApplyConfirmation);
byId('confirmApplyBuild')?.addEventListener('click',executeConfirmedApply);
byId('cancelApplyBuild')?.addEventListener('click',closeApplyConfirmation);
byId('saveParadoxBuild')?.addEventListener('click',()=>openSaveParadoxDialog());
byId('saveParadoxForm')?.addEventListener('submit',submitParadoxSave);
byId('cancelSaveParadox')?.addEventListener('click',closeSaveParadoxDialog);
byId('closeManualEditor')?.addEventListener('click',closeManualEditor);
byId('doneManualEditor')?.addEventListener('click',closeManualEditor);
byId('manualEditorSearch')?.addEventListener('input',event=>{manualEditorState.search=event.target.value||'';renderManualEditor();});
byId('restoreOriginal')?.addEventListener('click',restoreOriginal);
byId('generateMaxLoadout')?.addEventListener('click',generateMaxLoadout);
byId('closeRecommendedBuild')?.addEventListener('click',closeRecommendedBuild);
byId('returnToForge')?.addEventListener('click',closeRecommendedBuild);
byId('continueToBuildTest')?.addEventListener('click',continueToBuildTest);
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!byId('applyConfirmationDialog')?.hidden)closeApplyConfirmation();else if(!byId('saveParadoxDialog')?.hidden)closeSaveParadoxDialog();else if(!byId('manualBuildEditor')?.hidden)closeManualEditor();else if(!byId('recommendedBuildReveal')?.hidden)closeRecommendedBuild();});
async function initialiseBuildForge(){
  try{
    const atomicTransfer=await restoreAtomicForgeTransfer();
    const initialVaultState=atomicTransfer||readState()||await restorePersistedBuildState();
    if(initialVaultState){const nextVaultState=atomicTransfer||applyPendingVaultSelection(initialVaultState),artifactResult=applyForgeArtifactRecommendation(nextVaultState);if(artifactResult.state!==initialVaultState)writeState(artifactResult.state);}
  }catch(error){
    console.error('Build Forge could not complete the protected Forge Loader handoff. Rendering the existing Working Build instead.',error);
  }finally{
    render();
    const staged=currentBuild();if(new URLSearchParams(location.search).get('prewarm')==='forge-loader')scheduleForgePreparation(staged,{immediate:true});
    queueMicrotask(()=>void refreshForgeArtifactRecommendation());
  }
  const build=currentBuild(),intent=new URLSearchParams(location.search).get('loadoutIntent')||build?.loadoutActionIntent||'';
  if(intent==='save-paradox-copy')queueMicrotask(()=>openSaveParadoxDialog(`BUNGIE SLOT ${Number(build?.selectedLoadoutIndex)+1} · ${String(build?.characterClass||'GUARDIAN').toUpperCase()}`));
}
void initialiseBuildForge();
