#!/usr/bin/env node
// The Aetherium as an installed app (feature/aetherium-pwa, 26 Nov 2026), on a local static server like GitHub Pages
// (max-age=600, Last-Modified). The Worker is mocked: its real address is answered by the test, because the service
// worker knows only that address. Nothing is ever sent to the real Worker or to NCSOFT.
//   - files: the manifest, the icons, the shell list (build-aetherium-sw.mjs --check), a WebP copy of every image, every
//     page pointing at the Aetherium manifest with viewport-fit=cover, and no page outside /hub/aetherium/ doing either;
//   - installable in Chromium (no manifest errors, no installability errors), no install popup on a first visit;
//   - the service worker registers with scope /hub/aetherium/ only, and controls nothing outside it;
//   - a second visit works with the network off; a page never opened shows the offline page with Retry;
//   - a stored character answer offline is labelled "You're offline" with its age, never as live; nothing stored gives
//     the plain offline sentence;
//   - a new deploy waits, shows Update ready, never reloads on its own, and only the tap reloads into the new version
//     with the old caches gone;
//   - Install app in the menu only when the browser offers it; the one-line hint on iPhone Safari only;
//   - safe area: iPhone 15 (393 x 852, 3x) with the notch and home bar insets, and in landscape: the header, the menu,
//     the sticky guide bar and the page bottom all sit outside the insets; with no insets nothing moves;
//   - every page (all 66) starts the app module, and no image on any page's first view is over 400 KB, at 1600 and 390.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,extname,sep,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const {buildShell}=await import('./build-aetherium-sw.mjs');
const {sources,webpOf}=await import('./build-aetherium-images.mjs');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const WORKER='https://aetherium-worker.astrix285.workers.dev';
const SCOPE='/hub/aetherium/';
const IMAGE_LIMIT=400*1024;
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
let results=0;
const pass=label=>{results++;console.log(`ok ${results} ${label}`);};

// ---------- Files ----------
const pages=[];
(function walk(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())walk(path);else if(name==='index.html')pages.push('/'+relative(root,dir).replace(/\\/g,'/')+'/');}})(join(root,'hub/aetherium'));
const toolPages=pages.filter(path=>path!=='/hub/aetherium/offline/');
assert.equal(toolPages.length,66,'66 Aetherium pages');
for(const path of pages){
  const html=readFileSync(join(root,path,'index.html'),'utf8');
  assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/,`${path}: viewport-fit=cover`);
  assert.match(html,/<link rel="manifest" href="\/hub\/aetherium\/aetherium\.webmanifest">/,`${path}: the Aetherium manifest`);
  assert.ok(!html.includes('/site.webmanifest'),`${path}: not the site manifest`);
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\/hub\/aetherium\/icons\/apple-touch-icon\.png"/,`${path}: the Aetherium touch icon`);
  assert.ok(!/<meta name="theme-color"/.test(html)||path==='/hub/aetherium/offline/',`${path}: no theme-color, so a normal browser tab keeps its own toolbar colour`);
}
pass('66 pages and the offline page: the Aetherium manifest, touch icon and viewport-fit=cover');
const outside=['index.html','hub/index.html','astrix-app/pages/home/index.html','astrix-app/pages/journey/index.html'];
for(const file of outside){
  const html=readFileSync(join(root,file),'utf8');
  assert.ok(!html.includes('aetherium.webmanifest')&&!html.includes('/hub/aetherium/sw.js'),`${file}: never the Aetherium manifest or service worker`);
}
const manifest=JSON.parse(readFileSync(join(root,'hub/aetherium/aetherium.webmanifest'),'utf8'));
assert.equal(manifest.name,'The Aetherium');
assert.equal(manifest.short_name,'Aetherium');
assert.equal(manifest.id,SCOPE);
assert.equal(manifest.start_url,SCOPE);
assert.equal(manifest.scope,SCOPE);
assert.equal(manifest.display,'standalone');
assert.ok(!('orientation' in manifest),'Orientation left free');
const css=readFileSync(join(root,'astrix-app/pages/aetherium/aetherium.css'),'utf8');
const pageColour=css.match(/--ae-page:(#[0-9a-f]{6})/i)[1];
assert.equal(manifest.theme_color,pageColour,'Theme colour is the Aetherium page token');
assert.equal(manifest.background_color,pageColour,'Background colour is the Aetherium page token');
const want=[['192x192','any'],['512x512','any'],['192x192','maskable'],['512x512','maskable']];
for(const [sizes,purpose] of want)assert.ok(manifest.icons.some(icon=>icon.sizes===sizes&&icon.purpose===purpose&&existsSync(join(root,icon.src))),`Icon ${sizes} ${purpose}`);
assert.deepEqual(manifest.screenshots.map(shot=>shot.form_factor).sort(),['narrow','wide']);
for(const shot of manifest.screenshots)assert.ok(existsSync(join(root,shot.src)),shot.src);
const site=JSON.parse(readFileSync(join(root,'site.webmanifest'),'utf8'));
assert.equal(site.start_url,'/');assert.equal(site.id,'/');assert.ok(site.description);
assert.ok(await buildShell({check:true}),'sw.js shell list is up to date (node astrix-app/tools/build-aetherium-sw.mjs)');
const missing=sources().filter(file=>!existsSync(join(root,webpOf(file))));
assert.deepEqual(missing,[],'Every Aetherium JPG and PNG has its WebP copy (node astrix-app/tools/build-aetherium-images.mjs)');
const sw=readFileSync(join(root,'hub/aetherium/sw.js'),'utf8');
assert.ok(!/\bfetch\(\s*['"`]https?:/.test(sw)&&!sw.includes('/aion2/servers'),'The service worker makes no request of its own to the Worker and leaves the server list alone');
assert.ok(!/skipWaiting\(\)/.test(sw.replace(/if \(event\.data\?\.type === 'aetherium:update'\) self\.skipWaiting\(\);/,'')),'skipWaiting only on the Update ready message');
pass('Manifest, icons, screenshots, shell list, WebP copies and service worker rules');

// ---------- Server ----------
const server={offline:false,deploy:0};
const http=createServer(async(req,res)=>{
  if(server.offline){req.socket.destroy();return;}
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try{
    const info=await stat(file);
    let body=await readFile(file);
    // A new deploy: the shell list gains one entry, so the worker and its cache names change.
    if(path==='/hub/aetherium/sw.js'&&server.deploy)body=Buffer.from(body.toString('utf8').replace('"/img/favicon/favicon.ico"\n];',`"/img/favicon/favicon.ico",\n\n"/img/favicon/favicon.ico?deploy=${server.deploy}"\n];`));
    const headers={'content-type':types[extname(file)]||'application/octet-stream','cache-control':path.endsWith('sw.js')?'max-age=0':'max-age=600','last-modified':info.mtime.toUTCString()};
    res.writeHead(200,headers);res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>http.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${http.address().port}`;

const fixtureDir=resolve(root,'astrix-app/tools/fixtures/aion2/eu');
const fixture=name=>JSON.parse(readFileSync(resolve(fixtureDir,`${name}.json`),'utf8'));
const info=fixture('astrix285-info'),equipment=fixture('astrix285-equipment'),board=fixture('astrix285-daevanion-11'),item=fixture('astrix285-item-mainhand');
// The fixture is Miguel's own character: served under a test name, never his gamer tag.
info.profile.characterName='TESTDAEVA';
const CHARACTER=info.profile.characterId,SERVER=info.profile.serverId;
const SAVED=JSON.parse(readFileSync(join(root,'astrix-app/games/aion2/data/servers.json'),'utf8'));
const THREE_HOURS_AGO=()=>new Date(Date.now()-180*60000).toISOString();

const browser=await chromium.launch();
async function open({viewport={width:1600,height:900},deviceScaleFactor=1,isMobile=false,userAgent,workerCalls=[]}={}){
  const context=await browser.newContext({viewport,deviceScaleFactor,isMobile,hasTouch:isMobile,...(userAgent?{userAgent}:{})});
  await context.route(`${WORKER}/**`,route=>{
    if(server.offline)return route.abort('internetdisconnected');
    const url=new URL(route.request().url());
    workerCalls.push(url.pathname);
    const cors={'access-control-allow-origin':'*'};
    if(url.pathname==='/aion2/servers')return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({serverList:SAVED.regions?.[url.searchParams.get('region')]??[]})});
    const bodies={'/aion2/character':{info,equipment},'/aion2/daevanion':board,'/aion2/item':item};
    const body=bodies[url.pathname];
    if(!body)return route.fulfill({status:404,contentType:'application/json',headers:cors,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({...body,meta:{region:'eu',fetchedAt:THREE_HOURS_AGO(),cache:'hit'}})});
  });
  await context.route(/playnccdn\.com/,route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
  await context.route(/plaync\.com|typekit\.net/,route=>route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  return {context,page};
}
const ready=page=>page.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true',null,{timeout:20000});
const controlled=page=>page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated',null,{timeout:20000});
const setOffline=async(context,on)=>{server.offline=on;await context.setOffline(on);};

// ---------- Installable, scope, offline, stored data ----------
{
  const workerCalls=[];
  const {context,page}=await open({workerCalls});
  const cdp=await context.newCDPSession(page);
  await page.goto(`${base}${SCOPE}`);
  await ready(page);
  const {errors}=await cdp.send('Page.getAppManifest');
  assert.deepEqual(errors,[],'Manifest parses with no errors');
  await page.waitForFunction(()=>window.__aeAppStarted===true,null,{timeout:15000});
  const registration=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return {scope:new URL(reg.scope).pathname,script:new URL(reg.active.scriptURL).pathname};});
  assert.deepEqual(registration,{scope:SCOPE,script:'/hub/aetherium/sw.js'},'Registered with scope /hub/aetherium/ only');
  const {installabilityErrors}=await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installabilityErrors,[],'Installable in Chromium');
  assert.equal(await page.locator('#aeInstall:not([hidden])').count(),0,'No install control (and no popup) before the browser offers it');
  pass('Installable, registered with scope /hub/aetherium/ only, no install popup');

  await controlled(page);
  const callsBefore=workerCalls.length;
  await page.goto(`${base}${SCOPE}?serverId=${SERVER}&characterId=${encodeURIComponent(CHARACTER)}&region=eu`);
  await ready(page);
  await page.waitForFunction(()=>document.querySelector('#aeSource:not([hidden])'));
  assert.match(await page.textContent('#aeSource'),/^Read from the official AION 2 site 18\d minutes ago \(cached\)\.$/,'Online: the age, the Worker cache marked');
  assert.ok(workerCalls.slice(callsBefore).filter(path=>path==='/aion2/character').length===1,'One character call, as before: the service worker adds none');

  for(const path of ['/','/hub/','/astrix-app/pages/home/']){
    await page.goto(`${base}${path}`);
    assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),false,`${path}: not controlled`);
  }
  const scopes=await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(reg=>new URL(reg.scope).pathname));
  assert.deepEqual(scopes,[SCOPE],'The only registration is /hub/aetherium/');
  pass('No route outside /hub/aetherium/ is controlled');

  await page.goto(`${base}${SCOPE}`);
  await ready(page);
  await setOffline(context,true);
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#aeSearch').count(),1,'Second load offline: the Daeva Card from the stored copy');
  await page.goto(`${base}${SCOPE}?serverId=${SERVER}&characterId=${encodeURIComponent(CHARACTER)}&region=eu`);
  await ready(page);
  await page.waitForFunction(()=>document.querySelector('#aeSource:not([hidden])'));
  const stored=await page.textContent('#aeSource');
  assert.match(stored,/^You're offline\. Saved on this device: read from the official AION 2 site 18\d minutes ago\.$/,'Stored answer: offline and its age, never live');
  assert.equal(await page.getAttribute('#aeSource','data-kind'),'stored');
  pass('Second load works offline; a stored answer shows its age and is never live');

  await page.goto(`${base}${SCOPE}?serverId=${SERVER}&characterId=${encodeURIComponent('bm90c3RvcmVk=')}&region=eu`);
  await ready(page);
  await page.waitForFunction(()=>document.querySelector('#aeNotice:not([hidden])'));
  assert.match(await page.textContent('#aeNotice'),/^You're offline\. Connect to the internet and try again\.$/,'Nothing stored: the plain offline sentence');
  assert.equal(await page.locator('#aeSource:not([hidden])').count(),0,'No age line for data that is not there');

  await page.goto(`${base}${SCOPE}guide/general/faq/`);
  assert.equal(await page.textContent('h1'),"You're offline.",'Never opened: the offline page');
  assert.equal(await page.locator('#aeOfflineRetry').count(),1,'with Retry');
  assert.equal(new URL(page.url()).pathname,`${SCOPE}guide/general/faq/`,'Retry reloads the page asked for');
  await setOffline(context,false);
  await page.click('#aeOfflineRetry');
  await ready(page);
  assert.notEqual(await page.textContent('h1'),"You're offline.",'Retry online opens the page');
  pass('Never-opened page offline: the offline page and a working Retry; nothing stored: an honest offline sentence');

  // ---------- Update ready ----------
  await page.goto(`${base}${SCOPE}`);
  await ready(page);
  await controlled(page);
  const before=await page.evaluate(async()=>(await caches.keys()).filter(name=>name.startsWith('aetherium-shell-')));
  assert.equal(before.length,1,'One shell cache');
  await page.evaluate(()=>{window.__stillHere=true;});
  server.deploy=1;
  await page.evaluate(()=>navigator.serviceWorker.getRegistration('/hub/aetherium/').then(reg=>reg.update()));
  await page.waitForSelector('#aeUpdate:not([hidden])',{timeout:20000});
  assert.equal(await page.textContent('#aeUpdate'),'Update ready');
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>window.__stillHere),true,'No forced reload while the page is in use');
  assert.equal(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('/hub/aetherium/')).waiting)),true,'The new version waits');
  await Promise.all([page.waitForEvent('load'),page.click('#aeUpdate')]);
  await ready(page);
  assert.equal(await page.evaluate(()=>window.__stillHere),undefined,'The tap reloads');
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration('/hub/aetherium/');return !reg.waiting&&reg.active;});
  const after=await page.evaluate(async()=>(await caches.keys()).filter(name=>/^aetherium-(shell|runtime)-/.test(name)));
  assert.ok(after.every(name=>!name.endsWith(before[0].replace('aetherium-shell-','')))&&after.some(name=>name.startsWith('aetherium-shell-')),'Old Aetherium caches gone, new ones in place');
  assert.equal(await page.locator('#aeUpdate:not([hidden])').count(),0,'No Update ready after the update');
  server.deploy=0;
  pass('A new deploy waits, shows Update ready, never reloads by itself, and the tap moves to it with the old caches gone');

  // ---------- Install app ----------
  await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.__prompted=true;};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);});
  await page.setViewportSize({width:390,height:844});
  await page.click('#aeMenu');
  await page.waitForSelector('#aeInstall:not([hidden]) #aeInstallBtn');
  assert.equal(await page.textContent('#aeInstallBtn'),'Install app');
  await page.click('#aeInstallBtn');
  assert.equal(await page.evaluate(()=>window.__prompted),true,'The tap asks the browser');
  assert.equal(await page.locator('#aeInstall:not([hidden])').count(),0,'Gone once used');
  pass('Install app shows in the menu only when the browser offers it');
  await context.close();
}

// ---------- iPhone hint ----------
{
  const SAFARI='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const CHROME_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
  for(const [ua,shown] of [[SAFARI,true],[CHROME_IOS,false]]){
    const {context,page}=await open({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,userAgent:ua});
    await page.goto(`${base}${SCOPE}`);
    await ready(page);
    await page.waitForFunction(()=>window.__aeAppStarted===true,null,{timeout:15000});
    const hint=await page.locator('#aeInstall:not([hidden]) .ae-app-hint').count();
    assert.equal(hint,shown?1:0,`iPhone hint ${shown?'in Safari':'never in Chrome on iPhone'}`);
    if(shown)assert.equal(await page.textContent('.ae-app-hint'),'On iPhone: tap Share, then Add to Home Screen.');
    await context.close();
  }
  pass('The iPhone hint shows in Safari only');
}

// ---------- Safe area ----------
async function insetsPage(path,{width,height,insets}){
  const {context,page}=await open({viewport:{width,height},deviceScaleFactor:3,isMobile:true});
  await context.addInitScript(()=>{try{localStorage.clear();}catch{}});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});
  await page.goto(`${base}${path}`);
  await ready(page);
  return {context,page};
}
const boxOf=(page,selector)=>page.$eval(selector,node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
{
  const PORTRAIT={width:393,height:852,insets:{top:59,bottom:34,left:0,right:0}};
  const {context,page}=await insetsPage(SCOPE,PORTRAIT);
  for(const selector of ['header.apx-destination-header .apx-destination-brand','#aeMenu']){
    const box=await boxOf(page,selector);
    assert.ok(box.top>=59,`${selector} below the notch (${box.top})`);
  }
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const footer=await page.$eval('.ae-footer',node=>{const r=node.lastElementChild.getBoundingClientRect();return r.bottom;});
  assert.ok(footer<=852-34,`Footer text above the home bar (${footer})`);
  await page.click('#aeMenu');
  await page.waitForSelector('#aeDrawer.is-open');
  await page.waitForTimeout(300);
  const head=await boxOf(page,'.ax-drawer-head');
  assert.ok(head.top>=59,`Menu head below the notch (${head.top})`);
  await context.close();
  const ascent=await insetsPage(`${SCOPE}ascent/?class=gladiator&level=1`,PORTRAIT);
  if(await ascent.page.locator('.ae-guide').count()){
    await ascent.page.waitForTimeout(1500);
    const bar=await boxOf(ascent.page,'.ae-guide');
    assert.ok(bar.bottom<=852-34,`Sticky guide bar above the home bar (${bar.bottom})`);
  }
  await ascent.context.close();
  const LANDSCAPE={width:852,height:393,insets:{top:0,bottom:21,left:59,right:59}};
  const wide=await insetsPage(SCOPE,LANDSCAPE);
  const brand=await boxOf(wide.page,'header.apx-destination-header .apx-destination-brand');
  const menu=await boxOf(wide.page,'#aeMenu');
  assert.ok(brand.left>=59&&menu.right<=852-59,`Landscape: header clear of the notch (${brand.left}, ${menu.right})`);
  const main=await boxOf(wide.page,'#aeSearch');
  assert.ok(main.left>=59&&main.right<=852-59,'Landscape: page content clear of the notch');
  await wide.context.close();
  const map=await insetsPage(`${SCOPE}map/`,PORTRAIT);
  if(await map.page.locator('.ae-atlas-panel').count()){
    const sheetPad=await map.page.$eval('.ae-atlas-panel',node=>getComputedStyle(node).paddingBottom);
    assert.equal(sheetPad,'34px','Atlas bottom sheet clears the home bar');
  }
  await map.context.close();
  const plain=await insetsPage(SCOPE,{width:390,height:844,insets:{top:0,bottom:0,left:0,right:0}});
  const pad=await plain.page.$eval('header.apx-destination-header',node=>{const s=getComputedStyle(node);return [s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join(' ');});
  assert.equal(pad,'12px 16px 12px 16px','No insets: the phone header as before');
  assert.equal(await plain.page.$eval('body',node=>getComputedStyle(node).padding),'0px','No insets: no body padding');
  await plain.context.close();
  const desk=await insetsPage(SCOPE,{width:1600,height:900,insets:{top:0,bottom:0,left:0,right:0}});
  const deskPad=await desk.page.$eval('header.apx-destination-header',node=>{const s=getComputedStyle(node);return [s.paddingTop,s.paddingLeft].join(' ');});
  assert.equal(deskPad,'0px 40px','No insets: the desktop header as before');
  await desk.context.close();
  pass('Safe area: iPhone 15 portrait and landscape clear of the notch and home bar; no change without insets');
}

// ---------- Every page: app module, first-view images ----------
{
  const own=url=>url.startsWith(base);
  const largest={size:0,url:''};
  for(const [label,options] of [['1600',{viewport:{width:1600,height:900},deviceScaleFactor:1}],['390',{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true}]]){
    const {context}=await open(options);
    for(const path of toolPages){
      const page=await context.newPage();
      const images=[];
      page.on('response',async response=>{
        if(response.request().resourceType()!=='image'||!own(response.url()))return;
        try{images.push({url:new URL(response.url()).pathname,size:(await response.body()).length});}catch{/* aborted */}
      });
      await page.goto(`${base}${path}`,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__aeAppStarted===true,null,{timeout:15000}).catch(()=>{throw new Error(`${path}: the app module never started`);});
      await page.waitForTimeout(300);
      for(const image of images){
        assert.ok(image.size<=IMAGE_LIMIT,`${path} at ${label}: ${image.url} is ${Math.round(image.size/1024)} KB`);
        assert.ok(!/\/pages\/aetherium\/images\/.+\.(jpe?g|png)$/i.test(image.url),`${path} at ${label}: ${image.url} loads the original, not its WebP copy`);
        if(image.size>largest.size)Object.assign(largest,image);
      }
      await page.close();
    }
    await context.close();
  }
  pass(`All 66 pages start the app module; largest first-view image ${Math.round(largest.size/1024)} KB (${largest.url})`);
}

await browser.close();
http.close();
console.log(`AETHERIUM_PWA=PASS ${results}`);
