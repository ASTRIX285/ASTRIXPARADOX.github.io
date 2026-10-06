#!/usr/bin/env node
// Seamless tool transitions (4 Oct 2026). Real tool pages with fixture Bungie data (nothing leaves
// the machine), at 1600 (tabs) and 390 (drawer). For every tool tab: open another tool page, wait
// for it to be ready, point at the tab (hover or touch start, as a player would), tap it, and
// sample every frame of the destination. It fails if:
//   - any frame shows the destination before its one readiness event (forge:portal-ready): the
//     destination must be prerendering, covered (html.apx-transfer) or held behind the outgoing
//     page (native view transition) until then;
//   - the readiness event fires more than once;
//   - the portal loader (ring or breach) appears on an internal move;
//   - the layout jumps after the page is shown (layout shift over 0.1 in the first second).
// It also reports the time from tap to the new page shown, per tab.
//   SEAMLESS_ROOT=<checkout>        measure another checkout (with SEAMLESS_MEASURE_ONLY=1: no asserts)
//   SEAMLESS_FRAMES_DIR=<dir>       write frame strips (screencast) there, outside the repo
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const here=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const root=resolve(process.env.SEAMLESS_ROOT||here);
const measureOnly=process.env.SEAMLESS_MEASURE_ONLY==='1';
const {warlockInventoryFixture,routeWarlockFixture}=await import(pathToFileURL(join(here,'astrix-app/tools/fixtures/warlock-inventory-fixture.mjs')).href);
const fixture=await warlockInventoryFixture(here);
const ONLY=process.env.SEAMLESS_ONLY?process.env.SEAMLESS_ONLY.split(','):null;
const TABS=[
  ['Journey','/astrix-app/pages/journey/'],['Character','/astrix-app/pages/guardian-workspace-v2/'],['Forge Loader','/astrix-app/pages/forge-loader/'],
  ['Builder','/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'],['Reports','/astrix-app/pages/reports/'],['Storage','/astrix-app/pages/vault/'],['Armoury','/astrix-app/pages/loadout/']
];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
// Every frame the destination paints is sampled. Visible to the player means: not prerendering,
// not covered and not held behind the outgoing page.
const INSTRUMENT=()=>{
  const state=window.__seamless={ready:[],samples:[],shownAt:null,gates:[],shift:0,start:performance.timeOrigin};
  document.addEventListener('forge:portal-ready',()=>state.ready.push(performance.now()));
  const sample=()=>{
    if(!document.prerendering){
      const html=document.documentElement,gate=document.querySelector('.apx-gate');
      const covered=html.classList.contains('apx-transfer'),held=html.classList.contains('apx-navigation-waiting');
      const recovery=Boolean(gate&&gate.classList.contains('is-recovery')&&!gate.classList.contains('is-done'));
      const visible=!covered&&!held;
      state.samples.push({t:performance.now(),visible,ready:state.ready.length>0,recovery});
      if(gate&&/breach-pending|is-breach|ring-visible/.test(gate.className))state.gates.push(gate.className);
      if(visible&&state.shownAt===null)state.shownAt=performance.now();
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  new PerformanceObserver(list=>{for(const entry of list.getEntries()){
    if(state.shownAt!==null&&!entry.hadRecentInput&&entry.startTime-state.shownAt<1000)state.shift+=entry.value;
  }}).observe({type:'layout-shift',buffered:false});
};
// Reports needs its own Worker routes, which the Warlock fixture does not serve. Since the shared
// recovery panel (#450), a Reports page with no data covers the tool tabs, so serve it honestly:
// the real public activity catalogue, the fixture's own characters, and no clears.
const reportsCatalogue=JSON.parse(await readFile(join(here,'astrix-app/tools/fixtures/reports-catalogue-current.json'),'utf8'));
async function routeReports(context,origin){
  const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
  const json=(route,body)=>route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(body)});
  const characters=Object.fromEntries(Object.values(fixture.profile.characters?.data||{}).map(row=>[row.characterId,{characterId:row.characterId,classType:row.classType}]));
  await context.route('https://auth.astrixparadox.com/bungie/reports**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/bungie/reports/catalogue')return json(route,reportsCatalogue);
    if(url.searchParams.get('kind')==='profile')return json(route,{ErrorCode:1,Response:{characters:{data:characters}}});
    if(['aggregate','history'].includes(url.searchParams.get('kind')))return json(route,{ErrorCode:1,Response:{activities:[]}});
    return route.fallback();
  });
}
const failures=[],timings=[];
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(here,'img/ax-logo-160.webp'));
  const framesDir=process.env.SEAMLESS_FRAMES_DIR;
  for(const [width,height] of [[1600,900],[390,844]]){
    for(let index=0;index<TABS.length;index++){
      const [name,path]=TABS[index],[fromName,fromPath]=TABS[(index+TABS.length-1)%TABS.length];
      if(ONLY&&!ONLY.includes(name))continue;
      const context=await browser.newContext({viewport:{width,height},...(width<600?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
      // Context routes reach prerendered documents too.
      await routeWarlockFixture({route:(pattern,handler)=>context.route(pattern,handler)},{origin,fixture,art});await routeReports(context,origin);
      await context.addInitScript(INSTRUMENT);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(String(error.stack||error.message).split(/\r?\n/).slice(0,2).join(' ').replace(/http:\/\/127\.0\.0\.1:\d+/g,'')));
      await page.goto(origin+fromPath,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__seamless?.ready.length>0,null,{timeout:30000}).catch(()=>{});
      await page.waitForTimeout(400);
      let frames=[],cdp=null;
      if(framesDir){
        cdp=await context.newCDPSession(page);
        cdp.on('Page.screencastFrame',event=>{frames.push({t:Date.now(),data:event.data});cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
        await cdp.send('Page.startScreencast',{format:'jpeg',quality:60,maxWidth:width<600?390:800,everyNthFrame:1});
      }
      // Point at the destination as a player would, then tap it.
      // The tab or drawer link whose path is the destination (a tab may carry a query, such as Forge Loader's).
      const linkFor=async scope=>{const index=await page.evaluate(([scope,path])=>[...document.querySelectorAll(scope+' a')].findIndex(a=>new URL(a.href).pathname===path),[scope,path]);return page.locator(scope+' a').nth(index);};
      let link;
      if(width<600){
        await page.click('.ax-menu-btn');await page.waitForTimeout(350);
        link=await linkFor('.ax-drawer-links');
        await link.dispatchEvent('pointerdown');
      }else{
        link=await linkFor('.apx-destination-ribbon');
        await link.hover();
      }
      await page.waitForTimeout(1500);
      const tappedAt=Date.now();
      await link.click();
      await page.waitForURL(url=>new URL(url).pathname===path,{timeout:15000});
      await page.waitForFunction(()=>window.__seamless&&window.__seamless.shownAt!==null&&window.__seamless.ready.length>0,null,{timeout:30000}).catch(()=>{});
      await page.waitForTimeout(1100);
      const result=await page.evaluate(()=>window.__seamless&&{...window.__seamless,prerendered:(performance.getEntriesByType('navigation')[0]?.activationStart||0)>0});
      if(cdp){await cdp.send('Page.stopScreencast').catch(()=>{});await mkdir(framesDir,{recursive:true});
        const picked=frames.filter(frame=>frame.t>=tappedAt-200).filter((_,i,all)=>all.length<=12||i%Math.ceil(all.length/12)===0);
        await Promise.all(picked.map((frame,i)=>writeFile(join(framesDir,`${name.replace(/ /g,'-')}-${width}-${String(i).padStart(2,'0')}-${frame.t-tappedAt}ms.jpg`),Buffer.from(frame.data,'base64'))));}
      const label=`${width} ${fromName} -> ${name}`;
      if(!result){failures.push(`${label}: destination not instrumented`);await context.close();continue;}
      const early=result.samples.filter(row=>row.visible&&!row.ready&&!row.recovery);
      if(early.length)failures.push(`${label}: ${early.length} frame(s) showed the page before it was ready`);
      if(result.ready.length!==1)failures.push(`${label}: readiness fired ${result.ready.length} times`);
      if(result.gates.length)failures.push(`${label}: portal loader shown on an internal move (${result.gates[0]})`);
      if(result.shift>0.1)failures.push(`${label}: layout moved after the page was shown (shift ${result.shift.toFixed(3)})`);
      if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);
      const shown=result.shownAt===null?null:Math.round(result.start+result.shownAt-tappedAt);
      timings.push({width,name,from:fromName,shownMs:shown,earlyFrames:early.length,prerendered:result.prerendered});
      await context.close();
    }
  }
  // A failed transfer: Bungie stops answering after the tap. The destination shows its recovery
  // actions (retry kept) at once, with no loader animation and nothing left covered.
  if(!ONLY){
    const context=await browser.newContext({viewport:{width:1600,height:900}});
    await routeWarlockFixture({route:(pattern,handler)=>context.route(pattern,handler)},{origin,fixture,art});await routeReports(context,origin);
    const page=await context.newPage();
    await page.goto(origin+'/astrix-app/pages/journey/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ForgeLoader?.completed===true,null,{timeout:30000});
    await context.route('https://auth.astrixparadox.com/**',route=>route.abort('connectionrefused'));
    await page.evaluate(()=>{try{sessionStorage.clear();}catch{}});
    await page.locator('.apx-destination-ribbon a[href="/astrix-app/pages/vault/"]').click();
    await page.waitForURL(url=>new URL(url).pathname==='/astrix-app/pages/vault/',{timeout:15000});
    const recovery=await page.waitForFunction(()=>{const gate=document.querySelector('.apx-gate');return gate&&!gate.querySelector('.apx-failure-panel')?.hidden&&{
      recovery:gate.classList.contains('is-recovery'),animated:/breach-pending|is-breach|ring-visible/.test(gate.className),
      retry:Boolean(gate.querySelector('.apx-retry-button')?.offsetParent),covered:document.documentElement.classList.contains('apx-transfer')};},null,{timeout:35000}).then(handle=>handle.jsonValue()).catch(()=>null);
    if(!recovery)failures.push('failed transfer: no recovery actions shown');
    else{
      if(!recovery.recovery||recovery.animated)failures.push('failed transfer: recovery must be the still panel, no loader animation');
      if(!recovery.retry)failures.push('failed transfer: retry must stay available');
      if(recovery.covered)failures.push('failed transfer: the page must not stay covered');
    }
    await context.close();
  }
  // Prerender supported, but the tab is tapped with no hover or touch start first, so nothing was
  // prerendered or warmed. The outgoing page must stay on screen, its tab pressed, until the warm
  // step (its warm fetch of the destination page, held back here for 1.2 s) has finished.
  if(!ONLY){
    const context=await browser.newContext({viewport:{width:1600,height:900}});
    await routeWarlockFixture({route:(pattern,handler)=>context.route(pattern,handler)},{origin,fixture,art});await routeReports(context,origin);
    let hold=false,releasedAt=null;
    await context.route(origin+'/astrix-app/pages/vault/',async route=>{
      // Only the warm step's fetch; the navigation itself is a document request.
      if(hold&&route.request().resourceType()==='fetch'){hold=false;await new Promise(done=>setTimeout(done,1200));releasedAt=Date.now();}
      return route.fallback();
    });
    const page=await context.newPage();
    await page.goto(origin+'/astrix-app/pages/journey/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ForgeLoader?.completed===true,null,{timeout:30000});
    const supported=await page.evaluate(()=>Boolean(HTMLScriptElement.supports?.('speculationrules')));
    if(!supported)failures.push('no-hover tap: this Chromium must support speculation rules for this case');
    let navigatedAt=null;
    page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&new URL(frame.url()).pathname==='/astrix-app/pages/vault/'&&navigatedAt===null)navigatedAt=Date.now();});
    hold=true;
    const tab=page.locator('.apx-destination-ribbon a[href="/astrix-app/pages/vault/"]');
    // A click event only: no pointer movement, hover or touch start before it.
    await tab.dispatchEvent('click',{button:0});
    await page.waitForTimeout(600);
    const during=await page.evaluate(()=>({path:location.pathname,busy:document.querySelector('.apx-destination-ribbon a[href="/astrix-app/pages/vault/"]')?.getAttribute('aria-busy')}));
    if(during.path!=='/astrix-app/pages/journey/')failures.push('no-hover tap: the outgoing page left before the warm step finished');
    if(during.busy!=='true')failures.push('no-hover tap: the tab must show its pressed state while warming');
    await page.waitForURL(url=>new URL(url).pathname==='/astrix-app/pages/vault/',{timeout:15000});
    if(releasedAt===null||navigatedAt===null||navigatedAt<releasedAt)failures.push(`no-hover tap: navigated before the warm step finished (${navigatedAt&&releasedAt?navigatedAt-releasedAt:'?'} ms)`);
    await context.close();
  }
}finally{await browser?.close();server.close();}
console.log('| Tab | Width | From | Tap to new page shown | Prerendered | Frames shown before ready |\n|---|---|---|---|---|---|');
for(const row of timings)console.log(`| ${row.name} | ${row.width} | ${row.from} | ${row.shownMs===null?'not shown':`${row.shownMs} ms`} | ${row.prerendered?'yes':'no'} | ${row.earlyFrames} |`);
if(!measureOnly){
  assert.deepEqual(failures,[],`Seamless transitions:\n${failures.join('\n')}`);
  console.log(`SEAMLESS_TRANSITIONS=PASS ${TABS.length} tool tabs at 1600 and 390: no frame before readiness, readiness once, no portal loader on internal moves, no layout jump after reveal; a failed transfer shows still recovery with retry; a tap with no hover keeps the outgoing page until the warm step finishes`);
}else console.log(`SEAMLESS_TRANSITIONS=MEASURED ${failures.length} problem(s)${failures.length?`:\n${failures.join('\n')}`:''}`);
