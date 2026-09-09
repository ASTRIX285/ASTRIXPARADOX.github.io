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
console.log('WEAPON_PRESENTATION=PASS');
