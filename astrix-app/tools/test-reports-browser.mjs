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
import {slimCatalogue} from '/astrix-app/pages/reports/reports-model.mjs';
const image='https://www.bungie.net/img/destiny_content/pgcr/europa-raid-deep-stone-crypt.jpg';
const snapshot=structuredClone(fixture);
if(new URL(location.href).searchParams.has('real')){
 const catalogue=await (await fetch('/astrix-app/tools/fixtures/reports-catalogue-current.json')).json();
 snapshot.catalogue=slimCatalogue(catalogue.activities);
}else snapshot.catalogue.forEach(row=>row.image=image);
await Promise.all([...new Set(snapshot.catalogue.map(row=>row.image).filter(Boolean))].map(src=>new Promise(resolve=>{const art=new Image();art.onload=art.onerror=resolve;art.src=src;})));
window.fixtureCatalogue=snapshot.catalogue;
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
  // Prompt 20c allows only single-line ellipsis with a full-name tooltip.
  const measurements=await page.locator('.reports-card:visible').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,radius:getComputedStyle(node).borderRadius,overflow:[...node.querySelectorAll('*')].some(child=>(child.scrollWidth>child.clientWidth+1&&!(child.matches('.reports-band-label')&&getComputedStyle(child).textOverflow==='ellipsis'&&child.title===child.textContent))||child.scrollHeight>child.clientHeight+1)})));
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
   // Prompt 20a-fix2: a missing series fixture must fail rather than time out.
   assert.ok(await page.locator('.reports-card:visible').count()>0,`${series} shows at least one card`);
   for(const cardWidth of [220,320]){
    await page.locator('.reports-grid:visible').evaluate(async(node,width)=>{node.style.setProperty('--reports-card-width',`${width}px`);await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));},cardWidth);
    const cells=await page.locator('.reports-card:visible .reports-band span').evaluateAll(nodes=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);return {text:node.textContent,lines:new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size,overflow:(node.scrollWidth>node.clientWidth+1&&!(node.matches('.reports-band-label')&&getComputedStyle(node).textOverflow==='ellipsis'&&node.title===node.textContent))};}));
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
 // Prompt 20a-fix2: render the real checked-in catalogue at all required widths.
 for(const width of [1363,1920,2560]){
  const page=await browser.newPage({viewport:{width,height:1080}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/astrix-app/pages/reports/'){await route.fulfill({contentType:'text/html',body:html});return;}
   if(url.hostname==='www.bungie.net'){await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});return;}
   if(url.origin!==origin){await route.abort();return;}await route.continue();
  });
  await page.goto(origin+'/astrix-app/pages/reports/?real=1');await page.waitForFunction(()=>window.fixtureReady);
  await page.waitForLoadState('networkidle');
  const first=await page.locator('.reports-card:visible h2').first().innerText();
  assert.ok(await page.evaluate(name=>{
   const raids=window.fixtureCatalogue.filter(row=>row.series==='raids');
   const chosen=raids.find(row=>row.name===name),desert=raids.find(row=>row.name==='The Desert Perpetual');
   return !!chosen&&!!desert&&(chosen.releaseOrder===null||chosen.releaseOrder>=desert.releaseOrder);
  },first),'First Raids card is The Desert Perpetual or newer');
  assert.equal(await page.locator('.reports-card:visible').filter({has:page.locator('h2',{hasText:/^The Pantheon$/})}).count(),1);
  assert.equal(await page.locator('.reports-card:visible h2').filter({hasText:/Pantheon/}).count(),1);
  assert.equal(await page.locator('.reports-card:visible h2').filter({hasText:/The Desert Perpetual/}).count(),1);
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.evaluate(()=>{window.realImages=new Set(document.querySelectorAll('#reportsWorkspace img'));window.realNewImages=0;window.realObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)for(const img of [...(node.matches('img')?[node]:[]),...node.querySelectorAll('img')])if(!window.realImages.has(img))window.realNewImages++;});window.realObserver.observe(document.querySelector('#reportsWorkspace'),{childList:true,subtree:true});});
  for(const series of ['raids','dungeons','vanguard','conquests','lost-sectors','exotic','story']){
   await page.locator(`[data-series="${series}"]`).click();
   assert.ok(await page.locator('.reports-card:visible').count()>0,`Real ${series} shows at least one card`);
   const labels=await page.locator('.reports-card:visible').evaluateAll(cards=>cards.map(card=>[...card.querySelectorAll('.reports-band-row>span:first-child')].map(cell=>cell.textContent)));
   // Prompt 20c strengthens the label assertion for entirely unlabelled activities.
   for(const rows of labels)assert.ok(!rows.includes('-'),'Every activity has a difficulty label');
   for(const cardWidth of [220,320]){
    await page.locator('.reports-grid:visible').evaluate(async(grid,value)=>{grid.style.setProperty('--reports-card-width',`${value}px`);await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));},cardWidth);
    const measures=await page.locator('.reports-card:visible').evaluateAll(cards=>cards.map(card=>({width:card.getBoundingClientRect().width,radius:getComputedStyle(card).borderRadius,overflow:[...card.querySelectorAll('*')].some(node=>(node.scrollWidth>node.clientWidth+1&&!(node.matches('.reports-band-label')&&getComputedStyle(node).textOverflow==='ellipsis'&&node.title===node.textContent))||node.scrollHeight>node.clientHeight+1)})));
    for(const card of measures){assert.equal(card.width,cardWidth);assert.equal(card.radius,'8px');assert.equal(card.overflow,false,JSON.stringify(card));}
    const cells=await page.locator('.reports-card:visible .reports-band span').evaluateAll(nodes=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);return {text:node.textContent,lines:new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size,overflow:(node.scrollWidth>node.clientWidth+1&&!(node.matches('.reports-band-label')&&getComputedStyle(node).textOverflow==='ellipsis'&&node.title===node.textContent))};}));
    for(const cell of cells){assert.ok(cell.lines<=1,JSON.stringify(cell));assert.equal(cell.overflow,false,JSON.stringify(cell));}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
  }
  await page.locator('[data-series="raids"]').click();
  // Prompt 20c: every expanded row is one line; controls reuse prepared DOM/art.
  const pantheon=page.locator('.reports-card:visible').filter({has:page.getByRole('heading',{name:'The Pantheon',exact:true})});
  assert.equal(await pantheon.locator('.reports-band-row:visible').count(),5);
  await pantheon.getByRole('button',{name:'Show all (14)',exact:true}).click();
  assert.equal(await pantheon.locator('.reports-band-row:visible').count(),14);
  assert.equal(await page.locator('[data-back]:visible').count(),0);
  const rowLines=await pantheon.locator('.reports-band-row:visible').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.getBoundingClientRect().top)));
  for(const tops of rowLines)assert.ok(tops.every(top=>Math.abs(top-tops[0])<=1));
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const packed=await page.locator('.reports-grid:visible .reports-card').evaluateAll(cards=>cards.map(card=>{const r=card.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom};}));
  for(const card of packed){const previous=packed.filter(other=>Math.abs(other.x-card.x)<1&&other.y<card.y).sort((a,b)=>b.y-a.y)[0];if(previous)assert.ok(Math.abs(card.y-previous.bottom-12)<=1,'No empty row space beside expanded cards');}
  await pantheon.getByRole('button',{name:'Show less',exact:true}).click();
  assert.equal(await pantheon.locator('.reports-band-row:visible').count(),5);
  await page.waitForLoadState('networkidle');assert.deepEqual(requests,[],'Expand/collapse makes zero requests');
  await page.locator('[data-series="exotic"]').click();
  const exoticNames=await page.locator('.reports-card:visible h2').allTextContents();
  assert.equal(exoticNames[0],'Oblation');
  assert.equal(await page.evaluate(()=>{const rows=window.fixtureCatalogue.filter(row=>row.series==='exotic');return rows.every((row,i)=>!i||(rows[i-1].releaseOrder??Infinity)>=(row.releaseOrder??Infinity));}),true);
  for(const name of ['Oblation',"Kell's Fall",'Encore']){
   assert.equal(exoticNames.filter(value=>value===name).length,1);
   assert.ok(!exoticNames.some(value=>value.startsWith(`${name}: `)));
   const card=page.locator('.reports-card:visible').filter({has:page.getByRole('heading',{name,exact:true})});
   const rows=await card.locator('.reports-band-label').allTextContents();
   if(name==="Kell's Fall")assert.ok(rows.includes('Diffraction · Expert'));
   if(name==='Encore')assert.ok(rows.includes('Coda · Standard'));
   await card.locator('.reports-open').click();
   assert.deepEqual(await page.locator('.reports-detail:visible tbody th').allTextContents(),rows);
   await page.locator('[data-back]:visible').click();
  }
  await page.locator('[data-series="raids"]').click();
  for(const name of ['The Pantheon','The Desert Perpetual']){
   const card=page.locator('.reports-card:visible').filter({has:page.getByRole('heading',{name,exact:true})});
   const labels=await card.locator('.reports-band-row>span:first-child').allTextContents();
   if(name==='The Pantheon')assert.equal(labels.length,14);
   if(name==='The Desert Perpetual')assert.ok(labels.includes('Epic'));
   await card.click();
   assert.deepEqual(await page.locator('.reports-detail:visible tbody th').allTextContents(),labels,'Detail preserves every grouped row');
   await page.locator('[data-back]:visible').click();
  }
  await page.waitForLoadState('networkidle');assert.deepEqual(requests,[],'Real catalogue switches and activity opens make zero requests');
  assert.equal(await page.evaluate(()=>window.realNewImages),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${screenshots}/reports-real-${width}-grid.png`,fullPage:true});
  console.log(`REPORTS_REAL_BROWSER width=${width} first=${first} requests=0`);await page.close();
 }

}finally{await browser?.close();await new Promise(done=>server.close(done));}
