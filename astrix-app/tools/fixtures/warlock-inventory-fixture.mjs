// Test-only Warlock inventory for real-page browser tests (Character, Storage, Builder).
// Item definitions are Bungie's own, from the beta manifest cache (PF-BETA-09 equipped loadout plus
// other cached weapons, Warlock armour, Ghost, ship, Sparrow, emblem and artifact). Instance IDs,
// counts, and the two marked test-only rows (a Postmaster material and a consumable stack, which the
// cache does not hold) are fixture values. Never shown to a real player.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const CHARACTER_ID='2305843009300000001';
export const BUCKET=Object.freeze({postmaster:215593132,vault:138197802,primary:1498876634,special:2465295065,heavy:953998645,helmet:3448274439,gauntlets:3551918588,chest:14239492,legs:20886954,classItem:1585787867,ghost:4023194814,ship:284967655,vehicle:2025709351,emblem:4274335291,subclass:3284755031,artifact:1506418338,consumables:1469714392,modifications:3313201758});
const TEST_MATERIAL=990101,TEST_CONSUMABLE=990102;

export async function warlockInventoryFixture(root,{carriedPerWeaponBucket=9,carriedPerArmourBucket=6,vaultPerBucket=7}={}){
  const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
  const cache=await readJson('astrix-app/data/paradox-forge/beta/beta-bungie-manifest-cache.json');
  const loadout=(await readJson('astrix-app/data/paradox-forge/beta/ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json')).fixtures.find(row=>row.fixtureId==='PF-BETA-09');
  const manifestVersion=(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8')).match(/"manifestVersion":"([^"]+)"/)[1];
  const rows=Object.values(cache.inventoryItems),exotic=row=>(row.traitIds||[]).some(id=>/\.exotic$/.test(id));
  const definitionOf=row=>({hash:row.bungieHash,displayProperties:{name:row.display?.name||'',description:row.display?.description||'',icon:row.display?.icon||'',hasIcon:Boolean(row.display?.hasIcon)},iconWatermark:row.iconWatermark||'',itemType:row.itemType,itemSubType:row.itemSubType,itemTypeDisplayName:row.itemTypeDisplayName,classType:row.classType,itemCategoryHashes:row.itemCategoryHashes||[],traitIds:row.traitIds||[],defaultDamageTypeHash:row.defaultDamageTypeHash,equippingBlock:row.equippingBlock||{},inventory:{bucketTypeHash:row.equippingBlock?.equipmentSlotTypeHash??null,tierTypeName:exotic(row)?'Exotic':'Legendary',tierType:exotic(row)?6:5},sockets:{socketEntries:row.socketEntries||[]},stats:{stats:{}},investmentStats:[]});
  const definitions=Object.fromEntries(rows.map(row=>[String(row.bungieHash),definitionOf(row)]));
  // Test-only stacks the cache does not hold.
  definitions[TEST_MATERIAL]={hash:TEST_MATERIAL,itemType:0,itemTypeDisplayName:'Material',displayProperties:{name:'Fixture Material',icon:'/common/destiny2_content/icons/fixture-material.png',hasIcon:true},inventory:{bucketTypeHash:3865314626,tierTypeName:'Common',tierType:2}};
  definitions[TEST_CONSUMABLE]={hash:TEST_CONSUMABLE,itemType:9,itemTypeDisplayName:'Consumable',displayProperties:{name:'Fixture Consumable',icon:'/common/destiny2_content/icons/fixture-consumable.png',hasIcon:true},inventory:{bucketTypeHash:BUCKET.consumables,tierTypeName:'Common',tierType:2}};
  let next=1;const instances={},sockets={};
  const instance=(row,{bucketHash,overrides}={})=>{
    const id=`69175290003${String(next++).padStart(8,'0')}`;
    instances[id]={primaryStat:[2,3].includes(row.itemType)?{value:550}:undefined,damageTypeHash:row.defaultDamageTypeHash||null,itemLevel:55,quality:0};
    sockets[id]={sockets:(row.socketEntries||[]).map((socket,index)=>({plugHash:overrides?.[String(index)]??(socket.singleInitialItemHash||undefined),isEnabled:true,isVisible:true}))};
    return {itemHash:row.bungieHash,itemInstanceId:id,bucketHash:bucketHash??row.equippingBlock?.equipmentSlotTypeHash,quantity:1,state:0};
  };
  const equipped=[];
  for(const entry of loadout.rawDim.equipped){const row=cache.inventoryItems[entry.hash];if(row)equipped.push(instance(row,{overrides:entry.socketOverrides}));}
  const firstOf=type=>rows.find(row=>row.itemType===type);
  for(const type of [24,21,22,14,0])if(firstOf(type))equipped.push(instance(firstOf(type)));
  const legendaryWeapons=bucket=>rows.filter(row=>row.itemType===3&&!exotic(row)&&row.equippingBlock?.equipmentSlotTypeHash===bucket);
  const warlockArmour=bucket=>rows.filter(row=>row.itemType===2&&row.classType===2&&!exotic(row)&&row.equippingBlock?.equipmentSlotTypeHash===bucket);
  const carried=[],vault=[];
  for(const bucket of [BUCKET.primary,BUCKET.special,BUCKET.heavy]){
    const pool=legendaryWeapons(bucket);
    for(let i=0;i<carriedPerWeaponBucket&&pool.length;i++)carried.push(instance(pool[i%pool.length]));
    for(let i=0;i<vaultPerBucket&&pool.length;i++)vault.push(instance(pool[(i+3)%pool.length],{bucketHash:BUCKET.vault}));
  }
  for(const bucket of [BUCKET.helmet,BUCKET.gauntlets,BUCKET.chest,BUCKET.legs,BUCKET.classItem]){
    const pool=warlockArmour(bucket);
    for(let i=0;i<carriedPerArmourBucket&&pool.length;i++)carried.push(instance(pool[i%pool.length]));
    for(let i=0;i<vaultPerBucket&&pool.length;i++)vault.push(instance(pool[(i+2)%pool.length],{bucketHash:BUCKET.vault}));
  }
  for(const type of [24,21,22]){const extra=rows.filter(row=>row.itemType===type).slice(1,3);for(const row of extra)carried.push(instance(row));}
  carried.push({itemHash:TEST_CONSUMABLE,bucketHash:BUCKET.consumables,quantity:12,state:0});
  const postmaster=[{itemHash:TEST_MATERIAL,bucketHash:BUCKET.postmaster,quantity:25,state:0},{...instance(legendaryWeapons(BUCKET.primary)[0]),bucketHash:BUCKET.postmaster}];
  const profile={
    characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID,classType:2,light:550,dateLastPlayed:'2026-10-01T00:00:00Z',emblemPath:'',emblemBackgroundPath:'',stats:{}}}},
    profileInventory:{data:{items:vault}},characterInventories:{data:{[CHARACTER_ID]:{items:[...carried,...postmaster]}}},characterEquipment:{data:{[CHARACTER_ID]:{items:equipped}}},
    characterLoadouts:{data:{[CHARACTER_ID]:{loadouts:[]}}},
    itemComponents:{instances:{data:instances},stats:{data:{}},sockets:{data:sockets},reusablePlugs:{data:{}},perks:{data:{}}}
  };
  const envelope=page=>({schemaVersion:2,transport:'prepared-page-stream-v1',
    account:{profile,definitions,definitionCoverage:{complete:true,unresolved:[]},characterBuildCoverage:{complete:true},pageReady:{page,manifestVersion,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},
    prepared:{manifestVersion,page:'common',artifactCatalog:[{hash:1}]}});
  return {profile,definitions,envelope,manifestVersion,equippedCount:equipped.length};
}

// Routes a Playwright page to the fixture: Bungie session, prepared pages, live profile, and item art.
export async function routeWarlockFixture(page,{origin,fixture,art,auth='https://auth.astrixparadox.com',capabilities={transferItems:true,equipItems:true,pullFromPostmaster:true},actions=null}){
  await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    // Item art: Bungie's real icons from its public image CDN when FIXTURE_BUNGIE_ICONS=live (renders),
    // otherwise (and for the test-only rows) a local stand-in so the tests run offline. Never a sign-in or account call.
    if(url.hostname.endsWith('bungie.net'))return process.env.FIXTURE_BUNGIE_ICONS==='live'&&/^\/(common|img)\//.test(url.pathname)&&!url.pathname.includes('/fixture-')?route.continue():route.fulfill({contentType:'image/webp',body:art});
    const json=body=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
    if(url.origin===auth&&request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
    if(url.origin===auth&&url.pathname==='/session')return json({authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'4611686018000000001',membershipType:3,displayName:'Fixture'},capabilities:{destinyActions:capabilities}});
    if(url.origin===auth&&url.pathname.startsWith('/bungie/page/'))return json(fixture.envelope(url.pathname.split('/').pop()));
    if(url.origin===auth&&url.pathname==='/bungie/profile')return json({profile:fixture.profile,definitions:fixture.definitions});
    // Bungie mutation routes are only answered when a test collects them; nothing reaches Bungie.
    if(actions&&url.origin===auth&&url.pathname.startsWith('/bungie/actions/')){actions.push({path:url.pathname,body:request.postDataJSON()});return json({ErrorCode:1,ErrorStatus:'Success',Response:0});}
    return route.abort();
  });
}
