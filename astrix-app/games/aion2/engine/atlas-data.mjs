/**
 * Atreia Atlas data checks (feature/aetherium-map-foundation, 28 Oct 2026). Pure: takes the parsed zones.json, layers.json
 * and markers.json and returns a list of problems, empty when the data is good. Used by validate-aetherium-map.mjs and the
 * map page test. The JSON schemas under schema/atlas-*.schema.json give the shape; this adds the rules across files.
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const filled = value => typeof value === 'string' && value.trim() !== '';
const fraction = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Problems with one marker, given the known zone and layer ids. */
export function markerProblems(marker, zoneIds, layerIds) {
  const id = marker?.id ?? '(no id)';
  const out = [];
  if (!filled(marker?.id)) out.push(`${id}: no id`);
  if (!zoneIds.has(marker?.zone)) out.push(`${id}: unknown zone "${marker?.zone}"`);
  if (!layerIds.has(marker?.layer)) out.push(`${id}: unknown layer "${marker?.layer}"`);
  if (!fraction(marker?.x)) out.push(`${id}: x must be between 0 and 1`);
  if (!fraction(marker?.y)) out.push(`${id}: y must be between 0 and 1`);
  if (!filled(marker?.name)) out.push(`${id}: no name`);
  if (!['confirmed', 'reported'].includes(marker?.status)) out.push(`${id}: status must be confirmed or reported`);
  const p = marker?.provenance;
  if (!p || p.kind !== 'in-game-capture' || !filled(p.capturedBy) || !DATE.test(p.capturedOn ?? '') || !filled(p.gameVersion) || !filled(p.where) || !filled(p.note)) {
    out.push(`${id}: provenance needs kind in-game-capture, capturedBy, capturedOn, gameVersion, where and note`);
  }
  return out;
}

/** Problems across all three files. */
export function atlasProblems({ zones, layers, markers }) {
  const out = [];
  const zoneIds = new Set((zones?.records ?? []).map(zone => zone.id));
  const layerIds = new Set((layers?.layers ?? []).map(layer => layer.id));
  for (const zone of zones?.records ?? []) {
    if (!['elyos', 'asmodian', 'abyss'].includes(zone.faction)) out.push(`${zone.id}: faction must be elyos, asmodian or abyss`);
    const sources = Array.isArray(zone.provenance) ? zone.provenance : [];
    if (!sources.length) out.push(`${zone.id}: provenance for the zone`);
    /* A zone with no capture yet has no image or size; one with a capture has both and an in-game-capture source. */
    const captured = ['image', 'width', 'height'].filter(key => zone[key] !== undefined);
    if (captured.length && captured.length < 3) out.push(`${zone.id}: image, width and height go in together`);
    if (!zone.image) continue;
    if (!(zone.width > 0 && zone.height > 0)) out.push(`${zone.id}: width and height`);
    if (!sources.some(source => source.kind === 'in-game-capture')) out.push(`${zone.id}: base map must be an in-game capture`);
  }
  const seen = new Set();
  for (const marker of markers?.records ?? []) {
    if (seen.has(marker?.id)) out.push(`${marker.id}: duplicate id`);
    seen.add(marker?.id);
    out.push(...markerProblems(marker, zoneIds, layerIds));
  }
  return out;
}
