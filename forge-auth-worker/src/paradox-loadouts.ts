import { json, withCors, allowedOrigins } from './web.ts';
import type { SessionRecord } from './auth-record';

export const MAX_LOADOUT_BYTES = 8 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const DECIMAL = /^\d{1,30}$/;
const PREFIX = 'paradox:meta:';
const CHUNK = 16_384;
type Account = { membershipId: string; membershipType: string };
type Meta = { id: string; version: number; mutationId: string; deleted: boolean; updatedAt: string; parts: number; characterId: string; revision: number; createdAt: string };
type RecordValue = { schemaVersion: number; id: string; name: string; description: string; createdAt: string; updatedAt: string; revision: number; binding: Account & { characterId: string }; build: Record<string, any>; [key: string]: any };
type Mutation = { baseVersion: number; mutationId: string; deleted: boolean; record: RecordValue | null };
type Storage = Pick<DurableObjectStorage, 'transaction' | 'list'>;

function accountFor(url: URL): Account | null {
  const membershipId = url.searchParams.get('membershipId') || '';
  const membershipType = url.searchParams.get('membershipType') || '';
  return DECIMAL.test(membershipId) && /^\d{1,3}$/.test(membershipType) ? { membershipId, membershipType } : null;
}
function belongs(value: any, account: Account): boolean {
  return value && String(value.membershipId) === account.membershipId && String(value.membershipType) === account.membershipType;
}
function validRecord(record: any, id: string, account: Account): record is RecordValue {
  return record?.schemaVersion === 1 && record.id === id && typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 80
    && typeof record.description === 'string' && record.description.length <= 400
    && belongs(record.binding, account) && belongs(record.build, account)
    && DECIMAL.test(String(record.binding.characterId)) && String(record.build.characterId) === String(record.binding.characterId)
    && Array.isArray(record.build.weapons) && Array.isArray(record.build.armour)
    && Number.isSafeInteger(record.revision) && record.revision > 0;
}
async function bodyFor(request: Request): Promise<any> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) return null;
  if (Number(request.headers.get('Content-Length')) > MAX_LOADOUT_BYTES) throw new RangeError('loadout_too_large');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOADOUT_BYTES) { await reader.cancel(); throw new RangeError('loadout_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}
const chunkKey = (id: string, part: number) => `paradox:data:${id}:${part}`;
async function envelope(tx: DurableObjectTransaction, meta: Meta): Promise<any> {
  let record = null;
  if (!meta.deleted) {
    let body = '';
    for (let part = 0; part < meta.parts; part++) {
      const chunk = await tx.get<string>(chunkKey(meta.id, part));
      if (typeof chunk !== 'string') throw new Error('loadout_storage_incomplete');
      body += chunk;
    }
    record = JSON.parse(body);
  }
  return { id: meta.id, version: meta.version, deleted: meta.deleted, updatedAt: meta.updatedAt, record };
}

// A stable membership-specific object, separate from expiring OAuth/session objects.
// Tombstones prevent an offline device from restoring a deleted build.
export async function storedParadoxLoadouts(request: Request, storage: Storage): Promise<Response> {
  const url = new URL(request.url), account = accountFor(url), id = url.searchParams.get('id') || '';
  if (!account || (id && !ID.test(id))) return json({ error: 'invalid_loadout_request' }, 400);
  if (request.method === 'GET' && !id) {
    const cursor = url.searchParams.get('cursor') || '';
    if (cursor && !ID.test(cursor)) return json({ error: 'invalid_cursor' }, 400);
    const rows = await storage.list<Meta>({ prefix: PREFIX, ...(cursor ? { startAfter: PREFIX + cursor } : {}), limit: 50 });
    const entries = [...rows.values()].map(({ id, version, deleted }) => ({ id, version, deleted }));
    return json({ entries, cursor: entries.length === 50 ? entries.at(-1)!.id : null });
  }
  if (!id) return json({ error: 'loadout_id_required' }, 400);
  if (request.method === 'GET') return storage.transaction(async tx => {
    const meta = await tx.get<Meta>(PREFIX + id);
    return meta ? json(await envelope(tx, meta)) : json({ error: 'loadout_not_found' }, 404);
  });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let input: Mutation;
  try { input = await bodyFor(request); } catch (error) { if (error instanceof RangeError) return json({ error: 'loadout_too_large' }, 413); throw error; }
  if (!input || !Number.isSafeInteger(input.baseVersion) || input.baseVersion < 0 || !ID.test(input.mutationId || '') || typeof input.deleted !== 'boolean'
    || (!input.deleted && !validRecord(input.record, id, account))) return json({ error: 'invalid_loadout_record' }, 400);
  return storage.transaction(async tx => {
    const previous = await tx.get<Meta>(PREFIX + id);
    if (previous?.mutationId === input.mutationId) return json(await envelope(tx, previous));
    if ((previous?.version || 0) !== input.baseVersion) return json({ error: 'loadout_conflict', current: previous ? await envelope(tx, previous) : null }, 409);
    const updatedAt = new Date().toISOString(), record = input.deleted ? null : { ...input.record! };
    if (record) { delete record._sync; delete record._deleted; record.updatedAt = updatedAt; record.createdAt = previous?.createdAt || record.createdAt || updatedAt; record.revision = Math.max(record.revision, (previous?.revision || 0) + 1); }
    const body = record ? JSON.stringify(record) : '', parts = Math.ceil(body.length / CHUNK);
    for (let part = 0; part < parts; part++) await tx.put(chunkKey(id, part), body.slice(part * CHUNK, (part + 1) * CHUNK));
    for (let part = parts; part < (previous?.parts || 0); part++) await tx.delete(chunkKey(id, part));
    const meta: Meta = { id, version: (previous?.version || 0) + 1, mutationId: input.mutationId, deleted: input.deleted, updatedAt, parts, characterId: record?.binding.characterId || previous?.characterId || '', revision: record?.revision || previous?.revision || 0, createdAt: record?.createdAt || previous?.createdAt || updatedAt };
    await tx.put(PREFIX + id, meta);
    return json({ id, version: meta.version, deleted: meta.deleted, updatedAt, record });
  });
}

export async function paradoxLoadoutsRoute(request: Request, env: Env, authenticate: (request: Request, env: Env) => Promise<{ session: SessionRecord } | Response>): Promise<Response> {
  if (!allowedOrigins(env).includes(request.headers.get('Origin') || '')) return withCors(request, env, json({ error: 'origin_not_allowed' }, 403));
  const auth = await authenticate(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url), account = accountFor(url), membership = auth.session.activeDestinyMembership;
  if (!account || !membership || !belongs(membership, account)) return withCors(request, env, json({ error: 'membership_mismatch' }, 403));
  if (request.method === 'POST' && (!request.headers.get('X-CSRF-Token') || request.headers.get('X-CSRF-Token') !== auth.session.csrfToken)) return withCors(request, env, json({ error: 'csrf_validation_failed' }, 403));
  const stub = env.AUTH_RECORDS.get(env.AUTH_RECORDS.idFromName(`paradox-loadouts:${account.membershipType}:${account.membershipId}`));
  const internal = new URL('https://internal/paradox-loadouts'); internal.search = url.search;
  const response = await stub.fetch(new Request(internal, request));
  return withCors(request, env, response);
}
