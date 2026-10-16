// Reactor capsule buttons (design/capsule-buttons, Miguel 16 Oct 2026). Checks what the buttons look like
// in a browser: pill shape in a graphite rim, glass core, lift on hover, the dial on headline actions,
// the strobe on the rim. The home stream section's buttons match too (Miguel, 16 Oct 2026); its markup stays locked.
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
const shell=readFileSync(resolve(root,'astrix-app/shared/astrix-tool-shell.css'),'utf8');
const primary=shell.slice(shell.indexOf('/* ---------- Buttons: reactor capsule'),shell.indexOf('/* Every other button on a tool page'));
assert.match(primary,/border-radius:999px!important;clip-path:none!important/,'Tool main actions are capsules');
assert.match(primary,/--ax-btn-rim:0 0 0 3px #161618/,'Tool main actions sit in the graphite rim');
assert.match(primary,/:hover:not\(:disabled\)\{transform:translateY\(-2px\)/,'Tool main actions lift on hover');
assert.doesNotMatch(primary,/#77756f/,'No warm grey on disabled tool actions');

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'};
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
async function open(path,width=1600,height=900,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width,height},reducedMotion});
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.fulfill({status:204,body:''}));
 const page=await context.newPage();
 await page.goto(`${base}${path}`);
 await page.waitForTimeout(500);
 return {context,page};
}
const look=(page,selector)=>page.evaluate(sel=>{
 const e=document.querySelector(sel);if(!e)return null;const c=getComputedStyle(e),a=getComputedStyle(e,'::after'),b=e.getBoundingClientRect();
 return {radius:parseFloat(c.borderTopLeftRadius),clip:c.clipPath,shadow:c.boxShadow,bg:c.backgroundImage,padLeft:parseFloat(c.paddingLeft),
  height:b.height,width:b.width,afterRadius:a.borderTopLeftRadius,afterAnim:a.animationName,transform:c.transform};
},selector);
try{
 const checks=[
  ['/','#axHero .ax-xhero-tab .btn-primary',true],['/','#axHero .ax-xhero-tab .btn-secondary',false],['/','#axCrew .btn-primary',true],['/','#axCrew .btn-secondary',false],
  ['/pages/clips.html','#axPageHero .btn-primary',true],['/hub/','#axPageHero .btn-primary',false],['/hub/','#axPageHero .btn-secondary',false],
  ['/tools/destiny-2/','.landing-actions .btn-primary',true],['/pages/games.html','#axUniList .ax-ch-cta > *',false]];
 for(const [width,height] of [[1600,900],[390,844]]){
  for(const [path,sel,dial] of checks){
   const {context,page}=await open(path,width,height);
   const r=await look(page,sel);
   const label=`${width}px ${path} ${sel}`;
   assert.ok(r,`${label}: present`);
   assert.ok(r.radius>=r.height/2-1,`${label}: pill ends (${r.radius}px on ${Math.round(r.height)}px)`);
   assert.equal(r.clip,'none',`${label}: no notched clip`);
   assert.match(r.shadow,/rgb\(22, 22, 24\) 0px 0px 0px 3px/,`${label}: graphite rim`);
   assert.match(r.bg,/radial-gradient/,`${label}: glass gloss`);
   assert.ok(r.height>=48,`${label}: comfortable height (${r.height})`);
   assert.equal(r.afterRadius,'999px',`${label}: the strobe follows the rim`);
   assert.equal(r.afterAnim,'ax-stroke-pulse',`${label}: the strobe pulses`);
   if(dial){
    assert.ok(r.padLeft>=60,`${label}: room for the dial`);
    assert.match(r.bg,/data:image\/svg\+xml/,`${label}: dial icon`);
   }
   await context.close();
  }
 }
 // Hover lifts and glows; press sinks.
 {
  const {context,page}=await open('/');
  const btn=page.locator('#axHero .ax-xhero-tab .btn-secondary');
  // Re-hover until the pointer is really over it: the page can still be settling right after load.
  let hover;
  for(let tries=0;tries<6;tries++){
   await btn.hover();await page.waitForTimeout(700);
   hover=await look(page,'#axHero .ax-xhero-tab .btn-secondary');
   if(Number(hover.transform.match(/-?[\d.]+(?=\)$)/)?.[0])<=-1.9&&/0\.45\) 0px 0px 26px/.test(hover.shadow))break;
  }
  assert.ok(Number(hover.transform.match(/-?[\d.]+(?=\)$)/)?.[0])<=-1.9,'Hover lifts the capsule');
  assert.match(hover.shadow,/rgba\(230, 57, 31, 0\.45\) 0px 0px 26px/,'Hover brightens the glow');
  await context.close();
 }
 // The stream section's buttons match the rest of the site (Miguel, 16 Oct 2026). Only their look changes;
 // test-home-xhero.mjs STREAM_LOCK keeps the section's markup byte for byte.
 {
  const {context,page}=await open('/');
  const r=await page.evaluate(()=>[...document.querySelectorAll('#streamSection :is(.btn-primary,.btn-secondary,.btn-facebook)')].map(e=>{const c=getComputedStyle(e);return {radius:parseFloat(c.borderTopLeftRadius),clip:c.clipPath,shadow:c.boxShadow,after:getComputedStyle(e,'::after').borderTopLeftRadius}}));
  assert.ok(r.length>=6&&r.every(b=>b.radius>=20&&b.clip==='none'&&/rgb\(22, 22, 24\) 0px 0px 0px 3px/.test(b.shadow)&&b.after==='999px'),`Stream section buttons are capsules (${JSON.stringify(r[0])})`);
  await context.close();
 }
 // Reduced motion: no pulse, no lift animation needed.
 {
  const {context,page}=await open('/',1600,900,'reduce');
  const r=await look(page,'#axHero .ax-xhero-tab .btn-primary');
  assert.equal(r.afterAnim,'none','Reduced motion: strobe still');
  await context.close();
 }
 console.log('CAPSULE_BUTTONS=PASS 9 buttons at 1600 and 390: pill in graphite rim, glass gloss, strobe on the rim, dial on headline actions, hover lift, stream section buttons match, tool main actions capsule');
}finally{await browser.close();server.close();}
