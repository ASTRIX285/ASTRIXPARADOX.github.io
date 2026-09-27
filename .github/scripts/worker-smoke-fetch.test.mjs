import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeFetch} from './worker-smoke-fetch.mjs';
const url='https://auth.astrixparadox.com/bungie/profile';
const reset=()=>new TypeError('fetch failed',{cause:Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'})});
const quiet={wait:async()=>{},warn:()=>{}};
test('retries resets with bounded backoff and preserves CORS/401 response',async()=>{
 let calls=0;const delays=[];
 const response=await smokeFetch(url,{headers:{Origin:'http://localhost:8000'}},{...quiet,wait:async ms=>delays.push(ms),fetchImpl:async(target,options)=>{
  assert.equal(target,url);assert.equal(options.headers.Origin,'http://localhost:8000');assert.ok(options.signal instanceof AbortSignal);
  if(++calls<3)throw reset();
  return Response.json({error:'authentication_required'},{status:401,headers:{'Access-Control-Allow-Origin':'http://localhost:8000'}});
 }});
 assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);assert.equal(response.status,401);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'http://localhost:8000');assert.equal((await response.json()).error,'authentication_required');
});
test('persistent transport failure fails after three attempts',async()=>{
 let calls=0;await assert.rejects(smokeFetch(url,{}, {...quiet,fetchImpl:async()=>{calls++;throw reset();}}),/fetch failed/);assert.equal(calls,3);
});
test('retries reset during body read and timeout',async()=>{
 for(const error of [reset(),new DOMException('timed out','TimeoutError')]){
  let calls=0;const response=await smokeFetch(url,{}, {...quiet,fetchImpl:async()=>++calls===1?{arrayBuffer:async()=>{throw error;}}:Response.json({ok:true})});
  assert.equal(calls,2);assert.deepEqual(await response.json(),{ok:true});
 }
});
test('HTTP errors and invalid CORS remain strict assertion failures',async()=>{
 for(const status of [200,401,403,500,503]){
  let calls=0;const response=await smokeFetch(url,{}, {...quiet,fetchImpl:async()=>{calls++;return new Response('invalid',{status});}});
  assert.equal(calls,1);assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.equal(await response.text(),'invalid');
 }
});
test('preflight remains bodyless; non-transient failures are not retried',async()=>{
 const response=await smokeFetch(url,{method:'OPTIONS'},{...quiet,fetchImpl:async()=>new Response(null,{status:204})});assert.equal(response.status,204);assert.equal(await response.text(),'');
 let calls=0;await assert.rejects(smokeFetch(url,{}, {...quiet,fetchImpl:async()=>{calls++;throw new TypeError('invalid URL');}}),/invalid URL/);assert.equal(calls,1);
 await assert.rejects(smokeFetch(url,{method:'POST'},quiet),/read-only/);
});
