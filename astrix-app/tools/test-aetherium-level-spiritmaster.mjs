#!/usr/bin/env node
// The level planner for the Spiritmaster (brief feature/aetherium-level-spiritmaster, 17 Oct 2026). Offline, no network.
//   For the Spiritmaster at Lv 1, 5, 12, 22, 27, 32, 37 and 45, every role it plays (DPS only):
//   - no locked skill on the bar or in "Copy this bar", and every skill held back is in Comes later with when or why;
//   - no stack rule broken, and no skill on two keys;
//   - Mastery never past the cap, and the trainer's level is said when a step cannot be bought yet;
//   - Daevanion inside the points: the route never plans past the points the player has, nor the season budget;
//   - level changes the setup; the role list is one role, so the role answer is the DPS answer;
//   - logic over copying: every trend carries its count and the logic's verdict; rejected ones say why;
//   - the data: values and synergies with a status and refs that resolve, no source names, no dashes.
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
const astrix=module.normaliseCharacter({info:fx('astrix285-info'),equipment:fx('astrix285-equipment')},{region:'eu',capturedOn:'2026-10-05'});

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};

const CLASS='Spiritmaster';
const LEVELS=[1,5,12,22,27,32,37,45];
const ROLES=rolesFor(builds[CLASS]).map(item=>item.role);
const plan=(level,role='dps',extra={})=>buildAscentPlan({className:CLASS,role,level,data:data(CLASS),...extra});
const cells=bar=>Object.values(bar.stacks).flatMap(stack=>stack.skills);
const SKILLS=icons[CLASS].records[0].skills;
const unlockOf=name=>SKILLS.find(skill=>skill.name===name)?.needLevel;
const CAP=mechanics.records.find(item=>item.id==='mastery-cap').value.cap;
const names=(p,key)=>p.skillBar.stacks[key].skills.map(cell=>cell.name);

/* A Spiritmaster Daeva from the class's skill list: every skill learned at the level, at the skill levels given. */
function daeva(level,levels={}){
  const live=structuredClone(astrix);
  live.profile.level=level;
  live.profile.class=CLASS;
  live.skills=SKILLS.map((skill,index)=>({id:16000000+index,name:skill.name,icon:null,category:skill.category,needLevel:skill.needLevel,skillLevel:skill.needLevel<=level?(levels[skill.name]??1):0,acquired:skill.needLevel<=level,equipped:skill.category!=='Passive'&&skill.needLevel<=level}));
  return live;
}

check('the Spiritmaster plays one role, DPS, and the build has an ascent record with weights',()=>{
  assert.deepEqual(ROLES,['dps']);
  const build=builds[CLASS].records.find(item=>item.role==='dps');
  const w=weightsFor(build,null);
  assert.ok(w&&w.weights.damage>w.weights.survival,'Damage first');
  assert.equal(w.status,'reported');
  assert.equal(plan(22).setup.planned,true);
  assert.equal(plan(22).setup.confirmed,false,'REPORTED, never presented as confirmed');
});

check('every level: no locked skill on the bar or in Copy this bar, and what waits is in Comes later',()=>{
  for(const role of ROLES)for(const level of LEVELS){
    const p=plan(level,role);
    const at=`${role} Lv ${level}`;
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
    const at=`${role} Lv ${level}`;
    assert.deepEqual(stackProblems(p.skillBar),[],`${at}: stack rule`);
    assert.deepEqual(p.skillBar.problems,[],`${at}: bar checks`);
    const all=cells(p.skillBar).map(cell=>cell.name);
    assert.deepEqual(all,[...new Set(all)],`${at}: a skill on two keys`);
    for(const entry of p.macro.entries)for(const row of entry.skills){
      assert.equal(row.inMacro,true,`${at}: ${row.name} in the macro but not usable`);
      assert.ok(all.includes(row.name),`${at}: ${row.name}`);
    }
  }
});

check('the setup at each level: from the first level, spirits on the spirit line, Combustion on the main line',()=>{
  const at=level=>plan(level);
  assert.deepEqual([names(at(1),'A'),names(at(1),'LMB'),names(at(1),'B')],[['Summon: Fire Spirit'],['Cold Shock'],['Combustion']]);
  assert.deepEqual(names(at(5),'A'),['Jointstrike: Curse','Summon: Water Spirit','Summon: Fire Spirit']);
  assert.deepEqual(names(at(12),'A'),['Jointstrike: Curse','Summon: Earth Spirit','Summon: Water Spirit','Summon: Fire Spirit']);
  assert.deepEqual(names(at(12),'B'),['Dimensional Control','Combustion']);
  assert.deepEqual(names(at(22),'B'),['Dimensional Control','Elemental Fusion','Combustion']);
  assert.deepEqual(names(at(32),'B'),['Jointstrike: Corrode','Dimensional Control','Elemental Fusion','Combustion']);
  // The Fire Spirit is summoned last at every level, so it is the spirit that stays out.
  for(const level of LEVELS)assert.equal(names(at(level),'A').at(-1),'Summon: Fire Spirit',`Lv ${level}`);
  // Stigmas: Ancient Spirit first (it gives Four Elements for Elemental Fusion), then Benediction, Corrode, Flame Blessing.
  assert.deepEqual(at(45).setup.stigmas.map(slot=>slot.name),['Summon: Ancient Spirit',"Enhance: Spirit's Benediction",'Jointstrike: Corrode','Flame Blessing']);
  assert.match(at(22).setup.stigmas[0].why,/Four Elements/);
  assert.ok(at(5).setup.stigmas.every(slot=>!slot.open),'No stigma slot at Lv 5');
  assert.deepEqual(at(22).setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),['Summon: Ancient Spirit']);
});

check('own keys never move as the Daeva levels: a skill still to come keeps its key free',()=>{
  const keyOf=(p,name)=>p.skillBar.left.find(key=>p.skillBar.stacks[key].skills.some(cell=>cell.name===name)||p.skillBar.stacks[key].reserved?.includes(name));
  const top=plan(45);
  for(const level of LEVELS){
    const p=plan(level);
    for(const key of top.skillBar.left)for(const cell of top.skillBar.stacks[key].skills)assert.equal(keyOf(p,cell.name),key,`Lv ${level}: ${cell.name} on key ${key}`);
  }
});

check('Mastery never past the cap; a step the trainer cannot sell yet says from which level',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    assert.ok(p.mastery.spend.length>0,`Lv ${level}: something to level`);
    for(const step of p.mastery.spend){
      assert.ok(step.to<=CAP,`Lv ${level}: ${step.name} to ${step.to}`);
      assert.ok(step.why,`Lv ${level}: ${step.name} carries a reason`);
      const train=skills.records.find(item=>item.class===CLASS&&item.name===step.name)?.training?.[String(step.to)]??null;
      assert.equal(step.waits,train&&level<train?train:null,`Lv ${level}: ${step.name} training level`);
      if(step.waits)assert.match(step.why,new RegExp(`character Lv ${step.waits}`));
      assert.ok(unlockOf(step.name)<=level,`Lv ${level}: ${step.name} is not learned yet`);
    }
  }
  const core=['Combustion','Cold Shock','Summon: Fire Spirit','Elemental Fusion','Dimensional Control','Jointstrike: Curse'];
  const p=buildAscentPlan({className:CLASS,role:'dps',data:data(CLASS),model:daeva(45,Object.fromEntries(core.map(name=>[name,CAP])))});
  assert.ok(p.mastery.spend.every(step=>step.to<=CAP&&step.from<step.to),'Never a step past the cap');
  assert.ok(!p.mastery.spend.some(step=>core.includes(step.name)),'Capped skills get no step');
  assert.deepEqual(p.mastery.atCap.map(item=>item.name).sort(),[...core].sort());
});

check('real skill levels drive the Mastery order',()=>{
  const at=levels=>buildAscentPlan({className:CLASS,role:'dps',data:data(CLASS),model:daeva(30,levels)}).mastery.spend;
  const rank=(list,name)=>list.findIndex(step=>step.name===name);
  const near=at({'Cold Shock':7}),low=at({'Cold Shock':1});
  assert.ok(rank(near,'Cold Shock')<rank(low,'Cold Shock'),`Cold Shock at 7 ranks ${rank(near,'Cold Shock')+1}, at 1 ranks ${rank(low,'Cold Shock')+1}`);
  assert.match(near.find(step=>step.name==='Cold Shock').why,/One level from its Specialty slot 1/);
  const step=at({Combustion:9}).find(item=>item.name==='Combustion');
  assert.deepEqual([step.from,step.to,step.reason],[9,CAP,'reaches the Mastery cap']);
});

check('level changes the setup; the next change is one step with its reason',()=>{
  const key=p=>JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.mastery.spend.slice(0,3).map(step=>step.name),p.setup.daevanion.board,p.nextAt?.level]);
  for(const role of ROLES){
    const seen=new Set(LEVELS.map(level=>key(plan(level,role))));
    assert.ok(seen.size>=6,`${role}: ${seen.size} different setups over ${LEVELS.length} levels`);
  }
  for(const level of LEVELS){
    const p=plan(level);
    if(level===45){assert.equal(p.nextAt,null);continue;}
    assert.ok(p.nextAt&&p.nextAt.level>level&&p.nextAt.level<=45,`Lv ${level}: a next step`);
    assert.doesNotMatch(p.nextAt.text,/the your/,'Every stack has a name');
    const later=plan(p.nextAt.level);
    assert.notEqual(JSON.stringify([later.setup.line,later.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),later.setup.daevanion.open]),
      JSON.stringify([p.setup.line,p.setup.stigmas.filter(slot=>slot.open).map(slot=>slot.name),p.setup.daevanion.open]),`Lv ${level}: Lv ${p.nextAt.level} changes the setup`);
  }
  assert.deepEqual([1,5,12,22].map(level=>plan(level).nextAt.level),[3,7,14,27]);
  assert.match(plan(1).nextAt.text,/Summon: Water Spirit joins the spirit line/);
  assert.match(plan(22).nextAt.text,/Stigma slot 2 opens: put Enhance: Spirit's Benediction in it/);
  // The Spiritmaster's answer is not the Gladiator's.
  assert.notDeepEqual(plan(22).setup.line,buildAscentPlan({className:'Gladiator',role:'dps',level:22,data:data('Gladiator')}).setup.line);
});

check('the first move follows the plan',()=>{
  for(const level of LEVELS){
    const p=plan(level);
    const first=p.now[0];
    if(!first)continue;
    if(/^Level /.test(first.title))assert.match(first.title,new RegExp(`^Level (your skills in this order: )?${p.mastery.spend[0].name.replace(/[:']/g,'.')}`));
  }
});

/* The Nezekan board from the fixture, with its skill +1 nodes named for the Spiritmaster. Every class shares the board
   layout (questlog game database, board 51 against board 11): the node ids differ only in the board prefix. */
const SM_NODES={37:'Spirit Protection',39:"Soul's Cry",41:"Spirit's Descent",50:'Jointstrike: Curse',63:'Spirit Strike',68:'Summon: Fire Spirit',71:'Dimensional Control',73:'Corrode',95:'Combustion',100:'Spirit Revitalization',108:'Defiance',118:'Rapid Scattershot',126:'Corrode',131:'Cold Shock',153:'Spirit Revitalization',155:'Summon: Wind Spirit',158:'Summon: Water Spirit',163:'Spirit Protection',176:'Summon: Earth Spirit',185:"Spirit's Descent",187:'Elemental Fusion',189:'Spirit Strike'};
const smBoard=()=>adaptDaevanionBoard(fx('astrix285-daevanion-11')).map(node=>{
  const name=SM_NODES[node.nodeId-110000];
  return name?{...node,name:`Skill Level Up - ${name}`,effects:[`${name} +1`]}:node;
});

check('Daevanion inside the points: never past the points the player has, nor the season budget',()=>{
  const board=smBoard();
  assert.equal(board.filter(node=>/^Skill Level Up/.test(node.name)).every(node=>Object.values(SM_NODES).some(name=>node.name.endsWith(name))),true,'Every skill node is a Spiritmaster skill');
  const live=daeva(12);
  live.daevanion=live.daevanion.map(item=>(item.id===11?{...item,nodes:board}:item));
  for(const points of [0,3,10,40,null]){
    const p=buildAscentPlan({className:CLASS,role:'dps',data:data(CLASS),model:live,daevanionPoints:points});
    const route=p.daevanion.roleRoute;
    assert.ok(route,'A route with the board read');
    if(points!==null)assert.ok(route.plannedCost<=points,`${route.plannedCost} planned with ${points} points`);
    assert.ok(route.spent+route.plannedCost<=route.budget,`inside the ${route.budget} budget`);
    let left=points??Infinity;
    for(const step of route.steps){left-=step.cost;assert.ok(left>=0,'Each step paid for');}
  }
  const priorities=routePriorities(builds[CLASS].records[0].daevanion);
  const routed=planRoleRoute({boards:[{id:11,name:'Nezekan',open:true,unlockLevel:12,nodes:board}],priorities,budget:{points:415,boardCost:{}},have:20});
  assert.ok(routed.plannedCost<=20);
  // By hand: no board before Lv 12; at Lv 12 Nezekan, with the key skill nodes the Daeva has.
  assert.equal(plan(5).setup.daevanion.board,null);
  assert.equal(plan(5).setup.daevanion.firstLevel,12);
  assert.equal(plan(12).setup.daevanion.board.name,'Nezekan');
  assert.ok(plan(12).setup.daevanion.now.includes('Combustion'));
  assert.ok(plan(12).setup.daevanion.waits.includes('Elemental Fusion'),'Elemental Fusion waits for the skill (Lv 14)');
});

check('logic over copying: every trend has a count and a verdict; the rejected ones say why',()=>{
  const seen=new Map();
  for(const level of LEVELS)for(const item of plan(level).setup.trends){
    assert.ok(item.count,`${item.id}: count`);
    assert.ok(item.verdict,`${item.id}: verdict`);
    assert.equal(item.status,'reported');
    seen.set(`${item.id}@${level}`,item);
  }
  const at=(id,level)=>seen.get(`${id}@${level}`);
  // Own-key skills never join the macro line, whatever the builds do.
  for(const id of ['line-cold-shock','line-benediction','line-rapid-scattershot']){
    assert.equal(at(id,45).used,false,id);
    assert.match(at(id,45).verdict,/own key|main attack/,id);
  }
  assert.equal(at('line-wind-spirit',45).used,false);
  assert.match(at('line-wind-spirit',45).verdict,/No free row/);
  for(const id of ['stigma-ancient','stigma-benediction','stigma-corrode','stigma-flame'])assert.equal(at(id,45).used,true,id);
  assert.equal(at('stigma-destructive',45).used,false);
  assert.match(at('stigma-destructive',45).verdict,/Ranked 5/);
  assert.equal(at('stigma-corrode-first',22).used,false,'Corrode first at Lv 22 (one guide) is rejected');
  assert.match(at('stigma-corrode-first',22).verdict,/Slot 1 takes Summon: Ancient Spirit/);
  assert.equal(at('mastery-combustion-early',5).used,true,'Combustion first while levelling');
  assert.equal(at('mastery-fusion-first',22).used,true,'Elemental Fusion first once you have it');
  // Specialty: the build's Fire Spirit Lv 8 pick (critical damage) loses to the skill chance, which feeds Elemental Fusion.
  const fire=plan(45).skills.find(skill=>skill.name==='Summon: Fire Spirit').picks.find(pick=>pick.skillLevel===8);
  assert.deepEqual([fire.pick,fire.over],['Extra 10% chance for the spirit to use its skill','Fire Spirit gains 20% critical damage']);
  const p=plan(45);
  for(const slot of p.setup.stigmas)assert.ok(slot.why,`slot ${slot.slot}`);
  for(const step of p.mastery.spend)assert.ok(step.why);
  for(const skill of p.skills)for(const pick of skill.picks)assert.ok(pick.why||pick.refs?.length,`${skill.name} ${pick.pick}`);
});

check('the macro stacks stay tagged Not confirmed yet: the published builds disagree on where Curse and Elemental Fusion go',()=>{
  const p=plan(45);
  assert.equal(p.macro.verified,false);
  assert.equal(p.skillBar.verified,false);
});

check('data: every Spiritmaster skill has values and synergies with a status and refs that resolve; no source names, no dashes',()=>{
  const mine=skills.records.filter(item=>item.class===CLASS);
  for(const record of mine){
    assert.ok(Array.isArray(record.values)&&record.values.length,`${record.name}: values`);
    assert.ok(Array.isArray(record.synergies),`${record.name}: synergies`);
    const refs=new Set(record.provenance.map(source=>source.ref));
    for(const item of [...record.values,...record.synergies,...(Array.isArray(record.specialties)?record.specialties.flatMap(perk=>perk.values??[]):[])]){
      assert.ok(['confirmed','reported'].includes(item.status),`${record.name}: ${item.text}`);
      for(const ref of item.refs)assert.ok(refs.has(ref),`${record.name}: ref ${ref}`);
      assert.doesNotMatch(item.text,/[–—]/);
      assert.doesNotMatch(item.text,/questlog|MetaBot|GAMES\.GG|GamesFuze|MMOEXP/i);
    }
    // An opens link is only ever to a skill of this class, and never from a skill on the bar to one on the other stack.
    for(const link of record.synergies.filter(item=>item.type==='opens'))assert.ok(mine.some(item=>item.name===link.target),`${record.name} opens ${link.target}`);
  }
  for(const record of mine)if(record.training)for(const [skillLevel,charLevel] of Object.entries(record.training))assert.ok(Number(skillLevel)>=8&&charLevel>=record.unlockLevel,`${record.name} training`);
  const build=builds[CLASS].records[0];
  const refs=new Set(build.provenance.map(source=>source.ref));
  for(const ref of build.ascent.refs)assert.ok(refs.has(ref),ref);
  for(const pref of build.ascent.preferences){
    for(const ref of pref.refs)assert.ok(refs.has(ref),`${pref.id}`);
    assert.doesNotMatch(`${pref.count} ${pref.why}`,/[–—]/);
  }
});

check('the other classes still run: no locked skill and no bar problem at every level',()=>{
  for(const name of AION2_CLASSES.filter(item=>item!==CLASS))for(const role of rolesFor(builds[name]))for(const level of LEVELS){
    const p=buildAscentPlan({className:name,role:role.role,level,data:data(name)});
    if(p.pending)continue;
    assert.deepEqual(p.skillBar?.problems??[],[],`${name} ${role.role} Lv ${level}: bar checks`);
    for(const cell of p.skillBar?cells(p.skillBar):[])assert.equal(cell.locked,false,`${name} ${role.role} Lv ${level}: ${cell.name} locked`);
  }
});

/* The screens (Playwright, a local static server; no Worker, no NCSOFT). The setup for now and one Next line on the
   Skill Bar and Mastery screens; level changes the screens; nothing locked on the bar; REPORTED tagged. */
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
  const screen=(level,view)=>`/hub/aetherium/ascent/${view?`${view}/`:''}?class=spiritmaster&role=dps&level=${level}`;

  await bcheck('Skill Bar: the setup for now, one Next line, REPORTED tagged, nothing locked; level changes the screen',async()=>{
    const seen=[];
    for(const level of [5,22,45]){
      const {page,context,errors}=await open(screen(level,'skill-bar'));
      assert.equal(await page.getAttribute('#aeSetup','data-setup-level'),String(level));
      assert.equal(await page.locator('#aeSetupTitle [data-status-tag="reported"]').count(),1,'REPORTED tagged');
      assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked,#aeSkillBar .ae-lock').count(),0,`Lv ${level}: nothing locked on the bar`);
      assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,`Lv ${level}: the copy list`);
      const onBar=await page.$$eval('#aeSkillBar [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
      const later=await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill));
      assert.ok(later.every(name=>!onBar.includes(name)),'Never on the bar and in Comes later');
      assert.equal(await page.locator('#aeNextAt').count(),level===45?0:1,'One Next line before the cap');
      const text=await page.evaluate(()=>document.body.innerText);
      assert.doesNotMatch(text,/[–—]/,'no dashes');
      assert.doesNotMatch(text,/questlog|MetaBot|MMOEXP|GamesFuze/i,'no source names');
      seen.push(await plain(page,'#aeSetup')+onBar.join(','));
      assert.deepEqual(errors,[]);
      await context.close();
    }
    assert.equal(new Set(seen).size,3,'Lv 5, 22 and 45 each show a different setup');
  });

  await bcheck('Mastery: the order on the screen is the planner\'s, never past the cap',async()=>{
    for(const level of [5,22,45]){
      const {page,context}=await open(screen(level,'mastery'));
      const rows=await page.$$eval('#aeMasteryWhy li',items=>items.map(el=>el.dataset.masteryWhy));
      assert.deepEqual(rows,plan(level).mastery.spend.map(step=>step.name).slice(0,rows.length),`Lv ${level}`);
      assert.ok(rows.length>0);
      await context.close();
    }
  });

  if(process.env.AE_SHOTS)for(const level of [5,22,45])for(const view of ['skill-bar','mastery'])for(const width of [1600,390]){
    const {page,context}=await open(screen(level,view),{viewport:{width,height:1000}});
    await page.screenshot({path:resolve(process.env.AE_SHOTS,`spiritmaster-${view}-dps-lv${level}-${width}.png`),fullPage:true});
    await context.close();
  }
  await browser.close();
  server.close();
  if(real.length){failed++;console.log(`  FAIL real network calls: ${real.join(', ')}`);}
}

if(failed){console.log(`AETHERIUM_LEVEL_SPIRITMASTER=FAIL ${failed}`);process.exitCode=1;}
else console.log('AETHERIUM_LEVEL_SPIRITMASTER=PASS');
