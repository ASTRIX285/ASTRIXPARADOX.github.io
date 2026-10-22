#!/usr/bin/env node
// The Guide's Equipment and Crafting sections and Where to get it (feature/aetherium-guide-equipment, 18 Oct 2026), on a
// local static server with the armory Worker mocked (never NCSOFT, never the real Worker):
//   - all 13 pages draw in the Guide shell with their section lit, every topic page has the topic pills with its own lit,
//     facts carry status tags, no horizontal page scroll at 390 and 1600, nothing overlaps the viewport, no console errors;
//   - the static pages make no Worker call; the Equipment home shows the Expedition drop table;
//   - Where to get it (design/aetherium-guide-equipment-v1, 22 Oct 2026): the end goal (weapon, armour, accessory, guard at
//     item level 86), the climb as a ladder top step first with a thin gold line and every drop the old table held, no table;
//     for the Lv 45 fixture: step 1 is You are here, steps 2 and 3 dimmed with their gate, one next run on a gold edge, each
//     slot a gear path (Current, Best now, Next goal, End goal) across on a wide screen and top to bottom on a phone, no
//     Odyle pill, no side mission line, no gate twice in a card, the stray flagged and never blocked;
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
        else assert.ok(await page.locator('.ae-gd-ocard').count()>=3,'Topic cards');
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
    // The Overview cards are clean panels (design/aetherium-guide-overviews): no notch.
    assert.equal(await page.$eval('.ae-gd-ocard-link',node=>getComputedStyle(node).clipPath),'none','Cards have no notch');
  }finally{await context.close();}
});

for(const width of [1440,390]){
  await check(`Where to get it with no Daeva at ${width}: end goal, the climb top step first, no drop table, gold Find your Daeva, no Worker call`,async()=>{
    const {page,context,calls,errors}=await open('/hub/aetherium/guide/equipment/where-to-get/',{live:true,viewport:{width,height:width===390?844:1000}});
    try{
      await page.waitForSelector('#aeWhereClimb');
      assert.equal(await page.locator('#aeDropTable').count(),0,'The old drop table is gone');
      assert.equal(await page.locator('.ae-gx-star,.ae-gx-note').count(),0,'And its footnote');
      assert.match(await page.textContent('#aeWhereGoal'),/The best gear Expeditions drop in Season 1\./);
      assert.deepEqual(await page.$$eval('[data-goal]',nodes=>nodes.map(node=>node.dataset.goal)),['weapon','armour','accessory','guard'],'End goal: weapon, armour, accessory, guard');
      assert.deepEqual(await page.$$eval('[data-goal] .ae-wg-goal-meta',nodes=>nodes.map(node=>node.textContent)),['Item level 86','Item level 86','Item level 86','Item level 86']);
      assert.equal(await page.$eval('[data-goal="weapon"] .ae-wg-goal-name',node=>node.textContent),'Enraged Kromede Weapon series');
      assert.equal(await page.$eval('[data-goal="weapon"]',node=>getComputedStyle(node).borderLeftColor),await page.$eval('[data-goal="weapon"] .ae-wg-goal-name',node=>getComputedStyle(node).color),'The Unique edge and name share the grade colour');
      assert.deepEqual(await page.$$eval('.ae-wg-step',nodes=>nodes.map(node=>node.dataset.step)),['3','2','1'],'The highest step first');
      assert.deepEqual(await page.$$eval('.ae-wg-step-title',nodes=>nodes.map(node=>node.textContent)),['Step 3: item level 86','Step 2: item level 70','Step 1: item level 54']);
      assert.deepEqual(await page.$$eval('.ae-wg-step-gate',nodes=>nodes.map(node=>node.textContent)),['Entry Lv 45, item level 2,100+','Entry Lv 45, item level 1,400+','Entry Lv 45, item level 700+']);
      assert.equal(await page.locator('.ae-wg-run').count(),6,'Six Expeditions');
      assert.equal(await page.locator('[data-drop]').count(),12,'Every drop the table had');
      assert.equal(await page.locator('[data-set]').count(),6,'Armour and accessory series carry the Set tag');
      assert.match(await page.textContent('[data-run="krao-cave"] [data-gate="exploration"]'),/^Lv 20, item level 200\+$/);
      assert.match(await page.textContent('[data-run="krao-cave"] [data-gate="conquest"]'),/^Lv 45, item level 700\+$/);
      assert.equal(await page.textContent('[data-run="draupnir"] [data-gate="both"]'),'Exploration and Conquest: Lv 45, item level 700+','One gate line when both match');
      assert.match(await page.textContent('[data-run="fire-temple"] .ae-wg-run-text'),/^A lava temple full of Burn\.$/,'One line from the dungeon page');
      assert.equal(await page.getAttribute('[data-run="fire-temple"] [data-run-guide]','href'),'/hub/aetherium/guide/dungeons/fire-temple/');
      assert.equal(await page.locator('[data-here],[data-locked],[data-next]').count(),0,'No Daeva: the ladder is plain');
      const line=await page.$eval('.ae-wg-ladder',node=>{const after=getComputedStyle(node,'::before');return {width:parseFloat(after.width),colour:after.backgroundColor};});
      assert.ok(line.width>0&&line.width<=2,'A thin line');
      assert.match(line.colour,/^rgba\(226, 181, 79/,'Gold');
      const button=await page.$eval('[data-find-daeva]',node=>getComputedStyle(node).backgroundColor);
      assert.equal(button,'rgb(233, 194, 79)','The one main action is the solid gold button');
      assert.equal(await page.locator('.ae-gd-btn.is-gold').count(),1);
      const text=await page.textContent('#aeWhereHolder');
      assert.match(text,/Wednesday at 07:00 UTC/);
      assert.ok(!/No side mission|Odyle Energy\b.*Odyle Energy/s.test(text),'No side mission line, the Odyle line once');
      assert.equal(await page.locator('#aeWhereHolder img').count(),0,'No drawn or stand in icons without a Daeva');
      const {scroll,wide}=await noSideScroll(page);
      assert.ok(scroll<=0,`No horizontal scroll (${scroll}px)`);assert.deepEqual(wide,[]);
      assert.deepEqual(calls,[]);
      assert.deepEqual(errors,[]);
      await shot(page,`where-to-get-plain-${width}`);
    }finally{await context.close();}
  });
}

for(const width of [1440,390]){
  await check(`Where to get it for the Lv 45 Daeva at ${width}: you are here, locked steps, the next run, gear paths`,async()=>{
    const {page,context,calls,errors}=await open(`/hub/aetherium/guide/equipment/where-to-get/?${refQuery}`,{live:true,viewport:{width,height:width===390?844:1000}});
    try{
      await page.waitForSelector('#aeWhere');
      await page.waitForFunction(()=>/Item level 45/.test(document.querySelector('[data-slot="MainHand"] [data-node="current"]')?.textContent??''),null,{timeout:10000});
      assert.equal(calls[0],'/aion2/character','One character call first');
      assert.ok(calls.filter(path=>path==='/aion2/item').length<=19,'Item details within the budget');
      assert.match(await page.textContent('[data-where-who]'),/TESTDAEVA, Gladiator Lv 45, item level 849/);
      // The climb: step 1 is here, steps 2 and 3 are dimmed with their gate, one Expedition has the gold edge.
      assert.match(await page.textContent('.ae-wg-step[data-step="1"]'),/You are here/);
      assert.equal(await page.textContent('.ae-wg-step[data-step="2"] .ae-wg-step-gate'),'Need item level 1,400');
      assert.equal(await page.textContent('.ae-wg-step[data-step="3"] .ae-wg-step-gate'),'Need item level 2,100');
      assert.equal(await page.$eval('.ae-wg-step[data-step="3"] .ae-wg-runs',node=>getComputedStyle(node).opacity),'0.55','Locked steps are dimmed');
      assert.equal(await page.$eval('.ae-wg-step[data-step="1"] .ae-wg-runs',node=>getComputedStyle(node).opacity),'1');
      assert.equal(await page.locator('.ae-wg-run[data-next]').count(),1,'One next run');
      const next=await page.$eval('.ae-wg-run[data-next]',node=>({step:node.closest('.ae-wg-step').dataset.step,border:getComputedStyle(node).borderTopColor}));
      assert.equal(next.step,'1');
      assert.equal(next.border,'rgb(226, 181, 79)','The next run has a gold edge');
      // The weapon path: Current, Best now, Next goal, End goal.
      const weapon=page.locator('[data-slot="MainHand"]');
      assert.deepEqual(await weapon.locator('.ae-wg-node').evaluateAll(nodes=>nodes.map(node=>node.dataset.node)),['current','best','goal','end']);
      assert.deepEqual(await weapon.locator('.ae-wg-node-label').allTextContents(),['Current','Best now','Next goal','End goal']);
      assert.match(await weapon.locator('[data-node="best"]').textContent(),/Rupture Weapon series.*Krao Cave, Conquest.*You can enter/s);
      assert.match(await weapon.locator('[data-node="goal"]').textContent(),/Aulamus Weapon series.*Urugugu Canyon, Conquest.*Need item level 1,600/s);
      assert.match(await weapon.locator('[data-node="end"]').textContent(),/Enraged Kromede Weapon series.*Fire Temple, Conquest.*Need item level 2,100/s);
      assert.equal(await weapon.locator('[data-node="end"] [data-dungeon-link]').getAttribute('href'),'/hub/aetherium/guide/dungeons/fire-temple/');
      const icon=await weapon.locator('[data-node="current"] .ae-gtile img').getAttribute('src');
      assert.match(icon,/^https:\/\/assets\.playnccdn\.com\/static-aion2-gamedata\/resources\//,'The worn item\'s game icon');
      assert.equal(await weapon.locator('[data-node="best"] .ae-wg-level').evaluate(node=>getComputedStyle(node).borderTopColor),'rgb(226, 181, 79)','The step you can enter has a gold edge');
      assert.equal(await weapon.locator('[data-node="end"] .ae-wg-level').evaluate(node=>getComputedStyle(node).opacity),'0.5','Locked steps are dimmed');
      const gloves=page.locator('[data-slot="Gloves"]');
      assert.match(await gloves.locator('[data-node="best"]').textContent(),/Draupnir, Conquest.*You can enter/s);
      assert.match(await gloves.locator('[data-node="goal"]').textContent(),/Vakron Sky Island, Conquest.*Need item level 1,400/s);
      // Gone from every card: the Odyle Energy pill, the side mission line, a gate said twice.
      assert.equal(await page.locator('[data-cycle],[data-side-missions]').count(),0);
      assert.ok(!/No side mission listed/.test(await page.textContent('#aeWhereHolder')));
      for(const text of await page.locator('.ae-wg-slot,.ae-wg-run').allTextContents()){
        const gates=text.match(/item level [\d,]+/g)??[];
        assert.equal(new Set(gates).size,gates.length,`No gate twice in a card: ${gates.join(' | ')}`);
      }
      assert.match(await page.locator('[data-slot="Helmet"] [data-stray]').textContent(),/Epic helm is at \+4.*stones spent on it are lost/s,'The stray is flagged');
      assert.match(await page.textContent('[data-slot="Helmet"] [data-node="best"]'),/Draupnir/,'Flagged, never blocked');
      assert.match(await page.textContent('#aeWhereRest + ol .ae-wg-slot:has([data-slot="Amulet"])'),/No drop location listed\./);
      assert.equal((await page.textContent('#aeWhereHolder')).split('No drop location listed.').length-1,1,'Each reason said once');
      assert.equal(await page.locator('#aeWhereUp ~ ol.ae-wg-slots > li').first().getAttribute('data-slot'),'MainHand','The weapon first');
      assert.equal(await page.locator('[data-look-for-all]').count(),1,'The shared look-for line once, under the heading');
      assert.match(await page.textContent('[data-look-for-all]'),/^On the next piece, look for: .+\.$/);
      assert.equal(await page.$eval('[data-look-for-all]',node=>node.previousElementSibling?.id),'aeWhereUp','Right under Slots to upgrade');
      assert.equal(await page.locator('.ae-wg-slot [data-look-for]').count(),0,'Not repeated on the cards when every slot shares it');
      // The path runs across on a wide screen, top to bottom on a phone, with the gold line between the stops.
      const boxes=await weapon.locator('.ae-wg-node').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {x:Math.round(box.left),y:Math.round(box.top),bottom:Math.round(box.bottom)};}));
      if(width===390){
        assert.ok(boxes.every((box,at)=>at===0||box.y>=boxes[at-1].bottom-1),'Top to bottom on a phone');
        assert.ok(boxes.every(box=>box.x===boxes[0].x),'One column');
      }else{
        assert.ok(boxes.every(box=>box.y===boxes[0].y),'One row');
        assert.ok(boxes.every((box,at)=>at===0||box.x>boxes[at-1].x),'Left to right');
      }
      const link=await weapon.locator('[data-node="current"]').evaluate(node=>{const after=getComputedStyle(node,'::after');return {colour:after.backgroundColor,thick:Math.min(parseFloat(after.width),parseFloat(after.height))};});
      assert.equal(link.colour,'rgb(226, 181, 79)','A gold line joins the stops');
      assert.ok(link.thick>0&&link.thick<=2,'A thin line');
      const {scroll,wide}=await noSideScroll(page);
      assert.ok(scroll<=0,`No horizontal scroll (${scroll}px)`);assert.deepEqual(wide,[]);
      const text=await page.textContent('#aeStage');
      assert.ok(!/[–—]/.test(text),'No en or em dash');
      assert.ok(!/undefined|NaN|\[object/.test(text),'No broken values');
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
