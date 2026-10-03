#!/usr/bin/env node
// Mobalytics links in the DIM import box (Miguel, 3 Oct 2026): never fetched. The real import dialog
// (core/dim-import/entry.mjs) on a minimal host page:
//   - a mobalytics.gg build link shows the one-line hint and makes no network request at all;
//   - lookalike hosts are not treated as Mobalytics;
//   - a dim.gg link still imports as before (opens Build Review with its share ID).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDimInput,MOBALYTICS_HINT} from '../core/dim-import/share.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const MOBALYTICS_URL='https://mobalytics.gg/destiny-2/profile/deadly-crown-jhp9vc/builds/4cd90527-f555-427f-a839-5749651168ea';
assert.equal(MOBALYTICS_HINT,'Mobalytics builds import through DIM. Press COPY DIM LINK on the build page and paste it here.');
for(const link of [MOBALYTICS_URL,'mobalytics.gg/destiny-2/builds/x','https://www.mobalytics.gg/destiny-2/builds/x']){
  assert.throws(()=>parseDimInput(link),error=>error.mobalytics===true&&error.message===MOBALYTICS_HINT,`${link}: the hint`);
}
assert.throws(()=>parseDimInput('https://notmobalytics.gg.example.com/x'),error=>!error.mobalytics,'A lookalike host is not Mobalytics');
assert.deepEqual(parseDimInput('https://dim.gg/hnpxfxy/Consecration-Titan-PERFECTED'),{shareId:'hnpxfxy'},'dim.gg still parses');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html='<!doctype html><meta charset="utf-8"><title>Import host</title><div class="topbar-actions"></div><script type="module" src="/astrix-app/core/dim-import/entry.mjs"></script>';
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/host/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  async function openDialog(){
    const page=await browser.newPage(),requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();requests.push(url.href);return route.abort();});
    await page.goto(origin+'/host/');
    await page.locator('[data-import-dim]').click();
    await page.locator('#dimImportLink').waitFor();
    return {page,requests,errors};
  }
  // Mobalytics: the hint, and no network request of any kind after submitting.
  {
    const {page,requests,errors}=await openDialog();
    await page.waitForTimeout(500);
    const before=await page.evaluate(()=>performance.getEntriesByType('resource').length),outsideBefore=requests.length;
    await page.locator('#dimImportLink').fill(MOBALYTICS_URL);
    await page.locator('.dim-import-submit').click();
    await page.waitForFunction(hint=>document.querySelector('.dim-import-status')?.textContent===hint,MOBALYTICS_HINT);
    await page.waitForTimeout(500);
    assert.equal(requests.length,outsideBefore,'No request to Mobalytics or anywhere else outside the page');
    assert.ok(!requests.some(url=>/mobalytics/i.test(url)),'Mobalytics is never contacted');
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').length),before,'No new network request at all after submitting');
    assert.equal(new URL(page.url()).pathname,'/host/','The page stays put');
    assert.deepEqual(errors,[]);await page.close();
  }
  // dim.gg: imports as before, opening Build Review with the share ID.
  {
    const {page,errors}=await openDialog();
    await page.locator('#dimImportLink').fill('https://dim.gg/hnpxfxy/Consecration-Titan-PERFECTED');
    await Promise.all([page.waitForURL(url=>url.pathname==='/astrix-app/pages/build-review/'),page.locator('.dim-import-submit').click()]);
    const url=new URL(page.url());
    assert.equal(url.searchParams.get('dim'),'hnpxfxy');assert.equal(url.searchParams.get('step'),'1');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('MOBALYTICS_DIM_HINT=PASS a Mobalytics link shows the hint and makes no network request; lookalike hosts are not Mobalytics; a dim.gg link still opens Build Review with its share ID');
}finally{
  await browser?.close();server.close();
}
