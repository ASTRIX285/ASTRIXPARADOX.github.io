import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,copyFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {footerErrors,footerRuleFor,loadFooterRules} from './footer-rules.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const FOOTER='Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.';
// Each game folder supplies its own footer lines (astrix-app/games/<game>/footer.json, see footer-rules.mjs).
const rules=loadFooterRules(root);
assert.ok(rules.find(rule=>rule.default)?.lines.includes(FOOTER),'Destiny is the default footer and keeps the Bungie line');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(path=>path.endsWith('.html'));
let checked=0;
const byGame={};
for(const path of new Set(files)){
  const text=readFileSync(new URL(path,new URL('../../',import.meta.url)),'utf8');
  // Verification tokens and embeddable component fragments are not pages.
  if(/^google-site-verification:/.test(text.trim())||path.includes('/components/'))continue;
  checked++;
  const errors=footerErrors(path,text,rules);
  assert.deepEqual(errors,[],errors.join('\n'));
  const game=footerRuleFor(path,rules).game;
  byGame[game]=(byGame[game]??0)+1;
}
// Clips footer fix: pages/clips.html is the template; run the workflow's builder on a copy
// (cards block only, no API requests) and check what it writes.
const clipsCopy=join(mkdtempSync(join(tmpdir(),'clips-footer-')),'clips.html');
copyFileSync(new URL('pages/clips.html',new URL('../../',import.meta.url)),clipsCopy);
execFileSync('python3',['-B','scripts/build_clips.py','--reuse-cards','--page',clipsCopy],{cwd:root,stdio:'pipe'});
const generated=readFileSync(clipsCopy,'utf8');
assert.ok([...generated.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].some(match=>match[1].includes(FOOTER)),'Clips generator must retain Bungie attribution');
// The generator must not reset the stylesheet version tags that the site pages carry.
const tagOf=(html,file)=>{const match=html.match(new RegExp(`href="[^"]*${file}[?]v=([^"]+)"`));assert.ok(match,`${file} tag missing`);return match[1]};
const read=path=>readFileSync(new URL(path,new URL('../../',import.meta.url)),'utf8');
for(const file of ['style.css','astrix-palette.css']){
  const current=tagOf(read('pages/news.html'),file);
  assert.equal(tagOf(generated,file),current,`Clips generator uses the current ${file} tag`);
  assert.equal(tagOf(read('pages/clips.html'),file),current,`Committed clips page uses the current ${file} tag`);
}
assert.ok(checked>0);
console.log(`BUNGIE_FOOTER=PASS (${checked} pages: ${Object.entries(byGame).map(([game,count])=>`${game} ${count}`).join(', ')})`);
