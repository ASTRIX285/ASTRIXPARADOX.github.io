#!/usr/bin/env node
// The Ascent Plan page (brief feature/aetherium-ascent-plan, 6 Oct 2026) on a local static server, the
// Worker mocked (never NCSOFT, never the real Worker):
//   - by hand: a new player picks class, role and level with no call to the official site; the address stays bookmarkable;
//   - class switch refills the roles (main role first), level clamps to 1 to 45, a pending role says so;
//   - with a Daeva (link or active roster slot): armory fixes come first, class and level are locked to the
//     character, faction colour applies, "plan another class by hand" unlocks the form;
//   - Worker down: a clear message and the plan by hand;
//   - every citation points at a listed source; nav links reach the Ascent Plan from the other pages;
//   - looks: no sideways scroll at 390, 820 and 1600, content clear of the header, usable well inside 4 s.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
const {deriveRegion}=await import('./fixtures/aion2/derive-region-fixtures.mjs');
const fixtureDir=resolve(root,'astrix-app/tools/fixtures/aion2/eu');
const fixture=async name=>JSON.parse(await readFile(resolve(fixtureDir,`${name}.json`),'utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.svg':'image/svg+xml'};

const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try {const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;

const info=await fixture('astrix285-info'),equipment=await fixture('astrix285-equipment'),search=await fixture('astrix285-search');
const item=await fixture('astrix285-item-mainhand'),board=await fixture('astrix285-daevanion-11');
// The fixture is Miguel's own character. The mock Worker serves it under a test name: the gamer tag is never page data.
const TEST_NAME='TESTDAEVA';
info.profile.characterName=TEST_NAME;
search.list[0].name=`<strong>${TEST_NAME}</strong>`;
const GAMER_TAG=['ASTRIX','285'].join('');
// A second, Asmodian Daeva for the roster and faction checks (same shape, different identity).
const asmoInfo=structuredClone(info);
Object.assign(asmoInfo.profile,{characterName:'NOCTIS',characterId:'Zm9vYmFyMTIz=',raceId:2,raceName:'Asmodian',serverId:2301,serverName:'Israphel'});
const asmoSearch={list:[{...search.list[0],name:'<strong>NOCTIS</strong>',characterId:'Zm9vYmFyMTIz%3D',race:2,serverId:2301,serverName:'Israphel'}],pagination:search.pagination};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
// A Lv 22 Daeva (as the fixture character was on the live site, 5 Oct 2026): stigmas still not acquired, an amulet worn in slot 22.
const lv22Info=structuredClone(info);
Object.assign(lv22Info.profile,{characterName:'LEVELED',characterId:'bGV2ZWxlZDIy=',characterLevel:22,serverId:1309,serverName:'Hithanya'});
const lv22Equipment=structuredClone(equipment);
lv22Equipment.equipment.equipmentList.push({...lv22Equipment.equipment.equipmentList[0],id:999000022,name:'Test Amulet',slotPos:22,slotPosName:'Amulet'});
// A Lv 45 Daeva in Unique, Epic and Rare gear (captured 11 Oct 2026, renamed: no gamer tag, id or portrait), served on server 1317.
const lv45Info=await fixture('lv45-info'),lv45Equipment=await fixture('lv45-equipment'),lv45Items=await fixture('lv45-items');
Object.assign(lv45Info.profile,{serverId:1317});

// The live shape of the Vaizel bug (10 Oct 2026): a Lv 30 Daeva (server 1313) with Nezekan finished, Zikel part spent
// and Vaizel open with nothing on it. The move must name Vaizel and Show me must open Vaizel, never Nezekan.
const spendBoards=list=>list.forEach(board=>{
  if(board.name==='Nezekan')Object.assign(board,{open:1,openNodeCount:board.totalNodeCount});
  if(board.name==='Zikel')Object.assign(board,{open:1,openNodeCount:9});
  if(board.name==='Vaizel')Object.assign(board,{open:1,openNodeCount:0});
});
const vaizelInfo=structuredClone(info);
Object.assign(vaizelInfo.profile,{characterName:'VAIZELDAEVA',characterId:'dmFpemVsZGFldmE=',characterLevel:30,serverId:1313,serverName:'Siel'});
spendBoards(vaizelInfo.daevanion.boardList);
const vaizelRef=new URLSearchParams({serverId:'1313',characterId:vaizelInfo.profile.characterId});
// The same shape for an Asmodian Daeva in Asia: the boards are 31 to 36, so Vaizel is 33.
const ASMO_V=deriveRegion('as',{race:'asmodian'});
const asmoVaizelInfo=structuredClone(ASMO_V.info);
Object.assign(asmoVaizelInfo.profile,{characterName:'ASMOVAIZEL',className:'Gladiator',characterLevel:30});
spendBoards(asmoVaizelInfo.daevanion.boardList);
const asmoVaizelRef=new URLSearchParams({serverId:String(ASMO_V.serverId),characterId:ASMO_V.characterId,region:'as'});
// Every open board already has nodes taken (server 1314): no Daevanion move at all.
const spentInfo=structuredClone(vaizelInfo);
Object.assign(spentInfo.profile,{characterName:'SPENTDAEVA',characterId:'c3BlbnRkYWV2YQ==',serverId:1314,serverName:'Siel'});
spentInfo.daevanion.boardList.forEach(board=>{if(board.open===1)board.openNodeCount=Math.max(1,board.openNodeCount);});
const spentRef=new URLSearchParams({serverId:'1314',characterId:spentInfo.profile.characterId});
// The Mastery cap (Miguel, in game, 10 Oct 2026): a Daeva (server 1315) with Keen Strike at 12 (gear or a node past the cap),
// Rending Blow at 11 and Overhead Slam at 10. Nezekan is open with nothing taken (the fixture board), so its skill nodes are free.
const capInfo=structuredClone(info);
Object.assign(capInfo.profile,{characterName:'CAPDAEVA',characterId:'Y2FwZGFldmE=',serverId:1315,serverName:'Siel'});
const capEquipment=structuredClone(equipment);
for(const skill of capEquipment.skill.skillList){
  const level={'Keen Strike':12,'Rending Blow':11,'Overhead Slam':10}[skill.name];
  if(level)Object.assign(skill,{skillLevel:level,acquired:1,equip:1});
}
const capRef=new URLSearchParams({serverId:'1315',characterId:capInfo.profile.characterId});
// The Lv 41 walk (11 Oct 2026, server 1316): four stigmas open, three build stigmas equipped and Wrath Wave (a listed swap) in Rage Burst's place.
const lv41Info=structuredClone(info);
Object.assign(lv41Info.profile,{characterName:'LEVELFORTY',characterId:'bGV2ZWw0MQ==',characterLevel:41,serverId:1316,serverName:'Siel'});
const lv41Equipment=structuredClone(equipment);
const lv41On=new Set(['Lunge Stance',"Zikel's Blessing",'Wrath Wave','Focused Block']);
for(const skill of lv41Equipment.skill.skillList)if(skill.category==='Dp')Object.assign(skill,{acquired:1,equip:lv41On.has(skill.name)?1:0});
const lv41Ref=new URLSearchParams({serverId:'1316',characterId:lv41Info.profile.characterId});

// Role aware (17 Oct 2026): the route reads every open board, so a board the character has finished (its count says all
// nodes taken) comes back with every node taken; any other board is the Lv 12 fixture board.
// Select buttons (fix/aetherium-select-buttons, 17 Oct 2026): on the Lv 45 Daeva, Azphel (board 16) is served the captured
// Sorcerer Nezekan board (real nodes, questlog.gg), which has none of the Gladiator's priority nodes, as Azphel has none in game.
const sorcererBoard=JSON.parse(await readFile(resolve(root,'astrix-app/tools/fixtures/aion2/sorcerer-nezekan-board.json'),'utf8'));
const noPriorityBoard={nodeList:sorcererBoard.nodes.map(node=>({boardId:16,col:node.col,row:node.row,type:node.type,grade:node.grade,name:node.name,nodeId:node.nodeId,icon:'',open:node.taken?1:0,effectList:(node.effects??[]).map(desc=>({desc}))})),openSkillEffectList:[],openStatEffectList:[]};
const boardFor=(characterInfo,boardId)=>{
  if(characterInfo===lv45Info&&boardId===16)return noPriorityBoard;
  const listed=characterInfo?.daevanion?.boardList?.find(item=>item.id===boardId);
  if(listed&&listed.openNodeCount>=listed.totalNodeCount)return {...board,nodeList:board.nodeList.map(node=>node.type&&node.type!=='None'?{...node,open:1}:node)};
  return board;
};
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

// mechanics: a stand-in mechanics.json (a rule flipped to confirmed), so a test can show the tags follow the data.
async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null,mechanics=null,visited=null,builds=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  // Every URL the page asks for, so a check can see which hosts were asked (stat icons: our sprite only, never NCSOFT).
  const requested=[];
  context.on('request',request=>requested.push(request.url()));
  if(mechanics)await context.route(/\/astrix-app\/games\/aion2\/data\/advisor\/mechanics\.json/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mechanics)}));
  // builds: { gladiator: <file> } stands in for a class's builds file (a pending role made in the test data).
  for(const [slug,file] of Object.entries(builds??{}))await context.route(new RegExp(`/astrix-app/games/aion2/data/advisor/builds/${slug}\\.json`),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(file)}));
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    let body=await response.text();
    // The committed config points at the real Worker; every test swaps it for the mock (live) or null (not connected).
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    body=swapped;
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    if(down)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
    const asmo=url.searchParams.get('name')==='NOCTIS'||url.searchParams.get('serverId')==='2301';
    const lv22=url.searchParams.get('serverId')==='1309';
    const serverId=url.searchParams.get('serverId');
    const character=serverId==='1313'?{info:vaizelInfo,equipment}
      :serverId==='1314'?{info:spentInfo,equipment}
      :serverId==='1315'?{info:capInfo,equipment:capEquipment}
      :serverId==='1316'?{info:lv41Info,equipment:lv41Equipment}
      :serverId==='1317'?{info:lv45Info,equipment:lv45Equipment}
      :serverId===String(ASMO_V.serverId)?{info:asmoVaizelInfo,equipment:ASMO_V.equipment}
      :lv22?{info:lv22Info,equipment:lv22Equipment}:{info:asmo?asmoInfo:info,equipment};
    const bodies={
      '/aion2/search':asmo?asmoSearch:search,
      '/aion2/character':character,
      '/aion2/item':serverId==='1317'?lv45Items[url.searchParams.get('slotPos')]:item,
      '/aion2/daevanion':boardFor(character.info,Number(url.searchParams.get('boardId')))
    };
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta})});
  });
  // Icons and portraits come from the NCSOFT CDN; never fetched in tests.
  // A 1x1 PNG stands in for every NCSOFT icon, so icon tiles keep their <img> as they do live.
  await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run. Registered last, so it wins over the CDN stub above.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  if(storage)await context.addInitScript(value=>{localStorage.setItem('aetherium.roster.v1',value);},JSON.stringify(storage));
  // Steps this Daeva has opened on this device (the step bar ticks a step only once it has been opened).
  if(visited)await context.addInitScript(([key,steps])=>{if(!localStorage.getItem('aetherium.steps.v1'))localStorage.setItem('aetherium.steps.v1',JSON.stringify({[key]:Object.fromEntries(steps.map(step=>[step,true]))}));},[`1308:${info.profile.characterId}`,visited]);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  // Role aware (17 Oct 2026, ruling 7): the Daevanion boards are read after first paint; the checks read the settled page.
  if(path.includes('/ascent/'))await page.waitForFunction(()=>document.documentElement.dataset.aeBoards==='read',null,{timeout:15000});
  return {page,context,calls,errors,requested};
}
const style=(page,selector,prop)=>page.$eval(selector,(el,p)=>getComputedStyle(el).getPropertyValue(p).trim(),prop);
const GOLD='rgb(226, 181, 79)';
const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
const ascent=(query='',screen='')=>`/hub/aetherium/ascent/${screen?`${screen}/`:''}${query?`?${query}`:''}`;
const SCREENS=['mastery','skill-bar','stigma','daevanion','macro','stats'];
const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();

await check('by hand: default Gladiator plan, no armory call, bookmarkable',async()=>{
  const {page,context,calls,errors}=await open(ascent(),{live:true});
  assert.deepEqual(calls,[],'A plan by hand never calls the official site');
  assert.equal(await page.inputValue('#aeClass'),'Gladiator');
  assert.equal(await page.inputValue('#aeRole'),'dps');
  assert.equal(await page.inputValue('#aeLevel'),'1');
  assert.match(page.url(),/\/hub\/aetherium\/ascent\/\?class=gladiator&role=dps&level=1$/);
  assert.match(await plain(page,'.ae-ascent-head'),/Gladiator: Greatsword bruiser DPS/);
  assert.match(await plain(page,'#aeNowTitle'),/at Lv 1/);
  assert.equal(await page.isVisible('#aeAscentFor'),true,'By hand the plan line stays');
  assert.equal(await plain(page,'#aeAscentFor'),'Gladiator · DPS · Lv 1');
  assert.equal(await page.isVisible('#aeSource'),false,'No character source line by hand');
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.deepEqual(await page.$$eval('.ae-menu-card',items=>items.map(el=>el.dataset.view)),[...SCREENS,'gear'],'A card per screen, like the game menu');
  for(const screen of SCREENS)assert.equal(await page.getAttribute(`.ae-menu-card[data-view="${screen}"]`,'href'),`/hub/aetherium/ascent/${screen}/?class=gladiator&role=dps&level=1`,`${screen} card keeps the plan in its address`);
  assert.match(await plain(page,'.ae-menu-card[data-view="stigma"] .ae-menu-status'),/Opens at Lv 22/);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('class switch refills roles, main role first, and keeps the level',async()=>{
  const {page,context}=await open(ascent('class=gladiator&level=30'));
  await page.selectOption('#aeClass','Chanter');
  await page.waitForFunction(()=>document.querySelector('.ae-ascent-head')?.textContent.includes('Chanter'));
  assert.deepEqual(await page.$$eval('#aeRole option',items=>items.map(el=>el.value)),['support','healer','dps']);
  assert.equal(await page.inputValue('#aeRole'),'support');
  assert.match(page.url(),/class=chanter&role=support&level=30$/);
  assert.match(await plain(page,'.ae-menu-card[data-view="stigma"] .ae-menu-status'),/2 of 4 slots open/,'Lv 30: two stigma slots');
  await page.selectOption('#aeRole','healer');
  await page.waitForFunction(()=>location.search.includes('role=healer'));
  assert.match(await plain(page,'.ae-ascent-head'),/Defensive support/);
  await context.close();
});

await check('level change re-plans and clamps to the cap',async()=>{
  const {page,context}=await open(ascent('class=cleric&role=healer&level=5'));
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/Opens at Lv 12/);
  await page.fill('#aeLevel','99');
  await page.press('#aeLevel','Enter');
  await page.waitForFunction(()=>document.querySelector('#aeLevel').value==='45');
  assert.match(page.url(),/level=45$/);
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/5 of 5 boards open/);
  assert.match(await plain(page,'.ae-menu-card[data-view="stigma"] .ae-menu-status'),/4 of 4 slots open/);
  // Macro builder (16 Oct 2026): Macro 1 is stack A and stack B, never more (it was three keys with Bolt, a charged skill).
  // Level planner, Cleric (17 Oct 2026): the Cleric's stacks are named now (Next at Lv N says which stack a skill joins).
  assert.match(await plain(page,'.ae-menu-card[data-view="macro"] .ae-menu-status'),/^Thunder stack and torment stack in Macro 1$/);
  await page.click('.ae-menu-card[data-view="macro"]');
  await page.waitForFunction(()=>document.body.dataset.aeView==='macro'&&document.documentElement.dataset.aetheriumReady==='true');
  assert.match(page.url(),/\/ascent\/macro\/\?class=cleric&role=healer&level=45$/,'The card opens its own page and keeps the level');
  assert.equal(await page.locator('.ae-macro-entry').count(),2,'Two Cleric entries at 45: stack A and stack B');
  assert.equal(await page.locator('.ae-macro-delay').count(),2,'A delay after each entry, like the game');
  assert.doesNotMatch(await plain(page,'.ae-macro'),/Bolt/,'Bolt is charged: never in the macro');
  await context.close();
});
await check('macro reads like the game: one entry per stack, a delay after each, locked rows join later with their level',async()=>{
  // Role aware (17 Oct 2026): the Gladiator's Macro 1 is its one main line (it was stack A and stack B); Templar keeps two.
  const {page,context}=await open(ascent('class=gladiator&role=dps&level=5','macro'));
  assert.deepEqual(await page.$$eval('.ae-macro-entry .ae-macro-skill',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim())),['Main line']);
  // Level planner (17 Oct 2026): only what a Lv 5 Daeva can place is in the macro. Mocking Blade's knockdown opens Overhead
  // Slam until Rage Burst, which joins at Lv 22 (stigma slot 1, the logic's first pick; it was slot 3 at Lv 32, greyed in place).
  assert.deepEqual(await page.$$eval('.ae-macro-entry[data-macro-entry="1"] .ae-macro-row',items=>items.map(el=>[el.dataset.tip,el.classList.contains('is-out')])),[['Mocking Blade',false],['Overhead Slam',false],['Rending Blow',false]]);
  assert.equal(await plain(page,'#aeMacroLater'),'Joins later: Rage Burst Lv 22.');
  assert.match(await plain(page,'#aeMacroRule'),/^Each entry fires its stack's first ready skill\. A step whose skills are all on cooldown, short of MP or without a target is skipped\. Not confirmed yet$/);
  assert.equal(await page.locator('#aeMacroRule [data-status-tag="skip-on-cooldown"]').count(),1,'Not confirmed yet');
  assert.doesNotMatch(await page.textContent('.ae-gw-body'),/Check in game/);
  await context.close();
  const templar=await open(ascent('class=templar&level=45','macro'));
  assert.deepEqual(await templar.page.$$eval('.ae-macro-entry',items=>items.map(el=>el.dataset.macroKey)),['A','B'],'Two stacks, two entries');
  assert.equal(await templar.page.locator('.ae-macro-delay').count(),2);
  await templar.context.close();
});
await check('pending role is honest and offers the main role',async()=>{
  // Role aware (17 Oct 2026): the Gladiator tank build is sourced now, so the pending role is made in the test data.
  const file=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/builds/gladiator.json'),'utf8'));
  file.records=file.records.map(build=>build.role==='tank'?{id:build.id,class:build.class,role:'tank',main:false,label:'Off-tank',summary:'test',status:'pending',build:{pending:true,reason:'No source gives an off-tank Gladiator build yet.'},provenance:build.provenance}:build);
  const {page,context}=await open(ascent('class=gladiator&role=tank&level=20'),{builds:{gladiator:file}});
  assert.match(await plain(page,'.ae-pending'),/^Not confirmed yet\. No source gives an off-tank Gladiator build yet/);
  assert.equal(await page.locator('#aeNowTitle').count(),0,'No made-up steps for a pending role');
  assert.match(await page.textContent('#aeRole option[value="tank"]'),/no build yet/);
  await page.click('text=Show the Gladiator main role instead');
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true'&&location.search.includes('role=dps'));
  assert.match(await plain(page,'.ae-ascent-head'),/Greatsword bruiser DPS/);
  await context.close();
});
await check('unknown role falls back to the main role with a note',async()=>{
  const {page,context}=await open(ascent('class=ranger&role=healer&level=10'));
  assert.equal(await page.inputValue('#aeRole'),'dps');
  assert.match(await plain(page,'#aePlan > .ae-callout'),/Ranger has no Healer build, so this shows its main role\./);
  await context.close();
});

await check('players stay on the site: no outbound links, no guide names on the page',async()=>{
  for(const [query,screen] of [['class=gladiator&role=dps&level=22',''],['class=templar&role=tank&level=37',''],['class=ranger&level=14',''],[ref.toString(),''],...SCREENS.map(screen=>['class=chanter&level=40',screen])]){
    const {page,context}=await open(ascent(query,screen));
    // Official NCSOFT pages are the one allowed outbound link (approved 10 Oct 2026): the footer's official site link. Nothing else leaves the site.
    const outbound=await page.$$eval('a[href]',links=>links.map(a=>a.href).filter(href=>!href.startsWith(location.origin)));
    assert.deepEqual(outbound,['https://aion2.plaync.com/en-us/index'],`${query}: only the official AION 2 site leaves the site`);
    const text=await page.textContent('body');
    assert.doesNotMatch(text,/MetaBot|ExpCarry|EZG|Destructoid|games\.gg|mein-mmo|gameplay\.tips|aion2hub|playnews/i,`${query}: names another site`);
    assert.equal(await page.locator('.ae-sources,.ae-cite').count(),0,`${query}: no source list or citation marks`);
    await context.close();
  }
});

await check('Mastery: icon grid like the game, names on hover, a card with the details on tap',async()=>{
  const {page,context}=await open(ascent(ref,'mastery'),{live:true});
  await page.waitForSelector('#aeMastery .ae-mskill');
  const order=await page.$$eval('#aeMastery .ae-mskill-grid:first-of-type .ae-mskill',items=>items.slice(0,3).map(el=>el.dataset.mastery));
  assert.deepEqual(order,['Keen Strike','Rending Blow','Overhead Slam']);
  const tile='.ae-mskill-grid [data-mastery="Keen Strike"]';
  assert.equal(await plain(page,`${tile} .ae-mskill-lv`),'3');
  assert.match(await page.getAttribute(`${tile} img`,'src'),/ICON_GL_SKILL_002\.png$/,'The game icon');
  // Level planner (17 Oct 2026): the logic's order from the Daeva's own levels (Rending Blow first at Lv 12), each with its reason.
  assert.deepEqual(await page.$$eval('#aeMasterySpend [data-mastery]',items=>items.map(el=>[el.dataset.mastery,el.querySelector('.ae-itile-badge').textContent])),[['Rending Blow','3→8'],['Overhead Slam','2→8'],['Keen Strike','3→8']]);
  assert.match(await plain(page,'#aeMasteryWhy [data-mastery-why="Rending Blow"]'),/^Rending Blow Lv 3 to 8. Train it as far as the game lets you: skill Lv 8 is sold from character Lv 19./);
  assert.equal(await page.getAttribute(tile,'data-equipped'),'true','Shows what is on the skill bar');
  assert.equal(await page.locator('.ae-mskill-grid [data-mastery="Ruinous Blow"] .ae-mskill-bar').count(),0,'A locked skill is never shown as on the bar');
  assert.equal(await plain(page,'.ae-mskill-grid [data-mastery="Ruinous Blow"] .ae-lock'),'Lv 14','Locked skill: padlock and the unlock level');
  assert.equal(await page.getAttribute('.ae-mskill-grid [data-mastery="Ruinous Blow"]','data-tip'),'Ruinous Blow · unlocks at Lv 14');
  assert.equal(await page.getAttribute(tile,'data-tip'),'Keen Strike · skill Lv 3');
  assert.match(await plain(page,'#aeMastery .ae-legend-row'),/Key skill, level it in this order.*Grey: unlocks when your character reaches that level.*Your skill level.*On your skill bar/);
  await page.hover(tile);
  assert.equal(await plain(page,'#aeTip'),'Keen Strike · skill Lv 3');
  await page.click(tile);
  await page.waitForSelector('#aeInfo:not([hidden])');
  assert.match(await plain(page,'#aeInfoTitle'),/Keen Strike Lv\. 3/);
  assert.equal(await page.locator('#aeInfo .ae-card-slot').count(),3,'Three Specialty slots');
  assert.equal(await page.locator('#aeInfo .ae-mperks li').count(),5,'All five perks');
  assert.match(await plain(page,'#aeInfo .ae-card-status'),/On your skill bar/);
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#aeInfo'),true,'Escape closes the card');
  await page.click('.ae-mskill-grid [data-mastery="Rending Blow"]');
  assert.match(await plain(page,'#aeInfoTitle'),/Rending Blow/);
  await page.click('#aeInfo .ae-info-backdrop',{position:{x:5,y:5}});
  assert.equal(await page.isHidden('#aeInfo'),true,'Tapping outside closes the card');
  const box=await page.locator('.ae-mskill-grid [data-mastery="Rending Blow"]').boundingBox();
  assert.ok(Math.abs(box.width-box.height)<2,'Skill tiles are square, like the game');
  assert.equal(await style(page,'#aeMastery .ae-mskill','clip-path'),'none','No shared notched button skin on skill tiles');
  await context.close();
});

await check('Mastery without a Daeva: every class skill as a game icon, key skills marked',async()=>{
  const {page,context}=await open(ascent('class=cleric&role=healer&level=30','mastery'));
  assert.equal(await page.locator('.ae-mskill-grid').first().locator('.ae-mskill').count(),12);
  const srcs=await page.$$eval('.ae-mskill img',items=>items.map(el=>el.getAttribute('src')));
  assert.equal(srcs.length,22,'An icon for every active and passive skill');
  assert.ok(srcs.every(src=>/^https:\/\/assets\.playnccdn\.com\/static-aion2-gamedata\/resources\/ICON_[A-Z]{2}_SKILL_/.test(src)),srcs.join());
  assert.ok(await page.locator('.ae-mskill.is-key').count()>=3);
  await context.close();
});

await check('Mastery cap: no step above 11, a capped skill links to its Daevanion node, the tile keeps the real level',async()=>{
  const {page,context,calls,errors}=await open(ascent(capRef,'mastery'),{live:true});
  await page.waitForSelector('#aeMasteryCap a[data-cap-node]');
  assert.deepEqual(await page.$$eval('#aeMasterySpend [data-mastery]',items=>items.map(el=>[el.dataset.mastery,el.querySelector('.ae-itile-badge').textContent])),[['Overhead Slam','10→11']],'Only the skill under the cap is levelled, and only to 11');
  const badges=await page.$$eval('#aeMasterySpend .ae-itile-badge',items=>items.map(el=>el.textContent));
  assert.ok(badges.every(badge=>Number(badge.split('→').pop())<=11),badges.join());
  assert.equal(await plain(page,'#aeMasteryCap .ae-mskills-title'),'At the Mastery cap (11)');
  const rows=await page.$$eval('#aeMasteryCap li',items=>items.map(el=>[el.dataset.masteryCap,el.textContent.replace(/\s+/g,' ').trim(),el.querySelector('a[data-cap-node]')?.getAttribute('href')??null]));
  assert.deepEqual(rows.map(row=>row[0]),['Keen Strike','Rending Blow']);
  assert.match(rows[0][1],/^Keen Strike ?12 ?Keen Strike is Lv 12\. Mastery stops at 11, so no more skill points go here\. ?Next \+1: Skill Level Up - Keen Strike on Nezekan$/);
  assert.match(rows[0][2],/^\/hub\/aetherium\/ascent\/daevanion\/\?serverId=1315&characterId=[^&]+&region=eu&class=gladiator(&role=dps)?&board=11&node=110131$/,'The link opens Nezekan on the Keen Strike node');
  assert.match(rows[1][2],/&board=11&node=110095$/,'Rending Blow: its own node');
  assert.equal(calls.filter(path=>path==='/aion2/daevanion').length,1,'One board read, the first open one');
  assert.equal(await plain(page,'.ae-mskill-grid [data-mastery="Keen Strike"] .ae-mskill-lv'),'12','The Skill window level is the real one');
  assert.equal(await page.getAttribute('.ae-mskill-grid [data-mastery="Keen Strike"]','data-tip'),'Keen Strike · skill Lv 12');
  await page.click('.ae-mskill-grid [data-mastery="Rending Blow"]');
  await page.waitForSelector('#aeInfo:not([hidden])');
  const card=await plain(page,'#aeInfoBody');
  assert.match(card,/Target: Lv 10 early, then Mastery 11, then \+4 from Daevanion nodes\. The guide's skill level 16 and 20 need more: Mastery stops at 11 and the build names no other source/,'The guide target is reworded against the cap (in the build since the walkthrough fix)');
  assert.match(card,/At the Mastery cap \(11\)\. Next \+1: the Daevanion node Skill Level Up - Rending Blow on Nezekan\./);
  assert.doesNotMatch(await plain(page,'#aeInfo .ae-card-chips'),/Lv 16|Lv 20/,'The target chip never names a level past the cap (Specialty slot levels in the body are fine)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#aeGuide:not([hidden])');
  const guide=[];
  for(let i=0;i<4;i++){guide.push(await plain(page,'.ae-guide-text'));if(await page.locator('#aeGuide [data-guide="next"]').count())await page.click('#aeGuide [data-guide="next"]');else break;}
  assert.ok(guide.some(text=>/^Keen Strike is at the Mastery cap \(11\), so no more skill points go into it\. Its next \+1: the Daevanion node Skill Level Up - Keen Strike on Nezekan\.$/.test(text)),guide.join('\n'));
  assert.ok(guide.every(text=>!/Keen Strike: Lv 12 to|Rending Blow: Lv 11 to/.test(text)),'The guide never levels a capped skill');
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\/.*board=11&node=110131/),page.click('#aeMasteryCap a[data-cap-node="110131"]')]);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await page.waitForSelector('.ae-node[data-node="110131"].is-selected');
  assert.match(await plain(page,'#aeNodePanel h3'),/Keen Strike \+1/,'The board opens on the Keen Strike node');
  assert.deepEqual(errors,[]);
  await context.close();
  // The menu: the move opens the board on the node, and nothing says to level a capped skill.
  const menu=await open(ascent(capRef),{live:true});
  await menu.page.waitForSelector('.ae-quest[href*="node=110131"]');
  const quests=await menu.page.$$eval('.ae-quest',items=>items.map(el=>[el.querySelector('.ae-quest-text').textContent.trim(),el.getAttribute('href')]));
  const node=quests.find(([title])=>title==='Take the Keen Strike +1 node on Nezekan');
  assert.ok(node,quests.map(([title])=>title).join(' | '));
  assert.match(node[1],/&board=11&node=110131$/);
  assert.ok(quests.every(([title])=>!/^Level (Keen Strike|Rending Blow)/.test(title)));
  await menu.context.close();
});

await check('Skill Bar: the game layout, Keen Strike set by the game on left click, the main line beside it; own keys left to right',async()=>{
  const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=23','skill-bar'));
  // Role aware (17 Oct 2026): one main line, so no empty stack A is drawn.
  // The game's order (Miguel, in game, 17 Oct 2026): 1 to 8, Q, E, left click (main attack), right click (main line).
  assert.deepEqual(await page.$$eval('.ae-bar-blocks [data-bar-col]',items=>items.map(el=>el.dataset.barCol)),['1','2','3','4','5','6','7','8','Q','E','LMB','B'],'Keys 1 to 8, Q, E, left click, then the main line');
  assert.deepEqual(await page.$$eval('#aeRightBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['LMB','B'],'The main attack, then the main line');
  assert.equal(await page.locator('[data-bar-col="LMB"] [data-bar-row]').count(),1,'Left click has row 0 only, as in game');
  assert.equal(await page.locator('[data-bar-keycap="B"].is-mouse').count(),1,'The main line sits on right click');
  assert.deepEqual(await page.$$eval('.ae-bar-rows li',items=>items.map(el=>el.textContent)),['3','2','1','0'],'Row numbers on the right');
  const order=await page.$$eval('.ae-bar-blocks [data-bar-col]',items=>items.map(el=>el.getBoundingClientRect().left));
  assert.ok(order.every((left,index)=>index===0||left>order[index-1]),'One row, left to right');
  const col=key=>page.$$eval(`[data-bar-col="${key}"] [data-bar-skill]`,cells=>cells.map(el=>el.dataset.barSkill));
  assert.deepEqual(await col('B'),['Rending Blow','Overhead Slam','Rage Burst'],'The main line, row 3 at the top down to row 0');
  assert.equal(await page.locator('[data-bar-gap="2:B"]').count(),1,'Row 2 drawn empty on purpose');
  assert.equal(await plain(page,'[data-bar-col="B"] .ae-keycap'),'Main line');
  const main=await page.$$eval('[data-bar-row="0"] [data-bar-skill]',cells=>Object.fromEntries(cells.map(el=>[el.dataset.barKey.split(':')[1],[el.dataset.barSkill,el.dataset.barRole]])));
  assert.deepEqual(main.LMB,['Keen Strike','main'],'Left click is Keen Strike');
  assert.equal(await page.locator('[data-bar-key="0:LMB"] .ae-bar-pin').count(),1,'and set by the game');
  assert.equal(await page.locator('[data-bar-key="0:LMB"] .ae-lock').count(),0,'The basic attack is never shown locked');
  assert.equal(await page.getAttribute('[data-bar-key="0:LMB"] .ae-bar-pin','title'),'Set by the game');
  // Level planner (17 Oct 2026): at Lv 23 only stigma slot 1 is open (Rage Burst), so the keys for Zikel's Blessing, Lunge
  // Stance and Focused Block stay free in the record's order, and those three wait in Comes later with their slot level.
  // Keys by the hand (Miguel, in game, 17 Oct 2026): Defiance on Space bar; 1 to 4 in the record's order, the stacked
  // movement key on Q, then E; free keys keep their place.
  assert.deepEqual(['1','2','3','4','Q','E','5'].map(key=>main[key]?.[0]),['Sword Aura Rampage',undefined,undefined,'Ruinous Blow','Leaping Slam',undefined,undefined],'The record\'s order by the hand, free keys kept');
  assert.equal(await page.getAttribute('#aeSpaceKey [data-bar-skill]','data-bar-skill'),'Defiance','Defiance on Space bar');
  assert.equal(await page.locator('.ae-bar-blocks [data-bar-skill="Defiance"]').count(),0,'Defiance on no number key');
  assert.match(await plain(page,'#aeCopyBar [data-copy-step="Space"]'),/^Space bar Defiance on every class$/);
  assert.deepEqual(await col('Q'),['Rush Strike','Leaping Slam'],'Movement shares Q: stacks go on Q and E');
  assert.equal(await page.locator('#aeSkillBar .ae-lock').count(),0,'No locked skill on the bar');
  assert.deepEqual(await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>[el.dataset.laterSkill,el.querySelector('small').textContent])),[['Lunge Stance','Stigma slot 2 opens at Lv 27.'],["Zikel's Blessing",'Stigma slot 3 opens at Lv 32.'],['Focused Block','Stigma slot 4 opens at Lv 37.']]);
  assert.match(await page.getAttribute('[data-bar-keycap="2"]','aria-label'),/kept free for Zikel's Blessing/);
  assert.doesNotMatch(await plain(page,'#aeCopyBar'),/Zikel|Lunge|Focused|from Lv/,'Copy this bar lists only what goes on now');
  assert.match(await page.getAttribute('[data-bar-key="3:B"] img','src'),/ICON_GL_SKILL_001\.png$/,'Rending Blow game icon');
  assert.match(await plain(page,'.ae-guide'),/After E: your main attack \(Keen Strike\) on left click\. The main line is on right click and is your macro\./);
  assert.match(await page.getAttribute('#aeRightBlock','class'),/ae-guide-target/);
  await page.click('[data-bar-key="1:B"]');
  assert.match(await plain(page,'#aeInfoTitle'),/Overhead Slam/,'Tap a cell for the skill card');
  assert.match(await plain(page,'#aeInfo [data-place-line]'),/^Main line row 1: Your hardest regular hit\./,'and where it goes and why');
  assert.match(await plain(page,'#aeInfo [data-triggers]'),/No cooldown\. From skill Lv 16/,'A skill Lv 16 trigger says so');
  assert.equal(await page.locator('#aeInfo [data-triggers] li.is-dim[data-trigger-level="16"]').count(),1,'and is dim without a Daeva at skill Lv 16');
  await page.keyboard.press('Escape');
  await page.click('[data-bar-key="0:B"]');
  assert.match(await plain(page,'#aeInfo'),/Rage Burst.*Stigma · slot 1/);
  assert.deepEqual(errors,[]);
  await context.close();
});
await check('Daevanion planner: real board, numbered route, points budget remembered',async()=>{
  const {page,context,calls}=await open(ascent(ref,'daevanion'),{live:true});
  await page.waitForSelector('.ae-board-grid');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion'],'One board call, for the open board only');
  assert.equal(await page.getAttribute('[data-board-tab="11"]','aria-selected'),'true');
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),89,'88 nodes plus Start');
  assert.equal(await page.locator('.ae-node[data-kind="start"]').count(),1);
  const art=await page.$$eval('.ae-board-grid .ae-node',items=>items.map(el=>[el.dataset.kind,el.dataset.status,el.querySelector('img.ae-node-art')?.getAttribute('src')??'']));
  const base='https://assets.playnccdn.com/static-aion2/characters/img/daevanion/board_icon_';
  for(const [kind,status,src] of art){
    const grade={'active-skill':'legend','passive-skill':'rare',unique:'unique',stat:'common'}[kind];
    const want=kind==='start'?`${base}start_gladiator.png`:`${base}${grade}${status==='taken'?'_open':''}.png`;
    assert.equal(src,want,`${kind} ${status} uses the game's node art`);
  }
  assert.equal(await page.locator('.ae-node[data-key="true"]').count(),4,'Overhead Slam, Rending Blow, Ruinous Blow, Crushing Wave');
  assert.match(await plain(page,'#aeRouteSummary'),/Enter the points you have/);
  const first=await page.$$eval('.ae-route-list li',items=>items.slice(0,7).map(li=>li.querySelector('strong').textContent));
  assert.equal(first[6],'Overhead Slam +1','Overhead Slam is the first key node, step 7');
  await page.fill('#aePoints','10');
  // Role aware (17 Oct 2026): the points box says it the brief's way ("Your 12 points cover the next 3 steps").
  await page.waitForFunction(()=>/cover the next/.test(document.querySelector('#aeRouteSummary').textContent));
  assert.match(await plain(page,'#aeRouteSummary'),/^Your 10 points cover the next 8 steps\. Step 9 needs 3 more points\.$/);
  assert.equal(await page.locator('.ae-node[data-status="now"]').count(),8);
  for(const width of [390,1920]){
    await page.setViewportSize({width,height:900});
    const fit=await page.evaluate(()=>{const grid=document.querySelector('.ae-board-grid').getBoundingClientRect();const panel=document.querySelector('#aePlanner').getBoundingClientRect();return grid.left>=panel.left-0.5&&grid.right<=panel.right+0.5;});
    assert.ok(fit,`board fits its panel at ${width}`);
  }
  assert.equal(await page.locator('#aeFlow line').count(),40,'One flow link per route step');
  assert.equal(await page.locator('#aeFlow line[data-status="now"]').count(),8);
  assert.match(await plain(page,'#aeNodePanel'),/Attack Bonus \+3.*Take now.*Taken to reach Overhead Slam \+1/,'Panel opens on the next step');
  await page.click('.ae-node[data-kind="unique"][data-rc="13:3"]');
  assert.match(await plain(page,'#aeNodePanel'),/Cooldown Reduction \+1\.5%.*Later.*4 points.*core corner nodes.*On Ruinous Blow \(45 s\) that is about 0\.7 s back/);
  await page.click('[data-route-node]:nth-child(7)');
  assert.match(await plain(page,'#aeNodePanel'),/Overhead Slam \+1.*key skill 1 of 4/);
  const tile=await page.$eval('.ae-node[data-kind="active-skill"]',el=>{const s=getComputedStyle(el);return [s.clipPath,s.backgroundImage.includes('gradient')];});
  assert.equal(tile[0],'none','Nodes are tiles, not notched action buttons');
  await page.reload();
  await page.waitForSelector('.ae-board-grid');
  assert.equal(await page.inputValue('#aePoints'),'10','Points remembered for this Daeva and board');
  await context.close();
});

await check('Daevanion planner without a Daeva points to the Daeva Card',async()=>{
  const {page,context}=await open(ascent('class=cleric&level=30','daevanion'));
  assert.equal(await page.locator('.ae-board-cards li.is-open').count(),3,'Lv 30: three boards open');
  assert.match(await plain(page,'.ae-gw-body .ae-callout'),/Find your Daeva/);
  assert.equal(await page.getAttribute('.ae-gw-body .ae-callout a','href'),'/hub/aetherium/');
  await context.close();
});

await check('Daevanion screen reads ?board= and keeps it in its address; a board that is not open falls back to the first open one',async()=>{
  const wanted=await open(ascent(`${ref}&board=11`,'daevanion'),{live:true});
  await wanted.page.waitForSelector('.ae-board-grid');
  assert.equal(await wanted.page.getAttribute('[data-board-tab="11"]','aria-selected'),'true');
  assert.equal(new URL(wanted.page.url()).searchParams.get('board'),'11','The board stays in the address');
  assert.match(await wanted.page.getAttribute('.ae-gw-tabs a[data-view="stats"]','href'),/^(?!.*board=)/,'Links to other screens do not carry the board');
  await wanted.context.close();
  const locked=await open(ascent(`${ref}&board=13`,'daevanion'),{live:true});
  await locked.page.waitForSelector('.ae-board-grid');
  assert.equal(await locked.page.getAttribute('[data-board-tab="11"]','aria-selected'),'true','Vaizel is not open: the first open board shows');
  assert.equal(new URL(locked.page.url()).searchParams.get('board'),'11');
  await locked.context.close();
});

await check('with a Daeva link: armory fixes first, class and level locked, Elyos gold',async()=>{
  const {page,context,calls}=await open(ascent(ref),{live:true});
  assert.equal(calls[0],'/aion2/character');
  assert.ok(calls.every(path=>['/aion2/character','/aion2/daevanion'].includes(path)),`calls: ${calls}`);
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  assert.equal(await page.isDisabled('#aeClass'),true);
  assert.equal(await page.isDisabled('#aeLevel'),true);
  assert.equal(await page.isDisabled('#aeRole'),false);
  assert.equal(await page.inputValue('#aeLevel'),'12');
  assert.match(await plain(page,'#aeDaeva'),new RegExp(`Planning for ${TEST_NAME}, Gladiator Lv 12 on Meslamtaeda, Europe\\.`));
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),new RegExp(GAMER_TAG,'i'),'The gamer tag never shows');
  assert.equal(await page.isHidden('#aeAscentFor'),true,'The name, class and level show once: the Planning for line says them');
  assert.equal(await plain(page,'#aeNowTitle'),'Your next moves','No "for <name>" when a Daeva is linked');
  const steps=await page.$$eval('.ae-quest-text strong',items=>items.map(el=>el.textContent));
  // Walkthrough fix (11 Oct 2026): one level order, so the level move is Keen Strike, the Mastery list's first skill.
  // Grade rule (11 Oct 2026): was 'Enchant 7 worn items above +0'. At Lv 12 the Common and Rare pieces go to their +5 cap.
  // Role aware (17 Oct 2026): the board is read, so the move names its next node for the role.
  // Level planner (17 Oct 2026): the level move is the logic's first step (Rending Blow), then the main line this Lv 12 bar can fire.
  assert.deepEqual(steps,['Start Nezekan: Overhead Slam +1 next (7 steps)','Enchant 8 Rare and Common pieces to +5','Level Rending Blow (now Lv 3)','Set your main line: Mocking Blade, Overhead Slam, Rending Blow']);
  assert.deepEqual(await page.$$eval('.ae-quest',items=>items.map(el=>el.dataset.questView)),['daevanion','gear','mastery','skill-bar'],'Each next move opens the screen that shows it');
  // Walkthrough fix (11 Oct 2026): Show me on the enchant move opens the Gear page with the items it names ringed (the move's own id since the grade rule).
  assert.match(await page.getAttribute('.ae-quest[data-quest-view="gear"]','href'),/^\/hub\/aetherium\/gear\/equipment\/\?serverId=1308&characterId=[^#]+#enchant-early$/);
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/Nezekan: 0 \/ 88 nodes/);
  assert.match(page.url(),/serverId=1308&characterId=.*&role=dps$/);
  assert.match(page.url(),/[?&]region=eu&/,'The address carries the region');
  for(const href of await page.$$eval('.ae-ascent-nav a, .ae-menu-card, .ae-quest',nodes=>nodes.map(n=>n.getAttribute('href')).filter(h=>h&&/serverId=/.test(h)))) assert.match(href,/[?&]region=eu(&|#|$)/,`Link keeps the region: ${href}`); // a Show me hash (#enchant) may follow the query
  assert.equal(await style(page,'.ae-ascent-head .ae-eyebrow','color'),GOLD);
  await page.click('[data-plan-by-hand]');
  await page.waitForFunction(()=>!document.querySelector('#aeClass').disabled);
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.match(page.url(),/class=gladiator&role=dps&level=12$/);
  assert.match(await plain(page,'#aeNowTitle'),/at Lv 12/);
  await context.close();
});

await check('active roster Daeva is used when the link names no class',async()=>{
  const entry={name:TEST_NAME,serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:12,raceName:'Elyos',demo:false};
  const storage={entries:[entry],active:`1308:${info.profile.characterId}`};
  const {page,context,calls}=await open(ascent(),{live:true,storage});
  assert.equal(calls[0],'/aion2/character');
  assert.ok(calls.every(path=>['/aion2/character','/aion2/daevanion'].includes(path)),`calls: ${calls}`);
  assert.match(await plain(page,'#aeDaeva'),new RegExp(`Planning for ${TEST_NAME}`));
  await context.close();
  const manual=await open(ascent('class=sorcerer&level=20'),{live:true,storage});
  assert.deepEqual(manual.calls,[],'A class link plans by hand even with an active Daeva');
  assert.match(await plain(manual.page,'#aeDaeva'),new RegExp(`Planning by hand\\. Use ${TEST_NAME} \\(Gladiator Lv 12\\) instead`));
  await manual.context.close();
});

await check('Worker down: clear message, Try again, and the plan by hand; never a stand-in Daeva',async()=>{
  const {page,context}=await open(ascent(ref),{live:true,down:true});
  assert.match(await page.textContent('#aeNotice'),/The official AION 2 site is not answering right now, so this plans by hand/);
  assert.equal(await page.isVisible('#aeRetry [data-retry]'),true,'A Try again button');
  assert.equal(await page.isDisabled('#aeClass'),false);
  assert.match(await plain(page,'.ae-ascent-head'),/Gladiator/);
  assert.equal(await page.isHidden('#aeSource'),true,'No data line: nothing was read');
  const text=await page.evaluate(()=>document.body.innerText);
  assert.doesNotMatch(text,new RegExp(GAMER_TAG,'i'),'The gamer tag never shows');
  assert.doesNotMatch(text,/Example data|example Daeva|Planning for/i,'No stand-in Daeva');
  await context.close();
});

await check('by hand with no Daeva: no gamer tag or example on the menu or any screen',async()=>{
  for(const screen of ['',...SCREENS]){
    const {page,context,calls}=await open(ascent('class=gladiator&level=1',screen),{live:false});
    assert.deepEqual(calls,[]);
    const text=await page.evaluate(()=>[document.body.innerText,document.title,...[...document.querySelectorAll('[alt],[title],[aria-label]')].map(n=>[n.getAttribute('alt'),n.title,n.getAttribute('aria-label')].join(' '))].join('\n'));
    assert.doesNotMatch(text,new RegExp(GAMER_TAG,'i'),`${screen||'menu'} shows the gamer tag`);
    assert.doesNotMatch(text,/Example data|example Daeva/i,`${screen||'menu'} mentions an example`);
    await context.close();
  }
});

await check('Daeva Card and Gear Ledger link to the Ascent Plan',async()=>{
  for(const path of ['/hub/aetherium/','/hub/aetherium/gear/','/hub/aetherium/ascent/']){
    // The Daeva Card's Ascent link sits on the character card, so it opens on a (mocked) live Daeva.
    const {page,context}=await open(path==='/hub/aetherium/'?`${path}?${ref}`:path,{live:path==='/hub/aetherium/'});
    assert.equal(await page.locator('.apx-destination-ribbon a[href="/hub/aetherium/ascent/"]').count(),1,`${path} ribbon`);
    assert.equal(await page.locator('.ax-drawer-links a[href="/hub/aetherium/ascent/"]').count(),1,`${path} drawer`);
    if(path==='/hub/aetherium/'){
      assert.match(await page.getAttribute('#aeAscentLink','href'),/^\/hub\/aetherium\/ascent\//);
    }
    await context.close();
  }
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, clear of the header, fast`,async()=>{
    for(const screen of SCREENS){
      const {page,context}=await open(ascent('class=gladiator&role=dps&level=30',screen),{viewport:{width,height}});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${screen} scrolls sideways by ${overflow}px`);
      await context.close();
    }
    for(const query of ['class=gladiator&role=dps&level=22',ref.toString()]){
      const started=Date.now();
      const {page,context}=await open(ascent(query),{viewport:{width,height}});
      const took=Date.now()-started;
      assert.ok(took<4000,`${query} ready in ${took} ms`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${query} scrolls sideways by ${overflow}px`);
      const clear=await page.evaluate(()=>{
        const first=[...document.querySelector('main').children].map(el=>el.getBoundingClientRect()).find(r=>r.height>0).top+scrollY;
        const bars=[...document.querySelectorAll('header.apx-destination-header,[data-forge-destination-ribbon]')].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0&&r.width>0);
        return {first,bottom:Math.max(...bars.map(r=>r.bottom))};
      });
      assert.ok(clear.first>=clear.bottom,`content starts under the header (${clear.first} < ${clear.bottom})`);
      const buttonHeight=await page.$eval('.ae-ascent-form button',el=>el.getBoundingClientRect().height);
      assert.ok(buttonHeight>=44,'Show plan at least 44px tall');
      const fields=await page.$$eval('.ae-ascent-form .ae-field,.ae-ascent-form button',items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}));
      for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
        const [a,b]=[fields[i],fields[j]];
        assert.ok(a[2]<=b[0]+0.5||b[2]<=a[0]+0.5||a[3]<=b[1]+0.5||b[3]<=a[1]+0.5,`form controls ${i} and ${j} overlap`);
      }
      if(process.env.AE_SHOTS&&(width===390||width===1600))await page.screenshot({path:resolve(process.env.AE_SHOTS,`ascent-${query.startsWith('class')?'hand':'daeva'}-${width}.png`),fullPage:true});
      await context.close();
    }
  });
}

await check('menu cards sit in one row on a wide screen, two columns on a phone',async()=>{
  const wide=await open(ascent(ref),{viewport:{width:1920,height:1000}});
  const tops=await wide.page.$$eval('.ae-menu-card',items=>items.map(el=>Math.round(el.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size,1,`one row at 1920 (${tops})`);
  await wide.context.close();
  const phone=await open(ascent(ref),{viewport:{width:390,height:844}});
  const lefts=await phone.page.$$eval('.ae-menu-card',items=>items.map(el=>Math.round(el.getBoundingClientRect().left)));
  assert.equal(new Set(lefts).size,2,`two columns at 390 (${lefts})`);
  await phone.context.close();
});

await check('guided screen: game window, tabs to every screen, guide lights up each step',async()=>{
  const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=30','stigma'));
  assert.equal(await page.isVisible('.ae-ascent-setup'),false,'The setup form stays on the menu');
  assert.equal(await plain(page,'#aeScreenTitle'),'Stigma');
  assert.deepEqual(await page.$$eval('.ae-gw-tabs a',items=>items.map(el=>[el.dataset.view,el.getAttribute('aria-current')])),SCREENS.map(screen=>[screen,screen==='stigma'?'page':null]));
  assert.equal(await page.getAttribute('.ae-gw-back','href'),'/hub/aetherium/ascent/?class=gladiator&role=dps&level=30');
  assert.equal(await page.locator('.ae-stg-slot').count(),4);
  assert.equal(await page.locator('.ae-stg-slot.is-open').count(),2);
  assert.deepEqual(await page.$$eval('.ae-stg-slot .ae-lock',items=>items.map(el=>el.textContent.trim())),['Lv 32','Lv 37'],'Locked slots show the level that opens them');
  assert.match(await plain(page,'.ae-stg .ae-legend-row'),/Grey: the slot opens when your character reaches that level/);
  await page.click('[data-guide="hide"]');
  assert.equal(await page.isVisible('.ae-guide-text'),false,'The guide folds away');
  await page.click('[data-guide="show"]');
  assert.equal(await page.isVisible('.ae-guide-text'),true,'and comes back');
  // Level planner (17 Oct 2026): the logic fills slot 1 with Rage Burst (it opens Overhead Slam), slot 2 with Lunge Stance.
  assert.match(await plain(page,'.ae-guide'),/Tip 1 of 5.*Slot 1: equip Rage Burst\./);
  assert.match(await plain(page,'#aeStigmaWhy [data-stigma-why="0"]'),/^Slot 1 Rage Burst: Makes Overhead Slam ready on the target for 10 s\.$/);
  assert.equal(await page.getAttribute('[data-stigma="0"]','class').then(c=>c.includes('ae-guide-target')),true,'Slot 1 lit up');
  await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide'),/Tip 2 of 5.*Slot 2: equip Lunge Stance\./);
  assert.equal(await page.locator('.ae-guide-target').count(),1);
  assert.match(await page.getAttribute('[data-stigma="1"]','class'),/ae-guide-target/);
  assert.match(await page.getAttribute('[data-stigma="1"] img','src'),/ICON_GL_SKILL_024\.png$/,'Lunge Stance shows its game icon');
  await page.click('[data-stigma="1"]');
  assert.match(await plain(page,'#aeInfo'),/Lunge Stance.*Stigma · slot 2.*Slot open\. Equip it\./);
  await page.keyboard.press('Escape');
  await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide'),/At Lv 32 slot 3 opens\. Put Zikel's Blessing in it\./);
  await page.click('[data-guide="back"]');
  assert.match(await plain(page,'.ae-guide'),/Tip 2 of 5/);
  const box=await page.locator('.ae-guide').boundingBox();
  assert.ok(box.y+box.height<=1000,'The guide stays on screen');
  for(let i=0;i<3;i++)await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide [data-guide="menu"]'),/Done/);
  await Promise.all([page.waitForURL(/\/ascent\/\?class=gladiator&role=dps&level=30$/),page.click('[data-guide="menu"]')]);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('stigma screen shows what is equipped now; macro screen shows how to bind it and the presets',async()=>{
  const stg=await open(ascent(ref,'stigma'),{live:true});
  assert.match(await plain(stg.page,'#aeStigmaNow'),/Equipped now\s*None yet/);
  await stg.context.close();
  const mac=await open(ascent('class=gladiator&role=dps&level=30','macro'));
  assert.deepEqual(await mac.page.$$eval('#aeMacroBind .ae-crumbs li',items=>items.map(el=>el.textContent)),['Settings','Key Settings','General','Gameplay','Macro']);
  assert.match(await plain(mac.page,'#aeMacroBind'),/No key is set at the start, so bind one\./);
  assert.match(await plain(mac.page,'#aeMacroPresets'),/Each of your 3 skill presets keeps its own macro/);
  for(let i=0;i<10&&!/Give the macro a key/.test(await plain(mac.page,'.ae-guide'));i++)await mac.page.click('[data-guide="next"]');
  assert.match(await plain(mac.page,'.ae-guide'),/Give the macro a key: Settings, Key Settings, General, Gameplay, Macro\./);
  assert.match(await mac.page.getAttribute('#aeMacroBind','class'),/ae-guide-target/);
  await mac.context.close();
});
await check('every screen opens with a guide and no errors',async()=>{
  for(const screen of SCREENS){
    const {page,context,errors}=await open(ascent(ref,screen),{live:true});
    await page.waitForSelector('.ae-guide:not([hidden])');
    // Walkthrough fix (11 Oct 2026): the step bar is the only "step"; the guide counts tips.
    assert.match(await plain(page,'.ae-guide-count'),/^Tip 1 of \d+$/,`${screen} guide`);
    assert.equal(await page.locator('.ae-guide-target').count(),1,`${screen}: one thing lit up`);
    assert.equal(await page.getAttribute('body','data-faction'),'elyos');
    assert.deepEqual(errors,[],`${screen} errors`);
    await context.close();
  }
});

/* ---------- First-visit flow (10 Oct 2026): the first move must be right, the step bar, one Next, the title first, the menu guide ---------- */

const stepsOf=page=>page.$$eval('#aeSteps .ae-step',items=>items.map(el=>({label:el.querySelector('.ae-step-label').textContent,current:el.getAttribute('aria-current'),done:el.classList.contains('is-done'),locked:el.classList.contains('is-locked'),href:el.getAttribute('href'),tick:Boolean(el.querySelector('.ae-step-tick')),note:el.querySelector('.ae-step-note')?.textContent??null})));
const firstQuest=page=>page.$eval('.ae-quest',el=>({title:el.querySelector('strong').textContent,href:el.getAttribute('href'),view:el.dataset.questView,board:el.dataset.questBoard??null}));
// The Daevanion move (at Lv 30 with no stigma yet, the stigma quest rightly ranks above it).
const boardQuest=page=>page.$eval('.ae-quest[data-quest-view="daevanion"]',el=>({title:el.querySelector('strong').textContent,href:el.getAttribute('href'),view:el.dataset.questView,board:el.dataset.questBoard??null}));

await check('Show me opens the board the move names: one board at a time, Nezekan finished, Zikel started (Elyos ids)',async()=>{
  // Role aware (17 Oct 2026, replaces the 12 Oct "board with nothing spent" rule): one board at a time in route order, so
  // with Nezekan done the move carries on with Zikel, never the untouched Vaizel, and never two boards.
  const {page,context,errors}=await open(ascent(vaizelRef),{live:true});
  const first=await boardQuest(page);
  assert.match(first.title,/^Carry on with Zikel: .+ next \(\d+ steps?\)$/,'The move names the current board and its next node');
  assert.equal(first.view,'daevanion');
  assert.equal(first.board,'12','The move carries the character\'s own board id');
  assert.match(first.href,/^\/hub\/aetherium\/ascent\/daevanion\/\?serverId=1313&characterId=[^&]+&region=eu&class=gladiator&role=dps&board=12$/,'Show me carries the board');
  const titles=await page.$$eval('.ae-quest-text strong',items=>items.map(el=>el.textContent));
  assert.equal(titles.filter(title=>/Nezekan|Zikel|Vaizel/.test(title)).length,1,'One Daevanion move, one board');
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\//),page.click('.ae-quest[data-quest-view="daevanion"]')]);
  await page.waitForSelector('.ae-board-grid');
  assert.equal(await page.getAttribute('[data-board-tab="12"]','aria-selected'),'true','Show me opened Zikel');
  assert.equal(await page.getAttribute('[data-board-tab="11"]','aria-selected'),'false');
  assert.equal(new URL(page.url()).searchParams.get('board'),'12');
  // Select buttons (17 Oct 2026): the group headings are gone; each board button carries its status and tag.
  assert.equal(await page.getAttribute('[data-board-tab="11"]','data-board-status'),'done','Nezekan is done for your role');
  assert.equal(await page.locator('[data-board-tab="11"] .ae-board-tick').count(),1,'Nezekan carries the tick');
  assert.equal(await page.getAttribute('[data-board-tab="12"]','data-board-status'),'now');
  assert.equal(await plain(page,'[data-board-tab="12"] [data-tag="now"]'),'Now','Zikel carries the Now tag');
  assert.equal(await page.getAttribute('[data-board-tab="13"]','data-board-status'),'later');
  assert.equal(await page.locator('[data-board-tab="13"] .ae-board-tag,[data-board-tab="13"] .ae-board-tick').count(),0,'Vaizel has no tag');
  assert.match(await plain(page,'#aeRouteSummary'),/Enter the points you have/,'Zikel has a route to take');
  assert.deepEqual(errors,[]);
  await context.close();
});
await check('Show me opens the board the move names for an Asmodian Daeva (Zikel is board 32)',async()=>{
  // Role aware (17 Oct 2026): the same shape as the Elyos Daeva, so the move carries on with Zikel, by its Asmodian id.
  const {page,context,errors}=await open(ascent(asmoVaizelRef),{live:true});
  assert.equal(await page.getAttribute('body','data-faction'),'asmodian');
  const first=await boardQuest(page);
  assert.match(first.title,/^Carry on with Zikel: .+ next \(\d+ steps?\)$/,first.title);
  assert.equal(first.board,'32','The Asmodian id, matched by name');
  assert.match(first.href,/&region=as&class=gladiator&role=dps&board=32$/);
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\//),page.click('.ae-quest[data-quest-view="daevanion"]')]);
  await page.waitForSelector('.ae-board-grid');
  // The board buttons are compared in id order.
  assert.deepEqual(await page.$$eval('[data-board-tab]',tabs=>tabs.map(tab=>[Number(tab.dataset.boardTab),tab.getAttribute('aria-selected')]).sort((a,b)=>a[0]-b[0])),[[31,'false'],[32,'true'],[33,'false']],'Zikel (32) is open on the screen');
  assert.equal(new URL(page.url()).searchParams.get('board'),'32');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('a started board is the move when it is the current one; one board only; the Nezekan menu card still shows the board',async()=>{
  // Role aware (17 Oct 2026, replaces "a finished or started board is never a move"): one board at a time in route order,
  // so with Nezekan finished and Zikel and Vaizel started, the move carries on with Zikel; never two boards at once.
  const {page,context}=await open(ascent(spentRef),{live:true});
  const moves=await page.$$eval('.ae-quest[data-quest-view="daevanion"] strong',items=>items.map(el=>el.textContent));
  assert.equal(moves.length,1,'One Daevanion move');
  assert.match(moves[0],/^Carry on with Zikel/);
  assert.doesNotMatch(moves[0],/Nezekan|Vaizel| and /);
  assert.ok(await page.locator('.ae-quest').count()>0,'Other moves still come');
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/Nezekan: 88 \/ 88 nodes/);
  await context.close();
});

await check('step bar on the Ascent Plan: step 3 current, 1 and 2 ticked with a Daeva once opened; by hand steps 2 and 3 wait for a Daeva',async()=>{
  // Walkthrough fix (11 Oct 2026): a step shows done only once it has been opened, so this Daeva's setup step is stored as opened first.
  const live=await open(ascent(ref),{live:true,visited:['find','setup']});
  const steps=await stepsOf(live.page);
  assert.deepEqual(steps.map(step=>step.label),['Find your Daeva','See your setup','Your next moves']);
  assert.equal(steps[2].current,'step');
  assert.ok(steps[0].done&&steps[0].tick&&steps[1].done&&steps[1].tick,'Steps 1 and 2 are done, with ticks');
  assert.ok(!steps.some(step=>step.locked));
  assert.match(steps[0].href,/^\/hub\/aetherium\/\?serverId=1308&characterId=[^&]+&region=eu$/,'Step 1 opens this Daeva\'s card');
  assert.match(steps[1].href,/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=[^&]+&region=eu$/,'Step 2 opens this Daeva\'s setup');
  assert.equal(await live.page.locator('#aeHowThisWorks').count(),1,'How this works sits by the step bar');
  assert.ok(await live.page.$eval('#aeSteps',el=>el===document.querySelector('main').firstElementChild),'The step bar is first under the ribbon');
  assert.ok(parseFloat(await style(live.page,'#aeSteps .ae-step-label','font-size'))>=14,'Step text at least 14px');
  await live.context.close();
  const hand=await open(ascent('class=gladiator&role=dps&level=30'));
  const handSteps=await stepsOf(hand.page);
  assert.deepEqual(handSteps.filter(step=>step.locked).map(step=>[step.label,step.note]),[['See your setup','Find your Daeva first'],['Your next moves','Find your Daeva first']]);
  assert.equal(handSteps[2].current,'step','Step 3 is still the current step');
  assert.equal(handSteps[0].href,'/hub/aetherium/#aeSearch');
  assert.equal(await hand.page.locator('#aeSteps a').count(),1,'Only step 1 is a link without a Daeva');
  await hand.context.close();
});

await check('every Ascent Plan page has one Next: the menu to move 1, each screen to the next screen, the last back to the moves',async()=>{
  const menu=await open(ascent(ref),{live:true});
  assert.equal(await menu.page.locator('[data-next]').count(),1,'One Next on the menu');
  assert.equal(await menu.page.getAttribute('[data-next]','href'),(await firstQuest(menu.page)).href,'The menu\'s Next is move 1');
  assert.match(await plain(menu.page,'#aeNext'),/Start Nezekan: Overhead Slam \+1 next \(7 steps\).*Next: Show me move 1/);
  const nextBox=await menu.page.$eval('#aeNext',el=>el.getBoundingClientRect().toJSON()),planBox=await menu.page.$eval('#aePlan',el=>el.getBoundingClientRect().toJSON());
  assert.ok(nextBox.top>=planBox.bottom-0.5,'Next ends the page');
  assert.ok((await menu.page.$eval('[data-next]',el=>el.getBoundingClientRect().height))>=44,'Next at least 44px tall');
  await menu.context.close();
  const order=[...SCREENS,'menu'];
  for(let i=0;i<SCREENS.length;i++){
    const {page,context}=await open(ascent('class=gladiator&role=dps&level=30',SCREENS[i]));
    assert.equal(await page.locator('[data-next]').count(),1,`${SCREENS[i]}: one Next`);
    const after=order[i+1];
    assert.equal(await page.getAttribute('[data-next]','href'),after==='menu'?'/hub/aetherium/ascent/?class=gladiator&role=dps&level=30':`/hub/aetherium/ascent/${after}/?class=gladiator&role=dps&level=30`,`${SCREENS[i]} leads to ${after}`);
    assert.match(await plain(page,'[data-next]'),/^Next: /);
    await context.close();
  }
});

const AGE_LINE=/^Read from the official AION 2 site (just now|\d+ minutes? ago)\.$/;
await check('title first: the data age sits under the title, small; on a screen it sits in the window bar',async()=>{
  const {page,context}=await open(ascent(ref),{live:true});
  assert.equal(await page.isVisible('#aeSource'),true);
  const title=await page.$eval('#aeAscentTitle',el=>el.getBoundingClientRect().toJSON()),source=await page.$eval('#aeSource',el=>el.getBoundingClientRect().toJSON());
  assert.ok(source.top>=title.bottom-0.5,`The data line is under the title (${source.top} vs ${title.bottom})`);
  assert.ok(await page.$eval('#aeSource',el=>el.closest('.ae-ascent-intro')!==null),'Inside the intro, after the title');
  assert.equal(await page.evaluate(()=>[...document.querySelector('main').children].find(el=>el.getBoundingClientRect().height>0).id),'aeSteps','The step bar comes first, never the data line');
  assert.equal(await style(page,'#aeSource','font-size'),'14px','Small, never under 14px');
  // Any age: a slow machine can take the read past the minute ("just now" or "N minute(s) ago"), never cached as live.
  assert.match(await page.textContent('#aeSource'),AGE_LINE);
  await context.close();
  const screen=await open(ascent(ref,'mastery'),{live:true});
  assert.match(await plain(screen.page,'.ae-gw-bar .ae-gw-source'),AGE_LINE,'A screen shows the data age in its window bar');
  await screen.context.close();
});

await check('first visit to the Ascent Plan: one guide step pointing at Your next moves, shown once, How this works brings it back',async()=>{
  const {page,context,errors}=await open(ascent(ref),{live:true});
  await page.waitForSelector('#aeGuide:not([hidden])');
  assert.match(await plain(page,'.ae-guide-count'),/^Tip 1 of 1$/);
  assert.match(await plain(page,'.ae-guide-text'),/^Your next moves are below, in order\. Do move 1 first in the game\./);
  assert.match(await page.getAttribute('#aeNow','class'),/ae-guide-target/,'Your next moves is lit up');
  assert.equal(await style(page,'.ae-guide-text','font-size'),'16px','Guide text is 16px');
  assert.equal(await page.locator('#aeGuide [data-guide="done"]').count(),1);
  await page.click('#aeGuide [data-guide="done"]');
  assert.equal(await page.isHidden('#aeGuide'),true,'Done closes it');
  assert.equal(await page.locator('.ae-guide-target').count(),0);
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await page.waitForSelector('#aeNow');
  await page.waitForTimeout(150);
  assert.equal(await page.isHidden('#aeGuide'),true,'Shown once per device');
  await page.click('#aeHowThisWorks');
  assert.equal(await page.isVisible('#aeGuide'),true,'How this works brings it back');
  assert.match(await page.getAttribute('#aeNow','class'),/ae-guide-target/);
  assert.deepEqual(errors,[]);
  await context.close();
  const hand=await open(ascent('class=gladiator&role=dps&level=30'));
  await hand.page.waitForSelector('#aeGuide:not([hidden])');
  assert.doesNotMatch(await plain(hand.page,'.ae-guide-text'),/Daeva/,'By hand the step says nothing about a Daeva');
  await hand.context.close();
});

for(const width of [390,820,1280,1600,1920]){
  await check(`flow at ${width}: step bar, Next and the guide line up with the plan, no sideways scroll`,async()=>{
    const {page,context}=await open(ascent(ref),{viewport:{width,height:900},live:true});
    await page.waitForSelector('#aeGuide:not([hidden])');
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=0,'scrolls sideways');
    const box=selector=>page.$eval(selector,el=>el.getBoundingClientRect().toJSON());
    const steps=await box('#aeSteps'),plan=await box('#aePlan'),next=await box('#aeNext');
    assert.ok(Math.abs(steps.left-plan.left)<=1&&Math.abs(steps.right-plan.right)<=1,`step bar on the grid (${steps.left}/${steps.right} vs ${plan.left}/${plan.right})`);
    assert.ok(Math.abs(next.left-plan.left)<=1&&Math.abs(next.right-plan.right)<=1,'Next row on the grid');
    const items=await page.$$eval('#aeSteps .ae-step',els=>els.map(el=>el.getBoundingClientRect().toJSON()));
    assert.ok(items.every(item=>item.height>=44),'every step at least 44px tall');
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(items[i].right<=items[j].left+0.5||items[j].right<=items[i].left+0.5||items[i].bottom<=items[j].top+0.5||items[j].bottom<=items[i].top+0.5,`steps ${i} and ${j} overlap`);
    const guide=await page.locator('#aeGuide').boundingBox();
    assert.ok(guide.y+guide.height<=900+0.5,'the guide stays on screen');
    await context.close();
  });
}

/* ---------- Skill stacks (feature/aetherium-skill-stacks, 10 Oct 2026): the bar as keys with rows 0 to 3, the key panel, chains, the macro from the stacks, rule tags ---------- */

const GLAD30='class=gladiator&role=dps&level=30';
const mechanicsJson=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/mechanics.json'),'utf8'));
const flipped=structuredClone(mechanicsJson);
for(const rule of flipped.records)rule.status='confirmed';
const box=(page,selector)=>page.$eval(selector,el=>el.getBoundingClientRect().toJSON());

await check('stacks: keys as columns with rows 0 to 3, row 0 at the bottom above the keycaps; no "Bar 0" or "Bar 1" wording on any screen',async()=>{
  const {page,context,errors}=await open(ascent(GLAD30,'skill-bar'));
  const rows=await page.$$eval('[data-bar-col="B"] [data-bar-row]',items=>items.map(el=>[el.dataset.barRow,el.getBoundingClientRect().top]));
  assert.deepEqual(rows.map(r=>r[0]),['3','2','1','0'],'Rows 3 to 0, top to bottom');
  assert.ok(rows[3][1]>rows[0][1],'Row 0 is lowest');
  assert.ok((await box(page,'[data-bar-keycap="B"]')).top>=(await box(page,'[data-bar-col="B"] [data-bar-row="0"]')).bottom-0.5,'The key label sits under row 0');
  assert.equal(await page.locator('.ae-bar-col [data-bar-keycap]').count(),12,'Every key is a button: 1 to 8, Q, E, left click, right click');
  assert.ok((await box(page,'[data-bar-keycap="1"]')).height>=44,'Keycaps are 44px touch targets');
  assert.ok((await box(page,'[data-bar-keycap="B"]')).height>=44);
  assert.match(await plain(page,'#aeStackRule'),/Each key is a stack: press it and the lowest ready skill fires, row 0 first\./);
  assert.equal(await page.locator('#aeStackRule [data-rule-tag]').count(),0,'The stack rule is confirmed: no tag');
  assert.equal(await page.locator('#aeStackRule [data-status-tag="stacks-unverified"]').count(),0,'The Gladiator line is checked against a published build: no tag');
  assert.match(await plain(page,'.ae-bar-note'),/only says whether a skill is equipped, never which key or row it is on/);
  assert.ok(parseFloat(await style(page,'#aeStackRule','font-size'))>=16);
  assert.equal(await page.locator('.ae-bar-cell.is-cd-pending').count()>0,true,'Pending cooldowns are marked');
  // Rage Burst's 45 s comes from the research record, so it is not in the pending list; Rending Blow stays out (the build's filler).
  assert.match(await plain(page,'.ae-bar-pending'),/Cooldown not captured yet for .*Lunge Stance/);
  assert.doesNotMatch(await plain(page,'.ae-bar-pending'),/Rending Blow|Rage Burst/);
  assert.deepEqual(await page.$$eval('#aeNotOnBar li',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim()).slice(-1)),["Aerial Snare Not in this build's bar. Swap it in if you like it."]);
  assert.deepEqual(errors,[]);
  await context.close();
  // Templar level guidance (17 Oct 2026): every Templar cooldown on the bar is now captured from the tooltip data, so
  // none is marked pending (the Gladiator bar above still checks the pending marker).
  const templar=await open(ascent('class=templar&level=45','skill-bar'));
  assert.equal(await templar.page.locator('.ae-bar-cell.is-cd-pending').count(),0,'No Templar cooldown left pending');
  assert.equal(await templar.page.locator('.ae-bar-pending').count(),0,'No pending cooldown line for the Templar');
  assert.deepEqual(await templar.page.$$eval('#aeRightBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['LMB','A','B'],'Left click, the shield stack on right click, the smash stack in one more column');
  assert.equal(await templar.page.locator('[data-bar-keycap="A"].is-mouse').count(),1,'Stack A on right click');
  await templar.context.close();
  // The classes not checked against a published top-player build carry the tag on the Skill Bar and Macro screens. The
  // Assassin's main line was checked against published builds on 17 Oct 2026 (docs/level-guidance/assassin.md): no tag.
  for(const cls of ['assassin','ranger','sorcerer','spiritmaster'])for(const screen of ['skill-bar','macro']){
    const {page:p,context:c}=await open(ascent(`class=${cls}&level=45`,screen));
    assert.equal(await p.locator('[data-status-tag="stacks-unverified"]').count(),cls==='assassin'?0:1,`${cls} ${screen}: Not confirmed yet`);
    await c.close();
  }
  for(const screen of ['',...SCREENS]){
    const {page:p,context:c}=await open(ascent(GLAD30,screen));
    const text=await p.evaluate(()=>document.body.innerText);
    assert.doesNotMatch(text,/\bBar [0-3]\b|bar 1 holds|Spare, on bar/i,`${screen||'menu'}: old bar wording`);
    assert.doesNotMatch(text,/[–—]/,`${screen||'menu'}: no dashes`);
    await c.close();
  }
});
await check('key panel: tap a key and the stack reads in plain words with each skill\'s card; a single-skill key says why',async()=>{
  const {page,context}=await open(ascent(GLAD30,'skill-bar'));
  await page.click('[data-bar-keycap="B"]');
  assert.equal(await plain(page,'#aeInfoTitle'),'Main line');
  assert.equal(await plain(page,'#aeInfo [data-key-say]'),'Main line: Rage Burst fires when ready, otherwise Overhead Slam, then Rending Blow.');
  assert.deepEqual(await page.$$eval('#aeInfo .ae-stack-card',items=>items.map(el=>el.dataset.stackRow)),['0','1','3'],'A card per row, lowest first, the empty row left out');
  assert.match(await plain(page,'#aeInfo .ae-stack-card[data-stack-row="0"]'),/Row 0, fires first: 45 s cooldown.*Rage Burst/);
  assert.match(await plain(page,'#aeInfo .ae-stack-card[data-stack-row="3"]'),/no cooldown.*Rending Blow/);
  assert.ok(parseFloat(await style(page,'#aeInfo [data-key-say]','font-size'))>=16);
  await page.keyboard.press('Escape');
  await page.click('[data-bar-keycap="1"]');
  assert.match(await plain(page,'#aeInfo [data-key-say]'),/^Key 1: Sword Aura Rampage\. Use it in stagger windows: it only hits a staggered target\.$/);
  await page.keyboard.press('Escape');
  await page.click('[data-bar-keycap="LMB"]');
  assert.match(await plain(page,'#aeInfo [data-key-say]'),/^Left click: Keen Strike\. The game keeps Keen Strike on left click\./);
  await page.keyboard.press('Escape');
  // Keys by the hand (17 Oct 2026): the movement stack is on Q.
  await page.focus('[data-bar-keycap="Q"]');
  await page.keyboard.press('Enter');
  assert.equal(await plain(page,'#aeInfoTitle'),'Key Q','Keyboard opens the panel too');
  assert.match(await plain(page,'#aeInfo [data-key-say]'),/^Key Q: Leaping Slam fires when ready, otherwise Rush Strike\.$/);
  await context.close();
});
await check('chains come from the data and show on the skill card: lead-in, arrow, follow-up, marked not confirmed; Ankle Slice waits for its lead-ins',async()=>{
  const {page,context}=await open(ascent(GLAD30,'mastery'));
  await page.click('[data-mastery="Keen Strike"]');
  assert.equal(await page.locator('#aeInfo [data-chain]').count(),1);
  // Walkthrough fix (11 Oct 2026): a follow-up above the cap says the build names no way to reach it (no Keen Strike node).
  assert.match(await plain(page,'#aeInfo [data-chain]'),/Chain Keen Strike\s*Reckless Strike\s*from skill Lv 16\. Mastery stops at 11 and the build names no other source\. Follow-up: press it when it lights up\. Not confirmed yet Check it in game: Use a lead-in skill, then press the follow-up's key at once/);
  assert.equal(await page.locator('#aeInfo [data-chain] .ae-chain-arrow').count(),1,'An arrow between lead-in and follow-up');
  await page.keyboard.press('Escape');
  await page.click('[data-mastery="Rending Blow"]');
  assert.equal(await page.locator('#aeInfo [data-chain]').count(),0,'No chain in the data, none on the card');
  await page.keyboard.press('Escape');
  await context.close();
  const bar=await open(ascent(GLAD30,'skill-bar'));
  const followUps=await bar.page.$$eval('#aeFollowUps li',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim()));
  assert.deepEqual(followUps,['Reckless Strike follow-up to Keen Strike from skill Lv 16. Mastery stops at 11 and the build names no other source.','Upward Strike follow-up to Overhead Slam from skill Lv 8','Wrath Burst follow-up to Defiance from skill Lv 8','Ankle Slice The tooltip names two lead-in skills. They are not captured yet.']);
  assert.equal(await bar.page.locator('#aeFollowUps [data-rule-tag="chain-follow-up"]').count(),1);
  assert.match(await plain(bar.page,'#aeFollowUps [data-rule-test="chain-follow-up"]'),/^Check it in game: Use a lead-in skill, then press the follow-up's key at once\. Does it fire, and how long is it available\?$/);
  assert.equal(await bar.page.locator('.ae-bar-cell[data-bar-skill="Reckless Strike"]').count(),0,'Unconfirmed: the follow-up is not placed in a stack');
  await bar.context.close();
});

await check('macro window: one entry for the main line, each row in place, the limit line, how to run it',async()=>{
  const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=45','macro'));
  assert.deepEqual(await page.$$eval('.ae-macro-entry',items=>items.map(el=>[el.dataset.macroEntry,el.dataset.macroKey,[...el.querySelectorAll('.ae-macro-row')].map(row=>row.dataset.tip)])),[
    ['1','B',['Rage Burst','Overhead Slam','Rending Blow']]]);
  assert.match(await plain(page,'#aeMacroCount'),/^One entry\. The main line is on right click and is your macro\./);
  assert.deepEqual(await page.$$eval('#aeMacroBlock [data-block-col]',items=>items.map(el=>el.dataset.blockCol)),['LMB','B'],'The right-hand block above the window, no empty second stack');
  assert.equal(await plain(page,'#aeMacroHold p'),'Hold both. Your basic attack fills the gaps, gives MP and cuts each animation short.');
  assert.equal(await page.locator('#aeMacroHold [data-status-tag="hold-basic"]').count(),1,'REPORTED: Not confirmed yet');
  assert.ok(parseFloat(await style(page,'#aeMacroRule','font-size'))>=16);
  for(let i=0;i<10&&!/Hold the macro key and your main attack/.test(await plain(page,'.ae-guide'));i++)await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide'),/Hold the macro key and your main attack, Keen Strike, together\./);
  assert.match(await page.getAttribute('#aeMacroHold','class'),/ae-guide-target/);
  assert.deepEqual(errors,[]);
  await context.close();
  // A class with two stacks still shows two entries and the two-entry line.
  const templar=await open(ascent('class=templar&level=45','macro'));
  assert.equal(await plain(templar.page,'#aeMacroCount'),'Two entries, one for each stack. The shield stack is on right click and the smash stack sits next to it. Both go into your macro.');
  await templar.context.close();
});
await check('the in-game tests: the chain test where its rule is unconfirmed, the stack test not shown because the rule is confirmed; the macro shows the dummy test',async()=>{
  const bar=await open(ascent(GLAD30,'skill-bar'));
  assert.deepEqual(await bar.page.$$eval('[data-rule-test]',items=>[...new Set(items.map(el=>el.dataset.ruleTest))]),['chain-follow-up']);
  await bar.context.close();
  // Macro builder (16 Oct 2026): the macro-order question (listed order or a stack) no longer decides anything: Macro 1 is the two stacks.
  const mac=await open(ascent(GLAD30,'macro'));
  assert.deepEqual(await mac.page.$$eval('[data-rule-test]',items=>items.map(el=>el.dataset.ruleTest)),[]);
  assert.match(await plain(mac.page,'[data-fact-test="test-dummy"]'),/^Check it in game: Does Ctrl\+X open Combat Analysis, and does it show total damage over a set time\?$/);
  await mac.context.close();
});
await check('flipping a rule to confirmed in mechanics.json removes its tag and test from every screen',async()=>{
  for(const screen of ['skill-bar','macro','mastery']){
    const {page,context,errors}=await open(ascent(GLAD30,screen),{mechanics:flipped});
    if(screen==='mastery'){await page.click('[data-mastery="Keen Strike"]');assert.equal(await page.locator('#aeInfo [data-chain]').count(),1,'The chain still shows');}
    assert.equal(await page.locator('[data-rule-tag],[data-rule-test]').count(),0,`${screen}: no tag once the data says confirmed`);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const still=await open(ascent(GLAD30,'skill-bar'));
  assert.equal(await still.page.locator('[data-rule-tag="chain-follow-up"]').count(),1,'Back with the real data, the tag is back');
  await still.context.close();
});
for(const [width,height] of [[390,844],[1600,1000]]){
  await check(`stacks at ${width}: no sideways scroll, text 14px or more, cells 44px, screenshots for the PR`,async()=>{
    for(const screen of ['skill-bar','macro']){
      const {page,context}=await open(ascent(GLAD30,screen),{viewport:{width,height}});
      assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=0,`${screen} scrolls sideways`);
      const small=await page.evaluate(()=>{const bad=[];const walker=document.createTreeWalker(document.querySelector('.ae-gw-body'),NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){if(!node.nodeValue.trim())continue;const el=node.parentElement;if(!el.getBoundingClientRect().height)continue;const size=parseFloat(getComputedStyle(el).fontSize);if(size<13)bad.push(`${el.className}: ${size}`);}return bad;});
      assert.deepEqual(small,[],`${screen}: nothing under 13px`);
      if(screen==='skill-bar'){const cell=await box(page,'[data-bar-key="0:1"]');assert.ok(cell.width>=44&&cell.height>=44,'cells are touch targets');}
      if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`stacks-${screen}-${width}.png`),fullPage:true});
      await context.close();
    }
  });
}

/* ---------- Walkthrough fix (fix/aetherium-walkthrough-logic, 11 Oct 2026): Lv 12 and Lv 41 Gladiator walks ---------- */
const goldCount=page=>page.$$eval('main .ae-primary',els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.height>0&&/linear-gradient/.test(getComputedStyle(el).backgroundImage);}).length);
const noSideScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const rectIn=(page,selector)=>page.$eval(selector,el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,display:getComputedStyle(el).display,size:parseFloat(getComputedStyle(el).fontSize)};});

await check('Lv 12 walk: the main line in place with Rage Burst greyed, Ruinous Blow on its own key, what the main line fires now; one gold action',async()=>{
  const {page,context,errors}=await open(ascent(ref,'skill-bar'),{live:true});
  const col=key=>page.$$eval(`[data-bar-key$=":${key}"][data-bar-skill]`,cells=>cells.map(el=>[Number(el.dataset.barKey.split(':')[0]),el.dataset.barSkill]).sort((a,b)=>a[0]-b[0]).map(item=>item[1]));
  // Level planner (17 Oct 2026): only what this Lv 12 Daeva can place is on the bar. Mocking Blade opens Overhead Slam in
  // Rage Burst's row until Rage Burst comes at Lv 22; key 4 stays free for Ruinous Blow (Lv 14). Both wait in Comes later.
  assert.deepEqual(await col('B'),['Mocking Blade','Overhead Slam','Rending Blow'],'Rows 0, 1 and 3 of the main line');
  assert.deepEqual(await col('4'),[],'Key 4 kept free for Ruinous Blow');
  assert.match(await page.getAttribute('[data-bar-keycap="4"]','aria-label'),/kept free for Ruinous Blow, which comes later/);
  assert.equal(await page.locator('#aeSpaceKey').count(),0,'Defiance (Lv 16) not on Space yet: it waits in Comes later');
  assert.equal(await page.locator('#aeSkillBar .ae-bar-cell.is-locked').count(),0,'Nothing greyed on the bar');
  assert.deepEqual(await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill)).then(list=>list.slice(0,2)),['Ruinous Blow','Defiance']);
  assert.ok((await page.$$eval('#aeComesLater [data-later-skill]',items=>items.map(el=>el.dataset.laterSkill))).includes('Rage Burst'));
  assert.match(await plain(page,'#aeFiresNow'),/^What fires now at Lv 12 Main line Mocking Blade, then Overhead Slam, then Rending Blow Rage Burst from Lv 22/);
  await page.click('[data-bar-keycap="B"]');
  assert.match(await plain(page,'#aeInfo [data-key-now]'),/^Until Lv 22, the main line fires Mocking Blade, then Overhead Slam, then Rending Blow\./);
  await page.keyboard.press('Escape');
  let guide='';
  for(let i=0;i<8&&!/main line fires/.test(guide);i++){guide=await plain(page,'.ae-guide-text');if(!/main line fires/.test(guide))await page.click('#aeGuide [data-guide="next"]');}
  assert.match(guide,/Until Lv 22, the main line fires /,'The guide says what the main line fires now');
  assert.doesNotMatch(await plain(page,'.ae-guide-count'),/step/i,'The guide counts tips, never steps');
  assert.equal(await goldCount(page),1,'One gold action: the Next');
  assert.deepEqual(errors,[]);
  await context.close();
});
/* Macro builder (feature/aetherium-macro-builder, 16 Oct 2026): replaces the macro eight checks (#491). The window draws one
   entry per stack the build uses, never 8 slots or free slots. Role aware (17 Oct 2026): the Gladiator runs one main line. */
for(const width of [1600,390]){
  await check(`macro window at ${width}: one entry, opener, own-key groups, settings, the dummy test, REPORTED tags, no sideways scroll`,async()=>{
    const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=45','macro'),{viewport:{width,height:1000}});
    assert.equal(await page.locator('.ae-macro-entry').count(),1);
    assert.equal(await page.locator('.ae-macro [data-macro-slot],.ae-macro-free').count(),0,'No 8-slot drawing, no Free slot');
    assert.doesNotMatch(await plain(page,'.ae-gw-body'),/Free slot|holds up to 8/);
    assert.equal(await page.locator('.ae-macro-delay').count(),1,'A delay after the entry');
    assert.deepEqual(await page.$$eval('.ae-macro-delay b',items=>items.map(el=>el.textContent)),['10']);
    const look=await page.evaluate(()=>({entry:document.querySelector('.ae-macro-entry').getBoundingClientRect().height,font:parseFloat(getComputedStyle(document.querySelector('#aeMacroCount')).fontSize)}));
    assert.ok(look.entry>=44,`entries 44px or more (${look.entry})`);
    assert.ok(look.font>=16,'The limit line is body size');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'No sideways scroll');
    assert.deepEqual(await page.$$eval('#aeMacroOpener [data-opener] small',items=>items.map(el=>el.textContent)),["Zikel's Blessing",'Lunge Stance','Ruinous Blow'],'The opener, numbered, in order');
    assert.deepEqual(await page.$$eval('#aeOwnKeys [data-own-group] > p',items=>items.map(el=>el.textContent)),['Buff','Stagger','Defensive','Dash','Movement'],'Own keys grouped by reason');
    await page.click('#aeOwnKeys [data-bar-skill="Ruinous Blow"]');
    assert.match(await plain(page,'#aeInfo [data-place-line]'),/^Dash: it rushes you to the target/,'Tap: the short why');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.$$eval('#aeMacroSettings [data-setting]',items=>items.map(el=>el.dataset.setting)),['delay','bind','skill-queue','presets']);
    assert.match(await plain(page,'[data-setting="delay"]'),/10 ms\. 40 to 50 ms if skills fail to fire or your ping is 80 ms or more\./);
    assert.match(await plain(page,'[data-setting="skill-queue"]'),/Players disagree\. Test both\./);
    assert.deepEqual(await page.$$eval('#aeMacroTest .ae-test-steps li',items=>items.map(el=>el.textContent)),['20 s: the macro alone.','20 s: the macro with your main attack held.','Keep the setup with the higher total.','Try Skill Queue on and off the same way.']);
    assert.equal(await page.locator('#aeMacroTest [data-status-tag="test-dummy"]').count(),1,'The dummy test is REPORTED until Ctrl+X is confirmed');
    assert.ok(await page.locator('[data-status-tag]').count()>=5,'Every REPORTED fact on the screen is tagged');
    const named=await page.$$eval('.ae-macro .ae-macro-row',items=>items.map(el=>el.dataset.tip.split('.')[0]));
    for(const name of ['Defiance','Rush Strike','Keen Strike','Ruinous Blow'])assert.ok(!named.includes(name),`${name} is never an entry`);
    assert.doesNotMatch(await page.textContent('.ae-gw-body'),/[–—]/,'No dashes');
    assert.doesNotMatch(await page.textContent('.ae-gw-body'),/\d+ ?%|aion2vault|daevaguides|dbaion2|allthings|questlog/i,'No percentages or source names');
    if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`macro-lv45-${width}.png`),fullPage:true});
    assert.deepEqual(errors,[]);
    await context.close();
  });
  await check(`macro window at ${width}, Lv 12: the main line, Rage Burst joins later, the opener greyed`,async()=>{
    const {page,context}=await open(ascent('class=gladiator&role=dps&level=12','macro'),{viewport:{width,height:1000}});
    assert.deepEqual(await page.$$eval('.ae-macro-entry',items=>items.map(el=>el.dataset.macroKey)),['B']);
    assert.match(await plain(page,'.ae-guide'),/Add the main line, 10 ms delay after it\./);
    // Level planner (17 Oct 2026): Rage Burst joins at Lv 22; the three opener skills cannot be placed at Lv 12, so there is no opener yet.
    assert.match(await plain(page,'#aeMacroLater'),/Rage Burst Lv 22\.$/);
    assert.equal(await page.locator('#aeMacroOpener').count(),0,'No opener before its skills can be placed');
    if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`macro-lv12-${width}.png`),fullPage:true});
    await context.close();
  });
}
await check('Skill Bar copy checklist: key by key, row by row, ending with the macro step; no skill in two places; locked skills dimmed in place',async()=>{
  const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=12','skill-bar'));
  const steps=await page.$$eval('#aeCopyBar .ae-copy-steps > li',items=>items.map(el=>el.dataset.copyStep));
  // Level planner (17 Oct 2026): only keys with something to place at Lv 12 (free keys are skipped), and no row from a later level.
  assert.deepEqual(steps,['1','Q','B','macro'],'Keys by the hand: key 1, the movement stack on Q, the main line');
  assert.equal(await plain(page,'#aeCopyBar [data-copy-step="macro"]'),'Then add the main line to Macro 1.');
  assert.deepEqual(await page.$$eval('#aeCopyBar [data-copy-step="B"] .ae-copy-rows li',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim())),['Row 0 Mocking Blade','Row 1 Overhead Slam','Row 2 leave it empty','Row 3 Rending Blow']);
  assert.doesNotMatch(await plain(page,'#aeCopyBar'),/from Lv|needs a stigma slot/,'Nothing in the copy list waits for a level or a slot');
  const names=await page.$$eval('.ae-bar-blocks [data-bar-skill]',items=>items.map(el=>el.dataset.barSkill));
  assert.equal(new Set(names).size,names.length,'No skill in two places');
  assert.equal(await page.locator('.ae-bar-blocks .ae-bar-cell.is-locked').count(),0,'Nothing dimmed: what waits is in Comes later');
  for(const name of ['Rage Burst','Ruinous Blow'])assert.equal(await page.locator(`#aeComesLater [data-later-skill="${name}"]`).count(),1,`${name} in Comes later`);
  assert.deepEqual(errors,[]);
  await context.close();
});
await check('Lv 12 walk: one level order across the next moves, Mastery and its guide; macro lists the two stacks; Defiance waits on its own key',async()=>{
  const menu=await open(ascent(ref),{live:true});
  const level=(await menu.page.$$eval('.ae-quest-text strong',items=>items.map(el=>el.textContent))).find(text=>/^Level /.test(text));
  // Level planner (17 Oct 2026): the logic's first step is Rending Blow at Lv 12 (it was Keen Strike, the build's priority 1).
  assert.equal(level,'Level Rending Blow (now Lv 3)');
  assert.equal(await goldCount(menu.page),1,'Menu: one gold action');
  await menu.context.close();
  const mastery=await open(ascent(ref,'mastery'),{live:true});
  const order=await mastery.page.$$eval('#aeMasterySpend [data-mastery]',items=>items.map(el=>el.dataset.mastery));
  assert.deepEqual(order,['Rending Blow','Overhead Slam','Keen Strike']);
  assert.match(await plain(mastery.page,'.ae-guide-text'),/^Put skill points into Rending Blow: Lv 3 to 8\./,'The Mastery guide starts with the same skill');
  await mastery.context.close();
  const macro=await open(ascent(ref,'macro'),{live:true});
  assert.deepEqual(await macro.page.$$eval('.ae-macro-entry',items=>items.map(el=>el.dataset.macroKey)),['B'],'Macro 1 lists the main line once');
  // Level planner (17 Oct 2026): Defiance (Lv 16) is not on a Lv 12 bar at all; its key stays free and it waits in Comes later.
  assert.equal(await macro.page.locator('#aeOwnKeys [data-bar-skill="Defiance"]').count(),0,'Defiance (Lv 16) not on a Lv 12 bar');
  assert.doesNotMatch(await plain(macro.page,'.ae-macro'),/Defiance/,'and never in the macro');
  await macro.context.close();
});
await check('Lv 41 walk: Wrath Wave equipped is a popular swap for Rage Burst, said once and not offered again',async()=>{
  const {page,context,errors}=await open(ascent(lv41Ref,'stigma'),{live:true});
  // Level planner (17 Oct 2026): Rage Burst is slot 1 now (it was slot 3).
  assert.equal(await plain(page,'[data-stigma-line="Wrath Wave"]'),'Slot 1: Wrath Wave is a popular swap for Rage Burst. Keep it or switch to Rage Burst.');
  const text=await page.evaluate(()=>document.body.innerText);
  assert.doesNotMatch(text,/Swap it for the stigmas below|Want a swap\? Wrath Wave/,'The screen never tells the player to swap Wrath Wave out, then offers it');
  assert.deepEqual(await page.$$eval('[data-alt]',items=>items.map(el=>el.dataset.alt)),['Blade Toss'],'Swaps: only the one not equipped');
  assert.equal(await page.getAttribute('[data-stigma-now="Wrath Wave"]','data-verdict'),'swap');
  const guide=[];
  for(let i=0;i<8;i++){guide.push(await plain(page,'.ae-guide-text'));if(!await page.locator('#aeGuide [data-guide="next"]').count())break;await page.click('#aeGuide [data-guide="next"]');}
  assert.equal(guide.filter(line=>/Wrath Wave/.test(line)).length,1,'The guide says it once');
  assert.ok(!guide.some(line=>/Slot 1: equip Rage Burst/.test(line)),'and does not also tell the player to equip Rage Burst in that slot');
  assert.equal(await goldCount(page),1);
  assert.deepEqual(errors,[]);
  await context.close();
  const bar=await open(ascent(lv41Ref,'skill-bar'),{live:true});
  assert.equal(await bar.page.locator('#aeFiresNow [data-fires-later]').count(),0,'At Lv 41 every key fires: nothing waits');
  await bar.context.close();
});

await check('a step shows done only after a visit, per Daeva on this device; the Next is named as the step bar names it',async()=>{
  const plan=await open(ascent(ref),{live:true});
  let steps=await stepsOf(plan.page);
  assert.equal(steps[1].done,false,'See your setup is not done before it has been opened');
  assert.equal(await plan.page.$eval('#aeSteps [data-step="setup"]',el=>el.classList.contains('is-next')),true,'It shows as the next step');
  await plan.page.goto(`${base}/hub/aetherium/gear/?${ref}`);
  await plan.page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.match(await plain(plan.page,'[data-next]'),/^Next: Your next moves/,'The setup page goes on to step 3, named as the step bar names it');
  await plan.page.goto(`${base}${ascent(ref)}`);
  await plan.page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  steps=await stepsOf(plan.page);
  assert.equal(steps[1].done,true,'Done once opened');
  const stored=JSON.parse(await plan.page.evaluate(()=>localStorage.getItem('aetherium.steps.v1')));
  assert.equal(stored[`1308:${info.profile.characterId}`].setup,true,'Kept per Daeva');
  await plan.context.close();
});

// Grade rule (11 Oct 2026): was "the seven +0 items ringed" with the note "Ringed: the 7 worn items still at +0. Enchant them
// in game." The move now names the eight Common and Rare pieces below their +5 cap, and the note says what the move says.
await check('Show me on the enchant move opens the Gear page with the items it names ringed and in view',async()=>{
  const {page,context}=await open(ascent(ref),{live:true});
  const title=await plain(page,'.ae-quest[data-quest-view="gear"] .ae-quest-text');
  const href=await page.getAttribute('.ae-quest[data-quest-view="gear"]','href');
  await page.goto(`${base}${href}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await page.waitForSelector('#aeGear li.is-ringed');
  assert.equal(await page.locator('#aeGear li.is-ringed').count(),8,'The eight items the move names');
  // Gear grid (11 Oct 2026): was '.ae-flag' (the ENCHANT button, now removed). Each ringed tile carries the gold Enchant marker.
  assert.equal(await page.locator('#aeGear li.is-ringed[data-advice="enchant"]').count(),8,'each with its Enchant marker');
  assert.equal(await plain(page,'#aeGearRingNote'),title,'The line at the top says what the move says');
  assert.equal(await page.$eval('#aeGear li.is-ringed',el=>getComputedStyle(el).outlineStyle),'solid','The ring is drawn');
  await page.waitForTimeout(600);
  assert.ok(await page.$eval('#aeGear li.is-ringed',el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'The first ringed item is in view');
  await context.close();
});

/* fix/aetherium-gear-enchant-context (11 Oct 2026): gear moves are specific and in order, Show me rings only what a move names,
   and the Gear page's back link returns to the plan, never a loop. A renamed Lv 45 Daeva (Unique weapon +3, guard +11, Epic set). */
const ref45=new URLSearchParams({serverId:'1317',characterId:lv45Info.profile.characterId});
await check('Lv 45 gear moves: weapon to +10, belt and amulet to +10, replace the Epic pieces, then the guard to +15 marked costly',async()=>{
  const {page,context}=await open(ascent(ref45),{live:true});
  const quests=await page.$$eval('.ae-quest',items=>items.map(el=>[el.dataset.questView,el.querySelector('.ae-quest-text').textContent.trim(),el.getAttribute('href')]));
  const gear=quests.filter(([view])=>view==='gear');
  assert.ok(gear.length>=1);
  assert.equal(gear[0][1],'Enchant Spiritforged Greatsword +3 to +10');
  assert.match(gear[0][2],/#enchant-1$/);
  assert.doesNotMatch(quests.map(quest=>quest[1]).join('|'),/Enchant \d+ (worn )?items/,'Never one vague line');
  // The gear move shows the item it names on its grade tile.
  assert.equal(await page.$eval('.ae-quest[data-quest-view="gear"] .ae-gtile',el=>el.dataset.grade),'unique');
  await context.close();
});

await check('Show me on a Lv 45 gear move rings only the items it names, and the back link returns to the Ascent Plan',async()=>{
  for(const [hash,count,say] of [['#enchant-1',1,'Enchant Spiritforged Greatsword +3 to +10'],['#replace-epic',11,'Replace 11 Epic pieces with Unique gear'],['#enchant-2',1,'Enchant Wisdom Guard +11 to +15']]){
    const {page,context}=await open(`/hub/aetherium/gear/equipment/?${ref45}${hash}`,{live:true});
    await page.waitForSelector('#aeGear li.is-ringed');
    assert.equal(await page.locator('#aeGear li.is-ringed').count(),count,hash);
    assert.equal(await plain(page,'#aeGearRingNote'),say);
    const back=await page.getAttribute('.ae-gw-back','href');
    assert.match(back,/^\/hub\/aetherium\/ascent\/\?serverId=1317&characterId=[^#]+#aeNow$/,'Back goes to the plan');
    assert.match(await plain(page,'.ae-gw-back'),/Plan/);
    await Promise.all([page.waitForURL(/\/ascent\//),page.click('.ae-gw-back')]);
    await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
    assert.ok(await page.locator('.ae-quest').count(),'Back on the moves');
    await context.close();
  }
  // Tapping a flag after Show me opens the card in place: no way round to the plan and back again.
  const {page,context}=await open(`/hub/aetherium/gear/equipment/?${ref45}#replace-epic`,{live:true});
  const before=page.url();
  // Gear grid (11 Oct 2026): was the REPLACE flag button; now the tile itself.
  await page.click('#aeGear [data-slot-pos="5"] button');
  await page.waitForSelector('#aeInfo:not([hidden]) #aeAdvice');
  assert.equal(page.url(),before,'No loop');
  await context.close();
});

await check('Stats: no dead end, the combat stats are named as not in the public data, no gold Check your gear',async()=>{
  const {page,context}=await open(ascent(ref,'stats'),{live:true});
  assert.equal(await plain(page,'#aeStatsWhere'),'The official AION 2 site does not share combat stats such as Attack, Defense or Accuracy, so the Gear page cannot show yours. Check them on your in-game character screen.');
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/Check your gear/);
  assert.equal(await goldCount(page),1);
  await context.close();
});

for(const width of [1600,390]){
  await check(`new sections at ${width}: why line, plan at a glance, What fires now, macro stacks, stigma lines, no sideways scroll`,async()=>{
    const viewport={width,height:width<500?844:1000};
    const menu=await open(ascent(ref),{live:true,viewport});
    assert.ok(await noSideScroll(menu.page)<=0,'menu: no sideways scroll');
    const glance=await rectIn(menu.page,'#aeGlanceTitle');
    assert.ok(glance.height>0&&glance.right<=width,'Your plan at a glance shows');
    assert.match(await plain(menu.page,'.ae-menu-card[data-view="skill-bar"] .ae-menu-status'),/^Stack A, Keen Strike, stack B$/);
    await menu.context.close();
    for(const [screen,selector,who] of [['skill-bar','#aeFiresNow',ref],['macro','.ae-macro-rows',ref],['stigma','[data-stigma-line]',lv41Ref],['mastery','#aeWhy',ref]]){
      const {page,context}=await open(ascent(who,screen),{live:true,viewport});
      assert.ok(await noSideScroll(page)<=0,`${screen} at ${width}: no sideways scroll`);
      const box=await rectIn(page,selector);
      const main=await rectIn(page,'.ae-gw-body');
      assert.ok(box.height>0&&box.width>0,`${screen}: ${selector} renders`);
      assert.ok(box.left>=main.left-1&&box.right<=main.right+1,`${screen}: ${selector} sits inside the window (${box.left}-${box.right} in ${main.left}-${main.right})`);
      assert.ok(box.size>=13,`${screen}: ${selector} text at least 13px`);
      const why=await rectIn(page,'#aeWhy');
      assert.ok(why.height>0&&why.size>=16,`${screen}: the why line reads at 16px`);
      if(screen==='skill-bar'){
        const bar=await rectIn(page,'#aeSkillBar');
        if(width>=1280)assert.ok(box.left>=bar.right-1,'Wide: What fires now sits beside the bar');
        else assert.ok(await page.$eval('#aeFiresNow',el=>el.getBoundingClientRect().top)>=await page.$eval('#aeSkillBar',el=>el.getBoundingClientRect().bottom)-1,'Phone: What fires now sits under the bar');
      }
      assert.equal(await goldCount(page),1,`${screen}: one gold action`);
      await context.close();
    }
  });
}

/* Stats explained (feature/aetherium-stats-explained, 11 Oct 2026): each combat stat shows the point stats that feed it, with
   the Daeva's own points, then what to look for on each kind of gear. By hand the same screen with no live numbers. */
await check('Stats screen: chains with live points, gear rows with skips, no live numbers by hand, no sideways scroll',async()=>{
  const {page,context}=await open(ascent(`${ref45}&class=gladiator`,'stats'),{live:true});
  const ranks=await page.$$eval('[data-stat-rank]',items=>items.map(el=>el.querySelector('strong').textContent));
  assert.equal(ranks[0],'Accuracy (enough for your content)','The class order is kept');
  assert.equal(await plain(page,'[data-stat-rank="1"] [data-chain="Accuracy"]'),'Accuracy ← comes from Precision 11, Freedom [Vaizel] 26');
  assert.equal(await plain(page,'[data-stat-rank="2"] [data-chain="Double Chance"]'),'Double Chance ← comes from Wisdom [Lumiel] 1');
  assert.match(await plain(page,'[data-stat-rank="4"]'),/From gear lines and Daevanion, not from stat points/);
  const rows=await page.$$eval('[data-gear-row]',items=>items.map(el=>[el.querySelector('strong').textContent,[...el.querySelectorAll('.ae-look-want')].map(want=>want.textContent),el.querySelector('.ae-look-skip')?.textContent??'']));
  assert.deepEqual(rows.map(row=>row[0]),['Weapon','Armour','Accessories','Arcana and Abyssal Bracelet']);
  assert.deepEqual(rows[0][1],['Precision','Might']);
  assert.equal(rows[1][2],'Skip: Dexterity, Constitution, Willpower');
  assert.equal(rows[2][2],'Skip: Intelligence');
  assert.match(await plain(page,'#aeGearLook'),/Not confirmed yet/);
  assert.equal(await plain(page,'#aeStatsWhere'),'The official AION 2 site does not share combat stats such as Attack, Defense or Accuracy, so the Gear page cannot show yours. Check them on your in-game character screen.');
  await context.close();
  const hand=await open(ascent('class=gladiator&role=dps&level=45','stats'));
  assert.equal(await plain(hand.page,'[data-stat-rank="1"] [data-chain="Accuracy"]'),'Accuracy ← comes from Precision, Freedom [Vaizel]','By hand: no live numbers');
  await hand.context.close();
  const phone=await open(ascent(`${ref45}&class=gladiator`,'stats'),{live:true,viewport:{width:390,height:844}});
  assert.equal(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390: no sideways scroll');
  await phone.page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await phone.page.setViewportSize({width:800,height:900});
  assert.equal(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'200 percent: no sideways scroll');
  await phone.context.close();
  const assassin=await open(ascent('class=assassin&level=45','stats'));
  assert.match(await plain(assassin.page,'#aeNoStatOrder'),/No stat order for this class yet/);
  assert.equal(await assassin.page.locator('.ae-look-skip').count(),0,'No ranking, so nothing is skipped');
  await assassin.context.close();
});

/* Stat icons (design/aetherium-stat-icons, 11 Oct 2026): each stat in a chain carries its own 20px icon from our sprite,
   named by stats.json, with the heavier small stroke and no Precision dot; gold when High for the class. Never NCSOFT's. */
await check('Stats screen: every chain stat has its own 20px icon, gold when High; the sprite has the 16 symbols; no NCSOFT stat icon',async()=>{
  const stats=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/stats.json'),'utf8'));
  const points=stats.records.filter(record=>record.kind==='main'||record.kind==='deity');
  const STAT_IDS=['might','dexterity','precision','willpower','intelligence','constitution','justice','freedom','illusion','life','time','destruction','death','wisdom','destiny','space'];
  assert.deepEqual(points.map(record=>record.icon).sort(),STAT_IDS.map(id=>`ae-stat-${id}`).sort(),'stats.json names all 16 icons');
  const sprite=await readFile(resolve(root,'astrix-app/pages/aetherium/icons/stats.svg'),'utf8');
  assert.deepEqual([...sprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 40 40">/g)].map(match=>match[1]),STAT_IDS.map(id=>`ae-stat-${id}`),'16 symbols with the ids, 40 by 40');
  assert.doesNotMatch(sprite,/\b(fill|stroke|color)=|#[0-9a-f]{3,6}\b|rgb\(/i,'No fills or colours in the file');
  const byName=new Map(points.map(record=>[record.name,record]));
  const {page,context,requested}=await open(ascent(`${ref45}&class=gladiator`,'stats'),{live:true});
  const chained=await page.$$eval('.ae-chain-stat',items=>items.map(el=>{const svg=el.querySelector('svg.ae-stat-icon'),c=svg&&getComputedStyle(svg),box=svg?.getBoundingClientRect();
    return {name:el.firstChild?.nextSibling?.textContent?.trim()??el.textContent,text:el.textContent.replace(/\s+/g,' ').trim(),href:svg?.querySelector('use')?.getAttribute('href')??null,hidden:svg?.getAttribute('aria-hidden'),w:box?.width,stroke:c?.stroke,width:c?.strokeWidth,dot:c?.getPropertyValue('--ae-stat-dot').trim(),high:svg?.classList.contains('is-high')};}));
  assert.ok(chained.length>=3,'Chains to check');
  const rank={precision:'high'};
  for(const stat of chained){
    const record=[...byName.values()].find(r=>stat.text.startsWith(r.name));
    assert.ok(record,`${stat.text}: a known stat`);
    assert.match(stat.href??'',new RegExp(`^/astrix-app/pages/aetherium/icons/stats\\.svg\\?v=[^#]+#${record.icon}$`),`${record.name}: <use> points at its own symbol`);
    assert.equal(stat.hidden,'true');assert.equal(Math.round(stat.w),20,`${record.name}: 20px`);
    assert.equal(stat.width,'2.4px',`${record.name}: heavier stroke at 24px or less`);assert.equal(stat.dot,'none','Precision drops its dot when small');
    assert.equal(stat.stroke,stat.high?GOLD:'rgb(143, 208, 255)',`${record.name}: gold when High, else pale blue`);
    if(rank[record.id])assert.equal(stat.high,true,`${record.name}: High for Gladiator`);
  }
  assert.ok(chained.some(stat=>stat.high),'A High stat in gold by computed style');
  assert.equal(await plain(page,'[data-stat-rank="1"] [data-chain="Accuracy"]'),'Accuracy ← comes from Precision 11, Freedom [Vaizel] 26','The icons add no text');
  const sprites=requested.filter(url=>/\/icons\/stats\.svg/.test(url));
  assert.ok(sprites.length>=1&&new Set(sprites).size===1,`One sprite URL: ${sprites}`);
  assert.deepEqual(requested.filter(url=>/plaync|ncsoft/i.test(new URL(url).host)&&/[\/_-]stats?(?:[_.\/-]|$)|stat_?icon|arcana|abilit/i.test(new URL(url).pathname)),[],'No NCSOFT stat icon');
  assert.equal(await page.evaluate(async url=>Boolean(new DOMParser().parseFromString(await (await fetch(url)).text(),'image/svg+xml').querySelector('parsererror')),sprites[0]),false,'The sprite parses in the browser');
  await context.close();
});

/* Role aware (feature/aetherium-role-aware, 17 Oct 2026): role and team picked once per Daeva, in the address and the roster;
   every screen follows them; the Daevanion route plans inside 415 points (board buttons tagged Now, a tick or Not needed). */
// The open() storage option writes the v1 roster (one list), which the page moves into the v2 roster on read.
const rosterWith=extra=>({entries:[{name:TEST_NAME,serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:12,raceName:'Elyos',region:'eu',...extra}],active:`1308:${info.profile.characterId}`});
await check('role and team: picked on the plan, saved with the Daeva, carried in the address, and used next time',async()=>{
  const {page,context}=await open(ascent(ref),{live:true,storage:rosterWith({})});
  assert.equal(await page.isHidden('#aeTeamField'),true,'DPS has no team variants: no Team field');
  await page.selectOption('#aeRole','tank');
  await page.waitForFunction(()=>location.search.includes('role=tank'));
  assert.equal(await page.isVisible('#aeTeamField'),true,'Tank has team variants');
  assert.equal(await page.inputValue('#aeTeam'),'solo','Solo or levelling by default');
  await page.selectOption('#aeTeam','main-tank');
  await page.waitForFunction(()=>location.search.includes('team=main-tank'));
  assert.match(page.url(),/role=tank&team=main-tank/);
  assert.equal(await plain(page,'#aeRoleLine'),'Gladiator · Tank with damage · Main tank, no Templar');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.roster.v2')??'null'));
  const entry=Object.values(saved.rosters)[0].entries[0];
  assert.deepEqual([entry.role,entry.team],['tank','main-tank'],'Saved with the Daeva in the roster');
  // Next visit with no role in the address: the saved role and team are used.
  await page.goto(`${base}${ascent(ref,'stigma')}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.match(await plain(page,'#aeGwWho'),/Tank · Main tank, no Templar/);
  assert.match(await plain(page,'#aeStigmaTeam'),/^Main tank, no Templar: Wave Armor in place of Lunge Stance\./);
  await context.close();
});
await check('every screen changes with role and team',async()=>{
  const read=async(query,screen,selector)=>{const {page,context}=await open(ascent(query,screen));const text=await plain(page,selector);await context.close();return text;};
  const dps='class=gladiator&role=dps&level=45',main='class=gladiator&role=tank&team=main-tank&level=45',off='class=gladiator&role=tank&team=off-tank-templar&level=45';
  assert.notEqual(await read(main,'skill-bar','#aeCopyBar'),await read(off,'skill-bar','#aeCopyBar'),'Skill Bar: Wave Armor or Lunge Stance');
  assert.notEqual(await read(dps,'macro','#aeMacroOpener'),await read(main,'macro','#aeMacroOpener'),'Macro: the opener');
  assert.notEqual(await read(main,'stigma','.ae-stg'),await read(off,'stigma','.ae-stg'),'Stigma: the team\'s four');
  assert.match(await read(off,'stigma','#aeStigmaTeam'),/Your parry buff does not stack with the Templar's Fury\./,'The swap reason with a Templar');
  assert.notEqual(await read(dps,'stats','.ae-stat-ranks'),await read(main,'stats','.ae-stat-ranks'),'Stats: the role\'s order');
  assert.match(await read(main,'stats','#aeManastones'),/HP up to \+160.*Block up to \+20/,'Manastone advice for the tank');
  assert.notEqual(await read(dps,'daevanion','#aeBoardFirst'),await read(main,'daevanion','#aeBoardFirst'),'Daevanion: the role\'s priorities');
  assert.notEqual(await read(dps,'mastery','#aeMastery'),await read(main,'mastery','#aeMastery'),'Mastery: the role\'s key skills');
});
await check('Daevanion: N of 415 points, board buttons with a points bar and tags (no group headings), the points box, the route summary',async()=>{
  const {page,context,errors}=await open(ascent(vaizelRef,'daevanion'),{live:true});
  await page.waitForSelector('.ae-board-grid');
  assert.match(await plain(page,'#aeBudget'),/^\d+ of 415 points\. This route takes \d+ more, \d+ left after it\./);
  // Select buttons (17 Oct 2026): no "Now", "Done for your role" or "Later" headings; the tags on the buttons say it.
  assert.equal(await page.locator('.ae-board-group-title,[data-board-group]').count(),0,'No group headings');
  assert.match(await plain(page,'[data-board-tab="11"]'),/^Nezekan 134 \/ 134$/,`Each button shows its points spent of the board total (${await plain(page,'[data-board-tab="11"]')})`);
  assert.match(await plain(page,'[data-board-tab="12"]'),/^Zikel \d+ \/ 134 Now$/);
  assert.equal(await page.$eval('[data-board-tab="11"] .ae-board-bar>span',el=>el.style.width),'100%','The bar is full on a spent board');
  assert.match(await plain(page,'[data-board-locked="14"]'),/Opens at Lv 40/,'A board not open yet sits under Later with its level');
  await page.fill('#aePoints','12');
  await page.waitForFunction(()=>/cover the next/.test(document.querySelector('#aeRouteSummary').textContent));
  assert.match(await plain(page,'#aeRouteSummary'),/^Your 12 points cover the next \d+ steps?\.( Step \d+ needs \d+ more points?\.)?/);
  await page.fill('#aePoints','0');
  await page.waitForFunction(()=>/^Step 1 needs/.test(document.querySelector('#aeRouteSummary').textContent.trim()));
  assert.match(await plain(page,'#aeRouteSummary'),/^Step 1 needs \d+ points?\.$/,'What the next step needs, never a guess');
  await page.click('[data-board-tab="11"]');
  await page.waitForFunction(()=>document.querySelector('[data-board-tab="11"]').getAttribute('aria-selected')==='true');
  await page.waitForSelector('#aeRouteSummary');
  assert.match(await plain(page,'#aeRouteSummary'),/^Done for your role: every node your role needs on this board is taken\.$/);
  assert.match(await plain(page,'#aeRouteTotal'),/Overhead Slam \+\d+ on this route: Lv \d+ with Mastery 11/);
  assert.deepEqual(errors,[]);
  await context.close();
});

/* ---------- Select buttons (fix/aetherium-select-buttons, 17 Oct 2026): everything a player picks is the one Aetherium
   button, in AION 2's colours: navy with a pale-blue edge, gold when selected, a blue focus ring; boards say Now, a tick or Not needed. ---------- */
const BTN_EDGE='rgb(111, 147, 191)',STROBE='rgb(79, 182, 255)';
const buttonLooks=(page,selector)=>page.$$eval(selector,els=>els.map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {text:(el.textContent||el.value||'').replace(/\s+/g,' ').trim().slice(0,30),cls:el.classList.contains('ae-btn'),visible:r.width>0&&r.height>0,height:r.height,clip:s.clipPath,radius:parseFloat(s.borderTopLeftRadius),shadow:s.boxShadow,color:s.color,bg:s.backgroundColor,selected:el.matches('[aria-selected="true"],[aria-pressed="true"],[aria-current="page"],[aria-current="true"]'),disabled:el.matches(':disabled,[aria-disabled="true"]')};}));
/** Every element the selector finds is the shared button; at least one is on screen, 44px or taller, a cylinder with rounded ends, with its edge; a selected one is gold. */
async function assertButtons(page,selector,name){
  const looks=await buttonLooks(page,selector);
  assert.ok(looks.length>0,`${name}: found`);
  for(const look of looks)assert.ok(look.cls,`${name} "${look.text}" uses the shared button (.ae-btn)`);
  const shown=looks.filter(look=>look.visible);
  assert.ok(shown.length>0,`${name}: one on screen`);
  for(const look of shown){
    assert.ok(look.height>=44,`${name} "${look.text}" is ${look.height}px tall`);
    // Cylinder buttons (Miguel, 17 Oct 2026): rounded ends, never a square or notched corner. Tall cards round at 20px.
    assert.equal(look.clip,'none',`${name} "${look.text}" is not clipped to a notch`);
    assert.ok(look.radius>=Math.min(look.height/2,20),`${name} "${look.text}" has rounded cylinder ends (${look.radius}px on ${look.height}px)`);
    assert.notEqual(look.bg,'rgba(0, 0, 0, 0)',`${name} "${look.text}" is a filled button, not plain text`);
    if(look.selected){assert.equal(look.color,GOLD,`${name} "${look.text}": selected in gold`);assert.ok(look.shadow.includes(GOLD),`${name} "${look.text}": a gold edge (${look.shadow})`);}
    else if(look.disabled)assert.equal(look.color,'rgb(127, 140, 166)',`${name} "${look.text}": disabled reads dim`);
    else assert.ok(look.shadow.includes(BTN_EDGE)||look.shadow.includes('rgb(185, 220, 255)'),`${name} "${look.text}": the pale-blue edge (${look.shadow})`);
  }
}
/** Keyboard focus shows the blue ring. */
async function assertFocusRing(page,selector,name){
  await page.focus(selector);
  await page.waitForTimeout(250);
  const ring=await page.$eval(selector,el=>({visible:el.matches(':focus-visible'),shadow:getComputedStyle(el).boxShadow}));
  assert.ok(ring.visible,`${name}: focus-visible`);
  assert.ok(ring.shadow.includes(STROBE),`${name}: the blue focus ring shows (${ring.shadow})`);
}
await check('board buttons on the Lv 45 Daeva: icon, name, bar and count; exactly one Now; Azphel Not needed, never Done; selected gold; 44px; focus ring; picking one opens it',async()=>{
  const {page,context,errors}=await open(ascent(ref45,'daevanion'),{live:true});
  await page.waitForSelector('.ae-board-grid');
  await assertButtons(page,'.ae-board-picks [data-board-tab]','board button');
  // The cylinder is lit from above: a light band at the top, shade at the bottom.
  assert.match(await page.$eval('[data-board-tab="13"]',el=>getComputedStyle(el).backgroundImage),/^linear-gradient\(rgb\(29, 48, 82\) 0%, rgb\(23, 37, 63\) 42%, rgb\(11, 20, 40\) 100%\)$/,'Cylinder light on a board button');
  assert.equal(await page.locator('[data-board-status="now"]').count(),1,'Exactly one Now board');
  assert.equal(await page.locator('.ae-board-tag[data-tag="now"]').count(),1,'One Now tag');
  assert.equal(await page.getAttribute('[data-board-tab="16"]','data-board-status'),'not-needed','Azphel has no priority nodes for the role: Not needed');
  assert.equal(await plain(page,'[data-board-tab="16"] [data-tag="not-needed"]'),'Not needed');
  assert.equal(await page.locator('[data-board-tab="16"] .ae-board-tick').count(),0,'Azphel is never ticked as Done');
  assert.match(await plain(page,'[data-board-tab="16"]'),/^Azphel 0 \/ 232 Not needed$/);
  for(const id of [11,12,13,14,16]){
    assert.equal(await page.locator(`[data-board-tab="${id}"] img.ae-board-icon`).count(),1,`Board ${id} shows its official icon`);
    assert.match(await page.getAttribute(`[data-board-tab="${id}"] img.ae-board-icon`,'src'),/playnccdn\.com\/static-aion2-gamedata\/resources\/UT_/,'The icon the official data names');
  }
  assert.equal(await page.$eval('[aria-selected="true"][data-board-tab]',el=>getComputedStyle(el).color),GOLD,'The selected board is gold');
  await assertFocusRing(page,'[data-board-tab="13"]','board button');
  await page.click('[data-board-tab="16"]');
  await page.waitForFunction(()=>document.querySelector('[data-board-tab="16"]').getAttribute('aria-selected')==='true');
  assert.equal(new URL(page.url()).searchParams.get('board'),'16','Picking a button opens that board');
  await page.waitForFunction(()=>/0 of 232 points spent/.test(document.querySelector('.ae-route-meta')?.textContent??''));
  assert.match(await plain(page,'.ae-route-meta'),/nodes for your role 0 of 0$/,'Azphel has no nodes for the role');
  assert.doesNotMatch(await plain(page,'#aeRouteSummary'),/Done for your role/,'Never called done');
  assert.deepEqual(errors,[]);
  await context.close();
  // At 390 the buttons wrap with no sideways scroll, and stay 44px tall.
  const phone=await open(ascent(ref45,'daevanion'),{live:true,viewport:{width:390,height:844}});
  await phone.page.waitForSelector('.ae-board-grid');
  assert.ok(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll at 390');
  const boxes=await phone.page.$$eval('.ae-board-picks .ae-board-btn',els=>els.map(el=>el.getBoundingClientRect()).map(r=>({left:r.left,right:r.right,height:r.height})));
  assert.ok(boxes.every(box=>box.left>=0&&box.right<=390&&box.height>=44),`Every board button fits at 390 (${JSON.stringify(boxes)})`);
  assert.ok(new Set(boxes.map(box=>Math.round(box.left))).size>=2,'Two buttons a row at 390');
  await phone.context.close();
});
await check('every other selectable on the Aetherium pages is the shared button: screen tabs, pickers, roster, results, Compare, Gear Ledger cards, tip Back and Next',async()=>{
  // Ascent Plan: the screen tabs, class and role pickers, the team picker, the tip buttons.
  const plan=await open(ascent('class=gladiator&role=tank&team=main-tank&level=45','mastery'));
  await plan.page.waitForSelector('.ae-gw-tabs a');
  await assertButtons(plan.page,'.ae-gw-tabs a','Ascent Plan screen tab');
  assert.equal(await plan.page.locator('.ae-gw-tabs a[aria-current="page"]').count(),1);
  await assertButtons(plan.page,'.ae-guide-btn','tip button');
  await assertFocusRing(plan.page,'.ae-gw-tabs a:not([aria-current])','screen tab');
  await plan.context.close();
  const menu=await open(ascent('class=gladiator&role=tank&team=main-tank&level=45'));
  for(const id of ['#aeClass','#aeRole','#aeTeam'])await assertButtons(menu.page,id,`picker ${id}`);
  await assertFocusRing(menu.page,'#aeRole','role picker');
  await menu.context.close();
  // Daeva Card: region and server pickers, the roster entry (the active one gold), the role picker.
  const card=await open(`/hub/aetherium/?${ref}`,{live:true,storage:rosterWith({})});
  for(const id of ['#aeRegion','#aeServer'])await assertButtons(card.page,id,`picker ${id}`);
  await assertButtons(card.page,'.ae-roster-open','roster entry');
  assert.equal(await card.page.$eval('.ae-roster-slot.is-active .ae-roster-open',el=>getComputedStyle(el).color),GOLD,'The active Daeva is gold');
  assert.equal(await card.page.$eval('#aeCardRole',el=>el.classList.contains('ae-btn')),true,'The card role picker is the shared button');
  await assertFocusRing(card.page,'.ae-roster-open','roster entry');
  await card.context.close();
  // Search results.
  const found=await open('/hub/aetherium/',{live:true});
  // Two matches, so the page lists them (one match opens straight away).
  await found.page.route(`${WORKER}/aion2/search*`,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({list:[search.list[0],{...search.list[0],serverId:1309,serverName:'Hithanya'}],pagination:search.pagination,meta})}));
  await found.page.fill('#aeNameInput',TEST_NAME);
  await found.page.click('#aeFind');
  await found.page.waitForSelector('.ae-result');
  await assertButtons(found.page,'.ae-result','search result');
  await found.context.close();
  // Compare pickers.
  const compare=await open('/hub/aetherium/compare/',{live:true,storage:rosterWith({})});
  await compare.page.waitForSelector('[data-compare-pick]');
  await assertButtons(compare.page,'[data-compare-pick]','Compare picker');
  await compare.context.close();
  // Gear Ledger cards, and the tabs on the Skills and Daevanion pages.
  const gear=await open(`/hub/aetherium/gear/?${ref}`,{live:true});
  await assertButtons(gear.page,'#aeCards .ae-menu-card','Gear Ledger card');
  await gear.context.close();
  const skills=await open(`/hub/aetherium/skills/?${ref}`,{live:true});
  await skills.page.waitForSelector('.ae-gw-tab');
  await assertButtons(skills.page,'.ae-gw-tabs .ae-gw-tab','Skills tab');
  await skills.context.close();
  const dv=await open(`/hub/aetherium/daevanion/?${ref}`,{live:true});
  await dv.page.waitForSelector('.ae-board-grid .ae-node');
  await assertButtons(dv.page,'.ae-gw-tab','Daevanion page tab');
  await dv.context.close();
});

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_ASCENT=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_ASCENT=PASS');
