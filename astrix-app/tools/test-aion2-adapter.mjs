#!/usr/bin/env node
// The Aetherium character model (brief feature/aetherium-game-folder, 5 Oct 2026). The armory adapter
// turns the #451 EU fixtures for ASTRIX285 into the normalised model:
//   - Elyos Gladiator Lv 12 with 8 gear slots filled and no accessory worn (accessory slots pending);
//   - 13 locked stigmas, Nezekan open with 0 of 88 nodes, item level from the untranslated label;
//   - the model and the catalogue records match their schemas (when ajv is installed);
//   - a changed armory shape throws instead of producing a half model.
// Offline only, never calls NCSOFT.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {adaptCharacter,adaptDaevanionBoard,adaptItemDetail,adaptSearch,ITEM_LEVEL_LABEL} from '../games/aion2/engine/armory-adapter.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {validateGameModule} from '../platform/contracts/game-module.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const fixture=name=>json(`tools/fixtures/aion2/eu/${name}.json`);
const slots=json('games/aion2/data/gear-slots.json').records;
const skills=json('games/aion2/data/gladiator/skills.json').records;
const stigmas=json('games/aion2/data/gladiator/stigmas.json').records;

const raw={
  info:fixture('astrix285-info'),
  equipment:fixture('astrix285-equipment'),
  items:{1:fixture('astrix285-item-mainhand')},
  boards:{11:fixture('astrix285-daevanion-11')}
};
const model=adaptCharacter(raw,{slots,region:'eu',capturedOn:'2026-10-05'});

// Profile
assert.deepEqual(
  {name:model.profile.name,class:model.profile.class,level:model.profile.level,raceName:model.profile.raceName},
  {name:'ASTRIX285',class:'Gladiator',level:12,raceName:'Elyos'}
);
assert.deepEqual(model.profile.server,{id:1308,name:'Meslamtaeda'});
assert.equal(model.profile.title,'Draped in Sky');
assert.equal(model.profile.combatPower,6532);
assert.ok(raw.info.stat.statList.some(row=>row.name===ITEM_LEVEL_LABEL),'Fixture carries the untranslated item level row');
assert.equal(model.profile.itemLevel,44,'Item level read from the untranslated label');
assert.deepEqual(model.source,{kind:'armory',region:'eu',capturedOn:'2026-10-05'});

// Gear: 8 slots filled, no accessory worn, accessory slot list pending
assert.equal(model.gear.length,8);
assert.ok(model.gear.every(slot=>slot.empty===false),'All 8 gear slots filled');
assert.deepEqual(model.gear.map(slot=>slot.slotPos),[1,2,3,4,5,6,7,8]);
assert.equal(model.accessorySlots.pending,true,'Accessory slots pending, never guessed');
assert.ok(model.accessorySlots.reason.length>0);
const mainHand=model.gear.find(slot=>slot.slot==='MainHand');
assert.equal(mainHand.name,'Twilight Greatsword');
assert.equal(mainHand.enchant,2);
assert.equal(mainHand.maxEnchant,5,'Max enchant from the item detail call');
assert.equal(mainHand.manastoneSlots,2,'Manastone slots from the item detail call');
const helmet=model.gear.find(slot=>slot.slot==='Helmet');
assert.equal(helmet.maxEnchant.pending,true,'No detail read for the helmet, so max enchant is pending');

// An empty slot comes out as empty: true
const bare=structuredClone(raw.equipment);
bare.equipment.equipmentList=bare.equipment.equipmentList.filter(item=>item.slotPosName!=='Boots');
const bareModel=adaptCharacter({...raw,equipment:bare},{slots,region:'eu',capturedOn:'2026-10-05'});
assert.deepEqual(bareModel.gear.find(slot=>slot.slot==='Boots'),{slot:'Boots',slotPos:8,empty:true});

// Skills and stigmas
assert.equal(model.skills.length,35);
const locked=model.skills.filter(skill=>skill.category==='Dp');
assert.equal(locked.length,13,'13 stigmas');
assert.ok(locked.every(skill=>skill.needLevel===22&&skill.acquired===false),'All stigmas locked until Lv 22');
for(const name of ['Keen Strike','Rending Blow','Overhead Slam'])assert.equal(model.skills.find(skill=>skill.name===name).acquired,true,`${name} acquired`);
assert.equal(model.skills.find(skill=>skill.name==='Ruinous Blow').needLevel,14);

// Daevanion
const nezekan=model.daevanion.find(board=>board.name==='Nezekan');
assert.deepEqual({open:nezekan.open,taken:nezekan.nodesTaken,total:nezekan.nodesTotal},{open:true,taken:0,total:88});
assert.equal(model.daevanion.filter(board=>board.open).length,1,'Only Nezekan open at Lv 12');
assert.ok(nezekan.nodes.length>0&&nezekan.nodes.every(node=>node.type!=='None'&&node.taken===false),'Nezekan grid, no node taken');
assert.ok(nezekan.nodes.some(node=>node.effects.includes('Critical Hit Resist +5')),'Node effect text kept');

// Pet and wings
assert.equal(model.pet.name,'Black Smoke Murute');
assert.equal(model.wings.name,'Lesser Daeva Wings');

// Catalogue: identity matches the armory, captured values pending with a reason
assert.equal(skills.length+stigmas.length,35);
assert.ok(stigmas.every(record=>record.category==='Dp'&&record.text.pending===true));
for(const record of [...skills,...stigmas]){
  for(const field of ['cooldownSeconds','mpCost','specialties'])assert.equal(record[field].pending,true,`${record.name} ${field} pending until captured`);
  assert.equal(record.provenance.kind,'armory');
}

// Icons, portrait and stats for the pages (NCSOFT CDN URLs, never re-hosted)
assert.ok(model.profile.portrait.startsWith('https://profileimg.plaync.com/'));
assert.equal(model.profile.characterId,'B-3zbauf5-iJdckceurTzQ1SfZM1-ybQ-6ZSTDt3tHs=');
assert.ok(model.gear.every(slot=>slot.icon.startsWith('https://assets.playnccdn.com/')),'Every worn item has its CDN icon');
assert.ok(nezekan.icon.startsWith('https://assets.playnccdn.com/'));
assert.ok(model.stats.some(row=>row.name==='Might'),'Primary stats listed');
assert.ok(!model.stats.some(row=>row.name===ITEM_LEVEL_LABEL),'Item level row is not a stat');

// Item detail card and search rows
const detail=adaptItemDetail(raw.items[1]);
assert.equal(detail.name,'Twilight Greatsword');
assert.equal(detail.maxEnchant,5);
assert.deepEqual(detail.mainStats.find(row=>row.name==='Attack'),{name:'Attack',value:'48',extra:'2'});
assert.deepEqual(detail.sources,['Quest']);
const [hit]=adaptSearch(fixture('astrix285-search'));
assert.equal(hit.name,'ASTRIX285','Highlight tags stripped');
assert.equal(hit.characterId,model.profile.characterId,'Search id decodes to the info id');
assert.equal(hit.serverId,1308);

// Game module on the platform contract
const module=validateGameModule(createAion2Module({slots,classes:{Gladiator:{skills,stigmas}}}));
assert.equal(module.getMetadata().id,'aion2');
assert.equal(module.getMetadata().productName,'The Aetherium');
assert.equal(module.normaliseCharacter(raw,{region:'eu',capturedOn:'2026-10-05'}).gear.length,8);
assert.equal(module.normalisePassives(raw).length,10);
assert.equal(module.resolveSkill('Gladiator',11020000).name,'Keen Strike');
assert.equal(module.resolveSkill('Templar',1).pending,true);

// A changed armory shape throws
assert.throws(()=>adaptCharacter({info:{},equipment:raw.equipment},{slots,region:'eu',capturedOn:'2026-10-05'}),/shape changed/);
assert.throws(()=>adaptDaevanionBoard({}),/shape changed/);
assert.throws(()=>adaptCharacter(raw,{slots,region:'eu',capturedOn:'today'}),/capturedOn/);

// Schemas (ajv is a dev dependency: npm install --prefix astrix-app)
const require=createRequire(import.meta.url);
let Ajv2020,addFormats;
try {Ajv2020=require('ajv/dist/2020.js');addFormats=require('ajv-formats');}
catch {console.log('AION2_ADAPTER schema check skipped (run npm install --prefix astrix-app)');}
if(Ajv2020){
  const ajv=new (Ajv2020.default??Ajv2020)({allErrors:true,strict:true});
  (addFormats.default??addFormats)(ajv);
  for(const file of ['provenance','pending'])ajv.addSchema(json(`platform/contracts/${file}.schema.json`));
  const compiled=new Map();
  const check=(schema,value,label)=>{
    if(!compiled.has(schema))compiled.set(schema,ajv.compile(json(`games/aion2/schema/${schema}.schema.json`)));
    const validate=compiled.get(schema);
    assert.ok(validate(value),`${label}: ${ajv.errorsText(validate.errors)}`);
  };
  check('character',model,'ASTRIX285 model');
  check('character',bareModel,'Model with an empty slot');
  slots.forEach(record=>check('gear-slot',record,`slot ${record.id}`));
  [...skills,...stigmas].forEach(record=>check('catalogue-skill',record,`skill ${record.name}`));
}

console.log('AION2_ADAPTER=PASS');
