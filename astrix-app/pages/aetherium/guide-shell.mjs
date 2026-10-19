/**
 * The Guide shell (The Aetherium's AION 2 Guide, feature/aetherium-guide-home, 18 Oct 2026). Every Guide page draws
 * through here, so phases 2 to 5 plug in without touching the frame.
 *
 * Contract (keep it stable, the later phases build on it):
 *   GUIDE_SECTIONS        the eight sections in nav order: { id, label, href, blurb, topics, built }. A phase that builds a
 *                         section flips its built flag and replaces that section's "coming soon" page.
 *   GUIDE_CLASSES         the eight classes in the game's order (the same list as AION2_CLASSES in ascent-advisor.mjs,
 *                         kept here so the light pages need not load the advisor; the Guide test checks they match).
 *   guideHref(id)         a section's address (/hub/aetherium/guide/<id>/, home for 'home').
 *   classHref(className)  a class page's address (/hub/aetherium/guide/classes/<class>/).
 *   renderGuideShell({ section, title, crumbs, lede })
 *                         draws the Guide window into #aeStage: the title bar, the breadcrumb, the section nav with
 *                         the current section lit, and an empty body. Returns the body element for the page to fill.
 *                         crumbs: [{ label, href }] after "Guide"; the last crumb is the page itself (no href needed).
 *   comingSoonHtml(id)    the short "coming soon in this guide" body for a section not built yet.
 *   startGuidePage(fill)  wires the menu drawer, takes the faction colour from the linked Daeva (aetherium-memory.mjs),
 *                         runs fill(linked) (may be async; linked is linkedDaeva() or null) and reports the page ready
 *                         once, even on failure.
 */
import { $, esc, markReady, setFaction, showNotice, wireDrawer } from './aetherium-ui.mjs';
import { linkedDaeva } from './aetherium-memory.mjs';

export const GUIDE_ROOT = '/hub/aetherium/guide/';

export const GUIDE_SECTIONS = Object.freeze([
  { id: 'home', label: 'Home', href: GUIDE_ROOT, blurb: 'Start here: what the Guide covers and where to go next.', topics: [], built: true },
  { id: 'general', label: 'General', href: `${GUIDE_ROOT}general/`, blurb: 'The game, the two factions, Season 1, reset times, Membership and the Market, controls and the FAQ.', topics: ['About AION 2', 'Factions', 'Season 1', 'Reset times', 'Membership and Market', 'Controls', 'FAQ'], built: true },
  { id: 'character', label: 'Character', href: `${GUIDE_ROOT}character/`, blurb: 'The eight classes and their roles, stats, Daevanion boards, stigmas and builds.', topics: ['Classes', 'Stats', 'Daevanion', 'Stigmas', 'Builds'], built: true },
  { id: 'skills', label: 'Skills', href: `${GUIDE_ROOT}skills/`, blurb: 'Every class skill, Mastery, Specialty picks and the skill bar.', topics: ['Skills by class', 'Mastery', 'Specialty picks', 'Skill bar and macro'], built: true },
  { id: 'equipment', label: 'Equipment', href: `${GUIDE_ROOT}equipment/`, blurb: 'Gear slots and grades, Enhancement, Manastones, Theostones, Arcana, pets, wings and titles.', topics: ['Slots and grades', 'Enhancement', 'Manastones', 'Theostones', 'Arcana', 'Pets and wings', 'Titles'], built: true },
  { id: 'crafting', label: 'Crafting', href: `${GUIDE_ROOT}crafting/`, blurb: 'The five professions, gathering and the crafted gear ladder.', topics: ['Professions', 'Gathering', 'Crafted gear'], built: true },
  { id: 'world', label: 'World', href: `${GUIDE_ROOT}world/`, blurb: 'Zones, Sealed Dungeons and Strongholds, the Abyss and events.', topics: ['Zones', 'Sealed Dungeons and Strongholds', 'The Abyss', 'Events'], built: false },
  { id: 'guides', label: 'Guides', href: `${GUIDE_ROOT}guides/`, blurb: 'Your path by level, new player help, dungeons, the Lv 45 weekly loop and the endgame.', topics: ['Your path by level', 'New player help', 'Dungeons', 'Lv 45 weekly loop', 'Endgame'], built: false }
]);

export const GUIDE_CLASSES = Object.freeze(['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter']);

const sectionOf = id => GUIDE_SECTIONS.find(item => item.id === id) ?? GUIDE_SECTIONS[0];

export const guideHref = id => sectionOf(id).href;

export const classHref = className => `${GUIDE_ROOT}classes/${String(className).toLowerCase()}/`;

/** The breadcrumb: Guide, then each crumb. The last one is the page itself. */
function crumbsHtml(crumbs) {
  const all = [{ label: 'Guide', href: GUIDE_ROOT }, ...crumbs];
  return `<nav class="ae-gd-crumbs" aria-label="Breadcrumb"><ol>${all.map((crumb, index) => {
    const last = index === all.length - 1;
    return `<li>${last || !crumb.href ? `<span${last ? ' aria-current="page"' : ''}>${esc(crumb.label)}</span>` : `<a href="${esc(crumb.href)}">${esc(crumb.label)}</a>`}</li>`;
  }).join('')}</ol></nav>`;
}

/** The section nav: every section, the current one lit (gold, aria-current). Sections not built yet still lead somewhere. */
function navHtml(current) {
  return `<nav class="ae-gd-nav" aria-label="Guide sections"><ul>${GUIDE_SECTIONS.map(item => `<li><a class="ae-btn" href="${esc(item.href)}" data-guide-section="${esc(item.id)}"${item.id === current ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`).join('')}</ul></nav>`;
}

export function renderGuideShell({ section = 'home', title, crumbs = [], lede = null } = {}) {
  const stage = $('#aeStage');
  const current = sectionOf(section).id;
  stage.innerHTML = `<section class="ae-gw ae-gd" data-guide-shell="${esc(current)}" aria-labelledby="aeScreenTitle">
      <div class="ae-gw-bar">
        <a class="ae-gw-back" href="${esc(current === 'home' && !crumbs.length ? '/hub/aetherium/' : GUIDE_ROOT)}"><span aria-hidden="true">‹</span> ${current === 'home' && !crumbs.length ? 'Daeva Card' : 'Guide home'}</a>
        <h1 class="ae-gw-title" id="aeScreenTitle">${esc(title)}</h1>
        <p class="ae-gw-who">AION 2 Guide</p>
      </div>
      ${crumbsHtml(crumbs.length ? crumbs : [{ label: 'Home' }])}
      ${navHtml(current)}
      <div class="ae-gw-body ae-gd-body" id="aeGuideBody">${lede ? `<p class="ae-gd-lede">${esc(lede)}</p>` : ''}</div>
    </section>`;
  return $('#aeGuideBody');
}

/** A section that is not written yet: what it will hold, and the way back. */
export function comingSoonHtml(id) {
  const item = sectionOf(id);
  return `<section class="ae-gd-soon" data-guide-soon="${esc(item.id)}" aria-labelledby="aeSoonTitle">
      <h2 id="aeSoonTitle">Coming soon in this guide</h2>
      <p>${esc(item.blurb)} This part of the Guide is being written now.</p>
      ${item.topics.length ? `<ul class="ae-coming-list">${item.topics.map(topic => `<li>${esc(topic)}</li>`).join('')}</ul>` : ''}
      <p><a class="ae-btn" href="${GUIDE_ROOT}">Back to the Guide home</a></p>
    </section>`;
}

let started = false;
export async function startGuidePage(fill) {
  if (started) return;
  started = true;
  wireDrawer();
  const linked = linkedDaeva();
  setFaction(linked?.entry?.raceName ?? null, linked?.entry?.raceId ?? null);
  try {
    await fill(linked);
  } catch (error) {
    showNotice('This part of the Guide could not load. Refresh the page to try again.', 'error');
    console.error(error);
  }
  markReady();
}
