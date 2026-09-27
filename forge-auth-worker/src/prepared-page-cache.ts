import { gzip, gunzip } from './compressed-json.ts';
export const PREPARED_PAGE_TTL_MS = 10 * 60_000;
// This cap now applies to compressed storage, not the expanded JSON snapshot.
export const PREPARED_PAGE_MAX_BYTES = 24 * 1024 * 1024;
export const PREPARED_PAGE_MAX_DECODED_BYTES = 64 * 1024 * 1024;
export const PREPARED_PAGE_CHUNK_BYTES = 60 * 1024;
type PreparedPageMeta = { page: string; manifestVersion: string; generatedAt: number; chunks: number; bytes: number; encoding?: 'gzip'; storedBytes?: number };
type PreparedPageSnapshot = { body: string; generatedAt: number; manifestVersion: string };
type Storage = Pick<DurableObjectStorage, 'transaction'>;
function prefix(page: string): string {
  if (!['character', 'build-forge', 'journey', 'vault', 'loadout'].includes(page)) throw new TypeError(`Unknown prepared page ${page}`);
  return `prepared-page:${page}:`;
}
export class PreparedPageCache {
  private storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }
  async read(page: string, manifestVersion: string, now = Date.now()): Promise<PreparedPageSnapshot | null> {
    const key = prefix(page);
    const snapshot = await this.storage.transaction(async tx => {
      const meta = await tx.get<PreparedPageMeta>(key + 'meta');
      if (!meta || meta.page !== page || meta.manifestVersion !== manifestVersion || now < meta.generatedAt || now - meta.generatedAt >= PREPARED_PAGE_TTL_MS || !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > 4096) return null;
      const parts: (Uint8Array | string)[] = [];
      // Durable Object multi-get accepts at most 128 keys.
      for (let i = 0; i < meta.chunks; i += 64) {
        const keys = Array.from({length: Math.min(64, meta.chunks - i)}, (_, n) => key + (i + n));
        const values = await tx.get<Uint8Array | string>(keys);
        for (const name of keys) {
          const value = values.get(name);
          if (meta.encoding === 'gzip' ? !(value instanceof Uint8Array) : typeof value !== 'string') return null;
          parts.push(value!);
        }
      }
      return {meta, parts};
    });
    if (!snapshot) return null;
    const {meta, parts} = snapshot;
    try {
      let body: string;
      if (meta.encoding === 'gzip') {
        const size = (parts as Uint8Array[]).reduce((n, row) => n + row.byteLength, 0);
        if (size !== meta.storedBytes || size > PREPARED_PAGE_MAX_BYTES) return null;
        const bytes = new Uint8Array(size); let offset = 0;
        for (const part of parts as Uint8Array[]) { bytes.set(part, offset); offset += part.byteLength; }
        body = await gunzip(bytes, PREPARED_PAGE_MAX_DECODED_BYTES);
      } else body = parts.join(''); // Existing uncompressed snapshots remain readable.
      if (!body || new TextEncoder().encode(body).byteLength !== meta.bytes) return null;
      return {body, generatedAt: meta.generatedAt, manifestVersion: meta.manifestVersion};
    } catch { return null; }
  }
  async write(page: string, manifestVersion: string, body: string, generatedAt = Date.now()): Promise<boolean> {
    const key = prefix(page), bytes = new Blob([body]).size;
    if (!manifestVersion || !body || bytes > PREPARED_PAGE_MAX_DECODED_BYTES) return false;
    const packed = await gzip(body);
    if (packed.byteLength > PREPARED_PAGE_MAX_BYTES) return false;
    const chunks = Math.ceil(packed.byteLength / PREPARED_PAGE_CHUNK_BYTES);
    await this.storage.transaction(async tx => {
      const previous = await tx.get<PreparedPageMeta>(key + 'meta');
      for (let i = 0; i < chunks; i++) await tx.put(key + i, packed.slice(i * PREPARED_PAGE_CHUNK_BYTES, (i + 1) * PREPARED_PAGE_CHUNK_BYTES));
      for (let i = chunks; i < (previous?.chunks || 0); i++) await tx.delete(key + i);
      await tx.put<PreparedPageMeta>(key + 'meta', {page, manifestVersion, generatedAt, chunks, bytes, encoding: 'gzip', storedBytes: packed.byteLength});
    });
    return true;
  }
}
export type { PreparedPageSnapshot };
