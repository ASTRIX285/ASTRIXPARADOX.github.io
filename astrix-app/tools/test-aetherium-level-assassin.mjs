#!/usr/bin/env node
// The level planner for the Assassin (brief feature/aetherium-level-assassin, 17 Oct 2026). Offline, no network.
//   For the Assassin at Lv 1, 5, 12, 22, 27, 32, 37 and 45 (DPS, its only role):
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken (stackProblems and the rest of the bar checks);
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level changes the setup; the role is DPS alone and the plan differs from another class's DPS plan;
//   - real skill levels drive the Mastery order (a synthetic Assassin made from the fixture, labelled as such);
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the data: values and synergies with a status and refs that resolve; no guide names, no dashes.
// AE_BROWSER=0 skips the page checks (they need Playwright). AE_SHOTS=<dir outside the repo> saves the Skill Bar and
// Mastery at Lv 5, 22 and 45 at 1600 and 390.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AION2_CLASSES,buildAscentPlan,rolesFor,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {weightsFor} from '../games/aion2/engine/level-planner.mjs';
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
const fixture=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
const ICONS=icons.Assassin.records[0].skills;
// SAMPLE DATA: the fixture's character turned into an Assassin with the skill levels a check needs. Never shown to a player.
const sampleAssassin=(level,levels)=>{
  const model=structuredClone(fixture);
  model.profile.class='Assassin';
  model.profile.level=level;
  model.skills=ICONS.map(skill=>({id:null,name:skill.name,icon:null,category:skill.category,needLevel:skill.needLevel,skillLevel:levels[skill.name]??(skill.needLevel<=level&&skill.category!=='Stigma'?1:0),acquired:skill.name in levels||(skill.needLevel<=level&&skill.category!=='Stigma'),equipped:skill.name in levels}));
  return model;
};

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const plan=(level,extra={})=>buildAscentPlan({className:'Assassin',role:'dps',level,data:data('Assassin'),...extra});
const label=level=>`Assassin dps Lv ${level}`;
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>ICONS.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const record=name=>skills.records.find(item=>item.class==='Assassin'&&item.name===name);
// En and em dash, by code point, so this file holds neither.
const DASHES=new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

check('the Assassin has one role, DPS, and it is planned from its ascent record',()=>{
  assert.deepEqual(rolesFor(builds.Assassin).map(role=>role.role),['dps']);
  const p=plan(22);
  assert.equal(p.setup.planned,true);
  assert.equal(p.setup.status,'reported','Trends from published builds: REPORTED');
  assert.deepEqual(p.setup.weights,{damage:3,enmity:0,survival:1,partyBuff:0,mp:1});
});

check('every level: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    const at=label(level);
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
    const top=plan(45);
    for(const cell of cells(top.skillBar))assert.ok(onBar.has(cell.name)||p.skillBar.later.some(item=>item.name===cell.name),`${at}: ${cell.name} is neither on the bar nor in Comes later`);
    // Every class active has a key from the level it unlocks: none is left off the bar.
    assert.deepEqual(p.skillBar.notOnBar.map(item=>item.name),[],`${at}: not on the bar`);
  }
});

check('every level: no stack rule broken, the macro holds only what is on the bar',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    const at=label(level);
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    assert.ok(p.macro.entries.length<=2);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(cells(p.skillBar).some(cell=>cell.name===row.name),`${at}: ${row.name}`);
    }
    // The main line ends on its always-ready filler, and nothing always ready sits below it.
    const line=p.skillBar.stacks.B.skills;
    assert.equal(line.at(-1).name,'Savage Roar',`${at}: Savage Roar last`);
    assert.equal(line.filter(cell=>cell.noCooldown&&!cell.conditional).length,1,`${at}: one always-ready row`);
    assert.equal(p.skillBar.stacks.A.skills.length,0,`${at}: one main line, as published builds run it`);
  }
});

check('the main line grows from the first level: Savage Roar, then Heart Gore, Insignia Explosion, Savage Fang',()=>{
  const line=level=>plan(level).skillBar.stacks.B.skills.map(cell=>cell.name);
  assert.deepEqual(line(1),['Savage Roar']);
  assert.deepEqual(line(5),['Heart Gore','Savage Roar']);
  assert.deepEqual(line(12),['Heart Gore','Savage Roar']);
  assert.deepEqual(line(14),['Insignia Explosion','Heart Gore','Savage Roar']);
  assert.deepEqual(line(22),['Insignia Explosion','Heart Gore','Savage Roar']);
  assert.deepEqual(line(32),['Savage Fang','Insignia Explosion','Heart Gore','Savage Roar']);
  assert.deepEqual(line(45),['Savage Fang','Insignia Explosion','Heart Gore','Savage Roar']);
  for(const level of LEVELS)assert.equal(plan(level).skillBar.mainAttack,'Quick Slice');
  assert.ok(plan(22).skillBar.later.some(item=>item.name==='Savage Fang'&&item.unlockLevel===32),'Savage Fang joins with its slot at Lv 32');
  assert.match(plan(5).skillBar.stacks.B.skills[0].condition,/critical hit/);
});

check('own keys never move as the Daeva levels: a skill still to come keeps its key free',()=>{
  const keyOf=(p,name)=>p.skillBar.left.find(key=>p.skillBar.stacks[key].skills.some(cell=>cell.name===name)||p.skillBar.stacks[key].reserved?.includes(name));
  const top=plan(45);
  for(const level of LEVELS){
    const p=plan(level);
    for(const key of top.skillBar.left)for(const cell of top.skillBar.stacks[key].skills)assert.equal(keyOf(p,cell.name),key,`${label(level)}: ${cell.name} on key ${key}`);
  }
});

check('stigmas: Illusive Clone, Swift Contract, Savage Fang, Triniel\'s Dagger by hand; each slot says why',()=>{
  assert.deepEqual(plan(45).setup.stigmas.map(slot=>slot.name),['Illusive Clone','Swift Contract','Savage Fang',"Triniel's Dagger"]);
  for(const level of LEVELS){
    const p=plan(level);
    for(const slot of p.setup.stigmas){assert.ok(slot.why,`${label(level)}: slot ${slot.slot}`);assert.equal(slot.open,level>=slot.slotLevel);}
  }
  assert.ok(plan(5).setup.stigmas.every(slot=>!slot.open),'No stigma slot at Lv 5');
  // With Triniel's Dagger at stigma Lv 10 its cooldown cut counts, and it moves up the order.
  const live=sampleAssassin(45,{"Triniel's Dagger":10,'Illusive Clone':1,'Swift Contract':1,'Savage Fang':1});
  const names=buildAscentPlan({className:'Assassin',role:'dps',data:data('Assassin'),model:live}).setup.stigmas.map(slot=>slot.name);
  assert.deepEqual(names,['Illusive Clone',"Triniel's Dagger",'Swift Contract','Savage Fang']);
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    assert.ok(p.mastery.spend.length>0,`${label(level)}: something to level`);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`${label(level)}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`${label(level)}: ${step.name} carries a reason`);
      assert.ok(unlockOf(step.name)<=level,`${label(level)}: ${step.name} is not learned yet`);
      const train=record(step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${label(level)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
  const capped=sampleAssassin(45,{'Heart Gore':CAP,'Insignia Explosion':CAP,'Quick Slice':CAP,'Savage Roar':CAP});
  const p=buildAscentPlan({className:'Assassin',role:'dps',data:data('Assassin'),model:capped});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>['Heart Gore','Insignia Explosion','Quick Slice','Savage Roar'].includes(step.name)),'Capped skills get no step');
  assert.deepEqual(p.mastery.atCap.map(item=>item.name).sort(),['Heart Gore','Insignia Explosion','Quick Slice','Savage Roar']);
});

check('Mastery from the first level: Quick Slice first while you level, Insignia Explosion from 14, Heart Gore once Illusive Clone is slotted',()=>{
  const first=level=>plan(level).mastery.spend[0].name;
  assert.deepEqual([1,5,12].map(first),['Quick Slice','Quick Slice','Quick Slice']);
  assert.equal(first(14),'Insignia Explosion');
  assert.deepEqual([22,27,32,37,45].map(first),['Heart Gore','Heart Gore','Heart Gore','Heart Gore','Heart Gore']);
  assert.notEqual(plan(21).mastery.spend[0].name,'Heart Gore','Heart Gore leads only once Illusive Clone is in a slot');
  // Exploit Weakness, a passive, is levelled from Lv 6; the passives worth less are not.
  assert.ok(plan(12).mastery.spend.some(step=>step.name==='Exploit Weakness'));
  assert.ok(!plan(45).mastery.spend.some(step=>['Rear Smite','Assault Stance','Apply Poison'].includes(step.name)));
});

check('real skill levels drive the Mastery order',()=>{
  const at=levels=>buildAscentPlan({className:'Assassin',role:'dps',data:data('Assassin'),model:sampleAssassin(30,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  const near=at({'Savage Roar':7,'Heart Gore':1,'Quick Slice':1,'Insignia Explosion':1});
  const low=at({'Savage Roar':1,'Heart Gore':1,'Quick Slice':1,'Insignia Explosion':1});
  assert.ok(rank(near,'Savage Roar')<rank(low,'Savage Roar'),`Savage Roar at 7 ranks ${rank(near,'Savage Roar')+1}, at 1 ranks ${rank(low,'Savage Roar')+1}`);
  assert.match(near.find(step=>step.name==='Savage Roar').why,/One level from its Specialty slot 1/);
  assert.notDeepEqual(near.map(step=>step.name),low.map(step=>step.name),'Different levels, different order');
  const step=at({'Quick Slice':9}).find(item=>item.name==='Quick Slice');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level changes the setup; the plan is the Assassin\'s own, not another class\'s',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level]);
  const seen=new Set(LEVELS.map(level=>key(plan(level))));
  assert.ok(seen.size>=7,`${seen.size} different setups over ${LEVELS.length} levels`);
  for(const level of [5,22,45])assert.notEqual(key(plan(level)),key(buildAscentPlan({className:'Gladiator',role:'dps',level,data:data('Gladiator')})),`Lv ${level}: the class`);
});

check('Next at Lv N: one change with its reason, never at or below the level, none at the cap',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`${label(level)}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.ok(p.nextAt.text.length>10);
    const later=plan(p.nextAt.level);
    const shape=q=>JSON.stringify([q.setup.line,q.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),q.skillBar.left.map(key=>q.skillBar.stacks[key].skills.map(cell=>cell.name)),q.setup.daevanion.open]);
    assert.notEqual(shape(later),shape(p),`${label(level)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([1,5,12,22,27,32,37].map(level=>plan(level).nextAt.level),[3,7,14,27,30,37,40]);
  assert.match(plan(12).nextAt.text,/Insignia Explosion joins the main line/);
  assert.match(plan(22).nextAt.text,/Stigma slot 2 opens: put Swift Contract in it/);
});

check('the first move follows the plan',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    const first=p.now[0];
    if(!first)continue;
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
    if(/^Set your/.test(first.title))assert.ok(first.title.endsWith(p.skillBar.stacks.B.skills.map(cell=>cell.name).join(', ')));
  }
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  // The board is the fixture's Nezekan board (a Gladiator's): its stat nodes stand in for the route check only.
  const board=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
  const live=sampleAssassin(30,{});
  live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:board}:item));
  for(const points of [0,3,10,40,null]){
    const p=buildAscentPlan({className:'Assassin',role:'dps',data:data('Assassin'),model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    assert.ok(route,'A route with the board read');
    if(points!==null)assert.ok(route.plannedCost<=points,`${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const step of route.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
  }
  const priorities=routePriorities(builds.Assassin.records[0].daevanion);
  assert.deepEqual(priorities[0].skills,['Heart Gore','Quick Slice','Insignia Explosion','Savage Roar']);
  const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:board}],priorities,budget:{points:415,boardCost:{}},have:20});
  assert.ok(routed.plannedCost<=20);
  // By hand at Lv 12: the first board and the skill nodes the Daeva has now; Insignia Explosion's node waits (Lv 14).
  const hand=plan(12).setup.daevanion;
  assert.equal(hand.board.name,'Nezekan');
  assert.deepEqual(hand.now,['Heart Gore','Quick Slice','Savage Roar']);
  assert.deepEqual(hand.waits,['Insignia Explosion']);
  assert.equal(plan(5).setup.daevanion.board,null);
  assert.equal(plan(5).setup.daevanion.firstLevel,12);
});

check('logic over copying: every rejected trend says why',()=>{
  const p=plan(45);
  const byId=Object.fromEntries(p.setup.trends.map(item=>[item.id,item]));
  for(const item of p.setup.trends){assert.ok(item.count,`${item.id}: count`);assert.ok(item.verdict,`${item.id}: verdict`);assert.equal(item.status,'reported');}
  for(const id of ['line-quick-slice','line-illusive-clone','line-ambush','line-whirlwind','line-storm-rampage','line-triniel']){
    assert.equal(byId[id].used,false,id);
    assert.match(byId[id].verdict,/own key/,id);
  }
  for(const id of ['stigma-illusive-clone','stigma-swift-contract','stigma-savage-fang','stigma-triniel','stigma-illusive-first','mastery-heart-gore-first'])assert.equal(byId[id].used,true,id);
  assert.equal(byId['stigma-evasion-stance'].used,false);
  assert.match(byId['stigma-evasion-stance'].verdict,/^Ranked 5/);
  assert.equal(byId['stigma-triniel-first'].used,false);
  assert.match(byId['stigma-triniel-first'].verdict,/Slot 1 takes Illusive Clone/);
  // Early on the logic agrees with the levelling builds (Quick Slice first); at 14 Insignia Explosion comes first.
  assert.equal(plan(12).setup.trends.find(item=>item.id==='mastery-quick-slice-early').used,true);
  const at14=plan(14).setup.trends.find(item=>item.id==='mastery-quick-slice-early');
  assert.equal(at14.used,false);
  assert.match(at14.verdict,/^Insignia Explosion comes first now/);
  // Specialty: the most common Heart Gore Lv 8 pick (HP absorb) loses to +20% crit, which fires Heart Gore more.
  const gore=p.skills.find(skill=>skill.name==='Heart Gore').picks.find(pick=>pick.skillLevel===8);
  assert.deepEqual([gore.pick,gore.over],['Up to 20% more crit with fewer targets','Absorbs HP on hit']);
  const blast=p.skills.find(skill=>skill.name==='Insignia Explosion').picks.find(pick=>pick.skillLevel===8);
  assert.deepEqual([blast.pick,blast.over],['50% Multi-Hit',undefined]);
  for(const slot of p.setup.stigmas)assert.ok(slot.why);
  for(const step of p.mastery.spend)assert.ok(step.why);
  for(const skill of p.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
});

check('the stacks are checked against published builds (no stacks-unverified tag); the layout stays REPORTED',()=>{
  const p=plan(45);
  assert.equal(p.skillBar.verified,true);
  assert.equal(p.macro.verified,true);
  assert.equal(p.skillBar.status,'reported','REPORTED: from published builds, not seen in game');
});

check('data: every Assassin skill has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  const records=skills.records.filter(item=>item.class==='Assassin');
  for(const name of ['Quick Slice','Savage Roar','Heart Gore','Insignia Explosion','Illusive Clone','Swift Contract','Savage Fang',"Triniel's Dagger",'Exploit Weakness'])assert.ok(records.some(item=>item.name===name),name);
  for(const item of records){
    assert.ok(Array.isArray(item.values)&&item.values.length,`${item.name}: values`);
    assert.ok(Array.isArray(item.synergies),`${item.name}: synergies`);
    const refs=new Set(item.provenance.map(source=>source.ref));
    for(const entry of [...item.values,...item.synergies,...(Array.isArray(item.specialties)?item.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(entry.status),`${item.name}: ${entry.text}`);
      for(const ref of entry.refs)assert.ok(refs.has(ref),`${item.name}: ref ${ref}`);
      assert.doesNotMatch(entry.text,DASHES);
      assert.doesNotMatch(entry.text,/questlog|MetaBot|grobmotoriker/i);
    }
    for(const value of item.values.filter(entry=>entry.needs))assert.ok(records.some(other=>other.name===value.needs),`${item.name} needs ${value.needs}`);
    for(const link of item.synergies.filter(entry=>entry.type==='opens'))assert.ok(records.some(other=>other.name===link.target),`${item.name} opens ${link.target}`);
    // Every active's trainer table is from the tooltip: Lv 8 and Lv 10 never before the skill unlocks.
    const icon=ICONS.find(skill=>skill.name===item.name);
    if(item.training){assert.ok(icon,`${item.name}: in the icon list`);assert.ok(item.training['8']>=icon.needLevel&&item.training['10']>=item.training['8'],item.name);}
    else assert.notEqual(icon?.category,'Active',`${item.name}: an active with no training table`);
  }
  const build=builds.Assassin.records[0];
  const refs=new Set(build.provenance.map(source=>source.ref));
  for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
  for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),pref.id);
  assert.ok(weightsFor(build,null).weights.damage>0);
  assert.doesNotMatch(JSON.stringify(build),DASHES);
});

/* The screens (Playwright, a local static server, the Worker never called). Every Ascent Plan screen shows the setup for now
   and one Next at Lv N line; the Skill Bar lists only what can be placed now; level changes the screens; REPORTED is tagged;
   no "Not confirmed yet" on the stacks; no sideways scroll at 390. */
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
  const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
  const browser=await chromium.launch();
  const real=[];
  const bcheck=async(name,fn)=>{try{await fn();console.log(`  ok   ${name}`);}catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};
  async function open(path,{viewport={width:1600,height:1000}}={}){
    const context=await browser.newContext({viewport});
    await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
      const response=await route.fetch();
      const body=(await response.text()).replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,'export const AETHERIUM_WORKER_URL = null;');
      await route.fulfill({response,body});
    });
    await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
    await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
    await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{real.push(route.request().url());return route.abort();});
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
  const screen=(level,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?class=assassin&role=dps&level=${level}`;
  const VIEWS=['','mastery','skill-bar','stigma','daevanion','macro','stats'];

  await bcheck('every Ascent Plan screen shows the Assassin setup for now and one Next at Lv N line, with REPORTED tagged',async()=>{
    for(const view of VIEWS){
      const {page,context,errors}=await open(screen(5,view));
      assert.equal(await page.locator('#aeSetup').count(),1,`${view||'menu'}: the setup`);
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),'Heart Gore, Savage Roar');
      assert.equal(await plain(page,'#aeSetup [data-setup="stigmas"] dd'),'From Lv 22: Illusive Clone');
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 Whirlwind Slice goes on its own key\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),0,'REPORTED tagged');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar: only what can be placed now, the rest in Comes later; no stacks-unverified tag, the REPORTED layout tag stays',async()=>{
    for(const level of [5,22,45]){
      const {page,context}=await open(screen(level,'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      if(level===45)assert.equal(later.length,0,'Nothing comes later at 45');
      else assert.ok(later.length>0);
      assert.deepEqual(await page.$$eval('#aeRightBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['LMB','B'],'Left click, then the main line on right click (Defiance is on Space, so Infiltrate fits on a number key)');
      assert.equal(await page.locator('[data-bar-keycap="B"].is-mouse').count(),1,'The main line on right click');
      assert.equal(await page.locator('[data-status-tag="stacks-unverified"]').count(),0,`Lv ${level}: no stacks-unverified tag`);
      assert.equal(await page.locator('#aeStackRule [data-status-tag="bar-layout"]').count(),0,`Lv ${level}: the layout is REPORTED, so it keeps its tag`);
      await context.close();
    }
  });

  await bcheck('level changes the screens; the class changes them too',async()=>{
    const read=async path=>{
      const {page,context}=await open(path);
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(',')].join('|'));
      await context.close();
      return out;
    };
    const lv5=await read(screen(5,'skill-bar')),lv22=await read(screen(22,'skill-bar')),lv45=await read(screen(45,'skill-bar'));
    assert.notEqual(lv5,lv22);assert.notEqual(lv22,lv45);
    assert.match(lv22,/Illusive Clone/);assert.doesNotMatch(lv5,/Illusive Clone,/);
    const glad=await read('/hub/aetherium/ascent/skill-bar/?class=gladiator&role=dps&level=22');
    assert.notEqual(lv22,glad,'class');
  });

  await bcheck('Mastery says why each step comes first; the tile numbers follow the same order',async()=>{
    const m=await open(screen(22,'mastery'));
    const rows=await m.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
    assert.deepEqual(rows.slice(0,2),plan(22).mastery.spend.slice(0,2).map(step=>step.name));
    const ranks=await m.page.$$eval('.ae-mskill-grid .ae-mskill',items=>items.filter(el=>el.querySelector('.ae-mskill-rank')).map(el=>[Number(el.querySelector('.ae-mskill-rank').textContent),el.dataset.mastery]).sort((x,y)=>x[0]-y[0]).map(item=>item[1]));
    assert.deepEqual(ranks,plan(22).mastery.spend.map(step=>step.name));
    await m.context.close();
  });

  await bcheck('no sideways scroll at 390, nothing under 13px in the new parts',async()=>{
    for(const width of [390,1600])for(const view of ['skill-bar','mastery']){
      const {page,context}=await open(screen(5,view),{viewport:{width,height:900}});
      const sizes=await page.$$eval('#aeSetup, #aeSetup *, #aeNextAt, #aeNextAt *',items=>items.filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>[el.tagName,parseFloat(getComputedStyle(el).fontSize)]));
      assert.ok(sizes.every(([,size])=>size>=13),`${width} ${view}: ${JSON.stringify(sizes.filter(([,size])=>size<13))}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width} ${view}: no sideways scroll`);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS){
    for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(level,view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`assassin-${view}-dps-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_ASSASSIN=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_ASSASSIN=PASS');
