#!/usr/bin/env node
// The Hub (3 Oct 2026). The Tools page moved to /hub/; every old /tools/ link lands there.
// The local server behaves like GitHub Pages: a folder path without its trailing slash gets a 301 to
// the slash path, keeping the query string. Checks, at 390, 820 and 1600:
//   - /tools/, /tools and /tools/?x=1#top end on /hub/ (keeping ?x=1 and #top) with no 404;
//   - the redirect page shows no text while it leaves (no visible flash);
//   - The Hub shows The Forge (Enter The Forge, unchanged route), WorkBench (Coming soon, disabled,
//     no link) and the future slot; its logo links to "/"; no sideways scroll.
// Writes screenshots when HUB_RENDER_DIR is set (outside the repo).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.json':'application/json','.webmanifest':'application/manifest+json'};
const statuses=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname),file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  try{
    const info=await stat(file);
    if(info.isDirectory()&&!path.endsWith('/')){statuses.push([path,301]);res.writeHead(301,{Location:`${path}/${url.search}`}).end();return;}
    const target=info.isDirectory()?resolve(file,'index.html'):file;
    const body=await readFile(target);statuses.push([path,200]);
    res.setHeader('Content-Type',types[extname(target)]||'application/octet-stream');res.end(body);
  }catch{statuses.push([path,404]);res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,shots=process.env.HUB_RENDER_DIR||'';
  // The redirect page itself paints nothing readable while it leaves.
  {
    const page=await browser.newPage();await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.setContent(await readFile(resolve(root,'tools/index.html'),'utf8').then(html=>html.replace(/<script>[\s\S]*?<\/script>/,'').replace(/<meta http-equiv="refresh"[^>]*>/,'')));
    assert.equal((await page.locator('body').innerText()).trim(),'','With scripts on, the redirect page shows no text (no visible flash)');
    await page.close();
  }
  for(const width of [390,820,1600]){
    for(const [from,search,hash] of [['/tools/','',''],['/tools','',''],['/tools/?x=1#top','?x=1','#top'],['/tools?x=1','?x=1','']]){
      const page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:1000}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      statuses.length=0;
      await page.goto(origin+from);
      await page.waitForURL(url=>url.pathname==='/hub/');
      const url=new URL(page.url());
      assert.equal(url.pathname+url.search+url.hash,`/hub/${search}${hash}`,`${width} ${from}: lands on /hub/ keeping the query and hash`);
      assert.deepEqual(statuses.filter(([,status])=>status===404).map(([path])=>path),[],`${width} ${from}: no 404`);
      assert.ok(statuses.some(([path,status])=>path==='/hub/'&&status===200),`${width} ${from}: /hub/ served`);
      if(from==='/tools/'){
        const cards=await page.locator('#hubCards > article').evaluateAll(nodes=>nodes.map(node=>({name:node.querySelector('h2')?.textContent||'',future:node.classList.contains('platform-card-coming'),
          link:node.querySelector('a.forge-entry-link')?.getAttribute('href')||null,linkText:node.querySelector('.forge-entry-link')?.textContent||'',
          disabled:node.querySelector('button.forge-entry-link')?.disabled??null,status:node.querySelector('.platform-status')?.textContent||'',anyLink:node.querySelectorAll('a').length})));
        assert.equal(cards.length,3,`${width}: one card per tool and the future slot`);
        assert.deepEqual(cards[0],{name:'The Forge',future:false,link:'../astrix-app/pages/home/',linkText:'Enter The Forge',disabled:null,status:'',anyLink:2},`${width}: The Forge card`);
        assert.deepEqual(cards[1],{name:'WorkBench',future:false,link:null,linkText:'Enter WorkBench',disabled:true,status:'Coming soon',anyLink:0},`${width}: WorkBench is coming soon, disabled, no link`);
        assert.ok(cards[2].future,`${width}: the future slot card`);
        assert.equal(await page.title(),'The Hub | ASTRIX PARADOX');
        assert.equal((await page.locator('.nav-links a.active').textContent()).trim(),'The Hub');
        assert.equal(await page.locator('.nav-logo').getAttribute('href'),'/','The logo links to "/"');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: no sideways scroll`);
        assert.doesNotMatch(await page.locator('body').innerText(),/—|–/,'No em or en dashes');
        // Cards fade in on scroll (site reveal): scroll through, then every card is visible.
        await page.evaluate(async()=>{for(const card of document.querySelectorAll('#hubCards > article')){card.scrollIntoView({behavior:'instant',block:'center'});await new Promise(done=>setTimeout(done,250));}window.scrollTo({top:0,behavior:'instant'});});
        await page.waitForTimeout(900);
        assert.deepEqual(await page.locator('#hubCards > article').evaluateAll(nodes=>nodes.map(node=>Number(getComputedStyle(node).opacity))),[1,1,1],`${width}: every card is visible after scrolling`);
        if(shots)await page.screenshot({path:resolve(shots,`hub-${width}.png`),fullPage:true});
      }
      assert.deepEqual(errors,[],`${width} ${from}: page errors`);
      await page.close();
    }
  }
  console.log('HUB_REDIRECT=PASS /tools/, /tools, /tools/?x=1#top and /tools?x=1 land on /hub/ keeping query and hash, no 404, no visible flash; The Hub shows The Forge (Enter The Forge, unchanged route), WorkBench (Coming soon, disabled, no link) and the future slot; logo links to "/"; 390, 820 and 1600');
}finally{
  await browser?.close();server.close();
}
