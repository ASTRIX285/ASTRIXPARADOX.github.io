export const PREPARED_PAGE_TTL_MS = 10 * 60_000;
export const PREPARED_PAGE_MAX_BYTES = 24 * 1024 * 1024;
const CHUNK_CHARS = 64_000;

type PreparedPageMeta = {
  page: string;
  manifestVersion: string;
  generatedAt: number;
  chunks: number;
  bytes: number;
};

type PreparedPageSnapshot = {
  body: string;
  generatedAt: number;
  manifestVersion: string;
};

type Storage = Pick<DurableObjectStorage, "get" | "put" | "delete">;

function validPage(page: string): boolean {
  return ["character", "build-forge", "journey", "vault", "loadout"].includes(page);
}

export class PreparedPageCache {
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  private prefix(page: string): string {
    if (!validPage(page)) throw new TypeError(`Unknown prepared page ${page}`);
    return `prepared-page:${page}:`;
  }

  async read(page: string, manifestVersion: string, now = Date.now()): Promise<PreparedPageSnapshot | null> {
    const prefix = this.prefix(page);
    const meta = await this.storage.get<PreparedPageMeta>(prefix + "meta");
    if (
      !meta ||
      meta.page !== page ||
      meta.manifestVersion !== manifestVersion ||
      now < meta.generatedAt ||
      now - meta.generatedAt >= PREPARED_PAGE_TTL_MS ||
      !Number.isInteger(meta.chunks) ||
      meta.chunks < 1
    ) return null;

    const keys = Array.from({ length: meta.chunks }, (_, index) => prefix + index);
    const values = await this.storage.get<string>(keys);
    if (!keys.every(key => typeof values.get(key) === "string")) return null;
    const body = keys.map(key => values.get(key)).join("");
    if (!body || new TextEncoder().encode(body).byteLength !== meta.bytes) return null;
    return { body, generatedAt: meta.generatedAt, manifestVersion: meta.manifestVersion };
  }

  async write(page: string, manifestVersion: string, body: string, generatedAt = Date.now()): Promise<boolean> {
    const prefix = this.prefix(page);
    const bytes = new TextEncoder().encode(body).byteLength;
    if (!manifestVersion || !body || bytes > PREPARED_PAGE_MAX_BYTES) return false;
    const previous = await this.storage.get<PreparedPageMeta>(prefix + "meta");
    const chunks = Math.ceil(body.length / CHUNK_CHARS);

    // The marker is the commit point. Readers can never observe mixed chunks.
    await this.storage.delete(prefix + "meta");
    for (let index = 0; index < chunks; index += 1) {
      await this.storage.put(prefix + index, body.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS));
    }
    for (let index = chunks; index < (previous?.chunks || 0); index += 1) {
      await this.storage.delete(prefix + index);
    }
    await this.storage.put<PreparedPageMeta>(prefix + "meta", { page, manifestVersion, generatedAt, chunks, bytes });
    return true;
  }
}

export type { PreparedPageSnapshot };
