import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolveBreakerTypeDefinition,resolveWeaponBreakerTypeDefinition,WEAPON_TYPE_LABELS} from '../core/bungie-item-identity.mjs';
import {itemTileMarkup} from '../shared/guardian-inventory-workspace.mjs';
import {createVaultCatalogue,VAULT_BUCKET} from '../pages/vault/vault-inventory.mjs';

const definitions={
  485622768:{hash:485622768,enumValue:1,displayProperties:{name:'Shield Piercing',icon:'/barrier.png'}},
  2611060930:{hash:2611060930,enumValue:2,displayProperties:{name:'Disruption',icon:'/overload.png'}},
  3178805705:{hash:3178805705,enumValue:3,displayProperties:{name:'Stagger',icon:'/unstoppable.png'}}
};
// Synthetic coverage of each weapon archetype and all three Bungie glyph tokens.
for(const itemSubType of Object.keys(WEAPON_TYPE_LABELS))for(const [marker,hash] of [['Shield-Piercing',485622768],['Disruption',2611060930],['Stagger',3178805705]]){
  const context={plugs:[{definition:{perks:[{perkHash:123}]}}],sandboxPerks:{123:{displayProperties:{description:`Strong against [${marker}] Champions.`}}}};
  const breaker=resolveWeaponBreakerTypeDefinition({}, {itemSubType},definitions,context);
  assert.equal(breaker,definitions[hash]);
  const html=itemTileMarkup({power:550,icon:'/weapon.png',breakerDefinition:breaker,elementDefinition:{displayProperties:{name:'Arc',icon:'/arc.png'}}},{kind:'weapon'});
  assert.match(html,/tile-footer[\s\S]*tile-breaker[\s\S]*tile-element[\s\S]*tile-power/);
  assert.equal((html.match(/class="tile-breaker"/g)||[]).length,1);
  assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{...context,plugs:[]}),null,'Unattached perks must never grant a badge');
  assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{...context,plugs:[{isEnabled:false,...context.plugs[0]}]}),null);
  assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{...context,activePerks:[{perkHash:123,isActive:false}]}),null);
  assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{...context,plugs:[],activePerks:[{perkHash:123,isActive:true}]}),breaker);
}
assert.equal(resolveWeaponBreakerTypeDefinition({breakerType:2},{},definitions),definitions[2611060930]);
assert.equal(resolveWeaponBreakerTypeDefinition({breakerTypeHash:0},{breakerTypeHash:485622768},definitions),definitions[485622768]);
assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{plugs:[{description:'Barrier',name:'Anti-Barrier Sword'}]}),null);
assert.equal(resolveWeaponBreakerTypeDefinition({}, {},{}, {activePerks:[{perkHash:1,isActive:true}],sandboxPerks:{1:{displayProperties:{description:'[Shield-Piercing]'}}}}),null,'Missing Bungie icon must not be invented');
assert.equal(resolveWeaponBreakerTypeDefinition({}, {},definitions,{activePerks:[{perkHash:1,isActive:true}],sandboxPerks:{1:{displayProperties:{description:'[Shield-Piercing] [Stagger]'}}}}),null,'Ambiguous capability must not be guessed');

// Actual committed Bungie manifest definitions. Account IDs, sockets and power below are synthetic.
const directory=new URL('../data/weapon-catalogue/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,directory),'utf8'));
const merge=prefix=>Object.assign({},...readdirSync(directory).filter(name=>name.startsWith(prefix)&&name.endsWith('.json')).map(name=>Object.values(read(name)).find(value=>value&&typeof value==='object'&&!Array.isArray(value))));
const sandboxPerks=merge('sandboxPerks-'),plugs=merge('plugDefinitions-'),weapons=merge('weapons-');
const praxic=weapons[3049715579],ranged=plugs[89777927];
assert.equal(praxic.displayProperties.name,'Praxic Blade');
assert.match(sandboxPerks[3460465175].displayProperties.description,/\[Shield-Piercing\]/);
assert.equal(resolveBreakerTypeDefinition({},praxic,definitions),null,'Reproduce the old missing badge');
assert.equal(resolveWeaponBreakerTypeDefinition({},praxic,definitions,{plugs:[{definition:ranged}],sandboxPerks}),definitions[485622768]);
const audit={};
for(const weapon of Object.values(weapons)){
  const attached=(weapon.socketCatalogue||[]).filter(row=>['intrinsic','perks'].includes(row.section)).map(row=>({definition:plugs[row.initialPlugHash]})).filter(row=>row.definition);
  const context={plugs:attached,sandboxPerks};
  const breaker=resolveWeaponBreakerTypeDefinition({},weapon,definitions,context);
  if(breaker){const type=weapon.weaponType||String(weapon.itemSubType);audit[type]=(audit[type]||0)+1;}
}
assert.ok(audit.Sword>0);
const payload={definitions:{[praxic.hash]:praxic,[ranged.hash]:ranged},sandboxPerks,breakerDefinitions:definitions,
  damageDefinitions:{3373582085:{displayProperties:{name:'Kinetic',icon:'/kinetic.png'}}},
  profile:{characters:{data:{}},profileInventory:{data:{items:[{itemHash:praxic.hash,itemInstanceId:'synthetic-praxic',bucketHash:VAULT_BUCKET}]}},
    itemComponents:{instances:{data:{'synthetic-praxic':{primaryStat:{value:550}}}},sockets:{data:{'synthetic-praxic':{sockets:[{plugHash:ranged.hash,isEnabled:true}]}}}}}};
const item=createVaultCatalogue(payload).items.find(row=>row.itemInstanceId==='synthetic-praxic');
assert.equal(item.breakerDefinition.hash,485622768,'Real Vault normalization must carry the resolved badge');
assert.match(itemTileMarkup(item),/tile-breaker[\s\S]*tile-element[\s\S]*tile-power/);
const profileSource=readFileSync(new URL('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs',import.meta.url),'utf8');
assert.match(profileSource,/breakerDefinition:resolveWeaponBreakerTypeDefinition\(instance,base\.definition,payload\?\.breakerDefinitions,\{plugs,sandboxPerks:payload\?\.sandboxPerks,activePerks:profile\?\.itemComponents\?\.perks/,'Character and Build Forge must use the same attached-perk resolver');
console.log('CHAMPION_OVERLAYS=PASS all '+Object.keys(WEAPON_TYPE_LABELS).length+' archetypes, three champion types, actual Praxic Blade definitions');
console.log('MANIFEST_CHAMPION_COVERAGE='+JSON.stringify(audit));

// A new named export must never be requested through the previous cached URL.
const championModuleTag='20260924-champion-export-1';
for(const path of [
  '../pages/guardian-workspace-v2/guardian-bungie-profile.mjs',
  '../pages/guardian-workspace-v2/guardian-manifest-service.mjs',
  '../pages/vault/vault-inventory.mjs'
]){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const tags=[...source.matchAll(/bungie-item-identity\.mjs\?v=([^'"&]+)/g)].map(match=>match[1]);
  assert.deepEqual(tags,[championModuleTag],`${path} must share the current champion export tag`);
}
