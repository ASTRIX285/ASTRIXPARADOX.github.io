import assert from 'node:assert/strict';
import {characterLoadoutsFixture} from './fixtures/character-loadouts-fixture.mjs';
import {loadoutStatus,loadoutGear,acceptedEquipment} from '../pages/guardian-workspace-v2/guardian-loadout-status.mjs';
const {profile,loadouts,definitions}=characterLoadoutsFixture();
assert.deepEqual(loadouts.map(row=>loadoutStatus(row,profile,'1').state),['equipped','ready','missing','empty']);
assert.equal(loadoutStatus(loadouts[2],profile,'1').label,'2 items missing');
assert.equal(loadoutStatus(loadouts[0],profile,'2').state,'missing');
assert.equal(loadoutGear(loadouts[1],profile,definitions).length,8);
const before=JSON.stringify(profile),accepted=acceptedEquipment(loadouts[1],profile,'1');
assert.equal(JSON.stringify(profile),before,'Presentation must not mutate the Bungie profile');
assert.equal(loadoutStatus(loadouts[1],accepted,'1').state,'equipped');
assert.equal(loadoutStatus(loadouts[0],accepted,'1').state,'ready','Displaced gear remains on the character');
assert.equal(acceptedEquipment(loadouts[2],profile,'1'),profile,'Never invent a missing item after an acknowledgement');
const postmaster=structuredClone(profile);postmaster.characterInventories.data['1'].items[0].bucketHash=215593132;
assert.equal(loadoutStatus(loadouts[1],postmaster,'1').missing,1);
postmaster.characterInventories.data['1'].items[1].location=4;
assert.equal(loadoutStatus(loadouts[1],postmaster,'1').missing,2);
// Bungie lists an empty in-game slot with instance ID 0 entries: it is empty, never "missing".
assert.equal(loadoutStatus({items:[{itemInstanceId:'0'},{itemInstanceId:'0'}]},profile,'1').state,'empty');
assert.equal(loadoutStatus({items:[{itemInstanceId:'0'}]},profile,'1').label,'Empty in game');
assert.equal(loadoutStatus({subclassOverrides:[{}]},profile,'1').state,'empty');
// A saved loadout's ID 0 placeholders are unused slots, not missing items.
assert.equal(loadoutStatus({...loadouts[1],items:[...loadouts[1].items,{itemInstanceId:'0'}]},profile,'1').state,loadoutStatus(loadouts[1],profile,'1').state);
const changed=structuredClone(accepted);changed.characterEquipment.data['1'].items.pop();
assert.notEqual(loadoutStatus(loadouts[1],changed,'1').state,'equipped','Any different equipped item removes the active badge');
console.log('CHARACTER_LOADOUT_STATUS=PASS');
