import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const FOOTER='Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(path=>path.endsWith('.html'));
let checked=0;
for(const path of new Set(files)){
  const text=readFileSync(new URL(path,new URL('../../',import.meta.url)),'utf8');
  // Verification tokens and embeddable component fragments are not pages.
  if(/^google-site-verification:/.test(text.trim())||path.includes('/components/'))continue;
  checked++;
  assert.match(text,/<footer\b[^>]*>[\s\S]*?<\/footer>/i,`${path}: footer missing`);
  assert.ok([...text.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].some(match=>match[1].includes(FOOTER)),`${path}: Bungie attribution missing`);
}
// Clips footer fix: exercise the workflow's real template without API requests.
const generated=execFileSync('python3',['-B','-c','from scripts.build_clips import build_html; print(build_html([], 0))'],{cwd:root,encoding:'utf8'});
assert.ok([...generated.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].some(match=>match[1].includes(FOOTER)),'Clips generator must retain Bungie attribution');
assert.ok(checked>0);
console.log(`BUNGIE_FOOTER=PASS (${checked} pages)`);
