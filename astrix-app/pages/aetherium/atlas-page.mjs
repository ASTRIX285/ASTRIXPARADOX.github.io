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
 *
 * Drill down (28 Oct 2026, Miguel): each layer row opens a list of its markers in this zone, A to Z, and a search box finds a
 * marker by name across every layer. Picking one centres the map on it, turns its layer on and opens its card.
 *
 * Layer rows (29 Oct 2026, Miguel): icon, name and count only. The line on what a layer is for shows in a hover card when
 * the mouse is on the layer's icon, and on keyboard focus, and stays readable to screen readers as the button's description.
 *
 * Found (28 Oct 2026, Miguel): every marker's card can be marked found. Found ones are kept on this device only, drawn with a
 * tick, counted per layer (found of total) and can be hidden with Hide found.
 */
import { $, esc, markReady, showNotice, wireDrawer } from './aetherium-ui.mjs';
import { createAtlasView } from './atlas-view.mjs';
import { layerIcon, markerCardHtml, markerIcon, useLayerImages } from './atlas-card.mjs';
import { createMarkerLayer, NAMES_AT_PX } from './atlas-markers.mjs';

const DATA = '/astrix-app/games/aion2/data/map/';
const ZONE_KEY = 'ae-atlas-zone';
const FOUND_KEY = 'ae-atlas-found';
const HIDE_KEY = 'ae-atlas-hide-found';
const readFound = () => { try { return new Set(JSON.parse(localStorage.getItem(FOUND_KEY) || '[]')); } catch { return new Set(); } };
const saveFound = set => { try { localStorage.setItem(FOUND_KEY, JSON.stringify([...set])); } catch { /* private window: kept for this visit */ } };
const readHide = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
const saveHide = on => { try { localStorage.setItem(HIDE_KEY, on ? '1' : '0'); } catch { /* kept for this visit */ } };
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
      <div class="ae-atlas-card-slot" id="aeAtlasCard" aria-live="polite"></div>
      <div class="ae-atlas-find" role="search">
        <label class="ae-atlas-find-label" for="aeAtlasFind">Find on the map</label>
        <input class="ae-atlas-find-input" id="aeAtlasFind" type="search" placeholder="Kibelisk, camp, area or dungeon" autocomplete="off" spellcheck="false" aria-controls="aeAtlasFound">
        <ul class="ae-atlas-found" id="aeAtlasFound" aria-live="polite" hidden></ul>
      </div>
      <p class="ae-atlas-empty" id="aeAtlasEmpty" hidden>No markers captured for this zone yet.</p>
      <button class="ae-btn ae-atlas-hide-found" type="button" id="aeAtlasHideFound" aria-pressed="false">Hide found</button>
      <ul class="ae-atlas-layers">${layers.map(layer => `<li class="ae-atlas-layer-item">
        <div class="ae-atlas-layer-row">
          <button class="ae-btn ae-atlas-layer" type="button" data-layer="${esc(layer.id)}" aria-pressed="true" aria-describedby="aeAtlasTip-${esc(layer.id)}">
            ${layerIcon(layer.icon, 36)}
            <span class="ae-atlas-layer-text"><b>${esc(layer.label)}</b>${layer.minZoomPx ? `<span class="ae-atlas-zoomhint" data-zoomhint="${esc(layer.id)}" hidden>Zoom in to see them</span>` : ''}<small class="ae-atlas-layer-tip" id="aeAtlasTip-${esc(layer.id)}" role="tooltip">${esc(layer.text)}</small></span>
            <span class="ae-atlas-count" data-count="${esc(layer.id)}">0</span>
          </button>
          <button class="ae-btn ae-atlas-drill" type="button" data-drill="${esc(layer.id)}" aria-expanded="false" aria-controls="aeAtlasList-${esc(layer.id)}" aria-label="List the ${esc(layer.label)}" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
        <ul class="ae-atlas-list" id="aeAtlasList-${esc(layer.id)}" hidden></ul>
      </li>`).join('')}</ul>
    </div>`;
}

/** Buttons for a list of markers, A to Z, each one going to its marker. */
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
function listHtml(members, byLayer, { withLayer = false } = {}) {
  return members.slice().sort(byName).map(marker => {
    const layer = byLayer.get(marker.layer);
    return `<li><button class="ae-btn ae-atlas-goto${marker.found ? ' is-found' : ''}" type="button" data-goto="${esc(marker.id)}">
      ${markerIcon(marker, layer, 26)}
      <span class="ae-atlas-goto-text"><b>${esc(marker.name)}</b>${withLayer ? `<small>${esc(layer?.label ?? marker.layer)}</small>` : ''}</span>
    </button></li>`;
  }).join('');
}
/** Lower case, accents and punctuation off, so "pilgrims rest" finds "Pilgrim's Rest". */
const fold = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function clusterHtml(members, byLayer) {
  return `<article class="ae-atlas-card ae-atlas-card-list"><h3>${members.length} markers here</h3><ul>${members.map(marker => `<li>
    <button class="ae-btn ae-atlas-card-pick" type="button" data-pick="${esc(marker.id)}">${markerIcon(marker, byLayer.get(marker.layer), 28)}<span>${esc(marker.name)}</span></button>
  </li>`).join('')}</ul></article>`;
}

function start({ zones, layers, markers, captureModule }) {
  const list = zones.records ?? [];
  useLayerImages(layers.layers);
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
  const found = readFound();
  let hideFound = readHide();

  $('#aeAtlasZones').innerHTML = pickerHtml(list, zone.id);
  $('#aeAtlasPanel').innerHTML = panelHtml(layers.layers);
  $('#aeAtlasHideFound').setAttribute('aria-pressed', String(hideFound));

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
  ].filter(marker => marker.zone === zone.id).map(marker => (found.has(marker.id) ? { ...marker, found: true } : marker));
  /* Phone bottom sheet. A card opens it short, showing the card alone, so the marker stays in view above it. */
  const sheetOpen = (open, { cardOnly = false } = {}) => {
    const sheet = $('#aeAtlasSheet');
    if (getComputedStyle(sheet).display === 'none') return;
    sheet.setAttribute('aria-expanded', String(open));
    $('#aeAtlasPanel').classList.toggle('is-open', open);
    $('#aeAtlasPanel').classList.toggle('is-card', open && cardOnly);
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
    $('#aeAtlasCard').innerHTML = markerCardHtml(marker, byLayer.get(marker.layer), { found: marker.captured ? null : found.has(marker.id), tables: markers.lootTables });
    sheetOpen(true, { cardOnly: true });
    $('#aeAtlasLayers').scrollTop = 0;
    if (!capture) setUrl(id);
  }
  function closeCard() {
    if (!selected && !$('#aeAtlasCard').childElementCount) return;
    selected = null;
    pins.select(null);
    $('#aeAtlasCard').replaceChildren();
    if ($('#aeAtlasPanel').classList.contains('is-card')) sheetOpen(false);
    if (!capture) setUrl(null);
  }
  pins.onPick((id, members) => {
    if (members) { selected = null; pins.select(null); $('#aeAtlasCard').innerHTML = clusterHtml(members, byLayer); sheetOpen(true, { cardOnly: true }); return; }
    if (capture?.owns(id)) { closeCard(); capture.edit(id); return; }
    openCard(id);
  });
  view.onTap(at => {
    if (zone.image && capture) { closeCard(); capture.drop(at.fx, at.fy); return; }
    closeCard();
  });

  /** From a list or the search: turn the layer on if it is off, centre the map on the marker and open its card. */
  function goTo(id) {
    const marker = zoneMarkers().find(item => item.id === id);
    if (!marker) return;
    if (!shown.has(marker.layer)) {
      shown.add(marker.layer);
      document.querySelector(`.ae-atlas-layer[data-layer="${CSS.escape(marker.layer)}"]`)?.setAttribute('aria-pressed', 'true');
      pins.setShown(shown);
    }
    /* Close enough that the pick and its neighbours have room for their names, on a phone as on a desktop. */
    const close = Math.max(3, Math.max(NAMES_AT_PX, byLayer.get(marker.layer)?.minZoomPx ?? 0) / (zone.width * view.state.fit) * 1.15);
    if (zone.image) view.focus(marker.x, marker.y, Math.max(close, view.state.scale / view.state.fit));
    openCard(id);
    pins.flush();
  }
  /* A dense layer's row says Zoom in while the map is too far out to show it. */
  pins.onZoom(tooFar => {
    for (const hint of document.querySelectorAll('[data-zoomhint]')) hint.hidden = !tooFar(hint.dataset.zoomhint);
  });
  function fillLists() {
    const here = zoneMarkers();
    for (const layer of layers.layers) {
      const members = here.filter(marker => marker.layer === layer.id);
      const drill = document.querySelector(`[data-drill="${CSS.escape(layer.id)}"]`);
      const box = document.getElementById(`aeAtlasList-${layer.id}`);
      if (!drill || !box) continue;
      drill.disabled = members.length === 0;
      if (!members.length) { drill.setAttribute('aria-expanded', 'false'); box.hidden = true; }
      box.innerHTML = listHtml(members, byLayer);
    }
    find();
  }
  function find() {
    const input = $('#aeAtlasFind');
    const out = $('#aeAtlasFound');
    const words = fold(input.value).split(' ').filter(Boolean);
    if (!words.length) { out.hidden = true; out.replaceChildren(); return; }
    const hits = zoneMarkers().filter(marker => { const name = fold(marker.name); return words.every(word => name.includes(word)); });
    out.hidden = false;
    out.innerHTML = hits.length
      ? listHtml(hits.slice(0, 40), byLayer, { withLayer: true })
      : `<li class="ae-atlas-found-none">Nothing called that on the ${esc(zone.name)} map yet.</li>`;
  }
  $('#aeAtlasFind').addEventListener('input', find);
  $('#aeAtlasFind').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const first = $('#aeAtlasFound [data-goto]');
    if (first) { event.preventDefault(); goTo(first.dataset.goto); }
  });

  function counts() {
    const here = zoneMarkers();
    pins.setFound(found, hideFound);
    pins.set(zone.image ? here : []);
    for (const layer of layers.layers) {
      const mine = here.filter(marker => marker.layer === layer.id);
      const got = mine.filter(marker => found.has(marker.id)).length;
      const cell = document.querySelector(`[data-count="${CSS.escape(layer.id)}"]`);
      if (cell) { cell.textContent = got ? `${got}/${mine.length}` : String(mine.length); cell.title = got ? `${got} of ${mine.length} found` : ''; }
    }
    $('#aeAtlasHideFound').hidden = found.size === 0;
    $('#aeAtlasEmpty').hidden = here.length > 0;
    $('#aeAtlasTotal').textContent = `${here.length} marker${here.length === 1 ? '' : 's'}`;
    fillLists();
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
      /* Turned on while too far out to show: zoom in on the middle of the view until it does. */
      const min = byLayer.get(toggle.dataset.layer)?.minZoomPx;
      if (on && min && zone.image && pins.tooFar(toggle.dataset.layer)) view.zoomAt(min * 1.02 / (zone.width * view.state.scale));
      return;
    }
    const drill = event.target.closest('[data-drill]');
    if (drill) {
      const open = drill.getAttribute('aria-expanded') !== 'true';
      drill.setAttribute('aria-expanded', String(open));
      document.getElementById(drill.getAttribute('aria-controls')).hidden = !open;
      return;
    }
    const go = event.target.closest('[data-goto]');
    if (go) { goTo(go.dataset.goto); return; }
    const mark = event.target.closest('[data-found]');
    if (mark) {
      const id = mark.dataset.found;
      if (found.has(id)) found.delete(id); else found.add(id);
      saveFound(found);
      counts();
      openCard(id);
      return;
    }
    const hide = event.target.closest('#aeAtlasHideFound');
    if (hide) {
      hideFound = !hideFound;
      saveHide(hideFound);
      hide.setAttribute('aria-pressed', String(hideFound));
      pins.setFound(found, hideFound);
      return;
    }
    const pick = event.target.closest('[data-pick]');
    if (pick) { openCard(pick.dataset.pick); return; }
    const sheet = event.target.closest('#aeAtlasSheet');
    if (sheet) {
      /* From a card on its own, the handle opens the full list; otherwise it opens and closes the sheet. */
      if ($('#aeAtlasPanel').classList.contains('is-card')) { sheetOpen(true); return; }
      sheetOpen(sheet.getAttribute('aria-expanded') !== 'true');
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
