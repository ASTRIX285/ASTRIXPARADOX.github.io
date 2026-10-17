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
import { ArmoryUnavailable, ascentUrl, explain, gearPageUrl, gearUrl, loadAdvisor, loadBoard, loadCharacter, prefetchAdvisor, refFromUrl, regionName, rolePick, roster, sourceLabel } from './aetherium-data.mjs';
import { $, esc, gradeTile, infoCardHtml, isPending, markCharacterShown, markReady, openInfo, setFaction, showNotice, showSource, statIcon, wireDrawer } from './aetherium-ui.mjs';
import { guideSeen, markGuideSeen, mountGuide } from './aetherium-guide.mjs';
import { renderNext, renderStepBar } from './aetherium-flow.mjs';
import { AION2_CLASSES, ROLES, TEAMS, buildAscentPlan, clampLevel, gradeInfo, levelOrder } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { affordable, explainNode, planDaevanionBoard } from '/astrix-app/games/aion2/engine/daevanion-planner.mjs';
import { KIND_LABEL, boardGridStyle, nodeArt as boardNodeArt, nodeImg as boardNodeImg, nodeTileHtml } from './daevanion-board.mjs';

const state = { model: null, source: null, ref: null, className: 'Gladiator', role: null, team: null, level: 1, data: null, plan: null };
const planner = { boardId: null, nodes: new Map(), reading: new Map(), failed: new Set(), selected: null, board: null, split: null, observer: null };
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

/** The Team select, beside Role. Only a build that defines team variants shows it. */
function ensureTeamField() {
  if ($('#aeTeam')) return;
  const role = $('#aeRole')?.closest('.ae-field');
  if (!role) return;
  role.insertAdjacentHTML('afterend', '<label class="ae-field" id="aeTeamField" hidden><span>Team</span><select id="aeTeam" name="team"></select></label>');
}
function fillTeamSelect(team) {
  ensureTeamField();
  const field = $('#aeTeamField');
  if (!field) return;
  field.hidden = !team;
  $('#aeAscentForm')?.classList.toggle('has-team', Boolean(team));
  if (!team) return;
  $('#aeTeam').innerHTML = team.options.map(option => `<option value="${esc(option.id)}"${option.id === team.id ? ' selected' : ''}>${esc(option.label)}</option>`).join('');
}

/** The role line: class, the build as played, and the team when the build has team variants ("Gladiator · Tank with damage · Main tank, no Templar"). */
const roleLine = plan => [plan.className, plan.build.label, plan.team?.label].filter(Boolean).join(' · ');

/** Saves a role or team the player picked with the Daeva (roster), so every Aetherium page follows it. */
function saveRole() {
  if (state.model && state.ref) roster.setRole(state.ref, { role: state.role, team: state.team });
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const className = AION2_CLASSES.find(name => name.toLowerCase() === String(params.get('class') ?? '').toLowerCase());
  const role = Object.keys(ROLES).includes(params.get('role')) ? params.get('role') : null;
  const team = Object.keys(TEAMS).includes(params.get('team')) ? params.get('team') : null;
  const level = params.has('level') ? Number(params.get('level')) : null;
  return { className, role, team, level };
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
  mastery: { title: 'Mastery', window: 'Skill', blurb: 'Which skills to level and which Specialty perks to pick', why: 'Wisdom Stones level your skills. Put them into the skills your build uses most, in this order.' },
  'skill-bar': { title: 'Skill Bar', window: 'Where to put your skills', blurb: 'Where each skill should go on your bars. This is the plan, not what is on them now.', why: 'Each key fires the lowest ready skill in its stack. The stacks beside your main attack make your macro; everything else gets its own key.' },
  stigma: { title: 'Stigma', window: 'Stigma', blurb: 'The four stigmas to slot, and good swaps', why: 'Stigmas are extra skills with their own keys. Four slots open as you level.' },
  daevanion: { title: 'Daevanion', window: 'Daevanion', blurb: 'Your boards with the route to take, node by node', why: 'Daevanion nodes add skill levels and stats. Each node has to touch one you already have.' },
  macro: { title: 'Macro', window: 'Macro', blurb: 'Stack A and stack B in Macro 1', why: 'One entry for each stack beside your main attack. Hold the macro key and your main attack together.' },
  stats: { title: 'Stats', window: 'Stats', blurb: 'What to look for on gear and manastones', why: "The build's stat priority: when you choose between two items, favour the stat higher on this list." }
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
    if (state.team) params.set('team', state.team);
  } else {
    params.set('class', state.className.toLowerCase());
    if (state.role) params.set('role', state.role);
    if (state.team) params.set('team', state.team);
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
    const change = (s.equippedNow ?? []).find(item => item.verdict === 'out' && item.slot);
    if (change) return `Slot ${change.slot} to change`;
    return plan.level < s.unlockLevel ? `Opens at Lv ${s.unlockLevel}` : `${s.open} of 4 slots open`;
  }
  if (view === 'daevanion') {
    const open = plan.daevanion.boards.filter(board => board.open);
    const live = open.find(board => board.nodesTaken !== null);
    return live ? `${live.name}: ${live.nodesTaken} / ${live.nodesTotal} nodes` : open.length ? `${open.length} of ${plan.daevanion.boards.length} boards open` : `Opens at Lv ${plan.daevanion.boards[0]?.unlockLevel ?? 12}`;
  }
  if (view === 'skill-bar') {
    const bar = plan.skillBar;
    if (!bar || !bar.fromBlock) return 'Not ready yet';
    return `Stack A, ${bar.mainAttack}, stack B`;
  }
  if (view === 'macro') {
    if (!plan.macro || plan.macro.pending) return 'Not confirmed yet';
    const names = plan.macro.entries.map(entry => entry.name ?? (entry.key === 'A' ? 'Stack A' : 'Stack B'));
    return plan.macro.used ? `${names.map((name, index) => (index ? name.charAt(0).toLowerCase() + name.slice(1) : name)).join(' and ')} in Macro 1` : 'Nothing to add yet';
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
  // A gear move opens the Gear page with only the items it names ringed (#enchant-1, #replace-epic, #empty), not the plain list.
  if (item.view === 'gear' && state.model) return `${gearPageUrl(state.ref)}${item.ring ? `#${item.ring}` : ''}`;
  const href = viewHref(item.view);
  if (item.view !== 'daevanion' || !item.board) return href;
  return `${href}&board=${encodeURIComponent(item.board)}${item.node ? `&node=${encodeURIComponent(item.node)}` : ''}`;
}

/** A gear move's art: the first item it names on its grade tile, like the game's, else the gear glyph. */
function gearArt(item) {
  const slot = state.model && item.slots?.length ? state.model.gear.find(entry => entry.slotPos === item.slots[0] && !entry.empty) : null;
  return slot ? gradeTile({ icon: slot.icon, grade: gradeInfo(slot.grade, state.data?.grades).id, enchant: slot.enchant, size: 56 }) : ICON.gear;
}

function renderMenu(plan) {
  const quests = plan.now.slice(0, 4);
  const todo = view => plan.now.filter(item => item.view === view).length;
  const questCard = item => `<li><a class="ae-quest" href="${esc(questHref(item))}" data-quest-view="${esc(item.view)}"${item.board ? ` data-quest-board="${esc(item.board)}"` : ''}>
      <span class="ae-quest-art" data-fallback="${esc(item.view)}">${item.view === 'gear' ? gearArt(item) : viewArt(item.view, plan)}</span>
      <span class="ae-quest-num">${item.step}</span>
      <span class="ae-quest-text"><strong>${esc(item.title)}</strong></span>
      <span class="ae-quest-go">Show me</span>
    </a></li>`;
  return `
    ${quests.length ? `<section class="ae-quests" id="aeNow" aria-labelledby="aeNowTitle">
      <h2 class="ae-section-title" id="aeNowTitle">Your next moves${plan.character ? '' : ` <small>at Lv ${esc(plan.level)}</small>`}</h2>
      <ol class="ae-quest-list">${quests.map(questCard).join('')}</ol>
    </section>` : ''}
    ${setupStrip(plan)}
    <h2 class="ae-section-title ae-glance-title" id="aeGlanceTitle">Your plan at a glance</h2>
    <nav class="ae-menu" aria-label="Plan screens" aria-describedby="aeGlanceTitle">
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
    </section>` : ''}
    <aside class="ae-guide" id="aeGuide" aria-label="Guide" aria-live="polite" hidden></aside>`;
}

/* The setup for now and the next change (level planner, games/aion2/engine/level-planner.mjs). Every screen and the menu
   show it: what this Daeva runs at this level, and one "Next at Lv N" line with its reason. A build with no ascent
   record runs on today's data and says so; a reported choice says Reported. */
const reportedTag = status => (status === 'reported' ? '<span class="ae-tag is-reported" data-status-tag="reported">Reported</span>' : '');
function nextAtLine(plan) {
  const next = plan.nextAt;
  if (!next) return `<p class="ae-next-at" id="aeNextAt"><b>Next</b> Nothing changes in your setup before Lv ${esc(plan.levelCap)}.</p>`;
  return `<p class="ae-next-at" id="aeNextAt" data-next-level="${esc(next.level)}"><b>Next at Lv ${esc(next.level)}</b> ${esc(next.text)}${next.why ? ` <span class="ae-next-why">${esc(next.why)}</span>` : ''} ${reportedTag(next.status)}</p>`;
}
function setupStrip(plan) {
  const s = plan.setup;
  if (!s) return '';
  const line = s.line.find(item => item.name) ?? s.line[0] ?? null;
  const stigmas = s.stigmas.filter(slot => slot.open && slot.name);
  const firstStigma = s.stigmas.find(slot => !slot.open);
  const board = s.daevanion.board;
  const items = [
    ['line', line?.name ?? 'Macro', line ? line.skills.join(', ') : 'Nothing sourced yet'],
    ['stigmas', 'Stigmas', stigmas.length ? stigmas.map(slot => slot.name).join(', ') : firstStigma ? `From Lv ${firstStigma.slotLevel}: ${firstStigma.name}` : 'None'],
    ['mastery', 'Level next', s.mastery ? `${s.mastery.name} to Lv ${s.mastery.to}` : 'Nothing to level now'],
    ['daevanion', 'Daevanion', board ? `${board.name}${s.daevanion.now.length ? `: +1 on ${s.daevanion.now.join(', ')}` : ''}` : s.daevanion.firstLevel ? `From Lv ${s.daevanion.firstLevel}` : 'None'],
    ['stats', 'Stat focus', s.stats?.first ?? 'Not confirmed yet']
  ];
  return `<section class="ae-setup" id="aeSetup" aria-labelledby="aeSetupTitle" data-setup-level="${esc(s.level)}">
    <h2 class="ae-setup-title" id="aeSetupTitle">Your setup at Lv ${esc(s.level)} ${s.planned ? reportedTag(s.status) : '<span class="ae-tag is-unconfirmed" data-status-tag="setup-unconfirmed">Not confirmed yet</span>'}</h2>
    <dl class="ae-setup-list">${items.map(([id, label, value]) => `<div data-setup="${id}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    ${nextAtLine(plan)}
  </section>`;
}

/** The frame every screen sits in: a game window with its title bar and the tabs to the other screens. */
function gameWindow(view, plan, body) {
  return `<div class="ae-gw" data-view="${view}">
    <div class="ae-gw-bar">
      <a class="ae-gw-back" href="${esc(viewHref('menu'))}"><span aria-hidden="true">‹</span> Plan</a>
      <h1 class="ae-gw-title" id="aeScreenTitle">${esc(VIEWS[view].window)}</h1>
      <p class="ae-gw-who" id="aeGwWho">${esc(plan.className)} · ${esc(plan.roleLabel)}${plan.team ? ` · ${esc(plan.team.label)}` : ''} · Lv ${esc(plan.level)}${plan.character ? ` · ${esc(plan.character.name)}` : ''}</p>
      ${state.source ? `<p class="ae-gw-source">${esc(sourceLabel(state.source))}</p>` : ''}
    </div>
    <nav class="ae-gw-tabs" aria-label="Plan screens">${Object.entries(VIEWS).map(([key, info]) => `<a href="${esc(viewHref(key))}" data-view="${key}"${key === view ? ' aria-current="page"' : ''}>${esc(info.title)}</a>`).join('')}</nav>
    <p class="ae-gw-why" id="aeWhy">${esc(VIEWS[view].why)}</p>
    ${setupStrip(plan)}
    <div class="ae-gw-body">${body}</div>
    <aside class="ae-guide" id="aeGuide" aria-label="Guide" aria-live="polite" hidden></aside>
  </div>`;
}

function renderStigmaScreen(plan) {
  const s = plan.stigmas;
  if (s.pending) return pendingNote(s.pending);
  const slot = (item, index) => `<span class="ae-stg-slot ${item.open ? 'is-open' : 'is-locked'}" role="button" tabindex="0" data-stigma="${index}" data-tip="${esc(item.open ? item.name : `${item.name} · slot opens at Lv ${item.slotLevel}`)}" aria-label="Slot ${index + 1}: ${esc(item.name)}${item.open ? '' : `, opens at Lv ${item.slotLevel}`}">
      <span class="ae-stg-label">${index + 1}</span>
      <span class="ae-stg-face"><span class="ae-stg-name">${esc(item.name)}</span>${art(item.icon)}${item.open ? '' : `<span class="ae-lock">${ICON.lock}<b>Lv ${esc(item.slotLevel)}</b></span>`}${item.equipped ? '<span class="ae-stg-on" aria-hidden="true">✓</span>' : ''}</span>
    </span>`;
  const now = s.equippedNow;
  const BADGE = { keep: ['✓', 'keep'], swap: ['⇄', 'alt'], out: ['✕', 'swap'] };
  const swap = plan.team?.swap ?? null;
  return `<div class="ae-stg">
    ${plan.team ? `<p class="ae-stg-team" id="aeStigmaTeam" data-team="${esc(plan.team.id)}"><b>${esc(plan.team.label)}</b>${swap ? `: ${esc(swap.in)} in place of ${esc(swap.out)}. ${esc(swap.why)}` : '.'}</p>` : ''}
    <div class="ae-stg-row">${s.slots.map(slot).join('')}</div>
    ${s.slots.some(item => item.why) ? `<ol class="ae-stg-why" id="aeStigmaWhy">${s.slots.map((item, index) => `<li data-stigma-why="${index}" class="${item.open ? '' : 'is-later'}"><b>Slot ${index + 1}${item.open ? '' : `, Lv ${esc(item.slotLevel)}`}</b> ${esc(item.name)}${item.why ? `: ${esc(item.why)}` : ''}</li>`).join('')}</ol>` : ''}
    <ul class="ae-legend-row is-centred" aria-label="Key"><li><span class="ae-lock is-key">${ICON.lock}<b>Lv 27</b></span>Grey: the slot opens when your character reaches that level</li>${now === null ? '' : '<li><span class="ae-mskill-bar">✓</span>Equipped now</li>'}</ul>
    <div class="ae-stg-lower">
      ${now === null ? '' : `<div class="ae-icon-group" id="aeStigmaNow"><p class="ae-mskills-title">Equipped now</p>${now.length
        ? `<div class="ae-icon-row">${now.map(item => iconTile(item.name, item.icon, { badge: BADGE[item.verdict][0], tone: BADGE[item.verdict][1], level: item.level ?? null, attr: `data-stigma-now="${esc(item.name)}" data-verdict="${item.verdict}"${Number.isFinite(item.level) ? ` data-stigma-level="${esc(item.level)}"` : ''}`, tip: `${item.name}${Number.isFinite(item.level) ? `, Lv ${item.level}` : ''}: ${item.verdict === 'keep' ? 'keep' : item.verdict === 'swap' ? 'a popular swap' : 'swap out'}` })).join('')}</div>
          ${now.filter(item => item.verdict !== 'keep').map(item => `<p class="ae-stg-verdict" data-stigma-line="${esc(item.name)}">${esc(equippedLine(item))}</p>`).join('')}`
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
/** One line per equipped stigma that is not a build pick: a listed swap is said once as a swap, anything else is swap it out. */
function equippedLine(item) {
  if (item.verdict === 'swap') return item.for ? `Slot ${item.slot}: ${item.name} is a popular swap for ${item.for}. Keep it or switch to ${item.for}.` : `${item.name} is a popular swap in this build. Keep it if you like it.`;
  return item.for ? `Slot ${item.slot}: swap ${item.name} out for ${item.for}.` : `Swap ${item.name} out: it is not in this build.`;
}
function altCard(plan, name) {
  const alt = plan.stigmas.alternatives.find(item => item.name === name);
  return alt ? infoCardHtml({ icon: alt.icon, title: alt.name, sub: 'Stigma · swap option', lines: [alt.why] }) : '';
}
function selectStigma(el) {
  openInfo(stigmaCard(state.plan, Number(el.dataset.stigma)), el);
}

/* Rule tags. Anything that rests on a game rule that is not confirmed says so, with the one-line in-game test.
   Flip the rule's status in mechanics.json and the tag goes from every screen. */
function ruleTag(rule, id, { test = true } = {}) {
  if (!rule || rule.confirmed) return '';
  return `<span class="ae-tag is-unconfirmed" data-rule-tag="${esc(id)}">Not confirmed yet</span>${test && rule.test ? ` <span class="ae-tag-test" data-rule-test="${esc(id)}">Check it in game: ${esc(rule.test)}</span>` : ''}`;
}
const CHAIN_ARROW = '<svg class="ae-chain-arrow" viewBox="0 0 24 12" aria-hidden="true"><path d="M1 6h19M15 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** A skill's chains on its card: the lead-in skills, an arrow, the follow-up. Only from the data; pressing it is the chain rule. */
function chainHtml(plan, chains) {
  if (!chains?.length) return '';
  const skill = name => `<span class="ae-chain-skill">${art(plan.skillIcons[name])}${esc(name)}</span>`;
  return `<div class="ae-chain-block" data-chain>
    <p class="ae-item-sec">Chain</p>
    ${chains.map(chain => `<p class="ae-chain">${chain.pending ? `<em class="ae-chain-pending">${esc(chain.pending.reason)}</em>` : chain.leadIns.map(skill).join('<span class="ae-chain-or">or</span>')}${CHAIN_ARROW}${skill(chain.followUp)}${chain.opensAt ? `<small>from skill Lv ${esc(chain.opensAt)}${chain.reach ? `. ${esc(chain.reach.note)}.` : ''}</small>` : ''}</p>`).join('')}
    <p class="ae-chain-note">Follow-up: press it when it lights up. ${ruleTag(plan.chains, 'chain-follow-up')}</p>
  </div>`;
}

/* Icon tiles and the info card: names show on hover (or long-press), details on click, like the game. */
function iconTile(name, icon, { badge = null, tone = '', attr = '', tip = null, big = false, level = null } = {}) {
  return `<span class="ae-itile${big ? ' is-big' : ''}${tone ? ` is-${tone}` : ''}" role="button" tabindex="0" data-tip="${esc(tip ?? name)}" aria-label="${esc(tip ?? name)}" ${attr}>
    <span class="ae-itile-name">${esc(name)}</span>${art(icon)}${badge ? `<span class="ae-itile-badge">${esc(badge)}</span>` : ''}${level !== null ? `<b class="ae-itile-lv" aria-hidden="true">Lv ${esc(level)}</b>` : ''}
  </span>`;
}


/* The macro facts and rules (progression.json: macro-order facts, macro-rules) as the page shows them. A fact or rule that is
   not confirmed carries the "Not confirmed yet" tag; one players disagree on says so. Sources stay in the data. */
const factOf = (plan, id) => plan.macro?.facts?.facts?.find(item => item.id === id) ?? plan.macroOrder?.facts?.find(item => item.id === id) ?? null;
const macroRule = (plan, id) => plan.macro?.rules?.rules?.find(item => item.id === id) ?? null;
function statusTag(item, id) {
  if (!item || item.status === 'confirmed') return '';
  if (item.status === 'disputed') return `<span class="ae-tag is-unconfirmed" data-status-tag="${esc(id)}">Players disagree</span>`;
  return `<span class="ae-tag is-unconfirmed" data-status-tag="${esc(id)}">Not confirmed yet</span>`;
}

/* Skill Bar, as the game draws it: every key a column of four rows, row 0 at the bottom nearest the key label. The
   right-hand block is stack A, the main attack, stack B; the left-hand block holds every own-key skill, one per key, in
   the order a player uses them. Tap a skill for where it goes and why; tap a key for the whole stack in words. */
const KEY_LABEL = { LMB: 'Left click', RMB: 'Right click', A: 'Stack A', B: 'Stack B' };
const keyName = key => state.plan?.skillBar?.stacks?.[key]?.name ?? KEY_LABEL[key] ?? `Key ${key}`;
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2h-4v7l-1 1-1-1v-7H7v-2l3-3z" fill="currentColor"/></svg>';
const OWN_LABEL = { buff: 'Buff', toggle: 'Toggle', charged: 'Charged', stagger: 'Stagger', other: 'Situational', defensive: 'Defensive', heal: 'Heal', dash: 'Dash', movement: 'Movement' };
const cooldownWords = item => (item.noCooldown ? 'no cooldown' : item.cooldownPending ? 'cooldown not captured yet' : `${item.cooldownSeconds} s cooldown`);
/** The stack of one key in plain words: "Stack A: Rage Burst fires when ready, otherwise Overhead Slam, then ..." */
function stackSentence(stack) {
  const names = stack.skills.map(skill => skill.name);
  const key = keyName(stack.key);
  if (!names.length) return stack.reserved?.length ? `${key}: kept free for ${stack.reserved.join(' and ')}, which comes later.` : `${key}: nothing on it. A free key.`;
  if (names.length === 1) return `${key}: ${names[0]}.${stack.reason ? ` ${stack.reason}` : ''}`;
  return `${key}: ${names[0]} fires when ready, otherwise ${names.slice(1).join(', then ')}.`;
}
/**
 * What a key fires at the player's level now: "Until Lv 32, stack A fires Overhead Slam, then Mocking Blade." Locked skills
 * stay on the plan, greyed with their level; this line says what the key really does today. Null when nothing is locked.
 */
function firesNowSentence(stack) {
  if (!stack.skills.length || stack.nextUnlock === null) return null;
  const key = stack.name ? `the ${stack.name.toLowerCase()}` : keyName(stack.key).replace(/^(Key|Stack)/, word => word.toLowerCase());
  if (!stack.firesNow.length) return `Until Lv ${stack.nextUnlock}, ${key} fires nothing yet.`;
  return `Until Lv ${stack.nextUnlock}, ${key} fires ${stack.firesNow.join(', then ')}.`;
}
/** Where a skill goes and why, one line: "Stack A row 0: Longest cooldown ..." or "Own key: charged ...". */
function placeLine(item) {
  if (item.role === 'stackA' || item.role === 'stackB' || item.role === 'chain') return `${keyName(item.key)} row ${item.row}: ${item.why ?? (item.noCooldown ? 'Filler: always ready, so it sits last.' : 'In the stack by cooldown.')}`;
  if (item.role === 'main') return `Main attack, set by the game on left click. ${item.why ?? 'Hold it with the macro key.'}`;
  return item.why ?? 'Own key.';
}
const MOUSE_SVG = left => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="${left ? 'M12 2.9V10H5.9V9A6.1 6.1 0 0 1 12 2.9Z' : 'M12 2.9V10h6.1V9A6.1 6.1 0 0 0 12 2.9Z'}" fill="var(--ae-ice)"/><path d="M12 3v7M5.5 10h13" stroke="currentColor" stroke-width="1.4"/></svg>`;
function keyCap(key, stack) {
  const label = `${keyName(key)}. ${stackSentence(stack)}`;
  if (key === 'LMB' || key === 'RMB') return `<span class="ae-keycap is-mouse" role="button" tabindex="0" data-bar-keycap="${key}" data-tip="${esc(KEY_LABEL[key])}" aria-label="${esc(label)}">${MOUSE_SVG(key === 'LMB')}</span>`;
  return `<span class="ae-keycap${key === 'A' || key === 'B' ? ' is-stack' : ''}" role="button" tabindex="0" data-bar-keycap="${esc(key)}" aria-label="${esc(label)}">${esc(key === 'A' || key === 'B' ? keyName(key) : key)}</span>`;
}
function barCell(item, key, row, stack) {
  const gap = !item && (stack.empty ?? []).find(entry => entry.row === row);
  if (gap) return `<span class="ae-bar-cell is-empty is-gap" data-bar-gap="${row}:${esc(key)}" title="${esc(`Row ${row} empty. ${gap.why ?? ''}`.trim())}" aria-label="${esc(`${keyName(key)}, row ${row}: left empty. ${gap.why ?? ''}`.trim())}" role="img"></span>`;
  if (!item) return `<span class="ae-bar-cell is-empty" aria-hidden="true"></span>`;
  const state = item.locked ? ` From Lv ${item.unlockLevel}.` : item.needsSlot ? ' Needs a stigma slot.' : item.learned === false ? ' Not learned yet.' : '';
  const tip = `${keyName(key)}, row ${row}: ${item.name}.${state}${item.fixed ? ' Set by the game.' : ''}`;
  const dim = item.locked || item.needsSlot || item.learned === false;
  return `<span class="ae-bar-cell is-${esc(item.role)}${dim ? ' is-locked' : ''}${stack.skills.length > 1 ? ' is-stacked' : ''}${item.cooldownPending ? ' is-cd-pending' : ''}" role="button" tabindex="0" data-bar-skill="${esc(item.name)}" data-bar-role="${esc(item.role)}" data-bar-key="${row}:${esc(key)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
    <span class="ae-mskill-name">${esc(item.name)}</span>${art(item.icon)}
    ${item.fixed ? `<span class="ae-bar-pin" title="Set by the game" aria-hidden="true">${PIN}</span>` : ''}
    ${stack.opener ? `<span class="ae-bar-order" aria-hidden="true">${esc(stack.opener)}</span>` : ''}
    ${item.cooldownPending && !item.fixed ? '<span class="ae-bar-cdq" aria-hidden="true">?</span>' : ''}
    ${item.locked ? `<span class="ae-lock" aria-hidden="true">${ICON.lock}<b>Lv ${esc(item.unlockLevel)}</b></span>` : item.needsSlot ? '<span class="ae-lock is-slot" aria-hidden="true"><b>Slot</b></span>' : item.skillLevel !== null ? `<span class="ae-mskill-lv" aria-hidden="true">${esc(item.skillLevel)}</span>` : ''}
  </span>`;
}
/** One key as the game draws it: rows 3 to 0 top to bottom, the key label underneath. */
function barColumn(bar, key) {
  const stack = bar.stacks[key];
  return `<div class="ae-bar-col${key === 'LMB' ? ' is-main' : ''}" data-bar-col="${esc(key)}">
    ${[3, 2, 1, 0].map(row => `<span class="ae-bar-slot" data-bar-row="${row}">${barCell(bar.bars[row][key], key, row, stack)}</span>`).join('')}
    ${keyCap(key, stack)}
  </div>`;
}
/** The right-hand block: stack A, the main attack, stack B, each stack with its label. The Macro screen draws only this. */
function rightBlock(bar, { id = 'aeRightBlock' } = {}) {
  const head = key => key === 'LMB' ? '<span class="ae-block-head is-main">Main attack</span>' : `<span class="ae-block-head">${esc(keyName(key))}${bar.stacks[key].label && bar.stacks[key].label !== bar.stacks[key].name ? `<small>${esc(bar.stacks[key].label)}</small>` : ''}</span>`;
  const keys = bar.right.filter(key => key === 'LMB' || bar.stacks[key].skills.length);
  const label = keys.map(key => (key === 'LMB' ? 'main attack' : keyName(key))).join(', ');
  return `<div class="ae-bar-block is-right" id="${id}" aria-label="Right-hand block: ${esc(label)}">
    ${keys.map(key => `<div class="ae-block-col" data-block-col="${esc(key)}">${head(key)}${barColumn(bar, key)}</div>`).join('')}
  </div>`;
}
/** The tag for stacks not checked against a published top-player build yet (the build's macro block says verified: false). */
const unverifiedTag = bar => (bar?.verified === false ? '<span class="ae-tag is-unconfirmed" data-status-tag="stacks-unverified">Not confirmed yet</span>' : '');
/** The "What fires now" panel: what stack A and stack B fire at this level, and what joins them later. */
function firesNowPanel(plan) {
  const bar = plan.skillBar;
  const rows = ['A', 'B'].map(key => bar.stacks[key]).filter(stack => stack.skills.length);
  const later = stack => [...stack.skills.filter(skill => skill.locked), ...(stack.joinsLater ?? [])].map(skill => `${skill.name} from Lv ${skill.unlockLevel}`).join(', ');
  return `<section class="ae-fires-now" id="aeFiresNow" aria-labelledby="aeFiresNowTitle">
      <h2 class="ae-mskills-title" id="aeFiresNowTitle">What fires now at Lv ${esc(plan.level)}</h2>
      <ol class="ae-fires-list">${rows.map(stack => `<li data-fires-key="${esc(stack.key)}"><b>${esc(keyName(stack.key))}</b> <span>${stack.firesNow.length ? esc(stack.firesNow.join(', then ')) : 'Nothing yet'}${later(stack) ? ` <small>${esc(later(stack))}</small>` : ''}</span></li>`).join('')}</ol>
    </section>`;
}
/** "Copy this bar": key by key, row by row, in the order to drag them in game, ending with the macro step. */
function copyList(bar) {
  const row = item => item.gap ? `<li class="is-gap"><span>Row ${esc(item.row)}</span> <small>leave it empty</small></li>` : `<li class="${item.locked || item.needsSlot ? 'is-later' : ''}"><span>Row ${esc(item.row)}</span> ${esc(item.name)}${item.locked ? ` <small>from Lv ${esc(item.unlockLevel)}</small>` : item.needsSlot ? ' <small>needs a stigma slot</small>' : ''}</li>`;
  const withGaps = step => [...step.rows, ...(step.empty ?? []).map(entry => ({ row: entry.row, gap: true }))].sort((a, b) => a.row - b.row);
  return `<details class="ae-copy" id="aeCopyBar" open>
    <summary class="ae-mskills-title">Copy this bar</summary>
    <ol class="ae-copy-steps">${bar.copySteps.map(step => step.macro
      ? `<li class="is-macro" data-copy-step="macro">${esc(step.text)}</li>`
      : `<li data-copy-step="${esc(step.key)}"><b>${esc(step.label)}</b>${step.rows.length === 1 && !step.empty?.length ? ` ${esc(step.rows[0].name)}${step.rows[0].locked ? ` <small>from Lv ${esc(step.rows[0].unlockLevel)}</small>` : step.rows[0].needsSlot ? ' <small>needs a stigma slot</small>' : ''}` : `<ol class="ae-copy-rows">${withGaps(step).map(row).join('')}</ol>`}</li>`).join('')}</ol>
    <p class="ae-muted">Left click keeps ${esc(bar.mainAttack)}: the game sets it.</p>
  </details>`;
}
/** "Comes later": the skills the plan puts on the bar once this Daeva can place them, soonest first, each with when or why. */
function comesLater(bar) {
  if (!bar.later?.length) return '';
  return `<div class="ae-icon-group ae-later" id="aeComesLater"><p class="ae-mskills-title">Comes later</p>
    <ul class="ae-chiplist ae-later-list">${bar.later.map(item => `<li data-later-skill="${esc(item.name)}">${art(item.icon)}<span>${esc(item.name)} <small>${esc(item.reason)}</small></span></li>`).join('')}</ul></div>`;
}
function renderSkillBarScreen(plan) {
  const bar = plan.skillBar;
  if (!bar) return '<p class="ae-callout">The skill list for this class is not loaded yet.</p>';
  if (!bar.fromBlock) return `<p class="ae-callout">No bar layout is sourced for this build yet.</p>`;
  const chains = plan.chains?.chains ?? [];
  const chip = (name, icon, note) => `<li>${art(icon)}<span>${esc(name)}${note ? ` <small>${esc(note)}</small>` : ''}</span></li>`;
  const used = bar.left.filter(key => bar.stacks[key].skills.length);
  const leftKeys = bar.left.slice(0, Math.max(8, used.length));
  const pendingCooldowns = Object.values(bar.stacks).flatMap(stack => stack.skills).filter(skill => skill.cooldownPending && !skill.fixed);
  return `<div class="ae-skillbar">
    <div class="ae-bar-top">
      <div class="ae-bar-main">
        <p class="ae-bar-swipe" aria-hidden="true">Swipe the keys to see them all ›</p>
        <div class="ae-bar-scroll" id="aeSkillBar">
          <div class="ae-bar-blocks">
            <div class="ae-bar-block is-left" id="aeLeftBlock" aria-label="Left-hand block: one skill per key">${leftKeys.map(key => barColumn(bar, key)).join('')}</div>
            ${rightBlock(bar)}
          </div>
        </div>
      </div>
      ${firesNowPanel(plan)}
    </div>
    <p class="ae-bar-rule" id="aeStackRule">Each key is a stack: press it and the lowest ready skill fires, row 0 first. ${['A', 'B'].filter(key => bar.stacks[key].skills.length).length === 2 ? 'Stack A and stack B sit either side of your main attack and go into your macro.' : `${esc(keyName(['A', 'B'].find(key => bar.stacks[key].skills.length) ?? 'B'))} sits beside your main attack and is your macro.`} Everything else gets a key of its own. Tap a skill to see why it sits there. ${ruleTag(bar.rule, 'skill-stack')}${bar.status && bar.status !== 'confirmed' ? ` ${statusTag({ status: bar.status }, 'bar-layout')}` : ''} ${unverifiedTag(bar)}</p>
    ${copyList(bar)}
    ${comesLater(bar)}
    ${chains.length ? `<div class="ae-icon-group" id="aeFollowUps"><p class="ae-mskills-title">Follow-up skills ${ruleTag(plan.chains, 'chain-follow-up', { test: false })}</p>
      <ul class="ae-chiplist ae-followups">${chains.map(chain => chip(chain.followUp, plan.skillIcons[chain.followUp], chain.pending ? chain.pending.reason : `follow-up to ${chain.leadIns.join(' or ')}${chain.opensAt ? ` from skill Lv ${chain.opensAt}` : ''}${chain.reach ? `. ${chain.reach.note}.` : ''}`)).join('')}</ul>
      <p class="ae-muted">Press a follow-up when it lights up.${plan.chains.confirmed ? '' : ` It goes above its lead-in in the stack once the chain rule is confirmed.${plan.chains.test ? ` <span class="ae-tag-test" data-rule-test="chain-follow-up">Check it in game: ${esc(plan.chains.test)}</span>` : ''}`}</p></div>` : ''}
    ${bar.notOnBar.length ? `<div class="ae-icon-group" id="aeNotOnBar"><p class="ae-mskills-title">Not on your bar</p><ul class="ae-chiplist">${bar.notOnBar.map(skill => chip(skill.name, skill.icon, skill.reason)).join('')}</ul></div>` : ''}
    ${pendingCooldowns.length ? `<p class="ae-muted ae-bar-pending">Cooldown not captured yet for ${esc(pendingCooldowns.map(skill => skill.name).join(', '))}. Check each tooltip in game.</p>` : ''}
    <p class="ae-muted ae-bar-note">This is where the build puts each skill, not what is on your bars now. The official AION 2 site only says whether a skill is equipped, never which key or row it is on.</p>
  </div>`;
}
/** A skill's triggers on its card: each with its condition or effect, a skill-level one dim until the Daeva reaches it. */
function triggersHtml(item) {
  const list = item.triggers ?? [];
  if (!list.length) return '';
  const LABEL = { condition: 'Needs', opens: 'Gives', cdCut: 'Cooldown' };
  return `<ul class="ae-triggers" data-triggers>${list.map(trigger => `<li class="${trigger.dim ? 'is-dim' : ''}" data-trigger-level="${esc(trigger.skillLevel ?? '')}"><b>${esc(LABEL[trigger.type] ?? 'Note')}</b> ${esc(trigger.text)}${trigger.from ? ` <small>${esc(trigger.from)}</small>` : ''}</li>`).join('')}</ul>
    ${list.some(trigger => trigger.status !== 'confirmed') ? '<p class="ae-card-line"><span class="ae-tag is-unconfirmed">Not confirmed yet</span></p>' : ''}`;
}
/** A cell's card: the skill's own card, then where it goes and why, its condition and triggers. */
function barSkillCard(name, role, key = null) {
  const plan = state.plan;
  const stack = key ? plan.skillBar.stacks[key] : null;
  const item = stack?.skills.find(skill => skill.name === name) ?? null;
  const place = item ? `<p class="ae-card-line is-stack" data-place-line>${esc(placeLine(item))}</p>${item.condition ? `<p class="ae-card-line" data-condition>${esc(item.condition)}</p>` : ''}${item.needsSlot ? '<p class="ae-card-line" data-needs-slot>A stigma swap: it needs one of your four stigma slots before it fires.</p>' : ''}${triggersHtml(item)}` : '';
  const entry = [...plan.mastery.active, ...plan.mastery.passive].find(skill => skill.name === name);
  const index = plan.stigmas.slots?.findIndex(slot => slot.name === name) ?? -1;
  if (index >= 0) return `${stigmaCard(plan, index)}${place}`;
  if (entry) return `${masteryCard(entry)}${place}`;
  return `${infoCardHtml({ icon: plan.skillIcons[name], title: name, sub: item?.stigma ? 'Stigma' : 'Skill' })}${place}`;
}
/** A key's panel: the stack in plain words, then each skill with its row and why, lowest row first. */
function keyPanel(key) {
  const plan = state.plan;
  const stack = plan.skillBar.stacks[key];
  const cards = stack.skills.map((skill, index) => `<section class="ae-stack-card" data-stack-row="${skill.row ?? index}">
      <p class="ae-slot-label">Row ${skill.row ?? index}${index === 0 ? ', fires first' : ''}: ${esc(cooldownWords(skill))}</p>
      ${barSkillCard(skill.name, skill.role, key).replace(/ id="aeInfoTitle"/, '')}
    </section>`).join('');
  return `<div class="ae-card-head"><div><h3 id="aeInfoTitle">${esc(keyName(key))}</h3><p>${stack.skills.length === 1 ? 'One skill on this key' : `${stack.skills.length} skills stacked, rows 0 to ${stack.skills.length - 1}`}</p></div></div>
    <p class="ae-card-line is-stack" data-key-say>${esc(stackSentence(stack))}</p>
    ${firesNowSentence(stack) ? `<p class="ae-card-line is-now" data-key-now>${esc(firesNowSentence(stack))}</p>` : ''}
    ${stack.fillerMissing ? `<p class="ae-card-line" data-key-nofiller>${esc(stack.fillerMissing)}</p>` : ''}
    ${cards || '<p class="ae-empty">Nothing on this key.</p>'}`;
}

/* Macro, as the game's Macro window: entry 1 stack A, entry 2 stack B, 10 ms delay each, copied straight across. Above it
   the right-hand block of the bar, the same picture the Skill Bar screen draws, so the two never disagree. */
function renderMacroScreen(plan) {
  const m = plan.macro;
  const order = m?.facts ?? plan.macroOrder;
  if (!m || m.pending) return `${pendingNote(m?.pending ?? plan.rotation)}${order?.setup ? `<p class="ae-note">Open Skill, then Macro, to see the window in game.</p>` : ''}`;
  const bar = plan.skillBar;
  const delay = m.delayMs;
  const entries = m.entries.map(entry => `<li class="ae-macro-entry" data-macro-entry="${entry.entry}" data-macro-key="${esc(entry.key)}">
      <span class="ae-macro-num">${entry.entry}</span>
      <span class="ae-macro-skill"><b>${esc(keyName(entry.key))}</b>${entry.label && entry.label !== entry.name ? ` <span class="ae-macro-of">${esc(entry.label)}</span>` : ''}${entry.usable ? '' : ` <small>From Lv ${esc(entry.unlockLevel)}</small>`}</span>
      <span class="ae-macro-rows" aria-label="${esc(`${keyName(entry.key)}, row 0 first: ${entry.skills.map(skill => skill.name).join(', ')}`)}">${entry.skills.map(skill => `<span class="ae-macro-row${skill.inMacro ? '' : ' is-out'}" data-macro-row="${skill.row}" data-tip="${esc(`${skill.name}${skill.out ? `. ${skill.out}` : ''}`)}">${art(plan.skillIcons[skill.name])}</span>`).join('')}</span>
    </li>
    <li class="ae-macro-delay" aria-label="Delay ${esc(delay)} ms"><span>Delay</span><b>${esc(delay)}</b><span>ms</span></li>`).join('');
  const hold = macroRule(plan, 'hold-basic');
  const skip = factOf(plan, 'skip-on-cooldown');
  const later = m.later.length ? `<p class="ae-macro-later" id="aeMacroLater">Joins later: ${m.later.map(item => `<span data-later="${esc(item.name)}">${esc(item.name)} <b>Lv ${esc(item.unlockLevel)}</b></span>`).join(', ')}.</p>` : '';
  const opener = m.opener.length ? `<section class="ae-macro-opener" id="aeMacroOpener" aria-labelledby="aeOpenerTitle">
      <h2 class="ae-mskills-title" id="aeOpenerTitle">Open with</h2>
      <ol class="ae-opener-strip">${m.opener.map((item, index) => `<li class="${item.locked || item.needsSlot ? 'is-locked' : ''}" data-opener="${index + 1}"><span class="ae-opener-num">${index + 1}</span><span class="ae-bar-cell is-opener${item.locked || item.needsSlot ? ' is-locked' : ''}" role="button" tabindex="0" data-bar-skill="${esc(item.name)}" data-bar-role="opener" data-bar-key="0:${esc(item.key)}" aria-label="${esc(`${index + 1}: ${item.name}, ${keyName(item.key)}`)}" data-tip="${esc(item.name)}">${art(item.icon)}${item.locked ? `<span class="ae-lock" aria-hidden="true">${ICON.lock}<b>Lv ${esc(item.unlockLevel)}</b></span>` : ''}</span><small>${esc(item.name)}</small></li>`).join('')}<li class="is-then"><span>Then hold the macro</span></li></ol>
    </section>` : '';
  const groups = m.ownKeys.length ? `<section class="ae-own-keys" id="aeOwnKeys" aria-labelledby="aeOwnTitle">
      <h2 class="ae-mskills-title" id="aeOwnTitle">Keep on their own keys ${statusTag(macroRule(plan, 'own-keys'), 'own-keys')}</h2>
      <div class="ae-own-groups">${m.ownKeys.map(group => `<div class="ae-own-group" data-own-group="${esc(group.reason)}"><p>${esc(OWN_LABEL[group.reason] ?? 'Own key')}</p><div class="ae-icon-row">${group.skills.map(skill => `<span class="ae-bar-cell is-own${skill.locked || skill.needsSlot ? ' is-locked' : ''}" role="button" tabindex="0" data-bar-skill="${esc(skill.name)}" data-bar-role="own" data-bar-key="0:${esc(skill.key)}" data-tip="${esc(`${skill.name}: ${skill.why}`)}" aria-label="${esc(`${skill.name}. ${skill.why}`)}">${art(skill.icon)}</span>`).join('')}</div></div>`).join('')}</div>
    </section>` : '';
  const delayRule = macroRule(plan, 'delay');
  const queue = factOf(plan, 'skill-queue');
  const mouse = factOf(plan, 'mouse-bind-aion1');
  const test = macroRule(plan, 'test-dummy');
  return `<div class="ae-macro-screen">
    <div class="ae-macro-main">
      ${rightBlock(bar, { id: 'aeMacroBlock' })}
      <div class="ae-macro-window" id="aeMacroWindow">
        <div class="ae-macro-tabs" aria-hidden="true"><span class="is-on">1</span><span>2</span><span>3</span></div>
        <ol class="ae-macro">${entries}</ol>
        <p class="ae-macro-count" id="aeMacroCount">${m.entries.length === 2 ? 'Two entries, one for each stack either side of your main attack.' : `One entry: ${esc(keyName(m.entries[0]?.key ?? 'B').toLowerCase().replace(/^(?!stack)/, 'the '))}, beside your main attack.`} ${unverifiedTag(bar)}</p>
      </div>
      <p class="ae-macro-skip" id="aeMacroRule">Each entry fires its stack's first ready skill. ${skip ? `${esc(skip.text.split('. ')[0])}. ${statusTag(skip, 'skip-on-cooldown')}` : ''}</p>
      ${later}
      <section class="ae-macro-hold" id="aeMacroHold" aria-labelledby="aeHoldTitle">
        <h2 class="ae-mskills-title" id="aeHoldTitle">How to run it ${statusTag(hold, 'hold-basic')}</h2>
        <div class="ae-hold-keys" aria-hidden="true"><span class="ae-hold-key"><b>Macro</b><small>your macro key</small></span><span class="ae-hold-plus">+</span><span class="ae-hold-key is-mouse">${MOUSE_SVG(true)}<small>${esc(m.mainAttack?.name ?? bar.mainAttack)}</small></span></div>
        <p>Hold both. Your basic attack fills the gaps, gives MP and cuts each animation short.</p>
      </section>
    </div>
    <div class="ae-macro-side">
      ${opener}
      ${groups}
      <section class="ae-macro-settings" id="aeMacroSettings" aria-labelledby="aeSettingsTitle">
        <h2 class="ae-mskills-title" id="aeSettingsTitle">Settings</h2>
        <dl class="ae-settings">
          <div data-setting="delay"><dt>Delay</dt><dd>${esc(delay)} ms. ${delayRule?.value?.slowMs ? `${esc(delayRule.value.slowMs.join(' to '))} ms if skills fail to fire or your ping is ${esc(delayRule.value.pingMs)} ms or more.` : ''} ${statusTag(delayRule, 'delay')}</dd></div>
          ${order?.bind ? `<div data-setting="bind" id="aeMacroBind"><dt>Key</dt><dd><ol class="ae-crumbs">${order.bind.path.map(step => `<li>${esc(step)}</li>`).join('')}</ol>${order.bind.defaultKey ? '' : 'No key is set at the start, so bind one.'}${mouse ? ` ${esc(mouse.text)} ${statusTag(mouse, 'mouse-bind-aion1')}` : ''}</dd></div>` : ''}
          ${queue ? `<div data-setting="skill-queue"><dt>Skill Queue</dt><dd>Players disagree. Test both. ${statusTag(queue, 'skill-queue')}</dd></div>` : ''}
          ${order?.bind?.presets ? `<div data-setting="presets" id="aeMacroPresets"><dt>Presets</dt><dd>${esc(order.bind.presetNote)}</dd></div>` : ''}
        </dl>
      </section>
      ${test ? `<section class="ae-macro-test" id="aeMacroTest" aria-labelledby="aeTestTitle">
        <h2 class="ae-mskills-title" id="aeTestTitle">Test it on the training dummy ${statusTag(test, 'test-dummy')}</h2>
        <ol class="ae-test-steps">${(test.steps ?? []).map(step => `<li>${esc(step)}</li>`).join('')}</ol>
        <p class="ae-muted">Open Combat Analysis with Ctrl+X.${test.check ? ` <span class="ae-tag-test" data-fact-test="test-dummy">Check it in game: ${esc(test.check)}</span>` : ''}</p>
      </section>` : ''}
      ${m.extras.length ? `<div class="ae-icon-group" id="aeMacroExtras"><p class="ae-mskills-title">Some players add</p><ul class="ae-chiplist">${m.extras.map(item => `<li>${art(item.icon)}<span>${esc(item.name)} <small>${esc(item.reason)}</small></span></li>`).join('')}</ul></div>` : ''}
      ${m.levelNotes.length ? `<ul class="ae-macro-notes" id="aeMacroNotes">${m.levelNotes.map(note => `<li>${esc(note.text)}</li>`).join('')}</ul>` : ''}
    </div>
  </div>`;
}

/* The stat chain under one combat stat: the main and deity stats that feed it, with the Daeva's own points when live
   ("Accuracy ← Precision 11, Freedom 26"), each with its own 20px icon, gold when High for the class. A stat order line
   that names no combat stat a point stat feeds says so. */
function statChainHtml(entry, live, rank) {
  const links = entry?.links ?? [];
  const fed = links.filter(link => link.from.length);
  if (!fed.length) return `<span class="ae-chain is-none">${links.length ? 'From gear lines and Daevanion, not from stat points' : 'No stat points feed this'}</span>`;
  return fed.map(link => `<span class="ae-chain" data-chain="${esc(link.name)}"><b>${esc(link.name)}</b> <span aria-hidden="true">←</span><span class="ae-visually-hidden"> comes from</span> ${link.from.map(from => `<span class="ae-chain-stat is-${esc(from.kind)}">${statIcon(from.icon, { size: 20, high: rank?.[from.id]?.tag === 'high' })}${esc(from.name)}${live && from.points !== null ? ` <b>${esc(from.points)}</b>` : ''}</span>`).join(', ')}</span>`).join('');
}

/* What to look for on each kind of gear: the lines this build wants in its order, the rest greyed as skip. */
function gearRowsHtml(rows) {
  return `<section class="ae-gear-look" id="aeGearLook" aria-labelledby="aeGearLookTitle">
      <h3 class="ae-stats-group" id="aeGearLookTitle">What to look for on your gear <span class="ae-tag is-unconfirmed">Not confirmed yet</span> <span class="ae-tag-test">Check: the sub stat lines your gear rolls in game.</span></h3>
      <ul class="ae-look-rows">${rows.map(row => `<li data-gear-row="${esc(row.id)}"><strong>${esc(row.label)}</strong>
        <span>${row.want.length ? row.want.map(stat => `<span class="ae-look-want${stat.tag ? ` is-${esc(stat.tag)}` : ''}">${esc(stat.name)}</span>`).join(' ') : '<span class="ae-look-none">Nothing your build chases</span>'}${row.skip.length ? `<span class="ae-look-skip">Skip: ${esc(row.skip.map(stat => stat.name).join(', '))}</span>` : ''}</span></li>`).join('')}</ul>
    </section>`;
}

function renderStatsScreen(plan) {
  const s = plan.stats;
  const sp = plan.statPlan;
  if (isPending(s)) return `${pendingNote(s)}${sp ? `<p class="ae-muted" id="aeNoStatOrder">No stat order for this class yet. What each stat does is on the Gear page.</p>${gearRowsHtml(sp.gear)}` : ''}`;
  return `<ol class="ae-stat-ranks">${s.order.map((stat, index) => `<li data-stat-rank="${index + 1}"><span class="ae-stat-rank">${index + 1}</span><span class="ae-stat-rank-text"><strong>${esc(stat)}</strong>${sp?.chains ? statChainHtml(sp.chains[index], sp.live, sp.rank) : ''}</span></li>`).join('')}</ol>
    <p class="ae-muted">Look for these, in this order, on gear, manastones and accessories.${s.status && s.status !== 'confirmed' ? ` ${statusTag({ status: s.status }, 'stat-order')}` : ''}</p>
    ${s.manastones ? `<section class="ae-manastones" id="aeManastones" aria-labelledby="aeManastonesTitle"><h3 class="ae-stats-group" id="aeManastonesTitle">Manastones</h3>
      <ul class="ae-mana-caps">${s.manastones.caps.map(cap => `<li data-mana="${esc(cap.stat)}"><b>${esc(cap.stat)}</b> up to ${esc(cap.cap)}</li>`).join('')}</ul>
      ${s.manastones.advice ? `<p>${esc(s.manastones.advice)}</p>` : ''}</section>` : ''}
    ${sp ? gearRowsHtml(sp.gear) : ''}
    <p class="ae-callout" id="aeStatsWhere">The official AION 2 site does not share combat stats such as Attack, Defense or Accuracy, so the Gear page cannot show yours. Check them on your in-game character screen.</p>
    ${plan.character ? '' : `<p><a class="btn" id="aeGearLink" href="${esc(viewHref('gear'))}">Find your Daeva to see your gear</a></p>`}`;
}

function renderBoardsByHand(plan) {
  const d = plan.daevanion;
  return `${d.budget ? `<p class="ae-budget" id="aeBudget"><b>${esc(d.budget.points)}</b> points in Season 1. The boards cost ${esc(Object.values(d.budget.boardCost).reduce((a, b) => a + b, 0))} in all, so plan inside ${esc(d.budget.points)}.</p>` : ''}
    <ul class="ae-board-cards">${d.boards.map(board => `<li class="${board.open ? 'is-open' : 'is-locked'}" data-board-card="${esc(board.name)}">
      <img src="${esc(nodeArt(board.open ? 'unique' : 'stat', board.open))}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      <span><strong>${esc(board.name)}</strong><small>${esc(board.focus)}</small></span>
      <b>${board.open ? 'Open' : `Lv ${esc(board.unlockLevel)}`}</b>
    </li>`).join('')}</ul>
    ${isPending(d.priorities) ? pendingNote(d.priorities) : `<div class="ae-board-first" id="aeBoardFirst"><p class="ae-mskills-title">Take these first ${d.status === 'reported' ? statusTag({ status: 'reported' }, 'node-priorities') : ''}</p><ol class="ae-list">${d.priorities.map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>`}
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
    for (const entry of m.atCap ?? []) add(`${entry.name} is at the Mastery cap (${entry.cap}), so no more skill points go into it. Its next +1: ${nextLevelText(entry.next)}.`, `[data-mastery-cap="${CSS.escape(entry.name)}"]`, pick(entry.name));
    for (const step of levelOrder(plan).slice(0, 3)) add(`Put skill points into ${step.name}${step.from !== null ? `: Lv ${step.from} to ${step.to}` : ` up to Lv ${step.to}`}. That ${step.reason}.`, `[data-mastery="${CSS.escape(step.name)}"]`, pick(step.name));
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
    // Each equipped stigma that is not a build pick is said once: a listed swap as a swap, anything else as swap it out.
    const standIn = new Map((s.equippedNow ?? []).filter(item => item.verdict !== 'keep' && item.for).map(item => [item.for, item]));
    for (const item of (s.equippedNow ?? []).filter(entry => entry.verdict !== 'keep')) add(equippedLine(item), `[data-stigma-line="${CSS.escape(item.name)}"]`);
    s.slots.forEach((slot, index) => {
      if (!slot.open || standIn.has(slot.name)) return;
      add(slot.equipped ? `Slot ${index + 1}: ${slot.name} is equipped. Keep it.` : `Slot ${index + 1}: equip ${slot.name}.`, `[data-stigma="${index}"]`, pick(index));
    });
    const next = s.slots.findIndex(slot => !slot.open);
    if (next >= 0 && plan.level >= s.unlockLevel) add(`At Lv ${s.slots[next].slotLevel} slot ${next + 1} opens. Put ${s.slots[next].name} in it.`, `[data-stigma="${next}"]`, pick(next));
    for (const alt of s.alternatives.slice(0, 2)) add(`Want a swap? ${alt.name}. ${alt.why}`, `[data-alt="${CSS.escape(alt.name)}"]`);
  } else if (view === 'skill-bar') {
    const bar = plan.skillBar;
    if (!bar || !bar.fromBlock) return [];
    const stacks = bar.stacks;
    const drawn = ['A', 'B'].filter(key => stacks[key].skills.length);
    add(drawn.length === 2 ? `Your right-hand block: stack A, your main attack (${bar.mainAttack}) on left click, then stack B. These two stacks are your macro.` : `Your right-hand block: your main attack (${bar.mainAttack}) on left click, then ${keyName(drawn[0] ?? 'B').toLowerCase().replace(/^(?!stack)/, 'the ')} beside it. That is your macro.`, '#aeRightBlock');
    for (const key of ['A', 'B']) {
      const stack = stacks[key];
      if (!stack.skills.length) continue;
      const now = firesNowSentence(stack);
      add(`${stackSentence(stack)}${now ? ` ${now}` : ''}`, `[data-bar-keycap="${key}"]`);
    }
    if (['A', 'B'].some(key => stacks[key].nextUnlock !== null)) add(`This is what your stacks fire at Lv ${plan.level}. Greyed skills join as you level.`, '#aeFiresNow');
    const own = bar.left.map(key => stacks[key].skills[0]).filter(Boolean);
    if (own.length) add(`The left-hand block: one skill per key, in the order you use them${bar.opener.length ? `. Open with ${bar.opener.join(', then ')}` : ''}. Tap any of them to see why it stays off the macro.`, '#aeLeftBlock');
    add('Copy it across key by key, then add stack A and stack B to Macro 1.', '#aeCopyBar');
    if (plan.chains?.chains?.length) add('Follow-up skills light up after their lead-in. Press them then.', '#aeFollowUps');
    if (bar.notOnBar.length) add('Skills that get no key are listed here, with the reason.', '#aeNotOnBar');
  } else if (view === 'macro') {
    const m = plan.macro;
    if (!m || m.pending) return [];
    const named = key => keyName(key).toLowerCase().replace(/^(?!stack)/, 'the ');
    add(`In game, open Skill, then Macro. Pick macro slot 1 and press Add Macro. Add ${m.entries.map(entry => named(entry.key)).join(', then ')}, ${m.delayMs} ms delay ${m.entries.length === 2 ? 'each' : 'after it'}.`, '#aeMacroWindow');
    if (m.entries[0]) add(`Entry 1 is ${named(m.entries[0].key)}: ${m.entries[0].skills.map(skill => skill.name).join(', ')}. It fires the first one that is ready.`, '[data-macro-entry="1"]');
    if (m.later.length) add('These join the stacks as you level. They sit in place already.', '#aeMacroLater');
    add(`Hold the macro key and your main attack, ${m.mainAttack?.name ?? plan.skillBar.mainAttack}, together.`, '#aeMacroHold');
    if (m.opener.length) add(`Before the macro: ${m.opener.map(item => item.name).join(', then ')}.`, '#aeMacroOpener');
    if (m.ownKeys.length) add('Keep these off the macro, on their own keys. Tap one to see why.', '#aeOwnKeys');
    const bind = m.facts?.bind ?? plan.macroOrder?.bind;
    if (bind) add(`Give the macro a key: ${bind.path.join(', ')}. Hold it in fights.`, '#aeMacroBind');
    if (bind?.presets) add(bind.presetNote, '#aeMacroPresets');
    if (m.rules?.rules?.some(rule => rule.id === 'test-dummy')) add('Then test it on the training dummy and keep the setup with the higher number.', '#aeMacroTest');
  } else if (view === 'stats') {
    if (isPending(plan.stats)) return [];
    plan.stats.order.slice(0, 3).forEach((stat, index) => add(`${index === 0 ? 'First' : index === 1 ? 'Then' : 'After that'}: ${stat}.`, `[data-stat-rank="${index + 1}"]`));
    add('These are combat stats the official site does not share, so check yours on your in-game character screen.', '#aeStatsWhere');
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
    for (const step of route.slice(0, 5)) add(`Node ${step.step} on your route: take ${step.effects[0] || step.name}. ${step.target ? step.reason : `It is on the way to ${step.targetName}.`}`, `.ae-node[data-node="${CSS.escape(String(step.nodeId))}"]`, () => selectNode(step.nodeId));
    if (planner.split?.shortBy && planner.split.now.length) add(`That is all your points. Step ${planner.split.now.length + 1} needs ${planner.split.shortBy} more.`, '#aeRouteSummary');
    if (state.plan.daevanion.roleRoute?.known) add('This is what the whole route adds: your key skills\' levels and the stats.', '#aeRouteTotal');
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
/** The number on a skill tile: its place in the level order the plan gives (level planner), else the build's priority. */
function rankOf(entry) {
  if (!state.plan?.setup?.planned) return entry.priority;
  const at = levelOrder(state.plan).findIndex(step => step.name === entry.name);
  return at >= 0 ? at + 1 : null;
}
function masteryTile(entry) {
  const locked = entry.unlocked === false || entry.acquired === false;
  const onBar = entry.equipped === true && !locked;
  const offBar = entry.equipped === false && entry.priority && !locked;
  return `<span role="button" tabindex="0" class="ae-mskill${locked ? ' is-locked' : ''}${entry.priority ? ' is-key' : ''}" data-mastery="${esc(entry.name)}" data-tip="${esc(locked && entry.needLevel ? `${entry.name} · unlocks at Lv ${entry.needLevel}` : entry.skillLevel !== null ? `${entry.name} · skill Lv ${entry.skillLevel}` : entry.name)}"${onBar ? ' data-equipped="true"' : entry.equipped === false && !locked ? ' data-equipped="false"' : ''} aria-label="${esc(entry.name)}${locked && entry.needLevel ? `, unlocks at character level ${entry.needLevel}` : ''}${entry.skillLevel !== null ? `, skill Lv ${entry.skillLevel}` : ''}${onBar ? ', on your skill bar' : ''}${entry.priority ? `, build priority ${entry.priority}` : ''}">
    <span class="ae-mskill-name">${esc(entry.name)}</span>
    ${entry.icon ? `<img src="${esc(entry.icon)}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
    ${rankOf(entry) ? `<span class="ae-mskill-rank">${rankOf(entry)}</span>` : ''}
    ${onBar ? '<span class="ae-mskill-bar" aria-hidden="true">●</span>' : offBar ? '<span class="ae-mskill-bar is-off" aria-hidden="true">!</span>' : ''}
    ${locked && entry.needLevel ? `<span class="ae-lock" aria-hidden="true">${ICON.lock}<b>Lv ${esc(entry.needLevel)}</b></span>` : entry.skillLevel !== null ? `<span class="ae-mskill-lv" aria-hidden="true">${esc(entry.skillLevel)}</span>` : ''}
  </span>`;
}

function masteryCard(entry) {
  const pickOf = perk => entry.slots.some(slot => slot.pick && slot.pick.skillLevel === perk.skillLevel && perk.text.toLowerCase().includes(slot.pick.pick.toLowerCase().split(' ')[0]));
  const cd = typeof entry.cooldownSeconds === 'number' ? `${entry.cooldownSeconds} s cooldown` : null;
  const locked = entry.unlocked === false || entry.acquired === false;
  const capped = (state.plan?.mastery?.atCap ?? []).find(item => item.name === entry.name) ?? null;
  const status = locked ? ['lock', `Unlocks at Lv ${entry.needLevel}`]
    : entry.category === 'Active' && entry.acquired && entry.equipped === false && entry.priority ? ['need', 'Not on your skill bar. Drag it on.']
    : entry.equipped === true ? ['keep', 'On your skill bar'] : null;
  const specialty = entry.category !== 'Active' ? '' : `
    <div class="ae-card-slots">${entry.slots.map(slot => `<span class="ae-card-slot ${slot.open ? 'is-open' : 'is-locked'}"><b>${slot.slot}</b><small>Lv ${slot.slotLevel}</small><em>${esc(slot.pick ? slot.pick.pick : 'Free pick')}</em>${slot.reach ? `<small class="ae-reach${slot.reach.reachable ? '' : ' is-no'}" data-reach>${esc(slot.reach.note)}</small>` : ''}</span>`).join('')}</div>
    ${entry.perks.length ? `<ul class="ae-mperks">${entry.perks.map(perk => `<li${pickOf(perk) ? ' class="is-pick"' : ''}><span class="ae-pick-level">${esc(perk.skillLevel)}</span>${esc(perk.text)}</li>`).join('')}</ul>` : ''}`;
  return infoCardHtml({
    icon: entry.icon, title: entry.name, level: entry.skillLevel,
    sub: `${entry.category}${entry.priority ? ` · key skill ${entry.priority}` : ''}`,
    status,
    chips: [cd, entry.targetText ?? entry.target ? `Target: ${entry.targetText ?? entry.target}` : null],
    lines: [entry.summary, entry.why, capped ? `At the Mastery cap (${capped.cap}). Next +1: ${nextLevelText(capped.next)}.` : null],
    body: `${specialty}${chainHtml(state.plan, entry.chains)}`
  });
}

/* A skill at the Mastery cap: where its next +1 comes from, in words (the card, the guide) and with the
   board link (the Mastery screen). The engine names the node when the board has been read; until then the
   page reads the open boards one by one (readCapBoards), and says so. */
const capReads = { busy: false, failed: new Set() };
function nextLevelText(next) {
  if (next.kind === 'daevanion') return `the Daevanion node ${next.nodeName} on ${next.board.name}`;
  if (next.kind === 'unread') return capReads.failed.has(next.board.id) ? `a Daevanion skill node, if ${next.board.name} still has it open` : `a Daevanion skill node (reading your ${next.board.name} board)`;
  return next.text;
}
function nextLevelHtml(next) {
  if (next.kind === 'daevanion') return `<a class="ae-linkish" href="${esc(viewHref('daevanion'))}&board=${encodeURIComponent(next.board.id)}&node=${encodeURIComponent(next.nodeId)}" data-cap-node="${esc(next.nodeId)}">${esc(next.nodeName)}</a> on ${esc(next.board.name)}`;
  if (next.kind === 'unread' && capReads.failed.has(next.board.id)) return `a Daevanion skill node, if ${esc(next.board.name)} still has it open. <a class="ae-linkish" href="${esc(viewHref('daevanion'))}&board=${encodeURIComponent(next.board.id)}">Open ${esc(next.board.name)}</a>`;
  return esc(nextLevelText(next));
}
/** Reads the first open board the cap list still needs, then draws the plan again. One board at a time. */
async function readCapBoards() {
  const model = state.model;
  const unread = (state.plan?.mastery?.atCap ?? []).map(entry => entry.next).find(next => next.kind === 'unread');
  if (!model || !unread || capReads.busy || capReads.failed.has(unread.board.id)) return;
  const board = model.daevanion.find(item => item.id === unread.board.id);
  if (!board) return;
  capReads.busy = true;
  try {
    const nodes = planner.nodes.get(board.id) ?? (await loadBoard(model, board)).nodes;
    board.nodes = nodes;
    planner.nodes.set(board.id, nodes);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    capReads.failed.add(board.id);
  } finally {
    capReads.busy = false;
  }
  if (state.model === model) renderPlan();
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
  const atCap = m.atCap ?? [];
  return `<div class="ae-mastery" id="aeMastery">
    ${levelOrder(plan).length ? `<div class="ae-icon-group ae-mspend" id="aeMasterySpend"><p class="ae-mskills-title">Level these next</p><div class="ae-icon-row">${levelOrder(plan).map(step => iconTile(step.name, icons[step.name], { big: true, badge: step.from !== null ? `${step.from}→${step.to}` : `→${step.to}`, attr: `data-mastery="${esc(step.name)}"`, tip: `${step.name}: ${step.from !== null ? `Lv ${step.from} to ${step.to}` : `to Lv ${step.to}`}` })).join('')}</div></div>` : ''}
    ${levelOrder(plan).length ? `<ol class="ae-mwhy" id="aeMasteryWhy">${levelOrder(plan).slice(0, 4).map(step => `<li data-mastery-why="${esc(step.name)}"><b>${esc(step.name)}</b> ${esc(step.from !== null ? `Lv ${step.from} to ${step.to}` : `up to Lv ${step.to}`)}. ${esc(step.why ?? `It ${step.reason}.`)}</li>`).join('')}</ol>` : ''}
    ${atCap.length ? `<div class="ae-mspend ae-mcap" id="aeMasteryCap"><p class="ae-mskills-title">At the Mastery cap (${esc(m.cap)})</p><ul class="ae-mcap-list">${atCap.map(entry => `<li data-mastery-cap="${esc(entry.name)}">${iconTile(entry.name, icons[entry.name], { badge: String(entry.skillLevel), attr: `data-mastery="${esc(entry.name)}"`, tip: `${entry.name}: skill Lv ${entry.skillLevel}` })}<span><strong>${esc(entry.name)}</strong> is Lv ${esc(entry.skillLevel)}. Mastery stops at ${esc(entry.cap)}, so no more skill points go here.<br>Next +1: ${nextLevelHtml(entry.next)}</span></li>`).join('')}</ul></div>` : ''}
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

/**
 * Reads the boards the role route needs (one Worker call each, cached for the visit). 'all' reads every open board (the
 * Daevanion screen: points over every board); 'current' reads until the route's current board is read (the menu's move).
 */
async function readRouteBoards(mode) {
  const model = state.model;
  if (!model || mode === 'none') return;
  const open = model.daevanion.filter(board => board.open);
  const read = async board => {
    if (Array.isArray(board.nodes) || planner.failed.has(board.id)) return;
    try {
      board.nodes = planner.nodes.get(board.id) ?? (await readBoardOnce(model, board)).nodes;
      planner.nodes.set(board.id, board.nodes);
    } catch (error) {
      if (!(error instanceof ArmoryUnavailable)) throw error;
      planner.failed.add(board.id);
    }
  };
  if (mode === 'all') { await Promise.all(open.map(read)); return; }
  // The menu reads only the route's current board, as the Daeva Card does, so both name the same move.
  const current = buildAscentPlan({ className: state.className, role: state.role, team: state.team, level: state.level, data: state.data, model }).daevanion.roleRoute?.current;
  const board = current && !current.read ? open.find(item => item.id === current.id) : null;
  if (board) await read(board);
}

/** One read per board for the visit, shared by the route reads and the board on screen (never two calls for one board). */
function readBoardOnce(model, board) {
  if (!planner.reading.has(board.id)) planner.reading.set(board.id, loadBoard(model, board).catch(error => { planner.reading.delete(board.id); throw error; }));
  return planner.reading.get(board.id);
}

/** The budget line: points spent over every board read, of the Season 1 budget, and what the planned route takes. */
function budgetLine(route, budget) {
  if (!route || !budget) return '';
  const unread = route.boards.filter(board => board.open && !board.read).map(board => board.name);
  return `<p class="ae-budget" id="aeBudget"><b>${esc(route.spent)}</b> of ${esc(budget.points)} points${unread.length ? ` on the boards read so far (${esc(unread.join(', '))} not read yet)` : ''}. ${route.known ? `This route takes ${esc(route.plannedCost)} more${route.left !== null ? `, ${esc(route.left)} left after it` : ''}.` : ''} ${statusTag({ status: budget.status }, 'daevanion-budget')}</p>`;
}
const BOARD_GROUPS = [['now', 'Now'], ['done', 'Done for your role'], ['later', 'Later']];

function renderPlannerShell(plan) {
  if (!state.model) return renderBoardsByHand(plan);
  const open = plan.daevanion.boards.filter(board => board.open);
  if (!open.length) return `<p class="ae-callout">No board is open yet. ${esc(plan.daevanion.boards[0]?.name ?? 'Nezekan')} opens at Lv ${esc(plan.daevanion.boards[0]?.unlockLevel ?? 12)}.</p>`;
  const route = plan.daevanion.roleRoute;
  if (!open.some(board => board.id === planner.boardId)) planner.boardId = route?.current?.id ?? open[0].id;
  const rows = route?.boards ?? open.map(board => ({ ...board, status: 'later', pointsSpent: null, pointsTotal: null }));
  // An open board is a tab with its points spent of its total; a board not open yet is listed under Later with its level.
  const tab = board => (board.open
    ? `<button type="button" role="tab" class="ae-planner-tab" data-board-tab="${esc(board.id)}" data-board-status="${esc(board.status)}" aria-selected="${board.id === planner.boardId}"><span>${esc(board.name)}</span> <small>${board.pointsSpent !== null ? `${esc(board.pointsSpent)} of ${esc(board.pointsTotal ?? '?')} points` : 'Not read yet'}</small></button>`
    : `<span class="ae-planner-tab is-locked" data-board-locked="${esc(board.id)}"><span>${esc(board.name)}</span> <small>Opens at Lv ${esc(board.unlockLevel)}</small></span>`);
  return `<div class="ae-planner" id="aePlanner">
    ${budgetLine(route, plan.daevanion.budget)}
    <div class="ae-planner-head">
      <div class="ae-board-groups" role="tablist" aria-label="Daevanion boards">${BOARD_GROUPS.map(([status, label]) => {
        const list = rows.filter(board => board.status === status);
        return `<div class="ae-board-group" data-board-group="${status}"><p class="ae-board-group-title">${esc(label)}</p>${list.length ? list.map(tab).join('') : `<p class="ae-muted ae-board-none">${status === 'done' ? 'None yet' : 'None'}</p>`}</div>`;
      }).join('')}</div>
      <label class="ae-field ae-points"><span>Points you have</span><input id="aePoints" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="Top of your Daevanion screen"></label>
    </div>
    <div id="aePlannerBody"><p class="ae-muted">Reading the board.</p></div>
    ${routeSummaryHtml(plan)}
  </div>`;
}

/** What the planned route adds over every board: each key skill's level, with Lv 16 flagged as needing gear, and the stats. */
function routeSummaryHtml(plan) {
  const route = plan.daevanion.roleRoute;
  if (!route || !route.known) return '';
  const cap = plan.masteryCap;
  const skills = route.summary.skills;
  return `<section class="ae-route-total" id="aeRouteTotal" aria-labelledby="aeRouteTotalTitle">
    <h3 class="ae-mskills-title" id="aeRouteTotalTitle">This route adds</h3>
    ${skills.length ? `<ul class="ae-route-skills">${skills.map(skill => `<li data-route-skill="${esc(skill.name)}"><b>${esc(skill.name)}</b> +${esc(skill.gained)} on this route${skill.level !== null ? `: Lv ${esc(skill.level)} with Mastery ${esc(cap)}${skill.taken ? ` and the ${esc(skill.taken)} you have` : ''}${skill.needsGearFor16 ? `. Lv 16 needs +${esc(16 - skill.level)} from a gear roll` : ''}` : ''}.</li>`).join('')}</ul>` : ''}
    ${route.summary.stats.length ? `<p class="ae-route-stats" id="aeRouteStats">${esc(route.summary.stats.map(stat => stat.text).join(', '))}</p>` : ''}
    <p class="ae-muted">Node costs come from the board totals. Check each cost in game before you spend.</p>
  </section>`;
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
    try { result = await readBoardOnce(state.model, board); }
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
  const full = planDaevanionBoard({ nodes, priorities: plan.daevanion.nodePriorities, include: 'all' });
  // The steps the role route plans on this board, inside the budget, numbered from 1 here.
  const row = plan.daevanion.roleRoute?.boards.find(item => item.id === planner.boardId) ?? null;
  let running = 0;
  const planned = (row?.planned ?? []).map((step, index) => { running += step.cost; return { ...step, step: index + 1, totalCost: running }; });
  const stepOf = new Map(planned.map(step => [step.nodeId, step.step]));
  const board = { ...full, route: planned, tiles: full.tiles.map(tile => ({ ...tile, step: stepOf.get(tile.nodeId) ?? null })) };
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
  const done = row?.status === 'done';
  const summary = !board.route.length
    ? (done ? 'Done for your role: every node your role needs on this board is taken.' : row?.status === 'later' && plan.daevanion.roleRoute?.current ? `Later: carry on with ${esc(plan.daevanion.roleRoute.current.name)} first.` : 'Nothing on the route here inside your points budget.')
    : split
      ? (split.now.length
          ? `Your ${esc(points)} ${Number(points) === 1 ? 'point covers' : 'points cover'} the next <b>${split.now.length}</b> ${split.now.length === 1 ? 'step' : 'steps'}.${split.shortBy ? ` Step ${split.now.length + 1} needs ${split.shortBy} more ${split.shortBy === 1 ? 'point' : 'points'}.` : ' That covers the route on this board.'}`
          : `Step 1 needs ${split.shortBy} ${split.shortBy === 1 ? 'point' : 'points'}${Number(points) > 0 ? ` (${split.shortBy} more than you have)` : ''}.`)
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
        <p class="ae-muted ae-route-meta">${board.takenCount} of ${board.totalNodes} nodes taken · ${board.pointsSpent} of ${row?.pointsTotal ?? board.pointsTotal} points spent · nodes for your role ${board.roleTargets?.coreTaken ?? 0} of ${board.roleTargets?.core ?? 0}</p>
        ${board.route.length ? `<ol class="ae-route-list">${list.map(stepItem).join('')}</ol>${board.route.length > list.length ? `<p class="ae-muted">${board.route.length - list.length} more steps after these. Tap any numbered node on the board to see it.</p>` : ''}` : ''}
        <p class="ae-muted">Your role's nodes first, one board at a time, inside your points. Check each cost in game before you spend.</p>
      </div>
    </div>`;
  drawFlow();
  if (planner.observer) planner.observer.disconnect();
  if (typeof ResizeObserver === 'function') { planner.observer = new ResizeObserver(drawFlow); planner.observer.observe($('#aeBoardStage')); }
  const next = (split?.now[0] ?? split?.later[0] ?? board.route[0]);
  // A selection the page made itself (not the player) follows the route when it is drawn again.
  planner.auto = !planner.selected;
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
  const plan = buildAscentPlan({ className: state.className, role: state.role, team: state.team, level: state.level, data: state.data, model: state.model });
  state.plan = plan;
  state.team = plan.team?.id ?? null;
  fillTeamSelect(plan.team);
  if (state.model && (VIEW === 'mastery' || VIEW === 'menu')) queueMicrotask(() => readCapBoards().catch(fail));
  state.role = plan.role;
  fillRoleSelect(plan.roles, plan.role);
  $('#aeClass').value = plan.className;
  $('#aeLevel').value = plan.level;
  $('#aeLevel').max = plan.levelCap;
  // With a Daeva linked the "Planning for ..." line already names it, its class and level: say it once.
  $('#aeAscentFor').hidden = Boolean(plan.character);
  $('#aeAscentFor').textContent = `${plan.className} · ${plan.roleLabel}${plan.team ? ` · ${plan.team.label}` : ''} · Lv ${plan.level}`;
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
        <p class="ae-role-line" id="aeRoleLine">${esc(roleLine(plan))}</p>
        <p>${esc(plan.build.summary)}</p>
      </div>
      <ul class="ae-chips" aria-label="Build facts">
        ${plan.build.beginner ? `<li>${esc(BEGINNER[plan.build.beginner] ?? plan.build.beginner)}</li>` : ''}
        <li>Level cap ${esc(plan.levelCap)}</li>
      </ul>
    </section>${fallback}`;
  $('#aePlan').innerHTML = plan.pending
    ? `${header}<section class="ae-panel">${pendingNote(plan.pending)}<p><a class="btn" href="?class=${esc(plan.className.toLowerCase())}&level=${esc(plan.level)}">Show the ${esc(plan.className)} main role instead</a></p></section>`
    : `${header}${renderMenu(plan)}`;
  renderFlow(plan);
}

async function selectClass(className) {
  state.className = className;
  $('#aePlan').setAttribute('aria-busy', 'true');
  state.data = await loadAdvisor(className);
  // A new class starts on its own main role: the old class's role may be a side build here.
  state.role = null;
  state.team = null;
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
  $('#aeRole').addEventListener('change', event => { state.role = event.target.value; state.team = null; renderPlan(); saveRole(); });
  ensureTeamField();
  $('#aeTeam')?.addEventListener('change', event => { state.team = event.target.value; renderPlan(); saveRole(); });
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
    if (barSkill) { openInfo(barSkillCard(barSkill.dataset.barSkill, barSkill.dataset.barRole, barSkill.dataset.barKey.split(':')[1]), barSkill); return; }
    const keycap = event.target.closest('[data-bar-keycap]');
    if (keycap) { openInfo(keyPanel(keycap.dataset.barKeycap), keycap); return; }
    const alt = event.target.closest('[data-alt]');
    if (alt) { openInfo(altCard(state.plan, alt.dataset.alt), alt); return; }
    const worn = event.target.closest('[data-stigma-now]');
    if (worn) {
      const item = (state.plan.stigmas.equippedNow ?? []).find(entry => entry.name === worn.dataset.stigmaNow);
      if (!item) return;
      const status = item.verdict === 'keep' ? ['keep', 'In the build. Keep it.'] : item.verdict === 'swap' ? ['keep', 'A popular swap in this build.'] : ['need', 'Not in the build. Swap it out.'];
      openInfo(infoCardHtml({ icon: state.plan.skillIcons[item.name] ?? item.icon, title: item.name, level: Number.isFinite(item.level) ? item.level : null, sub: 'Stigma · equipped now', status, lines: [item.verdict === 'keep' ? null : equippedLine(item), item.why] }), worn);
      return;
    }
    const tab = event.target.closest('[data-board-tab]');
    if (tab) { showBoard(Number(tab.dataset.boardTab)).catch(fail); return; }
    const node = event.target.closest('[data-node],[data-route-node]');
    if (node) { planner.auto = false; selectNode(node.dataset.node ?? node.dataset.routeNode); }
  });
  $('#aePlan').addEventListener('keydown', event => {
    const skill = event.target.closest?.('[data-mastery]');
    if (skill && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectMastery(skill); return; }
    const tile = event.target.closest?.('[data-stigma],[data-alt],[data-stigma-now],[data-bar-skill],[data-bar-keycap]');
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
  // The role and team: the address first, else what the player saved with this Daeva.
  const picked = rolePick(state.ref);
  state.role = fromUrl.role ?? (Object.keys(ROLES).includes(picked.role) ? picked.role : null);
  state.team = fromUrl.team ?? (Object.keys(TEAMS).includes(picked.team) ? picked.team : null);
  const wantedBoard = Number(new URLSearchParams(location.search).get('board'));
  if (Number.isInteger(wantedBoard) && wantedBoard > 0) planner.boardId = wantedBoard;
  const wantedNode = Number(new URLSearchParams(location.search).get('node'));
  if (Number.isInteger(wantedNode) && wantedNode > 0) planner.selected = wantedNode;
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
  // Never before first paint: the Daevanion screen reads every open board in parallel (points over all of them), the
  // menu reads its move's current board; then the plan draws again. data-ae-boards="read" says the reads are done.
  const mode = VIEW === 'daevanion' ? 'all' : VIEW === 'menu' ? 'current' : 'none';
  if (state.model && mode !== 'none') {
    readRouteBoards(mode).catch(() => {}).then(() => {
      if (planner.auto) planner.selected = null;
      if (state.model) renderPlan();
      document.documentElement.dataset.aeBoards = 'read';
      // The menu drew again with its move's board read: the first-visit guide comes back on the new page.
      if (VIEW === 'menu') firstVisitGuide();
    });
  } else document.documentElement.dataset.aeBoards = 'read';
  firstVisitGuide();
}

function fail(error) {
  showNotice('The Ascent Plan could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
}

start().catch(fail);
