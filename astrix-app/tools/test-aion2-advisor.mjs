#!/usr/bin/env node
// The Ascent Plan advisor (brief feature/aetherium-ascent-plan, 6 Oct 2026). Offline, no network.
//   - The advisor data covers all 8 classes, each with a main role, and every field it shows cites a
//     source that is listed on the record (no orphan refs, no invented sources).
//   - Every core skill is in the skill catalogue; Gladiator skills and stigmas match the armory catalogue.
//   - ASTRIX285 (Lv 12 Gladiator, #451 fixtures) gets the armory fixes: unspent Nezekan, gear to enchant, Overhead Slam.
//   - Grade rule (fix/aetherium-gear-enchant-context, 11 Oct 2026): Unique to +10 then +15 on weapon and guard, Epic and
//     late Common or Rare replaced, amulet and belt to +10, nothing at the cap; a Lv 45 fixture gives the exact moves.
//   - Level-aware: stigma slots 22/27/32/37, boards 12/20/30/40/45, locked skills and macro steps, cap 45.
//   - Roles: pending builds stay pending, unknown roles fall back to the main role.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {AION2_CLASSES,ROLES,buildAscentPlan,clampLevel,enchantAdvice,enchantSteps,fillerProblems,gearMoves,gradeInfo,indexMechanics,levelOrder,masteryCap,nextLevelSource,pickBuild,reachSkillLevel,rolesFor,stackProblems,stigmaKeyProblems,targetAgainstCap} from '../games/aion2/engine/ascent-advisor.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {classesWanting,combatNamesIn,indexStats,mostlyLow,rankPointStats,statOrder,statReason,subStatTag} from '../games/aion2/engine/stat-advisor.mjs';
import {adaptDaevanionBoard} from '../games/aion2/engine/armory-adapter.mjs';
import {affordable,explainNode,nodeCost,parseEffect,planDaevanionBoard,summariseBoard} from '../games/aion2/engine/daevanion-planner.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const builds=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/builds/${name.toLowerCase()}.json`)]));
const icons=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/icons/${name.toLowerCase()}.json`)]));
const mechanics=json('games/aion2/data/advisor/mechanics.json');
const grades=json('games/aion2/data/advisor/grades.json');
const data=name=>({progression,skills,mechanics,grades,builds:builds[name],icons:icons[name]});

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
  // Macro builder (16 Oct 2026): stigma records added for their macro use are checked against the stigma catalogue; every skill record against the skill catalogue.
  for(const record of skills.records.filter(item=>item.class==='Gladiator')){
    if(record.kind==='stigma'){assert.ok(armoryStigmas.has(record.name),record.name);assert.equal(record.unlockLevel,22,record.name);}
    else assert.equal(record.unlockLevel,armorySkills.get(record.name),record.name);
  }
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
    // Grade rule (11 Oct 2026): at Lv 12 the Common and Rare pieces go to their +5 cap, one move for all eight.
    'Enchant 8 Rare and Common pieces to +5',
    // One level order (walkthrough fix, 11 Oct 2026): the level move is the Mastery list's first step, Keen Strike, not the lowest skill.
    'Level Keen Strike (now Lv 3)'
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

check('Every class has all 35 skills with icons, and every build pick has an icon',()=>{
  for(const name of AION2_CLASSES){
    const record=icons[name].records[0];
    assert.equal(record.skills.length,35,name);
    const plan=buildAscentPlan({className:name,level:45,data:data(name)});
    if(plan.pending)continue;
    for(const slot of plan.stigmas.slots??[])assert.ok(slot.icon,`${name} stigma ${slot.name}`);
    for(const entry of plan.mastery.active.filter(item=>item.priority))assert.ok(entry.icon,`${name} key skill ${entry.name}`);
  }
});

check('Skill bar: basic skill fixed on left click for every class, nothing placed twice',()=>{
  for(const name of AION2_CLASSES){
    const plan=buildAscentPlan({className:name,level:45,data:data(name)});
    if(plan.pending)continue;
    const bar=plan.skillBar;
    assert.equal(bar.bars[0].LMB.name,icons[name].records[0].skills[0].name,`${name}: first class skill on left click`);
    assert.equal(bar.bars[0].LMB.fixed,true);
    const names=bar.bars.flatMap(row=>Object.values(row)).filter(Boolean).map(cell=>cell.name);
    assert.equal(new Set(names).size,names.length,`${name}: no skill on two keys`);
    assert.ok(Object.values(bar.bars[0]).every(cell=>!cell||cell.icon),`${name}: icons on bar 0`);
  }
  // Macro builder (16 Oct 2026): Ruinous Blow is a dash, so it leaves the stack for its own key (it was row 0 of key 1). Still locked at Lv 12.
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:12,data:data('Gladiator')}).skillBar;
  const key=glad.left.find(item=>glad.stacks[item].skills[0]?.name==='Ruinous Blow');
  assert.ok(key,'Ruinous Blow has a key of its own');
  assert.equal(glad.stacks[key].skills.length,1);
  assert.equal(glad.stacks[key].skills[0].reason,'dash');
  assert.equal(glad.stacks[key].skills[0].locked,true,'Ruinous Blow locked at Lv 12 (unlocks at 14)');
  assert.equal(glad.bars[0].A.name,'Rage Burst','Row 0 of stack A fires first');
});
check('Each next move names the screen that shows it; stigmas carry the game icon',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  assert.deepEqual(plan.now.map(item=>item.view),['daevanion','gear','mastery']);
  assert.match(plan.stigmas.slots[0].icon??'',/^https:\/\//,'Lunge Stance icon from the armory');
  assert.match(plan.stigmas.alternatives[0].icon??'',/^https:\/\//);
  assert.match(plan.skillIcons['Keen Strike']??'',/^https:\/\//);
  const hand=buildAscentPlan({className:'Chanter',level:30,data:data('Chanter')});
  assert.ok(hand.now.every(item=>['mastery','stigma','daevanion','gear'].includes(item.view)));
  assert.ok(hand.stigmas.slots.every(slot=>/ICON_CH_SKILL_\d+\.png$/.test(slot.icon??'')),'Stigma icons for every class, Daeva or not');
  assert.equal(Object.keys(hand.skillIcons).length,35);
});

check('Mastery without a character: key skills from the guide, no invented levels',()=>{
  const m=buildAscentPlan({className:'Cleric',role:'healer',level:30,data:data('Cleric')}).mastery;
  assert.equal(m.fromArmory,false);
  assert.ok(m.active.length>0);
  assert.ok(m.active.every(skill=>skill.skillLevel===null),'No guessed levels');
  assert.equal(m.active.length,12,'Every Cleric active, like the game');
  assert.equal(m.passive.length,10);
  assert.ok([...m.active,...m.passive].every(skill=>/^https:\/\/assets\.playnccdn\.com\/static-aion2-gamedata\/resources\/ICON_/.test(skill.icon)),'Game icon on every skill without a Daeva');
  assert.ok(m.active.filter(skill=>skill.priority).length>=3,'Key skills ranked');
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

check('Daevanion: summariseBoard adds up the taken nodes, keeps % as %, and lists what is left',()=>{
  const take=(name,count)=>nezekan.filter(node=>node.name===name&&!node.taken).slice(0,count).map(node=>node.nodeId);
  const takenIds=new Set([...take('Max MP',2),...take('Max HP',1),...take('Attack',3),...take('Combat Speed',2),...take('Skill Level Up - Rending Blow',1),...take('Skill Level Up - Blood Absorption',2)]);
  const nodes=nezekan.map(node=>takenIds.has(node.nodeId)?{...node,taken:true}:node);
  const sum=summariseBoard(nodes,{daevanion:{skillNodes:gladiatorNodes}});
  assert.deepEqual(sum.skillEffects.map(row=>row.text),['Blood Absorption +2','Rending Blow +1']);
  assert.deepEqual(sum.statEffects.map(row=>row.text),['Attack Bonus +9','Combat Speed +3%','HP +100','MP +100'],'two MP +50 nodes give MP +100; 1.5% twice is 3%');
  assert.deepEqual(sum.statEffects.find(row=>row.name==='Combat Speed'),{name:'Combat Speed',unit:'%',total:3,text:'Combat Speed +3%'});
  assert.equal(sum.takenCount,11);
  assert.equal(sum.totalNodes,88);
  assert.equal(sum.left.count,77);
  assert.equal(sum.left.points,134-nodes.filter(node=>node.taken).reduce((total,node)=>total+nodeCost(node),0),'points left are the board total less what is taken');
  assert.deepEqual(sum.left.keySkills.map(row=>row.text),['Overhead Slam +1','Ruinous Blow +1','Crushing Wave +1'],'key skill nodes not taken, in the build order');
  assert.deepEqual(sum.left.corners.map(row=>row.text),['Cooldown Reduction +1.5%','Cooldown Reduction +1.5%']);
  // Nothing taken: nothing added up, everything left. No plan: no key skill list.
  const none=summariseBoard(nezekan,null);
  assert.deepEqual([none.skillEffects,none.statEffects,none.left.keySkills],[[],[],[]]);
  assert.equal(none.left.count,88);
  assert.equal(none.left.points,134);
  // Lines with no number are not added up; a minus stays a minus.
  assert.equal(parseEffect('Cooldown Reduction'),null);
  assert.deepEqual(parseEffect('Move Speed -2.5%'),{name:'Move Speed',value:-2.5,unit:'%'});
  const odd=[{type:'Stat',grade:'Common',nodeId:1,row:1,col:1,name:'x',taken:true,effects:['Move Speed -2%']},{type:'Stat',grade:'Common',nodeId:2,row:1,col:2,name:'x',taken:true,effects:['Move Speed -3%']}];
  assert.equal(summariseBoard(odd).statEffects[0].text,'Move Speed -5%');
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

/* The first move must be right (first-visit flow, 10 Oct 2026): a Daevanion move names the board with nothing spent
   on it and carries that board's own id, so Show me opens the board the move names. A board with any node taken,
   a finished one included, is never the move. */
const withBoards=(level,boards)=>{
  const live=structuredClone(astrix);
  live.profile.level=level;
  live.daevanion=live.daevanion.map(board=>({...board,...boards(board)}));
  return live;
};
check('a Daevanion move names the unspent board and carries its id: Vaizel at 0, Nezekan finished, Zikel part spent (Elyos ids)',()=>{
  const live=withBoards(30,board=>({open:board.id<=13,nodesTaken:board.id===11?board.nodesTotal:board.id===12?9:0}));
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  const move=plan.now.find(item=>item.view==='daevanion');
  assert.equal(move.title,'Spend points on the Vaizel Daevanion board');
  assert.equal(move.board,13,'The move carries the Vaizel board id');
  assert.deepEqual(move.boards,[{id:13,name:'Vaizel'}]);
  assert.equal(plan.now.filter(item=>item.view==='daevanion').length,1,'One Daevanion move');
  // Only the Daevanion moves: a stigma move may name Zikel's Blessing.
  assert.doesNotMatch(plan.now.filter(item=>item.view==='daevanion').map(item=>item.title).join('\n'),/Nezekan|Zikel/,'Boards with nodes taken are never a move');
});
check('an Asmodian Daeva gets the Asmodian board id on the move (Vaizel is 33)',()=>{
  const ids={11:31,12:32,13:33,14:34,16:36};
  const live=withBoards(30,board=>({id:ids[board.id],open:board.id<=13,nodesTaken:board.id===13?0:board.nodesTotal}));
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  const move=plan.now.find(item=>item.view==='daevanion');
  assert.match(move.title,/Vaizel/);
  assert.equal(move.board,33);
  assert.deepEqual(plan.daevanion.boards.map(board=>board.id),[31,32,33,34,36],'The plan lists the character\'s own ids');
});
check('no Daevanion move when every open board has nodes taken: a finished board is never offered',()=>{
  const live=withBoards(30,board=>({open:board.id<=13,nodesTaken:board.id<=13?board.nodesTotal:0}));
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  assert.equal(plan.now.some(item=>item.view==='daevanion'),false);
  assert.ok(plan.now.length>0,'Other moves still come');
});
// Grade rule (11 Oct 2026): was "the +0 worn slots" (needsEnchant). The move now lists the slots the grade rule enchants.
check('the enchant move lists the worn slots the grade rule says to enchant, the rule the Gear page flags with',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  const move=plan.now.find(item=>/^Enchant \d+ .+ pieces to \+5$/.test(item.title));
  const expected=astrix.gear.filter(slot=>enchantAdvice(slot,{level:12,grades,progression})?.action==='enchant').map(slot=>slot.slotPos);
  assert.ok(expected.length>0,'The fixture wears items to enchant');
  assert.deepEqual(move.slots,expected);
  assert.equal(move.ring,move.move,'Show me rings the move by its own id');
  assert.ok(astrix.gear.filter(slot=>!slot.empty).every(slot=>enchantAdvice(slot,{level:12,grades,progression}).action==='enchant'),'At Lv 12 every Common and Rare item below +5 is enchanted');
  assert.ok(astrix.gear.filter(slot=>!slot.empty).every(slot=>slot.enchant<5),'The fixture items are all below their +5 cap');
});

/* The grade rule (brief fix/aetherium-gear-enchant-context, 11 Oct 2026). Grades come from grades.json (the data's
   "Legend" is the game's Epic); caps from the item's own maxEnchantLevel, else the grade's cap. */
const item=(over={})=>({empty:false,slot:'Helmet',slotPos:3,name:'Test Helm',grade:'Unique',enchant:0,maxEnchant:{pending:true,reason:'test'},...over});
const advise=(over,level=45)=>enchantAdvice(item(over),{level,grades,progression});
const pickAdvice=advice=>[advice.action,advice.from,advice.to,advice.costly,advice.flag];
check('grade names: the data\'s Legend is the game\'s Epic, internal Epic is Heroic; gradeName wins; Legend is never a name',()=>{
  assert.equal(gradeInfo('Legend',grades).name,'Epic');
  assert.equal(gradeInfo('Legend',grades).id,'epic');
  assert.equal(gradeInfo('Epic',grades).name,'Heroic');
  assert.equal(gradeInfo('Unique',grades).name,'Unique');
  assert.equal(gradeInfo('Rare',grades,'Rare').name,'Rare');
  assert.equal(gradeInfo('Legend',null).name,'Epic','Even with no grade data, Legend is shown as Epic');
  for(const record of grades.records.filter(entry=>entry.id!=='slot-caps'))assert.notEqual(record.name.value,'Legend');
  assert.deepEqual(grades.records.filter(entry=>entry.order).sort((a,b)=>a.order.value-b.order.value).map(entry=>entry.name.value),['Common','Rare','Epic','Unique','Heroic','Mythic','Special']);
});
check('grades.json: every value has a status and provenance, colours and caps as researched',()=>{
  const by=Object.fromEntries(grades.records.map(entry=>[entry.id,entry]));
  for(const record of grades.records.filter(entry=>entry.id!=='slot-caps')){
    for(const key of ['name','order','colour'])assert.ok(['confirmed','unconfirmed'].includes(record[key].status)&&record[key].provenance.length,`${record.id}.${key}`);
    assert.ok(record.cap.pending||(['confirmed','unconfirmed'].includes(record.cap.status)&&record.cap.provenance.length),`${record.id}.cap`);
    assert.ok(record.provenance.length,`${record.id} provenance`);
  }
  assert.deepEqual(['common','rare','epic','unique'].map(id=>by[id].cap.value),[5,5,10,15]);
  assert.equal(by.mythic.name.status,'unconfirmed');
  assert.equal(by.special.name.status,'unconfirmed');
  assert.deepEqual(Object.fromEntries(Object.entries(by['slot-caps'].slots).map(([name,cap])=>[name,cap.value])),{Amulet:10,Belt:10});
  assert.equal(by.unique.colour.value,'#e2b54f');
  assert.equal(by.epic.colour.value,'#58a8ff');
  assert.equal(by.rare.colour.value,'#5fd37e');
});
check('Unique: enchant to +10 first (every step succeeds), then +15 only on the weapon and guard, marked costly',()=>{
  assert.deepEqual(pickAdvice(advise({enchant:3,slot:'MainHand',slotPos:1})),['enchant',3,10,false,'ENCHANT +3 to +10']);
  assert.deepEqual(pickAdvice(advise({enchant:3})),['enchant',3,10,false,'ENCHANT +3 to +10']);
  assert.deepEqual(pickAdvice(advise({enchant:11,slot:'SubHand',slotPos:2})),['enchant',11,15,true,'ENCHANT +11 to +15']);
  assert.deepEqual(pickAdvice(advise({enchant:10,slot:'MainHand',slotPos:1})),['enchant',10,15,true,'ENCHANT +10 to +15']);
  assert.deepEqual(pickAdvice(advise({enchant:10})),['done',10,10,false,null],'Unique armour stops at +10, no flag');
  assert.equal(advise({enchant:3}).cap,15);
  assert.equal(advise({enchant:3}).about,true,'No item detail yet: the cap is the grade table\'s, said as about');
  assert.equal(advise({enchant:3,maxEnchant:15}).about,false,'The item\'s own max enchant wins');
});
check('Epic never above +5: always Replace with a Unique piece',()=>{
  for(const enchant of [0,3,5])assert.deepEqual(pickAdvice(advise({grade:'Legend',enchant,maxEnchant:10})),['replace',enchant,null,false,'REPLACE']);
  assert.match(advise({grade:'Legend'}).why,/do not enchant it past \+5/);
  assert.equal(advise({grade:'Legend'}).grade.name,'Epic');
});
check('Common and Rare: enchant to +5 early, Replace from Lv 20 (no progression cut-off yet)',()=>{
  assert.equal(advise({grade:'Rare',enchant:0},19).action,'enchant');
  assert.equal(advise({grade:'Rare',enchant:0},19).to,5);
  assert.equal(advise({grade:'Common',enchant:2},12).to,5);
  for(const grade of ['Common','Rare'])assert.equal(advise({grade,enchant:0},20).action,'replace',grade);
  assert.equal(advise({grade:'Rare',enchant:5,maxEnchant:5},12).action,'full');
});
check('amulets and belts follow their own +10 cap at every grade',()=>{
  for(const slot of ['Amulet','Belt'])for(const grade of ['Rare','Legend','Unique']){
    const advice=advise({slot,slotPos:22,grade,enchant:6});
    assert.deepEqual([advice.action,advice.to,advice.cap],['enchant',10,10],`${slot} ${grade}`);
  }
  assert.equal(advise({slot:'Amulet',slotPos:22,grade:'Rare',enchant:10}).action,'full');
});
check('at the cap: Fully enchanted, FULL, no move',()=>{
  const advice=advise({enchant:15,maxEnchant:15,slot:'MainHand',slotPos:1});
  assert.deepEqual([advice.action,advice.flag],['full','FULL']);
  const model={gear:[item({enchant:15,maxEnchant:15,slot:'MainHand',slotPos:1})]};
  assert.deepEqual(gearMoves(model,{level:45,grades,progression}),[]);
});
check('runes and Arcana get no grade advice (their own enhance rules), and never an empty-slot move when unworn',()=>{
  for(const slot of ['Rune1','Rune2','Arcana1','Arcana5']){
    const advice=advise({slot,slotPos:23,grade:'Rare',enchant:0,maxEnchant:3});
    assert.deepEqual([advice.action,advice.flag],[null,null],slot);
  }
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  assert.equal(lv45.gear.filter(slot=>slot.empty).length,0,'Unworn accessories, runes and Arcana are not empty slots');
  assert.ok(!gearMoves(lv45,{level:45,grades,progression}).some(move=>move.id==='empty'));
});
check('every class and slot: the grade rule runs for all 8 classes, wings and pet never get advice',()=>{
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  for(const className of AION2_CLASSES){
    const model=structuredClone(lv45);
    model.profile.class=className;
    const plan=buildAscentPlan({className,role:null,data:data(className),model});
    assert.ok(plan.now.some(move=>move.move==='enchant-1'),`${className}: the weapon move`);
    for(const slot of model.gear.filter(entry=>!entry.empty))assert.ok(enchantAdvice(slot,{level:45,grades,progression}).action,`${className} ${slot.slot}`);
  }
  assert.ok(!lv45.gear.some(slot=>/wing|pet/i.test(slot.slot)),'Wings and pet are not gear slots');
});
check('a Lv 45 Daeva (Unique weapon +3, Unique guard +11, Epic Pilgrim set, Rare amulet +9): the exact gear moves, in order',()=>{
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  const moves=gearMoves(lv45,{level:45,grades,progression});
  assert.deepEqual(moves.map(move=>move.title),[
    'Enchant Spiritforged Greatsword +3 to +10',
    'Enchant Noble Belt +6 to +10',
    'Enchant Revelation Amulet +9 to +10',
    'Replace 11 Epic pieces with Unique gear',
    'Replace 2 Rare pieces with Unique gear',
    'Enchant Wisdom Guard +11 to +15'
  ]);
  assert.match(moves[0].detail,/^Every step succeeds\./);
  assert.match(moves[2].detail,/^One step to its \+10 cap/);
  assert.match(moves.at(-1).detail,/Big Kina and Enhance Stone cost/);
  assert.match(moves.at(-1).detail,/after the weapon/);
  assert.deepEqual(moves[3].slots.sort((a,b)=>a-b),[3,4,5,6,7,8,10,11,12,13,19]);
  assert.ok(lv45.gear.filter(slot=>slot.name.startsWith('Pilgrim')).every(slot=>enchantAdvice(slot,{level:45,grades,progression}).flag==='REPLACE'),'Pilgrim pieces are flagged Replace, not Enchant');
  assert.ok(!moves.some(move=>/Enchant \d+ (worn )?items/.test(move.title)),'Never one vague Enchant N items line');
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:lv45});
  const gear=plan.now.filter(move=>move.view==='gear').map(move=>move.title);
  assert.deepEqual(gear,moves.map(move=>move.title),'The plan carries the same moves in the same order');
  assert.ok(plan.now.findIndex(move=>move.move==='enchant-1')<plan.now.findIndex(move=>move.move==='enchant-2'),'Guard after the weapon');
});
check('enchant rules in mechanics.json: rates, pity, carry and stones, each with a status and provenance',()=>{
  const rules=indexMechanics(mechanics,progression);
  assert.deepEqual(rules['enchant-rates'].value.rates,{11:65,12:50,13:35,14:25,15:20});
  assert.equal(rules['enchant-rates'].value.safeTo,10);
  assert.equal(rules['enchant-rates'].value.keepsLevel,true);
  assert.equal(rules['enchant-rates'].status,'confirmed');
  assert.equal(rules['enchant-pity'].status,'unconfirmed');
  assert.equal(rules['enchant-pity'].value.perFailure,5);
  assert.deepEqual(rules['enchant-carry'].parts.map(part=>[part.id,part.status]),[['crafted-steps','confirmed'],['gear-transfer','unconfirmed']]);
  assert.equal(rules['enhance-stones'].status,'unconfirmed');
  assert.deepEqual(enchantSteps(9,12,rules['enchant-rates']).map(step=>step.rate),[100,65,50]);
});

/* The Mastery cap (Miguel, in game, 10 Oct 2026): Mastery takes a skill to Lv 11 at most. The advisor never
   suggests a Mastery step past it; a skill at the cap points at its next +1 source instead. */
const withSkillLevels=(levels,boards=null)=>{
  const live=structuredClone(astrix);
  for(const skill of live.skills)if(skill.name in levels){skill.skillLevel=levels[skill.name];skill.acquired=true;}
  if(boards)live.daevanion=live.daevanion.map(board=>({...board,...(boards(board)??{})}));
  return live;
};
const nezekanNodes=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
check('the Mastery cap comes from mechanics.json, not the code',()=>{
  assert.equal(masteryCap(mechanics),11);
  const record=mechanics.records.find(item=>item.id==='mastery-cap');
  assert.equal(record.status,'confirmed');
  assert.ok(record.provenance.some(source=>source.kind==='in-game-capture'&&source.capturedOn==='2026-10-10'&&/Mastery/.test(source.where)));
  assert.equal(masteryCap(null),null);
  const nine={records:[{id:'mastery-cap',value:{cap:9,beyond:record.value.beyond}}]};
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:{...data('Gladiator'),mechanics:nine},model:withSkillLevels({'Keen Strike':9,'Rending Blow':8})});
  assert.ok(plan.mastery.spend.every(step=>step.to<=9),'Steps stop at the cap the data gives');
  assert.deepEqual(plan.mastery.atCap.map(entry=>entry.name),['Keen Strike']);
  assert.equal(plan.masteryCap,9);
});
check('no Mastery step above the cap for any class, with or without a Daeva',()=>{
  for(const name of AION2_CLASSES)for(const level of [1,12,22,30,45]){
    const plan=buildAscentPlan({className:name,level,data:data(name)});
    if(plan.pending)continue;
    for(const step of plan.mastery.spend)assert.ok(step.to<=11&&(step.from===null||step.from<step.to),`${name} Lv ${level}: ${step.name} ${step.from} to ${step.to}`);
    for(const entry of [...plan.mastery.active,...plan.skills])if(entry.targetText)assert.doesNotMatch(entry.targetText,/\bLv\s*(1[2-9]|[2-9]\d)\b/,`${name}: ${entry.name} target ${entry.targetText}`);
    for(const move of plan.now)assert.doesNotMatch(`${move.title} ${move.detail}`,/Target: Lv\s*(1[2-9]|[2-9]\d)\b/,`${name} Lv ${level}: ${move.title}`);
  }
  const maxed=withSkillLevels({'Keen Strike':11,'Rending Blow':12,'Overhead Slam':11});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:maxed});
  assert.ok(plan.mastery.spend.every(step=>step.to<=11));
  assert.ok(!plan.now.some(move=>/^Level (Keen Strike|Rending Blow|Overhead Slam)/.test(move.title)),'No "level it" move for a capped skill');
});
check('Keen Strike at 10 still gets a Mastery step to 11',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:withSkillLevels({'Keen Strike':10})});
  const step=plan.mastery.spend.find(item=>item.name==='Keen Strike');
  assert.deepEqual(step,{name:'Keen Strike',from:10,to:11,reason:'reaches the Mastery cap',priority:1});
  assert.equal(plan.mastery.atCap.length,0);
  assert.ok(plan.now.some(item=>item.title.startsWith('Level ')),'A level move still comes');
});
check('a skill at 11 points at its Daevanion node on the first open board where it is not taken',()=>{
  const read=withSkillLevels({'Keen Strike':11},board=>board.id===11?{nodes:nezekanNodes}:null);
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:read});
  const [keen]=plan.mastery.atCap;
  assert.equal(keen.name,'Keen Strike');
  assert.equal(keen.skillLevel,11);
  assert.equal(keen.cap,11);
  assert.deepEqual(keen.next,{kind:'daevanion',board:{id:11,name:'Nezekan'},nodeId:110131,nodeName:'Skill Level Up - Keen Strike',text:'Skill Level Up - Keen Strike on Nezekan'});
  const move=plan.now.find(item=>item.title==='Take the Keen Strike +1 node on Nezekan');
  assert.ok(move,'The move opens the board on the node');
  assert.equal(move.view,'daevanion');
  assert.equal(move.board,11);
  assert.equal(move.node,110131);
  assert.ok(!plan.now.some(item=>item.title.startsWith('Level Keen Strike')));
  // The Mastery tab still shows the real level, 12 included.
  const twelve=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:withSkillLevels({'Keen Strike':12},board=>board.id===11?{nodes:nezekanNodes}:null)});
  assert.equal(twelve.mastery.active.find(entry=>entry.name==='Keen Strike').skillLevel,12);
  assert.equal(twelve.mastery.atCap[0].skillLevel,12);
  // Nezekan's node taken, Zikel open but not read yet: the page has to read Zikel next.
  const taken=nezekanNodes.map(node=>node.nodeId===110131?{...node,taken:true}:node);
  const unread=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:withSkillLevels({'Keen Strike':11},board=>board.id===11?{nodes:taken}:board.id===12?{open:true}:null)});
  assert.deepEqual(unread.mastery.atCap[0].next,{kind:'unread',board:{id:12,name:'Zikel'},text:'a Daevanion skill node (Zikel not read yet)'});
  assert.ok(!unread.now.some(item=>item.title.startsWith('Take the Keen Strike')),'No node move until the board is read');
  // Every open board read and the node taken on each: gear or Arcana, as text, nothing invented.
  const spent=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:withSkillLevels({'Keen Strike':11},board=>board.id===11?{nodes:taken}:null)});
  assert.deepEqual(spent.mastery.atCap[0].next,{kind:'other',text:'gear stat lines or Arcana'});
  assert.deepEqual(nextLevelSource('Keen Strike',[],[]),{kind:'pending',text:'not known yet'});
});
check('build targets above the cap are reworded, only where the data supports it',()=>{
  const beyond=mechanics.records.find(item=>item.id==='mastery-cap').value.beyond;
  assert.equal(targetAgainstCap('Lv 10 early',{cap:11,beyond}),'Lv 10 early');
  assert.equal(targetAgainstCap('Keep levelled',{cap:11,beyond}),'Keep levelled');
  assert.equal(targetAgainstCap('Lv 8 to 12',{cap:11,beyond,viaNodes:true,nodeBoards:4}),'Mastery 11, then +1 from Daevanion nodes');
  assert.equal(targetAgainstCap('Lv 16, then 20',{cap:11,beyond,viaNodes:true,nodeBoards:4}),'Mastery 11, then +9 from Daevanion nodes, gear stat lines or Arcana');
  assert.equal(targetAgainstCap('Lv 16',{cap:11,beyond,viaNodes:false,nodeBoards:4}),'Mastery 11, then +5 from Daevanion nodes, gear stat lines or Arcana');
  assert.equal(targetAgainstCap('Lv 16',{cap:null}),'Lv 16','No cap known: the guide text stands');
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator')});
  const byName=Object.fromEntries(plan.skills.map(skill=>[skill.name,skill.targetText]));
  assert.equal(byName['Keen Strike'],'Lv 10 early');
  // The build itself now words the target against the cap (walkthrough fix, 11 Oct 2026): +4 from the nodes it names, the rest not reachable from a named source.
  assert.equal(byName['Rending Blow'],"Lv 10 early, then Mastery 11, then +4 from Daevanion nodes. The guide's skill level 16 and 20 need more: Mastery stops at 11 and the build names no other source");
  assert.equal(plan.mastery.active.find(entry=>entry.name==='Rending Blow').targetText,byName['Rending Blow']);
  assert.equal(progression.records.find(item=>item.id==='daevanion-boards').value.filter(board=>board.skillNodes===true).length,4,'Four boards carry skill nodes (daevanion-boards facts)');
});

/* Skill stacks (feature/aetherium-skill-stacks, 10 Oct 2026): every key a stack of up to four skills, cooldown skills low,
   the no-cooldown filler on top, heals, defensives and charged skills on their own keys; chains only from the data; the
   macro built from the stacks; every rule carries a status from mechanics.json. */
const stacksOf=plan=>Object.values(plan.skillBar.stacks).filter(stack=>stack.skills.length);
check('stacks for all 8 classes: at most four rows, no no-cooldown skill below a cooldown skill, left click solo and fixed, nothing twice',()=>{
  for(const name of AION2_CLASSES){
    for(const level of [1,12,23,45]){
      const plan=buildAscentPlan({className:name,level,data:data(name)});
      if(plan.pending)continue;
      const bar=plan.skillBar;
      assert.deepEqual(bar.problems,[],`${name} Lv ${level}: stack problems`);
      assert.deepEqual(stackProblems(bar),[],`${name} Lv ${level}: the check agrees`);
      for(const stack of stacksOf(plan)){
        assert.ok(stack.skills.length<=4,`${name}: key ${stack.key} holds ${stack.skills.length}`);
        // A skill that is always ready sits on top; one that fires only on a condition (stagger, a window) never blocks, so it may sit below it.
        const filler=stack.skills.findIndex(skill=>skill.noCooldown&&!skill.conditional);
        if(filler>=0)assert.equal(filler,stack.skills.length-1,`${name}: the no-cooldown skill on key ${stack.key} is on top`);
        if(stack.solo)assert.ok(stack.skills.length===1&&stack.reason,`${name}: a single-skill key says why`);
        if(stack.skills.length>1)assert.ok(['A','B'].includes(stack.key),`${name}: only stack A and stack B are stacks`);
      }
      assert.deepEqual(bar.stacks.LMB.skills.map(skill=>skill.name),[bar.basic],`${name}: left click holds the basic skill alone`);
      assert.equal(bar.bars[0].LMB.fixed,true);
      const names=stacksOf(plan).flatMap(stack=>stack.skills.map(skill=>skill.name));
      assert.equal(new Set(names).size,names.length,`${name}: no skill on two keys`);
      for(const off of bar.notOnBar)assert.ok(off.reason&&!names.includes(off.name),`${name}: ${off.name} is off the bar with a reason`);
      assert.equal(bar.rule.confirmed,true,'The stack rule is confirmed');
    }
  }
});
check('Gladiator bar: stack A, Keen Strike, stack B as the research record; own keys left to right in the order a player uses them',()=>{
  const bar=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar;
  assert.deepEqual(bar.right,['A','LMB','B'],'The right-hand block: stack A, the main attack, stack B');
  assert.deepEqual(bar.stacks.A.skills.map(skill=>skill.name),['Rage Burst','Overhead Slam','Mocking Blade','Ankle Slice']);
  assert.deepEqual(bar.stacks.B.skills.map(skill=>skill.name),['Blade Toss','Crushing Wave','Sword Aura Rampage','Rending Blow']);
  assert.equal(bar.stacks.LMB.skills[0].name,'Keen Strike');
  assert.equal(bar.stacks.LMB.skills[0].noCooldown,true,'Keen Strike, the filler, is the basic on left click');
  const left=bar.left.map(key=>bar.stacks[key].skills[0]).filter(Boolean);
  assert.deepEqual(left.map(skill=>skill.name),["Zikel's Blessing",'Lunge Stance','Ruinous Blow','Focused Block','Defiance','Leaping Slam','Rush Strike'],'Opener in order, then defensives, movement last');
  assert.deepEqual(left.map(skill=>skill.key),['1','2','3','4','5','6','7']);
  assert.ok(left.every(skill=>skill.why),'Each own key says why');
  assert.match(bar.stacks['3'].skills[0].why,/Dash/);
  // Blade Toss is a swap stigma, not one of the build's four: it shows in place and needs a slot.
  assert.equal(bar.stacks.B.skills[0].needsSlot,true);
  assert.deepEqual(bar.stacks.B.firesNow,['Crushing Wave','Sword Aura Rampage','Rending Blow']);
  assert.deepEqual(bar.notOnBar.map(skill=>skill.name),['Aerial Snare']);
});
check('pending cooldowns are marked and placed by role, never guessed',()=>{
  const bar=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar;
  // Rending Blow's cooldown is not captured; the build calls it its filler, so it counts as no cooldown on the build's word.
  const rending=bar.stacks.B.skills[3];
  assert.equal(rending.name,'Rending Blow');
  assert.equal(rending.cooldownSeconds,null,'Rending Blow: cooldown not captured, never guessed');
  assert.equal(rending.filler,true);assert.equal(rending.noCooldown,true);assert.equal(rending.cooldownPending,false);
  assert.equal(bar.stacks.A.skills[1].cooldownPending,false);assert.equal(bar.stacks.A.skills[1].cooldownSeconds,5,'Overhead Slam 5 s');
  const rage=bar.stacks.A.skills[0];
  assert.equal(rage.cooldownPending,false);assert.equal(rage.cooldownSeconds,45,'Rage Burst 45 s, from the research record');
  for(const name of AION2_CLASSES){
    const plan=buildAscentPlan({className:name,level:45,data:data(name)});
    if(plan.pending)continue;
    for(const skill of stacksOf(plan).flatMap(stack=>stack.skills)){
      const info=skills.records.find(record=>record.class===name&&record.name===skill.name);
      const captured=info&&typeof info.cooldownSeconds==='number';
      if(captured)assert.equal(skill.cooldownSeconds,info.cooldownSeconds,`${name}: ${skill.name} cooldown from the catalogue`);
      else assert.ok(skill.cooldownPending||skill.noCooldown,`${name}: ${skill.name} is marked pending or filler`);
    }
  }
});
check('the stack check fails a filler under a cooldown skill, a second filler, or a fifth row',()=>{
  const cd=(name,s)=>({name,cooldownSeconds:s,noCooldown:false,cooldownPending:false});
  const filler=name=>({name,cooldownSeconds:null,noCooldown:true,cooldownPending:false});
  assert.equal(stackProblems({stacks:{'1':{key:'1',skills:[filler('A'),cd('B',10)]}}}).length,1,'filler below a cooldown skill');
  assert.equal(stackProblems({stacks:{'1':{key:'1',skills:[cd('B',10),filler('A')]}}}).length,0,'filler on top is right');
  assert.equal(stackProblems({stacks:{'1':{key:'1',skills:[cd('B',10),filler('A'),filler('C')]}}}).length,1,'two fillers: only the lower one would ever fire');
  assert.equal(stackProblems({stacks:{'1':{key:'1',skills:[cd('A',1),cd('B',2),cd('C',3),cd('D',4),cd('E',5)]}}}).length,1,'five rows');
  // Macro builder (16 Oct 2026): a no-cooldown skill that only fires on a condition (a stagger, a window) is not always ready, so it never blocks.
  assert.equal(stackProblems({stacks:{A:{key:'A',skills:[cd('B',10),{...filler('S'),conditional:true},filler('F')]}}}).length,0,'stagger-only below the filler');
  assert.equal(stackProblems({stacks:{A:{key:'A',skills:[{...filler('S'),conditional:true},cd('B',10)]}}}).length,0,'stagger-only below a cooldown skill');
});
check('chains come only from the data: Specialty perks that add a chain skill, and the Ankle Slice tooltip with its lead-ins pending',()=>{
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).chains;
  assert.equal(glad.status,'unconfirmed');assert.equal(glad.confirmed,false);assert.match(glad.test,/Use a lead-in skill/);
  assert.deepEqual(glad.chains.map(chain=>[chain.leadIns.join('+'),chain.followUp,chain.opensAt,chain.from]),[
    ['Keen Strike','Reckless Strike',16,'specialty'],['Overhead Slam','Upward Strike',8,'specialty'],['Defiance','Wrath Burst',8,'specialty'],['','Ankle Slice',null,'tooltip']]);
  assert.match(glad.chains[3].pending.reason,/two lead-in skills/);
  const cleric=buildAscentPlan({className:'Cleric',role:'healer',level:45,data:data('Cleric')}).chains.chains;
  assert.deepEqual(cleric.map(chain=>[chain.leadIns[0],chain.followUp]),[["Earth's Retribution",'Discharge']]);
  assert.deepEqual(buildAscentPlan({className:'Assassin',level:45,data:data('Assassin')}).chains.chains,[],'No chain in the Assassin data, so none shown');
  const keen=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).mastery.active.find(entry=>entry.name==='Keen Strike');
  assert.deepEqual(keen.chains.map(chain=>chain.followUp),['Reckless Strike'],'The skill card knows its chain');
});

check('mechanics: the stack rule confirmed, chains and macro order unconfirmed with an in-game test, macro facts from progression through the rule',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')});
  assert.equal(plan.mechanics['skill-stack'].confirmed,true);
  assert.equal(plan.mechanics['chain-follow-up'].confirmed,false);
  assert.equal(plan.mechanics['macro-order'].confirmed,false);
  assert.equal(plan.macro.status,'unconfirmed');
  assert.deepEqual(plan.macro.options.map(option=>option.id),['listed','stack']);
  assert.match(plan.macro.test,/A then B/);
  assert.deepEqual(plan.macro.facts.bind.path,['Settings','Key Settings','General','Gameplay','Macro'],'The facts come from progression.json');
  assert.equal(plan.macro.facts.value.delayMs,10);
  for(const rule of mechanics.records){
    assert.ok(['confirmed','unconfirmed'].includes(rule.status),`${rule.id} has a status`);
    assert.ok(Array.isArray(rule.provenance)&&rule.provenance.length>0,`${rule.id} carries provenance`);
    if(rule.status==='unconfirmed')assert.ok(rule.test,`${rule.id} names its in-game test`);
  }
});

check('Macro 1 is the macro block: entry 1 stack A, entry 2 stack B, 10 ms each, each row with its place',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')});
  assert.deepEqual(plan.macro.keys,['A','B']);
  assert.deepEqual(plan.macro.entries.map(entry=>[entry.entry,entry.key,entry.delayMs]),[[1,'A',10],[2,'B',10]]);
  assert.deepEqual(plan.macro.entries[0].skills.map(skill=>[skill.name,skill.row,skill.inMacro]),[['Rage Burst',0,true],['Overhead Slam',1,true],['Mocking Blade',2,true],['Ankle Slice',3,true]]);
  assert.equal(plan.macro.entries[1].skills[0].out,'Needs a stigma slot','Blade Toss waits for a stigma slot');
  const low=buildAscentPlan({className:'Gladiator',role:'dps',level:5,data:data('Gladiator')}).macro.entries;
  assert.deepEqual(low.map(entry=>entry.firesNow),[['Overhead Slam','Mocking Blade'],['Sword Aura Rampage','Rending Blow']]);
  const cleric=buildAscentPlan({className:'Cleric',role:'healer',level:45,data:data('Cleric')}).macro;
  const named=cleric.entries.flatMap(entry=>entry.skills.map(skill=>skill.name));
  assert.ok(!named.includes('Bolt'),'A charged skill is never an entry');
  assert.ok(cleric.ownKeys.find(group=>group.reason==='charged').skills.some(skill=>skill.name==='Bolt'),'and sits on its own key, grouped as charged');
});
check('flipping a rule to confirmed in the data removes the pending state and places a known follow-up above its lead-in',()=>{
  const flipped=structuredClone(mechanics);
  flipped.records.find(rule=>rule.id==='chain-follow-up').status='confirmed';
  flipped.records.find(rule=>rule.id==='macro-order').status='confirmed';
  const iconsPlus=structuredClone(icons.Gladiator);
  iconsPlus.records[0].skills.push({name:'Upward Strike',icon:'ICON_GL_SKILL_099.png',category:'Active',needLevel:4});
  // Stack A is full (four rows) in the record, so give it a free row: the follow-up needs one.
  const roomy=structuredClone(builds.Gladiator);
  roomy.records[0].macro.stackA.rows=roomy.records[0].macro.stackA.rows.filter(row=>row.name!=='Ankle Slice');
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),mechanics:flipped,icons:iconsPlus,builds:roomy}});
  assert.equal(plan.chains.confirmed,true);assert.equal(plan.macro.confirmed,true);
  assert.deepEqual(plan.skillBar.stacks.A.skills.map(skill=>skill.name),['Rage Burst','Overhead Slam','Upward Strike','Mocking Blade'],'The follow-up sits right above its lead-in once the rule is confirmed');
  assert.deepEqual(plan.skillBar.problems,[]);
  const full=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),mechanics:flipped,icons:iconsPlus}}).skillBar;
  assert.ok(!full.stacks.A.skills.some(skill=>skill.name==='Upward Strike'),'A full stack has no room: never a fifth row');
  const before=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),icons:iconsPlus,builds:roomy}}).skillBar;
  assert.ok(!Object.values(before.stacks).some(stack=>stack.skills.some(skill=>skill.name==='Upward Strike')),'Unconfirmed: the follow-up is not placed in a stack');
});
check('a next move says the key and the row from the stacks: Put Overhead Slam above Rage Burst on stack A',()=>{
  const live=structuredClone(astrix);
  const slam=live.skills.find(skill=>skill.name==='Overhead Slam');
  Object.assign(slam,{acquired:true,skillLevel:2,equipped:false});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  const move=plan.now.find(item=>/^Put Overhead Slam/.test(item.title));
  // Macro builder (16 Oct 2026): Rage Burst is row 0 of stack A and Overhead Slam row 1 (it was above Ruinous Blow on key 1).
  assert.equal(move.title,'Put Overhead Slam above Rage Burst on stack A');
  assert.equal(move.view,'skill-bar');assert.equal(move.key,'A');assert.equal(move.row,1);
});
/* Walkthrough fix (fix/aetherium-walkthrough-logic, 11 Oct 2026): a Lv 12 and a Lv 41 Gladiator walk found screens that
   argued with each other and with mechanics.json. These hold the fixes for all 8 classes, from their build and catalogue data. */
const everyPlan=(levels=[1,12,22,41,45])=>AION2_CLASSES.flatMap(name=>rolesFor(builds[name]).flatMap(role=>levels.map(level=>({name,role:role.role,level,plan:buildAscentPlan({className:name,role:role.role,level,data:data(name)})})))).filter(item=>!item.plan.pending);
check('every stacked key ends with a filler on its top row, or says why the build has none (all 8 classes)',()=>{
  for(const {name,role,level,plan} of everyPlan()){
    const bar=plan.skillBar;
    assert.deepEqual(fillerProblems(bar),[],`${name} ${role} Lv ${level}: filler check`);
    for(const stack of stacksOf(plan).filter(item=>item.skills.length>1)){
      const top=stack.skills.at(-1);
      if(stack.fillerMissing){
        assert.ok(!(top.noCooldown&&!top.conditional),`${name}: key ${stack.key} says it has no filler only when its top row is not always ready`);
        assert.match(stack.fillerMissing,/the macro skips this entry/,`${name}: key ${stack.key} says why`);
      } else {
        assert.equal(top.noCooldown,true,`${name} ${role} Lv ${level}: key ${stack.key} tops with ${top.name}, a no-cooldown skill`);
        const info=skills.records.find(record=>record.class===name&&record.name===top.name);
        const row=builds[name].records.find(build=>build.role===role).macro[stack.key==='A'?'stackA':'stackB'].rows.find(item=>item.name===top.name);
        assert.ok(info?.cooldownSeconds===0||bar.fillers.includes(top.name)||row?.noCooldown===true,`${name}: ${top.name} is a filler by the catalogue (0 s), the build's word or the research record`);
      }
    }
  }
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:41,data:data('Gladiator')}).skillBar;
  // Macro builder: Sword Aura Rampage joins the list, its 0 s cooldown now in the catalogue (research record).
  assert.deepEqual(glad.fillers,['Keen Strike','Rending Blow','Sword Aura Rampage'],'Gladiator fillers: the rotation filler line, the key skill called "Main MP spender and filler", then a 0 s cooldown');
  assert.deepEqual(glad.stackFillers,['Rending Blow'],'Keen Strike stays on left click, so Rending Blow tops stack B');
  assert.equal(glad.stacks.B.fillerMissing,null);
  assert.match(glad.stacks.A.fillerMissing,/macro skips this entry/,'Stack A ends on Ankle Slice, a cooldown skill, and says so');
  // Derived, never hard-coded: take Rending Blow's filler word and the record's no-cooldown away and stack B has no filler to end on, and says why.
  const noFiller=structuredClone(builds.Gladiator);
  noFiller.records[0].coreSkills.find(core=>core.name==='Rending Blow').why='Main MP spender.';
  delete noFiller.records[0].macro.stackB.rows.find(row=>row.name==='Rending Blow').noCooldown;
  const bare=buildAscentPlan({className:'Gladiator',role:'dps',level:41,data:{...data('Gladiator'),builds:noFiller}}).skillBar;
  assert.deepEqual(bare.stacks.B.skills.map(skill=>skill.name),['Blade Toss','Crushing Wave','Sword Aura Rampage','Rending Blow']);
  assert.match(bare.stacks.B.fillerMissing,/macro skips this entry/);
  assert.deepEqual(bare.problems,[],'A stack with its reason passes');
  // The check fails a stack that ends on a cooldown skill with no reason.
  const cd=(name,s)=>({name,cooldownSeconds:s,noCooldown:false,cooldownPending:false});
  assert.equal(fillerProblems({stacks:{'1':{key:'1',skills:[cd('A',10),cd('B',5)],fillerMissing:null}}}).length,1);
  assert.equal(fillerProblems({stacks:{'1':{key:'1',skills:[cd('A',10),{...cd('F',null),noCooldown:true}],fillerMissing:null}}}).length,0);
});
check('stigmas sit where the macro block puts them: in stack A or B, or on a key of their own (all 8 classes)',()=>{
  for(const {name,role,level,plan} of everyPlan()){
    const bar=plan.skillBar;
    assert.deepEqual(stigmaKeyProblems(bar),[],`${name} ${role} Lv ${level}`);
    for(const stack of stacksOf(plan))if(stack.skills.length>1)assert.ok(['A','B'].includes(stack.key),`${name}: key ${stack.key} is not a stack`);
    // A stigma outside the build's four slots needs one: it shows in place, never in what fires now.
    for(const skill of stacksOf(plan).flatMap(stack=>stack.skills).filter(item=>item.stigma)){
      assert.equal(skill.needsSlot,!(plan.stigmas.slots??[]).some(slot=>slot.name===skill.name),`${name}: ${skill.name} slot`);
      if(skill.needsSlot)assert.ok(!bar.stacks[skill.key].firesNow.includes(skill.name));
    }
  }
  const bad={stigmas:['A','B','C','D'],stacks:{'1':{key:'1',skills:[{name:'X'},{name:'A',stigma:true}]},'5':{key:'5',skills:[{name:'Y'}]}}};
  assert.equal(stigmaKeyProblems(bad).length,2,'A stack on a left key, and a stigma in it, both fail');
});
check('Gladiator Lv 12 and Lv 41: stack A is Rage Burst, Overhead Slam, Mocking Blade, Ankle Slice; Lv 12 says what it fires now',()=>{
  for(const level of [12,41]){
    const bar=buildAscentPlan({className:'Gladiator',role:'dps',level,data:data('Gladiator')}).skillBar;
    assert.deepEqual(bar.stacks.A.skills.map(skill=>[skill.name,skill.locked]),[['Rage Burst',level<32],['Overhead Slam',false],['Mocking Blade',false],['Ankle Slice',false]]);
    assert.deepEqual(bar.stacks.A.firesNow,level<32?['Overhead Slam','Mocking Blade','Ankle Slice']:['Rage Burst','Overhead Slam','Mocking Blade','Ankle Slice']);
    assert.equal(bar.stacks.A.nextUnlock,level<32?32:null,'Until Lv 32 stack A fires Overhead Slam first');
    const ruinous=bar.left.map(key=>bar.stacks[key]).find(stack=>stack.skills[0]?.name==='Ruinous Blow');
    assert.equal(ruinous.nextUnlock,level<14?14:null);
  }
});
check('stigma screen data: an equipped build swap is a swap once, never "swap it out", and is not offered again',()=>{
  const live=structuredClone(astrix);
  live.profile.level=41;
  const equip=new Set(['Lunge Stance',"Zikel's Blessing",'Wrath Wave','Focused Block']);
  for(const skill of live.skills.filter(item=>item.category==='Dp'))Object.assign(skill,{acquired:true,equipped:equip.has(skill.name)});
  const s=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live}).stigmas;
  const wrath=s.equippedNow.find(item=>item.name==='Wrath Wave');
  assert.deepEqual([wrath.verdict,wrath.slot,wrath.for],['swap',3,'Rage Burst'],'Slot 3: Wrath Wave is a popular swap for Rage Burst');
  assert.ok(s.equippedNow.filter(item=>item.name!=='Wrath Wave').every(item=>item.verdict==='keep'));
  assert.deepEqual(s.alternatives.map(alt=>alt.name),['Blade Toss'],'Wrath Wave is not offered again');
  // A stigma in neither list is the only "swap it out", and it names the slot and the stigma to put in.
  const other=live.skills.find(item=>item.category==='Dp'&&!equip.has(item.name)&&!['Rage Burst','Blade Toss'].includes(item.name));
  for(const skill of live.skills)if(skill.name==='Wrath Wave')skill.equipped=false;
  other.equipped=true;
  const t=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live}).stigmas;
  const out=t.equippedNow.find(item=>item.name===other.name);
  assert.deepEqual([out.verdict,out.slot,out.for],['out',3,'Rage Burst']);
  assert.ok(!t.alternatives.some(alt=>alt.name===other.name),'Never offered after being told to remove it');
});

check('one level order: the level move, Mastery "Level these next" and the manual list read levelOrder, for every class',()=>{
  for(const {name,role,level,plan} of everyPlan()){
    const order=levelOrder(plan);
    assert.equal(order,plan.mastery.spend,'levelOrder is the Mastery list');
    const priorities=order.map(step=>step.priority);
    assert.deepEqual(priorities,[...priorities].sort((a,b)=>a-b),`${name} ${role} Lv ${level}: build priority order`);
    const move=plan.now.find(item=>/^Level /.test(item.title));
    if(!order.length){assert.equal(move,undefined);continue;}
    assert.equal(move.title,`Level your skills in this order: ${order.map(step=>step.name).join(', ')}`,`${name} ${role} Lv ${level}`);
  }
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  assert.deepEqual(levelOrder(plan).map(step=>step.name),['Keen Strike','Rending Blow','Overhead Slam']);
  assert.equal(plan.now.find(item=>/^Level /.test(item.title)).title,`Level ${levelOrder(plan)[0].name} (now Lv ${levelOrder(plan)[0].from})`,'The move names the first skill of the list');
  assert.equal(plan.now.filter(item=>/^Level /.test(item.title)).length,1,'One level move');
});

check('targets above 11 are reworded in every build, with provenance, and say only what the build names',()=>{
  const facts=progression.records.find(item=>item.id==='daevanion-boards').value.filter(board=>board.skillNodes===true).length;
  let reworded=0;
  for(const name of AION2_CLASSES)for(const build of builds[name].records)for(const core of build.coreSkills??[]){
    const nodes=build.daevanion?.skillNodes??[];
    const top=Math.max(0,...(core.target.match(/\d+/g)??[]).map(Number));
    if(top<=11&&!/Mastery 11/.test(core.target))continue;
    reworded++;
    assert.match(core.target,/Mastery 11/,`${build.id} ${core.name}: ${core.target}`);
    assert.doesNotMatch(core.target,/\bLv\s*(1[2-9]|[2-9]\d)\b/,`${build.id} ${core.name}: no Lv above 11`);
    if(nodes.includes(core.name))assert.match(core.target,new RegExp(`Mastery 11, then \\+${facts} from Daevanion nodes`),`${build.id} ${core.name}: nodes it names, never more than ${facts}`);
    else assert.doesNotMatch(core.target,/Daevanion/,`${build.id} ${core.name}: no node named, none claimed`);
    if(top>11+(nodes.includes(core.name)?facts:0))assert.match(core.target,/Mastery stops at 11 and the build names no other source/);
    assert.doesNotMatch(core.target,/gear|Arcana/i,'Gear and Arcana are not named per skill');
    assert.ok(core.refs.length>0,'Refs kept');
    assert.equal(core.targetProvenance?.capturedBy,'Miguel');assert.equal(core.targetProvenance.capturedOn,'2026-10-10');
    assert.match(core.targetProvenance.note,/Mastery stops at skill Lv 11/);
  }
  assert.equal(reworded,21,'Every target above 11 in the 8 builds');
  assert.equal(targetAgainstCap("Mastery 11, then +4 from Daevanion nodes. The guide's skill level 20 needs more",{cap:11,beyond:[]}),"Mastery 11, then +4 from Daevanion nodes. The guide's skill level 20 needs more",'A target worded against the cap stands');
});

check('no Specialty pick, slot or follow-up above 11 reads as reachable without a source the build names',()=>{
  for(const {name,role,plan} of everyPlan([45])){
    const nodes=plan.daevanion.skillNodes;
    const reachOk=(skill,level,reach,what)=>{
      if(level<=11){assert.equal(reach,null,`${name} ${what}`);return;}
      assert.ok(reach&&reach.text,`${name} ${role}: ${what} at skill Lv ${level} says how, or that the build names no way`);
      assert.equal(reach.reachable,nodes.includes(skill)&&level-11<=4,`${name}: ${what} reachable only through the build's nodes`);
    };
    for(const skill of plan.skills)for(const pick of skill.picks)reachOk(skill.name,pick.skillLevel,pick.reach,`${skill.name} pick ${pick.pick}`);
    for(const entry of plan.mastery.active)for(const slot of entry.slots){reachOk(entry.name,slot.slotLevel,slot.reach,`${entry.name} slot ${slot.slot}`);if(slot.pick)reachOk(entry.name,slot.pick.skillLevel,slot.pick.reach,`${entry.name} pick`);}
    for(const chain of plan.chains.chains)if(chain.opensAt)reachOk(chain.leadIns[0],chain.opensAt,chain.reach,`${chain.followUp} follow-up`);
  }
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')});
  const reckless=glad.chains.chains.find(chain=>chain.followUp==='Reckless Strike');
  assert.equal(reckless.reach.reachable,false,'Reckless Strike: no Keen Strike node in the build');
  assert.equal(reckless.reach.text,'needs skill level 16: Mastery stops at 11 and the build names no other source');
  const slam=glad.skills.find(skill=>skill.name==='Overhead Slam').picks;
  assert.deepEqual(slam.map(pick=>[pick.skillLevel,pick.reach?.reachable??null]),[[8,null],[12,true],[16,false]]);
  assert.equal(slam[1].reach.text,'Mastery 11, then +1 from Daevanion nodes');
  assert.match(slam[2].reach.text,/^needs skill level 16: Mastery 11 and \+4 from Daevanion nodes reach 15, and the build names no other source$/);
  assert.equal(reachSkillLevel('X',11,{cap:11}),null);
});

check('Macro 1: what joins later comes with its level; the opener is in order; no skill twice (all 8 classes)',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:12,data:data('Gladiator')});
  assert.deepEqual(plan.macro.later.map(item=>[item.name,item.key,item.unlockLevel]),[['Blade Toss','B',22],['Rage Burst','A',32]]);
  assert.deepEqual(plan.macro.opener.map(item=>[item.name,item.locked,item.unlockLevel]),[["Zikel's Blessing",true,27],['Lunge Stance',true,22],['Ruinous Blow',true,14]]);
  assert.deepEqual(plan.macro.ownKeys.map(group=>group.reason),['buff','defensive','dash']);
  for(const {name,role,level,plan:p} of everyPlan()){
    if(p.macro.pending)continue;
    const keys=p.macro.entries.map(entry=>entry.key);
    assert.equal(new Set(keys).size,keys.length,`${name}: each key once`);
    const named=p.macro.entries.flatMap(entry=>entry.skills.map(skill=>skill.name));
    assert.equal(new Set(named).size,named.length,`${name} ${role} Lv ${level}: no skill twice in the macro`);
    const own=p.macro.ownKeys.flatMap(group=>group.skills.map(skill=>skill.name));
    for(const skill of named)assert.ok(!own.includes(skill),`${name}: ${skill} is in the macro and on its own key`);
    for(const item of p.macro.later)assert.ok(item.unlockLevel>level,`${name}: ${item.name} joins later`);
  }
});
/* Macro eight (fix/aetherium-macro-eight, 12 Oct 2026): a macro holds up to 8 entries (Miguel, in game, 11 Oct 2026). Macro 1
   starts with the rotation's keys, then fills with other bar keys the catalogue marks as damage, longest cooldown first.
   Nothing is added on a guess: no role means "Could add", locked means "Add later". The limit is read from progression.json. */
const macroRecord=progression.records.find(item=>item.id==='macro-order');
check('macro limit: maxEntries 8 in progression.json, confirmed, from Miguel in game on 11 Oct 2026',()=>{
  assert.equal(macroRecord.maxEntries.value,8);
  assert.equal(macroRecord.maxEntries.status,'confirmed');
  assert.ok(macroRecord.maxEntries.provenance.some(source=>source.kind==='in-game-capture'&&/^Miguel/.test(source.capturedBy)&&source.capturedOn==='2026-10-11'));
  assert.match(macroRecord.maxEntries.note,/20 steps/,'Two guides say 20, pending a recheck');
  assert.equal(macroRecord.maxEntries.recheck.pending,true);
  assert.equal(buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).macro.maxEntries,8);
});
check('the macro never fills to its limit: two entries whatever the limit says (the #491 fill-up is gone)',()=>{
  for(const value of [3,8,20]){
    const changed=structuredClone(progression);
    changed.records.find(item=>item.id==='macro-order').maxEntries.value=value;
    const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),progression:changed}});
    assert.equal(plan.macro.maxEntries,value,'The limit is read from the data');
    assert.deepEqual(plan.macro.keys,['A','B'],`Limit ${value}: still stack A and stack B, nothing added`);
  }
  const none=structuredClone(progression);
  delete none.records.find(item=>item.id==='macro-order').maxEntries;
  const bare=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),progression:none}}).macro;
  assert.equal(bare.maxEntries,null);
  assert.deepEqual(bare.keys,['A','B']);
});
check('macro never holds more than 2 entries, stack A then stack B, at any level, for any class',()=>{
  for(const {name,role,level,plan} of everyPlan([1,5,12,22,30,41,45])){
    assert.ok(plan.macro.entries.length<=2,`${name} ${role} Lv ${level}: ${plan.macro.entries.length} entries`);
    assert.deepEqual(plan.macro.keys,['A','B'].slice(0,plan.macro.entries.length),`${name}: stack A first, then stack B`);
    assert.equal(plan.macro.used,plan.macro.entries.filter(entry=>entry.usable).length);
    assert.ok(plan.macro.entries.every(entry=>entry.delayMs===10),`${name}: 10 ms each`);
  }
});
const SECTION_6={
  Gladiator:{A:['Rage Burst','Overhead Slam','Mocking Blade','Ankle Slice'],main:'Keen Strike',B:['Blade Toss','Crushing Wave','Sword Aura Rampage','Rending Blow'],opener:["Zikel's Blessing",'Lunge Stance','Ruinous Blow'],own:['Ruinous Blow','Lunge Stance',"Zikel's Blessing",'Focused Block','Defiance','Leaping Slam','Rush Strike']},
  Assassin:{A:['Savage Fang','Ambush','Storm Rampage','Savage Roar'],main:'Quick Slice',B:['Insignia Explosion',"Triniel's Dagger",'Heart Gore'],opener:['Illusive Clone','Swift Contract'],own:['Illusive Clone','Swift Contract','Shadowstrike','Flash Slice','Infiltrate','Shadow Fall','Defiance','Evasion Stance']},
  Ranger:{A:['Snare Shot','Gale Arrow','Drill Dart','Tempest Shot'],main:'Snipe',B:['Explosive Arrow','Burst Arrow','Griffon Arrow','Arrow Scattershot'],opener:["Vaizel's Authority",'Bow of Blessing','Supporting Fire'],own:['Deadshot','Marking Shot',"Vaizel's Authority",'Bow of Blessing','Supporting Fire','Arrow Storm','Explosion Trap','Defiance',"Mother Nature's Breath"]},
  Sorcerer:{A:['Element Enhancement','Delayed Explosion','Fire Wall','Blaze'],main:'Flame Arrow',B:["Winter's Shackles",'Cold Storm','Bittercold Wind','Firestorm'],opener:[],own:['Hellfire','Wish of Concentration','Frost','Frost Burst','Flame Scattershot','Ice Chain','Defiance','Steel Barrier','Arctic Armor','Hibernation']},
  Spiritmaster:{A:['Jointstrike: Curse','Summon: Earth Spirit','Summon: Water Spirit','Summon: Fire Spirit'],main:'Cold Shock',B:['Jointstrike: Corrode','Dimensional Control','Elemental Fusion','Combustion'],opener:["Enhance: Spirit's Benediction",'Flame Blessing','Summon: Ancient Spirit'],own:["Enhance: Spirit's Benediction",'Flame Blessing','Summon: Ancient Spirit','Jointstrike: Destructive Attack','Rapid Scattershot',"Soul's Cry",'Defiance']}
};
check('every DPS class matches section 6 of the research record: rows, main attack, own keys, opener',()=>{
  for(const [name,want] of Object.entries(SECTION_6)){
    const plan=buildAscentPlan({className:name,role:'dps',level:45,data:data(name)});
    const bar=plan.skillBar;
    assert.deepEqual(bar.stacks.A.skills.map(skill=>skill.name),want.A,`${name} stack A`);
    assert.deepEqual(bar.stacks.B.skills.map(skill=>skill.name),want.B,`${name} stack B`);
    assert.equal(bar.stacks.LMB.skills[0].name,want.main,`${name} main attack`);
    assert.deepEqual(bar.opener,want.opener,`${name} opener`);
    assert.deepEqual(plan.macro.opener.map(item=>item.name),want.opener);
    const own=bar.left.map(key=>bar.stacks[key].skills[0]?.name).filter(Boolean);
    assert.deepEqual([...own].sort(),[...want.own].sort(),`${name} own keys`);
    assert.equal(plan.macro.blockStatus,'reported','Section 6 is REPORTED');
  }
});
check('Templar: stack A has Doom Shield in row 0, stack B Debilitating Smash in row 0, Vicious Strike between them',()=>{
  const plan=buildAscentPlan({className:'Templar',level:45,data:data('Templar')});
  assert.equal(plan.skillBar.stacks.A.skills[0].name,'Doom Shield');
  assert.equal(plan.skillBar.stacks.B.skills[0].name,'Debilitating Smash');
  assert.equal(plan.skillBar.stacks.LMB.skills[0].name,'Vicious Strike');
  assert.equal(builds.Templar.records.find(build=>build.main).macro.layoutProvenance.capturedBy,'Miguel','The layout is Miguel\'s in-game Templar setup');
});
check('no basic attack, filler key, charged skill, toggle or dash in any macro step (all 8 classes)',()=>{
  for(const {name,role,level,plan} of everyPlan([1,12,22,41,45])){
    if(plan.macro.pending)continue;
    const named=plan.macro.entries.flatMap(entry=>entry.skills.map(skill=>skill.name));
    assert.ok(!named.includes(plan.skillBar.basic),`${name}: the basic attack is never a step`);
    assert.ok(!plan.macro.keys.includes('LMB'),`${name}: the left click key is never an entry`);
    for(const skill of named){
      const use=skills.records.find(item=>item.class===name&&item.name===skill)?.macroUse;
      assert.equal(use?.value,'line',`${name} ${role} Lv ${level}: ${skill} is marked for the line`);
    }
    for(const group of plan.macro.ownKeys)if(['charged','toggle','dash','movement'].includes(group.reason))for(const skill of group.skills)assert.ok(!named.includes(skill.name),`${name}: ${skill.name} (${group.reason}) stays off`);
  }
  const off={Gladiator:['Defiance','Rush Strike','Keen Strike','Ruinous Blow'],Templar:['Punishment','Vicious Strike'],Cleric:['Bolt'],Chanter:['Undefeated Mantra']};
  for(const [name,list] of Object.entries(off))for(const {plan} of everyPlan([12,45]).filter(item=>item.name===name)){
    const named=plan.macro.entries.flatMap(entry=>entry.skills.map(skill=>skill.name));
    for(const skill of list)assert.ok(!named.includes(skill),`${name}: ${skill} is never an entry`);
  }
});
check('locked rows stay out of the macro with their level: Lv 12 fires only unlocked skills (all 8 classes)',()=>{
  for(const {name,level,plan} of everyPlan([1,5,12,22,41,45])){
    for(const entry of plan.macro.entries){
      for(const skill of entry.skills.filter(item=>item.inMacro))assert.ok(skill.unlockLevel<=level,`${name} Lv ${level}: ${skill.name} is open`);
      for(const skill of entry.skills.filter(item=>item.locked))assert.equal(skill.out,`From Lv ${skill.unlockLevel}`);
    }
  }
  for(const {name,plan} of everyPlan([12]))for(const entry of plan.macro.entries)assert.ok(entry.firesNow.every(skill=>plan.skillBar.stacks[entry.key].skills.find(item=>item.name===skill).unlockLevel<=12),`${name}: Lv 12 shows only unlocked skills`);
});
check('a skill the Daeva has not learned, or has at level 0, stays out of the macro',()=>{
  const live=structuredClone(astrix);
  live.profile.level=45;
  const slam=live.skills.find(skill=>skill.name==='Overhead Slam');
  Object.assign(slam,{acquired:true,skillLevel:0});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  const row=plan.macro.entries[0].skills.find(skill=>skill.name==='Overhead Slam');
  assert.equal(row.inMacro,false);assert.equal(row.out,'Not learned yet');
  assert.ok(!plan.macro.entries[0].firesNow.includes('Overhead Slam'));
});
check('a Lv 16 trigger is dimmed for a Daeva below skill Lv 16, and lights up at 16',()=>{
  const at=skillLevel=>{
    const live=structuredClone(astrix);
    live.profile.level=45;
    Object.assign(live.skills.find(skill=>skill.name==='Overhead Slam'),{acquired:true,skillLevel,equipped:true});
    return buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live}).skillBar.stacks.A.skills[1].triggers.find(item=>item.skillLevel===16);
  };
  assert.deepEqual([at(11).reached,at(11).dim,at(11).from],[false,true,'From skill Lv 16']);
  assert.deepEqual([at(16).reached,at(16).dim],[true,false]);
  const hand=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar.stacks.A.skills[1].triggers.find(item=>item.skillLevel===16);
  assert.deepEqual([hand.reached,hand.dim],[null,true],'Without a Daeva the level is not known, so it stays dim');
  const cond=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar.stacks.B.skills[2];
  assert.equal(cond.condition,'Only on a staggered target.','A conditional row says its condition');
});
check('every role in the catalogue rests on the exact words of its summary or its class build',()=>{
  const ALLOWED=['damage','filler','buff','movement','defensive','heal','charged','crowd-control'];
  for(const record of skills.records){
    if(!record.role)continue;
    assert.ok(ALLOWED.includes(record.role.value),`${record.name}: ${record.role.value}`);
    if(record.role.from==='summary')assert.ok(String(record.summary).includes(record.role.quote),`${record.name}: quote is in the summary`);
    else{
      assert.equal(record.role.from,'build');
      assert.ok(builds[record.class].records.some(build=>(build.coreSkills??[]).some(core=>core.name===record.name&&core.why.includes(record.role.quote))),`${record.name}: quote is in the ${record.class} build`);
    }
  }
});
check('every class reports how many entries its data supports',()=>{
  const counts={};
  for(const name of AION2_CLASSES){
    const plan=buildAscentPlan({className:name,level:45,data:data(name)});
    counts[name]=plan.macro.pending?'pending':plan.macro.used;
    if(!plan.macro.pending)assert.ok(plan.macro.used>=1&&plan.macro.used<=2,name);
  }
  console.log(`       entries at Lv 45: ${Object.entries(counts).map(([name,count])=>`${name} ${count}`).join(', ')}`);
  assert.equal(counts.Gladiator,2);
  assert.equal(counts.Chanter,1,'Chanter: one line sourced, stack B pending');
  assert.ok(counts.Ranger>=1&&counts.Sorcerer>=1,'Ranger and Sorcerer have a line though their rotation is pending');
});
check('macro data: facts, the eight rules and every skill\'s macro use carry a status and provenance',()=>{
  const ids=macroRecord.facts.map(fact=>fact.id);
  for(const id of ['skip-on-cooldown','order-not-guaranteed','reads-key-slot','charged-stage-one','toggles-switch-off','level-zero-costs-time','skill-queue'])assert.ok(ids.includes(id),id);
  for(const fact of macroRecord.facts){assert.ok(['reported','disputed','confirmed'].includes(fact.status),fact.id);assert.ok(fact.provenance.length>0,fact.id);}
  assert.equal(macroRecord.facts.find(fact=>fact.id==='skill-queue').status,'disputed');
  const rules=progression.records.find(item=>item.id==='macro-rules');
  assert.equal(rules.rules.length,8);
  assert.equal(rules.layout.status,'confirmed');
  for(const rule of rules.rules){assert.ok(['reported','confirmed'].includes(rule.status),rule.id);assert.ok(rule.provenance.length>0,rule.id);}
  const REASONS=['charged','toggle','dash','buff','defensive','heal','stagger','movement','other','main-attack'];
  for(const record of skills.records){
    if(record.macroUse){assert.ok(['line','own-key'].includes(record.macroUse.value),record.name);if(record.macroUse.value==='own-key')assert.ok(REASONS.includes(record.macroUse.reason),record.name);}
    for(const trigger of record.triggers??[]){assert.ok(['condition','opens','cdCut'].includes(trigger.type),record.name);assert.ok(trigger.skillLevel===null||Number.isInteger(trigger.skillLevel));assert.ok(trigger.status);}
  }
  for(const name of AION2_CLASSES)for(const build of builds[name].records.filter(item=>item.macro)){
    const rows=['stackA','stackB'].flatMap(id=>build.macro[id]?.rows??[]);
    for(const row of rows)assert.equal(skills.records.find(item=>item.class===name&&item.name===row.name)?.macroUse?.value,'line',`${build.id}: ${row.name}`);
    for(const own of build.macro.ownKeys)assert.equal(skills.records.find(item=>item.class===name&&item.name===own.name)?.macroUse?.value,'own-key',`${build.id}: ${own.name}`);
  }
});
check('unknown class throws',()=>{
  assert.throws(()=>buildAscentPlan({className:'Brawler',data:data('Gladiator')}),/Unknown AION 2 class/);
});

/* Stats explained (feature/aetherium-stats-explained, 11 Oct 2026): stats.json and the class priority chain. A point stat
   matters as much as the highest combat stat it feeds in the class build's own stats.order; nothing is guessed. */
const statsData=json('games/aion2/data/advisor/stats.json');
const mainBuilds=Object.fromEntries(AION2_CLASSES.map(name=>[name,builds[name].records.find(build=>build.main)]));
const statIndex=indexStats(statsData);
check('stats.json: 6 main and 10 deity stats at 0.1% per point, the effects the official lines show, every value with status and provenance',()=>{
  assert.deepEqual(statIndex.main.map(stat=>[stat.name,stat.effects.value]),[['Might',['Attack']],['Dexterity',['Evasion','Block','Critical Hit Resist']],['Intelligence',['Status Effect Chance']],['Constitution',['HP']],['Precision',['Accuracy','Critical Hit']],['Willpower',['Status Effect Resist']]]);
  assert.deepEqual(statIndex.deity.map(stat=>[stat.lord,stat.effects.value]),[['Nezekan',['Defense','Perfect Chance']],['Vaizel',['Accuracy','Evasion']],['Kaisinel',['Cooldown','Endurance Penetration']],['Yustiel',['HP','Regeneration']],['Siel',['Combat Speed','Double Resist']],['Zikel',['Attack','Perfect Resist']],['Triniel',['Critical Hit','Regeneration Penetration']],['Lumiel',['MP Cost','Double Chance']],['Marchutan',['MP','Endurance']],['Israphel',['Move Speed','Block']]]);
  for(const stat of statIndex.point){
    assert.equal(stat.perPoint.value,0.1);
    for(const key of ['effects','perPoint','from'])assert.ok(['confirmed','unconfirmed'].includes(stat[key].status)&&stat[key].provenance.length,`${stat.id}.${key}`);
    assert.equal(stat.effects.status,'confirmed');
    assert.equal(stat.from.status,'unconfirmed','Where points come from stays unconfirmed until checked');
  }
  // The live Lv 45 lines match the record: Might 15 gives Attack +1.5%, Time 37 gives Combat Speed and Double Resist +3.7%.
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  for(const row of lv45.stats.filter(entry=>entry.value>0)){
    const stat=statIndex.byType.get(row.type);
    assert.equal(row.effects.length,stat.effects.value.length,row.name);
    row.effects.forEach((line,n)=>{assert.ok(line.startsWith(stat.effects.value[n]),`${row.name}: ${line}`);assert.match(line,new RegExp(`${(row.value*0.1).toFixed(1).replace(/\.0$/,'')}%$`));});
  }
  const caps=Object.fromEntries(statIndex.combat.filter(stat=>stat.cap).map(stat=>[stat.name,[stat.cap.value,stat.cap.status]]));
  assert.deepEqual(caps,{Evasion:[30,'unconfirmed'],'Critical Hit':[50,'unconfirmed'],Cooldown:[60,'unconfirmed'],'MP Cost':[60,'unconfirmed'],'Move Speed':[150,'unconfirmed']});
  for(const name of ['Accuracy','Double Chance','Perfect Chance','Combat Speed','Endurance','Regeneration','Status Effect Chance','Status Effect Resist'])assert.ok(statIndex.combatByName.get(name).meaning.value,name);
});
check('the priority chain runs for every class from its own stats.order; a class without one gets no ranking',()=>{
  for(const name of AION2_CLASSES){
    const build=mainBuilds[name];
    const order=statOrder(build,statsData);
    const rank=rankPointStats(build,statsData);
    if(!Array.isArray(build.stats?.order)){assert.equal(order,null,name);assert.equal(rank,null,`${name}: no ranking without a stat order`);continue;}
    assert.equal(order.length,build.stats.order.length,name);
    assert.equal(Object.keys(rank).length,16,name);
    // A stat is high only when it feeds one of the first two entries, through a combat stat that entry's own text names.
    for(const [id,entry] of Object.entries(rank)){
      const stat=statIndex.byId.get(id);
      const named=order.filter(line=>line.combat.some(combat=>stat.effects.value.includes(combat)));
      assert.equal(entry.tag,!named.length?'low':named[0].rank<2?'high':'useful',`${name} ${id}`);
      for(const line of named)assert.ok(line.combat.every(combat=>new RegExp(combat,'i').test(line.text)),`${name}: "${line.text}" names ${line.combat}`);
    }
  }
  assert.equal(rankPointStats(mainBuilds.Assassin,statsData),null,'Assassin: stat order pending, no ranking');
});
check('Gladiator: Precision high, Constitution low, with the reason text; other classes named only from their own data',()=>{
  const rank=rankPointStats(mainBuilds.Gladiator,statsData);
  assert.equal(rank.precision.tag,'high');
  assert.equal(rank.freedom.tag,'high');
  assert.equal(rank.wisdom.tag,'high');
  assert.equal(rank.time.tag,'useful');
  assert.equal(rank.might.tag,'useful','Front Attack Damage Boost is not Attack: Might comes from the sixth entry, Attack');
  assert.equal(rank.constitution.tag,'low');
  const others=classesWanting('constitution',mainBuilds,statsData,'Gladiator');
  assert.deepEqual(others,['Templar'],'Only the Templar build ranks Constitution high (HP second on its list)');
  for(const name of others)assert.equal(rankPointStats(mainBuilds[name],statsData).constitution.tag,'high');
  assert.equal(statReason(statIndex.byId.get('precision'),rank.precision,'Gladiator'),'Precision: high for Gladiator. It raises Accuracy, your first stat to reach.');
  assert.equal(statReason(statIndex.byId.get('constitution'),rank.constitution,'Gladiator',others),'Constitution: low for Gladiator. It only raises HP, which your build does not chase. Templars want it.');
  assert.ok(!classesWanting('constitution',mainBuilds,statsData).includes('Assassin'),'A class with no stat order never wants anything');
});
check('Ascent Plan stat plan: chains with the Daeva\'s own points, gear rows with skips; by hand has no live numbers',()=>{
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:{...data('Gladiator'),stats:statsData},model:lv45});
  const accuracy=plan.statPlan.chains[0].links.find(link=>link.name==='Accuracy');
  assert.deepEqual(accuracy.from.map(from=>[from.name,from.points]),[['Precision',11],['Freedom [Vaizel]',26]]);
  assert.deepEqual(plan.statPlan.chains[3].links.map(link=>[link.name,link.from.length]),[['Weapon Damage Boost',0]],'Fed by no stat points');
  const rows=Object.fromEntries(plan.statPlan.gear.map(row=>[row.label,[row.want.map(stat=>stat.name),row.skip.map(stat=>stat.name)]]));
  assert.deepEqual(rows.Weapon,[['Precision','Might'],[]]);
  assert.deepEqual(rows.Armour,[[],['Dexterity','Constitution','Willpower']]);
  assert.deepEqual(rows.Accessories,[['Precision','Might'],['Intelligence']]);
  assert.deepEqual(rows['Arcana and Abyssal Bracelet'][0],['Freedom [Vaizel]','Wisdom [Lumiel]','Time [Siel]','Destruction [Zikel]']);
  const byHand=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),stats:statsData}});
  assert.ok(byHand.statPlan.chains.every(entry=>entry.links.every(link=>link.from.every(from=>from.points===null))),'No live numbers by hand');
  assert.equal(byHand.statPlan.live,false);
  const tank=buildAscentPlan({className:'Templar',role:'tank',level:45,data:{...data('Templar'),stats:statsData}});
  assert.equal(tank.statPlan.rank.constitution.tag,'high','A tank whose order has HP gets Constitution high');
  assert.equal(tank.statPlan.rank.justice.tag,'high','and Justice for Defense');
});
check('sub stat lines on an item are tagged for the class; near-zero main stats are spotted',()=>{
  const rank=rankPointStats(mainBuilds.Gladiator,statsData);
  assert.equal(subStatTag({name:'Might'},rank,mainBuilds.Gladiator,statsData),'useful');
  assert.equal(subStatTag({name:'Precision'},rank,mainBuilds.Gladiator,statsData),'high');
  assert.equal(subStatTag({name:'Block'},rank,mainBuilds.Gladiator,statsData),'low');
  assert.equal(subStatTag({name:'MP'},rank,mainBuilds.Gladiator,statsData),'low');
  assert.equal(subStatTag({name:'Might'},null,mainBuilds.Assassin,statsData),null,'No tag without a stat order');
  const low=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
  const lv45=module.normaliseCharacter({info:fx('lv45-info'),equipment:fx('lv45-equipment')},{region:'eu',capturedOn:'2026-10-11'});
  assert.equal(mostlyLow(low.stats,statsData),true);
  assert.equal(mostlyLow(lv45.stats,statsData),false);
  assert.deepEqual(combatNamesIn('Front Attack Damage Boost',statsData),['Front Attack Damage Boost']);
  assert.deepEqual(combatNamesIn('Critical Hit Resist and MP Cost',statsData),['Critical Hit Resist','MP Cost']);
});

if(failed){console.log(`AION2_ADVISOR=FAIL ${failed}`);process.exitCode=1;}
else console.log('AION2_ADVISOR=PASS');
