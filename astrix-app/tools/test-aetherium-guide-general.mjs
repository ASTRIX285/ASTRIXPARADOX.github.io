#!/usr/bin/env node
// The Aetherium Guide, General section and the general Skills page (feature/aetherium-guide-general, 18 Oct 2026), on a
// local static server:
//   - data: general.json, every record with a status and provenance, every community source on https, the FAQ grouped like
//     the wiki's User Guide (controls, ui, items, social, trouble), Miguel's rulings (Defiance on Space bar, the bar fill
//     order, one macro key with 3 presets, 3 loadouts each, resets at 07:00 UTC and Wednesday 07:00 UTC, Lv 45);
//   - reset maths: nextReset for daily and weekly, on and either side of the reset minute;
//   - each page at 1600 and 390: the Guide shell with its title, the page's own content, a source under every fact,
//     no sideways scroll, no overlapping tiles, cylinder cards (computed radius and gradient), no en or em dash;
//   - Reset times in the player's own zone: Los Angeles and Tokyo with a fixed clock, times and countdown checked;
//   - FAQ: no answer shows a source (sources stay in the data); Controls links to the
//     Ascent Plan's Skill Bar screen; Loadouts shows 3 each; Skills shows Specialty steps at skill Lv 8, 12, 16 and 20.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.svg':'image/svg+xml'};
const DASH=/[–—]/;

/* Data. */
const data=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/advisor/general.json'),'utf8'));
const byId=Object.fromEntries(data.records.map(record=>[record.id,record]));
for(const record of data.records){
  assert.ok(['confirmed','reported','pending'].includes(record.status),`${record.id}: status`);
  assert.ok(Array.isArray(record.provenance)&&record.provenance.length,`${record.id}: provenance`);
  for(const source of record.provenance){
    if(source.kind==='community-guide')assert.match(source.url,/^https:\/\//,`${record.id}: https source`);
    else assert.equal(source.kind,'in-game-capture',`${record.id}: source kind`);
  }
}
assert.ok(!DASH.test(JSON.stringify(data)),'No en or em dash in general.json');
const faq=data.records.filter(record=>record.section==='faq');
assert.deepEqual(Object.keys(data.groups),['controls','ui','items','social','trouble'],'FAQ groups follow the wiki User Guide');
for(const group of Object.keys(data.groups))assert.ok(faq.some(item=>item.group===group),`FAQ group ${group} has questions`);
assert.deepEqual(byId['reset-times'].value,{daily:{hourUtc:7,minuteUtc:0},weekly:{weekdayUtc:3,weekdayName:'Wednesday',hourUtc:7,minuteUtc:0}},'Resets at 07:00 UTC and Wednesday 07:00 UTC');
assert.deepEqual(byId['space-defiance'].value,{key:'Space',skill:'Defiance'},'Defiance on Space bar');
assert.deepEqual(byId['bar-layout'].value.fill,['1','2','3','4','Q','E','5','6','7','8'],'Own keys fill 1 to 4, Q and E, then 5 to 8');
assert.deepEqual(byId['bar-layout'].value.stackKeys,['Q','E'],'Stacks go on Q and E');
assert.deepEqual([byId['macro-presets'].value.keys,byId['macro-presets'].value.presets],[1,3],'One macro key, 3 presets');
assert.deepEqual(byId.loadouts.value,{looks:3,armour:3,skills:3},'3 loadouts each');
assert.equal(byId['season-1'].value.levelCap,45,'Global cap Lv 45');
assert.equal(byId.trading.value.directTrade,false,'No direct trading');
assert.deepEqual(byId.membership.value.unlocks,['Market','Quna Exchange'],'Membership unlocks the Market and Quna Exchange');
assert.deepEqual(byId['skill-specialty'].value.slotLevels,[8,12,20],'Specialty slots');
assert.equal(byId['skill-mastery-cap'].value.cap,11,'Mastery cap from the confirmed rule');
console.log(`ok data: ${data.records.length} records, ${faq.length} FAQ answers`);

/* Reset maths (pure). */
const {nextReset,countdownWords}=await import(pathToFileURL(resolve(root,'astrix-app/pages/aetherium/guide-resets.mjs')).href);
const daily=byId['reset-times'].value.daily,weekly=byId['reset-times'].value.weekly;
const at=iso=>new Date(iso);
assert.equal(nextReset(at('2026-10-18T06:59:00Z'),daily).toISOString(),'2026-10-18T07:00:00.000Z','Daily: before 07:00 is today');
assert.equal(nextReset(at('2026-10-18T07:00:00Z'),daily).toISOString(),'2026-10-19T07:00:00.000Z','Daily: on the minute rolls to tomorrow');
assert.equal(nextReset(at('2026-10-21T06:00:00Z'),weekly).toISOString(),'2026-10-21T07:00:00.000Z','Weekly: Wednesday before 07:00 is today');
assert.equal(nextReset(at('2026-10-21T07:00:00Z'),weekly).toISOString(),'2026-10-28T07:00:00.000Z','Weekly: on the minute rolls a week');
assert.equal(nextReset(at('2026-10-18T10:00:00Z'),weekly).toISOString(),'2026-10-21T07:00:00.000Z','Weekly: Sunday goes to Wednesday');
assert.equal(countdownWords(at('2026-10-18T10:00:00Z'),at('2026-10-19T07:00:00Z')),'in 21 h');
assert.equal(countdownWords(at('2026-10-18T10:00:00Z'),at('2026-10-21T07:00:00Z')),'in 2 days 21 h');
assert.equal(countdownWords(at('2026-10-18T06:53:00Z'),at('2026-10-18T07:00:00Z')),'in 7 min');
console.log('ok reset maths');

/* Pages. */
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try {const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const PAGES=[
  ['general','/hub/aetherium/guide/general/','General'],
  ['about','/hub/aetherium/guide/general/about/','About AION 2'],
  ['resets','/hub/aetherium/guide/general/resets/','Reset times'],
  ['market','/hub/aetherium/guide/general/market/','Membership and the Market'],
  ['controls','/hub/aetherium/guide/general/controls/','Controls and the skill bar'],
  ['loadouts','/hub/aetherium/guide/general/loadouts/','Loadouts'],
  ['faq','/hub/aetherium/guide/general/faq/','FAQ'],
  ['skills','/hub/aetherium/guide/skills/','Skills']
];
const browser=await chromium.launch();
let failed=false;
const open=async(path,{width=1600,timezoneId='Europe/London',now=null}={})=>{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  if(now)await page.clock.setFixedTime(new Date(now));
  await page.goto(base+path);
  await page.waitForSelector('html[data-aetherium-ready="true"]');
  return {context,page,errors};
};
try {
  for(const width of [1600,390]){
    for(const [id,path,title] of PAGES){
      const {context,page,errors}=await open(path,{width});
      assert.deepEqual(errors,[],`${id} at ${width}: no page errors`);
      assert.ok(await page.locator(`[data-guide-content="${id}"]`).count(),`${id}: content`);
      assert.equal((await page.locator('#aeScreenTitle').first().textContent()).trim(),title,`${id}: title in the shell`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${id} at ${width}: no sideways scroll (${overflow}px)`);
      const report=await page.evaluate(()=>{
        const facts=[...document.querySelectorAll('[data-fact]')];
        const noSource=facts.filter(card=>card.querySelector('.ae-gg-src, a[href^="https://aion2.fandom.com/"]')).map(card=>card.dataset.fact);
        const wide=[...document.querySelectorAll('.ae-gg *')].filter(node=>node.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(node=>node.className||node.tagName);
        const card=facts[0]&&getComputedStyle(facts[0]);
        return {facts:facts.length,noSource,wide:wide.slice(0,5),radius:card?parseFloat(card.borderTopLeftRadius):null,gradient:card?card.backgroundImage:null,text:document.body.innerText};
      });
      assert.deepEqual(report.noSource,[],`${id}: no sources on any fact`);
      assert.deepEqual(report.wide,[],`${id} at ${width}: nothing past the right edge`);
      if(report.facts){assert.ok(report.radius>=12,`${id}: rounded cylinder cards`);assert.match(report.gradient,/linear-gradient/,`${id}: lit card`);}
      assert.ok(!DASH.test(report.text),`${id}: no en or em dash`);
      if(id==='general'){
        const boxes=await page.locator('.ae-gg-tile').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
        assert.equal(boxes.length,6,'Six General pages');
        for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
          const a=boxes[i],b=boxes[j];
          assert.ok(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,`Tiles ${i} and ${j} do not overlap at ${width}`);
        }
      }
      if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`guide-${id}-${width}.png`),fullPage:true});
      await context.close();
    }
    console.log(`ok pages at ${width}`);
  }

  /* Reset times in the player's own zone. Sunday 18 Oct 2026 10:00 UTC. */
  for(const [timezoneId,dailyLocal,weeklyLocal,next] of [
    ['America/Los_Angeles','00:00 every day','Wednesdays at 00:00','Monday 19 October at 00:00'],
    ['Asia/Tokyo','16:00 every day','Wednesdays at 16:00','Monday 19 October at 16:00']
  ]){
    const {context,page}=await open('/hub/aetherium/guide/general/resets/',{timezoneId,now:'2026-10-18T10:00:00Z'});
    const read=kind=>page.locator(`[data-reset="${kind}"]`).evaluate(card=>({local:card.querySelector('[data-reset-local]').textContent,next:card.querySelector('[data-reset-next]').textContent,in:card.querySelector('[data-reset-in]').textContent,at:card.dataset.resetAt,utc:card.querySelector('[data-reset-utc]').textContent}));
    const d=await read('daily'),w=await read('weekly');
    assert.equal(await page.locator('[data-reset-zone]').textContent(),timezoneId,`${timezoneId}: zone named`);
    assert.equal(d.local,dailyLocal,`${timezoneId}: daily local time`);
    assert.equal(w.local,weeklyLocal,`${timezoneId}: weekly local time`);
    assert.equal(d.utc,'07:00 UTC');
    assert.equal(d.at,'2026-10-19T07:00:00.000Z');
    assert.equal(w.at,'2026-10-21T07:00:00.000Z');
    assert.equal(d.in,'(in 21 h)');
    assert.equal(w.in,'(in 2 days 21 h)');
        assert.equal(d.next,next,`${timezoneId}: next daily reset`);
    await context.close();
  }
  console.log('ok reset times in the local zone');

  /* FAQ sources, Controls, Loadouts, Skills. */
  {
    const {context,page}=await open('/hub/aetherium/guide/general/faq/');
    const answers=await page.locator('[data-faq]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.faq,group:node.closest('[data-faq-group]').dataset.faqGroup,links:[...node.querySelectorAll('[data-source-url]')].map(a=>a.href),inGame:node.querySelectorAll('[data-source-kind="in-game"]').length})));
    assert.equal(answers.length,faq.length,'Every FAQ answer on the page');
    for(const answer of answers){
      assert.equal(answer.links.length+answer.inGame,0,`${answer.id}: no sources shown`);
      assert.equal(answer.group,byId[answer.id].group,`${answer.id}: in its group`);
    }
    await context.close();
  }
  {
    const {context,page}=await open('/hub/aetherium/guide/general/controls/');
    assert.equal(await page.locator('a[data-guide-link="skill-bar"]').getAttribute('href'),'/hub/aetherium/ascent/skill-bar/','Links to the Skill Bar screen');
    assert.equal((await page.locator('[data-bar-key="Space"] small').textContent()).trim(),'Defiance','Space bar holds Defiance');
    const keys=await page.locator('.ae-gg-keys [data-bar-key]').evaluateAll(nodes=>nodes.map(node=>node.dataset.barKey));
    assert.deepEqual(keys,['1','2','3','4','5','6','7','8','Q','E','LMB','RMB','B'],'Bar reads 1 to 8, Q, E, left click, right click, second stack');
    const fills=await page.locator('.ae-gg-keys:not(.is-mouse) [data-bar-key] small').allTextContents();
    assert.deepEqual(fills,['1','2','3','4','7','8','9','10','5','6'],'Fill order numbers');
    assert.ok(!(await page.locator('#aeDefaultKeys').textContent()).includes('Space'),'Space row held until Miguel rules');
    await context.close();
  }
  {
    const {context,page}=await open('/hub/aetherium/guide/general/loadouts/',{width:390});
    const counts=await page.locator('[data-loadout]').evaluateAll(nodes=>nodes.map(node=>[node.dataset.loadout,node.querySelectorAll('i').length]));
    assert.deepEqual(counts,[['looks',3],['armour',3],['skills',3]],'3 loadouts each');
    await context.close();
  }
  {
    const {context,page}=await open('/hub/aetherium/guide/skills/');
    const steps=await page.locator('[data-skill-level]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.skillLevel)));
    assert.deepEqual(steps,[8,12,16,20],'Specialty steps at skill Lv 8, 12, 16 and 20');
    assert.equal(await page.locator('[data-status]').count(),0,'No status tags');
    await context.close();
  }
  console.log('ok FAQ sources, Controls, Loadouts, Skills');
} catch(error){
  failed=true;
  console.error(error);
} finally {
  await browser.close();
  server.close();
}
if(failed){console.error('AETHERIUM_GUIDE_GENERAL=FAIL');process.exitCode=1;}
else console.log('AETHERIUM_GUIDE_GENERAL=PASS');
