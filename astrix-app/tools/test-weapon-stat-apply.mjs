import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {weaponStatBreakdown,weaponStatMarkup} from '../pages/guardian-workspace-v2/guardian-weapon-stat-model.mjs';
import {weaponPerkPlan,bindWeaponSelection,loadWeaponStatGroup} from '../pages/guardian-workspace-v2/guardian-weapon-selection.mjs';
import {GuardianManifestService} from '../pages/guardian-workspace-v2/guardian-manifest-service.mjs';
import {stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs';

const captured=JSON.parse(await readFile(new URL('fixtures/unsworn-stat-capture.json',import.meta.url),'utf8'));
const requests=[],groupHash=captured.definition.stats.statGroupHash;
const statService=new GuardianManifestService({backend:false,storage:{available:false},fetchImpl:async url=>{
  const parsed=new URL(url);requests.push(parsed);
  return Response.json(parsed.pathname.endsWith('/component')?{[groupHash]:captured.definition.resolvedStatGroup}:{version:'test-manifest',paths:{DestinyStatGroupDefinition:'/common/destiny2_content/json/en/stat-groups.json'}});
}});
const [groupA,groupB]=await Promise.all([loadWeaponStatGroup(groupHash,statService),loadWeaponStatGroup(groupHash,statService)]);
assert.deepEqual(groupA,captured.definition.resolvedStatGroup);assert.deepEqual(groupB,groupA);
assert.equal(requests.length,2,'Concurrent cards share one metadata and one stat group request');
assert.equal(requests[1].searchParams.get('type'),'DestinyStatGroupDefinition');
assert.equal(requests[1].searchParams.get('version'),'test-manifest');
const rows=weaponStatBreakdown(captured),byName=Object.fromEntries(rows.map(row=>[row.name,row]));
// This newer captured roll has Enhanced Shoot to Loot (+5 Range). Its expected
// capped Range is 100, not the 96 from the earlier screenshot's different roll.
assert.deepEqual(Object.fromEntries(rows.map(row=>[row.name,row.value])),{
  Impact:6,Range:100,Stability:81,Handling:65,'Reload Speed':47,'Aim Assistance':100,
  Zoom:16,'Airborne Effectiveness':15,'Ammo Generation':47,'Rounds Per Minute':1000,Magazine:104,'Recoil Direction':97
});
assert.equal(byName.Magazine.base,98);assert.equal(byName.Magazine.bonus,6);
assert.equal(byName['Reload Speed'].barBase,32);
assert.match(weaponStatMarkup([byName['Reload Speed']]),/left:32%;width:15%/);
const battery=captured.weaponSemantics.statSockets.find(socket=>socket.socketIndex===2);
const withoutBattery=weaponStatBreakdown(captured,{2:{...battery,definition:{...battery.definition,investmentStats:[]}}});
assert.equal(withoutBattery.find(row=>row.name==='Magazine').value,98);
assert.equal(withoutBattery.find(row=>row.name==='Reload Speed').value,65);
assert.equal(captured.weaponSemantics.stats['4188031367'].value,42,'Never mutate captured API stats');
const unknown=structuredClone(captured);delete unknown.definition.resolvedStatGroup;
assert.ok(weaponStatBreakdown(unknown).every(row=>row.base===null&&!row.verified));
const conditional=structuredClone(captured);conditional.weaponSemantics.statSockets[0].definition.investmentStats=[{statTypeHash:155624089,value:7,isConditionallyActive:true}];
assert.equal(weaponStatBreakdown(conditional).find(row=>row.name==='Stability').verified,false,'Unknown activation rules must not invent bonuses');

// Synthetic transport identities only. These tests never contact Bungie.
const session={authenticated:true,csrfToken:'test-only',activeDestinyMembership:{membershipId:'3',membershipType:1},capabilities:{destinyActions:{insertSocketPlugFree:true,verifyFinalState:true}}};
const item={itemInstanceId:'1',itemHash:3462679024,name:'Unsworn'};
let applied=false,allow=true,moved=false;
const profile=()=>({profile:{
  characters:{data:{2:{}}},characterActivities:{data:{2:{currentActivityHash:0}}},
  characterInventories:{data:{[moved?'4':'2']:{items:[{itemInstanceId:'1',itemHash:item.itemHash,bucketHash:1498876634}]}}},
  itemComponents:{
    sockets:{data:{1:{sockets:[{plugHash:applied?20:10}]}}},
    reusablePlugs:{data:{1:{plugs:{0:[{plugItemHash:20,canInsert:allow,enabled:true}]}}}}
  }
}});
const posts=[];
const fetchImpl=async(url,options={})=>{
  if(options.method==='POST'){posts.push({path:new URL(url).pathname,body:JSON.parse(options.body)});applied=true;return Response.json({ErrorCode:1});}
  return Response.json(profile());
};
const choices={0:{hash:20,name:'Test option'}};
const plan=weaponPerkPlan(item,choices,{session,payload:profile()});
assert.equal(posts.length,0,'Preview must not write');
const staged=await stageLiveTransferPreflight(plan,{session,fetchImpl});
assert.equal(posts.length,0,'Preflight must not write');
const result=await executeLiveTransferPlan(confirmLiveTransferPlan(staged),{session,fetchImpl,waitImpl:async()=>{}});
assert.equal(result.status,'applied');assert.equal(result.readback.verified,true);
assert.deepEqual(posts,[{path:'/bungie/actions/socket-plug-free',body:{membershipType:1,characterId:'2',itemId:'1',plug:{socketIndex:0,socketArrayType:0,plugItemHash:20}}}]);
applied=false;allow=false;posts.length=0;
assert.equal((await stageLiveTransferPreflight(plan,{session,fetchImpl})).ready,false);
assert.equal(posts.length,0);
allow=true;moved=true;
assert.equal((await stageLiveTransferPreflight(plan,{session,fetchImpl})).ready,false,'Do not transfer a weapon to apply a perk');
assert.equal(posts.length,0);
// Exercise the actual delegated selection handler without a browser or network.
const cells=[10,20,30].map(hash=>({dataset:{socketIndex:'0',bungieHash:String(hash)},attributes:{},classes:new Set(),setAttribute(key,value){this.attributes[key]=value;},closest(){return this;},classList:{toggle(name,on){const cell=cells.find(value=>value.classList===this);if(on)cell.classes.add(name);else cell.classes.delete(name);}}}));
let footer;
globalThis.document={createElement(){
  const button={addEventListener(){}};const status={};
  footer={hidden:false,querySelector:selector=>selector==='button'?button:status,remove(){}};return footer;
}};
const root={listeners:new Map(),append(){},querySelectorAll(){return cells;},querySelector(){return null;},addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);}};
const preview={...captured,itemInstanceId:'1',weaponSemantics:{...captured.weaponSemantics,perkModel:{columns:[{socketIndex:0,selectedPlugHash:10,options:[{hash:10},{hash:20,canInsert:true},{hash:30,canInsert:false}]}]}}};
bindWeaponSelection(root,preview);
assert.equal(footer.hidden,true);
root.listeners.get('forge:perk-activate')({target:cells[2]});assert.equal(footer.hidden,true,'Unavailable option cannot stage Apply');
root.listeners.get('forge:perk-activate')({target:cells[1]});assert.equal(footer.hidden,false);
assert.equal(cells[1].attributes['aria-pressed'],'true');assert.ok(cells[1].classes.has('is-pending'));
assert.equal(cells[1].dataset.perkState,'Selected preview');
root.listeners.get('forge:perk-activate')({target:cells[0]});assert.equal(footer.hidden,true,'Returning to equipped clears pending changes');
assert.equal(preview.weaponSemantics.perkModel.columns[0].selectedPlugHash,10,'Preview must not overwrite equipped state');
delete globalThis.document;
console.log('WEAPON_STAT_APPLY=PASS captured stats, scaled bonuses, immutable previews, socket-only transport, readback and stale ownership');
