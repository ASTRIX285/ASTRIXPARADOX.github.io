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
import {adaptAppearance,adaptCharacter,adaptDaevanionBoard,adaptGear,adaptItemDetail,adaptProfile,adaptSearch,adaptTitles,arcanaSlots,daevanionPercent,ITEM_LEVEL_LABEL} from '../games/aion2/engine/armory-adapter.mjs';
import {effectTag,indexStats,rankPointStats} from '../games/aion2/engine/stat-advisor.mjs';
import {createAion2Module} from '../games/aion2/index.mjs';
import {deriveRegion,deriveServers,REGION_TABLE,BOARD_IDS} from './fixtures/aion2/derive-region-fixtures.mjs';
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
assert.ok(stigmas.every(record=>record.category==='Dp'&&(record.text.pending===true||(typeof record.text==='string'&&[].concat(record.provenance).some(source=>source.kind==='in-game-capture')))),'Stigma text is pending until captured in game');
for(const record of [...skills,...stigmas]){
  const captured=[].concat(record.provenance).some(source=>source.kind==='in-game-capture');
  for(const field of ['cooldownSeconds','mpCost','specialties'])assert.ok(record[field]?.pending===true||(captured&&record[field]!==undefined&&record[field]?.pending!==true),`${record.name} ${field} pending until captured in game`);
  assert.equal([].concat(record.provenance)[0].kind,'armory','Identity comes from the armory first');
}

// Icons, portrait and stats for the pages (NCSOFT CDN URLs, never re-hosted)
assert.ok(model.profile.portrait.startsWith('https://profileimg.plaync.com/'));
assert.equal(model.profile.characterId,'B-3zbauf5-iJdckceurTzQ1SfZM1-ybQ-6ZSTDt3tHs=');
assert.ok(model.gear.every(slot=>slot.icon.startsWith('https://assets.playnccdn.com/')),'Every worn item has its CDN icon');
assert.ok(nezekan.icon.startsWith('https://assets.playnccdn.com/'));
assert.ok(model.stats.some(row=>row.name==='Might'),'Primary stats listed');
assert.ok(!model.stats.some(row=>row.name===ITEM_LEVEL_LABEL),'Item level row is not a stat');

// Stats explained (feature/aetherium-stats-explained, 11 Oct 2026): the 6 main and 10 deity stats are kept with the
// game's own effect lines (statSecondList), the ItemLevel row is dropped. Lv 45 fixture, renamed.
{
  const lv45=adaptCharacter({info:fixture('lv45-info'),equipment:fixture('lv45-equipment')},{slots,region:'eu',capturedOn:'2026-10-11'});
  assert.equal(lv45.stats.length,16,'6 main and 10 deity stats');
  assert.deepEqual(lv45.stats.filter(row=>row.kind==='main').map(row=>row.type),['STR','DEX','INT','CON','AGI','WIS']);
  assert.deepEqual(lv45.stats.filter(row=>row.kind==='deity').map(row=>row.type),['Justice','Freedom','Illusion','Life','Time','Destruction','Death','Wisdom','Destiny','Space']);
  assert.ok(!lv45.stats.some(row=>row.type==='ItemLevel'),'No ItemLevel row');
  assert.equal(lv45.profile.itemLevel,795,'Item level stays on the profile');
  const by=type=>lv45.stats.find(row=>row.type===type);
  assert.deepEqual(by('STR').effects,['Attack increase +1.5%']);
  assert.deepEqual(by('AGI').effects,['Accuracy increase +1.1%','Critical Hit increase +1.1%']);
  assert.deepEqual(by('Time').effects,['Combat Speed +3.7%','Double Resist +3.7%']);
  assert.equal(by('Time').name,'Time [Siel]');
  assert.deepEqual(by('INT').effects,[],'0 points: the site sends null, kept as an empty list');
  assert.ok(model.stats.every(row=>Array.isArray(row.effects)&&['main','deity'].includes(row.kind)),'Every stat row has its kind and effect list');
}

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

// Race: the official data keys the faction on raceId (1 Elyos, 2 Asmodian) and spells the name "Asmodians".
assert.equal(model.profile.raceId,1);
{
  const bareRace=structuredClone(raw);
  delete bareRace.info.profile.raceId;
  bareRace.info.profile.raceName='Asmodians';
  assert.equal(adaptCharacter(bareRace,{slots,region:'eu',capturedOn:'2026-10-05'}).profile.raceName,'Asmodian','Name fallback accepts the plural');
  bareRace.info.profile.raceName='Asmodian';
  assert.equal(adaptCharacter(bareRace,{slots,region:'eu',capturedOn:'2026-10-05'}).profile.raceId,2,'Name fallback accepts the singular');
}

// One derived fixture per region (derived from the EU capture, not raw captures: see ENDPOINTS-regions.md).
{
  assert.deepEqual(REGION_TABLE.map(row=>row.code),['naw','nae','eu','la','as']);
  const expectedCounts={naw:10,nae:16,eu:46,la:12,as:18};
  for(const row of REGION_TABLE){
    assert.equal(deriveServers(row.code).serverList.length,expectedCounts[row.code],`${row.code} server count`);
    for(const race of ['elyos','asmodian']){
      const d=deriveRegion(row.code,{race});
      const m=adaptCharacter({info:d.info,equipment:d.equipment,items:{},boards:{[d.boardIds[0]]:d.daevanion}},{slots,region:row.code,capturedOn:'2026-10-09'});
      assert.equal(m.source.region,row.code);
      assert.equal(m.profile.class,row.cls);
      assert.equal(m.profile.level,row.level);
      assert.equal(m.profile.raceName,race==='asmodian'?'Asmodian':'Elyos');
      assert.equal(m.profile.raceId,race==='asmodian'?2:1);
      assert.equal(String(m.profile.server.id)[0],race==='asmodian'?'2':'1','Elyos 1xxx, Asmodian 2xxx');
      assert.equal(String(m.profile.server.id)[1],String(row.digit),`${row.code} uses ${row.digit}x servers`);
      assert.deepEqual(m.daevanion.map(board=>board.id),d.boardIds);
      // Search rows keep the same shape in every region.
      const rows=adaptSearch(d.search);
      assert.equal(rows.length,1);
      assert.equal(rows[0].serverId,d.serverId);
    }
  }
  // Asmodian boards are 31 to 36 (no 35), Elyos 11 to 16 (no 15), and the board call reads the node list as is.
  assert.deepEqual(BOARD_IDS.asmodian,[31,32,33,34,36]);
  const asm=deriveRegion('eu',{race:'asmodian'});
  const nodes=adaptDaevanionBoard(asm.daevanion);
  assert.ok(nodes.length>0&&nodes.every(node=>node.boardId===31),'Asmodian board nodes carry the Asmodian board id');
}

// More character info (12 Oct 2026): the Lv 45 /aion2/character capture (lv45-character.json, renamed: TESTDAEVA, TESTLEGION).
const lv45Raw=fixture('lv45-character');
const lv45=adaptCharacter({info:lv45Raw.info,equipment:lv45Raw.equipment},{slots,region:'eu',capturedOn:'2026-10-12'});
{
  // Legion: profile.regionName, an empty string with no legion (the 5 Oct capture), absent or blank too.
  assert.equal(lv45.profile.legion,'TESTLEGION');
  assert.equal(model.profile.legion,null,'No legion on the 5 Oct capture (regionName "")');
  for(const value of [undefined,null,'','   ',42]){
    const info=structuredClone(lv45Raw.info);
    if(value===undefined)delete info.profile.regionName;else info.profile.regionName=value;
    assert.equal(adaptProfile(info).legion,null,`regionName ${JSON.stringify(value)}: no legion`);
  }
  // The title shown (cosmetic) keeps its id, name and grade.
  assert.deepEqual([lv45.profile.title,lv45.profile.titleId,lv45.profile.titleGrade],["I'll Finish This",12010016,'Rare']);
  // Titles: one entry per category in the game's order, owned of total, the title set there with both effect lists.
  const t=lv45.titles;
  assert.deepEqual([t.owned,t.total],[59,297]);
  assert.deepEqual(t.categories.map(c=>[c.id,c.code,c.owned,c.total,c.percent]),[['attack','Attack',19,103,18],['defense','Defense',15,95,16],['other','Etc',25,99,25]]);
  assert.deepEqual(t.categories[0].worn,{id:11020034,name:'Failed Entrepreneur',grade:'Legend',effect:['PvE Attack +25','Attack Bonus +20'],alsoGives:['Accuracy Bonus +10']});
  assert.deepEqual(t.categories[2].worn.effect,['HP +750','HP Potion Recovery +300']);
  assert.deepEqual(t.categories[1].worn.alsoGives,['Front Defense +30']);
  // The 5 Oct capture: owned counts but no title set in any category (id and name null).
  assert.ok(model.titles.categories.length===3&&model.titles.categories.every(c=>c.worn===null),'No title set: worn is null, never a blank title');
  // No title block, a missing category, null lists.
  assert.equal(adaptTitles({}).pending,true,'No title block: pending');
  assert.equal(adaptTitles({title:{titleList:null}}).pending,true);
  const partial=structuredClone(lv45Raw.info.title);
  partial.titleList=partial.titleList.filter(entry=>entry.equipCategory!=='Defense');
  partial.titleList[0].equipStatList=null;partial.titleList[0].statList=[{desc:''},{desc:null},{desc:' HP +5 '}];
  const pt=adaptTitles({title:partial});
  assert.deepEqual(pt.categories.map(c=>c.id),['attack','other'],'A missing category is left out, never 0, the rest in the game order');
  const first=pt.categories.find(c=>c.code===partial.titleList[0].equipCategory);
  assert.deepEqual([first.worn.effect,first.worn.alsoGives],[[],['HP +5']],'Null and blank lines dropped');
  delete partial.ownedCount;
  assert.equal(adaptTitles({title:partial}).owned,null,'No overall count: null, never 0');
  // Arcana: always the five slots, empty here (none worn in any capture); a worn one is its gear entry.
  assert.deepEqual(lv45.arcana.map(a=>[a.slot,a.slotPos,a.empty]),[['Arcana1',41,true],['Arcana2',42,true],['Arcana3',43,true],['Arcana4',44,true],['Arcana5',45,true]]);
  const withArcana=structuredClone(lv45Raw.equipment);
  withArcana.equipment.equipmentList.push({enchantLevel:2,exceedLevel:0,grade:'Rare',icon:'https://assets.playnccdn.com/static-aion2-gamedata/resources/test.png',id:900000043,name:'Test Arcana',slotPos:43,slotPosName:'Arcana3'});
  const gearA=adaptGear(withArcana,slots);
  const arc=arcanaSlots(gearA,slots);
  assert.equal(arc.length,5);
  assert.deepEqual([arc[2].empty,arc[2].name,arc[2].grade,arc[2].enchant],[false,'Test Arcana','Rare',2]);
  assert.ok([0,1,3,4].every(n=>arc[n].empty),'The other four stay empty');
  // Exceed level: sent on every worn item (0 here), 0 when the data leaves it out, the number when above 0.
  assert.ok(lv45.gear.filter(g=>!g.empty).every(g=>g.exceed===0),'Exceed 0 on every worn item in the capture');
  const ex=structuredClone(lv45Raw.equipment);
  ex.equipment.equipmentList[0].exceedLevel=2;delete ex.equipment.equipmentList[1].exceedLevel;ex.equipment.equipmentList[2].exceedLevel=null;
  const exGear=adaptGear(ex,slots);
  assert.deepEqual([exGear.find(g=>g.slotPos===1).exceed,exGear.find(g=>g.slotPos===2).exceed,exGear.find(g=>g.slotPos===5).exceed],[2,0,0]);
  // Appearance: the skins and the wing skin as sent; nothing when the data has none.
  assert.deepEqual(lv45.appearance.skins.map(skin=>[skin.slot,skin.name,skin.grade]),[['Cape','Skybright Oath (Cloak)','Legend'],['Greatsword','Endsong (Greatsword)','Legend'],['Torso','Light of Genesis (Breastplate)','Common'],['Shoulder','Steel Endurance (Pauldrons)','Legend'],['Helmet','Steel Endurance (Helm)','Legend']]);
  assert.deepEqual(lv45.appearance.wingSkin,{id:30200703,name:'Superior Daeva Wings',icon:'https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WingB_007C.png',grade:'Legend'});
  assert.deepEqual(adaptAppearance({equipment:{equipmentList:[]},petwing:{}}),{skins:[],wingSkin:null},'No skins, no wing skin');
  assert.deepEqual(adaptAppearance({}),{skins:[],wingSkin:null});
  // Daevanion: the board percent as sent, null when missing; the overall percent by nodes over every board.
  assert.deepEqual(lv45.daevanion.map(b=>[b.name,b.nodesTaken,b.nodesTotal,b.percent]),[['Nezekan',45,88,51],['Zikel',42,88,48],['Vaizel',21,88,24],['Triniel',0,116,0],['Azphel',0,152,0]]);
  assert.equal(daevanionPercent(lv45.daevanion),20,'108 of 532 nodes');
  assert.equal(daevanionPercent([]),null);
  const noPct=structuredClone(lv45Raw.info);delete noPct.daevanion.boardList[0].openPercent;
  assert.equal(adaptCharacter({info:noPct,equipment:lv45Raw.equipment},{slots,region:'eu',capturedOn:'2026-10-12'}).daevanion[0].percent,null);
  // Ranking: rankingList is null in every capture, so the model has no ranking at all.
  assert.equal(lv45Raw.info.ranking.rankingList,null);
  assert.ok(!('ranking' in lv45),'No ranking field: no data');
  // Stigmas: the equipped ones and their levels come straight from the skill data.
  assert.deepEqual(lv45.skills.filter(s=>s.category==='Dp'&&s.equipped).map(s=>[s.name,s.skillLevel]),[['Wrath Wave',1],["Zikel's Blessing",3],['Rage Burst',8],['Wave Armor',1],['Fracturing Rush',1]]);
  // Title effect tags for a Gladiator: only a line naming a stat the record knows exactly gets one.
  const stats=json('games/aion2/data/advisor/stats.json');
  const build=json('games/aion2/data/advisor/builds/gladiator.json').records.find(b=>b.main);
  const rank=rankPointStats(build,indexStats(stats));
  const tags=Object.fromEntries(['Attack Bonus +20','Accuracy Bonus +10','HP +750','Evasion Bonus +32','PvE Attack +25','Critical Damage Defense +315','Front Defense +30','HP Potion Recovery +300','Move Speed +1.6%'].map(line=>[line,effectTag(line,rank,build,stats)]));
  assert.deepEqual(tags,{'Attack Bonus +20':'useful','Accuracy Bonus +10':'high','HP +750':'low','Evasion Bonus +32':'low','PvE Attack +25':null,'Critical Damage Defense +315':null,'Front Defense +30':null,'HP Potion Recovery +300':null,'Move Speed +1.6%':'low'});
  assert.equal(effectTag('Attack Bonus +20',null,build,stats),null,'No stat order: no tag');
  // The fixture is renamed: no gamer tag, real id, portrait or real legion name.
  const text=JSON.stringify(lv45Raw);
  for(const bad of [['ASTRIX','285'].join(''),['AX','PARADOX'].join(''),'B-3zbauf5','profileimg.plaync.com'])assert.ok(!text.includes(bad),`fixture has no ${bad}`);
}

// Enhancement fields (feature/aetherium-enhancement-guide, 17 Oct 2026): from the item detail, the Lv 45 fixture.
const lv45Items=fixture('lv45-items');
const lv45Full=adaptCharacter({info:fixture('lv45-info'),equipment:fixture('lv45-equipment'),items:lv45Items},{slots,region:'eu',capturedOn:'2026-10-11'});
{
  const at=pos=>lv45Full.gear.find(slot=>slot.slotPos===pos);
  const weapon=at(1),guard=at(2),helm=at(3),belt=at(17);
  assert.deepEqual([weapon.maxEnchant,weapon.manastoneSlots,weapon.theostoneSlots,weapon.soulBindRate],[15,4,1,100]);
  assert.deepEqual(weapon.manastones.map(stone=>[stone.slot,stone.id,stone.name,stone.value,stone.grade]),[[0,'HPMax','HP','+60','Rare'],[1,'Accuracy','Accuracy Bonus','+5','Common'],[2,'HPMax','HP','+30','Common'],[3,'ArmorDefense','Defense','+30','Rare']]);
  assert.equal(weapon.theostone.pending,true,'No item detail field says which Theostone is engraved');
  assert.deepEqual(weapon.bindLines[0],{id:'STR',name:'Might',text:'15',value:15,min:15,max:null},'value, minValue, and no max in the data');
  assert.equal(guard.soulBindRate,94.3,'The rate is sent as a string and read as a number');
  assert.deepEqual(guard.bindLines.map(line=>[line.name,line.value,line.min,line.max]),[['Block',37,null,null],['MP',112,null,null],['Back Attack',59,null,null]]);
  assert.deepEqual(guard.skillLines,[{name:'Ankle Slice',level:1}]);
  assert.deepEqual([helm.manastoneSlots,helm.manastones,helm.theostoneSlots.pending],[3,[],true],'No magicStoneStat: every slot empty; no godStoneSlotCount: pending');
  assert.deepEqual([belt.manastoneSlots.pending,belt.bindLines,belt.skillLines],[true,[],[]],'The belt has no slot count, no lines');
  assert.equal(at(8).bindLines.find(line=>line.name==='Perfect Resist').value,2,'"2%" reads as 2');
  // No detail read: every enhance field is pending with a reason.
  const unread=lv45.gear.find(slot=>slot.slotPos===1);
  for(const field of ['manastones','theostoneSlots','theostone','soulBindRate','bindLines','skillLines'])assert.ok(unread[field].pending===true&&unread[field].reason.length>0,`${field} pending before the detail`);
  // Missing and null values in a detail.
  const odd=structuredClone(lv45Items['2']);
  Object.assign(odd,{soulBindRate:null,magicStoneStat:null,subStats:null,subSkills:null,godStoneSlotCount:null});
  const oddFields=adaptItemDetail(odd).enhance;
  assert.deepEqual([oddFields.soulBindRate.pending,oddFields.manastones,oddFields.bindLines,oddFields.skillLines,oddFields.theostoneSlots.pending],[true,[],[],[],true]);
  delete odd.soulBindRate;odd.magicStoneStat=[null,{id:'HPMax',value:'+5'},{id:'Block',name:'Block',value:'+20',slotPos:2}];
  const oddAgain=adaptItemDetail(odd).enhance;
  assert.equal(oddAgain.soulBindRate.pending,true,'Absent rate: pending');
  assert.deepEqual(oddAgain.manastones,[{slot:2,id:'Block',name:'Block',value:'+20',grade:null}],'Rows with no name are dropped, the slot kept');
  // The item card reads the same fields.
  assert.deepEqual(adaptItemDetail(lv45Items['2']).enhance.bindLines.map(line=>line.name),['Block','MP','Back Attack']);
}

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
  check('character',lv45,'Lv 45 model with titles, legion, Arcana and appearance');
  check('character',lv45Full,'Lv 45 model with every item detail (enhancement fields)');
  slots.forEach(record=>check('gear-slot',record,`slot ${record.id}`));
  [...skills,...stigmas].forEach(record=>check('catalogue-skill',record,`skill ${record.name}`));
}

console.log('AION2_ADAPTER=PASS');
