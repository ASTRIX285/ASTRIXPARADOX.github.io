// Miguel, 28 Sep 2026: Builder picked the same weapons whatever the
// objective or activity, and replaced imported weapons with the same top
// scorers. These cases pin the corrected weighting.
import assert from 'node:assert/strict';
import {selectOwnedWeapons} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {normaliseWeaponPerkModel} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';

const KINETIC=1498876634,ENERGY=2465295065,POWER=953998645;
function weapon(hash,instance,name,perkText,bucketHash,{ammoType=1,element=''}={}){
  const capacities=[2,2,3,3,2];
  const alternativePerkColumns=capacities.map((count,columnIndex)=>({socketIndex:10+columnIndex,options:Array.from({length:count},(_,rowIndex)=>{const perkHash=hash*100+(columnIndex+1)*10+rowIndex+1,perkName=`${name} perk ${columnIndex+1}.${rowIndex+1}`;return {hash:perkHash,bungieHash:perkHash,name:perkName,socketIndex:10+columnIndex,definition:{displayProperties:{name:perkName,description:columnIndex===2&&rowIndex===0?perkText:'Verified synthetic test perk.'},plug:{plugCategoryIdentifier:'weapon.perks'}}};})}));
  const selectedPerks=alternativePerkColumns.map(column=>({...column.options[0],description:column.options[0].definition.displayProperties.description}));
  const perkModel=normaliseWeaponPerkModel({gearTier:5,selectedPerks,alternativePerkColumns});
  return {hash,bungieHash:hash,itemInstanceId:instance,name,bucketHash,ammoType,element,gearTier:5,definition:{displayProperties:{name,description:''},traitIds:[],inventory:{tierType:5,tierTypeName:'Legendary'},equippingBlock:{ammoType}},weaponSemantics:{gearTier:5,intrinsic:{hash:hash*1000,name:'Synthetic intrinsic',description:'A steady frame.'},selectedPerks,alternativePerkColumns,perkModel}};
}
const plain=weapon(701,'k-plain','Plain Rifle','A steady frame.',KINETIC);
const dpsKinetic=weapon(702,'k-dps','Precision Rifle','Precision damage increases after a reload.',KINETIC);
const clearKinetic=weapon(703,'k-clear','Chain Rifle','Final blows cause a chain explosion in an area.',KINETIC);
const energy=weapon(704,'e-plain','Energy Sidearm','A steady frame.',ENERGY,{ammoType:2});
const power=weapon(705,'p-plain','Heavy Launcher','A steady frame.',POWER,{ammoType:3});
const pool=[plain,dpsKinetic,clearKinetic,energy,power];
const base={source:'bungie-loadout',characterId:'hunter-1',characterClass:'hunter',subclass:'solar',armour:[],subclassBuild:{},weapons:[plain,energy,power],ownedWeapons:pool};
const pick=(objective,activity,weapons=[plain,energy,power])=>selectOwnedWeapons({build:{...base,weapons,activityContext:activity?{key:activity}:undefined},objective}).recommendation.decisions[0].recommended.itemInstanceId;

// 1. The objective changes the pick.
assert.equal(pick('dps','raid'),'k-dps','DPS in a Raid picks the precision damage weapon.');
assert.equal(pick('add-clear','pve'),'k-clear','Add clear picks the chain area weapon.');
assert.notEqual(pick('dps','raid'),pick('add-clear','pve'),'Different goals give different weapons.');

// 2. A weapon already in the build is kept unless a swap is clearly better.
assert.equal(pick('survivability','pve',[clearKinetic,energy,power]),'k-clear','With no clearly better option the current weapon stays.');
const kept=selectOwnedWeapons({build:{...base,weapons:[clearKinetic,energy,power],activityContext:{key:'pve'}},objective:'survivability'}).recommendation;
assert.ok(kept.combinations[0].reasons.some(reason=>reason.kind==='kept'),'The reason for keeping current weapons is shown.');
assert.equal(kept.decisions[0].action,'KEEP');

console.log('FORGE_WEAPON_VARIETY=PASS objective and activity change the pick, current weapons kept unless clearly beaten');
