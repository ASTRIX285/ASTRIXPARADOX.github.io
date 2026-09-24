import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
assert.ok(process.env.PLAYWRIGHT_BROWSERS_PATH,'Use the installed Chromium via PLAYWRIGHT_BROWSERS_PATH; this test never downloads browsers.');
const root=fileURLToPath(new URL('../../',import.meta.url)),output=process.env.CAPPED_GEAR_REVIEW_DIR||'/tmp/capped-gear-review';
const baseline=process.env.CAPPED_GEAR_BASELINE||'e6ae42c72d0356c3cc9ce4deb2474f0c2f224c2d';
const pages={Character:'astrix-app/pages/guardian-workspace-v2/',Vault:'astrix-app/pages/vault/',BuildForge:'astrix-app/pages/guardian-workspace-v2/paradox-build-space/',ForgeLoader:'astrix-app/pages/forge-loader/'};
const changes=['astrix-app/shared/astrix-desktop-density.css','astrix-app/shared/guardian-inventory-workspace.css','astrix-app/shared/astrix-hero-cards.css','astrix-app/pages/guardian-workspace-v2/guardian-left-rail-shared.css'];
let main=false;
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;let relative=path.slice(1);if(path.endsWith('/'))relative+='index.html';
 const file=resolve(root,relative);if(!file.startsWith(root)){res.writeHead(403).end();return;}
 try{let data=main&&changes.includes(relative)?execFileSync('git',['show',`${baseline}:${relative}`],{cwd:root}):await readFile(file);
 if(relative.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
 res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results=[],captures=[];
try{
 browser=await chromium.launch({channel:'chromium',headless:true});
 const page=await browser.newPage({deviceScaleFactor:1});
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 async function load(name,width,height,isMain=false){
  main=isMain;await page.setViewportSize({width,height});await page.goto(origin+'/'+pages[name]);
  await page.evaluate(async(name)=>{
   const inv=await import('/astrix-app/shared/guardian-inventory-workspace.mjs');
   const icon=location.origin+'/img/logo.png';
   const items=inv.INVENTORY_GROUPS.flatMap((group,g)=>Array.from({length:10},(_,i)=>({itemHash:990000+g*10+i,itemInstanceId:String(900000+g*10+i),name:`Fixture ${group.label} ${i+1}`,icon,power:550,equipmentGroup:group,source:{kind:i?'carried':'equipped',characterId:'2'}})));
   const {renderGuardianCharacterCards}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-character-cards.mjs');
   renderGuardianCharacterCards(['Hunter','Warlock','Titan'].map((characterClass,i)=>({characterId:String(i+1),characterClass,power:550,emblem:{background:icon},stats:Array.from({length:6},(_,i)=>[`Fixture stat ${i}`,60+i,icon])})),'2');
   await new Promise((done,fail)=>{const script=document.createElement('script');script.src='/astrix-app/shared/astrix-destination-ribbon.js';script.onload=done;script.onerror=fail;document.head.append(script);});
   if(name==='Character'){
    document.querySelector('.equip').classList.add('gear-layout-active');
    document.getElementById('characterInventoryWorkspace').innerHTML=`<article class="vault-character-column is-active character-live-inventory"><div class="vault-character-inventory">${inv.equippedAndCarriedMarkup({characterId:'2',items})}</div></article>`;
    const {renderGuardianLoadouts}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-loadouts.mjs');renderGuardianLoadouts([]);
   }else if(name==='Vault'){
    document.getElementById('vaultTransferWorkspace').innerHTML=`<div class="vault-character-columns">${['1','2','3'].map(characterId=>`<article class="vault-character-column"><div class="vault-character-inventory">${inv.equippedAndCarriedMarkup({characterId,items:items.map(item=>({...item,source:{...item.source,characterId}}))})}</div></article>`).join('')}</div>${inv.vaultOnlyMarkup({items:items.map(item=>({...item,source:{kind:'vault'}}))})}`;
   }else if(name==='BuildForge'){
    const {armourCard}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-gear-layout.mjs');
    const {renderWeapons}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-semantic-ui.mjs');
    document.getElementById('armourGrid').innerHTML=inv.ARMOUR_BUCKETS.map((group,i)=>armourCard(i,items.find(item=>item.equipmentGroup.key===group.key))).join('');
    document.getElementById('weaponGrid').innerHTML=Array.from({length:3},()=>'<div class="weap"><div class="art"></div><div class="cap"></div></div>').join('');
    renderWeapons(inv.WEAPON_BUCKETS.map(group=>items.find(item=>item.equipmentGroup.key===group.key)));
    // Production catalogue markup in the existing manual picker, opened only
    // after page geometry checks so its modal cannot mask header occlusion.
    window.fixtureCatalogue=items.filter(item=>item.equipmentGroup.kind==='weapon').slice(0,6).map(item=>inv.itemTileMarkup(item)).join('');
   }else{
    document.getElementById('forgeExoticSlots').innerHTML=`<section class="forge-exotic-slot"><h3>FIXTURE EXOTIC ARMOUR</h3><div class="forge-exotic-grid">${Array.from({length:12},()=>`<button class="forge-exotic"><img src="${icon}" alt="Synthetic exotic"></button>`).join('')}</div></section>`;
   }
   // A labelled test-only scroll runway guarantees scrollY=300 even when the
   // wide desktop fixture fits within one screen. It does not size any panel.
   const runway=document.createElement('footer');runway.textContent='Synthetic layout fixture: scroll runway';runway.style.minHeight='400px';document.body.append(runway);
   await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
  },name);
 }
 async function measure(name){return page.evaluate(name=>{
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const selector=name==='ForgeLoader'?'.forge-exotic':name==='BuildForge'?'.design-canvas .weap .art,.design-canvas .gear-slot .arm':'.vault-transfer-item[data-item-kind="weapon"] .tile-art,.vault-transfer-item[data-item-kind="armour"] .tile-art';
  const gear=[...document.querySelectorAll(selector)].map(box);
  const slots=[...document.querySelectorAll('.guardian-loadouts-strip .guardian-loadout-slot')].map(box);
  const header=document.querySelector('header:has(>[data-forge-hero-cards])'),ribbon=document.querySelector('[data-forge-destination-ribbon]');
  const cards=[...document.querySelectorAll('[data-forge-hero-cards] .guardian-character-card')].map(box);
  const violations=[];
  for(const tile of document.querySelectorAll(selector)){
   const r=box(tile);for(let parent=tile.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    if(!parent.matches('.vault-transfer-items,.vault-transfer-group,.vault-character-column,.vault-character-inventory,.character-inventory-workspace,.weap,.gear-slot,.design-section,.forge-exotic-grid,.forge-panel'))continue;
    const p=box(parent);if(r.x<p.x-1||r.right>p.right+1)violations.push(`${tile.className} exceeds ${parent.className}`);
   }
  }
  const primary=document.querySelector('.character-inventory-workspace [data-equipment-group="primary"]'),helmet=document.querySelector('.character-inventory-workspace [data-equipment-group="helmet"]');
  return {page:name,viewport:innerWidth,gear,strip:slots,header:box(header),ribbon:box(ribbon),cards,violations,columns:primary?(Math.abs(box(primary).x-box(helmet).x)>1?2:1):null,scrollWidth:document.documentElement.scrollWidth,bodyScroll:document.body.scrollWidth,catalogueToken:getComputedStyle(document.documentElement).getPropertyValue('--apx-icon-catalog').trim()};
 },name);}
 for(const [width,height] of [[1363,936],[1920,1080],[2560,1440]]){
  await load('ForgeLoader',width,height,true);const before=await measure('ForgeLoader');
  for(const name of Object.keys(pages)){
   await load(name,width,height,true);const rest=await measure(name);
   await load(name,width,height);const row=await measure(name);results.push(row);
   assert.deepEqual(row.header,rest.header,`${name}: header rest geometry unchanged`);
   assert.deepEqual(row.cards,rest.cards,`${name}: hero rest geometry unchanged`);
   await writeFile(resolve(output,'measurements.json'),JSON.stringify(results,null,2));
   await page.screenshot({path:resolve(output,`${name}-${width}.png`)});captures.push({name,width,file:`${name}-${width}.png`});
   assert.ok(row.gear.length>=8,`${name} ${width}: fixture gear rendered`);
   if(name==='ForgeLoader')assert.deepEqual(row.gear.map(r=>r.width),before.gear.map(r=>r.width),'Forge Loader unchanged from main');
   else for(const art of row.gear)assert.ok(Math.abs(art.width-(width===1363?44:64))<=(width===1363?1:.1),`${name} ${width}: art ${art.width}`);
   assert.deepEqual(row.violations,[],`${name} ${width}: tile containment`);
   assert.ok(row.scrollWidth<=width&&row.bodyScroll<=width,`${name} ${width}: no horizontal page scroll`);
   if(name==='Character'){
    assert.equal(row.strip.length,20);for(const slot of row.strip)assert.ok(Math.abs(slot.width-row.gear[0].width)<.1,'Strip equals inventory art');
    if(width!==1920)assert.equal(row.columns,width===2560?2:1,'Character inventory columns');
   }
   for(const y of [0,300]){
    await page.evaluate(y=>scrollTo(0,y),y);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(done)));
    const state=await page.evaluate(()=>{
     const header=document.querySelector('header:has(>[data-forge-hero-cards])'),ribbon=document.querySelector('[data-forge-destination-ribbon]');
     const cards=[...header.querySelectorAll('.guardian-character-card')];const rect=ribbon.getBoundingClientRect();
     const hits=[];for(const x of [2,innerWidth/2,innerWidth-2])for(const y of [2,rect.top-2,rect.top+rect.height/2]){const e=document.elementFromPoint(x,y);hits.push(Boolean(e&&(header.contains(e)||ribbon.contains(e))));}
     return {scrollY,headerColor:getComputedStyle(header).backgroundColor,opaque: getComputedStyle(ribbon,'::before').backgroundColor,cardsVisible:cards.every(c=>{const r=c.getBoundingClientRect();return r.top>=0&&r.bottom<=rect.top&&[[r.left+r.width/2,r.top+2],[r.left+2,r.top+r.height/2],[r.right-2,r.top+r.height/2]].every(([x,y])=>c.contains(document.elementFromPoint(x,y)));}),hits};
    });
    // Loader is the explicitly protected baseline exception.
    if(name!=='ForgeLoader'){
     assert.equal(state.scrollY,y,`${name}: requested scroll position reached`);
     assert.equal(state.opaque,state.headerColor,`${name}: solid ribbon band`);
     assert.ok(state.cardsVisible,`${name} ${width} scroll ${y}: heroes not clipped`);
     assert.ok(state.hits.every(Boolean),`${name} ${width} scroll ${y}: page content cannot show through header band`);
    }
    if(y===300){await page.screenshot({path:resolve(output,`${name}-${width}-scrolled.png`)});captures.push({name:name+' scrolled 300px',width,file:`${name}-${width}-scrolled.png`});}
   }
   if(name==='BuildForge'){
    row.catalogue=await page.evaluate(()=>{const grid=document.querySelector('.manual-item-grid');grid.innerHTML=window.fixtureCatalogue;grid.closest('.manual-editor-overlay').hidden=false;return [...grid.querySelectorAll('.tile-art')].map(e=>e.getBoundingClientRect().width);});
    assert.ok(row.catalogue.length);for(const size of row.catalogue)assert.equal(size,44,'Catalogue remains 44px');
    await page.screenshot({path:resolve(output,`BuildForge-${width}-catalogue.png`)});captures.push({name:'Build Forge owned catalogue',width,file:`BuildForge-${width}-catalogue.png`});
   }
  }
 }
 await writeFile(resolve(output,'measurements.json'),JSON.stringify(results,null,2));
 const figures=[];for(const capture of captures){const png=await readFile(resolve(output,capture.file));figures.push(`<figure><figcaption>${capture.name} ${capture.width}px, synthetic fixtures</figcaption><img src="data:image/png;base64,${png.toString('base64')}" alt="${capture.name} fixture layout"></figure>`);}
 await writeFile(resolve(output,'review.html'),`<!doctype html><meta charset="utf-8"><title>Prompt 12 layout evidence</title><style>body{background:#15151a;color:#fff;font:16px system-ui;margin:24px}img{max-width:100%}figure{margin:24px 0}pre{white-space:pre-wrap}</style><h1>Prompt 12: capped gear layout</h1><p>Real Chromium render with explicitly synthetic gear. No live account actions. Forge Loader compared against ${baseline}. Screenshots at DPR 1.</p><pre>${JSON.stringify(results.map(r=>({page:r.page,width:r.viewport,gear:r.gear[0].width,strip:r.strip[0]?.width,catalogue:r.catalogue?.[0]??null,columns:r.columns})),null,2)}</pre>${figures.join('')}`);
 console.log('CAPPED_GEAR_LAYOUT=PASS '+JSON.stringify(results.map(r=>({page:r.page,width:r.viewport,gear:r.gear[0].width,strip:r.strip[0]?.width,catalogue:r.catalogue?.[0],columns:r.columns}))));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
