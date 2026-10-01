#!/usr/bin/env node
// Every ASTRIX PARADOX logo and wordmark links to the main home page with href="/".
// Public pages are checked as served; tool pages run the shared ribbon script that
// builds their brand. Page scripts are stripped so no account or network call runs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const publicPages=['','pages/reviews.html','pages/news.html','pages/clips.html','pages/games.html','pages/join.html','tools/','tools/destiny-2/','tools/destiny-2/dim-companion/','tools/destiny-2/dim-loadout-viewer/','astrix-app/pages/home/'];
const toolPages=['journey','guardian-workspace-v2','forge-loader','guardian-workspace-v2/paradox-build-space','reports','vault','loadout','mission-reports','build-review'].map(page=>`astrix-app/pages/${page}/`);
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
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const check=async(path,tool)=>{
    await page.goto(`${origin}/${path}`,{waitUntil:'domcontentloaded'});
    if(tool){await page.addScriptTag({url:`${origin}/astrix-app/shared/astrix-destination-ribbon.js`});await page.locator('.apx-destination-brand[data-ax-brand]').waitFor();}
    const links=await page.evaluate(()=>[...document.querySelectorAll('.nav-logo,.home-brand,.apx-destination-brand')].map(node=>({tag:node.tagName,href:node.getAttribute('href'),path:node.tagName==='A'?new URL(node.href).pathname:null,label:node.getAttribute('aria-label'),wordmark:Boolean(node.querySelector('.ax-wordmark'))})));
    assert.ok(links.length>=1,`${path||'/'}: a logo is present`);
    for(const link of links){
      assert.equal(link.tag,'A',`${path||'/'}: the logo is a link`);
      assert.equal(link.href,'/',`${path||'/'}: the logo uses href="/"`);
      assert.equal(link.path,'/',`${path||'/'}: the logo resolves to the home page`);
      assert.equal(link.label,'ASTRIX PARADOX home',`${path||'/'}: the logo is labelled for assistive tech`);
      assert.ok(link.wordmark,`${path||'/'}: the logo keeps the ASTRIX PARADOX wordmark`);
    }
  };
  for(const path of publicPages)await check(path,false);
  for(const path of toolPages)await check(path,true);
  console.log(`LOGO_HOME_LINK=PASS ${publicPages.length} public pages and ${toolPages.length} tool pages link the logo to /`);
}finally{await browser?.close();server.close();}
