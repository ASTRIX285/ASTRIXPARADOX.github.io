/**
 * Atreia Atlas, The Aetherium's map (feature/aetherium-map-foundation, 28 Oct 2026). Static: zones.json, layers.json and
 * markers.json under games/aion2/data/map/. The base maps are Miguel's in-game captures. No marker is drawn that is not in
 * markers.json, and when a zone has none the layer panel says so.
 *
 * Speed: the shell, the zone picker and the layer panel draw from three small JSON files and the page reports ready; the
 * base map loads after that, at the size the screen needs (the small WebP on a phone, the full one when zoomed in).
 *
 * Markers (feature/aetherium-map-capture): drawn by atlas-markers.mjs, the card opens in the panel, ?zone=<id>&marker=<id>
 * opens the zone centred on the marker with its card. ?capture=1 loads atlas-capture.mjs, never linked from the site.
 */
import { $, esc, markReady, showNotice, wireDrawer } from './aetherium-ui.mjs';
import { createAtlasView } from './atlas-view.mjs';
import { layerIcon, markerCardHtml } from './atlas-card.mjs';
import { createMarkerLayer } from './atlas-markers.mjs';

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

function clusterHtml(members, byLayer) {
  return `<article class="ae-atlas-card ae-atlas-card-list"><h3>${members.length} markers here</h3><ul>${members.map(marker => `<li>
    <button class="ae-btn ae-atlas-card-pick" type="button" data-pick="${esc(marker.id)}">${layerIcon(byLayer.get(marker.layer)?.icon ?? marker.layer, 28)}<span>${esc(marker.name)}</span></button>
  </li>`).join('')}</ul></article>`;
}

function start({ zones, layers, markers, captureModule }) {
  const list = zones.records ?? [];
  const params = new URLSearchParams(location.search);
  const linked = params.get('marker');
  const linkedMarker = linked ? (markers.records ?? []).find(marker => marker.id === linked) : null;
  const wanted = [linkedMarker?.zone, params.get('zone'), remembered()].find(id => list.some(zone => zone.id === id));
  let zone = list.find(item => item.id === wanted) ?? list[0];
  const stageEl = $('#aeAtlasStage');
  const imageEl = $('#aeAtlasImage');
  const viewEl = $('#aeAtlasView');
  const view = createAtlasView(viewEl, stageEl);
  const shown = new Set(layers.layers.map(layer => layer.id));
  const byLayer = new Map(layers.layers.map(layer => [layer.id, layer]));
  const pins = createMarkerLayer({ overlay: $('#aeAtlasMarkers'), view, layers: layers.layers });
  let capture = null;
  let selected = null;

  $('#aeAtlasZones').innerHTML = pickerHtml(list, zone.id);
  $('#aeAtlasPanel').innerHTML = panelHtml(layers.layers);

  let wantsFull = false;
  /** The small WebP when it covers the map as drawn at the current zoom, else the full one. */
  function pickImage() {
    if (!zone.image) return;
    const need = Math.min(zone.width * view.state.scale, viewEl.clientWidth) * (window.devicePixelRatio || 1);
    const small = zone.imageSmall && zone.smallWidth && need <= zone.smallWidth;
    const src = small && !wantsFull ? zone.imageSmall : zone.image;
    if (!small) wantsFull = true;
    if (imageEl.getAttribute('src') !== src) imageEl.setAttribute('src', src);
  }
  view.onChange(() => { if (imageEl.hasAttribute('src')) pickImage(); });

  /** markers.json for this zone, plus this device's captures in capture mode. */
  const zoneMarkers = () => [
    ...(markers.records ?? []),
    ...(capture ? capture.records().map(marker => ({ ...marker, captured: true })) : [])
  ].filter(marker => marker.zone === zone.id);
  const sheetOpen = open => {
    const sheet = $('#aeAtlasSheet');
    if (getComputedStyle(sheet).display === 'none') return;
    sheet.setAttribute('aria-expanded', String(open));
    $('#aeAtlasPanel').classList.toggle('is-open', open);
  };
  const setUrl = id => {
    const url = new URL(location.href);
    url.searchParams.set('zone', zone.id);
    if (id) url.searchParams.set('marker', id); else url.searchParams.delete('marker');
    history.replaceState(history.state, '', url);
  };
  function openCard(id) {
    const marker = zoneMarkers().find(item => item.id === id);
    if (!marker) return;
    selected = id;
    pins.select(id);
    $('#aeAtlasCard').innerHTML = markerCardHtml(marker, byLayer.get(marker.layer));
    sheetOpen(true);
    if (!capture) setUrl(id);
  }
  function closeCard() {
    if (!selected && !$('#aeAtlasCard').childElementCount) return;
    selected = null;
    pins.select(null);
    $('#aeAtlasCard').replaceChildren();
    if (!capture) setUrl(null);
  }
  pins.onPick((id, members) => {
    if (members) { selected = null; pins.select(null); $('#aeAtlasCard').innerHTML = clusterHtml(members, byLayer); sheetOpen(true); return; }
    if (capture?.owns(id)) { closeCard(); capture.edit(id); return; }
    openCard(id);
  });
  view.onTap(at => {
    if (zone.image && capture) { closeCard(); capture.drop(at.fx, at.fy); return; }
    closeCard();
  });

  function counts() {
    const here = zoneMarkers();
    pins.set(zone.image ? here : []);
    for (const layer of layers.layers) {
      const n = here.filter(marker => marker.layer === layer.id).length;
      const cell = document.querySelector(`[data-count="${CSS.escape(layer.id)}"]`);
      if (cell) cell.textContent = String(n);
    }
    $('#aeAtlasEmpty').hidden = here.length > 0;
    $('#aeAtlasTotal').textContent = `${here.length} marker${here.length === 1 ? '' : 's'}`;
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
    selected = null;
    pins.select(null);
    $('#aeAtlasCard').replaceChildren();
    /* No capture yet: say so in the map area, draw nothing and keep the zoom buttons off. */
    const pendingMap = !zone.image;
    viewEl.classList.toggle('is-pending', pendingMap);
    viewEl.classList.toggle('is-loading', !pendingMap);
    $('#aeAtlasPending').hidden = !pendingMap;
    $('#aeAtlasPending').textContent = pendingMap ? `The map of ${zone.name} is not captured yet. It goes up here as soon as we have it from in game.` : '';
    for (const tool of document.querySelectorAll('.ae-atlas-tool')) tool.disabled = pendingMap;
    if (!pendingMap) view.load(zone.width, zone.height);
    counts();
    capture?.zoneChanged(zone);
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
      pins.setShown(shown);
      return;
    }
    const pick = event.target.closest('[data-pick]');
    if (pick) { openCard(pick.dataset.pick); return; }
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

  if (captureModule) {
    capture = captureModule.startCapture({
      panel: $('#aeAtlasPanel'), view, layers: layers.layers, zone,
      takenIds: () => new Set((markers.records ?? []).map(marker => marker.id)),
      onChange: () => counts()
    });
    pins.draggable(id => capture.owns(id));
    pins.onMove((id, fx, fy) => capture.move(id, fx, fy));
  }

  show(zone, { load: false });
  /* Deep link: the zone centred on the marker, with its card open. */
  if (linked) {
    if (linkedMarker && linkedMarker.zone === zone.id && zone.image) {
      view.focus(linkedMarker.x, linkedMarker.y, 3);
      openCard(linkedMarker.id);
      pins.flush();
    } else showNotice('That marker is not on the map yet.', 'warn');
  }
  markReady();
  /* The base map waits for the page to be usable, then loads at the size the screen needs. */
  const later = window.requestIdleCallback ?? (fn => setTimeout(fn, 1));
  later(() => pickImage(), { timeout: 300 });
}

wireDrawer();
const wantsCapture = new URLSearchParams(location.search).get('capture') === '1';
/* Capture mode and the checks it imports, fetched side by side rather than one after the other. */
const loadCapture = () => Promise.all([import('./atlas-capture.mjs'), import('../../games/aion2/engine/atlas-data.mjs')]).then(([mode]) => mode);
Promise.all([getJson('zones.json'), getJson('layers.json'), getJson('markers.json'), wantsCapture ? loadCapture() : null])
  .then(([zones, layers, markers, captureModule]) => start({ zones, layers, markers, captureModule }))
  .catch(() => {
    showNotice('The map data did not load. Check your connection and try again.', 'error', { retry: () => location.reload() });
    markReady();
  });
