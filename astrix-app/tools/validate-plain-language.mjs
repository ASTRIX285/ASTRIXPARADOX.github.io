// Prompt 19: strict copy scan; machine identifiers and resource URLs are excluded.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {bannedCopy,visibleCopySegments} from './plain-language-copy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(resolve(directory,entry.name)):[resolve(directory,entry.name)]);
const violations=[];
for(const file of ['pages','shared'].flatMap(name=>walk(resolve(root,'astrix-app',name))).filter(file=>/\.(?:html|mjs|js|css)$/.test(file))){
  const source=readFileSync(file,'utf8');
  for(const row of visibleCopySegments(file,source))if(bannedCopy.test(row.text))violations.push(`${relative(root,file)}:${source.slice(0,row.start).split('\n').length}: ${row.text.trim()}`);
}
assert.deepEqual(violations,[],'Prompt 19: banned wording remains in user-facing copy');
const matches=(file,source)=>visibleCopySegments(file,source).filter(row=>bannedCopy.test(row.text)).map(row=>row.text);
assert.deepEqual(matches('fixture.html','<span class="verified" id="owned" data-evidence="true" title="Verified item">Owned gear</span><script src="./evidence.mjs?verified=1"></script>'),['Verified item','Owned gear']);
assert.deepEqual(matches('fixture.mjs','const owned=true; const state="verified"; const url="./evidence.mjs?v=verified"; node.className="owned evidence"; node.textContent="Verified gear";'),['Verified gear']);
assert.deepEqual(matches('fixture.mjs','const html=`<span class="${owned?"is-owned":""}" aria-label="Owned gear">Verified ${item.name}</span>`;'),['Owned gear','Verified ']);
assert.deepEqual(matches('fixture.mjs','node.textContent="Verified " + name;'),['Verified ']);
assert.deepEqual(matches('fixture.html','<script>node.textContent="Owned gear";</script>'),['Owned gear']);
assert.deepEqual(matches('fixture.css','.owned{content:"Verified";background:url("evidence.png")}'),['Verified']);
for(const word of ['verified','owned','authenticated','authoritative','evidence','ownership','real account','real equipped','live Bungie','fresh Bungie','verification','authentication']){
  assert.deepEqual(matches('fixture.html',`<p>${word.toUpperCase()}</p>`),[word.toUpperCase()]);
  assert.deepEqual(matches('fixture.mjs',`node.textContent=${JSON.stringify(word)};`),[word]);
}
assert.equal(bannedCopy.test('LIVE\n BUNGIE'),true);
assert.equal(bannedCopy.test('unownedness'),false,'Whole words only');
assert.deepEqual(matches('fixture.html','<div aria-description="Verified item" aria-valuetext="Owned gear"></div>'),['Verified item','Owned gear']);
const report=JSON.parse(readFileSync(resolve(root,'astrix-app/docs/plain-language-copy.json'),'utf8'));
assert.equal(report.prompt,19);assert.ok(report.changes.length>0);
for(const row of report.changes){assert.ok(row.file&&typeof row.before==='string'&&typeof row.after==='string');assert.notEqual(row.before,row.after);assert.equal(bannedCopy.test(row.after),false,`${row.file}: replacement copy`);}
console.log(`PLAIN_LANGUAGE=PASS ${report.changes.length} documented replacements; HTML, accessible labels, templates, script copy and generated CSS checked`);
