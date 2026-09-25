import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
// Prompt 20a-fix: normalize the root before enforcing the existing containment boundary.
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=`import {fixture} from '/astrix-app/tools/fixtures/reports-fixture.mjs';
import {mountReports} from '/astrix-app/pages/reports/reports-ui.mjs';
const image='https://www.bungie.net/img/destiny_content/pgcr/europa-raid-deep-stone-crypt.jpg';
const snapshot=structuredClone(fixture);
snapshot.catalogue.forEach(row=>row.image=image);
const art=new Image();const ready=new Promise(resolve=>{art.onload=art.onerror=resolve;});art.src=image;await ready;
mountReports(document.querySelector('#reportsWorkspace'),snapshot);window.fixtureReady=true;`;
const html=(await readFile(resolve(root,'astrix-app/pages/reports/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/reports-fixture.mjs"></script></body>');
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(path==='/reports-fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 // Resolve the page's relative resources at its real route.
 const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=3600');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 for(const path of ['/astrix-app/pages/reports/reports-ui.mjs','/astrix-app/pages/reports/reports.css'])assert.equal((await fetch(origin+path)).status,200,'Fixture server must serve Reports resources');
 console.log('REPORTS_BROWSER_SERVER=PASS');
 try{browser=await chromium.launch({channel:'chromium',headless:true});}catch(error){if(/Executable doesn't exist/.test(error.message))console.error('NOT RUN: Chromium missing');throw error;}
 const screenshots=process.env.REPORTS_SCREENSHOT_DIR||'/tmp/astrix-reports-screenshots';await mkdir(screenshots,{recursive:true});
 for(const width of [1363,1920,2560]){
  const page=await browser.newPage({viewport:{width,height:1080}});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/astrix-app/pages/reports/'){await route.fulfill({contentType:'text/html',body:html});return;}
   if(url.hostname==='www.bungie.net'){await route.fulfill({contentType:'image/png',headers:{'Cache-Control':'public, max-age=3600'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});return;}
   if(url.origin!==origin){await route.abort();return;}await route.continue();
  });
  await page.goto(origin+'/astrix-app/pages/reports/');await page.waitForFunction(()=>window.fixtureReady);
  await page.waitForLoadState('networkidle');
  const measurements=await page.locator('.reports-card:visible').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,radius:getComputedStyle(node).borderRadius,overflow:[...node.querySelectorAll('*')].some(child=>child.scrollWidth>child.clientWidth+1||child.scrollHeight>child.clientHeight+1)})));
  assert.ok(measurements.length>0);
  for(const card of measurements){assert.ok(card.width>=220&&card.width<=320,JSON.stringify(card));assert.equal(card.radius,'8px');assert.equal(card.overflow,false);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Prompt 20a-fix: detect new image nodes as well as requests, including cached images.
  await page.evaluate(()=>{window.initialImages=new Set(document.querySelectorAll('#reportsWorkspace img'));window.newImages=0;window.imageObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)for(const img of [...(node.matches('img')?[node]:[]),...node.querySelectorAll('img')])if(!window.initialImages.has(img))window.newImages++;});window.imageObserver.observe(document.querySelector('#reportsWorkspace'),{childList:true,subtree:true});});
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.locator('[data-series="dungeons"]').click();await page.locator('[data-series="vanguard"]').click();await page.locator('[data-series="raids"]').click();
  await page.locator('[data-activity]:visible').first().click();await page.locator('[data-back]:visible').waitFor();
  await page.waitForLoadState('networkidle');assert.deepEqual(requests,[],'Series switches and activity opening make zero requests');
  assert.equal(await page.evaluate(()=>window.newImages),0,'Opening views creates no new image elements');
  assert.deepEqual(errors,[]);await page.screenshot({path:`${screenshots}/reports-${width}-detail.png`,fullPage:true});
  await page.locator('[data-back]:visible').click();await page.screenshot({path:`${screenshots}/reports-${width}-grid.png`,fullPage:true});
  // Prompt 20a-fix: every series, both limiting card widths, and every band text line.
  for(const series of ['raids','dungeons','vanguard','conquests','lost-sectors','exotic','story']){
   await page.locator(`[data-series="${series}"]`).click();
   for(const cardWidth of [220,320]){
    await page.locator('.reports-grid:visible').evaluate((node,width)=>node.style.setProperty('--reports-card-width',`${width}px`),cardWidth);
    const cells=await page.locator('.reports-card:visible .reports-band span').evaluateAll(nodes=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);return {text:node.textContent,lines:new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size,overflow:node.scrollWidth>node.clientWidth+1};}));
    for(const cell of cells){assert.ok(cell.lines<=1,JSON.stringify(cell));assert.equal(cell.overflow,false,JSON.stringify(cell));}
   }
   const buttons=page.locator('[data-activity]:visible');
   for(let index=0;index<await buttons.count();index++){
    await buttons.nth(index).click();await page.locator('[data-back]:visible').click();
    await buttons.nth(index).click();await page.locator('#reportCharacter').selectOption('1');await page.locator('[data-back]:visible').click();await page.locator('#reportCharacter').selectOption('all');
   }
  }
  await page.waitForLoadState('networkidle');assert.deepEqual(requests,[],'Series switches and activity opening make zero requests');
  assert.equal(await page.evaluate(()=>window.newImages),0,'Opening views creates no new image elements');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log(`REPORTS_BROWSER width=${width} cards=${measurements.map(row=>row.width).join(',')} radius=8 requests=0`);await page.close();
 }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
