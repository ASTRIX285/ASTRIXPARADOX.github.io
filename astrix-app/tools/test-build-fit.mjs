#!/usr/bin/env node
// Build Fit engine with the recorded "Consecration Titan PERFECTED" share and a test Titan inventory.
// Checks: the four missing set pieces get a joint suggestion that keeps both shared 2-piece bonuses;
// a same-set piece outranks a higher-stat slot match; reasons and costs are real (no
// "Compatible equipment slot"); all three decisions; Approve all keeps earlier decisions and only
// fills undecided slots; Continue (fitChoices) is blocked until every missing item is decided;
// the URL form round-trips; the handoff carries exactly the decided items, every shared mod placed
// on its own piece or listed with a reason, the subclass as shared, the artifact and the equipment.
import assert from 'node:assert/strict';
import {consecrationFixture} from './fixtures/dim-import/consecration-inventory.mjs';
import {adaptDimLoadout} from '../core/dim-import/adapt.mjs';
import {createFitPlan,resolveFit,rankSlot,approveAll,fitChoices,encodeDecisions,decodeDecisions,validDecisions,sharedStatPriority} from '../core/dim-import/fit.mjs';
import {placeMods} from '../core/dim-import/mods.mjs';
import {renderDimComparison} from '../core/dim-import/review.mjs';
const HELMET=3448274439,GAUNTLETS=3551918588,CHEST=14239492,LEGS=20886954,CLASS=1585787867;
const f=await consecrationFixture(),opts={snapshot:f.snapshot,profile:f.profile,binding:f.binding,preferredCharacterId:f.characterId};
const adaptation=adaptDimLoadout(f.loadout,opts),plan=createFitPlan(adaptation,{snapshot:f.snapshot,profile:f.profile});

// Shared set bonuses come from the set and sandbox perk definitions.
assert.deepEqual(plan.sharedPerks.map(perk=>`${perk.setName} ${perk.required} ${perk.name}`).sort(),["Crota's Memory 2 Cursed Fist","Legacy's Oath 2 Augmented Servos"]);
// Stat priority comes from the share's own mods and fragments.
assert.deepEqual(sharedStatPriority(adaptation.model,f.snapshot.tables).stats.map(stat=>stat.name),['Melee','Grenade','Weapons','Super']);

let fit=resolveFit(plan);
assert.deepEqual(fit.slots.filter(slot=>slot.state==='undecided').map(slot=>slot.bucketHash).sort(),[HELMET,GAUNTLETS,CHEST,LEGS].sort(),'The four shared set pieces are missing');
const suggestion=bucket=>fit.slots.find(slot=>slot.bucketHash===bucket).suggestion?.name;
assert.deepEqual([HELMET,GAUNTLETS,CHEST,LEGS].map(suggestion),["Legacy's Oath Helm","Willbreaker's Fists","Legacy's Oath Plate","Willbreaker's Greaves"],'The joint suggestion keeps both set bonuses across slots');
const all=JSON.stringify(fit.slots.map(slot=>slot.ranked));
assert.doesNotMatch(all,/Compatible equipment slot/,'No empty slot-only reason');

// Same set outranks a slot and stat match, with reason and cost text.
const gauntlets=plan.slots.find(slot=>slot.bucketHash===GAUNTLETS),ranked=rankSlot(plan,gauntlets);
assert.equal(ranked[0].name,"Willbreaker's Fists");
assert.ok(ranked[0].reasons.includes("Keeps the Crota's Memory 2-piece bonus (Cursed Fist) with Willbreaker's Greaves."));
assert.ok(ranked[0].reasons.includes('Cursed Fist acts on your melee (Frenzied Blade).'));
const pantheos=ranked.find(row=>row.name==='Pantheos Resplendent Gauntlets');
assert.ok(ranked.indexOf(pantheos)>0&&pantheos.stats[4244567218]>ranked[0].stats[4244567218],'The higher-Melee Pantheos piece ranks below the set piece');
assert.ok(pantheos.costs.includes("Loses the Crota's Memory 2-piece bonus (Cursed Fist)."));
// No Exotic armour is offered while Stoicism is in the build.
assert.ok(plan.slots.filter(slot=>slot.missing).every(slot=>rankSlot(plan,slot).every(row=>!row.isExotic)));

// Decisions: approve, choose another, leave empty; Continue blocked until all are decided.
let decisions=new Map([[HELMET,{type:'approve',id:plan.suggestions.get(HELMET)}],[GAUNTLETS,{type:'choose',id:pantheos.id}],[CHEST,{type:'empty'}]]);
fit=resolveFit(plan,decisions);
assert.equal(fit.ready,false);assert.equal(fit.undecided,1);
assert.throws(()=>fitChoices(plan,decisions),/Decide every missing item first/);
assert.ok(!fit.sets.some(set=>set.perks.some(perk=>perk.active)),'Both set bonuses are lost with these decisions');
// URL form round-trips; a decision for an item you do not own is dropped.
assert.deepEqual(decodeDecisions(encodeDecisions(decisions)),decisions);
assert.equal(validDecisions(plan,decodeDecisions(`${HELMET}:c999.${CHEST}:e`)).size,1,'An unknown item id is not kept');
assert.equal(decodeDecisions('x:y.123:q').size,0,'Malformed decisions are ignored');
// Approve all fills only the undecided slot.
decisions=approveAll(plan,decisions);
assert.deepEqual([HELMET,GAUNTLETS,CHEST,LEGS].map(bucket=>decisions.get(bucket).type),['approve','choose','empty','approve']);
fit=resolveFit(plan,decisions);assert.equal(fit.ready,true);

// Handoff: exactly the decided items, mods on their own pieces or listed with a reason.
const choices=fitChoices(plan,decisions);
const handed=adaptDimLoadout(f.loadout,{...opts,choices}),build=handed.build,report=handed.report;
assert.deepEqual(build.armour.map(item=>item?.name||null),["Legacy's Oath Helm",'Pantheos Resplendent Gauntlets',null,"Willbreaker's Greaves",'Stoicism']);
assert.deepEqual(build.weapons.map(item=>item?.name),['Conditional Finality','The Ringing Nail','The Slammer']);
assert.deepEqual(report.comparisons.filter(row=>row.kind==='armour').map(row=>row.status),['approved','chosen','empty','approved','matched']);
const modsOn=bucket=>build.armour.find(item=>item?.bucketHash===bucket).sockets.filter(plug=>['general-mod','slot-mod'].includes(plug.semanticRole)).map(plug=>plug.name);
assert.deepEqual(modsOn(HELMET),['Melee Mod','Harmonic Siphon','Dynamo','Hands-On','+Grenade / -Health']);
assert.ok(['Outreach','Time Dilation','Powerful Attraction'].every(name=>modsOn(CLASS).includes(name)));
const placed=report.mods.placed.reduce((n,row)=>n+row.mods.length,0),unplaced=report.mods.unplaced;
const shared=f.loadout.parameters.mods.length+Object.values(f.loadout.parameters.modsByBucket).flat().length;
assert.equal(placed+unplaced.length,shared,'Every shared mod and cosmetic is placed or listed, none dropped');
for(const name of ['Solar Resistance','Melee Damage Resistance','Concussive Dampener'])assert.equal(unplaced.find(mod=>mod.name===name)?.reason,'No Chest in this build to hold it.');
assert.ok(unplaced.every(mod=>mod.reason),'Every unplaced mod has a reason');
// Energy: no piece goes over its capacity (11 on every test piece).
for(const row of report.mods.placed)assert.ok(row.mods.reduce((n,mod)=>n+mod.cost,0)<=11,`${row.item} stays within its energy`);
// Subclass as shared; artifact and equipment carried.
const sub=build.subclassBuild;
assert.deepEqual([sub.super?.name,...sub.aspects.map(plug=>plug.name)],['Glacial Quake','Consecration','Knockout']);
assert.deepEqual(sub.fragments.filter(plug=>plug.hash&&!/^Empty/.test(plug.name)).map(plug=>plug.name),['Facet of Protection','Facet of Purpose','Facet of Courage','Facet of Ruin']);
assert.equal(report.sharedBuild.artifact.unlocks.length,12);
assert.deepEqual(build.equipment.map(row=>row.name),['Winterview Shell','The Xûrfboard','A Thousand Wings','Heavy Is the Crown']);
// The Forge panel labels decisions as decisions.
const panel=renderDimComparison(build);
for(const label of ['Approved replacement','Your choice','Left empty','Shared artifact picks (12)'])assert.ok(panel.includes(label),label);
assert.doesNotMatch(panel,/Compatible equipment slot|–|—/);
// Mods that do not fit say so: energy and missing piece.
const tight=placeMods(new Map([[HELMET,{itemInstanceId:'none',definition:f.snapshot.tables.DestinyInventoryItemDefinition[129329474]}]]),{mods:[2414626352,3938489430,3832366019,4287799666,4287799666]},f.snapshot.tables,{itemComponents:{instances:{data:{none:{energy:{energyCapacity:7}}}}}});
assert.ok(tight.unplaced.some(mod=>/^Not enough energy on Legacy's Oath Helm: needs 3, \d left\.$/.test(mod.reason)),'Over-energy mods are listed with the energy reason');
console.log('BUILD_FIT=PASS joint set-keeping suggestion, same set outranks slot and stats with reason and cost text, all three decisions, Approve all, Continue blocked until decided, URL round-trip, handoff with exact items, every mod placed or listed with a reason, subclass, artifact and equipment carried');
