/**
 * The Aetherium data layer. Reads the official AION 2 site through aetherium-worker and turns every
 * response into the character model through games/aion2 (armory-adapter.mjs). Pages never read the raw JSON.
 * There is no stand-in character: a read that fails throws ArmoryUnavailable and the page says so.
 */
import { createAion2Module } from '/astrix-app/games/aion2/index.mjs';
import { adaptDaevanionBoard, adaptItemDetail, adaptSearch } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';
import {
  AETHERIUM_ART_HOST,
  AETHERIUM_EU_SERVERS,
  AETHERIUM_INTRO_ART,
  AETHERIUM_REGION,
  AETHERIUM_REGIONS,
  AETHERIUM_REGION_KEY,
  AETHERIUM_REGION_SHORT,
  AETHERIUM_ROSTER_KEY,
  AETHERIUM_ROSTER_KEY_V1,
  AETHERIUM_ROSTER_SLOTS,
  AETHERIUM_WORKER_URL
} from './aetherium-config.mjs';

const TIMEOUT_MS = 8000;

/**
 * A read that did not work. reason says why, so the page blames the right party:
 *   'site'  the official site did not answer (Worker error armory_unavailable, a timeout, no network);
 *   'rate'  the Worker said too many searches (429);
 *   'other' the Worker refused the call or broke (400, 403, 404, 500 ...): our side.
 */
export class ArmoryUnavailable extends Error {
  constructor(message = 'The official AION 2 site is not answering right now.', reason = 'site') {
    super(message);
    this.name = 'ArmoryUnavailable';
    this.reason = reason;
  }
}

const reasonOfStatus = status => (status === 429 ? 'rate' : status === 502 || status === 503 || status === 504 ? 'site' : 'other');

/** The words for a failed read. Only a real "site did not answer" blames the official site; siteText is that case's own sentence. */
export function explain(error, siteText = SITE_NOT_ANSWERING) {
  if (error?.reason === 'rate') return 'Too many searches in a minute. Try again shortly.';
  if (error?.reason === 'other') return 'Something went wrong on our side. Try again in a minute.';
  return siteText;
}
/** The plain sentence for a read the official site did not answer. */
export const SITE_NOT_ANSWERING = 'The official AION 2 site is not answering right now. Try again in a minute.';

export const armoryLive = () => typeof AETHERIUM_WORKER_URL === 'string' && AETHERIUM_WORKER_URL.startsWith('https://');
/** Thrown before any call when no Worker is configured: our side, never the official site. */
const notConnected = () => new ArmoryUnavailable('Live character data is not connected.', 'other');

async function getJson(url, { timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new ArmoryUnavailable(`The official AION 2 site answered ${response.status}.`, reasonOfStatus(response.status));
    return await response.json();
  } catch (error) {
    throw error instanceof ArmoryUnavailable ? error : new ArmoryUnavailable(error?.message);
  } finally {
    clearTimeout(timer);
  }
}

/* Regions. Only the five official codes are used anywhere; anything else is Europe. */
export const regions = AETHERIUM_REGIONS;
export const isRegion = code => AETHERIUM_REGIONS.some(item => item.code === code);
export const regionOf = code => (isRegion(code) ? code : AETHERIUM_REGION);
export const regionName = code => AETHERIUM_REGIONS.find(item => item.code === regionOf(code)).name;
/** The short label for roster cards and the roster heading (NA West, NA East, EU, SA, Asia). */
export const regionShort = code => AETHERIUM_REGION_SHORT[regionOf(code)];

/** The region last used on this device, else Europe. */
export function lastRegion() {
  try { return regionOf(localStorage.getItem(AETHERIUM_REGION_KEY)); } catch { return AETHERIUM_REGION; }
}
export function rememberRegion(code) {
  try { localStorage.setItem(AETHERIUM_REGION_KEY, regionOf(code)); } catch { /* private mode: not remembered */ }
}

function worker(path, params, region) {
  const query = new URLSearchParams({ ...params, region: regionOf(region) });
  return getJson(`${AETHERIUM_WORKER_URL}${path}?${query}`);
}

const liveSource = meta => ({ kind: 'live', fetchedAt: meta?.fetchedAt ?? null, cache: meta?.cache ?? null });

let catalogue;
export function loadCatalogue() {
  catalogue ??= Promise.all([
    getJson('/astrix-app/games/aion2/data/gear-slots.json'),
    getJson(AETHERIUM_EU_SERVERS)
  ]).then(([slots, servers]) => ({
    slots: slots.records,
    servers: servers.serverList,
    module: createAion2Module({ slots: slots.records })
  }));
  return catalogue;
}

/** Character search. Returns { rows, source }. Throws ArmoryUnavailable when the site or the Worker did not answer. */
export async function searchCharacters(name, region = AETHERIUM_REGION) {
  if (!armoryLive()) throw notConnected();
  const body = await worker('/aion2/search', { name }, region);
  return { rows: adaptSearch(body), source: liveSource(body.meta) };
}

/**
 * The servers of one region, as [{ raceId, serverId, serverName }]. Europe is a small static list (first paint
 * needs no call); the other regions come through the Worker. A failure gives an empty list: the search still works.
 */
export async function loadServers(region = AETHERIUM_REGION) {
  const code = regionOf(region);
  if (code === 'eu' || !armoryLive()) return code === 'eu' ? (await loadCatalogue()).servers : [];
  try {
    const body = await worker('/aion2/servers', {}, code);
    return Array.isArray(body.serverList) ? body.serverList : [];
  } catch { return []; }
}

/**
 * The character model for one Daeva. Returns { model, source }. ref = { serverId, characterId, region }.
 * First paint needs only this: one /aion2/character call, in parallel with the small slot list.
 * Item detail and Daevanion boards load later, when the player opens them.
 * A read that fails throws ArmoryUnavailable; there is no stand-in character.
 */
export async function loadCharacter(ref) {
  if (!ref) throw new TypeError('loadCharacter needs a Daeva: { serverId, characterId, region }');
  if (!armoryLive()) throw notConnected();
  const region = regionOf(ref.region);
  const [{ module }, body] = await Promise.all([
    loadCatalogue(),
    worker('/aion2/character', { serverId: ref.serverId, characterId: ref.characterId }, region)
  ]);
  const capturedOn = (body.meta?.fetchedAt ?? new Date().toISOString()).slice(0, 10);
  const model = module.normaliseCharacter(body, { region, capturedOn });
  const source = liveSource(body.meta);
  roster.refresh(model, source); // a live read keeps this Daeva's saved card up to date
  return { model, source };
}

/* Item details are kept for the browser session (sessionStorage), keyed by Daeva, item, enchant level and slot, so moving
   between pages never reads the same item twice. The same item at a new enchant level is a new key. Storage can be off
   (private mode, blocked site data): then every read simply goes to the Worker. */
const ITEM_CACHE_KEY = 'aetherium.items.v1';
const itemCacheKey = (model, slot) => [model.source.region, model.profile.server.id, model.profile.characterId, slot.itemId, slot.enchant, slot.slotPos].join('|');
function readItemCache() {
  try { return JSON.parse(sessionStorage.getItem(ITEM_CACHE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function writeItemCache(key, body) {
  try { sessionStorage.setItem(ITEM_CACHE_KEY, JSON.stringify({ ...readItemCache(), [key]: body })); } catch { /* storage off or full: the next visit reads it again */ }
}
/** True when this item's detail is already kept for the session (no Worker call needed). */
export const itemDetailKept = (model, slot) => !slot.empty && Object.hasOwn(readItemCache(), itemCacheKey(model, slot));

/** The item detail card for one worn item. Returns { detail, source } or { detail: null, reason }. */
export async function loadItemDetail(model, slot) {
  if (slot.empty) return { detail: null, reason: 'Nothing is worn in this slot.' };
  const key = itemCacheKey(model, slot);
  const kept = readItemCache()[key];
  if (kept) return { detail: adaptItemDetail(kept), source: liveSource(kept.meta) };
  const body = await worker('/aion2/item', {
    serverId: model.profile.server.id,
    characterId: model.profile.characterId,
    id: slot.itemId,
    enchantLevel: slot.enchant,
    slotPos: slot.slotPos
  }, model.source.region);
  writeItemCache(key, body);
  return { detail: adaptItemDetail(body), source: liveSource(body.meta) };
}

/** At most this many item detail calls run at once. */
export const ITEM_DETAIL_CONCURRENCY = 3;
/** Item detail calls one Gear page visit makes in the background; with the character call that is 20. The rest load on hover or tap. */
export const ITEM_DETAIL_BUDGET = 19;

/**
 * Loads worn items' details in the background, at most ITEM_DETAIL_CONCURRENCY at a time and at most budget Worker calls
 * (details already kept for the session cost none). onDetail(slot, result) runs as each lands; a failed read is skipped.
 * Returns the slots left for later (over the budget).
 */
export async function preloadItemDetails(model, slots, { onDetail, budget = ITEM_DETAIL_BUDGET } = {}) {
  const worn = slots.filter(slot => !slot.empty);
  const queue = [];
  const later = [];
  let calls = 0;
  for (const slot of worn) {
    if (itemDetailKept(model, slot)) queue.push(slot);
    else if (calls < budget) { calls += 1; queue.push(slot); }
    else later.push(slot);
  }
  const run = async () => {
    while (queue.length) {
      const slot = queue.shift();
      try { onDetail?.(slot, await loadItemDetail(model, slot)); } catch { /* the tile keeps what the character call gave it */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(ITEM_DETAIL_CONCURRENCY, queue.length) }, run));
  return later;
}

/* Board grids are kept for the browser session (sessionStorage), keyed by Daeva, board and its taken count, so moving
   between the Daeva Card, the plan and the Daevanion screen never reads a board twice; a node taken since is a new key. */
const BOARD_CACHE_KEY = 'aetherium.boards.v1';
const boardCacheKey = (model, board) => [model.source.region, model.profile.server.id, model.profile.characterId, board.id, board.nodesTaken ?? ''].join('|');
function readBoardCache() {
  try { return JSON.parse(sessionStorage.getItem(BOARD_CACHE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

/** The node grid of one Daevanion board, loaded when the player opens it (kept for the session). Returns { nodes }. */
export async function loadBoard(model, board) {
  const key = boardCacheKey(model, board);
  const kept = readBoardCache()[key];
  if (kept) return { nodes: adaptDaevanionBoard(kept) };
  const body = await worker('/aion2/daevanion', { serverId: model.profile.server.id, characterId: model.profile.characterId, boardId: board.id }, model.source.region);
  try { sessionStorage.setItem(BOARD_CACHE_KEY, JSON.stringify({ ...readBoardCache(), [key]: body })); } catch { /* storage off or full: read again next time */ }
  return { nodes: adaptDaevanionBoard(body) };
}

/* The intro art: official class renders and the NPC guide, hotlinked from the NCSOFT CDN. The data file carries
   each image's provenance (sources stay in the data, never on the page). An entry with no URL, or a URL on any
   other host, is left out, so the page shows no art rather than the wrong art. Loaded after the page is usable. */
const artUrlOk = url => typeof url === 'string' && url.startsWith(AETHERIUM_ART_HOST);
/** A filled art entry ({ url, alt, ... } on the CDN) as { url, alt, width, height }; a pending or foreign one is null. */
const artEntry = entry => (entry && !entry.pending && artUrlOk(entry.url)
  ? { url: entry.url, alt: typeof entry.alt === 'string' ? entry.alt : '', width: entry.width ?? null, height: entry.height ?? null }
  : null);
let introArt;
/** { classes: Map<slug, entry>, npc: entry | null, keyArt: entry | null }. Never throws: a missing file means no art. */
export function loadIntroArt() {
  introArt ??= getJson(AETHERIUM_INTRO_ART).then(data => {
    const art = data?.records?.find(record => record.id === 'intro-art') ?? {};
    const classes = new Map();
    for (const item of Array.isArray(art.classes) ? art.classes : []) {
      const entry = artEntry(item?.art);
      if (entry && typeof item.class === 'string') classes.set(item.class.toLowerCase(), entry);
    }
    return { classes, npc: artEntry(art.npc), keyArt: artEntry(art.keyArt) };
  }).catch(() => ({ classes: new Map(), npc: null, keyArt: null }));
  return introArt;
}

/* The faction is keyed on the official race id (1 Elyos, 2 Asmodian). The name is only the fallback, and the
   official data spells it "Asmodians", so both spellings are accepted. */
export const FACTIONS = Object.freeze({ 1: 'elyos', 2: 'asmodian' });
const FACTION_NAMES = Object.freeze({ elyos: 'elyos', elyo: 'elyos', asmodian: 'asmodian', asmodians: 'asmodian' });
export function factionOf(raceName, raceId = null) {
  if (Object.hasOwn(FACTIONS, raceId)) return FACTIONS[raceId];
  return FACTION_NAMES[String(raceName ?? '').trim().toLowerCase()] ?? 'astrix';
}

/** Character data age in plain words. Cached data is never shown as live. */
export function sourceLabel(source) {
  const at = Date.parse(source.fetchedAt);
  if (!Number.isFinite(at)) return 'Read from the official AION 2 site.';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  const age = minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  return `Read from the official AION 2 site ${age}${source.cache === 'hit' ? ' (cached)' : ''}.`;
}

/* Roster: up to 8 Daevas per server, added by name, saved on this device. The public data cannot tell which
   characters share an account, so a roster belongs to one server in one region (id "<region>:<serverId>"). */
const rosterKey = entry => `${entry.serverId}:${entry.characterId}`; // server ids differ between regions, so the key needs no region
const rosterIdOf = entry => `${regionOf(entry.region)}:${entry.serverId}`;
const validEntry = entry => Boolean(entry && typeof entry.name === 'string' && entry.name.trim() && entry.characterId && Number.isFinite(Number(entry.serverId)));
const emptyStore = () => ({ rosters: {}, active: null });

/**
 * Files entries into their server's roster (old entries have no region: Europe). Drops blank ones and the old example
 * Daeva (saved with demo: true before the live Worker), caps each roster at the slot count. Real entries are untouched.
 */
function fileEntries(list, store) {
  for (const raw of list) {
    if (!validEntry(raw)) continue; // saved without a name or id (an empty reply): it would show as a blank card
    if (raw.demo === true) continue; // the old example Daeva: never a real character on this device
    const { demo, ...kept } = raw;
    const entry = { ...kept, region: regionOf(raw.region) };
    const id = rosterIdOf(entry);
    const bucket = (store.rosters[id] ??= { region: entry.region, serverId: entry.serverId, serverName: entry.serverName, entries: [] });
    if (bucket.entries.length < AETHERIUM_ROSTER_SLOTS && !bucket.entries.some(item => rosterKey(item) === rosterKey(entry))) bucket.entries.push(entry);
  }
  return store;
}

/** v1 (one list for the device) into v2 (a roster per server). Every entry moves, the active Daeva stays active. v1 is left untouched. */
function migrateV1(value) {
  const store = fileEntries(value.entries, emptyStore());
  const mover = value.entries.find(entry => validEntry(entry) && rosterKey(entry) === value.active);
  if (mover) store.active = { roster: rosterIdOf({ ...mover, region: regionOf(mover.region) }), key: rosterKey(mover) };
  return store;
}

function readStore() {
  try {
    const v2 = JSON.parse(localStorage.getItem(AETHERIUM_ROSTER_KEY) ?? 'null');
    if (v2 && typeof v2.rosters === 'object' && v2.rosters) {
      const store = emptyStore();
      const raw = Object.values(v2.rosters).flatMap(bucket => (Array.isArray(bucket?.entries) ? bucket.entries : []));
      fileEntries(raw, store);
      store.active = v2.active && findIn(store, v2.active.key) ? v2.active : null;
      const kept = Object.values(store.rosters).reduce((count, bucket) => count + bucket.entries.length, 0);
      // Something was dropped (the old example Daeva, a blank entry): the device keeps only what is shown.
      return kept < raw.length ? writeStore(store) : store;
    }
    const v1 = JSON.parse(localStorage.getItem(AETHERIUM_ROSTER_KEY_V1) ?? 'null');
    if (v1 && Array.isArray(v1.entries)) return writeStore(migrateV1(v1));
  } catch { /* storage blocked or corrupt: start empty */ }
  return emptyStore();
}

function writeStore(store) {
  try { localStorage.setItem(AETHERIUM_ROSTER_KEY, JSON.stringify(store)); } catch { /* private mode: roster lives for this visit only */ }
  return store;
}

const findIn = (store, key) => {
  for (const [id, bucket] of Object.entries(store.rosters)) {
    const entry = bucket.entries.find(item => rosterKey(item) === key);
    if (entry) return { id, bucket, entry };
  }
  return null;
};

/** A saved Daeva by a page's reference: the link may carry the character id percent-encoded, the roster keeps it as the site sends it. */
const plainId = id => { try { return decodeURIComponent(String(id)); } catch { return String(id); } };
const findRef = (store, ref) => {
  const found = findIn(store, rosterKey(ref));
  if (found) return found;
  for (const [id, bucket] of Object.entries(store.rosters)) {
    const entry = bucket.entries.find(item => String(item.serverId) === String(ref.serverId) && plainId(item.characterId) === plainId(ref.characterId));
    if (entry) return { id, bucket, entry };
  }
  return null;
};

/** The active Daeva's roster (else the first one), with the active key resolved. */
function viewOf(store) {
  const ids = Object.keys(store.rosters);
  const found = store.active ? findIn(store, store.active.key) : null;
  const id = found ? found.id : ids[0] ?? null;
  const bucket = id ? store.rosters[id] : null;
  const entries = bucket ? bucket.entries : [];
  const active = found ? store.active.key : entries[0] ? rosterKey(entries[0]) : null;
  return {
    entries,
    active,
    rosterId: id,
    region: bucket?.region ?? null,
    serverId: bucket?.serverId ?? null,
    serverName: bucket?.serverName ?? null,
    servers: ids.map(key => ({ id: key, region: store.rosters[key].region, serverId: store.rosters[key].serverId, serverName: store.rosters[key].serverName, count: store.rosters[key].entries.length }))
  };
}

const entryFrom = (model, source) => ({
  name: model.profile.name,
  serverId: model.profile.server.id,
  serverName: model.profile.server.name,
  characterId: model.profile.characterId,
  className: model.profile.class,
  level: model.profile.level,
  raceName: model.profile.raceName,
  raceId: model.profile.raceId ?? null,
  region: model.source.region,
  title: model.profile.title ?? null,
  itemLevel: Number.isFinite(model.profile.itemLevel) ? model.profile.itemLevel : null,
  seenAt: source.kind === 'live' && Number.isFinite(Date.parse(source.fetchedAt)) ? source.fetchedAt : null
});

/** True when a read may overwrite a saved entry: live, and not older than what the entry already holds. */
const mayRefresh = (saved, source) => source.kind === 'live'
  && Number.isFinite(Date.parse(source.fetchedAt))
  && (!saved.seenAt || Date.parse(source.fetchedAt) >= Date.parse(saved.seenAt));

export const roster = {
  slots: AETHERIUM_ROSTER_SLOTS,
  /** The roster of the active Daeva's server: { entries, active, rosterId, region, serverId, serverName, servers }. */
  read: () => viewOf(readStore()),
  key: rosterKey,
  /** Every saved Daeva on this device, on every server and in every region, for the Compare pickers. */
  all: () => Object.values(readStore().rosters).flatMap(bucket => bucket.entries),
  /**
   * Adds a Daeva to its own server's roster, shows that roster and makes the Daeva active. A Daeva already saved is
   * refreshed (live reads only). Returns false when that server's roster is full.
   */
  add(model, source) {
    const store = readStore();
    const fresh = entryFrom(model, source);
    if (!validEntry(fresh)) return true; // Nothing to save: no name came back. The card still shows what it has.
    const key = rosterKey(fresh);
    const id = rosterIdOf(fresh);
    const bucket = store.rosters[id];
    const index = bucket ? bucket.entries.findIndex(item => rosterKey(item) === key) : -1;
    if (index >= 0) {
      const saved = bucket.entries[index];
      if (mayRefresh(saved, source)) bucket.entries[index] = { ...saved, ...fresh };
    } else if (bucket && bucket.entries.length >= AETHERIUM_ROSTER_SLOTS) {
      return false;
    } else {
      (store.rosters[id] ??= { region: fresh.region, serverId: fresh.serverId, serverName: fresh.serverName, entries: [] }).entries.push(fresh);
    }
    store.active = { roster: id, key };
    writeStore(store);
    return true;
  },
  /** A live read of a saved Daeva updates its card (level, class, race, title, item level). Never from older data. */
  refresh(model, source) {
    const store = readStore();
    const fresh = entryFrom(model, source);
    const found = findIn(store, rosterKey(fresh));
    if (!found || !mayRefresh(found.entry, source)) return false;
    const index = found.bucket.entries.indexOf(found.entry);
    found.bucket.entries[index] = { ...found.entry, ...fresh };
    writeStore(store);
    return true;
  },
  remove(key) {
    const store = readStore();
    const found = findIn(store, key);
    if (!found) return viewOf(store);
    found.bucket.entries = found.bucket.entries.filter(item => rosterKey(item) !== key);
    if (!found.bucket.entries.length) delete store.rosters[found.id];
    if (store.active?.key === key) {
      const next = (store.rosters[found.id] ?? Object.values(store.rosters)[0])?.entries[0] ?? null;
      store.active = next ? { roster: rosterIdOf(next), key: rosterKey(next) } : null;
    }
    writeStore(store);
    return viewOf(store);
  },
  setActive(key) {
    const store = readStore();
    const found = findIn(store, key);
    if (found) store.active = { roster: found.id, key };
    writeStore(store);
    return viewOf(store);
  },
  /** Shows another server's roster and makes its first Daeva active. Returns that Daeva, or null. */
  switchTo(id) {
    const store = readStore();
    const first = store.rosters[id]?.entries[0] ?? null;
    if (!first) return null;
    store.active = { roster: id, key: rosterKey(first) };
    writeStore(store);
    return first;
  },
  active() {
    const view = viewOf(readStore());
    return view.entries.find(item => rosterKey(item) === view.active) ?? null;
  },
  /** The role and team saved with a Daeva ({ role, team }, either may be null), or null when it is not saved. */
  roleOf(ref) {
    const found = ref ? findRef(readStore(), ref) : null;
    return found ? { role: found.entry.role ?? null, team: found.entry.team ?? null } : null;
  },
  /** Saves the role and team the player picked for a saved Daeva. A Daeva not in the roster keeps them in the address only. */
  setRole(ref, { role = null, team = null } = {}) {
    const store = readStore();
    const found = ref ? findRef(store, ref) : null;
    if (!found) return false;
    const index = found.bucket.entries.indexOf(found.entry);
    found.bucket.entries[index] = { ...found.entry, role: role || null, team: team || null };
    writeStore(store);
    return true;
  }
};

/**
 * The role and team for a page: the address first (role=, team=), then what the player saved with this Daeva, else
 * nothing (the advisor then uses the class's main role and Solo or levelling).
 */
export function rolePick(ref = null, search = location.search) {
  const params = new URLSearchParams(search);
  const saved = ref ? roster.roleOf(ref) : null;
  return { role: params.get('role') || saved?.role || null, team: params.get('team') || saved?.team || null };
}

/** A Daeva reference from the page URL (?serverId=&characterId=&region=), for bookmarkable links. A link with no region is Europe. */
export function refFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const serverId = params.get('serverId');
  const characterId = params.get('characterId');
  return /^\d+$/.test(serverId ?? '') && characterId ? { serverId: Number(serverId), characterId, region: regionOf(params.get('region')) } : null;
}

/* Page addresses. Every link to a Daeva page is built here, so a Daeva (?serverId=&characterId=&region=) and the
   class (lets the page start fetching its skill data while the site answers) travel together. */
function withQuery(path, ref, extra = {}) {
  const params = new URLSearchParams();
  if (ref) { params.set('serverId', ref.serverId); params.set('characterId', ref.characterId); params.set('region', regionOf(ref.region)); }
  for (const [key, value] of Object.entries(extra)) if (value !== null && value !== undefined && value !== '') params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
const classSlug = className => (className ? String(className).toLowerCase() : null);

/** The Daeva Card for a Daeva. */
export const cardUrl = ref => withQuery('/hub/aetherium/', ref);

/** The character menu (Gear, Skills, Daevanion cards). */
export const gearUrl = ref => withQuery('/hub/aetherium/gear/', ref);

/** The Gear page: worn items, stats, pet, wings and title. */
export const gearPageUrl = ref => withQuery('/hub/aetherium/gear/equipment/', ref);

/** The Titles page: the three title categories, owned of total, and what each worn title gives. */
export const titlesUrl = ref => withQuery('/hub/aetherium/gear/titles/', ref);

/** A Daeva in a Compare link: "<region>:<serverId>:<characterId>". */
export const compareKey = ref => `${regionOf(ref.region)}:${ref.serverId}:${ref.characterId}`;
/** A Compare key back into a Daeva, or null when it is not one. The character id is everything after the second colon. */
export function compareRef(key) {
  const match = /^([a-z]{2,3}):(\d+):(.+)$/.exec(String(key ?? ''));
  return match && isRegion(match[1]) ? { region: match[1], serverId: Number(match[2]), characterId: match[3] } : null;
}
/** The Compare page, for two Daevas (either may be left out). */
export function compareUrl(a = null, b = null) {
  const params = new URLSearchParams();
  if (a) params.set('a', compareKey(a));
  if (b) params.set('b', compareKey(b));
  const query = params.toString();
  return `/hub/aetherium/compare/${query ? `?${query}` : ''}`;
}

/** The Skills page. tab is 'mastery' (the default, left out of the address) or 'stigma'. */
export const skillsUrl = (ref, className = null, tab = 'mastery') => withQuery('/hub/aetherium/skills/', ref, { class: classSlug(className), tab: tab === 'stigma' ? 'stigma' : null });

/** The Daevanion page, opened on one board (?board=11). */
export const daevanionPageUrl = (ref, className = null, boardId = null) => withQuery('/hub/aetherium/daevanion/', ref, { class: classSlug(className), board: boardId });

/** The Ascent Plan link for a Daeva, or one of its screens (screen: 'daevanion', 'mastery' ...). The class (when known) lets the page fetch its builds while the site answers. */
export function ascentUrl(ref, className = null, { screen = null, board = null, role = null, team = null } = {}) {
  const path = `/hub/aetherium/ascent/${screen ? `${screen}/` : ''}`;
  return ref ? withQuery(path, ref, { class: classSlug(className), role, team, board }) : path;
}

const ADVISOR = '/astrix-app/games/aion2/data/advisor/';
let advisorBase;
let advisorProgression;
let advisorGrades;
let advisorMechanics;
let advisorStats;
const advisorBuilds = new Map();
const advisorIcons = new Map();

/**
 * Ascent Plan data: game-wide progression, the confirmed mechanics (the Mastery cap), the item grades and the skill
 * catalogue (shared, loaded once), plus the role builds for one class (loaded when that class is picked). Static files,
 * no call to the official site.
 */
export function loadAdvisorBase() {
  advisorBase ??= Promise.all([loadProgression(), getJson(`${ADVISOR}skills.json`), loadMechanics(), loadGrades(), loadStats()])
    .catch(error => { advisorBase = undefined; throw error; });
  return advisorBase;
}

/** Item grades (data/advisor/grades.json): the game's names, colours and enchant caps. A small file, loaded once. */
export function loadGrades() {
  advisorGrades ??= getJson(`${ADVISOR}grades.json`).catch(error => { advisorGrades = undefined; throw error; });
  return advisorGrades;
}

/** The stats record (data/advisor/stats.json): what each stat does, where points come from. A small file, loaded once. */
export function loadStats() {
  advisorStats ??= getJson(`${ADVISOR}stats.json`).catch(error => { advisorStats = undefined; throw error; });
  return advisorStats;
}

/** The game mechanics (data/advisor/mechanics.json), shared by the Ascent Plan and the Gear page's item card. */
export function loadMechanics() {
  advisorMechanics ??= getJson(`${ADVISOR}mechanics.json`).catch(error => { advisorMechanics = undefined; throw error; });
  return advisorMechanics;
}

/** The Enhancement window record (data/advisor/enhancement.json): its tabs, role stones and lines. A small file, loaded once. */
let advisorEnhancement;
export function loadEnhancement() {
  advisorEnhancement ??= getJson(`${ADVISOR}enhancement.json`).catch(error => { advisorEnhancement = undefined; throw error; });
  return advisorEnhancement;
}

/** Game-wide facts only (boards, unlock levels): a small file, so the menu and Daevanion pages skip the skill catalogue. */
export function loadProgression() {
  advisorProgression ??= getJson(`${ADVISOR}progression.json`).catch(error => { advisorProgression = undefined; throw error; });
  return advisorProgression;
}

/** One class's builds (static, cached). */
export function loadBuilds(className) {
  const slug = String(className).toLowerCase();
  if (!advisorBuilds.has(slug)) advisorBuilds.set(slug, getJson(`${ADVISOR}builds/${slug}.json`).catch(error => { advisorBuilds.delete(slug); throw error; }));
  return advisorBuilds.get(slug);
}

/** The class's skill list with the game's icon for each skill and stigma (captured from the official site, all 8 classes). */
function loadIcons(className) {
  const slug = String(className).toLowerCase();
  if (!advisorIcons.has(slug)) advisorIcons.set(slug, getJson(`${ADVISOR}icons/${slug}.json`).catch(() => { advisorIcons.delete(slug); return null; }));
  return advisorIcons.get(slug);
}

/** Starts fetching a class's builds early (no await), so a later loadAdvisor finds them ready. */
export function prefetchAdvisor(className) {
  loadAdvisorBase().catch(() => {});
  if (className) { loadBuilds(className).catch(() => {}); loadIcons(className); }
}

/** Starts fetching what the Daevanion page needs (no await), so it is ready when the board is. */
export function prefetchDaevanionAdvice(className) {
  loadProgression().catch(() => {});
  if (className) loadBuilds(className).catch(() => {});
}

/** What the Daevanion page needs: the game-wide facts and the class's builds (for its key skill nodes). */
export async function loadDaevanionAdvice(className) {
  const [progression, builds] = await Promise.all([loadProgression(), loadBuilds(className)]);
  return { progression, builds };
}

/** Every class's main build, { Gladiator: build, ... }: says which classes rank a stat high. Loaded when a stat card first opens. */
export async function loadMainBuilds(classes) {
  const files = await Promise.all(classes.map(name => loadBuilds(name).catch(() => null)));
  return Object.fromEntries(classes.map((name, n) => [name, files[n]?.records?.find(build => build.main) ?? null]).filter(([, build]) => build));
}

export async function loadAdvisor(className) {
  const [[progression, skills, mechanics, grades, stats], builds, icons] = await Promise.all([loadAdvisorBase(), loadBuilds(className), loadIcons(className)]);
  return { progression, skills, mechanics, grades, stats, builds, icons };
}
