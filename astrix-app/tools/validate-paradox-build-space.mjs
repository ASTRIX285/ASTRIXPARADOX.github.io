#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBuildState,diffBuilds,createValidationRecord,VALIDATION_STATUS} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {BUILD_ELEMENTS,verifiedMasterworkState,validateTierFiveArmour} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-recommendation.mjs';
import {composeForgeRecommendation,filterExoticCompatibleSubclasses} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs';
import {createLiveTransferPreflight,deriveLoadoutIntent,isExoticItem,recommendArmourMods,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateWeaponModel,validateLoadoutCoherence} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {normaliseWeaponPerkModel} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
const item=(hash,name)=>({hash,bungieHash:hash,name});
const source={source:'bungie-loadout',characterId:'hunter-1',characterClass:'hunter',selectedLoadoutIndex:4,subclass:'stasis',subclassName:'Revenant',subclassBuild:{super:item(1,'Silence and Squall'),abilities:[item(2,'Dodge'),item(3,'Jump'),item(4,'Melee'),item(5,'Grenade')],aspects:[item(6,'Aspect A'),item(7,'Aspect B')],fragments:[item(8,'Fragment A'),item(9,'Fragment B')]},artifact:{hash:20,name:'Seasonal Artifact',activePerks:[item(21,'Perk A')]},weapons:[item(30,'Primary'),item(31,'Special'),item(32,'Heavy')],armour:[item(40,'Helmet'),item(41,'Arms'),item(42,'Chest'),item(43,'Legs'),item(44,'Class')]};
const state=createBuildState(source);assert.equal(Object.isFrozen(state.originalBuild),true);assert.notEqual(state.originalBuild,state.workingBuild);state.workingBuild.weapons[2]=item(99,'Paradox Heavy');const changes=diffBuilds(state.originalBuild,state.workingBuild);assert.equal(changes.length,1);assert.equal(changes[0].path,'weapons.2');const test=createValidationRecord({build:state.workingBuild,targetActivity:'Vanguard Master Operation',objective:'survivability'});assert.match(test.testId,/^PF-TEST-/);assert.equal(test.status,VALIDATION_STATUS.UNTESTED);assert.equal(Object.isFrozen(test.buildSnapshot),true);

const root=new URL('../pages/guardian-workspace-v2/',import.meta.url);
const [html,runtime,css,gearRuntime,advisorRuntime,intelligenceRuntime,liveAdapterRuntime]=await Promise.all([
  readFile(new URL('paradox-build-space/index.html',root),'utf8'),
  readFile(new URL('paradox-build-space/paradox-build-space.mjs',root),'utf8'),
  readFile(new URL('paradox-build-space/paradox-build-space.css',root),'utf8'),
  readFile(new URL('guardian-gear-layout.mjs',root),'utf8'),
  readFile(new URL('guardian-weapon-roll-advisor.mjs',root),'utf8'),
  readFile(new URL('paradox-build-space/paradox-forge-intelligence.mjs',root),'utf8'),
  readFile(new URL('guardian-paradox-live-adapter.mjs',root),'utf8')
]);
const artifactSelectionRuntime=await readFile(new URL('paradox-build-space/paradox-artifact-selection.mjs',root),'utf8');
const sequenceRuntime=await readFile(new URL('paradox-build-space/paradox-forge-sequence.mjs',root),'utf8');
const preparationRuntime=await readFile(new URL('paradox-build-space/paradox-forge-preparation.mjs',root),'utf8');
const workerRuntime=await readFile(new URL('paradox-build-space/paradox-forge-worker.mjs',root),'utf8');
const gearCss=await readFile(new URL('guardian-gear-layout.css',root),'utf8');

const t5Armour=Array.from({length:5},(_,index)=>({itemInstanceId:`armour-${index}`,armourTier:5,masterwork:{semanticRole:'masterwork'}}));
assert.deepEqual(BUILD_ELEMENTS,['arc','solar','strand','stasis','void','prismatic'],'Recommendation controls must contain the six supported Destiny elements in the approved order.');
assert.equal(validateTierFiveArmour({armour:t5Armour,forgeLoaderDecision:{ranking:{maximized:true}}}).ready,true,'Five T5 pieces from a Maximized Forge Loader result must pass.');
assert.equal(validateTierFiveArmour({armour:t5Armour.map((row,index)=>index===2?{...row,armourTier:4}:row),forgeLoaderDecision:{ranking:{maximized:true}}}).ready,false,'Any armour below T5 must block generation.');
assert.equal(validateTierFiveArmour({armour:t5Armour,forgeLoaderDecision:{ranking:{maximized:false}}}).ready,false,'A non-Maximized Forge Loader result must block generation.');
assert.equal(verifiedMasterworkState({armourTier:5}),'MASTERWORK NOT REPORTED','T5 alone must not be presented as verified masterwork evidence.');
assert.equal(verifiedMasterworkState({armourTier:5,masterwork:{semanticRole:'masterwork'}}),'MASTERWORK VERIFIED','An explicit masterwork socket must remain available to the hidden validation gate.');

const verifiedComponent=(hash,name,description,componentType,extra={})=>({hash,bungieHash:hash,name,description,componentType,source:'bungie-manifest',definition:{displayProperties:{name,description},traitIds:extra.traitIds||[]},...extra});
const quietSuper=verifiedComponent(101,'Quiet Super','Arc damage.','super');
const joltSuper=verifiedComponent(102,'Jolt Super','Jolts targets with Arc damage.','super');
const classAbility=verifiedComponent(103,'Class Ability','Activates the class ability.','classAbility');
const movement=verifiedComponent(104,'Movement','Improves movement.','movementAbility');
const quietMelee=verifiedComponent(105,'Quiet Melee','Arc melee damage.','melee');
const joltMelee=verifiedComponent(106,'Jolt Melee','Arc melee jolts targets.','melee');
const quietGrenade=verifiedComponent(107,'Quiet Grenade','Arc grenade damage.','grenade');
const joltGrenade=verifiedComponent(108,'Jolt Grenade','Arc grenade jolts targets.','grenade');
const joltAspect=verifiedComponent(109,'Jolt Aspect','Defeating jolted targets grants grenade energy.','aspect',{fragmentSlots:1});
const utilityAspect=verifiedComponent(110,'Utility Aspect','Class ability energy.','aspect',{fragmentSlots:1});
const unresolvedAspect={hash:111,bungieHash:111,name:'Unresolved Aspect',unresolved:true,componentType:'aspect'};
const joltFragment=verifiedComponent(112,'Jolt Fragment','Grenades jolt targets.','fragment');
const blindFragment=verifiedComponent(113,'Blind Fragment','Arc damage can blind targets.','fragment');
const intelligenceCandidate={hash:200,bungieHash:200,name:'Arcstrider',element:'arc',source:'bungie-manifest',definition:{displayProperties:{name:'Arcstrider'}},subclassBuild:{
  socketsAvailable:true,socketCoverage:{complete:true},
  super:quietSuper,superOptions:[quietSuper,joltSuper],classAbility,movement,melee:quietMelee,grenade:quietGrenade,
  abilities:[classAbility,movement,quietMelee,quietGrenade],
  abilityOptionsBySocket:{classAbility:[classAbility],movement:[movement],melee:[quietMelee,joltMelee],grenade:[quietGrenade,joltGrenade]},
  aspects:[utilityAspect,joltAspect],availableAspects:[utilityAspect,joltAspect,unresolvedAspect],fragments:[blindFragment,joltFragment],availableFragments:[blindFragment,joltFragment]
}};
const intelligenceSource={source:'bungie-loadout',characterId:'hunter-1',characterClass:'hunter',forgeLoaderDecision:{buildAnchor:{perk:verifiedComponent(300,'Jolt Anchor','Jolting targets grants grenade energy.','armourEffect')},setProtocol:[],statDirective:{priorities:{grenade:1}},ranking:{maximized:true}},weapons:[],armour:t5Armour};
const analyseCandidate=build=>{const rows=[build.super,...(build.abilities||[]),...(build.aspects||[]),...(build.fragments||[])].filter(Boolean),links=rows.filter(row=>/jolt/i.test(row.description||'')).map((row,index)=>({chain:`${row.name} -> jolt -> anchor ${index}`}));return {buildLoop:links,strengths:links,weakLinks:[],confidence:{level:links.length?'high':'insufficient'}};};
const composed=composeForgeRecommendation({build:intelligenceSource,candidate:intelligenceCandidate,element:'arc',analyzeBuild:analyseCandidate});
assert.equal(composed.workingBuild.subclassBuild.super.hash,joltSuper.hash,'The Forge intelligence must prefer the verified Super with the strongest directed armour-loop evidence.');
assert.equal(composed.workingBuild.subclassBuild.melee.hash,joltMelee.hash,'The Forge intelligence must score verified ability alternatives.');
assert.equal(composed.workingBuild.subclassBuild.grenade.hash,joltGrenade.hash,'The Forge intelligence must score every verified ability socket.');
assert.ok(composed.workingBuild.subclassBuild.aspects.every(row=>row.unresolved!==true),'Unresolved options must never enter a generated recommendation.');
assert.deepEqual(composed.workingBuild.abilities.map(row=>row.hash),composed.workingBuild.subclassBuild.abilities.map(row=>row.hash),'The root live-transfer projection must match the recommended subclass socket projection.');
assert.equal(composed.intelligence.source,'verified-forge-loader-bungie-catalogue');
assert.ok(composed.intelligence.evidence.directedLinks>=4,'The decision ledger must preserve directed evidence metrics.');
assert.throws(()=>composeForgeRecommendation({build:intelligenceSource,candidate:{...intelligenceCandidate,subclassBuild:{...intelligenceCandidate.subclassBuild,socketsAvailable:false}},element:'arc',analyzeBuild:analyseCandidate}),/complete verified Bungie subclass socket set/,'A canonical element without a live verified socket set must never be offered as an intelligence result.');
assert.deepEqual(composeForgeRecommendation({build:intelligenceSource,candidate:intelligenceCandidate,element:'arc',analyzeBuild:analyseCandidate,bounded:true}),composed,'Bounded worker scoring must retain the established choices and evidence.');
const prismaticFragments=['arc','solar','void','stasis','strand'].map((element,index)=>verifiedComponent(400+index,`${element} fragment`,`${element} damage interaction.`, 'fragment',{element}));
const prismaticCandidate={...intelligenceCandidate,element:'prismatic',name:'Prismatic',subclassBuild:{...intelligenceCandidate.subclassBuild,aspects:[{...joltAspect,fragmentSlots:5}],availableAspects:[{...joltAspect,fragmentSlots:5}],fragments:prismaticFragments.slice(0,2),availableFragments:prismaticFragments}};
const prismatic=composeForgeRecommendation({build:intelligenceSource,candidate:prismaticCandidate,element:'prismatic',analyzeBuild:null});
assert.deepEqual([...prismatic.intelligence.prismaticCoverage.covered].sort(),['arc','solar','stasis','strand','void'],'Prismatic recommendations must score and report verified coverage across all five damage families when that evidence exists.');
assert.deepEqual(prismatic.intelligence.prismaticCoverage.missing,[],'A fully evidenced Prismatic combination must not claim a missing damage family.');
assert.deepEqual(composeForgeRecommendation({build:intelligenceSource,candidate:prismaticCandidate,element:'prismatic',analyzeBuild:null,bounded:true}),prismatic,'Bounded Prismatic scoring must retain all five damage families.');
const scatterGrenade=verifiedComponent(114,'Scatter Grenade','A grenade that splits into many submunitions.','grenade');
const nothingManaclesSource={...intelligenceSource,forgeLoaderDecision:{...intelligenceSource.forgeLoaderDecision,buildAnchor:{name:'Nothing Manacles',selectedItemInstanceId:'nothing-manacles-instance',perk:verifiedComponent(301,'Scatter Charge','Gain an additional Scatter Grenade charge. Enables tracking for Scatter Grenade projectiles.','armourEffect')}}};
const nothingManaclesCandidate={...intelligenceCandidate,hash:201,bungieHash:201,element:'void',name:'Voidwalker',subclassBuild:{...intelligenceCandidate.subclassBuild,grenade:quietGrenade,abilities:[classAbility,movement,quietMelee,quietGrenade],abilityOptionsBySocket:{...intelligenceCandidate.subclassBuild.abilityOptionsBySocket,grenade:[quietGrenade,joltGrenade,scatterGrenade]}}};
const nothingManaclesBuild=composeForgeRecommendation({build:nothingManaclesSource,candidate:nothingManaclesCandidate,element:'void',analyzeBuild:null});
assert.equal(nothingManaclesBuild.workingBuild.subclassBuild.grenade.hash,scatterGrenade.hash,'Nothing Manacles must force the explicitly named Scatter Grenade into the recommendation.');
assert.ok(nothingManaclesBuild.intelligence.decisions.some(row=>row.componentHash===scatterGrenade.hash&&row.reasons.some(reason=>reason.code==='exotic-anchor-exact-ability')),'The decision ledger must explain that Scatter Grenade was selected from the Nothing Manacles perk text.');
assert.deepEqual(filterExoticCompatibleSubclasses(nothingManaclesSource,[intelligenceCandidate,nothingManaclesCandidate]).map(row=>row.element),['void'],'An Exotic that explicitly names Scatter Grenade must expose only the verified Void subclass as compatible.');

const armourMod=(hash,name,description,role,socketIndex,energyCost,statName='',statValue=0)=>({hash,bungieHash:hash,name,description,socketIndex,canInsert:true,definition:{displayProperties:{name,description},plug:{plugCategoryIdentifier:role==='general-mod'?'armor.mods.general':'armor.mods.helmet',energyCost},traitIds:[]},statContributions:statName?[{hash:7000+hash,name:statName,value:statValue,isConditionallyActive:false}]:[]});
const minorHealth=armourMod(501,'Minor Health Mod','Improves Health.','general-mod',1,1,'Health',5);
const majorHealth=armourMod(502,'Major Health Mod','Greatly improves Health.','general-mod',1,3,'Health',10);
const grenadeLoop=armourMod(503,'Grenade Kickstart','Using a grenade returns grenade energy.','slot-mod',2,3);
const emptySlot={...armourMod(504,'Empty Mod Socket','No mod equipped.','slot-mod',3,0),definition:{...armourMod(504,'Empty Mod Socket','No mod equipped.','slot-mod',3,0).definition}};
const ashes=armourMod(505,'Ashes to Assets','Grenade final blows grant Super energy.','slot-mod',3,3);
const modArmour=[{...t5Armour[0],name:'Test Helmet',energy:{capacity:10,used:4},generalMods:[minorHealth],slotMods:[grenadeLoop,emptySlot],armourSemantics:{energy:{capacity:10,used:4},generalMods:[minorHealth],slotMods:[grenadeLoop,emptySlot]},armourModOptions:{1:[minorHealth,majorHealth],2:[grenadeLoop],3:[emptySlot,ashes]}}].concat(t5Armour.slice(1));
const modSource={...intelligenceSource,armour:modArmour,forgeLoaderDecision:{...intelligenceSource.forgeLoaderDecision,statDirective:{targets:{health:100,melee:0,grenade:0,super:0,class:0,weapon:0},priorities:{health:1,melee:0,grenade:2,super:0,class:0,weapon:0},achieved:{health:70,melee:40,grenade:40,super:40,class:40,weapon:40},rawTotal:270,modsApplied:false}}};
const modState=createBuildState(modSource),modResult=recommendArmourMods({build:modState.workingBuild,objective:'ability-uptime'}),modActions=Object.fromEntries(modResult.recommendation.decisions.map(row=>[row.socketIndex,row.action]));
assert.equal(modActions[1],'REPLACE','A stronger verified stat mod must replace a weaker installed mod when energy allows.');
assert.equal(modActions[2],'KEEP','An installed mod must be retained when no verified alternative proves a stronger fit.');
assert.equal(modActions[3],'ADD','A verified synergistic mod must fill an empty functional socket when energy allows.');
assert.equal(modResult.recommendation.rawStatsModFree,true,'The armour recommendation must explicitly preserve the mod-free Forge Loader baseline.');
assert.equal(modResult.recommendation.projectedStats.raw.health,70,'Projected recommendations must not mutate raw Forge Loader stats.');
assert.equal(modResult.recommendation.projectedStats.currentTotal.health,75,'Installed stat mods must be evaluated separately from the raw Forge Loader result.');
assert.equal(modResult.recommendation.projectedStats.recommendedTotal.health,80,'Recommended stat mods must produce a separate capped projection.');
assert.equal(modState.originalBuild.armour[0].generalMods[0].hash,minorHealth.hash,'The protected Original must retain the installed mod after Working Build optimization.');
assert.equal(modResult.workingBuild.armour[0].generalMods[0].hash,majorHealth.hash,'Only the Working Build may carry the recommended replacement.');
assert.equal(modResult.recommendation.liveTransferAuthorized,false,'A generated armour-mod plan must remain review-only.');
const weaponStatMod=armourMod(506,'Minor Weapon Mod','Improves Weapon.','general-mod',1,1,'Weapon',5),grenadeStatMod=armourMod(507,'Minor Grenade Mod','Improves Grenade.','general-mod',1,1,'Grenade',5);
const nothingManaclesModArmour=[{...t5Armour[0],name:'Nothing Manacles Test Piece',energy:{capacity:10,used:1},generalMods:[weaponStatMod],slotMods:[],armourSemantics:{energy:{capacity:10,used:1},generalMods:[weaponStatMod],slotMods:[]},armourModOptions:{1:[weaponStatMod,grenadeStatMod]}}].concat(t5Armour.slice(1));
const nothingManaclesModSource={...nothingManaclesSource,armour:nothingManaclesModArmour,forgeLoaderDecision:{...nothingManaclesSource.forgeLoaderDecision,statDirective:{targets:{health:0,melee:0,grenade:200,super:0,class:0,weapon:0},priorities:{health:0,melee:0,grenade:1,super:0,class:0,weapon:0},achieved:{health:30,melee:50,grenade:160,super:80,class:70,weapon:75},rawTotal:465,modsApplied:false}}};
const nothingManaclesModResult=recommendArmourMods({build:nothingManaclesModSource,objective:'dps'}),nothingManaclesStatDecision=nothingManaclesModResult.recommendation.decisions.find(row=>row.socketIndex===1);
assert.equal(nothingManaclesStatDecision?.recommended?.hash,grenadeStatMod.hash,'Nothing Manacles must replace a generic Weapon stat mod with the verified Grenade stat option while Grenade remains below cap.');
assert.equal(nothingManaclesStatDecision?.reasons?.[0]?.kind,'exotic-anchor-stat','The mod plan must identify the selected Exotic armour loop as the primary stat reason.');
const specialFinisher={...armourMod(4004774872,'Special Finisher','Collecting an Orb of Power causes you to gain temporary Armor Charge.','slot-mod',2,1),definition:{...armourMod(4004774872,'Special Finisher','Collecting an Orb of Power causes you to gain temporary Armor Charge.','slot-mod',2,1).definition,plug:{plugCategoryIdentifier:'armor.mods.class',energyCost:1,insertionRules:[{failureMessage:'Similar mod already applied.'}]},tooltipNotifications:[{displayString:'Equipping additional copies of this mod provides no benefit.'}]}};
const singleCopyArmour=[{...t5Armour[4],name:'Class Item Test',energy:{capacity:11,used:0},generalMods:[],slotMods:[],armourSemantics:{energy:{capacity:11,used:0},generalMods:[],slotMods:[]},armourModOptions:{2:[specialFinisher],3:[specialFinisher],4:[specialFinisher]}}];
const singleCopyResult=recommendArmourMods({build:{...nothingManaclesModSource,armour:singleCopyArmour},objective:'ability-uptime'}),singleCopyRecommended=singleCopyResult.recommendation.decisions.filter(row=>row.recommended?.hash===specialFinisher.hash);
assert.equal(singleCopyRecommended.length,1,'Special Finisher must be recommended at most once even when Bungie exposes it in multiple class-item sockets.');
assert.equal(singleCopyResult.recommendation.validation.ready,true,'A generated armour-mod plan must pass the final single-copy legality gate.');
assert.ok(singleCopyResult.recommendation.limitations.some(row=>/Special Finisher is limited to one copy/i.test(row)),'The recommendation must explain when Bungie marks additional copies as conflicting or non-beneficial.');
const invalidSingleCopyBuild={...singleCopyResult.workingBuild,armour:[{...singleCopyResult.workingBuild.armour[0],slotMods:[{...specialFinisher,socketIndex:2},{...specialFinisher,socketIndex:3}]}]},invalidSingleCopyValidation=validateArmourModLoadout(invalidSingleCopyBuild);
assert.equal(invalidSingleCopyValidation.ready,false,'The final legality gate must reject duplicate single-copy mods before review opens.');
assert.match(invalidSingleCopyValidation.reason,/Special Finisher cannot be recommended more than once/,'The legality failure must name the exact invalid mod.');
const stackableMod=armourMod(508,'Stackable Grenade Mod','Grenade energy gains stack with additional copies.','slot-mod',2,1),stackableArmour=[{...t5Armour[4],name:'Stackable Test',energy:{capacity:11,used:0},generalMods:[],slotMods:[],armourSemantics:{energy:{capacity:11,used:0},generalMods:[],slotMods:[]},armourModOptions:{2:[stackableMod],3:[stackableMod]}}],stackableResult=recommendArmourMods({build:{...nothingManaclesModSource,armour:stackableArmour},objective:'ability-uptime'});
assert.equal(stackableResult.recommendation.decisions.filter(row=>row.recommended?.hash===stackableMod.hash).length,2,'Mods without Bungie single-copy evidence must remain eligible to stack.');

const exactWeapon=(hash,instance,name,description,bucketHash,extra={})=>{
  const {perkColumnCounts,...weaponExtra}=extra,gearTier=Number(weaponExtra.gearTier)||5,capacities=Array.isArray(perkColumnCounts)?perkColumnCounts:gearTier>=5?[2,2,3,3,2]:gearTier>=3?[2,2,2,2,2]:[1,1,1,1,1];
  const alternativePerkColumns=capacities.map((count,columnIndex)=>({socketIndex:10+columnIndex,options:Array.from({length:count},(_,rowIndex)=>{const perkHash=hash*100+(columnIndex+1)*10+rowIndex+1,perkName=`${name} perk ${columnIndex+1}.${rowIndex+1}`;return {hash:perkHash,bungieHash:perkHash,name:perkName,socketIndex:10+columnIndex,definition:{displayProperties:{name:perkName,description:'Verified synthetic test perk.'},plug:{plugCategoryIdentifier:'weapon.perks'}}};})}));
  const selectedPerks=alternativePerkColumns.map(column=>column.options[0]),perkModel=normaliseWeaponPerkModel({gearTier,selectedPerks,alternativePerkColumns});
  return {hash,bungieHash:hash,itemInstanceId:instance,name,description,bucketHash,gearTier,definition:{displayProperties:{name,description},traitIds:[],inventory:{tierType:weaponExtra.isExotic?6:5,tierTypeName:weaponExtra.isExotic?'Exotic':'Legendary'}},weaponSemantics:{gearTier,selectedPerks,alternativePerkColumns,perkModel},...weaponExtra};
};
const currentPrimary=exactWeapon(601,'weapon-current','Plain Rifle','A reliable rifle.',1498876634),joltPrimary=exactWeapon(602,'weapon-jolt','Jolt Rifle','Final blows jolt nearby targets and grant grenade energy.',1498876634),energyWeapon=exactWeapon(603,'weapon-energy','Energy Weapon','Verified energy weapon.',2465295065),powerWeapon=exactWeapon(604,'weapon-power','Power Weapon','Verified power weapon.',953998645);
const expandedTierFiveWeapon=exactWeapon(609,'weapon-expanded-tier-five','Expanded Tier Five Weapon','A verified crafted weapon with an additional perk choice.',1498876634,{perkColumnCounts:[2,3,3,3,2]});
assert.equal(validateWeaponModel({weapons:[expandedTierFiveWeapon]}).ready,true,'Verified Tier 5 weapon columns may exceed the baseline row count without blocking Build Forge generation.');
const incompleteTierFiveWeapon=structuredClone(currentPrimary);incompleteTierFiveWeapon.weaponSemantics.perkModel.columns[0].expectedRowCount=1;incompleteTierFiveWeapon.weaponSemantics.perkModel.columns[0].options=incompleteTierFiveWeapon.weaponSemantics.perkModel.columns[0].options.slice(0,1);
assert.equal(validateWeaponModel({weapons:[incompleteTierFiveWeapon]}).ready,false,'Tier 5 weapon evidence below the Bungie baseline must still block Build Forge generation.');
assert.match(runtime,/paradox-forge-preparation\.mjs\?v=20260909-super-evidence-1/,'Build Forge must load the Super evidence background preparation graph.');
assert.match(preparationRuntime,/paradox-forge-worker\.mjs\?v=20260909-super-evidence-1/,'Background preparation must start the Super evidence Forge worker.');
assert.match(workerRuntime,/paradox-forge-sequence\.mjs\?v=20260909-super-evidence-1/,'The Forge worker must load the Super evidence generation sequence.');
assert.match(sequenceRuntime,/paradox-loadout-intelligence\.mjs\?v=20260906-complete-build-transfer-1/,'The generation sequence must load the corrected weapon evidence validator.');
const ownedWeaponCatalogue=[currentPrimary,joltPrimary,energyWeapon,powerWeapon];
const weaponResult=selectOwnedWeapons({build:{...intelligenceSource,weapons:[currentPrimary,energyWeapon,powerWeapon],ownedWeapons:ownedWeaponCatalogue,vaultWeapons:ownedWeaponCatalogue},objective:'add-clear'});
assert.equal(weaponResult.workingBuild.weapons[0].itemInstanceId,'weapon-jolt','Owned-weapon ranking must select the exact verified instance with stronger explicit armour-loop and objective evidence.');
assert.equal(weaponResult.recommendation.decisions[0].action,'REPLACE','Owned-weapon review must identify an exact instance replacement.');
assert.equal(weaponResult.recommendation.inventoryScope,'vault-character-and-equipped','Weapon ranking must use the complete verified owned inventory rather than equipped weapons alone.');
assert.equal(weaponResult.recommendation.candidateCount,4,'Duplicate inventory sources must collapse to four exact owned instances in linear time.');
assert.equal(weaponResult.workingBuild.ownedWeapons,ownedWeaponCatalogue,'Owned-weapon ranking must structurally share the unchanged catalogue instead of deep-copying it.');
assert.equal(weaponResult.recommendation.liveTransferAuthorized,false,'Owned-weapon selection must remain review-only.');
const exoticEnergy=exactWeapon(605,'weapon-exotic-energy','Exotic Grenade Energy Weapon','Void final blows grant grenade energy and jolt targets.',2465295065,{isExotic:true}),exoticPower=exactWeapon(606,'weapon-exotic-power','Exotic Grenade Power Weapon','Void final blows grant grenade energy and jolt targets.',953998645,{isExotic:true});
const constrainedWeaponResult=selectOwnedWeapons({build:{...nothingManaclesSource,weapons:[currentPrimary,energyWeapon,powerWeapon],ownedWeapons:[currentPrimary,joltPrimary,energyWeapon,powerWeapon,exoticEnergy,exoticPower]},objective:'dps'});
assert.equal(constrainedWeaponResult.workingBuild.weapons.filter(isExoticItem).length,1,'A recommended Destiny loadout must never contain more than one Exotic weapon.');
assert.equal(constrainedWeaponResult.recommendation.constraints.maxExoticWeapons,1,'The recommendation must expose its enforced Exotic weapon constraint.');
assert.equal(constrainedWeaponResult.recommendation.constraints.selectedExoticWeaponCount,1,'The recommendation must expose the selected Exotic weapon count.');
assert.equal(validateExoticLoadout({...constrainedWeaponResult.workingBuild,armour:[{...t5Armour[0],isExotic:true,itemInstanceId:'nothing-manacles-instance'},...t5Armour.slice(1)]},{requireArmourAnchor:true}).ready,true,'One selected Exotic armour and one recommended Exotic weapon must pass the Destiny equip rule.');
assert.equal(validateExoticLoadout({armour:[{...t5Armour[0],isExotic:true},{...t5Armour[1],isExotic:true}],weapons:[exoticEnergy,exoticPower]}).ready,false,'Any build containing multiple Exotic armour pieces or weapons must fail before review.');

const firepower=armourMod(509,'Firepower','Your grenade final blows create Orbs of Power.','slot-mod',2,3),voidSiphon=armourMod(510,'Void Siphon','Rapid Void weapon final blows create an Orb of Power.','slot-mod',2,3),kineticSiphon=armourMod(511,'Kinetic Siphon','Rapid Kinetic weapon final blows create an Orb of Power.','slot-mod',2,3),loopHelmet={...t5Armour[0],itemInstanceId:'helmet-loop',name:'Loop Helmet',energy:{capacity:10,used:0},generalMods:[],slotMods:[],armourSemantics:{energy:{capacity:10,used:0},generalMods:[],slotMods:[]},armourModOptions:{2:[voidSiphon,kineticSiphon],3:[ashes]}},loopArms={...t5Armour[1],itemInstanceId:'nothing-manacles-instance',name:'Nothing Manacles',isExotic:true,energy:{capacity:10,used:0},generalMods:[],slotMods:[],armourSemantics:{energy:{capacity:10,used:0},generalMods:[],slotMods:[]},armourModOptions:{2:[firepower]}},voidWeapon=exactWeapon(607,'weapon-void','Verified Void SMG','A Void weapon.',2465295065,{element:'Void',elementDefinition:{displayProperties:{name:'Void'}}}),solarWeapon=exactWeapon(608,'weapon-solar','Verified Solar SMG','A Solar weapon.',2465295065,{element:'Solar',elementDefinition:{displayProperties:{name:'Solar'}}}),voidLoopSource={...nothingManaclesModSource,subclass:'void',subclassName:'Voidwalker',subclassBuild:{...nothingManaclesCandidate.subclassBuild,grenade:scatterGrenade,abilities:[classAbility,movement,quietMelee,scatterGrenade]},weapons:[currentPrimary,solarWeapon,powerWeapon],ownedWeapons:[currentPrimary,voidWeapon,solarWeapon,powerWeapon],armour:[loopHelmet,loopArms,...t5Armour.slice(2).map((row,index)=>({...row,itemInstanceId:`loop-${index+2}`}))]};
voidLoopSource.loadoutIntent=deriveLoadoutIntent(voidLoopSource);
const voidWeaponResult=selectOwnedWeapons({build:voidLoopSource,objective:'dps'});
assert.equal(voidWeaponResult.workingBuild.weapons.some(weapon=>weapon.itemInstanceId===voidWeapon.itemInstanceId),true,'A Void Exotic-anchored build must select a verified owned Void weapon before considering Void Siphon.');
const voidModResult=recommendArmourMods({build:voidWeaponResult.workingBuild,objective:'dps'}),voidModHashes=voidModResult.recommendation.decisions.map(row=>row.recommended?.hash).filter(Boolean);
assert.ok(voidModHashes.includes(firepower.hash),'Nothing Manacles must include the verified grenade-final-blow Orb generator.');
assert.ok(voidModHashes.includes(ashes.hash),'Nothing Manacles must include the verified grenade-final-blow Super return mod.');
assert.ok(voidModHashes.includes(voidSiphon.hash),'Void Siphon is eligible only after the exact owned Void weapon is selected.');
const noVoidModResult=recommendArmourMods({build:{...voidLoopSource,weapons:[currentPrimary,solarWeapon,powerWeapon],ownedWeapons:[]},objective:'dps'});
assert.ok(!noVoidModResult.recommendation.decisions.some(row=>row.recommended?.hash===voidSiphon.hash),'Void Siphon must be rejected when the selected loadout contains no verified Void weapon.');
const coherentArtifact={selectionStatus:'ready',selectionLimit:2,selectedPerkHashes:[9101,9102]},coherentConfiguration={artifactHash:9001,selectedPerkHashes:[9101,9102]},coherentBuild={...voidModResult.workingBuild,artifactRecommendation:coherentArtifact,artifactConfiguration:coherentConfiguration,recommendationGeneratedAt:new Date(0).toISOString(),armour:voidModResult.workingBuild.armour.map((item,index)=>({...item,itemInstanceId:item.itemInstanceId||`coherent-${index}`}))};
const coherence=validateLoadoutCoherence(coherentBuild);assert.equal(coherence.ready,true,coherence.reason);
assert.equal(coherence.coverage.grenadeOrb,true,'Cross-system validation must prove grenade-to-Orb coverage.');
assert.equal(coherence.coverage.grenadeSuper,true,'Cross-system validation must prove grenade-to-Super coverage.');
const applyCharacterId='30001';
const applyReadyBuild={
  ...coherentBuild,
  characterId:applyCharacterId,
  membershipId:'40001',
  membershipType:'3',
  forgeLoaderDecision:{...coherentBuild.forgeLoaderDecision,buildAnchor:{...coherentBuild.forgeLoaderDecision.buildAnchor,selectedItemInstanceId:'60002'}},
  weapons:coherentBuild.weapons.map((row,index)=>({...row,itemInstanceId:String(50001+index),bucketHash:[1498876634,2465295065,953998645][index],source:{kind:'equipped',characterId:applyCharacterId}})),
  armour:coherentBuild.armour.map((row,index)=>({...row,itemInstanceId:String(60001+index),bucketHash:[3448274439,3551918588,14239492,20886954,1585787867][index],classType:1,source:{kind:'equipped',characterId:applyCharacterId}}))
};
const preflight=createLiveTransferPreflight(applyReadyBuild);assert.equal(preflight.ready,true,preflight.violations.join(' | '));

const loadoutsAt=html.indexOf('loadouts-design-section'),armourAt=html.indexOf('armour-design-section'),weaponsAt=html.indexOf('weapon-design-section'),recommendationAt=html.indexOf('recommendation-panel'),rightRailAt=html.indexOf('build-right-rail'),validationAt=html.indexOf('validation-panel'),intelligenceAt=html.indexOf('data-paradox-analysis');
assert.ok(loadoutsAt>0&&loadoutsAt<armourAt&&armourAt<weaponsAt&&weaponsAt<recommendationAt&&recommendationAt<rightRailAt,'Centre column order must be In-game Loadouts, Armour & Mods, Weapons & Perks, then Elemental Build Options.');
assert.ok(rightRailAt<validationAt&&validationAt<intelligenceAt,'The right rail must contain the Validation Loop above Paradox Intelligence.');
assert.match(html,/PARADOX RECOMMENDATION[\s\S]*?ELEMENTAL BUILD OPTIONS/,'The armour-driven recommendation controls must not be presented as a second subclass picker.');
assert.doesNotMatch(html,/CHOOSE SUBCLASS/,'Build Forge must not label elemental damage recommendations as a subclass picker.');
assert.match(css,/\.build-space\{grid-template-columns:var\(--apx-workspace-columns,minmax\(360px,20%\) minmax\(720px,1fr\) minmax\(420px,24%\)\)/,'Build Forge must consume the shared Journey workspace proportions.');
assert.match(css,/\.build-space\{grid-template-columns:var\(--apx-workspace-columns,[^;]+\);gap:var\(--apx-workspace-gap,\.625rem\);align-items:stretch\}/,'Loaded Build Forge columns must share the common gutter and stretch to the centre-column height.');
assert.match(css,/\.build-space>\.build-rail,\.build-space>\.design-canvas,\.build-space>\.build-right-rail,\.build-right-rail>\.intelligence\{height:100%\}/,'All three desktop columns must consume the same loaded row height.');
assert.match(css,/@media\(max-width:1760px\)\{\.build-space\{grid-template-columns:var\(--apx-workspace-compact-columns,392px minmax\(0,1fr\)\)\}/,'Build Forge must share Journey\'s compact workspace before the right rail moves below.');
assert.match(css,/\.build-forge-page \.forge-platform-shell\{grid-template-columns:0 minmax\(0,1fr\) 0!important\}/,'Build Forge must reclaim the obsolete external media rails for the working columns.');
assert.match(css,/\.build-rail\{container-type:inline-size;--build-rail-icon:clamp\(40px,21cqi,128px\)/,'Build left-rail icons must remain proportional to their column without taking ownership of the shared Character token.');
assert.match(css,/\.armour-design-section \.gear-columns\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/,'All five armour cards must remain on one row.');
assert.match(css,/--build-armour-art-width:var\(--apx-icon-gear-art-width\);[\s\S]*?--build-armour-art-height:var\(--apx-icon-gear-art-height\)/,'Build Armour art must consume the shared portrait gear-art tokens.');
assert.match(css,/--build-armour-mod:var\(--guardian-square\)/,'Build Armour mods must consume the shared Character socket size.');
assert.match(gearCss,/--gear-weapon-art:var\(--apx-icon-gear-art-width\);[\s\S]*?--gear-weapon-socket:var\(--apx-icon-weapon-socket\)/,'Character and Build Forge must consume the shared portrait gear-art and socket tokens.');
assert.match(css,/\.recommended-weapons-summary\{--gear-weapon-art:var\(--apx-icon-gear-art-width\)/,'Recommended weapon cards must consume the shared portrait gear-art token.');
assert.match(css,/\.weapon-design-section \.gear-weapons \.weap-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/,'Build Forge must preserve the shared three-card weapon row.');
assert.match(css,/Build Forge readability:[\s\S]*?\.build-forge-page[\s\S]*?--dim:#b8b2bd;[\s\S]*?font-family:bahnschrift,system-ui,sans-serif!important/,'Build Forge must retain the readable Bahnschrift text hierarchy and high-contrast working colours.');

const elementButtons=[...html.matchAll(/data-recommendation-element="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(elementButtons,BUILD_ELEMENTS,'Recommendation buttons must be ARC, SOLAR, STRAND, STASIS, VOID and PRISMATIC only.');
assert.match(runtime,/elementGrid\?\.classList\.toggle\('has-multiple-options',hasDecision&&supported\.size>1\)/,'Elemental recommendation controls must advertise when multiple verified choices are available.');
assert.match(runtime,/button\.classList\.toggle\('is-available',available\)/,'Each elemental recommendation control must retain its explicit verified-availability state.');
for(const element of BUILD_ELEMENTS)assert.match(css,new RegExp(`data-recommendation-element="${element}"\\]\\{--element-colour:#`),`${element.toUpperCase()} must retain its own elemental colour token.`);
assert.match(css,/\.element-recommendation-grid\.has-multiple-options button:not\(:disabled\)::after\{animation:elemental-option-pulse/,'Multiple selectable elemental options must receive the restrained pulsing glow.');
assert.match(css,/button\.is-selected\{[^}]*border-color:var\(--element-colour\)[^}]*box-shadow:[^}]*var\(--element-colour\)/,'The selected elemental option must have the strongest colour-coded state.');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.element-recommendation-grid\.has-multiple-options button:not\(:disabled\)::after\{animation:none/,'Elemental glow animation must respect reduced-motion preferences.');
assert.match(html,/id="generateMaxLoadout"[^>]*>[^<]+<\/button>[\s\S]*?id="forgeGenerationLoader"[^>]*hidden/,'The in-page Paradox loader must sit below the generation controls and begin hidden.');
assert.match(css,/\.forge-generation-loader\{[^}]*background:transparent\}/,'Recommendation generation must reuse only the circular loader without a full-screen background.');
assert.match(runtime,/await showForgeGenerationLoader\(selectedRecommendationElement\)[\s\S]*?forgePreparation\.get/,'The circular loader must paint before verified build generation begins.');
assert.match(runtime,/writeState\(next\);render\(\);hideForgeGenerationLoader\(\);if\(!await openRecommendedBuild\(\)\)throw new Error/,'The in-page loader must close before the generated result opens, and a failed review open must be reported.');
assert.match(html,/OWNED VAULT \+ CHARACTER INVENTORY/,'The recommendation review must identify its full verified weapon-inventory scope.');
assert.match(sequenceRuntime,/initialWeaponResult=selectOwnedWeapons[\s\S]*?applyForgeArtifactRecommendation\(next,\{currentSeasonNumber,force:true\}\)[\s\S]*?artifactAwareWeaponResult=selectOwnedWeapons/,'Generation must rank owned weapons, select Artifact synergy, then re-rank weapons against that Artifact fit.');
assert.match(sequenceRuntime,/provisionalModResult=recommendArmourMods[\s\S]*?applyForgeArtifactRecommendation\(next,\{currentSeasonNumber,force:true\}\)[\s\S]*?artifactAwareWeaponResult=selectOwnedWeapons/,'Generation must expose the grenade-orb-Super mod loop to Artifact ranking before re-ranking owned weapons.');
assert.match(sequenceRuntime,/artifactSynergyScore:Number\(working\.artifactRecommendation\?\.totalScore\|\|0\)/,'Forge intelligence must record the verified Artifact synergy contribution.');
assert.match(html,/id="armourExoticRule">DESTINY EQUIP RULE · 1 EXOTIC ARMOUR/,'The review must show the enforced one-Exotic armour rule.');
assert.match(html,/id="weaponExoticRule">OWNED VAULT \+ CHARACTER INVENTORY · 1 EXOTIC WEAPON MAX/,'The review must show both its full owned inventory scope and one-Exotic weapon limit.');
assert.match(runtime,/EXOTIC ANCHOR: \$\{String\(anchorName\)\.toUpperCase\(\)\}/,'The recommendation heading must name the selected Exotic armour anchor.');
assert.match(runtime,/changedItems=\(plan\.items\|\|\[\]\)[\s\S]*?filter\(row=>row\.action!=='KEEP'\)/,'The review must omit unchanged mod sockets and present only proposed changes.');
assert.match(runtime,/review-artifact-synergy[\s\S]*?ARTIFACT SYNERGY/,'The review must expose the evidence behind the Artifact recommendation.');
assert.match(artifactSelectionRuntime,/recommendArtifactPerks\(build,effectiveArtifact,\{currentSeasonNumber:season,planFullBuild:true\}\)/,'Build Forge must produce a complete target Artifact plan when only the current CharacterProgressions tree is available.');
assert.match(artifactSelectionRuntime,/artifactPlanVersion:3/,'The cross-system Artifact-plan release must invalidate previously cached recommendation fingerprints.');
assert.match(runtime,/PARADOX FULL TARGET PLAN[\s\S]*?currently unlocked and equipped perks remain unchanged/,'The Artifact recommendation must distinguish the complete target plan from the live unlocked and equipped state.');
assert.match(css,/\.recommended-build-dialog\{display:grid;grid-template-areas:"header" "safety" "status" "content" "actions";grid-template-rows:auto auto auto minmax\(0,1fr\) auto;width:calc\(100vw - 20px\);height:calc\(100dvh - 20px\);max-width:none;min-height:0;border:0/,'The recommendation review must fit the viewport and reserve an independently scrollable content row.');
assert.match(css,/\.recommended-build-content\{[^}]*min-height:0[^}]*overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable/,'The recommendation body must scroll without pushing the Apply actions outside the viewport.');
assert.match(css,/\.recommended-armour-summary \.gear-arm-anchor \.arm\{width:var\(--apx-icon-gear-art-width\)!important;height:var\(--apx-icon-gear-art-height\)!important;aspect-ratio:100\/122!important\}/,'Recommended armour must retain the same shared portrait scale as Character and Build Design.');
assert.match(html,/id="continueToBuildTest">TEST THIS BUILD/,'The recommendation review must lead into the user-run Build Test.');
assert.match(runtime,/function renderParadoxTestReview\(capture=readCapture\(\)\)[\s\S]*?Causal perk activation, DPS and uptime remain inference/,'Paradox must review confirmed post-test Bungie evidence without inventing causal telemetry.');
assert.deepEqual([...html.matchAll(/data-build-objective="([^"]+)"/g)].map(match=>match[1]),['balanced','dps','add-clear','survivability','ability-uptime'],'Build Forge must expose the five deterministic tuning objectives used by weapon and mod ranking.');
assert.match(html,/id="generateMaxLoadout" disabled>GENERATE MAX LOADOUT/,'Generation must begin locked until verified inputs pass.');
assert.match(runtime,/function generateMaxLoadout\(\)/,'Build Forge must expose an explicit recommendation generation boundary.');
assert.match(runtime,/function blankArmourModCanvas\(\)[\s\S]*?Array\.from\(\{length:6\}[\s\S]*?AI recommendation pending[\s\S]*?grid\.innerHTML=blankSlots/,'Every staged armour item must present six blank AI recommendation slots before generation.');
assert.match(runtime,/function renderArmourRecommendationState\(build=\{\}\)[\s\S]*?Boolean\(build\.recommendationGeneratedAt\)[\s\S]*?MANUAL WORKING BUILD[\s\S]*?if\(!generated&&!manual\)blankArmourModCanvas\(\)/,'The armour canvas must distinguish pending, manual and generated recommendation states.');
assert.match(runtime,/function renderBuildGear\(build=\{\}\)[\s\S]*?renderArmourRecommendationState\(build\)[\s\S]*?renderWeapons/,'Build Forge must apply the blank-or-generated mod presentation on every gear render.');
assert.match(sequenceRuntime,/composeForgeRecommendation\(\{build:forgeComputationProjection\(working\),candidate,element:element,analyzeBuild:analyzeLiveGuardian,bounded:true\}\)/,'Generation must compare verified subclass sockets through a memory-bounded deterministic Forge intelligence projection.');
const computationFields=runtime.match(/const FORGE_COMPUTATION_FIELDS=Object\.freeze\(\[([^\]]+)\]\)/)?.[1]||'';
assert.doesNotMatch(computationFields,/ownedWeapons|vaultWeapons|inventoryWeapons|subclassCatalog|availableArtifacts|loadouts/,'Combination scoring must never deep-copy full inventory and catalogue collections.');
assert.match(runtime,/async function updateForgeGenerationPhase\(message\)[\s\S]*?setTimeout\(resolve,0\)/,'Recommendation phases must yield to the browser so the loader and page remain responsive.');
assert.match(runtime,/resolvedSubclassOptions\(build\)\.filter\(hasVerifiedSubclassSockets\)/,'Element buttons must enable only complete live Bungie subclass socket sets, not canonical catalogue placeholders.');
assert.match(runtime,/filterExoticCompatibleSubclasses\(build,verified\)/,'Element buttons must remove subclass options that conflict with an explicitly named selected-Exotic ability.');
assert.match(html,/id="buildSuperSynergy"[^>]*role="status"/,'Build Forge must expose per-Super Exotic evidence beside the selectable Super formation.');
assert.match(runtime,/rankExoticSuperSynergy\(build,candidate\?\[candidate\]:\[\]\)/,'The visible Super formation must use the same evidence-backed ranking as generation.');
assert.match(runtime,/NO DIRECT SYNERGY EVIDENCE/,'Build Forge must state plainly when the staged Exotic does not support a Super.');
assert.match(css,/\.super-diamond\.is-exotic-super-best\{[^}]*box-shadow/,'Only Supers with the strongest real Exotic evidence may receive the evidence highlight.');
assert.match(intelligenceRuntime,/status:!description\?'unknown':strongest>0\?'evidenced':'no-direct-super-synergy'/,'Missing Super synergy evidence must remain an explicit no-ranking result.');
assert.match(sequenceRuntime,/working\.paradoxAnalysis=analyzeLiveGuardian\(working\)[\s\S]*?advise\(working,working\.paradoxAnalysis\|\|\{\}, \{insertSocketPlugFree:false\}\)/,'Generation must re-run directed analysis after Artifact selection before recommendation-only weapon advice.');
assert.match(sequenceRuntime,/working\.objective=objective[\s\S]*?selectOwnedWeapons\(\{build:working,objective:objective\}\)[\s\S]*?recommendArmourMods\(\{build:working,objective:objective\}\)/,'Generation must rank exact owned weapons before producing the verified per-socket armour-mod plan for the selected tuning objective.');
assert.match(sequenceRuntime,/recommendArmourMods\(\{build:working,objective:objective\}\)[\s\S]*?validateArmourModLoadout\(working\)[\s\S]*?throw new Error\(generatedModValidation\.reason\)/,'Build Forge must block an invalid single-copy armour-mod plan before opening the review.');
assert.match(sequenceRuntime,/applyForgeArtifactRecommendation\(next,\{currentSeasonNumber,force:true\}\)/,'Generation must refresh the verified legal Artifact fit.');
assert.match(sequenceRuntime,/validateExoticLoadout\(working,\{requireArmourAnchor:true\}\)[\s\S]*?throw new Error\(generatedExoticValidation\.reason\)/,'Generation must stop before review if any recommendation violates the Destiny Exotic equip rule.');
assert.match(runtime,/await refreshForgeArtifactRecommendation\(\);[\s\S]*?const state=readState\(\),build=/,'Generation must settle the current Artifact refresh before capturing its guarded source state.');
assert.match(runtime,/let recoveredState=readState\(\);[\s\S]*?await restorePersistedBuildState\(\)[\s\S]*?if\(!recoveredState\)throw new Error/,'Generate must attempt the character-bound persisted snapshot before reporting that no Working Build exists.');
assert.match(runtime,/working\.liveTransferPreflight=createLiveTransferPreflight\(working\);[\s\S]*?openRecommendedBuild\(\)/,'A generated result must carry Apply preflight evidence into the review.');
assert.doesNotMatch(runtime,/working\.liveTransferPreflight=createLiveTransferPreflight\(working\);if\(!working\.liveTransferPreflight\.ready\)throw/,'Apply preflight must not suppress a coherent generated-build review.');
assert.doesNotMatch(sequenceRuntime,/working\.liveTransferPreflight=createLiveTransferPreflight\(working\);if\(!working\.liveTransferPreflight\.ready\)throw/,'The background sequence must return Apply blockers as review evidence instead of rejecting the recommendation.');
assert.match(runtime,/finally\{[\s\S]*?renderRecommendationControls\(currentBuild\(\)\|\|\{\}\);[\s\S]*?if\(failureMessage\)[\s\S]*?status\.textContent=failureMessage/,'A generation failure must remain visible after the controls redraw.');
assert.match(runtime,/setLiveActionBanner\(`Generate blocked · \$\{failureMessage\}`,'warn'\)/,'A generation failure must also be visible in the persistent Working Build banner.');
assert.match(intelligenceRuntime,/liveTransferAuthorized:false/,'The generated intelligence result must never authorize live transfer.');
assert.match(liveAdapterRuntime,/"bungie-live","bungie-loadout","current-guardian"/,'Directed analysis must accept protected snapshots that retain their exact live Bungie provenance label.');
assert.match(advisorRuntime,/new URL\("\.\.\/\.\.\/data\/paradox-forge\/intelligence\/weapon-perk-intelligence\.json",import\.meta\.url\)/,'Weapon intelligence must resolve from the module rather than the current page URL.');
assert.match(advisorRuntime,/if\(typeof document!=="undefined"\)document\.dispatchEvent/,'Weapon advice must remain safe inside the real background Web Worker where document is unavailable.');

assert.match(html,/id="recommendedBuildReveal"[\s\S]*?aria-modal="true"[\s\S]*?hidden/,'The complete recommended build must open in a hidden review layer.');
assert.match(html,/id="recommendedBuildRenderStatus" role="alert" hidden/,'The recommendation review must expose a visible render failure state.');
assert.match(runtime,/revealRecommendedBuild\([\s\S]*?paint:\(\)=>new Promise[\s\S]*?onRenderError:/,'The review must become visible and paint before account specific sections render.');
assert.match(html,/id="recommendedArmourSummary"[\s\S]*?id="recommendedWeaponsSummary"[\s\S]*?id="recommendedArtifactSummary"/,'The review must expose armour, weapon and Artifact sections.');
assert.match(html,/id="recommendedModPlan"/,'The review must expose installed-versus-recommended armour-mod decisions.');
assert.match(runtime,/RAW → CURRENT → RECOMMENDED/,'The review must distinguish mod-free raw stats from installed and recommended projections.');
assert.doesNotMatch(runtime,/decorateRecommendedWeaponPerks|weapon-recommended-perks/,'Build weapons must not duplicate recommendation icons outside the canonical perk matrix.');
assert.match(advisorRuntime,/item\.weaponRollAdvice=advice/,'Weapon recommendation state must attach to the exact owned instance before the canonical perk matrix renders.');
assert.match(runtime,/weaponPerkMatrixMarkup\(item,\{recommendedHashes\}\)/,'Recommended weapons must render the integrated tier-driven perk model.');
assert.match(runtime,/weaponTraitHierarchyMarkup\(item,\{compact:true\}\)/,'Recommended Exotic weapon traits must remain directly beneath the intrinsic hierarchy.');
assert.match(runtime,/TIER \$\{tier\}[\s\S]*?\$\{rowCount\} PERK ROW/,'Recommended weapons must identify the exact tier and modeled perk-row count.');
assert.match(css,/\.recommended-weapons-summary\{--gear-weapon-art:var\(--apx-icon-gear-art-width\);--gear-weapon-socket:var\(--apx-icon-weapon-socket-compact\)/,'Build review weapons must use the shared portrait art and compact socket tokens.');
assert.match(css,/\.review-weapon \.weapon-perk-row\{grid-template-columns:repeat\(var\(--weapon-perk-columns\),var\(--gear-weapon-socket\)\)/,'Build review must reuse the shared weapon socket size across every tier row.');
assert.match(css,/\.review-weapon em\{[^}]*font:800 13px\/1\.25/,'Owned candidate eligibility must remain prominent inside the compact weapon cards.');
assert.match(css,/body\.build-forge-page \.review-weapon small\{font-size:11px!important/,'Compact weapon supporting copy must remain readable.');
assert.match(gearCss,/\.weapon-detail-drawer\{[^}]*width:min\(1120px,96vw\)[^}]*font-size:16px/,'The weapon detail drawer must use the enlarged readable layout.');
assert.match(gearCss,/\.weapon-exotic-traits\{[^}]*border-left:2px/,'Exotic weapon traits must have a subordinate visual stack beneath the intrinsic.');
assert.doesNotMatch(runtime,/armour-verification-line|decorateBuildArmour/,'Build Forge must not render the internal T5 or masterwork gate as repeated armour-card footer text.');
assert.doesNotMatch(html,/T5 BASE REQUIRED|T5 VERIFIED|MASTERWORK NOT REPORTED/,'Internal armour validation must not clutter the user-facing armour layout.');
assert.match(gearRuntime,/return \[masterwork, \.\.\.clean\(generalSource\)\.slice\(0, 2\), \.\.\.clean\(slotSource\)\.slice\(0, 3\)\]/,'Armour mapping must remain masterwork, two general slots and three armour slots.');

assert.match(html,/id="applyWorkingBuild" disabled>APPLY<\/button>/,'The Working Build must expose one explicit Apply entry point outside generation.');
assert.match(html,/id="applyConfirmationDialog"[\s\S]*?LIVE BUNGIE ACTION · FINAL CONFIRMATION[\s\S]*?id="confirmApplyBuild">APPLY TO THIS GUARDIAN<\/button>/,'Apply must open an exact Guardian-scoped final confirmation before any live action.');
assert.match(html,/LIVE GUARDIAN UNCHANGED/,'The review must state that generation does not alter the live Guardian.');
assert.doesNotMatch(runtime,/if\(!build\?\.recommendationGeneratedAt\)throw new Error/,'Manual Apply must not depend on generating an AI recommendation first.');
const planStart=runtime.indexOf('function buildLivePlan()'),applyEnd=runtime.indexOf('function verifiedActivities',planStart),applySource=runtime.slice(planStart,applyEnd);
assert.ok(applySource.indexOf('createLiveTransferPreflight(build)')<applySource.indexOf('createLiveTransferPlan'),'The live route must validate exact loadout coherence before constructing its ordered transfer plan.');
assert.match(applySource,/liveActionCapabilities\(globalThis\.FORGE_BUNGIE_SESSION\)[\s\S]*?async function openApplyConfirmation\(\)[\s\S]*?stageLiveTransferPreflight\(plan,\{session\}\)[\s\S]*?pendingApplyPlan=staged[\s\S]*?async function executeConfirmedApply\(\)[\s\S]*?executeLiveTransferPlan\(confirmLiveTransferPlan\(plan\)/,'Build Forge must run a GET-only live preflight, retain the reviewed plan, and call the executor only from the final confirmation handler.');
assert.doesNotMatch(applySource,/window\.confirm|confirmPerkChangePlan|applyConfirmedPerkChangePlan|fetch\(/,'The UI must not expose a hidden confirm prompt, direct fetch, or obsolete partial perk-only mutation path.');
assert.match(runtime,/stageEquipmentChoice[\s\S]*?stageSocketChoice/,'Build Forge must expose manual exact-item and socket staging independently of Generate.');
assert.match(html,/id="saveParadoxBuild" disabled>SAVE PARADOX<\/button>[\s\S]*?SEPARATE FROM BUNGIE LOADOUT SLOTS/,'Named PARADOX copies must remain explicit and separate from Bungie slots.');

console.log('PARADOX_BUILD_SPACE_STATE=PASS');
console.log('ORIGINAL_WORKING_ISOLATION=PASS');
console.log('DETERMINISTIC_BUILD_DIFF=PASS');
console.log('BUILD_FORGE_LAYOUT=PASS');
console.log('BUILD_FORGE_ARMOUR_T5_AND_MOD_MAPPING=PASS');
console.log('BUILD_FORGE_WEAPON_PERKS=PASS');
console.log('BUILD_FORGE_RECOMMENDATION_ELEMENTS=PASS');
console.log('BUILD_FORGE_ARTIFACT_2_0=PASS');
console.log('BUILD_FORGE_REVIEW_REVEAL=PASS');
console.log('BUILD_MY_GUARDIAN_CONFIRMATION_GATE=PASS');
console.log('VANGUARD_VALIDATION_RECORD=PASS');

export {voidLoopSource,nothingManaclesCandidate};
