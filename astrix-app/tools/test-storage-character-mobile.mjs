#!/usr/bin/env node
// Storage and Character on phone and tablet (2 Oct 2026). Page scripts are stripped; the real
// inventory markup, item card and Super formation modules render fixture data.
// Storage: Postmaster items are icons only and a Postmaster item is pulled from its item card;
// no EQUIPPED AND CARRIED box; tiles at least 64px (72px tablet), 4px gap, rows filled edge to edge.
// Character: only the selected Super has the Ember diamond frame; nothing is laid over the icon.
// Desktop (1600) keeps the PULL buttons, the box and the framed Supers.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    let data=await readFile(file);
    if(file.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  async function open(path,width){
    const page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin))return route.continue();if(url.includes('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});return route.abort();});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    return {page,errors};
  }

  for(const width of [390,820,1600]){
    const compact=width<1200,{page,errors}=await open('/astrix-app/pages/vault/',width);
    await page.evaluate(async()=>{
      const inv=await import('/astrix-app/shared/guardian-inventory-workspace.mjs');
      const {bindParadoxItemInspect}=await import('/astrix-app/pages/guardian-workspace-v2/paradox-item-hover.mjs');
      const icon=location.origin+'/img/ax-logo-160.webp',capabilities={transferItems:true,equipItems:true,pullFromPostmaster:true};
      const make=(kind,characterId,count,prefix)=>inv.INVENTORY_GROUPS.flatMap((group,g)=>Array.from({length:count(g)},(_,i)=>({itemHash:700000+g*100+i,itemInstanceId:String(500000+g*100+i+(kind==='vault'?90000:kind==='postmaster'?80000:Number(characterId)*10000)),name:`${prefix} ${group.label} ${i+1}`,icon,power:550,equipmentGroup:group,source:{kind:kind==='carried'&&i===0?'equipped':kind,characterId}})));
      const postmaster=make('postmaster','2',g=>g<3?2:0,'Post'),gear=make('carried','2',()=>10,'Gear'),vault=make('vault','',()=>23,'Vault');
      document.getElementById('vaultTransferWorkspace').innerHTML=`<div class="vault-character-columns"><article class="vault-character-column is-active" data-drop-kind="character" data-drop-character-id="2">${inv.postmasterMarkup({characterId:'2',items:postmaster,characterLabel:'Warlock',capabilities,activeCharacterId:'2'})}<div class="vault-character-inventory"><header class="vault-character-header"><div><span>ACTIVE GUARDIAN</span><h3>WARLOCK</h3></div></header>${inv.equippedAndCarriedMarkup({characterId:'2',items:gear,capabilities,activeCharacterId:'2'})}</div></article></div>${inv.vaultOnlyMarkup({items:vault,capabilities,activeCharacterId:'2'})}`;
      // Same wiring as vault.mjs: the item card carries the pull on phone and tablet.
      const items=new Map([...postmaster,...gear,...vault].map(item=>[`${item.itemHash}:${item.itemInstanceId}`,item]));
      window.pulled=[];
      inv.bindInventoryWorkspaceHovers(document.getElementById('vaultTransferWorkspace'),{resolveItem:key=>items.get(key)||[...items.values()].find(item=>String(key).includes(item.itemInstanceId)),bindInspect:(target,item,kind,options)=>bindParadoxItemInspect(target,item,kind,{...options,actions:()=>item.source.kind==='postmaster'&&matchMedia('(max-width: 1199px)').matches?[{label:'Pull to Warlock',run:()=>window.pulled.push(item.itemInstanceId)}]:[]})});
    });
    await page.waitForTimeout(200);
    const layout=await page.evaluate(()=>{
      const visible=node=>node&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0;
      const row=selector=>{
        const grid=document.querySelector(selector),cells=[...grid.children].filter(visible),boxes=cells.map(cell=>cell.getBoundingClientRect()),first=boxes.filter(box=>Math.abs(box.top-boxes[0].top)<2);
        return {perRow:first.length,tile:first[0].width,gap:first.length>1?first[1].left-first[0].right:0,orphan:grid.getBoundingClientRect().right-Math.max(...first.map(box=>box.right))};
      };
      return {
        pull:[...document.querySelectorAll('.vault-postmaster-pull')].filter(visible).length,
        box:[...document.querySelectorAll('.vault-equipped-carried-section>header')].filter(visible).length,
        weapons:visible(document.querySelector('.vault-equipped-carried-section>h5.vault-transfer-family')),
        carried:row('.vault-equipped-carried-section .vault-transfer-items'),vault:row('.vault-only-section .vault-transfer-items'),
        hscroll:document.documentElement.scrollWidth>innerWidth
      };
    });
    assert.equal(layout.hscroll,false,`${width}: no sideways scroll`);
    if(compact){
      assert.equal(layout.pull,0,`${width}: Postmaster shows icons only`);
      assert.equal(layout.box,0,`${width}: no EQUIPPED AND CARRIED box`);
      assert.equal(layout.weapons,false,`${width}: no WEAPONS subheading under the Guardian`);
      for(const [name,row] of Object.entries({carried:layout.carried,vault:layout.vault})){
        assert.ok(row.tile>=(width<600?64:72)-0.5,`${width} ${name}: tiles at least ${width<600?64:72}px (got ${row.tile})`);
        assert.ok(Math.abs(row.gap-4)<0.6,`${width} ${name}: 4px gap (got ${row.gap})`);
        assert.ok(Math.abs(row.orphan)<1,`${width} ${name}: the row is filled edge to edge (orphan ${row.orphan})`);
      }
      // Tap a Postmaster icon: its item card opens with the pull, and the pull runs once.
      await page.click('.vault-postmaster-section [data-inspect-item]');
      const action=page.locator('#paradoxItemInspect [data-paradox-inspect-action]');
      await action.waitFor({state:'visible',timeout:2000});
      assert.equal(await action.innerText(),'Pull to Warlock');
      assert.ok((await action.boundingBox()).height>=44,'The pull button is a 44px touch target');
      await action.click();
      assert.equal(await page.locator('#paradoxItemInspect').isHidden(),true,'The card closes after the pull');
      assert.equal((await page.evaluate(()=>window.pulled)).length,1,'Exactly one Postmaster pull was queued');
    }else{
      assert.equal(layout.pull,6,'Desktop keeps the PULL buttons');
      assert.equal(layout.box,1,'Desktop keeps the EQUIPPED AND CARRIED box');
      await page.click('.vault-postmaster-section [data-inspect-item]');
      await page.locator('#paradoxItemInspect').waitFor({state:'visible',timeout:2000});
      assert.equal(await page.locator('#paradoxItemInspect [data-paradox-inspect-action]').count(),0,'Desktop item card has no extra action');
    }
    assert.deepEqual(errors,[]);await page.close();
  }

  for(const width of [390,820,1600]){
    const compact=width<1200,{page,errors}=await open('/astrix-app/pages/guardian-workspace-v2/',width);
    await page.evaluate(async()=>{
      await import('/astrix-app/pages/guardian-workspace-v2/guardian-super-feature-sync.mjs');
      const catalog=await import('/astrix-app/pages/guardian-workspace-v2/guardian-super-catalog.mjs');
      const options=catalog.mergeSuperOptions('hunter','prismatic',[]);
      document.dispatchEvent(new CustomEvent('forge:guardian-selection-changed',{detail:{characterClass:'hunter',subclass:'prismatic',super:options[1]||options[0]}}));
      await new Promise(done=>setTimeout(done,500));
    });
    const supers=await page.evaluate(()=>[...document.querySelectorAll('.super-feature .super-diamond.has-live-icon')].map(node=>{
      const style=getComputedStyle(node),before=getComputedStyle(node,'::before'),after=getComputedStyle(node,'::after'),img=node.querySelector('img');
      return {selected:node.classList.contains('is-selected-super'),before:before.display,after:after.display,afterColor:after.borderTopColor,afterWidth:after.borderTopWidth,background:style.backgroundColor,filter:style.filter,imgFilter:img?getComputedStyle(img).filter:'none'};
    }));
    const selected=supers.filter(row=>row.selected);
    assert.equal(selected.length,1,`${width}: one selected Super`);
    if(compact){
      for(const row of supers.filter(row=>!row.selected))assert.ok(row.before==='none'&&row.after==='none',`${width}: unselected Supers are plain`);
      assert.equal(selected[0].afterColor,'rgb(230, 57, 31)',`${width}: Ember diamond frame on the selected Super`);
      assert.equal(selected[0].afterWidth,'2px');
      for(const row of supers)assert.ok(row.filter==='none'&&row.imgFilter==='none'&&/rgba\(0, 0, 0, 0\)|transparent/.test(row.background),`${width}: nothing is laid over the Bungie icon`);
    }else{
      assert.ok(supers.every(row=>row.before!=='none'),'Desktop keeps the framed Super formation');
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('STORAGE_CHARACTER_MOBILE=PASS 390 and 820: Postmaster icons only with the pull in the item card, no EQUIPPED AND CARRIED box, filled rows of 64px/72px tiles with a 4px gap, Ember diamond frame on the selected Super only; 1600 unchanged');
}finally{await browser?.close();server.close();}
