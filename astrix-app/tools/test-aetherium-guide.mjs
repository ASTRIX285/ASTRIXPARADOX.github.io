#!/usr/bin/env node
// The AION 2 Guide, phase 1 (feature/aetherium-guide-home, 18 Oct 2026) on a local static server, the Worker mocked from
// the fixtures (never NCSOFT, never the real Worker):
//   - the shell contract the sections build on: photo band (kicker, H1, lede), side menu (Guide home, this section's pages with
//     this one lit, the other sections under More), no breadcrumb or section pill row, coming soon pages;
//   - the Guide link in the ribbon and the menu drawer of every Aetherium page;
//   - the home: photo band with its gold and navy buttons, a tile per section, the path strip, every link reaches a page;
//   - the class roles table: 8 rows, class names gold, ratings bold, each cell from the data (a Reported tier cited, else our build);
//   - the class emblems (Character, Classes and every class page): eight buttons, the current class lit;
//   - the 8 class pages: the class hero (figure, Class label, divider, role tags, gold button), builds by role, key skills,
//     stat order, Ascent Plan links;
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

// The ten Guide pages with their own photo (design/aetherium-page-photos-v1, 21 Oct 2026): path to the file name in page-heroes.
const PAGE_PHOTOS={'/hub/aetherium/guide/general/loadouts/':'loadouts','/hub/aetherium/guide/equipment/slots/':'slots','/hub/aetherium/guide/equipment/titles/':'titles','/hub/aetherium/guide/equipment/where-to-get/':'where-to-get','/hub/aetherium/guide/equipment/manastones/':'manastones','/hub/aetherium/guide/equipment/arcana/':'arcana','/hub/aetherium/guide/equipment/pets-wings/':'pets-wings','/hub/aetherium/guide/path/':'path','/hub/aetherium/guide/dungeons/':'dungeons','/hub/aetherium/guide/dungeons/daily-dungeon/':'daily-dungeon'};
// The tool pages and the photo behind each (same PR).
const BACKDROPS={'/hub/aetherium/ascent/':'ascent-mastery','/hub/aetherium/ascent/mastery/':'ascent-mastery','/hub/aetherium/ascent/skill-bar/':'ascent-skill-bar','/hub/aetherium/ascent/stigma/':'ascent-stigma','/hub/aetherium/ascent/daevanion/':'ascent-daevanion','/hub/aetherium/ascent/macro/':'ascent-macro','/hub/aetherium/ascent/stats/':'ascent-stats','/hub/aetherium/':'daeva-card','/hub/aetherium/gear/':'gear-ledger','/hub/aetherium/gear/equipment/':'gear-ledger','/hub/aetherium/gear/titles/':'gear-ledger'};

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
  for(const name of ['GUIDE_CLASSES','GUIDE_ROOT','GUIDE_SECTIONS','TOPIC_ICONS','classHref','classPickerHtml','comingSoonHtml','guideHref','overviewHtml','renderGuideShell','startGuidePage'])assert.ok(api.exports.includes(name),`guide-shell exports ${name}`);
  assert.deepEqual(api.classes,api.advisor,'GUIDE_CLASSES matches the advisor class list');
  assert.deepEqual(api.sections,SECTIONS,'Eight sections in order, each with its page');
  assert.deepEqual(api.heroes,['golden-sea-01.jpg',...SECTIONS.slice(1).map(([id])=>`${id}.jpg`)],'Home has the golden sea, every section its own photo');
  assert.equal(api.href,'/hub/aetherium/guide/world/');
  assert.equal(api.cls,'/hub/aetherium/guide/classes/spiritmaster/');
  await context.close();
  for(const [id,label,href] of SECTIONS.slice(1)){
    const {page,context,errors}=await open(href);
    assert.deepEqual(errors,[],`${href}: no page errors`);
    assert.equal(await plain(page,'.ae-gd-kicker'),label,`${href}: section kicker`);
    const photo=await page.$eval('.ae-gd-hero-img',img=>{const band=img.closest('.ae-gd-hero').getBoundingClientRect(),box=img.getBoundingClientRect();
      return {src:img.getAttribute('src'),alt:img.alt,w:img.getAttribute('width'),h:img.getAttribute('height'),loading:img.getAttribute('loading'),priority:img.getAttribute('fetchpriority'),fit:getComputedStyle(img).objectFit,
        fills:Math.abs(box.width-band.width)<=1&&Math.abs(box.height-band.height)<=1,shade:getComputedStyle(img.closest('.ae-gd-hero'),'::before').backgroundImage,fade:getComputedStyle(img.closest('.ae-gd-hero'),'::after').backgroundImage};});
    assert.equal(photo.src,`/astrix-app/pages/aetherium/images/section-heroes/${id}.jpg`,`${href}: the ${label} photo`);
    assert.ok(photo.alt.length>10&&!/[–—]/.test(photo.alt),`${href}: plain alt text`);
    assert.deepEqual([photo.w,photo.h,photo.loading,photo.priority,photo.fit],['2400','923','eager','high','cover'],`${href}: sized, eager, high priority, cover`);
    assert.ok(photo.fills,`${href}: the photo fills the band`);
    assert.match(photo.shade,/linear-gradient/,`${href}: the shade behind the title`);
    assert.match(photo.fade,/linear-gradient/,`${href}: the fade into the page`);
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
    // Every page wears its section's photo; About AION 2 keeps its own vista, the ten pages in PAGE_PHOTOS their own photo, a class page its class figure.
    const band=await page.evaluate(()=>({section:document.querySelector('[data-guide-shell]').dataset.guideShell,src:document.querySelector('.ae-gd-hero-img')?.getAttribute('src')??null,figure:!!document.querySelector('.ae-gd-hero.is-class')}));
    if(path==='/hub/aetherium/guide/general/about/')assert.equal(band.src,'/astrix-app/pages/aetherium/images/photos/atreia-vista-01.jpg',`${path}: keeps the vista`);
    else if(band.figure)assert.equal(band.src,null,`${path}: the class figure, no section photo`);
    else if(PAGE_PHOTOS[path])assert.equal(band.src,`/astrix-app/pages/aetherium/images/page-heroes/${PAGE_PHOTOS[path]}.jpg`,`${path}: its own photo`);
    else assert.equal(band.src,`/astrix-app/pages/aetherium/images/section-heroes/${band.section}.jpg`,`${path}: the ${band.section} photo`);
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
  // The class emblems lead the page; no class is lit here. The key line has no Pending.
  assert.equal(await page.$eval('[data-class-picker]',ul=>ul.closest('section').previousElementSibling),null,'The emblems come first');
  await checkPicker(page,null);
  assert.doesNotMatch(await plain(page,'.ae-gd-key'),/Pending/);
  assert.deepEqual(await page.$$eval('[data-suggest-role]',items=>items.map(li=>li.dataset.suggestRole)),ROLES);
  assert.match(await plain(page,'[data-suggest-role="tank"]'),/Main role for Templar\. Also played by Gladiator\./);
  assert.match(await plain(page,'[data-suggest-role="support"]'),/Main role for Chanter\./);
  assert.match(await plain(page,'#aeChooseTitle'),/Choosing a class/);
  await context.close();
});

/** The class emblems: eight buttons in game order, each its class page with its rendered emblem; only current is lit. */
async function checkPicker(page,current){
  const picks=await page.$$eval('[data-class-picker] a',links=>links.map(a=>({cls:a.dataset.class,href:a.getAttribute('href'),src:a.querySelector('img').getAttribute('src'),text:a.textContent.trim(),current:a.getAttribute('aria-current'),color:getComputedStyle(a).color,border:getComputedStyle(a).borderTopColor,glow:getComputedStyle(a).boxShadow,h:a.getBoundingClientRect().height,img:a.querySelector('img').getBoundingClientRect().width})));
  assert.deepEqual(picks.map(pick=>pick.cls),CLASSES,'Eight emblems in game order');
  for(const pick of picks){
    const slug=pick.cls.toLowerCase();
    assert.equal(pick.href,`/hub/aetherium/guide/classes/${slug}/`);
    assert.equal(pick.src,`/astrix-app/pages/aetherium/images/class-emblems/${slug}.png`,`${pick.cls}: the rendered emblem`);
    assert.equal(pick.text,pick.cls);
    assert.ok(pick.h>=44&&pick.img>=40,`${pick.cls}: a real button (${pick.h}px, emblem ${pick.img}px)`);
    if(pick.cls===current){
      assert.equal(pick.current,'page');
      assert.equal(pick.color,GOLD,`${pick.cls}: lit gold`);
      assert.equal(pick.border,GOLD,`${pick.cls}: gold edge`);
      assert.match(pick.glow,/rgba\(95, 216, 234/,`${pick.cls}: cyan glow`);
    } else {
      assert.equal(pick.current,null,`${pick.cls}: not lit`);
      assert.notEqual(pick.color,GOLD,`${pick.cls}: plain`);
    }
  }
}

await check('the Character page: the class emblems in place of the class pills',async()=>{
  const {page,context,errors}=await open('/hub/aetherium/guide/character/');
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('.ae-gd-classlinks').count(),0,'No class pill row');
  await checkPicker(page,null);
  await context.close();
});

const ACCENT={Gladiator:'rgb(159, 191, 232)',Templar:'rgb(224, 188, 98)',Assassin:'rgb(224, 106, 122)',Ranger:'rgb(159, 207, 151)',Sorcerer:'rgb(185, 147, 240)',Spiritmaster:'rgb(234, 219, 152)',Cleric:'rgb(227, 154, 98)',Chanter:'rgb(115, 194, 154)'};
await check('the 8 class pages: the class hero, every build by role with key skills, stat order and Ascent Plan links, the emblems',async()=>{
  for(const name of CLASSES){
    const slug=name.toLowerCase();
    const {page,context,errors,calls}=await open(`/hub/aetherium/guide/classes/${slug}/`);
    assert.deepEqual(errors,[],`${name}: no page errors`);
    assert.deepEqual(calls,[],`${name}: no Daeva linked, no call to the official site`);
    assert.equal(await plain(page,'#aeScreenTitle'),name);
    assert.equal(await plain(page,'.ae-gd-kicker'),'Class');
    assert.equal(await page.$eval('.ae-gd-kicker',el=>getComputedStyle(el).color),'rgb(95, 216, 234)','Class label in cyan');
    assert.deepEqual(await page.$$eval('[data-guide-side-pages] a',links=>links.map(a=>[a.textContent,a.getAttribute('aria-current')])),[['Overview',null],['Classes',null],[name,'page']],`${name}: lit in the side menu`);
    const records=builds[name];
    const main=records.find(build=>build.main);
    // The hero: the class figure left of the words, the divider diamond and role tags in the class accent, the gold button.
    const hero=await page.evaluate(()=>{const fig=document.querySelector('.ae-gd-figure-img'),copy=document.querySelector('.ae-gd-hero.is-class .ae-gd-hero-copy'),r=el=>el.getBoundingClientRect();
      return {src:fig.getAttribute('src'),alt:fig.alt,w:fig.getAttribute('width'),h:fig.getAttribute('height'),figW:r(fig).width,figRight:r(fig).right,copyLeft:r(copy).left,mask:getComputedStyle(fig).maskImage||getComputedStyle(fig).webkitMaskImage,
        diamond:getComputedStyle(document.querySelector('.ae-gd-divider'),'::after').backgroundColor,
        tags:[...document.querySelectorAll('.ae-gd-roletags li')].map(li=>({role:li.dataset.roleTag,text:li.textContent,color:getComputedStyle(li).color})),
        lede:document.querySelector('.ae-gd-hero .ae-gd-lede').textContent};});
    assert.equal(hero.src,`/astrix-app/pages/aetherium/images/class-figures/${slug}.jpg`,`${name}: its class figure`);
    assert.ok(hero.alt.includes(name)&&hero.w==='1100'&&Number(hero.h)>900,`${name}: figure alt, width and height`);
    assert.ok(hero.figW>=400,`${name}: the figure is large (${hero.figW}px)`);
    assert.ok(hero.figRight<=hero.copyLeft+1,`${name}: figure on the left, words on the right`);
    assert.match(hero.mask,/linear-gradient/,`${name}: the figure fades into the page`);
    assert.equal(hero.diamond,ACCENT[name],`${name}: divider diamond in the class accent`);
    assert.equal(hero.lede,main.summary,`${name}: the main build's summary`);
    const sorted=[...records].sort((a,b)=>Number(b.main)-Number(a.main)||ROLES.indexOf(a.role)-ROLES.indexOf(b.role));
    const record=ratings.records.find(item=>item.class===name);
    assert.deepEqual(hero.tags.map(tag=>tag.text),sorted.map(build=>{const rated=record.ratings[build.role];return `${{tank:'Tank',healer:'Healer',support:'Support',dps:'DPS'}[build.role]}${rated&&!rated.pending?` · ${rated.rating}`:''}`;}),`${name}: a role tag per build, tier from the ratings record`);
    assert.ok(hero.tags.every(tag=>tag.color===ACCENT[name]),`${name}: role tags in the class accent`);
    const cta=await page.$eval('[data-guide-cta="build"]',a=>({href:a.getAttribute('href'),bg:getComputedStyle(a).backgroundColor,text:a.textContent}));
    assert.deepEqual(cta,{href:`/hub/aetherium/ascent/?class=${slug}&role=${main.role}`,bg:'rgb(233, 194, 79)',text:`Open the ${name} build`},`${name}: the solid gold button to its build`);
    assert.equal(await page.locator('.ae-gd-hero.is-class .ae-gd-btn.is-gold,#aeGuideBody .ae-gd-btn.is-gold').count(),1,`${name}: one main action`);
    // Gone: the roles row and its key, the overview and its emblem tile. The main summary shows once.
    assert.equal(await page.locator('[data-roles-table],.ae-gd-key,.ae-gd-overview,.ae-gd-overview-art').count(),0,`${name}: no roles table, key or overview`);
    assert.equal((await page.textContent('#aeStage')).split(main.summary).length-1,1,`${name}: the summary once`);
    await checkPicker(page,name);
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
  assert.equal(await other.page.getAttribute('#aeSetup a','href'),'/hub/aetherium/guide/classes/gladiator/');
  assert.equal(await plain(other.page,'[data-setup-line]'),'Your Daeva GUIDEDAEVA is a Gladiator.Gladiator page');
  assert.ok(await other.page.$eval('#aeSetup',box=>box.getBoundingClientRect().height<=90),'Collapsed to one line');
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
        const tallest=path.includes('/classes/')&&path!=='/hub/aetherium/guide/classes/'?720:560;
        assert.ok(box.hero.h>=340&&box.hero.h<=tallest,`${path}: band about 360px tall on a phone, a class hero up to 720 (${box.hero.h})`);
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
    }
  });
}

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

await check('page photos: ten Guide pages wear their own photo, sized, focused and shaded, at 1440 and 390',async()=>{
  for(const [path,name] of Object.entries(PAGE_PHOTOS))for(const width of [1440,390]){
    const {page,context,errors}=await open(path,{viewport:{width,height:width===390?844:900}});
    try{
      assert.deepEqual(errors,[],`${path}: no page errors`);
      const photo=await page.$eval('.ae-gd-hero-img',img=>{const band=img.closest('.ae-gd-hero').getBoundingClientRect(),box=img.getBoundingClientRect();
        return {src:img.getAttribute('src'),alt:img.alt,w:img.getAttribute('width'),h:img.getAttribute('height'),fit:getComputedStyle(img).objectFit,pos:getComputedStyle(img).objectPosition,loaded:img.complete&&img.naturalWidth===2400,
          fills:Math.abs(box.width-band.width)<=1&&Math.abs(box.height-band.height)<=1,shade:getComputedStyle(img.closest('.ae-gd-hero'),'::before').backgroundImage,fade:getComputedStyle(img.closest('.ae-gd-hero'),'::after').backgroundImage};});
      assert.equal(photo.src,`/astrix-app/pages/aetherium/images/page-heroes/${name}.jpg`,`${path}: its own photo`);
      assert.ok(photo.alt.length>10&&!/[–—-]/.test(photo.alt),`${path}: plain alt text, no dashes`);
      assert.deepEqual([photo.w,photo.h,photo.fit],['2400','923','cover'],`${path}: sized 2400 by 923, cover`);
      assert.notEqual(photo.pos,'50% 45%',`${path}: its own focus`);
      assert.ok(photo.fills,`${path} at ${width}: the photo fills the band`);
      assert.match(photo.shade,/linear-gradient/,`${path}: the shade behind the title`);
      assert.match(photo.fade,/linear-gradient/,`${path}: the fade into the page`);
    }finally{await context.close();}
  }
});

await check('tool backdrops: a fixed, darkened, decorative photo behind the Ascent Plan, Daeva Card and Gear Ledger',async()=>{
  for(const [path,name] of Object.entries(BACKDROPS))for(const width of [1440,390]){
    const {page,context,errors}=await open(path,{viewport:{width,height:width===390?844:900}});
    try{
      assert.deepEqual(errors,[],`${path}: no page errors`);
      const look=await page.evaluate(()=>{const body=document.body,layer=getComputedStyle(body,'::before');
        return {position:layer.position,zIndex:layer.zIndex,inset:[layer.top,layer.left].join(' '),image:layer.backgroundImage,bodyBg:getComputedStyle(body).backgroundColor,glows:(getComputedStyle(body).backgroundImage.match(/radial-gradient/g)||[]).length,attach:layer.backgroundAttachment,
          panel:getComputedStyle(body).getPropertyValue('--ae-panel').trim(),solid:getComputedStyle(body).getPropertyValue('--ae-panel-solid').trim(),wide:document.documentElement.scrollWidth>innerWidth,
          priority:document.querySelectorAll('[fetchpriority="high"][href*="page-backgrounds"],[fetchpriority="high"][src*="page-backgrounds"]').length};});
      assert.equal(look.position,'fixed',`${path}: a fixed layer`);
      assert.equal(look.zIndex,'-1',`${path}: behind the content`);
      assert.equal(look.inset,'0px 0px',`${path}: the size of the screen`);
      assert.notEqual(look.attach,'fixed',`${path}: never a fixed attachment`);
      assert.ok(look.image.includes(`/page-backgrounds/${name}.jpg`),`${path}: the ${name} photo`);
      assert.match(look.image,/rgba\(7, 11, 20, 0\.65\)|color\(srgb [\d. ]+\/ 0\.65\)/,`${path}: the ground at 65% over the photo`);
      assert.equal(look.bodyBg,'rgba(0, 0, 0, 0)',`${path}: no solid ground over the layer`);
      assert.equal(look.glows,2,`${path}: the two page glows stay`);
      assert.equal(look.panel,look.solid,`${path}: panels solid over the photo`);
      assert.ok(!look.wide,`${path} at ${width}: no sideways scroll`);
      assert.equal(look.priority,0,`${path}: the photo never jumps the queue`);
      await page.emulateMedia({contrast:'more'});
      assert.ok(!(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage)).includes('page-backgrounds'),`${path}: no photo with more contrast`);
    }finally{await context.close();}
  }
});

// Arcana (design/aetherium-arcana-page, 22 Oct 2026): the game's own art, no table and no boxes, every number from the data.
await check('Arcana: five card medallions, the grade climb on card backs, set art with pips, one stage track, Extract and Transmute pictures',async()=>{
  const arcana=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/gear-sources.json'),'utf8')).records.find(record=>record.id==='arcana-grades');
  for(const width of [1440,390]){
    const {page,context,errors}=await open('/hub/aetherium/guide/equipment/arcana/',{live:false,viewport:{width,height:width===390?844:900}});
    try{
      await page.waitForSelector('.ae-arc-cards');
      for(let y=0;y<9000;y+=700){await page.evaluate(value=>scrollTo(0,value),y);await page.waitForTimeout(40);}
      await page.waitForFunction(()=>[...document.querySelectorAll('.ae-arc-block img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:10000});
      assert.deepEqual(errors,[],'No page errors');
      const look=await page.evaluate(()=>{
        const box=node=>node.getBoundingClientRect();
        const cards=[...document.querySelectorAll('.ae-arc-card')];
        const discs=cards.map(card=>box(card.querySelector('.ae-arc-disc img')));
        const frames=[...document.querySelectorAll('.ae-arc-grade .ae-arc-frame')];
        const colours=[...document.querySelectorAll('.ae-arc-grade .ae-arc-num')].map(node=>getComputedStyle(node).color);
        const text=document.querySelector('.ae-gd-body').innerText;
        return {cards:cards.map(card=>card.dataset.arcanaSlot),both:cards.filter(card=>card.classList.contains('is-both')).map(card=>card.dataset.arcanaSlot),
          disc:Math.round(discs[0].width),rowTop:new Set(discs.slice(0,2).map(rect=>Math.round(rect.top))).size,
          frames:frames.map(frame=>Math.round(box(frame).width)),colours,nums:[...document.querySelectorAll('.ae-arc-num')].map(node=>node.textContent),
          tables:document.querySelectorAll('.ae-gd-body table').length,svgs:document.querySelectorAll('.ae-gd-body svg').length,
          pipsOn:[...document.querySelectorAll('.ae-arc-pips')].map(pips=>pips.querySelectorAll('.ae-arc-pip.is-on').length),
          setArt:[...document.querySelectorAll('.ae-arc-set-art')].map(node=>getComputedStyle(node).backgroundImage.includes('/images/arcana/')),
          stages:document.querySelectorAll('.ae-arc-stage').length,top:document.querySelector('.ae-arc-stage.is-top .ae-arc-up')?.textContent,
          loop:[...document.querySelectorAll('.ae-arc-loop h3')].map(node=>node.textContent),cost:document.querySelector('.ae-arc-cost')?.textContent.trim(),
          h2:[...document.querySelectorAll('.ae-arc-block>.ae-gx-h2')].map(node=>Math.round(parseFloat(getComputedStyle(node).fontSize))),
          wide:document.documentElement.scrollWidth>innerWidth,dash:/[–—]/.test(text),broken:/undefined|NaN|\[object|not in the record/.test(text)};
      });
      assert.deepEqual(look.cards,arcana.slots.map(slot=>slot.id),'Five cards, in the data order');
      assert.deepEqual(look.both,arcana.slots.filter(slot=>slot.from.length>1).map(slot=>slot.id),'The card from both dungeons is ringed');
      assert.ok(look.disc>=(width===390?120:180),`The medallions are big (${look.disc}px)`);
      assert.equal(look.rowTop,1,'The medallions sit on one line');
      assert.ok(look.frames.every((w,n)=>n===0||w>=look.frames[n-1]),`Each grade card is at least as big as the one before (${look.frames})`);
      assert.equal(new Set(look.colours).size,arcana.grades.length,'Each grade number in its own grade colour');
      assert.deepEqual(look.nums,arcana.grades.map(entry=>`+${entry.itemLevel}`),'Item levels from the data');
      assert.equal(look.tables,0,'No table');
      assert.equal(look.svgs,0,'No drawn icons');
      assert.deepEqual(look.pipsOn,arcana.lines.flatMap(()=>[2,4]),'Pips show 2 and 4 cards for each line');
      assert.ok(look.setArt.length===arcana.lines.length&&look.setArt.every(Boolean),'Each line has its art');
      assert.equal(look.stages,4,'One stage track');
      assert.match(look.top,/guaranteed/i,'The top stage says what it guarantees');
      assert.deepEqual(look.loop,['Extract','Mysterious Crystal','Transmute']);
      assert.match(look.cost,/^5 crystals$/);
      assert.ok(look.h2.every(size=>size===look.h2[0])&&look.h2[0]>=(width===390?28:38),`Section headings on the Guide scale (${look.h2})`);
      assert.ok(!look.wide,`No sideways scroll at ${width}`);
      assert.ok(!look.dash,'No en or em dash');
      assert.ok(!look.broken,'No broken or placeholder text');
      if(process.env.AE_SHOTS)await page.screenshot({path:`${process.env.AE_SHOTS}/arcana-${width}.png`,fullPage:true});
    }finally{await context.close();}
  }
});

// Pets and wings (design/aetherium-pets-wings-page, 22 Oct 2026): real portraits and wing art, no table, numbers from the data.
await check('Pets and wings: a wall of pet portraits, the souls climb, genera sized by count, wing art and one wing\'s two effects',async()=>{
  const guide=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/equipment-guide.json'),'utf8')).records;
  const pets=guide.find(record=>record.id==='pets'),wings=guide.find(record=>record.id==='wings');
  for(const width of [1440,390]){
    const {page,context,errors}=await open('/hub/aetherium/guide/equipment/pets-wings/',{live:false,viewport:{width,height:width===390?844:900}});
    try{
      await page.waitForSelector('.ae-pw-wall');
      for(let y=0;y<9000;y+=700){await page.evaluate(value=>scrollTo(0,value),y);await page.waitForTimeout(40);}
      await page.waitForFunction(()=>[...document.querySelectorAll('.ae-arc-block img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:10000});
      assert.deepEqual(errors,[],'No page errors');
      const look=await page.evaluate(()=>{
        const text=document.querySelector('.ae-gd-body').innerText;
        return {wall:document.querySelectorAll('.ae-pw-wall img').length,wallW:Math.round(document.querySelector('.ae-pw-wall img').getBoundingClientRect().width),
          souls:[...document.querySelectorAll('.ae-pw-num')].map(node=>node.textContent),lvW:[...document.querySelectorAll('.ae-pw-lv-art')].map(node=>Math.round(node.getBoundingClientRect().width)),
          bars:[...document.querySelectorAll('.ae-pw-bar')].map(node=>Math.round(parseFloat(getComputedStyle(node,'::before').width))),counts:[...document.querySelectorAll('.ae-pw-bar b')].map(node=>Number(node.textContent)),
          wings:document.querySelectorAll('.ae-pw-wings img').length,owned:[...document.querySelectorAll('.ae-pw-effects .is-owned li')].map(node=>node.textContent),
          tables:document.querySelectorAll('.ae-gd-body table').length,svgs:document.querySelectorAll('.ae-gd-body svg').length,
          wide:document.documentElement.scrollWidth>innerWidth,dash:/[–—]/.test(text),broken:/undefined|NaN|\[object/.test(text),pending:text.includes('The weekly limit on morphing')};
      });
      assert.ok(look.wall>=12&&look.wallW>=(width===390?90:120),`A wall of pet portraits (${look.wall} at ${look.wallW}px)`);
      assert.deepEqual(look.souls,pets.souls.levels.map(step=>String(step.souls)),'Souls from the data');
      assert.ok(look.lvW.every((w,n)=>n===0||w>look.lvW[n-1]),`Each level bigger than the last (${look.lvW})`);
      assert.deepEqual(look.counts,pets.genera.map(genus=>genus.pets),'Genus counts from the data');
      const most=Math.max(...look.counts);assert.ok(look.bars[look.counts.indexOf(most)]===Math.max(...look.bars),'The biggest genus has the longest bar');
      assert.ok(look.wings>=4,'Wing art');
      assert.deepEqual(look.owned,wings.example.owned,'Owned effects from the data');
      assert.equal(look.tables,0,'No table');assert.equal(look.svgs,0,'No drawn icons');
      assert.ok(!look.pending,'A pending fact never shows');
      assert.ok(!look.wide,`No sideways scroll at ${width}`);assert.ok(!look.dash,'No dash');assert.ok(!look.broken,'No broken text');
      if(process.env.AE_SHOTS)await page.screenshot({path:`${process.env.AE_SHOTS}/pets-wings-${width}.png`,fullPage:true});
    }finally{await context.close();}
  }
});

// Manastones and Theostones (design/aetherium-stones-pages, 23 Oct 2026): slot counts from the official data, no unknown facts.
await check('Manastones and Theostones: sockets by grade, ranked stones, the Combine chain, no unknown facts or empty roles',async()=>{
  const enh=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/enhancement.json'),'utf8')).records;
  const mana=enh.find(record=>record.id==='manastone'),theo=enh.find(record=>record.id==='theostone');
  for(const width of [1440,390]){
    for(const [path,check] of [['manastones',async page=>{
      const look=await page.evaluate(()=>({rows:[...document.querySelectorAll('.ae-st-row')].map(row=>row.querySelectorAll('.ae-st-socket').length),
        icon:document.querySelector('.ae-st-socket img')?.getAttribute('src'),socket:Math.round(document.querySelector('.ae-st-socket').getBoundingClientRect().width),
        roles:[...document.querySelectorAll('.ae-st-role')].map(node=>node.dataset.role),ranks:document.querySelectorAll('.ae-st-role:first-child .ae-st-rank').length}));
      assert.deepEqual(look.rows,mana.slots.byGrade.map(row=>row.manastones),'One socket per Manastone slot, from the data');
      assert.equal(look.icon,mana.slots.icon,'The game\'s own Manastone icon');
      assert.ok(look.socket>=(width===390?50:70),`Sockets read at size (${look.socket}px)`);
      assert.deepEqual(look.roles,Object.keys(mana.roles).filter(role=>!mana.roles[role].pending),'Only roles with advice');
      assert.equal(look.ranks,mana.roles.tank.stones.length);
    }],['theostones',async page=>{
      const look=await page.evaluate(()=>({gems:[...document.querySelectorAll('.ae-st-gem')].map(node=>node.textContent.trim()),odds:[...document.querySelectorAll('.ae-st-odds b')].map(node=>node.textContent),
        colours:new Set([...document.querySelectorAll('.ae-st-gem span')].map(node=>getComputedStyle(node).color)).size}));
      assert.deepEqual(look.gems,['Rare','Epic','Unique']);
      assert.deepEqual(look.odds,theo.combineOdds.map(step=>`${step.chance}%`),'Odds from the data');
      assert.equal(look.colours,3,'Each grade in its own colour');
      const effects=theo.catalogue.groups.flatMap(group=>group.effects);
      const seen=async()=>page.evaluate(()=>[...document.querySelectorAll('.ae-th-card')].filter(card=>card.offsetParent).map(card=>card.dataset.grade));
      const unique=await seen();
      assert.equal(unique.length,effects.length,'One card per effect for the grade shown');
      assert.ok(unique.every(grade=>grade==='unique'),'Unique shows first');
      await page.click('[data-theo-grade="rare"]');
      const rare=await seen();
      assert.ok(rare.length===effects.length&&rare.every(grade=>grade==='rare'),'The Rare button shows the Rare stones');
      assert.equal(await page.getAttribute('[data-theo-grade="rare"]','aria-pressed'),'true');
      const stun=await page.$eval('.ae-th-card[data-grade="rare"][data-effect="stun"] .ae-th-big b',node=>node.textContent);
      assert.equal(stun,`${effects.find(effect=>effect.id==='stun').duration.Rare}s`,'Numbers from the data');
      const icon=await page.$eval('.ae-th-card[data-grade="rare"][data-effect="stun"] img',img=>img.getBoundingClientRect().width);
      assert.ok(icon>=70,`The stone icon reads at size (${icon}px)`);
    }]]){
      const {page,context,errors}=await open(`/hub/aetherium/guide/equipment/${path}/`,{live:false,viewport:{width,height:width===390?844:900}});
      try{
        await page.waitForSelector('.ae-arc-block');
        assert.deepEqual(errors,[],`${path}: no page errors`);
        await check(page);
        const text=await page.evaluate(()=>document.querySelector('.ae-gd-body').innerText);
        const hidden=[...mana.facts,...theo.facts].filter(item=>item.status==='unknown').map(item=>item.text);
        for(const line of hidden)assert.ok(!text.includes(line),`${path}: an unknown fact never shows (${line})`);
        assert.ok(!/research record|not in the record|undefined|NaN|[–—]/.test(text),`${path}: no placeholder, broken text or dash`);
        assert.equal(await page.evaluate(()=>document.querySelectorAll('.ae-gd-body table,.ae-gd-body svg').length),0,`${path}: no table or drawn icon`);
        assert.ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),`${path} at ${width}: no sideways scroll`);
        if(process.env.AE_SHOTS)await page.screenshot({path:`${process.env.AE_SHOTS}/${path}-${width}.png`,fullPage:true});
      }finally{await context.close();}
    }
  }
});

// Theostone detail cards (design/aetherium-theostone-cards, 24 Oct 2026): every stone opens its card; with a Daeva linked the
// card and the grid say whether it suits that Daeva's build, from the role advice in the data, never a guess.
await check('Theostone cards: click opens the detail card, the grade ladder, and the build verdict for a linked Gladiator',async()=>{
  const theo=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/enhancement.json'),'utf8')).records.find(record=>record.id==='theostone');
  for(const width of [1440,390]){
    const plain=await open('/hub/aetherium/guide/equipment/theostones/',{live:false,viewport:{width,height:width===390?844:900}});
    try{
      await plain.page.waitForSelector('.ae-th-card[data-grade="unique"] .ae-th-open');
      assert.equal(await plain.page.locator('[data-theo-fit]:not([hidden])').count(),0,'No fit badges with no Daeva');
      await plain.page.click('.ae-th-card[data-grade="unique"][data-effect="stun"] .ae-th-open');
      await plain.page.waitForSelector('#aeTheoDetail[open]');
      const look=await plain.page.evaluate(()=>{const d=document.querySelector('#aeTheoDetail');const box=d.getBoundingClientRect();
        return {title:d.querySelector('h2').textContent,ladder:[...d.querySelectorAll('.ae-th-ladder b')].map(n=>n.textContent),current:d.querySelector('.ae-th-ladder [aria-current]')?.dataset.grade,
          find:!!d.querySelector('a[href*="aeSearch"]'),inside:box.left>=0&&box.right<=innerWidth,hash:location.hash};});
      assert.equal(look.title,'Stun');
      assert.deepEqual(look.ladder,theo.catalogue.grades.map(g=>`${theo.catalogue.groups[0].effects.find(e=>e.id==='stun').duration[g]}s`),'Every grade from the data');
      assert.equal(look.current,'unique','The grade clicked is lit');
      assert.ok(look.find,'No Daeva: the card offers Find your Daeva');
      assert.ok(look.inside,`The card fits the screen at ${width}`);
      assert.equal(look.hash,'#theo-unique-stun','The card has its own link');
      await plain.page.keyboard.press('Escape');
      assert.equal(await plain.page.locator('#aeTheoDetail[open]').count(),0,'Escape closes it');
    }finally{await plain.context.close();}
  }
  const linked=await open('/hub/aetherium/guide/equipment/theostones/#theo-unique-aoe-fire',{live:false,roster:rosterWith(LV45)});
  try{
    await linked.page.waitForSelector('#aeTheoDetail[open]');
    const verdict=await linked.page.evaluate(()=>({fit:document.querySelector('.ae-th-verdict')?.dataset.fit,text:document.querySelector('.ae-th-verdict')?.innerText,
      badges:[...document.querySelectorAll('.ae-th-card[data-grade="unique"][data-fit="best"]')].map(card=>card.dataset.effect)}));
    assert.equal(verdict.fit,'best','A deep link opens its card; area Fire suits a Gladiator DPS');
    assert.match(verdict.text,/GUIDEDAEVA/);assert.match(verdict.text,/Gladiator/);
    assert.deepEqual(verdict.badges.sort(),[...theo.fit.roles.dps.best].sort(),'The grid marks the stones that suit the build');
    await linked.page.keyboard.press('Escape');
    await linked.page.click('.ae-th-card[data-grade="unique"][data-effect="stun"] .ae-th-open');
    assert.equal(await linked.page.$eval('.ae-th-verdict',node=>node.dataset.fit),'other','Stun is not the DPS pick');
    assert.deepEqual(linked.errors,[]);
  }finally{await linked.context.close();}
});

// Manastone and Arcana detail cards (design/aetherium-manastone-arcana-cards, 24 Oct 2026): the Theostone card on two more
// pages. Manastones judge the build from the role order in the data; Arcana has no advice in the data, so no verdict.
await check('Manastone and Arcana cards: click opens the card, its own link, the build verdict only where the data has advice',async()=>{
  const enh=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/enhancement.json'),'utf8')).records;
  const mana=enh.find(record=>record.id==='manastone');
  const arcana=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/gear-sources.json'),'utf8')).records.find(record=>record.id==='arcana-grades');
  for(const width of [1440,390]){
    const plain=await open('/hub/aetherium/guide/equipment/manastones/',{live:false,viewport:{width,height:width===390?844:900}});
    try{
      await plain.page.waitForSelector('[data-mana-open="hp"]');
      assert.equal(await plain.page.locator('[data-mana-yours]:not([hidden])').count(),0,'No role marked with no Daeva');
      await plain.page.click('[data-mana-open="hp"]');
      await plain.page.waitForSelector('#aeManaDetail[open]');
      const look=await plain.page.evaluate(()=>{const d=document.querySelector('#aeManaDetail');const box=d.getBoundingClientRect();
        return {title:d.querySelector('h2').textContent,what:d.querySelector('.ae-th-what').textContent,rank:d.querySelector('.ae-md-ranks b')?.textContent,
          find:!!d.querySelector('a[href*="aeSearch"]'),inside:box.left>=0&&box.right<=innerWidth,hash:location.hash,focus:document.activeElement?.matches('[data-detail-close]')};});
      assert.equal(look.title,'HP');
      assert.match(look.what,new RegExp(`Best roll ${mana.roles.tank.stones[0].top}`),'Best roll from the data');
      assert.equal(look.rank,'1','Where the tank list ranks it');
      assert.ok(look.find,'No Daeva: the card offers Find your Daeva');
      assert.ok(look.inside,`The card fits the screen at ${width}`);
      assert.equal(look.hash,'#mana-hp','The card has its own link');
      assert.ok(look.focus,'Focus moves to Close');
      await plain.page.keyboard.press('Escape');
      assert.equal(await plain.page.locator('#aeManaDetail[open]').count(),0,'Escape closes it');
      assert.ok(await plain.page.evaluate(()=>document.activeElement?.matches('[data-mana-open="hp"]')),'Focus returns to the stone');
      assert.deepEqual(plain.errors,[]);
    }finally{await plain.context.close();}
    const arc=await open('/hub/aetherium/guide/equipment/arcana/#arcana-chalice',{live:false,roster:rosterWith(LV45),viewport:{width,height:width===390?844:900}});
    try{
      await arc.page.waitForSelector('#aeArcDetail[open]');
      const look=await arc.page.evaluate(()=>{const d=document.querySelector('#aeArcDetail');const box=d.getBoundingClientRect();
        return {title:d.querySelector('h2').textContent,ladder:[...d.querySelectorAll('.ae-ad-ladder b')].map(n=>n.textContent),
          colours:new Set([...d.querySelectorAll('.ae-ad-ladder span')].map(n=>getComputedStyle(n).color)).size,
          lines:d.querySelectorAll('.ae-ad-lines li').length,verdict:d.querySelectorAll('.ae-th-verdict').length,inside:box.left>=0&&box.right<=innerWidth,
          text:d.innerText};});
      assert.equal(look.title,'Chalice','A deep link opens its card');
      assert.deepEqual(look.ladder,arcana.grades.map(entry=>`+${entry.itemLevel}`),'Item level at each grade, from the data');
      assert.equal(look.colours,arcana.grades.length,'Each grade in its own colour');
      assert.equal(look.lines,arcana.lines.length,'Both set lines');
      assert.equal(look.verdict,0,'No Arcana advice in the data: no verdict, even with a Daeva linked');
      assert.match(look.text,/Stage 3, item level 2,200\+/,'The first Stage that drops Unique, worked out from the stages');
      assert.ok(!/undefined|NaN|[–—]/.test(look.text),'No broken text or dash');
      assert.ok(look.inside,`The card fits the screen at ${width}`);
      assert.deepEqual(arc.errors,[]);
    }finally{await arc.context.close();}
  }
  const linked=await open('/hub/aetherium/guide/equipment/manastones/#mana-front-back-boost',{live:false,roster:rosterWith(LV45)});
  try{
    await linked.page.waitForSelector('#aeManaDetail[open]');
    const verdict=await linked.page.evaluate(()=>({fit:document.querySelector('.ae-th-verdict')?.dataset.fit,text:document.querySelector('.ae-th-verdict')?.innerText,
      yours:[...document.querySelectorAll('.ae-st-role[data-yours]')].map(node=>node.dataset.role),
      marked:[...document.querySelectorAll('.ae-st-role[data-yours] .ae-st-pick[data-fit="best"]')].map(node=>node.dataset.stone),
      edge:getComputedStyle(document.querySelector('.ae-st-role[data-yours] .ae-st-pick[data-fit="best"]')).boxShadow}));
    assert.equal(verdict.fit,'best','Front or Back Damage Boost suits a Gladiator DPS');
    assert.match(verdict.text,/GUIDEDAEVA/);assert.match(verdict.text,/Gladiator/);
    assert.deepEqual(verdict.yours,['dps'],'The DPS list is marked as the Daeva\'s role');
    assert.deepEqual(verdict.marked,mana.fit.roles.dps.best,'The stones that suit the build carry the edge');
    assert.ok(verdict.edge&&verdict.edge!=='none','The edge is drawn');
    await linked.page.keyboard.press('Escape');
    await linked.page.click('[data-mana-open="hp"]');
    assert.equal(await linked.page.$eval('.ae-th-verdict',node=>node.dataset.fit),'other','HP is not the DPS pick');
    assert.deepEqual(linked.errors,[]);
  }finally{await linked.context.close();}
});

await check('never the real Worker or NCSOFT',async()=>{assert.deepEqual(realCalls,[]);});

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_GUIDE=FAIL ${failures}`);process.exit(1);}
console.log('AETHERIUM_GUIDE=PASS');
