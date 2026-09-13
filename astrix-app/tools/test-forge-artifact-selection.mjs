import assert from 'node:assert/strict';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {applyForgeArtifactRecommendation,artifactPerkCatalogue} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-artifact-selection.mjs';

const perk=(hash,name,description,tierIndex,itemIndex,minimumUnlockPointsUsedRequirement,{active=false,visible=true}={})=>({
  hash,
  name,
  description,
  displayResolved:true,
  unresolved:false,
  isActive:active,
  isVisible:visible,
  tierUnlocked:true,
  tierIndex,
  itemIndex,
  column:tierIndex+1,
  order:itemIndex+1,
  minimumUnlockPointsUsedRequirement
});

const source={
  source:'bungie-live',
  characterId:'hunter-artifact',
  currentSeasonNumber:31,
  subclass:'Solar',
  subclassBuild:{super:{hash:501,name:'Solar Super',description:'Solar Super final blows ignite targets.'},abilities:[],aspects:[],fragments:[]},
  weapons:[{hash:601,name:'Verified Sidearm',weaponType:'Sidearm',element:'Solar'}],
  artifact:{
    hash:999,
    artifactHash:999,
    name:'Verified Current Artifact',
    seasonNumber:31,
    pointsUsed:3,
    state:'resolved',
    provenance:'bungie-character-progressions-202',
    perks:[
      perk(101,'Piercing Sidearm','Your equipped Sidearms stun Barrier Champions.',0,0,0,{active:true}),
      perk(106,'Void Recovery','Void effects grant overshield.',0,1,0),
      perk(102,'Solar Grenade Engine','Solar grenade final blows improve grenade recharge.',1,0,1,{active:true}),
      perk(103,'Precision Reserve','Precision weapon final blows improve ammo reserves.',1,1,1),
      perk(105,'Charged Ordnance','Armour Charge improves grenade damage.',2,0,2,{active:true})
    ],
    activePerks:[],
    artifactConfiguration:{artifactHash:999,seasonNumber:31,selectedPerkHashes:[101,102,105],source:'bungie-live',provenance:{provider:'bungie',component:202}}
  },
  artifactConfiguration:{artifactHash:999,seasonNumber:31,selectedPerkHashes:[101,102,105],source:'bungie-live',provenance:{provider:'bungie',component:202}},
  forgeLoaderDecision:{
    buildAnchor:{perk:{hash:801,name:'Exotic Grenade Loop',description:'Solar grenade final blows grant Armour Charge.'}},
    statDirective:{targets:{health:0,melee:0,grenade:200,super:0,class:0,weapon:100},priorities:{health:null,melee:null,grenade:1,super:null,class:null,weapon:2}},
    setProtocol:[{count:4,trait:{hash:901,name:'Charged Arsenal',description:'Armour Charge improves grenade and weapon damage.'}}]
  }
};
source.artifact.activePerks=source.artifact.perks.filter(row=>row.isActive);

const state=createBuildState(source);
const originalBefore=JSON.stringify(state.originalBuild);
const liveBefore=JSON.stringify(state.originalBuild.artifactConfiguration);
const result=applyForgeArtifactRecommendation(state,{currentSeasonNumber:31});
assert.equal(result.applied,true);
assert.strictEqual(result.state.originalBuild,state.originalBuild,'Artifact recommendation must retain the immutable Original Build without duplicating its inventory');
assert.equal(JSON.stringify(result.state.originalBuild),originalBefore,'Artifact recommendation must not mutate Original Build');
assert.equal(JSON.stringify(result.state.originalBuild.artifactConfiguration),liveBefore,'Artifact recommendation must not rewrite captured live Artifact state');
assert.equal(Object.isFrozen(result.state.originalBuild),true);
assert.equal(result.state.workingBuild.artifactConfiguration.source,'paradox-forge-loader-recommendation');
assert.equal(result.state.workingBuild.artifactConfiguration.provenance.state,'recommended-working-build-only');
assert.equal(result.state.workingBuild.artifactRecommendation.source,'paradox-forge-loader-artifact-fit');
assert.equal(result.state.workingBuild.artifactRecommendation.selectionStatus,'ready');
assert.equal(result.state.workingBuild.artifactRecommendation.selectionLimit,5,'Build Forge must stage the complete target tree rather than stopping at currently spent points');
assert.deepEqual(result.state.workingBuild.artifactConfiguration.selectedPerkHashes,[101,102,103,105,106]);
assert.equal('confirmed' in result.state.workingBuild.artifactConfiguration,false,'a recommendation must not masquerade as user confirmation');
assert.equal('liveApplied' in result.state.workingBuild.artifactConfiguration,false,'a recommendation must not claim a live mutation');
assert.equal(JSON.parse(result.recommendation.fingerprint).artifactPlanVersion,3,'the cross-system plan release must invalidate older cached Artifact recommendations');

const zeroPointSource={
  ...source,
  artifact:{
    ...source.artifact,
    pointsUsed:0,
    perks:source.artifact.perks.map(row=>({...row,isActive:false})),
    activePerks:[],
    artifactConfiguration:{...source.artifact.artifactConfiguration,selectedPerkHashes:[]}
  },
  artifactConfiguration:{...source.artifactConfiguration,selectedPerkHashes:[]}
};
const zeroPointState=createBuildState(zeroPointSource);
const zeroPointOriginal=JSON.stringify(zeroPointState.originalBuild);
const zeroPointResult=applyForgeArtifactRecommendation(zeroPointState,{currentSeasonNumber:31});
assert.equal(zeroPointResult.applied,true,'Build Forge must stage the complete Artifact target plan even when no unused live unlock points are reported');
assert.equal(zeroPointResult.recommendation.planMode,'full-build-target');
assert.equal(zeroPointResult.recommendation.liveSelectionLimit,0);
assert.equal(zeroPointResult.state.workingBuild.artifactConfiguration.selectedPerkHashes.length,source.artifact.perks.length);
assert.equal(JSON.stringify(zeroPointResult.state.originalBuild),zeroPointOriginal,'a full Artifact target plan must not alter the captured live Original Build');

const repeated=applyForgeArtifactRecommendation(result.state,{currentSeasonNumber:31});
assert.equal(repeated.applied,false,'unchanged inputs must reuse the deterministic recommendation');
assert.equal(repeated.state,result.state);

const staleState=createBuildState(source);
const stale=applyForgeArtifactRecommendation(staleState,{currentSeasonNumber:32});
assert.equal(stale.applied,false);
assert.equal(stale.recommendation.status,'stale-artifact');
assert.deepEqual(stale.state.workingBuild.artifactConfiguration.selectedPerkHashes,[101,102,105],'stale season evidence must not stage a replacement');
assert.equal(JSON.stringify(stale.state.originalBuild),JSON.stringify(staleState.originalBuild));

const withoutForgeDecision=createBuildState({...source,forgeLoaderDecision:null});
const skipped=applyForgeArtifactRecommendation(withoutForgeDecision,{currentSeasonNumber:31});
assert.equal(skipped.applied,false);
assert.equal(skipped.state,withoutForgeDecision,'Artifact automation requires the exact Forge Loader decision');

const artifactTwo=(hash,name,perkBase,descriptions)=>({
  hash,
  name,
  availabilityModel:'artifact-2-socket-buckets',
  manifestVersion:'artifact-2-test',
  state:'catalogued',
  selectionSlots:[
    {tierIndex:0,bucket:1,capacity:1,perkHashes:[perkBase]},
    {tierIndex:1,bucket:2,capacity:1,perkHashes:[perkBase+1]}
  ],
  perks:descriptions.map((description,index)=>perk(perkBase+index,`${name} ${index+1}`,description,index,index,0))
});
const solarArtifact=artifactTwo(2001,'Solar Logic',2101,['Solar grenade final blows improve grenade recharge.','Armour Charge improves weapon damage.']);
const voidArtifact=artifactTwo(2002,'Void Logic',2201,['Void effects grant overshield.','Gain handling while crouched.']);
const artifactTwoSource={...source,artifact:source.artifact,availableArtifacts:[voidArtifact,solarArtifact],artifactOptions:[voidArtifact,solarArtifact]};
const artifactTwoState=createBuildState(artifactTwoSource);
const originalArtifactHash=artifactTwoState.originalBuild.artifact.hash;
const artifactTwoApplied=applyForgeArtifactRecommendation(artifactTwoState,{currentSeasonNumber:31});
assert.equal(artifactTwoApplied.applied,true);
assert.equal(artifactTwoApplied.state.originalBuild.artifact.hash,originalArtifactHash,'Artifact 2.0 ranking must preserve the captured Original Artifact');
assert.equal(artifactTwoApplied.state.workingBuild.artifact.hash,2001,'best Artifact 2.0 option must be staged into Working Build');
assert.equal(artifactTwoApplied.state.workingBuild.artifactRecommendation.selectionModel,'artifact-2-socket-buckets');
assert.equal(artifactTwoApplied.state.workingBuild.artifactRecommendation.artifactCandidateCount,2);
assert.deepEqual(artifactTwoApplied.state.workingBuild.artifactConfiguration.selectedPerkHashes,[2101,2102]);
assert.equal(artifactTwoApplied.state.workingBuild.artifactConfiguration.provenance.selectionModel,'artifact-2-socket-buckets');
assert.equal('confirmed' in artifactTwoApplied.state.workingBuild.artifactConfiguration,false);
assert.equal('liveApplied' in artifactTwoApplied.state.workingBuild.artifactConfiguration,false);
const sevenPerkRecommendation={selectionSequence:Array.from({length:7},(_,index)=>({artifactPerk:{hash:2301+index,name:`Verified pick ${index+1}`,description:`Verified Artifact effect ${index+1}`,icon:`/perk-${index+1}.png`}}))};
const completeSevenPerkCatalogue=artifactPerkCatalogue({perks:sevenPerkRecommendation.selectionSequence.slice(0,5).map(row=>row.artifactPerk)},sevenPerkRecommendation);
assert.equal(completeSevenPerkCatalogue.length,7,'The compact Artifact rail must resolve every verified selected pick from recommendation evidence when a persisted Artifact object is incomplete.');
assert.equal(completeSevenPerkCatalogue[6].icon,'/perk-7.png','Recovered Artifact picks must retain their verified Bungie icon path.');

console.log('FORGE_ARTIFACT_WORKING_ONLY=PASS');
console.log('FORGE_ARTIFACT_ORIGINAL_PROTECTED=PASS');
console.log('FORGE_ARTIFACT_CONFIRMATION_BOUNDARY=PASS');
console.log('FORGE_ARTIFACT_2_BEST_FIT=PASS');
console.log('FORGE_ARTIFACT_FULL_TARGET_PLAN=PASS livePoints=0');
