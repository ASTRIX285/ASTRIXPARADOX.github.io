import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {profileResponse, preparedAccountChunks, type PreparedProfileCapture} from '../src/profile-response.ts';
import {compactPreparedProfilePlugLists} from '../src/page-semantics.ts';
import {boundedStringify,jsonByteLength,MAX_JSON_BYTES,MAX_PREPARED_PAGE_BYTES} from '../../astrix-app/core/bounded-json.mjs';
const plugs=Array.from({length:256},(_,i)=>({plugItemHash:1000+i,canInsert:true,enabled:true,isEnabled:true,isVisible:true,enableFailIndexes:[],insertFailIndexes:[]}));
function account(){return {authenticated:true,profile:{itemComponents:{reusablePlugs:{data:Object.fromEntries(Array.from({length:1100},(_,i)=>[`synthetic-${i}`,{plugs:{0:plugs}}]))}}},definitions:{}};}
test('large raw profile reaches compaction without intermediate JSON and stays flat over ten loads',async()=>{
 const before=jsonByteLength(account(),{limit:MAX_PREPARED_PAGE_BYTES});assert.ok(before>MAX_JSON_BYTES);
 const sizes:number[]=[];
 for(let i=0;i<10;i++){
  const payload=account(),capture:PreparedProfileCapture={};
  const response=profileResponse(payload,undefined,capture);
  assert.equal(response.status,204);assert.equal(await response.text(),'');assert.equal(capture.payload,payload);
  assert.equal(compactPreparedProfilePlugLists(capture.payload),true);
  const serialized=boundedStringify(capture.payload,'prepared account');sizes.push(Buffer.byteLength(serialized));
  assert.equal(JSON.parse(serialized).authenticated,true);
 }
 assert.equal(new Set(sizes).size,1);assert.ok(sizes[0]<MAX_JSON_BYTES);
 console.log(`PREPARED_HANDOFF_BYTES before=${before} after=${sizes[0]} loads=10 flat=true`);
});
test('oversized public profile remains a retryable error, never signed out',async()=>{
 const response=profileResponse(account());assert.equal(response.status,503);
 const body=await response.json() as any;assert.equal(body.error,'profile_payload_too_large');assert.notEqual(body.authenticated,false);
});
test('prepared route captures internally then compacts before the guarded envelope',async()=>{
 const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
 assert.match(source,/profileRoute\(new Request\(profileUrl, \{ headers: request.headers \}\), env, captured\)/);
 assert.match(source,/if \(!profileResponse.ok\) return profileResponse;\s*const payload = captured.payload/);
 assert.match(source,/compactPreparedProfilePlugLists\(payload\);[\s\S]*?preparedPageEnvelope\(request, env, payload, prepared\)/);
 assert.match(source,/preparedAccountChunks\(account\)/);
});

test('public definitions above 20 MB stream losslessly while private profile guard stays intact',()=>{
 const payload={profile:{characters:{data:{}}},definitions:Object.fromEntries(Array.from({length:24},(_,i)=>[String(i),{description:'x'.repeat(1024*1024)}]))};
 const encoded=preparedAccountChunks(payload);assert.ok(encoded.byteLength>MAX_JSON_BYTES);assert.ok(encoded.chunks.length>1);
 assert.deepEqual(JSON.parse(Buffer.concat(encoded.chunks).toString()),payload);
 assert.throws(()=>preparedAccountChunks({profile:{data:'x'.repeat(MAX_JSON_BYTES)}}),/20 MB/);
 assert.throws(()=>preparedAccountChunks({profile:{},definitions:{data:'x'.repeat(MAX_JSON_BYTES)}}),/20 MB/,'An oversized individual string must not bypass the serialization guard');
 assert.throws(()=>preparedAccountChunks({profile:{},definitions:Array(70).fill('x'.repeat(1024*1024))}),/64 MB/);
});
