/**
 * The Guide, General section (The Aetherium): About AION 2, Reset times, Membership and the Market, Controls and the skill
 * bar, Loadouts and the FAQ, plus the general Skills page. Every fact comes from data/advisor/general.json, one record per
 * fact with its status and sources; this file only lays them out. The page is named by body[data-guide-page].
 * Reset times are worked out from the UTC rule and shown in the player's own time zone, with a live countdown.
 */
import { $, esc } from './aetherium-ui.mjs';
import { GUIDE_CLASSES, GUIDE_ROOT, classHref, overviewHtml, renderGuideShell, startGuidePage } from './guide-shell.mjs';
import { nextReset, countdownWords } from './guide-resets.mjs';

const DATA_URL = '/astrix-app/games/aion2/data/advisor/general.json';
const BASE = '/hub/aetherium/guide/general/';
const SKILL_BAR_URL = '/hub/aetherium/ascent/skill-bar/';
const MACRO_URL = '/hub/aetherium/ascent/macro/';
const ASCENT_URL = '/hub/aetherium/ascent/';
const ICONS = '/astrix-app/pages/aetherium/images/topic-icons/';

/** A rendered topic icon (images/topic-icons): decorative, the heading next to it names the topic. */
const topicIcon = (name, size) => `<img class="ae-gg-icon" src="${ICONS}${name}.png" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;

/** The General pages in reading order: slug ('' is the section home), title, one line for the section home. */
export const GENERAL_PAGES = Object.freeze([
  { id: 'general', slug: '', title: 'General' },
  { id: 'about', slug: 'about/', title: 'About AION 2', blurb: 'The two factions, the story so far and what Season 1 holds.' },
  { id: 'resets', slug: 'resets/', title: 'Reset times', blurb: 'When the daily and weekly resets happen, in your own time.' },
  { id: 'market', slug: 'market/', title: 'Membership and the Market', blurb: 'Why you cannot trade directly, and what Membership unlocks.' },
  { id: 'controls', slug: 'controls/', title: 'Controls and the skill bar', blurb: 'Control modes, keys, macros and how to lay out your bar.' },
  { id: 'loadouts', slug: 'loadouts/', title: 'Loadouts', blurb: 'The 3 loadouts for looks, armour and skills, and how to plan them.' },
  { id: 'faq', slug: 'faq/', title: 'FAQ', blurb: 'Quick answers, grouped like the game\'s settings.' }
]);

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone';
const timeOf = date => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
const dayOf = date => new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
const whenOf = date => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
const utcClock = rule => `${String(rule.hourUtc).padStart(2, '0')}:${String(rule.minuteUtc ?? 0).padStart(2, '0')} UTC`;

/* Sources stay in the data, never on the page (Miguel, 19 Oct 2026). */
const sources = () => '';
/* Facts show no status tags or in-game checks (Miguel, 18 Oct 2026). Status and tests stay in the data. */
const statusTag = () => '';
const pendingWhy = () => '';
const testLine = () => '';
const path = steps => steps.map(esc).join(' <span aria-hidden="true">›</span> ');

/** One fact as a card: its label, status, text or lines, any extra markup, then its sources. */
function fact(record, extra = '', { tag = 'h2', cls = '', icon = '' } = {}) {
  if (!record) return '';
  return `<section class="ae-gg-card${cls ? ` ${cls}` : ''}" data-fact="${esc(record.id)}" aria-labelledby="gd-${esc(record.id)}">
    <${tag} class="ae-gg-h" id="gd-${esc(record.id)}">${icon ? topicIcon(icon, 40) : ''}${esc(record.label)} ${statusTag(record)}</${tag}>
    ${record.text ? `<p>${esc(record.text)}</p>` : ''}
    ${record.lines ? `<ul class="ae-gg-list">${record.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
    ${extra}${pendingWhy(record)}${testLine(record)}
    ${sources(record.provenance)}
  </section>`;
}

/* Pages. Each takes the records by id and returns the page body. */
function generalHome() {
  return `<p class="ae-gg-lead">The basics every Daeva needs: who you fight for, when the game resets, how buying and selling works, how to set up your keys, and quick answers to common questions.</p>
    ${overviewHtml('general', GENERAL_PAGES.slice(1).map(page => ({ id: page.id, label: page.title, href: `${BASE}${page.slug}`, blurb: page.blurb })))}`;
}
/* About AION 2 in pictures (design/aetherium-about-page, Miguel, 25 Oct 2026: "plain and boring, no images of the two
   factions"). The two factions as photo panels in their own colours, the faction rules as four tiles, the story as a
   picture timeline, Season 1 and the launch as numbers. Every word still comes from general.json; the photos are Miguel's
   own in-game shots already on the site. */
const IMG = '/astrix-app/pages/aetherium/images/';
const FACTIONS = Object.freeze({
  'faction-elyos': { id: 'elyos', emblem: `${IMG}faction-emblems/elyos.png`, kicker: 'Daevas of light', realm: 'Elysea', src: `${IMG}photos/elysea-meadow-01.jpg`, w: 2560, h: 1440, focus: '35% 40%', alt: 'An Elyos Daeva in white and red armour on a sunlit meadow of Elysea, with purple blossom behind' },
  'faction-asmodians': { id: 'asmodian', emblem: `${IMG}faction-emblems/asmodian.png`, kicker: 'Daevas of shadow', realm: 'Asmodae', src: `${IMG}photos/asmodae-fortress-01.jpg`, w: 1846, h: 967, focus: '50% 30%', alt: 'A dark spired fortress of Asmodae against a low sun, with rubble swirling around its towers' }
});
/* One picture per beat of the story, in order. */
const STORY_ART = Object.freeze([
  { src: `${IMG}page-heroes/dungeons.jpg`, focus: '60% 50%', alt: 'An island seen from above with a giant spiked spine reaching down to it' },
  { src: `${IMG}section-heroes/skills.jpg`, focus: '72% 10%', alt: 'A shimmering ring of light rising over a rocky ledge at night' },
  { src: `${IMG}page-backgrounds/titles.jpg`, focus: '38% 30%', alt: 'A towering statue of a god over ruined halls on the cliffs' },
  { src: `${IMG}page-heroes/manastones.jpg`, focus: '50% 50%', alt: 'Glowing red pods across a scorched orange plain' },
  { src: `${IMG}page-heroes/daily-dungeon.jpg`, focus: '69% 30%', alt: 'A blue and red throne inside a dark Balaur research base' }
]);
/* The faction rules as four tiles, each from one value in the record. */
const RULE_TILES = Object.freeze([
  { key: 'lockedAtCreation', on: true, big: 'For good', line: 'You pick a faction when you make a character. It never changes.' },
  { key: 'meetIn', big: 'The Abyss', line: 'The only place the two factions meet. Everywhere else they play on separate servers.' },
  { key: 'crossFactionParty', on: false, big: 'No mixed parties', line: 'An Elyos and an Asmodian cannot party together.' },
  { key: 'legionSameFaction', on: true, big: 'One-faction Legions', line: 'A Legion only takes members of its own faction.' }
]);
const photo = (src, alt, w, h, focus, cls, eager = false) => `<img class="${cls}" src="${src}" alt="${esc(alt)}" width="${w}" height="${h}" style="object-position:${focus}"${eager ? '' : ' loading="lazy"'} decoding="async">`;
const shortDate = iso => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function aboutPage(r) {
  const season = r['season-1'];
  const launch = r.launch;
  const rules = r['faction-rules'];
  const factions = Object.entries(FACTIONS).map(([id, look]) => {
    const record = r[id];
    if (!record) return '';
    return `<section class="ae-ab-faction" data-fact="${esc(record.id)}" data-side="${look.id}" aria-labelledby="gd-${esc(record.id)}">
        ${photo(look.src, look.alt, look.w, look.h, look.focus, 'ae-ab-faction-img', true)}
        <div class="ae-ab-faction-text">
          <img class="ae-ab-emblem" src="${look.emblem}" alt="${esc(record.label)} emblem" width="120" height="120" decoding="async">
          <p class="ae-ab-kicker">${esc(look.kicker)}</p>
          <h2 class="ae-ab-faction-name" id="gd-${esc(record.id)}">${esc(record.label)}</h2>
          <p class="ae-ab-realm">Home: <b>${esc(look.realm)}</b></p>
          <p>${esc(record.text)}</p>
        </div>
      </section>`;
  }).join('');
  const tiles = rules ? RULE_TILES.filter(tile => rules.value?.[tile.key] !== undefined && (tile.on === undefined || rules.value[tile.key] === tile.on))
    .map(tile => `<li class="ae-ab-rule" data-rule="${esc(tile.key)}"><b>${esc(tile.key === 'meetIn' ? `The ${rules.value.meetIn}` : tile.big)}</b><span>${esc(tile.line)}</span></li>`).join('') : '';
  const story = r.story?.lines ?? [];
  const beats = story.map((line, n) => {
    const art = STORY_ART[n];
    return `<li class="ae-ab-beat${n % 2 ? ' is-flip' : ''}">
        ${art ? `<figure class="ae-ab-beat-art">${photo(art.src, art.alt, 1600, 900, art.focus, 'ae-ab-beat-img')}</figure>` : ''}
        <div class="ae-ab-beat-text"><span class="ae-ab-beat-n" aria-hidden="true">${n + 1}</span><p>${esc(line)}</p></div>
      </li>`;
  }).join('');
  const numbers = season ? [
    { big: `Lv ${season.value.levelCap}`, small: 'Level cap', attr: ' data-season-cap' },
    { big: String(season.value.daevanionPoints), small: 'Daevanion points' },
    { big: season.value.heroicItems ? 'Yes' : 'None', small: 'Heroic items' },
    ...(launch?.value?.advancedAccess ? [{ big: shortDate(launch.value.advancedAccess), small: 'Advanced Access' }] : []),
    ...(launch?.value?.launch ? [{ big: shortDate(launch.value.launch), small: 'Global launch' }] : [])
  ] : [];
  return `<p class="ae-gg-lead">AION 2 is NCSOFT's MMORPG set in the world of Atreia. You play a Daeva, a winged warrior, for one of two factions.</p>
    <div class="ae-ab-factions">${factions}<span class="ae-ab-vs" aria-hidden="true">or</span></div>
    ${rules ? `<section class="ae-ab-block" data-fact="${esc(rules.id)}" aria-labelledby="gd-${esc(rules.id)}">
      <h2 class="ae-ab-h" id="gd-${esc(rules.id)}">${esc(rules.label)}</h2>
      <ul class="ae-ab-rules">${tiles}</ul>
      <p class="ae-ab-tip">To play with friends, pick the same faction and server.</p>
    </section>` : ''}
    ${story.length ? `<section class="ae-ab-block" data-fact="${esc(r.story.id)}" aria-labelledby="gd-${esc(r.story.id)}">
      <h2 class="ae-ab-h" id="gd-${esc(r.story.id)}">${esc(r.story.label)}</h2>
      <ol class="ae-ab-story">${beats}</ol>
    </section>` : ''}
    ${season ? `<section class="ae-ab-block" data-fact="${esc(season.id)}" aria-labelledby="gd-${esc(season.id)}">
      <h2 class="ae-ab-h" id="gd-${esc(season.id)}">${esc(season.label)}</h2>
      <ul class="ae-ab-numbers">${numbers.map(item => `<li><b${item.attr ?? ''}>${esc(item.big)}</b><span>${esc(item.small)}</span></li>`).join('')}</ul>
      <p class="ae-ab-note">${esc(season.text)}</p>
      ${launch ? `<p class="ae-ab-note" data-fact="${esc(launch.id)}">${esc(launch.text)}</p>` : ''}
    </section>` : ''}`;
}
function resetsPage(r) {
  const rule = r['reset-times'];
  const { daily, weekly } = rule.value;
  return `<p class="ae-gg-lead">Daily and weekly content refreshes at the same time for everyone. Below is that time in your own time zone, worked out on your device.</p>
    <div class="ae-gg-pair" id="aeResets" data-zone="${esc(zone())}">
      <section class="ae-gg-card ae-gg-reset" data-reset="daily" aria-labelledby="gdDaily">
        <h2 class="ae-gg-h" id="gdDaily">${topicIcon('resets', 56)}Daily reset</h2>
        <p class="ae-gg-big" data-reset-local></p>
        <p>Every day at <b data-reset-utc>${esc(utcClock(daily))}</b>.</p>
        <p class="ae-gg-next">Next: <span data-reset-next></span> <b data-reset-in></b></p>
      </section>
      <section class="ae-gg-card ae-gg-reset" data-reset="weekly" aria-labelledby="gdWeekly">
        <h2 class="ae-gg-h" id="gdWeekly">${topicIcon('resets', 56)}Weekly reset</h2>
        <p class="ae-gg-big" data-reset-local></p>
        <p>Every ${esc(weekly.weekdayName)} at <b data-reset-utc>${esc(utcClock(weekly))}</b>.</p>
        <p class="ae-gg-next">Next: <span data-reset-next></span> <b data-reset-in></b></p>
      </section>
    </div>
    <p class="ae-gg-tip" data-reset-tip>${esc(rule.notes[1])}</p>
    <p class="ae-gg-zone">Shown in <b data-reset-zone>${esc(zone())}</b>. ${esc(rule.notes[0])}</p>
    ${fact(r['shared-entries'])}`;
}
/** Fills the reset cards from the rule, now and again every 30 seconds so the countdown stays true. */
function tickResets(rule) {
  const box = $('#aeResets');
  if (!box) return;
  const paint = () => {
    const now = new Date();
    for (const kind of ['daily', 'weekly']) {
      const card = box.querySelector(`[data-reset="${kind}"]`);
      const at = nextReset(now, rule.value[kind]);
      card.querySelector('[data-reset-local]').textContent = kind === 'daily' ? `${timeOf(at)} every day` : `${dayOf(at)}s at ${timeOf(at)}`;
      card.querySelector('[data-reset-next]').textContent = whenOf(at);
      card.querySelector('[data-reset-in]').textContent = `(${countdownWords(now, at)})`;
      card.dataset.resetAt = at.toISOString();
    }
  };
  paint();
  setInterval(paint, 30000);
}
function marketPage(r) {
  const m = r.membership;
  return `<p class="ae-gg-lead">On the global servers every sale between players goes through the Market, and the Market needs Membership.</p>
    ${fact(r.trading)}
    ${fact(m)}
    ${fact(r['market-tip'], '', { cls: 'is-tip', icon: 'market' })}
    ${fact(r['shared-entries'])}`;
}
/** The bar as the game lays it out: 1 to 8, Q, E, then the mouse and the second stack, with the order own keys fill in. The
 * numbered steps beside it light the keys they talk about while hovered, focused or pressed. */
function barPicture(layout) {
  const fill = new Map(layout.value.fill.map((key, index) => [key, index + 1]));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E'];
  const cap = key => `<li class="ae-gg-key${layout.value.stackKeys.includes(key) ? ' is-stack' : ''}" data-bar-key="${esc(key)}"><b>${esc(key)}</b><small aria-label="filled ${fill.get(key)}${['st', 'nd', 'rd'][fill.get(key) - 1] ?? 'th'}">${fill.get(key)}</small></li>`;
  const step = (item, index) => `<li><button class="ae-gg-step" type="button" aria-pressed="false" data-bar-step="${index + 1}" data-keys="${esc(item.keys.join(' '))}"><b aria-hidden="true">${index + 1}</b><span>${esc(item.text)}</span></button></li>`;
  return `<div class="ae-gg-barwrap">
    <figure class="ae-gg-bar" id="aeGuideBar">
      <div class="ae-gg-keyscroll"><ol class="ae-gg-keys" aria-label="Keys 1 to 8, Q and E, numbered in the order you fill them">${keys.map(cap).join('')}</ol></div>
      <ol class="ae-gg-keys is-mouse" aria-label="Then the mouse and the second stack">
        <li class="ae-gg-key is-wide" data-bar-key="LMB"><b>Left click</b><small>Main attack</small></li>
        <li class="ae-gg-key is-wide is-macro" data-bar-key="RMB"><b>Right click</b><small>Main line</small></li>
        <li class="ae-gg-key is-wide is-macro" data-bar-key="B"><b>Stack</b><small>Second macro stack</small></li>
      </ol>
      <p class="ae-gg-key is-space" data-bar-key="Space"><b>Space bar</b><small>Defiance</small></p>
      <figcaption>Small gold numbers: the order own keys fill in.</figcaption>
    </figure>
    <ol class="ae-gg-barsteps" id="aeBarSteps" aria-label="How to read the bar">${layout.steps.map(step).join('')}</ol>
  </div>`;
}
/** Lights the keys a step talks about while it is hovered or focused; a press keeps it lit, as touch has no hover. */
function wireBarSteps() {
  const bar = $('#aeGuideBar'), list = $('#aeBarSteps');
  if (!bar || !list) return;
  let pinned = null;
  const light = button => {
    const keys = new Set(button ? button.dataset.keys.split(' ') : []);
    for (const key of bar.querySelectorAll('[data-bar-key]')) key.classList.toggle('is-lit', keys.has(key.dataset.barKey));
    for (const other of list.querySelectorAll('.ae-gg-step')) other.classList.toggle('is-lit', other === button);
  };
  list.addEventListener('pointerover', event => { const button = event.target.closest('.ae-gg-step'); if (button) light(button); });
  list.addEventListener('pointerleave', () => light(list.contains(document.activeElement) ? document.activeElement.closest('.ae-gg-step') : pinned));
  list.addEventListener('focusin', event => light(event.target.closest('.ae-gg-step')));
  list.addEventListener('focusout', () => light(pinned));
  list.addEventListener('click', event => {
    const button = event.target.closest('.ae-gg-step');
    if (!button) return;
    pinned = pinned === button ? null : button;
    for (const other of list.querySelectorAll('.ae-gg-step')) other.setAttribute('aria-pressed', String(other === pinned));
    light(pinned ?? button);
  });
}
function controlsPage(r) {
  const modes = r['control-modes'], keys = r['default-keys'], ks = r['key-settings'], menus = r['no-hotkey-menus'], macro = r['macro-presets'];
  return `<p class="ae-gg-lead">How to move, target and fight, and how to lay out your skill bar so your hand never has to stretch.</p>
    ${fact(r['bar-layout'], `${barPicture(r['bar-layout'])}<p class="ae-gg-actions"><a class="ae-gd-btn is-gold" href="${SKILL_BAR_URL}" data-guide-link="skill-bar">Open the Skill Bar plan</a></p><p class="ae-gg-note">The Ascent Plan's Skill Bar screen fills this layout with your class's skills, key by key and row by row.</p>`, { cls: 'is-bar', icon: 'controls' })}
    ${fact(r['space-defiance'])}
    ${fact(macro, `<p class="ae-gg-path">Set the key in ${path(macro.value.path)}.</p><p class="ae-gg-actions"><a class="ae-gd-btn" href="${MACRO_URL}" data-guide-link="macro">Open the Macro plan</a></p>`)}
    ${fact(modes, `<dl class="ae-gg-dl">${modes.value.modes.map(mode => `<div><dt>${esc(mode.name)}${mode.default ? ' <small>default</small>' : ''}</dt><dd>${esc(mode.text)}</dd></div>`).join('')}</dl><p class="ae-gg-path">Change it in ${path(modes.value.path)}. Swap quickly with the ${esc(modes.value.quickSwitch)} key.</p>`)}
    ${fact(keys, `<dl class="ae-gg-dl is-keys" id="aeDefaultKeys">${keys.value.keys.map(([key, does]) => `<div><dt><kbd>${esc(key)}</kbd></dt><dd>${esc(does)}</dd></div>`).join('')}</dl>`)}
    ${fact(ks, `<dl class="ae-gg-dl">${ks.value.tabs.map(([tab, holds]) => `<div><dt>${esc(tab)}</dt><dd>${esc(holds)}</dd></div>`).join('')}</dl>`)}
    ${fact(menus)}
    ${fact(r.targeting)}
    ${fact(r.camera)}
    ${fact(r.controller)}`;
}
function loadoutsPage(r) {
  const l = r.loadouts;
  const kinds = [['looks', 'Looks'], ['armour', 'Armour'], ['skills', 'Skills']];
  return `<p class="ae-gg-lead">You do not need a second character to play a second role. Save each setup as a loadout and swap.</p>
    ${fact(l, `<ul class="ae-gg-loadouts" id="aeLoadouts">${kinds.map(([key, name]) => `<li data-loadout="${key}"><b>${esc(name)}</b><span class="ae-gg-slots">${Array.from({ length: l.value[key] }, (_, i) => `<span class="ae-gg-slot" data-slot="${i + 1}">Loadout ${i + 1}</span>`).join('')}</span></li>`).join('')}</ul>`, { icon: 'loadouts' })}
    ${fact(r['loadouts-aetherium'], `<p class="ae-gg-actions"><a class="ae-gd-btn is-gold" href="${ASCENT_URL}" data-guide-link="ascent">Plan a loadout</a></p>`)}`;
}
/** The FAQ group icons: Controls has its own topic icon, the other groups share the FAQ one. */
const FAQ_ICONS = { controls: 'controls' };
/** Every answer shows as a short tip under its group heading; the longer lists (error codes, known problems) stay as cards. */
function faqPage(r, data) {
  const faq = Object.values(r).filter(record => record.section === 'faq');
  const extras = { items: ['auto-potions', 'looting', 'auto-extract', 'lock-items', 'flight', 'characters'], trouble: ['trouble-basics', 'trouble-codes', 'trouble-known', 'trouble-report'] };
  const tip = (title, text, attr) => `<li class="ae-gg-tipcard" ${attr}><h4>${esc(title)}</h4><p>${esc(text)}</p></li>`;
  const isTip = record => record.text && !record.lines && !record.value?.codes && !record.value?.items;
  const card = record => {
    const rows = record.value?.codes ?? record.value?.items;
    return fact(record, rows ? `<dl class="ae-gg-dl">${rows.map(([what, fix]) => `<div><dt>${esc(what)}</dt><dd>${esc(fix)}</dd></div>`).join('')}</dl>` : '', { tag: 'h3' });
  };
  const groups = Object.entries(data.groups);
  return `<p class="ae-gg-lead">Short answers to the questions new and returning players ask most.</p>
    <nav class="ae-gg-jump" aria-label="FAQ groups"><ul>${groups.map(([id, name]) => `<li><a class="ae-gd-btn" href="#faq-${id}">${esc(name)}</a></li>`).join('')}</ul></nav>
    ${groups.map(([id, name]) => {
      const more = (extras[id] ?? []).map(key => r[key]).filter(Boolean);
      return `<section class="ae-gg-group" id="faq-${id}" data-faq-group="${id}" aria-labelledby="faq-${id}-h">
      <h2 class="ae-gg-h2" id="faq-${id}-h">${topicIcon(FAQ_ICONS[id] ?? 'faq', 48)}${esc(name)}</h2>
      <ul class="ae-gg-tips">${faq.filter(item => item.group === id).map(item => tip(item.q, item.a, `data-faq="${esc(item.id)}"`)).join('')}${more.filter(isTip).map(record => tip(record.label, record.text, `data-fact="${esc(record.id)}"`)).join('')}</ul>
      ${more.filter(record => !isTip(record)).map(card).join('')}
    </section>`;
    }).join('')}`;
}
/** The Skills Overview cards: the class pages, the two facts below on this page, then the skill bar on Controls. */
const SKILL_TOPICS = Object.freeze([
  { id: 'by-class', label: 'Skills by class', href: `${GUIDE_ROOT}classes/`, blurb: 'Pick your class to open its page.' },
  { id: 'mastery', label: 'Mastery', href: '#gd-skill-mastery-cap', blurb: 'How far Mastery takes a skill, and what lifts it higher.' },
  { id: 'specialty', label: 'Specialty picks', href: '#gd-skill-specialty', blurb: 'The perks a skill opens as it levels.' },
  { id: 'skill-bar', label: 'Skill bar and macro', href: `${BASE}controls/`, blurb: 'Lay out your bar and set up your macros.' }
]);
function skillsPage(r) {
  const spec = r['skill-specialty'];
  const steps = [[8, '3 perks open, first perk slot'], [12, '4th perk, second slot'], [16, '5th perk'], [20, 'third slot']];
  return `<p class="ae-gg-lead">How skill levels work for every class. Your own class's skills, and where to put them, are on its class page and in the Ascent Plan.</p>
    ${overviewHtml('skills', SKILL_TOPICS)}
    ${fact(r['skill-mastery-cap'], `<p class="ae-gg-chips">${r['skill-mastery-cap'].value.beyond.map(item => `<span class="ae-gg-chip">${esc(item)}</span>`).join('')}</p>`)}
    ${fact(spec, `<ol class="ae-gg-steps" id="aeSpecialtySteps">${steps.map(([lv, what]) => `<li data-skill-level="${lv}"><b>Skill Lv ${lv}</b><span>${esc(what)}</span></li>`).join('')}</ol>`)}
    ${fact(r['skill-daevanion-nodes'])}
    ${fact(r['skill-stigma'])}
    ${fact(r['skill-wisdom-stones'])}
    <section class="ae-gg-card" aria-labelledby="gdByClass">
      <h2 class="ae-gg-h" id="gdByClass">Skills by class</h2>
      <p>Each class page lists that class's builds and the skills each one uses.</p>
      <ul class="ae-gg-actions" data-guide-classes>${GUIDE_CLASSES.map(name => `<li><a class="ae-btn" href="${esc(classHref(name))}">${esc(name)}</a></li>`).join('')}</ul>
    </section>
    <p class="ae-gg-actions"><a class="ae-btn" href="/hub/aetherium/ascent/mastery/" data-guide-link="mastery">Open the Mastery plan</a></p>`;
}

const PAGES = {
  general: { section: 'general', render: generalHome },
  about: { section: 'general', render: aboutPage },
  resets: { section: 'general', render: resetsPage, after: r => tickResets(r['reset-times']) },
  market: { section: 'general', render: marketPage },
  controls: { section: 'general', render: controlsPage, after: wireBarSteps },
  loadouts: { section: 'general', render: loadoutsPage },
  faq: { section: 'general', render: faqPage },
  skills: { section: 'skills', render: skillsPage, title: 'Skills' }
};

/** The crumbs after Guide: General, then this page (the section home ends at General). */
function crumbsFor(id) {
  if (id === 'skills') return [{ label: 'Skills' }];
  if (id === 'general') return [{ label: 'General' }];
  return [{ label: 'General', href: BASE }, { label: GENERAL_PAGES.find(item => item.id === id).title }];
}
/** The General pages as a list under the section nav, this page marked. */
function subNav(id) {
  if (id === 'skills') return '';
  return `<nav class="ae-gg-sub" aria-label="General pages"><ul>${GENERAL_PAGES.map(page => `<li><a class="ae-btn" href="${BASE}${page.slug}"${page.id === id ? ' aria-current="page"' : ''}>${esc(page.id === 'general' ? 'Overview' : page.title)}</a></li>`).join('')}</ul></nav>`;
}

/* The shell draws the window and reports the page ready; a failed load shows its notice. */
startGuidePage(async () => {
  const id = document.body.dataset.guidePage;
  const page = PAGES[id];
  if (!page) return;
  const title = page.title ?? GENERAL_PAGES.find(item => item.id === id).title;
  const data = await fetch(DATA_URL).then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); });
  const byId = Object.fromEntries(data.records.map(record => [record.id, record]));
  const body = renderGuideShell({ section: page.section, title, crumbs: crumbsFor(id) });
  body.insertAdjacentHTML('beforeend', `${subNav(id)}<div class="ae-gg" data-guide-content="${esc(id)}">${page.render(byId, data)}</div>`);
  page.after?.(byId);
});
