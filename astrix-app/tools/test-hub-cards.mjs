#!/usr/bin/env node
// The Hub full-bleed cards (design/hub-full-bleed-cards, 5 Oct 2026), checked on the rendered page:
//   - every tool card's art runs under the whole card height and most of its width, behind the copy;
//   - the copy sits on a dark backdrop (the card's ::before) that is darkest behind the text;
//   - the spare "Watch this space" card shows the brighter ASTRIX PARADOX share image behind the logo;
//   - no sideways scroll at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try {const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();

for(const [width,height] of [[1600,1000],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:204,body:''}));
  await page.goto(`${base}/hub/`);
  await page.waitForSelector('#hubCards .platform-card-active');
  const cards=await page.$$eval('#hubCards .platform-card-active',items=>items.map(card=>{
    const box=card.getBoundingClientRect(),art=card.querySelector('.platform-art'),artBox=art.getBoundingClientRect();
    const copy=card.querySelector('.platform-copy'),before=getComputedStyle(card,'::before');
    return {name:card.querySelector('h2').textContent,card:[box.width,box.height],art:[artBox.width,artBox.height,artBox.top-box.top],
      artPosition:getComputedStyle(art).position,artZ:Number(getComputedStyle(art).zIndex),copyZ:getComputedStyle(copy).position,
      backdrop:before.backgroundImage,backdropZ:Number(before.zIndex)};
  }));
  assert.ok(cards.length>=2,'Tool cards render');
  for(const card of cards){
    assert.equal(card.artPosition,'absolute',`${card.name}: art is a full-bleed layer`);
    assert.ok(card.artZ<card.backdropZ,`${card.name}: art sits under the backdrop`);
    assert.match(card.backdrop,/linear-gradient\(.*rgba\(6, 6, 6, 0\.9[0-9]*\)/,`${card.name}: dark backdrop behind the copy`);
    if(width>=1100){
      assert.ok(Math.abs(card.art[1]-card.card[1])<=2&&card.art[2]<=1,`${card.name}: art runs the full card height`);
      assert.ok(card.art[0]>=card.card[0]*0.65,`${card.name}: art runs under most of the card width`);
    } else {
      assert.ok(card.art[0]>=card.card[0]-2&&card.art[2]<=1,`${card.name}: art runs the full card width from the top`);
      assert.ok(card.art[1]>=card.card[1]*0.6,`${card.name}: art fills most of the stacked card`);
    }
  }
  const spare=await page.$eval('#hubCards .platform-card-coming',el=>getComputedStyle(el).backgroundImage);
  assert.match(spare,/img\/share\/astrix-paradox-share-1200x630\.jpg/,'Spare card shows the brighter ASTRIX PARADOX image');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=0,`The Hub scrolls sideways by ${overflow}px at ${width}`);
  await page.close();
}

await browser.close();
server.close();
console.log('HUB_FULL_BLEED_CARDS=PASS');
