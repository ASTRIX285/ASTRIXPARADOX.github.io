import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normaliseWeaponSemantics} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {weaponPerkMatrixMarkup} from '../pages/guardian-workspace-v2/guardian-weapon-presentation.mjs';
import {bindWeaponSelection,weaponPerkAvailability} from '../pages/guardian-workspace-v2/guardian-weapon-selection.mjs';
import {startForgeBackgroundRefresh,mergeExoticCheckCatalogue,bindExoticCheckControl,FORGE_REFRESH_MS} from '../pages/forge-loader/forge-loader-refresh.mjs';

const capture=JSON.parse(await readFile(new URL('fixtures/unsworn-perk-permissions.json',import.meta.url),'utf8'));
const identity=hash=>({hash,definition:capture.definitions[hash],...capture.definitions[hash]?.displayProperties});
const alternatives=Object.fromEntries(Object.entries(capture.reusablePlugs).map(([index,rows])=>[index,rows.map(row=>({...identity(row.plugItemHash),socketIndex:Number(index),canInsert:row.canInsert===true,isEnabled:row.enabled}))]));
const semantics=normaliseWeaponSemantics({item:{itemHash:capture.itemHash},itemDefinition:capture.definitions[capture.itemHash],instance:{gearTier:capture.gearTier},plugs:capture.sockets.filter(socket=>capture.definitions[socket.plugHash]).map(socket=>({...identity(socket.plugHash),...socket})),alternativeColumns:alternatives});
const column=semantics.perkModel.columns.find(column=>column.socketIndex===1);
const option=column.options.find(option=>option.hash!==column.selectedPlugHash&&option.canInsert);
assert.ok(option,'Captured Unsworn exposes a real alternative barrel');
assert.equal(option.isEnabled,true);
// Both shapes are supported by the production renderer. The compact shape is
// a compatibility projection of real captured options, not made-up permissions.
const compact={itemInstanceId:'1',itemHash:capture.itemHash,weaponPerkModel:semantics.perkModel,definition:{}};
assert.match(weaponPerkMatrixMarkup(compact),new RegExp(`data-bungie-hash="${option.hash}"`));
const raw={profile:{itemComponents:{reusablePlugs:{data:{1:{plugs:capture.reusablePlugs}}}}}};
assert.equal(weaponPerkAvailability(compact,1,{hash:option.hash},raw),'allowed','Exact raw permission survives a compact identity without flags');
assert.equal(weaponPerkAvailability(compact,1,{hash:option.hash},{}),'unknown');
assert.equal(weaponPerkAvailability(compact,1,{hash:option.hash},{profile:{itemComponents:{reusablePlugs:{data:{1:{plugs:{1:[{plugItemHash:option.hash,canInsert:false,enabled:true}]}}}}}}}),'blocked');

const makeCell=hash=>({dataset:{socketIndex:'1',bungieHash:String(hash)},classes:new Set(),attributes:{},setAttribute(key,value){this.attributes[key]=value;},closest(){return this;},classList:{toggle(name,on){if(on)this.owner.classes.add(name);else this.owner.classes.delete(name);}}});
const cells=[makeCell(column.selectedPlugHash),makeCell(option.hash)];cells.forEach(cell=>{cell.classList.owner=cell;});
const handlers=new Map();let footer;
globalThis.document={createElement(){const button={addEventListener(){}},status={};footer={querySelector:name=>name==='button'?button:status,remove(){}};return footer;}};
const root={append(){},querySelector(){return null;},querySelectorAll(){return cells;},addEventListener(name,callback){handlers.set(name,callback);},removeEventListener(name){handlers.delete(name);}};
globalThis.FORGE_PAGE_PAYLOAD=raw;
bindWeaponSelection(root,compact);
assert.equal(footer.hidden,true);
await handlers.get('forge:perk-activate')({target:cells[1]});
assert.equal(footer.hidden,false,'Real alternate barrel on the rendered top-level model must stage APPLY');
assert.ok(cells[1].classes.has('is-pending'));
await handlers.get('forge:perk-activate')({target:cells[0]});assert.equal(footer.hidden,true);
const projected=structuredClone(compact);
for(const col of projected.weaponPerkModel.columns)for(const row of col.options){delete row.canInsert;delete row.isEnabled;}
bindWeaponSelection(root,projected);
await handlers.get('forge:perk-activate')({target:cells[1]});assert.equal(footer.hidden,false,'Compact options use captured exact-instance permissions');
delete globalThis.FORGE_PAGE_PAYLOAD;
const originalFetch=globalThis.fetch;let permissionReads=0;
globalThis.fetch=async(url,options)=>{
  assert.equal(new URL(url).pathname,'/bungie/profile');assert.notEqual(options.method,'POST');permissionReads++;
  return Response.json({profile:{...raw.profile,characterEquipment:{data:{2:{items:[{itemInstanceId:'1',itemHash:capture.itemHash,bucketHash:1498876634}]}}}}});
};
bindWeaponSelection(root,projected);assert.equal(footer.hidden,true);
await handlers.get('forge:perk-activate')({target:cells[1]});
assert.equal(permissionReads,1);assert.equal(footer.hidden,false,'Missing offline permissions are verified with the existing profile route before staging');
globalThis.fetch=originalFetch;
delete globalThis.document;delete globalThis.FORGE_PAGE_PAYLOAD;

let now=1_000_000,calls=0,fail=false;const timers=new Map(),stored=new Map();let timerId=0;
const events=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';
const controller=startForgeBackgroundRefresh({session:{authenticated:true,activeDestinyMembership:{membershipId:'test',membershipType:1}},eventTarget:events,documentTarget:doc,
  storage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},now:()=>now,
  setTimer:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimer:id=>timers.delete(id),
  refresh:async({reason})=>{assert.equal(reason,'poll');calls++;if(fail)throw Error('offline');return {profile:{}};}
});
const tick=async()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);now+=timer.delay;timer.fn();await new Promise(resolve=>setImmediate(resolve));};
assert.equal([...timers.values()][0].delay,0,'Background polling starts without pressing the button');
await tick();assert.equal(calls,1);assert.equal([...timers.values()][0].delay,FORGE_REFRESH_MS);
fail=true;await tick();assert.equal([...timers.values()][0].delay,15000,'Initial or subsequent failure retries automatically');
fail=false;await tick();assert.equal(calls,3);
events.dispatchEvent(new Event('pagehide'));assert.equal(timers.size,0);
now+=FORGE_REFRESH_MS;events.dispatchEvent(new Event('pageshow'));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,4,'Mobile resume checks stale data automatically');
controller.stop();
const old={armour:[{id:'normal',isExotic:false},{id:'old-exotic',isExotic:true}],other:'preserved'};
const fresh={armour:[{id:'new-normal',isExotic:false},{id:'new-exotic',isExotic:true}]};
assert.deepEqual(mergeExoticCheckCatalogue(old,fresh),{armour:[old.armour[0],fresh.armour[1]],other:'preserved'});
class Button extends EventTarget{setAttribute(){} }
const button=new Button();let exoticChecks=0;
bindExoticCheckControl(button,async()=>{exoticChecks++;});button.dispatchEvent(new Event('click'));await new Promise(resolve=>setImmediate(resolve));
assert.equal(exoticChecks,1);assert.equal(button.textContent,'Check for new Exotic');assert.equal(calls,4,'Manual Exotic check is independent of general polling');
const source=await readFile(new URL('../pages/forge-loader/forge-loader.mjs',import.meta.url),'utf8');
const init=source.slice(source.indexOf('async function init()'));
assert.ok(init.indexOf('startForgeRefresh();')<init.indexOf('await loadVerifiedPayload()'),'Start retries before the initial load can fail');
console.log('APPLY_REFRESH_REGRESSIONS=PASS real perk permissions, compact model, automatic polling, recovery, mobile resume and Exotic-only manual check');
