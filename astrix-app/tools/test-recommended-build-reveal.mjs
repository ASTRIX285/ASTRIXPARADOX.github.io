#!/usr/bin/env node
// Prompt 19: expected visible copy and resource tags updated; assertion coverage unchanged.
import assert from 'node:assert/strict';
import {revealRecommendedBuild,weaponCombinationsMarkup} from '../pages/guardian-workspace-v2/paradox-build-space/recommended-build-reveal.mjs';
import {comboRecommendation} from './validate-paradox-build-space.mjs';
import {recommendedBuildCopy} from '../pages/guardian-workspace-v2/paradox-build-space/recommended-build-copy.mjs';

// Synthetic descriptions exercise the evidence gates, not Destiny gameplay facts.
const copyFixture={characterClass:'WARLOCK',recommendationElement:'VOID',objective:'ability-uptime',activityContext:{key:'pve'},
  forgeLoaderDecision:{buildAnchor:{name:'Fixture Exotic',perk:{name:'Fixture perk',description:'Supports Fixture Grenade.'}}},
  subclassBuild:{abilities:[{hash:123,name:'Fixture Grenade',description:'Fixture effect text.'}]},
  forgeIntelligence:{decisions:[{componentHash:123,evidenceStatus:'verified-match',reasons:[{code:'exotic-anchor-exact-ability',evidence:{sourceKind:'selected Exotic armour'}}]}]},
  weaponSelectionRecommendation:{source:'bungie-owned-exact-weapon-instances',inventoryScope:'vault-character-and-equipped',legalCombinationCount:2800000}};
const unchanged=structuredClone(copyFixture),copy=recommendedBuildCopy(copyFixture);
assert.deepEqual(copyFixture,unchanged,'Copy cannot mutate the build or diagnostic evidence');
assert.equal(copy.scale,'Checked 2.8 million combinations of the weapons you own');
assert.equal(copy.subtitle,'Warlock · void · ability uptime · PvE · Fixture Exotic');
assert.equal(copy.bullets[0],'Built around Fixture Exotic. Its perk, Fixture perk: Supports Fixture Grenade.');
assert.equal(copy.bullets[1],'Fixture Exotic supports Fixture Grenade. Fixture effect text.');
assert.doesNotMatch(copy.bullets.join(' '),/returns faster|nothing you own beat|\u2014/);
const missing=structuredClone(copyFixture);delete missing.forgeLoaderDecision.buildAnchor.perk.description;
missing.forgeEvidence={excludedFromEvidenceScore:['forgeLoaderDecision.buildAnchor.perk.description']};
assert.deepEqual(recommendedBuildCopy(missing).bullets,["We couldn't read this Exotic's perk text, so it wasn't used to rank the build."]);
delete missing.forgeEvidence;assert.doesNotMatch(recommendedBuildCopy(missing).bullets[0],/wasn't used/,'Do not assert exclusion without the run evidence');
const keywords=structuredClone(copyFixture);keywords.forgeIntelligence.decisions[0].reasons=[{code:'mechanic:grenade',evidence:{token:'grenade'}}];
assert.equal(recommendedBuildCopy(keywords).bullets.length,1,'Shared tokens cannot fabricate a causal loop');
const stale=structuredClone(copyFixture);stale.subclassBuild.abilities=[];assert.equal(recommendedBuildCopy(stale).bullets.length,1,'Evidence must refer to the selected component');
const many=structuredClone(copyFixture);many.forgeIntelligence.decisions=Array(5).fill(many.forgeIntelligence.decisions[0]);assert.ok(recommendedBuildCopy(many).bullets.length<=3);
for(const count of [undefined,null,'2800000',NaN,-1,1.2,Number.MAX_SAFE_INTEGER+1])assert.equal(recommendedBuildCopy({...copyFixture,weaponSelectionRecommendation:{...copyFixture.weaponSelectionRecommendation,legalCombinationCount:count}}).scale,'');
assert.equal(recommendedBuildCopy({...copyFixture,weaponSelectionRecommendation:{...copyFixture.weaponSelectionRecommendation,legalCombinationCount:2800001}}).scale,'Checked 2.800001 million combinations of the weapons you own');
assert.equal(recommendedBuildCopy({...copyFixture,weaponSelectionRecommendation:{...copyFixture.weaponSelectionRecommendation,legalCombinationCount:1,inventoryScope:'equipped-fallback'}}).scale,'Checked 1 combination of your equipped weapons');

function harness(){
  const order=[];
  const dialog={hidden:true,setAttribute:(name,value)=>order.push(`attribute:${name}:${value}`)};
  const body={classList:{add:value=>order.push(`class:${value}`)}};
  const focusTarget={focus:()=>order.push('focus')};
  return {order,dialog,body,focusTarget};
}

{
  const state=harness();
  const result=await revealRecommendedBuild({build:{},dialog:state.dialog,body:state.body});
  assert.deepEqual(result,{opened:false,renderError:null});
  assert.equal(state.dialog.hidden,true);
}

{
  const state=harness(),build={recommendationGeneratedAt:'2026-09-06T00:00:00.000Z'};
  const result=await revealRecommendedBuild({
    build,
    dialog:state.dialog,
    body:state.body,
    paint:()=>{state.order.push('paint');assert.equal(state.dialog.hidden,false);},
    renderReview:value=>{state.order.push('render');assert.equal(value,build);assert.equal(state.dialog.hidden,false);},
    focusTarget:state.focusTarget
  });
  assert.equal(result.opened,true);
  assert.equal(result.renderError,null);
  assert.deepEqual(state.order,['attribute:aria-hidden:false','class:recommended-build-open','paint','render','focus']);
}

{
  const state=harness(),expected=new Error('real profile shape rejected'),failures=[];
  const result=await revealRecommendedBuild({
    build:{recommendationGeneratedAt:'2026-09-06T00:00:00.000Z'},
    dialog:state.dialog,
    body:state.body,
    renderReview:()=>{state.order.push('render');throw expected;},
    onRenderError:error=>{state.order.push('error');failures.push(error);},
    focusTarget:state.focusTarget
  });
  assert.equal(result.opened,true);
  assert.equal(result.renderError,expected);
  assert.equal(state.dialog.hidden,false);
  assert.deepEqual(failures,[expected]);
  assert.deepEqual(state.order,['attribute:aria-hidden:false','class:recommended-build-open','render','error','focus']);
}

console.log('RECOMMENDED_BUILD_REVEAL=PASS');
console.log('RECOMMENDED_BUILD_RENDER_FAILURE_VISIBLE=PASS');
const combinationsHtml=weaponCombinationsMarkup(comboRecommendation);
assert.match(combinationsHtml,/WEAPON COMBINATIONS/);
assert.equal((combinationsHtml.match(/data-weapon-combination=/g)||[]).length,3,'All three alternatives must be selectable in the review.');
for(const combo of comboRecommendation.combinations)for(const weapon of combo.weapons)assert.ok(combinationsHtml.includes(weapon.name),'Each alternative must name all three owned weapons.');
assert.match(combinationsHtml,/recalculates Artifact picks, armour mods and perk advice/);
assert.doesNotMatch(weaponCombinationsMarkup({...comboRecommendation,combinations:[{...comboRecommendation.combinations[0],weapons:[{name:'<script>bad</script>',icon:'javascript:alert(1)'}]}]}),/<script>|javascript:/,'Item evidence must be escaped and image URLs restricted.');
assert.match(weaponCombinationsMarkup(),/No complete weapon alternatives/);
console.log('OWNED_WEAPON_COMBINATIONS_REVIEW=PASS');
