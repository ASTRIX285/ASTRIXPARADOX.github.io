#!/usr/bin/env node
import assert from 'node:assert/strict';
import {equippedLoadoutCandidates,inferEquippedLoadoutIndex} from '../pages/guardian-workspace-v2/guardian-equipped-loadout.mjs';

const CHARACTER_ID='2305843009264858730';
const IDS=[
  '6917530187686447681','6917530187686447682','6917530187686447683',
  '6917530187686447684','6917530187686447685','6917530187686447686',
  '6917530187686447687','6917530187686447688','6917530187686447689'
];

const loadout=(ids,plugBase=100)=>({items:ids.map((itemInstanceId,index)=>({itemInstanceId,plugItemHashes:[plugBase+index]}))});
const profile=(equippedIds,loadouts)=>({
  characterEquipment:{data:{[CHARACTER_ID]:{items:equippedIds.map(itemInstanceId=>({itemInstanceId}))}}},
  characterLoadouts:{data:{[CHARACTER_ID]:{loadouts}}},
  itemComponents:{sockets:{data:Object.fromEntries(equippedIds.map((itemInstanceId,index)=>[itemInstanceId,{sockets:[{plugHash:100+index}]}]))}}
});

assert.equal(inferEquippedLoadoutIndex(profile(IDS,[loadout(IDS.slice(0,-1)),loadout(IDS)]),CHARACTER_ID),1,'The unique exact live equipment match must select its Bungie slot.');
assert.equal(inferEquippedLoadoutIndex(profile(IDS,[loadout([...IDS.slice(0,-1),'999'])]),CHARACTER_ID),null,'A loadout containing a different exact item must not be marked equipped.');
assert.equal(inferEquippedLoadoutIndex(profile(IDS,[loadout(IDS,200),loadout(IDS,100)]),CHARACTER_ID),1,'Live socket evidence must disambiguate loadouts that share the same items.');
assert.equal(inferEquippedLoadoutIndex(profile(IDS,[loadout(IDS,100),loadout(IDS,100)]),CHARACTER_ID),null,'Indistinguishable duplicate loadouts must not produce a false active slot.');
assert.equal(inferEquippedLoadoutIndex(profile(IDS,[loadout(IDS.slice(0,4),100)]),CHARACTER_ID),null,'A small incidental item subset must not be mistaken for an equipped loadout.');
assert.equal(inferEquippedLoadoutIndex({},CHARACTER_ID),null,'Missing optional Bungie components must remain non-fatal.');
assert.deepEqual(equippedLoadoutCandidates(profile(IDS,[loadout(IDS,200),loadout(IDS,100)]),CHARACTER_ID),[{index:1,itemCount:9,plugCount:9}]);

console.log('Guardian equipped-loadout inference tests passed.');
