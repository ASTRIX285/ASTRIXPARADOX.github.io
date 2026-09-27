import assert from 'node:assert/strict';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
import {adaptDimLoadout,createDimForgeState} from '../core/dim-import/adapt.mjs';
import {matchDimGuardian} from '../core/dim-import/guardian.mjs';
import {createDimActions} from '../core/dim-import/actions.mjs';
import {sendDimToForge} from '../core/dim-import/handoff.mjs';
import {dimContextChanged} from '../core/dim-import/context.mjs';
import {validateHandoffEnvelope,shouldReplaceBuildState} from '../pages/guardian-workspace-v2/paradox-build-binding.mjs';
import {createBuildPersistenceSnapshot,restoreBuildPersistenceSnapshot} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {createParadoxLoadoutRecord,validateParadoxLoadoutRecord,saveParadoxLoadout,getParadoxLoadout} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs';
import {renderLoadoutIconLayout} from '../shared/loadout-icon-layout.mjs';
function fixture(){
 const f=loadoutDetailsFixture(),snapshot={version:f.manifestVersion,tables:{...f.manifest.tables,DestinyInventoryItemDefinition:f.definitions}};
 f.profile.characters.data['2']={classType:2};
 const loadout={name:'Shared target',classType:0,equipped:f.profile.characterEquipment.data['1'].items.map(item=>({hash:item.itemHash,id:'foreign-instance',socketOverrides:Object.fromEntries(f.profile.itemComponents.sockets.data[item.itemInstanceId].sockets.map((p,i)=>[i,p.plugHash]))})),unequipped:[],parameters:{}};
 const binding={membershipId:'123',membershipType:'3'};
 return {f,snapshot,loadout,binding,adapt:()=>adaptDimLoadout(loadout,{snapshot,profile:f.profile,binding,preferredCharacterId:'2'})};
}
let h=fixture(),result=h.adapt();
assert.equal(result.build.characterId,'1');assert.equal(result.model.autoMatchedGuardian,true);
assert.equal(result.report.comparisons.filter(row=>row.status==='matched').length,9);
assert.equal(result.target.weapons[0].itemHash,result.build.weapons[0].itemHash);
assert.equal(result.target.weapons[0].itemInstanceId,'');
assert.doesNotMatch(JSON.stringify(result.build),/foreign-instance/);
assert.equal(dimContextChanged(result.model,{session:h.f.session,characterId:'2'}),false);
assert.equal(dimContextChanged(result.model,{session:{...h.f.session,authenticated:false},characterId:'2'}),true);
assert.throws(()=>matchDimGuardian({...h.loadout,classType:1},h.snapshot,h.f.profile),/disagree/);
assert.throws(()=>matchDimGuardian(h.loadout,h.snapshot,{characters:{data:{'2':{classType:2}}}}),/No Titan/);
assert.equal(matchDimGuardian({...h.loadout,classType:3},h.snapshot,h.f.profile).classType,0);
// Missing weapon: prefer its requested perks to a different element/type roll.
h=fixture();const original=h.f.profile.characterEquipment.data['1'].items.shift();
for(const [hash,id,plugs] of [[22001,'9001',[999,998]],[22002,'9002',[101,102]]]){
 h.f.definitions[hash]={...h.f.definitions[original.itemHash],hash,itemSubType:6,defaultDamageTypeHash:10,displayProperties:{name:`Replacement ${hash}`}};
 h.f.profile.profileInventory.data.items.push({...original,itemHash:hash,itemInstanceId:id});
 h.f.profile.itemComponents.sockets.data[id]={sockets:plugs.map(plugHash=>({plugHash}))};
}
result=h.adapt();assert.equal(result.target.weapons[0].itemHash,original.itemHash);assert.equal(result.build.weapons[0].itemHash,22002);assert.equal(result.report.comparisons.find(row=>row.target.itemHash===original.itemHash).status,'substituted');
assert.ok(result.report.comparisons.find(row=>row.target.itemHash===original.itemHash).reasons.some(reason=>reason.includes('2/2')));
// Missing Exotic cannot be disguised as an equivalent legendary item.
h.f.definitions[original.itemHash].inventory={...h.f.definitions[original.itemHash].inventory,tierType:6};result=h.adapt();assert.equal(result.build.weapons[0],null);assert.match(result.report.blockers.join(' '),/Exotic is missing/);
// Never copy a desired perk into a replacement that cannot have it.
h=fixture();h.f.profile.itemComponents.sockets.data['100000'].sockets=[{plugHash:999}];result=h.adapt();assert.equal(result.build.weapons[0].sockets.length,0);assert.equal(result.report.comparisons[0].missingSockets.length,2);
h.f.profile.itemComponents.reusablePlugs.data['100000']={plugs:{4:[{plugItemHash:101,canInsert:true,enabled:true}]}};result=h.adapt();assert.equal(result.build.weapons[0].sockets[0].socketIndex,4);
// Durable baseline and working build survive hydration and persistence independently.
const state=createDimForgeState(result.build);assert.ok(Object.isFrozen(state.originalBuild));
assert.equal(shouldReplaceBuildState(state,{source:'bungie-live',loadoutSource:'currently-equipped',characterId:'1'}),false);
const restored=restoreBuildPersistenceSnapshot(JSON.parse(JSON.stringify(createBuildPersistenceSnapshot(state))));
assert.equal(restored.originalBuild.weapons[0].sockets.length,2);assert.equal(restored.workingBuild.weapons[0].sockets.length,1);
const record=validateParadoxLoadoutRecord(createParadoxLoadoutRecord({name:'Adapted',build:result.build}));assert.equal(record.binding.characterId,'1');assert.equal(record.build.dimTarget.weapons[0].sockets.length,2);
// Actual handoff writer, route and actual local save/read, while Warlock is selected.
const memory=new Map(),storage={setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.get(k)||null,removeItem:k=>memory.delete(k)};
const previousLocal=globalThis.localStorage,previousFetch=globalThis.fetch;let network=0,route='';
globalThis.localStorage=storage;globalThis.fetch=async()=>{network++;throw new Error('Offline account sync');};
try{
 const context={session:h.f.session,profile:h.f.profile,characterId:'2'};
 const actions=createDimActions(result.model,{getContext:()=>context,getSnapshot:()=>h.snapshot,save:saveParadoxLoadout,send:build=>sendDimToForge(build,{storage,location:{assign:url=>{route=url;}}})});
 const saved=await actions.save('Shared target adapted');const loaded=await getParadoxLoadout(saved.id);
 assert.equal(loaded.binding.characterId,'1');assert.ok(loaded.build.dimTarget);assert.ok(loaded.build.dimAdaptation);
 await actions.forge();assert.equal(new URL(route).searchParams.get('characterId'),'1');assert.ok(new URL(route).pathname.endsWith('/paradox-build-space/'));
 const envelope=JSON.parse(storage.getItem('astrix:paradox-build-space:v1'));const handed=validateHandoffEnvelope(envelope,{expectedCharacterId:'1',expectedMembershipId:'123',expectedMembershipType:'3'});assert.ok(handed);assert.equal(handed.originalBuild.weapons[0].sockets.length,2);assert.equal(handed.workingBuild.weapons[0].sockets.length,1);
 assert.throws(()=>sendDimToForge(result.build,{storage:{setItem(){throw new Error('Quota');}},location:{assign(){throw new Error('must not navigate');}}}),/storage/);
 context.session={...context.session,activeDestinyMembership:{membershipId:'456',membershipType:3}};await assert.rejects(actions.forge(),/account changed/);
 assert.equal(network,0,'Send and local save need no Bungie equipment request');
}finally{globalThis.localStorage=previousLocal;globalThis.fetch=previousFetch;}
const html=renderLoadoutIconLayout(result.model);assert.doesNotMatch(html,/<h[234]|Outlined items|No saved socket data|data-icon-detail=/);assert.match(html,/apx-icon-divider/);
// Large inventory repeated: stable target and bounded serialization, warm budget.
h=fixture();for(let i=0;i<600;i++){const source=h.f.profile.characterEquipment.data['1'].items[3+i%5],id=String(900000+i);h.f.profile.profileInventory.data.items.push({...source,itemInstanceId:id});h.f.profile.itemComponents.sockets.data[id]=h.f.profile.itemComponents.sockets.data[source.itemInstanceId];}
let size=null,max=0;for(let i=0;i<10;i++){const start=performance.now(),value=h.adapt();max=Math.max(max,performance.now()-start);const n=JSON.stringify(createDimForgeState(value.build)).length;if(size===null)size=n;assert.equal(n,size);}
assert.ok(max<1000,`Adaptation exceeded 1 second: ${max}`);
console.log(`DIM_ADAPTATION=PASS class routing, actual save/read, handoff, immutable target, replacements, missing Exotic, sockets, 10 flat payloads; bytes=${size} max_ms=${max.toFixed(2)}`);
// Whole-set selection uses requested set bonuses and current stat targets.
h=fixture();h.snapshot.tables.DestinyEquipableItemSetDefinition={600:{hash:600,displayProperties:{name:'Offline set'}}};
h.loadout.parameters={setBonuses:{600:2},statConstraints:[{statHash:2996146975,minStat:100,maxStat:200}]};
h.f.profile.itemComponents.stats={data:{}};
for(let i=3;i<8;i++){
 const original=h.f.profile.characterEquipment.data['1'].items[i];
 h.f.profile.itemComponents.stats.data[original.itemInstanceId]={stats:{2996146975:{value:1}}};
 const itemHash=30000+i,id=String(80000+i);
 h.f.definitions[itemHash]={...h.f.definitions[original.itemHash],hash:itemHash,equipableItemSetHash:600};
 h.f.profile.profileInventory.data.items.push({...original,itemHash,itemInstanceId:id});
 h.f.profile.itemComponents.sockets.data[id]=h.f.profile.itemComponents.sockets.data[original.itemInstanceId];
 h.f.profile.itemComponents.stats.data[id]={stats:{2996146975:{value:30}}};
}
result=h.adapt();assert.ok(result.report.setTargets[0].current>=2);assert.ok(result.report.statTargets[0].current>=100);
// A removed item after import is re-evaluated when the action runs.
const staleModel=result.model;h.f.profile.profileInventory.data.items=[];const deliveries=[];
await createDimActions(staleModel,{getContext:()=>({session:h.f.session,profile:h.f.profile,characterId:'2'}),getSnapshot:()=>h.snapshot,send:value=>deliveries.push(value),save:()=>{}}).forge();
assert.ok(deliveries[0].armour.every(item=>item.itemHash<30000));
console.log('DIM_SET_STAT_AND_INVENTORY_REFRESH=PASS');
// Two requested perks must occupy distinct compatible sockets. Reassign a
// flexible perk so a second perk with only one legal socket can still fit.
h=fixture();h.f.profile.itemComponents.sockets.data['100000'].sockets=[];
h.f.profile.itemComponents.reusablePlugs.data['100000']={plugs:{0:[{plugItemHash:101,canInsert:true},{plugItemHash:102,canInsert:true}],1:[{plugItemHash:101,canInsert:true}]}};
result=h.adapt();assert.equal(result.build.weapons[0].sockets.find(p=>p.hash===102).socketIndex,0);assert.equal(result.build.weapons[0].sockets.find(p=>p.hash===101).socketIndex,1);assert.equal(result.report.comparisons[0].missingSockets.length,0);
assert.equal(dimContextChanged(result.model,{session:{},characterId:'2'}),false,'An unresolved session refresh is not sign-out');
const {renderDimComparison}=await import('../core/dim-import/review.mjs');
assert.match(renderDimComparison(result.build),/SHARED BUILD FIT|Same item/);
console.log('DIM_DISTINCT_SOCKET_MATCHING=PASS');
