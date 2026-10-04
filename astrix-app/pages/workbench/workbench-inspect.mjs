/**
 * WorkBench inspect view (screen N): agent summary on the left, the player's own rolled items for
 * the slot in the middle with compare arrows against the equipped item, and the info card on the
 * right. Markup only; workbench.mjs wires the events. Every value comes from the build, the
 * player's items or the catalogue. Anything not sourced shows PENDING.
 */
import { PLATFORM_LABELS } from '../../core/build-format/build.mjs';
import { agentSummary, compareInstance, itemsForSlot, sameInstance } from './workbench-state.mjs';

export const RARITY_LABELS = Object.freeze({ 'high-end': 'High-end', 'gear-set': 'Gear set', named: 'Named', exotic: 'Exotic' });
const FILTER_TYPES = Object.freeze({ brand: 'high-end', 'gear-set': 'gear-set', named: 'named', exotic: 'exotic' });
export const FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'high-end', label: 'Brand sets' },
  { id: 'gear-set', label: 'Gear sets' },
  { id: 'named', label: 'Named' },
  { id: 'exotic', label: 'Exotic' }
]);

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const tag = text => `<span class="wb-tag">${esc(text)}</span>`;
const pendingNote = reason => `<p class="wb-pending">${tag('PENDING')}<span>${esc(reason)}</span></p>`;
const unitText = unit => (unit === 'percent' ? '%' : unit === 'tier' ? ' tier' : unit === 'seconds' ? 's' : '');
const ARROWS = Object.freeze({ up: ['wb-up', 'Higher than equipped'], down: ['wb-down', 'Lower than equipped'], same: ['wb-same', 'Same as equipped'] });

function recordName(module, itemId) {
  const record = module.resolveItem(itemId);
  return isPending(record) ? itemId : record.name;
}

function attributeName(module, attributeId) {
  return module.listAttributes().find(record => record.id === attributeId)?.name ?? attributeId;
}

/* ---------- Left: agent summary ---------- */

function summaryColumn(build, module) {
  const summary = agentSummary(build, module);
  return `<aside class="wb-inspect-summary" aria-label="Agent summary">
    <p class="wb-inspect-agent">${esc(build.name || 'This build')}</p>
    <p class="wb-small">Platform: ${esc(PLATFORM_LABELS[build.platform])}</p>
    <ul class="wb-core-dots" aria-label="Core attributes">${summary.cores.map(core => `<li class="wb-core wb-core-${esc(core.id)}"><span>${esc(core.name)}</span><strong>${core.count}</strong></li>`).join('')}</ul>
    <dl class="wb-inspect-stats">${summary.stats.map(stat => `<div><dt>${esc(stat.label)}</dt><dd>${isPending(stat.value) ? `<span class="wb-dash" title="${esc(stat.value.reason)}">PENDING</span>` : esc(stat.value)}</dd></div>`).join('')}</dl>
    <p class="wb-small">Damage, armor and health come from the calculation engine, which comes next.</p>
  </aside>`;
}

/* ---------- Middle: your items and the catalogue ---------- */

function itemRow(row, module, equipped, selectedKey) {
  const rules = module.itemRules(row.entry.itemId);
  const kind = isPending(rules) ? 'pending' : rules.kind;
  const compare = compareInstance(row.entry, equipped);
  const isEquipped = sameInstance(row.entry, equipped);
  const stats = compare.length ? compare.map(stat => {
    const arrow = stat.arrow && !isEquipped ? ARROWS[stat.arrow] : null;
    return `<span class="wb-stat"><small>${esc(attributeName(module, stat.id))}</small>${esc(stat.value)}${arrow ? `<span class="wb-arrow ${arrow[0]}" aria-label="${arrow[1]}"></span>` : ''}</span>`;
  }).join('') : '<span class="wb-small">No rolls entered</span>';
  return `<li><button type="button" class="wb-item wb-rarity-${esc(kind)}" data-select-item="${esc(row.key)}" aria-pressed="${selectedKey === row.key}">
    <span class="wb-rarity-bar" aria-hidden="true"></span><span class="wb-item-main"><span class="wb-item-name">${esc(recordName(module, row.entry.itemId))}</span><span class="wb-item-kind">${esc(RARITY_LABELS[kind] ?? 'Pending')}${isEquipped ? ' · Equipped' : ''}</span></span>
    <span class="wb-item-stats">${stats}</span>
  </button></li>`;
}

function catalogueList(slot, module, view) {
  const options = module.listOptions(slot.id)
    .map(row => ({ ...row, kind: FILTER_TYPES[row.type] ?? row.type }))
    .filter(row => view.filter === 'all' || row.kind === view.filter)
    .filter(row => !view.query || row.name.toLowerCase().includes(view.query.toLowerCase()));
  const anyOptions = module.listOptions(slot.id).length > 0;
  const list = options.length
    ? `<ul class="wb-options">${options.map(row => `<li><button type="button" class="wb-option wb-rarity-${esc(row.kind)}" data-new-item="${esc(row.id)}" ${row.equippable ? '' : 'disabled aria-disabled="true"'}>
        <span class="wb-rarity-bar" aria-hidden="true"></span><span class="wb-option-name">${esc(row.name)}</span><span class="wb-option-type">${esc(RARITY_LABELS[row.kind] ?? row.kind)}</span>
        ${row.equippable ? '' : `${tag('PENDING')}<span class="wb-option-reason">${esc(row.reason)}</span>`}
      </button></li>`).join('')}</ul>`
    : `<p class="wb-empty">${anyOptions ? 'Nothing matches that search.' : `No sourced items for ${esc(slot.name)} yet. Items appear here as they are added to the catalogue.`}</p>`;
  return `<section class="wb-add" aria-labelledby="wbAddTitle">
    <h3 class="wb-section-label" id="wbAddTitle">Add an item from the catalogue</h3>
    <label class="wb-field"><span>Search</span><input id="wbSearch" type="search" autocomplete="off" placeholder="Brands, sets, named, exotics" value="${esc(view.query)}"></label>
    <div class="wb-filters" role="group" aria-label="Filter">${FILTERS.map(row => `<button type="button" class="wb-chip" data-filter="${row.id}" aria-pressed="${view.filter === row.id}">${row.label}</button>`).join('')}</div>
    ${list}
  </section>`;
}

function itemsColumn(slot, module, build, items, view) {
  const equipped = build.slots[slot.id] ?? null;
  const mine = itemsForSlot(items, slot.id);
  const rows = mine.length
    ? `<ul class="wb-items">${mine.map(row => itemRow(row, module, equipped, view.selectedKey)).join('')}</ul><p class="wb-small">Arrows compare each roll with the item you have equipped now.</p>`
    : `<p class="wb-empty">You have no ${esc(slot.name.toLowerCase())} items yet. Add one from the catalogue below and enter its rolls.</p>`;
  return `<div class="wb-inspect-items">
    <h3 class="wb-section-label">${esc(slot.name)} · Your items (each one rolled differently)</h3>
    ${rows}
    ${catalogueList(slot, module, view)}
  </div>`;
}

/* ---------- Right: info card and roll editor ---------- */

function rollBar(module, attributeId, value) {
  const range = module.attributeRange(attributeId);
  const name = attributeName(module, attributeId);
  if (isPending(range)) return `<div class="wb-roll-row"><span>${esc(name)} ${esc(value)}</span>${pendingNote(range.reason)}</div>`;
  const share = range.max === range.min ? 1 : Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return `<div class="wb-roll-row"><span>${esc(name)} <strong>${esc(value)}${unitText(range.unit)}</strong> <small>max ${esc(range.max)}${unitText(range.unit)}</small></span>
    <span class="wb-bar" role="img" aria-label="${esc(name)} ${esc(value)} of ${esc(range.max)}"><span style="width:${Math.round(share * 100)}%"></span></span></div>`;
}

function talentBlock(module, entry, rules) {
  const talentId = rules.fixed || rules.lockedTalentId ? (module.resolveItem(entry.itemId).talentId ?? entry.talentId) : entry.talentId;
  if (!talentId || isPending(talentId)) return rules.fixed ? pendingNote('This exotic talent is not in the catalogue yet.') : '<p class="wb-small">No talent entered.</p>';
  const talent = module.resolveTalent(talentId);
  if (isPending(talent)) return pendingNote(talent.reason);
  const effect = isPending(talent.effect) || !talent.effect ? pendingNote(talent.effect?.reason ?? 'The full talent text is not in the catalogue yet.') : `<p>${esc(talent.effect)}</p>`;
  const lockNote = rules.fixed ? 'Fixed on this exotic.' : rules.lockedTalentId ? 'Locked on this named item.' : '';
  return `<p class="wb-talent-name">${esc(talent.name)}</p>${effect}${lockNote ? `<p class="wb-small">${lockNote}</p>` : ''}`;
}

function infoCard(slot, module, entry, view) {
  const record = module.resolveItem(entry.itemId);
  if (isPending(record)) return `<div class="wb-card">${pendingNote(record.reason)}</div>`;
  const rules = module.itemRules(entry.itemId);
  const kind = rules.kind;
  const isSaved = Boolean(view.selectedKey);
  const coreBlock = rules.fixed
    ? '<p class="wb-small">Exotic: core attribute and attributes are fixed, as in the game.</p>'
    : entry.core ? rollBar(module, entry.core.attributeId, entry.core.value) : '<p class="wb-small">No core attribute entered.</p>';
  const attributeBlock = rules.fixed ? '' : Object.keys(entry.attributes ?? {}).length
    ? Object.entries(entry.attributes).map(([id, value]) => rollBar(module, id, value)).join('')
    : '<p class="wb-small">No attribute rolls entered.</p>';
  const modsBlock = (entry.modIds ?? []).length
    ? `<ul class="wb-mods">${entry.modIds.map(id => { const mod = module.resolveMod(id); return `<li>${esc(isPending(mod) ? id : mod.name)}</li>`; }).join('')}</ul>`
    : '<p class="wb-small">No mods entered.</p>';
  const editing = view.editing ? rollEditor(slot, module, view.draft, rules) : '';
  return `<article class="wb-card wb-rarity-${esc(kind)}" aria-labelledby="wbCardTitle">
    <header class="wb-card-head">
      <div><h3 id="wbCardTitle">${esc(record.name)}</h3><p class="wb-card-rarity">${esc(RARITY_LABELS[kind])}</p><p class="wb-card-type">${esc(slot.name)}</p></div>
      <div class="wb-card-level"><small>Level</small><strong>${entry.itemLevel ?? 'PENDING'}</strong></div>
    </header>
    <section><h4>Core attribute</h4>${coreBlock}</section>
    ${rules.fixed ? '' : `<section><h4>Attributes <small>(your roll against the max)</small></h4>${attributeBlock}</section>`}
    <section><h4>Talent</h4>${talentBlock(module, entry, rules)}</section>
    <section><h4>Mods</h4>${modsBlock}</section>
    <section><h4>Expertise</h4><p>${entry.expertise === undefined ? '<span class="wb-small">Not entered</span>' : `Level ${esc(entry.expertise)}`}</p></section>
    <section><h4>Where to get it</h4>${pendingNote('Drop sources are not in the catalogue yet. They are added from official posts.')}</section>
    ${editing}
    <footer class="wb-card-actions">
      <button type="button" class="wb-primary" id="wbEquip">Equip in build</button>
      ${view.editing ? '' : `<button type="button" id="wbEditRolls">${rules.fixed ? 'Edit mods and expertise' : 'Edit rolls'}</button>`}
      ${isSaved && !view.editing ? '<button type="button" id="wbRemoveItem">Remove from your items</button>' : ''}
    </footer>
  </article>`;
}

/** The roll editor. Exotics only get mods, expertise and item level, as the game fixes the rest. */
export function rollEditor(slot, module, draft, rules) {
  const cores = module.listAttributes('core');
  const secondary = module.listAttributes('secondary');
  const rangeHint = id => { const range = module.attributeRange(id); return isPending(range) ? 'range pending' : `${range.min} to ${range.max}${unitText(range.unit)}`; };
  const number = (id, label, value, hint, attrs = '') => `<label class="wb-field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ''}</span><input id="${id}" type="number" inputmode="decimal" step="any" value="${esc(value ?? '')}" ${attrs}></label>`;
  const parts = [];
  if (!rules.fixed) {
    parts.push(`<div class="wb-field"><span>Core attribute</span><div class="wb-filters" role="group" aria-label="Core attribute">${cores.map(core => `<button type="button" class="wb-chip" data-draft-core="${esc(core.id)}" aria-pressed="${draft.core?.attributeId === core.id}">${esc(core.name)}</button>`).join('')}</div></div>`);
    if (draft.core) parts.push(number('wbDraftCore', `${attributeName(module, draft.core.attributeId)} roll`, draft.core.value, rangeHint(draft.core.attributeId)));
    const locked = rules.lockedAttribute;
    const rows = secondary.map(attribute => {
      if (locked?.attributeId === attribute.id) return `<p class="wb-small">${esc(attribute.name)} is locked on this named item${isPending(locked.value) ? '.' : ` at ${esc(locked.value)}${unitText(locked.unit)}.`}</p>`;
      return number(`wbDraftAttr-${attribute.id}`, attribute.name, draft.attributes?.[attribute.id], rangeHint(attribute.id), `data-draft-attr="${esc(attribute.id)}"`);
    });
    parts.push(secondary.length ? `<div class="wb-draft-attrs">${rows.join('')}</div>` : pendingNote('No secondary attributes are in the catalogue yet.'));
    if (rules.lockedTalentId) parts.push('<p class="wb-small">The talent is locked on this named item.</p>');
    else {
      const talents = module.listTalents('gear');
      parts.push(talents.length
        ? `<label class="wb-field"><span>Talent</span><select id="wbDraftTalent"><option value="">None</option>${talents.map(talent => `<option value="${esc(talent.id)}"${draft.talentId === talent.id ? ' selected' : ''}>${esc(talent.name)}</option>`).join('')}</select></label>`
        : pendingNote('No gear talents are in the catalogue yet.'));
    }
  } else {
    parts.push('<p class="wb-small">Exotic: talent and attributes are fixed. Only mods, expertise and item level are kept.</p>');
  }
  const mods = module.listMods('gear');
  parts.push(mods.length
    ? `<fieldset class="wb-field"><legend>Mods</legend>${mods.map(mod => `<label class="wb-check"><input type="checkbox" data-draft-mod="${esc(mod.id)}"${(draft.modIds ?? []).includes(mod.id) ? ' checked' : ''}> ${esc(mod.name)}</label>`).join('')}</fieldset>`
    : pendingNote('No gear mods are in the catalogue yet.'));
  parts.push(number('wbDraftExpertise', 'Expertise level', draft.expertise, '', 'min="0" step="1"'));
  parts.push(number('wbDraftLevel', 'Item level', draft.itemLevel, '', 'min="0" step="1"'));
  return `<section class="wb-editor" aria-label="Roll editor"><h4>${rules.fixed ? 'Mods and expertise' : 'Roll editor'}</h4>${parts.join('')}
    <p class="wb-small">Rolls must sit inside the catalogue min and max. A roll with no sourced range cannot be entered.</p>
    <div class="wb-card-actions"><button type="button" class="wb-primary" id="wbSaveItem">Save item</button><button type="button" id="wbCancelEdit">Cancel</button></div></section>`;
}

/** The whole inspect view for one slot. */
export function inspectMarkup({ slot, module, build, items, view }) {
  const selected = view.selectedKey ? items.find(row => row.key === view.selectedKey)?.entry : view.draft;
  const card = selected
    ? infoCard(slot, module, view.editing ? view.draft : selected, view)
    : '<div class="wb-card wb-card-empty"><p class="wb-small">Pick one of your items, or add one from the catalogue, to see its info card.</p></div>';
  return `<div class="wb-inspect-inner">
    <header class="wb-picker-head"><h2 id="wbPickerTitle">${esc(slot.name)}</h2><button type="button" class="ax-icon-btn" data-picker-close aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="wb-inspect-body">
      ${summaryColumn(build, module)}
      ${itemsColumn(slot, module, build, items, view)}
      <div class="wb-inspect-card">${card}</div>
    </div>
  </div>`;
}
