import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const script=`import {characterLoadoutsFixture} from '/astrix-app/tools/fixtures/character-loadouts-fixture.mjs';
const fixture=characterLoadoutsFixture();window.fixture=fixture;window.FORGE_PAGE_PAYLOAD={profile:fixture.profile,definitions:fixture.definitions};
window.FORGE_BUNGIE_SESSION={authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'123',membershipType:3},capabilities:{destinyActions:{equipLoadout:true,snapshotLoadout:true,clearLoadout:true}}};
await import('/astrix-app/pages/guardian-workspace-v2/guardian-loadouts.mjs');
window.publish=()=>document.dispatchEvent(new CustomEvent('forge:guardian-selection-changed',{detail:{source:'bungie-live',characterId:'1',loadoutsAvailable:true,loadouts:fixture.loadouts,selectedLoadoutIndex:1}}));
window.selected=[];document.addEventListener('forge:loadout-selected',event=>{window.selected.push(event.detail);window.publish();});window.publish();window.fixtureReady=true;`;
const html=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/astrix-palette.css"><link rel="stylesheet" href="/astrix-app/shared/astrix-desktop-density.css"><link rel="stylesheet" href="/astrix-app/pages/guardian-workspace-v2/guardian-left-rail-shared.css"><style>body{margin:24px;background:#101722}.guardian-loadouts-strip{width:100%;box-sizing:border-box}</style></head><body class="guardian-main-page apx-fluid-icons"><section class="guardian-loadouts-strip"><div id="guardianLoadouts" class="guardian-loadouts-grid"></div></section><script type="module" src="/loadout-fixture.mjs"></script></body></html>`;
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(path==='/loadout-fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 assert.equal((await fetch(origin+'/astrix-app/pages/guardian-workspace-v2/guardian-loadouts.mjs')).status,200);
 try{browser=await chromium.launch({channel:'chromium',headless:true});}catch(error){if(/Executable doesn't exist/.test(error.message))console.error('NOT RUN: Chromium missing');throw error;}
 for(const width of [1363,2560]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];let fail='',release;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='auth.astrixparadox.com'&&url.pathname.startsWith('/bungie/actions/loadout/')){
    requests.push({path:url.pathname,body:route.request().postDataJSON()});
    if(release)await new Promise(done=>{release.done=done;});
    await route.fulfill({status:fail?400:200,json:fail?{ErrorCode:99,ErrorStatus:fail==='activity'?'DestinyCharacterNotInSocialSpace':'FixtureFailure',Message:fail==='activity'?'Character cannot equip here':'Bungie fixture failure, membership 123'}:{ErrorCode:1,Response:0}});return;
   }
   if(url.hostname==='www.bungie.net'){await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});return;}
   if(url.origin!==origin){await route.abort();return;}await route.continue();
  });
  await page.goto(origin);await page.waitForFunction(()=>window.fixtureReady);
  assert.deepEqual(await page.locator('[data-loadout-slot]').evaluateAll(nodes=>nodes.slice(0,4).map(node=>node.dataset.loadoutState)),['equipped','ready','missing','empty']);
  assert.deepEqual(await page.locator('.guardian-loadout-badge').allTextContents(),['✓','✓','!']);
  assert.equal(await page.locator('[data-loadout-slot="2"] .guardian-loadout-badge').getAttribute('aria-label'),'2 items missing');
  assert.equal(await page.locator('[data-loadout-slot="3"] .guardian-loadout-badge').count(),0);
  const outline=await page.locator('[data-loadout-slot="0"]').evaluate(node=>({width:getComputedStyle(node).outlineWidth,color:getComputedStyle(node).outlineColor,badge:getComputedStyle(node.querySelector('.guardian-loadout-badge')).color}));
  assert.equal(outline.width,'2px');assert.equal(outline.color,outline.badge);
  assert.notEqual(await page.locator('[data-loadout-slot="1"] .guardian-loadout-badge').evaluate(node=>getComputedStyle(node).color),outline.color);
  const slotSize=(await page.locator('[data-loadout-slot="1"]').boundingBox()).width;assert.ok(slotSize>=32&&slotSize<=66);
  await page.locator('[data-loadout-slot="1"]').click();assert.equal(await page.evaluate(()=>window.selected.at(-1).intent),'view-bungie-details');
  assert.equal(await page.locator('[data-loadout-slot="1"]').getAttribute('data-loadout-state'),'ready','Viewing never marks the slot equipped');
  const more=page.locator('[data-loadout-more="1"]');await more.focus();await page.keyboard.press('Enter');
  const menu=page.getByRole('menu');await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Loadout details','Equip','Edit in Build Forge','Save as PARADOX loadout','Overwrite with equipped gear','Clear slot 2']);
  const anchor=await more.locator('..').boundingBox(),box=await menu.boundingBox();
  assert.ok(Math.min(Math.abs(box.y-(anchor.y+anchor.height)),Math.abs(box.y+box.height-anchor.y))<=8);
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=900);
  assert.ok((await menu.getByRole('menuitem').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)))).every(size=>size>=14));
  await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await more.evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Equip');await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.count(),1);
  assert.deepEqual(await dialog.getByRole('button').allTextContents(),['Equip','Cancel']);
  assert.equal(await dialog.locator('.guardian-loadout-confirm-gear img').count(),8);
  for(const size of await dialog.locator('.guardian-loadout-confirm-gear img').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width)))assert.ok(Math.abs(size-slotSize)<=1);
  assert.doesNotMatch(await dialog.innerText(),/membership|123|orbit|social space|readback|authoritative|verified|Build Forge/i);
  release={};await dialog.getByRole('button',{name:'Equip',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-loadout-confirm-action]')?.disabled);
  assert.equal(await page.locator('[data-loadout-slot="1"]').getAttribute('data-loadout-state'),'ready','No green status while request is pending');
  for(let attempt=0;!release.done&&attempt<300;attempt++)await new Promise(done=>setTimeout(done,10));assert.equal(typeof release.done,'function');release.done();release=null;
  await page.waitForSelector('[data-loadout-slot="1"][data-loadout-state="equipped"]');
  assert.equal(await dialog.count(),0);assert.equal(await page.locator('[data-loadout-slot="1"]').evaluate(node=>getComputedStyle(node).outlineWidth),'2px');
  assert.equal(await page.locator('.guardian-loadout-toast [role="status"]').innerText(),`Equipped ${await page.evaluate(()=>window.fixture.names[1])}`);
  await page.waitForSelector('.guardian-loadout-toast',{state:'detached',timeout:3000});
  assert.deepEqual(requests[0],{path:'/bungie/actions/loadout/equip',body:{membershipType:3,characterId:'1',loadoutIndex:1}});
  // A fresh profile, not the previously viewed slot, owns subsequent status.
  await page.evaluate(()=>{window.FORGE_PAGE_PAYLOAD={...window.FORGE_PAGE_PAYLOAD,profile:structuredClone(window.fixture.profile)};window.publish();});
  assert.equal(await page.locator('[data-loadout-slot="0"]').getAttribute('data-loadout-state'),'equipped');
  assert.equal(await page.locator('[data-loadout-slot="1"]').getAttribute('data-loadout-state'),'ready');
  fail='generic';await more.click();await menu.getByRole('menuitem',{name:'Equip',exact:true}).click();await dialog.getByRole('button',{name:'Equip',exact:true}).click();
  await page.locator('.guardian-loadout-toast.is-error').waitFor();assert.equal(await dialog.count(),0);
  assert.equal(await page.locator('.guardian-loadout-toast [role="alert"]').innerText(),'Loadout failed');
  await page.waitForTimeout(2200);assert.equal(await page.locator('.guardian-loadout-toast.is-error').count(),1);
  await page.getByRole('button',{name:'Dismiss notification'}).click();
  fail='activity';await more.click();await menu.getByRole('menuitem',{name:'Equip',exact:true}).click();await dialog.getByRole('button',{name:'Equip',exact:true}).click();
  await page.locator('.guardian-loadout-toast.is-error').waitFor();assert.equal(await page.locator('.guardian-loadout-toast [role="alert"]').innerText(),'Must be in orbit, a social space or offline');
  await page.getByRole('button',{name:'Dismiss notification'}).click();fail='';
  await more.click();await menu.getByRole('menuitem',{name:'Overwrite with equipped gear'}).click();
  await page.locator('.guardian-loadout-toast.is-success').waitFor();assert.equal(await dialog.count(),0);assert.equal(requests.at(-1).path,'/bungie/actions/loadout/snapshot');
  await more.click();await menu.getByRole('menuitem',{name:'Clear slot 2'}).click();assert.equal(await dialog.count(),1);
  await dialog.getByRole('button',{name:'Cancel'}).click();assert.notEqual(requests.at(-1).path,'/bungie/actions/loadout/clear');
  await more.click();await menu.getByRole('menuitem',{name:'Clear slot 2'}).click();await dialog.getByRole('button',{name:'Clear slot 2'}).click();
  await page.waitForSelector('[data-loadout-slot="1"][data-loadout-state="empty"]');assert.equal(requests.at(-1).path,'/bungie/actions/loadout/clear');
  assert.deepEqual(errors,[]);console.log(`CHARACTER_LOADOUT_MENU width=${width} PASS`);await page.close();
 }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
