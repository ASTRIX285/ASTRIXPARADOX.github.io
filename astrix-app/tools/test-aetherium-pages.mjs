#!/usr/bin/env node
// The Aetherium pages (brief feature/aetherium-daeva-card-gear-ledger, 5 Oct 2026): Daeva Card and the Gear page
// (the character menu, Skills and Daevanion pages are covered by test-aetherium-character.mjs)
// on a local static server, the armory Worker mocked (never NCSOFT, never the real Worker):
//   - demo mode (Worker not configured): ASTRIX285 example, labelled, no Worker request;
//   - live mode: search to summary to the character menu; the Gear page's first paint uses only /aion2/character and
//     item detail loads only when opened;
//   - roster add and remove, faction colour switch (Elyos gold, Asmodian violet, ASTRIX crimson before load);
//   - Worker down: a clear "official site not answering" message and the labelled demo;
//   - five regions: the Region picker, a server list per region, the region in the URL, the roster and every link;
//   - looks: gold primary action, no horizontal scroll and no overlapping tiles at 390, 820 and 1600.
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
// A second, Asmodian Daeva for the roster and faction checks (same shape, different identity).
const asmoInfo=structuredClone(info);
Object.assign(asmoInfo.profile,{characterName:'NOCTIS',characterId:'Zm9vYmFyMTIz=',raceId:2,raceName:'Asmodians',serverId:2301,serverName:'Israphel'});
const asmoSearch={list:[{...search.list[0],name:'<strong>NOCTIS</strong>',characterId:'Zm9vYmFyMTIz%3D',race:2,serverId:2301,serverName:'Israphel'}],pagination:search.pagination};
const meta={region:'eu',fetchedAt:new Date().toISOString(),cache:'miss'};
// A Lv 22 Daeva (as ASTRIX285 is on the live armory, 5 Oct 2026): stigmas still not acquired, an amulet worn in slot 22.
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

async function open(path,{live=false,down=false,viewport={width:1600,height:1000},storage=null,extra={},metaAt=null,servers='ok',noTitle=false}={}){
  const context=await browser.newContext({viewport});
  const calls=[];
  const urls=[];
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
    urls.push(url);
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
  await page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:15000});
  return {page,context,calls,urls,errors};
}
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
const GOLD='rgb(226, 181, 79)',VIOLET='rgb(154, 107, 255)';

await check('demo mode: labelled ASTRIX285 example, no Worker call, Elyos gold',async()=>{
  const {page,context,calls,errors}=await open('/hub/aetherium/');
  assert.deepEqual(calls,[]);
  assert.match(await page.textContent('#aeSource'),/^Example data: a sample Daeva, read from the official AION 2 site on 5 Oct 2026\. Live character data is not connected yet\./);
  assert.equal(await page.textContent('#aeName'),'ASTRIX285');
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  assert.equal(await style(page,'.ae-chip-faction','color'),GOLD,'Elyos accent on the faction chip');
  assert.match(await page.textContent('.ae-tiles'),/Combat power6,532/);
  assert.match(await page.textContent('.ae-tiles'),/Daevanion boards open1 \/ 5/);
  assert.match(await page.textContent('.ae-tiles'),/Unlock at Lv 22/);
  assert.equal(await page.locator('.ae-roster-slot').count(),8,'8 roster slots');
  assert.deepEqual(errors,[]);
  await context.close();
});

await check('demo search: other names explain the example, ASTRIX285 imports',async()=>{
  const {page,context}=await open('/hub/aetherium/');
  await page.fill('#aeNameInput','SomeoneElse');
  await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.match(await page.textContent('#aeNotice'),/Live search is not connected yet/);
  await page.fill('#aeNameInput','astrix285');
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===1);
  assert.match(await page.textContent('.ae-roster-slot.is-filled'),/ASTRIX285[\s\S]*example/);
  await context.close();
});

await check('live: search to summary uses search then one character call',async()=>{
  const {page,context,calls}=await open('/hub/aetherium/',{live:true});
  assert.deepEqual(calls,[],'No Daeva picked yet: the example needs no Worker call');
  assert.match(await page.textContent('#aeSource'),/Search for your own Daeva above/);
  await page.fill('#aeNameInput','ASTRIX285');
  await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeSource').textContent.startsWith('Read from the official AION 2 site'));
  assert.deepEqual(calls,['/aion2/search','/aion2/character']);
  assert.match(await page.textContent('#aeSource'),/^Read from the official AION 2 site just now\.$/);
  assert.match(page.url(),/serverId=1308&characterId=.*&region=eu$/,'Bookmarkable URL carries the region');
  assert.match(await page.getAttribute('#aeGearLink','href'),/^\/hub\/aetherium\/gear\/\?serverId=1308&characterId=.*&region=eu$/,'View full setup opens the character menu');
  assert.match(await page.getAttribute('.ae-tile.is-link a','href'),/^\/hub\/aetherium\/daevanion\/\?serverId=1308&characterId=.*&region=eu&class=gladiator&board=11$/,'The Daevanion tile opens the first open board');
  await context.close();
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
  const good={name:'ASTRIX285',serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:23,raceName:'Elyos',demo:false};  // no region saved: an old entry opens as Europe
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
  assert.equal(await page.getAttribute('body','data-faction'),'elyos');
  await page.fill('#aeNameInput','ASTRIX285');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelectorAll('.ae-roster-slot.is-filled').length===1);
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
  assert.equal(all[0].name,'ASTRIX285');
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
  await page.fill('#aeNameInput','ASTRIX285');
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
  const old={name:'ASTRIX285',serverId:1308,serverName:'Meslamtaeda',characterId:info.profile.characterId,className:'Gladiator',level:23,raceName:'Elyos'};
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

await check('Worker down on search: the plain message',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,down:true});
  await page.fill('#aeNameInput','ASTRIX285');
  await page.click('#aeFind');
  await page.waitForFunction(()=>/not answering/.test(document.querySelector('#aeNotice').textContent));
  assert.equal(await page.textContent('#aeNotice'),'The official AION 2 site is not answering right now, so this shows an example Daeva. Try again in a minute.');
  assert.equal(await page.textContent('#aeFind'),'Find character');
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
  await page.fill('#aeNameInput','ASTRIX285');await page.click('#aeFind');
  await page.waitForSelector('#aeNotice:not([hidden])');
  assert.equal(await page.textContent('#aeNotice'),'Meslamtaeda already has 8 Daevas saved. Remove one to add ASTRIX285.');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),8,'Nothing was added');
  assert.equal(JSON.stringify((await v2(page)).rosters['eu:1308'].entries.length),'8');
  await page.click('[data-roster-remove="1308:full0-1308="]');
  assert.equal(await page.textContent('#aeRosterCount'),'Meslamtaeda · EU · 7 of 8');
  await page.fill('#aeNameInput','ASTRIX285');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent==='Meslamtaeda · EU · 8 of 8');
  assert.equal(await page.locator('.ae-roster-slot.is-filled').count(),8,'The new Daeva took the freed slot');
  await context.close();
});

await check('roster per server: a new Daeva goes to its own server and that roster is shown; the switcher lists only used servers',async()=>{
  const {page,context}=await open('/hub/aetherium/',{live:true,extra:{'aetherium.roster.v2':JSON.stringify(storeV2([saved('NOCTIS',2301,'Israphel')]))}});
  assert.equal(await page.isHidden('#aeRosterSwitchBox'),true,'One server with Daevas: no switcher');
  assert.equal(await page.textContent('#aeRosterCount'),'Israphel · EU · 1 of 8');
  await page.fill('#aeNameInput','ASTRIX285');await page.click('#aeFind');
  await page.waitForFunction(()=>document.querySelector('#aeRosterCount').textContent==='Meslamtaeda · EU · 1 of 8');
  assert.equal(await page.isVisible('#aeRosterSwitchBox'),true);
  assert.deepEqual(await page.$$eval('#aeRosterSwitch option',options=>options.map(o=>o.textContent)),['Israphel · EU','Meslamtaeda · EU'],'Only servers with saved Daevas');
  assert.equal(await page.inputValue('#aeRosterSwitch'),'eu:1308');
  assert.match(await page.textContent('.ae-roster-slot.is-active'),/ASTRIX285/);
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

await check('level goes fresh: a live read updates the saved card; the example and older data never do',async()=>{
  const id=info.profile.characterId;
  const stale=saved('ASTRIX285',1308,'Meslamtaeda','eu',{characterId:id,level:26,className:'Sorcerer',title:'Old Title'});
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
  // The example never updates a saved Daeva.
  const demo=await open('/hub/aetherium/',{extra:{'aetherium.roster.v2':fresh}});
  await demo.page.fill('#aeNameInput','astrix285');await demo.page.click('#aeFind');
  await demo.page.waitForFunction(()=>document.querySelector('#aeSource').textContent.startsWith('Example data'));
  const kept=Object.values((await v2(demo.page)).rosters)[0].entries[0];
  assert.deepEqual([kept.level,kept.className,kept.demo],[26,'Sorcerer',false],'The example leaves the saved card alone');
  await demo.context.close();
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

await check('who is blamed: the site only when it did not answer; 429 and refusals say what happened',async()=>{
  const cases=[[true,'The official AION 2 site is not answering right now, so this shows an example Daeva. Try again in a minute.'],
    [429,'Too many searches in a minute. Try again shortly.'],
    [400,'Something went wrong on our side. Try again in a minute.'],
    [404,'Something went wrong on our side. Try again in a minute.']];
  for(const [down,message] of cases){
    const {page,context}=await open('/hub/aetherium/',{live:true});
    await context.unroute?.(`${WORKER}/**`).catch?.(()=>{});
    await context.close();
    const run=await open('/hub/aetherium/',{live:true,down});
    await run.page.fill('#aeNameInput','ASTRIX285');await run.page.click('#aeFind');
    await run.page.waitForFunction(()=>/\S/.test(document.querySelector('#aeNotice').textContent));
    assert.equal(await run.page.textContent('#aeNotice'),message,`status ${down}`);
    assert.equal(await run.page.textContent('#aeFind'),'Find character','The button comes back');
    if(down===true) assert.match(await run.page.textContent('#aeSource'),/^Example data/);
    else assert.doesNotMatch(await run.page.textContent('#aeSource')||'',/not answering/,'Not blamed on the official site');
    await run.context.close();
  }
  // At page load with a saved Daeva: the example is shown, labelled with the real reason.
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  const limited=await open(`/hub/aetherium/?${ref}`,{live:true,down:429});
  assert.equal(await limited.page.textContent('#aeNotice'),'Too many searches in a minute. Try again shortly.');
  assert.match(await limited.page.textContent('#aeSource'),/^Example data: a sample Daeva.*Too many searches in a minute\. Try again shortly\.$/);
  await limited.context.close();
  const refused=await open(`/hub/aetherium/gear/?${ref}`,{live:true,down:400});
  assert.equal(await refused.page.textContent('#aeNotice'),'Something went wrong on our side. Try again in a minute.');
  await refused.context.close();
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

await check('Worker down: clear message and labelled demo',async()=>{
  const ref=new URLSearchParams({serverId:'1308',characterId:info.profile.characterId});
  for(const path of [`/hub/aetherium/?${ref}`,`/hub/aetherium/gear/?${ref}`,`/hub/aetherium/gear/equipment/?${ref}`]){
    const {page,context,errors}=await open(path,{live:true,down:true});
    assert.match(await page.textContent('#aeNotice'),/The official AION 2 site is not answering right now, so this shows an example Daeva/);
    assert.match(await page.textContent('#aeSource'),/^Example data: a sample Daeva.*The official AION 2 site is not answering right now\.$/);
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

for(const [width,height] of [[390,844],[820,1180],[1600,1000]]){
  await check(`looks at ${width}: no sideways scroll, gold action, tiles apart`,async()=>{
    for(const path of ['/hub/aetherium/','/hub/aetherium/gear/equipment/']){
      const {page,context}=await open(path,{viewport:{width,height}});
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

await check('wide screens: Gear page columns side by side, roster on one row at 1920',async()=>{
  const gear=await open('/hub/aetherium/gear/equipment/',{viewport:{width:1920,height:1000}});
  const [left,right]=await gear.page.$$eval('.ae-gear-page>.ae-col',cols=>cols.map(col=>{const r=col.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.bottom)];}));
  assert.ok(right[0]>left[0]&&Math.abs(right[1]-left[1])<4&&Math.abs(right[2]-left[2])<4,`gear and stats beside pet, wings and title, ending level (${left} / ${right})`);
  await gear.context.close();
  const card=await open('/hub/aetherium/',{viewport:{width:1920,height:1000}});
  const tops=await card.page.$$eval('.ae-roster-slot',items=>[...new Set(items.map(el=>Math.round(el.getBoundingClientRect().top)))]);
  assert.equal(tops.length,1,'8 roster slots on one row');
  await card.context.close();
});

await check('no request reached the real Worker or NCSOFT',async()=>assert.deepEqual(realCalls,[]));

await browser.close();
server.close();
if(failures){console.error(`AETHERIUM_PAGES=FAIL ${failures}`);process.exitCode=1;}
else console.log('AETHERIUM_PAGES=PASS');
