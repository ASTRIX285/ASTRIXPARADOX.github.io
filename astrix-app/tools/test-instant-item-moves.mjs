#!/usr/bin/env node
// Instant item moves (3 Oct 2026). Storage shows a move as done the moment Bungie accepts the
// transfer call, while the executor's fresh inventory readback carries on behind it. The fixture
// Bungie answers each request after REQUEST_MS and its profile reflects a move only PROFILE_LAG_MS
// later, like Bungie's profile cache. Production page handlers and the real executor run unchanged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REQUEST_MS=150,PROFILE_LAG_MS=2000;
const source=await readFile(resolve(root,'astrix-app/pages/vault/vault.mjs'),'utf8');
const names=['characters','characterClass','characterLabel','workspaceCharacters','equipmentGroupsMarkup','postmasterMarkup','characterColumnMarkup','vaultOnlyMarkup','workspaceItem','carriedReplacement','stageTransfer','transferToActiveCharacter','actionFailureMessage','performPendingVaultAction','dropDestination','validDrop','validFeedbackDrop','clearDropTargets','installTransferEvents'];
const handlers=names.map(name=>{
  const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,`Production handler ${name} exists`);
  const lineEnd=source.indexOf('\n',start),firstLine=source.slice(start,lineEnd);
  if(firstLine.endsWith('}'))return firstLine;
  const end=source.indexOf('\n}',lineEnd);assert.ok(end>start,`Production handler ${name} closes`);
  return source.slice(start,end+2);
}).join('\n');
const fixture=`
import {createVaultTransferFeedback} from '/astrix-app/pages/vault/vault-transfer-feedback.mjs';
import {inventoryGroupsMarkup,equippedAndCarriedMarkup,postmasterMarkup as sharedPostmasterMarkup,bindInventoryWorkspaceInteractions,INVENTORY_GROUPS} from '/astrix-app/shared/guardian-inventory-workspace.mjs';
import {stageVaultTransferIntent,confirmVaultTransferIntent,liveActionCapabilities,inventoryLocations,executeVaultTransferIntent as executeReal} from '/astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const byId=id=>document.getElementById(id),text=value=>String(value??'').trim(),itemKey=item=>String(item?.itemInstanceId||''),CLASS_NAMES=['titan','hunter','warlock'];
const session={authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'123',membershipType:3},liveActionCapabilities:{transferItems:true,equipItems:true}};
const payload={profile:{characters:{data:{'1':{characterId:'1',classType:1},'2':{characterId:'2',classType:2},'3':{characterId:'3',classType:0}}}}};
let catalogue={items:['101','102','103'].map((id,index)=>({itemInstanceId:id,itemHash:1000+index,bucketHash:1498876634,name:'Fixture '+id,icon:location.origin+'/img/logo.png',equipmentGroup:INVENTORY_GROUPS[0],characterClass:'any',source:{kind:'carried',characterId:'1'}})),postmasterItems:[]};
let activeCharacterId='2',draggedItemKey='',pendingVaultAction=null,vaultActionBusy=false;
const vaultActionQueue=[],queuedVaultActionKeys=new Set(),setStatus=message=>byId('status').textContent=message,stagePostmasterCollection=()=>{throw Error('Unexpected Postmaster action');};
const transferFeedback=createVaultTransferFeedback({board:byId('vaultTransferWorkspace'),itemKey,characterLabel,canDrop:validFeedbackDrop});
const scale=Number(new URL(location.href).searchParams.get('scale')||1);
// Only the HTTP origin and, for the long mismatch case, the wait length are injected.
const executeVaultTransferIntent=(intent,options)=>executeReal(intent,{...options,authOrigin:location.origin,waitImpl:ms=>new Promise(done=>setTimeout(done,ms*scale))});
function render(){
  byId('vaultTransferWorkspace').innerHTML='<div class="vault-character-columns">'+workspaceCharacters().map(characterColumnMarkup).join('')+'</div>'+vaultOnlyMarkup();
  transferFeedback.reconcile();
}
async function refreshAfterLiveAction(live){
  if(!live)live=await (await fetch('/bungie/profile')).json();
  const {locations}=inventoryLocations(live);
  catalogue.items=catalogue.items.map(item=>({...item,source:locations.get(item.itemInstanceId)?.source||item.source}));
  render();
}
${handlers}
render();installTransferEvents();window.fixtureReady=true;
`;
const html='<!doctype html><link rel="stylesheet" href="/css/astrix-palette.css"><link rel="stylesheet" href="/astrix-app/pages/vault/vault.css"><link rel="stylesheet" href="/astrix-app/shared/guardian-inventory-workspace.css"><link rel="stylesheet" href="/astrix-app/shared/item-tile.css"><body class="apx-fluid-icons"><main class="vault-transfer-workspace"><div id="vaultTransferWorkspace" class="vault-transfer-board"></div></main><p id="status"></p><script type="module" src="/fixture.mjs"></script>';
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(path==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const wait=ms=>new Promise(done=>setTimeout(done,ms));
let browser;
try{
  browser=await chromium.launch({headless:true});
  // neverLands: Bungie answers ErrorCode 1 but the profile never shows the item at its destination.
  async function setup({neverLands=false,scale=1}={}){
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],transfers=[];
    page.on('pageerror',error=>errors.push(error.message));
    const truth=new Map(['101','102','103'].map(id=>[id,{kind:'carried',characterId:'1'}])),visibleAt=new Map();
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin){await route.abort();return;}
      if(url.pathname==='/bungie/profile'){
        await wait(REQUEST_MS);
        const profile={characters:{data:{'1':{},'2':{},'3':{}}},profileInventory:{data:{items:[]}},characterInventories:{data:{'1':{items:[]},'2':{items:[]},'3':{items:[]}}}};
        for(const [id,at] of truth){
          const shown=visibleAt.get(id)&&Date.now()<visibleAt.get(id).at?visibleAt.get(id).before:at,item={itemInstanceId:id,itemHash:1000+Number(id)-101,bucketHash:shown.kind==='vault'?138197802:1498876634};
          (shown.kind==='vault'?profile.profileInventory.data.items:profile.characterInventories.data[shown.characterId].items).push(item);
        }
        await route.fulfill({json:{profile}});return;
      }
      if(url.pathname==='/bungie/actions/transfer-item'){
        const body=request.postDataJSON();transfers.push(body);await wait(REQUEST_MS);
        if(!neverLands){const before=truth.get(body.itemId);truth.set(body.itemId,body.transferToVault?{kind:'vault',characterId:null}:{kind:'carried',characterId:body.characterId});visibleAt.set(body.itemId,{at:Date.now()+PROFILE_LAG_MS,before});}
        await route.fulfill({json:{ErrorCode:1}});return;
      }
      if(url.pathname.startsWith('/bungie/'))throw Error('Unexpected Bungie route '+url.pathname);
      await route.continue();
    });
    await page.goto(`${origin}/?scale=${scale}`);await page.waitForFunction(()=>window.fixtureReady);
    return {page,errors,transfers};
  }
  const tile='[data-inspect-item="102"]',vault='[data-drop-kind="vault"] [data-equipment-group="primary"]';
  const timeTo=(page,selector)=>page.evaluate(async selector=>{const start=performance.now();while(!document.querySelector(selector))await new Promise(done=>setTimeout(done,10));return performance.now()-start;},selector);
  // 1. A move to the Vault is shown as done when Bungie accepts it, not after the profile catches up.
  {
    const {page,errors,transfers}=await setup();
    const started=Date.now();
    await page.evaluate(()=>{window.dragData=new DataTransfer();const node=document.querySelector('[data-inspect-item="102"]');node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.dragData}));});
    await page.evaluate(selector=>{const node=document.querySelector(selector);for(const type of ['dragover','drop'])node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:window.dragData}));},vault);
    const done=await timeTo(page,'.vault-transfer-toast.is-success');
    const settledAt=Date.now()-started;
    assert.ok(done<1200,`Success shows within one preflight and one transfer call (${Math.round(done)} ms)`);
    assert.equal(await page.locator(vault+' '+tile).count(),1,'The tile is in the Vault');
    assert.equal(await page.locator(tile+'.is-moving').count(),0,'No busy pulse after acceptance');
    assert.equal(await page.locator(tile).getAttribute('aria-disabled'),'true','The tile cannot be moved again until Bungie readback finishes');
    // A second move of the same item while the readback runs explains itself and sends nothing.
    await page.locator(tile).dblclick();
    assert.match(await page.locator('#status').innerText(),/Fixture 102 moved\. Bungie is still updating its inventory/);
    await page.waitForFunction(()=>!document.querySelector('[data-inspect-item="102"][aria-disabled]'),null,{timeout:PROFILE_LAG_MS*4});
    const readbackAt=Date.now()-started;
    assert.ok(readbackAt>settledAt,'Bungie readback finished after the move was already shown');
    assert.equal(await page.locator(vault+' '+tile).count(),1,'Readback keeps the tile in the Vault');
    assert.equal(await page.locator('.vault-transfer-toast.is-error').count(),0);
    assert.equal(transfers.length,1,'Exactly one transfer call');
    assert.deepEqual(errors,[]);
    console.log(`INSTANT_MOVE_SUCCESS=PASS shown at ${Math.round(done)} ms, readback finished at about ${readbackAt} ms (fixture request ${REQUEST_MS} ms, profile lag ${PROFILE_LAG_MS} ms)`);
    await page.close();
  }
  // 2. Character to character (two calls) is shown as done when the second call is accepted.
  {
    const {page,errors,transfers}=await setup();
    await page.locator(tile).dblclick();
    const done=await timeTo(page,'.vault-transfer-toast.is-success');
    assert.equal(transfers.length,2,'Through the Vault in two calls');
    assert.ok(done<2600,`Two-call move shown when the second call is accepted (${Math.round(done)} ms)`);
    assert.equal(await page.locator('[data-drop-character-id="2"] [data-equipment-group="primary"] '+tile).count(),1);
    await page.waitForFunction(()=>!document.querySelector('[data-inspect-item="102"][aria-disabled]'),null,{timeout:PROFILE_LAG_MS*6});
    assert.equal(await page.locator('.vault-transfer-toast.is-error').count(),0);assert.deepEqual(errors,[]);
    console.log(`INSTANT_MOVE_TWO_CALLS=PASS shown at ${Math.round(done)} ms`);
    await page.close();
  }
  // 3. Bungie accepts but its inventory never shows the move: the toast turns to an error and the
  // tile is drawn where Bungie's fresh inventory says it is. Waits are scaled down for this case.
  {
    const {page,errors}=await setup({neverLands:true,scale:.02});
    await page.locator(tile).dblclick();
    await page.waitForSelector('.vault-transfer-toast.is-error',{timeout:20000});
    assert.equal(await page.locator('.vault-transfer-toast [role="alert"]').innerText(),'Transfer failed');
    assert.equal(await page.locator('[data-drop-character-id="1"] [data-equipment-group="primary"] '+tile).count(),1,'The tile is back where Bungie has it');
    assert.equal(await page.locator(tile+'[aria-disabled],'+tile+'.is-accepted').count(),0,'The tile can be moved again');
    assert.deepEqual(errors,[]);
    console.log('INSTANT_MOVE_MISMATCH=PASS error toast, tile drawn from Bungie inventory');
    await page.close();
  }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
