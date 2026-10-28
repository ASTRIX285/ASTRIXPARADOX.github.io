/**
 * Atreia Atlas capture mode (feature/aetherium-map-capture, 28 Oct 2026), loaded only by /hub/aetherium/map/?capture=1 and
 * never linked from the site. Miguel plays with the map open beside the game: a click on the map drops a marker, the form
 * in the side panel (never over the map) asks for its layer, name, note, level and the game's coordinates when shown.
 * Markers stay on this device (localStorage) until exported as markers.json records. Undo, drag to move, delete.
 */
import { $, esc } from './aetherium-ui.mjs';
import { layerIcon } from './atlas-card.mjs';
import { markerProblems } from '../../games/aion2/engine/atlas-data.mjs';

const STORE_KEY = 'ae-atlas-capture';
const NAME_KEY = 'ae-atlas-captured-by';
const VERSION_KEY = 'ae-atlas-game-version';
const SOURCE_NOTE = 'Position read from the in-game map and placed on our base map of the zone.';
const LAYER_KEY = 'ae-atlas-capture-layer';
const UNDO_LIMIT = 50;

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const round = value => Math.round(value * 10000) / 10000;
const slug = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'marker';

/** One record in exactly the markers.json shape and key order. */
function record({ id, zone, layer, x, y, gameX, gameY, name, note, level, provenance }) {
  const out = { id, zone, layer, x: round(x), y: round(y) };
  if (Number.isFinite(gameX)) out.gameX = gameX;
  if (Number.isFinite(gameY)) out.gameY = gameY;
  out.name = name;
  if (note) out.note = note;
  if (Number.isInteger(level)) out.level = level;
  out.status = 'confirmed';
  out.provenance = { kind: 'in-game-capture', capturedBy: provenance.capturedBy, capturedOn: provenance.capturedOn, gameVersion: provenance.gameVersion, where: provenance.where, note: provenance.note };
  return out;
}

function sectionHtml(layers) {
  return `<section class="ae-atlas-capture" id="aeAtlasCapture" aria-labelledby="aeCapTitle">
    <h2 class="ae-atlas-capture-title" id="aeCapTitle">Capture mode</h2>
    <p class="ae-atlas-capture-help">Click the map where it is in game. Drag one of your markers to move it, click it to edit it.</p>
    <label class="ae-atlas-field"><span>Your name</span><input id="aeCapBy" type="text" maxlength="40" autocomplete="nickname" spellcheck="false"></label>
    <label class="ae-atlas-field"><span>Game version (as the game or patch notes name it)</span><input id="aeCapVersion" type="text" maxlength="60" autocomplete="off" spellcheck="false"></label>
    <div class="ae-atlas-capture-actions">
      <button class="ae-btn" type="button" id="aeCapUndo" disabled>Undo</button>
      <button class="ae-btn" type="button" id="aeCapCopy">Copy export</button>
      <button class="ae-btn" type="button" id="aeCapDownload">Download</button>
    </div>
    <p class="ae-atlas-capture-status" id="aeCapStatus" role="status"></p>
    <textarea class="ae-atlas-capture-out" id="aeCapOut" rows="6" readonly hidden aria-label="Exported markers"></textarea>
    <form class="ae-atlas-capture-form" id="aeCapForm" hidden novalidate>
      <h3 id="aeCapFormTitle">New marker</h3>
      <fieldset class="ae-atlas-cap-layers"><legend>Layer</legend>
        ${layers.map(layer => `<label class="ae-atlas-cap-layer"><input type="radio" name="layer" value="${esc(layer.id)}">${layerIcon(layer.icon, 28)}<span>${esc(layer.label)}</span></label>`).join('')}
      </fieldset>
      <label class="ae-atlas-field"><span>Name</span><input name="name" type="text" maxlength="80" required autocomplete="off"></label>
      <label class="ae-atlas-field"><span>Note (optional)</span><textarea name="note" rows="2" maxlength="300"></textarea></label>
      <div class="ae-atlas-field-row">
        <label class="ae-atlas-field"><span>Level</span><input name="level" type="number" min="1" step="1" inputmode="numeric"></label>
        <label class="ae-atlas-field"><span>Game X</span><input name="gameX" type="number" step="any" inputmode="decimal"></label>
        <label class="ae-atlas-field"><span>Game Y</span><input name="gameY" type="number" step="any" inputmode="decimal"></label>
      </div>
      <p class="ae-atlas-capture-error" id="aeCapError" role="alert" hidden></p>
      <div class="ae-atlas-capture-actions">
        <button class="ae-btn ae-atlas-cap-save" type="submit">Save</button>
        <button class="ae-btn" type="button" id="aeCapCancel">Cancel</button>
        <button class="ae-btn ae-atlas-cap-delete" type="button" id="aeCapDelete" hidden>Delete</button>
      </div>
    </form>
  </section>`;
}

export function startCapture({ panel, view, layers, zone: firstZone, takenIds, onChange }) {
  let zone = firstZone;
  let records = [];
  try { records = JSON.parse(read(STORE_KEY) || '[]'); } catch { records = []; }
  if (!Array.isArray(records)) records = [];
  const undo = [];
  let draft = null;

  document.body.classList.add('is-atlas-capture');
  panel.querySelector('.ae-atlas-panel-body').insertAdjacentHTML('afterbegin', sectionHtml(layers));
  const form = $('#aeCapForm');
  const byInput = $('#aeCapBy');
  byInput.value = read(NAME_KEY) ?? '';
  byInput.addEventListener('change', () => { byInput.value = byInput.value.trim(); write(NAME_KEY, byInput.value); });
  const versionInput = $('#aeCapVersion');
  versionInput.value = read(VERSION_KEY) ?? '';
  versionInput.addEventListener('change', () => { versionInput.value = versionInput.value.trim(); write(VERSION_KEY, versionInput.value); });

  /* The spot being marked: a ghost pin on the map until the form is saved or cancelled. */
  const ghost = document.createElement('span');
  ghost.className = 'ae-atlas-ghost';
  ghost.hidden = true;
  $('#aeAtlasMarkers').append(ghost);
  const placeGhost = () => {
    if (!draft) { ghost.hidden = true; return; }
    const at = view.toView(draft.x, draft.y);
    ghost.hidden = false;
    ghost.style.left = `${at.x}px`;
    ghost.style.top = `${at.y}px`;
  };
  view.onChange(placeGhost);

  const status = text => { $('#aeCapStatus').textContent = text; };
  const save = () => {
    if (!write(STORE_KEY, JSON.stringify(records))) status('This browser would not keep the markers. Export them before you close the page.');
    $('#aeCapUndo').disabled = !undo.length;
    onChange();
  };
  const change = fn => {
    undo.push(JSON.stringify(records));
    if (undo.length > UNDO_LIMIT) undo.shift();
    fn();
    save();
  };
  const freeId = (name, layer) => {
    const taken = takenIds();
    for (const marker of records) taken.add(marker.id);
    const stem = `${zone.id}-${layer}-${slug(name)}`;
    let id = stem;
    for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
    return id;
  };

  function openForm(next) {
    draft = next;
    const editing = Boolean(next.id);
    $('#aeCapFormTitle').textContent = editing ? `Edit ${next.name}` : 'New marker';
    const layer = next.layer ?? read(LAYER_KEY) ?? layers[0].id;
    for (const input of form.elements.layer) input.checked = input.value === layer;
    form.elements.name.value = next.name ?? '';
    form.elements.note.value = next.note ?? '';
    form.elements.level.value = next.level ?? '';
    form.elements.gameX.value = next.gameX ?? '';
    form.elements.gameY.value = next.gameY ?? '';
    $('#aeCapDelete').hidden = !editing;
    $('#aeCapError').hidden = true;
    form.hidden = false;
    placeGhost();
    /* A phone's bottom sheet covers the lower map: bring the spot up into view. */
    if (getComputedStyle(panel).position === 'fixed') {
      $('#aeAtlasSheet')?.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      const at = view.toView(next.x, next.y);
      view.panBy(0, $('#aeAtlasView').clientHeight * 0.25 - at.y);
    }
    form.elements.name.focus({ preventScroll: true });
  }
  function closeForm() {
    draft = null;
    form.hidden = true;
    placeGhost();
  }
  const fail = text => { $('#aeCapError').textContent = text; $('#aeCapError').hidden = false; };

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!draft) return;
    const capturedBy = byInput.value.trim();
    const layer = form.elements.layer.value;
    const name = form.elements.name.value.trim();
    const note = form.elements.note.value.trim();
    const num = key => { const raw = form.elements[key].value.trim(); return raw === '' ? undefined : Number(raw); };
    const level = num('level'), gameX = num('gameX'), gameY = num('gameY');
    const gameVersion = versionInput.value.trim();
    if (!capturedBy) { fail('Type your name at the top first.'); byInput.focus(); return; }
    if (!gameVersion) { fail('Type the game version at the top first.'); versionInput.focus(); return; }
    if (!layer) { fail('Pick a layer.'); return; }
    if (!name) { fail('Give it a name, as the game shows it.'); form.elements.name.focus(); return; }
    if (level !== undefined && !(Number.isInteger(level) && level >= 1)) { fail('Level is a whole number from 1.'); return; }
    if ([gameX, gameY].some(value => value !== undefined && !Number.isFinite(value))) { fail('Game X and Y are numbers.'); return; }
    write(NAME_KEY, capturedBy);
    write(VERSION_KEY, gameVersion);
    write(LAYER_KEY, layer);
    const editing = draft.id;
    const next = record({
      id: editing || freeId(name, layer), zone: draft.zone, layer, x: draft.x, y: draft.y, gameX, gameY, name, note, level,
      provenance: { capturedBy, capturedOn: draft.provenance?.capturedOn ?? today(), gameVersion: draft.provenance?.gameVersion ?? gameVersion, where: draft.provenance?.where ?? `in game, ${zone.name}`, note: draft.provenance?.note ?? SOURCE_NOTE }
    });
    change(() => {
      if (editing) records = records.map(marker => marker.id === editing ? next : marker);
      else records.push(next);
    });
    status(editing ? `Saved ${name}.` : `Added ${name}. ${records.length} on this device.`);
    closeForm();
  });
  $('#aeCapCancel').addEventListener('click', closeForm);
  $('#aeCapDelete').addEventListener('click', () => {
    const id = draft?.id;
    if (!id) return;
    const gone = records.find(marker => marker.id === id);
    change(() => { records = records.filter(marker => marker.id !== id); });
    status(`Deleted ${gone?.name ?? id}. Undo brings it back.`);
    closeForm();
  });
  const undoLast = () => {
    if (!undo.length) return;
    records = JSON.parse(undo.pop());
    closeForm();
    save();
    status('Undone.');
  };
  $('#aeCapUndo').addEventListener('click', undoLast);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input, textarea')) { event.preventDefault(); undoLast(); }
    if (event.key === 'Escape' && draft) closeForm();
  });

  /* Export: every marker on this device, checked, as markers.json records. */
  function exportText() {
    if (!records.length) { status('Nothing to export yet.'); return null; }
    const zoneIds = new Set([zone.id, ...records.map(marker => marker.zone)]);
    const layerIds = new Set(layers.map(layer => layer.id));
    const problems = records.flatMap(marker => markerProblems(marker, zoneIds, layerIds));
    if (problems.length) { status(`Fix these first: ${problems.join('; ')}`); return null; }
    return `${JSON.stringify({ records }, null, 2)}\n`;
  }
  const out = $('#aeCapOut');
  $('#aeCapCopy').addEventListener('click', async () => {
    const text = exportText();
    if (!text) return;
    out.value = text;
    out.hidden = false;
    try {
      await navigator.clipboard.writeText(text);
      status(`Copied ${records.length} marker${records.length === 1 ? '' : 's'}. Paste them into the chat to load them into the map.`);
    } catch {
      out.focus();
      out.select();
      status('Copy did not work here. The export is selected below: press Ctrl+C.');
    }
  });
  $('#aeCapDownload').addEventListener('click', () => {
    const text = exportText();
    if (!text) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = `atlas-markers-${today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status(`Downloaded ${records.length} marker${records.length === 1 ? '' : 's'}.`);
  });

  save();
  status(records.length ? `${records.length} marker${records.length === 1 ? '' : 's'} on this device.` : 'No markers on this device yet.');

  return {
    records: () => records,
    owns: id => records.some(marker => marker.id === id),
    drop(x, y) {
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      openForm({ zone: zone.id, x, y });
    },
    edit(id) {
      const marker = records.find(item => item.id === id);
      if (marker) openForm({ ...marker });
    },
    move(id, x, y) {
      const marker = records.find(item => item.id === id);
      if (!marker) return;
      change(() => { records = records.map(item => item.id === id ? { ...item, x: round(x), y: round(y) } : item); });
      if (draft?.id === id) { draft.x = round(x); draft.y = round(y); placeGhost(); }
      status(`Moved ${marker.name}.`);
    },
    zoneChanged(next) { zone = next; closeForm(); }
  };
}
