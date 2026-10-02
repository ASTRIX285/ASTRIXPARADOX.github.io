#!/usr/bin/env node
// Phone and tablet inventory on Character and Storage (real page code, Warlock fixture with Bungie's
// own definitions). At 390 and 820:
//   - every bucket with an equipped item keeps it alone in the first column;
//   - unequipped items fill 4 (390) or 5 (820) columns per row;
//   - no sideways scroll;
//   - the bottom bar (WEAPONS, ARMOUR, GENERAL, INVENTORY) is fixed and visible after scrolling,
//     never covers the last row, and is hidden while the tools drawer is open;
//   - each tab shows only its own areas; the last tab is remembered for the page;
//   - a tap still opens the item card.
// At 1600 the bar and the bucket grid are absent (desktop unchanged).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {warlockInventoryFixture,routeWarlockFixture} from './fixtures/warlock-inventory-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=await warlockInventoryFixture(root);
const TABS={weapons:['primary','special','heavy'],armour:['helmet','gauntlets','chest','legs','class-item'],general:['ghost','ship','sparrow'],inventory:[]};
const PAGES=[['Character','/astrix-app/pages/guardian-workspace-v2/'],['Storage','/astrix-app/pages/vault/']];
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
  const ready=page=>page.waitForFunction(()=>document.querySelectorAll('.vault-transfer-item.is-equipped').length>=3,null,{timeout:30000});
  // Visible areas: equipment groups outside the Postmaster, plus the Postmaster and Character's left rail.
  const visibleAreas=page=>page.evaluate(()=>{
    const shown=node=>node&&node.getBoundingClientRect().height>0;
    return {
      groups:[...new Set([...document.querySelectorAll('.vault-transfer-group')].filter(node=>!node.closest('.vault-postmaster-section')&&shown(node)).map(node=>node.dataset.equipmentGroup))],
      postmaster:[...document.querySelectorAll('.vault-postmaster-section')].some(shown),
      leftRail:shown(document.querySelector('.guardian-left-rail'))
    };
  });

  for(const width of [390,820])for(const [name,path] of PAGES){
    const label=`${name} ${width}`,columns=width<600?4:5;
    const context=await browser.newContext({viewport:{width,height:width<600?844:1180}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await routeWarlockFixture(page,{origin,fixture,art});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});await ready(page);await page.waitForTimeout(300);
    const bar=page.locator('.ax-inv-tabs');
    assert.deepEqual(await bar.locator('.ax-inv-tab').allInnerTexts(),['WEAPONS','ARMOUR','GENERAL','INVENTORY'],`${label}: the four tabs`);
    assert.equal(await page.evaluate(()=>document.body.dataset.inventoryTab),'weapons',`${label}: WEAPONS first`);

    for(const [tab,groups] of Object.entries(TABS)){
      await bar.locator(`[data-inventory-tab="${tab}"]`).click();await page.waitForTimeout(150);
      assert.equal(await bar.locator(`[data-inventory-tab="${tab}"]`).getAttribute('aria-selected'),'true');
      const areas=await visibleAreas(page);
      assert.deepEqual(areas.groups.filter(group=>!groups.includes(group)),[],`${label} ${tab}: only its own buckets`);
      if(groups.length)assert.ok(areas.groups.length>0,`${label} ${tab}: its buckets are shown`);
      assert.equal(areas.postmaster,tab==='inventory',`${label} ${tab}: Postmaster only under INVENTORY`);
      if(name==='Character')assert.equal(areas.leftRail,tab==='general',`${label} ${tab}: subclass and artifact only under GENERAL`);
      if(tab==='inventory')continue;
      // Bucket geometry: equipped alone in column 1, unequipped rows of 4 or 5.
      const buckets=await page.evaluate(()=>[...document.querySelectorAll('.vault-transfer-items')].filter(node=>node.getBoundingClientRect().height>0&&node.querySelector(':scope>.is-equipped')).map(node=>{
        const box=node.getBoundingClientRect(),equipped=node.querySelector(':scope>.is-equipped').getBoundingClientRect();
        const others=[...node.children].filter(child=>!child.classList.contains('is-equipped')&&child.getBoundingClientRect().width>0).map(child=>child.getBoundingClientRect());
        const firstRow=others.filter(rect=>Math.abs(rect.top-others[0].top)<2);
        return {group:node.closest('.vault-transfer-group').dataset.equipmentGroup,equippedLeft:equipped.left-box.left,equippedRight:equipped.right,minOtherLeft:Math.min(...others.map(rect=>rect.left)),others:others.length,firstRow:firstRow.length,equippedWidth:equipped.width,tile:others[0]?.width||0};
      }));
      assert.ok(buckets.length>0,`${label} ${tab}: buckets with an equipped item`);
      for(const bucket of buckets){
        assert.ok(Math.abs(bucket.equippedLeft)<1,`${label} ${bucket.group}: equipped item in the first column`);
        assert.ok(bucket.minOtherLeft>=bucket.equippedRight-0.5,`${label} ${bucket.group}: no unequipped item in the equipped column`);
        assert.equal(bucket.firstRow,Math.min(columns,bucket.others),`${label} ${bucket.group}: ${columns} unequipped per row`);
        assert.ok(bucket.equippedWidth>bucket.tile,`${label} ${bucket.group}: the equipped item is slightly larger`);
        if(width<600)assert.ok(bucket.tile>=64,`${label} ${bucket.group}: tiles about 68px at 390 (got ${bucket.tile})`);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${label}: no sideways scroll`);

    // Fixed bar after scrolling, never over the last row.
    await bar.locator('[data-inventory-tab="weapons"]').click();
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);
    const after=await page.evaluate(()=>{
      const barBox=document.querySelector('.ax-inv-tabs').getBoundingClientRect(),tiles=[...document.querySelectorAll('.vault-transfer-item')].filter(node=>node.getBoundingClientRect().height>0);
      return {position:getComputedStyle(document.querySelector('.ax-inv-tabs')).position,barTop:barBox.top,barBottom:barBox.bottom,viewport:innerHeight,lastBottom:Math.max(...tiles.map(node=>node.getBoundingClientRect().bottom))};
    });
    assert.equal(after.position,'fixed',`${label}: the bar is fixed`);
    assert.ok(Math.abs(after.barBottom-after.viewport)<1&&after.barTop<after.viewport,`${label}: the bar is visible at the bottom after scrolling`);
    assert.ok(after.lastBottom<=after.barTop+0.5,`${label}: the last row is not covered by the bar (${after.lastBottom} vs ${after.barTop})`);

    // The drawer opens over the page; the bar steps aside.
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.click('.ax-menu-btn');await page.waitForTimeout(350);
    assert.equal(await bar.isVisible(),false,`${label}: the bar does not overlap the open drawer`);
    await page.keyboard.press('Escape');await page.waitForTimeout(150);
    assert.equal(await bar.isVisible(),true);

    // A tap still opens the item card.
    await page.locator('.vault-transfer-item.is-equipped[data-inspect-item]').first().click();
    await page.locator('#paradoxItemInspect').waitFor({state:'visible',timeout:3000});
    await page.keyboard.press('Escape');

    // The last tab is remembered for this page.
    await bar.locator('[data-inventory-tab="armour"]').click();
    await page.reload({waitUntil:'domcontentloaded'});await ready(page);await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.body.dataset.inventoryTab),'armour',`${label}: the last tab is remembered`);
    assert.equal(await page.locator('.ax-inv-tab[aria-selected="true"]').innerText(),'ARMOUR');
    assert.deepEqual(errors,[],`${label}: no page errors`);
    await context.close();
  }

  for(const [name,path] of PAGES){
    // Desktop: no bar, no bucket grid, no tab filtering.
    const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await context.newPage();
    await routeWarlockFixture(page,{origin,fixture,art});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});await ready(page);await page.waitForTimeout(300);
    const desktop=await page.evaluate(()=>({bar:document.querySelector('.ax-inv-tabs')?.getBoundingClientRect().height||0,compact:document.body.classList.contains('ax-inv-compact'),tab:document.body.dataset.inventoryTab||'',grid:[...document.querySelectorAll('.vault-transfer-items')].some(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length===6)}));
    assert.deepEqual(desktop,{bar:0,compact:false,tab:'',grid:false},`${name} 1600: desktop unchanged`);
    await context.close();
  }
  console.log('INVENTORY_MOBILE_LAYOUT=PASS Character and Storage at 390 and 820: equipped item alone in the first column, 4/5 unequipped per row, no sideways scroll, fixed bar visible after scrolling and clear of the last row and the drawer, each tab shows only its areas, last tab remembered, taps open the item card; 1600 unchanged');
}finally{await browser?.close();server.close();}
