// Miguel, 28 Sep 2026: "looks like you randomly picking a weapon". Exotic
// weapons that work with the build were passed over for Legendaries with more
// perk text, and weapon element was ignored. These cases pin the fix.
import assert from 'node:assert/strict';
import {selectOwnedWeapons} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {normaliseWeaponPerkModel} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';

const KINETIC=1498876634,ENERGY=2465295065,POWER=953998645;
const perk=(hash,socketIndex,description)=>({hash,bungieHash:hash,name:`Perk ${hash}`,socketIndex,description,definition:{displayProperties:{name:`Perk ${hash}`,description},plug:{plugCategoryIdentifier:'weapon.perks'}}});
function legendary(hash,name,bucketHash,{element='',ammoType=1,text='Improves blast radius.'}={}){
  const selectedPerks=[1,2,3,4,5].map(column=>perk(hash*10+column,10+column,column===3?text:'Improves handling and reload speed after final blows.'));
  const perkModel=normaliseWeaponPerkModel({gearTier:5,selectedPerks,alternativePerkColumns:selectedPerks.map(row=>({socketIndex:row.socketIndex,options:[row,perk(row.hash+5000,row.socketIndex,'Verified synthetic test perk.')]}))});
  return {hash,bungieHash:hash,itemInstanceId:`i-${hash}`,name,bucketHash,ammoType,element,gearTier:5,definition:{displayProperties:{name},inventory:{tierType:5,tierTypeName:'Legendary'},equippingBlock:{ammoType}},weaponSemantics:{gearTier:5,intrinsic:{hash:hash*100,name:'Frame',description:'A steady frame.'},selectedPerks,perkModel}};
}
function exotic(hash,name,bucketHash,traitText,{element='',ammoType=1}={}){
  const selectedPerks=[1,2,3].map(column=>perk(hash*10+column,10+column,'Improves stability.'));
  const perkModel=normaliseWeaponPerkModel({gearTier:null,selectedPerks,alternativePerkColumns:selectedPerks.map(row=>({socketIndex:row.socketIndex,options:[row]}))});
  const trait={hash:hash*100+1,name:`${name} trait`,description:traitText};
  return {hash,bungieHash:hash,itemInstanceId:`x-${hash}`,name,bucketHash,ammoType,element,isExotic:true,definition:{displayProperties:{name},inventory:{tierType:6,tierTypeName:'Exotic'},equippingBlock:{ammoType,uniqueLabelHash:1}},weaponSemantics:{gearTier:null,intrinsic:{hash:hash*100,name:'Exotic frame',description:traitText},exoticTraits:[trait],selectedPerks,perkModel}};
}
const solarBuild=weapons=>({
  source:'bungie-loadout',characterId:'warlock-1',characterClass:'warlock',subclass:'solar',armour:[],
  subclassBuild:{super:{name:'Well of Radiance',element:'solar'},aspects:[{hash:1,name:'Touch of Flame',description:'Your grenades scorch targets and cause ignitions.'}],fragments:[{hash:2,name:'Ember of Torches',description:'Grants radiant after a powered melee.'}]},
  forgeLoaderDecision:{buildAnchor:{name:'Sunbracers',perk:{hash:3,name:'Helium Spirals',description:'Solar grenade final blows scorch nearby targets.'}}},
  weapons,ownedWeapons:weapons,activityContext:{key:'pve'}
});
const kinetic=legendary(801,'Busy Kinetic',KINETIC,{text:'Final blows increase reload, handling and stability. Precision hits improve range.'});
const energyPlain=legendary(802,'Arc Sidearm',ENERGY,{element:'arc',ammoType:1,text:'Final blows increase handling and reload.'});
const energySolar=legendary(803,'Solar Sidearm',ENERGY,{element:'solar',ammoType:1,text:'Final blows scorch targets, cause ignitions and grant radiant.'});
const power=legendary(804,'Heavy Launcher',POWER,{element:'void',ammoType:3});
const synergyExotic=exotic(805,'Sun Exotic',ENERGY,'Final blows scorch nearby targets and cause ignitions. Solar.',{element:'solar'});
const unrelatedExotic=exotic(806,'Stasis Exotic',KINETIC,'Precision hits slow and freeze targets.',{element:'stasis'});

// 1. An owned Exotic weapon whose trait matches the build wins the Exotic slot.
const pool=[kinetic,energyPlain,energySolar,power,synergyExotic,unrelatedExotic];
const withExotic=selectOwnedWeapons({build:solarBuild(pool),baselineWeapons:[],objective:'add-clear'}).recommendation;
const picked=withExotic.decisions.map(row=>row.recommended?.name);
assert.ok(picked.includes('Sun Exotic'),`The build-linked Exotic weapon is chosen (got ${picked.join(', ')}).`);
assert.ok(!picked.includes('Stasis Exotic'),'An Exotic with no build link is not forced in.');
assert.ok(withExotic.combinations[0].reasons.some(reason=>reason.kind==='exotic-weapon-slot'||reason.kind==='exotic-weapon-synergy'),'The reason names the Exotic link.');

// 2. With no linked Exotic, the weapon matching the subclass element is preferred.
const noExotic=[kinetic,energyPlain,energySolar,power,unrelatedExotic];
const element=selectOwnedWeapons({build:solarBuild(noExotic),baselineWeapons:[],objective:'balanced'}).recommendation;
assert.equal(element.decisions[1].recommended.name,'Solar Sidearm','A SOLAR weapon beats an equal ARC one on a Solar subclass.');
assert.ok(!element.decisions.some(row=>row.recommended?.name==='Stasis Exotic'),'An unrelated Exotic still does not take a slot.');
console.log('FORGE_EXOTIC_WEAPON_SYNERGY=PASS build-linked Exotic weapons and matching elements are preferred');
