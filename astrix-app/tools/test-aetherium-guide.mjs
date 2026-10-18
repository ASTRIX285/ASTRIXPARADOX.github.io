#!/usr/bin/env node
// The AION 2 Guide, phase 1 (feature/aetherium-guide-home, 18 Oct 2026) on a local static server, the Worker mocked from
// the fixtures (never NCSOFT, never the real Worker):
//   - the shell contract the later phases build on: window, breadcrumb, section nav (8 sections, current lit), coming soon pages;
//   - the Guide link in the ribbon and the menu drawer of every Aetherium page;
//   - the home: intro, "New player? Start here", a tile per section, every link reaches a page;
//   - the class roles table: 8 rows, class names gold, ratings bold, each cell from the data (a Reported tier cited, else our build);
//   - the 8 class pages: builds by role, key skills, stat order, Ascent Plan links;
//   - "Your setup vs the build": flags with what they cost, the read's age, the device memory, never a block; Worker down;
//   - the memory helper: per Daeva key, savedAt, blocked storage is never an error;
//   - looks: no sideways scroll at 390, buttons 44px tall, usable well inside 4 s.
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
const SOON=['general','skills','equipment','crafting','world','guides'];
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

await check('shell contract: the Guide window, breadcrumb and section nav, the current section lit, on every Guide page',async()=>{
  const {page,context,errors,calls}=await open('/hub/aetherium/guide/');
  assert.deepEqual(errors,[]);
  assert.deepEqual(calls,[],'The home never calls the official site');
  assert.equal(await page.locator('.ae-gw.ae-gd[data-guide-shell="home"]').count(),1,'One Guide window');
  assert.equal(await plain(page,'#aeScreenTitle'),'AION 2 Guide');
  assert.deepEqual(await page.$$eval('.ae-gd-crumbs li',items=>items.map(li=>li.textContent.trim())),['Guide','Home']);
  const nav=await page.$$eval('.ae-gd-nav a',links=>links.map(a=>({id:a.dataset.guideSection,text:a.textContent,href:a.getAttribute('href'),current:a.getAttribute('aria-current')})));
  assert.deepEqual(nav.map(item=>[item.id,item.text,item.href]),SECTIONS,'Eight sections in order, each with its page');
  assert.deepEqual(nav.filter(item=>item.current==='page').map(item=>item.id),['home'],'Only Home is lit');
  assert.equal(await page.$eval('.ae-gd-nav a[aria-current="page"]',a=>getComputedStyle(a).color),GOLD,'The current section is gold');
  // The module API the later phases use.
  const api=await page.evaluate(async()=>{const shell=await import('/astrix-app/pages/aetherium/guide-shell.mjs');const advisor=await import('/astrix-app/games/aion2/engine/ascent-advisor.mjs');
    return {exports:Object.keys(shell).sort(),classes:[...shell.GUIDE_CLASSES],advisor:[...advisor.AION2_CLASSES],href:shell.guideHref('world'),cls:shell.classHref('Spiritmaster')};});
  for(const name of ['GUIDE_CLASSES','GUIDE_ROOT','GUIDE_SECTIONS','classHref','comingSoonHtml','guideHref','renderGuideShell','startGuidePage'])assert.ok(api.exports.includes(name),`guide-shell exports ${name}`);
  assert.deepEqual(api.classes,api.advisor,'GUIDE_CLASSES matches the advisor class list');
  assert.equal(api.href,'/hub/aetherium/guide/world/');
  assert.equal(api.cls,'/hub/aetherium/guide/classes/spiritmaster/');
  await context.close();
  for(const [id,label,href] of SECTIONS.slice(1)){
    const {page,context,errors}=await open(href);
    assert.deepEqual(errors,[],`${href}: no page errors`);
    assert.deepEqual(await page.$$eval('.ae-gd-nav a[aria-current="page"]',links=>links.map(a=>a.dataset.guideSection)),[id],`${href}: ${label} lit`);
    assert.deepEqual(await page.$$eval('.ae-gd-crumbs li',items=>items.map(li=>li.textContent.trim())),['Guide',label]);
    assert.equal(await page.getAttribute('.ae-gd-crumbs a','href'),'/hub/aetherium/guide/','The first crumb leads home');
    if(SOON.includes(id)){
      assert.equal(await page.locator(`[data-guide-soon="${id}"]`).count(),1,`${href}: coming soon page`);
      assert.match(await plain(page,'[data-guide-soon]'),/Coming soon in this guide/);
    }
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

await check('home: intro, "New player? Start here", a tile per section, every link reaches a page',async()=>{
  const {page,context}=await open('/hub/aetherium/guide/');
  assert.match(await plain(page,'.ae-gd-intro'),/AION 2 Guide by ASTRIX PARADOX/);
  assert.equal(await plain(page,'#aeStartTitle'),'New player? Start here');
  const steps=await page.$$eval('[data-guide-start]',links=>links.map(a=>({href:a.getAttribute('href'),text:a.querySelector('strong').textContent})));
  assert.deepEqual(steps.map(step=>step.text),['Pick a class','Find your Daeva','Plan your build','Your path by level']);
  assert.equal(steps[0].href,'/hub/aetherium/guide/classes/');
  const tiles=await page.$$eval('[data-guide-tile]',items=>items.map(li=>({id:li.dataset.guideTile,href:li.querySelector('.ae-gd-tile-head').getAttribute('href'),soon:Boolean(li.querySelector('.ae-gd-soon-tag')),icon:Boolean(li.querySelector('svg.ae-gd-icon'))})));
  assert.deepEqual(tiles.map(tile=>[tile.id,tile.href]),SECTIONS.slice(1).map(([id,,href])=>[id,href]),'A tile per section, in nav order');
  assert.ok(tiles.every(tile=>tile.icon),'Every tile has its icon');
  assert.deepEqual(tiles.filter(tile=>!tile.soon).map(tile=>tile.id),['character'],'Only Character is built in phase 1');
  assert.equal(await page.getAttribute('[data-guide-tile="character"] .ae-gd-topics a','href'),'/hub/aetherium/guide/classes/','Classes topic links to its page');
  // Every link on the home that stays on this site answers 200.
  const hrefs=[...new Set(await page.$$eval('#aeGuideBody a[href^="/"]',links=>links.map(a=>a.getAttribute('href').split('#')[0])))];
  for(const href of hrefs){const response=await fetch(`${base}${href}`);assert.equal(response.status,200,`${href} answers`);}
  await context.close();
});

await check('class roles table: 8 rows in game order, class names gold, ratings bold, each cell from the data, every rating cited',async()=>{
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
        assert.match(cell.text,/Reported/);
        assert.ok(cell.ref,`${name} ${role}: footnote`);
        const source=await page.$eval(cell.ref,li=>li.querySelector('a').href);
        assert.match(source,/^https:\/\//,`${name} ${role}: cited source is https`);
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
    assert.deepEqual(await page.$$eval('.ae-gd-crumbs li',items=>items.map(li=>li.textContent.trim())),['Guide','Character','Classes',name]);
    assert.deepEqual(await page.$$eval('.ae-gd-nav a[aria-current="page"]',links=>links.map(a=>a.dataset.guideSection)),['character']);
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

const LAYOUT=['/hub/aetherium/guide/','/hub/aetherium/guide/classes/','/hub/aetherium/guide/classes/chanter/','/hub/aetherium/guide/world/','/hub/aetherium/guide/character/'];
for(const [width,height] of [[390,844],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, every button at least 44px tall, the nav inside the window, usable well inside 4 s`,async()=>{
    for(const path of LAYOUT){
      const {page,context,readyMs}=await open(path,{viewport:{width,height}});
      assert.ok(readyMs<4000,`${path}: usable in ${readyMs}ms`);
      const box=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('#aeStage .ae-btn')].filter(el=>el.offsetParent).map(el=>({text:el.textContent.trim().slice(0,30),h:el.getBoundingClientRect().height})),nav:(()=>{const n=document.querySelector('.ae-gd-nav').getBoundingClientRect(),w=document.querySelector('.ae-gd').getBoundingClientRect();return {left:n.left-w.left,right:w.right-n.right};})()}));
      assert.ok(box.scroll<=0,`${path}: ${box.scroll}px sideways scroll`);
      for(const button of box.buttons)assert.ok(button.h>=44,`${path}: "${button.text}" is ${button.h}px tall`);
      assert.ok(box.nav.left>=0&&box.nav.right>=0,`${path}: nav inside the window`);
      if(process.env.AE_SHOTS)await page.screenshot({path:`${process.env.AE_SHOTS}/guide-${path.replace(/\W+/g,'-')}-${width}.png`,fullPage:true});
      await context.close();
    }
  });
}

await check('never the real Worker or NCSOFT',async()=>{assert.deepEqual(realCalls,[]);});

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_GUIDE=FAIL ${failures}`);process.exit(1);}
console.log('AETHERIUM_GUIDE=PASS');
