/**
 * The Guide shell (The Aetherium's AION 2 Guide, feature/aetherium-guide-home, 18 Oct 2026; remodelled in
 * design/aetherium-guide-remodel, 19 Oct 2026). Every Guide page draws through here, so the sections plug in without
 * touching the frame.
 *
 * Contract (keep it stable, the sections build on it):
 *   GUIDE_SECTIONS        the eight sections in nav order: { id, label, href, blurb, topics, pages, hero, built }.
 *                         pages maps a topic to the page that covers it; hero is the photo band { src, alt, width, height }.
 *                         A section that is not written yet keeps built false and its "coming soon" page.
 *   GUIDE_CLASSES         the eight classes in the game's order (the same list as AION2_CLASSES in ascent-advisor.mjs,
 *                         kept here so the light pages need not load the advisor; the Guide test checks they match).
 *   guideHref(id)         a section's address (/hub/aetherium/guide/<id>/, home for 'home').
 *   classHref(className)  a class page's address (/hub/aetherium/guide/classes/<class>/).
 *   renderGuideShell({ section, title, crumbs, lede, kicker, actions })
 *                         draws the Guide into #aeStage: the photo band with the section kicker, the page title (H1) and
 *                         the lede, then the side menu (sub pages only) and an empty body. Returns the body for the page to
 *                         fill. crumbs: [{ label, href }] after "Guide"; the last crumb is the page itself (no href needed).
 *                         kicker and actions (markup for the band's buttons) are optional, for the Guide home.
 *   comingSoonHtml(id)    the short "coming soon in this guide" body for a section not built yet.
 *   startGuidePage(fill)  wires the menu drawer, takes the faction colour from the linked Daeva (aetherium-memory.mjs),
 *                         runs fill(linked) (may be async; linked is linkedDaeva() or null), moves a page's own page list
 *                         into the side menu and reports the page ready once, even on failure.
 */
import { $, esc, markReady, setFaction, showNotice, wireDrawer } from './aetherium-ui.mjs';
import { linkedDaeva } from './aetherium-memory.mjs';

export const GUIDE_ROOT = '/hub/aetherium/guide/';

const PHOTOS = '/astrix-app/pages/aetherium/images/photos/';
const HOME_HERO = Object.freeze({ src: `${PHOTOS}golden-sea-01.jpg`, alt: 'A floating rock chained to a cliff above a golden sea, with a huge planet glowing through the clouds', width: 2560, height: 1440 });
/* Every section uses the vista for now; each gets its own photo later. */
const VISTA_HERO = Object.freeze({ src: `${PHOTOS}atreia-vista-01.jpg`, alt: 'A Daeva on a grassy hilltop looking out over cliffside ruins, a spiked dark structure and the sea', width: 2560, height: 1440 });

export const GUIDE_SECTIONS = Object.freeze([
  { id: 'home', label: 'Home', href: GUIDE_ROOT, blurb: 'Start here: what the Guide covers and where to go next.', topics: [], pages: {}, hero: HOME_HERO, built: true },
  { id: 'general', label: 'General', href: `${GUIDE_ROOT}general/`, blurb: 'The game, the two factions, Season 1, reset times, Membership and the Market, controls and the FAQ.', topics: ['About AION 2', 'Factions', 'Season 1', 'Reset times', 'Membership and Market', 'Controls', 'FAQ'], pages: { 'About AION 2': `${GUIDE_ROOT}general/about/`, Factions: `${GUIDE_ROOT}general/about/`, 'Season 1': `${GUIDE_ROOT}general/about/`, 'Reset times': `${GUIDE_ROOT}general/resets/`, 'Membership and Market': `${GUIDE_ROOT}general/market/`, Controls: `${GUIDE_ROOT}general/controls/`, FAQ: `${GUIDE_ROOT}general/faq/` }, hero: VISTA_HERO, built: true },
  { id: 'character', label: 'Character', href: `${GUIDE_ROOT}character/`, blurb: 'The eight classes and their roles, stats, Daevanion boards, stigmas and builds.', topics: ['Classes', 'Stats', 'Daevanion', 'Stigmas', 'Builds'], pages: { Classes: `${GUIDE_ROOT}classes/` }, hero: VISTA_HERO, built: true },
  { id: 'skills', label: 'Skills', href: `${GUIDE_ROOT}skills/`, blurb: 'Every class skill, Mastery, Specialty picks and the skill bar.', topics: ['Skills by class', 'Mastery', 'Specialty picks', 'Skill bar and macro'], pages: { 'Skills by class': `${GUIDE_ROOT}classes/`, Mastery: `${GUIDE_ROOT}skills/`, 'Specialty picks': `${GUIDE_ROOT}skills/`, 'Skill bar and macro': `${GUIDE_ROOT}general/controls/` }, hero: VISTA_HERO, built: true },
  { id: 'equipment', label: 'Equipment', href: `${GUIDE_ROOT}equipment/`, blurb: 'Gear slots and grades, Enhancement, Manastones, Theostones, Arcana, pets, wings and titles.', topics: ['Slots and grades', 'Enhancement', 'Manastones', 'Theostones', 'Arcana', 'Pets and wings', 'Titles'], pages: { 'Slots and grades': `${GUIDE_ROOT}equipment/slots/`, Enhancement: `${GUIDE_ROOT}equipment/enhancement/`, Manastones: `${GUIDE_ROOT}equipment/manastones/`, Theostones: `${GUIDE_ROOT}equipment/theostones/`, Arcana: `${GUIDE_ROOT}equipment/arcana/`, 'Pets and wings': `${GUIDE_ROOT}equipment/pets-wings/`, Titles: `${GUIDE_ROOT}equipment/titles/` }, hero: VISTA_HERO, built: true },
  { id: 'crafting', label: 'Crafting', href: `${GUIDE_ROOT}crafting/`, blurb: 'The five professions, gathering and the crafted gear ladder.', topics: ['Professions', 'Gathering', 'Crafted gear'], pages: { Professions: `${GUIDE_ROOT}crafting/professions/`, Gathering: `${GUIDE_ROOT}crafting/gathering/`, 'Crafted gear': `${GUIDE_ROOT}crafting/crafted-gear/` }, hero: VISTA_HERO, built: true },
  { id: 'world', label: 'World', href: `${GUIDE_ROOT}world/`, blurb: 'Zones, Sealed Dungeons and Strongholds, the Abyss and events.', topics: ['Zones', 'Sealed Dungeons and Strongholds', 'The Abyss', 'Events'], pages: { Zones: `${GUIDE_ROOT}world/#aeWorld-zone`, 'Sealed Dungeons and Strongholds': `${GUIDE_ROOT}dungeons/sealed-dungeons/`, 'The Abyss': `${GUIDE_ROOT}world/#abyss`, Events: `${GUIDE_ROOT}world/#aeWorld-event` }, hero: VISTA_HERO, built: true },
  { id: 'guides', label: 'Guides', href: `${GUIDE_ROOT}guides/`, blurb: 'Your path by level, new player help, dungeons, the Lv 45 weekly loop and the endgame.', topics: ['Your path by level', 'New player help', 'Dungeons', 'Lv 45 weekly loop', 'Endgame'], pages: { 'Your path by level': `${GUIDE_ROOT}path/`, Dungeons: `${GUIDE_ROOT}dungeons/`, 'Lv 45 weekly loop': `${GUIDE_ROOT}weekly/` }, hero: VISTA_HERO, built: false }
]);

export const GUIDE_CLASSES = Object.freeze(['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter']);

const sectionOf = id => GUIDE_SECTIONS.find(item => item.id === id) ?? GUIDE_SECTIONS[0];

export const guideHref = id => sectionOf(id).href;

export const classHref = className => `${GUIDE_ROOT}classes/${String(className).toLowerCase()}/`;

/** The page's own address, so the side menu can light it. */
const herePath = () => location.pathname.replace(/index\.html$/, '');

/** The photo band: the photo, the kicker, the page title and the lede. The home adds its buttons. */
function heroHtml(item, { title, lede, kicker, actions }) {
  const hero = item.hero;
  return `<header class="ae-gd-hero${item.id === 'home' ? ' is-home' : ''}">
      <img class="ae-gd-hero-img" src="${esc(hero.src)}" alt="${esc(hero.alt)}" width="${hero.width}" height="${hero.height}" loading="eager" fetchpriority="high" decoding="async">
      <div class="ae-gd-hero-copy">
        <p class="ae-gd-kicker">${esc(kicker ?? item.label)}</p>
        <h1 class="ae-gd-title" id="aeScreenTitle">${esc(title)}</h1>
        ${lede ? `<p class="ae-gd-lede">${esc(lede)}</p>` : ''}
        ${actions ? `<div class="ae-gd-actions">${actions}</div>` : ''}
      </div>
    </header>`;
}

/** The current section's pages: its home, each topic page, then any page on the way down (Classes, Dungeons) and this one. */
function sectionLinks(item, crumbs) {
  const links = [{ label: 'Overview', href: item.href }];
  const add = (label, href) => { if (href && !links.some(link => link.href === href)) links.push({ label, href }); };
  for (const [label, href] of Object.entries(item.pages)) add(label, href);
  for (const crumb of crumbs.slice(0, -1)) add(crumb.label, crumb.href);
  const last = crumbs[crumbs.length - 1];
  if (last && !links.some(link => link.href === herePath())) add(last.label, herePath());
  return links;
}

const linkHtml = ({ label, href }) => `<li><a href="${esc(href)}"${!href.includes('#') && href === herePath() ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`;

/** The side menu: Guide home, this section's pages with this one lit, then the other sections under More. */
function sideHtml(item, crumbs) {
  const others = GUIDE_SECTIONS.filter(entry => entry.id !== 'home' && entry.id !== item.id);
  return `<nav class="ae-gd-side" aria-label="${esc(item.label)} pages" data-guide-side>
      <button class="ae-gd-btn ae-gd-side-toggle" type="button" aria-expanded="false" aria-controls="aeGuideSideList">In this section</button>
      <div class="ae-gd-side-list" id="aeGuideSideList">
        <a class="ae-gd-side-home" href="${GUIDE_ROOT}"><span aria-hidden="true">‹</span> Guide home</a>
        <p class="ae-gd-side-label">${esc(item.label)}</p>
        <ul data-guide-side-pages>${sectionLinks(item, crumbs).map(linkHtml).join('')}</ul>
        <p class="ae-gd-side-label">More</p>
        <ul data-guide-side-more>${others.map(entry => `<li><a href="${esc(entry.href)}" data-guide-section="${esc(entry.id)}">${esc(entry.label)}</a></li>`).join('')}</ul>
      </div>
    </nav>`;
}

export function renderGuideShell({ section = 'home', title, crumbs = [], lede = null, kicker = null, actions = null } = {}) {
  const stage = $('#aeStage');
  const item = sectionOf(section);
  const isHome = item.id === 'home' && !crumbs.length;
  stage.innerHTML = `<section class="ae-gd${isHome ? ' is-home' : ' is-sub'}" data-guide-shell="${esc(item.id)}" aria-labelledby="aeScreenTitle">
      ${heroHtml(item, { title, lede, kicker, actions })}
      <div class="ae-gd-frame">
        ${isHome ? '' : sideHtml(item, crumbs)}
        <div class="ae-gd-body" id="aeGuideBody"></div>
      </div>
    </section>`;
  const side = stage.querySelector('[data-guide-side]');
  side?.querySelector('.ae-gd-side-toggle').addEventListener('click', event => {
    const open = side.classList.toggle('is-open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  return $('#aeGuideBody');
}

/**
 * A page that draws its own list of pages (the General pages, the Equipment and Crafting topics) has it moved into the
 * side menu, so there is one menu. The links keep their attributes; Overview stays first.
 */
function adoptPageList() {
  const own = document.querySelector('#aeGuideBody :is(.ae-gg-sub,.ae-gx-topicnav)');
  const list = document.querySelector('[data-guide-side-pages]');
  if (!own || !list) return;
  const overview = list.querySelector('li');
  const links = [...own.querySelectorAll('a')];
  list.replaceChildren(...(links.some(link => link.getAttribute('href') === overview.querySelector('a').getAttribute('href')) ? [] : [overview]), ...links.map(link => {
    link.classList.remove('ae-btn');
    const li = document.createElement('li');
    li.append(link);
    return li;
  }));
  own.remove();
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
    adoptPageList();
  } catch (error) {
    showNotice('This part of the Guide could not load. Refresh the page to try again.', 'error');
    console.error(error);
  }
  markReady();
}
