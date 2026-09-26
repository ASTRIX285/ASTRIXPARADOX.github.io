import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`,'utf8');
const gloss=read('astrix-app/shared/astrix-gloss-controls.css');
const palette=read('css/astrix-palette.css');
const heroCss=read('astrix-app/shared/astrix-hero-cards.css');
const glossCode=gloss.replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...glossCode.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map(match=>({selector:match[1].trim(),body:match[2].trim()}));

// The gloss layer is declared before every other button layer, so its important rules win.
assert.match(palette,/^[\s\S]*?\*\/\s*@layer astrix-gloss, astrix-ribbon-buttons, astrix-button-tiers;/,'Palette must declare the gloss layer first');
assert.match(gloss,/@layer astrix-gloss\s*\{/,'Gloss rules must live in the astrix-gloss layer');

// Reference component and stroke geometry from the approved mock.
assert.match(gloss,/\.apx-gloss\{[^}]*min-height:36px;padding:0 20px/,'.apx-gloss reference rule is present');
assert.match(gloss,/padding:3px 1px 1px 3px/,'Control stroke ring uses padding 3px 1px 1px 3px');
assert.match(gloss,/linear-gradient\(135deg,transparent 0%,var\(--c-hi\) 8%,var\(--c\) 22%/,'Control stroke uses the 135deg crimson gradient');
assert.match(gloss,/animation:apx-flow 2\.8s ease-in-out infinite/,'Pulse runs every 2.8s');
assert.match(gloss,/animation-duration:1\.4s/,'Pulse runs every 1.4s on hover');

// Two tiers. FULL (stroke and flowing pulse) is an allow-list; every other control is QUIET by default.
const strokeRule=rules.find(rule=>/::before$/.test(rule.selector)&&/linear-gradient\(135deg,transparent 0%/.test(rule.body));
const pulseRule=rules.find(rule=>/::after$/.test(rule.selector)&&/animation:apx-flow 2\.8s ease-in-out infinite/.test(rule.body)&&/padding:3px 1px 1px 3px/.test(rule.body));
assert.ok(strokeRule&&pulseRule,'Stroke and pulse rules are present');
const allowList=selector=>{
  const tail=selector.replace(/::(?:before|after)$/,'').replace(/:not\(\.improve-cta\)$/,'');
  assert.ok(tail.endsWith(')'),'Stroke selector ends with the FULL allow-list');
  let depth=0,start=-1;
  for(let index=tail.length-1;index>=0;index--){
    if(tail[index]===')')depth++;
    if(tail[index]==='('){depth--;if(depth===0){start=index;break;}}
  }
  assert.ok(tail.slice(start-3,start)===':is','The FULL allow-list is the last :is() group');
  return tail.slice(start+1,-1).split(',').map(item=>item.trim());
};
for(const rule of [strokeRule,pulseRule]){
  const full=allowList(rule.selector);
  for(const expected of ['.apx-destination-ribbon a','.nav-links a','#applyBuild','.btn-primary','.hero-cta .btn-secondary','#armRangeTest','.bungie-auth-btn','[role="tab"]','.test-domain-tabs button','.filter-btn','.news-filter']){
    assert.ok(full.includes(expected),`FULL tier includes ${expected}`);
  }
  for(const quiet of ['button','[role="button"]','.apx-gloss','.game-card-btn','.nav-toggle','.clip-modal-close','.trailer-modal-close','.tools-mission-close','.tools-mission-trigger','.universe-pill','.btn-secondary','.btn-facebook','.stream-actions a','.expand-btn','.manual-edit-btn','#saveParadoxBuild','#restoreOriginal']){
    assert.ok(!full.includes(quiet),`QUIET controls are not in the FULL allow-list: ${quiet}`);
  }
}
const controlRings=rules.filter(rule=>/padding:3px 1px 1px 3px/.test(rule.body));
assert.equal(controlRings.length,3,'Only the FULL stroke ring, the pulse and the Improve combined ring use the control ring padding');
for(const ring of controlRings)assert.match(ring.body,/padding:3px 1px 1px 3px!important/,'Ring padding is important so the unlayered *::before reset cannot flatten the stroke');
const quietHover=rules.find(rule=>/:not\(:is\(/.test(rule.selector)&&/:hover/.test(rule.selector)&&/--apx-gloss-crimson-edge/.test(rule.body));
assert.ok(quietHover,'QUIET controls get a faint crimson edge on hover');
assert.doesNotMatch(quietHover.body,/animation|linear-gradient/,'QUIET hover adds no stroke gradient or animation');

// Selected and primary controls have no stroke and no pulse.
const noStroke=rules.find(rule=>rule.body==='display:none'&&/\[aria-current="page"\]/.test(rule.selector)&&/::before/.test(rule.selector)&&/::after/.test(rule.selector));
assert.ok(noStroke,'Selected controls must hide the stroke and the pulse');

// Mapped controls keep their own geometry: only the finish changes.
const mapped=rules.find(rule=>/^:is\(\.apx-gloss,body\[data-apx-button-system\]/.test(rule.selector)&&/translate .15s/.test(rule.body));
assert.ok(mapped,'Mapped control finish rule is present');
for(const property of ['padding','margin','min-height','min-width','width','height','display','font-size','letter-spacing','line-height','top','left','right','bottom']){
  assert.doesNotMatch(mapped.body,new RegExp(`(^|;)\s*${property}\s*:`),`Mapped controls must not change ${property}`);
}

// Not applied to the Forge Loader page, the recommendation controls or the loader gate.
for(const excluded of [':not(.forge-loader-page)','.recommendation-panel *','.recommended-build-reveal *','#forgeGenerationLoader *','.apx-gate *']){
  assert.ok(gloss.includes(excluded),`Gloss must exclude ${excluded}`);
}

// Hero cards: frame only.
const heroRing=rules.find(rule=>/\.guardian-character-card__head::before/.test(rule.selector)&&/\.guardian-character-card__head::after/.test(rule.selector)&&/padding:/.test(rule.body));
assert.ok(heroRing,'Hero card stroke ring is present');
const padding=heroRing.body.match(/padding:([^;]+)/)[1].trim().split(/\s+/);
assert.deepEqual(padding,['.5px','0','1.5px','3px'],'Hero card ring padding is 0.5px top, 0 right, 1.5px bottom, 3px left');
assert.equal(padding[0],'.5px','Every hero card stroke top width is 0.5px');
assert.match(gloss,/\.guardian-character-card__head::before\{\s*background:linear-gradient\(100deg/,'Hero stroke gradient runs from the left');
assert.match(gloss,/\.guardian-character-card__head::after\{[^}]*animation:apx-flow 2\.8s ease-in-out infinite/,'Hero pulse runs every 2.8s');
assert.match(gloss,/prefers-reduced-motion:reduce\)\{\.guardian-character-card__head::after\{animation:none!important/,'Hero pulse stops for reduced motion');
const heroRules=rules.filter(rule=>/^(?:html body|body) .*\.guardian-character-card(?!__)/.test(rule.selector));
assert.ok(heroRules.length>=2,'Hero card rules are present');
for(const rule of heroRules){
  assert.doesNotMatch(rule.body,/gloss-fill|crimson|glow|gradient|rgb\(/,`Hero card rule must add no fill, tint or glow: ${rule.selector.slice(0,60)}`);
  assert.doesNotMatch(rule.selector,/\.guardian-character-card(?!\.is-selected::after)(?:\.is-selected)?::before/,'Hero card emblem layer must stay untouched');
}
const selectedRule=rules.find(rule=>/\.guardian-character-card\.is-selected::after/.test(rule.selector));
assert.equal(selectedRule.body,'background:none!important;opacity:0!important','Selected hero card loses its red tint');
const shadowRule=rules.find(rule=>/\.guardian-character-card\.is-selected\{/.test(rule.selector+'{')&&/box-shadow:none/.test(rule.body));
assert.ok(shadowRule,'Hero cards have no glow');

// The equipped emblem art is still drawn by the card itself, exactly as before.
assert.match(heroCss,/\.guardian-character-card::before\{[^}]*var\(--character-emblem\)/,'Hero cards still show the equipped emblem');
assert.match(heroCss,/\.guardian-character-card\.is-selected::before\{opacity:1;filter:none\}/,'Selected hero card keeps its full emblem');

// Miguel's decision (26 Sep 2026): only selected items are red.
const crimsonFills=rules.filter(rule=>/background-color:var\(--apx-colour-action\)/.test(rule.body));
assert.equal(crimsonFills.length,2,'Only the selected-state rule and the ribbon selected-tab rule may fill a control crimson');
for(const fill of crimsonFills){
 const states=fill.selector.slice(fill.selector.lastIndexOf(':is('));
 const required=fill===crimsonFills[0]?['[aria-current="page"]','[aria-selected="true"]','[aria-pressed="true"]','.is-active','.nav-links a.active']:['[aria-current="page"]'];
 for(const state of required)assert.ok(states.includes(state),`Crimson fill applies to ${state}`);
 for(const primary of ['.is-primary','.btn-primary','.improve-cta','#applyBuild','#arm','.bungie-auth-btn'])assert.ok(!states.includes(primary),`Crimson fill does not apply to unselected ${primary}`);
}

// The FULL stroke must be visible: opaque bright crimson near the top-left corner, thick enough to see.
const visibleStroke=rules.find(rule=>/::before$/.test(rule.selector)&&/padding:3px 1px 1px 3px/.test(rule.body)&&/linear-gradient\(135deg/.test(rule.body));
assert.ok(visibleStroke,'FULL stroke ring rule is present');
assert.match(visibleStroke.body,/linear-gradient\(135deg,transparent 0%,var\(--c-hi\) 8%,var\(--c\) 22%/,'Stroke is bright crimson at the top-left corner');
assert.match(visibleStroke.body,/z-index:-1/,'Stroke sits above the button background inside its own stacking context');
const tokens=read('astrix-app/shared/astrix-design-v2.css');
const hi=tokens.match(/--apx-gloss-crimson-hi:\s*#([0-9a-f]{6})/i);
assert.ok(hi&&parseInt(hi[1].slice(0,2),16)>=200&&parseInt(hi[1].slice(2,4),16)<=100,'Top-left stroke colour has a clear crimson component (red >= 200, green <= 100)');
console.log('GLOSS_CONTROLS=PASS two tiers (FULL allow-list, QUIET default), mapped controls keep geometry, hero cards frame only, top stroke 0.5px, red means selected only, FULL stroke visible');
