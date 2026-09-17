import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(process.argv[2]||new URL('../pages/journey/journey-2560-visual.css',import.meta.url),'utf8');
function declarations(selector){
  const matches=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,name])=>name.trim()===selector);
  assert.equal(matches.length,1,`${selector} must retain its own single rule`);
  return Object.fromEntries(matches[0][2].split(';').filter(value=>value.trim()).map(value=>{
    const colon=value.indexOf(':');
    return [value.slice(0,colon).trim(),value.slice(colon+1).trim()];
  }));
}
for(const family of ['triumph','vault']){
  const total=declarations(`.journey-page .journey-${family}-total`);
  assert.ok(total.padding,'Total must retain its padding');
  const breakdown=declarations(`.journey-page .journey-${family}-breakdown`);
  assert.equal(breakdown.display,'grid');
  assert.ok(breakdown['grid-template-columns']);
  const value=declarations(`.journey-page .journey-${family}-total strong`);
  assert.equal(value['grid-template-columns'],undefined,'Breakdown rules must not merge into the total value');
}
const layout=declarations('.journey-page .journey-usage-layout');
assert.equal(layout['grid-template-columns'],'minmax(0,1fr)');
assert.equal(layout.width,undefined,'The enclosing layout must not inherit the chart width');
assert.equal(layout.height,undefined,'The enclosing layout must not inherit the chart height');
assert.equal(layout['border-radius'],undefined,'The enclosing layout must not inherit the circular chart shape');
const chart=declarations('.journey-page .journey-usage-chart');
assert.equal(chart.position,'relative','The chart must contain its absolute inner circle');
assert.equal(chart.width,'7rem');
assert.equal(chart.height,chart.width);
assert.equal(chart['border-radius'],'50%');
assert.match(chart.background,/^conic-gradient/);
assert.doesNotMatch(css,/\d+\.\d+\.\d+/,'Font values must not contain multiple decimal points');
console.log('JOURNEY_SUMMARY_RULE_BOUNDARIES=PASS');
