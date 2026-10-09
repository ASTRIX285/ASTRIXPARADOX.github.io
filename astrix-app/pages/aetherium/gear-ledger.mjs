/**
 * Gear page (The Aetherium, hub/aetherium/gear/equipment/): what one Daeva wears. Tap a gear slot for its item
 * card (like the game's tooltip: stats, enchant, skill perks, manastone slots, where it comes from).
 * Stats on the left under the gear; pet, wings and title on the right, both columns ending level.
 * Skills and Daevanion boards have their own pages (see the character menu).
 */
import { ArmoryUnavailable, loadCatalogue, loadItemDetail } from './aetherium-data.mjs';
import { $, esc, iconImg, infoCardHtml, isPending, number, openInfo, slotLabel } from './aetherium-ui.mjs';
import { failPage, startCharacterPage, windowBar } from './character-page.mjs';

const PRIMARY_STATS = ['STR', 'DEX', 'INT', 'CON', 'AGI', 'WIS'];
const state = { model: null, source: null, selected: null, listedSlots: new Set() };

const enchantText = slot => `+${slot.enchant}${isPending(slot.maxEnchant) ? '' : ` of ${slot.maxEnchant}`}`;

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

function renderStats() {
  const primary = state.model.stats.filter(row => PRIMARY_STATS.includes(row.type));
  $('#aeStats').innerHTML = primary.map(row => `<div class="ae-stat"><dt>${esc(row.name)}</dt><dd>${number(row.value)}</dd></div>`).join('');
}

/** Pet, wings and title as three big cards that share the column's height equally. */
function renderExtras() {
  const { model } = state;
  const card = (label, icon, name, meta) => `<li class="ae-extra">${iconImg(icon, '', 88)}<span><small>${label}</small><strong>${esc(name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span></li>`;
  $('#aeExtras').innerHTML = [
    isPending(model.pet) ? card('Pet', null, 'None equipped', null) : card('Pet', model.pet.icon, model.pet.name, `Lv ${model.pet.level}`),
    isPending(model.wings) ? card('Wings', null, 'None equipped', null) : card('Wings', model.wings.icon, model.wings.name, `${model.wings.grade} · +${model.wings.enchant}`),
    card('Title', null, model.profile.title || 'No title', null)
  ].join('');
}

function render(model, source, ref) {
  Object.assign(state, { model, source, selected: null });
  $('#aeStage').innerHTML = `<div class="ae-gw ae-gear-window">
    ${windowBar({ title: 'Gear', model, ref })}
    <div class="ae-gw-body">
      <div class="ae-ledger ae-gear-page">
        <div class="ae-col">
          <section class="ae-panel" aria-labelledby="aeGearTitle">
            <h2 class="ae-section-title" id="aeGearTitle">Equipped gear <small id="aeGearCount"></small></h2>
            <ul class="ae-gear" id="aeGear"></ul>
            <p class="ae-accessories" id="aeAccessories"></p>
          </section>
          <section class="ae-panel is-grow" aria-labelledby="aeStatTitle">
            <h2 class="ae-section-title" id="aeStatTitle">Stats <small>from the armory</small></h2>
            <dl class="ae-stats" id="aeStats"></dl>
            <p class="ae-note">Attack, Defense and other combat stats are not in the public armory data.</p>
          </section>
        </div>
        <div class="ae-col">
          <section class="ae-panel is-grow" aria-labelledby="aeExtraTitle">
            <h2 class="ae-section-title" id="aeExtraTitle">Pet, wings and title</h2>
            <ul class="ae-extras" id="aeExtras"></ul>
          </section>
        </div>
      </div>
    </div>
  </div>`;
  renderGear();
  renderStats();
  renderExtras();
  $('#aeGear').addEventListener('click', event => {
    const button = event.target.closest('[data-slot]');
    if (button) selectSlot(Number(button.dataset.slot), button).catch(error => console.error(error));
  });
}

startCharacterPage({
  async render({ model, source, ref }) {
    state.listedSlots = new Set((await loadCatalogue()).slots.map(slot => slot.slotPos));
    render(model, source, ref);
  }
}).catch(error => failPage('Gear page', error));
