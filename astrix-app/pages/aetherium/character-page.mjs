/**
 * The shared start-up of the character pages (menu, Gear, Skills, Daevanion): which Daeva, the
 * one /aion2/character call, the window bar. With no Daeva the page says "Find your Daeva first" and
 * points at the search. A read that fails says why and offers Try again; nothing stands in for the character.
 * First paint needs only that one call; each page loads anything else when it is asked for.
 */
import { ArmoryUnavailable, explain, gearUrl, loadCharacter, loadIntroArt, refFromUrl, roster } from './aetherium-data.mjs';
import { $, esc, introArtImg, markCharacterShown, markReady, setFaction, showNotice, showSource, wireDrawer } from './aetherium-ui.mjs';

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

/** The Daeva this page is about: the link, else the active roster Daeva, else none. */
export function pageRef() {
  const active = roster.active();
  return refFromUrl() ?? (active ? { serverId: active.serverId, characterId: active.characterId, region: active.region } : null);
}

/** The "Find your Daeva first" panel: a short word from the guide and the way to the search. */
export function findFirstHtml() {
  return `<section class="ae-panel ae-find-first" id="aeFindFirst" aria-labelledby="aeFindFirstTitle">
      <span class="ae-find-first-art" id="aeFindFirstArt" hidden></span>
      <div class="ae-find-first-body">
        <p class="ae-eyebrow">Your guide</p>
        <h1 id="aeFindFirstTitle">Find your Daeva first</h1>
        <p>Type your in-game character name on the Daeva Card. This page then fills in with that Daeva's gear, skills and Daevanion boards.</p>
        <a class="btn ae-primary" href="/hub/aetherium/#aeSearch">Find your Daeva</a>
      </div>
    </section>`;
}

/** Shows the Find-your-Daeva panel in the page's stage. The guide's art joins it once the art data is in, never before the words. */
export function showFindFirst() {
  const stage = $('#aeStage') ?? $('#aeHeader');
  if (!stage) return;
  stage.innerHTML = findFirstHtml();
  stage.classList.add('is-find-first'); // the menu page's header box drops its rule and padding
  const cards = $('#aeCards');
  if (cards) { cards.innerHTML = ''; cards.hidden = true; }
  loadIntroArt().then(art => {
    const holder = $('#aeFindFirstArt');
    if (!art.npc || !holder) return;
    holder.innerHTML = introArtImg(art.npc, { width: 160, height: 200 });
    holder.hidden = false;
    $('#aeFindFirst')?.classList.add('has-art');
  });
}

/**
 * Runs a character page. render({ model, source, ref }) draws the page; ref is the Daeva to link onward with.
 * prefetch(classHint, ref) may start static fetches while the site answers.
 */
export async function startCharacterPage({ prefetch = null, render }) {
  wireDrawer();
  setFaction(null);
  const ref = pageRef();
  if (!ref) {
    showFindFirst();
    markReady();
    return;
  }
  prefetch?.(classHint(ref), ref);
  const attempt = async () => {
    let loaded;
    try {
      loaded = await loadCharacter(ref);
    } catch (error) {
      if (!(error instanceof ArmoryUnavailable)) throw error;
      // Nothing is on screen yet, so the page shows the way to the search and a Try again.
      showNotice(explain(error), 'warn', { retry: () => attempt().catch(failure => failPage('page', failure)) });
      showFindFirst();
      return;
    }
    const { model, source } = loaded;
    const cards = $('#aeCards');
    if (cards) cards.hidden = false;
    ($('#aeStage') ?? $('#aeHeader'))?.classList.remove('is-find-first');
    setFaction(model.profile.raceName, model.profile.raceId);
    showSource(source);
    await render({ model, source, ref });
    markCharacterShown();
  };
  await attempt();
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
