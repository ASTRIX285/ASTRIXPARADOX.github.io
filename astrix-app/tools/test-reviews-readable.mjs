// Reviews page readable at 100% zoom (design/reviews-readable, Miguel 13 Oct 2026).
// Checks computed text sizes, that every review shows at rest, and that "Playing now" follows js/game-presets.js.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=readFileSync(resolve(root,'pages/reviews.html'),'utf8');
const presets=readFileSync(resolve(root,'js/game-presets.js'),'utf8');
assert.doesNotMatch(html,/[–—]/,'No dashes');
assert.doesNotMatch(html,/reveal|font-size:11px/,'No scroll reveals and no 11px text');

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(path.endsWith('/'))path+='index.html';
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
async function open(width,active){
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
 if(active)await context.route(`${base}/js/game-presets.js`,route=>route.fulfill({contentType:'text/javascript',
  body:presets.replace(/^window\.ACTIVE_GAME = "[a-z0-9]+";$/m,`window.ACTIVE_GAME = "${active}";`)}));
 const page=await context.newPage();
 await page.goto(`${base}/pages/reviews.html`);
 await page.waitForTimeout(400);
 return {context,page};
}
try{
 for(const [width,min] of [[1600,{intro:18,text:17,title:32}],[390,{intro:17,text:16,title:26}]]){
  const {context,page}=await open(width);
  const r=await page.evaluate(()=>{
   const px=(s,p='fontSize')=>[...document.querySelectorAll(s)].map(e=>parseFloat(getComputedStyle(e)[p]));
   return {intro:px('.review-intro'),text:px('.review-section-text'),title:px('.review-title'),labels:px('.review-section-title,.review-tag,.featured-banner'),
    opacity:[...document.querySelectorAll('.review-card')].map(e=>getComputedStyle(e).opacity),cards:document.querySelectorAll('.review-card').length,
    playing:[...document.querySelectorAll('.featured-banner')].map(e=>e.textContent.trim()),
    scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  const label=`${width}px`;
  assert.ok(r.cards>=5,`${label}: every review renders`);
  assert.ok(r.opacity.every(o=>o==='1'),`${label}: every review is visible at rest`);
  assert.ok(r.intro.every(v=>v>=min.intro),`${label}: intro ${r.intro}`);
  assert.ok(r.text.every(v=>v>=min.text),`${label}: review text ${r.text}`);
  assert.ok(r.title.every(v=>v>=min.title),`${label}: titles ${r.title}`);
  assert.ok(r.labels.every(v=>v>=13),`${label}: labels at least 13px (${r.labels})`);
  assert.deepEqual(r.playing,[],`${label}: AION 2 has no review yet, so no review says Playing now`);
  assert.equal(r.scrollX,0,`${label}: no horizontal page scroll`);
  await context.close();
 }
 {
  const {context,page}=await open(1600,'crimsondesert');
  const r=await page.evaluate(()=>[...document.querySelectorAll('.review-card')].filter(c=>c.querySelector('.featured-banner')).map(c=>c.querySelector('.review-title').textContent.trim()));
  assert.deepEqual(r,['Crimson Desert'],'Playing now follows ACTIVE_GAME');
  await context.close();
 }
 console.log('REVIEWS_READABLE=PASS 1600 and 390, sizes, visible at rest, Playing now from the presets');
}finally{await browser.close();server.close();}
