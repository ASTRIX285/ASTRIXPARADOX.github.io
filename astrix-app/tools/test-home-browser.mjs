import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {abilityCopy,dailySeed,modeCopy,selfCopy,timeCopy,weaponLine,LOTR_EXTENDED_TRILOGY_MINUTES} from '../pages/home/home-copy.mjs';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

// Copy engine: fixed templates chosen by thresholds from real numbers only.
assert.equal(LOTR_EXTENDED_TRILOGY_MINUTES,726);
const time=timeCopy({minutes:269280,hours:4488,days:187});
assert.equal(time.headline.value,'187 days');assert.match(time.detail,/4,488 hours/);assert.match(time.detail,/370 times/);
assert.equal(timeCopy({minutes:300,hours:5,days:0}).headline.value,'less than a day');
assert.doesNotMatch(timeCopy({minutes:900,hours:15,days:0}).detail,/Lord of the Rings/,'small totals never get a trilogy comparison');
assert.equal(timeCopy(null),null);
assert.equal(dailySeed('3:1',new Date('2026-09-28T01:00:00Z')),dailySeed('3:1',new Date('2026-09-28T23:00:00Z')),'same account and day, same lines');
assert.equal(abilityCopy(null,1),null);assert.equal(abilityCopy({grenade:0,melee:0,super:0},1),null,'zero kills never claim a signature move');
assert.equal(abilityCopy({grenade:8211,melee:3902,super:5544},1).label,'Grenades');
assert.equal(modeCopy({pve:10,pvp:40},1).label,'Crucible');assert.equal(modeCopy({pve:0,pvp:0},1),null);
assert.equal(selfCopy(null,1),null);
assert.ok(['A promising start to a beautiful friendship.','Early days, but the chemistry is there.'].includes(weaponLine(50,3)));
console.log('HOME_COPY=PASS thresholds, daily rotation, no claim beyond the numbers');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const summary={schemaVersion:1,displayName:'Shadowfax#0471',timePlayed:{minutes:269280,hours:4488,days:187},
 classShares:[{className:'Warlock',minutes:164000,share:61},{className:'Hunter',minutes:83000,share:31},{className:'Titan',minutes:22280,share:8}],
 mainCharacter:{className:'Warlock',share:61},topExoticWeapon:{name:'Ace of Spades',icon:null,kills:12408},
 abilityKills:{grenade:8211,melee:3902,super:5544},modes:{pve:5210,pvp:1204},selfEliminations:412,raidClears:146,
 lastActivity:{name:"Salvation's Edge: Master",period:new Date(Date.now()-2*3600e3).toISOString(),completed:true,durationSeconds:6502}};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 async function open(width,{signedIn=true,partial=false,journey='ready'}={}){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];let homeRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/session')return route.fulfill({json:signedIn?{authenticated:true,csrfToken:'fixture',activeDestinyMembership:{membershipId:'1',membershipType:3}}:{authenticated:false,error:'bungie_reauthentication_required'},status:signedIn?200:401,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'}});
   if(url.hostname==='auth.astrixparadox.com'&&url.pathname==='/bungie/home'){homeRequests++;return route.fulfill({json:partial?{...summary,topExoticWeapon:null,selfEliminations:null,lastActivity:null}:summary,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'}});}
   // Journey preparation: stub the prepared-page client so the bar's states are deterministic.
   if(url.origin===origin&&url.pathname.endsWith('/core/prepared-page-client.mjs')){
    const body=journey==='ready'?'export async function loadPreparedPagePayload(){return {ok:true};}':"export async function loadPreparedPagePayload(){throw new Error('fixture failure');}";
    return route.fulfill({body,headers:{'content-type':'text/javascript'}});
   }
   if(url.origin!==origin)return route.abort();
   return route.continue();
  });
  await page.goto(origin+'/astrix-app/pages/home/',{referer:origin+'/tools/'});
  return {page,errors,homeRequests:()=>homeRequests};
 }
 for(const width of [1440,390]){
  const {page,errors,homeRequests}=await open(width);
  await page.locator('#homeTimeValue').waitFor({state:'visible'});
  assert.equal(await page.locator('#homeTimeValue').textContent(),'187 days');
  assert.match(await page.locator('#homeWelcome').textContent(),/SHADOWFAX#0471/);
  for(const id of ['homeMain','homeWeapon','homeAbility','homeMode','homeSelf','homeLast','homeRaid'])assert.equal(await page.locator('#'+id).isVisible(),true,`${id} visible at ${width}`);
  assert.equal(await page.locator('#homeWeaponName').textContent(),'Ace of Spades');
  await page.waitForFunction(()=>window.ForgeLoader?.completed===true,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`no horizontal overflow at ${width}`);
  assert.equal(await page.getByRole('link',{name:/SEE MORE/}).getAttribute('href'),'../journey/');
  assert.equal(homeRequests(),1,'Home makes exactly one data request');
  await page.waitForFunction(()=>document.getElementById('homeReady')?.dataset.state==='ready',null,{timeout:8000});
  assert.equal(await page.locator('#homeReadyTitle').textContent(),'READY');
  assert.match(await page.locator('#homeReadyStage').textContent(),/Safe to enter/);
  assert.equal(await page.locator('#homeReadyBar').getAttribute('aria-valuenow'),'100');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('forge-paradox-map-background')),true,'ASTRIX PARADOX background applied');
  const readyBox=await page.locator('#homeReady .home-ready-inner').boundingBox();
  assert.ok(readyBox&&readyBox.y+readyBox.height<=900+1,`readiness bar pinned inside the viewport at ${width}`);
  assert.deepEqual(errors,[]);
  if(process.env.HOME_SCREENSHOT_DIR){await page.waitForTimeout(1500);await page.screenshot({path:`${process.env.HOME_SCREENSHOT_DIR}/home-${width}.png`,fullPage:true});}
  await page.close();console.log(`HOME_BROWSER=PASS width=${width}`);
 }
 {
  const {page,errors}=await open(1440,{partial:true});
  await page.locator('#homeTimeValue').waitFor({state:'visible'});
  for(const id of ['homeWeapon','homeSelf','homeLast'])assert.equal(await page.locator('#'+id).isVisible(),false,`${id} hidden when Bungie gave no data`);
  assert.deepEqual(errors,[]);await page.close();console.log('HOME_MISSING_DATA_HIDES_CARDS=PASS');
 }
 {
  const {page,errors}=await open(1440,{journey:'fail'});
  await page.waitForFunction(()=>document.getElementById('homeReady')?.dataset.state==='slow',null,{timeout:8000});
  assert.match(await page.locator('#homeReadyStage').textContent(),/You can still enter/);
  assert.equal(await page.getByRole('link',{name:/SEE MORE/}).getAttribute('href'),'../journey/','SEE MORE never blocked');
  assert.deepEqual(errors,[]);await page.close();console.log('HOME_READY_BAR_SLOW=PASS');
 }
 {
  const {page,errors,homeRequests}=await open(390,{signedIn:false});
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#homeStats').isVisible(),false,'signed out shows no stats');
  assert.equal(homeRequests(),0,'signed out never requests account data');
  assert.equal(await page.locator('#homeReady').isVisible(),false,'signed out shows no readiness bar');
  assert.deepEqual(errors,[]);await page.close();console.log('HOME_SIGNED_OUT=PASS');
 }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
