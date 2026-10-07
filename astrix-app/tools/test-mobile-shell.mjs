#!/usr/bin/env node
// Tool shell on phone, tablet and desktop (astrix-destination-ribbon.js + astrix-tool-shell.css).
// Page scripts are stripped; three fixture Guardians and a fixture session stand in for Bungie.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    let data=await readFile(file);
    if(file.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
const ACCOUNT='3:4611686018000000001';
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function open(width,{refresh='none'}={}){
    const page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(`${origin}/astrix-app/pages/journey/`,{waitUntil:'domcontentloaded'});
    await page.evaluate(async({refresh})=>{
      window.FORGE_BUNGIE_SESSION={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'4611686018000000001'}};
      if(refresh==='registered')window.FORGE_REFRESH=()=>new Promise(done=>setTimeout(()=>{window.refreshed=(window.refreshed||0)+1;done();},300));
      if(refresh==='button'){const button=document.createElement('button');button.className='apx-data-refresh';button.textContent='Refresh';button.addEventListener('click',()=>{window.proxied=(window.proxied||0)+1;button.setAttribute('aria-busy','true');setTimeout(()=>button.setAttribute('aria-busy','false'),300);});document.querySelector('header').append(button);}
      // Journey imports the Bungie auth module, which builds the header control. Scripts are stripped
      // here, so load it directly (it used to arrive only as a side effect of the ribbon warming Reports).
      await import('/astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs');
      const {renderGuardianCharacterCards}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-character-cards.mjs');
      // The auth import publishes an offline session; restore the fixture account.
      await new Promise(done=>setTimeout(done,50));
      window.FORGE_BUNGIE_SESSION={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'4611686018000000001'}};
      renderGuardianCharacterCards(['Hunter','Warlock','Titan'].map((characterClass,i)=>({characterId:String(i+1),characterClass,power:550,emblem:{background:''},stats:[]})),'2');
      await new Promise((done,fail)=>{const s=document.createElement('script');s.src='/astrix-app/shared/astrix-destination-ribbon.js';s.onload=done;s.onerror=fail;document.head.append(s);});
    },{refresh});
    await page.waitForTimeout(200);
    return {page,errors};
  }
  const visibleCards=page=>page.evaluate(()=>[...document.querySelectorAll('#guardianCharacterCards .guardian-character-card')].filter(card=>card.getBoundingClientRect().height>0).map(card=>card.dataset.characterId));

  for(const width of [390,820]){
    const {page,errors}=await open(width);
    // Header: menu and refresh icons; no tab block; only the active Guardian.
    assert.equal(await page.locator('.ax-menu-btn').isVisible(),true,`${width}: menu icon`);
    assert.equal(await page.locator('.ax-refresh-btn').isVisible(),true,`${width}: refresh icon`);
    assert.equal(await page.locator('.apx-destination-ribbon').isVisible(),false,`${width}: no tab block`);
    assert.deepEqual(await visibleCards(page),['2'],`${width}: only the active Guardian`);
    // Drawer from the left: opens, traps focus, closes on Escape and returns focus.
    await page.click('.ax-menu-btn');await page.waitForTimeout(350);
    assert.equal(await page.locator('.ax-menu-btn').getAttribute('aria-expanded'),'true');
    const panel=await page.locator('.ax-drawer-panel').boundingBox();
    assert.equal(Math.round(panel.x),0,'The drawer sits on the left edge');assert.equal(Math.round(panel.height),width<600?844:1180,'Full height');
    assert.equal(await page.locator('.ax-drawer-links a').count(),8,'All 8 tools');
    assert.equal(await page.locator('.ax-drawer-links a[aria-current="page"]').innerText(),'JOURNEY');
    assert.equal(await page.evaluate(()=>document.activeElement.closest('.ax-drawer')!==null),true,'Focus moves into the drawer');
    for(let i=0;i<12;i++)await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.closest('.ax-drawer')!==null),true,'Focus stays trapped');
    await page.keyboard.press('Escape');await page.waitForTimeout(100);
    assert.equal(await page.locator('.ax-drawer').isHidden(),true,'Escape closes');
    assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('ax-menu-btn')),true,'Focus returns to the menu icon');
    await page.click('.ax-menu-btn');await page.waitForTimeout(350);
    await page.mouse.click(width-10,400);await page.waitForTimeout(100);
    assert.equal(await page.locator('.ax-drawer').isHidden(),true,'An outside tap closes');
    await page.click('.ax-menu-btn');await page.waitForTimeout(350);
    await page.evaluate(()=>document.querySelectorAll('.ax-drawer-links a').forEach(a=>a.addEventListener('click',event=>event.preventDefault())));
    await page.click('.ax-drawer-links a >> nth=2');await page.waitForTimeout(100);
    assert.equal(await page.locator('.ax-drawer').isHidden(),true,'A link tap closes');
    // Tapping the active card lists the other two; picking one selects it and collapses.
    const selected=[];await page.exposeFunction('noteSelected',id=>selected.push(id));
    await page.evaluate(()=>document.addEventListener('forge:character-selected',event=>window.noteSelected(event.detail.characterId)));
    await page.click('.guardian-character-card.is-selected');
    assert.deepEqual((await visibleCards(page)).sort(),['1','2','3'],'Tapping the active card lists all three');
    assert.equal(selected.length,0,'Expanding never reselects');
    await page.evaluate(()=>{window.FORGE_BUNGIE_SESSION={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'4611686018000000001'}};});
    await page.click('.guardian-character-card[data-character-id="3"]');await page.waitForTimeout(100);
    assert.deepEqual(selected,['3'],'Picking a Guardian fires forge:character-selected');
    assert.deepEqual(await visibleCards(page),['3'],'The list collapses to the new active Guardian');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),`astrix:last-guardian:v1:${ACCOUNT}`),'3','The choice is remembered per account');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no sideways scroll`);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  for(const width of [390,820]){
    // Signed in (emblem), signed out and Bungie offline (status pill): logo, refresh icon,
    // Bungie control and menu icon never overlap.
    const {page,errors}=await open(width);
    for(const [state,text] of [['signed-in',''],['signed-out','CONNECT BUNGIE'],['offline','Bungie is not responding. Retry']]){
      const boxes=await page.evaluate(({state,text})=>{
        const wrap=document.getElementById('bungieAuthControl'),button=document.getElementById('bungieAuthButton'),visual=document.getElementById('bungieAccountVisual');
        wrap.hidden=false;button.hidden=state==='signed-in';visual.hidden=state!=='signed-in';
        button.dataset.state=state==='signed-out'?'disconnected':'unknown';button.textContent=text;
        const box=el=>{const b=el?.getBoundingClientRect();return b&&b.width&&b.height?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null;};
        return {logo:box(document.querySelector('header .apx-destination-brand')),refresh:box(document.querySelector('.ax-refresh-btn')),bungie:box(state==='signed-in'?visual:button),menu:box(document.querySelector('.ax-menu-btn'))};
      },{state,text});
      for(const [name,b] of Object.entries(boxes))assert.ok(b,`${width} ${state}: ${name} is visible`);
      const names=Object.keys(boxes);
      for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
        const a=boxes[names[i]],b=boxes[names[j]];
        assert.ok(!(a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5),`${width} ${state}: ${names[i]} overlaps ${names[j]}`);
      }
      for(const [name,b] of Object.entries(boxes))assert.ok(b.left>=0&&b.right<=width,`${width} ${state}: ${name} stays on screen`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no sideways scroll with the status pill`);
    assert.deepEqual(errors,[]);await page.close();
  }
  {
    // Desktop keeps the ribbon and all three cards; the refresh icon is present, the menu is not.
    const {page,errors}=await open(1600);
    assert.equal(await page.locator('.ax-menu-btn').isVisible(),false);
    assert.equal(await page.locator('.ax-refresh-btn').isVisible(),true);
    assert.equal(await page.locator('.apx-destination-ribbon a:visible').count(),8);
    assert.deepEqual((await visibleCards(page)).sort(),['1','2','3']);
    assert.deepEqual(errors,[]);await page.close();
  }
  for(const mode of ['registered','button']){
    // The icon runs the page's own refresh, shows busy while it runs and is disabled meanwhile.
    const {page}=await open(390,{refresh:mode});
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.apx-data-refresh')].some(button=>button.getBoundingClientRect().width>0)),false,'No text Refresh button shows');
    await page.click('.ax-refresh-btn');
    assert.equal(await page.locator('.ax-refresh-btn').getAttribute('aria-busy'),'true',`${mode}: busy while refreshing`);
    assert.equal(await page.locator('.ax-refresh-btn').isDisabled(),true,`${mode}: disabled while busy`);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.ax-refresh-btn').getAttribute('aria-busy'),'false',`${mode}: idle again`);
    assert.equal(await page.evaluate(mode=>mode==='registered'?window.refreshed:window.proxied,mode),1,`${mode}: the page refresh ran once`);
    await page.close();
  }
  console.log('MOBILE_SHELL=PASS 390 and 820: header icons with no overlap signed in, signed out and offline, left drawer with focus trap and closing, single Guardian card with list and memory; 1600: ribbon and three cards; refresh icon runs the page refresh');
}finally{await browser?.close();server.close();}
