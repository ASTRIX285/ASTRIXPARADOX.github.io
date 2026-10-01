import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const characterHtml=await readFile(resolve(root,'astrix-app/pages/guardian-workspace-v2/index.html'),'utf8');
const styles=[...characterHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)].map(match=>{
  const url=new URL(match[1].replaceAll('&amp;','&'),'https://fixture/astrix-app/pages/guardian-workspace-v2/');
  return url.host==='fixture'?`<link rel="stylesheet" href="${url.pathname+url.search}">`:'';
}).join('');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body data-apx-button-system class="forge-token-preview guardian-main-page apx-fluid-icons"><main><section class="guardian-loadouts-strip"><div id="guardianLoadouts" class="guardian-loadouts-grid"></div></section></main><script type="module" src="/fixture.mjs"></script></body></html>`;
const script=`import {loadoutDetailsFixture} from '/astrix-app/tools/fixtures/loadout-details-fixture.mjs';
window.fixture=loadoutDetailsFixture();window.FORGE_PAGE_PAYLOAD={profile:fixture.profile,definitions:fixture.definitions,manifestVersion:fixture.manifestVersion,loadoutDetailsManifest:fixture.manifest};window.FORGE_BUNGIE_SESSION=fixture.session;
await import('/astrix-app/pages/guardian-workspace-v2/guardian-loadouts.mjs');
window.publish=()=>document.dispatchEvent(new CustomEvent('forge:guardian-loadout-context',{detail:{characterId:'1',source:'bungie-live',loadoutsAvailable:true,loadouts:fixture.profile.characterLoadouts.data['1'].loadouts}}));
window.selections=[];document.addEventListener('forge:loadout-selected',event=>selections.push(event.detail));publish();window.ready=true;`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(path==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  for(const width of [390,719,720,1363,2560]){
    const fixture=loadoutDetailsFixture(),backend=structuredClone(fixture.profile),calls=[],errors=[];
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin){const response=await fetch(url);await route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'text/plain',body:Buffer.from(await response.arrayBuffer())});return;}
      if(url.hostname==='www.bungie.net'){
        await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});return;
      }
      // Saving starts the real account-sync service, including its session read.
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/session'){await route.fulfill({json:fixture.session});return;}
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/bungie/profile'){calls.push({method:'GET',path:url.pathname});await route.fulfill({json:{profile:backend}});return;}
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname.startsWith('/bungie/actions/')){
        const body=request.postDataJSON();calls.push({method:'POST',path:url.pathname,body});
        if(url.pathname.endsWith('/loadout/identifiers'))Object.assign(backend.characterLoadouts.data['1'].loadouts[0],{nameHash:body.nameHash,iconHash:body.iconHash,colorHash:body.colorHash});
        if(url.pathname.endsWith('/loadout/clear'))backend.characterLoadouts.data['1'].loadouts[0]={items:[]};
        await route.fulfill({json:{ErrorCode:1,Response:url.pathname.endsWith('/equip-items')?{equipResults:body.itemIds.map(itemInstanceId=>({itemInstanceId,equipStatus:1}))}:0}});return;
      }
      // All remote traffic is intercepted. No real account or storage requests.
      await route.fulfill({status:503,json:{error:'Offline browser fixture'}});
    });
    try{
    await page.goto(origin);await page.waitForFunction(()=>window.ready);
    const more=page.locator('[data-loadout-more="0"]');await more.click();await page.getByRole('menuitem',{name:'Loadout details',exact:true}).click();
    const dialog=page.locator('.apx-loadout-details');await dialog.waitFor();
    // Compact grid (1 Oct 2026): one row per item, no text under the icons.
    assert.equal(await dialog.locator('.apx-ld-row').count(),9);assert.equal(await dialog.locator('.apx-ld-row[data-item-kind="weapon"]').count(),3);assert.equal(await dialog.locator('.apx-ld-row[data-item-kind="armour"]').count(),5);
    assert.equal((await dialog.locator('.apx-ld-grid').innerText()).trim(),'','Names live in the tooltip, never under the icons');
    assert.equal(await page.evaluate(()=>selections.length),0,'Details never change the Character selection/build');
    assert.equal(calls.length,0,'Opening details uses only prepared data');
    const geometry=await dialog.evaluate(node=>{const rect=node.getBoundingClientRect(),scroll=node.querySelector('.apx-ld-scroll');return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,overflow:scroll.scrollHeight>scroll.clientHeight,fonts:[...node.querySelectorAll('*')].filter(el=>el.textContent.trim()).map(el=>parseFloat(getComputedStyle(el).fontSize)),filters:[...node.querySelectorAll('img')].map(img=>getComputedStyle(img).filter),horizontal:scroll.scrollWidth-scroll.clientWidth};});
    // Desktop: centred and sized to the loadout, with no scrolling. Phones: a full-screen sheet.
    const expectedWidth=width<720?width:Math.min(width-32,1120);
    assert.ok(Math.abs(geometry.width-expectedWidth)<=1,`width ${geometry.width}`);assert.ok(Math.abs(geometry.x-(width-expectedWidth)/2)<=1);
    if(width<720)assert.ok(Math.abs(geometry.height-900)<=1,'Phones get a full-screen sheet');
    else{assert.ok(geometry.height<=900-32+1,`height ${geometry.height}`);if(width>=1363)assert.equal(geometry.overflow,false,'The whole loadout fits without scrolling on desktop');}
    assert.ok(geometry.fonts.every(size=>size>=12));assert.ok(geometry.filters.every(value=>value==='none'));assert.ok(geometry.horizontal<=1);
    assert.deepEqual(await dialog.locator('.apx-ld-actions button').allTextContents(),['Equip','Prepare equip','Edit identifiers','Save to Armoury','Share','Clear slot']);
    await dialog.getByRole('button',{name:'Prepare equip',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Apply',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.apx-loadout-details').getAttribute('aria-busy')==='false');
    assert.ok(calls.every(row=>row.method==='GET'));await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await dialog.getByRole('button',{name:'Equip',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-ld-confirm-apply]')&&!document.querySelector('[data-ld-confirm-apply]').disabled);
    await dialog.getByRole('button',{name:'Confirm Apply',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.apx-ld-message').textContent.includes('Loadout applied'));
    assert.equal(calls.filter(row=>row.path==='/bungie/actions/equip-items').length,1);assert.equal(calls.filter(row=>row.path==='/bungie/actions/loadout/equip').length,0);
    await dialog.getByRole('button',{name:'Edit identifiers',exact:true}).click();
    const name=Object.keys(fixture.manifest.tables.DestinyLoadoutNameDefinition)[1],icon=Object.keys(fixture.manifest.tables.DestinyLoadoutIconDefinition)[1],color=Object.keys(fixture.manifest.tables.DestinyLoadoutColorDefinition)[1];
    await dialog.locator('select[name=nameHash]').selectOption(name);await dialog.locator(`input[name=iconHash][value="${icon}"]`).check();await dialog.locator(`input[name=colorHash][value="${color}"]`).check();await dialog.getByRole('button',{name:'Save identifiers',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.apx-ld-message').textContent==='Identifiers updated.');assert.equal(await dialog.locator('h2').innerText(),fixture.manifest.tables.DestinyLoadoutNameDefinition[name].name);
    await dialog.getByRole('button',{name:'Save to Armoury',exact:true}).click();await dialog.locator('input[name=name]').fill('Browser saved fixture');await dialog.getByRole('button',{name:'Save loadout',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.apx-ld-message').textContent==='Saved as PARADOX loadout.');
    const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Share',exact:true}).click();const download=await downloadPromise;const shared=await readFile(await download.path(),'utf8');assert.doesNotMatch(shared,/membership|itemInstanceId|csrfToken/);
    await page.waitForFunction(()=>document.querySelector('.apx-loadout-details').getAttribute('aria-busy')==='false');
    await dialog.getByRole('button',{name:'Clear slot',exact:true}).click();const before=calls.length;await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.length,before);
    await dialog.getByRole('button',{name:'Clear slot',exact:true}).click();await dialog.getByRole('button',{name:'Confirm clear slot',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.apx-ld-message').textContent==='Slot cleared.');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await more.evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(errors,[]);console.log(`LOADOUT_DETAILS_BROWSER=PASS width=${width} geometry, fonts, authentic images, all actions, Apply gate, save/share, clear cancellation, keyboard and return focus`);await page.close();
    }catch(error){
      console.error('LOADOUT_DETAILS_BROWSER_FAILURE',JSON.stringify({width,calls,errors,ui:await page.locator('.apx-loadout-details').innerText().catch(()=>''),busy:await page.locator('.apx-loadout-details').getAttribute('aria-busy').catch(()=>null)}));
      throw error;
    }
  }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
