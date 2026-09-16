import assert from 'node:assert/strict';
import {preparedCharacterBuildCoverage} from '../../forge-auth-worker/src/page-semantics.ts';

globalThis.location={pathname:'/test/',search:'',href:'https://example.test/test/',hostname:'example.test',origin:'https://example.test'};
const element=()=>({dataset:{},style:{},appendChild(){},append(){},setAttribute(){},addEventListener(){},querySelector(){return null;},insertAdjacentElement(){},removeAttribute(){}});
globalThis.document={head:element(),documentElement:{dataset:{}},getElementById(){return null;},querySelector(){return null;},createElement(){return element();},dispatchEvent(){return true;},addEventListener(){}};
globalThis.sessionStorage={getItem(){return null;},setItem(){},removeItem(){}};
globalThis.localStorage=globalThis.sessionStorage;
globalThis.CustomEvent=class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}};
globalThis.addEventListener=()=>{};

const {normalisePreparedPagePayload,normaliseLiveProfile,profileWithSelectedLoadout,loadoutCoverage}=await import('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs?test=character-live-data');
const SUBCLASS_BUCKET=3284755031;
const KINETIC_BUCKET=1498876634;
const classes=[
  {
    characterId:'hunter-live',classType:1,subclassHash:2453351420,subclassName:'Nightstalker',subclassInstanceId:'hunter-subclass-live',weaponHash:2558925366,weaponInstanceId:'hunter-weapon-live',
    plugs:[[2816982784,"Marksman's Dodge",'hunter.void.class_abilities'],[20616656,'Triple Jump','hunter.void.movement'],[2722573682,'Spectral Blades','hunter.void.supers'],[1139822080,'Phantom Surge','hunter.void.melee'],[1547656727,'Magnetic Grenade','shared.void.grenades'],[187655373,'Vanishing Step','hunter.void.aspects'],[187655374,'Stylish Executioner','hunter.void.aspects'],[2661180601,'Echo of Harvest','shared.void.fragments']]
  },
  {
    characterId:'warlock-live',classType:2,subclassHash:2849050827,subclassName:'Voidwalker',subclassInstanceId:'warlock-subclass-live',weaponHash:3049715579,weaponInstanceId:'warlock-weapon-live',
    plugs:[[2209081648,'Empowering Rift','warlock.void.class_abilities'],[1237488986,'Burst Glide','warlock.void.movement'],[1656118680,'Nova Warp','warlock.void.supers'],[2299867342,'Pocket Singularity','warlock.void.melee'],[1514173218,'Scatter Grenade','shared.void.grenades'],[2321824285,'Chaos Accelerant','warlock.void.aspects'],[2321824284,'Feed the Void','warlock.void.aspects'],[2272984668,'Echo of Undermining','shared.void.fragments']]
  },
  {
    characterId:'titan-live',classType:0,subclassHash:1616346845,subclassName:'Prismatic Titan',subclassInstanceId:'titan-subclass-live',weaponHash:827835657,weaponInstanceId:'titan-weapon-live',
    plugs:[[2868073560,'Rally Barricade','titan.prism.class_abilities'],[266130438,'Strafe Lift','titan.prism.movement'],[2529942645,'Glacial Quake','titan.prism.supers'],[1980796564,'Frenzied Blade','titan.prism.melee'],[934199459,'Glacier Grenade','titan.prism.grenades'],[1262901523,'Knockout','titan.prism.aspects'],[1262901520,'Consecration','titan.prism.aspects'],[124726498,'Facet of Purpose','shared.prism.fragments']]
  }
];

const definitions={};
const profile={
  characters:{data:{}},profileInventory:{data:{items:[]}},profileProgression:{data:{}},
  characterInventories:{data:{}},characterProgressions:{data:{}},characterEquipment:{data:{}},characterLoadouts:{data:{}},
  itemComponents:{instances:{data:{}},stats:{data:{}},sockets:{data:{}}}
};
for(const row of classes){
  profile.characters.data[row.characterId]={characterId:row.characterId,classType:row.classType,dateLastPlayed:'2026-09-13T00:00:00Z',light:550,stats:{}};
  profile.characterInventories.data[row.characterId]={items:[]};
  profile.characterProgressions.data[row.characterId]={};
  profile.characterLoadouts.data[row.characterId]={loadouts:[]};
  profile.characterEquipment.data[row.characterId]={items:[
    {itemHash:row.subclassHash,itemInstanceId:row.subclassInstanceId,bucketHash:SUBCLASS_BUCKET},
    {itemHash:row.weaponHash,itemInstanceId:row.weaponInstanceId,bucketHash:KINETIC_BUCKET}
  ]};
  profile.itemComponents.sockets.data[row.subclassInstanceId]={sockets:row.plugs.map(([plugHash])=>({plugHash,isEnabled:true,isVisible:true}))};
  profile.itemComponents.instances.data[row.weaponInstanceId]={primaryStat:{value:550}};
  definitions[String(row.subclassHash)]={hash:row.subclassHash,classType:row.classType,displayProperties:{name:row.subclassName,icon:`/${row.subclassHash}.png`},inventory:{bucketTypeHash:SUBCLASS_BUCKET}};
  definitions[String(row.weaponHash)]={hash:row.weaponHash,displayProperties:{name:`${row.characterId} weapon`,icon:`/${row.weaponHash}.png`},inventory:{bucketTypeHash:KINETIC_BUCKET,tierTypeName:'Legendary'}};
  for(const [hash,name,plugCategoryIdentifier] of row.plugs){
    definitions[String(hash)]={hash,displayProperties:{name,icon:`/${hash}.png`},itemType:19,plug:{plugCategoryIdentifier}};
  }
}

const payload={profile,definitions,statDefinitions:{},artifactCatalog:[],membership:{membershipId:'membership-live',membershipType:3,displayName:'Guardian'}};
const coverage=preparedCharacterBuildCoverage(payload);
assert.equal(coverage.schemaVersion,2);
assert.equal(coverage.complete,true,coverage.missing.join(', '));
assert.deepEqual(coverage.characterIds,classes.map(row=>row.characterId));

const normalized=classes.map(row=>normaliseLiveProfile(payload,null,row.characterId));
for(const [index,detail] of normalized.entries()){
  const expected=classes[index];
  assert.equal(detail.characterId,expected.characterId);
  assert.equal(detail.super.hash,expected.plugs[2][0],'The equipped Super must come from this character’s socket, not catalogue order.');
  assert.equal(detail.subclassItemInstanceId,expected.subclassInstanceId);
  assert.deepEqual(detail.weapons.map(item=>item.itemInstanceId),[expected.weaponInstanceId]);
  assert.equal(detail.abilities.length,4,`${expected.characterId} must resolve four equipped abilities`);
  assert.equal(detail.aspects.length,2,`${expected.characterId} must resolve its equipped aspects`);
  assert.equal(detail.fragments.length,1,`${expected.characterId} must resolve its equipped fragments`);
  assert.equal(detail.subclassBuild.socketsAvailable,true);
  assert.equal(detail.subclassBuild.socketCoverage.complete,true);
}
assert.equal(new Set(normalized.map(detail=>detail.subclassItemInstanceId)).size,3,'Every selected character must retain its own equipped subclass instance.');
assert.equal(new Set(normalized.flatMap(detail=>detail.weapons.map(item=>item.itemInstanceId))).size,3,'Every selected character must retain its own equipped weapon instance.');

const partialSubclassPayload=structuredClone(payload);
delete partialSubclassPayload.profile.itemComponents.sockets.data['hunter-subclass-live'];
const partialDetail=normaliseLiveProfile(partialSubclassPayload,null,'hunter-live');
assert.equal(partialDetail.super,null,'Missing live Super sockets must not invent a catalogue default.');
assert.deepEqual(partialDetail.abilities,[],'Missing optional Bungie socket data must become an empty ability list.');
assert.deepEqual(partialDetail.aspects,[],'Missing optional Bungie socket data must become an empty aspect list.');
assert.deepEqual(partialDetail.fragments,[],'Missing optional Bungie socket data must become an empty fragment list.');
assert.equal(loadoutCoverage(partialDetail).complete,false,'Partial Character evidence must render as incomplete instead of crashing.');
assert.deepEqual(loadoutCoverage({}).missing.slice(0,6),['super','abilities','aspects','fragments','weapons','armour']);

const malformedOptionalPayload=structuredClone(payload);
malformedOptionalPayload.artifactCatalog={stale:true};
malformedOptionalPayload.profile.characterLoadouts.data['hunter-live']={};
malformedOptionalPayload.profile.characterProgressions.data['hunter-live']={seasonalArtifact:{tiers:[{}]}};
malformedOptionalPayload.profile.itemComponents.perks={data:{'hunter-weapon-live':{}}};
normalisePreparedPagePayload(malformedOptionalPayload);
assert.deepEqual(malformedOptionalPayload.artifactCatalog,[],'A malformed optional Artifact catalogue must not crash Character startup.');
assert.deepEqual(malformedOptionalPayload.profile.characterLoadouts.data['hunter-live'].loadouts,[]);
assert.deepEqual(malformedOptionalPayload.profile.characterProgressions.data['hunter-live'].seasonalArtifact.tiers[0].items,[]);
assert.deepEqual(malformedOptionalPayload.profile.itemComponents.perks.data['hunter-weapon-live'].perks,[]);
assert.equal(normaliseLiveProfile(malformedOptionalPayload,null,'hunter-live').characterId,'hunter-live','Partial optional components must still render the selected live Guardian.');

const incomplete=structuredClone(payload);
delete incomplete.profile.itemComponents.sockets.data['warlock-subclass-live'];
const incompleteCoverage=preparedCharacterBuildCoverage(incomplete);
assert.equal(incompleteCoverage.complete,false);
assert.ok(incompleteCoverage.characters['warlock-live'].missing.includes('subclass-sockets'));

console.log('CHARACTER_LIVE_MULTI_GUARDIAN_DATA=PASS');
console.log('CHARACTER_LIVE_SUBCLASS_SOCKET_COVERAGE=PASS');
console.log('CHARACTER_LIVE_PARTIAL_DATA_GUARD=PASS');
console.log('CHARACTER_LIVE_MALFORMED_OPTIONAL_COMPONENT_GUARD=PASS');

const newerSuperPayload=structuredClone(payload),newSuperHash=987654321;
newerSuperPayload.definitions[String(newSuperHash)]={hash:newSuperHash,itemType:19,displayProperties:{name:'New manifest Super',icon:'/new-super.png'},plug:{plugCategoryIdentifier:'hunter.void.supers'}};
newerSuperPayload.profile.itemComponents.sockets.data['hunter-subclass-live'].sockets[2].plugHash=newSuperHash;
assert.equal(normaliseLiveProfile(newerSuperPayload,null,'hunter-live').super.hash,newSuperHash,'A live class/subclass-compatible Super must survive an older bundled catalogue.');
console.log('CHARACTER_EQUIPPED_SUPER_SOURCE=PASS');

const {superDefinitionsFor}=await import('../pages/guardian-workspace-v2/guardian-super-catalog.mjs');
for(const [index,row] of classes.entries()){
  const live=normalized[index],element=live.subclass;
  const savedSuper=superDefinitionsFor(live.characterClass,element).find(item=>item.hash!==live.super.hash);
  assert.ok(savedSuper);
  const saved=structuredClone(payload),plugs=row.plugs.map(([hash])=>hash);
  plugs[2]=savedSuper.hash;
  saved.definitions[String(savedSuper.hash)]={...savedSuper.definition,hash:savedSuper.hash,itemType:19,plug:{plugCategoryIdentifier:row.plugs[2][2]}};
  saved.characterId=row.characterId;
  saved.selectedItems=saved.profile.characterEquipment.data[row.characterId].items.map(item=>item.bucketHash===SUBCLASS_BUCKET?{...item,plugItemHashes:plugs}:item);
  saved.profile=profileWithSelectedLoadout(saved);
  const resolved=normaliseLiveProfile(saved,null,row.characterId);
  assert.equal(resolved.super.hash,savedSuper.hash,'An explicitly opened saved loadout must resolve its own Super plug, not the live Super.');
  assert.equal(resolved.selectionResolutionVersion,2,'Freshly resolved loadouts must carry the current resolution version.');
  assert.equal(normaliseLiveProfile(payload,null,row.characterId).super.hash,live.super.hash,'Returning to live equipment must restore that Guardian’s exact Super.');
}
console.log('CHARACTER_SAVED_LOADOUT_SUPER_ISOLATION=PASS');
