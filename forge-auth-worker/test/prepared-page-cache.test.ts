import test from "node:test";
import assert from "node:assert/strict";
import { PREPARED_PAGE_MAX_BYTES, PREPARED_PAGE_TTL_MS, PreparedPageCache } from "../src/prepared-page-cache.ts";

class MemoryStorage {
  rows = new Map<string, unknown>();
  async get<T>(key: string | string[]): Promise<T | Map<string, T> | undefined> {
    if (Array.isArray(key)) return new Map(key.filter(row => this.rows.has(row)).map(row => [row, this.rows.get(row) as T]));
    return this.rows.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> { this.rows.set(key, value); }
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
  assert.equal(await cache.write("vault", "manifest-v1", "x".repeat(PREPARED_PAGE_MAX_BYTES + 1)), false);
});
