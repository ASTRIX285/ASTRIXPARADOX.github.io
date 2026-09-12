#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLiveTransferPlan} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {createLiveTransferPreflight} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {filterManualEquipmentSources,eligibleEquipment,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import {createBuildState,createWorkingBuildPatch,createBuildPersistenceSnapshot,restoreBuildPersistenceSnapshot} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {cacheBuildForgeState,readBuildForgeState} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';
import {compactBuild,createParadoxLoadoutRecord,validateParadoxLoadoutRecord} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs';
import {characterActivityRestriction,confirmBungieLoadoutAction,confirmLiveTransferPlan,confirmPostmasterCollectionIntent,confirmVaultTransferIntent,executeBungieLoadoutAction,executeLiveTransferPlan,executePostmasterCollectionIntent,executeVaultTransferIntent,stageBungieLoadoutAction,stageLiveTransferPreflight,stagePostmasterCollectionIntent,stageVaultTransferIntent} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs';
import {INVENTORY_GROUPS,inventoryGroupsMarkup,inventoryItemMarkup,itemState} from '../shared/guardian-inventory-workspace.mjs';

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
const sharedTile={...replacement,itemInstanceId:'13109',icon:'https://www.bungie.net/weapon.png',state:5,equipmentGroup:INVENTORY_GROUPS.find(group=>group.key==='special'),power:550,quantity:2,releaseWatermark:{icon:'/season.png'},weaponSemantics:{intrinsic:{name:'Adaptive Frame',icon:'/adaptive.png'}},breakerDefinition:{displayProperties:{name:'Barrier',icon:'/barrier.png'}},elementDefinition:{displayProperties:{name:'Arc',icon:'/arc.png'}},source:{kind:'vault',characterId:null}};
assert.deepEqual(itemState(sharedTile),{raw:5,locked:true,masterworked:true},'The shared tile must derive locked and masterwork overlays from Bungie item state bits.');
const sharedTileMarkup=inventoryItemMarkup(sharedTile,{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(sharedTileMarkup,/class="item-tile item-tile--weapon item-tile--legendary item-tile--masterworked"/,'Legendary rarity and masterwork must remain independent shared tile classes.');
assert.match(sharedTileMarkup,/class="tile-lock" aria-label="Locked"/,'The shared tile must render the real locked state as an icon-only art overlay.');
assert.match(sharedTileMarkup,/class="tile-tier-strip" aria-label="Masterworked"/,'The shared tile must expose the real masterwork state on the tier strip.');
assert.equal([...sharedTileMarkup.matchAll(/class="tile-tier-pip tile-tier-pip--\d"/g)].length,5,'The shared tile must render all five approved masterwork pip regions.');
assert.match(sharedTileMarkup,/class="tile-power"[^>]*><b>550<\/b>/,'The weapon power readout must keep the real power value without duplicating its separate element socket.');
assert.match(sharedTileMarkup,/class="tile-corner-badge"[^>]*><img[^>]*\/adaptive\.png/,'The weapon corner badge must use the resolved Bungie intrinsic icon.');
assert.match(sharedTileMarkup,/class="tile-intrinsic"[^>]*><img[^>]*\/barrier\.png/,'The weapon champion socket must use the resolved Bungie breaker definition icon.');
assert.match(sharedTileMarkup,/class="tile-element"[^>]*><img[^>]*\/arc\.png/,'The weapon element socket must use the resolved Bungie damage definition icon.');
assert.match(sharedTileMarkup,/class="tile-season-icon"[^>]*><img[^>]*\/season\.png/,'The source socket must use the resolved Bungie release watermark icon.');
assert.match(sharedTileMarkup,/class="tile-art"><img[^>]*\/weapon\.png/,'The shared tile art must keep the real Bungie item icon source.');
assert.match(sharedTileMarkup,/title="Vault Energy Weapon"/,'The shared tile must expose only its item name through the native hover tooltip.');
assert.doesNotMatch(sharedTileMarkup,/vault-transfer-name|>EQUIPPED<|>LOCK</,'The shared tile must not restore permanent names or plain text state labels.');
assert.match(sharedTileMarkup,/data-direct-equip-item="13109"/,'An exact Vault instance must advertise reviewed direct equip when the live capabilities allow it.');
const exoticTileMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13112',isExotic:true,state:0},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(exoticTileMarkup,/item-tile--exotic/,'Real Exotic rarity must apply the Exotic tile class.');
assert.doesNotMatch(exoticTileMarkup,/item-tile--masterworked|class="tile-lock"/,'An unlocked non-masterworked Exotic must not gain either independent state class or overlay.');
assert.match(exoticTileMarkup,/class="tile-tier-strip" aria-label="Not masterworked"/,'A non-masterworked tile keeps the neutral tier rail required by the shared design.');
const armourTileMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13113',equipmentGroup:INVENTORY_GROUPS.find(group=>group.key==='helmet'),weaponSemantics:undefined,intrinsic:undefined,breakerDefinition:undefined,elementDefinition:undefined,setBonus:{identity:{name:'Verified Set',icon:'/set.png'}},armourSemantics:{archetype:{name:'Brawler',icon:'/brawler.png'}},isExotic:false},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.match(armourTileMarkup,/class="tile-corner-badge"[^>]*><img[^>]*\/set\.png/,'The armour corner badge must use the resolved Bungie equipable set icon.');
assert.doesNotMatch(armourTileMarkup,/class="tile-intrinsic"|class="tile-element"/,'Weapon-only sockets must be absent from armour tile markup.');
const unresolvedSocketMarkup=inventoryItemMarkup({...sharedTile,itemInstanceId:'13114',releaseWatermark:null,tierIcon:null,weaponSemantics:{},intrinsic:null,breakerDefinition:null,elementDefinition:null},{capabilities:session.capabilities.destinyActions,activeCharacterId:CHARACTER_ID});
assert.doesNotMatch(unresolvedSocketMarkup,/class="tile-corner-badge"|class="tile-intrinsic"|class="tile-element"|class="tile-season-icon"/,'A socket without a proven real icon source must be absent, never replaced with invented content.');
const sharedTileCss=readFileSync(new URL('../shared/item-tile.css',import.meta.url),'utf8');
for(const selector of ['tile-art','tile-power','tile-corner-badge','tile-tier-strip','tile-tier-pip','tile-season-icon','tile-lock','tile-intrinsic','tile-element'])assert.match(sharedTileCss,new RegExp(`\\.vault-transfer-item\\.has-item-tile \\.${selector}`),`${selector} styling must stay scoped to the shared inventory tile.`);
assert.match(sharedTileCss,/\.tile-art img\s*\{[^}]*object-fit:\s*contain/s,'Real shared item art must render uncropped inside its proportional Figma region.');
assert.match(sharedTileCss,/height:\s*var\(--apx-icon-gear-art-height\);\s*aspect-ratio:\s*100\/122/,'The implemented tile must retain the compact canonical proportions shown by the approved Figma target.');
assert.match(sharedTileCss,/\.tile-tier-strip\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent/s,'The tier rail must be an open overlay instead of a dark container over the item art.');
assert.match(sharedTileCss,/\.tile-intrinsic,[\s\S]*\.tile-corner-badge\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent/s,'Footer and corner icons must remain unboxed overlays.');
assert.doesNotMatch(sharedTileCss,/PLACEHOLDER|^\.item-tile\s*\{/m,'The shipped shared tile CSS must contain neither placeholder fills nor unscoped tile selectors.');
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
assert.deepEqual(pacedWaits,[250,1000,250,500,250,550,550],'The Apply sequence must pace actions, honour Bungie throttle seconds and wait for transferred inventory visibility.');
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
function vaultActionProfile({location='source',equipped=false,replacementEquipped=false,postmaster=false,targetEquipped=false}={}){
  const transferRaw={itemHash:TRANSFER_ITEM.itemHash,itemInstanceId:TRANSFER_ITEM.itemInstanceId,bucketHash:postmaster?215593132:TRANSFER_ITEM.bucketHash},replacementRaw={itemHash:REPLACEMENT_ITEM.itemHash,itemInstanceId:REPLACEMENT_ITEM.itemInstanceId,bucketHash:REPLACEMENT_ITEM.bucketHash};
  return {ErrorCode:1,profile:{
    characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID},[OTHER_CHARACTER_ID]:{characterId:OTHER_CHARACTER_ID}}},
    profileInventory:{data:{items:location==='vault'?[{...transferRaw,bucketHash:VAULT_BUCKET}]:[]}},
    characterInventories:{data:{
      [CHARACTER_ID]:{items:[...(location==='source'&&!equipped?[transferRaw]:[]),...(equipped&&!replacementEquipped?[replacementRaw]:[]),...(equipped&&replacementEquipped?[transferRaw]:[]),...(postmaster?[transferRaw]:[])]},
      [OTHER_CHARACTER_ID]:{items:location==='target'?[transferRaw]:[]}
    }},
    characterEquipment:{data:{[CHARACTER_ID]:{items:equipped&&!replacementEquipped?[transferRaw]:replacementEquipped?[replacementRaw]:[]},[OTHER_CHARACTER_ID]:{items:targetEquipped?[transferRaw]:[]}}},
    characterActivities:{data:{[CHARACTER_ID]:{currentActivityHash:0,currentActivityModeType:0},[OTHER_CHARACTER_ID]:{currentActivityHash:0,currentActivityModeType:0}}}
  }};
}

const stagedVaultMove=stageVaultTransferIntent({item:TRANSFER_ITEM,destination:{kind:'character',characterId:OTHER_CHARACTER_ID},session});
let unconfirmedVaultCalls=0;
await assert.rejects(()=>executeVaultTransferIntent(stagedVaultMove,{session,fetchImpl:async()=>{unconfirmedVaultCalls+=1;return response({ErrorCode:1});},authOrigin:'https://auth.test'}),/Final user confirmation/);
assert.equal(unconfirmedVaultCalls,0,'An unconfirmed drag transfer must make zero Bungie requests.');
let moveLocation='source';
const movePaths=[];
const moved=await executeVaultTransferIntent(confirmVaultTransferIntent(stagedVaultMove),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase();
  if(method==='GET')return response(vaultActionProfile({location:moveLocation}));
  movePaths.push(path);
  const body=JSON.parse(init.body);
  moveLocation=body.transferToVault?'vault':'target';
  return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(moved.status,'applied');
assert.deepEqual(movePaths,['/bungie/actions/transfer-item','/bungie/actions/transfer-item'],'A Guardian to Guardian drop must move through Vault using the existing exact transfer endpoint.');
assert.deepEqual(moved.readback.actual,{kind:'carried',characterId:OTHER_CHARACTER_ID});

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
let postmasterPresent=true;
const postmasterPaths=[];
const collected=await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(stagedCollection),{session,authOrigin:'https://auth.test',waitImpl:async()=>{},fetchImpl:async(url,init={})=>{
  const path=new URL(String(url)).pathname,method=String(init.method||'GET').toUpperCase(),base=vaultActionProfile();
  base.profile.characterInventories.data[CHARACTER_ID].items=postmasterPresent?[{itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:215593132}]:[];
  if(!postmasterPresent)base.profile.profileInventory.data.items=[{itemHash:POSTMASTER_ITEM.itemHash,itemInstanceId:POSTMASTER_ITEM.itemInstanceId,bucketHash:POSTMASTER_ITEM.bucketHash}];
  if(method==='GET')return response(base);
  postmasterPaths.push(path);postmasterPresent=false;return response({ErrorCode:1,Message:'Ok'});
}});
assert.equal(collected.status,'applied');
assert.deepEqual(postmasterPaths,['/bungie/actions/pull-from-postmaster'],'Collect Postmaster must use Bungie PullFromPostmaster, not the Vault transfer route.');
assert.equal(collected.readback.verified,true,'Postmaster readback must accept the real Bungie destination bucket when an item leaves Postmaster.');

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
