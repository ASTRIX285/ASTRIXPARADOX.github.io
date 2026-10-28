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
// Markers and capture mode (feature/aetherium-map-capture, 28 Oct 2026), on the real Verteron capture with test-only markers:
//   - pins with their layer's icon, close ones clustered when zoomed out and split when zoomed in, places drawn as names,
//     counts in the panel, the card on click, a layer turned off hides its pins;
//   - the deep link ?zone=&marker= opens the zone centred on the marker with its card; an unknown marker says so;
//   - capture mode (?capture=1): a click drops a marker with the form in the panel (never over the spot), drag moves it,
//     undo, edit and delete, kept on the device across a reload, the export is exactly the markers.json format and passes
//     the checks and the schema; no sideways scroll at 390, 820 and 1600; nothing on the site links to it.
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
const LAYERS=['hidden-cube','empyrean-trace','kibelisk','gathering','named-monster','dungeon-entrance','rift','place','area'];
/* Layers drawn with the in-game icon cut from Miguel's captures (Miguel, 28 Oct 2026). */
const GAME_ICON_LAYERS=['kibelisk','dungeon-entrance','place','area'];
const FONT_HOSTS=new Set(['use.typekit.net','p.typekit.net']);

/* Data. */
const zones=await json(`${DATA}zones.json`),layers=await json(`${DATA}layers.json`),markers=await json(`${DATA}markers.json`);
const fixture=await json('astrix-app/tools/fixtures/aion2/atlas-markers.json');
const {atlasProblems}=await import(pathToFileURL(resolve(root,'astrix-app/games/aion2/engine/atlas-data.mjs')).href);
assert.deepEqual(atlasProblems({zones,layers,markers}),[],'The real Atlas data passes');
assert.deepEqual(zones.records.map(zone=>zone.id).sort(),['altgard','verteron'],'Verteron and Altgard only');
assert.deepEqual(layers.layers.map(layer=>layer.id),LAYERS,'Layer order');
assert.ok(markers.records.every(marker=>zones.records.find(zone=>zone.id===marker.zone)?.image),'Every marker sits on a captured base map');
assert.ok(markers.records.every(marker=>marker.provenance.kind==='in-game-capture'),'Every marker is an in-game capture');
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
  where:{...good,id:'no-where',provenance:(({where,...rest})=>rest)(good.provenance)},
  version:{...good,id:'no-version',provenance:(({gameVersion,...rest})=>rest)(good.provenance)},
  kind:{...good,id:'bad-kind',provenance:{...good.provenance,kind:'community-guide'}}
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
  for(const what of ['x','y','provenance','where','version','kind'])assert.equal(validate({records:[bad[what]]}),false,`The schema rejects a marker with a bad ${what}`);
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
  /* The fixture zone stands in for Verteron: no markers on it, so the panel shows its empty state. */
  if(fixtureZones)await context.route(/\/data\/map\/markers\.json$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[]})}));
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
      const def=layers.layers.find(layer=>layer.id===item.layer);
      if(GAME_ICON_LAYERS.includes(item.layer))assert.equal(item.icon,`/astrix-app/pages/aetherium/icons/game/${{'dungeon-entrance':'dungeon',place:'settlement'}[item.layer]??item.layer}.webp`,`${item.layer}: the in-game icon`);
      else assert.ok(item.icon.endsWith(`atlas-layers.svg#${item.layer}`),`${item.layer}: its own icon until the in-game one is confirmed`);
      assert.equal(item.icon,def.image??`/astrix-app/pages/aetherium/icons/atlas-layers.svg#${def.icon}`,`${item.layer}: the icon layers.json gives`);
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
    assert.equal(await page.locator('#aeAtlasMarkers [data-atlas-pin]').count(),0,'No marker drawn');
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

  /* Markers on the real Verteron map, from test-only records served in place of markers.json. */
  const drawnZone=zones.records.find(zone=>zone.image);
  const testMarker=(id,layer,x,y,extra={})=>({id,zone:drawnZone.id,layer,x,y,name:`Test ${id}`,status:'confirmed',provenance:{kind:'in-game-capture',capturedBy:'test',capturedOn:'2026-10-28',gameVersion:'test',where:'test',note:'test'},...extra});
  const spread=LAYERS.filter(layer=>layer!=='place').map((layer,i)=>testMarker(`t-${layer}`,layer,0.2+0.1*i,0.3));
  const near=[0,1,2].map(i=>testMarker(`t-near-${i}`,'gathering',0.5+0.012*i,0.6+0.012*i));
  const testMarkers={records:[...spread,...near,testMarker('t-place','place',0.45,0.8,{name:'Test Village'})]};
  assert.deepEqual(atlasProblems({zones,layers,markers:testMarkers}),[],'The test markers are valid');
  const openMarkers=async(query='',{width=1600,height=900}={})=>{
    const context=await browser.newContext({viewport:{width,height}});
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:204,body:''}));
    await context.route(/\/data\/map\/markers\.json$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testMarkers)}));
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(id=>{try{localStorage.setItem('ae-atlas-zone',id);}catch{}},drawnZone.id);
    await page.goto(base+PAGE+query);
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    await mapLoaded(page);
    await page.waitForTimeout(100);
    return {context,page,errors};
  };
  const pinsDrawn=page=>page.waitForFunction(()=>document.querySelector('#aeAtlasMarkers').dataset.scale===document.querySelector('#aeAtlasView').dataset.scale);
  const pinsShown=async page=>{await pinsDrawn(page);return page.$$eval('#aeAtlasMarkers [data-atlas-pin]',nodes=>nodes.map(node=>({id:node.dataset.marker??null,cluster:node.dataset.cluster??null,layer:node.dataset.layer??null,
    cls:node.className,text:node.textContent.trim(),icon:node.querySelector('img')?.getAttribute('src')??null,box:(r=>({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width}))(node.getBoundingClientRect())})));};
  await (async()=>{
    const {context,page,errors}=await openMarkers();
    let shown=await pinsShown(page);
    for(const marker of spread){
      const pin=shown.find(item=>item.id===marker.id);
      assert.ok(pin,`${marker.id}: drawn`);
      const def=layers.layers.find(layer=>layer.id===marker.layer);
      assert.equal(pin.icon,def.image??`/astrix-app/pages/aetherium/icons/atlas-layers.svg#${def.icon}`,`${marker.id}: its layer's icon`);
      assert.ok(pin.box.w>=40,`${marker.id}: a big enough target (${pin.box.w})`);
    }
    const iconsOk=await page.$$eval('#aeAtlasMarkers img',imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0));
    assert.ok(iconsOk,'Pin icons load');
    const cluster=shown.find(item=>item.cluster);
    assert.ok(cluster&&cluster.text==='3'&&cluster.cluster.split(' ').sort().join()===near.map(m=>m.id).join(),'Three close markers cluster when zoomed out');
    assert.ok(!shown.some(item=>near.some(m=>m.id===item.id)),'Clustered markers are not drawn alone');
    const place=shown.find(item=>item.id==='t-place');
    assert.ok(place&&place.text==='Test Village'&&place.icon==='/astrix-app/pages/aetherium/icons/game/settlement.webp','A place is drawn as its in-game icon with its name');
    const counts=await page.$$eval('.ae-atlas-layer',nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.layer,node.querySelector('.ae-atlas-count').textContent])));
    assert.deepEqual(counts,Object.fromEntries(LAYERS.map(layer=>[layer,String(testMarkers.records.filter(m=>m.layer===layer).length)])),'Counts in the layer panel');
    assert.equal(await page.$eval('#aeAtlasEmpty',el=>el.hidden),true,'No empty state when there are markers');
    /* Zooming in splits the cluster. */
    for(let i=0;i<4&&(await pinsShown(page)).some(item=>item.cluster);i++){
      const c=(await pinsShown(page)).find(item=>item.cluster);
      await page.mouse.click(c.box.x,c.box.y);
      await page.waitForTimeout(80);
    }
    shown=await pinsShown(page);
    assert.ok(near.every(m=>shown.some(item=>item.id===m.id)),'Zoomed in, the cluster splits into its markers');
    /* A click opens the card in the panel and puts the marker in the link. */
    const one=shown.find(item=>item.id===near[1].id);
    await page.mouse.click(one.box.x,one.box.y);
    const card=await page.evaluate(()=>({id:document.querySelector('#aeAtlasCard .ae-atlas-card')?.dataset.marker,title:document.querySelector('#aeAtlasCard h3')?.textContent,
      selected:document.querySelector('#aeAtlasMarkers .is-selected')?.dataset.marker,url:location.search}));
    assert.deepEqual(card,{id:near[1].id,title:near[1].name,selected:near[1].id,url:`?zone=${drawnZone.id}&marker=${near[1].id}`},'Click opens the card');
    /* A layer turned off hides its pins. */
    await page.click('.ae-atlas-layer[data-layer="rift"]');
    await page.waitForTimeout(50);
    assert.ok(!(await pinsShown(page)).some(item=>item.layer==='rift'),'An off layer hides its pins');
    assert.deepEqual(errors,[],'No page errors with markers');
    await context.close();
  })();
  console.log('ok markers, icons, clusters, places, counts, card');

  /* Drill down and search (Miguel, 28 Oct 2026): a layer row lists its markers A to Z, the search finds one by name, and
     picking either centres the map on it, turns its layer on and opens its card. Desktop and phone. */
  for(const [width,height] of [[1600,900],[390,844]]){
    const {context,page,errors}=await openMarkers('',{width,height});
    const phone=width<820;
    if(phone)await page.click('#aeAtlasSheet');
    const drills=await page.$$eval('[data-drill]',nodes=>nodes.map(node=>({layer:node.dataset.drill,disabled:node.disabled,expanded:node.getAttribute('aria-expanded'),w:node.getBoundingClientRect().width,h:node.getBoundingClientRect().height})));
    assert.deepEqual(drills.map(d=>d.layer),LAYERS,`${width}: one drill button per layer`);
    for(const d of drills){
      const n=testMarkers.records.filter(m=>m.layer===d.layer).length;
      assert.equal(d.disabled,n===0,`${width}: ${d.layer} drill is off only with no markers`);
      assert.equal(d.expanded,'false');
      assert.ok(d.w>=44&&d.h>=44,`${width}: ${d.layer} drill is a big enough target`);
    }
    /* Turn gathering off first: picking one from its list turns it back on. */
    await page.click('.ae-atlas-layer[data-layer="gathering"]');
    await page.click('[data-drill="gathering"]');
    assert.equal(await page.getAttribute('[data-drill="gathering"]','aria-expanded'),'true',`${width}: the drill opens`);
    const listed=await page.$$eval('#aeAtlasList-gathering [data-goto]',nodes=>nodes.map(node=>({id:node.dataset.goto,name:node.querySelector('b').textContent,h:node.getBoundingClientRect().height,icon:node.querySelector('img')?.getAttribute('src')})));
    const want=testMarkers.records.filter(m=>m.layer==='gathering').map(m=>m.name).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
    assert.deepEqual(listed.map(item=>item.name),want,`${width}: the list holds the layer's markers, A to Z`);
    assert.ok(listed.every(item=>item.h>=44&&item.icon),`${width}: list entries are big enough and carry the icon`);
    const target=testMarkers.records.find(m=>m.id==='t-near-2');
    await page.click(`#aeAtlasList-gathering [data-goto="${target.id}"]`);
    await pinsDrawn(page);
    const went=await page.evaluate(()=>({card:document.querySelector('#aeAtlasCard .ae-atlas-card')?.dataset.marker,selected:document.querySelector('#aeAtlasMarkers .is-selected')?.dataset.marker,
      on:document.querySelector('.ae-atlas-layer[data-layer="gathering"]').getAttribute('aria-pressed'),url:location.search}));
    assert.deepEqual(went,{card:target.id,selected:target.id,on:'true',url:`?zone=${drawnZone.id}&marker=${target.id}`},`${width}: picking from the list opens its card and turns its layer on`);
    const centred=await page.evaluate(()=>{const pin=document.querySelector('#aeAtlasMarkers .is-selected').getBoundingClientRect(),view=document.querySelector('#aeAtlasView').getBoundingClientRect();
      return {dx:Math.abs(pin.left+pin.width/2-(view.left+view.width/2)),dy:Math.abs(pin.top+pin.height/2-(view.top+view.height/2)),inView:pin.top>=view.top&&pin.bottom<=view.bottom&&pin.left>=view.left&&pin.right<=view.right};});
    assert.ok(centred.inView&&centred.dx<40&&centred.dy<40,`${width}: the map centres on the pick (${centred.dx}, ${centred.dy})`);
    if(phone){
      const sheet=await page.evaluate(()=>({card:document.querySelector('#aeAtlasPanel').classList.contains('is-card'),pin:document.querySelector('#aeAtlasMarkers .is-selected').getBoundingClientRect().bottom,top:document.querySelector('#aeAtlasPanel').getBoundingClientRect().top}));
      assert.ok(sheet.card&&sheet.pin<sheet.top,`${width}: the sheet shows the card alone and the pick stays in view above it`);
      await page.click('#aeAtlasSheet');
    }
    /* Search, any layer, any case, apostrophes ignored. */
    await page.fill('#aeAtlasFind','TEST t-NEAR 1');
    const found=await page.$$eval('#aeAtlasFound [data-goto]',nodes=>nodes.map(node=>({id:node.dataset.goto,layer:node.querySelector('small')?.textContent})));
    assert.deepEqual(found,[{id:'t-near-1',layer:'Gathering'}],`${width}: search finds the marker and names its layer`);
    await page.press('#aeAtlasFind','Enter');
    assert.equal(await page.$eval('#aeAtlasCard .ae-atlas-card',el=>el.dataset.marker),'t-near-1',`${width}: Enter goes to the first hit`);
    if(phone)await page.click('#aeAtlasSheet');
    await page.fill('#aeAtlasFind','nothing like this');
    assert.equal(await page.$eval('#aeAtlasFound',el=>el.textContent.trim()),`Nothing called that on the ${drawnZone.name} map yet.`,`${width}: an honest no-match line`);
    await page.fill('#aeAtlasFind','');
    assert.equal(await page.$eval('#aeAtlasFound',el=>el.hidden),true,`${width}: an empty search hides the results`);
    const sideways=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(sideways<=0,`${width}: no sideways scroll (${sideways})`);
    assert.deepEqual(errors,[],`${width}: no page errors in drill down`);
    await context.close();
  }
  console.log('ok drill down and search, desktop and phone');

  /* Deep link: the zone, centred on the marker, with its card. */
  await (async()=>{
    const target=spread[4];
    const {context,page,errors}=await openMarkers(`?zone=${drawnZone.id}&marker=${target.id}`);
    const state=await page.evaluate(()=>{const v=document.querySelector('#aeAtlasView').getBoundingClientRect();return {card:document.querySelector('#aeAtlasCard .ae-atlas-card')?.dataset.marker,cx:v.left+v.width/2,cy:v.top+v.height/2,zoom:Number(document.querySelector('#aeAtlasView').dataset.zoom)};});
    const pin=(await pinsShown(page)).find(item=>item.id===target.id);
    assert.equal(state.card,target.id,'The deep link opens the right card');
    assert.ok(state.zoom>2,'The deep link zooms in');
    assert.ok(pin&&Math.abs(pin.box.x-state.cx)<60&&Math.abs(pin.box.y-state.cy)<60,'The deep link centres on the marker');
    assert.ok(pin.cls.includes('is-selected'),'The linked marker is lit');
    /* The card is on screen without scrolling, on desktop and on a phone. */
    for(const [width,height] of [[1600,900],[390,844]]){
      await page.setViewportSize({width,height});
      await page.goto(`${base}${PAGE}?zone=${drawnZone.id}&marker=${target.id}`);
      await page.waitForSelector('html[data-aetherium-ready="true"]');
      const seen=await page.$eval('#aeAtlasCard .ae-atlas-card',card=>{const r=card.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>40;});
      assert.ok(seen,`${width}: the linked card is on screen`);
    }
    await page.setViewportSize({width:1600,height:900});
    await page.goto(`${base}${PAGE}?zone=${drawnZone.id}&marker=nowhere`);
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    assert.equal(await page.$eval('#aeNotice',el=>el.hidden?null:el.textContent.trim()),'That marker is not on the map yet.','An unknown marker says so');
    assert.deepEqual(errors,[],'No page errors on the deep link');
    await context.close();
  })();
  console.log('ok deep link');

  /* Capture mode: drop, move, undo, edit, delete and export in the markers.json format. */
  await (async()=>{
    const context=await browser.newContext({viewport:{width:1600,height:900}});
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:204,body:''}));
    /* An empty markers.json, so the clicks land on open map and not on a real marker. */
    await context.route(/\/data\/map\/markers\.json$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[]})}));
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(id=>{try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('ae-atlas-zone',id);sessionStorage.setItem('seeded','1');}}catch{}},drawnZone.id);
    await page.goto(`${base}${PAGE}?capture=1`);
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    await mapLoaded(page);
    assert.ok(await page.isVisible('#aeAtlasCapture'),'Capture mode shows its panel');
    const at=async(fx,fy)=>page.evaluate(([fx,fy,w,h])=>{const v=document.querySelector('#aeAtlasView'),r=v.getBoundingClientRect(),s=Number(v.dataset.scale);
      return {x:r.left+Number(v.dataset.tx)+fx*w*s,y:r.top+Number(v.dataset.ty)+fy*h*s};},[fx,fy,drawnZone.width,drawnZone.height]);
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ae-atlas-capture')||'[]'));
    await page.fill('#aeCapBy','Miguel');
    await page.dispatchEvent('#aeCapBy','change');
    await page.fill('#aeCapVersion','test version');
    await page.dispatchEvent('#aeCapVersion','change');
    assert.equal(await page.isVisible('#aeCapForm'),false,'The form waits for a click on the map');
    let spot=await at(0.4,0.4);
    await page.mouse.click(spot.x,spot.y);
    assert.ok(await page.isVisible('#aeCapForm'),'A click opens the form');
    const cover=await page.evaluate(({x,y})=>{const f=document.querySelector('#aeCapForm').getBoundingClientRect(),g=document.querySelector('.ae-atlas-ghost').getBoundingClientRect();
      return {covers:x>=f.left&&x<=f.right&&y>=f.top&&y<=f.bottom,ghost:Math.hypot(g.left+g.width/2-x,g.top+g.height/2-y)};},spot);
    assert.equal(cover.covers,false,'The form never covers the spot');
    assert.ok(cover.ghost<4,`The spot is marked while the form is open (${cover.ghost})`);
    const layerTargets=await page.$$eval('.ae-atlas-cap-layer',nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(layerTargets.length===LAYERS.length&&layerTargets.every(h=>h>=44),'Layer picks are big targets');
    await page.click('.ae-atlas-cap-layer:has(input[value="hidden-cube"])');
    await page.fill('#aeCapForm [name="name"]','Cube by the bridge');
    await page.fill('#aeCapForm [name="note"]','Behind the rocks.');
    await page.fill('#aeCapForm [name="level"]','9');
    await page.fill('#aeCapForm [name="gameX"]','1234.5');
    await page.fill('#aeCapForm [name="gameY"]','678');
    await page.click('.ae-atlas-cap-save');
    let records=await stored();
    assert.equal(records.length,1,'Saved on this device');
    const first=records[0];
    assert.equal(first.id,`${drawnZone.id}-hidden-cube-cube-by-the-bridge`);
    assert.ok(Math.abs(first.x-0.4)<0.002&&Math.abs(first.y-0.4)<0.002,'Saved where it was clicked');
    let pin=(await pinsShown(page)).find(item=>item.id===first.id);
    assert.ok(pin&&pin.cls.includes('is-captured')&&pin.icon.endsWith('#hidden-cube'),'The new marker is drawn');
    /* Move by dragging. */
    await page.mouse.move(pin.box.x,pin.box.y);
    await page.mouse.down();
    await page.mouse.move(pin.box.x+80,pin.box.y+40,{steps:8});
    await page.mouse.up();
    await page.waitForTimeout(60);
    records=await stored();
    assert.ok(records[0].x>first.x+0.01&&records[0].y>first.y,'Dragging moves it');
    assert.equal(await page.isVisible('#aeCapForm'),false,`A drag does not open the form (${await page.textContent('#aeCapFormTitle')}, ${await page.textContent('#aeCapStatus')})`);
    /* Undo puts it back. */
    await page.click('#aeCapUndo');
    records=await stored();
    assert.equal(records[0].x,first.x,'Undo puts it back');
    /* A second marker, edited, then deleted, then undone. */
    spot=await at(0.6,0.5);
    await page.mouse.click(spot.x,spot.y);
    await page.click('.ae-atlas-cap-layer:has(input[value="place"])');
    await page.fill('#aeCapForm [name="name"]','Test Hamlet');
    await page.click('.ae-atlas-cap-save');
    assert.equal((await stored()).length,2);
    pin=(await pinsShown(page)).find(item=>item.text==='Test Hamlet');
    await page.mouse.click(pin.box.x,pin.box.y);
    assert.equal(await page.inputValue('#aeCapForm [name="name"]'),'Test Hamlet','Clicking your marker opens it to edit');
    await page.fill('#aeCapForm [name="name"]','Test Hamlet Gate');
    await page.click('.ae-atlas-cap-save');
    records=await stored();
    assert.equal(records[1].name,'Test Hamlet Gate','Edit saves');
    pin=(await pinsShown(page)).find(item=>item.text==='Test Hamlet Gate');
    await page.mouse.click(pin.box.x,pin.box.y);
    await page.click('#aeCapDelete');
    assert.equal((await stored()).length,1,'Delete removes it');
    await page.click('#aeCapUndo');
    assert.equal((await stored()).length,2,'Undo brings it back');
    /* Kept on the device across a reload. */
    await page.reload();
    await page.waitForSelector('html[data-aetherium-ready="true"]');
    await mapLoaded(page);
    assert.equal(await page.inputValue('#aeCapBy'),'Miguel','The name is remembered');
    assert.equal((await pinsShown(page)).filter(item=>item.cls.includes('is-captured')).length,2,'Captures survive a reload');
    /* Export. */
    await page.click('#aeCapCopy');
    const exported=JSON.parse(await page.inputValue('#aeCapOut'));
    const now=new Date(),todayIs=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    assert.deepEqual(Object.keys(exported),['records'],'Export is a markers.json body');
    assert.deepEqual(Object.keys(exported.records[0]),['id','zone','layer','x','y','gameX','gameY','name','note','level','status','provenance'],'Export keys in the markers.json order');
    assert.deepEqual(exported.records[0],{id:first.id,zone:drawnZone.id,layer:'hidden-cube',x:first.x,y:first.y,gameX:1234.5,gameY:678,name:'Cube by the bridge',note:'Behind the rocks.',level:9,status:'confirmed',
      provenance:{kind:'in-game-capture',capturedBy:'Miguel',capturedOn:todayIs,gameVersion:'test version',where:`in game, ${drawnZone.name}`,note:'Position read from the in-game map and placed on our base map of the zone.'}},'Export record');
    assert.deepEqual(atlasProblems({zones,layers,markers:exported}),[],'The export passes the Atlas checks');
    if(Ajv2020){
      const ajv=new (Ajv2020.default??Ajv2020)({allErrors:true,strict:true});
      (addFormats.default??addFormats)(ajv);
      const validate=ajv.compile(await json('astrix-app/games/aion2/schema/atlas-markers.schema.json'));
      assert.ok(validate(exported),`The export matches the schema: ${ajv.errorsText(validate.errors)}`);
    }
    /* Capture mode at three widths: no sideways scroll. */
    for(const [width,height] of [[1600,900],[820,1180],[390,844]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(120);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`Capture mode ${width}: no sideways scroll (${overflow}px)`);
      if(process.env.AE_SHOTS&&width!==820)await page.screenshot({path:resolve(process.env.AE_SHOTS,`atlas-capture-${width}.png`)});
    }
    assert.deepEqual(errors,[],'No page errors in capture mode');
    await context.close();
  })();
  console.log('ok capture mode: drop, move, undo, edit, delete, export');

  /* Capture mode is never linked: no page, script or sitemap on the site points at it. */
  await (async()=>{
    const {readdir}=await import('node:fs/promises');
    const hits=[];
    const walk=async dir=>{
      for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})){
        const rel=`${dir}/${entry.name}`.replace(/^\.\//,'');
        if(entry.isDirectory()){if(!/^(\.|node_modules$)|^ASTRIX285\.github\.io$|^tools$|^fixtures$/.test(entry.name))await walk(rel);continue;}
        if(!/\.(html|mjs|js|xml|json)$/.test(entry.name))continue;
        const text=await readFile(resolve(root,rel),'utf8');
        /* Pages and the sitemap: any mention. Scripts and data: only inside a string, so a comment naming the mode is fine. */
        if((/\.(html|xml)$/.test(entry.name)?/capture=1/:/['"`][^'"`\n]*capture=1/).test(text))hits.push(rel);
      }
    };
    await walk('.');
    assert.deepEqual(hits,[],'Nothing on the site links to capture mode');
  })();
  console.log('ok capture mode not linked');

  /* The real markers.json: every marker on a captured zone is drawn, alone or inside a cluster. */
  await (async()=>{
    const {context,page,errors}=await open();
    for(const zone of zones.records.filter(item=>item.image)){
      await page.click(`.ae-atlas-zone[data-zone="${zone.id}"]`);
      await mapLoaded(page);
      const ids=(await pinsShown(page)).flatMap(item=>item.cluster?item.cluster.split(' '):[item.id]).sort();
      assert.deepEqual(ids,markers.records.filter(marker=>marker.zone===zone.id).map(marker=>marker.id).sort(),`${zone.id}: every captured marker is on the map`);
      const counts=await page.$$eval('.ae-atlas-layer',nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.layer,Number(node.querySelector('.ae-atlas-count').textContent)])));
      for(const layer of LAYERS)assert.equal(counts[layer],markers.records.filter(marker=>marker.zone===zone.id&&marker.layer===layer).length,`${zone.id} ${layer}: count`);
    }
    assert.deepEqual(errors,[],'No page errors with the real markers');
    await context.close();
  })();
  console.log(`ok real markers (${markers.records.length})`);

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
    const shownId=await page.evaluate(()=>document.body.dataset.zone);
    if(zones.records.find(zone=>zone.id===shownId)?.image)await mapLoaded(page);
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
      if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,'atlas-390-closed.png')});
      await page.click('#aeAtlasSheet');
      const opened=await page.evaluate(()=>{const r=document.querySelector('#aeAtlasPanel').getBoundingClientRect();const empty=document.querySelector('#aeAtlasEmpty').getBoundingClientRect();return {height:r.height,expanded:document.querySelector('#aeAtlasSheet').getAttribute('aria-expanded'),empty:empty.height>0};});
      assert.equal(opened.expanded,'true');
      const hasMarkers=markers.records.some(marker=>marker.zone===layout.zone);
      assert.ok(opened.height>200&&opened.empty===!hasMarkers,'390: the sheet opens to the layers (and the empty state when the zone has no markers)');
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
