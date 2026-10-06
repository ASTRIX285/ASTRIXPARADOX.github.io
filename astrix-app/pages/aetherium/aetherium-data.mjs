/**
 * The Aetherium data layer. Reads the armory through aetherium-worker (or the labelled
 * ASTRIX285 demo while the Worker is not configured) and turns every response into the
 * character model through games/aion2 (armory-adapter.mjs). Pages never read raw armory JSON.
 */
import { createAion2Module } from '/astrix-app/games/aion2/index.mjs';
import { adaptDaevanionBoard, adaptItemDetail, adaptSearch } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';
import {
  AETHERIUM_DEMO,
  AETHERIUM_REGION,
  AETHERIUM_ROSTER_KEY,
  AETHERIUM_ROSTER_SLOTS,
  AETHERIUM_WORKER_URL
} from './aetherium-config.mjs';

const TIMEOUT_MS = 8000;

export class ArmoryUnavailable extends Error {
  constructor(message = 'The armory is unavailable right now.') {
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
    if (!response.ok) throw new ArmoryUnavailable(`Armory answered ${response.status}.`);
    return await response.json();
  } catch (error) {
    throw error instanceof ArmoryUnavailable ? error : new ArmoryUnavailable(error?.message);
  } finally {
    clearTimeout(timer);
  }
}

const fixture = name => getJson(`${AETHERIUM_DEMO.fixtures}${name}.json`);

function worker(path, params) {
  const query = new URLSearchParams({ ...params, region: AETHERIUM_REGION });
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
export async function searchCharacters(name) {
  if (armoryLive()) {
    const body = await worker('/aion2/search', { name });
    return { rows: adaptSearch(body), source: liveSource(body.meta) };
  }
  const rows = sameName(name, AETHERIUM_DEMO.name) ? adaptSearch(await fixture('astrix285-search')) : [];
  return { rows, source: demoSource('not-connected') };
}

/** The demo equivalent of one /aion2/character call: info and equipment only. */
async function demoRaw() {
  const [info, equipment] = await Promise.all([fixture('astrix285-info'), fixture('astrix285-equipment')]);
  return { info, equipment };
}

/**
 * The character model for one Daeva. Returns { model, source }.
 * ref = { serverId, characterId } or null for the demo character.
 * First paint needs only this: one /aion2/character call, in parallel with the small slot list.
 * Item detail and Daevanion boards load later, when the player opens them.
 */
export async function loadCharacter(ref, { demoReason = armoryLive() ? 'example' : 'not-connected' } = {}) {
  if (ref && armoryLive()) {
    const [{ module }, body] = await Promise.all([
      loadCatalogue(),
      worker('/aion2/character', { serverId: ref.serverId, characterId: ref.characterId })
    ]);
    const capturedOn = (body.meta?.fetchedAt ?? new Date().toISOString()).slice(0, 10);
    return {
      model: module.normaliseCharacter(body, { region: AETHERIUM_REGION, capturedOn }),
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
    });
    return { detail: adaptItemDetail(body), source: liveSource(body.meta) };
  }
  if (slot.slotPos === 1) return { detail: adaptItemDetail(await fixture('astrix285-item-mainhand')), source };
  return { detail: null, reason: 'The example holds item detail for the main hand only. Every slot opens once the live armory is connected.' };
}

/** The node grid of one Daevanion board, loaded when the player opens it. Returns { nodes } or { nodes: null, reason }. */
export async function loadBoard(model, board, source) {
  if (source.kind === 'live') {
    const body = await worker('/aion2/daevanion', { serverId: model.profile.server.id, characterId: model.profile.characterId, boardId: board.id });
    return { nodes: adaptDaevanionBoard(body) };
  }
  if (board.id === 11) return { nodes: adaptDaevanionBoard(await fixture('astrix285-daevanion-11')) };
  return { nodes: null, reason: 'The example holds the Nezekan board only. Every board opens once the live armory is connected.' };
}

export const FACTIONS = Object.freeze({ Elyos: 'elyos', Asmodian: 'asmodian' });
export const factionOf = raceName => FACTIONS[raceName] ?? 'astrix';

/** Character data age in plain words. Cached data is never shown as live. */
export function sourceLabel(source) {
  if (source.kind === 'demo') {
    const why = { unavailable: 'The armory is unavailable right now.', example: 'Search for your own Daeva above.' }[source.reason] ?? 'The live armory is not connected yet.';
    return `Example data: ASTRIX285, read from the public EU armory on ${formatDate(source.capturedOn)}. ${why}`;
  }
  const at = Date.parse(source.fetchedAt);
  if (!Number.isFinite(at)) return 'Read from the public EU armory.';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  const age = minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  return `Read from the public EU armory ${age}${source.cache === 'hit' ? ' (cached)' : ''}.`;
}

export function formatDate(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : iso;
}

/* Roster: up to 8 Daevas, added by name, saved on this device. */
const rosterKey = entry => `${entry.serverId}:${entry.characterId}`;

function readRoster() {
  try {
    const value = JSON.parse(localStorage.getItem(AETHERIUM_ROSTER_KEY) ?? 'null');
    if (value && Array.isArray(value.entries)) return { entries: value.entries.slice(0, AETHERIUM_ROSTER_SLOTS), active: value.active ?? null };
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
      demo: source.kind === 'demo'
    };
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

/** A Daeva reference from the page URL (?serverId=&characterId=), for bookmarkable links. */
export function refFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const serverId = params.get('serverId');
  const characterId = params.get('characterId');
  return /^\d+$/.test(serverId ?? '') && characterId ? { serverId: Number(serverId), characterId } : null;
}

export const gearUrl = ref => ref
  ? `/hub/aetherium/gear/?${new URLSearchParams({ serverId: ref.serverId, characterId: ref.characterId })}`
  : '/hub/aetherium/gear/';

/** The Ascent Plan link for a Daeva. The class (when known) lets the page fetch its builds while the armory answers. */
export const ascentUrl = (ref, className = null) => ref
  ? `/hub/aetherium/ascent/?${new URLSearchParams({ serverId: ref.serverId, characterId: ref.characterId, ...(className ? { class: String(className).toLowerCase() } : {}) })}`
  : '/hub/aetherium/ascent/';

const ADVISOR = '/astrix-app/games/aion2/data/advisor/';
let advisorBase;
const advisorBuilds = new Map();

/**
 * Ascent Plan data: game-wide progression and the skill catalogue (shared, loaded once), plus the
 * role builds for one class (loaded when that class is picked). Static files, no armory call.
 */
export function loadAdvisorBase() {
  advisorBase ??= Promise.all([getJson(`${ADVISOR}progression.json`), getJson(`${ADVISOR}skills.json`)])
    .catch(error => { advisorBase = undefined; throw error; });
  return advisorBase;
}

function loadBuilds(className) {
  const slug = String(className).toLowerCase();
  if (!advisorBuilds.has(slug)) advisorBuilds.set(slug, getJson(`${ADVISOR}builds/${slug}.json`).catch(error => { advisorBuilds.delete(slug); throw error; }));
  return advisorBuilds.get(slug);
}

/** Starts fetching a class's builds early (no await), so a later loadAdvisor finds them ready. */
export function prefetchAdvisor(className) {
  loadAdvisorBase().catch(() => {});
  if (className) loadBuilds(className).catch(() => {});
}

export async function loadAdvisor(className) {
  const [[progression, skills], builds] = await Promise.all([loadAdvisorBase(), loadBuilds(className)]);
  return { progression, skills, builds };
}
