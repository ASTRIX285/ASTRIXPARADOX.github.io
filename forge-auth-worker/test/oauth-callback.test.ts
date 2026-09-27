import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { OAUTH_TTL_MS, oauthIntro } from '../src/oauth-ui.ts';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }') };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
}});
const { AuthRecord, default: worker } = await import('../src/semantic-wrapper.ts');
const origin = 'https://auth.astrixparadox.com';
const returnUrl = 'https://astrixparadox.com/astrix-app/pages/vault/';
const recovery = 'https://astrixparadox.com/astrix-app/pages/sign-in/';
const page = readFileSync(new URL('../../astrix-app/pages/sign-in/index.html', import.meta.url), 'utf8');

function fixture() {
  const objects = new Map<string, { rows: Map<string, any>; record: InstanceType<typeof AuthRecord>; alarm: number }>();
  let failure = '';
  const env: any = { BUNGIE_CLIENT_ID: 'synthetic-client', BUNGIE_CLIENT_SECRET: 'synthetic-secret', BUNGIE_API_KEY: 'synthetic-key',
    APP_ORIGINS: 'https://astrixparadox.com,https://sandbox.astrixparadox.com', DEFAULT_RETURN_URL: 'https://astrixparadox.com/astrix-app/pages/journey/',
    OAUTH_REDIRECT_URI: origin + '/bungie/callback' };
  const object = (name: string) => {
    if (!objects.has(name)) {
      const rows = new Map<string, any>();
      const item: any = { rows, alarm: 0 };
      const storage = { get: async (key: string) => structuredClone(rows.get(key)),
        put: async (key: string, value: unknown) => { rows.set(key, structuredClone(value)); },
        delete: async (key: string) => rows.delete(key), deleteAll: async () => rows.clear(),
        setAlarm: async (value: number) => { item.alarm = value; }, deleteAlarm: async () => { item.alarm = 0; } };
      item.record = new AuthRecord({ storage, waitUntil() {}, id: { toString: () => name } } as any, env);
      objects.set(name, item);
    }
    return objects.get(name)!;
  };
  env.AUTH_RECORDS = { idFromName: (name: string) => name, get: (name: string) => ({ fetch: (input: any, init: any) => {
    const req = new Request(input, init);
    if ((failure === 'take' && req.url.endsWith('/take-oauth')) || (failure === 'session' && name.startsWith('session:') && req.method === 'PUT') ||
        (failure === 'binding' && name.startsWith('access:')) || (failure === 'complete' && req.url.endsWith('/complete-oauth'))) throw new Error('synthetic-storage-failure');
    return object(name).record.fetch(req);
  } }) };
  const request = (path: string, cookie = '') => worker.fetch(new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} }), env, {} as any);
  const start = async () => {
    const response = await request('/bungie/start?continue=1&return=' + encodeURIComponent(returnUrl));
    const state = new URL(response.headers.get('location')!).searchParams.get('state')!;
    assert.ok(state);
    return { state, tx: object('oauth:' + state).rows.get('record') };
  };
  return { env, objects, object, request, start, fail: (value: string) => { failure = value; } };
}
async function friendly(response: Response) {
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.origin + target.pathname, recovery);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.has('content-disposition'), false);
  assert.doesNotMatch(response.headers.get('content-type') || '', /json/);
  assert.equal(await response.text(), '');
  assert.doesNotMatch(target.href, /synthetic-code|synthetic-secret|access_denied|error_description/);
  // Follow the redirect to the actual static file shipped with this PR.
  assert.match(page, /Your sign-in timed out\. Tap to sign in again/);
  assert.match(page, /<form action="https:\/\/auth\.astrixparadox\.com\/bungie\/start" method="get">/);
  assert.match(page, /<button type="submit">Sign in again<\/button>/);
  assert.doesNotMatch(page, /name="(?:state|code)"|download=/);
}
function successFetch(url: any) {
  return Promise.resolve(String(url).includes('/oauth/token/')
    ? Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, refresh_expires_in: 86400 })
    : Response.json({ ErrorCode: 1, Response: { destinyMemberships: [] } }));
}

for (const query of ['', '?code=synthetic-code', '?state=unknown', '?error=access_denied&error_description=private', '?code=synthetic-code&state=unknown']) {
  test('callback navigation recovers: ' + query, async t => {
    const f = fixture();
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not contact Bungie'); });
    await friendly(await f.request('/bungie/callback' + query));
  });
}
for (const age of [30 * 60000, 47 * 60000, -60000, NaN]) {
  test(`state age ${age} does not exchange or leak JSON`, async t => {
    const f = fixture(); const { state, tx } = await f.start(); tx.createdAt = Date.now() - age;
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not exchange'); });
    await friendly(await f.request(`/bungie/callback?code=synthetic-code&state=${state}`));
  });
}
test('29-minute login succeeds; state storage lasts past 30 minutes', async t => {
  assert.equal(OAUTH_TTL_MS, 30 * 60000);
  const f = fixture(); const { state, tx } = await f.start();
  assert.ok(f.object('oauth:' + state).alarm >= tx.createdAt + 35 * 60000);
  tx.createdAt = Date.now() - 29 * 60000;
  t.mock.method(globalThis, 'fetch', successFetch);
  const response = await f.request(`/bungie/callback?code=synthetic-code&state=${state}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), returnUrl + '?bungie=connected');
  assert.match(response.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=None/);
});
for (const failure of ['take', 'session', 'binding', 'complete', 'token-http', 'token-json', 'token-shape', 'network', 'memberships-http', 'memberships-json', 'memberships-envelope']) {
  test(`${failure} callback failure lands on friendly screen`, async t => {
    const f = fixture(); const { state, tx } = await f.start();
    if (failure === 'binding') tx.accessIdentityKey = 'a'.repeat(64);
    f.fail(failure);
    t.mock.method(globalThis, 'fetch', async (url: any) => {
      const token = String(url).includes('/oauth/token/');
      if (failure === 'network') throw new Error('synthetic-secret');
      if (failure === (token ? 'token-http' : 'memberships-http')) return new Response('synthetic-secret', { status: 500 });
      if (failure === (token ? 'token-json' : 'memberships-json')) return new Response('{');
      if (failure === 'token-shape' && token) return Response.json({});
      if (failure === 'memberships-envelope' && !token) return Response.json({ ErrorCode: 5 });
      return successFetch(url);
    });
    await friendly(await f.request(`/bungie/callback?code=synthetic-code&state=${state}`));
  });
}
test('used state resumes only its live session without another exchange', async t => {
  const f = fixture(); const { state } = await f.start();
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', (url: any) => { if (String(url).includes('/oauth/token/')) exchanges++; return successFetch(url); });
  const path = `/bungie/callback?code=synthetic-code&state=${state}&return=https://evil.example/`;
  const first = await f.request(path);
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  const replay = await f.request(path, cookie);
  assert.equal(replay.headers.get('location'), returnUrl);
  assert.equal(replay.status, 302);
  assert.equal(await replay.text(), '');
  assert.equal(exchanges, 1);
  await friendly(await f.request(path));
  await friendly(await f.request(path, 'astrix_session=%ZZ'));
  const sessionId = cookie.split('=')[1];
  f.object('session:other').rows.set('record', structuredClone(f.object('session:' + sessionId).rows.get('record')));
  await friendly(await f.request(path, 'astrix_session=other'));
  f.object('session:' + sessionId).rows.get('record').absoluteExpiresAt = Date.now() - 1;
  await friendly(await f.request(path, cookie));
  assert.equal(exchanges, 1);
});
test('used incomplete or mismatched state cannot create a session', async t => {
  const f = fixture(); const { state, tx } = await f.start(); tx.used = true;
  const fetcher = t.mock.method(globalThis, 'fetch', successFetch);
  await friendly(await f.request(`/bungie/callback?code=synthetic-code&state=${state}`));
  tx.used = false; tx.state = 'wrong';
  await friendly(await f.request(`/bungie/callback?code=synthetic-code&state=${state}`));
  assert.equal(fetcher.mock.callCount(), 0);
});
test('concurrent callbacks consume a code once', async t => {
  const f = fixture(); const { state } = await f.start();
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', (url: any) => { if (String(url).includes('/oauth/token/')) exchanges++; return successFetch(url); });
  const responses = await Promise.all(Array.from({ length: 3 }, () => f.request(`/bungie/callback?code=synthetic-code&state=${state}`)));
  assert.equal(exchanges, 1);
  assert.equal(responses.filter(r => r.headers.has('set-cookie')).length, 1);
  for (const response of responses.filter(r => !r.headers.has('set-cookie'))) await friendly(response);
});
test('intro appears once, Continue creates fresh state, later visits skip intro', async () => {
  const f = fixture();
  const intro = await f.request('/bungie/start?return=' + encodeURIComponent(returnUrl));
  assert.equal(intro.status, 200);
  assert.match(intro.headers.get('content-type')!, /text\/html/);
  const html = await intro.text();
  assert.match(html, /You'll sign in through Bungie\. The first time, Bungie asks which platform you play on, then it remembers you\./);
  const href = html.match(/<a class="sign-in-continue" href="([^"]+)">Continue<\/a>/)?.[1].replaceAll('&amp;', '&');
  assert.ok(href);
  assert.doesNotMatch(html, /<form|<script|onclick=/);
  assert.match(intro.headers.get('content-security-policy')!, /form-action 'self'/);
  assert.equal(f.objects.size, 0, 'state TTL starts after Continue');
  const started = await f.request(href);
  assert.equal(started.status, 302);
  const destination = new URL(started.headers.get('location')!);
  assert.equal(destination.origin, 'https://www.bungie.net');
  assert.equal(f.object('oauth:' + destination.searchParams.get('state')).rows.get('record').returnUrl, returnUrl);
  assert.match(started.headers.get('set-cookie')!, /astrix_oauth_intro=1;.*HttpOnly; Secure; SameSite=Lax/);
  const later = await f.request('/bungie/start', 'astrix_oauth_intro=1');
  assert.equal(new URL(later.headers.get('location')!).origin, 'https://www.bungie.net');
  assert.notEqual(new URL(later.headers.get('location')!).searchParams.get('state'), new URL(started.headers.get('location')!).searchParams.get('state'));
});
test('intro escapes markup, rejects outside return URLs, and handles configuration/storage failures', async () => {
  const f = fixture();
  const intro = await f.request('/bungie/start?return=' + encodeURIComponent(returnUrl + '?x="<test>'));
  assert.doesNotMatch(await intro.text(), /<test>/);
  const { state } = await f.start();
  assert.ok(state);
  const outside = await f.request('/bungie/start?continue=1&return=https://evil.example/');
  const outsideState = new URL(outside.headers.get('location')!).searchParams.get('state');
  assert.equal(f.object('oauth:' + outsideState).rows.get('record').returnUrl, f.env.DEFAULT_RETURN_URL);
  f.env.BUNGIE_CLIENT_ID = '';
  await friendly(await f.request('/bungie/start'));
});
test('internal access intro uses bridge URL without leaking the access identity', async () => {
  const f = fixture();
  const request = new Request('https://forge-auth.internal/internal/access/start?identity=' + 'a'.repeat(64));
  const response = await worker.fetch(request, f.env, {} as any);
  const html = await response.text();
  assert.match(html, /href="\/__astrix\/bungie\/start\?return=/);
  assert.doesNotMatch(html, /identity=|aaaaaaaa/);
});
for (const internal of [false, true]) {
  test(`Continue is a script-free navigation with encoded parameters (bridge=${internal})`, async () => {
    const target = returnUrl + '?x="<test>&continue=0#fragment';
    const html = await oauthIntro(target, internal).text();
    const href = html.match(/<a class="sign-in-continue" href="([^"]+)">Continue<\/a>/)?.[1];
    assert.ok(href);
    const link = new URL(href.replaceAll('&amp;', '&'), origin);
    assert.equal(link.origin, origin);
    assert.equal(link.pathname, internal ? '/__astrix/bungie/start' : '/bungie/start');
    assert.equal(link.searchParams.get('return'), target);
    assert.deepEqual(link.searchParams.getAll('continue'), ['1']);
    assert.doesNotMatch(html, /<form|<button|<script|onclick=|<test>/);
  });
}
test('recovery page preserves return via an input value, never injects markup or reuses code', () => {
  const input = { value: '' };
  const source = readFileSync(new URL('../../astrix-app/pages/sign-in/sign-in.mjs', import.meta.url), 'utf8');
  runInNewContext(source, { URL, location: { href: recovery + '?return=' + encodeURIComponent(returnUrl) + '&code=old&state=old' }, document: { getElementById: () => input } });
  assert.equal(input.value, returnUrl);
});
