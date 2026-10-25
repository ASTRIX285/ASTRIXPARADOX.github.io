#!/usr/bin/env node
// The Aetherium Guide, General section and the general Skills page (feature/aetherium-guide-general, 18 Oct 2026), on a
// local static server:
//   - data: general.json, every record with a status and provenance, every community source on https, the FAQ grouped like
//     the wiki's User Guide (controls, ui, items, social, trouble), Miguel's rulings (Defiance on Space bar, the bar fill
//     order, one macro key with 3 presets, 3 loadouts each, resets at 07:00 UTC and Wednesday 07:00 UTC, Lv 45);
//   - reset maths: nextReset for daily and weekly, on and either side of the reset minute;
//   - each page at 1600 and 390: the Guide shell with its title, the page's own content, a source under every fact,
//     no sideways scroll, no overlapping tiles, cylinder cards on About and Skills (computed radius and gradient), clean
//     panel cards with an ivory hairline on the five redesigned pages (design/aetherium-guide-general), no en or em dash;
//   - design/aetherium-guide-general (20 Oct 2026): Reset times has no repeated Reset times box, its tip sits under the cards
//     and each card has the resets icon at 56px; Controls keeps 1 to 8, Q and E on one row (scrolling in its own box on a
//     phone) and lights the keys a numbered step names; Loadouts shows plain labels, not buttons; Market has no chips; the FAQ
//     shows every answer as a tip under a section heading with its topic icon; card and section titles follow the type scale;
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
const REDESIGNED=new Set(['resets','market','controls','loadouts','faq']);
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
        const wide=[...document.querySelectorAll('.ae-gg *')].filter(node=>!node.closest('.ae-gg-keyscroll .ae-gg-keys')&&node.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(node=>node.className||node.tagName);
        const card=facts[0]&&getComputedStyle(facts[0]);
        return {facts:facts.length,noSource,wide:wide.slice(0,5),radius:card?parseFloat(card.borderTopLeftRadius):null,gradient:card?card.backgroundImage:null,background:card?card.backgroundColor:null,edge:card?card.borderTopColor:null,text:document.body.innerText};
      });
      assert.deepEqual(report.noSource,[],`${id}: no sources on any fact`);
      assert.deepEqual(report.wide,[],`${id} at ${width}: nothing past the right edge`);
      if(report.facts&&REDESIGNED.has(id)){
        assert.equal(report.gradient,'none',`${id}: clean panel card, no gradient`);
        assert.equal(report.background,'rgb(19, 28, 41)',`${id}: card on the Guide panel colour`);
        assert.equal(report.edge,'rgba(217, 210, 192, 0.35)',`${id}: ivory hairline edge`);
      } else if(report.facts&&id!=='about'){assert.ok(report.radius>=12,`${id}: rounded cylinder cards`);assert.match(report.gradient,/linear-gradient/,`${id}: lit card`);}
      // About in pictures (design/aetherium-about-page, 25 Oct 2026): each faction a photo panel with its emblem, in its own
      // colour; the rules as four tiles; one picture per story beat; Season 1 as numbers.
      if(id==='about'){
        const look=await page.evaluate(async()=>{
          for(const img of document.querySelectorAll('.ae-ab-faction img,.ae-ab-beat-img')){img.loading='eager';if(!img.complete)await new Promise(done=>{img.onload=img.onerror=done;});}
          const panels=[...document.querySelectorAll('.ae-ab-faction')].map(el=>({side:el.dataset.side,h:el.getBoundingClientRect().height,photo:el.querySelector('.ae-ab-faction-img')?.naturalWidth>0,emblem:el.querySelector('.ae-ab-emblem')?.naturalWidth>0,
            colour:getComputedStyle(el,'::after').backgroundColor}));
          return {panels,rules:document.querySelectorAll('.ae-ab-rule').length,beats:document.querySelectorAll('.ae-ab-beat').length,art:[...document.querySelectorAll('.ae-ab-beat-img')].filter(img=>img.naturalWidth>0).length,
            story:document.querySelectorAll('[data-fact="story"] li').length,numbers:[...document.querySelectorAll('.ae-ab-numbers b')].map(b=>b.textContent),cap:document.querySelector('[data-season-cap]')?.textContent};
        });
        assert.deepEqual(look.panels.map(p=>p.side),['elyos','asmodian'],'Both factions, Elyos first');
        assert.ok(look.panels.every(p=>p.photo&&p.emblem),'Each faction shows its photo and its emblem');
        assert.ok(look.panels.every(p=>p.h>=320),`Faction panels are tall (${look.panels.map(p=>Math.round(p.h))})`);
        assert.notEqual(look.panels[0].colour,look.panels[1].colour,'Each faction in its own colour');
        assert.equal(look.rules,4,'Four faction rule tiles');
        assert.equal(look.beats,look.story,'One picture per story beat');
        assert.equal(look.art,look.beats,'Every story picture loads');
        assert.equal(look.cap,'Lv 45');
        assert.deepEqual(look.numbers.slice(-2),['30 Sept','5 Oct'],'Launch dates as numbers');
      }
      if(REDESIGNED.has(id)){
        const scale=await page.evaluate(()=>{
          const h=document.querySelector('.ae-gg-card .ae-gg-h');
          const s=h&&getComputedStyle(h);
          return s?{size:parseFloat(s.fontSize),family:s.fontFamily}:null;
        });
        if(scale){
          assert.equal(scale.size,width>760?28:24,`${id} at ${width}: card title on the type scale`);
          assert.match(scale.family,/fairy-tale-jf/,`${id}: card title in the title face`);
        }
        assert.equal(await page.locator('.ae-gg .ae-btn').count(),0,`${id}: buttons in AION 2 colours (ae-gd-btn)`);
        assert.ok(await page.locator('.ae-gg .ae-gd-btn.is-gold').count()<=1,`${id}: at most one solid gold main action`);
      }
      assert.ok(!DASH.test(report.text),`${id}: no en or em dash`);
      if(id==='general'){
        const boxes=await page.locator('.ae-gd-ocard').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
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
  {
    const {context,page}=await open('/hub/aetherium/guide/general/resets/');
    assert.equal(await page.locator('[data-fact="reset-times"]').count(),0,'No repeated Reset times box');
    assert.equal((await page.locator('[data-reset-tip]').textContent()).trim(),byId['reset-times'].notes[1],'The entry counter line is a tip');
    const tipBelow=await page.evaluate(()=>document.querySelector('[data-reset-tip]').getBoundingClientRect().top>=document.querySelector('#aeResets').getBoundingClientRect().bottom);
    assert.ok(tipBelow,'Tip sits under the reset cards');
    const icons=await page.locator('[data-reset] .ae-gg-icon').evaluateAll(nodes=>nodes.map(node=>({src:node.getAttribute('src'),w:node.getBoundingClientRect().width,h:node.getBoundingClientRect().height,ok:node.complete&&node.naturalWidth>0})));
    assert.equal(icons.length,2,'Both reset cards have an icon');
    for(const icon of icons){
      assert.match(icon.src,/images\/topic-icons\/resets\.png$/,'Resets topic icon');
      assert.deepEqual([icon.w,icon.h],[56,56],'Icon at 56px');
    }
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
    /* Steps beside the bar, each lighting the keys it names. */
    const steps=byId['bar-layout'].steps;
    assert.equal(await page.locator('#aeBarSteps .ae-gg-step').count(),steps.length,'One numbered step per line');
    assert.equal(await page.locator('[data-fact="bar-layout"] .ae-gg-list').count(),0,'No bullet list above the bar');
    const beside=await page.evaluate(()=>{const bar=document.querySelector('#aeGuideBar').getBoundingClientRect(),list=document.querySelector('#aeBarSteps').getBoundingClientRect();return list.left>=bar.right-1&&list.top<bar.bottom;});
    assert.ok(beside,'Steps sit beside the bar at 1600');
    for(const [index,step] of steps.entries()){
      await page.locator(`[data-bar-step="${index+1}"]`).hover();
      const lit=await page.locator('#aeGuideBar .is-lit').evaluateAll(nodes=>nodes.map(node=>node.dataset.barKey));
      assert.deepEqual(lit.sort(),[...step.keys].sort(),`Step ${index+1} lights its keys`);
      const ring=await page.waitForFunction(key=>{const c=getComputedStyle(document.querySelector(`#aeGuideBar [data-bar-key="${key}"]`)).borderTopColor;return c==='rgb(226, 181, 79)'&&c;},step.keys[0],{timeout:2000}).then(handle=>handle.jsonValue()).catch(()=>'not gold');
      assert.equal(ring,'rgb(226, 181, 79)',`Step ${index+1}: lit keys have a gold edge`);
    }
    await page.mouse.move(0,0);
    await page.locator('[data-bar-step="3"]').focus();
    assert.deepEqual((await page.locator('#aeGuideBar .is-lit').evaluateAll(nodes=>nodes.map(node=>node.dataset.barKey))).sort(),['E','Q'],'Focus lights the keys too');
    assert.equal(await page.locator('[data-bar-step="3"]').evaluate(node=>node.tagName),'BUTTON','Steps are buttons');
    await context.close();
  }
  for(const width of [1600,1100,390]){
    const {context,page}=await open('/hub/aetherium/guide/general/controls/',{width});
    const row=await page.evaluate(()=>{
      const keys=[...document.querySelectorAll('.ae-gg-keyscroll [data-bar-key]')].map(node=>node.getBoundingClientRect().top);
      const box=document.querySelector('.ae-gg-keyscroll');
      return {tops:[...new Set(keys.map(Math.round))],scroll:box.scrollWidth>box.clientWidth,overflow:getComputedStyle(box).overflowX};
    });
    assert.equal(row.tops.length,1,`Controls at ${width}: 1 to 8, Q and E on one row`);
    assert.equal(row.overflow,'auto',`Controls at ${width}: the key row scrolls in its own box`);
    if(width===1600)assert.equal(row.scroll,false,'Controls at 1600: the key row fits without scrolling');
    await context.close();
  }
  {
    const {context,page}=await open('/hub/aetherium/guide/general/loadouts/',{width:390});
    const counts=await page.locator('[data-loadout]').evaluateAll(nodes=>nodes.map(node=>[node.dataset.loadout,node.querySelectorAll('.ae-gg-slot').length]));
    assert.deepEqual(counts,[['looks',3],['armour',3],['skills',3]],'3 loadouts each');
    const look=await page.locator('.ae-gg-slot').first().evaluate(node=>{const s=getComputedStyle(node);return {tag:node.tagName,border:s.borderTopWidth,radius:s.borderTopLeftRadius,cursor:s.cursor,role:node.getAttribute('role'),tab:node.tabIndex};});
    assert.deepEqual(look,{tag:'SPAN',border:'0px',radius:'0px',cursor:'default',role:null,tab:-1},'Loadout numbers are plain labels, not buttons');
    assert.equal(await page.locator('#aeLoadouts button, #aeLoadouts a').count(),0,'Nothing to press in the loadout list');
    await context.close();
  }
  {
    const {context,page}=await open('/hub/aetherium/guide/general/market/');
    assert.equal(await page.locator('.ae-gg-chip').count(),0,'Market: no chips repeating the Membership text');
    assert.match(await page.locator('[data-fact="market-tip"] .ae-gg-icon').getAttribute('src'),/topic-icons\/market\.png$/,'Market tip has the market icon');
    await context.close();
  }
  for(const width of [1600,390]){
    const {context,page}=await open('/hub/aetherium/guide/general/faq/',{width});
    assert.equal(await page.locator('details.ae-gg-q').count(),0,'FAQ: no grey bar list of closed questions');
    assert.equal(await page.locator('.ae-gg-tipcard[data-faq]').count(),faq.length,'FAQ: every answer is a tip');
    const heads=await page.locator('.ae-gg-group > .ae-gg-h2').evaluateAll(nodes=>nodes.map(node=>{const img=node.querySelector('.ae-gg-icon');return {size:parseFloat(getComputedStyle(node).fontSize),icon:img&&img.getAttribute('src')};}));
    assert.equal(heads.length,5,'Five FAQ group headings');
    for(const head of heads){
      assert.equal(head.size,width>760?40:30,`FAQ at ${width}: section heading on the type scale`);
      assert.match(head.icon,/topic-icons\/(faq|controls)\.png$/,'Each FAQ group has its topic icon');
    }
    const h4=await page.locator('.ae-gg-tipcard h4').first().evaluate(node=>{const s=getComputedStyle(node);return [parseFloat(s.fontSize),s.fontWeight];});
    assert.deepEqual(h4,[18,'600'],'Tip heading: 18px, weight 600');
    await context.close();
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
