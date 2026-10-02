#!/usr/bin/env node
// Storage and Character on phone and tablet (2 Oct 2026).
// Storage runs the real page (vault.mjs and its modules) with a fixture Bungie session and a
// fixture prepared page served through the auth routes. Bungie mutation routes are captured, so the
// test sees exactly what the real postmasterActions and stagePostmasterCollection send.
//   - Postmaster items are icons only. A weapon opens its item card, an engram and a material open
//     the action sheet; each offers "Pull to <Guardian>".
//   - The weapon and the engram are pulled with their own character and exact item.
//   - A material stack Bungie lists without an exact item ID shows the pull disabled, with the reason.
//   - A session without the Postmaster permission shows the pull disabled, with the reason.
//   - No EQUIPPED AND CARRIED box; tiles at least 64px (72px tablet), 4px gap, rows filled edge to edge.
//   - Desktop (1600) keeps the PULL buttons and the box, and its item card has no extra action.
// Character (page scripts stripped, real Super formation modules): only the selected Super has the
// Ember diamond frame and nothing is laid over the icon; desktop keeps the framed formation.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const AUTH='https://auth.astrixparadox.com';
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    let data=await readFile(file);
    // Only the Character harness strips page scripts; Storage runs its real modules.
    if(file.endsWith('.html')&&url.searchParams.has('strip'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});

// Fixture Bungie data. Hashes and names are test-only; bucket hashes are Bungie's own.
const BUCKET={postmaster:215593132,vault:138197802,primary:1498876634,special:2465295065,heavy:953998645,engrams:375726501,materials:3865314626};
const POSTMASTER={weapon:{itemHash:910001,itemInstanceId:'6917529000000000101',name:'Fixture Postmaster Weapon'},engram:{itemHash:910002,itemInstanceId:'6917529000000000102',name:'Fixture Postmaster Engram'},material:{itemHash:910003,name:'Fixture Postmaster Material',quantity:25}};
// Storage checks the prepared manifest version against the shipped Forge armour index.
const MANIFEST_VERSION=(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8')).match(/"manifestVersion":"([^"]+)"/)[1];
function preparedEnvelope(){
  const definitions={},instances={},icon='/common/destiny2_content/icons/fixture.png';
  const define=(hash,name,bucketTypeHash,itemType)=>{definitions[String(hash)]={hash,itemType,displayProperties:{name,icon},inventory:{bucketTypeHash,tierType:5},equippable:itemType===3};};
  define(POSTMASTER.weapon.itemHash,POSTMASTER.weapon.name,BUCKET.primary,3);
  define(POSTMASTER.engram.itemHash,POSTMASTER.engram.name,BUCKET.engrams,8);
  define(POSTMASTER.material.itemHash,POSTMASTER.material.name,BUCKET.materials,0);
  let next=1;
  const weapon=(bucket,index,location)=>{const hash=920000+next,id=`69175290001${String(next++).padStart(8,'0')}`;define(hash,`Fixture ${location} weapon ${index+1}`,bucket,3);instances[id]={primaryStat:{value:550}};return {itemHash:hash,itemInstanceId:id,bucketHash:location==='vault'?BUCKET.vault:bucket,quantity:1,state:0};};
  const carried=[],equipped=[],vault=[];
  for(const bucket of [BUCKET.primary,BUCKET.special,BUCKET.heavy]){
    equipped.push(weapon(bucket,0,'equipped'));
    for(let i=0;i<9;i++)carried.push(weapon(bucket,i,'carried'));
    for(let i=0;i<12;i++)vault.push(weapon(bucket,i,'vault'));
  }
  instances[POSTMASTER.weapon.itemInstanceId]={primaryStat:{value:550}};
  const postmaster=[
    {itemHash:POSTMASTER.weapon.itemHash,itemInstanceId:POSTMASTER.weapon.itemInstanceId,bucketHash:BUCKET.postmaster,quantity:1,state:0},
    {itemHash:POSTMASTER.engram.itemHash,itemInstanceId:POSTMASTER.engram.itemInstanceId,bucketHash:BUCKET.postmaster,quantity:1,state:0},
    {itemHash:POSTMASTER.material.itemHash,bucketHash:BUCKET.postmaster,quantity:POSTMASTER.material.quantity,state:0}
  ];
  const profile={
    characters:{data:{'2':{characterId:'2',classType:2,light:550,dateLastPlayed:'2026-10-01T00:00:00Z',emblemBackgroundPath:''}}},
    profileInventory:{data:{items:vault}},
    characterInventories:{data:{'2':{items:[...carried,...postmaster]}}},
    characterEquipment:{data:{'2':{items:equipped}}},
    itemComponents:{instances:{data:instances},stats:{data:{}},sockets:{data:{}},reusablePlugs:{data:{}}}
  };
  return {profile,body:{schemaVersion:2,transport:'prepared-page-stream-v1',
    account:{profile,definitions,definitionCoverage:{complete:true,unresolved:[]},pageReady:{page:'vault',manifestVersion:MANIFEST_VERSION,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},
    prepared:{manifestVersion:MANIFEST_VERSION,page:'common'}}};
}

let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const art=await readFile(resolve(root,'img/ax-logo-160.webp'));
  const fixture=preparedEnvelope();

  async function openStorage(width,{pullAllowed=true}={}){
    const context=await browser.newContext({viewport:{width,height:width<600?844:width<1200?1180:900}});
    const page=await context.newPage(),errors=[],pulls=[];
    // Live profile reads behave like Bungie: a pulled item leaves the Postmaster for its own bucket.
    const live=structuredClone(fixture.profile),home={[POSTMASTER.weapon.itemInstanceId]:BUCKET.primary,[POSTMASTER.engram.itemInstanceId]:BUCKET.engrams};
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin)return route.continue();
      if(url.hostname.endsWith('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
      if(url.origin===AUTH&&request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
      if(url.origin===AUTH&&url.pathname==='/session')return json({authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'4611686018000000001',membershipType:3,displayName:'Fixture'},capabilities:{destinyActions:{transferItems:true,equipItems:true,pullFromPostmaster:pullAllowed}}});
      if(url.origin===AUTH&&url.pathname==='/bungie/page/vault')return json(fixture.body);
      if(url.origin===AUTH&&url.pathname==='/bungie/profile')return json({profile:live});
      if(url.origin===AUTH&&url.pathname==='/bungie/actions/pull-from-postmaster'){
        const body=request.postDataJSON();pulls.push(body);
        for(const item of live.characterInventories.data['2'].items)if(item.itemInstanceId===String(body.itemId)&&home[item.itemInstanceId])item.bucketHash=home[item.itemInstanceId];
        return json({ErrorCode:1,ErrorStatus:'Success',Response:0});
      }
      return route.abort();
    });
    await page.goto(origin+'/astrix-app/pages/vault/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#vaultTransferWorkspace .vault-postmaster-section [data-inspect-item]',{timeout:20000}).catch(async error=>{
      console.log('STATUS',await page.evaluate(()=>[document.getElementById('vaultConnectionState')?.textContent,document.querySelector('[role="status"]')?.textContent,document.getElementById('vaultTransferWorkspace')?.innerHTML.slice(0,300)].join(' | ')));
      throw error;
    });
    await page.waitForTimeout(300);
    return {page,context,errors,pulls};
  }
  const tileByName=(page,name)=>page.locator(`#vaultTransferWorkspace .vault-postmaster-section [data-inspect-item][title="${name}"]`);

  for(const width of [390,820]){
    const {page,context,errors,pulls}=await openStorage(width);
    const layout=await page.evaluate(()=>{
      const visible=node=>node&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0;
      const row=selector=>{
        const grid=document.querySelector(selector),cells=[...grid.children].filter(visible),boxes=cells.map(cell=>cell.getBoundingClientRect()),first=boxes.filter(box=>Math.abs(box.top-boxes[0].top)<2);
        return {tile:first[0].width,gap:first.length>1?first[1].left-first[0].right:0,wraps:boxes.length>first.length,orphan:grid.getBoundingClientRect().right-Math.max(...first.map(box=>box.right))};
      };
      return {pull:[...document.querySelectorAll('.vault-postmaster-pull')].filter(visible).length,
        box:[...document.querySelectorAll('.vault-equipped-carried-section>header')].filter(visible).length,
        weapons:visible(document.querySelector('.vault-equipped-carried-section>h5.vault-transfer-family')),
        carried:row('.vault-character-column .vault-equipped-carried-section .vault-transfer-items'),vault:row('.vault-only-section .vault-transfer-items'),
        hscroll:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(layout.hscroll,false,`${width}: no sideways scroll`);
    assert.equal(layout.pull,0,`${width}: Postmaster shows icons only`);
    assert.equal(layout.box,0,`${width}: no EQUIPPED AND CARRIED box`);
    assert.equal(layout.weapons,false,`${width}: no WEAPONS subheading under the Guardian`);
    for(const [name,row] of Object.entries({carried:layout.carried,vault:layout.vault})){
      assert.ok(row.tile>=(width<600?64:72)-0.5,`${width} ${name}: tiles at least ${width<600?64:72}px (got ${row.tile})`);
      assert.ok(Math.abs(row.gap-4)<0.6,`${width} ${name}: 4px gap (got ${row.gap})`);
      // A full row (the group wraps) reaches the right edge; a group shorter than one row keeps its tile size.
      assert.ok(row.wraps,`${width} ${name}: the fixture group wraps`);
      assert.ok(Math.abs(row.orphan)<1,`${width} ${name}: the row is filled edge to edge (orphan ${row.orphan})`);
    }

    // Weapon: the item card carries the pull.
    await tileByName(page,POSTMASTER.weapon.name).click();
    const cardPull=page.locator('#paradoxItemInspect [data-paradox-inspect-action]');
    await cardPull.waitFor({state:'visible',timeout:3000});
    assert.equal(await cardPull.innerText(),'Pull to Warlock');
    assert.equal(await cardPull.isEnabled(),true);
    assert.ok((await cardPull.boundingBox()).height>=44,'The pull button is a 44px touch target');
    await cardPull.click();
    assert.equal(await page.locator('#paradoxItemInspect').isHidden(),true,'The card closes after the pull');
    await page.waitForTimeout(400);

    // Engram (no item card): the action sheet with icon, name and the pull.
    await tileByName(page,POSTMASTER.engram.name).click();
    const sheet=page.locator('.vault-postmaster-sheet');
    await sheet.waitFor({state:'visible',timeout:3000});
    assert.equal(await sheet.locator('#vaultPostmasterSheetName').innerText(),POSTMASTER.engram.name);
    assert.equal(await sheet.locator('header img').count(),1,'The sheet shows the item icon');
    const sheetPull=sheet.locator('[data-postmaster-sheet-pull]');
    assert.equal(await sheetPull.innerText(),'Pull to Warlock');
    assert.equal(await sheetPull.isEnabled(),true);
    assert.equal(await page.evaluate(()=>document.activeElement?.matches('[data-postmaster-sheet-pull]')),true,'Focus moves to the pull');
    assert.ok((await sheetPull.boundingBox()).height>=44);
    await sheetPull.click();
    assert.equal(await sheet.count(),0,'The sheet closes after the pull');

    // Both pulls reach Bungie with the right character and exact item (real stagePostmasterCollection path).
    const deadline=Date.now()+15000;
    while(pulls.length<2&&Date.now()<deadline)await page.waitForTimeout(200);
    const sent=pulls.map(body=>({characterId:String(body.characterId),itemId:String(body.itemId),itemReferenceHash:Number(body.itemReferenceHash)}));
    assert.deepEqual(sent,[
      {characterId:'2',itemId:POSTMASTER.weapon.itemInstanceId,itemReferenceHash:POSTMASTER.weapon.itemHash},
      {characterId:'2',itemId:POSTMASTER.engram.itemInstanceId,itemReferenceHash:POSTMASTER.engram.itemHash}
    ],`${width}: weapon and engram pulled from Warlock's Postmaster with their exact items`);

    // Material stack without an exact item ID: the pull is shown, disabled, with the reason.
    await tileByName(page,POSTMASTER.material.name).click();
    await sheet.waitFor({state:'visible',timeout:3000});
    assert.match(await sheet.locator('header span').innerText(),/STACK OF 25/,'The sheet shows the stack count');
    assert.equal(await sheet.locator('[data-postmaster-sheet-pull]').isDisabled(),true,'The material pull is disabled, not hidden');
    assert.match(await sheet.locator('.vault-postmaster-sheet-reason').innerText(),/without an exact item ID/);
    assert.equal(await sheet.locator('[data-postmaster-sheet-pull]').getAttribute('aria-describedby'),'vaultPostmasterSheetReason');
    await page.keyboard.press('Escape');
    assert.equal(await sheet.count(),0,'Escape closes the sheet');
    await page.waitForTimeout(300);
    assert.equal(pulls.length,2,'No request is sent for the material');
    assert.deepEqual(errors,[]);await context.close();
  }

  {
    // A session without the Postmaster permission: the pull is disabled with the reason.
    const {page,context,errors,pulls}=await openStorage(390,{pullAllowed:false});
    await tileByName(page,POSTMASTER.weapon.name).click();
    const cardPull=page.locator('#paradoxItemInspect [data-paradox-inspect-action]');
    await cardPull.waitFor({state:'visible',timeout:3000});
    assert.equal(await cardPull.isDisabled(),true);
    assert.match(await page.locator('#paradoxItemInspect .paradox-inventory-inspect-reason').innerText(),/has not allowed Postmaster pulls/);
    await page.keyboard.press('Escape');
    await tileByName(page,POSTMASTER.engram.name).click();
    assert.equal(await page.locator('.vault-postmaster-sheet [data-postmaster-sheet-pull]').isDisabled(),true);
    assert.match(await page.locator('.vault-postmaster-sheet-reason').innerText(),/has not allowed Postmaster pulls/);
    assert.equal(pulls.length,0);
    assert.deepEqual(errors,[]);await context.close();
  }

  {
    // Desktop keeps the PULL buttons and the box; the item card has no extra action and no sheet opens.
    const {page,context,errors}=await openStorage(1600);
    const desktop=await page.evaluate(()=>({pull:[...document.querySelectorAll('.vault-postmaster-pull')].filter(node=>node.getBoundingClientRect().width>0).length,box:[...document.querySelectorAll('.vault-equipped-carried-section>header')].filter(node=>node.getBoundingClientRect().height>0).length}));
    assert.equal(desktop.pull,3,'Desktop keeps a PULL button on every Postmaster item');
    assert.ok(desktop.box>=1,'Desktop keeps the EQUIPPED AND CARRIED box');
    await tileByName(page,POSTMASTER.weapon.name).click();
    await page.locator('#paradoxItemInspect').waitFor({state:'visible',timeout:3000});
    assert.equal(await page.locator('#paradoxItemInspect [data-paradox-inspect-action]').count(),0,'Desktop item card has no extra action');
    await page.keyboard.press('Escape');
    await tileByName(page,POSTMASTER.engram.name).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.vault-postmaster-sheet').count(),0,'Desktop opens no action sheet');
    assert.deepEqual(errors,[]);await context.close();
  }

  for(const width of [390,820,1600]){
    const compact=width<1200,page=await browser.newPage({viewport:{width,height:width<600?844:width<1200?1180:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin))return route.continue();if(url.includes('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});return route.abort();});
    await page.goto(origin+'/astrix-app/pages/guardian-workspace-v2/?strip',{waitUntil:'domcontentloaded'});
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
  console.log('STORAGE_CHARACTER_MOBILE=PASS real Storage page at 390 and 820: weapon (item card) and engram (action sheet) pulled from the right Postmaster with their exact items, material stack and missing permission shown disabled with the reason, icons only, no EQUIPPED AND CARRIED box, filled rows of 64px/72px tiles with a 4px gap; 1600 unchanged; selected Super framed in Ember on phone and tablet only');
}finally{await browser?.close();server.close();}
