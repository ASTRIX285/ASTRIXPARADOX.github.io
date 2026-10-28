/**
 * Atreia Atlas marker card (feature/aetherium-map-foundation, 28 Oct 2026): the card a marker opens. Title, the layer with
 * its icon, the note, the level when there is one, and a Reported tag when a legion member sent it and it is not yet checked
 * in game (the brief asks for this tag; it is the one status the map shows). Only the data in the marker is drawn.
 */
import { esc } from './aetherium-ui.mjs';

export const LAYER_ICONS = '/astrix-app/pages/aetherium/icons/atlas-layers.svg';
const GAME_ICONS = new Map();
/** Registers the in-game icons from layers.json, keyed by the layer's icon id. */
export function useLayerImages(layers) {
  for (const layer of layers ?? []) if (layer.image) GAME_ICONS.set(layer.icon, layer.image);
}
export const layerIcon = (icon, size = 32) => {
  const game = GAME_ICONS.get(icon);
  const src = game ?? `${LAYER_ICONS}#${icon}`;
  return `<img class="ae-atlas-icon${game ? ' is-game' : ''}" src="${esc(src)}" alt="" width="${size}" height="${size}" decoding="async">`;
};

export function markerCardHtml(marker, layer) {
  const level = Number.isInteger(marker.level) ? `<p class="ae-atlas-card-level">Lv ${marker.level}</p>` : '';
  const reported = marker.status === 'reported' ? '<span class="ae-atlas-tag" data-tag="reported">Reported</span>' : '';
  const where = Number.isFinite(marker.gameX) && Number.isFinite(marker.gameY) ? `<p class="ae-atlas-card-where">${esc(Math.round(marker.gameX))}, ${esc(Math.round(marker.gameY))}</p>` : '';
  return `<article class="ae-atlas-card" data-marker="${esc(marker.id)}" aria-labelledby="aeAtlasCard-${esc(marker.id)}">
    <header class="ae-atlas-card-head">
      ${layer ? layerIcon(layer.icon, 40) : ''}
      <div>
        <h3 id="aeAtlasCard-${esc(marker.id)}">${esc(marker.name)}</h3>
        <p class="ae-atlas-card-layer">${esc(layer?.label ?? marker.layer)}${reported}</p>
      </div>
    </header>
    ${marker.note ? `<p class="ae-atlas-card-note">${esc(marker.note)}</p>` : ''}
    ${level}${where}
  </article>`;
}
