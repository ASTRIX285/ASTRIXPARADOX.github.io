/**
 * Neutral ASTRIX build format (core/build-format/build.schema.json).
 *
 * Game agnostic: a build names its game, title and catalogue version, then lists
 * what sits in each slot. Game rules (which items exist, what is pending) belong
 * to the game module, never to this file.
 */

export const BUILD_FORMAT = 'astrix-build';
export const BUILD_FORMAT_VERSION = 1;
export const BUILD_KEYS = Object.freeze(['format', 'formatVersion', 'game', 'title', 'platform', 'catalogueVersion', 'name', 'objective', 'slots', 'abilities', 'selections']);
/** Platforms an agent can live on. pc covers Ubisoft Connect, Steam, Epic and Luna, which share one agent. */
export const PLATFORMS = Object.freeze(['pc', 'playstation', 'xbox']);
export const PLATFORM_LABELS = Object.freeze({ pc: 'PC', playstation: 'PlayStation', xbox: 'Xbox' });
export const isPlatform = value => PLATFORMS.includes(value);
export const SLOT_KEYS = Object.freeze(['itemId', 'attributes', 'talentId', 'modIds']);
export const NAME_MAX = 80;
export const SHARE_PREFIX = '1.';
export const SHARE_MAX_LENGTH = 6000;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITLE = /^[a-z0-9]+$/;
const isId = value => typeof value === 'string' && value.length <= 64 && ID.test(value);
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sortedEntries = object => Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** A new, empty build for a game, title and platform. The platform is required, never assumed. */
export function createBuild({ game, title = null, platform, catalogueVersion = null, name = '', objective = null } = {}) {
  return normaliseBuild({ format: BUILD_FORMAT, formatVersion: BUILD_FORMAT_VERSION, game, title, platform, catalogueVersion, name, objective, slots: {}, abilities: [], selections: {} });
}

/** Every problem with a build, as plain sentences. An empty list means valid. */
export function validateBuild(build) {
  const errors = [];
  if (!isObject(build)) return ['Build must be an object.'];
  for (const key of Object.keys(build)) if (!BUILD_KEYS.includes(key)) errors.push(`Unknown build field ${key}.`);
  for (const key of BUILD_KEYS) if (!(key in build)) errors.push(`Missing build field ${key}.`);
  if (build.format !== BUILD_FORMAT) errors.push(`format must be ${BUILD_FORMAT}.`);
  if (build.formatVersion !== BUILD_FORMAT_VERSION) errors.push(`formatVersion must be ${BUILD_FORMAT_VERSION}.`);
  if (!isId(build.game)) errors.push('game must be a game module id.');
  if (build.title !== null && !(typeof build.title === 'string' && TITLE.test(build.title))) errors.push('title must be a title id or null.');
  if (!isPlatform(build.platform)) errors.push(`platform must be one of ${PLATFORMS.join(', ')}.`);
  if (build.catalogueVersion !== null && !(typeof build.catalogueVersion === 'string' && build.catalogueVersion.length)) errors.push('catalogueVersion must be a string or null.');
  if (typeof build.name !== 'string' || build.name.length > NAME_MAX) errors.push(`name must be text up to ${NAME_MAX} characters.`);
  if (build.objective !== null && !isId(build.objective)) errors.push('objective must be an id or null.');
  if (!isObject(build.slots)) errors.push('slots must be an object.');
  else for (const [slotId, slot] of Object.entries(build.slots)) {
    if (!isId(slotId)) errors.push(`Slot ${slotId} is not a valid id.`);
    if (!isObject(slot)) { errors.push(`Slot ${slotId} must be an object.`); continue; }
    for (const key of Object.keys(slot)) if (!SLOT_KEYS.includes(key)) errors.push(`Slot ${slotId} has unknown field ${key}.`);
    if (!isId(slot.itemId)) errors.push(`Slot ${slotId} needs an itemId.`);
    if ('attributes' in slot && (!isObject(slot.attributes) || !Object.entries(slot.attributes).every(([id, value]) => isId(id) && typeof value === 'number' && Number.isFinite(value)))) errors.push(`Slot ${slotId} attributes must map ids to numbers.`);
    if ('talentId' in slot && !isId(slot.talentId)) errors.push(`Slot ${slotId} talentId must be an id.`);
    if ('modIds' in slot && !(Array.isArray(slot.modIds) && slot.modIds.every(isId))) errors.push(`Slot ${slotId} modIds must be a list of ids.`);
  }
  if (!Array.isArray(build.abilities) || !build.abilities.every(isId)) errors.push('abilities must be a list of ids.');
  if (!isObject(build.selections) || !Object.entries(build.selections).every(([key, value]) => isId(key) && isId(value))) errors.push('selections must map ids to ids.');
  return errors;
}

/**
 * The canonical form of a valid build: fixed key order, slots and maps sorted by
 * key, list order kept. Two builds that mean the same thing normalise to the same
 * JSON, so share strings are stable.
 */
export function normaliseBuild(build) {
  const errors = validateBuild(build);
  if (errors.length) throw new TypeError(`Invalid build: ${errors.join(' ')}`);
  const slots = {};
  for (const [slotId, slot] of sortedEntries(build.slots)) {
    const out = { itemId: slot.itemId };
    if (slot.attributes) out.attributes = Object.fromEntries(sortedEntries(slot.attributes));
    if (slot.talentId) out.talentId = slot.talentId;
    if (slot.modIds) out.modIds = [...slot.modIds];
    slots[slotId] = out;
  }
  return {
    format: BUILD_FORMAT,
    formatVersion: BUILD_FORMAT_VERSION,
    game: build.game,
    title: build.title,
    platform: build.platform,
    catalogueVersion: build.catalogueVersion,
    name: build.name,
    objective: build.objective,
    slots,
    abilities: [...build.abilities],
    selections: Object.fromEntries(sortedEntries(build.selections))
  };
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** A URL-safe share string for a build (only A to Z, a to z, 0 to 9, '-', '_' and '.'). */
export function encodeBuild(build) {
  const text = SHARE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(normaliseBuild(build))));
  if (text.length > SHARE_MAX_LENGTH) throw new RangeError(`Build is too large to share (${text.length} characters).`);
  return text;
}

/** The build in a share string. Throws a TypeError with a plain reason when the string is not a valid build. */
export function decodeBuild(text) {
  if (typeof text !== 'string' || !text.startsWith(SHARE_PREFIX)) throw new TypeError('Not an ASTRIX build share string.');
  if (text.length > SHARE_MAX_LENGTH) throw new TypeError('Share string is too long.');
  const body = text.slice(SHARE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new TypeError('Share string has characters that are not URL-safe.');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(body))); }
  catch { throw new TypeError('Share string could not be read.'); }
  return normaliseBuild(parsed);
}
