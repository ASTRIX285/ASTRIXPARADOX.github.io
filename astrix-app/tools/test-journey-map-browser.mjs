// Public map integration test. No Bungie account, profile fixture or API key required.
// Requires Playwright + Chromium. Optional: JOURNEY_BROWSER_PATH and JOURNEY_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const harness=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/astrix-palette.css"><link rel="stylesheet" href="journey-2560-visual.css"><link rel="stylesheet" href="../../shared/astrix-desktop-density.css"><style>body{margin:12px;background:#090e15;color:#eee;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}.apx-loc-list{display:flex;flex-wrap:wrap;gap:8px}.apx-loc{padding:8px}#detail{margin-top:16px}</style>
<script src="../../shared/astrix-destination-theme.js"></script></head><body><main><div id="selector"></div><div id="detail"></div></main>
<script type="module">
import {initLocationSelector} from '../../shared/astrix-location-selector.mjs';
import {initJourneyLocationMaps,publishJourneyRegionChestProgress,publishJourneyDestinationData} from './journey-location-maps.mjs';
ForgeDestinations.set('nessus',{persist:false});
initLocationSelector({mount:document.querySelector('#selector'),detail:document.querySelector('#detail')});
window.publishChests=publishJourneyRegionChestProgress;window.publishData=publishJourneyDestinationData;
window.ready=initJourneyLocationMaps(document.querySelector('#detail'));
</script></body></html>`;
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.endsWith('/__map-test.html')){res.setHeader('Content-Type','text/html');res.end(harness);return;}
  const path=resolve(root,'.'+decodeURIComponent(pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.JOURNEY_BROWSER_PATH?{executablePath:process.env.JOURNEY_BROWSER_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}/astrix-app/pages/journey/__map-test.html`);
  await page.evaluate(()=>window.ready);
  await page.waitForFunction(()=>document.querySelector('.journey-map-point-count')?.textContent.startsWith('61 points'));
  assert.equal(await page.locator('.journey-map-image').evaluate(image=>image.naturalWidth),3840);
  assert(!requests.some(url=>url.includes('-6k.webp')),'6K must stay lazy until zoom');
  const search=page.getByRole('searchbox');
  await search.fill('Inverted Spire');
  assert.equal(await page.locator('.journey-map-point-list button').count(),1);
  await page.locator('.journey-map-point-list button').click();
  await page.waitForFunction(()=>document.querySelector('.journey-map-image')?.naturalWidth===5760);
  assert.match(await page.locator('.journey-map-point-details h4').innerText(),/Inverted Spire/);
  assert.equal(await page.locator('.journey-map-zoom').innerText(),'200%');
  const viewport=page.locator('.journey-map-viewport');
  await viewport.focus();await viewport.press('0');await viewport.press('+');
  assert.equal(await page.locator('.journey-map-zoom').innerText(),'125%');
  await viewport.press('ArrowLeft');
  assert(!await page.locator('.journey-map-stage').evaluate(node=>node.style.transform.startsWith('translate3d(0px, 0px')));
  await viewport.press('0');
  await page.locator('.journey-map-marker').focus();await page.locator('.journey-map-marker').press('Enter');
  assert.match(await page.locator('.journey-map-point-details h4').innerText(),/Inverted Spire/);
  assert(!await viewport.evaluate(node=>node.classList.contains('is-dragging')));
  await search.fill('no such activity');assert.equal(await page.locator('.journey-map-point-list button').count(),0);
  await search.fill('');
  for(const key of ['edz','moon','europa','dreaming-city','throne-world','neomuna','pale-heart','kepler','cosmodrome']){
    await page.evaluate(key=>ForgeDestinations.set(key,{persist:false}),key);
    await page.waitForFunction(key=>document.querySelector(`[data-map-key="${key}"]`)?.dataset.renderComplete==='ready',key);
    await page.waitForFunction(()=>!document.querySelector('.journey-map-point-count')?.textContent.includes('loading'));
    assert.equal(await page.locator('.journey-location-map').count(),1);
    assert(await page.locator('.journey-map-point-list button').count()>0);
    assert.equal(await page.locator('.journey-map-image').evaluate(image=>image.naturalWidth),key==='pale-heart'?5760:3840);
    assert.equal(await page.locator('.journey-map-zoom').innerText(),key==='pale-heart'?'200%':'100%');
    if(key==='pale-heart'){
      const ratio=await page.locator('.journey-map-viewport').evaluate(node=>node.clientWidth/node.clientHeight);
      assert(Math.abs(ratio-16/9)<.01,'Pale Heart frame must match the other maps');
      await page.getByRole('button',{name:'Zoom in',exact:true}).click();
      await page.getByRole('button',{name:'RESET',exact:true}).click();
      assert.equal(await page.locator('.journey-map-zoom').innerText(),'200%');
      await page.locator('.journey-map-viewport').press('-');
      await page.locator('.journey-map-viewport').press('0');
      assert.equal(await page.locator('.journey-map-zoom').innerText(),'200%');
    }
  }
  await page.evaluate(()=>publishChests({key:'cosmodrome',total:1,discovered:0,chests:[{name:'Test regional chest',location:'The Steppes',collected:false}]}));
  await page.getByRole('combobox').selectOption('chest');
  await page.locator('.journey-map-point-list button').click();
  assert.equal(await page.locator('.journey-map-completion').innerText(),'Not collected');
  assert.equal(await page.locator('.journey-map-position-note').innerText(),'Map position unavailable.');
  await page.evaluate(()=>publishData({key:'cosmodrome',loading:true,sections:{}}));
  assert.equal(await page.locator('[data-region-chest-total]').innerText(),'--');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>ForgeDestinations.set('edz',{persist:false}));
  await page.waitForFunction(()=>document.querySelector('[data-map-key="edz"]')?.dataset.renderComplete==='ready');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must not overflow horizontally');
  if(process.env.JOURNEY_SCREENSHOT_DIR){
    await mkdir(process.env.JOURNEY_SCREENSHOT_DIR,{recursive:true});
    await page.screenshot({path:resolve(process.env.JOURNEY_SCREENSHOT_DIR,'journey-maps-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1100});
    await page.screenshot({path:resolve(process.env.JOURNEY_SCREENSHOT_DIR,'journey-maps-desktop.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  // Prompt 24: a fresh module graph receives missing/failed/successful icon fixtures.
  const fixturePage=await browser.newPage({viewport:{width:1363,height:1080}});
  const points=['chest','lost-sector','activity','vendor','landing'].map((type,i)=>({id:`missing-${i}`,type,name:`Fixture ${type}`,position:{x:10+i*15,y:30},variants:[]}));
  points.push({id:'loaded',type:'activity',name:'Bungie image',position:{x:30,y:65},icon:'/common/destiny2_content/icons/fixture_loaded.png',variants:[]},
    {id:'failed',type:'vendor',name:'Failed Bungie image',position:{x:65,y:65},icon:'/common/destiny2_content/icons/fixture_failed.png',variants:[]},
    {id:'unknown',type:'unknown',name:'Unknown type',position:{x:50,y:50},variants:[]},
    {id:'unpositioned',type:'activity',name:'No position',position:null,variants:[]});
  await fixturePage.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/assets/map-data/nessus.mjs'))return route.fulfill({contentType:'text/javascript',body:`export default ${JSON.stringify({key:'nessus',entries:points})}`});
    if(url.hostname==='www.bungie.net')return url.pathname.endsWith('fixture_loaded.png')
      ?route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')})
      :route.fulfill({status:404,body:''});
    return route.continue();
  });
  await fixturePage.goto(`http://127.0.0.1:${server.address().port}/astrix-app/pages/journey/__map-test.html`);
  await fixturePage.evaluate(()=>window.ready);
  await fixturePage.waitForFunction(()=>document.querySelectorAll('.journey-map-marker').length===7);
  await fixturePage.waitForFunction(()=>document.querySelector('[data-marker-key="loaded"] img')?.naturalWidth>0&&!document.querySelector('[data-marker-key="failed"] img'));
  for(const width of [1363,2560]){
    await fixturePage.setViewportSize({width,height:1080});
    const markers=await fixturePage.locator('.journey-map-marker').evaluateAll(nodes=>nodes.map(node=>({
      name:node.getAttribute('aria-label'),title:node.title,
      visibleIcon:[...node.querySelectorAll('.journey-map-marker-icon>img,.journey-map-marker-icon>svg')].some(icon=>getComputedStyle(icon).display!=='none'&&(icon.tagName.toLowerCase()==='svg'?!!icon.querySelector('path[d]'):icon.complete&&icon.naturalWidth>0))
    })));
    assert.equal(markers.length,7,'Unknown or unpositioned markers are not drawn');
    for(const marker of markers){assert.equal(marker.visibleIcon,true,'Every marker has a visible image or glyph');assert.ok(marker.name);assert.equal(marker.title,marker.name);}
    assert.equal(await fixturePage.locator('[data-marker-key="failed"] svg:visible').count(),1);
    assert.equal(await fixturePage.locator('[data-marker-key="loaded"] img:visible').count(),1);
    await fixturePage.evaluate(()=>publishChests({key:'nessus',total:3,discovered:1,chests:[
      {name:'Chest 1',location:'Fixture',collected:false},{name:'Chest 2',location:'Fixture',collected:true},{name:'Chest 3',location:'Fixture',collected:null}
    ]}));
    assert.equal(await fixturePage.locator('.journey-region-chest.is-missing .journey-region-chest-tick').innerText(),'○');
    assert.equal(await fixturePage.locator('.journey-region-chest.is-collected .journey-region-chest-tick').innerText(),'✓');
    const contrast=await fixturePage.locator('.journey-region-chest-copy b,.journey-region-chest-copy small,.journey-region-chests-summary strong,.journey-region-chests-summary small').evaluateAll(nodes=>nodes.map(node=>{
      const channels=value=>value.match(/[\d.]+/g).map(Number);
      const lum=values=>values.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const style=getComputedStyle(node),panel=node.closest('.journey-region-chests'),background=channels(getComputedStyle(panel).backgroundColor),foreground=channels(style.color);
      const light=lum(foreground),dark=lum(background);let effects=false;
      for(let element=node;element;element=element.parentElement){const computed=getComputedStyle(element);if(computed.filter!=='none'||computed.textShadow!=='none')effects=true;if(element===panel)break;}
      return {ratio:(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05),alpha:background[3]??1,textAlpha:foreground[3]??1,effects};
    }));
    assert.equal(contrast.length,12);
    for(const row of contrast){assert.equal(row.alpha,1);assert.equal(row.textAlpha,1);assert.ok(row.ratio>=4.5,JSON.stringify(row));assert.equal(row.effects,false);}
  }
  await fixturePage.close();
  console.log('JOURNEY_MAP_BROWSER=PASS switching, 4K/6K, search, keyboard, filters, chest reset, mobile');
}catch(error){if(/Executable doesn't exist/.test(error.message))console.error('NOT RUN: Chromium missing');throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
