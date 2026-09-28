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

// Build Forge renders at CSS zoom 0.75 on desktop (Miguel, 28 Sep 2026). Rects
// are visual pixels while style lengths are local, so every popup that positions
// from a rect must convert, or it lands at 75% of the intended spot.
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const css=await readFile(resolve(root,'astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.css'),'utf8');
assert.match(css,/@media \(min-width:1280px\)\{html:has\(body\.build-forge-page\)\{zoom:\.75\}\}/,'Build Forge desktop default is 75%');
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/zoom.html'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><link rel="stylesheet" href="/astrix-app/shared/loadout-details.css"><style>html{zoom:.75}body{margin:0}</style><body class="build-forge-page">
  <div id="icons" style="position:absolute;left:900px;top:500px"><button type="button" data-icon-name="Chain Lightning" style="width:40px;height:40px">x</button></div>
  <button id="perk" data-perk-name="Frenzy" style="position:absolute;left:600px;top:300px;width:40px;height:40px">p</button>
  <script type="module">
   import {bindLoadoutIconDetails} from '/astrix-app/shared/loadout-icon-layout.mjs';
   bindLoadoutIconDetails(document.getElementById('icons'));
   window.ready=true;
  </script></body>`);return;}
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1920,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/zoom.html');await page.waitForFunction(()=>window.ready===true);
 await page.locator('#icons button').focus();
 const tip=await page.locator('.apx-icon-tooltip').boundingBox(),button=await page.locator('#icons button').boundingBox();
 assert.ok(Math.abs(tip.x-button.x)<=2,`icon tooltip aligns with its icon under zoom (tip ${tip.x}, icon ${button.x})`);
 assert.ok(tip.y>=button.y+button.height&&tip.y<=button.y+button.height+12,'icon tooltip sits just below its icon under zoom');
 assert.deepEqual(errors,[]);
 console.log('BUILD_FORGE_ZOOM=PASS 75% desktop default, icon tooltip aligned under CSS zoom');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
