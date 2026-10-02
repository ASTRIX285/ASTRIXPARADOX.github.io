#!/usr/bin/env node
// DIM import shows the complete build (2 Oct 2026). Recorded share fixture, no live call:
// https://dim.gg/ndttp4i/Mactics'-Arc-Assassins-Cowl-Hunter (fixtures/dim-import/cowl.json).
//   - Every group renders: subclass (labelled), Exotic armour, weapons, armour picks with their
//     mods, stat targets, set bonuses, shared mods, artifact; no emblem box without identifiers.
//   - The share pins no Exotic: it says so. A title match needs the exact display name and is
//     labelled as named in the title, never as pinned. Ranked picks are labelled suggestions.
//   - Armour picks come from the user's inventory, state their reason, and meet stat targets or
//     say which they miss. Nothing in the share is left out; unresolved hashes are named.
//   - Send to Build Forge carries the picks and the missing markers.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cowlFixture} from './fixtures/dim-import/cowl-inventory.mjs';
import {adaptDimLoadout} from '../core/dim-import/adapt.mjs';
import {resolveDimLoadout} from '../core/dim-import/resolve.mjs';
import {sendDimToForge} from '../core/dim-import/handoff.mjs';
import {TITLE_MATCH_LABEL} from '../core/dim-import/fill.mjs';
import {sharedBuildView} from '../pages/build-review/build-review-model.mjs';
import {renderSharedBuild,NO_EXOTIC,NO_WEAPONS,NO_STAT_TARGETS,NO_ARTIFACT} from '../pages/build-review/build-review-shared.mjs';

const ITEM='DestinyInventoryItemDefinition';
const f=await cowlFixture();
const share=f.loadout,p=share.parameters;

// 1. The recorded share is a subclass-and-mods share.
assert.equal(share.name,"Mactics' Arc Assassins Cowl Hunter");
assert.equal(share.equipped.length,1);assert.equal(share.unequipped.length,0);
assert.equal(f.snapshot.tables[ITEM][share.equipped[0].hash].inventory.bucketTypeHash,3284755031,'The only item is the subclass');
assert.equal(Object.keys(share.equipped[0].socketOverrides).length,11);
assert.equal(p.mods.length,13);
for(const key of ['exoticArmorHash','statConstraints','setBonuses','modsByBucket','artifactUnlocks','inGameIdentifiers'])assert.equal(p[key],undefined,`${key} is absent from the share`);

const adapt=(loadout=share,snapshot=f.snapshot,profile=f.profile)=>adaptDimLoadout(loadout,{snapshot,profile,binding:f.binding,preferredCharacterId:f.characterId});
const started=performance.now();
const adaptation=adapt(),view=sharedBuildView(adaptation),html=renderSharedBuild(view,{weapons:{state:'loading',rows:[]}});
const renderMs=performance.now()-started;
const fill=view.fill;
const text=html.replace(/<[^>]+>/g,' ').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');

// 2. Subclass, labelled, with every shared socket.
for(const label of ['Super','Class ability','Jump','Melee','Grenade','Aspects','Fragments'])assert.ok(view.subclassGroups.some(group=>group.label===label),`${label} group renders`);
const subclassNames=view.subclassGroups.flatMap(group=>group.plugs.map(plug=>plug.name));
assert.deepEqual(subclassNames.sort(),Object.values(share.equipped[0].socketOverrides).map(hash=>f.snapshot.tables[ITEM][hash].displayProperties.name).sort(),'Every subclass socket is shown');
assert.equal(view.subclassGroups.find(group=>group.label==='Super').plugs[0].name,'Gathering Storm');

// 3. Exotic: not pinned, exact title rule, ranked suggestions.
assert.equal(fill.exotic.pinned,null);
assert.ok(text.includes(NO_EXOTIC));
assert.deepEqual(fill.exotic.titleMatches,[],'"Assassins Cowl" is not the exact display name "Assassin\'s Cowl"');
assert.ok(!text.includes(TITLE_MATCH_LABEL));
assert.ok(fill.exotic.suggestions.length>=1);
assert.ok(fill.exotic.suggestions.every(row=>row.label==='Suggestion'&&row.reasons.length));
assert.ok(fill.exotic.suggestions.every(row=>!/Compatible equipment slot/.test(row.reasons.join(' '))));
assert.deepEqual(fill.exotic.suggestions.slice(0,2).map(row=>row.name).sort(),["Liar's Handshake",'Raiden Flux'],'Exotics whose perk text names Arc rank first');
for(const variant of ["Arc assassin's cowl Hunter","Arc Assassins Cowl Hunter","Arc Assassin's Cowls"]){
  const rows=adapt({...share,name:variant}).report.sharedBuild.exotic.titleMatches;
  assert.equal(rows.length,variant==="Arc Assassin's Cowls"?1:0,`Exact name only: ${variant}`);
}
const titled=adapt({...share,name:"Mactics' Arc Assassin's Cowl Hunter"}),titledFill=titled.report.sharedBuild;
assert.equal(titledFill.exotic.pinned,null,'A title match is never pinned');
assert.equal(titledFill.exotic.titleMatches[0].name,"Assassin's Cowl");
assert.equal(titledFill.exotic.titleMatches[0].label,TITLE_MATCH_LABEL);
assert.equal(titledFill.exotic.titleMatches[0].owned,true);
assert.ok(!titledFill.exotic.suggestions.some(row=>row.name==="Assassin's Cowl"),'The title match is listed once, above the ranked picks');
const titledHtml=renderSharedBuild(sharedBuildView(titled),{weapons:{state:'loading',rows:[]}});
assert.ok(titledHtml.indexOf(TITLE_MATCH_LABEL.replace(/'/g,'&#39;'))<titledHtml.indexOf('ranked picks from your inventory'),'The title match is the first Exotic suggestion');
assert.equal(titledFill.armour.rows[0].name,"Assassin's Cowl",'The owned title match fills the Helmet pick');
assert.match(titledFill.armour.rows[0].reasons.join(' '),/Named in the share's title, not pinned in the share/);

// 4. Weapons: none in the share, suggestions labelled as such.
assert.equal(fill.weapons.shared,0);
assert.ok(text.includes(NO_WEAPONS));
const withWeapons=renderSharedBuild(view,{weapons:{state:'ready',rows:[{slot:'Energy',name:'Unfall',icon:'',reasons:['Unfall is ARC, matching your ARC subclass.']}]}});
assert.match(withWeapons,/Suggestion from your inventory/);assert.match(withWeapons,/Unfall/);
assert.doesNotMatch(withWeapons.slice(withWeapons.indexOf('brWeaponsTitle'),withWeapons.indexOf('brArmourTitle')),/From the share/,'A weapon suggestion is never shown as the sharer\'s');

// 5. Armour: five picks from the inventory, each with a reason and its slot's shared mods.
assert.equal(fill.armour.source,'inventory');
assert.equal(fill.armour.rows.length,5);
for(const row of fill.armour.rows){assert.equal(row.from,'inventory');assert.ok(row.itemInstanceId);assert.ok(row.reasons.length);assert.doesNotMatch(row.reasons.join(' '),/Compatible equipment slot/);}
assert.equal((text.match(/Picked from your inventory/g)||[]).length,5);
const armourHtml=html.slice(html.indexOf('brArmourTitle'),html.indexOf('brStatsTitle'));
assert.doesNotMatch(armourHtml,/From the share/,'An armour pick is never shown as the sharer\'s item');
assert.equal(fill.armour.rows.reduce((n,row)=>n+row.mods.length,0),13,'All 13 shared mods are placed on a slot');
assert.deepEqual(fill.armour.rows.find(row=>row.slot==='Legs').mods.map(mod=>mod.name),['Absolution','Absolution','Innervation']);
assert.equal(fill.armour.rows.find(row=>row.slot==='Legs').stats[1943323491],30,'The better Strides roll is picked');

// 6. Stat targets: none in the share, and the picks' real totals.
assert.deepEqual(fill.stats.targets,[]);assert.ok(text.includes(NO_STAT_TARGETS));
assert.deepEqual(fill.stats.totals.map(row=>row.name),['Health','Melee','Class','Grenade','Super','Weapons'],'Armor 3.0 stats');
const constrained=adapt({...share,parameters:{...p,statConstraints:[{statHash:4244567218,minStat:80,maxStat:200},{statHash:144602215,minStat:150,maxStat:200}]}}).report.sharedBuild;
const melee=constrained.stats.targets.find(row=>row.name==='Melee'),superStat=constrained.stats.targets.find(row=>row.name==='Super');
assert.equal(melee.met,true);assert.equal(superStat.met,false);
const constrainedHtml=renderSharedBuild({...view,fill:constrained},{weapons:{state:'loading',rows:[]}});
assert.match(constrainedHtml,/Meets/);assert.match(constrainedHtml,new RegExp(`Misses: ${150-superStat.reached} short`),'Picks say which target they miss');

// 7. Set bonuses from DestinyEquipableItemSetDefinition, mods, artifact, emblem.
assert.deepEqual(fill.sets.requested,[]);
assert.equal(fill.sets.formed[0].name,"Atheon's Memory");assert.equal(fill.sets.formed[0].count,4);
assert.ok(fill.sets.formed[0].perks.every(perk=>perk.name&&!/Unresolved/.test(perk.name)));
assert.match(text,/SHARED MODS \(13\)/);
assert.deepEqual(fill.mods.all.map(mod=>mod.hash),p.mods,'Every shared mod, in share order');
assert.ok(fill.mods.all.every(mod=>mod.name&&!mod.unresolved));
assert.ok(text.includes(`ARTIFACT UNLOCKS ${NO_ARTIFACT}`));
assert.equal(fill.emblem,null);assert.doesNotMatch(html,/LOADOUT EMBLEM/,'No emblem box without identifiers');
assert.doesNotMatch(html,/Unresolved/,'Every hash resolves from the recorded manifest');

// 8. Unresolved hashes are named, never hidden.
const missingMod=p.mods[0],partial={...f.snapshot,tables:{...f.snapshot.tables,[ITEM]:{...f.snapshot.tables[ITEM]}}};delete partial.tables[ITEM][missingMod];
assert.throws(()=>resolveDimLoadout(share,{snapshot:partial}),error=>error.unresolved.includes(`${ITEM}:${missingMod}`));

// 9. Send to Build Forge carries the picks and the missing markers.
const store=new Map(),go={assigned:''};
sendDimToForge(adaptation.build,{storage:{setItem:(key,value)=>store.set(key,value)},location:{assign:href=>{go.assigned=href;}}});
const handed=JSON.parse(store.get('astrix:paradox-build-space:v1'));
const handedText=JSON.stringify(handed);
for(const row of fill.armour.rows)assert.ok(handedText.includes(row.itemInstanceId),`${row.slot} pick travels to Build Forge`);
assert.equal((handedText.match(/"status":"picked"/g)||[]).length>=5,true,'Each pick keeps its marker');
assert.match(go.assigned,/paradox-build-space\//);
const noCloak={...f.profile,characterEquipment:{data:{[f.characterId]:{items:f.profile.characterEquipment.data[f.characterId].items.filter(item=>item.itemHash!==601809810)}}}};
const unfilled=adapt(share,f.snapshot,noCloak);
assert.ok(unfilled.report.comparisons.some(row=>row.status==='unfilled'&&row.bucketHash===1585787867),'A slot nothing fits carries a missing marker');
store.clear();sendDimToForge(unfilled.build,{storage:{setItem:(key,value)=>store.set(key,value)},location:{assign:()=>{}}});
assert.match(store.get('astrix:paradox-build-space:v1'),/"status":"unfilled"/);

console.log(`DIM_COMPLETE_BUILD=PASS recorded share ndttp4i: subclass 11/11 labelled, no pinned Exotic said, exact title rule (no match for "Assassins Cowl"; match labelled when exact), ${fill.exotic.suggestions.length} ranked Exotic suggestions, 5 armour picks with reasons and 13/13 mods placed, no stat targets said with Armor 3.0 totals, targets met or missed by name, ${fill.sets.formed[0].name} ${fill.sets.formed[0].count} pieces, artifact none, no emblem box, unresolved named, handoff carries picks and missing markers; adapt+render ${renderMs.toFixed(1)} ms`);
