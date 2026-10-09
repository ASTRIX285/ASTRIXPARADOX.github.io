/**
 * The Aetherium data layer. Reads the official AION 2 site through aetherium-worker (or the labelled
 * ASTRIX285 demo while the Worker is not configured) and turns every response into the
 * character model through games/aion2 (armory-adapter.mjs). Pages never read the raw JSON.
 */
import { createAion2Module } from '/astrix-app/games/aion2/index.mjs';
import { adaptDaevanionBoard, adaptItemDetail, adaptSearch } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';
import {
  AETHERIUM_DEMO,
  AETHERIUM_REGION,
  AETHERIUM_REGIONS,
  AETHERIUM_REGION_KEY,
  AETHERIUM_ROSTER_KEY,
  AETHERIUM_ROSTER_SLOTS,
  AETHERIUM_WORKER_URL
} from './aetherium-config.mjs';

const TIMEOUT_MS = 8000;

export class ArmoryUnavailable extends Error {
  constructor(message = 'The official AION 2 site is not answering right now.') {
    super(message);
    this.name = 'ArmoryUnavailable';
  }
}

export const armoryLive = () => typeof AETHERIUM_WORKER_URL === 'string' && AETHERIUM_WORKER_URL.startsWith('https://');

async function getJson(url, { timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new ArmoryUnavailable(`The official AION 2 site answered ${response.status}.`);
    return await response.json();
  } catch (error) {
    throw error instanceof ArmoryUnavailable ? error : new ArmoryUnavailable(error?.message);
  } finally {
    clearTimeout(timer);
  }
}

const fixture = name => getJson(`${AETHERIUM_DEMO.fixtures}${name}.json`);

/* Regions. Only the five official codes are used anywhere; anything else is Europe. */
export const regions = AETHERIUM_REGIONS;
export const isRegion = code => AETHERIUM_REGIONS.some(item => item.code === code);
export const regionOf = code => (isRegion(code) ? code : AETHERIUM_REGION);
export const regionName = code => AETHERIUM_REGIONS.find(item => item.code === regionOf(code)).name;

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
const demoSource = reason => ({ kind: 'demo', capturedOn: AETHERIUM_DEMO.capturedOn, reason });

let catalogue;
export function loadCatalogue() {
  catalogue ??= Promise.all([
    getJson('/astrix-app/games/aion2/data/gear-slots.json'),
    fixture('servers')
  ]).then(([slots, servers]) => ({
    slots: slots.records,
    servers: servers.serverList,
    module: createAion2Module({ slots: slots.records })
  }));
  return catalogue;
}

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Character search. Returns { rows, source }. In demo mode only the ASTRIX285 example is found. */
export async function searchCharacters(name, region = AETHERIUM_REGION) {
  if (armoryLive()) {
    const body = await worker('/aion2/search', { name }, region);
    return { rows: adaptSearch(body), source: liveSource(body.meta) };
  }
  const rows = sameName(name, AETHERIUM_DEMO.name) ? adaptSearch(await fixture('astrix285-search')) : [];
  return { rows, source: demoSource('not-connected') };
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

/** The demo equivalent of one /aion2/character call: info and equipment only. */
async function demoRaw() {
  const [info, equipment] = await Promise.all([fixture('astrix285-info'), fixture('astrix285-equipment')]);
  return { info, equipment };
}

/**
 * The character model for one Daeva. Returns { model, source }.
 * ref = { serverId, characterId, region } or null for the demo character (Europe).
 * First paint needs only this: one /aion2/character call, in parallel with the small slot list.
 * Item detail and Daevanion boards load later, when the player opens them.
 */
export async function loadCharacter(ref, { demoReason = armoryLive() ? 'example' : 'not-connected' } = {}) {
  if (ref && armoryLive()) {
    const region = regionOf(ref.region);
    const [{ module }, body] = await Promise.all([
      loadCatalogue(),
      worker('/aion2/character', { serverId: ref.serverId, characterId: ref.characterId }, region)
    ]);
    const capturedOn = (body.meta?.fetchedAt ?? new Date().toISOString()).slice(0, 10);
    return {
      model: module.normaliseCharacter(body, { region, capturedOn }),
      source: liveSource(body.meta)
    };
  }
  const [{ module }, raw] = await Promise.all([loadCatalogue(), demoRaw()]);
  return {
    model: module.normaliseCharacter(raw, { region: AETHERIUM_REGION, capturedOn: AETHERIUM_DEMO.capturedOn }),
    source: demoSource(demoReason)
  };
}

/** The item detail card for one worn item. Returns { detail, source } or { detail: null, reason }. */
export async function loadItemDetail(model, slot, source) {
  if (slot.empty) return { detail: null, reason: 'Nothing is worn in this slot.' };
  if (source.kind === 'live') {
    const body = await worker('/aion2/item', {
      serverId: model.profile.server.id,
      characterId: model.profile.characterId,
      id: slot.itemId,
      enchantLevel: slot.enchant,
      slotPos: slot.slotPos
    }, model.source.region);
    return { detail: adaptItemDetail(body), source: liveSource(body.meta) };
  }
  if (slot.slotPos === 1) return { detail: adaptItemDetail(await fixture('astrix285-item-mainhand')), source };
  return { detail: null, reason: 'The example holds item detail for the main hand only. Every slot opens once the live data is connected.' };
}

/** The node grid of one Daevanion board, loaded when the player opens it. Returns { nodes } or { nodes: null, reason }. */
export async function loadBoard(model, board, source) {
  if (source.kind === 'live') {
    const body = await worker('/aion2/daevanion', { serverId: model.profile.server.id, characterId: model.profile.characterId, boardId: board.id }, model.source.region);
    return { nodes: adaptDaevanionBoard(body) };
  }
  if (board.id === 11) return { nodes: adaptDaevanionBoard(await fixture('astrix285-daevanion-11')) };
  return { nodes: null, reason: 'The example holds the Nezekan board only. Every board opens once the live data is connected.' };
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
  if (source.kind === 'demo') {
    const why = { unavailable: 'The official AION 2 site is not answering right now.', example: 'Search for your own Daeva above.' }[source.reason] ?? 'Live character data is not connected yet.';
    return `Example data: ASTRIX285, read from the official AION 2 site on ${formatDate(source.capturedOn)}. ${why}`;
  }
  const at = Date.parse(source.fetchedAt);
  if (!Number.isFinite(at)) return 'Read from the official AION 2 site.';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  const age = minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  return `Read from the official AION 2 site ${age}${source.cache === 'hit' ? ' (cached)' : ''}.`;
}

export function formatDate(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : iso;
}

/* Roster: up to 8 Daevas, added by name, saved on this device. */
const rosterKey = entry => `${entry.serverId}:${entry.characterId}`; // server ids differ between regions, so the key needs no region
const validEntry = entry => Boolean(entry && typeof entry.name === 'string' && entry.name.trim() && entry.characterId && Number.isFinite(Number(entry.serverId)));

function readRoster() {
  try {
    const value = JSON.parse(localStorage.getItem(AETHERIUM_ROSTER_KEY) ?? 'null');
    if (value && Array.isArray(value.entries)) {
      // Drop entries saved without a name or id (an empty reply): they show as a blank card. Old entries have no region: Europe.
      const entries = value.entries.filter(validEntry).slice(0, AETHERIUM_ROSTER_SLOTS).map(item => ({ ...item, region: regionOf(item.region) }));
      const active = entries.some(item => rosterKey(item) === value.active) ? value.active : (entries[0] ? rosterKey(entries[0]) : null);
      return { entries, active };
    }
  } catch { /* storage blocked or corrupt: start empty */ }
  return { entries: [], active: null };
}

function writeRoster(roster) {
  try { localStorage.setItem(AETHERIUM_ROSTER_KEY, JSON.stringify(roster)); } catch { /* private mode: roster lives for this visit only */ }
  return roster;
}

export const roster = {
  slots: AETHERIUM_ROSTER_SLOTS,
  read: readRoster,
  key: rosterKey,
  /** Adds or refreshes a Daeva from its model and makes it active. Returns false when all slots are full. */
  add(model, source) {
    const current = readRoster();
    const entry = {
      name: model.profile.name,
      serverId: model.profile.server.id,
      serverName: model.profile.server.name,
      characterId: model.profile.characterId,
      className: model.profile.class,
      level: model.profile.level,
      raceName: model.profile.raceName,
      raceId: model.profile.raceId ?? null,
      region: model.source.region,
      demo: source.kind === 'demo'
    };
    if (!validEntry(entry)) return true; // Nothing to save: no name came back. The card still shows what it has.
    const key = rosterKey(entry);
    const index = current.entries.findIndex(item => rosterKey(item) === key);
    if (index >= 0) current.entries[index] = entry;
    else if (current.entries.length >= AETHERIUM_ROSTER_SLOTS) return false;
    else current.entries.push(entry);
    current.active = key;
    writeRoster(current);
    return true;
  },
  remove(key) {
    const current = readRoster();
    current.entries = current.entries.filter(item => rosterKey(item) !== key);
    if (current.active === key) current.active = current.entries[0] ? rosterKey(current.entries[0]) : null;
    return writeRoster(current);
  },
  setActive(key) {
    const current = readRoster();
    if (current.entries.some(item => rosterKey(item) === key)) current.active = key;
    return writeRoster(current);
  },
  active() {
    const current = readRoster();
    return current.entries.find(item => rosterKey(item) === current.active) ?? null;
  }
};

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

/** The character menu (Gear, Skills, Daevanion cards). */
export const gearUrl = ref => withQuery('/hub/aetherium/gear/', ref);

/** The Gear page: worn items, stats, pet, wings and title. */
export const gearPageUrl = ref => withQuery('/hub/aetherium/gear/equipment/', ref);

/** The Skills page. tab is 'mastery' (the default, left out of the address) or 'stigma'. */
export const skillsUrl = (ref, className = null, tab = 'mastery') => withQuery('/hub/aetherium/skills/', ref, { class: classSlug(className), tab: tab === 'stigma' ? 'stigma' : null });

/** The Daevanion page, opened on one board (?board=11). */
export const daevanionPageUrl = (ref, className = null, boardId = null) => withQuery('/hub/aetherium/daevanion/', ref, { class: classSlug(className), board: boardId });

/** The Ascent Plan link for a Daeva, or one of its screens (screen: 'daevanion', 'mastery' ...). The class (when known) lets the page fetch its builds while the site answers. */
export function ascentUrl(ref, className = null, { screen = null, board = null } = {}) {
  const path = `/hub/aetherium/ascent/${screen ? `${screen}/` : ''}`;
  return ref ? withQuery(path, ref, { class: classSlug(className), board }) : path;
}

const ADVISOR = '/astrix-app/games/aion2/data/advisor/';
let advisorBase;
let advisorProgression;
const advisorBuilds = new Map();
const advisorIcons = new Map();

/**
 * Ascent Plan data: game-wide progression and the skill catalogue (shared, loaded once), plus the
 * role builds for one class (loaded when that class is picked). Static files, no call to the official site.
 */
export function loadAdvisorBase() {
  advisorBase ??= Promise.all([loadProgression(), getJson(`${ADVISOR}skills.json`)])
    .catch(error => { advisorBase = undefined; throw error; });
  return advisorBase;
}

/** Game-wide facts only (boards, unlock levels): a small file, so the menu and Daevanion pages skip the skill catalogue. */
export function loadProgression() {
  advisorProgression ??= getJson(`${ADVISOR}progression.json`).catch(error => { advisorProgression = undefined; throw error; });
  return advisorProgression;
}

function loadBuilds(className) {
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

export async function loadAdvisor(className) {
  const [[progression, skills], builds, icons] = await Promise.all([loadAdvisorBase(), loadBuilds(className), loadIcons(className)]);
  return { progression, skills, builds, icons };
}
