#!/usr/bin/env node
// Builder default load (no staged Forge Loader build), real page code.
// A fixture Bungie session and a prepared build-forge payload are served through the auth routes.
// The payload is the PF-BETA-09 Warlock loadout with its real Bungie definitions from the beta
// manifest cache. Test-only additions are marked: an Exotic intrinsic perk for the chest (the cache
// has none) and two in-game loadout slots that Bungie lists as empty (instance ID 0 entries).
// Asserts: every weapon and armour tile image loads (non-zero natural width); weapon frames follow
// rarity; the Exotic perk sits on its tile as a badge, not beside it; the Exotic and Super box shows
// the equipped Exotic; empty in-game slots show an empty state with a tooltip, never "!".
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
const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const cache=await readJson('astrix-app/data/paradox-forge/beta/beta-bungie-manifest-cache.json');
const loadout=(await readJson('astrix-app/data/paradox-forge/beta/ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json')).fixtures.find(row=>row.fixtureId==='PF-BETA-09');
const MANIFEST_VERSION=(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8')).match(/"manifestVersion":"([^"]+)"/)[1];

function definitionOf(row){
  const exotic=(row.traitIds||[]).some(id=>/\.exotic$/.test(id));
  return {hash:row.bungieHash,displayProperties:{name:row.display?.name||'',description:row.display?.description||'',icon:row.display?.icon||'',hasIcon:Boolean(row.display?.hasIcon)},iconWatermark:row.iconWatermark||'',itemType:row.itemType,itemSubType:row.itemSubType,itemTypeDisplayName:row.itemTypeDisplayName,classType:row.classType,itemCategoryHashes:row.itemCategoryHashes||[],traitIds:row.traitIds||[],defaultDamageTypeHash:row.defaultDamageTypeHash,equippingBlock:row.equippingBlock||{},inventory:{bucketTypeHash:row.equippingBlock?.equipmentSlotTypeHash??null,tierTypeName:exotic?'Exotic':'Legendary',tierType:exotic?6:5},sockets:{socketEntries:row.socketEntries||[]},stats:{stats:{}},investmentStats:[]};
}
const definitions=Object.fromEntries(Object.values(cache.inventoryItems).map(row=>[String(row.bungieHash),definitionOf(row)]));
const EXOTIC_CHEST=1003391927,FIXTURE_PERK=990010;
// Test-only: the Exotic intrinsic perk plug the cache lacks.
definitions[String(FIXTURE_PERK)]={hash:FIXTURE_PERK,itemType:19,itemTypeDisplayName:'Intrinsic',displayProperties:{name:'Fixture Exotic Perk',description:'Fixture Exotic perk text.',icon:'/common/destiny2_content/icons/fixture-perk.png',hasIcon:true},plug:{plugCategoryIdentifier:'intrinsics'},inventory:{tierTypeName:'Exotic',tierType:6}};
const CHARACTER='2305843009300000001',equipment=[],sockets={},instances={},expected=[];
let next=1;
for(const entry of loadout.rawDim.equipped){
  const row=cache.inventoryItems[entry.hash];if(!row)continue;
  const id=`69175290002${String(next++).padStart(8,'0')}`;
  equipment.push({itemHash:entry.hash,itemInstanceId:id,bucketHash:row.equippingBlock?.equipmentSlotTypeHash,quantity:1,state:0});
  instances[id]={primaryStat:row.itemType===16?undefined:{value:550},damageTypeHash:row.defaultDamageTypeHash||null,itemLevel:55,quality:0};
  sockets[id]={sockets:(row.socketEntries||[]).map((socket,index)=>({plugHash:entry.socketOverrides?.[String(index)]??(socket.singleInitialItemHash||undefined),isEnabled:true,isVisible:true}))};
  if(entry.hash===EXOTIC_CHEST)sockets[id].sockets[0].plugHash=FIXTURE_PERK;
  if([2,3].includes(row.itemType))expected.push({name:row.display.name,kind:row.itemType===3?'weapon':'armour',exotic:(row.traitIds||[]).some(t=>/\.exotic$/.test(t))});
}
// Slots 10 and 19 are empty in game: Bungie lists them with instance ID 0 entries.
const loadouts=Array.from({length:20},(_,index)=>({colorHash:0,iconHash:0,nameHash:0,items:index===9||index===18?[{itemInstanceId:'0',plugItemHashes:[]},{itemInstanceId:'0',plugItemHashes:[]}]:[]}));
const profile={
  characters:{data:{[CHARACTER]:{characterId:CHARACTER,classType:2,light:550,dateLastPlayed:'2026-10-01T00:00:00Z',emblemPath:'',emblemBackgroundPath:'',stats:{}}}},
  profileInventory:{data:{items:[]}},characterInventories:{data:{[CHARACTER]:{items:[]}}},characterEquipment:{data:{[CHARACTER]:{items:equipment}}},
  characterLoadouts:{data:{[CHARACTER]:{loadouts}}},
  itemComponents:{instances:{data:instances},stats:{data:{}},sockets:{data:sockets},reusablePlugs:{data:{}},perks:{data:{}}}
};
const envelope=page=>({schemaVersion:2,transport:'prepared-page-stream-v1',
  account:{profile,definitions,definitionCoverage:{complete:true,unresolved:[]},characterBuildCoverage:{complete:true},pageReady:{page,manifestVersion:MANIFEST_VERSION,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},
  prepared:{manifestVersion:MANIFEST_VERSION,page:'common',artifactCatalog:[{hash:1}]}});

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
  for(const width of [1600,1363]){
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin)return route.continue();
      if(url.hostname.endsWith('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});
      const json=body=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
      if(url.origin===AUTH&&request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
      if(url.origin===AUTH&&url.pathname==='/session')return json({authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'4611686018000000001',membershipType:3,displayName:'Fixture'},capabilities:{destinyActions:{}}});
      if(url.origin===AUTH&&url.pathname.startsWith('/bungie/page/'))return json(envelope(url.pathname.split('/').pop()));
      if(url.origin===AUTH&&url.pathname==='/bungie/profile')return json({profile,definitions});
      return route.abort();
    });
    await page.goto(origin+'/astrix-app/pages/guardian-workspace-v2/paradox-build-space/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelectorAll('#armourGrid .gear-slot .arm .tile-art img').length===5&&document.querySelectorAll('#weaponGrid .weap .art .tile-art img').length===3,null,{timeout:30000});
    // Every tile image loads: the browser must actually fetch and decode it.
    await page.waitForFunction(()=>[...document.querySelectorAll('#armourGrid .gear-slot .arm .tile-art img,#weaponGrid .weap .art .tile-art img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:15000}).catch(()=>{});
    const state=await page.evaluate(()=>({
      armour:[...document.querySelectorAll('#armourGrid .gear-slot .arm')].map(node=>{const img=node.querySelector('.tile-art img');return {name:node.title,natural:img?.naturalWidth||0,exoticTile:Boolean(node.querySelector('.item-tile--exotic')),badge:Boolean(node.querySelector(':scope>.armour-exotic-badge img')),strip:Boolean(node.closest('.gear-slot').querySelector('.armour-exotic-trait-strip'))};}),
      weapons:[...document.querySelectorAll('#weaponGrid .weap')].map(card=>{const art=card.querySelector('.art'),img=art.querySelector('.tile-art img');return {name:card._forgeWeapon?.name,natural:img?.naturalWidth||0,exoticCard:card.classList.contains('is-exotic'),frame:getComputedStyle(art,'::after').borderTopColor};}),
      panel:document.getElementById('buildSuperSynergy')?.innerText||'',
      slots:[9,18].map(index=>{const slot=document.querySelector(`[data-loadout-slot="${index}"]`);return {state:slot?.dataset.loadoutState,title:slot?.title,badge:Boolean(slot?.querySelector('.guardian-loadout-badge'))};})
    }));
    const byName=new Map(expected.map(row=>[row.name,row]));
    assert.equal(state.armour.length,5,`${width}: five armour tiles`);
    for(const row of state.armour){
      assert.ok(row.natural>0,`${width}: armour art for ${row.name} loaded`);
      assert.equal(row.exoticTile,byName.get(row.name)?.exotic===true,`${width}: ${row.name} frame follows its rarity`);
      assert.equal(row.strip,false,`${width}: nothing sits beside the ${row.name} tile`);
      if(byName.get(row.name)?.exotic)assert.equal(row.badge,true,`${width}: the Exotic perk is a badge on the ${row.name} tile`);
    }
    assert.equal(state.weapons.length,3,`${width}: three weapon tiles`);
    const frames=new Set();
    for(const row of state.weapons){
      assert.ok(row.natural>0,`${width}: weapon art for ${row.name} loaded`);
      const exotic=byName.get(row.name)?.exotic===true;
      assert.equal(row.exoticCard,exotic,`${width}: ${row.name} frame follows its rarity`);
      frames.add(`${exotic}:${row.frame}`);
    }
    assert.equal(new Set([...frames].map(key=>key.split(':')[0])).size,frames.size,`${width}: one frame colour per rarity`);
    assert.match(state.panel,/Equipped Exotic: Mataiodox/,`${width}: the Exotic and Super box shows the equipped Exotic`);
    assert.doesNotMatch(state.panel,/Stage a Forge Loader Exotic/,`${width}: no staged-build prompt on the default load`);
    for(const slot of state.slots){
      assert.equal(slot.state,'empty',`${width}: an empty in-game slot is shown as empty`);
      assert.match(slot.title,/Empty in game/,`${width}: the empty slot tooltip says so`);
      assert.equal(slot.badge,false,`${width}: no "!" on an empty in-game slot`);
    }
    assert.deepEqual(errors,[],`${width}: no page errors`);
    await context.close();
  }
  console.log('BUILD_FORGE_DEFAULT_LOAD=PASS 1600 and 1363: every weapon and armour image loads, frames follow rarity, Exotic perk badge on its tile, equipped Exotic in the Exotic and Super box, empty in-game slots shown as empty with a tooltip');
}finally{await browser?.close();server.close();}
