#!/usr/bin/env node
// The Guide's Dungeons, weekly loop and World pages (phase 4, feature/aetherium-guide-dungeons, 18 Oct 2026):
//   - data: every dungeon has a status, a reason when pending and an https source; no dash in any copy;
//   - engine: the at a glance rows, the can you enter check (level, typed item level, suggested item level, pending),
//     the next Wednesday 07:00 UTC and daily 07:00 UTC resets, the countdown, the reset groups, loot from gear-sources;
//   - pages on a local static server: the overview table, every dungeon page, the check for a linked Daeva (roster level
//     plus the item level typed into the Guide memory) and by hand, the live countdown, the World page;
//   - looks: no sideways scroll at 390 and 1600, the tables fold into cards on a phone, real computed styles.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const g=await import('../games/aion2/engine/dungeon-guide.mjs');
const data=JSON.parse(readFileSync(resolve(root,'astrix-app/games/aion2/data/advisor/dungeons.json'),'utf8'));
const world=JSON.parse(readFileSync(resolve(root,'astrix-app/games/aion2/data/advisor/world.json'),'utf8'));
const DASH=/[–—]/;
let checks=0;
const ok=(name,fn)=>{fn();checks++;console.log(`ok ${name}`);};

/* ---------- Data ---------- */
const IDS=['krao-cave','draupnir','urugugu-canyon','vakron-sky-island','fire-temple','ferocious-horn-den','deus-research-base','shattered-arkanis','nightmare','ascension-trial','daily-dungeon','sealed-dungeons','shugo-festival','sanctuary'];
ok('data: every dungeon, each with a status and an https source',()=>{
  assert.deepEqual(g.dungeonRecords(data).map(r=>r.id),IDS);
  for(const record of [...data.records,...world.records]){
    assert.ok(['reported','confirmed','pending'].includes(record.status),`${record.id} status`);
    assert.ok(record.provenance?.length,`${record.id} has sources`);
    for(const source of record.provenance)assert.ok(source.kind==='in-game-capture'||/^https:\/\//.test(source.url),`${record.id} source url`);
  }
  assert.ok(!DASH.test(JSON.stringify(data))&&!DASH.test(JSON.stringify(world)),'no en or em dash in the data');
});
ok('data: the wiki facts as given',()=>{
  const d=id=>g.findDungeon(data,id);
  const pairs=id=>d(id).difficulties.map(x=>[x.id,x.level??null,x.itemLevel]);
  assert.deepEqual(pairs('krao-cave'),[['exploration',20,200],['conquest',45,700]]);
  assert.deepEqual(pairs('draupnir'),[['exploration',45,700],['conquest',45,700]]);
  assert.deepEqual(pairs('urugugu-canyon'),[['exploration',28,300],['conquest',45,1600]]);
  assert.deepEqual(pairs('vakron-sky-island'),[['exploration',45,1400],['conquest',45,1400]]);
  assert.deepEqual(pairs('fire-temple'),[['exploration',35,500],['conquest',45,2100]]);
  assert.deepEqual(pairs('ferocious-horn-den'),[['exploration',45,2100],['conquest',45,2100]]);
  assert.deepEqual(d('vakron-sky-island').players,{min:2,max:5});
  assert.deepEqual(['krao-cave','draupnir','urugugu-canyon','vakron-sky-island','fire-temple','ferocious-horn-den'].map(id=>d(id).stars),[1,1,2,2,3,3]);
  for(const id of ['deus-research-base','shattered-arkanis']){
    assert.deepEqual(d(id).difficulties.map(x=>x.itemLevel),[1600,1900,2200,2500]);
    assert.deepEqual(d(id).difficulties.map(x=>x.guaranteedUnique),[false,false,false,true]);
    assert.equal(d(id).level,null,'no level gate in the source: not guessed');
  }
  assert.deepEqual(d('ascension-trial').difficulties.map(x=>x.itemLevel),[1000,1500,2000,2500]);
  assert.deepEqual([d('nightmare').cycle.perDay,d('nightmare').cycle.cap],[2,14]);
  assert.equal(d('daily-dungeon').cycle.perWeek,14);
  assert.deepEqual([d('shugo-festival').cycle.perDay,d('shugo-festival').cycle.cap],[3,12]);
  assert.equal(d('sanctuary').status,'pending');
  assert.equal(d('draupnir').entrance,'abyss');
  assert.deepEqual([data.resets.weekly.day,data.resets.weekly.hourUtc,data.resets.daily.hourUtc],[3,7,7]);
});

/* ---------- Engine ---------- */
ok('engine: the at a glance rows',()=>{
  const rows=g.overviewRows(data);
  assert.equal(rows.length,14);
  const krao=rows[0];
  assert.deepEqual([krao.name,krao.players,krao.cycle,krao.level,krao.itemLevel],['Krao Cave','1 to 5','Spend Odyle Energy on the reward','20 / 45','200 / 700']);
  assert.equal(rows.find(r=>r.id==='vakron-sky-island').players,'2 to 5');
  assert.equal(rows.find(r=>r.id==='deus-research-base').itemLevel,'1,600 / 1,900 / 2,200 / 2,500');
  const sanctuary=rows.find(r=>r.id==='sanctuary');
  assert.deepEqual([sanctuary.level,sanctuary.itemLevel,sanctuary.status],[null,null,'pending']);
  assert.equal(rows.find(r=>r.id==='nightmare').itemLevel,null,'a suggested item level is not an entry gate');
});
ok('engine: can you enter',()=>{
  const check=(id,o)=>g.entryCheck(g.findDungeon(data,id),o);
  assert.equal(check('krao-cave',{}).verdict,'no-daeva');
  assert.equal(check('krao-cave',{level:18}).verdict,'level');
  assert.match(check('krao-cave',{level:18}).text,/opens at Lv 20/);
  assert.equal(check('krao-cave',{level:30}).verdict,'unknown');
  const uru=check('urugugu-canyon',{level:45,itemLevel:1200});
  assert.equal(uru.verdict,'open');
  assert.equal(uru.aim.id,'conquest');
  assert.match(uru.text,/Aim next for Conquest: item level 1,600, 400 to go/);
  assert.equal(check('urugugu-canyon',{level:30,itemLevel:1700}).aim.id,'conquest','Conquest still needs Lv 45');
  assert.match(check('urugugu-canyon',{level:30,itemLevel:1700}).text,/Conquest opens at Lv 45/);
  assert.equal(check('ascension-trial',{level:45,itemLevel:900}).verdict,'item-level');
  assert.match(check('ascension-trial',{level:45,itemLevel:900}).text,/100 to go/);
  const deus=check('deus-research-base',{level:45,itemLevel:2000});
  assert.deepEqual(deus.difficulties.map(x=>x.open),[true,true,false,false]);
  assert.equal(deus.aim.id,'stage-3');
  assert.equal(check('krao-cave',{level:45,itemLevel:900}).aim,null);
  assert.match(check('nightmare',{level:45,itemLevel:1800}).text,/ready for the two Rare bosses/);
  assert.equal(check('sanctuary',{level:45,itemLevel:3000}).verdict,'pending');
  assert.equal(check('daily-dungeon',{level:45}).verdict,'pending');
});
ok('engine: resets and countdown',()=>{
  const at=(...a)=>new Date(g.nextReset(Date.UTC(...a),'weekly',data)).toISOString();
  assert.equal(at(2026,9,18,12),'2026-10-21T07:00:00.000Z','Sunday to the coming Wednesday');
  assert.equal(at(2026,9,21,6,59),'2026-10-21T07:00:00.000Z','Wednesday just before the reset');
  assert.equal(at(2026,9,21,7),'2026-10-28T07:00:00.000Z','Wednesday at the reset: the next one');
  assert.equal(new Date(g.nextReset(Date.UTC(2026,9,18,6),'daily',data)).toISOString(),'2026-10-18T07:00:00.000Z');
  assert.equal(new Date(g.nextReset(Date.UTC(2026,9,18,8),'daily',data)).toISOString(),'2026-10-19T07:00:00.000Z');
  assert.equal(g.countdown(0,2*86400000+3*3600000+5*60000).text,'2d 3h 05m');
  assert.equal(g.countdown(0,3600000+65000).text,'1h 01m 05s');
  assert.equal(g.countdown(10,5).ms,0);
  const groups=g.resetList(data);
  assert.ok(groups.weekly.some(x=>x.id==='ascension-trial')&&groups.daily.some(x=>x.id==='nightmare')&&groups.none.some(x=>x.id==='sealed-dungeons'));
});
ok('engine: loot from gear-sources when it exists',()=>{
  const krao=g.findDungeon(data,'krao-cave');
  assert.equal(g.lootFor(krao,null),null);
  assert.deepEqual(g.lootFor(krao,{records:[{source:'krao-cave',items:[{name:'Test Weapon',slot:'Weapon',grade:'Unique',level:54}]},{source:'draupnir',items:[{name:'Other'}]}]}),[{name:'Test Weapon',slot:'Weapon',grade:'Unique',level:54}]);
  assert.deepEqual(g.lootFor(krao,{sources:{'krao-cave':{items:[{name:'Map Item'}]}}}).map(x=>x.name),['Map Item']);
});
ok('pages: one page per dungeon, weekly and world',()=>{
  for(const id of IDS)assert.ok(existsSync(resolve(root,`hub/aetherium/guide/dungeons/${id}/index.html`)),id);
  for(const path of ['dungeons','weekly','world'])assert.ok(existsSync(resolve(root,`hub/aetherium/guide/${path}/index.html`)),path);
});

/* ---------- Browser ---------- */
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.svg':'image/svg+xml'};
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
const browser=await chromium.launch();
const ENTRY={name:'TESTDAEVA',serverId:1309,serverName:'Hithanya',characterId:'dGVzdGRhZXZh=',className:'Templar',level:45,raceName:'Elyos',raceId:1,region:'eu'};
const seed=({itemLevel=null}={})=>{
  const store={rosters:{'eu:1309':{region:'eu',serverId:1309,serverName:'Hithanya',entries:[ENTRY]}},active:{roster:'eu:1309',key:`1309:${ENTRY.characterId}`}};
  const memory={v:1,daevas:itemLevel?{[`1309:${ENTRY.characterId}`]:{itemLevel,savedAt:new Date(Date.now()-2*86400000).toISOString()}}:{}};
  return `localStorage.setItem('aetherium.roster.v2',${JSON.stringify(JSON.stringify(store))});localStorage.setItem('aetherium.memory.v1',${JSON.stringify(JSON.stringify(memory))});`;
};
async function open(path,{width=1600,height=1000,init=null}={}){
  const context=await browser.newContext({viewport:{width,height}});
  if(init)await context.addInitScript(init);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+path);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:8000});
  page.errors=errors;
  return page;
}
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const shot=async(page,name)=>{if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`${name}.png`),fullPage:true});};

try {
  {
    const page=await open('/hub/aetherium/guide/dungeons/');
    assert.equal(await page.locator('#aeDungeonTable tbody tr').count(),14);
    assert.deepEqual(await page.locator('#aeDungeonTable thead th').allTextContents(),['Content','Players','Entry cycle','Main rewards','Level','Item level']);
    const krao=page.locator('[data-dungeon-row="krao-cave"]');
    assert.deepEqual(await krao.locator('td').allTextContents(),['1 to 5','Spend Odyle Energy on the reward','Unique weapons and accessories (item Lv 54)','20 / 45','200 / 700']);
    assert.equal(await krao.locator('a').getAttribute('href'),'/hub/aetherium/guide/dungeons/krao-cave/');
    assert.match(await page.locator('[data-dungeon-row="sanctuary"]').textContent(),/Not listed/);
    assert.equal(await page.locator('[data-guide-section="guides"][aria-current="page"]').count(),1,'Guides lit in the section nav');
    const reward=await page.locator('[data-dungeon-row="krao-cave"] .ae-gd-reward').evaluate(n=>getComputedStyle(n).color);
    assert.equal(reward,'rgb(226, 181, 79)','the reward is highlighted in gold');
    assert.deepEqual(page.errors,[]);
    await shot(page,'dungeons-1600');
    console.log('ok overview table');checks++;
    await page.context().close();
  }
  {
    const page=await open('/hub/aetherium/guide/dungeons/',{init:seed({itemLevel:1500})});
    assert.equal(await page.locator('#aeDungeonTable thead th').last().textContent(),'You');
    assert.equal(await page.locator('[data-dungeon-row="krao-cave"] [data-verdict]').getAttribute('data-verdict'),'open');
    assert.equal(await page.locator('[data-dungeon-row="ferocious-horn-den"] [data-verdict]').getAttribute('data-verdict'),'item-level');
    assert.equal(await page.locator('[data-dungeon-row="sanctuary"] [data-verdict]').getAttribute('data-verdict'),'pending');
    assert.match(await page.locator('[data-guide-you]').textContent(),/TESTDAEVA.*Lv 45.*item level 1,500 \(saved 2 days ago\)/);
    console.log('ok overview check for a linked Daeva');checks++;
    await page.context().close();
  }
  for(const id of IDS){
    const page=await open(`/hub/aetherium/guide/dungeons/${id}/`);
    const record=g.findDungeon(data,id);
    assert.equal(await page.locator('#aeScreenTitle').textContent(),record.name);
    assert.equal(await page.title(),`${record.name} | Dungeons | Guide | The Aetherium | AION 2 | ASTRIX PARADOX`);
    assert.match(await page.locator('[data-reward-focus]').textContent(),/Why you go/);
    if(record.difficulties.length)assert.equal(await page.locator('#aeDiffTable tbody tr').count(),record.difficulties.length,`${id} difficulties`);
    else assert.equal(await page.locator('#aeDiffTable').count(),0);
    assert.equal(await page.locator('.ae-gd-bosses li').count(),record.bosses.length,`${id} bosses`);
    assert.equal(await page.locator('.ae-gd-sources, a[href^="https://aion2.fandom.com/"]').count(),0,`${id}: no sources on the page`);
    if(record.cycle.resets==='weekly'||record.cycle.resets==='daily')assert.equal(await page.locator(`[data-reset="${record.cycle.resets}"]`).count(),1,`${id} countdown`);
    assert.deepEqual(page.errors,[],id);
    await page.context().close();
  }
  console.log('ok every dungeon page');checks++;
  {
    const page=await open('/hub/aetherium/guide/dungeons/urugugu-canyon/',{init:seed({itemLevel:1200})});
    assert.equal(await page.locator('#aeCheckResult [data-verdict]').getAttribute('data-verdict'),'open');
    assert.match(await page.locator('[data-check-text]').textContent(),/Aim next for Conquest: item level 1,600, 400 to go/);
    assert.equal(await page.locator('[data-check-diff="conquest"]').getAttribute('class'),'is-closed is-aim');
    assert.match(await page.locator('#aeEntry').textContent(),/item level 1,200 as you typed it, saved 2 days ago/);
    await page.fill('#aeCheckForm input[name="itemLevel"]','1700');
    assert.match(await page.locator('[data-check-text]').textContent(),/Every difficulty is open to you/);
    const memory=await page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.memory.v1')).daevas);
    assert.equal(Object.values(memory)[0].itemLevel,1200,'a by hand check is never saved');
    await page.fill('#aeCheckForm input[name="level"]','20');
    assert.equal(await page.locator('#aeCheckResult [data-verdict]').getAttribute('data-verdict'),'level');
    console.log('ok can you enter, linked Daeva and by hand');checks++;
    await page.context().close();
  }
  {
    const page=await open('/hub/aetherium/guide/dungeons/krao-cave/',{init:seed()});
    assert.equal(await page.locator('#aeCheckResult [data-verdict]').getAttribute('data-verdict'),'unknown','Lv 45, item level not typed');
    await page.context().close();
    const none=await open('/hub/aetherium/guide/dungeons/krao-cave/');
    assert.equal(await none.locator('#aeCheckResult [data-verdict]').getAttribute('data-verdict'),'no-daeva');
    await none.context().close();
    console.log('ok can you enter, no item level and no Daeva');checks++;
  }
  {
    const page=await open('/hub/aetherium/guide/weekly/');
    const weekly=page.locator('[data-reset="weekly"] [data-countdown]');
    const target=Date.parse(await weekly.getAttribute('data-countdown'));
    const d=new Date(target);
    assert.deepEqual([d.getUTCDay(),d.getUTCHours(),d.getUTCMinutes()],[3,7,0],'next Wednesday 07:00 UTC');
    assert.ok(target>Date.now()&&target-Date.now()<=7*86400000);
    assert.equal(new Date(Date.parse(await page.locator('[data-reset="daily"] [data-countdown]').getAttribute('data-countdown'))).getUTCHours(),7);
    assert.match(await weekly.textContent(),/^\d+d \d+h \d\dm$|^\d+h \d\dm \d\ds$/);
    // The daily reset is always under a day away, so its countdown shows seconds and visibly ticks.
    const daily=page.locator('[data-reset="daily"] [data-countdown]');
    const first=await daily.textContent();
    assert.match(first,/^\d+h \d\dm \d\ds$/);
    await page.waitForTimeout(1300);
    assert.notEqual(await daily.textContent(),first,'the countdown ticks');
    for(const group of ['weekly','daily','none'])assert.ok(await page.locator(`[data-reset-group="${group}"] li`).count()>0,group);
    assert.equal(await page.locator('[data-reset-group="daily"] [data-loop-item="nightmare"] .ae-gd-count').textContent(),'2 a day, up to 14');
    await shot(page,'weekly-1600');
    console.log('ok weekly loop and countdown');checks++;
    await page.context().close();
  }
  {
    const page=await open('/hub/aetherium/guide/world/');
    assert.equal(await page.locator('[data-guide-section="world"][aria-current="page"]').count(),1);
    for(const id of ['base-of-dawn','cantas-valley','abyss','spacetime-rift','sealed-dungeons','shugo-festival'])assert.equal(await page.locator(`[data-world="${id}"]`).count(),1,id);
    assert.equal(await page.locator('[data-world="abyss"] a[href="/hub/aetherium/guide/dungeons/draupnir/"]').count(),1);
    assert.match(await page.locator('[data-world="dimensional-invasion"]').textContent(),/Pending/);
    await shot(page,'world-1600');
    console.log('ok world');checks++;
    await page.context().close();
  }
  {
    const page=await open('/hub/aetherium/guide/');
    assert.equal(await page.locator('[data-guide-tile="guides"] a[href="/hub/aetherium/guide/dungeons/"]').count(),1,'Guide home links Dungeons');
    assert.equal(await page.locator('[data-guide-tile="guides"] a[href="/hub/aetherium/guide/weekly/"]').count(),1,'Guide home links the weekly loop');
    assert.equal(await page.locator('[data-guide-tile="world"] .ae-gd-soon-tag').count(),0,'World is no longer coming soon');
    assert.equal(await page.locator('[data-guide-tile="world"] a[href="/hub/aetherium/guide/world/#abyss"]').count(),1);
    console.log('ok Guide home links');checks++;
    await page.context().close();
  }
  for(const [width,height] of [[390,844],[1600,1000]]){
    for(const path of ['dungeons/','dungeons/krao-cave/','dungeons/deus-research-base/','dungeons/nightmare/','dungeons/sanctuary/','weekly/','world/']){
      const page=await open(`/hub/aetherium/guide/${path}`,{width,height,init:seed({itemLevel:1500})});
      assert.equal(await overflow(page),0,`no sideways scroll at ${width}: ${path}`);
      const table=page.locator('.ae-gd-table').first();
      if(await table.count()){
        const row=await table.locator('tbody tr').first().evaluate(n=>getComputedStyle(n).display);
        assert.equal(row,width<720?'block':'table-row',`${path} table at ${width}`);
        const box=await table.boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=width,`${path} table inside the screen at ${width}`);
      }
      if(width===390&&path.startsWith('dungeons/k'))await shot(page,'krao-390');
      if(width===390&&path==='dungeons/')await shot(page,'dungeons-390');
      if(width===390&&path==='weekly/')await shot(page,'weekly-390');
      if(width===1600&&path==='dungeons/krao-cave/')await shot(page,'krao-1600');
      await page.context().close();
    }
  }
  console.log('ok no sideways scroll, tables fold on a phone');checks++;
} finally {
  await browser.close();
  server.close();
}
console.log(`GUIDE_DUNGEONS_TESTS=${checks} passed`);
