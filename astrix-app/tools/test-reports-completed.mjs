#!/usr/bin/env node
// Reports, completed only and full-clear Fastest (Miguel, 3 Oct 2026). Real Reports UI on the current
// public catalogue with reports-completed-fixture (character 1 has clears; 2 and 3 have none):
//   - tiles only for activities with a clear, art only (no numbers on the tile); series tabs only for
//     series with a clear; "No completed raids yet" when the selection has none;
//   - no history or PGCR request until a completed activity is opened; PGCRs only for clears; a deep
//     link to a never-completed activity makes no history request;
//   - Fastest is the full clear (40:00), not the checkpoint clear (02:55), which stays in Clears, marked;
//     "(any start)" while Bungie has not said how a clear started;
//   - Pantheon bosses are an Encounters list on the activity page; Normal and Standard are one "Standard".
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
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function open(query='',{holdPgcr=false}={}){
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests={history:[],pgcr:[],other:[]};let release;const gate=new Promise(done=>{release=done;});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='www.bungie.net')return route.fulfill({contentType:'image/png',body:png});
      if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='history'){
        requests.history.push(url.searchParams.get('characterId')+':'+url.searchParams.get('page'));
        const rows=url.searchParams.get('characterId')==='1'&&url.searchParams.get('page')==='0'?runs.map(historyRow):[];
        return route.fulfill({json:{ErrorCode:1,Response:{activities:rows}}});
      }
      if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='definition')return route.fulfill({json:{ErrorCode:1,Response:{displayProperties:{name:'Fixture'}}}});
      if(url.pathname.startsWith('/bungie/pgcr/')){const id=url.pathname.split('/').pop();requests.pgcr.push(id);if(holdPgcr)await gate;return route.fulfill({json:{ErrorCode:1,Response:pgcr(id)}});}
      if(url.origin!==origin){requests.other.push(url.href);return route.abort();}
      return route.continue();
    });
    await page.goto(origin+'/astrix-app/pages/reports/'+query);await page.waitForFunction(()=>window.fixtureReady);
    return {page,errors,requests,release};
  }
  const names=page=>page.locator('.reports-grid .rp-tile h2').allInnerTexts();
  // Grid: completed only, art only.
  {
    const {page,errors,requests}=await open();
    assert.deepEqual(await names(page),['The Desert Perpetual',"Salvation's Edge",'The Pantheon'],'Raids: only activities with a clear');
    assert.equal(await page.locator('.rp-tile .rp-band,.rp-tile table,.rp-tile dl').count(),0,'The tile is the art only');
    assert.deepEqual(await page.locator('.reports-sidebar [data-series]').evaluateAll(n=>n.map(b=>b.dataset.series)),['raids','dungeons'],'Series tabs only with a clear');
    await page.locator('[data-series="dungeons"]').click();
    assert.deepEqual(await names(page),["Warlord's Ruin"],'Dungeons: Vesper\'s Host was entered but never cleared, so it has no tile');
    await page.selectOption('#reportCharacter','2');
    assert.equal(await page.locator('.reports-grid').count(),0,'No tiles for a character with no clears');
    assert.equal(await page.locator('.reports-empty').innerText(),'No completed dungeons yet');
    assert.equal(await page.locator('.reports-sidebar [data-series]').count(),0,'Every series tab with no clears is hidden for this character');
    assert.deepEqual([requests.history.length,requests.pgcr.length],[0,0],'Nothing crawled for the grid');
    assert.deepEqual(errors,[]);await page.close();
  }
  // Activity page: full-clear Fastest, checkpoint marked, PGCRs only for clears.
  {
    const {page,errors,requests,release}=await open('',{holdPgcr:true});
    await page.locator('.rp-tile-face',{hasText:'The Desert Perpetual'}).click();
    await page.waitForFunction(()=>/any start/.test(document.querySelector('.reports-detail-card')?.textContent||''));
    assert.match(await page.locator('.reports-detail-card').innerText(),/02:55 \(any start\)/,'Before the PGCRs say how clears started, Fastest says any start');
    release();
    await page.waitForFunction(()=>/from checkpoint/.test(document.querySelector('.reports-detail-card')?.textContent||''));
    const card=await page.locator('.reports-detail-card table').first().innerText();
    assert.match(card,/Standard\s+2 \(1 from checkpoint\)\s+40:00/,'Fastest is the full clear; the checkpoint clear stays in Clears, marked');
    assert.doesNotMatch(card,/02:55|any start/);
    assert.deepEqual([...new Set(requests.pgcr)].sort(),['9000000001','9000000002'],'PGCRs only for the two clears, not the incomplete run');
    assert.match(await page.locator('.reports-runs').innerText(),/Completed · from checkpoint/);
    assert.deepEqual(errors,[]);await page.close();
  }
  // Pantheon: bosses are an Encounters list. Salvation's Edge: Normal and Standard are one Standard row.
  {
    const {page,errors}=await open();
    await page.locator('.rp-tile-face',{hasText:'The Pantheon'}).click();
    await page.waitForFunction(()=>document.querySelector('.reports-encounters'));
    await page.waitForFunction(()=>!/any start/.test(document.querySelector('.reports-detail-card').textContent));
    assert.deepEqual(await page.locator('.reports-encounters tbody th').allInnerTexts(),['Warpriest','Morgeth Surpassing'].sort((a,b)=>a==='Warpriest'?-1:1));
    assert.equal(await page.locator('.reports-detail-card thead th:first-child').evaluateAll(n=>n.filter(th=>th.textContent==='Difficulty').length),0,'No boss in a difficulty table');
    await page.locator('[data-back]').click();
    await page.locator('.rp-tile-face',{hasText:"Salvation's Edge"}).click();
    await page.waitForFunction(()=>!/any start|Pending/.test(document.querySelector('.reports-detail-card table')?.textContent||'Pending'));
    assert.deepEqual(await page.locator('.reports-detail-card table').first().locator('tbody th').allInnerTexts(),['Standard'],'One Standard row');
    assert.match(await page.locator('.reports-detail-card table').first().innerText(),/Standard\s+3\s+48:20/);
    assert.deepEqual(errors,[]);await page.close();
  }
  // Deep link to a never-completed activity: one line, no history crawl.
  {
    const {page,errors,requests}=await open(`?activity=${encodeURIComponent("dungeons:vesper's host")}`);
    assert.equal(await page.locator('.reports-empty').innerText(),"No completed runs of Vesper's Host yet");
    await page.waitForTimeout(300);
    assert.deepEqual([requests.history.length,requests.pgcr.length],[0,0],'No history or PGCR request for a never-completed activity');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('REPORTS_COMPLETED=PASS completed-only tiles (art only), series tabs and rows; plain line when none; no history or PGCR crawl for never-completed activities; PGCRs only for clears; Fastest is the full clear (40:00 not the 02:55 checkpoint clear, which stays in Clears, marked); "(any start)" until Bungie says; Pantheon bosses as Encounters; Normal and Standard merged as Standard');
}finally{
  await browser?.close();server.close();
}
