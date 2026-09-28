import assert from 'node:assert/strict';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
import {adaptDimLoadout} from '../core/dim-import/adapt.mjs';
import {renderDimComparison} from '../core/dim-import/review.mjs';

function fixture(){
  const f=loadoutDetailsFixture(),snapshot={version:f.manifestVersion,tables:{...f.manifest.tables,DestinyInventoryItemDefinition:f.definitions}};
  f.profile.characters.data['2']={classType:2};
  const loadout={name:'Shared target',classType:0,equipped:f.profile.characterEquipment.data['1'].items.map(item=>({hash:item.itemHash,id:'foreign',socketOverrides:Object.fromEntries(f.profile.itemComponents.sockets.data[item.itemInstanceId].sockets.map((p,i)=>[i,p.plugHash]))})),unequipped:[],parameters:{}};
  return {f,adapt:()=>adaptDimLoadout(loadout,{snapshot,profile:f.profile,binding:{membershipId:'123',membershipType:'3'},preferredCharacterId:'2'})};
}
const rows=html=>html.split('class="apx-dim-tile ').slice(1);

// Every shared piece is in the inventory: green tick on each, nothing darkened.
let h=fixture(),html=renderDimComparison(h.adapt().build);
assert.match(html,/SHARED BUILD FIT/);
assert.equal((html.match(/class="apx-dim-fit-row"/g)||[]).length,1,'All pieces sit in one row.');
assert.equal(rows(html).length,9);
assert.match(rows(html)[0],/Fixture subclass/,'Subclass comes first, then weapons, then armour.');
assert.doesNotMatch(html,/apx-dim-notes/,'No notes when everything is in the inventory.');
assert.match(html,/<b>9 of 9<\/b> in your inventory/);
assert.equal((html.match(/apx-dim-badge is-ok/g)||[]).length,9);
assert.doesNotMatch(html,/is-gone/);

// A weapon is gone: original darkened with a red cross, the adaptation's own
// pick shown as the replacement with its reasons.
h=fixture();const original=h.f.profile.characterEquipment.data['1'].items.shift();
h.f.definitions[22002]={...h.f.definitions[original.itemHash],hash:22002,displayProperties:{name:'Replacement 22002'}};
h.f.profile.profileInventory.data.items.push({...original,itemHash:22002,itemInstanceId:'9002'});
h.f.profile.itemComponents.sockets.data['9002']={sockets:[]};
html=renderDimComparison(h.adapt().build);
let row=rows(html).find(text=>text.startsWith('is-substituted'));
assert.ok(row,'A substituted row is shown.');
assert.match(row,/apx-dim-slot is-gone/);assert.match(row,/apx-dim-badge is-gone/);assert.match(row,/aria-label="Not in your inventory"/);
assert.match(row,/apx-dim-slot is-pick/);assert.match(row,/Replacement suggested/);
assert.match(html,/is not in your inventory\. Replacement: Replacement 22002\./);
assert.match(html,/1 replacement suggested/);

// A missing Exotic has no stand-in: red cross and "No match", never a guess.
h=fixture();const exotic=h.f.profile.characterEquipment.data['1'].items.shift();
h.f.definitions[exotic.itemHash].inventory={...h.f.definitions[exotic.itemHash].inventory,tierType:6};
html=renderDimComparison(h.adapt().build);
row=rows(html).find(text=>text.startsWith('is-missing'));
assert.ok(row);assert.match(row,/apx-dim-badge is-gone/);assert.match(row,/No match/);assert.doesNotMatch(row,/is-pick/);
assert.match(html,/nothing you have fits this slot/);
assert.match(html,/1 with no replacement/);

console.log('DIM_FIT_STATUS=PASS one row in DIM order, ticks for pieces in inventory, darkened cross and adaptation replacement for missing pieces, no stand-in for a missing Exotic');
