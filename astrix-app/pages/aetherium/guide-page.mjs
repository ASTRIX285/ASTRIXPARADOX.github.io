/**
 * The Guide's light pages (feature/aetherium-guide-home, 18 Oct 2026; remodelled in design/aetherium-guide-remodel,
 * 19 Oct 2026): the Guide home, the Character and Guides Overviews and the "coming soon" page of each section not written yet. The page
 * says which one it is on <body data-guide="home|section|soon" data-guide-section="<id>">. Static: no call to the official
 * site, no data file. Classes live in guide-classes.mjs.
 */
import { esc } from './aetherium-ui.mjs';
import { cardUrl } from './aetherium-data.mjs';
import { GUIDE_CLASSES, GUIDE_ROOT, GUIDE_SECTIONS, classHref, comingSoonHtml, overviewHtml, renderGuideShell, startGuidePage } from './guide-shell.mjs';

/*
 * The Guide home's settings. exampleShot is the "See it on the screen you already use" panel: a real in-game screenshot
 * with its numbered steps, { src, alt, width, height, label, steps: [{ title, text }] }. The panel only draws when it is set,
 * so a placeholder never shows on the site.
 */
const HOME = Object.freeze({ exampleShot: null });

/* Each section's rendered icon, 256 px square, shown at 120 px (96 px on a phone). The tile title names it, so alt is empty. */
const SECTION_ICONS = '/astrix-app/pages/aetherium/images/section-icons/';
const sectionIcon = id => `<img class="ae-gd-tile-icon" src="${SECTION_ICONS}${esc(id)}.png" alt="" width="120" height="120" loading="lazy" decoding="async">`;

/** A gold diamond and the heading, as every section of the Guide opens. */
const h2 = (id, text) => `<h2 class="ae-gd-h2" id="${esc(id)}">${esc(text)}</h2>`;

function tileHtml(item) {
  return `<li class="ae-gd-tile is-section" data-guide-tile="${esc(item.id)}">
      ${sectionIcon(item.id)}
      <div class="ae-gd-tile-copy">
        <h3 class="ae-gd-tile-name"><a class="ae-gd-tile-head" href="${esc(item.href)}">${esc(item.label)}</a></h3>
        <p class="ae-gd-tile-blurb">${esc(item.blurb)}</p>
        <ul class="ae-gd-topics">${item.topics.map(topic => `<li>${item.pages[topic] ? `<a href="${esc(item.pages[topic])}">${esc(topic)}</a>` : `<span>${esc(topic)}</span>`}</li>`).join('')}</ul>
      </div>
    </li>`;
}

/** "See it on the screen you already use": only with a real screenshot in HOME.exampleShot. */
function exampleHtml(shot) {
  if (!shot?.src) return '';
  return `<section class="ae-gd-example" aria-labelledby="aeExampleTitle">
      ${h2('aeExampleTitle', 'See it on the screen you already use')}
      <p class="ae-gd-section-lede">Every guide starts from a real in-game window. We mark what matters, so you know where to click and what the numbers mean.</p>
      <div class="ae-gd-showcase">
        <figure class="ae-gd-shot">
          ${shot.label ? `<figcaption class="ae-gd-shot-label">${esc(shot.label)}</figcaption>` : ''}
          <img src="${esc(shot.src)}" alt="${esc(shot.alt)}" width="${esc(shot.width)}" height="${esc(shot.height)}" loading="lazy" decoding="async">
        </figure>
        <ol class="ae-gd-shot-steps">${(shot.steps ?? []).map((step, index) => `<li><span class="ae-gd-num" aria-hidden="true">${index + 1}</span><div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div></li>`).join('')}</ol>
      </div>
    </section>`;
}

/** "New to AION 2? Go in this order": four steps, each an existing page. Daevanion has no page yet, so it opens Character. */
function pathHtml() {
  const steps = [
    { title: 'About AION 2', text: 'The two factions, the story so far and what Season 1 holds.', href: `${GUIDE_ROOT}general/about/` },
    { title: 'Controls and the skill bar', text: 'Control modes, keys, macros and how to lay out your bar.', href: `${GUIDE_ROOT}general/controls/` },
    { title: 'Enhancement', text: 'The five tabs of the Enhancement window and what to enhance, when.', href: `${GUIDE_ROOT}equipment/enhancement/` },
    { title: 'Daevanion', text: 'Your Daevanion boards, with your class and stats in the Character section.', href: `${GUIDE_ROOT}character/` }
  ];
  return `<section class="ae-gd-path" aria-labelledby="aeStartTitle">
      ${h2('aeStartTitle', 'New to AION 2? Go in this order')}
      <ol class="ae-gd-steps">${steps.map((step, index) => `<li><a class="ae-gd-step" href="${esc(step.href)}" data-guide-start="${index + 1}"><span class="ae-gd-step-n" aria-hidden="true">${index + 1}</span><strong>${esc(step.title)}</strong><small>${esc(step.text)}</small></a></li>`).join('')}</ol>
    </section>`;
}

function linkedHtml(linked) {
  const entry = linked?.entry;
  if (!entry?.className || !GUIDE_CLASSES.includes(entry.className)) return '';
  return `<p class="ae-gd-linked" data-guide-linked>Reading for <b>${esc(entry.name)}</b>, ${esc(entry.className)} Lv ${esc(entry.level ?? '-')}. <a href="${esc(classHref(entry.className))}">Your class page</a> shows where your setup differs from the build.</p>`;
}

function renderHome(linked) {
  const card = linked ? cardUrl(linked.ref) : '/hub/aetherium/#aeSearch';
  const body = renderGuideShell({
    section: 'home',
    kicker: 'AION 2 Guide',
    title: 'Know where to look.',
    lede: 'Welcome to the AION 2 Guide by ASTRIX PARADOX. It explains the game in plain words, from your first class pick to the Lv 45 weekly loop, and ties every part back to your own Daeva when you link one.',
    actions: `<a class="ae-gd-btn is-gold" href="${GUIDE_ROOT}general/about/" data-guide-cta="about">Start with About AION 2</a><a class="ae-gd-btn" href="${esc(card)}" data-guide-cta="card">Open your Daeva Card</a>`
  });
  body.insertAdjacentHTML('beforeend', `
    ${linkedHtml(linked)}
    <section class="ae-gd-browse" aria-labelledby="aeGridTitle">
      ${h2('aeGridTitle', 'Browse the guide')}
      <ul class="ae-gd-grid">${GUIDE_SECTIONS.filter(item => item.id !== 'home').map(tileHtml).join('')}</ul>
    </section>
    ${exampleHtml(HOME.exampleShot)}
    ${pathHtml()}`);
}

/*
 * The Character Overview. Stats and Daevanion are planned in the Ascent Plan, so their cards open it; Stigmas and Builds
 * stay off the page until they are written.
 */
const CHARACTER_TOPICS = Object.freeze([
  { id: 'classes', label: 'Classes', href: `${GUIDE_ROOT}classes/`, blurb: 'The eight classes, the roles they play and the builds for each.' },
  { id: 'stats', label: 'Stats', href: '/hub/aetherium/ascent/stats/', blurb: 'Plan where your stat points go in the Ascent Plan.' },
  { id: 'daevanion', label: 'Daevanion', href: '/hub/aetherium/ascent/daevanion/', blurb: 'Plan your Daevanion boards in the Ascent Plan.' }
]);

function renderCharacter() {
  const item = GUIDE_SECTIONS.find(entry => entry.id === 'character');
  const body = renderGuideShell({ section: 'character', title: 'Character', crumbs: [{ label: 'Character' }], lede: item.blurb });
  body.insertAdjacentHTML('beforeend', `
    ${overviewHtml('character', CHARACTER_TOPICS)}
    <h2 class="ae-gd-h2">The eight classes</h2>
    <ul class="ae-gd-classlinks">${GUIDE_CLASSES.map(name => `<li><a class="ae-btn" href="${esc(classHref(name))}">${esc(name)}</a></li>`).join('')}</ul>`);
}

/** The Guides Overview: the guides written so far. New player help and the endgame stay off the page until written. */
const GUIDES_TOPICS = Object.freeze([
  { id: 'path', label: 'Your path by level', href: `${GUIDE_ROOT}path/`, blurb: 'What to do next at your level, step by step.' },
  { id: 'dungeons', label: 'Dungeons', href: `${GUIDE_ROOT}dungeons/`, blurb: 'Every dungeon and repeatable run: who can go, how often and what it gives.' },
  { id: 'weekly', label: 'Lv 45 weekly loop', href: `${GUIDE_ROOT}weekly/`, blurb: 'Everything at Lv 45 that refills on a timer.' }
]);

function renderGuides() {
  const body = renderGuideShell({ section: 'guides', title: 'Guides', crumbs: [{ label: 'Guides' }] });
  body.insertAdjacentHTML('beforeend', overviewHtml('guides', GUIDES_TOPICS));
}

function renderSoon(id) {
  const item = GUIDE_SECTIONS.find(entry => entry.id === id) ?? GUIDE_SECTIONS[0];
  const body = renderGuideShell({ section: item.id, title: item.label, crumbs: [{ label: item.label }] });
  body.insertAdjacentHTML('beforeend', comingSoonHtml(item.id));
}

startGuidePage(linked => {
  const kind = document.body.dataset.guide;
  const section = document.body.dataset.guideSection;
  if (kind === 'home') renderHome(linked);
  else if (kind === 'section' && section === 'character') renderCharacter();
  else if (kind === 'section' && section === 'guides') renderGuides();
  else renderSoon(section);
});
