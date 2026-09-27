import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const routes=['vault','journey','forge-loader','guardian-workspace-v2','guardian-workspace-v2/paradox-build-space'];
const pages=new Map();
for(const route of routes){
 const html=await readFile(resolve(root,`astrix-app/pages/${route}/index.html`),'utf8');
 // Use the actual page, CSS, preloads and controller. Account runtimes are
 // excluded so this test owns when data completes, without credentials.
 pages.set(`/astrix-app/pages/${route}/`,html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>
  /src=["'][^"']*astrix-portal-loader\.js/.test(tag)||(!/\bsrc=/.test(tag)&&/window\.APX_LOGO=/.test(tag))?tag.replace(/window\.APX_AUTO_READY\s*=\s*true/g,'window.APX_AUTO_READY=false'):''));
}
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pages.has(pathname)){
  res.setHeader('Content-Type','text/html');
  const fixture=new URL(req.url,'http://localhost').searchParams.has('navigationFixture');
  res.end(pages.get(pathname)+(fixture?`<script>document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{const node=document.createElement('p');node.id='fixture-populated';node.textContent='Destination fixture populated';document.body.append(node);document.dispatchEvent(new CustomEvent('forge:hero-cards-render-complete'));window.ForgeLoader.done();},700));</script>`:''));return;
 }
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 // `delay` is how long the breach takes to become ready. By default a stub module
 // stands in for the real WebGL breach, so the result never depends on the
 // machine's GPU or CPU speed. One `real` smoke case uses the real module and
 // only asserts a single skin per load.
 async function run(route,delay,{reduced=false,noWebGL=false,earlyDone=false,entry=true,real=false}={}){
  const page=await browser.newPage({viewport:{width:1100,height:800},reducedMotion:reduced?'reduce':'no-preference'});
  const errors=[],diagnostics=[];let threeRequests=0;
  page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async request=>{
   const url=new URL(request.request().url());
   if(url.origin!==origin)return request.abort();
   if(url.pathname.endsWith('/vendor/three/three.module.js')){
    threeRequests++;if(real)await new Promise(resolve=>setTimeout(resolve,delay));
   }
   if(!real&&url.pathname.endsWith('/shared/astrix-breach-loader.mjs')){
    return request.fulfill({contentType:'text/javascript',body:`export async function createBreach({signal}={}){const canvas=document.createElement('canvas');if(!(canvas.getContext('webgl2')||canvas.getContext('webgl')))throw new Error('WebGL unavailable');await new Promise(resolve=>setTimeout(resolve,${delay}));signal?.throwIfAborted?.();return {setProgress(){},dispose(){}};}`});
   }
   return request.continue();
  });
  await page.addInitScript(({noWebGL})=>{
   if(noWebGL){
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:getContext.call(this,type,...args);};
   }
   window.skinSamples=[];window.skinMutations=[];
   const visible=node=>{
    if(!node||!node.getClientRects().length)return false;
    for(let p=node;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
    return true;
   };
   const sample=()=>{
    const gate=document.querySelector('.apx-gate');
    window.skinSamples.push({t:performance.now(),gate:!!gate,pending:gate?.classList.contains('breach-pending')||false,
     ring:visible(gate?.querySelector('.apx-portal')),pct:visible(gate?.querySelector('.apx-pct')),
     breach:!!gate?.classList.contains('is-breach'),chosen:gate?.classList.contains('ring-visible')?'ring':gate?.classList.contains('is-breach')?'breach':null});
   };
   new MutationObserver(records=>{
    for(const record of records)if(record.target.matches?.('.apx-gate'))window.skinMutations.push({before:record.oldValue,after:record.target.className});
    sample();
   }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
   setInterval(sample,100);
  },{noWebGL});
  await page.goto(origin+`/astrix-app/pages/${route}/`,{waitUntil:'domcontentloaded',referer:origin+(entry?'/tools/':'/astrix-app/pages/loadout/')});
  if(earlyDone)await page.evaluate(()=>ForgeLoader.done());
  await page.waitForTimeout(2500);
  const label=`${route} breachReady=${delay}ms real=${real} reduced=${reduced} noWebGL=${noWebGL} earlyDone=${earlyDone} entry=${entry}`;
  const expected=earlyDone||!entry?null:real?'any':delay>=1200||reduced||noWebGL?'ring':'breach';
  const samples=await page.evaluate(()=>window.skinSamples);
  const states=[...new Set(samples.map(s=>s.chosen).filter(Boolean))];
  if(expected==='any')assert.equal(states.length,1,`${label}: exactly one skin per load; ${diagnostics.join("; ")}`);
  else assert.deepEqual(states,expected?[expected]:[],`${label}: exactly the expected final skin; ${diagnostics.join("; ")}`);
  assert.ok(samples.length>=10,`${label}: sampled throughout load`);
  if(expected==='breach'||(expected==='any'&&states[0]==='breach'))assert.ok(!samples.some(s=>s.ring),`${label}: no ring before breach`);
  assert.ok(!samples.some(s=>s.ring&&s.breach),`${label}: no simultaneous skins`);
  assert.ok(!samples.some(s=>s.pending&&(s.ring||s.pct)),`${label}: pending is neutral`);
  if(!earlyDone){
   if(expected&&expected!=='any')assert.ok(samples.some(s=>s[expected]),`${label}: chosen skin actually shown`);
   assert.equal(await page.locator('.apx-gate').count(),entry?1:0);
   await page.evaluate(()=>{ForgeLoader.authRequired('/connect');ForgeLoader.mount();});
   await page.locator('.apx-auth-button').first().waitFor({state:'visible'});
   await page.evaluate(()=>{ForgeLoader.authResolved();ForgeLoader.blocked('Fixture failure');});
   await page.getByRole('button',{name:'RETRY LIVE DATA',exact:true}).waitFor({state:'visible'});
   await page.getByRole('button',{name:'CONTINUE WITHOUT LIVE DATA',exact:true}).click();
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(()=>ForgeLoader.completed),true);
   await page.evaluate(()=>{ForgeLoader.mount();ForgeLoader.blocked('Late');ForgeLoader.authRequired('/late');});
   assert.equal(await page.locator('.apx-gate:not(.is-done)').count(),0);
  }
  const mutations=await page.evaluate(()=>window.skinMutations.flatMap(r=>[r.before,r.after]).filter(Boolean));
  assert.ok(!(mutations.some(s=>s.includes('ring-visible'))&&mutations.some(s=>s.includes('is-breach'))),`${label}: no skin change between samples`);
  assert.deepEqual(errors,[],`${label}: no uncaught errors`);
  assert.equal(threeRequests,1,`${label}: preload and import share one local request`);
  await page.close();console.log(`PORTAL_SINGLE_SKIN_CASE=PASS ${label} skin=${expected||'none'}`);
 }
 for(const route of routes)for(const delay of [1500,200])await run(route,delay);
 for(const route of routes)await run(route,200,{entry:false});
 await run('vault',200,{reduced:true});
 await run('vault',200,{noWebGL:true});
 await run('vault',1500,{earlyDone:true});
 await run('vault',200,{real:true});
 // Real native navigation holds the outgoing snapshot until a populated
 // destination emits readiness. There is no portal on the destination.
 const transfer=await browser.newPage();
 await transfer.route('**/*',request=>new URL(request.request().url()).origin===origin?request.continue():request.abort());
 await transfer.goto(origin+'/astrix-app/pages/vault/');
 await transfer.evaluate(()=>{ForgeLoader.done();const link=document.createElement('a');link.id='fixture-link';link.href='/astrix-app/pages/journey/?navigationFixture=1';link.textContent='Fixture transfer';document.body.prepend(link);});
 await transfer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const started=Date.now();
 await Promise.all([transfer.waitForURL('**/*navigationFixture*',{waitUntil:'domcontentloaded'}),transfer.locator('#fixture-link').click()]);
 assert.equal(await transfer.locator('.apx-gate').count(),0,'Internal transfer never mounts a loader');
 await transfer.waitForFunction(()=>document.documentElement.dataset.navigationState==='rendering',{},{timeout:600});
 assert.equal(await transfer.locator('#fixture-populated').count(),0,'Native snapshot holds while destination is unpopulated');
 await transfer.waitForFunction(()=>document.documentElement.dataset.navigationState==='ready');
 assert.equal(await transfer.locator('#fixture-populated').count(),1);
 assert.ok(Date.now()-started<=4000,'Populated fixture transfer completes within four seconds');
 await transfer.close();
 console.log('TOOL_ENTRY_NAVIGATION=PASS loader only from Tools, internal recovery without animation, populated snapshot transfer under four seconds');
 console.log('PORTAL_SINGLE_SKIN=PASS five routes, both delays, neutral pending, immutable skin, reduced motion, no WebGL, late completion and recovery');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
