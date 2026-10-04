#!/usr/bin/env node
// Armoury Edit pickers (Miguel, 3 Oct 2026). Synthetic items shaped like the live data:
// abilityOptionsBySocket keyed by ability name, Aspect fragment capacity in the Bungie definition
// (plug.energyCapacity.capacityValue), armour stats as the Vault catalogue builds them.
import assert from 'node:assert/strict';
import {createArmouryEditor,fragmentSlotLimit,EMPTY_PLUG_HASH} from '../pages/loadout/armoury-editor.mjs';
import {WEAPON_BUCKETS,ARMOUR_BUCKETS} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';

const CHARACTER_ID='9100001';
const binding={characterId:CHARACTER_ID,membershipId:'9200001',membershipType:'3',characterClass:'hunter'};
const here={kind:'equipped',characterId:CHARACTER_ID},vault={kind:'vault'};
const stats=(a,b)=>[{hash:392767087,name:'Health',value:a},{hash:4244567218,name:'Melee',value:b}];
const armour=(slot,id,{exotic=false}={})=>({itemInstanceId:String(id),hash:20000+id,itemHash:20000+id,name:`${exotic?'Exotic':'Legendary'} armour ${id}`,bucketHash:ARMOUR_BUCKETS[slot],classType:1,isExotic:exotic,source:here,energy:{capacity:10,used:0},stats:stats(10+slot,5),armourModOptions:{},socketCoverage:{plugs:[]}});
const weapon=(slot,id,{exotic=false}={})=>({itemInstanceId:String(id),hash:30000+id,itemHash:30000+id,name:`${exotic?'Exotic':'Legendary'} weapon ${id}`,bucketHash:WEAPON_BUCKETS[slot],isExotic:exotic,source:vault});
const plug=(hash,name,socketIndex,extra={})=>({hash,itemHash:hash,name,socketIndex,canInsert:true,definition:{displayProperties:{name,description:`${name} description`}},...extra});
const aspect=(hash,slots,socketIndex)=>plug(hash,`Aspect ${hash}`,socketIndex,{definition:{displayProperties:{name:`Aspect ${hash}`},plug:{energyCapacity:{capacityValue:slots}}}});
const emptyFragment=socketIndex=>({hash:EMPTY_PLUG_HASH,socketIndex});
// Two subclasses with ability options keyed by name, as guardian-bungie-profile builds them.
const subclass=(id,prefix)=>({itemInstanceId:String(id),hash:id,name:`${prefix} subclass`,subclassBuild:{
  superOptions:[plug(id*10+1,`${prefix} Super`,0)],
  abilityOptionsBySocket:{classAbility:[plug(id*10+2,`${prefix} Dodge`,1),plug(id*10+3,`${prefix} Marksman`,1)],movement:[plug(id*10+4,`${prefix} Jump`,2)],melee:[plug(id*10+5,`${prefix} Melee`,3)],grenade:[plug(id*10+6,`${prefix} Grenade`,4)]},
  aspectOptionsBySocket:{5:[aspect(950,2,5),aspect(951,3,5)],6:[aspect(952,2,6)]},
  fragmentOptionsBySocket:Object.fromEntries([7,8,9,10,11].map(index=>[index,[plug(EMPTY_PLUG_HASH,'Empty Fragment Socket',index),plug(970,'Fragment A',index),plug(971,'Fragment B',index),plug(972,'Fragment C',index),plug(973,'Fragment D',index)]]))}});
const arc=subclass(301,'Arc'),solar=subclass(302,'Solar');
const startArmour=ARMOUR_BUCKETS.map((_,slot)=>armour(slot,100+slot,{exotic:slot===0}));
const lodestar=weapon(1,201,{exotic:true});lodestar.name='Lodestar';
const record={id:'r1',name:'Picker build',binding,revision:1,build:{...binding,weapons:[weapon(0,200),lodestar,weapon(2,202)],armour:startArmour,subclassItem:arc,subclassItemInstanceId:'301',subclassName:'Arc subclass',
  subclassBuild:{super:{hash:3011,name:'Arc Super',socketIndex:0},abilities:[{hash:3012,socketIndex:1},{hash:3014,socketIndex:2},{hash:3015,socketIndex:3},{hash:3016,socketIndex:4}],
    aspects:[{hash:950,socketIndex:5},{hash:952,socketIndex:6}],fragments:[{hash:970,socketIndex:7},{hash:971,socketIndex:8},{hash:972,socketIndex:9},{hash:973,socketIndex:10},emptyFragment(11)]}}};
const catalogue=[...startArmour,armour(0,110),...record.build.weapons,weapon(0,213,{exotic:true})];
const make=(build=record.build)=>createArmouryEditor({record:{...record,build},catalogue,subclasses:[arc,solar]});

// Weapon picker: icon tiles only, name for hover and focus, card with Select; the Exotic rule is in the card.
{
  const editor=make();editor.open('weapon:0');
  const list=editor.html();
  assert.doesNotMatch(list,/ae-choice-name|ae-choice-note/,'Picker tiles carry no visible name text');
  assert.doesNotMatch(list,/Replaces Lodestar as your Exotic/,'The Exotic rule is not printed on the tile');
  assert.match(list,/data-ed-preview="\d+" data-name="Exotic weapon 213"/,'Each tile carries its name for the hover and focus tooltip');
  const position=editor.pickerOptions().findIndex(row=>row.item.itemInstanceId==='213');
  editor.handle({dataset:{edPreview:String(position)}});
  const card=editor.html();
  assert.match(card,/class="ae-picker is-card"/,'Clicking a tile opens the card');
  assert.match(card,/<p class="ae-card-note">Replaces Lodestar as your Exotic<\/p>[\s\S]*SELECT/,'The one-Exotic message sits above Select in the card');
  editor.handle({dataset:{edPick:String(position)}});
  assert.equal(editor.record.build.weapons[0].itemInstanceId,'213','Select sets the slot');
  assert.equal(editor.state.picker,null,'Select closes the picker');
  assert.equal(editor.record.build.weapons[1],null,'The one-Exotic rule still holds');
  console.log('ARMOURY_PICKERS_GEAR=PASS icon tiles, name tooltip data, card with Select, Exotic note in the card');
}

// Abilities: every subclass offers its class ability, jump, melee and grenade options.
{
  for(const sub of [arc,solar]){
    const editor=make({...record.build,subclassItem:sub,subclassItemInstanceId:sub.itemInstanceId,subclassBuild:{...record.build.subclassBuild,abilities:[]}});
    const sockets=editor.abilitySockets();
    assert.deepEqual(sockets.map(row=>row.socketIndex),[1,2,3,4],`${sub.name}: ability sockets come from Bungie's options`);
    for(const socket of sockets){
      editor.open(`subclass-socket:abilities:${socket.socketIndex}`);
      assert.ok(editor.pickerOptions().length>0,`${sub.name} ${socket.label}: the picker lists options`);
      assert.doesNotMatch(editor.html(),/Bungie offers no insertable options/);
      editor.handle({dataset:{ed:'close-picker'}});
    }
  }
  const editor=make();
  assert.match(editor.html(),/ABILITIES[\s\S]*data-name="Arc Dodge"/,'The first ability slot shows the saved class ability');
  console.log('ARMOURY_PICKERS_ABILITIES=PASS class ability, jump, melee and grenade offered for both subclasses');
}

// Fragment count from the Aspects' Bungie data; Empty socket first; no false duplicate warning.
{
  const editor=make();
  assert.equal(fragmentSlotLimit({aspects:[aspect(950,2,5),aspect(952,2,6)]}),4);
  assert.match(editor.html(),/FRAGMENTS<span class="ae-count">4\/4<\/span>/,'The fragment count is a real number');
  assert.doesNotMatch(editor.html(),/same Fragment more than once/,'Four different Fragments plus an empty socket are not duplicates');
  editor.open('subclass-socket:fragments:11');
  assert.equal(editor.pickerOptions()[0].item.name,'Empty Fragment Socket','Empty socket stays as the first tile');
  const twice=make({...record.build,subclassBuild:{...record.build.subclassBuild,fragments:[{hash:970,socketIndex:7},{hash:970,socketIndex:8},emptyFragment(9),emptyFragment(10),emptyFragment(11)]}});
  assert.match(twice.html(),/same Fragment more than once/,'A real duplicate still warns');
  console.log('ARMOURY_PICKERS_FRAGMENTS=PASS count from Aspect energy capacity, Empty first, duplicate warning only on a real duplicate');
}

// Mod energy and stat totals show numbers; a piece without stat data is named.
{
  const editor=make();const html=editor.html();
  assert.doesNotMatch(html,/energy \?|energy unavailable/,'Every piece shows used and total energy');
  assert.match(html,/0\/10 energy/);
  assert.doesNotMatch(html,/Stat totals are unavailable/);
  assert.match(html,/<b>60<\/b><small>Health<\/small>/,'Health total from the pieces\' own stats');
  const missing=make({...record.build,armour:startArmour.map((row,index)=>index===3?{...row,stats:[]}:row)});
  assert.match(missing.html(),/No Bungie stat data for Legendary armour 103/,'A piece without stat data is named');
  console.log('ARMOURY_PICKERS_NUMBERS=PASS energy used/total, stat totals, missing stat data named');
}
