/**
 * Atreia Atlas marker card (feature/aetherium-map-foundation, 28 Oct 2026): the card a marker opens. Title, the layer with
 * its icon, the note, the level when there is one, and a Reported tag when a legion member sent it and it is not yet checked
 * in game (the brief asks for this tag; it is the one status the map shows). Only the data in the marker is drawn.
 *
 * Loot (29 Oct 2026, Miguel): a marker with loot shows the game's Loot Highlights in the colours the game draws them, from a
 * shared table plus its own extras, and a loot chest's pools with the odds the game prints. Nothing is shown that the game
 * did not show: no grade names it did not give, no drop chances where it gave none.
 */
import { esc } from './aetherium-ui.mjs';

export const LAYER_ICONS = '/astrix-app/pages/aetherium/icons/atlas-layers.svg';
const GAME_ICONS = new Map();
/** Registers the in-game icons from layers.json, keyed by the layer's icon id. */
export function useLayerImages(layers) {
  for (const layer of layers ?? []) if (layer.image) GAME_ICONS.set(layer.icon, layer.image);
}
/** A marker's own in-game icon when it has one (a Command Merchant among merchants), else its layer's. */
export const markerIcon = (marker, layer, size = 32) => (marker?.image
  ? `<img class="ae-atlas-icon is-game" src="${esc(marker.image)}" alt="" width="${size}" height="${size}" decoding="async">`
  : layerIcon(layer?.icon ?? marker?.layer, size));
export const layerIcon = (icon, size = 32) => {
  const game = GAME_ICONS.get(icon);
  const src = game ?? `${LAYER_ICONS}#${icon}`;
  return `<img class="ae-atlas-icon${game ? ' is-game' : ''}" src="${esc(src)}" alt="" width="${size}" height="${size}" decoding="async">`;
};

/** The card. found: whether this player has marked it found on this device (null hides the toggle, as in capture mode). */
const lootList = groups => groups.map(group => group.items.map(item => `<li data-colour="${esc(group.colour)}">${esc(item)}</li>`).join('')).join('');
function lootHtml(loot, tables) {
  if (!loot) return '';
  const table = loot.table ? tables?.[loot.table] : null;
  const groups = [...(table?.groups ?? []), ...(loot.extra ?? [])];
  const count = groups.reduce((n, group) => n + group.items.length, 0);
  const chest = loot.chest ? `<section class="ae-atlas-chest"><h4>${esc(loot.chest.name)}</h4>${loot.chest.pools.map(pool => `<div class="ae-atlas-pool">
      <p class="ae-atlas-pool-head"><b>${esc(pool.label)}</b>${pool.chance ? `<span>${esc(pool.chance)} chance${pool.rolls ? `, ${pool.rolls} roll${pool.rolls === 1 ? '' : 's'}` : ''}</span>` : ''}</p>
      <ul>${pool.items.map(item => `<li${item.colour ? ` data-colour="${esc(item.colour)}"` : ''}><span>${esc(item.name)} <small>x${esc(item.qty)}</small></span>${item.chance ? `<span class="ae-atlas-odds">${esc(item.chance)}</span>` : ''}</li>`).join('')}</ul>
    </div>`).join('')}</section>` : '';
  return `<details class="ae-atlas-loot">
      <summary>Loot highlights <span>${count} items</span></summary>
      ${table?.note ? `<p class="ae-atlas-loot-note">${esc(table.note)}</p>` : ''}
      <ul class="ae-atlas-loot-list">${lootList(groups)}</ul>
      ${loot.more ? `<p class="ae-atlas-loot-note">${esc(loot.more)}</p>` : ''}
    </details>${chest}`;
}

export function markerCardHtml(marker, layer, { found = null, tables = null } = {}) {
  const level = Number.isInteger(marker.level) ? `<p class="ae-atlas-card-level">Lv ${marker.level}</p>` : '';
  const reported = marker.status === 'reported' ? '<span class="ae-atlas-tag" data-tag="reported">Reported</span>' : '';
  const where = Number.isFinite(marker.gameX) && Number.isFinite(marker.gameY) ? `<p class="ae-atlas-card-where">${esc(Math.round(marker.gameX))}, ${esc(Math.round(marker.gameY))}</p>` : '';
  return `<article class="ae-atlas-card" data-marker="${esc(marker.id)}" aria-labelledby="aeAtlasCard-${esc(marker.id)}">
    <header class="ae-atlas-card-head">
      ${layer || marker.image ? markerIcon(marker, layer, 40) : ''}
      <div>
        <h3 id="aeAtlasCard-${esc(marker.id)}">${esc(marker.name)}</h3>
        <p class="ae-atlas-card-layer">${esc(layer?.label ?? marker.layer)}${reported}</p>
      </div>
    </header>
    ${marker.note ? `<p class="ae-atlas-card-note">${esc(marker.note)}</p>` : ''}
    ${level}${where}
    ${lootHtml(marker.loot, tables)}
    ${found === null ? '' : `<button class="ae-btn ae-atlas-found-toggle" type="button" data-found="${esc(marker.id)}" aria-pressed="${found}">${found ? 'Found' : 'Mark as found'}</button>`}
  </article>`;
}
