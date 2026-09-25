import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
let browser;
try{
 try{browser=await chromium.launch({headless:true});}catch(error){if(/Executable doesn't exist/.test(error.message))console.error('NOT RUN: Chromium missing');throw error;}
 // Route every request to fixtures or abort it. No live Bungie/platform interaction.
 for(const origin of ['http://localhost:8080','http://127.0.0.1:8080','https://preview-test.invalid']){
  const context=await browser.newContext({viewport:{width:1363,height:1080}});
  const page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin){await route.abort();return;}
   const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
   const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/')){await route.abort();return;}
   try{await route.fulfill({body:await readFile(file),contentType:({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto(origin+'/astrix-app/pages/journey/?preview');
  if(origin.includes('preview-test.invalid')){
   await page.waitForFunction(()=>!!globalThis.FORGE_HERO_PROFILE_PROMISE);
   assert.ok(requests.some(url=>url.includes('/astrix-hero-cards.mjs')),'Remote host uses the original live path');
   assert.equal(await page.locator('#localPreviewBadge').count(),0);
   assert.equal(requests.some(url=>url.includes('/journey-preview.mjs')),false);
   assert.equal(await page.locator('body').innerText().then(text=>text.includes('Sample Guardian')),false);
  }else{
   await page.getByText('PREVIEW DATA',{exact:true}).waitFor();
   await page.waitForFunction(()=>!document.body.classList.contains('apx-loading'));
   assert.equal(await page.locator('#journeyDashboard').isVisible(),true);
   assert.equal(await page.locator('.guardian-character-card').count(),3);
   await page.locator('.guardian-character-card').nth(1).click();assert.equal(await page.locator('#journeyGuardianClass').innerText(),'Sample Hunter');
   // A previously cached account must not cause ribbon intent preloading in preview.
   await page.evaluate(()=>{sessionStorage.setItem('astrix:bungie-session-cache:v1',JSON.stringify({session:{authenticated:true,activeDestinyMembership:{membershipId:'sample-test',membershipType:3}}}));});
   await page.locator('.apx-destination-ribbon a').filter({hasText:'Character'}).hover();
   await page.waitForTimeout(700);
   assert.equal(requests.some(url=>/guardian-bungie-auth|prepared-page-client|\/bungie\/|auth\.astrixparadox/.test(url)),false,'Preview never loads live auth or prepared account data');
   assert.equal(await page.evaluate(()=>!!globalThis.FORGE_BUNGIE_SESSION),false,'Preview never publishes a fake authenticated session');
   assert.deepEqual(errors,[]);
  }
  await context.close();
 }
 console.log('LOCAL_PREVIEW_BROWSER=PASS');
}finally{await browser?.close();}
