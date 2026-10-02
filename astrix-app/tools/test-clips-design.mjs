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
  for(const marker of ['<!-- CLIPS:START -->','<!-- CLIPS:END -->','<!-- CLIPS-COUNT:START -->','<!-- CLIPS-COUNT:END -->','<!-- CLIPS-GAMES:START -->','<!-- CLIPS-GAMES:END -->'])
    assert.equal(html.split(marker).length-1,1,`${label}: ${marker} appears once`);
  // Every filter is a shared flat chip (css/astrix-brand.css .ax-chip).
  const buttons=[...html.matchAll(/<button class="([^"]*(?:filter-btn|news-filter)[^"]*)"/g)].map(match=>match[1].split(/\s+/));
  assert.ok(buttons.length>0&&buttons.every(names=>names.includes('ax-chip')),`${label}: every filter button is an ax-chip`);
}
const gameChips=html=>[...html.split('<!-- CLIPS-GAMES:START -->')[1].split('<!-- CLIPS-GAMES:END -->')[0].matchAll(/data-game="([^"]+)"/g)].map(match=>match[1]);
// Runs the real builder in fetch mode with the YouTube calls replaced: every playlist comes back
// empty, and extra playlists can be added to PLAYLISTS.
const fetchEmpty=(file,extra=[])=>execFileSync(python,['-B','-c',[
  'import sys,json',
  'import scripts.build_clips as clips',
  'clips.API_KEY="test"',
  'clips.fetch_playlist=lambda playlist_id: []',
  `clips.PLAYLISTS.extend(json.loads(${JSON.stringify(JSON.stringify(extra))}))`,
  `sys.argv=["build_clips.py","--page",${JSON.stringify(file)}]`,
  'clips.main()'
].join('\n')],{cwd:root,stdio:'pipe'});
const clipIds=html=>[...html.matchAll(/openClip\('([^']+)'/g)].map(match=>match[1]);
const clipCount=html=>Number(html.match(/<!-- CLIPS-COUNT:START -->(\d+)<!-- CLIPS-COUNT:END -->/)?.[1]);
const rewrite=file=>execFileSync(python,[script,'--reuse-cards','--page',file],{stdio:'pipe'});

// The strobe stroke rules the ax-stroke class opts into live in the brand stylesheet.
assert.match(brandCss,/\.ax-stroke\b/,'css/astrix-brand.css keeps the strobe stroke rules');

assert.match(brandCss,/body\.ax-brand \.ax-chip\{/,'css/astrix-brand.css carries the shared filter chips');
const news=readFileSync(join(root,'pages','news.html'),'utf8');
const newsChips=[...news.matchAll(/<button class="([^"]*news-filter[^"]*)"/g)].map(match=>match[1].split(/\s+/));
assert.ok(newsChips.length>0&&newsChips.every(names=>names.includes('ax-chip')),'News filters use the same shared chips');

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

  // Game chips: All plus one per playlist, in PLAYLISTS order.
  const playlists=JSON.parse(execFileSync(python,['-B','-c','import json,scripts.build_clips as c;print(json.dumps([p["game"] for p in c.PLAYLISTS]))'],{cwd:root,encoding:'utf8'}));
  assert.deepEqual(gameChips(once),['all',...playlists],'One Game chip per playlist plus All');

  // A playlist that comes back empty keeps the cards already on the page.
  const empty=join(dir,'empty.html');
  writeFileSync(empty,original);
  fetchEmpty(empty);
  assert.equal(readFileSync(empty,'utf8'),once,'Empty playlists keep every existing clip; the page is unchanged');

  // A new playlist in PLAYLISTS gets its own Game chip automatically.
  const added=join(dir,'added.html');
  writeFileSync(added,original);
  fetchEmpty(added,[{game:'test-new-game',label:'Test New Game',id:'PLtest'}]);
  const withNew=readFileSync(added,'utf8');
  assert.deepEqual(gameChips(withNew),['all',...playlists,'test-new-game'],'A new playlist gets its own chip');
  assert.match(withNew,/<button class="ax-chip filter-btn game-btn" data-game="test-new-game" onclick="filterClips\(this,'game'\)">Test New Game<\/button>/,'The new chip uses the chip classes on the page');
  assert.deepEqual(clipIds(withNew),ids,'Adding a playlist keeps every existing clip');
  checkDesign(withNew,'after adding a playlist');

  // Without the markers the builder stops and leaves the file untouched.
  const bare=join(dir,'bare.html');
  const unmarked=original.replace('<!-- CLIPS:START -->','').replace('<!-- CLIPS:END -->','');
  writeFileSync(bare,unmarked);
  assert.throws(()=>rewrite(bare),'The builder fails when the markers are missing');
  assert.equal(readFileSync(bare,'utf8'),unmarked,'Nothing is written when the markers are missing');
}finally{rmSync(dir,{recursive:true,force:true});}

console.log(`CLIPS_DESIGN=PASS logo "/", body.ax-map and ax-stroke, brand and map stylesheets kept; shared chips on Clips and News; ${ids.length} clips identical after a rewrite; rerun byte-identical; empty playlists keep their clips; a new playlist gets its own chip; missing markers stop the builder`);
