#!/usr/bin/env node
// The AION 2 Guide, phase 1 (feature/aetherium-guide-home, 18 Oct 2026) on a local static server, the Worker mocked from
// the fixtures (never NCSOFT, never the real Worker):
//   - the shell contract the sections build on: photo band (kicker, H1, lede), side menu (Guide home, this section's pages with
//     this one lit, the other sections under More), no breadcrumb or section pill row, coming soon pages;
//   - the Guide link in the ribbon and the menu drawer of every Aetherium page;
//   - the home: photo band with its gold and navy buttons, a tile per section, the path strip, every link reaches a page;
//   - the class roles table: 8 rows, class names gold, ratings bold, each cell from the data (a Reported tier cited, else our build);
//   - the 8 class pages: builds by role, key skills, stat order, Ascent Plan links;
//   - "Your setup vs the build": flags with what they cost, the read's age, the device memory, never a block; Worker down;
//   - the memory helper: per Daeva key, savedAt, blocked storage is never an error;
//   - looks: no sideways scroll at 390, buttons 44px tall, the side menu folds behind a toggle on a phone, usable well inside 4 s;
//   - the type scale (design/aetherium-guide-foundations, 20 Oct 2026): H1, section, card and sub headings the same size on every
//     Guide page, the title face only at 24px and up; exactly one side menu item lit, hover never gold; the home tiles' icons.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
const fixtureDir=resolve(root,'astrix-app/tools/fixtures/aion2/eu');
const fixture=async name=>JSON.parse(await readFile(resolve(fixtureDir,`${name}.json`),'utf8'));
const json=async rel=>JSON.parse(await readFile(resolve(root,rel),'utf8'));
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

// A Lv 45 Gladiator in Epic and Rare gear with stigmas the build does not use (captured 11 Oct 2026, renamed), served on server 1317.
const lv45Info=await fixture('lv45-info'),lv45Equipment=await fixture('lv45-equipment'),lv45Items=await fixture('lv45-items');
Object.assign(lv45Info.profile,{serverId:1317,characterName:'GUIDEDAEVA'});
const LV45={name:'GUIDEDAEVA',serverId:1317,serverName:lv45Info.profile.serverName,characterId:lv45Info.profile.characterId,className:'Gladiator',level:45,raceName:'Elyos',raceId:1,region:'eu'};
const rosterWith=entry=>JSON.stringify({rosters:{[`eu:${entry.serverId}`]:{region:'eu',serverId:entry.serverId,serverName:entry.serverName,entries:[entry]}},active:{roster:`eu:${entry.serverId}`,key:`${entry.serverId}:${entry.characterId}`}});
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');

const CLASSES=['Gladiator','Templar','Assassin','Ranger','Sorcerer','Spiritmaster','Cleric','Chanter'];
const SECTIONS=[['home','Home','/hub/aetherium/guide/'],['general','General','/hub/aetherium/guide/general/'],['character','Character','/hub/aetherium/guide/character/'],['skills','Skills','/hub/aetherium/guide/skills/'],['equipment','Equipment','/hub/aetherium/guide/equipment/'],['crafting','Crafting','/hub/aetherium/guide/crafting/'],['world','World','/hub/aetherium/guide/world/'],['guides','Guides','/hub/aetherium/guide/guides/']];
// Sections still coming soon: phases 3 to 5 built Equipment, Crafting, General, Skills and World; the Guides Overview
// (design/aetherium-guide-overviews) lists the guides written so far.
const SOON=[];
const ROLES=['tank','healer','support','dps'];
const GOLD='rgb(226, 181, 79)';
const builds=Object.fromEntries(await Promise.all(CLASSES.map(async name=>[name,(await json(`astrix-app/games/aion2/data/advisor/builds/${name.toLowerCase()}.json`)).records])));
const ratings=await json('astrix-app/games/aion2/data/advisor/class-roles.json');

const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=true,down=false,viewport={width:1600,height:1000},roster=null,memory=null,blockStorage=false}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    const body=await response.text();
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    await route.fulfill({response,body:swapped});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    if(down)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
    const bodies={'/aion2/character':{info:lv45Info,equipment:lv45Equipment},'/aion2/item':lv45Items[url.searchParams.get('slotPos')]??{}};
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta})});
  });
  await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net|mein-mmo\.de/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  if(roster)await context.addInitScript(value=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('aetherium.roster.v2',value);sessionStorage.setItem('seeded','1');}},roster);
  if(memory)await context.addInitScript(value=>{if(!localStorage.getItem('aetherium.memory.v1'))localStorage.setItem('aetherium.memory.v1',value);},memory);
  if(blockStorage)await context.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('blocked');};Storage.prototype.getItem=()=>{throw new Error('blocked');};});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const started=Date.now();
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,errors,readyMs:Date.now()-started};
}
const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();

// Every Aetherium page on disk, for the ribbon and drawer checks.
async function htmlPages(dir){
  const out=[];
  for(const name of await readdir(dir)){
    const path=join(dir,name);
    if((await stat(path)).isDirectory())out.push(...await htmlPages(path));
    else if(name==='index.html')out.push(path);
  }
  return out;
}
const allPages=(await htmlPages(resolve(root,'hub/aetherium'))).map(path=>`/${relative(root,path).split(sep).join('/').replace(/index\.html$/,'')}`);

await check('shell contract: the photo band, the side menu with this page lit, no breadcrumb or section pills, on every Guide page',async()=>{
  const {page,context,errors,calls}=await open('/hub/aetherium/guide/');
  assert.deepEqual(errors,[]);
  assert.deepEqual(calls,[],'The home never calls the official site');
  assert.equal(await page.locator('.ae-gd[data-guide-shell="home"]').count(),1,'One Guide');
  assert.equal(await plain(page,'#aeScreenTitle'),'Know where to look.');
  assert.equal(await page.$eval('#aeScreenTitle',el=>el.tagName),'H1');
  assert.equal(await plain(page,'.ae-gd-kicker'),'AION 2 Guide');
  assert.equal(await page.$eval('.ae-gd-kicker',el=>getComputedStyle(el).color),GOLD,'The kicker is gold');
  const hero=await page.$eval('.ae-gd-hero-img',img=>({src:img.getAttribute('src'),alt:img.alt,w:img.getAttribute('width'),h:img.getAttribute('height'),loading:img.getAttribute('loading'),priority:img.getAttribute('fetchpriority'),fit:getComputedStyle(img).objectFit,focus:getComputedStyle(img).objectPosition}));
  assert.equal(hero.focus,'50% 70%','The home band focus sits low so the floating rock and the sea show');
  assert.equal(hero.src,'/astrix-app/pages/aetherium/images/photos/golden-sea-01.jpg','The home band is the golden sea');
  assert.ok(hero.alt.length>10&&hero.w==='2560'&&hero.h==='1440','The band photo has alt, width and height');
  assert.deepEqual([hero.loading,hero.priority,hero.fit],['eager','high','cover']);
  assert.equal(await page.locator('.ae-gd-side').count(),0,'The home has no side menu');
  // Gone: the window bar, the breadcrumb, the corner label, the section pill row.
  assert.equal(await page.locator('.ae-gw-bar,.ae-gw-back,.ae-gw-who,.ae-gd-crumbs,.ae-gd-nav').count(),0,'No title bar, breadcrumb, corner label or pill row');
  // The module API the sections use.
  const api=await page.evaluate(async()=>{const shell=await import('/astrix-app/pages/aetherium/guide-shell.mjs');const advisor=await import('/astrix-app/games/aion2/engine/ascent-advisor.mjs');
    return {exports:Object.keys(shell).sort(),classes:[...shell.GUIDE_CLASSES],advisor:[...advisor.AION2_CLASSES],href:shell.guideHref('world'),cls:shell.classHref('Spiritmaster'),sections:shell.GUIDE_SECTIONS.map(item=>[item.id,item.label,item.href]),heroes:shell.GUIDE_SECTIONS.map(item=>item.hero.src.split('/').pop())};});
  for(const name of ['GUIDE_CLASSES','GUIDE_ROOT','GUIDE_SECTIONS','TOPIC_ICONS','classHref','comingSoonHtml','guideHref','overviewHtml','renderGuideShell','startGuidePage'])assert.ok(api.exports.includes(name),`guide-shell exports ${name}`);
  assert.deepEqual(api.classes,api.advisor,'GUIDE_CLASSES matches the advisor class list');
  assert.deepEqual(api.sections,SECTIONS,'Eight sections in order, each with its page');
  assert.deepEqual(api.heroes,['golden-sea-01.jpg',...Array(7).fill('atreia-vista-01.jpg')],'Home has the golden sea, every section the vista');
  assert.equal(api.href,'/hub/aetherium/guide/world/');
  assert.equal(api.cls,'/hub/aetherium/guide/classes/spiritmaster/');
  await context.close();
  for(const [id,label,href] of SECTIONS.slice(1)){
    const {page,context,errors}=await open(href);
    assert.deepEqual(errors,[],`${href}: no page errors`);
    assert.equal(await plain(page,'.ae-gd-kicker'),label,`${href}: section kicker`);
    assert.equal(await page.getAttribute('.ae-gd-hero-img','src'),'/astrix-app/pages/aetherium/images/photos/atreia-vista-01.jpg');
    assert.equal(await page.locator('.ae-gd-crumbs,.ae-gd-nav,.ae-gw-bar,.ae-gg-sub,.ae-gx-topicnav').count(),0,`${href}: one menu only`);
    assert.equal(await page.getAttribute('.ae-gd-side-home','href'),'/hub/aetherium/guide/','Guide home tops the side menu');
    const lit=await page.$$eval('.ae-gd-side a[aria-current="page"]',links=>links.map(a=>({href:a.getAttribute('href'),color:getComputedStyle(a).color,edge:getComputedStyle(a).borderLeftColor})));
    assert.deepEqual(lit.map(link=>link.href),[href],`${href}: this page lit in the side menu`);
    assert.equal(lit[0].color,GOLD,`${href}: lit page in gold`);
    assert.equal(lit[0].edge,GOLD,`${href}: lit page has a gold edge`);
    const more=await page.$$eval('[data-guide-side-more] a',links=>links.map(a=>a.dataset.guideSection));
    assert.deepEqual(more,SECTIONS.slice(1).map(([key])=>key).filter(key=>key!==id),`${href}: the other sections under More`);
    if(SOON.includes(id)){
      assert.equal(await page.locator(`[data-guide-soon="${id}"]`).count(),1,`${href}: coming soon page`);
      assert.match(await plain(page,'[data-guide-soon]'),/Coming soon in this guide/);
    }
    await context.close();
  }
  // Exactly one side menu item is lit (aria-current="page", gold) on every Guide page with a side menu, and hovering another
  // item never turns it gold: only the current page is ever lit.
  const guidePages=allPages.filter(path=>path.startsWith('/hub/aetherium/guide/')&&path!=='/hub/aetherium/guide/');
  assert.ok(guidePages.length>=40,`${guidePages.length} Guide sub pages`);
  for(const path of guidePages){
    const {page,context}=await open(path);
    const side=await page.$$eval('.ae-gd-side a',links=>links.map(a=>({href:a.getAttribute('href'),current:a.getAttribute('aria-current'),color:getComputedStyle(a).color})));
    const lit=side.filter(link=>link.current==='page');
    assert.equal(lit.length,1,`${path}: exactly one item has aria-current="page" (${lit.map(link=>link.href)})`);
    assert.equal(new URL(lit[0].href,base).pathname,path,`${path}: the lit item is this page`);
    assert.deepEqual(side.filter(link=>link.color===GOLD).map(link=>link.href),[lit[0].href],`${path}: only the lit item is gold`);
    if(path==='/hub/aetherium/guide/general/about/'){
      await page.hover('.ae-gd-side a[href$="/general/market/"]');
      assert.notEqual(await page.$eval('.ae-gd-side a[href$="/general/market/"]',a=>getComputedStyle(a).color),GOLD,'Hover never lights an item gold');
      const back=await page.$$eval('.ae-gd-side a[aria-current="page"]',links=>links.length);
      assert.equal(back,1,'Still one lit item while hovering another');
    }
    await context.close();
  }
  // A page's own list moves into the side menu, this page lit (General pages, Equipment topics).
  for(const [path,first,current] of [['/hub/aetherium/guide/general/about/','Overview','About AION 2'],['/hub/aetherium/guide/equipment/enhancement/','Overview','Enhancement']]){
    const {page,context,errors}=await open(path);
    assert.deepEqual(errors,[],`${path}: no page errors`);
    const items=await page.$$eval('[data-guide-side-pages] a',links=>links.map(a=>({text:a.textContent.trim(),current:a.getAttribute('aria-current')})));
    assert.equal(items[0].text,first,`${path}: Overview first`);
    assert.deepEqual(items.filter(item=>item.current==='page').map(item=>item.text),[current],`${path}: ${current} lit`);
    assert.ok(items.length>=4,`${path}: the section's pages`);
    await context.close();
  }
});

await check('the Guide link sits in the ribbon and the menu drawer of every Aetherium page, lit only on Guide pages',async()=>{
  assert.ok(allPages.length>=31,`${allPages.length} Aetherium pages`);
  const cssKeys=new Set();
  for(const path of allPages){
    const html=await readFile(resolve(root,`.${path}index.html`),'utf8');
    const ribbon=html.match(/<nav class="apx-destination-ribbon"[\s\S]*?<\/nav>/)[0];
    const drawer=html.match(/<ul class="ax-drawer-links">[\s\S]*?<\/ul>/)[0];
    for(const [where,block] of [['ribbon',ribbon],['drawer',drawer]]){
      const links=[...block.matchAll(/<a href="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)].map(m=>({href:m[1],current:Boolean(m[2]),text:m[3]}));
      assert.deepEqual(links.map(link=>link.text),['Daeva Card','Gear Ledger','Ascent Plan','Guide','The Hub'],`${path} ${where}`);
      assert.equal(links[3].href,'/hub/aetherium/guide/',`${path} ${where}: Guide link`);
      assert.equal(links[3].current,path.startsWith('/hub/aetherium/guide/'),`${path} ${where}: Guide lit only on Guide pages`);
    }
    // One aetherium.css key on every page, newer than the key before the Guide (20261017-8), so a later bump keeps passing.
    const key=html.match(/aetherium\.css\?v=([^"&]+)/)?.[1];
    assert.ok(key&&key>'20261017-8',`${path}: aetherium.css key bumped (${key})`);
    cssKeys.add(key);
  }
  assert.equal(cssKeys.size,1,`one aetherium.css key on every page (${[...cssKeys].join(', ')})`);
  const {page,context}=await open('/hub/aetherium/guide/classes/',{viewport:{width:390,height:844}});
  await page.click('#aeMenu');
  await page.waitForSelector('#aeDrawer.is-open');
  assert.equal(await page.locator('.ax-drawer-links a[aria-current="page"]').textContent(),'Guide');
  assert.deepEqual(await page.$$eval('[data-forge-destination-ribbon] a',links=>links.filter(a=>a.getAttribute('aria-current')==='page').map(a=>a.textContent)),['Guide']);
  await context.close();
});

await check('home: the band and its buttons, a tile per section, the path strip, no example panel without a screenshot, every link reaches a page',async()=>{
  const {page,context}=await open('/hub/aetherium/guide/');
  assert.match(await plain(page,'.ae-gd-hero .ae-gd-lede'),/AION 2 Guide by ASTRIX PARADOX/);
  const ctas=await page.$$eval('.ae-gd-actions a',links=>links.map(a=>({href:a.getAttribute('href'),text:a.textContent,bg:getComputedStyle(a).backgroundColor,color:getComputedStyle(a).color,h:a.getBoundingClientRect().height})));
  assert.deepEqual(ctas.map(cta=>cta.text),['Start with About AION 2','Open your Daeva Card']);
  assert.equal(ctas[0].href,'/hub/aetherium/guide/general/about/');
  assert.equal(ctas[0].bg,'rgb(233, 194, 79)','The main action is solid gold');
  assert.equal(ctas[0].color,'rgb(31, 22, 4)','Dark label on gold');
  assert.equal(ctas[1].bg,'rgb(22, 32, 46)','The second action is a navy button');
  assert.ok(ctas.every(cta=>cta.h>=44),'Buttons at least 44px');
  assert.equal(await plain(page,'#aeGridTitle'),'Browse the guide');
  const tiles=await page.$$eval('[data-guide-tile]',items=>items.map(li=>{
    const img=li.querySelector('img.ae-gd-tile-icon'),name=li.querySelector('.ae-gd-tile-name'),box=li.getBoundingClientRect(),icon=img?.getBoundingClientRect();
    return {id:li.dataset.guideTile,href:li.querySelector('.ae-gd-tile-head').getAttribute('href'),svg:li.querySelectorAll('svg').length,band:li.querySelectorAll('.ae-gd-tile-art').length,
      src:img?.getAttribute('src'),alt:img?.getAttribute('alt'),w:img?.getAttribute('width'),h:img?.getAttribute('height'),loading:img?.getAttribute('loading'),
      iconW:icon?.width,iconCentre:icon?Math.abs((icon.left+icon.width/2)-(box.left+box.width/2)):null,iconTop:icon?icon.top-box.top:null,
      nameAlign:getComputedStyle(name).textAlign,nameSize:getComputedStyle(name).fontSize,hairline:`${getComputedStyle(name).borderBottomWidth} ${getComputedStyle(name).borderBottomColor}`,
      border:getComputedStyle(li).borderTopWidth,height:Math.round(box.height),top:Math.round(box.top)};
  }));
  assert.deepEqual(tiles.map(tile=>[tile.id,tile.href]),SECTIONS.slice(1).map(([id,,href])=>[id,href]),'A tile per section, in nav order');
  for(const tile of tiles){
    assert.equal(tile.svg+tile.band,0,`${tile.id}: no drawn icon and no icon band`);
    assert.equal(tile.src,`/astrix-app/pages/aetherium/images/section-icons/${tile.id}.png`,`${tile.id}: its own section icon`);
    assert.deepEqual([tile.alt,tile.w,tile.h,tile.loading],['','120','120','lazy'],`${tile.id}: empty alt, width, height, lazy`);
    assert.equal(tile.iconW,120,`${tile.id}: icon 120px on desktop`);
    assert.ok(tile.iconCentre<=1&&tile.iconTop<=40,`${tile.id}: icon centred at the top`);
    assert.equal(tile.nameAlign,'center',`${tile.id}: title centred`);
    assert.equal(tile.nameSize,'28px',`${tile.id}: tile title 28px`);
    assert.equal(tile.hairline,'1px rgba(217, 210, 192, 0.35)',`${tile.id}: ivory hairline under the title`);
  }
  for(const top of new Set(tiles.map(tile=>tile.top)))assert.equal(new Set(tiles.filter(tile=>tile.top===top).map(tile=>tile.height)).size,1,'Tiles in a row are the same height');
  assert.ok(tiles.every(tile=>tile.border==='1px'),'Tiles are bordered cards');
  // Hover: the icon grows to 1.05 with a brighter glow and the title turns gold; reduced motion keeps the icon still.
  await page.hover('[data-guide-tile="world"] .ae-gd-tile-head');
  await page.waitForTimeout(300);
  const hovered=await page.$eval('[data-guide-tile="world"]',li=>({transform:getComputedStyle(li.querySelector('.ae-gd-tile-icon')).transform,filter:getComputedStyle(li.querySelector('.ae-gd-tile-icon')).filter,color:getComputedStyle(li.querySelector('.ae-gd-tile-head')).color}));
  assert.equal(hovered.transform,'matrix(1.05, 0, 0, 1.05, 0, 0)','Icon scales to 1.05 on hover');
  assert.match(hovered.filter,/18px/,'Brighter glow on hover');
  assert.equal(hovered.color,GOLD,'Tile title gold on hover');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.$eval('[data-guide-tile="world"] .ae-gd-tile-icon',img=>getComputedStyle(img).transform),'none','No movement with reduced motion');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.mouse.move(0,0);
  for(const width of [1600,1280]){
    await page.setViewportSize({width,height:1000});
    const rows=await page.$$eval('[data-guide-tile]',items=>items.map(li=>Math.round(li.getBoundingClientRect().top)));
    assert.deepEqual([...new Set(rows)].map(top=>rows.filter(row=>row===top).length),[4,3],`At ${width} the seven tiles sit 4 then 3`);
  }
  await page.setViewportSize({width:1600,height:1000});
  assert.doesNotMatch(await plain(page,'.ae-gd'),/Every fact comes from/,'No sources line on the home');
  assert.equal(await page.locator('.ae-gd-soon-tag').count(),0,'No status tags on the home');
  assert.equal(await page.getAttribute('[data-guide-tile="character"] .ae-gd-topics a','href'),'/hub/aetherium/guide/classes/','Classes topic links to its page');
  assert.equal(await page.locator('.ae-gd-example').count(),0,'No example panel until a real screenshot is set');
  assert.equal(await plain(page,'#aeStartTitle'),'New to AION 2? Go in this order');
  const steps=await page.$$eval('[data-guide-start]',links=>links.map(a=>({href:a.getAttribute('href'),text:a.querySelector('strong').textContent})));
  assert.deepEqual(steps,[{href:'/hub/aetherium/guide/general/about/',text:'About AION 2'},{href:'/hub/aetherium/guide/general/controls/',text:'Controls and the skill bar'},{href:'/hub/aetherium/guide/equipment/enhancement/',text:'Enhancement'},{href:'/hub/aetherium/guide/character/',text:'Daevanion'}]);
  // Every heading of a section opens with a gold diamond.
  assert.equal(await page.$eval('#aeGridTitle',el=>getComputedStyle(el,'::before').backgroundColor),GOLD);
  // The only way out is the official AION 2 site, in a new tab.
  const out=await page.$$eval('a[href^="http"]',links=>links.map(a=>({href:a.href,target:a.target,rel:a.rel})));
  assert.ok(out.length>=1&&out.every(link=>/^https:\/\/aion2\.plaync\.com\//.test(link.href)&&link.target==='_blank'&&/noopener/.test(link.rel)&&/noreferrer/.test(link.rel)),'Only the official site links out');
  // Every link on the home that stays on this site answers 200.
  const hrefs=[...new Set(await page.$$eval('#aeStage a[href^="/"]',links=>links.map(a=>a.getAttribute('href').split('#')[0])))];
  for(const href of hrefs){const response=await fetch(`${base}${href}`);assert.equal(response.status,200,`${href} answers`);}
  await context.close();
});

await check('class roles table: 8 rows in game order, class names gold, ratings bold, each cell from the data, no status tags or footnotes on screen',async()=>{
  const {page,context,errors,calls}=await open('/hub/aetherium/guide/classes/');
  assert.deepEqual(errors,[]);
  assert.deepEqual(calls,[],'The Classes page never calls the official site');
  assert.deepEqual(await page.$$eval('[data-roles-table] thead th',ths=>ths.map(th=>th.textContent)),['Class','Tank','Healer','Support','DPS']);
  assert.deepEqual(await page.$$eval('[data-roles-table] tbody tr',rows=>rows.map(tr=>tr.dataset.class)),CLASSES);
  for(const name of CLASSES){
    const link=await page.$eval(`[data-roles-table] tr[data-class="${name}"] th a`,a=>({href:a.getAttribute('href'),color:getComputedStyle(a).color}));
    assert.equal(link.color,GOLD,`${name} in gold`);
    assert.equal(link.href,`/hub/aetherium/guide/classes/${name.toLowerCase()}/`);
    const record=ratings.records.find(item=>item.class===name);
    for(const role of ROLES){
      const build=builds[name].find(item=>item.role===role);
      const ours=!build?'-':build.main?'Main role':build.status==='pending'?'Pending':'Can play';
      const cell=await page.$eval(`[data-roles-table] tr[data-class="${name}"] td[data-role="${role}"]`,td=>({kind:td.dataset.kind,ours:td.dataset.ours,text:td.textContent.replace(/\s+/g,' ').trim(),bold:Number(getComputedStyle(td.querySelector('.ae-gd-rating')??td).fontWeight),ref:td.querySelector('.ae-gd-ref')?.getAttribute('href')??null}));
      assert.equal(cell.ours,ours,`${name} ${role}: our build value`);
      const rated=record?.ratings?.[role];
      if(rated&&!rated.pending){
        assert.equal(cell.kind,'reported',`${name} ${role}: a cited rating`);
        assert.ok(cell.text.startsWith(rated.rating),`${name} ${role}: ${cell.text}`);
        assert.doesNotMatch(cell.text,/Reported|\[\d\]/);
        assert.ok(cell.bold>=700,`${name} ${role}: bold`);
      } else {
        assert.equal(cell.kind,ours==='-'?'none':'data',`${name} ${role}: our data`);
        if(ours!=='-'){assert.equal(cell.text,ours);assert.ok(cell.bold>=700,`${name} ${role}: bold`);}
      }
    }
  }
  // Every rating in the data is a source's own tier, tagged and cited; no rating without a source.
  for(const record of ratings.records)for(const [role,rated] of Object.entries(record.ratings))if(!rated.pending){
    assert.equal(rated.status,'reported');
    assert.ok(record.provenance.some(source=>source.ref===rated.ref&&/^https:\/\//.test(source.url)),`${record.class} ${role} cited`);
  }
  // Gallery, suggestions, choosing.
  const cards=await page.$$eval('[data-class-gallery] a',links=>links.map(a=>({cls:a.dataset.class,href:a.getAttribute('href'),art:a.querySelector('img')?.src??'',tagline:a.querySelector('.ae-gd-tagline').textContent})));
  assert.deepEqual(cards.map(card=>card.cls),CLASSES);
  for(const card of cards){
    assert.match(card.art,/^https:\/\/assets\.playnccdn\.com\/static-aion2\/characters\/img\/daevanion\/board_icon_start_/,`${card.cls}: the game's own class art`);
    const main=builds[card.cls].find(build=>build.main);
    assert.ok(main.summary.startsWith(card.tagline.replace(/\.$/,'')),`${card.cls}: tagline from the build record`);
  }
  assert.deepEqual(await page.$$eval('[data-suggest-role]',items=>items.map(li=>li.dataset.suggestRole)),ROLES);
  assert.match(await plain(page,'[data-suggest-role="tank"]'),/Main role for Templar\. Also played by Gladiator\./);
  assert.match(await plain(page,'[data-suggest-role="support"]'),/Main role for Chanter\./);
  assert.match(await plain(page,'#aeChooseTitle'),/Choosing a class/);
  await context.close();
});

await check('the 8 class pages: overview, its roles row, every build by role with key skills, stat order and Ascent Plan links',async()=>{
  for(const name of CLASSES){
    const slug=name.toLowerCase();
    const {page,context,errors,calls}=await open(`/hub/aetherium/guide/classes/${slug}/`);
    assert.deepEqual(errors,[],`${name}: no page errors`);
    assert.deepEqual(calls,[],`${name}: no Daeva linked, no call to the official site`);
    assert.equal(await plain(page,'#aeScreenTitle'),name);
    assert.equal(await plain(page,'.ae-gd-kicker'),'Character');
    assert.deepEqual(await page.$$eval('[data-guide-side-pages] a',links=>links.map(a=>[a.textContent,a.getAttribute('aria-current')])),[['Overview',null],['Classes',null],[name,'page']],`${name}: lit in the side menu`);
    assert.deepEqual(await page.$$eval('[data-roles-table] tbody tr',rows=>rows.map(tr=>tr.dataset.class)),[name],`${name}: its own row`);
    const records=builds[name];
    const shown=await page.$$eval('[data-build]',items=>items.map(el=>el.dataset.build));
    assert.deepEqual([...shown].sort(),records.map(build=>build.id).sort(),`${name}: every build`);
    assert.equal(shown[0],records.find(build=>build.main).id,`${name}: the main build first`);
    for(const build of records){
      const card=`[data-build="${build.id}"]`;
      assert.match(await plain(page,`${card} h3`),new RegExp(build.label.replace(/[()]/g,'\\$&')));
      if(build.beginner)assert.match(await plain(page,`${card} [data-beginner]`),/New player friendly/i);
      assert.deepEqual(await page.$$eval(`${card} [data-skill]`,items=>items.map(li=>li.dataset.skill)),[...build.coreSkills].sort((a,b)=>a.priority-b.priority).map(skill=>skill.name),`${build.id}: key skills in priority order`);
      if(build.stats&&!build.stats.pending&&build.stats.order?.length)assert.deepEqual(await page.$$eval(`${card} .ae-gd-stats:first-of-type li`,items=>items.map(li=>li.textContent)),build.stats.order,`${build.id}: stat order`);
      const links=await page.$$eval(`${card} [data-ascent]`,items=>items.map(a=>[a.dataset.ascent,a.getAttribute('href')]));
      assert.deepEqual(links.map(link=>link[0]),['mastery','skill-bar','stigma','daevanion','macro','stats']);
      for(const [screen,href] of links)assert.equal(href,`/hub/aetherium/ascent/${screen}/?class=${slug}&role=${build.role}`,`${build.id}: ${screen} by hand`);
    }
    assert.equal(await page.getAttribute('#aeSetup','data-setup'),'none','No Daeva: the way to link one');
    await context.close();
  }
});

await check('your setup vs the build: flags with what they cost, the read\'s age, saved on the device, never a block',async()=>{
  const {page,context,calls,errors}=await open('/hub/aetherium/guide/classes/gladiator/',{roster:rosterWith(LV45)});
  await page.waitForFunction(()=>['flags','clear'].includes(document.querySelector('#aeSetup')?.dataset.setup),null,{timeout:15000});
  assert.deepEqual(errors,[]);
  assert.ok(calls.includes('/aion2/character'),'The linked Daeva is read through the Worker (mocked)');
  assert.equal(await page.getAttribute('#aeSetup','data-setup'),'flags');
  assert.match(await plain(page,'#aeSetup'),/GUIDEDAEVA, Gladiator Lv 45, against the DPS: Greatsword bruiser DPS build/);
  assert.match(await plain(page,'[data-setup-source]'),/^Read from the official AION 2 site/,'The read shows its age');
  const flags=await page.$$eval('.ae-gd-flags li',items=>items.map(li=>({kind:li.dataset.flag,title:li.querySelector('b').textContent,cost:li.querySelector('span').textContent})));
  assert.ok(flags.some(flag=>flag.kind==='stigma'),'A stigma flag');
  assert.ok(flags.some(flag=>flag.kind==='gear'&&/Replace it/.test(flag.title)),'Epic gear flagged to replace');
  assert.ok(flags.every(flag=>flag.cost.length>10),'Every flag says what it costs');
  assert.match(await plain(page,'#aeSetup'),/This is a guide: play your way/);
  assert.equal(await page.locator('#aeSetup :disabled,#aeSetup [aria-disabled="true"]').count(),0,'Nothing is blocked');
  assert.equal(await page.getAttribute('#aeSetup a.ae-btn','href'),`/hub/aetherium/ascent/?serverId=1317&characterId=${encodeURIComponent(LV45.characterId)}&region=eu&class=gladiator&role=dps`);
  // The build's Ascent Plan links now open this Daeva's own plan.
  assert.match(await page.getAttribute('[data-build="gladiator-dps"] [data-ascent="stigma"]','href'),/^\/hub\/aetherium\/ascent\/stigma\/\?serverId=1317&/);
  const memory=await page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.memory.v1')));
  const record=memory.daevas[`1317:${LV45.characterId}`];
  assert.equal(record.guide.className,'Gladiator');
  assert.equal(record.guide.flags,flags.length);
  assert.ok(Number.isFinite(Date.parse(record.savedAt)),'savedAt stamped');
  // The next visit names the last check and its age.
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#aeSetup')?.dataset.setup==='flags',null,{timeout:15000});
  assert.match(await plain(page,'#aeSetup'),/Last check on this device: \d+ differences? \(saved just now\)/);
  if(process.env.AE_SHOTS){
    await page.screenshot({path:`${process.env.AE_SHOTS}/guide-setup-1600.png`,fullPage:true});
    const phone=await open('/hub/aetherium/guide/classes/gladiator/',{roster:rosterWith(LV45),viewport:{width:390,height:844}});
    await phone.page.waitForFunction(()=>document.querySelector('#aeSetup')?.dataset.setup==='flags',null,{timeout:15000});
    await phone.page.screenshot({path:`${process.env.AE_SHOTS}/guide-setup-390.png`,fullPage:true});
    await phone.context.close();
  }
  await context.close();
  // Another class's page: nothing to compare, the way to the Daeva's own class.
  const other=await open('/hub/aetherium/guide/classes/templar/',{roster:rosterWith(LV45)});
  assert.equal(await other.page.getAttribute('#aeSetup','data-setup'),'other-class');
  assert.equal(await other.page.getAttribute('#aeSetup a.ae-btn','href'),'/hub/aetherium/guide/classes/gladiator/');
  assert.deepEqual(other.calls,[],'No read for another class');
  await other.context.close();
});

await check('Worker down: the setup check says so, offers Try again and keeps the last saved check with its age',async()=>{
  const saved=JSON.stringify({v:1,daevas:{[`1317:${LV45.characterId}`]:{guide:{className:'Gladiator',role:'dps',flags:4},savedAt:new Date(Date.now()-2*86400000).toISOString()}}});
  const {page,context}=await open('/hub/aetherium/guide/classes/gladiator/',{roster:rosterWith(LV45),down:true,memory:saved});
  await page.waitForFunction(()=>document.querySelector('#aeSetup')?.dataset.setup==='down',null,{timeout:15000});
  assert.match(await plain(page,'#aeSetup'),/not answering/);
  assert.match(await plain(page,'[data-setup-memory]'),/Last check on this device \(saved 2 days ago\): 4 differences from the DPS build/);
  assert.equal(await page.locator('[data-setup-retry]').count(),1);
  assert.match(await plain(page,'#aeBuildsTitle'),/Builds by role/,'The build still shows');
  await context.close();
});

await check('memory helper: per Daeva key, savedAt, merge, age words, blocked storage is never an error',async()=>{
  const {page,context}=await open('/hub/aetherium/guide/');
  const result=await page.evaluate(async()=>{
    const m=await import('/astrix-app/pages/aetherium/aetherium-memory.mjs');
    const ref={serverId:1308,characterId:'abc%3D'};
    const first=m.setMemory(ref,{a:1});
    const second=m.setMemory(ref,{b:2});
    return {key:m.memoryKey(ref),first,second,got:m.getMemory(ref),none:m.getMemory({serverId:1,characterId:'x'}),noRef:m.setMemory(null,{a:1}),age:m.memoryAge({savedAt:new Date(Date.now()-3*3600000).toISOString()}),badAge:m.memoryAge({}),raw:JSON.parse(localStorage.getItem(m.MEMORY_KEY))};
  });
  assert.equal(result.key,'1308:abc=','Key is serverId:characterId, the id decoded');
  assert.deepEqual({a:result.second.a,b:result.second.b},{a:1,b:2},'Writes merge');
  assert.ok(Number.isFinite(Date.parse(result.second.savedAt)));
  assert.deepEqual(result.got,result.second);
  assert.equal(result.none,null);
  assert.equal(result.noRef,null);
  assert.equal(result.age,'saved 3 hours ago');
  assert.equal(result.badAge,null);
  assert.equal(result.raw.v,1);
  await context.close();
  const blocked=await open('/hub/aetherium/guide/classes/gladiator/',{blockStorage:true});
  assert.deepEqual(blocked.errors,[],'Blocked storage: no page error');
  const out=await blocked.page.evaluate(async()=>{const m=await import('/astrix-app/pages/aetherium/aetherium-memory.mjs');return {set:m.setMemory({serverId:1,characterId:'x'},{a:1}),get:m.getMemory({serverId:1,characterId:'x'}),linked:m.linkedDaeva()};});
  assert.deepEqual(out,{set:null,get:null,linked:null});
  assert.equal(await blocked.page.getAttribute('#aeSetup','data-setup'),'none');
  await blocked.context.close();
});

const LAYOUT=['/hub/aetherium/guide/','/hub/aetherium/guide/classes/','/hub/aetherium/guide/classes/chanter/','/hub/aetherium/guide/world/','/hub/aetherium/guide/character/','/hub/aetherium/guide/general/about/'];
for(const [width,height] of [[390,844],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, every button at least 44px tall, the side menu in place, usable well inside 4 s`,async()=>{
    for(const path of LAYOUT){
      const {page,context,readyMs}=await open(path,{viewport:{width,height}});
      assert.ok(readyMs<4000,`${path}: usable in ${readyMs}ms`);
      const box=await page.evaluate(()=>{
        const rect=el=>el?.getBoundingClientRect()??null;
        const side=document.querySelector('.ae-gd-side'),body=document.querySelector('#aeGuideBody'),hero=document.querySelector('.ae-gd-hero'),h1=document.querySelector('#aeScreenTitle');
        return {scroll:document.documentElement.scrollWidth-innerWidth,
          buttons:[...document.querySelectorAll('#aeStage :is(.ae-btn,.ae-gd-btn)')].filter(el=>el.offsetParent).map(el=>({text:el.textContent.trim().slice(0,30),h:el.getBoundingClientRect().height})),
          hero:{w:rect(hero).width,h:rect(hero).height,h1:parseFloat(getComputedStyle(h1).fontSize)},
          side:side?{right:rect(side).right,top:rect(side).top,listShown:getComputedStyle(side.querySelector('.ae-gd-side-list')).display!=='none',toggleShown:getComputedStyle(side.querySelector('.ae-gd-side-toggle')).display!=='none',position:getComputedStyle(side).position}:null,
          body:{left:rect(body).left,right:rect(body).right,top:rect(body).top}};
      });
      assert.ok(box.scroll<=0,`${path}: ${box.scroll}px sideways scroll`);
      for(const button of box.buttons)assert.ok(button.h>=44,`${path}: "${button.text}" is ${button.h}px tall`);
      assert.ok(Math.abs(box.hero.w-width)<=1,`${path}: the band runs full width (${box.hero.w})`);
      if(width===390){
        assert.ok(box.hero.h>=340&&box.hero.h<=560,`${path}: band about 360px tall on a phone (${box.hero.h})`);
        assert.equal(box.hero.h1,42,`${path}: H1 42px on a phone`);
      } else assert.ok([60,64].includes(box.hero.h1),`${path}: H1 ${box.hero.h1}px`);
      if(box.side){
        if(width===390){
          assert.ok(box.side.toggleShown&&!box.side.listShown,`${path}: the menu folds behind "In this section"`);
          assert.equal(box.side.position,'static','The toggle is neither sticky nor fixed');
          assert.ok(box.side.top<box.body.top,'The toggle sits above the page');
          await page.click('.ae-gd-side-toggle');
          assert.equal(await page.getAttribute('.ae-gd-side-toggle','aria-expanded'),'true');
          assert.ok(await page.$eval('.ae-gd-side-list',el=>getComputedStyle(el).display!=='none'),`${path}: the toggle opens the menu`);
        } else {
          assert.ok(!box.side.toggleShown&&box.side.listShown,`${path}: the menu shows on the left`);
          assert.ok(box.side.right<=box.body.left,`${path}: the menu sits left of the page`);
          assert.ok(box.body.right-box.body.left>=700,`${path}: the page runs wide (${box.body.right-box.body.left}px)`);
        }
      }
      if(process.env.AE_SHOTS)await page.screenshot({path:`${process.env.AE_SHOTS}/guide-${path.replace(/\W+/g,'-')}-${width}.png`,fullPage:true});
      await context.close();
    }
  });
}

// The type scale: every heading of one level is the same size on every Guide page, the title face only at 24px and up.
const SCALE_PAGES=['/hub/aetherium/guide/','/hub/aetherium/guide/general/about/','/hub/aetherium/guide/general/faq/','/hub/aetherium/guide/classes/chanter/','/hub/aetherium/guide/equipment/manastones/','/hub/aetherium/guide/dungeons/','/hub/aetherium/guide/path/','/hub/aetherium/guide/world/'];
for(const [width,scale] of [[1600,{h1:64,section:40,card:28}],[390,{h1:42,section:30,card:24}]]){
  await check(`type scale at ${width}: H1 ${scale.h1}, section ${scale.section}, card ${scale.card}, sub 18, body 17, labels readable`,async()=>{
    for(const path of SCALE_PAGES){
      const {page,context}=await open(path,{viewport:{width,height:900}});
      const found=await page.evaluate(()=>{
        const read=el=>{const s=getComputedStyle(el);return {text:el.textContent.trim().slice(0,30),size:parseFloat(s.fontSize),family:s.fontFamily,weight:s.fontWeight,color:s.color,top:parseFloat(s.marginTop),diamond:getComputedStyle(el,'::before').content!=='none'&&getComputedStyle(el,'::before').backgroundColor};};
        const card=':is(.ae-gg-card>.ae-gg-h,.ae-gp-card h2)';
        return {
          h1:[...document.querySelectorAll('.ae-gd h1')].map(read),
          section:[...document.querySelectorAll('.ae-gd-body h2')].filter(h=>!h.matches(card)&&h.offsetParent).map(read),
          card:[...document.querySelectorAll(`.ae-gd :is(h3,.ae-gd-tile-name,${card})`)].filter(h=>!h.matches('.ae-gp-card h3')&&h.offsetParent).map(read),
          sub:[...document.querySelectorAll('.ae-gd-body :is(h4,.ae-gp-card h3)')].filter(h=>h.offsetParent).map(read),
          body:[...document.querySelectorAll('.ae-gd-body p:not([class])')].filter(p=>p.offsetParent).map(p=>({size:parseFloat(getComputedStyle(p).fontSize),lh:parseFloat(getComputedStyle(p).lineHeight)/parseFloat(getComputedStyle(p).fontSize),w:p.getBoundingClientRect().width,ch:parseFloat(getComputedStyle(p).fontSize)})),
          labels:[...document.querySelectorAll('.ae-gd-side-label')].map(read),
          titleFace:[...document.querySelectorAll('.ae-gd *')].filter(el=>el.offsetParent&&el.childElementCount===0&&el.textContent.trim()&&/fairy-tale/i.test(getComputedStyle(el).fontFamily)).map(read)
        };
      });
      assert.deepEqual(found.h1.map(h=>h.size),[scale.h1],`${path}: H1 ${scale.h1}px`);
      for(const h of found.section){
        assert.equal(h.size,scale.section,`${path}: section heading "${h.text}" ${h.size}px`);
        assert.match(h.family,/fairy-tale/i,`${path}: "${h.text}" in the title face`);
        assert.equal(h.diamond,GOLD,`${path}: "${h.text}" opens with a gold diamond`);
        assert.ok(h.top===40||h.top===0,`${path}: "${h.text}" has 40px above (or opens its box), got ${h.top}`);
      }
      for(const h of found.card)assert.equal(h.size,scale.card,`${path}: card title "${h.text}" ${h.size}px`);
      for(const h of found.sub){
        assert.equal(h.size,18,`${path}: sub heading "${h.text}" 18px`);
        assert.equal(h.weight,'600',`${path}: sub heading "${h.text}" weight 600`);
        assert.doesNotMatch(h.family,/fairy-tale/i,`${path}: sub heading "${h.text}" in the display face`);
      }
      for(const p of found.body){
        assert.equal(p.size,17,`${path}: body 17px`);
        assert.ok(Math.abs(p.lh-1.65)<0.01,`${path}: body line height 1.65`);
      }
      for(const label of found.labels){
        assert.equal(label.size,13,`${path}: side menu label "${label.text}" 13px`);
        assert.doesNotMatch(label.family,/fairy-tale/i,`${path}: side menu label in the display face`);
      }
      for(const el of found.titleFace)assert.ok(el.size>=24,`${path}: the title face only at 24px and up ("${el.text}" ${el.size}px)`);
      if(path==='/hub/aetherium/guide/'&&width===390)assert.equal(await page.$eval('.ae-gd-tile-icon',img=>img.getBoundingClientRect().width),96,'Tile icons 96px on a phone');
      await context.close();
// Section Overviews (design/aetherium-guide-overviews, 20 Oct 2026): one card style on every section's Overview, the whole
// card a link, the first card across both columns with a 96px icon, the rest 72px, icon on the left (on top on a phone), an
// ivory hairline and no notch, gold edge and cyan glow on hover. Icons are our PNGs or real CDN game icons, never drawn SVG.
const OVERVIEWS=[
  ['general','/hub/aetherium/guide/general/',['about','resets','market','controls','loadouts','faq'],{about:'art',resets:'art',market:'art',controls:'art',loadouts:'art',faq:'art'}],
  ['character','/hub/aetherium/guide/character/',['classes','stats','daevanion'],{classes:'art',stats:'art'}],
  ['skills','/hub/aetherium/guide/skills/',['by-class','mastery','specialty','skill-bar'],{'by-class':'game',mastery:'game',specialty:'game','skill-bar':'game'}],
  ['equipment','/hub/aetherium/guide/equipment/',['slots','enhancement','manastones','theostones','arcana','pets-wings','titles','where-to-get'],{slots:'game',manastones:'game','pets-wings':'game'}],
  ['crafting','/hub/aetherium/guide/crafting/',['professions','gathering','crafted-gear'],{}],
  ['world','/hub/aetherium/guide/world/',['zones','sealed','abyss','rift','events'],{}],
  ['guides','/hub/aetherium/guide/guides/',['path','dungeons','weekly'],{}]
];
for(const width of [1600,390]){
  await check(`section Overviews at ${width}: one card style, real icons, start card across both columns, no notch`,async()=>{
    for(const [section,path,ids,icons] of OVERVIEWS){
      const {page,context,errors}=await open(path,{viewport:{width,height:width===390?844:1000}});
      try{
        assert.deepEqual(errors,[],`${path}: no page errors`);
        assert.equal(await page.locator(`[data-guide-overview="${section}"]`).count(),1,`${path}: one Overview`);
        const report=await page.$eval(`[data-guide-overview="${section}"]`,list=>{
          const grid=list.getBoundingClientRect();
          return [...list.querySelectorAll(':scope > .ae-gd-ocard')].map(card=>{
            const link=card.querySelector(':scope > a.ae-gd-ocard-link');
            const icon=card.querySelector('.ae-gd-ocard-icon');
            const title=card.querySelector('.ae-gd-ocard-title');
            const style=getComputedStyle(link);
            const box=card.getBoundingClientRect(),iconBox=icon?.getBoundingClientRect(),titleBox=title.getBoundingClientRect();
            return {id:card.dataset.guideTopic,href:link?.getAttribute('href'),kids:card.children.length,start:card.classList.contains('is-start'),
              share:box.width/grid.width,clip:style.clipPath,edge:style.borderTopColor,bg:style.backgroundColor,
              icon:icon?(icon.classList.contains('is-art')?'art':'game'):null,iconSize:iconBox?Math.round(iconBox.width):0,
              iconLeft:iconBox?iconBox.right<=titleBox.left+1:null,iconAbove:iconBox?iconBox.bottom<=titleBox.top+1:null,
              src:icon?.querySelector('img')?.getAttribute('src')??null,svg:card.querySelectorAll('svg').length,
              titleSize:parseFloat(getComputedStyle(title).fontSize),titleFont:getComputedStyle(title).fontFamily,
              wide:box.right>document.documentElement.clientWidth+1};
          });
        });
        assert.deepEqual(report.map(card=>card.id),ids,`${path}: the topics in order, nothing unwritten`);
        for(const [index,card] of report.entries()){
          assert.equal(card.kids,1,`${card.id}: the whole card is one link`);
          assert.ok(card.href,`${card.id}: links somewhere`);
          assert.equal(card.start,index===0,`${card.id}: only the first card is start here`);
          assert.equal(card.clip,'none',`${card.id}: no notched corner`);
          assert.equal(card.edge,'rgba(217, 210, 192, 0.35)',`${card.id}: ivory hairline`);
          assert.equal(card.bg,'rgb(19, 28, 41)',`${card.id}: the Guide panel`);
          assert.equal(card.svg,0,`${card.id}: no drawn icon`);
          assert.equal(card.icon,icons[card.id]??null,`${card.id}: ${icons[card.id]??'no'} icon`);
          if(card.icon){
            assert.equal(card.iconSize,index===0?96:72,`${card.id}: icon size`);
            assert.ok(card.icon==='art'?card.src.startsWith('/astrix-app/pages/aetherium/images/'):card.src.startsWith('https://assets.playnccdn.com/static-aion2-gamedata/resources/'),`${card.id}: our PNG or a CDN game icon`);
            assert.ok(width===390?card.iconAbove:card.iconLeft,`${card.id}: icon ${width===390?'on top':'on the left'}`);
          }
          assert.equal(card.titleSize,width===390?24:28,`${card.id}: card title size`);
          assert.match(card.titleFont,/fairy-tale-jf/,`${card.id}: title face`);
          assert.ok(!card.wide,`${card.id}: inside the viewport`);
          if(width===1600)assert.ok(index===0?card.share>0.98:card.share<0.55,`${card.id}: ${index===0?'across both columns':'one column'}`);
          else assert.ok(card.share>0.98,`${card.id}: one column on a phone`);
        }
        if(width===1600){
          const link=page.locator(`[data-guide-overview="${section}"] .ae-gd-ocard-link`).nth(1);
          await link.hover();
          await page.waitForTimeout(260);
          const hover=await link.evaluate(node=>({edge:getComputedStyle(node).borderTopColor,glow:getComputedStyle(node).boxShadow}));
          assert.equal(hover.edge,GOLD,`${path}: gold edge on hover`);
          assert.match(hover.glow,/rgba\(95, 216, 234, 0\.25\)/,`${path}: soft cyan glow on hover`);
        }
        if(section==='character'){
          assert.equal(await page.getAttribute('[data-guide-topic="stats"] a','href'),'/hub/aetherium/ascent/stats/','Stats opens the Ascent Plan');
          assert.equal(await page.getAttribute('[data-guide-topic="daevanion"] a','href'),'/hub/aetherium/ascent/daevanion/','Daevanion opens the Ascent Plan');
          assert.ok(!/Coming soon/i.test(await page.textContent('#aeGuideBody')),'No coming soon cards');
        }
        assert.ok(!/[–—]/.test(await page.textContent('#aeGuideBody')),`${path}: no en or em dash`);
      }finally{await context.close();}
    }
  });
}

await check('never the real Worker or NCSOFT',async()=>{assert.deepEqual(realCalls,[]);});

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_GUIDE=FAIL ${failures}`);process.exit(1);}
console.log('AETHERIUM_GUIDE=PASS');
