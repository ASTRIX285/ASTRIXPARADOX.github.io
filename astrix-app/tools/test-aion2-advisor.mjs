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
import {AION2_CLASSES,ROLES,buildAscentPlan,clampLevel,fillerProblems,levelOrder,masteryCap,needsEnchant,nextLevelSource,pickBuild,reachSkillLevel,rolesFor,stackProblems,stigmaKeyProblems,targetAgainstCap} from '../games/aion2/engine/ascent-advisor.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {adaptDaevanionBoard} from '../games/aion2/engine/armory-adapter.mjs';
import {affordable,explainNode,nodeCost,parseEffect,planDaevanionBoard,summariseBoard} from '../games/aion2/engine/daevanion-planner.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const builds=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/builds/${name.toLowerCase()}.json`)]));
const icons=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/icons/${name.toLowerCase()}.json`)]));
const mechanics=json('games/aion2/data/advisor/mechanics.json');
const data=name=>({progression,skills,mechanics,builds:builds[name],icons:icons[name]});

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
  // Skill stacks (10 Oct 2026): the rotation is one stack on key 1, so Ruinous Blow sits on row 0 of key 1 (it used to be its own key 3).
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:12,data:data('Gladiator')}).skillBar;
  assert.equal(glad.stacks['1'].skills[0].name,'Ruinous Blow','Row 0 of key 1: the first rotation skill fires first');
  assert.equal(glad.bars[0]['1'].name,'Ruinous Blow');
  assert.equal(glad.bars[0]['1'].locked,true,'Ruinous Blow locked at Lv 12 (unlocks at 14)');
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
check('the enchant move lists the +0 worn slots, the rule the Gear page flags with needsEnchant',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  const move=plan.now.find(item=>/^Enchant \d+ worn items above \+0$/.test(item.title));
  const expected=astrix.gear.filter(needsEnchant).map(slot=>slot.slotPos);
  assert.ok(expected.length>0,'The fixture wears +0 items');
  assert.deepEqual(move.slots,expected);
  assert.ok(astrix.gear.filter(needsEnchant).every(slot=>!slot.empty&&slot.enchant===0));
  assert.ok(astrix.gear.filter(slot=>!needsEnchant(slot)).every(slot=>slot.empty||slot.enchant>0));
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
        const filler=stack.skills.findIndex(skill=>skill.noCooldown);
        if(filler>=0)assert.equal(filler,stack.skills.length-1,`${name}: the no-cooldown skill on key ${stack.key} is on top`);
        if(stack.solo)assert.ok(stack.skills.length===1&&stack.reason,`${name}: a single-skill key says why`);
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

check('Gladiator stacks: the rotation on key 1 in build order with the filler rule, by-hand skills on their own keys, stigmas outside the rotation on 5 to 8',()=>{
  const bar=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar;
  // Walkthrough fix (11 Oct 2026): a stigma is never in a stack and every stacked key ends with a filler, so Rage Burst moves to key 7
  // and Rending Blow (the build's filler) tops key 1. Key 2 takes the next key skill the rotation does not use.
  assert.deepEqual(bar.stacks['1'].skills.map(skill=>skill.name),['Ruinous Blow','Overhead Slam','Rending Blow'],'Key 1: the rotation, row 0 first, the filler on top');
  assert.deepEqual(bar.stacks['2'].skills.map(skill=>skill.name),['Crushing Wave'],'Key 2: a Daevanion node skill the rotation does not use');
  assert.equal(bar.stacks.LMB.skills[0].noCooldown,true,'Keen Strike, the filler, is the basic on left click');
  assert.deepEqual([bar.stacks.Q,bar.stacks.E].map(stack=>[stack.skills[0].name,stack.solo,stack.skills[0].role]),[['Defiance',true,'manual'],['Rush Strike',true,'manual']]);
  assert.match(bar.stacks.Q.reason,/fires it by hand/);
  assert.deepEqual(['5','6','7','8'].map(key=>bar.stacks[key].skills.map(skill=>skill.name)),[['Lunge Stance'],["Zikel's Blessing"],['Rage Burst'],['Focused Block']],'The four stigmas on 5 to 8, one each, in slot order');
  assert.deepEqual(bar.notOnBar.map(skill=>skill.name),['Ankle Slice','Aerial Snare']);
});

check('pending cooldowns are marked and placed by role, never guessed',()=>{
  const bar=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')}).skillBar;
  // Rending Blow's cooldown is not captured; the build calls it its filler, so it counts as no cooldown on the build's word.
  const rending=bar.stacks['1'].skills[2];
  assert.equal(rending.name,'Rending Blow');
  assert.equal(rending.cooldownSeconds,null,'Rending Blow: cooldown not captured, never guessed');
  assert.equal(rending.filler,true);assert.equal(rending.noCooldown,true);assert.equal(rending.cooldownPending,false);
  assert.equal(bar.stacks['1'].skills[1].cooldownPending,false);assert.equal(bar.stacks['1'].skills[1].cooldownSeconds,5,'Overhead Slam 5 s');
  const ruinous=bar.stacks['1'].skills[0];
  assert.equal(ruinous.cooldownPending,false);assert.equal(ruinous.cooldownSeconds,45);
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

check('the macro is built from the stacks: rotation order, each entry with its key and row',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:data('Gladiator')});
  // Rage Burst is a stigma on its own key (7) since the walkthrough fix; key 1 holds the rest of the rotation with Rending Blow on top.
  assert.deepEqual(plan.macro.keys,['1','7']);
  assert.deepEqual(plan.macro.entries.map(step=>[step.name,step.key,step.row,step.locked]),[['Ruinous Blow','1',0,false],['Rage Burst','7',0,false],['Overhead Slam','1',1,false],['Rending Blow','1',2,false]]);
  const low=buildAscentPlan({className:'Gladiator',role:'dps',level:5,data:data('Gladiator')}).macro.entries;
  assert.deepEqual(low.filter(step=>!step.locked).map(step=>step.name),['Overhead Slam','Rending Blow']);
  const cleric=buildAscentPlan({className:'Cleric',role:'healer',level:45,data:data('Cleric')}).macro;
  assert.equal(cleric.entries.find(step=>/Bolt/.test(step.text)).charged,true,'A charged skill is marked');
  assert.equal(cleric.entries.find(step=>/Bolt/.test(step.text)).soloKey,true,'and sits on its own key');
});

check('flipping a rule to confirmed in the data removes the pending state and places a known follow-up above its lead-in',()=>{
  const flipped=structuredClone(mechanics);
  flipped.records.find(rule=>rule.id==='chain-follow-up').status='confirmed';
  flipped.records.find(rule=>rule.id==='macro-order').status='confirmed';
  const iconsPlus=structuredClone(icons.Gladiator);
  iconsPlus.records[0].skills.push({name:'Upward Strike',icon:'ICON_GL_SKILL_099.png',category:'Active',needLevel:4});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),mechanics:flipped,icons:iconsPlus}});
  assert.equal(plan.chains.confirmed,true);assert.equal(plan.macro.confirmed,true);
  const key1=plan.skillBar.stacks['1'].skills.map(skill=>skill.name);
  assert.deepEqual(key1,['Ruinous Blow','Overhead Slam','Upward Strike','Rending Blow'],'The follow-up sits right above its lead-in once the rule is confirmed, under the filler');
  assert.deepEqual(plan.skillBar.problems,[]);
  const before=buildAscentPlan({className:'Gladiator',role:'dps',level:45,data:{...data('Gladiator'),icons:iconsPlus}}).skillBar;
  assert.ok(!Object.values(before.stacks).some(stack=>stack.skills.some(skill=>skill.name==='Upward Strike')),'Unconfirmed: the follow-up is not placed in a stack');
});

check('a next move says the key and the row from the stacks: Put Overhead Slam above Ruinous Blow on key 1',()=>{
  const live=structuredClone(astrix);
  const slam=live.skills.find(skill=>skill.name==='Overhead Slam');
  Object.assign(slam,{acquired:true,skillLevel:2,equipped:false});
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live});
  const move=plan.now.find(item=>/^Put Overhead Slam/.test(item.title));
  // Row 1 sits above row 0 on the bar, so the move says above (it said "under Rage Burst" while Rage Burst was in the stack).
  assert.equal(move.title,'Put Overhead Slam above Ruinous Blow on key 1');
  assert.equal(move.view,'skill-bar');assert.equal(move.key,'1');assert.equal(move.row,1);
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
        assert.ok(bar.stackFillers.every(filler=>stacksOf(plan).some(other=>other!==stack&&other.skills.at(-1).name===filler)),`${name}: key ${stack.key} has no filler only when every usable filler tops another key`);
        assert.match(stack.fillerMissing,/the key does nothing/,`${name}: key ${stack.key} says why`);
      } else {
        assert.equal(top.noCooldown,true,`${name} ${role} Lv ${level}: key ${stack.key} tops with ${top.name}, a no-cooldown skill`);
        const info=skills.records.find(record=>record.class===name&&record.name===top.name);
        assert.ok(info?.cooldownSeconds===0||bar.fillers.includes(top.name),`${name}: ${top.name} is a filler by the catalogue (0 s) or the build's word`);
      }
    }
  }
  const glad=buildAscentPlan({className:'Gladiator',role:'dps',level:41,data:data('Gladiator')}).skillBar;
  assert.deepEqual(glad.fillers,['Keen Strike','Rending Blow'],'Gladiator fillers: the rotation filler line, then the key skill called "Main MP spender and filler"');
  assert.deepEqual(glad.stackFillers,['Rending Blow'],'Keen Strike stays on left click, so Rending Blow tops the stack');
  assert.equal(glad.stacks['1'].fillerMissing,null);
  // Derived, never hard-coded: take Rending Blow's filler word away and key 1 has no filler to end on, and says why.
  const noFiller=structuredClone(builds.Gladiator);
  noFiller.records[0].coreSkills.find(core=>core.name==='Rending Blow').why='Main MP spender.';
  const bare=buildAscentPlan({className:'Gladiator',role:'dps',level:41,data:{...data('Gladiator'),builds:noFiller}}).skillBar;
  assert.deepEqual(bare.stacks['1'].skills.map(skill=>skill.name),['Ruinous Blow','Overhead Slam','Rending Blow']);
  assert.match(bare.stacks['1'].fillerMissing,/Keen Strike, stays on left click/);
  assert.deepEqual(bare.problems,[],'A stack with its reason passes');
  // The check fails a stack that ends on a cooldown skill with no reason.
  const cd=(name,s)=>({name,cooldownSeconds:s,noCooldown:false,cooldownPending:false});
  assert.equal(fillerProblems({stacks:{'1':{key:'1',skills:[cd('A',10),cd('B',5)],fillerMissing:null}}}).length,1);
  assert.equal(fillerProblems({stacks:{'1':{key:'1',skills:[cd('A',10),{...cd('F',null),noCooldown:true}],fillerMissing:null}}}).length,0);
});

check('no stigma in any stack; keys 5 to 8 hold the four build stigmas in slot order (all 8 classes)',()=>{
  for(const {name,role,level,plan} of everyPlan()){
    const bar=plan.skillBar;
    assert.deepEqual(stigmaKeyProblems(bar),[],`${name} ${role} Lv ${level}`);
    for(const stack of stacksOf(plan))if(stack.skills.length>1)assert.ok(stack.skills.every(skill=>!skill.stigma),`${name}: key ${stack.key} holds no stigma`);
    const slots=plan.stigmas.slots??[];
    if(slots.length===4)assert.deepEqual(['5','6','7','8'].map(key=>bar.stacks[key].skills.map(skill=>skill.name)),slots.map(slot=>[slot.name]),`${name} ${role}: 5 to 8 are the stigmas`);
  }
  const bad={stigmas:['A','B','C','D'],stacks:{'1':{key:'1',skills:[{name:'X'},{name:'A',stigma:true}]},'5':{key:'5',skills:[{name:'Y'}]},'6':{key:'6',skills:[{name:'B'}]},'7':{key:'7',skills:[{name:'C'}]},'8':{key:'8',skills:[{name:'D'}]}}};
  assert.equal(stigmaKeyProblems(bad).length,2,'A stigma in a stack and a wrong key 5 both fail');
});

check('Gladiator Lv 12 and Lv 41: key 1 is Ruinous Blow, Overhead Slam, Rending Blow; Lv 12 says what key 1 fires now',()=>{
  for(const level of [12,41]){
    const bar=buildAscentPlan({className:'Gladiator',role:'dps',level,data:data('Gladiator')}).skillBar;
    assert.deepEqual(bar.stacks['1'].skills.map(skill=>[skill.name,skill.locked]),[['Ruinous Blow',level<14],['Overhead Slam',false],['Rending Blow',false]]);
    assert.deepEqual(bar.stacks['1'].firesNow,level<14?['Overhead Slam','Rending Blow']:['Ruinous Blow','Overhead Slam','Rending Blow']);
    assert.equal(bar.stacks['1'].nextUnlock,level<14?14:null,'Until Lv 14 key 1 fires Overhead Slam, then Rending Blow');
    assert.equal(bar.stacks['7'].skills[0].name,'Rage Burst');
    assert.equal(bar.stacks['7'].nextUnlock,level<32?32:null);
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

check('Macro 1 lists keys in build order with each stack; locked skills are never under Keep on your own keys',()=>{
  const plan=buildAscentPlan({className:'Gladiator',role:'dps',level:41,data:data('Gladiator')});
  assert.deepEqual(plan.macro.slots.map(slot=>[slot.key,slot.skills.map(skill=>skill.name)]),[['1',['Ruinous Blow','Overhead Slam','Rending Blow']],['7',['Rage Burst']]]);
  assert.deepEqual(plan.macro.fallback,['Ruinous Blow','Rage Burst','Overhead Slam','Rending Blow'],'Fallback: one by one, in the build order, each once');
  const low=buildAscentPlan({className:'Gladiator',role:'dps',level:12,data:data('Gladiator')}).macro;
  assert.deepEqual(low.slots.map(slot=>[slot.key,slot.usable,slot.firesNow]),[['1',true,['Overhead Slam','Rending Blow']],['7',false,[]]]);
  assert.deepEqual(low.later.map(slot=>[slot.key,slot.unlockLevel]),[['7',32]]);
  assert.deepEqual(low.manual.map(item=>[item.name,item.locked,item.unlockLevel]),[['Defiance',true,16],['Rush Strike',false,10]],'Defiance is Add later at Lv 12');
  for(const {name,role,level,plan:p} of everyPlan()){
    if(!p.macro.slots.length)continue;
    const keys=p.macro.slots.map(slot=>slot.key);
    assert.equal(new Set(keys).size,keys.length,`${name}: each key once`);
    const named=p.macro.slots.flatMap(slot=>slot.skills.map(skill=>skill.name));
    assert.equal(new Set(named).size,named.length,`${name} ${role} Lv ${level}: no skill twice in the macro`);
    for(const item of p.macro.manual)if(item.name)assert.equal(item.locked,level<item.unlockLevel,`${name}: ${item.name} lock follows the level`);
  }
});

check('unknown class throws',()=>{
  assert.throws(()=>buildAscentPlan({className:'Brawler',data:data('Gladiator')}),/Unknown AION 2 class/);
});

if(failed){console.log(`AION2_ADVISOR=FAIL ${failed}`);process.exitCode=1;}
else console.log('AION2_ADVISOR=PASS');
