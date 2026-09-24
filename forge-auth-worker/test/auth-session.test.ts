import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { refreshFailure } from '../src/refresh-failure.ts';

// Execute production Worker and Durable Object handlers with only the platform/storage mocked.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }') };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
}});
const { AuthRecord, default: worker } = await import('../src/index.ts');

function fixture() {
  const now = Date.now();
  const original = { kind: 'session', createdAt: now, lastUsedAt: now, absoluteExpiresAt: now + 86400000,
    accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', accessExpiresAt: now - 1,
    refreshExpiresAt: now + 86400000, bungieMembershipId: '123', destinyMemberships: [], primaryMembershipId: null,
    activeDestinyMembership: null, csrfToken: 'synthetic-csrf' };
  const rows = new Map<string, any>([['record', structuredClone(original)]]);
  let alarmAt = 0;
  const storage = { get: async (key: string) => structuredClone(rows.get(key)),
    put: async (key: string, value: unknown) => { rows.set(key, structuredClone(value)); },
    delete: async (key: string) => rows.delete(key), deleteAll: async () => rows.clear(),
    setAlarm: async (value: number) => { alarmAt = value; }, deleteAlarm: async () => { alarmAt = 0; } };
  const env: any = { BUNGIE_CLIENT_ID: 'test-client', BUNGIE_CLIENT_SECRET: 'test-secret', APP_ORIGINS: 'https://astrixparadox.com' };
  const record = new AuthRecord({ storage, id: { toString: () => 'synthetic-session-id' }, waitUntil() {} } as any, env);
  env.AUTH_RECORDS = { idFromName: (name: string) => name, get: () => ({ fetch: (input: any, init: any) => record.fetch(new Request(input, init)) }) };
  const session = () => worker.fetch(new Request('https://auth.astrixparadox.com/session', { headers: { Cookie: 'astrix_session=synthetic-id', Origin: 'https://astrixparadox.com' } }), env, {} as any);
  return { original, rows, record, session, alarmAt: () => alarmAt };
}
const rotation = () => Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, refresh_expires_in: 7776000 });

test('five parallel /session requests and an alarm share exactly one rotation; public replies contain no tokens', async t => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const logs: unknown[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: any) => { calls.push(init.body.get('refresh_token')); await gate; return rotation(); });
  const requests = Array.from({ length: 5 }, () => f.session());
  const alarm = f.record.alarm();
  await new Promise(resolve => setImmediate(resolve));
  release();
  const responses = await Promise.all(requests);
  await alarm;
  assert.deepEqual(calls, ['synthetic-refresh']);
  for (const response of responses) {
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.authenticated, true);
    assert.equal('accessToken' in body || 'refreshToken' in body, false);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=None; Max-Age=34560000/);
  }
  assert.equal(f.rows.get('record').refreshToken, 'rotated-refresh');
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-refresh|rotated-refresh|rotated-access|test-secret|synthetic-session-id/);
  assert.equal((logs[0] as any)[1].sessionHash.length, 64);
  const another = await f.session();
  assert.equal(another.status, 200);
  assert.equal(calls.length, 1, 'valid stored access token must not refresh');
});

test('stale renewal and profile writes cannot replace rotated credentials or shorten lifetime', async t => {
  const f = fixture();
  t.mock.method(console, 'info', () => {});
  t.mock.method(globalThis, 'fetch', async () => rotation());
  await f.session();
  const lifetime = f.rows.get('record').absoluteExpiresAt;
  for (const path of ['/renew', '/metadata']) {
    const response = await f.record.fetch(new Request('https://internal' + path, { method: 'POST', body: JSON.stringify(f.original) }));
    assert.equal(response.status, 200);
    assert.equal(f.rows.get('record').refreshToken, 'rotated-refresh');
    assert.equal(f.rows.get('record').absoluteExpiresAt, lifetime);
  }
});

for (const [name, upstream] of [
  ['500', () => Response.json({ error: 'server_error' }, { status: 500 })],
  ['network', () => { throw new TypeError('offline'); }],
  ['maintenance', () => Response.json({ error: 'server_error', error_description: 'SystemDisabled' }, { status: 400 })],
  ['429', () => Response.json({ error: 'invalid_grant' }, { status: 429 })],
  ['other 400', () => Response.json({ error: 'invalid_client' }, { status: 400 })],
  ['unparseable 401', () => new Response('unparseable', { status: 401 })],
  ['bad success', () => Response.json({ expires_in: 3600 })],
] as const) {
  test(`${name} preserves cookie/session, returns unknown and alarm reschedules`, async t => {
    const f = fixture();
    t.mock.method(console, 'info', () => {});
    t.mock.method(globalThis, 'fetch', upstream);
    const response = await f.session();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { authenticated: 'unknown', error: 'bungie_unavailable' });
    assert.equal(response.headers.has('set-cookie'), false);
    assert.deepEqual(f.rows.get('record'), f.original);
    await f.record.alarm();
    assert.deepEqual(f.rows.get('record'), f.original);
    assert.ok(f.alarmAt() > Date.now() + 14 * 60 * 1000);
  });
}

const codes = { AuthorizationCodeInvalid: 2106, ProvidedTokenNotValidRefreshToken: 2117, RefreshTokenExpired: 2118,
  AuthorizationRecordInvalid: 2119, TokenPreviouslyRevoked: 2120, AuthorizationCodeStale: 2122,
  AuthorizationRecordExpired: 2123, AuthorizationRecordRevoked: 2124 };
for (const [name, code] of Object.entries(codes)) {
  test(`confirmed ${name} revokes, numeric and named representations agree`, async t => {
    assert.equal(refreshFailure(400, { ErrorCode: code }).revoke, true);
    assert.equal(refreshFailure(400, { ErrorStatus: name }).revoke, true);
    assert.equal(refreshFailure(400, { error: 'server_error', error_description: name }).revoke, true);
    const f = fixture();
    t.mock.method(console, 'info', () => {});
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ErrorCode: code }, { status: 400 }));
    const response = await f.session();
    assert.equal(response.status, 401);
    assert.equal((await response.json() as any).authenticated, false);
    assert.equal(f.rows.has('record'), false);
    assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  });
}
test('invalid_grant revokes; temporary and access-token-only codes do not', async t => {
  for (const body of [{ ErrorCode: 2110 }, { ErrorCode: 2111 }, { error: 'invalid_client' }, { error: 'server_error' }, null]) {
    assert.equal(refreshFailure(400, body).revoke, false);
  }
  assert.equal(refreshFailure(500, { error: 'invalid_grant' }).revoke, false);
  const f = fixture();
  t.mock.method(console, 'info', () => {});
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  await f.record.alarm();
  assert.equal(f.rows.has('record'), false);
  assert.equal(f.alarmAt(), 0);
});

test('a renewal arriving during rotation is serialized and merges only timestamps', async t => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(console, 'info', () => {});
  t.mock.method(globalThis, 'fetch', async () => { await gate; return rotation(); });
  const refresh = f.record.fetch(new Request('https://internal/refresh', { method: 'POST' }));
  await new Promise(resolve => setImmediate(resolve));
  const renewal = f.record.fetch(new Request('https://internal/renew', { method: 'POST', body: JSON.stringify({ ...f.original, lastUsedAt: Date.now() + 100, absoluteExpiresAt: Date.now() + 2 * 86400000 }) }));
  release();
  const [a, b] = await Promise.all([refresh, renewal]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(f.rows.get('record').refreshToken, 'rotated-refresh');
  assert.ok(f.rows.get('record').absoluteExpiresAt > f.original.absoluteExpiresAt);
});

test('alarm invalidation removes credentials, preserves other saved records, and does not retry invalid grants', async t => {
  const f = fixture();
  f.rows.set('saved-account-data', { untouched: true });
  t.mock.method(console, 'info', () => {});
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  await f.record.alarm();
  assert.equal(f.rows.has('record'), false);
  assert.deepEqual(f.rows.get('saved-account-data'), { untouched: true });
  assert.equal(f.alarmAt(), 0);
});

test('the unchanged absolute session lifetime ends background refresh without deleting saved data', async t => {
  const f = fixture();
  f.rows.get('record').absoluteExpiresAt = Date.now() - 1;
  f.rows.set('saved-account-data', { untouched: true });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return rotation(); });
  await f.record.alarm();
  assert.equal(calls, 0);
  assert.equal(f.rows.has('record'), false);
  assert.deepEqual(f.rows.get('saved-account-data'), { untouched: true });
});
