import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=`import {fixture} from '/astrix-app/tools/fixtures/reports-fixture.mjs';
import {mountReports} from '/astrix-app/pages/reports/reports-ui.mjs';
import {slimCatalogue} from '/astrix-app/pages/reports/reports-model.mjs';
const snapshot=structuredClone(fixture);
const real=new URL(location.href).searchParams.has('real');
if(real)snapshot.catalogue=slimCatalogue((await (await fetch('/astrix-app/tools/fixtures/reports-catalogue-current.json')).json()).activities);
window.fixtureCatalogue=snapshot.catalogue;
mountReports(document.querySelector('#reportsWorkspace'),snapshot);window.fixtureReady=true;`;
const pages=new Map();
for(const name of ['reports','mission-reports','loadout']){
 let html=(await readFile(resolve(root,`astrix-app/pages/${name}/index.html`),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 if(name==='reports')html=html.replace('</body>','<script type="module" src="/reports-fixture.mjs"></script></body>');
 pages.set(`/astrix-app/pages/${name}/`,html);
}
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(pages.has(path)){res.setHeader('Content-Type','text/html');res.end(pages.get(path));return;}
 if(path==='/reports-fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const value=value=>({basic:{value}});
const rows=Array.from({length:45},(_,i)=>({period:new Date(Date.UTC(2026,8,27,0,45-i)).toISOString(),activityDetails:{instanceId:String(1000+i),referenceId:100},values:{activityDurationSeconds:value(600),completed:value(i%2),kills:value(5),deaths:value(0)}}));
const report=id=>({period:rows[0].period,activityDetails:{instanceId:id,referenceId:100},entries:[{characterId:'1',player:{destinyUserInfo:{displayName:'Fixture <player>',iconPath:'/img/emblem.png'}},values:{kills:value(0),deaths:value(0),completed:value(0),activityDurationSeconds:value(600)}},{characterId:'2',player:{destinyUserInfo:{displayName:'Missing values'}},values:{}}]});
const noOverflow=async(page,label)=>{
 const bad=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(node=>{
  if(!node.getClientRects().length||node.closest('[hidden]'))return false;
  // A contained horizontal rail is deliberate; its visible container must fit.
  for(let parent=node.parentElement;parent&&parent!==document.body;parent=parent.parentElement)if(['auto','scroll'].includes(getComputedStyle(parent).overflowX))return false;
  const box=node.getBoundingClientRect();return box.width>0&&(box.right>innerWidth+1||box.left< -1);
 }).map(node=>node.className||node.tagName));
 assert.deepEqual(bad,[],label);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label);
};
let browser;
try{
 assert.equal((await fetch(origin+'/astrix-app/pages/reports/reports-ui.mjs')).status,200);console.log('REPORTS_BROWSER_SERVER=PASS');
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 const screenshots=process.env.REPORTS_SCREENSHOT_DIR||'/tmp/astrix-reports-screenshots';await mkdir(screenshots,{recursive:true});
 for(const width of [390,768,1100,1363,1920,2560]){
  const page=await browser.newPage({viewport:{width,height:1080}});let pgcrCalls=0;const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/bungie/reports'&&url.searchParams.get('kind')==='definition')return route.fulfill({json:{ErrorCode:1,Response:{displayProperties:{name:'Fixture Raid: Normal'}}}});
   if(url.pathname==='/bungie/reports')return route.fulfill({json:{ErrorCode:1,Response:{activities:url.searchParams.get('characterId')==='1'&&url.searchParams.get('page')==='0'?rows:[]}}});
   if(url.pathname.startsWith('/bungie/pgcr/')){pgcrCalls++;return route.fulfill({json:{ErrorCode:1,Response:report(url.pathname.split('/').pop())}});}
   if(url.hostname==='www.bungie.net')return route.fulfill({contentType:'image/png',body:png});
   if(url.origin!==origin)return route.abort();return route.continue();
  });
  await page.goto(origin+'/astrix-app/pages/reports/');await page.waitForFunction(()=>window.fixtureReady);
  const card=page.locator('.reports-card').filter({has:page.getByRole('heading',{name:'Fixture Raid',exact:true})});
  // Reports design pass (3 Oct 2026): the tile is the art and name only; numbers are on the activity page.
  assert.equal((await card.locator('.reports-art h2').innerText()).trim(),'Fixture Raid','Front card names the activity over its art');
  assert.equal(await card.locator('.rp-band,table,dl').count(),0,'Front card shows no numbers');
  assert.equal(await card.locator('.reports-band-row,[data-expand]').count(),0,'Front cards have no encounter lists');
  await noOverflow(page,`Reports ${width} cards`);
  await card.getByRole('button').click();await page.waitForFunction(()=>document.querySelector('.reports-history').textContent.includes('All available history pages loaded.'));
  assert.equal(await page.locator('.reports-runs li').count(),20);
  assert.doesNotMatch(await page.locator('.reports-detail-card table').first().innerText(),/Master/,'A difficulty with no clears is not listed');
  assert.match(await page.locator('.reports-detail-card table').last().innerText(),/Titan\s+22/);
  await noOverflow(page,`Reports ${width} activity`);
  await page.getByRole('button',{name:'Next',exact:true}).click();assert.match(await page.locator('.reports-paging').innerText(),/Page 2/);
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await page.locator('[data-run]').first().click();await page.locator('.reports-run-page .reports-player-table').waitFor();
  assert.match(await page.locator('.reports-player-table').innerText(),/Not completed/);assert.match(await page.locator('.reports-player-table').innerText(),/Pending/);
  await noOverflow(page,`Reports ${width} run`);
  await page.screenshot({path:`${screenshots}/reports-${width}-run.png`,fullPage:true});
  const shared=page.url();assert.ok(new URL(shared).searchParams.has('run'));
  await page.goBack();assert.equal(await page.locator('.reports-run-page').count(),0);
  await page.goForward();await page.locator('.reports-run-page .reports-player-table').waitFor();
  await page.locator('[data-back-activity]').click();
  assert.equal(await page.locator('.reports-tabs [data-difficulty="Master"]').count(),0,'No tab for a difficulty that was never played');
  await page.locator('.reports-detail-card [data-difficulty="Standard"]').click();assert.equal(await page.locator('.reports-runs li').count(),20);
  // Desktop: the Reports select. Phone and tablet (up to 1199px): the shell's single Guardian card picks the character.
  if(width>1199)await page.getByLabel('Character',{exact:true}).selectOption('2');
  else{assert.equal(await page.locator('#reportCharacter').isVisible(),false,'Phone and tablet use the shell Guardian card, not a second select');await page.evaluate(()=>document.dispatchEvent(new CustomEvent('forge:character-selected',{detail:{characterId:'2'}})));}
  assert.equal(await page.locator('.reports-runs li').count(),0);
  await page.locator('[data-back]:visible').click();assert.equal((await card.locator('.reports-art h2').innerText()).trim(),'Fixture Raid');
  assert.equal(await page.locator('.rp-tile.is-selected').count(),1,'Back at the grid, the activity just opened is the one selected tile');
  assert.deepEqual(errors,[]);
  // Real public catalogue with no clears for these characters (3 Oct 2026, completed only): no tiles and no
  // series tabs, one plain line. Variant and encounter handling is covered by test-reports-completed.
  await page.goto(origin+'/astrix-app/pages/reports/?real');await page.waitForFunction(()=>window.fixtureReady);
  assert.equal(await page.locator('.reports-card').count(),0,'No tiles for activities never completed');
  assert.equal(await page.locator('.reports-sidebar [data-series]').count(),0,'No series tabs with nothing completed');
  assert.equal(await page.locator('.reports-empty').innerText(),'No completed raids yet');
  await noOverflow(page,`Real catalogue ${width}`);
  if(width===390){
   await page.goto(origin+'/astrix-app/pages/mission-reports/');
   await page.evaluate(()=>{document.querySelectorAll('.mission-auth-shell').forEach(node=>node.hidden=true);document.querySelector('#missionWorkspace').hidden=false;});
   await noOverflow(page,'Mission Reports 390');await page.screenshot({path:`${screenshots}/mission-reports-390.png`,fullPage:true});
   await page.goto(origin+'/astrix-app/pages/loadout/');
   await page.evaluate(()=>{
    document.querySelector('#guardianLoadouts').innerHTML=Array.from({length:20},(_,i)=>`<button class="guardian-loadout-slot">${i+1}</button>`).join('');
    document.querySelector('#paradoxLoadoutDetail').innerHTML='<article class="apx-section paradox-loadout-detail"><div class="paradox-loadout-detail-head"><h2>Fixture loadout with a long descriptive name</h2></div><div class="saved-build-overview"><div class="saved-build-row">'+['subclass','weapons','armour','cosmetics','sockets'].map(name=>`<div class="saved-build-${name}"><h3>${name}</h3><div class="saved-build-equipment">${Array.from({length:name==='armour'?5:3},()=>'<div class="saved-build-equipment-item"><div class="saved-build-art"></div></div>').join('')}</div></div>`).join('')+'</div></div></article>';
   });
   await noOverflow(page,'Loadout 390 populated fixture');await page.screenshot({path:`${screenshots}/loadout-390.png`,fullPage:true});
  }
  console.log(`REPORTS_BROWSER width=${width} PASS`);await page.close();
 }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
