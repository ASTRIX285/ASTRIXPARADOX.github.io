/**
 * Your path by level (The Aetherium's AION 2 Guide, feature/aetherium-guide-path, 18 Oct 2026): what is done, what to
 * do now and what opens next at a Daeva's level, the weekly loop at the cap with a countdown to the reset, which content
 * the item level enters, combat power and how to raise it, and what changed since the last visit.
 *
 * With a linked Daeva it reads that Daeva's level and class (a live read when the official site answers, else the saved
 * roster card with its age). Without one the player picks a level. Ticks, the typed item level, the visit snapshot and
 * the picked level stay on this device (aetherium-memory.mjs). Saved data is never shown as live: it carries its age.
 */
import { esc, number, showSource, slotLabel } from './aetherium-ui.mjs';
import { ascentUrl, daevanionPageUrl, gearPageUrl, loadCharacter, loadGuide, loadProgression } from './aetherium-data.mjs';
import { DEVICE_REF, getMemory, memoryAge, recordVisit, setMemory, setTypedItemLevel, stepTicks, tickStep, tickWeekly, typedItemLevel, weeklyTicks } from './aetherium-memory.mjs';
import { GUIDE_CLASSES, classHref, guideHref, renderGuideShell, startGuidePage } from './guide-shell.mjs';
import { contentGates, countdown, guidePath, levelCap, nextReset, powerSteps, snapshotChanges, snapshotOf, tickValid, weeklyLoop, weeklyState } from '../../games/aion2/engine/guide-advisor.mjs';

const state = { data: null, ref: null, memRef: DEVICE_REF, linked: null, level: 1, className: null, model: null, source: null, visit: null, body: null, timer: null, doneOpen: false };

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateOf = iso => (Number.isFinite(Date.parse(iso)) ? DATE.format(new Date(iso)) : '-');
const ageWords = iso => memoryAge({ savedAt: iso })?.replace(/^saved /, '') ?? null;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tickIcon = '<svg class="ae-gp-check" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';

/* Links a step's link key opens. */
function linkFor(key) {
  if (key === 'enhance') return { href: withView(gearPageUrl(state.ref), 'enhance'), label: 'Open the Enhance tab' };
  if (key === 'daevanion') return { href: daevanionPageUrl(state.ref, state.className), label: 'Open your Daevanion boards' };
  return null;
}
function withView(href, view) {
  const url = new URL(href, location.origin);
  url.searchParams.set('view', view);
  return `${url.pathname}${url.search}`;
}

/* The Daeva block: who the path is for, or the level picker. */
function whoHtml() {
  const cap = levelCap(state.data.progression) ?? 45;
  if (state.linked) {
    const entry = state.linked.entry ?? {};
    const name = state.model?.profile.name ?? entry.name ?? 'Your Daeva';
    const age = state.model ? null : entry.seenAt ? ageWords(entry.seenAt) : null;
    const from = state.model
      ? 'Level and class from the official AION 2 site.'
      : `Level from your saved Daeva card${age ? `, read ${esc(age)}` : ''}. Not live: open the Daeva Card to refresh it.`;
    const classLink = GUIDE_CLASSES.includes(state.className) ? ` <a href="${esc(classHref(state.className))}">Your class page</a> shows where your setup differs from the build.` : '';
    return `<section class="ae-gp-who" data-gp-who="linked" aria-label="Your Daeva">
        <p class="ae-gp-for">The path for <b>${esc(name)}</b>, ${esc(state.className ?? 'class not known')} <span class="ae-gp-lv">Lv ${esc(state.level)}</span>.</p>
        <p class="ae-gp-from">${from}${classLink}</p>
      </section>`;
  }
  const options = Array.from({ length: cap }, (_, n) => `<option value="${n + 1}"${n + 1 === state.level ? ' selected' : ''}>Lv ${n + 1}</option>`).join('');
  return `<section class="ae-gp-who" data-gp-who="picker" aria-label="Pick a level">
      <label class="ae-field ae-gp-pick"><span>Your level</span><select class="ae-btn" id="aeGpLevel">${options}</select></label>
      <p class="ae-gp-from">No Daeva linked. <a href="/hub/aetherium/#aeSearch">Find your Daeva</a> and the path follows your level and class.</p>
    </section>`;
}

/* Combat power and the changes since the last visit (linked Daeva, live read only). */
function powerHtml() {
  const steps = powerSteps(state.level, state.data);
  const cp = state.model && Number.isFinite(state.model.profile.combatPower) ? state.model.profile.combatPower : null;
  const head = cp !== null
    ? `<p class="ae-gp-cp"><span>Combat power</span><b data-gp-cp>${esc(number(cp))}</b><small>From the official AION 2 site.</small></p>`
    : state.linked ? '<p class="ae-gp-cp is-pending"><span>Combat power</span><b>-</b><small>Shows when the official site answers.</small></p>' : '';
  const row = (step, n) => {
    const link = step.link ? linkFor(step.link) : null;
    return `<li data-gp-power="${esc(step.id)}"><b class="ae-gp-n" aria-hidden="true">${n + 1}</b><span><strong>${esc(step.title)}</strong> ${esc(step.text)}${link ? ` <a href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</span></li>`;
  };
  const later = steps.later.length ? `<p class="ae-gp-later">Later: ${steps.later.map(step => `${esc(step.title)} (Lv ${esc(step.from)})`).join(', ')}.</p>` : '';
  return `<section class="ae-gp-card ae-gp-power" aria-labelledby="aeGpPowerTitle">
      <h2 id="aeGpPowerTitle">Power level</h2>
      ${head}
      ${sinceHtml()}
      <h3>How to raise it, in order</h3>
      <ol class="ae-gp-order">${steps.now.map(row).join('')}</ol>
      ${later}
    </section>`;
}

function changeWords(change) {
  const slot = esc(change.slot ? slotLabel(change.slot) : '');
  if (change.kind === 'level') return `Level ${esc(change.from)} to ${esc(change.to)}`;
  if (change.kind === 'combatPower') { const d = change.to - change.from; return `Combat power ${d >= 0 ? 'up' : 'down'} ${esc(number(Math.abs(d)))} to ${esc(number(change.to))}`; }
  if (change.kind === 'itemLevel') return `Item level ${esc(number(change.from))} to ${esc(number(change.to))}`;
  if (change.kind === 'enchant') return `${slot} +${esc(change.from ?? 0)} to +${esc(change.to ?? 0)}`;
  if (change.kind === 'grade') return `${slot}: ${esc(change.from.grade ?? '-')} ${esc(change.from.name ?? '')} to ${esc(change.to.grade ?? '-')} ${esc(change.to.name ?? '')}`;
  if (change.kind === 'new') return `${slot}: ${esc(change.to.grade ?? '')} ${esc(change.to.name ?? '')} worn`;
  return `${slot} taken off`;
}
function sinceHtml() {
  const visit = state.visit;
  if (!visit) return '';
  if (visit.first) return '<p class="ae-gp-since" data-gp-since="first">First visit on this device: next time this shows what changed.</p>';
  const when = dateOf(visit.since);
  if (!visit.changes.length) return `<p class="ae-gp-since" data-gp-since="same">Since your last visit (${esc(when)}): no change.</p>`;
  return `<div class="ae-gp-since" data-gp-since="changes"><p>Since your last visit (${esc(when)}):</p><ul>${visit.changes.map(change => `<li>${changeWords(change)}</li>`).join('')}</ul></div>`;
}

/* Item level: the official value when a live read has it, else the one the player typed (with its age). */
function itemLevelNow() {
  const official = state.model && Number.isFinite(state.model.profile.itemLevel) ? state.model.profile.itemLevel : null;
  if (official !== null) return { value: official, from: 'official' };
  const typed = typedItemLevel(state.memRef);
  return typed ? { value: typed.value, from: 'typed', at: typed.at } : null;
}
function gatesHtml() {
  const now = itemLevelNow();
  const gates = contentGates(now?.value ?? null, state.level, state.data);
  const typed = typedItemLevel(state.memRef);
  const label = now?.from === 'official'
    ? `<p class="ae-gp-il"><span>Item level</span><b data-gp-il>${esc(number(now.value))}</b><small>From the official AION 2 site.</small></p>`
    : now ? `<p class="ae-gp-il"><span>Item level</span><b data-gp-il>${esc(number(now.value))}</b><small data-gp-il-age>You typed this ${esc(ageWords(now.at) ?? '')}. Not live: check it in game.</small></p>` : '';
  const form = now?.from === 'official' ? '' : `<form class="ae-gp-ilform" id="aeGpIlForm">
      <label class="ae-field"><span>${now ? 'Update your item level' : 'Type your item level once'}</span><input id="aeGpIl" name="itemLevel" type="number" inputmode="numeric" min="0" max="9999" step="1" value="${typed ? esc(typed.value) : ''}" placeholder="e.g. 640"></label>
      <button class="ae-btn" type="submit">Save</button>
    </form>
    <p class="ae-gp-note">It is shown in game on your character window. Saved on this device only.</p>`;
  const gate = item => `<li data-gp-gate="${esc(item.id)}"><span>${esc(item.name)}</span><small>Lv ${esc(item.level)}, item level ${esc(number(item.itemLevel))}${item.note ? `. ${esc(item.note)}` : ''}</small></li>`;
  const open = now ? (gates.open.length ? `<h3>You can enter now</h3><ul class="ae-gp-gates">${gates.open.map(gate).join('')}</ul>` : '<p>Nothing on this list yet: the first Expedition opens at Lv 20.</p>') : '<p class="ae-gp-note">Save your item level to see which content you can enter now.</p>';
  const next = gates.next
    ? `<p class="ae-gp-next" data-gp-next-gate="${esc(gates.next.id)}">Next gate: <b>${esc(gates.next.name)}</b> at item level ${esc(number(gates.next.itemLevel))}, ${esc(number(gates.next.needsItemLevel))} to go.</p>`
    : gates.nextByLevel ? `<p class="ae-gp-next" data-gp-next-gate="${esc(gates.nextByLevel.id)}">Next by level: <b>${esc(gates.nextByLevel.name)}</b> at Lv ${esc(gates.nextByLevel.level)} (item level ${esc(number(gates.nextByLevel.itemLevel))}).</p>` : '';
  return `<section class="ae-gp-card ae-gp-item" aria-labelledby="aeGpItemTitle">
      <h2 id="aeGpItemTitle">What your item level enters</h2>
      ${label}${form}${open}${next}
      <p class="ae-gp-note">Entry item levels from the AION2 Wiki. Many parties ask for more.</p>
    </section>`;
}

/* The path: now, coming up and done. */
function stepHtml(step, ticked) {
  const link = step.link ? linkFor(step.link) : null;
  const press = ticked ? 'true' : 'false';
  const tick = `<button class="ae-btn ae-gp-tick" type="button" aria-pressed="${press}" data-tick-step="${esc(step.id)}" aria-label="${ticked ? 'Done: untick' : 'Mark done'}: ${esc(step.title)}">${tickIcon}<span>${ticked ? 'Done' : 'Mark done'}</span></button>`;
  return `<li class="ae-gp-step is-${esc(step.state)}" data-gp-step="${esc(step.id)}">
      <span class="ae-gp-lvchip">Lv ${esc(step.level)}</span>
      <div class="ae-gp-copy"><strong>${esc(step.title)}</strong><p>${esc(step.text)}${link ? ` <a href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</p>${step.status === 'reported' ? '<small>One source so far.</small>' : ''}</div>
      ${step.state === 'next' || step.why === 'passed' || step.why === 'behind' ? '' : tick}
    </li>`;
}
function pathHtml(path) {
  const ticks = new Set(stepTicks(state.memRef));
  const done = path.done.map(step => `<li class="ae-gp-step is-done" data-gp-step="${esc(step.id)}"><span class="ae-gp-done-mark" aria-hidden="true">${tickIcon}</span><span class="ae-gp-lvchip">Lv ${esc(step.level)}</span><div class="ae-gp-copy"><strong>${esc(step.title)}</strong></div>${step.why === 'ticked' ? `<button class="ae-btn ae-gp-tick" type="button" aria-pressed="true" data-tick-step="${esc(step.id)}" aria-label="Done: untick ${esc(step.title)}">${tickIcon}<span>Done</span></button>` : ''}</li>`).join('');
  return `<section class="ae-gp-card ae-gp-path" aria-labelledby="aeGpNowTitle">
      <h2 id="aeGpNowTitle">Now, at Lv ${esc(path.level)}</h2>
      <ul class="ae-gp-steps" data-gp-list="now">${path.now.map(step => stepHtml(step, ticks.has(step.id))).join('') || '<li class="ae-gp-empty">Nothing left at this level. Well done.</li>'}</ul>
    </section>
    <section class="ae-gp-card ae-gp-path" aria-labelledby="aeGpNextTitle">
      <h2 id="aeGpNextTitle">Coming up</h2>
      ${path.next.length ? `<ul class="ae-gp-steps" data-gp-list="next">${path.next.map(step => stepHtml(step, false)).join('')}</ul>` : `<p>You are at the level cap. Everything is open: the weekly loop below is your routine now.</p>`}
      ${path.later.length ? `<p class="ae-gp-later">After that: ${path.later.map(step => `${esc(step.title)} (Lv ${esc(step.level)})`).join(', ')}.</p>` : ''}
    </section>
    <details class="ae-gp-card ae-gp-done" id="aeGpDone"${state.doneOpen ? ' open' : ''}${path.done.length ? '' : ' hidden'}>
      <summary><h2>Done <span class="ae-gp-count">${esc(path.done.length)}</span></h2></summary>
      <ul class="ae-gp-steps" data-gp-list="done">${done}</ul>
    </details>`;
}

/* The weekly loop at the cap: each item with its cycle, a tick for this cycle, and the countdowns. */
function weeklyHtml() {
  const loop = weeklyLoop(state.data);
  const now = Date.now();
  const ticks = weeklyTicks(state.memRef, (at, id) => tickValid(at, loop.items.find(item => item.id === id)?.cycle ?? 'weekly', now, state.data));
  const items = weeklyState(state.data, ticks, now);
  const cycleWord = { daily: 'Daily', weekly: 'Weekly', energy: 'Energy' };
  const row = item => {
    const locked = item.gate && itemLevelNow() && itemLevelNow().value < item.gate.itemLevel;
    return `<li class="ae-gp-week" data-gp-weekly="${esc(item.id)}">
        <span class="ae-gp-cycle" data-cycle="${esc(item.cycle)}">${esc(cycleWord[item.cycle] ?? item.cycle)}</span>
        <div class="ae-gp-copy"><strong>${esc(item.title)}</strong> <small>${esc(item.when)}</small><p>${esc(item.text)}${item.gate ? ` Needs item level ${esc(number(item.gate.itemLevel))}.` : ''}${locked ? ' <em>Not yet at your item level.</em>' : ''}</p></div>
        <button class="ae-btn ae-gp-tick" type="button" aria-pressed="${item.done ? 'true' : 'false'}" data-tick-weekly="${esc(item.id)}" aria-label="${item.done ? 'Done: untick' : 'Mark done'}: ${esc(item.title)}">${tickIcon}<span>${item.done ? 'Done' : 'Mark done'}</span></button>
      </li>`;
  };
  return `<section class="ae-gp-card ae-gp-weekly" aria-labelledby="aeGpWeekTitle">
      <h2 id="aeGpWeekTitle">${esc(loop.label)}</h2>
      <div class="ae-gp-clocks">
        <p data-gp-reset="weekly"><span>Weekly reset</span><b data-gp-count="weekly">${esc(countdownWords('weekly'))}</b><small>Every Wednesday, 07:00 UTC</small></p>
        <p data-gp-reset="daily"><span>Daily reset</span><b data-gp-count="daily">${esc(countdownWords('daily'))}</b><small>Every day, 07:00 UTC</small></p>
      </div>
      <p class="ae-gp-note">Ticks clear at each item's reset. Expedition rewards cost Odyle Energy; when it refills is not confirmed yet.</p>
      <ul class="ae-gp-weeks">${items.map(row).join('')}</ul>
    </section>`;
}
function countdownWords(cycle) {
  const left = countdown(Date.now(), nextReset(Date.now(), cycle, state.data));
  if (left.days) return `${plural(left.days, 'day')} ${plural(left.hours, 'hour')}`;
  if (left.hours) return `${plural(left.hours, 'hour')} ${plural(left.minutes, 'minute')}`;
  return plural(Math.max(1, left.minutes), 'minute');
}

/* Loadouts: the shape is saved per Daeva (aetherium-memory.mjs); the page only says they are coming. */
const loadoutsHtml = () => `<section class="ae-gp-card ae-gp-loadouts" aria-labelledby="aeGpLoadTitle">
    <h2 id="aeGpLoadTitle">Loadouts</h2>
    <p>The game keeps 3 loadouts each for looks, armour and skills. Saving up to 3 named setups for your Daeva here is coming soon.</p>
  </section>`;

function sourcesHtml() {
  const seen = new Map();
  for (const record of state.data.guide.records) for (const source of record.provenance ?? []) if (source.url) seen.set(source.url, `${source.publisher}: ${source.title}`);
  return `<details class="ae-gp-sources"><summary>Sources</summary><ul>${[...seen].map(([url, label]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`).join('')}</ul><p>Wiki facts are written in our own words. Level unlocks come from our progression data.</p></details>`;
}

function render() {
  const path = guidePath(state.level, state.data, { ticked: stepTicks(state.memRef) });
  state.body.innerHTML = `
    <p class="ae-gd-lede">What to do at each level, from Lv 1 to the weekly loop at Lv ${esc(path.cap)}. Tick a step when you have done it: the Guide remembers on this device.</p>
    ${whoHtml()}
    <div class="ae-gp-grid">
      <div class="ae-gp-main">${pathHtml(path)}${path.weekly ? weeklyHtml() : ''}</div>
      <aside class="ae-gp-side">${powerHtml()}${gatesHtml()}${loadoutsHtml()}</aside>
    </div>
    ${sourcesHtml()}
    ${state.ref ? `<p class="ae-gp-links"><a class="ae-btn" href="${esc(ascentUrl(state.ref, state.className))}">Your Ascent Plan</a></p>` : ''}`;
  document.body.dataset.gpLevel = String(state.level);
}

function wire() {
  state.body.addEventListener('change', event => {
    if (event.target.id !== 'aeGpLevel') return;
    state.level = Number(event.target.value) || 1;
    setMemory(DEVICE_REF, { level: state.level });
    render();
    document.getElementById('aeGpLevel')?.focus();
  });
  state.body.addEventListener('click', event => {
    const step = event.target.closest('[data-tick-step]');
    const week = event.target.closest('[data-tick-weekly]');
    if (!step && !week) return;
    const button = step ?? week;
    const done = button.getAttribute('aria-pressed') !== 'true';
    if (step) tickStep(state.memRef, step.dataset.tickStep, done); else tickWeekly(state.memRef, week.dataset.tickWeekly, done);
    const key = step ? `[data-tick-step="${step.dataset.tickStep}"]` : `[data-tick-weekly="${week.dataset.tickWeekly}"]`;
    render();
    state.body.querySelector(key)?.focus();
  });
  // The Done list stays open or closed across redraws, as the player left it.
  state.body.addEventListener('toggle', event => { if (event.target.id === 'aeGpDone') state.doneOpen = event.target.open; }, true);
  state.body.addEventListener('submit', event => {
    if (event.target.id !== 'aeGpIlForm') return;
    event.preventDefault();
    setTypedItemLevel(state.memRef, event.target.elements.itemLevel.value);
    render();
  });
  // The countdowns move once a minute; a reset that passes redraws the loop so its ticks clear.
  let lastWeekly = nextReset(Date.now(), 'weekly', state.data);
  let lastDaily = nextReset(Date.now(), 'daily', state.data);
  state.timer = setInterval(() => {
    const w = nextReset(Date.now(), 'weekly', state.data);
    const d = nextReset(Date.now(), 'daily', state.data);
    if (w !== lastWeekly || d !== lastDaily) { lastWeekly = w; lastDaily = d; render(); return; }
    for (const cycle of ['weekly', 'daily']) { const el = state.body.querySelector(`[data-gp-count="${cycle}"]`); if (el) el.textContent = countdownWords(cycle); }
  }, 30000);
}

/* A live read of the linked Daeva: its level, class, combat power and gear, and this visit's snapshot. */
async function readLive() {
  try {
    const { model, source } = await loadCharacter(state.ref);
    state.model = model;
    state.source = source;
    if (Number.isFinite(model.profile.level)) state.level = Math.min(levelCap(state.data.progression) ?? 45, model.profile.level);
    state.className = model.profile.class ?? state.className;
    state.visit = recordVisit(state.memRef, { ...snapshotOf(model), at: source.fetchedAt ?? new Date().toISOString() }, snapshotChanges);
    showSource(source);
    render();
  } catch { /* the site is not answering or not connected: the saved card stays, with its age */ }
}

startGuidePage(async linked => {
  state.body = renderGuideShell({ section: 'guides', title: 'Your path by level', crumbs: [{ label: 'Guides', href: guideHref('guides') }, { label: 'Your path by level' }] });
  const [guide, progression] = await Promise.all([loadGuide(), loadProgression()]);
  state.data = { guide, progression };
  const cap = levelCap(progression) ?? 45;
  if (linked) {
    state.linked = linked;
    state.ref = linked.ref;
    state.memRef = linked.ref;
    state.className = linked.entry?.className ?? null;
    state.level = Math.max(1, Math.min(cap, Number(linked.entry?.level) || 1));
  } else {
    const saved = Number(getMemory(DEVICE_REF)?.level);
    state.level = Number.isFinite(saved) && saved >= 1 ? Math.min(cap, saved) : 1;
  }
  render();
  wire();
  // The live read never holds up the page: the saved card shows first, with its age, and the read redraws it.
  if (linked) readLive();
});
