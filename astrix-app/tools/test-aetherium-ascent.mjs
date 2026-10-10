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
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

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

const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
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
      :serverId===String(ASMO_V.serverId)?{info:asmoVaizelInfo,equipment:ASMO_V.equipment}
      :lv22?{info:lv22Info,equipment:lv22Equipment}:{info:asmo?asmoInfo:info,equipment};
    const bodies={
      '/aion2/search':asmo?asmoSearch:search,
      '/aion2/character':character,
      '/aion2/item':item,
      '/aion2/daevanion':board
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
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,errors};
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
  assert.match(await plain(page,'.ae-menu-card[data-view="macro"] .ae-menu-status'),/6 skills in Macro 1/);
  await page.click('.ae-menu-card[data-view="macro"]');
  await page.waitForFunction(()=>document.body.dataset.aeView==='macro'&&document.documentElement.dataset.aetheriumReady==='true');
  assert.match(page.url(),/\/ascent\/macro\/\?class=cleric&role=healer&level=45$/,'The card opens its own page and keeps the level');
  assert.equal(await page.locator('.ae-macro-entry').count(),6,'All six Cleric macro skills usable at 45');
  assert.equal(await page.locator('.ae-macro-delay').count(),5,'A delay between each pair, like the game');
  await context.close();
});

await check('macro reads like the game: listed order, delay between, locked skills added later',async()=>{
  const {page,context}=await open(ascent('class=gladiator&role=dps&level=5','macro'));
  assert.deepEqual(await page.$$eval('.ae-macro-entry .ae-macro-skill',items=>items.map(el=>el.textContent)),['Overhead Slam','Rending Blow']);
  assert.match(await plain(page,'.ae-macro-delay'),/Delay\s*10\s*ms/);
  assert.deepEqual(await page.$$eval('#aeMacroLater li',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim())),['Ruinous Blow (keep Prepare for Battle up) Lv 14','Rage Burst Lv 32']);
  assert.match(await plain(page,'.ae-macro-howto'),/runs its skills in the listed order/);
  assert.doesNotMatch(await page.textContent('.ae-gw-body'),/Check in game/);
  await context.close();
});

await check('pending role is honest and offers the main role',async()=>{
  const {page,context}=await open(ascent('class=gladiator&role=tank&level=20'));
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
    const outbound=await page.$$eval('a[href]',links=>links.map(a=>a.href).filter(href=>!href.startsWith(location.origin)));
    assert.deepEqual(outbound,[],`${query}: links that leave the site`);
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
  assert.deepEqual(await page.$$eval('#aeMasterySpend [data-mastery]',items=>items.map(el=>[el.dataset.mastery,el.querySelector('.ae-itile-badge').textContent])),[['Keen Strike','3→8'],['Rending Blow','3→8'],['Overhead Slam','2→8']]);
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

await check('Skill Bar: the game grid, Keen Strike fixed on left click, key skills on 1 to 4',async()=>{
  const {page,context,errors}=await open(ascent('class=gladiator&role=dps&level=23','skill-bar'));
  assert.equal(await page.locator('.ae-bar-row[data-bar-row]').count(),4,'Bars 3, 2, 1 and 0, like the game');
  assert.deepEqual(await page.$$eval('.ae-bar-row[data-bar-row]',rows=>rows.map(row=>row.dataset.barRow)),['3','2','1','0'],'Bar 0 at the bottom');
  assert.equal(await page.locator('.ae-bar-row[data-bar-row="0"] .ae-bar-cell').count(),12,'Keys 1 to 8, Q, E, left and right click');
  const main=await page.$$eval('[data-bar-row="0"] [data-bar-skill]',cells=>Object.fromEntries(cells.map(el=>[el.dataset.barKey.split(':')[1],[el.dataset.barSkill,el.dataset.barRole]])));
  assert.deepEqual(main.LMB,['Keen Strike','fixed'],'Left click is Keen Strike and fixed');
  assert.deepEqual([main['1'],main['2'],main['3']],[['Rending Blow','key'],['Overhead Slam','key'],['Ruinous Blow','key']]);
  assert.deepEqual([main.Q,main.E],[['Defiance','manual'],['Rush Strike','manual']],'Skills fired by hand on Q and E');
  assert.deepEqual(['5','6','7','8'].map(key=>main[key]?.[0]),['Lunge Stance',"Zikel's Blessing",'Rage Burst','Focused Block']);
  assert.equal(await page.locator('[data-bar-key="0:6"] .ae-lock').count(),1,"Zikel's Blessing slot locked until Lv 27");
  assert.equal(await page.locator('[data-bar-key="0:LMB"] .ae-bar-pin').count(),1);
  assert.match(await page.getAttribute('[data-bar-key="0:1"] img','src'),/ICON_GL_SKILL_001\.png$/,'Rending Blow game icon');
  assert.match(await plain(page,'.ae-guide'),/Left click always fires Keen Strike/);
  assert.match(await page.getAttribute('[data-bar-key="0:LMB"]','class'),/ae-guide-target/);
  await page.click('[data-bar-key="0:2"]');
  assert.match(await plain(page,'#aeInfoTitle'),/Overhead Slam/,'Tap a slot for the skill card');
  await page.keyboard.press('Escape');
  await page.click('[data-bar-key="0:5"]');
  assert.match(await plain(page,'#aeInfo'),/Lunge Stance.*Stigma · slot 1/);
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
  await page.waitForFunction(()=>/You can take the next/.test(document.querySelector('#aeRouteSummary').textContent));
  assert.match(await plain(page,'#aeRouteSummary'),/You can take the next 8 nodes now \(10 of your 10 points\)\. Step 9 needs 3 more points\./);
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
  assert.deepEqual(steps,['Spend points on the Nezekan Daevanion board','Enchant 7 worn items above +0','Level Overhead Slam (now Lv 2)']);
  assert.deepEqual(await page.$$eval('.ae-quest',items=>items.map(el=>el.dataset.questView)),['daevanion','gear','mastery'],'Each next move opens the screen that shows it');
  assert.match(await page.getAttribute('.ae-quest[data-quest-view="gear"]','href'),/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=/);
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/Nezekan: 0 \/ 88 nodes/);
  assert.match(page.url(),/serverId=1308&characterId=.*&role=dps$/);
  assert.match(page.url(),/[?&]region=eu&/,'The address carries the region');
  for(const href of await page.$$eval('.ae-ascent-nav a, .ae-menu-card, .ae-quest',nodes=>nodes.map(n=>n.getAttribute('href')).filter(h=>h&&/serverId=/.test(h)))) assert.match(href,/[?&]region=eu(&|$)/,`Link keeps the region: ${href}`);
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
  assert.match(await plain(page,'.ae-guide'),/step 1 of 5.*Slot 1: equip Lunge Stance\./);
  assert.equal(await page.getAttribute('[data-stigma="0"]','class').then(c=>c.includes('ae-guide-target')),true,'Slot 1 lit up');
  await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide'),/step 2 of 5.*Slot 2: equip Zikel's Blessing\./);
  assert.equal(await page.locator('.ae-guide-target').count(),1);
  assert.match(await page.getAttribute('[data-stigma="1"]','class'),/ae-guide-target/);
  assert.match(await page.getAttribute('[data-stigma="1"] img','src'),/ICON_GL_SKILL_040\.png$/,"Zikel's Blessing shows its game icon");
  await page.click('[data-stigma="1"]');
  assert.match(await plain(page,'#aeInfo'),/Zikel's Blessing.*Stigma · slot 2.*Slot open\. Equip it\./);
  await page.keyboard.press('Escape');
  await page.click('[data-guide="next"]');
  assert.match(await plain(page,'.ae-guide'),/At Lv 32 slot 3 opens\. Put Rage Burst in it\./);
  await page.click('[data-guide="back"]');
  assert.match(await plain(page,'.ae-guide'),/step 2 of 5/);
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
  assert.match(await plain(mac.page,'#aeMacroBind'),/Side mouse button.*Hold it in fights\. Let go and the macro stops\./);
  assert.equal(await mac.page.locator('#aeMacroPresets .ae-preset-row li').count(),3);
  assert.match(await plain(mac.page,'#aeMacroPresets'),/Each of your 3 skill presets keeps its own macro/);
  for(let i=0;i<8&&!/Now give the macro a key/.test(await plain(mac.page,'.ae-guide'));i++)await mac.page.click('[data-guide="next"]');
  assert.match(await plain(mac.page,'.ae-guide'),/Now give the macro a key: Settings, Key Settings, General, Gameplay, Macro\./);
  assert.match(await mac.page.getAttribute('#aeMacroBind','class'),/ae-guide-target/);
  await mac.context.close();
});

await check('every screen opens with a guide and no errors',async()=>{
  for(const screen of SCREENS){
    const {page,context,errors}=await open(ascent(ref,screen),{live:true});
    await page.waitForSelector('.ae-guide:not([hidden])');
    assert.match(await plain(page,'.ae-guide-count'),/^Guide · step 1 of \d+$/,`${screen} guide`);
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

await check('Show me opens the board the move names: Vaizel open and unspent, Nezekan finished (Elyos ids)',async()=>{
  const {page,context,errors}=await open(ascent(vaizelRef),{live:true});
  const first=await boardQuest(page);
  assert.equal(first.title,'Spend points on the Vaizel Daevanion board','The move names the board with nothing spent on it');
  assert.equal(first.view,'daevanion');
  assert.equal(first.board,'13','The move carries the character\'s own board id');
  assert.match(first.href,/^\/hub\/aetherium\/ascent\/daevanion\/\?serverId=1313&characterId=[^&]+&region=eu&class=gladiator&role=dps&board=13$/,'Show me carries the board');
  const titles=await page.$$eval('.ae-quest-text strong',items=>items.map(el=>el.textContent));
  const boardMoves=titles.filter(title=>/Daevanion board/.test(title));
  assert.ok(!boardMoves.some(title=>/Nezekan|Zikel/.test(title)),`A board with nodes taken is never a move: ${boardMoves}`);
  assert.equal(boardMoves.length,1,'One Daevanion move');
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\//),page.click('.ae-quest[data-quest-view="daevanion"]')]);
  await page.waitForSelector('.ae-board-grid');
  assert.equal(await page.getAttribute('[data-board-tab="13"]','aria-selected'),'true','Show me opened Vaizel, not Nezekan');
  assert.equal(await page.getAttribute('[data-board-tab="11"]','aria-selected'),'false');
  assert.equal(new URL(page.url()).searchParams.get('board'),'13');
  assert.match(await plain(page,'#aeRouteSummary'),/Enter the points you have/,'Vaizel has a route to take');
  assert.doesNotMatch(await plain(page,'.ae-route'),/Every key skill node and corner on this board is taken/);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('Show me opens the board the move names for an Asmodian Daeva (Vaizel is board 33)',async()=>{
  const {page,context,errors}=await open(ascent(asmoVaizelRef),{live:true});
  assert.equal(await page.getAttribute('body','data-faction'),'asmodian');
  const first=await boardQuest(page);
  assert.equal(first.title,'Spend points on the Vaizel Daevanion board');
  assert.equal(first.board,'33','The Asmodian id, matched by name');
  assert.match(first.href,/&region=as&class=gladiator&role=dps&board=33$/);
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\//),page.click('.ae-quest[data-quest-view="daevanion"]')]);
  await page.waitForSelector('.ae-board-grid');
  assert.deepEqual(await page.$$eval('[data-board-tab]',tabs=>tabs.map(tab=>[Number(tab.dataset.boardTab),tab.getAttribute('aria-selected')])),[[31,'false'],[32,'false'],[33,'true']],'Vaizel (33) is open on the screen');
  assert.equal(new URL(page.url()).searchParams.get('board'),'33');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('no Daevanion move when every open board has nodes taken: the Nezekan menu card still shows the board',async()=>{
  const {page,context}=await open(ascent(spentRef),{live:true});
  assert.equal(await page.locator('.ae-quest[data-quest-view="daevanion"]').count(),0,'A finished or started board is never a move');
  assert.ok(await page.locator('.ae-quest').count()>0,'Other moves still come');
  assert.match(await plain(page,'.ae-menu-card[data-view="daevanion"] .ae-menu-status'),/Nezekan: 88 \/ 88 nodes/);
  await context.close();
});

await check('step bar on the Ascent Plan: step 3 current, 1 and 2 ticked with a Daeva; by hand steps 2 and 3 wait for a Daeva',async()=>{
  const live=await open(ascent(ref),{live:true});
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
  assert.match(await plain(menu.page,'#aeNext'),/Spend points on the Nezekan Daevanion board.*Next: Show me move 1/);
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
  assert.match(await plain(page,'.ae-guide-count'),/^Guide · step 1 of 1$/);
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

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_ASCENT=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_ASCENT=PASS');
