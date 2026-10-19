#!/usr/bin/env node
// The Guide's "Your path by level" page (brief feature/aetherium-guide-path, 18 Oct 2026), in Chromium on a local static
// server with the armory Worker mocked (never NCSOFT, never the real Worker).
//   - No Daeva: the level picker drives Done, Now and Coming up; Lv 45 shows the weekly loop and both countdowns.
//   - Memory: a ticked step and a weekly tick persist on reload; a weekly tick from before the Wednesday 07:00 UTC reset
//     is cleared (also when the clock passes the reset); the typed item level is saved with its age and names the next gate.
//   - Linked Daeva (the Lv 45 capture, served live): its level and class, combat power from the official data, its item
//     level, and "Since your last visit" after a change; a roster card alone is shown with its age, never as live.
//   - Looks: two columns at 1600, one at 390 with no sideways scroll; a ticked step's button turns gold.
//   - The Guide home's "Your path by level" row links here.
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
const PATH='/hub/aetherium/guide/path/';
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
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

const lv45=JSON.parse(await readFile(resolve(root,'astrix-app/tools/fixtures/aion2/eu/lv45-character.json'),'utf8'));
const P=lv45.info.profile;
const REF={serverId:P.serverId,characterId:P.characterId,region:'eu'};
const MEM_KEY=`${P.serverId}:${P.characterId}`;
const CP=P.combatPower.toLocaleString('en-GB');
const IL=lv45.info.stat.statList.find(row=>row.name==='아이템레벨').value;
const rosterOf=(level=45)=>({rosters:{[`eu:${P.serverId}`]:{region:'eu',serverId:P.serverId,serverName:P.serverName,entries:[{name:P.characterName,serverId:P.serverId,serverName:P.serverName,characterId:P.characterId,className:P.className,level,raceName:'Elyos',raceId:1,region:'eu',seenAt:'2026-10-15T10:00:00.000Z'}]}},active:{roster:`eu:${P.serverId}`,key:`${P.serverId}:${P.characterId}`}});
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');

const browser=await chromium.launch();
let failures=0;
const realCalls=[];
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path=PATH,{live=false,viewport={width:1600,height:1000},storage={},time=null}={}){
  const context=await browser.newContext({viewport});
  if(time)await context.clock.install({time:new Date(time)});
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    const text=await response.text();
    const body=text.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(body,text,'Config Worker URL line found and swapped');
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,route=>{
    const url=new URL(route.request().url());
    if(url.pathname!=='/aion2/character')return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({info:lv45.info,equipment:lv45.equipment,meta:{region:'eu',fetchedAt:new Date(time??Date.now()).toISOString(),cache:'miss'}})});
  });
  await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  await context.addInitScript(values=>{if(sessionStorage.getItem('gp-seeded'))return;sessionStorage.setItem('gp-seeded','1');for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},Object.fromEntries(Object.entries(storage).map(([key,value])=>[key,JSON.stringify(value)])));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,errors};
}
const ids=(page,list)=>page.$$eval(`[data-gp-list="${list}"] [data-gp-step]`,items=>items.map(item=>item.dataset.gpStep));
const memory=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.memory.v1')??'null'));
const noSideScroll=page=>page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:document.documentElement.clientWidth,wide:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(el=>el.className||el.tagName).slice(0,5)}));
const box=(page,selector)=>page.$eval(selector,el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};});

console.log('No Daeva: the level picker');
await check('Lv 1 by default: crafting and saving now, Nezekan coming up, no weekly loop',async()=>{
  const {page,context,errors}=await open();
  assert.equal(await page.$eval('#aeGpLevel',el=>el.value),'1');
  assert.deepEqual(await ids(page,'now'),['crafting-start','save-stones']);
  assert.equal((await ids(page,'next'))[0],'board-nezekan');
  assert.equal(await page.$('.ae-gp-weekly'),null);
  assert.match(await page.$eval('.ae-gd-crumbs',el=>el.innerText),/Guides[\s\S]*Your path by level/);
  assert.deepEqual(errors,[]);
  await context.close();
});
await check('picking Lv 22 moves Nezekan and Krao to done, stigmas now; the pick is remembered',async()=>{
  const {page,context}=await open();
  await page.selectOption('#aeGpLevel','22');
  assert.ok((await ids(page,'now')).includes('stigmas'));
  assert.ok((await ids(page,'done')).includes('board-nezekan'));
  assert.equal((await ids(page,'next'))[0],'stigma-2');
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.equal(await page.$eval('#aeGpLevel',el=>el.value),'22');
  await context.close();
});
await check('Lv 45: the weekly loop with both countdowns to the Wednesday and daily 07:00 UTC resets',async()=>{
  // Sunday 18 Oct 2026, 12:00 UTC: 2 days 19 hours to Wednesday 07:00, 19 hours to the daily reset.
  const {page,context}=await open(PATH,{time:'2026-10-18T12:00:00Z',storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}});
  assert.equal(await page.$$eval('[data-gp-weekly]',items=>items.length),6);
  assert.match(await page.$eval('[data-gp-count="weekly"]',el=>el.textContent),/^2 days 1[89] hours$/);
  assert.match(await page.$eval('[data-gp-count="daily"]',el=>el.textContent),/^(19 hours 0 minutes|18 hours 59 minutes)$/);
  assert.match(await page.$eval('.ae-gp-weekly',el=>el.innerText),/Every Wednesday, 07:00 UTC/);
  assert.deepEqual(await ids(page,'next'),[]);
  await context.close();
});

console.log('Memory');
await check('a ticked step persists on reload and moves to Done',async()=>{
  const {page,context}=await open();
  await page.click('[data-tick-step="crafting-start"]');
  assert.equal(await page.$eval('[data-tick-step="crafting-start"]',el=>el.getAttribute('aria-pressed')),'true');
  assert.ok((await ids(page,'done')).includes('crafting-start'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.ok((await ids(page,'done')).includes('crafting-start'));
  assert.ok(!(await ids(page,'now')).includes('crafting-start'));
  assert.ok((await memory(page)).daevas['device:guide'].steps['crafting-start']);
  await page.click('#aeGpDone summary');
  await page.click('[data-tick-step="crafting-start"]');
  assert.ok((await ids(page,'now')).includes('crafting-start'),'untick puts it back');
  await context.close();
});
await check('a weekly tick persists in its week and clears at the Wednesday 07:00 UTC reset',async()=>{
  const {page,context}=await open(PATH,{time:'2026-10-21T06:58:00Z',storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}});
  await page.click('[data-tick-weekly="ascension-trial"]');
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.equal(await page.$eval('[data-tick-weekly="ascension-trial"]',el=>el.getAttribute('aria-pressed')),'true');
  // The clock passes Wednesday 07:00 UTC with the page open: the loop redraws and the tick is gone, from the device too.
  await context.clock.fastForward('03:00');
  await page.waitForFunction(()=>document.querySelector('[data-tick-weekly="ascension-trial"]')?.getAttribute('aria-pressed')==='false',null,{timeout:5000});
  assert.equal((await memory(page)).daevas['device:guide'].weekly['ascension-trial'],undefined);
  await context.close();
});
await check('a weekly tick saved before the last reset is cleared on load; a daily tick clears at 07:00',async()=>{
  const storage={'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45,weekly:{'ascension-trial':'2026-10-13T20:00:00.000Z',nightmare:'2026-10-18T08:00:00.000Z',shugo:'2026-10-17T20:00:00.000Z'}}}}};
  const {page,context}=await open(PATH,{time:'2026-10-18T12:00:00Z',storage});
  const pressed=await page.$$eval('[data-tick-weekly]',items=>Object.fromEntries(items.map(item=>[item.dataset.tickWeekly,item.getAttribute('aria-pressed')])));
  assert.equal(pressed['ascension-trial'],'false','last week');
  assert.equal(pressed.nightmare,'true','today, after 07:00');
  assert.equal(pressed.shugo,'false','yesterday, before today\'s 07:00 reset');
  assert.deepEqual(Object.keys((await memory(page)).daevas['device:guide'].weekly),['nightmare']);
  await context.close();
});
await check('the typed item level is saved with its age and names the next gate',async()=>{
  const {page,context}=await open(PATH,{storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}});
  assert.match(await page.$eval('.ae-gp-item',el=>el.innerText),/Save your item level/);
  await page.fill('#aeGpIl','795');
  await page.click('#aeGpIlForm button[type=submit]');
  assert.equal(await page.$eval('[data-gp-il]',el=>el.textContent),'795');
  assert.match(await page.$eval('[data-gp-il-age]',el=>el.textContent),/^You typed this just now\.$/);
  assert.equal(await page.$eval('[data-gp-next-gate]',el=>el.dataset.gpNextGate),'ascension-trial');
  assert.match(await page.$eval('[data-gp-next-gate]',el=>el.textContent),/1,000, 205 to go/);
  assert.ok(await page.$('[data-gp-gate="krao-conquest"]'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  assert.equal(await page.$eval('[data-gp-il]',el=>el.textContent),'795');
  assert.equal((await memory(page)).daevas['device:guide'].itemLevel.value,795);
  await context.close();
});

console.log('Linked Daeva');
await check('a roster card alone: its level and class, with its age, never as live',async()=>{
  const {page,context}=await open(PATH,{storage:{'aetherium.roster.v2':rosterOf(30)}});
  const who=await page.$eval('[data-gp-who]',el=>el.innerText);
  assert.match(who,new RegExp(`${P.characterName}, Gladiator Lv 30`));
  assert.match(who,/saved Daeva card, read \d+ days? ago\. Not live/);
  assert.equal(await page.$('#aeGpLevel'),null,'no picker with a linked Daeva');
  assert.match(await page.$eval('.ae-gp-cp',el=>el.innerText),/Shows when the official site answers/);
  await context.close();
});
await check('live: level, combat power and item level from the official data; the first visit is recorded',async()=>{
  const {page,context,errors}=await open(PATH,{live:true,storage:{'aetherium.roster.v2':rosterOf(30)}});
  await page.waitForSelector('[data-gp-cp]');
  assert.equal(await page.$eval('[data-gp-cp]',el=>el.textContent),CP);
  assert.equal(await page.$eval('[data-gp-il]',el=>el.textContent),IL.toLocaleString('en-GB'));
  assert.match(await page.$eval('.ae-gp-item',el=>el.innerText),/From the official AION 2 site/);
  assert.equal(await page.$('#aeGpIlForm'),null,'no typed field when the official data has it');
  assert.equal(await page.evaluate(()=>document.body.dataset.gpLevel),'45');
  assert.ok(await page.$('.ae-gp-weekly'));
  assert.equal(await page.$eval('[data-gp-since]',el=>el.dataset.gpSince),'first');
  const enhance=await page.$eval('[data-gp-power="unique-growth"] a',el=>el.getAttribute('href'));
  assert.match(enhance,/\/hub\/aetherium\/gear\/equipment\/\?.*view=enhance/);
  const snap=(await memory(page)).daevas[MEM_KEY].snapshot;
  assert.equal(snap.combatPower,P.combatPower);
  assert.equal(snap.level,45);
  assert.ok(Object.keys(snap.gear).length>5,'grade and enchant per slot');
  assert.deepEqual(errors,[]);
  await context.close();
});
await check('since your last visit: the changes from the saved snapshot, with its date',async()=>{
  const old={level:44,combatPower:38000,itemLevel:760,gear:{},at:'2026-10-10T09:00:00.000Z'};
  await runSince(old);
});
await check('since your last visit: an enchant step on a slot',async()=>{
  const main=lv45.equipment.equipment.equipmentList.find(item=>item.slotPosName==='MainHand');
  const was=main.enchantLevel===0?1:main.enchantLevel-1;
  const old={level:45,combatPower:P.combatPower,itemLevel:IL,gear:Object.fromEntries(lv45.equipment.equipment.equipmentList.map(item=>[item.slotPosName,{name:item.name,grade:item.grade,enchant:item===main?was:item.enchantLevel}])),at:'2026-10-12T09:00:00.000Z'};
  const {page,context}=await open(PATH,{live:true,storage:{'aetherium.roster.v2':rosterOf(45),'aetherium.memory.v1':{v:1,daevas:{[MEM_KEY]:{snapshot:old}}}}});
  await page.waitForSelector('[data-gp-since="changes"]');
  const text=await page.$eval('[data-gp-since]',el=>el.innerText);
  assert.ok(text.startsWith('Since your last visit (12 Oct 2026):'),text);
  assert.ok(text.includes(`+${was} to +${main.enchantLevel}`),text);
  assert.doesNotMatch(text,/MainHand/,'the slot shows by its label');
  assert.equal(await page.$$eval('[data-gp-since] li',items=>items.length),1,'only the slot that moved');
  await context.close();
});
async function runSince(old){
  const {page,context}=await open(PATH,{live:true,storage:{'aetherium.roster.v2':rosterOf(44),'aetherium.memory.v1':{v:1,daevas:{[MEM_KEY]:{snapshot:old}}}}});
  await page.waitForSelector('[data-gp-since="changes"]');
  const text=await page.$eval('[data-gp-since]',el=>el.innerText);
  assert.match(text,/Since your last visit \(10 Oct 2026\):/);
  assert.match(text,/Level 44 to 45/);
  assert.match(text,new RegExp(`Combat power up ${(P.combatPower-38000).toLocaleString('en-GB')} to ${CP}`));
  assert.match(text,new RegExp(`Item level 760 to ${IL}`));
  assert.doesNotMatch(text,/worn/,'no slot list against a snapshot with no gear');
  // A reload straight after keeps showing the same changes.
  await page.reload();
  await page.waitForSelector('[data-gp-since="changes"]');
  assert.match(await page.$eval('[data-gp-since]',el=>el.innerText),/Level 44 to 45/);
  await context.close();
}

console.log('Looks');
for(const width of [1600,390]){
  await check(`no sideways scroll at ${width}, with a linked Lv 45 Daeva and with the picker`,async()=>{
    for(const options of [{live:true,storage:{'aetherium.roster.v2':rosterOf(45)}},{storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}}]){
      const {page,context}=await open(PATH,{...options,viewport:{width,height:900}});
      if(options.live)await page.waitForSelector('[data-gp-cp]');
      const scroll=await noSideScroll(page);
      assert.ok(scroll.doc<=scroll.view,`page scrolls sideways (${scroll.doc} > ${scroll.view}): ${scroll.wide.join(', ')}`);
      assert.deepEqual(scroll.wide,[]);
      await context.close();
    }
  });
}
await check('two columns at 1600, one at 390; the tick button is a cylinder that turns gold when done',async()=>{
  let {page,context}=await open(PATH,{storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}});
  let main=await box(page,'.ae-gp-main'),side=await box(page,'.ae-gp-side');
  assert.ok(side.left>=main.right,'side column beside the path at 1600');
  const before=await page.$eval('[data-tick-step="draupnir"]',el=>({radius:getComputedStyle(el).borderTopLeftRadius,border:getComputedStyle(el).borderTopColor,height:el.getBoundingClientRect().height}));
  await page.click('[data-tick-step="draupnir"]');
  await page.click('#aeGpDone summary');
  const after=await page.$eval('[data-gp-list="done"] [data-tick-step="draupnir"]',el=>getComputedStyle(el).borderTopColor);
  assert.ok(parseFloat(before.radius)>=20,`cylinder ends (${before.radius})`);
  assert.ok(before.height>=44,'44 px target');
  assert.notEqual(after,before.border,'gold edge when done');
  assert.match(after,/rgb\(2[0-5]\d, 1[5-9]\d, \d{2}\)/,`gold (${after})`);
  await context.close();
  ({page,context}=await open(PATH,{viewport:{width:390,height:900},storage:{'aetherium.memory.v1':{v:1,daevas:{'device:guide':{level:45}}}}}));
  main=await box(page,'.ae-gp-main');side=await box(page,'.ae-gp-side');
  assert.ok(side.top>=main.bottom,'side stacks under the path at 390');
  assert.ok(main.left>=0&&main.right<=390);
  await context.close();
});

console.log('Links');
await check('the Guide home\'s "Your path by level" row opens this page',async()=>{
  const {page,context}=await open('/hub/aetherium/guide/');
  const href=await page.$eval('[data-guide-start="4"]',el=>el.getAttribute('href'));
  assert.equal(href,PATH);
  await context.close();
});

await browser.close();
server.close();
assert.deepEqual(realCalls,[],'never the real Worker or NCSOFT');
console.log(failures?`AETHERIUM_GUIDE_PATH=FAIL ${failures}`:'AETHERIUM_GUIDE_PATH=PASS');
process.exit(failures?1:0);
