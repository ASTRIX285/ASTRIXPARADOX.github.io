// Proves the per-game footer rule: Destiny pages keep the Bungie line; Division pages carry
// the Ubisoft text word for word and never the Bungie line.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {footerErrors,footerRuleFor,loadFooterRules} from './footer-rules.mjs';

const rules=loadFooterRules(fileURLToPath(new URL('../../',import.meta.url)));
const destiny=rules.find(rule=>rule.game==='destiny-2');
const division=rules.find(rule=>rule.game==='division');
const BUNGIE='Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.';
const UBISOFT=[
  "ASTRIX PARADOX WorkBench is an unofficial fan-made tool. It is not affiliated with, endorsed by or sponsored by Ubisoft or Massive Entertainment. Tom Clancy's The Division, The Division 2 and related names are trademarks of Ubisoft Entertainment.",
  'Game data is gathered by hand from official Ubisoft posts and in-game checks. Every value shows its source and game version.'
];
assert.deepEqual(destiny?.lines,[BUNGIE],'Destiny supplies the Bungie line');
assert.equal(destiny.default,true,'Destiny covers every page no other game claims');
assert.deepEqual(division?.lines,UBISOFT,'Division supplies the two Ubisoft lines, word for word');
assert.ok(!/[\u2013\u2014]/.test(JSON.stringify(rules)),'No en or em dashes in footer text');

const page=(...lines)=>`<html><body><main></main><footer>${lines.map(line=>`<p>${line.replace(/'/g,'&#39;')}</p>`).join('')}</footer></body></html>`;
const ok=(path,html,name)=>assert.deepEqual(footerErrors(path,html,rules),[],name);
const bad=(path,html,expected,name)=>assert.ok(footerErrors(path,html,rules).some(error=>error.includes(expected)),name);

assert.equal(footerRuleFor('astrix-app/pages/reports/index.html',rules).game,'destiny-2');
assert.equal(footerRuleFor('pages/news.html',rules).game,'destiny-2');
assert.equal(footerRuleFor('hub/index.html',rules).game,'destiny-2','The Hub stays a Destiny-footer page');
assert.equal(footerRuleFor('hub/workbench/td2/index.html',rules).game,'division');

ok('astrix-app/pages/reports/index.html',page(BUNGIE),'Destiny page with the Bungie line passes');
bad('astrix-app/pages/reports/index.html',page('Something else'),'destiny-2 footer line missing','Destiny page without the Bungie line fails');
bad('astrix-app/pages/reports/index.html',page(BUNGIE,...UBISOFT),'carries the division footer line','Destiny page carrying the Ubisoft text fails');
bad('astrix-app/pages/reports/index.html','<html><body></body></html>','footer missing','A page with no footer fails');

ok('hub/workbench/td2/index.html',page(...UBISOFT),'Division page with the Ubisoft text passes');
bad('hub/workbench/td2/index.html',page(...UBISOFT,BUNGIE),'carries the destiny-2 footer line','Division page carrying the Bungie line fails');
bad('hub/workbench/td2/index.html',page(UBISOFT[0]),'division footer line missing','Division page missing a line fails');
bad('hub/workbench/td2/index.html',page(UBISOFT[0].replace('sponsored','supported'),UBISOFT[1]),'division footer line missing','Division page with altered wording fails');
bad('hub/workbench/td3/index.html',page(BUNGIE),'division footer line missing','Any future WorkBench page is a Division page');

console.log('GAME_FOOTERS_SELFTEST=PASS Destiny keeps Bungie, Division carries the Ubisoft text and never Bungie');
