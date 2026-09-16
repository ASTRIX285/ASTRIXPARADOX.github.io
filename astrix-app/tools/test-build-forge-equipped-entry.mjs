import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as binding from '../pages/guardian-workspace-v2/paradox-build-binding.mjs';
import * as state from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {classifyArmourPlug} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';

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
const display=vm.createContext({classifyArmourPlug,byId:id=>nodes.get(id),document:{querySelectorAll:()=>modGrids},bindParadoxItemInspect(){},renderWeapons:weapons=>{renderedWeapons=weapons;},itemTileMarkup:()=>'',perkTooltipAttributes:()=>''});
vm.runInContext(between(gearSource,'const esc =','export function buildGear').replace('export function armourCard','function armourCard'),display);
vm.runInContext(between(runtime,'function weaponCardShell','function currentBuild'),display);
for(const guardian of guardians){
  const armour=Array.from({length:5},(_,slot)=>({itemInstanceId:`${guardian.characterId}-armour-${slot}`,armourTier:5,mods:Array.from({length:6},(_,socket)=>({hash:10000+slot*10+socket,name:`Installed ${slot}:${socket}`,icon:`/installed-${slot}-${socket}.png`,semanticRole:socket===0?'masterwork':socket<3?'general-mod':'slot-mod'}))}));
  const build={...guardian,armour},before=JSON.stringify(build);
  for(const variant of [build,{...build,source:'bungie-loadout',loadoutSource:'bungie-live',selectedLoadoutIndex:4},{...build,forgeLoaderDecision:{schemaVersion:1},editMode:'manual'},{...build,forgeLoaderDecision:{schemaVersion:1},recommendationGeneratedAt:'2026-09-16T00:00:00Z'}]){
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
