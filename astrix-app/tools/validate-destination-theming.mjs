import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=read('astrix-destinations.css');
const controller=read('shared/astrix-destination-theme.js');
const mainHtml=read('pages/guardian-workspace-v2/index.html');
const mainControls=read('pages/guardian-workspace-v2/guardian-beta-readiness.mjs');
const buildHtml=read('pages/guardian-workspace-v2/paradox-build-space/index.html');
const buildControls=read('pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs');

const keys=['pale-heart','europa','dreaming-city','edz','cosmodrome','moon','neomuna','nessus','throne-world','tower'];
assert.match(css,/:root\s*\{[^}]*--loc:#5fa8e6;[^}]*--loc-2:#8fd0ff/,'default atmosphere must remain blue');
keys.forEach(key=>assert.match(css,new RegExp(`html\\[data-location="${key}"\\]`),`missing ${key} colour token`));
assert.match(css,/26%,transparent/,'supplied restrained primary glow must remain intact');
assert.match(css,/12%,transparent/,'supplied restrained secondary glow must remain intact');
assert.doesNotMatch(css,/url\s*\(/i,'destination layer must not introduce map imagery');
assert.doesNotMatch(css,/\.(?:panel|topbar|primary|eq|button)[\s:{]/,'destination layer must not recolour core UI components');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/,'reduced-motion handling is required');
assert.match(css,/250ms/,'destination changes must use the briefed smooth transition');

for(const [name,html] of [['Main',mainHtml],['Build Space',buildHtml]]){
  const tokens=html.indexOf('astrix-tokens.css');
  const destinations=html.indexOf('astrix-destinations.css');
  assert.ok(tokens>=0&&destinations>tokens,`${name} must link destination CSS after astrix-tokens.css`);
  assert.match(html,/astrix-destination-theme\.js/,`${name} must load the shared destination controller`);
}
assert.match(mainControls,/id="betaDestination"/,'Main Change Activity flow must expose the destination dropdown');
assert.match(mainControls,/ForgeDestinations/,'Main must use the shared destination mapping');
assert.match(buildHtml,/id="expectedDestination"/,'Build Space must expose the destination dropdown');
assert.match(buildControls,/expectedDestination/,'Build Space must wire destination selection');
assert.match(buildControls,/ForgeDestinations/,'Build Space must use the shared destination mapping');

const storage=new Map();
const root={dataset:{},removeAttribute(name){if(name==='data-location')delete this.dataset.location;}};
const context={
  document:{documentElement:root,dispatchEvent(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  CustomEvent:class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
};
vm.runInNewContext(controller,context);
const api=context.ForgeDestinations;
assert.equal(api.DESTINATIONS.length,10,'shared controller must expose exactly the ten briefed destinations');
assert.deepEqual(Array.from(api.DESTINATIONS,destination=>destination.key),keys,'destination mapping order or keys drifted');
assert.equal(api.set('The Pale Heart'),'pale-heart');
assert.equal(root.dataset.location,'pale-heart');
assert.equal(api.set('The Glassway'),'europa','known in-app destination aliases must map deterministically');
assert.equal(root.dataset.location,'europa');
assert.equal(api.set('not-a-real-destination'),'','unknown destinations must use the default blue atmosphere');
assert.equal(root.dataset.location,undefined,'unknown destinations must not leave a warm data-location active');

console.log('DESTINATION_THEME_TOKENS=PASS');
console.log('DESTINATION_THEME_SHARED_MAPPING=PASS');
console.log('DESTINATION_THEME_MAIN_BUILD_PARITY=PASS');
console.log('DESTINATION_THEME_RESTRAINT=PASS');
