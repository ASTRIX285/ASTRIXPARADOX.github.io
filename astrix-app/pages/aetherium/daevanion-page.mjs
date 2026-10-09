/**
 * Daevanion page (The Aetherium, hub/aetherium/daevanion/): one Daeva's boards laid out like the game's Daevanion
 * window. One tab per board in game order (the board is kept in the address as ?board=11), the board in the middle
 * drawn with the game's own node art, and a panel on the right with two tabs: Node (the tapped node) and Board Effect
 * (what the taken nodes add up to, and what is left). It shows the character's board as it is: no route numbers.
 * First paint needs only /aion2/character; a board's nodes are read when its tab opens, one call per board, kept for the visit.
 */
import { ArmoryUnavailable, ascentUrl, explain, loadBoard, loadDaevanionAdvice, prefetchDaevanionAdvice } from './aetherium-data.mjs';
import { $, esc } from './aetherium-ui.mjs';
import { LOCK_ICON, failPage, startCharacterPage, windowBar } from './character-page.mjs';
import { KIND_LABEL, boardGridStyle, nodeImg, nodeTileHtml } from './daevanion-board.mjs';
import { daevanionSkillNodes, indexProgression, pickBuild } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { nodeCost, planDaevanionBoard, summariseBoard } from '/astrix-app/games/aion2/engine/daevanion-planner.mjs';

const state = { model: null, source: null, ref: null, className: 'Gladiator', boards: [], plan: null, current: null, results: new Map(), planned: null, nodes: null, selected: null, panel: 'node' };

const points = cost => `${cost} ${cost === 1 ? 'point' : 'points'}`;

/** The five boards in game order, with what the character says about each (open, nodes taken) and what the game facts say (unlock level, focus). */
function boardList(model, advice) {
  const facts = advice ? (indexProgression(advice.progression)['daevanion-boards']?.value ?? []) : [];
  const live = id => model.daevanion.find(board => board.id === id) ?? null;
  const rows = facts.map(fact => {
    // Match by id or name: Asmodian boards carry their own ids (31 to 36), the facts list the Elyos ones. The link and the board call use the character's own id.
    const board = live(fact.id) ?? model.daevanion.find(item => item.name === fact.name) ?? null;
    return { id: board?.id ?? fact.id, name: fact.name, unlockLevel: fact.unlockLevel, focus: fact.focus, open: Boolean(board?.open), taken: board?.nodesTaken ?? 0, total: board?.nodesTotal ?? null };
  });
  for (const board of model.daevanion) if (!rows.some(row => row.id === board.id || row.name === board.name)) rows.push({ id: board.id, name: board.name, unlockLevel: null, focus: null, open: board.open, taken: board.nodesTaken, total: board.nodesTotal });
  return rows;
}

/** When a board opens, in words; the level comes from the game facts, so without them the page only says it is not open. */
const opensAt = board => (board.unlockLevel ? `Opens at Lv ${esc(board.unlockLevel)}` : 'Not open yet');

const boardOf = id => state.boards.find(board => board.id === id) ?? null;

/** The board in the address if it is one of the five, else the first open board, else the first. */
function startBoard() {
  const wanted = Number(new URLSearchParams(location.search).get('board'));
  return (boardOf(wanted) ?? state.boards.find(board => board.open) ?? state.boards[0])?.id ?? null;
}

function writeBoard() {
  const params = new URLSearchParams(location.search);
  params.set('board', state.current);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

/**
 * The nodes of one board. Opening a board that is not open yet still tries the call: the official site may send the grid
 * (drawn greyed) or nothing (then the page says when it opens). Results stay for the visit; a failed read of an open board does not.
 */
async function nodesFor(board) {
  if (state.results.has(board.id)) return state.results.get(board.id);
  let result;
  try {
    result = await loadBoard(state.model, board, state.source);
    if (result.nodes && !result.nodes.length) result = { nodes: null, reason: board.open ? 'The official AION 2 site sent no nodes for this board.' : 'closed' };
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable) && !(error instanceof TypeError)) throw error;
    if (board.open) return { nodes: null, reason: explain(error, 'The official AION 2 site is not answering right now. Pick this board again in a minute.') };
    result = { nodes: null, reason: 'closed' };
  }
  if (!board.open && !result.nodes) result = { nodes: null, reason: 'closed' };
  state.results.set(board.id, result);
  return result;
}

/* The right panel. */

function startPanel(board) {
  return `<div class="ae-node-panel-head">
      <span class="ae-node ae-node-big" data-kind="start" data-status="taken" aria-hidden="true">${nodeImg('start', true, state.className)}</span>
      <div><p class="ae-slot-label">Start</p><h3>${esc(board.name)} - Start</h3></div>
    </div>
    ${board.focus ? `<p class="ae-slot-label">Core nodes</p><p class="ae-node-why">${esc(board.focus)}</p>` : ''}
    ${board.unlockLevel ? `<dl class="ae-node-facts"><div><dt>Board starting level</dt><dd>${esc(board.unlockLevel)}</dd></div></dl>` : ''}`;
}

function nodePanel() {
  const board = boardOf(state.current);
  const tile = state.planned?.tiles.find(item => String(item.nodeId) === String(state.selected)) ?? null;
  if (!tile || tile.kind === 'start') return startPanel(board);
  const grade = tile.grade && tile.grade !== 'None' ? tile.grade : null;
  return `<div class="ae-node-panel-head">
      <span class="ae-node ae-node-big" data-kind="${esc(tile.kind)}" data-status="${tile.taken ? 'taken' : 'idle'}" aria-hidden="true">${nodeImg(tile.kind, tile.taken, state.className)}</span>
      <div><p class="ae-slot-label">${esc(KIND_LABEL[tile.kind] ?? 'Node')}</p><h3>${esc(tile.effects[0] || tile.name)}</h3>${tile.effects[0] && tile.name !== tile.effects[0] ? `<p class="ae-muted">${esc(tile.name)}</p>` : ''}</div>
    </div>
    <dl class="ae-node-facts">
      ${grade ? `<div><dt>Grade</dt><dd>${esc(grade)}</dd></div>` : ''}
      <div><dt>Cost</dt><dd>${esc(points(nodeCost({ type: tile.type, grade: tile.grade })))}</dd></div>
      <div><dt>Status</dt><dd>${tile.taken ? 'Taken' : 'Not taken'}</dd></div>
    </dl>
    ${tile.effects.length ? `<p class="ae-slot-label">Effect</p><ul class="ae-node-lines">${tile.effects.map(effect => `<li>${esc(effect)}</li>`).join('')}</ul>` : ''}
    <p class="ae-muted ae-node-note">Check the cost in game before you spend.</p>`;
}

function effectList(rows, empty) {
  return rows.length ? `<ul class="ae-effect-list">${rows.map(row => `<li>${esc(row.text)}</li>`).join('')}</ul>` : `<p class="ae-empty">${esc(empty)}</p>`;
}

function leftList(rows, empty) {
  return rows.length
    ? `<ul class="ae-left-list">${rows.map(row => `<li class="ae-left-node" role="button" tabindex="0" data-left-node="${esc(row.nodeId)}"><span>${esc(row.text)}</span><small>${esc(points(row.cost))}</small></li>`).join('')}</ul>`
    : `<p class="ae-empty">${esc(empty)}</p>`;
}

function effectPanel() {
  if (!state.nodes) return '<p class="ae-empty">No board to add up yet.</p>';
  const sum = summariseBoard(state.nodes, state.plan);
  return `<div class="ae-effect">
      <h3 class="ae-effect-title">Skill Effect</h3>
      ${effectList(sum.skillEffects, 'No skill nodes taken yet.')}
      <h3 class="ae-effect-title">Stat Effect</h3>
      ${effectList(sum.statEffects, 'No stat nodes taken yet.')}
      <h3 class="ae-effect-title">What is left</h3>
      <p class="ae-effect-sub">Key skill nodes</p>${leftList(sum.left.keySkills, 'All taken.')}
      <p class="ae-effect-sub">Corners</p>${leftList(sum.left.corners, 'All taken.')}
      <p class="ae-effect-total"><b>${sum.left.count}</b> ${sum.left.count === 1 ? 'node' : 'nodes'} left · <b>${sum.left.points}</b> points</p>
    </div>`;
}

function renderPanel() {
  document.querySelectorAll('[data-panel]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.panel === state.panel)));
  $('#aeDvPanelBody').innerHTML = state.panel === 'effect' ? effectPanel() : nodePanel();
}

/* The board. */

function boardMessage(board, result) {
  if (result.reason === 'closed') {
    return `<div class="ae-dv-closed"><span class="ae-dv-lock">${LOCK_ICON}</span><h2>${opensAt(board)}</h2>${board.focus ? `<p>${esc(board.focus)}</p>` : ''}</div>`;
  }
  return `<p class="ae-pending"><span>No board to show.</span> ${esc(result.reason)}</p>`;
}

function drawBoard(board, result) {
  const stage = $('#aeDvBoard');
  state.nodes = result.nodes;
  if (!result.nodes) {
    state.planned = null;
    stage.innerHTML = boardMessage(board, result);
    return;
  }
  const planned = planDaevanionBoard({ nodes: result.nodes, skillOrder: [] });
  state.planned = planned;
  const greyed = !board.open;
  const tiles = planned.tiles.map(tile => nodeTileHtml(tile, planned.bounds, {
    className: state.className,
    status: tile.taken || tile.kind === 'start' ? 'taken' : 'idle',
    label: `${tile.name}. ${tile.effects.join(', ') || KIND_LABEL[tile.kind]}. ${tile.taken ? 'Taken' : 'Not taken'}`
  })).join('');
  stage.innerHTML = `${greyed ? `<p class="ae-dv-banner"><span class="ae-pad">${LOCK_ICON}</span>${opensAt(board)}${board.focus ? `. ${esc(board.focus)}` : ''}</p>` : ''}
    <div class="ae-board-stage${greyed ? ' is-greyed' : ''}" id="aeBoardStage"><div class="ae-board-grid is-fit" style="${boardGridStyle(planned.bounds)}">${tiles}</div></div>
    <ul class="ae-node-legend" aria-label="Key">
      <li class="ae-legend-art">${nodeImg('stat', true, state.className)}Taken</li>
      <li class="ae-legend-art">${nodeImg('active-skill', false, state.className)}Skill +1</li><li class="ae-legend-art">${nodeImg('passive-skill', false, state.className)}Passive +1</li><li class="ae-legend-art">${nodeImg('unique', false, state.className)}Corner</li><li class="ae-legend-art">${nodeImg('stat', false, state.className)}Stat</li>
    </ul>`;
}

function selectNode(nodeId, { scroll = false } = {}) {
  state.selected = nodeId;
  document.querySelectorAll('.ae-node.is-selected').forEach(el => el.classList.remove('is-selected'));
  document.querySelector(`.ae-node[data-node="${CSS.escape(String(nodeId))}"]`)?.classList.add('is-selected');
  state.panel = 'node';
  renderPanel();
  if (scroll && matchMedia('(max-width:899px)').matches) $('#aeDvPanel').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function showBoard(boardId) {
  const board = boardOf(boardId);
  if (!board) return;
  state.current = boardId;
  state.selected = null;
  writeBoard();
  document.querySelectorAll('[data-board]').forEach(tab => tab.setAttribute('aria-selected', String(Number(tab.dataset.board) === boardId)));
  $('#aeDvBoard').innerHTML = '<p class="ae-muted ae-dv-reading">Reading the board.</p>';
  $('#aeDvPlan').href = ascentUrl(state.ref, state.className, { screen: 'daevanion', board: boardId });
  const result = await nodesFor(board);
  if (state.current !== boardId) return;
  drawBoard(board, result);
  state.panel = 'node';
  const start = state.planned?.tiles.find(tile => tile.kind === 'start');
  if (start) selectNode(start.nodeId); else renderPanel();
}

function render({ model, source, ref }, advice) {
  const build = advice?.builds ? pickBuild(advice.builds, null) : null;
  Object.assign(state, { model, source, ref, className: model.profile.class });
  state.plan = { daevanion: { skillNodes: build && build.status !== 'pending' ? daevanionSkillNodes(build) : [] } };
  state.boards = boardList(model, advice);
  state.current = startBoard();
  document.title = 'Daevanion | Gear Ledger | The Aetherium | AION 2 | ASTRIX PARADOX';
  $('#aeStage').innerHTML = `<div class="ae-gw ae-dv-window" data-view="daevanion">
    ${windowBar({ title: 'Daevanion', model, ref })}
    <div class="ae-gw-tabs is-centred" role="tablist" aria-label="Daevanion boards">${state.boards.map(board => `<button type="button" role="tab" class="ae-gw-tab${board.open ? '' : ' is-locked'}" data-board="${esc(board.id)}" aria-selected="${board.id === state.current}">${board.open ? '' : `<span class="ae-pad">${LOCK_ICON}</span>`}${esc(board.name)}</button>`).join('')}</div>
    <div class="ae-gw-body">
      <div class="ae-dv">
        <section class="ae-dv-board" id="aeDvBoard" aria-live="polite"></section>
        <aside class="ae-dv-panel" id="aeDvPanel" aria-label="Node and board effect">
          <div class="ae-dv-tabs" role="tablist" aria-label="Panel"><button type="button" role="tab" class="ae-gw-tab" data-panel="node" aria-selected="true">Node</button><button type="button" role="tab" class="ae-gw-tab" data-panel="effect" aria-selected="false">Board Effect</button></div>
          <div class="ae-node-panel" id="aeDvPanelBody" aria-live="polite"></div>
          <a class="btn ae-dv-plan" id="aeDvPlan" href="${esc(ascentUrl(ref, model.profile.class, { screen: 'daevanion' }))}">Plan my route</a>
        </aside>
      </div>
    </div>
  </div>`;
  const stage = $('#aeStage');
  stage.addEventListener('click', event => {
    const tab = event.target.closest('[data-board]');
    if (tab) { showBoard(Number(tab.dataset.board)).catch(error => failPage('Daevanion page', error)); return; }
    const panel = event.target.closest('[data-panel]');
    if (panel) { state.panel = panel.dataset.panel; renderPanel(); return; }
    const left = event.target.closest('[data-left-node]');
    if (left) { selectNode(left.dataset.leftNode, { scroll: true }); return; }
    const node = event.target.closest('.ae-node[data-node]');
    if (node) selectNode(node.dataset.node, { scroll: true });
  });
  stage.addEventListener('keydown', event => {
    const node = event.target.closest?.('.ae-node[data-node],[data-left-node]');
    if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node.dataset.node ?? node.dataset.leftNode); }
  });
  // The page is ready once its shell is up; the board fills in when its call answers.
  showBoard(state.current).catch(error => failPage('Daevanion page', error));
}

startCharacterPage({
  prefetch: className => prefetchDaevanionAdvice(className),
  async render(loaded) {
    // The game facts and the class's builds are small static files; a failed read leaves the boards without focus text and key skills.
    const advice = await loadDaevanionAdvice(loaded.model.profile.class).catch(() => null);
    await render(loaded, advice);
  }
}).catch(error => failPage('Daevanion page', error));
