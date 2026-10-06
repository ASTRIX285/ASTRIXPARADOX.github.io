#!/usr/bin/env node
// The Aetherium pages (brief feature/aetherium-daeva-card-gear-ledger, 5 Oct 2026): Daeva Card and Gear Ledger
// on a local static server, the armory Worker mocked (never NCSOFT, never the real Worker):
//   - demo mode (Worker not configured): ASTRIX285 example, labelled, no Worker request;
//   - live mode: search to summary to Gear Ledger; first paint uses only /aion2/character; item detail and
//     Daevanion boards load only when opened; boards show open or locked from the data;
//   - roster add and remove, faction colour switch (Elyos gold, Asmodian violet, ASTRIX crimson before load);
//   - Worker down: a clear "armory unavailable" message and the labelled demo;
//   - looks: gold primary action, no horizontal scroll and no overlapping tiles at 390, 820 and 1600.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
const fixtureDir=resolve(root,'astrix-app/tools/fixtures/aion2/eu');
const fixture=async name=>JSON.parse(await readFile(resolve(fixtureDir,`${name}.json`),'utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

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

const info=await fixture('astrix285-info'),equipment=await fixture('astrix285-equipment'),search=await fixture('astrix285-search');
const item=await fixture('astrix285-item-mainhand'),board=await fixture('astrix285-daevanion-11');
// A second, Asmodian Daeva for the roster and faction checks (same shape, different identity).
const asmoInfo=structuredClone(info);
Object.assign(asmoInfo.profile,{characterName:'NOCTIS',characterId:'Zm9vYmFyMTIz=',raceId:2,raceName:'Asmodian',serverId:2301,serverName:'Israphel'});
const asmoSearch={list:[{...search.list[0],name:'<strong>NOCTIS</strong>',characterId:'Zm9vYmFyMTIz%3D',race:2,serverId:2301,serverName:'Israphel'}],pagination:search.pagination};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
// A Lv 22 Daeva (as ASTRIX285 is on the live armory, 5 Oct 2026): stigmas still not acquired, an amulet worn in slot 22.
const lv22Info=structuredClone(info);
Object.assign(lv22Info.profile,{characterName:'LEVELED',characterId:'bGV2ZWxlZDIy=',characterLevel:22,serverId:1309,serverName:'Hithanya'});
const lv22Equipment=structuredClone(equipment);
lv22Equipment.equipment.equipmentList.push({...lv22Equipment.equipment.equipmentList[0],id:999000022,name:'Test Amulet',slotPos:22,slotPosName:'Amulet'});

const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    let body=await response.text();
    // The committed config points at the real Worker; every test swaps it for the mock (live) or null (demo).
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    body=swapped;
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    if(down)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
    const asmo=url.searchParams.get('name')==='NOCTIS'||url.searchParams.get('serverId')==='2301';
    const lv22=url.searchParams.get('serverId')==='1309';
    const bodies={
      '/aion2/search':asmo?asmoSearch:search,
      '/aion2/character':lv22?{info:lv22Info,equipment:lv22Equipment}:{info:asmo?asmoInfo:info,equipment},
      '/aion2/item':item,
      '/aion2/daevanion':board
    };
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta})});
  });
  // Icons and portraits come from the NCSOFT CDN; never fetched in tests.
  await context.route(/playnccdn\.com|plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run. Registered last, so it wins over the CDN stub above.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  if(storage)await context.addInitScript(value=>{localStorage.setItem('aetherium.roster.v1',value);},JSON.stringify(storage));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,errors};
}
const style=(page,selector,prop)=>page.$eval(selector,(el,p)=>getComputedStyle(el).getPropertyValue(p).trim(),prop);
const GOLD='rgb(226, 181, 79)',VIOLET='rgb(154, 107, 255)';

await check('demo mode: labelled ASTRIX285 example, no Worker call, Elyos gold',async()=>{
  const {page,context,calls,errors}=await open('/hub/aetherium/');
  assert.deepEqual(calls,[]);
  assert.match(await page.textContent('#aeSource'),/^Example data: ASTRIX285, read from the public EU armory on 5 Oct 2026\. The live armory is not connected yet\./);
  assert.equal(await page.textContent('#aeName'),'ASTRIX285');
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  assert.equal(await style(page,'.ae-chip-faction','color'),GOLD,'Elyos accent on the faction chip');
  assert.match(await page.textContent('.ae-tiles'),/Combat power6,532/);
  assert.match(await page.textContent('.ae-tiles'),/Daevanion boards open1 \/ 5/);
  assert.match(await page.textContent('.ae-tiles'),/Unlock at Lv 22/);
  assert.equal(await page.locator('.ae-roster-slot').count(),8,'8 roster slots');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('demo search: other names explain the example, ASTRIX285 imports',async()=>{
  const {page,context}=await open('/hub/aetherium/');
  await page.fill('#aeNameInput','SomeoneElse');
  await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.match(await page.textContent('#aeNotice'),/Live search is not connected yet/);
  await page.fill('#aeNameInput','astrix285');
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===1);
  assert.match(await page.textContent('.ae-roster-slot.is-filled'),/ASTRIX285[\s\S]*example/);
  await context.close();
});

await check('live: search to summary uses search then one character call',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/',{live:true});
  assert.deepEqual(calls,[],'No Daeva picked yet: the example needs no Worker call');
  assert.match(await page.textContent('#aeSource'),/Search for your own Daeva above/);
  await page.fill('#aeNameInput','ASTRIX285');
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeSource').textContent.startsWith('Read from the public EU armory'));
  assert.deepEqual(calls,['/aion2/search','/aion2/character']);
  assert.match(await page.textContent('#aeSource'),/^Read from the public EU armory just now\.$/);
  assert.match(page.url(),/serverId=1308&characterId=/,'Bookmarkable URL');
  assert.match(await page.getAttribute('#aeGearLink','href'),/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=/);
  await context.close();
});

await check('live Gear Ledger: one call for first paint, item and board on demand',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/?${ref}`,{live:true});
  assert.deepEqual(calls,['/aion2/character'],'First paint: only /aion2/character');
  assert.equal(await page.locator('#aeGear [data-slot]').count(),8);
  assert.match(await page.textContent('#aeAccessories'),/none worn/);
  const boards=await page.$$eval('.ae-board',items=>items.map(li=>[li.querySelector('.ae-board-name').textContent,li.querySelector('.ae-board-state').textContent,li.querySelector('.ae-board-count').textContent]));
  assert.deepEqual(boards[0],['Nezekan','Open','0 / 88'],'Nezekan open from the data');
  assert.ok(boards.slice(1).every(row=>row[1]==='Locked'),'Other boards locked from the data');
  assert.equal(await page.locator('.ae-stigma.is-locked').count(),13);
  assert.match(await page.textContent('#aeStigmaNote'),/13 stigmas · unlock at Lv 22/);
  await page.click('[data-slot="0"]');
  await page.waitForSelector('#aeItem h3');
  assert.equal(await page.textContent('#aeItem h3'),'Twilight Greatsword');
  assert.match(await page.textContent('#aeItem'),/Enchant\+2 of 5/);
  assert.match(await page.textContent('[data-slot="0"] .ae-slot-meta'),/\+2 of 5/,'Tile picks up max enchant from the detail');
  await page.click('.ae-board details[data-board="11"] summary');
  await page.waitForFunction(()=>{const text=document.querySelector('[data-board="11"] [data-board-nodes]').textContent;return text&&!text.includes('Reading');});
  assert.match(await page.textContent('[data-board="11"] [data-board-nodes]'),/No nodes taken yet/);
  assert.deepEqual(calls,['/aion2/character','/aion2/item','/aion2/daevanion']);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('Lv 22 with no stigma acquired, extra worn slot: honest copy',async()=>{
  const ref=new URLSearchParams({serverId:'1309',characterId:lv22Info.profile.characterId});
  const card=await open(`/hub/aetherium/?${ref}`,{live:true});
  assert.match(await card.page.textContent('.ae-tiles'),/StigmasNone unlocked yet/);
  await card.context.close();
  const {page,context,errors}=await open(`/hub/aetherium/gear/?${ref}`,{live:true});
  assert.match(await page.textContent('#aeStigmaNote'),/13 stigmas · none unlocked yet/);
  assert.equal(await page.locator('.ae-stigma small',{hasText:'Not unlocked yet'}).count(),13);
  assert.equal(await page.locator('#aeGear [data-slot]').count(),9,'The extra worn slot is shown');
  assert.match(await page.textContent('#aeGear'),/AmuletTest Amulet/);
  assert.match(await page.textContent('#aeAccessories'),/Other slots, such as accessories, show here once something is worn in them\./);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('roster add and remove, faction colour switch',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true});
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  await page.fill('#aeNameInput','ASTRIX285');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===1);
  await page.fill('#aeNameInput','NOCTIS');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===2);
  assert.equal(await page.getAttribute('body','data-faction'),'asmodian');
  assert.equal(await style(page,'.ae-chip-faction','color'),VIOLET,'Asmodian accent');
  assert.match(await page.textContent('.ae-roster-slot.is-active'),/NOCTIS/);
  assert.equal(await page.textContent('#aeRosterCount'),'2 of 8 slots');
  await page.click('[data-roster-remove^="2301:"]');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1);
  assert.equal(await page.textContent('#aeRosterCount'),'1 of 8 slots');
  const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('aetherium.roster.v1')));
  assert.equal(saved.entries.length,1);
  assert.equal(saved.entries[0].name,'ASTRIX285');
  await context.close();
});

await check('ASTRIX crimson before a character loads',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.route(/\.mjs/,route=>route.abort());
  await page.goto(`${base}/hub/aetherium/`);
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.equal(await page.$eval('body',el=>getComputedStyle(el).getPropertyValue('--ae-accent').trim()),'#ba1f12');
  assert.ok(await page.isVisible('.ae-skeleton'),'The shell shows straight away, never a blank wait');
  await context.close();
});

await check('Worker down: clear message and labelled demo',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  for(const path of [`/hub/aetherium/?${ref}`,`/hub/aetherium/gear/?${ref}`]){
    const {page,context,errors}=await open(path,{live:true,down:true});
    assert.match(await page.textContent('#aeNotice'),/The armory is unavailable right now, so this shows the ASTRIX285 example/);
    assert.match(await page.textContent('#aeSource'),/^Example data: ASTRIX285.*The armory is unavailable right now\.$/);
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, gold action, tiles apart`,async()=>{
    for(const path of ['/hub/aetherium/','/hub/aetherium/gear/']){
      const {page,context}=await open(path,{viewport:{width,height}});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${path} scrolls sideways by ${overflow}px`);
      assert.ok(await page.isVisible('.apx-destination-brand img'),'AX logo in the header');
      const clear=await page.evaluate(()=>{
        const first=[...document.querySelector('main').children].map(el=>el.getBoundingClientRect()).find(r=>r.height>0).top+scrollY;
        const bars=[...document.querySelectorAll('header.apx-destination-header,[data-forge-destination-ribbon]')].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0&&r.width>0);
        return {first,bottom:Math.max(...bars.map(r=>r.bottom))};
      });
      assert.ok(clear.first>=clear.bottom,`${path} content starts under the header (${clear.first} < ${clear.bottom})`);
      const tiles=await page.$$eval(path.includes('gear')?'#aeGear > li':'.ae-roster-slot',items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}));
      for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
        const [a,b]=[tiles[i],tiles[j]];
        assert.ok(a[2]<=b[0]+0.5||b[2]<=a[0]+0.5||a[3]<=b[1]+0.5||b[3]<=a[1]+0.5,`${path} tiles ${i} and ${j} overlap`);
      }
      if(!path.includes('gear')){
        assert.match(await style(page,'#aeFind','background-image'),/linear-gradient\(rgb\(244, 210, 124\)/,'Gold primary action');
        const box=await page.$eval('#aeFind',el=>el.getBoundingClientRect().height);
        assert.ok(box>=44,'Primary action at least 44px tall');
      }
      if(process.env.AE_SHOTS&&(width===390||width===1600)){
        const name=path.includes('gear')?'gear-ledger':'daeva-card';
        await page.screenshot({path:resolve(process.env.AE_SHOTS,`${name}-${width}.png`),fullPage:true});
      }
      await context.close();
    }
  });
}

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_PAGES=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_PAGES=PASS');
