import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isLocalPreview,isJourneyPreview,startPage} from '../shared/local-preview.mjs';
import {createJourneyPreviewPayload} from '../pages/journey/journey-preview.mjs';
const href=(host,query='?preview')=>({href:`http://${host}/astrix-app/pages/journey/${query}`});
const denied=['astrixparadox.com','auth.astrixparadox.com','sandbox.astrixparadox.com','astrix285.github.io','example.com','localhost.example.com','127.0.0.1.example.com','localhost@evil.example','[::1]','192.168.1.10'];
for(const host of denied)for(const query of ['?preview','?preview=1','?preview=false','?preview&host=localhost']){
 const location=href(host,query);assert.equal(isLocalPreview(location),false,location.href);assert.equal(createJourneyPreviewPayload(location),null);
}
for(const location of [{},{href:'bad URL'},{href:'file:///astrix-app/pages/journey/?preview'},href('localhost',''),href('localhost','?Preview'),href('127.0.0.1','?x=preview')])assert.equal(isLocalPreview(location),false);
for(const host of ['localhost','localhost:8080','127.0.0.1','127.0.0.1:3000']){
 const location=href(host);assert.equal(isLocalPreview(location),true);assert.equal(isJourneyPreview(location),true);
 const data=createJourneyPreviewPayload(location);assert.equal(data.preview,true);assert.equal(data.displayName,'Sample Guardian');assert.equal(data.characters.length,3);
 assert.ok(data.characters.every(row=>row.name.startsWith('Sample ')&&row.characterId.startsWith('sample-')&&row.power===1000));
 data.characters.pop();assert.equal(createJourneyPreviewPayload(location).characters.length,3,'No retained sample state');
}
assert.equal(isJourneyPreview({href:'http://localhost/astrix-app/pages/vault/?preview'}),false,'Pages must explicitly opt in');
assert.equal(createJourneyPreviewPayload({href:'http://localhost/astrix-app/pages/vault/?preview'}),null);
const entry=await readFile(new URL('../pages/journey/journey-entry.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../pages/journey/index.html',import.meta.url),'utf8');
assert.match(html,/src="\.\/journey-entry\.mjs\?v=20260925-local-preview-1"/);
assert.doesNotMatch(html,/<script[^>]+src="[^\"]*(?:journey\.mjs|astrix-hero-cards\.mjs)/,'No import-time live auth before the gate');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
// Execute the actual entry control flow; intercept dynamic imports without running auth.
const runEntry=new AsyncFunction('startPage','load',entry.replace(/^import .*;\n/,'').replaceAll('import(','load('));
for(const [location,preview] of [[href('localhost'),true],[href('127.0.0.1'),true],[href('localhost',''),false],...denied.map(host=>[href(host),false])]){
 const imports=[];let mounted=0;
 await runEntry(options=>startPage({...options,location}),async path=>{imports.push(path);return {mountJourneyPreview:async()=>mounted++};});
 assert.equal(mounted,preview?1:0,location.href);
 assert.equal(imports.some(path=>path.includes('journey-preview.mjs')),preview);
 assert.equal(imports.some(path=>path.includes('astrix-hero-cards.mjs')),!preview);
 assert.equal(imports.some(path=>path.includes('./journey.mjs')),!preview);
}
const ribbon=await readFile(new URL('../shared/astrix-destination-ribbon.js',import.meta.url),'utf8');
for(const [name,end] of [['prepareData','setNavigationProgress'],['warmReports',null]]){
 const start=ribbon.indexOf(`  async function ${name}(`);assert.ok(start>=0);
 const body=ribbon.slice(start,end?ribbon.indexOf(`  function ${end}(`,start):undefined);
 assert.match(body,/await import\(new URL\('\.\/local-preview\.mjs\?v=20260925-local-preview-1',scriptUrl\)\.href\);\s*if\(isJourneyPreview\(\)\)return;/);
}
const sample=await readFile(new URL('../pages/journey/journey-preview.mjs',import.meta.url),'utf8');
assert.match(sample,/const payload=createJourneyPreviewPayload\(\);if\(!payload\)return false;/);
assert.match(sample,/badge.textContent='PREVIEW DATA'/);
assert.doesNotMatch(sample,/fetch\(|localStorage|sessionStorage|FORGE_BUNGIE_SESSION|loadPreparedPagePayload|getBungieSession/,'Sample data cannot use live loaders, sessions or storage');
console.log('LOCAL_PREVIEW=PASS localhost allowlist, production rejection, gated imports, fixture isolation');
