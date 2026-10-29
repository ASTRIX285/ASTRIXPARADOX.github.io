/**
 * Atreia Atlas pan and zoom (feature/aetherium-map-foundation, 28 Oct 2026). Built by hand, no library: one stage the size
 * of the zone's base map, moved with a CSS transform inside a clipped viewport. Drag to pan, wheel or pinch to zoom, and on
 * the focused map the arrow keys pan, + and - zoom and 0 fits the whole zone. Markers sit on the stage at x and y fractions
 * of the base map. A press on a marker pin ([data-atlas-pin]) is left to the pin; a short press on the map with no drag is
 * a tap, which capture mode uses to drop a marker (feature/aetherium-map-capture).
 */
const KEY_STEP = 80;
const ZOOM_STEP = 1.4;
const MAX_ZOOM = 6;
/** And never less than three screen pixels per map pixel, so a phone can zoom in as far as a desktop (Miguel, 28 Oct 2026). */
const MAX_NATIVE = 3;

export function createAtlasView(viewport, stage) {
  const state = { width: 1, height: 1, scale: 1, tx: 0, ty: 0, fit: 1 };
  const maxScale = () => Math.max(state.fit * MAX_ZOOM, MAX_NATIVE);
  const listeners = new Set();
  const tapListeners = new Set();
  const size = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });

  function clamp() {
    const { w, h } = size();
    state.scale = Math.min(Math.max(state.scale, state.fit), maxScale());
    const sw = state.width * state.scale, sh = state.height * state.scale;
    state.tx = sw <= w ? (w - sw) / 2 : Math.min(0, Math.max(w - sw, state.tx));
    state.ty = sh <= h ? (h - sh) / 2 : Math.min(0, Math.max(h - sh, state.ty));
  }
  function apply() {
    clamp();
    stage.style.transform = `translate(${state.tx}px,${state.ty}px) scale(${state.scale})`;
    viewport.dataset.scale = state.scale.toFixed(4);
    viewport.dataset.zoom = (state.scale / state.fit).toFixed(3);
    viewport.dataset.tx = state.tx.toFixed(1);
    viewport.dataset.ty = state.ty.toFixed(1);
    for (const fn of listeners) fn(state);
  }
  function fitAll() {
    const { w, h } = size();
    state.fit = Math.min(w / state.width, h / state.height) || 1;
    state.scale = state.fit;
    state.tx = 0; state.ty = 0;
    apply();
  }
  /** Zooms by factor, keeping the point (cx, cy) in viewport pixels where it is. */
  function zoomAt(factor, cx = size().w / 2, cy = size().h / 2) {
    const before = state.scale;
    state.scale = Math.min(Math.max(before * factor, state.fit), maxScale());
    const k = state.scale / before;
    state.tx = cx - (cx - state.tx) * k;
    state.ty = cy - (cy - state.ty) * k;
    apply();
  }
  function panBy(dx, dy) { state.tx += dx; state.ty += dy; apply(); }
  /** Viewport pixels to fractions of the base map (fx, fy), and back. */
  const toMap = (x, y) => ({ fx: (x - state.tx) / (state.width * state.scale), fy: (y - state.ty) / (state.height * state.scale) });
  const toView = (fx, fy) => ({ x: state.tx + fx * state.width * state.scale, y: state.ty + fy * state.height * state.scale });
  /** Centres the map on (fx, fy) at the given zoom (1 is the whole zone). */
  function focus(fx, fy, zoom = 3) {
    const { w, h } = size();
    state.scale = state.fit * zoom;
    clamp();
    state.tx = w / 2 - fx * state.width * state.scale;
    state.ty = h / 2 - fy * state.height * state.scale;
    apply();
  }

  /* Mouse, pen and touch: one pointer pans, two pinch. */
  const pointers = new Map();
  let pinch = null;
  let tap = null;
  const local = event => { const box = viewport.getBoundingClientRect(); return { x: event.clientX - box.left - viewport.clientLeft, y: event.clientY - box.top - viewport.clientTop }; };
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (event.target.closest?.('[data-atlas-pin]')) return;
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, local(event));
    tap = pointers.size === 1 ? { ...local(event), id: event.pointerId } : null;
    viewport.classList.add('is-dragging');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const prev = pointers.get(event.pointerId), next = local(event);
    pointers.set(event.pointerId, next);
    if (tap && Math.hypot(next.x - tap.x, next.y - tap.y) > 6) tap = null;
    if (pointers.size === 1) { panBy(next.x - prev.x, next.y - prev.y); return; }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt(distance / pinch.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.distance = distance;
    }
  });
  const release = event => {
    if (event.type === 'pointerup' && tap && tap.id === event.pointerId && pointers.size === 1) {
      const at = { x: tap.x, y: tap.y };
      for (const fn of tapListeners) fn({ ...at, ...toMap(at.x, at.y) });
    }
    if (pointers.size <= 1) tap = null;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) viewport.classList.remove('is-dragging');
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const at = local(event);
    zoomAt(Math.exp(-event.deltaY * 0.0015), at.x, at.y);
  }, { passive: false });
  viewport.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    if (moves[event.key]) { event.preventDefault(); panBy(...moves[event.key]); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(ZOOM_STEP); return; }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomAt(1 / ZOOM_STEP); return; }
    if (event.key === '0') { event.preventDefault(); fitAll(); }
  });
  if (typeof ResizeObserver === 'function') {
    let last = '';
    new ResizeObserver(() => {
      const { w, h } = size();
      const key = `${w}x${h}`;
      if (key === last) return;
      last = key;
      const zoom = state.scale / state.fit;
      state.fit = Math.min(w / state.width, h / state.height) || 1;
      state.scale = state.fit * zoom;
      apply();
    }).observe(viewport);
  }

  return {
    state,
    /** Sets the zone's base map size in pixels and fits it to the viewport. */
    load(width, height) {
      state.width = width; state.height = height;
      stage.style.width = `${width}px`; stage.style.height = `${height}px`;
      fitAll();
    },
    zoomIn: () => zoomAt(ZOOM_STEP),
    zoomAt,
    focus,
    toMap,
    toView,
    get maxZoom() { return maxScale() / state.fit; },
    zoomOut: () => zoomAt(1 / ZOOM_STEP),
    fit: fitAll,
    panBy,
    onChange: fn => listeners.add(fn),
    onTap: fn => tapListeners.add(fn)
  };
}
