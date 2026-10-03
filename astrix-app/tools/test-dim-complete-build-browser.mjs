#!/usr/bin/env node
// The real Build Review page with the recorded DIM share (fixtures/dim-import/cowl.json),
// its recorded manifest and a test Hunter inventory. No live call. At 1600 and 390:
//   - the DIM import button sends a share link to Build Review on its own URL;
//   - every group of the shared build renders, Paradox's picks are tagged apart, nothing scrolls sideways;
//   - the time from the pasted link to the full shared build is reported (target 3 to 4 s).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cowlFixture} from './fixtures/dim-import/cowl-inventory.mjs';
import {IMPORT_TABLES} from '../core/dim-import/cache.mjs';
import {buildReviewUrl} from '../core/dim-import/entry.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const AUTH='https://auth.astrixparadox.com',LINK="https://dim.gg/ndttp4i/Mactics'-Arc-Assassins-Cowl-Hunter";
const f=await cowlFixture(),version=f.snapshot.version,tables=f.snapshot.tables;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
  const envelope={schemaVersion:2,transport:'prepared-page-stream-v1',
    account:{authenticated:true,membership:{membershipId:f.binding.membershipId,membershipType:3},profile:{...f.profile,characterLoadouts:{data:{[f.characterId]:{loadouts:[]}}}},definitions:tables.DestinyInventoryItemDefinition,definitionCoverage:{complete:true,unresolved:[]},characterBuildCoverage:{complete:true},loadoutCoverage:{complete:true},pageReady:{page:'loadout',manifestVersion:version,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},
    prepared:{manifestVersion:version,page:'loadout',artifactCatalog:[]}};
  const status={manifestVersion:version,tables:Object.fromEntries(IMPORT_TABLES.map(type=>[type,{shards:1,definitions:Object.keys(tables[type]||{}).length}]))};
  async function open(width){
    const context=await browser.newContext({viewport:{width,height:width<600?844:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      if(url.hostname.endsWith('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});
      const json=(body,code=200)=>route.fulfill({status:code,contentType:'application/json',headers:cors,body:JSON.stringify(body)});
      if(url.origin!==AUTH)return route.abort();
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...cors,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
      if(url.pathname==='/session')return json({authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:f.binding.membershipId,membershipType:3,displayName:'Fixture'},capabilities:{destinyActions:{}}});
      if(url.pathname==='/dim/share/ndttp4i')return json(f.share);
      if(url.pathname==='/bungie/manifest/import/status')return json(status);
      if(url.pathname==='/bungie/manifest/import/shard'){const type=url.searchParams.get('type');return json({manifestVersion:version,type,shard:0,archive:false,definitions:tables[type]||{}});}
      if(url.pathname==='/bungie/page/loadout')return json(envelope);
      if(url.pathname==='/bungie/account')return json({displayName:'Fixture'});
      return json({error:'not_in_fixture'},404);
    });
    return {context,page,errors};
  }
  const href=buildReviewUrl(LINK,{characterId:f.characterId,location:{href:origin+'/'}});
  assert.equal(new URL(href).pathname,'/astrix-app/pages/build-review/','A share link opens Build Review on its own URL');
  assert.equal(new URL(href).searchParams.get('dim'),'ndttp4i');
  const timings=[];
  for(const width of [1600,390]){
    const {context,page,errors}=await open(width);
    // Paste the link into Build Review, as the import button's destination does.
    await page.goto(`${origin}/astrix-app/pages/build-review/`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#brPasteInput',{timeout:30000});
    const pasted=Date.now();
    await page.fill('#brPasteInput',LINK);await page.click('#brPasteForm button[type=submit]');
    await page.waitForSelector('#brArmourTitle',{timeout:30000});
    const sharedMs=Date.now()-pasted;
    await page.waitForFunction(()=>!document.querySelector('.br-section [role=status]')?.textContent?.includes('Ranking weapons'),null,{timeout:30000}).catch(()=>{});
    const fullMs=Date.now()-pasted;
    timings.push({width,sharedMs,fullMs});
    const shown=await page.evaluate(()=>({
      sections:[...document.querySelectorAll('.br-section h2')].map(node=>node.textContent),
      text:document.querySelector('.br-main')?.innerText||'',
      picks:document.querySelectorAll('.br-tag.is-inventory').length,
      share:document.querySelectorAll('#brArmourTitle ~ * .br-tag.is-share').length,
      overflow:document.documentElement.scrollWidth-innerWidth,
      url:location.search,
      handoff:document.querySelector('#brManual')?.textContent
    }));
    for(const title of ['SUBCLASS','EXOTIC ARMOUR','WEAPONS','ARMOUR','STAT TARGETS','SET BONUSES','SHARED MODS (13)','ARTIFACT UNLOCKS'])assert.ok(shown.sections.includes(title),`${width}: ${title} renders`);
    assert.ok(!shown.sections.includes('LOADOUT EMBLEM'),`${width}: no emblem box`);
    for(const line of ['This share pins no exotic armour.','This share has no weapons.','This share sets no stat targets','None in this share.','Gathering Storm','Atheon\'s Memory'])assert.ok(shown.text.includes(line),`${width}: shows "${line}"`);
    assert.equal(shown.picks,5,`${width}: five armour picks tagged "Picked from your inventory"`);
    assert.equal(shown.share,0,`${width}: no pick is tagged as the sharer's`);
    assert.ok(shown.overflow<=0,`${width}: no sideways scroll (${shown.overflow}px)`);
    assert.match(shown.url,/dim=ndttp4i/,'The build is on its own reloadable URL');
    assert.equal(shown.handoff,'Send to Builder');
    assert.deepEqual(errors,[],`${width}: page errors`);
    if(process.env.TEST_SHOT_DIR)await page.screenshot({path:resolve(process.env.TEST_SHOT_DIR,`dim-complete-build-${width}.png`),fullPage:true});
    await context.close();
  }
  console.log(`DIM_COMPLETE_BUILD_BROWSER=PASS real Build Review page at 1600 and 390: own URL, every group, 5 tagged picks, no sideways scroll; pasted link to shared build ${timings.map(t=>`${t.width}: ${t.sharedMs} ms (weapons settled ${t.fullMs} ms)`).join(', ')} with local fixture data`);
}finally{
  await browser?.close();server.close();
}
