/**
 * Gear Ledger (The Aetherium): the full setup of one Daeva. Gear with an item detail card,
 * stigmas, Daevanion boards (open or locked from the data), stats, pet and wings.
 */
import { ArmoryUnavailable, loadBoard, loadCharacter, loadItemDetail, refFromUrl, roster } from './aetherium-data.mjs';
import { $, esc, iconImg, isPending, markCharacterShown, markReady, number, setFaction, showNotice, showSource, slotLabel, wireDrawer } from './aetherium-ui.mjs';

const PRIMARY_STATS = ['STR', 'DEX', 'INT', 'CON', 'AGI', 'WIS'];
const state = { model: null, source: null, selected: null, boards: new Map() };

const enchantText = slot => `+${slot.enchant}${isPending(slot.maxEnchant) ? '' : ` of ${slot.maxEnchant}`}`;

function renderHeader() {
  const p = state.model.profile;
  $('#aeHeader').innerHTML = `
    <div>
      <h1 class="ae-name">${esc(p.name)}</h1>
      <p class="ae-subline">${[p.title, `${p.class} Lv ${p.level}`, p.raceName, p.server.name].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="ae-figures"><span>Combat power <b>${number(p.combatPower)}</b></span><span>Item level <b>${isPending(p.itemLevel) ? '-' : number(p.itemLevel)}</b></span></p>
    </div>
    <a class="btn" href="/hub/aetherium/">Back to Daeva Card</a>`;
}

function renderGear() {
  const { gear } = state.model;
  $('#aeGearCount').textContent = `${gear.filter(slot => !slot.empty).length} of ${gear.length} worn`;
  $('#aeGear').innerHTML = gear.map((slot, index) => slot.empty
    ? `<li><div class="ae-slot is-empty"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>Empty</strong></div></li>`
    : `<li><button type="button" class="ae-slot" data-slot="${index}" data-grade="${esc(String(slot.grade).toLowerCase())}" aria-pressed="false" aria-controls="aeItem">
        ${iconImg(slot.icon, '', 52)}
        <span class="ae-slot-text"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>${esc(slot.name)}</strong><span class="ae-slot-meta">${esc(slot.grade)} · ${esc(enchantText(slot))}</span></span>
      </button></li>`).join('');
  const accessories = state.model.accessorySlots;
  $('#aeAccessories').textContent = isPending(accessories)
    ? 'Accessories: none worn. The armory only lists an accessory slot once something is worn in it.'
    : `Accessories: ${accessories.filter(slot => !slot.empty).length} worn.`;
}

async function selectSlot(index) {
  const slot = state.model.gear[index];
  state.selected = index;
  document.querySelectorAll('[data-slot]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.slot) === index)));
  const el = $('#aeItem');
  el.innerHTML = `<p class="ae-muted">Reading ${esc(slot.name)}.</p>`;
  let result;
  try {
    result = await loadItemDetail(state.model, slot, state.source);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    result = { detail: null, reason: 'The armory is unavailable right now. Try this item again in a minute.' };
  }
  if (state.selected !== index) return;
  if (!result.detail) {
    el.innerHTML = `<div class="ae-item-head">${iconImg(slot.icon, '', 56)}<div><p class="ae-slot-label">${esc(slotLabel(slot.slot))}</p><h3>${esc(slot.name)}</h3><p class="ae-muted">${esc(slot.grade)} · ${esc(enchantText(slot))}</p></div></div><p class="ae-muted">${esc(result.reason)}</p>`;
    return;
  }
  const d = result.detail;
  // The detail call is the only source of max enchant and manastone slots: keep them on the slot tile too.
  if (!isPending(d.maxEnchant)) slot.maxEnchant = d.maxEnchant;
  if (!isPending(d.manastoneSlots)) slot.manastoneSlots = d.manastoneSlots;
  const meta = document.querySelector(`[data-slot="${index}"] .ae-slot-meta`);
  if (meta) meta.textContent = `${slot.grade} · ${enchantText(slot)}`;
  const rows = list => list.map(row => `<tr><th scope="row">${esc(row.name)}</th><td>${esc(row.value)}${row.extra ? ` <span class="ae-plus">+${esc(row.extra)}</span>` : ''}</td></tr>`).join('');
  el.innerHTML = `
    <div class="ae-item-head" data-grade="${esc(String(d.grade).toLowerCase())}">${iconImg(d.icon, '', 56)}
      <div><p class="ae-slot-label">${esc(slotLabel(slot.slot))}${d.category ? ` · ${esc(d.category)}` : ''}</p><h3>${esc(d.name)}</h3>
      <p class="ae-muted">${esc(d.grade)}${d.level ? ` · Item level ${esc(d.level)}` : ''}</p></div></div>
    <dl class="ae-item-facts">
      <div><dt>Enchant</dt><dd>+${esc(d.enchant)}${isPending(d.maxEnchant) ? '' : ` of ${esc(d.maxEnchant)}`}</dd></div>
      <div><dt>Manastone slots</dt><dd>${isPending(d.manastoneSlots) ? '-' : esc(d.manastoneSlots)}</dd></div>
      ${d.soulBindRate ? `<div><dt>Soul binding</dt><dd>${esc(d.soulBindRate)}%</dd></div>` : ''}
      ${d.sources.length ? `<div><dt>Comes from</dt><dd>${d.sources.map(esc).join(', ')}</dd></div>` : ''}
    </dl>
    ${d.mainStats.length ? `<table class="ae-item-stats"><caption>Main stats</caption><tbody>${rows(d.mainStats)}</tbody></table>` : ''}
    ${d.subStats.length ? `<table class="ae-item-stats"><caption>Sub stats</caption><tbody>${rows(d.subStats)}</tbody></table>` : ''}`;
}

function renderSide() {
  const { model } = state;
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const lockedLevel = Math.min(...stigmas.filter(skill => !skill.acquired).map(skill => skill.needLevel));
  $('#aeStigmaNote').textContent = stigmas.every(skill => !skill.acquired)
    ? `${stigmas.length} stigmas · unlock at Lv ${lockedLevel}`
    : `${stigmas.filter(skill => skill.acquired).length} of ${stigmas.length} stigmas unlocked`;
  $('#aeStigmas').innerHTML = stigmas.map(skill => `<li class="ae-stigma${skill.acquired ? '' : ' is-locked'}">
      ${iconImg(skill.icon, '', 36)}<span><strong>${esc(skill.name)}</strong><small>${skill.acquired ? `Skill Lv ${esc(skill.skillLevel)}` : `Unlocks at Lv ${esc(skill.needLevel)}`}</small></span>
    </li>`).join('');

  $('#aeBoards').innerHTML = model.daevanion.map(board => {
    const pct = board.nodesTotal ? Math.round((board.nodesTaken / board.nodesTotal) * 100) : 0;
    return `<li class="ae-board${board.open ? ' is-open' : ' is-locked'}">
      <details data-board="${esc(board.id)}">
        <summary>
          <span class="ae-board-row"><span class="ae-board-name">${esc(board.name)}</span><span class="ae-board-state">${board.open ? 'Open' : 'Locked'}</span><span class="ae-board-count">${board.nodesTaken} / ${board.nodesTotal}</span></span>
          <span class="ae-bar" role="img" aria-label="${esc(board.name)}: ${board.nodesTaken} of ${board.nodesTotal} nodes taken"><span style="width:${pct}%"></span></span>
        </summary>
        <div class="ae-board-nodes" data-board-nodes></div>
      </details>
    </li>`;
  }).join('');

  const primary = model.stats.filter(row => PRIMARY_STATS.includes(row.type));
  $('#aeStats').innerHTML = primary.map(row => `<div class="ae-stat"><dt>${esc(row.name)}</dt><dd>${number(row.value)}</dd></div>`).join('');

  const extra = [];
  if (!isPending(model.pet)) extra.push(`<li class="ae-extra">${iconImg(model.pet.icon, '', 40)}<span><small>Pet</small><strong>${esc(model.pet.name)}</strong><small>Lv ${esc(model.pet.level)}</small></span></li>`);
  if (!isPending(model.wings)) extra.push(`<li class="ae-extra">${iconImg(model.wings.icon, '', 40)}<span><small>Wings</small><strong>${esc(model.wings.name)}</strong><small>${esc(model.wings.grade)} · +${esc(model.wings.enchant)}</small></span></li>`);
  if (model.profile.title) extra.push(`<li class="ae-extra"><span class="ae-icon ae-icon-empty" aria-hidden="true"></span><span><small>Title</small><strong>${esc(model.profile.title)}</strong></span></li>`);
  $('#aeExtras').innerHTML = extra.join('');
}

/** Board node grids load only when a board is opened, one request per board, kept for the visit. */
async function openBoard(details) {
  const board = state.model.daevanion.find(item => String(item.id) === details.dataset.board);
  const el = details.querySelector('[data-board-nodes]');
  if (!board || state.boards.has(board.id)) return;
  state.boards.set(board.id, true);
  el.innerHTML = '<p class="ae-muted">Reading the board.</p>';
  let result;
  try {
    result = await loadBoard(state.model, board, state.source);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    state.boards.delete(board.id);
    result = { nodes: null, reason: 'The armory is unavailable right now. Close and reopen the board to try again.' };
  }
  if (!result.nodes) { el.innerHTML = `<p class="ae-muted">${esc(result.reason)}</p>`; return; }
  const taken = result.nodes.filter(node => node.taken);
  const counts = new Map();
  for (const node of result.nodes) for (const effect of node.effects) counts.set(effect, (counts.get(effect) ?? 0) + 1);
  const summary = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  el.innerHTML = `
    <p class="ae-muted">${taken.length ? `${taken.length} nodes taken: ${taken.map(node => esc(node.name)).join(', ')}.` : 'No nodes taken yet.'}</p>
    ${summary.length ? `<p class="ae-slot-label">Most common node effects</p><ul class="ae-node-effects">${summary.map(([effect, count]) => `<li><span>${esc(effect)}</span><b>${count}</b></li>`).join('')}</ul>` : ''}`;
}

function render(model, source) {
  Object.assign(state, { model, source, selected: null });
  setFaction(model.profile.raceName);
  showSource(source);
  renderHeader();
  renderGear();
  renderSide();
  markCharacterShown();
  $('#aeItem').innerHTML = '<p class="ae-muted">Pick a gear slot to see its stats, enchant and where it comes from.</p>';
}

async function start() {
  wireDrawer();
  setFaction(null);
  $('#aeBoards').addEventListener('toggle', event => {
    if (event.target.matches?.('details[data-board]') && event.target.open) openBoard(event.target);
  }, true);
  $('#aeGear').addEventListener('click', event => {
    const button = event.target.closest('[data-slot]');
    if (button) selectSlot(Number(button.dataset.slot));
  });
  const active = roster.active();
  const ref = refFromUrl() ?? (active ? { serverId: active.serverId, characterId: active.characterId } : null);
  try {
    const { model, source } = await loadCharacter(ref);
    render(model, source);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    showNotice('The armory is unavailable right now, so this shows the ASTRIX285 example. Try again in a minute.', 'warn');
    const { model, source } = await loadCharacter(null, { demoReason: 'unavailable' });
    render(model, source);
  }
  markReady();
}

start().catch(error => {
  showNotice('The Gear Ledger could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
});
