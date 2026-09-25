// Prompt 19: inspect rendered page text and accessible copy without a live account.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname,relative} from 'node:path';
import {bannedCopy} from './plain-language-copy.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(resolve(dir,e.name)):resolve(dir,e.name)))).flat();
const files=(await walk(resolve(root,'astrix-app/pages'))).filter(file=>file.endsWith('.html'));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+path);if(!file.startsWith(root)){res.writeHead(403).end();return;}
  let data=await readFile(file);if(file.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data);
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
  browser=await chromium.launch({channel:'chromium',headless:true});const page=await browser.newPage();
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  for(const file of files){
    await page.goto(`${origin}/${relative(root,file)}`,{waitUntil:'domcontentloaded'});
    const copy=await page.evaluate(()=>{
      const rows=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode())if(!walker.currentNode.parentElement.closest('script,style'))rows.push(walker.currentNode.textContent);
      for(const node of document.querySelectorAll('[aria-label],[aria-description],[aria-valuetext],[title],[alt],[placeholder]'))for(const name of ['aria-label','aria-description','aria-valuetext','title','alt','placeholder'])if(node.hasAttribute(name))rows.push(node.getAttribute(name));
      return rows;
    });
    assert.deepEqual(copy.filter(text=>bannedCopy.test(text)),[],`${relative(root,file)} rendered copy`);
  }
  console.log(`PLAIN_LANGUAGE_RENDERED=PASS ${files.length} page HTML fixtures; dynamic template source checked by validate-plain-language.mjs`);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
