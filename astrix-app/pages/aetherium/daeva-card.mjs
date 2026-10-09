/**
 * Daeva Card (The Aetherium): find a character, see the summary, keep up to 8 Daevas per server on this device.
 */
import {
  ArmoryUnavailable,
  armoryLive,
  ascentUrl,
  daevanionPageUrl,
  demoReasonOf,
  explain,
  factionOf,
  gearUrl,
  lastRegion,
  loadCharacter,
  loadServers,
  refFromUrl,
  regionName,
  regionOf,
  regionShort,
  regions,
  rememberRegion,
  roster,
  searchCharacters
} from './aetherium-data.mjs';
import { $, esc, markCharacterShown, markReady, number, setFaction, showNotice, showSource, wireDrawer, isPending } from './aetherium-ui.mjs';

const state = { model: null, source: null, ref: null, busy: false };

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
  const { model, source } = state;
  const el = $('#aeSummary');
  if (!model) { el.hidden = true; return; }
  const p = model.profile;
  const boardsOpen = model.daevanion.filter(board => board.open).length;
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const stigmaLevel = Math.min(...stigmas.map(skill => skill.needLevel));
  // At or past the unlock level the site can still report none acquired (stigmas also need a quest).
  const stigmaNote = p.level >= stigmaLevel ? 'None unlocked yet' : `Unlock at Lv ${stigmaLevel}`;
  const stigmasOpen = stigmas.filter(skill => skill.acquired).length;
  const eyebrow = [source.kind === 'demo' ? 'Example' : 'Your Daeva', p.title ? `Title: ${p.title}` : null].filter(Boolean).join(' · ');
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
      </div>
    </article>
    <aside class="ae-panel ae-plan-card" aria-labelledby="aePlanTitle">
      <p class="ae-eyebrow">Ascent Plan</p>
      <h2 class="ae-plan-title" id="aePlanTitle">What to do next</h2>
      <p>The Ascent Plan for ${esc(p.name)}: what to fix now, which skills and Specialty perks to take, stigmas, Daevanion order and a macro, for ${esc(p.class)} at Lv ${esc(p.level)}.</p>
      <a class="btn ae-primary" id="aeAscentLink" href="${esc(ascentUrl(state.ref, p.class))}">Open Ascent Plan</a>
      <a class="btn" id="aeGearLink" href="${esc(gearUrl(state.ref))}">View full setup</a>
    </aside>`;
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
    return `<li class="ae-roster-slot is-filled${active ? ' is-active' : ''}" data-faction="${factionOf(entry.raceName, entry.raceId)}">
      <button type="button" class="ae-roster-open" data-roster-open="${esc(key)}"${active ? ' aria-current="true"' : ''}>
        <span class="ae-roster-state">${active ? 'Active' : ''}</span>
        <strong title="${esc(entry.name)}">${esc(entry.name)}</strong>
        <span class="ae-roster-line">${esc(entry.className)} · Lv ${esc(entry.level)}</span>
        <span class="ae-roster-line ae-muted">${esc(entry.serverName)} · ${esc(regionShort(entry.region))}${entry.demo ? ' · example' : ''}</span>
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

function show(model, source, ref) {
  Object.assign(state, { model, source, ref });
  setFaction(model.profile.raceName, model.profile.raceId);
  showSource(source);
  renderSummary();
  renderRoster();
  markCharacterShown();
}

async function fallbackToDemo(message, demoReason = 'unavailable') {
  showNotice(message, 'warn');
  const { model, source } = await loadCharacter(null, { demoReason });
  show(model, source, null);
}

async function importCharacter(ref) {
  setBusy(true);
  try {
    const { model, source } = await loadCharacter(ref);
    if (!roster.add(model, source)) showNotice(`${model.profile.server.name} already has ${roster.slots} Daevas saved. Remove one to add ${model.profile.name}.`, 'warn');
    else showNotice('');
    const shown = source.kind === 'live' ? ref : null;
    show(model, source, shown);
    history.replaceState(null, '', shown ? `?${new URLSearchParams({ serverId: shown.serverId, characterId: shown.characterId, region: regionOf(shown.region) })}` : location.pathname);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    await failedRead(error);
  } finally {
    setBusy(false);
  }
}

/** A read that failed. Only a real "the site did not answer" shows the example; a refusal or a rate limit says what happened and leaves the page as it is (unless there is nothing to show yet). */
async function failedRead(error, nothingShown = false) {
  const message = explain(error, 'The official AION 2 site is not answering right now, so this shows an example Daeva. Try again in a minute.');
  if (error.reason === 'rate' || error.reason === 'other') {
    if (nothingShown) await fallbackToDemo(message, demoReasonOf(error));
    else showNotice(message, 'warn');
    return;
  }
  await fallbackToDemo(message);
}

function setBusy(busy) {
  state.busy = busy;
  const button = $('#aeFind');
  button.disabled = busy;
  button.textContent = busy ? 'Reading your character' : 'Find character';
}

async function onSearch(event) {
  event.preventDefault();
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
    await failedRead(error);
    return;
  }
  setBusy(false);
  const serverId = Number($('#aeServer').value) || null;
  const rows = serverId ? found.rows.filter(row => row.serverId === serverId) : found.rows;
  if (!rows.length) {
    renderResults([]);
    showNotice(armoryLive()
      ? `No Daeva named ${name} on ${serverId ? 'that server' : regionName(currentRegion)}. Check the spelling.`
      : 'Live search is not connected yet, so only the example Daeva can be opened.', 'warn');
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
  $('#aeRegion').addEventListener('change', onRegionChange);
  $('#aeRosterSwitch').addEventListener('change', () => {
    const entry = roster.switchTo($('#aeRosterSwitch').value);
    if (!entry) return;
    renderRoster();
    importCharacter({ serverId: entry.serverId, characterId: entry.characterId, region: entry.region });
  });
  // The server list loads beside the character, never in front of it.
  loadRegionServers();
  try {
    const { model, source } = await loadCharacter(ref);
    show(model, source, source.kind === 'live' ? ref : null);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    await failedRead(error, true);
  }
  markReady();
}

start().catch(error => {
  showNotice('The Daeva Card could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
});
