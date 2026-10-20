#!/usr/bin/env node
// The Guide's Crafting pages drawn as pictures (design/aetherium-guide-crafting, 20 Oct 2026), on a local static server
// with the armory Worker off, checked by what the page looks like at 1440 and 390:
//   - Overview: the gold edged "before Lv 35" tip with its icon, the Dragon Lord tip with 5 lit Soul Binding markers
//     against 3 (and an outlined 4th), the end goal card on the Unique edge with its item levels, three first steps;
//   - Professions: five profession cards with the title font, a row of "Makes" chips, Refines only where the data has it,
//     the gold edged Market tip, the proficiency bar (Lv 10, Novice 1 to 50, the promotion marker, 51 to 100), numbered
//     steps, four key facts, "Which first: our pick for your class", no craft window frame while there is no screenshot;
//   - Gathering: one material card per type with faction tags and profession chips, four qualities in a row, the Odyle tip
//     with the real wing icon, no node photo frames;
//   - Crafted gear: a vertical ladder with Dragon Lord on top and Base at the bottom, a combo link between each step,
//     the disputed transfer steps left off, no open question, the one gold button;
//   - no sideways scroll, no dash, no "Refines: nothing", no Not confirmed or check in game text, no drawn SVG in the body,
//     no console errors. AE_SHOTS=<dir outside the repo> also saves full page screenshots.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const SHOTS=process.env.AE_SHOTS?resolve(process.env.AE_SHOTS):null;
if(SHOTS){assert.ok(!SHOTS.startsWith(root),'AE_SHOTS must be outside the repo');await mkdir(SHOTS,{recursive:true});}
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
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
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const ROOT='/hub/aetherium/guide/crafting/';

const browser=await chromium.launch();
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,width){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1000}});
  const errors=[];
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,'export const AETHERIUM_WORKER_URL = null;')});
  });
  await context.route(/^https:\/\/assets\.playnccdn\.com\//,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/^https:\/\/use\.typekit\.net\//,route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))errors.push(message.text());});
  await page.goto(`${base}${path}`);
  await page.waitForSelector('[data-guide-shell]',{timeout:15000});
  await page.waitForSelector('.ae-gc-block',{timeout:15000});
  await page.waitForLoadState('networkidle');
  return {page,context,errors};
}
const box=(page,selector)=>page.$eval(selector,node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};});
const style=(page,selector,prop)=>page.$eval(selector,(node,name)=>getComputedStyle(node)[name],prop);

async function common(page,errors,width,name){
  const scroll=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(scroll<=0,`No horizontal scroll (${scroll}px)`);
  const text=await page.textContent('#aeStage');
  assert.ok(!/[–—]/.test(text),'No en or em dash');
  assert.ok(!/undefined|NaN|\[object|Refines:\s*nothing|Not confirmed|check in game|armory|ASTRIX285|AXPARADOX/i.test(text),'No broken values, empty lines or banned words');
  assert.ok(!/Whether the White/.test(text),'No unanswered question');
  assert.equal(await page.locator('.ae-gc-block svg').count(),0,'No drawn icons in the Crafting content');
  assert.deepEqual(errors,[]);
  if(SHOTS)await page.screenshot({path:resolve(SHOTS,`crafting-${name}-${width}.png`),fullPage:true});
}

for(const width of [1440,390]){
  await check(`Overview at ${width}: gold tip, Soul Binding markers, end goal, three first steps`,async()=>{
    const {page,context,errors}=await open(ROOT,width);
    try{
      const gold=await page.$eval('[data-tip-id="before-35"]',node=>({cls:node.className,edge:getComputedStyle(node).borderLeftColor,icon:node.querySelector('img')?.getAttribute('src')}));
      assert.match(gold.cls,/is-gold/);
      assert.equal(gold.edge,await page.evaluate(()=>{const probe=document.createElement('i');probe.style.color='var(--ae-gd-gold)';document.body.append(probe);const colour=getComputedStyle(probe).color;probe.remove();return colour;}),'Gold left edge');
      assert.match(gold.icon,/images\/section-icons\/crafting\.png$/);
      assert.equal(await page.locator('[data-lines="crafted"] .ae-gc-mark.is-on').count(),5,'Crafted: 5 lit markers');
      assert.equal(await page.locator('[data-lines="drop"] .ae-gc-mark.is-on').count(),3,'Drop: 3 lit markers');
      assert.equal(await page.locator('[data-lines="drop"] .ae-gc-mark.is-maybe').count(),1,'Drop: a 4th maybe');
      const lit=await style(page,'[data-lines="crafted"] .ae-gc-mark.is-on','backgroundColor');
      assert.notEqual(lit,'rgba(0, 0, 0, 0)','Lit markers are filled');
      assert.equal(await page.getAttribute('[data-goal]','data-grade'),'unique');
      const goal=await page.textContent('[data-goal]');
      assert.match(goal,/True Dragon Lord \(Elyos\), Star Dragon Lord \(Asmodian\)/);
      assert.match(goal,/Bow item level\s*62/);assert.match(goal,/Splendent\s*70/);
      assert.equal(await page.locator('[data-craft-step]').count(),3);
      assert.ok(await page.locator('.ae-gx-tile').count()>=3,'Topic tiles stay');
      await common(page,errors,width,'home');
    }finally{await context.close();}
  });

  await check(`Professions at ${width}: cards, Market tip, proficiency bar, key facts, our pick`,async()=>{
    const {page,context,errors}=await open(`${ROOT}professions/`,width);
    try{
      assert.equal(await page.locator('[data-profession]').count(),5);
      const title=await page.$eval('[data-profession="alchemy"] .ae-gc-card-title',node=>({font:getComputedStyle(node).fontFamily,size:parseFloat(getComputedStyle(node).fontSize)}));
      assert.match(title.font,/fairy-tale-jf/i,'Card titles use the title font');
      assert.equal(title.size,width<720?24:28,'Card title size from the type scale');
      assert.equal(await page.locator('[data-profession="blacksmithing"] .ae-gc-makes li').count(),5);
      assert.equal(await page.locator('[data-profession="cooking"] .ae-gc-h4').count(),1,'Cooking shows Makes only, no Refines');
      const chips=await page.$$eval('[data-profession="armorsmithing"] .ae-gc-makes li',nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return r.y;}));
      assert.ok(chips.length===7,'Seven armour pieces');
      assert.match(await page.getAttribute('[data-tip-id="free"]','class'),/is-gold/);
      assert.match(await page.getAttribute('[data-tip-id="free"] img','src'),/topic-icons\/market\.png$/);
      const text=await page.textContent('#aeStage');
      assert.equal((text.match(/Membership gates the Market/g)||[]).length,1,'The Market fact once');
      assert.equal((text.match(/Every craft gives proficiency/g)||[]).length,0,'Every craft fact said once, in the lede');
      // The bar: Lv 10 on the left, Novice then the promotion marker then the rest, on one line.
      const opens=await box(page,'[data-opens]'),novice=await box(page,'.ae-gc-bar-seg.is-novice'),pro=await box(page,'.ae-gc-bar-seg.is-pro'),promo=await box(page,'[data-promotion] i');
      assert.match(await page.textContent('[data-opens]'),/Lv 10/);
      assert.ok(opens.x<novice.x&&novice.x<pro.x,'Lv 10, Novice, then after promotion, left to right');
      assert.ok(Math.abs(novice.y-pro.y)<2,'Both stages on one line');
      assert.ok(promo.x+promo.w/2>novice.x+novice.w-12&&promo.x<pro.x+12,'Promotion marker sits between the stages');
      assert.match(await page.textContent('.ae-gc-bar-seg.is-novice'),/Novice\s*1 to 50/);
      assert.match(await page.textContent('.ae-gc-bar-seg.is-pro'),/51 to 100/);
      assert.equal(await page.locator('.ae-gc-numbered li').count(),2);
      assert.deepEqual(await page.$$eval('.ae-gc-key',nodes=>nodes.map(node=>node.dataset.key)),['fail','hit','core','combo']);
      if(width>1200){const keys=await page.$$eval('.ae-gc-key',nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().y)));assert.equal(new Set(keys).size,1,'Four key facts on one row');}
      assert.equal(await page.locator('.ae-gc-combo-item').count(),2,'Combo shows both items');
      assert.equal(await page.locator('.ae-gc-shot').count(),0,'No craft window frame without a screenshot');
      assert.equal(await page.textContent('#aeCraftFirstTitle'),'Which first: our pick for your class');
      await common(page,errors,width,'professions');
    }finally{await context.close();}
  });

  await check(`Gathering at ${width}: material cards, qualities, tips with the wing icon`,async()=>{
    const {page,context,errors}=await open(`${ROOT}gathering/`,width);
    try{
      assert.equal(await page.locator('[data-material]').count(),6);
      assert.equal(await page.locator('.ae-gx-table').count(),0,'No table');
      assert.deepEqual(await page.$$eval('[data-material="Wood"] .ae-gc-faction',nodes=>nodes.map(node=>node.textContent)),['Elyos','Asmodian']);
      assert.notEqual(await style(page,'[data-faction="elyos"]','color'),await style(page,'[data-faction="asmodian"]','color'),'Faction tags differ');
      assert.deepEqual(await page.$$eval('[data-material="Ore"] [data-for]',nodes=>nodes.map(node=>node.textContent.trim())),['Blacksmithing','Armorsmithing']);
      assert.equal(await page.locator('[data-material="Odyle"] .ae-gc-mat-list').count(),0,'Odyle not listed twice');
      const qualities=await page.$$eval('[data-qualities] li',nodes=>nodes.map(node=>({name:node.textContent.replace(/\d/,'').trim(),y:Math.round(node.getBoundingClientRect().y)})));
      assert.deepEqual(qualities.map(item=>item.name),['Base','Fine','Pure','Radiant']);
      if(width>1200)assert.equal(new Set(qualities.map(item=>item.y)).size,1,'Four qualities in a row');
      assert.match(await page.getAttribute('[data-tip-id="odyle"] img','src'),/^https:\/\/assets\.playnccdn\.com\/static-aion2-gamedata\/resources\/Icon_WingB_006\.png$/);
      assert.equal(await page.locator('.ae-gc-shot').count(),0,'No node photo frames without photos');
      await common(page,errors,width,'gathering');
    }finally{await context.close();}
  });

  await check(`Crafted gear at ${width}: vertical ladder, Dragon Lord on top, combo links, gold button`,async()=>{
    const {page,context,errors}=await open(`${ROOT}crafted-gear/`,width);
    try{
      const rungs=await page.$$eval('[data-rung]',nodes=>nodes.map(node=>({name:node.dataset.rung,y:node.getBoundingClientRect().y,x:Math.round(node.getBoundingClientRect().x)})));
      assert.deepEqual(rungs.map(item=>item.name),['Dragon Lord',"Artisan's","Expert's",'Base'],'Top step first, Base last, transfer steps left off');
      assert.ok(rungs.every((item,index)=>index===0||item.y>rungs[index-1].y),'Stacked top to bottom');
      assert.equal(new Set(rungs.map(item=>item.x)).size,1,'One column');
      assert.equal(await page.locator('.ae-gc-link').count(),3,'A combo link between each step');
      assert.match(await page.textContent('[data-rung="Dragon Lord"]'),/Proficiency 55\s*Item level 62[\s\S]*Splendent\s*70/);
      assert.equal(await page.getAttribute('[data-rung="Dragon Lord"]','data-grade'),'unique');
      assert.notEqual(await style(page,'[data-rung="Dragon Lord"]','borderLeftColor'),await style(page,'[data-rung="Base"]','borderLeftColor'),'Unique edge on Dragon Lord');
      assert.ok(!/Transfer step|White Dragon Lord|Wise Dragon Lord/.test(await page.textContent('#aeLadder')),'Disputed transfer steps left off');
      assert.equal(await page.locator('#aeStage .ae-gd-btn.is-gold').count(),1,'One gold button');
      await common(page,errors,width,'crafted-gear');
    }finally{await context.close();}
  });
}

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_GUIDE_CRAFTING=FAIL ${failures}`);process.exit(1);}
console.log('AETHERIUM_GUIDE_CRAFTING=PASS');
