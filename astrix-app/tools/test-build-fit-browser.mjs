#!/usr/bin/env node
// The real Build Fit page with the recorded "Consecration Titan PERFECTED" share (dim.gg/hnpxfxy),
// its recorded manifest subset and a test Titan inventory (fixtures/dim-import/consecration-*). No live call.
// At 1600 and 390:
//   - Build Review sends a share with missing items to Build Fit on its own URL;
//   - every missing item has Approve, Choose another and Leave empty (each at least 40px high);
//     the chosen one carries the strobe stroke; Choose another is a bottom sheet on phone;
//   - same-set pieces outrank slot and stat matches, with real reason and cost text, never
//     "Compatible equipment slot"; set bonuses and stats update live;
//   - Continue stays disabled until every missing item is decided; a reload and a shared link keep
//     the decisions; Approve all suggestions decides the rest;
//   - Continue hands The Forge exactly those choices: armour per slot, all shared mods on the right
//     pieces (or listed with a reason), subclass and artifact as shared, the equipment, and every gear
//     tile's tooltip names that tile's own item.
// TEST_SHOT_DIR=<folder outside the repo> saves before and after screenshots.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {consecrationFixture,CONSECRATION_SHARE} from './fixtures/dim-import/consecration-inventory.mjs';
import {IMPORT_TABLES} from '../core/dim-import/cache.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const AUTH='https://auth.astrixparadox.com';
const HELMET=3448274439,GAUNTLETS=3551918588,CHEST=14239492,LEGS=20886954;
const f=await consecrationFixture(),version=f.snapshot.version,tables=f.snapshot.tables;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
  const envelope=page=>({schemaVersion:2,transport:'prepared-page-stream-v1',
    account:{authenticated:true,membership:{membershipId:f.binding.membershipId,membershipType:3},profile:{...f.profile,characterLoadouts:{data:{[f.characterId]:{loadouts:[]}}}},definitions:tables.DestinyInventoryItemDefinition,definitionCoverage:{complete:true,unresolved:[]},characterBuildCoverage:{complete:true},loadoutCoverage:{complete:true},pageReady:{page,manifestVersion:version,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},
    prepared:{manifestVersion:version,page,artifactCatalog:[]}});
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
      if(url.pathname===`/dim/share/${CONSECRATION_SHARE}`)return json(f.share);
      if(url.pathname==='/bungie/manifest/import/status')return json(status);
      if(url.pathname==='/bungie/manifest/import/shard'){const type=url.searchParams.get('type');return json({manifestVersion:version,type,shard:0,archive:false,definitions:tables[type]||{}});}
      if(url.pathname.startsWith('/bungie/page/'))return json(envelope(url.pathname.split('/').pop()));
      if(url.pathname==='/bungie/profile')return json({profile:f.profile,definitions:tables.DestinyInventoryItemDefinition});
      if(url.pathname==='/bungie/account')return json({displayName:'Fixture'});
      return json({error:'not_in_fixture'},404);
    });
    return {context,page,errors};
  }
  const ready=page=>page.waitForSelector('.bf-slots .bf-slot',{timeout:30000});
  // The portal loader keeps the outgoing page until the destination reports ready; shoot after the reveal.
  const revealed=async page=>{await page.waitForFunction(()=>![document.documentElement,document.body].some(node=>['apx-booting','apx-loading','apx-navigation-waiting'].some(name=>node.classList.contains(name))),null,{timeout:30000});await page.waitForTimeout(600);};
  const state=page=>page.evaluate(()=>({
    search:location.search,
    slots:[...document.querySelectorAll('.bf-slot')].map(node=>({bucket:Number(node.dataset.bucket),missing:node.classList.contains('is-missing'),pick:node.querySelector('.bf-pick strong')?.textContent||'',tag:node.querySelector('.bf-pick .bf-tag')?.textContent||'',reasons:node.querySelector('.bf-pick .is-reason')?.innerText||'',costs:node.querySelector('.bf-pick .is-cost')?.innerText||'',pressed:node.querySelector('[data-decide][aria-pressed="true"]')?.dataset.decide||'',buttons:[...node.querySelectorAll('[data-decide]')].map(button=>({label:button.textContent,height:button.getBoundingClientRect().height,disabled:button.disabled}))})),
    sets:[...document.querySelectorAll('.bf-set-row')].map(node=>({name:node.querySelector('b').textContent,active:[...node.querySelectorAll('.bf-perk.is-active span:not(.bf-perk-need)')].map(perk=>perk.textContent)})),
    stats:Object.fromEntries([...document.querySelectorAll('.bf-stats div')].map(node=>[node.querySelector('dt').textContent,node.querySelector('dd').textContent])),
    continueLabel:document.querySelector('#bfContinue')?.textContent,continueDisabled:document.querySelector('#bfContinue')?.disabled,
    text:document.querySelector('#bfRoot')?.innerText||'',
    overflow:document.documentElement.scrollWidth-innerWidth
  }));
  const slot=(s,bucket)=>s.slots.find(row=>row.bucket===bucket);
  for(const width of [1600,390]){
    const {context,page,errors}=await open(width);
    // Build Review sends a share with missing items to Build Fit, never straight to Builder.
    await page.goto(`${origin}/astrix-app/pages/build-review/?dim=${CONSECRATION_SHARE}&characterId=${f.characterId}&step=1`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#brFit',{timeout:30000}).catch(async error=>{console.log(await page.evaluate(()=>document.body.innerText.slice(0,1500)),errors);throw error;});
    assert.equal(await page.locator('#brManual').count(),0,`${width}: no unreviewed Send to Builder while items are missing`);
    await page.click('#brFit');
    await ready(page);
    assert.equal(new URL(page.url()).pathname,'/astrix-app/pages/build-fit/','Build Fit has its own URL');
    let s=await state(page);
    const missing=s.slots.filter(row=>row.missing);
    assert.deepEqual(missing.map(row=>row.bucket).sort(),[HELMET,GAUNTLETS,CHEST,LEGS].sort(),`${width}: the four shared set pieces are the missing items`);
    for(const row of missing){
      assert.deepEqual(row.buttons.map(button=>button.label),['Approve','Choose another','Leave empty'],`${width}: three choices per missing item`);
      for(const button of row.buttons)assert.ok(button.height>=40,`${width}: ${button.label} is at least 40px (${button.height})`);
      assert.equal(row.tag,'Suggestion from your inventory',`${width}: an undecided suggestion is labelled as a suggestion, never the sharer's item`);
    }
    assert.doesNotMatch(s.text,/Compatible equipment slot/,`${width}: no empty "Compatible equipment slot" reason`);
    assert.equal(slot(s,HELMET).pick,"Legacy's Oath Helm",`${width}: same-set piece suggested for the helmet`);
    assert.match(slot(s,HELMET).reasons,/Keeps the Legacy's Oath 2-piece bonus \(Augmented Servos\) with Legacy's Oath Plate\./);
    assert.equal(slot(s,GAUNTLETS).pick,"Willbreaker's Fists");
    assert.match(slot(s,GAUNTLETS).reasons,/Keeps the Crota's Memory 2-piece bonus \(Cursed Fist\) with Willbreaker's Greaves\./);
    assert.equal(s.continueDisabled,true,`${width}: Continue is blocked with nothing decided`);
    assert.equal(s.continueLabel,'DECIDE 4 MORE ITEMS');
    assert.ok(s.overflow<=0,`${width}: no sideways scroll (${s.overflow}px)`);
    if(process.env.TEST_SHOT_DIR){await revealed(page);await page.screenshot({path:resolve(process.env.TEST_SHOT_DIR,`build-fit-before-${width}.png`),fullPage:true});}

    // Approve: the decision is pressed, carries the strobe stroke and is in the URL.
    await page.click(`[data-bucket="${HELMET}"][data-decide="approve"]`);
    s=await state(page);
    assert.equal(slot(s,HELMET).pressed,'approve');assert.equal(slot(s,HELMET).tag,'Approved replacement');
    assert.match(s.search,new RegExp(`fit=${HELMET}%3Aa\\d+`),`${width}: the approval is in the URL`);
    const strobe=await page.evaluate(bucket=>{const button=document.querySelector(`[data-bucket="${bucket}"][data-decide="approve"]`),after=getComputedStyle(button,'::before'),other=getComputedStyle(document.querySelector(`[data-bucket="${bucket}"][data-decide="empty"]`),'::before');return {name:after.animationName,content:after.content,padLeft:after.paddingLeft,padBottom:after.paddingBottom,other:other.content};},HELMET);
    assert.equal(strobe.name,'bf-stroke-pulse',`${width}: the chosen decision pulses`);
    assert.deepEqual([strobe.padLeft,strobe.padBottom],['1.5px','1.5px'],`${width}: the stroke runs 1.5px on the left and bottom`);
    assert.equal(strobe.other,'none',`${width}: unchosen decisions carry no stroke`);

    // Choose another: ranked picker; same set outranks a slot and stat match. Phone shows a bottom sheet.
    await page.click(`[data-bucket="${GAUNTLETS}"][data-decide="choose"]`);
    await page.waitForSelector('#bfPicker[open]');
    const sheet=await page.evaluate(()=>{const dialog=document.querySelector('#bfPicker'),box=dialog.getBoundingClientRect();return {bottom:Math.round(box.bottom),left:Math.round(box.left),width:Math.round(box.width),names:[...dialog.querySelectorAll('.bf-option strong')].map(node=>node.textContent),costs:[...dialog.querySelectorAll('.bf-option')].map(node=>node.querySelector('.is-cost')?.innerText||''),use:[...dialog.querySelectorAll('[data-use]')].map(node=>node.getBoundingClientRect().height)};});
    assert.equal(sheet.names[0],"Willbreaker's Fists",`${width}: the same-set piece ranks first`);
    const pantheos=sheet.names.indexOf('Pantheos Resplendent Gauntlets');
    assert.ok(pantheos>0,`${width}: the higher-Melee Pantheos piece ranks below the set piece`);
    assert.match(sheet.costs[pantheos],/Loses the Crota's Memory 2-piece bonus \(Cursed Fist\)\./,`${width}: the cost of breaking the set is stated`);
    for(const height of sheet.use)assert.ok(height>=40,`${width}: picker buttons are at least 40px`);
    if(width<600){assert.equal(sheet.bottom,844,'Phone: the picker sits on the bottom edge');assert.equal(sheet.left,0);assert.equal(sheet.width,390,'Phone: the picker is full width');}
    else assert.ok(sheet.bottom<1000,'Desktop: the picker is a centred dialog');
    await page.click(`#bfPicker [data-use]:nth-of-type(1) >> nth=${pantheos}`).catch(async()=>{await page.locator('#bfPicker [data-use]').nth(pantheos).click();});
    s=await state(page);
    assert.equal(slot(s,GAUNTLETS).pick,'Pantheos Resplendent Gauntlets');assert.equal(slot(s,GAUNTLETS).tag,'Your choice');assert.equal(slot(s,GAUNTLETS).pressed,'choose');
    assert.match(slot(s,GAUNTLETS).costs,/Loses the Crota's Memory 2-piece bonus \(Cursed Fist\)/);

    // Leave empty.
    await page.click(`[data-bucket="${CHEST}"][data-decide="empty"]`);
    s=await state(page);
    assert.equal(slot(s,CHEST).pressed,'empty');assert.equal(slot(s,CHEST).tag,'Left empty');
    assert.equal(s.continueDisabled,true,`${width}: Continue stays blocked while the legs are undecided`);
    assert.equal(s.continueLabel,'DECIDE 1 MORE ITEM');
    // Live result: Legacy's Oath lost its pair (chest left empty), Crota's Memory lost its pair (Pantheos gauntlets).
    assert.ok(!s.sets.some(set=>set.active.length),`${width}: no set bonus is active with these decisions`);

    // A reload keeps every decision.
    const decided=s.search;
    await page.reload({waitUntil:'domcontentloaded'});await ready(page);
    s=await state(page);
    assert.equal(s.search,decided,`${width}: the URL survives a reload`);
    assert.deepEqual([HELMET,GAUNTLETS,CHEST,LEGS].map(bucket=>slot(s,bucket).pressed),['approve','choose','empty',''],`${width}: decisions survive a reload`);

    // Approve all suggestions decides the rest, and only the rest.
    await page.click('#bfApproveAll');
    s=await state(page);
    assert.deepEqual([HELMET,GAUNTLETS,CHEST,LEGS].map(bucket=>slot(s,bucket).pressed),['approve','choose','empty','approve'],`${width}: Approve all keeps earlier decisions`);
    assert.equal(slot(s,LEGS).pick,"Willbreaker's Greaves");
    assert.equal(s.continueDisabled,false,`${width}: Continue unlocks once everything is decided`);
    assert.equal(s.continueLabel,'CONTINUE TO THE FORGE');
    assert.equal(s.stats.Melee,String(10+30+0+18+20),`${width}: stat totals follow the decided pieces`);
    const subclassShown=await page.evaluate(()=>[...document.querySelectorAll('#bfSubclassTitle ~ .bf-icons li span')].map(node=>node.textContent));
    assert.deepEqual(subclassShown,['Glacial Quake','Thruster','Strafe Lift','Frenzied Blade','Glacier Grenade','Consecration','Knockout','Facet of Protection','Facet of Purpose','Facet of Courage','Facet of Ruin'],`${width}: the subclass shows exactly the shared plugs`);
    if(process.env.TEST_SHOT_DIR){await revealed(page);await page.screenshot({path:resolve(process.env.TEST_SHOT_DIR,`build-fit-after-${width}.png`),fullPage:true});}

    // The same link opens the same build in a fresh browser.
    const link=page.url();
    {const other=await open(width);await other.page.goto(link,{waitUntil:'domcontentloaded'});await ready(other.page);const t=await state(other.page);
      assert.deepEqual([HELMET,GAUNTLETS,CHEST,LEGS].map(bucket=>slot(t,bucket).pressed),['approve','choose','empty','approve'],`${width}: a shared link opens the same decisions`);
      assert.deepEqual(other.errors,[]);await other.context.close();}

    // Continue: The Forge receives exactly these choices.
    await page.click('#bfContinue');
    await page.waitForURL(/paradox-build-space/,{timeout:30000});
    await page.waitForFunction(()=>document.querySelectorAll('#armourGrid .gear-slot').length===5&&document.querySelector('#dimBuildComparison:not([hidden])'),null,{timeout:30000});
    await page.waitForTimeout(500);
    const forge=await page.evaluate(()=>({
      armour:[...document.querySelectorAll('#armourGrid .gear-slot')].map(node=>({name:node.querySelector('.arm')?.title||'',mods:[...node.querySelectorAll('.gear-mod')].map(mod=>mod.title)})),
      weapons:[...document.querySelectorAll('#weaponGrid .weap')].map(card=>card._forgeWeapon?.name||''),
      panel:document.querySelector('#dimBuildComparison')?.innerText||'',
      equipment:document.querySelector('#buildEquipment,[data-build-equipment]')?.innerText||''
    }));
    assert.deepEqual(forge.armour.map(row=>row.name),["Legacy's Oath Helm",'Pantheos Resplendent Gauntlets','Chest',"Willbreaker's Greaves",'Stoicism'],`${width}: The Forge has exactly the decided armour`);
    assert.deepEqual(forge.weapons,['Conditional Finality','The Ringing Nail','The Slammer'],`${width}: weapons as shared`);
    for(const [index,mods] of [[0,['Harmonic Siphon','Dynamo','Hands-On','Melee Mod']],[1,['Impact Induction','Heavy Handed','Melee Font','Melee Mod']],[3,['Recuperation','Invigoration','Absolution','Melee Mod']],[4,['Outreach','Time Dilation','Powerful Attraction','Melee Mod']]])
      for(const mod of mods)assert.ok(forge.armour[index].mods.includes(mod),`${width}: ${mod} is on ${forge.armour[index].name} (${forge.armour[index].mods.join(', ')})`);
    for(const label of ['Approved replacement','Your choice','Left empty','Shared mods and cosmetics','Shared artifact picks (12)'])assert.ok(forge.panel.includes(label),`${width}: The Forge panel shows "${label}"`);
    for(const mod of ['Solar Resistance','Melee Damage Resistance','Concussive Dampener'])assert.match(forge.panel,new RegExp(`${mod} \\(\\d+\\): No Chest in this build to hold it\\.`),`${width}: ${mod} is listed with its reason, never dropped`);
    assert.doesNotMatch(forge.panel,/Compatible equipment slot/);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#weaponGrid *,#armourGrid *')].filter(node=>!node.childElementCount&&node.textContent.trim()==='?').length),0,`${width}: no "?" sockets in The Forge`);
    // Tooltips name the tile's own item. Click a weapon icon in the fit panel first (it keeps focus),
    // then hover every gear tile: any tooltip on screen must be that tile's item, never another.
    const nail=page.locator('#dimBuildComparison [data-icon-name="The Ringing Nail"]').first();
    if(await nail.count()){await nail.scrollIntoViewIfNeeded();await nail.click();}
    const tiles=[...forge.weapons.map((name,i)=>({selector:`#weaponGrid .weap >> nth=${i}`,name})),...forge.armour.map((row,i)=>({selector:`#armourGrid .gear-slot .arm >> nth=${i}`,name:row.name}))];
    for(const tile of tiles){
      const node=page.locator(tile.selector);await node.scrollIntoViewIfNeeded();await node.hover();await page.waitForTimeout(250);
      const shown=await page.evaluate(()=>[...document.querySelectorAll('.apx-icon-tooltip,#paradoxItemHover,[role="tooltip"]')].filter(tip=>!tip.hidden&&getComputedStyle(tip).display!=='none'&&getComputedStyle(tip).visibility!=='hidden'&&tip.getBoundingClientRect().width>0).map(tip=>tip.innerText.trim()));
      for(const text of shown)assert.ok(text.includes(tile.name),`${width}: hovering ${tile.name} shows "${text.split(String.fromCharCode(10))[0]}"`);
      const title=await node.evaluate(el=>el.getAttribute('title')||el.querySelector('[title]')?.getAttribute('title')||'');
      if(title)assert.ok(title.includes(tile.name),`${width}: ${tile.name} tile title is "${title}"`);
    }
    if(process.env.TEST_SHOT_DIR){await page.evaluate(()=>scrollTo(0,0));await revealed(page);await page.screenshot({path:resolve(process.env.TEST_SHOT_DIR,`build-fit-forge-${width}.png`),fullPage:true});}
    assert.deepEqual(errors,[],`${width}: page errors`);
    await context.close();
  }
  console.log('BUILD_FIT_BROWSER=PASS real Build Review, Build Fit and Forge pages at 1600 and 390: three choices per missing item, strobe on the chosen one, bottom sheet on phone, same set outranks slot and stats with reason and cost text, Continue blocked until decided, reload and shared link keep decisions, Approve all, and The Forge receives exactly the decided armour with every shared mod placed or listed with its reason');
}finally{
  await browser?.close();server.close();
}
