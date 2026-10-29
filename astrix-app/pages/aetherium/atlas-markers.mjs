/**
 * Atreia Atlas markers on the map (feature/aetherium-map-capture, 28 Oct 2026). Pins sit in an overlay above the base map,
 * placed in screen pixels, so an icon keeps its size at every zoom. Landmark layers (camps and villages, areas, dungeon
 * entrances: landmark in layers.json) are drawn as their in-game icon with the name under it, like the in-game map; the names
 * show once the map is drawn at least NAMES_AT_PX wide, so the whole-zone view stays readable on a phone. Only the markers it is
 * given are drawn: markers.json, plus this device's captures in capture mode.
 *
 * No number bubbles (Miguel, 29 Oct 2026): every marker is drawn as its own icon, as the in-game map does. A layer that comes
 * in big numbers (minZoomPx in layers.json, the Empyrean Traces) only shows once the map is drawn at least that wide; until
 * then its row in the panel says to zoom in. The picked marker always shows.
 */
import { esc } from './aetherium-ui.mjs';
import { markerIcon } from './atlas-card.mjs';

const DRAG_PX = 4;
/** Landmark names show under their icons once the map is drawn at least this wide, in CSS pixels, so they never pile up. */
export const NAMES_AT_PX = 1800;

export function createMarkerLayer({ overlay, view, layers }) {
  const byLayer = new Map(layers.map(layer => [layer.id, layer]));
  const pins = document.createElement('div');
  pins.className = 'ae-atlas-pins';
  overlay.replaceChildren(pins);
  let list = [];
  let shown = new Set(layers.map(layer => layer.id));
  let selected = null;
  let found = new Set();
  let hideFound = false;
  let base = null;
  let frame = 0;
  let canDrag = () => false;
  const pickListeners = new Set();
  const moveListeners = new Set();
  const zoomListeners = new Set();

  /** The map's drawn width in CSS pixels. */
  const drawnWidth = () => view.state.width * view.state.scale;
  /** Whether a layer is too dense to show at the current zoom. */
  const tooFar = layerId => { const min = byLayer.get(layerId)?.minZoomPx; return Boolean(min) && drawnWidth() < min - 0.5; };
  /** The markers to draw at the current zoom, each on its own. */
  function groups() {
    const out = [];
    for (const marker of list) {
      if (!shown.has(marker.layer)) continue;
      if (hideFound && found.has(marker.id) && marker.id !== selected) continue;
      if (marker.id !== selected && tooFar(marker.layer)) continue;
      const at = view.toView(marker.x, marker.y);
      out.push({ place: Boolean(byLayer.get(marker.layer)?.landmark), at, members: [marker] });
    }
    return out;
  }

  function draw() {
    frame = 0;
    const { tx, ty, scale } = view.state;
    base = { tx, ty, scale };
    overlay.dataset.scale = scale.toFixed(4);
    overlay.classList.toggle('is-named', view.state.width * scale >= NAMES_AT_PX);
    for (const fn of zoomListeners) fn(tooFar);
    pins.style.transform = '';
    pins.innerHTML = groups().map(group => {
      const pos = `left:${group.at.x.toFixed(1)}px;top:${group.at.y.toFixed(1)}px`;
      const marker = group.members[0];
      const layer = byLayer.get(marker.layer);
      const flags = `${marker.id === selected ? ' is-selected' : ''}${marker.captured ? ' is-captured' : ''}${marker.status === 'reported' ? ' is-reported' : ''}${found.has(marker.id) ? ' is-found' : ''}`;
      const tick = found.has(marker.id) ? '<span class="ae-atlas-tick" aria-hidden="true"></span>' : '';
      const attrs = `type="button" data-atlas-pin data-marker="${esc(marker.id)}" data-layer="${esc(marker.layer)}" style="${pos}" aria-pressed="${marker.id === selected}"`;
      if (group.place) return `<button class="ae-atlas-place${flags}" ${attrs} aria-label="${esc(marker.name)}, ${esc(layer?.label ?? marker.layer)}">${markerIcon(marker, layer, 32)}${tick}<span class="ae-atlas-place-name">${esc(marker.name)}</span></button>`;
      return `<button class="ae-atlas-pin${flags}" ${attrs} aria-label="${esc(marker.name)}, ${esc(layer?.label ?? marker.layer)}${found.has(marker.id) ? ', found' : ''}">${markerIcon(marker, layer, 34)}${tick}</button>`;
    }).join('');
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const flushNow = () => { if (frame) cancelAnimationFrame(frame); draw(); };

  /* Panning only moves the drawn pins; a zoom change groups them again. */
  view.onChange(state => {
    if (!base || Math.abs(state.scale - base.scale) > 1e-9) { redraw(); return; }
    pins.style.transform = `translate(${(state.tx - base.tx).toFixed(1)}px,${(state.ty - base.ty).toFixed(1)}px)`;
  });

  /* A press on a pin: a click picks it, a drag moves it (capture mode, this device's markers only). */
  let drag = null;
  let justDragged = false;
  pins.addEventListener('pointerdown', event => {
    const pin = event.target.closest('[data-marker]');
    if (!pin || !canDrag(pin.dataset.marker) || (event.button !== 0 && event.pointerType === 'mouse')) return;
    event.preventDefault();
    pin.setPointerCapture?.(event.pointerId);
    const box = overlay.getBoundingClientRect();
    drag = { pin, id: pin.dataset.marker, startX: event.clientX, startY: event.clientY, box, moved: false };
  });
  pins.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    drag.moved = true;
    drag.pin.classList.add('is-dragging');
    const shift = pins.style.transform.match(/-?[\d.]+/g)?.map(Number) ?? [0, 0];
    drag.pin.style.left = `${event.clientX - drag.box.left - shift[0]}px`;
    drag.pin.style.top = `${event.clientY - drag.box.top - shift[1]}px`;
  });
  const endDrag = event => {
    if (!drag) return;
    const done = drag;
    drag = null;
    if (!done.moved || event.type === 'pointercancel') { if (done.moved) draw(); return; }
    const at = view.toMap(event.clientX - done.box.left, event.clientY - done.box.top);
    const fx = Math.min(1, Math.max(0, at.fx)), fy = Math.min(1, Math.max(0, at.fy));
    /* The pins are drawn again at once, so the click that ends a drag lands on a new pin: ignore it. */
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    for (const fn of moveListeners) fn(done.id, fx, fy);
  };
  pins.addEventListener('pointerup', endDrag);
  pins.addEventListener('pointercancel', endDrag);
  pins.addEventListener('click', event => {
    const pin = event.target.closest('[data-atlas-pin]');
    if (!pin) return;
    if (justDragged) return;
    for (const fn of pickListeners) fn(pin.dataset.marker);
  });

  return {
    /** The markers to draw (already filtered to the zone). */
    set(next) { list = next; flushNow(); },
    setShown(next) { shown = new Set(next); flushNow(); },
    /** The markers this player has found, and whether to hide them. */
    setFound(next, hide) { found = new Set(next); hideFound = Boolean(hide); flushNow(); },
    /** Lights one pin and draws again at once (it shows even when its layer needs a closer zoom). */
    select(id) {
      if (id === selected) return;
      selected = id;
      flushNow();
    },
    draggable(fn) { canDrag = fn; },
    onPick: fn => pickListeners.add(fn),
    onMove: fn => moveListeners.add(fn),
    /** Called after each redraw with tooFar(layerId), so the panel can say which layers need a closer zoom. */
    onZoom: fn => zoomListeners.add(fn),
    tooFar: layerId => tooFar(layerId),
    /** Draws now (tests and the deep link wait on it). */
    flush: () => flushNow()
  };
}
