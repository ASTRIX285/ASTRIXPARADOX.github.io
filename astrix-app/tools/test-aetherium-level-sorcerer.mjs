#!/usr/bin/env node
// The level planner for the Sorcerer (brief feature/aetherium-level-sorcerer, 17 Oct 2026). Offline, no network.
//   For the Sorcerer at Lv 1, 5, 12, 22, 27, 32, 37 and 45, in every role the class has (DPS):
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken (stackProblems and the rest of the bar checks);
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level and role each change the setup (a role the class does not play falls back to DPS and says so);
//   - logic over copying: every trend carries a count and the logic's verdict; every choice carries a reason;
//   - the data: every Sorcerer skill has values and synergies with a status and refs that resolve.
// The other classes are checked by test-aetherium-level-planner.mjs. AE_BROWSER=0 skips the page checks (Playwright).
// AE_SHOTS=<dir outside the repo> saves the Skill Bar and Mastery at Lv 5, 22 and 45 at 1600 and 390.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AION2_CLASSES,buildAscentPlan,rolesFor,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {assertKeyGroups} from './aion2-bar-rules.mjs';
import {weightsFor} from '../games/aion2/engine/level-planner.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
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
// The real Sorcerer Nezekan board (questlog node list, nothing taken), in the adapted board shape.
const nezekan=json('tools/fixtures/aion2/sorcerer-nezekan-board.json').nodes.map(node=>({...node,boardId:11}));

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const CLASS='Sorcerer';
const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=rolesFor(builds[CLASS]).map(role=>role.role);
const plan=(level,role,extra={})=>buildAscentPlan({className:CLASS,role,level,data:data(CLASS),...extra});
const label=(level,role)=>`Sorcerer ${role} Lv ${level}`;
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const gameSkills=icons[CLASS].records[0].skills;
const unlockOf=name=>gameSkills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const sorcererSkills=skills.records.filter(item=>item.class===CLASS);

/* A Sorcerer Daeva for the checks that need real skill levels: the test character's record with the Sorcerer's own skill
   list (test data only, never shown to a player). levels sets a skill's level; learned skills start at 1. */
const astrix=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
const daeva=(level,levels={})=>{
  const model=structuredClone(astrix);
  model.profile.class=CLASS;
  model.profile.level=level;
  model.skills=gameSkills.map((skill,index)=>{
    const learned=skill.category==='Stigma'?false:skill.needLevel<=level;
    return {id:15000000+index,name:skill.name,icon:null,category:skill.category,needLevel:skill.needLevel,skillLevel:learned?(levels[skill.name]??1):0,acquired:learned,equipped:learned};
  });
  return model;
};

check('the Sorcerer has an ascent record: the planner plans it, REPORTED',()=>{
  assert.deepEqual(ROLES,['dps'],'The Sorcerer plays DPS only');
  for(const level of LEVELS){
    const p=plan(level,'dps');
    assert.equal(p.setup.planned,true,label(level,'dps'));
    assert.equal(p.setup.status,'reported');
    assert.equal(p.setup.confirmed,false,'Trends are REPORTED, so the plan is not confirmed');
  }
});

check('every level: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
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
    const top=plan(45,role);
    for(const cell of cells(top.skillBar))assert.ok(onBar.has(cell.name)||p.skillBar.later.some(item=>item.name===cell.name),`${at}: ${cell.name} is neither on the bar nor in Comes later`);
  }
});

check('every level: no stack rule broken, the macro holds only what is on the bar',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(cells(p.skillBar).some(cell=>cell.name===row.name),`${at}: ${row.name}`);
    }
  }
});

check('the stacks by level: what the Daeva can place now, in the build\'s order; Hellfire stays off the macro',()=>{
  const line=(level,key)=>plan(level,'dps').skillBar.stacks[key].skills.map(cell=>cell.name);
  assert.deepEqual([line(1,'A'),line(1,'B')],[[],['Firestorm']],'Lv 1: Firestorm alone');
  assert.deepEqual([line(5,'A'),line(5,'B')],[['Blaze'],['Bittercold Wind','Firestorm']]);
  assert.deepEqual([line(12,'A'),line(12,'B')],[['Blaze'],["Winter's Shackles",'Bittercold Wind','Firestorm']]);
  assert.deepEqual([line(22,'A'),line(22,'B')],[['Element Enhancement','Blaze'],["Winter's Shackles",'Bittercold Wind','Firestorm']]);
  assert.deepEqual(line(32,'A'),['Element Enhancement','Delayed Explosion','Fire Wall','Blaze']);
  assert.deepEqual(line(37,'B'),["Winter's Shackles",'Cold Storm','Bittercold Wind','Firestorm']);
  for(const level of LEVELS){
    const p=plan(level,'dps');
    assert.equal(p.skillBar.mainAttack,'Flame Arrow',`Lv ${level}: Flame Arrow is the main attack`);
    assert.ok(!p.macro.entries.some(entry=>entry.skills.some(row=>row.name==='Hellfire')),`Lv ${level}: Hellfire is never in the macro`);
  }
  // Blaze needs Fire Mark; the main attack's Fire hit puts it on, so no stand-in is brought into the fire stack.
  assert.match(plan(5,'dps').skillBar.stacks.A.skills[0].condition,/Fire Mark/);
});

/* The 25 Oct 2026 Skill Bar rules (Miguel, in game) replace the 17 Oct "own keys never move as the Daeva levels": every
   level is held to the game's bar instead (aion2-bar-rules.mjs). */
check('the game\'s bar at every level: 1 to 4 cooldowns and stigmas, Q and E cover, nothing on 5 to 8 while a reachable key is free',()=>{
  for(const role of ROLES)for(const level of LEVELS)assertKeyGroups(plan(level,role).skillBar,`${label(level,role)}`);
});

check('stigmas: the four the logic picks fill the slots in order; the swap is ranked, never slotted',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    assert.deepEqual(p.setup.stigmas.map(slot=>slot.name),['Element Enhancement','Delayed Explosion','Fire Wall','Cold Storm'],label(level,role));
    assert.deepEqual(p.setup.stigmas.map(slot=>slot.open),[22,27,32,37].map(at=>level>=at),`${label(level,role)}: slots open at 22, 27, 32, 37`);
    for(const slot of p.setup.stigmas)assert.ok(slot.why,`${label(level,role)}: slot ${slot.slot} says why`);
  }
  const barrier=plan(45,'dps').setup.trends.find(item=>item.id==='stigma-steel-barrier');
  assert.equal(barrier.used,false);
  assert.match(barrier.verdict,/^Ranked 5: /);
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    assert.ok(p.mastery.spend.length>0,`${label(level,role)}: something to level`);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`${label(level,role)}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`${label(level,role)}: ${step.name} carries a reason`);
      assert.ok(unlockOf(step.name)<=level,`${label(level,role)}: ${step.name} is not learned before Lv ${unlockOf(step.name)}`);
      const train=sorcererSkills.find(item=>item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${label(level,role)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
  // A Daeva with every key skill at the cap gets no step for them, and none past the cap.
  const core=builds[CLASS].records[0].coreSkills.map(skill=>skill.name);
  const capped=daeva(45,Object.fromEntries(core.map(name=>[name,CAP])));
  const p=buildAscentPlan({className:CLASS,role:'dps',data:data(CLASS),model:capped});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>core.includes(step.name)),'Capped skills get no step');
  assert.deepEqual(p.mastery.atCap.map(item=>item.name).sort(),[...core].sort());
});

check('real skill levels drive the Mastery order',()=>{
  const order=levels=>buildAscentPlan({className:CLASS,role:'dps',data:data(CLASS),model:daeva(30,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  const low=order({});
  const near=order({'Bittercold Wind':7});
  assert.ok(rank(near,'Bittercold Wind')<rank(low,'Bittercold Wind'),`Bittercold Wind at 7 ranks ${rank(near,'Bittercold Wind')+1}, at 1 ranks ${rank(low,'Bittercold Wind')+1}`);
  assert.match(near.find(step=>step.name==='Bittercold Wind').why,/One level from its Specialty slot 1/);
  assert.notDeepEqual(near.map(step=>step.name),low.map(step=>step.name),'Different levels, different order');
  const step=order({Firestorm:9}).find(item=>item.name==='Firestorm');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level and role each change the setup; Next at Lv N names one real change',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level]);
  for(const role of ROLES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role))));
    assert.equal(seen.size,LEVELS.length,`${role}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  // The Sorcerer plays one role. A role it does not play gets the DPS plan, flagged, never a made-up answer.
  for(const level of [5,22,45]){
    const other=plan(level,'tank');
    assert.equal(other.role,'dps');
    assert.equal(other.roleFallback,true,`Lv ${level}: the fallback is said`);
    assert.equal(key(other),key(plan(level,'dps')));
  }
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt&&p.nextAt.level>level&&p.nextAt.level<=45,`${label(level,role)}: a next step`);
    assert.ok(p.nextAt.text.length>10);
    assert.doesNotMatch(p.nextAt.text,/the your/,'Every stack has a name');
    const later=plan(p.nextAt.level,role);
    assert.notEqual(JSON.stringify([later.setup.line,later.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),later.skillBar.left.map(k=>later.skillBar.stacks[k].skills.map(cell=>cell.name)),later.setup.daevanion.open]),
      JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.skillBar.left.map(k=>p.skillBar.stacks[k].skills.map(cell=>cell.name)),p.setup.daevanion.open]),`${label(level,role)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([1,5,12,22,27,32].map(level=>plan(level,'dps').nextAt.level),[3,7,14,27,30,37]);
  assert.match(plan(1,'dps').nextAt.text,/^Bittercold Wind joins the frost stack\./);
  assert.match(plan(22,'dps').nextAt.text,/Stigma slot 2 opens: put Delayed Explosion in it/);
});

check('the first move follows the plan',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const first=p.now[0];
    if(!first)continue;
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
  }
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const live=daeva(12);
  live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:nezekan}:item));
  for(const role of ROLES)for(const points of [0,3,10,40,null]){
    const p=buildAscentPlan({className:CLASS,role,data:data(CLASS),model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    assert.ok(route,'A route with the board read');
    if(points!==null)assert.ok(route.plannedCost<=points,`${role}: ${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`${role}: inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const step of route.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
  }
  // The engine directly, on the real Sorcerer board: 20 points in hand cap the route at 20, and its first skill node is Firestorm.
  const priorities=routePriorities(builds[CLASS].records[0].daevanion);
  const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:nezekan}],priorities,budget:{points:415,boardCost:{}},have:20});
  assert.ok(routed.plannedCost<=20);
  assert.equal(routed.have,20);
  const firstSkill=routed.steps.find(step=>step.target);
  assert.equal(firstSkill?.targetName,'Firestorm +1','Firestorm +1 first, as early plans take it');
  // By hand: no board before Lv 12; at Lv 12 Nezekan, Hellfire's node waits for the skill (Lv 14).
  assert.equal(plan(5,'dps').setup.daevanion.board,null);
  assert.equal(plan(5,'dps').setup.daevanion.firstLevel,12);
  const hand=plan(12,'dps').setup.daevanion;
  assert.equal(hand.board.name,'Nezekan');
  assert.ok(hand.now.includes('Firestorm'));
  assert.ok(hand.waits.includes('Hellfire'));
  assert.deepEqual(plan(14,'dps').setup.daevanion.waits,[]);
});

check('logic over copying: every trend has a count and the logic\'s verdict; the own-key line trends are rejected',()=>{
  const p=plan(45,'dps');
  const trends=p.setup.trends;
  for(const item of trends){assert.ok(item.count,`${item.id}: count`);assert.ok(item.verdict,`${item.id}: verdict`);assert.equal(item.status,'reported');}
  const byId=Object.fromEntries(trends.map(item=>[item.id,item]));
  for(const id of ['line-frost','line-frost-burst','line-ice-chain','line-wish','line-hellfire']){
    assert.equal(byId[id].used,false,id);
    assert.match(byId[id].verdict,/own key/,id);
  }
  for(const id of ['stigma-element-enhancement','stigma-delayed-explosion','stigma-fire-wall','stigma-cold-storm'])assert.equal(byId[id].used,true,id);
  // Mastery: Firestorm first at Lv 1 (the trend and the logic agree); Blaze from Lv 4 (it also restores MP); Hellfire from 14.
  const first=level=>plan(level,'dps').setup.trends.find(item=>item.id==='mastery-firestorm-first');
  assert.equal(first(1).used,true);
  assert.equal(first(5).used,false);
  assert.match(first(5).verdict,/^Blaze comes first now/);
  assert.equal(byId['mastery-hellfire-first'].used,true);
  assert.equal(plan(14,'dps').mastery.spend[0].name,'Hellfire');
  // Specialty: the Lv 8 picks the logic makes are the ones most builds make.
  const pickAt=(name,skillLevel)=>p.skills.find(skill=>skill.name===name).picks.find(item=>item.skillLevel===skillLevel);
  assert.equal(pickAt('Firestorm',8).pick,'Faster skill speed');
  assert.equal(pickAt("Winter's Shackles",8).pick,'PvE damage boost for 5 s');
  assert.equal(pickAt('Wish of Concentration',8).pick,'An extra 10% Attack');
  assert.equal(pickAt('Flame Arrow',8).pick,'More Multi-Hit');
  for(const skill of p.skills)for(const item of skill.picks){assert.ok(item.why||item.refs?.length,`${skill.name} ${item.pick}`);assert.equal(item.over,undefined,`${skill.name} ${item.pick}: the logic agrees with the build`);}
  for(const step of p.mastery.spend)assert.ok(step.why);
});

check('data: every Sorcerer skill has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  assert.equal(sorcererSkills.length,19);
  for(const record of sorcererSkills){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    assert.equal(typeof record.cooldownSeconds,'number',`${record.name}: cooldown from the tooltip`);
    assert.equal(typeof record.mpCost,'number',`${record.name}: MP cost from the tooltip`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...(Array.isArray(record.specialties)?record.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[–—]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|ExpCarry|shr1kn/i);
    }
    for(const link of record.synergies.filter(item=>item.type==='opens'))assert.ok(sorcererSkills.some(item=>item.name===link.target),`${record.name} opens ${link.target}`);
    if(record.kind!=='stigma'&&record.training)for(const [skillLevel,from] of Object.entries(record.training))assert.ok(from>=unlockOf(record.name),`${record.name}: Lv ${skillLevel} from ${from}`);
  }
  const build=builds[CLASS].records[0];
  const refs=new Set(build.provenance.map(source=>source.ref));
  for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
  for(const pref of build.ascent.preferences){
    for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    assert.doesNotMatch(`${pref.count} ${pref.why}`,/[–—]/);
  }
  for(const entry of build.specialties)for(const item of entry.picks)for(const ref of item.refs)assert.ok(refs.has(ref),`${entry.skill} ${item.pick}`);
  assert.ok(weightsFor(build,null).weights.damage>0);
  // The stacks are not checked against a top-player build yet: the tag stays (see the research record, section 4).
  assert.equal(build.macro.verified,false);
  // No guess at the Lv 45 answer before the research: the rotation stays pending.
  assert.equal(build.rotation.pending,true);
});

/* The screens (Playwright, a local static server, the Worker mocked: never NCSOFT, never the real Worker). */
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
  const screen=(query,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?${query}`;
  const q=(level,role='dps')=>`class=sorcerer&role=${role}&level=${level}`;

  await bcheck('every Ascent Plan screen shows the Sorcerer setup for now and one Next line, with REPORTED tagged',async()=>{
    for(const view of ['','mastery','skill-bar','stigma','daevanion','macro','stats']){
      const {page,context,errors}=await open(screen(q(5),view));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5',`${view||'menu'}`);
      // The strip names one stack, the first named one: the fire stack.
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dt'),'Fire stack');
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),'Blaze');
      assert.equal(await plain(page,'#aeSetup [data-setup="stigmas"] dd'),'From Lv 22: Element Enhancement');
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 Frost goes on its own key\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),0,'REPORTED tagged');
      assert.equal(await page.locator('[data-status-tag="setup-unconfirmed"]').count(),0,'No "Not confirmed yet" on the setup');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar and Copy this bar: only what can be placed now; the rest in Comes later; the stacks keep their tag',async()=>{
    for(const level of [5,22,45]){
      const {page,context}=await open(screen(q(level),'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      assert.ok(onBar.length>0);
      assert.equal(await page.locator('[data-status-tag="stacks-unverified"]').count(),0,`Lv ${level}: the stacks are not checked against a top-player build yet`);
      await context.close();
    }
  });

  await bcheck('level changes the screens; a role the Sorcerer does not play shows the DPS plan',async()=>{
    const read=async query=>{
      const {page,context}=await open(screen(query,'skill-bar'));
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(',')].join('|'));
      await context.close();
      return out;
    };
    const lv5=await read(q(5)),lv22=await read(q(22)),lv45=await read(q(45));
    assert.notEqual(lv5,lv22);assert.notEqual(lv22,lv45);
    assert.match(lv22,/Element Enhancement/);assert.doesNotMatch(lv5,/Element Enhancement,/);
    const m=await open(screen(q(22),'mastery'));
    const rows=await m.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
    assert.deepEqual(rows,plan(22,'dps').mastery.spend.map(step=>step.name).slice(0,rows.length));
    assert.equal(rows[0],'Hellfire');
    await m.context.close();
  });

  await bcheck('new parts: nothing under 13px, no sideways scroll at 390',async()=>{
    for(const width of [390,1600]){
      const {page,context}=await open(screen(q(22),'skill-bar'),{viewport:{width,height:900}});
      const sizes=await page.$$eval('#aeSetup, #aeSetup *, #aeComesLater, #aeComesLater *, #aeNextAt, #aeNextAt *',items=>items.filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>[el.tagName,parseFloat(getComputedStyle(el).fontSize)]));
      assert.ok(sizes.every(([,size])=>size>=13),`${width}: ${JSON.stringify(sizes.filter(([,size])=>size<13))}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}: no sideways scroll`);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS){
    for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(q(level),view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`sorcerer-${view}-dps-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_SORCERER=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_SORCERER=PASS');
