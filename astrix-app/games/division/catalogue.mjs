/**
 * Loads a Division title catalogue (<title>/data/*.json) into the shape the game
 * module reads. Every value comes from those files; nothing is filled in here.
 * test-workbench-editor.mjs checks this file list matches the data folder.
 */

export const CATALOGUE_FILES = Object.freeze({
  td2: Object.freeze(['gear-slots.json', 'core-attributes.json'])
});

const KIND_KEYS = Object.freeze({
  'gear-slot': 'slots',
  attribute: 'attributes',
  item: 'items',
  brand: 'brands',
  'gear-set': 'gearSets',
  skill: 'skills',
  specialization: 'specializations'
});

/** A short, stable fingerprint of the catalogue text, so a build records which catalogue it was made against. */
export function catalogueFingerprint(texts) {
  let hash = 0x811c9dc5;
  for (const text of texts) for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Build the catalogue object from already-read file texts (used by the page and by tests). */
export function buildCatalogue(title, texts) {
  const catalogue = { title, catalogueVersion: `${title}-${catalogueFingerprint(texts)}` };
  for (const key of Object.values(KIND_KEYS)) catalogue[key] = [];
  for (const text of texts) {
    const file = JSON.parse(text);
    const key = KIND_KEYS[file.kind];
    if (!key || file.title !== title || !Array.isArray(file.records)) continue;
    catalogue[key].push(...file.records);
  }
  return catalogue;
}

/** Fetch and build a title catalogue. Rejects with a plain reason if a file cannot be read. */
export async function loadCatalogue(title, { base = '/astrix-app/games/division', fetchImpl = globalThis.fetch } = {}) {
  const files = CATALOGUE_FILES[title];
  if (!files) throw new Error(`No catalogue for ${title}.`);
  const texts = await Promise.all(files.map(async file => {
    const response = await fetchImpl(`${base}/${title}/data/${file}`);
    if (!response.ok) throw new Error(`The ${title} catalogue could not be loaded (${file}).`);
    return response.text();
  }));
  return buildCatalogue(title, texts);
}
