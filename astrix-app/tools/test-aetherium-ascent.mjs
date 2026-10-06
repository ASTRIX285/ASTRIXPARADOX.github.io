#!/usr/bin/env node
// The Ascent Plan page (brief feature/aetherium-ascent-plan, 6 Oct 2026) on a local static server, the
// armory Worker mocked (never NCSOFT, never the real Worker):
//   - by hand: a new player picks class, role and level with no armory call; the address stays bookmarkable;
//   - class switch refills the roles (main role first), level clamps to 1 to 45, a pending role says so;
//   - with a Daeva (link or active roster slot): armory fixes come first, class and level are locked to the
//     character, faction colour applies, "plan another class by hand" unlocks the form;
//   - Worker down: a clear message and the plan by hand;
//   - every citation points at a listed source; nav links reach the Ascent Plan from the other pages;
//   - looks: no sideways scroll at 390, 820 and 1600, content clear of the header, usable well inside 4 s.
// AE_SHOTS=<dir outside the repo> also saves screenshots at 390 and 1600.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aion2-mock.invalid';
const fixtureDir=resolve(root,'astrix-app/tools/fixtures/aion2/eu');
const fixture=async name=>JSON.parse(await readFile(resolve(fixtureDir,`${name}.json`),'utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

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

const info=await fixture('astrix285-info'),equipment=await fixture('astrix285-equipment'),search=await fixture('astrix285-search');
const item=await fixture('astrix285-item-mainhand'),board=await fixture('astrix285-daevanion-11');
// A second, Asmodian Daeva for the roster and faction checks (same shape, different identity).
const asmoInfo=structuredClone(info);
Object.assign(asmoInfo.profile,{characterName:'NOCTIS',characterId:'Zm9vYmFyMTIz=',raceId:2,raceName:'Asmodian',serverId:2301,serverName:'Israphel'});
const asmoSearch={list:[{...search.list[0],name:'<strong>NOCTIS</strong>',characterId:'Zm9vYmFyMTIz%3D',race:2,serverId:2301,serverName:'Israphel'}],pagination:search.pagination};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
// A Lv 22 Daeva (as ASTRIX285 is on the live armory, 5 Oct 2026): stigmas still not acquired, an amulet worn in slot 22.
const lv22Info=structuredClone(info);
Object.assign(lv22Info.profile,{characterName:'LEVELED',characterId:'bGV2ZWxlZDIy=',characterLevel:22,serverId:1309,serverName:'Hithanya'});
const lv22Equipment=structuredClone(equipment);
lv22Equipment.equipment.equipmentList.push({...lv22Equipment.equipment.equipmentList[0],id:999000022,name:'Test Amulet',slotPos:22,slotPosName:'Amulet'});

const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    let body=await response.text();
    // The committed config points at the real Worker; every test swaps it for the mock (live) or null (demo).
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    body=swapped;
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    if(down)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
    const asmo=url.searchParams.get('name')==='NOCTIS'||url.searchParams.get('serverId')==='2301';
    const lv22=url.searchParams.get('serverId')==='1309';
    const bodies={
      '/aion2/search':asmo?asmoSearch:search,
      '/aion2/character':lv22?{info:lv22Info,equipment:lv22Equipment}:{info:asmo?asmoInfo:info,equipment},
      '/aion2/item':item,
      '/aion2/daevanion':board
    };
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta})});
  });
  // Icons and portraits come from the NCSOFT CDN; never fetched in tests.
  await context.route(/playnccdn\.com|plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run. Registered last, so it wins over the CDN stub above.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  if(storage)await context.addInitScript(value=>{localStorage.setItem('aetherium.roster.v1',value);},JSON.stringify(storage));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,errors};
}
const style=(page,selector,prop)=>page.$eval(selector,(el,p)=>getComputedStyle(el).getPropertyValue(p).trim(),prop);
const GOLD='rgb(226, 181, 79)';
const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
const ascent=(query='')=>`/hub/aetherium/ascent/${query?`?${query}`:''}`;
const plain=async(page,selector)=>(await page.textContent(selector)).replace(/\s+/g,' ').trim();

await check('by hand: default Gladiator plan, no armory call, bookmarkable',async()=>{
  const {page,context,calls,errors}=await open(ascent(),{live:true});
  assert.deepEqual(calls,[],'A plan by hand never calls the armory');
  assert.equal(await page.inputValue('#aeClass'),'Gladiator');
  assert.equal(await page.inputValue('#aeRole'),'dps');
  assert.equal(await page.inputValue('#aeLevel'),'1');
  assert.match(page.url(),/\/hub\/aetherium\/ascent\/\?class=gladiator&role=dps&level=1$/);
  assert.match(await plain(page,'.ae-ascent-head'),/Gladiator: Greatsword bruiser DPS/);
  assert.match(await plain(page,'#aeNowTitle'),/at Lv 1/);
  assert.equal(await page.isVisible('#aeSource'),false,'No character source line by hand');
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.equal(await page.locator('.ae-stigma-plan li').count(),4);
  assert.equal(await page.locator('.ae-stigma-plan li.is-open').count(),0);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('class switch refills roles, main role first, and keeps the level',async()=>{
  const {page,context}=await open(ascent('class=gladiator&level=30'));
  await page.selectOption('#aeClass','Chanter');
  await page.waitForFunction(()=>document.querySelector('.ae-ascent-head')?.textContent.includes('Chanter'));
  assert.deepEqual(await page.$$eval('#aeRole option',items=>items.map(el=>el.value)),['support','healer','dps']);
  assert.equal(await page.inputValue('#aeRole'),'support');
  assert.match(page.url(),/class=chanter&role=support&level=30$/);
  assert.match(await plain(page,'.ae-stigma-plan'),/Undefeated Mantra/);
  assert.equal(await page.locator('.ae-stigma-plan li.is-open').count(),2,'Lv 30: two stigma slots');
  await page.selectOption('#aeRole','healer');
  await page.waitForFunction(()=>location.search.includes('role=healer'));
  assert.match(await plain(page,'.ae-ascent-head'),/Defensive support/);
  await context.close();
});

await check('level change re-plans and clamps to the cap',async()=>{
  const {page,context}=await open(ascent('class=cleric&role=healer&level=5'));
  assert.equal(await page.locator('.ae-board-plan li.is-open').count(),0);
  await page.fill('#aeLevel','99');
  await page.press('#aeLevel','Enter');
  await page.waitForFunction(()=>document.querySelector('#aeLevel').value==='45');
  assert.match(page.url(),/level=45$/);
  assert.equal(await page.locator('.ae-board-plan li.is-open').count(),5,'All five boards open at 45');
  assert.equal(await page.locator('.ae-stigma-plan li.is-open').count(),4);
  assert.equal(await page.locator('.ae-macro-entry').count(),6,'All six Cleric macro skills usable at 45');
  assert.equal(await page.locator('.ae-macro-delay').count(),5,'A delay between each pair, like the game');
  await context.close();
});

await check('macro reads like the game: listed order, delay between, locked skills added later',async()=>{
  const {page,context}=await open(ascent('class=gladiator&role=dps&level=5'));
  assert.deepEqual(await page.$$eval('.ae-macro-entry .ae-macro-skill',items=>items.map(el=>el.textContent)),['Overhead Slam','Rending Blow']);
  assert.match(await plain(page,'.ae-macro-delay'),/Delay\s*10\s*ms/);
  assert.match(await plain(page,'#aeMacroTitle ~ p'),/Add later: Ruinous Blow \(keep Prepare for Battle up\) \(Lv 14\), Rage Burst \(Lv 32\)/);
  assert.match(await plain(page,'.ae-macro-howto'),/runs its skills in the listed order/);
  assert.doesNotMatch(await page.textContent('#aeMacroTitle ~ *'),/Check in game/);
  await context.close();
});

await check('pending role is honest and offers the main role',async()=>{
  const {page,context}=await open(ascent('class=gladiator&role=tank&level=20'));
  assert.match(await plain(page,'.ae-pending'),/^Not confirmed yet\. No source gives an off-tank Gladiator build yet/);
  assert.equal(await page.locator('#aeNowTitle').count(),0,'No made-up steps for a pending role');
  assert.match(await page.textContent('#aeRole option[value="tank"]'),/no build yet/);
  await page.click('text=Show the Gladiator main role instead');
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true'&&location.search.includes('role=dps'));
  assert.match(await plain(page,'.ae-ascent-head'),/Greatsword bruiser DPS/);
  await context.close();
});

await check('unknown role falls back to the main role with a note',async()=>{
  const {page,context}=await open(ascent('class=ranger&role=healer&level=10'));
  assert.equal(await page.inputValue('#aeRole'),'dps');
  assert.match(await plain(page,'#aePlan > .ae-callout'),/Ranger has no Healer build, so this shows its main role\./);
  await context.close();
});

await check('players stay on the site: no outbound links, no guide names on the page',async()=>{
  for(const query of ['class=gladiator&role=dps&level=22','class=templar&role=tank&level=37','class=ranger&level=14',ref.toString()]){
    const {page,context}=await open(ascent(query));
    const outbound=await page.$$eval('a[href]',links=>links.map(a=>a.href).filter(href=>!href.startsWith(location.origin)));
    assert.deepEqual(outbound,[],`${query}: links that leave the site`);
    const text=await page.textContent('body');
    assert.doesNotMatch(text,/MetaBot|ExpCarry|EZG|Destructoid|games\.gg|mein-mmo|gameplay\.tips|aion2hub|playnews/i,`${query}: names another site`);
    assert.equal(await page.locator('.ae-sources,.ae-cite').count(),0,`${query}: no source list or citation marks`);
    await context.close();
  }
});

await check('Daevanion planner: real board, numbered route, points budget remembered',async()=>{
  const {page,context,calls}=await open(ascent(ref),{live:true});
  await page.waitForSelector('.ae-board-grid');
  assert.deepEqual(calls,['/aion2/character','/aion2/daevanion'],'One board call, for the open board only');
  assert.equal(await page.getAttribute('[data-board-tab="11"]','aria-selected'),'true');
  assert.equal(await page.locator('.ae-board-grid .ae-node').count(),89,'88 nodes plus Start');
  assert.equal(await page.locator('.ae-node[data-kind="start"]').count(),1);
  const art=await page.$$eval('.ae-board-grid .ae-node',items=>items.map(el=>[el.dataset.kind,el.dataset.status,el.querySelector('img.ae-node-art')?.getAttribute('src')??'']));
  const base='https://assets.playnccdn.com/static-aion2/characters/img/daevanion/board_icon_';
  for(const [kind,status,src] of art){
    const grade={'active-skill':'legend','passive-skill':'rare',unique:'unique',stat:'common'}[kind];
    const want=kind==='start'?`${base}start_gladiator.png`:`${base}${grade}${status==='taken'?'_open':''}.png`;
    assert.equal(src,want,`${kind} ${status} uses the game's node art`);
  }
  assert.equal(await page.locator('.ae-node[data-key="true"]').count(),4,'Overhead Slam, Rending Blow, Ruinous Blow, Crushing Wave');
  assert.match(await plain(page,'#aeRouteSummary'),/Enter the points you have/);
  const first=await page.$$eval('.ae-route-list li',items=>items.slice(0,7).map(li=>li.querySelector('strong').textContent));
  assert.equal(first[6],'Overhead Slam +1','Overhead Slam is the first key node, step 7');
  await page.fill('#aePoints','10');
  await page.waitForFunction(()=>/You can take the next/.test(document.querySelector('#aeRouteSummary').textContent));
  assert.match(await plain(page,'#aeRouteSummary'),/You can take the next 8 nodes now \(10 of your 10 points\)\. Step 9 needs 3 more points\./);
  assert.equal(await page.locator('.ae-node[data-status="now"]').count(),8);
  for(const width of [390,1920]){
    await page.setViewportSize({width,height:900});
    const fit=await page.evaluate(()=>{const grid=document.querySelector('.ae-board-grid').getBoundingClientRect();const panel=document.querySelector('#aePlanner').getBoundingClientRect();return grid.left>=panel.left-0.5&&grid.right<=panel.right+0.5;});
    assert.ok(fit,`board fits its panel at ${width}`);
  }
  assert.equal(await page.locator('#aeFlow line').count(),40,'One flow link per route step');
  assert.equal(await page.locator('#aeFlow line[data-status="now"]').count(),8);
  assert.match(await plain(page,'#aeNodePanel'),/Attack Bonus \+3.*Take now.*Taken to reach Overhead Slam \+1/,'Panel opens on the next step');
  await page.click('.ae-node[data-kind="unique"][data-rc="13:3"]');
  assert.match(await plain(page,'#aeNodePanel'),/Cooldown Reduction \+1\.5%.*Later.*4 points.*core corner nodes.*On Ruinous Blow \(45 s\) that is about 0\.7 s back/);
  await page.click('[data-route-node]:nth-child(7)');
  assert.match(await plain(page,'#aeNodePanel'),/Overhead Slam \+1.*key skill 1 of 4/);
  const tile=await page.$eval('.ae-node[data-kind="active-skill"]',el=>{const s=getComputedStyle(el);return [s.clipPath,s.backgroundImage.includes('gradient')];});
  assert.equal(tile[0],'none','Nodes are tiles, not notched action buttons');
  await page.reload();
  await page.waitForSelector('.ae-board-grid');
  assert.equal(await page.inputValue('#aePoints'),'10','Points remembered for this Daeva and board');
  await context.close();
});

await check('Daevanion planner without a Daeva points to the Daeva Card',async()=>{
  const {page,context}=await open(ascent('class=cleric&level=30'));
  assert.match(await plain(page,'#aePlanner'),/Find your Daeva first/);
  assert.equal(await page.getAttribute('#aePlanner a','href'),'/hub/aetherium/');
  await context.close();
});

await check('with a Daeva link: armory fixes first, class and level locked, Elyos gold',async()=>{
  const {page,context,calls}=await open(ascent(ref),{live:true});
  assert.equal(calls[0],'/aion2/character');
  assert.ok(calls.every(path=>['/aion2/character','/aion2/daevanion'].includes(path)),`calls: ${calls}`);
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  assert.equal(await page.isDisabled('#aeClass'),true);
  assert.equal(await page.isDisabled('#aeLevel'),true);
  assert.equal(await page.isDisabled('#aeRole'),false);
  assert.equal(await page.inputValue('#aeLevel'),'12');
  assert.match(await plain(page,'#aeDaeva'),/Planning for ASTRIX285, Gladiator Lv 12 on Meslamtaeda\./);
  const steps=await page.$$eval('.ae-now-item strong',items=>items.map(el=>el.childNodes[0].textContent));
  assert.deepEqual(steps,['Spend points on the Nezekan Daevanion board','Enchant 7 worn items above +0','Level Overhead Slam (now Lv 2)']);
  assert.equal(await page.locator('.ae-now-item[data-kind="armory"] .ae-tag').count(),2);
  assert.match(await plain(page,'.ae-board-plan'),/Nezekan.*0 \/ 88 nodes/);
  assert.match(page.url(),/serverId=1308&characterId=.*&role=dps$/);
  assert.equal(await style(page,'.ae-ascent-head .ae-eyebrow','color'),GOLD);
  await page.click('[data-plan-by-hand]');
  await page.waitForFunction(()=>!document.querySelector('#aeClass').disabled);
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.match(page.url(),/class=gladiator&role=dps&level=12$/);
  assert.match(await plain(page,'#aeNowTitle'),/at Lv 12/);
  await context.close();
});

await check('active roster Daeva is used when the link names no class',async()=>{
  const entry={name:'ASTRIX285',serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:12,raceName:'Elyos',demo:false};
  const storage={entries:[entry],active:`1308:${info.profile.characterId}`};
  const {page,context,calls}=await open(ascent(),{live:true,storage});
  assert.equal(calls[0],'/aion2/character');
  assert.ok(calls.every(path=>['/aion2/character','/aion2/daevanion'].includes(path)),`calls: ${calls}`);
  assert.match(await plain(page,'#aeDaeva'),/Planning for ASTRIX285/);
  await context.close();
  const manual=await open(ascent('class=sorcerer&level=20'),{live:true,storage});
  assert.deepEqual(manual.calls,[],'A class link plans by hand even with an active Daeva');
  assert.match(await plain(manual.page,'#aeDaeva'),/Planning by hand\. Use ASTRIX285 \(Gladiator Lv 12\) instead/);
  await manual.context.close();
});

await check('Worker down: clear message and the plan by hand',async()=>{
  const {page,context}=await open(ascent(ref),{live:true,down:true});
  assert.match(await page.textContent('#aeNotice'),/The armory is unavailable right now, so this plans by hand/);
  assert.equal(await page.isDisabled('#aeClass'),false);
  assert.match(await plain(page,'.ae-ascent-head'),/Gladiator/);
  await context.close();
});

await check('Daeva Card and Gear Ledger link to the Ascent Plan',async()=>{
  for(const path of ['/hub/aetherium/','/hub/aetherium/gear/','/hub/aetherium/ascent/']){
    const {page,context}=await open(path);
    assert.equal(await page.locator('.apx-destination-ribbon a[href="/hub/aetherium/ascent/"]').count(),1,`${path} ribbon`);
    assert.equal(await page.locator('.ax-drawer-links a[href="/hub/aetherium/ascent/"]').count(),1,`${path} drawer`);
    if(path==='/hub/aetherium/'){
      assert.match(await page.getAttribute('#aeAscentLink','href'),/^\/hub\/aetherium\/ascent\//);
    }
    await context.close();
  }
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, clear of the header, fast`,async()=>{
    for(const query of ['class=gladiator&role=dps&level=22',ref.toString()]){
      const started=Date.now();
      const {page,context}=await open(ascent(query),{viewport:{width,height}});
      const took=Date.now()-started;
      assert.ok(took<4000,`${query} ready in ${took} ms`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${query} scrolls sideways by ${overflow}px`);
      const clear=await page.evaluate(()=>{
        const first=[...document.querySelector('main').children].map(el=>el.getBoundingClientRect()).find(r=>r.height>0).top+scrollY;
        const bars=[...document.querySelectorAll('header.apx-destination-header,[data-forge-destination-ribbon]')].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0&&r.width>0);
        return {first,bottom:Math.max(...bars.map(r=>r.bottom))};
      });
      assert.ok(clear.first>=clear.bottom,`content starts under the header (${clear.first} < ${clear.bottom})`);
      const buttonHeight=await page.$eval('.ae-ascent-form button',el=>el.getBoundingClientRect().height);
      assert.ok(buttonHeight>=44,'Show plan at least 44px tall');
      const fields=await page.$$eval('.ae-ascent-form .ae-field,.ae-ascent-form button',items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}));
      for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
        const [a,b]=[fields[i],fields[j]];
        assert.ok(a[2]<=b[0]+0.5||b[2]<=a[0]+0.5||a[3]<=b[1]+0.5||b[3]<=a[1]+0.5,`form controls ${i} and ${j} overlap`);
      }
      if(process.env.AE_SHOTS&&(width===390||width===1600))await page.screenshot({path:resolve(process.env.AE_SHOTS,`ascent-${query.startsWith('class')?'hand':'daeva'}-${width}.png`),fullPage:true});
      await context.close();
    }
  });
}

await check('wide screens use the width: three plan columns at 1920, two at 1280',async()=>{
  const lefts=async page=>page.$$eval('#aeNowTitle,#aeStigmaPlanTitle,#aeDaevTitle',items=>items.map(el=>Math.round(el.closest('.ae-panel').getBoundingClientRect().left)));
  const wide=await open(ascent(ref),{viewport:{width:1920,height:1000}});
  const [now,stigma,daev]=await lefts(wide.page);
  assert.ok(now<stigma&&stigma<daev,`three columns at 1920 (${now}, ${stigma}, ${daev})`);
  const width=await wide.page.$eval('main',el=>el.getBoundingClientRect().width);
  assert.ok(width>=1640,`content spans the screen at 1920 (${width}px)`);
  await wide.context.close();
  const mid=await open(ascent(ref),{viewport:{width:1280,height:900}});
  const [a,b,c]=await lefts(mid.page);
  assert.ok(a<b&&b===c,`two columns at 1280 (${a}, ${b}, ${c})`);
  await mid.context.close();
});

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_ASCENT=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_ASCENT=PASS');
