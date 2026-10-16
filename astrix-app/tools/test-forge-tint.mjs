// The Forge tint (design/tool-dev-tint, Miguel 16 Oct 2026). Forge pages carry a faint steel-blue cast
// in the background glow and on panel edges, a darker, greyer variation of Bungie's blue. Buttons, tabs
// and strobes stay Ember. Public pages and other tools keep the neutral blacks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH
 ?await import(process.env.PLAYWRIGHT_MODULE_PATH)
 :require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const FORGE=['astrix-app/index.html','astrix-app/pages/home/index.html','astrix-app/pages/forge-loader/index.html','astrix-app/pages/forge-loader/results/index.html',
 'astrix-app/pages/journey/index.html','astrix-app/pages/loadout/index.html','astrix-app/pages/vault/index.html','astrix-app/pages/reports/index.html',
 'astrix-app/pages/mission-reports/index.html','astrix-app/pages/build-fit/index.html','astrix-app/pages/build-review/index.html',
 'astrix-app/pages/guardian-workspace-v2/index.html','astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html',
 'astrix-app/pages/sign-in/index.html','astrix-app/pages/tool-intro/index.html','tools/destiny-2/index.html',
 'tools/destiny-2/dim-companion/index.html','tools/destiny-2/dim-loadout-viewer/index.html'];
for(const page of FORGE)assert.match(readFileSync(resolve(root,page),'utf8'),/<html[^>]*\sdata-dev="bungie"/,`${page} is marked as a Forge page`);
for(const page of ['index.html','pages/clips.html','hub/index.html','hub/aetherium/index.html','hub/workbench/td2/index.html'].filter(p=>existsSync(resolve(root,p))))
 assert.doesNotMatch(readFileSync(resolve(root,page),'utf8'),/data-dev="bungie"/,`${page} is not tinted`);
const palette=readFileSync(resolve(root,'css/astrix-palette.css'),'utf8');
assert.doesNotMatch(palette,/#00a3e3|0,\s*163,\s*227/i,'Bungie\'s own blue is never used, only a variation');

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(path.endsWith('/'))path+='index.html';
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
const rgb=s=>(s.match(/\d+(\.\d+)?/g)||[]).slice(0,3).map(Number);
async function read(path){
 const context=await browser.newContext({viewport:{width:1600,height:900}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.fulfill({status:204,body:''}));
 const page=await context.newPage();
 await page.goto(`${base}${path}`).catch(()=>{});
 await page.waitForTimeout(500);
 const r=await page.evaluate(()=>{
  const probe=(prop,value)=>{const el=document.createElement('div');el.style[prop]=value;document.body.appendChild(el);const out=getComputedStyle(el)[prop];el.remove();return out;};
  return {dev:document.documentElement.dataset.dev||'',line:probe('color','var(--ax-line)'),border:probe('color','var(--apx-colour-border)'),
   ember:probe('color','var(--apx-colour-action)'),map:probe('backgroundImage','var(--forge-paradox-map-art)')};
 });
 await context.close();
 return r;
}
try{
 for(const path of ['/astrix-app/pages/home/','/astrix-app/pages/forge-loader/','/tools/destiny-2/']){
  const r=await read(path);
  assert.equal(r.dev,'bungie',`${path}: Forge page`);
  for(const [name,value] of [['line',r.line],['border',r.border]]){
   const [red,green,blue]=rgb(value);
   assert.ok(blue>red+8&&blue<=green+20&&Math.max(red,green,blue)<90,`${path}: ${name} is a faint cool grey (${value})`);
  }
  assert.match(r.map,/radial-gradient[\s\S]*radial-gradient[\s\S]*astrix-paradox-map-placeholder-4k/,`${path}: tinted glow sits in the map layer under the content`);
  assert.deepEqual(rgb(r.ember),[186,31,18],`${path}: the action colour stays Ember`);
 }
 const pub=await read('/pages/clips.html');
 assert.equal(pub.dev,'',`public page untinted`);
 const [r0,g0,b0]=rgb(pub.line||'rgb(0,0,0)');
 assert.ok(Math.abs(r0-b0)<=6,`public hairline stays neutral (${pub.line})`);
 console.log('FORGE_TINT=PASS 18 Forge pages marked, cool-grey lines and steel-blue glow under the content, Ember actions, public pages neutral');
}finally{await browser.close();server.close();}
