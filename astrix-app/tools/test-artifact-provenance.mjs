// Prompt 19: retain strict assertions with the new plain-language copy and resource tags.
import assert from 'node:assert/strict';
import {resolveArtifactByProvenance,createArtifactConfiguration} from '../pages/guardian-workspace-v2/guardian-artifact-provenance.mjs';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {resolveArtifactViewState} from '../pages/guardian-workspace-v2/guardian-artifact-state.mjs';

const definitions={'123':{displayProperties:{name:'Verified Active Perk',description:'Solar weapons gain a verified benefit.',icon:'/common/test.png'}}};
const payload={
  profile:{
    profileProgression:{data:{seasonalArtifact:{artifactHash:999}}},
    characterProgressions:{data:{'cid-live':{seasonalArtifact:{artifactHash:999,pointsUsed:1,tiers:[{tierHash:77,isUnlocked:true,pointsToUnlock:0,items:[
      {itemHash:123,isActive:true,isVisible:true},
      {itemHash:456,isActive:false,isVisible:true}
    ]}]}}}}
  },
  definitions,
  currentSeasonNumber:28,
  artifactDefinition:{hash:999,displayProperties:{name:'Verified Artifact'},tiers:[{tierHash:77,displayTitle:'Champion tools',minimumUnlockPointsUsedRequirement:0,items:[{itemHash:123},{itemHash:456}]}]}
};

const live=resolveArtifactByProvenance(payload,'cid-live');
assert.equal(live.state,'resolved');
assert.deepEqual(live.artifactConfiguration.selectedPerkHashes,[123]);
assert.equal(live.artifactConfiguration.provenance.component,202);
assert.equal(live.activePerks[0].name,'Verified Active Perk');
assert.equal(live.seasonNumber,28);
assert.equal(live.pointsUsed,1);
assert.equal(live.perks[0].tierHash,77);
assert.equal(live.perks[0].tierIndex,0);
assert.equal(live.perks[0].column,1);
assert.equal(live.perks[0].order,1);
assert.equal(live.perks[0].tierTitle,'Champion tools');
assert.equal(live.perks[0].tierUnlocked,true);
assert.equal(live.perks[0].minimumUnlockPointsUsedRequirement,0);

const nonePayload=structuredClone(payload);
nonePayload.profile.characterProgressions.data['cid-live'].seasonalArtifact.tiers[0].items[0].isActive=false;
const none=resolveArtifactByProvenance(nonePayload,'cid-live');
assert.equal(none.state,'none-active');
assert.deepEqual(none.artifactConfiguration.selectedPerkHashes,[]);

const unavailable=resolveArtifactByProvenance(payload,'missing-character');
assert.equal(unavailable.state,'state-unavailable');
assert.equal(unavailable.activePerks,null);
assert.equal(unavailable.artifactConfiguration.selectedPerkHashes,null);

const missingLiveView=resolveArtifactViewState({source:'bungie-live',artifact:null});
assert.equal(missingLiveView.mode,'live','a live event without an Artifact must not fall back to fixture mode');
assert.equal(missingLiveView.state,'state-unavailable');
assert.equal(missingLiveView.artifact,null);
assert.equal(missingLiveView.perks,null,'missing component-202 Artifact evidence must not become zero active perks');
assert.equal(missingLiveView.selectedHashes,null);

const unavailableLiveView=resolveArtifactViewState({source:'bungie-live',artifact:unavailable});
assert.equal(unavailableLiveView.mode,'live');
assert.equal(unavailableLiveView.perks,null,'unavailable component-202 activation evidence must remain unknown');
assert.equal(unavailableLiveView.selectedHashes,null);

const incompleteActivationPayload=structuredClone(payload);
delete incompleteActivationPayload.profile.characterProgressions.data['cid-live'].seasonalArtifact.tiers[0].items[0].isActive;
const incompleteActivation=resolveArtifactByProvenance(incompleteActivationPayload,'cid-live');
assert.equal(incompleteActivation.state,'state-unavailable');
assert.equal(incompleteActivation.activePerks,null,'missing isActive evidence must not become zero active perks');
assert.equal(incompleteActivation.artifactConfiguration.selectedPerkHashes,null);
assert.match(incompleteActivation.stateMessage,/incomplete Artifact tier activation data/);

const incompleteVisibilityPayload=structuredClone(payload);
delete incompleteVisibilityPayload.profile.characterProgressions.data['cid-live'].seasonalArtifact.tiers[0].items[0].isVisible;
const incompleteVisibility=resolveArtifactByProvenance(incompleteVisibilityPayload,'cid-live');
assert.equal(incompleteVisibility.state,'state-unavailable');
assert.equal(incompleteVisibility.activePerks,null,'missing isVisible evidence must block legal recommendation eligibility');

const malformedHashPayload=structuredClone(payload);
malformedHashPayload.profile.characterProgressions.data['cid-live'].seasonalArtifact.tiers[0].items[0].itemHash=null;
const malformedHash=resolveArtifactByProvenance(malformedHashPayload,'cid-live');
assert.equal(malformedHash.state,'state-unavailable');
assert.equal(malformedHash.activePerks,null,'missing perk identity must leave activation state unavailable');

const unresolvedPayload=structuredClone(payload);
unresolvedPayload.profile.characterProgressions.data['cid-live'].seasonalArtifact.tiers[0].items[0].itemHash=789;
const unresolved=resolveArtifactByProvenance(unresolvedPayload,'cid-live');
assert.equal(unresolved.activePerks[0].name,'Unresolved Destiny definition 789');
assert.equal(unresolved.activePerks[0].unresolved,true);
assert.deepEqual(unresolved.unresolvedPerkHashes,[789]);

const mismatchedDefinitionPayload=structuredClone(payload);
mismatchedDefinitionPayload.artifactDefinition={hash:111,displayProperties:{name:'Wrong Artifact',icon:'/common/wrong.png'}};
const mismatchedDefinition=resolveArtifactByProvenance(mismatchedDefinitionPayload,'cid-live');
assert.equal(mismatchedDefinition.hash,999);
assert.equal(mismatchedDefinition.name,'Unresolved Destiny definition 999','a stale definition must not label a different Artifact hash');
assert.equal(mismatchedDefinition.definition,null);
assert.equal(mismatchedDefinition.displayResolved,false);
assert.equal(mismatchedDefinition.unresolved,true);

const exactManifestPayload=structuredClone(mismatchedDefinitionPayload);
exactManifestPayload.definitions['999']={hash:999,displayProperties:{name:'Exact Manifest Artifact',icon:'/common/exact.png'}};
const exactManifestArtifact=resolveArtifactByProvenance(exactManifestPayload,'cid-live');
assert.equal(exactManifestArtifact.name,'Exact Manifest Artifact','an exact manifest hash may resolve display identity');
assert.equal(exactManifestArtifact.definition.hash,999);
assert.equal(exactManifestArtifact.unresolved,false);

const intended=createArtifactConfiguration({artifactHash:999,seasonNumber:28,selectedPerkHashes:[123],source:'fixture-intent',provenance:{provider:'fixture'}});
assert.equal(createArtifactConfiguration({source:'fixture-intent'}).artifactHash,null);
const state=createBuildState({characterId:'fixture',artifactConfiguration:intended});
assert.deepEqual(state.originalBuild.artifactConfiguration,intended);
state.workingBuild.artifactConfiguration.selectedPerkHashes.push(456);
assert.deepEqual(state.originalBuild.artifactConfiguration.selectedPerkHashes,[123]);

console.log('Artifact provenance and build-state tests passed.');
