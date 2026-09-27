import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ImportManifest} from '../core/dim-import/cache.mjs';
import {parseDimInput,DimShareClient} from '../core/dim-import/share.mjs';
import {collectDimHashes,resolveDimLoadout,dimWorkingBuild} from '../core/dim-import/resolve.mjs';
import {createDimActions} from '../core/dim-import/actions.mjs';
import {renderLoadoutDetailsContent} from '../shared/loadout-details.mjs';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
const read=name=>readFile(new URL(`./fixtures/dim-import/${name}.json`,import.meta.url),'utf8').then(JSON.parse);
const snapshot=await read('manifest'),ids=['fixturea','fixtureb','fixturec'];
let resolved=0,requested=0;const times=[];
const memory=new Map(),storage={get:async key=>memory.get(key),put:async(key,value)=>memory.set(key,value)};
let fetches=0;
const shares=new DimShareClient({storage,fetchImpl:async url=>{assert.equal(new URL(url).origin,'https://auth.astrixparadox.com');fetches++;return Response.json(await read(new URL(url,'https://astrixparadox.com').pathname.split('/').at(-1)));}});
for(const id of ids){
  const payload=await read(id);
  assert.deepEqual(Object.keys(payload),['loadout']);
  assert.deepEqual(Object.keys(payload.loadout).sort(),['classType','equipped','name','parameters','unequipped']);
  assert.equal(payload.loadout.name,`Offline ${id}`);
  for(const item of [...payload.loadout.equipped,...payload.loadout.unequipped])assert.ok(Object.keys(item).every(key=>['hash','socketOverrides'].includes(key)),'Public fixtures contain only item and socket hashes');
  assert.doesNotMatch(JSON.stringify(payload),/itemInstanceId|craftedDate|membershipId|csrfToken|cookie|access_token|refresh_token/);
  const [a,b]=await Promise.all([shares.load(id),shares.load(`https://dim.gg/${id}/name`)]);assert.equal(a,b);
  for(let i=0;i<10;i++){
    const start=performance.now(),model=resolveDimLoadout(await shares.load(id),{snapshot});
    const html=renderLoadoutDetailsContent(model,{presentation:'icons'});times.push(performance.now()-start);
    assert.equal(model.coverage.unresolved.length,0);assert.equal(model.coverage.rate,1);
    assert.ok(html.length>1000);assert.doesNotMatch(html,/Item unavailable|definition unavailable/);
    assert.equal(model.source.label,'Imported from DIM');
    if(i===0){resolved+=model.coverage.resolved;requested+=model.coverage.requested;}
  }
  const loadout=await shares.load(id),requests=collectDimHashes(loadout);
  const incomplete=structuredClone(snapshot),[type,hashes]=Object.entries(requests)[0];delete incomplete.tables[type][hashes[0]];
  assert.throws(()=>resolveDimLoadout(loadout,{snapshot:incomplete}),error=>error.unresolved.includes(`${type}:${hashes[0]}`));
}
assert.equal(requested,180,'Trimming must retain all 180 referenced definitions');
assert.equal(resolved,180);
assert.equal(fetches,3,'Concurrent and repeated imports fetch each public share once');
const restored=new DimShareClient({storage,fetchImpl:()=>{throw new Error('must use cache');}});await restored.load(ids[0]);
assert.deepEqual(parseDimInput('dim.gg/fixturea/name'),{shareId:'fixturea'});
const publicLoadout=await shares.load(ids[0]);
for(const url of [`https://app.destinyitemmanager.com/loadouts?loadout=${encodeURIComponent(JSON.stringify(publicLoadout))}`,`https://beta.destinyitemmanager.com/#/loadouts?loadout=${encodeURIComponent(JSON.stringify(publicLoadout))}`])assert.deepEqual(parseDimInput(url).loadout,publicLoadout);
for(const input of ['http://dim.gg/fixturea','https://evil.example/fixturea','https://dim.gg.evil.example/fixturea','https://user@dim.gg/fixturea'])assert.throws(()=>parseDimInput(input));
for(const status of [404,410,429,503]){let count=0;const client=new DimShareClient({storage:{get:async()=>null,put:async()=>{}},fetchImpl:async()=>{count++;return new Response(null,{status});}});for(let i=0;i<2;i++)await assert.rejects(client.load(ids[0]),status<420?/expired/:/unreachable/);assert.equal(count,status===404||status===410?1:2);}

// Synthetic account fixtures exercise matching and mutations, never production content.
function fixture(){
 const f=loadoutDetailsFixture();
 const tables={...f.manifest.tables,DestinyInventoryItemDefinition:f.definitions};
 const loadout={name:'Offline DIM fixture',classType:0,equipped:f.profile.characterEquipment.data['1'].items.map(item=>({id:'donor-not-owned',hash:item.itemHash,socketOverrides:Object.fromEntries(f.profile.itemComponents.sockets.data[item.itemInstanceId].sockets.map((plug,i)=>[i,plug.plugHash]))})),unequipped:[],parameters:{statConstraints:[{statHash:2996146975,minStat:100,maxStat:200}]}};
 const binding={membershipId:'123',membershipType:'3',characterId:'1'};
 return {f,tables,loadout,binding,resolve:()=>resolveDimLoadout(loadout,{snapshot:{version:f.manifestVersion,tables},profile:f.profile,binding})};
}
let h=fixture();let model=h.resolve();assert.equal(model.items.filter(row=>row.kind!=='parameters').length,9);assert.ok(model.items.every(row=>row.itemInstanceId!=='donor-not-owned'));assert.equal(dimWorkingBuild(model,h.f.profile).statConstraints[0].minStat,100);
h.loadout.parameters.statConstraints[0]={statHash:2996146975,minTier:10};model=h.resolve();assert.equal(model.statConstraints[0].legacy,true);assert.equal(dimWorkingBuild(model,h.f.profile).statConstraints.length,0);
h=fixture();h.f.profile.characterEquipment.data['1'].items.shift();model=h.resolve();assert.equal(model.items[0].notOwned,true);assert.match(renderLoadoutDetailsContent(model),/Not in your inventory/);assert.throws(()=>dimWorkingBuild(model,h.f.profile,{forApply:true}),/inventory/);
h=fixture();h.tables.DestinyInventoryItemDefinition[10000]={hash:10000,retired:true,displayProperties:{name:'Retired: Offline item'}};model=h.resolve();assert.match(renderLoadoutDetailsContent(model),/Retired: Offline item/);
h=fixture();const owned=h.f.profile.characterEquipment.data['1'].items[0];h.f.profile.profileInventory.data.items.push({...owned,itemInstanceId:'999999'});h.f.profile.itemComponents.sockets.data[owned.itemInstanceId].sockets[0].plugHash=102;h.f.profile.itemComponents.sockets.data['999999']={sockets:[{plugHash:101},{plugHash:102}]};assert.equal(h.resolve().items[0].itemInstanceId,'999999','Best shared roll wins');
h=fixture();const armour=h.f.profile.characterEquipment.data['1'].items[3];h.tables.DestinyInventoryItemDefinition[20000]={...h.tables.DestinyInventoryItemDefinition[armour.itemHash],hash:20000,equipableItemSetHash:600};h.tables.DestinyEquipableItemSetDefinition={600:{hash:600,displayProperties:{name:'Offline set'}}};h.f.profile.profileInventory.data.items.push({...armour,itemHash:20000,itemInstanceId:'999998'});h.loadout.parameters.setBonuses={600:1};assert.equal(h.resolve().items.find(row=>row.itemHash===armour.itemHash).match.itemHash,20000);

const actionFixture=fixture(),actionContext={session:actionFixture.f.session,profile:actionFixture.f.profile,characterId:'2'};
const actionEvents=[];
const controller=createDimActions(actionFixture.resolve(),{getContext:()=>actionContext,getSnapshot:()=>({version:actionFixture.f.manifestVersion,tables:actionFixture.tables}),save:value=>actionEvents.push(value),send:value=>actionEvents.push(value)});
await controller.save('Fixture');await controller.forge();assert.equal(actionEvents.length,2);assert.equal(actionEvents[0].build.characterId,'1');assert.equal(actionEvents[1].characterId,'1');assert.deepEqual(Object.keys(controller).sort(),['forge','save']);
const max=Math.max(...times);assert.ok(max<1000,`Warm resolve + HTML exceeded budget: ${max}ms`);
console.log(`DIM_IMPORT=PASS resolve=${resolved}/${requested} (100%) shares=${ids.length} warm_resolve_html_max_ms=${max.toFixed(2)} browser_paint=CLAUDE_QA`);

let retries=0;
const retryClient=new DimShareClient({storage:{get:async()=>null,put:async()=>{}},fetchImpl:async()=>++retries===1?new Response(null,{status:503}):Response.json({loadout:{name:'Recovered share',classType:1,equipped:[]}})});
await assert.rejects(retryClient.load('retryid'),/unreachable/);
assert.equal((await retryClient.load('retryid')).name,'Recovered share');assert.equal(retries,2);

// Browser fetch requires a Window/Worker global receiver. Arrow mocks hide this error.
const originalFetch=globalThis.fetch;let nativeCalls=0;
try{
  globalThis.fetch=async function(url){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    nativeCalls++;
    return Response.json(String(url).includes('/dim/share/')?{loadout:{name:'Native receiver share',classType:1,equipped:[]}}:{manifestVersion:'receiver-test'});
  };
  const uncached={get:async()=>null,put:async()=>true};
  assert.equal((await new DimShareClient({storage:uncached}).load('fixturea')).name,'Native receiver share');
  assert.equal((await new ImportManifest({storage:uncached}).json('status')).manifestVersion,'receiver-test');
  assert.equal(nativeCalls,2);
}finally{globalThis.fetch=originalFetch;}
console.log('DIM_BROWSER_FETCH_RECEIVER=PASS share and manifest');

// Refreshing the same Guardian must not permanently disable every popup action.
const {dimContextChanged}=await import('../core/dim-import/context.mjs');
h=fixture();model=h.resolve();
const liveContext={session:structuredClone(h.f.session),characterId:'1'};
assert.equal(dimContextChanged(model,liveContext),false);
for(let i=0;i<10;i++)assert.equal(dimContextChanged(model,{...liveContext,session:structuredClone(h.f.session)}),false);
assert.equal(dimContextChanged(model,{...liveContext,characterId:'2'}),true);
assert.equal(dimContextChanged(model,{...liveContext,session:{...h.f.session,authenticated:false}}),true);
assert.equal(dimContextChanged(model,{...liveContext,session:{...h.f.session,activeDestinyMembership:{membershipId:'456',membershipType:3}}}),true);

// Auxiliary equipment is retained through the same handoff and save operations
// used by the buttons, without becoming a weapon or a remotely applied socket.
model.items.push({kind:'item',equipped:true,itemHash:700001,bucketHash:4023194814,name:'Offline Ghost',icon:'',sockets:[],groups:[],notOwned:true});
const imported=dimWorkingBuild(model,h.f.profile);
const {createBuildState}=await import('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs');
const {createHandoffEnvelope}=await import('../pages/guardian-workspace-v2/paradox-build-binding.mjs');
const {createParadoxLoadoutRecord}=await import('../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs');
const envelope=createHandoffEnvelope(createBuildState(imported));
assert.match(JSON.stringify(envelope),/Offline Ghost/);
assert.equal(createParadoxLoadoutRecord({name:'Equipment test',build:imported}).build.equipment[0].itemHash,700001);
assert.equal(imported.weapons.filter(Boolean).length,3);
const iconHtml=renderLoadoutDetailsContent(model,{presentation:'icons'});
assert.ok(iconHtml.indexOf('aria-label="Super and abilities"')<iconHtml.indexOf('aria-label="Weapons"'));
assert.ok(iconHtml.indexOf('aria-label="Weapons"')<iconHtml.indexOf('aria-label="Armour"'));
assert.ok(iconHtml.indexOf('aria-label="Armour"')<iconHtml.indexOf('aria-label="Equipment"'));
assert.match(iconHtml,/aria-label="Offline Ghost"/);
assert.doesNotMatch(iconHtml,/<h3>Offline Ghost|No saved socket data/);
console.log('DIM_ACTION_REFRESH_AND_EQUIPMENT=PASS');
const {watchDimContext}=await import('../core/dim-import/context.mjs');
const docEvents=new EventTarget(),windowEvents=new EventTarget();let invalidations=0,selected='1';
const disposeContext=watchDimContext({document:docEvents,window:windowEvents,getModel:()=>model,getContext:()=>({...liveContext,characterId:selected}),onCharacter:id=>{selected=id;},invalidate:()=>{invalidations++;}});
for(let i=0;i<10;i++){docEvents.dispatchEvent(new CustomEvent('forge:guardian-loadout-context',{detail:{characterId:'1'}}));windowEvents.dispatchEvent(new Event('forge:bungie-session'));}
assert.equal(invalidations,0);
docEvents.dispatchEvent(new CustomEvent('forge:character-selected',{detail:{characterId:'2'}}));assert.equal(invalidations,1);
disposeContext();windowEvents.dispatchEvent(new Event('forge:bungie-session'));assert.equal(invalidations,1);
console.log('DIM_CONTEXT_EVENT_REGRESSION=PASS');
