#!/usr/bin/env node
// The AX logo in the tool shell (restored 3 Oct 2026), real pages with the Warlock fixture.
// At 390 and 820: the header bar shows the AX logo beside ASTRIX; the drawer head shows the logo,
// ASTRIX (red X) over PARADOX, and the close button stays inside the drawer. No sideways scroll.
// At 1200, 1440 and 1600 the logo also shows beside ASTRIX (CLAUDE.md: every header, desktop and phone) and does
// not overlap the Guardian cards.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=await warlockInventoryFixture(root);
const PAGES=[['Character','/astrix-app/pages/guardian-workspace-v2/'],['Storage','/astrix-app/pages/vault/'],['Journey','/astrix-app/pages/journey/']];
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  for(const [name,path] of PAGES)for(const width of [390,820,1200,1440,1600]){
    const context=await browser.newContext({viewport:{width,height:width<600?844:width<1200?1180:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await routeWarlockFixture(page,{origin,fixture,art});
    await page.goto(origin+path);
    await page.waitForFunction(()=>document.querySelector('header.apx-destination-header .apx-destination-brand[data-ax-brand] img')?.complete,null,{timeout:30000});
    const header=await page.evaluate(()=>{
      const img=document.querySelector('header.apx-destination-header .apx-destination-brand img'),r=img.getBoundingClientRect();
      const cards=document.querySelector('header.apx-destination-header [data-forge-hero-cards]')?.getBoundingClientRect(),brand=document.querySelector('header.apx-destination-header .apx-destination-brand').getBoundingClientRect();
      return {src:new URL(img.src).pathname,width:r.width,height:r.height,loaded:img.naturalWidth>0,sideways:document.documentElement.scrollWidth>innerWidth,clear:!cards||!cards.width||brand.right<=cards.left+1||brand.bottom<=cards.top+1||cards.bottom<=brand.top+1};
    });
    assert.equal(header.src,'/img/ax-logo-160.webp',`${name} ${width}: the AX logo file`);
    assert.equal(header.sideways,false,`${name} ${width}: no sideways scroll`);
    if(width<1200){
      assert.ok(header.loaded&&header.height===32&&header.width>30,`${name} ${width}: the AX logo shows in the header bar`);
      await page.evaluate(()=>document.querySelector('.ax-menu-btn').click());
      await page.waitForFunction(()=>document.querySelector('.ax-drawer.is-open'));
      await page.waitForTimeout(400);
      const drawer=await page.evaluate(()=>{
        const img=document.querySelector('.ax-drawer-brand img'),panel=document.querySelector('.ax-drawer-panel').getBoundingClientRect(),close=document.querySelector('.ax-drawer-close').getBoundingClientRect(),x=document.querySelector('.ax-drawer-brand .ax-wordmark-top b');
        const r=img?.getBoundingClientRect();
        return {img:img?{src:new URL(img.src).pathname,width:r.width,height:r.height,loaded:img.naturalWidth>0,alt:img.alt}:null,closeInside:close.right<=panel.right+.5&&close.left>=panel.left,x:getComputedStyle(x).color,sub:document.querySelector('.ax-drawer-brand .ax-wordmark-sub')?.textContent};
      });
      assert.ok(drawer.img,`${name} ${width}: the drawer has the AX logo`);
      assert.equal(drawer.img.src,'/img/ax-logo-160.webp');
      assert.ok(drawer.img.loaded&&drawer.img.height===32,`${name} ${width}: the drawer logo loads at 32px`);
      assert.equal(drawer.img.alt,'','The logo is decorative; the link keeps its ASTRIX PARADOX home label');
      assert.ok(drawer.closeInside,`${name} ${width}: the close button stays inside the drawer`);
      assert.equal(drawer.x,'rgb(255, 46, 46)',`${name} ${width}: the red X in the drawer wordmark`);
      assert.equal(drawer.sub,'PARADOX');
    }else{
      assert.ok(header.loaded&&header.height>=32&&header.width>30,`${name} ${width}: the AX logo shows in the desktop header`);
      assert.ok(header.clear,`${name} ${width}: the logo and wordmark do not overlap the Guardian cards`);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('SHELL_LOGO_MARK=PASS Character, Storage and Journey: AX logo in the phone and tablet header bar and in the drawer (red X, close button inside); desktop header logo at 1200, 1440 and 1600 without overlapping the Guardian cards');
}finally{await browser?.close();server.close();}
