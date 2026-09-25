import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {transferFailureReason} from '../pages/vault/vault-transfer-feedback.mjs';
// Prompt 18: error wording is short and mapped, never raw transport details.
assert.equal(transferFailureReason('The Vault is full.'),'Vault full');
assert.equal(transferFailureReason('Item is currently equipped.'),'Item is equipped');
assert.equal(transferFailureReason('Destination has no space.'),'Inventory full');
assert.equal(transferFailureReason('Bungie service unavailable.'),'Bungie unavailable');
assert.equal(transferFailureReason('Bungie fixture failure'),'Transfer failed');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=await readFile(resolve(root,'astrix-app/pages/vault/vault.mjs'),'utf8');
// Exercise the actual page handlers without booting authentication or a live account.
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
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('\"','&quot;');
const byId=id=>document.getElementById(id),text=value=>String(value??'').trim(),itemKey=item=>String(item?.itemInstanceId||''),CLASS_NAMES=['titan','hunter','warlock'];
const session={authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'123',membershipType:3},liveActionCapabilities:{transferItems:true,equipItems:true}};
const payload={profile:{characters:{data:{'1':{characterId:'1',classType:0},'2':{characterId:'2',classType:1},'3':{characterId:'3',classType:2}}}}};
if(new URL(location.href).searchParams.has('hunter')){payload.profile.characters.data['1'].classType=1;payload.profile.characters.data['2'].classType=2;payload.profile.characters.data['3'].classType=0;}
let catalogue={items:['101','102','103'].map((id,index)=>({itemInstanceId:id,itemHash:1000+index,bucketHash:1498876634,name:'Fixture '+id,icon:location.origin+'/img/logo.png',equipmentGroup:INVENTORY_GROUPS[0],characterClass:'any',source:{kind:'carried',characterId:'1'}})),postmasterItems:[]};
let activeCharacterId='2',draggedItemKey='',pendingVaultAction=null,vaultActionBusy=false;
const vaultActionQueue=[],queuedVaultActionKeys=new Set(),setStatus=message=>byId('status').textContent=message,stagePostmasterCollection=()=>{throw Error('Unexpected Postmaster action');};
const transferFeedback=createVaultTransferFeedback({board:byId('vaultTransferWorkspace'),itemKey,characterLabel,canDrop:validFeedbackDrop});
// Only timing and HTTP origin are injected; the request sequence and bodies are production code.
const executeVaultTransferIntent=(intent,options)=>executeReal(intent,{...options,authOrigin:location.origin,waitImpl:async()=>{}});
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
render();installTransferEvents();window.restrictFixtureClass=()=>{catalogue.items.find(item=>item.itemInstanceId==='102').characterClass='titan';};window.fixtureReady=true;
`;
const html='<!doctype html><link rel="stylesheet" href="/css/astrix-palette.css"><link rel="stylesheet" href="/astrix-app/pages/vault/vault.css"><link rel="stylesheet" href="/astrix-app/shared/guardian-inventory-workspace.css"><link rel="stylesheet" href="/astrix-app/shared/item-tile.css"><link rel="stylesheet" href="/astrix-app/shared/astrix-desktop-density.css"><body class="apx-fluid-icons"><main class="vault-transfer-workspace"><div id="vaultTransferWorkspace" class="vault-transfer-board"></div></main><p id="status"></p><script type="module" src="/fixture.mjs"></script>';
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(path==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({channel:'chromium',headless:true});
 async function setup({fail=false,viewport={width:1363,height:900},hunterSource=false,reducedMotion='no-preference'}={}){
  const page=await browser.newPage({viewport,reducedMotion}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  const locations=new Map(['101','102','103'].map(id=>[id,{kind:'carried',characterId:'1'}]));
  const releases=[],gates=[0,1].map(()=>new Promise(done=>releases.push(done))),release=()=>releases.forEach(done=>done());
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin){await route.abort();return;}
   if(url.pathname==='/bungie/profile'){
    const profile={characters:{data:{'1':{},'2':{},'3':{}}},profileInventory:{data:{items:[]}},characterInventories:{data:{'1':{items:[]},'2':{items:[]},'3':{items:[]}}}};
    for(const [id,at] of locations){const item={itemInstanceId:id,itemHash:1000+Number(id)-101,bucketHash:at.kind==='vault'?138197802:1498876634};(at.kind==='vault'?profile.profileInventory.data.items:profile.characterInventories.data[at.characterId].items).push(item);}
    await route.fulfill({json:{profile}});return;
   }
   if(url.pathname==='/bungie/actions/transfer-item'){
    const body=request.postDataJSON();requests.push(body);await gates[Math.min(requests.length-1,1)];
    if(fail){await route.fulfill({status:400,json:{ErrorCode:99,Message:'Bungie fixture failure'}});return;}
    locations.set(body.itemId,body.transferToVault?{kind:'vault',characterId:null}:{kind:'carried',characterId:body.characterId});
    await route.fulfill({json:{ErrorCode:1}});return;
   }
   if(url.pathname.startsWith('/bungie/'))throw Error('Unexpected Bungie route '+url.pathname);
   await route.continue();
  });
  await page.goto(origin+(hunterSource?'/?hunter':''));await page.waitForFunction(()=>window.fixtureReady);
  return {page,errors,requests,release,releaseStep:step=>releases[step-1]()};
 }
 const tile='[data-inspect-item="102"]',sourceRow='[data-drop-character-id="1"] [data-equipment-group="primary"] .vault-transfer-items',vault='[data-drop-kind="vault"] [data-equipment-group="primary"]',hunter='[data-drop-character-id="2"] [data-equipment-group="primary"]';
 async function drag(page){
  await page.evaluate(()=>{window.dragData=new DataTransfer();document.querySelector('[data-inspect-item="102"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.dragData}));});
 }
 async function drop(page,target){
  await page.evaluate(selector=>{const node=document.querySelector(selector);for(const type of ['dragover','drop'])node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:window.dragData}));},target);
 }
 async function count(page,selector,n){assert.equal(await page.locator(selector).count(),n,selector);}
 async function minimalToast(page,destination){
  const toast=page.locator('.vault-transfer-toast');
  assert.deepEqual(await toast.locator('> div').innerText().then(text=>text.split('\n').filter(Boolean)),['Fixture 102',`Transfer to ${destination}`]);
  assert.doesNotMatch(await toast.innerText(),/ownership|evidence|verified|authenticated|authoritative|Moving|complete/i);
  await count(page,'.vault-transfer-toast > img',1);await count(page,'.vault-transfer-toast > button:visible',1);
  await count(page,'.vault-transfer-toast-status:visible,.vault-transfer-toast-mark:visible',0);
  assert.equal(await toast.locator('.vault-transfer-toast-mark').evaluate(node=>getComputedStyle(node).animationName),'none','No spinner');
 }
 for(const viewport of [{width:1363,height:900},{width:2560,height:1440}]){
  const test=await setup({viewport,hunterSource:true}),{page}=test;
  const buckets=['primary','special','heavy','helmet','gauntlets','chest','legs','class-item','ghost','ship','sparrow'];
  for(const column of ['[data-drop-character-id="1"]','[data-drop-character-id="2"]','[data-drop-character-id="3"]','[data-drop-kind="vault"]']){
   assert.deepEqual(await page.locator(column+' .vault-transfer-group').evaluateAll(nodes=>nodes.map(node=>node.dataset.equipmentGroup)),buckets,'Every bucket remains a destination, including empty buckets');
   const emptyHeights=await page.locator(column+' .vault-transfer-row-empty').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,normal:parseFloat(getComputedStyle(node).minHeight)})));
   assert.equal(emptyHeights.length,column.includes('"1"')?10:11);
   assert.ok(emptyHeights.every(({height,normal})=>height>=normal-0.02&&normal>0),'Empty rows retain normal tile height');
  }
  await drag(page);
  assert.deepEqual(await page.locator('.is-drop-active').evaluateAll(nodes=>nodes.map(node=>{const column=node.closest('[data-drop-kind]');return [column.dataset.dropKind==='vault'?'Vault':column.querySelector('h3').textContent,node.dataset.equipmentGroup];})),[['WARLOCK','primary'],['TITAN','primary'],['Vault','primary']]);
  if(viewport.width===2560){
   const rows=await page.locator('[data-equipment-group="primary"]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height,left:r.left};}));
   assert.equal(rows.length,4);
   assert.ok(rows.every((r,i)=>!i||r.left>rows[i-1].left),'Four columns are side by side');
   const track=await page.locator('#vaultTransferWorkspace').evaluate(node=>parseFloat(getComputedStyle(node).gridTemplateRows.split(' ')[4]));
   assert.ok(track>0);
   for(const row of rows){assert.ok(Math.abs(row.top-rows[0].top)<=1,'Primary tops align within 1px');assert.ok(Math.abs(row.height-track)<=1,'Every Primary group fills the aligned grid row');}
  }else{
   assert.ok(await page.locator('[data-drop-kind="vault"]').evaluate(node=>node.getBoundingClientRect().top>=document.querySelector('.vault-character-columns').getBoundingClientRect().bottom),'Vault stacks below characters');
  }
  await count(page,'.is-drop-active',3); // Other two Guardians and Vault, same bucket only.
  await count(page,'[data-drop-character-id="1"] .is-drop-active',0);
  await count(page,'[data-equipment-group="special"].is-drop-active',0);
  await count(page,tile+'.is-dragging',1);await count(page,'.vault-drag-ghost',1);
  await page.evaluate(selector=>document.querySelector(selector).dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.dragData})),vault);
  await count(page,vault+'.is-drop-target',1);
  await drop(page,vault);
  await count(page,vault+' '+tile+'.is-moving',1);await count(page,'.vault-transfer-toast.is-moving',1);
  assert.match(await page.locator('.vault-transfer-toast').innerText(),/Transfer to Vault/);
  await minimalToast(page,'Vault');
  await page.waitForFunction(()=>Number(document.querySelector('.vault-transfer-toast').dataset.progress)>0);
  const waiting=Number(await page.locator('.vault-transfer-toast').getAttribute('data-progress'));assert.ok(waiting>0&&waiting<.9,'Single-call fill eases towards, never exceeds, 90% before confirmation');
  await count(page,'.is-drop-active,.is-drop-target,.vault-drag-ghost',0);
  assert.equal(await page.locator(tile).getAttribute('aria-busy'),'true');
  test.release();await page.waitForSelector('.vault-transfer-toast.is-success');
  assert.equal(await page.locator('.vault-transfer-toast').getAttribute('data-progress'),'1');
  await count(page,'.vault-transfer-toast > button:visible',0);assert.equal(await page.locator('.vault-transfer-toast-mark:visible').innerText(),'✓');
  await count(page,vault+' '+tile,1);await count(page,tile+'.is-moving',0);
  assert.deepEqual(test.requests,[{membershipType:3,characterId:'1',itemId:'102',itemReferenceHash:1001,stackSize:1,transferToVault:true}]);
  const completedAt=Date.now();await page.waitForTimeout(1500);await count(page,'.vault-transfer-toast.is-success',1);
  await page.waitForSelector('.vault-transfer-toast',{state:'detached',timeout:1200});assert.ok(Date.now()-completedAt<2700,'Success auto-dismisses after 2s');
  assert.deepEqual(test.errors,[]);await page.close();
 }
 {
  const test=await setup({fail:true}),{page}=test;
  const before=await page.locator(sourceRow+' > [data-inspect-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.inspectItem));
  await drag(page);await drop(page,vault);await count(page,vault+' '+tile+'.is-moving',1);
  test.release();await page.waitForSelector('.vault-transfer-toast.is-error');
  assert.deepEqual(await page.locator(sourceRow+' > [data-inspect-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.inspectItem)),before,'Failure restores the exact original slot even after profile rerender');
  // Prompt 18: retain the error assertion with the exact mapped short reason.
  assert.equal(await page.locator('.vault-transfer-toast [role="alert"]').innerText(),'Transfer failed');
  assert.equal(await page.locator('.vault-transfer-toast-fill').evaluate(node=>{const probe=document.createElement('span');probe.style.color='var(--apx-colour-action)';node.append(probe);const matches=getComputedStyle(node).backgroundColor===getComputedStyle(probe).color;probe.remove();return matches;}),true,'Failure fill is the red action token');
  await page.waitForTimeout(3100);await count(page,'.vault-transfer-toast.is-error',1);
  await page.locator('.vault-transfer-toast button').click();await count(page,'.vault-transfer-toast',0);
  await count(page,'.is-drop-active,.is-drop-target,.is-moving',0);assert.deepEqual(test.errors,[]);await page.close();
 }
 for(const gesture of ['double-click','Enter','Space']){
  const test=await setup(),{page}=test;
  if(gesture==='double-click')await page.locator(tile).dblclick();else{await page.locator(tile).focus();await page.keyboard.press(gesture);}
  await count(page,hunter+' '+tile+'.is-moving',1);await count(page,'.vault-transfer-toast.is-moving',1);
  assert.match(await page.locator('.vault-transfer-toast').innerText(),/Transfer to Hunter/);
  await minimalToast(page,'Hunter');
  assert.equal(await page.locator('.vault-transfer-toast').getAttribute('data-progress'),'0');
  test.releaseStep(1);await page.waitForFunction(()=>document.querySelector('.vault-transfer-toast').dataset.progress==='0.5');
  await page.waitForFunction(()=>{
   const node=document.querySelector('.vault-transfer-toast-fill');
   if(!node)return false;
   const fill=node.getBoundingClientRect(),toast=node.parentElement.getBoundingClientRect();
   return Math.abs(fill.width-(toast.width-2)/2)<=1&&Math.abs(fill.left-toast.left)<=1;
  },null,{timeout:3000});
  const halfway=await page.locator('.vault-transfer-toast-fill').evaluate(node=>{const r=node.getBoundingClientRect(),toast=node.parentElement.getBoundingClientRect();return {width:r.width,full:toast.width,left:r.left,toastLeft:toast.left};});
  assert.ok(Math.abs(halfway.width-(halfway.full-2)/2)<=1,'First accepted call fills exactly half the toast');assert.ok(Math.abs(halfway.left-halfway.toastLeft)<=1,'Fill starts at the left edge');
  assert.equal(test.requests.length,2,'Second call waits after the first succeeds');
  test.releaseStep(2);await page.waitForSelector('.vault-transfer-toast.is-success');await count(page,hunter+' '+tile,1);
  assert.equal(await page.locator('.vault-transfer-toast').getAttribute('data-progress'),'1');
  await page.waitForFunction(()=>{
   const node=document.querySelector('.vault-transfer-toast-fill');
   if(!node)return false;
   const fill=node.getBoundingClientRect(),toast=node.parentElement.getBoundingClientRect();
   return Math.abs(fill.width-(toast.width-2))<=1&&Math.abs(fill.left-toast.left)<=1;
  },null,{timeout:3000});
  assert.ok(await page.locator('.vault-transfer-toast-fill').evaluate(node=>Math.abs(node.getBoundingClientRect().width-(node.parentElement.getBoundingClientRect().width-2))<=1),'Success fills the entire toast');
  assert.deepEqual(test.requests.map(({characterId,transferToVault})=>({characterId,transferToVault})),[{characterId:'1',transferToVault:true},{characterId:'2',transferToVault:false}]);
  assert.deepEqual(test.errors,[]);await page.close();
 }
 {
  const test=await setup({reducedMotion:'reduce'}),{page}=test;
  await page.locator(tile).dblclick();test.releaseStep(1);
  await page.waitForFunction(()=>document.querySelector('.vault-transfer-toast').dataset.progress==='0.5');
  assert.deepEqual(await page.locator('.vault-transfer-toast-fill').evaluate(node=>({transition:getComputedStyle(node).transitionDuration,animation:getComputedStyle(node,'::after').animationName})),{transition:'0s',animation:'none'},'Reduced motion has stepped fill and no shimmer');
  test.releaseStep(2);await page.waitForSelector('.vault-transfer-toast.is-success');assert.deepEqual(test.errors,[]);await page.close();
 }
 {
  const test=await setup(),{page}=test;await drag(page);
  await page.locator(tile).dispatchEvent('dragend');await count(page,'.is-drop-active,.is-drop-target,.is-dragging,.vault-drag-ghost',0);
  await page.locator(tile).dblclick();await page.locator('[data-inspect-item="103"]').dblclick();
  await count(page,'.vault-transfer-toast.is-moving',2);await count(page,hunter+' .is-moving',2);
  test.release();await page.waitForFunction(()=>document.querySelectorAll('.vault-transfer-toast.is-success').length===2);
  assert.equal(test.requests.length,4);assert.deepEqual(test.errors,[]);await page.close();
 }
 {
  const test=await setup(),{page}=test;await page.evaluate(()=>window.restrictFixtureClass());await drag(page);
  await count(page,'.is-drop-active',1);await count(page,vault+'.is-drop-active',1);
  await drop(page,hunter);await count(page,sourceRow+' '+tile,1);await count(page,'.vault-transfer-toast',0);
  assert.equal(test.requests.length,0);assert.deepEqual(test.errors,[]);await page.close();
 }
 // Prompt 16: a held edge drag reaches the initially off-screen Vault without wheel input.
 for(const pointer of [false,true]){
  const test=await setup(),{page}=test;
  await page.evaluate(()=>{
   const header=document.createElement('header');header.className='apx-destination-header';header.style.cssText='position:fixed;top:0;left:0;right:0;height:120px;z-index:10';document.body.append(header);
   document.querySelector('[data-drop-character-id="1"]').setAttribute('aria-label','Hunter');
  });
  assert.ok(await page.locator(vault).evaluate(node=>node.getBoundingClientRect().top>innerHeight),'Vault initially below viewport');
  if(pointer){
   await page.evaluate(()=>{
    const node=document.querySelector('[data-inspect-item="102"]');node.setPointerCapture=()=>{};node.releasePointerCapture=()=>{};
    node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,pointerType:'touch',button:0,clientX:400,clientY:300}));
    node.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:7,pointerType:'touch',clientX:400,clientY:innerHeight-1}));
   });
  }else{
   await drag(page);
   await page.evaluate(()=>document.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.dragData,clientX:400,clientY:innerHeight-1})));
  }
  await page.waitForFunction(()=>scrollY>100);
  await page.waitForFunction(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.top<innerHeight-120&&r.bottom>120;},vault);
  if(pointer){
   await page.evaluate(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();
    document.querySelector('[data-inspect-item="102"]').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:7,pointerType:'touch',clientX:r.left+r.width/2,clientY:Math.max(125,r.top+10)}));
   },vault);
  }else await drop(page,vault);
  await count(page,vault+' '+tile+'.is-moving',1);
  const stopped=await page.evaluate(()=>scrollY);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>scrollY),stopped,'Auto-scroll stops on drop');
  test.release();await page.waitForSelector('.vault-transfer-toast.is-success');assert.deepEqual(test.errors,[]);await page.close();
 }
 console.log('Vault feedback: drag activation, instant landing, real mocked Bungie sequence, success, exact rollback, keyboard, double click and stacked queue passed.');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
