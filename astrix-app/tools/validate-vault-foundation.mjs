import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createBuildState} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {EQUIPMENT_GROUPS,VAULT_BUCKET,createVaultCatalogue,filterVaultArmour,groupVaultWorkspaceItems,prepareArmourSelection} from '../pages/vault/vault-inventory.mjs';
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
assert.deepEqual(EQUIPMENT_GROUPS.map(row=>row.label),['Primary','Special','Heavy','Helmet','Gauntlets','Chest','Legs','Class Item'],'The live workspace group order is fixed and must not drift.');
assert.equal(catalogue.items.find(item=>item.itemInstanceId==='vault-weapon')?.equipmentGroup.key,'primary','Vault weapons must retain their real Bungie equipment bucket.');
assert.deepEqual(groupVaultWorkspaceItems(catalogue.items).map(row=>row.key),['primary','special','heavy','helmet','gauntlets','chest','legs','class-item']);
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
const characterRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-workspace-v2.mjs');
const liveActionsRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs');
const vaultInventory=read('astrix-app/pages/vault/vault-inventory.mjs');
const vaultCss=read('astrix-app/pages/vault/vault.css');
const sharedTileCss=read('astrix-app/shared/item-tile.css');
const sharedTileRuntime=read('astrix-app/shared/guardian-inventory-workspace.mjs');
const hoverRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-item-hover.mjs');
const buildRuntime=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs');
const characterHtml=read('astrix-app/pages/guardian-workspace-v2/index.html');
const accessRuntime=read('astrix-app/pages/guardian-workspace-v2/guardian-vault-access.mjs');
const characterHandoff=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space-handoff.mjs');
assert.match(vaultHtml,/id="vaultItemGrid"/);
assert.match(vaultHtml,/id="vaultEvaluate"/);
assert.match(vaultHtml,/id="vaultStatTargets"/);
assert.match(vaultHtml,/id="vaultCandidateBuilds"/);
assert.match(vaultHtml,/id="vaultTransferWorkspace"/,'Vault must expose the DIM-style per-Guardian transfer board.');
assert.doesNotMatch(vaultHtml,/id="vaultActionDialog"|CONFIRM LIVE ACTION/,'Vault movement must not expose a redundant confirmation surface.');
assert.match(vaultHtml,/paradox-item-cards\.css/,'Vault must load the shared Paradox item-card framework.');
assert.doesNotMatch(vaultHtml,/id="vaultItemInspect"/,'Vault must not retain its obsolete page-specific inspection card.');
assert.match(vaultRuntime,/loadPreparedPagePayload\(session,'vault'/);
assert.match(vaultRuntime,/guardianManifest\.hydratePayload/);
assert.match(vaultRuntime,/matchArmourBuilds\(optimiserItems\(\),targets,\{limit:5\}\)/);
assert.match(vaultCss,/\.vault-item-inspect,\.vault-selection-inspect,\.vault-candidate-inspect\{[^}]*width:var\(--apx-icon-gear-art-width\);height:var\(--apx-icon-gear-art-height\)/,'Vault inventory and optimiser item surfaces must consume the exact shared Build Forge portrait geometry.');
assert.match(vaultCss,/\.vault-candidate-item\{[^}]*grid-template-columns:var\(--apx-icon-gear-art-width\) minmax\(0,1fr\)/,'Vault optimiser candidates must consume the canonical shared tile width.');
assert.match(sharedTileCss,/\.tile-season-icon\s*\{[^}]*aspect-ratio:\s*1/,'Vault season art must come from the shared item tile contract.');
assert.match(sharedTileCss,/\.tile-tier-pip--5 \{top:63\.50%\}/,'Vault tier pips must come from the shared item tile contract.');
assert.match(vaultRuntime,/import \{bindParadoxItemInspect\} from '\.\.\/guardian-workspace-v2\/paradox-item-hover\.mjs/,'Vault exact owned instances must use the shared click inspector.');
assert.match(vaultRuntime,/function bindVaultItemInspectors\(root\)[\s\S]*?bindParadoxItemInspect\(target,inspectedItem\(target\.dataset\.inspectItem\),'armour'\)/,'Vault click inspection must resolve exact owned armour instances.');
assert.match(vaultRuntime,/function bindVaultWorkspaceHovers\(root\)[\s\S]*?bindInspect:\(target,item,kind,options\)=>bindParadoxItemInspect\(target,item,kind,options\)/,'Character-column and Vault-only owned instances must use the click-only shared inspector.');
assert.match(vaultRuntime,/function characterColumnMarkup[\s\S]*?data-drop-kind="character"[\s\S]*?\$\{postmasterMarkup\(characterId\)\}[\s\S]*?EQUIPPED[\s\S]*?CARRIED/,'Each real Guardian column must render Postmaster, Equipped, and Carried in order.');
assert.match(vaultRuntime,/data-drop-kind="vault"[\s\S]*?VAULT ONLY/,'Items outside every Guardian must remain in a distinct Vault-only drop target.');
assert.match(vaultRuntime,/executeVaultTransferIntent\(confirmVaultTransferIntent\(action\.intent\)[\s\S]*?if\(result\.attemptCount>0\|\|result\.mutationCount>0\|\|result\.readback\?\.verified\)await refreshAfterLiveAction\(result\.liveInventory\)/,'The UI must reuse verified inventory readback instead of blocking on another post-transfer profile download.');
assert.match(vaultRuntime,/ForgeLoader\?\.done\?\.\(\)[\s\S]*?void refreshAfterLiveAction\(\)/,'Vault must overlay prepared page data with a non-blocking live inventory read after first render.');
assert.match(vaultRuntime,/profile:\{\.\.\.\(payload\?\.profile\|\|\{\}\),\.\.\.\(live\?\.profile\|\|\{\}\)\}/,'A lightweight live inventory result must merge into the complete rendered profile without discarding item components.');
assert.match(vaultRuntime,/session=await getBungieSession\(\{force:true\}\)/,'Vault must refresh the live Worker session, CSRF token, and mutation capabilities before enabling transfers.');
assert.match(vaultRuntime,/failures\.find\(row=>row\.phase!=='readback'\)/,'Vault must report the operational Bungie blocker instead of masking it with a final readback mismatch.');
assert.match(vaultRuntime,/guardian-inventory-workspace\.mjs\?v=20260914-direct-transfer-1/,'Vault must load the current shared drag-and-drop interaction module instead of a stale cached contract.');
assert.match(characterRuntime,/guardian-inventory-workspace\.mjs\?v=20260914-direct-transfer-1/,'Character must load the same current shared inventory interaction module as Vault.');
assert.doesNotMatch(liveActionsRuntime,/vaultActionActivityBlockers/,'Simple inventory movement must not have an inferred activity blocker; Bungie is authoritative.');
assert.match(liveActionsRuntime,/scope='character'[\s\S]*?scope===\s*'inventory'\?'inventory':'character'/,'Live profile requests must explicitly constrain the lightweight inventory scope.');
assert.match(liveActionsRuntime,/allowAcceptedWithoutReadback\?\{verified:false,fresh:null,location:null\}/,'An accepted intermediate transfer leg must continue without a redundant full-profile download.');
assert.match(liveActionsRuntime,/result\.liveInventory=settled\.fresh\|\|null;result\.readback=\{verified:true/,'A final verified profile must be reused as the UI inventory overlay.');
assert.match(characterRuntime,/liveInventory:result\.liveInventory/,'Character inventory actions must publish the already-verified final inventory instead of forcing another blocking read.');
assert.match(vaultRuntime,/function stageTransfer\(item,destination\)[\s\S]*?vaultActionQueue\.push\(\{kind:'transfer',intent,queueKey\}\)[\s\S]*?void performPendingVaultAction\(\)/,'Dropping a card must queue and execute the exact live transfer immediately without a second confirmation click.');
assert.doesNotMatch(vaultRuntime,/function stageTransfer\(item,destination\)\{[\s\S]*?showVaultActionDialog\('Confirm live item transfer'/,'Vault movement must not open a redundant confirmation dialog.');
assert.match(vaultRuntime,/addEventListener\('drop'[\s\S]*?validDrop\(item,destination\)[\s\S]*?stageTransfer\(item,destination\)/,'Dropping a card on a different Guardian or Vault column must immediately dispatch the live transfer.');
assert.match(vaultRuntime,/addEventListener\('pointerdown'[\s\S]*?addEventListener\('pointermove'[\s\S]*?addEventListener\('pointerup',finishPointerDrag\)/,'Touch and pen card dragging must use the same drop contract as desktop drag and drop.');
assert.match(vaultRuntime,/function transferToActiveCharacter\(requestedItemKey\)[\s\S]*?stageTransfer\(item,\{kind:'character',characterId:activeCharacterId\}\)/,'Double-clicking a transferable card must immediately move it to the active Guardian.');
assert.match(sharedTileRuntime,/data-double-click-transfer-item/,'Transferable Vault and other-Guardian cards must advertise the direct double-click transfer action.');
assert.match(sharedTileRuntime,/addEventListener\('keydown',keydown\)[\s\S]*?addEventListener\('pointerup',pointerup\)/,'Direct transfers must support keyboard activation and touch or pen double tap.');
assert.doesNotMatch(sharedTileRuntime,/data-move-live-item|vault-live-move/,'Shared inventory cards must not render MOVE buttons.');
assert.doesNotMatch(vaultRuntime,/catalogue\.items\s*=|\.splice\([^\n]*catalogue|source\.kind\s*=(?!=)/,'Vault drag and drop must not optimistically rewrite owned-item locations.');
assert.match(vaultRuntime,/itemTileMarkup\(item,\{kind:'armour'\}\)/,'Vault cards must render through the shared item tile contract.');
assert.match(sharedTileRuntime,/item\?\.releaseWatermark\?\.icon\|\|item\?\.tierIcon/,'Shared Vault cards must render the prepared genuine Bungie season or source icon.');
assert.match(vaultInventory,/resolveItemWatermark\(\{\.\.\.rawItem,versionNumber\},definition,\{powerCapDefinitions:payload\?\.powerCapDefinitions,currentPowerCap:payload\?\.currentPowerCap\}\)/,'Vault must preserve version-specific Bungie release watermark evidence.');
assert.match(hoverRuntime,/document\.documentElement\.append\(host\)/,'Shared item hover must escape the density-scaled body before positioning.');
assert.match(hoverRuntime,/bounds\.top-gap-height/,'Shared item hover must anchor directly above its item.');
assert.match(hoverRuntime,/host\.style\.maxHeight=`\$\{available\}px`/,'Shared item hover must remain inside the viewport above its item.');
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
