/**
 * The shared start-up of the character pages (menu, Gear, Skills, Daevanion): which Daeva, the
 * one /aion2/character call, the labelled example when the official site is down, the window bar.
 * First paint needs only that one call; each page loads anything else when it is asked for.
 */
import { ArmoryUnavailable, gearUrl, loadCharacter, refFromUrl, roster } from './aetherium-data.mjs';
import { esc, markCharacterShown, markReady, setFaction, showNotice, showSource, wireDrawer } from './aetherium-ui.mjs';

export const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

/** A padlock and the level that unlocks something, drawn over the bottom of an icon. */
export const lockBadge = level => `<span class="ae-lock" aria-hidden="true">${LOCK_ICON}<b>Lv ${esc(level)}</b></span>`;

/** The class named in the link (lets a page fetch its data while the site answers), or the roster entry for this Daeva. */
export function classHint(ref) {
  const named = new URLSearchParams(location.search).get('class');
  if (named) return named;
  const active = roster.active();
  return active && ref && String(active.serverId) === String(ref.serverId) && active.characterId === ref.characterId ? active.className : null;
}

/** The Daeva this page is about: the link, else the active roster Daeva, else none (the example). */
export function pageRef() {
  const active = roster.active();
  return refFromUrl() ?? (active ? { serverId: active.serverId, characterId: active.characterId, region: active.region } : null);
}

/**
 * Runs a character page. render({ model, source, ref }) draws the page; ref is the Daeva to link onward
 * with (null for the labelled example). prefetch(classHint, ref) may start static fetches while the site answers.
 */
export async function startCharacterPage({ prefetch = null, render }) {
  wireDrawer();
  setFaction(null);
  const ref = pageRef();
  prefetch?.(classHint(ref), ref);
  let loaded;
  try {
    loaded = await loadCharacter(ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    showNotice('The official AION 2 site is not answering right now, so this shows the ASTRIX285 example. Try again in a minute.', 'warn');
    loaded = await loadCharacter(null, { demoReason: 'unavailable' });
  }
  const { model, source } = loaded;
  setFaction(model.profile.raceName, model.profile.raceId);
  showSource(source);
  await render({ model, source, ref: source.kind === 'live' ? ref : null });
  markCharacterShown();
  markReady();
}

/** Shows the page failing to load, once, and still reports it ready so nothing waits on it. */
export function failPage(name, error) {
  showNotice(`The ${name} could not load. Refresh the page to try again.`, 'error');
  markReady();
  console.error(error);
}

/** The game-window title bar of a character page: back to the menu, the window title, who it is. */
export function windowBar({ title, model, ref }) {
  const p = model.profile;
  return `<div class="ae-gw-bar">
      <a class="ae-gw-back" href="${esc(gearUrl(ref))}"><span aria-hidden="true">‹</span> Character</a>
      <h1 class="ae-gw-title" id="aeScreenTitle">${esc(title)}</h1>
      <p class="ae-gw-who">${esc(p.name)} · ${esc(p.class)} Lv ${esc(p.level)}</p>
    </div>`;
}
