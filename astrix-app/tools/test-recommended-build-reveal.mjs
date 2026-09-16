#!/usr/bin/env node
import assert from 'node:assert/strict';
import {revealRecommendedBuild,weaponCombinationsMarkup} from '../pages/guardian-workspace-v2/paradox-build-space/recommended-build-reveal.mjs';
import {comboRecommendation} from './validate-paradox-build-space.mjs';

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
assert.match(combinationsHtml,/OWNED WEAPON COMBINATIONS/);
assert.equal((combinationsHtml.match(/data-weapon-combination=/g)||[]).length,3,'All three alternatives must be selectable in the review.');
for(const combo of comboRecommendation.combinations)for(const weapon of combo.weapons)assert.ok(combinationsHtml.includes(weapon.name),'Each alternative must name all three owned weapons.');
assert.match(combinationsHtml,/recalculates Artifact picks, armour mods and perk advice/);
assert.doesNotMatch(weaponCombinationsMarkup({...comboRecommendation,combinations:[{...comboRecommendation.combinations[0],weapons:[{name:'<script>bad</script>',icon:'javascript:alert(1)'}]}]}),/<script>|javascript:/,'Item evidence must be escaped and image URLs restricted.');
assert.match(weaponCombinationsMarkup(),/No complete owned weapon alternatives/);
console.log('OWNED_WEAPON_COMBINATIONS_REVIEW=PASS');
