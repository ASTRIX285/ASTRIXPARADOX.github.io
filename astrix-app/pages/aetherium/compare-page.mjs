/**
 * Compare (The Aetherium, hub/aetherium/compare/): two saved Daevas side by side, from any server or region. Portrait,
 * class, level, combat power, item level, legion, the 16 stats, each gear slot (grade, enchant, exceed, item level),
 * Arcana, Daevanion boards and titles owned. The higher of two numbers is in the accent colour.
 * The pair lives in the address (?a=<region>:<serverId>:<characterId>&b=...), so a shared link opens the same two.
 * First paint is the two character calls, in parallel. Item levels come only from item details already kept for this
 * browser session (the Gear page reads them), so Compare makes no item call of its own.
 */
import {
  ArmoryUnavailable,
  cardUrl,
  compareKey,
  compareRef,
  explain,
  itemDetailKept,
  loadCharacter,
  loadGrades,
  loadItemDetail,
  regionName,
  regionShort,
  roster
} from './aetherium-data.mjs';
import { $, esc, gradeTile, isPending, markCharacterShown, markReady, number, setFaction, showNotice, slotLabel, TITLE_CATEGORY_NAMES, wireDrawer } from './aetherium-ui.mjs';
import { gradeInfo, indexGrades } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { daevanionPercent } from '/astrix-app/games/aion2/engine/armory-adapter.mjs';

/* The game's equipment window order (the Gear page's grid), then the five Arcana. */
const GEAR_ORDER = ['MAINHAND', 'SUBHAND', 'HELMET', 'SHOULDER', 'TORSO', 'PANTS', 'GLOVES', 'BOOTS', 'CAPE', 'BELT',
  'NECKLACE', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'AMULET', 'RUNE1', 'RUNE2'];
const keyOf = name => String(name ?? '').toUpperCase().replace(/[\s_]/g, '');
const state = { a: null, b: null, grades: null, loaded: [null, null] };

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
  return `<label class="ae-field ae-cmp-pick"><span>${side === 'a' ? 'First Daeva' : 'Second Daeva'}</span>
      <select id="aeCmp-${side}" data-compare-pick="${side}">
        <option value="">Pick a Daeva</option>
        ${options.map(option => `<option value="${esc(option.key)}"${current && option.key === compareKey(current) ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}
      </select></label>`;
}

/* Comparing numbers: the higher one is marked (accent colour). A tie or a missing side marks neither. */
const higher = (x, y) => (Number.isFinite(x) && Number.isFinite(y) && x !== y ? (x > y ? 0 : 1) : null);
function row(label, cells, values = null, { key = null } = {}) {
  const win = values ? higher(values[0], values[1]) : null;
  return `<div class="ae-cmp-row"${key ? ` data-compare-row="${esc(key)}"` : ''}>
      <div class="ae-cmp-label">${esc(label)}</div>
      ${cells.map((cell, side) => `<div class="ae-cmp-cell${win === side ? ' is-higher' : ''}" data-side="${side ? 'b' : 'a'}">${cell}</div>`).join('')}
    </div>`;
}
const numberCell = value => (Number.isFinite(value) ? `<b>${number(value)}</b>` : '<span class="ae-muted">-</span>');
const section = (id, title, rows) => `<section class="ae-panel ae-cmp-section" data-compare-section="${id}" aria-labelledby="aeCmpH-${id}"><h2 class="ae-section-title" id="aeCmpH-${id}">${esc(title)}</h2><div class="ae-cmp-rows">${rows.join('')}</div></section>`;

function headCell(loaded, ref) {
  if (!loaded) return `<div class="ae-cmp-who is-missing"><span class="ae-cmp-portrait"><span>No data</span></span><p class="ae-muted">${ref ? 'Could not read this Daeva.' : 'Pick a Daeva.'}</p></div>`;
  const p = loaded.model.profile;
  return `<div class="ae-cmp-who">
      <span class="ae-cmp-portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="${esc(p.name)} portrait" width="100" height="120" decoding="async" referrerpolicy="no-referrer">` : '<span>No portrait</span>'}</span>
      <a class="ae-cmp-name" href="${esc(cardUrl(ref))}">${esc(p.name)}</a>
      <p class="ae-cmp-line">${esc(p.class)} Lv ${esc(p.level)}</p>
      <p class="ae-cmp-line ae-muted">${esc(p.server.name)} · ${esc(regionName(loaded.model.source.region))}</p>
    </div>`;
}

/** One gear slot in a cell: the icon on its grade tile, then grade, +N, Exceed N (above 0 only) and item level when kept. */
function gearCell(slot) {
  if (!slot || slot.empty) return '<span class="ae-muted">-</span>';
  const grade = gradeInfo(slot.grade, state.grades, slot.gradeName ?? null);
  const bits = [`+${slot.enchant}`, slot.exceed > 0 ? `Exceed ${slot.exceed}` : null, Number.isFinite(slot.itemLevel) ? `Item level ${slot.itemLevel}` : null].filter(Boolean);
  return `<span class="ae-cmp-item" title="${esc(slot.name)}">${gradeTile({ icon: slot.icon, grade: grade.id, size: 44 })}
      <span class="ae-cmp-item-text"><span class="ae-grade-name"${grade.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(grade.name)}</span><span>${esc(bits.join(' · '))}</span></span></span>`;
}
const gearScore = slot => (slot && !slot.empty ? (Number.isFinite(slot.itemLevel) ? slot.itemLevel : null) : null);

function render() {
  const [x, y] = state.loaded;
  const models = [x?.model ?? null, y?.model ?? null];
  const both = (fn) => models.map(model => (model ? fn(model) : null));
  const stage = $('#aeStage');
  const pickers = `<div class="ae-cmp-pickers">${pickerHtml('a', state.a)}${pickerHtml('b', state.b)}</div>`;
  if (!models[0] && !models[1]) {
    const saved = roster.all().length;
    stage.innerHTML = `<div class="ae-gw ae-compare-window">${barHtml()}<div class="ae-gw-body">${pickers}
      <p class="ae-empty" id="aeCmpEmpty">${saved >= 2 ? 'Pick two Daevas to compare.' : 'Save two Daevas on the Daeva Card first, then compare them here.'}</p>
      ${saved < 2 ? '<p><a class="btn" href="/hub/aetherium/#aeSearch">Find a Daeva</a></p>' : ''}</div></div>`;
    return;
  }
  const profile = [
    row('Daeva', [headCell(x, state.a), headCell(y, state.b)], null, { key: 'who' }),
    row('Level', both(m => m.profile.level).map(numberCell), both(m => m.profile.level), { key: 'level' }),
    row('Combat power', both(m => m.profile.combatPower).map(numberCell), both(m => m.profile.combatPower), { key: 'combat-power' }),
    row('Item level', both(m => (isPending(m.profile.itemLevel) ? null : m.profile.itemLevel)).map(numberCell), both(m => (isPending(m.profile.itemLevel) ? null : m.profile.itemLevel)), { key: 'item-level' })
  ];
  // The legion row only when either Daeva has one: a Daeva with none shows a dash, never a made-up name.
  if (models.some(model => model?.profile.legion)) profile.push(row('Legion', both(m => m.profile.legion).map(name => (name ? esc(name) : '<span class="ae-muted">-</span>')), null, { key: 'legion' }));
  const statTypes = [];
  for (const model of models) for (const stat of model?.stats ?? []) if (!statTypes.some(item => item.type === stat.type)) statTypes.push({ type: stat.type, name: stat.name });
  const stats = statTypes.map(({ type, name }) => {
    const values = both(m => m.stats.find(stat => stat.type === type)?.value ?? null);
    return row(name, values.map(numberCell), values, { key: `stat-${type}` });
  });
  const gearKeys = [];
  for (const model of models) for (const slot of model?.gear ?? []) if (!slot.empty && !/^ARCANA\d$/.test(keyOf(slot.slot)) && !gearKeys.includes(keyOf(slot.slot))) gearKeys.push(keyOf(slot.slot));
  gearKeys.sort((p, q) => (GEAR_ORDER.indexOf(p) + 1 || 99) - (GEAR_ORDER.indexOf(q) + 1 || 99));
  const slotOf = (model, key) => model?.gear.find(slot => keyOf(slot.slot) === key) ?? null;
  const gear = gearKeys.map(key => {
    const slots = models.map(model => slotOf(model, key));
    const name = slots.find(Boolean)?.slot ?? key;
    return row(slotLabel(name), slots.map(gearCell), slots.map(gearScore), { key: `gear-${key}` });
  });
  const arcana = [0, 1, 2, 3, 4].map(n => {
    const slots = models.map(model => model?.arcana?.[n] ?? null);
    return row(`Arcana ${n + 1}`, slots.map(gearCell), slots.map(gearScore), { key: `arcana-${n + 1}` });
  });
  const boardNames = [];
  for (const model of models) for (const board of model?.daevanion ?? []) if (!boardNames.includes(board.name)) boardNames.push(board.name);
  const boards = boardNames.map(name => {
    const list = models.map(model => model?.daevanion.find(board => board.name === name) ?? null);
    const pct = board => (board ? (Number.isFinite(board.percent) ? board.percent : board.nodesTotal ? Math.round((board.nodesTaken / board.nodesTotal) * 100) : null) : null);
    return row(name, list.map(board => (board ? `<b>${pct(board) ?? '-'}%</b> <span class="ae-muted">${esc(board.nodesTaken)} / ${esc(board.nodesTotal)}</span>` : '<span class="ae-muted">-</span>')), list.map(pct), { key: `board-${name}` });
  });
  const overall = both(m => daevanionPercent(m.daevanion));
  boards.push(row('Overall', overall.map(value => (value === null ? '<span class="ae-muted">-</span>' : `<b>${value}%</b>`)), overall, { key: 'board-overall' }));
  const titleOf = model => (model && !isPending(model.titles) ? model.titles : null);
  const titles = [row('Owned', models.map(model => { const t = titleOf(model); return t && Number.isFinite(t.owned) ? `<b>${number(t.owned)}</b> <span class="ae-muted">of ${number(t.total)}</span>` : '<span class="ae-muted">-</span>'; }), models.map(model => titleOf(model)?.owned ?? null), { key: 'titles-owned' })];
  for (const id of ['attack', 'defense', 'other']) {
    const cats = models.map(model => titleOf(model)?.categories.find(item => item.id === id) ?? null);
    if (!cats.some(Boolean)) continue;
    titles.push(row(TITLE_CATEGORY_NAMES[id], cats.map(cat => (cat ? `<b>${number(cat.owned)}</b> <span class="ae-muted">of ${number(cat.total)}</span>${cat.worn ? `<span class="ae-cmp-sub">${esc(cat.worn.name)}</span>` : ''}` : '<span class="ae-muted">-</span>')), cats.map(cat => cat?.owned ?? null), { key: `titles-${id}` }));
  }
  stage.innerHTML = `<div class="ae-gw ae-compare-window">${barHtml()}<div class="ae-gw-body">
    ${pickers}
    <p class="ae-cmp-share"><button type="button" class="btn" id="aeCmpCopy">Copy link</button> <span class="ae-muted" id="aeCmpCopied" role="status"></span></p>
    <p class="ae-note">The higher number is in colour. Item levels show for items you have opened on that Daeva's Gear page in this visit.</p>
    <div class="ae-cmp" id="aeCompare">
      ${section('profile', 'Daeva', profile)}
      ${stats.length ? section('stats', 'Stats', stats) : ''}
      ${gear.length ? section('gear', 'Gear', gear) : ''}
      ${section('arcana', 'Arcana', arcana)}
      ${boards.length ? section('daevanion', 'Daevanion', boards) : ''}
      ${section('titles', 'Titles', titles)}
    </div>
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
    try { const { detail } = await loadItemDetail(model, slot); if (detail && detail.id === slot.itemId && Number.isFinite(detail.level)) slot.itemLevel = detail.level; if (detail?.gradeName) slot.gradeName = detail.gradeName; } catch { /* kept detail unreadable: no item level */ }
  }
}

async function loadPair() {
  const refs = [state.a, state.b];
  const results = await Promise.allSettled(refs.map(ref => (ref ? loadCharacter(ref) : Promise.resolve(null))));
  const failed = results.find(result => result.status === 'rejected');
  if (failed && !(failed.reason instanceof ArmoryUnavailable)) throw failed.reason;
  state.loaded = results.map(result => (result.status === 'fulfilled' ? result.value : null));
  await Promise.all(state.loaded.filter(Boolean).map(loaded => keptItemLevels(loaded.model)));
  showNotice(failed ? explain(failed.reason) : '', 'warn', failed ? { retry: () => loadPair().then(render).catch(error => fail(error)) } : {});
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
  // A link with only one Daeva, or none, starts from the saved Daevas: the active one and the next.
  const saved = roster.all();
  if (!state.a && !state.b && saved.length >= 2) {
    const active = roster.active() ?? saved[0];
    state.a = active;
    state.b = saved.find(entry => !sameDaeva(entry, active)) ?? null;
    writeUrl();
  }
  const grades = loadGrades().catch(() => null);
  await loadPair();
  state.grades = (await grades) ? indexGrades(await grades) : null;
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
    navigator.clipboard?.writeText(location.href).then(() => done('Link copied.'), () => done(location.href)) ?? done(location.href);
  });
  markReady();
}

start().catch(fail);
