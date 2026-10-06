/**
 * Ascent Plan (The Aetherium): what to do next, for any class, role and level.
 *
 * Two ways in. With a Daeva (from the link or the active roster slot) the plan reads the armory
 * and adds fixes for that exact character. Without one, a new player picks class, role and level
 * and gets the plan from static data alone, with no armory call. Advice comes from
 * games/aion2/engine/ascent-advisor.mjs; every recommendation shows its sources.
 */
import { ArmoryUnavailable, ascentUrl, loadAdvisor, loadCharacter, prefetchAdvisor, refFromUrl, roster } from './aetherium-data.mjs';
import { $, esc, isPending, markCharacterShown, markReady, setFaction, showNotice, showSource, wireDrawer } from './aetherium-ui.mjs';
import { AION2_CLASSES, ROLES, buildAscentPlan, clampLevel } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';

const state = { model: null, source: null, ref: null, className: 'Gladiator', role: null, level: 1, data: null, refIndex: new Map() };

const BEGINNER = { 'very high': 'Very easy to learn', high: 'Easy to learn', medium: 'Medium to learn', low: 'Hard to learn' };
const CONFIDENCE = {
  consensus: 'Sources agree',
  'top-player data': 'From top player picks',
  'single-source': 'One source only'
};
const REGION = { global: 'Global servers', korea: 'Korean servers', 'not-stated': 'Region not stated' };

/** Small superscript links to the numbered source list at the bottom of the plan. */
function cite(refs) {
  const numbers = [...new Set((refs ?? []).map(ref => state.refIndex.get(ref)).filter(Boolean))].sort((a, b) => a - b);
  if (!numbers.length) return '';
  return `<sup class="ae-cite">${numbers.map(n => `<a href="#aeSrc${n}" aria-label="Source ${n}">${n}</a>`).join('')}</sup>`;
}

const pendingNote = value => `<p class="ae-pending"><span>Not sourced yet.</span> ${esc(value.reason)}</p>`;

function fillClassSelect() {
  $('#aeClass').innerHTML = AION2_CLASSES.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
}

function fillRoleSelect(roles, chosen) {
  $('#aeRole').innerHTML = roles.map(item => {
    const tag = item.main ? 'main role' : item.status === 'pending' ? 'no build yet' : item.status === 'partial' ? 'partly sourced' : item.buildLabel;
    return `<option value="${esc(item.role)}"${item.role === chosen ? ' selected' : ''}>${esc(item.label)} (${esc(tag)})</option>`;
  }).join('');
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const className = AION2_CLASSES.find(name => name.toLowerCase() === String(params.get('class') ?? '').toLowerCase());
  const role = Object.keys(ROLES).includes(params.get('role')) ? params.get('role') : null;
  const level = params.has('level') ? Number(params.get('level')) : null;
  return { className, role, level };
}

/** Keeps the address bookmarkable: the Daeva link, or class, role and level for a manual plan. */
function writeUrl() {
  const params = new URLSearchParams();
  if (state.ref && state.model) {
    params.set('serverId', state.ref.serverId);
    params.set('characterId', state.ref.characterId);
    params.set('class', state.className.toLowerCase());
    if (state.role) params.set('role', state.role);
  } else {
    params.set('class', state.className.toLowerCase());
    if (state.role) params.set('role', state.role);
    params.set('level', state.level);
  }
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function renderDaevaLine() {
  const el = $('#aeDaeva');
  if (!state.model) {
    const active = roster.active();
    el.hidden = !active;
    if (active) el.innerHTML = `Planning by hand. <a href="${esc(ascentUrl({ serverId: active.serverId, characterId: active.characterId }, active.className))}" data-use-daeva>Use ${esc(active.name)} (${esc(active.className)} Lv ${esc(active.level)}) instead</a>`;
    return;
  }
  const p = state.model.profile;
  el.hidden = false;
  el.innerHTML = `Planning for <strong>${esc(p.name)}</strong>, ${esc(p.class)} Lv ${esc(p.level)} on ${esc(p.server.name)}. <button type="button" class="ae-linkish" data-plan-by-hand>Plan another class by hand</button>`;
}

function setFormLock() {
  const locked = Boolean(state.model);
  $('#aeClass').disabled = locked;
  $('#aeLevel').disabled = locked;
  $('#aeClass').title = locked ? 'Taken from your Daeva' : '';
  $('#aeLevel').title = locked ? 'Taken from your Daeva' : '';
}

function renderNow(plan) {
  if (!plan.now.length) return '';
  return `<section class="ae-panel" aria-labelledby="aeNowTitle">
    <h2 class="ae-section-title" id="aeNowTitle">Do this now <small>${plan.character ? 'for your Daeva' : `at Lv ${plan.level}`}</small></h2>
    <ol class="ae-now">${plan.now.map(item => `<li class="ae-now-item" data-kind="${esc(item.kind)}">
      <strong>${esc(item.title)}${cite(item.refs)}</strong>
      <span>${esc(item.detail)}</span>
      ${item.kind === 'armory' ? '<small class="ae-tag">From your armory data</small>' : ''}
    </li>`).join('')}</ol>
  </section>`;
}

function renderSkills(plan) {
  const rule = plan.specialtyRule;
  return `<section class="ae-panel" aria-labelledby="aeSkillTitle">
    <h2 class="ae-section-title" id="aeSkillTitle">Skills and Specialty <small>level in this order</small></h2>
    <ol class="ae-skills">${plan.skills.map(skill => {
      const state_ = skill.unlocked === false ? `<small class="ae-tag is-locked">Unlocks at Lv ${esc(skill.unlockLevel)}</small>` : skill.skillLevel !== null ? `<small class="ae-tag">Skill Lv ${esc(skill.skillLevel)}</small>` : '';
      const cd = isPending(skill.cooldownSeconds) ? '' : ` · ${esc(skill.cooldownSeconds)} s cooldown`;
      return `<li class="ae-skill${skill.unlocked === false ? ' is-locked' : ''}">
        <div class="ae-skill-head"><strong>${esc(skill.name)}${cite(skill.refs)}</strong>${state_}</div>
        <p class="ae-muted">${esc(skill.why)} <span class="ae-target">Target: ${esc(skill.target)}${cd}.</span></p>
        ${skill.picks.length ? `<ul class="ae-picks">${skill.picks.map(pick => `<li${skill.skillLevel !== null && pick.skillLevel <= skill.skillLevel ? ' class="is-open"' : ''}><span class="ae-pick-level">Skill Lv ${esc(pick.skillLevel)}</span>${esc(pick.pick)}${cite(pick.refs)}</li>`).join('')}</ul>` : ''}
        ${skill.perks.length ? `<details class="ae-perks"><summary>All 5 Specialty perks</summary><ul>${skill.perks.map(perk => `<li><span class="ae-pick-level">Lv ${esc(perk.skillLevel)}</span>${esc(perk.text)}</li>`).join('')}</ul></details>` : ''}
      </li>`;
    }).join('')}</ol>
    ${rule ? `<p class="ae-note">${esc(rule.text)}${rule.confidence ? ` (${esc(rule.confidence)}.)` : ''}</p>` : ''}
  </section>`;
}

function renderRotation(plan) {
  const r = plan.rotation;
  const order = plan.macroOrder;
  const body = isPending(r) ? pendingNote(r) : `
    <ol class="ae-macro">${r.steps.map(step => `<li class="${step.locked ? 'is-locked' : ''}">${esc(step.text)}${step.locked ? ` <small class="ae-tag is-locked">Lv ${esc(step.unlockLevel)}</small>` : ''}</li>`).join('')}</ol>
    ${r.filler ? `<p><b>Filler:</b> ${esc(r.filler)}</p>` : ''}
    ${r.manual?.length ? `<p><b>Keep on your own keys:</b> ${r.manual.map(esc).join(', ')}</p>` : ''}
    ${r.note ? `<p class="ae-muted">${esc(r.note)}</p>` : ''}
    <p class="ae-cite-line">Sources${cite(r.refs)}</p>`;
  return `<section class="ae-panel" aria-labelledby="aeMacroTitle">
    <h2 class="ae-section-title" id="aeMacroTitle">Macro and rotation <small>priority order</small></h2>
    ${body}
    ${order ? `<div class="ae-callout"><p><b>Check in game:</b> ${esc(isPending(order.value) ? order.value.reason : order.text)}</p><p class="ae-muted">${esc(order.text)}${cite(order.provenance.map(source => source.ref))}</p></div>` : ''}
  </section>`;
}

function renderStigmas(plan) {
  const s = plan.stigmas;
  if (s.pending) return `<section class="ae-panel"><h2 class="ae-section-title">Stigmas</h2>${pendingNote(s.pending)}</section>`;
  const head = plan.level < s.unlockLevel ? `unlock at Lv ${s.unlockLevel}` : `${s.open} of 4 slots open`;
  return `<section class="ae-panel" aria-labelledby="aeStigmaPlanTitle">
    <h2 class="ae-section-title" id="aeStigmaPlanTitle">Stigmas <small>${esc(head)}</small></h2>
    <ol class="ae-stigma-plan">${s.slots.map((slot, index) => `<li class="${slot.open ? 'is-open' : 'is-locked'}">
      <span class="ae-slot-label">Slot ${index + 1} · Lv ${esc(slot.slotLevel)}</span>
      <strong>${esc(slot.name)}</strong>
      ${slot.acquired === true ? '<small class="ae-tag">Unlocked</small>' : ''}
    </li>`).join('')}</ol>
    <p class="ae-muted">${esc(CONFIDENCE[s.confidence] ?? '')}${cite(s.refs)}${s.note ? ` ${esc(s.note)}` : ''}</p>
    ${s.alternatives.length ? `<p class="ae-slot-label">Also worth a look</p><ul class="ae-alts">${s.alternatives.map(alt => `<li><strong>${esc(alt.name)}</strong> ${esc(alt.why)}${cite(alt.refs)}</li>`).join('')}</ul>` : ''}
    ${s.quest && plan.level < s.unlockLevel + 1 ? `<p class="ae-note">At Lv ${esc(s.unlockLevel)} do the quest ${esc(s.quest)} to open stigmas.</p>` : ''}
  </section>`;
}

function renderBoards(plan) {
  const d = plan.daevanion;
  return `<section class="ae-panel" aria-labelledby="aeDaevTitle">
    <h2 class="ae-section-title" id="aeDaevTitle">Daevanion <small>boards and node order</small></h2>
    <ul class="ae-board-plan">${d.boards.map(board => `<li class="${board.open ? 'is-open' : 'is-locked'}">
      <span><strong>${esc(board.name)}</strong><small>${esc(board.focus)}</small></span>
      <span class="ae-board-state">${board.open ? (board.nodesTaken !== null ? `${esc(board.nodesTaken)} / ${esc(board.nodesTotal)} nodes` : 'Open') : `Lv ${esc(board.unlockLevel)}`}</span>
    </li>`).join('')}</ul>
    ${isPending(d.priorities) ? pendingNote(d.priorities) : `<p class="ae-slot-label">Take these first</p><ol class="ae-list">${d.priorities.map(item => `<li>${esc(item)}</li>`).join('')}</ol><p class="ae-cite-line">Sources${cite(d.refs)}</p>`}
    ${d.general ? `<p class="ae-note">${esc(d.general.text)}</p>` : ''}
  </section>`;
}

function renderStats(plan) {
  const s = plan.stats;
  return `<section class="ae-panel" aria-labelledby="aeStatPlanTitle">
    <h2 class="ae-section-title" id="aeStatPlanTitle">Stats to look for <small>on gear and manastones</small></h2>
    ${isPending(s) ? pendingNote(s) : `<ol class="ae-list">${s.order.map(item => `<li>${esc(item)}</li>`).join('')}</ol><p class="ae-cite-line">Sources${cite(s.refs)}</p>`}
  </section>`;
}

function renderUpcoming(plan) {
  if (!plan.upcoming.length) return '';
  return `<section class="ae-panel" aria-labelledby="aeNextTitle">
    <h2 class="ae-section-title" id="aeNextTitle">Coming up <small>as you level</small></h2>
    <ol class="ae-timeline">${plan.upcoming.slice(0, 10).map(item => `<li data-kind="${esc(item.kind)}"><span class="ae-pick-level">Lv ${esc(item.level)}</span>${esc(item.text)}</li>`).join('')}</ol>
  </section>`;
}

function renderSources(plan) {
  return `<section class="ae-panel ae-sources" aria-labelledby="aeSrcTitle">
    <h2 class="ae-section-title" id="aeSrcTitle">Sources <small>checked ${esc(plan.sources[0]?.retrievedOn ?? '')}</small></h2>
    <ol>${plan.sources.map((source, index) => `<li id="aeSrc${index + 1}">
      <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}: ${esc(source.title)}</a>
      <small>${esc(REGION[source.region] ?? source.region)} · ${esc(source.reliability)} reliability${source.publishedOn ? ` · published ${esc(source.publishedOn)}` : ''}</small>
    </li>`).join('')}</ol>
  </section>`;
}

function renderPlan() {
  const plan = buildAscentPlan({ className: state.className, role: state.role, level: state.level, data: state.data, model: state.model });
  state.role = plan.role;
  state.refIndex = new Map(plan.sources.map((source, index) => [source.ref, index + 1]));
  fillRoleSelect(plan.roles, plan.role);
  $('#aeClass').value = plan.className;
  $('#aeLevel').value = plan.level;
  $('#aeLevel').max = plan.levelCap;
  $('#aeAscentFor').textContent = `${plan.className} · ${plan.roleLabel} · Lv ${plan.level}${plan.character ? ` · ${plan.character.name}` : ''}`;
  const fallback = plan.roleFallback ? `<p class="ae-callout">${esc(plan.className)} has no ${esc(ROLES[plan.roleRequested] ?? plan.roleRequested)} build, so this shows its main role.</p>` : '';
  const header = `<section class="ae-panel ae-ascent-head">
      <div>
        <p class="ae-eyebrow">${esc(plan.roleLabel)}${plan.build.main ? ' · main role' : ''}</p>
        <h2 class="ae-plan-title">${esc(plan.className)}: ${esc(plan.build.label)}</h2>
        <p>${esc(plan.build.summary)}${cite(plan.build.summaryRefs)}</p>
      </div>
      <ul class="ae-chips" aria-label="Build facts">
        ${plan.build.beginner ? `<li>${esc(BEGINNER[plan.build.beginner] ?? plan.build.beginner)}</li>` : ''}
        <li>Level cap ${esc(plan.levelCap)}</li>
        <li>${esc(plan.sources.length)} ${plan.sources.length === 1 ? 'source' : 'sources'}</li>
      </ul>
    </section>${fallback}`;
  if (plan.pending) {
    $('#aePlan').innerHTML = `${header}<section class="ae-panel">${pendingNote(plan.pending)}<p><a class="btn ae-primary" href="?class=${esc(plan.className.toLowerCase())}&level=${esc(plan.level)}">Show the ${esc(plan.className)} main role instead</a></p></section>${renderSources(plan)}`;
  } else {
    $('#aePlan').innerHTML = `${header}
      <div class="ae-ascent-grid">
        <div class="ae-col ae-ascent-main">${renderNow(plan)}${renderSkills(plan)}</div>
        <div class="ae-ascent-side">
          <div class="ae-col">${renderStigmas(plan)}${renderRotation(plan)}</div>
          <div class="ae-col">${renderBoards(plan)}${renderStats(plan)}${renderUpcoming(plan)}</div>
        </div>
      </div>
      ${renderSources(plan)}`;
  }
  writeUrl();
}

async function selectClass(className) {
  state.className = className;
  $('#aePlan').setAttribute('aria-busy', 'true');
  state.data = await loadAdvisor(className);
  // A new class starts on its own main role: the old class's role may be a side build here.
  state.role = null;
  renderPlan();
  $('#aePlan').setAttribute('aria-busy', 'false');
}

function planByHand() {
  state.model = null;
  state.source = null;
  state.ref = null;
  setFaction(null);
  $('#aeSource').hidden = true;
  showNotice(null);
  renderDaevaLine();
  setFormLock();
  renderPlan();
}

function wireForm() {
  $('#aeAscentForm').addEventListener('submit', event => {
    event.preventDefault();
    state.role = $('#aeRole').value || state.role;
    if (!state.model) state.level = clampLevel($('#aeLevel').value, state.data?.progression);
    const className = $('#aeClass').value;
    if (!state.model && className !== state.className) selectClass(className).catch(fail);
    else renderPlan();
  });
  $('#aeClass').addEventListener('change', event => selectClass(event.target.value).catch(fail));
  $('#aeRole').addEventListener('change', event => { state.role = event.target.value; renderPlan(); });
  const levelChanged = event => {
    const value = clampLevel(event.target.value, state.data?.progression);
    if (value === state.level && String(event.target.value) === String(value)) return;
    state.level = value;
    renderPlan();
  };
  $('#aeLevel').addEventListener('change', levelChanged);
  $('#aeDaeva').addEventListener('click', event => { if (event.target.closest('[data-plan-by-hand]')) planByHand(); });
}

async function loadDaeva(ref) {
  try {
    return await loadCharacter(ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    showNotice('The armory is unavailable right now, so this plans by hand. Try your Daeva again in a minute.', 'warn');
    return null;
  }
}

async function start() {
  wireDrawer();
  setFaction(null);
  fillClassSelect();
  wireForm();
  const fromUrl = readUrl();
  const linked = refFromUrl();
  const active = roster.active();
  // A Daeva link wins; otherwise a manual class link; otherwise the active roster Daeva.
  state.ref = linked ?? (fromUrl.className ? null : active ? { serverId: active.serverId, characterId: active.characterId } : null);
  state.role = fromUrl.role;
  // Fetch the plan data while the armory answers: the class comes from the link or the roster entry.
  const sameDaeva = active && state.ref && String(active.serverId) === String(state.ref.serverId) && active.characterId === state.ref.characterId;
  prefetchAdvisor(fromUrl.className ?? (sameDaeva ? active.className : null));
  if (state.ref) {
    const loaded = await loadDaeva(state.ref);
    if (loaded && AION2_CLASSES.includes(loaded.model.profile.class)) {
      Object.assign(state, { model: loaded.model, source: loaded.source, className: loaded.model.profile.class, level: loaded.model.profile.level });
      setFaction(loaded.model.profile.raceName);
      showSource(loaded.source);
    } else state.ref = null;
  }
  if (!state.model) {
    state.className = fromUrl.className ?? 'Gladiator';
    state.level = Number.isFinite(fromUrl.level) ? fromUrl.level : 1;
  }
  renderDaevaLine();
  setFormLock();
  state.data = await loadAdvisor(state.className);
  state.level = clampLevel(state.level, state.data.progression);
  renderPlan();
  if (state.model) markCharacterShown();
  markReady();
}

function fail(error) {
  showNotice('The Ascent Plan could not load. Refresh the page to try again.', 'error');
  markReady();
  console.error(error);
}

start().catch(fail);
