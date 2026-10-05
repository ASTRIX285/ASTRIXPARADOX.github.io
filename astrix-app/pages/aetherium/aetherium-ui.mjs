/** Shared page helpers for The Aetherium: escaping, faction theme, notices, menu drawer, readiness. */
import { factionOf, sourceLabel } from './aetherium-data.mjs';

export const $ = (selector, root = document) => root.querySelector(selector);

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const number = value => (Number.isFinite(value) ? value.toLocaleString('en-GB') : '-');

export const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);

/** "MainHand" to "Main Hand": the armory's own slot name, spaced for reading. */
export const slotLabel = name => String(name).replace(/([a-z])([A-Z])/g, '$1 $2');

/** An NCSOFT CDN icon (never re-hosted), or an empty frame when the armory sent none. */
export const iconImg = (src, alt = '', size = 48) => src
  ? `<img class="ae-icon" src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : `<span class="ae-icon ae-icon-empty" aria-hidden="true"></span>`;

/** Page accent from the active character's faction: Elyos, Asmodian, or ASTRIX before one loads. */
export function setFaction(raceName) {
  document.body.dataset.faction = raceName ? factionOf(raceName) : 'astrix';
}

export function showSource(source) {
  const el = $('#aeSource');
  if (!el) return;
  el.hidden = false;
  el.dataset.kind = source.kind;
  el.textContent = sourceLabel(source);
}

export function showNotice(message, tone = 'info') {
  const el = $('#aeNotice');
  if (!el) return;
  el.hidden = !message;
  el.dataset.tone = tone;
  el.textContent = message ?? '';
}

/** Marks the moment character data is on screen (the second load time the perf report reads). */
export function markCharacterShown() {
  if (window.__aeCharacterShown) return;
  window.__aeCharacterShown = performance.now();
  performance.mark?.('aetherium-character');
}

let ready = false;
/** Reports the page as usable once, the same signal the tool transitions and perf tools read. */
export function markReady() {
  if (ready) return;
  ready = true;
  $('main')?.setAttribute('aria-busy', 'false');
  document.documentElement.dataset.aetheriumReady = 'true';
  window.__axUsable = performance.now();
  performance.mark?.('aetherium-ready');
  document.dispatchEvent(new CustomEvent('forge:portal-ready'));
}

/** Keeps the fixed ribbon and the page content clear of the header at every width (the shell reads --ax-shell-top). */
function trackHeader() {
  const header = $('header.apx-destination-header');
  if (!header) return;
  const apply = () => document.documentElement.style.setProperty('--ax-shell-top', `${header.offsetHeight}px`);
  apply();
  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(header);
}

export function wireDrawer() {
  trackHeader();
  const menu = $('#aeMenu');
  const drawer = $('#aeDrawer');
  if (!menu || !drawer) return;
  const panel = drawer.querySelector('.ax-drawer-panel');
  const focusable = () => [...panel.querySelectorAll('a,button')];
  const setOpen = open => {
    if (open === !drawer.hidden) return;
    menu.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('ax-drawer-open', open);
    if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('is-open')); (panel.querySelector('[aria-current="page"]') ?? focusable()[0])?.focus(); }
    else { drawer.classList.remove('is-open'); drawer.hidden = true; menu.focus(); }
  };
  menu.addEventListener('click', () => setOpen(drawer.hidden));
  drawer.addEventListener('click', event => { if (event.target.closest('[data-drawer-close],.ax-drawer-links a')) setOpen(false); });
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  });
}
