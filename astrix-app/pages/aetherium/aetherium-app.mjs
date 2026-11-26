/**
 * The Aetherium as an installed app (feature/aetherium-pwa, 26 Nov 2026). Loaded by aetherium-ui.mjs once the page is up
 * and the browser is idle, never before the first screen.
 *
 *   start()  registers the service worker (scope /hub/aetherium/ only), shows "Update ready" when a new version is
 *            waiting, and puts "Install app" in the menu when the browser says the app can be installed. On iPhone
 *            Safari, where there is no install offer, the menu shows one line on how to add it instead.
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

function showUpdate(worker) {
  let button = document.getElementById('aeUpdate');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'aeUpdate';
    button.className = 'ae-update-btn';
    button.textContent = 'Update ready';
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
/** iPhone Safari only: Chrome, Firefox, Edge and other apps on iPhone have their own menus. */
export const isIphoneSafari = (ua = navigator.userAgent) => /iPhone|iPod/.test(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo/.test(ua);

function wireInstall() {
  const links = document.querySelector('#aeDrawer .ax-drawer-links');
  if (!links || standalone() || document.getElementById('aeInstall')) return;
  const box = document.createElement('div');
  box.className = 'ae-app-install';
  box.id = 'aeInstall';
  box.hidden = true;
  links.after(box);
  if (isIphoneSafari()) {
    box.innerHTML = '<p class="ae-app-hint">On iPhone: tap Share, then Add to Home Screen.</p>';
    box.hidden = false;
    return;
  }
  box.innerHTML = '<button type="button" class="ae-app-install-btn" id="aeInstallBtn">Install app</button>';
  const sync = () => { box.hidden = !window.__aeInstallPrompt; };
  sync();
  document.addEventListener('aetherium:installable', sync);
  window.addEventListener('appinstalled', () => { window.__aeInstallPrompt = null; sync(); });
  box.querySelector('button').addEventListener('click', async () => {
    const offer = window.__aeInstallPrompt;
    if (!offer) return;
    window.__aeInstallPrompt = null;
    sync();
    await offer.prompt();
    try { await offer.userChoice; } catch { /* the browser closed its own dialog */ }
  });
}
