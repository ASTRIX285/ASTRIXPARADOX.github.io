import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ARMOUR_STAT_CAP,armourTargetMaximums,compareArmourScores,matchArmourBuilds,matchTopArmourBuilds,normaliseStatPriorities,normaliseTargets,scoreArmourStats} from '../pages/vault/vault-armour-matcher.mjs';
import {applyVaultArmourSelection,clearVaultArmourSelection,compactArmourSelectionItem,createVaultArmourSelection,readVaultArmourSelection,validateVaultArmourSelection,writeVaultArmourSelection} from '../pages/vault/vault-selection-state.mjs';
import {createOpenProtocolTieBreaker,exoticCatalogueGroups,naturalSetProtocols,ownedExoticGroups,rankOpenProtocolCandidates,setBonusOptions,setSelectionFeasible,toggleSetSelection,unownedSetTargets} from '../pages/forge-loader/forge-loader-model.mjs';
import {BUILD_SNAPSHOT_KEY,BUILD_SPACE_KEY,LAST_LOADOUT_KEY,compactForgeLoaderProfileBuild,createForgeLoaderBuildSnapshot,writeForgeLoaderBuildSnapshot} from '../pages/forge-loader/forge-loader-build-handoff.mjs';
import {validateHandoffEnvelope} from '../pages/guardian-workspace-v2/paradox-build-binding.mjs';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {createVaultCatalogue,modFreeArmourStatValue} from '../pages/vault/vault-inventory.mjs';
import {releaseGuardianSessionStorageFallbacks} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(new URL(path,`file://${root}/`),'utf8');
const set=(hash,name)=>({hash,unresolved:false,identity:{name,description:`${name} description`,icon:''},twoPiece:{requiredSetCount:2,name:`${name} two`,description:'Two-piece effect',icon:`/set-${hash}-2.png`},fourPiece:{requiredSetCount:4,name:`${name} four`,description:'Four-piece effect',icon:`/set-${hash}-4.png`}});
const stats=value=>[{name:'Health',value},{name:'Weapon',value:Math.max(1,12-value)}];
const item=(slot,itemHash,instance,value,{exotic=false,setHash=null,name=`Item ${instance}`}={})=>({slotIndex:slot,slotKey:['helmet','gauntlets','chest','legs','class-item'][slot],slotLabel:['Helmet','Gauntlets','Chest','Legs','Class Item'][slot],itemHash,itemInstanceId:instance,name,icon:'/item.png',characterClass:'hunter',isExotic:exotic,totalStats:value+Math.max(1,12-value),stats:stats(value),setBonus:setHash?set(setHash,setHash===7001?'Seraph Protocol':setHash===7002?'Deep Protocol':'Duplicate Protocol'):null});

const items=[
  item(0,9001,'exotic-low',3,{exotic:true,name:'Verified Exotic'}),
  item(0,9001,'exotic-high',9,{exotic:true,name:'Verified Exotic'}),
  item(0,9004,'exotic-reissue',15,{exotic:true,name:'Verified Exotic'}),
  item(1,1101,'a-1',8,{setHash:7001}),item(2,1102,'a-2',7,{setHash:7001}),item(3,1103,'a-3',6,{setHash:7001}),item(4,1104,'a-4',5,{setHash:7001}),
  item(1,1201,'b-1',4,{setHash:7002}),item(2,1202,'b-2',4,{setHash:7002}),
  item(1,1301,'c-1a',10,{setHash:7003}),item(1,1301,'c-1b',9,{setHash:7003}),
  item(2,1402,'filler-2',2),item(3,1403,'filler-3',2),item(4,1404,'filler-4',2)
];

const exotics=ownedExoticGroups(items,'hunter');
assert.equal(exotics.length,1,'Forge Loader must show one tile per owned Exotic definition.');
assert.equal(exotics[0].instances.length,3,'Duplicate and reissued Exotic instances must remain available to the solver.');
assert.deepEqual(exotics[0].hashes,[9001,9004],'One Exotic identity must retain every owned Bungie item hash behind its single tile.');
assert.equal(exotics[0].representative.itemInstanceId,'exotic-reissue','The strongest exact copy across every owned hash must lead the Exotic tile.');
assert.equal(ownedExoticGroups(items,'titan').length,0,'The Exotic selector must isolate the selected Guardian class.');
const definitions={
  9001:{hash:9001,itemType:2,classType:1,equippable:true,inventory:{tierType:6,tierTypeName:'Exotic',bucketTypeHash:3448274439},displayProperties:{name:'Verified Exotic',icon:'/item.png'}},
  9002:{hash:9002,itemType:2,classType:1,equippable:true,inventory:{tierType:6,tierTypeName:'Exotic',bucketTypeHash:3551918588},displayProperties:{name:'Unowned Hunter Exotic',description:'Verified collection definition',icon:'/unowned.png'}},
  9003:{hash:9003,itemType:2,classType:0,equippable:true,inventory:{tierType:6,tierTypeName:'Exotic',bucketTypeHash:3551918588},displayProperties:{name:'Titan Exotic',icon:'/titan.png'}},
  9004:{hash:9004,itemType:2,classType:1,equippable:true,inventory:{tierType:6,tierTypeName:'Exotic',bucketTypeHash:3448274439},displayProperties:{name:'Verified Exotic',icon:'/item-reissue.png'}},
  9005:{hash:9005,itemType:2,classType:1,equippable:true,inventory:{tierType:6,tierTypeName:'Exotic',bucketTypeHash:3551918588},displayProperties:{name:'Unowned Hunter Exotic',description:'Reissued collection definition',icon:'/unowned-reissue.png'}}
};
const buckets=[
  {hash:3448274439,key:'helmet',label:'Helmet'},
  {hash:3551918588,key:'gauntlets',label:'Gauntlets'},
  {hash:14239492,key:'chest',label:'Chest'},
  {hash:20886954,key:'legs',label:'Legs'},
  {hash:1585787867,key:'class-item',label:'Class Item'}
];
const catalogueExotics=exoticCatalogueGroups(items,definitions,'hunter',buckets);
assert.equal(catalogueExotics.length,2,'Forge Loader must combine owned instances with verified unowned collection definitions for the selected class.');
assert.equal(catalogueExotics.find(row=>row.name==='Verified Exotic')?.owned,true,'Owned Exotic identities must remain selectable instance groups.');
assert.deepEqual(catalogueExotics.find(row=>row.name==='Unowned Hunter Exotic')?.hashes,[9002,9005],'Reissued unowned definitions must collapse into one visibly distinct collection tile.');
assert.equal(catalogueExotics.some(row=>row.hash===9003),false,'Exotic collection entries must remain isolated to the selected Guardian class.');

const exotic=exotics[0];
assert.equal(setSelectionFeasible(items,exotic,[{setHash:7001,count:4}]),true,'A legal four-slot set must enable its four-piece bonus.');
assert.equal(setSelectionFeasible(items,exotic,[{setHash:7003,count:2}]),false,'Duplicate items in one slot must not unlock a two-piece bonus.');
assert.equal(setSelectionFeasible(items,exotic,[{setHash:7001,count:2},{setHash:7002,count:2}]),true,'Two compatible two-piece bonuses must be selectable together.');

let options=setBonusOptions(items,exotic,[]);
assert.equal(options.find(row=>row.hash===7001)?.four.disabled,false,'Four compatible pieces must enable the four-piece checkbox.');
assert.equal(options.find(row=>row.hash===7001)?.four.owned,true,'An owned four-piece trait must receive the available visual state.');
assert.equal(options.find(row=>row.hash===7002)?.four.disabled,true,'Two compatible pieces must not enable a four-piece checkbox.');
assert.equal(options.find(row=>row.hash===7002)?.four.owned,false,'A four-piece trait without four compatible owned slots must retain the unavailable visual state.');
assert.equal(options.find(row=>row.hash===7003)?.two.disabled,true,'Two copies in the same slot must keep the two-piece checkbox disabled.');

let selected=toggleSetSelection(items,exotic,[],{setHash:7001,count:4},true);
options=setBonusOptions(items,exotic,selected);
assert.equal(selected.length,1);assert.equal(selected[0].count,4);
assert.equal(options.find(row=>row.hash===7001)?.two.disabled,true,'Selecting four-piece must disable its two-piece checkbox.');
assert.equal(options.find(row=>row.hash===7002)?.two.disabled,true,'Selecting four-piece must disable other set bonuses.');

selected=toggleSetSelection(items,exotic,[],{setHash:7001,count:2},true);
selected=toggleSetSelection(items,exotic,selected,{setHash:7002,count:2},true);
options=setBonusOptions(items,exotic,selected);
assert.equal(selected.length,2,'A second compatible two-piece bonus must remain selectable.');
assert.ok(options.every(row=>row.four.disabled),'Any two-piece selection must disable every four-piece checkbox.');
assert.equal(options.find(row=>row.hash===7003)?.two.disabled,true,'After two two-piece choices, all remaining two-piece choices must be disabled.');

const grenadeSet=set(7100,'Grenade Protocol');
grenadeSet.fourPiece={...grenadeSet.fourPiece,description:'Grenade final blows improve grenade energy.'};
const openScore=scoreArmourStats({health:40,weapon:40},{health:40});
const synergisticCandidate={items:[item(0,9001,'open-exotic',8,{exotic:true,name:'Verified Exotic'}),...([1,2,3,4].map(slot=>({...item(slot,7100+slot,`grenade-${slot}`,8),setBonus:grenadeSet})))],score:openScore,signature:'synergy'};
const plainCandidate={items:[item(0,9001,'plain-exotic',8,{exotic:true,name:'Verified Exotic'}),...([1,2,3,4].map(slot=>item(slot,7200+slot,`plain-${slot}`,8)))],score:openScore,signature:'plain'};
assert.equal(naturalSetProtocols(synergisticCandidate)[0]?.count,4,'Open Armour must recognise the naturally active verified four-piece protocol in each candidate.');
const openRanked=rankOpenProtocolCandidates([plainCandidate,synergisticCandidate],{exoticPerk:{name:'Grenade anchor',description:'Improves grenade energy.'}});
assert.equal(openRanked[0]?.signature,'synergy','Equal-target Open Armour candidates must prefer explicit Exotic-to-set perk evidence.');
assert.deepEqual(openRanked[0]?.openProtocol?.evidence,['grenade'],'Open Armour may use only explicit verified combat terms as synergy evidence.');
const openTieBreaker=createOpenProtocolTieBreaker({exoticPerk:{name:'Grenade anchor',description:'Improves grenade energy.'}});
assert.equal(openTieBreaker(synergisticCandidate.items),1,'The bounded scanner must score verified Exotic-to-set evidence before discarding lower-stat combinations.');
assert.equal(openTieBreaker(plainCandidate.items),0,'The bounded scanner must not invent Open Armour synergy for a candidate without an active matching set trait.');
const synergyScanItems=[item(0,9600,'synergy-scan-exotic',8,{exotic:true,name:'Synergy Scan Exotic'})];
for(let slot=1;slot<5;slot++){
  synergyScanItems.push({...item(slot,9600+slot,`synergy-low-${slot}`,2),setBonus:grenadeSet});
  synergyScanItems.push(item(slot,9700+slot,`plain-high-${slot}`,10));
}
const synergyScan=matchTopArmourBuilds(synergyScanItems,{}, {fixedExoticHashes:[9600],fixedExoticSlot:0,autoMaximum:true,limit:1,secondaryScore:openTieBreaker});
assert.equal(synergyScan[0]?.secondaryRank,1,'Verified Open Armour synergy must be ranked across the complete pool before the scanner retains only its top results.');
assert.ok(synergyScan[0]?.items.filter(row=>row.setBonus?.hash===grenadeSet.hash).length>=2,'The retained synergy result must contain enough matching armour to activate its verified set trait.');

const targetDefinitions={
  ...definitions,
  8101:{hash:8101,itemType:2,classType:1,equippable:true,equipableItemSetHash:8001,collectibleHash:8201,displaySource:'Earned from the verified test activity.',inventory:{tierType:5,bucketTypeHash:3551918588},displayProperties:{name:'Target Gauntlets',icon:'/target.png'}},
  8102:{hash:8102,itemType:2,classType:1,equippable:true,equipableItemSetHash:8001,collectibleHash:8202,inventory:{tierType:5,bucketTypeHash:14239492},displayProperties:{name:'Target Chest',icon:'/target.png'}},
  8103:{hash:8103,itemType:2,classType:1,equippable:true,equipableItemSetHash:8001,collectibleHash:8203,inventory:{tierType:5,bucketTypeHash:20886954},displayProperties:{name:'Target Legs',icon:'/target.png'}},
  8104:{hash:8104,itemType:2,classType:1,equippable:true,equipableItemSetHash:8001,collectibleHash:8204,inventory:{tierType:5,bucketTypeHash:1585787867},displayProperties:{name:'Target Class Item',icon:'/target.png'}}
};
const targetSetDefinitions={8001:{hash:8001,displayProperties:{name:'Target Protocol'},setPerks:[{requiredSetCount:4,sandboxPerkHash:8301}]}};
const targetSandboxPerks={8301:{hash:8301,displayProperties:{name:'Grenade Circuit',description:'Grenade final blows improve grenade energy.',icon:'/grenade-circuit.png'}}};
const targetRecommendations=unownedSetTargets({definitions:targetDefinitions,setDefinitions:targetSetDefinitions,sandboxPerks:targetSandboxPerks,ownedItems:items,fixedExotic:{...exotic,exoticPerk:{name:'Grenade anchor',description:'Improves grenade energy.'}},className:'hunter',armourBuckets:buckets});
assert.equal(targetRecommendations[0]?.setHash,8001,'The optional target upgrade must evaluate unowned verified set definitions for the active class.');
assert.equal(targetRecommendations[0]?.count,4,'The target upgrade must identify the highest evidence-bound set threshold that can fit around the Exotic.');
assert.equal(targetRecommendations[0]?.missingPieces.length,4,'The target upgrade must retain the missing compatible armour slots without treating them as owned.');
assert.deepEqual(targetRecommendations[0]?.displaySources,['Earned from the verified test activity.'],'The target upgrade must carry only Bungie-provided acquisition source text.');

const constrained={fixedExoticHashes:exotic.hashes,fixedExoticSlot:0,setSelections:[{setHash:7001,count:4}]};
const maximums=armourTargetMaximums(items,constrained);
assert.equal(maximums.health,41,'Stat ceilings must include the best owned Exotic copy across every hash and the required four-piece set.');
assert.equal(ARMOUR_STAT_CAP,200,'Every Armour 3.0 stat must use the absolute 200-point ceiling.');
assert.equal(normaliseTargets({health:210}).health,200,'A requested stat target must never exceed 200.');
assert.equal(scoreArmourStats({health:210},{health:200}).effectiveStats.health,200,'Ranking must treat any raw per-stat overflow as 200 effective points.');
assert.deepEqual(normaliseStatPriorities({health:1,melee:1,grenade:6,super:8}),{health:1,melee:0,grenade:6,super:0,class:0,weapon:0},'Priority ranks must be unique and remain inside the six-stat order.');
const automaticMaximum=scoreArmourStats({health:90,melee:100},{health:100,melee:100});
const lowerAutomaticTotal=scoreArmourStats({health:100,melee:80},{health:100,melee:100});
assert.ok(compareArmourScores(automaticMaximum,lowerAutomaticTotal)<0,'With no explicit priority, ranking must select the strongest maximum-stat result after target shortfall.');
const healthFirst=scoreArmourStats({health:100,melee:0},{health:100,melee:100},{health:1,melee:2});
const aggregateFirst=scoreArmourStats({health:90,melee:100},{health:100,melee:100},{health:1,melee:2});
assert.ok(compareArmourScores(healthFirst,aggregateFirst)<0,'Priority 1 must outrank a lower aggregate shortfall when the user explicitly orders the stats.');
const untargetedMaximum=matchArmourBuilds(items,{},{...constrained,autoMaximum:true});
assert.equal(untargetedMaximum[0]?.items[0]?.itemInstanceId,'exotic-reissue','With no user stat target or rank, the solver must still choose the strongest maximum-stat owned load.');
const matches=matchArmourBuilds(items,{health:35},{...constrained,all:true});
assert.equal(matches.length,3,'The Forge Loader must return every legal exact-instance combination rather than an arbitrary top-five subset.');
assert.equal(matches[0].items[0].itemInstanceId,'exotic-reissue','The solver must rank the strongest exact duplicate or reissued Exotic instance first.');
assert.equal(matches[0].items.filter(row=>row.setBonus?.hash===7001).length,4,'Every returned load must honour the selected four-piece protocol.');
const topMatches=matchTopArmourBuilds(items,{health:35},{...constrained,limit:2});
assert.equal(topMatches.length,2,'The bounded Forge scan must retain only the requested number of highest-ranking combinations.');
assert.equal(topMatches.combinationsEvaluated,3,'The bounded Forge scan must count every legal exact owned combination without retaining the full result array.');
assert.deepEqual(topMatches.map(row=>row.signature),matches.slice(0,2).map(row=>row.signature),'The memory-safe top-result scan must preserve the exact exhaustive ranking order.');
const scanItems=[item(0,9500,'scan-exotic-a',11,{exotic:true,name:'Scan Exotic'}),item(0,9500,'scan-exotic-b',7,{exotic:true,name:'Scan Exotic'})];
for(let slot=1;slot<5;slot++)for(let index=0;index<4;index++)scanItems.push(item(slot,9500+slot*10+index,`scan-${slot}-${index}`,2+slot*3+index));
const scanOptions={fixedExoticHashes:[9500],fixedExoticSlot:0,autoMaximum:true,statPriorities:{health:1,weapon:2}};
const exhaustiveScan=matchArmourBuilds(scanItems,{health:40,weapon:25},{...scanOptions,all:true});
const boundedScan=matchTopArmourBuilds(scanItems,{health:40,weapon:25},{...scanOptions,limit:7});
assert.equal(boundedScan.combinationsEvaluated,exhaustiveScan.length,'The top-result scan must evaluate the complete unconstrained legal pool.');
assert.deepEqual(boundedScan.map(row=>row.signature),exhaustiveScan.slice(0,7).map(row=>row.signature),'The top-result scan must match exhaustive priority and stat ordering before discarding lower results.');
const installedHealthMod={name:'Health Mod',isEnabled:true,definition:{displayProperties:{name:'Health Mod'},plug:{plugCategoryIdentifier:'armor.mods.general'},investmentStats:[{statTypeHash:91001,value:10,isConditionallyActive:false}]}};
assert.deepEqual(modFreeArmourStatValue({statDefinitions:{91001:{displayProperties:{name:'Health'}}}},91001,72,[installedHealthMod]),{rawValue:72,installedModContribution:10},'Forge Loader raw ranking must preserve Bungie ItemStats while carrying installed plug contributions as separate evidence.');
const plugSetPayload={definitions:{99001:{hash:99001,itemType:2,classType:1,displayProperties:{name:'Plug Set Helmet',icon:'/helmet.png'},inventory:{tierType:5,tierTypeName:'Legendary',bucketTypeHash:3448274439},sockets:{socketEntries:[{reusablePlugSetHash:99003}],socketCategories:[{socketCategoryHash:99004,socketIndexes:[0]}]}},99002:{hash:99002,itemType:19,displayProperties:{name:'Health Mod',description:'Improves Health.',icon:'/mod.png'},plug:{plugCategoryIdentifier:'armor.mods.general',energyCost:3},investmentStats:[{statTypeHash:91001,value:10,isConditionallyActive:false}]}},statDefinitions:{91001:{displayProperties:{name:'Health',icon:'/health.png'}}},socketCategoryDefinitions:{99004:{displayProperties:{name:'General Armor Mod'}}},profile:{profileInventory:{data:{items:[{itemHash:99001,itemInstanceId:'plug-set-helmet',bucketHash:138197802}]}},characterInventories:{data:{}},characterEquipment:{data:{}},profilePlugSets:{data:{plugs:{99003:[{plugItemHash:99002,canInsert:true,enabled:true}]}}},characterPlugSets:{data:{}},itemComponents:{sockets:{data:{'plug-set-helmet':{sockets:[{plugHash:99002,isEnabled:true,isVisible:true}]}}},instances:{data:{'plug-set-helmet':{gearTier:5,energy:{energyCapacity:10,energyUsed:3}}}},stats:{data:{'plug-set-helmet':{stats:{91001:{value:72}}}}}}}};
const plugSetArmour=createVaultCatalogue(plugSetPayload).armour[0];
assert.equal(plugSetArmour.stats[0].value,72,'Owned armour ranking must retain the Bungie ItemStats value as its raw mod-free source.');
assert.equal(plugSetArmour.stats[0].installedModContribution,10,'Installed stat-plug contribution must be carried separately for Build Forge projection.');
assert.equal(plugSetArmour.armourModOptions['0'][0].hash,99002,'Legal armour-mod alternatives must resolve through Bungie profile plug sets when item-scoped reusable plugs are absent.');
const binding={characterId:'hunter-1',membershipId:'membership-1',membershipType:'3'};
const forgeLoaderDecision={schemaVersion:1,buildAnchor:{identityKey:exotic.key,name:exotic.name,itemHashes:exotic.hashes,selectedItemHash:9004,selectedItemInstanceId:'exotic-reissue',perk:{hash:88001,name:'Verified Exotic perk',description:'Verified perk description',icon:'/perk.png'}},statDirective:{targets:{health:35,melee:0,grenade:0,super:0,class:0,weapon:0},priorities:{health:1,melee:0,grenade:0,super:0,class:0,weapon:0},achieved:matches[0].stats,allTargetsMet:matches[0].score.met,shortfall:matches[0].score.shortfall,rawTotal:matches[0].score.total,modsApplied:false},setProtocol:[{setHash:7001,count:4,setName:'Seraph Protocol',trait:{hash:77001,name:'Seraph four',description:'Four-piece effect',icon:'/set-7001-4.png'}}],ranking:{position:1,totalCombinations:matches.length,maximized:true}};
const selection=createVaultArmourSelection({binding,slots:matches[0].items.map(item=>({slot:item.slotIndex,item})),sourcePage:'forge-loader',forgeLoaderDecision});
const verifiedSelection=validateVaultArmourSelection(selection,{expectedBinding:binding});
assert.equal(verifiedSelection?.forgeLoaderDecision?.buildAnchor?.selectedItemInstanceId,'exotic-reissue','The exact solver-selected Exotic instance must survive the protected handoff.');
assert.deepEqual(verifiedSelection?.forgeLoaderDecision?.statDirective?.targets,forgeLoaderDecision.statDirective.targets,'All six user stat directives must survive the protected handoff.');
assert.deepEqual(verifiedSelection?.forgeLoaderDecision?.statDirective?.priorities,forgeLoaderDecision.statDirective.priorities,'The user\'s exact 1-6 priority order must survive the protected handoff.');
assert.equal(verifiedSelection?.forgeLoaderDecision?.setProtocol?.[0]?.count,4,'The selected armour set protocol must survive the protected handoff.');
assert.equal(verifiedSelection?.forgeLoaderDecision?.ranking?.maximized,true,'The top-ranked load must retain its maximized evidence.');
assert.equal(validateVaultArmourSelection({...selection,forgeLoaderDecision:{...selection.forgeLoaderDecision,buildAnchor:{...selection.forgeLoaderDecision.buildAnchor,selectedItemInstanceId:'wrong-instance'}}},{expectedBinding:binding}),null,'The handoff must reject decision evidence that does not match the staged exact Exotic instance.');
const illegalSecondExotic={...selection,slots:selection.slots.map((row,index)=>index===1?{...row,item:{...row.item,isExotic:true}}:row)};
assert.equal(validateVaultArmourSelection(illegalSecondExotic,{expectedBinding:binding}),null,'Forge Loader handoff must reject any armour result containing more than the one selected Exotic.');
const sourceState={originalBuild:{...binding,armour:Array(5).fill(null)},workingBuild:{...binding,armour:Array(5).fill(null)},recommendation:{stale:true},validationRecords:[{stale:true}]};
const appliedSelection=applyVaultArmourSelection(sourceState,verifiedSelection);
assert.equal(appliedSelection.applied,true,'Build Forge must accept the character-bound Forge Loader handoff.');
assert.deepEqual(appliedSelection.state.workingBuild.forgeLoaderDecision,verifiedSelection.forgeLoaderDecision,'Build Forge Working Build must retain the complete Forge Loader decision chain in the background.');
assert.equal(sourceState.originalBuild.armour.every(item=>item===null),true,'The Forge Loader decision must never mutate the protected Original Build.');

const equippedArmour=[item(0,2100,'equipped-helmet',3),item(1,2101,'equipped-gauntlets',4),item(2,2102,'equipped-chest',5),item(3,2103,'equipped-legs',6),item(4,2104,'equipped-class-item',7)];
const equippedLoadouts=[{colorHash:4101,iconHash:4102,nameHash:4103,items:[{itemInstanceId:'equipped-helmet'},{itemInstanceId:'equipped-chest'}],subclassOverrides:[{itemInstanceId:'subclass-one',plugItemHashes:[4201,4202]}]}];
const equippedSubclass={hash:2453351420,itemInstanceId:'equipped-subclass',name:'Nightstalker',bucketHash:3284755031,classType:1,source:{kind:'equipped',characterId:binding.characterId},definition:{inventory:{bucketTypeHash:3284755031},displayProperties:{name:'Nightstalker'}}};
const equippedProfileBuild={...binding,source:'bungie-live',characterClass:'hunter',subclass:'void',subclassName:'Nightstalker',subclassItemInstanceId:equippedSubclass.itemInstanceId,subclassItem:equippedSubclass,subclassCatalog:[equippedSubclass],subclassBuild:{},weapons:[],armour:equippedArmour,stats:[],loadoutsAvailable:true,loadouts:equippedLoadouts};
const snapshotEnvelope=createForgeLoaderBuildSnapshot(equippedProfileBuild,binding);
const protectedSource=validateHandoffEnvelope(snapshotEnvelope,{expectedCharacterId:binding.characterId,expectedMembershipId:binding.membershipId,expectedMembershipType:binding.membershipType});
assert.equal(protectedSource?.originalBuild,undefined,'Forge Loader must store one protected source build instead of duplicating it into Original and Working copies in Web Storage.');
const protectedSnapshot=createBuildState(protectedSource);
assert.deepEqual(protectedSnapshot?.originalBuild?.armour?.map(row=>row.itemInstanceId),equippedArmour.map(row=>row.itemInstanceId),'Forge Loader must capture the exact equipped armour as the protected Original Build before navigation.');
assert.equal(protectedSnapshot?.originalBuild?.loadoutsAvailable,true,'Forge Loader must retain the prepared Bungie in-game loadout component.');
assert.deepEqual(protectedSnapshot?.originalBuild?.loadouts,equippedLoadouts,'Forge Loader must carry the compact in-game loadout slots into Build Forge.');
assert.equal(protectedSnapshot?.originalBuild?.subclassItemInstanceId,equippedSubclass.itemInstanceId,'Forge Loader must retain the exact equipped subclass instance for Apply.');
assert.equal(protectedSnapshot?.originalBuild?.subclassItem?.bucketHash,3284755031,'Forge Loader must retain the verified Destiny subclass equipment bucket.');
const protectedApplied=applyVaultArmourSelection(protectedSnapshot,verifiedSelection);
assert.equal(protectedApplied.applied,true,'A direct Forge Loader entry must provide enough protected state for Build Forge to apply the staged selection immediately.');
assert.strictEqual(protectedApplied.state.originalBuild,protectedSnapshot.originalBuild,'Staging armour must retain the same immutable Original Build instead of cloning the complete inventory.');
assert.deepEqual(protectedApplied.state.originalBuild.armour.map(row=>row.itemInstanceId),equippedArmour.map(row=>row.itemInstanceId),'Applying the Forge Loader selection must leave every Original Build armour instance untouched.');
assert.deepEqual(protectedApplied.state.workingBuild.armour.map(row=>row.itemInstanceId),verifiedSelection.slots.map(row=>row.item.itemInstanceId),'Only the Working Build may receive the five staged exact armour instances.');
const similarModRule={failureMessage:'Similar mod already applied.'},singleCopyTooltip={displayString:'Equipping additional copies of this mod provides no benefit.',displayStyle:'warning'};
const oversizedArmour=equippedArmour.map((row,index)=>({...row,definition:{hash:row.itemHash,displayProperties:{name:`Verified armour ${index}`,description:'Verified definition',icon:'/verified.png'},inventory:{tierType:5,tierTypeName:'Legendary',bucketTypeHash:100+index},plug:{plugCategoryIdentifier:'armor.mods',energyCost:{energyCost:3}},traitIds:['item.armor'],oversizedInternalPayload:'x'.repeat(300000)},armourModOptions:{'1':[{hash:4004774872,name:'Special Finisher',definition:{hash:4004774872,displayProperties:{name:'Special Finisher'},plug:{plugCategoryIdentifier:'armor.mods.class',energyCost:1,insertionRules:[similarModRule]},tooltipNotifications:[singleCopyTooltip]}}]}}));
const oversizedProfileBuild={...equippedProfileBuild,armour:oversizedArmour,itemRenderData:{marker:'must-not-cross',payload:'x'.repeat(300000)},gearAssets:{marker:'must-not-cross',payload:'x'.repeat(300000)},renderData:{marker:'must-not-cross',payload:'x'.repeat(300000)},loadouts:[{...equippedLoadouts[0],marker:'must-not-cross',payload:'x'.repeat(300000)}]};
const compactProfileBuild=compactForgeLoaderProfileBuild(oversizedProfileBuild,binding);
assert.equal('itemRenderData' in compactProfileBuild||'gearAssets' in compactProfileBuild||'renderData' in compactProfileBuild,false,'Large profile render assets must never enter the protected Web Storage handoff.');
assert.equal(compactProfileBuild.loadouts.length,1,'The compact handoff must preserve the prepared Bungie in-game loadout row.');
assert.equal('payload' in compactProfileBuild.loadouts[0]||'marker' in compactProfileBuild.loadouts[0],false,'Unconsumed loadout payload fields must not enter the protected Web Storage handoff.');
assert.deepEqual(compactProfileBuild.loadouts[0],equippedLoadouts[0],'Loadout compaction must retain slot identity, item instances and subclass plug overrides.');
assert.equal(compactProfileBuild.armour[0].definition.displayProperties.name,'Verified armour 0','Compaction must retain verified Bungie definition identity used by Build Forge.');
assert.equal('oversizedInternalPayload' in compactProfileBuild.armour[0].definition,false,'Nested Bungie definition internals that Build Forge does not consume must not cross Web Storage.');
assert.equal(compactProfileBuild.armour[0].armourModOptions['1'][0].definition.plug.insertionRules[0].failureMessage,similarModRule.failureMessage,'The direct Forge handoff must retain Bungie single-copy insertion rules.');
assert.equal(compactProfileBuild.armour[0].armourModOptions['1'][0].definition.tooltipNotifications[0].displayString,singleCopyTooltip.displayString,'The direct Forge handoff must retain Bungie non-stacking tooltip evidence.');
const compactEnvelope=createForgeLoaderBuildSnapshot(oversizedProfileBuild,binding),compactEnvelopeBytes=JSON.stringify(compactEnvelope).length;
assert.ok(compactEnvelopeBytes<100000,'The complete protected Forge Loader source envelope must remain below 100 KB even when its source profile contains multi-megabyte render and definition payloads.');
const memoryStorage=(maximum=Infinity)=>{const rows=new Map();return {get length(){return rows.size;},key:index=>[...rows.keys()][index]??null,getItem:key=>rows.get(key)??null,setItem:(key,value)=>{const next=String(value),used=[...rows.entries()].reduce((sum,[rowKey,rowValue])=>sum+(rowKey===key?0:String(rowValue).length),0);if(used+next.length>maximum)throw new Error('QuotaExceededError');rows.set(key,next);},removeItem:key=>rows.delete(key)};};
const oversizedStagedItems=matches[0].items.map((row,index)=>({...row,definition:{hash:row.itemHash,displayProperties:{name:row.name,description:'Verified staged armour',icon:'/staged.png'},inventory:{tierType:row.isExotic?6:5,tierTypeName:row.isExotic?'Exotic':'Legendary'},oversizedInternalPayload:'x'.repeat(300000)},armourModOptions:{'1':[{hash:99002+index,name:`Verified option ${index}`,description:'Health stat option',socketIndex:1,canInsert:true,statContributions:[{hash:91001,name:'Health',value:10,isConditionallyActive:false}],socketCategoryDefinition:{displayProperties:{name:'General Armor Mod'},oversizedInternalPayload:'x'.repeat(300000)},definition:{hash:99002+index,displayProperties:{name:`Verified option ${index}`,description:'Health stat option',icon:'/mod.png'},plug:{plugCategoryIdentifier:'armor.mods.general',energyCost:3,insertionRules:[similarModRule]},tooltipNotifications:[singleCopyTooltip],investmentStats:[{statTypeHash:91001,value:10,isConditionallyActive:false}],oversizedInternalPayload:'x'.repeat(300000)}}]}}));
assert.equal('oversizedInternalPayload' in compactArmourSelectionItem(oversizedStagedItems[0]).definition,false,'Staged armour compaction must discard unused nested Bungie definition payloads.');
const compactStagedSelection=createVaultArmourSelection({binding,slots:oversizedStagedItems.map(item=>({slot:item.slotIndex,item})),sourcePage:'forge-loader',forgeLoaderDecision}),compactStagedBytes=JSON.stringify(compactStagedSelection).length;
assert.ok(compactStagedBytes<100000,'The five-item staged armour handoff must remain below 100 KB even when its source items contain multi-megabyte definition payloads.');
assert.equal(compactStagedSelection.slots[0].item.armourModOptions['1'][0].definition.plug.plugCategoryIdentifier,'armor.mods.general','Compaction must retain the verified mod category required by Build Forge.');
assert.equal(compactStagedSelection.slots[0].item.armourModOptions['1'][0].statContributions[0].value,10,'Compaction must retain verified mod stat contributions.');
assert.equal(compactStagedSelection.slots[0].item.armourModOptions['1'][0].definition.plug.insertionRules[0].failureMessage,similarModRule.failureMessage,'The staged Forge handoff must retain Bungie single-copy insertion rules.');
assert.equal(compactStagedSelection.slots[0].item.armourModOptions['1'][0].definition.tooltipNotifications[0].displayString,singleCopyTooltip.displayString,'The staged Forge handoff must retain Bungie non-stacking tooltip evidence.');
const blockedSelectionStore=memoryStorage(0),fallbackSelectionStore=memoryStorage(compactStagedBytes+1000);
assert.equal(writeVaultArmourSelection(compactStagedSelection,[blockedSelectionStore,fallbackSelectionStore]),true,'The staged load must fall back to the second protected browser store when the first store rejects it.');
assert.equal(readVaultArmourSelection({expectedBinding:binding,storage:[blockedSelectionStore,fallbackSelectionStore]})?.slots.length,5,'Build Forge must recover all five compact exact armour instances from the fallback store.');
assert.equal(clearVaultArmourSelection([blockedSelectionStore,fallbackSelectionStore]),true,'The consumed compact selection must clear from every browser-store fallback.');
assert.equal(readVaultArmourSelection({expectedBinding:binding,storage:[blockedSelectionStore,fallbackSelectionStore]}),null,'A consumed staged selection must not remain available for a second Build Forge application.');
const recoverableStore=memoryStorage();recoverableStore.setItem('astrix:bungie-page-cache-fallback:v3:loadout','large-profile');recoverableStore.setItem('astrix:bungie-loadout-cache-fallback:v2:hunter-1:0','large-loadout');recoverableStore.setItem('astrix:bungie-session-cache:v1','keep-session');
assert.equal(releaseGuardianSessionStorageFallbacks(recoverableStore),2,'A quota retry must clear only the recoverable full-profile and loadout fallbacks.');
assert.equal(recoverableStore.getItem('astrix:bungie-session-cache:v1'),'keep-session','Quota recovery must preserve the authenticated Bungie session marker.');
const handoffStore=memoryStorage(compactEnvelopeBytes+1000);handoffStore.setItem(LAST_LOADOUT_KEY,'x'.repeat(compactEnvelopeBytes+500));handoffStore.setItem(BUILD_SPACE_KEY,'stale');
assert.equal(writeForgeLoaderBuildSnapshot(oversizedProfileBuild,binding,{stores:[handoffStore],snapshotEnvelope:compactEnvelope}),true,'The protected direct-entry baseline must reuse the already compacted envelope when Web Storage fallback is required.');
assert.equal(handoffStore.getItem(BUILD_SPACE_KEY),null,'A stale Build Forge state must not outrank the newly selected Guardian baseline.');
assert.equal(handoffStore.getItem(LAST_LOADOUT_KEY),null,'A stale recoverable Bungie loadout cache must yield when it would block the current protected Guardian handoff.');
assert.ok(validateHandoffEnvelope(JSON.parse(handoffStore.getItem(BUILD_SNAPSHOT_KEY)),{expectedCharacterId:binding.characterId}),'The stored baseline must use the protected, expiring Build Forge envelope.');

const html=read('astrix-app/pages/forge-loader/index.html');
const css=read('astrix-app/pages/forge-loader/forge-loader.css');
const runtime=read('astrix-app/pages/forge-loader/forge-loader.mjs');
const preload=read('astrix-app/pages/forge-loader/forge-loader-preload.mjs');
const selectionState=read('astrix-app/pages/vault/vault-selection-state.mjs');
const buildRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs');
const buildStateRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs');
const artifactSelectionRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-artifact-selection.mjs');
const buildHandoff=read('astrix-app/pages/forge-loader/forge-loader-build-handoff.mjs');
const sessionCache=read('astrix-app/pages/guardian-workspace-v2/guardian-session-cache.mjs');
const perkPlanRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-perk-change-plan.mjs');
const liveActionsRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs');
const ribbon=read('astrix-app/shared/astrix-destination-ribbon.js');
const access=read('astrix-app/pages/guardian-workspace-v2/guardian-vault-access.mjs');
assert.match(preload,/loadPreparedPagePayload\(session,'loadout'/,'The shared Forge Loader preload must request its dedicated merged page payload through the shared client.');
assert.match(runtime,/preloadForgeLoaderPayload/,'Forge Loader must consume the shared intro preload path.');
assert.doesNotMatch(runtime,/new URL\('\/bungie\/page\/loadout'/,'Forge Loader must not fork its own prepared page request.');
assert.match(runtime,/if\(next\.forgeArmourIndex\)guardianManifest\.applyForgeArmourIndex/,'Forge Loader must consume the versioned compact armour index from its merged page payload.');
assert.match(runtime,/hydratePayload\(next,\{waitForManifest:false,armourOnly:Boolean\(next\.forgeArmourIndex\),includeReusable:true,allowNetwork:false\}\)/,'Owned combinations and their legal armour mod options must hydrate without live definition requests.');
assert.match(runtime,/reportPreparedPageStage\('join','loadout'\)/,'Forge Loader must report the shared prepared bulk manifest join stage.');
assert.doesNotMatch(runtime,/await guardianManifest\.ready\(\)/,'Forge Loader must never return to the 58-percent full-manifest startup gate.');
assert.match(html,/<header class="apx-destination-header forge-command-header">[\s\S]*?<strong>FORGE LOADER<\/strong><small>SELECT AND MAXIMISE VERIFIED ARMOUR<\/small>/,'Forge Loader must present its page identity only in the shared compact command header.');
assert.doesNotMatch(html,/<div class="apx-page-heading">[\s\S]*?<h1>Forge Loader<\/h1>/,'Forge Loader must not retain the oversized duplicate page hero.');
assert.match(html,/id="forgeHeroCard"/);
assert.match(html,/id="forgeExoticSlots"/);
assert.match(html,/id="forgeSetList"/);
const selectorIndex=html.indexOf('class="forge-loader-selector"');
const directivesIndex=html.indexOf('class="forge-loader-directives"');
const outputIndex=html.indexOf('class="forge-loader-output"');
assert.ok(selectorIndex>=0&&selectorIndex<directivesIndex&&directivesIndex<outputIndex,'Forge Loader desktop DOM must order selection, directives and Working Load as three columns.');
assert.ok(html.indexOf('forge-stat-selector')<html.indexOf('forge-set-selector'),'Set Protocol must sit underneath Stat Directive in the middle column.');
assert.equal((html.match(/data-target-stat=/g)||[]).length,6,'Forge Loader must retain all six Armour 3.0 stat directives.');
assert.equal((html.match(/data-stat-priority=/g)||[]).length,6,'Every Armour 3.0 stat must expose one optional priority selector.');
assert.equal((html.match(/<option value="">AUTO<\/option>/g)||[]).length,6,'Leaving a priority unselected must visibly retain the automatic maximum-stat fallback.');
assert.equal((html.match(/max="200" value="0" step="1" disabled><output>0 \/ 200<\/output>/g)||[]).length,6,'All six Stat Directives must present the 200-point cap before live inventory finishes loading.');
assert.match(runtime,/output\.textContent=`\$\{value===0\?available:value\} \/ \$\{ARMOUR_STAT_CAP\}`/,'Every Stat Directive must show either its achievable ceiling or selected target on the fixed 200-point scale.');
assert.match(runtime,/input\.max=String\(ARMOUR_STAT_CAP\)/,'Every Stat Directive slider must retain the absolute 200-point scale.');
assert.match(runtime,/input\.value=String\(Math\.min\(ARMOUR_STAT_CAP,Math\.max\(0,Number\(targetMaximums\[key\]\|\|0\)\)\)\)/,'MAX must select the Guardian\'s achievable stat ceiling rather than forcing 200.');
assert.match(runtime,/--forge-slider-fill[\s\S]*?value\/ARMOUR_STAT_CAP\*100/,'Each slider must fill proportionally to its selected value on the 200-point scale.');
assert.match(runtime,/output\.dataset\.available='true'/,'An unselected stat must expose its actual achievable maximum as the primary green figure.');
assert.match(runtime,/legalPriorityPool=matchedBuilds\.filter[\s\S]*?score\?\.effectiveStats/,'Available figures must be recalculated from combinations that best satisfy the selected priorities.');
assert.match(runtime,/--forge-slider-available[\s\S]*?value===0\?available:value/,'Green track length must use the achievable maximum only when the stat is not a selected priority.');
assert.match(runtime,/statPriorities:priorityValues\(\)/,'The exact 1-6 user priority order must be supplied to the owned-armour solver.');
assert.match(runtime,/autoMaximum:true/,'Automatic maximum-stat mode must remain explicitly scoped to Forge Loader.');
assert.match(runtime,/other!==select&&Number\(other\.value\)===rank\)other\.value=''/,'Assigning an occupied priority rank must move that rank to the newly selected stat.');
assert.match(runtime,/priorities:priorityValues\(\)/,'The priority order must be retained in the protected Build Forge handoff.');
assert.match(runtime,/No stat priority selected\. Ranking the complete legal pool by maximum unmodded stats/,'The runtime must explain and execute its automatic maximum-stat fallback.');
assert.match(selectionState,/priorities:normaliseStatPriorities\(value\.statDirective\?\.priorities\)/,'The protected handoff must validate the six unique priority ranks.');
assert.match(css,/\.forge-stat-targets select\{[^}]*font:800 \.8rem\/1 bahnschrift-semicondensed/,'Priority selectors must remain readable in the three-column Stat Directive.');
assert.match(css,/linear-gradient\(90deg,#d9b340 0 var\(--forge-slider-fill,0%\),rgba\(41,199,143,\.62\) var\(--forge-slider-fill,0%\) var\(--forge-slider-available,0%\),rgba\(80,80,80,\.34\) var\(--forge-slider-available,0%\) 100%\)/,'The slider must separate selected gold, achievable green and unavailable dark ranges.');
assert.match(css,/output\[data-available\]\{[^}]*color:#66dcb2/,'The achievable XXX / 200 figure must use the established Forge green.');
assert.doesNotMatch(css,/output\[data-available\]::after/,'The Stat Directive must not retain the smaller AVAILABLE sub-label.');
assert.match(css,/grid-template-columns:minmax\(0,1fr\) 4\.4rem 6\.4rem/,'The MAX control must yield enough width for the complete AUTO priority label.');
assert.match(runtime,/type="checkbox"/,'Set bonuses must use checkboxes, not toggle switches.');
assert.match(runtime,/setBonusOptions\(armourItems\(\),exotic,setSelections\)/);
assert.match(runtime,/class="forge-set-trait-icon"[\s\S]*?effect\.icon/,'Each 2-piece and 4-piece block must render its verified Bungie trait icon.');
assert.match(runtime,/forge-set-trait-copy[\s\S]*?effect\?\.description/,'Each set block must expose the verified trait name and description.');
assert.match(css,/\.forge-set-choice\.is-owned \.forge-set-trait-icon\{[^}]*background:rgba\(77,177,255,\.34\)/,'Owned feasible set traits must use the blue Bungie-style icon background.');
assert.match(css,/\.forge-set-trait-icon img\{[^}]*filter:grayscale\(1\) brightness\(2\)/,'Unavailable set traits must retain a white trait icon on the dark block.');
assert.match(runtime,/fixedExoticHashes:exotic\.hashes/,'The selected Exotic identity must pass every owned item hash to the solver.');
assert.match(runtime,/matchTopArmourBuilds\(armourItems\(\),targets,\{\.\.\.solverOptions\(\),limit:CANDIDATE_BATCH_SIZE/,'Forge Loader must scan every legal combination while retaining only its top 50 results.');
assert.match(runtime,/createOpenProtocolTieBreaker\(exotic\)[\s\S]*?secondaryScore/,'The full bounded scan must apply verified Exotic-to-set evidence before lower-ranked combinations are discarded.');
assert.match(runtime,/exoticCatalogueGroups\(catalogue\.armour,inventoryDefinitions\(\),activeCharacterClass,ARMOUR_BUCKETS\)/,'Forge Loader must add verified class collection definitions without fabricating inventory instances.');
assert.match(runtime,/aria-disabled="\$\{group\.owned\?'false':'true'\}"/,'Unowned Exotic identities must remain visible but unavailable for selection.');
assert.match(runtime,/group\.owned&&group\.key===String\(key\|\|''\)/,'The runtime must reject any unowned Exotic selection attempt.');
assert.match(runtime,/data-exotic-key="\$\{esc\(group\.key\)\}"/,'Only one identity key may activate every owned copy behind an Exotic tile.');
assert.doesNotMatch(runtime,/data-inspect-exotic-key|inspectExoticKey/,'An Exotic selector tile must never open a fixed instance inspection card.');
assert.match(runtime,/aria-label="\$\{group\.owned\?'Select':'Unavailable'\}/,'Selector labels must describe selection availability without promising an instance inspection.');
assert.match(html,/id="forgeExoticStatus" hidden/,'The Exotic definition count must remain available without cluttering the visible selector.');
assert.doesNotMatch(html,/Every verified Exotic for the selected class/,'The Exotic selector must present the icon list without an explanatory block.');
assert.doesNotMatch(runtime,/<span>\$\{group\.owned\?`×\$\{group\.instances\.length\}`:'LOCKED'<\/span>/,'Duplicate and ownership labels must not cover the Exotic artwork.');
assert.doesNotMatch(css,/\.forge-exotic>span|content:"ANCHOR"/,'Exotic ownership and selection must use artwork state and the PARADOX border rather than text overlays.');
assert.match(html,/REFRESH TOP 50 COMBINATIONS/,'The Stat Directive must accurately identify the bounded visible result set.');
assert.match(runtime,/CANDIDATE_BATCH_SIZE=50[\s\S]*?combinationsEvaluated[\s\S]*?matchedBuilds\.slice\(0,shown\)/,'Forge Loader must expose the legal scan count while retaining no more than the top 50 combinations.');
assert.match(runtime,/renderCandidateLoading\(exotic\)[\s\S]*?Locking \$\{esc\(exotic\.name\)\} into every load/,'Selecting an Exotic must immediately reveal where its calculated combinations will appear.');
assert.match(runtime,/totalCombinations:Number\(matchedBuilds\.combinationsEvaluated\|\|matchedBuilds\.length\)/,'The protected Build Forge handoff must retain the full legal combination count rather than only the visible top 50.');
assert.match(runtime,/scanDuration<1000[\s\S]*?exact owned combinations scanned in \$\{durationLabel\}/,'Forge Loader must report the actual local scan duration beside its result count.');
assert.match(runtime,/OPEN ARMOUR · NO SET BONUS REQUIRED[\s\S]*?Rank the top 50 exact owned combinations/,'Forge Loader must expose an explicit Open Armour mode instead of implying that an empty set selection is accidental.');
assert.match(runtime,/if\(!setSelections\.length\)matchedBuilds=rankOpenProtocolCandidates\(matchedBuilds,exotic\)/,'Open Armour must rank owned candidates with verified Exotic-to-set evidence after satisfying stat constraints.');
assert.match(runtime,/naturalSetProtocols\(candidate\)\.map[\s\S]*?verifiedTraitContext\(row\.trait\)/,'A naturally active Open Armour set perk must survive the protected Build Forge decision chain.');
assert.match(runtime,/payload\?\.collectibleDefinitions[\s\S]*?sourceString/,'Optional acquisition guidance must read prepared Bungie collectible source evidence from the existing page payload.');
assert.doesNotMatch(runtime,/guardianManifest\.getMany\('DestinyCollectibleDefinition'/,'Optional acquisition guidance must not start a definition lookup after interaction.');
assert.match(runtime,/Bungie acquisition source is unresolved; no activity is claimed\./,'Forge Loader must never invent an acquisition activity when Bungie source evidence is unavailable.');
assert.doesNotMatch(runtime,/CALCULATE 5 COMBINATIONS|refresh the five legal combinations/,'Forge Loader must not retain a five-result limitation.');
assert.match(runtime,/Five exact Bungie armour instances · no mods[\s\S]*?UNMODDED ARMOUR TOTAL/,'Forge Matrix must identify that its ranking excludes mods.');
assert.doesNotMatch(runtime,/ARMOUR_STAT_LABELS\[key\]\.slice/,'Calculated loads must show full stat names rather than unreadable abbreviations.');
assert.match(html,/<h2 id="forgeResultsTitle">Forge Matrix<\/h2>/,'Calculated combinations must use the independent PARADOX Forge Matrix identity.');
assert.match(runtime,/class="forge-matrix-row"[\s\S]*?class="forge-matrix-stats"[\s\S]*?class="forge-matrix-total"[\s\S]*?class="forge-matrix-protocol"/,'Each compact load must expose six calculated stats, total and set protocol in one comparison row.');
assert.match(runtime,/class="forge-matrix-anchor">Anchor Exotic: \$\{esc\(exotic\?\.name\|\|'Verified Exotic'\)\}<\/small>/,'Every calculated load row must name its exact anchor Exotic.');
assert.match(css,/\.forge-matrix-expand \.forge-matrix-anchor\{[^}]*color:var\(--apx-gold\)[^}]*bahnschrift-semicondensed/,'The anchor Exotic label must reuse the established Forge gold and type system.');
assert.match(runtime,/maximized=index===0[\s\S]*?is-maximized[\s\S]*?MAXIMIZED/,'The highest-ranked complete owned load must receive the unique PARADOX Maximized state.');
assert.match(css,/\.forge-candidate\.is-maximized\{[^}]*border:2px solid #e4bd49/,'The Maximized load must use a deliberate gold perimeter rather than a generic selected state.');
assert.match(runtime,/data-candidate-expand="\$\{index\}"[\s\S]*?aria-controls="forgeLoadBreakdown\$\{index\}"/,'Every Forge Matrix row must provide an accessible expandable breakdown control.');
assert.match(runtime,/Five exact Bungie armour instances[\s\S]*?candidate\.items\.map\(candidateItemMarkup\)/,'Expanded loads must enumerate all five exact owned armour instances.');
assert.match(runtime,/item\.source\?\.label[\s\S]*?item\.power[\s\S]*?item\.energy\?\.capacity[\s\S]*?Number\(item\.state\|\|0\)&4/,'The breakdown may show only verified source, Power, energy and masterwork instance data.');
assert.match(runtime,/data-candidate-evaluate="\$\{index\}"/,'An expanded verified load must retain its protected Build Forge evaluation action.');
assert.match(runtime,/forgeLoaderDecision:forgeLoaderDecision\(candidate,selectedCandidateIndex\)/,'The staged load must send the user\'s complete three-stage decision to Build Forge.');
assert.match(runtime,/normaliseLiveProfile\(payload,session,activeCharacterId\)/,'Forge Loader must reuse its already verified profile to capture the equipped Guardian baseline.');
assert.match(runtime,/if\(!transferStored\)\{[\s\S]*?writeForgeLoaderBuildSnapshot\(profileBuild,binding,\{stores:\[sessionStorage,localStorage\],snapshotEnvelope\}\)[\s\S]*?writeVaultArmourSelection\(selection\)/,'Web Storage must remain a complete ordered fallback when the atomic transfer is unavailable.');
assert.ok(runtime.indexOf('const transferStored=await cacheForgeLoaderTransfer')<runtime.indexOf('baselineStored=writeForgeLoaderBuildSnapshot'),'The atomic transfer must be attempted before creating duplicate Web Storage payloads.');
assert.match(runtime,/cacheForgeLoaderTransfer\(binding,\{snapshotEnvelope,armourSelection:selection\}\)/,'Forge Loader must atomically cache the protected baseline and staged armour outside quota-limited Web Storage.');
assert.ok(runtime.indexOf('cacheForgeLoaderTransfer(binding')<runtime.indexOf('location.href=url'),'The complete atomic transfer must finish before Build Forge navigation.');
assert.match(runtime,/if\(!selectionStored\)[\s\S]*?No build was changed/,'Forge Loader may navigate only when the staged selection has a complete browser or IndexedDB transfer path.');
assert.match(runtime,/if\(!baselineStored&&!transferStored\)\{[\s\S]*?Build Forge will recover the protected Original Build directly from Bungie\./,'Authenticated recovery must remain available only when neither browser storage nor the atomic transfer retained the baseline.');
assert.doesNotMatch(runtime,/if\(!baselineStored\)\{[^}]*?return;/,'A rejected browser baseline must not prevent an atomic or authenticated-recovery handoff.');
assert.match(runtime,/if\(!baselineStored&&!transferStored\)url\.searchParams\.set\('baseline','bungie-recovery'\)/,'The destination must request authenticated recovery only when the atomic baseline is unavailable.');
assert.match(buildHandoff,/store\.removeItem\(BUILD_SPACE_KEY\);[\s\S]*?store\.removeItem\(BUILD_SNAPSHOT_KEY\);[\s\S]*?store\.setItem\(BUILD_SNAPSHOT_KEY,json\)/,'Stale Build Forge state must be cleared before writing the newly verified compact Guardian snapshot.');
assert.doesNotMatch(buildHandoff,/createBuildState/,'Forge Loader must not expand the compact source into duplicate Original and Working builds before navigation.');
assert.match(html,/forge-loader\.mjs\?v=20260907-item-inspect-scope-1/,'Forge Loader must load the exact matched-item inspection scope without stale browser code.');
assert.match(html,/forge-loader\.css\?v=20260907-icon-token-1/,'Forge Loader must refresh the shared icon-token wiring without stale page CSS.');
assert.match(runtime,/forge-loader-build-handoff\.mjs\?v=20260906-review-layout-1/,'Forge Loader must refresh the protected baseline writer with exact subclass and in-game loadout transfer.');
assert.match(runtime,/vault-selection-state\.mjs\?v=20260904-exotic-equip-rule-1/,'Forge Loader must refresh the legal one-Exotic armour selection writer.');
assert.match(buildRuntime,/vault-selection-state\.mjs\?v=20260904-exotic-equip-rule-1/,'Build Forge must refresh the legal one-Exotic armour selection reader.');
assert.match(selectionState,/const item=compactArmourSelectionItem\(row\?\.item\|\|null\)/,'Every staged armour item must be compacted before it crosses Web Storage.');
assert.match(selectionState,/for\(const store of storageCandidates\(storage\)\)try\{store\.setItem\(VAULT_SELECTION_KEY,json\);return true;\}catch\{\}/,'The staged selection must try the browser-store fallback instead of failing after one quota rejection.');
assert.match(runtime,/if\(!selectionStored\)\{releaseGuardianSessionStorageFallbacks\(\);selectionStored=writeVaultArmourSelection\(selection\);\}/,'A failed compact selection write must release only recoverable profile fallbacks and retry once.');
assert.match(sessionCache,/key\.startsWith\(PROFILE_FALLBACK_PREFIX\)\|\|key\.startsWith\(LOADOUT_FALLBACK_PREFIX\)/,'Quota recovery must remain limited to recoverable Bungie page and loadout fallback caches.');
assert.match(sessionCache,/FORGE_TRANSFER_TTL_MS=30\*60\*1000[\s\S]*?forgeTransferRecordKey[\s\S]*?membershipType[\s\S]*?membershipId[\s\S]*?characterId/,'Atomic Forge transfers must be expiring and bound to one Bungie membership and character.');
assert.match(sessionCache,/FORGE_TRANSFER_IO_TIMEOUT_MS=4000[\s\S]*?boundedForgeTransferIo[\s\S]*?Promise\.race/,'A blocked IndexedDB transaction must fall back instead of holding the Build Forge portal at 58%.');
assert.match(sessionCache,/async function cacheForgeLoaderTransfer[\s\S]*?snapshotEnvelope[\s\S]*?armourSelection[\s\S]*?writeRecord/,'IndexedDB must store the baseline and staged armour in one record.');
assert.match(sessionCache,/async function readForgeLoaderTransfer[\s\S]*?stored\.characterId!==normalized\.characterId[\s\S]*?stored\.membershipId!==normalized\.membershipId[\s\S]*?stored\.membershipType!==normalized\.membershipType/,'Build Forge must reject an atomic transfer for a different Guardian binding.');
assert.match(selectionState,/next\.workingBuild\.forgeLoaderDecision=clone\(verified\.forgeLoaderDecision\)/,'Build Forge application must retain the verified Forge Loader decision on Working Build only.');
assert.match(selectionState,/delete next\.workingBuild\.recommendationGeneratedAt;[\s\S]*?delete next\.workingBuild\.armourModRecommendation;/,'A newly staged Forge Loader result must clear every prior generated mod plan before Build Forge renders.');
assert.match(buildRuntime,/const payload=validateHandoffEnvelope\(raw\);[\s\S]*?payload\?\.characterId\?createBuildState\(payload\):null/,'Build Forge must expand the single protected source into immutable Original and separate Working builds only after reading it.');
assert.match(buildRuntime,/async function restoreAtomicForgeTransfer\(\)[\s\S]*?readForgeLoaderTransfer\(binding\)[\s\S]*?validateHandoffEnvelope\(transfer\.snapshotEnvelope[\s\S]*?validateVaultArmourSelection\(transfer\.armourSelection[\s\S]*?applyVaultArmourSelection\(baseline,selection\)/,'Build Forge must validate and apply the complete atomic transfer before rendering.');
assert.match(buildRuntime,/writeState\(applied\.state\)/,'An expanded atomic transfer must enter the durable async Working Build state path.');
assert.match(buildRuntime,/validateBuildState\(volatileState,expectedBinding,\{protect:false\}\)/,'Repeated Build Forge reads must validate the protected in-memory state without deep-cloning it.');
assert.doesNotMatch(buildRuntime,/volatileStateMemoryOnly|memoryOnly:true/,'Atomic and Vault edits must not silently remain memory-only.');
assert.match(buildRuntime,/createBuildPersistenceSnapshot\(state\)[\s\S]*?cacheBuildForgeState\(binding,snapshot\)/,'Working Build updates must use compact asynchronous persistence.');
assert.match(buildStateRuntime,/if\(Object\.isFrozen\(state\.originalBuild\)&&Array\.isArray\(state\.validationRecords\)\)return state;/,'Protecting an already immutable Build state must be idempotent and allocation-free.');
assert.match(selectionState,/function applyVaultArmourSelection[\s\S]*?const next=\{\.\.\.state,workingBuild:clone\(state\.workingBuild\)\}/,'Staging armour must copy only Working Build and retain the immutable Original Build.');
assert.match(artifactSelectionRuntime,/const next=\{\.\.\.state,workingBuild:\{\.\.\.state\.workingBuild\}\}/,'Artifact recommendation must fork only the changed Working Build fields, structurally share catalogues and retain the immutable Original Build.');
assert.match(artifactSelectionRuntime,/weapons:\(build\.weapons\|\|\[\]\)\.map\(weapon=>\(\{hash:hashOf\(weapon\),itemInstanceId:[\s\S]*?selectedPerks:/,'Artifact recommendation fingerprints must distinguish exact owned weapon rolls and their selected perks.');
assert.match(buildRuntime,/shouldReplaceBuildState\(current,detail,\{vaultSelection:params\.get\('vault'\)==='selection',explicitlySelectedCharacterId\}\);[\s\S]*?if\(!replace\)\{const repaired=repairMissingBuildBinding\(current,detail\),hydrated=mergePreparedLoadoutContext\(repaired,detail\);[\s\S]*?return;\}/,'A background live-profile event may repair binding and loadout context but must not overwrite the validated Forge Loader Working Build.');
assert.match(buildRuntime,/boundDetail=\{\.\.\.detail,membershipId:detail\.membershipId\|\|requested\.membershipId,membershipType:detail\.membershipType\?\?requested\.membershipType\}/,'Authenticated baseline recovery must retain the character-bound membership carried in the transfer URL.');
assert.match(read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html'),/paradox-build-space\.mjs\?v=20260906-live-equip-1/,'Build Forge must load the complete protected build transfer without stale browser code.');
assert.match(buildRuntime,/mergePreparedLoadoutContext\(repaired,detail\)/,'A prepared live profile must repair in-game loadouts on an existing Build Forge snapshot without replacing its staged build.');
assert.match(buildRuntime,/emitLoad\('profile',LOAD_STAGES\.PROFILE[\s\S]*?try\{[\s\S]*?Build Forge retained the protected transfer after recovered subclass rendering failed[\s\S]*?emitLoad\('sockets',LOAD_STAGES\.SOCKETS/,'A recovered subclass presentation failure must not prevent verified armour, sockets and the remaining Build Forge surface from rendering.');
assert.match(buildRuntime,/function render\(\)\{[\s\S]*?try\{return renderBuildSurface\(\);\}[\s\S]*?catch\(error\)[\s\S]*?completeBuildRender\(build\)/,'A synchronous recovered-profile presentation failure must release the loader with the protected Build Forge state.');
assert.match(buildRuntime,/params\.get\('baseline'\)==='bungie-recovery'[\s\S]*?Recovering the protected Original Build from the Bungie profile/,'Build Forge must present Bungie recovery as an active protected load rather than a missing snapshot failure.');
assert.match(buildRuntime,/try\{\s*const analysis=analyzeLiveGuardian\(result\.state\.workingBuild\);[\s\S]*?catch\(error\)\{\s*result\.state\.workingBuild\.paradoxAnalysis=null;/,'A PARADOX analysis failure must preserve the protected staged armour and allow Build Forge to render.');
assert.match(buildRuntime,/async function initialiseBuildForge\(\)[\s\S]*?await restoreAtomicForgeTransfer\(\)[\s\S]*?atomicTransfer\|\|readState\(\)[\s\S]*?finally\{\s*render\(\);\s*queueMicrotask\(\(\)=>void refreshForgeArtifactRecommendation\(\)\);\s*\}/,'The initial Forge Loader handoff must restore its atomic record and release the 58% gate before asynchronous Artifact recommendation work.');
assert.doesNotMatch(runtime,/method\s*:\s*['"]POST['"]|EquipItems?|TransferItem|PullFromPostmaster|SetItemLockState|socket-plug-free/,'Forge Loader must never call a live Bungie mutation route.');
assert.match(perkPlanRuntime,/const requirements=\[[\s\S]*?key:'captureSnapshot'[\s\S]*?key:'transferItems'[\s\S]*?key:'equipItems'[\s\S]*?key:'verifyEquipment'[\s\S]*?key:'applyWeaponSockets'[\s\S]*?key:'applyArmourMods'[\s\S]*?key:'verifyFinalState'/,'The complete live-transfer plan must preserve distinct snapshot, transfer, equip, verification, weapon-socket, armour-mod and final-readback phases.');
assert.match(perkPlanRuntime,/kind:'destiny-complete-loadout-transfer'[\s\S]*?requiresUserConfirmation:true[\s\S]*?executionPolicy:'fresh-read-activity-check-transfer-equip-verify-weapon-sockets-armour-mods-final-readback'/,'The complete transfer must remain staged behind explicit confirmation and the required verified execution policy.');
assert.match(buildRuntime,/function buildLivePlan\(\)[\s\S]*?createLiveTransferPreflight\(build\)[\s\S]*?createLiveTransferPlan\([\s\S]*?async function openApplyConfirmation\(\)[\s\S]*?stageLiveTransferPreflight\(plan,\{session\}\)[\s\S]*?pendingApplyPlan=staged[\s\S]*?async function executeConfirmedApply\(\)[\s\S]*?executeLiveTransferPlan\(confirmLiveTransferPlan\(plan\)/,'Build Forge must preflight, display and finally confirm the same exact live-transfer plan.');
assert.match(liveActionsRuntime,/LIVE_PREFLIGHT_ORDER=Object\.freeze\(\['guardian','ownership','instance-location','compatibility','exotic','socket-legality','activity-state'\]\)/,'Live preflight must preserve the required ordered Guardian, ownership, location, compatibility, Exotic, socket and activity checks.');
assert.match(liveActionsRuntime,/ACTION_THROTTLE_MS=250[\s\S]*?THROTTLE_RETRY_LIMIT=2[\s\S]*?requestActionWithThrottleRetry[\s\S]*?isExplicitThrottle\(error\)[\s\S]*?await waitImpl\(delay\)/,'Live Apply must pace Bungie mutations and retry only explicit throttle responses.');
assert.match(liveActionsRuntime,/function verifyItemsReadyToEquip[\s\S]*?waitForItemsReadyToEquip[\s\S]*?phase:'verify-transfer'[\s\S]*?\/bungie\/actions\/equip-items/,'Live Apply must prove every transferred item is carried or equipped by the target Guardian before bulk equip.');
assert.match(liveActionsRuntime,/if\(!Array\.isArray\(rows\)\)return itemIds\.map[\s\S]*?reason:'missing-equip-results'/,'A successful HTTP response without Bungie per-item equip results must not be treated as a successful equip.');
assert.match(liveActionsRuntime,/status!==['"]confirmed['"][\s\S]*?Final user confirmation is required[\s\S]*?requestFreshProfile[\s\S]*?freshLivePlanInspection\(plan,fresh,advertised\)[\s\S]*?\/bungie\/actions\/transfer-item[\s\S]*?\/bungie\/actions\/equip-items[\s\S]*?phase:'verify-equipment'[\s\S]*?verifyEquippedItems\(plan,equippedProfile\)[\s\S]*?weapon-sockets[\s\S]*?armour-mods[\s\S]*?finally\{[\s\S]*?requestFreshProfile/,'The executor must reject unconfirmed plans, repeat the ordered fresh preflight, verify equipped items, split socket phases, and always read back final state.');
assert.doesNotMatch(buildRuntime,/confirmPerkChangePlan|applyConfirmedPerkChangePlan|socket-plug-free/,'Build Forge must not fall back to the obsolete perk-only live mutation route.');
assert.doesNotMatch(runtime,/\bDIM\b|d2armou?rpicker/i,'Forge Loader must not copy external picker branding or actions.');
assert.match(css,/\.forge-loader-workspace\{[^}]*grid-template-columns:minmax\(360px,20%\) minmax\(640px,44%\) minmax\(560px,1fr\)/,'Wide Forge Loader must keep its page-specific narrower directive column and wider result column.');
assert.match(css,/\.forge-exotic\.is-selected\{[^}]*border:4px solid #d62d3a[^}]*animation:forge-exotic-selected-pulse/,'The selected Exotic must have an unmistakable thick red animated perimeter.');
assert.match(css,/@keyframes forge-exotic-selected-pulse/,'The selected Exotic perimeter must pulse without moving the armour artwork.');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.forge-exotic\.is-selected\{animation:none\}\}/,'The selection pulse must respect reduced-motion preferences.');
assert.match(css,/@media\(max-width:1760px\)\{\.forge-loader-workspace\{grid-template-columns:var\(--apx-workspace-compact-columns,392px minmax\(0,1fr\)\)\}\.forge-loader-output\{grid-column:1\/-1\}\}/,'Forge Loader must share the two-column workspace and move output below before compression.');
assert.match(css,/\.forge-hero-card\{[^}]*aspect-ratio:474\/96[^}]*overflow:hidden/,'The selected Guardian emblem must fit inside its card boundary.');
assert.match(css,/\.forge-stat-targets label>span\{[^}]*\.9rem/,'Eligible stat labels must retain the enlarged readable type scale.');
assert.match(css,/\.forge-matrix-stat small\{font-size:\.92rem\}[\s\S]*?\.forge-matrix-stat b\{font-size:1\.25rem\}/,'Forge Matrix stat labels and values must remain readable at the approved desktop density.');
assert.match(css,/@container\(max-width:60rem\)[\s\S]*?\.forge-matrix-stats\{grid-column:1\/-1;grid-row:2\}/,'Forge Matrix rows must reflow calculated stats without clipping in a narrow output column.');
assert.match(css,/\.forge-matrix-row\{grid-template-columns:6\.7rem var\(--apx-icon-card\) minmax\(22rem,1fr\)/,'Desktop Forge Matrix rows must reserve the shared card icon width.');
assert.match(css,/\.forge-matrix-exotic\{width:var\(--apx-icon-card\);height:var\(--apx-icon-card\);justify-self:center;align-self:center\}/,'Every matched Exotic frame must consume the shared square card icon token.');
assert.match(css,/@container\(max-width:60rem\)\{\.forge-matrix-row\{grid-template-columns:6\.7rem var\(--apx-icon-card\) minmax\(0,1fr\)/,'Compact Forge Matrix rows must preserve the shared card icon width.');
assert.match(css,/@media\(max-width:820px\)\{\.forge-matrix-row\{grid-template-columns:minmax\(0,1fr\) var\(--apx-icon-card\) 6\.8rem\}/,'Mobile Forge Matrix rows must preserve the shared card icon width.');
assert.match(css,/\.forge-set-head\{[^}]*grid-template-columns:var\(--apx-icon-record\)[\s\S]*?\.forge-set-head img\{width:var\(--apx-icon-record\);height:var\(--apx-icon-record\)/,'Set Protocol records must consume the shared record icon token.');
assert.match(css,/\.forge-staged-slot\{[^}]*grid-template-columns:var\(--apx-icon-card\)[\s\S]*?\.forge-staged-slot img,\.forge-stage-empty\{width:var\(--apx-icon-card\);height:var\(--apx-icon-card\)/,'Staged armour must consume the shared card icon token.');
assert.match(css,/\.forge-exotic-grid\{[^}]*minmax\(var\(--apx-icon-selector\),1fr\)/,'Exotic selection must consume the shared selector icon token.');
assert.match(css,/\.forge-inspect-main\{[^}]*grid-template-columns:var\(--apx-icon-inspect\)[\s\S]*?\.forge-inspect-main img\{width:var\(--apx-icon-inspect\);height:var\(--apx-icon-inspect\)/,'Matched item inspection must consume the shared inspect icon token.');
assert.match(runtime,/document\.documentElement\.append\(panel\)/,'The inspection card must escape the density-scaled body before viewport positioning.');
assert.match(runtime,/getBoundingClientRect\(\)/,'The inspection card must anchor to the selected item.');
assert.doesNotMatch(css,/\.forge-item-inspect\{[^}]*right:/,'The inspection card must not be fixed to the top-right dashboard corner.');
assert.match(runtime,/function stagedMarkup[\s\S]*?data-inspect-item="\$\{esc\(itemKey\(item\)\)\}"/,'Every staged Working Load item must expose its exact owned instance to Item Inspect.');
assert.match(runtime,/class="forge-matrix-exotic" data-inspect-item="\$\{esc\(itemKey\(exotic\)\)\}"/,'Every Forge Matrix Exotic icon must inspect its exact matched roll.');
assert.match(runtime,/function inspectItemFromTarget\(target\)\{[\s\S]*?catalogue\.armour\.find\(item=>itemKey\(item\)===String\(key\|\|''\)\)\|\|null;/,'Item Inspect must resolve only exact owned catalogue instances.');
assert.match(runtime,/function showInspect\(target\)\{[\s\S]*?if\(!item\?\.itemInstanceId\|\|!panel\)return;/,'Item Inspect must reject any definition-only or uninstanced item.');
assert.match(runtime,/ownedExoticGroups\(catalogue\.armour,activeCharacterClass\)[\s\S]*?THIS ROLL · OWNED \$\{ordinal\} OF \$\{instances\.length\} IN VAULT CATALOGUE/,'An inspected Exotic roll must report its position within the real owned-copy group.');
assert.doesNotMatch(runtime,/VERIFIED DEFINITION|BUNGIE COLLECTION DATA|ownedInstance/,'Item Inspect must not retain its generic collection-definition path.');
const loaderIndex=ribbon.indexOf("key:'forge-loader'");
const buildIndex=ribbon.indexOf("key:'build-forge'");
assert.ok(loaderIndex>=0&&loaderIndex<buildIndex,'Forge Loader must appear immediately before Build Forge.');
assert.match(access,/new URL\('\/astrix-app\/pages\/forge-loader\/'/,'Character and Build armour selection must open Forge Loader.');
assert.match(access,/OPEN FORGE LOADER/);

console.log('FORGE_LOADER_EXOTIC_SELECTOR=PASS');
console.log('FORGE_LOADER_SET_PROTOCOL=PASS');
console.log('FORGE_LOADER_CONSTRAINED_MATCHER=PASS');
console.log('FORGE_LOADER_NAVIGATION=PASS');
