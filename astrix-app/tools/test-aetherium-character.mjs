#!/usr/bin/env node
// The Aetherium character pages (brief design/aetherium-character-pages, 8 Oct 2026): the character menu and its
// three game-style pages, on a local static server with the Worker mocked (never NCSOFT, never the real Worker):
//   - menu: header kept, three cards in the Ascent Plan menu style, each linking to its page with the Daeva;
//   - Gear page: gear and stats left, pet, wings and title right, columns level; item cards still open;
//   - Skills page: Mastery and Stigma tabs (?tab=stigma), 5-wide grids with levels, locked icons with a padlock,
//     hover card, click selects into the left panel;
//   - Daevanion page: a tab per board (?board=), open and locked boards, Node and Board Effect panels with totals
//     checked against a fixture with taken nodes (two MP +50 nodes give MP +100), one call per board;
//   - first paint reads only /aion2/character, no sideways scroll, panels line up (bounding boxes) at 390, 820, 1600 and 1920;
//   - crisp polish (10 Oct 2026): type sizes in rem, 200 percent zoom, the window's hairline, shadow and notch, one selected tab,
//     notched bevelled cards and tiles with the strobe, pills on counts, 1440 width and no empty band, skeleton shapes.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nodeCost} from '../games/aion2/engine/daevanion-planner.mjs';
import {enchantAdvice} from '../games/aion2/engine/ascent-advisor.mjs';
import {deriveRegion} from './fixtures/aion2/derive-region-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
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

const info=await fixture('astrix285-info'),equipment=await fixture('astrix285-equipment'),board11=await fixture('astrix285-daevanion-11'),itemDetail=await fixture('astrix285-item-mainhand');
// The fixture is Miguel's own character. The mock Worker serves it under a test name: the gamer tag is never page data.
const TEST_NAME='TESTDAEVA';
info.profile.characterName=TEST_NAME;
const GAMER_TAG=['ASTRIX','285'].join('');
const ART_HOST='https://assets.playnccdn.com/';
const NPC_ART={records:[{id:'intro-art',host:ART_HOST,keyArt:{pending:true,reason:'test'},npc:{url:`${ART_HOST}test/intro/npc.png`,alt:'Guide',shows:'test',foundOn:'test',capturedOn:'2026-10-09'},classes:[],provenance:[]}]};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};

// An Asmodian Daeva in Asia (derived from the Europe capture: see ENDPOINTS-regions.md). The official data spells
// the race "Asmodians" and numbers the boards 31, 32, 33, 34, 36, not 11 to 16.
const ASMO=deriveRegion('as',{race:'asmodian'});
const ASMO_REF={serverId:String(ASMO.serverId),characterId:ASMO.characterId};

// A Lv 23 Gladiator with a few Daevanion nodes taken (server 1311), so there is something to add up.
const RICH={serverId:'1311',characterId:'cmljaGRhZXZh='};
const richInfo=structuredClone(info);
Object.assign(richInfo.profile,{characterName:'RICHDAEVA',characterId:RICH.characterId,characterLevel:23,serverId:1311,serverName:'Kaisinel'});
// Real base stats for the rich Daeva (made-up test values, never shown as a real character): non-zero values show as they are.
richInfo.stat.statList.filter(row=>['STR','DEX','INT','CON','AGI','WIS'].includes(row.type)).forEach((row,index)=>{row.value=[41,0,12,37,25,18][index];});
const takenBoard=structuredClone(board11);
const nodesNamed=(list,name,count)=>list.nodeList.filter(node=>node.name===name&&node.open===0).sort((a,b)=>a.nodeId-b.nodeId).slice(0,count);
const TAKEN=[
  ...nodesNamed(takenBoard,'Max MP',2),                       // MP +50 twice
  ...nodesNamed(takenBoard,'Max HP',1),                       // HP +100
  ...nodesNamed(takenBoard,'Attack',3),                       // Attack Bonus +3 three times
  ...nodesNamed(takenBoard,'Combat Speed',2),                 // the two Combat Speed corners, +1.5% each
  ...nodesNamed(takenBoard,'Skill Level Up - Rending Blow',1),
  ...nodesNamed(takenBoard,'Skill Level Up - Blood Absorption',2)
];
for(const node of TAKEN)node.open=1;
assert.equal(TAKEN.length,11,'The fixture takes 11 nodes');
richInfo.daevanion.boardList.forEach(entry=>{
  if(entry.id===11)Object.assign(entry,{open:1,openNodeCount:TAKEN.length});
  if(entry.id===12)Object.assign(entry,{open:1,openNodeCount:0});
});
const richEquipment=structuredClone(equipment);
let stigmaIndex=0;
for(const skill of richEquipment.skill.skillList){
  if(skill.category==='Dp'){
    // Three stigmas learned (two worn), the rest still locked.
    skill.acquired=stigmaIndex<3?1:0;skill.skillLevel=stigmaIndex<3?1:0;skill.equip=stigmaIndex<2?1:0;stigmaIndex++;
  } else if(skill.needLevel<=23){
    skill.acquired=1;skill.skillLevel=skill.name==='Rending Blow'?9:3;
  }
}
const learnedExpected=richEquipment.skill.skillList.filter(skill=>skill.category!=='Dp'&&skill.acquired===1).length;
const otherBoard=id=>{const copy=structuredClone(board11);copy.nodeList.forEach(node=>{node.boardId=id;node.open=0;});return copy;};

// The same Daeva wearing accessories (server 1312). The site lists those slots only when worn, as raw codes and in its
// own order (EARRING2 before EARRING1): the Gear page must show plain names in game order. Two of them are past +0.
const ACC={serverId:'1312',characterId:'YWNjZGFldmE='};
// A Lv 45 Daeva in Unique, Epic and Rare gear (captured 11 Oct 2026, renamed: no gamer tag, id or portrait).
const LV45={serverId:'1308',characterId:'bHY0NXRlc3RkYWV2YQ=='};
// The same Daeva with its amulet at the +10 cap (a Full marker) and the bracelet's item detail failing (no item level).
const FULL45={serverId:'1308',characterId:'ZnVsbGRhZXZhNDU='};
// The 12 Oct 2026 capture (lv45-character.json: renamed TESTDAEVA, legion TESTLEGION), the whole /aion2/character body.
const char45=await fixture('lv45-character');
const NEW45={serverId:'1308',characterId:char45.info.profile.characterId};
const lv45Info=await fixture('lv45-info'),lv45Equipment=await fixture('lv45-equipment'),lv45Items=await fixture('lv45-items');
const full45Equipment=structuredClone(lv45Equipment),full45Items=structuredClone(lv45Items);
full45Equipment.equipment.equipmentList.find(item=>item.slotPos===22).enchantLevel=10;
Object.assign(full45Items['22'],{enchantLevel:10,levelValue:10});
delete full45Items['15'];
const grades=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/grades.json'),'utf8'));
const progression=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/progression.json'),'utf8'));
/** The grade rule's advice for a worn item as the equipment list sends it (no item detail read yet). */
const adviceFor=(item,level)=>enchantAdvice({empty:false,slot:item.slotPosName,slotPos:item.slotPos,name:item.name,grade:item.grade,enchant:item.enchantLevel,maxEnchant:{pending:true,reason:'test'}},{level,grades,progression});
const accInfo=structuredClone(richInfo);
Object.assign(accInfo.profile,{characterName:'ACCDAEVA',characterId:ACC.characterId,serverId:1312,serverName:'Kaisinel'});
const accEquipment=structuredClone(richEquipment);
for(const [slotPos,slotPosName,name,enchantLevel] of [[12,'EARRING2','Second Earring',0],[11,'EARRING1','First Earring',3],[13,'RING1','First Ring',0],[15,'BRACELET1','First Bracelet',2]]){
  accEquipment.equipment.equipmentList.push({...accEquipment.equipment.equipmentList[0],id:999000000+slotPos,name,slotPos,slotPosName,enchantLevel});
}

// Screenshots (AE_SHOTS) show stand-in art in game colours: this machine cannot reach the NCSOFT CDN.
const hue=text=>[...text].reduce((total,char)=>(total*31+char.charCodeAt(0))%360,7);
function standIn(url){
  const name=url.split('/').pop();
  const node={legend:'#3f8fe0',rare:'#2e9a62',unique:'#e2742b',common:'#4a5470'}[/board_icon_(legend|rare|unique|common)/.exec(name)?.[1]];
  const body=node
    ? `<rect x="10" y="10" width="80" height="80" rx="18" fill="${node}" stroke="${name.includes('_open')?'#f4d27c':'#0b1222'}" stroke-width="${name.includes('_open')?8:4}"/>`
    : name.startsWith('board_icon_start')
      ? '<rect x="14" y="14" width="72" height="72" rx="16" fill="#2a3a5c" stroke="#e2b54f" stroke-width="6"/><path d="M50 24l14 26-14 26-14-26z" fill="#e2b54f"/>'
      : `<rect width="100" height="100" fill="hsl(${hue(name)},45%,32%)"/><circle cx="50" cy="50" r="26" fill="hsl(${hue(name)},60%,58%)"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`);
}
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const statRecords=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/stats.json'),'utf8')).records.filter(record=>record.kind==='main'||record.kind==='deity');
const MAIN_IDS=['might','dexterity','intelligence','constitution','precision','willpower'];
const STAT_IDS=['might','dexterity','precision','willpower','intelligence','constitution','justice','freedom','illusion','life','time','destruction','death','wisdom','destiny','space'];
const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{if(process.env.AE_ONLY&&!name.includes(process.env.AE_ONLY))return;try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=true,down=false,viewport={width:1600,height:1000},art=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  const urls=[];
  const state={down,inflight:0,maxInflight:0};
  // Every URL the page asks for, so a check can see which hosts were asked (stat icons: our sprite only, never NCSOFT).
  const requested=[];
  context.on('request',request=>requested.push(request.url()));
  if(art)await context.route(/\/astrix-app\/games\/aion2\/data\/intro-art\.json/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(art)}));
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    const body=await response.text();
    // The committed config points at the real Worker; every test swaps it for the mock (live) or null (not connected).
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    await route.fulfill({response,body:swapped});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(`${url.pathname}${url.searchParams.get('boardId')?`#${url.searchParams.get('boardId')}`:''}`);
    urls.push(url);
    if(state.down)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
    const rich=url.searchParams.get('serverId')==='1311';
    const acc=url.searchParams.get('serverId')===ACC.serverId;
    const asmo=url.searchParams.get('serverId')===ASMO_REF.serverId;
    const lv45=url.searchParams.get('characterId')===LV45.characterId;
    const full45=url.searchParams.get('characterId')===FULL45.characterId;
    // Item details are held 150ms so the test can see how many run at once.
    if(url.pathname==='/aion2/item'&&(lv45||full45)){
      state.inflight++;state.maxInflight=Math.max(state.maxInflight,state.inflight);
      await new Promise(done=>setTimeout(done,150));
      state.inflight--;
      const detail=(full45?full45Items:lv45Items)[url.searchParams.get('slotPos')];
      if(!detail)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...detail,meta:{...meta,region:url.searchParams.get('region')}})});
    }
    let body;
    if(url.pathname==='/aion2/character'&&url.searchParams.get('characterId')===NEW45.characterId)body={info:char45.info,equipment:char45.equipment};
    else if(lv45&&url.pathname==='/aion2/character')body={info:lv45Info,equipment:lv45Equipment};
    else if(full45&&url.pathname==='/aion2/character')body={info:{...lv45Info,profile:{...lv45Info.profile,characterId:FULL45.characterId}},equipment:full45Equipment};
    else if(url.pathname==='/aion2/character')body=asmo?{info:ASMO.info,equipment:ASMO.equipment}:acc?{info:accInfo,equipment:accEquipment}:rich?{info:richInfo,equipment:richEquipment}:{info,equipment};
    else if(url.pathname==='/aion2/item')body=itemDetail;
    else if(url.pathname==='/aion2/daevanion'){
      const id=Number(url.searchParams.get('boardId'));
      if(asmo){
        if(id===31)body=ASMO.daevanion;
        else return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
      }
      else if(id===11)body=rich?takenBoard:board11;
      else if(id===12)body=otherBoard(12);   // open, nothing taken yet
      else if(id===14)body=otherBoard(14);   // not open, yet the site sends its grid: drawn greyed
      else return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})}); // not open, no grid
    }
    if(!body)return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta:{...meta,region:url.searchParams.get('region')}})});
  });
  await context.route(/playnccdn\.com/,route=>process.env.AE_SHOTS?route.fulfill({status:200,contentType:'image/svg+xml',body:standIn(route.request().url())}):route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run. Registered last, so it wins over the CDN stub above.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,urls,errors,state,requested};
}
// Everything a visitor can read on the page: the text, the title and description, and every visible attribute.
const visibleText=page=>page.evaluate(()=>[document.body.innerText,document.title,document.querySelector('meta[name=description]')?.content,
  ...[...document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')].map(n=>[n.placeholder,n.getAttribute('aria-label'),n.title,n.getAttribute('alt')].join(' '))].join('\n'));
/** No gamer tag, no example Daeva, none of the fixture character's own title, stats or portrait anywhere a visitor can see. */
async function assertNoGamerTag(page,label){
  const text=await visibleText(page);
  assert.doesNotMatch(text,new RegExp(GAMER_TAG,'i'),`${label}: the gamer tag shows`);
  assert.doesNotMatch(text,/Example data|example Daeva/i,`${label}: an example Daeva is mentioned`);
  assert.doesNotMatch(text,/Draped in Sky|6,532/,`${label}: the fixture character's title or stats show`);
  for(const src of await page.$$eval('main img',images=>images.map(img=>img.getAttribute('src'))))assert.doesNotMatch(src??'',/profileimg\.plaync\.com/,`${label}: a portrait shows (${src})`);
}
const refQuery=(who=RICH,extra={})=>`?${new URLSearchParams({serverId:who.serverId,characterId:who.characterId,...extra})}`;
const BASIC={serverId:'1308',characterId:info.profile.characterId};
// The visible words of an element, a space between blocks (textContent would run them together).
const plain=(page,selector)=>page.$eval(selector,el=>{const texts=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode())texts.push(node.nodeValue);return texts.join(' ').replace(/\s+/g,' ').trim();});
const boxOf=(page,selector)=>page.$eval(selector,el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
const overflowOf=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,`${message} (${a} vs ${b})`);
const shot=async(page,name,width)=>{if(process.env.AE_SHOTS&&(width===390||width===1600))await page.screenshot({path:resolve(process.env.AE_SHOTS,`${name}-${width}.png`),fullPage:true});};

/* ---------- Character menu ---------- */

// Titles card (12 Oct 2026): the menu holds four cards (Gear, Skills, Daevanion, Titles); these checks expected three.
await check('menu: header kept, four cards in the Ascent Plan style, each linking to its page with the Daeva',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/${refQuery()}`);
  assert.deepEqual(calls.filter(call=>call!=='/aion2/character'),[],'First paint: only /aion2/character');
  const header=await plain(page,'#aeHeader');
  assert.match(header,/RICHDAEVA/);assert.doesNotMatch(header,new RegExp(GAMER_TAG,'i'));assert.match(header,/Draped in Sky/);assert.match(header,/Gladiator Lv 23/);assert.match(header,/Elyos/);assert.match(header,/Kaisinel/);assert.match(header,/Europe/);
  assert.match(header,/Combat power 6,532/);assert.match(header,/Item level/);
  assert.equal(await page.getAttribute('#aeHeader a.btn','href'),'/hub/aetherium/','Back to Daeva Card');
  // was ['gear','skills','daevanion'] and ['Gear','Skills','Daevanion']
  assert.deepEqual(await page.$$eval('#aeCards .ae-menu-card',cards=>cards.map(card=>card.dataset.view)),['gear','skills','daevanion','titles']);
  assert.deepEqual(await page.$$eval('#aeCards .ae-menu-name',items=>items.map(el=>el.textContent)),['Gear','Skills','Daevanion','Titles']);
  const lines=await page.$$eval('#aeCards .ae-menu-status',items=>items.map(el=>el.textContent.trim()));
  assert.match(lines[0],/^\d+ of \d+ worn$/);
  assert.equal(lines[1],`${learnedExpected} skills · 3 of 13 stigmas`);
  assert.equal(lines[2],`Nezekan: ${TAKEN.length} / 88 nodes`);
  assert.equal(lines[3],'0 of 3 effects set','Titles: the category effects set, never the overall total');
  assert.match(await plain(page,'[data-view="skills"] .ae-menu-blurb'),/^Mastery and Stigma$/);
  assert.equal(await page.locator('#aeCards .ae-menu-badge').count(),4,'A count badge on each card'); // was 3
  const hrefs=await page.$$eval('#aeCards .ae-menu-card',cards=>cards.map(card=>card.getAttribute('href')));
  const ref=`serverId=1311&characterId=${encodeURIComponent(RICH.characterId)}&region=eu`;
  assert.equal(hrefs[0],`/hub/aetherium/gear/equipment/?${ref}`);
  assert.equal(hrefs[1],`/hub/aetherium/skills/?${ref}&class=gladiator`);
  assert.equal(hrefs[2],`/hub/aetherium/daevanion/?${ref}&class=gladiator&board=11`,'The Daevanion card opens the first open board');
  assert.equal(hrefs[3],`/hub/aetherium/gear/titles/?${ref}`);
  assert.equal(await page.locator('[aria-current="page"]').first().textContent(),'Gear Ledger');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('menu: a Daeva with no board open names the first board and its level',async()=>{
  // The basic fixture Daeva (Lv 12) has Nezekan open with 0 of 88 nodes.
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery(BASIC)}`);
  assert.equal(await plain(page,'[data-view="daevanion"] .ae-menu-status'),'Nezekan: 0 / 88 nodes');
  assert.match(await page.getAttribute('[data-view="gear"]','href'),/^\/hub\/aetherium\/gear\/equipment\/\?serverId=1308&characterId=/,'The links carry the Daeva');
  await context.close();
});

await check('menu with no Daeva: Find your Daeva first, a link to the search, the guide art after the words, no cards, no Worker call',async()=>{
  for(const live of [true,false]){
    const {page,context,calls,errors}=await open('/hub/aetherium/gear/',{live,art:NPC_ART});
    assert.deepEqual(calls,[],`live=${live}: no Worker call`);
    assert.equal(await plain(page,'#aeFindFirstTitle'),'Find your Daeva first');
    assert.match(await plain(page,'#aeFindFirst'),/Type your in-game character name on the Daeva Card/);
    assert.equal(await page.getAttribute('#aeFindFirst a.btn','href'),'/hub/aetherium/#aeSearch');
    assert.equal(await page.locator('#aeCards .ae-menu-card').count(),0,'No cards without a Daeva');
    assert.equal(await page.isHidden('#aeSource'),true);
    assert.equal(await page.isHidden('#aeNotice'),true,'Nothing went wrong: no notice');
    await page.waitForSelector('#aeFindFirst.has-art');
    assert.equal(await page.getAttribute('#aeFindFirstArt img','src'),`${ART_HOST}test/intro/npc.png`,'The NPC guide from the art data');
    assert.equal(await page.getAttribute('#aeFindFirstArt img','alt'),'Guide');
    assert.equal(await page.getAttribute('#aeFindFirstArt img','referrerpolicy'),'no-referrer');
    await assertNoGamerTag(page,`menu no Daeva live=${live}`);
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

await check('menu: same look as the Ascent Plan menu cards',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`);
  const ascent=await open(`/hub/aetherium/ascent/${refQuery(RICH,{class:'gladiator'})}`);
  await ascent.page.waitForSelector('.ae-menu-card');
  const look=(p,selector)=>p.$eval(selector,el=>{const c=getComputedStyle(el),a=getComputedStyle(el.querySelector('.ae-menu-art')),n=getComputedStyle(el.querySelector('.ae-menu-name')),s=getComputedStyle(el.querySelector('.ae-menu-status'));
    return {background:c.backgroundImage,border:c.borderTopColor,clip:c.clipPath,artRadius:a.borderRadius,nameFont:n.fontFamily,nameWeight:n.fontWeight,statusColor:s.color};});
  assert.deepEqual(await look(page,'#aeCards .ae-menu-card'),await look(ascent.page,'.ae-menu .ae-menu-card'));
  await ascent.context.close();
  await context.close();
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000],[1920,1080]]){
  // Titles card (12 Oct 2026): was three equal cards on one row at every width. Now four equal cards on one row at 820 and
  // up, and at 390 a clean two by two wrap (two rows of two equal cards).
  await check(`menu at ${width}: no sideways scroll, four equal cards${width<640?' in two rows of two':' on one row'}`,async()=>{
    const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`,{viewport:{width,height}});
    assert.ok(await overflowOf(page)<=0,'scrolls sideways');
    const cards=await page.$$eval('#aeCards .ae-menu-card',items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};}));
    assert.equal(cards.length,4);
    assert.ok(cards.every(card=>Math.abs(card.width-cards[0].width)<1&&Math.abs(card.height-cards[0].height)<1),'cards share a width and a height');
    const rows=width<640?[[cards[0],cards[1]],[cards[2],cards[3]]]:[cards];
    for(const line of rows){
      assert.ok(line.every(card=>Math.abs(card.top-line[0].top)<1),'cards in a row share a top');
      for(let n=1;n<line.length;n++)assert.ok(line[n-1].right<=line[n].left+0.5,'cards do not overlap');
    }
    if(rows.length>1)assert.ok(rows[1][0].top>=rows[0][0].top+rows[0][0].height-0.5,'the second row sits under the first');
    const head=await boxOf(page,'#aeHeader'),nav=await boxOf(page,'#aeCards');
    near(nav.left,head.left,1,'cards start where the header starts');near(nav.right,head.right,1,'cards end where the header ends');
    await shot(page,'menu',width);
    await context.close();
  });
}

/* ---------- Gear page ---------- */

await check('Gear page: real base stats show as they are, a 0 among them included',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(RICH)}`);
  assert.equal(await page.locator('#aeStats .ae-stat').count(),6,'Six primary stats');
  assert.deepEqual(await page.$$eval('#aeStats .ae-stat dd',items=>items.map(el=>el.textContent)),['41','0','12','37','25','18']);
  assert.equal(await page.isVisible('#aeStatsNone'),false,'No honest line when the site shows real values');
  await context.close();
});

await check('Gear page: worn gear, stats, pet, wings and title; item cards still open',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`);
  // Gear grid (11 Oct 2026): was deepEqual(calls,['/aion2/character']). Item details now follow first paint in the background.
  assert.equal(calls[0],'/aion2/character','First paint: the character call first');
  assert.deepEqual(calls.filter(call=>call!=='/aion2/item'),['/aion2/character'],'First paint: no other call but item details');
  assert.equal(await page.textContent('#aeScreenTitle'),'Gear');
  assert.equal(await page.locator('#aeGear [data-slot]').count(),8);
  assert.match(await page.textContent('#aeGearCount'),/8 of 8 worn/);
  // Walkthrough fix (11 Oct 2026) said all-zero stats meant the site was not showing them, so the page hid the row.
  // Stats explained (feature/aetherium-stats-explained, 11 Oct 2026) changed that: a low Daeva really has 0 points (the live
  // data sends null effect lines for them), so the 16 tiles show with a near-zero note that says where points come from.
  assert.equal(await page.locator('#aeStats .ae-stat').count(),6,'Six main stats, 0 shown as 0');
  assert.equal(await page.locator('#aeDeity .ae-stat').count(),10,'Ten deity stats');
  assert.equal(await page.isVisible('#aeStatsLow'),true,'The near-zero note says where points come from');
  assert.equal(await page.isVisible('#aeStatsNone'),false,'The site does send the stats');
  assert.match(await plain(page,'#aeCombatNote'),/Accuracy and other combat stats are not in the public character data\. Check them on your in-game character screen\./);
  assert.match(await plain(page,'#aeExtras'),/Pet.*Wings.*Title.*Draped in Sky/);
  assert.equal(await page.locator('#aeStigmas, #aeBoards').count(),0,'Stigmas and boards live on their own pages');
  assert.equal(await page.locator('[aria-current="page"]').first().textContent(),'Gear Ledger');
  assert.equal(await page.getAttribute('.ae-gw-back','href'),`/hub/aetherium/gear/${refQuery(BASIC,{region:'eu'})}`,'Back to the menu keeps the Daeva');
  await page.click('[data-slot="0"]');
  await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-item-enchant'));
  assert.equal(await page.textContent('#aeInfoTitle'),'Twilight Greatsword');
  assert.deepEqual(errors,[]);
  await context.close();
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000],[1920,1080]]){
  await check(`Gear page at ${width}: no sideways scroll, columns line up and end level`,async()=>{
    const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`,{viewport:{width,height}});
    assert.ok(await overflowOf(page)<=0,'scrolls sideways');
    const [left,right]=await page.$$eval('.ae-gear-page>.ae-col',cols=>cols.map(col=>{const r=col.getBoundingClientRect();const last=col.lastElementChild.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,lastBottom:last.bottom};}));
    if(width>=1100){
      near(left.top,right.top,1,'columns start together');
      near(left.bottom,right.bottom,1,'columns end together');
      near(left.lastBottom,right.lastBottom,1,'the last panel in each column ends level');
      assert.ok(left.right<=right.left,'columns side by side');
      const panels=await page.$$eval('.ae-gear-page .ae-panel',items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};}));
      near(panels[0].left,panels[1].left,1,'gear and stats panels share an edge');near(panels[0].right,panels[1].right,1,'gear and stats panels share an edge');
    } else assert.ok(right.top>=left.bottom-1,'columns stack on narrow screens');
    await shot(page,'gear',width);
    await context.close();
  });
}

/* ---------- Skills page ---------- */

const tileRows=async(page,selector)=>page.$$eval(selector,items=>{const tops=items.map(el=>Math.round(el.getBoundingClientRect().top));return {first:tops.slice(0,5),sixth:tops[5]??null,count:items.length};});

await check('Skills page: Mastery by default, centred tabs, 5-wide grids with levels, locked icons with a padlock',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`);
  assert.deepEqual(calls,['/aion2/character'],'First paint: only /aion2/character');
  assert.equal(await page.textContent('#aeScreenTitle'),'Skill');
  assert.deepEqual(await page.$$eval('[role="tab"]',tabs=>tabs.map(tab=>[tab.textContent,tab.getAttribute('aria-selected')])),[['Mastery','true'],['Stigma','false']]);
  const win=await boxOf(page,'.ae-skills-window'),tabs=await boxOf(page,'.ae-gw-tabs');
  near((tabs.left+tabs.right)/2,(win.left+win.right)/2,1.5,'tabs are centred in the window');
  const group=await page.$$eval('.ae-gw-tab',items=>{const first=items[0].getBoundingClientRect(),last=items.at(-1).getBoundingClientRect();return (first.left+last.right)/2;});
  near(group,(win.left+win.right)/2,1.5,'the two tabs sit around the centre line');
  assert.match(await plain(page,'#aeSkillGrid'),/^Active.*Passive/);
  assert.deepEqual(await page.$$eval('#aeSkillGrid .ae-mskills-title',items=>items.map(el=>el.textContent)),['Active','Passive']);
  const active=await tileRows(page,'#aeSkillGrid .ae-sgrid:nth-of-type(1) .ae-mskill');
  assert.equal(active.count,12,'All 12 active skills');
  assert.ok(new Set(active.first).size===1&&active.sixth>active.first[0],'Five icons to a row');
  const passive=await tileRows(page,'#aeSkillGrid .ae-sgrid:nth-of-type(2) .ae-mskill');
  assert.equal(passive.count,10,'All 10 passive skills');
  assert.ok(new Set(passive.first).size===1&&passive.sixth>passive.first[0],'Five icons to a row');
  assert.equal(await plain(page,'[data-skill="Rending Blow"] .ae-mskill-lv'),'Lv. 9','Level in the corner');
  assert.equal(await plain(page,'[data-skill="Murderous Burst"] .ae-lock'),'Lv 25','Not learned: padlock and the level');
  assert.match(await page.$eval('[data-skill="Murderous Burst"] img',el=>getComputedStyle(el).filter),/grayscale/,'Greyed out');
  assert.equal(await page.locator('[data-skill="Rending Blow"] .ae-lock').count(),0);
  assert.equal(await plain(page,'#aeSkillTitle'),'Keen Strike Lv. 3','The build\'s first key skill is shown on load');
  assert.deepEqual(errors,[]);
  await shot(page,'skills-mastery',1600);
  await context.close();
});

await check('Skills page: click selects into the left panel; Specialty slots, perks and cooldown from the data',async()=>{
  const {page,context}=await open(`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`);
  await page.click('[data-skill="Overhead Slam"]');
  assert.equal(await plain(page,'#aeSkillTitle'),'Overhead Slam Lv. 3');
  assert.equal(await page.getAttribute('[data-skill="Overhead Slam"]','aria-pressed'),'true');
  assert.equal(await page.getAttribute('[data-skill="Keen Strike"]','aria-pressed'),'false');
  assert.deepEqual(await page.$$eval('#aeSkillDetail .ae-card-chips li',items=>items.map(el=>el.textContent)),['Active','Key skill 3']);
  assert.equal(await page.locator('#aeSkillDetail .ae-card-slot').count(),3,'Three Specialty slots');
  assert.deepEqual(await page.$$eval('#aeSkillDetail .ae-card-slot em',items=>items.map(el=>el.textContent)),['Upward Strike chain','Always lands as a critical hit','Remove cooldown'],'The picks the build makes for the three slots');
  assert.equal(await page.locator('#aeSkillDetail .ae-card-slot.is-open').count(),0,'Skill Lv 3 opens no slot yet');
  assert.equal(await page.locator('#aeSkillDetail .ae-mperks li').count(),5,'All five Specialty perks');
  assert.equal(await page.locator('#aeSkillDetail .ae-mperks li.is-locked').count(),5,'Every perk is locked at skill Lv 3');
  assert.equal(await page.locator('#aeSkillDetail .ae-mperks li.is-locked .ae-pad').count(),5,'with a padlock on each');
  assert.deepEqual(await page.$$eval('#aeSkillDetail .ae-pick-level',items=>items.map(el=>el.textContent)),['Lv 8','Lv 8','Lv 8','Lv 12','Lv 16'],'The level each perk unlocks at');
  assert.match(await plain(page,'#aeSkillDetail .ae-card-facts'),/Cooldown 5 s/);
  // A skill the build makes no Specialty pick for says Free pick, and one whose cooldown the data does not hold shows no cooldown row, never a guess.
  await page.click('[data-skill="Keen Strike"]');
  assert.equal(await page.locator('#aeSkillDetail .ae-card-facts').count(),0);
  assert.deepEqual(await page.$$eval('#aeSkillDetail .ae-card-slot em',items=>items.map(el=>el.textContent)),['Free pick','Free pick','Free pick']);
  // Rending Blow is Lv 9: its first Specialty slot is open and its Lv 8 perks are unlocked.
  await page.click('[data-skill="Rending Blow"]');
  assert.equal(await page.locator('#aeSkillDetail .ae-card-slot.is-open').count(),1);
  assert.equal(await page.locator('#aeSkillDetail .ae-mperks li.is-locked').count(),2,'Lv 12 and Lv 16 stay locked');
  // A passive has no Specialty block.
  await page.click('[data-skill="Blood Absorption"]');
  assert.equal(await page.locator('#aeSkillDetail .ae-card-slot').count(),0);
  assert.match(await plain(page,'#aeSkillDetail .ae-card-chips'),/Passive/);
  // A locked skill says when it unlocks.
  await page.click('[data-skill="Murderous Burst"]');
  assert.match(await plain(page,'#aeSkillDetail .ae-card-status'),/Unlocks at Lv 25/);
  await context.close();
});

await check('Skills page: hover shows the game-style card; keyboard focus does too; a tap only selects',async()=>{
  const {page,context}=await open(`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`);
  assert.equal(await page.locator('#aeHover:not([hidden])').count(),0);
  await page.hover('[data-skill="Overhead Slam"]');
  await page.waitForSelector('#aeHover:not([hidden])');
  const text=await plain(page,'#aeHover');
  assert.match(text,/Overhead Slam Lv\. 3/);assert.match(text,/Active/);assert.match(text,/Specialty perks/);assert.match(text,/Cooldown 5 s/);
  assert.match(text,/Lv 16.*Remove cooldown|Lv 16/);
  assert.equal(await page.locator('#aeHover [id]').count(),0,'No duplicate ids in the hover card');
  const card=await boxOf(page,'#aeHover');
  assert.ok(card.left>=0&&card.right<=1600&&card.bottom<=1000,'The card stays on screen');
  await page.mouse.move(5,5);
  await page.waitForSelector('#aeHover',{state:'hidden'});
  await page.focus('[data-skill="Keen Strike"]');
  await page.keyboard.press('Tab');
  await page.waitForSelector('#aeHover:not([hidden])');
  assert.match(await plain(page,'#aeHover'),/Rending Blow Lv\. 9/);
  await context.close();
  const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await phone.route(/aetherium-config\.mjs/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = '${WORKER}';`)});});
  await phone.route(`${WORKER}/**`,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({info:richInfo,equipment:richEquipment,meta})}));
  await phone.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await phone.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  const touch=await phone.newPage();
  await touch.goto(`${base}/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`);
  await touch.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await touch.tap('[data-skill="Overhead Slam"]');
  assert.equal(await plain(touch,'#aeSkillTitle'),'Overhead Slam Lv. 3','Tap selects');
  assert.equal(await touch.locator('#aeHover:not([hidden])').count(),0,'No hover card on touch');
  await phone.close();
});

await check('Skills page: ?tab=stigma opens Stigma; tabs keep the address; 13 stigmas, locked ones with a padlock',async()=>{
  const {page,context,errors}=await open(`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator',tab:'stigma'})}`);
  assert.deepEqual(await page.$$eval('[role="tab"]',tabs=>tabs.map(tab=>tab.getAttribute('aria-selected'))),['false','true']);
  assert.deepEqual(await page.$$eval('#aeSkillGrid .ae-mskills-title',items=>items.map(el=>el.textContent)),['Stigma']);
  const rows=await tileRows(page,'#aeSkillGrid .ae-sgrid .ae-mskill');
  assert.equal(rows.count,13,'All 13 stigmas of the class');
  assert.ok(new Set(rows.first).size===1&&rows.sixth>rows.first[0],'Five icons to a row');
  assert.equal(await page.locator('#aeSkillGrid .ae-mskill:not(.is-locked) .ae-mskill-lv').count(),3,'Three learned, each with its level');
  assert.equal(await page.locator('#aeSkillGrid .ae-mskill.is-locked .ae-lock').count(),10);
  assert.equal(await plain(page,'#aeSkillGrid .ae-mskill.is-locked .ae-lock'),'Lv 22','Locked: padlock and the level it unlocks at');
  // Level planner (17 Oct 2026): the plan's first stigma slot is Rage Burst now (it opens Overhead Slam); it was Lunge Stance.
  // This Daeva has not learned it, so the title carries no level.
  assert.equal(await plain(page,'#aeSkillTitle'),'Rage Burst','The build\'s first stigma shows on load');
  await page.click('#aeSkillGrid .ae-mskill.is-locked');
  assert.match(await plain(page,'#aeSkillDetail .ae-card-status'),/Unlocks at Lv 22 with the quest The One Who Hears the Voice/);
  await page.click('[data-tab="mastery"]');
  assert.equal(new URL(page.url()).searchParams.get('tab'),null,'Mastery leaves the address clean');
  assert.equal(new URL(page.url()).searchParams.get('serverId'),'1311','The Daeva stays in the address');
  assert.equal(await page.locator('#aeSkillGrid .ae-mskills-title').count(),2);
  await page.click('[data-tab="stigma"]');
  assert.equal(new URL(page.url()).searchParams.get('tab'),'stigma');
  await page.hover('#aeSkillGrid .ae-mskill:not(.is-locked)');
  await page.waitForSelector('#aeHover:not([hidden])');
  assert.match(await plain(page,'#aeHover'),/Stigma/);
  assert.deepEqual(errors,[]);
  await shot(page,'skills-stigma',1600);
  await context.close();
});

await check('Skills page with no Daeva: Find your Daeva first, no skill window, no Worker call',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/skills/',{live:false});
  assert.deepEqual(calls,[]);
  assert.equal(await plain(page,'#aeFindFirstTitle'),'Find your Daeva first');
  assert.equal(await page.locator('#aeSkillGrid, .ae-gw').count(),0,'No skill window and no example skills');
  await assertNoGamerTag(page,'skills no Daeva');
  await context.close();
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000],[1920,1080]]){
  await check(`Skills page at ${width}: no sideways scroll, grid and detail line up`,async()=>{
    for(const tab of ['mastery','stigma']){
      const {page,context}=await open(`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator',tab})}`,{viewport:{width,height}});
      assert.ok(await overflowOf(page)<=0,`${tab} scrolls sideways`);
      const detail=await boxOf(page,'#aeSkillDetail'),grid=await boxOf(page,'#aeSkillGrid');
      if(width>=900){
        near(detail.top,grid.top,1,`${tab}: columns start together`);near(detail.bottom,grid.bottom,1,`${tab}: columns end together`);
        assert.ok(detail.right<=grid.left,'detail left of the grid');
        near(detail.width,grid.width,1.5,`${tab}: equal columns`);
      } else assert.ok(grid.bottom<=detail.top+1,`${tab}: the grid comes first on narrow screens`);
      const tiles=await page.$$eval('#aeSkillGrid .ae-mskill',items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}));
      for(const tile of tiles)near(tile.width,tile.height,1,'square icons');
      assert.ok(tiles[0].width>=44,`icons are big enough to tap (${tiles[0].width})`);
      for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
        const [a,b]=[tiles[i],tiles[j]];
        assert.ok(a.right<=b.left+0.5||b.right<=a.left+0.5||a.bottom<=b.top+0.5||b.bottom<=a.top+0.5,`${tab}: tiles ${i} and ${j} overlap`);
      }
      const inside=await boxOf(page,'#aeSkillGrid');
      assert.ok(tiles.every(tile=>tile.left>=inside.left-0.5&&tile.right<=inside.right+0.5),'icons stay inside the grid panel');
      if(tab==='mastery')await shot(page,'skills-mastery',width);else await shot(page,'skills-stigma',width);
      await context.close();
    }
  });
}

/* ---------- Daevanion page ---------- */

const takenCount=page=>page.locator('.ae-board-grid .ae-node[data-status="taken"]:not([data-kind="start"])').count();

await check('Daevanion page: a tab per board in game order, open ones normal, locked ones with a padlock; Nezekan first',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  assert.equal(await page.textContent('#aeScreenTitle'),'Daevanion');
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>tab.textContent.trim())),['Nezekan','Zikel','Vaizel','Triniel','Azphel']);
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>Boolean(tab.querySelector('.ae-pad')))),[false,false,true,true,true],'Locked boards carry a padlock before the name');
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>tab.getAttribute('aria-selected'))),['true','false','false','false','false']);
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#11'],'First paint reads the character; then the one board that is shown');
  assert.equal(new URL(page.url()).searchParams.get('board'),'11');
  const win=await boxOf(page,'.ae-dv-window'),tabs=await boxOf(page,'.ae-gw-tabs');
  near((tabs.left+tabs.right)/2,(win.left+win.right)/2,1.5,'board tabs are centred');
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),89,'Every node of the board, Start included');
  assert.equal(await takenCount(page),TAKEN.length,'Taken nodes are lit');
  assert.equal(await page.locator('.ae-node-step').count(),0,'No route numbers on this page');
  assert.equal(await page.locator('.ae-board-grid .ae-node[data-kind="start"] img').count(),1,'The Start node, with the class art');
  assert.match(await page.getAttribute('.ae-board-grid .ae-node[data-kind="start"] img','src'),/board_icon_start_gladiator\.png$/);
  assert.match(await page.getAttribute('.ae-board-grid .ae-node[data-kind="active-skill"] img','src'),/board_icon_legend/,'The game\'s own node art');
  assert.deepEqual(errors,[]);
  await shot(page,'daevanion-open',1600);
  await context.close();
});

await check('Daevanion page: Node panel opens on Start with the board focus and starting level; tapping a node shows it',async()=>{
  const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  const start=await plain(page,'#aeDvPanelBody');
  assert.match(start,/Nezekan - Start/);assert.match(start,/Core nodes Combat Speed and Cooldown Reduction/);assert.match(start,/Board starting level 12/);
  assert.equal(await page.getAttribute('[data-panel="node"]','aria-selected'),'true','Node is the default tab');
  const mp=takenBoard.nodeList.filter(node=>node.name==='Max MP'&&node.open===1)[0].nodeId;
  await page.click(`.ae-node[data-node="${mp}"]`);
  const text=await plain(page,'#aeDvPanelBody');
  assert.match(text,/MP \+50/);assert.match(text,/Grade Common/);assert.match(text,/Cost 1 point/);assert.match(text,/Status Taken/);
  assert.equal(await page.locator(`.ae-node[data-node="${mp}"].is-selected`).count(),1);
  const slam=takenBoard.nodeList.filter(node=>node.name==='Skill Level Up - Overhead Slam')[0].nodeId;
  await page.click(`.ae-node[data-node="${slam}"]`);
  const skill=await plain(page,'#aeDvPanelBody');
  assert.match(skill,/Overhead Slam \+1/);assert.match(skill,/Grade Legend/);assert.match(skill,/Cost 3 points/);assert.match(skill,/Status Not taken/);
  await context.close();
});

await check('Daevanion page: Board Effect adds up the taken nodes and lists what is left',async()=>{
  const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  await page.click('[data-panel="effect"]');
  assert.equal(await page.getAttribute('[data-panel="effect"]','aria-selected'),'true');
  assert.deepEqual(await page.$$eval('.ae-effect-title',items=>items.map(el=>el.textContent)),['Skill Effect','Stat Effect','What is left']);
  const lists=await page.$$eval('.ae-effect-list',items=>items.map(list=>[...list.children].map(li=>li.textContent.trim())));
  assert.deepEqual(lists[0],['Blood Absorption +2','Rending Blow +1'],'Skill Effect: every raised skill with its total');
  assert.deepEqual(lists[1],['Attack Bonus +9','Combat Speed +3%','HP +100','MP +100'],'Stat Effect: two MP +50 nodes give MP +100; % stays %');
  const left=await page.$$eval('.ae-left-list',items=>items.map(list=>[...list.children].map(li=>li.firstElementChild.textContent)));
  assert.deepEqual(left[0],['Overhead Slam +1','Ruinous Blow +1','Crushing Wave +1'],'Key skill nodes not taken yet, in the build\'s order');
  assert.deepEqual(left[1],['Cooldown Reduction +1.5%','Cooldown Reduction +1.5%'],'Corners not taken yet');
  const remaining=takenBoard.nodeList.filter(node=>!['None','Start'].includes(node.type)&&node.open===0);
  assert.equal(remaining.length,77);
  const points=remaining.reduce((sum,node)=>sum+nodeCost(node),0);
  assert.equal(await plain(page,'.ae-effect-total'),`77 nodes left · ${points} points`);
  await shot(page,'daevanion-effect',1600);
  // Tapping a node that is left selects it on the board and opens its Node panel.
  await page.click('.ae-left-list .ae-left-node');
  assert.equal(await page.getAttribute('[data-panel="node"]','aria-selected'),'true');
  assert.match(await plain(page,'#aeDvPanelBody'),/Overhead Slam \+1/);
  assert.equal(await page.locator('.ae-node.is-selected[data-kind="active-skill"]').count(),1);
  await context.close();
});

await check('Daevanion page: ?board= opens that board; one call per board, kept for the visit',async()=>{
  const {page,context,calls}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator',board:'12'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  assert.equal(await page.getAttribute('[data-board="12"]','aria-selected'),'true');
  assert.equal(await takenCount(page),0,'Zikel is open with nothing taken');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#12']);
  await page.click('[data-board="11"]');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-board-grid .ae-node[data-status="taken"]').length>1);
  assert.equal(new URL(page.url()).searchParams.get('board'),'11','Tab changes keep the address');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#12','/aion2/daevanion#11']);
  await page.click('[data-board="12"]');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-board-grid .ae-node[data-status="taken"]').length===1);
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#12','/aion2/daevanion#11'],'Opening Zikel again makes no new call');
  await context.close();
});

await check('Daevanion page: a locked board with no grid says when it opens; one with a grid is drawn greyed',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator',board:'13'})}`);
  await page.waitForSelector('.ae-dv-closed');
  assert.equal(await plain(page,'.ae-dv-closed h2'),'Opens at Lv 30');
  assert.match(await plain(page,'.ae-dv-closed'),/Critical Damage Boost and Tolerance/);
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),0,'No board is drawn');
  assert.equal(await page.getAttribute('[data-board="13"]','aria-selected'),'true');
  assert.match(await plain(page,'#aeDvPanelBody'),/Vaizel - Start.*Critical Damage Boost and Tolerance.*Board starting level 30/);
  await page.click('[data-panel="effect"]');
  assert.match(await plain(page,'#aeDvPanelBody'),/No board to add up yet/);
  await shot(page,'daevanion-locked',1600);
  await page.click('[data-board="14"]');
  await page.waitForSelector('.ae-board-stage.is-greyed');
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),89,'The official site sent this board\'s grid: drawn');
  assert.match(await page.$eval('.ae-board-stage',el=>getComputedStyle(el).filter),/grayscale/,'greyed');
  assert.match(await plain(page,'.ae-dv-banner'),/Opens at Lv 40/);
  assert.equal(await takenCount(page),0);
  await page.click('[data-board="16"]');
  await page.waitForSelector('.ae-dv-closed');
  assert.equal(await plain(page,'.ae-dv-closed h2'),'Opens at Lv 45');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#13','/aion2/daevanion#14','/aion2/daevanion#16'],'Selecting a locked board tries the board call once');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('Daevanion page: Plan my route opens the Ascent Plan Daevanion screen on the same board, which keeps it',async()=>{
  const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator',board:'12'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  const href=await page.getAttribute('#aeDvPlan','href');
  assert.equal(href,`/hub/aetherium/ascent/daevanion/?serverId=1311&characterId=${encodeURIComponent(RICH.characterId)}&region=eu&class=gladiator&board=12`);
  await page.click('#aeDvPlan');
  await page.waitForFunction(()=>location.pathname==='/hub/aetherium/ascent/daevanion/');
  await page.waitForSelector('.ae-planner-tab');
  assert.equal(new URL(page.url()).searchParams.get('board'),'12','The Ascent Plan keeps the board it was opened on');
  assert.equal(await page.getAttribute('[data-board-tab="12"]','aria-selected'),'true');
  await page.goBack();
  await page.waitForSelector('.ae-board-grid .ae-node');
  await page.click('[data-board="11"]');
  await page.waitForFunction(()=>document.querySelector('[data-board="11"]').getAttribute('aria-selected')==='true');
  assert.match(await page.getAttribute('#aeDvPlan','href'),/&board=11$/,'The link follows the board tab');
  await context.close();
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000],[1920,1080]]){
  await check(`Daevanion page at ${width}: no sideways scroll, board centred, panel level with the board`,async()=>{
    const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`,{viewport:{width,height}});
    await page.waitForSelector('.ae-board-grid .ae-node');
    assert.ok(await overflowOf(page)<=0,'scrolls sideways');
    const column=await boxOf(page,'#aeDvBoard'),stage=await boxOf(page,'#aeBoardStage'),panel=await boxOf(page,'#aeDvPanel');
    near((stage.left+stage.right)/2,(column.left+column.right)/2,1.5,'the board sits in the middle of its column');
    assert.ok(stage.left>=column.left-0.5&&stage.right<=column.right+0.5,'the board fits its column');
    if(width>=1100){
      near(column.top,panel.top,1,'board and panel start together');
      near(column.bottom,panel.bottom,1,'board and panel end level');
      assert.ok(stage.right<=panel.left,'panel to the right of the board');
    } else assert.ok(panel.top>=stage.bottom-1,'the panel sits under the board on narrow screens');
    const strip=await page.$eval('.ae-gw-tabs',el=>({scroll:el.scrollWidth,client:el.clientWidth}));
    assert.ok(strip.scroll<=strip.client+1,`all five board tabs fit without scrolling (${strip.scroll} > ${strip.client})`);
    const tile=await boxOf(page,'.ae-board-grid .ae-node[data-kind="start"]');
    assert.ok(tile.width>=18,`nodes stay big enough (${tile.width})`);
    await shot(page,'daevanion-open',width);
    await context.close();
    if(width===390||width===1600){
      const locked=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator',board:'13'})}`,{viewport:{width,height}});
      await locked.page.waitForSelector('.ae-dv-closed');
      assert.ok(await overflowOf(locked.page)<=0,'locked board scrolls sideways');
      await shot(locked.page,'daevanion-locked',width);
      await locked.context.close();
    }
  });
}

/* ---------- Regions and Asmodians ---------- */

await check('Asmodian Daeva in Asia: violet, five Daevanion tabs with the character\'s own ids, a working board, region everywhere',async()=>{
  const q=refQuery(ASMO_REF,{region:'as'});
  const {page,context,calls,urls,errors}=await open(`/hub/aetherium/daevanion/${q}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  assert.equal(await page.getAttribute('body','data-faction'),'asmodian','Plural "Asmodians" and raceId 2');
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>tab.textContent.trim())),['Nezekan','Zikel','Vaizel','Triniel','Azphel'],'Five tabs, not ten');
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>Number(tab.dataset.board))),[31,32,33,34,36],'The character\'s own board ids');
  assert.equal(await page.locator('[data-board]').count(),5);
  assert.deepEqual(await page.$$eval('[data-board]',tabs=>tabs.map(tab=>tab.getAttribute('aria-selected'))),['true','false','false','false','false']);
  assert.equal(new URL(page.url()).searchParams.get('board'),'31','The address carries the Asmodian board id');
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),89,'The board is drawn, not empty');
  const boardCall=urls.find(url=>url.pathname==='/aion2/daevanion');
  assert.equal(boardCall.searchParams.get('boardId'),'31','The board call uses the character\'s own id');
  assert.equal(boardCall.searchParams.get('region'),'as');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion#31']);
  assert.match(await page.getAttribute('#aeDvPlan','href'),/\/ascent\/daevanion\/\?serverId=\d+&characterId=.*&region=as&class=ranger&board=31$/,'Plan my route keeps the id and the region');
  assert.match(await plain(page,'.ae-gw-who'),/Ranger Lv 45/);
  assert.deepEqual(errors,[]);
  // The Ascent Plan route screen opens the same board by the same id.
  await page.click('#aeDvPlan');
  await page.waitForFunction(()=>location.pathname==='/hub/aetherium/ascent/daevanion/');
  await page.waitForSelector('.ae-planner-tab');
  assert.deepEqual(await page.$$eval('[data-board-tab]',tabs=>tabs.map(tab=>Number(tab.dataset.boardTab))),[31],'Only the open board, by its own id');
  assert.equal(new URL(page.url()).searchParams.get('region'),'as');
  await page.waitForSelector('.ae-planner .ae-node');
  assert.equal(urls.filter(url=>url.pathname==='/aion2/daevanion').every(url=>url.searchParams.get('boardId')==='31'),true);
  await context.close();
});

await check('Asmodian Daeva: opening a locked board by tab shows when it opens (id 32), no empty extra tabs',async()=>{
  const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(ASMO_REF,{region:'as',board:'32'})}`);
  await page.waitForSelector('[data-board]');
  assert.equal(await page.locator('[data-board]').count(),5);
  assert.equal(await page.getAttribute('[data-board="32"]','aria-selected'),'true','?board=32 selects the second Asmodian board');
  await context.close();
});

await check('region travels on the menu, Gear, Skills and Daevanion pages and every link on them',async()=>{
  for(const code of ['naw','nae','la','as']){
    const q=refQuery(BASIC,{region:code});
    for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
      const {page,context,urls}=await open(`${path}${q}`);
      if(path.endsWith('daevanion/'))await page.waitForSelector('.ae-board-grid .ae-node');
      for(const url of urls) assert.equal(url.searchParams.get('region'),code,`${path} ${url.pathname} reads ${code}`);
      const links=await page.$$eval('main a[href^="/hub/aetherium/"]',nodes=>nodes.map(n=>n.getAttribute('href')).filter(href=>/serverId=/.test(href)));
      assert.ok(links.length>0,`${path} has Daeva links`);
      for(const href of links) assert.match(href,new RegExp(`[?&]region=${code}(&|$)`),`${path} link keeps ${code}: ${href}`);
      assert.match(await plain(page,'.ae-gw-who, #aeHeader .ae-subline'),/./);
      await context.close();
    }
  }
});

await check('old links with no region read Europe on every character page',async()=>{
  for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
    const {page,context,urls}=await open(`${path}${refQuery(BASIC)}`);
    for(const url of urls) assert.equal(url.searchParams.get('region'),'eu',`${path} ${url.pathname}`);
    await context.close();
  }
  const {page,context,urls}=await open(`/hub/aetherium/gear/${refQuery(BASIC,{region:'kr'})}`);
  for(const url of urls) assert.equal(url.searchParams.get('region'),'eu','A code we do not list is Europe, never sent on');
  await context.close();
});

await check('no visible "armory" or "EU" text on any Aetherium page',async()=>{
  const pages=['/hub/aetherium/','/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/',
    '/hub/aetherium/ascent/','/hub/aetherium/ascent/mastery/','/hub/aetherium/ascent/stigma/','/hub/aetherium/ascent/skill-bar/',
    '/hub/aetherium/ascent/daevanion/','/hub/aetherium/ascent/stats/','/hub/aetherium/ascent/macro/'];
  for(const live of [false,true]){
    for(const path of pages){
      const query=live?refQuery(BASIC):'';
      const {page,context}=await open(`${path}${query}`,{live});
      const text=await page.evaluate(()=>[document.body.innerText,document.title,document.querySelector('meta[name=description]')?.content,
        ...[...document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')].map(n=>[n.placeholder,n.getAttribute('aria-label'),n.title,n.getAttribute('alt')].join(' '))].join('\n'));
      assert.doesNotMatch(text,/armory/i,`${path} live=${live} shows "armory"`);
      assert.doesNotMatch(text,/\bEU\b/,`${path} live=${live} shows "EU"`);
      await context.close();
    }
  }
});

/* ---------- Roster-and-polish checks ---------- */

for(const [width,height] of [[390,844],[1280,900],[1600,1000],[1920,1080]]){
  await check(`character windows at ${width}: Gear, Skills and Daevanion are the same width`,async()=>{
    const widths={};
    for(const path of ['/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
      const {page,context}=await open(`${path}${refQuery(RICH,{class:'gladiator'})}`,{viewport:{width,height}});
      if(path.endsWith('daevanion/'))await page.waitForSelector('.ae-board-grid .ae-node');
      widths[path]=(await boxOf(page,'.ae-gw')).width;
      assert.ok(await overflowOf(page)<=0,`${path} scrolls sideways at ${width}`);
      await context.close();
    }
    const values=Object.values(widths);
    assert.ok(values.every(value=>Math.abs(value-values[0])<=1),`Window widths differ at ${width}: ${JSON.stringify(widths)}`);
  });
}

await check('Skill Bar says where skills should go, not where they are',async()=>{
  const screen=await open('/hub/aetherium/ascent/skill-bar/?class=gladiator&role=dps&level=23',{live:false});
  assert.equal(await plain(screen.page,'#aeScreenTitle'),'Where to put your skills');
  assert.match(await plain(screen.page,'.ae-bar-note'),/This is where the build puts each skill, not what is on your bars now\./);
  assert.equal(await screen.page.getAttribute('.ae-gw-tabs a[data-view="skill-bar"]','aria-current'),'page','The tab keeps its short name');
  assert.equal(await plain(screen.page,'.ae-gw-tabs a[data-view="skill-bar"]'),'Skill Bar');
  await screen.context.close();
  const menu=await open('/hub/aetherium/ascent/?class=gladiator&role=dps&level=23',{live:false});
  assert.equal(await menu.page.getAttribute('.ae-menu-card[data-view="skill-bar"]','title'),'Where each skill should go on your bars. This is the plan, not what is on them now.');
  assert.doesNotMatch(await menu.page.getAttribute('.ae-menu-card[data-view="skill-bar"]','title'),/Which key each skill goes on/);
  await menu.context.close();
});

/* ---------- All the pages ---------- */

await check('every character page with no Daeva: Find your Daeva first, no Worker call; links stay on the site; no dashes in the copy',async()=>{
  for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
    const {page,context,calls,errors}=await open(path,{live:false});
    assert.deepEqual(calls,[],`${path} makes no Worker call with no Daeva`);
    assert.equal(await plain(page,'#aeFindFirstTitle'),'Find your Daeva first',path);
    assert.equal(await page.isHidden('#aeSource'),true,`${path}: no data line`);
    assert.equal(await page.locator('.ae-gw, .ae-board-grid, #aeCards .ae-menu-card').count(),0,`${path}: no character window`);
    await assertNoGamerTag(page,`${path} no Daeva`);
    const outbound=await page.$$eval('main a[href]',links=>links.filter(link=>!link.getAttribute('href').startsWith('/')&&!link.getAttribute('href').startsWith('#')).map(link=>link.href));
    assert.deepEqual(outbound,[],`${path} has no outbound link`);
    const text=await page.evaluate(()=>document.querySelector('main').innerText);
    assert.ok(!/[\u2013\u2014]/.test(text),`${path} copy has an en or em dash`);
    assert.equal(await page.locator('[aria-current="page"]').first().textContent(),'Gear Ledger');
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

await check('Worker down: every character page says so, offers Try again, shows Find your Daeva first and never a stand-in; Try again reads the Daeva',async()=>{
  for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
    const {page,context,errors,state,calls}=await open(`${path}${refQuery(BASIC)}`,{down:true});
    assert.equal(await plain(page,'#aeNotice'),'The official AION 2 site is not answering right now. Try again in a minute.',path);
    assert.equal(await page.isVisible('#aeRetry [data-retry]'),true,`${path}: Try again`);
    assert.equal(await plain(page,'#aeFindFirstTitle'),'Find your Daeva first',path);
    assert.equal(await page.isHidden('#aeSource'),true,`${path}: no data line`);
    assert.equal(await page.locator('.ae-gw, .ae-board-grid, #aeCards .ae-menu-card').count(),0,`${path}: no character window`);
    await assertNoGamerTag(page,`${path} Worker down`);
    state.down=false;
    await page.click('#aeRetry [data-retry]');
    await page.waitForFunction(()=>document.querySelector('.ae-gw-who, #aeHeader .ae-subline'));
    assert.match(await plain(page,'.ae-gw-who, #aeHeader .ae-subline'),/Gladiator Lv 12/,`${path}: Try again read the Daeva`);
    assert.equal(await page.isHidden('#aeNotice'),true,`${path}: the notice clears`);
    assert.equal(await page.locator('#aeFindFirst').count(),0,`${path}: the Find-first panel is gone`);
    assert.equal(calls.filter(call=>call==='/aion2/character').length,2,`${path}: the same read, once more`);
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

await check('no gamer tag, example data or stand-in character on any character page in any state',async()=>{
  for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
    for(const [label,options,query] of [['no Daeva, not connected',{live:false},''],['no Daeva',{},''],['Worker down',{down:true},refQuery(BASIC)]]){
      const {page,context}=await open(`${path}${query}`,options);
      await assertNoGamerTag(page,`${path} (${label})`);
      await context.close();
    }
    // A live Daeva page shows that Daeva only, under its own name.
    const live=await open(`${path}${refQuery(BASIC)}`);
    if(path.endsWith('daevanion/'))await live.page.waitForSelector('.ae-board-grid .ae-node');
    assert.doesNotMatch(await visibleText(live.page),new RegExp(GAMER_TAG,'i'),`${path} live shows the gamer tag`);
    assert.match(await plain(live.page,'.ae-gw-who, #aeHeader h1'),new RegExp(TEST_NAME));
    await live.context.close();
  }
});

/* ---------- First-visit flow (10 Oct 2026): the step bar, one Next per page, badges in words, Enchant flags, slot names ---------- */

const stepsOf=page=>page.$$eval('#aeSteps .ae-step',items=>items.map(el=>({label:el.querySelector('.ae-step-label').textContent,current:el.getAttribute('aria-current'),done:el.classList.contains('is-done'),locked:el.classList.contains('is-locked'),href:el.getAttribute('href'),tick:Boolean(el.querySelector('.ae-step-tick')),note:el.querySelector('.ae-step-note')?.textContent??null})));

await check('step bar on every character page: step 2 current, step 1 ticked, step 3 a link; one Next with the right target',async()=>{
  const q=refQuery(RICH,{class:'gladiator'});
  const want={
    [`/hub/aetherium/gear/${refQuery()}`]:/^\/hub\/aetherium\/ascent\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator$/,
    [`/hub/aetherium/gear/equipment/${refQuery()}`]:/^\/hub\/aetherium\/ascent\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator#aeNow$/,
    [`/hub/aetherium/skills/${q}`]:/^\/hub\/aetherium\/ascent\/mastery\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator$/,
    [`/hub/aetherium/daevanion/${q}`]:/^\/hub\/aetherium\/ascent\/daevanion\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator&board=11$/
  };
  for(const [path,target] of Object.entries(want)){
    const {page,context,errors}=await open(path);
    const steps=await stepsOf(page);
    assert.deepEqual(steps.map(step=>step.label),['Find your Daeva','See your setup','Your next moves'],path);
    assert.equal(steps[1].current,'step',`${path}: step 2 is current`);
    assert.ok(steps[0].done&&steps[0].tick,`${path}: step 1 is done, with a tick`);
    assert.ok(!steps.some(step=>step.locked),`${path}: nothing waits with a Daeva`);
    assert.match(steps[0].href,/^\/hub\/aetherium\/\?serverId=1311&characterId=[^&]+&region=eu$/,`${path}: step 1 opens this Daeva's card`);
    assert.match(steps[2].href,/^\/hub\/aetherium\/ascent\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator$/,`${path}: step 3 opens this Daeva's plan`);
    assert.ok(await page.$eval('#aeSteps',el=>el===document.querySelector('main').firstElementChild),`${path}: the step bar is first under the ribbon`);
    assert.equal(await page.locator('[data-next]').count(),1,`${path}: one Next`);
    assert.match(await page.getAttribute('[data-next]','href'),target,`${path}: Next target`);
    assert.match(await plain(page,'[data-next]'),/^Next: /,`${path}: Next says Next`);
    assert.ok((await boxOf(page,'[data-next]')).height>=44,`${path}: Next at least 44px tall`);
    assert.equal(await page.locator('[aria-current="page"]').first().textContent(),'Gear Ledger',`${path}: the ribbon still marks the page`);
    assert.ok(parseFloat(await page.$eval('#aeSteps .ae-step-label',el=>getComputedStyle(el).fontSize))>=14,`${path}: step text at least 14px`);
    assert.deepEqual(errors,[],path);
    await context.close();
  }
});

await check('Daevanion page: Next follows the board that is open',async()=>{
  const {page,context}=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`);
  await page.waitForSelector('.ae-board-grid .ae-node');
  assert.match(await page.getAttribute('[data-next]','href'),/&board=11$/);
  await page.click('[data-board="12"]');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('board')==='12');
  assert.match(await page.getAttribute('[data-next]','href'),/^\/hub\/aetherium\/ascent\/daevanion\/\?serverId=1311&characterId=[^&]+&region=eu&class=gladiator&board=12$/);
  await context.close();
});

await check('no Daeva: steps 2 and 3 say Find your Daeva first, step 1 is the search, the one Next is the search',async()=>{
  for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/']){
    const {page,context}=await open(path,{live:false});
    const steps=await stepsOf(page);
    assert.deepEqual(steps.filter(step=>step.locked).map(step=>[step.label,step.note]),[['See your setup','Find your Daeva first'],['Your next moves','Find your Daeva first']],path);
    assert.equal(steps[1].current,'step',`${path}: step 2 is still the current step`);
    assert.equal(await page.locator('#aeSteps a').count(),1,`${path}: only step 1 is a link`);
    assert.equal(steps[0].href,'/hub/aetherium/#aeSearch');
    assert.equal(await page.locator('[data-next]').count(),1,`${path}: one Next`);
    assert.equal(await page.getAttribute('[data-next]','href'),'/hub/aetherium/#aeSearch');
    assert.match(await plain(page,'[data-next]'),/^Find your Daeva/);
    await context.close();
  }
});

await check('menu badges say what they count, in words',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`);
  const badges=await page.$$eval('#aeCards .ae-menu-badge',items=>items.map(el=>el.textContent.trim()));
  // was [worn, skills, '2 boards']: the Titles card (12 Oct 2026) adds its own badge.
  assert.deepEqual(badges,[`${richEquipment.equipment.equipmentList.length} worn`,`${learnedExpected} skills`,'2 boards','0 set']);
  assert.ok(parseFloat(await page.$eval('#aeCards .ae-menu-badge',el=>getComputedStyle(el).fontSize))>=14,'badge text at least 14px');
  const badge=await boxOf(page,'#aeCards .ae-menu-badge'),card=await boxOf(page,'#aeCards .ae-menu-card');
  assert.ok(badge.right<=card.right+0.5&&badge.top>=card.top-0.5,'the badge stays inside its card');
  await context.close();
});

/* The gear grid (brief design/aetherium-gear-grid, 11 Oct 2026). It replaced the #484 checks on the ENCHANT, REPLACE and FULL
   flag buttons (the brief removes the buttons): their rule is kept, now as tile markers. A renamed Lv 45 Daeva in Unique,
   Epic and Rare gear. Item details load in the background after first paint; the mock holds each for 150ms to count how
   many run at once. A second copy (FULL45) has the amulet at its +10 cap and the bracelet's detail failing. */
const settled=async page=>page.waitForFunction(()=>document.documentElement.dataset.aeGearDetails==='done',null,{timeout:15000});
const boxes=(page,selector)=>page.$$eval(selector,items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};}));
const rowsOf=list=>[...new Set(list.map(box=>box.top))].map(top=>list.filter(box=>box.top===top).length);

await check('Gear grid: 20 tiles in two rows of 10 at 1600, 5 per row at 1024 and 390, about 88px, no sideways scroll',async()=>{
  for(const [width,height,perRow,min,max] of [[1600,1000,10,84,90],[1024,900,5,60,90],[390,844,5,52,66]]){
    const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`,{viewport:{width,height}});
    const cells=await boxes(page,'#aeGear > li');
    assert.equal(cells.length,20,`${width}: 20 slots`);
    assert.deepEqual(rowsOf(cells),Array(20/perRow).fill(perRow),`${width}: ${perRow} per row`);
    for(const cell of cells){assert.ok(cell.width>=min&&cell.width<=max,`${width}: tile ${cell.width}px`);near(cell.width,cell.height,1,'square tiles');}
    const keys=await page.$$eval('#aeGear > li',items=>items.map(el=>el.dataset.slotKey));
    assert.deepEqual(keys,['MAINHAND','SUBHAND','HELMET','SHOULDER','TORSO','PANTS','GLOVES','BOOTS','CAPE','BELT','NECKLACE','EARRING1','EARRING2','RING1','RING2','BRACELET1','BRACELET2','AMULET','RUNE1','RUNE2'],'The game\'s order');
    assert.ok(await overflowOf(page)<=0,`${width}: no sideways scroll`);
    await context.close();
  }
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`,{viewport:{width:800,height:900}});
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  assert.ok(await overflowOf(page)<=1,'No sideways scroll at 200 percent text');
  await context.close();
});

/* Stats explained (feature/aetherium-stats-explained, 11 Oct 2026): 16 stat tiles with the official lines and class tags. */
await check('Gear page stats: 6 main and 10 deity tiles with the official effect lines, High, Useful and Low tags for the class',async()=>{
  const {page,context,calls,urls}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  // Strict: the only Worker calls are the character, then one item detail per worn item (the gear grid's background load).
  // The stats add none: their record and the class builds are static files.
  await settled(page);
  const worn=lv45Equipment.equipment.equipmentList.map(item=>String(item.slotPos)).sort();
  assert.equal(calls[0],'/aion2/character','First paint reads only the character');
  assert.ok(calls.slice(1).every(call=>call==='/aion2/item'),`Only item details after it: ${calls}`);
  assert.deepEqual(urls.filter(url=>url.pathname==='/aion2/item').map(url=>url.searchParams.get('slotPos')).sort(),worn,'One detail per worn item, none twice');
  const before=calls.length;
  await page.click('[data-stat-open="precision"]');
  await page.waitForSelector('#aeInfo:not([hidden]) [data-stat-reason]');
  assert.equal(calls.length,before,'Opening a stat card adds no Worker call');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#aeStats .ae-stat').count(),6);
  assert.equal(await page.locator('#aeDeity .ae-stat').count(),10);
  const tiles=await page.$$eval('#aeStatsPanel .ae-stat',items=>items.map(el=>[el.dataset.stat,el.querySelector('dd').textContent,el.querySelector('.ae-stat-effect').textContent,el.dataset.tag]));
  const by=Object.fromEntries(tiles.map(([id,points,line,tag])=>[id,{points,line,tag}]));
  assert.deepEqual(by.might,{points:'15',line:'Attack increase +1.5%',tag:'useful'},'The official line, not ours');
  assert.deepEqual(by.precision,{points:'11',line:'Accuracy increase +1.1%, Critical Hit increase +1.1%',tag:'high'});
  assert.deepEqual(by.time,{points:'37',line:'Combat Speed +3.7%, Double Resist +3.7%',tag:'useful'});
  assert.equal(by.constitution.tag,'low');
  assert.equal(by.intelligence.line,'Each point: Status Effect Chance +0.1%','No official line at 0 points: what one point gives');
  const tagLook=await page.$$eval('#aeStatsPanel .ae-stat-tag',items=>Object.fromEntries(items.map(el=>[el.dataset.statTag,getComputedStyle(el).color])));
  assert.equal(tagLook.high,'rgb(226, 181, 79)','High in gold');
  assert.equal(tagLook.useful,'rgb(143, 208, 255)','Useful in ice');
  assert.notEqual(tagLook.low,tagLook.high);
  assert.equal(await page.isVisible('#aeStatsLow'),false,'No near-zero note for the Lv 45 Daeva');
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/아이템|ItemLevel/,'No Korean label or ItemLevel row');
  await context.close();
});

await check('Gear page stats: tapping a tile opens its card in place with what it does, the class reason, sources and gear lines; Escape returns focus',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  const before=page.url();
  await page.click('[data-stat-open="constitution"]');
  await page.waitForSelector('#aeInfo:not([hidden]) [data-stat-reason]');
  assert.equal(page.url(),before,'No navigation');
  const card=await page.$eval('#aeInfoBody',el=>el.innerText.replace(/\s+/g,' '));
  for(const part of [/Constitution/,/Low for Gladiator/,/What it does/,/HP: Your health pool\./,/Constitution: low for Gladiator\. It only raises HP, which your build does not chase\. Templars want it\./,/Where points come from/,/Sub stat lines on armour/,/Soul Binding rerolls/,/Look for Constitution lines on armour\./])assert.match(card,part);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.statOpen),'constitution','Focus returns to the tile');
  await page.click('[data-stat-open="time"]');
  await page.waitForSelector('#aeInfo:not([hidden]) [data-stat-reason]');
  const time=await page.$eval('#aeInfoBody',el=>el.innerText.replace(/\s+/g,' '));
  assert.match(time,/Your points give Combat Speed \+3\.7% Double Resist \+3\.7%/);
  assert.match(time,/Arcana/);
  assert.match(time,/Daevanion: Nezekan nodes \(Combat Speed\)/,'Board named by the board data');
  await context.close();
});

await check('Gear page stats: the near-zero note shows for a low Daeva; no sideways scroll at 390 and at 200 percent text',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`,{viewport:{width:390,height:844}});
  assert.equal(await page.isVisible('#aeStatsLow'),true);
  assert.equal(await plain(page,'#aeStatsLow'),'These come from sub stat lines on Unique and crafted gear, and from Arcana for the deity stats. Low numbers are normal until then.');
  assert.equal(await page.locator('#aeStatsPanel .ae-stat').count(),16);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390: no sideways scroll');
  for(const box of await page.$$eval('#aeStatsPanel .ae-stat',items=>items.map(el=>el.getBoundingClientRect().height)))assert.ok(box>=43.5,'44px targets');
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.setViewportSize({width:800,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'200 percent: no sideways scroll');
  await context.close();
});

/* Stat icons (design/aetherium-stat-icons, 11 Oct 2026): our own 16 icons in one sprite, named by stats.json, on every tile
   and stat card. Pale blue, gold for High. Never an NCSOFT stat icon. */
await check('Stat icons: the sprite has the 16 symbols, 40 by 40, stroke only, no fill or colour',async()=>{
  const sprite=await readFile(resolve(root,'astrix-app/pages/aetherium/icons/stats.svg'),'utf8');
  const symbols=[...sprite.matchAll(/<symbol\b([^>]*)>/g)].map(match=>({id:/\bid="([^"]+)"/.exec(match[1])?.[1],viewBox:/\bviewBox="([^"]+)"/.exec(match[1])?.[1]}));
  assert.deepEqual(symbols.map(symbol=>symbol.id),STAT_IDS.map(id=>`ae-stat-${id}`),'16 symbols, one per stat, ae-stat-<name>');
  assert.ok(symbols.every(symbol=>symbol.viewBox==='0 0 40 40'),'Each 0 0 40 40');
  assert.doesNotMatch(sprite,/\b(fill|stroke|color|stroke-width)=|#[0-9a-f]{3,6}\b|rgb\(|<image|href=/i,'No fills, colours, widths or outside art in the file');
  for(const record of statRecords)assert.equal(record.icon,`ae-stat-${record.id}`,`stats.json names ${record.id}'s icon`);
});

await check('Stat icons: every one of the 16 tiles uses its own symbol, 40px main and 28px deity, pale blue, High in gold with a halo; one sprite request, none to NCSOFT',async()=>{
  const {page,context,requested}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  const icons=await page.$$eval('#aeStatsPanel .ae-stat',items=>items.map(el=>{
    const svg=el.querySelector('svg.ae-stat-icon'),use=svg?.querySelector('use'),box=svg?.getBoundingClientRect(),c=svg&&getComputedStyle(svg);
    return {id:el.dataset.stat,tag:el.dataset.tag??null,href:use?.getAttribute('href')??null,hidden:svg?.getAttribute('aria-hidden'),w:box?.width,h:box?.height,
      stroke:c?.stroke,fill:c?.fill,width:c?.strokeWidth,halo:c?.backgroundImage,label:el.querySelector('.ae-stat-open').textContent};
  }));
  assert.equal(icons.length,16,'16 tiles');
  assert.deepEqual(icons.map(icon=>icon.id).sort(),[...STAT_IDS].sort());
  for(const icon of icons){
    assert.match(icon.href??'',new RegExp(`^/astrix-app/pages/aetherium/icons/stats\\.svg\\?v=[^#]+#ae-stat-${icon.id}$`),`${icon.id}: <use> points at its own symbol`);
    assert.equal(icon.hidden,'true',`${icon.id}: the icon is aria-hidden`);
    assert.ok(icon.label.trim().length>0,`${icon.id}: the tile's text names the stat`);
    const size=MAIN_IDS.includes(icon.id)?40:28;
    assert.equal(Math.round(icon.w),size,`${icon.id}: ${size}px`);assert.equal(Math.round(icon.h),size);
    assert.equal(icon.fill,'none');assert.equal(icon.width,'1.8px',`${icon.id}: 1.8 stroke above 24px`);
    if(icon.tag==='high'){assert.equal(icon.stroke,'rgb(226, 181, 79)',`${icon.id}: High in gold`);assert.match(icon.halo,/radial-gradient/,`${icon.id}: soft halo`);}
    else {assert.equal(icon.stroke,'rgb(143, 208, 255)',`${icon.id}: pale blue`);assert.equal(icon.halo,'none');}
  }
  assert.ok(icons.some(icon=>icon.tag==='high'),'The fixture has a High stat to check');
  // The symbol really draws: the sprite loaded and the shadow tree has painted geometry.
  const parsed=await page.$eval('[data-stat="might"] .ae-stat-icon',async svg=>{const r=await fetch(svg.querySelector('use').getAttribute('href').split('#')[0]);
    const doc=new DOMParser().parseFromString(await r.text(),'image/svg+xml');
    return {ok:r.ok,type:r.headers.get('content-type'),error:Boolean(doc.querySelector('parsererror')),ids:[...doc.querySelectorAll('symbol')].map(s=>s.id),drawn:[...doc.querySelectorAll('symbol')].every(s=>s.querySelector('path,circle,ellipse'))};});
  assert.ok(parsed.ok&&/svg/.test(parsed.type),'The sprite is served as SVG');
  assert.equal(parsed.error,false,'The sprite parses in the browser (a broken file draws nothing)');
  assert.deepEqual(parsed.ids,STAT_IDS.map(id=>`ae-stat-${id}`));assert.ok(parsed.drawn,'Every symbol has geometry');
  const sprites=requested.filter(url=>/\/icons\/stats\.svg/.test(url));
  assert.ok(sprites.length>=1&&new Set(sprites).size===1,`One sprite URL: ${sprites}`);
  assert.deepEqual(requested.filter(url=>/plaync|ncsoft/i.test(new URL(url).host)&&/[\/_-]stats?(?:[_.\/-]|$)|stat_?icon|arcana|abilit/i.test(new URL(url).pathname)),[],'No NCSOFT stat icon');
  // The stat card shows the same icon, 40px, in its well.
  await page.click('[data-stat-open="precision"]');
  await page.waitForSelector('#aeInfo:not([hidden]) [data-stat-reason]');
  const card=await page.$eval('#aeInfo .ae-card-icon .ae-stat-icon',svg=>({href:svg.querySelector('use').getAttribute('href'),w:svg.getBoundingClientRect().width,stroke:getComputedStyle(svg).stroke,hidden:svg.getAttribute('aria-hidden')}));
  assert.match(card.href,/#ae-stat-precision$/);assert.equal(Math.round(card.w),40);assert.equal(card.hidden,'true');
  assert.equal(card.stroke,icons.find(icon=>icon.id==='precision').stroke,'Card icon matches the tile');
  assert.equal(await page.locator('#aeInfo .ae-card-icon img').count(),0,'No outside image for a stat');
  await context.close();
});

await check('Stat icons: 390 and 200 percent zoom keep the icons beside the text with no sideways scroll',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`,{viewport:{width:390,height:844}});
  const rows=await page.$$eval('#aeStatsPanel .ae-stat',items=>items.map(el=>{const i=el.querySelector('.ae-stat-icon').getBoundingClientRect(),t=el.querySelector('.ae-stat-open').getBoundingClientRect(),b=el.getBoundingClientRect();return {left:i.right<=t.left+0.5,inside:i.left>=b.left&&i.right<=b.right};}));
  assert.ok(rows.every(row=>row.left&&row.inside),'Icon sits left of the name, inside the tile');
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.setViewportSize({width:800,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'200 percent: no sideways scroll');
  await context.close();
});

await check('Gear page item card: sub stat lines tagged High, Useful or Low for the class',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  // The gear grid (#486) has no flag buttons: the main hand tile opens the item card.
  await page.click('#aeGearPanel [data-slot-pos="1"] [data-slot]');
  await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-item-rows.is-bonus'));
  const lines=await page.$$eval('#aeInfo .ae-item-rows.is-bonus li',items=>items.map(el=>[el.querySelector('span').firstChild.textContent.trim(),el.dataset.lineTag]));
  assert.deepEqual(lines,[['Might','useful'],['Critical Hit','low'],['MP','low'],['Block','low']]);
  await context.close();
});

await check('Gear tags follow the role the player picked: a Block roll is Low for DPS and High for the tank, from the address or the roster',async()=>{
  const blockTag=async(page)=>{
    await page.click('#aeGearPanel [data-slot-pos="10"] [data-slot]');
    await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-item-rows.is-bonus'));
    return page.$eval('#aeInfo .ae-item-rows.is-bonus li',el=>[el.querySelector('span').firstChild.textContent.trim(),el.dataset.lineTag]);
  };
  const dps=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'dps'})}`);
  assert.deepEqual(await blockTag(dps.page),['Block','low'],'DPS: Block is not on its stat order');
  await dps.context.close();
  const tank=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'tank',team:'main-tank'})}`);
  assert.deepEqual(await blockTag(tank.page),['Block','high'],'Tank: Block heads its stat order');
  await tank.context.close();
  // Saved with the Daeva (no role in the address): the roster's role is used.
  const saved=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await saved.page.evaluate(id=>{const key='aetherium.roster.v2';const store=JSON.parse(localStorage.getItem(key)??'null')??{rosters:{},active:null};store.rosters['eu:1308']={region:'eu',serverId:1308,serverName:'Test',entries:[{name:'TESTDAEVA',serverId:1308,serverName:'Test',characterId:id,className:'Gladiator',level:45,region:'eu',role:'tank',team:'main-tank'}]};localStorage.setItem(key,JSON.stringify(store));},LV45.characterId);
  await saved.page.reload();
  assert.deepEqual(await blockTag(saved.page),['Block','high'],'The role saved with this Daeva');
  await saved.context.close();
});

await check('Gear grid: grade colour behind every worn tile (computed), empty slots dim with their name, Epic never Legend',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  const want={common:'rgb(232, 236, 242)',rare:'rgb(95, 211, 126)',epic:'rgb(88, 168, 255)',unique:'rgb(226, 181, 79)',heroic:'rgb(255, 154, 74)',mythic:'rgb(255, 107, 107)',special:'rgb(69, 214, 198)'};
  const seen=await page.$$eval('#aeGear .ae-gtile',items=>items.map(el=>[el.dataset.grade,getComputedStyle(el).borderTopColor,getComputedStyle(el).backgroundColor]));
  assert.equal(seen.length,17);
  assert.deepEqual([...new Set(seen.map(([grade])=>grade))].sort(),['epic','rare','unique']);
  for(const [grade,border,fill] of seen){assert.equal(border,want[grade],`${grade} edge`);assert.notEqual(fill,'rgba(0, 0, 0, 0)',`${grade} fill`);}
  // Fills as the game's bag draws them (Miguel, 26 Oct 2026: richer blue and richer gold): a deep top lighting to the
  // grade's bright colour at the bottom edge, sampled from his in-game bag.
  const fills=await page.$$eval('#aeGear .ae-gtile',items=>Object.fromEntries(items.map(el=>[el.dataset.grade,getComputedStyle(el).backgroundImage])));
  assert.equal(fills.unique,'linear-gradient(rgb(77, 53, 2) 0%, rgb(77, 53, 2) 50%, rgb(219, 164, 11) 100%)','Unique: rich gold');
  assert.equal(fills.epic,'linear-gradient(rgb(5, 33, 47) 0%, rgb(5, 33, 47) 50%, rgb(31, 116, 160) 100%)','Epic: rich blue');
  const empty=await page.$$eval('#aeGear .ae-gempty',items=>items.map(el=>[el.getAttribute('aria-label'),getComputedStyle(el).borderTopStyle,Number(getComputedStyle(el).opacity)]));
  assert.deepEqual(empty.map(([label])=>label),['Bracelet 2: empty','Rune 1: empty','Rune 2: empty']);
  for(const [,style,opacity] of empty){assert.equal(style,'dashed');assert.ok(opacity<1,'dim');}
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/Legend/,'No Legend anywhere on the page');
  await context.close();
});

await check('Gear grid corners: +N bottom right and the item level top left when the detail has it, both 14px at 4.5:1; no level when it has not',async()=>{
  const {page,context,state}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  const corner=await page.$eval('#aeGear [data-slot-pos="1"] .ae-gtile',el=>{const t=el.getBoundingClientRect(),p=el.querySelector('.ae-gtile-plus'),l=el.querySelector('.ae-gtile-lv');const pb=p.getBoundingClientRect(),lb=l.getBoundingClientRect();return {plus:p.textContent,level:l.textContent,plusCorner:pb.right>=t.right-8&&pb.bottom>=t.bottom-8,levelCorner:lb.left<=t.left+8&&lb.top<=t.top+8,size:[parseFloat(getComputedStyle(p).fontSize),parseFloat(getComputedStyle(l).fontSize)],colour:getComputedStyle(l).color,bg:getComputedStyle(l).backgroundColor};});
  assert.deepEqual([corner.plus,corner.level,corner.plusCorner,corner.levelCorner],['+3','45',true,true]);
  for(const size of corner.size)assert.ok(size>=13,`corner text ${size}px`);
  assert.equal(await page.$eval('#aeGear [data-slot-pos="2"] .ae-gtile-lv',el=>el.textContent),'36','The guard is item level 36');
  assert.equal(await page.locator('#aeGear [data-slot-pos="3"] .ae-gtile-plus').count(),0,'+0 shows no enchant corner');
  assert.ok(state.maxInflight<=3,`At most 3 detail calls at once (saw ${state.maxInflight})`);
  await context.close();
  // The same Daeva with the bracelet's detail failing: that tile keeps no item level, never a guess.
  const failing=await open(`/hub/aetherium/gear/equipment/${refQuery(FULL45)}`);
  await settled(failing.page);
  assert.equal(await failing.page.locator('#aeGear [data-slot-pos="15"] .ae-gtile-lv').count(),0,'No detail, no item level: the corner stays empty');
  assert.equal(await failing.page.$eval('#aeGear [data-slot-pos="1"] .ae-gtile-lv',el=>el.textContent),'45');
  await failing.context.close();
});

await check('Gear grid markers: a 2s gold pulse only on Enchant items, solid under reduced motion; Replace and Full markers; names carry them',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  const looks=await page.$$eval('#aeGear > li[data-slot-pos]',items=>items.map(el=>{const s=getComputedStyle(el.querySelector('.ae-gtile'),'::before');return {pos:el.dataset.slotPos,advice:el.dataset.advice??null,content:s.content,animation:s.animationName,duration:s.animationDuration,width:s.borderTopWidth,colour:s.borderTopColor,mark:el.querySelector('.ae-gmark')?.innerHTML??'',name:el.querySelector('button').getAttribute('aria-label')};}));
  const by=Object.fromEntries(looks.map(look=>[look.pos,look]));
  for(const pos of ['1','2','17','22']){
    const look=by[pos];
    assert.equal(look.advice,'enchant',pos);
    assert.equal(look.animation,'ae-enchant-pulse',`${pos} pulses`);
    assert.equal(look.duration,'2s');
    assert.ok(['1px','1.5px'].includes(look.width),`edge ${look.width} (1.5px snaps to 1px at 1x)`);
    assert.equal(look.colour,'rgb(226, 181, 79)','gold edge');
    assert.match(look.name,/needs enchanting/,'The marker is in the name');
  }
  const declared=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules];}catch{return [];}}).filter(rule=>rule.selectorText?.includes('[data-advice="enchant"] .ae-gtile::before')).map(rule=>rule.style.borderWidth||rule.style.borderTopWidth).filter(Boolean));
  assert.ok(declared.includes('1.5px'),`The edge is declared 1.5px (${declared})`);
  assert.match(by['1'].name,/^Spiritforged Greatsword, Unique, \+3 of 15, Suits your build, needs enchanting, item level 45, Main Hand$/,'The verdict and the marker are in the name');
  for(const look of looks.filter(entry=>entry.advice!=='enchant')){assert.notEqual(look.animation,'ae-enchant-pulse',`${look.pos} never pulses`);}
  for(const pos of ['3','4','5','6','7','8','10','11','12','13','19','14','15']){
    assert.equal(by[pos].advice,'replace',pos);
    assert.match(by[pos].mark,/<svg/,'a chevron');
    assert.match(by[pos].name,/replace with a Unique piece/);
    assert.equal(by[pos].animation,'none','steady');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const still=await page.$eval('#aeGear [data-slot-pos="1"] .ae-gtile',el=>{const s=getComputedStyle(el,'::before');return [s.animationName,s.borderTopColor,s.opacity];});
  assert.deepEqual(still,['none','rgb(226, 181, 79)','1'],'Reduced motion: a solid gold edge');
  assert.equal(await plain(page,'#aeGearLegend'),'Suits your build Close fit Replace it Wear it for now Enchant it next');
  assert.equal(await page.locator('#aeGearPanel [data-enchant-flag], #aeGearPanel .ae-flag').count(),0,'No ENCHANT buttons');
  await context.close();
  const full=await open(`/hub/aetherium/gear/equipment/${refQuery(FULL45)}`);
  await settled(full.page);
  const amulet=await full.page.$eval('#aeGear [data-slot-pos="22"]',el=>({advice:el.dataset.advice,mark:el.querySelector('.ae-gmark')?.innerHTML??'',edge:getComputedStyle(el.querySelector('.ae-gtile'),'::before').content,name:el.querySelector('button').getAttribute('aria-label')}));
  assert.equal(amulet.advice,'full');
  assert.match(amulet.mark,/<svg/,'a check');
  assert.equal(amulet.edge,'none','no edge');
  assert.match(amulet.name,/fully enchanted/);
  await full.context.close();
});

await check('Gear grid hover: a name tooltip with the name in its grade colour, the grade, the slot and +N of the cap',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  // Scroll first: a hover that scrolls the tile into view fires the page's hide-on-scroll right after the tip shows, and
  // a tile redrawn by the background detail loader hides it too. Hover again until the tip holds (a real pointer would).
  const tile=page.locator('#aeGear [data-slot-pos="5"] button');
  await tile.scrollIntoViewIfNeeded();
  let shown=false;
  for(let attempt=0;attempt<5&&!shown;attempt++){
    await page.mouse.move(5,5);
    await tile.hover();
    shown=await page.waitForSelector('#aeGearTip:not([hidden])',{timeout:2000}).then(()=>true,()=>false);
  }
  assert.ok(shown,'The tip shows on hover');
  const tip=await page.$eval('#aeGearTip',el=>({text:el.innerText.replace(/\s+/g,' '),colour:getComputedStyle(el.querySelector('strong')).color}));
  assert.match(tip.text,/^Pilgrim Breastplate Epic · Torso · \+0 of 10 · Item level 38$/);
  assert.equal(tip.colour,'rgb(88, 168, 255)','Name in the Epic colour');
  await page.mouse.move(5,5);
  assert.equal(await page.isHidden('#aeGearTip'),true);
  await context.close();
});

await check('Gear grid click: the item card is the game\'s tooltip beside the build verdict and what to do; Escape closes it and focus returns to the tile',async()=>{
  // Item tooltip (Miguel, 17 Oct 2026) on the left, the build half on the right (feature/aetherium-gear-build, 24 Oct 2026):
  // the verdict for the picked build, why, and What to do with the Enhancement window. A piece to replace says so, once.
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  const before=page.url();
  await page.click('#aeGear [data-slot-pos="2"] button');
  await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-gcard .ae-tt .ae-item-enchant'));
  assert.equal(page.url(),before,'No navigation');
  const tt=await page.$eval('#aeInfo .ae-tt',el=>({grade:el.dataset.grade,head:getComputedStyle(el.querySelector('.ae-tt-head')).backgroundImage,name:getComputedStyle(el.querySelector('h3')).color,art:Boolean(el.querySelector('.ae-tt-art img')),text:el.innerText.replace(/\s+/g,' ')}));
  assert.equal(tt.grade,'unique');
  assert.match(tt.head,/^linear-gradient/,'The header is washed in the grade colour');
  assert.equal(tt.name,'rgb(226, 181, 79)','The name in the grade colour');
  assert.ok(tt.art,'The item art in the header');
  assert.match(tt.text,/Unique .* Item Level 36/,'Grade, type and item level in the header');
  assert.match(tt.text,/Soul Binding Rate 94\.3%/,`The Soul Binding rate with its bar (${tt.text})`);
  assert.equal(await page.locator('#aeInfo .ae-tt-bind .ae-tt-bar i').count(),1);
  assert.match(tt.text,/Required Level \d+/,'The required level at the foot');
  assert.equal(await page.locator('#aeInfo [data-enhance-item]').count(),0,'No button to another tab: it is all on the card');
  // The build half: verdict, who it is for, What to do.
  assert.match(await plain(page,'#aeInfo #aeAssess'),/^Close fit For your Gladiator DPS: Greatsword bruiser DPS /,'The guard is judged for the build');
  const card=await page.$eval('#aeInfo #aeAdvice',el=>el.innerText.replace(/\s+/g,' '));
  for(const part of [/^What to do Enchant it to \+15/,/Grade Unique/,/Enchant cap \+15/,/Now \+11/,/Target \+15/,/\+12: 50% chance/,/A failure costs the attempt, never a level, and never breaks the item\./,/Check the cost in the Growth tab\./])assert.match(card,part);
  const whole=await page.$eval('#aeInfo .ae-gcard-build',el=>el.innerText.replace(/\s+/g,' '));
  for(const said of ['Check the cost','Chance of each step','A failure costs the attempt','Enchant it to +15'])assert.equal(whole.split(said).length-1,1,`"${said}" is said once`);
  assert.equal(await page.locator('#aeAdvice #aeEnhancePanel').count(),1,'The Enhancement window sits inside What to do');
  const facts=await page.$$eval('#aeAdvice .ae-advice-facts.is-row li',items=>items.map(el=>Math.round(el.getBoundingClientRect().top)));
  assert.ok(facts.length===4&&new Set(facts).size===1,`Grade, cap, now and target on one row (${facts})`);
  // Side by side on a wide screen: the tooltip on the left, the build half on the right.
  const sides=await page.evaluate(()=>{const a=document.querySelector('#aeInfo .ae-gcard>.ae-tt').getBoundingClientRect(),b=document.querySelector('#aeInfo .ae-gcard-build').getBoundingClientRect();return {left:a.right<=b.left+1,top:Math.abs(a.top-b.top)<2};});
  assert.ok(sides.left&&sides.top,'Tooltip and build half side by side');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#aeInfo'),true);
  assert.equal(await page.evaluate(()=>document.activeElement?.closest('li')?.dataset.slotPos),'2','Focus back on the tile');
  // A piece to replace: the verdict says so, with no Enhancement window repeating it.
  await page.click('#aeGear [data-slot-pos="5"] button');
  await page.waitForFunction(()=>/Replace it/.test(document.querySelector('#aeInfo #aeAssess')?.textContent??''));
  assert.match(await plain(page,'#aeInfo #aeAssess'),/^Replace it For your .* Do not enhance Epic gear\. Replace it with a Unique piece, from a drop or a craft\./);
  assert.equal(await page.locator('#aeInfo #aeAdvice').count(),0,'No What to do box repeating it');
  await page.click('#aeInfo .ae-info-backdrop',{position:{x:5,y:5}});
  assert.equal(await page.isHidden('#aeInfo'),true,'A tap outside closes it');
  await context.close();
});

// The gear build (feature/aetherium-gear-build, 24 Oct 2026): judged against the build the Ascent Plan uses, a ring per piece,
// the count that suit it and the next three moves, each opening its card. No ring before a piece is judged.
await check('Gear build: the build bar names the build, counts the pieces that suit it, lists three moves; rings drawn per verdict',async()=>{
  for(const width of [1600,390]){
    const {page,context,errors}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'dps'})}`,{viewport:{width,height:width===390?844:1000}});
    await settled(page);
    assert.equal(await plain(page,'#aeBuildTitle'),'Gladiator DPS: Greatsword bruiser DPS');
    const rings=await page.$$eval('#aeGear li[data-slot-pos]',items=>Object.fromEntries(items.map(el=>[el.dataset.slotPos,{verdict:el.dataset.verdict??null,ring:getComputedStyle(el,'::after').borderTopColor,style:getComputedStyle(el,'::after').borderTopStyle,box:(()=>{const a=el.getBoundingClientRect(),t=el.querySelector('.ae-gtile').getBoundingClientRect();return Math.round(t.left-a.left);})()}])));
    assert.equal(rings[1].verdict,'best','The Unique greatsword suits the build');
    assert.equal(rings[2].verdict,'close','The guard\'s rolls are weak for DPS');
    assert.equal(rings[5].verdict,'replace','An Epic piece is to replace');
    assert.equal(rings[1].ring,'rgb(226, 181, 79)','Gold ring for a piece that suits the build');
    assert.equal(rings[2].style,'dashed','Dashed ring for a close fit');
    assert.notEqual(rings[5].ring,rings[1].ring,'Replace has its own colour');
    const suits=Object.values(rings).filter(entry=>entry.verdict==='best').length;
    const worn=Object.values(rings).filter(entry=>entry.verdict).length;
    assert.match(await plain(page,'#aeBuildScore'),new RegExp(`^${suits} of ${worn} pieces suit your build`),'The count matches the rings');
    assert.equal(await page.getAttribute('#aeBuildScore [role="meter"]','aria-valuenow'),String(suits));
    const moves=await page.$$eval('#aeBuildMoves .ae-gb-move',items=>items.map(el=>({kind:el.dataset.moveKind,text:el.innerText.replace(/\s+/g,' ')})));
    assert.equal(moves.length,3,'Three moves');
    assert.match(moves[0].text,/^1 Spiritforged Greatsword Growth: \+3 to \+10/,'The weapon first');
    assert.ok(moves.some(move=>move.kind==='replace'),'One piece to replace is always in the short list');
    assert.match(moves.find(move=>move.kind==='replace').text,/Replace it From .*entry item level/,'Where the better piece drops');
    const tall=await page.$$eval('#aeBuildMoves button',items=>items.map(el=>el.getBoundingClientRect().height));
    assert.ok(tall.every(h=>h>=44),'Moves are big enough to tap');
    await page.click('#aeBuildMoves .ae-gb-move:first-child button');
    await page.waitForSelector('#aeInfo:not([hidden]) .ae-gcard');
    assert.match(await page.textContent('#aeInfo h3'),/Spiritforged Greatsword/,'A move opens its piece\'s card');
    if(width===390){const order=await page.evaluate(()=>{const a=document.querySelector('#aeInfo .ae-gcard>.ae-tt').getBoundingClientRect(),b=document.querySelector('#aeInfo .ae-gcard-build').getBoundingClientRect();return b.top<a.top;});assert.ok(order,'On a phone the verdict comes first');}
    await page.keyboard.press('Escape');
    assert.ok(await overflowOf(page)<=0,`${width}: no sideways scroll`);
    await shot(page,'gear-build',width);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  // An old link with ?item= opens that piece's card; the address keeps only the build.
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{view:'enhance',item:'2'})}`);
  await page.waitForSelector('#aeInfo:not([hidden]) .ae-gcard #aeAssess');
  assert.match(await page.textContent('#aeInfo h3'),/Wisdom Guard/);
  assert.equal(new URL(page.url()).searchParams.get('view'),null);
  assert.equal(new URL(page.url()).searchParams.get('item'),null);
  await context.close();
});

/* Enhancement guide (feature/aetherium-enhancement-guide, 17 Oct 2026): each tile names its next tab in the game's
   Enhancement window, the item card has an Enhance panel drawn like the window's five tabs, and a How enhancing works strip
   holds one Do this next line. Lv 45 fixture with the role in the address. */
const enhanceOf=page=>page.$$eval('#aeGear > li[data-slot-pos]',items=>Object.fromEntries(items.map(el=>{const mark=el.querySelector('.ae-emark');const tile=el.querySelector('.ae-gtile').getBoundingClientRect();const box=mark?.getBoundingClientRect();
  return [el.dataset.slotPos,{enhance:el.dataset.enhance??null,word:mark?.querySelector('.ae-emark-word').textContent??null,icon:(img=>img?{src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth===40,size:Math.round(img.getBoundingClientRect().width)}:null)(mark?.querySelector('img.ae-eicon.is-game')),below:box?box.top>=tile.bottom:null,size:mark?parseFloat(getComputedStyle(mark).fontSize):null,
    described:el.querySelector('button').getAttribute('aria-describedby'),said:mark?.querySelector('.ae-sr').textContent??null}];})));
// The Enhancement window lives on each piece's card (feature/aetherium-gear-build, 24 Oct 2026; was the Enhance tab).
const openItem=async(page,pos)=>{if(!(await page.isHidden('#aeInfo').catch(()=>true)))await page.keyboard.press('Escape');await page.click(`#aeGear [data-slot-pos="${pos}"] button`);await page.waitForFunction(p=>document.querySelector(`#aeInfo:not([hidden]) [data-gcard]`)&&document.querySelector('#aeInfo h3')?.textContent&&document.querySelector('#aeInfo #aeEnhancePanel'),pos);};
const enhanceText=page=>page.$eval('#aeEnhancePanel',el=>el.innerText.replace(/\s+/g,' '));
await check('Enhance marks: each tile names its next tab with the game\'s icon and one word, under the tile, never over the art',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'tank',team:'main-tank'})}`);
  await settled(page);
  const by=await enhanceOf(page);
  // Enhancement logic (Miguel, 18 Oct 2026): nothing is spent on Epic or lower, not even cheap stones, so those tiles carry no mark.
  const want={1:'Growth',2:'Growth',17:'Growth',22:'Growth',3:null,4:null,5:null,6:null,7:null,8:null,19:null,10:null,11:null,12:null,13:null,14:null,15:null};
  for(const [pos,word] of Object.entries(want)){
    assert.equal(by[pos].word,word,`slot ${pos}`);
    if(!word)continue;
    // The game's own icon for the tab (Miguel, 26 Oct 2026: Enhance Item for Growth), loaded and drawn at 16px.
    assert.match(by[pos].icon?.src??'',/^\/astrix-app\/pages\/aetherium\/images\/enhance-icons\/growth\.png\?v=/,`slot ${pos}: the game's Enhance Item icon`);
    assert.equal(by[pos].icon.size,16,`slot ${pos}: icon at 16px`);
    assert.equal(by[pos].below,true,`slot ${pos}: the mark sits under the tile`);
    assert.ok(by[pos].size>=13,`slot ${pos}: ${by[pos].size}px`);
    assert.match(by[pos].described??'',/^aeEmark\d+$/,'The button is described by its mark');
  }
  assert.deepEqual([by[1].enhance,by[3].enhance],['growth',null],'An Epic piece gets no enhance mark (Miguel, 18 Oct 2026)');
  assert.equal(by[1].said,'Enhance next, Growth: Growth: +3 to +10.');
  assert.equal(by[2].said,'Enhance next, Growth: Growth: +11 to +12.');
  // A tap on the mark opens the item card too.
  await page.click('#aeGear [data-slot-pos="2"] .ae-emark');
  await page.waitForSelector('#aeInfo:not([hidden]) .ae-tt');
  await context.close();
});
await check('Enhance panel: the weapon and the guard, the window\'s five tabs with the next one lit, bars, weak lines, no cost numbers',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'tank',team:'main-tank'})}`);
  await settled(page);
  await openItem(page,2);
  // Each tab wears an icon: the game's own where it is captured (Enhance Item, Engrave Manastone, Soul Bind, Substance Morph), our line icon for Theostone.
  const tabs=await page.$$eval('#aeEnhancePanel [role="tab"]',items=>items.map(el=>[el.textContent.trim(),el.getAttribute('aria-selected'),el.classList.contains('is-next'),(img=>img?(img.getAttribute('src').match(/enhance-icons\/([a-z-]+)\.png/)?.[1]??'bad'):el.querySelector('svg.ae-eicon path')?'line':'none')(el.querySelector('img.ae-eicon.is-game'))]));
  assert.deepEqual(tabs,[['Growth','true',true,'growth'],['Manastone','false',false,'manastone'],['Theostone','false',false,'line'],['Soul Binding','false',false,'soul-binding'],['Transfer','false',false,'transfer']]);
  assert.ok(await page.$$eval('#aeEnhancePanel img.ae-eicon.is-game',imgs=>imgs.every(img=>img.complete&&img.naturalWidth===40)),'Every game icon loads');
  const tabSize=await page.$eval('#aeEnhancePanel [role="tab"]',el=>el.getBoundingClientRect().height);
  assert.ok(tabSize>=44,`tab ${tabSize}px tall`);
  let text=await enhanceText(page);
  // Compact card (17 Oct 2026): the move is What to do's head, so no Next line repeats it; the Growth tab says the chance
  // of each step with the most tries once, and the cost once.
  assert.match(text,/^Growth Manastone Theostone Soul Binding Transfer /);
  assert.match(await page.$eval('#aeAdvice',el=>el.innerText.replace(/\s+/g,' ')),/^What to do Enchant it to \+15 .* Now \+11 /);
  assert.match(text,/\+12: 50% chance, at most 11 tries/);
  assert.match(text,/Check the cost in the Growth tab\./);
  assert.equal(await page.locator('#aeAdvice .ae-enext-line').count(),0,'No Next line repeating the move');
  // Soul Binding: the rate as a bar at 94.3%, each line with a bar, weak lines marked for a tank.
  await page.click('#aeEnhancePanel [data-etab="soul-binding"]');
  assert.equal(await page.isVisible('#aeEpanel-soul-binding'),true);
  assert.equal(await page.isHidden('#aeEpanel-growth'),true);
  const rate=await page.$eval('#aeEpanel-soul-binding .is-rate .ae-ebar',el=>({now:el.getAttribute('aria-valuenow'),fill:el.querySelector('i').getBoundingClientRect().width/el.getBoundingClientRect().width}));
  assert.equal(rate.now,'94.3');
  near(Math.round(rate.fill*1000)/10,94.3,1.5,'The rate bar fills 94.3%');
  const lines=await page.$$eval('#aeEpanel-soul-binding .ae-elines li',items=>items.map(el=>[el.querySelector('.ae-eline-name').firstChild.textContent.trim(),el.classList.contains('is-weak'),el.querySelector('.ae-ebar').className,el.querySelector('.ae-eline-value').textContent]));
  assert.deepEqual(lines,[['Block',false,'ae-ebar is-unknown','37'],['MP',true,'ae-ebar is-unknown','112'],['Back Attack',true,'ae-ebar is-unknown','59']]);
  text=await enhanceText(page);
  assert.match(text,/MP Weak for tank/);
  assert.match(text,/Lines for a tank: Block, HP, Accuracy\./);
  // Manastone: four filled slots, each judged for a tank.
  await page.keyboard.press('Home');
  await page.focus('#aeEnhancePanel [data-etab="soul-binding"]');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.$eval('#aeEnhancePanel [aria-selected="true"]',el=>el.dataset.etab),'manastone','Arrow keys move between tabs');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.etab),'manastone');
  const stones=await page.$$eval('#aeEpanel-manastone .ae-estone',items=>items.map(el=>el.innerText.replace(/\s+/g,' ')));
  assert.deepEqual(stones,['Slot 1 Accuracy Bonus +7 Fits','Slot 2 Defense +50 Fits','Slot 3 HP +50 Fits','Slot 4 Critical Hit Resist +10 Not for tank']);
  // No cost numbers from guides anywhere in the panel.
  for(const id of ['growth','manastone','theostone','soul-binding','transfer']){await page.click(`#aeEnhancePanel [data-etab="${id}"]`);const panel=await page.$eval(`#aeEpanel-${id}`,el=>el.innerText);assert.doesNotMatch(panel,/\d[\d,]*\s*(Kina|Enhance Stones?|Soul Codex|Soul Codices)|Kina\s*\d/i,`${id}: no cost numbers`);}
  await page.keyboard.press('Escape');
  // The weapon: Growth to +10 first; Theostone says what the data cannot.
  await openItem(page,1);
  text=await enhanceText(page);
  assert.match(await page.$eval('#aeAdvice',el=>el.innerText.replace(/\s+/g,' ')),/^What to do Enchant it to \+10 .* Now \+3 /);
  assert.match(text,/\+4 to \+10: every step succeeds/);
  await page.click('#aeEnhancePanel [data-etab="theostone"]');
  const theo=await page.$eval('#aeEpanel-theostone',el=>el.innerText.replace(/\s+/g,' '));
  assert.match(theo,/Theostone slots 1/);
  assert.doesNotMatch(theo,/Not confirmed|Reported|in game/);
  assert.match(theo,/A Stun or Root stone\./);
  await page.click('#aeEnhancePanel [data-etab="soul-binding"]');
  const full=await page.$$eval('#aeEpanel-soul-binding .ae-elines .ae-ebar',items=>items.map(el=>[el.getAttribute('aria-valuenow'),Math.round(el.querySelector('i').getBoundingClientRect().width)===Math.round(el.getBoundingClientRect().width-2)]));
  assert.ok(full.length===4&&full.every(([now,filled])=>now==='100'&&filled),'At 100% every line bar is full');
  await shot(page,'enhance-weapon-tank',1600);
  await context.close();
  // DPS: the same guard, no line called weak (the record has no DPS lines for a guard), stones judged for DPS.
  const dps=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'dps'})}`);
  await settled(dps.page);
  await openItem(dps.page,2);
  await dps.page.click('#aeEnhancePanel [data-etab="soul-binding"]');
  assert.equal(await dps.page.locator('#aeEpanel-soul-binding .ae-eline.is-weak').count(),0);
  assert.doesNotMatch(await enhanceText(dps.page),/Not confirmed|No line list/);
  await dps.page.click('#aeEnhancePanel [data-etab="manastone"]');
  assert.equal(await dps.page.locator('#aeEpanel-manastone .ae-stat-tag.is-low').count(),4,'No guard stone suits a DPS');
  await shot(dps.page,'enhance-guard-dps',1600);
  await dps.context.close();
});
await check('How enhancing works: one Do this next line, one line per tab opening its full explanation, Confirmed and Reported tags',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,{role:'tank',team:'main-tank'})}`);
  await settled(page);
  // The strip sits under the gear (feature/aetherium-gear-build, 24 Oct 2026).
  await page.waitForSelector('#aeEnhance:not([hidden]) #aeEnhanceNext');
  assert.equal(await plain(page,'#aeEnhanceNext'),'Do this next: Spiritforged Greatsword Growth: +3 to +10. Always succeeds.');
  assert.equal(await page.locator('#aeEnhanceNext button').count(),1,'One thing at a time');
  const rows=await page.$$eval('#aeEnhanceHow [data-ehow]',items=>items.map(el=>[el.dataset.ehow,el.querySelector('b').textContent,el.getBoundingClientRect().height>=44]));
  assert.deepEqual(rows,[['growth','Growth',true],['manastone','Manastone',true],['theostone','Theostone',true],['soul-binding','Soul Binding',true],['transfer','Transfer',true],['order','The order',true]]);
  await page.click('#aeEnhanceHow [data-ehow="growth"]');
  await page.waitForSelector('#aeInfo:not([hidden])');
  const growth=await page.$eval('#aeInfo',el=>el.innerText.replace(/\s+/g,' '));
  for(const step of ['+11: 65% to start, at most 8 tries','+12: 50% to start, at most 11 tries','+13: 35% to start, at most 14 tries','+14: 25% to start, at most 16 tries','+15: 20% to start, at most 17 tries'])assert.ok(growth.includes(step),step);
  assert.doesNotMatch(growth,/Confirmed/);
  assert.doesNotMatch(growth,/Reported|Not confirmed/);
  assert.match(growth,/Check the cost in the Growth tab\./);
  assert.doesNotMatch(growth,/\d[\d,]*\s*(Kina|Enhance Stones)|up to \d|a run|a boss/i,'Stone sources by name only, no numbers');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.ehow),'growth','Focus back on the line');
  await page.click('#aeEnhanceHow [data-ehow="manastone"]');
  const stones=await page.$eval('#aeInfo',el=>el.innerText.replace(/\s+/g,' '));
  assert.match(stones,/Stones for a tank HP, top 160 Defence, top 100 Block, top 20 Accuracy, top 15/);
  assert.match(stones,/Whether one Engrave fills one slot or rerolls them all\./);
  await page.keyboard.press('Escape');
  // Do this next opens the weapon's card.
  await page.click('#aeEnhanceNext button');
  await page.waitForSelector('#aeInfo:not([hidden]) .ae-gcard #aeAssess');
  assert.match(await page.textContent('#aeInfo h3'),/Spiritforged Greatsword/);
  await page.keyboard.press('Escape');
  // What to enhance, and when (Miguel, 18 Oct 2026): at Lv 45 the level gate is passed: build the Unique pieces.
  assert.match(await plain(page,'#aeEnhanceStage'),/^Lv 45: build your Unique pieces\. 2 Unique pieces to build\./);
  assert.deepEqual(await page.$$eval('.ae-elogic-gate',items=>items.map(el=>[el.dataset.gate,el.classList.contains('is-lit')])),[['level',true],['grade',false],['slot',false]]);
  assert.equal(await page.locator('#aeEnhancePrepare').count(),0,'No prepare path past Lv 35');
  assert.deepEqual(await page.$$eval('.ae-elogic-steps li',items=>items.map(el=>el.dataset.stepTab)),['growth','growth','soul-binding','manastone','theostone','transfer']);
  const all=await page.evaluate(()=>document.body.innerText);
  assert.doesNotMatch(all,/Legend|armory|[–—]/,'No Legend grade, "armory" or dashes');
  await context.close();
});
for(const width of [390,1600]){
  await check(`Enhance at ${width}: no sideways scroll with marks, the strip and the panel open; tank and DPS shots`,async()=>{
    for(const [role,extra] of [['tank',{role:'tank',team:'main-tank'}],['dps',{role:'dps'}]]){
      const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45,extra)}`,{viewport:{width,height:width===390?844:1000}});
      await settled(page);
      assert.ok(await overflowOf(page)<=0,`${width} ${role}: no sideways scroll`);
      const panel=await boxOf(page,'#aeGearPanel .ae-panel');
      const marks=await boxes(page,'#aeGear .ae-emark');
      for(const mark of marks)assert.ok(mark.left>=panel.left&&mark.left+mark.width<=panel.right,`${width}: a mark stays inside the panel (${mark.left}, ${mark.width})`);
      await shot(page,`enhance-gear-${role}`,width);
      for(const pos of [1,2]){
        await openItem(page,pos);
        assert.ok(await overflowOf(page)<=0,`${width} ${role}: no sideways scroll with the card open`);
        const card=await boxOf(page,'#aeInfo .ae-gcard-build'),tabs=await boxOf(page,'#aeEnhancePanel .ae-etabs');
        assert.ok(tabs.right<=card.right+1&&tabs.left>=card.left-1,`${width}: the tabs fit the panel`);
        if(pos===2)await page.click('#aeEnhancePanel [data-etab="soul-binding"]');
        await page.$eval('#aeEnhancePanel',el=>el.scrollIntoView({block:'start'}));
        await shot(page,`enhance-${pos===1?'weapon':'guard'}-${role}`,width);
        await page.keyboard.press('Escape');
      }
      await context.close();
    }
  });
}

await check('Pet, wings and title: three tiles the size of the gear tiles beside the grid, hover names, click cards',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  await settled(page);
  const tiles=await boxes(page,'#aeExtras button');
  const gear=await boxes(page,'#aeGear > li[data-slot-pos="1"] button');
  assert.equal(tiles.length,3);
  for(const tile of tiles){near(tile.width,gear[0].width,1,'same size as a gear tile');}
  assert.equal(new Set(tiles.map(tile=>tile.top)).size,1,'one row');
  const grid=await page.$eval('#aeGear',el=>el.getBoundingClientRect().right);
  assert.ok(tiles[0].left>grid,'beside the grid at desktop');
  assert.deepEqual(await page.$$eval('#aeExtras .ae-extra-label',items=>items.map(el=>el.textContent)),['Pet','Wings','Title']);
  await page.hover('#aeExtras [data-extra="pet"] button');
  await page.waitForSelector('#aeGearTip:not([hidden])');
  assert.match(await plain(page,'#aeGearTip'),/^Karnif Lv 3$/);
  await page.click('#aeExtras [data-extra="wings"] button');
  await page.waitForSelector('#aeInfo:not([hidden])');
  assert.match(await plain(page,'#aeInfo'),/Superior Daeva Wings.*Wings · Epic.*\+0/);
  await page.keyboard.press('Escape');
  await page.click('#aeExtras [data-extra="title"] button');
  await page.waitForSelector('#aeInfo:not([hidden])');
  assert.match(await plain(page,'#aeInfo'),/I'll Finish This/);
  assert.equal(await page.locator('#aeInfo .ae-card-icon svg.ae-title-badge').count(),1,'The title badge, drawn, not game art');
  assert.equal(await page.locator('#aeExtras [data-extra="title"] svg.ae-title-badge').count(),1);
  assert.equal(await page.locator('#aeExtras [data-extra="wings"] [data-advice]').count(),0,'No enchant marker on wings: the data does not say they enchant');
  await context.close();
  const phone=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`,{viewport:{width:1024,height:900}});
  const under=await phone.page.$eval('#aeExtras',el=>el.getBoundingClientRect().top),gridBottom=await phone.page.$eval('#aeGear',el=>el.getBoundingClientRect().bottom);
  assert.ok(under>gridBottom,'under the grid below 1100px');
  await phone.context.close();
});

await check('Gear grid loading: first paint needs only the character call; details at most 3 at a time, kept for the session; calls per visit',async()=>{
  const {page,context,calls,state}=await open(`/hub/aetherium/gear/equipment/${refQuery(LV45)}`);
  assert.equal(calls[0],'/aion2/character','The character call comes first');
  await settled(page);
  const items=calls.filter(call=>call==='/aion2/item').length;
  assert.equal(items,17,'One detail per worn item');
  assert.ok(state.maxInflight<=3&&state.maxInflight>=2,`At most 3 at once (saw ${state.maxInflight})`);
  console.log(`      Gear page visit, Lv 45: ${calls.length} Worker calls (1 character + ${items} item details)`);
  assert.ok(calls.length<=20,'Inside the 20 calls a visit may make');
  const kept=calls.length;
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await settled(page);
  assert.equal(calls.filter(call=>call==='/aion2/item').length,17,'A second visit in the same session reads no item again');
  assert.equal(calls.length,kept+1,'only the character call');
  await context.close();
});

for(const width of [390,820,1280,1600,1920]){
  await check(`flow at ${width}: step bar and Next line up with the window on the Gear, Skills and Daevanion pages`,async()=>{
    for(const path of [`/hub/aetherium/gear/equipment/${refQuery()}`,`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`,`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`]){
      const {page,context}=await open(path,{viewport:{width,height:900}});
      assert.ok(await overflowOf(page)<=0,`${path} scrolls sideways`);
      const steps=await boxOf(page,'#aeSteps'),win=await boxOf(page,'.ae-gw'),next=await boxOf(page,'#aeNext');
      near(steps.left,win.left,1,`${path} step bar starts with the window`);near(steps.right,win.right,1,`${path} step bar ends with the window`);
      near(next.left,win.left,1,`${path} Next row starts with the window`);near(next.right,win.right,1,`${path} Next row ends with the window`);
      assert.ok(next.top>=win.bottom-0.5,`${path} Next comes after the window`);
      const items=await page.$$eval('#aeSteps .ae-step',els=>els.map(el=>el.getBoundingClientRect().toJSON()));
      assert.ok(items.every(item=>item.height>=44),`${path} every step at least 44px tall`);
      await context.close();
    }
  });
}

/* ---------- Crisp polish (design/aetherium-crisp-polish, 10 Oct 2026): type, surfaces, window tabs, width, zoom, skeletons ---------- */

const TABS='[data-forge-destination-ribbon] a,.ae-gw-tabs a,.ae-gw-tab,.ae-planner-tab,.ae-macro-tabs span';
const TINY='.ae-menu-badge,.ae-node-step,.ae-quest-num,.ae-mskill-rank,.ae-mskill-lv,.ae-mskill-bar,.ae-lock,.ae-stg-on,.ae-stg-lock,.ae-itile-badge,.ae-itile-name,.ae-mskill-name,.ae-stg-name,.ae-section-title small,.ae-roster-count,.ae-cite,.ae-tag,.ae-pick-level,.ae-board-cards b,.ae-keycap,.ae-guide-pill';
/** Every visible text node: nothing under 13px (14px unless a badge, count or tab), spacing at 0.02em or less, Barlow (Michroma only on the title and the Daeva name). */
const typeAudit=page=>page.evaluate(({TABS,TINY})=>{
  const bad=[],seen=new Set();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!node.nodeValue.trim())continue;
    const el=node.parentElement;
    if(!el||seen.has(el)||el.closest('.ae-sr,script,style,noscript,.ax-drawer,header.apx-destination-header'))continue;
    seen.add(el);
    const box=el.getBoundingClientRect();
    if(!box.width||!box.height)continue;
    const s=getComputedStyle(el);
    if(s.visibility==='hidden'||s.display==='none')continue;
    const size=parseFloat(s.fontSize);
    const spacing=s.letterSpacing==='normal'?0:parseFloat(s.letterSpacing)/size;
    const tab=Boolean(el.closest(TABS)),primary=Boolean(el.closest('.ae-primary')),brand=Boolean(el.closest('h1:not(.ae-gw-title),.ae-name')),tiny=Boolean(el.closest(TINY));
    const where=`${el.tagName.toLowerCase()}${[...el.classList].map(c=>'.'+c).join('')} "${node.nodeValue.trim().slice(0,28)}"`;
    if(size<13)bad.push(`${where}: ${size}px`);
    else if(size<14&&!(tiny||tab||primary))bad.push(`${where}: ${size}px (only badges, counts and tabs may be 13px)`);
    if(spacing>(tab||primary?0.041:0.021))bad.push(`${where}: letter spacing ${spacing.toFixed(3)}em`);
    if(brand){if(!/Michroma/.test(s.fontFamily))bad.push(`${where}: title not in Michroma (${s.fontFamily})`);}
    else if(!/^"?Barlow"?,/.test(s.fontFamily))bad.push(`${where}: not Barlow (${s.fontFamily})`);
  }
  return bad;
},{TABS,TINY});
/** Text that is cut off: an element that hides its overflow and whose words do not fit (an ellipsis on purpose, and icon tiles whose name sits under the art, are allowed). */
const clippedText=page=>page.evaluate(()=>{
  const out=[];
  for(const el of document.querySelectorAll('main *')){
    if(![...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim()))continue;
    const s=getComputedStyle(el);
    if(s.display==='none'||el.closest('.ae-sr,[hidden],.ae-mskill,.ae-itile,.ae-stg-face,.ae-bar-cell,.ae-quest-text small,.ae-node'))continue;
    const clipsX=/hidden|clip/.test(s.overflowX)&&s.textOverflow!=='ellipsis';
    const clipsY=/hidden|clip/.test(s.overflowY);
    if((clipsX&&el.scrollWidth>el.clientWidth+1)||(clipsY&&el.scrollHeight>el.clientHeight+1))out.push(`${el.tagName.toLowerCase()}${[...el.classList].map(c=>'.'+c).join('')} "${el.textContent.trim().slice(0,30)}"`);
  }
  return out;
});
const lookOf=(page,selector,pseudo=null)=>page.$eval(selector,(el,pseudo)=>{const s=getComputedStyle(el,pseudo);return {radius:s.borderTopLeftRadius,clip:s.clipPath,bg:s.backgroundColor,image:s.backgroundImage,color:s.color,shadow:s.boxShadow,transition:s.transitionDuration,border:s.borderTopWidth,borderColor:s.borderTopColor,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,animation:s.animationName,content:s.content,size:parseFloat(s.fontSize)};},pseudo);
const GOLD='rgb(226, 181, 79)',GOLD_HI='rgb(244, 210, 124)';
const CRISP_PAGES=[
  ['menu',`/hub/aetherium/gear/${refQuery()}`],
  ['gear',`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`],
  ['skills-mastery',`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator'})}`],
  ['skills-stigma',`/hub/aetherium/skills/${refQuery(RICH,{class:'gladiator',tab:'stigma'})}`],
  ['daevanion',`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`],
  ['ascent-menu',`/hub/aetherium/ascent/${refQuery(RICH,{class:'gladiator'})}`]
];
const settle=async(page,name)=>{if(name==='daevanion')await page.waitForSelector('.ae-board-grid .ae-node');if(name==='ascent-menu')await page.waitForSelector('.ae-menu-card');};

await check('crisp type on every character page: body 16px, nothing under 13px, tight Barlow labels in sentence case, sizes in rem',async()=>{
  for(const [name,path] of CRISP_PAGES){
    const {page,context}=await open(path);
    await settle(page,name);
    const bad=await typeAudit(page);
    assert.deepEqual(bad,[],`${name}:\n${bad.join('\n')}`);
    assert.equal(await page.$eval('body',el=>parseFloat(getComputedStyle(el).fontSize)),16,`${name}: body text 16px`);
    const labels=await page.$$eval('.ae-section-title,.ae-slot-label,.ae-item-sec,.ae-effect-title,.ae-eyebrow,label.ae-field>span',els=>els.filter(el=>el.getBoundingClientRect().height).map(el=>{const s=getComputedStyle(el);const text=(el.firstChild?.nodeValue||el.textContent).trim();return {text,transform:s.textTransform,size:parseFloat(s.fontSize),weight:s.fontWeight,caps:text.length>1&&!/[a-z]/.test(text)};}));
    for(const label of labels){
      assert.equal(label.transform,'none',`${name} "${label.text}" is not uppercased`);
      assert.equal(label.caps,false,`${name} "${label.text}" is sentence case`);
      assert.equal(label.size,14,`${name} "${label.text}" is ${label.size}px`);
      assert.equal(label.weight,'700',`${name} "${label.text}" is bold`);
    }
    const before=await page.$$eval('body,.ae-gw-title,.ae-gw-tab,.ae-menu-name,.ae-section-title',els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});
    const after=await page.$$eval('body,.ae-gw-title,.ae-gw-tab,.ae-menu-name,.ae-section-title',els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    assert.deepEqual(after.map(v=>Math.round(v*100)/100),before.map(v=>Math.round(v*1.25*100)/100),`${name}: every size follows the root font size`);
    await context.close();
  }
});

await check('crisp at 200 percent zoom: every character page without clipped text or sideways scroll',async()=>{
  for(const [name,path] of CRISP_PAGES){
    const {page,context}=await open(path,{viewport:{width:800,height:500}});
    await settle(page,name);
    const overflow=await overflowOf(page);
    assert.ok(overflow<=0,`${name} scrolls sideways by ${overflow}px at 200 percent`);
    const clipped=await clippedText(page);
    assert.deepEqual(clipped,[],`${name} clips text at 200 percent:\n${clipped.join('\n')}`);
    await context.close();
  }
});

await check('crisp window: hairline, two-layer shadow and the notched corner; tabs in one strip with exactly one selected as a dark gold box; strobe on every tab and button',async()=>{
  for(const [name,path] of CRISP_PAGES.filter(([key])=>/skills|daevanion/.test(key))){
    const {page,context}=await open(path);
    await settle(page,name);
    const win=await lookOf(page,'.ae-gw');
    assert.equal(win.border,'1px',`${name}: hairline on the window`);
    assert.ok((win.shadow.match(/rgba\(/g)||[]).length>=3,`${name}: top highlight plus a two-layer shadow (${win.shadow})`);
    assert.equal(win.radius,'0px',`${name}: squared window`);
    const notch=await lookOf(page,'.ae-gw','::before');
    assert.equal(notch.content,'""',`${name}: the window has its notched corner`);
    const tabs=await page.$$eval('.ae-gw-tabs .ae-gw-tab',items=>items.map(el=>{const s=getComputedStyle(el),after=getComputedStyle(el,'::after');return {text:el.textContent.trim(),selected:el.getAttribute('aria-selected')==='true',color:s.color,bg:s.backgroundColor,shadow:s.boxShadow,radius:s.borderTopLeftRadius,height:el.getBoundingClientRect().height,strobe:after.animationName,size:parseFloat(s.fontSize),transition:s.transitionDuration};}));
    assert.equal(tabs.filter(t=>t.selected).length,1,`${name}: exactly one selected tab`);
    for(const tab of tabs){
      assert.ok(tab.height>=44,`${name} tab "${tab.text}" is ${tab.height}px tall`);
      // Cylinder buttons (Miguel, 17 Oct 2026, replaces "squared"): every tab has fully rounded ends.
      assert.ok(parseFloat(tab.radius)>=tab.height/2,`${name} tab "${tab.text}" is a cylinder (${tab.radius})`);
      assert.match(tab.strobe,/ax-stroke-pulse/,`${name} tab "${tab.text}" carries the strobe`);
      assert.match(tab.transition,/0\.15s/,`${name} tab "${tab.text}" animates over 150ms`);
      assert.equal(tab.size,13,`${name} tab "${tab.text}" is 13px`);
      if(tab.selected){assert.equal(tab.color,GOLD,`${name}: selected tab in gold`);assert.notEqual(tab.bg,'rgba(0, 0, 0, 0)',`${name}: selected tab is a dark box`);}
      // Select buttons (Miguel, 17 Oct 2026, replaces "plain text"): every tab is the Aetherium button, navy with the pale-blue edge.
      else {assert.notEqual(tab.bg,'rgba(0, 0, 0, 0)',`${name} tab "${tab.text}" is a navy button`);assert.ok(tab.shadow.includes('rgb(111, 147, 191)'),`${name} tab "${tab.text}" has the pale-blue edge (${tab.shadow})`);}
    }
    const strip=await page.$eval('.ae-gw-tabs',el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderBottomWidth}));
    assert.notEqual(strip.bg,'rgba(0, 0, 0, 0)',`${name}: the tabs sit in one strip`);
    assert.equal(strip.border,'1px');
    await context.close();
  }
  // The Ascent Plan screens: the current screen tab is the gold box, the others navy buttons with the pale-blue edge (select buttons, 17 Oct 2026).
  const ascent=await open(`/hub/aetherium/ascent/mastery/${refQuery(RICH,{class:'gladiator'})}`);
  await ascent.page.waitForSelector('.ae-gw-tabs a');
  const links=await ascent.page.$$eval('.ae-gw-tabs a',items=>items.map(a=>({current:a.getAttribute('aria-current')==='page',color:getComputedStyle(a).color,bg:getComputedStyle(a).backgroundColor,shadow:getComputedStyle(a).boxShadow,height:a.getBoundingClientRect().height,radius:getComputedStyle(a).borderTopLeftRadius})));
  assert.equal(links.filter(l=>l.current).length,1,'One current screen');
  for(const link of links){assert.ok(link.height>=44);assert.ok(parseFloat(link.radius)>=link.height/2,`Screen tab is a cylinder (${link.radius})`);if(link.current){assert.equal(link.color,GOLD);assert.notEqual(link.bg,'rgba(0, 0, 0, 0)');}else {assert.notEqual(link.bg,'rgba(0, 0, 0, 0)');assert.ok(link.shadow.includes('rgb(111, 147, 191)'),`Screen tab edge (${link.shadow})`);}}
  await ascent.context.close();
});

await check('crisp menu cards and buttons: notched bevelled tiles, accent ring on hover over 150ms, pills on counts, outline buttons with the notch and the strobe',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`);
  const card=await lookOf(page,'#aeCards .ae-menu-card');
  // Cylinder buttons (Miguel, 17 Oct 2026, replaces the notch and the square corner): rounded, not clipped.
  assert.equal(card.clip,'none','Menu cards are not notched');
  assert.match(card.shadow,/inset/,'Menu cards keep the raised bevel');
  assert.ok(parseFloat(card.radius)>=20,`Menu cards have rounded ends (${card.radius})`);
  assert.match(card.transition,/0\.15s/,'Hover animates over 150ms');
  await page.hover('#aeCards .ae-menu-card');
  await page.waitForTimeout(250);
  // Select buttons (Miguel, 17 Oct 2026, replaces the gold hover border): hover lights the edge pale blue with a soft blue glow.
  const lit=(await lookOf(page,'#aeCards .ae-menu-card')).shadow;
  assert.ok(lit.includes('rgb(185, 220, 255)')&&/inset 0px 0px 14px|0px 0px 14px 0px inset/.test(lit),`Hover lights the edge with a blue glow (${lit})`);
  const badge=await lookOf(page,'#aeCards .ae-menu-badge');
  assert.ok(parseFloat(badge.radius)>=badge.height/2,'Count badges are pills');
  assert.ok(badge.size>=13,`Badge text is ${badge.size}px`);
  for(const selector of ['#aeHeader a.btn']){
    const look=await lookOf(page,selector);
    assert.match(look.clip,/^polygon\(/,`${selector} is notched`);
    assert.equal(look.bg,'rgba(0, 0, 0, 0)',`${selector} has no fill`);
    assert.equal(look.image,'none',`${selector} has no gradient`);
    assert.equal(look.color,GOLD_HI,`${selector} text in the accent`);
    assert.ok(look.height>=44,`${selector} is ${look.height}px tall`);
    assert.match((await lookOf(page,selector,'::after')).animation,/ax-stroke-pulse/,`${selector} carries the strobe`);
  }
  await context.close();
  const gear=await open(`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`);
  // Item details land after ready and each one rebuilds its tile: read the tiles once they have all landed, never a
  // tile that was just swapped out (Linux CI read an empty clip-path from a detached tile).
  await settled(gear.page);
  const count=await lookOf(gear.page,'#aeGearCount');
  assert.ok(parseFloat(count.radius)>=count.height/2,'The worn count is a pill');
  assert.equal(count.border,'1px','with a hairline');
  const slot=await lookOf(gear.page,'#aeGear .ae-slot');
  assert.match(slot.clip,/^polygon\(/,'Gear tiles are notched');
  assert.match(slot.shadow,/inset/,'Gear tiles keep the bevel');
  assert.match((await lookOf(gear.page,'#aeGear .ae-slot','::after')).animation,/ax-stroke-pulse/,'Gear tiles carry the strobe');
  await gear.context.close();
  const dv=await open(`/hub/aetherium/daevanion/${refQuery(RICH,{class:'gladiator'})}`);
  await dv.page.waitForSelector('.ae-board-grid .ae-node');
  await dv.page.click('[data-panel="effect"]');
  const left=await lookOf(dv.page,'.ae-effect-total b');
  assert.ok(parseFloat(left.radius)>=left.height/2,'The nodes-left count is a pill');
  const plan=await lookOf(dv.page,'#aeDvPlan');
  assert.match(plan.clip,/^polygon\(/,'Plan my route is notched');
  assert.equal(plan.bg,'rgba(0, 0, 0, 0)','Plan my route is an outline button');
  await dv.context.close();
});

for(const [width,height] of [[1600,1000],[1920,1080]]){
  await check(`crisp width at ${width}: every character page fills 1440 with 24px gutters and no empty band under the content`,async()=>{
    for(const [name,path] of CRISP_PAGES){
      const {page,context}=await open(path,{viewport:{width,height}});
      await settle(page,name);
      const main=await page.$eval('main',el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,width:r.width,padL:parseFloat(s.paddingLeft),padR:parseFloat(s.paddingRight)};});
      assert.equal(main.width-main.padL-main.padR,1440,`${name}: content is 1440 wide`);
      assert.equal(main.padL,24,`${name}: 24px gutter`);
      if(await page.locator('.ae-gw').count())near((await boxOf(page,'.ae-gw')).width,1440,1,`${name}: the window fills the content width`);
      const band=await page.evaluate(()=>{const main=document.querySelector('main');const last=[...main.children].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0).at(-1);return document.querySelector('footer').getBoundingClientRect().top-last.bottom;});
      assert.ok(band>=0&&band<=56,`${name}: no empty band under the content (${Math.round(band)}px)`);
      assert.ok(await overflowOf(page)<=0,`${name} scrolls sideways`);
      if(process.env.AE_SHOTS&&width===1600)await page.screenshot({path:resolve(process.env.AE_SHOTS,`crisp-${name}-${width}.png`),fullPage:true});
      await context.close();
    }
  });
}

await check('crisp loading: window and menu skeletons in the final shape with a shimmer, none under reduced motion',async()=>{
  for(const motion of ['no-preference','reduce']){
    const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:motion});
    await context.route(/\.mjs/,route=>route.abort());
    await context.route(/playnccdn\.com|plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
    const menu=await context.newPage();
    await menu.goto(`${base}/hub/aetherium/gear/`);
    const cards=await menu.$$eval('#aeCards .ae-menu-card.is-skeleton',items=>items.map(el=>({art:Boolean(el.querySelector('.ae-sk-art')),name:Boolean(el.querySelector('.ae-sk-name')),top:Math.round(el.getBoundingClientRect().top),clip:getComputedStyle(el).clipPath,shimmer:getComputedStyle(el.querySelector('.ae-sk'),'::after').animationName})));
    assert.equal(cards.length,4,'Four card shapes, as the menu draws'); // was 3: the Titles card (12 Oct 2026) makes four
    assert.ok(cards.every(c=>c.art&&c.name),'Each with its art and name bar');
    assert.equal(new Set(cards.map(c=>c.top)).size,1,'On one row');
    assert.ok(cards.every(c=>/^polygon\(/.test(c.clip)),'Notched like the real cards');
    assert.ok(cards.every(c=>c.shimmer===(motion==='reduce'?'none':'ae-shimmer')),`Shimmer with motion ${motion}`);
    for(const path of ['/hub/aetherium/skills/','/hub/aetherium/daevanion/','/hub/aetherium/gear/equipment/']){
      const page=await context.newPage();
      await page.goto(`${base}${path}`);
      const shape=await page.$eval('#aeStage .ae-sk-window',el=>({bar:el.querySelector('.ae-sk-bar').getBoundingClientRect().height,tiles:el.querySelectorAll('.ae-sk-row .ae-sk').length,row:new Set([...el.querySelectorAll('.ae-sk-row .ae-sk')].map(t=>Math.round(t.getBoundingClientRect().top))).size,words:el.nextElementSibling.textContent,shimmer:getComputedStyle(el.querySelector('.ae-sk'),'::after').animationName}));
      assert.ok(shape.bar>=40,`${path}: a window bar shape`);
      assert.equal(shape.tiles,4,`${path}: four tiles`);
      assert.equal(shape.row,1,`${path}: on one row`);
      assert.equal(shape.words,'Reading your character.');
      assert.equal(shape.shimmer,motion==='reduce'?'none':'ae-shimmer');
      await page.close();
    }
    await context.close();
  }
});


/* ---------- More character info (12 Oct 2026) ---------- */
await check('Daevanion: each open board tab shows its percent complete (nodes taken of nodes total)',async()=>{
  const {page,context,errors}=await open(`/hub/aetherium/daevanion/${refQuery(NEW45,{class:'gladiator',board:'11'})}`);
  // The percent is drawn beside the name (CSS content from data-board-percent), so the tab's own text stays the board name.
  const tabs=await page.$$eval('[data-board]',els=>els.map(el=>{const pct=el.querySelector('.ae-tab-pct');return [el.textContent.trim(),pct?getComputedStyle(pct,'::before').content:null];}));
  assert.deepEqual(tabs,[['Nezekan','"51%"'],['Zikel','"48%"'],['Vaizel','"24%"'],['Triniel','"0%"'],['Azphel','"0%"']]);
  const size=await page.$eval('.ae-tab-pct',el=>parseFloat(getComputedStyle(el,'::before').fontSize));
  assert.ok(size>=13,'Percent at least 13px');
  for(const width of [390,1600]){
    await page.setViewportSize({width,height:900});
    const fit=await page.$eval('.ae-gw-tabs',el=>el.scrollWidth-el.clientWidth);
    assert.ok(fit<=0,`all five tabs fit at ${width} with their percent`);
  }
  assert.deepEqual(errors,[]);
  await context.close();
  // A Daeva with only Nezekan open (the 5 Oct capture): a locked board shows no percent.
  const basic=await open(`/hub/aetherium/daevanion/${refQuery(BASIC,{class:'gladiator',board:'11'})}`);
  const locked=await basic.page.$$eval('[data-board].is-locked',els=>els.map(el=>el.querySelector('.ae-tab-pct')));
  assert.ok(locked.length>0&&locked.every(item=>item===null),'Locked boards: no percent');
  await basic.context.close();
});

await check('Stigma screen: the equipped stigmas with their levels from the skill data, beside the build four',async()=>{
  const {page,context,errors}=await open(`/hub/aetherium/ascent/stigma/${refQuery(NEW45,{class:'gladiator'})}`);
  await page.waitForSelector('#aeStigmaNow [data-stigma-now]');
  const now=await page.$$eval('#aeStigmaNow [data-stigma-now]',els=>els.map(el=>[el.dataset.stigmaNow,el.dataset.stigmaLevel??null,el.querySelector('.ae-itile-lv')?.textContent??null]));
  assert.deepEqual(now,[['Wrath Wave','1','Lv 1'],["Zikel's Blessing",'3','Lv 3'],['Rage Burst','8','Lv 8'],['Wave Armor','1','Lv 1'],['Fracturing Rush','1','Lv 1']]);
  assert.equal(await page.locator('.ae-stg-row [data-stigma]').count(),4,'The build four stay as they are');
  assert.match(await page.getAttribute('[data-stigma-now="Rage Burst"]','aria-label'),/^Rage Burst, Lv 8: /);
  await page.click('[data-stigma-now="Rage Burst"]');
  assert.match(await page.$eval('#aeInfoTitle',el=>el.textContent),/Rage Burst\s+Lv\. 8/);
  const lv=await page.$eval('.ae-itile-lv',el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(lv>=13,'Level at least 13px');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('menu: the legion line under the name only when the data has one',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery(NEW45)}`);
  assert.equal(await page.$eval('#aeLegion',el=>el.textContent.replace(/\s+/g,' ').trim()),'Legion TESTLEGION');
  assert.equal(await page.$eval('[data-view="titles"] .ae-menu-status',el=>el.textContent.trim()),'3 of 3 effects set');
  await context.close();
  const none=await open(`/hub/aetherium/gear/${refQuery(BASIC)}`);
  assert.equal(await none.page.locator('#aeLegion').count(),0);
  await none.context.close();
});

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_CHARACTER=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_CHARACTER=PASS');
