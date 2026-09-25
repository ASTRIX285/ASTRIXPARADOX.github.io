#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {classifyArmourPlug,normaliseArmourSemantics} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {createLiveTransferPlan,subclassCompatibilityViolations} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {createLiveTransferPreflight} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {filterManualEquipmentSources,eligibleEquipment,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice,recordManualEdit,socketGroups} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import {createBuildState,createWorkingBuildPatch,createBuildPersistenceSnapshot,restoreBuildPersistenceSnapshot} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {cacheBuildForgeState,readBuildForgeState} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';
import {compactBuild,createParadoxLoadoutRecord,validateParadoxLoadoutRecord} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs';
import {characterActivityRestriction,confirmBungieLoadoutAction,confirmLiveTransferPlan,confirmPostmasterCollectionIntent,confirmVaultTransferIntent,executeBungieLoadoutAction,executeLiveTransferPlan,inventoryLocations,verifyReadback,sessionBinding,executePostmasterCollectionIntent,executeVaultTransferIntent,stageBungieLoadoutAction,stageLiveTransferPreflight,stagePostmasterCollectionIntent,stageVaultTransferIntent} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs';
import {INVENTORY_GROUPS,inventoryGroupsMarkup,inventoryItemMarkup,itemState} from '../shared/guardian-inventory-workspace.mjs';
import {resolveBreakerTypeDefinition} from '../core/bungie-item-identity.mjs';

const CHARACTER_ID='9100001';
const MEMBERSHIP_ID='9200001';
const MEMBERSHIP_TYPE='3';
const WEAPON_BUCKETS=[1498876634,2465295065,953998645];
const ARMOUR_BUCKETS=[3448274439,3551918588,14239492,20886954,1585787867];
const VAULT_BUCKET=138197802;
const clone=value=>structuredClone(value);
const response=(payload,{ok=true,status=200}={})=>({ok,status,json:async()=>payload});
const perk=(hash,name,{source='bungie-item-reusable-plugs',evidence='exact-item-reusable-plug'}={})=>({
  hash,itemHash:hash,bungieHash:hash,name,socketIndex:3,canInsert:true,enabled:true,source,remoteInsertEvidence:evidence,
  definition:{displayProperties:{name},plug:{plugCategoryIdentifier:'weapon.perks.traits'}}
});
const currentPerk=perk(8100,'Current Trait');
const exactPerk=perk(8101,'Exact Reusable Trait');
const compatibleOnlyPerk=perk(8102,'Compatible In-Game Trait',{source:'bungie-profile-plug-set',evidence:'compatible-plug-set'});
const armourMod=(hash,name)=>({hash,itemHash:hash,bungieHash:hash,name,socketIndex:2,canInsert:true,enabled:true,source:'bungie-item-reusable-plugs',remoteInsertEvidence:'exact-item-reusable-plug',energyCost:1,definition:{displayProperties:{name},plug:{plugCategoryIdentifier:'armor.mods.helmet',energyCost:1}}});
const currentArmourMod=armourMod(8200,'Current Armour Mod');
const exactArmourMod=armourMod(8201,'Exact Armour Mod');
const ownedSource={kind:'equipped',characterId:CHARACTER_ID};

const weapons=WEAPON_BUCKETS.map((bucketHash,index)=>({
  itemHash:11000+index,hash:11000+index,itemInstanceId:String(11100+index),name:`Weapon ${index+1}`,bucketHash,source:ownedSource,
  ...(index===0?{socketCoverage:{complete:true,plugs:[currentPerk]},socketOptions:{3:[currentPerk,exactPerk,compatibleOnlyPerk]},selectedPerks:[currentPerk],weaponSemantics:{gearTier:3,selectedPerks:[currentPerk],alternativePerkColumns:[{socketIndex:3,options:[currentPerk,exactPerk,compatibleOnlyPerk]}]}}:{})
}));
const armour=ARMOUR_BUCKETS.map((bucketHash,index)=>({itemHash:12000+index,hash:12000+index,itemInstanceId:String(12100+index),name:`Armour ${index+1}`,bucketHash,classType:1,source:ownedSource,...(index===0?{energy:{capacity:10,used:1},socketCoverage:{complete:true,plugs:[currentArmourMod]},armourModOptions:{2:[currentArmourMod,exactArmourMod]},slotMods:[currentArmourMod],armourSemantics:{energy:{capacity:10,used:1},generalMods:[],slotMods:[currentArmourMod]}}:{})}));
const baseBuild={
  source:'bungie-live',characterId:CHARACTER_ID,membershipId:MEMBERSHIP_ID,membershipType:MEMBERSHIP_TYPE,characterClass:'hunter',
  weapons,armour,artifact:{name:'Seasonal Artifact',activePerks:[{hash:9001,isActive:true}]},artifactConfiguration:{artifactHash:9000,selectedPerkHashes:[9002]}
};

const sameItemBuild=clone(baseBuild);
stageEquipmentChoice(sameItemBuild,'weapon',0,sameItemBuild.weapons[0]);
assert.equal(sameItemBuild.manualEdits,undefined,'Selecting the already staged exact item must be a no-op.');

const replacement={itemHash:13001,hash:13001,itemInstanceId:'13101',name:'Vault Energy Weapon',bucketHash:WEAPON_BUCKETS[1],source:{kind:'vault',characterId:null}};
const equipmentBuild=clone(baseBuild);
stageEquipmentChoice(equipmentBuild,'weapon',1,replacement);
assert.equal(equipmentBuild.weapons[1].itemInstanceId,replacement.itemInstanceId,'A verified exact owned item must stage without Generate.');
assert.equal(equipmentBuild.editMode,'manual');
assert.equal(equipmentBuild.manualEdits.at(-1).component,'weapon');
assert.throws(()=>stageEquipmentChoice(clone(baseBuild),'weapon',1,{...replacement,bucketHash:WEAPON_BUCKETS[2]}),/does not belong/,'A mismatched equipment bucket must be rejected.');
assert.throws(()=>stageEquipmentChoice({...clone(baseBuild),weapons:[{...weapons[0],isExotic:true},...clone(weapons.slice(1))]},'weapon',1,{...replacement,isExotic:true}),/only one Exotic weapon/,'A second Exotic weapon must be rejected.');
assert.deepEqual(eligibleEquipment([replacement,{...armour[0],itemInstanceId:'13102',bucketHash:WEAPON_BUCKETS[0]}],baseBuild,'weapon',1).map(row=>row.itemInstanceId),['13101'],'Manual choices must stay inside the requested equipment bucket.');
const activeCarried={...replacement,itemInstanceId:'13103',source:{kind:'carried',characterId:CHARACTER_ID}},otherCharacterEquipped={...replacement,itemInstanceId:'13104',source:{kind:'equipped',characterId:'other-character'}},postmasterItem={...replacement,itemInstanceId:'13105',source:{kind:'postmaster',characterId:CHARACTER_ID}};
assert.deepEqual(filterManualEquipmentSources([replacement,activeCarried,otherCharacterEquipped,postmasterItem],CHARACTER_ID).map(row=>row.itemInstanceId),['13101','13103'],'Manual candidates must contain only Vault plus the active Guardian’s carried/equipped items.');
assert.throws(()=>stageEquipmentChoice(clone(baseBuild),'weapon',1,otherCharacterEquipped),/limited to this Guardian/,'An item equipped on a different Guardian must not be stageable in the manual editor.');

const exactSocketBuild=clone(equipmentBuild);
stageSocketChoice(exactSocketBuild,'weapon',0,3,exactPerk);
assert.equal(exactSocketBuild.weapons[0].socketCoverage.plugs.find(row=>row.socketIndex===3).hash,exactPerk.hash);
assert.equal(exactSocketBuild.manualSocketChanges[0].remoteSupported,true,'Only exact-item reusable-plug evidence may stage a remote socket action.');
assert.equal(exactSocketBuild.manualEdits.at(-1).component,'weapon-socket');
stageSocketChoice(exactSocketBuild,'armour',0,2,exactArmourMod);
assert.equal(exactSocketBuild.armour[0].socketCoverage.plugs.find(row=>row.socketIndex===2).hash,exactArmourMod.hash);
assert.equal(exactSocketBuild.manualEdits.at(-1).component,'armour-socket');

const inGameSocketBuild=clone(equipmentBuild);
stageSocketChoice(inGameSocketBuild,'weapon',0,3,compatibleOnlyPerk);
assert.equal(inGameSocketBuild.manualSocketChanges[0].remoteSupported,false,'A compatible plug-set choice must remain an explicit in-game step.');

const broadOwnedCatalogue=Array.from({length:120},(_,index)=>({...replacement,itemInstanceId:String(15000+index),name:`Owned weapon ${index}`}));
const persistenceState=createBuildState({...baseBuild,ownedWeapons:broadOwnedCatalogue});
const workingPatch=createWorkingBuildPatch(persistenceState.workingBuild);
assert.strictEqual(workingPatch.ownedWeapons,persistenceState.workingBuild.ownedWeapons,'A representative manual edit must structurally share the untouched owned catalogue.');
assert.notStrictEqual(workingPatch.subclassBuild,persistenceState.workingBuild.subclassBuild,'The editable subclass root must receive its own immutable patch.');
workingPatch.weapons=[...workingPatch.weapons];workingPatch.weapons[1]=clone(replacement);
const persistenceSnapshot=createBuildPersistenceSnapshot({...persistenceState,workingBuild:workingPatch}),buildStateRecords=new Map(),persistenceBinding={characterId:CHARACTER_ID,membershipId:MEMBERSHIP_ID,membershipType:MEMBERSHIP_TYPE},persistenceIo={writeRecord:async record=>{buildStateRecords.set(record.key,clone(record));return true;},readRecord:async key=>clone(buildStateRecords.get(key)||null)},persistedAt=Date.now();
assert.equal(await cacheBuildForgeState(persistenceBinding,persistenceSnapshot,{...persistenceIo,now:()=>persistedAt}),true);
const refreshedSnapshot=await readBuildForgeState(persistenceBinding,{...persistenceIo,now:()=>persistedAt+1000}),restoredPersistence=restoreBuildPersistenceSnapshot(refreshedSnapshot);
assert.equal(persistenceSnapshot.workingPatch.ownedWeapons,undefined,'Compact persistence must write the broad owned catalogue only once.');
assert.equal(persistenceSnapshot.originalBuild.ownedWeapons.length,broadOwnedCatalogue.length);
assert.equal(restoredPersistence.workingBuild.weapons[1].itemInstanceId,replacement.itemInstanceId,'The compact async-persistence payload must restore the staged manual item after refresh.');
assert.ok(JSON.stringify(persistenceSnapshot).length<JSON.stringify({...persistenceState,workingBuild:workingPatch}).length,'The compact persistence record must be smaller than the former full Original + Working snapshot.');

const originalAbility={...perk(8110,'Original Grenade'),socketIndex:7,componentType:'grenade'};
const switchedAbility={...perk(8111,'New Subclass Grenade'),socketIndex:7,componentType:'grenade'};
const switchedSubclassBuild={...clone(equipmentBuild),subclass:'void',subclassName:'Void Hunter',subclassItemInstanceId:'14101',subclassItem:{itemHash:14001,hash:14001,itemInstanceId:'14101',name:'Void Hunter',bucketHash:3284755031,classType:1,source:{kind:'carried',characterId:CHARACTER_ID}},subclassBuild:{abilities:[originalAbility],aspects:[],fragments:[]}};
switchedSubclassBuild.subclassBuild.abilities=[switchedAbility];stageSubclassSocketChoice(switchedSubclassBuild,originalAbility,switchedAbility,'ability');
const switchedPlan=createLiveTransferPlan({build:switchedSubclassBuild,originalBuild:baseBuild,capabilities:{captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true}});
assert.ok(switchedPlan.equipment.targets.some(row=>row.kind==='subclass'&&row.itemInstanceId==='14101'),'A switched exact subclass instance must enter the equipment target set.');
assert.ok(switchedPlan.socketChanges.some(row=>row.itemInstanceId==='14101'&&row.plugHash===switchedAbility.hash),'Manual sockets edited after a subclass switch must enter the exact Apply ledger.');

const catalogueOnlySubclassBuild={...clone(baseBuild),subclass:'void',subclassName:'Nightstalker',subclassCatalog:[{hash:2328211300,name:'Arcstrider',element:'arc',definition:{itemType:16}},{hash:2453351420,name:'Nightstalker',element:'void',itemInstanceId:'14102',bucketHash:3284755031,classType:1,source:{kind:'carried',characterId:CHARACTER_ID},definition:{itemType:16,inventory:{bucketTypeHash:3284755031}}}],subclassBuild:{abilities:[],aspects:[],fragments:[]}};
const catalogueOnlySubclassPlan=createLiveTransferPlan({build:catalogueOnlySubclassBuild,originalBuild:catalogueOnlySubclassBuild,capabilities:{captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true}});
assert.equal(catalogueOnlySubclassPlan.ready,true,catalogueOnlySubclassPlan.blockers.join(' | '));
assert.ok(catalogueOnlySubclassPlan.equipment.targets.some(row=>row.kind==='subclass'&&row.itemInstanceId==='14102'),'Apply must resolve the selected exact subclass from the live catalogue when the compact snapshot lacks a top-level subclass instance field.');
const placeholderSubclassBuild={...clone(baseBuild),subclass:'void',subclassName:'Nightstalker',subclassCatalog:[{hash:2328211300,name:'Arcstrider',element:'arc',definition:{itemType:16}},{hash:2453351420,name:'Nightstalker',element:'void',definition:{itemType:16}}],subclassBuild:{abilities:[],aspects:[],fragments:[]}};
const placeholderSubclassPlan=createLiveTransferPlan({build:placeholderSubclassBuild,originalBuild:placeholderSubclassBuild,capabilities:{captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true}});
assert.equal(placeholderSubclassPlan.ready,true,placeholderSubclassPlan.blockers.join(' | '));
assert.equal(placeholderSubclassPlan.equipment.targets.some(row=>row.kind==='subclass'),false,'A catalogue placeholder without an owned instance must not become a false subclass equipment target or block Apply.');

const preflight=createLiveTransferPreflight(exactSocketBuild);
assert.equal(preflight.ready,true,preflight.violations.join(' | '));
assert.equal(preflight.mode,'manual-working-build','Manual Apply must not require a generated recommendation.');
const overCapacityBuild=clone(exactSocketBuild);overCapacityBuild.armour[0].energy={capacity:5};overCapacityBuild.armour[0].generalMods=[{name:'Four Energy',energyCost:4}];overCapacityBuild.armour[0].slotMods=[{name:'Three Energy',energyCost:3}];
const overCapacityPreflight=createLiveTransferPreflight(overCapacityBuild);
assert.equal(overCapacityPreflight.ready,false,'A manual armour-mod selection above the item energy capacity must block Apply.');
assert.match(overCapacityPreflight.violations.join(' | '),/uses 7\/5 armour energy/);
const capabilities={captureSnapshot:true,transferItems:true,equipItems:true,verifyEquipment:true,insertSocketPlugFree:true,verifyFinalState:true};
// Real subclass shape: four equipped Fragments and two identical unused plugs.
// The hash values here are synthetic; the empty-plug label is Bungie's label.
const emptyFragment={hash:8500,name:'Empty Fragment Socket'};
const fragmentBuild={...clone(switchedSubclassBuild),subclassBuild:{
  aspects:[{hash:8501,name:'Aspect A',fragmentSlots:2},{hash:8502,name:'Aspect B',fragmentSlots:2}],
  fragments:[...Array.from({length:4},(_,i)=>({hash:8510+i,name:`Fragment ${i}`,socketIndex:10+i})),{...emptyFragment,socketIndex:14},{...emptyFragment,socketIndex:15}]
}};
assert.deepEqual(subclassCompatibilityViolations(fragmentBuild),[],'Unused plugs are neither duplicate Fragments nor occupied Fragment slots');
const fragmentPlan=createLiveTransferPlan({build:fragmentBuild,originalBuild:fragmentBuild,capabilities});
assert.equal(fragmentPlan.ready,true,fragmentPlan.blockers.join(' | '));
assert.equal(fragmentBuild.subclassBuild.fragments.length,6,'Validation must preserve exact saved sockets');
const duplicateFragmentBuild=clone(fragmentBuild);duplicateFragmentBuild.subclassBuild.fragments[1].hash=8510;
assert.match(subclassCompatibilityViolations(duplicateFragmentBuild).join(' '),/same Fragment more than once/,'A real duplicate must still block Apply');
const overfilledFragments=clone(fragmentBuild);overfilledFragments.subclassBuild.fragments[4]={hash:8514,name:'Fifth Fragment',socketIndex:14};
assert.match(subclassCompatibilityViolations(overfilledFragments).join(' '),/4 Fragment slots, but 5 Fragments/,'Real occupied slots must still respect Aspect capacity');
const unknownDuplicate=clone(fragmentBuild);for(const plug of unknownDuplicate.subclassBuild.fragments.slice(4))plug.name='Unresolved plug';
assert.match(subclassCompatibilityViolations(unknownDuplicate).join(' '),/same Fragment/,'Unknown duplicate hashes must not be silently treated as empty');
const mislabelledDuplicate=clone(fragmentBuild);for(const plug of mislabelledDuplicate.subclassBuild.fragments.slice(4))plug.definition={displayProperties:{name:'Actual Fragment'}};
assert.match(subclassCompatibilityViolations(mislabelledDuplicate).join(' '),/same Fragment/,'An official Fragment name must override a stale empty label');
assert.deepEqual(subclassCompatibilityViolations({subclassBuild:{aspects:[{hash:8520,name:'Empty Aspect Socket'},{hash:8520,name:'Empty Aspect Socket'}]}}),[]);
const duplicateAspectBuild=clone(fragmentBuild);duplicateAspectBuild.subclassBuild.aspects[1].hash=8501;
assert.match(subclassCompatibilityViolations(duplicateAspectBuild).join(' '),/same Aspect/);
const clearingBuild=clone(fragmentBuild);
clearingBuild.manualSocketChanges=[{itemInstanceId:clearingBuild.subclassItemInstanceId,socketIndex:14,plugHash:emptyFragment.hash,plugName:emptyFragment.name,remoteSupported:true,reversible:true}];
assert.ok(createLiveTransferPlan({build:clearingBuild,originalBuild:fragmentBuild,capabilities}).socketChanges.some(row=>row.plugHash===emptyFragment.hash),'An explicitly selected empty plug must remain actionable to clear its exact socket');
const plan=createLiveTransferPlan({build:exactSocketBuild,originalBuild:baseBuild,capabilities});
assert.equal(plan.ready,true,plan.blockers.join(' | '));
assert.equal(plan.status,'staged');
assert.equal(plan.transfers.length,1,'The plan must transfer the selected Vault item before equipping.');
assert.equal(plan.socketChanges.length,2,'The exact weapon and armour socket choices must remain remotely actionable.');
assert.deepEqual(plan.phases.filter(phase=>['applyWeaponSockets','applyArmourMods'].includes(phase.key)).map(phase=>[phase.key,phase.changes,phase.status]),[['applyWeaponSockets',1,'supported'],['applyArmourMods',1,'supported']],'Weapon sockets and armour mods must be separate labelled Apply phases.');
assert.ok(plan.inGameSteps.some(step=>step.includes('Seasonal Artifact')),'Unsupported Artifact configuration must be retained as an explicit in-game step.');

const saved=createParadoxLoadoutRecord({name:'Manual Hunter Test',description:'Independent browser-only copy',build:{...exactSocketBuild,loadoutActionIntent:'save-paradox-copy',ownedWeapons:Array.from({length:100},()=>replacement)}});
assert.equal(saved.binding.characterId,CHARACTER_ID);
assert.equal(saved.summary.manualEditCount,3);
assert.equal(saved.build.ownedWeapons,undefined,'Broad account catalogues must not be duplicated inside named PARADOX records.');
assert.equal(saved.build.loadoutActionIntent,undefined,'One-time Bungie menu intents must not reopen inside a durable PARADOX record.');
assert.equal(saved.build.manualSocketChanges[0].plugHash,exactPerk.hash,'Manual socket provenance must survive a PARADOX save.');
assert.equal(validateParadoxLoadoutRecord(saved)?.id,saved.id);
assert.equal(compactBuild(exactSocketBuild).source,'paradox-saved-loadout');

const session={
  authenticated:true,csrfToken:'csrf-test',activeDestinyMembership:{membershipId:MEMBERSHIP_ID,membershipType:Number(MEMBERSHIP_TYPE)},
  capabilities:{destinyActions:{...capabilities,pullFromPostmaster:true,equipLoadout:true,snapshotLoadout:true,updateLoadoutIdentifiers:true,clearLoadout:true}}
};
const sharedTile={...replacement,itemInstanceId:'13109',icon:'https://www.bungie.net/weapon.png',state:5,gearTier:5,equipmentGroup:INVENTORY_GROUPS.find(group=>group.key==='special'),power:550,quantity:2,releaseWatermark:{icon:'/season.png'},weaponSemantics:{intrinsic:{hash:14001,name:'Adaptive Frame',icon:'/adaptive.png'}},breakerDefinition:{hash:485622768,displayProperties:{name:'Barrier',icon:'/barrier.png'}},elementDefinition:{hash:2302094943,displayProperties:{name:'Arc',icon:'/arc.png'}},source:{kind:'vault',characterId:null}};
const breakerDefinitions={
  '485622768':{hash:485622768,enumValue:1,displayProperties:{name:'Shield Piercing',icon:'/barrier.png'}},
  '2611060930':{hash:2611060930,enumValue:2,displayProperties:{name:'Disruption',icon:'/overload.png'}},
  '3178805705':{hash:3178805705,enumValue:3,displayProperties:{name:'Stagger',icon:'/unstoppable.png'}}
};
assert.equal(resolveBreakerTypeDefinition({breakerTypeHash:0,breakerType:2},{},breakerDefinitions),breakerDefinitions['2611060930'],'A live breaker enum must resolve the genuine Bungie champion definition when its nullable hash is zero.');
assert.equal(resolveBreakerTypeDefinition({breakerTypeHash:0},{breakerTypeHash:485622768},breakerDefinitions),breakerDefinitions['485622768'],'An invalid zero instance hash must not mask a genuine item-definition breaker hash.');
assert.equal(resolveBreakerTypeDefinition({breakerTypeHash:0},{breakerTypeHash:0,breakerType:3},breakerDefinitions),breakerDefinitions['3178805705'],'A genuine item-definition breaker enum must resolve the Bungie champion definition when both nullable hashes are zero.');
assert.deepEqual(itemState(sharedTile),{raw:5,locked:true,masterworked:true},'The shared tile must derive locked and masterwork overlays from Bungie item state bits.');
const sharedTileMarkup=inventoryItemMarkup(sharedTile,{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(sharedTileMarkup,/class="item-tile item-tile--weapon item-tile--legendary item-tile--tier-5 item-tile--masterworked"/,'Legendary rarity, verified T5 and masterwork must remain independent shared tile classes.');
assert.match(sharedTileMarkup,/class="tile-lock" aria-label="Locked"/,'The shared tile must render the real locked state as an icon-only art overlay.');
assert.match(sharedTileMarkup,/class="tile-tier-strip" aria-label="Tier 5 masterworked"/,'The shared tile must expose its real T5 and masterwork state on the tier strip.');
assert.equal([...sharedTileMarkup.matchAll(/class="tile-tier-pip tile-tier-pip--\d tile-tier-pip--gold"/g)].length,5,'A verified T5 tile must render five solid gold diamonds.');
assert.match(sharedTileMarkup,/class="tile-power"[^>]*><b>550<\/b>/,'The weapon power readout must keep the real power value without duplicating its separate element socket.');
assert.match(sharedTileMarkup,/class="tile-corner-badge"[^>]*><img[^>]*\/adaptive\.png/,'The weapon corner badge must use the resolved Bungie intrinsic icon.');
assert.match(sharedTileMarkup,/class="tile-breaker"[^>]*><img[^>]*\/barrier\.png/,'The weapon champion socket must use the resolved Bungie breaker definition icon.');
assert.match(sharedTileMarkup,/class="tile-breaker"[^>]*data-bungie-hash="485622768"/,'The champion icon must retain its exact Bungie breaker definition hash.');
const fallbackBreakerMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13116',breakerDefinition:{},championCapability:{definition:breakerDefinitions['2611060930']}},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(fallbackBreakerMarkup,/class="tile-breaker"[^>]*><img[^>]*\/overload\.png/,'An empty earlier breaker object must not mask a later resolved Bungie champion definition icon.');
assert.match(sharedTileMarkup,/class="tile-element"[^>]*><img[^>]*\/arc\.png/,'The weapon element socket must use the resolved Bungie damage definition icon.');
assert.match(sharedTileMarkup,/class="tile-footer">[\s\S]*class="tile-breaker"[\s\S]*class="tile-element"[\s\S]*class="tile-power"[\s\S]*<\/span>\s*<span class="tile-corner-badge"/,'Barrier, element and power must share the complete footer region.');
assert.match(sharedTileMarkup,/class="tile-season-icon"[^>]*><img[^>]*\/season\.png/,'The source socket must use the resolved Bungie release watermark icon.');
assert.match(sharedTileMarkup,/class="tile-art"><img[^>]*\/weapon\.png/,'The shared tile art must keep the real Bungie item icon source.');
assert.match(sharedTileMarkup,/title="Vault Energy Weapon"/,'The shared tile must expose only its item name through the native hover tooltip.');
assert.doesNotMatch(sharedTileMarkup,/vault-transfer-name|>EQUIPPED<|>LOCK</,'The shared tile must not restore permanent names or plain text state labels.');
assert.match(sharedTileMarkup,/data-double-click-transfer-item="13109"/,'An exact Vault instance must advertise immediate double-click transfer to the active Guardian.');
const exoticTileMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13112',isExotic:true,state:0,gearTier:4},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(exoticTileMarkup,/item-tile--exotic/,'Real Exotic rarity must apply the Exotic tile class.');
assert.doesNotMatch(exoticTileMarkup,/item-tile--masterworked|class="tile-lock"/,'An unlocked non-masterworked Exotic must not gain either independent state class or overlay.');
assert.match(exoticTileMarkup,/item-tile--tier-4/,'A real Bungie T4 value must apply the T4 tile class.');
assert.match(exoticTileMarkup,/class="tile-tier-strip" aria-label="Tier 4"/,'A non-masterworked T4 item must expose its verified tier.');
assert.equal([...exoticTileMarkup.matchAll(/class="tile-tier-pip tile-tier-pip--\d tile-tier-pip--purple"/g)].length,4,'A verified T4 tile must render four solid purple diamonds.');
assert.doesNotMatch(exoticTileMarkup,/tile-tier-pip--gold/,'T4 diamonds must never use the T5 gold treatment.');
const tierOneTileMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13115',state:0,gearTier:1},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.equal([...tierOneTileMarkup.matchAll(/class="tile-tier-pip tile-tier-pip--\d tile-tier-pip--purple"/g)].length,1,'A verified T1 tile must render one solid purple diamond.');
const armourTileMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13113',equipmentGroup:INVENTORY_GROUPS.find(group=>group.key==='helmet'),weaponSemantics:undefined,intrinsic:undefined,breakerDefinition:undefined,elementDefinition:undefined,setBonus:{identity:{name:'Verified Set',icon:'/set.png'}},armourSemantics:{archetype:{name:'Brawler',icon:'/brawler.png'}},isExotic:false},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(armourTileMarkup,/class="tile-corner-badge"[^>]*><img[^>]*\/brawler\.png/,'The armour corner badge must use the resolved Bungie armour archetype icon.');
assert.doesNotMatch(armourTileMarkup,/class="tile-corner-badge"[^>]*><img[^>]*\/set\.png/,'The armour set identity must not replace the requested archetype corner icon.');
assert.doesNotMatch(armourTileMarkup,/class="tile-power"[^>]*><img/,'The moved armour archetype must not be duplicated in the footer.');
assert.doesNotMatch(armourTileMarkup,/class="tile-breaker"|class="tile-element"/,'Weapon-only sockets must be absent from armour tile markup.');
const unresolvedSocketMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13114',state:0,gearTier:null,releaseWatermark:null,tierIcon:null,weaponSemantics:{},intrinsic:null,breakerDefinition:null,elementDefinition:null},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.doesNotMatch(unresolvedSocketMarkup,/class="tile-corner-badge"|class="tile-breaker"|class="tile-element"|class="tile-season-icon"/,'A socket without a proven real icon source must be absent, never replaced with invented content.');
assert.doesNotMatch(unresolvedSocketMarkup,/class="tile-tier-strip"|class="tile-tier-pip/,'An item without a real Bungie tier or masterwork state must not invent diamonds.');
const sharedTileCss=readFileSync(new URL('../shared/item-tile.css',import.meta.url),'utf8');
const sharedWorkspaceRuntime=readFileSync(new URL('../shared/guardian-inventory-workspace.mjs',import.meta.url),'utf8');
for(const selector of ['tile-art','tile-power','tile-corner-badge','tile-tier-strip','tile-tier-pip','tile-season-icon','tile-lock','tile-breaker','tile-element'])assert.match(sharedTileCss,new RegExp(`\\.vault-transfer-item\\.has-item-tile \\.${selector}`),`${selector} styling must stay scoped to the shared inventory tile.`);
assert.match(sharedTileCss,/\.tile-art img\s*\{[^}]*object-fit:\s*contain/s,'Real shared item art must render uncropped inside its proportional Figma region.');
assert.match(sharedTileCss,/\.tile-art img\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%/s,'Real shared item art must remain fully contained inside its designated region.');
// Intentional: Character uses DIM's square image plus power badge; other hosts keep their existing height and ratio.
assert.match(sharedTileCss,/height:\s*var\(--apx-tile-height,var\(--apx-icon-gear-art-height\)\);\s*aspect-ratio:\s*var\(--apx-inventory-ratio,100\/122\)/,'Character may supply the full DIM card height without changing other tile hosts');
assert.match(sharedTileCss,/\.tile-tier-strip\s*\{[^}]*top:\s*2\.00%;[^}]*height:\s*77\.90%;[^}]*border:\s*0;[^}]*background:\s*linear-gradient\([^}]*rgba\(5,4,7,\.38\)[^}]*rgba\(5,4,7,\.24\)/s,'The tier rail must restore the translucent Figma strip behind the season circle and complete diamond stack.');
assert.match(sharedTileCss,/\.tile-tier-pip::before\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--tile-tier-fill\)/s,'Tier diamonds must use solid fills with no strokes.');
assert.match(sharedTileCss,/\.item-tile--tier-5\s*\{[^}]*--tile-tier-fill:\s*#f3ee69/s,'Only verified T5 tiles must switch their five diamonds to gold.');
assert.match(sharedTileCss,/\.tile-tier-pip--1\s*\{top:21\.50%\}/,'The complete diamond formation must stay in its raised position below the season icon.');
assert.match(sharedTileCss,/\.tile-season-icon\s*\{[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%/s,'The real season icon must render inside the circle above the diamonds.');
assert.match(sharedTileCss,/\.tile-season-icon\s*\{[^}]*background:\s*rgba\(3,3,5,\.46\)/s,'The season circle must remain translucent over the restored Figma tier strip.');
assert.match(sharedTileCss,/\.tile-season-icon img\s*\{[^}]*width:\s*370%;[^}]*height:\s*370%;[^}]*object-position:\s*left top/s,'The genuine Bungie watermark canvas must be cropped to its top-left season emblem inside the circle.');
assert.match(sharedTileCss,/\.tile-footer\s*\{[^}]*display:\s*flex;[^}]*padding:/s,'The footer must distribute its real traits and power across the complete grey section.');
assert.match(sharedTileCss,/\.tile-breaker img\s*\{\s*filter: drop-shadow\(0 1px 2px rgba\(0,0,0,\.9\)\);\s*\}/s,'The real Bungie champion icon must preserve its native colours with only a legibility shadow.');
assert.doesNotMatch(sharedTileCss,/\.tile-breaker img\s*\{[^}]*(?:sepia|saturate|hue-rotate|invert|brightness|contrast)\(/s,'Champion artwork must never acquire a brand-colour filter.');
assert.match(sharedTileCss,/\.tile-lock i\s*\{[^}]*width:\s*76%;[^}]*height:\s*52%;[^}]*border:\s*2px solid #6fffc8/s,'The real locked state must use the clearly enlarged bright green glyph.');
assert.match(sharedTileCss,/\.tile-breaker,[\s\S]*\.tile-corner-badge\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent/s,'Footer and corner icons must remain unboxed overlays.');
assert.doesNotMatch(sharedTileCss,/PLACEHOLDER|^\.item-tile\s*\{/m,'The shipped shared tile CSS must contain neither placeholder fills nor unscoped tile selectors.');
assert.match(sharedWorkspaceRuntime,/function bindInventoryWorkspaceHovers\(root,\{resolveItem=\(\)=>null,bindInspect=\(\)=>\{\}\}=\{\}\)[\s\S]*?bindInspect\(target,item,kind/,'Character and INVENTORY shared tiles must bind the click inspector instead of the rich hover card.');
assert.doesNotMatch(sharedWorkspaceRuntime,/function bindInventoryWorkspaceHovers\([^)]*bindHover/,'The shared owned-instance tile binder must not restore rich hover inspection.');
for(const page of ['../pages/guardian-workspace-v2/index.html','../pages/vault/index.html']){
  const html=readFileSync(new URL(page,import.meta.url),'utf8'),tileIndex=html.indexOf('../../shared/item-tile.css'),densityIndex=html.indexOf('../../shared/astrix-desktop-density.css');
  assert.ok(tileIndex>=0&&densityIndex>tileIndex,`${page} must import the shared item tile CSS before the required final density stylesheet.`);
}
const equippedFirstMarkup=inventoryGroupsMarkup([{...sharedTile,itemInstanceId:'13110',name:'Carried first in input',source:{kind:'carried',characterId:CHARACTER_ID}},{...sharedTile,itemInstanceId:'13111',name:'Equipped second in input',source:{kind:'equipped',characterId:CHARACTER_ID}}],{equippedFirst:true,capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.ok(equippedFirstMarkup.indexOf('Equipped second in input')<equippedFirstMarkup.indexOf('Carried first in input'),'The shared category renderer must place the equipped exact item first regardless of input order.');
assert.doesNotMatch(equippedFirstMarkup,/>EQUIPPED</,'Equipped state must remain an icon and border treatment, never permanent tile text.');
let prematureCalls=0;
await assert.rejects(()=>executeLiveTransferPlan(plan,{session,fetchImpl:async()=>{prematureCalls+=1;return response({ErrorCode:1});},authOrigin:'https://auth.test'}),/Final user confirmation/);
assert.equal(prematureCalls,0,'An unconfirmed Apply plan must make zero requests.');

const targetItems=plan.equipment.targets.map(target=>({itemInstanceId:target.itemInstanceId,itemHash:target.itemHash,bucketHash:target.bucketHash}));
const socketsFor=applied=>({
  [weapons[0].itemInstanceId]:{sockets:Array.from({length:4},(_,index)=>index===3?{plugHash:applied?exactPerk.hash:currentPerk.hash}:{})},
  [armour[0].itemInstanceId]:{sockets:Array.from({length:3},(_,index)=>index===2?{plugHash:applied?exactArmourMod.hash:currentArmourMod.hash}:{})}
});
const profilePayload=({equipmentApplied=false,transferred=equipmentApplied,socketsApplied=false,compatible=true,activity='orbit',vaultInstanceIds=[replacement.itemInstanceId]}={})=>{const vaultIds=new Set(vaultInstanceIds.map(String)),vaultTargets=targetItems.filter(item=>vaultIds.has(String(item.itemInstanceId))),stationaryEquipment=targetItems.filter(item=>!vaultIds.has(String(item.itemInstanceId))),carriedTargets=transferred&&!equipmentApplied?vaultTargets:[];return {ErrorCode:1,profile:{
  characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID}}},
  profileInventory:{data:{items:transferred?[]:vaultTargets.map(item=>({...item,bucketHash:VAULT_BUCKET}))}},
  characterInventories:{data:{[CHARACTER_ID]:{items:carriedTargets}}},
  characterEquipment:{data:{[CHARACTER_ID]:{items:equipmentApplied?targetItems:stationaryEquipment}}},
  characterActivities:{data:{[CHARACTER_ID]:activity==='active'?{currentActivityHash:777777,currentActivityModeType:3}:activity==='social'?{currentActivityHash:888888,currentActivityModeType:null,currentActivityModeTypes:[40]}:{currentActivityHash:0,currentActivityModeType:0}}},
  itemComponents:{
    reusablePlugs:{data:{
      [weapons[0].itemInstanceId]:{plugs:{3:compatible?[{plugItemHash:exactPerk.hash,canInsert:true,enabled:true}]:[]}},
      [armour[0].itemInstanceId]:{plugs:{2:compatible?[{plugItemHash:exactArmourMod.hash,canInsert:true,enabled:true}]:[]}}
    }},
    sockets:{data:socketsFor(socketsApplied)}
  }
}}};
assert.equal(characterActivityRestriction(plan,profilePayload({activity:'social'})).allowed,true,'Bungie Social mode 40 must remain an allowed Apply state even when exposed through currentActivityModeTypes.');

const preflightRequests=[];
const liveStaged=await stageLiveTransferPreflight(plan,{session,authOrigin:'https://auth.test',fetchImpl:async(url,init={})=>{preflightRequests.push({url:String(url),method:String(init.method||'GET').toUpperCase()});return response(profilePayload());}});
assert.equal(liveStaged.status,'staged');
assert.equal(liveStaged.ready,true,liveStaged.blockers.join(' | '));
assert.deepEqual(liveStaged.livePreflight.validationOrder,['guardian','ownership','instance-location','compatibility','exotic','socket-legality','activity-state'],'Authenticated live preflight must expose the required validation order.');
assert.deepEqual(liveStaged.livePreflight.checks.map(row=>row.status),Array(7).fill('passed'));
assert.deepEqual(preflightRequests.map(row=>[new URL(row.url).pathname,row.method]),[['/bungie/profile','GET']],'Staging a ready live preflight must use one fresh GET and no Bungie mutation route.');

let stagedActivityPosts=0;
const stagedActivityBlocked=await stageLiveTransferPreflight(plan,{session,authOrigin:'https://auth.test',fetchImpl:async(_url,init={})=>{if(String(init.method||'GET').toUpperCase()==='POST')stagedActivityPosts+=1;return response(profilePayload({activity:'active'}));}});
assert.equal(stagedActivityBlocked.status,'blocked');
assert.equal(stagedActivityPosts,0,'An activity-blocked live preflight must make zero mutation requests.');
assert.equal(stagedActivityBlocked.livePreflight.checks.at(-1).key,'activity-state');
assert.equal(stagedActivityBlocked.livePreflight.checks.at(-1).status,'blocked');

let profileReads=0;
const postPaths=[];
const postBodies=[];
let waitCalls=0;
const fetchImpl=async(url,init={})=>{
  const parsed=new URL(String(url));
  if(String(init.method||'GET').toUpperCase()==='POST'){
    postPaths.push(parsed.pathname);postBodies.push(JSON.parse(init.body));
    if(parsed.pathname.endsWith('/equip-items'))return response({ErrorCode:1,Response:{equipResults:plan.equipment.targets.map(row=>({itemInstanceId:row.itemInstanceId,equipStatus:1}))}});
    return response({ErrorCode:1,Message:'Ok'});
  }
  profileReads+=1;return response(profilePayload({transferred:profileReads>1,equipmentApplied:profileReads>2,socketsApplied:profileReads>3}));
};
const applied=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{session,fetchImpl,authOrigin:'https://auth.test',waitImpl:async()=>{waitCalls+=1;}});
assert.equal(applied.status,'applied');
assert.equal(applied.readback.verified,true);
assert.deepEqual(postPaths,['/bungie/actions/transfer-item','/bungie/actions/equip-items','/bungie/actions/socket-plug-free','/bungie/actions/socket-plug-free'],'Apply must transfer, equip, verify, then apply weapon and armour sockets.');
assert.equal(postBodies[0].itemId,replacement.itemInstanceId);
assert.deepEqual(postBodies[1].itemIds,plan.equipment.targets.map(row=>row.itemInstanceId));
assert.deepEqual(postBodies[2].plug,{socketIndex:3,socketArrayType:0,plugItemHash:exactPerk.hash});
assert.deepEqual(postBodies[3].plug,{socketIndex:2,socketArrayType:0,plugItemHash:exactArmourMod.hash});
assert.deepEqual(applied.steps.map(row=>row.phase),['snapshot','transfer','verify-transfer','equip','verify-equipment','weapon-sockets','armour-mods','readback'],'The execution trace must confirm every transfer reached the Guardian before the exact equip request.');
assert.equal(profileReads,4,'Apply must perform initial, post-transfer, post-equip and final profile reads.');
assert.equal(waitCalls,4,'Transfer settlement and every subsequent Bungie mutation must retain an explicit throttle delay.');

const twoVaultIds=[replacement.itemInstanceId,weapons[2].itemInstanceId];
let pacedProfileReads=0,transferAttempts=0;
const pacedPosts=[],pacedWaits=[],pacedProgress=[];
const pacedApply=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{
  session,authOrigin:'https://auth.test',waitImpl:async milliseconds=>{pacedWaits.push(milliseconds);},onProgress:row=>pacedProgress.push(row),
  fetchImpl:async(url,init={})=>{
    const parsed=new URL(String(url)),method=String(init.method||'GET').toUpperCase();
    if(method!=='POST'){
      pacedProfileReads+=1;
      return response(profilePayload({vaultInstanceIds:twoVaultIds,transferred:pacedProfileReads>2,equipmentApplied:pacedProfileReads>3,socketsApplied:pacedProfileReads>4}));
    }
    pacedPosts.push(parsed.pathname);
    if(parsed.pathname.endsWith('/transfer-item')){
      transferAttempts+=1;
      if(transferAttempts===2)return response({ErrorCode:36,ErrorStatus:'ThrottleLimitExceeded',Message:'Please slow down.',ThrottleSeconds:1},{ok:false,status:429});
    }
    if(parsed.pathname.endsWith('/equip-items'))return response({ErrorCode:1,Response:{equipResults:plan.equipment.targets.map(row=>({itemInstanceId:row.itemInstanceId,equipStatus:1}))}});
    return response({ErrorCode:1,Message:'Ok'});
  }
});
assert.equal(pacedApply.status,'applied','A second transfer throttled by Bungie must recover and still reach the exact bulk equip.');
assert.deepEqual(pacedPosts.slice(0,4),['/bungie/actions/transfer-item','/bungie/actions/transfer-item','/bungie/actions/transfer-item','/bungie/actions/equip-items'],'The throttled transfer must be retried before one bulk equip request.');
assert.deepEqual(pacedWaits,[250,1000,250,750,250,550,550],'The Apply sequence must pace actions, honour Bungie throttle seconds and wait for transferred inventory visibility.');
assert.equal(pacedProgress.some(row=>row.phase==='throttle'&&row.status==='retrying'),true,'Visible progress must report an explicit Bungie throttle retry.');
assert.equal(pacedApply.steps.filter(row=>row.phase==='transfer'&&row.status==='complete').length,2,'Both Vault items must complete transfer before equip.');
assert.equal(pacedApply.steps.find(row=>row.phase==='verify-transfer')?.status,'complete','Fresh profile evidence must prove every item reached the target Guardian before equip.');
assert.equal(pacedApply.steps.find(row=>row.phase==='equip')?.status,'complete','The exact bulk equip must complete after all transfers.');

let partialProfileReads=0;
const partialPosts=[];
const partialEquip=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{
  session,authOrigin:'https://auth.test',waitImpl:async()=>{},
  fetchImpl:async(url,init={})=>{
    const parsed=new URL(String(url));
    if(String(init.method||'GET').toUpperCase()!=='POST'){partialProfileReads+=1;return response(profilePayload({transferred:partialProfileReads>1}));}
    partialPosts.push(parsed.pathname);
    if(parsed.pathname.endsWith('/equip-items'))return response({ErrorCode:1,Response:{equipResults:plan.equipment.targets.map((row,index)=>({itemInstanceId:row.itemInstanceId,equipStatus:index===0?99:1}))}});
    return response({ErrorCode:1,Message:'Ok'});
  }
});
assert.equal(partialEquip.status,'partial');
assert.deepEqual(partialPosts,['/bungie/actions/transfer-item','/bungie/actions/equip-items'],'A per-item equip failure must skip every later socket mutation.');
assert.equal(partialProfileReads,3,'A partial equip must still include transfer verification and a final Bungie readback.');

let verificationProfileReads=0;
const verificationPosts=[];
const unverifiedEquip=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{
  session,authOrigin:'https://auth.test',waitImpl:async()=>{},
  fetchImpl:async(url,init={})=>{
    const parsed=new URL(String(url));
    if(String(init.method||'GET').toUpperCase()==='POST'){verificationPosts.push(parsed.pathname);if(parsed.pathname.endsWith('/equip-items'))return response({ErrorCode:1,Response:{equipResults:plan.equipment.targets.map(row=>({itemInstanceId:row.itemInstanceId,equipStatus:1}))}});return response({ErrorCode:1,Message:'Ok'});}
    verificationProfileReads+=1;return response(profilePayload({transferred:verificationProfileReads>1,equipmentApplied:false,socketsApplied:false}));
  }
});
assert.equal(unverifiedEquip.status,'partial');
assert.deepEqual(verificationPosts,['/bungie/actions/transfer-item','/bungie/actions/equip-items'],'A successful equip response without matching fresh profile evidence must skip both socket phases.');
assert.equal(unverifiedEquip.steps.find(row=>row.phase==='verify-equipment')?.status,'mismatch','Post-equip verification must use fresh profile state, not only the equip response.');
assert.equal(verificationProfileReads,4);

let unsupportedCalls=0;
await assert.rejects(()=>executeLiveTransferPlan(confirmLiveTransferPlan(plan),{session:{...session,capabilities:{destinyActions:{...session.capabilities.destinyActions,equipItems:false}}},fetchImpl:async()=>{unsupportedCalls+=1;return response({ErrorCode:1});},authOrigin:'https://auth.test'}),/no longer supports/);
assert.equal(unsupportedCalls,0,'A changed capability contract must block before fresh reads or mutations.');

let activeActivityReads=0;
let activeActivityPosts=0;
const activeActivityBlocked=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{
  session,authOrigin:'https://auth.test',waitImpl:async()=>{},
  fetchImpl:async(_url,init={})=>{
    if(String(init.method||'GET').toUpperCase()==='POST'){activeActivityPosts+=1;return response({ErrorCode:1});}
    activeActivityReads+=1;return response(profilePayload({activity:'active'}));
  }
});
assert.equal(activeActivityBlocked.status,'blocked','A fresh component-204 activity state outside orbit/social/offline must block Apply.');
assert.equal(activeActivityPosts,0,'The activity restriction must block before every mutation request.');
assert.equal(activeActivityReads,2,'An activity-blocked attempt must still perform its final readback.');
assert.match(activeActivityBlocked.steps.find(row=>row.phase==='snapshot')?.detail?.[0]||'',/Return to orbit, a social space, or go offline/);

let incompatibleProfileReads=0;
let incompatiblePosts=0;
const incompatible=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{
  session,authOrigin:'https://auth.test',waitImpl:async()=>{},
  fetchImpl:async(_url,init={})=>{
    if(String(init.method||'GET').toUpperCase()==='POST'){incompatiblePosts+=1;return response({ErrorCode:1});}
    incompatibleProfileReads+=1;return response(profilePayload({final:false,compatible:false}));
  }
});
assert.equal(incompatible.status,'blocked');
assert.equal(incompatiblePosts,0,'Fresh exact-item socket incompatibility must block before every mutation request.');
assert.equal(incompatibleProfileReads,2,'A blocked attempt must still perform its final readback.');

// Names shown on the build screen must survive into the fresh safety check.
const applyPageSource=readFileSync(new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',import.meta.url),'utf8');
const applyNamesContext={};
runInNewContext(applyPageSource.slice(applyPageSource.indexOf('function applyEntityIndex('),applyPageSource.indexOf('function applyTextEntity('))+';this.nameChanges=nameApplySocketChanges;',applyNamesContext);
const unnamedPlan=clone(plan),namedState={workingBuild:{weapons:[{itemInstanceId:plan.socketChanges[0].itemInstanceId,name:'Test Legendary',sockets:[{hash:plan.socketChanges[0].plugHash,name:'Test Trait'}]}]}};
for(const change of unnamedPlan.socketChanges){change.itemName='';change.plugName=String(change.plugHash);}
const identitiesBefore=unnamedPlan.socketChanges.map(({itemName,plugName,...identity})=>identity);
applyNamesContext.nameChanges(unnamedPlan,namedState);
assert.equal(unnamedPlan.socketChanges[0].itemName,'Test Legendary');
assert.equal(unnamedPlan.socketChanges[0].plugName,'Test Trait');
assert.deepEqual(unnamedPlan.socketChanges.map(({itemName,plugName,...identity})=>identity),identitiesBefore,'Display naming must not change socket identity or eligibility.');
let readableBlockPosts=0;
const readableBlocked=await stageLiveTransferPreflight(unnamedPlan,{session,authOrigin:'https://auth.test',fetchImpl:async(_url,init={})=>{if(init.method==='POST')readableBlockPosts+=1;return response(profilePayload({compatible:false}));}});
assert.equal(readableBlocked.ready,false,'Fresh loss of insertion evidence remains a hard block.');
assert.equal(readableBlockPosts,0);
assert.match(readableBlocked.blockers[0],/Test Trait on Test Legendary \(socket 4\)/);
assert.match(readableBlocked.blockers[0],/No changes were made.*Refresh your inventory.*available in Destiny/);
assert.ok(readableBlocked.blockers.every(message=>!message.includes(unnamedPlan.socketChanges[0].itemInstanceId)&&!message.includes(String(unnamedPlan.socketChanges[0].plugHash))),'Player errors must not fall back to raw identities.');
const namedAllowed=await stageLiveTransferPreflight(unnamedPlan,{session,authOrigin:'https://auth.test',fetchImpl:async()=>response(profilePayload())});
assert.equal(namedAllowed.ready,true,'Naming must preserve allowed free socket changes.');
assert.deepEqual(namedAllowed.inGameSteps,plan.inGameSteps,'Known unsupported changes retain their existing in-game handling.');

// Snapshot eligibility must not claim that the fresh Bungie check has passed.
function applyReadinessHarness({fresh=async()=>profilePayload()}={}){
  const nodes=new Map(),requests=[],state={workingBuild:baseBuild},snapshot=clone(unnamedPlan);
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:id==='applyConfirmationDialog',disabled:false,setAttribute(){},focus(){}});return nodes.get(id);};
  const context={
    byId:node,buildLivePlan:()=>clone(snapshot),readState:()=>state,currentBuild:()=>baseBuild,
    liveActionBusy:false,livePreflightBusy:false,livePreflightRequest:0,
    FORGE_BUNGIE_SESSION:session,pendingApplyPlan:null,pendingApplyEntries:[],applyDialogMode:'idle',
    document:{body:{classList:{add(){}}}},
    setLiveActionBanner:message=>{node('liveActionBanner').textContent=message;},
    stageLiveTransferPreflight:(staged,options)=>stageLiveTransferPreflight(staged,{...options,authOrigin:'https://auth.test',fetchImpl:async(url,init={})=>{requests.push({url:String(url),method:String(init.method||'GET').toUpperCase()});return response(await fresh());}}),
    createApplyReviewEntries:()=>[],renderApplyReviewGrid(){}
  };
  runInNewContext(applyPageSource.slice(applyPageSource.indexOf('function renderApplyControls('),applyPageSource.indexOf('function applyEntityIndex('))+applyPageSource.slice(applyPageSource.indexOf('async function openApplyConfirmation('),applyPageSource.indexOf('async function executeConfirmedApply('))+';this.renderControls=renderApplyControls;this.openConfirmation=openApplyConfirmation;',context);
  return {context,nodes,node,requests,snapshot};
}
let finishReadinessCheck;
const readinessCheck=applyReadinessHarness({fresh:()=>new Promise(resolve=>{finishReadinessCheck=resolve;})});
readinessCheck.context.renderControls(baseBuild);
assert.match(readinessCheck.node('liveActionBanner').textContent,/Ready for a live check/,'A snapshot-only plan must describe readiness for checking, not readiness for writes.');
assert.equal(readinessCheck.node('liveTransferStatus').textContent,readinessCheck.node('liveActionBanner').textContent,'Both Apply entry surfaces must communicate the same snapshot status.');
assert.match(readinessCheck.node('liveTransferStatus').textContent,/staged socket changes/);
assert.ok(readinessCheck.node('liveTransferStatus').textContent.includes(`${plan.inGameSteps.length} in-game`),'Known manual steps must remain explicit before the fresh check.');
const checkingPromise=readinessCheck.context.openConfirmation();
// Prompt 19: assert the complete plain-language status, preserving the preflight check.
assert.match(readinessCheck.node('liveTransferStatus').textContent,/^Checking this build before Apply\. No changes have been made\.$/);
assert.equal(readinessCheck.node('applyWorkingBuild').disabled,true,'The live check must still prevent overlapping Apply attempts.');
finishReadinessCheck(profilePayload({compatible:false}));await checkingPromise;
assert.match(readinessCheck.node('liveActionBanner').textContent,/Apply blocked.*Test Trait on Test Legendary/);
assert.equal(readinessCheck.node('liveTransferStatus').textContent,readinessCheck.node('liveActionBanner').textContent,'Fresh socket rejection must replace the footer status, including after finally re-renders controls.');
assert.equal(readinessCheck.node('applyConfirmationDialog').hidden,true);
assert.equal(readinessCheck.context.pendingApplyPlan,null,'A blocked fresh check must never prepare a confirmation for writes.');
assert.equal(readinessCheck.node('applyWorkingBuild').disabled,false,'The player can retry after resolving the current Bungie block.');
assert.deepEqual(readinessCheck.requests.map(row=>row.method),['GET'],'A blocked readiness check must remain read-only.');
assert.deepEqual(readinessCheck.snapshot,unnamedPlan,'Status rendering cannot reclassify an automatic socket change as a manual step.');
readinessCheck.context.renderControls(baseBuild);
assert.match(readinessCheck.node('liveTransferStatus').textContent,/Ready for a live check/,'A newly rendered Working Build must not retain the previous live failure.');

const allowedReadiness=applyReadinessHarness();
allowedReadiness.context.renderControls(baseBuild);await allowedReadiness.context.openConfirmation();
assert.match(allowedReadiness.node('liveTransferStatus').textContent,/Live check passed.*Review and confirm/);
assert.equal(allowedReadiness.node('applyConfirmationDialog').hidden,false);
assert.equal(allowedReadiness.context.pendingApplyPlan.livePreflight.status,'passed');
assert.deepEqual(allowedReadiness.context.pendingApplyPlan.inGameSteps,plan.inGameSteps,'Successful checks must preserve all explicit in-game steps.');
assert.deepEqual(allowedReadiness.requests.map(row=>row.method),['GET'],'Passing a live check must not perform Apply without final confirmation.');

const failedReadiness=applyReadinessHarness({fresh:async()=>{throw new Error('Profile connection failed');}});
failedReadiness.context.renderControls(baseBuild);await failedReadiness.context.openConfirmation();
assert.match(failedReadiness.node('liveActionBanner').textContent,/Apply blocked.*Profile connection failed/);
assert.equal(failedReadiness.node('liveTransferStatus').textContent,failedReadiness.node('liveActionBanner').textContent,'A profile-fetch failure must also replace the snapshot footer claim.');
assert.equal(failedReadiness.node('applyConfirmationDialog').hidden,true);

const noTransferPlan=clone(plan);
noTransferPlan.transfers=[];
const transferPhase=noTransferPlan.phases.find(phase=>phase.capability==='transferItems');
transferPhase.required=false;transferPhase.status='skipped';
const noTransferSession={...session,capabilities:{destinyActions:{...session.capabilities.destinyActions,transferItems:false}}};
let dynamicTransferReads=0;
let dynamicTransferPosts=0;
const dynamicTransferBlocked=await executeLiveTransferPlan(confirmLiveTransferPlan(noTransferPlan),{
  session:noTransferSession,authOrigin:'https://auth.test',waitImpl:async()=>{},
  fetchImpl:async(_url,init={})=>{
    if(String(init.method||'GET').toUpperCase()==='POST'){dynamicTransferPosts+=1;return response({ErrorCode:1});}
    dynamicTransferReads+=1;return response(profilePayload({final:false}));
  }
});
assert.equal(dynamicTransferBlocked.status,'blocked','A newly required transfer must block if the current session does not advertise transfer support.');
assert.equal(dynamicTransferPosts,0,'A dynamically required but unadvertised transfer must make zero mutation requests.');
assert.equal(dynamicTransferReads,2,'A dynamically blocked transfer must still perform its final readback.');

const OTHER_CHARACTER_ID='9100002',TRANSFER_ITEM={...replacement,itemInstanceId:'13103',source:{kind:'carried',characterId:CHARACTER_ID,label:'Carried'}},REPLACEMENT_ITEM={...weapons[1],itemInstanceId:'13106',name:'Exact carried replacement',source:{kind:'carried',characterId:CHARACTER_ID,label:'Carried'}};
function vaultActionProfile({location='source',equipped=false,replacementEquipped=false,postmaster=false,targetEquipped=false,activity='orbit'}={}){
  const transferRaw={itemHash:TRANSFER_ITEM.itemHash,itemInstanceId:TRANSFER_ITEM.itemInstanceId,bucketHash:postmaster?215593132:TRANSFER_ITEM.bucketHash},replacementRaw={itemHash:REPLACEMENT_ITEM.itemHash,itemInstanceId:REPLACEMENT_ITEM.itemInstanceId,bucketHash:REPLACEMENT_ITEM.bucketHash};
  return {ErrorCode:1,profile:{
    characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID},[OTHER_CHARACTER_ID]:{characterId:OTHER_CHARACTER_ID}}},
    profileInventory:{data:{items:location==='vault'?[{...transferRaw,bucketHash:VAULT_BUCKET}]:[]}},
    characterInventories:{data:{
      [CHARACTER_ID]:{items:[...(location==='source'&&!equipped?[transferRaw]:[]),...(equipped&&!replacementEquipped?[replacementRaw]:[]),...(equipped&&replacementEquipped?[transferRaw]:[]),...(postmaster?[transferRaw]:[])]},
      [OTHER_CHARACTER_ID]:{items:location==='target'?[transferRaw]:[]}
    }},
    characterEquipment:{data:{[CHARACTER_ID]:{items:equipped&&!replacementEquipped?[transferRaw]:replacementEquipped?[replacementRaw]:[]},[OTHER_CHARACTER_ID]:{items:targetEquipped?[transferRaw]:[]}}},
    characterActivities:{data:{[CHARACTER_ID]:activity==='active'?{currentActivityHash:82913930,currentActivityModeType:3}:{currentActivityHash:0,currentActivityModeType:0},[OTHER_CHARACTER_ID]:activity==='active'?{currentActivityHash:82913930,currentActivityModeType:3}:{currentActivityHash:0,currentActivityModeType:0}}}
  }};
}

const stagedVaultMove=stageVaultTransferIntent({item:TRANSFER_ITEM,destination:{kind:'character',characterId:OTHER_CHARACTER_ID},session});
let unconfirmedVaultCalls=0;
await assert.rejects(()=>executeVaultTransferIntent(stagedVaultMove,{session,fetchImpl:async()=>{unconfirmedVaultCalls+=1;return response({ErrorCode:1});},authOrigin:'https://auth.test'}),/Final user confirmation/);
assert.equal(unconfirmedVaultCalls,0,'An unconfirmed drag transfer must make zero Bungie requests.');
let moveLocation='source';
const movePaths=[],moveReadScopes=[];
const acceptedViews=[];
const moved=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},onAccepted:async evidence=>acceptedViews.push(evidence),fetchImpl:async(url,init={})=>{
  const parsed=new URL(String(url)),path=parsed.pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET'){moveReadScopes.push(parsed.searchParams.get('scope'));return response(vaultActionProfile({location:moveLocation,activity:'active'}));}
  movePaths.push(path);
  const body=JSON.parse(init.body);
  moveLocation=body.transferToVault?'vault':'target';
  return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(moved.status,'applied');
assert.deepEqual(movePaths,['/bungie/actions/transfer-item','/bungie/actions/transfer-item'],'A Guardian to Guardian drop must move through Vault using the existing exact transfer endpoint.');
assert.deepEqual(moveReadScopes,['inventory','inventory'],'A normal cross-Guardian move must use one lightweight preflight and one final readback, with no redundant inter-leg profile downloads.');
assert.equal(acceptedViews.length,1,'Only the successful final Bungie leg may publish an immediate accepted destination.');
assert.equal(acceptedViews[0].liveInventory.profile.characterInventories.data[OTHER_CHARACTER_ID].items.some(item=>item.itemInstanceId===TRANSFER_ITEM.itemInstanceId),true,'The immediate accepted view must place the exact item on the requested Guardian.');
assert.deepEqual(moved.readback.actual,{kind:'carried',characterId:OTHER_CHARACTER_ID});
assert.equal(moved.liveInventory?.profile?.characterInventories?.data?.[OTHER_CHARACTER_ID]?.items?.[0]?.itemInstanceId,TRANSFER_ITEM.itemInstanceId,'The verified final lightweight profile must be reusable by the UI without another blocking network read.');
assert.equal(moved.steps.some(row=>row.phase==='preflight'&&row.status==='blocked'),false,'A non-zero activity hash must not pre-block an ordinary item transfer; Bungie decides whether the move is allowed.');

let resumedLocation='vault';
const resumedPaths=[],freshReadUrls=[],freshReadOptions=[];
const resumedMove=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const parsed=new URL(String(url)),path=parsed.pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET'){freshReadUrls.push(parsed);freshReadOptions.push(init);return response(vaultActionProfile({location:resumedLocation}));}
  resumedPaths.push(path);resumedLocation='target';return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(resumedMove.status,'applied','A retry after a completed first leg must resume from the exact current Vault location.');
assert.deepEqual(resumedPaths,['/bungie/actions/transfer-item'],'A stale Guardian source must not replay the completed Guardian-to-Vault leg.');
assert.equal(resumedMove.steps.some(row=>row.phase==='preflight'&&row.status==='resumed'),true,'The audit trail must disclose that fresh Bungie state replaced the staged source.');
assert.equal(freshReadUrls.every(url=>url.searchParams.get('freshness')==='live'&&Boolean(url.searchParams.get('readToken'))),true,'Every executor verification must carry an uncacheable live read token.');
assert.equal(new Set(freshReadUrls.map(url=>url.searchParams.get('readToken'))).size,freshReadUrls.length,'Every live verification URL must be unique.');
assert.equal(freshReadOptions.every(init=>init.cache==='no-store'&&init.headers.Accept==='application/json'&&!Object.hasOwn(init.headers,'Cache-Control')),true,'Every live verification request must bypass browser caches without adding a cross-origin preflight header.');

let delayedAuthoritative='source',delayedVisible='source';
const delayedPaths=[];
const delayedInterlegMove=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(vaultActionProfile({location:delayedVisible}));
  const body=JSON.parse(init.body);delayedPaths.push(path);
  if(body.transferToVault){delayedAuthoritative='vault';return response({ErrorCode:1,Message:'Ok'});}
  assert.equal(delayedAuthoritative,'vault','The second mutation must rely only on Bungie accepting the first Vault leg.');
  delayedAuthoritative='target';delayedVisible='target';return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(delayedInterlegMove.status,'applied','A stale profile feed must not prevent the accepted Vault-to-Guardian leg from completing.');
assert.deepEqual(delayedPaths,['/bungie/actions/transfer-item','/bungie/actions/transfer-item'],'Accepted Guardian-to-Vault mutation evidence must allow the exact destination leg while profile readback catches up.');
assert.equal(delayedInterlegMove.steps.some(row=>row.phase==='transfer-consistency'&&row.status==='continuing'),true,'The audit trail must disclose an accepted inter-leg continuation through stale profile readback.');

let ambiguousLocation='source',ambiguousThrown=false;
const recoveredMove=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(vaultActionProfile({location:ambiguousLocation}));
  const body=JSON.parse(init.body);
  if(body.transferToVault&&!ambiguousThrown){ambiguousThrown=true;ambiguousLocation='vault';throw new TypeError('connection closed after request');}
  ambiguousLocation=body.transferToVault?'vault':'target';return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(recoveredMove.status,'applied','An interrupted response must recover from exact fresh location evidence without duplicating the mutation.');
assert.equal(recoveredMove.steps.some(row=>row.detail?.recoveredFromAmbiguousResponse===true),true,'Ambiguous-response recovery must remain explicit in the action audit trail.');
assert.equal(recoveredMove.attemptCount,2,'The recovered first leg and normal second leg must each make one request.');

const CAPACITY_CANDIDATE={itemHash:13018,itemInstanceId:'13118',bucketHash:TRANSFER_ITEM.bucketHash};
let capacityItemLocation='vault',capacityCandidateLocation='target',capacityRejected=false;
const capacityPaths=[],stagedCapacityMove=stageVaultTransferIntent({item:{...TRANSFER_ITEM,source:{kind:'vault',characterId:null,label:'Vault'}},destination:{kind:'character',characterId:OTHER_CHARACTER_ID},session});
const capacityMove=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedCapacityMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase(),base=vaultActionProfile({location:capacityItemLocation});
  base.profile.characterInventories.data[OTHER_CHARACTER_ID].items.push(...(capacityCandidateLocation==='target'?[CAPACITY_CANDIDATE]:[]));
  base.profile.profileInventory.data.items.push(...(capacityCandidateLocation==='vault'?[{...CAPACITY_CANDIDATE,bucketHash:VAULT_BUCKET}]:[]));
  if(method==='GET')return response(base);
  const body=JSON.parse(init.body);capacityPaths.push(String(body.itemId));
  if(String(body.itemId)===TRANSFER_ITEM.itemInstanceId&&!capacityRejected){capacityRejected=true;return response({ErrorCode:99,ErrorStatus:'DestinyNoRoomInDestination',Message:'Target inventory is full.'},{ok:false,status:409});}
  if(String(body.itemId)===CAPACITY_CANDIDATE.itemInstanceId)capacityCandidateLocation=body.transferToVault?'vault':'target';
  else capacityItemLocation=body.transferToVault?'vault':'target';
  return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(capacityMove.status,'applied','A full Guardian bucket must retry after moving one exact same-bucket item safely into Vault.');
assert.deepEqual(capacityPaths,[TRANSFER_ITEM.itemInstanceId,CAPACITY_CANDIDATE.itemInstanceId,TRANSFER_ITEM.itemInstanceId],'A capacity retry must attempt the requested move, open one exact slot, then retry the requested item.');
assert.equal(capacityCandidateLocation,'vault','A Vault-to-Guardian capacity swap must leave the exact displaced item safely in Vault.');

const vaultDirectItem={...TRANSFER_ITEM,source:{kind:'vault',characterId:null,label:'Vault'}},stagedVaultDirect=stageVaultTransferIntent({item:vaultDirectItem,destination:{kind:'character',characterId:OTHER_CHARACTER_ID},session,equipAfterTransfer:true});
let vaultDirectLocation='vault';
const vaultDirectPaths=[];
const vaultDirect=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultDirect),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(vaultActionProfile({location:vaultDirectLocation,targetEquipped:vaultDirectLocation==='equipped'}));
  vaultDirectPaths.push(path);
  if(path.endsWith('/transfer-item')){vaultDirectLocation='target';return response({ErrorCode:1,Message:'Ok'});}
  vaultDirectLocation='equipped';
  return response({ErrorCode:1,Response:{equipResults:[{itemInstanceId:vaultDirectItem.itemInstanceId,equipStatus:1}]}});
}});
assert.equal(vaultDirect.status,'applied','A reviewed Vault double click must finish only after exact equipped readback.');
assert.deepEqual(vaultDirectPaths,['/bungie/actions/transfer-item','/bungie/actions/equip-items'],'Vault direct equip must reuse the exact transfer and equip endpoints in order.');
assert.deepEqual(vaultDirect.readback.actual,{kind:'equipped',characterId:OTHER_CHARACTER_ID});

let partialLocation='source',partialAttempts=0;
const partialMove=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(_url,init={})=>{
  if(String(init.method||'GET').toUpperCase()==='GET')return response(vaultActionProfile({location:partialLocation}));
  partialAttempts+=1;
  if(partialAttempts===1){partialLocation='vault';return response({ErrorCode:1,Message:'Ok'});}
  return response({ErrorCode:99,ErrorStatus:'ItemNotTransferable',Message:'Target inventory is full.'},{ok:false,status:409});
}});
assert.equal(partialMove.status,'partial','A failed second leg must report a partial live action.');
assert.equal(partialMove.mutationCount,1,'Only the confirmed first transfer may count as completed.');
assert.deepEqual(partialMove.readback.actual,{kind:'vault',characterId:null},'Fresh readback must expose the real intermediate Vault location.');
assert.equal(partialMove.steps.find(row=>row.status==='failed')?.detail?.payload?.Message,'Target inventory is full.','The real Bungie failure message must remain available to the Vault UI.');

const equippedTransfer={...TRANSFER_ITEM,source:{kind:'equipped',characterId:CHARACTER_ID,label:'Equipped'}},stagedEquippedMove=stageVaultTransferIntent({item:equippedTransfer,destination:{kind:'vault'},replacementItem:REPLACEMENT_ITEM,session});
let equippedState={equipped:true,replacementEquipped:false,location:'source'};
const equippedPaths=[];
const equippedMoved=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedEquippedMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(vaultActionProfile(equippedState));
  equippedPaths.push(path);
  if(path.endsWith('/equip-items')){equippedState={...equippedState,replacementEquipped:true};return response({ErrorCode:1,Response:{equipResults:[{itemInstanceId:REPLACEMENT_ITEM.itemInstanceId,equipStatus:1}]}});}
  equippedState={equipped:false,replacementEquipped:false,location:'vault'};
  return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(equippedMoved.status,'applied');
assert.deepEqual(equippedPaths,['/bungie/actions/equip-items','/bungie/actions/transfer-item'],'Moving an equipped item must first equip the reviewed exact carried replacement.');

const POSTMASTER_ITEM={...TRANSFER_ITEM,itemInstanceId:'13107',name:'Exact Postmaster item',quantity:1,source:{kind:'postmaster',characterId:CHARACTER_ID,label:'Postmaster'}},stagedCollection=stagePostmasterCollectionIntent({characterId:CHARACTER_ID,items:[POSTMASTER_ITEM],session});
assert.equal(stagedCollection.overflowToVault,true,'A normal Postmaster pull must retain the explicit Vault overflow path when the character bucket is full.');
let postmasterPresent=true;
const postmasterPaths=[];
const collected=await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(stagedCollection),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase(),base=vaultActionProfile({activity:'active'});
  base.profile.characterInventories.data[CHARACTER_ID].items=postmasterPresent?[{itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:215593132}]:[];
  if(!postmasterPresent)base.profile.profileInventory.data.items=[{itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:POSTMASTER_ITEM.bucketHash}];
  if(method==='GET')return response(base);
  postmasterPaths.push(path);postmasterPresent=false;return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(collected.status,'applied');
assert.deepEqual(postmasterPaths,['/bungie/actions/pull-from-postmaster'],'Collect Postmaster must use Bungie PullFromPostmaster, not the Vault transfer route.');
assert.equal(collected.readback.verified,true,'Postmaster readback must accept the real Bungie destination bucket when an item leaves Postmaster.');
assert.equal(collected.steps.some(row=>row.phase==='preflight'&&row.status==='blocked'),false,'A non-zero activity hash must not pre-block a Postmaster pull; Bungie decides whether collection is allowed.');

const SECOND_POSTMASTER_ITEM={...POSTMASTER_ITEM,itemInstanceId:'13117',name:'Second exact Postmaster item'},stagedPullAll=stagePostmasterCollectionIntent({characterId:CHARACTER_ID,items:[POSTMASTER_ITEM,SECOND_POSTMASTER_ITEM],session});
let secondPostmasterPresent=true;
const pullAllPaths=[];
const continuedPullAll=await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(stagedPullAll),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase(),base=vaultActionProfile({location:'absent'});
  base.profile.characterInventories.data[CHARACTER_ID].items=[{itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:215593132},...(secondPostmasterPresent?[{itemHash:SECOND_POSTMASTER_ITEM.itemHash,itemInstanceId:SECOND_POSTMASTER_ITEM.itemInstanceId,bucketHash:215593132}]:[])];
  if(!secondPostmasterPresent)base.profile.profileInventory.data.items=[{itemHash:SECOND_POSTMASTER_ITEM.itemHash,itemInstanceId:SECOND_POSTMASTER_ITEM.itemInstanceId,bucketHash:SECOND_POSTMASTER_ITEM.bucketHash}];
  if(method==='GET')return response(base);
  pullAllPaths.push(path);const body=JSON.parse(init.body);
  if(String(body.itemId)===POSTMASTER_ITEM.itemInstanceId)return response({ErrorCode:99,ErrorStatus:'ItemNotTransferable',Message:'First item rejected.'},{ok:false,status:409});
  secondPostmasterPresent=false;return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(continuedPullAll.status,'partial','PULL ALL must report partial when one exact item remains rejected.');
assert.deepEqual(pullAllPaths,['/bungie/actions/pull-from-postmaster','/bungie/actions/pull-from-postmaster'],'PULL ALL must continue to later exact items after an individual Bungie rejection.');
assert.deepEqual(continuedPullAll.readback.remaining,[POSTMASTER_ITEM.itemInstanceId],'PULL ALL readback must identify only the exact item Bungie left behind.');

const OVERFLOW_CANDIDATE={itemHash:13008,itemInstanceId:'13108',bucketHash:POSTMASTER_ITEM.bucketHash},overflowState={postmaster:true,pulled:'postmaster',candidate:'carried'};
const overflowPaths=[];
const overflowProfile=()=>{
  const base=vaultActionProfile({location:'absent'}),pulledRaw={itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:POSTMASTER_ITEM.bucketHash};
  base.profile.characterInventories.data[CHARACTER_ID].items=[...(overflowState.postmaster?[{...pulledRaw,bucketHash:215593132}]:[]),...(overflowState.pulled==='carried'?[pulledRaw]:[]),...(overflowState.candidate==='carried'?[OVERFLOW_CANDIDATE]:[])];
  base.profile.profileInventory.data.items=[...(overflowState.pulled==='vault'?[{...pulledRaw,bucketHash:VAULT_BUCKET}]:[]),...(overflowState.candidate==='vault'?[{...OVERFLOW_CANDIDATE,bucketHash:VAULT_BUCKET}]:[])];
  return base;
};
let overflowPullAttempts=0;
const overflowCollected=await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(stagedCollection),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(overflowProfile());
  overflowPaths.push(path);
  const body=JSON.parse(init.body);
  if(path.endsWith('/pull-from-postmaster')){
    overflowPullAttempts+=1;
    if(overflowPullAttempts===1)return response({ErrorCode:99,ErrorStatus:'DestinyNoRoomInDestination',Message:'Target inventory is full.'},{ok:false,status:409});
    overflowState.postmaster=false;overflowState.pulled='carried';return response({ErrorCode:1,Message:'Ok'});
  }
  if(String(body.itemId)===OVERFLOW_CANDIDATE.itemInstanceId)overflowState.candidate=body.transferToVault?'vault':'carried';
  if(String(body.itemId)===POSTMASTER_ITEM.itemInstanceId)overflowState.pulled=body.transferToVault?'vault':'carried';
  return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(overflowCollected.status,'applied','A full character bucket must complete the requested Postmaster pull through the real Vault transfer route.');
assert.deepEqual(overflowPaths,['/bungie/actions/pull-from-postmaster','/bungie/actions/transfer-item','/bungie/actions/pull-from-postmaster','/bungie/actions/transfer-item','/bungie/actions/transfer-item'],'A full character bucket must open one exact slot, pull the Postmaster item, move it to Vault, and restore the displaced item.');
assert.equal(overflowState.pulled,'vault','The requested Postmaster item must finish in Vault when its character bucket was full.');
assert.equal(overflowState.candidate,'carried','The exact carried item used to open capacity must be restored to its original Guardian.');

const stagedPostmasterDirect=stagePostmasterCollectionIntent({characterId:CHARACTER_ID,targetCharacterId:OTHER_CHARACTER_ID,items:[POSTMASTER_ITEM],session,equipAfterCollection:true});
let postmasterDirectLocation='postmaster';
const postmasterDirectPaths=[];
const postmasterDirectProfile=()=>{
  const base=vaultActionProfile({location:'absent'}),raw={itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:POSTMASTER_ITEM.bucketHash};
  if(postmasterDirectLocation==='postmaster')base.profile.characterInventories.data[CHARACTER_ID].items=[{...raw,bucketHash:215593132}];
  if(postmasterDirectLocation==='source')base.profile.characterInventories.data[CHARACTER_ID].items=[raw];
  if(postmasterDirectLocation==='vault')base.profile.profileInventory.data.items=[{...raw,bucketHash:VAULT_BUCKET}];
  if(postmasterDirectLocation==='target')base.profile.characterInventories.data[OTHER_CHARACTER_ID].items=[raw];
  if(postmasterDirectLocation==='equipped')base.profile.characterEquipment.data[OTHER_CHARACTER_ID].items=[raw];
  return base;
};
const postmasterDirect=await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(stagedPostmasterDirect),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(postmasterDirectProfile());
  postmasterDirectPaths.push(path);
  if(path.endsWith('/pull-from-postmaster'))postmasterDirectLocation='source';
  else if(path.endsWith('/transfer-item'))postmasterDirectLocation=postmasterDirectLocation==='source'?'vault':'target';
  else postmasterDirectLocation='equipped';
  return path.endsWith('/equip-items')?response({ErrorCode:1,Response:{equipResults:[{itemInstanceId:POSTMASTER_ITEM.itemInstanceId,equipStatus:1}]}}):response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(postmasterDirect.status,'applied','A reviewed Postmaster double click must wait for collection, transfer, equip, and final exact readback.');
assert.deepEqual(postmasterDirectPaths,['/bungie/actions/pull-from-postmaster','/bungie/actions/transfer-item','/bungie/actions/transfer-item','/bungie/actions/equip-items'],'Cross Guardian Postmaster direct equip must use the existing executor routes in a verified sequence.');
assert.deepEqual(postmasterDirect.readback.notEquipped,[]);

const stagedClear=stageBungieLoadoutAction('clear',{characterId:CHARACTER_ID,index:4,loadoutName:'Nightfall'});
let loadoutCalls=0;
await assert.rejects(()=>executeBungieLoadoutAction('clear',{characterId:CHARACTER_ID,index:4,session,confirmation:stagedClear,fetchImpl:async()=>{loadoutCalls+=1;return response({ErrorCode:1});},authOrigin:'https://auth.test'}),/Final user confirmation/);
assert.equal(loadoutCalls,0,'A staged but unconfirmed loadout clear must make zero requests.');
let loadoutRequest=null;
await executeBungieLoadoutAction('clear',{characterId:CHARACTER_ID,index:4,session,confirmation:confirmBungieLoadoutAction(stagedClear),fetchImpl:async(url,init)=>{loadoutRequest={url:String(url),init};return response({ErrorCode:1,Message:'Ok'});},authOrigin:'https://auth.test'});
assert.equal(new URL(loadoutRequest.url).pathname,'/bungie/actions/loadout/clear');
assert.deepEqual(JSON.parse(loadoutRequest.init.body),{membershipType:Number(MEMBERSHIP_TYPE),characterId:CHARACTER_ID,loadoutIndex:4});

console.log('MANUAL_BUILD_EDITOR=PASS');
console.log('PARADOX_NAMED_LOADOUT=PASS');
console.log('GUARDED_LIVE_APPLY=PASS');
console.log('VAULT_LIVE_TRANSFER=PASS');
console.log('BUNGIE_LOADOUT_CONFIRMATION=PASS');

// Exercise the saved overview independently of auth, DOM boot and the live Guardian.
const overviewSource=readFileSync(new URL('../pages/loadout/paradox-loadouts.mjs',import.meta.url),'utf8');
const overviewHelpers=overviewSource.slice(overviewSource.indexOf('const esc='),overviewSource.indexOf('function artifactRequiresInGameStep')).replace('export function savedBuildOverview','function savedBuildOverview');
const overviewContext={URL,classifyArmourPlug};
runInNewContext(overviewHelpers+';this.renderOverview=savedBuildOverview;',overviewContext);
const overviewBuild={subclassName:'Saved Titan',subclassIcon:'/subclass.png',subclassBuild:{super:{name:'Saved Super',icon:'/super.png'},abilities:[{name:'Saved ability',icon:'/ability.png'}],aspects:[{name:'Saved aspect',icon:'/aspect.png'}],fragments:[{name:'Saved fragment',icon:'/fragment.png'}]},weapons:[{name:'Saved weapon',icon:'/weapon.png',weaponPerkModel:{columns:[{selectedPlugHash:2,options:[{hash:1,name:'Unselected perk'},{hash:2,name:'Selected perk',icon:'/perk.png'}]}]}}],armour:[{name:'Saved armour',icon:'/armour.png',generalMods:[{name:'Saved mod',icon:'/mod.png'}]}],artifact:{name:'Saved Artifact',perks:[{hash:7,name:'Selected Artifact',icon:'/artifact.png'},{hash:8,name:'Unselected Artifact'}]},artifactConfiguration:{selectedPerkHashes:[7,9]}};
const unchangedOverview=JSON.stringify(overviewBuild),overviewMarkup=overviewContext.renderOverview(overviewBuild);
for(const label of ['Saved Super','Saved ability','Saved aspect','Saved fragment','Saved weapon','Saved armour','Saved mod','Selected perk','Selected Artifact','Unresolved Artifact perk 9'])assert.ok(overviewMarkup.includes(label),label+' must be visible from the saved snapshot');
assert.doesNotMatch(overviewMarkup,/Unselected perk|Unselected Artifact/);
assert.match(overviewMarkup,/https:\/\/www.bungie.net\/super.png/);
assert.equal(JSON.stringify(overviewBuild),unchangedOverview,'Rendering must never alter the saved build');
const unsafeOverview=overviewContext.renderOverview({weapons:[{name:'<script>bad</script>',icon:'javascript:alert(1)'}]});
assert.doesNotMatch(unsafeOverview,/<script>|javascript:/);
assert.match(unsafeOverview,/No icon/);
assert.doesNotMatch(overviewMarkup,/<figcaption|class="saved-build-group"/,'The compact build must not restore name captions or separate section panels');
assert.equal((overviewMarkup.match(/class="saved-build-row"/g)||[]).length,1,'All saved equipment must share one outer row');
assert.match(overviewMarkup,/<figure[^>]+title="Saved Super/,'Icon names must remain available on hover');
assert.match(overviewMarkup,/class="saved-build-mods"[^>]*>[\s\S]*title="Saved mod/,'Armour mods must occupy the shared socket grid');
assert.match(overviewMarkup,/Stats not saved/,'Absent saved stats must not be replaced with live or invented values');
assert.match(overviewMarkup,/Power unavailable/,'An absent saved power value must remain unknown');
console.log('SAVED_BUILD_OVERVIEW=PASS selected gear, sockets, subclass, Artifact, escaping and immutable snapshots');

// Exercise the actual hover/focus handlers, including scroller-independent placement.
const tooltipHandlers=new Map(),tooltipAttrs=new Map();
const tooltipNode={id:'',style:{},hidden:true,textContent:'',open:false,setAttribute(key,value){tooltipAttrs.set(key,value);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},getBoundingClientRect(){return {width:200,height:100};}};
let tooltipParent=null;
const tooltipHost={append(node){tooltipParent=this;assert.equal(node,tooltipNode);}};
const tileAttrs=new Map([['aria-label','Saved weapon\nSelected perk'],['title','Saved weapon\nSelected perk']]);
const tooltipTile={getAttribute(key){return tileAttrs.get(key);},setAttribute(key,value){tileAttrs.set(key,value);},removeAttribute(key){tileAttrs.delete(key);},closest(selector){return selector==='dialog'?null:this;},contains(node){return node===this;},getBoundingClientRect(){return {left:480,top:350,bottom:400};}};
const tooltipContext={innerWidth:500,innerHeight:440,document:{body:tooltipHost,createElement:()=>tooltipNode,addEventListener:(type,fn)=>tooltipHandlers.set(type,fn)},window:{addEventListener:(type,fn)=>tooltipHandlers.set(type,fn)}};
runInNewContext(overviewSource.slice(overviewSource.indexOf('let itemTooltip='),overviewSource.indexOf("document.addEventListener('click'")),tooltipContext);
tooltipHandlers.get('pointerover')({target:tooltipTile});
assert.equal(tooltipNode.textContent,'Saved weapon\nSelected perk');assert.equal(tooltipNode.open,true);assert.equal(tooltipParent,tooltipHost);
assert.equal(tooltipNode.style.left,'292px','Hover names must fit the right viewport edge');
assert.equal(tooltipNode.style.top,'242px','A tooltip near the bottom must open above its tile');
assert.equal(tileAttrs.get('aria-describedby'),'savedItemTooltip');
assert.equal(tileAttrs.has('title'),false,'Do not display a second native tooltip over the immediate name');
tooltipHandlers.get('keydown')({key:'Escape'});assert.equal(tooltipNode.hidden,true);assert.equal(tileAttrs.has('aria-describedby'),false);
assert.equal(tileAttrs.get('title'),'Saved weapon\nSelected perk','Restore the fallback name after dismissal');
tooltipHandlers.get('focusin')({target:tooltipTile});assert.equal(tooltipNode.hidden,false,'Keyboard focus must show the same item name immediately');
tooltipHandlers.get('scroll')();assert.equal(tooltipNode.hidden,true,'Scrolling must clear a tooltip tied to an old tile position');
console.log('LOADOUT_ITEM_NAMES=PASS immediate hover, keyboard focus, viewport edges and dismissal');

const reviewCalls=[];
const reviewContext={guardContext:()=>()=>{},draftFor:()=>({name:'Saved build'}),esc:value=>value,showDialog:(...args)=>reviewCalls.push(['dialog',...args]),refreshProfile:async()=>{reviewCalls.push(['refresh']);throw new Error('Profile unavailable');}};
runInNewContext(overviewSource.slice(overviewSource.indexOf('async function reviewBuildAction('),overviewSource.indexOf('async function executeBuildAction('))+';this.review=reviewBuildAction;',reviewContext);
await assert.rejects(()=>reviewContext.review('saved',false),/Profile unavailable/);
assert.equal(reviewCalls[0][0],'dialog','Saved Apply must show feedback before waiting on the network');
assert.equal(reviewCalls[0][1],'CHECKING LOADOUT');assert.equal(reviewCalls[1][0],'refresh');
assert.equal(reviewCalls[0][3],'','The checking dialog cannot expose a premature confirmation button');


// Loadout page regressions. These are synthetic contract inputs, not live-account evidence.
const pageSource=overviewSource.slice(overviewSource.indexOf('const byId='),overviewSource.indexOf('let itemTooltip='))
  .replace(/export (async )?function /g,(_,asyncPart)=>`${asyncPart||''}function `);
const pageNodes=new Map();
const pageNode=id=>{
  if(!pageNodes.has(id))pageNodes.set(id,{innerHTML:'',textContent:'',hidden:false,open:false,value:'',classList:{toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}});
  return pageNodes.get(id);
};
const pageContext={URL,structuredClone,classifyArmourPlug,inventoryLocations,verifyReadback,sessionBinding,confirmLiveTransferPlan,stageBungieLoadoutAction,confirmBungieLoadoutAction,executeLiveTransferPlan,executeBungieLoadoutAction,requestFreshProfile:async()=>{throw new Error('Unexpected live request in unit test');},LOADOUT_DEFINITIONS:{},normaliseArmourSemantics,eligibleEquipment,recordManualEdit,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice,subclassCompatibilityViolations,document:{getElementById:pageNode,querySelector:()=>null},socketGroups};
runInNewContext(pageSource+`;this.loadoutTest={matchingLoadouts,selectedSocketTargets,restoreSavedSocketIntent,verifySavedSlot,applyThenSaveSlot,render,editorSelect,editableSnapshotItem,editChoice,closeDialog,draftFor,preparePayload,setCharacter,
  setEditor(state){dialogState=state;renderEditor(state);},
  setState(next){records=next.records;session=next.session;characterId=next.characterId;equipped=next.equipped;payload=next.payload||{definitions:{}};loading=false;},
  openDraft(record){dialogState={kind:'edit',record:copy(record)};dialog().showModal();return dialogState.record;},
  getDialogState(){return dialogState;}};`,pageContext);
const pageApi=pageContext.loadoutTest;
pageContext.hideItemTooltip=()=>{};
const binding={characterId:CHARACTER_ID,membershipId:MEMBERSHIP_ID,membershipType:MEMBERSHIP_TYPE,characterClass:'titan'};
const manyRecords=Array.from({length:125},(_,index)=>({id:`saved-${index}`,name:`Saved ${index}`,binding,revision:1,updatedAt:new Date(Date.UTC(2026,8,1,0,index)).toISOString(),build:clone(overviewBuild)}));
const otherRows=[{...manyRecords[0],id:'other-character',binding:{...binding,characterId:'9100002'}},{...manyRecords[0],id:'other-membership',binding:{...binding,membershipId:'9200002'}},{...manyRecords[0],id:'other-platform',binding:{...binding,membershipType:'1'}}];
const visible=pageApi.matchingLoadouts([...manyRecords,...otherRows],CHARACTER_ID,binding);
assert.equal(visible.length,125,'PARADOX builds have no app-imposed count cap');
assert.equal(visible[0].id,'saved-124','The latest saved record comes first');
assert.equal(visible.at(-1).id,'saved-0');
assert.equal(pageApi.matchingLoadouts(manyRecords,'',binding).length,0,'No selection must not expose all Guardians');
assert.equal(pageApi.matchingLoadouts(manyRecords,CHARACTER_ID,{}).length,0,'No account must not expose stored builds');
const modsMarkup=overviewContext.renderOverview({armour:[{name:'Helmet',mods:[{name:'Paragon',icon:'/archetype.png'},{name:'Real slot mod',icon:'/mod.png',definition:{plug:{plugCategoryIdentifier:'armor.mods.helmet'}}},{name:'Unknown raw socket',icon:'/unknown.png'},{name:'Masterwork Level',icon:'/masterwork.png'}]}]});
assert.match(modsMarkup,/Real slot mod/);
assert.doesNotMatch(modsMarkup,/Paragon|archetype.png|Unknown raw socket|Masterwork Level/,'Only positively classified raw mods enter the mod grid');
const contaminatedMarkup=overviewContext.renderOverview({armour:[{name:'Helmet',generalMods:[{name:'Grenadier',icon:'/archetype.png'},{name:'Trusted legacy mod',icon:'/legacy.png'}]}]});
assert.match(contaminatedMarkup,/Trusted legacy mod/);
assert.doesNotMatch(contaminatedMarkup,/Grenadier|archetype.png/,'Archetypes must be removed even from a classified legacy list');
pageApi.setState({records:[...manyRecords,...otherRows],characterId:CHARACTER_ID,session:{authenticated:true,activeDestinyMembership:binding},equipped:{...clone(overviewBuild),subclassName:'LIVE SELECTED GUARDIAN',loadoutsAvailable:true,loadouts:[]}});
pageApi.render();
const stacked=pageNode('paradoxLoadoutDetail').innerHTML,navigation=pageNode('paradoxLoadoutList').innerHTML;
assert.equal((stacked.match(/data-build-record=/g)||[]).length,126,'Every matching saved build is rendered below Equipped');
assert.ok(stacked.indexOf('#1 EQUIPPED')<stacked.indexOf('#2 Saved 124'));
assert.ok(stacked.indexOf('#2 Saved 124')<stacked.indexOf('#3 Saved 123'));
assert.match(stacked,/#126 Saved 0/);
assert.match(navigation,/#2 Saved 124/);
assert.doesNotMatch(stacked,/other-character|other-membership|other-platform|DOWNLOAD JSON|OPEN IN BUILD FORGE/);
assert.match(stacked,/data-build-action="edit" data-build-id="saved-124"/,'Each action binds to its own saved record');
assert.match(stacked,/class="is-danger paradox-trash"[^>]+aria-label="Delete Saved 124"/);
assert.equal((pageNode('guardianLoadouts').innerHTML.match(/data-in-game-slot=/g)||[]).length,20);
const draft=pageApi.openDraft(manyRecords[0]);draft.name='Unsaved rename';draft.build.weapons[0].name='Unsaved weapon';pageApi.closeDialog();
assert.equal(pageApi.getDialogState(),null);
assert.equal(manyRecords[0].name,'Saved 0');assert.equal(manyRecords[0].build.weapons[0].name,'Saved weapon','Cancelling edits cannot mutate stored snapshots');
const selectedCopy=pageApi.draftFor('saved-124');selectedCopy.build.weapons[0].name='Changed copy';assert.equal(manyRecords[124].build.weapons[0].name,'Saved weapon');

const socketBuild={...binding,weapons:[{itemInstanceId:'101',hash:1001,name:'Saved weapon',socketCoverage:{plugs:[{hash:501,name:'Saved trait',socketIndex:3}]}}],armour:[{itemInstanceId:'102',hash:1002,name:'Saved armour',generalMods:[{hash:601,name:'Saved mod',socketIndex:0}]}],subclassItem:{itemInstanceId:'103',hash:1003,name:'Saved subclass'},subclassItemInstanceId:'103',subclassBuild:{super:{hash:701,name:'Saved super',socketIndex:1}}};
const socketPayload={profile:{profileInventory:{data:{items:[{itemInstanceId:'101',itemHash:1001,bucketHash:VAULT_BUCKET}]}},characterEquipment:{data:{[CHARACTER_ID]:{items:[{itemInstanceId:'102',itemHash:1002},{itemInstanceId:'103',itemHash:1003}]}}},itemComponents:{sockets:{data:{'101':{sockets:[{},{},{},{plugHash:500}]},'102':{sockets:[{plugHash:601}]},'103':{sockets:[{},{plugHash:700}]}}},reusablePlugs:{data:{'101':{plugs:{'3':[{plugItemHash:501,canInsert:true,enabled:true}]}},'103':{plugs:{'1':[{plugItemHash:701,canInsert:true,enabled:true}]}}}}}}};
const restored=pageApi.restoreSavedSocketIntent(socketBuild,socketPayload);
assert.equal(restored.manualSocketChanges.length,3,'Restore saved gear, armour and subclass sockets even without manual-edit history');
assert.ok(restored.manualSocketChanges.every(row=>row.remoteSupported));
assert.equal(restored.weapons[0].source.kind,'vault','Apply must use the current location, not a saved location');
assert.equal(socketBuild.manualSocketChanges,undefined,'Building an Apply plan must not change a saved record');
const legacyFragments=clone(socketBuild);legacyFragments.subclassBuild.fragments=[{hash:8500,socketIndex:14},{hash:8500,socketIndex:15}];
const legacyPayload={...socketPayload,definitions:{8500:{displayProperties:{name:'Empty Fragment Socket'}}}};
const restoredLegacy=pageApi.restoreSavedSocketIntent(legacyFragments,legacyPayload);
assert.deepEqual(subclassCompatibilityViolations(restoredLegacy),[],'Saved snapshots missing names must resolve empty placeholders by their exact manifest hash');
assert.deepEqual(Array.from(restoredLegacy.subclassBuild.fragments,row=>row.socketIndex),[14,15]);
assert.equal(legacyFragments.subclassBuild.fragments[0].name,undefined,'Refreshing empty-plug evidence cannot rewrite the stored record');
const unsupportedPayload=clone(socketPayload);unsupportedPayload.profile.itemComponents.reusablePlugs.data['103']={plugs:{}};
assert.equal(pageApi.restoreSavedSocketIntent(socketBuild,unsupportedPayload).manualSocketChanges.find(row=>row.plugHash===701).remoteSupported,false,'Unverified subclass insertion remains an in-game step');
const simplePlan={ready:true,status:'staged',characterId:CHARACTER_ID,equipment:{targets:[{itemInstanceId:'101'}]},socketChanges:[{itemInstanceId:'101',socketIndex:0,plugHash:501}]};
const verifiedProfile={profile:{
  characterEquipment:{data:{[CHARACTER_ID]:{items:[{itemInstanceId:'101'}]}}},
  itemComponents:{sockets:{data:{'101':{sockets:[{plugHash:501}]}}}},
  characterLoadouts:{data:{[CHARACTER_ID]:{loadouts:[null,null,{items:[{itemInstanceId:'101',plugItemHashes:[501]}]}]}}}
}};
let steps=[];
await pageApi.applyThenSaveSlot({plan:simplePlan,index:2,session:{},assertCurrent:()=>{},executeApply:async()=>{steps.push('apply');return {status:'applied',readback:{verified:true}};},readFresh:async()=>{steps.push('read');return verifiedProfile;},executeSlot:async(action,options)=>{steps.push(`snapshot:${options.index}`);assert.equal(options.confirmation.status,'confirmed');}});
assert.deepEqual(steps,['apply','read','snapshot:2','read'],'Save to in-game must apply, verify, save only the selected slot, then verify the slot');
for(const result of [{status:'partial',readback:{verified:true}},{status:'applied',readback:{verified:false}},{status:'blocked'}]){
  let saves=0;
  await assert.rejects(()=>pageApi.applyThenSaveSlot({plan:simplePlan,index:2,session:{},assertCurrent:()=>{},executeApply:async()=>result,executeSlot:async()=>{saves++;}}),/not overwritten/);
  assert.equal(saves,0,'A partial or unverified Apply must never overwrite a slot');
}
let staleSaves=0,checks=0;
await assert.rejects(()=>pageApi.applyThenSaveSlot({plan:simplePlan,index:2,session:{},assertCurrent:()=>{if(++checks>1)throw new Error('Guardian changed');},executeApply:async()=>({status:'applied',readback:{verified:true}}),executeSlot:async()=>{staleSaves++;}}),/Guardian changed/);
assert.equal(staleSaves,0);
const changed=clone(verifiedProfile);changed.profile.itemComponents.sockets.data['101'].sockets[0].plugHash=999;
await assert.rejects(()=>pageApi.applyThenSaveSlot({plan:simplePlan,index:2,session:{},assertCurrent:()=>{},executeApply:async()=>({status:'applied',readback:{verified:true}}),readFresh:async()=>changed,executeSlot:async()=>{staleSaves++;}}),/Equipment changed/);
assert.equal(staleSaves,0);
assert.equal(pageApi.verifySavedSlot(simplePlan,verifiedProfile,2),true);
assert.equal(pageApi.verifySavedSlot(simplePlan,verifiedProfile,1),false,'A matching different slot must not count as success');
const wrongSlot=clone(verifiedProfile);wrongSlot.profile.characterLoadouts.data[CHARACTER_ID].loadouts[2].items[0].plugItemHashes=[999];
assert.equal(pageApi.verifySavedSlot(simplePlan,wrongSlot,2),false,'A saved equipment match with wrong sockets is not success');
console.log('LOADOUT_PAGE=PASS character/account filtering, 125 stacked saves, pinned equipped, immutable editor, real mod classification, socket replay and verified save ordering');

const retainedMod={...currentArmourMod,hash:8299,name:'Retained second mod',socketIndex:4};
const rawSavedArmour={...clone(armour[0]),slotMods:undefined,armourSemantics:undefined,mods:[currentArmourMod,retainedMod],socketCoverage:{plugs:[currentArmourMod,retainedMod]}};
const editorArmour=pageApi.editableSnapshotItem(rawSavedArmour,armour[0],'armour');
const editorDraft={id:'edited',name:'Quick edit',description:'',build:{...clone(baseBuild),armour:[editorArmour,...clone(armour.slice(1))],subclassBuild:{}}};
pageApi.setEditor({kind:'edit',record:editorDraft,catalogue:[],subclasses:[],check:()=>{}});
pageNode('paradoxEditName').value='Quick edit';pageNode('paradoxEditDescription').value='';
const options=pageApi.getDialogState().choices.get('socket:armour:0:2');
pageApi.editChoice({dataset:{editorChoice:'socket:armour:0:2'},value:String(options.findIndex(row=>row.hash===exactArmourMod.hash))});
const afterEditor=pageApi.getDialogState().record.build;
assert.ok(afterEditor.armour[0].slotMods.some(row=>row.hash===exactArmourMod.hash));
assert.ok(afterEditor.armour[0].slotMods.some(row=>row.hash===retainedMod.hash),'Editing one socket must preserve the other saved mods, including legacy raw snapshots');
assert.ok(rawSavedArmour.mods.some(row=>row.hash===currentArmourMod.hash));
assert.equal(afterEditor.stats.length,0,'An edited build must not retain captured totals as if they were recalculated');
console.log('LOADOUT_QUICK_EDITOR=PASS selected socket changes preserve other saved sockets and original records');

// Run the actual page startup, event handlers and renderer with deferred reads.
// Strip imports so this VM cannot start persistence, background sync or live requests.
const bootSource=overviewSource.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settleReads=()=>new Promise(resolve=>setImmediate(resolve));
const raceRows=clone(manyRecords.slice(0,3));
function startLoadoutRace(){
  const reads=[],nodes=new Map(),listeners=new Map(),preparing=deferred(),profileReady=deferred();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,open:false,classList:{toggle(){}},addEventListener(){}});
    return nodes.get(id);
  };
  const forbidden=()=>{throw new Error('Unexpected persistence or network call in Loadout ordering test');};
  const context={URL,structuredClone,sessionBinding,classifyArmourPlug,LOADOUT_DEFINITIONS:{},
    document:{getElementById:node,querySelector:()=>null,addEventListener(){}},
    window:{addEventListener(type,handler){listeners.set(type,handler);}},
    mountForgeShell(){},reportPreparedPageStage(){},
    getBungieSession:async()=>({authenticated:true,activeDestinyMembership:binding}),
    loadPreparedPagePayload:async()=>({}),normalisePreparedPagePayload:value=>value,normaliseLiveProfile:()=>null,
    guardianManifest:{seedPayload(){},hydratePayload(){preparing.resolve();return profileReady.promise;}},
    createPreparedPageRefreshController:()=>({start(){}}),
    listParadoxLoadouts(){const read=deferred();reads.push(read);return read.promise;},
    saveParadoxLoadout:forbidden,deleteParadoxLoadout:forbidden,fetch:forbidden,
    localStorage:{getItem:forbidden,setItem:forbidden,removeItem:forbidden},indexedDB:{open:forbidden}
  };
  const done=runInNewContext(`(async()=>{${bootSource}\n})()`,context);
  return {reads,node,done,preparing:preparing.promise,
    ready(){profileReady.resolve({profile:{characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID}}}}});},
    change(type='forge:paradox-loadouts-changed'){listeners.get(type)({key:'astrix:paradox-saved-loadouts:v1'});}
  };
}
function assertThreeRendered(race,label){
  assert.equal(race.node('paradoxLoadoutCount').textContent,'3 SAVED',label);
  assert.equal((race.node('paradoxLoadoutList').innerHTML.match(/data-jump-id="saved-/g)||[]).length,3,label);
  assert.equal((race.node('paradoxLoadoutDetail').innerHTML.match(/data-build-record="saved-/g)||[]).length,3,label);
}
// Exact reported race: the early empty snapshot is held until preparation finishes.
{
  const race=startLoadoutRace();await race.preparing;
  race.reads[0].resolve([]);await settleReads();
  race.change();race.reads[1].resolve(clone(raceRows));await settleReads();
  assert.equal(race.node('paradoxLoadoutCount').textContent,'','The change event must still respect initial loading');
  race.ready();await race.done;
  assertThreeRendered(race,'A newer three-row event read must survive the profile-ready assignment');
}
// The startup promise itself may also finish after the newer change-event read.
{
  const race=startLoadoutRace();await race.preparing;
  race.change();race.reads[1].resolve(clone(raceRows));await settleReads();
  race.ready();await settleReads();race.reads[0].resolve([]);await race.done;
  assertThreeRendered(race,'A late empty startup read must not replace the newer list');
}
// Normal startup must render its rows, and later changes must still replace them.
{
  const race=startLoadoutRace();await race.preparing;
  race.reads[0].resolve(clone(raceRows));race.ready();await race.done;
  assertThreeRendered(race,'Startup without an event must render saved rows');
  race.change();race.reads[1].resolve([]);await settleReads();
  assert.equal(race.node('paradoxLoadoutCount').textContent,'0 SAVED','A newer empty list must replace older rows');
  race.change();race.reads[2].resolve(clone(raceRows));await settleReads();
  assertThreeRendered(race,'Changes after startup must render immediately');
}
// Overlapping change and cross-tab reads obey the same ordering rule.
for(const type of ['forge:paradox-loadouts-changed','storage']){
  const race=startLoadoutRace();await race.preparing;
  race.reads[0].resolve([]);race.ready();await race.done;
  race.change(type);race.change();
  race.reads[2].resolve(clone(raceRows));await settleReads();
  race.reads[1].resolve([]);await settleReads();
  assertThreeRendered(race,`An older ${type} read must not clobber a newer completed read`);
}
// A failed newer read must not discard the last successful snapshot.
{
  const race=startLoadoutRace();await race.preparing;
  race.change();race.reads[1].reject(new Error('Synthetic read failure'));await settleReads();
  race.reads[0].resolve(clone(raceRows));race.ready();await race.done;
  assertThreeRendered(race,'A rejected read must not supersede a successful snapshot');
  assert.equal(race.node('paradoxLoadoutStatus').textContent,'Synthetic read failure');
}
console.log('LOADOUT_READ_ORDERING=PASS startup, change events and cross-tab reads preserve the latest successful snapshot');

// Synthetic prepared transport: armour and its plugs arrive only in the index.
// Use the real manifest expansion and live profile normalizer, with no network.
globalThis.location={pathname:'/test/',search:'',href:'https://example.test/test/'};
const testElement=()=>({dataset:{},style:{},appendChild(){},append(){},setAttribute(){},addEventListener(){},querySelector:()=>null,insertAdjacentElement(){},removeAttribute(){}});
globalThis.document={head:testElement(),documentElement:{dataset:{}},getElementById:()=>null,querySelector:()=>null,createElement:testElement,addEventListener(){},dispatchEvent(){}};
globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.localStorage=globalThis.sessionStorage;
globalThis.addEventListener=()=>{};
globalThis.CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail;}};
const {GuardianManifestService}=await import('../pages/guardian-workspace-v2/guardian-manifest-service.mjs');
const {normalisePreparedPagePayload,normaliseLiveProfile}=await import('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs');
const equippedManifest=new GuardianManifestService({backend:true,fetchImpl:async()=>{throw new Error('Equipped preparation must use supplied definitions');}});
Object.assign(pageContext,{guardianManifest:equippedManifest,normalisePreparedPagePayload,normaliseLiveProfile});
const transport={manifestVersion:'test-equipped-v1',membership:{membershipId:MEMBERSHIP_ID,membershipType:3},definitions:{},artifactCatalog:[{hash:999,name:'Test Artifact',perks:[]}],profile:{characters:{data:{}},characterEquipment:{data:{}},itemComponents:{instances:{data:{}},sockets:{data:{}}}},forgeArmourIndex:{schemaVersion:5,transportEncoding:'shared-definitions-v1',manifestVersion:'test-equipped-v1',definitionTemplates:[],definitions:{},plugDefinitions:{},socketEntryDefinitions:[{},{},{},{},{}],socketLayouts:{armour:{socketEntryIds:[0,1,2,3,4]}}}};
const index=transport.forgeArmourIndex;
const testPlugs=[['Test general mod','armor.mods.general'],['Test slot mod','armor.mods.helmet'],['Paragon','armor.archetype'],['Test Shader','shader'],['Test Ornament','armor.skins']];
for(const [offset,[name,category]] of testPlugs.entries()){
  index.plugDefinitions[8000+offset]={templateId:index.definitionTemplates.length,hash:8000+offset,displayProperties:{name,icon:`/test-plug-${offset}.png`}};
  index.definitionTemplates.push({itemType:19,plug:{plugCategoryIdentifier:category}});
}
const expectedArmour=new Map();
for(const classType of [0,1,2]){
  const id=String(9300000+classType),items=[],expected=[];
  transport.profile.characters.data[id]={characterId:id,classType,light:550,stats:{}};
  transport.profile.characterEquipment.data[id]={items};
  for(const [slot,bucketHash] of ARMOUR_BUCKETS.entries()){
    const hash=10000+classType*10+slot,itemInstanceId=String(9400000+classType*10+slot);
    items.push({itemHash:hash,itemInstanceId,bucketHash});expected.push(itemInstanceId);
    index.definitions[hash]={templateId:index.definitionTemplates.length,hash,displayProperties:{name:`Test class ${classType} armour ${slot}`,icon:`/test-armour-${hash}.png`}};
    index.definitionTemplates.push({itemType:2,classType,inventory:{bucketTypeHash:bucketHash,tierTypeName:'Legendary'},socketLayoutKey:'armour'});
    transport.profile.itemComponents.instances.data[itemInstanceId]={primaryStat:{value:550-slot}};
    transport.profile.itemComponents.sockets.data[itemInstanceId]={sockets:testPlugs.map((_,offset)=>({plugHash:8000+offset,isEnabled:true,isVisible:true}))};
  }
  expectedArmour.set(id,expected);
}
const preparedEquipped=await pageApi.preparePayload(clone(transport));
assert.ok(preparedEquipped.definitions['10000']?.inventory,'The supplied armour index must be expanded before live equipment is normalized');
pageApi.setState({records:[],characterId:'',session:{authenticated:true,activeDestinyMembership:transport.membership},equipped:null,payload:preparedEquipped});
for(const [id,expected] of expectedArmour){
  pageApi.setCharacter(id);
  const current=pageApi.draftFor('equipped').build;
  assert.deepEqual(Array.from(current.armour,item=>item?.itemInstanceId),expected,'Equipped and Save PARADOX must use all five items from the selected character');
  assert.deepEqual(Array.from(current.armour,item=>item.power),[550,549,548,547,546]);
  const rendered=pageNode('paradoxLoadoutDetail').innerHTML;
  assert.equal((rendered.match(/class="saved-build-tile is-equipment/g)||[]).length,5);
  const mods=rendered.split('aria-label="Armour mods">')[1].split('<div class="saved-build-artifact"')[0];
  assert.equal((mods.match(/<figure /g)||[]).length,10,'Render both installed mods on each of the five armour pieces');
  assert.doesNotMatch(mods,/Paragon|Test Shader|Test Ornament|Mods not saved/,'Archetypes and cosmetics must remain outside the mod grid');
  assert.match(rendered,/Test Shader/);assert.match(rendered,/Test Ornament/);
  assert.doesNotMatch(rendered,/>Not saved<\/p><\/div><div class="saved-build-stats"/);
}
const refreshed=clone(transport),selectedCharacter='9300002';
refreshed.profile.characterEquipment.data[selectedCharacter].items.shift();
const refreshedEquipped=await pageApi.preparePayload(refreshed);
pageApi.setState({records:[],characterId:selectedCharacter,session:{authenticated:true,activeDestinyMembership:transport.membership},equipped:null,payload:refreshedEquipped});
pageApi.setCharacter(selectedCharacter);
assert.equal(pageApi.draftFor('equipped').build.armour[0],null,'A refreshed missing item must not be borrowed from a saved build, another character or the previous profile');
const mismatched=clone(transport);mismatched.forgeArmourIndex.manifestVersion='stale-test-index';
await assert.rejects(pageApi.preparePayload(mismatched),/armour index/i,'Reject an index that does not match the prepared profile manifest');
const alreadyResolved=clone(preparedEquipped);delete alreadyResolved.forgeArmourIndex;
assert.ok((await pageApi.preparePayload(alreadyResolved)).definitions['10000'],'Fresh profiles with resolved definitions must also remain supported');
console.log('LOADOUT_EQUIPPED_ARMOUR=PASS prepared index, three Guardians, five slots, live mods, appearance, fresh profile and version guard');

// Prompt 8: the recommended result has one committing action, with Back/Test
// secondary, and every app entry point opts into the same action tokens.
const actionPalette=readFileSync(new URL('../../css/astrix-palette.css',import.meta.url),'utf8');
const actionBuildHtml=readFileSync(new URL('../pages/guardian-workspace-v2/paradox-build-space/index.html',import.meta.url),'utf8');
assert.match(actionBuildHtml,/<button[^>]*class="primary"[^>]*id="applyBuild"/,'Apply must be the primary Recommended Build action.');
assert.match(actionBuildHtml,/<button[^>]*class="ghost-btn test-build-review-btn"[^>]*id="continueToBuildTest"/,'Test must be secondary to Apply.');
assert.match(actionBuildHtml,/<button[^>]*class="ghost-btn"[^>]*id="returnToForge"/,'Back must be secondary to Apply.');
assert.match(actionPalette,/@layer astrix-button-tiers/,'Shared action tokens must outrank legacy important page cosmetics.');
assert.deepEqual([...new Set([...actionPalette.matchAll(/--apx-button-(\w+)-background:/g)].map(match=>match[1]))].sort(),['primary','secondary'],'Only primary and secondary action tiers may be defined.');
assert.doesNotMatch(actionPalette,/--apx-icon-|(?:^|[;{])\s*(?:width|height|font-size|transform|filter)\s*:/m,'Action hierarchy must not resize or recolour game artwork.');
for(const page of ['index.html','components/guardian-workspace/guardian-workspace.html','pages/guardian-workspace-v1/index.html','pages/guardian-workspace-v2/index.html','pages/guardian-workspace-v2/paradox-build-space/index.html','pages/guardian-workspace-v2/shooting-range-test/index.html','pages/journey/index.html','pages/vault/index.html','pages/loadout/index.html','pages/mission-reports/index.html','pages/tool-intro/index.html']){
  const html=readFileSync(new URL(`../${page}`,import.meta.url),'utf8');
  assert.match(html,/<body\b[^>]*\bdata-apx-button-system(?:\s|>)/,`${page} must opt into the shared button system.`);
  assert.match(html,/href="\/css\/astrix-palette\.css\?v=20260923-button-tiers-1"/,`${page} must load the current shared action tokens.`);
}
assert.doesNotMatch(readFileSync(new URL('../pages/forge-loader/index.html',import.meta.url),'utf8'),/apx-button-system/,'Forge Loader must retain its existing presentation.');
console.log('SHARED_BUTTON_HIERARCHY=PASS one primary review action, two shared tiers, eleven entry points, Forge Loader and artwork excluded');
