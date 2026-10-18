#!/usr/bin/env node
// Where to get it (feature/aetherium-guide-equipment, 18 Oct 2026). Offline, no network.
//   - gear-sources.json: every record has a status and provenance with an https url (side missions stay pending with none);
//     Expedition loot per difficulty from the wiki tables (name, slot group, grade, item level), Exploration loot pending;
//     Transcendence Arcana by Stage; the Conquest cube; Sealed Dungeon and Stronghold rewards; the weekly cycles.
//   - The engine: for a slot and build, the content that drops a better piece, its gate and cycle; the Lv 45 fixture gets
//     the Miguel example (Fire Temple, Conquest, entry item level 2,100); a slot no source covers says pending.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {compareDrop,cycleOf,dropsForGroup,gearSourcePlan,highlightText,indexGearSources,slotGroupOf,whereToGet} from '../games/aion2/engine/gear-sources.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);
const sources=json('games/aion2/data/advisor/gear-sources.json');
const grades=json('games/aion2/data/advisor/grades.json');
const progression=json('games/aion2/data/advisor/progression.json');
const gladiator=json('games/aion2/data/advisor/builds/gladiator.json');
const build=gladiator.records.find(record=>record.main)??gladiator.records[0];

let failed=0;
function check(name,fn){
  try{fn();console.log(`ok - ${name}`);}
  catch(error){failed++;console.log(`not ok - ${name}\n  ${error.message}`);}
}

const module=createAion2Module({slots:json('games/aion2/data/gear-slots.json').records});
function lv45(){
  const model=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  const items=fx('lv45-items');
  for(const slot of model.gear){const detail=items[slot.slotPos];if(detail&&detail.id===slot.itemId)slot.level=detail.level;}
  return model;
}
const STATUSES=['confirmed','reported','unconfirmed','pending'];

check('gear-sources.json: every record has a status and provenance with an https url, side missions pending (the item data names kinds only)',()=>{
  for(const record of sources.records){
    if(record.kind==='slot-groups'){assert.ok(record.groups.every(group=>STATUSES.includes(group.status)),record.id);}
    else assert.ok(STATUSES.includes(record.status),`${record.id} status`);
    if(record.id==='side-missions'){assert.equal(record.status,'pending');assert.equal(record.rewards.pending,true);assert.equal(record.provenance[0].kind,'armory','Cites the item data that names kinds only');continue;}
    assert.ok(Array.isArray(record.provenance)&&record.provenance.length,`${record.id} provenance`);
    for(const source of record.provenance)assert.match(source.url,/^https:\/\/aion2\.fandom\.com\/wiki\//,`${record.id} cites the wiki page`);
  }
});

check('Expedition loot per difficulty: six dungeons, Conquest loot from the wiki tables, Exploration loot pending',()=>{
  const index=indexGearSources(sources);
  assert.deepEqual(index.expeditions.map(record=>record.id),['krao-cave','draupnir','urugugu-canyon','vakron-sky-island','fire-temple','ferocious-horn-den']);
  for(const record of index.expeditions){
    const [exploration,conquest]=record.difficulties;
    assert.equal(exploration.id,'exploration');assert.equal(exploration.loot.pending,true,`${record.id} Exploration loot pending`);
    assert.equal(conquest.id,'conquest');assert.ok(conquest.loot.length>=4);
    for(const item of conquest.loot){assert.ok(item.name&&item.grade&&item.type,`${record.id} ${item.name}`);assert.ok(item.itemLevel===null||Number.isFinite(item.itemLevel));}
    assert.ok(Number.isFinite(conquest.level)&&Number.isFinite(conquest.entryItemLevel));
    assert.equal(record.cycle,'odyle-energy');
  }
  const fire=index.byId.get('fire-temple').difficulties;
  assert.deepEqual([fire[0].level,fire[0].entryItemLevel,fire[1].level,fire[1].entryItemLevel],[35,500,45,2100]);
  assert.deepEqual(fire[1].loot.filter(item=>item.group).map(item=>[item.name,item.group,item.grade,item.itemLevel]),[['Enraged Kromede Weapon series','weapon','Unique',86],['Enraged Kromede Accessory series','accessory','Unique',86]]);
  assert.deepEqual(dropsForGroup('guard',sources).map(entry=>[entry.source.id,entry.item.itemLevel]),[['draupnir',54],['vakron-sky-island',70],['ferocious-horn-den',86]]);
});

check('Transcendence Arcana by Stage, the Conquest cube, Sealed Dungeons and Strongholds, the cycles',()=>{
  const index=indexGearSources(sources);
  assert.deepEqual(index.transcendence.map(record=>[record.id,record.arcana.join(',')]),[['deus-research-base','compass,bell,chalice'],['shattered-arkanis','mirror,parchment,chalice']]);
  for(const record of index.transcendence){
    assert.deepEqual(record.stages.map(stage=>stage.entryItemLevel),[1600,1900,2200,2500]);
    assert.equal(record.stages[3].guaranteed,'One Unique Arcana');
    assert.equal(record.level.pending,true);
  }
  const cube=index.byId.get('conquest-cube');
  assert.match(cube.text,/pick one Unique item/);assert.equal(cube.claimsNeeded.pending,true);
  assert.ok(index.byId.get('strongholds').rewards.some(reward=>reward.name==='Noble Belt Enhance Scroll'));
  assert.deepEqual(index.byId.get('sealed-dungeons').rewards.slice(0,3).map(reward=>reward.name),['Daevanion Crystal','Wisdom Stone','Enhance Stone']);
  const reset=index.cycles.get('weekly-reset');assert.deepEqual([reset.day,reset.timeUtc],['Wednesday','07:00']);
  const odyle=cycleOf('odyle-energy',sources);assert.match(odyle.text,/only when you open the reward cube/);assert.equal(odyle.reset.day,'Wednesday');
  assert.equal(index.cycles.get('odyle-energy').refill.pending,true,'Refill rate is pending, never guessed');
});

check('slot groups: weapon, guard, armour, accessory, belt, Arcana; cloak, bracelets, amulet and runes are unlisted',()=>{
  assert.equal(slotGroupOf('MainHand',sources).id,'weapon');
  assert.equal(slotGroupOf('SubHand',sources).id,'guard');
  assert.equal(slotGroupOf('Gloves',sources).id,'armour');
  assert.equal(slotGroupOf('Ring2',sources).id,'accessory');
  assert.equal(slotGroupOf('Arcana3',sources).id,'arcana');
  for(const name of ['Cape','Bracelet1','Amulet','Rune1'])assert.equal(slotGroupOf(name,sources),null,name);
});

check('compareDrop: higher grade is better; same grade compares item level; unknown level says unknown',()=>{
  const drop={grade:'Unique',itemLevel:86};
  assert.equal(compareDrop({grade:'Legend'},drop,grades),'better');
  assert.equal(compareDrop({grade:'Unique',level:45},drop,grades),'better');
  assert.equal(compareDrop({grade:'Unique',level:86},drop,grades),'same-or-worse');
  assert.equal(compareDrop({grade:'Unique'},drop,grades),'unknown');
  assert.equal(compareDrop({empty:true},drop,grades),'better');
});

check('Lv 45 Gladiator, item level 795: gloves can enter Draupnir now; the goal is Ferocious Horn Den at 2,100; the cube is offered',()=>{
  const model=lv45();
  const gloves=model.gear.find(slot=>slot.slot==='Gloves');
  const result=whereToGet(gloves,{level:45,itemLevel:795,data:sources,grades,progression,build});
  assert.equal(result.status,'offers');
  assert.equal(result.best.source,'Draupnir');assert.equal(result.best.difficulty,'Conquest');assert.equal(result.best.open,true);
  assert.equal(result.best.highlight,'Draupnir, Conquest: Unique gloves, entry item level 700');
  assert.equal(result.goal.source,'Vakron Sky Island');
  assert.deepEqual(result.goal.gap,{level:0,itemLevel:605});
  assert.ok(result.offers.some(offer=>offer.highlight==='Ferocious Horn Den, Conquest: Unique gloves, entry item level 2,100'));
  assert.ok(result.offers.some(offer=>offer.kind==='cube'&&/pick a Unique gloves/.test(offer.reward)));
  assert.equal(result.best.cycle.id,'odyle-energy');
  assert.equal(result.group.status,'unconfirmed','Armour series slots are our reading, tagged');
  assert.ok(result.lookFor.length>0,'What the build wants on the next piece');
});

check('Lv 45: the Unique weapon (level 45) still has better drops; Fire Temple Conquest is the item level 2,100 goal',()=>{
  const model=lv45();
  const weapon=model.gear.find(slot=>slot.slot==='MainHand');
  const result=whereToGet(weapon,{level:45,itemLevel:795,data:sources,grades,progression,build});
  assert.equal(result.best.source,'Krao Cave');
  assert.ok(result.offers.some(offer=>offer.highlight==='Fire Temple, Conquest: Unique weapon, entry item level 2,100'&&offer.open===false));
  const top=whereToGet({...weapon,level:86},{level:45,itemLevel:2600,data:sources,grades,progression});
  assert.equal(top.status,'top','A level 86 Unique weapon is the best drop we know');
  assert.deepEqual(top.offers,[]);
});

check('Arcana, belt and unlisted slots: Transcendence Stage, Stronghold scrolls, pending',()=>{
  const arcana=whereToGet({slot:'Arcana1',slotPos:41,empty:true},{level:45,itemLevel:2000,data:sources,grades,progression});
  assert.deepEqual(arcana.offers.map(offer=>[offer.source,offer.difficulty,offer.open]),[['Deus Research Base','Stage 2',true],['Shattered Arkanis','Stage 2',true]]);
  const four=whereToGet({slot:'Arcana1',slotPos:41,grade:'Legend'},{level:45,itemLevel:2600,data:sources,grades,progression});
  assert.equal(four.offers[0].difficulty,'Stage 4');assert.match(four.offers[0].reward,/one unique arcana guaranteed/);
  const belt=whereToGet({slot:'Belt',grade:'Rare',enchant:6},{level:45,itemLevel:795,data:sources,grades,progression});
  assert.equal(belt.best.reward,'Noble Belt Enhance Scrolls');assert.equal(belt.stray,null,'Belt enhancing is its own rule, never a stray');
  const amulet=whereToGet({slot:'Amulet',grade:'Rare'},{level:45,itemLevel:795,data:sources,grades,progression});
  assert.equal(amulet.status,'pending');assert.match(amulet.pending.reason,/No source/);
});

check('strays are flagged, never blocked; before Lv 35 the plan says hold',()=>{
  const flagged=whereToGet({slot:'Gloves',grade:'Legend',enchant:4},{level:45,itemLevel:795,data:sources,grades,progression});
  assert.match(flagged.stray.text,/stones spent on it are lost/);assert.ok(flagged.offers.length,'Still shows where to get the upgrade');
  const early=whereToGet({slot:'Gloves',grade:'Legend',enchant:4},{level:30,itemLevel:300,data:sources,grades,progression});
  assert.equal(early.stray,null);assert.match(early.hold.text,/Unique gear starts at Lv 35/);
  assert.equal(early.best,null,'Nothing with listed loot is open at Lv 30');
  assert.equal(early.goal.source,'Draupnir');
});

check('gearSourcePlan: slots in work order, side missions pending, the weekly reset',()=>{
  const plan=gearSourcePlan(lv45(),{data:sources,grades,progression,build});
  assert.equal(plan.level,45);assert.equal(plan.itemLevel,795);
  assert.deepEqual(plan.slots.slice(0,2).map(entry=>entry.slot),['MainHand','SubHand']);
  assert.ok(plan.upgrades.length>=10);
  assert.equal(plan.sideMissions.status,'pending');assert.match(plan.sideMissions.reason,/No quest source yet/);
  assert.deepEqual([plan.weeklyReset.day,plan.weeklyReset.timeUtc],['Wednesday','07:00']);
  assert.ok(plan.slots.filter(entry=>entry.status==='pending').every(entry=>entry.pending.reason));
  assert.equal(highlightText({source:'Fire Temple',difficulty:'Conquest',reward:'Unique gloves',gate:{itemLevel:2100}}),'Fire Temple, Conquest: Unique gloves, entry item level 2,100');
});

if(failed){console.log(`AION2_GEAR_SOURCES=FAIL ${failed}`);process.exitCode=1;}
else console.log('AION2_GEAR_SOURCES=PASS');
