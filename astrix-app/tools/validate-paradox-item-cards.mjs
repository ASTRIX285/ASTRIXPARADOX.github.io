import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ROOT=new URL('../pages/guardian-workspace-v2/',import.meta.url);
const read=path=>readFile(new URL(path,ROOT),'utf8');
const [weaponRuntime,armourRuntime,interceptor,buildRuntime,cardCss,gearRuntime,vaultRuntime,hoverRuntime]=await Promise.all([
  read('guardian-semantic-ui.mjs'),
  read('guardian-beta-runtime.mjs'),
  read('guardian-semantic-interceptor.mjs'),
  read('paradox-build-space/paradox-build-space.mjs'),
  read('paradox-item-cards.css'),
  read('guardian-gear-layout.mjs'),
  read('../vault/vault.mjs'),
  read('paradox-item-hover.mjs')
]);
const weaponUi=weaponRuntime+'\n'+await read('guardian-weapon-presentation.mjs');

assert.match(weaponUi,/data-perk-capacity="\$\{capacity\}"/,'Every weapon perk socket must expose its tier-derived column capacity');
assert.match(weaponUi,/All returned perk choices are shown/,'The inspector must explain complete instance perk choices');
assert.match(weaponUi,/WEAPON MODS/,'The bottom section must identify weapon mods');
assert.match(cardCss,/weapon-detail-tile--mod img\{border-radius:4px/,'Weapon mod tiles must be square');
const stats=weaponUi.indexOf('paradox-section--stats');
const traits=weaponUi.indexOf('paradox-section--traits',stats);
const perks=weaponUi.indexOf('paradox-section--perks',traits);
const mods=weaponUi.indexOf('paradox-section--support',perks);
assert.ok(stats>=0&&traits>stats&&perks>traits&&mods>perks,'Weapon details must render stats, intrinsic/Exotic traits, perk columns, then mods/masterwork');
assert.match(weaponUi,/weapon-exotic-traits[\s\S]*?EXOTIC WEAPON TRAITS/,'Exotic weapon traits must remain nested beneath the intrinsic trait');
assert.match(weaponUi,/CATALYST · \$\{s\.catalyst\?\.progress\?\.masterworked\?"MASTERWORKED"/,'A completed Exotic catalyst must be visibly identified as masterworked');

for(const section of ['ARMOUR STATS','ENERGY','ARCHETYPE &amp; TRAITS','ARMOUR COSMETICS','ARMOUR MODS']){
  assert.ok(armourRuntime.includes(section),`Armour detail framework is missing ${section}`);
}
assert.match(interceptor,/payload\?\.statDefinitions\?\.\[String\(hash\)\][\s\S]*?name:String\(definition\?\.displayProperties\?\.name/,'Per-item armour stat labels must come from the live Bungie stat definitions');
assert.match(buildRuntime,/openWeaponDetail\(item\)/,'Build Forge weapon models must open the shared Character weapon inspector');
assert.match(buildRuntime,/openArmourDrawer\(index,build\.armour\?\.\[index\]\)/,'Build Forge armour models must open the shared Character armour inspector');
assert.match(cardCss,/\.paradox-item-card \.weapon-perk-row\{grid-template-columns:repeat\(var\(--weapon-perk-columns\),var\(--paradox-perk-size,var\(--apx-icon-detail-identity\)\)\)/,'Weapon perk rows must use one shared-token aligned column grid');
assert.match(cardCss,/font:550 13px\/1\.45 bahnschrift/,'Item-card supporting copy must remain readable');
assert.match(cardCss,/\.paradox-item-hover\{position:fixed;[^}]*pointer-events:none/,'Shared item hover must remain a non-blocking viewport layer');
assert.match(cardCss,/\.paradox-item-hover-card\{--paradox-card-violet:#b51e2a;--paradox-card-teal:var\(--paradox-card-gold\)/,'Compact hover must use the corrected crimson and gold palette');
assert.match(gearRuntime,/item\?\.releaseWatermark\?\.icon \?\? resolveItemWatermark/,'Armour season art must prefer the version-specific prepared Bungie watermark');
assert.match(gearRuntime,/bindParadoxItemHover\(art,armour\[idx\],"armour"\)/,'Character armour art must expose the shared hover card');
assert.match(weaponUi,/item\?\.releaseWatermark\?\.icon\?\?resolveItemWatermark/,'Weapon season art must prefer the version-specific prepared Bungie watermark');
assert.match(weaponUi,/bindParadoxItemHover\(art\|\|card,item,'weapon'\)/,'Character and Build weapon art must expose the shared hover card');
assert.match(buildRuntime,/manualEditorItems[\s\S]*?bindParadoxItemHover\(node,rows\[Number\(node\.dataset\.manualItemIndex\)\],manualEditorState\.kind\)/,'Build Forge manual item choices must expose exact-item hover');
assert.match(buildRuntime,/recommendedArmourSummary[\s\S]*?bindParadoxItemHover\(node,build\.armour\?\.\[index\],'armour'\)/,'Build Forge recommended armour must expose exact-item hover');
assert.match(buildRuntime,/data-review-weapon[\s\S]*?bindParadoxItemHover\(node,item,'weapon'\)/,'Build Forge recommended weapons must expose exact-item hover');
assert.match(vaultRuntime,/function bindVaultItemHovers\(root\)[\s\S]*?bindParadoxItemHover\(target,inspectedItem\(target\.dataset\.inspectItem\),'armour'\)/,'Vault must expose exact owned instances through the shared hover card');
assert.match(hoverRuntime,/resolveItemWatermark\(item\?\?\{\},item\?\.definition\?\?\{\}\)/,'Hover season art must come from Bungie item identity data');
assert.match(hoverRuntime,/host\.style\.top=`\$\{Math\.max\(pad,Math\.round\(bounds\.top-gap-height\)\)\}px`/,'Shared item hover must anchor directly above its item without crossing the viewport top');
assert.match(hoverRuntime,/function bindParadoxItemInspect\([\s\S]*?target\.dataset\.paradoxItemInspect=kind/,'Owned-instance tiles must expose the shared click inspector without changing the original hover binder.');
assert.match(hoverRuntime,/host\.className='forge-item-inspect paradox-inventory-inspect paradox-item-shell'/,'The owned-instance click surface must use the full shared Forge item inspector contract.');
assert.match(hoverRuntime,/MODS AND COSMETICS/,'The click inspector must place real functional and appearance sockets together at the bottom.');
assert.match(cardCss,/\.paradox-item-inspect-card\.is-legendary \.paradox-item-header\{background:linear-gradient\(100deg,#5b3470/,'Legendary inspection headers must retain Destiny purple.');
assert.match(cardCss,/\.paradox-item-inspect-card\.is-exotic \.paradox-item-header\{background:linear-gradient\(100deg,#9d771f/,'Exotic inspection headers must retain Destiny gold.');
assert.match(cardCss,/\.paradox-item-inspect-card \.weapon-stat i b\.weapon-stat-base\{background:#fff\}/,'Click-inspector base stat bars must remain white.');
assert.match(cardCss,/\.paradox-item-inspect-card \.weapon-stat\.has-enhanced-value strong\{color:#e6bf48\}/,'Enhanced weapon stat totals must render in gold.');
assert.doesNotMatch(hoverRuntime,/placeholder|mock item|fake/i,'Shared item hover must not invent item data');

console.log('PARADOX_ITEM_CARD_FRAMEWORK=PASS');
console.log('PARADOX_WEAPON_PERK_HIERARCHY=PASS');
console.log('PARADOX_ARMOUR_DETAIL_MODEL=PASS');

// Execute the actual support-socket presentation with multiple equipped mods.
const {runInNewContext}=await import('node:vm');
const helperStart=weaponUi.indexOf('function weaponSupportIconsMarkup('),helperEnd=weaponUi.indexOf('\nfunction renderWeapons(',helperStart);
const scope={bungieHash:v=>Number(v?.bungieHash??v?.hash)||null,bungieIcon:v=>v||'',text:v=>v?.name||'',esc:v=>String(v),hashAttribute:v=>` data-bungie-hash="${v.hash}"`,perkTooltipAttributes:()=>''};
runInNewContext(weaponUi.slice(helperStart,helperEnd)+'this.renderSupport=weaponSupportIconsMarkup;',scope);
const modFixture={weaponSemantics:{modSockets:[{hash:11,socketIndex:4,name:'Mod A',icon:'/a.png'},{hash:11,socketIndex:5,name:'Mod A',icon:'/a.png'},{hash:12,socketIndex:6,name:'Mod B',definition:{displayProperties:{icon:'/b.png'}}},{hash:13,socketIndex:7,name:'Unresolved icon'}]}};
const modBefore=JSON.stringify(modFixture),modMarkup=scope.renderSupport(modFixture);
assert.equal((modMarkup.match(/data-slot-shape="square"/g)||[]).length,4,'Every mapped socket must render, including duplicate hashes in separate sockets');
assert.ok(modMarkup.includes('/b.png'),'Definition-backed icons must not disappear');
assert.ok(modMarkup.includes('Icon unavailable'),'A missing icon must not silently remove the socket');
assert.equal(JSON.stringify(modFixture),modBefore,'Presentation must not mutate equipped selections');
assert.equal(scope.renderSupport({}),'','Absent socket data must not invent mods');
console.log('WEAPON_SUPPORT_SOCKET_PRESENTATION=PASS');
