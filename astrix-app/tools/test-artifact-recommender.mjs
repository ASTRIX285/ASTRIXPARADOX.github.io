import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recommendArtifactLoadout,recommendArtifactPerks,resolveBuildWeapons} from '../pages/guardian-workspace-v2/guardian-artifact-recommender.mjs';
import {resolveArtifactByProvenance} from '../pages/guardian-workspace-v2/guardian-artifact-provenance.mjs';
import {resolveArtifactTwoCatalog} from '../pages/guardian-workspace-v2/guardian-artifact-catalog.mjs';
import {subclassPlugComponent} from '../pages/guardian-workspace-v2/guardian-subclass-plug-classifier.mjs';

const d='astrix-app/data/paradox-forge/beta/';
const betaArtifact=JSON.parse(await fs.readFile(d+'beta-current-artifact.json','utf8'));
const fixtures=JSON.parse(await fs.readFile(d+'ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json','utf8'));
const hashes=[4019651319,2965080304,17096506];
const definitions={
  '4019651319':{itemType:3,displayProperties:{name:'Test Hand Cannon'}},
  '2965080304':{itemType:3,displayProperties:{name:'Test Sniper Rifle'}},
  '17096506':{itemType:3,displayProperties:{name:'Test Machine Gun'}}
};
const curatedTags={inventoryItems:{
  '4019651319':{weaponType:'Hand Cannon',element:'Solar'},
  '2965080304':{weaponType:'Sniper Rifle',element:'Arc'},
  '17096506':{weaponType:'Machine Gun',element:'Void'}
}};
const resolved=resolveBuildWeapons(hashes,definitions,curatedTags);
assert.deepEqual(resolved.unresolved,[]);
const betaBuild={subclass:{name:'Gunslinger',element:'Solar'},weapons:resolved.weapons};
const betaResult=recommendArtifactPerks(betaBuild,betaArtifact,{currentSeasonNumber:28});
assert.equal(betaResult.status,'current');
assert.ok(betaResult.recommendations.length>0);
assert.deepEqual(betaResult,recommendArtifactPerks(betaBuild,betaArtifact,{currentSeasonNumber:28}),'ranking must be deterministic');
const fixture=fixtures.fixtures.find(row=>row.fixtureId==='PF-BETA-01');
assert.ok(fixture&&fixture.artifactSeason===null,'fixture contract changed');

const liveDefinitions={
  '101':{displayProperties:{name:'Piercing Sidearm',description:'Your equipped Sidearms stun Barrier Champions.',icon:'/artifact/101.png'}},
  '102':{displayProperties:{name:'Solar Grenade Engine',description:'Solar grenade final blows improve grenade recharge.',icon:'/artifact/102.png'}},
  '103':{displayProperties:{name:'Precision Reserve',description:'Precision weapon final blows improve ammo reserves.',icon:'/artifact/103.png'}},
  '104':{displayProperties:{name:'Hidden Solar Surge',description:'Solar weapons deal increased damage.',icon:'/artifact/104.png'}},
  '105':{displayProperties:{name:'Charged Ordnance',description:'Armour Charge improves grenade damage.',icon:'/artifact/105.png'}},
  '106':{displayProperties:{name:'Void Recovery',description:'Void effects grant overshield.',icon:'/artifact/106.png'}}
};
const livePayload={
  currentSeasonNumber:31,
  profile:{
    profileProgression:{data:{seasonalArtifact:{artifactHash:999}}},
    characterProgressions:{data:{'cid-live':{seasonalArtifact:{artifactHash:999,pointsUsed:3,tiers:[
      {tierHash:700,isUnlocked:true,pointsToUnlock:0,items:[{itemHash:101,isActive:true,isVisible:true},{itemHash:106,isActive:false,isVisible:true}]},
      {tierHash:701,isUnlocked:true,pointsToUnlock:1,items:[{itemHash:102,isActive:true,isVisible:true},{itemHash:103,isActive:false,isVisible:true}]},
      {tierHash:702,isUnlocked:true,pointsToUnlock:2,items:[{itemHash:104,isActive:false,isVisible:false},{itemHash:105,isActive:true,isVisible:true}]}
    ]}}}}
  },
  definitions:liveDefinitions,
  artifactDefinition:{hash:999,seasonNumber:31,displayProperties:{name:'Verified Current Artifact'},tiers:[
    {tierHash:700,displayTitle:'Champion',minimumUnlockPointsUsedRequirement:0,items:[{itemHash:101},{itemHash:106}]},
    {tierHash:701,displayTitle:'Operations',minimumUnlockPointsUsedRequirement:1,items:[{itemHash:102},{itemHash:103}]},
    {tierHash:702,displayTitle:'Power',minimumUnlockPointsUsedRequirement:2,items:[{itemHash:104},{itemHash:105}]}
  ]}
};
const live=resolveArtifactByProvenance(livePayload,'cid-live');
assert.equal(live.state,'resolved');
assert.equal(live.pointsUsed,3);
assert.equal(live.perks[4].isVisible,false);
assert.equal(live.perks[5].minimumUnlockPointsUsedRequirement,2);

const forgeBuild={
  characterId:'cid-live',
  subclass:'Solar',
  subclassBuild:{
    super:{hash:501,name:'Solar Super',description:'Solar Super final blows ignite targets.'},
    abilities:[{hash:502,name:'Fusion Grenade',description:'A Solar grenade that scorches targets.'}],
    aspects:[],
    fragments:[]
  },
  weapons:[{hash:601,name:'Verified Sidearm',weaponType:'Sidearm',element:'Solar'}],
  forgeLoaderDecision:{
    buildAnchor:{perk:{hash:801,name:'Exotic Grenade Loop',description:'Solar grenade final blows grant Armour Charge.'}},
    statDirective:{targets:{health:0,melee:0,grenade:200,super:0,class:0,weapon:100},priorities:{health:null,melee:null,grenade:1,super:null,class:null,weapon:2}},
    setProtocol:[{count:4,trait:{hash:901,name:'Charged Arsenal',description:'Armour Charge improves grenade and weapon damage.'}}]
  }
};
const liveResult=recommendArtifactPerks(forgeBuild,live,{currentSeasonNumber:31});
assert.equal(liveResult.status,'current');
assert.equal(liveResult.selectionStatus,'ready');
assert.equal(liveResult.selectionLimit,3,'Bungie pointsUsed must determine the complete legal selection size');
assert.equal(liveResult.selectedPerkHashes.length,3);
assert.ok(liveResult.selectedPerkHashes.includes(101),'equipped Sidearm champion coverage must rank');
assert.ok(liveResult.selectedPerkHashes.includes(102),'selected Solar grenade loop must rank');
assert.ok(liveResult.selectedPerkHashes.includes(105),'selected Armour Charge set trait must rank');
assert.ok(!liveResult.selectedPerkHashes.includes(104),'an invisible Artifact perk must never be recommended');
assert.equal(liveResult.selectedMatchedCount,3);
assert.ok(liveResult.recommendations.every(row=>row.reasons.length>0),'every ranked perk needs an explicit verified reason');
assert.deepEqual(liveResult,recommendArtifactPerks(forgeBuild,live,{currentSeasonNumber:31}),'live Forge Loader ranking must be deterministic');

const zeroPointArtifact={
  ...live,
  pointsUsed:0,
  perks:live.perks.map(perk=>({...perk,isActive:false})),
  activePerks:[],
  artifactConfiguration:{...live.artifactConfiguration,selectedPerkHashes:[]}
};
const fullTargetResult=recommendArtifactPerks(forgeBuild,zeroPointArtifact,{currentSeasonNumber:31,planFullBuild:true});
assert.equal(fullTargetResult.status,'current');
assert.equal(fullTargetResult.selectionStatus,'ready','zero currently available points must not suppress the complete Artifact target plan');
assert.equal(fullTargetResult.planMode,'full-build-target');
assert.equal(fullTargetResult.liveSelectionLimit,0,'the recommendation must preserve the distinction between live availability and the target build');
assert.equal(fullTargetResult.selectionLimit,zeroPointArtifact.perks.length);
assert.equal(fullTargetResult.selectedPerkHashes.length,zeroPointArtifact.perks.length);
assert.ok(fullTargetResult.selectedPerkHashes.includes(102),'the full plan must retain the verified grenade-loop recommendation');
assert.ok(fullTargetResult.selectedPerkHashes.includes(105),'the full plan must retain the verified Armour Charge recommendation');

const stale=recommendArtifactPerks(forgeBuild,live,{currentSeasonNumber:32});
assert.equal(stale.status,'stale-artifact');
assert.equal(stale.selectionStatus,'blocked');
assert.deepEqual(stale.selectedPerkHashes,[]);
const unverifiedSeason=recommendArtifactPerks(forgeBuild,live,{});
assert.equal(unverifiedSeason.status,'current-season-unresolved');
assert.equal(unverifiedSeason.selectionStatus,'blocked');

const artifactTwoInventory={
  '2001':{hash:2001,itemTypeDisplayName:'Artifact',displayProperties:{name:'Solar Logic',description:'Works best with Solar grenades.',icon:'/artifact/solar.png'},sockets:{socketEntries:[{reusablePlugSetHash:3001},{reusablePlugSetHash:3002},{reusablePlugSetHash:3999}]}},
  '2002':{hash:2002,itemTypeDisplayName:'Artifact',displayProperties:{name:'Void Logic',description:'Works best with Void effects.',icon:'/artifact/void.png'},sockets:{socketEntries:[{reusablePlugSetHash:3003},{reusablePlugSetHash:3004},{reusablePlugSetHash:3999}]}},
  '2101':{hash:2101,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:'Solar Ordnance',description:'Solar grenade final blows improve grenade recharge.',icon:'/perk/solar-grenade.png'}},
  '2102':{hash:2102,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:'Charged Arsenal',description:'Armour Charge improves weapon damage.',icon:'/perk/charge.png'}},
  '2201':{hash:2201,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:'Void Guard',description:'Void effects grant an overshield.',icon:'/perk/void.png'}},
  '2202':{hash:2202,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:'Quiet Reserve',description:'Gain handling while crouched.',icon:'/perk/quiet.png'}},
  '2203':{hash:2203,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:'Sandbox Resolved Loop',description:'',icon:'/perk/resolved.png'},perks:[{perkHash:4203}]},
  '2999':{hash:2999,itemTypeDisplayName:'Intrinsic',displayProperties:{name:'Artifact Frame',description:'Artifact frame.'}}
};
const artifactTwoPlugSets={
  '3001':{reusablePlugItems:[{plugItemHash:2101}]},
  '3002':{reusablePlugItems:[{plugItemHash:2102}]},
  '3003':{reusablePlugItems:[{plugItemHash:2201}]},
  '3004':{reusablePlugItems:[{plugItemHash:2202},{plugItemHash:2203}]},
  '3999':{reusablePlugItems:[{plugItemHash:2999}]}
};
const artifactTwoCatalog=resolveArtifactTwoCatalog({inventoryDefinitions:artifactTwoInventory,plugSetDefinitions:artifactTwoPlugSets,sandboxPerkDefinitions:{'4203':{displayProperties:{name:'Sandbox Resolved Loop',description:'Grenade final blows create an Orb of Power and grant Super energy.'}}},manifestVersion:'artifact-2-test'});
assert.equal(artifactTwoCatalog.length,2);
assert.equal(artifactTwoCatalog[0].selectionLimit,2,'Artifact capacity must come from selectable socket buckets, not a fixed perk count');
assert.equal(artifactTwoCatalog[0].selectionSlots.length,2,'non-perk sockets must not become Artifact buckets');
const sandboxResolved=artifactTwoCatalog.flatMap(row=>row.perks).find(perk=>perk.hash===2203);assert.equal(sandboxResolved?.displayResolved,true,'Artifact 2.0 perks must inherit effect text from DestinySandboxPerkDefinition when the inventory item description is blank.');assert.match(sandboxResolved?.description||'',/Orb of Power/);
const artifactTwoResult=recommendArtifactLoadout(forgeBuild,artifactTwoCatalog,{currentSeasonNumber:99});
assert.equal(artifactTwoResult.status,'current','Artifact 2.0 catalogue choices are permanent manifest options, not a stale seasonal point tree');
assert.equal(artifactTwoResult.selectionModel,'artifact-2-socket-buckets');
assert.equal(artifactTwoResult.selectionLimit,2);
assert.equal(artifactTwoResult.artifactHash,2001,'the best Artifact must be selected from all verified Artifact 2.0 options');
assert.deepEqual(artifactTwoResult.selectedPerkHashes,[2101,2102]);
assert.equal(artifactTwoResult.artifactCandidateCount,2);

// Repeated catalogue entries must not fill two picks in the same bucket.
const duplicateCatalogue={...artifactTwoCatalog[0],
  perks:[artifactTwoCatalog[0].perks[0],artifactTwoCatalog[0].perks[0],artifactTwoCatalog[0].perks[1]],
  selectionSlots:[{tierIndex:0,bucket:0,capacity:2,perkHashes:[2101,2102]}]
};
const duplicateResult=recommendArtifactPerks(forgeBuild,duplicateCatalogue,{currentSeasonNumber:99});
assert.equal(duplicateResult.selectionStatus,'ready');
assert.deepEqual([...duplicateResult.selectedPerkHashes].sort(),[2101,2102],'Duplicate entries must yield a different legal perk, not a repeated pick.');
assert.deepEqual(duplicateResult.selectionSequence.map(row=>row.order),[1,2]);
assert.equal(duplicateResult.totalScore,duplicateResult.selectionSequence.reduce((sum,row)=>sum+row.score,0));
const shortCatalogue={...duplicateCatalogue,perks:duplicateCatalogue.perks.slice(0,2)};
const shortResult=recommendArtifactPerks(forgeBuild,shortCatalogue,{currentSeasonNumber:99});
assert.equal(shortResult.selectionStatus,'partial','Duplicate evidence cannot make an underfilled bucket ready.');
assert.deepEqual(shortResult.selectedPerkHashes,[2101]);
assert.ok(shortResult.blockers.length>0);
console.log('ARTIFACT_DUPLICATE_BUCKET_PICKS=PASS');

const aspectMentioningFragments={definition:{plug:{plugCategoryIdentifier:'v500.plugs.aspects'},displayProperties:{name:'Aspect Test',description:'Adds two Fragment slots.'}},name:'Aspect Test'};
const fragmentMentioningAspects={definition:{plug:{plugCategoryIdentifier:'v500.plugs.fragments'},displayProperties:{name:'Fragment Test',description:'Improves equipped Aspects.'}},name:'Fragment Test'};
assert.equal(subclassPlugComponent(aspectMentioningFragments),'aspect','Aspect category must win over descriptive Fragment text');
assert.equal(subclassPlugComponent(fragmentMentioningAspects),'fragment','Fragment category must win over descriptive Aspect text');

console.log('ARTIFACT_RECOMMENDER=PASS');
console.log('ARTIFACT_LEGAL_SELECTION=PASS');
console.log('ARTIFACT_FORGE_LOADER_FIT=PASS');
console.log('ARTIFACT_SEASON_GUARD=PASS');
console.log('ARTIFACT_2_SOCKET_BUCKETS=PASS');
console.log('ARTIFACT_FULL_TARGET_PLAN=PASS livePoints=0');
console.log('SUBCLASS_ASPECT_FRAGMENT_LABELS=PASS');
