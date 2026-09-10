import assert from 'node:assert/strict';
import {accountItemRows,forgeLoaderResidency} from '../pages/forge-loader/forge-loader-residency.mjs';

const characterId='2305843009260000001';
const payload={
  profile:{
    profileInventory:{data:{items:[
      {itemHash:1001,itemInstanceId:'6917529027641000001',bucketHash:138197802},
      {itemHash:1002,itemInstanceId:'6917529027641000002',bucketHash:138197802}
    ]}},
    characterInventories:{data:{[characterId]:{items:[
      {itemHash:2001,itemInstanceId:'6917529027641000003'},
      {itemHash:1001,itemInstanceId:'6917529027641000001',bucketHash:138197802}
    ]}}},
    characterEquipment:{data:{[characterId]:{items:[
      {itemHash:3001,itemInstanceId:'6917529027641000004'},
      {itemHash:2001,itemInstanceId:'6917529027641000003'}
    ]}}}
  },
  artifactCatalog:[{hash:4001,name:'Seasonal Artifact'}],
  definitionCoverage:{complete:true,requested:4,resolved:4,unresolved:[]},
  pageReady:{page:'loadout',manifestVersion:'2026.09.10.1',coverage:{complete:true,missing:[]}}
};
const profileBuild={
  ownedWeapons:[{hash:2001,itemInstanceId:'6917529027641000003'}],
  artifact:{hash:4001,name:'Seasonal Artifact',state:'resolved'},
  subclassCatalog:[{
    hash:5001,
    itemInstanceId:'6917529027641000005',
    subclassBuild:{
      socketsAvailable:true,
      socketCoverage:{complete:true,unresolved:[]},
      super:{hash:5002,name:'Verified Super'},
      superOptions:[{hash:5002,name:'Verified Super'}],
      fragments:[{hash:5003,name:'Verified Fragment'}],
      fragmentOptions:[{hash:5003,name:'Verified Fragment'}]
    }
  }]
};
const catalogue={totals:{armour:2}};

const verifying=forgeLoaderResidency();
assert.equal(verifying.ready,false);
assert.equal(verifying.itemCount,0);
assert.equal(verifying.rows.every(row=>row.state==='verifying'),true);
assert.doesNotMatch(verifying.summary,/\b0 items indexed\b/,'Unresolved account data must not paint a placeholder item count.');

assert.equal(accountItemRows(payload).length,4,'Account item totals must deduplicate the same Bungie instance across inventory and equipment components.');

const resident=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild,phase:'resident',combinationsPrewarmed:false,durationMs:1200});
assert.equal(resident.ready,false);
assert.equal(resident.rows.every(row=>row.state==='resident'),true);
assert.match(resident.rows.find(row=>row.key==='vault-armour').detail,/2 armour items indexed/);
assert.match(resident.rows.find(row=>row.key==='weapons').detail,/1 owned weapons indexed/);

const ready=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild,phase:'ready',combinationsPrewarmed:true,durationMs:1250});
assert.equal(ready.ready,true);
assert.equal(ready.rows.every(row=>row.state==='ready'),true);
assert.equal(ready.summary,'4 items indexed · combinations pre-warmed · ready in 1.3s');

const incompleteProfile={...profileBuild,subclassCatalog:profileBuild.subclassCatalog.map(row=>({...row,subclassBuild:{...row.subclassBuild,socketsAvailable:false}}))};
const incomplete=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild:incompleteProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(incomplete.ready,false);
assert.equal(incomplete.rows.find(row=>row.key==='subclass').state,'resident');

const unresolvedSocketProfile={...profileBuild,subclassCatalog:profileBuild.subclassCatalog.map(row=>({...row,subclassBuild:{...row.subclassBuild,socketCoverage:{complete:false,unresolved:[5004]}}}))};
const unresolvedSockets=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild:unresolvedSocketProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(unresolvedSockets.ready,false);
assert.equal(unresolvedSockets.rows.find(row=>row.key==='subclass').state,'resident');

console.log('FORGE_LOADER_RESIDENCY_INSTANCE_DEDUPLICATION=PASS');
console.log('FORGE_LOADER_RESIDENCY_HONEST_INCOMPLETE_STATE=PASS');
