#!/usr/bin/env node
// The Guide's Equipment and Crafting sections and Where to get it (feature/aetherium-guide-equipment, 18 Oct 2026), on a
// local static server with the armory Worker mocked (never NCSOFT, never the real Worker):
//   - all 13 pages draw in the Guide shell with their section lit, every topic page has the topic pills with its own lit,
//     facts carry status tags, no horizontal page scroll at 390 and 1600, nothing overlaps the viewport, no console errors;
//   - the static pages make no Worker call; the Equipment home and Where to get it (no Daeva) show the Expedition drop table;
//   - Where to get it for the Lv 45 fixture: one row per slot with the worn item's game icon, the best place now in gold,
//     the next goal and its gate (Fire Temple, Conquest: Unique weapon, entry item level 2,100), side missions pending,
//     the amulet pending, a stray flagged and never blocked, item levels read from the item details;
//   - Enhancement links to the Gear page's Enhance tab, and the Enhance tab links back to Where to get it for the slot.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
const SHOTS=process.env.AE_SHOTS?resolve(process.env.AE_SHOTS):null;
if(SHOTS){assert.ok(!SHOTS.startsWith(root),'AE_SHOTS must be outside the repo');await mkdir(SHOTS,{recursive:true});}
const fixture=async name=>JSON.parse(await readFile(resolve(root,'astrix-app/tools/fixtures/aion2/eu',`${name}.json`),'utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};

const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try{const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;

// The Lv 45 capture, under a test name: the gamer tag is never page data.
const lv45=await fixture('lv45-character');
lv45.info.profile.characterName='TESTDAEVA';
const items=await fixture('lv45-items');
// One stray for the check: an Epic (data Legend) helm enhanced to +4 at Lv 45.
const helm=lv45.equipment.equipment.equipmentList.find(item=>item.slotPosName==='Helmet');
helm.enchantLevel=4;
const REF={serverId:String(lv45.info.profile.serverId),characterId:lv45.info.profile.characterId,region:'eu'};
const refQuery=new URLSearchParams(REF).toString();
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');

const PAGES=[
  ['equipment','home','/hub/aetherium/guide/equipment/','Equipment'],
  ['equipment','slots','/hub/aetherium/guide/equipment/slots/','Slots and grades'],
  ['equipment','enhancement','/hub/aetherium/guide/equipment/enhancement/','Enhancement'],
  ['equipment','manastones','/hub/aetherium/guide/equipment/manastones/','Manastones'],
  ['equipment','theostones','/hub/aetherium/guide/equipment/theostones/','Theostones'],
  ['equipment','arcana','/hub/aetherium/guide/equipment/arcana/','Arcana'],
  ['equipment','pets-wings','/hub/aetherium/guide/equipment/pets-wings/','Pets and wings'],
  ['equipment','titles','/hub/aetherium/guide/equipment/titles/','Titles'],
  ['equipment','where-to-get','/hub/aetherium/guide/equipment/where-to-get/','Where to get it'],
  ['crafting','home','/hub/aetherium/guide/crafting/','Crafting'],
  ['crafting','professions','/hub/aetherium/guide/crafting/professions/','Professions'],
  ['crafting','gathering','/hub/aetherium/guide/crafting/gathering/','Gathering'],
  ['crafting','crafted-gear','/hub/aetherium/guide/crafting/crafted-gear/','Crafted gear']
];

const browser=await chromium.launch();
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{viewport={width:1600,height:1000},live=false,shell='[data-guide-shell]'}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  const errors=[];
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
    if(url.pathname==='/aion2/character')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({info:lv45.info,equipment:lv45.equipment,meta})});
    if(url.pathname==='/aion2/item'){const body=items[url.searchParams.get('slotPos')];return route.fulfill({status:body?200:404,contentType:'application/json',body:JSON.stringify(body?{...body,meta}:{error:'not_found'})});}
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  await context.route(/^https:\/\/assets\.playnccdn\.com\//,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/^https:\/\/use\.typekit\.net\//,route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))errors.push(message.text());});
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.querySelector('#aeMain')?.getAttribute('aria-busy')==='false'||document.documentElement.dataset.aeReady!==undefined||document.body.dataset.aeReady!==undefined,null,{timeout:15000}).catch(()=>{});
  await page.waitForSelector(shell,{timeout:15000});
  await page.waitForLoadState('networkidle');
  return {page,context,calls,errors};
}
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:resolve(SHOTS,`${name}.png`),fullPage:true});};
const noSideScroll=page=>page.evaluate(()=>{
  const width=document.documentElement.clientWidth;
  const wide=[...document.querySelectorAll('#aeStage *')].filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&(box.right>width+1||box.left<-1)&&!node.closest('.ae-gx-tablewrap');}).map(node=>`${node.tagName}.${node.className}`).slice(0,5);
  return {scroll:document.documentElement.scrollWidth-width,wide};
});

for(const [section,id,path,title] of PAGES){
  for(const width of [1600,390]){
    await check(`${path} at ${width}: shell, section lit, tags, no sideways scroll, no Worker call, no errors`,async()=>{
      const {page,context,calls,errors}=await open(path,{viewport:{width,height:width===390?844:1000}});
      try{
        assert.equal(await page.textContent('#aeScreenTitle'),title);
        assert.equal(await page.getAttribute(`.ae-gd-nav [data-guide-section="${section}"]`,'aria-current'),'page');
        if(id!=='home'){
          assert.equal(await page.getAttribute(`[data-guide-topic-link="${id}"]`,'aria-current'),'page','Topic pill lit');
          const colour=await page.$eval(`[data-guide-topic-link="${id}"]`,node=>getComputedStyle(node).color);
          assert.notEqual(colour,await page.$eval(`[data-guide-topic-link]:not([aria-current])`,node=>getComputedStyle(node).color),'The lit pill looks different');
        }
        else assert.ok(await page.locator('.ae-gx-tile').count()>=3,'Topic tiles');
        if(id!=='where-to-get'&&id!=='home'&&id!=='titles')assert.equal(await page.locator('[data-status-tag]').count(),0,'No status tags on facts');
        const {scroll,wide}=await noSideScroll(page);
        assert.ok(scroll<=0,`No horizontal scroll (${scroll}px)`);
        assert.deepEqual(wide,[],'Nothing sticks out of the viewport');
        assert.deepEqual(calls,[],'No Worker call on a page with no Daeva');
        const text=await page.textContent('#aeStage');
        assert.ok(!/[–—]/.test(text),'No en or em dash');
        assert.ok(!/undefined|NaN|\[object/.test(text),'No broken values');
        assert.deepEqual(errors,[]);
        await shot(page,`${section}-${id}-${width}`);
      }finally{await context.close();}
    });
  }
}

await check('Equipment home: the Expedition drop table (6 dungeons, 2 gear groups each) and a Where to get it link',async()=>{
  const {page,context}=await open('/hub/aetherium/guide/equipment/');
  try{
    assert.equal(await page.locator('#aeDropTable tbody tr').count(),12);
    assert.match(await page.textContent('[data-drop="fire-temple:weapon"]'),/Fire Temple\s*Weapon\s*Unique\s*86\s*Lv 45, 2,100\+/);
    assert.equal(await page.getAttribute('[data-where-link]','href'),'/hub/aetherium/guide/equipment/where-to-get/');
    const box=await page.$eval('.ae-gx-tile a',node=>{const style=getComputedStyle(node);return {clip:style.clipPath,shadow:style.boxShadow};});
    assert.notEqual(box.clip,'none','Tiles keep the notch');assert.notEqual(box.shadow,'none','Tiles keep the bevel');
  }finally{await context.close();}
});

await check('Where to get it with no Daeva: Find your Daeva first and the drop table, no Worker call',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/guide/equipment/where-to-get/',{live:true});
  try{
    assert.ok(await page.isVisible('#aeWhereFind'));
    assert.equal(await page.locator('#aeDropTable tbody tr').count(),12);
    assert.deepEqual(calls,[]);
  }finally{await context.close();}
});

for(const width of [1600,390]){
  await check(`Where to get it for the Lv 45 Daeva at ${width}: best now, next goal, gates, cycles, pending, stray, game icons`,async()=>{
    const {page,context,calls,errors}=await open(`/hub/aetherium/guide/equipment/where-to-get/?${refQuery}`,{live:true,viewport:{width,height:width===390?844:1000}});
    try{
      await page.waitForSelector('#aeWhere');
      await page.waitForFunction(()=>/item level 45/.test(document.querySelector('[data-slot="MainHand"]')?.textContent??''),null,{timeout:10000});
      assert.equal(calls[0],'/aion2/character','One character call first');
      assert.ok(calls.filter(path=>path==='/aion2/item').length<=19,'Item details within the budget');
      assert.match(await page.textContent('[data-where-who]'),/TESTDAEVA, Gladiator Lv 45, item level 849/);
      const weapon=page.locator('[data-slot="MainHand"]');
      assert.match(await weapon.locator('[data-offer="best"] .ae-gx-highlight').textContent(),/^Krao Cave, Conquest: Unique weapon, entry item level 700$/);
      assert.match(await weapon.textContent(),/Fire Temple, Conquest: Unique weapon, entry item level 2,100/);
      const glovesRow=page.locator('[data-slot="Gloves"]');
      assert.equal(await glovesRow.locator('[data-offer="best"] .ae-gx-highlight').textContent(),'Draupnir, Conquest: Unique gloves, entry item level 700');
      assert.match(await glovesRow.locator('[data-offer="goal"]').textContent(),/Vakron Sky Island.*551 more item level to enter/s);
      assert.match(await page.locator('[data-slot="Helmet"] [data-stray]').textContent(),/Epic helm is at \+4.*stones spent on it are lost/s,'The stray is flagged');
      assert.equal(await page.locator('[data-slot="Helmet"] [data-offer="best"] .ae-gx-highlight').textContent(),'Draupnir, Conquest: Unique helm, entry item level 700','Flagged, never blocked');
      assert.equal(await glovesRow.locator('[data-stray]').count(),0,'A Unique piece is no stray');
      assert.ok(await glovesRow.locator('[data-cycle="odyle-energy"]').first().isVisible(),'The reward cycle');
      assert.match(await page.textContent('[data-slot="Amulet"]'),/No drop location listed\./);
      assert.match(await page.textContent('[data-side-missions]'),/No quest source yet.*Pending/s);
      assert.match(await page.textContent('#aeWhere'),/Wednesday 07:00 UTC/);
      const icon=await weapon.locator('.ae-gtile img').getAttribute('src');
      assert.match(icon,/^https:\/\/assets\.playnccdn\.com\/static-aion2-gamedata\/resources\//,'The worn item\'s game icon');
      const gold=await page.$eval('[data-slot="MainHand"] [data-offer="best"] .ae-gx-highlight',node=>getComputedStyle(node).color);
      const plain=await page.$eval('[data-slot="MainHand"] [data-offer="goal"] .ae-gx-highlight',node=>getComputedStyle(node).color);
      assert.notEqual(gold,plain,'The reward to go for is highlighted');
      assert.equal(await page.locator('#aeWhereUp + ol > li').first().getAttribute('data-slot'),'MainHand','The weapon first');
      const {scroll,wide}=await noSideScroll(page);
      assert.ok(scroll<=0,`No horizontal scroll (${scroll}px)`);assert.deepEqual(wide,[]);
      assert.deepEqual(errors,[]);
      await shot(page,`where-to-get-daeva-${width}`);
    }finally{await context.close();}
  });
}

await check('Where to get it: a #slot-N link lands on that slot',async()=>{
  const {page,context}=await open(`/hub/aetherium/guide/equipment/where-to-get/?${refQuery}#slot-7`,{live:true,viewport:{width:390,height:844}});
  try{
    await page.waitForSelector('#slot-7');
    const top=await page.$eval('#slot-7',node=>node.getBoundingClientRect().top);
    assert.ok(top>=-2&&top<200,`Slot 7 is in view (${top})`);
  }finally{await context.close();}
});

await check('Enhancement links to the Gear page Enhance tab; the Enhance tab links back to Where to get it for the slot',async()=>{
  const {page,context}=await open(`/hub/aetherium/guide/equipment/enhancement/?${refQuery}`);
  try{
    const href=await page.getAttribute('[data-enhance-link]','href');
    assert.equal(href,`/hub/aetherium/gear/equipment/?${new URLSearchParams({serverId:REF.serverId,characterId:REF.characterId,region:'eu'})}&view=enhance`);
    assert.equal(await page.locator('.ae-gx-tab').count(),5,'The five tabs');
    assert.deepEqual(await page.$$eval('.ae-gx-tab strong',nodes=>nodes.map(node=>node.textContent)),['Growth','Manastone','Theostone','Soul Binding','Transfer']);
  }finally{await context.close();}
  const gear=await open(`/hub/aetherium/gear/equipment/?${refQuery}&view=enhance&item=7`,{live:true,shell:'#aeMain'}).catch(error=>({error}));
  if(gear.error)throw gear.error;
  try{
    await gear.page.waitForSelector('[data-where-to-get]',{timeout:10000});
    const link=await gear.page.getAttribute('[data-where-to-get]','href');
    assert.equal(link,`/hub/aetherium/guide/equipment/where-to-get/?${new URLSearchParams({serverId:REF.serverId,characterId:REF.characterId,region:'eu'})}#slot-7`);
  }finally{await gear.context.close();}
});

await browser.close();
server.close();
if(failures){console.log(`AETHERIUM_GUIDE_EQUIPMENT=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_GUIDE_EQUIPMENT=PASS');
