/**
 * Ascent Plan (The Aetherium): what to do next, for any class, role and level.
 *
 * The plan opens on a menu of cards like the game's own menu (body data-ae-view absent). Each card opens
 * its own page (hub/aetherium/ascent/<screen>/, body data-ae-view="<screen>") drawn like that game
 * window, with a step-by-step guide that lights up what to do.
 *
 * Two ways in. With a Daeva (from the link or the active roster slot) the plan reads the official site
 * and adds fixes for that exact character. Without one, a new player picks class, role and level
 * and gets the plan from static data alone, with no call to the official site. Advice comes from
 * games/aion2/engine/ascent-advisor.mjs; the sources behind every pick stay in the data, never on the page.
 */
import { ArmoryUnavailable, ascentUrl, explain, gearUrl, loadAdvisor, loadBoard, loadCharacter, prefetchAdvisor, refFromUrl, regionName, roster, sourceLabel } from './aetherium-data.mjs';
import { $, esc, infoCardHtml, isPending, markCharacterShown, markReady, openInfo, setFaction, showNotice, showSource, wireDrawer } from './aetherium-ui.mjs';
import { guideSeen, markGuideSeen, mountGuide } from './aetherium-guide.mjs';
import { renderNext, renderStepBar } from './aetherium-flow.mjs';
import { AION2_CLASSES, ROLES, buildAscentPlan, clampLevel } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { affordable, explainNode, planDaevanionBoard } from '/astrix-app/games/aion2/engine/daevanion-planner.mjs';
import { KIND_LABEL, boardGridStyle, nodeArt as boardNodeArt, nodeImg as boardNodeImg, nodeTileHtml } from './daevanion-board.mjs';

const state = { model: null, source: null, ref: null, className: 'Gladiator', role: null, level: 1, data: null, plan: null };
const planner = { boardId: null, nodes: new Map(), selected: null, board: null, split: null, observer: null };
const POINTS_KEY = 'aetherium.daevanionPoints.v1';

const BEGINNER = { 'very high': 'Very easy to learn', high: 'Easy to learn', medium: 'Medium to learn', low: 'Hard to learn' };
const CONFIDENCE = {
  consensus: 'Most top builds agree on these.',
  'top-player data': 'What top players run.',
  'single-source': 'An early pick, less tested.'
};

const pendingNote = value => `<p class="ae-pending"><span>Not confirmed yet.</span> ${esc(value.reason)}</p>`;

function fillClassSelect() {
  $('#aeClass').innerHTML = AION2_CLASSES.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
}

function fillRoleSelect(roles, chosen) {
  $('#aeRole').innerHTML = roles.map(item => {
    const tag = item.main ? 'main role' : item.status === 'pending' ? 'no build yet' : item.status === 'partial' ? 'partly confirmed' : item.buildLabel;
    return `<option value="${esc(item.role)}"${item.role === chosen ? ' selected' : ''}>${esc(item.label)} (${esc(tag)})</option>`;
  }).join('');
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const className = AION2_CLASSES.find(name => name.toLowerCase() === String(params.get('class') ?? '').toLowerCase());
  const role = Object.keys(ROLES).includes(params.get('role')) ? params.get('role') : null;
  const level = params.has('level') ? Number(params.get('level')) : null;
  return { className, role, level };
}

/** Keeps the address bookmarkable: the Daeva link, or class, role and level for a manual plan. */
function writeUrl() {
  const params = new URLSearchParams(planQuery());
  // The Daevanion screen keeps its board in the address, so a link opens that exact board.
  if (VIEW === 'daevanion' && state.model && planner.boardId) params.set('board', planner.boardId);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function renderDaevaLine() {
  const el = $('#aeDaeva');
  if (!state.model) {
    const active = roster.active();
    el.hidden = !active;
    if (active) el.innerHTML = `Planning by hand. <a href="${esc(ascentUrl({ serverId: active.serverId, characterId: active.characterId, region: active.region }, active.className))}" data-use-daeva>Use ${esc(active.name)} (${esc(active.className)} Lv ${esc(active.level)}) instead</a>`;
    return;
  }
  const p = state.model.profile;
  el.hidden = false;
  el.innerHTML = `Planning for <strong>${esc(p.name)}</strong>, ${esc(p.class)} Lv ${esc(p.level)} on ${esc(p.server.name)}, ${esc(regionName(state.model.source.region))}. <button type="button" class="ae-linkish" data-plan-by-hand>Plan another class by hand</button>`;
}

function setFormLock() {
  const locked = Boolean(state.model);
  $('#aeClass').disabled = locked;
  $('#aeLevel').disabled = locked;
  $('#aeClass').title = locked ? 'Taken from your Daeva' : '';
  $('#aeLevel').title = locked ? 'Taken from your Daeva' : '';
}

/* Screens. The Ascent Plan opens on a menu of cards, like the game's own menu. Each card opens its own
   page (its own address) laid out like that game window, with a guide that walks the player through
   what to do there, one step at a time. Reasons stay short and show where they are needed. */
const VIEWS = {
  mastery: { title: 'Mastery', window: 'Skill', blurb: 'Which skills to level and which Specialty perks to pick' },
  'skill-bar': { title: 'Skill Bar', window: 'Where to put your skills', blurb: 'Where each skill should go on your bars. This is the plan, not what is on them now.' },
  stigma: { title: 'Stigma', window: 'Stigma', blurb: 'The four stigmas to slot, and good swaps' },
  daevanion: { title: 'Daevanion', window: 'Daevanion', blurb: 'Your boards with the route to take, node by node' },
  macro: { title: 'Macro', window: 'Macro', blurb: 'The skill order to put in Macro 1' },
  stats: { title: 'Stats', window: 'Stats', blurb: 'What to look for on gear and manastones' }
};
const VIEW = Object.hasOwn(VIEWS, document.body.dataset.aeView ?? '') ? document.body.dataset.aeView : 'menu';

const ICON = {
  macro: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="12" width="38" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M11 19h4M19 19h4M27 19h4M35 19h2M11 25h4M19 25h10M33 25h4M14 31h20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  stats: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 39V27M19 39V17M29 39V22M39 39V9" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5l15 6v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 15v18M17 22h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  mastery: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38L30 18M30 18l4-10 6 6-10 4M14 30l4 4M8 40l4-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stigma: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  bar: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="15" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="26" y="14" width="9" height="9" rx="1.5" fill="currentColor"/><rect x="37" y="14" width="7" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="4" y="27" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="15" y="27" width="9" height="9" rx="1.5" fill="currentColor"/><rect x="26" y="27" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="37" y="27" width="7" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  mouse: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="13" y="5" width="22" height="38" rx="11" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 5v13M13 18h22" stroke="currentColor" stroke-width="2.5"/><path d="M9 22v8" stroke="var(--ae-ice)" stroke-width="4" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  daevanion: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h8v8H8zM20 8h8v8h-8zM32 8h8v8h-8zM20 20h8v8h-8zM8 32h8v8H8zM20 32h8v8h-8zM32 32h8v8h-8zM12 16v16M36 16v16M16 24h4M28 24h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>'
};

/** The address of a screen, keeping who and what is being planned. */
function planQuery() {
  const params = new URLSearchParams();
  if (state.ref && state.model) {
    params.set('serverId', state.ref.serverId);
    params.set('characterId', state.ref.characterId);
    params.set('region', state.ref.region ?? 'eu');
    params.set('class', state.className.toLowerCase());
    if (state.role) params.set('role', state.role);
  } else {
    params.set('class', state.className.toLowerCase());
    if (state.role) params.set('role', state.role);
    params.set('level', state.level);
  }
  return params.toString();
}
function viewHref(view) {
  if (view === 'gear') return gearUrl(state.model ? state.ref : null);
  return `/hub/aetherium/ascent/${view === 'menu' ? '' : `${view}/`}?${planQuery()}`;
}

const art = (src, alt = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
/** The game's icon for a skill named at the start of a line ("Ruinous Blow (keep ... up)"). */
function skillIcon(plan, text) {
  const names = Object.keys(plan.skillIcons ?? {}).sort((a, b) => b.length - a.length);
  const name = names.find(item => String(text).startsWith(item));
  return name ? plan.skillIcons[name] : null;
}
function viewArt(view, plan) {
  if (view === 'skill-bar') return ICON.bar;
  if (view === 'mastery') {
    const key = plan.mastery?.active.find(entry => entry.priority === 1);
    return key?.icon ? art(key.icon) : ICON.mastery;
  }
  if (view === 'stigma') return plan.stigmas?.slots?.[0]?.icon ? art(plan.stigmas.slots[0].icon) : ICON.stigma;
  if (view === 'daevanion') return `<img src="${esc(nodeArt('unique', true))}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  return ICON[view] ?? '';
}

function viewStatus(view, plan) {
  if (plan.pending) return 'Not confirmed yet';
  if (view === 'mastery') {
    const m = plan.mastery;
    return m.spend.length ? `${m.spend.length} key ${m.spend.length === 1 ? 'skill' : 'skills'} to level` : `${m.active.filter(entry => entry.priority).length} key skills`;
  }
  if (view === 'stigma') {
    const s = plan.stigmas;
    if (s.pending) return 'Not confirmed yet';
    return plan.level < s.unlockLevel ? `Opens at Lv ${s.unlockLevel}` : `${s.open} of 4 slots open`;
  }
  if (view === 'daevanion') {
    const open = plan.daevanion.boards.filter(board => board.open);
    const live = open.find(board => board.nodesTaken !== null);
    return live ? `${live.name}: ${live.nodesTaken} / ${live.nodesTotal} nodes` : open.length ? `${open.length} of ${plan.daevanion.boards.length} boards open` : `Opens at Lv ${plan.daevanion.boards[0]?.unlockLevel ?? 12}`;
  }
  if (view === 'skill-bar') {
    const bar = plan.skillBar;
    return bar ? `${bar.basic} stays on left click` : 'Not ready yet';
  }
  if (view === 'macro') {
    if (isPending(plan.rotation)) return 'Not confirmed yet';
    const usable = plan.rotation.steps.filter(step => !step.locked).length;
    return usable ? `${usable} ${usable === 1 ? 'skill' : 'skills'} in Macro 1` : 'Nothing to add yet';
  }
  if (view === 'stats') return isPending(plan.stats) ? 'Not confirmed yet' : `First: ${plan.stats.order[0]}`;
  return '';
}

/**
 * Where a next move's Show me goes: its screen, and for a Daevanion move the very board the move names (the
 * character's own board id, carried on the move by the advisor). Without it the screen opened its first open board,
 * so a move about Vaizel could open Nezekan.
 */
function questHref(item) {
  const href = viewHref(item.view);
  return item.view === 'daevanion' && item.board ? `${href}&board=${encodeURIComponent(item.board)}` : href;
}

function renderMenu(plan) {
  const quests = plan.now.slice(0, 4);
  const todo = view => plan.now.filter(item => item.view === view).length;
  const questCard = item => `<li><a class="ae-quest" href="${esc(questHref(item))}" data-quest-view="${esc(item.view)}"${item.board ? ` data-quest-board="${esc(item.board)}"` : ''}>
      <span class="ae-quest-art" data-fallback="${esc(item.view)}">${item.view === 'gear' ? ICON.gear : viewArt(item.view, plan)}</span>
      <span class="ae-quest-num">${item.step}</span>
      <span class="ae-quest-text"><strong>${esc(item.title)}</strong></span>
      <span class="ae-quest-go">Show me</span>
    </a></li>`;
  return `
    ${quests.length ? `<section class="ae-quests" id="aeNow" aria-labelledby="aeNowTitle">
      <h2 class="ae-section-title" id="aeNowTitle">Your next moves${plan.character ? '' : ` <small>at Lv ${esc(plan.level)}</small>`}</h2>
      <ol class="ae-quest-list">${quests.map(questCard).join('')}</ol>
    </section>` : ''}
    <nav class="ae-menu" aria-label="Plan screens">
      ${Object.entries(VIEWS).map(([view, info]) => `<a class="ae-menu-card" href="${esc(viewHref(view))}" data-view="${view}" title="${esc(info.blurb)}">
        <span class="ae-menu-art" data-fallback="${view}">${viewArt(view, plan)}</span>
        <span class="ae-menu-name">${esc(info.title)}</span>
        <span class="ae-menu-status">${esc(viewStatus(view, plan))}</span>
        ${todo(view) ? `<span class="ae-menu-badge" aria-label="${todo(view)} to do">${todo(view)}</span>` : ''}
      </a>`).join('')}
      <a class="ae-menu-card is-gear" href="${esc(viewHref('gear'))}" data-view="gear">
        <span class="ae-menu-art">${ICON.gear}</span>
        <span class="ae-menu-name">Gear</span>
        <span class="ae-menu-status">${plan.character ? 'Your worn items' : 'Find your Daeva'}</span>
        ${todo('gear') ? `<span class="ae-menu-badge" aria-label="${todo('gear')} to do">${todo('gear')}</span>` : ''}
      </a>
    </nav>
    ${plan.upcoming.length ? `<section class="ae-coming" aria-labelledby="aeNextTitle">
      <h2 class="ae-section-title" id="aeNextTitle">Coming up</h2>
      <ol class="ae-coming-list">${plan.upcoming.slice(0, 4).map(item => `<li data-kind="${esc(item.kind)}"><b>Lv ${esc(item.level)}</b>${esc(item.text)}</li>`).join('')}</ol>
    </section>` : ''}`;
}

/** The frame every screen sits in: a game window with its title bar and the tabs to the other screens. */
function gameWindow(view, plan, body) {
  return `<div class="ae-gw" data-view="${view}">
    <div class="ae-gw-bar">
      <a class="ae-gw-back" href="${esc(viewHref('menu'))}"><span aria-hidden="true">‹</span> Plan</a>
      <h1 class="ae-gw-title" id="aeScreenTitle">${esc(VIEWS[view].window)}</h1>
      <p class="ae-gw-who">${esc(plan.className)} · ${esc(plan.roleLabel)} · Lv ${esc(plan.level)}${plan.character ? ` · ${esc(plan.character.name)}` : ''}</p>
      ${state.source ? `<p class="ae-gw-source">${esc(sourceLabel(state.source))}</p>` : ''}
    </div>
    <nav class="ae-gw-tabs" aria-label="Plan screens">${Object.entries(VIEWS).map(([key, info]) => `<a href="${esc(viewHref(key))}" data-view="${key}"${key === view ? ' aria-current="page"' : ''}>${esc(info.title)}</a>`).join('')}</nav>
    <div class="ae-gw-body">${body}</div>
  </div>`;
}

function renderStigmaScreen(plan) {
  const s = plan.stigmas;
  if (s.pending) return pendingNote(s.pending);
  const slot = (item, index) => `<span class="ae-stg-slot ${item.open ? 'is-open' : 'is-locked'}" role="button" tabindex="0" data-stigma="${index}" data-tip="${esc(item.open ? item.name : `${item.name} · slot opens at Lv ${item.slotLevel}`)}" aria-label="Slot ${index + 1}: ${esc(item.name)}${item.open ? '' : `, opens at Lv ${item.slotLevel}`}">
      <span class="ae-stg-label">${index + 1}</span>
      <span class="ae-stg-face"><span class="ae-stg-name">${esc(item.name)}</span>${art(item.icon)}${item.open ? '' : `<span class="ae-lock">${ICON.lock}<b>Lv ${esc(item.slotLevel)}</b></span>`}${item.equipped ? '<span class="ae-stg-on" aria-hidden="true">✓</span>' : ''}</span>
    </span>`;
  const keep = name => s.slots.some(item => item.name === name);
  const now = s.equippedNow;
  return `<div class="ae-stg">
    <div class="ae-stg-row">${s.slots.map(slot).join('')}</div>
    <ul class="ae-legend-row is-centred" aria-label="Key"><li><span class="ae-lock is-key">${ICON.lock}<b>Lv 27</b></span>Grey: the slot opens when your character reaches that level</li>${now === null ? '' : '<li><span class="ae-mskill-bar">✓</span>Equipped now</li>'}</ul>
    <div class="ae-stg-lower">
      ${now === null ? '' : `<div class="ae-icon-group" id="aeStigmaNow"><p class="ae-mskills-title">Equipped now</p>${now.length
        ? `<div class="ae-icon-row">${now.map(item => iconTile(item.name, item.icon, { badge: keep(item.name) ? '✓' : '✕', tone: keep(item.name) ? 'keep' : 'swap', attr: `data-stigma-now="${esc(item.name)}"`, tip: `${item.name}: ${keep(item.name) ? 'keep' : 'swap out'}` })).join('')}</div>`
        : '<p class="ae-empty">None yet</p>'}</div>`}
      ${s.alternatives.length ? `<div class="ae-icon-group"><p class="ae-mskills-title">Swaps</p><div class="ae-icon-row">${s.alternatives.map(alt => iconTile(alt.name, alt.icon, { attr: `data-alt="${esc(alt.name)}"` })).join('')}</div></div>` : ''}
    </div>
  </div>`;
}
function stigmaCard(plan, index) {
  const s = plan.stigmas;
  const item = s.slots[index];
  const status = item.equipped ? ['keep', 'Equipped. Keep it.'] : item.open ? (item.acquired === false ? ['need', 'Slot open. Get this stigma first.'] : ['go', 'Slot open. Equip it.']) : ['lock', `Slot opens at Lv ${item.slotLevel}.`];
  return infoCardHtml({ icon: item.icon, title: item.name, sub: `Stigma · slot ${index + 1}`, status, lines: [
    plan.level < s.unlockLevel && s.quest ? `Stigmas open at Lv ${s.unlockLevel} with the quest ${s.quest}.` : null,
    CONFIDENCE[s.confidence] ?? null
  ] });
}
function altCard(plan, name) {
  const alt = plan.stigmas.alternatives.find(item => item.name === name);
  return alt ? infoCardHtml({ icon: alt.icon, title: alt.name, sub: 'Stigma · swap option', lines: [alt.why] }) : '';
}
function selectStigma(el) {
  openInfo(stigmaCard(state.plan, Number(el.dataset.stigma)), el);
}

/* Icon tiles and the info card: names show on hover (or long-press), details on click, like the game. */
function iconTile(name, icon, { badge = null, tone = '', attr = '', tip = null, big = false } = {}) {
  return `<span class="ae-itile${big ? ' is-big' : ''}${tone ? ` is-${tone}` : ''}" role="button" tabindex="0" data-tip="${esc(tip ?? name)}" aria-label="${esc(tip ?? name)}" ${attr}>
    <span class="ae-itile-name">${esc(name)}</span>${art(icon)}${badge ? `<span class="ae-itile-badge">${esc(badge)}</span>` : ''}
  </span>`;
}


function renderMacroScreen(plan) {
  const r = plan.rotation;
  const order = plan.macroOrder;
  const delay = order && !isPending(order.value) ? order.value.delayMs : null;
  if (isPending(r)) return `${pendingNote(r)}${order ? `<p class="ae-note">${esc(order.text)}</p>` : ''}`;
  // Laid out like the game's Macro window: numbered entries with the delay between each pair.
  const usable = r.steps.filter(step => !step.locked);
  const later = r.steps.filter(step => step.locked);
  const entries = usable.map((step, index) => `${index ? `<li class="ae-macro-delay" aria-hidden="true"><span>Delay</span><b>${esc(delay ?? 10)}</b><span>ms</span></li>` : ''}
      <li class="ae-macro-entry" data-macro-entry="${index + 1}"><span class="ae-macro-num">${index + 1}</span>${art(skillIcon(plan, step.text))}<span class="ae-macro-skill">${esc(step.text)}</span></li>`).join('');
  const chip = text => `<li>${art(skillIcon(plan, text))}<span>${esc(text)}</span></li>`;
  return `<div class="ae-macro-screen">
    <div class="ae-macro-main">
    <div class="ae-macro-window" id="aeMacroWindow">
      <div class="ae-macro-tabs" aria-hidden="true"><span class="is-on">1</span><span>2</span><span>3</span></div>
      ${usable.length ? `<ol class="ae-macro">${entries}</ol>` : '<p class="ae-muted">None of the macro skills are unlocked yet.</p>'}
    </div>
      ${order?.bind ? `<div class="ae-macro-bind" id="aeMacroBind">
        <p class="ae-mskills-title">Put it on a key</p>
        <ol class="ae-crumbs">${order.bind.path.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
        <div class="ae-bind-keys">
          <span class="ae-bind-key">${ICON.mouse}<span>Side mouse button</span></span>
          <span class="ae-bind-or">or</span>
          <span class="ae-bind-key"><b>F</b><span>Any free key</span></span>
        </div>
        <p class="ae-muted">${order.bind.defaultKey ? `Default key: ${esc(order.bind.defaultKey)}. ` : 'There is no key set at the start, so bind one. '}${order.bind.hold ? 'Hold it in fights. Let go and the macro stops.' : ''}</p>
      </div>` : ''}
      ${order?.bind?.presets ? `<div class="ae-macro-presets" id="aeMacroPresets">
        <p class="ae-mskills-title">Your ${esc(order.bind.presets)} presets</p>
        <ol class="ae-preset-row">${Array.from({ length: order.bind.presets }, (_, index) => `<li class="${index === 0 ? 'is-on' : ''}"><b>Preset ${index + 1}</b><small>${index === 0 ? `${esc(plan.roleLabel)} build` : 'Spare'}</small></li>`).join('')}</ol>
        <p class="ae-muted">${esc(order.bind.presetNote)}</p>
      </div>` : ''}
    </div>
    <div class="ae-macro-side">
      ${later.length ? `<div id="aeMacroLater"><p class="ae-mskills-title">Add later</p><ul class="ae-chiplist">${later.map(step => `<li>${art(skillIcon(plan, step.text))}<span>${esc(step.text)} <b>Lv ${esc(step.unlockLevel)}</b></span></li>`).join('')}</ul></div>` : ''}
      ${r.manual?.length ? `<div id="aeMacroManual"><p class="ae-mskills-title">Keep on your own keys</p><ul class="ae-chiplist">${r.manual.map(chip).join('')}</ul></div>` : ''}
      ${r.filler ? `<div id="aeMacroFiller"><p class="ae-mskills-title">Filler</p><ul class="ae-chiplist">${chip(r.filler)}</ul></div>` : ''}
      ${order?.setup ? `<details class="ae-perks ae-macro-howto"><summary>How to set it up in game</summary><ol>${order.setup.map(line => `<li>${esc(line)}</li>`).join('')}</ol><p>${esc(order.text)}</p></details>` : ''}
    </div>
  </div>`;
}

/* Skill Bar: the game's 4 bars of keys, filled with where this build puts each skill. */
const KEY_LABEL = { LMB: 'Left click', RMB: 'Right click' };
const ROLE_LABEL = { fixed: 'Fixed by the game', key: 'Key skill', macro: 'In your macro', build: 'Build skill', manual: 'Fire it by hand', stigma: 'Stigma', spare: 'Spare' };
function keyCap(key) {
  if (key === 'LMB' || key === 'RMB') {
    const left = key === 'LMB';
    return `<span class="ae-keycap is-mouse" title="${KEY_LABEL[key]}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="${left ? 'M12 2.9V10H5.9V9A6.1 6.1 0 0 1 12 2.9Z' : 'M12 2.9V10h6.1V9A6.1 6.1 0 0 0 12 2.9Z'}" fill="var(--ae-ice)"/><path d="M12 3v7M5.5 10h13" stroke="currentColor" stroke-width="1.4"/></svg></span>`;
  }
  return `<span class="ae-keycap">${esc(key)}</span>`;
}
function barCell(item, key, row) {
  if (!item) return `<span class="ae-bar-cell is-empty" aria-hidden="true"></span>`;
  const tip = `${KEY_LABEL[key] ?? key}: ${item.name}${item.locked ? ` · unlocks at Lv ${item.unlockLevel}` : ''}`;
  return `<span class="ae-bar-cell is-${item.role}${item.locked ? ' is-locked' : ''}" role="button" tabindex="0" data-bar-skill="${esc(item.name)}" data-bar-role="${item.role}" data-bar-key="${row}:${key}" data-tip="${esc(tip)}" aria-label="${esc(`Bar ${row}, ${tip}`)}">
    <span class="ae-mskill-name">${esc(item.name)}</span>${art(item.icon)}
    ${item.rank ? `<span class="ae-mskill-rank">${item.rank}</span>` : ''}
    ${item.fixed ? `<span class="ae-bar-pin" aria-hidden="true">${ICON.lock}</span>` : ''}
    ${item.locked ? `<span class="ae-lock" aria-hidden="true">${ICON.lock}<b>Lv ${esc(item.unlockLevel)}</b></span>` : ''}
  </span>`;
}
function renderSkillBarScreen(plan) {
  const bar = plan.skillBar;
  if (!bar) return '<p class="ae-callout">The skill list for this class is not loaded yet.</p>';
  const groups = [['1', '2', '3', '4'], ['5', '6', '7', '8'], ['Q', 'E'], ['LMB', 'RMB']];
  const row = index => `<div class="ae-bar-row${index === 0 ? ' is-main' : ''}" data-bar-row="${index}">
      ${groups.map(group => `<div class="ae-bar-group">${group.map(key => barCell(bar.bars[index][key], key, index)).join('')}</div>`).join('')}
      <span class="ae-bar-num">${index}</span>
    </div>`;
  return `<div class="ae-skillbar">
    <p class="ae-bar-swipe" aria-hidden="true">Swipe the bar to see Q, E and the mouse buttons ›</p>
    <div class="ae-bar-scroll" id="aeSkillBar">
      <div class="ae-bar-grid">
        ${[3, 2, 1, 0].map(row).join('')}
        <div class="ae-bar-row is-keys" aria-hidden="true">${groups.map(group => `<div class="ae-bar-group">${group.map(keyCap).join('')}</div>`).join('')}<span class="ae-bar-num"></span></div>
      </div>
    </div>
    <ul class="ae-legend-row" aria-label="Key">
      <li><span class="ae-swatch is-fixed"></span>Fixed: the game keeps ${esc(bar.basic)} on left click</li>
      <li><span class="ae-swatch is-key"></span><span class="ae-mskill-rank">1</span>Key skill, in levelling order</li>
      <li><span class="ae-swatch is-macro"></span>Build and macro skills</li>
      <li><span class="ae-swatch is-manual"></span>Fire by hand</li>
      <li><span class="ae-swatch is-stigma"></span>Stigma</li>
      <li><span class="ae-swatch is-spare"></span>Spare, on bar 1</li>
    </ul>
    <p class="ae-muted ae-bar-note">This is where the build puts each skill, not what is on your bars now. Bar 0 is the one you fight on. Your macro does not need a slot: it has its own key (see Macro).</p>
  </div>`;
}
function barSkillCard(name, role) {
  const plan = state.plan;
  const entry = [...plan.mastery.active, ...plan.mastery.passive].find(item => item.name === name);
  const index = plan.stigmas.slots?.findIndex(slot => slot.name === name) ?? -1;
  if (role === 'stigma' && index >= 0) return stigmaCard(plan, index);
  if (entry) return masteryCard(entry);
  return infoCardHtml({ icon: plan.skillIcons[name], title: name, sub: ROLE_LABEL[role] ?? 'Skill' });
}

function renderStatsScreen(plan) {
  const s = plan.stats;
  if (isPending(s)) return pendingNote(s);
  return `<ol class="ae-stat-ranks">${s.order.map((stat, index) => `<li data-stat-rank="${index + 1}"><span class="ae-stat-rank">${index + 1}</span><strong>${esc(stat)}</strong></li>`).join('')}</ol>
    <p class="ae-muted">Look for these, in this order, on gear, manastones and accessories.</p>
    <p><a class="btn ae-primary" id="aeGearLink" href="${esc(viewHref('gear'))}">${plan.character ? 'Check your gear' : 'Find your Daeva to check your gear'}</a></p>`;
}

function renderBoardsByHand(plan) {
  const d = plan.daevanion;
  return `<ul class="ae-board-cards">${d.boards.map(board => `<li class="${board.open ? 'is-open' : 'is-locked'}" data-board-card="${esc(board.name)}">
      <img src="${esc(nodeArt(board.open ? 'unique' : 'stat', board.open))}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      <span><strong>${esc(board.name)}</strong><small>${esc(board.focus)}</small></span>
      <b>${board.open ? 'Open' : `Lv ${esc(board.unlockLevel)}`}</b>
    </li>`).join('')}</ul>
    ${isPending(d.priorities) ? pendingNote(d.priorities) : `<div class="ae-board-first" id="aeBoardFirst"><p class="ae-mskills-title">Take these first</p><ol class="ae-list">${d.priorities.map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>`}
    <p class="ae-callout">Find your Daeva and this screen draws your own boards with the route on them. <a class="ae-linkish" href="/hub/aetherium/">Find your Daeva</a></p>`;
}

/* The guide: one short step at a time, the thing to look at lit up on the screen (aetherium-guide.mjs draws it). */

function guideSteps(view, plan) {
  const steps = [];
  const add = (text, target, onShow) => steps.push({ text, target, onShow });
  if (plan.pending) return [{ text: 'This role has no confirmed build yet. Go back to the plan and pick the main role.', target: '.ae-gw-back' }];
  if (view === 'mastery') {
    const m = plan.mastery;
    const pick = () => {};
    for (const entry of m.active.filter(item => item.priority && item.equipped === false && item.acquired)) add(`${entry.name} is a key skill but it is not on your skill bar. Drag it onto your bar in game.`, `[data-mastery="${CSS.escape(entry.name)}"]`, pick(entry.name));
    for (const step of m.spend.slice(0, 3)) add(`Put skill points into ${step.name}${step.from !== null ? `: Lv ${step.from} to ${step.to}` : ` up to Lv ${step.to}`}. That ${step.reason}.`, `[data-mastery="${CSS.escape(step.name)}"]`, pick(step.name));
    for (const skill of plan.skills) {
      const due = skill.picks.filter(item => skill.skillLevel !== null && item.skillLevel <= skill.skillLevel);
      if (due.length) add(`${skill.name} is Lv ${skill.skillLevel}. In its Specialty, pick ${due.map(item => item.pick).join(' and ')}.`, `[data-mastery="${CSS.escape(skill.name)}"]`, pick(skill.name));
    }
    if (!steps.length) {
      for (const entry of m.active.filter(item => item.priority).slice(0, 3)) add(`Key skill ${entry.priority}: ${entry.name}. ${entry.why ?? ''}`.trim(), `[data-mastery="${CSS.escape(entry.name)}"]`, pick(entry.name));
    }
    add('Tap any skill for its card: what it does, its Specialty slots and perks.', '.ae-mskills');
  } else if (view === 'stigma') {
    const s = plan.stigmas;
    if (s.pending) return [];
    const pick = () => () => {};
    if (plan.level < s.unlockLevel) add(`Stigmas open at Lv ${s.unlockLevel}${s.quest ? ` with the quest ${s.quest}` : ''}. Slot 1 gets ${s.slots[0].name} first.`, '[data-stigma="0"]', pick(0));
    else if (s.noneAcquired) add(`You have no stigma yet. Finish ${s.quest ?? 'the stigma quest'} to get your first one.`, '[data-stigma="0"]', pick(0));
    const extra = (s.equippedNow ?? []).filter(item => !s.slots.some(slot => slot.name === item.name));
    if (extra.length) add(`You have ${extra.map(item => item.name).join(' and ')} equipped. Swap ${extra.length === 1 ? 'it' : 'them'} for the stigmas below.`, '#aeStigmaNow');
    s.slots.forEach((slot, index) => {
      if (slot.open) add(slot.equipped ? `Slot ${index + 1}: ${slot.name} is equipped. Keep it.` : `Slot ${index + 1}: equip ${slot.name}.`, `[data-stigma="${index}"]`, pick(index));
    });
    const next = s.slots.findIndex(slot => !slot.open);
    if (next >= 0 && plan.level >= s.unlockLevel) add(`At Lv ${s.slots[next].slotLevel} slot ${next + 1} opens. Put ${s.slots[next].name} in it.`, `[data-stigma="${next}"]`, pick(next));
    for (const alt of s.alternatives.slice(0, 2)) add(`Want a swap? ${alt.name}. ${alt.why}`, `[data-alt="${CSS.escape(alt.name)}"]`);
  } else if (view === 'skill-bar') {
    const bar = plan.skillBar;
    if (!bar) return [];
    const main = bar.bars[0];
    add(`Left click always fires ${bar.basic}. The game keeps it there, so build around it.`, '[data-bar-key="0:LMB"]');
    const keys = ['1', '2', '3', '4'].filter(key => main[key]);
    if (keys.length) add(`Keys ${keys[0]} to ${keys.at(-1)}: ${keys.map(key => main[key].name).join(', ')}. Your key skills, in the order you level them.`, `[data-bar-row="0"] .ae-bar-group:nth-child(1)`);
    if (main.RMB) add(`Right click: ${main.RMB.name}.`, '[data-bar-key="0:RMB"]');
    const qe = ['Q', 'E'].filter(key => main[key]);
    if (qe.length) add(`${qe.join(' and ')}: ${qe.map(key => main[key].name).join(' and ')}. ${qe.some(key => main[key].role === 'manual') ? 'Skills you fire by hand, when you need them.' : 'Close to your hand for quick use.'}`, `[data-bar-row="0"] .ae-bar-group:nth-child(3)`);
    if (['5', '6', '7', '8'].some(key => main[key])) add('Keys 5 to 8: your stigmas. Each one goes on as its slot opens.', `[data-bar-row="0"] .ae-bar-group:nth-child(2)`);
    if (Object.values(bar.bars[1]).some(Boolean)) add('Bar 1 holds everything else. Swap to it when you need one of those.', '[data-bar-row="1"]');
  } else if (view === 'macro') {
    if (isPending(plan.rotation)) return [];
    const usable = plan.rotation.steps.filter(step => !step.locked);
    add('In game, open Skill, then Macro. Pick macro slot 1 and press Add Macro. Add the skills in this order. They fire top to bottom.', '#aeMacroWindow');
    if (usable[0]) add(`Number 1 is ${usable[0].text}. It goes first every time.`, '[data-macro-entry="1"]');
    if (plan.rotation.manual?.length) add(`Keep ${plan.rotation.manual.join(' and ')} on their own keys. Use them when you need them.`, '#aeMacroManual');
    if (plan.rotation.filler) add(`When MP runs low: ${plan.rotation.filler}.`, '#aeMacroFiller');
    if (plan.rotation.steps.some(step => step.locked)) add('Add these to the macro when you unlock them.', '#aeMacroLater');
    const bind = plan.macroOrder?.bind;
    if (bind) add(`Now give the macro a key: ${bind.path.join(', ')}. A side mouse button works well. Hold it in fights.`, '#aeMacroBind');
    if (bind?.presets) add(bind.presetNote, '#aeMacroPresets');
  } else if (view === 'stats') {
    if (isPending(plan.stats)) return [];
    plan.stats.order.slice(0, 3).forEach((stat, index) => add(`${index === 0 ? 'First' : index === 1 ? 'Then' : 'After that'}: ${stat}.`, `[data-stat-rank="${index + 1}"]`));
    add('Check what you wear now against this list.', '#aeGearLink');
  } else if (view === 'daevanion') {
    if (!state.model) {
      const open = plan.daevanion.boards.filter(board => board.open);
      add(open.length ? `You have ${open.length === 1 ? 'one board' : `${open.length} boards`} open: ${open.map(board => board.name).join(', ')}.` : `Your first board, ${plan.daevanion.boards[0]?.name ?? 'Nezekan'}, opens at Lv ${plan.daevanion.boards[0]?.unlockLevel ?? 12}.`, '.ae-board-cards');
      if (!isPending(plan.daevanion.priorities)) add(`Take ${plan.daevanion.priorities[0]} first.`, '#aeBoardFirst');
      return steps;
    }
    const board = planner.board;
    if (!board) return [];
    add('This is your board. Every route starts from the centre and grows one touching node at a time.', '#aeBoardStage');
    if (!planner.split) add('Type the points you have. They show at the top of your Daevanion screen in game.', '#aePoints');
    const route = planner.split ? planner.split.now.length ? planner.split.now : planner.split.later : board.route;
    for (const step of route.slice(0, 5)) add(`Step ${step.step}: take ${step.effects[0] || step.name}. ${step.target ? step.reason : `It is on the way to ${step.targetName}.`}`, `.ae-node[data-node="${CSS.escape(String(step.nodeId))}"]`, () => selectNode(step.nodeId));
    if (planner.split?.shortBy && planner.split.now.length) add(`That is all your points. Step ${planner.split.now.length + 1} needs ${planner.split.shortBy} more.`, '#aeRouteSummary');
  }
  return steps;
}

/** A screen's guide: its steps in the shared guide, Done on the last step going back to the menu. */
function startGuide(view, plan) {
  mountGuide($('#aeGuide'), guideSteps(view, plan), { doneAction: 'menu', onDone: kind => { if (kind === 'menu') location.assign(viewHref('menu')); } });
}

/* The menu's first-visit guide: one step, pointing at the next moves. Shown once per device; "How this works" brings it back. */
const MENU_GUIDE = () => [{ text: 'Your next moves are below, in order. Do move 1 first in the game. Press Show me and it opens on a screen laid out like the game, with the thing to do lit up.', target: '#aeNow' }];
function showMenuGuide() {
  mountGuide($('#aeGuide'), MENU_GUIDE(), { skip: false, scroll: true, onDone: () => markGuideSeen('plan') });
}
function firstVisitGuide() {
  if (VIEW !== 'menu' || !state.plan?.now?.length || guideSeen('plan')) return;
  setTimeout(showMenuGuide, 0); // after the page has reported ready
}

/* The flow: this page is step 3. Its Next is the top move (menu) or the next screen; the last screen goes back to the moves. */
const SCREEN_ORDER = Object.keys(VIEWS);
function nextOf(plan) {
  if (VIEW === 'menu') {
    const first = plan.now[0];
    if (first) return { label: 'Next: Show me move 1', href: questHref(first), note: first.title };
    return { label: 'Next: Mastery', href: viewHref('mastery'), note: VIEWS.mastery.blurb };
  }
  const after = SCREEN_ORDER[SCREEN_ORDER.indexOf(VIEW) + 1];
  if (after) return { label: `Next: ${VIEWS[after].title}`, href: viewHref(after), note: VIEWS[after].blurb };
  return { label: 'Next: Back to your next moves', href: viewHref('menu'), note: 'That is every screen of the plan' };
}
function renderFlow(plan) {
  renderStepBar({ current: 'moves', ref: state.model ? state.ref : null, className: state.className, help: VIEW === 'menu' && plan.now.length ? showMenuGuide : null });
  renderNext(nextOf(plan));
}


/* Daevanion planner: the real board from the official site, with a numbered route for this build. */
const nodeArt = (kind, taken) => boardNodeArt(kind, taken, state.className);
const nodeImg = (kind, taken) => boardNodeImg(kind, taken, state.className);
const daevaKey = () => state.model ? `${state.model.profile.server.id}:${state.model.profile.characterId}` : null;

function readPoints(boardId) {
  try { return JSON.parse(localStorage.getItem(POINTS_KEY) ?? '{}')?.[daevaKey()]?.[boardId] ?? ''; } catch { return ''; }
}
function writePoints(boardId, value) {
  try {
    const all = JSON.parse(localStorage.getItem(POINTS_KEY) ?? '{}') ?? {};
    all[daevaKey()] = { ...(all[daevaKey()] ?? {}), [boardId]: value };
    localStorage.setItem(POINTS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the number lasts for this visit */ }
}


/* Mastery: laid out like the game's Mastery tab. Icons only, names on hover; tap a skill for its
   card: level, cooldown, what it does, why it matters, the three Specialty slots and all five perks. */
function masteryTile(entry) {
  const locked = entry.unlocked === false || entry.acquired === false;
  const onBar = entry.equipped === true && !locked;
  const offBar = entry.equipped === false && entry.priority && !locked;
  return `<span role="button" tabindex="0" class="ae-mskill${locked ? ' is-locked' : ''}${entry.priority ? ' is-key' : ''}" data-mastery="${esc(entry.name)}" data-tip="${esc(locked && entry.needLevel ? `${entry.name} · unlocks at Lv ${entry.needLevel}` : entry.skillLevel !== null ? `${entry.name} · skill Lv ${entry.skillLevel}` : entry.name)}"${onBar ? ' data-equipped="true"' : entry.equipped === false && !locked ? ' data-equipped="false"' : ''} aria-label="${esc(entry.name)}${locked && entry.needLevel ? `, unlocks at character level ${entry.needLevel}` : ''}${entry.skillLevel !== null ? `, skill Lv ${entry.skillLevel}` : ''}${onBar ? ', on your skill bar' : ''}${entry.priority ? `, build priority ${entry.priority}` : ''}">
    <span class="ae-mskill-name">${esc(entry.name)}</span>
    ${entry.icon ? `<img src="${esc(entry.icon)}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
    ${entry.priority ? `<span class="ae-mskill-rank">${entry.priority}</span>` : ''}
    ${onBar ? '<span class="ae-mskill-bar" aria-hidden="true">●</span>' : offBar ? '<span class="ae-mskill-bar is-off" aria-hidden="true">!</span>' : ''}
    ${locked && entry.needLevel ? `<span class="ae-lock" aria-hidden="true">${ICON.lock}<b>Lv ${esc(entry.needLevel)}</b></span>` : entry.skillLevel !== null ? `<span class="ae-mskill-lv" aria-hidden="true">${esc(entry.skillLevel)}</span>` : ''}
  </span>`;
}

function masteryCard(entry) {
  const pickOf = perk => entry.slots.some(slot => slot.pick && slot.pick.skillLevel === perk.skillLevel && perk.text.toLowerCase().includes(slot.pick.pick.toLowerCase().split(' ')[0]));
  const cd = typeof entry.cooldownSeconds === 'number' ? `${entry.cooldownSeconds} s cooldown` : null;
  const locked = entry.unlocked === false || entry.acquired === false;
  const status = locked ? ['lock', `Unlocks at Lv ${entry.needLevel}`]
    : entry.category === 'Active' && entry.acquired && entry.equipped === false && entry.priority ? ['need', 'Not on your skill bar. Drag it on.']
    : entry.equipped === true ? ['keep', 'On your skill bar'] : null;
  const specialty = entry.category !== 'Active' ? '' : `
    <div class="ae-card-slots">${entry.slots.map(slot => `<span class="ae-card-slot ${slot.open ? 'is-open' : 'is-locked'}"><b>${slot.slot}</b><small>Lv ${slot.slotLevel}</small><em>${esc(slot.pick ? slot.pick.pick : 'Free pick')}</em></span>`).join('')}</div>
    ${entry.perks.length ? `<ul class="ae-mperks">${entry.perks.map(perk => `<li${pickOf(perk) ? ' class="is-pick"' : ''}><span class="ae-pick-level">${esc(perk.skillLevel)}</span>${esc(perk.text)}</li>`).join('')}</ul>` : ''}`;
  return infoCardHtml({
    icon: entry.icon, title: entry.name, level: entry.skillLevel,
    sub: `${entry.category}${entry.priority ? ` · key skill ${entry.priority}` : ''}`,
    status,
    chips: [cd, entry.target ? `Target: ${entry.target}` : null],
    lines: [entry.summary, entry.why],
    body: specialty
  });
}

function selectMastery(skill) {
  const m = state.plan.mastery;
  const entry = [...m.active, ...m.passive].find(item => item.name === skill.dataset.mastery);
  if (entry) openInfo(masteryCard(entry), skill);
}

function renderMastery(plan) {
  const m = plan.mastery;
  if (!m) return '';
  const icons = Object.fromEntries([...m.active, ...m.passive].map(entry => [entry.name, entry.icon]));
  return `<div class="ae-mastery" id="aeMastery">
    ${m.spend.length ? `<div class="ae-icon-group ae-mspend" id="aeMasterySpend"><p class="ae-mskills-title">Level these next</p><div class="ae-icon-row">${m.spend.map(step => iconTile(step.name, icons[step.name], { big: true, badge: step.from !== null ? `${step.from}→${step.to}` : `→${step.to}`, attr: `data-mastery="${esc(step.name)}"`, tip: `${step.name}: ${step.from !== null ? `Lv ${step.from} to ${step.to}` : `to Lv ${step.to}`}` })).join('')}</div></div>` : ''}
    <div class="ae-mskills">
      <p class="ae-mskills-title">Active</p>
      <div class="ae-mskill-grid">${m.active.map(masteryTile).join('')}</div>
      ${m.passive.length ? `<p class="ae-mskills-title">Passive</p><div class="ae-mskill-grid">${m.passive.map(masteryTile).join('')}</div>` : ''}
      <ul class="ae-legend-row" aria-label="Key">
        <li><span class="ae-mskill-rank">1</span>Key skill, level it in this order</li>
        <li><span class="ae-lock is-key">${ICON.lock}<b>Lv 14</b></span>Grey: unlocks when your character reaches that level</li>
        ${m.fromArmory ? '<li><span class="ae-mskill-lv is-key">3</span>Your skill level</li><li><span class="ae-mskill-bar">●</span>On your skill bar</li><li><span class="ae-mskill-bar is-off">!</span>Key skill not on your bar</li>' : '<li><a class="ae-linkish" href="/hub/aetherium/">Find your Daeva</a> to see your own skill levels</li>'}
      </ul>
    </div>
  </div>`;
}

// A game icon that fails to load drops away: tiles fall back to the skill's name, menu cards to our own glyph.
document.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('#aePlan')) return;
  const holder = img.parentElement;
  if (holder?.dataset.fallback && ICON[holder.dataset.fallback]) holder.innerHTML = ICON[holder.dataset.fallback];
  else if (!img.classList.contains('ae-node-art')) img.remove();
}, true);

function renderPlannerShell(plan) {
  if (!state.model) return renderBoardsByHand(plan);
  const open = plan.daevanion.boards.filter(board => board.open);
  if (!open.length) return `<p class="ae-callout">No board is open yet. ${esc(plan.daevanion.boards[0]?.name ?? 'Nezekan')} opens at Lv ${esc(plan.daevanion.boards[0]?.unlockLevel ?? 12)}.</p>`;
  if (!open.some(board => board.id === planner.boardId)) planner.boardId = open[0].id;
  return `<div class="ae-planner" id="aePlanner">
    <div class="ae-planner-head">
      <div class="ae-planner-tabs" role="tablist" aria-label="Daevanion boards">${open.map(board => `<button type="button" role="tab" class="ae-planner-tab" data-board-tab="${esc(board.id)}" aria-selected="${board.id === planner.boardId}">${esc(board.name)}</button>`).join('')}</div>
      <label class="ae-field ae-points"><span>Points you have</span><input id="aePoints" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="Top of your Daevanion screen"></label>
    </div>
    <div id="aePlannerBody"><p class="ae-muted">Reading the board.</p></div>
  </div>`;
}

async function showBoard(boardId) {
  if (planner.boardId !== boardId) planner.selected = null;
  planner.boardId = boardId;
  writeUrl();
  document.querySelectorAll('[data-board-tab]').forEach(tab => tab.setAttribute('aria-selected', String(Number(tab.dataset.boardTab) === boardId)));
  if ($('#aePoints')) $('#aePoints').value = readPoints(boardId);
  const body = $('#aePlannerBody');
  if (!body) return;
  if (!planner.nodes.has(boardId)) {
    body.innerHTML = '<p class="ae-muted">Reading the board.</p>';
    const board = state.model.daevanion.find(item => item.id === boardId);
    let result;
    try { result = await loadBoard(state.model, board); }
    catch (error) {
      if (!(error instanceof ArmoryUnavailable)) throw error;
      result = { nodes: null, reason: explain(error, 'The official AION 2 site is not answering right now. Pick the board again in a minute.') };
    }
    if (planner.boardId !== boardId) return;
    if (!result.nodes) { body.innerHTML = `<p class="ae-muted">${esc(result.reason)}</p>`; return; }
    planner.nodes.set(boardId, result.nodes);
  }
  renderBoardPlan();
}

function plannerContext() {
  const plan = state.plan;
  const board = plan.daevanion.boards.find(item => item.id === planner.boardId);
  const cooldowns = new Map((state.data.skills.records ?? []).filter(record => record.class === state.className && typeof record.cooldownSeconds === 'number').map(record => [record.name, record.cooldownSeconds]));
  return { skillOrder: plan.daevanion.skillNodes, cooldowns, boardName: board?.name, boardFocus: board?.focus };
}

function renderBoardPlan() {
  const body = $('#aePlannerBody');
  const nodes = planner.nodes.get(planner.boardId);
  if (!body || !nodes) return;
  const plan = state.plan;
  const board = planDaevanionBoard({ nodes, skillOrder: plan.daevanion.skillNodes });
  planner.board = board;
  const points = readPoints(planner.boardId);
  const split = points === '' ? null : affordable(board.route, points);
  planner.split = split;
  const nowSteps = new Set((split?.now ?? []).map(step => step.step));
  const statusOf = step => split ? (nowSteps.has(step) ? 'now' : 'later') : 'route';
  const tiles = board.tiles.map(tile => {
    const status = tile.taken || tile.kind === 'start' ? 'taken' : tile.step ? statusOf(tile.step) : 'idle';
    const label = `${tile.name}. ${tile.effects.join(', ') || KIND_LABEL[tile.kind]}. ${tile.taken ? 'Taken' : tile.step ? `Step ${tile.step}` : 'Not on the route'}`;
    return nodeTileHtml(tile, board.bounds, { className: state.className, status, label, step: tile.step && !tile.taken ? tile.step : null });
  }).join('');
  const stepItem = step => `<li data-status="${statusOf(step.step)}"${step.target ? ' data-target="true"' : ''} data-route-node="${esc(step.nodeId)}" tabindex="0">
      <span class="ae-pick-level">${step.step}</span>
      <span><strong>${esc(step.effects[0] || step.name)}</strong><small>${step.target ? 'Goal' : `To reach ${esc(step.targetName)}`} · ${step.cost} ${step.cost === 1 ? 'point' : 'points'}${split ? '' : ` · ${step.totalCost} in total`}</small></span>
    </li>`;
  const summary = split
    ? (split.now.length
        ? `You can take the next <b>${split.now.length}</b> ${split.now.length === 1 ? 'node' : 'nodes'} now (${split.now.at(-1).totalCost} of your ${esc(points)} points).${split.shortBy ? ` Step ${split.now.length + 1} needs ${split.shortBy} more ${split.shortBy === 1 ? 'point' : 'points'}.` : ' That finishes the route on this board.'}`
        : (board.route.length ? `Step 1 needs ${split.shortBy} more ${split.shortBy === 1 ? 'point' : 'points'}.` : 'The route on this board is done.'))
    : 'Enter the points you have (top of your Daevanion screen) to see which steps you can take now.';
  const list = split ? [...split.now, ...split.later.slice(0, 6)] : board.route.slice(0, 12);
  body.innerHTML = `
    <div class="ae-planner-grid">
      <div class="ae-board-wrap">
        <div class="ae-board-stage" id="aeBoardStage">
          <svg class="ae-flow" id="aeFlow" aria-hidden="true"></svg>
          <div class="ae-board-grid" style="${boardGridStyle(board.bounds)}">${tiles}</div>
        </div>
        <ul class="ae-node-legend" aria-label="Key">
          <li data-status="now">Take now</li><li data-status="later">Later</li>
          <li class="ae-legend-art">${nodeImg('stat', true)}Taken</li>
          <li class="ae-legend-art">${nodeImg('active-skill', false)}Skill +1</li><li class="ae-legend-art">${nodeImg('passive-skill', false)}Passive +1</li><li class="ae-legend-art">${nodeImg('unique', false)}Core corner</li><li class="ae-legend-art">${nodeImg('stat', false)}Stat</li>
        </ul>
      </div>
      <div class="ae-route">
        <aside class="ae-node-panel" id="aeNodePanel" aria-live="polite"></aside>
        <p class="ae-route-summary" id="aeRouteSummary">${summary}</p>
        <p class="ae-muted ae-route-meta">${board.takenCount} of ${board.totalNodes} nodes taken · ${board.pointsSpent} of ${board.pointsTotal} points spent · key skill nodes ${board.targets.skillsTaken} of ${board.targets.skills}</p>
        ${board.route.length ? `<ol class="ae-route-list">${list.map(stepItem).join('')}</ol>${board.route.length > list.length ? `<p class="ae-muted">${board.route.length - list.length} more steps after these. Tap any numbered node on the board to see it.</p>` : ''}` : '<p class="ae-muted">Every key skill node and corner on this board is taken.</p>'}
        <p class="ae-muted">Key skill nodes first, then the four corners. Check each cost in game before you spend.</p>
      </div>
    </div>`;
  drawFlow();
  if (planner.observer) planner.observer.disconnect();
  if (typeof ResizeObserver === 'function') { planner.observer = new ResizeObserver(drawFlow); planner.observer.observe($('#aeBoardStage')); }
  const next = (split?.now[0] ?? split?.later[0] ?? board.route[0]);
  selectNode(planner.selected ?? next?.nodeId ?? board.tiles.find(tile => tile.kind === 'start')?.nodeId);
  if (VIEW === 'daevanion') startGuide(VIEW, plan);
}

/** The suggested flow: a glowing link from each step to the node it grows from, drawn behind the tiles. */
function drawFlow() {
  const stage = $('#aeBoardStage'), svg = $('#aeFlow');
  if (!stage || !svg || !planner.board) return;
  const box = stage.getBoundingClientRect();
  const centre = rc => {
    const el = stage.querySelector(`[data-rc="${rc}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
  };
  const nowSteps = new Set((planner.split?.now ?? []).map(step => step.step));
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = planner.board.route.filter(step => step.from).map(step => {
    const a = centre(`${step.from.row}:${step.from.col}`), b = centre(`${step.row}:${step.col}`);
    if (!a || !b) return '';
    const status = planner.split ? (nowSteps.has(step.step) ? 'now' : 'later') : 'route';
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" data-status="${status}"/>`;
  }).join('');
}

function selectNode(nodeId) {
  const board = planner.board;
  const tile = board?.tiles.find(item => String(item.nodeId) === String(nodeId));
  if (!tile) return;
  planner.selected = tile.nodeId;
  document.querySelectorAll('.ae-node.is-selected,[data-route-node].is-selected').forEach(el => el.classList.remove('is-selected'));
  document.querySelector(`.ae-node[data-node="${CSS.escape(String(tile.nodeId))}"]`)?.classList.add('is-selected');
  document.querySelector(`[data-route-node="${CSS.escape(String(tile.nodeId))}"]`)?.classList.add('is-selected');
  const why = explainNode(tile, board.route, plannerContext());
  const nowSteps = new Set((planner.split?.now ?? []).map(step => step.step));
  const status = tile.kind === 'start' || tile.taken ? 'Taken' : why.step ? (planner.split ? (nowSteps.has(why.step) ? 'Take now' : 'Later') : `Step ${why.step}`) : 'Not on the route';
  $('#aeNodePanel').innerHTML = `
    <div class="ae-node-panel-head">
      <span class="ae-node ae-node-big" data-kind="${esc(tile.kind)}" data-status="${tile.taken || tile.kind === 'start' ? 'taken' : why.step ? 'route' : 'idle'}" aria-hidden="true">${nodeImg(tile.kind, tile.taken)}</span>
      <div><p class="ae-slot-label">${esc(KIND_LABEL[tile.kind] ?? 'Node')}${why.step ? ` · step ${why.step}` : ''}</p><h3>${esc(tile.effects[0] || why.title)}</h3><p class="ae-muted">${esc(why.title)}</p></div>
    </div>
    <dl class="ae-node-facts"><div><dt>Status</dt><dd>${esc(status)}</dd></div>${tile.kind === 'start' ? '' : `<div><dt>Cost</dt><dd>${why.cost} ${why.cost === 1 ? 'point' : 'points'}</dd></div>`}</dl>
    <p class="ae-slot-label">Why</p>
    ${why.lines.map(line => `<p class="ae-node-why">${esc(line)}</p>`).join('')}`;
}

function renderPlan() {
  const plan = buildAscentPlan({ className: state.className, role: state.role, level: state.level, data: state.data, model: state.model });
  state.plan = plan;
  state.role = plan.role;
  fillRoleSelect(plan.roles, plan.role);
  $('#aeClass').value = plan.className;
  $('#aeLevel').value = plan.level;
  $('#aeLevel').max = plan.levelCap;
  // With a Daeva linked the "Planning for ..." line already names it, its class and level: say it once.
  $('#aeAscentFor').hidden = Boolean(plan.character);
  $('#aeAscentFor').textContent = `${plan.className} · ${plan.roleLabel} · Lv ${plan.level}`;
  const fallback = plan.roleFallback ? `<p class="ae-callout">${esc(plan.className)} has no ${esc(ROLES[plan.roleRequested] ?? plan.roleRequested)} build, so this shows its main role.</p>` : '';
  writeUrl();
  if (VIEW !== 'menu') {
    document.title = `${VIEWS[VIEW].title} | Ascent Plan | The Aetherium | AION 2 | ASTRIX PARADOX`;
    const body = plan.pending ? pendingNote(plan.pending)
      : VIEW === 'mastery' ? renderMastery(plan)
      : VIEW === 'stigma' ? renderStigmaScreen(plan)
      : VIEW === 'daevanion' ? renderPlannerShell(plan)
      : VIEW === 'macro' ? renderMacroScreen(plan)
      : VIEW === 'skill-bar' ? renderSkillBarScreen(plan)
      : renderStatsScreen(plan);
    $('#aePlan').innerHTML = `${fallback}${gameWindow(VIEW, plan, body)}`;
    renderFlow(plan);
    if (VIEW === 'daevanion' && state.model && !plan.pending && document.querySelector('#aePlannerBody')) showBoard(planner.boardId).catch(fail);
    else startGuide(VIEW, plan);
    return;
  }
  const header = `<section class="ae-panel ae-ascent-head">
      <div>
        <p class="ae-eyebrow">${esc(plan.roleLabel)}${plan.build.main ? ' · main role' : ''}</p>
        <h2 class="ae-plan-title">${esc(plan.className)}: ${esc(plan.build.label)}</h2>
        <p>${esc(plan.build.summary)}</p>
      </div>
      <ul class="ae-chips" aria-label="Build facts">
        ${plan.build.beginner ? `<li>${esc(BEGINNER[plan.build.beginner] ?? plan.build.beginner)}</li>` : ''}
        <li>Level cap ${esc(plan.levelCap)}</li>
      </ul>
    </section>${fallback}`;
  $('#aePlan').innerHTML = plan.pending
    ? `${header}<section class="ae-panel">${pendingNote(plan.pending)}<p><a class="btn ae-primary" href="?class=${esc(plan.className.toLowerCase())}&level=${esc(plan.level)}">Show the ${esc(plan.className)} main role instead</a></p></section>`
    : `${header}${renderMenu(plan)}`;
  renderFlow(plan);
}

async function selectClass(className) {
  state.className = className;
  $('#aePlan').setAttribute('aria-busy', 'true');
  state.data = await loadAdvisor(className);
  // A new class starts on its own main role: the old class's role may be a side build here.
  state.role = null;
  renderPlan();
  $('#aePlan').setAttribute('aria-busy', 'false');
}

function planByHand() {
  state.model = null;
  state.source = null;
  state.ref = null;
  setFaction(null);
  $('#aeSource').hidden = true;
  showNotice(null);
  renderDaevaLine();
  setFormLock();
  renderPlan();
}

function wireForm() {
  $('#aeAscentForm').addEventListener('submit', event => {
    event.preventDefault();
    state.role = $('#aeRole').value || state.role;
    if (!state.model) state.level = clampLevel($('#aeLevel').value, state.data?.progression);
    const className = $('#aeClass').value;
    if (!state.model && className !== state.className) selectClass(className).catch(fail);
    else renderPlan();
  });
  $('#aeClass').addEventListener('change', event => selectClass(event.target.value).catch(fail));
  $('#aeRole').addEventListener('change', event => { state.role = event.target.value; renderPlan(); });
  const levelChanged = event => {
    const value = clampLevel(event.target.value, state.data?.progression);
    if (value === state.level && String(event.target.value) === String(value)) return;
    state.level = value;
    renderPlan();
  };
  $('#aeLevel').addEventListener('change', levelChanged);
  $('#aeDaeva').addEventListener('click', event => { if (event.target.closest('[data-plan-by-hand]')) planByHand(); });
  $('#aePlan').addEventListener('click', event => {
    const skill = event.target.closest('[data-mastery]');
    if (skill) { selectMastery(skill); return; }
    const stigma = event.target.closest('[data-stigma]');
    if (stigma) { selectStigma(stigma); return; }
    const barSkill = event.target.closest('[data-bar-skill]');
    if (barSkill) { openInfo(barSkillCard(barSkill.dataset.barSkill, barSkill.dataset.barRole), barSkill); return; }
    const alt = event.target.closest('[data-alt]');
    if (alt) { openInfo(altCard(state.plan, alt.dataset.alt), alt); return; }
    const worn = event.target.closest('[data-stigma-now]');
    if (worn) { const name = worn.dataset.stigmaNow; const keep = state.plan.stigmas.slots.some(item => item.name === name); openInfo(infoCardHtml({ icon: state.plan.skillIcons[name], title: name, sub: 'Stigma · equipped now', status: keep ? ['keep', 'In the build. Keep it.'] : ['need', 'Not in the build. Swap it out.'] }), worn); return; }
    const tab = event.target.closest('[data-board-tab]');
    if (tab) { showBoard(Number(tab.dataset.boardTab)).catch(fail); return; }
    const node = event.target.closest('[data-node],[data-route-node]');
    if (node) selectNode(node.dataset.node ?? node.dataset.routeNode);
  });
  $('#aePlan').addEventListener('keydown', event => {
    const skill = event.target.closest?.('[data-mastery]');
    if (skill && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectMastery(skill); return; }
    const tile = event.target.closest?.('[data-stigma],[data-alt],[data-stigma-now],[data-bar-skill]');
    if (tile && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); tile.click(); return; }
    const node = event.target.closest?.('[data-node],[data-route-node]');
    if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node.dataset.node ?? node.dataset.routeNode); }
  });
  $('#aePlan').addEventListener('input', event => {
    if (event.target.id !== 'aePoints') return;
    const value = event.target.value === '' ? '' : String(Math.max(0, Math.min(999, Math.round(Number(event.target.value)) || 0)));
    writePoints(planner.boardId, value);
    clearTimeout(planner.timer);
    planner.timer = setTimeout(renderBoardPlan, 200);
  });
}

async function loadDaeva(ref) {
  try {
    return await loadCharacter(ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    // The plan goes on by hand for the class the link or the roster names. Try again re-reads the same Daeva.
    showNotice(explain(error, 'The official AION 2 site is not answering right now, so this plans by hand. Try your Daeva again in a minute.'), 'warn', { retry: () => location.reload() });
    return null;
  }
}

async function start() {
  wireDrawer();
  setFaction(null);
  fillClassSelect();
  wireForm();
  const fromUrl = readUrl();
  const linked = refFromUrl();
  const active = roster.active();
  // A Daeva link wins; otherwise a manual class link; otherwise the active roster Daeva.
  state.ref = linked ?? (fromUrl.className ? null : active ? { serverId: active.serverId, characterId: active.characterId, region: active.region } : null);
  state.role = fromUrl.role;
  const wantedBoard = Number(new URLSearchParams(location.search).get('board'));
  if (Number.isInteger(wantedBoard) && wantedBoard > 0) planner.boardId = wantedBoard;
  // Fetch the plan data while the site answers: the class comes from the link or the roster entry.
  const sameDaeva = active && state.ref && String(active.serverId) === String(state.ref.serverId) && active.characterId === state.ref.characterId;
  prefetchAdvisor(fromUrl.className ?? (sameDaeva ? active.className : null));
  if (state.ref) {
    const loaded = await loadDaeva(state.ref);
    if (loaded && AION2_CLASSES.includes(loaded.model.profile.class)) {
      Object.assign(state, { model: loaded.model, source: loaded.source, className: loaded.model.profile.class, level: loaded.model.profile.level });
      setFaction(loaded.model.profile.raceName, loaded.model.profile.raceId);
      showSource(loaded.source);
    } else state.ref = null;
  }
  if (!state.model) {
    state.className = fromUrl.className ?? 'Gladiator';
    state.level = Number.isFinite(fromUrl.level) ? fromUrl.level : 1;
  }
  renderDaevaLine();
  setFormLock();
  state.data = await loadAdvisor(state.className);
  state.level = clampLevel(state.level, state.data.progression);
  renderPlan();
  if (state.model) markCharacterShown();
  markReady();
  firstVisitGuide();
}

function fail(error) {
  showNotice('The Ascent Plan could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
}

start().catch(fail);
