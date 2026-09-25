import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as binding from '../pages/guardian-workspace-v2/paradox-build-binding.mjs';
import * as entry from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-recommendation.mjs';
import {ARMOUR_BUCKETS,WEAPON_BUCKETS} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {recordManualEdit} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import * as state from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {classifyArmourPlug} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {ForgePreparationClient,forgePreparationKey} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-preparation.mjs';

// Execute the production entry/restore/selection functions with controlled I/O.
// The profile fixture gives each Guardian distinct equipment and Super identity.
const runtime=await readFile(new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',import.meta.url),'utf8');
const profile=await readFile(new URL('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs',import.meta.url),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const guardians=['hunter','warlock','titan'].map(characterClass=>({source:'bungie-live',loadoutSource:'currently-equipped',characterId:characterClass,characterClass,membershipId:'account',membershipType:'3',selectedLoadoutIndex:7,subclassBuild:{super:{hash:`${characterClass}-super`}},weapons:[{itemInstanceId:`${characterClass}-weapon`}],armour:[{itemInstanceId:`${characterClass}-armour`}]}));
const store=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
function harness(search=''){
  const context=vm.createContext({...binding,...state,URL,URLSearchParams,console,structuredClone,sessionStorage:store(),localStorage:store(),location:{href:`https://example.test/paradox-build-space/${search}`,search},forgePreparation:{invalidate(){}},rendered:[],
    queueStatePersistence(){},readBuildForgeState:async()=>null,readForgeLoaderTransfer:async()=>null,clearVaultArmourSelection(){},readVaultArmourSelection:()=>null,
    validateVaultArmourSelection:value=>value,applyVaultArmourSelection:(baseline,selection)=>({applied:true,state:{...baseline,workingBuild:{...baseline.workingBuild,...selection.patch}}}),
    applyForgeArtifactRecommendation:value=>({state:value}),scheduleForgePreparation(){},queueMicrotask(){},refreshForgeArtifactRecommendation(){},
    render(){const build=context.currentBuild();if(build)context.rendered.push(build);}
  });
  context.history={state:null,replaceState(value,unused,url){context.location.href=String(url);context.location.search=new URL(url).search;}};
  vm.runInContext(`let volatileState=null,activeLoadError='',explicitlySelectedCharacterId='',initialisingBuild=true,pendingEquippedContext=null,equippedEntryState=null,statePersistenceRevision=0;
    const BUILD_SPACE_KEY='build',BUILD_SNAPSHOT_KEY='snapshot';
    ${between(runtime,'function validateBuildState','function emitLoad')}
    ${between(runtime,'function writeState(next)','function completeBuildRender')}
    function currentBuild(){const value=readState();return value?.workingBuild||null;}
    ${runtime.slice(runtime.indexOf('async function initialiseBuildForge()'),runtime.indexOf('void initialiseBuildForge();'))}
  `,context);
  context.seed=(build,key='build')=>context.sessionStorage.setItem(key,JSON.stringify(binding.createHandoffEnvelope(state.createBuildState(build))));
  context.startSelection=id=>vm.runInContext(`explicitlySelectedCharacterId=${JSON.stringify(id)};`,context);
  return context;
}
function checkBuild(build,expected){
  assert.equal(build.characterId,expected.characterId);
  assert.equal(build.characterClass,expected.characterClass);
  assert.equal(build.subclassBuild.super.hash,expected.subclassBuild.super.hash);
  assert.equal(build.weapons[0].itemInstanceId,expected.weapons[0].itemInstanceId);
  assert.equal(build.armour[0].itemInstanceId,expected.armour[0].itemInstanceId);
}
for(const selected of guardians)for(const stale of guardians){
  const h=harness();h.seed(stale);h.seed(stale,'snapshot');
  assert.equal(h.readState(),null,'A plain Build Forge visit must not adopt an unrequested cached build.');
  h.recoverMissingBuild(selected);
  await h.initialiseBuildForge();
  checkBuild(h.currentBuild(),selected);
  assert.equal(new URL(h.location.href).searchParams.get('characterId'),selected.characterId,'Default equipped state must bind subsequent refreshes to the same Guardian.');
  assert.equal(h.sessionStorage.getItem('build'),null,'An adopted equipped baseline must clear stale handoffs before the next refresh.');
  const fresh={...selected,weapons:[{itemInstanceId:`${selected.characterId}-fresh-equipped`}]};
  h.recoverMissingBuild(fresh);
  checkBuild(h.currentBuild(),fresh);
  const edited={...fresh,weapons:[{itemInstanceId:`${selected.characterId}-manual-choice`}]};
  h.writeState({...h.readState(),workingBuild:edited});
  h.recoverMissingBuild(fresh);
  checkBuild(h.currentBuild(),edited);
}
for(const original of guardians)for(const selected of guardians.filter(row=>row!==original)){
  const h=harness(`?characterId=${original.characterId}&membershipId=account&membershipType=3`);h.seed(original);h.readState();
  h.startSelection(selected.characterId);h.switchBuildCharacter(selected);
  checkBuild(h.currentBuild(),selected);
  assert.equal(new URL(h.location.href).searchParams.get('characterId'),selected.characterId,'A character click must replace the old URL binding.');
  h.switchBuildCharacter(original);
  checkBuild(h.currentBuild(),selected);
}
const late=harness('?characterId=hunter&membershipId=account&membershipType=3');
late.startSelection('titan');late.switchBuildCharacter(guardians[0]);
assert.equal(late.currentBuild(),null,'A late Hunter event cannot fulfil the pending Titan selection.');
late.switchBuildCharacter(guardians[2]);checkBuild(late.currentBuild(),guardians[2]);
const staged={...guardians[1],forgeLoaderDecision:{schemaVersion:1}};
const stage=harness('?characterId=warlock&membershipId=account&membershipType=3&vault=selection');
let finishTransfer;
stage.readForgeLoaderTransfer=()=>new Promise(resolve=>{finishTransfer=resolve;});
const loading=stage.initialiseBuildForge();
stage.recoverMissingBuild(guardians[1]);
finishTransfer({snapshotEnvelope:binding.createHandoffEnvelope(state.createBuildState(staged)),armourSelection:{patch:{armour:[{itemInstanceId:'staged-warlock-armour'}]}}});
await loading;
assert.equal(stage.currentBuild().armour[0].itemInstanceId,'staged-warlock-armour','Background equipped context must not beat the deliberate Forge Loader transfer.');
stage.recoverMissingBuild(guardians[1]);
assert.equal(stage.currentBuild().armour[0].itemInstanceId,'staged-warlock-armour');

const race=harness('?characterId=hunter&membershipId=account&membershipType=3');
let finishRead;
race.readBuildForgeState=()=>new Promise(resolve=>{finishRead=resolve;});
const restoring=race.restorePersistedBuildState();
race.startSelection('titan');race.switchBuildCharacter(guardians[2]);
finishRead(state.createBuildPersistenceSnapshot(state.createBuildState(guardians[0])));
assert.equal(await restoring,null,'An obsolete async restore must be discarded after a character switch.');
checkBuild(race.currentBuild(),guardians[2]);

const transferRace=harness('?characterId=warlock&membershipId=account&membershipType=3&vault=selection&loadoutIntent=edit&prewarm=forge-loader');
let finishOldTransfer;
transferRace.readForgeLoaderTransfer=()=>new Promise(resolve=>{finishOldTransfer=resolve;});
const oldTransfer=transferRace.restoreAtomicForgeTransfer();
transferRace.startSelection('titan');transferRace.switchBuildCharacter(guardians[2]);
finishOldTransfer({snapshotEnvelope:binding.createHandoffEnvelope(state.createBuildState(staged)),armourSelection:{patch:{armour:[{itemInstanceId:'staged-warlock-armour'}]}}});
assert.equal(await oldTransfer,null,'A delayed staged transfer cannot undo an explicit Guardian switch.');
checkBuild(transferRace.currentBuild(),guardians[2]);
for(const key of ['vault','loadoutIntent','prewarm'])assert.equal(new URL(transferRace.location.href).searchParams.has(key),false,'A Guardian switch must clear the previous entry intent.');

const refreshed=harness('?characterId=titan&membershipId=account&membershipType=3');
const saved=state.createBuildState(guardians[2]);saved.workingBuild.armour=[{itemInstanceId:'titan-manual-armour'}];
refreshed.readBuildForgeState=async()=>state.createBuildPersistenceSnapshot(saved);
await refreshed.initialiseBuildForge();
refreshed.recoverMissingBuild(guardians[2]);
assert.equal(refreshed.currentBuild().armour[0].itemInstanceId,'titan-manual-armour','Refreshing an explicitly bound Working Build must retain its edits.');

// Profile startup must select the same ID as Build Forge, including a click
// while the first profile request is still in flight.
for(const selected of guardians){
  const h=vm.createContext({URLSearchParams,console,location:{pathname:'/paradox-build-space/',search:''},sessionStorage:store(),document:{documentElement:{dataset:{guardianProfileMode:'roster-only'}},dispatchEvent(){}},
    CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
    assertRenderablePagePayload(){},currentPagePayloadKind:()=> 'build-forge',currentSelectedCharacterId:()=>selected.characterId,activeCharacter:()=>({characterId:'hunter'}),rememberCharacterId(){},publishCharacterRoster(payload,id){h.headerId=id;},normaliseLiveProfile:(payload,session,id)=>structuredClone(guardians.find(row=>row.characterId===id)),
    currentAuthenticatedSession:()=>({authenticated:true}),setRenderStatus(){},ensureLiveProfile(){},forgetLoadoutSelection(){},
  });
  vm.runInContext(`let explicitlySelectedCharacterId='',liveProfilePayload=null,liveProfileSession=null,preparedPagePayloadResolved=false;function resolvePreparedPagePayload(){}
    ${between(profile,'async function activateLiveProfile','async function loadLiveProfile')}
    ${between(profile,'function selectLiveCharacter','let liveProfileRequest')}
  `,h);
  const payload={profile:{characters:{data:Object.fromEntries(guardians.map(row=>[row.characterId,row]))}}};
  const loaded=await h.activateLiveProfile(payload,{});
  assert.equal(h.headerId,selected.characterId);
  checkBuild(loaded,selected);
  vm.runInContext('liveProfilePayload=null; explicitlySelectedCharacterId="";',h);
  h.currentSelectedCharacterId=()=>'';
  h.selectLiveCharacter(selected.characterId,selected.characterClass);
  checkBuild(await h.activateLiveProfile(payload,{}),selected);
}
console.log('BUILD_FORGE_EQUIPPED_ENTRY=PASS stale caches, all three Guardians, six switches, URL binding, protected staging and delayed restore/selection');

// Run the real armour-card and Build Forge render functions against a small
// DOM adapter, including the post-render step that used to erase installed mods.
const gearSource=await readFile(new URL('../pages/guardian-workspace-v2/guardian-gear-layout.mjs',import.meta.url),'utf8');
let modGrids=[];
const nodes=new Map(['weaponGrid','armourGrid','armourBuildState','armourBuildInstruction','armourBuildEvidence','weaponRecommendationState'].map(id=>[id,{textContent:'',querySelectorAll:()=>[]}]));
Object.defineProperty(nodes.get('armourGrid'),'innerHTML',{set(markup){
  modGrids=[...markup.matchAll(/<div class="gear-mods"[^>]*>([\s\S]*?)<\/div>/g)].map(match=>({innerHTML:match[1],dataset:{},classList:{add(){}},setAttribute(){}}));
}});
let renderedWeapons=[];
const display=vm.createContext({sizeBuildWeaponCards(){},directEntryMode:entry.directEntryMode,classifyArmourPlug,byId:id=>nodes.get(id),document:{querySelectorAll:()=>modGrids},bindParadoxItemInspect(){},renderWeapons:weapons=>{renderedWeapons=weapons;},itemTileMarkup:()=>'',perkTooltipAttributes:()=>''});
vm.runInContext(between(gearSource,'const esc =','export function buildGear').replace('export function armourCard','function armourCard'),display);
vm.runInContext(between(runtime,'function weaponCardShell','function currentBuild'),display);
for(const guardian of guardians){
  const armour=Array.from({length:5},(_,slot)=>({itemInstanceId:`${guardian.characterId}-armour-${slot}`,armourTier:5,mods:Array.from({length:6},(_,socket)=>({hash:10000+slot*10+socket,name:`Installed ${slot}:${socket}`,icon:`/installed-${slot}-${socket}.png`,semanticRole:socket===0?'masterwork':socket<3?'general-mod':'slot-mod'}))}));
  const build={...guardian,armour},before=JSON.stringify(build);
  for(const variant of [build,{...build,source:'bungie-loadout',loadoutSource:'bungie-live',selectedLoadoutIndex:4},{...build,forgeLoaderDecision:{schemaVersion:1,entryMode:'equipped'}},{...build,forgeLoaderDecision:{schemaVersion:1,entryMode:'owned'}},{...build,forgeLoaderDecision:{schemaVersion:1},editMode:'manual'},{...build,forgeLoaderDecision:{schemaVersion:1},recommendationGeneratedAt:'2026-09-16T00:00:00Z'}]){
    display.renderBuildGear(variant);
    assert.equal(modGrids.length,5);
    for(let slot=0;slot<5;slot++)for(const mod of armour[slot].mods)assert.ok(modGrids[slot].innerHTML.includes(`https://www.bungie.net${mod.icon}`),`${guardian.characterClass}: installed mod ${mod.name} must survive the complete gear render.`);
    assert.deepEqual(renderedWeapons,variant.weapons,'Armour presentation must retain the selected build weapons.');
  }
  display.renderBuildGear(build);
  assert.doesNotMatch(nodes.get('armourBuildState').textContent,/STAGED|PENDING/,'The equipped default is not a pending Forge Loader recommendation.');
  const staged={...build,forgeLoaderDecision:{schemaVersion:1}},stagedBefore=JSON.stringify(staged);
  display.renderBuildGear(staged);
  assert.equal(modGrids.every(grid=>(grid.innerHTML.match(/AI recommendation pending/g)||[]).length===12),true,'Only untouched Forge Loader staging keeps six pending recommendation slots per piece.');
  assert.equal(JSON.stringify(staged),stagedBefore,'Hiding proposed mod slots must never erase installed socket evidence.');
  assert.equal(JSON.stringify(build),before,'Rendering cannot mutate the original equipped armour, mods or weapons.');
}
console.log('BUILD_FORGE_MOD_PRESENTATION=PASS equipped, saved, staged, manual and generated builds for Hunter, Warlock and Titan');
// Prompt 11: execute the production renderer for every weapon label state.
const weaponStatus=nodes.get('weaponRecommendationState');
for(const [build,label,hidden] of [
  [{weapons:[{itemInstanceId:'equipped-weapon'}]},'EQUIPPED LOADOUT',false],
  [{weapons:[{itemInstanceId:'manual-weapon'}],editMode:'manual'},'MANUAL WORKING BUILD',false],
  [{weapons:[{itemInstanceId:'generated-weapon'}],recommendationGeneratedAt:'2026-09-24'},'PARADOX SELECTION',false],
  [{weapons:[]},'',true],
  [{weapons:[null,null,null],editMode:'manual'},'',true],
  [{recommendationGeneratedAt:'2026-09-24'},'',true]
]){
  display.renderBuildGear(build);
  assert.equal(weaponStatus.textContent,label);
  assert.equal(weaponStatus.hidden,hidden);
}
console.log('BUILD_FORGE_WEAPON_STATUS=PASS equipped, manual, generated and empty transitions');


// Direct entries execute the same production button handlers and readiness
// render with synthetic owned instances. No account or live action is involved.
const source={kind:'equipped',characterId:'91001'},socketEvidence={socketsAvailable:true,socketCoverage:{complete:true,unresolved:[]}};
const directArmour=ARMOUR_BUCKETS.map((bucketHash,index)=>({itemHash:92001+index,itemInstanceId:String(93001+index),name:`Owned armour ${index}`,bucketHash,classType:1,armourTier:index%3+1,source,...socketEvidence,energy:{capacity:5},stats:[{name:'Health',value:12}],isExotic:index===1,exoticPerk:index===1?{name:'Owned Exotic perk',description:'Grenade energy.'}:null}));
const directWeapons=WEAPON_BUCKETS.map((bucketHash,index)=>({itemHash:94001+index,itemInstanceId:String(95001+index),name:`Equipped weapon ${index}`,bucketHash,definition:{classType:3},source,...socketEvidence}));
const vaultHelmet={...directArmour[0],itemInstanceId:'96001',source:{kind:'vault'},armourTier:1};
const otherGuardianHelmet={...vaultHelmet,itemInstanceId:'96002',source:{kind:'carried',characterId:'91002'}};
const wrongClassHelmet={...vaultHelmet,itemInstanceId:'96003',classType:2};
const unknownClassHelmet={...vaultHelmet,itemInstanceId:'96004',classType:null};
const vaultWeapon={...directWeapons[0],itemInstanceId:'97001',source:{kind:'vault'}};
const restrictedWeapon={...vaultWeapon,itemInstanceId:'97002',definition:{classType:2}};
const equipped={characterId:source.characterId,characterClass:'hunter',membershipId:'98001',membershipType:'3',subclass:'void',armour:directArmour,weapons:directWeapons,ownedWeapons:[...directWeapons,vaultWeapon,restrictedWeapon]};
const inventory={armour:[...directArmour,vaultHelmet,otherGuardianHelmet,wrongClassHelmet,unknownClassHelmet]};
const node=dataset=>({dataset,textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},scrollIntoView(){}});
function directHarness(){
  const ui=new Map(['directOwnedArmour','recommendationElements','generateMaxLoadout','recommendationReadiness','forgePreparationStatus','forgeGenerationStatus'].map(id=>[id,node({})]));
  const buttons=[node({generationEntry:'equipped'}),node({generationEntry:'owned'})],elements=[node({recommendationElement:'void'})],objectives=[node({buildObjective:'balanced'})];
  const h=vm.createContext({...entry,...binding,...state,console,recordManualEdit,structuredClone,
    byId:id=>ui.get(id),document:{querySelectorAll:selector=>selector==='[data-generation-entry]'?buttons:selector==='[data-recommendation-element]'?elements:selector==='[data-build-objective]'?objectives:[]},
    esc:value=>String(value??''),elementOf:value=>value.element,hasVerifiedSubclassSockets:value=>value.verified,
    resolvedSubclassOptions:()=>[{element:'void',verified:true}],filterExoticCompatibleSubclasses:(build,options)=>options,
    scheduleForgePreparation(){},guardianManifest:{ready:async()=>{},hydratePayload:async()=>{}},assertRenderablePagePayload:value=>value,
    FORGE_PAGE_PAYLOAD:{membership:{membershipId:'98001',membershipType:'3'}},FORGE_BUNGIE_SESSION:{authenticated:true},
    normaliseLiveProfile:()=>structuredClone(equipped),createVaultCatalogue:()=>structuredClone(inventory),prepareArmourSelection:(payload,items)=>structuredClone(items),
    bindBuildRoute(){},ui,buttons,elements,objectives
  });
  vm.runInContext(`let value=createBuildState({...${JSON.stringify(equipped)},armour:[]}),directEntryBusy=false,recommendationBusy=false,liveActionBusy=false,selectedRecommendationElement='',selectedRecommendationObjective='',recommendationFailure='',equippedEntryState=null;
    function readState(){return value;}function writeState(next){value=next;}function currentBuild(){return value.workingBuild;}function render(){renderRecommendationControls(currentBuild());}
    ${between(runtime,'function manualSlotLabels','function currentManualItem')}
    ${between(runtime,'function stageWorkingBuild','function renderForgeActivityDialog')}
    ${between(runtime,'function renderRecommendationControls','function renderSuperSynergyEvidence')}
  `,h);
  return h;
}
for(const mode of ['equipped','owned']){
  const h=directHarness();await h.startDirectGeneration(mode);const build=h.currentBuild();
  assert.equal(entry.directEntryMode(build),mode);
  assert.deepEqual(Array.from(build.armour,item=>item.itemInstanceId),directArmour.map(item=>item.itemInstanceId),'Direct entry must start from equipped armour, not an old staged selection.');
  assert.deepEqual(Array.from(build.weapons,item=>item.itemInstanceId),directWeapons.map(item=>item.itemInstanceId));
  assert.equal(h.readState().originalBuild.armour[0].itemInstanceId,directArmour[0].itemInstanceId,'The original equipped baseline remains protected.');
  assert.equal(entry.validateTierFiveArmour(build).ready,false,'The fixture must fail the old Tier 5 maximized gate.');
  assert.equal(build.forgeLoaderDecision.ranking,undefined,'Direct entry cannot impersonate a maximized Forge Loader result.');
  assert.equal(build.forgeLoaderDecision.statDirective.achieved.health,60);
  assert.equal(h.ui.get('generateMaxLoadout').disabled,false,'A complete low-tier direct entry must unlock Generate.');
  assert.equal(h.elements[0].disabled,false);assert.equal(h.objectives[0].disabled,false);
  assert.ok(build.ownedWeapons.some(item=>item.itemInstanceId===vaultWeapon.itemInstanceId),'Owned weapon alternatives are available from the equipped baseline.');
  assert.ok(!build.ownedWeapons.some(item=>item.itemInstanceId===restrictedWeapon.itemInstanceId),'Class-restricted weapon candidates cannot enter the unchanged engine.');
  if(mode==='owned'){
    assert.equal(h.ui.get('directOwnedArmour').hidden,false);
    assert.deepEqual(Array.from(entry.directArmourChoices(build,0),item=>item.itemInstanceId),[directArmour[0].itemInstanceId,vaultHelmet.itemInstanceId,otherGuardianHelmet.itemInstanceId],'All owned class-compatible armour is available, including lower tiers and another Guardian inventory.');
    h.selectDirectArmour(0,vaultHelmet.itemInstanceId);
    assert.equal(h.currentBuild().armour[0].itemInstanceId,vaultHelmet.itemInstanceId);
    assert.equal(h.readState().originalBuild.armour[0].itemInstanceId,directArmour[0].itemInstanceId);
    assert.equal(h.ui.get('generateMaxLoadout').disabled,false);
    h.stageWorkingBuild(working=>{delete working.forgeLoaderDecision;});
    assert.equal(entry.directEntryMode(h.currentBuild()),'owned','Manual editing must retain the direct entry context.');
  }
  h.resolvedSubclassOptions=()=>[];h.render();
  assert.equal(h.ui.get('generateMaxLoadout').disabled,true,'Direct entry must not bypass verified subclass readiness.');
}
const legal=entry.createDirectGenerationBuild(equipped,{mode:'owned',armour:directArmour,ownedArmour:inventory.armour,ownedWeapons:equipped.ownedWeapons});
for(const [label,mutate] of [
  ['membership',build=>{build.membershipId='99999';}],
  ['class',build=>{build.armour[0].classType=2;}],
  ['unresolved class',build=>{build.characterClass='titan';build.armour[0].classType=null;}],
  ['ownership',build=>{build.armour[0].itemInstanceId='99999';build.ownedArmour=[];}],
  ['bucket',build=>{build.armour[0].bucketHash=ARMOUR_BUCKETS[1];}],
  ['missing socket data',build=>{build.armour[0].socketsAvailable=false;}],
  ['unresolved sockets',build=>{build.armour[0].socketCoverage={complete:false};}],
  ['unknown energy',build=>{delete build.armour[0].energy;}],
  ['energy budget',build=>{build.armour[0].generalMods=[{name:'Too expensive',energyCost:6}];}],
  ['extra Exotic armour',build=>{build.armour[0].isExotic=true;}],
  ['missing Exotic armour',build=>{build.armour[1].isExotic=false;}],
  ['extra Exotic weapon',build=>{build.weapons[0].isExotic=true;build.weapons[1].isExotic=true;}]
]){
  const invalid=structuredClone(legal);mutate(invalid);
  assert.equal(entry.validateForgeGenerationEntry(invalid).ready,false,`${label} must remain blocked.`);
  const h=directHarness();h.writeState(state.createBuildState(invalid));h.render();
  assert.equal(h.ui.get('generateMaxLoadout').disabled,true,`${label} must disable Generate.`);
}
const delayed=directHarness();let resolveManifest;
delayed.guardianManifest.ready=()=>new Promise(resolve=>{resolveManifest=resolve;});
const pendingEntry=delayed.startDirectGeneration('owned'),replacement=state.createBuildState({...equipped,characterId:'91002'});
assert.equal(delayed.ui.get('generateMaxLoadout').disabled,true,'Generate must wait for the chosen direct entry to finish preparing.');
delayed.writeState(replacement);resolveManifest();await pendingEntry;
assert.equal(delayed.readState(),replacement,'A delayed direct entry must not replace a newly selected Guardian.');
const wrongAccount=directHarness();wrongAccount.FORGE_PAGE_PAYLOAD.membership.membershipId='99999';
const originalAccountState=wrongAccount.readState();await wrongAccount.startDirectGeneration('owned');
assert.equal(wrongAccount.readState(),originalAccountState,'Prepared inventory from another account must not be staged.');
console.log('BUILD_FORGE_DIRECT_ENTRY=PASS equipped baseline, full owned armour, lower tiers, controls, legality and stale account/Guardian guards');

// Replay the live timeout through the real preparation callback and generation
// catch/finally, with controlled worker I/O and the exact captured error text.
const timeoutMessage='Build preparation exceeded the 120 second worker budget. No recommendation was generated. Retry this selection.';
const failureUI=directHarness();
Object.assign(failureUI,{ForgePreparationClient,forgePreparationKey,setTimeout,clearTimeout,
  console:{...console,error(){}},forgeActivityOption:()=>({key:'pve'}),
  refreshForgeArtifactRecommendation:async()=>{},showForgeGenerationLoader:async()=>{},hideForgeGenerationLoader(){},
  prepareForgeBackground:async()=>{},requestedForgeVariant:()=>({element:'void',objective:'balanced'}),setLiveActionBanner(){},
});
vm.runInContext(`let activePreparationKey='',preparationTimer=null;
  ${between(runtime,'const forgePreparation=new ForgePreparationClient','function forgeVariants')}
  ${between(runtime,'async function generateMaxLoadout','function renderBuildSurface')}
`,failureUI);
await failureUI.startDirectGeneration('owned');
const preparationClient=vm.runInContext('forgePreparation',failureUI);
preparationClient.input={};preparationClient.worker={postMessage(){},terminate(){}};
const failedGeneration=failureUI.generateMaxLoadout();
// Allow the production async entry to reach its actual pending worker request.
for(let turn=0;turn<10&&!preparationClient.pending.size;turn++)await Promise.resolve();
assert.equal(preparationClient.pending.size,1,'The reproduction must reach the real pending worker request.');
preparationClient.fail(timeoutMessage);
await failedGeneration;
const readinessNode=failureUI.ui.get('recommendationReadiness'),preparationNode=failureUI.ui.get('forgePreparationStatus');
assert.equal(readinessNode.textContent,timeoutMessage,'The complete timeout explanation must remain in the primary error box.');
assert.equal([readinessNode,preparationNode].filter(node=>!node.hidden&&node.textContent===timeoutMessage).length,1,'A generation timeout must be visible once, not in both the error box and preparation status.');
assert.equal(failureUI.ui.get('generateMaxLoadout').disabled,false,'The timeout must still allow retry.');
preparationClient.onStatus({type:'unavailable',message:timeoutMessage});
assert.equal(preparationNode.hidden,true,'A late preparation notification must not restore the duplicate.');
vm.runInContext("recommendationFailure='';",failureUI);failureUI.render();
assert.equal(preparationNode.hidden,false,'Clearing the generation failure must restore background status visibility.');
preparationClient.fail('Background preparation could not start. Try Generate Max Loadout again.');
assert.match(preparationNode.textContent,/Background preparation could not start/,'A background-only failure must remain visible.');
for(const [type,message,expected] of [['progress','Preparing next option','Preparing build options…'],['ready','', 'Build option ready']]){
  preparationClient.onStatus({type,key:forgePreparationKey({element:'void',objective:'balanced'}),message});
  assert.equal(preparationNode.hidden,false);assert.equal(preparationNode.textContent,expected);
}
console.log('BUILD_FORGE_TIMEOUT_PRESENTATION=PASS one visible error, late notifications, retry and background-only status');
