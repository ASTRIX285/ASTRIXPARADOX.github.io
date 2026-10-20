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
 *   overviewHtml(section, cards)
 *                         a section Overview's topic cards (design/aetherium-guide-overviews, 20 Oct 2026), one style for
 *                         every section. cards: [{ id, label, href, blurb }] in reading order; the first is "start here"
 *                         and spans two columns. Each card takes its icon from TOPIC_ICONS[section][id]; a topic with no
 *                         fitting icon draws none.
 *   TOPIC_ICONS           the icon of each Overview card: { art } for our rendered PNGs, or { game, grade } for a real
 *                         item or skill icon on the NCSOFT CDN (never re-hosted), with its item name and id.
 *   startGuidePage(fill)  wires the menu drawer, takes the faction colour from the linked Daeva (aetherium-memory.mjs),
 *                         runs fill(linked) (may be async; linked is linkedDaeva() or null), moves a page's own page list
 *                         into the side menu, lights exactly one side menu item (this page) and reports the page ready
 *                         once, even on failure.
 */
import { $, esc, gradeTile, markReady, setFaction, showNotice, wireDrawer } from './aetherium-ui.mjs';
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
  { id: 'guides', label: 'Guides', href: `${GUIDE_ROOT}guides/`, blurb: 'Your path by level, new player help, dungeons, the Lv 45 weekly loop and the endgame.', topics: ['Your path by level', 'New player help', 'Dungeons', 'Lv 45 weekly loop', 'Endgame'], pages: { 'Your path by level': `${GUIDE_ROOT}path/`, Dungeons: `${GUIDE_ROOT}dungeons/`, 'Lv 45 weekly loop': `${GUIDE_ROOT}weekly/` }, hero: VISTA_HERO, built: true }
]);

export const GUIDE_CLASSES = Object.freeze(['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter']);

const sectionOf = id => GUIDE_SECTIONS.find(item => item.id === id) ?? GUIDE_SECTIONS[0];

export const guideHref = id => sectionOf(id).href;

export const classHref = className => `${GUIDE_ROOT}classes/${String(className).toLowerCase()}/`;

/** An address as the side menu compares it: path only, no index.html, always a trailing slash. */
const pathKey = href => {
  const path = new URL(href, location.href).pathname.replace(/index\.html$/, '');
  return path.endsWith('/') ? path : `${path}/`;
};
/** The page's own address, so the side menu can light it. */
const herePath = () => pathKey(location.pathname);

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

const linkHtml = ({ label, href }) => `<li><a href="${esc(href)}"${!href.includes('#') && pathKey(href) === herePath() ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`;

/**
 * Light this page, and only this page, in the side menu. One place decides it, after the page's own list has moved in, so a
 * link that arrived with its own aria-current (or a section link under More) can never leave a second item lit. A link to a
 * spot on another page (#) is never the current page.
 */
function markCurrent() {
  const links = [...document.querySelectorAll('[data-guide-side] .ae-gd-side-list a')];
  const here = herePath();
  let lit = null;
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    if (!lit && !href.includes('#') && !link.classList.contains('ae-gd-side-home') && pathKey(href) === here) lit = link;
  }
  /* Only touch what is wrong, so the lit item drawn with the menu never flickers through a colour change. */
  for (const link of links) {
    if (link === lit) { if (link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page'); }
    else if (link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
  }
}

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

const ART = '/astrix-app/pages/aetherium/images/';
const GAME = 'https://assets.playnccdn.com/static-aion2-gamedata/resources/';

/*
 * The Overview card icons. General and Character use our rendered PNGs; Skills and Equipment use real game icons as the
 * official armory sends them (the item names, ids and grades are in the armory fixtures under astrix-app/tools/fixtures/aion2/eu,
 * the skill icons in data/advisor/icons/gladiator.json). A topic with no fitting icon in our data is left out: no icon is
 * better than a drawn one. Grades use our ids (grades.json): the armory's Legend is the game's Epic.
 */
export const TOPIC_ICONS = Object.freeze({
  general: {
    about: { art: `${ART}topic-icons/about.png` },
    resets: { art: `${ART}topic-icons/resets.png` },
    market: { art: `${ART}topic-icons/market.png` },
    controls: { art: `${ART}topic-icons/controls.png` },
    loadouts: { art: `${ART}topic-icons/loadouts.png` },
    faq: { art: `${ART}topic-icons/faq.png` }
  },
  character: {
    classes: { art: `${ART}class-emblems/gladiator.png` },
    stats: { art: `${ART}topic-icons/stats.png` }
  },
  skills: {
    'by-class': { game: `${GAME}ICON_GL_SKILL_002.png`, name: 'Keen Strike' },
    mastery: { game: `${GAME}ICON_GL_SKILL_001.png`, name: 'Rending Blow' },
    specialty: { game: `${GAME}ICON_GL_SKILL_017.png`, name: 'Overhead Slam' },
    'skill-bar': { game: `${GAME}ICON_CO_SKILL_002.png`, name: 'Defiance' }
  },
  equipment: {
    slots: { game: `${GAME}Icon_WP_GS_0078_T05.png`, grade: 'unique', name: 'Spiritforged Greatsword', itemId: 110130047 },
    manastones: { game: `${GAME}Icon_Item_Usable_Enchant_MagicStone_A_c_003.png`, grade: 'rare', name: 'Manastone, Accuracy Bonus' },
    'pets-wings': { game: `${GAME}Icon_WingB_007C.png`, grade: 'epic', name: 'Superior Daeva Wings', itemId: 30200703 }
  }
});

function cardIconHtml(icon, size) {
  if (icon?.art) return `<span class="ae-gd-ocard-icon is-art"><img src="${esc(icon.art)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;
  if (icon?.game) return `<span class="ae-gd-ocard-icon is-game">${gradeTile({ icon: icon.game, grade: icon.grade ?? null, size })}</span>`;
  return '';
}

/** A section Overview: one card per topic, the whole card a link, the first card "start here" across two columns. */
export function overviewHtml(section, cards) {
  const icons = TOPIC_ICONS[section] ?? {};
  return `<ul class="ae-gd-ocards" data-guide-overview="${esc(section)}">${cards.map((card, index) => {
    const icon = cardIconHtml(icons[card.id], index === 0 ? 96 : 72);
    return `<li class="ae-gd-ocard${index === 0 ? ' is-start' : ''}${icon ? '' : ' is-plain'}" data-guide-topic="${esc(card.id)}">
        <a class="ae-gd-ocard-link" href="${esc(card.href)}">${icon}<span class="ae-gd-ocard-copy"><span class="ae-gd-ocard-title">${esc(card.label)}</span>${card.blurb ? `<span class="ae-gd-ocard-blurb">${esc(card.blurb)}</span>` : ''}</span></a>
      </li>`;
  }).join('')}</ul>`;
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
    markCurrent();
  } catch (error) {
    showNotice('This part of the Guide could not load. Refresh the page to try again.', 'error');
    console.error(error);
  }
  markReady();
  /* Back and forward restore a page as it was left: light it again. */
  addEventListener('pageshow', event => { if (event.persisted) markCurrent(); });
}
