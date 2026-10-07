#!/usr/bin/env node
// The Ascent Plan advisor (brief feature/aetherium-ascent-plan, 6 Oct 2026). Offline, no network.
//   - The advisor data covers all 8 classes, each with a main role, and every field it shows cites a
//     source that is listed on the record (no orphan refs, no invented sources).
//   - Every core skill is in the skill catalogue; Gladiator skills and stigmas match the armory catalogue.
//   - ASTRIX285 (Lv 12 Gladiator, #451 fixtures) gets the armory fixes: unspent Nezekan, +0 gear, Overhead Slam.
//   - Level-aware: stigma slots 22/27/32/37, boards 12/20/30/40/45, locked skills and macro steps, cap 45.
//   - Roles: pending builds stay pending, unknown roles fall back to the main role.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {AION2_CLASSES,ROLES,buildAscentPlan,clampLevel,pickBuild,rolesFor} from '../games/aion2/engine/ascent-advisor.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {adaptDaevanionBoard} from '../games/aion2/engine/armory-adapter.mjs';
import {affordable,explainNode,nodeCost,planDaevanionBoard} from '../games/aion2/engine/daevanion-planner.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const builds=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/builds/${name.toLowerCase()}.json`)]));
const data=name=>({progression,skills,builds:builds[name]});

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const collectRefs=(value,out=new Set())=>{
  if(Array.isArray(value))value.forEach(item=>collectRefs(item,out));
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
    if(key==='refs'||key.endsWith('Refs'))child.forEach(ref=>out.add(ref));
    else if(key!=='provenance')collectRefs(child,out);
  }
  return out;
};

check('one build file per class, nothing extra',()=>{
  const files=readdirSync(new URL('games/aion2/data/advisor/builds/',root)).sort();
  assert.deepEqual(files,AION2_CLASSES.map(name=>`${name.toLowerCase()}.json`).sort());
});

check('every class has exactly one main role with a sourced build',()=>{
  for(const name of AION2_CLASSES){
    const records=builds[name].records;
    const main=records.filter(build=>build.main);
    assert.equal(main.length,1,`${name} main roles`);
    assert.equal(main[0].status,'sourced',`${name} main build is sourced`);
    for(const build of records){
      assert.equal(build.class,name);
      assert.ok(Object.keys(ROLES).includes(build.role),`${build.id} role`);
    }
    assert.equal(new Set(records.map(build=>build.role)).size,records.length,`${name}: one build per role`);
  }
});

check('every ref a build cites is listed in its provenance, and every source is cited',()=>{
  for(const name of AION2_CLASSES)for(const build of builds[name].records){
    const listed=new Set(build.provenance.map(source=>source.ref));
    const cited=collectRefs(build);
    for(const ref of cited)assert.ok(listed.has(ref),`${build.id} cites ${ref} but does not list it`);
    for(const ref of listed)assert.ok(cited.has(ref),`${build.id} lists ${ref} but never cites it`);
    for(const source of build.provenance){
      assert.equal(source.kind,'community-guide');
      assert.match(source.url,/^https:\/\//);
    }
  }
});

check('every core skill and pick is in the skill catalogue for its class',()=>{
  const known=new Set(skills.records.map(record=>`${record.class}|${record.name}`));
  for(const name of AION2_CLASSES)for(const build of builds[name].records){
    for(const core of build.coreSkills??[])assert.ok(known.has(`${name}|${core.name}`),`${build.id}: ${core.name}`);
    for(const entry of build.specialties??[])assert.ok(known.has(`${name}|${entry.skill}`),`${build.id} Specialty: ${entry.skill}`);
  }
});

check('specialty picks sit at a level where that perk exists',()=>{
  const levels=new Map(skills.records.filter(record=>Array.isArray(record.specialties)).map(record=>[`${record.class}|${record.name}`,new Set(record.specialties.map(perk=>perk.skillLevel))]));
  for(const name of AION2_CLASSES)for(const build of builds[name].records)for(const entry of build.specialties??[]){
    for(const pick of entry.picks)assert.ok(levels.get(`${name}|${entry.skill}`)?.has(pick.skillLevel),`${build.id}: ${entry.skill} has no perk at skill Lv ${pick.skillLevel}`);
  }
});

check('Gladiator skill unlock levels and stigma names match the armory catalogue',()=>{
  const armorySkills=new Map(json('games/aion2/data/gladiator/skills.json').records.map(record=>[record.name,record.needLevel]));
  const armoryStigmas=new Set(json('games/aion2/data/gladiator/stigmas.json').records.map(record=>record.name));
  for(const record of skills.records.filter(item=>item.class==='Gladiator'))assert.equal(record.unlockLevel,armorySkills.get(record.name),record.name);
  for(const build of builds.Gladiator.records.filter(item=>item.stigmas&&!item.stigmas.pending)){
    for(const slot of build.stigmas.slots)assert.ok(armoryStigmas.has(slot.name),slot.name);
    for(const alt of build.stigmas.alternatives)assert.ok(armoryStigmas.has(alt.name),alt.name);
  }
});

check('no em or en dashes in advisor data',()=>{
  for(const text of [JSON.stringify(progression),JSON.stringify(skills),...Object.values(builds).map(value=>JSON.stringify(value))])assert.doesNotMatch(text,/[\u2013\u2014]/);
});

check('levels clamp to 1 to 45',()=>{
  assert.equal(clampLevel(0,progression),1);
  assert.equal(clampLevel(99,progression),45);
  assert.equal(clampLevel('22.4',progression),22);
  assert.equal(clampLevel('abc',progression),1);
});

const module=createAion2Module({slots:json('games/aion2/data/gear-slots.json').records});
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);
const astrix=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});

check('ASTRIX285: armory fixes first, then the build',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  assert.equal(plan.level,12);
  assert.equal(plan.character.name,'ASTRIX285');
  assert.deepEqual(plan.now.map(item=>item.title),[
    'Spend points on the Nezekan Daevanion board',
    'Enchant 7 worn items above +0',
    'Level Overhead Slam (now Lv 2)'
  ]);
  assert.deepEqual(plan.now.map(item=>item.kind),['armory','armory','build']);
  assert.deepEqual(plan.now.map(item=>item.step),[1,2,3]);
});

check('Mastery: real skill levels, key skills first, points go to the next Specialty slot',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  const m=plan.mastery;
  assert.equal(m.fromArmory,true);
  assert.deepEqual(m.active.slice(0,4).map(skill=>[skill.name,skill.priority,skill.skillLevel]),[['Keen Strike',1,3],['Rending Blow',2,3],['Overhead Slam',3,2],['Ruinous Blow',4,null]]);
  assert.ok(m.passive.length>0,'Passive skills listed');
  assert.ok(m.passive.every(skill=>skill.category==='Passive'));
  assert.deepEqual(m.slotLevels,[8,12,20]);
  assert.deepEqual(m.spend.map(step=>[step.name,step.from,step.to,step.reason]),[
    ['Keen Strike',3,8,'opens Specialty slot 1'],['Rending Blow',3,8,'opens Specialty slot 1'],['Overhead Slam',2,8,'opens Specialty slot 1']]);
  const keen=m.active[0];
  assert.match(keen.icon??'',/^https:\/\//,'Game skill icon from the armory');
  assert.equal(keen.slots.length,3);
  assert.ok(keen.slots.every(slot=>slot.open===false),'Lv 3 has no slot open yet');
});

check('Each next move names the screen that shows it; stigmas carry the game icon',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  assert.deepEqual(plan.now.map(item=>item.view),['daevanion','gear','mastery']);
  assert.match(plan.stigmas.slots[0].icon??'',/^https:\/\//,'Lunge Stance icon from the armory');
  assert.match(plan.stigmas.alternatives[0].icon??'',/^https:\/\//);
  assert.match(plan.skillIcons['Keen Strike']??'',/^https:\/\//);
  const hand=buildAscentPlan({className:'Chanter',level:30,data:data('Chanter')});
  assert.ok(hand.now.every(item=>['mastery','stigma','daevanion','gear'].includes(item.view)));
  assert.ok(hand.stigmas.slots.every(slot=>slot.icon===null),'No icon without a Daeva');
  assert.deepEqual(hand.skillIcons,{});
});

check('Mastery without a character: key skills from the guide, no invented levels',()=>{
  const m=buildAscentPlan({className:'Cleric',role:'healer',level:30,data:data('Cleric')}).mastery;
  assert.equal(m.fromArmory,false);
  assert.ok(m.active.length>0);
  assert.ok(m.active.every(skill=>skill.skillLevel===null&&skill.icon===null));
  assert.ok(m.spend.length>0,'Still says where points go first');
  assert.ok(m.spend.every(step=>step.from===null&&step.to===8),'No guessed current level, aim for the first slot');
});

check('ASTRIX285: skills show armory levels and the next Specialty slot',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  const byName=Object.fromEntries(plan.skills.map(skill=>[skill.name,skill]));
  assert.equal(byName['Keen Strike'].skillLevel,3);
  assert.equal(byName['Keen Strike'].nextSpecialtySlot,8);
  assert.equal(byName['Ruinous Blow'].unlocked,false);
  assert.equal(byName['Ruinous Blow'].unlockLevel,14);
  assert.equal(byName['Ruinous Blow'].cooldownSeconds,45);
  assert.equal(plan.stigmas.open,0);
  assert.equal(plan.daevanion.boards.find(board=>board.name==='Nezekan').nodesTaken,0);
});

check('stigma slots open at 22, 27, 32 and 37',()=>{
  const at=level=>buildAscentPlan({className:'Cleric',level,data:data('Cleric')}).stigmas.open;
  assert.deepEqual([21,22,26,27,32,37,45].map(at),[0,1,1,2,3,4,4]);
});

check('Daevanion boards open at 12, 20, 30, 40 and 45 without a character',()=>{
  const open=level=>buildAscentPlan({className:'Sorcerer',level,data:data('Sorcerer')}).daevanion.boards.filter(board=>board.open).map(board=>board.name);
  assert.deepEqual(open(11),[]);
  assert.deepEqual(open(12),['Nezekan']);
  assert.deepEqual(open(30),['Nezekan','Zikel','Vaizel']);
  assert.deepEqual(open(45),['Nezekan','Zikel','Vaizel','Triniel','Azphel']);
});

check('macro steps lock until their skill or stigma slot is open',()=>{
  const low=buildAscentPlan({className:'Gladiator',role:'dps',level:5,data:data('Gladiator')}).rotation.steps;
  assert.deepEqual(low.map(step=>[step.text.split(' (')[0],step.locked]),[['Ruinous Blow',true],['Rage Burst',true],['Overhead Slam',false],['Rending Blow',false]]);
  const high=buildAscentPlan({className:'Gladiator',role:'dps',level:40,data:data('Gladiator')}).rotation.steps;
  assert.ok(high.every(step=>!step.locked));
});

check('upcoming milestones are ahead of the level and in order',()=>{
  const plan=buildAscentPlan({className:'Assassin',level:10,data:data('Assassin')});
  assert.ok(plan.upcoming.length>0);
  assert.ok(plan.upcoming.every(item=>item.level>10));
  assert.deepEqual(plan.upcoming.map(item=>item.level),[...plan.upcoming.map(item=>item.level)].sort((a,b)=>a-b));
  assert.deepEqual(plan.upcoming.slice(0,2).map(item=>[item.level,item.text]),[[12,'Nezekan Daevanion board opens (Combat Speed and Cooldown Reduction).'],[14,'Insignia Explosion unlocks. Spends 1 to 5 Insignia stacks and stuns.']]);
});

check('a manual plan lists skills to level and open stigma slots',()=>{
  const plan=buildAscentPlan({className:'Cleric',role:'healer',level:30,data:data('Cleric')});
  assert.match(plan.now[0].title,/^Level your skills in this order: Earth's Retribution, Light of Regeneration, Condemnation/);
  assert.equal(plan.now[1].title,'Slot Light of Protection, Noble Aura');
  assert.ok(plan.now.every(item=>item.kind==='build'));
});

check('pending role stays pending, unknown role falls back to the main role',()=>{
  const tank=buildAscentPlan({className:'Gladiator',role:'tank',level:20,data:data('Gladiator')});
  assert.equal(tank.role,'tank');
  assert.equal(tank.pending.pending,true);
  assert.deepEqual(tank.now,[]);
  const healer=buildAscentPlan({className:'Ranger',role:'healer',level:20,data:data('Ranger')});
  assert.equal(healer.role,'dps');
  assert.equal(healer.roleFallback,true);
});

check('roles list puts the main role first',()=>{
  assert.deepEqual(rolesFor(builds.Chanter).map(item=>item.role),['support','healer','dps']);
  assert.deepEqual(rolesFor(builds.Templar).map(item=>item.role),['tank','dps']);
  assert.equal(pickBuild(builds.Cleric,'dps').role,'healer');
});

check('every class and role builds a plan at every level band',()=>{
  for(const name of AION2_CLASSES)for(const role of rolesFor(builds[name]))for(const level of [1,12,22,37,45]){
    const plan=buildAscentPlan({className:name,role:role.role,level,data:data(name)});
    assert.equal(plan.className,name);
    assert.ok(plan.sources.length>0,`${name} ${role.role} has sources`);
  }
});

const nezekan=adaptDaevanionBoard(json('tools/fixtures/aion2/eu/astrix285-daevanion-11.json'));
const gladiatorNodes=builds.Gladiator.records[0].daevanion.skillNodes;

check('Daevanion: Nezekan prices to 134 points, the board total',()=>{
  const board=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  assert.equal(board.pointsTotal,134);
  assert.equal(board.totalNodes,88);
  assert.deepEqual(board.bounds,{top:3,bottom:13,left:3,right:13});
  assert.equal(nodeCost({type:'SkillLevel',grade:'Legend'}),3);
  assert.equal(nodeCost({type:'Stat',grade:'Unique'}),4);
});

check('Daevanion: every route step touches a node already owned',()=>{
  const board=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  const start=nezekan.find(node=>node.type==='Start');
  const owned=new Set([`${start.row}:${start.col}`]);
  for(const step of board.route){
    const touches=[[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>owned.has(`${step.row+dr}:${step.col+dc}`));
    assert.ok(touches,`step ${step.step} (${step.name}) is not connected`);
    owned.add(`${step.row}:${step.col}`);
  }
});

check('Daevanion: key skill nodes come first, in the build order, then the four corners',()=>{
  const board=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  const targets=board.route.filter(step=>step.target).map(step=>step.effects[0]);
  assert.deepEqual(targets.slice(0,4),['Overhead Slam +1','Rending Blow +1','Ruinous Blow +1','Crushing Wave +1']);
  assert.equal(targets.slice(4).filter(text=>/\+1\.5%$/.test(text)).length,4);
  assert.equal(board.route.at(-1).totalCost,board.route.reduce((sum,step)=>sum+step.cost,0));
});

check('Daevanion: nodes already taken are skipped and the route starts from them',()=>{
  const fresh=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  const firstFour=new Set(fresh.route.slice(0,7).map(step=>step.nodeId));
  const taken=nezekan.map(node=>firstFour.has(node.nodeId)?{...node,taken:true}:node);
  const board=planDaevanionBoard({nodes:taken,skillOrder:gladiatorNodes});
  assert.equal(board.takenCount,7);
  assert.equal(board.pointsSpent,9,'six stat nodes and Overhead Slam');
  assert.ok(board.route.every(step=>!firstFour.has(step.nodeId)));
  assert.equal(board.route[0].step,1);
  assert.equal(board.targets.skillsTaken,1);
});

check('Daevanion: a points budget splits the route into now and later',()=>{
  const {route}=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  const split=affordable(route,10);
  assert.equal(split.now.length,8);
  assert.equal(split.shortBy,3);
  assert.equal(affordable(route,0).now.length,0);
  assert.equal(affordable(route,999).shortBy,null);
  assert.equal(affordable(route,'').now.length,0);
});

check('Daevanion: every node explains itself in plain words',()=>{
  const board=planDaevanionBoard({nodes:nezekan,skillOrder:gladiatorNodes});
  const context={skillOrder:gladiatorNodes,cooldowns:new Map([['Ruinous Blow',45],['Overhead Slam',5]]),boardName:'Nezekan',boardFocus:'Combat Speed and Cooldown Reduction'};
  for(const tile of board.tiles){const why=explainNode(tile,board.route,context);assert.ok(why.lines.length>0&&why.lines.every(line=>line.length>10),tile.name);}
  const cdr=board.tiles.find(tile=>tile.kind==='unique'&&/Cooldown/.test(tile.name));
  assert.match(explainNode(cdr,board.route,context).lines.join(' '),/On Ruinous Blow \(45 s\) that is about 0\.7 s back/);
  const filler=board.tiles.find(tile=>tile.step===1);
  assert.match(explainNode(filler,board.route,context).lines[0],/^Taken to reach Overhead Slam \+1/);
  const route=board.route.filter(step=>step.from);
  assert.equal(route.length,board.route.length,'every step links back to a node');
});

check('every build names the skills its Daevanion route aims for',()=>{
  for(const name of AION2_CLASSES)for(const build of builds[name].records){
    if(build.status==='pending'||build.daevanion?.pending)continue;
    assert.ok(Array.isArray(build.daevanion.skillNodes)&&build.daevanion.skillNodes.length>0,`${build.id} skillNodes`);
  }
});

check('players never see another site: no guide names in text a page shows',()=>{
  const visible=value=>{
    if(Array.isArray(value))return value.flatMap(visible);
    if(value&&typeof value==='object')return Object.entries(value).filter(([key])=>!['provenance','refs','roleRefs','id'].includes(key)).flatMap(([,child])=>visible(child));
    return typeof value==='string'?[value]:[];
  };
  const names=/MetaBot|ExpCarry|EZG|Destructoid|games\.gg|mein-mmo|gameplay\.tips|aion2hub|playnews/i;
  for(const text of [...visible(progression.records),...visible(skills.records),...Object.values(builds).flatMap(file=>visible(file.records))])assert.doesNotMatch(text,names,text);
});

check('macro order is settled by the in-game capture: listed order, 10 ms delay',()=>{
  const record=progression.records.find(item=>item.id==='macro-order');
  assert.deepEqual(record.value,{order:'listed',delayMs:10});
  assert.ok(record.provenance.some(source=>source.kind==='in-game-capture'&&source.where.includes('Macro window')));
  const wrath=json('games/aion2/data/gladiator/stigmas.json').records.find(item=>item.name==='Wrath Wave');
  assert.equal(wrath.cooldownSeconds,60);
  assert.equal(wrath.mpCost,200);
  assert.deepEqual(wrath.specialties.map(line=>line.unlockSkillLevel),[5,10,15,20]);
});

check('unknown class throws',()=>{
  assert.throws(()=>buildAscentPlan({className:'Brawler',data:data('Gladiator')}),/Unknown AION 2 class/);
});

if(failed){console.log(`AION2_ADVISOR=FAIL ${failed}`);process.exitCode=1;}
else console.log('AION2_ADVISOR=PASS');
