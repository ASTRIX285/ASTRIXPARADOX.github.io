#!/usr/bin/env node
// Every Aetherium Guide page carries its facts in its own HTML (feature/aetherium-guide-static-facts, 24 Oct 2026), up to
// date with what the page draws, so a crawler that runs no JavaScript reads the same facts a visitor sees.
// Fix a failure with:  node astrix-app/tools/build-aetherium-facts.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {factsBlock, plan, withBlock} from './build-aetherium-facts.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/* The block shape, without a browser: escaped text, lists grouped, a second run replaces rather than adds. */
const block = factsBlock({title: 'Stones & <cards>', description: 'Plain words.', items: [{kind: 'h2', text: 'A'}, {kind: 'li', text: 'one'}, {kind: 'li', text: 'one'}, {kind: 'row', text: 'two, 2'}, {kind: 'p', text: 'end'}]});
assert.equal(block, '<div class="ae-sr" data-static-facts><!-- facts:start --><h1>Stones &amp; &lt;cards&gt;</h1><p>Plain words.</p><h2>A</h2><ul><li>one</li><li>two, 2</li></ul><p>end</p><!-- facts:end --></div>');
const page = '<div id="aeStage"><p class="ae-sr">Opening the Guide.</p></div>';
assert.equal(withBlock(withBlock(page, block), block), withBlock(page, block), 'Writing twice leaves one block');

/* Every Guide page, drawn in Chromium and compared with its HTML. */
const writes = await plan();
assert.deepEqual([...writes.keys()].map(file => relative(root, file)), [], 'Guide pages whose facts are out of date. Run: node astrix-app/tools/build-aetherium-facts.mjs');

/* The pages a crawler most needs say what they are about. */
for (const [path, words] of [['equipment/theostones', /Unique Stun Theostone/], ['classes/gladiator', /Builds by role/], ['dungeons/krao-cave', /Conquest, 45, 700\+/]]) {
  const html = await readFile(resolve(root, `hub/aetherium/guide/${path}/index.html`), 'utf8');
  const facts = /<!-- facts:start -->([\s\S]*?)<!-- facts:end -->/.exec(html)?.[1] ?? '';
  assert.match(facts, words, `${path}: its key facts are in the HTML`);
  assert.ok(!/[–—]|undefined|NaN/.test(facts), `${path}: no dash or broken text`);
}
console.log('AETHERIUM_FACTS=PASS every Guide page carries its facts in the HTML');
