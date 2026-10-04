/**
 * WorkBench editor state: counts, saving and share links. No DOM here, so the
 * test can drive it directly. Game data comes only from the game module.
 */
import { isPlatform, normaliseBuild } from '../../core/build-format/build.mjs';
import { readShareParam, shareUrl } from '../../platform/adapters/division/share.mjs';

/** Build objectives the player can tag a build with. They have no effect on counts yet. */
export const OBJECTIVES = Object.freeze([
  { id: 'dps', label: 'DPS' },
  { id: 'survivability', label: 'Survivability' },
  { id: 'skill-damage', label: 'Skill damage' },
  { id: 'support', label: 'Support' },
  { id: 'hybrid', label: 'Hybrid' }
]);

export const STORAGE_KEY = 'astrix.workbench.td2.build';
/** The player's platform, remembered per device and written into every build they make. */
export const PLATFORM_KEY = 'astrix.workbench.platform';

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);

/** How many equipped slots carry each core attribute. */
export function coreCounts(build, module) {
  const slots = Object.values(build.slots);
  return module.listCoreAttributes().map(attribute => ({
    id: attribute.id,
    name: attribute.name,
    count: slots.filter(slot => slot.core?.attributeId === attribute.id).length
  }));
}

/** How many pieces of each brand and gear set are equipped. */
export function pieceCounts(build, module) {
  return module.normalisePassives(build).map(row => ({
    id: row.id,
    name: isPending(row.record) ? row.id : row.record.name,
    count: row.equipped,
    pending: isPending(row.record)
  })).sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
}

/** The platform this device last chose, or null when none has been chosen (never assumed). */
export function loadPlatform(storage) {
  try {
    const value = storage?.getItem(PLATFORM_KEY);
    return isPlatform(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remember the platform on this device. Returns false when the browser blocks storage. */
export function savePlatform(storage, platform) {
  if (!isPlatform(platform)) return false;
  try {
    storage.setItem(PLATFORM_KEY, platform);
    return true;
  } catch {
    return false;
  }
}

/** Save a build. Returns false when the browser blocks storage. */
export function saveBuild(storage, build) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normaliseBuild(build)));
    return true;
  } catch {
    return false;
  }
}

/** The saved build, or null when there is none or it no longer reads as a valid build. */
export function loadSavedBuild(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? normaliseBuild(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/**
 * The build to open with: a share link wins, then the saved build, then a new one on the
 * device platform. A shared build keeps its own platform; when that is not the device
 * platform it opens as someone else's build (foreign) that the player can duplicate.
 * With no build and no platform chosen yet, it asks for a platform (build is null).
 * A broken link never blocks the page; it says so and falls back.
 */
export async function openingBuild({ search = '', storage, adapter, platform = null }) {
  let notice = '';
  try {
    const shared = readShareParam(search);
    if (shared) return { build: shared, source: 'link', notice, foreign: shared.platform !== platform };
  } catch (error) {
    notice = `That share link could not be read. ${error.message}`;
  }
  const saved = storage ? loadSavedBuild(storage) : null;
  if (saved) return { build: saved, source: 'saved', notice, foreign: false };
  const fresh = await adapter.load({ platform });
  if (!fresh.ok) return { build: null, source: 'needs-platform', notice, foreign: false };
  return { build: fresh.build, source: 'new', notice, foreign: false };
}

/** The full share link for a build on this site. */
export function shareLink(build, origin) {
  return `${origin}${shareUrl(build)}`;
}

/* ---------- Your items: the player's own rolled instances, kept on this device ---------- */

export const ITEMS_KEY = 'astrix.workbench.td2.items';
const ITEM_FIELDS = Object.freeze(['itemId', 'core', 'attributes', 'talentId', 'modIds', 'expertise', 'itemLevel']);

/** The player's saved item instances: [{ key, slotId, entry }]. Anything that no longer reads cleanly is dropped. */
export function loadItems(storage) {
  try {
    const list = JSON.parse(storage?.getItem(ITEMS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(row => row && typeof row.key === 'string' && typeof row.slotId === 'string' && row.entry && typeof row.entry.itemId === 'string') : [];
  } catch {
    return [];
  }
}

export function saveItems(storage, list) {
  try {
    storage.setItem(ITEMS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const cleanEntry = entry => Object.fromEntries(ITEM_FIELDS.filter(key => entry[key] !== undefined && entry[key] !== null).map(key => [key, entry[key]]));

/** Add or replace one instance after the game module accepts it. Returns { ok, list, key } or { ok: false, reason }. */
export function putItem(list, module, { key = null, slotId, entry }) {
  const clean = cleanEntry(entry);
  const errors = module.validateSlot(slotId, clean);
  if (errors.length) return { ok: false, reason: errors[0] };
  const nextKey = key ?? `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next = list.filter(row => row.key !== nextKey);
  next.push({ key: nextKey, slotId, entry: clean });
  return { ok: true, list: next, key: nextKey };
}

export function removeItem(list, key) {
  return list.filter(row => row.key !== key);
}

export function itemsForSlot(list, slotId) {
  return list.filter(row => row.slotId === slotId);
}

const sameInstance = (a, b) => Boolean(a && b) && JSON.stringify(cleanEntry(a)) === JSON.stringify(cleanEntry(b));
export { sameInstance };

/**
 * Compare one instance against the equipped one, stat by stat, like the in-game list: for each core or
 * attribute both carry, up, down or same. Stats only one of them carries are listed without an arrow.
 */
export function compareInstance(entry, equipped) {
  const rows = [];
  const value = (instance, id) => (instance?.core?.attributeId === id ? instance.core.value : instance?.attributes?.[id]);
  const ids = new Set([entry.core?.attributeId, ...Object.keys(entry.attributes ?? {})].filter(Boolean));
  for (const id of ids) {
    const mine = value(entry, id);
    const theirs = value(equipped, id);
    rows.push({ id, value: mine, versus: theirs ?? null, arrow: theirs === undefined || theirs === null ? null : mine > theirs ? 'up' : mine < theirs ? 'down' : 'same' });
  }
  return rows;
}

/**
 * The agent summary on the left of the inspect view. Core counts and Skill Tier come from the build
 * and the catalogue; every stat that needs the calculation engine stays pending until it exists.
 */
export function agentSummary(build, module) {
  const cores = coreCounts(build, module);
  const tierRecord = module.listCoreAttributes().find(core => core.id === 'skill-tier');
  let skillTier = { pending: true, reason: 'Skill Tier is not in the catalogue yet.' };
  if (tierRecord) {
    const total = Object.values(build.slots).reduce((sum, slot) => sum + (slot.core?.attributeId === 'skill-tier' ? slot.core.value : 0), 0);
    const cap = tierRecord.cap && !isPending(tierRecord.cap) && !isPending(tierRecord.cap.value) ? tierRecord.cap.value : null;
    skillTier = cap === null ? total : Math.min(total, cap);
  }
  const engine = { pending: true, reason: 'Worked out by the calculation engine, which comes next.' };
  return {
    cores,
    stats: [
      { id: 'primary-damage', label: 'Primary DMG', value: engine },
      { id: 'primary-pvp-damage', label: 'Primary PvP DMG', value: engine },
      { id: 'rpm', label: 'RPM', value: engine },
      { id: 'magazine', label: 'MAG', value: engine },
      { id: 'armor', label: 'Total armor', value: engine },
      { id: 'health', label: 'Total health', value: engine },
      { id: 'skill-tier', label: 'Skill Tier', value: skillTier }
    ]
  };
}
