// Exotic weapon anchor: element inference, catalyst-gated synergy, and the lock through generation.
import assert from 'node:assert/strict';
import {forgeWeaponElementSuggestion} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs';
import {selectOwnedWeapons} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {forgeWeaponAnchorContext,verifiedTraitContext} from '../pages/forge-loader/forge-loader-scan.mjs';
import {normaliseWeaponPerkModel} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';

// Real Bungie identity (astrix-app/data/weapon-information.json): One Thousand Voices, hash 2069224589,
// element Solar, defaultDamageTypeHash 1847026933. No claim here is invented.
const ONE_THOUSAND_VOICES_HASH=2069224589;
const SOLAR_DAMAGE_TYPE_HASH=1847026933;

// --- Step 3: element inference, in priority order (damage type, then perk text, then armour set) ---

const solarWeaponGroup={
  key:'weapon:0:onethousandvoices',name:'One Thousand Voices',hashes:[ONE_THOUSAND_VOICES_HASH],bucketHash:1498876634,
  catalyst:{present:false,unlocked:false,active:false},
  representative:{
    itemHash:ONE_THOUSAND_VOICES_HASH,itemInstanceId:'1tv-instance-1',name:'One Thousand Voices',
    damageTypeHash:SOLAR_DAMAGE_TYPE_HASH,elementDefinition:{displayProperties:{name:'Solar'}},
    weaponSemantics:{intrinsic:null,exoticTraits:[],selectedPerks:[]}
  }
};
const weaponAnchor=forgeWeaponAnchorContext(solarWeaponGroup);
assert.equal(weaponAnchor.element,'Solar','The weapon anchor element must come from Bungie\'s own damage type, never inferred.');

const solarSetTrait=verifiedTraitContext({hash:99001,name:'Solstice Warmth',description:'While a grenade, melee or class ability is on cooldown, gain Solar ability energy.'});
const buildWithSolarWeapon={forgeLoaderDecision:{weaponAnchor,setProtocol:[{setHash:8001,count:4,setName:'Solstice of Heroes',trait:solarSetTrait}]}};
const suggestion=forgeWeaponElementSuggestion(buildWithSolarWeapon);
assert.equal(suggestion?.element,'solar','One Thousand Voices with a Solar-leaning armour set must suggest Solar.');
assert.equal(suggestion.reason,'Solar suggested: One Thousand Voices deals Solar damage.','The reason text must name the weapon and cite its real damage type, matching the example in the mission.');
assert.equal(suggestion.source,'weapon-damage-type','The weapon\'s own damage type must outrank perk text and the armour set as evidence.');

// No anchor: no claim.
assert.equal(forgeWeaponElementSuggestion({}),null,'No weapon anchor must never produce an invented element suggestion.');

// Kinetic weapon, no element-naming perk or set: no claim rather than a guess.
const kineticGroup={...solarWeaponGroup,representative:{...solarWeaponGroup.representative,damageTypeHash:3373582085,elementDefinition:{displayProperties:{name:'Kinetic'}}}};
const kineticAnchor=forgeWeaponAnchorContext(kineticGroup);
assert.equal(forgeWeaponElementSuggestion({forgeLoaderDecision:{weaponAnchor:kineticAnchor}}),null,'A Kinetic weapon with no element-naming perk or set text must not suggest an element.');

// Perk-text fallback: Kinetic weapon whose perk explicitly names an element.
const arcPerkGroup={...kineticGroup,representative:{...kineticGroup.representative,weaponSemantics:{intrinsic:null,exoticTraits:[],selectedPerks:[{hash:1,name:'Arc Conductor',description:'Rapidly landing hits charges this weapon to unleash a burst of Arc damage.'}]}}};
const arcPerkAnchor=forgeWeaponAnchorContext(arcPerkGroup);
const perkSuggestion=forgeWeaponElementSuggestion({forgeLoaderDecision:{weaponAnchor:arcPerkAnchor}});
assert.equal(perkSuggestion?.element,'arc','A Kinetic weapon must fall back to explicit Arc wording in its own perk text.');
assert.equal(perkSuggestion.source,'weapon-perk-text');

// --- Catalyst gating: a locked (not active) catalyst's effect text must never reach any suggestion or synergy source ---

const lockedCatalystGroup={
  ...kineticGroup,
  catalyst:{present:true,unlocked:false,active:false},
  representative:{...kineticGroup.representative,weaponSemantics:{intrinsic:null,exoticTraits:[],selectedPerks:[],catalyst:{name:'Catalyst',description:'Adds Void tracking to this weapon\'s projectiles.'}}}
};
const lockedAnchor=forgeWeaponAnchorContext(lockedCatalystGroup);
assert.equal(lockedAnchor.catalyst.active,false,'A not-yet-unlocked catalyst must never be reported as active.');
assert.equal(lockedAnchor.perks.some(perk=>perk.description.includes('Void tracking')),false,'A locked catalyst\'s effect text must be excluded from the weapon anchor entirely.');
assert.equal(forgeWeaponElementSuggestion({forgeLoaderDecision:{weaponAnchor:lockedAnchor}}),null,'A locked catalyst\'s Void wording must never produce an element suggestion.');

const activeCatalystGroup={...lockedCatalystGroup,catalyst:{present:true,unlocked:true,active:true}};
const activeAnchor=forgeWeaponAnchorContext(activeCatalystGroup);
assert.equal(activeAnchor.catalyst.active,true);
assert.ok(activeAnchor.perks.some(perk=>perk.description.includes('Void tracking')),'An active catalyst\'s effect text must be included once it is genuinely unlocked and complete.');
const activeSuggestion=forgeWeaponElementSuggestion({forgeLoaderDecision:{weaponAnchor:activeAnchor}});
assert.equal(activeSuggestion?.element,'void','Once the catalyst is active, its own explicit Void wording may suggest an element.');

console.log('FORGE_WEAPON_ELEMENT_SUGGESTION=PASS');
console.log('FORGE_WEAPON_CATALYST_GATING=PASS');

// --- Step 4: the anchored weapon stays in its slot through generation ---

const genericModel=(hash,name)=>normaliseWeaponPerkModel({gearTier:2,selectedPerks:[{hash,bungieHash:hash,name,description:`${name} active perk.`,socketIndex:1,socketCategoryHash:4241085061,definition:{}}],alternativePerkColumns:[{socketIndex:1,options:[{hash,bungieHash:hash,name,description:`${name} active perk.`}]}]});
const weapon=(bucketHash,instanceId,hash,name,{exotic=false}={})=>({
  itemHash:hash,itemInstanceId:instanceId,name,bucketHash,isExotic:exotic,definition:{hash,displayProperties:{name}},ammoType:1,
  weaponSemantics:{gearTier:2,perkModel:genericModel(hash,name),intrinsic:null,exoticTraits:[],selectedPerks:[]}
});

const anchorInstanceId='anchor-kinetic-1';
const anchoredWeapon=weapon(1498876634,anchorInstanceId,7001,'Anchored Exotic',{exotic:true});
const strongerAlternative=weapon(1498876634,'stronger-kinetic-1',7002,'Higher Scoring Legendary');
const energyWeapon=weapon(2465295065,'energy-1',7003,'Energy Filler');
const powerWeapon=weapon(953998645,'power-1',7004,'Power Filler');

const lockedBuild={
  weapons:[anchoredWeapon,energyWeapon,powerWeapon],
  ownedWeapons:[anchoredWeapon,strongerAlternative,energyWeapon,powerWeapon],
  forgeLoaderDecision:{weaponAnchor:{selectedItemInstanceId:anchorInstanceId}}
};
const lockedResult=selectOwnedWeapons({build:lockedBuild,objective:'balanced'});
const lockedKinetic=lockedResult.workingBuild.weapons.find(item=>item.bucketHash===1498876634);
assert.equal(lockedKinetic?.itemInstanceId,anchorInstanceId,'The anchored Exotic weapon must remain in its slot through generation, even when another candidate is available.');

// An explicit alternative combination that drops the anchor must be rejected outright.
assert.throws(
  ()=>selectOwnedWeapons({build:lockedBuild,weaponInstanceIds:['stronger-kinetic-1','energy-1','power-1']}),
  /anchored Exotic weapon must stay in its slot/,
  'Generate fresh alternatives must never be allowed to drop the anchored Exotic weapon from its slot.'
);

// No anchor: ordinary ranking is unaffected (the stronger-scoring instance and the anchor produce identical
// evidence here, so this only proves the lock path is not silently applied when there is no anchor).
const unanchoredBuild={weapons:[anchoredWeapon,energyWeapon,powerWeapon],ownedWeapons:[anchoredWeapon,strongerAlternative,energyWeapon,powerWeapon]};
const unanchoredResult=selectOwnedWeapons({build:unanchoredBuild,objective:'balanced'});
assert.ok(unanchoredResult.workingBuild.weapons.find(item=>item.bucketHash===1498876634),'Without an anchor, the kinetic slot must still resolve to a complete legal choice.');

console.log('FORGE_WEAPON_ANCHOR_LOCK=PASS');
