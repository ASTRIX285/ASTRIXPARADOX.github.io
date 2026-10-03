#!/usr/bin/env node
// Armoury visual editor (pages/loadout/armoury-editor.mjs). Synthetic contract inputs only.
import assert from 'node:assert/strict';
import {createArmouryEditor,modPlacement,armourStatTotals,fragmentSlotLimit,energyCostOf,EMPTY_PLUG_HASH} from '../pages/loadout/armoury-editor.mjs';
import {WEAPON_BUCKETS,ARMOUR_BUCKETS} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';

const CHARACTER_ID='9100001';
const binding={characterId:CHARACTER_ID,membershipId:'9200001',membershipType:'3',characterClass:'titan'};
const vault={kind:'vault'},equippedHere={kind:'equipped',characterId:CHARACTER_ID};
const mod=(hash,name,cost,socketIndex,category='armor.mods.general')=>({hash,itemHash:hash,name,socketIndex,canInsert:true,enabled:true,source:'bungie-item-reusable-plugs',remoteInsertEvidence:'exact-item-reusable-plug',energyCost:cost,definition:{displayProperties:{name},plug:{plugCategoryIdentifier:category,energyCost:{energyCost:cost}}}});
const generalOptions=[mod(501,'Light mod',1,0),mod(502,'Mid mod',3,0),mod(503,'Heavy mod',5,0)];
const generalOptions1=generalOptions.map(row=>({...row,socketIndex:1}));
const armour=(slot,{exotic=false,classType=0,id,capacity=10,mods=[]}={})=>({itemInstanceId:String(id),hash:20000+Number(id),itemHash:20000+Number(id),name:`${exotic?'Exotic':'Legendary'} armour ${id}`,bucketHash:ARMOUR_BUCKETS[slot],classType,isExotic:exotic,source:vault,
  energy:{capacity,used:0},stats:[{hash:1,name:'Health',value:10+slot},{hash:2,name:'Melee',value:5}],
  armourModOptions:{0:generalOptions,1:generalOptions1},socketCoverage:{plugs:mods},generalMods:mods});
const weapon=(slot,{exotic=false,id}={})=>({itemInstanceId:String(id),hash:30000+Number(id),itemHash:30000+Number(id),name:`${exotic?'Exotic':'Legendary'} weapon ${id}`,bucketHash:WEAPON_BUCKETS[slot],isExotic:exotic,source:vault});

const startArmour=ARMOUR_BUCKETS.map((_,slot)=>armour(slot,{id:100+slot,classType:0,mods:slot===2?[{...generalOptions[1]},{...generalOptions1[2]}]:[]}));
startArmour[0]={...startArmour[0],isExotic:true,name:'Seventh Seraph Helmet'};
const startWeapons=[weapon(0,{id:200,exotic:true}),null,weapon(2,{id:202})];
const catalogue=[
  ...startArmour,armour(0,{id:110}),armour(1,{id:111,exotic:true}),armour(2,{id:112,classType:1}),armour(2,{id:113,capacity:6}),
  ...startWeapons.filter(Boolean),weapon(1,{id:211}),weapon(1,{id:212,exotic:true}),weapon(0,{id:213}),
  {...weapon(1,{id:214}),source:{kind:'carried',characterId:'other-guardian'}}
];
const artifact={hash:880,name:'Synthetic Artifact',availabilityModel:'artifact-2-socket-buckets',selectionLimit:3,selectionSlots:[{tierIndex:0,capacity:2},{tierIndex:1,capacity:1}],
  perks:[{hash:801,name:'Perk A',tierIndex:0},{hash:802,name:'Perk B',tierIndex:0},{hash:803,name:'Perk C',tierIndex:0},{hash:804,name:'Perk D',tierIndex:1},{hash:805,name:'Locked perk',tierIndex:1,tierUnlocked:false}]};
const aspect=(hash,slots,socketIndex)=>({hash,name:`Aspect ${hash}`,fragmentSlots:slots,socketIndex,canInsert:true});
const fragment=(hash,socketIndex)=>({hash,name:`Fragment ${hash}`,socketIndex,canInsert:true});
const subclass={itemInstanceId:'300',hash:300,name:'Synthetic subclass',subclassBuild:{
  superOptions:[{hash:901,name:'Super A',socketIndex:0,canInsert:true},{hash:902,name:'Super B',socketIndex:0,canInsert:true}],
  aspectOptionsBySocket:{5:[aspect(950,2,5),aspect(951,3,5)],6:[aspect(952,1,6),aspect(951,3,6)]},
  fragmentOptionsBySocket:Object.fromEntries([7,8,9,10,11].map(index=>[index,[fragment(970,index),fragment(971,index),fragment(972,index)]]))}};
const record={id:'saved-1',name:'Saved one',description:'Notes',binding,revision:4,build:{...binding,weapons:startWeapons,armour:startArmour,subclassItem:subclass,subclassItemInstanceId:'300',subclassName:'Synthetic subclass',
  subclassBuild:{super:{hash:901,name:'Super A',socketIndex:0},aspects:[aspect(950,2,5),{hash:EMPTY_PLUG_HASH,socketIndex:6}],fragments:[fragment(970,7),null]},artifactConfiguration:{selectedPerkHashes:[801]}}};
const otherArtifact={hash:881,name:'Other Artifact',availabilityModel:'artifact-2-socket-buckets',selectionLimit:2,selectionSlots:[{tierIndex:0,capacity:2}],perks:[{hash:861,name:'Other perk X',tierIndex:0},{hash:862,name:'Other perk Y',tierIndex:0}]};
const make=()=>createArmouryEditor({record,catalogue,subclasses:[subclass],artifact,artifacts:[artifact,otherArtifact]});

// Layout: name and notes on top, five panels, footer buttons, empty tiles are clickable.
{
  const editor=make(),html=editor.html();
  for(const label of ['SUBCLASS','WEAPONS','ARMOUR','MODS','ARTIFACT'])assert.match(html,new RegExp(`<h3 id="ae[A-Za-z]+">${label}`),`${label} panel`);
  for(const label of ['SAVE CHANGES','SAVE AS NEW','UNDO','REDO','CANCEL'])assert.match(html,new RegExp(`>${label}<`),`${label} button`);
  assert.match(html,/id="paradoxEditName"[^>]+value="Saved one"/);assert.match(html,/id="paradoxEditDescription"[^>]*>Notes</);
  assert.match(html,/data-ed-target="weapon:1"[^>]*aria-label="ENERGY: empty slot, choose an item"/,'An empty weapon slot is a clickable empty tile');
  assert.doesNotMatch(html,/<select|data-editor-choice/,'No dropdowns remain');
  assert.doesNotMatch(html,/Unresolved Destiny item/);
  assert.match(html,/UNDO<\/button>/);assert.match(html,/data-ed="undo" disabled/,'UNDO starts disabled');
  console.log('ARMOURY_EDITOR_LAYOUT=PASS five panels, name and notes, footer, empty tiles, no dropdowns');
}

// Weapons: only owned weapons for that slot, search, one Exotic with the replaced one named.
{
  const editor=make();editor.open('weapon:1');
  const names=editor.pickerOptions().map(row=>row.item.name);
  assert.deepEqual(names.sort(),['Exotic weapon 212','Legendary weapon 211'].sort(),'Only this slot, this Guardian or the Vault');
  assert.equal(editor.pickerOptions().find(row=>row.item.name==='Exotic weapon 212').note,'Replaces Exotic weapon 200 as your Exotic');
  editor.search('211');assert.deepEqual(editor.pickerOptions().map(row=>row.item.name),['Legendary weapon 211'],'Search filters by name');
  editor.search('');
  const exoticAt=editor.pickerOptions().findIndex(row=>row.item.name==='Exotic weapon 212');
  assert.ok(editor.pick(exoticAt));
  assert.equal(editor.record.build.weapons[1].name,'Exotic weapon 212');
  assert.equal(editor.record.build.weapons[0],null,'The previous Exotic is replaced and its slot left empty to refill');
  assert.equal(editor.state.picker,null,'Picking closes the picker');
  assert.equal(editor.record.build.weapons.filter(row=>row?.isExotic).length,1);
  console.log('ARMOURY_EDITOR_WEAPONS=PASS slot-only owned weapons, search, one Exotic and the replaced one named');
}

// Armour: class rules, one Exotic, live stat totals.
{
  const editor=make();
  editor.open('armour:2');
  assert.ok(!editor.pickerOptions().some(row=>row.item.itemInstanceId==='112'),'Another class’s armour is never offered');
  editor.open('armour:1');
  const exotic=editor.pickerOptions().findIndex(row=>row.item.itemInstanceId==='111');
  assert.match(editor.pickerOptions()[exotic].note,/Replaces Seventh Seraph Helmet/);
  const before=armourStatTotals(editor.record.build.armour).stats.find(row=>row.hash===1).value;
  editor.pick(exotic);
  assert.equal(editor.record.build.armour[0],null);assert.equal(editor.record.build.armour[1].itemInstanceId,'111');
  const after=armourStatTotals(editor.record.build.armour);
  assert.equal(after.stats.find(row=>row.hash===1).value,before-10,'Totals update from the pieces now staged');
  assert.equal(after.complete,false,'An empty slot makes the totals partial, never estimated');
  console.log('ARMOURY_EDITOR_ARMOUR=PASS class rules, one Exotic, live stat totals');
}

// Mods: socket-accepted options with energy, blocked over capacity with the reason, titled per piece.
{
  const editor=make();
  editor.open('mod:2:0');
  assert.match(editor.html(),/CHEST ARMOUR MOD \(1\/2\)/);
  const options=editor.pickerOptions();
  assert.deepEqual(options.map(row=>row.cost),[1,3,5]);
  // Chest: socket 0 has Mid (3), socket 1 has Heavy (5) on 10 energy. Heavy in socket 0 needs 5 with 5 free: fits.
  assert.equal(options.find(row=>row.item.hash===503).blocked,'');
  const small=createArmouryEditor({record:{...record,build:{...record.build,armour:record.build.armour.map((row,index)=>index===2?{...row,energy:{capacity:6,used:0}}:row)}},catalogue,subclasses:[subclass],artifact});
  small.open('mod:2:0');
  assert.equal(small.pickerOptions().find(row=>row.item.hash===503).blocked,'Needs 5 energy, 1 free','Over-energy mods are blocked with the reason');
  assert.equal(small.pick(small.pickerOptions().findIndex(row=>row.item.hash===503)),false);
  assert.ok(editor.pick(options.findIndex(row=>row.item.hash===501)));
  assert.equal(modPlacement(editor.record.build.armour).pieces[2].used,6);
  assert.equal(energyCostOf({name:'no data'}),null,'Unknown cost is null, never zero');
  console.log('ARMOURY_EDITOR_MODS=PASS accepted mods with cost, energy blocking with reason, piece title');
}

// Mod placement: over-energy pieces and mods a swapped piece cannot take are listed with reasons.
{
  const over=modPlacement([null,null,{...startArmour[2],energy:{capacity:6,used:0}},null,null]);
  assert.equal(over.pieces[2].over,true);
  assert.equal(over.unassigned.length,1);assert.match(over.unassigned[0].reason,/Needs 5 energy\. CHEST has 6 energy and 8 is staged\./);
  const editor=make();
  editor.open('armour:2');
  const narrow=editor.pickerOptions().findIndex(row=>row.item.itemInstanceId==='113');
  editor.pick(narrow);
  const placement=modPlacement(editor.record.build.armour,editor.state.carried);
  assert.ok(placement.unassigned.length>=1,'A mod the new piece cannot hold is listed');
  editor.handle({dataset:{ed:'view'}});
  assert.match(editor.html(),/MOD PLACEMENT/);assert.match(editor.html(),/UNASSIGNED MODS/);
  console.log('ARMOURY_EDITOR_PLACEMENT=PASS placement view with unassigned mods and reasons');
}

// Artifact: unlocked perks only, counter from data, column and total limits.
{
  const editor=make();
  assert.match(editor.html(),/ARTIFACT<span class="ae-count">1\/3<\/span>/,'Counter uses the Artifact selection limit from data');
  // 3 Oct 2026: step 1 picks the artifact, step 2 is that artifact's own perk grid by tier.
  assert.match(editor.html(),/TIER 1[\s\S]*TIER 2/,'Perks sit in the artifact\'s tier columns');
  assert.match(editor.html(),/class="ae-tile ae-plug ae-tip is-locked"[^>]*data-name="Locked perk"[^>]*disabled/,'A locked perk shows in its column but cannot be chosen');
  assert.doesNotMatch(editor.html(),/Other perk/,'Only the chosen artifact\'s perks are offered');
  assert.doesNotMatch(editor.html(),/ae-choices/,'No flat list of every artifact mod');
  assert.ok(editor.toggleArtifact(1));assert.match(editor.html(),/2\/3/);
  assert.ok(editor.toggleArtifact(3));assert.match(editor.html(),/3\/3/);
  assert.equal(editor.toggleArtifact(4),false,'A locked perk cannot be chosen');
  // Step 1 again: the owned artifacts as icons; picking another opens its own perks only.
  assert.ok(editor.open('artifact'));
  assert.deepEqual(editor.pickerOptions().map(row=>row.item.hash),[880,881]);
  assert.doesNotMatch(editor.html(),/ae-choice-name/,'Picker tiles carry no visible name text');
  editor.handle({dataset:{edPreview:'1'}});assert.match(editor.html(),/Other Artifact[\s\S]*SELECT/,'Clicking a tile opens its card with Select');
  assert.ok(editor.pick(1));
  const chosenHtml=editor.html();assert.match(chosenHtml,/Other perk X/);assert.doesNotMatch(chosenHtml,/data-name="Perk A"/);assert.match(chosenHtml,/ARTIFACT<span class="ae-count">0\/2<\/span>/);
  console.log('ARMOURY_EDITOR_ARTIFACT=PASS step 1 owned artifacts, step 2 its own tier grid only, locked perks disabled, n/limit from data, limits');
}

// Subclass: tiles, click to swap, Fragment slots follow the Aspects.
{
  const editor=make();
  assert.equal(fragmentSlotLimit(editor.record.build.subclassBuild),2);
  assert.match(editor.html(),/FRAGMENTS<span class="ae-count">1\/2<\/span>/);
  assert.equal((editor.html().split('<h4>FRAGMENTS')[1].split('</section>')[0].match(/ is-locked"/g)||[]).length,3,'Sockets beyond the Aspect total are locked');
  editor.open('subclass-socket:aspects:6');
  assert.ok(editor.pick(editor.pickerOptions().findIndex(row=>row.item.hash===951)));
  assert.equal(fragmentSlotLimit(editor.record.build.subclassBuild),5,'Fragment slots grow with the new Aspect');
  editor.open('subclass-socket:fragments:8');
  assert.ok(editor.pick(editor.pickerOptions().findIndex(row=>row.item.hash===971)));
  editor.open('subclass-socket:fragments:9');
  assert.equal(editor.pick(editor.pickerOptions().findIndex(row=>row.item.hash===970)),false,'The same Fragment twice is refused');
  assert.match(editor.state.error,/already in another Fragment socket/);
  editor.open('subclass-socket:super:0');
  assert.ok(editor.pick(editor.pickerOptions().findIndex(row=>row.item.hash===902)));
  assert.equal(editor.record.build.subclassBuild.super.hash,902);
  console.log('ARMOURY_EDITOR_SUBCLASS=PASS super, aspects and fragments swap, fragment slots follow aspects');
}

// UNDO and REDO walk the history; the saved record given to the editor never changes.
{
  const editor=make(),original=JSON.stringify(record);
  editor.open('weapon:1');editor.pick(0);editor.open('mod:2:0');editor.pick(0);
  assert.equal(editor.state.history.length,2);
  editor.undo();assert.equal(editor.state.future.length,1);
  editor.undo();assert.equal(editor.record.build.weapons[1],null);
  editor.redo();assert.ok(editor.record.build.weapons[1]);
  assert.match(editor.html(),/data-ed="redo">REDO|data-ed="redo">/);
  assert.equal(JSON.stringify(record),original,'Editing never mutates the stored build');
  console.log('ARMOURY_EDITOR_HISTORY=PASS undo, redo, stored build untouched');
}

// Empty and null sockets never crash and render as empty tiles.
{
  const broken=createArmouryEditor({record:{...record,build:{...binding,weapons:[null,null,null],armour:[null,{...startArmour[1],armourModOptions:{0:[null,generalOptions[0]]},socketCoverage:{plugs:[null,{hash:EMPTY_PLUG_HASH,socketIndex:0}]}},null,null,null],subclassBuild:null}},catalogue:[],subclasses:[],artifact:null});
  const html=broken.html();
  assert.match(html,/No artifact on this account in the Bungie data/);
  assert.match(html,/aria-label="ARMS mod 1: Empty mod socket"/);
  broken.open('weapon:0');assert.match(broken.html(),/You own nothing else for this slot/);
  console.log('ARMOURY_EDITOR_EMPTY=PASS empty slots, null sockets and missing data render without errors');
}
