import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const pages=['journey','guardian-workspace-v2','forge-loader','guardian-workspace-v2/paradox-build-space','reports','vault','loadout'];
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{
  let data=await readFile(file);
  // Isolate layout from account/network state, preserving all production styles.
  if(file.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
let browser;
try{
 try{browser=await chromium.launch({channel:'chromium',headless:true});}catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('NOT RUN: Chromium missing');process.exitCode=0;}else throw error;}
 if(browser){
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const width of [1363,2560])for(const route of pages){
   const page=await browser.newPage({viewport:{width,height:1080}});
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.goto(`${origin}/astrix-app/pages/${route}/`);
   await page.addScriptTag({url:origin+'/astrix-app/shared/astrix-destination-ribbon.js'});
   await page.locator('.apx-destination-ribbon a').first().waitFor();
   if(route==='reports')await page.locator('#reportsWorkspace').evaluate(node=>node.innerHTML='<p role="status">Reports unavailable</p>');
   const links=page.locator('.apx-destination-ribbon a');assert.equal(await links.count(),7);
   assert.equal(await links.locator('..').first().evaluate(node=>getComputedStyle(node.parentElement).gap),'6px');
   const measures=await links.evaluateAll(nodes=>nodes.map(node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();
    const probe=document.createElement('i');probe.style.background='var(--apx-colour-action)';document.body.append(probe);const crimson=getComputedStyle(probe).backgroundColor;probe.remove();
    const band=document.querySelector('[data-forge-destination-ribbon]');
    return {radius:style.borderRadius,background:style.backgroundColor,band:getComputedStyle(band,'::before').backgroundColor,active:node.getAttribute('aria-current')==='page',crimson,shadow:style.boxShadow,width:rect.width,height:rect.height,left:text.left,right:text.right};
   }));
   assert.equal(measures.filter(row=>row.active).length,1);
   for(const row of measures){assert.equal(row.radius,'8px');assert.notEqual(row.background,row.band);assert.ok(row.left>=12&&row.right<=width-12,JSON.stringify(row));if(row.active){assert.equal(row.background,row.crimson);assert.equal(row.shadow,'none');}}
   for(let index=0;index<7;index++){
    const link=links.nth(index);await link.hover();await link.focus();
    const state=await link.evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {width:r.width,height:r.height,outline:s.outlineWidth,border:s.borderTopWidth};});
    assert.equal(state.width,measures[index].width);assert.equal(state.height,measures[index].height);assert.equal(state.outline,'2px');assert.equal(state.border,'1px');
   }
   const footer=page.locator('.apx-bungie-attribution');assert.ok(await footer.count()>0);await footer.scrollIntoViewIfNeeded();
   const bounds=await footer.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].map(r=>({left:r.left,right:r.right}));});
   assert.ok(bounds.length>0);for(const rect of bounds)assert.ok(rect.left>=12&&rect.right<=width-12,`${route} footer ${JSON.stringify(rect)}`);
   if(route==='reports'){
    const rect=await page.locator('#reportsWorkspace [role=status]').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();return {left:r.left,right:r.right};});
    assert.ok(rect.left>=12&&rect.right<=width-12);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} horizontal overflow`);
   console.log(`RIBBON_BROWSER=PASS route=${route} width=${width}`);await page.close();
  }
 }
}finally{await browser?.close();if(server.listening)await new Promise(done=>server.close(done));}
