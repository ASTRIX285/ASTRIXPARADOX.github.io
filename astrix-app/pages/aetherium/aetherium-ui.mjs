/** Shared page helpers for The Aetherium: escaping, faction theme, notices, menu drawer, readiness. */
import { factionOf, sourceLabel } from './aetherium-data.mjs';

export const $ = (selector, root = document) => root.querySelector(selector);

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const number = value => (Number.isFinite(value) ? value.toLocaleString('en-GB') : '-');

export const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);

/**
 * A slot name in plain words: "MainHand" to "Main Hand", and the site's raw codes for slots it lists only when
 * worn ("EARRING1", "RING2", "BRACELET1") to "Earring 1", "Ring 2", "Bracelet 1".
 */
export function slotLabel(name) {
  const raw = String(name ?? '');
  if (/^[A-Z0-9_ ]+$/.test(raw) && /[A-Z]{2}/.test(raw)) {
    return raw.toLowerCase().replace(/_/g, ' ').replace(/([a-z])(\d+)$/, '$1 $2').replace(/\b[a-z]/g, c => c.toUpperCase());
  }
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/* Game order for the slots the site lists only when worn: necklace, earrings, rings, bracelets, belt, cape. Others keep the site's order after these. */
const SLOT_ORDER = ['NECKLACE', 'AMULET', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'BELT', 'CAPE', 'CLOAK'];
export function slotRank(name) {
  const index = SLOT_ORDER.indexOf(String(name ?? '').toUpperCase().replace(/[\s_]/g, ''));
  return index < 0 ? SLOT_ORDER.length : index;
}

/** An NCSOFT CDN icon (never re-hosted), or an empty frame when the site sent none. */
export const iconImg = (src, alt = '', size = 48) => src
  ? `<img class="ae-icon" src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : `<span class="ae-icon ae-icon-empty" aria-hidden="true"></span>`;

/** Page accent from the active character's faction: Elyos, Asmodian, or ASTRIX before one loads. */
export function setFaction(raceName, raceId = null) {
  document.body.dataset.faction = raceName || raceId ? factionOf(raceName, raceId) : 'astrix';
}

export function showSource(source) {
  const el = $('#aeSource');
  if (!el) return;
  el.hidden = false;
  el.dataset.kind = source.kind;
  el.textContent = sourceLabel(source);
}

/**
 * The page notice. With retry (a function) a "Try again" button sits under the words, in the same box;
 * the button row is its own element so the notice text stays plain.
 */
export function showNotice(message, tone = 'info', { retry = null } = {}) {
  const el = $('#aeNotice');
  if (!el) return;
  el.hidden = !message;
  el.dataset.tone = tone;
  el.textContent = message ?? '';
  let row = $('#aeRetry');
  if (!row && retry) {
    row = document.createElement('p');
    row.id = 'aeRetry';
    row.className = 'ae-retry';
    row.innerHTML = '<button type="button" class="ae-retry-btn" data-retry>Try again</button>';
    el.after(row);
  }
  if (!row) return;
  row.hidden = !(message && retry);
  row.dataset.tone = tone;
  row.querySelector('[data-retry]').onclick = retry ? () => { showNotice(''); retry(); } : null;
}

/** One official intro image (NCSOFT CDN only, checked by the data layer). Lazy by default: the art never holds up the words. */
export const introArtImg = (entry, { width = 320, height = 400, lazy = true, className = 'ae-art' } = {}) => entry
  ? `<img class="${className}" src="${esc(entry.url)}" alt="${esc(entry.alt)}" width="${entry.width ?? width}" height="${entry.height ?? height}"${lazy ? ' loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`
  : '';

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

/* The info card (like the game's tooltip) and the hover name label, shared by every Aetherium page. */
export function infoCardHtml({ icon, title, sub, level = null, status = null, chips = [], lines = [], body = '', grade = null, titleId = 'aeInfoTitle' }) {
  return `<div class="ae-card-head"${grade ? ` data-grade="${esc(String(grade).toLowerCase())}"` : ''}>
      <span class="ae-card-icon">${icon ? `<img src="${esc(icon)}" alt="" width="64" height="64" decoding="async" referrerpolicy="no-referrer">` : ''}</span>
      <div><h3${titleId ? ` id="${titleId}"` : ''}>${esc(title)}${level !== null ? ` <span>Lv. ${esc(level)}</span>` : ''}</h3><p>${esc(sub)}</p></div>
    </div>
    ${status ? `<p class="ae-card-status is-${status[0]}">${esc(status[1])}</p>` : ''}
    ${chips.length ? `<ul class="ae-card-chips">${chips.filter(Boolean).map(chip => `<li>${esc(chip)}</li>`).join('')}</ul>` : ''}
    ${lines.filter(Boolean).map(line => `<p class="ae-card-line">${esc(line)}</p>`).join('')}
    ${body}`;
}
let infoReturn = null;
export function openInfo(html, from) {
  let box = $('#aeInfo');
  if (!box) {
    box = document.createElement('div');
    box.id = 'aeInfo';
    box.className = 'ae-info';
    box.innerHTML = '<div class="ae-info-backdrop" data-info-close></div><div class="ae-info-card" role="dialog" aria-modal="true" aria-labelledby="aeInfoTitle" tabindex="-1"><span class="ae-info-close" role="button" tabindex="0" data-info-close aria-label="Close">×</span><div id="aeInfoBody"></div></div>';
    document.body.append(box);
    box.addEventListener('click', event => { if (event.target.closest('[data-info-close]')) closeInfo(); });
    document.addEventListener('keydown', event => {
      if (box.hidden) return;
      if (event.key === 'Escape' || ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('[data-info-close]'))) { event.preventDefault(); closeInfo(); }
    });
  }
  $('#aeInfoBody').innerHTML = html;
  box.hidden = false;
  infoReturn = from ?? null;
  box.querySelector('.ae-info-card').focus();
}
export function closeInfo() {
  const box = $('#aeInfo');
  if (!box || box.hidden) return;
  box.hidden = true;
  infoReturn?.focus?.();
}
// One floating name label for every [data-tip] tile (mouse hover or keyboard focus).
function showTip(el) {
  let tip = $('#aeTip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'aeTip'; tip.className = 'ae-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(6, Math.min(innerWidth - t.width - 6, r.left + r.width / 2 - t.width / 2))}px`;
  tip.style.top = `${r.top - t.height - 8 < 4 ? r.bottom + 8 : r.top - t.height - 8}px`;
}
function hideTip() { const tip = $('#aeTip'); if (tip) tip.hidden = true; }
document.addEventListener('pointerover', event => { const el = event.target.closest?.('[data-tip]'); if (el && event.pointerType === 'mouse') showTip(el); });
document.addEventListener('pointerout', event => { if (event.target.closest?.('[data-tip]')) hideTip(); });
document.addEventListener('focusin', event => { const el = event.target.closest?.('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { passive: true });
/**
 * A game-style hover card for icons that have a card of their own (skills, stigmas). Elements opt in with
 * data-hover; htmlFor(element) returns the card body (infoCardHtml with titleId: null) or nothing.
 * Shows on mouse hover and keyboard focus, never on touch: there a tap selects the icon instead.
 */
let hoverBox = null;
export function wireHoverCards(root, htmlFor) {
  const hide = () => { if (hoverBox) hoverBox.hidden = true; };
  const show = el => {
    const html = htmlFor(el);
    if (!html) { hide(); return; }
    if (!hoverBox) {
      hoverBox = document.createElement('div');
      hoverBox.id = 'aeHover';
      hoverBox.className = 'ae-hover';
      hoverBox.setAttribute('role', 'tooltip');
      document.body.append(hoverBox);
    }
    hoverBox.innerHTML = html;
    hoverBox.hidden = false;
    const r = el.getBoundingClientRect(), b = hoverBox.getBoundingClientRect();
    // Under the icon, or above it when there is no room below; failing both, kept inside the screen.
    const below = r.bottom + 8, above = r.top - b.height - 8;
    const top = below + b.height <= innerHeight - 6 ? below : above >= 6 ? above : below;
    hoverBox.style.left = `${Math.max(6, Math.min(innerWidth - b.width - 6, r.left + r.width / 2 - b.width / 2))}px`;
    hoverBox.style.top = `${Math.max(6, Math.min(innerHeight - b.height - 6, top))}px`;
  };
  root.addEventListener('pointerover', event => { const el = event.target.closest?.('[data-hover]'); if (el && event.pointerType === 'mouse') show(el); });
  root.addEventListener('pointerout', event => { if (event.target.closest?.('[data-hover]')) hide(); });
  // Keyboard focus only: a tap on a phone also focuses the icon, and there a tap just selects.
  root.addEventListener('focusin', event => { const el = event.target.closest?.('[data-hover]'); if (el?.matches(':focus-visible')) show(el); });
  root.addEventListener('focusout', hide);
  addEventListener('scroll', hide, { passive: true });
}
// A card icon that fails to load drops away and leaves the empty frame.
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.closest('#aeInfo .ae-card-icon,#aeInfo .ae-perk,#aeHover .ae-card-icon,#aeHover .ae-perk')) event.target.remove();
}, true);
