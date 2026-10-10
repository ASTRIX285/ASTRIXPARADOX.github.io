/**
 * Skills page (The Aetherium, hub/aetherium/skills/): one Daeva's skills laid out like the game's Skill window.
 * Two tabs, Mastery and Stigma (kept in the address as ?tab=stigma). The skill grid is on the right, the picked
 * skill's detail on the left; hovering an icon shows the game-style card, a click or tap picks it.
 * Everything comes from the character call plus the Ascent Plan's skill data (ascent-advisor.mjs); nothing is guessed,
 * and a value the data does not hold (casting time, range) is left out.
 */
import { ascentUrl, loadAdvisor, prefetchAdvisor } from './aetherium-data.mjs';
import { $, esc, infoCardHtml, isPending, wireHoverCards } from './aetherium-ui.mjs';
import { LOCK_ICON, failPage, lockBadge, startCharacterPage, windowBar } from './character-page.mjs';
import { buildAscentPlan } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';

const state = { model: null, plan: null, tab: 'mastery', selected: { mastery: null, stigma: null }, stigmas: [] };

const TABS = { mastery: 'Mastery', stigma: 'Stigma' };
const tabFromUrl = () => (new URLSearchParams(location.search).get('tab') === 'stigma' ? 'stigma' : 'mastery');

/** Keeps the tab in the address (the Mastery tab is the default, so it leaves the address clean). */
function writeTab() {
  const params = new URLSearchParams(location.search);
  if (state.tab === 'stigma') params.set('tab', 'stigma'); else params.delete('tab');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}

const entryOf = name => [...state.plan.mastery.active, ...state.plan.mastery.passive].find(item => item.name === name) ?? null;
const stigmaOf = name => state.stigmas.find(item => item.name === name) ?? null;
const lockedMastery = entry => entry.unlocked === false || entry.acquired === false;

/* The picks the build makes for this skill's Specialty slots stand out in the perk list. */
const pickOf = (entry, perk) => entry.slots.some(slot => slot.pick && slot.pick.skillLevel === perk.skillLevel && perk.text.toLowerCase().includes(slot.pick.pick.toLowerCase().split(' ')[0]));

/** The card body of one skill: description, Specialty slots and perks, cooldown. Shared by the detail panel and the hover card. */
function masteryBody(entry) {
  if (entry.category !== 'Active') return '';
  const level = entry.skillLevel ?? 0;
  const slots = `<div class="ae-card-slots">${entry.slots.map(slot => `<span class="ae-card-slot ${slot.open ? 'is-open' : 'is-locked'}"><b>${slot.slot}</b><small>${slot.open ? 'Open' : `<span class="ae-pad">${LOCK_ICON}</span>Lv ${slot.slotLevel}`}</small><em>${esc(slot.pick ? slot.pick.pick : 'Free pick')}</em></span>`).join('')}</div>`;
  const perks = entry.perks.length
    ? `<ul class="ae-mperks">${entry.perks.map(perk => `<li class="${pickOf(entry, perk) ? 'is-pick ' : ''}${perk.skillLevel > level ? 'is-locked' : ''}"><span class="ae-pick-level">Lv ${esc(perk.skillLevel)}</span><span>${esc(perk.text)}</span>${perk.skillLevel > level ? `<span class="ae-pad" aria-label="Locked">${LOCK_ICON}</span>` : ''}</li>`).join('')}</ul>`
    : '';
  const cooldown = typeof entry.cooldownSeconds === 'number' ? `<ul class="ae-card-facts"><li><span>Cooldown</span> <b>${esc(entry.cooldownSeconds)} s</b></li></ul>` : '';
  return `<p class="ae-item-sec">Specialty</p>${slots}${perks ? `<p class="ae-item-sec">Specialty perks</p>${perks}` : ''}${cooldown}${chainHtml(entry.chains)}`;
}

/* A skill's chains on its card: lead-in skills, an arrow, the follow-up. Only from the data (Specialty perks and what was seen in game).
   How a follow-up is pressed is a game rule that is not confirmed yet, so the card says so until mechanics.json flips it. */
const CHAIN_ARROW = '<svg class="ae-chain-arrow" viewBox="0 0 24 12" aria-hidden="true"><path d="M1 6h19M15 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function chainHtml(chains) {
  if (!chains?.length) return '';
  const rule = state.plan.chains;
  const icon = name => (state.plan.skillIcons[name] ? `<img src="${esc(state.plan.skillIcons[name])}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '');
  const skill = name => `<span class="ae-chain-skill">${icon(name)}${esc(name)}</span>`;
  return `<div class="ae-chain-block" data-chain>
    <p class="ae-item-sec">Chain</p>
    ${chains.map(chain => `<p class="ae-chain">${chain.pending ? `<em class="ae-chain-pending">${esc(chain.pending.reason)}</em>` : chain.leadIns.map(skill).join('<span class="ae-chain-or">or</span>')}${CHAIN_ARROW}${skill(chain.followUp)}${chain.opensAt ? `<small>from skill Lv ${esc(chain.opensAt)}</small>` : ''}</p>`).join('')}
    <p class="ae-chain-note">Follow-up: press it when it lights up.${rule?.confirmed ? '' : ` <span class="ae-tag is-unconfirmed" data-rule-tag="chain-follow-up">Not confirmed yet</span>${rule?.test ? ` <span class="ae-tag-test" data-rule-test="chain-follow-up">Check it in game: ${esc(rule.test)}</span>` : ''}`}</p>
  </div>`;
}

function masteryCard(entry, titleId) {
  const locked = lockedMastery(entry);
  return infoCardHtml({
    icon: entry.icon,
    title: entry.name,
    level: entry.skillLevel,
    sub: state.model.profile.class,
    titleId,
    status: locked ? ['lock', entry.needLevel ? `Unlocks at Lv ${entry.needLevel}` : 'Not learned yet'] : null,
    chips: [entry.category, entry.priority ? `Key skill ${entry.priority}` : null],
    lines: [entry.summary],
    body: masteryBody(entry)
  });
}

function stigmaCard(item, titleId) {
  const { plan } = state;
  const slotIndex = plan.stigmas.pending ? -1 : plan.stigmas.slots.findIndex(slot => slot.name === item.name);
  const alt = plan.stigmas.pending ? null : plan.stigmas.alternatives.find(entry => entry.name === item.name);
  const learned = item.acquired;
  const status = item.equipped ? ['keep', 'Equipped']
    : !learned ? ['lock', `Unlocks at Lv ${item.needLevel}${!plan.stigmas.pending && plan.stigmas.quest ? ` with the quest ${plan.stigmas.quest}` : ''}`]
    : null;
  return infoCardHtml({
    icon: item.icon,
    title: item.name,
    level: learned ? item.skillLevel : null,
    sub: state.model.profile.class,
    titleId,
    status,
    chips: ['Stigma', slotIndex >= 0 ? `Build slot ${slotIndex + 1}` : null],
    lines: [
      slotIndex >= 0 ? `In this class's build for slot ${slotIndex + 1}, which opens at Lv ${plan.stigmas.slots[slotIndex].slotLevel}.` : null,
      alt ? alt.why : null
    ]
  });
}

const detailHtml = (tab, name, titleId = 'aeSkillTitle') => {
  if (tab === 'mastery') { const entry = entryOf(name); return entry ? masteryCard(entry, titleId) : ''; }
  const item = stigmaOf(name);
  return item ? stigmaCard(item, titleId) : '';
};

function masteryTile(entry) {
  const locked = lockedMastery(entry);
  const selected = state.selected.mastery === entry.name;
  return `<span role="button" tabindex="0" class="ae-mskill${locked ? ' is-locked' : ''}${selected ? ' is-selected' : ''}" data-skill="${esc(entry.name)}" data-hover="${esc(entry.name)}" aria-pressed="${selected}" aria-label="${esc(entry.name)}${entry.skillLevel !== null ? `, level ${entry.skillLevel}` : locked && entry.needLevel ? `, unlocks at Lv ${entry.needLevel}` : ''}">
    <span class="ae-mskill-name">${esc(entry.name)}</span>
    ${entry.icon ? `<img src="${esc(entry.icon)}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
    ${locked && entry.needLevel ? lockBadge(entry.needLevel) : entry.skillLevel !== null ? `<span class="ae-mskill-lv" aria-hidden="true">Lv. ${esc(entry.skillLevel)}</span>` : ''}
  </span>`;
}

function stigmaTile(item) {
  const selected = state.selected.stigma === item.name;
  return `<span role="button" tabindex="0" class="ae-mskill${item.acquired ? '' : ' is-locked'}${selected ? ' is-selected' : ''}" data-skill="${esc(item.name)}" data-hover="${esc(item.name)}" aria-pressed="${selected}" aria-label="${esc(item.name)}${item.acquired ? `, level ${item.skillLevel}` : `, unlocks at Lv ${item.needLevel}`}">
    <span class="ae-mskill-name">${esc(item.name)}</span>
    ${item.icon ? `<img src="${esc(item.icon)}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
    ${item.acquired ? `<span class="ae-mskill-lv" aria-hidden="true">Lv. ${esc(item.skillLevel)}</span>` : lockBadge(item.needLevel)}
    ${item.equipped ? '<span class="ae-mskill-bar" aria-hidden="true">●</span>' : ''}
  </span>`;
}

function gridHtml() {
  if (state.tab === 'stigma') {
    return `<p class="ae-mskills-title">Stigma</p><div class="ae-sgrid" role="group" aria-label="Stigmas">${state.stigmas.map(stigmaTile).join('')}</div>`;
  }
  const { active, passive } = state.plan.mastery;
  return `<p class="ae-mskills-title">Active</p><div class="ae-sgrid" role="group" aria-label="Active skills">${active.map(masteryTile).join('')}</div>
    ${passive.length ? `<p class="ae-mskills-title">Passive</p><div class="ae-sgrid" role="group" aria-label="Passive skills">${passive.map(masteryTile).join('')}</div>` : ''}`;
}

/** The skill picked when a tab opens: the build's first key skill, or its first stigma, else the first icon. */
function defaultSelection(tab) {
  if (tab === 'mastery') {
    const { active, passive } = state.plan.mastery;
    return (active.find(entry => entry.priority === 1) ?? active[0] ?? passive[0])?.name ?? null;
  }
  const first = state.plan.stigmas.pending ? null : state.plan.stigmas.slots[0]?.name;
  return (stigmaOf(first) ?? state.stigmas[0])?.name ?? null;
}

function renderTab() {
  state.selected[state.tab] ??= defaultSelection(state.tab);
  document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab)));
  $('#aeSkillGrid').innerHTML = gridHtml();
  $('#aeSkillDetail').innerHTML = detailHtml(state.tab, state.selected[state.tab]);
  $('#aeSkillDetail').dataset.tab = state.tab;
}

function select(name, { scroll = false } = {}) {
  state.selected[state.tab] = name;
  document.querySelectorAll('#aeSkillGrid [data-skill]').forEach(tile => {
    const on = tile.dataset.skill === name;
    tile.classList.toggle('is-selected', on);
    tile.setAttribute('aria-pressed', String(on));
  });
  $('#aeSkillDetail').innerHTML = detailHtml(state.tab, name);
  // On a phone the detail sits under the grid: bring it into view after a pick.
  if (scroll && matchMedia('(max-width:899px)').matches) $('#aeSkillDetail').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function setTab(tab) {
  if (!TABS[tab] || tab === state.tab) return;
  state.tab = tab;
  writeTab();
  renderTab();
}

function render({ model, ref }, data) {
  const plan = buildAscentPlan({ className: model.profile.class, role: null, level: model.profile.level, data, model });
  Object.assign(state, { model, plan, tab: tabFromUrl() });
  state.stigmas = model.skills.filter(skill => skill.category === 'Dp');
  document.title = 'Skills | Gear Ledger | The Aetherium | AION 2 | ASTRIX PARADOX';
  if (plan.pending || !plan.mastery) {
    $('#aeStage').innerHTML = `<div class="ae-gw ae-skills-window">${windowBar({ title: 'Skill', model, ref })}<div class="ae-gw-body"><p class="ae-pending"><span>Not ready yet.</span> ${esc(isPending(plan.pending) ? plan.pending.reason : 'The skill list for this class is not loaded yet.')}</p></div></div>`;
    return;
  }
  $('#aeStage').innerHTML = `<div class="ae-gw ae-skills-window" data-view="skills">
    ${windowBar({ title: 'Skill', model, ref })}
    <div class="ae-gw-tabs is-centred" role="tablist" aria-label="Skill tabs">${Object.entries(TABS).map(([key, label]) => `<button type="button" role="tab" class="ae-gw-tab" data-tab="${key}" aria-selected="${key === tabFromUrl()}">${label}</button>`).join('')}</div>
    <div class="ae-gw-body">
      <div class="ae-skills-layout">
        <aside class="ae-sdetail" id="aeSkillDetail" aria-live="polite"></aside>
        <section class="ae-sgrid-wrap" id="aeSkillGrid" aria-label="Skills"></section>
      </div>
    </div>
  </div>`;
  renderTab();
  const stage = $('#aeStage');
  stage.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { setTab(tab.dataset.tab); return; }
    const skill = event.target.closest('[data-skill]');
    if (skill) select(skill.dataset.skill, { scroll: true });
  });
  stage.addEventListener('keydown', event => {
    const skill = event.target.closest?.('[data-skill]');
    if (skill && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(skill.dataset.skill, { scroll: true }); }
  });
  wireHoverCards(stage, el => detailHtml(state.tab, el.dataset.hover, null));
}

startCharacterPage({
  prefetch: className => { if (className) prefetchAdvisor(className); },
  async render(loaded) {
    render(loaded, await loadAdvisor(loaded.model.profile.class));
  },
  next: ({ model, ref }) => ({ label: 'Next: Skills to level', href: ascentUrl(ref, model.profile.class, { screen: 'mastery' }), note: 'Step 3 of 3: the Mastery screen of the Ascent Plan' })
}).catch(error => failPage('Skills page', error));
