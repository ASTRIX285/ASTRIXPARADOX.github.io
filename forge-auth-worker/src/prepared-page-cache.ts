import { gzip, gunzip } from './compressed-json.ts';
export const PREPARED_PAGE_TTL_MS = 10 * 60_000;
// This cap now applies to compressed storage, not the expanded JSON snapshot.
export const PREPARED_PAGE_MAX_BYTES = 24 * 1024 * 1024;
export const PREPARED_PAGE_MAX_DECODED_BYTES = 64 * 1024 * 1024;
export const PREPARED_PAGE_CHUNK_BYTES = 60 * 1024;
// Account part of a prepared page. Served at once for display requests while it is
// younger than the stale limit, then rebuilt in the background once it is older
// than the revalidate age. Live requests never read it.
export const PREPARED_ACCOUNT_REVALIDATE_MS = 60_000;
export const PREPARED_ACCOUNT_STALE_MS = 12 * 60 * 60_000;
type PreparedPageMeta = { page: string; manifestVersion: string; generatedAt: number; chunks: number; bytes: number; encoding?: 'gzip'; storedBytes?: number; membership?: string; dataAt?: number };
type PreparedPageSnapshot = { body: string; generatedAt: number; manifestVersion: string };
type PreparedAccountSnapshot = PreparedPageSnapshot & { membership: string; dataAt: number };
type Storage = Pick<DurableObjectStorage, 'transaction'>;
type ListStorage = Pick<DurableObjectStorage, 'list' | 'delete'>;
const PAGES = ['character', 'build-forge', 'journey', 'vault', 'loadout'];
function prefix(page: string): string {
  if (!PAGES.includes(page)) throw new TypeError(`Unknown prepared page ${page}`);
  return `prepared-page:${page}:`;
}
function accountPrefix(membership: string, page: string): string {
  if (!PAGES.includes(page)) throw new TypeError(`Unknown prepared page ${page}`);
  if (!/^\d+:\d+$/.test(membership)) throw new TypeError('Prepared account needs a Destiny membership');
  return `prepared-account:${membership}:${page}:`;
}

async function readChunks(storage: Storage, key: string, accept: (meta: PreparedPageMeta) => boolean): Promise<{ meta: PreparedPageMeta; body: string } | null> {
  const snapshot = await storage.transaction(async tx => {
    const meta = await tx.get<PreparedPageMeta>(key + 'meta');
    if (!meta || !accept(meta) || !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > 4096) return null;
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
    return {meta, body};
  } catch { return null; }
}

async function writeChunks(storage: Storage, key: string, body: string, meta: Omit<PreparedPageMeta, 'chunks' | 'bytes' | 'encoding' | 'storedBytes'>): Promise<boolean> {
  const bytes = new Blob([body]).size;
  if (!meta.manifestVersion || !body || bytes > PREPARED_PAGE_MAX_DECODED_BYTES) return false;
  const packed = await gzip(body);
  if (packed.byteLength > PREPARED_PAGE_MAX_BYTES) return false;
  const chunks = Math.ceil(packed.byteLength / PREPARED_PAGE_CHUNK_BYTES);
  await storage.transaction(async tx => {
    const previous = await tx.get<PreparedPageMeta>(key + 'meta');
    for (let i = 0; i < chunks; i++) await tx.put(key + i, packed.slice(i * PREPARED_PAGE_CHUNK_BYTES, (i + 1) * PREPARED_PAGE_CHUNK_BYTES));
    for (let i = chunks; i < (previous?.chunks || 0); i++) await tx.delete(key + i);
    await tx.put<PreparedPageMeta>(key + 'meta', {...meta, chunks, bytes, encoding: 'gzip', storedBytes: packed.byteLength});
  });
  return true;
}

export class PreparedPageCache {
  private storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }
  async read(page: string, manifestVersion: string, now = Date.now()): Promise<PreparedPageSnapshot | null> {
    const found = await readChunks(this.storage, prefix(page), meta => meta.page === page && meta.manifestVersion === manifestVersion && now >= meta.generatedAt && now - meta.generatedAt < PREPARED_PAGE_TTL_MS);
    return found ? {body: found.body, generatedAt: found.meta.generatedAt, manifestVersion: found.meta.manifestVersion} : null;
  }
  async write(page: string, manifestVersion: string, body: string, generatedAt = Date.now()): Promise<boolean> {
    return writeChunks(this.storage, prefix(page), body, {page, manifestVersion, generatedAt});
  }
}

/** Account part only, keyed by Destiny membership and page; never holds the public bundle. */
export class PreparedAccountCache {
  private storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }
  async read(membership: string, page: string, manifestVersion: string, now = Date.now()): Promise<PreparedAccountSnapshot | null> {
    const found = await readChunks(this.storage, accountPrefix(membership, page), meta =>
      meta.page === page && meta.membership === membership && meta.manifestVersion === manifestVersion &&
      Number.isFinite(meta.dataAt) && now >= meta.dataAt! && now - meta.dataAt! < PREPARED_ACCOUNT_STALE_MS);
    return found ? {body: found.body, generatedAt: found.meta.generatedAt, manifestVersion: found.meta.manifestVersion, membership, dataAt: found.meta.dataAt!} : null;
  }
  async write(membership: string, page: string, manifestVersion: string, body: string, dataAt: number, generatedAt = Date.now()): Promise<boolean> {
    if (!Number.isFinite(dataAt) || dataAt > generatedAt) return false;
    const key = accountPrefix(membership, page);
    // A slower rebuild that started earlier never replaces newer account data.
    const current = await this.storage.transaction(tx => tx.get<PreparedPageMeta>(key + 'meta'));
    if (current?.membership === membership && current.manifestVersion === manifestVersion && Number(current.dataAt) > dataAt) return false;
    return writeChunks(this.storage, key, body, {page, manifestVersion, generatedAt, membership, dataAt});
  }
}

/** Removes every cached page, account part and profile snapshot held for a session. */
export async function clearSessionCaches(storage: ListStorage): Promise<number> {
  let removed = 0;
  for (const prefixName of ['prepared-account:', 'prepared-page:', 'profile:']) {
    for (;;) {
      const rows = await storage.list({prefix: prefixName, limit: 128});
      if (!rows.size) break;
      removed += await storage.delete([...rows.keys()]);
      if (rows.size < 128) break;
    }
  }
  return removed;
}
export type { PreparedPageSnapshot, PreparedAccountSnapshot };
