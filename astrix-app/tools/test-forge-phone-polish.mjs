#!/usr/bin/env node
// The Forge phone polish (Miguel, 27 Nov 2026), real page code with the Warlock fixture.
// Character at 390 and 820:
//   - the section bar is a tablist of capsule buttons, each at least 44px high, exactly one selected,
//     the selected one filled crimson, with a top edge parting it from the page;
//   - GENERAL: the Abilities, Aspects, Fragments and Artifact dividers share one left edge and width;
//   - the Super formation fills every slot the fixture has, and an empty slot shows an empty socket.
// Build Forge at 390: armour item tile as large as Character's equipped tile and never smaller than its
// mods, mods as large as Character's other tiles, item details beside the tile, weapon perk sockets inside
// their card, one ARMOUR & MODS title, no sideways scroll. At 1600: no bar, details beside the tile.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
import {resolveSuperFormationSlots} from '../pages/guardian-workspace-v2/guardian-super-formation.mjs';
import {mergeSuperOptions} from '../pages/guardian-workspace-v2/guardian-super-catalog.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));

// Super formation mapping: every Super the subclass has gets a slot; slots beyond them are marked empty.
for(const [element,count] of [['solar',3],['arc',2],['strand',1],['prismatic',5]]){
  const options=mergeSuperOptions('warlock',element,[]);
  assert.equal(options.length,count,`warlock ${element}: catalogue Supers`);
  const mapped=resolveSuperFormationSlots({activeSuper:options[0],superOptions:options,subclass:element,characterClass:'warlock'});
  const placed=mapped.entries.filter(entry=>entry.role==='alternate-super'&&entry.item).map(entry=>entry.item.hash);
  assert.deepEqual([...placed].sort(),options.slice(1).map(row=>row.hash).sort(),`warlock ${element}: every other Super has a slot`);
  assert.equal(mapped.entries.filter(entry=>entry.role==='alternate-super'&&!entry.item).length,4-placed.length,`warlock ${element}: the rest are empty slots`);
}

const fixture=await warlockInventoryFixture(root);
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  const open=async(width,path)=>{
    const context=await browser.newContext({viewport:{width,height:width<600?844:width<1200?1180:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await routeWarlockFixture(page,{origin,fixture,art});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    return {context,page,errors};
  };
  const CHARACTER='/astrix-app/pages/guardian-workspace-v2/',BUILD='/astrix-app/pages/guardian-workspace-v2/paradox-build-space/';
  const characterReady=page=>page.waitForFunction(()=>document.querySelectorAll('.vault-transfer-item.is-equipped').length>=3&&document.querySelector('#superFeatureCluster .has-live-icon'),null,{timeout:30000});
  let characterTiles=null;

  for(const width of [390,820]){
    const {context,page,errors}=await open(width,CHARACTER);await characterReady(page);await page.waitForTimeout(400);
    const bar=page.locator('.ax-inv-tabs');
    assert.equal(await bar.getAttribute('role'),'tablist',`${width}: bar is a tablist`);
    const tabs=await page.evaluate(()=>[...document.querySelectorAll('.ax-inv-tabs .ax-inv-tab')].map(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return {key:node.dataset.inventoryTab,role:node.getAttribute('role'),selected:node.getAttribute('aria-selected'),height:box.height,radius:parseFloat(style.borderTopLeftRadius),background:style.backgroundImage,shadow:style.boxShadow};}));
    assert.ok(tabs.length>=3,`${width}: Weapons, Armour and General`);
    for(const tab of tabs){
      assert.equal(tab.role,'tab',`${width} ${tab.key}: role tab`);
      assert.ok(tab.height>=44,`${width} ${tab.key}: ${tab.height}px high, at least 44`);
      assert.ok(tab.radius>=20,`${width} ${tab.key}: capsule shape`);
      assert.notEqual(tab.background,'none',`${width} ${tab.key}: a filled button, not plain text`);
    }
    assert.equal(tabs.filter(tab=>tab.selected==='true').length,1,`${width}: exactly one selected`);
    const selected=tabs.find(tab=>tab.selected==='true');
    assert.match(selected.background,/rgb\(224, 74, 51\)/,`${width}: the selected button is the crimson capsule`);
    assert.match(selected.shadow,/rgba\(230, 57, 31/,`${width}: the selected button glows`);
    assert.ok(tabs.filter(tab=>tab.selected!=='true').every(tab=>!/rgb\(224, 74, 51\)/.test(tab.background)),`${width}: the others are graphite`);
    const edge=await page.evaluate(()=>{const style=getComputedStyle(document.querySelector('.ax-inv-tabs'));return {border:style.borderTopWidth,shadow:style.boxShadow};});
    assert.notEqual(edge.border,'0px',`${width}: bar has a top edge`);assert.notEqual(edge.shadow,'none',`${width}: bar lifts off the page`);
    // Keyboard: a tab is a focusable button and switching sets aria-selected.
    await page.locator('.ax-inv-tab[data-inventory-tab="armour"]').focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);
    assert.equal(await page.locator('.ax-inv-tab[data-inventory-tab="armour"]').getAttribute('aria-selected'),'true',`${width}: Enter on a tab selects it`);
    if(width===390){
      for(const tab of ['weapons','armour']){
        await page.locator(`.ax-inv-tab[data-inventory-tab="${tab}"]`).click();await page.waitForTimeout(150);
        const sizes=await page.evaluate(()=>({equipped:document.querySelector('.vault-transfer-items>.is-equipped:not([hidden])')?.getBoundingClientRect().width,other:[...document.querySelectorAll('.vault-transfer-items>.vault-transfer-item:not(.is-equipped)')].find(node=>node.getBoundingClientRect().width>0)?.getBoundingClientRect().width}));
        characterTiles=characterTiles||sizes;
      }
    }
    await page.locator('.ax-inv-tab[data-inventory-tab="general"]').click();await page.waitForTimeout(200);
    const groups=await page.evaluate(()=>[...document.querySelectorAll('.guardian-left-rail>.grp')].filter(node=>node.getBoundingClientRect().height>0).map(node=>{const box=node.getBoundingClientRect();return {name:node.className,left:Math.round(box.left),width:Math.round(box.width)};}));
    assert.ok(groups.length>=4,`${width}: Abilities, Aspects, Fragments and Artifact shown`);
    assert.equal(new Set(groups.map(row=>row.left)).size,1,`${width}: dividers share one left edge ${JSON.stringify(groups)}`);
    assert.equal(new Set(groups.map(row=>row.width)).size,1,`${width}: dividers are one width ${JSON.stringify(groups)}`);
    const formation=await page.evaluate(()=>[...document.querySelectorAll('#superFeatureCluster [data-super-slot]')].map(node=>({slot:node.dataset.superSlot,live:node.classList.contains('has-live-icon'),empty:node.classList.contains('is-empty-super')})));
    assert.equal(formation.length,6,`${width}: six formation slots`);
    assert.ok(formation.every(row=>row.live&&!row.empty),`${width}: the Prismatic fixture fills every formation slot ${JSON.stringify(formation)}`);
    // An empty slot shows an empty socket, not a blank frame.
    const marker=await page.evaluate(()=>{const node=document.querySelector('#superFeatureCluster [data-super-slot="alternate-1"]');node.classList.add('is-empty-super');node.querySelector('span').replaceChildren();const style=getComputedStyle(node.querySelector('span'),'::before');const out={content:style.content,width:parseFloat(style.width),border:style.borderTopWidth};node.classList.remove('is-empty-super');return out;});
    assert.equal(marker.content,'""',`${width}: empty socket marker drawn`);assert.ok(marker.width>4&&marker.border!=='0px',`${width}: empty socket marker visible`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no sideways scroll`);
    assert.deepEqual(errors,[],`${width}: no page errors`);
    await context.close();
  }
  assert.ok(characterTiles?.equipped>0&&characterTiles?.other>0,'Character tile sizes measured');

  for(const width of [390,1600]){
    const {context,page,errors}=await open(width,BUILD);
    await page.waitForFunction(()=>document.querySelectorAll('#armourGrid .gear-slot .gear-arm-details').length===5&&document.querySelectorAll('#weaponGrid .weap .art .item-tile').length===3,null,{timeout:30000});
    await page.waitForTimeout(300);
    const armour=await page.evaluate(()=>[...document.querySelectorAll('#armourGrid .gear-slot')].map(slot=>{const tile=slot.querySelector('.gear-arm-anchor .arm').getBoundingClientRect(),details=slot.querySelector('.gear-arm-details'),box=details.getBoundingClientRect(),mods=[...slot.querySelectorAll('.gear-mod')].map(node=>node.getBoundingClientRect().width),card=slot.getBoundingClientRect();return {tile:tile.width,tileRight:tile.right,detailsLeft:box.left,detailsTop:box.top,tileTop:tile.top,tileBottom:tile.bottom,name:details.querySelector('.gear-arm-name')?.textContent||'',facts:details.textContent,mods,inside:mods.length===6&&[...slot.querySelectorAll('.gear-mod,.gear-arm-details,.arm')].every(node=>{const r=node.getBoundingClientRect();return r.left>=card.left-0.5&&r.right<=card.right+0.5;})};}));
    for(const [index,row] of armour.entries()){
      assert.ok(row.name,`${width} armour ${index}: item name beside the tile`);
      assert.match(row.facts,/Power 550/,`${width} armour ${index}: power from the profile`);
      assert.ok(row.detailsLeft>=row.tileRight,`${width} armour ${index}: details to the right of the tile`);
      assert.ok(row.detailsTop<row.tileBottom,`${width} armour ${index}: details on the tile's row`);
      assert.ok(row.tile>=Math.max(...row.mods)-0.5,`${width} armour ${index}: the item tile is never smaller than its mods`);
      assert.ok(row.inside,`${width} armour ${index}: tile, details and mods inside the card`);
    }
    assert.equal(await page.locator('#armourBuildState').isVisible(),false,`${width}: one ARMOUR & MODS title`);
    assert.equal(await page.locator('#armourBuildInstruction').evaluate(node=>getComputedStyle(node).textTransform),'none',`${width}: instruction in sentence case`);
    if(width===390){
      assert.ok(Math.abs(armour[0].tile-characterTiles.equipped)<=1,`390: armour tile ${armour[0].tile} matches Character's equipped tile ${characterTiles.equipped}`);
      assert.ok(armour.every(row=>row.mods.every(size=>Math.abs(size-characterTiles.other)<=1)),`390: mods match Character's tiles ${characterTiles.other}`);
      const weapons=await page.evaluate(async()=>{
        // Five perk columns per weapon, from the weapon's own icon (layout check only).
        const {renderWeapons}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-semantic-ui.mjs');
        const items=[...document.querySelectorAll('#weaponGrid .weap')].map(card=>card._forgeWeapon);
        const perks=item=>[1,2,3,4,5].map(i=>({hash:990700+i,bungieHash:990700+i,name:`Layout perk ${i}`,icon:item.icon}));
        renderWeapons(items.map(item=>({...item,weaponPerkModel:null,weaponSemantics:{...(item.weaponSemantics||{}),perkModel:null,selectedPerks:perks(item)},selectedPerks:perks(item)})));
        await new Promise(done=>setTimeout(done,200));
        return [...document.querySelectorAll('#weaponGrid .weap')].map(card=>{const box=card.getBoundingClientRect(),cells=[...card.querySelectorAll('.weapon-perk-cell')].map(node=>node.getBoundingClientRect());return {art:card.querySelector('.art').getBoundingClientRect().width,cells:cells.map(r=>r.width),inside:cells.every(r=>r.left>=box.left-0.5&&r.right<=box.right+0.5)};});
      });
      for(const [index,row] of weapons.entries()){
        assert.ok(Math.abs(row.art-characterTiles.equipped)<=1,`390 weapon ${index}: weapon tile ${row.art} matches Character's equipped tile`);
        assert.equal(row.cells.length,5,`390 weapon ${index}: five perk sockets`);
        assert.ok(row.cells.every(size=>size>=48&&size<=characterTiles.other+0.5),`390 weapon ${index}: perk sockets ${row.cells} grown, never past Character's tile`);
        assert.ok(row.inside,`390 weapon ${index}: perk sockets inside the card`);
      }
    }else{
      assert.equal(await page.locator('.ax-inv-tabs').count()===0||!(await page.locator('.ax-inv-tabs').isVisible()),true,'1600: no section bar');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no sideways scroll`);
    assert.deepEqual(errors,[],`${width}: no page errors`);
    await context.close();
  }
  console.log('FORGE_PHONE_POLISH=PASS');
}finally{await browser?.close();server.close();}
