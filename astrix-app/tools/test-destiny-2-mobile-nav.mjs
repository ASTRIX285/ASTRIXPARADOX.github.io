#!/usr/bin/env node
// Destiny 2 landing pages use the same collapsed phone menu as the other public pages:
// closed on load, the menu button opens a solid panel, a link tap or Escape closes it.
// Desktop keeps the row of links with no menu button.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const pages=['tools/destiny-2/','tools/destiny-2/dim-companion/','tools/destiny-2/dim-loadout-viewer/'];
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/twitch-status.json'){res.setHeader('Content-Type','application/json');res.end('{"live":false}');return;}
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const path of pages){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(`${origin}/${path}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(300);
    const state=()=>page.evaluate(()=>{
      const links=document.querySelector('.nav-links'),toggle=document.querySelector('.nav-toggle'),style=getComputedStyle(links);
      return {toggle:Boolean(toggle?.getBoundingClientRect().width),expanded:toggle?.getAttribute('aria-expanded'),open:style.display!=='none'&&links.getBoundingClientRect().height>0,solid:/^rgb\(/.test(style.boxShadow)&&/inset/.test(style.boxShadow)};
    });
    let now=await state();
    assert.equal(now.toggle,true,`${path}: the menu button shows at 390px`);
    assert.equal(now.open,false,`${path}: the menu is closed on load`);
    assert.equal(now.expanded,'false');
    await page.click('.nav-toggle');now=await state();
    assert.equal(now.open,true,`${path}: the button opens the menu`);assert.equal(now.expanded,'true');assert.ok(now.solid,`${path}: the open menu is a solid panel`);
    await page.keyboard.press('Escape');now=await state();
    assert.equal(now.open,false,`${path}: Escape closes the menu`);
    await page.click('.nav-toggle');
    await page.evaluate(()=>document.querySelectorAll('.nav-links a').forEach(a=>a.addEventListener('click',event=>event.preventDefault())));
    await page.click('.nav-links a[href="/pages/news.html"]');now=await state();
    assert.equal(now.open,false,`${path}: tapping a link closes the menu`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path}: no sideways scroll`);
    await page.setViewportSize({width:1600,height:900});await page.waitForTimeout(200);now=await state();
    assert.equal(now.toggle,false,`${path}: no menu button on desktop`);assert.equal(now.open,true,`${path}: desktop keeps the row of links`);
    assert.deepEqual(errors,[],`${path}: no page errors`);
    await page.close();
  }
  console.log(`DESTINY_2_MOBILE_NAV=PASS ${pages.length} pages: closed on load, solid panel, link tap and Escape close, desktop row unchanged`);
}finally{await browser?.close();server.close();}
