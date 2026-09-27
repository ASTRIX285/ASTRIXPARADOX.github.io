import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
    const html=renderLoadoutDetailsContent(model);times.push(performance.now()-start);
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
for(const status of [404,410,429,503]){let count=0;const client=new DimShareClient({storage:{get:async()=>null,put:async()=>{}},fetchImpl:async()=>{count++;return new Response(null,{status});}});for(let i=0;i<2;i++)await assert.rejects(client.load(ids[0]),status<420?/expired/:/unreachable/);assert.equal(count,1);}

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

function actions(){
 const h=fixture(),model=h.resolve(),context={session:h.f.session,profile:h.f.profile,characterId:'1',manifestVersion:h.f.manifestVersion},calls=[],events=[];
 const controller=createDimActions(model,{getContext:()=>context,save:value=>events.push(['save',value]),send:value=>events.push(['forge',value]),fetchImpl:async(url,options={})=>{
  const path=new URL(url).pathname;calls.push({path,method:options.method||'GET'});
  if(options.method!=='POST')return Response.json({profile:h.f.profile});
  const body=JSON.parse(options.body);assert.equal(options.headers['X-CSRF-Token'],context.session.csrfToken);
  if(path.endsWith('/equip-items'))return Response.json({ErrorCode:1,Response:{equipResults:body.itemIds.map(itemId=>({itemInstanceId:itemId,equipStatus:1}))}});
  return Response.json({ErrorCode:1,Response:0});
 }});return {controller,context,calls,events};
}
let a=actions();await a.controller.save('Fixture');await a.controller.forge();assert.equal(a.calls.length,0);assert.equal(a.events.length,2);await assert.rejects(a.controller.apply({ready:true}),/Prepare/);
let plan=await a.controller.equip();assert.equal(plan.ready,true);assert.ok(a.calls.every(row=>row.method==='GET'));await assert.rejects(a.controller.apply(structuredClone(plan)),/Prepare/);await a.controller.apply(plan);assert.ok(a.calls.some(row=>row.path.endsWith('/equip-items')));assert.ok(a.calls.every(row=>!row.path.endsWith('/loadout/equip')));await assert.rejects(a.controller.apply(plan),/Prepare/);
a=actions();plan=await a.controller.equip();a.context.characterId='2';await assert.rejects(a.controller.apply(plan),/Guardian changed/);assert.ok(a.calls.every(row=>row.method==='GET'));
a=actions();const pending=a.controller.equip();await assert.rejects(a.controller.equip(),/already running/);await pending;
const max=Math.max(...times);assert.ok(max<1000,`Warm resolve + HTML exceeded budget: ${max}ms`);
console.log(`DIM_IMPORT=PASS resolve=${resolved}/${requested} (100%) shares=${ids.length} warm_resolve_html_max_ms=${max.toFixed(2)} browser_paint=CLAUDE_QA`);
