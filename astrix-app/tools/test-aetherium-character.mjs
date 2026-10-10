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
import {needsEnchant} from '../games/aion2/engine/ascent-advisor.mjs';
import {deriveRegion} from './fixtures/aion2/derive-region-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
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
const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{if(process.env.AE_ONLY&&!name.includes(process.env.AE_ONLY))return;try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=true,down=false,viewport={width:1600,height:1000},art=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  const urls=[];
  const state={down};
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
    let body;
    if(url.pathname==='/aion2/character')body=asmo?{info:ASMO.info,equipment:ASMO.equipment}:acc?{info:accInfo,equipment:accEquipment}:rich?{info:richInfo,equipment:richEquipment}:{info,equipment};
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
  return {page,context,calls,urls,errors,state};
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

await check('menu: header kept, three cards in the Ascent Plan style, each linking to its page with the Daeva',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/${refQuery()}`);
  assert.deepEqual(calls.filter(call=>call!=='/aion2/character'),[],'First paint: only /aion2/character');
  const header=await plain(page,'#aeHeader');
  assert.match(header,/RICHDAEVA/);assert.doesNotMatch(header,new RegExp(GAMER_TAG,'i'));assert.match(header,/Draped in Sky/);assert.match(header,/Gladiator Lv 23/);assert.match(header,/Elyos/);assert.match(header,/Kaisinel/);assert.match(header,/Europe/);
  assert.match(header,/Combat power 6,532/);assert.match(header,/Item level/);
  assert.equal(await page.getAttribute('#aeHeader a.btn','href'),'/hub/aetherium/','Back to Daeva Card');
  assert.deepEqual(await page.$$eval('#aeCards .ae-menu-card',cards=>cards.map(card=>card.dataset.view)),['gear','skills','daevanion']);
  assert.deepEqual(await page.$$eval('#aeCards .ae-menu-name',items=>items.map(el=>el.textContent)),['Gear','Skills','Daevanion']);
  const lines=await page.$$eval('#aeCards .ae-menu-status',items=>items.map(el=>el.textContent.trim()));
  assert.match(lines[0],/^\d+ of \d+ worn$/);
  assert.equal(lines[1],`${learnedExpected} skills · 3 of 13 stigmas`);
  assert.equal(lines[2],`Nezekan: ${TAKEN.length} / 88 nodes`);
  assert.match(await plain(page,'[data-view="skills"] .ae-menu-blurb'),/^Mastery and Stigma$/);
  assert.equal(await page.locator('#aeCards .ae-menu-badge').count(),3,'A count badge on each card');
  const hrefs=await page.$$eval('#aeCards .ae-menu-card',cards=>cards.map(card=>card.getAttribute('href')));
  const ref=`serverId=1311&characterId=${encodeURIComponent(RICH.characterId)}&region=eu`;
  assert.equal(hrefs[0],`/hub/aetherium/gear/equipment/?${ref}`);
  assert.equal(hrefs[1],`/hub/aetherium/skills/?${ref}&class=gladiator`);
  assert.equal(hrefs[2],`/hub/aetherium/daevanion/?${ref}&class=gladiator&board=11`,'The Daevanion card opens the first open board');
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
  await check(`menu at ${width}: no sideways scroll, three equal cards on one row`,async()=>{
    const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`,{viewport:{width,height}});
    assert.ok(await overflowOf(page)<=0,'scrolls sideways');
    const cards=await page.$$eval('#aeCards .ae-menu-card',items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};}));
    assert.equal(cards.length,3);
    assert.ok(cards.every(card=>Math.abs(card.top-cards[0].top)<1&&Math.abs(card.width-cards[0].width)<1&&Math.abs(card.height-cards[0].height)<1),'cards share a row, a width and a height');
    assert.ok(cards[0].right<=cards[1].left+0.5&&cards[1].right<=cards[2].left+0.5,'cards do not overlap');
    const head=await boxOf(page,'#aeHeader'),nav=await boxOf(page,'#aeCards');
    near(nav.left,head.left,1,'cards start where the header starts');near(nav.right,head.right,1,'cards end where the header ends');
    await shot(page,'menu',width);
    await context.close();
  });
}

/* ---------- Gear page ---------- */

await check('Gear page: worn gear, stats, pet, wings and title; item cards still open',async()=>{
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/equipment/${refQuery(BASIC)}`);
  assert.deepEqual(calls,['/aion2/character'],'First paint: only /aion2/character');
  assert.equal(await page.textContent('#aeScreenTitle'),'Gear');
  assert.equal(await page.locator('#aeGear [data-slot]').count(),8);
  assert.match(await page.textContent('#aeGearCount'),/8 of 8 worn/);
  assert.equal(await page.locator('#aeStats .ae-stat').count(),6,'Six primary stats');
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
  assert.equal(await plain(page,'#aeSkillTitle'),'Lunge Stance Lv. 1','The build\'s first stigma shows on load');
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
  assert.deepEqual(badges,[`${richEquipment.equipment.equipmentList.length} worn`,`${learnedExpected} skills`,'2 boards']);
  assert.ok(parseFloat(await page.$eval('#aeCards .ae-menu-badge',el=>getComputedStyle(el).fontSize))>=14,'badge text at least 14px');
  const badge=await boxOf(page,'#aeCards .ae-menu-badge'),card=await boxOf(page,'#aeCards .ae-menu-card');
  assert.ok(badge.right<=card.right+0.5&&badge.top>=card.top-0.5,'the badge stays inside its card');
  await context.close();
});

await check('Gear page: an Enchant flag on every item the plan wants enchanted, leading to the gear move; slot names in plain words and game order',async()=>{
  const {page,context,calls}=await open(`/hub/aetherium/gear/equipment/${refQuery(ACC)}`);
  assert.deepEqual(calls,['/aion2/character'],'The flags need no extra call');
  const expected=accEquipment.equipment.equipmentList.filter(item=>item.enchantLevel===0).map(item=>String(item.slotPos)).sort();
  assert.ok(expected.length>0&&expected.length<accEquipment.equipment.equipmentList.length,'Some items at +0, some past it');
  const flags=await page.$$eval('[data-enchant-flag]',items=>items.map(el=>[el.dataset.enchantFlag,el.getAttribute('href'),el.textContent.trim()]));
  assert.deepEqual(flags.map(flag=>flag[0]).sort(),expected,'One flag per +0 item, the advisor\'s own rule');
  for(const [,href,text] of flags){
    assert.equal(text,'Enchant');
    assert.match(href,/^\/hub\/aetherium\/ascent\/\?serverId=1312&characterId=[^&]+&region=eu&class=gladiator#aeNow$/,'The flag leads to the gear moves on the Ascent Plan');
  }
  const unflagged=await page.$$eval('#aeGear > li',items=>items.filter(li=>!li.querySelector('[data-enchant-flag]')).map(li=>li.querySelector('.ae-slot-meta')?.textContent??''));
  for(const meta of unflagged)assert.doesNotMatch(meta,/\+0( |$)/,`no flag means not +0: ${meta}`);
  const labels=await page.$$eval('#aeGear .ae-slot-label',items=>items.map(el=>el.textContent));
  assert.deepEqual(labels.slice(-4),['Earring 1','Earring 2','Ring 1','Bracelet 1'],'Plain words, game order');
  assert.ok(!labels.some(label=>/[A-Z]{2}/.test(label)),`No raw codes: ${labels}`);
  const first=await page.$eval('#aeGear li.has-flag',li=>{const a=li.getBoundingClientRect(),f=li.querySelector('[data-enchant-flag]').getBoundingClientRect(),n=li.querySelector('strong').getBoundingClientRect();return {inside:f.left>=a.left-0.5&&f.right<=a.right+0.5&&f.top>=a.top-0.5&&f.bottom<=a.bottom+0.5,clear:n.right<=f.left+0.5,size:getComputedStyle(li.querySelector('[data-enchant-flag]')).fontSize};});
  assert.ok(first.inside,'the flag sits inside its tile');
  assert.ok(first.clear,'the flag does not cover the item name');
  assert.ok(parseFloat(first.size)>=14,'flag text at least 14px');
  assert.equal(needsEnchant({empty:false,enchant:0}),true);
  await Promise.all([page.waitForURL(/\/ascent\//),page.click('[data-enchant-flag]')]);
  await page.waitForSelector('#aeNow');
  assert.match(await plain(page,'#aeNow'),/Enchant \d+ worn items above \+0/,'The flag lands on the gear move');
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
    const tabs=await page.$$eval('.ae-gw-tabs .ae-gw-tab',items=>items.map(el=>{const s=getComputedStyle(el),after=getComputedStyle(el,'::after');return {text:el.textContent.trim(),selected:el.getAttribute('aria-selected')==='true',color:s.color,bg:s.backgroundColor,radius:s.borderTopLeftRadius,height:el.getBoundingClientRect().height,strobe:after.animationName,size:parseFloat(s.fontSize),transition:s.transitionDuration};}));
    assert.equal(tabs.filter(t=>t.selected).length,1,`${name}: exactly one selected tab`);
    for(const tab of tabs){
      assert.ok(tab.height>=44,`${name} tab "${tab.text}" is ${tab.height}px tall`);
      assert.equal(tab.radius,'0px',`${name} tab "${tab.text}" is squared`);
      assert.match(tab.strobe,/ax-stroke-pulse/,`${name} tab "${tab.text}" carries the strobe`);
      assert.match(tab.transition,/0\.15s/,`${name} tab "${tab.text}" animates over 150ms`);
      assert.equal(tab.size,13,`${name} tab "${tab.text}" is 13px`);
      if(tab.selected){assert.equal(tab.color,GOLD,`${name}: selected tab in gold`);assert.notEqual(tab.bg,'rgba(0, 0, 0, 0)',`${name}: selected tab is a dark box`);}
      else assert.equal(tab.bg,'rgba(0, 0, 0, 0)',`${name} tab "${tab.text}" is plain text`);
    }
    const strip=await page.$eval('.ae-gw-tabs',el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderBottomWidth}));
    assert.notEqual(strip.bg,'rgba(0, 0, 0, 0)',`${name}: the tabs sit in one strip`);
    assert.equal(strip.border,'1px');
    await context.close();
  }
  // The Ascent Plan screens: the current screen tab is the gold box, the others plain.
  const ascent=await open(`/hub/aetherium/ascent/mastery/${refQuery(RICH,{class:'gladiator'})}`);
  await ascent.page.waitForSelector('.ae-gw-tabs a');
  const links=await ascent.page.$$eval('.ae-gw-tabs a',items=>items.map(a=>({current:a.getAttribute('aria-current')==='page',color:getComputedStyle(a).color,bg:getComputedStyle(a).backgroundColor,height:a.getBoundingClientRect().height,radius:getComputedStyle(a).borderTopLeftRadius})));
  assert.equal(links.filter(l=>l.current).length,1,'One current screen');
  for(const link of links){assert.ok(link.height>=44);assert.equal(link.radius,'0px');if(link.current){assert.equal(link.color,GOLD);assert.notEqual(link.bg,'rgba(0, 0, 0, 0)');}else assert.equal(link.bg,'rgba(0, 0, 0, 0)');}
  await ascent.context.close();
});

await check('crisp menu cards and buttons: notched bevelled tiles, accent ring on hover over 150ms, pills on counts, outline buttons with the notch and the strobe',async()=>{
  const {page,context}=await open(`/hub/aetherium/gear/${refQuery()}`);
  const card=await lookOf(page,'#aeCards .ae-menu-card');
  assert.match(card.clip,/^polygon\(/,'Menu cards are notched');
  assert.match(card.shadow,/inset/,'Menu cards keep the raised bevel');
  assert.equal(card.radius,'0px');
  assert.match(card.transition,/0\.15s/,'Hover animates over 150ms');
  await page.hover('#aeCards .ae-menu-card');
  await page.waitForTimeout(250);
  assert.equal((await lookOf(page,'#aeCards .ae-menu-card')).borderColor,GOLD,'Hover lifts the border to the accent');
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
    assert.equal(cards.length,3,'Three card shapes');
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

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_CHARACTER=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_CHARACTER=PASS');
