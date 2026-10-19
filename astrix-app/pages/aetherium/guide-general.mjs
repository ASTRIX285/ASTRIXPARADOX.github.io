/**
 * The Guide, General section (The Aetherium): About AION 2, Reset times, Membership and the Market, Controls and the skill
 * bar, Loadouts and the FAQ, plus the general Skills page. Every fact comes from data/advisor/general.json, one record per
 * fact with its status and sources; this file only lays them out. The page is named by body[data-guide-page].
 * Reset times are worked out from the UTC rule and shown in the player's own time zone, with a live countdown.
 */
import { $, esc } from './aetherium-ui.mjs';
import { GUIDE_CLASSES, classHref, renderGuideShell, startGuidePage } from './guide-shell.mjs';
import { nextReset, countdownWords } from './guide-resets.mjs';

const DATA_URL = '/astrix-app/games/aion2/data/advisor/general.json';
const BASE = '/hub/aetherium/guide/general/';
const SKILL_BAR_URL = '/hub/aetherium/ascent/skill-bar/';
const MACRO_URL = '/hub/aetherium/ascent/macro/';
const ASCENT_URL = '/hub/aetherium/ascent/';

/** The General pages in reading order: slug ('' is the section home), title, one line for the section home. */
export const GENERAL_PAGES = Object.freeze([
  { id: 'general', slug: '', title: 'General' },
  { id: 'about', slug: 'about/', title: 'About AION 2', blurb: 'The two factions, the story so far and what Season 1 holds.' },
  { id: 'resets', slug: 'resets/', title: 'Reset times', blurb: 'When the daily and weekly resets happen, in your own time.' },
  { id: 'market', slug: 'market/', title: 'Membership and the Market', blurb: 'Why you cannot trade directly, and what Membership unlocks.' },
  { id: 'controls', slug: 'controls/', title: 'Controls and the skill bar', blurb: 'Control modes, keys, macros and how to lay out your bar.' },
  { id: 'loadouts', slug: 'loadouts/', title: 'Loadouts', blurb: 'The 3 loadouts for looks, armour and skills, and how to plan them.' },
  { id: 'faq', slug: 'faq/', title: 'FAQ', blurb: 'Quick answers, grouped like the game\'s settings, each with its source.' }
]);

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone';
const timeOf = date => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
const dayOf = date => new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
const whenOf = date => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
const utcClock = rule => `${String(rule.hourUtc).padStart(2, '0')}:${String(rule.minuteUtc ?? 0).padStart(2, '0')} UTC`;

/* Sources and status, shown under every fact. */
const DATE = on => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${on}T00:00:00Z`));
function sourceItem(source) {
  if (source.kind === 'in-game-capture') return `<li data-source-kind="in-game">${esc(source.capturedBy)}, in game, ${esc(DATE(source.capturedOn))}</li>`;
  return `<li data-source-kind="guide"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" data-source-url>${esc(source.title)}</a> <small>${esc(source.publisher)}</small></li>`;
}
function sources(list) {
  const seen = new Set();
  const unique = (list ?? []).filter(source => { const key = source.url ?? `${source.capturedBy}${source.capturedOn}${source.where}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return unique.length ? `<ul class="ae-gg-src" aria-label="Sources">${unique.map(sourceItem).join('')}</ul>` : '';
}
/* Facts show no status tags or in-game checks (Miguel, 18 Oct 2026). Status and tests stay in the data. */
const statusTag = () => '';
const pendingWhy = () => '';
const testLine = () => '';
const path = steps => steps.map(esc).join(' <span aria-hidden="true">›</span> ');

/** One fact as a card: its label, status, text or lines, any extra markup, then its sources. */
function fact(record, extra = '', { tag = 'h2' } = {}) {
  if (!record) return '';
  return `<section class="ae-gg-card" data-fact="${esc(record.id)}" aria-labelledby="gd-${esc(record.id)}">
    <${tag} class="ae-gg-h" id="gd-${esc(record.id)}">${esc(record.label)} ${statusTag(record)}</${tag}>
    ${record.text ? `<p>${esc(record.text)}</p>` : ''}
    ${record.lines ? `<ul class="ae-gg-list">${record.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
    ${extra}${pendingWhy(record)}${testLine(record)}
    ${sources(record.provenance)}
  </section>`;
}

/* Pages. Each takes the records by id and returns the page body. */
function generalHome() {
  return `<p class="ae-gg-lead">The basics every Daeva needs: who you fight for, when the game resets, how buying and selling works, how to set up your keys, and quick answers to common questions.</p>
    <ul class="ae-gg-tiles">${GENERAL_PAGES.slice(1).map(page => `<li><a class="ae-gg-tile" href="${BASE}${page.slug}" data-guide-link="${page.id}"><b>${esc(page.title)}</b><span>${esc(page.blurb)}</span></a></li>`).join('')}</ul>`;
}
function aboutPage(r) {
  const season = r['season-1'];
  const launch = r.launch;
  return `<p class="ae-gg-lead">AION 2 is NCSOFT's MMORPG set in the world of Atreia. You play a Daeva, a winged warrior, for one of two factions.</p>
    <div class="ae-gg-pair">${fact(r['faction-elyos'])}${fact(r['faction-asmodians'])}</div>
    ${fact(r['faction-rules'])}
    ${fact(r.story)}
    ${fact(season, `<dl class="ae-gg-stats"><div><dt>Level cap</dt><dd data-season-cap>Lv ${esc(season.value.levelCap)}</dd></div><div><dt>Daevanion points</dt><dd>${esc(season.value.daevanionPoints)}</dd></div><div><dt>Heroic items</dt><dd>None in Season 1</dd></div></dl>`)}
    ${fact(launch)}`;
}
function resetsPage(r) {
  const rule = r['reset-times'];
  const { daily, weekly } = rule.value;
  return `<p class="ae-gg-lead">Daily and weekly content refreshes at the same time for everyone. Below is that time in your own time zone, worked out on your device.</p>
    <div class="ae-gg-pair" id="aeResets" data-zone="${esc(zone())}">
      <section class="ae-gg-card ae-gg-reset" data-reset="daily" aria-labelledby="gdDaily">
        <h2 class="ae-gg-h" id="gdDaily">Daily reset</h2>
        <p class="ae-gg-big" data-reset-local></p>
        <p>Every day at <b data-reset-utc>${esc(utcClock(daily))}</b>.</p>
        <p class="ae-gg-next">Next: <span data-reset-next></span> <b data-reset-in></b></p>
      </section>
      <section class="ae-gg-card ae-gg-reset" data-reset="weekly" aria-labelledby="gdWeekly">
        <h2 class="ae-gg-h" id="gdWeekly">Weekly reset</h2>
        <p class="ae-gg-big" data-reset-local></p>
        <p>Every ${esc(weekly.weekdayName)} at <b data-reset-utc>${esc(utcClock(weekly))}</b>.</p>
        <p class="ae-gg-next">Next: <span data-reset-next></span> <b data-reset-in></b></p>
      </section>
    </div>
    <p class="ae-gg-zone">Shown in <b data-reset-zone>${esc(zone())}</b>. ${esc(rule.notes[0])}</p>
    ${fact(rule, `<ul class="ae-gg-list"><li>${esc(rule.notes[1])}</li></ul>`)}
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
    ${fact(m, `<p class="ae-gg-chips">${m.value.unlocks.map(name => `<span class="ae-gg-chip">${esc(name)}</span>`).join('')}</p>`)}
    ${fact(r['market-tip'])}
    ${fact(r['shared-entries'])}`;
}
/** The bar as the game lays it out: 1 to 8, Q, E, then the mouse and the second stack, with the order own keys fill in. */
function barPicture(layout) {
  const fill = new Map(layout.value.fill.map((key, index) => [key, index + 1]));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E'];
  const cap = key => `<li class="ae-gg-key${layout.value.stackKeys.includes(key) ? ' is-stack' : ''}" data-bar-key="${esc(key)}"><b>${esc(key)}</b><small aria-label="filled ${fill.get(key)}${['st', 'nd', 'rd'][fill.get(key) - 1] ?? 'th'}">${fill.get(key)}</small></li>`;
  return `<figure class="ae-gg-bar" id="aeGuideBar">
      <ol class="ae-gg-keys" aria-label="Keys 1 to 8, Q and E, numbered in the order you fill them">${keys.map(cap).join('')}</ol>
      <ol class="ae-gg-keys is-mouse" aria-label="Then the mouse and the second stack">
        <li class="ae-gg-key is-wide" data-bar-key="LMB"><b>Left click</b><small>Main attack</small></li>
        <li class="ae-gg-key is-wide is-macro" data-bar-key="RMB"><b>Right click</b><small>Main line</small></li>
        <li class="ae-gg-key is-wide is-macro" data-bar-key="B"><b>Stack</b><small>Second macro stack</small></li>
      </ol>
      <p class="ae-gg-key is-space" data-bar-key="Space"><b>Space bar</b><small>Defiance</small></p>
      <figcaption>Small numbers: the order own keys fill in. Q and E (marked) take a stack of skills. The two macro stacks sit either side of your main attack.</figcaption>
    </figure>`;
}
function controlsPage(r) {
  const modes = r['control-modes'], keys = r['default-keys'], ks = r['key-settings'], menus = r['no-hotkey-menus'], macro = r['macro-presets'];
  return `<p class="ae-gg-lead">How to move, target and fight, and how to lay out your skill bar so your hand never has to stretch.</p>
    ${fact(r['bar-layout'], `${barPicture(r['bar-layout'])}<p class="ae-gg-actions"><a class="ae-btn" href="${SKILL_BAR_URL}" data-guide-link="skill-bar">Open the Skill Bar plan</a></p><p class="ae-muted">The Ascent Plan's Skill Bar screen fills this layout with your class's skills, key by key and row by row.</p>`)}
    ${fact(r['space-defiance'])}
    ${fact(macro, `<p class="ae-gg-path">Set the key in ${path(macro.value.path)}.</p><p class="ae-gg-actions"><a class="ae-btn" href="${MACRO_URL}" data-guide-link="macro">Open the Macro plan</a></p>`)}
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
    ${fact(l, `<ul class="ae-gg-loadouts" id="aeLoadouts">${kinds.map(([key, name]) => `<li data-loadout="${key}"><b>${esc(name)}</b><span aria-label="${esc(l.value[key])} loadouts">${Array.from({ length: l.value[key] }, (_, i) => `<i>${i + 1}</i>`).join('')}</span></li>`).join('')}</ul>`)}
    ${fact(r['loadouts-aetherium'], `<p class="ae-gg-actions"><a class="ae-btn" href="${ASCENT_URL}" data-guide-link="ascent">Plan a loadout</a></p>`)}`;
}
function faqPage(r, data) {
  const faq = Object.values(r).filter(record => record.section === 'faq');
  const extras = { items: ['auto-potions', 'looting', 'auto-extract', 'lock-items', 'flight', 'characters'], trouble: ['trouble-basics', 'trouble-codes', 'trouble-known', 'trouble-report'] };
  const extra = id => {
    const record = r[id];
    const rows = record.value?.codes ?? record.value?.items;
    return fact(record, rows ? `<dl class="ae-gg-dl">${rows.map(([what, fix]) => `<div><dt>${esc(what)}</dt><dd>${esc(fix)}</dd></div>`).join('')}</dl>` : '', { tag: 'h3' });
  };
  const groups = Object.entries(data.groups);
  return `<p class="ae-gg-lead">Short answers to the questions new and returning players ask most. Each answer names its source.</p>
    <nav class="ae-gg-jump" aria-label="FAQ groups"><ul>${groups.map(([id, name]) => `<li><a class="ae-btn" href="#faq-${id}">${esc(name)}</a></li>`).join('')}</ul></nav>
    ${groups.map(([id, name]) => `<section class="ae-gg-group" id="faq-${id}" data-faq-group="${id}" aria-labelledby="faq-${id}-h">
      <h2 class="ae-gg-h2" id="faq-${id}-h">${esc(name)}</h2>
      <div class="ae-gg-qs">${faq.filter(item => item.group === id).map(item => `<details class="ae-gg-q" data-faq="${esc(item.id)}">
        <summary>${esc(item.q)}</summary>
        <p>${esc(item.a)}</p>${sources(item.provenance)}
      </details>`).join('')}</div>
      ${(extras[id] ?? []).map(extra).join('')}
    </section>`).join('')}`;
}
function skillsPage(r) {
  const spec = r['skill-specialty'];
  const steps = [[8, '3 perks open, first perk slot'], [12, '4th perk, second slot'], [16, '5th perk'], [20, 'third slot']];
  return `<p class="ae-gg-lead">How skill levels work for every class. Your own class's skills, and where to put them, are on its class page and in the Ascent Plan.</p>
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
  controls: { section: 'general', render: controlsPage },
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
