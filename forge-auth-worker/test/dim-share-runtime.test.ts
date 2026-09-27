import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
// Exercise the actual Workers Request implementation, not Node's more permissive one.
const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(wranglerRequire.resolve('miniflare'));
const {build}=await import(wranglerRequire.resolve('esbuild'));
test('DIM proxy uses a redirect mode accepted by the Workers runtime',async()=>{
 const bundled=await build({stdin:{contents:`import {dimShareRoute} from './src/dim-share.ts';
 export default {async fetch(request){return dimShareRoute(request,{match:async()=>undefined,put:async()=>{}},async(input,init)=>{
 const outgoing=new Request(input,init);
 if(outgoing.redirect!=='manual')throw new Error('Redirects must not be followed');
 return Response.json({loadout:{name:'Runtime fixture',classType:1,equipped:[]}});
 });}}`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,format:'esm',platform:'browser',write:false});
 // Compatible with the workerd binary pinned by the existing Wrangler lockfile.
 const runtime=new Miniflare({modules:true,compatibilityDate:'2026-07-29',script:bundled.outputFiles[0].text});
 try{
  const response=await runtime.dispatchFetch('https://auth.astrixparadox.com/dim/share/fixturea');
  assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json() as any).loadout.name,'Runtime fixture');
 }finally{await runtime.dispose();}
});
