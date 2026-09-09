import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup,weaponDetailTile} from '../pages/guardian-workspace-v2/guardian-weapon-presentation.mjs';
import {perkTooltipAttributes,perkTooltipMarkup} from '../pages/guardian-workspace-v2/guardian-perk-tooltip.mjs';

// Synthetic rendering fixture. It does not claim an owned roll or live account values.
const perk={hash:111235976,name:'Corkscrew Rifling',description:'Description only inside the tooltip.',icon:'/test.png',definition:{itemTypeDisplayName:'Enhanced Barrel'}};
const item={weaponSemantics:{intrinsic:perk,perkModel:{weaponTier:5,expectedRowCount:3,columns:[{socketIndex:1,selectedPlugHash:perk.hash,options:[perk]},{socketIndex:4,selectedPlugHash:1483536627,options:[{...perk,hash:1483536627},perk,perk]}]}}};
const before=JSON.stringify(item),matrix=weaponPerkMatrixMarkup(item);
assert.equal((matrix.match(/class="weapon-perk-row"/g)||[]).length,3);
assert.equal((matrix.match(/data-socket-index="4"/g)||[]).length,3);
assert.match(matrix,/data-paradox-id="paradox:bungie:DestinyInventoryItemDefinition:111235976"/);
assert.ok(!matrix.includes(' title='),'Native tooltips must not compete with the Paradox tooltip');
assert.ok(!matrix.includes('>Description only'),'Descriptions must not occupy icon grid space');
assert.ok(!weaponTraitHierarchyMarkup(item).includes('<p>'));
assert.ok(!weaponDetailTile(perk,'Weapon mod',{square:true}).includes('<small>'));
assert.match(perkTooltipAttributes(perk),/Enhanced Barrel/);
assert.match(perkTooltipMarkup({perkName:'<unsafe>',perkDescription:'Readable details'}),/&lt;unsafe&gt;/);
assert.equal(JSON.stringify(item),before,'Rendering must not change perks or stats');
const css=await readFile(new URL('../pages/guardian-workspace-v2/paradox-item-cards.css',import.meta.url),'utf8');
const density=await readFile(new URL('../shared/astrix-desktop-density.css',import.meta.url),'utf8');
assert.match(density,/--apx-icon-weapon-socket-fluid:var\(--apx-icon-socket-compact\)/,'Root icon token must not reference descendant-only variables');
assert.match(css,/grid-template-areas:"art cap" "perks perks" "support support"/);
assert.match(css,/outline:2px solid #ef3340/);
assert.match(css,/border-radius:0;background:#18151b/);
const compactRules=[...css.matchAll(/([^{}]+)\{([^{}]*var\(--apx-icon-socket-compact\)[^{}]*)\}/g)];
assert.ok(compactRules.length>0);
for(const [,selector] of compactRules){
  assert.ok(selector.includes('.paradox-item-hover-card'),'Compact sizing must explicitly include the root-level hover card');
  assert.ok(!selector.includes('body '),'Hover sizing cannot require a body ancestor');
  assert.ok(!selector.includes('.paradox-item-card--weapon'),'Compact sizing must not resize the approved expanded inspector');
}
assert.match(css,/\.paradox-item-hover-card \.weapon-perk-cell\.is-selected\{background:#367fa6/,'Equipped hover perks must receive their blue background outside body');
assert.match(css,/(?:^|\n)\[data-paradox-perk-tooltip\]:is\([^{}]+\)\{outline:2px solid #ef3340/,'Root-level hover perks must receive the red inspection ring');
assert.match(css,/--paradox-perk-size: var\(--apx-icon-detail-identity\)/,'Expanded inspector keeps its original icon token');
console.log('WEAPON_PRESENTATION=PASS');
