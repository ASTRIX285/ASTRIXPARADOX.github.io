#!/usr/bin/env node
// Server cached Guardian data shows its real age (perf, 2 Oct 2026). Runs the real Storage page
// with fixture Bungie data at 390, 820 and 1600:
//   - A prepared page served from the Worker account cache shows its age on the refresh icon
//     ("7m") and in the icon's label; it is never presented as live.
//   - A live read shows no age. Signed out and Bungie offline show no age and no errors.
//   - /bungie/account is requested at most once per page load, however many copies of the
//     auth module the page imports.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=await warlockInventoryFixture(root);
const AUTH='https://auth.astrixparadox.com',PATH='/astrix-app/pages/vault/';
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
  const ready=page=>page.waitForFunction(()=>document.querySelectorAll('.vault-transfer-item.is-equipped').length>=3,null,{timeout:30000});
  const badge=page=>page.evaluate(()=>{const icon=document.querySelector('.ax-refresh-btn'),age=icon?.querySelector('.ax-data-age');
    const box=age&&!age.hidden?age.getBoundingClientRect():null,frame=icon?.getBoundingClientRect();
    return {text:age&&!age.hidden?age.textContent:null,label:icon?.getAttribute('aria-label'),inside:box?box.left>=frame.left&&box.right<=frame.right&&box.top>=frame.top&&box.bottom<=frame.bottom:null};});
  async function open(width,{mode,account}){
    const context=await browser.newContext({viewport:{width,height:width<600?844:width<1200?1180:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await routeWarlockFixture(page,{origin,fixture,art});
    // Registered after the fixture routes, so these answer first.
    await page.route(`${AUTH}/**`,route=>{
      const url=new URL(route.request().url());
      if(mode==='offline')return route.abort('connectionrefused');
      if(mode==='signed-out'&&url.pathname==='/session')return route.fulfill({status:401,contentType:'application/json',headers:cors,body:JSON.stringify({authenticated:false,error:'authentication_required'})});
      if(url.pathname==='/bungie/account'){account.count++;return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({displayName:'Fixture'})});}
      if(url.pathname==='/bungie/page/vault'){
        const envelope=fixture.envelope('vault');
        if(mode==='cached')envelope.account={preparedCache:{source:'backend-cache',dataAt:Date.now()-7*60_000,generatedAt:Date.now()-7*60_000,ageMs:7*60_000,revalidating:true},...envelope.account};
        if(mode==='live')envelope.account.pageReady={...envelope.account.pageReady,accountFreshness:'live',accountSource:'bungie',accountDataAt:Date.now()};
        return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify(envelope)});
      }
      return route.fallback();
    });
    await page.goto(origin+PATH,{waitUntil:'domcontentloaded'});
    return {context,page,errors};
  }

  for(const width of [390,820,1600]){
    for(const mode of ['cached','live']){
      const account={count:0},{context,page,errors}=await open(width,{mode,account});
      await ready(page);await page.waitForTimeout(800);
      const shown=await badge(page);
      if(mode==='cached'){
        assert.equal(shown.text,'7m',`${width} cached data shows its age on the refresh icon`);
        assert.match(shown.label,/Showing data from 7 minutes ago/,`${width} the icon label says how old the data is`);
        assert.equal(shown.inside,true,`${width} the age sits inside the icon`);
        // Optional screenshot for review, written only where TEST_SHOT_DIR points (outside the repo).
        if(process.env.TEST_SHOT_DIR)await page.screenshot({path:resolve(process.env.TEST_SHOT_DIR,`prepared-cache-age-${width}.png`),clip:{x:0,y:0,width,height:120}});
      }else{
        assert.equal(shown.text,null,`${width} a live read shows no age`);
        assert.equal(shown.label,'Refresh Guardian data');
      }
      assert.ok(account.count<=1,`${width} ${mode}: /bungie/account requested ${account.count} times`);
      assert.deepEqual(errors,[],`${width} ${mode} page errors`);
      await context.close();
    }
    for(const mode of ['signed-out','offline']){
      const account={count:0},{context,page,errors}=await open(width,{mode,account});
      await page.waitForTimeout(2500);
      assert.equal((await badge(page)).text,null,`${width} ${mode} shows no data age`);
      assert.equal(account.count,0,`${width} ${mode} requests no account`);
      assert.deepEqual(errors,[],`${width} ${mode} page errors`);
      await context.close();
    }
  }
  console.log('PREPARED_CACHE_AGE=PASS real Storage page at 390, 820 and 1600: server cached data shows "7m" on the refresh icon and in its label, inside the icon; a live read shows no age; signed out and Bungie offline show no age and no page errors; /bungie/account at most once per load');
}finally{
  await browser?.close();server.close();
}
