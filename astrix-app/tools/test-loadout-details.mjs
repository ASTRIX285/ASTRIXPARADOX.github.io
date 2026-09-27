import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadoutDetailsFixture} from './fixtures/loadout-details-fixture.mjs';
import {resolveInGameLoadout,loadoutWorkingBuild,loadoutShareDocument,bungieArtwork} from '../shared/loadout-details-model.mjs';
import {createLoadoutDetailsActions} from '../shared/loadout-details-actions.mjs';
import {renderLoadoutDetailsContent} from '../shared/loadout-details.mjs';

const original=loadoutDetailsFixture(),snapshot=structuredClone(original),model=resolveInGameLoadout(original);
assert.equal(model.items.length,9);assert.equal(model.slotNumber,1);assert.equal(model.source.label,'In-game loadout');
assert.equal(model.items[0].kind,'subclass');assert.equal(model.items.filter(row=>row.kind==='weapon').length,3);assert.equal(model.items.filter(row=>row.kind==='armour').length,5);
assert.deepEqual(model.items[0].groups.map(group=>group.label),['Super','Abilities','Aspects','Fragments']);
assert.deepEqual(model.items.find(row=>row.kind==='armour').groups.map(group=>group.label),['Mods','Cosmetics','Stat focus']);
assert.equal(model.items.find(row=>row.kind==='armour').sockets[0].statFocus[0].name,'Weapons');
assert.deepEqual(original,snapshot,'Resolving must never modify the account snapshot');
let fixture=loadoutDetailsFixture();
fixture.profile.itemComponents.sockets.data['100000'].sockets[0].plugHash=201;
assert.equal(resolveInGameLoadout(fixture).items.find(row=>row.itemInstanceId==='100000').sockets[0].hash,101,'Selected saved socket, not current gear socket');
fixture.profile.characterLoadouts.data['1'].loadouts[0].items[3].plugItemHashes=[201,201,0,999];
let resolved=resolveInGameLoadout(fixture),armour=resolved.items.find(row=>row.itemInstanceId==='100003');
assert.deepEqual(armour.sockets.map(row=>row.hash),[201,201,null,999]);assert.equal(armour.sockets[2].empty,true);assert.equal(armour.sockets[3].unresolved,true);
assert.equal(armour.groups[0].plugs.length,2,'Stacked duplicate mods retain distinct socket indexes');
fixture.profile.characterEquipment.data['1'].items.shift();assert.equal(resolveInGameLoadout(fixture).items.at(-1).unresolved,true);
fixture=loadoutDetailsFixture();fixture.manifest.manifestVersion='wrong';assert.equal(resolveInGameLoadout(fixture).identifierChoices.names.length,0);
for(const icon of ['//evil.example/x','https://evil.example/a.png','javascript:alert(1)','https://user@www.bungie.net/common/icon.png','/not-bungie.png'])assert.equal(bungieArtwork(icon),'');
assert.ok(bungieArtwork('/common/destiny2_content/icons/fixture.png').startsWith('https://www.bungie.net/'));
const build=loadoutWorkingBuild(model,original.profile);assert.equal(build.weapons.length,3);assert.equal(build.armour.length,5);assert.equal(build.subclassBuild.super.hash,301);assert.equal(build.manualSocketChanges.length,28);
const shared=JSON.stringify(loadoutShareDocument(model));assert.doesNotMatch(shared,/csrf|membership|itemInstanceId|fixture-only/);
const hostile=structuredClone(model);hostile.items[0].name='<img src=x onerror=alert(1)>';assert.ok(renderLoadoutDetailsContent(hostile).includes('&lt;img'));assert.doesNotMatch(renderLoadoutDetailsContent(hostile),/<img src=x/);
// Renderer accepts another source without importing or interpreting an in-game payload.
assert.equal(renderLoadoutDetailsContent({...model,source:{kind:'dim',label:'DIM import'}}),renderLoadoutDetailsContent(model));

function harness(){
  const fixture=loadoutDetailsFixture(),context={...fixture},backend=structuredClone(fixture.profile),calls=[],events=[];
  const resolve=profile=>resolveInGameLoadout({...fixture,profile});
  const controller=createLoadoutDetailsActions(resolve(context.profile),{getContext:()=>context,resolve,
    fetchImpl:async(url,options={})=>{
      const path=new URL(url).pathname;calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
      if(options.method!=='POST')return Response.json({profile:backend});
      const body=JSON.parse(options.body);
      assert.equal(options.headers['X-CSRF-Token'],fixture.session.csrfToken);
      if(path.endsWith('/loadout/identifiers'))Object.assign(backend.characterLoadouts.data['1'].loadouts[0],{nameHash:body.nameHash,iconHash:body.iconHash,colorHash:body.colorHash});
      if(path.endsWith('/loadout/clear'))backend.characterLoadouts.data['1'].loadouts[0]={items:[]};
      if(path.endsWith('/socket-plug-free'))backend.itemComponents.sockets.data[body.itemId].sockets[body.plug.socketIndex].plugHash=body.plug.plugItemHash;
      if(path.endsWith('/equip-items'))return Response.json({ErrorCode:1,Response:{equipResults:body.itemIds.map(itemId=>({itemInstanceId:itemId,equipStatus:1}))}});
      return Response.json({ErrorCode:1,Response:0});
    },save:input=>events.push(['save',input]),share:input=>events.push(['share',input]),refresh:input=>events.push(['refresh',input]),waitImpl:async()=>{}});
  return {fixture,context,backend,controller,calls,events};
}
let h=harness();await assert.rejects(h.controller.apply({ready:true}),/Prepare/);assert.equal(h.calls.length,0);
let plan=await h.controller.prepare();assert.equal(plan.ready,true);assert.ok(h.calls.every(row=>row.method==='GET'),'Prepare cannot mutate');
await assert.rejects(h.controller.apply(structuredClone(plan)),/Prepare/);
const applied=await h.controller.apply(plan);assert.equal(applied.result.status,'applied');assert.ok(h.calls.some(row=>row.path==='/bungie/actions/equip-items'));
assert.ok(h.calls.every(row=>row.path!=='/bungie/actions/loadout/equip'),'Popup equip uses Apply, not direct equipLoadout');
await assert.rejects(h.controller.apply(plan),/Prepare/,'A plan is single use');
h=harness();h.backend.characterActivities.data['1'].currentActivityHash=12345;plan=await h.controller.prepare();assert.equal(plan.ready,false);assert.ok(h.calls.every(row=>row.method==='GET'));
h=harness();plan=await h.controller.prepare();h.context.characterId='2';await assert.rejects(h.controller.apply(plan),/Guardian changed/);assert.ok(h.calls.every(row=>row.method==='GET'));
h=harness();h.context.session={...h.context.session,activeDestinyMembership:{membershipId:'456',membershipType:3}};await assert.rejects(h.controller.prepare(),/account/);assert.equal(h.calls.length,0);
h=harness();h.backend.characterLoadouts.data['1'].loadouts[0].nameHash=999;await assert.rejects(h.controller.clear(),/saved slot changed/);assert.ok(h.calls.every(row=>row.method==='GET'));
h=harness();const identifiers=Object.fromEntries([['names','nameHash'],['icons','iconHash'],['colors','colorHash']].map(([list,key])=>[key,resolveInGameLoadout(h.fixture).identifierChoices[list][1].hash]));
const updated=await h.controller.identifiers(identifiers);assert.deepEqual(updated.identifiers,identifiers);assert.ok(h.calls.some(row=>row.path==='/bungie/actions/loadout/identifiers'));
h.context.profile=structuredClone(h.backend);await h.controller.clear();assert.ok(h.calls.some(row=>row.path==='/bungie/actions/loadout/clear'));
h=harness();await assert.rejects(h.controller.identifiers({nameHash:1,iconHash:2,colorHash:3}),/current Bungie manifest/);assert.equal(h.calls.length,0);
await h.controller.save('A saved fixture');await h.controller.share();assert.equal(h.calls.length,0);assert.equal(h.events[0][1].build.subclassBuild.super.hash,301);assert.doesNotMatch(JSON.stringify(h.events[1]),/itemInstanceId|membership/);
// Delayed reads coalesce by refusing simultaneous actions, never starting another mutation.
h=harness();const pending=h.controller.prepare();await assert.rejects(h.controller.prepare(),/already running/);await pending;
const source=await readFile(new URL('../pages/guardian-workspace-v2/guardian-loadouts.mjs',import.meta.url),'utf8');assert.match(source,/if\(value==='view'\)\{void viewLoadoutDetails\(index\);return;\}/);
console.log('LOADOUT_DETAILS=PASS saved sockets, all rows, duplicate mods, empty sockets, reusable render, escaping, Apply confirmation, no-overlap, bindings, identifiers/readback, save and share');
