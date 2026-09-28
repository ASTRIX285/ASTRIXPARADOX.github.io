// Bungie's profile lags behind an accepted change. Apply must re-read before
// reporting "not applied" (Miguel, 28 Sep 2026: nine items reported as not
// equipped straight after Bungie accepted the request).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs';
import {weaponPerkPlan} from '../pages/guardian-workspace-v2/guardian-weapon-selection.mjs';

const source=readFileSync(new URL('../pages/guardian-workspace-v2/guardian-live-actions.mjs',import.meta.url),'utf8');
assert.match(source,/EQUIP_READBACK_DELAYS_MS=Object\.freeze\(\[0,750,1500,2500,4000,6000\]\)/);
assert.match(source,/for\(const delay of EQUIP_READBACK_DELAYS_MS\)\{[\s\S]*?verifyEquippedItems/,'The equip check re-reads the profile.');

// Synthetic transport identities only. Never contacts Bungie.
const session={authenticated:true,csrfToken:'test-only',activeDestinyMembership:{membershipId:'3',membershipType:1},capabilities:{destinyActions:{insertSocketPlugFree:true,verifyFinalState:true}}};
const item={itemInstanceId:'1',itemHash:3462679024,name:'Unsworn'};
let applied=false,staleReads=0;
const profile=()=>{const visible=applied&&staleReads--<=0;return {profile:{
  characters:{data:{2:{}}},characterActivities:{data:{2:{currentActivityHash:0}}},
  characterInventories:{data:{2:{items:[{itemInstanceId:'1',itemHash:item.itemHash,bucketHash:1498876634}]}}},
  itemComponents:{sockets:{data:{1:{sockets:[{plugHash:visible?20:10}]}}},reusablePlugs:{data:{1:{plugs:{0:[{plugItemHash:20,canInsert:true,enabled:true}]}}}}}
}};};
const waits=[];
const fetchImpl=async(url,options={})=>{if(options.method==='POST'){applied=true;staleReads=2;return Response.json({ErrorCode:1});}return Response.json(profile());};
const plan=weaponPerkPlan(item,{0:{hash:20,name:'Test option'}},{session,payload:profile()});
const staged=await stageLiveTransferPreflight(plan,{session,fetchImpl});
const result=await executeLiveTransferPlan(confirmLiveTransferPlan(staged),{session,fetchImpl,waitImpl:async ms=>{waits.push(ms);}});
assert.equal(result.readback.verified,true,'A change Bungie shows two reads late is still confirmed.');
assert.equal(result.status,'applied');
assert.ok(waits.includes(750)&&waits.includes(1500),'Apply waits and re-reads instead of failing on the first stale read.');
console.log('APPLY_READBACK_LAG=PASS accepted changes are re-read until Bungie shows them');
