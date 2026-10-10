/**
 * Daeva Card (The Aetherium): find a character, see the summary, keep up to 8 Daevas per server on this device.
 * With no Daeva the page opens on the intro: official class art, the NPC guide with three steps, the search and
 * the eight class tiles (a plan by hand for each). A failed read says why and offers Try again; nothing stands
 * in for a character, and no page ever shows an example Daeva.
 */
import {
  ArmoryUnavailable,
  ascentUrl,
  daevanionPageUrl,
  explain,
  factionOf,
  gearPageUrl,
  gearUrl,
  lastRegion,
  loadAdvisor,
  loadCharacter,
  loadIntroArt,
  loadServers,
  prefetchAdvisor,
  refFromUrl,
  regionName,
  regionOf,
  regionShort,
  regions,
  rememberRegion,
  roster,
  searchCharacters
} from './aetherium-data.mjs';
import { $, esc, introArtImg, markCharacterShown, markReady, number, setFaction, showNotice, showSource, wireDrawer, isPending } from './aetherium-ui.mjs';
import { guideSeen, markGuideSeen, mountGuide } from './aetherium-guide.mjs';
import { renderNext, renderStepBar } from './aetherium-flow.mjs';
import { classArt } from './daevanion-board.mjs';
import { AION2_CLASSES, buildAscentPlan } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';

const state = { model: null, source: null, ref: null, busy: false, retry: null };

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
        <ul class="ae-chips" aria-label="Character">
          <li>${esc(p.class)}</li><li class="ae-chip-faction">${esc(p.raceName)}</li><li>${esc(p.server.name)}</li><li>${esc(regionName(model.source.region))}</li><li>Lv ${esc(p.level)}</li>
        </ul>
        <dl class="ae-tiles">
          <div class="ae-tile"><dt>Combat power</dt><dd>${number(p.combatPower)}</dd></div>
          <div class="ae-tile"><dt>Item level</dt><dd>${isPending(p.itemLevel) ? '-' : number(p.itemLevel)}</dd></div>
          <div class="ae-tile is-link"><dt><a href="${esc(daevanionPageUrl(state.ref, p.class, model.daevanion.find(board => board.open)?.id ?? null))}">Daevanion boards open</a></dt><dd>${boardsOpen} <span>/ ${model.daevanion.length}</span></dd></div>
          <div class="ae-tile"><dt>Stigmas</dt><dd>${stigmasOpen ? `${stigmasOpen} <span>/ ${stigmas.length}</span>` : `<small>${stigmaNote}</small>`}</dd></div>
        </dl>
        <p class="ae-official ae-card-official"><a class="ae-official-link" href="${esc(OFFICIAL_CHARACTERS)}" target="_blank" rel="noopener noreferrer" data-official-link="character">View on the official AION 2 site</a></p>
      </div>
    </article>
    <aside class="ae-panel ae-plan-card" aria-labelledby="aePlanTitle">
      <p class="ae-eyebrow">Ascent Plan</p>
      <h2 class="ae-plan-title" id="aePlanTitle">What to do next</h2>
      <p>The Ascent Plan for ${esc(p.name)}: what to fix now, which skills and Specialty perks to take, stigmas, Daevanion order and a macro, for ${esc(p.class)} at Lv ${esc(p.level)}.</p>
      <a class="btn ae-primary" id="aeAscentLink" href="${esc(ascentUrl(state.ref, p.class))}">Open Ascent Plan</a>
      <a class="btn" id="aeGearLink" href="${esc(gearUrl(state.ref))}">View full setup</a>
    </aside>
    <section class="ae-panel ae-first-move" id="aeFirstMove" aria-labelledby="aeFirstMoveTitle" aria-live="polite">
      <p class="ae-eyebrow" id="aeFirstMoveTitle">Your first move</p>
      <p class="ae-first-move-text" id="aeFirstMoveText">Working out your first move.</p>
      <a class="btn" id="aeFirstMoveGo" href="${esc(ascentUrl(state.ref, p.class))}" data-first-move hidden>Show me</a>
    </section>
    <aside class="ae-guide" id="aeGuide" aria-label="Guide" aria-live="polite" hidden></aside>`;
  loadFirstMove().catch(() => {});
}

/* The first move: the Ascent Plan's top move for this Daeva, in one line, with a Show me that opens it. The plan data
   (small static files) loads once the card is on screen, so the card never waits for it. The move comes from the advisor only. */
function moveHref(move, p) {
  if (!move) return ascentUrl(state.ref, p.class);
  if (move.view === 'gear') return gearPageUrl(state.ref);
  return ascentUrl(state.ref, p.class, { screen: move.view, board: move.view === 'daevanion' ? move.board ?? null : null });
}
async function loadFirstMove() {
  const { model, ref } = state;
  const p = model.profile;
  const text = $('#aeFirstMoveText');
  const go = $('#aeFirstMoveGo');
  const strip = $('#aeFirstMove');
  if (!text || !go) return;
  let plan = null;
  if (AION2_CLASSES.includes(p.class)) {
    try { plan = buildAscentPlan({ className: p.class, role: null, level: p.level, data: await loadAdvisor(p.class), model }); } catch { plan = null; }
  }
  if (state.model !== model || state.ref !== ref) return; // another Daeva took the card meanwhile
  const move = plan?.now?.[0] ?? null;
  text.textContent = move ? move.title : plan ? 'Nothing to fix right now. Your plan has what comes next.' : 'Your plan could not load here. Open the Ascent Plan to see it.';
  go.href = moveHref(move, p);
  go.textContent = move ? 'Show me' : 'Open Ascent Plan';
  if (move) { go.dataset.moveView = move.view; if (move.board) go.dataset.moveBoard = move.board; }
  go.hidden = false;
  strip.classList.add('is-ready');
  strip.dataset.move = move ? String(move.step) : 'none';
}

/* The flow on this page: step 1. With a Daeva on the card, steps 2 and 3 open, the Next goes to the Ascent Plan and
   "How this works" reopens the first-visit guide. Without one, the only way on is the search. */
function renderFlow() {
  const p = state.model?.profile ?? null;
  renderStepBar({ current: 'find', ref: p ? state.ref : null, className: p?.class ?? null, help: p ? showCardGuide : null });
  if (p) renderNext({ label: 'Next: Your next moves', href: ascentUrl(state.ref, p.class), note: 'Step 3 of 3: the Ascent Plan for this Daeva' });
  else renderNext({ label: 'Find your Daeva', href: '#aeSearch', note: 'Step 1 of 3: type your character name above' });
}

/* The first-visit guide: three steps, once per device, after the page is usable. Each step says what the thing on screen means for the game. */
const CARD_GUIDE = () => [
  { text: 'This is your Daeva. Check it is the character you play: the class, the level and the server.', target: '#aeSummary .ae-summary-card' },
  { text: 'This is your first move: the one thing to do next time you are in the game. Show me opens it on a screen laid out like the game.', target: '#aeFirstMove' },
  { text: 'Your full plan is here: the skills to level, the stigmas to slot, your Daevanion boards and a macro, in order.', target: '#aeAscentLink' }
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
  const cards = current.entries.map(entry => {
    const key = roster.key(entry);
    const active = key === current.active;
    const icon = classArt(entry.className);
    return `<li class="ae-roster-slot is-filled${active ? ' is-active' : ''}" data-faction="${factionOf(entry.raceName, entry.raceId)}">
      <button type="button" class="ae-roster-open" data-roster-open="${esc(key)}"${active ? ' aria-current="true"' : ''}>
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

/** The server switcher lists only servers that have saved Daevas, and hides when there is one. */
function renderSwitcher(current) {
  const box = $('#aeRosterSwitchBox');
  box.hidden = current.servers.length < 2;
  $('#aeRosterSwitch').innerHTML = current.servers
    .map(item => `<option value="${esc(item.id)}">${esc(item.serverName)} · ${esc(regionShort(item.region))}</option>`).join('');
  $('#aeRosterSwitch').value = current.rosterId ?? '';
}

function renderResults(rows) {
  const el = $('#aeResults');
  if (!rows.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<p class="ae-eyebrow">${rows.length} matches. Pick your Daeva</p><ul>${rows.map((row, index) => `
    <li><button type="button" class="ae-result" data-result="${index}">
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

function show(model, source, ref) {
  clearTimeout(readingTimer);
  Object.assign(state, { model, source, ref });
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

async function importCharacter(ref) {
  setBusy(true);
  try {
    const { model, source } = await loadCharacter(ref);
    if (!roster.add(model, source)) showNotice(`${model.profile.server.name} already has ${roster.slots} Daevas saved. Remove one to add ${model.profile.name}.`, 'warn');
    else showNotice('');
    show(model, source, ref);
    history.replaceState(null, '', `?${new URLSearchParams({ serverId: ref.serverId, characterId: ref.characterId, region: regionOf(ref.region) })}`);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    failedRead(error, () => importCharacter(ref));
  } finally {
    setBusy(false);
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

async function loadRegionServers() {
  const region = currentRegion;
  const select = $('#aeServer');
  select.disabled = true;
  select.innerHTML = `<option value="">Loading servers</option>`;
  const servers = await loadServers(region);
  if (region === currentRegion) renderServers(servers);
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
  try {
    const { model, source } = await loadCharacter(ref);
    show(model, source, ref);
  } catch (error) {
    showLoading(false);
    if (!(error instanceof ArmoryUnavailable)) throw error;
    failedRead(error, () => importCharacter(ref));
  }
  markReady();
}

start().catch(error => {
  showNotice('The Daeva Card could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
});
