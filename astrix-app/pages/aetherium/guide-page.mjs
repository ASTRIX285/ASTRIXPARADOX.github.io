/**
 * The Guide's light pages (feature/aetherium-guide-home, 18 Oct 2026): the Guide home, the Character section and the
 * "coming soon" page of each section not written yet. The page says which one it is on <body data-guide="home|section|soon"
 * data-guide-section="<id>">. Static: no call to the official site, no data file. Classes live in guide-classes.mjs.
 */
import { esc } from './aetherium-ui.mjs';
import { cardUrl } from './aetherium-data.mjs';
import { GUIDE_CLASSES, GUIDE_ROOT, GUIDE_SECTIONS, classHref, comingSoonHtml, guideHref, renderGuideShell, startGuidePage } from './guide-shell.mjs';

/* Our own line icons for the section tiles (24 px grid, drawn in currentColor). */
const ICONS = {
  general: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  character: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  skills: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  equipment: '<path d="M14.5 3.5l6 6-9 9H5.5v-6z"/><path d="M12 7l5 5M4 20l3-3"/>',
  crafting: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L3.5 14.5a2 2 0 0 0 0 3l3 3a2 2 0 0 0 3 0L17 13"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  guides: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7M8 11h7"/>'
};
const icon = id => `<svg class="ae-gd-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id] ?? ''}</svg>`;

/* Built pages inside a section, by topic: a topic with a page is a link, the rest wait for their phase. */
const TOPIC_PAGES = { character: { Classes: `${GUIDE_ROOT}classes/` }, guides: { 'Your path by level': `${GUIDE_ROOT}path/` } };

const soonTag = '<span class="ae-gd-soon-tag">Coming soon</span>';

function tileHtml(item) {
  const pages = TOPIC_PAGES[item.id] ?? {};
  return `<li class="ae-gd-tile" data-guide-tile="${esc(item.id)}">
      <a class="ae-gd-tile-head" href="${esc(item.href)}">${icon(item.id)}<span class="ae-gd-tile-name">${esc(item.label)}</span>${item.built ? '' : soonTag}</a>
      <p class="ae-gd-tile-blurb">${esc(item.blurb)}</p>
      <ul class="ae-gd-topics">${item.topics.map(topic => `<li>${pages[topic] ? `<a href="${esc(pages[topic])}">${esc(topic)}</a>` : `<span>${esc(topic)}</span>`}</li>`).join('')}</ul>
    </li>`;
}

function startRowHtml(linked) {
  const steps = [
    { n: 1, title: 'Pick a class', text: 'See what each of the eight classes does and which role it plays.', href: `${GUIDE_ROOT}classes/` },
    { n: 2, title: 'Find your Daeva', text: 'Type your character name to read your gear, skills and boards.', href: linked ? cardUrl(linked.ref) : '/hub/aetherium/#aeSearch' },
    { n: 3, title: 'Plan your build', text: 'The Ascent Plan says what to level, slot and spend next.', href: '/hub/aetherium/ascent/' },
    { n: 4, title: 'Your path by level', text: 'What to do at each level, from Lv 1 to the Lv 45 weekly loop.', href: `${GUIDE_ROOT}path/` }
  ];
  return `<section class="ae-gd-start" aria-labelledby="aeStartTitle">
      <h2 id="aeStartTitle">New player? Start here</h2>
      <ol class="ae-gd-steps">${steps.map(step => `<li><a class="ae-btn ae-gd-step" href="${esc(step.href)}" data-guide-start="${step.n}"><b class="ae-gd-step-n" aria-hidden="true">${step.n}</b><span class="ae-gd-step-copy"><strong>${esc(step.title)}</strong><small>${esc(step.text)}</small></span>${step.soon ? soonTag : ''}</a></li>`).join('')}</ol>
    </section>`;
}

function linkedHtml(linked) {
  const entry = linked?.entry;
  if (!entry?.className || !GUIDE_CLASSES.includes(entry.className)) return '';
  return `<p class="ae-gd-linked" data-guide-linked>Reading for <b>${esc(entry.name)}</b>, ${esc(entry.className)} Lv ${esc(entry.level ?? '-')}. <a href="${esc(classHref(entry.className))}">Your class page</a> shows where your setup differs from the build.</p>`;
}

function renderHome(linked) {
  const body = renderGuideShell({ section: 'home', title: 'AION 2 Guide' });
  body.insertAdjacentHTML('beforeend', `
    <div class="ae-gd-intro">
      <p class="ae-gd-lede">Welcome to the AION 2 Guide by ASTRIX PARADOX. It explains the game in plain words, from your first class pick to the Lv 45 weekly loop, and ties every part back to your own Daeva when you link one.</p>
      <p>Every fact comes from our build data or a cited source. Where nothing confirms a detail yet, the Guide says so instead of guessing.</p>
    </div>
    ${linkedHtml(linked)}
    ${startRowHtml(linked)}
    <section class="ae-gd-grid-wrap" aria-labelledby="aeGridTitle">
      <h2 id="aeGridTitle">Browse the Guide</h2>
      <ul class="ae-gd-grid">${GUIDE_SECTIONS.filter(item => item.id !== 'home').map(tileHtml).join('')}</ul>
    </section>`);
}

function renderCharacter() {
  const item = GUIDE_SECTIONS.find(entry => entry.id === 'character');
  const body = renderGuideShell({ section: 'character', title: 'Character', crumbs: [{ label: 'Character' }], lede: item.blurb });
  const pages = TOPIC_PAGES.character;
  body.insertAdjacentHTML('beforeend', `
    <ul class="ae-gd-grid is-topics">${item.topics.map(topic => `<li class="ae-gd-tile" data-guide-topic="${esc(topic)}">${pages[topic]
      ? `<a class="ae-gd-tile-head" href="${esc(pages[topic])}">${icon('character')}<span class="ae-gd-tile-name">${esc(topic)}</span></a><p class="ae-gd-tile-blurb">The eight classes, the roles they play and the builds for each.</p>`
      : `<span class="ae-gd-tile-head">${icon('character')}<span class="ae-gd-tile-name">${esc(topic)}</span>${soonTag}</span><p class="ae-gd-tile-blurb">Coming soon in this guide.</p>`}</li>`).join('')}</ul>
    <h2 class="ae-gd-h2">The eight classes</h2>
    <ul class="ae-gd-classlinks">${GUIDE_CLASSES.map(name => `<li><a class="ae-btn" href="${esc(classHref(name))}">${esc(name)}</a></li>`).join('')}</ul>`);
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
  else renderSoon(section);
});
