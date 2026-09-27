import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {ForgePreparationClient,preparationVariants,forgePreparationKey} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-preparation.mjs';
import {prepareForgeSequence} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-sequence.mjs';
import {createDirectGenerationBuild,validateTierFiveArmour} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-build-recommendation.mjs';
import {voidLoopSource,nothingManaclesCandidate,comboSource} from '../validate-paradox-build-space.mjs';

const artifact={hash:999,artifactHash:999,name:'Test Artifact',seasonNumber:31,pointsUsed:2,state:'resolved',provenance:'bungie-character-progressions-202',perks:[
  {hash:9101,name:'Void Recovery',description:'Void effects grant overshield.',tierIndex:0,itemIndex:0,column:1,order:1,minimumUnlockPointsUsedRequirement:0},
  {hash:9102,name:'Grenade Engine',description:'Grenade final blows grant grenade energy.',tierIndex:0,itemIndex:1,column:1,order:2,minimumUnlockPointsUsedRequirement:0}
].map(p=>({...p,displayResolved:true,unresolved:false,isActive:true,isVisible:true,tierUnlocked:true})),activePerks:[]};
artifact.activePerks=artifact.perks;
const characterId='81001',weaponBuckets=[1498876634,2465295065,953998645],armourBuckets=[3448274439,3551918588,14239492,20886954,1585787867],weaponIds=new Map(),currentWeaponIds=new Set((voidLoopSource.weapons||[]).map(row=>String(row.itemInstanceId||'')));
const exactWeapon=(row,index)=>{const prior=String(row.itemInstanceId||row.hash||index);if(!weaponIds.has(prior))weaponIds.set(prior,String(82001+weaponIds.size));return {...row,itemHash:Number(row.itemHash??row.hash),itemInstanceId:weaponIds.get(prior),bucketHash:Number(row.bucketHash??weaponBuckets[index%3]),source:{kind:currentWeaponIds.has(prior)?'equipped':'vault',characterId:currentWeaponIds.has(prior)?characterId:null}};};
const exactArmour=(voidLoopSource.armour||[]).map((row,index)=>({...row,itemHash:Number(row.itemHash??row.hash),itemInstanceId:String(83001+index),bucketHash:armourBuckets[index],classType:1,source:{kind:'equipped',characterId}}));
const exoticAnchorId=exactArmour.find(row=>row.isExotic)?.itemInstanceId||exactArmour[1].itemInstanceId;
const build={...voidLoopSource,characterId,membershipId:'84001',membershipType:'3',characterClass:'hunter',weapons:(voidLoopSource.weapons||[]).map(exactWeapon),ownedWeapons:(voidLoopSource.ownedWeapons||[]).map(exactWeapon),armour:exactArmour,forgeLoaderDecision:{...voidLoopSource.forgeLoaderDecision,buildAnchor:{...voidLoopSource.forgeLoaderDecision.buildAnchor,selectedItemInstanceId:exoticAnchorId}},artifact,currentSeasonNumber:31,artifactConfiguration:{artifactHash:999,seasonNumber:31,selectedPerkHashes:[9101,9102],source:'bungie-live'},activityContext:{schemaVersion:1,key:'dps',name:'DPS',domain:'pve',source:'user-selected-build-context'}};

const variant={element:"void",objective:"dps",superHash:102},candidates=[{element:"void",candidate:nothingManaclesCandidate}];
export {build,candidates,variant,nothingManaclesCandidate,comboSource};
