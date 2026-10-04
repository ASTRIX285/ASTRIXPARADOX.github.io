// Asset weight (perf, 4 Oct 2026): a tool page's first load never pulls an image over 300 KB
// or a full manifest file. Each page is opened cold at 1600 and at 390 (3x pixels), signed out,
// with every request off this origin refused, so only the site's own files are counted. Where a
// page offers "Continue without live data" it is pressed, so the first screen renders with its
// destination art and maps, then the page is left to settle. Journey also runs in its local
// preview mode (sample data) so its destination art and Director map are measured.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const IMAGE_LIMIT=300*1024;
export const TOOL_PAGES=Object.freeze([
 ['Home','/astrix-app/pages/home/'],['Journey','/astrix-app/pages/journey/'],['Journey with data','/astrix-app/pages/journey/?preview'],['Character','/astrix-app/pages/guardian-workspace-v2/'],
 ['Forge Loader','/astrix-app/pages/forge-loader/'],['Forge Matrix','/astrix-app/pages/forge-loader/results/'],
 ['Builder','/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'],['Reports','/astrix-app/pages/reports/'],
 ['Storage','/astrix-app/pages/vault/'],['Armoury','/astrix-app/pages/loadout/'],['Build Review','/astrix-app/pages/build-review/'],
 ['Build Fit','/astrix-app/pages/build-fit/'],['Mission Reports','/astrix-app/pages/mission-reports/']
]);
// Full manifests and manifest-sized data. A page that needs a slice reads a slice.
const MANIFEST_FILES=[
 /\/data\/paradox-forge\/beta\/beta-(?:bungie-manifest-cache|component-identities|bungie-identities)\.json$/,
 /\/data\/(?:armor-information|forge-armour-index|game-components|armor-3-components)\.json$/,
 /\/bungie\/manifest\/import\//
];
const TYPES={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.endsWith('/'))path+='index.html';
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root.replace(/[\\/]$/,'')+sep)){res.writeHead(403).end();return;}
 try{const body=await readFile(file);res.setHeader('Content-Type',TYPES[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const PROFILES={desktop:{viewport:{width:1600,height:900},deviceScaleFactor:1},phone:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}};
const failures=[],summary=[];
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 for(const [profileName,profile] of Object.entries(PROFILES)){
  for(const [name,path] of TOOL_PAGES){
   if(process.env.ASSET_PAGES&&!process.env.ASSET_PAGES.split(',').includes(name))continue;
   const context=await browser.newContext(profile),page=await context.newPage();
   const requested=[],images=new Map();
   await page.route('**/*',route=>{const url=route.request().url();requested.push(url);return url.startsWith(origin)?route.continue():route.abort();});
   page.on('response',async response=>{
    if(response.request().resourceType()!=='image'||!response.url().startsWith(origin))return;
    const body=await response.body().catch(()=>null);if(body)images.set(new URL(response.url()).pathname,body.length);
   });
   await page.goto(origin+path,{waitUntil:'load',timeout:90000});
   const proceed=page.getByRole('button',{name:/continue without live data/i});
   if(await proceed.count().catch(()=>0))await proceed.first().click({timeout:5000}).catch(()=>{});
   await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
   // Workspace pages host DIM import: wait past an idle-time (5 s) prefetch, which must not happen.
   await page.waitForTimeout(/guardian-workspace-v2/.test(path)?6500:1500);
   for(const [image,bytes] of images)if(bytes>IMAGE_LIMIT)failures.push(`${profileName} ${name}: image ${image} is ${Math.round(bytes/1024)} KB (limit 300 KB)`);
   for(const url of requested){const pathname=new URL(url).pathname;if(MANIFEST_FILES.some(pattern=>pattern.test(pathname)))failures.push(`${profileName} ${name}: first load pulls manifest file ${pathname}`);}
   summary.push(`${profileName} ${name} ${Math.round(Math.max(0,...images.values())/1024)} KB`);
   await context.close();
  }
 }
}finally{await browser?.close();server.close();}
assert.deepEqual(failures,[],`Asset weight:\n${failures.join('\n')}`);
console.log(`ASSET_WEIGHT=PASS ${TOOL_PAGES.length} tool pages at 1600 and 390: no first-load image over 300 KB and no full manifest file. Largest image per page: ${summary.join(', ')}`);
