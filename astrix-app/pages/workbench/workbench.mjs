/**
 * WorkBench editor (screens D and E). The player rebuilds a Division 2 loadout by
 * hand. Every item, slot and range comes from the TD2 catalogue through the game
 * module; anything not sourced yet shows PENDING and cannot be equipped.
 */
import { loadCatalogue } from '../../games/division/catalogue.mjs';
import { createDivisionModule } from '../../games/division/index.mjs';
import { PLATFORMS, PLATFORM_LABELS } from '../../core/build-format/build.mjs';
import { createManualAdapter } from '../../platform/adapters/division/manual.mjs';
import { OBJECTIVES, coreCounts, loadPlatform, openingBuild, pieceCounts, saveBuild, savePlatform, shareLink } from './workbench-state.mjs';

const TITLE = 'td2';
const FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'brand', label: 'Brand sets' },
  { id: 'gear-set', label: 'Gear sets' },
  { id: 'named', label: 'Named' },
  { id: 'exotic', label: 'Exotic' }
]);
const TYPE_LABELS = Object.freeze({ brand: 'Brand set', 'gear-set': 'Gear set', named: 'Named', exotic: 'Exotic' });

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

// platform: this device's platform. foreign: the open build is a shared build on another platform (view and duplicate only).
const state = { module: null, adapter: null, build: null, picker: null, platform: null, foreign: false };

function pendingNote(reason) {
  return `<p class="wb-pending"><span class="wb-tag">PENDING</span><span>${esc(reason)}</span></p>`;
}

function slotCard(slot) {
  const entry = state.build.slots[slot.id];
  const record = entry ? state.module.resolveItem(entry.itemId) : null;
  const itemName = !entry ? 'Empty' : isPending(record) ? entry.itemId : record.name;
  const cores = entry?.attributes ? state.module.listCoreAttributes().filter(core => core.id in entry.attributes) : [];
  const meta = !entry ? 'Choose an item' : isPending(record) ? 'Not in the catalogue' : cores.map(core => `${core.name} ${entry.attributes[core.id]}`).join(' · ') || 'No core attribute set';
  return `<div class="wb-slot${entry ? ' is-filled' : ''}">
    <button class="wb-slot-open" type="button" data-open-slot="${esc(slot.id)}" aria-label="${esc(slot.name)}: ${esc(itemName)}. Change item">
      <span class="wb-slot-label">${esc(slot.name)}</span>
      <span class="wb-slot-item">${esc(itemName)}</span>
      <span class="wb-slot-meta">${esc(meta)}</span>
    </button>
    ${entry ? `<button class="wb-slot-clear" type="button" data-clear-slot="${esc(slot.id)}" aria-label="Remove item from ${esc(slot.name)}">Remove</button>` : ''}
  </div>`;
}

function slotPanel(title, id, group) {
  const slots = state.module.listSlots(group);
  const body = isPending(slots) ? pendingNote(slots.reason) : `<div class="wb-slot-grid">${slots.map(slotCard).join('')}</div>`;
  return `<section class="wb-panel" aria-labelledby="${id}"><h2 class="wb-panel-title" id="${id}">${title}</h2>${body}</section>`;
}

function specializationPanel() {
  const options = state.module.listSpecializations?.() ?? [];
  const body = options.length
    ? `<label class="wb-field"><span>Specialization</span><select id="wbSpecialization"><option value="">Choose</option>${options.map(row => `<option value="${esc(row.id)}"${state.build.selections.specialization === row.id ? ' selected' : ''}>${esc(row.name)}</option>`).join('')}</select></label>`
    : pendingNote(`No specializations are in the ${TITLE} catalogue yet. They need an official source or an in-game capture.`);
  return `<section class="wb-panel" aria-labelledby="wbSpecTitle"><h2 class="wb-panel-title" id="wbSpecTitle">Specialization</h2>${body}</section>`;
}

function countsPanels() {
  const cores = coreCounts(state.build, state.module);
  const filled = Object.keys(state.build.slots).length;
  const coreRows = cores.length
    ? `<ul class="wb-counts">${cores.map(core => `<li><span>${esc(core.name)}</span><strong>${core.count}</strong></li>`).join('')}</ul><p class="wb-small">Equipped slots carrying each core attribute. ${filled} slot${filled === 1 ? '' : 's'} filled.</p>`
    : pendingNote('No core attributes are in the catalogue yet.');
  const pieces = pieceCounts(state.build, state.module);
  const pieceRows = pieces.length
    ? `<ul class="wb-counts">${pieces.map(row => `<li><span>${esc(row.name)}</span><strong>${row.count}</strong></li>`).join('')}</ul>`
    : '<p class="wb-small">No brand or gear set pieces equipped.</p>';
  return `<section class="wb-panel" aria-labelledby="wbCoreTitle"><h2 class="wb-panel-title" id="wbCoreTitle">Core attributes</h2>${coreRows}</section>
    <section class="wb-panel" aria-labelledby="wbPieceTitle"><h2 class="wb-panel-title" id="wbPieceTitle">Brand and set pieces</h2>${pieceRows}</section>
    <section class="wb-panel wb-source" aria-labelledby="wbSourceTitle"><h2 class="wb-panel-title" id="wbSourceTitle">Catalogue</h2>
      <p class="wb-small">Catalogue ${esc(state.module.getMetadata().catalogueVersion)}. Every value comes from an official Ubisoft post or an in-game capture, with its game version. Anything without a source shows PENDING and can't be equipped.</p></section>`;
}

function switches() {
  return `<div class="wb-switches">
    <div class="wb-switch" role="group" aria-label="Game"><span class="wb-switch-label">Game</span><button type="button" class="wb-chip" aria-pressed="true" disabled>The Division 2</button></div>
    <div class="wb-switch" role="group" aria-label="Platform"><span class="wb-switch-label">Platform</span>${PLATFORMS.map(platform => `<button type="button" class="wb-chip" data-platform="${platform}" aria-pressed="${state.platform === platform}">${PLATFORM_LABELS[platform]}</button>`).join('')}</div>
  </div>`;
}

function sharedBanner() {
  if (!state.foreign) return '';
  const theirs = PLATFORM_LABELS[state.build.platform];
  const action = state.platform
    ? `<button type="button" class="wb-primary" id="wbDuplicate">Duplicate onto ${PLATFORM_LABELS[state.platform]}</button>`
    : '<span class="wb-small">Choose your platform above to duplicate it.</span>';
  return `<div class="wb-shared" role="status"><p>Shared build for <strong>${esc(theirs)}</strong>. It stays as shared until you duplicate it onto your platform.</p>${action}</div>`;
}

function render() {
  const build = state.build;
  if (!build) {
    $('#wbRoot').innerHTML = `${switches()}<section class="wb-panel wb-start" aria-labelledby="wbStartTitle"><h2 class="wb-panel-title" id="wbStartTitle">Choose your platform</h2>
      <p class="wb-small">Builds are saved and shared with their platform. PC covers Ubisoft Connect, Steam, Epic and Luna, which share one agent. Pick yours above to start.</p></section>`;
    return;
  }
  $('#wbRoot').innerHTML = `${switches()}${sharedBanner()}
    <section class="wb-toolbar" aria-label="Build">
      <label class="wb-field wb-name"><span>Build name</span><input id="wbName" type="text" maxlength="80" autocomplete="off" value="${esc(build.name)}" placeholder="Name this build"></label>
      <div class="wb-objectives" role="group" aria-label="Objective">
        ${OBJECTIVES.map(row => `<button type="button" class="wb-chip" data-objective="${row.id}" aria-pressed="${build.objective === row.id}">${row.label}</button>`).join('')}
      </div>
      <div class="wb-actions">
        <button type="button" id="wbNew">New build</button>
        <button type="button" id="wbSave">Save</button>
        <button type="button" id="wbShare"${state.foreign ? '' : ' class="wb-primary"'}>Share link</button>
      </div>
    </section>
    <div class="wb-layout">
      <div class="wb-col-main">
        ${slotPanel('Weapons', 'wbWeaponsTitle', 'weapon')}
        ${slotPanel('Gear', 'wbGearTitle', 'gear')}
        <div class="wb-row">
          ${slotPanel('Skills', 'wbSkillsTitle', 'skill')}
          ${specializationPanel()}
        </div>
      </div>
      <aside class="wb-col-side" aria-label="Build totals">${countsPanels()}</aside>
    </div>`;
}

function commit(result) {
  if (!result.ok) { toast(result.reason); return false; }
  state.build = result.build;
  if (!state.foreign) saveBuild(storage ?? { setItem() {} }, state.build);
  render();
  return true;
}

/** A shared build from another platform is view only until it is duplicated. */
function editable() {
  if (!state.foreign) return true;
  toast(state.platform ? `Duplicate this build onto ${PLATFORM_LABELS[state.platform]} to edit it.` : 'Choose your platform, then duplicate this build to edit it.');
  return false;
}

async function choosePlatform(platform) {
  state.platform = platform;
  savePlatform(storage ?? { setItem() {} }, platform);
  if (!state.build) { commit(await state.adapter.load({ platform })); return; }
  if (state.foreign) {
    state.foreign = state.build.platform !== platform;
    if (!state.foreign) saveBuild(storage ?? { setItem() {} }, state.build);
    render();
    return;
  }
  // The player's own build moves with their platform, so every saved build and link carries it.
  if (state.build.platform !== platform) { commit(state.adapter.duplicate(state.build, platform)); toast(`Build set to ${PLATFORM_LABELS[platform]}.`); }
  else render();
}

function toast(text) {
  const node = $('#wbToast');
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
}

/* ---------- Item picker and roll editor (screen E) ---------- */

function pickerMarkup() {
  const { slot, filter, query, selected, coreId, value } = state.picker;
  const options = state.module.listOptions(slot.id)
    .filter(row => filter === 'all' || row.type === filter)
    .filter(row => !query || row.name.toLowerCase().includes(query.toLowerCase()));
  const anyOptions = state.module.listOptions(slot.id).length > 0;
  const list = options.length
    ? `<ul class="wb-options" role="listbox" aria-label="Items for ${esc(slot.name)}">${options.map(row => `<li><button type="button" role="option" class="wb-option" data-pick="${esc(row.id)}" aria-selected="${selected === row.id}" ${row.equippable ? '' : 'disabled aria-disabled="true"'}>
        <span class="wb-option-name">${esc(row.name)}</span><span class="wb-option-type">${esc(TYPE_LABELS[row.type] ?? row.type)}</span>
        ${row.equippable ? '' : `<span class="wb-tag">PENDING</span><span class="wb-option-reason">${esc(row.reason)}</span>`}
      </button></li>`).join('')}</ul>`
    : `<p class="wb-empty">${anyOptions ? 'Nothing matches that search.' : `No sourced items for ${esc(slot.name)} yet. Items appear here as they are added to the catalogue.`}</p>`;
  const cores = state.module.listCoreAttributes();
  const range = coreId ? state.module.attributeRange(coreId) : null;
  const rangeBody = !coreId ? '<p class="wb-small">Pick a core attribute to set its roll.</p>'
    : isPending(range) ? pendingNote(range.reason)
    : `<label class="wb-field"><span>Roll (${range.min} to ${range.max}${range.unit === 'percent' ? '%' : range.unit === 'tier' ? ' tier' : ''})</span><input id="wbRoll" type="number" inputmode="decimal" min="${range.min}" max="${range.max}" step="any" value="${esc(value ?? '')}"></label>`;
  return `<form method="dialog" class="wb-picker-inner">
    <header class="wb-picker-head"><h2 id="wbPickerTitle">Choose item · ${esc(slot.name)}</h2><button type="button" class="ax-icon-btn" data-picker-close aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="wb-picker-body">
      <div class="wb-picker-list">
        <label class="wb-field"><span>Search</span><input id="wbSearch" type="search" autocomplete="off" placeholder="Brands, sets, named, exotics" value="${esc(query)}"></label>
        <div class="wb-filters" role="group" aria-label="Filter">${FILTERS.map(row => `<button type="button" class="wb-chip" data-filter="${row.id}" aria-pressed="${filter === row.id}">${row.label}</button>`).join('')}</div>
        ${list}
      </div>
      <div class="wb-roll">
        <h3 class="wb-panel-title">Roll editor</h3>
        <div class="wb-filters" role="group" aria-label="Core attribute">${cores.map(core => `<button type="button" class="wb-chip" data-core="${esc(core.id)}" aria-pressed="${coreId === core.id}">${esc(core.name)}</button>`).join('')}</div>
        ${rangeBody}
        <p class="wb-small">Roll limits come from the catalogue. Values outside the min and max are refused.</p>
      </div>
    </div>
    <footer class="wb-picker-foot">
      <button type="button" data-picker-close>Cancel</button>
      <button type="button" class="wb-primary" id="wbApply" ${selected ? '' : 'disabled'}>Apply to ${esc(slot.name.toLowerCase())}</button>
    </footer>
  </form>`;
}

function renderPicker() {
  const dialog = $('#wbPicker');
  const focusId = document.activeElement?.id;
  dialog.innerHTML = pickerMarkup();
  if (focusId && dialog.querySelector(`#${focusId}`)) {
    const node = dialog.querySelector(`#${focusId}`);
    node.focus();
    if (node.setSelectionRange && node.type !== 'number') node.setSelectionRange(node.value.length, node.value.length);
  }
}

function openPicker(slotId) {
  const slots = state.module.listSlots('gear');
  const slot = isPending(slots) ? null : slots.find(row => row.id === slotId);
  if (!slot) return;
  const entry = state.build.slots[slotId];
  const coreId = entry?.attributes ? Object.keys(entry.attributes).find(id => state.module.listCoreAttributes().some(core => core.id === id)) ?? null : null;
  state.picker = { slot, filter: 'all', query: '', selected: entry?.itemId ?? null, coreId, value: coreId ? entry.attributes[coreId] : null, opener: document.activeElement };
  renderPicker();
  $('#wbPicker').showModal();
  $('#wbSearch')?.focus();
}

function closePicker() {
  const dialog = $('#wbPicker');
  if (dialog.open) dialog.close();
  state.picker?.opener?.focus?.();
  state.picker = null;
}

function applyPicker() {
  const { slot, selected, coreId } = state.picker;
  const roll = $('#wbRoll');
  let result = state.adapter.equip(state.build, slot.id, selected, { attributes: state.build.slots[slot.id]?.itemId === selected ? state.build.slots[slot.id].attributes : undefined });
  if (!result.ok) { toast(result.reason); return; }
  if (coreId && roll && roll.value !== '') {
    const withRoll = state.adapter.setAttribute(result.build, slot.id, coreId, Number(roll.value));
    if (!withRoll.ok) { toast(withRoll.reason); return; }
    result = withRoll;
  }
  commit(result);
  closePicker();
}

/* ---------- Wiring ---------- */

function wireEditor() {
  const root = $('#wbRoot');
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.platform) { choosePlatform(target.dataset.platform); return; }
    if (target.id === 'wbDuplicate') {
      const copy = state.adapter.duplicate(state.build, state.platform);
      if (!copy.ok) { toast(copy.reason); return; }
      state.foreign = false;
      history.replaceState(null, '', location.pathname);
      commit(copy);
      toast(`Duplicated onto ${PLATFORM_LABELS[state.platform]} and saved on this device.`);
      return;
    }
    if ((target.dataset.openSlot || target.dataset.clearSlot || target.dataset.objective || target.id === 'wbSave' || target.id === 'wbNew') && !editable()) return;
    if (target.dataset.openSlot) openPicker(target.dataset.openSlot);
    else if (target.dataset.clearSlot) commit(state.adapter.unequip(state.build, target.dataset.clearSlot));
    else if (target.dataset.objective) commit(state.adapter.setObjective(state.build, state.build.objective === target.dataset.objective ? null : target.dataset.objective));
    else if (target.id === 'wbSave') toast(saveBuild(storage ?? { setItem() { throw new Error(); } }, state.build) ? 'Build saved on this device.' : 'This browser blocks saving. Use Share link to keep the build.');
    else if (target.id === 'wbNew') state.adapter.load({ platform: state.platform }).then(result => { if (commit(result)) toast('New build started.'); });
    else if (target.id === 'wbShare') {
      const link = shareLink(state.build, location.origin);
      history.replaceState(null, '', link.slice(location.origin.length));
      (navigator.clipboard?.writeText(link) ?? Promise.reject()).then(() => toast('Share link copied.'), () => toast('Share link is in the address bar.'));
    }
  });
  root.addEventListener('change', event => {
    if ((event.target.id === 'wbName' || event.target.id === 'wbSpecialization') && !editable()) { render(); return; }
    if (event.target.id === 'wbName') commit(state.adapter.rename(state.build, event.target.value.trim().slice(0, 80)));
    if (event.target.id === 'wbSpecialization' && event.target.value) commit(state.adapter.select(state.build, 'specialization', event.target.value));
  });

  const dialog = $('#wbPicker');
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closePicker(); return; }
    const target = event.target.closest('button');
    if (!target || !state.picker) return;
    if (target.hasAttribute('data-picker-close')) closePicker();
    else if (target.dataset.filter) { state.picker.filter = target.dataset.filter; renderPicker(); }
    else if (target.dataset.pick && !target.disabled) { state.picker.selected = target.dataset.pick; renderPicker(); }
    else if (target.dataset.core) { state.picker.coreId = state.picker.coreId === target.dataset.core ? null : target.dataset.core; state.picker.value = null; renderPicker(); }
    else if (target.id === 'wbApply') applyPicker();
  });
  dialog.addEventListener('input', event => {
    if (!state.picker) return;
    if (event.target.id === 'wbSearch') { state.picker.query = event.target.value; renderPicker(); }
    if (event.target.id === 'wbRoll') state.picker.value = event.target.value;
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
}

function wireShell() {
  const header = $('header.apx-destination-header');
  const apply = () => document.documentElement.style.setProperty('--ax-shell-top', `${header.offsetHeight}px`);
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(header);

  const menu = $('#wbMenu');
  const drawer = $('#wbDrawer');
  const panel = drawer.querySelector('.ax-drawer-panel');
  const focusable = () => [...panel.querySelectorAll('a[href],button:not([disabled])')];
  const setOpen = open => {
    if (open === !drawer.hidden) return;
    menu.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('ax-drawer-open', open);
    if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('is-open')); (panel.querySelector('[aria-current="page"]') ?? focusable()[0])?.focus(); }
    else { drawer.classList.remove('is-open'); drawer.hidden = true; menu.focus(); }
  };
  menu.addEventListener('click', () => setOpen(drawer.hidden));
  drawer.addEventListener('click', event => { if (event.target.closest('[data-drawer-close],.ax-drawer-links a')) setOpen(false); });
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'Tab') return;
    const items = focusable(), first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  matchMedia('(max-width:1199px)').addEventListener?.('change', event => { if (!event.matches) setOpen(false); });
}

async function start() {
  wireShell();
  const main = $('#wbMain');
  try {
    const catalogue = await loadCatalogue(TITLE);
    state.module = createDivisionModule(catalogue);
    state.adapter = createManualAdapter({ module: state.module, title: TITLE, catalogueVersion: catalogue.catalogueVersion });
    state.platform = loadPlatform(storage);
    const { build, notice, foreign } = await openingBuild({ search: location.search, storage, adapter: state.adapter, platform: state.platform });
    state.build = build;
    state.foreign = foreign;
    if (notice) { const node = $('#wbNotice'); node.textContent = notice; node.hidden = false; }
    render();
    wireEditor();
  } catch (error) {
    $('#wbRoot').innerHTML = `<div class="wb-panel wb-error" role="alert"><h2 class="wb-panel-title">The catalogue did not load</h2><p>${esc(error.message)}</p><button type="button" id="wbRetry">Try again</button></div>`;
    $('#wbRetry').addEventListener('click', () => location.reload());
  } finally {
    main.setAttribute('aria-busy', 'false');
    document.documentElement.dataset.workbenchReady = 'true';
    performance.mark?.('workbench-ready');
  }
}

start();
