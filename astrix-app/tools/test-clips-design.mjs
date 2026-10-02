#!/usr/bin/env node
// Clips page design guard. pages/clips.html is the source of truth for layout and styling;
// scripts/build_clips.py may only rewrite the cards block and the clip count between markers.
// Runs in the clips workflow after the builder, so a broken page is never committed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const pagePath=join(root,'pages','clips.html');
const script=join(root,'scripts','build_clips.py');
const python=process.env.PYTHON||'python3';
const brandCss=readFileSync(join(root,'css','astrix-brand.css'),'utf8');

function checkDesign(html,label){
  assert.match(html,/<a class="nav-logo" href="\/"/,`${label}: the ASTRIX PARADOX logo links to "/"`);
  const body=html.match(/<body class="([^"]*)"/)?.[1]?.split(/\s+/)||[];
  assert.ok(body.includes('ax-map'),`${label}: body.ax-map (map background) is present`);
  assert.ok(body.includes('ax-stroke'),`${label}: body.ax-stroke (strobe stroke) is present`);
  assert.match(html,/<link rel="stylesheet" href="\/css\/astrix-brand\.css\?v=[^"]+">/,`${label}: the brand stylesheet link is present`);
  assert.match(html,/<link rel="stylesheet" href="\/astrix-app\/shared\/astrix-paradox-background\.css\?v=[^"]+">/,`${label}: the map background stylesheet link is present`);
  for(const marker of ['<!-- CLIPS:START -->','<!-- CLIPS:END -->','<!-- CLIPS-COUNT:START -->','<!-- CLIPS-COUNT:END -->'])
    assert.equal(html.split(marker).length-1,1,`${label}: ${marker} appears once`);
}
const clipIds=html=>[...html.matchAll(/openClip\('([^']+)'/g)].map(match=>match[1]);
const clipCount=html=>Number(html.match(/<!-- CLIPS-COUNT:START -->(\d+)<!-- CLIPS-COUNT:END -->/)?.[1]);
const rewrite=file=>execFileSync(python,[script,'--reuse-cards','--page',file],{stdio:'pipe'});

// The strobe stroke rules the ax-stroke class opts into live in the brand stylesheet.
assert.match(brandCss,/\.ax-stroke\b/,'css/astrix-brand.css keeps the strobe stroke rules');

const original=readFileSync(pagePath,'utf8');
checkDesign(original,'pages/clips.html');
const ids=clipIds(original);
assert.ok(ids.length>0,'pages/clips.html has clip cards');
assert.equal(clipCount(original),ids.length,'The clip count matches the cards');

const dir=mkdtempSync(join(tmpdir(),'clips-design-'));
try{
  // Rewriting the cards block keeps the design and the cards, and a second run changes nothing.
  const copy=join(dir,'clips.html');
  writeFileSync(copy,original);
  rewrite(copy);
  const once=readFileSync(copy,'utf8');
  checkDesign(once,'after the card rewrite');
  assert.deepEqual(clipIds(once),ids,'Same clips, same IDs, same order after the rewrite');
  assert.equal(clipCount(once),ids.length);
  rewrite(copy);
  assert.equal(readFileSync(copy,'utf8'),once,'A second rewrite gives a byte-identical file');

  // Without the markers the builder stops and leaves the file untouched.
  const bare=join(dir,'bare.html');
  const unmarked=original.replace('<!-- CLIPS:START -->','').replace('<!-- CLIPS:END -->','');
  writeFileSync(bare,unmarked);
  assert.throws(()=>rewrite(bare),'The builder fails when the markers are missing');
  assert.equal(readFileSync(bare,'utf8'),unmarked,'Nothing is written when the markers are missing');
}finally{rmSync(dir,{recursive:true,force:true});}

console.log(`CLIPS_DESIGN=PASS logo "/", body.ax-map and ax-stroke, brand and map stylesheets kept; ${ids.length} clips identical after a rewrite; rerun byte-identical; missing markers stop the builder`);
