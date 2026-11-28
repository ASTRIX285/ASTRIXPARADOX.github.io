/**
 * The Aetherium as an installed app (feature/aetherium-pwa, 26 Nov 2026). Loaded by aetherium-ui.mjs once the page is up
 * and the browser is idle, never before the first screen.
 *
 *   start()  registers the service worker (scope /hub/aetherium/ only), shows Update ready when a new version is
 *            waiting, puts "Install app" in the menu when the browser says the app can be installed, and on iPhone and
 *            iPad puts the steps for that browser there instead (feature/aetherium-install-card, 28 Nov 2026).
 *            From a player's second visit, one small card says the app can be installed. Closed once, it never returns.
 *
 * A new version never takes over a page by itself: it waits until the player taps Update ready, then the page reloads.
 */
export const SW_URL = '/hub/aetherium/sw.js';
export const SW_SCOPE = '/hub/aetherium/';

let started = false;
let reloadWanted = false;

export function start() {
  if (started) return;
  started = true;
  window.__aeAppStarted = true;
  wireInstall();
  wireInstallCard();
  if (!('serviceWorker' in navigator) || !location.pathname.startsWith(SW_SCOPE)) return;
  navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: 'none' }).then(watchUpdates).catch(() => {
    /* no service worker (private mode, blocked storage): the page keeps working online */
  });
}

function watchUpdates(registration) {
  const offer = worker => { if (worker && navigator.serviceWorker.controller) showUpdate(worker); };
  offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(worker); });
  });
  // Reload only when the player asked for the new version here. A version started from another tab never reloads this page.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadWanted) return;
    reloadWanted = false;
    location.reload();
  });
}

/*
 * Update ready sits in the header beside the menu button. On a phone the words give way to the icon (the label stays
 * for screen readers), so the button never runs past the header at any width from 320 px.
 */
const UPDATE_ICON = '<svg class="ae-update-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
export function showUpdate(worker) {
  let button = document.getElementById('aeUpdate');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'aeUpdate';
    button.className = 'ae-update-btn';
    button.innerHTML = `${UPDATE_ICON}<span class="ae-update-label">Update ready</span>`;
    button.title = 'A new version of The Aetherium is ready. Tap to reload.';
    const actions = document.querySelector('header.apx-destination-header .ax-shell-actions');
    if (actions) actions.prepend(button); else document.body.prepend(button);
  }
  button.hidden = false;
  button.disabled = false;
  button.onclick = () => {
    reloadWanted = true;
    button.disabled = true;
    worker.postMessage({ type: 'aetherium:update' });
  };
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/*
 * iPhone and iPad have no install offer, so each browser gets its own steps. iPadOS Safari reports itself as a Mac:
 * a Mac with a touch screen is an iPad. A browser not listed here (Opera, DuckDuckGo, the Google app, apps that open
 * links inside themselves) is sent to Safari, which can always add the page.
 */
export const IOS_HINTS = Object.freeze({
  safari: 'Tap Share, then Add to Home Screen.',
  chrome: 'Tap the share icon in the address bar, then Add to Home Screen.',
  firefox: 'Tap the share icon in the address bar, then Add to Home Screen.',
  edge: 'Tap the menu button at the bottom, then Share, then Add to Home Screen.',
  other: 'Open this page in Safari to add it to your Home Screen.'
});
export function iosBrowser(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0) {
  const apple = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (!apple) return null;
  if (/CriOS\//.test(ua)) return 'chrome';
  if (/EdgiOS\//.test(ua)) return 'edge';
  if (/FxiOS\//.test(ua)) return 'firefox';
  if (/OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|Instagram|Twitter|LinkedInApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/.test(ua)) return 'other';
  return /Version\/[\d.]+.*Safari\//.test(ua) ? 'safari' : 'other';
}
export const installHint = (ua, touchPoints) => { const browser = iosBrowser(ua, touchPoints); return browser ? IOS_HINTS[browser] : null; };

/* Install app in the menu: the browser's own install offer, or on iPhone and iPad the steps for that browser. */
function wireInstall() {
  const links = document.querySelector('#aeDrawer .ax-drawer-links');
  if (!links || standalone() || document.getElementById('aeInstall')) return;
  const box = document.createElement('div');
  box.className = 'ae-app-install';
  box.id = 'aeInstall';
  box.hidden = true;
  links.after(box);
  const hint = installHint();
  if (hint) {
    box.innerHTML = `<p class="ae-app-label">Install app</p><p class="ae-app-hint">${hint}</p>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = '<button type="button" class="ae-app-install-btn" id="aeInstallBtn">Install app</button>';
  const sync = () => { box.hidden = !window.__aeInstallPrompt; };
  sync();
  document.addEventListener('aetherium:installable', sync);
  window.addEventListener('appinstalled', () => { window.__aeInstallPrompt = null; sync(); });
  box.querySelector('button').addEventListener('click', askBrowser);
}

async function askBrowser() {
  const offer = window.__aeInstallPrompt;
  if (!offer) return;
  window.__aeInstallPrompt = null;
  document.dispatchEvent(new CustomEvent('aetherium:installable'));
  await offer.prompt();
  try { await offer.userChoice; } catch { /* the browser closed its own dialog */ }
}

/*
 * The install card. Visits are counted once per browser session on this device; the card shows from the second one,
 * never on the first, never in the installed app, and never again once closed. If this device's storage cannot be
 * read or written, the card counts as closed, so it can never come back on every visit.
 */
export const INSTALL_KEY = 'aetherium.install.v1';
const SESSION_KEY = 'aetherium.install.session';
function readInstallState() {
  try {
    const state = JSON.parse(localStorage.getItem(INSTALL_KEY) ?? '{}') ?? {};
    if (!sessionStorage.getItem(SESSION_KEY)) {
      state.visits = (Number(state.visits) || 0) + 1;
      localStorage.setItem(INSTALL_KEY, JSON.stringify(state));
      sessionStorage.setItem(SESSION_KEY, '1');
    }
    return state;
  } catch {
    return { closed: true };
  }
}
function closeForGood() {
  try {
    const state = JSON.parse(localStorage.getItem(INSTALL_KEY) ?? '{}') ?? {};
    state.closed = true;
    localStorage.setItem(INSTALL_KEY, JSON.stringify(state));
  } catch { /* nothing to remember with: the card is already gone for this page */ }
  document.getElementById('aeInstallCard')?.remove();
}

function wireInstallCard() {
  if (standalone()) return;
  const state = readInstallState();
  if (state.closed || !(Number(state.visits) >= 2)) return;
  window.addEventListener('appinstalled', closeForGood);
  const hint = installHint();
  if (hint) { placeCard(hint); return; }
  // Android and desktop: only once the browser offers its own install prompt.
  const tryOffer = () => { if (window.__aeInstallPrompt) placeCard(null); else document.getElementById('aeInstallCard')?.remove(); };
  tryOffer();
  document.addEventListener('aetherium:installable', tryOffer);
}

/*
 * The card sits in the page's own flow, under the search on the Daeva Card and at the end of the page elsewhere, so
 * it covers nothing. It is only put in while that spot is below the screen, so nothing the player can see moves.
 */
function placeCard(hint) {
  if (document.getElementById('aeInstallCard')) return;
  const main = document.getElementById('aeMain') ?? document.querySelector('main');
  if (!main) return;
  const search = main.querySelector(':scope>.ae-search');
  const before = search ? search.nextElementSibling : null;
  // The first thing that would move down: the next element on screen after the spot, or else the footer.
  let next = before;
  while (next && !next.getClientRects().length) next = next.nextElementSibling;
  const moved = next ?? main.nextElementSibling;
  if (moved && moved.getBoundingClientRect().top < innerHeight) return;
  const card = document.createElement('aside');
  card.className = 'ae-install-card';
  card.id = 'aeInstallCard';
  card.setAttribute('aria-labelledby', 'aeInstallCardTitle');
  card.innerHTML = `<div class="ae-install-copy"><p class="ae-install-title" id="aeInstallCardTitle">Use The Aetherium like an app.</p>
      <p class="ae-install-lead">Add it to your Home Screen.</p>
      ${hint ? `<p class="ae-install-steps" id="aeInstallSteps" hidden>${hint}</p>` : ''}</div>
    <button type="button" class="ae-install-show" data-install-show${hint ? ' aria-expanded="false" aria-controls="aeInstallSteps"' : ''}>Show me</button>
    <button type="button" class="ax-icon-btn ae-install-close" data-install-close aria-label="Close and don't show again"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  if (before) main.insertBefore(card, before); else main.append(card);
  card.querySelector('[data-install-close]').addEventListener('click', closeForGood);
  card.querySelector('[data-install-show]').addEventListener('click', event => {
    if (!hint) { card.remove(); askBrowser(); return; }
    const steps = card.querySelector('#aeInstallSteps');
    steps.hidden = !steps.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!steps.hidden));
  });
}
