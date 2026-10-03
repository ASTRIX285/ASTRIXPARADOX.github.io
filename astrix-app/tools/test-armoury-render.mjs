#!/usr/bin/env node
// Armoury Edit pickers, rendered (3 Oct 2026). The real editor module and the Armoury page CSS with a
// fixture build, at 1600 and 390. Checks what the page looks like (bounding boxes, computed styles):
//   - the edit screen shows the build panels with no sideways scroll;
//   - a picker shows icon tiles only: no visible text on any tile, every tile the same size, each tile
//     named for the tooltip and screen readers; at least 6 tiles per row at 1600;
//   - clicking a tile opens the card with SELECT and BACK, and the one-Exotic note above SELECT;
//   - the artifact picker lists the artifact; the artifact panel then shows its tiers as side-by-side
//     columns at 1600, with perks in locked tiers disabled;
//   - on phone (390) the picker is a bottom sheet: full width, flush with the bottom of the screen.
// Writes screenshots when ARMOURY_RENDER_DIR is set (outside the repo).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const boot=`
import {createArmouryEditor,EMPTY_PLUG_HASH} from '/astrix-app/pages/loadout/armoury-editor.mjs';
const ARMOUR_BUCKETS=[3448274439,3551918588,14239492,20886954,1585787867],WEAPON_BUCKETS=[1498876634,2465295065,953998645];
const art='/img/ax-logo-160.webp';
const here={kind:'equipped',characterId:'1'},vault={kind:'vault'};
const stats=(a,b)=>[{hash:392767087,name:'Health',value:a},{hash:4244567218,name:'Melee',value:b},{hash:1943323491,name:'Class',value:12}];
const armour=(slot,id,exotic=false)=>({itemInstanceId:String(id),hash:20000+id,itemHash:20000+id,name:(exotic?'Exotic':'Legendary')+' armour '+id,icon:art,bucketHash:ARMOUR_BUCKETS[slot],classType:1,isExotic:exotic,source:here,energy:{capacity:10,used:0},stats:stats(10+slot,5),armourModOptions:{0:[{hash:501,name:'Mod A',icon:art,socketIndex:0,canInsert:true,energyCost:3}]},socketCoverage:{plugs:[]}});
const weapon=(slot,id,exotic=false,name)=>({itemInstanceId:String(id),hash:30000+id,itemHash:30000+id,name:name||((exotic?'Exotic':'Legendary')+' weapon '+id),icon:art,bucketHash:WEAPON_BUCKETS[slot],isExotic:exotic,source:vault});
const plug=(hash,name,socketIndex,extra={})=>({hash,itemHash:hash,name,icon:art,socketIndex,canInsert:true,definition:{displayProperties:{name,description:name+' does a fixture thing.'}},...extra});
const aspect=(hash,slots,socketIndex)=>plug(hash,'Aspect '+hash,socketIndex,{definition:{displayProperties:{name:'Aspect '+hash},plug:{energyCapacity:{capacityValue:slots}}}});
const sub={itemInstanceId:'301',hash:301,name:'Arc subclass',icon:art,subclassBuild:{superOptions:[plug(3011,'Arc Super',0)],abilityOptionsBySocket:{classAbility:[plug(3012,'Dodge',1),plug(3013,'Marksman',1)],movement:[plug(3014,'Jump',2)],melee:[plug(3015,'Melee',3)],grenade:[plug(3016,'Grenade',4)]},aspectOptionsBySocket:{5:[aspect(950,2,5),aspect(951,3,5)],6:[aspect(952,2,6)]},fragmentOptionsBySocket:Object.fromEntries([7,8,9,10,11].map(i=>[i,[plug(EMPTY_PLUG_HASH,'Empty Fragment Socket',i),plug(970,'Fragment A',i),plug(971,'Fragment B',i),plug(972,'Fragment C',i),plug(973,'Fragment D',i)]]))}};
const armourSet=ARMOUR_BUCKETS.map((_,s)=>armour(s,100+s,s===0));
const lodestar=weapon(1,201,true,'Lodestar');
const weapons=[weapon(0,200),lodestar,weapon(2,202)];
const catalogue=[...armourSet,...weapons,...Array.from({length:40},(_,i)=>weapon(0,300+i,i===3))];
const artifact={hash:880,name:'Fixture Artifact',icon:art,selectionLimit:7,selectionSlots:[0,1,2,3,4].map(t=>({tierIndex:t,capacity:t<2?2:1})),perks:[0,1,2,3,4].flatMap(t=>[0,1,2,3,4].map(i=>({hash:8000+t*10+i,name:'Perk '+(t+1)+'.'+(i+1),icon:art,tierIndex:t,tierUnlocked:t<4})))};
const record={id:'r1',name:'Arc Hunter',binding:{characterId:'1'},revision:1,build:{characterId:'1',characterClass:'hunter',weapons,armour:armourSet,subclassItem:sub,subclassItemInstanceId:'301',subclassName:'Arc subclass',subclassBuild:{super:{hash:3011,name:'Arc Super',socketIndex:0,icon:art},abilities:[{hash:3012,socketIndex:1},{hash:3014,socketIndex:2},{hash:3015,socketIndex:3},{hash:3016,socketIndex:4}],aspects:[{hash:950,socketIndex:5},{hash:952,socketIndex:6}],fragments:[{hash:970,socketIndex:7},{hash:971,socketIndex:8},{hash:972,socketIndex:9},{hash:973,socketIndex:10},{hash:EMPTY_PLUG_HASH,socketIndex:11}]},artifactConfiguration:{artifactHash:880,selectedPerkHashes:[8000,8011]}}};
const editor=createArmouryEditor({record,catalogue,subclasses:[sub],artifact,artifacts:[artifact]});
const dialog=document.getElementById('paradoxLoadoutDialog');dialog.classList.add('is-armoury-editor');
window.show=step=>{
  if(step==='weapon')editor.open('weapon:0');
  if(step==='weapon-card'){editor.open('weapon:0');editor.handle({dataset:{edPreview:String(editor.pickerOptions().findIndex(row=>row.item.isExotic))}});}
  if(step==='artifact-1')editor.open('artifact');
  if(step==='artifact-2')editor.handle({dataset:{ed:'close-picker'}});
  dialog.innerHTML=editor.html();if(!dialog.open)dialog.showModal();
};
window.show('edit');window.ready=true;`;
const html=(await readFile(resolve(root,'astrix-app/pages/loadout/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/boot.mjs"></script></body>');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://x').pathname;
  if(path==='/astrix-app/pages/loadout/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(path==='/boot.mjs'){res.setHeader('Content-Type','text/javascript');res.end(boot);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,shots=process.env.ARMOURY_RENDER_DIR||'';
  for(const width of [1600,390]){
    const page=await browser.newPage({viewport:{width,height:width<600?844:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/astrix-app/pages/loadout/');await page.waitForFunction(()=>window.ready);await page.waitForTimeout(300);
    const show=async step=>{await page.evaluate(s=>window.show(s),step);await page.waitForTimeout(250);if(shots)await page.screenshot({path:resolve(shots,`armoury-${step}-${width}.png`)});};
    const sideways=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    // Edit screen.
    await show('edit');
    assert.ok(await page.locator('.ae-panel-weapons').isVisible()&&await page.locator('.ae-panel-armour').isVisible(),`${width}: edit screen shows the build panels`);
    assert.equal(await sideways(),false,`${width}: edit screen, no sideways scroll`);
    // Weapon picker: icon tiles only, equal size, named.
    await show('weapon');
    const tiles=await page.locator('.ae-picker .ae-tile.ae-choice').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),text:node.innerText.trim(),name:node.dataset.name||'',label:node.getAttribute('aria-label')||''};}));
    assert.ok(tiles.length>10,`${width}: the picker lists the weapons`);
    assert.ok(tiles.every(tile=>!/[A-Za-z]/.test(tile.text)),`${width}: tiles show no text, icons only`);
    assert.ok(tiles.every(tile=>tile.name&&tile.label===tile.name),`${width}: every tile is named for the tooltip and screen readers`);
    assert.ok(Math.max(...tiles.map(t=>t.w))-Math.min(...tiles.map(t=>t.w))<=1&&Math.max(...tiles.map(t=>t.h))-Math.min(...tiles.map(t=>t.h))<=1,`${width}: every tile is the same size`);
    if(width>=1200)assert.ok(tiles.filter(tile=>tile.top===tiles[0].top).length>=6,'1600: at least 6 tiles per row');
    // The icon really paints: screenshot the first tile and measure pixel spread in a canvas.
    // A blank tile is one flat fill; the item art gives a wide spread.
    await page.waitForFunction(()=>[...document.querySelectorAll('.ae-picker .ae-choice img')].slice(0,3).every(img=>img.complete&&img.naturalWidth>0));
    const shot=(await page.locator('.ae-picker .ae-tile.ae-choice').first().screenshot()).toString('base64');
    const spread=await page.evaluate(async data=>{const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const context=canvas.getContext('2d');context.drawImage(img,0,0);const {data:px}=context.getImageData(4,4,img.width-8,img.height-8);let min=255,max=0;for(let i=0;i<px.length;i+=4){const luma=(px[i]*299+px[i+1]*587+px[i+2]*114)/1000;min=Math.min(min,luma);max=Math.max(max,luma);}return max-min;},shot);
    assert.ok(spread>60,`${width}: the item art paints inside the tile (pixel spread ${Math.round(spread)})`);
    const sheet=await page.locator('.ae-picker').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:r.width};});
    if(width<600)assert.ok(Math.abs(sheet.bottom-844)<=2&&Math.abs(sheet.width-390)<=2,`390: the picker is a full-width bottom sheet (${JSON.stringify(sheet)})`);
    assert.equal(await sideways(),false,`${width}: picker, no sideways scroll`);
    // Card with SELECT and BACK, Exotic note above SELECT.
    await show('weapon-card');
    const card=await page.locator('.ae-picker.is-card').evaluate(node=>({buttons:[...node.querySelectorAll('button')].map(b=>b.textContent.trim()),note:node.querySelector('.ae-card-note')?.textContent||'',noteAbove:(()=>{const note=node.querySelector('.ae-card-note'),select=[...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='SELECT');return Boolean(note&&select&&note.getBoundingClientRect().bottom<=select.getBoundingClientRect().top+1);})()}));
    assert.ok(card.buttons.includes('SELECT')&&card.buttons.includes('BACK'),`${width}: the card has SELECT and BACK`);
    assert.equal(card.note,'Replaces Lodestar as your Exotic',`${width}: the one-Exotic note`);
    assert.ok(card.noteAbove,`${width}: the note sits above SELECT`);
    // Artifact: step 1 lists the artifact; step 2 shows tiers side by side, locked perks disabled.
    await show('artifact-1');
    assert.ok(await page.locator('.ae-picker [data-name="Fixture Artifact"]').count()===1,`${width}: step 1 lists the artifact`);
    await show('artifact-2');
    const columns=await page.locator('.ae-artifact-column').evaluateAll(nodes=>nodes.map(node=>{const panel=node.closest('.ae-panel-artifact').getBoundingClientRect(),r=node.getBoundingClientRect(),tiles=[...node.querySelectorAll('.ae-tile')].map(t=>t.getBoundingClientRect());return {left:Math.round(r.left),inside:r.left>=panel.left-1&&r.right<=panel.right+1&&tiles.every(t=>t.right<=panel.right+1&&t.width>=24),label:node.getAttribute('aria-label'),disabled:[...node.querySelectorAll('button')].filter(b=>b.disabled).length,buttons:node.querySelectorAll('button').length};}));
    assert.equal(columns.length,5,`${width}: one column per tier`);
    assert.ok(columns.every(column=>column.inside),`${width}: every tier and tile sits inside the artifact panel, nothing cut off`);
    if(width>=1200)assert.equal(new Set(columns.map(c=>c.left)).size,5,'1600: tiers sit side by side');
    assert.equal(columns[4].disabled,columns[4].buttons,`${width}: perks in a locked tier are disabled`);
    assert.equal(columns[0].disabled,0,`${width}: perks in unlocked tiers can be picked`);
    assert.equal(await sideways(),false,`${width}: artifact, no sideways scroll`);
    assert.deepEqual(errors,[],`${width}: page errors`);
    await page.close();
  }
  console.log('ARMOURY_RENDER=PASS 1600 and 390: edit panels; icon-only, equal, named picker tiles (6+ per row at 1600); card with SELECT, BACK and the Exotic note above SELECT; artifact step 1 and tier columns side by side with locked perks disabled; full-width bottom sheet on phone; no sideways scroll');
}finally{
  await browser?.close();server.close();
}
