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
    count: slots.filter(slot => slot.attributes && attribute.id in slot.attributes).length
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
