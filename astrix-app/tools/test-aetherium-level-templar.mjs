#!/usr/bin/env node
// The level planner for the Templar (brief feature/aetherium-level-templar, 17 Oct 2026). Offline, no network.
//   For the Templar at Lv 1, 5, 12, 22, 27, 32, 37 and 45, as tank and as DPS:
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken (stackProblems and the rest of the bar checks);
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level and role each change the setup; the first move follows the plan;
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the data: every Templar skill has values and synergies with a status and refs that resolve.
// The research record is docs/level-guidance/templar.md. AE_BROWSER=0 skips the page checks (they need Playwright).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AION2_CLASSES,buildAscentPlan,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
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
const astrix=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
const templarSkills=icons.Templar.records[0].skills;
/** A Templar Daeva (no Templar capture yet): the Gladiator fixture's profile and boards with the Templar skill list. */
const daeva=(level,levels={})=>{
  const model=structuredClone(astrix);
  model.profile.level=level;model.profile.class='Templar';
  model.skills=templarSkills.filter(skill=>skill.category!=='Stigma'&&skill.needLevel<=level).map((skill,index)=>({id:index+1,name:skill.name,icon:skill.icon,category:skill.category,needLevel:skill.needLevel,skillLevel:levels[skill.name]??1,acquired:true,equipped:skill.category==='Active'}));
  return model;
};

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=['tank','dps'];
const plan=(level,role,extra={})=>buildAscentPlan({className:'Templar',role,level,data:data('Templar'),...extra});
const label=(level,role)=>`Templar ${role} Lv ${level}`;
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>templarSkills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const record=name=>skills.records.find(item=>item.class==='Templar'&&item.name===name);

check('every case: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
    assert.equal(p.setup.planned,true,`${at}: planned`);
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
    if(level===45)assert.deepEqual(p.skillBar.later,[],`${at}: nothing comes later at the cap`);
  }
});

check('every case: no stack rule broken, the macro holds only what is on the bar',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(cells(p.skillBar).some(cell=>cell.name===row.name),`${at}: ${row.name}`);
    }
    // Pummel has no cooldown, so it is the last filled row of its stack; Judgment and Flash Rampage wait on a condition.
    const b=p.skillBar.stacks.B.skills.map(cell=>cell.name);
    assert.equal(b.at(-1),'Pummel',`${at}: Pummel last on the smash stack`);
    for(const cell of cells(p.skillBar).filter(item=>['Judgment','Flash Rampage'].includes(item.name)))assert.equal(cell.conditional,true,`${at}: ${cell.name} waits on its condition`);
  }
});

check('the stacks by level: a real setup from Lv 1, Doom Shield on its own key, Flash Rampage above Pummel',()=>{
  const line=(level,role,key)=>plan(level,role).skillBar.stacks[key].skills.map(cell=>cell.name);
  for(const role of ROLES){
    assert.deepEqual(line(1,role,'A'),[],'Lv 1: no shield skill yet');
    assert.deepEqual(line(1,role,'B'),['Pummel'],'Lv 1: Pummel alone');
    assert.equal(plan(1,role).skillBar.mainAttack,'Vicious Strike');
    assert.deepEqual(line(5,role,'A'),['Judgment','Shield Smite'],'Lv 5: Shield Smite makes Judgment ready');
    assert.deepEqual(line(5,role,'B'),['Flash Rampage','Pummel']);
    assert.deepEqual(line(12,role,'A'),['Judgment','Shield Smite','Warding Strike']);
    assert.deepEqual(line(12,role,'B'),['Debilitating Smash','Annihilate','Flash Rampage','Pummel']);
    for(const level of LEVELS)for(const key of ['A','B'])assert.ok(!line(level,role,key).includes('Doom Shield'),`${role} Lv ${level}: Doom Shield is a dash, never in a stack`);
  }
});

check('own keys never move as the Daeva levels: a skill still to come keeps its key free',()=>{
  for(const role of ROLES){
    const keyOf=(p,name)=>p.skillBar.left.find(key=>p.skillBar.stacks[key].skills.some(cell=>cell.name===name)||p.skillBar.stacks[key].reserved?.includes(name));
    const top=plan(45,role);
    for(const level of LEVELS){
      const p=plan(level,role);
      for(const key of top.skillBar.left)for(const cell of top.skillBar.stacks[key].skills)assert.equal(keyOf(p,cell.name),key,`${label(level,role)}: ${cell.name} on key ${key}`);
    }
  }
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`${label(level,role)}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`${label(level,role)}: ${step.name} carries a reason`);
      assert.ok(unlockOf(step.name)<=level,`${label(level,role)}: ${step.name} is not learned yet`);
      const train=record(step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${label(level,role)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
  const capped=daeva(45,{Judgment:CAP,'Vicious Strike':CAP,Punishment:CAP,Pummel:CAP,'Warding Strike':CAP});
  for(const role of ROLES){
    const p=plan(45,role,{model:capped});
    assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
    assert.ok(!p.mastery.spend.some(step=>['Judgment','Vicious Strike','Punishment','Pummel','Warding Strike'].includes(step.name)),'Capped skills get no step');
  }
});

check('real skill levels drive the Mastery order',()=>{
  const at=levels=>plan(30,'dps',{model:daeva(30,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  // Vicious Strike one level from its Specialty slot moves up the order, and says why.
  const near=at({'Vicious Strike':7,Judgment:1,Pummel:1});
  const low=at({'Vicious Strike':1,Judgment:1,Pummel:1});
  assert.ok(rank(near,'Vicious Strike')<rank(low,'Vicious Strike'),`Vicious Strike at 7 ranks ${rank(near,'Vicious Strike')+1}, at 1 ranks ${rank(low,'Vicious Strike')+1}`);
  assert.match(near.find(step=>step.name==='Vicious Strike').why,/One level from its Specialty slot 1/);
  assert.notDeepEqual(near.map(step=>step.name),low.map(step=>step.name),'Different levels, different order');
  const step=at({Judgment:9}).find(item=>item.name==='Judgment');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const board=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
  const live=daeva(12);
  live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:board}:item));
  for(const role of ROLES)for(const points of [0,3,10,40,null]){
    const p=plan(12,role,{model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    assert.ok(route,'A route with the board read');
    if(points!==null)assert.ok(route.plannedCost<=points,`${role}: ${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`${role}: inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const item of route.steps){left-=item.cost;assert.ok(left>=0,'Each step paid for');}
  }
  for(const build of builds.Templar.records){
    const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:board}],priorities:routePriorities(build.daevanion),budget:{points:415,boardCost:{}},have:20});
    assert.ok(routed.plannedCost<=20,`${build.id}: ${routed.plannedCost} planned with 20 points`);
  }
  // By hand at Lv 12: the first board, Judgment's node now, Punishment's node waits for the skill (Lv 14).
  for(const role of ROLES){
    const hand=plan(12,role).setup.daevanion;
    assert.equal(hand.board.name,'Nezekan');
    assert.ok(hand.now.includes('Judgment'));
    assert.ok(hand.waits.includes('Punishment'));
    assert.equal(plan(5,role).setup.daevanion.board,null);
    assert.equal(plan(5,role).setup.daevanion.firstLevel,12);
  }
});

check('level and role each change the setup; each role gets its own answer',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level,p.skillBar.left.map(item=>p.skillBar.stacks[item].skills.map(cell=>cell.name).join('+')||p.skillBar.stacks[item].reserved?.join('+'))]);
  for(const role of ROLES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role))));
    assert.ok(seen.size>=6,`${role}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  for(const level of LEVELS)assert.notEqual(key(plan(level,'tank')),key(plan(level,'dps')),`Lv ${level}: role`);
  // The four stigmas: the tank holds the boss and keeps Fury up, the DPS hits harder.
  const four=role=>plan(45,role).setup.stigmas.map(slot=>slot.name);
  assert.deepEqual(four('tank'),['Shield of Protection','Taunt','Doom Shield','Noble Armor']);
  assert.deepEqual(four('dps'),['Doom Shield',"Empyrean Lord's Punishment",'Battlefield Banner','Noble Armor']);
  assert.match(plan(22,'tank').setup.stigmas[0].why,/Fury/);
  // The tank levels Insulting Roar and Fury (Enmity and the party buff count); the DPS does not.
  const passives=role=>plan(45,role).mastery.spend.filter(step=>['Insulting Roar','Fury'].includes(step.name)).map(step=>step.name).sort();
  assert.deepEqual(passives('tank'),['Fury','Insulting Roar']);
  assert.deepEqual(passives('dps'),[]);
  // Weights: the tank weighs Enmity and the party buff, the DPS weighs neither.
  const weights=role=>weightsFor(builds.Templar.records.find(build=>build.role===role),null).weights;
  assert.ok(weights('tank').enmity>0&&weights('tank').partyBuff>0);
  assert.equal(weights('dps').enmity,0);assert.equal(weights('dps').partyBuff,0);
});

check('Next at Lv N: one change with its reason, never at or below the level, none at the cap',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`${label(level,role)}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.ok(p.nextAt.text.length>10);
    assert.doesNotMatch(p.nextAt.text,/the your/,'A stack has a name');
    const later=plan(p.nextAt.level,role);
    const view=q=>JSON.stringify([q.setup.line,q.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),q.skillBar.left.map(key=>q.skillBar.stacks[key].skills.map(cell=>cell.name)),q.setup.daevanion.open]);
    assert.notEqual(view(later),view(p),`${label(level,role)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([plan(1,'tank').nextAt.level,plan(5,'tank').nextAt.level,plan(12,'tank').nextAt.level,plan(22,'tank').nextAt.level],[3,7,14,27]);
  assert.match(plan(1,'tank').nextAt.text,/Shield Smite joins the shield stack/);
  assert.match(plan(22,'tank').nextAt.text,/Stigma slot 2 opens: put Taunt in it/);
  assert.match(plan(22,'dps').nextAt.text,/Stigma slot 2 opens: put Empyrean Lord's Punishment in it/);
});

check('the first move follows the plan',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const first=p.now[0];
    if(!first)continue;
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
    if(/^Set your/.test(first.title))assert.ok(first.title.endsWith(p.skillBar.stacks.B.skills.map(cell=>cell.name).join(', ')));
  }
});

check('logic over copying: every trend has a count and a verdict; rejected ones say why',()=>{
  for(const role of ROLES)for(const level of [5,22,45]){
    for(const item of plan(level,role).setup.trends){
      assert.ok(item.count,`${role} ${item.id}: count`);
      assert.ok(item.verdict,`${role} ${item.id}: verdict`);
      assert.equal(item.status,'reported');
    }
  }
  const trends=(level,role)=>Object.fromEntries(plan(level,role).setup.trends.map(item=>[item.id,item]));
  for(const role of ROLES){
    const t=trends(45,role);
    // Doom Shield is a dash and Taunt a pull-and-Enmity skill: both keep their own key.
    assert.equal(t['line-doom-shield'].used,false);assert.match(t['line-doom-shield'].verdict,/own key/);
    // Flash Rampage passed the logic check (it fires only on a staggered target, so it never blocks the stack) and is
    // in the smash stack itself, above Pummel.
    assert.deepEqual(plan(45,role).skillBar.stacks.B.skills.map(cell=>cell.name).slice(-2),['Flash Rampage','Pummel']);
    assert.equal(t['mastery-judgment-first'].used,true,'Judgment levelled first, as 102 of 172 priority lists do');
    assert.equal(trends(5,role)['mastery-pummel-levelling'].used,false,'From Lv 4 Judgment is worth more than Pummel');
  }
  const tank=trends(45,'tank'),dps=trends(45,'dps');
  assert.equal(tank['stigma-taunt-first'].used,false);assert.match(tank['stigma-taunt-first'].verdict,/Slot 1 takes Shield of Protection/);
  assert.equal(tank['stigma-elp'].used,false);assert.match(tank['stigma-elp'].verdict,/worth more to this role/);
  assert.equal(dps['stigma-elp'].used,true);
  assert.equal(dps['stigma-taunt'].used,false,'No Enmity to hold in a DPS role');
  assert.equal(tank['stigma-taunt'].used,true);
  // Every choice carries a one-line reason: stigma slots, bar rows the planner placed, Mastery steps, Specialty picks.
  for(const role of ROLES){
    const q=plan(45,role);
    for(const slot of q.setup.stigmas)assert.ok(slot.why,`${role}: slot ${slot.slot}`);
    for(const step of q.mastery.spend)assert.ok(step.why);
    for(const skill of q.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
    for(const cell of cells(q.skillBar))assert.ok(cell.why||cell.reason,`${role}: ${cell.name} on the bar says why`);
  }
});

check('REPORTED, not confirmed: the setup carries its status and sources',()=>{
  for(const role of ROLES){
    const p=plan(22,role);
    assert.equal(p.setup.planned,true);
    assert.equal(p.setup.confirmed,false);
    assert.equal(p.setup.status,'reported');
    assert.ok(p.setup.refs.length>0);
  }
});

check('data: every Templar skill has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  const records=skills.records.filter(item=>item.class==='Templar'&&!(item.summary&&item.summary.pending));
  assert.ok(records.length>=23,`${records.length} Templar records with a summary`);
  for(const item of records){
    assert.ok(Array.isArray(item.values)&&item.values.length,`${item.name}: values`);
    assert.ok(Array.isArray(item.synergies),`${item.name}: synergies`);
    const refs=new Set(item.provenance.map(source=>source.ref));
    for(const entry of [...item.values,...item.synergies,...(Array.isArray(item.specialties)?item.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(entry.status),`${item.name}: ${entry.text}`);
      for(const ref of entry.refs)assert.ok(refs.has(ref),`${item.name}: ref ${ref}`);
      assert.doesNotMatch(entry.text,/[–—]/);
      assert.doesNotMatch(entry.text,/questlog|MetaBot|ExpCarry|leonis|Nobs/i);
    }
    for(const entry of [...item.values,...(Array.isArray(item.specialties)?item.specialties.flatMap(perk=>perk.values??[]):[])])if(entry.needs)assert.ok(record(entry.needs),`${item.name}: needs ${entry.needs}`);
    for(const link of item.synergies.filter(entry=>entry.type==='opens'))assert.ok(record(link.target),`${item.name} opens ${link.target}`);
    if(Number.isInteger(item.unlockLevel)&&item.kind!=='stigma'&&item.training)assert.ok(item.training['8']>=item.unlockLevel,`${item.name}: training after unlock`);
  }
  for(const build of builds.Templar.records){
    const refs=new Set(build.provenance.map(source=>source.ref));
    for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
    for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    for(const entry of build.specialties)for(const pick of entry.picks)assert.ok(record(entry.skill).specialties.some(perk=>perk.text===pick.perk&&perk.skillLevel===pick.skillLevel),`${build.id}: ${entry.skill} ${pick.perk} is a tooltip option`);
    assert.equal(build.team,undefined);
    assert.equal(build.teamVariants,undefined,'The Templar has no team variants: the tank role is the main tank');
  }
  const doc=readFileSync(new URL('games/aion2/docs/level-guidance/templar.md',root),'utf8');
  assert.doesNotMatch(doc,/[–—]/,'No dashes in the record');
  for(const word of ['CONFIRMED','REPORTED','UNKNOWN'])assert.match(doc,new RegExp(word));
});

/* The screens (Playwright, a local static server, the Worker never called). Every Ascent Plan screen shows the Templar
   setup for now with the REPORTED tag; the Skill Bar lists only what can be placed now; level and role change the screens;
   no sideways scroll at 390. AE_SHOTS=<dir outside the repo> saves the Skill Bar and Mastery at Lv 5, 22 and 45 for each
   role, at 1600 and 390. */
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
    await page.waitForFunction(()=>document.documentElement.dataset.aeBoards==='read',null,{timeout:15000});
    return {page,context,errors};
  }
  const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();
  const screen=(level,role,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?class=templar&role=${role}&level=${level}`;

  await bcheck('every Ascent Plan screen shows the Templar setup for now and one Next at Lv N line, with REPORTED tagged',async()=>{
    for(const view of ['','mastery','skill-bar','stigma','daevanion','macro','stats']){
      const {page,context,errors}=await open(screen(5,'tank',view));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),'Judgment, Shield Smite');
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 Debilitating Smash joins the smash stack\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),1,'REPORTED tagged');
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="setup-unconfirmed"]').count(),0,'No longer Not confirmed yet');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar and Copy this bar: only what can be placed now; the rest in Comes later',async()=>{
    for(const role of ROLES)for(const level of [5,22,45]){
      const {page,context}=await open(screen(level,role,'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`${role} Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`${role} Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      if(level===45)assert.equal(later.length,0,'Nothing comes later at 45');
      else assert.ok(later.length>0);
      await context.close();
    }
  });

  await bcheck('level and role each change the screens',async()=>{
    const read=async(level,role,view)=>{
      const {page,context}=await open(screen(level,role,view));
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(','),[...document.querySelectorAll('#aeMasteryWhy li')].map(el=>el.dataset.masteryWhy).join(',')].join('|'));
      await context.close();
      return out;
    };
    for(const view of ['skill-bar','mastery']){
      const t5=await read(5,'tank',view),t22=await read(22,'tank',view),t45=await read(45,'tank',view);
      assert.notEqual(t5,t22);assert.notEqual(t22,t45);
      for(const level of [5,22,45])assert.notEqual(await read(level,'tank',view),await read(level,'dps',view),`${view} Lv ${level}: role`);
    }
    const s=await open(screen(22,'tank','stigma'));
    assert.match(await plain(s.page,'#aeStigmaWhy [data-stigma-why="0"]'),/^Slot 1 Shield of Protection: .*Fury/);
    await s.context.close();
  });

  await bcheck('new parts at 390 and 1600: nothing under 13px, no sideways scroll',async()=>{
    for(const width of [390,1600]){
      const {page,context}=await open(screen(22,'dps','skill-bar'),{viewport:{width,height:900}});
      const sizes=await page.$$eval('#aeSetup, #aeSetup *, #aeComesLater, #aeComesLater *, #aeNextAt, #aeNextAt *',items=>items.filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>[el.tagName,parseFloat(getComputedStyle(el).fontSize)]));
      assert.ok(sizes.every(([,size])=>size>=13),`${width}: ${JSON.stringify(sizes.filter(([,size])=>size<13))}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}: no sideways scroll`);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS){
    for(const role of ROLES)for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(level,role,view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`templar-${view}-${role}-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_TEMPLAR=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_TEMPLAR=PASS');
