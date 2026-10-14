// Universes page in the concept B look (design/universes-page-b). Checks what the page looks like
// (computed styles and boxes), the lead game from js/game-presets.js, the strobes and the trailer modal.
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
const html=readFileSync(resolve(root,'pages/games.html'),'utf8');
const css=readFileSync(resolve(root,'css/universes.css'),'utf8');
const presets=readFileSync(resolve(root,'js/game-presets.js'),'utf8');
assert.doesNotMatch(html+css,/[–—]/,'No dashes');
assert.doesNotMatch(html,/The Forge|guardian-alpha|tools-section/,'Universes stays separate from the Tools catalogue');
assert.ok(html.includes('Gaming <span class="accent">Universes</span>'),'Universes keeps its own purpose');
assert.doesNotMatch(html,/class="reveal|game-card|section-eyebrow|onclick=/,'No template cards, eyebrows, scroll reveals or inline handlers');
for(const m of html.matchAll(/<img class="ax-ch-art"[^>]*>/g))assert.match(m[0],/style="object-position: 50% \d+%"/,'Every chapter image has its own crop so baked logos stay whole');
assert.match(html,/data-game="crimsondesert">[\s\S]*?Reviewed 9\.0\/10/,'Crimson Desert shows its review score');

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
async function open({width,height,reducedMotion='no-preference',active}){
 const context=await browser.newContext({viewport:{width,height},reducedMotion});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
 if(active)await context.route(`${base}/js/game-presets.js`,route=>route.fulfill({contentType:'text/javascript',
  body:presets.replace(/^window\.ACTIVE_GAME = "[a-z0-9]+";$/m,`window.ACTIVE_GAME = "${active}";`)}));
 const page=await context.newPage();
 await page.goto(`${base}/pages/games.html`);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(reducedMotion==='reduce'?50:600);
 return {context,page};
}
try{
 for(const [width,height] of [[1600,900],[820,1180],[390,844]]){
  for(const reducedMotion of ['no-preference','reduce']){
   const label=`${width}px ${reducedMotion}`;
   const {context,page}=await open({width,height,reducedMotion});
   const r=await page.evaluate(()=>{
    const cs=(e,p)=>getComputedStyle(e,p);const box=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height}};
    const hero=document.getElementById('axUniHero');
    const ch=[...document.querySelectorAll('#axUniList .ax-ch')];
    return {
     map:cs(hero.querySelector('.ax-uh-map')).backgroundImage,
     edges:[...hero.querySelectorAll('.ax-uh-edge')].map(e=>cs(e).animationName),
     streaks:[...hero.querySelectorAll('.ax-uh-streak')].map(e=>cs(e).display),
     titleFont:cs(hero.querySelector('h1')).fontFamily,heroBox:box(hero),
     chapters:ch.map(c=>({game:c.dataset.game,lead:c.classList.contains('is-lead'),status:c.querySelector('.ax-ch-status').textContent.trim(),
      pulse:cs(c,'::before').animationName,box:box(c),body:box(c.querySelector('.ax-ch-body')),
      firstCta:c.querySelector('.ax-ch-cta > *')?.className||'',titleFont:cs(c.querySelector('h2')).fontFamily})),
     ctaStrobe:cs(document.querySelector('#axUniList .ax-ch-cta > *'),'::after').animationName,
     scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     text:document.body.innerText
    };
   });
   assert.match(r.map,/astrix-paradox-map/,`${label}: ASTRIX PARADOX map behind the header`);
   assert.equal(r.edges.length,4,`${label}: four slab edges`);
   assert.match(r.titleFont,/acumin-pro-extra-condensed/,`${label}: header in Acumin Extra Condensed`);
   assert.ok(r.heroBox.height>=400&&r.heroBox.height<=600,`${label}: header ${r.heroBox.height}px`);
   assert.equal(r.chapters.length,10,`${label}: ten universes`);
   assert.equal(r.chapters.find(c=>c.game==='division2')?.status,'In rotation',`${label}: The Division 2 is in`);
   assert.equal(r.chapters[0].game,'aion2',`${label}: AION 2 leads`);
   assert.ok(r.chapters[0].lead,`${label}: lead chapter marked`);
   assert.equal(r.chapters[0].status,'Playing now');
   assert.ok(r.chapters.slice(1).every(c=>!c.lead&&c.status!=='Playing now'),`${label}: only the lead game says Playing now`);
   assert.match(r.chapters[0].firstCta,/btn-primary/,`${label}: the lead game's action is red`);
   assert.ok(r.chapters.slice(1).every(c=>!/btn-primary/.test(c.firstCta)),`${label}: every other action stays secondary`);
   if(width>=1600)assert.ok(r.chapters.every(c=>c.box.height>=600&&c.box.height<=720),`${label}: bands tall enough to show the art (${r.chapters.map(c=>Math.round(c.box.height))})`);
   for(const c of r.chapters){
    assert.ok(c.box.width>=width-1,`${label}: ${c.game} runs full width`);
    assert.ok(c.body.left>=c.box.left+15&&c.body.right<=c.box.right-15&&c.body.top>=c.box.top&&c.body.bottom<=c.box.bottom,`${label}: ${c.game} text sits inside its chapter`);
    assert.match(c.titleFont,/acumin-pro-extra-condensed/,`${label}: ${c.game} title face`);
   }
   if(reducedMotion==='no-preference'){
    assert.ok(r.edges.every(n=>n==='ax-uni-strobe'),`${label}: slab edges strobe`);
    assert.ok(r.streaks.every(d=>d!=='none'),`${label}: light runs along the edges`);
    assert.equal(r.chapters[0].pulse,'ax-uni-pulse',`${label}: strobe stroke on the lead chapter`);
    assert.equal(r.ctaStrobe,'ax-stroke-pulse',`${label}: strobe stroke on the buttons`);
   }else{
    assert.ok(r.edges.every(n=>n==='none'),`${label}: edges still`);
    assert.ok(r.streaks.every(d=>d==='none'),`${label}: streaks hidden`);
    assert.equal(r.chapters[0].pulse,'none',`${label}: lead chapter still`);
   }
   assert.equal(r.scrollX,0,`${label}: no horizontal page scroll`);
   assert.doesNotMatch(r.text,/[–—]/,`${label}: no dashes`);
   await context.close();
  }
 }
 // Trailer modal: opens, takes focus, closes on Escape and returns focus.
 {
  const {context,page}=await open({width:1600,height:900});
  const btn=page.locator('.ax-ch[data-game="warframe"] .ax-ch-trailer');
  await btn.click();
  const opened=await page.evaluate(()=>({open:document.getElementById('trailerModal').classList.contains('open'),
   src:document.getElementById('trailerFrame').getAttribute('src'),label:document.getElementById('trailerLabel').textContent,focus:document.activeElement.id}));
  assert.ok(opened.open,'Trailer opens');
  assert.equal(opened.src,'https://www.youtube.com/embed/CdQU5fzkXwA?autoplay=1&rel=0');
  assert.equal(opened.label,'Warframe: Official Trailer');
  assert.equal(opened.focus,'trailerClose','Focus moves to Close');
  await page.keyboard.press('Escape');
  const closed=await page.evaluate(()=>({open:document.getElementById('trailerModal').classList.contains('open'),src:document.getElementById('trailerFrame').getAttribute('src'),
   focus:document.activeElement.closest('.ax-ch')?.dataset.game}));
  assert.ok(!closed.open&&closed.src==='','Escape closes and stops the video');
  assert.equal(closed.focus,'warframe','Focus returns to the trailer button');
  await context.close();
 }
 // The lead game follows ACTIVE_GAME.
 {
  const {context,page}=await open({width:1600,height:900,active:'destiny2'});
  const r=await page.evaluate(()=>[...document.querySelectorAll('#axUniList .ax-ch')].map(c=>[c.dataset.game,c.classList.contains('is-lead'),c.querySelector('.ax-ch-status').textContent.trim()]));
  assert.deepEqual(r[0],['destiny2',true,'Playing now'],'Destiny 2 leads when active');
  assert.deepEqual(r.find(c=>c[0]==='aion2'),['aion2',false,''],'AION 2 drops its label');
  await context.close();
 }
 console.log('UNIVERSES_B=PASS 1600/820/390, motion and reduced motion, lead game switch, trailer modal, strobes');
}finally{await browser.close();server.close();}
