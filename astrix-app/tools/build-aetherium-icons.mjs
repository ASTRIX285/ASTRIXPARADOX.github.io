#!/usr/bin/env node
// The Aetherium app icons and store screenshots (feature/aetherium-pwa, 26 Nov 2026).
//   node astrix-app/tools/build-aetherium-icons.mjs
//
// Icons: the AX logo (img/ax-logo-640.webp), unaltered, scaled with its own proportions and centred on the Aetherium page
// colour (--ae-page #070b14). Never redrawn, recoloured, cropped or stretched.
//   icon-192.png, icon-512.png          purpose "any": the logo 80 percent of the width
//   maskable-192.png, maskable-512.png  purpose "maskable": the logo 60 percent of the width, so its corners stay inside
//                                       the safe zone (the centre circle of 80 percent) whatever mask the phone uses
//   apple-touch-icon.png (180)          the logo 72 percent of the width (iOS rounds the corners itself)
// Screenshots: the real Aetherium home on a local server, wide (1280 x 720) and narrow (390 x 844 at 2x), with no
// Daeva on the device, so no character data is ever in them. The Worker's server list is answered from the saved
// servers.json; nothing is sent to the real Worker.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const OUT='hub/aetherium/icons';
const SHOTS='hub/aetherium/screenshots';
export const PAGE_COLOUR='#070b14';
export const ICONS=Object.freeze([
  ['icon-192.png',192,0.8],['icon-512.png',512,0.8],
  ['maskable-192.png',192,0.6],['maskable-512.png',512,0.6],
  ['apple-touch-icon.png',180,0.72]
]);
const WORKER='https://aetherium-worker.astrix285.workers.dev';
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch();
await mkdir(resolve(ROOT,OUT),{recursive:true});
await mkdir(resolve(ROOT,SHOTS),{recursive:true});

const page=await browser.newPage();
await page.setContent('<!doctype html><title>icons</title>');
const logo=`data:image/webp;base64,${(await readFile(resolve(ROOT,'img/ax-logo-640.webp'))).toString('base64')}`;
for(const [name,size,share] of ICONS){
  const png=await page.evaluate(async({logo,size,share,colour})=>{
    const img=new Image();img.src=logo;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');ctx.fillStyle=colour;ctx.fillRect(0,0,size,size);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const width=size*share,height=width*img.naturalHeight/img.naturalWidth;
    ctx.drawImage(img,(size-width)/2,(size-height)/2,width,height);
    return canvas.toDataURL('image/png').split(',')[1];
  },{logo,size,share,colour:PAGE_COLOUR});
  await writeFile(resolve(ROOT,OUT,name),Buffer.from(png,'base64'));
  console.log(`${OUT}/${name} ${size}`);
}
await page.close();

const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let file=resolve(ROOT,'.'+path);
  if(!file.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
  if(path.endsWith('/'))file=resolve(file,'index.html');
  try{const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const saved=JSON.parse(await readFile(resolve(ROOT,'astrix-app/games/aion2/data/servers.json'),'utf8'));
for(const [name,options] of [
  ['home-wide.jpg',{viewport:{width:1280,height:720},deviceScaleFactor:1}],
  ['home-narrow.jpg',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]
]){
  const context=await browser.newContext({...options,serviceWorkers:'block'});
  await context.route(`${WORKER}/**`,route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/aion2/servers')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({serverList:saved.regions?.[url.searchParams.get('region')]??[]})});
    return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
  });
  const shot=await context.newPage();
  await shot.goto(`${base}/hub/aetherium/`,{waitUntil:'networkidle'});
  await shot.waitForFunction(()=>document.documentElement.dataset.aetheriumReady==='true');
  await shot.waitForTimeout(800);
  await shot.screenshot({path:resolve(ROOT,SHOTS,name),type:'jpeg',quality:82});
  console.log(`${SHOTS}/${name}`);
  await context.close();
}
server.close();
await browser.close();
