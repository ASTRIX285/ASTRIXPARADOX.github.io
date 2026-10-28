#!/usr/bin/env node
// The level planner for the Chanter (brief feature/aetherium-level-chanter, 17 Oct 2026). Offline, no network.
//   For the Chanter at Lv 1, 5, 12, 22, 27, 32, 37 and 45, as support, healer and DPS:
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken, and no skill on two keys;
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level and role each change the setup and the screens; each role gets its own answer;
//   - real skill levels drive the Mastery order;
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the data: every value and synergy has a status and refs that resolve, no guide names, no dashes.
// The research is in games/aion2/docs/level-guidance/chanter.md. AE_BROWSER=0 skips the page checks (they need
// Playwright). AE_SHOTS=<dir outside the repo> saves the Skill Bar and Mastery at Lv 5, 22 and 45 for each role at 1600
// and 390.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAscentPlan,rolesFor,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {assertKeyGroups} from './aion2-bar-rules.mjs';
import {weightsFor} from '../games/aion2/engine/level-planner.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {adaptDaevanionBoard} from '../games/aion2/engine/armory-adapter.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const mechanics=json('games/aion2/data/advisor/mechanics.json');
const grades=json('games/aion2/data/advisor/grades.json');
const builds=json('games/aion2/data/advisor/builds/chanter.json');
const icons=json('games/aion2/data/advisor/icons/chanter.json');
const data={progression,skills,mechanics,grades,builds,icons};
const module=createAion2Module({slots:json('games/aion2/data/gear-slots.json').records});
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=['support','healer','dps'];
const plan=(level,role,extra={})=>buildAscentPlan({className:'Chanter',role,level,data,...extra});
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>icons.records[0].skills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const chanter=skills.records.filter(item=>item.class==='Chanter');
const at=(level,role)=>`Chanter ${role} Lv ${level}`;

// A Chanter Daeva: the armory capture's profile and gear, with the Chanter's skills at the levels a test sets.
const base=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
const daeva=(level,levels={})=>{
  const model=structuredClone(base);
  model.profile.level=level;
  model.profile.class='Chanter';
  model.skills=icons.records[0].skills.filter(skill=>skill.needLevel<=level).map(skill=>({name:skill.name,category:skill.category,icon:null,acquired:skill.category!=='Stigma'||skill.name in levels,equipped:true,skillLevel:levels[skill.name]??1}));
  return model;
};

check('the Chanter has three roles, each with its own ascent record and weights',()=>{
  assert.deepEqual(rolesFor(builds).map(role=>role.role).sort(),[...ROLES].sort());
  const weights=ROLES.map(role=>weightsFor(builds.records.find(build=>build.role===role),null).weights);
  assert.ok(weights[0].partyBuff>weights[0].damage,'support: party buffs first');
  assert.ok(weights[1].survival>weights[1].partyBuff&&weights[1].survival>weights[1].damage,'healer: survival first');
  assert.ok(weights[2].damage>weights[2].survival&&weights[2].partyBuff===0,'DPS: damage first, solo, no party to buff');
  for(const role of ROLES)assert.equal(plan(22,role).setup.planned,true,role);
});

check('every case: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const label=at(level,role);
    for(const cell of cells(p.skillBar)){
      assert.equal(cell.locked,false,`${label}: ${cell.name} locked on the bar`);
      assert.equal(cell.needsSlot,false,`${label}: ${cell.name} needs a slot`);
      if(!cell.stigma)assert.ok(unlockOf(cell.name)<=level,`${label}: ${cell.name} unlocks at Lv ${unlockOf(cell.name)}`);
      else assert.ok(p.stigmas.slots.some(slot=>slot.name===cell.name&&slot.open),`${label}: ${cell.name} is not in an open stigma slot`);
    }
    for(const step of p.skillBar.copySteps.filter(item=>!item.macro))for(const row of step.rows){
      assert.equal(row.locked,false,`${label}: Copy this bar lists ${row.name}, locked`);
      assert.equal(row.needsSlot,false,`${label}: Copy this bar lists ${row.name}, needs a slot`);
    }
    const onBar=new Set(cells(p.skillBar).map(cell=>cell.name));
    for(const item of p.skillBar.later){
      assert.ok(!onBar.has(item.name),`${label}: ${item.name} is on the bar and in Comes later`);
      assert.ok(item.reason,`${label}: ${item.name} says why it waits`);
      assert.ok(item.unlockLevel>level,`${label}: ${item.name} waits for Lv ${item.unlockLevel}`);
    }
    const top=plan(45,role);
    for(const cell of cells(top.skillBar))assert.ok(onBar.has(cell.name)||p.skillBar.later.some(item=>item.name===cell.name),`${label}: ${cell.name} is neither on the bar nor in Comes later`);
    if(level===45)assert.deepEqual(p.skillBar.later,[],`${label}: nothing comes later at the cap`);
  }
});

check('every case: no stack rule broken, no skill on two keys, the macro holds only what is on the bar',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const label=at(level,role);
    assert.deepEqual(stackProblems(p.skillBar),[],`${label}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${label}: bar checks`);
    const names=cells(p.skillBar).map(cell=>cell.name);
    assert.equal(new Set(names).size,names.length,`${label}: a skill on two keys`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${label}: ${row.name} in the macro but not usable`);
      assert.ok(names.includes(row.name),`${label}: ${row.name}`);
    }
  }
});

check('the main line grows with the level; Onslaught stays on left click',()=>{
  const line=(level,role)=>plan(level,role).skillBar.stacks.A.skills.map(cell=>cell.name);
  for(const role of ROLES){
    assert.deepEqual(line(1,role),['Incandescent Blow'],`${role} Lv 1`);
    assert.deepEqual(line(5,role),['Dark Crush','Impactful Crush','Incandescent Blow'],`${role} Lv 5`);
    assert.deepEqual(line(22,role),['Dark Crush','Spinning Strike','Impactful Crush','Incandescent Blow'],`${role} Lv 22`);
    for(const level of LEVELS)assert.equal(plan(level,role).skillBar.mainAttack,'Onslaught');
  }
  // Tremor Crush and Wave Blow share a key: the stun first, then Wave Blow on the stunned target.
  const stun=level=>{const bar=plan(level,'support').skillBar;const key=bar.left.find(item=>bar.stacks[item].skills.some(cell=>cell.name==='Tremor Crush')||bar.stacks[item].reserved?.includes('Tremor Crush'));return key?[key,bar.stacks[key].skills.map(cell=>cell.name),bar.stacks[key].reserved??null]:null;};
  // Lv 5: the stun is not out yet. 5 to 8 cannot hold a stack (25 Oct 2026), so no key is held for it: it waits in Comes later.
  assert.equal(stun(5),null,'No key held for the stun stack before it arrives');
  assert.ok(plan(5,'support').skillBar.later.some(item=>item.name==='Tremor Crush'),'Tremor Crush is listed in Comes later');
  // Once it arrives the pair is one stack on a key that can hold it (1 to 4, Q or E).
  const [key,skills]=stun(12);
  assert.deepEqual(skills,['Tremor Crush','Wave Blow']);
  assert.ok(['1','2','3','4','Q','E'].includes(key),`The stun stack sits on a key that stacks: ${key}`);
  const wave=cells(plan(12,'support').skillBar).find(cell=>cell.name==='Wave Blow');
  assert.equal(wave.conditional,true,'Wave Blow fires only on a stunned target');
  assert.ok(chanter.find(item=>item.name==='Tremor Crush').synergies.some(link=>link.type==='opens'&&link.target==='Wave Blow'),'Tremor Crush opens Wave Blow');
});

/* The 25 Oct 2026 Skill Bar rules (Miguel, in game) replace the 17 Oct "own keys never move as the Daeva levels": every
   level is held to the game's bar instead (aion2-bar-rules.mjs). */
check('the game\'s bar at every level: 1 to 4 cooldowns and stigmas, Q and E cover, nothing on 5 to 8 while a reachable key is free',()=>{
  for(const role of ROLES)for(const level of LEVELS)assertKeyGroups(plan(level,role).skillBar,at(level,role));
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`${at(level,role)}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`${at(level,role)}: ${step.name} carries a reason`);
      assert.ok(unlockOf(step.name)<=level,`${at(level,role)}: ${step.name} is not learned yet`);
      const train=chanter.find(item=>item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${at(level,role)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
  const capped=daeva(45,{'Dark Crush':CAP,'Onslaught':CAP,'Spinning Strike':CAP,'Incandescent Blow':CAP});
  const p=buildAscentPlan({className:'Chanter',role:'support',data,model:capped});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>['Dark Crush','Onslaught','Spinning Strike','Incandescent Blow'].includes(step.name)),'Capped skills get no step');
});

check('real skill levels drive the Mastery order',()=>{
  // Lv 33: the trainer sells Spinning Strike's skill Lv 8 from character Lv 32.
  const spend=levels=>buildAscentPlan({className:'Chanter',role:'support',data,model:daeva(33,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  // Spinning Strike one level from its Lv 8 slot moves up the order, and says why.
  const near=spend({'Spinning Strike':7});
  const low=spend({'Spinning Strike':1});
  assert.ok(rank(near,'Spinning Strike')<rank(low,'Spinning Strike'),`Spinning Strike at 7 ranks ${rank(near,'Spinning Strike')+1}, at 1 ranks ${rank(low,'Spinning Strike')+1}`);
  assert.match(near.find(step=>step.name==='Spinning Strike').why,/One level from its Specialty slot 1/);
  // A skill past its slot aims for the cap, from the level it has.
  const step=spend({'Dark Crush':9}).find(item=>item.name==='Dark Crush');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level and role each change the setup; each role gets its own answer',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.map(slot=>[slot.name,slot.open]),p.mastery.spend.map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level,p.skillBar.later.map(item=>item.name)]);
  for(const role of ROLES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role))));
    assert.ok(seen.size>=7,`${role}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  for(const level of [5,22,45])for(const [a,b] of [['support','healer'],['support','dps'],['healer','dps']])assert.notEqual(key(plan(level,a)),key(plan(level,b)),`Lv ${level}: ${a} and ${b}`);
  // Slot 1 is Undefeated Mantra for every role (263 of 281 builds); slot 2 is each role's own.
  for(const role of ROLES)assert.equal(plan(22,role).setup.stigmas[0].name,'Undefeated Mantra',role);
  assert.deepEqual(ROLES.map(role=>plan(27,role).setup.stigmas[1].name),['Power of the Storm','Healing Touch','Marchutan\'s Wrath']);
  assert.deepEqual(ROLES.map(role=>plan(45,role).setup.stigmas.map(slot=>slot.name)),[
    ['Undefeated Mantra','Power of the Storm','Marchutan\'s Wrath','Sprint Mantra'],
    ['Undefeated Mantra','Healing Touch','Impeding Authority','Barrier Spell'],
    ['Undefeated Mantra','Marchutan\'s Wrath','Power of the Storm','Sprint Mantra']
  ]);
  // Mastery: the healer levels Recuperation first once it is out; support and DPS level Dark Crush first.
  assert.equal(plan(22,'healer').mastery.spend[0].name,'Recuperation');
  assert.equal(plan(22,'support').mastery.spend[0].name,'Dark Crush');
  assert.equal(plan(22,'dps').mastery.spend[0].name,'Dark Crush');
  // Earth's Promise lowers the target's Damage Tolerance for the whole party: support levels it, solo DPS does not.
  assert.ok(plan(22,'support').mastery.spend.some(step=>step.name==='Earth\'s Promise'));
  assert.ok(!plan(22,'dps').mastery.spend.some(step=>step.name==='Earth\'s Promise'));
});

check('guide from the first level: Lv 1 has a line, a Mastery step and a next change',()=>{
  for(const role of ROLES){
    const p=plan(1,role);
    assert.deepEqual(p.setup.line[0].skills,['Incandescent Blow']);
    assert.equal(p.mastery.spend[0].name,'Onslaught',`${role}: Onslaught first before Dark Crush`);
    assert.deepEqual([p.nextAt.level,p.nextAt.text],[3,'Impactful Crush joins the main line.']);
  }
});

check('Next at Lv N: one change with its reason, never at or below the level, none at the cap',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`${at(level,role)}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.ok(p.nextAt.text.length>10);
    const later=plan(p.nextAt.level,role);
    const shape=q=>JSON.stringify([q.setup.line,q.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),q.skillBar.left.map(key=>q.skillBar.stacks[key].skills.map(cell=>cell.name)),q.setup.daevanion.open]);
    assert.notEqual(shape(later),shape(p),`${at(level,role)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.match(plan(22,'support').nextAt.text,/Stigma slot 2 opens: put Power of the Storm in it/);
  assert.match(plan(22,'healer').nextAt.text,/Stigma slot 2 opens: put Healing Touch in it/);
  assert.match(plan(22,'dps').nextAt.text,/Stigma slot 2 opens: put Marchutan's Wrath in it/);
});

check('the first move follows the plan',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const first=plan(level,role).now[0];
    if(!first)continue;
    const p=plan(level,role);
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
    if(/^Set your/.test(first.title))assert.ok(first.title.endsWith(p.skillBar.stacks.A.skills.map(cell=>cell.name).join(', ')));
  }
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const board=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
  for(const role of ['support','dps'])for(const points of [0,3,10,40,null]){
    const live=daeva(30,{'Dark Crush':6,'Onslaught':6});
    live.daevanion=(base.daevanion??[]).map(item=>(item.id===11?{...item,nodes:board}:item));
    const p=buildAscentPlan({className:'Chanter',role,data,model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    if(!route)continue;
    if(points!==null)assert.ok(route.plannedCost<=points,`${role}: ${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`${role}: inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const step of route.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
  }
  // By hand at Lv 12: the first board and the skill nodes the Daeva has now; Spinning Strike's node waits for the skill.
  const hand=plan(12,'support').setup.daevanion;
  assert.equal(hand.board.name,'Nezekan');
  assert.ok(hand.now.includes('Dark Crush'));
  assert.ok(hand.waits.includes('Spinning Strike'));
  assert.equal(plan(5,'dps').setup.daevanion.board,null);
  assert.equal(plan(5,'dps').setup.daevanion.firstLevel,12);
  // The healer has no sourced Daevanion plan: it stays pending, never a guess.
  assert.equal(builds.records.find(build=>build.role==='healer').daevanion.pending,true);
});

check('logic over copying: every rejected trend says why',()=>{
  for(const role of ROLES)for(const level of [12,22,45]){
    for(const item of plan(level,role).setup.trends){
      assert.ok(item.count,`${role} ${item.id}: count`);
      assert.ok(item.verdict,`${role} ${item.id}: verdict`);
      assert.equal(item.status,'reported');
    }
  }
  const byId=(level,role)=>Object.fromEntries(plan(level,role).setup.trends.map(item=>[item.id,item]));
  const support=byId(45,'support');
  for(const id of ['line-marchutan','line-heat-wave','line-wave-blow','line-onslaught']){assert.equal(support[id].used,false,id);assert.match(support[id].verdict,/own key/,id);}
  // The guide's set slots Sprint Mantra second: support and DPS put a stronger stigma there.
  assert.equal(support['stigma-sprint-second'].used,false);
  assert.match(support['stigma-sprint-second'].verdict,/Slot 2 takes Power of the Storm/);
  assert.match(byId(45,'dps')['stigma-sprint-second'].verdict,/Slot 2 takes Marchutan's Wrath/);
  for(const id of ['stigma-undefeated','stigma-storm','stigma-marchutan','stigma-sprint'])assert.equal(support[id].used,true,id);
  // Healer: 34 of 41 healer builds slot Sprint Mantra; a shield and Barrier Spell keep the party alive better.
  const healer=byId(45,'healer');
  assert.equal(healer['stigma-sprint'].used,false);
  assert.match(healer['stigma-sprint'].verdict,/^Ranked \d/);
  assert.equal(healer['stigma-healing-touch'].used,true);
  assert.equal(healer['mastery-dark-crush-first'].used,false,'The healer levels Recuperation first');
  assert.match(healer['mastery-dark-crush-first'].verdict,/^Recuperation comes first now/);
  // DPS: Guardian Blessing and Fracturing Blow lose to Power of the Storm and Sprint Mantra.
  const dps=byId(45,'dps');
  assert.equal(dps['stigma-guardian'].used,false);
  assert.equal(dps['stigma-fracturing'].used,false);
  assert.equal(dps['mastery-dark-crush-first'].used,true);
  assert.equal(byId(1,'support')['mastery-onslaught-early'].used,true);
  // Every choice carries a one-line reason: stigma slots, Mastery steps, Specialty picks.
  for(const role of ROLES){
    const q=plan(45,role);
    for(const slot of q.setup.stigmas)assert.ok(slot.why,`${role}: slot ${slot.slot}`);
    for(const step of q.mastery.spend)assert.ok(step.why);
    for(const skill of q.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
  }
});

check('data: every Chanter skill has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  const names=new Set(chanter.map(item=>item.name));
  for(const name of icons.records[0].skills.map(skill=>skill.name))assert.ok(names.has(name),`${name}: in the catalogue`);
  for(const record of chanter){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...(Array.isArray(record.specialties)?record.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[\u2013\u2014]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|ExpCarry|Vault/i);
    }
    for(const link of record.synergies.filter(item=>item.type==='opens'))assert.ok(names.has(link.target),`${record.name} opens ${link.target}`);
  }
  for(const build of builds.records){
    const refs=new Set(build.provenance.map(source=>source.ref));
    for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
    for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    for(const pref of build.ascent.preferences)assert.doesNotMatch(`${pref.why} ${pref.count}`,/[\u2013\u2014]/);
  }
});

/* The screens (Playwright, a local static server, the Worker mocked out: never NCSOFT, never the real Worker). */
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
  const site0=`http://127.0.0.1:${server.address().port}`;
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
    await page.goto(`${site0}${path}`);
    await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
    await page.waitForFunction(()=>document.documentElement.dataset.aeBoards==='read',null,{timeout:15000});
    return {page,context,errors};
  }
  const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();
  const screen=(level,role,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?class=chanter&role=${role}&level=${level}`;

  await bcheck('every Ascent Plan screen shows the Chanter setup for now and one Next line, with REPORTED tagged',async()=>{
    for(const view of ['','mastery','skill-bar','stigma','daevanion','macro','stats']){
      const {page,context,errors}=await open(screen(5,'support',view));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),'Dark Crush, Impactful Crush, Incandescent Blow');
      assert.equal(await plain(page,'#aeSetup [data-setup="stigmas"] dd'),'From Lv 22: Undefeated Mantra');
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 Heat Wave Blow goes on its own key\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),0,'REPORTED tagged');
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="setup-unconfirmed"]').count(),0,'No longer "Not confirmed yet"');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar and Copy this bar: only what can be placed now; the rest in Comes later; the line is not tagged unconfirmed',async()=>{
    for(const role of ROLES)for(const level of [5,22,45]){
      const {page,context}=await open(screen(level,role,'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`${role} Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`${role} Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      if(level===45)assert.equal(later.length,0,'Nothing comes later at 45');
      assert.equal(await page.locator('#aeStackRule [data-status-tag="bar-layout"]').count(),0,'The main line matches the published bars');
      await context.close();
    }
  });

  await bcheck('level and role each change the screens',async()=>{
    const read=async(level,role,view)=>{
      const {page,context}=await open(screen(level,role,view));
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill], #aeMasteryWhy li')].map(el=>el.dataset.barSkill??el.dataset.masteryWhy).join(',')].join('|'));
      await context.close();
      return out;
    };
    for(const view of ['skill-bar','mastery']){
      const shots={};
      for(const role of ROLES)for(const level of [5,22,45])shots[`${role}${level}`]=await read(level,role,view);
      for(const role of ROLES){assert.notEqual(shots[`${role}5`],shots[`${role}22`],`${view} ${role}: Lv 5 and 22`);assert.notEqual(shots[`${role}22`],shots[`${role}45`],`${view} ${role}: Lv 22 and 45`);}
      for(const level of [22,45])for(const [a,b] of [['support','healer'],['support','dps'],['healer','dps']])assert.notEqual(shots[`${a}${level}`],shots[`${b}${level}`],`${view} Lv ${level}: ${a} and ${b}`);
    }
  });

  await bcheck('new parts: nothing under 13px, 44px Comes later rows, no sideways scroll at 390',async()=>{
    for(const width of [390,1600]){
      const {page,context}=await open(screen(5,'healer','skill-bar'),{viewport:{width,height:900}});
      const sizes=await page.$$eval('#aeSetup, #aeSetup *, #aeComesLater, #aeComesLater *, #aeNextAt, #aeNextAt *',items=>items.filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>[el.tagName,parseFloat(getComputedStyle(el).fontSize)]));
      assert.ok(sizes.every(([,size])=>size>=13),`${width}: ${JSON.stringify(sizes.filter(([,size])=>size<13))}`);
      const rows=await page.$$eval('#aeComesLater li',items=>items.map(el=>el.getBoundingClientRect().height));
      assert.ok(rows.length&&rows.every(height=>height>=44),`${width}: Comes later rows ${rows}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}: no sideways scroll`);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS){
    for(const role of ROLES)for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(level,role,view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`${view}-${role}-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_CHANTER=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_CHANTER=PASS');
