#!/usr/bin/env node
// Tool page load measurement. Default --mode attach: Miguel's own Chrome started by perf-signin.mjs and
// signed in by him (profile outside the repo). It never prints or stores cookies, tokens, auth headers,
// request bodies or query values.
//   node perf-measure.mjs [--mode attach|launch] [--out <dir outside the repo>] [--profiles desktop,phone] [--pages Home,Journey] [--runs 1]
// Phone profile: 390x844 at 3x, Lighthouse "Slow 4G" applied throttling (562.5 ms latency,
// 1474.56 Kbps down, 675 Kbps up) and 4x CPU slowdown. Desktop: 1600x900, no throttling.
// Each page: a cold load (browser cache cleared, cookies kept) then a warm load (cache kept).
// Per load: first contentful paint, time to usable (forge:portal-ready, else network and DOM quiet),
// HTML, JS/CSS, module chain depth, Worker calls (auth.astrixparadox.com), prepared page payload and
// live profile, render after the last data response, the five slowest requests, and files fetched
// under more than one URL.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DEFAULT_OUT_DIR,DEFAULT_PROFILE_DIR,outsideRepo} from './perf-paths.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const arg=(name,fallback)=>{const index=process.argv.indexOf(`--${name}`);return index>0?process.argv[index+1]:fallback;};
const BASE=arg('base','https://astrixparadox.com'),OUT=outsideRepo(arg('out',DEFAULT_OUT_DIR),'the output folder'),RUNS=Number(arg('runs','1'));
const PROFILE_DIR=outsideRepo(process.env.ASTRIX_PERF_PROFILE||DEFAULT_PROFILE_DIR,'the browser profile');
const AUTH_HOST='auth.astrixparadox.com';
export const TOOL_PAGES=[
  ['Home','/astrix-app/pages/home/'],['Journey','/astrix-app/pages/journey/'],['Character','/astrix-app/pages/guardian-workspace-v2/'],
  ['Forge Loader','/astrix-app/pages/forge-loader/'],['Build Forge','/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'],
  ['Reports','/astrix-app/pages/reports/'],['Storage','/astrix-app/pages/vault/'],['Armoury','/astrix-app/pages/loadout/']
];
export const PROFILES={
  desktop:{viewport:{width:1600,height:900},deviceScaleFactor:1,isMobile:false,network:null,cpu:1},
  phone:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,network:{latency:562.5,downloadThroughput:1474.56*1024/8,uploadThroughput:675*1024/8},cpu:4}
};
const wantedProfiles=arg('profiles','desktop,phone').split(','),wantedPages=arg('pages','')?arg('pages','').split(','):null;
// Paths only: no query values (they can carry codes or cache keys that are not needed here).
const safePath=url=>{try{const u=new URL(url);return `${u.host===new URL(BASE).host?'':u.host}${u.pathname}`;}catch{return 'unknown';}};
const kb=bytes=>Math.round(bytes/102.4)/10;

async function measureLoad(context,page,cdp,url,{cold}){
  const requests=new Map();
  const onSent=event=>{
    if(event.request.url.startsWith('data:'))return;
    const parent=event.initiator?.url||event.initiator?.stack?.callFrames?.[0]?.url||event.initiator?.stack?.parent?.callFrames?.[0]?.url||'';
    requests.set(event.requestId,{url:event.request.url,type:event.type,start:event.timestamp,end:null,bytes:0,status:0,fromCache:false,parent});
  };
  const onResponse=event=>{const row=requests.get(event.requestId);if(row){row.status=event.response.status;row.fromCache=Boolean(event.response.fromDiskCache||event.response.fromServiceWorker||event.response.fromPrefetchCache);row.mime=event.response.mimeType;}};
  // Streamed responses (the prepared page payload) report their bytes in dataReceived chunks.
  const onData=event=>{const row=requests.get(event.requestId);if(row){row.streamed=(row.streamed||0)+(event.encodedDataLength||0);row.lastData=event.timestamp;}};
  const onFinished=event=>{const row=requests.get(event.requestId);if(row){row.end=event.timestamp;row.bytes=Math.max(event.encodedDataLength||0,row.streamed||0);}};
  const onFailed=event=>{const row=requests.get(event.requestId);if(row){row.end=event.timestamp;row.failed=true;}};
  cdp.on('Network.requestWillBeSent',onSent);cdp.on('Network.responseReceived',onResponse);cdp.on('Network.loadingFinished',onFinished);cdp.on('Network.loadingFailed',onFailed);cdp.on('Network.dataReceived',onData);
  if(cold)await cdp.send('Network.clearBrowserCache');
  const navStart=Date.now();
  await page.goto(url,{waitUntil:'commit',timeout:120000});
  await page.waitForFunction(()=>document.documentElement&&document.body,null,{timeout:120000,polling:100});
  // Usable: forge:portal-ready; otherwise 2 s with no new requests and no DOM changes (max 60 s).
  const usable=await page.evaluate(()=>new Promise(resolve=>{
    const t0=performance.timeOrigin;let lastChange=performance.now();
    if(window.__axUsable)return resolve({ms:window.__axUsable,signal:'forge:portal-ready'});
    document.addEventListener('forge:portal-ready',()=>resolve({ms:performance.now(),signal:'forge:portal-ready'}),{once:true});
    new MutationObserver(()=>{lastChange=performance.now();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
    new PerformanceObserver(list=>{if(list.getEntries().length)lastChange=performance.now();}).observe({type:'resource',buffered:false});
    const tick=setInterval(()=>{const now=performance.now();if(now-lastChange>2000&&document.readyState==='complete'){clearInterval(tick);resolve({ms:lastChange,signal:'network and DOM quiet'});}if(now>60000){clearInterval(tick);resolve({ms:now,signal:'timeout 60 s'});}},250);
  }));
  await page.waitForTimeout(500);
  const paint=await page.evaluate(()=>{const fcp=performance.getEntriesByName('first-contentful-paint')[0];const nav=performance.getEntriesByType('navigation')[0];return {fcp:fcp?Math.round(fcp.startTime):null,dcl:nav?Math.round(nav.domContentLoadedEventEnd):null,load:nav?Math.round(nav.loadEventEnd):null,html:nav?{start:Math.round(nav.requestStart),end:Math.round(nav.responseEnd),bytes:nav.encodedBodySize}:null};});
  cdp.off('Network.requestWillBeSent',onSent);cdp.off('Network.responseReceived',onResponse);cdp.off('Network.loadingFinished',onFinished);cdp.off('Network.loadingFailed',onFailed);cdp.off('Network.dataReceived',onData);
  // A request still open when the load is measured keeps the bytes received so far and is marked open.
  for(const row of requests.values())if(!row.end){row.open=true;row.bytes=row.streamed||0;}
  const rows=[...requests.values()];
  const t0=Math.min(...rows.map(row=>row.start));
  const rel=row=>({path:safePath(row.url),type:row.type,start:Math.round((row.start-t0)*1000),ms:row.end?Math.round((row.end-row.start)*1000):null,end:row.end?Math.round((row.end-t0)*1000):null,open:Boolean(row.open),lastByte:row.lastData?Math.round((row.lastData-t0)*1000):null,kb:kb(row.bytes),cache:row.fromCache,status:row.status});
  const isCode=row=>['Script','Stylesheet'].includes(row.type)||/\.(m?js|css)(\?|$)/.test(row.url);
  const isWorker=row=>new URL(row.url).host===AUTH_HOST;
  const code=rows.filter(isCode),worker=rows.filter(isWorker),data=worker.filter(row=>/\/bungie\/(page|profile)/.test(new URL(row.url).pathname));
  // Module chain depth: longest chain of script initiators from the document.
  const byUrl=new Map(rows.map(row=>[row.url,row])),depth=new Map();
  const depthOf=(url,seen=new Set())=>{if(depth.has(url))return depth.get(url);if(seen.has(url))return 0;seen.add(url);const row=byUrl.get(url);const value=row&&row.parent&&byUrl.has(row.parent)&&isCode(byUrl.get(row.parent))?1+depthOf(row.parent,seen):1;depth.set(url,value);return value;};
  const moduleDepth=Math.max(0,...code.filter(row=>/\.mjs(\?|$)/.test(row.url)).map(row=>depthOf(row.url)));
  // The same file under more than one URL (query strings differ).
  const variants=new Map();for(const row of code){const key=new URL(row.url).origin+new URL(row.url).pathname;if(!variants.has(key))variants.set(key,new Set());variants.get(key).add(row.url);}
  const duplicates=[...variants.entries()].filter(([,set])=>set.size>1).map(([key,set])=>({path:safePath(key),urls:set.size}));
  const lastData=Math.max(0,...data.filter(row=>row.end).map(row=>(row.end-t0)*1000));
  return {
    url:safePath(url),wallMs:Date.now()-navStart,fcp:paint.fcp,usable:Math.round(usable.ms),usableSignal:usable.signal,dcl:paint.dcl,
    requests:rows.length,kb:kb(rows.reduce((sum,row)=>sum+row.bytes,0)),
    html:paint.html,
    code:{requests:code.length,kb:kb(code.reduce((sum,row)=>sum+row.bytes,0)),firstStart:code.length?Math.round((Math.min(...code.map(row=>row.start))-t0)*1000):null,lastEnd:code.length?Math.round((Math.max(...code.filter(row=>row.end).map(row=>row.end))-t0)*1000):null,moduleDepth},
    worker:worker.map(rel),
    data:{firstStart:data.length?Math.round((Math.min(...data.map(row=>row.start))-t0)*1000):null,lastEnd:data.some(row=>row.end)?Math.round(lastData):null,open:data.filter(row=>row.open).length,kb:kb(data.reduce((sum,row)=>sum+(row.bytes||0),0))},
    renderAfterData:data.length?Math.max(0,Math.round(usable.ms-lastData)):null,
    slowest:rows.filter(row=>row.end).sort((a,b)=>(b.end-b.start)-(a.end-a.start)).slice(0,5).map(rel),
    largest:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(rel),
    duplicates
  };
}

// Phone emulation per tab: viewport, 3x pixels, touch and a mobile user agent.
const PHONE_UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
async function prepareTab(page,cdp,profile){
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:profile.viewport.width,height:profile.viewport.height,deviceScaleFactor:profile.deviceScaleFactor,mobile:profile.isMobile});
  if(profile.hasTouch)await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  if(profile.isMobile)await cdp.send('Emulation.setUserAgentOverride',{userAgent:PHONE_UA});
  if(profile.network)await cdp.send('Network.emulateNetworkConditions',{offline:false,...profile.network});
  if(profile.cpu>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});
  await page.addInitScript(()=>{document.addEventListener('forge:portal-ready',()=>{window.__axUsable=performance.now();},{once:true});});
}
async function measurePages(context,page,cdp,profileName,results){
  for(const [name,path] of TOOL_PAGES){
    if(wantedPages&&!wantedPages.includes(name))continue;
    for(let run=0;run<RUNS;run++)for(const cold of [true,false]){
      const row=await measureLoad(context,page,cdp,BASE+path,{cold}).catch(error=>({error:error.message.split('\n')[0]}));
      results.push({page:name,profile:profileName,cache:cold?'cold':'warm',run,...row});
      console.log(`${profileName} ${cold?'cold':'warm'} ${name}: fcp ${row.fcp??'-'} ms, usable ${row.usable??'-'} ms (${row.usableSignal||row.error}), ${row.requests??'-'} requests, ${row.kb??'-'} KB`);
    }
  }
}

// attach (default): Miguel's own Chrome from perf-signin.mjs, already signed in by Miguel. This tool
// opens its own tabs there and closes only those tabs; it never signs in and never prints the session.
// launch: a headless browser with its own profile (signed-out and local runs).
async function run(){
  await mkdir(OUT,{recursive:true});
  const results=[],mode=arg('mode','attach');
  if(mode==='attach'){
    const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context=browser.contexts()[0];
    // Every tab this tool opens is closed again, even after a failure; Miguel's own tabs are never touched.
    const probe=await context.newPage();
    let signedIn=false;
    try{
      await probe.goto(BASE+'/astrix-app/pages/home/',{waitUntil:'domcontentloaded'});
      // Only a yes or no leaves the page: the session body itself is never read out.
      signedIn=await probe.evaluate(async()=>{try{const response=await fetch('https://auth.astrixparadox.com/session',{credentials:'include',headers:{Accept:'application/json'}});return (await response.json())?.authenticated===true;}catch{return false;}});
    }finally{await probe.close().catch(()=>{});}
    if(!signedIn){console.error('Bungie does not report an active session in this Chrome profile. Stopping; sign-in is left to Miguel.');process.exit(3);}
    console.log('Bungie session active (yes/no check only).');
    for(const profileName of wantedProfiles){
      const page=await context.newPage();
      try{
        const cdp=await context.newCDPSession(page);
        await prepareTab(page,cdp,PROFILES[profileName]);
        await measurePages(context,page,cdp,profileName,results);
        await cdp.detach().catch(()=>{});
      }finally{await page.close().catch(()=>{});}
    }
  }else{
    for(const profileName of wantedProfiles){
      const profile=PROFILES[profileName];
      const context=await chromium.launchPersistentContext(PROFILE_DIR,{headless:true,viewport:profile.viewport,deviceScaleFactor:profile.deviceScaleFactor,isMobile:profile.isMobile,hasTouch:Boolean(profile.hasTouch)});
      const page=context.pages()[0]||await context.newPage(),cdp=await context.newCDPSession(page);
      await prepareTab(page,cdp,profile);
      await measurePages(context,page,cdp,profileName,results);
      await context.close();
    }
  }
  await writeFile(join(OUT,'perf-results.json'),JSON.stringify(results,null,1));
  return results;
}
if(process.argv[1]?.endsWith('perf-measure.mjs')){await run();process.exit(0);}
