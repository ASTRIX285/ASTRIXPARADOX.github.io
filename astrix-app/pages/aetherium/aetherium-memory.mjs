/**
 * What The Aetherium remembers about each Daeva on this device (feature/aetherium-guide-home, 18 Oct 2026). The Guide
 * uses it as reference points; phase 2 (your path by level) extends it. Nothing here is sent anywhere.
 *
 * Storage: localStorage "aetherium.memory.v1" = { v: 1, daevas: { "<serverId>:<characterId>": record } }.
 * A record is a plain object the pages fill; every write stamps savedAt (ISO time). Saved data is never live data:
 * show its age (memoryAge) wherever it is shown. Every read and write sits in try/catch: blocked or full storage
 * means nothing is remembered, never an error.
 *
 * API:
 *   memoryKey(ref)          "<serverId>:<characterId>" for a Daeva ref ({ serverId, characterId }), or null.
 *   getMemory(ref)          the saved record, or null.
 *   setMemory(ref, patch)   merges patch into the record, stamps savedAt, returns the new record (null if not saved).
 *   clearMemory(ref)        forgets one Daeva.
 *   memoryAge(record)       "saved 3 days ago" style words from savedAt, or null.
 *   linkedDaeva()           the Daeva the Guide reads for: the page link (?serverId=&characterId=), else the active
 *                           roster Daeva. { ref, entry } (entry: the roster card: name, className, level, raceName,
 *                           seenAt) or null. A linked Daeva not in the roster has entry null.
 */
import { refFromUrl, roster } from './aetherium-data.mjs';

export const MEMORY_KEY = 'aetherium.memory.v1';

const plainId = id => { try { return decodeURIComponent(String(id)); } catch { return String(id); } };

export const memoryKey = ref => (ref && ref.serverId != null && ref.characterId ? `${ref.serverId}:${plainId(ref.characterId)}` : null);

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? 'null');
    if (value && value.v === 1 && value.daevas && typeof value.daevas === 'object') return value;
  } catch { /* blocked or corrupt: nothing remembered */ }
  return { v: 1, daevas: {} };
}

function writeAll(value) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

export function getMemory(ref) {
  const key = memoryKey(ref);
  const record = key ? readAll().daevas[key] : null;
  return record && typeof record === 'object' ? record : null;
}

export function setMemory(ref, patch = {}) {
  const key = memoryKey(ref);
  if (!key) return null;
  const all = readAll();
  const record = { ...(all.daevas[key] ?? {}), ...patch, savedAt: new Date().toISOString() };
  all.daevas[key] = record;
  return writeAll(all) ? record : null;
}

export function clearMemory(ref) {
  const key = memoryKey(ref);
  if (!key) return;
  const all = readAll();
  delete all.daevas[key];
  writeAll(all);
}

export function memoryAge(record, now = Date.now()) {
  const at = Date.parse(record?.savedAt ?? '');
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return 'saved just now';
  if (minutes < 60) return `saved ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `saved ${days} day${days === 1 ? '' : 's'} ago`;
}

export function linkedDaeva() {
  let entries = [];
  let active = null;
  try { entries = roster.all(); active = roster.active(); } catch { /* storage blocked: no roster */ }
  const fromUrl = refFromUrl();
  const ref = fromUrl ?? (active ? { serverId: active.serverId, characterId: active.characterId, region: active.region } : null);
  if (!ref) return null;
  const key = memoryKey(ref);
  const entry = entries.find(item => memoryKey(item) === key) ?? null;
  return { ref: { ...ref, region: ref.region ?? entry?.region }, entry };
}

/* Phase 2 (feature/aetherium-guide-path, 18 Oct 2026): the path page's memory, as fields on the same per-Daeva record.
 *   steps    { [stepId]: ISO time }  path steps the player ticked done.
 *   weekly   { [itemId]: ISO time }  weekly loop items ticked; a tick counts until its cycle's reset (the page's valid).
 *   itemLevel { value, at }          the item level the player typed (the official data may send none).
 *   snapshot, prevSnapshot           level, combat power, item level and grade and enchant per slot on a visit, with at.
 *   loadouts { looks, armour, skills } up to LOADOUT_SLOTS named setups each: { name, at, ...data } or null.
 *   level                             the level picked on the path page when no Daeva is linked (device record only).
 * DEVICE_REF is the record for a player with no linked Daeva, so ticks and the picked level still stay on the device.
 */
export const DEVICE_REF = Object.freeze({ serverId: 'device', characterId: 'guide' });
export const LOADOUT_KINDS = Object.freeze(['looks', 'armour', 'skills']);
export const LOADOUT_SLOTS = 3;
/** A visit within this time of the last snapshot is the same visit (a reload), so "since your last visit" holds. */
export const VISIT_GAP_MS = 30 * 60000;

const mapOf = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** The ids of the path steps ticked done. */
export const stepTicks = ref => Object.keys(mapOf(getMemory(ref)?.steps));

/** Ticks a path step done (or clears it). Returns the ticked ids. */
export function tickStep(ref, id, done = true, now = new Date()) {
  const steps = { ...mapOf(getMemory(ref)?.steps) };
  if (done) steps[id] = new Date(now).toISOString(); else delete steps[id];
  setMemory(ref, { steps });
  return Object.keys(steps);
}

/**
 * The weekly ticks still valid: { [itemId]: ISO time }. valid(at, id) says whether a tick still counts (the page passes
 * the game's reset rule); expired ticks are dropped from the device too, so a reset clears them.
 */
export function weeklyTicks(ref, valid = () => true) {
  const saved = mapOf(getMemory(ref)?.weekly);
  const kept = Object.fromEntries(Object.entries(saved).filter(([id, at]) => valid(at, id)));
  if (Object.keys(kept).length !== Object.keys(saved).length) setMemory(ref, { weekly: kept });
  return kept;
}

/** Ticks a weekly item done for its current cycle (or clears it). Returns the saved ticks. */
export function tickWeekly(ref, id, done = true, now = new Date()) {
  const weekly = { ...mapOf(getMemory(ref)?.weekly) };
  if (done) weekly[id] = new Date(now).toISOString(); else delete weekly[id];
  setMemory(ref, { weekly });
  return weekly;
}

/** The item level the player typed: { value, at }, or null. */
export function typedItemLevel(ref) {
  const saved = getMemory(ref)?.itemLevel;
  return saved && Number.isFinite(saved.value) && saved.value >= 0 ? saved : null;
}

/** Saves the typed item level (a whole number, 0 to 9,999); null or an empty value forgets it. Returns { value, at } or null. */
export function setTypedItemLevel(ref, value, now = new Date()) {
  const n = value === null || value === '' ? NaN : Math.round(Number(value));
  const itemLevel = Number.isFinite(n) && n >= 0 && n <= 9999 ? { value: n, at: new Date(now).toISOString() } : null;
  setMemory(ref, { itemLevel });
  return itemLevel;
}

/**
 * Records this visit's snapshot and says what changed: { since, changes, first }. since is the ISO time of the snapshot
 * compared against. changes(a, b) lists what moved (the page passes snapshotChanges from guide-advisor.mjs). A reload
 * inside VISIT_GAP_MS with nothing new keeps showing the last visit's changes. snapshot.at is when the data was read.
 */
export function recordVisit(ref, snapshot, changes, { now = Date.now() } = {}) {
  const record = getMemory(ref) ?? {};
  const prior = record.snapshot ?? null;
  const at = snapshot.at ?? new Date(now).toISOString();
  const current = { ...snapshot, at };
  if (!prior) { setMemory(ref, { snapshot: current }); return { since: null, changes: [], first: true }; }
  const moved = changes(prior, current);
  if (moved.length) { setMemory(ref, { prevSnapshot: prior, snapshot: current }); return { since: prior.at, changes: moved, first: false }; }
  const prev = record.prevSnapshot ?? null;
  if (prev && now - Date.parse(prior.at) < VISIT_GAP_MS) return { since: prev.at, changes: changes(prev, prior), first: false };
  setMemory(ref, { prevSnapshot: prior, snapshot: current });
  return { since: prior.at, changes: [], first: false };
}

/** The saved loadouts: { looks, armour, skills }, each an array of LOADOUT_SLOTS entries ({ name, at, ... } or null). */
export function loadoutsOf(ref) {
  const saved = mapOf(getMemory(ref)?.loadouts);
  return Object.fromEntries(LOADOUT_KINDS.map(kind => [kind, Array.from({ length: LOADOUT_SLOTS }, (_, n) => {
    const entry = Array.isArray(saved[kind]) ? saved[kind][n] : null;
    return entry && typeof entry === 'object' ? entry : null;
  })]));
}

/** Saves one loadout (kind: looks, armour or skills; slot 0 to 2) as { name, at, ...data }, or clears it with null. */
export function saveLoadout(ref, kind, slot, loadout, now = new Date()) {
  if (!LOADOUT_KINDS.includes(kind) || !Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS) return null;
  const all = loadoutsOf(ref);
  all[kind][slot] = loadout ? { ...loadout, name: String(loadout.name ?? `Loadout ${slot + 1}`).slice(0, 40), at: new Date(now).toISOString() } : null;
  setMemory(ref, { loadouts: all });
  return all;
}
