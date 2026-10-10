#!/usr/bin/env node
// The Aetherium pages (brief feature/aetherium-daeva-card-gear-ledger, 5 Oct 2026; intro art, 9 Oct 2026): Daeva Card
// and the Gear page (the character menu, Skills and Daevanion pages are covered by test-aetherium-character.mjs)
// on a local static server, the armory Worker mocked (never NCSOFT, never the real Worker):
//   - no Daeva: the intro (guide, three steps, search form, 8 class tiles to the plan by hand), no Worker request,
//     official art only from the NCSOFT CDN as listed in intro-art.json, and never a gamer tag or an example Daeva;
//   - live mode: search to summary to the character menu; the Gear page's first paint uses only /aion2/character and
//     item detail loads only when opened;
//   - roster add and remove, faction colour switch (Elyos gold, Asmodian violet, ASTRIX crimson before load);
//   - Worker down, 429, 400: the right words, a Try again, never a stand-in character;
//   - five regions: the Region picker, a server list per region, the region in the URL, the roster and every link;
//   - looks: gold primary action, no horizontal scroll, no overlapping tiles and intro panels aligned at 390, 820 and 1600;
//   - crisp polish (10 Oct 2026): body 16px and nothing under 13px in rem, 200 percent zoom, tight sentence-case labels, token contrast,
//     AX logo, strobe and notch, pills only on chips and counts, the ribbon, 1440 width and no empty band at 1600 and 1920,
//     class icons on roster cards, skeleton shapes, reduced motion and transparency, the Destiny ribbon untouched.
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
const {deriveServers,REGION_TABLE}=await import('./fixtures/aion2/derive-region-fixtures.mjs');
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
// The fixture is Miguel's own character. The mock Worker serves it under a test name: the gamer tag is never page data.
const TEST_NAME='TESTDAEVA';
info.profile.characterName=TEST_NAME;
search.list[0].name=`<strong>${TEST_NAME}</strong>`;
const GAMER_TAG=['ASTRIX','285'].join('');
// Art the mock serves for intro-art.json: made-up CDN addresses (never fetched; the CDN is stubbed) and one foreign host that must never show.
const ART_HOST='https://assets.playnccdn.com/';
const CLASSES=['gladiator','templar','assassin','ranger','sorcerer','spiritmaster','cleric','chanter'];
const mockArt=({foreign=false}={})=>({records:[{id:'intro-art',host:ART_HOST,
  keyArt:{url:`${ART_HOST}test/intro/key-art.png`,alt:'',shows:'test',foundOn:'test',capturedOn:'2026-10-09'},
  npc:{url:`${foreign?'https://example.invalid/':ART_HOST}test/intro/npc.png`,alt:'Guide',shows:'test',foundOn:'test',capturedOn:'2026-10-09'},
  classes:CLASSES.map(slug=>({class:slug,name:slug,art:slug==='chanter'?{pending:true,reason:'test'}:{url:`${ART_HOST}test/intro/${slug}.png`,alt:'',shows:'test',foundOn:'test',capturedOn:'2026-10-09'}})),
  provenance:[{kind:'armory',region:'eu',endpoint:'/en-us/api/gameinfo/classes',capturedOn:'2026-10-05'}]}]});
// A second, Asmodian Daeva for the roster and faction checks (same shape, different identity).
const asmoInfo=structuredClone(info);
Object.assign(asmoInfo.profile,{characterName:'NOCTIS',characterId:'Zm9vYmFyMTIz=',raceId:2,raceName:'Asmodians',serverId:2301,serverName:'Israphel'});
const asmoSearch={list:[{...search.list[0],name:'<strong>NOCTIS</strong>',characterId:'Zm9vYmFyMTIz%3D',race:2,serverId:2301,serverName:'Israphel'}],pagination:search.pagination};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
// A Lv 22 Daeva (as the fixture character was on the live site, 5 Oct 2026): stigmas still not acquired, an amulet worn in slot 22.
const lv22Info=structuredClone(info);
Object.assign(lv22Info.profile,{characterName:'LEVELED',characterId:'bGV2ZWxlZDIy=',characterLevel:22,serverId:1309,serverName:'Hithanya'});
const lv22Equipment=structuredClone(equipment);
lv22Equipment.equipment.equipmentList.push({...lv22Equipment.equipment.equipmentList[0],id:999000022,name:'Test Amulet',slotPos:22,slotPosName:'Amulet'});

const noTitleInfo=structuredClone(info);
noTitleInfo.profile.titleName='';
const bareEquipment=structuredClone(equipment);
bareEquipment.petwing={};
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
// A Legend helm shaped like the live armory's (7 Oct 2026): one skill perk rolled of three, a description.
const perkItem={...structuredClone(item),id:110300999,name:'Red Agate Helm',grade:'Legend',maxEnchantLevel:10,enchantLevel:0,magicStoneSlotCount:3,equipLevel:22,
  subSkillCountMax:3,subStatCount:3,subStatRandom:true,costumes:['Skybright Oath (Helm)'],desc:'A helm for the brave.\nCan be upgraded.',
  subSkills:[{id:11790000,level:1,icon:'https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_GL_SKILL_Passive_009.png',name:'Survival Willpower'}]};
const browser=await chromium.launch();
const realCalls=[];
let failures=0;
const check=async(name,fn)=>{try{await fn();console.log(`  ok  ${name}`);}catch(error){failures++;console.error(`  FAIL ${name}\n${error.stack}`);}};

// ready=false returns as soon as the page has loaded (to look at it while the site is still answering); slow holds the character call for 3.5 s.
async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null,extra={},metaAt=null,servers='ok',noTitle=false,art=null,ready=true,slow=false}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  const urls=[];
  const state={down};
  if(art)await context.route(/\/astrix-app\/games\/aion2\/data\/intro-art\.json/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(art)}));
  await context.route(/\/astrix-app\/pages\/aetherium\/aetherium-config\.mjs/,async route=>{
    const response=await route.fetch();
    let body=await response.text();
    // The committed config points at the real Worker; every test swaps it for the mock (live) or null (not connected).
    const swapped=body.replace(/export const AETHERIUM_WORKER_URL = [^;]+;/,`export const AETHERIUM_WORKER_URL = ${live?`'${WORKER}'`:'null'};`);
    assert.notEqual(swapped,body,'Config Worker URL line found and swapped');
    body=swapped;
    await route.fulfill({response,body});
  });
  await context.route(`${WORKER}/**`,async route=>{
    const url=new URL(route.request().url());
    calls.push(url.pathname);
    urls.push(url);
    const down=state.down;
    if(down)return route.fulfill({status:down===true?502:down,contentType:'application/json',body:JSON.stringify({error:down===true?'armory_unavailable':down===429?'rate_limited':'invalid_region'})});
    const asmo=url.searchParams.get('name')==='NOCTIS'||url.searchParams.get('serverId')==='2301';
    const lv22=url.searchParams.get('serverId')==='1309';
    const bodies={
      '/aion2/search':asmo?asmoSearch:search,
      '/aion2/character':lv22?{info:lv22Info,equipment:lv22Equipment}:{info:asmo?asmoInfo:info,equipment},
      '/aion2/item':url.searchParams.get('slotPos')==='1'?item:perkItem,
      '/aion2/daevanion':board
    };
    if(url.pathname==='/aion2/servers'){
      if(servers==='down')return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'armory_unavailable'})});
      bodies['/aion2/servers']=servers==='empty'?{serverList:[]}:deriveServers(url.searchParams.get('region'));
    }
    if(noTitle&&url.pathname==='/aion2/character')bodies['/aion2/character']={info:noTitleInfo,equipment:bareEquipment};
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,body:'{}'});
    if(slow&&url.pathname==='/aion2/character')await new Promise(done=>setTimeout(done,3500));
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...body,meta:{...meta,...(metaAt?{fetchedAt:new Date(metaAt).toISOString()}:{}),region:url.searchParams.get('region')}})});
  });
  // Icons and portraits come from the NCSOFT CDN; never fetched in tests.
  // A 1x1 PNG stands in for every NCSOFT icon, so icons keep their <img> as they do live.
  await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  // Never the real Worker or NCSOFT: a request to either is blocked and fails the run. Registered last, so it wins over the CDN stub above.
  await context.route(/aetherium-worker\.[^/]*workers\.dev|api-search\.plaync\.com|aion2\.plaync\.com/,route=>{realCalls.push(route.request().url());return route.abort();});
  if(storage)await context.addInitScript(value=>{localStorage.setItem('aetherium.roster.v1',value);},JSON.stringify(storage));
  if(Object.keys(extra).length)await context.addInitScript(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},extra);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}${path}`);
  if(ready)await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,urls,errors,state};
}
// Everything a visitor can read on the page: the text, the title and description, and every visible attribute.
const visibleText=page=>page.evaluate(()=>[document.body.innerText,document.title,document.querySelector('meta[name=description]')?.content,
  ...[...document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')].map(n=>[n.placeholder,n.getAttribute('aria-label'),n.title,n.getAttribute('alt')].join(' '))].join('\n'));
const imageSources=page=>page.$$eval('main img',images=>images.map(img=>img.getAttribute('src')));
/** No gamer tag, no example Daeva, none of the fixture character's own title, stats or portrait anywhere a visitor can see. */
async function assertNoGamerTag(page,label){
  const text=await visibleText(page);
  assert.doesNotMatch(text,new RegExp(GAMER_TAG,'i'),`${label}: the gamer tag shows`);
  assert.doesNotMatch(text,/Example data/i,`${label}: "Example data" shows`);
  assert.doesNotMatch(text,/example Daeva/i,`${label}: an example Daeva is mentioned`);
  assert.doesNotMatch(text,/Draped in Sky|6,532/,`${label}: the fixture character's title or stats show`);
  for(const src of await imageSources(page))assert.doesNotMatch(src??'',/profileimg\.plaync\.com|ASTRIX285/i,`${label}: a portrait shows (${src})`);
}
const boxOf=(page,selector)=>page.$eval(selector,el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,`${message} (${a} vs ${b})`);
// Saved Daevas for the roster tests. region and server pick the roster they belong to.
const saved=(name,serverId,serverName,region='eu',extra={})=>({name,serverId,serverName,characterId:`${name.toLowerCase()}-${serverId}=`,className:'Gladiator',level:20,raceName:serverId>=2000?'Asmodians':'Elyos',raceId:serverId>=2000?2:1,region,demo:false,...extra});
const storeV2=(entries,active=null)=>{
  const rosters={};
  for(const entry of entries){(rosters[`${entry.region}:${entry.serverId}`]??={region:entry.region,serverId:entry.serverId,serverName:entry.serverName,entries:[]}).entries.push(entry);}
  const first=entries.find(entry=>`${entry.serverId}:${entry.characterId}`===active)??entries[0];
  return {rosters,active:first?{roster:`${first.region}:${first.serverId}`,key:`${first.serverId}:${first.characterId}`}:null};
};
const v2=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.roster.v2')));
const keyOf=entry=>`${entry.serverId}:${entry.characterId}`;
const style=(page,selector,prop)=>page.$eval(selector,(el,p)=>getComputedStyle(el).getPropertyValue(p).trim(),prop);
const GOLD='rgb(226, 181, 79)',VIOLET='rgb(154, 107, 255)',GOLD_HI='rgb(244, 210, 124)';

await check('no Daeva: the intro shows (guide, three steps, search form, 8 class tiles to the plan by hand), no Worker call, no character',async()=>{
  for(const live of [true,false]){
    const {page,context,calls,errors}=await open('/hub/aetherium/',{live});
    assert.deepEqual(calls,[],`live=${live}: no Worker call before a Daeva is picked`);
    assert.equal(await page.isVisible('#aeIntro'),true,'The intro shows');
    assert.match(await page.textContent('#aeIntroTitle'),/Welcome to The Aetherium, Daeva\./);
    assert.deepEqual(await page.$$eval('.ae-steps li strong',items=>items.map(el=>el.textContent)),['Pick your region.','Type your in-game character name.','See your Daeva.'],'Three steps, in order');
    assert.equal(await page.isVisible('#aeSearch'),true,'The search form is there');
    assert.deepEqual(await page.$$eval('label.ae-field > span',nodes=>nodes.map(n=>n.textContent)),['Character name','Region','Server']);
    assert.equal(await page.getAttribute('#aeNameInput','placeholder'),'Type your in-game character name');
    assert.equal(await page.isVisible('#aeClasses'),true,'The class tiles show');
    const tiles=await page.$$eval('#aeClasses [data-class]',items=>items.map(el=>[el.dataset.class,el.getAttribute('href'),el.textContent.trim()]));
    assert.deepEqual(tiles.map(t=>t[0]),CLASSES,'All 8 classes, in game order');
    assert.deepEqual(tiles.map(t=>t[1]),CLASSES.map(slug=>`/hub/aetherium/ascent/?class=${slug}&level=1`),'Each tile opens the Ascent Plan by hand for that class at Lv 1');
    assert.deepEqual(tiles.map(t=>t[2]),['Gladiator','Templar','Assassin','Ranger','Sorcerer','Spiritmaster','Cleric','Chanter']);
    assert.equal(await page.isHidden('#aeSummary'),true,'No character card');
    assert.equal(await page.locator('#aeName, .ae-portrait, .ae-tiles').count(),0,'No name, portrait or stats of anyone');
    assert.equal(await page.isHidden('#aeSource'),true,'No data line: nothing was read');
    assert.equal(await page.isHidden('#aeNotice'),true,'No notice: nothing went wrong');
    assert.equal(await page.getAttribute('body','data-faction'),'astrix','ASTRIX crimson with no character');
    assert.equal(await page.locator('.ae-roster-slot').count(),8,'8 roster slots');
    await assertNoGamerTag(page,`intro live=${live}`);
    assert.deepEqual(await imageSources(page),[],'No art until the art data has an official image');
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

await check('no Daeva: a class tile opens the Ascent Plan by hand for that class, even with a saved Daeva',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([]))}});
  await page.click('[data-class="sorcerer"]');
  await page.waitForFunction(()=>location.pathname==='/hub/aetherium/ascent/'&&document.documentElement.dataset.aetheriumReady==='true');
  assert.equal(await page.inputValue('#aeClass'),'Sorcerer');
  assert.equal(await page.inputValue('#aeLevel'),'1');
  assert.deepEqual(calls,[],'A plan by hand never calls the official site');
  await assertNoGamerTag(page,'ascent by hand from a tile');
  await context.close();
});

await check('no Worker configured: a search says our side, offers Try again, and the intro stays',async()=>{
  const {page,context}=await open('/hub/aetherium/');
  await page.fill('#aeNameInput','SomeoneElse');
  await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.equal(await page.textContent('#aeNotice'),'Something went wrong on our side. Try again in a minute.');
  assert.equal(await page.isVisible('#aeRetry [data-retry]'),true,'A Try again button');
  assert.equal(await page.isVisible('#aeIntro'),true,'The intro stays');
  assert.equal(await page.isHidden('#aeSummary'),true,'Nothing stands in for a character');
  await assertNoGamerTag(page,'not connected');
  await context.close();
});

await check('the intro art comes only from intro-art.json on the NCSOFT CDN, after the words, lazy, sized, no referrer',async()=>{
  const {page,context,errors}=await open('/hub/aetherium/',{live:true,art:mockArt()});
  await page.waitForSelector('#aeIntro.has-art');
  await page.waitForSelector('#aeIntro.has-npc');
  const hero=await page.$eval('#aeIntroArt img',img=>({src:img.getAttribute('src'),width:img.getAttribute('width'),height:img.getAttribute('height'),ref:img.getAttribute('referrerpolicy'),alt:img.getAttribute('alt')}));
  assert.equal(hero.src,`${ART_HOST}test/intro/key-art.png`,'Key art in the hero when the data has it');
  assert.ok(hero.width&&hero.height,'Width and height set');
  assert.equal(hero.ref,'no-referrer');
  assert.equal(await page.getAttribute('#aeIntroNpc img','src'),`${ART_HOST}test/intro/npc.png`,'The NPC guide beside the speech panel');
  assert.equal(await page.getAttribute('#aeIntroNpc img','alt'),'Guide');
  const tiles=await page.$$eval('#aeClasses [data-class]',items=>items.map(el=>{const img=el.querySelector('img');return {slug:el.dataset.class,src:img?.getAttribute('src')??null,lazy:img?.getAttribute('loading')??null,ref:img?.getAttribute('referrerpolicy')??null,w:img?.getAttribute('width')??null,h:img?.getAttribute('height')??null};}));
  for(const tile of tiles.slice(0,7)){
    assert.equal(tile.src,`${ART_HOST}test/intro/${tile.slug}.png`,`${tile.slug} tile shows its class art`);
    assert.equal(tile.lazy,'lazy','Class tiles sit below the fold: lazy');
    assert.equal(tile.ref,'no-referrer');assert.ok(tile.w&&tile.h,'sized');
  }
  assert.equal(tiles[7].src,null,'A pending class shows no art and no stand-in');
  assert.equal(await page.textContent('[data-class="chanter"] .ae-class-name'),'Chanter');
  const listed=new Set([`${ART_HOST}test/intro/key-art.png`,`${ART_HOST}test/intro/npc.png`,...CLASSES.slice(0,7).map(slug=>`${ART_HOST}test/intro/${slug}.png`)]);
  for(const src of await imageSources(page)){
    assert.ok(src.startsWith(ART_HOST),`Only the NCSOFT CDN: ${src}`);
    assert.ok(listed.has(src),`Only images listed in intro-art.json: ${src}`);
  }
  assert.deepEqual(errors,[]);
  await context.close();
  // An entry on any other host is never shown, whatever the data file says.
  const foreign=await open('/hub/aetherium/',{live:true,art:mockArt({foreign:true})});
  await foreign.page.waitForSelector('#aeIntro.has-art');
  assert.equal(await foreign.page.locator('#aeIntroNpc img').count(),0,'A foreign-host NPC entry is left out');
  assert.equal(await foreign.page.isHidden('#aeIntroNpc'),true);
  for(const src of await imageSources(foreign.page))assert.ok(src.startsWith(ART_HOST),`Only the NCSOFT CDN: ${src}`);
  await foreign.context.close();
});

await check('the committed intro-art.json lists only NCSOFT CDN addresses, every pending entry has a reason',async()=>{
  const data=JSON.parse(await readFile(resolve(root,'astrix-app/games/aion2/data/intro-art.json'),'utf8'));
  const record=data.records.find(item=>item.id==='intro-art');
  assert.equal(record.host,ART_HOST);
  const entries=[record.keyArt,record.npc,...record.classes.map(item=>item.art)];
  assert.equal(record.classes.length,8);
  assert.deepEqual(record.classes.map(item=>item.class),CLASSES,'The 8 classes, in game order');
  for(const entry of entries){
    if(entry.pending){assert.equal(entry.pending,true);assert.ok(entry.reason,'A pending entry says why');continue;}
    assert.ok(entry.url.startsWith(ART_HOST),`Official CDN only: ${entry.url}`);
    for(const key of ['shows','foundOn','capturedOn'])assert.ok(entry[key],`${entry.url} records ${key}`);
    assert.match(entry.capturedOn,/^\d{4}-\d{2}-\d{2}$/);
  }
  assert.doesNotMatch(JSON.stringify(data),new RegExp(GAMER_TAG.replace(/\d+$/,'\\d+')),'No gamer tag in the art data');
});

await check('live: search to summary uses search then one character call',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/',{live:true});
  assert.deepEqual(calls,[],'No Daeva picked yet: no Worker call');
  assert.equal(await page.isHidden('#aeSource'),true,'No data line before a read');
  await page.fill('#aeNameInput',TEST_NAME);
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeSource').textContent.startsWith('Read from the official AION 2 site'));
  assert.deepEqual(calls,['/aion2/search','/aion2/character']);
  assert.match(await page.textContent('#aeSource'),/^Read from the official AION 2 site just now\.$/);
  assert.match(page.url(),/serverId=1308&characterId=.*&region=eu$/,'Bookmarkable URL carries the region');
  assert.match(await page.getAttribute('#aeGearLink','href'),/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=.*&region=eu$/,'View full setup opens the character menu');
  assert.match(await page.getAttribute('.ae-tile.is-link a','href'),/^\/hub\/aetherium\/daevanion\/\?serverId=1308&characterId=.*&region=eu&class=gladiator&board=11$/,'The Daevanion tile opens the first open board');
  assert.equal(await page.isHidden('#aeIntro'),true,'The intro goes once a Daeva is on screen');
  assert.equal(await page.isHidden('#aeClasses'),true);
  assert.equal(await page.textContent('#aeName'),TEST_NAME);
  assert.match(await page.textContent('#aeSummary .ae-eyebrow'),/^Your Daeva/,'Never "Example"');
  await context.close();
});

await check('a saved roster Daeva skips the intro and opens its own card',async()=>{
  const mine=saved(TEST_NAME,1308,'Meslamtaeda','eu',{characterId:info.profile.characterId});
  const {page,context,calls}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([mine]))}});
  assert.deepEqual(calls,['/aion2/character'],'Straight to the saved Daeva');
  assert.equal(await page.isHidden('#aeIntro'),true,'No intro for a returning visitor');
  assert.equal(await page.isHidden('#aeClasses'),true);
  assert.equal(await page.isVisible('#aeSummary'),true);
  assert.equal(await page.textContent('#aeName'),TEST_NAME);
  assert.match(await page.textContent('#aeSource'),/^Read from the official AION 2 site just now\.$/);
  await context.close();
});

await check('old demo roster entries are dropped on read; real entries are kept untouched',async()=>{
  const real=saved('KEEPME',1308,'Meslamtaeda','eu',{level:31,title:'Kept Title'});
  const other=saved('ALSOKEPT',2301,'Israphel','eu');
  const oldDemo={...saved('OLDEXAMPLE',1308,'Meslamtaeda','eu'),demo:true};
  const v2Store=storeV2([real,oldDemo,other],keyOf(oldDemo));
  const {page,context,calls}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(v2Store)}});
  const store=await v2(page);
  const names=Object.values(store.rosters).flatMap(bucket=>bucket.entries).map(entry=>entry.name).sort();
  assert.deepEqual(names,['ALSOKEPT','KEEPME'],'The demo entry is gone, the real ones stay');
  const kept=store.rosters['eu:1308'].entries[0];
  assert.deepEqual([kept.name,kept.level,kept.title,kept.characterId],['KEEPME',31,'Kept Title',real.characterId],'A real entry keeps every field');
  assert.equal('demo' in kept,false,'The old flag is not written back');
  assert.equal(store.active,null,'The dropped entry is no longer the active Daeva');
  assert.equal(await page.isHidden('#aeIntro'),true,'With the example gone, the first real saved Daeva opens instead');
  assert.deepEqual(calls,['/aion2/character'],'One read, for that real Daeva');
  assert.doesNotMatch(await page.textContent('#aeRoster'),/OLDEXAMPLE|example/i);
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1);
  // The real Daeva's own card is on screen (mocked live data), so only the gamer tag and the example words are ruled out here.
  assert.doesNotMatch(await visibleText(page),new RegExp(`${GAMER_TAG}|Example data|example Daeva`,'i'),'No gamer tag or example on the page');
  assert.ok(calls.every(path=>path==='/aion2/character'),`Only the active Daeva's read: ${calls}`);
  await context.close();
  // The old v1 list is filed the same way.
  const v1={entries:[real,oldDemo],active:keyOf(oldDemo)};
  const moved=await open('/hub/aetherium/',{live:true,storage:v1});
  assert.deepEqual(Object.values((await v2(moved.page)).rosters).flatMap(bucket=>bucket.entries).map(entry=>entry.name),['KEEPME']);
  await moved.context.close();
});

await check('live Gear page: one call for first paint, item detail on demand',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const {page,context,calls,errors}=await open(`/hub/aetherium/gear/equipment/?${ref}`,{live:true});
  assert.deepEqual(calls,['/aion2/character'],'First paint: only /aion2/character');
  assert.equal(await page.locator('#aeGear [data-slot]').count(),8);
  assert.match(await page.textContent('#aeAccessories'),/none worn/);
  assert.equal(await page.locator('.ae-stigma, .ae-board').count(),0,'Stigmas and Daevanion boards have their own pages');
  assert.equal(await page.locator('#aeItem').count(),0,'No side text panel: items open as a card');
  await page.click('[data-slot="0"]');
  await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-item-enchant'));
  assert.equal(await page.textContent('#aeInfoTitle'),'Twilight Greatsword');
  assert.match(await page.textContent('#aeInfo .ae-card-head p'),/Main Hand · Greatsword · Rare/);
  assert.equal(await page.locator('#aeInfo .ae-pips i').count(),5,'Enchant pips up to the max');
  assert.equal(await page.locator('#aeInfo .ae-pips i.is-on').count(),2);
  assert.match(await page.textContent('#aeInfo .ae-card-status'),/Enchant it: 3 more levels to \+5/);
  assert.match(await page.textContent('#aeInfo .ae-item-rows'),/Attack48 \+2/);
  assert.equal(await page.locator('#aeInfo .ae-sockets i').count(),2,'Manastone slots drawn as sockets');
  assert.match(await page.textContent('[data-slot="0"] .ae-slot-meta'),/\+2 of 5/,'Tile picks up max enchant from the detail');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#aeInfo'),true);
  await page.click('[data-slot="1"]');
  await page.waitForFunction(()=>document.querySelector('#aeInfo .ae-perk-list'));
  assert.deepEqual(await page.$$eval('#aeInfo .ae-perk',items=>items.map(el=>el.textContent.replace(/\s+/g,' ').trim())),['Survival Willpower+1','Empty perk slot','Empty perk slot'],'Skill perks: rolled and empty');
  assert.match(await page.getAttribute('#aeInfo .ae-perk img','src'),/ICON_GL_SKILL_Passive_009\.png$/);
  assert.match(await page.textContent('#aeInfo'),/Wear from Lv 22.*Look: Skybright Oath \(Helm\).*A helm for the brave\.Can be upgraded\./s);
  await page.click('#aeInfo .ae-info-close');
  assert.equal(await page.isHidden('#aeInfo'),true);
  assert.deepEqual(calls,['/aion2/character','/aion2/item','/aion2/item']);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('Lv 22 with no stigma acquired, extra worn slot: honest copy',async()=>{
  const ref=new URLSearchParams({serverId:'1309',characterId:lv22Info.profile.characterId});
  const card=await open(`/hub/aetherium/?${ref}`,{live:true});
  assert.match(await card.page.textContent('.ae-tiles'),/StigmasNone unlocked yet/);
  await card.context.close();
  const menu=await open(`/hub/aetherium/gear/?${ref}`,{live:true});
  assert.match(await menu.page.textContent('[data-view="skills"] .ae-menu-status'),/0 of 13 stigmas/);
  await menu.context.close();
  const {page,context,errors}=await open(`/hub/aetherium/gear/equipment/?${ref}`,{live:true});
  assert.equal(await page.locator('#aeGear [data-slot]').count(),9,'The extra worn slot is shown');
  assert.match(await page.textContent('#aeGear'),/AmuletTest Amulet/);
  assert.match(await page.textContent('#aeAccessories'),/Other slots, such as accessories, show here once something is worn in them\./);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('roster drops a blank saved Daeva and the strobe runs blue',async()=>{
  const good={name:'KEPTONE',serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:23,raceName:'Elyos',demo:false};  // no region saved: an old entry opens as Europe
  const blank={serverId:1308,characterId:'',className:undefined,level:undefined};
  const {page,context}=await open('/hub/aetherium/',{storage:{entries:[good,blank],active:'1308:'}});
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1,'The blank entry is gone');
  assert.equal(await page.inputValue('#aeNameInput'),'','The name box starts empty');
  assert.equal(await page.getAttribute('#aeNameInput','placeholder'),'Type your in-game character name','A prompt, not a name');
  assert.equal(await page.textContent('#aeRosterCount'),'Meslamtaeda · EU · 1 of 8','Heading names the server, short region and count');
  assert.equal(await page.locator('.ae-roster-slot.is-active').count(),1,'The remaining Daeva becomes active');
  const stroke=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--ax-stroke').trim());
  assert.equal(stroke,'#4fb6ff','Strobe colour is the bright blue');
  await context.close();
});

await check('roster add and remove, faction colour switch (a roster per server)',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true});
  assert.equal(await page.getAttribute('body','data-faction'),'astrix','Crimson until a Daeva is read');
  await page.fill('#aeNameInput',TEST_NAME);await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===1);
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  await page.fill('#aeNameInput','NOCTIS');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent.startsWith('Israphel'));
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1,'NOCTIS is on another server: it has its own roster');
  assert.equal(await page.getAttribute('body','data-faction'),'asmodian');
  assert.equal(await style(page,'.ae-chip-faction','color'),VIOLET,'Asmodian accent');
  assert.match(await page.textContent('.ae-roster-slot.is-active'),/NOCTIS/);
  assert.equal(await page.textContent('#aeRosterCount'),'Israphel · EU · 1 of 8');
  await page.click('[data-roster-remove^="2301:"]');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1,'The other server\'s roster is shown after the last Daeva is removed');
  assert.equal(await page.textContent('#aeRosterCount'),'Meslamtaeda · EU · 1 of 8');
  const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('aetherium.roster.v2')));
  const all=Object.values(saved.rosters).flatMap(bucket=>bucket.entries);
  assert.equal(all.length,1);
  assert.equal(all[0].name,TEST_NAME);
  await context.close();
});

await check('region picker: five official names, Europe by default, server list per region',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/',{live:true});
  assert.deepEqual(await page.$$eval('#aeRegion option',options=>options.map(o=>[o.value,o.textContent])),REGION_TABLE.map(row=>[row.code,row.name]));
  assert.equal(await page.inputValue('#aeRegion'),'eu','Europe when nothing was used before');
  assert.equal(await page.textContent('#aeServer option[value=""]'),'Any server in Europe');
  assert.equal(await page.locator('#aeServer option[value]:not([value=""])').count(),18,'Europe first paint uses the small static list (no call)');
  assert.deepEqual(calls,[],'No Worker call before a Daeva or another region is picked');
  const labels=await page.$$eval('label.ae-field > span',nodes=>nodes.map(n=>n.textContent));
  assert.deepEqual(labels,['Character name','Region','Server']);
  for(const row of REGION_TABLE.filter(item=>item.code!=='eu')){
    await page.selectOption('#aeRegion',row.code);
    await page.waitForFunction(name=>document.querySelector('#aeServer option[value=""]').textContent===`Any server in ${name}`,row.name);
    assert.equal(await page.locator('#aeServer option[value]:not([value=""])').count(),row.servers,`${row.code} lists ${row.servers} servers`);
    assert.equal(await page.evaluate(()=>localStorage.getItem('aetherium.region.v1')),row.code,'Remembered on this device');
  }
  assert.equal(calls.filter(path=>path==='/aion2/servers').length,4,'One server list call per region switch');
  await page.selectOption('#aeRegion','eu');
  await page.waitForFunction(()=>document.querySelector('#aeServer option[value=""]').textContent==='Any server in Europe');
  assert.equal(await page.locator('#aeServer option[value]:not([value=""])').count(),18);
  await context.close();
});

await check('region picker starts from the last region used on this device',async()=>{
  const {page,context,urls}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.region.v1':'nae'}});
  assert.equal(await page.inputValue('#aeRegion'),'nae');
  await page.waitForFunction(()=>document.querySelector('#aeServer option[value=""]').textContent==='Any server in North America - East');
  assert.equal(urls.find(url=>url.pathname==='/aion2/servers').searchParams.get('region'),'nae');
  // A bad stored value falls back to Europe, never to a region we do not list.
  const bad=await open('/hub/aetherium/',{live:true,extra:{'aetherium.region.v1':'na'}});
  assert.equal(await bad.page.inputValue('#aeRegion'),'eu');
  await bad.context.close();
  await context.close();
});

await check('region travels: search, URL, roster card and every link',async()=>{
  const {page,context,urls}=await open('/hub/aetherium/',{live:true});
  await page.selectOption('#aeRegion','as');
  await page.waitForFunction(()=>document.querySelector('#aeServer option[value=""]').textContent==='Any server in Asia');
  await page.fill('#aeNameInput',TEST_NAME);
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeSource').textContent.startsWith('Read from the official AION 2 site'));
  const reads=urls.filter(url=>url.pathname==='/aion2/search'||url.pathname==='/aion2/character');
  assert.deepEqual(reads.map(url=>url.searchParams.get('region')),['as','as'],'Search and character read Asia');
  assert.match(page.url(),/[?&]region=as(&|$)/);
  assert.match(await page.textContent('.ae-chip-faction + li + li'),/^Asia$/,'Summary names the region beside the server');
  assert.match(await page.textContent('.ae-roster-slot.is-filled'),/Meslamtaeda · Asia/,'Roster card shows region with the server');
  const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('aetherium.roster.v2')));
  const savedEntry=Object.values(saved.rosters)[0].entries[0];
  assert.equal(savedEntry.region,'as');
  assert.equal(savedEntry.raceId,1);
  for(const selector of ['#aeAscentLink','#aeGearLink','.ae-tile.is-link a']){
    for(const link of await page.$$eval(selector,nodes=>nodes.map(n=>n.getAttribute('href')))){
      assert.match(link,/[?&]region=as(&|$)/,`${selector} keeps the region: ${link}`);
    }
  }
  // Following the link keeps Asia all the way to the Worker.
  const link=await page.getAttribute('#aeGearLink','href');
  await context.close();
  const next=await open(link,{live:true});
  assert.equal(next.urls.find(url=>url.pathname==='/aion2/character').searchParams.get('region'),'as');
  for(const href of await next.page.$$eval('.ae-menu-card',nodes=>nodes.map(n=>n.getAttribute('href')))){
    assert.match(href,/[?&]region=as(&|$)/,`Menu card keeps the region: ${href}`);
  }
  assert.match(await next.page.textContent('#aeHeader .ae-subline'),/Asia/);
  await next.context.close();
});

await check('old links and old roster entries open as Europe',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const {page,context,urls}=await open(`/hub/aetherium/gear/?${ref}`,{live:true});
  assert.equal(urls.find(url=>url.pathname==='/aion2/character').searchParams.get('region'),'eu');
  for(const href of await page.$$eval('.ae-menu-card',nodes=>nodes.map(n=>n.getAttribute('href')))) assert.match(href,/[?&]region=eu(&|$)/);
  await context.close();
  const bad=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId,region:'na'});
  const unknown=await open(`/hub/aetherium/gear/?${bad}`,{live:true});
  assert.equal(unknown.urls.find(url=>url.pathname==='/aion2/character').searchParams.get('region'),'eu','An unknown code is Europe, never sent on');
  await unknown.context.close();
  const old={name:TEST_NAME,serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:23,raceName:'Elyos'};
  const roster=await open('/hub/aetherium/',{live:true,storage:{entries:[old],active:`1308:${info.profile.characterId}`}});
  assert.match(await roster.page.textContent('.ae-roster-slot.is-filled'),/Meslamtaeda · EU/);
  assert.equal(roster.urls.find(url=>url.pathname==='/aion2/character').searchParams.get('region'),'eu');
  await roster.context.close();
});

await check('Asmodians (plural, raceId 2): violet on the card and the roster',async()=>{
  const old={name:'NOCTIS',serverId:2301,serverName:'Israphel',characterId:'Zm9vYmFyMTIz=',className:'Gladiator',level:12,raceName:'Asmodians',raceId:2,region:'eu'};
  const named={...old,name:'NAMEONLY',characterId:'bmFtZW9ubHk=',raceId:undefined};
  const {page,context}=await open('/hub/aetherium/',{storage:{entries:[old,named],active:'2301:Zm9vYmFyMTIz='}});
  const factions=await page.$$eval('.ae-roster-slot.is-filled',nodes=>nodes.map(n=>n.dataset.faction));
  assert.deepEqual(factions,['asmodian','asmodian'],'Keyed on raceId, with the plural name as the fallback');
  await context.close();
  const live=await open(`/hub/aetherium/?${new URLSearchParams({serverId:'2301',characterId:asmoInfo.profile.characterId})}`,{live:true});
  assert.equal(await live.page.getAttribute('body','data-faction'),'asmodian');
  assert.equal(await style(live.page,'.ae-chip-faction','color'),VIOLET);
  assert.equal(await live.page.textContent('.ae-chip-faction'),'Asmodian','The chip uses the canonical name');
  await live.context.close();
});

await check('no visible "armory" or "EU" text on the Daeva Card and Gear page',async()=>{
  for(const live of [false,true]){
    for(const path of ['/hub/aetherium/','/hub/aetherium/gear/equipment/']){
      const {page,context}=await open(path,{live});
      const text=await page.evaluate(()=>document.body.innerText+'\n'+[...document.querySelectorAll('[placeholder],[aria-label],[title]')].map(n=>[n.placeholder,n.getAttribute('aria-label'),n.title].join(' ')).join('\n')+'\n'+document.title+'\n'+document.querySelector('meta[name=description]').content);
      assert.doesNotMatch(text,/armory/i,`${path} live=${live}`);
      assert.doesNotMatch(text,/\bEU\b/,`${path} live=${live}`);
      await context.close();
    }
  }
  const {page,context}=await open('/hub/aetherium/');
  assert.equal(await page.textContent('.ae-search-note'),'Reads public character info from the official AION 2 site. No login, nothing to install. Results are kept for 10 minutes.');
  await context.close();
});

await check('Worker down on search: the plain message, Try again, the intro stays, never a stand-in character',async()=>{
  const {page,context,state}=await open('/hub/aetherium/',{live:true,down:true});
  await page.fill('#aeNameInput',TEST_NAME);
  await page.click('#aeFind');
  await page.waitForFunction(()=>/not answering/.test(document.querySelector('#aeNotice').textContent));
  assert.equal(await page.textContent('#aeNotice'),'The official AION 2 site is not answering right now. Try again in a minute.');
  assert.equal(await page.textContent('#aeFind'),'Find character');
  assert.equal(await page.isVisible('#aeIntro'),true,'The intro stays while nothing is on screen');
  assert.equal(await page.isHidden('#aeSummary'),true,'No example Daeva');
  assert.equal(await page.isHidden('#aeSource'),true);
  await assertNoGamerTag(page,'Worker down on search');
  // Try again repeats the same search once the site answers.
  state.down=false;
  await page.click('#aeRetry [data-retry]');
  await page.waitForFunction(()=>document.querySelector('#aeName')?.textContent);
  assert.equal(await page.textContent('#aeName'),TEST_NAME);
  assert.equal(await page.isHidden('#aeNotice'),true,'The notice clears');
  assert.equal(await page.isHidden('#aeRetry'),true);
  assert.equal(await page.isHidden('#aeIntro'),true);
  await context.close();
});

await check('roster per server: 8 slots on each server, the full message, the heading names server, short region and count',async()=>{
  const eight=Array.from({length:8},(_,i)=>saved(`FULL${i}`,1308,'Meslamtaeda'));
  const other=saved('NOCTIS',2301,'Israphel');
  const {page,context}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([...eight,other]))}});
  assert.equal(await page.textContent('#aeRosterCount'),'Meslamtaeda · EU · 8 of 8');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),8);
  assert.equal(await page.locator('.ae-roster-slot.is-empty').count(),0);
  assert.equal(await page.isVisible('#aeRosterSwitchBox'),true,'Two servers have Daevas: the switcher shows');
  await page.fill('#aeNameInput',TEST_NAME);await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.equal(await page.textContent('#aeNotice'),`Meslamtaeda already has 8 Daevas saved. Remove one to add ${TEST_NAME}.`);
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),8,'Nothing was added');
  assert.equal(JSON.stringify((await v2(page)).rosters['eu:1308'].entries.length),'8');
  await page.click('[data-roster-remove="1308:full0-1308="]');
  assert.equal(await page.textContent('#aeRosterCount'),'Meslamtaeda · EU · 7 of 8');
  await page.fill('#aeNameInput',TEST_NAME);await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent==='Meslamtaeda · EU · 8 of 8');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),8,'The new Daeva took the freed slot');
  await context.close();
});

await check('roster per server: a new Daeva goes to its own server and that roster is shown; the switcher lists only used servers',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([saved('NOCTIS',2301,'Israphel')]))}});
  assert.equal(await page.isHidden('#aeRosterSwitchBox'),true,'One server with Daevas: no switcher');
  assert.equal(await page.textContent('#aeRosterCount'),'Israphel · EU · 1 of 8');
  await page.fill('#aeNameInput',TEST_NAME);await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent==='Meslamtaeda · EU · 1 of 8');
  assert.equal(await page.isVisible('#aeRosterSwitchBox'),true);
  assert.deepEqual(await page.$$eval('#aeRosterSwitch option',options=>options.map(o=>o.textContent)),['Israphel · EU','Meslamtaeda · EU'],'Only servers with saved Daevas');
  assert.equal(await page.inputValue('#aeRosterSwitch'),'eu:1308');
  assert.match(await page.textContent('.ae-roster-slot.is-active'),new RegExp(TEST_NAME));
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),1,'The strip shows one server\'s Daevas only');
  // Picking the other server shows its roster and makes its first Daeva active.
  await page.selectOption('#aeRosterSwitch','eu:2301');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent==='Israphel · EU · 1 of 8');
  await page.waitForFunction(()=>document.body.dataset.faction==='asmodian');
  assert.match(await page.textContent('.ae-roster-slot.is-active'),/NOCTIS/);
  assert.equal((await v2(page)).active.key,'2301:Zm9vYmFyMTIz=','The first Daeva of that server is active');
  await context.close();
});

await check('roster v1 moves to v2 per server: every entry kept, the active Daeva stays active, v1 untouched',async()=>{
  const a=saved('ALPHA',1308,'Meslamtaeda','eu'),b=saved('BETA',1308,'Meslamtaeda','eu'),c=saved('GAMMA',2301,'Israphel','eu'),d=saved('DELTA',1211,'Naw One','naw'),old=saved('OLDONE',1305,'Nezekan');
  delete old.region; // saved before regions existed: Europe
  const v1={entries:[a,b,c,d,old],active:keyOf(c)};
  const raw=JSON.stringify(v1);
  const {page,context}=await open('/hub/aetherium/',{storage:v1});
  const store=await v2(page);
  assert.deepEqual(Object.keys(store.rosters).sort(),['eu:1305','eu:1308','eu:2301','naw:1211']);
  assert.deepEqual(Object.values(store.rosters).flatMap(bucket=>bucket.entries).map(entry=>entry.name).sort(),['ALPHA','BETA','DELTA','GAMMA','OLDONE'],'Nothing is lost');
  assert.equal(store.rosters['eu:1305'].entries[0].region,'eu','An entry with no region is Europe');
  assert.deepEqual(store.active,{roster:'eu:2301',key:keyOf(c)},'The active Daeva is still active');
  assert.equal(await page.evaluate(()=>localStorage.getItem('aetherium.roster.v1')),raw,'v1 is left as it was');
  assert.equal(await page.textContent('#aeRosterCount'),'Israphel · EU · 1 of 8');
  assert.deepEqual(await page.$$eval('#aeRosterSwitch option',options=>options.map(o=>o.textContent)),['Meslamtaeda · EU','Israphel · EU','Naw One · NA West','Nezekan · EU']);
  await context.close();
  // v2 wins once it exists: a later v1 never re-migrates over it.
  const again=await open('/hub/aetherium/',{storage:v1,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([saved('ONLY',1308,'Meslamtaeda')]))}});
  assert.deepEqual((await again.page.$$eval('.ae-roster-slot.is-filled strong',n=>n.map(x=>x.textContent))),['ONLY']);
  await again.context.close();
});

await check('short region labels on roster cards and the heading; full names on the chip and the picker',async()=>{
  const entries=[saved('SHORTONE',1211,'Naw One','naw'),saved('SHORTTWO',1211,'Naw One','naw',{characterId:'two='})];
  const {page,context}=await open(`/hub/aetherium/?${new URLSearchParams({serverId:'1211',characterId:info.profile.characterId,region:'naw'})}`,{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2(entries))}});
  assert.match(await page.textContent('.ae-roster-slot.is-filled'),/Naw One · NA West/);
  assert.equal(await page.textContent('#aeRosterCount'),'Naw One · NA West · 2 of 8');
  assert.doesNotMatch(await page.textContent('#aeRoster'),/North America/);
  assert.equal(await page.textContent('.ae-chip-faction + li + li'),'North America - West','The chip keeps the full official name');
  assert.equal(await page.$eval('#aeRegion option[value="naw"]',o=>o.textContent),'North America - West');
  for(const [code,label] of [['nae','NA East'],['eu','EU'],['la','SA'],['as','Asia']]){
    const one=await open('/hub/aetherium/',{extra:{'aetherium.roster.v2':JSON.stringify(storeV2([saved('LBL',1311,'Kaisinel',code)]))}});
    assert.equal(await one.page.textContent('#aeRosterCount'),`Kaisinel · ${label} · 1 of 8`);
    assert.match(await one.page.textContent('.ae-roster-slot.is-filled'),new RegExp(`Kaisinel · ${label}`));
    await one.context.close();
  }
  await context.close();
});

for(const [width,height] of [[390,844],[1280,900],[1600,1000]]){
  await check(`roster cards at ${width}: one height, same baselines, switcher and pickers on the grid, no sideways scroll`,async()=>{
    const entries=[
      saved('Al',1308,'Meslamtaeda','eu',{level:5,className:'Gladiator'}),
      saved('AVeryLongDaevaNameX',1308,'Meslamtaeda','eu',{level:45,className:'Spiritmaster'}),
      saved('Mid Name',1308,'Meslamtaeda','eu',{level:30,className:'Assassin'}),
      saved('Cleo',1308,'Meslamtaeda','eu',{level:9,className:'Cleric'}),
      saved('Wide',2301,'An Extremely Long Server Name Here','naw')
    ];
    const {page,context}=await open('/hub/aetherium/',{live:true,viewport:{width,height},extra:{'aetherium.roster.v2':JSON.stringify(storeV2(entries.slice(0,4)))}});
    const rows=await page.$$eval('.ae-roster-slot.is-filled',nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect();
      const top=sel=>n.querySelector(sel).getBoundingClientRect().top-r.top;
      return {height:r.height,name:top('strong'),line:top('.ae-roster-line'),server:top('.ae-roster-line.ae-muted'),state:top('.ae-roster-state')};
    }));
    for(const row of rows){
      for(const key of ['height','name','line','server','state']) assert.ok(Math.abs(row[key]-rows[0][key])<=0.5,`${key} differs: ${row[key]} vs ${rows[0][key]}`);
    }
    const empties=await page.$$eval('.ae-roster-slot.is-empty',nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(empties.every(h=>Math.abs(h-rows[0].height)<=0.5),'Empty slots match the card height');
    // With a second server the switcher shows; it lines up with the left edge of the roster strip.
    await context.close();
    const two=await open('/hub/aetherium/',{live:true,viewport:{width,height},extra:{'aetherium.roster.v2':JSON.stringify(storeV2([...entries.slice(0,4),entries[4]]))}});
    const rowsTwo=await two.page.$$eval('.ae-roster-slot.is-filled',nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(rowsTwo.every(h=>Math.abs(h-rows[0].height)<=0.5),'A long server name does not change the height');
    const sw=await two.page.$eval('#aeRosterSwitch',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};});
    const strip=await two.page.$eval('#aeRoster',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};});
    const label=await two.page.$eval('#aeRosterSwitchBox label',el=>el.getBoundingClientRect().left);
    assert.ok(Math.abs(label-strip.left)<=1,`Switcher label starts on the grid (${label} vs ${strip.left})`);
    assert.ok(sw.right<=strip.right+0.5&&sw.height>=44,'Switcher stays inside the strip and is tappable');
    const overflow=await two.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,`Scrolls sideways by ${overflow}px`);
    const search=await two.page.$$eval('#aeSearch .ae-field',nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
    assert.ok(search.every(box=>box.left>=strip.left-0.5&&box.right<=strip.right+0.5),'Search pickers sit inside the same grid as the roster');
    if(process.env.AE_SHOTS)await two.page.screenshot({path:resolve(process.env.AE_SHOTS,`roster-${width}.png`),fullPage:true});
    await two.context.close();
  });
}

await check('level goes fresh: a live read updates the saved card; older data never does',async()=>{
  const id=info.profile.characterId;
  const stale=saved(TEST_NAME,1308,'Meslamtaeda','eu',{characterId:id,level:26,className:'Sorcerer',title:'Old Title'});
  const fresh=JSON.stringify(storeV2([stale]));
  // Live read: Lv 12 Gladiator from the fixture replaces the saved Lv 26 Sorcerer.
  const live=await open(`/hub/aetherium/?${new URLSearchParams({serverId:'1308',characterId:id})}`,{live:true,extra:{'aetherium.roster.v2':fresh}});
  assert.match(await live.page.textContent('.ae-roster-slot.is-filled'),/Gladiator · Lv 12/,'The card follows the Daeva Card');
  const entry=Object.values((await v2(live.page)).rosters)[0].entries[0];
  assert.deepEqual([entry.level,entry.className,entry.title,entry.raceName],[12,'Gladiator','Draped in Sky','Elyos']);
  assert.ok(entry.seenAt,'The time of the read is kept');
  await live.context.close();
  // Another page refreshes it too (the Gear page loads live).
  const gear=await open(`/hub/aetherium/gear/equipment/?${new URLSearchParams({serverId:'1308',characterId:id})}`,{live:true,extra:{'aetherium.roster.v2':fresh}});
  assert.equal(Object.values((await v2(gear.page)).rosters)[0].entries[0].level,12);
  await gear.context.close();
  // Cached data older than the saved entry never overwrites it.
  const seen=storeV2([{...stale,seenAt:new Date().toISOString()}]);
  const old=await open(`/hub/aetherium/?${new URLSearchParams({serverId:'1308',characterId:id})}`,{live:true,metaAt:Date.now()-3600_000,extra:{'aetherium.roster.v2':JSON.stringify(seen)}});
  assert.equal(Object.values((await v2(old.page)).rosters)[0].entries[0].level,26,'Older data leaves the saved level alone');
  await old.context.close();
  // A failed read never touches a saved Daeva.
  const failed=await open(`/hub/aetherium/?${new URLSearchParams({serverId:'1308',characterId:id})}`,{live:true,down:true,extra:{'aetherium.roster.v2':fresh}});
  const kept=Object.values((await v2(failed.page)).rosters)[0].entries[0];
  assert.deepEqual([kept.level,kept.className],[26,'Sorcerer'],'A failed read leaves the saved card alone');
  assert.match(await failed.page.textContent('.ae-roster-slot.is-filled'),/Sorcerer · Lv 26/,'The roster card still shows the saved Daeva');
  await failed.context.close();
});

await check('server list that fails or comes back empty: only "Any server", no empty headings, a muted line',async()=>{
  for(const mode of ['empty','down']){
    const {page,context}=await open('/hub/aetherium/',{live:true,servers:mode});
    await page.selectOption('#aeRegion','nae');
    await page.waitForFunction(()=>document.querySelector('#aeServer option[value=""]').textContent==='Any server in North America - East');
    assert.equal(await page.locator('#aeServer optgroup').count(),0,`${mode}: no empty Elyos and Asmodian headings`);
    assert.equal(await page.locator('#aeServer option').count(),1);
    assert.equal(await page.isVisible('#aeServerNote'),true);
    assert.equal(await page.textContent('#aeServerNote'),'Server list not available right now. Any server still works.');
    assert.equal(await page.isDisabled('#aeServer'),false,'Any server still works');
    await page.selectOption('#aeRegion','eu');
    await page.waitForFunction(()=>document.querySelectorAll('#aeServer optgroup').length===2);
    assert.equal(await page.isHidden('#aeServerNote'),true,'The note goes when the list is back');
    await context.close();
  }
  const ok=await open('/hub/aetherium/',{live:true});
  await ok.page.selectOption('#aeRegion','as');
  await ok.page.waitForFunction(()=>document.querySelectorAll('#aeServer optgroup').length===2);
  assert.equal(await ok.page.isHidden('#aeServerNote'),true);
  await ok.context.close();
});

await check('who is blamed: the site only when it did not answer; 429 and refusals say what happened; always a Try again, never a stand-in',async()=>{
  const cases=[[true,'The official AION 2 site is not answering right now. Try again in a minute.'],
    [429,'Too many searches in a minute. Try again shortly.'],
    [400,'Something went wrong on our side. Try again in a minute.'],
    [404,'Something went wrong on our side. Try again in a minute.']];
  for(const [down,message] of cases){
    const run=await open('/hub/aetherium/',{live:true,down});
    await run.page.fill('#aeNameInput',TEST_NAME);await run.page.click('#aeFind');
    await run.page.waitForFunction(()=>/\S/.test(document.querySelector('#aeNotice').textContent));
    assert.equal(await run.page.textContent('#aeNotice'),message,`status ${down}`);
    assert.equal(await run.page.textContent('#aeFind'),'Find character','The button comes back');
    assert.equal(await run.page.isVisible('#aeRetry [data-retry]'),true,`status ${down}: Try again`);
    assert.equal(await run.page.isHidden('#aeSource'),true,`status ${down}: nothing was read, so no data line`);
    assert.equal(await run.page.isVisible('#aeIntro'),true,`status ${down}: the intro stays`);
    await assertNoGamerTag(run.page,`status ${down}`);
    await run.context.close();
  }
  // At page load with a Daeva in the link: the notice with the real reason, Try again, and the intro, never a character.
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const limited=await open(`/hub/aetherium/?${ref}`,{live:true,down:429});
  assert.equal(await limited.page.textContent('#aeNotice'),'Too many searches in a minute. Try again shortly.');
  assert.equal(await limited.page.isVisible('#aeRetry [data-retry]'),true);
  assert.equal(await limited.page.isVisible('#aeIntro'),true);
  assert.equal(await limited.page.isHidden('#aeSummary'),true);
  await assertNoGamerTag(limited.page,'429 at load');
  await limited.context.close();
  const refused=await open(`/hub/aetherium/gear/?${ref}`,{live:true,down:400});
  assert.equal(await refused.page.textContent('#aeNotice'),'Something went wrong on our side. Try again in a minute.');
  assert.equal(await refused.page.isVisible('#aeRetry [data-retry]'),true);
  assert.equal(await refused.page.isVisible('#aeFindFirst'),true,'The Gear Ledger shows Find your Daeva first');
  await assertNoGamerTag(refused.page,'400 at load on the Gear Ledger');
  await refused.context.close();
});

await check('a Daeva already on screen stays on a failed read; Try again on the Daeva Card re-reads the same Daeva',async()=>{
  const {page,context,state}=await open('/hub/aetherium/',{live:true});
  await page.fill('#aeNameInput',TEST_NAME);await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeName')?.textContent);
  state.down=429;
  await page.fill('#aeNameInput','NOCTIS');await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.equal(await page.textContent('#aeNotice'),'Too many searches in a minute. Try again shortly.');
  assert.equal(await page.textContent('#aeName'),TEST_NAME,'The Daeva on screen stays');
  assert.equal(await page.isHidden('#aeIntro'),true,'No intro over a Daeva');
  state.down=false;
  await page.click('#aeRetry [data-retry]');
  await page.waitForFunction(()=>document.querySelector('#aeName')?.textContent==='NOCTIS');
  assert.equal(await page.isHidden('#aeNotice'),true);
  await context.close();
  // At load with a Daeva link and the site down: Try again reads it once the site is back.
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const load=await open(`/hub/aetherium/?${ref}`,{live:true,down:true});
  assert.equal(await load.page.isVisible('#aeIntro'),true);
  load.state.down=false;
  await load.page.click('#aeRetry [data-retry]');
  await load.page.waitForFunction(()=>document.querySelector('#aeName')?.textContent);
  assert.equal(await load.page.textContent('#aeName'),TEST_NAME);
  assert.equal(await load.page.isHidden('#aeIntro'),true);
  assert.deepEqual(load.calls,['/aion2/character','/aion2/character'],'The same read, once more');
  await load.context.close();
});

await check('no gluing: "Your Daevas" and its count are apart, nowhere does a label run into a number',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([saved('GLUE',1308,'Meslamtaeda')]))}});
  const head=await page.$eval('.ae-roster-head',el=>({text:el.textContent,inner:el.innerText}));
  assert.match(head.text,/Your Daevas\s+Meslamtaeda/,'A space between the label and the count');
  assert.doesNotMatch(head.inner,/Daevas\d/i);
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/[A-Za-z]\d+ of \d+/,'No label runs into a count anywhere');
  const a=await page.$eval('#aeRosterTitle',el=>el.getBoundingClientRect().right),b=await page.$eval('#aeRosterCount',el=>el.getBoundingClientRect().left);
  assert.ok(b-a>=8,`The count starts ${b-a}px after the label`);
  await context.close();
});

await check('Gear page: with no pet, wings or title the tall column collapses and the gear fills the window',async()=>{
  const q=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const bare=await open(`/hub/aetherium/gear/equipment/?${q}`,{live:true,noTitle:true});
  assert.equal(await bare.page.isHidden('#aeExtrasCol'),true);
  assert.equal(await bare.page.locator('.ae-gear-page.is-single').count(),1);
  const win=await bare.page.$eval('.ae-gear-page',el=>el.getBoundingClientRect().width),panel=await bare.page.$eval('.ae-gear-page .ae-panel',el=>el.getBoundingClientRect().width);
  assert.ok(win-panel<=1,`The gear panel fills the window (${panel} of ${win})`);
  await bare.context.close();
  const full=await open(`/hub/aetherium/gear/equipment/?${q}`,{live:true});
  assert.equal(await full.page.isVisible('#aeExtrasCol'),true,'With a pet, wings or a title the column stays');
  assert.equal(await full.page.locator('.ae-gear-page.is-single').count(),0);
  await full.context.close();
});

await check('ASTRIX crimson before a character loads',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.route(/\.mjs/,route=>route.abort());
  await page.goto(`${base}/hub/aetherium/`);
  assert.equal(await page.getAttribute('body','data-faction'),'astrix');
  assert.equal(await page.$eval('body',el=>getComputedStyle(el).getPropertyValue('--ae-accent').trim()),'#ba1f12');
  assert.ok(await page.isVisible('.ae-skeleton'),'The shell shows straight away, never a blank wait');
  await context.close();
});

await check('Worker down at load: clear message, Try again, the intro or Find your Daeva first, never a character',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  for(const path of [`/hub/aetherium/?${ref}`,`/hub/aetherium/gear/?${ref}`,`/hub/aetherium/gear/equipment/?${ref}`]){
    const {page,context,errors}=await open(path,{live:true,down:true});
    assert.equal(await page.textContent('#aeNotice'),'The official AION 2 site is not answering right now. Try again in a minute.',path);
    assert.equal(await page.isVisible('#aeRetry [data-retry]'),true,`${path}: Try again`);
    assert.equal(await page.isHidden('#aeSource'),true,`${path}: no data line`);
    if(path.startsWith('/hub/aetherium/?'))assert.equal(await page.isVisible('#aeIntro'),true,'The Daeva Card shows the intro');
    else {
      assert.equal(await page.isVisible('#aeFindFirst'),true,`${path}: Find your Daeva first`);
      assert.equal(await page.getAttribute('#aeFindFirst a.btn','href'),'/hub/aetherium/#aeSearch','A link to the search');
    }
    await assertNoGamerTag(page,`${path} with the Worker down`);
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

await check('no gamer tag, example data or stand-in character on any page in any state',async()=>{
  const ref=`?${new URLSearchParams({serverId:'1308',characterId:info.profile.characterId})}`;
  const pages=['/hub/aetherium/','/hub/aetherium/gear/','/hub/aetherium/gear/equipment/','/hub/aetherium/skills/','/hub/aetherium/daevanion/','/hub/aetherium/ascent/','/hub/aetherium/ascent/?class=gladiator&level=1'];
  const states=[{label:'no Daeva, Worker not configured',live:false,query:''},{label:'no Daeva',live:true,query:''},{label:'Worker down',live:true,down:true,query:ref},{label:'429',live:true,down:429,query:ref},{label:'400',live:true,down:400,query:ref}];
  for(const state of states){
    for(const path of pages){
      if(path.includes('?')&&state.query)continue;
      const {page,context}=await open(`${path}${path.includes('?')?'':state.query}`,{live:state.live,down:state.down??false});
      await assertNoGamerTag(page,`${path} (${state.label})`);
      assert.equal(await page.locator('.ae-portrait img, .ae-gw-who').count(),0,`${path} (${state.label}): no character on screen`);
      await context.close();
    }
  }
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, gold action, tiles apart`,async()=>{
    for(const path of ['/hub/aetherium/','/hub/aetherium/gear/equipment/']){
      // The Daeva Card opens on the intro; the Gear page on a live Daeva (with none it shows Find your Daeva first).
      const {page,context}=await open(path.includes('gear')?`${path}?${new URLSearchParams({serverId:'1308',characterId:info.profile.characterId})}`:path,{live:path.includes('gear'),viewport:{width,height}});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=0,`${path} scrolls sideways by ${overflow}px`);
      assert.ok(await page.isVisible('.apx-destination-brand img'),'AX logo in the header');
      const clear=await page.evaluate(()=>{
        const first=[...document.querySelector('main').children].map(el=>el.getBoundingClientRect()).find(r=>r.height>0).top+scrollY;
        const bars=[...document.querySelectorAll('header.apx-destination-header,[data-forge-destination-ribbon]')].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0&&r.width>0);
        return {first,bottom:Math.max(...bars.map(r=>r.bottom))};
      });
      assert.ok(clear.first>=clear.bottom,`${path} content starts under the header (${clear.first} < ${clear.bottom})`);
      const tiles=await page.$$eval(path.includes('gear')?'#aeGear > li':'.ae-roster-slot',items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}));
      for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
        const [a,b]=[tiles[i],tiles[j]];
        assert.ok(a[2]<=b[0]+0.5||b[2]<=a[0]+0.5||a[3]<=b[1]+0.5||b[3]<=a[1]+0.5,`${path} tiles ${i} and ${j} overlap`);
      }
      if(!path.includes('gear')){
        assert.match(await style(page,'#aeFind','background-image'),/linear-gradient\(rgb\(244, 210, 124\)/,'Gold primary action');
        const box=await page.$eval('#aeFind',el=>el.getBoundingClientRect().height);
        assert.ok(box>=44,'Primary action at least 44px tall');
      }
      if(process.env.AE_SHOTS&&(width===390||width===1600)){
        const name=path.includes('gear')?'gear-ledger':'daeva-card';
        await page.screenshot({path:resolve(process.env.AE_SHOTS,`${name}-${width}.png`),fullPage:true});
      }
      await context.close();
    }
  });
}

for(const [width,height] of [[390,844],[820,1180],[1600,1000],[1920,1080]]){
  await check(`intro at ${width}: no sideways scroll, hero art and speech panel one height, edges on the page grid, class tiles apart`,async()=>{
    const {page,context}=await open('/hub/aetherium/',{live:true,viewport:{width,height},art:mockArt()});
    await page.waitForSelector('#aeIntro.has-art');
    await page.waitForSelector('#aeIntro.has-npc');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,`scrolls sideways by ${overflow}px`);
    const intro=await boxOf(page,'#aeIntro'),art=await boxOf(page,'#aeIntroArt'),speech=await boxOf(page,'.ae-speech'),npc=await boxOf(page,'#aeIntroNpc'),search=await boxOf(page,'.ae-search'),classes=await boxOf(page,'.ae-class-row');
    near(intro.left,search.left,1,'intro starts where the search panel starts');near(intro.right,search.right,1,'intro ends where the search panel ends');
    near(classes.left,search.left,1,'class tiles start on the grid');near(classes.right,search.right,1,'class tiles end on the grid');
    near(npc.top,speech.top,1,'NPC and speech panel start together');near(npc.bottom,speech.bottom,1,'NPC and speech panel end together');
    if(width>=1100){
      near(art.top,speech.top,1,'art and speech panel start together');near(art.bottom,speech.bottom,1,'art and speech panel end together');
      assert.ok(art.right<=npc.left+0.5,'art on one side, the guide on the other');
      near(art.left,intro.left,1,'art on the left edge');near(speech.right,intro.right,1,'speech panel on the right edge');
    } else {
      assert.ok(art.bottom<=npc.top+0.5,'art above the guide on narrow screens');
      near(art.left,intro.left,1,'art spans the intro');near(art.right,intro.right,1,'art spans the intro');
    }
    assert.ok(art.height>=200,`hero art tall enough (${art.height})`);
    const tiles=await page.$$eval('#aeClasses [data-class]',items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
    assert.equal(tiles.length,8);
    assert.ok(tiles.every(t=>Math.abs(t.height-tiles[0].height)<=0.5&&Math.abs(t.width-tiles[0].width)<=1),`tiles share a size (${tiles.map(t=>`${t.width}x${t.height}`).join(', ')})`);
    assert.equal(new Set(tiles.map(t=>Math.round(t.top))).size,width>=820?1:2,width>=820?'8 tiles on one row':'two rows of 4 on a phone');
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){const [a,b]=[tiles[i],tiles[j]];assert.ok(a.right<=b.left+0.5||b.right<=a.left+0.5||a.bottom<=b.top+0.5||b.bottom<=a.top+0.5,`tiles ${i} and ${j} overlap`);}
    assert.ok(tiles[0].height>=44,'tiles are tappable');
    assert.ok(tiles.every(t=>t.left>=classes.left-0.5&&t.right<=classes.right+0.5),'tiles stay inside their row');
    // The words come first: the intro is usable before any art request is answered.
    const order=await page.evaluate(()=>{const ready=performance.getEntriesByName('aetherium-ready')[0]?.startTime??0;const art=performance.getEntriesByType('resource').filter(e=>/intro-art\.json/.test(e.name))[0];return {ready,art:art?art.responseEnd:null};});
    assert.ok(order.art===null||order.art>=order.ready-1,`the art data answered after the page was usable (${order.art} vs ${order.ready})`);
    if(process.env.AE_SHOTS&&(width===390||width===1600))await page.screenshot({path:resolve(process.env.AE_SHOTS,`intro-art-${width}.png`),fullPage:true});
    await context.close();
    // Without art the speech panel takes the row and nothing is left empty.
    const bare=await open('/hub/aetherium/',{live:true,viewport:{width,height}});
    const bareIntro=await boxOf(bare.page,'#aeIntro'),bareSpeech=await boxOf(bare.page,'.ae-speech');
    near(bareSpeech.left,bareIntro.left,1,'no art: the speech panel starts on the left edge');near(bareSpeech.right,bareIntro.right,1,'no art: the speech panel ends on the right edge');
    assert.equal(await bare.page.isHidden('#aeIntroArt'),true);assert.equal(await bare.page.isHidden('#aeIntroNpc'),true);
    assert.ok(await bare.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'no art: no sideways scroll');
    await bare.context.close();
  });
}

for(const [width,height] of [[390,844],[1600,1000]]){
  await check(`Find your Daeva first at ${width}: on the Gear Ledger and the Gear page, aligned, with the guide art when the data has it`,async()=>{
    for(const path of ['/hub/aetherium/gear/','/hub/aetherium/gear/equipment/']){
      const {page,context,calls}=await open(path,{live:true,viewport:{width,height},art:mockArt()});
      assert.deepEqual(calls,[],`${path}: no Worker call with no Daeva`);
      await page.waitForSelector('#aeFindFirst.has-art');
      assert.equal(await page.textContent('#aeFindFirstTitle'),'Find your Daeva first');
      assert.equal(await page.getAttribute('#aeFindFirstArt img','src'),`${ART_HOST}test/intro/npc.png`,'The NPC guide');
      assert.equal(await page.getAttribute('#aeFindFirstArt img','referrerpolicy'),'no-referrer');
      const panel=await boxOf(page,'#aeFindFirst'),art=await boxOf(page,'#aeFindFirstArt'),body=await boxOf(page,'.ae-find-first-body'),main=await boxOf(page,'main');
      assert.ok(art.top<=body.top+0.5&&art.bottom>=body.bottom-0.5,`art spans the words beside it (${art.top}-${art.bottom} vs ${body.top}-${body.bottom})`);
      assert.ok(art.right<=body.left,'art on the left, the words on the right');
      assert.ok(art.top>=panel.top&&art.bottom<=panel.bottom,'art inside the panel');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,`${path} scrolls sideways`);
      assert.ok(panel.left>=main.left&&panel.right<=main.right+0.5,'panel inside the page');
      assert.equal(await page.locator('#aeCards .ae-menu-card, .ae-gw').count(),0,`${path}: no character window`);
      await assertNoGamerTag(page,`${path} find first`);
      if(process.env.AE_SHOTS&&path==='/hub/aetherium/gear/')await page.screenshot({path:resolve(process.env.AE_SHOTS,`find-first-${width}.png`),fullPage:true});
      await context.close();
    }
  });
}

await check('wide screens: Gear page columns side by side, roster on one row at 1920',async()=>{
  const gear=await open(`/hub/aetherium/gear/equipment/?${new URLSearchParams({serverId:'1308',characterId:info.profile.characterId})}`,{live:true,viewport:{width:1920,height:1000}});
  const [left,right]=await gear.page.$$eval('.ae-gear-page>.ae-col',cols=>cols.map(col=>{const r=col.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.bottom)];}));
  assert.ok(right[0]>left[0]&&Math.abs(right[1]-left[1])<4&&Math.abs(right[2]-left[2])<4,`gear and stats beside pet, wings and title, ending level (${left} / ${right})`);
  await gear.context.close();
  const card=await open('/hub/aetherium/',{viewport:{width:1920,height:1000}});
  const tops=await card.page.$$eval('.ae-roster-slot',items=>[...new Set(items.map(el=>Math.round(el.getBoundingClientRect().top)))]);
  assert.equal(tops.length,1,'8 roster slots on one row');
  await card.context.close();
});

/* ---------- First-visit flow (10 Oct 2026): loading, the first move, the step bar, one Next, the guide, home and The Hub ---------- */

const daevaRef=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
const plainText=(page,selector)=>page.$eval(selector,el=>el.textContent.replace(/\s+/g,' ').trim());
const stepsOf=page=>page.$$eval('#aeSteps .ae-step',items=>items.map(el=>({label:el.querySelector('.ae-step-label').textContent,current:el.getAttribute('aria-current'),done:el.classList.contains('is-done'),locked:el.classList.contains('is-locked'),href:el.getAttribute('href'),tick:Boolean(el.querySelector('.ae-step-tick')),note:el.querySelector('.ae-step-note')?.textContent??null})));
const rectOf=(page,selector)=>page.$eval(selector,el=>el.getBoundingClientRect().toJSON());

await check('loading: the search form at once and one skeleton in the card shape, never two empty panels; after 3 s it says the read is still going',async()=>{
  const {page,context,errors}=await open(`/hub/aetherium/?${daevaRef}`,{live:true,slow:true,ready:false});
  await page.waitForSelector('#aeSummary .ae-summary-card.is-skeleton',{state:'visible'});
  assert.equal(await page.isVisible('#aeSearch'),true,'The search form shows while the site answers');
  // Two shaped skeletons (the card and the plan card, the crisp polish's look), never an empty panel.
  assert.equal(await page.locator('#aeSummary .ae-panel').count(),2,'The card and the plan card');
  assert.equal(await page.locator('#aeSummary .ae-skeleton').count(),2,'Both are skeletons in their final shape');
  assert.ok(await page.$eval('#aeSummary .ae-skeleton',el=>el.classList.contains('ae-summary-card')),'the first in the card shape');
  assert.equal(await page.$$eval('#aeSummary .ae-skeleton',panels=>panels.filter(panel=>!panel.querySelector('.ae-sk')).length),0,'Never an empty panel');
  // The plan card's only words are for screen readers (visually hidden): nothing on screen reads as an empty Ascent Plan panel.
  assert.equal(await page.$eval('#aeSummary .ae-plan-card.ae-skeleton .ae-sr',el=>`${el.textContent}|${getComputedStyle(el).position}`),'Ascent Plan|absolute','No empty Ascent Plan panel on screen');
  assert.equal(await plainText(page,'#aeReading'),'Reading your character');
  assert.equal(await style(page,'#aeReading','font-size'),'16px');
  const portrait=await rectOf(page,'#aeSummary .ae-sk-portrait'),body=await rectOf(page,'#aeSummary .ae-summary-body');
  assert.ok(portrait.width>=180&&body.left>=portrait.right,'portrait block on the left, words on the right, like the card');
  await page.waitForFunction(()=>document.querySelector('#aeReading')?.textContent==='Still reading from the official AION 2 site',null,{timeout:6000});
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  assert.equal(await page.locator('.is-skeleton').count(),0,'The skeleton goes once the Daeva is on screen');
  assert.equal(await page.textContent('#aeName'),TEST_NAME);
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('after a Daeva loads: the first move strip under the card shows the plan\'s top move, Show me opens it, Open Ascent Plan is gold, one Next to the plan',async()=>{
  const {page,context,errors}=await open(`/hub/aetherium/?${daevaRef}`,{live:true});
  await page.waitForSelector('#aeFirstMove.is-ready');
  const strip=await page.$eval('#aeFirstMove',el=>({text:el.querySelector('#aeFirstMoveText').textContent,href:el.querySelector('[data-first-move]').getAttribute('href'),label:el.querySelector('[data-first-move]').textContent.trim(),view:el.querySelector('[data-first-move]').dataset.moveView,board:el.querySelector('[data-first-move]').dataset.moveBoard}));
  // The same Daeva's Ascent Plan: its top move is the strip's move.
  const plan=await open(`/hub/aetherium/ascent/?${daevaRef}`,{live:true});
  const top=await plan.page.$eval('.ae-quest',el=>({title:el.querySelector('strong').textContent,board:el.dataset.questBoard,view:el.dataset.questView}));
  await plan.context.close();
  assert.equal(strip.text,top.title,'The strip says the plan\'s top move');
  assert.equal(strip.label,'Show me');
  assert.equal(strip.view,top.view);
  assert.equal(strip.board,top.board);
  assert.match(strip.href,new RegExp(`^/hub/aetherium/ascent/daevanion/\\?serverId=1308&characterId=[^&]+&region=eu&class=gladiator&board=${top.board}$`),'Show me goes straight to the move');
  const card=await rectOf(page,'#aeSummary .ae-summary-card'),box=await rectOf(page,'#aeFirstMove'),summary=await rectOf(page,'#aeSummary');
  assert.ok(box.top>=card.bottom-0.5,'The strip sits under the card');
  assert.ok(Math.abs(box.left-summary.left)<=1&&Math.abs(box.right-summary.right)<=1,'The strip spans the summary');
  assert.match(await style(page,'#aeAscentLink','background-image'),/linear-gradient\(rgb\(244, 210, 124\)/,'Open Ascent Plan is the gold primary action');
  assert.ok(parseFloat(await style(page,'#aeFirstMoveText','font-size'))>=16,'The move reads at 16px or more');
  assert.equal(await page.locator('[data-next]').count(),1,'One Next on the page');
  assert.match(await page.getAttribute('[data-next]','href'),/^\/hub\/aetherium\/ascent\/\?serverId=1308&characterId=[^&]+&region=eu&class=gladiator$/,'Next goes to the Ascent Plan');
  assert.match(await plainText(page,'[data-next]'),/^Next: Your next moves/);
  await Promise.all([page.waitForURL(/\/ascent\/daevanion\//),page.click('[data-first-move]')]);
  await page.waitForSelector('.ae-board-grid');
  assert.equal(await page.getAttribute(`[data-board-tab="${top.board}"]`,'aria-selected'),'true','Show me opened the board the move names');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('step bar on the Daeva Card: step 1 current; with a Daeva it is ticked and steps 2 and 3 link on; without one they say Find your Daeva first',async()=>{
  const none=await open('/hub/aetherium/',{live:true});
  const bare=await stepsOf(none.page);
  assert.deepEqual(bare.map(step=>step.label),['Find your Daeva','See your setup','Your next moves']);
  assert.equal(bare[0].current,'step');
  assert.deepEqual(bare.filter(step=>step.locked).map(step=>step.note),['Find your Daeva first','Find your Daeva first']);
  assert.equal(await none.page.locator('#aeSteps a').count(),1);
  assert.equal(await none.page.locator('#aeHowThisWorks').count(),0,'No guide to reopen before a Daeva');
  assert.equal(await none.page.locator('[data-next]').count(),1,'One Next, even on the intro');
  assert.equal(await none.page.getAttribute('[data-next]','href'),'#aeSearch');
  assert.ok(await none.page.$eval('#aeSteps',el=>el===document.querySelector('main').firstElementChild),'The step bar is first under the ribbon');
  await none.context.close();
  const {page,context}=await open(`/hub/aetherium/?${daevaRef}`,{live:true});
  const steps=await stepsOf(page);
  assert.equal(steps[0].current,'step');
  assert.ok(steps[0].done&&steps[0].tick,'Step 1 is ticked once a Daeva is found');
  assert.ok(!steps.some(step=>step.locked));
  assert.match(steps[1].href,/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=[^&]+&region=eu$/);
  assert.match(steps[2].href,/^\/hub\/aetherium\/ascent\/\?serverId=1308&characterId=[^&]+&region=eu&class=gladiator$/);
  assert.equal(await page.locator('#aeHowThisWorks').count(),1);
  assert.ok(parseFloat(await style(page,'#aeSteps .ae-step-label','font-size'))>=14,'Step text at least 14px');
  await context.close();
});

await check('first-visit guide: three steps after the first Daeva, Skip and Done close it, it shows once per device, How this works brings it back',async()=>{
  const {page,context,errors}=await open('/hub/aetherium/',{live:true});
  assert.equal(await page.isHidden('#aeGuide'),true,'No guide before a Daeva');
  await page.fill('#aeNameInput',TEST_NAME);
  await page.click('#aeFind');
  await page.waitForSelector('#aeGuide:not([hidden])');
  const text=()=>plainText(page,'#aeGuide');
  assert.match(await text(),/step 1 of 3.*This is your Daeva\. Check it is the character you play/);
  assert.match(await page.getAttribute('#aeSummary .ae-summary-card','class'),/ae-guide-target/,'The card is lit up');
  assert.equal(await style(page,'.ae-guide-text','font-size'),'16px','Guide text is 16px');
  assert.equal(await page.locator('#aeGuide [data-guide="skip"]').count(),1,'Skip is there');
  await page.click('#aeGuide [data-guide="next"]');
  assert.match(await text(),/step 2 of 3.*This is your first move/);
  assert.match(await page.getAttribute('#aeFirstMove','class'),/ae-guide-target/);
  await page.click('#aeGuide [data-guide="next"]');
  assert.match(await text(),/step 3 of 3.*Your full plan is here/);
  assert.match(await page.getAttribute('#aeAscentLink','class'),/ae-guide-target/);
  assert.equal(await page.locator('#aeGuide [data-guide="skip"]').count(),0,'The last step has Done, not Skip');
  await page.click('#aeGuide [data-guide="back"]');
  assert.match(await text(),/step 2 of 3/);
  await page.click('#aeGuide [data-guide="skip"]');
  assert.equal(await page.isHidden('#aeGuide'),true,'Skip closes the guide');
  assert.equal(await page.locator('.ae-guide-target').count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aetherium.guides.v1')).card),true,'Remembered on this device');
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await page.waitForSelector('#aeFirstMove');
  await page.waitForTimeout(150);
  assert.equal(await page.isHidden('#aeGuide'),true,'Shown once');
  await page.click('#aeHowThisWorks');
  assert.match(await text(),/step 1 of 3/,'How this works brings it back');
  for(let i=0;i<2;i++)await page.click('#aeGuide [data-guide="next"]');
  await page.click('#aeGuide [data-guide="done"]');
  assert.equal(await page.isHidden('#aeGuide'),true,'Done closes it');
  assert.deepEqual(errors,[]);
  await context.close();
});

for(const width of [390,820,1280,1600,1920]){
  await check(`flow at ${width}: step bar, first move strip and Next line up with the card, no sideways scroll`,async()=>{
    const {page,context}=await open(`/hub/aetherium/?${daevaRef}`,{live:true,viewport:{width,height:900}});
    await page.waitForSelector('#aeFirstMove.is-ready');
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=0,'scrolls sideways');
    const steps=await rectOf(page,'#aeSteps'),summary=await rectOf(page,'#aeSummary'),next=await rectOf(page,'#aeNext'),strip=await rectOf(page,'#aeFirstMove');
    assert.ok(Math.abs(steps.left-summary.left)<=1&&Math.abs(steps.right-summary.right)<=1,`step bar on the grid (${steps.left}/${steps.right} vs ${summary.left}/${summary.right})`);
    assert.ok(Math.abs(strip.left-summary.left)<=1&&Math.abs(strip.right-summary.right)<=1,'first move strip on the grid');
    assert.ok(Math.abs(next.left-summary.left)<=1&&Math.abs(next.right-summary.right)<=1,'Next row on the grid');
    const items=await page.$$eval('#aeSteps .ae-step',els=>els.map(el=>el.getBoundingClientRect().toJSON()));
    assert.ok(items.every(item=>item.height>=44),'every step at least 44px tall');
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(items[i].right<=items[j].left+0.5||items[j].right<=items[i].left+0.5||items[i].bottom<=items[j].top+0.5||items[j].bottom<=items[i].top+0.5,`steps ${i} and ${j} overlap`);
    assert.ok((await rectOf(page,'[data-first-move]')).height>=44,'Show me at least 44px tall');
    if(process.env.AE_SHOTS&&(width===390||width===1600))await page.screenshot({path:resolve(process.env.AE_SHOTS,`first-move-${width}.png`),fullPage:true});
    await context.close();
  });
}

await check('home page and The Hub lead to The Aetherium, with the new words',async()=>{
  const context=await browser.newContext();
  // Public pages: nothing leaves the local server (fonts, streams, scripts on other hosts answer empty).
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  await page.goto(`${base}/`);
  assert.deepEqual(await page.$$eval('.hero-body a[href="/hub/aetherium/"]',links=>links.map(a=>a.textContent.trim())),['The Aetherium'],'The hero tool row names The Aetherium');
  assert.match(await page.$eval('.hero-body',el=>el.textContent),/Destiny 2 build tools/,'The Destiny copy stays');
  assert.match(await page.$eval('.hero-body',el=>el.textContent),/AION 2/);
  assert.equal(await page.$eval('.hero-tags a[href="/hub/aetherium/"]',el=>el.textContent.trim()),'AION 2','AION 2 among the hero tags');
  assert.ok((await page.$$('a[href="/hub/aetherium/"]')).length>=3,'Hero row, hero tags and the universes list all lead in');
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/[–—]/,'No dashes');
  await page.goto(`${base}/hub/`);
  const card=await page.$eval('#hubCards .platform-card',el=>({name:el.querySelector('h2').textContent,copy:el.querySelector('p').textContent,button:el.querySelector('.btn-primary').textContent.trim(),href:el.querySelector('.btn-primary').getAttribute('href')}));
  assert.equal(card.name,'The Aetherium');
  assert.equal(card.copy,'Search any AION 2 character in five regions. See their gear, skills and Daevanion boards, and what to do next for their level. No login needed.');
  assert.equal(card.button,'Enter The Aetherium');
  assert.equal(card.href,'/hub/aetherium/');
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/EU servers|Look up a Daeva/);
  await context.close();
});

/* ---------- Crisp polish (design/aetherium-crisp-polish, 10 Oct 2026): type, tokens, surfaces, ribbon, width, states ---------- */

// Tabs and the primary action may keep a little spacing (0.04em); every other label stays at 0.02em or less.
const TABS='[data-forge-destination-ribbon] a,.ae-gw-tabs a,.ae-gw-tab,.ae-planner-tab,.ae-macro-tabs span';
// Tiny badges and counts are the only text allowed at 13px; everything else is 14px or more, body text 16px.
const TINY='.ae-menu-badge,.ae-node-step,.ae-quest-num,.ae-mskill-rank,.ae-mskill-lv,.ae-mskill-bar,.ae-lock,.ae-stg-on,.ae-stg-lock,.ae-itile-badge,.ae-itile-name,.ae-mskill-name,.ae-stg-name,.ae-section-title small,.ae-roster-count,.ae-cite,.ae-tag,.ae-pick-level,.ae-board-cards b,.ae-keycap,.ae-guide-pill';
/** Every visible text node on the page: nothing under 13px (14px unless a badge, count or tab), tight spacing, Barlow for interface text, Michroma only on the title and the Daeva name. */
const typeAudit=page=>page.evaluate(({TABS,TINY})=>{
  const bad=[],seen=new Set();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!node.nodeValue.trim())continue;
    const el=node.parentElement;
    if(!el||seen.has(el)||el.closest('.ae-sr,script,style,noscript,.ax-drawer,header.apx-destination-header'))continue;
    seen.add(el);
    const box=el.getBoundingClientRect();
    if(!box.width||!box.height)continue;
    const s=getComputedStyle(el);
    if(s.visibility==='hidden'||s.display==='none')continue;
    const size=parseFloat(s.fontSize);
    const spacing=s.letterSpacing==='normal'?0:parseFloat(s.letterSpacing)/size;
    const tab=Boolean(el.closest(TABS)),primary=Boolean(el.closest('.ae-primary')),brand=Boolean(el.closest('h1:not(.ae-gw-title),.ae-name')),tiny=Boolean(el.closest(TINY));
    const where=`${el.tagName.toLowerCase()}${[...el.classList].map(c=>'.'+c).join('')} "${node.nodeValue.trim().slice(0,28)}"`;
    if(size<13)bad.push(`${where}: ${size}px`);
    else if(size<14&&!(tiny||tab||primary))bad.push(`${where}: ${size}px (only badges, counts and tabs may be 13px)`);
    if(spacing>(tab||primary?0.041:0.021))bad.push(`${where}: letter spacing ${spacing.toFixed(3)}em`);
    if(brand){if(!/Michroma/.test(s.fontFamily))bad.push(`${where}: title not in Michroma (${s.fontFamily})`);}
    else if(!/^"?Barlow"?,/.test(s.fontFamily))bad.push(`${where}: not Barlow (${s.fontFamily})`);
  }
  return bad;
},{TABS,TINY});
/** Field labels and small heads: sentence case, 14px, weight 700, no uppercase transform. */
const labelAudit=page=>page.$$eval('label.ae-field>span,.ae-eyebrow,.ae-section-title,#aeRosterTitle,.ae-roster-switch label,.ae-slot-label,.ae-tile dt',els=>els.filter(el=>el.getBoundingClientRect().height).map(el=>{
  const s=getComputedStyle(el);const text=(el.firstChild?.nodeValue||el.textContent).trim();
  return {text,transform:s.textTransform,size:parseFloat(s.fontSize),weight:s.fontWeight,caps:text.length>1&&!/[a-z]/.test(text)};}));
/** Text that is cut off: an element that hides its overflow and whose words do not fit (an ellipsis on purpose is allowed). */
const clippedText=page=>page.evaluate(()=>{
  const out=[];
  for(const el of document.querySelectorAll('main *')){
    if(!el.childNodes.length||![...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim()))continue;
    const s=getComputedStyle(el);
    if(s.display==='none'||el.closest('.ae-sr,[hidden]'))continue;
    const clipsX=/hidden|clip/.test(s.overflowX)&&s.textOverflow!=='ellipsis'&&!el.closest('.ae-mskill,.ae-itile,.ae-stg-face,.ae-bar-cell,.ae-quest-text small');
    const clipsY=/hidden|clip/.test(s.overflowY)&&!el.closest('.ae-mskill,.ae-itile,.ae-stg-face,.ae-bar-cell,.ae-quest-text small');
    if((clipsX&&el.scrollWidth>el.clientWidth+1)||(clipsY&&el.scrollHeight>el.clientHeight+1))out.push(`${el.tagName.toLowerCase()}${[...el.classList].map(c=>'.'+c).join('')} "${el.textContent.trim().slice(0,30)}"`);
  }
  return out;
});
/** WCAG contrast of the colour tokens against the panel (see-through, composited over the page) and the solid panel. */
const contrastOf=page=>page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  const probe=document.createElement('span');document.body.append(probe);
  const rgba=value=>{probe.style.color='';probe.style.color=value;const m=getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(top,under)=>({r:top.r*top.a+under.r*(1-top.a),g:top.g*top.a+under.g*(1-top.a),b:top.b*top.a+under.b*(1-top.a),a:1});
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return Math.round((x+.05)/(y+.05)*100)/100;};
  const token=name=>root.getPropertyValue(name).trim();
  const page=rgba(token('--ae-page')),panel=over(rgba(token('--ae-panel')),page),solid=rgba(token('--ae-panel-solid'));
  const out={panelAlpha:rgba(token('--ae-panel')).a};
  for(const [key,name] of Object.entries({text:'--ae-text',muted:'--ae-text-muted',dim:'--ae-text-dim',hairline:'--ae-hairline',hairlineStrong:'--ae-hairline-strong',gold:'--ae-gold'}))out[key]={panel:ratio(rgba(token(name)),panel),solid:ratio(rgba(token(name)),solid)};
  probe.remove();return out;
});
const lookOf=(page,selector,pseudo=null)=>page.$eval(selector,(el,pseudo)=>{const s=getComputedStyle(el,pseudo);return {radius:s.borderTopLeftRadius,clip:s.clipPath,bg:s.backgroundColor,image:s.backgroundImage,color:s.color,shadow:s.boxShadow,transition:s.transitionDuration,border:s.borderTopWidth,height:el.getBoundingClientRect().height,animation:s.animationName,content:s.content,size:parseFloat(s.fontSize)};},pseudo);
const CLASS_NAMES=['Gladiator','Templar','Assassin','Ranger','Sorcerer','Spiritmaster','Cleric','Chanter'];
const ROSTER8=()=>JSON.stringify(storeV2(['Al','Bea','Cleo','Dax','Eri','Finn','Gus','Hal'].map((name,i)=>saved(name,1308,'Meslamtaeda','eu',{characterId:`${name.toLowerCase()}=`,className:CLASS_NAMES[i],level:10+i}))));

await check('crisp type: body 16px, nothing under 13px, labels 14px at 0.02em or less in Barlow, sentence case, sizes in rem, tabular figures',async()=>{
  // The Gear page opens on a Daeva: with none it shows Find your Daeva first (#473), which has no labels to check.
  for(const [path,extra] of [['/hub/aetherium/',{'aetherium.roster.v2':ROSTER8()}],[`/hub/aetherium/gear/equipment/?${daevaRef}`,{}]]){
    const {page,context}=await open(path,{live:true,extra});
    const bad=await typeAudit(page);
    assert.deepEqual(bad,[],`${path}:\n${bad.join('\n')}`);
    const labels=await labelAudit(page);
    assert.ok(labels.length>=4,`${path} has labels to check`);
    for(const label of labels){
      assert.equal(label.transform,'none',`${path} "${label.text}" is not uppercased by CSS`);
      assert.equal(label.caps,false,`${path} "${label.text}" is sentence case`);
      assert.equal(label.size,14,`${path} "${label.text}" is ${label.size}px`);
      assert.equal(label.weight,'700',`${path} "${label.text}" is bold`);
    }
    const body=await page.$eval('body',el=>{const s=getComputedStyle(el);return {size:parseFloat(s.fontSize),numbers:s.fontVariantNumeric,font:s.fontFamily};});
    assert.equal(body.size,16,'Body text is 16px');
    assert.equal(body.numbers,'tabular-nums','Numbers line up');
    assert.match(body.font,/^"?Barlow"?,/,'One sans family on the body');
    // Sizes are in rem: a bigger browser text setting scales every size with it.
    const before=await page.$$eval('body,label.ae-field>span,.ae-tile dd,.ae-section-title,.ae-slot strong,.ae-roster-count',els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});
    const after=await page.$$eval('body,label.ae-field>span,.ae-tile dd,.ae-section-title,.ae-slot strong,.ae-roster-count',els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    assert.deepEqual(after.map(v=>Math.round(v*100)/100),before.map(v=>Math.round(v*1.25*100)/100),'Every size follows the root font size');
    await page.evaluate(()=>{document.documentElement.style.fontSize='';});
    await context.close();
  }
  const card=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':ROSTER8()}});
  const field=await card.page.$eval('label.ae-field>span',el=>({size:parseFloat(getComputedStyle(el).fontSize),text:el.textContent}));
  assert.deepEqual(field,{size:14,text:'Character name'});
  assert.equal(await card.page.$eval('#aeRosterTitle',el=>el.textContent),'Your Daevas');
  assert.match(await card.page.$eval('h1',el=>getComputedStyle(el).fontFamily),/Michroma/,'The page title keeps Michroma');
  assert.match(await card.page.$eval('.ae-name',el=>getComputedStyle(el).fontFamily),/Michroma/,'The Daeva name keeps Michroma');
  await card.context.close();
});

await check('crisp at 200 percent zoom: no clipped text and no sideways scroll on the Daeva Card and the Gear page',async()=>{
  // 200 percent browser zoom on a 1600 window is an 800px viewport; the roster carries eight Daevas with long names.
  for(const [path,extra] of [['/hub/aetherium/',{'aetherium.roster.v2':ROSTER8()}],['/hub/aetherium/gear/equipment/',{}]]){
    const {page,context}=await open(path,{live:true,viewport:{width:800,height:500},extra});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,`${path} scrolls sideways by ${overflow}px at 200 percent`);
    const clipped=await clippedText(page);
    assert.deepEqual(clipped,[],`${path} clips text at 200 percent:\n${clipped.join('\n')}`);
    await context.close();
  }
});

await check('crisp tokens: muted text at least 4.5:1 and the hairline at least 1.6:1 against the panel; panels solid under reduced transparency',async()=>{
  const {page,context}=await open('/hub/aetherium/');
  const c=await contrastOf(page);
  console.log(`      contrast on the panel: text ${c.text.panel}:1, muted ${c.muted.panel}:1, dim ${c.dim.panel}:1, hairline ${c.hairline.panel}:1, strong hairline ${c.hairlineStrong.panel}:1, gold ${c.gold.panel}:1 (solid panel: muted ${c.muted.solid}:1, hairline ${c.hairline.solid}:1)`);
  assert.ok(c.panelAlpha<1,'The panel is see-through so the page glow shows');
  assert.ok(c.muted.panel>=4.5&&c.muted.solid>=4.5,`muted text ${c.muted.panel}:1`);
  assert.ok(c.dim.panel>=4.5&&c.dim.solid>=4.5,`dim notes ${c.dim.panel}:1`);
  assert.ok(c.text.panel>=7,`body text ${c.text.panel}:1`);
  assert.ok(c.hairline.panel>=1.6&&c.hairline.solid>=1.6,`hairline ${c.hairline.panel}:1`);
  const glow=await page.$eval('body',el=>{const s=getComputedStyle(el);return {image:s.backgroundImage,attachment:s.backgroundAttachment};});
  assert.equal((glow.image.match(/radial-gradient/g)||[]).length,2,'Two soft glows at the top of the page');
  assert.doesNotMatch(glow.attachment,/fixed/,'No fixed background attachment');
  assert.equal(await page.$$eval('.ae-panel,.ae-gw,[data-forge-destination-ribbon]',els=>els.map(el=>getComputedStyle(el).backdropFilter).filter(v=>v&&v!=='none').length),0,'No backdrop filter on large areas');
  const panel=await lookOf(page,'.ae-panel');
  assert.equal(panel.border,'1px','Hairline border on the panel');
  assert.ok((panel.shadow.match(/rgba\(/g)||[]).length>=3,`Top highlight plus a two-layer shadow (${panel.shadow})`);
  assert.match(panel.bg,/rgba\(.*0\.\d+\)$/,'The panel is see-through');
  // Reduced transparency (Chromium emulation through CDP): the panel turns solid.
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  await page.waitForTimeout(50);
  assert.doesNotMatch(await page.$eval('.ae-panel',el=>getComputedStyle(el).backgroundColor),/rgba\(.*0\.\d+\)$/,'Solid panels when transparency is reduced');
  await context.close();
});

await check('crisp surfaces: AX logo, strobe stroke and notched corners on tabs, buttons and tiles; squared surfaces with pills only on chips and counts; gold gradient inside the notched primary action; outline on the rest',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':ROSTER8()}});
  const logo=await page.$eval('header.apx-destination-header .apx-destination-brand',el=>({href:el.getAttribute('href'),img:Boolean(el.querySelector('img')),shown:el.querySelector('img').getBoundingClientRect().width>0,wordmark:el.querySelector('.ax-wordmark')?.textContent.replace(/\s+/g,'')}));
  assert.deepEqual(logo,{href:'/',img:true,shown:true,wordmark:'ASTRIXPARADOX'},'The AX logo beside the wordmark, linking home');
  // The strobe stroke: the shell draws it as a pseudo-element with the pulse animation, in the Aetherium blue.
  const ribbonStroke=await lookOf(page,'[data-forge-destination-ribbon] a[aria-current="page"]','::before');
  assert.match(ribbonStroke.animation,/ax-stroke-pulse/,'Strobe on the tab');
  assert.match(ribbonStroke.image,/linear-gradient/,'Strobe gradient on the tab');
  for(const selector of ['#aeFind','#aeGearLink','.ae-roster-open','.ae-roster-remove']){
    const stroke=await lookOf(page,selector,'::after');
    assert.match(stroke.animation,/ax-stroke-pulse/,`Strobe on ${selector}`);
  }
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--ax-stroke').trim()),'#4fb6ff','The strobe runs in the Aetherium blue');
  // Notched corners: buttons and tiles keep the AX clip; panels draw the notch at the corner so they keep their shadow.
  for(const selector of ['#aeFind','#aeGearLink','.ae-roster-remove']){
    assert.match((await lookOf(page,selector)).clip,/^polygon\(/,`${selector} is notched`);
  }
  for(const selector of ['.ae-tile','.ae-roster-open']){
    const look=await lookOf(page,selector);
    assert.match(look.clip,/^polygon\(/,`${selector} is notched`);
    assert.match(look.shadow,/inset 1px 1px 0px rgba\(255, 255, 255, 0\.07\), rgba\(0, 0, 0, 0\.45\) -1px -1px 0px inset|rgba\(255, 255, 255, 0\.07\) 1px 1px 0px 0px inset, rgba\(0, 0, 0, 0\.45\) -1px -1px 0px 0px inset/,`${selector} has the raised bevel (${look.shadow})`);
  }
  const notch=await lookOf(page,'.ae-panel','::before');
  assert.equal(notch.content,'""','The panel has its notched corner');
  assert.match(notch.image,/linear-gradient\(to (bottom left|left bottom)/,'drawn at the top-right corner');
  // Squared surfaces: no radius on bars, buttons, inputs, tabs, tiles and panels. Pills only on chips and counts.
  for(const selector of ['.ae-panel','#aeFind','#aeGearLink','#aeNameInput','#aeServer','.ae-roster-open','.ae-tile','#aeSource','[data-forge-destination-ribbon] a[aria-current="page"]','.ae-roster-remove','.ae-portrait','.ae-roster-class']){
    assert.equal((await lookOf(page,selector)).radius,'0px',`${selector} is squared`);
  }
  for(const selector of ['.ae-chips li','#aeRosterCount']){
    const look=await lookOf(page,selector);
    assert.ok(parseFloat(look.radius)>=look.height/2,`${selector} is a pill (${look.radius} on ${look.height}px)`);
    assert.equal(look.border,'1px',`${selector} has a hairline`);
    assert.ok(look.size>=13,`${selector} text is ${look.size}px`);
  }
  const faction=await lookOf(page,'.ae-chip-faction');
  assert.equal(faction.color,GOLD,'The faction chip keeps the faction colour');
  const primary=await lookOf(page,'#aeFind');
  assert.match(primary.image,/^linear-gradient\(rgb\(244, 210, 124\) 0%, rgb\(226, 181, 79\) 55%, rgb\(201, 154, 53\) 100%\)$/,'Gold top to bottom');
  assert.equal(primary.color,'rgb(27, 20, 6)','Dark text on the gold');
  assert.ok(primary.height>=44,'Primary action at least 44px tall');
  assert.equal(await page.$$eval('main .ae-primary',els=>els.filter(el=>el.getBoundingClientRect().height).length),2,'One gold action per view: Find character and Open Ascent Plan');
  for(const selector of ['#aeGearLink','.ae-roster-remove']){
    const look=await lookOf(page,selector);
    assert.equal(look.bg,'rgba(0, 0, 0, 0)',`${selector} has no fill`);
    assert.equal(look.image,'none',`${selector} has no gradient`);
    assert.match(look.shadow,/inset/,`${selector} has an outline ring`);
    assert.equal(look.color,GOLD_HI,`${selector} text in the accent`);
  }
  // The active roster card: a soft accent tint with a 1px accent ring.
  const active=await lookOf(page,'.ae-roster-slot.is-active .ae-roster-open');
  assert.notEqual(active.bg,await page.$eval('.ae-roster-slot:not(.is-active) .ae-roster-open',el=>getComputedStyle(el).backgroundColor),'The active Daeva is tinted');
  // Every hover and colour change animates over 150ms; every clickable thing has a focus ring.
  for(const selector of ['#aeFind','#aeGearLink','.ae-roster-open','.ae-tile','[data-forge-destination-ribbon] a','#aeNameInput']){
    assert.match((await lookOf(page,selector)).transition,/0\.15s/,`${selector} animates over 150ms`);
  }
  await page.focus('[data-forge-destination-ribbon] a:not([aria-current])');
  const ring=await page.$eval('[data-forge-destination-ribbon] a:not([aria-current])',el=>{const s=getComputedStyle(el);return {visible:el.matches(':focus-visible'),width:s.outlineWidth,style:s.outlineStyle};});
  assert.deepEqual(ring,{visible:true,width:'2px',style:'solid'},'Keyboard focus ring on a tab');
  await page.focus('#aeAscentLink');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250); // the ring animates in over 150ms
  const button=await page.$eval('#aeGearLink',el=>({focused:el.matches(':focus-visible'),shadow:getComputedStyle(el).boxShadow}));
  assert.equal(button.focused,true,'Tab reaches the button');
  assert.match(button.shadow,/inset 0px 0px 0px 2px|0px 0px 0px 2px inset/,`Keyboard focus ring on a button (${button.shadow})`);
  await context.close();
});

await check('crisp ribbon: one raised bar, exactly one active tab as a dark gold box, no underline; Destiny pages keep the shared ribbon',async()=>{
  const {page,context}=await open('/hub/aetherium/');
  const bar=await page.$eval('[data-forge-destination-ribbon]',el=>{const s=getComputedStyle(el);return {border:s.borderBottomWidth,shadow:s.boxShadow,blur:s.backdropFilter};});
  assert.equal(bar.border,'1px');assert.notEqual(bar.shadow,'none');assert.equal(bar.blur,'none');
  const tabs=await page.$$eval('[data-forge-destination-ribbon] .apx-destination-ribbon a',links=>links.map(a=>{const s=getComputedStyle(a),after=getComputedStyle(a,'::after');
    return {text:a.textContent,current:a.getAttribute('aria-current')==='page',color:s.color,bg:s.backgroundColor,radius:s.borderTopLeftRadius,spacing:Math.round(parseFloat(s.letterSpacing)/parseFloat(s.fontSize)*1000)/1000,underline:after.display!=='none'&&after.content!=='none',font:s.fontFamily,size:parseFloat(s.fontSize),height:a.getBoundingClientRect().height};}));
  assert.deepEqual(tabs.map(t=>t.text),['Daeva Card','Gear Ledger','Ascent Plan','The Hub']);
  assert.equal(tabs.filter(t=>t.current).length,1,'Exactly one active tab');
  for(const tab of tabs){
    assert.equal(tab.underline,false,`${tab.text}: no underline bar`);
    assert.ok(tab.spacing<=0.041,`${tab.text}: spacing ${tab.spacing}em`);
    assert.match(tab.font,/^"?Barlow"?,/,`${tab.text}: Barlow`);
    assert.equal(tab.size,13,`${tab.text}: ${tab.size}px`);
    assert.equal(tab.radius,'0px',`${tab.text}: squared`);
    assert.ok(tab.height>=36,`${tab.text}: ${tab.height}px tall`);
    if(tab.current){assert.equal(tab.color,GOLD,'Active tab in gold');assert.notEqual(tab.bg,'rgba(0, 0, 0, 0)','Active tab is a dark box');}
    else assert.equal(tab.bg,'rgba(0, 0, 0, 0)',`${tab.text}: plain text`);
  }
  await context.close();
  // Every rule in aetherium.css is scoped to the Aetherium, so a Destiny page could never pick it up (selector lists split on commas outside brackets).
  const splitList=list=>{const out=[];let depth=0,start=0;for(let i=0;i<list.length;i++){const ch=list[i];if(ch==='(')depth++;else if(ch===')')depth--;else if(ch===','&&depth===0){out.push(list.slice(start,i).trim());start=i+1;}}out.push(list.slice(start).trim());return out.filter(Boolean);};
  const css=await readFile(resolve(root,'astrix-app/pages/aetherium/aetherium.css'),'utf8');
  const selectors=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@(media|layer|supports)[^{]*\{/g,'').replace(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g,'').split('}').map(block=>block.slice(0,block.indexOf('{')).trim()).filter(Boolean).flatMap(splitList);
  const stray=selectors.filter(s=>!/^(html\b|:root|\.ae-|#ae|\.aetherium-page|body\.aetherium-page|html body\.aetherium-page)/.test(s));
  assert.deepEqual(stray,[],'Every selector starts with an Aetherium scope');
  // A Destiny page with the shared ribbon: the shell's own look, untouched (wide uppercase tabs with the underline bar, no Aetherium stylesheet).
  const destiny=await browser.newContext({viewport:{width:1600,height:1000}});
  await destiny.route('**/*',route=>(/^http:\/\/127\.0\.0\.1/.test(route.request().url())?route.continue():route.abort()));
  const forge=await destiny.newPage();
  await forge.goto(`${base}/hub/workbench/td2/`,{waitUntil:'domcontentloaded'});
  await forge.waitForSelector('[data-forge-destination-ribbon] a');
  assert.equal(await forge.locator('link[href*="aetherium.css"]').count(),0,'No Aetherium stylesheet on a Destiny page');
  const shared=await forge.$eval('[data-forge-destination-ribbon] .apx-destination-ribbon a',a=>{const s=getComputedStyle(a),after=getComputedStyle(a,'::after');return {spacing:Math.round(parseFloat(s.letterSpacing)/parseFloat(s.fontSize)*100)/100,upper:s.textTransform,radius:s.borderTopLeftRadius,underline:after.display,bar:getComputedStyle(a.closest('[data-forge-destination-ribbon]')).backgroundColor};});
  assert.deepEqual(shared,{spacing:0.16,upper:'uppercase',radius:'0px',underline:'block',bar:'rgba(14, 12, 9, 0.94)'},'The shared ribbon is as the shell draws it');
  await destiny.close();
});

for(const [width,height] of [[1600,1000],[1920,1080]]){
  await check(`crisp width at ${width}: content 1440 wide with 24px gutters, roster one row of 8 cards with a class icon, no empty band`,async()=>{
    const {page,context}=await open('/hub/aetherium/',{live:true,viewport:{width,height},extra:{'aetherium.roster.v2':ROSTER8()}});
    const main=await page.$eval('main',el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,width:r.width,padL:parseFloat(s.paddingLeft),padR:parseFloat(s.paddingRight)};});
    assert.equal(main.width-main.padL-main.padR,1440,'Content is 1440 wide');
    assert.equal(main.padL,24);
    assert.ok(Math.abs(main.left+main.padL-(width-1440)/2)<=1,'Centred');
    const cards=await page.$$eval('.ae-roster-slot.is-filled',items=>items.map(el=>{const r=el.getBoundingClientRect(),img=el.querySelector('img.ae-roster-class');return {top:Math.round(r.top),height:r.height,icon:img?{src:img.getAttribute('src'),w:img.getBoundingClientRect().width,h:img.getBoundingClientRect().height}:null};}));
    assert.equal(cards.length,8);
    assert.equal(new Set(cards.map(c=>c.top)).size,1,'One row of 8');
    assert.equal(new Set(cards.map(c=>c.height)).size,1,'Equal heights');
    for(const card of cards){
      assert.ok(card.icon,'A class icon on each card');
      assert.match(card.icon.src,/^https:\/\/assets\.playnccdn\.com\/.*board_icon_start_[a-z]+\.png$/,'The class art we already hotlink');
      assert.equal(card.icon.w,40);assert.equal(card.icon.h,40);
    }
    assert.equal(new Set(cards.map(c=>c.icon.src)).size,8,'Each class has its own icon');
    const panelsLeft=await page.$$eval('.ae-search, .ae-summary-card, #aeRoster',els=>[...new Set(els.map(el=>Math.round(el.getBoundingClientRect().left)))]);
    assert.equal(panelsLeft.length,1,'Search, Daeva Card and roster share the left edge');
    if(height===1080){
      const band=await page.evaluate(()=>{const main=document.querySelector('main');const last=[...main.children].map(el=>el.getBoundingClientRect()).filter(r=>r.height>0).at(-1);return document.querySelector('footer').getBoundingClientRect().top-last.bottom;});
      assert.ok(band>=0&&band<=56,`No empty band under the content (${Math.round(band)}px)`);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,'No sideways scroll');
    if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,`crisp-daeva-card-${width}.png`),fullPage:true});
    await context.close();
  });
}

await check('crisp loading: skeletons in the final shape (portrait, name bar, chips, four stat tiles) with a shimmer, none under reduced motion',async()=>{
  for(const motion of ['no-preference','reduce']){
    const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:motion});
    const page=await context.newPage();
    await page.route(/\.mjs/,route=>route.abort());
    await page.route(/playnccdn\.com|plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
    await page.goto(`${base}/hub/aetherium/`);
    const shape=await page.evaluate(()=>{
      const card=document.querySelector('#aeSummary .ae-summary-card.ae-skeleton');
      const box=sel=>card.querySelector(sel).getBoundingClientRect();
      const portrait=box('.ae-portrait.ae-sk');
      return {portrait:Math.round(portrait.width/portrait.height*100)/100,name:box('.ae-sk-name').width>100,chips:[...card.querySelectorAll('.ae-sk-chip')].map(el=>getComputedStyle(el).borderRadius),tiles:[...new Set([...card.querySelectorAll('.ae-sk-tile')].map(el=>Math.round(el.getBoundingClientRect().top)))].length,tileCount:card.querySelectorAll('.ae-sk-tile').length,
        plan:Boolean(document.querySelector('#aeSummary .ae-plan-card.ae-skeleton .ae-sk-btn')),words:document.querySelector('#aeSummary .ae-sr').textContent,shimmer:getComputedStyle(card.querySelector('.ae-sk'),'::after').animationName,visible:getComputedStyle(document.querySelector('#aeSummary .ae-sr')).position};
    });
    assert.ok(Math.abs(shape.portrait-5/6)<0.02,`Portrait shape 5:6 (${shape.portrait})`);
    assert.ok(shape.name,'A name bar');
    assert.equal(shape.chips.length,5,'Five chips');
    assert.ok(shape.chips.every(r=>parseFloat(r)>=100),'Chips are pills');
    assert.equal(shape.tileCount,4,'Four stat tiles');
    assert.equal(shape.tiles,1,'Tiles on one row at 1600');
    assert.equal(shape.plan,true,'The plan card has its button shape');
    assert.equal(shape.words,'Reading your character.','The words are still there for screen readers');
    assert.equal(shape.visible,'absolute','and visually hidden');
    assert.equal(shape.shimmer,motion==='reduce'?'none':'ae-shimmer',`Shimmer with motion ${motion}`);
    assert.equal(await page.$eval('#aeRoster .ae-loading',el=>el.classList.contains('ae-sk')&&el.getBoundingClientRect().height>=100),true,'The roster loading row is a card shape');
    await context.close();
  }
});

await check('crisp at 390: no sideways scroll, 16px gutter, type still tight, roster cards one height, nothing clipped',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,viewport:{width:390,height:844},extra:{'aetherium.roster.v2':ROSTER8()}});
  assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=0,'No sideways scroll');
  const bad=await typeAudit(page);
  assert.deepEqual(bad,[],bad.join('\n'));
  const clipped=await clippedText(page);
  assert.deepEqual(clipped,[],clipped.join('\n'));
  assert.equal(await page.$eval('main',el=>parseFloat(getComputedStyle(el).paddingLeft)),16,'16px gutter on a phone');
  const heights=await page.$$eval('.ae-roster-slot.is-filled',items=>[...new Set(items.map(el=>el.getBoundingClientRect().height))]);
  assert.equal(heights.length,1,'Roster cards one height');
  if(process.env.AE_SHOTS)await page.screenshot({path:resolve(process.env.AE_SHOTS,'crisp-daeva-card-390.png'),fullPage:true});
  await context.close();
});

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_PAGES=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_PAGES=PASS');
