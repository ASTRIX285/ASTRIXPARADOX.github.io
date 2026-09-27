import assert from 'node:assert/strict';
import {IMPORT_TABLES} from '../core/dim-import/cache.mjs';
import {smokeDimManifest} from './smoke-dim-manifest.mjs';
const version='synthetic-smoke-v1';
const descriptor=()=>({manifestVersion:version,shards:1,definitions:1,sha256:['synthetic-checksum']});
const fresh=()=>({manifestVersion:version,tables:Object.fromEntries(IMPORT_TABLES.map(type=>[type,descriptor()]))});
let index=fresh(),shardStatus=200,cors=true,requests=[];
const fetchImpl=async input=>{
  const url=new URL(input);requests.push(url);
  const headers=cors?{'Access-Control-Allow-Origin':'https://astrixparadox.com'}:{};
  if(url.pathname.endsWith('/status'))return Response.json(index,{headers});
  if(shardStatus!==200)return new Response(null,{status:shardStatus,headers});
  return Response.json({manifestVersion:version,type:url.searchParams.get('type'),shard:0,archive:url.searchParams.get('archive')==='1',definitions:{1:{hash:1}}},{headers});
};
const run=()=>smokeDimManifest({fetchImpl});
assert.equal((await run()).tables,IMPORT_TABLES.length);
index.retiredTables={[IMPORT_TABLES[0]]:descriptor()};
assert.equal((await run()).shards,IMPORT_TABLES.length+1);
// Reproduce the production split: status is healthy, import route is absent.
shardStatus=404;await assert.rejects(run(),/HTTP 404/);
shardStatus=503;await assert.rejects(run(),/HTTP 503/);
shardStatus=200;index=fresh();delete index.tables[IMPORT_TABLES.at(-1)];requests=[];
await assert.rejects(run(),/Missing DIM table/);assert.equal(requests.length,1);
index=fresh();delete index.tables[IMPORT_TABLES[0]].manifestVersion;
await assert.rejects(run(),/Unprepared DIM table/);
index=fresh();cors=false;await assert.rejects(run(),/CORS/);
console.log('DIM_MANIFEST_SMOKE=PASS legacy coverage, missing route, failures, CORS and archived shard checks');
