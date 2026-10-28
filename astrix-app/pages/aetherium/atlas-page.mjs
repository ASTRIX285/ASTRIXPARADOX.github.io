/**
 * Atreia Atlas, The Aetherium's map (feature/aetherium-map-foundation, 28 Oct 2026). Static: zones.json, layers.json and
 * markers.json under games/aion2/data/map/. The base maps are Miguel's in-game captures. No marker is drawn that is not in
 * markers.json, and when a zone has none the layer panel says so.
 *
 * Speed: the shell, the zone picker and the layer panel draw from three small JSON files and the page reports ready; the
 * base map loads after that, at the size the screen needs (the small WebP on a phone, the full one when zoomed in).
 */
import { $, esc, markReady, showNotice, wireDrawer } from './aetherium-ui.mjs';
import { createAtlasView } from './atlas-view.mjs';
import { layerIcon } from './atlas-card.mjs';

const DATA = '/astrix-app/games/aion2/data/map/';
const ZONE_KEY = 'ae-atlas-zone';
const FACTIONS = [['elyos', 'Elyos'], ['asmodian', 'Asmodian'], ['abyss', 'Abyss']];

/* Same mode as the <link rel="preload" crossorigin> in the page head, so the browser reuses the preloaded response. */
const getJson = name => fetch(`${DATA}${name}`, { mode: 'cors', credentials: 'same-origin' }).then(response => {
  if (!response.ok) throw new Error(`${name} ${response.status}`);
  return response.json();
});
const remembered = () => { try { return localStorage.getItem(ZONE_KEY); } catch { return null; } };
const remember = id => { try { localStorage.setItem(ZONE_KEY, id); } catch { /* private window: the pick lasts this visit */ } };

function pickerHtml(zones, current) {
  return FACTIONS.map(([faction, label]) => {
    const list = zones.filter(zone => zone.faction === faction);
    if (!list.length) return '';
    return `<div class="ae-atlas-group" role="group" aria-label="${label} zones">
      <span class="ae-atlas-group-name" data-faction="${faction}">${label}</span>
      ${list.map(zone => `<button class="ae-btn ae-atlas-zone" type="button" data-zone="${esc(zone.id)}" aria-pressed="${zone.id === current}">${esc(zone.name)}</button>`).join('')}
    </div>`;
  }).join('');
}

function panelHtml(layers) {
  return `<div class="ae-atlas-panel-head">
      <button class="ae-btn ae-atlas-sheet-toggle" type="button" id="aeAtlasSheet" aria-expanded="false" aria-controls="aeAtlasLayers">
        <span>Layers</span><span class="ae-atlas-total" id="aeAtlasTotal">0 markers</span>
      </button>
      <h2 class="ae-atlas-panel-title">Layers</h2>
    </div>
    <div class="ae-atlas-panel-body" id="aeAtlasLayers">
      <p class="ae-atlas-empty" id="aeAtlasEmpty" hidden>No markers captured for this zone yet.</p>
      <ul class="ae-atlas-layers">${layers.map(layer => `<li>
        <button class="ae-btn ae-atlas-layer" type="button" data-layer="${esc(layer.id)}" aria-pressed="true" title="${esc(layer.text)}">
          ${layerIcon(layer.icon, 36)}
          <span class="ae-atlas-layer-text"><b>${esc(layer.label)}</b><small>${esc(layer.text)}</small></span>
          <span class="ae-atlas-count" data-count="${esc(layer.id)}">0</span>
        </button>
      </li>`).join('')}</ul>
      <div class="ae-atlas-card-slot" id="aeAtlasCard" aria-live="polite"></div>
    </div>`;
}

function start({ zones, layers, markers }) {
  const list = zones.records ?? [];
  const params = new URLSearchParams(location.search);
  const wanted = [params.get('zone'), remembered()].find(id => list.some(zone => zone.id === id));
  let zone = list.find(item => item.id === wanted) ?? list[0];
  const stageEl = $('#aeAtlasStage');
  const imageEl = $('#aeAtlasImage');
  const viewEl = $('#aeAtlasView');
  const view = createAtlasView(viewEl, stageEl);
  const shown = new Set(layers.layers.map(layer => layer.id));

  $('#aeAtlasZones').innerHTML = pickerHtml(list, zone.id);
  $('#aeAtlasPanel').innerHTML = panelHtml(layers.layers);

  let wantsFull = false;
  /** The small WebP when it covers the screen at the current zoom, else the full one. */
  function pickImage() {
    if (!zone.image) return;
    const need = viewEl.clientWidth * (window.devicePixelRatio || 1) * (view.state.scale / view.state.fit);
    const small = zone.imageSmall && zone.smallWidth && need <= zone.smallWidth;
    const src = small && !wantsFull ? zone.imageSmall : zone.image;
    if (!small) wantsFull = true;
    if (imageEl.getAttribute('src') !== src) imageEl.setAttribute('src', src);
  }
  view.onChange(() => { if (imageEl.hasAttribute('src')) pickImage(); });

  function counts() {
    const here = (markers.records ?? []).filter(marker => marker.zone === zone.id);
    for (const layer of layers.layers) {
      const n = here.filter(marker => marker.layer === layer.id).length;
      const cell = document.querySelector(`[data-count="${CSS.escape(layer.id)}"]`);
      if (cell) cell.textContent = String(n);
    }
    $('#aeAtlasEmpty').hidden = here.length > 0;
    $('#aeAtlasTotal').textContent = `${here.length} marker${here.length === 1 ? '' : 's'}`;
    $('#aeAtlasMarkers').replaceChildren();
  }

  function show(next, { load = true } = {}) {
    zone = next;
    document.body.dataset.zone = zone.id;
    for (const button of document.querySelectorAll('.ae-atlas-zone')) button.setAttribute('aria-pressed', String(button.dataset.zone === zone.id));
    $('#aeAtlasTitle').textContent = zone.name;
    viewEl.setAttribute('aria-label', `Map of ${zone.name}. Drag to move, use the wheel or pinch to zoom. Arrow keys move, plus and minus zoom.`);
    imageEl.alt = `In-game map of ${zone.name}`;
    imageEl.removeAttribute('src');
    wantsFull = false;
    /* No capture yet: say so in the map area, draw nothing and keep the zoom buttons off. */
    const pendingMap = !zone.image;
    viewEl.classList.toggle('is-pending', pendingMap);
    viewEl.classList.toggle('is-loading', !pendingMap);
    $('#aeAtlasPending').hidden = !pendingMap;
    $('#aeAtlasPending').textContent = pendingMap ? `The map of ${zone.name} is not captured yet. It goes up here as soon as we have it from in game.` : '';
    for (const tool of document.querySelectorAll('.ae-atlas-tool')) tool.disabled = pendingMap;
    if (!pendingMap) view.load(zone.width, zone.height);
    counts();
    if (load) pickImage();
  }
  imageEl.addEventListener('load', () => viewEl.classList.remove('is-loading'));
  imageEl.addEventListener('error', () => { viewEl.classList.remove('is-loading'); showNotice(`The map of ${zone.name} did not load. Try again in a moment.`, 'warn'); });

  $('#aeAtlasZones').addEventListener('click', event => {
    const button = event.target.closest('[data-zone]');
    const next = button && list.find(item => item.id === button.dataset.zone);
    if (!next || next === zone) return;
    remember(next.id);
    show(next);
  });
  $('#aeAtlasPanel').addEventListener('click', event => {
    const toggle = event.target.closest('[data-layer]');
    if (toggle) {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      if (on) shown.add(toggle.dataset.layer); else shown.delete(toggle.dataset.layer);
      return;
    }
    const sheet = event.target.closest('#aeAtlasSheet');
    if (sheet) {
      const open = sheet.getAttribute('aria-expanded') !== 'true';
      sheet.setAttribute('aria-expanded', String(open));
      $('#aeAtlasPanel').classList.toggle('is-open', open);
    }
  });
  $('#aeAtlasZoomIn').addEventListener('click', view.zoomIn);
  $('#aeAtlasZoomOut').addEventListener('click', view.zoomOut);
  $('#aeAtlasFit').addEventListener('click', view.fit);

  show(zone, { load: false });
  markReady();
  /* The base map waits for the page to be usable, then loads at the size the screen needs. */
  const later = window.requestIdleCallback ?? (fn => setTimeout(fn, 1));
  later(() => pickImage(), { timeout: 300 });
}

wireDrawer();
Promise.all([getJson('zones.json'), getJson('layers.json'), getJson('markers.json')])
  .then(([zones, layers, markers]) => start({ zones, layers, markers }))
  .catch(() => {
    showNotice('The map data did not load. Check your connection and try again.', 'error', { retry: () => location.reload() });
    markReady();
  });
