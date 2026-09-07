import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {VAULT_BUCKET,createVaultCatalogue,filterVaultArmour,prepareArmourSelection} from '../pages/vault/vault-inventory.mjs';
import {armourTargetMaximums,matchArmourBuilds} from '../pages/vault/vault-armour-matcher.mjs';
import {applyVaultArmourSelection,createVaultArmourSelection,validateVaultArmourSelection} from '../pages/vault/vault-selection-state.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(new URL(path,`file://${root}/`),'utf8');
const helmetBucket=3448274439;
const chestBucket=14239492;
const payload={
  profile:{
    characters:{data:{c1:{characterId:'c1',classType:0}}},
    profileInventory:{data:{items:[
      {itemHash:1001,itemInstanceId:'vault-helmet',bucketHash:VAULT_BUCKET},
      {itemHash:2001,itemInstanceId:'vault-weapon',bucketHash:VAULT_BUCKET}
    ]}},
    characterInventories:{data:{c1:{items:[{itemHash:1002,itemInstanceId:'carried-chest',bucketHash:1498876634}]}}},
    characterEquipment:{data:{c1:{items:[{itemHash:1001,itemInstanceId:'vault-helmet',bucketHash:helmetBucket}]}}},
    itemComponents:{
      instances:{data:{
        'vault-helmet':{primaryStat:{value:2000},gearTier:3},
        'carried-chest':{primaryStat:{value:2000},gearTier:2}
      }},
      stats:{data:{
        'vault-helmet':{stats:{2996146975:{value:20},392767087:{value:30}}},
        'carried-chest':{stats:{2996146975:{value:15},392767087:{value:25}}}
      }},
      sockets:{data:{'vault-helmet':{sockets:[]},'carried-chest':{sockets:[]}}}
    }
  },
  definitions:{
    '1001':{hash:1001,itemType:2,classType:0,equipableItemSetHash:9001,displayProperties:{name:'Verified Helmet',icon:'/helmet.png'},inventory:{bucketTypeHash:helmetBucket,tierTypeName:'Legendary'}},
    '1002':{hash:1002,itemType:2,classType:0,equipableItemSetHash:9001,displayProperties:{name:'Verified Chest',icon:'/chest.png'},inventory:{bucketTypeHash:chestBucket,tierTypeName:'Legendary'}},
    '2001':{hash:2001,itemType:3,classType:3,displayProperties:{name:'Verified Weapon'},inventory:{bucketTypeHash:1498876634,tierTypeName:'Legendary'}}
  },
  statDefinitions:{
    '2996146975':{displayProperties:{name:'Mobility'}},
    '392767087':{displayProperties:{name:'Resilience'}}
  },
  socketCategoryDefinitions:{},
  equipableItemSets:{'9001':{hash:9001,displayProperties:{name:'Verified Set'},setPerks:[{sandboxPerkHash:9102,requiredSetCount:2},{sandboxPerkHash:9104,requiredSetCount:4}]}},
  sandboxPerks:{
    '9102':{hash:9102,displayProperties:{name:'Verified Two Piece',description:'Verified two-piece effect.'}},
    '9104':{hash:9104,displayProperties:{name:'Verified Four Piece',description:'Verified four-piece effect.'}}
  }
};

const catalogue=createVaultCatalogue(payload);
assert.equal(catalogue.totals.all,2,'Vault total must come from shared Vault entries only.');
assert.equal(catalogue.totals.armour,1,'Vault armour total must use verified manifest item types.');
assert.equal(catalogue.totals.other,1,'Other Vault count must be derived, not invented.');
assert.equal(catalogue.totals.ownedArmour,2,'Owned armour must include deduplicated carried/equipped inventory.');
assert.equal(catalogue.armour.find(item=>item.itemInstanceId==='vault-helmet')?.source.kind,'equipped','Duplicate instances must retain the highest-confidence location.');
assert.equal(filterVaultArmour(catalogue.armour,{characterClass:'titan',slot:'helmet'}).length,1);
assert.equal(filterVaultArmour(catalogue.armour,{search:'verified chest'}).length,1);
const prepared=prepareArmourSelection(payload,catalogue.armour);
assert.equal(prepared.length,2);
assert.equal(prepared[0].setBonus.twoPiece.active,true);

const pickerItems=Array.from({length:5},(_,slot)=>[
  {slotIndex:slot,itemInstanceId:`slot-${slot}-high`,itemHash:3000+slot,name:slot===0?'Duplicate Helmet':'High Stat Item',isExotic:slot<2,stats:[{name:'Health',value:10},{name:'Grenade',value:1}]},
  {slotIndex:slot,itemInstanceId:`slot-${slot}-balanced`,itemHash:4000+slot,name:slot===0?'Duplicate Helmet':'Balanced Item',isExotic:false,stats:[{name:'Health',value:8},{name:'Grenade',value:5}]},
  {slotIndex:slot,itemInstanceId:`slot-${slot}-middle`,itemHash:5000+slot,name:'Middle Item',isExotic:false,stats:[{name:'Health',value:9},{name:'Grenade',value:2}]}
]).flat();
const pickerMaximums=armourTargetMaximums(pickerItems);
assert.equal(pickerMaximums.health,49,'Target limits must respect the one-Exotic armour rule.');
const pickerMatches=matchArmourBuilds(pickerItems,{health:49},{limit:5,beamLimit:500});
assert.equal(pickerMatches.length,5,'Armour Picker must return five closest complete sets when five are available.');
assert.equal(pickerMatches[0].items.length,5,'Every Armour Picker result must contain all five armour slots.');
assert.equal(pickerMatches[0].stats.health,49,'Closest legal set must satisfy the verified target when owned pieces permit it.');
assert.equal(pickerMatches[0].items.filter(item=>item.isExotic).length,1,'Armour Picker must never select more than one Exotic.');
assert.equal(new Set(pickerMatches[0].items.map(item=>item.itemInstanceId)).size,5,'Armour Picker results must retain exact duplicate item instances.');
assert.deepEqual(matchArmourBuilds(pickerItems,{}),[],'Armour Picker must not invent a target when none was selected.');

const binding={characterId:'c1',membershipId:'m1',membershipType:'3'};
const selection=createVaultArmourSelection({binding,slots:prepared.map(item=>({slot:item.slotIndex,item})),sourcePage:'build'});
assert.equal(validateVaultArmourSelection(selection,{expectedBinding:binding})?.slots.length,2);
assert.equal(validateVaultArmourSelection(selection,{expectedBinding:{...binding,characterId:'other'}}),null,'Cross-character Vault handoffs must be rejected.');
assert.equal(validateVaultArmourSelection(createVaultArmourSelection({binding:{characterId:'c1'},slots:[{slot:0,item:prepared[0]}]})),null,'Vault handoffs without exact Bungie membership binding must be rejected.');

const baseline={characterId:'c1',membershipId:'m1',membershipType:'3',armour:[{itemInstanceId:'old-helmet'},null,{itemInstanceId:'old-chest'},null,null]};
const state=createBuildState(baseline);
state.validationRecords=[{testId:'stale-test'}];
const result=applyVaultArmourSelection(state,selection);
assert.equal(result.applied,true);
assert.equal(result.state.originalBuild.armour[0].itemInstanceId,'old-helmet','Original Build must remain immutable.');
assert.equal(result.state.workingBuild.armour[0].itemInstanceId,'vault-helmet','Vault selection must change only Working Build.');
assert.equal(result.state.workingBuild.armour[2].itemInstanceId,'carried-chest');
assert.equal(result.state.workingBuild.armour[0].setBonus.twoPiece.active,true,'Final Working Build must recalculate armour-set thresholds.');
assert.equal(result.state.validationRecords.length,0,'Prior mission test results must not carry onto changed Vault armour.');
assert.equal(result.state.workingBuild.hashCoverage.armour.complete,true);

const vaultHtml=read('astrix-app/pages/vault/index.html');
const vaultRuntime=read('astrix-app/pages/vault/vault.mjs');
const vaultCss=read('astrix-app/pages/vault/vault.css');
const buildRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs');
const characterHtml=read('astrix-app/pages/guardian-workspace-v2/index.html');
const accessRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-vault-access.mjs');
const characterHandoff=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space-handoff.mjs');
assert.match(vaultHtml,/id="vaultItemGrid"/);
assert.match(vaultHtml,/id="vaultEvaluate"/);
assert.match(vaultHtml,/id="vaultStatTargets"/);
assert.match(vaultHtml,/id="vaultCandidateBuilds"/);
assert.match(vaultHtml,/id="vaultItemInspect"/);
assert.match(vaultRuntime,/loadPreparedPagePayload\(session,'vault'/);
assert.match(vaultRuntime,/guardianManifest\.hydratePayload/);
assert.match(vaultRuntime,/matchArmourBuilds\(optimiserItems\(\),targets,\{limit:5\}\)/);
assert.match(vaultCss,/--vault-item-icon:var\(--apx-icon-catalog,8rem\)/,'Vault inventory art must remain anchored to the shared catalogue token instead of filling the grid column.');
assert.match(vaultCss,/\.vault-candidate-item\{[^}]*grid-template-columns:var\(--apx-icon-card\)[\s\S]*?\.vault-candidate-item img\{width:var\(--apx-icon-card\);height:var\(--apx-icon-card\)/,'Vault optimiser candidates must consume the shared card icon token.');
assert.match(vaultCss,/\.vault-item-inspect\{position:fixed/,'Exact item stats require the Forge hover inspection card.');
assert.doesNotMatch(vaultCss,/\.vault-item-inspect\{top:6rem;right:1rem\}/,'Vault inspection must not remain pinned to the top-right corner.');
assert.match(vaultRuntime,/function positionItemInspect\(panel,anchor\)[\s\S]*?getBoundingClientRect\(\)[\s\S]*?bounds\.right\+gap[\s\S]*?bounds\.left-width-gap/,'Vault inspection must follow its item and flip at the viewport edge.');
assert.match(vaultRuntime,/document\.documentElement\.append\(panel\)/,'Vault inspection must escape the desktop density-scaled body before positioning.');
assert.match(vaultRuntime,/ForgeLoader\?\.done\?\.\(\)/,'Vault must release the loader after its bounded visible-image settle.');
assert.doesNotMatch(vaultRuntime,/ForgeLoader\?\.ready\?\.\(document\.querySelector\('\.apx-page-shell'\)\)/,'Vault must not wait on off-screen lazy armour images.');
assert.match(buildRuntime,/applyVaultArmourSelection/);
assert.match(characterHtml,/guardian-vault-access\.mjs/);
assert.match(accessRuntime,/OPEN FORGE LOADER/);
assert.match(accessRuntime,/pages\/forge-loader/,'Character and Build armour interactions must route to Forge Loader while Vault remains a visual inventory destination.');
assert.match(accessRuntime,/forge:vault-open/);
assert.match(characterHandoff,/persistVaultBuildSource/);
assert.doesNotMatch(vaultHtml,/mock inventory|vault scaffold/i,'Vault must not present invented inventory data.');
assert.match(vaultHtml,/id="vaultTotalCount">—</,'Vault totals must begin in an unresolved state.');

console.log('VAULT_FOUNDATION=PASS');
