import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterExoticCompatibleSubclasses,rankExoticSuperSynergy} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs';

const armourData=JSON.parse(await readFile(new URL('../data/armor-3-components.json',import.meta.url),'utf8'));
const gameData=JSON.parse(await readFile(new URL('../data/game-components.json',import.meta.url),'utf8'));
const prototype=JSON.parse(await readFile(new URL('../data/paradox-forge/beta/prototypes/PF-BETA-11-exotic-first.json',import.meta.url),'utf8'));
const armourRows=armourData.components||[];
const gameRows=gameData.components||[];
const armour=name=>armourRows.find(row=>row.name===name);
const game=hash=>gameRows.find(row=>Number(row.hash??row.bungieHash)===Number(hash));
const resolved=hash=>{
  const row=game(hash);
  assert.ok(row,`Real game component ${hash} must remain in the generated component catalogue.`);
  return {
    ...row,
    hash:Number(row.hash??row.bungieHash),
    bungieHash:Number(row.hash??row.bungieHash),
    description:row.officialDescription,
    source:'bungie-manifest',
    definition:{
      displayProperties:{name:row.name,description:row.officialDescription},
      itemTypeDisplayName:row.componentType,
      plug:{plugCategoryIdentifier:row.componentType}
    }
  };
};

const nothing=armour('Nothing Manacles');
const skull=armour('Skull of Dire Ahamkara');
assert.equal(nothing?.verified,true);
assert.equal(skull?.verified,true);
assert.equal(prototype.exotic.hash,3982932616,'The current Nothing Manacles identity must remain the real Build Forge test anchor.');

const scatter=resolved(1514173218);
const novaWarp=resolved(1656118680);
const novaVortex=resolved(1656118681);
const novaCataclysm=resolved(1656118682);
const chaosReach=resolved(1081893461);
const voidCandidate={
  hash:2849050827,bungieHash:2849050827,name:'Voidwalker',element:'void',source:'bungie-manifest',
  definition:{displayProperties:{name:'Voidwalker'},itemTypeDisplayName:'Subclass'},
  subclassBuild:{super:novaCataclysm,superOptions:[novaWarp,novaVortex,novaCataclysm],grenade:scatter,abilityOptionsBySocket:{grenade:[scatter]}}
};
const arcCandidate={
  hash:3168997075,bungieHash:3168997075,name:'Stormcaller',element:'arc',source:'bungie-manifest',
  definition:{displayProperties:{name:'Stormcaller'},itemTypeDisplayName:'Subclass'},
  subclassBuild:{super:chaosReach,superOptions:[chaosReach]}
};
const buildFor=(record,hash)=>({
  characterClass:'warlock',stats:[['Intellect',41]],
  forgeLoaderDecision:{
    buildAnchor:{name:record.name,perk:{hash,name:record.name,description:record.effect,source:'bungie-manifest'}},
    statDirective:{achieved:{super:37},priorities:{super:4}}
  }
});

const nothingBuild=buildFor(nothing,prototype.exotic.hash);
assert.deepEqual(
  filterExoticCompatibleSubclasses(nothingBuild,[arcCandidate,voidCandidate]).map(row=>row.element),
  ['void'],
  'Nothing Manacles must use its explicit real Scatter Grenade evidence to retain Voidwalker.'
);
const nothingReport=rankExoticSuperSynergy(nothingBuild,[voidCandidate]);
assert.equal(nothingReport.status,'no-direct-super-synergy');
assert.equal(nothingReport.entries.length,3);
assert.ok(nothingReport.entries.every(row=>row.score===0&&row.rank===null&&row.recommended===false));
assert.ok(nothingReport.entries.every(row=>row.limitation.includes('No genuine Super synergy')));
assert.ok(nothingReport.entries.every(row=>row.context[0].value===37&&row.context[0].priority===4));

const skullBuild=buildFor(skull,3050017626);
const skullReport=rankExoticSuperSynergy(skullBuild,[voidCandidate]);
const cataclysm=skullReport.entries.find(row=>row.superHash===1656118682);
const vortex=skullReport.entries.find(row=>row.superHash===1656118681);
const warp=skullReport.entries.find(row=>row.superHash===1656118680);
assert.equal(skullReport.status,'evidenced');
assert.equal(cataclysm.rank,1);
assert.equal(vortex.rank,1);
assert.equal(cataclysm.recommended,true);
assert.equal(vortex.recommended,true);
assert.ok(cataclysm.evidence.some(row=>row.code==='exotic-explicit-super'&&row.sourceText===skull.effect));
assert.ok(vortex.evidence.some(row=>row.code==='exotic-explicit-super'&&row.sourceText===skull.effect));
assert.ok(warp.score>0&&warp.score<cataclysm.score,'The general Devour Super energy clause may support Nova Warp, but must not outrank the explicitly named Nova Bomb family.');
assert.equal(warp.recommended,false);

console.log('FORGE_REAL_EXOTIC_SUPER_SYNERGY=PASS');
console.log('FORGE_NO_INVENTED_SUPER_RANKING=PASS');
