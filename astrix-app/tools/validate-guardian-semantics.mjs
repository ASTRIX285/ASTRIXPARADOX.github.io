// Deterministic Guardian semantic validation.
// This is the mechanical counterpart to Paradox Validator reasoning rules:
// unresolved/inactive evidence must never become a verified causal claim.

import {readFile} from 'node:fs/promises';

const failures=[];
const fail=message=>failures.push(message);

const listeners=new Map();
globalThis.document={
  addEventListener(type,fn){const rows=listeners.get(type)||[];rows.push(fn);listeners.set(type,rows);},
  dispatchEvent(){return true;},
  querySelector(){return null;},
  querySelectorAll(){return [];},
  getElementById(){return null;}
};
globalThis.CustomEvent=class{constructor(type,init={}){this.type=type;this.detail=init.detail;}};

const semantics=await import('../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs');
const sets=await import('../pages/guardian-workspace-v2/guardian-armour-set-resolver.mjs');
const live=await import('../pages/guardian-workspace-v2/guardian-paradox-live-adapter.mjs');
const weaponAdvisor=await import('../core/weapon-roll-advisor.mjs');
const transferPlans=await import('../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs');

// G1 — Armour semantic split and Infuse exclusion.
try{
  const plug=(hash,name,category,description='')=>({hash,name,description,definition:{plug:{plugCategoryIdentifier:category}}});
  const result=semantics.normaliseArmourSemantics({
    instance:{gearTier:5,energy:{energyType:1,energyTypeHash:2,energyCapacity:10,energyUsed:7}},
    plugs:[
      plug(1,'Infuse','armor.infusion'),
      plug(2,'Armour Masterwork Level 5','armor.masterworks'),
      plug(3,'General Mod','armor.mods.general'),
      plug(4,'General Mod 2','armor.mods.general'),
      plug(5,'Helmet Mod','armor.mods.helmet'),
      {...plug(5,'Helmet Mod','armor.mods.helmet'),socketIndex:5},
      {...plug(5,'Helmet Mod','armor.mods.helmet'),socketIndex:6},
      plug(6,'Bulwark','armor.masterworks.archetype'),
      plug(7,'Close Enough Exotic Armour Perk','armor.exotic.perk')
    ]
  });
  if(result.tier!==5)fail('G1: gear tier not normalized');
  if(result.energy?.capacity!==10||result.energy?.used!==7)fail('G1: energy budget not normalized');
  if(result.generalMods.length!==2||result.slotMods.length!==3)fail('G1: General/slot mods not separated or stacked socketed mods collapsed');
  if(!result.masterwork||!result.archetype||!result.exoticPerk)fail('G1: armour intrinsic families missing');
  if(result.discarded.length!==1||result.discarded[0].semanticRole!=='infuse')fail('G1: Infuse not excluded explicitly');
}catch(error){fail(`G1 threw: ${error.message}`);}

// G1b — Cached live profiles can recover mods from Bungie's display types
// even when the original network payload/category metadata is unavailable.
try{
  const cachedPlug=(hash,name,itemTypeDisplayName)=>({hash,name,itemTypeDisplayName,definition:{}});
  const result=semantics.normaliseArmourSemantics({plugs:[
    cachedPlug(101,'Weapons +5','General Armor Mod'),
    cachedPlug(102,'Health +5','General Armor Mod'),
    cachedPlug(103,'Targeting Mod','Helmet Armor Mod'),
    cachedPlug(104,'Ammo Finder','Helmet Armor Mod'),
    cachedPlug(105,'Siphon Mod','Helmet Armor Mod'),
    cachedPlug(106,'Gunner','Armor Archetype')
  ]});
  if(result.generalMods.length!==2||result.slotMods.length!==3||result.archetype?.name!=='Gunner')fail('G1b: cached Bungie display types did not recover the exact 2+3 mod contract and armour overlay');
}catch(error){fail(`G1b threw: ${error.message}`);}

// G2 — Exact equipable set identity and activation thresholds.
try{
  const itemDefinition={equippingBlock:{equipableItemSetHash:500}};
  const payload={
    equipableItemSets:{
      '500':{hash:500,displayProperties:{name:'Luminopotent'},setPerks:[
        {requiredSetCount:2,sandboxPerkHash:2002},
        {requiredSetCount:4,sandboxPerkHash:2004}
      ]}
    },
    sandboxPerks:{
      '2002':{hash:2002,displayProperties:{name:'Ionic Overclock',description:'While Amplified, gain benefits.'}},
      '2004':{hash:2004,displayProperties:{name:'Shock and Clear',description:'Jolted final blows create an Ionic Trace.'}}
    }
  };
  const twoPieces=Array.from({length:2},(_,index)=>({hash:100+index,definition:itemDefinition}));
  const two=sets.resolveArmourSet(payload,twoPieces[0],twoPieces);
  if(two.identity?.name!=='Luminopotent'||two.equippedCount!==2)fail('G2: exact set identity/count failed');
  if(two.twoPiece?.active!==true||two.fourPiece?.active!==false)fail('G2: 2/4 piece activation threshold failed at two pieces');
  const fourPieces=Array.from({length:4},(_,index)=>({hash:100+index,definition:itemDefinition}));
  const four=sets.resolveArmourSet(payload,fourPieces[0],fourPieces);
  if(four.fourPiece?.active!==true)fail('G2: four-piece set bonus did not activate at four pieces');
}catch(error){fail(`G2 threw: ${error.message}`);}

// G3 — Catalyst completion and equipped activation are separate.
try{
  const catalyst={hash:22,name:'Catalyst',isEnabled:true,definition:{plug:{plugCategoryIdentifier:'weapon.catalyst'}}};
  const profile={itemComponents:{plugObjectives:{data:{abc:{objectivesPerPlug:{'22':[{complete:false,progress:3,completionValue:100}]}}}}}};
  const result=semantics.normaliseWeaponSemantics({profile,item:{itemInstanceId:'abc'},plugs:[catalyst]});
  if(result.catalyst?.progress?.completed!==false||result.catalyst?.progress?.active!==false)fail('G3: incomplete catalyst received active credit');
}catch(error){fail(`G3 threw: ${error.message}`);}

// G3b — Every rendered weapon socket icon remains bound to its exact Bungie
// DestinyInventoryItemDefinition hash. Iconless definitions stay iconless.
try{
  const selected={hash:2401,bungieHash:2401,name:'Selected Trait',icon:'/common/wrong.png',definition:{displayProperties:{icon:'/common/selected-2401.png',iconHash:9401},plug:{plugCategoryIdentifier:'traits'}}};
  const alternative={hash:2402,bungieHash:2402,name:'Alternative Trait',definition:{displayProperties:{icon:'/common/alternative-2402.png'},plug:{plugCategoryIdentifier:'traits'}}};
  const result=semantics.normaliseWeaponSemantics({plugs:[selected],alternativeColumns:{3:[alternative]}});
  const normalised=result.selectedPerks[0],normalisedAlternative=result.alternativePerkColumns[0]?.options?.[0];
  if(normalised?.bungieHash!==2401||normalised?.iconHash!==9401||normalised?.iconItemHash!==2401||normalised?.icon!=='/common/selected-2401.png')fail('G3b: selected weapon perk lost its distinct item and icon definition hashes');
  if(normalisedAlternative?.bungieHash!==2402||normalisedAlternative?.iconHash!==null||normalisedAlternative?.iconItemHash!==2402)fail('G3b: alternative weapon perk must retain its item hash without inventing an icon hash');
  if(result.perkIconHashMap?.['2401']!=='/common/selected-2401.png'||result.perkIconHashMap?.['2402']!=='/common/alternative-2402.png')fail('G3b: weapon perk hash→icon model is incomplete');
  const invalid=semantics.normaliseWeaponSemantics({plugs:[{hash:'not-a-hash',icon:'/common/guessed.png',definition:{plug:{plugCategoryIdentifier:'traits'}}}]});
  if(invalid.selectedPerks.length||invalid.perkIconHashMap?.['not-a-hash']||invalid.unknownPlugs.length!==1)fail('G3b: hashless weapon perk received a guessed icon identity');
  const audit=JSON.parse(await readFile(new URL('../data/paradox-weapon-audit-report.json',import.meta.url),'utf8'));
  if(!audit.manifestVersion||!audit.counts.weapons||audit.counts.references!==audit.counts.resolvedReferences||audit.unresolvedReferences.length)fail('G3b: current exhaustive weapon manifest audit contains unresolved references');
  const uiSource=await readFile(new URL('../pages/guardian-workspace-v2/guardian-semantic-ui.mjs',import.meta.url),'utf8')+'\n'+await readFile(new URL('../pages/guardian-workspace-v2/guardian-weapon-presentation.mjs',import.meta.url),'utf8');
  if(!/data-bungie-hash/.test(uiSource)||!/hashAttribute\(perk\)/.test(uiSource)||!/hashAttribute\(semantics\.intrinsic\)/.test(uiSource))fail('G3b: weapon perk/intrinsic DOM icons do not expose their Bungie hash');
}catch(error){fail(`G3b threw: ${error.message}`);}

// G3c — Weapon perks are modeled in stable socket-column order with the exact
// number of rows allowed by the verified weapon tier. Exotic weapon traits
// remain subordinate to the intrinsic instead of being flattened as mods.
try{
  const perk=(hash,name,socketIndex,category='traits',socketName='Weapon Perks')=>({hash,bungieHash:hash,name,socketIndex,definition:{displayProperties:{name,icon:`/common/${hash}.png`},plug:{plugCategoryIdentifier:category}},socketCategoryDefinition:{displayProperties:{name:socketName}}});
  const intrinsic=perk(2500,'Command Frame IV',0,'intrinsics','Intrinsic Traits');
  const selectedBarrel=perk(2501,'Fluted Barrel',1,'barrels');
  const selectedTrait=perk(2511,'Destabilizing Rounds Retrofit',3,'traits','Weapon Mods');
  const result=semantics.normaliseWeaponSemantics({
    item:{itemInstanceId:'tier-five-exotic'},
    itemDefinition:{resolvedSandboxPerks:[
      {hash:2600,displayProperties:{name:'Command Frame IV',description:'Verified intrinsic frame.',icon:'/common/2600.png'}},
      {hash:2601,displayProperties:{name:'Choir of One',description:'Verified Exotic weapon trait.',icon:'/common/2601.png'}}
    ]},
    instance:{gearTier:5},
    isExotic:true,
    plugs:[intrinsic,selectedBarrel,selectedTrait],
    alternativeColumns:{
      1:[selectedBarrel,perk(2502,'Arrowhead Brake',1,'barrels'),perk(2503,'Corkscrew Rifling',1,'barrels')],
      3:[perk(2510,'Repulsor Brace',3,'traits','Weapon Mods'),selectedTrait,perk(2512,'Onslaught Retrofit',3,'traits','Weapon Mods')]
    }
  });
  if(result.perkRowCount!==3||result.perkRows.length!==3)fail('G3c: Tier 5 weapon did not produce exactly three perk rows');
  if(result.perkModel.columns.map(column=>column.socketIndex).join(',')!=='1,3')fail('G3c: weapon perk columns did not preserve Bungie socket order');
  if(result.perkRows[0]?.slots?.[0]?.perk?.name!=='Fluted Barrel'||result.perkRows[1]?.slots?.[1]?.perk?.name!=='Destabilizing Rounds Retrofit')fail('G3c: perk alternatives were not integrated into the tier row model');
  if(!result.perkRows[0]?.slots?.[0]?.isSelected||!result.perkRows[1]?.slots?.[1]?.isSelected)fail('G3c: selected perks lost their exact modeled row positions');
  if(result.intrinsic?.hash!==2500||result.exoticTraits.map(row=>row.hash).join(',')!=='2600,2601')fail('G3c: distinct Bungie sandbox effects must remain beneath the intrinsic hierarchy even when names match');
  if(semantics.classifyWeaponPlug(selectedTrait)!=='perk')fail('G3c: definition-level Exotic trait was misclassified by the broad Weapon Mods socket title');
  if(semantics.weaponPerkRowCountForTier(5)!==3||semantics.weaponPerkRowCountForTier(4)!==2||semantics.weaponPerkRowCountForTier(3)!==2||[1,2].some(tier=>semantics.weaponPerkRowCountForTier(tier)!==1))fail('G3c: Tier 1–5 weapon row rules drifted');
  if([1,2,3,4,5].map(column=>semantics.weaponPerkColumnRowCountForTier(5,column)).join(',')!=='2,2,3,3,2')fail('G3c: Tier 5 visual perk columns must follow 2,2,3,3,2 rows');
  const tierFiveColumns=Array.from({length:5},(_,columnIndex)=>({socketIndex:columnIndex+10,options:Array.from({length:[2,2,3,3,2][columnIndex]},(_,rowIndex)=>perk(2700+(columnIndex*10)+rowIndex,`C${columnIndex+1} R${rowIndex+1}`,columnIndex+10,'traits'))}));
  const tierFiveModel=semantics.normaliseWeaponPerkModel({gearTier:5,selectedPerks:tierFiveColumns.map(column=>column.options[0]),alternativePerkColumns:tierFiveColumns});
  if(tierFiveModel.columns.map(column=>column.expectedRowCount).join(',')!=='2,2,3,3,2')fail('G3c: Tier 5 per-column row capacities were not retained in the model');
  if(tierFiveModel.rows[2].slots.map(slot=>Boolean(slot.perk)).join(',')!=='false,false,true,true,false')fail('G3c: Tier 5 third-row perks must appear only in visual columns 3 and 4');
  const levelBoost=perk(2800,'Empty Weapon Level Boost Socket',8,'weapon.level_boost','Weapon Mods'),killTracker=perk(2801,'Kill Tracker',9,'trackers','Weapon Perks'),infuse=perk(2802,'Infuse',0,'weapon.infusion','Weapon Mods');
  const separated=semantics.normaliseWeaponSemantics({instance:{gearTier:3},plugs:[levelBoost,killTracker,infuse],alternativeColumns:{8:[levelBoost],9:[killTracker]}});
  if(semantics.classifyWeaponPlug(levelBoost)!=='weapon-mod'||!separated.modSockets.some(row=>row.name==='Empty Weapon Level Boost Socket'))fail('G3c: Weapon Level Boost was not retained in the weapon-mod row');
  if(semantics.classifyWeaponPlug(killTracker)!=='perk'||!separated.perkModel.columns.some(column=>column.options.some(row=>row.name==='Kill Tracker')))fail('G3c: Kill Tracker did not remain in the weapon perk model');
  if(semantics.classifyWeaponPlug(infuse)!=='infuse'||separated.modSockets.some(row=>row.name==='Infuse')||separated.discarded.length!==1)fail('G3c: Infuse was not excluded from the functional weapon model');
  const uiSource=await readFile(new URL('../pages/guardian-workspace-v2/guardian-semantic-ui.mjs',import.meta.url),'utf8')+'\n'+await readFile(new URL('../pages/guardian-workspace-v2/guardian-weapon-presentation.mjs',import.meta.url),'utf8');
  if(!/function weaponPerkMatrixMarkup/.test(uiSource)||!/data-perk-row-count/.test(uiSource)||!/EXOTIC WEAPON TRAITS/.test(uiSource)||!/weaponTraitHierarchyMarkup/.test(uiSource))fail('G3c: tier matrix or Exotic trait hierarchy is missing from the semantic UI');
  if(/PARADOX PERK RECOMMENDATION/.test(uiSource)||/Verified Bungie Exotic weapon trait\./.test(uiSource))fail('G3c: redundant recommendation copy or invented generic Exotic trait text remains in the weapon details');
}catch(error){fail(`G3c threw: ${error.message}`);}

// G3d — Verified manifest descriptions can rank selectable perks without
// manufacturing effects, while a completed catalyst remains fixed evidence.
try{
  const option=(hash,name,description,socketIndex)=>({hash:String(hash),name,description,socketIndex,definition:{hash,displayProperties:{name,description}}});
  const grenade=option(2901,'Demolition Loop','Final blows with this weapon grant grenade energy.',3),reload=option(2902,'Fast Hands','Reloading after a final blow improves reload speed.',3),catalyst=option(2903,'Completed Catalyst','Final blows create an Orb of Power.',7);
  const advice=weaponAdvisor.adviseWeaponRoll({weapon:{itemHash:2900,itemInstanceId:'weapon-instance',selectedPerkHashes:['2902'],selectedPerks:[reload],perkColumns:[{socketIndex:3,options:[reload,grenade]}],fixedTraits:[catalyst],catalyst:{masterworked:true}},intelligence:{perks:{}},context:{desiredTokens:['grenade-energy','orb-of-power']}});
  if(!advice.hasVerifiedRecommendation||advice.best?.options?.[0]?.hash!=='2901')fail('G3d: verified Bungie perk descriptions did not rank the grenade-energy match');
  if(advice.fixedEvidence?.traitCount!==1||advice.fixedEvidence?.catalystMasterworked!==true)fail('G3d: completed Exotic catalyst was not retained as fixed recommendation evidence');
}catch(error){fail(`G3d threw: ${error.message}`);}

// G3e — Live changes are exact-item plans whose mutation phases remain blocked
// until every required authenticated capability is advertised.
try{
  const characterId='71001',weaponBuckets=[1498876634,2465295065,953998645],armourBuckets=[3448274439,3551918588,14239492,20886954,1585787867];
  const build={characterId,membershipId:'72001',membershipType:'3',characterClass:'hunter',weapons:weaponBuckets.map((bucketHash,index)=>({itemHash:73000+index,itemInstanceId:String(73100+index),bucketHash,source:{kind:'equipped',characterId}})),armour:armourBuckets.map((bucketHash,index)=>({itemHash:74000+index,itemInstanceId:String(74100+index),bucketHash,classType:1,source:{kind:'equipped',characterId}})),artifactConfiguration:{artifactHash:3000,selectedPerkHashes:[3001,3002]},armourModRecommendation:{decisions:[]}};
  const advice={stagedChanges:[{itemInstanceId:'73100',itemHash:73000,socketIndex:3,currentPlugHash:1,plugHash:2,source:'bungie-item-reusable-plugs',remoteInsertEvidence:'exact-item-reusable-plug',remoteSupported:true}]};
  const blocked=transferPlans.createLiveTransferPlan({build,advice});
  if(blocked.ready||blocked.phases.map(row=>row.key).join(',')!=='captureSnapshot,transferItems,equipItems,verifyEquipment,applyWeaponSockets,applyArmourMods,verifyFinalState')fail('G3e: incomplete route support did not preserve the split weapon/armour execution sequence');
  const supported=transferPlans.createLiveTransferPlan({build,advice,capabilities:{captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true}});
  if(!supported.ready||supported.executionPolicy!=='fresh-read-activity-check-transfer-equip-verify-weapon-sockets-armour-mods-final-readback'||supported.socketChanges.length!==1)fail('G3e: complete route support did not produce a ready exact-item plan');
  const compatibleOnly=transferPlans.createLiveTransferPlan({build,advice:{stagedChanges:[{...advice.stagedChanges[0],source:'bungie-profile-plug-set',remoteInsertEvidence:'compatible-plug-set',remoteSupported:false}]},capabilities:{captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true}});
  if(!compatibleOnly.ready||compatibleOnly.socketChanges.length||!compatibleOnly.inGameSteps.some(row=>row.includes('not verified as a free remote insertion')))fail('G3e: compatible-only plug-set evidence was not preserved as an explicit in-game step');
}catch(error){fail(`G3e threw: ${error.message}`);}

// G4 — Stat threshold is above 100, not merely at 100.
try{
  const stats=semantics.normaliseGuardianStats([['Grenade',110],['Weapons',105],['Health',100],['Class',95]]);
  if(!stats.Grenade.enhancedThresholdReached||!stats.Weapons.enhancedThresholdReached)fail('G4: >100 threshold missed');
  if(stats.Health.enhancedThresholdReached||stats.Class.enhancedThresholdReached)fail('G4: <=100 incorrectly marked enhanced');
}catch(error){fail(`G4 threw: ${error.message}`);}

// G5 — Artifact model keeps exactly the applied active perks presented to it.
try{
  const activePerks=Array.from({length:7},(_,index)=>({hash:3000+index,definition:{hash:3000+index}}));
  const result=semantics.validateArtifact({activePerks});
  if(result.activeCount!==7||result.uniqueActiveCount!==7||!result.noDuplicateActiveHashes)fail('G5: Artifact 7/7 integrity failed');
}catch(error){fail(`G5 threw: ${error.message}`);}

// G6 — Live adapter may use resolved perks, but cannot credit inactive catalysts.
try{
  const liveDetail={
    source:'bungie-live',characterId:'guardian-1',selectedLoadoutIndex:0,
    aspects:[],fragments:[],artifact:{activePerks:[{hash:31,name:'Applied Artifact',definition:{hash:31}}]},
    weapons:[{
      hash:40,name:'Weapon',description:'',
      weaponSemantics:{selectedPerks:[{hash:41,name:'Verified perk',description:'',definition:{hash:41}}]},
      catalyst:{hash:42,name:'Incomplete Catalyst',description:'grants jolt',definition:{hash:42},progress:{completed:false,active:false}}
    }],
    paradoxEvidence:{armour:[],artifact:[]},hashCoverage:{},statModel:{}
  };
  const adapted=live.adaptLiveGuardian(liveDetail);
  if(adapted.artifact?.perks?.length!==1)fail('G6: active Artifact perk not adapted');
  if(adapted.weapons?.[0]?.resolvedPerks?.some(row=>Number(row.perkHash)===42))fail('G6: inactive catalyst entered live engine evidence');
  if(!adapted.weapons?.[0]?.resolvedPerks?.some(row=>Number(row.perkHash)===41))fail('G6: resolved selected weapon perk missing');
  const analysis=live.analyzeLiveGuardian(liveDetail);
  if(analysis?.source!=='paradox-live-deterministic-engine'||analysis?.evidenceSource!=='bungie-live-resolved-only')fail('G6: live deterministic analysis contract failed');
}catch(error){fail(`G6 threw: ${error.message}`);}

// G7 — Unknown socket classifications remain unknown and incomplete.
try{
  const unknown={hash:999,name:'Mystery Socket',definition:{plug:{plugCategoryIdentifier:'future.unknown'}}};
  const result=semantics.normaliseArmourSemantics({plugs:[unknown]});
  if(result.complete||result.unknownPlugs.length!==1||result.generalMods.length||result.slotMods.length)fail('G7: unknown evidence was silently classified');
}catch(error){fail(`G7 threw: ${error.message}`);}

if(failures.length){
  console.error('GUARDIAN SEMANTIC VALIDATION FAILED:');
  failures.forEach(row=>console.error(`  ✗ ${row}`));
  process.exit(1);
}
console.log('GUARDIAN SEMANTIC VALIDATION PASSED.');
