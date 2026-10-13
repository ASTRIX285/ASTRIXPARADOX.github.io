/**
 * Compare (The Aetherium, hub/aetherium/compare/): two saved Daevas side by side, from any server or region. The first
 * Daeva is always on the left and the second on the right, all the way down, at every width. A header per Daeva
 * (portrait, name, class and level, server and region, legion when the data has one), then compact sections of rows:
 * the left value, the label in the middle, the right value, the higher number in the accent colour. Sections: Overview,
 * Main stats, Deity stats, Daevanion, Titles, Arcana and Gear. A gear or Arcana cell is only the item icon on its grade
 * tile with grade, enchant and item level on one short line; an empty slot is a dim empty frame.
 * The pair lives in the address (?a=<region>:<serverId>:<characterId>&b=...), so a shared link opens the same two.
 * First paint is the two character calls, in parallel. Item levels come only from item details already kept for this
 * browser session (the Gear page reads them), so Compare makes no item call of its own.
 */
import {
  ArmoryUnavailable,
  compareKey,
  compareRef,
  explain,
  itemDetailKept,
  loadCharacter,
  loadGrades,
  loadItemDetail,
  loadStats,
  regionName,
  regionShort,
  roster
} from './aetherium-data.mjs';
import { $, esc, gradeTile, isPending, markCharacterShown, markReady, number, setFaction, showNotice, slotLabel, statIcon, TITLE_CATEGORY_NAMES, wireDrawer } from './aetherium-ui.mjs';
import { gradeInfo, indexGrades } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { daevanionPercent, MAIN_STAT_TYPES } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';

/* The game's equipment window order (the Gear page's grid). */
const GEAR_ORDER = ['MAINHAND', 'SUBHAND', 'HELMET', 'SHOULDER', 'TORSO', 'PANTS', 'GLOVES', 'BOOTS', 'CAPE', 'BELT',
  'NECKLACE', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'AMULET', 'RUNE1', 'RUNE2'];
const keyOf = name => String(name ?? '').toUpperCase().replace(/[\s_]/g, '');
const state = { a: null, b: null, grades: null, stats: null, loaded: [null, null] };
const DASH = '<span class="ae-cmp-none">-</span>';

/** The pair from the address. */
function pairFromUrl() {
  const params = new URLSearchParams(location.search);
  return [compareRef(params.get('a')), compareRef(params.get('b'))];
}
function writeUrl() {
  const params = new URLSearchParams();
  if (state.a) params.set('a', compareKey(state.a));
  if (state.b) params.set('b', compareKey(state.b));
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

const sameDaeva = (x, y) => Boolean(x && y && String(x.serverId) === String(y.serverId) && x.characterId === y.characterId);
const entryLabel = entry => `${entry.name} · ${entry.className} Lv ${entry.level} · ${entry.serverName} · ${regionShort(entry.region)}`;

/** One picker: every saved Daeva on this device, and the Daeva from the link when it is not saved here. */
function pickerHtml(side, current) {
  const saved = roster.all();
  const options = saved.map(entry => ({ key: compareKey(entry), label: entryLabel(entry) }));
  if (current && !saved.some(entry => sameDaeva(entry, current))) options.unshift({ key: compareKey(current), label: 'Daeva from the link' });
  return `<label class="ae-field ae-cmp-pick"><span>${side === 'a' ? 'Left' : 'Right'}</span>
      <select id="aeCmp-${side}" name="compare-${side}" data-compare-pick="${side}">
        <option value="">Pick a Daeva</option>
        ${options.map(option => `<option value="${esc(option.key)}"${current && option.key === compareKey(current) ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}
      </select></label>`;
}

/* A row: the left value, the label in the middle, the right value. With values, the higher number is marked on its side. */
const higher = (x, y) => (Number.isFinite(x) && Number.isFinite(y) && x !== y ? (x > y ? 0 : 1) : null);
function row(label, cells, values = null, { key = null, icon = '' } = {}) {
  const win = values ? higher(values[0], values[1]) : null;
  const cell = side => `<div class="ae-cmp-cell is-${side ? 'b' : 'a'}${win === side ? ' is-higher' : ''}" data-side="${side ? 'b' : 'a'}">${cells[side]}</div>`;
  return `<div class="ae-cmp-row"${key ? ` data-compare-row="${esc(key)}"` : ''}>${cell(0)}<div class="ae-cmp-label">${icon}<span>${esc(label)}</span></div>${cell(1)}</div>`;
}
const numberCell = value => (Number.isFinite(value) ? `<b>${number(value)}</b>` : DASH);
const section = (id, title, rows) => `<section class="ae-panel ae-cmp-section" data-compare-section="${id}" aria-labelledby="aeCmpH-${id}">
    <h2 class="ae-section-title" id="aeCmpH-${id}">${esc(title)}</h2><div class="ae-cmp-rows">${rows.join('')}</div></section>`;

function headCell(loaded, ref) {
  if (!loaded) return `<div class="ae-cmp-who is-missing"><span class="ae-cmp-portrait"><span>-</span></span><p class="ae-cmp-line">${ref ? 'Could not read this Daeva.' : 'Pick a Daeva.'}</p></div>`;
  const p = loaded.model.profile;
  return `<div class="ae-cmp-who">
      <span class="ae-cmp-portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="${esc(p.name)} portrait" width="100" height="120" decoding="async" referrerpolicy="no-referrer">` : '<span>No portrait</span>'}</span>
      <p class="ae-cmp-name">${esc(p.name)}</p>
      <p class="ae-cmp-line">${esc(p.class)} Lv ${esc(p.level)}</p>
      <p class="ae-cmp-line">${esc(p.server.name)} · ${esc(regionName(loaded.model.source.region))}</p>
      ${p.legion ? `<p class="ae-cmp-line" data-compare-legion>Legion ${esc(p.legion)}</p>` : ''}
    </div>`;
}

/** A gear or Arcana slot: only the icon on its grade tile, then grade, +N (Exceed N above 0) and item level on one line. */
function itemCell(slot) {
  if (!slot || slot.empty) return '<span class="ae-cmp-item is-empty"><span class="ae-gempty" aria-hidden="true"></span><span class="ae-sr">Empty</span></span>';
  const grade = gradeInfo(slot.grade, state.grades, slot.gradeName ?? null);
  const bits = [grade.name, `+${slot.enchant}${slot.exceed > 0 ? ` E${slot.exceed}` : ''}`, Number.isFinite(slot.itemLevel) ? `iLv ${slot.itemLevel}` : null].filter(Boolean);
  return `<span class="ae-cmp-item" data-tip="${esc(slot.name)}">${gradeTile({ icon: slot.icon, grade: grade.id, size: 48 })}
      <span class="ae-cmp-item-line"><span class="ae-grade-name"${grade.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(bits[0])}</span> ${esc(bits.slice(1).join(' · '))}</span></span>`;
}
const itemScore = slot => (slot && !slot.empty && Number.isFinite(slot.itemLevel) ? slot.itemLevel : null);

function compareHtml(models) {
  const both = fn => models.map(model => (model ? fn(model) : null));
  const sections = [];
  const itemLevel = m => (isPending(m.profile.itemLevel) ? null : m.profile.itemLevel);
  sections.push(section('overview', 'Overview', [
    row('Combat power', both(m => m.profile.combatPower).map(numberCell), both(m => m.profile.combatPower), { key: 'combat-power' }),
    row('Item level', both(itemLevel).map(numberCell), both(itemLevel), { key: 'item-level' }),
    row('Level', both(m => m.profile.level).map(numberCell), both(m => m.profile.level), { key: 'level' })
  ]));
  const statRows = kind => {
    const types = [];
    for (const model of models) for (const stat of model?.stats ?? []) if ((kind === 'main') === MAIN_STAT_TYPES.includes(stat.type) && !types.some(item => item.type === stat.type)) types.push({ type: stat.type, name: stat.name });
    return types.map(({ type, name }) => {
      const values = both(m => m.stats.find(stat => stat.type === type)?.value ?? null);
      const record = state.stats?.records?.find(item => item.type === type) ?? null;
      return row(name, values.map(numberCell), values, { key: `stat-${type}`, icon: statIcon(record?.icon, { size: 24 }) });
    });
  };
  const main = statRows('main');
  const deity = statRows('deity');
  if (main.length) sections.push(section('main-stats', 'Main stats', main));
  if (deity.length) sections.push(section('deity-stats', 'Deity stats', deity));
  const boardNames = [];
  for (const model of models) for (const board of model?.daevanion ?? []) if (!boardNames.includes(board.name)) boardNames.push(board.name);
  const pct = board => (board && board.nodesTotal > 0 ? Math.round((board.nodesTaken / board.nodesTotal) * 100) : null);
  const boards = boardNames.map(name => {
    const list = models.map(model => model?.daevanion.find(board => board.name === name) ?? null);
    return row(name, list.map(board => (pct(board) === null ? DASH : `<b>${pct(board)}%</b>`)), list.map(pct), { key: `board-${name}` });
  });
  if (boards.length) {
    const overall = both(m => daevanionPercent(m.daevanion));
    boards.push(row('Overall', overall.map(value => (value === null ? DASH : `<b>${value}%</b>`)), overall, { key: 'board-overall' }));
    sections.push(section('daevanion', 'Daevanion', boards));
  }
  // Titles: owned of total per category only. The data's overall count does not match the game's yet.
  const titleOf = model => (model && !isPending(model.titles) ? model.titles : null);
  const titles = [];
  for (const id of ['attack', 'defense', 'other']) {
    const cats = models.map(model => titleOf(model)?.categories.find(item => item.id === id) ?? null);
    if (!cats.some(Boolean)) continue;
    titles.push(row(TITLE_CATEGORY_NAMES[id], cats.map(cat => (cat && Number.isFinite(cat.owned) ? `<b>${number(cat.owned)}</b> <span class="ae-cmp-of">of ${number(cat.total)}</span>` : DASH)), cats.map(cat => cat?.owned ?? null), { key: `titles-${id}` }));
  }
  if (titles.length) sections.push(section('titles', 'Titles', titles));
  sections.push(section('arcana', 'Arcana', [0, 1, 2, 3, 4].map(n => {
    const slots = models.map(model => model?.arcana?.[n] ?? null);
    return row(`Arcana ${n + 1}`, slots.map(itemCell), slots.map(itemScore), { key: `arcana-${n + 1}` });
  })));
  const gearKeys = [];
  for (const model of models) for (const slot of model?.gear ?? []) if (!/^ARCANA\d$/.test(keyOf(slot.slot)) && !gearKeys.includes(keyOf(slot.slot))) gearKeys.push(keyOf(slot.slot));
  gearKeys.sort((p, q) => (GEAR_ORDER.indexOf(p) + 1 || 99) - (GEAR_ORDER.indexOf(q) + 1 || 99));
  const slotOf = (model, key) => model?.gear.find(slot => keyOf(slot.slot) === key) ?? null;
  const gear = gearKeys.map(key => {
    const slots = models.map(model => slotOf(model, key));
    return row(slotLabel(slots.find(Boolean)?.slot ?? key), slots.map(itemCell), slots.map(itemScore), { key: `gear-${key}` });
  });
  if (gear.length) sections.push(section('gear', 'Gear', gear));
  return sections.join('');
}

function render() {
  const models = state.loaded.map(loaded => loaded?.model ?? null);
  const stage = $('#aeStage');
  const pickers = `<div class="ae-cmp-pickers">${pickerHtml('a', state.a)}${pickerHtml('b', state.b)}</div>`;
  if (!models[0] && !models[1]) {
    const saved = roster.all().length;
    stage.innerHTML = `<div class="ae-gw ae-compare-window">${barHtml()}<div class="ae-gw-body">${pickers}
      <p class="ae-empty" id="aeCmpEmpty">${saved >= 2 ? 'Pick two Daevas to compare.' : 'Save two Daevas on the Daeva Card first, then compare them here.'}</p>
      ${saved < 2 ? '<p><a class="btn" href="/hub/aetherium/#aeSearch">Find a Daeva</a></p>' : ''}</div></div>`;
    return;
  }
  stage.innerHTML = `<div class="ae-gw ae-compare-window">${barHtml()}<div class="ae-gw-body">
    ${pickers}
    <div class="ae-cmp-heads" id="aeCmpHeads">${headCell(state.loaded[0], state.a)}${headCell(state.loaded[1], state.b)}</div>
    <div class="ae-cmp-tools"><p class="ae-note" id="aeCmpNote">The higher number is in colour.</p><button type="button" id="aeCmpCopy">Copy link</button><span class="ae-cmp-copied" id="aeCmpCopied" role="status"></span></div>
    <div class="ae-cmp" id="aeCompare">${compareHtml(models)}</div>
  </div></div>`;
}

const barHtml = () => `<div class="ae-gw-bar">
    <a class="ae-gw-back" href="/hub/aetherium/"><span aria-hidden="true">‹</span> Daeva Card</a>
    <h1 class="ae-gw-title" id="aeScreenTitle">Compare</h1>
    <p class="ae-gw-who">Two Daevas side by side</p>
  </div>`;

/** Item levels for worn items whose detail this session already holds (no Worker call). */
async function keptItemLevels(model) {
  for (const slot of [...model.gear, ...model.arcana]) {
    if (slot.empty || !itemDetailKept(model, slot)) continue;
    try {
      const { detail } = await loadItemDetail(model, slot);
      if (detail && detail.id === slot.itemId && Number.isFinite(detail.level)) slot.itemLevel = detail.level;
      if (detail?.gradeName) slot.gradeName = detail.gradeName;
    } catch { /* kept detail unreadable: no item level */ }
  }
}

async function loadPair() {
  const refs = [state.a, state.b];
  const results = await Promise.allSettled(refs.map(ref => (ref ? loadCharacter(ref) : Promise.resolve(null))));
  const failed = results.find(result => result.status === 'rejected');
  if (failed && !(failed.reason instanceof ArmoryUnavailable)) throw failed.reason;
  state.loaded = results.map(result => (result.status === 'fulfilled' ? result.value : null));
  await Promise.all(state.loaded.filter(Boolean).map(loaded => keptItemLevels(loaded.model)));
  showNotice(failed ? explain(failed.reason) : '', 'warn', failed ? { retry: () => loadPair().then(render).catch(fail) } : {});
  if (state.loaded.some(Boolean)) markCharacterShown();
}

function fail(error) {
  showNotice('The Compare page could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
}

async function start() {
  wireDrawer();
  setFaction(null);
  [state.a, state.b] = pairFromUrl();
  // A link with no Daeva starts from the saved Daevas: the active one and the next.
  const saved = roster.all();
  if (!state.a && !state.b && saved.length >= 2) {
    const active = roster.active() ?? saved[0];
    state.a = active;
    state.b = saved.find(entry => !sameDaeva(entry, active)) ?? null;
    writeUrl();
  }
  const statics = Promise.all([loadGrades().catch(() => null), loadStats().catch(() => null)]);
  await loadPair();
  const [grades, stats] = await statics;
  state.grades = grades ? indexGrades(grades) : null;
  state.stats = stats;
  render();
  $('#aeStage').addEventListener('change', event => {
    const pick = event.target.closest('[data-compare-pick]');
    if (!pick) return;
    const ref = compareRef(pick.value);
    if (pick.dataset.comparePick === 'a') state.a = ref; else state.b = ref;
    writeUrl();
    loadPair().then(render).catch(fail);
  });
  $('#aeStage').addEventListener('click', event => {
    if (!event.target.closest('#aeCmpCopy')) return;
    const done = text => { const note = $('#aeCmpCopied'); if (note) note.textContent = text; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(location.href).then(() => done('Link copied.'), () => done(location.href));
    else done(location.href);
  });
  markReady();
}

start().catch(fail);
