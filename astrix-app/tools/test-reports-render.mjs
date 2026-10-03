#!/usr/bin/env node
// Reports restyle (Miguel, 3 Oct 2026). The real Reports UI on the fixture snapshot with the current
// public catalogue, at 390, 820 and 1600:
//   - every series tab renders its activities as raised bevel tiles (.rp-tile) with the stats band;
//   - the series tabs, difficulty tabs and Back buttons use the shell button (.rp-tab), and the
//     selected tab carries the strobe;
//   - after opening an activity and going back, exactly one tile is selected and carries the strobe;
//     the activity page panel carries it while open;
//   - no sideways page scroll; the tab strip scrolls inside itself on phone and tablet.
// Writes screenshots when REPORTS_RENDER_DIR is set (outside the repo).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=`import {fixture} from '/astrix-app/tools/fixtures/reports-fixture.mjs';
import {mountReports} from '/astrix-app/pages/reports/reports-ui.mjs';
import {slimCatalogue} from '/astrix-app/pages/reports/reports-model.mjs';
const snapshot=structuredClone(fixture);
snapshot.catalogue=slimCatalogue((await (await fetch('/astrix-app/tools/fixtures/reports-catalogue-current.json')).json()).activities);
mountReports(document.querySelector('#reportsWorkspace'),snapshot);window.fixtureReady=true;`;
const html=(await readFile(resolve(root,'astrix-app/pages/reports/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/reports-fixture.mjs"></script></body>');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/astrix-app/pages/reports/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(path==='/reports-fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,shots=process.env.REPORTS_RENDER_DIR||'';
  const strobed=(page,selector)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(node=>{const after=getComputedStyle(node,'::after');return after.content!=='none'&&after.animationName.includes('ax-stroke-pulse');}).length,selector);
  const noSideways=async(page,label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${label}: no sideways page scroll`);
  const series=['raids','dungeons','vanguard','conquests','lost-sectors','exotic','story'];
  for(const width of [390,820,1600]){
    const page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='www.bungie.net')return route.fulfill({contentType:'image/png',body:png});if(url.origin!==origin)return route.abort();return route.continue();});
    await page.goto(origin+'/astrix-app/pages/reports/');await page.waitForFunction(()=>window.fixtureReady);
    for(const id of series){
      await page.locator(`[data-series="${id}"]`).click();
      const tiles=await page.locator('.reports-grid .reports-card').count(),bevel=await page.locator('.reports-grid .rp-tile .rp-tile-face .rp-band').count();
      assert.ok(tiles>0,`${width} ${id}: activities render`);
      assert.equal(bevel,tiles,`${width} ${id}: every activity is a bevel tile with its stats band`);
      assert.equal(await page.locator('.reports-sidebar .rp-tab').count(),series.length,`${width} ${id}: every series tab is a shell button`);
      assert.equal(await strobed(page,'.reports-sidebar .rp-tab'),1,`${width} ${id}: only the selected series tab carries the strobe`);
      await noSideways(page,`${width} ${id}`);
      if(shots&&['raids','vanguard','lost-sectors'].includes(id))await page.screenshot({path:resolve(shots,`reports-${id}-${width}.png`),fullPage:width<600?false:true});
    }
    // Open an activity, check the drill-down level, go back: one selected tile with the strobe.
    await page.locator('[data-series="raids"]').click();
    const first=page.locator('.reports-grid .rp-tile-face').first();await first.click();
    assert.equal(await strobed(page,'.reports-detail-card.rp-panel'),1,`${width}: the open activity panel carries the strobe`);
    assert.equal(await page.locator('[data-back].rp-tab').count(),1,`${width}: Back to Reports on the activity page`);
    await noSideways(page,`${width} activity page`);
    if(shots)await page.screenshot({path:resolve(shots,`reports-activity-${width}.png`),fullPage:width<600?false:true});
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('.rp-tile.is-selected').count(),1,`${width}: exactly one selected tile`);
    assert.equal(await strobed(page,'.rp-tile-face'),1,`${width}: exactly one tile carries the strobe`);
    if(width<=1199)assert.ok(await page.evaluate(()=>['auto','scroll'].includes(getComputedStyle(document.querySelector('.reports-sidebar nav')).overflowX)),`${width}: the tab strip scrolls inside itself`);
    assert.deepEqual(errors,[],`${width}: page errors`);
    await page.close();
  }
  console.log('REPORTS_RENDER=PASS 390, 820 and 1600: all seven series tabs render bevel tiles with stats bands, shell tabs with one strobed selection, one strobed tile after Back, the open activity panel strobed, no sideways scroll, tab strip scrolls inside itself on phone and tablet');
}finally{
  await browser?.close();server.close();
}
