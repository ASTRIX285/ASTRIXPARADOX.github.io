/*
 * The Aetherium service worker (feature/aetherium-pwa, 26 Nov 2026). Scope /hub/aetherium/ only: it never sees the home
 * page, The Hub, the Destiny pages or the Bungie auth Worker.
 *
 * - The app shell (SHELL below) is stored when the worker installs. The list is written by
 *   astrix-app/tools/build-aetherium-sw.mjs from the Aetherium home and offline pages, with the same ?v= keys the pages
 *   use, and build-module-versions.mjs runs it. The cache names come from a hash of that list, so a deploy that changes
 *   any key installs a new worker with new caches, and the old Aetherium caches are deleted when it takes over.
 * - Pages: network first. After a short wait the stored copy is shown, if there is one; a page never stored waits for
 *   the network, and with no network at all shows the offline page.
 * - Our versioned files (?v=), images and fonts: stored copy first. Other files of ours: network first, stored copy
 *   when offline.
 * - Game data from aetherium-worker (character, search, item, Daevanion): network first. Each answer is stored with
 *   the time the official site was read. Offline, the stored answer comes back marked "stored", so the page labels it
 *   with its age and never as live. With nothing stored, an honest offline answer. The server list is left to the
 *   browser: the page cannot show its age, so the page's own saved list stands in.
 * - Anything else from another site (Typekit, the NCSOFT CDN) is left to the browser and never stored here.
 * - It makes no request of its own to aetherium-worker or to NCSOFT. It only answers the page's own requests.
 * - A new version waits. The page shows "Update ready"; only that tap moves the page to the new version.
 */
'use strict';

// aetherium-shell:start
const SHELL = [
"/astrix-app/games/aion2/data/gear-slots.json",

"/astrix-app/games/aion2/engine/armory-adapter.mjs?v=655d894d8d",

"/astrix-app/games/aion2/engine/ascent-advisor.mjs?v=4838047019",

"/astrix-app/games/aion2/engine/daevanion-planner.mjs?v=009d0b5160",

"/astrix-app/games/aion2/engine/level-planner.mjs?v=acc6f2494f",

"/astrix-app/games/aion2/engine/stat-advisor.mjs?v=17b4c6fdfa",

"/astrix-app/games/aion2/index.mjs?v=bc4e8c21cb",

"/astrix-app/pages/aetherium/aetherium-app.mjs?v=e5f7a44a48",

"/astrix-app/pages/aetherium/aetherium-config.mjs?v=b3f9c96bd7",

"/astrix-app/pages/aetherium/aetherium-data.mjs?v=39bcfad341",

"/astrix-app/pages/aetherium/aetherium-flow.mjs?v=d212e4f454",

"/astrix-app/pages/aetherium/aetherium-guide.mjs?v=abb196f217",

"/astrix-app/pages/aetherium/aetherium-ui.mjs?v=7d775319a1",

"/astrix-app/pages/aetherium/aetherium.css?v=20261126-pwa-1",

"/astrix-app/pages/aetherium/daeva-card.mjs?v=b7d6a16e27",

"/astrix-app/pages/aetherium/daevanion-board.mjs?v=589e8f42ad",

"/astrix-app/shared/astrix-tool-shell.css?v=20260930-stroke-4&shell=20261001-mobile-1&mobile=20261002-1&bf=20261002-1&inv=20261002-1&swr=20261002-1&formation=20261003-1&neutral=20261016-1&capsule=20261016-1&phone=20261127-1",

"/astrix-app/tools/fixtures/aion2/eu/servers.json",

"/css/astrix-palette.css?v=20260923-button-tiers-1&gloss=20260926-1&recovery=20261004-1&neutral=20261016-1&forge-tint=20261016-1",

"/css/astrix-site-typography.css?v=20260903-bahnschrift-1",

"/fonts/barlow-500.woff2",

"/fonts/barlow-semi-condensed-600.woff2",

"/fonts/barlow-semi-condensed-700.woff2",

"/fonts/michroma-400.woff2",

"/hub/aetherium/",

"/hub/aetherium/aetherium.webmanifest",

"/hub/aetherium/icons/apple-touch-icon.png",

"/hub/aetherium/icons/icon-192.png",

"/hub/aetherium/icons/icon-512.png",

"/hub/aetherium/icons/maskable-192.png",

"/hub/aetherium/icons/maskable-512.png",

"/hub/aetherium/offline/",

"/img/ax-logo-160.webp",

"/img/favicon/favicon-16x16.png",

"/img/favicon/favicon-32x32.png",

"/img/favicon/favicon.ico"
];
// aetherium-shell:end

const SCOPE = '/hub/aetherium/';
const OFFLINE_PAGE = '/hub/aetherium/offline/';
const WORKER_ORIGIN = 'https://aetherium-worker.astrix285.workers.dev';
const DATA_PATHS = ['/aion2/character', '/aion2/search', '/aion2/item', '/aion2/daevanion'];
const PAGE_WAIT_MS = 3000;
const DATA_KEEP = 60;

function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 0x01000193) >>> 0; }
  return value.toString(36);
}
const VERSION = hash(SHELL.join('\n'));
const SHELL_CACHE = `aetherium-shell-${VERSION}`;
const RUNTIME_CACHE = `aetherium-runtime-${VERSION}`;
const DATA_CACHE = 'aetherium-data-v1';
const OWN_CACHE = /^aetherium-(shell|runtime)-/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: url.includes('?v=') ? 'default' : 'no-cache' });
        if (response.ok && response.type === 'basic') await cache.put(url, response);
      } catch { /* one missing file never stops the rest */ }
    }));
    if (!(await cache.match(OFFLINE_PAGE))) throw new Error('The offline page could not be stored');
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => OWN_CACHE.test(name) && name !== SHELL_CACHE && name !== RUNTIME_CACHE).map(name => caches.delete(name)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'aetherium:update') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin && url.pathname.startsWith(SCOPE)) event.respondWith(page(event, url));
    return;
  }
  if (url.origin === WORKER_ORIGIN) {
    if (DATA_PATHS.includes(url.pathname)) event.respondWith(gameData(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(ownFile(request, url));
});

const pageKey = url => `${url.origin}${url.pathname}`;
const keepable = response => response && response.ok && response.type === 'basic';

async function page(event, url) {
  const key = pageKey(url);
  const network = (async () => {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (keepable(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.put(key, copy)));
    }
    return response;
  })();
  const stored = () => caches.match(key);
  const waited = new Promise(done => setTimeout(done, PAGE_WAIT_MS, 'waited'));
  try {
    const first = await Promise.race([network, waited]);
    if (first !== 'waited') return first;
    const copy = await stored();
    if (copy) { event.waitUntil(network.catch(() => null)); return copy; }
    return await network;
  } catch {
    return (await stored()) || (await caches.match(OFFLINE_PAGE)) || new Response("You're offline.", { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

const firstFromCache = url => url.searchParams.has('v') || /\.(?:webp|png|jpe?g|svg|ico|woff2?)$/i.test(url.pathname);

async function ownFile(request, url) {
  if (firstFromCache(url)) {
    const copy = await caches.match(request);
    if (copy) return copy;
    const response = await fetch(request);
    if (keepable(response)) { const clone = response.clone(); caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone)); }
    return response;
  }
  try {
    const response = await fetch(request);
    if (keepable(response)) { const clone = response.clone(); caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone)); }
    return response;
  } catch (error) {
    const copy = await caches.match(request, { ignoreVary: true });
    if (copy) return copy;
    throw error;
  }
}

const jsonResponse = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

async function gameData(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'cors') keepData(request.url, response.clone());
    return response;
  } catch {
    const cache = await caches.open(DATA_CACHE);
    const copy = await cache.match(request.url);
    if (copy) {
      const body = await copy.json();
      return jsonResponse({ ...body, meta: { ...body.meta, cache: 'stored' } }, 200, { 'X-Aetherium-Stored': '1' });
    }
    return jsonResponse({ error: 'offline' }, 503, { 'X-Aetherium-Offline': '1' });
  }
}

/** Stores a Worker answer only when it says when the official site was read, so a stored answer can always show its age. */
async function keepData(url, response) {
  try {
    const body = await response.json();
    if (!Number.isFinite(Date.parse(body?.meta?.fetchedAt))) return;
    const cache = await caches.open(DATA_CACHE);
    await cache.delete(url);
    await cache.put(url, jsonResponse(body, 200));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - DATA_KEEP)).map(key => cache.delete(key)));
  } catch { /* not JSON or storage full: nothing stored */ }
}
