#!/usr/bin/env node
// Atreia Atlas, The Aetherium's map at /hub/aetherium/map/ (feature/aetherium-map-foundation, 28 Oct 2026), on a local
// static server:
//   - data: zones.json, layers.json and markers.json pass the Atlas checks; the checks reject a marker with a bad zone, a bad
//     layer, x or y outside 0 to 1, or no provenance (engine/atlas-data.mjs, and the JSON schema when ajv is installed);
//   - the page draws both zones from the picker and remembers the pick on the device; a zone with no capture yet (both, on
//     28 Oct 2026) says so in the map area, asks for no map image and keeps the zoom buttons off;
//   - with a test-only zones fixture that has a drawn image: the base map loads after the page is ready, and pan and zoom work
//     by mouse (drag, wheel), by keyboard (arrows, + and -) and by the zoom buttons;
//   - the layer panel: one toggle per layer in order with its icon and a count of 0, the empty state in the panel, no marker
//     drawn on the map;
//   - the marker card renders from a test-only fixture (title, layer, note, level, the Reported tag only when reported);
//   - layout at 390, 820 and 1600: no sideways scroll, the map fills the space down to the footer, the panel is a bottom
//     sheet at 390;
//   - no request leaves the site except the site's font host (use.typekit.net, as every page): none to NCSOFT or any other.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.svg':'image/svg+xml'};
const json=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const DATA='astrix-app/games/aion2/data/map/';
const PAGE='/hub/aetherium/map/';
const LAYERS=['hidden-cube','empyrean-trace','kibelisk','gathering','named-monster','dungeon-entrance','rift'];
const FONT_HOSTS=new Set(['use.typekit.net','p.typekit.net']);

/* Data. */
const zones=await json(`${DATA}zones.json`),layers=await json(`${DATA}layers.json`),markers=await json(`${DATA}markers.json`);
const fixture=await json('astrix-app/tools/fixtures/aion2/atlas-markers.json');
const {atlasProblems}=await import(pathToFileURL(resolve(root,'astrix-app/games/aion2/engine/atlas-data.mjs')).href);
assert.deepEqual(atlasProblems({zones,layers,markers}),[],'The real Atlas data passes');
assert.deepEqual(zones.records.map(zone=>zone.id).sort(),['altgard','verteron'],'Verteron and Altgard only');
assert.deepEqual(layers.layers.map(layer=>layer.id),LAYERS,'Layer order');
assert.deepEqual(markers.records,[],'No markers yet');
assert.deepEqual(atlasProblems({zones,layers,markers:fixture}),[],'The fixture is valid');
const zonesFixture=await json('astrix-app/tools/fixtures/aion2/atlas-zones.json');
assert.deepEqual(atlasProblems({zones:zonesFixture,layers,markers}),[],'The zones fixture is valid');
assert.ok(atlasProblems({zones:{records:[{id:'half',name:'Half',faction:'elyos',image:'/x.webp'}]},layers,markers}).length>0,'A capture without its size and provenance is rejected');
const good=fixture.records[0];
const bad={
  zone:{...good,id:'bad-zone',zone:'atlantis'},
  layer:{...good,id:'bad-layer',layer:'treasure'},
  x:{...good,id:'bad-x',x:1.2},
  y:{...good,id:'bad-y',y:-0.1},
  provenance:(({provenance,...rest})=>({...rest,id:'no-provenance'}))(good),
  where:{...good,id:'no-where',provenance:{capturedBy:'test',capturedOn:'2026-10-28'}}
};
for(const [what,marker] of Object.entries(bad)){
  const problems=atlasProblems({zones,layers,markers:{records:[marker]}});
  assert.ok(problems.length>0,`The checks reject a marker with a bad ${what}`);
}
let Ajv2020,addFormats;
try{Ajv2020=require('ajv/dist/2020.js');addFormats=require('ajv-formats');}catch{console.log('AETHERIUM_MAP schema check skipped (run npm install --prefix astrix-app)');}
if(Ajv2020){
  const ajv=new (Ajv2020.default??Ajv2020)({allErrors:true,strict:true});
  (addFormats.default??addFormats)(ajv);
  const validate=ajv.compile(await json('astrix-app/games/aion2/schema/atlas-markers.schema.json'));
  assert.ok(validate(fixture),`Fixture matches the schema: ${ajv.errorsText(validate.errors)}`);
  for(const what of ['x','y','provenance','where'])assert.equal(validate({records:[bad[what]]}),false,`The schema rejects a marker with a bad ${what}`);
}
console.log('ok data and the marker checks');

/* Pages. */
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try {const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
let failed=false;
const open=async({width=1600,height=900,fixtureZones=false}={})=>{
  const context=await browser.newContext({viewport:{width,height}});
  const outside=[],mapRequests=[];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{outside.push(new URL(route.request().url()).hostname);route.fulfill({status:204,body:''});});
  if(fixtureZones)await context.route(/\/data\/map\/zones\.json$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(zonesFixture)}));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/images\/map\/|section-heroes\/world\.jpg/.test(request.url()))mapRequests.push(request.url());});
  await page.goto(base+PAGE);
  await page.waitForSelector('html[data-aetherium-ready="true"]');
  return {context,page,errors,outside,mapRequests};
};
const view=page=>page.$eval('#aeAtlasView',el=>({scale:Number(el.dataset.scale),zoom:Number(el.dataset.zoom),tx:Number(el.dataset.tx),ty:Number(el.dataset.ty)}));
const mapLoaded=page=>page.waitForFunction(()=>{const img=document.querySelector('#aeAtlasImage');return img.getAttribute('src')&&img.complete&&img.naturalWidth>0;});

try {
  /* The real data: both zones, each with its map shown as not captured yet (or drawn, once a capture is in). */
  await (async()=>{
    const {context,page,errors,outside,mapRequests}=await open();
    const groups=await page.$$eval('.ae-atlas-group',nodes=>nodes.map(node=>({name:node.querySelector('.ae-atlas-group-name').textContent,zones:[...node.querySelectorAll('button.ae-atlas-zone')].map(b=>b.textContent)})));
    assert.deepEqual(groups,[{name:'Elyos',zones:['Verteron']},{name:'Asmodian',zones:['Altgard']}],'Zone picker groups');
    for(const zone of zones.records){
      await page.click(`.ae-atlas-zone[data-zone="${zone.id}"]`);
      const shown=await page.evaluate(()=>({zone:document.body.dataset.zone,title:document.querySelector('#aeAtlasTitle').textContent,pressed:document.querySelector('.ae-atlas-zone[aria-pressed="true"]').dataset.zone,
        pending:document.querySelector('#aeAtlasPending').hidden?null:document.querySelector('#aeAtlasPending').textContent,pendingInMap:Boolean(document.querySelector('#aeAtlasPending').closest('#aeAtlasView')),
        src:document.querySelector('#aeAtlasImage').getAttribute('src'),tools:[...document.querySelectorAll('.ae-atlas-tool')].map(b=>b.disabled)}));
      assert.equal(shown.zone,zone.id);assert.equal(shown.title,zone.name);assert.equal(shown.pressed,zone.id);
      if(zone.image){
        await mapLoaded(page);
        assert.equal(shown.pending,null,`${zone.id}: no pending line once captured`);
      }else{
        assert.equal(shown.pending,`The map of ${zone.name} is not captured yet. It goes up here as soon as we have it from in game.`,`${zone.id}: says its map is not captured yet`);
        assert.ok(shown.pendingInMap,`${zone.id}: the pending line sits in the map area`);
        assert.equal(shown.src,null,`${zone.id}: no image drawn`);
        assert.deepEqual(shown.tools,[true,true,true],`${zone.id}: zoom buttons off`);
      }
    }
    await page.reload();
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    assert.equal(await page.evaluate(()=>document.body.dataset.zone),zones.records.at(-1).id,'The last zone is remembered');
    await page.waitForTimeout(400);
    if(!zones.records.some(zone=>zone.image))assert.deepEqual(mapRequests,[],'No map image asked for while no zone is captured');
    assert.deepEqual(errors,[],'No page errors');
    assert.deepEqual([...new Set(outside)].filter(host=>!FONT_HOSTS.has(host)),[],`No request to another host (${[...new Set(outside)].join(', ')})`);
    await context.close();
    console.log('ok zones from the real data');
  })();

  /* A drawn map, from the test-only zones fixture. */
  await (async()=>{
    const {context,page,errors,outside}=await open({fixtureZones:true});
    const drawn=zonesFixture.records.find(zone=>zone.image);
    await page.click(`.ae-atlas-zone[data-zone="${drawn.id}"]`);
    await mapLoaded(page);
    const shown=await page.evaluate(()=>({src:document.querySelector('#aeAtlasImage').getAttribute('src'),stage:document.querySelector('#aeAtlasStage').style.width,pending:document.querySelector('#aeAtlasPending').hidden}));
    assert.equal(shown.src,drawn.image,'The fixture zone draws its image');
    assert.equal(shown.stage,`${drawn.width}px`,'The stage is the base map size');
    assert.equal(shown.pending,true,'No pending line on a drawn zone');
    const box=await page.$eval('#aeAtlasImage',img=>{const r=img.getBoundingClientRect();return {w:r.width,h:r.height};});
    assert.ok(box.w>300&&box.h>100,`The map is drawn (${Math.round(box.w)}x${Math.round(box.h)})`);

    /* Pan and zoom. */
    const fit=await view(page);
    assert.equal(fit.zoom,1,'Starts fitted');
    const centre=await page.$eval('#aeAtlasView',el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
    await page.mouse.move(centre.x,centre.y);
    await page.mouse.wheel(0,-400);
    await page.waitForFunction(z=>Number(document.querySelector('#aeAtlasView').dataset.zoom)>z,fit.zoom);
    const wheeled=await view(page);
    assert.ok(wheeled.zoom>1.2,`Wheel zooms in (${wheeled.zoom})`);
    await page.mouse.move(centre.x,centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x+120,centre.y+80,{steps:6});
    await page.mouse.up();
    const dragged=await view(page);
    assert.ok(Math.abs(dragged.tx-wheeled.tx)>20||Math.abs(dragged.ty-wheeled.ty)>20,'Drag pans the map');
    await page.focus('#aeAtlasView');
    await page.keyboard.press('+');
    const plus=await view(page);
    assert.ok(plus.scale>dragged.scale,'+ zooms in');
    await page.keyboard.press('ArrowRight');
    const right=await view(page);
    assert.ok(right.tx<plus.tx,'Arrow right moves the view right');
    await page.keyboard.press('ArrowDown');
    assert.ok((await view(page)).ty<right.ty,'Arrow down moves the view down');
    await page.keyboard.press('-');
    assert.ok((await view(page)).scale<plus.scale,'- zooms out');
    await page.click('#aeAtlasZoomIn');
    const button=await view(page);
    await page.click('#aeAtlasZoomOut');
    assert.ok((await view(page)).scale<button.scale,'Zoom buttons');
    await page.click('#aeAtlasFit');
    assert.equal((await view(page)).zoom,1,'Fit shows the whole zone');
    for(let i=0;i<20;i++)await page.keyboard.press('-');
    assert.equal((await view(page)).zoom,1,'Never zooms out past the whole zone');

    /* Layer panel. */
    const panel=await page.$$eval('.ae-atlas-layer',nodes=>nodes.map(node=>({layer:node.dataset.layer,pressed:node.getAttribute('aria-pressed'),tag:node.tagName,icon:node.querySelector('img.ae-atlas-icon')?.getAttribute('src'),iconW:node.querySelector('img.ae-atlas-icon')?.getBoundingClientRect().width,count:node.querySelector('.ae-atlas-count').textContent,label:node.querySelector('b').textContent})));
    assert.deepEqual(panel.map(item=>item.layer),LAYERS,'One toggle per layer, in order');
    for(const item of panel){
      assert.equal(item.tag,'BUTTON');assert.equal(item.pressed,'true');assert.equal(item.count,'0',`${item.layer}: count 0`);
      assert.ok(item.icon.endsWith(`atlas-layers.svg#${item.layer}`),`${item.layer}: its own icon`);
      assert.ok(item.iconW>=30,`${item.layer}: icon drawn`);
    }
    const iconsLoaded=await page.$$eval('.ae-atlas-layer img',imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0));
    assert.ok(iconsLoaded,'Layer icons load');
    await page.click('.ae-atlas-layer[data-layer="rift"]');
    assert.equal(await page.getAttribute('.ae-atlas-layer[data-layer="rift"]','aria-pressed'),'false','A toggle turns a layer off');
    const iconOpacity=await page.$eval('.ae-atlas-layer[data-layer="rift"] img',img=>getComputedStyle(img).opacity);
    assert.ok(Number(iconOpacity)<1,'An off layer dims its icon');
    await page.click('.ae-atlas-layer[data-layer="rift"]');
    assert.equal(await page.getAttribute('.ae-atlas-layer[data-layer="rift"]','aria-pressed'),'true','And on again');
    const looks=await page.$eval('.ae-atlas-layer',el=>{const s=getComputedStyle(el);return {radius:parseFloat(s.borderTopLeftRadius),bg:s.backgroundImage,shadow:s.boxShadow};});
    assert.ok(looks.radius>=12&&looks.bg.includes('gradient')&&looks.shadow!=='none','Layer toggles are the AION 2 cylinder buttons');
    const empty=await page.evaluate(()=>{const el=document.querySelector('#aeAtlasEmpty');return {text:el.textContent,visible:!el.hidden&&el.getBoundingClientRect().height>0,inPanel:Boolean(el.closest('#aeAtlasPanel')),overMap:Boolean(el.closest('#aeAtlasView'))};});
    assert.deepEqual(empty,{text:'No markers captured for this zone yet.',visible:true,inPanel:true,overMap:false},'Empty state in the panel');
    assert.equal(await page.locator('#aeAtlasMarkers > *').count(),0,'No marker drawn');
    assert.equal(await page.locator('#aeAtlasView [data-marker]').count(),0,'No marker anywhere on the map');

    /* The marker card, from the test-only fixture. */
    const cards=await page.evaluate(async({fixture,layers})=>{
      const {markerCardHtml}=await import('/astrix-app/pages/aetherium/atlas-card.mjs');
      const slot=document.querySelector('#aeAtlasCard');
      return fixture.records.map(marker=>{
        slot.innerHTML=markerCardHtml(marker,layers.find(layer=>layer.id===marker.layer));
        const card=slot.querySelector('.ae-atlas-card'),tag=card.querySelector('.ae-atlas-tag');
        const r=card.getBoundingClientRect(),p=document.querySelector('#aeAtlasPanel').getBoundingClientRect();
        return {id:card.dataset.marker,title:card.querySelector('h3').textContent,layer:card.querySelector('.ae-atlas-card-layer').firstChild.textContent,
          icon:card.querySelector('img.ae-atlas-icon')?.getAttribute('src'),note:card.querySelector('.ae-atlas-card-note')?.textContent??null,
          level:card.querySelector('.ae-atlas-card-level')?.textContent??null,where:card.querySelector('.ae-atlas-card-where')?.textContent??null,
          tag:tag?.textContent??null,tagBg:tag?getComputedStyle(tag).backgroundImage:null,inside:r.left>=p.left-1&&r.right<=p.right+1,height:r.height};
      });
    },{fixture,layers:layers.layers});
    assert.deepEqual(cards.map(({tagBg,inside,height,...rest})=>rest),[
      {id:'fixture-confirmed',title:'Fixture Named Monster',layer:'Named monsters',icon:'/astrix-app/pages/aetherium/icons/atlas-layers.svg#named-monster',note:'Test note for the card.',level:'Lv 12',where:'1234, 568',tag:null},
      {id:'fixture-reported',title:'Fixture Hidden Cube',layer:'Hidden Cubes',icon:'/astrix-app/pages/aetherium/icons/atlas-layers.svg#hidden-cube',note:null,level:null,where:null,tag:'Reported'}
    ],'Marker card from the fixture');
    assert.ok(cards[1].tagBg.includes('gradient'),'The Reported tag is drawn as a tag');
    assert.ok(cards.every(card=>card.inside&&card.height>40),'The card sits inside the panel');
    await page.evaluate(()=>{document.querySelector('#aeAtlasCard').innerHTML='';});

    assert.deepEqual(errors,[],'No page errors');
    assert.deepEqual([...new Set(outside)].filter(host=>!FONT_HOSTS.has(host)),[],`No request to another host (${[...new Set(outside)].join(', ')})`);
    await context.close();
    console.log('ok drawn map, pan and zoom, layers, empty state, marker card, hosts');
  })();

  /* The base map waits for the page to be ready. */
  await (async()=>{
    const context=await browser.newContext({viewport:{width:1600,height:900}});
    let readyAt=null,mapAt=null;
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:204,body:''}));
    await context.route(/\/data\/map\/zones\.json$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(zonesFixture)}));
    const page=await context.newPage();
    page.on('request',request=>{if(/\/images\/map\/|section-heroes\/world\.jpg/.test(request.url())&&mapAt===null)mapAt=Date.now();});
    await page.exposeFunction('__aeTestReady',()=>{readyAt??=Date.now();});
    await page.addInitScript(()=>{try{localStorage.setItem('ae-atlas-zone','verteron');}catch{}document.addEventListener('forge:portal-ready',()=>window.__aeTestReady());});
    await page.goto(base+PAGE);
    await mapLoaded(page);
    assert.ok(readyAt!==null&&mapAt!==null&&mapAt>=readyAt,'The base map is asked for after the page is ready');
    await context.close();
    console.log('ok base map after ready');
  })();

  /* Layout at three widths. */
  for(const [width,height] of [[1600,900],[820,1180],[390,844]]){
    const {context,page,errors}=await open({width,height});
    if(zones.records.some(zone=>zone.id===zones.records.at(-1).id&&zone.image))await mapLoaded(page);
    const layout=await page.evaluate(()=>{
      const doc=document.documentElement;
      const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top+scrollY,bottom:r.bottom+scrollY,left:r.left,right:r.right,height:r.height,width:r.width};};
      const panel=document.querySelector('#aeAtlasPanel');
      const wide=[...document.querySelectorAll('body *')].filter(node=>!node.closest('#aeAtlasStage')&&!node.closest('.ae-skip')&&!node.closest('#aeDrawer')&&node.getBoundingClientRect().right>doc.clientWidth+1).map(node=>node.id||node.className||node.tagName);
      return {overflow:doc.scrollWidth-doc.clientWidth,wide:wide.slice(0,5),map:box('#aeAtlasView'),footer:box('.ae-footer'),panel:box('#aeAtlasPanel'),panelPos:getComputedStyle(panel).position,viewport:innerHeight,zone:document.body.dataset.zone,src:document.querySelector('#aeAtlasImage').getAttribute('src')};
    });
    assert.ok(layout.overflow<=0,`${width}: no sideways scroll (${layout.overflow}px)`);
    assert.deepEqual(layout.wide,[],`${width}: nothing past the right edge`);
    assert.ok(layout.map.height>=300,`${width}: the map is tall enough (${layout.map.height})`);
    assert.ok(layout.map.bottom<=layout.footer.top+1,`${width}: the map ends above the footer`);
    assert.ok(layout.footer.top-layout.map.bottom<=80,`${width}: the map fills down to the footer (${Math.round(layout.footer.top-layout.map.bottom)}px gap)`);
    if(width===390){
      assert.equal(layout.panelPos,'fixed','390: the layer panel is a bottom sheet');
      const sheet=await page.evaluate(()=>{const r=document.querySelector('#aeAtlasPanel').getBoundingClientRect();return {bottom:r.bottom,height:r.height,vh:innerHeight,body:getComputedStyle(document.querySelector('.ae-atlas-panel-body')).display};});
      assert.ok(Math.abs(sheet.bottom-sheet.vh)<=1,'390: the sheet sits on the bottom edge');
      assert.ok(sheet.height<=80,'390: the sheet starts closed');
      await page.click('#aeAtlasSheet');
      const opened=await page.evaluate(()=>{const r=document.querySelector('#aeAtlasPanel').getBoundingClientRect();const empty=document.querySelector('#aeAtlasEmpty').getBoundingClientRect();return {height:r.height,expanded:document.querySelector('#aeAtlasSheet').getAttribute('aria-expanded'),empty:empty.height>0};});
      assert.equal(opened.expanded,'true');
      assert.ok(opened.height>200&&opened.empty,'390: the sheet opens to the layers and the empty state');
      const zone=zones.records.find(item=>item.id===layout.zone);
      if(zone?.imageSmall)assert.equal(layout.src,zone.imageSmall,'390: the phone gets the small base map');
    }else{
      assert.notEqual(layout.panelPos,'fixed',`${width}: the panel sits beside the map`);
      assert.ok(layout.panel.left>=layout.map.right,`${width}: the panel is to the right of the map`);
    }
    if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`atlas-${width}.png`),fullPage:true});
    assert.deepEqual(errors,[],`${width}: no page errors`);
    await context.close();
  }
  console.log('ok layout at 1600, 820 and 390');

  /* The ribbon and the Guide link to the map. */
  await (async()=>{
    const {context,page}=await open();
    assert.deepEqual(await page.$$eval('[data-forge-destination-ribbon] a',links=>links.map(a=>a.textContent)),['Daeva Card','Gear Ledger','Ascent Plan','Guide','Atreia Atlas','The Hub']);
    assert.equal(await page.getAttribute('[data-forge-destination-ribbon] a[aria-current="page"]','href'),PAGE,'The Atlas tab is lit');
    await page.goto(`${base}/hub/aetherium/guide/world/`);
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    assert.equal(await page.getAttribute('[data-guide-topic="atlas"] a','href'),PAGE,'The Guide World section links to the map');
    await context.close();
  })();
  console.log('ok ribbon and Guide link');
} catch(error){
  failed=true;
  console.error(error);
} finally {
  await browser.close();
  server.close();
}
if(failed){console.error('AETHERIUM_MAP=FAIL');process.exitCode=1;}
else console.log('AETHERIUM_MAP=PASS');
