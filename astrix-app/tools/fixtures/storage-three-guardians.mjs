// Storage fixture with three Guardians (Warlock active, Titan and Hunter not) and a Vault.
// Test-only hashes, names and IDs. The routed auth Worker behaves like Bungie: a transfer
// moves the exact item in the live profile, unless the test asks for a failure.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const AUTH='https://auth.astrixparadox.com';
export const BUCKET=Object.freeze({primary:1498876634,special:2465295065,heavy:953998645,vault:138197802,postmaster:215593132});
export const GUARDIANS=Object.freeze({warlock:'2305843009000000002',titan:'2305843009000000001',hunter:'2305843009000000003'});
export async function storageFixture(root,{full=false}={}){
  const MANIFEST_VERSION=(await readFile(resolve(root,'astrix-app/data/forge-armour-index.json'),'utf8')).match(/"manifestVersion":"([^"]+)"/)[1];
  const definitions={},instances={};let next=1;
  const define=(hash,name,bucketTypeHash)=>{definitions[String(hash)]={hash,itemType:3,classType:3,displayProperties:{name,icon:'/common/destiny2_content/icons/fixture.png'},inventory:{bucketTypeHash,tierType:5},equippable:true};};
  const weapon=(bucket,name,storage=bucket)=>{const hash=930000+next,id=`69175290002${String(next++).padStart(8,'0')}`;define(hash,name,bucket);instances[id]={primaryStat:{value:550}};return {itemHash:hash,itemInstanceId:id,bucketHash:storage,quantity:1,state:0};};
  const characters={},characterInventories={},characterEquipment={};
  for(const [key,id] of Object.entries(GUARDIANS)){
    const classType={titan:0,hunter:1,warlock:2}[key];
    characters[id]={characterId:id,classType,light:550,dateLastPlayed:key==='warlock'?'2026-10-02T00:00:00Z':'2026-09-20T00:00:00Z',emblemBackgroundPath:''};
    characterEquipment[id]={items:[BUCKET.primary,BUCKET.special,BUCKET.heavy].map(bucket=>weapon(bucket,`${key} equipped ${bucket}`))};
    characterInventories[id]={items:[...[BUCKET.primary,BUCKET.special,BUCKET.heavy].flatMap(bucket=>Array.from({length:full?9:3},(_,i)=>weapon(bucket,`${key} carried ${i}`))),...(full&&key==='hunter'?Array.from({length:12},(_,i)=>weapon(BUCKET.primary,`${key} postmaster ${i}`,BUCKET.postmaster)):[])]};
  }
  const vault=[weapon(BUCKET.primary,'Fixture Bad Juju',BUCKET.vault),...Array.from({length:full?120:4},(_,i)=>weapon([BUCKET.primary,BUCKET.special,BUCKET.heavy][i%3],`Vault weapon ${i}`,BUCKET.vault))];
  const profile={characters:{data:characters},profileInventory:{data:{items:vault}},characterInventories:{data:characterInventories},characterEquipment:{data:characterEquipment},itemComponents:{instances:{data:instances},stats:{data:{}},sockets:{data:{}},reusablePlugs:{data:{}}}};
  const body=()=>({schemaVersion:2,transport:'prepared-page-stream-v1',account:{profile,definitions,definitionCoverage:{complete:true,unresolved:[]},pageReady:{page:'vault',manifestVersion:MANIFEST_VERSION,definitionSource:'prepared-bulk-manifest',views:[],coverage:{complete:true,missing:[]}}},prepared:{manifestVersion:MANIFEST_VERSION,page:'common'}});
  return {profile,definitions,body,badJuju:vault[0]};
}
// Routes one page. `bungie` controls the transfer: 'move' (Bungie moves it), 'error' (Bungie refuses),
// 'silent' (accepted, but live profile reads never show the move), 'hang' (the call never answers).
export async function routeStorage(page,{origin,fixture,art,bungie='move',calls=[]}){
  const live=structuredClone(fixture.profile);
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    if(url.hostname.endsWith('bungie.net'))return route.fulfill({contentType:'image/webp',body:art});
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
    if(url.origin!==AUTH)return route.abort();
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
    if(url.pathname==='/session')return json({authenticated:true,csrfToken:'fixture-only',activeDestinyMembership:{membershipId:'4611686018000000001',membershipType:3,displayName:'Fixture'},capabilities:{destinyActions:{transferItems:true,equipItems:true,pullFromPostmaster:true}}});
    if(url.pathname==='/bungie/page/vault')return json(fixture.body());
    if(url.pathname==='/bungie/profile')return json({profile:live});
    if(url.pathname==='/bungie/actions/transfer-item'){
      const body=request.postDataJSON();calls.push(body);
      if(bungie==='hang')return;
      if(bungie==='error')return json({ErrorCode:1642,ErrorStatus:'DestinyNoRoomInDestination',Message:'There are no item slots available to transfer this item.',ThrottleSeconds:0});
      if(bungie==='move'){
        const id=String(body.itemId),take=list=>{const i=list.findIndex(item=>item.itemInstanceId===id);return i<0?null:list.splice(i,1)[0];};
        let item=take(live.profileInventory.data.items);for(const row of Object.values(live.characterInventories.data))item=item||take(row.items);
        if(item){if(body.transferToVault){item.bucketHash=BUCKET.vault;live.profileInventory.data.items.push(item);}else{item.bucketHash=Number(fixture.definitions[item.itemHash].inventory.bucketTypeHash);live.characterInventories.data[String(body.characterId)].items.push(item);}}
      }
      return json({ErrorCode:1,ErrorStatus:'Success',Response:0});
    }
    return json({error:'not_in_fixture'},404);
  });
  return live;
}
