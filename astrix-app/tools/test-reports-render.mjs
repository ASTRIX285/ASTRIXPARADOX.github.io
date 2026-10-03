#!/usr/bin/env node
// Reports design pass (Miguel, 3 Oct 2026). Visual checks on computed styles, not class names, with the
// real Reports UI, its page CSS and the shell CSS, on reports-completed-fixture, at 390, 820 and 1600:
//   - every tile is the art and name only, a raised bevel: Raised fill, a light top and left inner edge and
//     a dark bottom and right inner edge on the frame layer, a drop shadow, and the notched clip-path;
//   - tiles in a row are the same height;
//   - after opening an activity and going back, exactly one tile and exactly one series tab carry the
//     strobe (Ember stroke with the pulse); the selected series tab has no box (shell tab style);
//   - the character select has no native look (appearance none, the shell chevron);
//   - no sideways page scroll.
// Writes screenshots of Raids, Dungeons and an activity page when REPORTS_RENDER_DIR is set (outside the repo).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runs,historyRow,pgcr} from './fixtures/reports-completed-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const boot=`import {snapshotFor} from '/astrix-app/tools/fixtures/reports-completed-fixture.mjs';
import {mountReports} from '/astrix-app/pages/reports/reports-ui.mjs';
import {slimCatalogue} from '/astrix-app/pages/reports/reports-model.mjs';
const catalogue=slimCatalogue((await (await fetch('/astrix-app/tools/fixtures/reports-catalogue-current.json')).json()).activities);
mountReports(document.querySelector('#reportsWorkspace'),snapshotFor(catalogue));window.fixtureReady=true;`;
const html=(await readFile(resolve(root,'astrix-app/pages/reports/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/reports-boot.mjs"></script></body>');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/astrix-app/pages/reports/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(path==='/reports-boot.mjs'){res.setHeader('Content-Type','text/javascript');res.end(boot);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,shots=process.env.REPORTS_RENDER_DIR||'',art=await readFile(resolve(root,'img/ax-logo-640.webp'));
  // Visual state of every tile and tab, read from computed styles.
  const read=page=>page.evaluate(()=>{
    const strobe=node=>{const after=getComputedStyle(node,'::after');return after.content!=='none'&&after.display!=='none'&&/ax-stroke-pulse/.test(after.animationName)&&/linear-gradient/.test(after.backgroundImage);};
    const insets=shadow=>[...shadow.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+0px\s+0px\s+inset/g)].map(m=>({colour:m[1],x:Number(m[2]),y:Number(m[3])}));
    const alpha=colour=>{const m=colour.match(/\/\s*([\d.]+)\)|rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);return m?Number(m[1]??m[2]):1;};
    const light=colour=>{const m=colour.match(/srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)||colour.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);if(!m)return 0;const v=[m[1],m[2],m[3]].map(Number);return Math.max(...v)>1?Math.max(...v)/255:Math.max(...v);};
    const tiles=[...document.querySelectorAll('.reports-grid .rp-tile')].map(tile=>{
      const face=tile.querySelector('.rp-tile-face'),frame=getComputedStyle(face,'::before'),edges=insets(frame.boxShadow),r=face.getBoundingClientRect();
      return {top:Math.round(r.top),height:r.height,clip:getComputedStyle(face).clipPath,shadow:getComputedStyle(tile).filter,background:getComputedStyle(face).backgroundImage,
        hi:edges.find(e=>e.x>0&&e.y>0),lo:edges.find(e=>e.x<0&&e.y<0),frameAbove:Number(frame.zIndex)>0,strobe:strobe(face),
        content:[...face.children].map(n=>n.className),text:face.innerText.trim()};
    });
    const tabs=[...document.querySelectorAll('.reports-sidebar [data-series]')].map(tab=>({pressed:tab.getAttribute('aria-pressed')==='true',strobe:strobe(tab),border:getComputedStyle(tab).borderTopWidth,clip:getComputedStyle(tab).clipPath,transform:getComputedStyle(tab).textTransform}));
    const select=document.querySelector('#reportCharacter'),sel=select&&getComputedStyle(select);
    return {tiles,tabs,select:select&&{appearance:sel.appearance,visible:select.offsetParent!==null,chevron:/linear-gradient/.test(sel.backgroundImage),clip:sel.clipPath},
      sideways:document.documentElement.scrollWidth>innerWidth+1,light:Object.fromEntries((tiles[0]?[['hi',light(tiles[0].hi?.colour||'')],['lo',light(tiles[0].lo?.colour||'')],['hiAlpha',alpha(tiles[0].hi?.colour||'')]]:[]))};
  });
  for(const width of [390,820,1600]){
    const page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='www.bungie.net')return route.fulfill({contentType:'image/webp',body:art});
      if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='history')return route.fulfill({json:{ErrorCode:1,Response:{activities:url.searchParams.get('characterId')==='1'&&url.searchParams.get('page')==='0'?runs.map(historyRow):[]}}});
      if(url.pathname==='/bungie/reports')return route.fulfill({json:{ErrorCode:1,Response:{displayProperties:{name:'Fixture'}}}});
      if(url.pathname.startsWith('/bungie/pgcr/'))return route.fulfill({json:{ErrorCode:1,Response:pgcr(url.pathname.split('/').pop())}});
      if(url.origin!==origin)return route.abort();return route.continue();
    });
    await page.goto(origin+'/astrix-app/pages/reports/');await page.waitForFunction(()=>window.fixtureReady);
    for(const series of ['raids','dungeons']){
      await page.locator(`[data-series="${series}"]`).click();
      const state=await read(page);
      assert.ok(state.tiles.length>0,`${width} ${series}: tiles`);
      for(const tile of state.tiles){
        assert.deepEqual(tile.content,['reports-art'],`${width} ${series}: the tile is the art only`);
        assert.ok(tile.hi&&tile.lo,`${width} ${series}: light top-left and dark bottom-right inner edges`);
        assert.ok(tile.frameAbove,`${width} ${series}: the bevel edges sit above the art`);
        assert.match(tile.clip,/polygon\(0px 0px, calc\(100% - 10px\) 0px, 100% 10px, 100% 100%, 0px 100%\)/,`${width} ${series}: notched top-right corner`);
        assert.match(tile.shadow,/drop-shadow/,`${width} ${series}: drop shadow under the tile`);
        assert.match(tile.background,/linear-gradient/,`${width} ${series}: Raised fill`);
      }
      assert.ok(state.light.hi>state.light.lo&&state.light.hiAlpha>=.3,`${width} ${series}: the top-left edge is visibly lighter than the bottom-right`);
      const rows=new Map();for(const tile of state.tiles){if(!rows.has(tile.top))rows.set(tile.top,[]);rows.get(tile.top).push(tile.height);}
      for(const heights of rows.values())assert.ok(Math.max(...heights)-Math.min(...heights)<=1,`${width} ${series}: tiles in a row are the same height`);
      assert.equal(state.tabs.filter(tab=>tab.strobe).length,1,`${width} ${series}: exactly one series tab carries the strobe`);
      assert.ok(state.tabs.find(tab=>tab.pressed).strobe,`${width} ${series}: the selected tab carries it`);
      assert.ok(state.tabs.every(tab=>tab.border==='0px'&&tab.clip==='none'&&tab.transform==='uppercase'),`${width} ${series}: series tabs in the shell tab style, not boxes`);
      if(width>=1200)assert.ok(state.select.visible&&state.select.appearance==='none'&&state.select.chevron,`${width}: shell select, no native look`);
      assert.equal(state.sideways,false,`${width} ${series}: no sideways scroll`);
      if(shots)await page.screenshot({path:resolve(shots,`reports-${series}-${width}.png`),fullPage:true});
    }
    // Activity page, then back: exactly one tile carries the strobe.
    await page.locator('[data-series="raids"]').click();
    await page.locator('.rp-tile-face',{hasText:'The Desert Perpetual'}).click();
    await page.waitForFunction(()=>/from checkpoint/.test(document.querySelector('.reports-detail-card')?.textContent||''));
    assert.equal(await page.evaluate(()=>/ax-stroke-pulse/.test(getComputedStyle(document.querySelector('.reports-detail-card'),'::after').animationName)),true,`${width}: the open activity panel carries the strobe`);
    if(shots)await page.screenshot({path:resolve(shots,`reports-activity-${width}.png`),fullPage:true});
    await page.locator('[data-back]').click();
    const back=await read(page);
    assert.equal(back.tiles.filter(tile=>tile.strobe).length,1,`${width}: exactly one tile carries the strobe`);
    assert.equal(back.tabs.filter(tab=>tab.strobe).length,1,`${width}: and exactly one tab`);
    assert.deepEqual(errors,[],`${width}: page errors`);
    await page.close();
  }
  console.log('REPORTS_RENDER=PASS 390, 820 and 1600 (computed styles): art-only tiles with Raised fill, light top-left and dark bottom-right inner edges above the art, drop shadow and notch; equal tile heights per row; strobe on exactly one tile and one series tab; shell tab style; shell select with no native look; no sideways scroll');
}finally{
  await browser?.close();server.close();
}
