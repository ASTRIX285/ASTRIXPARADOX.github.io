#!/usr/bin/env node
// Early page data (perf, 26 Nov 2026). Every Forge tool page starts its signed-in reads from the
// page head (shared/forge-early-page-data.js), not after its module graph has loaded.
// Each page is served locally with the full Warlock inventory fixture (no sign-in, nothing leaves
// the machine) under Lighthouse Slow 4G (562.5 ms, 1474.56 / 675 Kbps) and 4x CPU.
// Asserts, per page (in this tab's session; Character and Armoury also in a new tab with a sign-in hint):
//   - /bungie/account and the page's /bungie/page/<kind> request start before the first module
//     script of the page has finished downloading;
//   - each of them is sent once (one /bungie/account, one /bungie/page/<kind> at display freshness);
//   - Home sends nothing before its code (no account control, Journey is built after it shows);
//   - Forge Loader and Armoury: item icons start after the page data, carry width and height, and
//     no more than 6 queued icons load at once;
//   - Armoury sends /paradox/loadouts once;
//   - no write (non GET) reaches the Worker while a page loads;
//   - signed out (no session, no sign-in hint) the page head sends nothing;
//   - the early script holds no write, and a prerendered page (outside hosts blocked) is checked.
// Playwright request routing turns the browser HTTP cache off, so absolute ready times here are
// slower than on the live site; the request start times are what this test compares.
//   node astrix-app/tools/test-forge-early-page-data.mjs [--report] [--dump] [--pages character,vault]
// --report prints the timings and never fails (used to measure a tree without the early script).
// --dump also prints every request of each page and its long tasks.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture} from './fixtures/warlock-inventory-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REPORT=process.argv.includes('--report');
const arg=(name,fallback)=>{const index=process.argv.indexOf(`--${name}`);return index>0?process.argv[index+1]:fallback;};
const AUTH='https://auth.astrixparadox.com';
const MEMBERSHIP={membershipId:'4611686018000000001',membershipType:3,displayName:'Fixture'};
const SESSION={authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:MEMBERSHIP,capabilities:{destinyActions:{transferItems:true,equipItems:true,pullFromPostmaster:true}}};
// Worker and Bungie answers are served by the test, so the throttled round trip is added by hand.
const LATENCY_MS=563;
const PAGES=Object.freeze([
  // Home has no account control and builds Journey only after it is on screen, so its head sends nothing.
  {name:'Home',path:'/astrix-app/pages/home/',kind:null,head:false},
  {name:'Journey',path:'/astrix-app/pages/journey/',kind:'journey'},
  {name:'Character',path:'/astrix-app/pages/guardian-workspace-v2/',kind:'character'},
  {name:'Forge Loader',path:'/astrix-app/pages/forge-loader/',kind:'loadout'},
  {name:'Builder',path:'/astrix-app/pages/guardian-workspace-v2/paradox-build-space/',kind:'build-forge'},
  {name:'Storage',path:'/astrix-app/pages/vault/',kind:'vault'},
  {name:'Armoury',path:'/astrix-app/pages/loadout/',kind:'loadout'}
]);
const only=arg('pages','');
const selected=only?PAGES.filter(page=>only.split(',').some(name=>page.name.toLowerCase().replace(/\s+/g,'-')===name||page.kind===name)):PAGES;

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const prerenderFetches=[];
const server=createServer(async(req,res)=>{
  const requested=new URL(req.url,'http://localhost');
  // A start page whose speculation rules prerender the page named in ?to= (prerender check).
  if(requested.pathname==='/__prerender-start'){
    const to=requested.searchParams.get('to')||'/';
    res.setHeader('Content-Type','text/html');
    res.end(`<!DOCTYPE html><title>start</title><a href="${to}">open</a><script type="speculationrules">${JSON.stringify({prerender:[{source:'list',urls:[to],eagerness:'immediate'}]})}</script>`);
    return;
  }
  if(req.headers['sec-purpose'])prerenderFetches.push(`${requested.pathname} ${req.headers['sec-purpose']}`);
  const path=decodeURIComponent(requested.pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  // GitHub Pages serves every file with max-age=600, so a module the page has fetched is reused by the profile Worker.
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','max-age=600');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});

// Records when the page reports ready and when each module script finishes downloading.
const probe=()=>{
  window.__axEarly={ready:null};window.__axLong=[];
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__axLong.push([Math.round(entry.startTime),Math.round(entry.duration),(entry.attribution||[]).map(a=>a.containerSrc||a.name).join(' ')]);}).observe({type:'longtask',buffered:true});}catch{}
  document.addEventListener('forge:portal-ready',()=>{if(window.__axEarly.ready===null)window.__axEarly.ready=performance.now();});
};
const signIn=session=>{try{sessionStorage.setItem('astrix:bungie-session-cache:v1',JSON.stringify({savedAt:Date.now(),session}));}catch{}};
const hint=identity=>{try{localStorage.setItem(`astrix:bungie-page-check:v1:${identity}:character`,String(Date.now()-60_000));}catch{}};

async function openPage(browser,page,{mode='cached',fixture,art,origin}){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const calls=[],writes=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    const at=Date.now();
    if(url.hostname.endsWith('bungie.net')){await new Promise(done=>setTimeout(done,LATENCY_MS));return route.fulfill({contentType:'image/webp',body:art});}
    if(url.origin!==AUTH)return route.abort();
    const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,DELETE'}});
    calls.push({path:url.pathname,freshness:url.searchParams.get('freshness'),method:request.method(),at});
    if(request.method()!=='GET')writes.push(url.pathname);
    await new Promise(done=>setTimeout(done,LATENCY_MS));
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(body)});
    if(mode==='signed-out'){
      if(url.pathname==='/session')return json({authenticated:false,error:'bungie_reauthentication_required'},401);
      return json({error:'not_authenticated'},401);
    }
    if(url.pathname==='/session')return json(SESSION);
    if(url.pathname==='/bungie/account')return json({displayName:'Fixture',uniqueName:'Fixture#0001',profilePicturePath:''});
    if(url.pathname.startsWith('/bungie/page/'))return json(fixture.envelope(url.pathname.split('/').pop()));
    if(url.pathname==='/bungie/profile')return json({profile:fixture.profile,definitions:fixture.definitions});
    if(url.pathname==='/paradox/loadouts')return json({entries:[],cursor:''});
    return json({error:'not_routed'},404);
  });
  await context.addInitScript(probe);
  if(mode==='cached')await context.addInitScript(signIn,SESSION);
  if(mode==='hint')await context.addInitScript(hint,`${MEMBERSHIP.membershipType}:${MEMBERSHIP.membershipId}`);
  const tab=await context.newPage();
  const cdp=await context.newCDPSession(tab);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:562.5,downloadThroughput:1474.56*1024/8,uploadThroughput:675*1024/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const errors=[];tab.on('pageerror',error=>errors.push(String(error.message).split('\n')[0]));
  const started=Date.now();
  await tab.goto(origin+page.path,{waitUntil:'load',timeout:180000});
  await tab.waitForFunction(()=>window.__axEarly?.ready!==null,null,{timeout:60000}).catch(()=>{});
  await tab.waitForTimeout(4000);
  const timing=await tab.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    const modules=[...document.querySelectorAll('script[type="module"][src]')].map(node=>node.src);
    const resources=performance.getEntriesByType('resource');
    const firstModule=resources.filter(entry=>modules.includes(entry.name)).sort((a,b)=>a.responseEnd-b.responseEnd)[0];
    const auth=resources.filter(entry=>entry.name.startsWith('https://auth.astrixparadox.com/')).map(entry=>({path:new URL(entry.name).pathname,freshness:new URL(entry.name).searchParams.get('freshness'),start:Math.round(entry.startTime)}));
    const iconEntries=resources.filter(entry=>/bungie\.net/.test(entry.name));
    const icons=iconEntries.map(entry=>Math.round(entry.startTime)).sort((a,b)=>a-b);
    const peakOf=entries=>{
      const edges=entries.flatMap(entry=>[[entry.startTime,1],[entry.responseEnd,-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      let open=0,peak=0;for(const [,step] of edges){open+=step;peak=Math.max(peak,open);}
      return peak;
    };
    // Icons the page renders through shared/bungie-icon-queue.mjs: Exotic picks, saved build art and stats.
    const gated=[...document.querySelectorAll('.forge-exotic img,.saved-build-art img,.saved-build-stat img')];
    const queuedUrls=new Set(gated.map(img=>img.currentSrc||img.src).filter(Boolean));
    const iconQueue={peak:peakOf(iconEntries.filter(entry=>queuedUrls.has(entry.name))),allPeak:peakOf(iconEntries),waiting:document.querySelectorAll('img[data-bungie-icon]').length,unsized:gated.filter(img=>!img.hasAttribute('width')||!img.hasAttribute('height')).length,gated:gated.length};
    const code=resources.filter(entry=>/\.(m?js|css)(\?|$)/.test(entry.name)&&new URL(entry.name).origin===location.origin);
    const dump=resources.map(entry=>[Math.round(entry.startTime),Math.round(entry.responseEnd),entry.name.replace(location.origin,'').slice(0,110),entry.transferSize,entry.initiatorType]).sort((a,b)=>a[0]-b[0]);
    const longTasks=window.__axLong||[];
    const iconOwners={};for(const img of document.querySelectorAll('img')){const src=img.currentSrc||img.src||img.dataset.bungieIcon||'';if(!/bungie\.net/.test(src))continue;const owner=(img.closest('[class]')?.className||'?').toString().split(' ')[0]+(img.getAttribute('loading')==='lazy'?' lazy':'')+(img.hasAttribute('width')?' sized':'');iconOwners[owner]=(iconOwners[owner]||0)+1;}
    window.__axIconOwners=iconOwners;
    return {iconQueue,dump,longTasks,iconOwners:window.__axIconOwners,codeEnd:Math.round(Math.max(0,...code.map(entry=>entry.responseEnd))),codeCount:code.length,html:Math.round(nav?.responseEnd||0),firstModuleEnd:firstModule?Math.round(firstModule.responseEnd):null,auth,icons,ready:window.__axEarly?.ready===null?null:Math.round(window.__axEarly.ready)};
  });
  return {context,tab,calls,writes,errors,timing,started};
}

const failures=[],rows=[];
let browser;
try{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const base=await warlockInventoryFixture(root),index=JSON.parse(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8'));
  const fixture={...base,envelope:kind=>{const envelope=base.envelope(kind);if(kind==='loadout')envelope.prepared.forgeArmourIndex=index;return envelope;}};
  const art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  for(const page of selected){
    for(const mode of ['cached','hint']){
      if(mode==='hint'&&!['Character','Armoury'].includes(page.name))continue;
      const run=await openPage(browser,page,{mode,fixture,art,origin});
      const {timing,calls}=run;
      const first=(path,freshness)=>timing.auth.find(entry=>entry.path===path&&(!freshness||entry.freshness===freshness))?.start??null;
      const pagePath=page.kind?`/bungie/page/${page.kind}`:null;
      const row={page:page.name,mode,html:timing.html,firstModuleEnd:timing.firstModuleEnd,session:first('/session'),account:first('/bungie/account'),pageData:pagePath?first(pagePath,'display'):null,live:pagePath?first(pagePath,'live'):null,loadouts:timing.auth.filter(entry=>entry.path==='/paradox/loadouts').map(entry=>entry.start),firstIcon:timing.icons[0]??null,icons:timing.icons.length,ready:timing.ready};
      rows.push(row);
      if(process.argv.includes('--dump')){console.log(`DUMP ${page.name} ${mode} codeEnd=${timing.codeEnd} code=${timing.codeCount}`);for(const r of timing.dump)console.log('  ',r.join(' '));console.log('ICONS',JSON.stringify(timing.iconOwners));console.log('LONGTASKS');for(const t of timing.longTasks)if(t[1]>200)console.log('  ',t.join(' '));}
      const count=(path,freshness)=>calls.filter(call=>call.path===path&&(!freshness||call.freshness===freshness)).length;
      const label=`${page.name}${mode==='hint'?' (new tab, sign-in hint)':''}`;
      if(run.errors.length)failures.push(`${label}: uncaught page errors: ${[...new Set(run.errors)].join(' | ')}`);
      if(run.writes.length)failures.push(`${label}: Bungie writes during load: ${run.writes.join(', ')}`);
      if(page.head===false){
        const early=calls.filter(call=>call.at<run.started+Number(row.firstModuleEnd||0));
        if(early.length)failures.push(`${label}: sent ${early.map(call=>call.path).join(', ')} before its code loaded.`);
        await run.context.close();continue;
      }
      if(['Forge Loader','Armoury'].includes(page.name)){
        const queue=timing.iconQueue;row.iconPeak=`${queue.peak} (all ${queue.allPeak})`;
        if(!queue.gated)failures.push(`${label}: no item icons rendered.`);
        if(queue.unsized)failures.push(`${label}: ${queue.unsized} of ${queue.gated} item icons have no width and height.`);
        if(queue.peak>6)failures.push(`${label}: ${queue.peak} queued Bungie icon requests in flight at once, the cap is 6.`);
      }
      if(count('/bungie/account')!==1)failures.push(`${label}: /bungie/account sent ${count('/bungie/account')} times, expected once.`);
      if(row.account===null||row.firstModuleEnd===null||row.account>=row.firstModuleEnd)failures.push(`${label}: /bungie/account starts at ${row.account} ms, not before the first module script finishes (${row.firstModuleEnd} ms).`);
      if(pagePath){
        if(count(pagePath,'display')!==1)failures.push(`${label}: ${pagePath} (display) sent ${count(pagePath,'display')} times, expected once.`);
        if(row.pageData===null||row.pageData>=row.firstModuleEnd)failures.push(`${label}: ${pagePath} starts at ${row.pageData} ms, not before the first module script finishes (${row.firstModuleEnd} ms).`);
      }
      if(page.name==='Armoury'&&count('/paradox/loadouts')!==1)failures.push(`Armoury: /paradox/loadouts sent ${count('/paradox/loadouts')} times, expected once.`);
      if(['Forge Loader','Armoury'].includes(page.name)&&row.pageData!==null&&row.firstIcon!==null&&row.firstIcon<row.pageData)failures.push(`${label}: Bungie icons start (${row.firstIcon} ms) before the page data (${row.pageData} ms).`);
      await run.context.close();
    }
  }
  // Prerendered: speculation rules prerender Armoury, which is never opened. Playwright cannot route
  // a prerendered page, so this leg runs in a browser that resolves no outside host (nothing reaches
  // the real Worker or Bungie) and the local server sees what the prerender asked for. The early
  // script itself must hold no write: every request it makes is a plain GET.
  if(!only||only.includes('prerender')){
    const early=await readFile(resolve(root,'astrix-app/shared/forge-early-page-data.js'),'utf8');
    if(/\bmethod\s*:/.test(early)||/\/bungie\/actions\//.test(early))failures.push('forge-early-page-data.js names a request method or a Bungie action route; it may only read.');
    const offline=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    try{
      const page=PAGES.find(row=>row.name==='Armoury');
      const context=await offline.newContext();
      await context.addInitScript(signIn,SESSION);
      const tab=await context.newPage();
      const before=prerenderFetches.length;
      await tab.goto(`${origin}/__prerender-start?to=${encodeURIComponent(page.path)}`,{waitUntil:'load'});
      await tab.waitForTimeout(20000);
      const fetched=prerenderFetches.slice(before);
      const prerendered=fetched.some(row=>row.startsWith(page.path+' '));
      if(!prerendered)failures.push('Prerendered Armoury: this Chromium did not prerender the page, so the check could not run.');
      const stillPrerendered=await tab.evaluate(()=>document.querySelector('a')?.href||'').then(Boolean).catch(()=>false);
      rows.push({page:'Armoury prerendered, not opened',mode:'prerender',html:prerendered?1:0,files:fetched.length,open:stillPrerendered});
      await context.close();
    }finally{await offline.close();}
  }
  // Signed out: no session in this tab and no sign-in hint, so the early script sends nothing.
  if(!only||only.includes('signed-out')){
    const page=PAGES.find(row=>row.kind==='character');
    const context=await browser.newContext();
    const early=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===AUTH)early.push(url.pathname);
      return url.origin===AUTH?route.abort():route.continue();
    });
    const tab=await context.newPage();
    // Stop the page before its modules run, so only what the head sends is counted.
    await tab.route(/\.mjs(\?|$)/,route=>route.abort());
    await tab.goto(new URL(page.path,`http://127.0.0.1:${server.address().port}`).href,{waitUntil:'load'}).catch(()=>{});
    await tab.waitForTimeout(1500);
    if(early.length)failures.push(`Signed out: the page head sent ${early.join(', ')}.`);
    rows.push({page:'Signed out (head only)',mode:'signed-out',sent:early.length});
    await context.close();
  }
}catch(error){
  failures.push(String(error.stack||error));
}finally{
  await browser?.close().catch(()=>{});
  server.close();
}
const ms=value=>value===null||value===undefined?'-':Array.isArray(value)?(value.length?value.join(' and '):'-'):`${value}`;
console.log('Forge early page data, phone 390 px, Slow 4G and 4x CPU, fixture sign-in (ms from navigation start)');
console.log('| Page | Session | First module done | /session | /bungie/account | /bungie/page (display) | /bungie/page (live) | /paradox/loadouts | First Bungie icon | Icons | Peak icons in flight | Ready |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const row of rows){
  if(row.mode==='prerender'){console.log(`| ${row.page} | in tab | - | - | - | - | - | - | - | - | - | prerendered ${row.html?'yes':'no'}, ${row.files} files, start page still open ${row.open?'yes':'no'} |`);continue;}
  if(row.mode==='signed-out'){console.log(`| ${row.page} | signed out | - | - | - | - | - | - | - | - | - | requests from head: ${row.sent} |`);continue;}
  console.log(`| ${row.page} | ${row.mode==='hint'?'new tab':'in tab'} | ${ms(row.firstModuleEnd)} | ${ms(row.session)} | ${ms(row.account)} | ${ms(row.pageData)} | ${ms(row.live)} | ${ms(row.loadouts)} | ${ms(row.firstIcon)} | ${row.icons} | ${ms(row.iconPeak)} | ${ms(row.ready)} |`);
}
if(failures.length&&!REPORT){for(const failure of failures)console.error(`FAIL ${failure}`);console.log('FORGE_EARLY_PAGE_DATA=FAIL');process.exit(1);}
if(failures.length)for(const failure of failures)console.log(`NOTE ${failure}`);
console.log(`FORGE_EARLY_PAGE_DATA=${REPORT?'REPORT':'PASS'}`);
