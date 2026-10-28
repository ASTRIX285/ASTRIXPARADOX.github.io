/**
 * Atreia Atlas markers on the map (feature/aetherium-map-capture, 28 Oct 2026). Pins sit in an overlay above the base map,
 * placed in screen pixels, so an icon keeps its size at every zoom. Pins closer than CLUSTER_PX on screen join into one
 * numbered cluster; zooming in splits them. Places are drawn as their name and never clustered. Only the markers it is given
 * are drawn: markers.json, plus this device's captures in capture mode.
 */
import { esc } from './aetherium-ui.mjs';
import { layerIcon } from './atlas-card.mjs';

const CLUSTER_PX = 44;
const DRAG_PX = 4;

export function createMarkerLayer({ overlay, view, layers }) {
  const byLayer = new Map(layers.map(layer => [layer.id, layer]));
  const pins = document.createElement('div');
  pins.className = 'ae-atlas-pins';
  overlay.replaceChildren(pins);
  let list = [];
  let shown = new Set(layers.map(layer => layer.id));
  let selected = null;
  let base = null;
  let frame = 0;
  let canDrag = () => false;
  const pickListeners = new Set();
  const moveListeners = new Set();

  /** Groups the visible markers by distance on screen at the current zoom. */
  function groups() {
    const out = [];
    for (const marker of list) {
      if (!shown.has(marker.layer)) continue;
      const at = view.toView(marker.x, marker.y);
      if (marker.layer === 'place') { out.push({ place: true, at, members: [marker] }); continue; }
      /* The selected marker always stands alone, so the one you picked or linked to is never hidden in a cluster. */
      if (marker.id === selected) { out.push({ solo: true, at, members: [marker] }); continue; }
      const near = out.find(group => !group.place && !group.solo && Math.hypot(group.at.x - at.x, group.at.y - at.y) < CLUSTER_PX);
      if (near) {
        near.members.push(marker);
        const n = near.members.length;
        near.at = { x: near.at.x + (at.x - near.at.x) / n, y: near.at.y + (at.y - near.at.y) / n };
      } else out.push({ at, members: [marker] });
    }
    return out;
  }

  function draw() {
    frame = 0;
    const { tx, ty, scale } = view.state;
    base = { tx, ty, scale };
    overlay.dataset.scale = scale.toFixed(4);
    pins.style.transform = '';
    pins.innerHTML = groups().map(group => {
      const pos = `left:${group.at.x.toFixed(1)}px;top:${group.at.y.toFixed(1)}px`;
      if (group.members.length > 1) {
        const ids = group.members.map(marker => marker.id).join(' ');
        return `<button class="ae-atlas-cluster" type="button" data-atlas-pin data-cluster="${esc(ids)}" style="${pos}" aria-label="${group.members.length} markers here, zoom in">${group.members.length}</button>`;
      }
      const marker = group.members[0];
      const layer = byLayer.get(marker.layer);
      const flags = `${marker.id === selected ? ' is-selected' : ''}${marker.captured ? ' is-captured' : ''}${marker.status === 'reported' ? ' is-reported' : ''}`;
      const attrs = `type="button" data-atlas-pin data-marker="${esc(marker.id)}" data-layer="${esc(marker.layer)}" style="${pos}" aria-pressed="${marker.id === selected}"`;
      if (group.place) return `<button class="ae-atlas-place${flags}" ${attrs}>${esc(marker.name)}</button>`;
      return `<button class="ae-atlas-pin${flags}" ${attrs} aria-label="${esc(marker.name)}, ${esc(layer?.label ?? marker.layer)}">${layerIcon(layer?.icon ?? marker.layer, 34)}</button>`;
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
    if (pin.dataset.cluster) {
      const members = pin.dataset.cluster.split(' ').map(id => list.find(marker => marker.id === id)).filter(Boolean);
      const zoom = view.state.scale / view.state.fit;
      if (zoom < view.maxZoom - 0.01) {
        const box = overlay.getBoundingClientRect(), r = pin.getBoundingClientRect();
        view.zoomAt(2.2, r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top);
      } else for (const fn of pickListeners) fn(null, members);
      return;
    }
    for (const fn of pickListeners) fn(pin.dataset.marker);
  });

  return {
    /** The markers to draw (already filtered to the zone). */
    set(next) { list = next; flushNow(); },
    setShown(next) { shown = new Set(next); flushNow(); },
    /** Lights one pin and draws again at once (it leaves any cluster it was in). */
    select(id) {
      if (id === selected) return;
      selected = id;
      flushNow();
    },
    draggable(fn) { canDrag = fn; },
    onPick: fn => pickListeners.add(fn),
    onMove: fn => moveListeners.add(fn),
    /** Draws now (tests and the deep link wait on it). */
    flush: () => flushNow()
  };
}
