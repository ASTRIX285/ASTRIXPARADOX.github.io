#!/usr/bin/env node
// Storage on desktop (Miguel, 3 Oct 2026, live at 1866): three Guardians, Warlock active, real scrollbars.
//   1. A drag from the Vault to a non-active Guardian (Titan) confirms with a tick. A Bungie
//      refusal and a Bungie that never answers both end within the fixed deadline with a plain
//      reason, and the tile goes back to the Vault. No greyed tile is left behind.
//   2. All three Guardian columns and the Vault sit inside the viewport at 1366, 1600 and 1920,
//      with no sideways scroll.
//   3. No outlined panel sits above a Guardian header: the active outline marks the whole column,
//      and the active Guardian's Postmaster looks like the others.
// Moves use the page's one transfer path (stageTransfer, shared with the item card and tap actions).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {storageFixture,routeStorage,GUARDIANS} from './fixtures/storage-three-guardians.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const DEADLINE_MS=30000;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
let browser;
try{
  // Real scrollbars, as in desktop Chrome: 100vw includes the scrollbar there.
  try{browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  async function open(width,{bungie='move',full=false}={}){
    const fixture=await storageFixture(root,{full}),context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],calls=[];
    page.on('pageerror',error=>errors.push(error.message));
    await routeStorage(page,{origin,fixture,art,bungie,calls});
    await page.goto(`${origin}/astrix-app/pages/vault/?characterId=${GUARDIANS.warlock}`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.vault-transfer-item[title="Fixture Bad Juju"]',{timeout:30000});await page.waitForTimeout(500);
    return {context,page,errors,calls};
  }
  const where=page=>page.evaluate(()=>{const node=document.querySelector('.vault-transfer-item[title="Fixture Bad Juju"]');return {column:node?.closest('[data-drop-kind]')?.dataset.dropCharacterId||(node?.closest('[data-drop-kind="vault"]')?'vault':''),moving:document.querySelectorAll('.vault-transfer-item.is-moving,.vault-transfer-item[aria-busy="true"]').length};});
  const toast=page=>page.evaluate(()=>{const node=document.querySelector('.vault-transfer-toast');return node?{state:node.className.replace('vault-transfer-toast ',''),text:node.textContent.replace('×','').trim()}:null;});
  async function drag(page){
    const tile=page.locator('.vault-transfer-item[title="Fixture Bad Juju"]').first(),group=await tile.evaluate(node=>node.closest('.vault-transfer-group').dataset.equipmentGroup);
    await tile.dragTo(page.locator(`[data-drop-character-id="${GUARDIANS.titan}"] .vault-transfer-group[data-equipment-group="${group}"]`).first());
  }
  async function settle(page){
    const started=Date.now();
    while(Date.now()-started<DEADLINE_MS+8000){const state=await toast(page);if(state&&!/is-moving/.test(state.state))return {...state,ms:Date.now()-started};await page.waitForTimeout(250);}
    return {state:'still moving',text:'',ms:Date.now()-started};
  }

  // 1. Transfers to a non-active Guardian.
  const outcomes={};
  for(const bungie of ['move','error','hang']){
    const {context,page,errors,calls}=await open(1866,{bungie});
    await drag(page);
    const result=await settle(page),after=await where(page);outcomes[bungie]=result;if(process.env.DEBUG)console.log(bungie,JSON.stringify({result,after,calls}));
    assert.ok(calls.length>=1&&String(calls[0].characterId)===GUARDIANS.titan&&calls[0].transferToVault===false,`${bungie}: the Bungie call is sent to the non-active Titan`);
    assert.ok(result.ms<=DEADLINE_MS+3000,`${bungie}: the toast ends within the deadline (${result.ms} ms)`);
    assert.equal(after.moving,0,`${bungie}: no greyed tile is left behind`);
    if(bungie==='move'){assert.match(result.state,/is-success/);assert.match(result.text,/✓/);assert.equal(after.column,GUARDIANS.titan,'The item lands on Titan');}
    else{
      assert.match(result.state,/is-error/,`${bungie}: the toast fails visibly`);
      assert.match(result.text,bungie==='error'?/Inventory full/:/Bungie did not confirm in time/,`${bungie}: plain reason (${result.text})`);
      assert.equal(after.column,'vault',`${bungie}: the tile is back in the Vault`);
    }
    assert.deepEqual(errors,[],`${bungie}: page errors`);
    await context.close();
  }

  // 2 and 3. Layout with full inventories at three widths.
  for(const width of [1366,1600,1920,1866]){
    const {context,page,errors}=await open(width,{full:true});
    const layout=await page.evaluate(()=>{
      const box=node=>node.getBoundingClientRect(),client=document.documentElement.clientWidth;
      const columns=[...document.querySelectorAll('#vaultTransferWorkspace [data-drop-kind]')].map(node=>({id:node.dataset.dropCharacterId||'vault',left:box(node).left,right:box(node).right}));
      const tiles=[...document.querySelectorAll('#vaultTransferWorkspace .vault-transfer-item')].filter(node=>box(node).width>0).map(box);
      const postmasters=[...document.querySelectorAll('.vault-character-column')].map(column=>({active:column.classList.contains('is-active'),fourColumn:getComputedStyle(column.querySelector('.vault-character-inventory')).display==='contents',border:getComputedStyle(column.querySelector('.vault-postmaster-section')).borderTopColor,shadow:getComputedStyle(column.querySelector('.vault-postmaster-section')).boxShadow,column:getComputedStyle(column).borderTopColor}));
      return {client,scroll:document.documentElement.scrollWidth,columns,tilesLeft:Math.min(...tiles.map(row=>row.left)),tilesRight:Math.max(...tiles.map(row=>row.right)),postmasters};
    });
    assert.equal(layout.scroll,layout.client,`${width}: no sideways scroll`);
    assert.equal(layout.columns.length,4,`${width}: three Guardians and the Vault`);
    for(const column of layout.columns)assert.ok(column.left>=0&&column.right<=layout.client,`${width}: ${column.id} column inside the viewport (${Math.round(column.left)} to ${Math.round(column.right)})`);
    assert.ok(layout.tilesLeft>=0&&layout.tilesRight<=layout.client,`${width}: every tile inside the viewport`);
    const active=layout.postmasters.find(row=>row.active),other=layout.postmasters.find(row=>!row.active);
    assert.equal(active.border,other.border,`${width}: the active Postmaster is not outlined on its own`);
    assert.equal(active.shadow,other.shadow,`${width}: no inset outline on the active Postmaster`);
    if(active.fourColumn)assert.notEqual(active.column,other.column,`${width}: the active outline marks the whole Guardian column`);
    assert.deepEqual(errors,[],`${width}: page errors`);
    await context.close();
  }
  console.log(`STORAGE_DESKTOP_TRANSFER=PASS Vault to non-active Titan: move ticks in ${outcomes.move.ms} ms; refusal shows "Inventory full" in ${outcomes.error.ms} ms and hang shows "Bungie did not confirm in time" in ${outcomes.hang.ms} ms, both with the tile back in the Vault and nothing greyed; columns and tiles inside the viewport at 1366, 1600 and 1920 with no sideways scroll; active outline on the column, not on the Postmaster`);
}finally{
  await browser?.close();server.close();
}
