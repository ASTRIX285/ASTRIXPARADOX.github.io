// Shared X header on the public pages (Reviews, News, Clips, Join Us, The Hub), concept B, Oct 2026.
// Every page that carries #axPageHero is checked for what it looks like: map behind, four strobing slab
// edges, Acumin headline, no template eyebrow, fits the first screen, still under reduced motion.
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
const PAGES=[['pages/reviews.html','/pages/reviews.html'],['pages/news.html','/pages/news.html'],['pages/clips.html','/pages/clips.html'],['pages/join.html','/pages/join.html'],['hub/index.html','/hub/']];
const pages=PAGES.filter(([file])=>readFileSync(resolve(root,file),'utf8').includes('id="axPageHero"'));
assert.ok(pages.length>=1,'At least one public page carries the X header');
const css=readFileSync(resolve(root,'css/page-xheader.css'),'utf8');
assert.doesNotMatch(css,/[–—]/,'No dashes in the header styles');
for(const [file] of pages){
 const html=readFileSync(resolve(root,file),'utf8');
 assert.match(html,/<link rel="stylesheet" href="[^"]*css\/page-xheader\.css\?v=[^"]+">/,`${file} links the header styles`);
 const hero=html.slice(html.indexOf('id="axPageHero"'),html.indexOf('</section>',html.indexOf('id="axPageHero"')));
 assert.doesNotMatch(hero,/section-eyebrow|hero-eyebrow|style="/,`${file}: no eyebrow and no inline styles in the header`);
 assert.doesNotMatch(hero,/[–—·]/,`${file}: no dashes or dot chains in the header`);
}

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
 for(const [file,route] of pages){
  for(const [width,height] of [[1600,900],[390,844]]){
   for(const reducedMotion of ['no-preference','reduce']){
    const label=`${file} ${width}px ${reducedMotion}`;
    const context=await browser.newContext({viewport:{width,height},reducedMotion});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.fulfill({status:204,body:''}));
    const page=await context.newPage();
    await page.goto(`${base}${route}`);
    await page.waitForTimeout(reducedMotion==='reduce'?100:700);
    const r=await page.evaluate(()=>{
     const hero=document.getElementById('axPageHero');const cs=(e,p)=>getComputedStyle(e,p);
     const scene=[...hero.querySelectorAll('.ax-ph-scene')].find(s=>cs(s).display!=='none');
     const b=hero.getBoundingClientRect(),inner=hero.querySelector('h1').getBoundingClientRect(),nav=document.querySelector('nav').getBoundingClientRect();
     return {first:hero.previousElementSibling?.tagName==='NAV',
      map:cs(hero.querySelector('.ax-ph-map')).backgroundImage,bg:cs(hero).backgroundColor,
      viewBox:scene.getAttribute('viewBox'),edges:[...scene.querySelectorAll('.ax-ph-edge')].map(e=>cs(e).animationName),
      streaks:[...scene.querySelectorAll('.ax-ph-streak')].map(e=>cs(e).display),
      font:cs(hero.querySelector('h1')).fontFamily,size:parseFloat(cs(hero.querySelector('h1')).fontSize),
      height:b.height,innerTop:inner.top-nav.bottom,opacity:cs(hero.querySelector('.ax-ph-inner')).opacity,
      h1s:document.querySelectorAll('h1').length,scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    });
    assert.ok(r.first,`${label}: header comes straight after the nav`);
    assert.match(r.map,/astrix-paradox-map/,`${label}: map behind the header`);
    assert.notEqual(r.bg,'rgba(0, 0, 0, 0)',`${label}: header ground set`);
    assert.equal(r.viewBox,width<=768?'0 0 390 844':'0 0 1280 720',`${label}: right slabs for the width`);
    assert.equal(r.edges.length,4,`${label}: four slab edges`);
    assert.match(r.font,/acumin-pro-extra-condensed/,`${label}: headline in Acumin Extra Condensed`);
    assert.ok(r.size>=(width<=768?40:80),`${label}: headline ${r.size}px`);
    assert.ok(r.height>=400&&r.height<=Math.max(620,height*0.75),`${label}: header ${Math.round(r.height)}px`);
    assert.ok(r.innerTop>=24,`${label}: text clears the nav`);
    assert.equal(r.h1s,1,`${label}: one h1`);
    assert.equal(r.opacity,'1',`${label}: header complete at rest`);
    if(reducedMotion==='no-preference'){
     assert.ok(r.edges.every(n=>n==='ax-ph-strobe'),`${label}: edges strobe`);
     assert.ok(r.streaks.every(d=>d!=='none'),`${label}: light runs along the edges`);
    }else{
     assert.ok(r.edges.every(n=>n==='none'),`${label}: edges still`);
     assert.ok(r.streaks.every(d=>d==='none'),`${label}: streaks hidden`);
    }
    assert.equal(r.scrollX,0,`${label}: no horizontal page scroll`);
    await context.close();
   }
  }
 }
 console.log(`PAGE_XHEADER=PASS ${pages.map(p=>p[0]).join(', ')} at 1600 and 390, motion and reduced motion`);
}finally{await browser.close();server.close();}
