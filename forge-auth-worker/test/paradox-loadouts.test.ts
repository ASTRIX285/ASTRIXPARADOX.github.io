import test from 'node:test';
import assert from 'node:assert/strict';
import { storedParadoxLoadouts, paradoxLoadoutsRoute, MAX_LOADOUT_BYTES } from '../src/paradox-loadouts.ts';
import { createParadoxLoadoutRecord, syncParadoxAccount, saveParadoxLoadout, deleteParadoxLoadout, listParadoxLoadouts } from '../../astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs';

// Synthetic accounts, independent device caches and transactional server storage.
class MemoryStorage {
  rows = new Map<string, any>();
  queue: Promise<any> = Promise.resolve();
  async get(key: string) { return structuredClone(this.rows.get(key)); }
  async put(key: string, value: any) { assert.ok(new TextEncoder().encode(JSON.stringify(value)).length < 128 * 1024); this.rows.set(key, structuredClone(value)); }
  async delete(key: string) { return this.rows.delete(key); }
  async list({ prefix = '', startAfter = '', limit = Infinity } = {}) { return new Map([...this.rows].filter(([key]) => key.startsWith(prefix) && key > startAfter).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)); }
  transaction(fn: (tx: any) => Promise<any>) {
    const task = this.queue.then(async () => { const before = structuredClone(this.rows); try { return await fn(this); } catch (error) { this.rows = before; throw error; } });
    this.queue = task.catch(() => {}); return task;
  }
}
const account = { membershipId: '90001', membershipType: 3 };
const session = { authenticated: true, activeDestinyMembership: account, csrfToken: 'test-csrf' };
const record = (id = crypto.randomUUID(), name = 'Test build') => createParadoxLoadoutRecord({ id, name, build: { ...account, characterId: '80001', characterClass: 'titan', weapons: [{ itemInstanceId: '10001' }], armour: [{ itemInstanceId: '10002', mods: [{ hash: 7001 }] }] } });
function server() {
  const stores = new Map<string, MemoryStorage>();
  const env = { APP_ORIGINS: 'https://astrixparadox.com', AUTH_RECORDS: {
    idFromName: (name: string) => name,
    get: (name: string) => ({ fetch: (request: Request) => { if (!stores.has(name)) stores.set(name, new MemoryStorage()); return storedParadoxLoadouts(request, stores.get(name) as any); } })
  } } as unknown as Env;
  const request = (url: string | URL, init: RequestInit = {}, current: any = session) => paradoxLoadoutsRoute(new Request(url, { ...init, headers: { Origin: 'https://astrixparadox.com', ...Object.fromEntries(new Headers(init.headers)) } }), env, async () => current ? { session: current } as any : Response.json({ error: 'authentication_required' }, { status: 401 }));
  return { stores, request };
}
function device(remote: ReturnType<typeof server>, initial: any[] = []) {
  const rows = new Map(initial.map(row => [row.id, structuredClone(row)]));
  let queue: Promise<any> = Promise.resolve();
  const api = { session, readAll: async () => structuredClone([...rows.values()]), read: async (id: string) => structuredClone(rows.get(id) || null), write: async (row: any) => { rows.set(row.id, structuredClone(row)); }, lock: (fn: () => Promise<any>) => { const task = queue.then(fn); queue = task.catch(() => {}); return task; }, fetchImpl: remote.request, notify() {} };
  const sync = (overrides = {}) => syncParadoxAccount({ ...api, ...overrides });
  const edit = (id: string, name: string) => { const prior = rows.get(id); rows.set(id, { ...prior, name, updatedAt: new Date().toISOString(), _sync: { version: prior._sync?.version || 0, dirty: true, mutationId: crypto.randomUUID() } }); };
  const remove = (id: string) => { edit(id, rows.get(id).name); rows.get(id)._deleted = true; };
  return { rows, api, sync, edit, remove, visible: () => [...rows.values()].filter(row => !row._deleted) };
}
test('existing browser builds migrate and arrive intact on another device without duplicates', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]), phone = device(remote);
  assert.equal((await pc.sync()).state, 'synced'); await phone.sync();
  assert.deepEqual(phone.visible()[0].build, build.build);
  await pc.sync(); await phone.sync(); assert.equal(phone.visible().length, 1);
  assert.equal(phone.visible()[0]._sync.version, 1);
  // Another session for the same membership uses the same durable object.
  const ipad = device(remote); await ipad.sync({ session: { ...session, csrfToken: 'new-session' }, fetchImpl: (url: any, init: any) => remote.request(url, init, { ...session, csrfToken: 'new-session' }) });
  assert.equal(ipad.visible()[0].id, build.id); assert.equal(remote.stores.size, 1);
});
test('offline edits remain pending and a lost acknowledgement can retry without duplication', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]);
  await assert.rejects(pc.sync({ fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(pc.rows.get(build.id)._sync.dirty, true);
  let lost = true;
  await assert.rejects(pc.sync({ fetchImpl: async (url: any, init: any) => { const result = await remote.request(url, init); if (init.method === 'POST' && lost) { lost = false; throw new Error('lost acknowledgement'); } return result; } }), /lost acknowledgement/);
  await pc.sync(); const phone = device(remote); await phone.sync();
  assert.equal(phone.visible().length, 1); assert.equal(phone.visible()[0]._sync.version, 1);
});
test('simultaneous device edits keep both versions, including after retry', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]), phone = device(remote);
  await pc.sync(); await phone.sync(); pc.edit(build.id, 'PC edit'); phone.edit(build.id, 'Phone edit');
  await pc.sync(); assert.equal((await phone.sync()).conflicts, 1); await phone.sync(); await pc.sync();
  assert.deepEqual(pc.visible().map(row => row.name).sort(), ['PC edit', 'Phone edit (conflict copy)']);
  await phone.sync(); assert.equal(phone.visible().length, 2);
});
test('deletions propagate and stale offline edits cannot resurrect the deleted ID', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]), phone = device(remote), oldBrowser = device(remote, [build]);
  await pc.sync(); await phone.sync(); pc.remove(build.id); await pc.sync();
  phone.edit(build.id, 'Offline edit'); await phone.sync(); await phone.sync();
  assert.equal(phone.rows.get(build.id)._deleted, true);
  assert.equal(phone.visible()[0].name, 'Offline edit (conflict copy)');
  await oldBrowser.sync(); assert.equal(oldBrowser.rows.get(build.id)._deleted, true);
  assert.equal(oldBrowser.visible().length, 1, 'Legacy stale copy must not become another conflict copy after deletion');
});
test('offline deletion cannot discard a newer remote edit', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]), phone = device(remote);
  await pc.sync(); await phone.sync(); phone.remove(build.id); pc.edit(build.id, 'Newer PC edit'); await pc.sync();
  assert.equal((await phone.sync()).conflicts, 1); assert.equal(phone.visible()[0].name, 'Newer PC edit');
});
test('an edit made while upload is in flight stays queued', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]);
  let edited = false;
  const result = await pc.sync({ fetchImpl: async (url: any, init: any) => { const response = await remote.request(url, init); if (init.method === 'POST' && !edited) { edited = true; pc.edit(build.id, 'Edited during upload'); } return response; } });
  assert.equal(result.state, 'pending'); assert.equal(pc.rows.get(build.id)._sync.version, 1);
  await pc.sync(); const phone = device(remote); await phone.sync(); assert.equal(phone.visible()[0].name, 'Edited during upload');
});
test('account changes abort in-flight results and never upload another membership', async () => {
  const remote = server(), build = record(), other = record(); other.binding.membershipId = '99999'; other.build.membershipId = '99999';
  const pc = device(remote, [build, other]), abort = new AbortController();
  await assert.rejects(pc.sync({ signal: abort.signal, fetchImpl: async (url: any, init: any) => { const response = await remote.request(url, init); abort.abort(); return response; } }), /account change/);
  assert.equal(pc.rows.get(build.id)._sync.dirty, true); assert.equal(pc.rows.get(other.id)._sync, undefined);
  await pc.sync(); const phone = device(remote); await phone.sync(); assert.equal(phone.visible().length, 1);
});
test('pagination has no saved-build count cap and large builds are chunked losslessly', async () => {
  const remote = server(), builds = Array.from({ length: 125 }, () => record()); builds[0].build.description = '大型裝備'.repeat(70000);
  const pc = device(remote, builds), phone = device(remote); await pc.sync(); await phone.sync();
  assert.equal(phone.visible().length, 125); assert.equal(phone.rows.get(builds[0].id).build.description, builds[0].build.description);
  const storage = [...remote.stores.values()][0]; assert.ok([...storage.rows.keys()].some(key => key.endsWith(':2')));
});
test('server enforces authentication, membership, origin, CSRF and payload bindings', async () => {
  const remote = server(), build = record(), url = `https://auth.astrixparadox.com/paradox/loadouts?membershipId=90001&membershipType=3&id=${build.id}`;
  const mutation = { baseVersion: 0, mutationId: 'test-op', deleted: false, record: build };
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(mutation) };
  assert.equal((await remote.request(url, {}, null)).status, 401);
  assert.equal((await remote.request(url.replace('90001', '99999'), init)).status, 403);
  assert.equal((await remote.request(url, { ...init, headers: { ...init.headers, Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await remote.request(url, { ...init, headers: { ...init.headers, 'X-CSRF-Token': 'wrong' } })).status, 403);
  build.build.membershipId = '99999'; assert.equal((await remote.request(url, { ...init, body: JSON.stringify(mutation) })).status, 400);
  assert.equal((await remote.request(url, { ...init, body: JSON.stringify({ padding: 'x'.repeat(MAX_LOADOUT_BYTES) }) })).status, 413);
  assert.equal([...remote.stores.values()].every(storage => storage.rows.size === 0), true);
});
test('concurrent conditional writes accept one revision and report the other as a conflict', async () => {
  const remote = server(), build = record(), pc = device(remote, [build]); await pc.sync();
  const url = `https://auth.astrixparadox.com/paradox/loadouts?membershipId=90001&membershipType=3&id=${build.id}`;
  const responses = await Promise.all(['one', 'two'].map(mutationId => remote.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ baseVersion: 1, mutationId, deleted: false, record: build }) })));
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
});
test('real local save and delete persist retry intent atomically with the snapshot', async () => {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) };
  const build = record(), saved = await saveParadoxLoadout(build);
  assert.equal(saved._sync.dirty, true); assert.equal((await listParadoxLoadouts()).length, 1);
  const newer = await saveParadoxLoadout({ ...saved, name: 'Newer tab edit', expectedRevision: saved.revision });
  const staleDraft = await saveParadoxLoadout({ ...saved, name: 'Still open draft', expectedRevision: saved.revision });
  assert.notEqual(staleDraft.id, saved.id); assert.equal(staleDraft.name, 'Still open draft (conflict copy)');
  await assert.rejects(deleteParadoxLoadout(saved.id, saved.revision), /changed on another device/);
  assert.equal((await listParadoxLoadouts()).find(row => row.id === saved.id)?.name, newer.name);
  await deleteParadoxLoadout(staleDraft.id);
  await deleteParadoxLoadout(saved.id); assert.equal((await listParadoxLoadouts()).length, 0);
  const tombstone = JSON.parse([...values.values()][0])[0]; assert.equal(tombstone._deleted, true); assert.equal(tombstone._sync.dirty, true);
  (globalThis as any).localStorage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(saveParadoxLoadout(record()), /could not save/);
  delete (globalThis as any).localStorage;
});
