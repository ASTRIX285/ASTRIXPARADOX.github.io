/**
 * Daeva Card (The Aetherium): find a character, see the summary, keep up to 8 Daevas per server on this device.
 * With no Daeva the page opens on the intro: official class art, the NPC guide with three steps, the search and
 * the eight class tiles (a plan by hand for each). A failed read says why and offers Try again; nothing stands
 * in for a character, and no page ever shows an example Daeva.
 */
import {
  ArmoryUnavailable,
  ascentUrl,
  compareUrl,
  daevanionPageUrl,
  explain,
  factionOf,
  gearPageUrl,
  lastRegion,
  loadAdvisor,
  loadBoard,
  loadCharacter,
  loadIntroArt,
  loadServers,
  savedServers,
  prefetchAdvisor,
  refFromUrl,
  regionName,
  regionOf,
  regionShort,
  regions,
  rememberRegion,
  rolePick,
  roster,
  searchCharacters,
  titlesUrl
} from './aetherium-data.mjs';
import { $, esc, introArtImg, markCharacterShown, markReady, number, setFaction, showNotice, showSource, wireDrawer, isPending } from './aetherium-ui.mjs';
import { guideSeen, markGuideSeen, mountGuide } from './aetherium-guide.mjs';
import { nextStep, renderNext, renderStepBar } from './aetherium-flow.mjs';
import { classArt } from './daevanion-board.mjs';
import { AION2_CLASSES, ROLES, TEAMS, buildAscentPlan, rolesFor } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { daevanionPercent } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';

const state = { model: null, source: null, ref: null, busy: false, retry: null, before: null, data: null };

/* The official AION 2 character pages (NCSOFT). The address of one character's own page is not confirmed yet (it needs a look at the
   official site), so the card links to the characters index. Official NCSOFT pages are the one outbound link the Aetherium allows. */
const OFFICIAL_CHARACTERS = 'https://aion2.plaync.com/en-us/characters/index';

/* The region being searched. It starts from the link, else the region last used on this device, else Europe. */
let currentRegion = 'eu';

function renderRegions() {
  $('#aeRegion').innerHTML = regions.map(item => `<option value="${esc(item.code)}">${esc(item.name)}</option>`).join('');
  $('#aeRegion').value = currentRegion;
}

function renderServers(servers) {
  const select = $('#aeServer');
  const group = (raceId, label) => `<optgroup label="${label}">${servers
    .filter(server => server.raceId === raceId)
    .map(server => `<option value="${server.serverId}">${esc(server.serverName)}</option>`).join('')}</optgroup>`;
  const listed = raceId => servers.some(server => server.raceId === raceId);
  select.disabled = false;
  // A failed or empty list shows no empty Elyos and Asmodian headings: only "Any server" and a muted line.
  select.innerHTML = `<option value="">Any server in ${esc(regionName(currentRegion))}</option>${listed(1) ? group(1, 'Elyos') : ''}${listed(2) ? group(2, 'Asmodian') : ''}`;
  $('#aeServerNote').hidden = servers.some(server => server.raceId === 1 || server.raceId === 2);
}

function renderSummary() {
  const { model } = state;
  const el = $('#aeSummary');
  if (!model) { el.hidden = true; return; }
  const p = model.profile;
  const boardsOpen = model.daevanion.filter(board => board.open).length;
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const stigmaLevel = Math.min(...stigmas.map(skill => skill.needLevel));
  // At or past the unlock level the site can still report none acquired (stigmas also need a quest).
  const stigmaNote = p.level >= stigmaLevel ? 'None unlocked yet' : `Unlock at Lv ${stigmaLevel}`;
  const stigmasOpen = stigmas.filter(skill => skill.acquired).length;
  const eyebrow = ['Your Daeva', p.title ? `Title: ${p.title}` : null].filter(Boolean).join(' · ');
  el.hidden = false;
  el.innerHTML = `
    <article class="ae-panel ae-summary-card" aria-labelledby="aeName">
      <div class="ae-portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="${esc(p.name)} portrait" width="200" height="240" decoding="async" referrerpolicy="no-referrer">` : '<span>No portrait</span>'}</div>
      <div class="ae-summary-body">
        <p class="ae-eyebrow">${esc(eyebrow)}</p>
        <h2 class="ae-name" id="aeName">${esc(p.name)}</h2>
        ${p.legion ? `<p class="ae-legion" id="aeLegion"><span>Legion</span> ${esc(p.legion)}</p>` : ''}
        <ul class="ae-chips" aria-label="Character">
          <li>${esc(p.class)}</li><li class="ae-chip-faction">${esc(p.raceName)}</li><li>${esc(p.server.name)}</li><li>${esc(regionName(model.source.region))}</li><li>Lv ${esc(p.level)}</li>
        </ul>
        <div class="ae-role-pick" id="aeRolePick" hidden></div>
        <dl class="ae-tiles">
          <div class="ae-tile"><dt>Combat power</dt><dd>${number(p.combatPower)}</dd></div>
          <div class="ae-tile"><dt>Item level</dt><dd>${isPending(p.itemLevel) ? '-' : number(p.itemLevel)}</dd></div>
          <div class="ae-tile is-link"><dt><a href="${esc(daevanionPageUrl(state.ref, p.class, model.daevanion.find(board => board.open)?.id ?? null))}">Daevanion boards open</a></dt><dd>${boardsOpen} <span>/ ${model.daevanion.length}</span></dd></div>
          <div class="ae-tile"><dt>Stigmas</dt><dd>${stigmasOpen ? `${stigmasOpen} <span>/ ${stigmas.length}</span>` : `<small>${stigmaNote}</small>`}</dd></div>
        </dl>
        ${factsRow(model)}
        <p class="ae-official ae-card-official"><a class="ae-official-link" href="${esc(OFFICIAL_CHARACTERS)}" target="_blank" rel="noopener noreferrer" data-official-link="character">View on the official AION 2 site</a></p>
      </div>
    </article>
    <aside class="ae-panel ae-plan-card" aria-labelledby="aePlanTitle">
      <p class="ae-eyebrow">Ascent Plan</p>
      <h2 class="ae-plan-title" id="aePlanTitle">What to do next</h2>
      <p>The Ascent Plan for ${esc(p.name)}: what to fix now, which skills and Specialty perks to take, stigmas, Daevanion order and a macro, for ${esc(p.class)} at Lv ${esc(p.level)}.</p>
      ${sinceLine(p)}
      <a class="btn" id="aeAscentLink" href="${esc(ascentUrl(state.ref, p.class))}">Open Ascent Plan</a>
    </aside>
    <section class="ae-panel ae-first-move" id="aeFirstMove" aria-labelledby="aeFirstMoveTitle" aria-live="polite">
      <p class="ae-eyebrow" id="aeFirstMoveTitle">Your first move</p>
      <div class="ae-first-move-body"><p class="ae-first-move-text" id="aeFirstMoveText">Working out your first move.</p><p class="ae-first-move-detail" id="aeFirstMoveDetail" hidden></p></div>
      <a class="btn" id="aeFirstMoveGo" href="${esc(ascentUrl(state.ref, p.class))}" data-first-move hidden>Show me</a>
      <div class="ae-card-setup" id="aeCardSetup" hidden></div>
    </section>
    <aside class="ae-guide" id="aeGuide" aria-label="Guide" aria-live="polite" hidden></aside>`;
  loadFirstMove().catch(() => {});
}

/* The slim row under the stat tiles: title effects set and Daevanion progress over every board, each only when the
   data has it, each a link to its page. The official data sends no ranking for any Daeva captured so far, so there is none. */
function factsRow(model) {
  const titles = isPending(model.titles) ? null : model.titles;
  const percent = daevanionPercent(model.daevanion);
  const facts = [];
  // Titles as the effects set of the three categories: the data's overall owned count does not match the game's yet.
  if (titles && titles.categories.length) {
    facts.push(`<li data-fact="titles"><a href="${esc(titlesUrl(state.ref))}">Title effects <b>${titles.categories.filter(category => category.worn).length}</b> <span>of ${titles.categories.length} set</span></a></li>`);
  }
  if (percent !== null) {
    facts.push(`<li data-fact="daevanion"><a href="${esc(daevanionPageUrl(state.ref, model.profile.class, model.daevanion.find(board => board.open)?.id ?? null))}">Daevanion <b>${percent}%</b> <span>overall</span></a></li>`);
  }
  return facts.length ? `<ul class="ae-facts" id="aeFacts" aria-label="Progress">${facts.join('')}</ul>` : '';
}

/* Since your last visit: only when this device already held this Daeva at a lower level (the roster keeps the level it last saw). */
function sinceLine(p) {
  const before = state.before;
  if (!Number.isFinite(before) || !Number.isFinite(p.level) || before >= p.level) return '';
  return `<p class="ae-since" id="aeSince">Since your last visit: Lv ${esc(before)} to Lv ${esc(p.level)}.</p>`;
}
/** The level this device last saved for a Daeva, read before a live read refreshes it. */
function savedLevel(ref) {
  const entry = ref ? roster.read().entries.find(item => String(item.serverId) === String(ref.serverId) && item.characterId === ref.characterId) : null;
  return Number.isFinite(entry?.level) ? entry.level : null;
}

/* The first move: the Ascent Plan's top move for this Daeva, in one line, with a Show me that opens it. The plan data
   (small static files) loads once the card is on screen, so the card never waits for it. The move comes from the advisor only. */
function moveHref(move, p) {
  if (!move) return ascentUrl(state.ref, p.class, rolePick(state.ref));
  // A gear move opens the Gear page with only the items it names ringed (#enchant-1:card); :card sends its back link here.
  if (move.view === 'gear') return `${gearPageUrl(state.ref)}${move.ring ? `#${move.ring}:card` : ''}`;
  const pick = rolePick(state.ref);
  return ascentUrl(state.ref, p.class, { screen: move.view, board: move.view === 'daevanion' ? move.board ?? null : null, role: pick.role, team: pick.team });
}
/* Role and team (17 Oct 2026): the player picks the role they play for each saved Daeva, and the team when the build has
   team variants. Saved with the Daeva in the roster and carried in the Ascent Plan links; every screen follows it. */
function renderRolePick(plan) {
  const box = $('#aeRolePick');
  if (!box) return;
  if (!plan) { box.hidden = true; return; }
  box.hidden = false;
  const roles = rolesFor(state.data?.builds).filter(item => item.status !== 'pending');
  box.innerHTML = `<p class="ae-role-line"><span id="aeRoleLine">${esc([plan.className, plan.build.label, plan.team?.label].filter(Boolean).join(' · '))}</span>
      <button type="button" class="ae-linkish" id="aeRoleChange" aria-expanded="false" aria-controls="aeRoleForm">Change</button></p>
    <form class="ae-role-form" id="aeRoleForm" hidden>
      <label class="ae-field"><span>Role</span><select class="ae-btn" id="aeCardRole">${roles.map(item => `<option value="${esc(item.role)}"${item.role === plan.role ? ' selected' : ''}>${esc(item.label)}: ${esc(item.buildLabel)}</option>`).join('')}</select></label>
      <label class="ae-field" id="aeCardTeamField"${plan.team ? '' : ' hidden'}><span>Team</span><select class="ae-btn" id="aeCardTeam">${(plan.team?.options ?? []).map(option => `<option value="${esc(option.id)}"${option.id === plan.team.id ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>
      <button type="submit" class="btn">Save</button>
    </form>`;
}
function wireRolePick() {
  const box = $('#aeRolePick');
  if (!box || box.dataset.wired) return;
  box.dataset.wired = 'true';
  box.addEventListener('click', event => {
    if (!event.target.closest('#aeRoleChange')) return;
    const form = $('#aeRoleForm');
    form.hidden = !form.hidden;
    $('#aeRoleChange').setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) $('#aeCardRole')?.focus();
  });
  box.addEventListener('change', event => {
    // A new role shows its own teams (only builds with team variants have any).
    if (event.target.id !== 'aeCardRole') return;
    const plan = planFor(event.target.value, null);
    const field = $('#aeCardTeamField');
    field.hidden = !plan?.team;
    $('#aeCardTeam').innerHTML = (plan?.team?.options ?? []).map(option => `<option value="${esc(option.id)}"${option.id === plan.team.id ? ' selected' : ''}>${esc(option.label)}</option>`).join('');
  });
  box.addEventListener('submit', event => {
    event.preventDefault();
    const role = $('#aeCardRole').value;
    const team = $('#aeCardTeamField').hidden ? null : $('#aeCardTeam').value;
    const pick = { role: Object.keys(ROLES).includes(role) ? role : null, team: Object.keys(TEAMS).includes(team) ? team : null };
    // A saved Daeva keeps them in the roster; one not saved keeps them in this page's address.
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(pick)) { if (value) params.set(key, value); else params.delete(key); }
    history.replaceState(null, '', `${location.pathname}?${params}`);
    roster.setRole(state.ref, pick);
    loadFirstMove().catch(() => {});
  });
}
const planFor = (role, team) => {
  const p = state.model.profile;
  try { return buildAscentPlan({ className: p.class, role, team, level: p.level, data: state.data, model: state.model }); } catch { return null; }
};
/** Reads the role route's current Daevanion board, once (kept for the session), so the move can name its next node. */
async function readCurrentBoard(plan, pick) {
  const at = plan.daevanion.roleRoute?.current;
  const board = at && !at.read ? state.model.daevanion.find(item => item.id === at.id) : null;
  if (!board) return plan;
  try { board.nodes = (await loadBoard(state.model, board)).nodes; } catch { return plan; }
  return planFor(pick.role, pick.team) ?? plan;
}

async function loadFirstMove() {
  const { model, ref } = state;
  const p = model.profile;
  const text = $('#aeFirstMoveText');
  const go = $('#aeFirstMoveGo');
  const strip = $('#aeFirstMove');
  if (!text || !go) return;
  let plan = null;
  const pick = rolePick(ref);
  if (AION2_CLASSES.includes(p.class)) {
    try {
      state.data = await loadAdvisor(p.class);
      plan = planFor(pick.role, pick.team);
      // The move follows the chosen role; a Daevanion move names its board's next node once that board is read.
      if (plan?.now?.[0]?.view === 'daevanion') plan = await readCurrentBoard(plan, pick);
    } catch { plan = null; }
  }
  if (state.model !== model || state.ref !== ref) return; // another Daeva took the card meanwhile
  renderRolePick(plan);
  wireRolePick();
  // The links carry the role and team only when the player saved them, so a shared link opens the same plan.
  const links = { role: pick.role, team: pick.team };
  if ($('#aeAscentLink')) $('#aeAscentLink').href = ascentUrl(state.ref, p.class, links);
  const move = plan?.now?.[0] ?? null;
  text.textContent = move ? move.title : plan ? 'Nothing to fix right now. Your plan has what comes next.' : 'Your plan could not load here. Open the Ascent Plan to see it.';
  // The move's own line says what it means ("Open Zikel to see your next node for your role"), so a short title never stands alone.
  const detail = $('#aeFirstMoveDetail');
  if (detail) { detail.textContent = move?.detail ?? ''; detail.hidden = !move?.detail; }
  go.href = moveHref(move, p);
  go.textContent = move ? 'Show me' : 'Open Ascent Plan';
  if (move) { go.dataset.moveView = move.view; if (move.board) go.dataset.moveBoard = move.board; }
  go.hidden = false;
  renderCardSetup(plan);
  strip.classList.add('is-ready');
  strip.dataset.move = move ? String(move.step) : 'none';
}

/* The setup for now and the next change, from the level planner: the main line, the stigmas, the next skill to level and
   one "Next at Lv N" line with its reason. */
function renderCardSetup(plan) {
  const box = $('#aeCardSetup');
  if (!box) return;
  const s = plan?.setup;
  if (!s) { box.hidden = true; return; }
  const line = s.line.find(item => item.name) ?? s.line[0] ?? null;
  const stigmas = s.stigmas.filter(slot => slot.open && slot.name).map(slot => slot.name);
  const next = plan.nextAt;
  box.hidden = false;
  box.innerHTML = `<p class="ae-setup-title">Your setup at Lv ${esc(s.level)}</p>
    <dl class="ae-setup-list">
      <div data-setup="line"><dt>${esc(line?.name ?? 'Macro')}</dt><dd>${esc(line ? line.skills.join(', ') : '-')}</dd></div>
      <div data-setup="stigmas"><dt>Stigmas</dt><dd>${esc(stigmas.length ? stigmas.join(', ') : (s.stigmas[0] ? `From Lv ${s.stigmas[0].slotLevel}` : 'None'))}</dd></div>
      <div data-setup="mastery"><dt>Level next</dt><dd>${esc(s.mastery ? `${s.mastery.name} to Lv ${s.mastery.to}` : 'Nothing to level now')}</dd></div>
    </dl>
    <p class="ae-next-at" id="aeNextAt"${next ? ` data-next-level="${esc(next.level)}"` : ''}><b>${next ? `Next at Lv ${esc(next.level)}` : 'Next'}</b> ${esc(next ? `${next.text}${next.why ? ` ${next.why}` : ''}` : `Nothing changes in your setup before Lv ${plan.levelCap}.`)}</p>`;
}

/* The flow on this page: step 1. With a Daeva on the card, steps 2 and 3 open, the Next goes to step 2 (See your setup)
   as the one gold action, and "How this works" reopens the first-visit guide. Without one, the search is the gold action
   and the Next only points at it. */
function renderFlow() {
  const p = state.model?.profile ?? null;
  renderStepBar({ current: 'find', ref: p ? state.ref : null, className: p?.class ?? null, help: p ? showCardGuide : null });
  // One gold action: the search with no Daeva, the Next with one.
  $('#aeFind')?.classList.toggle('ae-primary', !p);
  if (p) {
    const next = nextStep('find', state.ref, p.class);
    renderNext({ label: next.label, href: next.href, note: 'Step 2 of 3: your gear, skills and Daevanion boards' });
  } else renderNext({ label: 'Find your Daeva', href: '#aeSearch', note: 'Step 1 of 3: type your character name above', primary: false });
}

/* The first-visit guide: three steps, once per device, after the page is usable. Each step says what the thing on screen means for the game. */
const CARD_GUIDE = () => [
  { text: 'This is your Daeva. Check it is the character you play: the class, the level and the server.', target: '#aeSummary .ae-summary-card' },
  { text: 'This is your first move: the one thing to do next time you are in the game. Show me opens it on a screen laid out like the game.', target: '#aeFirstMove' },
  { text: 'Next, see your setup: your gear, skills and Daevanion boards. Then your next moves, in order.', target: '#aeNext' }
];
function showCardGuide() {
  mountGuide($('#aeGuide'), CARD_GUIDE(), { skip: true, scroll: true, onDone: () => markGuideSeen('card') });
}
function firstVisitGuide() {
  if (guideSeen('card')) return;
  setTimeout(showCardGuide, 0); // after the page has reported ready
}

/* While the official site answers: the card's shape, never an empty panel. After 3 seconds it says the read is still going. */
const SKELETON = `<article class="ae-panel ae-summary-card ae-skeleton is-skeleton" aria-busy="true" aria-labelledby="aeReading"><span class="ae-portrait ae-sk ae-sk-portrait" aria-hidden="true"></span><div class="ae-summary-body" aria-hidden="true"><span class="ae-sk ae-sk-eyebrow"></span><span class="ae-sk ae-sk-name"></span><span class="ae-sk-chips"><span class="ae-sk ae-sk-chip"></span><span class="ae-sk ae-sk-chip"></span><span class="ae-sk ae-sk-chip"></span><span class="ae-sk ae-sk-chip"></span><span class="ae-sk ae-sk-chip"></span></span><span class="ae-tiles ae-sk-tiles"><span class="ae-tile ae-sk-tile"><span class="ae-sk"></span><span class="ae-sk"></span></span><span class="ae-tile ae-sk-tile"><span class="ae-sk"></span><span class="ae-sk"></span></span><span class="ae-tile ae-sk-tile"><span class="ae-sk"></span><span class="ae-sk"></span></span><span class="ae-tile ae-sk-tile"><span class="ae-sk"></span><span class="ae-sk"></span></span></span></div><p class="ae-reading" id="aeReading" role="status">Reading your character</p><p class="ae-sr">Reading your character.</p></article>
<div class="ae-panel ae-plan-card ae-skeleton"><span class="ae-sk ae-sk-eyebrow" aria-hidden="true"></span><span class="ae-sk ae-sk-name" aria-hidden="true"></span><span class="ae-sk ae-sk-line" aria-hidden="true"></span><span class="ae-sk ae-sk-line is-short" aria-hidden="true"></span><span class="ae-sk ae-sk-btn" aria-hidden="true"></span><p class="ae-sr">Ascent Plan</p></div>`;
let readingTimer = null;
function showLoading(on) {
  clearTimeout(readingTimer);
  if (state.model) return; // a Daeva already on screen stays while another read runs
  const el = $('#aeSummary');
  if (!on) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = SKELETON;
  readingTimer = setTimeout(() => { const note = $('#aeReading'); if (note) note.textContent = 'Still reading from the official AION 2 site'; }, 3000);
}

function renderRoster() {
  const current = roster.read();
  // "<Server> · <short region> · <n> of 8", for the server whose roster is shown.
  const count = `${current.entries.length} of ${roster.slots}`;
  $('#aeRosterCount').textContent = current.rosterId ? `${current.serverName} · ${regionShort(current.region)} · ${count}` : count;
  renderSwitcher(current);
  renderCompareLink(current);
  const cards = current.entries.map(entry => {
    const key = roster.key(entry);
    const active = key === current.active;
    const icon = classArt(entry.className);
    return `<li class="ae-roster-slot is-filled${active ? ' is-active' : ''}" data-faction="${factionOf(entry.raceName, entry.raceId)}">
      <button type="button" class="ae-btn ae-roster-open" data-roster-open="${esc(key)}"${active ? ' aria-current="true"' : ''}>
        ${icon ? `<img class="ae-roster-class" src="${esc(icon)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="ae-roster-class" aria-hidden="true"></span>'}
        <span class="ae-roster-state">${active ? 'Active' : ''}</span>
        <strong title="${esc(entry.name)}">${esc(entry.name)}</strong>
        <span class="ae-roster-line">${esc(entry.className)} · Lv ${esc(entry.level)}</span>
        <span class="ae-roster-line ae-muted">${esc(entry.serverName)} · ${esc(regionShort(entry.region))}</span>
      </button>
      <button type="button" class="ae-roster-remove" data-roster-remove="${esc(key)}" aria-label="Remove ${esc(entry.name)} from your Daevas">Remove</button>
    </li>`;
  });
  for (let i = current.entries.length; i < roster.slots; i++) {
    cards.push('<li class="ae-roster-slot is-empty"><button type="button" class="ae-roster-add" data-roster-add>+ Add a Daeva</button></li>');
  }
  $('#aeRoster').innerHTML = cards.join('');
}

/** Compare: shown once two Daevas are saved on this device (any server or region). It opens on the active one and the next. */
function renderCompareLink(current) {
  const link = $('#aeCompareLink');
  if (!link) return;
  const all = roster.all();
  link.hidden = all.length < 2;
  if (all.length < 2) return;
  const first = all.find(entry => roster.key(entry) === current.active) ?? all[0];
  const second = all.find(entry => entry !== first);
  link.href = compareUrl(first, second);
}

/** The server switcher lists only servers that have saved Daevas, and hides when there is one. */
function renderSwitcher(current) {
  const box = $('#aeRosterSwitchBox');
  box.hidden = current.servers.length < 2;
  // Rebuilt only when the list of servers changes: a redraw while someone is picking would swap the options out from
  // under the pick (and close an open list), so the pick would land on options no longer on the page.
  const select = $('#aeRosterSwitch');
  const options = current.servers
    .map(item => `<option value="${esc(item.id)}">${esc(item.serverName)} · ${esc(regionShort(item.region))}</option>`).join('');
  if (select.dataset.options !== options) { select.innerHTML = options; select.dataset.options = options; }
  if (select.value !== (current.rosterId ?? '')) select.value = current.rosterId ?? '';
}

function renderResults(rows) {
  const el = $('#aeResults');
  if (!rows.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<p class="ae-eyebrow">${rows.length} matches. Pick your Daeva</p><ul>${rows.map((row, index) => `
    <li><button type="button" class="ae-btn ae-result" data-result="${index}">
      <strong>${esc(row.name)}</strong><span>Lv ${esc(row.level)} · ${esc(row.serverName)}</span>
    </button></li>`).join('')}</ul>`;
  el.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => {
    const row = rows[Number(button.dataset.result)];
    el.hidden = true;
    importCharacter({ serverId: row.serverId, characterId: row.characterId, region: currentRegion });
  }));
}

/* The intro: shown while no Daeva is on screen. Its words and the search are in the page already; the official
   art (class render, NPC guide, class tiles) is added once the art data is in, so it never holds up first paint. */
let introArtWanted = false;
function showIntro(on) {
  $('#aeIntro').hidden = !on;
  $('#aeClasses').hidden = !on;
  // The intro shows nobody: the page's loading skeleton (a portrait and stat tile shapes) leaves the page until a read starts.
  if (on) { $('#aeSummary').hidden = true; $('#aeSummary').innerHTML = ''; $('#aeSource').hidden = true; }
  if (on && !introArtWanted) { introArtWanted = true; loadIntroArt().then(renderIntroArt); }
}

function renderIntroArt(art) {
  const intro = $('#aeIntro');
  const hero = art.keyArt ?? [...art.classes.values()][0] ?? null;
  if (hero) {
    $('#aeIntroArt').innerHTML = introArtImg(hero, { width: 480, height: 600, lazy: false });
    $('#aeIntroArt').hidden = false;
    intro.classList.add('has-art');
  }
  if (art.npc) {
    $('#aeIntroNpc').innerHTML = introArtImg(art.npc, { width: 160, height: 200, lazy: false });
    $('#aeIntroNpc').hidden = false;
    intro.classList.add('has-npc');
  }
  // With any class art in, every tile shows its art frame (a pending class keeps an empty frame, never a stand-in), so the row stays one height.
  if (art.classes.size) $('#aeClasses .ae-class-row').classList.add('has-art');
  for (const tile of document.querySelectorAll('#aeClasses [data-class]')) {
    const entry = art.classes.get(tile.dataset.class);
    if (!entry) continue;
    tile.querySelector('.ae-class-art').innerHTML = introArtImg(entry, { width: 160, height: 160, className: 'ae-art ae-class-img' });
    tile.classList.add('has-art');
  }
}

function show(model, source, ref, before = null) {
  clearTimeout(readingTimer);
  Object.assign(state, { model, source, ref, before });
  showIntro(false);
  setFaction(model.profile.raceName, model.profile.raceId);
  showSource(source);
  renderSummary();
  renderRoster();
  renderFlow();
  markCharacterShown();
  firstVisitGuide();
}

/** A read that failed: say why, offer Try again. A Daeva already on screen stays; with none, the intro shows. */
function failedRead(error, retry) {
  state.retry = retry;
  showNotice(explain(error), 'warn', { retry: () => state.retry?.() });
  if (!state.model) showIntro(true);
}

/* Reads can overlap (the first load, a search, a roster pick). Only the newest one may show its Daeva: an older read
   that answers late is dropped, so it never puts a Daeva back over the one just picked. */
let readSeq = 0;
async function importCharacter(ref) {
  const seq = ++readSeq;
  setBusy(true);
  const before = savedLevel(ref);
  try {
    const { model, source } = await loadCharacter(ref);
    if (seq !== readSeq) return;
    if (!roster.add(model, source)) showNotice(`${model.profile.server.name} already has ${roster.slots} Daevas saved. Remove one to add ${model.profile.name}.`, 'warn');
    else showNotice('');
    show(model, source, ref, before);
    history.replaceState(null, '', `?${new URLSearchParams({ serverId: ref.serverId, characterId: ref.characterId, region: regionOf(ref.region) })}`);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    if (seq === readSeq) failedRead(error, () => importCharacter(ref));
  } finally {
    if (seq === readSeq) setBusy(false);
  }
}

function setBusy(busy) {
  state.busy = busy;
  const button = $('#aeFind');
  button.disabled = busy;
  button.textContent = busy ? 'Reading your character' : 'Find character';
  showLoading(busy);
}

async function onSearch(event) {
  event?.preventDefault?.();
  if (state.busy) return;
  const name = $('#aeNameInput').value.trim();
  if (!name) { showNotice('Type a character name first.', 'warn'); $('#aeNameInput').focus(); return; }
  setBusy(true);
  let found;
  try {
    found = await searchCharacters(name, currentRegion);
  } catch (error) {
    setBusy(false);
    if (!(error instanceof ArmoryUnavailable)) throw error;
    failedRead(error, () => onSearch());
    return;
  }
  setBusy(false);
  const serverId = Number($('#aeServer').value) || null;
  const rows = serverId ? found.rows.filter(row => row.serverId === serverId) : found.rows;
  if (!rows.length) {
    renderResults([]);
    showNotice(`No Daeva named ${name} on ${serverId ? 'that server' : regionName(currentRegion)}. Check the spelling.`, 'warn');
    return;
  }
  showNotice('');
  if (rows.length === 1) { renderResults([]); await importCharacter({ serverId: rows[0].serverId, characterId: rows[0].characterId, region: currentRegion }); }
  else renderResults(rows);
}

/**
 * The server picker for the current region: the saved list at once, then the live list from the official site
 * replaces it in the background (new servers appear without a site change). A server already picked stays picked.
 */
async function loadRegionServers() {
  const region = currentRegion;
  const select = $('#aeServer');
  const saved = await savedServers(region);
  if (region !== currentRegion) return;
  if (saved.length) renderServers(saved);
  else { select.disabled = true; select.innerHTML = `<option value="">Loading servers</option>`; }
  const { servers } = await loadServers(region);
  if (region !== currentRegion) return;
  const picked = select.value;
  renderServers(servers);
  if (picked && [...select.options].some(option => option.value === picked)) select.value = picked;
}

function onRegionChange() {
  currentRegion = regionOf($('#aeRegion').value);
  rememberRegion(currentRegion);
  renderResults([]);
  loadRegionServers();
}

function wireRoster() {
  $('#aeRoster').addEventListener('click', event => {
    const add = event.target.closest('[data-roster-add]');
    if (add) { $('#aeNameInput').focus(); $('#aeSearch').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const remove = event.target.closest('[data-roster-remove]');
    if (remove) { roster.remove(remove.dataset.rosterRemove); renderRoster(); return; }
    const open = event.target.closest('[data-roster-open]');
    if (open) {
      const entry = roster.read().entries.find(item => roster.key(item) === open.dataset.rosterOpen);
      if (!entry) return;
      roster.setActive(roster.key(entry));
      importCharacter({ serverId: entry.serverId, characterId: entry.characterId, region: entry.region });
    }
  });
}

async function start() {
  wireDrawer();
  setFaction(null);
  $('#aeSearch').addEventListener('submit', onSearch);
  wireRoster();
  const fromUrl = refFromUrl();
  const active = roster.active();
  const ref = fromUrl ?? (active ? { serverId: active.serverId, characterId: active.characterId, region: active.region } : null);
  currentRegion = ref ? regionOf(ref.region) : lastRegion();
  renderRegions();
  renderRoster();
  $('#aeRegion').addEventListener('change', onRegionChange);
  $('#aeRosterSwitch').addEventListener('change', () => {
    const entry = roster.switchTo($('#aeRosterSwitch').value);
    if (!entry) return;
    renderRoster();
    importCharacter({ serverId: entry.serverId, characterId: entry.characterId, region: entry.region });
  });
  // The server list loads beside the character, never in front of it.
  loadRegionServers();
  if (!ref) {
    // A new visitor: the intro, with no call to the official site.
    showIntro(true);
    renderFlow();
    markReady();
    return;
  }
  // The card's shape shows at once while the site answers; the plan data for the first move starts loading beside it.
  showLoading(true);
  const sameDaeva = active && String(active.serverId) === String(ref.serverId) && active.characterId === ref.characterId;
  prefetchAdvisor(sameDaeva ? active.className : null);
  const before = savedLevel(ref);
  const seq = ++readSeq;
  try {
    const { model, source } = await loadCharacter(ref);
    if (seq === readSeq) show(model, source, ref, before);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    if (seq === readSeq) { showLoading(false); failedRead(error, () => importCharacter(ref)); }
  }
  markReady();
}

start().catch(error => {
  showNotice('The Daeva Card could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
});
