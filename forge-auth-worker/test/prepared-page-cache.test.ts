import test from "node:test";
import assert from "node:assert/strict";
import { PREPARED_PAGE_MAX_DECODED_BYTES, PREPARED_PAGE_TTL_MS, PreparedPageCache } from "../src/prepared-page-cache.ts";

class MemoryStorage {
  rows = new Map<string, unknown>();
  async get<T>(key: string | string[]): Promise<T | Map<string, T> | undefined> {
    if (Array.isArray(key)) return new Map(key.filter(row => this.rows.has(row)).map(row => [row, this.rows.get(row) as T]));
    return this.rows.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> { assert.ok((value instanceof Uint8Array ? value.byteLength : new TextEncoder().encode(JSON.stringify(value)).byteLength) < 128*1024); this.rows.set(key, value); }
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> { const before=structuredClone(this.rows); try { return await fn(this); } catch(error) { this.rows=before; throw error; } }
  async delete(key: string): Promise<boolean> { return this.rows.delete(key); }
}

test("prepared pages remain exact, version-bound and time-bound", async () => {
  const storage = new MemoryStorage();
  const cache = new PreparedPageCache(storage as unknown as DurableObjectStorage);
  const generatedAt = 1_000_000;
  const body = JSON.stringify({ transport: "prepared-page-stream-v1", payload: "x".repeat(150_000) });
  assert.equal(await cache.write("character", "manifest-v1", body, generatedAt), true);
  assert.equal((await cache.read("character", "manifest-v1", generatedAt + 1))?.body, body);
  assert.equal(await cache.read("character", "manifest-v2", generatedAt + 1), null);
  assert.equal(await cache.read("character", "manifest-v1", generatedAt + PREPARED_PAGE_TTL_MS), null);
});

test("prepared page writes reject unknown pages and oversized bodies", async () => {
  const cache = new PreparedPageCache(new MemoryStorage() as unknown as DurableObjectStorage);
  await assert.rejects(() => cache.write("unknown", "manifest-v1", "{}"), /Unknown prepared page/);
  assert.equal(await cache.write("vault", "manifest-v1", "x".repeat(PREPARED_PAGE_MAX_DECODED_BYTES + 1)), false);
});

test('large real-definition snapshots compress below storage limits and retain every byte',async()=>{
 const {largeLoadoutFixture}=await import('./large-loadout-fixture.ts');
 const {items,manifest}=await largeLoadoutFixture();
 const body=JSON.stringify({transport:'prepared-page-stream-v1',definitions:manifest.tables,inventory:Array.from({length:100},()=>items).flat()});
 assert.ok(new Blob([body]).size>24*1024*1024,'Regression crosses former whole-snapshot cap');
 const storage=new MemoryStorage(),cache=new PreparedPageCache(storage as any);
 assert.equal(await cache.write('character','fixture-manifest',body),true);
 assert.equal((await cache.read('character','fixture-manifest'))?.body,body);
 const meta=storage.rows.get('prepared-page:character:meta') as any;
 console.log(`PREPARED_SNAPSHOT_BYTES_BEFORE=${meta.bytes} AFTER=${meta.storedBytes} MAX_SHARD=61440`);
 const first=storage.rows.get('prepared-page:character:0') as Uint8Array; first[0]=0;
 assert.equal(await cache.read('character','fixture-manifest'),null,'Corrupt gzip is a cache miss');
});
test('Unicode, legacy snapshots and write failure keep transactional consistency',async()=>{
 const storage=new MemoryStorage(),cache=new PreparedPageCache(storage as any),body=JSON.stringify({text:'裝備🚀'.repeat(60000)});
 await cache.write('vault','v1',body);assert.equal((await cache.read('vault','v1'))?.body,body);
 const put=storage.put.bind(storage);storage.put=async(key,value)=>{if(key.endsWith(':meta'))throw new Error('write failed');return put(key,value);};
 await assert.rejects(cache.write('vault','v1','{"next":true}'),/write failed/);assert.equal((await cache.read('vault','v1'))?.body,body);
 storage.rows.set('prepared-page:loadout:meta',{page:'loadout',manifestVersion:'v1',generatedAt:Date.now(),chunks:1,bytes:2});storage.rows.set('prepared-page:loadout:0','{}');assert.equal((await cache.read('loadout','v1'))?.body,'{}');
});
