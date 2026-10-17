#!/usr/bin/env node
// The level planner (brief feature/aetherium-level-planner, 17 Oct 2026). Offline, no network.
//   For the Gladiator at Lv 1, 5, 12, 22, 27, 32, 37 and 45, as DPS and as tank in all three teams:
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken (stackProblems and the rest of the bar checks);
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level, role and team each change the setup; the first move follows the plan;
//   - real skill levels drive the Mastery order;
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the other seven classes keep working on today's data and say "Not confirmed yet".
// AE_BROWSER=0 skips the page checks (they need Playwright).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AION2_CLASSES,buildAscentPlan,rolesFor,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {planLevelSetup,weightsFor} from '../games/aion2/engine/level-planner.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {adaptDaevanionBoard} from '../games/aion2/engine/armory-adapter.mjs';
import {planRoleRoute,routePriorities} from '../games/aion2/engine/daevanion-planner.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const mechanics=json('games/aion2/data/advisor/mechanics.json');
const grades=json('games/aion2/data/advisor/grades.json');
const builds=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/builds/${name.toLowerCase()}.json`)]));
const icons=Object.fromEntries(AION2_CLASSES.map(name=>[name,json(`games/aion2/data/advisor/icons/${name.toLowerCase()}.json`)]));
const data=name=>({progression,skills,mechanics,grades,builds:builds[name],icons:icons[name]});
const module=createAion2Module({slots:json('games/aion2/data/gear-slots.json').records});
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);
const astrix=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const CASES=[['dps',null],['tank','main-tank'],['tank','off-tank-templar'],['tank','solo']];
const plan=(level,role,team,extra={})=>buildAscentPlan({className:'Gladiator',role,team,level,data:data('Gladiator'),...extra});
const label=(level,role,team)=>`Gladiator ${role}${team?` ${team}`:''} Lv ${level}`;
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>icons.Gladiator.records[0].skills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;

check('every case: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const [role,team] of CASES)for(const level of LEVELS){
    const p=plan(level,role,team);
    const at=label(level,role,team);
    for(const cell of cells(p.skillBar)){
      assert.equal(cell.locked,false,`${at}: ${cell.name} locked on the bar`);
      assert.equal(cell.needsSlot,false,`${at}: ${cell.name} needs a slot`);
      if(!cell.stigma)assert.ok(unlockOf(cell.name)<=level,`${at}: ${cell.name} unlocks at Lv ${unlockOf(cell.name)}`);
      else assert.ok(p.stigmas.slots.some(slot=>slot.name===cell.name&&slot.open),`${at}: ${cell.name} is not in an open stigma slot`);
    }
    for(const step of p.skillBar.copySteps.filter(item=>!item.macro))for(const row of step.rows){
      assert.equal(row.locked,false,`${at}: Copy this bar lists ${row.name}, locked`);
      assert.equal(row.needsSlot,false,`${at}: Copy this bar lists ${row.name}, needs a slot`);
    }
    const onBar=new Set(cells(p.skillBar).map(cell=>cell.name));
    for(const item of p.skillBar.later){
      assert.ok(!onBar.has(item.name),`${at}: ${item.name} is on the bar and in Comes later`);
      assert.ok(item.reason,`${at}: ${item.name} says why it waits`);
      if(item.unlockLevel!==null)assert.ok(item.unlockLevel>level,`${at}: ${item.name} waits for Lv ${item.unlockLevel}`);
    }
    // Every skill the Lv 45 bar holds is either on this bar or in Comes later: nothing silently dropped.
    const top=plan(45,role,team);
    for(const cell of cells(top.skillBar))assert.ok(onBar.has(cell.name)||p.skillBar.later.some(item=>item.name===cell.name),`${at}: ${cell.name} is neither on the bar nor in Comes later`);
  }
});

check('every case: no stack rule broken, the macro holds only what is on the bar',()=>{
  for(const [role,team] of CASES)for(const level of LEVELS){
    const p=plan(level,role,team);
    const at=label(level,role,team);
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(cells(p.skillBar).some(cell=>cell.name===row.name),`${at}: ${row.name}`);
    }
  }
});

check('Lv 5: a real Lv 5 setup. Mocking Blade opens Overhead Slam until Rage Burst; Rage Burst joins at its slot',()=>{
  for(const [role,team] of CASES){
    const p=plan(5,role,team);
    assert.deepEqual(p.skillBar.stacks.B.skills.map(cell=>cell.name),['Mocking Blade','Overhead Slam','Rending Blow'],label(5,role,team));
    const stand=p.skillBar.stacks.B.skills[0];
    assert.equal(stand.why.includes('Overhead Slam'),true,'The stand-in says what it opens');
    assert.match(stand.why,/until Rage Burst/);
    assert.equal(p.skillBar.mainAttack,'Keen Strike');
    assert.ok(p.skillBar.later.some(item=>item.name==='Rage Burst'),'Rage Burst comes later');
    assert.ok(p.setup.stigmas.every(slot=>!slot.open),'No stigma slot at Lv 5');
  }
  // The stand-in goes the level Rage Burst is slotted: Lv 22 for DPS, Lv 27 for a main tank (Focused Block takes slot 1).
  assert.equal(plan(22,'dps',null).skillBar.stacks.B.skills[0].name,'Rage Burst');
  assert.equal(plan(22,'tank','main-tank').skillBar.stacks.B.skills[0].name,'Mocking Blade');
  assert.equal(plan(27,'tank','main-tank').skillBar.stacks.B.skills[0].name,'Rage Burst');
  // Lv 1: Overhead Slam is not out yet (Lv 4), so the line is Rending Blow alone, and nothing is opened for nothing.
  assert.deepEqual(plan(1,'dps',null).skillBar.stacks.B.skills.map(cell=>cell.name),['Rending Blow']);
});

check('own keys never move as the Daeva levels: a skill still to come keeps its key free',()=>{
  for(const [role,team] of CASES){
    const keyOf=(p,name)=>p.skillBar.left.find(key=>p.skillBar.stacks[key].skills.some(cell=>cell.name===name)||p.skillBar.stacks[key].reserved?.includes(name));
    const top=plan(45,role,team);
    for(const level of LEVELS){
      const p=plan(level,role,team);
      for(const key of top.skillBar.left)for(const cell of top.skillBar.stacks[key].skills)assert.equal(keyOf(p,cell.name),key,`${label(level,role,team)}: ${cell.name} on key ${key}`);
    }
  }
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const [role,team] of CASES)for(const level of LEVELS){
    const p=plan(level,role,team);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`${label(level,role,team)}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`${label(level,role,team)}: ${step.name} carries a reason`);
      const train=skills.records.find(item=>item.class==='Gladiator'&&item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${label(level,role,team)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
  const capped=structuredClone(astrix);
  capped.profile.level=45;
  for(const skill of capped.skills)if(['Overhead Slam','Rending Blow','Keen Strike','Ruinous Blow'].includes(skill.name))Object.assign(skill,{acquired:true,skillLevel:CAP});
  const p=buildAscentPlan({className:'Gladiator',role:'tank',team:'main-tank',data:data('Gladiator'),model:capped});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>['Overhead Slam','Rending Blow','Keen Strike','Ruinous Blow'].includes(step.name)),'Capped skills get no step');
  assert.deepEqual(p.mastery.atCap.map(item=>item.name).sort(),['Keen Strike','Overhead Slam','Rending Blow','Ruinous Blow']);
});

check('real skill levels drive the Mastery order',()=>{
  const at=levels=>{
    const live=structuredClone(astrix);
    live.profile.level=30;
    for(const skill of live.skills)if(skill.name in levels)Object.assign(skill,{acquired:true,skillLevel:levels[skill.name]});
    return buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:live}).mastery.spend;
  };
  // Keen Strike one level from its Lv 8 slot moves up the order, and says why.
  const near=at({'Keen Strike':7,'Rending Blow':1,'Overhead Slam':1});
  const low=at({'Keen Strike':1,'Rending Blow':1,'Overhead Slam':1});
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  assert.ok(rank(near,'Keen Strike')<rank(low,'Keen Strike'),`Keen Strike at 7 ranks ${rank(near,'Keen Strike')+1}, at 1 ranks ${rank(low,'Keen Strike')+1}`);
  assert.match(near.find(step=>step.name==='Keen Strike').why,/One level from its Specialty slot 1/);
  const far=at({'Keen Strike':1,'Rending Blow':1,'Overhead Slam':7});
  assert.equal(far[0].name,'Overhead Slam');
  assert.notDeepEqual(near.map(step=>step.name),far.map(step=>step.name),'Different levels, different order');
  // A skill past its slot aims for the next one, from the level it has.
  const step=at({'Rending Blow':9}).find(item=>item.name==='Rending Blow');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level, role and team each change the setup',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level]);
  // Level: every level in the list gives a different setup for each case.
  for(const [role,team] of CASES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role,team))));
    assert.ok(seen.size>=6,`${role} ${team}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  // Role: DPS and tank differ at Lv 5, 22 and 45.
  for(const level of [5,22,45])assert.notEqual(key(plan(level,'dps',null)),key(plan(level,'tank','solo')),`Lv ${level}: role`);
  // Team: the main tank slots Focused Block first (its block buff counts), the off-tank and solo slot Rage Burst first.
  const first=(team)=>plan(22,'tank',team).setup.stigmas[0].name;
  assert.deepEqual([first('main-tank'),first('off-tank-templar'),first('solo')],['Focused Block','Rage Burst','Rage Burst']);
  assert.match(plan(22,'tank','main-tank').setup.stigmas[0].why,/party/);
  // and Experienced Counterstrike ranks higher where its party buff counts.
  const counter=team=>plan(22,'tank',team).mastery.spend.findIndex(step=>step.name==='Experienced Counterstrike');
  assert.ok(counter('main-tank')>=0&&counter('main-tank')<counter('off-tank-templar')&&counter('main-tank')<counter('solo'),`ranks ${counter('main-tank')}, ${counter('off-tank-templar')}, ${counter('solo')}`);
  for(const level of [22,45])assert.notEqual(key(plan(level,'tank','main-tank')),key(plan(level,'tank','off-tank-templar')),`Lv ${level}: team`);
  // Specialty: the tank's Rending Blow Lv 8 pick is Block in a main tank, mobile when solo (no party to buff).
  const rending=team=>plan(45,'tank',team).skills.find(skill=>skill.name==='Rending Blow').picks.find(pick=>pick.skillLevel===8).pick;
  assert.deepEqual([rending('main-tank'),rending('solo')],['+200 Block while using it','Becomes a mobile skill']);
});

check('Next at Lv N: one change with its reason, never at or below the level, none at the cap',()=>{
  for(const [role,team] of CASES)for(const level of LEVELS){
    const p=plan(level,role,team);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`${label(level,role,team)}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.ok(p.nextAt.text.length>10);
    // The next level's setup really differs from this one in what the line says.
    const later=plan(p.nextAt.level,role,team);
    assert.notEqual(JSON.stringify([later.setup.line,later.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),later.skillBar.left.map(key=>later.skillBar.stacks[key].skills.map(cell=>cell.name)),later.setup.daevanion.open]),
      JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.skillBar.left.map(key=>p.skillBar.stacks[key].skills.map(cell=>cell.name)),p.setup.daevanion.open]),`${label(level,role,team)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([plan(1,'dps',null).nextAt.level,plan(5,'dps',null).nextAt.level,plan(12,'dps',null).nextAt.level,plan(22,'dps',null).nextAt.level],[4,10,14,27]);
  assert.match(plan(12,'dps',null).nextAt.text,/Ruinous Blow/);
  assert.match(plan(22,'dps',null).nextAt.text,/Stigma slot 2 opens: put Lunge Stance in it/);
});

check('the first move follows the plan',()=>{
  for(const [role,team] of CASES)for(const level of LEVELS){
    const p=plan(level,role,team);
    const first=p.now[0];
    if(!first)continue;
    // A level move names the Mastery list's first skill; a bar move names the line on the bar.
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
    if(/^Set your/.test(first.title))assert.ok(first.title.endsWith(p.skillBar.stacks.B.skills.map(cell=>cell.name).join(', ')));
  }
  const live=buildAscentPlan({className:'Gladiator',role:'dps',data:data('Gladiator'),model:astrix});
  const move=live.now.find(item=>/^Level /.test(item.title));
  assert.equal(move.title,`Level ${live.mastery.spend[0].name} (now Lv ${live.mastery.spend[0].from})`);
  const bar=live.now.find(item=>/^Set your/.test(item.title));
  assert.equal(bar.title,`Set your main line: ${live.skillBar.stacks.B.skills.map(cell=>cell.name).join(', ')}`);
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const board=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
  const live=structuredClone(astrix);
  live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:board}:item));
  for(const [role,team] of CASES)for(const points of [0,3,10,40,null]){
    const p=buildAscentPlan({className:'Gladiator',role,team,data:data('Gladiator'),model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    assert.ok(route,'A route with the board read');
    if(points!==null)assert.ok(route.plannedCost<=points,`${role} ${team}: ${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`${role} ${team}: inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const step of route.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
  }
  // The engine directly: a budget of 415 with 300 spent leaves 115, and 20 points in hand cap it at 20.
  const priorities=routePriorities(builds.Gladiator.records.find(build=>build.role==='tank').daevanion);
  const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:board}],priorities,budget:{points:415,boardCost:{}},have:20});
  assert.ok(routed.plannedCost<=20);
  assert.equal(routed.have,20);
  // By hand at Lv 12 the first board and the skill nodes the Daeva has now; Ruinous Blow's node waits for the skill (Lv 14).
  const hand=plan(12,'tank','solo').setup.daevanion;
  assert.equal(hand.board.name,'Nezekan');
  assert.ok(hand.now.includes('Overhead Slam'));
  assert.ok(hand.waits.includes('Ruinous Blow'));
  assert.equal(plan(5,'dps',null).setup.daevanion.board,null);
  assert.equal(plan(5,'dps',null).setup.daevanion.firstLevel,12);
});

check('logic over copying: every rejected trend says why; the line trends with own-key skills are rejected',()=>{
  const p=plan(45,'dps',null);
  const trends=p.setup.trends;
  for(const item of trends){assert.ok(item.count,`${item.id}: count`);assert.ok(item.verdict,`${item.id}: verdict`);assert.equal(item.status,'reported');}
  const byId=Object.fromEntries(trends.map(item=>[item.id,item]));
  for(const id of ['line-ruinous','line-lunge','line-zikel','line-sword-aura']){
    assert.equal(byId[id].used,false,id);
    assert.match(byId[id].verdict,/own key/,id);
  }
  assert.equal(byId['stigma-rage-burst'].used,true);
  assert.equal(byId['stigma-zikel-first'].used,false,'An editorial Zikel first at Lv 22 is rejected');
  assert.match(byId['stigma-zikel-first'].verdict,/Slot 1 takes Rage Burst/);
  assert.equal(byId['mastery-overhead-first'].used,true,'At 45 Overhead Slam is levelled first, as 58 of 100 builds do');
  // Early on the logic agrees with the levelling guides: Rending Blow first, before Rage Burst makes Overhead Slam strong.
  assert.equal(plan(12,'dps',null).setup.trends.find(item=>item.id==='mastery-keen-rending-early').used,true);
  // Specialty: the DPS build's own Ruinous Blow Lv 8 pick (faster speed) loses to +30% crit, which is worth more damage.
  const ruinous=p.skills.find(skill=>skill.name==='Ruinous Blow').picks.find(pick=>pick.skillLevel===8);
  assert.deepEqual([ruinous.pick,ruinous.over],['+30% skill Critical Hit','Faster skill speed']);
  // Every choice carries a one-line reason: stigma slots, bar rows the planner placed, Mastery steps, Specialty picks.
  for(const [role,team] of CASES){
    const q=plan(45,role,team);
    for(const slot of q.setup.stigmas)assert.ok(slot.why,`${role} ${team}: slot ${slot.slot}`);
    for(const step of q.mastery.spend)assert.ok(step.why);
    for(const skill of q.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
  }
});

check('data: every Gladiator skill has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  for(const record of skills.records.filter(item=>item.class==='Gladiator')){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...(Array.isArray(record.specialties)?record.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[–—]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|grobmotoriker/i);
    }
    for(const link of record.synergies.filter(item=>item.type==='opens'))assert.ok(skills.records.some(item=>item.class==='Gladiator'&&item.name===link.target),`${record.name} opens ${link.target}`);
  }
  for(const build of builds.Gladiator.records){
    const refs=new Set(build.provenance.map(source=>source.ref));
    for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
    for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    assert.ok(weightsFor(build,null).weights.damage>0);
  }
});

check('no class-specific code: the planner reads only data, and the other seven classes run on today\'s data',()=>{
  const source=readFileSync(new URL('games/aion2/engine/level-planner.mjs',root),'utf8');
  assert.doesNotMatch(source,/Gladiator|Templar|Assassin|Ranger|Sorcerer|Spiritmaster|Cleric|Chanter|Rage Burst|Overhead Slam|Mocking Blade/,'No class or skill names in the planner');
  for(const name of AION2_CLASSES.filter(item=>!builds[item].records.some(build=>build.ascent)))for(const role of rolesFor(builds[name]))for(const level of LEVELS){
    const p=buildAscentPlan({className:name,role:role.role,level,data:data(name)});
    if(p.pending)continue;
    assert.deepEqual(p.skillBar?.problems??[],[],`${name} ${role.role} Lv ${level}: bar checks`);
    for(const cell of p.skillBar?cells(p.skillBar):[])assert.equal(cell.locked,false,`${name} ${role.role} Lv ${level}: ${cell.name} locked`);
    // A class with its own ascent record is planned, and its own test file checks it (Assassin: test-aetherium-level-assassin.mjs).
    if(builds[name].records.some(build=>build.ascent)){assert.equal(p.setup.planned,true,`${name}: ascent record`);continue;}
    assert.equal(p.setup.planned,false,`${name}: no ascent record yet`);
    const order=p.mastery.spend.map(step=>step.priority);
    assert.deepEqual(order,[...order].sort((a,b)=>a-b),`${name}: the build's own priority order`);
    // The stigma slots keep the build's order.
    const slots=builds[name].records.find(build=>build.role===role.role).stigmas;
    if(slots&&!slots.pending)assert.deepEqual(p.stigmas.slots.map(slot=>slot.name),slots.slots.map(slot=>slot.name),`${name}: slot order`);
  }
  // planLevelSetup with no ascent record says it has no plan of its own.
  const templar={...builds.Templar.records.find(build=>build.main),ascent:undefined};
  const setup=planLevelSetup({build:templar,team:null,catalogue:new Map(),icons:new Map(),level:30,model:null,facts:{},cap:45});
  assert.equal(setup.planned,false);
  assert.equal(setup.confirmed,false);
});

/* The screens (Playwright, a local static server, the Worker mocked from the fixtures: never NCSOFT, never the real Worker).
   Every Ascent Plan screen and the Daeva Card show the setup for now and one Next at Lv N line; the Skill Bar and Copy this
   bar list only what can be placed now, the rest in Comes later; level, role and team each change the screens; the 13px
   floor and 44px targets hold on the new parts; no sideways scroll at 390. AE_SHOTS=<dir outside the repo> saves the
   Skill Bar and Mastery at Lv 5, 22 and 45 for DPS and the main tank, at 1600 and 390. */
if(process.env.AE_BROWSER!=='0'){
  const {createServer}=await import('node:http');
  const {readFile}=await import('node:fs/promises');
  const {createRequire}=await import('node:module');
  const {resolve,extname,sep}=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
  const site=resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
  const server=createServer(async(req,res)=>{
    const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
    let file=resolve(site,'.'+path);
    if(!file.startsWith(site+sep)&&file!==site){res.writeHead(403).end();return;}
    if(path.endsWith('/'))file=resolve(file,'index.html');
    try {const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
    catch {res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base=`http://127.0.0.1:${server.address().port}`;
  const WORKER='https://aion2-mock.invalid';
  const info=fx('astrix285-info'),equipment=fx('astrix285-equipment'),board=fx('astrix285-daevanion-11');
  info.profile.characterName='TESTDAEVA';
  const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
  const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
  const browser=await chromium.launch();
  const real=[];
  const bcheck=async(name,fn)=>{try{await fn();console.log(`  ok   ${name}`);}catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};
  async function open(path,{live=false,viewport={width:1600,height:1000}}={}){
    const context=await browser.newContext({viewport});
    await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
      const response=await route.fetch();
      const body=(await response.text()).replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
      await route.fulfill({response,body});
    });
    await context.route(`${WORKER}/**`,route=>{
      const url=new URL(route.request().url());
      const bodies={'/aion2/character':{info,equipment},'/aion2/daevanion':board};
      const body=bodies[url.pathname];
      if(!body)return route.fulfill({status:404,body:'{}'});
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta})});
    });
    await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
    await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
    await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{real.push(route.request().url());return route.abort();});
    // The first-visit guides stay closed so the screens are seen as a returning player sees them.
    await context.addInitScript(()=>{try{localStorage.setItem('aetherium.guides.v1',JSON.stringify({plan:true,card:true}));}catch{}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}${path}`);
    await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
    if(path.includes('/ascent/'))await page.waitForFunction(()=>document.documentElement.dataset.aeBoards==='read',null,{timeout:15000});
    return {page,context,errors};
  }
  const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();
  const screen=(query,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?${query}`;
  const q=(level,role,team)=>`class=gladiator&role=${role}${team?`&team=${team}`:''}&level=${level}`;
  const VIEWS=['','mastery','skill-bar','stigma','daevanion','macro','stats'];

  await bcheck('every Ascent Plan screen shows the setup for now and one Next at Lv N line, with REPORTED tagged',async()=>{
    for(const view of VIEWS){
      const {page,context,errors}=await open(screen(q(5,'dps'),view));
      assert.equal(await page.locator('#aeSetup').count(),1,`${view||'menu'}: the setup`);
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      assert.deepEqual(await page.$$eval('#aeSetup [data-setup]',items=>items.map(el=>el.dataset.setup)),['line','stigmas','mastery','daevanion','stats']);
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),'Mocking Blade, Overhead Slam, Rending Blow');
      assert.equal(await plain(page,'#aeSetup [data-setup="stigmas"] dd'),'From Lv 22: Rage Burst');
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 10 Rush Strike joins the movement key\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),1,'REPORTED tagged');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar and Copy this bar: only what can be placed now; the rest in Comes later',async()=>{
    for(const [level,role,team] of [[5,'dps',null],[22,'tank','main-tank'],[45,'dps',null]]){
      const {page,context}=await open(screen(q(level,role,team),'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      if(level===45)assert.equal(later.length,0,'Nothing comes later at 45');
      else assert.ok(later.length>0);
      // keys 1 to 8, then left click and the main line (the #511 layout)
      assert.deepEqual(await page.$$eval('#aeLeftBlock [data-bar-col]',items=>items.map(el=>el.dataset.barCol)),['1','2','3','4','5','6','7','8']);
      assert.deepEqual(await page.$$eval('#aeRightBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['LMB','B']);
      await context.close();
    }
  });

  await bcheck('level, role and team each change the screens',async()=>{
    const read=async query=>{
      const {page,context}=await open(screen(query,'skill-bar'));
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(',')].join('|'));
      await context.close();
      return out;
    };
    const lv5=await read(q(5,'dps')),lv22=await read(q(22,'dps')),lv45=await read(q(45,'dps'));
    assert.notEqual(lv5,lv22);assert.notEqual(lv22,lv45);
    const tank=await read(q(22,'tank','main-tank')),off=await read(q(22,'tank','off-tank-templar'));
    assert.notEqual(lv22,tank,'role');
    assert.notEqual(tank,off,'team');
    assert.match(tank,/Focused Block/);assert.match(off,/Rage Burst/);
  });

  await bcheck('Mastery says why each step comes first; Stigma says why each slot holds what it holds',async()=>{
    const m=await open(screen(q(22,'tank','main-tank'),'mastery'));
    const rows=await m.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
    assert.deepEqual(rows.slice(0,2),['Rending Blow','Experienced Counterstrike']);
    assert.match(await plain(m.page,'#aeMasteryWhy li:nth-child(2)'),/party/);
    // The numbers on the skill tiles are the same order, not the build's old priority list.
    const ranks=await m.page.$$eval('.ae-mskill-grid .ae-mskill',items=>items.filter(el=>el.querySelector('.ae-mskill-rank')).map(el=>[Number(el.querySelector('.ae-mskill-rank').textContent),el.dataset.mastery]).sort((x,y)=>x[0]-y[0]).map(item=>item[1]));
    assert.deepEqual(ranks,plan(22,'tank','main-tank').mastery.spend.map(step=>step.name));
    await m.context.close();
    const s=await open(screen(q(22,'tank','main-tank'),'stigma'));
    assert.match(await plain(s.page,'#aeStigmaWhy [data-stigma-why="0"]'),/^Slot 1 Focused Block: .*party/);
    assert.match(await plain(s.page,'#aeStigmaWhy [data-stigma-why="1"]'),/^Slot 2, Lv 27 Rage Burst/);
    await s.context.close();
  });

  await bcheck('the Daeva Card shows the setup for now and one Next line; its first move is the plan\'s first move',async()=>{
    const ref=`serverId=1308&characterId=${encodeURIComponent(info.profile.characterId)}&region=eu`;
    const {page,context,errors}=await open(`/hub/aetherium/?${ref}`,{live:true});
    await page.waitForSelector('#aeFirstMove.is-ready');
    await page.waitForSelector('#aeCardSetup:not([hidden])');
    const model=module.normaliseCharacter({info:fx('astrix285-info'),equipment},{region:'eu',capturedOn:'2026-10-05'});
    const live=structuredClone(model);
    live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:adaptDaevanionBoard(board)}:item));
    const expected=buildAscentPlan({className:'Gladiator',data:data('Gladiator'),model:live});
    assert.equal(await plain(page,'#aeFirstMoveText'),expected.now[0].title,'The first move follows the plan');
    assert.match(await plain(page,'#aeCardSetup'),/^Your setup at Lv 12/);
    assert.equal(await plain(page,'#aeCardSetup [data-setup="line"] dd'),expected.setup.line[0].skills.join(', '));
    assert.equal(await page.locator('#aeCardSetup #aeNextAt').count(),1);
    assert.match(await plain(page,'#aeCardSetup #aeNextAt'),new RegExp(`^Next at Lv ${expected.nextAt.level} `));
    assert.deepEqual(errors,[]);
    await context.close();
  });

  await bcheck('new parts: nothing under 13px, 44px Comes later rows, no sideways scroll at 390',async()=>{
    for(const width of [390,1600]){
      const {page,context}=await open(screen(q(5,'tank','solo'),'skill-bar'),{viewport:{width,height:900}});
      const sizes=await page.$$eval('#aeSetup, #aeSetup *, #aeComesLater, #aeComesLater *, #aeNextAt, #aeNextAt *',items=>items.filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>[el.tagName,parseFloat(getComputedStyle(el).fontSize)]));
      assert.ok(sizes.every(([,size])=>size>=13),`${width}: ${JSON.stringify(sizes.filter(([,size])=>size<13))}`);
      const rows=await page.$$eval('#aeComesLater li',items=>items.map(el=>el.getBoundingClientRect().height));
      assert.ok(rows.length&&rows.every(height=>height>=44),`${width}: Comes later rows ${rows}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}: no sideways scroll`);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS){
    for(const [role,team,name] of [['dps',null,'dps'],['tank','main-tank','tank']])for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(q(level,role,team),view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`${view}-${name}-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_PLANNER=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_PLANNER=PASS');
