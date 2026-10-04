#!/usr/bin/env node
// AION 2 Phase 0 data proof (5 Oct 2026): the captured EU armory responses for ASTRIX285 keep the
// fields the Gear Ledger and Ascent Plan adapters will read. Offline only, never calls NCSOFT.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const dir=fileURLToPath(new URL('./fixtures/aion2/eu/',import.meta.url));
const load=name=>JSON.parse(readFileSync(`${dir}${name}.json`,'utf8'));

const servers=load('servers').serverList;
assert.ok(servers.some(s=>s.serverId===1308&&s.serverName==='Meslamtaeda'&&s.raceId===1),'Meslamtaeda is an Elyos EU server');
assert.ok(servers.some(s=>s.raceId===2),'Asmodian servers listed');
assert.ok(load('classes').classList.some(c=>c.name==='Gladiator'),'Gladiator in the class list');

const [hit]=load('astrix285-search').list;
assert.equal(hit.region,'eu');
assert.equal(hit.serverId,1308);
assert.match(hit.characterId,/%3D$/,'Search returns the id URL-encoded');

const info=load('astrix285-info');
assert.equal(info.profile.characterName,'ASTRIX285');
assert.equal(info.profile.className,'Gladiator');
assert.equal(info.profile.raceName,'Elyos');
assert.equal(info.profile.characterLevel,12);
assert.equal(info.profile.titleName,'Draped in Sky');
assert.equal(typeof info.profile.combatPower,'number');
for(const stat of ['Might','Dexterity','Intelligence','Constitution','Precision','Willpower']){
  assert.ok(info.stat.statList.some(s=>s.name===stat),`${stat} listed`);
}
assert.equal(info.daevanion.boardList.length,5,'Five Daevanion boards');

const equipment=load('astrix285-equipment');
const mainHand=equipment.equipment.equipmentList.find(g=>g.slotPosName==='MainHand');
assert.equal(mainHand.name,'Twilight Greatsword');
const skills=equipment.skill.skillList;
const stigmas=skills.filter(s=>s.category==='Dp');
assert.equal(stigmas.length,13,'13 Gladiator stigmas');
assert.ok(stigmas.every(s=>s.needLevel===22&&s.acquired===0),'Stigmas locked until Lv 22');
for(const name of ['Keen Strike','Rending Blow','Overhead Slam']){
  assert.equal(skills.find(s=>s.name===name)?.acquired,1,`${name} acquired at Lv 12`);
}
assert.equal(skills.find(s=>s.name==='Ruinous Blow').needLevel,14,'Ruinous Blow unlocks at Lv 14');
assert.ok(equipment.petwing.pet.name,'Equipped pet named');

const item=load('astrix285-item-mainhand');
assert.equal(item.id,mainHand.id);
assert.ok(item.mainStats.some(s=>s.name==='Critical Hit'),'Item main stats carry Critical Hit');

const board=load('astrix285-daevanion-11');
assert.ok(board.nodeList.length>0&&board.nodeList.every(n=>n.boardId===11),'Board 11 node grid');
assert.ok(board.nodeList.some(n=>n.effectList.length>0),'Nodes carry effect text');

console.log('AION 2 EU fixtures OK');
