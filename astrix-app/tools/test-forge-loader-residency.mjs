import assert from 'node:assert/strict';
import {accountItemRows,forgeLoaderEvaluateReady,forgeLoaderResidency} from '../pages/forge-loader/forge-loader-residency.mjs';
import {forgeInventorySignature} from '../pages/forge-loader/forge-loader-refresh.mjs';

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
  weaponDefinitionCoverage:{itemInstances:['6917529027641000003'],requested:[2001],resolved:[2001],unresolved:[],missingSocketInstances:[],complete:true},
  subclassCatalogCoverage:{itemInstances:['6917529027641000005'],requested:[5001,5002,5003],resolved:[5001,5002,5003],unresolved:[],complete:true},
  artifactCatalogCoverage:{artifactCount:1,complete:true},
  forgeArmourIndexCoverage:{definitions:2,complete:true},
  loadoutCoverage:{complete:true},
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
const fiveSlots=new Map(Array.from({length:5},(_,slotIndex)=>[slotIndex,{slotIndex}]));
assert.equal(forgeLoaderEvaluateReady(ready,fiveSlots,characterId),true,'A complete staged load must unlock only against the current ready residency result.');
assert.equal(forgeLoaderEvaluateReady(ready,new Map([...fiveSlots].slice(0,4)),characterId),false,'Four staged slots must remain locked even when every source is resident.');
assert.equal(forgeLoaderEvaluateReady({...ready,ready:false},fiveSlots,characterId),false,'A five-piece load must not weaken a genuinely incomplete residency gate.');

const incompleteProfile={...profileBuild,subclassCatalog:profileBuild.subclassCatalog.map(row=>({...row,subclassBuild:{...row.subclassBuild,socketsAvailable:false}}))};
const incomplete=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild:incompleteProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(incomplete.ready,false);
assert.equal(incomplete.rows.find(row=>row.key==='subclass').state,'resident');

const unresolvedSocketProfile={...profileBuild,subclassCatalog:profileBuild.subclassCatalog.map(row=>({...row,subclassBuild:{...row.subclassBuild,socketCoverage:{complete:false,unresolved:[5004]}}}))};
const unresolvedSockets=forgeLoaderResidency(payload,{characterId,catalogue,profileBuild:unresolvedSocketProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(unresolvedSockets.ready,false);
assert.equal(unresolvedSockets.rows.find(row=>row.key==='subclass').state,'resident');

// Captured account component shape with account identifiers redacted:
// Winter's Guile, four Luminopotent pieces and Prismatic Warlock. The sixth
// fragment socket is empty in Bungie's socket component.
const prismaticInstanceId='captured-prismatic-subclass-instance';
const realSocketHashes=[1869939001,1444664836,5333293,3644045871,4241856103,790664815,790664812,124726498,124726504,124726503,2626922120,2626922114];
const capturedPayload={
  ...payload,
  profile:{
    ...payload.profile,
    characterEquipment:{data:{[characterId]:{items:[
      ...payload.profile.characterEquipment.data[characterId].items,
      {itemHash:3893112950,itemInstanceId:prismaticInstanceId,bucketHash:3284755031}
    ]}}},
    itemComponents:{sockets:{data:{[prismaticInstanceId]:{sockets:[...realSocketHashes.map(plugHash=>({plugHash})),{plugHash:null}]}}}}
  },
  subclassCatalogCoverage:{itemInstances:[prismaticInstanceId],requested:realSocketHashes,resolved:[],unresolved:realSocketHashes,complete:false}
};
const capturedIncompleteProfile={
  ...profileBuild,
  subclassCatalog:[{
    hash:3893112950,
    name:'Prismatic Warlock',
    itemInstanceId:prismaticInstanceId,
    subclassBuild:{socketsAvailable:true,socketCoverage:{complete:false,unresolved:realSocketHashes},super:null,superOptions:[],fragments:[],fragmentOptions:[]}
  }]
};
const capturedStagedLoad=new Map([
  [0,{slotIndex:0,hash:1966593658,name:'Luminopotent Cover'}],
  [1,{slotIndex:1,hash:900910756,name:"Winter's Guile"}],
  [2,{slotIndex:2,hash:3345056013,name:'Luminopotent Robes'}],
  [3,{slotIndex:3,hash:1829877749,name:'Luminopotent Boots'}],
  [4,{slotIndex:4,hash:1924898304,name:'Luminopotent Bond'}]
]);
const capturedBlocked=forgeLoaderResidency(capturedPayload,{characterId,catalogue,profileBuild:capturedIncompleteProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(capturedBlocked.rows.find(row=>row.key==='subclass').state,'resident','The captured stuck source must be Subclass and fragments.');
assert.deepEqual(capturedBlocked.rows.filter(row=>row.state!=='ready').map(row=>row.key),['subclass','manifest'],'Manifest readiness must honestly reflect the same unresolved subclass definition source.');
assert.equal(forgeLoaderEvaluateReady(capturedBlocked,capturedStagedLoad,characterId),false,'Five real staged pieces must stay locked while the live subclass definitions are genuinely unresolved.');

const resolvedCoverage={...capturedPayload.subclassCatalogCoverage,resolved:realSocketHashes,unresolved:[],complete:true};
const resolvedPayload={...capturedPayload,subclassCatalogCoverage:resolvedCoverage};
const capturedReadyProfile={
  ...capturedIncompleteProfile,
  subclassCatalog:[{
    ...capturedIncompleteProfile.subclassCatalog[0],
    subclassBuild:{
      socketsAvailable:true,
      socketCoverage:{complete:true,unresolved:[]},
      super:{hash:1869939001,name:'Needlestorm'},
      superOptions:[{hash:1869939001,name:'Needlestorm'}],
      fragments:[
        {hash:124726498,name:'Facet of Purpose'},
        {hash:124726504,name:'Facet of Dominance'},
        {hash:124726503,name:'Facet of Bravery'},
        {hash:2626922120,name:'Facet of Protection'},
        {hash:2626922114,name:'Facet of Balance'}
      ],
      fragmentOptions:[]
    }
  }]
};
assert.notEqual(forgeInventorySignature(capturedPayload),forgeInventorySignature(resolvedPayload),'A background refresh must notice repaired live subclass definition coverage even when inventory is unchanged.');
const capturedUnlocked=forgeLoaderResidency(resolvedPayload,{characterId,catalogue,profileBuild:capturedReadyProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(capturedUnlocked.rows.every(row=>row.state==='ready'),true);
assert.equal(forgeLoaderEvaluateReady(capturedUnlocked,capturedStagedLoad,characterId),true,'The exact staged load must unlock as soon as its real Super and fragments resolve.');

// Captured from Miguel's Nothing Manacles and full Smoke Jumper loader state.
// Account identifiers are redacted. The live Resident Data panel showed only
// Weapons and Manifest at RESIDENT because owned weapon definitions were not
// joined into the prepared page account envelope.
const smokeJumperStagedLoad=new Map([
  [0,{slotIndex:0,hash:3577550601,name:'Smoke Jumper Hood'}],
  [1,{slotIndex:1,hash:300502917,name:'Nothing Manacles'}],
  [2,{slotIndex:2,hash:3788059976,name:'Smoke Jumper Vestment'}],
  [3,{slotIndex:3,hash:63899322,name:'Smoke Jumper Boots'}],
  [4,{slotIndex:4,hash:1619647653,name:'Smoke Jumper Bond'}]
]);
const realUnswornHash=1303313141;
const capturedWeaponInstance='captured-owned-weapon-instance';
const smokeJumperPayload={
  ...resolvedPayload,
  definitionCoverage:{requested:91,resolved:84,unresolved:[111,222,333,444,555,666,777],complete:false,source:'prepared-page-payload'},
  weaponDefinitionCoverage:{itemInstances:[capturedWeaponInstance],requested:[realUnswornHash],resolved:[],unresolved:[realUnswornHash],missingSocketInstances:[],complete:false}
};
const smokeJumperBlockedProfile={...capturedReadyProfile,ownedWeapons:[]};
const smokeJumperBlocked=forgeLoaderResidency(smokeJumperPayload,{characterId,catalogue,profileBuild:smokeJumperBlockedProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.deepEqual(smokeJumperBlocked.rows.filter(row=>row.state!=='ready').map(row=>row.key),['weapons','manifest'],'The exact live stuck rows must be Weapons and Manifest.');
assert.equal(forgeLoaderEvaluateReady(smokeJumperBlocked,smokeJumperStagedLoad,characterId),false,'Nothing Manacles and four Smoke Jumper pieces must stay locked while owned weapon evidence is genuinely unresolved.');

const smokeJumperResolvedPayload={
  ...smokeJumperPayload,
  weaponDefinitionCoverage:{itemInstances:[capturedWeaponInstance],requested:[realUnswornHash],resolved:[realUnswornHash],unresolved:[],missingSocketInstances:[],complete:true}
};
const smokeJumperResolvedProfile={...capturedReadyProfile,ownedWeapons:[{hash:realUnswornHash,itemHash:realUnswornHash,itemInstanceId:capturedWeaponInstance,name:'Unsworn'}]};
assert.notEqual(forgeInventorySignature(smokeJumperPayload),forgeInventorySignature(smokeJumperResolvedPayload),'A repaired owned weapon coverage result must rebuild residency without an inventory mutation.');
const smokeJumperReady=forgeLoaderResidency(smokeJumperResolvedPayload,{characterId,catalogue,profileBuild:smokeJumperResolvedProfile,phase:'ready',combinationsPrewarmed:true,durationMs:900});
assert.equal(smokeJumperReady.rows.every(row=>row.state==='ready'),true,'All six real resident sources must reach READY after the owned weapon join completes.');
assert.equal(forgeLoaderEvaluateReady(smokeJumperReady,smokeJumperStagedLoad,characterId),true,'The exact Nothing Manacles and Smoke Jumper staged load must unlock with verified source coverage.');
assert.equal(smokeJumperResolvedPayload.definitionCoverage.complete,false,'The armour-only offline hydration flag remains honestly incomplete and is not misused as whole-page manifest coverage.');

console.log('FORGE_LOADER_RESIDENCY_INSTANCE_DEDUPLICATION=PASS');
console.log('FORGE_LOADER_RESIDENCY_HONEST_INCOMPLETE_STATE=PASS');
console.log('FORGE_LOADER_CURRENT_HANDOFF_GATE=PASS');
console.log('FORGE_LOADER_REAL_SUBCLASS_RESIDENCY_RECOVERY=PASS');
console.log('FORGE_LOADER_NOTHING_MANACLES_SMOKE_JUMPER_RESIDENCY=PASS');
