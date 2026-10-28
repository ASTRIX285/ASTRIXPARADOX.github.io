#!/usr/bin/env node
// The level planner for the Ranger (brief feature/aetherium-level-ranger, 17 Oct 2026). Offline, no network.
//   For the Ranger at Lv 1, 5, 12, 22, 27, 32, 37 and 45, in every role it has (DPS only):
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken, and no skill on two keys;
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level changes the setup; a role the Ranger has no build for falls back to DPS and says so;
//   - real skill levels drive the Mastery order;
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the data: every value and synergy has a status and refs that resolve, no guide names, no dashes.
// The research is in games/aion2/docs/level-guidance/ranger.md. AE_BROWSER=0 skips the page checks (they need
// Playwright). AE_SHOTS=<dir outside the repo> saves the Skill Bar and Mastery at Lv 5, 22 and 45 at 1600 and 390.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAscentPlan,rolesFor,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {assertKeyGroups} from './aion2-bar-rules.mjs';
import {weightsFor} from '../games/aion2/engine/level-planner.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const progression=json('games/aion2/data/advisor/progression.json');
const skills=json('games/aion2/data/advisor/skills.json');
const mechanics=json('games/aion2/data/advisor/mechanics.json');
const grades=json('games/aion2/data/advisor/grades.json');
const builds=json('games/aion2/data/advisor/builds/ranger.json');
const icons=json('games/aion2/data/advisor/icons/ranger.json');
const data={progression,skills,mechanics,grades,builds,icons};
const module=createAion2Module({slots:json('games/aion2/data/gear-slots.json').records});
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=rolesFor(builds).map(role=>role.role);
const plan=(level,role='dps',extra={})=>buildAscentPlan({className:'Ranger',role,level,data,...extra});
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>icons.records[0].skills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const ranger=skills.records.filter(item=>item.class==='Ranger');

// A Ranger Daeva: the armory capture's profile and gear, with the Ranger's skills at the levels a test sets.
const base=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});
const daeva=(level,levels={})=>{
  const model=structuredClone(base);
  model.profile.level=level;
  model.profile.class='Ranger';
  model.skills=icons.records[0].skills.filter(skill=>skill.needLevel<=level).map(skill=>({name:skill.name,category:skill.category,icon:null,acquired:skill.category!=='Stigma'||skill.name in levels,equipped:true,skillLevel:levels[skill.name]??1}));
  return model;
};

check('the Ranger has one role, DPS, and the planner has an ascent record for it',()=>{
  assert.deepEqual(ROLES,['dps']);
  const build=builds.records.find(item=>item.role==='dps');
  assert.ok(weightsFor(build,null).weights.damage>0);
  assert.equal(plan(22).setup.planned,true);
  // A role the Ranger has no build for falls back to DPS, and the plan says so.
  for(const role of ['tank','healer','support']){
    const p=plan(22,role);
    assert.equal(p.role,'dps');
    assert.equal(p.roleFallback,true,role);
  }
});

check('every level: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=`Ranger ${role} Lv ${level}`;
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

check('every level: no stack rule broken, no skill on two keys, the macro holds only what is on the bar',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=`Ranger ${role} Lv ${level}`;
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    const names=cells(p.skillBar).map(cell=>cell.name);
    assert.equal(new Set(names).size,names.length,`${at}: a skill on two keys: ${names}`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(names.includes(row.name),`${at}: ${row.name}`);
    }
  }
});

check('the stacks by level: built from the first level, nothing used before it unlocks',()=>{
  const line=(level,key)=>plan(level).skillBar.stacks[key].skills.map(cell=>cell.name);
  assert.deepEqual(line(1,'A'),['Snare Shot','Tempest Shot']);
  assert.deepEqual(line(1,'B'),[]);
  assert.deepEqual(line(5,'A'),['Snare Shot','Drill Dart','Tempest Shot']);
  assert.deepEqual(line(5,'B'),['Arrow Scattershot']);
  assert.deepEqual(line(12,'A'),['Snare Shot','Gale Arrow','Drill Dart','Tempest Shot']);
  assert.deepEqual(line(12,'B'),['Burst Arrow','Arrow Scattershot']);
  // The bar by cooldown (Miguel, in game, 28 Oct 2026): Griffon Arrow (45 s, a long cooldown) leaves the stack for a key of its own on 1 to 4.
  assert.deepEqual(line(27,'B'),['Burst Arrow','Arrow Scattershot']);
  const griffon=plan(27).skillBar;
  assert.ok(['1','2','3','4'].some(key=>griffon.stacks[key].skills.map(cell=>cell.name).join()==='Griffon Arrow'),'Griffon Arrow alone on 1 to 4');
  for(const level of LEVELS)assert.equal(plan(level).skillBar.mainAttack,'Snipe');
  // Snare Shot's Slow is what Burst Arrow needs: it is on the set-up stack from Lv 1, and only there.
  for(const level of LEVELS)assert.equal(cells(plan(level).skillBar).filter(cell=>cell.name==='Snare Shot').length,1);
});

/* The bar by cooldown (Miguel, in game, 28 Oct 2026; it replaces the 25 Oct key groups and the 17 Oct "own keys never move"): every
   level is held to the game's bar instead (aion2-bar-rules.mjs). */
check('the bar by cooldown at every level: Q and E stack the shortest, 1 to 4 the long cooldowns, 5 to 8 one skill each',()=>{
  for(const level of LEVELS)assertKeyGroups(plan(level).skillBar,`Lv ${level}`);
});

check('stigmas: the slots fill in the logic\'s order; each says why',()=>{
  const open=level=>plan(level).setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name);
  assert.deepEqual(open(12),[]);
  assert.deepEqual(open(22),["Vaizel's Authority"]);
  assert.deepEqual(open(27),["Vaizel's Authority",'Griffon Arrow']);
  assert.deepEqual(open(32),["Vaizel's Authority",'Griffon Arrow','Supporting Fire']);
  assert.deepEqual(open(45),["Vaizel's Authority",'Griffon Arrow','Supporting Fire','Bow of Blessing']);
  for(const slot of plan(45).setup.stigmas){assert.ok(slot.why,`slot ${slot.slot}`);assert.ok(['confirmed','reported'].includes(slot.status));}
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`Lv ${level}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`Lv ${level}: ${step.name} carries a reason`);
      const train=ranger.find(item=>item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`Lv ${level}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
      assert.ok(unlockOf(step.name)<=level,`Lv ${level}: ${step.name} is not learned yet`);
    }
  }
  const capped=daeva(45,{'Deadshot':CAP,'Drill Dart':CAP,'Snipe':CAP,'Gale Arrow':CAP,'Tempest Shot':CAP});
  const p=plan(45,'dps',{model:capped});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>['Deadshot','Drill Dart','Snipe','Gale Arrow','Tempest Shot'].includes(step.name)),'Capped skills get no step');
  assert.deepEqual(p.mastery.atCap.map(item=>item.name).sort(),['Deadshot','Drill Dart','Gale Arrow','Snipe','Tempest Shot']);
});

check('Mastery by level: Drill Dart first while you level, Deadshot from Lv 14',()=>{
  assert.equal(plan(1).mastery.spend[0].name,'Snipe');
  for(const level of [5,12])assert.equal(plan(level).mastery.spend[0].name,'Drill Dart',`Lv ${level}`);
  for(const level of [22,27,32,37,45])assert.equal(plan(level).mastery.spend[0].name,'Deadshot',`Lv ${level}`);
});

check('real skill levels drive the Mastery order',()=>{
  const at=levels=>plan(30,'dps',{model:daeva(30,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  // Gale Arrow one level from its Lv 8 slot moves up the order, and says why.
  const near=at({'Gale Arrow':7,'Deadshot':1,'Drill Dart':1});
  const low=at({'Gale Arrow':1,'Deadshot':1,'Drill Dart':1});
  assert.ok(rank(near,'Gale Arrow')<rank(low,'Gale Arrow'),`Gale Arrow at 7 ranks ${rank(near,'Gale Arrow')+1}, at 1 ranks ${rank(low,'Gale Arrow')+1}`);
  assert.match(near.find(step=>step.name==='Gale Arrow').why,/One level from its Specialty slot 1/);
  assert.notDeepEqual(near.map(step=>step.name),low.map(step=>step.name),'Different levels, different order');
  // A skill past its slot aims for the next one, from the level it has.
  const step=at({'Drill Dart':9}).find(item=>item.name==='Drill Dart');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level changes the setup; Next at Lv N is one change with its reason',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.setup.daevanion.waits,p.nextAt?.level]);
  const seen=new Set(LEVELS.map(level=>key(plan(level))));
  assert.ok(seen.size>=7,`${seen.size} different setups over ${LEVELS.length} levels`);
  for(const level of LEVELS){
    const p=plan(level);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`Lv ${level}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.doesNotMatch(p.nextAt.text,/the your/,'Every stack has a name the line can say');
    const later=plan(p.nextAt.level);
    assert.notEqual(JSON.stringify([later.setup.line,later.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),later.skillBar.left.map(k=>later.skillBar.stacks[k].skills.map(cell=>cell.name)),later.setup.daevanion.open]),
      JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.skillBar.left.map(k=>p.skillBar.stacks[k].skills.map(cell=>cell.name)),p.setup.daevanion.open]),`Lv ${level}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([1,5,12,22].map(level=>plan(level).nextAt.level),[3,7,14,27]);
  assert.equal(plan(5).nextAt.text,'Gale Arrow joins the set-up stack.');
  assert.equal(plan(22).nextAt.text,'Stigma slot 2 opens: put Griffon Arrow in it.');
});

check('the first move follows the plan',()=>{
  for(const level of LEVELS){
    const first=plan(level).now[0];
    if(!first)continue;
    const p=plan(level);
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name}`));
  }
});

check('Daevanion inside the points: by hand the first board and the skill nodes the Daeva has now',()=>{
  assert.equal(plan(5).setup.daevanion.board,null);
  assert.equal(plan(5).setup.daevanion.firstLevel,12);
  const hand=plan(12).setup.daevanion;
  assert.equal(hand.board.name,'Nezekan');
  assert.deepEqual(hand.now,['Drill Dart','Snipe','Gale Arrow','Tempest Shot']);
  assert.deepEqual(hand.waits,['Deadshot'],'Deadshot\'s node waits for the skill (Lv 14)');
  assert.deepEqual(plan(14).setup.daevanion.waits,[]);
  // With a Daeva and points in hand the route never plans past them, nor past the season budget.
  for(const points of [0,3,10,40,null]){
    const p=plan(30,'dps',{model:daeva(30),daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    if(!route)continue;
    if(points!==null)assert.ok(route.plannedCost<=points,`${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget);
  }
});

check('logic over copying: every trend has a count and a verdict; rejected ones say why',()=>{
  const p=plan(45);
  const byId=Object.fromEntries(p.setup.trends.map(item=>[item.id,item]));
  for(const item of p.setup.trends){assert.ok(item.count,`${item.id}: count`);assert.ok(item.verdict,`${item.id}: verdict`);assert.equal(item.status,'reported');}
  assert.equal(byId['line-vaizel'].used,false);
  assert.match(byId['line-vaizel'].verdict,/own key/);
  assert.equal(byId['line-griffon'].used,false);
  assert.equal(byId['line-burst'].used,false);
  for(const id of ['stigma-vaizel','stigma-bow','stigma-supporting-fire','stigma-griffon'])assert.equal(byId[id].used,true,id);
  assert.equal(byId['stigma-explosive'].used,false,'Explosive Arrow stays a swap');
  assert.match(byId['stigma-explosive'].verdict,/^Ranked 5/);
  assert.equal(byId['stigma-bow-second'].used,false);
  assert.match(byId['stigma-bow-second'].verdict,/^Slot 2 takes Griffon Arrow/);
  assert.equal(byId['mastery-deadshot-first'].used,true);
  assert.equal(plan(12).setup.trends.find(item=>item.id==='mastery-drill-early').used,true);
  // Specialty picks: every pick carries a reason, and Tempest Shot's Lv 8 pick is the extra damage, not less MP.
  for(const skill of p.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
  assert.equal(p.skills.find(skill=>skill.name==='Tempest Shot').picks.find(pick=>pick.skillLevel===8).pick,'Up to 12% more damage when fewer targets hit');
  for(const step of p.mastery.spend)assert.ok(step.why);
});

check('data: every Ranger skill the plan uses has values and synergies with a status and refs that resolve; no guide names, no dashes',()=>{
  const used=new Set([...cells(plan(45).skillBar).map(cell=>cell.name),...plan(45).skillBar.later.map(item=>item.name),...builds.records[0].coreSkills.map(skill=>skill.name)]);
  for(const name of used)assert.ok(ranger.some(item=>item.name===name),`${name} has a record`);
  for(const record of ranger){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    assert.ok(typeof record.summary==='string',`${record.name}: summary`);
    assert.ok(typeof record.cooldownSeconds==='number',`${record.name}: cooldown`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...record.specialties.flatMap(perk=>perk.values??[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[–—]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|whelps/i);
    }
    // An "opens" link must name a Ranger skill on the same key; the Ranger has none (Snare Shot sets up stack B from stack A).
    assert.ok(!record.synergies.some(item=>item.type==='opens'),`${record.name}: no cross-key opens link`);
    if(record.training)for(const [skillLevel,characterLevel] of Object.entries(record.training))assert.ok(characterLevel>=unlockOf(record.name),`${record.name}: skill Lv ${skillLevel}`);
  }
  for(const build of builds.records){
    const refs=new Set(build.provenance.map(source=>source.ref));
    for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
    for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    for(const ref of build.daevanion.refs)assert.ok(refs.has(ref),ref);
  }
  assert.doesNotMatch(readFileSync(new URL('games/aion2/docs/level-guidance/ranger.md',root),'utf8'),/[–—]/,'No dashes in the record');
});

/* The screens (Playwright, a local static server, no network). The setup for now and one Next at Lv N line on every Ascent
   Plan screen; the Skill Bar lists only what can be placed now; level changes the screens; REPORTED is tagged. */
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
    await context.route(/plaync\.com|typekit\.net|playnccdn\.com/,route=>route.fulfill({status:204,body:''}));
    await context.route(/aetherium-worker\.[^/]*workers\.dev/,route=>{real.push(route.request().url());return route.abort();});
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
  const screen=(level,view,role='dps')=>`/hub/aetherium/ascent/${view?`${view}/`:''}?class=ranger&role=${role}&level=${level}`;
  const VIEWS=['','mastery','skill-bar','stigma','daevanion','macro','stats'];

  await bcheck('every Ascent Plan screen shows the setup for now and one Next at Lv N line, with REPORTED tagged',async()=>{
    for(const view of VIEWS){
      const {page,context,errors}=await open(screen(5,view));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      assert.equal(await plain(page,'#aeSetup [data-setup="line"] dd'),plan(5).setup.line[0].skills.join(', '));
      assert.equal(await page.locator('#aeNextAt').count(),1,'One Next line');
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 Gale Arrow joins the set-up stack\./);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),0,'REPORTED tagged');
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="setup-unconfirmed"]').count(),0);
      assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/[–—]/,`${view||'menu'}: no dashes`);
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar: only what can be placed now; the rest in Comes later',async()=>{
    for(const level of [5,22,45]){
      const {page,context}=await open(screen(level,'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      // The grid draws the game's keys, 1 to 8, Q, E, left and right click and the second stack (17 Oct 2026), so every
      // planned skill is drawn.
      const planned=cells(plan(level).skillBar).map(cell=>cell.name);
      assert.ok(onBar.every(name=>planned.includes(name)),`Lv ${level}: ${onBar} not all in the plan`);
      const copy=await plain(page,'#aeCopyBar');
      for(const name of planned)assert.ok(onBar.includes(name)||copy.includes(name),`Lv ${level}: ${name} is neither drawn nor in Copy this bar`);
      for(const name of planned)assert.ok(onBar.includes(name),`Lv ${level}: ${name} is drawn on the bar`);
      await context.close();
    }
  });

  await bcheck('level changes the screens; a role with no Ranger build says it shows DPS',async()=>{
    const read=async path=>{
      const {page,context}=await open(path);
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(',')].join('|'));
      await context.close();
      return out;
    };
    const lv5=await read(screen(5,'skill-bar')),lv22=await read(screen(22,'skill-bar')),lv45=await read(screen(45,'skill-bar'));
    assert.notEqual(lv5,lv22);assert.notEqual(lv22,lv45);
    const {page,context}=await open(screen(22,'','tank'));
    assert.match(await plain(page,'#aePlan > .ae-callout'),/Ranger has no Tank build, so this shows its main role\./);
    await context.close();
    const m=await open(screen(22,'mastery'));
    const rows=await m.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
    assert.deepEqual(rows,plan(22).mastery.spend.slice(0,4).map(step=>step.name),'The first four steps, in the plan order');
    await m.context.close();
  });

  if(process.env.AE_SHOTS){
    for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(level,view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`ranger-${view}-dps-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_RANGER=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_RANGER=PASS');
