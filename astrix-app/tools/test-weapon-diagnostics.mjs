import assert from 'node:assert/strict';
import {weaponDiagnostics,installWeaponDiagnostics,mountWeaponDiagnostics} from '../pages/guardian-workspace-v2/guardian-weapon-diagnostics.mjs';

// Synthetic transport fixture, not a capture of Miguel's account.
const secret='DO_NOT_EXPORT_SESSION_OR_ACCOUNT';
const payload={session:{cookie:secret},account:{displayName:secret},displaySnapshot:{source:'cache',fetchedAt:123,maxAgeMs:15000,token:secret},
  profile:{characters:{data:{warlock:{classType:2,displayName:secret}}},characterEquipment:{data:{warlock:{items:[
    {itemHash:3462679024,itemInstanceId:'test-instance',bucketHash:2465295065,state:4,token:secret},
    {itemHash:123,itemInstanceId:'armour',bucketHash:3448274439}
  ]}}},characterInventories:{data:{warlock:{items:[{itemHash:123}]}}},itemComponents:{
    instances:{data:{'test-instance':{gearTier:5,isEquipped:true,token:secret}}},
    stats:{data:{'test-instance':{stats:{1240592695:{statHash:1240592695,value:91,token:secret},2714457168:{statHash:2714457168,value:0}}}}},
    sockets:{data:{'test-instance':{sockets:[{plugHash:111235976,isEnabled:true},{plugHash:0,isEnabled:false},{plugHash:3629421851,isEnabled:true}]}}},
    reusablePlugs:{data:{'test-instance':{plugs:{2:[{plugItemHash:3629421851,canInsert:true,token:secret},{plugItemHash:1483536627,canInsert:false}]}}}}
  }},definitions:{3462679024:{hash:3462679024,displayProperties:{name:'Unsworn'},token:secret},111235976:{hash:111235976},3629421851:{hash:3629421851}},
  statDefinitions:{1240592695:{hash:1240592695,displayProperties:{name:'Range'}}}
};
const result=weaponDiagnostics(payload,{capturedAt:'2026-09-08T00:00:00Z'});
assert.equal(result.weapons.length,1);
assert.equal(result.weapons[0].location,'equipped');
const withCarried=structuredClone(payload);
withCarried.profile.characterInventories.data.warlock.items.push({itemHash:3462679024,itemInstanceId:'carried-copy',bucketHash:2465295065});
const carriedResult=weaponDiagnostics(withCarried);
assert.equal(carriedResult.weapons.length,2);
assert.equal(carriedResult.weapons[1].location,'carried');
assert.equal(carriedResult.weapons[1].item.itemInstanceId,'carried-copy');
assert.equal(carriedResult.weapons[1].stats,null);
assert.equal(result.weapons[0].stats[1240592695].value,91,'Export preserves returned values without adding bonuses');
assert.equal(result.weapons[0].stats[2714457168].value,0);
assert.equal(result.weapons[0].instance.gearTier,5);
assert.deepEqual(result.weapons[0].sockets.map(row=>row.socketIndex),[0,1,2]);
assert.equal(result.weapons[0].reusablePlugs[2][1].plugItemHash,1483536627);
assert.equal(result.definitions[3629421851].paradoxId,'paradox:bungie:DestinyInventoryItemDefinition:3629421851');
assert.ok(result.missing.some(row=>row.definitionHash==='1483536627'));
assert.ok(!JSON.stringify(result).includes(secret));
assert.deepEqual(result.displaySnapshot,{source:'cache',fetchedAt:123,maxAgeMs:15000});
const missing=structuredClone(payload);
delete missing.profile.itemComponents.stats;
assert.equal(weaponDiagnostics(missing).weapons[0].stats,null);
assert.ok(weaponDiagnostics(missing).missing.some(row=>row.component==='stats'));
assert.throws(()=>weaponDiagnostics({}),/unavailable/);
const button={disabled:false,addEventListener(type,handler){assert.equal(type,'click');this.click=handler;}};
const status={textContent:''};
let calls=0,downloads=0,release;
installWeaponDiagnostics(button,status,{request:async page=>{calls++;assert.equal(page,'character');await new Promise(resolve=>{release=resolve;});return payload;},download:async data=>{downloads++;assert.equal(data.weapons.length,1);}});
const pending=button.click();
assert.equal(button.disabled,true);
await button.click();
assert.equal(calls,1);
release();await pending;
assert.equal(downloads,1);
assert.equal(button.disabled,false);
assert.match(status.textContent,/Download prepared/);
installWeaponDiagnostics(button,status,{request:async()=>{throw new Error(secret);},download:()=>{throw new Error('Must not download');}});
await button.click();
assert.equal(button.disabled,false);
assert.match(status.textContent,/No file was downloaded/);
assert.ok(!status.textContent.includes(secret));
// Build Forge creates its weapon panel dynamically without the Character HTML button.
const nodes=new Map();
function element(){return {dataset:{},children:[],listeners:0,setAttribute(){},addEventListener(){this.listeners++;},append(...children){this.children=children;for(const child of children)if(child.id)nodes.set(child.id,child);}};}
const panel={bar:null,querySelector(){return this.bar;},prepend(node){this.bar=node;}};
globalThis.document={getElementById:id=>nodes.get(id),createElement:element};
try{
  mountWeaponDiagnostics(panel);
  const download=nodes.get('downloadWeaponDiagnostics');
  assert.equal(download.textContent,'Download weapon diagnostics');
  assert.equal(download.listeners,1);
  mountWeaponDiagnostics(panel);
  assert.equal(panel.bar.children.length,2);
  assert.equal(download.listeners,1,'Re-rendering must not attach duplicate download listeners');
}finally{delete globalThis.document;}
console.log('Weapon diagnostics projection and download interaction checks passed.');
