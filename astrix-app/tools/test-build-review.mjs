import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
import {adaptDimLoadout} from '../core/dim-import/adapt.mjs';
import {decodeReviewUrl,encodeReviewUrl,reachableStep,goalComplete} from '../pages/build-review/build-review-url.mjs';
import {sharedBuildView,goalButtonLabel,goalSentence,elementReason} from '../pages/build-review/build-review-model.mjs';

// 1. Build Review mirrors Build Forge logic verbatim. Build Forge is the
// source: if it changes, this fails until the mirror is updated to match.
const pipeline=await readFile(new URL('../pages/build-review/build-review-pipeline.mjs',import.meta.url),'utf8');
const forge=await readFile(new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',import.meta.url),'utf8');
const mirror=pipeline.slice(pipeline.indexOf('// MIRRORED FROM BUILD FORGE: START\n')+'// MIRRORED FROM BUILD FORGE: START\n'.length,pipeline.indexOf('\n// MIRRORED FROM BUILD FORGE: END'));
assert.ok(mirror.includes('function importedGenerationBase('),'The mirror block is present.');
const chunks=mirror.split(/\n(?=const |function )/);
assert.ok(chunks.length>=8,'Every mirrored declaration is checked.');
for(const chunk of chunks)assert.ok(forge.includes(chunk),`Build Review drifted from Build Forge: ${chunk.slice(0,60)}`);

// 2. URL contract.
let s=decodeReviewUrl('?dim=https%3A%2F%2Fdim.gg%2Fabc1234%2FVesper&activity=raid&objective=dps&element=arc&step=3&characterId=123&membershipId=456&membershipType=3');
assert.equal(s.dim,'abc1234');assert.equal(s.step,3);assert.equal(s.activity,'raid');
assert.deepEqual(decodeReviewUrl(encodeReviewUrl(s)),s,'Encode and decode round trip.');
assert.equal(decodeReviewUrl('?dim=abc1234&activity=raid&step=3').step,2,'An incomplete goal falls back to step 2.');
assert.equal(decodeReviewUrl('?activity=raid&step=2').step,1,'No share falls back to step 1.');
assert.equal(decodeReviewUrl('?dim=abc1234&activity=bogus&objective=dps&element=arc&step=3').step,2,'Invalid values are dropped, never guessed.');
assert.equal(decodeReviewUrl('?dim=abc1234&characterId=12a').characterId,'');
assert.equal(decodeReviewUrl('?dim=%7B%22name%22%3A%22x%22%7D').dim,'','Embedded loadout JSON never enters the URL.');
const encoded=encodeReviewUrl({...s,token:'secret',access_token:'x',itemInstanceId:'999'});
assert.doesNotMatch(encoded,/secret|token|itemInstanceId/,'No secrets or instances in the URL.');
assert.equal(reachableStep({dim:'abc1234'},9),1);assert.equal(goalComplete({activity:'raid',objective:'dps'}),false);

// 3. Step 1 view models come only from the adaptation.
function fixture(){
  const f=loadoutDetailsFixture(),snapshot={version:f.manifestVersion,tables:{...f.manifest.tables,DestinyInventoryItemDefinition:f.definitions}};
  f.profile.characters.data['2']={classType:2};
  const loadout={name:'Vesper Titan Boss',classType:0,equipped:f.profile.characterEquipment.data['1'].items.map(item=>({hash:item.itemHash,id:'foreign',socketOverrides:Object.fromEntries(f.profile.itemComponents.sockets.data[item.itemInstanceId].sockets.map((p,i)=>[i,p.plugHash]))})),unequipped:[],parameters:{}};
  return {f,snapshot,loadout,adapt:()=>adaptDimLoadout(loadout,{snapshot,profile:f.profile,binding:{membershipId:'123',membershipType:'3'},preferredCharacterId:'2'})};
}
let h=fixture(),view=sharedBuildView(h.adapt());
assert.equal(view.name,'Vesper Titan Boss');
assert.deepEqual(view.counts,{total:8,found:8,guardian:8,vault:0,other:0,substituted:0,missing:0});
assert.equal(view.weapons.length,3);assert.equal(view.armour.length,5);
assert.equal(view.weapons[0].statusLabel,'On this Guardian');
assert.ok(view.weapons.every(row=>row.name&&!/\[/.test(row.name)),'Real names, never placeholders.');
// Vault item.
h=fixture();const moved=h.f.profile.characterEquipment.data['1'].items.shift();h.f.profile.profileInventory.data.items.push(moved);
view=sharedBuildView(h.adapt());
assert.equal(view.counts.vault,1);assert.equal(view.weapons[0].statusLabel,'In your Vault');
// Missing Exotic.
h=fixture();const gone=h.f.profile.characterEquipment.data['1'].items.shift();h.f.definitions[gone.itemHash].inventory={...h.f.definitions[gone.itemHash].inventory,tierType:6};
view=sharedBuildView(h.adapt());
assert.equal(view.counts.missing,1);assert.equal(view.weapons[0].status,'missing');assert.deepEqual(view.missingNames,[view.weapons[0].name]);assert.ok(view.blockers.length);

// 4. Step 2 copy.
assert.equal(goalButtonLabel({}),'PICK AN ACTIVITY, AN OBJECTIVE AND AN ELEMENT');
assert.equal(goalButtonLabel({element:'arc'}),'PICK AN ACTIVITY AND AN OBJECTIVE');
assert.equal(goalButtonLabel({objective:'dps',element:'arc'}),'PICK AN ACTIVITY');
assert.equal(goalButtonLabel({activity:'raid',objective:'dps',element:'arc'}),'ANALYSE BUILD');
for(const partial of [{},{activity:'raid'},{activity:'raid',objective:'dps'}])assert.doesNotMatch(goalButtonLabel(partial),/READY/);
assert.equal(goalSentence({activity:'raid',objective:'dps',element:'arc'},{buildName:'Vesper Titan Boss',importElement:'arc'}),'Improve Vesper Titan Boss for a Raid, focused on DPS, keeping Arc.');
assert.equal(goalSentence({activity:'raid',objective:'dps',element:'void'},{buildName:'X',importElement:'arc'}),'Improve X for a Raid, focused on DPS, switching to Void.');
assert.equal(goalSentence({activity:'raid'},{buildName:'X'}),'');
assert.equal(elementReason('arc','Striker'),'Arc is pre-selected: the imported build runs Arc Striker. Pick another to rebuild around it.');
assert.equal(elementReason('',''),'');

console.log('BUILD_REVIEW=PASS Build Forge mirror, URL contract, step 1 ownership views, step 2 labels and summary');
