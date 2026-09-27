import assert from 'node:assert/strict';
import {test} from 'node:test';

test('45 MB public bundle write can take longer than 800 ms and survives a new module instance',async t=>{
  let record:any,closed=false,commits=0;
  const bundle={manifestVersion:'large-v1',padding:'x'.repeat(45*1024*1024)};
  t.mock.method(globalThis as any,'setTimeout',globalThis.setTimeout);
  const previous=(globalThis as any).indexedDB;
  (globalThis as any).indexedDB={open(){
    const request:any={result:{close(){closed=true;},transaction(_name:string,mode:string){
      const tx:any={objectStore(){return {
        put(value:any){assert.equal(closed,false);setTimeout(()=>{record=structuredClone(value);commits++;tx.oncomplete();},950);return {};},
        get(){const operation:any={};queueMicrotask(()=>{operation.result=record;tx.oncomplete();});return operation;}
      };}};return tx;
    }}};
    queueMicrotask(()=>{closed=false;request.onsuccess();});return request;
  }};
  try{
    const cache=await import('../../astrix-app/core/prepared-bundle-cache.mjs?writer');
    let settled=false;const saving=cache.savePreparedBundle('journey',bundle).then((ok:boolean)=>{settled=true;return ok;});
    await new Promise(resolve=>setTimeout(resolve,850));
    assert.equal(settled,false,'A deadline must not report success or close an active large write');
    assert.equal(closed,false);assert.equal(commits,0);
    assert.equal(await saving,true);assert.equal(commits,1);
    const reload=await import('../../astrix-app/core/prepared-bundle-cache.mjs?reader');
    assert.deepEqual(await reload.readPreparedBundle('journey'),bundle);
    assert.equal(await cache.savePreparedBundle('journey',{...bundle,account:{private:true}}),false);
    assert.equal(commits,1,'Private account data never reaches IndexedDB');
  }finally{if(previous===undefined)delete (globalThis as any).indexedDB;else (globalThis as any).indexedDB=previous;}
});
