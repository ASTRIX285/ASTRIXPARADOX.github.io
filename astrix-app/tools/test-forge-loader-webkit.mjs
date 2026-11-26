#!/usr/bin/env node
// Forge Loader iPhone stability (26 Nov 2026). The old iPhone "Can't open this page" report on
// Forge Loader (queued as fix/forge-loader-mobile). The real page is served locally with the full
// Warlock inventory fixture and the real prepared armour index (nothing leaves the machine, no
// sign-in) and held open for 60 s from the load event. Bungie art is a local stand-in.
//   WebKit leg: Playwright WebKit, iPhone 15 profile (393 px wide, deviceScaleFactor 3). Records DOM
//   node count at 0, 30 and 60 s, page crashes, uncaught errors and render activity
//   (requestAnimationFrame callbacks and DOM mutations per 5 s window).
//   Heap leg: WebKit has no JS heap reading in Playwright, so the same page and profile run once more
//   in Chromium, where the DevTools protocol reports the JS heap after a forced garbage collection.
// Fails on: a crash, an uncaught page error, steady growth (heap or DOM nodes up more than 10% from
// 0 to 30 s and again from 30 to 60 s), or a loop that never settles (DOM mutations in every 5 s
// window from 30 to 60 s, or 30 or more animation frames per second over the last 10 s).
// Needs the Playwright WebKit browser (npx playwright install webkit). Exit 2 when it is missing.
//   node astrix-app/tools/test-forge-loader-webkit.mjs [--seconds 60]
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
const require=createRequire(import.meta.url);
const {webkit,chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const arg=(name,fallback)=>{const index=process.argv.indexOf(`--${name}`);return index>0?process.argv[index+1]:fallback;};
const SECONDS=Number(arg('seconds','60')),MID=Math.round(SECONDS/2),WINDOW=5;
const PATH='/astrix-app/pages/forge-loader/';
const IPHONE={...devices['iPhone 15'],viewport:{width:393,height:devices['iPhone 15'].viewport.height},deviceScaleFactor:3};

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});

// Counts animation frames and DOM mutations from the first script on the page.
const probe=()=>{
  const counters={frames:0,mutations:0};window.__axStability=counters;
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(time=>{counters.frames++;return callback(time);});
  const start=()=>new MutationObserver(list=>{counters.mutations+=list.length;}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
  if(document.documentElement)start();else document.addEventListener('readystatechange',start,{once:true});
};
const sample=page=>page.evaluate(()=>({nodes:document.getElementsByTagName('*').length,frames:window.__axStability?.frames??0,mutations:window.__axStability?.mutations??0}));

async function hold(page,{heap}){
  const samples={},windows=[];let previous=await sample(page);
  const read=async second=>{const row=await sample(page);if(heap)row.heap=await heap();samples[second]=row;};
  await read(0);
  for(let second=WINDOW;second<=SECONDS;second+=WINDOW){
    await page.waitForTimeout(WINDOW*1000);
    const now=await sample(page);
    windows.push({to:second,frames:now.frames-previous.frames,mutations:now.mutations-previous.mutations});
    previous=now;
    if(second===MID||second===SECONDS)await read(second);
  }
  return {samples,windows};
}
const grows=(a,b,c)=>a>0&&b>a*1.1&&c>b*1.1;
const neverSettles=windows=>{
  const late=windows.filter(row=>row.to>MID);
  const last=windows.filter(row=>row.to>SECONDS-10);
  const fps=last.reduce((sum,row)=>sum+row.frames,0)/(last.length*WINDOW||1);
  return {mutating:late.length>0&&late.every(row=>row.mutations>0),fps:Math.round(fps*10)/10,looping:late.length>0&&late.every(row=>row.mutations>0)||fps>=30};
};

async function open(browser,label){
  const context=await browser.newContext(IPHONE),errors=[];let crashed=false;
  await routeWarlockFixture({route:(pattern,handler)=>context.route(pattern,handler)},{origin,fixture,art});
  await context.addInitScript(probe);
  const page=await context.newPage();
  page.on('crash',()=>{crashed=true;});
  page.on('pageerror',error=>errors.push(String(error.message).split('\n')[0]));
  await page.goto(origin+PATH,{waitUntil:'load',timeout:120000});
  return {context,page,errors,isCrashed:()=>crashed,label};
}

const failures=[];
let origin,fixture,art,webkitBrowser,chromiumBrowser;
try{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  origin=`http://127.0.0.1:${server.address().port}`;
  // The shared fixture plus the real prepared armour index (astrix-app/data/forge-armour-index.json),
  // as the Worker sends it with the loadout page, so the full Exotic catalogue renders.
  const base=await warlockInventoryFixture(root),index=JSON.parse(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8'));
  fixture={...base,envelope:page=>{const envelope=base.envelope(page);if(page==='loadout')envelope.prepared.forgeArmourIndex=index;return envelope;}};
  art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  try{webkitBrowser=await webkit.launch({headless:true});}
  catch(error){console.error(`WebKit is not installed for Playwright (npx playwright install webkit). ${String(error.message).split('\n')[0]}`);process.exitCode=2;throw null;}

  // WebKit leg: crash, errors, DOM nodes and render activity.
  const wk=await open(webkitBrowser,'webkit');
  let wkResult=null;
  try{wkResult=await hold(wk.page,{heap:null});}
  catch(error){if(!wk.isCrashed())failures.push(`WebKit: the page stopped answering (${String(error.message).split('\n')[0]}).`);}
  if(wk.isCrashed())failures.push('WebKit: the page crashed.');
  if(wk.errors.length)failures.push(`WebKit: uncaught page errors: ${[...new Set(wk.errors)].join(' | ')}`);
  await wk.context.close().catch(()=>{});

  // Heap leg: Chromium with the same profile, JS heap after a forced garbage collection.
  chromiumBrowser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  const cr=await open(chromiumBrowser,'chromium');
  const cdp=await cr.context.newCDPSession(cr.page);
  await cdp.send('Performance.enable');
  const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');const {metrics}=await cdp.send('Performance.getMetrics');return Math.round((metrics.find(row=>row.name==='JSHeapUsedSize')?.value||0)/1024);};
  let crResult=null;
  try{crResult=await hold(cr.page,{heap});}
  catch(error){failures.push(`Chromium heap leg: the page stopped answering (${String(error.message).split('\n')[0]}).`);}
  if(cr.isCrashed())failures.push('Chromium heap leg: the page crashed.');
  await cr.context.close().catch(()=>{});

  const at=(result,key)=>[0,MID,SECONDS].map(second=>result?.samples[second]?.[key]??null);
  const wkNodes=at(wkResult,'nodes'),crHeap=at(crResult,'heap'),crNodes=at(crResult,'nodes');
  const wkLoop=wkResult?neverSettles(wkResult.windows):null,crLoop=crResult?neverSettles(crResult.windows):null;
  console.log(`Forge Loader, iPhone 15 profile (${IPHONE.viewport.width} px, ${IPHONE.deviceScaleFactor}x), full Warlock inventory fixture, ${SECONDS} s`);
  console.log(`WEBKIT_CRASHED=${wk.isCrashed()}`);
  console.log(`WEBKIT_DOM_NODES=${wkNodes.join(',')} (0, ${MID}, ${SECONDS} s)`);
  console.log(`WEBKIT_WINDOWS=${(wkResult?.windows||[]).map(row=>`${row.to}s:${row.frames}f/${row.mutations}m`).join(' ')}`);
  console.log(`WEBKIT_LOOP=${wkLoop?`${wkLoop.looping?'never settles':'settled'} (last 10 s ${wkLoop.fps} frames/s, mutations in every late window: ${wkLoop.mutating})`:'-'}`);
  console.log(`CHROMIUM_JS_HEAP_KB=${crHeap.join(',')} (0, ${MID}, ${SECONDS} s, after GC)`);
  console.log(`CHROMIUM_DOM_NODES=${crNodes.join(',')}`);
  console.log(`CHROMIUM_LOOP=${crLoop?`${crLoop.looping?'never settles':'settled'} (last 10 s ${crLoop.fps} frames/s)`:'-'}`);
  if(wkResult&&grows(...wkNodes))failures.push(`WebKit: DOM nodes keep growing (${wkNodes.join(' to ')}).`);
  if(crResult&&grows(...crHeap))failures.push(`Chromium heap leg: JS heap keeps growing (${crHeap.join(' to ')} KB).`);
  if(wkLoop?.looping)failures.push(`WebKit: render loop never settles (last 10 s ${wkLoop.fps} frames/s, mutations in every window after ${MID} s: ${wkLoop.mutating}).`);
  if(crLoop?.looping)failures.push(`Chromium heap leg: render loop never settles (last 10 s ${crLoop.fps} frames/s).`);
}catch(error){
  if(error)failures.push(String(error.stack||error));
}finally{
  await webkitBrowser?.close().catch(()=>{});
  await chromiumBrowser?.close().catch(()=>{});
  server.close();
}
if(process.exitCode===2)process.exit(2);
if(failures.length){for(const failure of failures)console.error(`FAIL ${failure}`);console.log('FORGE_LOADER_WEBKIT=FAIL');process.exit(1);}
console.log('FORGE_LOADER_WEBKIT=PASS');
