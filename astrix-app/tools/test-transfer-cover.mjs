// Tool transfer cover (design/transfer-cover-x, Miguel 14 Oct 2026): the X slabs with strobing edges
// over the map art while the destination tool page gets ready. Not the loader: no ring, wordmark or bar.
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
const css=readFileSync(resolve(root,'astrix-app/shared/astrix-portal-loader.css'),'utf8');
const svgOf=name=>{
 const m=css.match(new RegExp(`--apx-transfer-x-${name}:url\\("data:image/svg\\+xml,([^"]+)"\\)`));
 assert.ok(m,`${name} slabs defined`);
 return decodeURIComponent(m[1]);
};
for(const name of ['wide','tall']){
 const moving=svgOf(name),still=svgOf(`${name}-still`);
 for(const [label,svg] of [[name,moving],[`${name} still`,still]]){
  assert.match(svg,/^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg'/,`${label}: a complete SVG`);
  assert.equal((svg.match(/<polygon /g)||[]).length,4,`${label}: four slabs`);
  assert.equal((svg.match(/class='e d\d'/g)||[]).length,4,`${label}: four lit edges`);
  assert.doesNotMatch(svg,/<script|<image|<foreignObject/i,`${label}: plain shapes only`);
 }
 assert.match(moving,/@keyframes s\{/,`${name}: edges strobe`);
 assert.match(moving,/class='r d\d'/,`${name}: a light runs along the edges`);
 assert.doesNotMatch(still,/animation|@keyframes|class='r /,`${name} still: nothing moves`);
}
assert.match(css,/html\.apx-transfer::before\{[^}]*background:var\(--apx-transfer-x\)/,'The cover draws the X');
assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{html\{--apx-transfer-x:var\(--apx-transfer-x-still\)\}\}/,'Reduced motion gets the still X');
assert.match(css,/html\.apx-transfer:has\(\.apx-gate\.is-live-blocked\)\{--apx-transfer-x:var\(--apx-transfer-x-still\)\}/,'A failed transfer gets the still X');
assert.match(css,/@media \(max-width:768px\)\{html\{--apx-transfer-x:var\(--apx-transfer-x-tall\)/,'Phones get the taller slabs');
assert.doesNotMatch(css.slice(css.indexOf('html.apx-transfer::before'),css.indexOf('html.apx-transfer:not(.apx-transfer-label)::after')),/apx-xscene|apx-ring|apx-prog/,'The cover borrows nothing from the loader');
console.log('TRANSFER_COVER_CSS=PASS');

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
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
try{
 for(const [width,height,reducedMotion,want] of [[1600,900,'no-preference','wide'],[390,844,'no-preference','tall'],[1600,900,'reduce','wide-still'],[390,844,'reduce','tall-still']]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  await page.goto(`${base}/astrix-app/pages/reports/`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(()=>{
   // The sandbox cannot reach the Worker, so the page's own gate may show its failed state; take it away to see the cover.
   document.querySelectorAll('.apx-gate').forEach(g=>g.remove());
   const h=document.documentElement;h.dataset.transferStatus='Joining verified Guardian data to the prepared bulk manifest';
   h.classList.add('apx-transfer','apx-transfer-label');
   const before=getComputedStyle(h,'::before'),after=getComputedStyle(h,'::after');
   return {bg:before.backgroundImage,pos:before.position,z:before.zIndex,label:after.content,clip:after.clipPath,bottom:after.bottom,visible:after.visibility};
  });
  const shown=decodeURIComponent(r.bg.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1]||'');
  const label=`${width}px ${reducedMotion}`;
  assert.match(shown,want.startsWith('tall')?/viewBox='0 0 390 844'/:/viewBox='0 0 1280 720'/,`${label}: ${want.startsWith('tall')?'taller phone':'wide'} slabs`);
  assert.equal(/@keyframes/.test(shown),!want.endsWith('still'),`${label}: ${want.endsWith('still')?'still':'strobing'} edges`);
  assert.match(r.bg,/linear-gradient|radial-gradient/,`${label}: pool and wash over the map`);
  assert.equal(r.pos,'fixed',`${label}: cover is fixed`);
  assert.match(r.label,/Joining verified Guardian data/,`${label}: stage label shown`);
  assert.match(r.clip,/polygon/,`${label}: label sits in the notched tab`);
  assert.equal(r.bottom,'0px',`${label}: tab on the bottom edge`);
  await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:1600,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  await page.goto(`${base}/astrix-app/pages/reports/`,{waitUntil:'domcontentloaded'});
  const bg=await page.evaluate(()=>{document.querySelectorAll('.apx-gate').forEach(g=>g.remove());const g=document.createElement('div');g.className='apx-gate is-live-blocked';document.body.append(g);
   const h=document.documentElement;h.classList.add('apx-transfer');return getComputedStyle(h,'::before').backgroundImage;});
  assert.doesNotMatch(decodeURIComponent(bg.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)[1]),/@keyframes/,'A failed transfer shows the X still');
  await context.close();
 }
 console.log('TRANSFER_COVER=PASS 1600 and 390, motion and reduced motion, failed transfer still');
}finally{await browser.close();server.close();}
