#!/usr/bin/env node
// The level planner for the Cleric (brief feature/aetherium-level-cleric, 17 Oct 2026). Offline, no network.
//   For the Cleric at Lv 1, 5, 12, 22, 27, 32, 37 and 45, as healer and as dps:
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken; Condemnation always has Chain of Torment below it on its key;
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points;
//   - level and role each change the setup and the screens;
//   - logic over copying: trends the logic rejects carry the reason; every choice carries one;
//   - the Cleric data: values and synergies with a status and refs, no guide names, no dashes.
// The other classes are checked by test-aetherium-level-planner.mjs. AE_BROWSER=0 skips the page checks (Playwright).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AION2_CLASSES,buildAscentPlan,stackProblems} from '../games/aion2/engine/ascent-advisor.mjs';
import {weightsFor} from '../games/aion2/engine/level-planner.mjs';
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
const fx=name=>json(`tools/fixtures/aion2/eu/${name}.json`);

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=['healer','dps'];
const plan=(level,role,extra={})=>buildAscentPlan({className:'Cleric',role,level,data:data('Cleric'),...extra});
const label=(level,role)=>`Cleric ${role} Lv ${level}`;
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const unlockOf=name=>icons.Cleric.records[0].skills.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const names=stack=>stack.skills.map(cell=>cell.name);

check('every case: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
    assert.equal(p.role,role,`${at}: the role's own build`);
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
    if(level===45)assert.deepEqual(p.skillBar.later,[],`${at}: nothing comes later at 45`);
  }
});

check('every case: no stack rule broken; Condemnation sits above Chain of Torment, never without it',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=label(level,role);
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(cells(p.skillBar).some(cell=>cell.name===row.name),`${at}: ${row.name}`);
    }
    for(const stack of Object.values(p.skillBar.stacks)){
      const at2=names(stack).indexOf('Condemnation');
      if(at2<0)continue;
      const chain=names(stack).indexOf('Chain of Torment');
      assert.ok(chain>=0&&chain<at2,`${at}: key ${stack.key} holds Condemnation without Chain of Torment below it (${names(stack)})`);
    }
    // Heals and buffs never in the macro.
    for(const name of ['Light of Regeneration','Healing Light','Radiant Recovery','Absolution','Benevolence','Prayer of Amplification','Noble Aura','Light of Protection','Bolt'])
      assert.ok(!names(p.skillBar.stacks.A).includes(name)&&!names(p.skillBar.stacks.B).includes(name),`${at}: ${name} in the macro`);
  }
});

check('Lv 1 and Lv 5: a real low-level setup',()=>{
  for(const role of ROLES){
    const one=plan(1,role);
    assert.deepEqual(names(one.skillBar.stacks.A),['Debilitating Mark','Judgment Thunder'],`${role} Lv 1 stack A`);
    assert.deepEqual(names(one.skillBar.stacks.B),[],`${role} Lv 1: Chain of Torment comes at Lv 4, so stack B waits`);
    assert.equal(one.skillBar.mainAttack,"Earth's Retribution");
    assert.ok(one.skillBar.later.some(item=>item.name==='Chain of Torment'&&item.unlockLevel===4));
    assert.ok(one.mastery.spend.length>0,`${role} Lv 1: something to level`);
    const five=plan(5,role);
    assert.deepEqual(names(five.skillBar.stacks.A),['Divine Aura','Debilitating Mark','Judgment Thunder'],`${role} Lv 5 stack A`);
    assert.deepEqual(names(five.skillBar.stacks.B),['Chain of Torment'],`${role} Lv 5 stack B`);
    assert.ok(five.skillBar.later.some(item=>item.name==='Condemnation'&&item.unlockLevel===8));
    assert.ok(five.setup.stigmas.every(slot=>!slot.open),'No stigma slot at Lv 5');
    assert.equal(five.nextAt.level,7);
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
      const train=skills.records.find(item=>item.class==='Cleric'&&item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`${label(level,role)}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
    }
  }
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const board=adaptDaevanionBoard(fx('astrix285-daevanion-11'));
  for(const role of ROLES){
    const priorities=routePriorities(builds.Cleric.records.find(build=>build.role===role).daevanion);
    for(const have of [0,3,10,40]){
      const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:board}],priorities,budget:{points:415,boardCost:{}},have});
      assert.ok(routed.plannedCost<=have,`${role}: ${routed.plannedCost} planned with ${have} points`);
      assert.ok(routed.spent+routed.plannedCost<=routed.budget,`${role}: inside the budget`);
      let left=have;
      for(const step of routed.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
    }
    // By hand: no board before Lv 12, then Nezekan with the +1 nodes for skills the Daeva has.
    assert.equal(plan(5,role).setup.daevanion.board,null);
    assert.equal(plan(5,role).setup.daevanion.firstLevel,12);
    const hand=plan(12,role).setup.daevanion;
    assert.equal(hand.board.name,'Nezekan');
    assert.ok(hand.now.includes('Condemnation'),`${role}: Condemnation's node now`);
    assert.ok(hand.waits.length===0||hand.waits.every(name=>unlockOf(name)>12),`${role}: only skills not learned yet wait`);
  }
  assert.ok(plan(12,'dps').setup.daevanion.waits.includes('Bolt'),'Bolt (Lv 14) waits');
});

check('level and role each change the setup',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level]);
  for(const role of ROLES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role))));
    assert.ok(seen.size>=6,`${role}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  for(const level of LEVELS.filter(item=>item>1))assert.notEqual(key(plan(level,'healer')),key(plan(level,'dps')),`Lv ${level}: role`);
  // Each role gets its own answer: the healer's four are heals and the party buff, the dps four are damage.
  assert.deepEqual(plan(45,'healer').setup.stigmas.map(slot=>slot.name),['Light of Protection','Absolution','Summon Resurrection','Benevolence']);
  assert.deepEqual(plan(45,'dps').setup.stigmas.map(slot=>slot.name),['Light of Protection','Prayer of Amplification','Noble Aura','Earth Punishment']);
  // The healer levels a heal first from Lv 12; the dps levels Condemnation first.
  assert.match(plan(22,'healer').mastery.spend[0].name,/Healing Light|Light of Regeneration|Radiant Recovery/);
  assert.equal(plan(22,'dps').mastery.spend[0].name,'Condemnation');
  // Earth Punishment joins Condemnation's key the level its slot opens, for the dps; the healer does not slot it.
  assert.deepEqual(names(plan(32,'dps').skillBar.stacks.B),['Chain of Torment','Condemnation']);
  assert.deepEqual(names(plan(37,'dps').skillBar.stacks.B),['Chain of Torment','Earth Punishment','Condemnation']);
  assert.deepEqual(names(plan(45,'healer').skillBar.stacks.B),['Chain of Torment','Condemnation']);
});

check('Next at Lv N: one change with its reason, never at or below the level, none at the cap',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt,`${label(level,role)}: a next step`);
    assert.ok(p.nextAt.level>level&&p.nextAt.level<=45);
    assert.ok(p.nextAt.text.length>10);
    assert.doesNotMatch(p.nextAt.text,/the your /,'The stack has a name');
    const later=plan(p.nextAt.level,role);
    assert.notEqual(JSON.stringify([later.setup.line,later.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),later.skillBar.left.map(key=>later.skillBar.stacks[key].skills.map(cell=>cell.name)),later.setup.daevanion.open]),
      JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.skillBar.left.map(key=>p.skillBar.stacks[key].skills.map(cell=>cell.name)),p.setup.daevanion.open]),`${label(level,role)}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.equal(plan(1,'healer').nextAt.text,'Divine Aura joins the thunder stack.');
  assert.match(plan(22,'healer').nextAt.text,/Stigma slot 2 opens: put Absolution in it/);
  assert.match(plan(22,'dps').nextAt.text,/Stigma slot 2 opens: put Prayer of Amplification in it/);
});

check('logic over copying: every rejected trend says why; heals and buffs stay off the macro',()=>{
  for(const role of ROLES){
    const p=plan(45,role);
    const byId=Object.fromEntries(p.setup.trends.map(item=>[item.id,item]));
    for(const item of p.setup.trends){assert.ok(item.count,`${role} ${item.id}: count`);assert.ok(item.verdict,`${role} ${item.id}: verdict`);assert.equal(item.status,'reported');}
    assert.deepEqual(names(p.skillBar.stacks.A),['Divine Aura','Debilitating Mark','Judgment Thunder'],`${role}: the published stack A`);
    assert.equal(byId['line-light-of-regeneration'].used,false);
    assert.match(byId['line-light-of-regeneration'].verdict,/own key/);
    for(const q of [plan(45,role),plan(22,role)])for(const slot of q.setup.stigmas)assert.ok(slot.why,`${role}: slot ${slot.slot}`);
    for(const step of p.mastery.spend)assert.ok(step.why);
    for(const skill of p.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
  }
  const healer=Object.fromEntries(plan(45,'healer').setup.trends.map(item=>[item.id,item]));
  const dps=Object.fromEntries(plan(45,'dps').setup.trends.map(item=>[item.id,item]));
  // Top players run Noble Aura and Earth Punishment; for a healer, the heals are worth more.
  assert.equal(healer['stigma-noble-aura'].used,false);
  assert.match(healer['stigma-noble-aura'].verdict,/Absolution/);
  assert.equal(healer['stigma-earth-punishment'].used,false);
  assert.equal(healer['line-earth-punishment'].used,false);
  assert.equal(healer['mastery-condemnation-first'].used,false,'A healer levels a heal first');
  // The dps takes all four of the published dps stigmas, but not Earth Punishment first: Light of Protection is on all the time.
  for(const id of ['stigma-earth-punishment','stigma-light-of-protection','stigma-noble-aura','stigma-prayer'])assert.equal(dps[id].used,true,id);
  assert.equal(dps['stigma-earth-punishment-first'].used,false);
  assert.match(dps['stigma-earth-punishment-first'].verdict,/Slot 1 takes Light of Protection/);
  assert.ok(plan(22,'dps').skillBar.later.some(item=>item.name==='Earth Punishment'&&item.unlockLevel===37),'Earth Punishment joins the Condemnation key at Lv 37');
  for(const id of ['line-prayer','line-noble-aura']){assert.equal(dps[id].used,false,id);assert.match(dps[id].verdict,/own key/,id);}
  assert.equal(dps['mastery-condemnation-first'].used,true);
  // Specialty: the healer's Light of Regeneration Lv 8 pick follows the values, not the most copied pick.
  const regen=plan(45,'healer').skills.find(skill=>skill.name==='Light of Regeneration').picks.find(pick=>pick.skillLevel===8);
  assert.deepEqual([regen.pick,regen.over],['20% more healing at or below 50% HP','+5% Incoming Heal while healing']);
});

check('data: every Cleric skill the builds use has values and synergies with a status and refs; no guide names, no dashes',()=>{
  const used=new Set(builds.Cleric.records.flatMap(build=>[...build.coreSkills.map(item=>item.name),...build.stigmas.slots.map(slot=>slot.name),...build.stigmas.alternatives.map(alt=>alt.name),...build.macro.ownKeys.flatMap(item=>item.stack??[item.name])]));
  for(const name of used)assert.ok(skills.records.some(item=>item.class==='Cleric'&&item.name===name),`${name}: in skills.json`);
  for(const record of skills.records.filter(item=>item.class==='Cleric')){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    assert.ok(typeof record.cooldownSeconds==='number'||record.cooldownSeconds?.pending,`${record.name}: cooldown`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...(Array.isArray(record.specialties)?record.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[\u2013\u2014]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|ExpCarry|MrRosaPony/i);
    }
    for(const link of record.synergies.filter(item=>item.type==='opens'))assert.ok(skills.records.some(item=>item.class==='Cleric'&&item.name===link.target),`${record.name} opens ${link.target}`);
  }
  // The tooltip facts the plan rests on.
  const rec=name=>skills.records.find(item=>item.class==='Cleric'&&item.name===name);
  assert.equal(rec('Chain of Torment').synergies.find(item=>item.type==='opens').target,'Condemnation');
  assert.equal(rec('Condemnation').synergies.find(item=>item.type==='condition').status,'confirmed');
  assert.equal(rec("Earth's Retribution").cooldownSeconds,0);
  assert.equal(rec('Judgment Thunder').cooldownSeconds,0);
  assert.deepEqual(rec('Condemnation').training,{8:26,10:32});
  for(const build of builds.Cleric.records){
    const refs=new Set(build.provenance.map(source=>source.ref));
    for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
    for(const pref of build.ascent.preferences)for(const ref of pref.refs)assert.ok(refs.has(ref),`${build.id} ${pref.id}`);
    assert.ok(weightsFor(build,null).weights.damage>0);
    assert.doesNotMatch(JSON.stringify(build),/[\u2013\u2014]/);
  }
});

/* The screens (Playwright, a local static server, the Worker off: never NCSOFT). The setup carries REPORTED; the Skill Bar
   and Copy this bar list only what can be placed now; level and role each change the screens; no sideways scroll at 390.
   AE_SHOTS=<dir outside the repo> saves the Skill Bar and Mastery at Lv 5, 22 and 45 for each role, at 1600 and 390. */
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
    return {page,context,errors};
  }
  const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();
  const screen=(query,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?${query}`;
  const q=(level,role)=>`class=cleric&role=${role}&level=${level}`;

  await bcheck('the setup for now carries REPORTED and one Next line, for each role',async()=>{
    for(const role of ROLES){
      const {page,context,errors}=await open(screen(q(5,role),'skill-bar'));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),'5');
      const line=`${await plain(page,'#aeSetup [data-setup="line"] dt')}: ${await plain(page,'#aeSetup [data-setup="line"] dd')}`;
      // The strip names one stack: the Cleric's first named stack is stack A (the Skill Bar shows both).
      assert.equal(line,'Thunder stack: Divine Aura, Debilitating Mark, Judgment Thunder',`${role}: the line`);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),1,`${role}: REPORTED tagged`);
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="setup-unconfirmed"]').count(),0,`${role}: no Not confirmed yet on the setup`);
      assert.equal(await page.locator('#aeNextAt').count(),1);
      assert.match(await plain(page,'#aeNextAt'),/^Next at Lv 7 /);
      assert.deepEqual(errors,[]);
      await context.close();
    }
  });

  await bcheck('Skill Bar and Copy this bar: only what can be placed now; the rest in Comes later',async()=>{
    for(const role of ROLES)for(const level of [5,22,45]){
      const {page,context}=await open(screen(q(level,role),'skill-bar'));
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`${role} Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`${role} Lv ${level}: the copy list`);
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      if(level===45)assert.equal(later.length,0,'Nothing comes later at 45');
      else assert.ok(later.length>0);
      assert.deepEqual(await page.$$eval('#aeRightBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['A','LMB','B']);
      assert.doesNotMatch(await plain(page,'main'),/Cooldown not captured yet/,'Every Cleric cooldown is captured from the tooltip');
      await context.close();
    }
  });

  await bcheck('level and role each change the screens; no sideways scroll at 390',async()=>{
    const read=async(query,width=1600)=>{
      const {page,context}=await open(screen(query,'skill-bar'),{viewport:{width,height:900}});
      const out=await page.evaluate(()=>[document.querySelector('#aeSetup').innerText,[...document.querySelectorAll('#aeSkillBar [data-bar-skill]')].map(el=>el.dataset.barSkill).join(',')].join('|'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${query} ${width}: no sideways scroll`);
      await context.close();
      return out;
    };
    const lv5=await read(q(5,'healer')),lv22=await read(q(22,'healer')),lv45=await read(q(45,'healer'),390);
    assert.notEqual(lv5,lv22);assert.notEqual(lv22,lv45);
    const dps22=await read(q(22,'dps'),390);
    assert.notEqual(lv22,dps22,'role');
    assert.match(lv45,/Absolution/);assert.match(dps22,/Light of Protection/);
    const m=await open(screen(q(22,'dps'),'mastery'));
    const rows=await m.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
    assert.equal(rows[0],'Condemnation');
    await m.context.close();
    const h=await open(screen(q(22,'healer'),'mastery'));
    assert.match((await h.page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy)))[0],/Healing Light|Light of Regeneration|Radiant Recovery/);
    await h.context.close();
  });

  if(process.env.AE_SHOTS){
    for(const role of ROLES)for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
      const {page,context}=await open(screen(q(level,role),view),{viewport:{width,height:1000}});
      await page.screenshot({path:resolve(process.env.AE_SHOTS,`cleric-${view}-${role}-lv${level}-${width}.png`),fullPage:true});
      await context.close();
    }
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_CLERIC=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_CLERIC=PASS');
