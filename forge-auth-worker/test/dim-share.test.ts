import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dimShareRoute } from '../src/dim-share.ts';
class EdgeCache {
 rows=new Map<string,Response>();
 async match(key:Request){return this.rows.get(key.url)?.clone();}
 async put(key:Request,response:Response){this.rows.set(key.url,response.clone());}
}
test('DIM proxy isolates upstream credentials, validates paths and caches/coalesces shares',async()=>{
 const cache=new EdgeCache();let calls=0;
 const fixture=JSON.parse(await readFile(new URL('../../astrix-app/tools/fixtures/dim-import/fixturea.json',import.meta.url),'utf8'));
 const fetchImpl=async(input:any,init:any)=>{calls++;assert.equal(String(input),'https://api.destinyitemmanager.com/loadout_share?shareId=fixturea');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.deepEqual(init.headers,{Accept:'application/json'});return Response.json(fixture);};
 const request=new Request('https://astrixparadox.com/dim/share/fixturea',{headers:{Cookie:'synthetic-only',Authorization:'synthetic-only'}});
 const [a,b]=await Promise.all([dimShareRoute(request,cache,fetchImpl as any),dimShareRoute(request,cache,fetchImpl as any)]);
 assert.deepEqual(await a.json(),fixture);assert.deepEqual(await b.json(),fixture);assert.equal(calls,1);
 await dimShareRoute(request,cache,fetchImpl as any);assert.equal(calls,1);
 assert.equal((await dimShareRoute(new Request('https://astrixparadox.com/dim/share/invalid/path'),cache,fetchImpl as any)).status,400);
 assert.equal((await dimShareRoute(new Request(request,{method:'POST'}),cache,fetchImpl as any)).status,405);
});
test('DIM expired, unreachable and malformed shares remain honest failures',async()=>{
 for(const status of [404,410,429,503]){
  const response=await dimShareRoute(new Request('https://astrixparadox.com/dim/share/fixtureb'),new EdgeCache(),(async()=>new Response(null,{status})) as any);
  assert.equal(response.status,status===404||status===410?status:503);
  assert.equal((await response.json() as any).error,status===404||status===410?'expired_link':'dim_unreachable');
 }
 assert.equal((await dimShareRoute(new Request('https://astrixparadox.com/dim/share/fixturec'),new EdgeCache(),(async()=>Response.json({})) as any)).status,503);
});
