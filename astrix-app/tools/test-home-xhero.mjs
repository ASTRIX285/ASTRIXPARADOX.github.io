// Public home page, concept B "The X" (design/home-hero-identity, approved by Miguel 13 Oct 2026).
// Checks what the page looks like (computed styles and boxes), the lead game and lead tool switch
// from js/game-presets.js, the strobe effects, and the Twitch stream lock.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));

// Locked (Miguel, 13 Oct 2026): the home page Twitch stream section never changes.
// Its markup must match byte for byte (line endings normalised). Update this hash only with Miguel's sign-off.
const STREAM_SECTION_SHA256='68bbe4886c4778988d0a5202648083b1d3fe589b3c6bebee5bf8fb6ec32ff493';
const home=readFileSync(resolve(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const start=home.indexOf('<section class="stream-section" id="streamSection">');
assert.ok(start>0,'stream section present');
const block=home.slice(start,home.indexOf('</section>',start)+'</section>'.length);
assert.equal(createHash('sha256').update(block).digest('hex'),STREAM_SECTION_SHA256,'Twitch stream section markup is locked');
const css=readFileSync(resolve(root,'css/home-xhero.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
assert.doesNotMatch(css,/stream|#vod|twitch/i,'home styles never reach the stream section');
assert.doesNotMatch(home+css,/[–—]/,'No dashes in the page or its styles');
console.log('STREAM_LOCK=PASS');

const presets=readFileSync(resolve(root,'js/game-presets.js'),'utf8');
assert.match(presets,/^window\.ACTIVE_GAME = "aion2";$/m,'AION 2 is the lead game (Miguel, 13 Oct 2026)');

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
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

async function openHome({width,height,reducedMotion='no-preference',active}){
 const context=await browser.newContext({viewport:{width,height},reducedMotion});
 // Nothing leaves the local server (fonts, streams and scripts on other hosts answer empty).
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
 if(active)await context.route(`${base}/js/game-presets.js`,route=>route.fulfill({contentType:'text/javascript',
  body:presets.replace(/^window\.ACTIVE_GAME = "aion2";$/m,`window.ACTIVE_GAME = "${active}";`)}));
 const page=await context.newPage();
 await page.goto(`${base}/`);
 await page.evaluate(()=>document.fonts.ready);
 const settled=await page.evaluate(()=>Promise.race([
  Promise.all(document.getAnimations().filter(a=>/^ax-home-rise/.test(a.animationName)).map(a=>a.finished)).then(()=>true),
  new Promise(done=>setTimeout(()=>done(false),1500))]));
 assert.ok(settled,`${width}px ${reducedMotion}: entrance settles`);
 return {context,page};
}

try{
 for(const [width,height] of [[1600,900],[820,1180],[390,844]]){
  for(const reducedMotion of ['no-preference','reduce']){
   const label=`${width}px ${reducedMotion}`;
   const {context,page}=await openHome({width,height,reducedMotion});
   const r=await page.evaluate(()=>{
    const hero=document.getElementById('axHero');const cs=(e,p)=>getComputedStyle(e,p);
    const box=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height}};
    const scene=[...hero.querySelectorAll('.ax-xhero-scene')].find(s=>cs(s).display!=='none');
    const slices=[...document.querySelectorAll('#axUniRow .ax-slice')];
    const tools=[...document.querySelectorAll('#axToolsSplit .ax-tool')];
    const primary=hero.querySelector('.ax-xhero-tab .btn-primary');
    return {
     first:document.querySelector('body>section')===hero,
     titleFont:cs(hero.querySelector('h1')).fontFamily,
     chromeClip:cs(hero.querySelector('.ax-xhero-chrome')).webkitBackgroundClip||cs(hero.querySelector('.ax-xhero-chrome')).backgroundClip,
     map:cs(hero.querySelector('.ax-xhero-map')).backgroundImage,
     heroImgs:hero.querySelectorAll('img').length,
     edges:[...scene.querySelectorAll('.ax-xhero-edge')].map(e=>cs(e).animationName),
     streaks:[...scene.querySelectorAll('.ax-xhero-streak')].map(e=>cs(e).display),
     primary:box(primary),primaryText:primary.textContent.trim(),primaryHref:primary.getAttribute('href'),
     btnStrobe:cs(primary,'::after').animationName,
     tabPad:cs(hero.querySelector('.ax-xhero-tab')).paddingLeft,
     slices:slices.map(s=>({game:s.dataset.game,open:s.classList.contains('is-open'),box:box(s),
      status:s.querySelector('.ax-slice-status').textContent.trim(),expanded:s.querySelector('.ax-slice-hit').getAttribute('aria-expanded'),
      pulse:cs(s,'::before').animationName,bodyShown:cs(s.querySelector('.ax-slice-body')).display!=='none'})),
     tools:tools.map(t=>({game:t.dataset.game,primary:t.querySelector('.ax-tool-btn').classList.contains('btn-primary'),
      strobe:cs(t.querySelector('.ax-tool-btn'),'::after').animationName})),
     cut:cs(document.querySelector('#axTools .ax-tools-cut line')).animationName,
     cutShown:cs(document.querySelector('#axTools .ax-tools-cut')).display!=='none',
     h2Font:cs(document.querySelector('.ax-home-h2')).fontFamily,
     scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     template:document.querySelectorAll('.hero-eyebrow,.ax-stat-grid,.hero-tags,#heroBg,.reveal').length,
     text:document.body.innerText
    };
   });
   assert.ok(r.first,`${label}: the X hero is the first section`);
   assert.match(r.titleFont,/^"?Michroma/,`${label}: wordmark in Michroma`);
   assert.equal(r.chromeClip,'text',`${label}: chrome wordmark`);
   assert.match(r.map,/astrix-paradox-map/,`${label}: the ASTRIX PARADOX map is the hero background`);
   assert.equal(r.heroImgs,0,`${label}: no game art in the hero`);
   assert.equal(r.edges.length,4,`${label}: four slab edges`);
   assert.equal(r.tabPad==='0px',width<=768,`${label}: tab padding ${r.tabPad}`);
   assert.ok(r.primary.top>0&&r.primary.bottom<=height,`${label}: Watch Live visible without scrolling`);
   assert.equal(r.primaryText,'Watch Live');
   assert.equal(r.primaryHref,'https://twitch.tv/astrix285x','Watch Live keeps the channel URL so the on-site stream jump still works');
   assert.match(r.h2Font,/acumin-pro-extra-condensed/,`${label}: headings ready for Acumin Pro`);
   // Lead game: AION 2 first, open, marked Playing now.
   assert.equal(r.slices[0].game,'aion2',`${label}: AION 2 leads The Universes`);
   assert.ok(r.slices[0].open&&r.slices[0].bodyShown,`${label}: lead slice open`);
   assert.equal(r.slices[0].status,'Playing now');
   assert.equal(r.slices[0].expanded,'true');
   assert.equal(r.slices.filter(s=>s.open).length,1,`${label}: one slice open`);
   assert.ok(r.slices.slice(1).every(s=>s.status!=='Playing now'),`${label}: only the lead game says Playing now`);
   if(width>1024)assert.ok(r.slices[0].box.width>r.slices[1].box.width*4,`${label}: open slice ${r.slices[0].box.width} vs ${r.slices[1].box.width}`);
   else assert.ok(r.slices[0].box.height>r.slices[1].box.height*4,`${label}: open row ${r.slices[0].box.height} vs ${r.slices[1].box.height}`);
   // Lead tool: The Aetherium first with the red button.
   assert.equal(r.tools[0].game,'aion2',`${label}: The Aetherium leads The Tools`);
   assert.deepEqual(r.tools.map(t=>t.primary),[true,false],`${label}: only the lead tool's button is red`);
   // Strobe effects stay on.
   if(reducedMotion==='no-preference'){
    assert.ok(r.edges.every(n=>n==='ax-home-strobe'),`${label}: slab edges strobe (${r.edges})`);
    assert.ok(r.streaks.every(d=>d!=='none'),`${label}: light runs along the edges`);
    assert.equal(r.btnStrobe,'ax-stroke-pulse',`${label}: strobe stroke on the hero buttons`);
    assert.ok(r.tools.every(t=>t.strobe==='ax-stroke-pulse'),`${label}: strobe stroke on the tool buttons`);
    assert.equal(r.slices[0].pulse,'ax-home-pulse',`${label}: strobe stroke on the open slice`);
    if(r.cutShown)assert.equal(r.cut,'ax-home-strobe',`${label}: the tools diagonal strobes`);
   }else{
    assert.ok(r.edges.every(n=>n==='none'),`${label}: edges still for reduced motion`);
    assert.ok(r.streaks.every(d=>d==='none'),`${label}: streaks hidden for reduced motion`);
    assert.equal(r.slices[0].pulse,'none',`${label}: open slice still for reduced motion`);
   }
   assert.equal(r.scrollX,0,`${label}: no horizontal page scroll`);
   assert.equal(r.template,0,`${label}: no eyebrow, stats row, tag pills, hidden video or scroll reveals`);
   assert.doesNotMatch(r.text,/[–—]/,`${label}: no dashes`);
   assert.doesNotMatch(r.text,/Welcome to the Paradox|Multi-Game Operations Hub|Years in the Field|YOUR ONE-LINE/i,`${label}: template copy gone`);

   // Clicking another slice opens it and closes the lead one.
   await page.locator('#axUniRow .ax-slice[data-game="warframe"] .ax-slice-hit').click();
   await page.waitForTimeout(reducedMotion==='reduce'?50:600);
   const after=await page.evaluate(()=>[...document.querySelectorAll('#axUniRow .ax-slice')].map(s=>[s.dataset.game,s.classList.contains('is-open'),s.querySelector('.ax-slice-hit').getAttribute('aria-expanded')]));
   assert.deepEqual(after.filter(s=>s[1]).map(s=>s[0]),['warframe'],`${label}: a click opens that universe`);
   assert.equal(after.find(s=>s[0]==='warframe')[2],'true');
   await context.close();
  }
 }

 // One line in js/game-presets.js moves the lead game and lead tool.
 {
  const {context,page}=await openHome({width:1600,height:900,active:'destiny2'});
  const r=await page.evaluate(()=>({
   slices:[...document.querySelectorAll('#axUniRow .ax-slice')].map(s=>[s.dataset.game,s.classList.contains('is-open'),s.querySelector('.ax-slice-status').textContent.trim()]),
   tools:[...document.querySelectorAll('#axToolsSplit .ax-tool')].map(t=>[t.dataset.game,t.querySelector('.ax-tool-btn').classList.contains('btn-primary')])
  }));
  assert.deepEqual(r.slices[0],['destiny2',true,'Playing now'],'Destiny 2 leads when it is the active game');
  assert.equal(r.slices.find(s=>s[0]==='aion2')[2],'','AION 2 drops its Playing now label');
  assert.deepEqual(r.tools,[['destiny2',true],['aion2',false]],'The Forge leads when Destiny 2 is the active game');
  await context.close();
 }
 {
  const {context,page}=await openHome({width:1600,height:900,active:'pathofexile'});
  const r=await page.evaluate(()=>({
   lead:document.querySelector('#axUniRow .ax-slice').dataset.game,
   open:[...document.querySelectorAll('#axUniRow .ax-slice.is-open')].length,
   live:[...document.querySelectorAll('.ax-slice-status')].filter(s=>s.textContent.trim()==='Playing now').length,
   tool:document.querySelector('#axToolsSplit .ax-tool').dataset.game
  }));
  assert.equal(r.open,1,'A game without a slice still leaves one universe open');
  assert.equal(r.live,0,'and claims nothing is playing');
  assert.equal(r.tool,'aion2','and the tools keep their order');
  await context.close();
 }
 console.log('HOME_XHERO=PASS 1600/820/390, motion and reduced motion, lead game switch, strobes');
}finally{await browser.close();server.close();}
