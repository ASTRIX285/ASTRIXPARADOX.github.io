import assert from 'node:assert/strict';
import {cacheBungieProfile,readCachedBungieProfile} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';
import {jsonByteLength,MAX_JSON_BYTES,MAX_PREPARED_PAGE_BYTES} from '../core/bounded-json.mjs';
const sessionRows=new Map(),rows=new Map();
globalThis.sessionStorage={getItem:key=>sessionRows.get(key)||null,setItem:(key,value)=>sessionRows.set(key,value),removeItem:key=>sessionRows.delete(key)};
const db={close(){},transaction(){const tx={objectStore(){return {put(row){rows.set(row.key,structuredClone(row));queueMicrotask(()=>tx.oncomplete());},get(key){const request={};queueMicrotask(()=>{request.result=structuredClone(rows.get(key));request.onsuccess();tx.oncomplete?.();});return request;}};}};return tx;}};
globalThis.indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'synthetic-cache-account'}};
const payload={profile:{characters:{data:{}}},characterBuildCoverage:{schemaVersion:2,complete:true},definitions:Object.fromEntries(Array.from({length:23},(_,i)=>[String(i),{description:'x'.repeat(1024*1024)}]))};
const sizes=[];const errors=[];const originalError=console.error;console.error=(...args)=>errors.push(args);
try{
 for(let i=0;i<10;i++){
  assert.equal(await cacheBungieProfile(session,payload,'character'),true);
  const cached=await readCachedBungieProfile(session,'character');assert.ok(cached);
  sizes.push(jsonByteLength(cached,{limit:MAX_PREPARED_PAGE_BYTES}));assert.equal(cached.payload,undefined);
 }
 assert.equal(errors.length,0,'Valid public tables must not trigger private-profile size errors');
 assert.equal(new Set(sizes).size,1);assert.ok(sizes[0]>MAX_JSON_BYTES);
 const markerKey='astrix:bungie-page-cache:v4:character',marker=sessionRows.get(markerKey);
 assert.equal(await cacheBungieProfile(session,{profile:{data:'x'.repeat(MAX_JSON_BYTES)}},'character'),false);
 assert.equal(sessionRows.get(markerKey),marker,'Rejected writes preserve the last usable marker');
 assert.equal(errors.at(-1)[1].context,'private profile cache');
 delete globalThis.indexedDB;errors.length=0;
 assert.equal(await cacheBungieProfile(session,payload,'character'),false);
 assert.equal(errors.length,0,'Blocked IndexedDB must not attempt a giant sessionStorage JSON fallback');
 assert.equal([...sessionRows.keys()].some(key=>key.startsWith('astrix:bungie-page-cache-fallback:')),false);
 assert.equal(sessionRows.get(markerKey),marker);
}finally{console.error=originalError;delete globalThis.indexedDB;delete globalThis.sessionStorage;}
console.log(`PROFILE_CACHE_BUDGET=PASS bytes=${sizes[0]} loads=10 flat=true private-limit-preserved fallback-safe`);
