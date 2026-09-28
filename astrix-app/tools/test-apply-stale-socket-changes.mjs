// A socket change carried from an imported build belongs to a specific item.
// If Paradox swaps that item out, the change no longer applies and must not
// block Apply ("Command Frame IV is not attached", Miguel, 28 Sep 2026).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs',import.meta.url),'utf8');
assert.match(source,/targetIds=new Set\(targets\.map\(target=>target\.itemInstanceId\)\)/,'Apply knows which items are in the build.');
assert.match(source,/manualSocketChanges[\s\S]{0,400}\.filter\(change=>targetIds\.has\(String\(change\.itemInstanceId\)\)\)/,'Carried socket changes for items no longer in the build are dropped, not blocking.');
const {createLiveTransferPlan}=await import('../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs');
const build={characterId:'1',membershipId:'2',membershipType:'3',weapons:[],armour:[],manualSocketChanges:[{itemInstanceId:'999',itemHash:1,socketIndex:4,plugHash:5,plugName:'Command Frame IV',remoteSupported:true,reversible:true}]};
const plan=createLiveTransferPlan({build,originalBuild:build});
assert.ok(!plan.blockers.some(text=>/Command Frame IV/.test(text)),'A swapped-out item never blocks Apply.');
console.log('APPLY_STALE_SOCKET_CHANGES=PASS socket changes for swapped-out items are dropped instead of blocking Apply');
