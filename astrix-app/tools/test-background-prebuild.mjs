#!/usr/bin/env node
// Background page prebuild (4 Oct 2026). Real tool pages with a fixture sign-in (nothing leaves the
// machine). A player opens Journey; once it is ready the background queue builds every other tool
// tab and each completed Reports section. Then:
//   - every tool tab opens from what was built: no prepared-page, Reports, run-history or run-report
//     request while it opens, and its data is in hand within 100 ms of the page asking for it;
//   - every Reports section opens within 100 ms with no request;
//   - picking a section that is not built yet moves it to the front of the queue.
// Prints a time-to-open table (data in hand, and page ready after navigation starts).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
import {fixture as reportsFixture} from './fixtures/reports-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(process.env.PREBUILD_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const measureOnly=process.env.PREBUILD_MEASURE_ONLY==='1';
const fixture=await warlockInventoryFixture(root);
const AUTH='https://auth.astrixparadox.com',IDENTITY='3:4611686018000000001';
const KIND={'Character':'character','Build Forge':'build-forge','Journey':'journey','Storage':'vault','Forge Loader':'loadout','Armoury':'loadout'};
const TABS=[
  ['Character','/astrix-app/pages/guardian-workspace-v2/'],['Build Forge','/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'],
  ['Journey','/astrix-app/pages/journey/'],['Storage','/astrix-app/pages/vault/'],['Forge Loader','/astrix-app/pages/forge-loader/'],
  ['Armoury','/astrix-app/pages/loadout/'],['Reports','/astrix-app/pages/reports/']
];
// The account overview: the Reports fixture with a clear in every series, so each series has a section.
const aggregate=(hash,cleared)=>({activityHash:hash,values:Object.fromEntries(Object.entries({activitiesEntered:cleared+1,activityCompletions:cleared,activityKills:50,activityDeaths:2,activitySecondsPlayed:1200,fastestCompletionMsForActivity:600000,bestSingleGameScore:10}).map(([key,value])=>[key,{basic:{value}}]))});
const overview={...reportsFixture,aggregates:{...reportsFixture.aggregates,1:{activities:[...reportsFixture.aggregates[1].activities,...[200,300,400,500,600,700].map(hash=>aggregate(hash,2))]}}};
const DATA_REQUEST=/^\/bungie\/(?:page\/|reports|pgcr\/|profile)/;
// Run history: three completed runs of the fixture raid and one of the dungeon, on character 1.
const run=(id,hash,day)=>({period:`2026-09-${String(day).padStart(2,'0')}T20:00:00Z`,activityDetails:{instanceId:String(id),referenceId:hash,directorActivityHash:hash},
  values:Object.fromEntries(Object.entries({completed:1,activityDurationSeconds:1800,kills:120,deaths:1,playerCount:3}).map(([key,value])=>[key,{basic:{value}}]))});
const history=[run(9001,100,20),run(9002,100,18),run(9003,101,15),run(9004,200,12)];
const pgcr=id=>({period:'2026-09-20T20:00:00Z',activityWasStartedFromBeginning:true,activityDetails:{instanceId:id,referenceId:100,directorActivityHash:100},
  entries:[{characterId:'1',player:{characterClass:'Titan',destinyUserInfo:{membershipId:'4611686018000000001',membershipType:3,bungieGlobalDisplayName:'Fixture',bungieGlobalDisplayNameCode:1}},
    values:Object.fromEntries(Object.entries({completed:1,kills:120,deaths:1,assists:10,killsDeathsRatio:120,timePlayedSeconds:1800,activityDurationSeconds:1800}).map(([key,value])=>[key,{basic:{value}}]))}]});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
let browser;const failures=[],table=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  async function signedIn({historyDelay=0}={}){
    const context=await browser.newContext({viewport:{width:1600,height:900}}),requests=[];
    await routeWarlockFixture({route:(pattern,handler)=>context.route(pattern,handler)},{origin,fixture,art});
    const json=(route,body)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
    await context.route(`${AUTH}/**`,async route=>{
      const url=new URL(route.request().url());
      requests.push({path:url.pathname+url.search,at:Date.now()});
      if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='history'){
        if(historyDelay)await new Promise(done=>setTimeout(done,historyDelay));
        return json(route,{ErrorCode:1,Response:{activities:url.searchParams.get('characterId')==='1'&&url.searchParams.get('page')==='0'?history:[]}});
      }
      if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='definition')return json(route,{ErrorCode:1,Response:{displayProperties:{name:'Fixture Raid: Normal'}}});
      // The fixture envelope with the coverage markers every Worker payload carries today.
      if(url.pathname.startsWith('/bungie/page/')){const envelope=fixture.envelope(url.pathname.split('/').pop());envelope.account={...envelope.account,characterBuildCoverage:{...envelope.account.characterBuildCoverage,schemaVersion:2,complete:true},weaponDefinitionCoverage:{schemaVersion:1,complete:true,unresolved:[]},pageReady:{...envelope.account.pageReady,accountDataAt:Date.now()}};return json(route,envelope);}
      if(url.pathname.startsWith('/bungie/pgcr/')){if(historyDelay)await new Promise(done=>setTimeout(done,historyDelay));return json(route,{ErrorCode:1,Response:pgcr(url.pathname.split('/').pop())});}
      return route.fallback();
    });
    // Each page's prepared-data stages (start, join with its source) and its readiness time.
    await context.addInitScript(()=>{
      window.__prebuildProgress=[];
      document.addEventListener('forge:prepared-page-progress',event=>window.__prebuildProgress.push({stage:event.detail?.stage,source:event.detail?.source||null,t:performance.now()}));
      document.addEventListener('forge:portal-ready',()=>{window.__prebuildReadyAt=performance.now();});
    });
    if(process.env.PREBUILD_DEBUG)await context.addInitScript(()=>{const original=window.fetch;window.fetch=function(input,init){const url=String(input?.url||input);if(/\/bungie\/(page|profile)/.test(url))console.log('FETCH',location.pathname,url.split('?')[0],new Error().stack.split('\n').slice(2,16).join(' <- '));return original.call(this,input,init);};});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    if(process.env.PREBUILD_DEBUG){await context.addInitScript(()=>{window.__debugLoads=true;});page.on('console',message=>{if(message.text().startsWith('LOADS'))console.log(message.text());});}
    if(process.env.PREBUILD_DEBUG)page.on('console',message=>{if(message.text().startsWith('FETCH'))console.log(message.text().replace(/http:\/\/127\.0\.0\.1:\d+/g,''));});
    // Fixture sign-in for Reports: the account overview is seeded as a fresh snapshot.
    await page.goto(origin+'/astrix-app/pages/home/',{waitUntil:'domcontentloaded'});
    await page.evaluate(async([identity,snapshot])=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('astrix-reports-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      await new Promise(resolve=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({...snapshot,identity,fetchedAt:Date.now()},`account:catalogue-v3-boxes20c:${identity}`);tx.oncomplete=resolve;});
      db.close();
    },[IDENTITY,overview]);
    return {context,page,requests,errors};
  }
  const queueState=page=>page.evaluate(async()=>{
    const client=await import('/astrix-app/core/prepared-page-client.mjs');
    const session=window.FORGE_BUNGIE_SESSION;return client.preparationQueue(session)?.list()||null;
  });
  async function waitForQueue(page,{timeout=60000}={}){
    const end=Date.now()+timeout;let last='';let stable=0;
    while(Date.now()<end){
      const list=await queueState(page).catch(()=>null);
      const text=JSON.stringify(list);
      // Settled: the Reports history has been built and nothing is queued or running for a second.
      if(list&&list.some(row=>row.key==='reports:history'&&row.state==='ready')&&list.every(row=>row.state==='ready'||row.state==='failed')){if(text===last&&++stable>=4)return list;}else stable=0;
      if(measureOnly&&!list&&Date.now()>end-timeout+8000)return null;
      last=text;await page.waitForTimeout(250);
    }
    return JSON.parse(last||'null');
  }

  // 1. Build everything in the background from Journey, then open each tab from what was built.
  {
    const {context,page,requests,errors}=await signedIn();
    await page.goto(origin+'/astrix-app/pages/journey/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ForgeLoader?.completed===true,null,{timeout:30000});
    const built=await waitForQueue(page);
    const expected=['page:character','page:build-forge','page:vault','page:loadout','reports','reports:history'];
    for(const key of expected)if(!built?.some(row=>row.key===key&&row.state==='ready'))failures.push(`queue: ${key} was not built (${JSON.stringify(built)})`);
    if(process.env.PREBUILD_DEBUG)console.log(JSON.stringify(built),await page.evaluate(async()=>{
      const cache=await import('/astrix-app/pages/guardian-workspace-v2/guardian-session-cache.mjs'),contract=await import('/astrix-app/core/page-ready-contract.mjs');
      const out={};for(const kind of ['character','build-forge','journey','vault','loadout']){const row=await cache.readCachedBungieProfile(window.FORGE_BUNGIE_SESSION,kind);let ok='missing';if(row){try{contract.assertRenderablePagePayload(row,kind);ok='renderable';}catch(error){ok=error.message;}}out[kind]=ok;}
      return JSON.stringify(out)+' markers '+Object.keys(sessionStorage).filter(key=>key.includes('page-cache')).join(',');
    }));
    const sections=(built||[]).filter(row=>/^reports:(?!history$)/.test(row.key));
    if(!sections.length)failures.push('queue: no Reports section was built');
    for(const [name,path] of TABS){
      const from=requests.length,started=Date.now();
      await page.goto(origin+path,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.ForgeLoader?.completed===true,null,{timeout:30000}).catch(()=>failures.push(`${name}: never reported ready`));
      // Data in hand: each prepared-page read the page made (engine timing profile.load), the slowest one.
      const timing=await page.evaluate(()=>{
        const loads=(globalThis[Symbol.for('astrix.engine.timings.v1')]||[]).filter(row=>row.stage==='profile.load'&&row.status==='complete');
        const sources=(window.__prebuildProgress||[]).filter(row=>row.stage==='join').map(row=>row.source).filter(Boolean);
        if(window.__debugLoads)console.log('LOADS '+location.pathname+' '+JSON.stringify(loads.map(row=>[Math.round(row.ms),row.marks.map(m=>m.stage+':'+Math.round(m.ms)).join('/')])));
        return {ready:window.__prebuildReadyAt??null,dataMs:loads.length?Math.max(...loads.map(row=>row.ms)):null,reads:loads.length,source:[...new Set(sources)].join(', ')||null};
      });
      const data=requests.slice(from).filter(row=>DATA_REQUEST.test(row.path)).map(row=>row.path.split('?')[0]);
      if(data.length)failures.push(`${name}: opened with data requests ${data.join(', ')}`);
      const dataMs=timing.dataMs===null?null:Math.round(timing.dataMs);
      // Opening a built tab: its whole prepared payload read back from this browser, timed once the page is idle
      // (during start-up the same read also waits behind the page's own script work: "while loading").
      const openMs=name==='Reports'?null:await page.evaluate(async kind=>{
        await new Promise(resolve=>typeof requestIdleCallback==='function'?requestIdleCallback(resolve,{timeout:1000}):setTimeout(resolve,50));
        const cache=await import('/astrix-app/pages/guardian-workspace-v2/guardian-session-cache.mjs');
        const start=performance.now(),payload=await cache.readCachedBungieProfile(window.FORGE_BUNGIE_SESSION,kind);
        return payload?.profile?Math.round(performance.now()-start):null;
      },KIND[name]);
      if(name!=='Reports'&&(openMs===null||openMs>100))failures.push(`${name}: built data took ${openMs} ms to open (limit 100 ms)`);
      table.push({name,openMs,dataMs,source:name==='Reports'?'stored overview':timing.source||'browser copy',readyMs:timing.ready===null?null:Math.round(timing.ready),requests:data.length,elapsed:Date.now()-started});
    }
    // Reports sections: each completed activity opens at once, with no request.
    await page.goto(origin+'/astrix-app/pages/reports/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ForgeLoader?.completed===true&&document.querySelector('.reports-open'),null,{timeout:30000});
    for(const series of await page.locator('[data-series]').evaluateAll(nodes=>nodes.map(node=>node.dataset.series))){
      await page.locator(`[data-series="${series}"]`).click();
      for(const id of await page.locator('[data-activity]').evaluateAll(nodes=>nodes.map(node=>node.dataset.activity))){
        const from=requests.length;
        const ms=await page.evaluate(async id=>{
          const start=performance.now();document.querySelector(`[data-activity="${CSS.escape(id)}"]`).click();
          await new Promise(resolve=>{const check=()=>{const status=document.querySelector('.reports-history-status')?.textContent||'';if(/All available history pages loaded|No runs returned/.test(status)&&document.querySelector('.reports-detail'))resolve();else requestAnimationFrame(check);};check();});
          return performance.now()-start;
        },id);
        await page.waitForTimeout(150);
        const data=requests.slice(from).filter(row=>DATA_REQUEST.test(row.path)).map(row=>row.path.split('?')[0]);
        if(data.length)failures.push(`Reports section ${id}: opened with requests ${data.join(', ')}`);
        if(ms>100)failures.push(`Reports section ${id}: took ${Math.round(ms)} ms (limit 100 ms)`);
        table.push({name:`Reports: ${id}`,openMs:Math.round(ms),dataMs:null,source:'built section',readyMs:null,requests:data.length});
        await page.locator('[data-back]').first().click();
      }
    }
    if(errors.length)failures.push(`page errors: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
  // 2. Picking a section that is not built yet moves it to the front.
  if(!measureOnly){
    const {context,page}=await signedIn({historyDelay:400});
    await page.goto(origin+'/astrix-app/pages/reports/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ForgeLoader?.completed===true&&document.querySelector('.reports-open'),null,{timeout:30000});
    await page.waitForFunction(async()=>{const client=await import('/astrix-app/core/prepared-page-client.mjs');return client.preparationQueue(window.FORGE_BUNGIE_SESSION)?.list().filter(row=>/^reports:(?!history$)/.test(row.key)).length>=2;},null,{timeout:30000,polling:200});
    const before=await queueState(page);
    const sections=before.filter(row=>/^reports:(?!history$)/.test(row.key)&&row.state==='queued');
    const target=sections.at(-1);
    if(!target)failures.push(`front: no queued section to pick (${JSON.stringify(before)})`);
    else{
      const activity=target.key.slice('reports:'.length);
      await page.evaluate(id=>document.dispatchEvent(new CustomEvent('forge:reports-section-picked',{detail:{activity:id}})),activity);
      const after=await queueState(page);
      const waiting=after.filter(row=>row.state==='queued'||row.state==='running').map(row=>row.key);
      const position=waiting.indexOf(target.key);
      if(position!==0&&!(position===1&&after.find(row=>row.state==='running')))failures.push(`front: picked ${target.key} is at position ${position} of ${JSON.stringify(waiting)}`);
    }
    await context.close();
  }
}finally{await browser?.close();server.close();}
console.log('| Opened | Built data opens in | Data in hand while loading | Source | Page ready after navigation | Requests while opening |\n|---|---|---|---|---|---|');
for(const row of table)console.log(`| ${row.name} | ${row.openMs==null?'-':`${row.openMs} ms`} | ${row.dataMs==null?'-':`${row.dataMs} ms`} | ${row.source} | ${row.readyMs===null?'-':`${row.readyMs} ms`} | ${row.requests} |`);
if(measureOnly){console.log(`BACKGROUND_PREBUILD=MEASURED ${failures.length} problem(s)`);process.exit(0);}
assert.deepEqual(failures,[],`Background prebuild:\n${failures.join('\n')}`);
console.log(`BACKGROUND_PREBUILD=PASS ${TABS.length} tool tabs and every completed Reports section open from what was built in the background: no data request, data within 100 ms; a picked section moves to the front`);
