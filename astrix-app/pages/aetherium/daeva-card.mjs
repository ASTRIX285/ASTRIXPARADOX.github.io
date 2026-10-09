/**
 * Daeva Card (The Aetherium): find a character, see the summary, keep up to 8 Daevas on this device.
 */
import {
  ArmoryUnavailable,
  armoryLive,
  ascentUrl,
  daevanionPageUrl,
  gearUrl,
  loadCatalogue,
  loadCharacter,
  refFromUrl,
  roster,
  searchCharacters
} from './aetherium-data.mjs';
import { $, esc, markCharacterShown, markReady, number, setFaction, showNotice, showSource, wireDrawer, isPending } from './aetherium-ui.mjs';

const state = { model: null, source: null, ref: null, busy: false };

function renderServers(servers) {
  const select = $('#aeServer');
  const group = (raceId, label) => `<optgroup label="${label}">${servers
    .filter(server => server.raceId === raceId)
    .map(server => `<option value="${server.serverId}">${esc(server.serverName)}</option>`).join('')}</optgroup>`;
  select.innerHTML = `<option value="">Any EU server</option>${group(1, 'Elyos')}${group(2, 'Asmodian')}`;
}

function renderSummary() {
  const { model, source } = state;
  const el = $('#aeSummary');
  if (!model) { el.hidden = true; return; }
  const p = model.profile;
  const boardsOpen = model.daevanion.filter(board => board.open).length;
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const stigmaLevel = Math.min(...stigmas.map(skill => skill.needLevel));
  // At or past the unlock level the armory can still report none acquired (stigmas also need a quest).
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
          <li>${esc(p.class)}</li><li class="ae-chip-faction">${esc(p.raceName)}</li><li>${esc(p.server.name)}</li><li>Lv ${esc(p.level)}</li>
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
  $('#aeRosterCount').textContent = `${current.entries.length} of ${roster.slots} slots`;
  const cards = current.entries.map(entry => {
    const key = roster.key(entry);
    const active = key === current.active;
    return `<li class="ae-roster-slot is-filled${active ? ' is-active' : ''}" data-faction="${entry.raceName === 'Asmodian' ? 'asmodian' : 'elyos'}">
      <button type="button" class="ae-roster-open" data-roster-open="${esc(key)}"${active ? ' aria-current="true"' : ''}>
        ${active ? '<span class="ae-roster-state">Active</span>' : ''}
        <strong>${esc(entry.name)}</strong>
        <span>${esc(entry.className)} · Lv ${esc(entry.level)}</span>
        <span class="ae-muted">${esc(entry.serverName)}${entry.demo ? ' · example' : ''}</span>
      </button>
      <button type="button" class="ae-roster-remove" data-roster-remove="${esc(key)}" aria-label="Remove ${esc(entry.name)} from your Daevas">Remove</button>
    </li>`;
  });
  for (let i = current.entries.length; i < roster.slots; i++) {
    cards.push('<li class="ae-roster-slot is-empty"><button type="button" class="ae-roster-add" data-roster-add>+ Add a Daeva</button></li>');
  }
  $('#aeRoster').innerHTML = cards.join('');
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
    importCharacter({ serverId: row.serverId, characterId: row.characterId });
  }));
}

function show(model, source, ref) {
  Object.assign(state, { model, source, ref });
  setFaction(model.profile.raceName);
  showSource(source);
  renderSummary();
  renderRoster();
  markCharacterShown();
}

async function fallbackToDemo(message) {
  showNotice(message, 'warn');
  const { model, source } = await loadCharacter(null, { demoReason: 'unavailable' });
  show(model, source, null);
}

async function importCharacter(ref) {
  setBusy(true);
  try {
    const { model, source } = await loadCharacter(ref);
    if (!roster.add(model, source)) showNotice(`All ${roster.slots} slots are full. Remove a Daeva to add ${model.profile.name}.`, 'warn');
    else showNotice('');
    const shown = source.kind === 'live' ? ref : null;
    show(model, source, shown);
    history.replaceState(null, '', shown ? `?${new URLSearchParams({ serverId: shown.serverId, characterId: shown.characterId })}` : location.pathname);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    await fallbackToDemo('The armory is unavailable right now, so this shows the ASTRIX285 example. Try again in a minute.');
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  state.busy = busy;
  const button = $('#aeFind');
  button.disabled = busy;
  button.textContent = busy ? 'Reading the armory' : 'Find character';
}

async function onSearch(event) {
  event.preventDefault();
  if (state.busy) return;
  const name = $('#aeNameInput').value.trim();
  if (!name) { showNotice('Type a character name first.', 'warn'); $('#aeNameInput').focus(); return; }
  setBusy(true);
  let found;
  try {
    found = await searchCharacters(name);
  } catch (error) {
    setBusy(false);
    if (!(error instanceof ArmoryUnavailable)) throw error;
    await fallbackToDemo('The armory is unavailable right now, so this shows the ASTRIX285 example. Try again in a minute.');
    return;
  }
  setBusy(false);
  const serverId = Number($('#aeServer').value) || null;
  const rows = serverId ? found.rows.filter(row => row.serverId === serverId) : found.rows;
  if (!rows.length) {
    renderResults([]);
    showNotice(armoryLive()
      ? `No Daeva named ${name} on ${serverId ? 'that server' : 'EU servers'}. Check the spelling.`
      : 'Live search is not connected yet. Search ASTRIX285 to open the example.', 'warn');
    return;
  }
  showNotice('');
  if (rows.length === 1) { renderResults([]); await importCharacter({ serverId: rows[0].serverId, characterId: rows[0].characterId }); }
  else renderResults(rows);
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
      importCharacter({ serverId: entry.serverId, characterId: entry.characterId });
    }
  });
}

async function start() {
  wireDrawer();
  setFaction(null);
  $('#aeSearch').addEventListener('submit', onSearch);
  wireRoster();
  const { servers } = await loadCatalogue();
  renderServers(servers);
  const fromUrl = refFromUrl();
  const active = roster.active();
  const ref = fromUrl ?? (active ? { serverId: active.serverId, characterId: active.characterId } : null);
  try {
    const { model, source } = await loadCharacter(ref);
    show(model, source, source.kind === 'live' ? ref : null);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    await fallbackToDemo('The armory is unavailable right now, so this shows the ASTRIX285 example. Try again in a minute.');
  }
  markReady();
}

start().catch(error => {
  showNotice('The Daeva Card could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
});
