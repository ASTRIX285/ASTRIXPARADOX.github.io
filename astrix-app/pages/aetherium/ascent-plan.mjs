/**
 * Ascent Plan (The Aetherium): what to do next, for any class, role and level.
 *
 * Two ways in. With a Daeva (from the link or the active roster slot) the plan reads the armory
 * and adds fixes for that exact character. Without one, a new player picks class, role and level
 * and gets the plan from static data alone, with no armory call. Advice comes from
 * games/aion2/engine/ascent-advisor.mjs; the sources behind every pick stay in the data, never on the page.
 */
import { ArmoryUnavailable, ascentUrl, loadAdvisor, loadBoard, loadCharacter, prefetchAdvisor, refFromUrl, roster } from './aetherium-data.mjs';
import { $, esc, isPending, markCharacterShown, markReady, setFaction, showNotice, showSource, wireDrawer } from './aetherium-ui.mjs';
import { AION2_CLASSES, ROLES, buildAscentPlan, clampLevel } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { affordable, explainNode, planDaevanionBoard } from '/astrix-app/games/aion2/engine/daevanion-planner.mjs';

const state = { model: null, source: null, ref: null, className: 'Gladiator', role: null, level: 1, data: null, plan: null };
const planner = { boardId: null, nodes: new Map(), selected: null, board: null, split: null, observer: null };
const POINTS_KEY = 'aetherium.daevanionPoints.v1';

const BEGINNER = { 'very high': 'Very easy to learn', high: 'Easy to learn', medium: 'Medium to learn', low: 'Hard to learn' };
const CONFIDENCE = {
  consensus: 'Most top builds agree on these.',
  'top-player data': 'What top players run.',
  'single-source': 'An early pick, less tested.'
};

const pendingNote = value => `<p class="ae-pending"><span>Not confirmed yet.</span> ${esc(value.reason)}</p>`;

function fillClassSelect() {
  $('#aeClass').innerHTML = AION2_CLASSES.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
}

function fillRoleSelect(roles, chosen) {
  $('#aeRole').innerHTML = roles.map(item => {
    const tag = item.main ? 'main role' : item.status === 'pending' ? 'no build yet' : item.status === 'partial' ? 'partly confirmed' : item.buildLabel;
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
      <strong>${esc(item.title)}</strong>
      <span>${esc(item.detail)}</span>
      ${item.kind === 'armory' ? '<small class="ae-tag">From your character</small>' : ''}
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
        <div class="ae-skill-head"><strong>${esc(skill.name)}</strong>${state_}</div>
        <p class="ae-muted">${esc(skill.why)} <span class="ae-target">Target: ${esc(skill.target)}${cd}.</span></p>
        ${skill.picks.length ? `<ul class="ae-picks">${skill.picks.map(pick => `<li${skill.skillLevel !== null && pick.skillLevel <= skill.skillLevel ? ' class="is-open"' : ''}><span class="ae-pick-level">Skill Lv ${esc(pick.skillLevel)}</span>${esc(pick.pick)}</li>`).join('')}</ul>` : ''}
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
    `;
  return `<section class="ae-panel" aria-labelledby="aeMacroTitle">
    <h2 class="ae-section-title" id="aeMacroTitle">Macro and rotation <small>priority order</small></h2>
    ${body}
    ${order ? `<div class="ae-callout"><p><b>Check in game:</b> ${esc(isPending(order.value) ? order.value.reason : order.text)}</p><p class="ae-muted">${esc(order.text)}</p></div>` : ''}
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
    <p class="ae-muted">${esc(CONFIDENCE[s.confidence] ?? '')}${s.note ? ` ${esc(s.note)}` : ''}</p>
    ${s.alternatives.length ? `<p class="ae-slot-label">Also worth a look</p><ul class="ae-alts">${s.alternatives.map(alt => `<li><strong>${esc(alt.name)}</strong> ${esc(alt.why)}</li>`).join('')}</ul>` : ''}
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
    ${isPending(d.priorities) ? pendingNote(d.priorities) : `<p class="ae-slot-label">Take these first</p><ol class="ae-list">${d.priorities.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`}
    ${d.general ? `<p class="ae-note">${esc(d.general.text)}</p>` : ''}
  </section>`;
}

function renderStats(plan) {
  const s = plan.stats;
  return `<section class="ae-panel" aria-labelledby="aeStatPlanTitle">
    <h2 class="ae-section-title" id="aeStatPlanTitle">Stats to look for <small>on gear and manastones</small></h2>
    ${isPending(s) ? pendingNote(s) : `<ol class="ae-list">${s.order.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`}
  </section>`;
}

function renderUpcoming(plan) {
  if (!plan.upcoming.length) return '';
  return `<section class="ae-panel" aria-labelledby="aeNextTitle">
    <h2 class="ae-section-title" id="aeNextTitle">Coming up <small>as you level</small></h2>
    <ol class="ae-timeline">${plan.upcoming.slice(0, 10).map(item => `<li data-kind="${esc(item.kind)}"><span class="ae-pick-level">Lv ${esc(item.level)}</span>${esc(item.text)}</li>`).join('')}</ol>
  </section>`;
}



/* Daevanion planner: the real board from the armory, with a numbered route for this build. */
const KIND_LABEL = { 'active-skill': 'Skill +1', 'passive-skill': 'Passive +1', unique: 'Corner', stat: 'Stat', start: 'Start' };
const daevaKey = () => state.model ? `${state.model.profile.server.id}:${state.model.profile.characterId}` : null;

function readPoints(boardId) {
  try { return JSON.parse(localStorage.getItem(POINTS_KEY) ?? '{}')?.[daevaKey()]?.[boardId] ?? ''; } catch { return ''; }
}
function writePoints(boardId, value) {
  try {
    const all = JSON.parse(localStorage.getItem(POINTS_KEY) ?? '{}') ?? {};
    all[daevaKey()] = { ...(all[daevaKey()] ?? {}), [boardId]: value };
    localStorage.setItem(POINTS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the number lasts for this visit */ }
}

function renderPlannerShell(plan) {
  if (!state.model) {
    return `<section class="ae-panel ae-planner" id="aePlanner" aria-labelledby="aePlannerTitle">
      <h2 class="ae-section-title" id="aePlannerTitle">Daevanion planner <small>your real boards</small></h2>
      <p class="ae-muted">The planner draws your own Daevanion boards and numbers the nodes to take, in order, for this build. Find your Daeva first.</p>
      <p><a class="btn ae-primary" href="/hub/aetherium/">Find your Daeva</a></p>
    </section>`;
  }
  const open = plan.daevanion.boards.filter(board => board.open);
  if (!open.length) {
    return `<section class="ae-panel ae-planner" id="aePlanner"><h2 class="ae-section-title">Daevanion planner</h2><p class="ae-muted">No board is open yet. Nezekan opens at Lv 12.</p></section>`;
  }
  if (!open.some(board => board.id === planner.boardId)) planner.boardId = open[0].id;
  return `<section class="ae-panel ae-planner" id="aePlanner" aria-labelledby="aePlannerTitle">
    <div class="ae-planner-head">
      <h2 class="ae-section-title" id="aePlannerTitle">Daevanion planner <small>${esc(state.model.profile.name)}'s boards</small></h2>
      <div class="ae-planner-tabs" role="tablist" aria-label="Daevanion boards">${open.map(board => `<button type="button" role="tab" class="ae-planner-tab" data-board-tab="${esc(board.id)}" aria-selected="${board.id === planner.boardId}">${esc(board.name)}</button>`).join('')}</div>
      <label class="ae-field ae-points"><span>Points you have</span><input id="aePoints" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="See the top of your Daevanion screen"></label>
    </div>
    <div id="aePlannerBody"><p class="ae-muted">Reading the board.</p></div>
  </section>`;
}

async function showBoard(boardId) {
  if (planner.boardId !== boardId) planner.selected = null;
  planner.boardId = boardId;
  document.querySelectorAll('[data-board-tab]').forEach(tab => tab.setAttribute('aria-selected', String(Number(tab.dataset.boardTab) === boardId)));
  if ($('#aePoints')) $('#aePoints').value = readPoints(boardId);
  const body = $('#aePlannerBody');
  if (!body) return;
  if (!planner.nodes.has(boardId)) {
    body.innerHTML = '<p class="ae-muted">Reading the board.</p>';
    const board = state.model.daevanion.find(item => item.id === boardId);
    let result;
    try { result = await loadBoard(state.model, board, state.source); }
    catch (error) {
      if (!(error instanceof ArmoryUnavailable)) throw error;
      result = { nodes: null, reason: 'The armory is unavailable right now. Pick the board again in a minute.' };
    }
    if (planner.boardId !== boardId) return;
    if (!result.nodes) { body.innerHTML = `<p class="ae-muted">${esc(result.reason)}</p>`; return; }
    planner.nodes.set(boardId, result.nodes);
  }
  renderBoardPlan();
}

function plannerContext() {
  const plan = state.plan;
  const board = plan.daevanion.boards.find(item => item.id === planner.boardId);
  const cooldowns = new Map((state.data.skills.records ?? []).filter(record => record.class === state.className && typeof record.cooldownSeconds === 'number').map(record => [record.name, record.cooldownSeconds]));
  return { skillOrder: plan.daevanion.skillNodes, cooldowns, boardName: board?.name, boardFocus: board?.focus };
}

function renderBoardPlan() {
  const body = $('#aePlannerBody');
  const nodes = planner.nodes.get(planner.boardId);
  if (!body || !nodes) return;
  const plan = state.plan;
  const board = planDaevanionBoard({ nodes, skillOrder: plan.daevanion.skillNodes });
  planner.board = board;
  const points = readPoints(planner.boardId);
  const split = points === '' ? null : affordable(board.route, points);
  planner.split = split;
  const nowSteps = new Set((split?.now ?? []).map(step => step.step));
  const statusOf = step => split ? (nowSteps.has(step) ? 'now' : 'later') : 'route';
  const { top, left, bottom, right } = board.bounds;
  const tiles = board.tiles.map(tile => {
    const status = tile.taken || tile.kind === 'start' ? 'taken' : tile.step ? statusOf(tile.step) : 'idle';
    const label = `${tile.name}. ${tile.effects.join(', ') || KIND_LABEL[tile.kind]}. ${tile.taken ? 'Taken' : tile.step ? `Step ${tile.step}` : 'Not on the route'}`;
    // Not a <button>: the shared button skin would turn every node into a gold action button.
    return `<span class="ae-node" role="img" tabindex="0" data-kind="${esc(tile.kind)}" data-status="${status}"${tile.keySkill ? ' data-key="true"' : ''} data-node="${esc(tile.nodeId)}" data-rc="${tile.row}:${tile.col}" style="grid-row:${tile.row - top + 1};grid-column:${tile.col - left + 1}" aria-label="${esc(label)}"><i class="ae-node-glyph" aria-hidden="true"></i>${tile.step && !tile.taken ? `<span class="ae-node-step" aria-hidden="true">${tile.step}</span>` : ''}</span>`;
  }).join('');
  const stepItem = step => `<li data-status="${statusOf(step.step)}"${step.target ? ' data-target="true"' : ''} data-route-node="${esc(step.nodeId)}" tabindex="0">
      <span class="ae-pick-level">${step.step}</span>
      <span><strong>${esc(step.effects[0] || step.name)}</strong><small>${step.target ? 'Goal' : `To reach ${esc(step.targetName)}`} · ${step.cost} ${step.cost === 1 ? 'point' : 'points'}${split ? '' : ` · ${step.totalCost} in total`}</small></span>
    </li>`;
  const summary = split
    ? (split.now.length
        ? `You can take the next <b>${split.now.length}</b> ${split.now.length === 1 ? 'node' : 'nodes'} now (${split.now.at(-1).totalCost} of your ${esc(points)} points).${split.shortBy ? ` Step ${split.now.length + 1} needs ${split.shortBy} more ${split.shortBy === 1 ? 'point' : 'points'}.` : ' That finishes the route on this board.'}`
        : (board.route.length ? `Step 1 needs ${split.shortBy} more ${split.shortBy === 1 ? 'point' : 'points'}.` : 'The route on this board is done.'))
    : 'Enter the points you have (top of your Daevanion screen) to see which steps you can take now.';
  const list = split ? [...split.now, ...split.later.slice(0, 6)] : board.route.slice(0, 12);
  body.innerHTML = `
    <div class="ae-planner-grid">
      <div class="ae-board-wrap">
        <div class="ae-board-stage" id="aeBoardStage">
          <svg class="ae-flow" id="aeFlow" aria-hidden="true"></svg>
          <div class="ae-board-grid" style="--rows:${bottom - top + 1};--cols:${right - left + 1}">${tiles}</div>
        </div>
        <ul class="ae-node-legend" aria-label="Key">
          <li data-status="taken">Taken</li><li data-status="now">Take now</li><li data-status="later">Later</li>
          <li data-kind="active-skill">Skill +1</li><li data-kind="passive-skill">Passive +1</li><li data-kind="unique">Core corner</li><li data-kind="stat">Stat</li>
        </ul>
      </div>
      <div class="ae-route">
        <aside class="ae-node-panel" id="aeNodePanel" aria-live="polite"></aside>
        <p class="ae-route-summary" id="aeRouteSummary">${summary}</p>
        <p class="ae-muted ae-route-meta">${board.takenCount} of ${board.totalNodes} nodes taken · ${board.pointsSpent} of ${board.pointsTotal} points spent · key skill nodes ${board.targets.skillsTaken} of ${board.targets.skills}</p>
        ${board.route.length ? `<ol class="ae-route-list">${list.map(stepItem).join('')}</ol>${board.route.length > list.length ? `<p class="ae-muted">${board.route.length - list.length} more steps after these. Tap any numbered node on the board to see it.</p>` : ''}` : '<p class="ae-muted">Every key skill node and corner on this board is taken.</p>'}
        <p class="ae-note">The route takes this build's key skill nodes first (${esc(plan.daevanion.skillNodes.join(', '))}), then the four core corners, nearest first, along the shortest path from what you have. Each node costs 1, 2, 3 or 4 points by rarity; check the cost in game before you spend.</p>
      </div>
    </div>`;
  drawFlow();
  if (planner.observer) planner.observer.disconnect();
  if (typeof ResizeObserver === 'function') { planner.observer = new ResizeObserver(drawFlow); planner.observer.observe($('#aeBoardStage')); }
  const next = (split?.now[0] ?? split?.later[0] ?? board.route[0]);
  selectNode(planner.selected ?? next?.nodeId ?? board.tiles.find(tile => tile.kind === 'start')?.nodeId);
}

/** The suggested flow: a glowing link from each step to the node it grows from, drawn behind the tiles. */
function drawFlow() {
  const stage = $('#aeBoardStage'), svg = $('#aeFlow');
  if (!stage || !svg || !planner.board) return;
  const box = stage.getBoundingClientRect();
  const centre = rc => {
    const el = stage.querySelector(`[data-rc="${rc}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
  };
  const nowSteps = new Set((planner.split?.now ?? []).map(step => step.step));
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = planner.board.route.filter(step => step.from).map(step => {
    const a = centre(`${step.from.row}:${step.from.col}`), b = centre(`${step.row}:${step.col}`);
    if (!a || !b) return '';
    const status = planner.split ? (nowSteps.has(step.step) ? 'now' : 'later') : 'route';
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" data-status="${status}"/>`;
  }).join('');
}

function selectNode(nodeId) {
  const board = planner.board;
  const tile = board?.tiles.find(item => String(item.nodeId) === String(nodeId));
  if (!tile) return;
  planner.selected = tile.nodeId;
  document.querySelectorAll('.ae-node.is-selected,[data-route-node].is-selected').forEach(el => el.classList.remove('is-selected'));
  document.querySelector(`.ae-node[data-node="${CSS.escape(String(tile.nodeId))}"]`)?.classList.add('is-selected');
  document.querySelector(`[data-route-node="${CSS.escape(String(tile.nodeId))}"]`)?.classList.add('is-selected');
  const why = explainNode(tile, board.route, plannerContext());
  const nowSteps = new Set((planner.split?.now ?? []).map(step => step.step));
  const status = tile.kind === 'start' || tile.taken ? 'Taken' : why.step ? (planner.split ? (nowSteps.has(why.step) ? 'Take now' : 'Later') : `Step ${why.step}`) : 'Not on the route';
  $('#aeNodePanel').innerHTML = `
    <div class="ae-node-panel-head">
      <span class="ae-node ae-node-big" data-kind="${esc(tile.kind)}" data-status="${tile.taken || tile.kind === 'start' ? 'taken' : why.step ? 'route' : 'idle'}" aria-hidden="true"><i class="ae-node-glyph"></i></span>
      <div><p class="ae-slot-label">${esc(KIND_LABEL[tile.kind] ?? 'Node')}${why.step ? ` · step ${why.step}` : ''}</p><h3>${esc(tile.effects[0] || why.title)}</h3><p class="ae-muted">${esc(why.title)}</p></div>
    </div>
    <dl class="ae-node-facts"><div><dt>Status</dt><dd>${esc(status)}</dd></div>${tile.kind === 'start' ? '' : `<div><dt>Cost</dt><dd>${why.cost} ${why.cost === 1 ? 'point' : 'points'}</dd></div>`}</dl>
    <p class="ae-slot-label">Why</p>
    ${why.lines.map(line => `<p class="ae-node-why">${esc(line)}</p>`).join('')}`;
}

function renderPlan() {
  const plan = buildAscentPlan({ className: state.className, role: state.role, level: state.level, data: state.data, model: state.model });
  state.plan = plan;
  state.role = plan.role;
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
        <p>${esc(plan.build.summary)}</p>
      </div>
      <ul class="ae-chips" aria-label="Build facts">
        ${plan.build.beginner ? `<li>${esc(BEGINNER[plan.build.beginner] ?? plan.build.beginner)}</li>` : ''}
        <li>Level cap ${esc(plan.levelCap)}</li>
      </ul>
    </section>${fallback}`;
  if (plan.pending) {
    $('#aePlan').innerHTML = `${header}<section class="ae-panel">${pendingNote(plan.pending)}<p><a class="btn ae-primary" href="?class=${esc(plan.className.toLowerCase())}&level=${esc(plan.level)}">Show the ${esc(plan.className)} main role instead</a></p></section>`;
  } else {
    $('#aePlan').innerHTML = `${header}
      <div class="ae-ascent-grid">
        <div class="ae-col ae-ascent-main">${renderNow(plan)}${renderSkills(plan)}</div>
        <div class="ae-ascent-side">
          <div class="ae-col">${renderStigmas(plan)}${renderRotation(plan)}</div>
          <div class="ae-col">${renderBoards(plan)}${renderStats(plan)}${renderUpcoming(plan)}</div>
        </div>
      </div>
      ${renderPlannerShell(plan)}
      `;
  }
  writeUrl();
  if (state.model && planner.boardId !== null && document.querySelector('#aePlannerBody')) showBoard(planner.boardId).catch(fail);
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
  $('#aePlan').addEventListener('click', event => {
    const tab = event.target.closest('[data-board-tab]');
    if (tab) { showBoard(Number(tab.dataset.boardTab)).catch(fail); return; }
    const node = event.target.closest('[data-node],[data-route-node]');
    if (node) selectNode(node.dataset.node ?? node.dataset.routeNode);
  });
  $('#aePlan').addEventListener('keydown', event => {
    const node = event.target.closest?.('[data-node],[data-route-node]');
    if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node.dataset.node ?? node.dataset.routeNode); }
  });
  $('#aePlan').addEventListener('input', event => {
    if (event.target.id !== 'aePoints') return;
    const value = event.target.value === '' ? '' : String(Math.max(0, Math.min(999, Math.round(Number(event.target.value)) || 0)));
    writePoints(planner.boardId, value);
    clearTimeout(planner.timer);
    planner.timer = setTimeout(renderBoardPlan, 200);
  });
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
