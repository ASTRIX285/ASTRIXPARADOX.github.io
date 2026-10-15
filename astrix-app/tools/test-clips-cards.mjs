// Clips cards (design/clips-cards, Oct 2026). Checks what the cards look like and how they behave in a
// real browser: visible at rest, readable sizes, a clean picture, the player, the filters and the
// thumbnail fallbacks. YouTube is never reached: its pictures are answered by the test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
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
const sample=await readFile(resolve(root,'img/games/crimsondesert.jpg'));
const browser=await chromium.launch();

// youtube: 'ok' answers every picture, 'tiny' answers full-size pictures with YouTube's 120px placeholder,
// 'missing' fails full-size and standard pictures so the game art shows.
async function open({width,height,reducedMotion='no-preference',youtube='ok'}){
 const context=await browser.newContext({viewport:{width,height},reducedMotion});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith(base))return route.continue();
  if(url.startsWith('https://img.youtube.com/')){
   const full=url.endsWith('/maxresdefault.jpg');
   if(youtube==='missing')return route.fulfill({status:404,body:''});
   if(youtube==='tiny'&&full){
    // A 120x90 picture, like YouTube's placeholder for a clip with no full-size thumbnail.
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAHgAAABaCAIAAAD6x/wbAAAAPklEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgzwJ8AAG8JbS/AAAAAElFTkSuQmCC','base64');
    return route.fulfill({status:404,contentType:'image/png',body:png});
   }
   return route.fulfill({status:200,contentType:'image/jpeg',body:sample});
  }
  return route.fulfill({status:204,body:''});
 });
 const page=await context.newPage();
 await page.goto(`${base}/pages/clips.html`);
 await page.waitForTimeout(400);
 return {context,page};
}

try{
 for(const [width,height] of [[1600,900],[390,844]]){
  for(const reducedMotion of ['no-preference','reduce']){
   const label=`${width}px ${reducedMotion}`;
   const {context,page}=await open({width,height,reducedMotion});
   await page.locator('.clip-card').nth(1).scrollIntoViewIfNeeded();
   await page.waitForTimeout(150);
   const r=await page.evaluate(()=>{
    const cs=e=>getComputedStyle(e);const size=e=>parseFloat(cs(e).fontSize);
    const cards=[...document.querySelectorAll('.clip-card')];const c=cards[1];const thumb=c.querySelector('.clip-thumb');
    const tb=thumb.getBoundingClientRect();
    const overThumb=[...c.querySelectorAll('*')].filter(e=>!thumb.contains(e)).filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&b.top<tb.bottom-1&&b.bottom>tb.top+1&&b.left<tb.right-1&&b.right>tb.left+1;}).map(e=>e.className);
    return {count:cards.length,shown:Number(document.getElementById('clipCount').textContent),
     opacity:cards.slice(0,6).map(e=>cs(e).opacity),transform:cards.slice(0,6).map(e=>cs(e).transform),
     tag:thumb.tagName,onThumb:[...thumb.children].map(e=>e.className||e.tagName),overThumb,
     title:size(c.querySelector('.clip-title')),date:size(c.querySelector('.clip-date')),type:size(c.querySelector('.clip-type')),
     link:size(c.querySelector('.clip-link')),duration:size(c.querySelector('.clip-duration')),section:size(document.querySelector('.game-section-label')),
     stats:size(document.querySelector('.clips-stats')),linkHeight:c.querySelector('.clip-link').getBoundingClientRect().height,
     aspect:tb.width/tb.height,cols:new Set(cards.slice(0,6).map(e=>Math.round(e.getBoundingClientRect().left))).size,
     scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   });
   assert.equal(r.count,r.shown,`${label}: the count matches the cards`);
   assert.ok(r.opacity.every(o=>o==='1')&&r.transform.every(t=>t==='none'),`${label}: cards complete at rest (${r.opacity})`);
   assert.equal(r.tag,'BUTTON',`${label}: the picture is a real button`);
   assert.deepEqual(r.onThumb.map(String),['IMG','clip-play','clip-duration'],`${label}: only the play mark and running time sit on the picture`);
   assert.deepEqual(r.overThumb,[],`${label}: nothing else covers the picture`);
   assert.ok(r.title>=16,`${label}: title ${r.title}px`);
   assert.ok(r.date>=13&&r.link>=13&&r.type>=12&&r.duration>=12,`${label}: meta ${r.date}/${r.link}/${r.type}/${r.duration}px`);
   assert.ok(r.section>=14&&r.stats>=13,`${label}: section ${r.section}px, count line ${r.stats}px`);
   assert.ok(r.linkHeight>=32,`${label}: YouTube link is easy to hit (${r.linkHeight}px)`);
   assert.ok(Math.abs(r.aspect-16/9)<0.02,`${label}: 16:9 picture`);
   assert.equal(r.cols,width>=1600?3:1,`${label}: ${r.cols} columns`);
   assert.equal(r.scrollX,0,`${label}: no horizontal page scroll`);
   await context.close();
  }
 }

 // Player: opens from the picture, takes focus, closes on Escape and the close button, returns focus.
 {
  const {context,page}=await open({width:1600,height:900});
  const thumb=page.locator('.clip-thumb').first();
  const id=await thumb.getAttribute('data-clip');
  await thumb.click();
  let s=await page.evaluate(()=>({open:document.getElementById('clipModal').classList.contains('open'),src:document.getElementById('clipFrame').getAttribute('src'),
   label:document.getElementById('clipLabel').textContent,focus:document.activeElement.id,overflow:document.body.style.overflow}));
  assert.ok(s.open&&s.src===`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,'The player opens the clip');
  assert.ok(s.label.length>0&&!/^\s*[|-]/.test(s.label),'The player shows the clean title');
  assert.equal(s.focus,'clipClose','Focus moves to Close');
  assert.equal(s.overflow,'hidden','The page behind does not scroll');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'clipClose','Focus stays in the player');
  await page.keyboard.press('Escape');
  s=await page.evaluate(()=>({open:document.getElementById('clipModal').classList.contains('open'),src:document.getElementById('clipFrame').getAttribute('src'),focus:document.activeElement.dataset.clip}));
  assert.ok(!s.open&&s.src==='','Escape closes and stops the clip');
  assert.equal(s.focus,id,'Focus returns to the picture');
  await thumb.press('Enter');
  assert.ok(await page.evaluate(()=>document.getElementById('clipModal').classList.contains('open')),'Enter on the picture opens the player');
  await page.click('#clipClose');
  assert.ok(!(await page.evaluate(()=>document.getElementById('clipModal').classList.contains('open'))),'Close closes');
  await context.close();
 }

 // Filters: game and type combine, chips report their state, the count and sections follow.
 {
  const {context,page}=await open({width:1600,height:900});
  await page.click('.game-btn[data-game="destiny"]');
  let s=await page.evaluate(()=>({shown:[...document.querySelectorAll('.clip-card:not(.hidden)')].map(c=>c.dataset.game),count:Number(document.getElementById('clipCount').textContent),
   sections:[...document.querySelectorAll('.game-section:not(.hidden)')].map(e=>e.dataset.section),pressed:[...document.querySelectorAll('.game-btn')].map(b=>b.getAttribute('aria-pressed'))}));
  assert.ok(s.shown.length>0&&s.shown.every(g=>g==='destiny'),'Game filter shows only that game');
  assert.equal(s.count,s.shown.length,'Count follows the filter');
  assert.deepEqual(s.sections,['destiny'],'Only that section shows');
  assert.equal(s.pressed.filter(p=>p==='true').length,1,'One game chip pressed');
  await page.click('.type-btn[data-type="guide"]');
  s=await page.evaluate(()=>[...document.querySelectorAll('.clip-card:not(.hidden)')].map(c=>c.dataset.game+'/'+c.dataset.type));
  assert.ok(s.every(v=>v==='destiny/guide'),'Game and type combine');
  await page.click('.game-btn[data-game="all"]');await page.click('.type-btn[data-type="all"]');
  s=await page.evaluate(()=>({hidden:document.querySelectorAll('.clip-card.hidden').length,count:Number(document.getElementById('clipCount').textContent),total:document.querySelectorAll('.clip-card').length}));
  assert.ok(s.hidden===0&&s.count===s.total,'All and All show every clip');
  await context.close();
 }

 // Thumbnails: full-size picture first, the standard picture when YouTube has no full-size one,
 // the game's own art when YouTube has neither.
 for(const [youtube,expect] of [['ok',/\/maxresdefault\.jpg$/],['tiny',/\/hqdefault\.jpg$/],['missing',/\/img\/games\/[^/]+$/]]){
  const {context,page}=await open({width:1600,height:900,youtube});
  await page.waitForTimeout(600);
  const src=await page.evaluate(()=>[...document.querySelectorAll('.clip-thumb img')].slice(0,3).map(i=>({src:i.currentSrc||i.src,w:i.naturalWidth})));
  assert.ok(src.every(i=>expect.test(i.src)&&i.w>120),`Thumbnails with YouTube ${youtube}: ${JSON.stringify(src)}`);
  await context.close();
 }
 console.log('CLIPS_CARDS=PASS 1600 and 390, motion and reduced motion: visible at rest, clean picture, readable sizes, player focus, filters, thumbnail fallbacks');
}finally{await browser.close();server.close();}
