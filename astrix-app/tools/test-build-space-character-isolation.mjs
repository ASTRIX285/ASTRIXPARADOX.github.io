import assert from 'node:assert/strict';
import {createHandoffEnvelope,repairMissingBuildBinding,mergePreparedLoadoutContext,shouldReplaceBuildState,validateHandoffEnvelope} from '../pages/guardian-workspace-v2/paradox-build-binding.mjs';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';

class MemoryStore{
  constructor(){this.values=new Map();this.rejectWrites=false;}
  getItem(key){return this.values.has(key)?this.values.get(key):null;}
  setItem(key,value){if(this.rejectWrites)throw new DOMException('Storage quota exceeded','QuotaExceededError');this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}

globalThis.sessionStorage=new MemoryStore();
globalThis.localStorage=new MemoryStore();
const documentListeners=new Map();
globalThis.document={
  addEventListener(type,listener){const rows=documentListeners.get(type)||[];rows.push(listener);documentListeners.set(type,rows);},
  querySelector(){return null;},
  dispatchEvent(){}
};
globalThis.requestAnimationFrame=callback=>{callback();return 1;};
globalThis.location={href:''};

const {
  rememberGuardian,
  rememberExplicitLoadout,
  rememberWeaponAdvice,
  rememberArtifactSelection,
  resolveBuildSource,
  currentProfileBuildSource,
  BUILD_SPACE_KEY,
  BUILD_SNAPSHOT_KEY,
  LAST_LOADOUT_KEY
}=await import('../pages/guardian-workspace-v2/paradox-build-space-handoff.mjs');

const intendedWarlockArtifactConfiguration={
  schemaVersion:1,
  artifactHash:8001,
  seasonNumber:29,
  selectedPerkHashes:[101],
  source:'saved-build-intent',
  provenance:{provider:'bungie-manifest',manifestHash:8001,component:202}
};
const warlockLoadout={characterId:'warlock-1',membershipId:'membership-1',membershipType:'3',characterClass:'Warlock',selectedLoadoutIndex:2,weapons:[{itemInstanceId:'warlock-weapon'}],artifactConfiguration:intendedWarlockArtifactConfiguration};
const protectedWarlockForge=createBuildState({...warlockLoadout,selectedLoadoutIndex:null,forgeLoaderDecision:{schemaVersion:1}});
const automaticHunterProfile={source:'bungie-live',characterId:'hunter-1',membershipId:'membership-1',membershipType:'3',selectedLoadoutIndex:null};
assert.equal(shouldReplaceBuildState(protectedWarlockForge,automaticHunterProfile,{vaultSelection:true}),false,'a background active-character profile cannot replace a different Guardian\'s protected Forge Loader transfer');
assert.equal(shouldReplaceBuildState(protectedWarlockForge,automaticHunterProfile),false,'route cleanup cannot let background hydration replace a protected Working Build');
assert.equal(shouldReplaceBuildState(protectedWarlockForge,{...automaticHunterProfile,characterId:'warlock-1'}),false,'same-Guardian background hydration cannot discard staged manual or generated changes');
assert.equal(shouldReplaceBuildState(protectedWarlockForge,automaticHunterProfile,{vaultSelection:true,explicitlySelectedCharacterId:'hunter-1'}),true,'an explicit character-card selection can replace the protected transfer');
assert.equal(shouldReplaceBuildState(protectedWarlockForge,{...automaticHunterProfile,selectedLoadoutIndex:4},{vaultSelection:true}),true,'an explicitly selected Bungie loadout can replace the protected transfer');
const unboundWarlockForge=createBuildState({characterId:'warlock-1',characterClass:'Warlock',forgeLoaderDecision:{schemaVersion:1}}),repairedWarlockForge=repairMissingBuildBinding(unboundWarlockForge,{...automaticHunterProfile,characterId:'warlock-1'});
assert.equal(repairedWarlockForge.originalBuild.membershipId,'membership-1','authenticated hydration repairs a missing protected Original Build membership without replacing it');
assert.equal(repairedWarlockForge.workingBuild.membershipType,'3','authenticated hydration repairs a missing Working Build membership type without discarding edits');
assert.equal(repairMissingBuildBinding(unboundWarlockForge,automaticHunterProfile),unboundWarlockForge,'a different Guardian cannot repair or alter the protected build binding');
const preparedLoadouts=[{colorHash:7101,iconHash:7102,nameHash:7103,items:[{itemInstanceId:'warlock-weapon'}],subclassOverrides:[{itemInstanceId:'warlock-subclass',plugItemHashes:[7201]}]}];
const loadoutRepaired=mergePreparedLoadoutContext(protectedWarlockForge,{...automaticHunterProfile,characterId:'warlock-1',loadoutsAvailable:true,loadouts:preparedLoadouts});
assert.deepEqual(loadoutRepaired.originalBuild.loadouts,preparedLoadouts,'same Guardian hydration must repair missing in-game loadout slots on the protected Original Build');
assert.deepEqual(loadoutRepaired.workingBuild.loadouts,preparedLoadouts,'same Guardian hydration must repair missing in-game loadout slots without discarding the Working Build');
assert.deepEqual(loadoutRepaired.workingBuild.forgeLoaderDecision,protectedWarlockForge.workingBuild.forgeLoaderDecision,'loadout repair must preserve the staged Forge Loader decision');
assert.equal(mergePreparedLoadoutContext(loadoutRepaired,{...automaticHunterProfile,characterId:'warlock-1',loadoutsAvailable:true,loadouts:preparedLoadouts}),loadoutRepaired,'unchanged prepared loadouts must not rewrite Build Forge state');
assert.equal(mergePreparedLoadoutContext(protectedWarlockForge,{...automaticHunterProfile,loadoutsAvailable:true,loadouts:preparedLoadouts}),protectedWarlockForge,'a different Guardian cannot repair protected loadout context');
rememberGuardian(warlockLoadout);
rememberExplicitLoadout(warlockLoadout);
assert.equal(resolveBuildSource().selectedLoadoutIndex,2,'selected loadout is preferred while its Guardian remains active');

const titanEquipped={characterId:'titan-1',membershipId:'membership-1',membershipType:'3',characterClass:'Titan',selectedLoadoutIndex:null,weapons:[{itemInstanceId:'titan-weapon'}],artifactConfiguration:{selectedPerkHashes:[201]}};
rememberGuardian(titanEquipped);
assert.equal(resolveBuildSource().characterId,'titan-1','switching Guardian rejects a stale loadout from another character');
assert.equal(resolveBuildSource().selectedLoadoutIndex,null,'current equipped Guardian remains the source after the switch');

rememberArtifactSelection({characterId:'titan-1',selectedLoadoutIndex:null,artifact:{hash:9001},artifactConfiguration:{selectedPerkHashes:[202]},perks:[{hash:202}]});
rememberWeaponAdvice({characterId:'titan-1',selectedLoadoutIndex:null,recommendations:[{itemInstanceId:'titan-weapon',verdict:'keep'}]});
const titanSource=resolveBuildSource();
assert.deepEqual(titanSource.artifactConfiguration.selectedPerkHashes,[202]);
assert.equal(titanSource.weapons[0].weaponRollAdvice.verdict,'keep');

rememberArtifactSelection({
  characterId:'titan-1',
  selectedLoadoutIndex:null,
  state:'state-unavailable',
  artifact:{hash:9001,state:'state-unavailable',activePerks:null,perks:null},
  artifactConfiguration:{
    schemaVersion:1,
    artifactHash:9001,
    seasonNumber:29,
    selectedPerkHashes:null,
    source:'bungie-live-state-unavailable',
    provenance:{provider:'bungie',component:202,state:'state-unavailable'}
  },
  perks:null
});
const unavailableTitanSource=resolveBuildSource();
assert.equal(unavailableTitanSource.artifact.state,'state-unavailable');
assert.equal(unavailableTitanSource.artifact.activePerks,null,'unavailable component-202 evidence must not become an empty active-perk list');
assert.equal(unavailableTitanSource.artifactConfiguration.selectedPerkHashes,null,'unavailable live selection remains distinct from explicit empty intent');

const persistedWarlockEnvelope=JSON.parse(localStorage.getItem(LAST_LOADOUT_KEY));
assert.equal(persistedWarlockEnvelope.schemaVersion,2,'durable loadouts use the versioned handoff envelope');
assert.equal(persistedWarlockEnvelope.binding.characterId,'warlock-1','durable envelope remains bound to the saved Guardian');
assert.equal(persistedWarlockEnvelope.binding.membershipId,'membership-1','durable envelope remains bound to the Bungie membership');
assert.equal(persistedWarlockEnvelope.binding.membershipType,'3','durable envelope retains the Bungie membership type');
assert.equal(validateHandoffEnvelope(persistedWarlockEnvelope,{expectedCharacterId:'warlock-1',expectedMembershipId:'membership-1',expectedMembershipType:'3'})?.characterId,'warlock-1','exact Guardian and platform binding is accepted');
for(const [field,value] of [['characterId','titan-1'],['membershipId','membership-2'],['membershipType','2']]){
  const tampered=structuredClone(persistedWarlockEnvelope);
  tampered.binding[field]=value;
  assert.equal(validateHandoffEnvelope(tampered),null,`tampered ${field} binding must be rejected`);
}
assert.equal(validateHandoffEnvelope(persistedWarlockEnvelope,{expectedMembershipType:'2'}),null,'a different requested Bungie platform must not reuse the cached loadout');
const expired=structuredClone(persistedWarlockEnvelope);
expired.savedAt=Date.now()-(31*60*1000);
assert.equal(validateHandoffEnvelope(expired),null,'expired durable handoffs must remain unavailable');
const persistedWarlock=persistedWarlockEnvelope.payload;
assert.deepEqual(persistedWarlock.artifactConfiguration,intendedWarlockArtifactConfiguration,'saved Artifact intent must retain its exact hash, season, perks, source and provenance through JSON storage');
assert.notEqual(persistedWarlock.artifactConfiguration,intendedWarlockArtifactConfiguration,'persisted Artifact intent must be a detached JSON snapshot');
assert.deepEqual(persistedWarlock.artifactConfiguration.selectedPerkHashes,[101],'Titan Artifact intent cannot contaminate the cached Warlock loadout');
assert.equal(persistedWarlock.weaponRollAdvice,undefined,'Titan weapon advice cannot contaminate the cached Warlock loadout');

rememberGuardian({...warlockLoadout,selectedLoadoutIndex:null});
assert.equal(resolveBuildSource().selectedLoadoutIndex,null,'returning to a character current-equipped view does not silently reopen its old saved loadout');

const exactArmourSet={identity:{hash:7001,name:'Seventh Seraph',icon:'/set.png'},twoPiece:{hash:7002,icon:'/two.png',active:true},fourPiece:{hash:7004,icon:'/four.png',active:true}};
const exactSockets=[1,2,3,4,5].map(hash=>({hash,name:`Armour socket ${hash}`,semanticRole:hash<3?'general-mod':'slot-mod'}));
const currentPaintedBuild={...warlockLoadout,selectedLoadoutIndex:null,armour:[{name:'Current helmet',armourSemantics:{set:exactArmourSet,generalMods:exactSockets.slice(0,2),slotMods:exactSockets.slice(2)},setBonus:exactArmourSet,generalMods:exactSockets.slice(0,2),slotMods:exactSockets.slice(2),mods:[{hash:99,semanticRole:'masterwork'},...exactSockets]}]};
sessionStorage.setItem(BUILD_SNAPSHOT_KEY,JSON.stringify(createHandoffEnvelope(createBuildState(currentPaintedBuild))));
const currentPaintedSource=currentProfileBuildSource();
assert.deepEqual(currentPaintedSource.armour[0].armourSemantics.set,exactArmourSet,'Build handoff must use the current painted armour set evidence');
assert.deepEqual(currentPaintedSource.armour[0].mods.map(row=>row.hash),[99,1,2,3,4,5],'Build handoff must retain every current armour socket in order');

const staleState=createBuildState({...warlockLoadout,armour:[{name:'Stale helmet',mods:[]}]});
for(const store of [sessionStorage,localStorage])store.setItem(BUILD_SPACE_KEY,JSON.stringify(createHandoffEnvelope(staleState)));
const improveClick=documentListeners.get('click')?.at(-1);
assert.equal(typeof improveClick,'function','Build handoff must own the Improve My Guardian click');
await improveClick({target:{closest:selector=>selector==='.improve-cta'?{}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
assert.match(location.href,/^\.\/paradox-build-space\/\?characterId=warlock-1/,'Improve My Guardian must navigate with the current Guardian binding');
assert.equal(sessionStorage.getItem(BUILD_SPACE_KEY),null,'stale session Build copy must be cleared before navigation');
assert.equal(localStorage.getItem(BUILD_SPACE_KEY),null,'stale durable Build copy must be cleared before navigation');
assert.ok(sessionStorage.getItem(BUILD_SNAPSHOT_KEY),'the already-protected current Character snapshot must remain available for Build Forge');

for(const store of [sessionStorage,localStorage]){store.removeItem(BUILD_SNAPSHOT_KEY);store.rejectWrites=true;}
location.href='';
await improveClick({target:{closest:selector=>selector==='.improve-cta'?{}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
assert.match(location.href,/^\.\/paradox-build-space\/\?characterId=warlock-1/,'Improve My Guardian must still navigate when Web Storage rejects the handoff');
for(const store of [sessionStorage,localStorage])store.rejectWrites=false;

globalThis.requestAnimationFrame=()=>1;
location.href='';
const suspendedFrameStartedAt=Date.now();
await improveClick({target:{closest:selector=>selector==='.improve-cta'?{}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
assert.match(location.href,/^\.\/paradox-build-space\/\?characterId=warlock-1/,'Improve My Guardian must navigate when animation frames are suspended');
assert.ok(Date.now()-suspendedFrameStartedAt<1000,'Build Forge navigation must use its bounded paint fallback');

console.log('Build Space character isolation tests passed.');
