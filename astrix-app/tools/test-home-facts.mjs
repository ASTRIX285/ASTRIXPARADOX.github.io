#!/usr/bin/env node
// Guardian Home fresh facts (3 Oct 2026), with the fixture account (fixtures/home-facts-fixture.mjs).
//   Engine: at least 25 templates; facts with missing or zero data never appear; every comparison
//   equals the stat divided by its constant from the COMPARISONS table, rounded, between 1 and 100,000;
//   no em or en dashes; one fact per group; five visits in a row never repeat the last two visits.
//   Page (390 and 1600): three fact cards in the Home card style; NEW FACTS shuffles in three new
//   ones; a reload never repeats the facts of the last two visits; missing-data facts never show.
// Prints a sample of 10 generated facts. Writes screenshots when HOME_RENDER_DIR is set (outside the repo).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TEMPLATES,COMPARISONS,COMPARISON_MIN,COMPARISON_MAX,compare,buildFacts,pickFacts,readHistory,writeHistory,recentIds,factData} from '../pages/home/home-facts.mjs';
import {summary,historical,MISSING_FACTS} from './fixtures/home-facts-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

// Engine.
assert.ok(TEMPLATES.length>=25,`At least 25 fact templates (${TEMPLATES.length})`);
assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,TEMPLATES.length,'Template ids are unique');
for(const [key,row] of Object.entries(COMPARISONS))assert.ok(row.value>0&&row.source.length>10,`${key}: a constant with its source`);
const facts=buildFacts(summary,historical),ids=facts.map(f=>f.id);
for(const id of MISSING_FACTS)assert.ok(!ids.includes(id),`${id}: missing or zero data never makes a fact`);
assert.deepEqual(buildFacts(null,null),[],'No data, no facts');
assert.deepEqual(buildFacts({abilityKills:{grenade:0,melee:0,super:0},raidClears:0,selfEliminations:0},null),[],'Zero values never make a fact');
for(const fact of facts)assert.doesNotMatch(fact.text,/[–—]/,`${fact.id}: no em or en dashes`);
// Comparison maths: the number in the sentence is round(stat / constant) from the table.
const data=factData(summary,historical);
const expected={'time-lotr':[data.minutes,'lotrTrilogyMinutes',/trilogy ([\d,]+) time/],'time-flights':[data.minutes,'londonNewYorkFlightMinutes',/New York ([\d,]+) time/],
  'time-marathons':[data.minutes,'marathonMinutes',/That's ([\d,]+) marathon/],'time-workyears':[data.minutes,'workingYearMinutes',/That's ([\d,]+) full year/],
  'class-main':[data.classes[0].minutes,'lotrTrilogyMinutes',/That's ([\d,]+) extended/],'kills-wembley':[data.kills,'wembleyCapacity',/Stadium ([\d,]+) time/],
  'longest-life':[data.longestLife,'bohemianRhapsodySeconds',/Rhapsody ([\d,]+) time/]};
for(const [id,[amount,key,pattern]] of Object.entries(expected)){
  const fact=facts.find(f=>f.id===id);assert.ok(fact,`${id} is generated from the fixture`);
  const shown=Number(fact.text.match(pattern)[1].replace(/,/g,''));
  assert.equal(shown,Math.round(amount/COMPARISONS[key].value),`${id}: ${fact.text}`);
  assert.ok(shown>=COMPARISON_MIN&&shown<=COMPARISON_MAX);
}
assert.equal(compare(1000,'wembleyCapacity'),null,'Below 1 is never shown');
assert.equal(compare(1e12,'footballPitchMetres'),null,'Above 100,000 is never shown');
assert.equal(compare(450,'marathonMinutes'),2,'Rounded');
// Picking and history: three facts, one per group, never repeating the last two visits.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const visits=[];
for(let visit=0;visit<6;visit++){
  const chosen=pickFacts(facts,recentIds(readHistory('3:1',storage)));
  assert.equal(chosen.length,3,`visit ${visit+1}: three facts`);
  assert.equal(new Set(chosen.map(f=>f.group)).size,3,`visit ${visit+1}: one fact per group`);
  for(const previous of visits.slice(-2))assert.ok(!chosen.some(f=>previous.includes(f.id)),`visit ${visit+1}: no repeat of the last two visits`);
  visits.push(chosen.map(f=>f.id));writeHistory('3:1',visits.at(-1),storage);
}
assert.equal(readHistory('3:1',{getItem(){throw new Error('blocked');}}).length,0,'Blocked storage still works');
console.log(`HOME_FACTS_ENGINE=PASS ${TEMPLATES.length} templates, ${facts.length} facts from the fixture, comparisons match the table, missing data skipped, no repeats across six visits`);
console.log('SAMPLE_FACTS:');for(const fact of pickFacts(facts,new Set(),10,(()=>{let s=7;return()=>(s=(s*16807)%2147483647)/2147483647;})()).concat(pickFacts(facts,new Set(),10,(()=>{let s=11;return()=>(s=(s*16807)%2147483647)/2147483647;})())).filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i).slice(0,10))console.log(`  ${fact.text}`);

// Page.
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'),file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`,shots=process.env.HOME_RENDER_DIR||'';
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exit(0);}throw error;}
  for(const width of [1600,390]){
    const context=await browser.newContext({viewport:{width,height:width<600?844:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/session')return route.fulfill({json:{authenticated:true,csrfToken:'fixture',activeDestinyMembership:{membershipId:'1',membershipType:3}},headers:cors});
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/bungie/home')return route.fulfill({json:summary,headers:cors});
      if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/bungie/historical-stats')return route.fulfill({json:historical,headers:cors});
      if(url.origin!==origin)return route.abort();
      return route.continue();
    });
    const shown=async()=>{await page.locator('#homeFactsList .home-fact').first().waitFor();return page.locator('#homeFactsList .home-fact').evaluateAll(nodes=>nodes.map(n=>n.dataset.fact));};
    const history=[];
    for(let visit=0;visit<3;visit++){
      await page.goto(origin+'/astrix-app/pages/home/');
      const now=await shown();
      assert.equal(now.length,3,`${width} visit ${visit+1}: three facts`);
      for(const previous of history.slice(-2))assert.ok(!now.some(id=>previous.includes(id)),`${width} visit ${visit+1}: no repeat of the last two visits`);
      assert.ok(!now.some(id=>MISSING_FACTS.includes(id)),`${width}: missing-data facts never show`);
      history.push(now);
    }
    // The cards match the Home card style.
    const style=await page.locator('#homeFactsList .home-fact').first().evaluate(n=>{const s=getComputedStyle(n),ref=getComputedStyle(document.querySelector('.home-card:not(.home-fact)'));return {clip:s.clipPath===ref.clipPath,bg:s.backgroundImage===ref.backgroundImage,shadow:s.boxShadow===ref.boxShadow};});
    assert.deepEqual(style,{clip:true,bg:true,shadow:true},`${width}: facts use the Home card style`);
    assert.match(await page.locator('#homeFactsShuffle').evaluate(n=>getComputedStyle(n,'::after').animationName),/ax-stroke-pulse/,`${width}: NEW FACTS carries the strobe`);
    // NEW FACTS shuffles in three different facts.
    const before=await shown();
    await page.locator('#homeFactsShuffle').click();
    await page.waitForFunction(old=>{const now=[...document.querySelectorAll('#homeFactsList .home-fact')].map(n=>n.dataset.fact);return now.length===3&&!now.some(id=>old.includes(id));},before);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: no sideways scroll`);
    if(shots)await page.locator('#homeFacts').screenshot({path:resolve(shots,`home-facts-${width}.png`)});
    assert.deepEqual(errors,[],`${width}: page errors`);
    await context.close();
  }
  console.log('HOME_FACTS_PAGE=PASS 1600 and 390: three facts in Home cards, no repeat across three visits, NEW FACTS shuffles in three new ones, missing-data facts never shown');
}finally{
  await browser?.close();server.close();
}
