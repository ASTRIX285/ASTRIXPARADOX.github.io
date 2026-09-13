// Display data only. Apply never enters this cache; it reads Bungie directly.
export const DISPLAY_TTL_MS = 5 * 60_000;
export const DISPLAY_STALE_TTL_MS = 12 * 60 * 60_000;
const MAX_BYTES = 16 * 1024 * 1024;
const CHUNK_CHARS = 32_000;
type Storage = Pick<DurableObjectStorage, "get" | "put" | "delete">;
type Snapshot = { body: string; fetchedAt: number; source: "bungie" | "snapshot" };
type DeferWrite = (task: Promise<void>) => void;

export class ProfileSnapshotCache {
  private pending = new Map<string, Promise<Snapshot>>();
  private refreshing = new Map<string, Promise<void>>();
  private hot = new Map<string, Snapshot>();
  private storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }

  async read(key: string, load: () => Promise<string>, now = Date.now(), deferWrite?: DeferWrite): Promise<Snapshot> {
    const hot = this.hot.get(key);
    if (hot && now >= hot.fetchedAt && now - hot.fetchedAt < DISPLAY_STALE_TTL_MS) {
      if (now - hot.fetchedAt < DISPLAY_TTL_MS) return hot;
      if (deferWrite) {
        this.deferRefresh(key, `profile:${key}:`, undefined, load, deferWrite);
        return hot;
      }
    }
    const active = this.pending.get(key);
    if (active) return active;
    const task = this.resolve(key, load, now, deferWrite);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  private async persist(prefix: string, body: string, fetchedAt: number, previous?: { chunks: number }): Promise<void> {
    const chunks = Math.ceil(body.length / CHUNK_CHARS);
    // Invalidate the marker first; a failed write cannot expose mixed generations.
    await this.storage.delete(prefix + "meta");
    for (let i = 0; i < chunks; i++) await this.storage.put(prefix + i, body.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
    for (let i = chunks; i < (previous?.chunks || 0); i++) await this.storage.delete(prefix + i);
    await this.storage.put(prefix + "meta", { fetchedAt, chunks });
  }

  private deferRefresh(key: string, prefix: string, previous: { chunks: number } | undefined, load: () => Promise<string>, deferWrite: DeferWrite): void {
    if (this.refreshing.has(key)) return;
    const refresh = (async () => {
      const body = await load();
      const fetchedAt = Date.now();
      this.hot.set(key, { body, fetchedAt, source: "bungie" });
      if (new TextEncoder().encode(body).byteLength <= MAX_BYTES) await this.persist(prefix, body, fetchedAt, previous);
    })().finally(() => this.refreshing.delete(key));
    this.refreshing.set(key, refresh);
    deferWrite(refresh);
  }

  private async resolve(key: string, load: () => Promise<string>, now: number, deferWrite?: DeferWrite): Promise<Snapshot> {
    const prefix = `profile:${key}:`;
    const previous = await this.storage.get<{ fetchedAt: number; chunks: number }>(prefix + "meta");
    if (previous && now >= previous.fetchedAt && now - previous.fetchedAt < DISPLAY_STALE_TTL_MS) {
      const keys = Array.from({ length: previous.chunks }, (_, i) => prefix + i);
      const values = await this.storage.get<string>(keys);
      if (keys.every(k => typeof values.get(k) === "string")) {
        const snapshot: Snapshot = { body: keys.map(k => values.get(k)).join(""), fetchedAt: previous.fetchedAt, source: "snapshot" };
        this.hot.set(key, snapshot);
        if (now - previous.fetchedAt < DISPLAY_TTL_MS) return snapshot;
        if (deferWrite) {
          this.deferRefresh(key, prefix, previous, load, deferWrite);
          return snapshot;
        }
      }
    }
    const body = await load(); // Never cache errors or serve expired data after a failed refresh.
    const fetchedAt = Date.now();
    this.hot.set(key, { body, fetchedAt, source: "bungie" });
    if (new TextEncoder().encode(body).byteLength <= MAX_BYTES) {
      const write = this.persist(prefix, body, fetchedAt, previous);
      if (deferWrite) deferWrite(write);
      else await write;
    }
    return { body, fetchedAt, source: "bungie" };
  }
}
