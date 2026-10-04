// Neutral build format, share strings and the manual and json Division adapters.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILD_KEYS, PLATFORMS, SLOT_KEYS, SHARE_MAX_LENGTH, createBuild, decodeBuild, encodeBuild, normaliseBuild, validateBuild} from '../core/build-format/build.mjs';
import {validateBuildAdapter} from '../platform/contracts/build-adapter.mjs';
import {DIVISION_ADAPTERS, createJsonAdapter, createManualAdapter, readShareParam, shareUrl} from '../platform/adapters/division/index.mjs';
import {createDivisionModule} from '../games/division/index.mjs';

// The JSON Schema and the code agree on the fields.
const schema=JSON.parse(readFileSync(new URL('../core/build-format/build.schema.json',import.meta.url),'utf8'));
assert.deepEqual([...schema.required].sort(),[...BUILD_KEYS].sort(),'build.schema.json required fields match BUILD_KEYS');
assert.deepEqual(Object.keys(schema.properties.slots.additionalProperties.properties).sort(),[...SLOT_KEYS].sort(),'build.schema.json slot fields match SLOT_KEYS');
assert.ok(!JSON.stringify(schema).includes('gameVersion'),'The build records catalogueVersion, never gameVersion');

const empty=createBuild({game:'division',title:'td2',platform:'pc'});
assert.deepEqual(PLATFORMS,['pc','playstation','xbox'],'Three platforms: PC (Ubisoft Connect, Steam, Epic, Luna), PlayStation, Xbox');
assert.deepEqual(schema.properties.platform.enum,PLATFORMS,'build.schema.json platform enum matches PLATFORMS');
assert.throws(()=>createBuild({game:'division',title:'td2'}),TypeError,'A build without a platform is refused, never assumed');
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

// Round trip: build to share string and back comes out identical, on every platform.
for(const build of [empty,full,...PLATFORMS.map(platform=>({...full,platform}))]){
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
const noPlatform=await manual.load();
assert.deepEqual({ok:noPlatform.ok,state:noPlatform.state},{ok:false,state:'needs-platform'},'A new build asks for a platform instead of assuming one');
const {build:start}=await manual.load({platform:'xbox'});
assert.deepEqual(start,createBuild({game:'division',title:'td2',platform:'xbox'}),'Manual entry starts from an empty TD2 build on the chosen platform');
const pendingEquip=manual.equip(start,'mask','brand-a-mask');
assert.equal(pendingEquip.ok,false,'A pending item cannot be equipped');
assert.equal(pendingEquip.state,'pending');
assert.match(pendingEquip.reason,/catalogue/,'The pending reason names the catalogue');
assert.equal(manual.setAbility(start,0,'turret-assault').ok,false,'A pending skill cannot be slotted');
assert.equal(manual.select(start,'specialization','sharpshooter').ok,false,'A pending specialization cannot be picked');

// Item instances. The fixture catalogue below is synthetic and exists only in this test.
const provenance={kind:'in-game-capture',capturedBy:'Test',capturedOn:'2026-10-05',gameVersion:'TU-test',where:'Gear tooltip',note:'Fixture only.'};
const range=(min,max,unit)=>({min,max,unit});
const fixture={title:'td2',catalogueVersion:'td2-fixture',
  brands:[{id:'fixture-brand',name:'Fixture Brand',provenance,slotIds:['mask','chest']}],
  items:[
    {id:'fixture-named-mask',name:'Fixture Named Mask',provenance,rarity:'named',itemType:'gear',slotId:'mask',talentId:'fixture-locked-talent',lockedAttribute:{attributeId:'crit-chance',value:8,unit:'percent'}},
    {id:'fixture-exotic-chest',name:'Fixture Exotic Chest',provenance,rarity:'exotic',itemType:'gear',slotId:'chest',talentId:'fixture-exotic-talent'}
  ],
  attributes:[
    {id:'weapon-damage',name:'Weapon Damage',provenance,kind:'core',roll:range(10,15,'percent')},
    {id:'skill-tier',name:'Skill Tier',provenance,kind:'core',roll:range(1,1,'tier')},
    {id:'crit-chance',name:'Critical Hit Chance',provenance,kind:'secondary',roll:range(1,6,'percent')},
    {id:'crit-damage',name:'Critical Hit Damage',provenance,kind:'secondary',roll:{pending:true,reason:'Not captured yet.'}}
  ],
  talents:[{id:'fixture-talent',name:'Fixture Talent',provenance,appliesTo:'gear'},{id:'fixture-locked-talent',name:'Fixture Locked',provenance,appliesTo:'gear'}],
  mods:[{id:'fixture-mod',name:'Fixture Mod',provenance,modType:'gear'}],
  skills:[{id:'turret-assault',name:'Assault Turret',provenance}]
};
const sourced=createManualAdapter({module:createDivisionModule(fixture)});
const highEnd={core:{attributeId:'weapon-damage',value:15},attributes:{'crit-chance':6},talentId:'fixture-talent',modIds:['fixture-mod'],expertise:12,itemLevel:40};
let step=sourced.equip(start,'mask','fixture-brand',highEnd);
assert.equal(step.ok,true,'A high-end instance with its own core, rolls, talent, mods, expertise and item level equips');
assert.deepEqual(step.build.slots.mask,{itemId:'fixture-brand',...highEnd},'Every instance field is kept');
const named=sourced.equip(step.build,'mask','fixture-named-mask',{core:{attributeId:'skill-tier',value:1},attributes:{'crit-chance':8},talentId:'fixture-locked-talent',expertise:3,itemLevel:40});
assert.equal(named.ok,true,'A named instance keeps its locked talent and attribute; the rest rolls');
const exotic=sourced.equip(start,'chest','fixture-exotic-chest',{modIds:['fixture-mod'],expertise:20,itemLevel:40});
assert.equal(exotic.ok,true,'An exotic stores only its mods, expertise level and item level');

// The rules are enforced.
const refused=(result,pattern,name)=>{assert.equal(result.ok,false,name);assert.match(result.reason,pattern,name);};
refused(sourced.equip(start,'chest','fixture-exotic-chest',{core:{attributeId:'weapon-damage',value:12}}),/exotic/,'An exotic refuses a core roll');
refused(sourced.equip(start,'chest','fixture-exotic-chest',{attributes:{'crit-chance':3}}),/exotic/,'An exotic refuses attribute rolls');
refused(sourced.equip(start,'chest','fixture-exotic-chest',{talentId:'fixture-talent'}),/exotic/,'An exotic refuses a talent');
refused(sourced.equip(start,'mask','fixture-named-mask',{talentId:'fixture-talent'}),/locked talent/,'A named item keeps its locked talent');
refused(sourced.equip(start,'mask','fixture-named-mask',{attributes:{'crit-chance':5}}),/locked attribute/,'A named item keeps its locked attribute');
refused(sourced.equip(start,'mask','fixture-brand',{core:{attributeId:'weapon-damage',value:16}}),/outside 10 to 15/,'A core roll above the catalogue max is refused');
refused(sourced.equip(start,'mask','fixture-brand',{attributes:{'crit-chance':0.5}}),/outside 1 to 6/,'An attribute roll below the catalogue min is refused');
refused(sourced.equip(start,'mask','fixture-brand',{attributes:{'crit-damage':10}}),/Not captured/,'A roll with no sourced range is refused');
refused(sourced.equip(start,'mask','fixture-brand',{core:{attributeId:'crit-chance',value:3}}),/not a core attribute/,'Only a core attribute can be the core');
refused(sourced.equip(start,'mask','fixture-brand',{talentId:'not-sourced'}),/not in the td2 catalogue/,'A talent must be in the catalogue');
refused(sourced.equip(start,'mask','fixture-brand',{modIds:['not-sourced']}),/not in the td2 catalogue/,'A mod must be in the catalogue');
refused(sourced.equip(start,'kneepads','fixture-brand'),/does not go in/,'An item only goes in its own slots');
refused(sourced.equip(start,'chest','not-in-catalogue'),/not in the td2 catalogue/,'An item missing from the catalogue stays blocked');
assert.equal(validateBuild({...full,slots:{mask:{itemId:'x',expertise:-1}}}).length>0,true,'Expertise is a whole number of 0 or more');
assert.equal(validateBuild({...full,slots:{mask:{itemId:'x',itemLevel:2.5}}}).length>0,true,'Item level is a whole number');
assert.equal(validateBuild({...full,slots:{mask:{itemId:'x',core:{attributeId:'weapon-damage'}}}}).length>0,true,'A core needs a value');

// Update one field of an instance; the rules still apply.
let updated=sourced.update(step.build,'mask',{core:{attributeId:'weapon-damage',value:11},expertise:13});
assert.equal(updated.ok,true);
assert.deepEqual(updated.build.slots.mask.core,{attributeId:'weapon-damage',value:11});
assert.equal(updated.build.slots.mask.expertise,13);
refused(sourced.update(step.build,'mask',{core:{attributeId:'weapon-damage',value:99}}),/outside/,'An update outside the range is refused');
refused(sourced.update(exotic.build,'chest',{talentId:'fixture-talent'}),/exotic/,'An exotic stays fixed on update');
updated=sourced.update(updated.build,'mask',{talentId:null});
assert.ok(!('talentId' in updated.build.slots.mask),'Clearing a field removes it');
refused(sourced.update(start,'gloves',{expertise:1}),/Equip an item/,'An empty slot cannot be updated');

// Round trip: a high-end, a named and an exotic instance survive the share string and a build file.
let mixed=sourced.equip(start,'mask','fixture-named-mask',{core:{attributeId:'skill-tier',value:1},attributes:{'crit-chance':8},expertise:3,itemLevel:40}).build;
mixed=sourced.equip(mixed,'chest','fixture-exotic-chest',{modIds:['fixture-mod'],expertise:20,itemLevel:40}).build;
const sourcedBrand=createManualAdapter({module:createDivisionModule({...fixture,brands:[{...fixture.brands[0],slotIds:['mask','chest','backpack']}]})});
mixed=sourcedBrand.equip(mixed,'backpack','fixture-brand',highEnd).build;
assert.deepEqual(decodeBuild(encodeBuild(mixed)),mixed,'High-end, named and exotic instances round trip through the share string');
assert.equal(encodeBuild(decodeBuild(encodeBuild(mixed))),encodeBuild(mixed),'and back again to the same string');
const fileJson=createJsonAdapter({module:createDivisionModule({...fixture,brands:[{...fixture.brands[0],slotIds:['mask','chest','backpack']}]})});
assert.deepEqual(await fileJson.load(fileJson.export(mixed)),{ok:true,build:mixed},'and through a build file');
const tampered=JSON.parse(fileJson.export(mixed));tampered.slots.chest.talentId='fixture-talent';
assert.equal((await fileJson.load(JSON.stringify(tampered))).state,'invalid','A build file that rolls an exotic is refused');

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

// Platform: every share string keeps it; JSON without one asks; duplicate moves a build onto yours.
for(const platform of PLATFORMS){
  const onPlatform={...full,platform};
  assert.equal(decodeBuild(encodeBuild(onPlatform)).platform,platform,`${platform} survives the share string`);
  assert.equal(readShareParam(shareUrl(onPlatform).slice(shareUrl(onPlatform).indexOf('?'))).platform,platform,`${platform} survives the share link`);
}
invalid({...empty,platform:'switch'},'an unknown platform');
invalid((({platform,...rest})=>rest)(empty),'a missing platform');
const legacy=JSON.stringify((({platform,...rest})=>rest)(full));
const asked=await json.load(legacy);
assert.deepEqual({ok:asked.ok,state:asked.state},{ok:false,state:'needs-platform'},'A JSON build with no platform asks for one');
assert.match(asked.reason,/platform/,'and says why');
assert.deepEqual(await json.load(legacy,{platform:'playstation'}),{ok:true,build:{...full,platform:'playstation'}},'With the platform the player picked, it imports');
assert.equal((await json.load(legacy,{platform:'switch'})).state,'needs-platform','An unknown platform is not accepted');
assert.equal((await json.load(JSON.stringify({...full,platform:'switch'}))).state,'invalid','A file naming an unknown platform is refused');
const dup=manual.duplicate({...full,platform:'pc'},'xbox');
assert.equal(dup.ok,true);
assert.equal(dup.build.platform,'xbox','Duplicate moves a shared build onto your platform');
assert.deepEqual({...dup.build,platform:'pc'},{...full,platform:'pc'},'Duplicate changes nothing but the platform');
assert.equal(manual.duplicate(full,'switch').state,'needs-platform');

console.log('DIVISION_BUILD_FORMAT=PASS');
