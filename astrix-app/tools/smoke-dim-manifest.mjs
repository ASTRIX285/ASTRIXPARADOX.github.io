import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {IMPORT_TABLES} from '../core/dim-import/cache.mjs';
import {smokeFetch} from '../../.github/scripts/worker-smoke-fetch.mjs';

// Public endpoints only. A healthy status alone does not prove DIM can import.
export async function smokeDimManifest({origin='https://auth.astrixparadox.com',fetchImpl=smokeFetch}={}){
  const get=async path=>{
    const response=await fetchImpl(`${origin}/bungie/manifest/import/${path}`,{headers:{Origin:'https://astrixparadox.com'}});
    assert.equal(response.status,200,`DIM manifest ${path}: HTTP ${response.status}`);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://astrixparadox.com','DIM manifest CORS');
    return response.json();
  };
  const index=await get('status'),version=index.manifestVersion;
  assert.ok(typeof version==='string'&&version,'Missing manifest version');
  for(const type of IMPORT_TABLES){
    const descriptor=index.tables?.[type];
    assert.ok(descriptor,`Missing DIM table: ${type}`);
    assert.equal(descriptor.manifestVersion,version,`Unprepared DIM table: ${type}`);
    assert.ok(Number.isInteger(descriptor.shards)&&descriptor.shards>0,`Invalid shards: ${type}`);
    assert.equal(descriptor.sha256?.length,descriptor.shards,`Missing checksums: ${type}`);
  }
  let checked=0;
  for(const type of IMPORT_TABLES){
    for(const archive of [false,true]){
      if(archive&&!index.retiredTables?.[type])continue;
      const query=new URLSearchParams({type,version,shard:'0',archive:archive?'1':'0'});
      const shard=await get(`shard?${query}`);
      assert.equal(shard.manifestVersion,version);
      assert.equal(shard.type,type);
      assert.equal(shard.shard,0);
      assert.equal(shard.archive,archive);
      assert.ok(shard.definitions&&typeof shard.definitions==='object'&&!Array.isArray(shard.definitions));
      checked++;
    }
  }
  return {version,tables:IMPORT_TABLES.length,shards:checked};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await smokeDimManifest();
  console.log(`DIM_MANIFEST_LIVE=PASS tables=${result.tables} shards=${result.shards} version=${result.version}`);
}
