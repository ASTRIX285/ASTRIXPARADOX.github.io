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
