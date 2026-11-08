#!/usr/bin/env node
// The News page (feature/news-live-feed, 8 Nov 2026).
//   - scripts/build_news.py turns the four feed shapes (RSS media:content, RSS img-in-description, RSS enclosure, Atom)
//     into stories: real links without tracking, newest first, one copy of each headline, old stories dropped, the largest
//     picture, http pictures made https, the site's featured games tagged from js/game-presets.js;
//   - the page draws one card per story, each linking to its own article in a new tab, each with its own picture (or the
//     game's art, or a plain panel), never the old placeholder pictures and never the same picture twice by accident;
//   - Your games and the source chips filter; the feed's age is shown; a feed that has not run and a failed load say so;
//   - no sideways scroll at 390, 820 and 1600; no picture or request to a host other than the page and the stories' own.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const FIX=resolve(root,'astrix-app/tools/fixtures/news');

/* 1. The builder, on the four sample feeds. */
const dir=await mkdtemp(join(tmpdir(),'news-'));
const out=join(dir,'news-feed.json');
const files=['ign','gamespot','pcgamer','polygon'].map(name=>join(FIX,`${name}-sample.xml`));
execFileSync('python3',[resolve(root,'scripts/build_news.py'),'--from-files',...files,'--out',out,'--now','2026-11-08T07:00:00Z'],{stdio:'pipe'});
const feed=JSON.parse(await readFile(out,'utf8'));
await rm(dir,{recursive:true,force:true});
const byTitle=Object.fromEntries(feed.items.map(item=>[item.title,item]));
assert.equal(feed.fetchedAt,'2026-11-08T07:00:00Z');
assert.deepEqual(Object.keys(feed.sources),['ign','gamespot','pcgamer','polygon'],'Four sources');
assert.equal(feed.items.length,6,'Six stories: the copied headline and the old story are left out');
assert.deepEqual(feed.items.map(item=>item.published),[...feed.items.map(item=>item.published)].sort().reverse(),'Newest first');
assert.equal(new Set(feed.items.map(item=>item.url)).size,feed.items.length,'Every link once');
assert.equal(new Set(feed.items.map(item=>item.title.toLowerCase())).size,feed.items.length,'Every headline once');
const aion=byTitle['Test story one: AION 2 adds a new region'];
assert.equal(aion.source,'ign','The first copy of a headline is kept');
assert.equal(aion.url,'https://ign.example.com/articles/aion-2-region','Tracking parameters taken off the link');
assert.equal(aion.image,'https://img.example.com/ign/big.jpg','The largest media:content picture');
assert.deepEqual(aion.games,['AION 2'],'AION 2 tagged');
assert.equal(aion.summary,'A test summary about AION 2.','Summary without markup');
assert.equal(byTitle['Test story two: hardware round-up'].image,'https://img.example.com/ign/hw.jpg','media:thumbnail, http made https');
assert.equal(byTitle['Test story three: Black Myth Wukong sequel teased'].image,'https://img.example.com/gs/wukong.jpg','Picture from the img in the description');
assert.deepEqual(byTitle['Test story three: Black Myth Wukong sequel teased'].games,['Black Myth: Wukong'],'"Wukong" alone finds Black Myth: Wukong');
assert.equal(byTitle['Test story four: The Division 2 season starts'].image,'https://img.example.com/pcg/div.jpg','Image enclosure');
assert.deepEqual(byTitle['Test story four: The Division 2 season starts'].games,['The Division 2']);
assert.equal(byTitle['Test story five: no picture at all'].image,'','No picture stays empty, never borrowed');
assert.deepEqual(byTitle['Test story five: no picture at all'].games,[]);
assert.equal(byTitle['Test story six: Destiny 2 roadmap'].published,'2026-11-06T01:00:00Z','Atom date in UTC');
assert.equal(byTitle['Test story six: Destiny 2 roadmap'].url,'https://polygon.example.com/destiny-2-roadmap','Atom link');
assert.ok(!feed.items.some(item=>/too old/.test(item.title)),'Stories older than three weeks drop off');
const DASH=/[–—]/;
for(const name of ['scripts/build_news.py','js/news-feed.js','pages/news.html','.github/workflows/news-feed.yml'])assert.ok(!DASH.test(await readFile(resolve(root,name),'utf8')),`No en or em dash in ${name}`);
const committed=JSON.parse(await readFile(resolve(root,'news-feed.json'),'utf8'));
assert.ok(Array.isArray(committed.items)&&'fetchedAt' in committed,'news-feed.json is in the repo in the page\'s shape');
console.log('ok builder: four feed shapes, links, dedupe, age, pictures, game tags');

/* 2. The page, with the built feed served as news-feed.json (dated two hours ago). */
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try{const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const browser=await chromium.launch();
const served=JSON.parse(JSON.stringify(feed));
const now=Date.now();
served.fetchedAt=new Date(now-2*3600e3).toISOString().replace(/\.\d+Z$/,'Z');
served.items.forEach((item,i)=>{item.published=new Date(now-(3+i*20)*3600e3).toISOString().replace(/\.\d+Z$/,'Z');});
// The Wukong story's picture fails: the card falls back to the game's own art.
const BROKEN='https://img.example.com/gs/wukong.jpg';
async function open(width,{body=JSON.stringify(served),status=200}={}){
  const context=await browser.newContext({viewport:{width,height:900}});
  const hosts=new Set();
  context.on('request',request=>{const host=new URL(request.url()).host;if(!host.startsWith('127.0.0.1'))hosts.add(host);});
  await context.route(/\/news-feed\.json/,route=>route.fulfill({status,contentType:'application/json',body}));
  await context.route(/img\.example\.com/,route=>route.request().url()===BROKEN?route.fulfill({status:404,body:''}):route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|img\.example\.com)/,route=>route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/pages/news.html`);
  await page.waitForFunction(()=>!document.querySelector('#newsGrid').hasAttribute('aria-busy'));
  await page.waitForTimeout(300);
  return {page,context,errors,hosts};
}
const cards=page=>page.$$eval('#newsGrid .news-card',nodes=>nodes.map(node=>({href:node.getAttribute('href'),target:node.target,rel:node.rel,source:node.dataset.source,
  title:node.querySelector('.news-card-title').textContent,img:node.querySelector('.news-card-img img')?.getAttribute('src')??null,plain:node.querySelector('.news-card-img').classList.contains('is-plain'),
  games:[...node.querySelectorAll('.news-card-game')].map(g=>g.textContent),lead:node.classList.contains('is-lead'),w:node.getBoundingClientRect().width})));

for(const width of [1600,820,390]){
  const {page,context,errors,hosts}=await open(width);
  let shown=await cards(page);
  assert.equal(shown.length,served.items.length,`${width}: one card per story`);
  assert.deepEqual(shown.map(card=>card.href),served.items.map(item=>item.url),`${width}: each card links to its own article, newest first`);
  assert.ok(shown.every(card=>card.target==='_blank'&&/noopener/.test(card.rel)),`${width}: articles open in a new tab`);
  assert.ok(!shown.some(card=>/placeholder/.test(card.img??'')),`${width}: never the old placeholder pictures`);
  const ownImages=shown.map(card=>card.img).filter(src=>src&&src.startsWith('https://'));
  assert.equal(new Set(ownImages).size,ownImages.length,`${width}: no picture used twice`);
  const wukong=shown.find(card=>/Wukong/.test(card.title));
  assert.match(wukong.img,/^\/img\/games\//,`${width}: a picture that fails falls back to the game's own art`);
  const noPicture=shown.find(card=>/no picture/.test(card.title));
  assert.ok(noPicture.plain&&!noPicture.img,`${width}: no picture and no game: a plain panel, never a borrowed picture`);
  assert.deepEqual(shown.find(card=>/AION 2/.test(card.title)).games,['AION 2'],`${width}: the game tag shows`);
  assert.ok(shown[0].lead,`${width}: the newest story leads`);
  if(width===1600)assert.ok(shown[0].w>shown[1].w*1.8,'1600: the lead story is twice the width');
  const statusText=await page.textContent('#newsStatus');
  assert.match(statusText,/^Updated 2 hours ago\./,`${width}: the feed's age is shown`);
  /* Filters. */
  await page.click('.news-filter[data-filter="games"]');
  shown=await cards(page);
  assert.deepEqual(shown.map(card=>card.href).sort(),served.items.filter(item=>item.games.length).map(item=>item.url).sort(),`${width}: Your games shows only stories about the site's games`);
  assert.equal(await page.getAttribute('.news-filter[data-filter="games"]','aria-pressed'),'true');
  await page.click('.news-filter[data-filter="pcgamer"]');
  shown=await cards(page);
  assert.ok(shown.length===2&&shown.every(card=>card.source==='pcgamer'),`${width}: a source chip shows that source`);
  await page.click('.news-filter[data-filter="polygon"]');
  assert.equal((await cards(page)).length,1);
  await page.click('.news-filter[data-filter="all"]');
  assert.equal((await cards(page)).length,served.items.length,`${width}: All brings every story back`);
  const sideways=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(sideways<=0,`${width}: no sideways scroll (${sideways})`);
  const looks=await page.$eval('#newsGrid .news-card',node=>{const s=getComputedStyle(node.querySelector('.news-card-title'));return {size:parseFloat(s.fontSize),img:node.querySelector('.news-card-img').getBoundingClientRect().height};});
  assert.ok(looks.size>=17&&looks.img>=150,`${width}: headlines readable and pictures big enough (${looks.size}px, ${looks.img}px)`);
  assert.deepEqual([...hosts].filter(host=>host!=='img.example.com'&&!/typekit|fonts|twitch|youtube/.test(host)),[],`${width}: no request to another host`);
  assert.deepEqual(errors,[],`${width}: no page errors`);
  await context.close();
}
console.log('ok page: cards, own links and pictures, fallbacks, lead story, filters, age, layout at 1600, 820 and 390');

/* 3. Honest states. */
{
  const {page,context}=await open(1600,{body:JSON.stringify({fetchedAt:null,sources:{},items:[]})});
  assert.equal(await page.locator('#newsGrid .news-card').count(),0,'Not run yet: no cards');
  assert.match(await page.textContent('#newsStatus'),/has not run yet/,'Not run yet: says so');
  await context.close();
}
{
  const {page,context}=await open(1600,{status:500,body:'{}'});
  assert.equal(await page.locator('#newsGrid .news-card').count(),0,'Failed load: no cards');
  assert.match(await page.textContent('#newsStatus'),/did not load/,'Failed load: says so');
  await context.close();
}
{
  const partial=JSON.parse(JSON.stringify(served));partial.sources.gamespot.status='failed';
  const {page,context}=await open(1600,{body:JSON.stringify(partial)});
  assert.match(await page.textContent('#newsStatus'),/GameSpot did not answer on the last update/,'A failed source is named');
  await context.close();
}
console.log('ok honest states: not run yet, failed load, a source that did not answer');
await browser.close();server.close();
console.log('NEWS_FEED=PASS');
