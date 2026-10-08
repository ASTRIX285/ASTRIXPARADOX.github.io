/**
 * Gear Ledger (The Aetherium): the full setup of one Daeva. Tap a gear slot for its item card (like the
 * game's tooltip: stats, enchant, skill perks, manastone slots, where it comes from),
 * stigmas, Daevanion boards (open or locked from the data), stats, pet and wings.
 */
import { ArmoryUnavailable, loadBoard, loadCatalogue, loadCharacter, loadItemDetail, refFromUrl, roster } from './aetherium-data.mjs';
import { $, esc, iconImg, infoCardHtml, isPending, markCharacterShown, markReady, number, openInfo, setFaction, showNotice, showSource, slotLabel, wireDrawer } from './aetherium-ui.mjs';

const PRIMARY_STATS = ['STR', 'DEX', 'INT', 'CON', 'AGI', 'WIS'];
const state = { model: null, source: null, selected: null, boards: new Map(), listedSlots: new Set() };

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
    : `<li><button type="button" class="ae-slot" data-slot="${index}" data-grade="${esc(String(slot.grade).toLowerCase())}" aria-haspopup="dialog">
        ${iconImg(slot.icon, '', 52)}
        <span class="ae-slot-text"><span class="ae-slot-label">${esc(slotLabel(slot.slot))}</span><strong>${esc(slot.name)}</strong><span class="ae-slot-meta">${esc(slot.grade)} · ${esc(enchantText(slot))}</span></span>
      </button></li>`).join('');
  const accessories = state.model.accessorySlots;
  // Slots outside the slot list (cape, belt, accessories) only reach the armory once something is worn there.
  const extra = gear.filter(slot => !state.listedSlots.has(slot.slotPos)).length;
  $('#aeAccessories').textContent = !isPending(accessories)
    ? `Accessories: ${accessories.filter(slot => !slot.empty).length} worn.`
    : extra
      ? 'Other slots, such as accessories, show here once something is worn in them.'
      : 'Accessories: none worn. The armory only lists an accessory slot once something is worn in it.';
}

/** The item card body: everything the armory gives for one worn item, laid out like the game's tooltip. */
function itemCardBody(slot, d) {
  const rows = list => list.map(row => `<li><span>${esc(row.name)}</span><b>${esc(row.value)}${row.extra ? ` <em>+${esc(row.extra)}</em>` : ''}</b></li>`).join('');
  const max = isPending(d.maxEnchant) ? null : d.maxEnchant;
  const stones = isPending(d.manastoneSlots) ? 0 : d.manastoneSlots;
  const emptyPerks = Math.max(0, d.skillPerkSlots - d.skillPerks.length);
  return `
    ${max ? `<div class="ae-item-enchant" aria-label="Enchant +${esc(d.enchant)} of ${esc(max)}"><span class="ae-item-sec">Enchant</span><span class="ae-pips">${Array.from({ length: max }, (_, n) => `<i class="${n < d.enchant ? 'is-on' : ''}"></i>`).join('')}</span><b>+${esc(d.enchant)} / ${esc(max)}</b></div>` : ''}
    ${d.mainStats.length ? `<div class="ae-item-block"><p class="ae-item-sec">Stats</p><ul class="ae-item-rows">${rows(d.mainStats)}</ul></div>` : ''}
    ${d.subStats.length || d.bonusStatSlots ? `<div class="ae-item-block"><p class="ae-item-sec">Bonus stats${d.bonusStatsRandom ? ' <small>rolled</small>' : ''}</p>${d.subStats.length ? `<ul class="ae-item-rows is-bonus">${rows(d.subStats)}</ul>` : '<p class="ae-empty">None rolled yet</p>'}</div>` : ''}
    ${d.skillPerkSlots || d.skillPerks.length ? `<div class="ae-item-block"><p class="ae-item-sec">Skill perks <small>${d.skillPerks.length} of ${d.skillPerkSlots}</small></p><ul class="ae-perk-list">
      ${d.skillPerks.map(perk => `<li class="ae-perk">${perk.icon ? `<img src="${esc(perk.icon)}" alt="" width="36" height="36" referrerpolicy="no-referrer">` : '<span class="ae-perk-empty"></span>'}<span>${esc(perk.name)}</span><b>+${esc(perk.level)}</b></li>`).join('')}
      ${Array.from({ length: emptyPerks }, () => '<li class="ae-perk is-empty"><span class="ae-perk-empty"></span><span>Empty perk slot</span></li>').join('')}
    </ul></div>` : ''}
    ${stones ? `<div class="ae-item-block"><p class="ae-item-sec">Manastone slots</p><span class="ae-sockets" aria-label="${stones} manastone slots">${Array.from({ length: stones }, () => '<i></i>').join('')}</span></div>` : ''}
    ${d.sources.length || d.appearance ? `<ul class="ae-card-chips">${d.sources.map(source => `<li>From: ${esc(source)}</li>`).join('')}${d.appearance ? `<li>Look: ${esc(d.appearance)}</li>` : ''}</ul>` : ''}
    ${d.description ? d.description.split('\n').map(line => `<p class="ae-card-line ae-item-desc">${esc(line)}</p>`).join('') : ''}`;
}

async function selectSlot(index, from) {
  const slot = state.model.gear[index];
  state.selected = index;
  const head = detail => ({
    icon: (detail ?? slot).icon, title: (detail ?? slot).name, grade: (detail ?? slot).grade,
    sub: [slotLabel(slot.slot), detail?.category, (detail ?? slot).grade].filter(Boolean).join(' · ')
  });
  openInfo(infoCardHtml({ ...head(null), lines: [`Reading ${slot.name}.`] }), from);
  let result;
  try {
    result = await loadItemDetail(state.model, slot, state.source);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    result = { detail: null, reason: 'The armory is unavailable right now. Try this item again in a minute.' };
  }
  if (state.selected !== index || $('#aeInfo')?.hidden) return;
  if (!result.detail) {
    openInfo(infoCardHtml({ ...head(null), chips: [`+${slot.enchant}`], lines: [result.reason] }), from);
    return;
  }
  const d = result.detail;
  // The detail call is the only source of max enchant and manastone slots: keep them on the slot tile too.
  if (!isPending(d.maxEnchant)) slot.maxEnchant = d.maxEnchant;
  if (!isPending(d.manastoneSlots)) slot.manastoneSlots = d.manastoneSlots;
  const meta = document.querySelector(`[data-slot="${index}"] .ae-slot-meta`);
  if (meta) meta.textContent = `${slot.grade} · ${enchantText(slot)}`;
  const max = isPending(d.maxEnchant) ? null : d.maxEnchant;
  const status = max === null ? null : d.enchant >= max ? ['keep', 'Fully enchanted'] : ['go', `Enchant it: ${max - d.enchant} more ${max - d.enchant === 1 ? 'level' : 'levels'} to +${max}`];
  openInfo(infoCardHtml({
    ...head(d), status,
    chips: [d.level ? `Item level ${d.level}` : null, d.equipLevel ? `Wear from Lv ${d.equipLevel}` : null, d.soulBindRate ? `Soul bind ${d.soulBindRate}%` : null],
    body: itemCardBody(slot, d)
  }), from);
}

function renderSide() {
  const { model } = state;
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const level = model.profile.level;
  const lockedLevel = Math.min(...stigmas.filter(skill => !skill.acquired).map(skill => skill.needLevel));
  // At or past the unlock level the armory can still report none acquired (stigmas also need a quest).
  $('#aeStigmaNote').textContent = stigmas.every(skill => !skill.acquired)
    ? `${stigmas.length} stigmas · ${level >= lockedLevel ? 'none unlocked yet' : `unlock at Lv ${lockedLevel}`}`
    : `${stigmas.filter(skill => skill.acquired).length} of ${stigmas.length} stigmas unlocked`;
  $('#aeStigmas').innerHTML = stigmas.map(skill => `<li class="ae-stigma${skill.acquired ? '' : ' is-locked'}">
      ${iconImg(skill.icon, '', 36)}<span><strong>${esc(skill.name)}</strong><small>${skill.acquired ? `Skill Lv ${esc(skill.skillLevel)}` : (level >= skill.needLevel ? 'Not unlocked yet' : `Unlocks at Lv ${esc(skill.needLevel)}`)}</small></span>
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
}

async function start() {
  wireDrawer();
  setFaction(null);
  $('#aeBoards').addEventListener('toggle', event => {
    if (event.target.matches?.('details[data-board]') && event.target.open) openBoard(event.target);
  }, true);
  $('#aeGear').addEventListener('click', event => {
    const button = event.target.closest('[data-slot]');
    if (button) selectSlot(Number(button.dataset.slot), button).catch(error => console.error(error));
  });
  state.listedSlots = new Set((await loadCatalogue()).slots.map(slot => slot.slotPos));
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
