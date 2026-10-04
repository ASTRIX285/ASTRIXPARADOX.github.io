// Neutral build format, share strings and the manual and json Division adapters.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILD_KEYS, SLOT_KEYS, SHARE_MAX_LENGTH, createBuild, decodeBuild, encodeBuild, normaliseBuild, validateBuild} from '../core/build-format/build.mjs';
import {validateBuildAdapter} from '../platform/contracts/build-adapter.mjs';
import {DIVISION_ADAPTERS, createJsonAdapter, createManualAdapter, readShareParam, shareUrl} from '../platform/adapters/division/index.mjs';
import {createDivisionModule} from '../games/division/index.mjs';

// The JSON Schema and the code agree on the fields.
const schema=JSON.parse(readFileSync(new URL('../core/build-format/build.schema.json',import.meta.url),'utf8'));
assert.deepEqual([...schema.required].sort(),[...BUILD_KEYS].sort(),'build.schema.json required fields match BUILD_KEYS');
assert.deepEqual(Object.keys(schema.properties.slots.additionalProperties.properties).sort(),[...SLOT_KEYS].sort(),'build.schema.json slot fields match SLOT_KEYS');
assert.ok(!JSON.stringify(schema).includes('gameVersion'),'The build records catalogueVersion, never gameVersion');

const empty=createBuild({game:'division',title:'td2'});
assert.deepEqual(validateBuild(empty),[],'A new build is valid');
assert.equal(empty.catalogueVersion,null,'A new build has no catalogue version until one is loaded');
const full=normaliseBuild({
  ...empty,
  catalogueVersion:'td2-2026-10-04',
  name:'Striker DPS · Agent Ünïcode 🎯',
  objective:'dps',
  slots:{
    mask:{itemId:'brand-a-mask',attributes:{'weapon-damage':15,'crit-hit-chance':6}},
    chest:{itemId:'gear-set-chest',talentId:'chest-talent',modIds:['mod-a','mod-b']},
    primary:{itemId:'assault-rifle-a'}
  },
  abilities:['turret-assault','hive-reviver'],
  selections:{specialization:'sharpshooter'}
});

// Round trip: build to share string and back comes out identical.
for(const build of [empty,full]){
  const text=encodeBuild(build);
  assert.match(text,/^[A-Za-z0-9._-]+$/,'Share string is URL-safe');
  assert.deepEqual(decodeBuild(text),build,'build to share string to build is identical');
  assert.equal(encodeBuild(decodeBuild(text)),text,'share string to build to share string is identical');
}
const shuffled={...full,slots:Object.fromEntries(Object.entries(full.slots).reverse()),selections:{...full.selections}};
assert.equal(encodeBuild(shuffled),encodeBuild(full),'Slot order does not change the share string');
assert.deepEqual(full.abilities,['turret-assault','hive-reviver'],'Ability order is kept');

// Broken or hostile share strings are refused with a plain reason.
const refuse=(text,reason)=>assert.throws(()=>decodeBuild(text),TypeError,reason);
refuse('','empty string');
refuse('2.abc','unknown version');
refuse('1.***','not URL-safe');
refuse('1.'+'A'.repeat(SHARE_MAX_LENGTH),'too long');
refuse('1.'+Buffer.from('{"format":"astrix-build"}').toString('base64url'),'incomplete build');
refuse('1.'+Buffer.from(JSON.stringify({...full,gameVersion:'TU1'})).toString('base64url'),'unknown field');
refuse('1.'+Buffer.from('not json').toString('base64url'),'not JSON');

// Validation catches bad shapes.
const invalid=(build,name)=>assert.ok(validateBuild(build).length>0,`${name} must be invalid`);
invalid({...empty,name:'x'.repeat(81)},'a long name');
invalid({...empty,game:'Division 2'},'a bad game id');
invalid({...empty,slots:{mask:{itemId:'Bad Id'}}},'a bad item id');
invalid({...empty,slots:{mask:{itemId:'a',attributes:{'weapon-damage':'high'}}}},'a non-numeric attribute');
invalid({...empty,slots:{mask:{itemId:'a',extra:1}}},'an unknown slot field');
invalid({...empty,abilities:'turret'},'abilities not a list');

// Share links.
const url=shareUrl(full);
assert.match(url,/^\/hub\/workbench\/td2\/\?b=1\.[A-Za-z0-9_-]+$/,'Share link uses the WorkBench route');
assert.deepEqual(readShareParam(url.slice(url.indexOf('?'))),full,'A share link reads back to the same build');
assert.equal(readShareParam('?x=1'),null,'No b parameter means no shared build');
assert.throws(()=>readShareParam('?b='+encodeBuild({...full,game:'wow-forever',title:null})),/another game/,'A link for another game is refused');

// Every adapter is on the one interface.
assert.deepEqual(DIVISION_ADAPTERS.map(adapter=>validateBuildAdapter(adapter).id),['manual','json','ubisoft']);

// JSON adapter: export then import is identical; bad files are refused.
const json=createJsonAdapter();
assert.deepEqual(await json.load(json.export(full)),{ok:true,build:full},'Export then import is identical');
assert.equal(json.fileName(full),'workbench-td2-striker-dpsagent-n-code.json'.replace('dpsagent','dps-agent'),'File name is a plain slug');
for(const [input,state] of [[undefined,'invalid'],['{',"invalid"],['{}','invalid'],['x'.repeat(70000),'invalid'],[JSON.stringify({...full,game:'wow-forever',title:null}),'wrong-game']]){
  const result=await json.load(input);
  assert.equal(result.ok,false);
  assert.equal(result.state,state);
  assert.ok(result.reason.length>0,'A refused file says why');
}

// Manual adapter: with no catalogue every item is pending and can't be equipped.
const manual=createManualAdapter();
const {build:start}=await manual.load();
assert.deepEqual(start,createBuild({game:'division',title:'td2'}),'Manual entry starts from an empty TD2 build');
const pendingEquip=manual.equip(start,'mask','brand-a-mask');
assert.equal(pendingEquip.ok,false,'A pending item cannot be equipped');
assert.equal(pendingEquip.state,'pending');
assert.match(pendingEquip.reason,/catalogue/,'The pending reason names the catalogue');
assert.equal(manual.setAbility(start,0,'turret-assault').ok,false,'A pending skill cannot be slotted');
assert.equal(manual.select(start,'specialization','sharpshooter').ok,false,'A pending specialization cannot be picked');

// With a sourced catalogue record the same item equips, and edits stay valid builds.
const provenance={kind:'in-game-capture',capturedBy:'Test',capturedOn:'2026-10-05',gameVersion:'TU-test',where:'Gear tooltip',note:'Fixture only.'};
const sourced=createManualAdapter({module:createDivisionModule({title:'td2',items:[{id:'brand-a-mask',provenance}],skills:[{id:'turret-assault',provenance}]})});
let step=sourced.equip(start,'mask','brand-a-mask',{attributes:{'weapon-damage':15}});
assert.equal(step.ok,true,'A sourced item equips');
assert.deepEqual(step.build.slots,{mask:{itemId:'brand-a-mask',attributes:{'weapon-damage':15}}});
assert.equal(sourced.equip(step.build,'chest','not-in-catalogue').ok,false,'An item missing from the catalogue stays blocked');
step=sourced.setAbility(step.build,0,'turret-assault');
assert.deepEqual(step.build.abilities,['turret-assault'],'A sourced skill slots');
step=sourced.rename(step.build,'My build');
step=sourced.setObjective(step.build,'dps');
assert.equal(step.build.name,'My build');
assert.equal(step.build.objective,'dps');
assert.deepEqual(decodeBuild(encodeBuild(step.build)),step.build,'A hand-made build survives a share round trip');
step=sourced.unequip(step.build,'mask');
assert.deepEqual(step.build.slots,{},'Unequip empties the slot');
assert.deepEqual(start.slots,{},'Edits never change the build they started from');

console.log('DIVISION_BUILD_FORMAT=PASS');
