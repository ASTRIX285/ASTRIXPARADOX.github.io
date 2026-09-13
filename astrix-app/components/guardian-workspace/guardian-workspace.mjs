const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
const query = (root, selector) => root.querySelector(selector);
const queryAll = (root, selector) => [...root.querySelectorAll(selector)];

function setText(root, selector, value) {
  const node = query(root, selector);
  if (node) node.textContent = value ?? '';
}

function iconMarkup(item, fallbackUrl = '') {
  const url = item?.iconUrl || fallbackUrl;
  return url
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">`
    : '<span class="gw-tile-placeholder" aria-hidden="true"></span>';
}

function tile(item, options = {}) {
  const meta = options.meta ?? (item.equipped ? 'Equipped' : item.unlocked ? 'Available' : 'Locked');
  return `<button class="gw-tile${item.equipped ? ' is-equipped' : ''}" data-selection-id="${escapeHtml(item.id)}" data-selection-name="${escapeHtml(item.name)}" data-selection-detail="${escapeHtml(item.description || meta)}" aria-pressed="${item.equipped ? 'true' : 'false'}">${iconMarkup(item, options.fallbackUrl)}<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(meta)}</span></button>`;
}

function renderMeasures(items = []) {
  return items.map(item => `<div class="gw-meter"><div><div class="gw-meter-label">${escapeHtml(item.label)}</div><div class="gw-meter-track"><i style="width:${clamp(item.value)}%"></i></div></div><div class="gw-meter-value">${escapeHtml(item.value)}%</div></div>`).join('');
}

function renderCoverage(coverage = {}) {
  const champions = coverage.champions || [];
  return `<h4>Champion Coverage</h4>${champions.map(item => `<p><span class="${item.covered ? 'gw-good' : 'gw-bad'}">${item.covered ? '✓' : '×'}</span> ${escapeHtml(item.name)}</p>`).join('')}<h4>Element Match</h4><p><span class="gw-good">◉</span> ${escapeHtml(coverage.elementMatch || 'No activity selected')}</p>`;
}

function renderPath(loop) {
  if (!loop || !Array.isArray(loop.nodes) || !loop.nodes.length) return '<p class="gw-analysis-copy">No evidence path supplied.</p>';
  return `<div class="gw-path">${loop.nodes.map((node, index) => `${index ? '<span class="gw-path-arrow">→</span>' : ''}<span class="gw-path-node"><i>${escapeHtml(node.symbol || '◇')}</i>${escapeHtml(node.label || node)}</span>`).join('')}</div>`;
}

function renderRecommendations(items = []) {
  if (!items.length) return '<p class="gw-analysis-copy">No change required.</p>';
  return items.map(item => `<article class="gw-rec"><span class="gw-rec-icon">◇</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div><button type="button" data-selection-id="${escapeHtml(item.id)}" data-selection-name="${escapeHtml(item.title)}" data-selection-detail="${escapeHtml(item.tradeOff || item.reason)}">View</button></article>`).join('');
}

function weaponCard(item) {
  return `<article class="gw-dock-card" tabindex="0" data-selection-id="${escapeHtml(item.id || item.name)}" data-selection-name="${escapeHtml(item.name)}" data-selection-detail="${escapeHtml(item.description || item.slot || 'Equipped weapon')}"><header><small>${escapeHtml(item.slot || 'Weapon')}</small></header><div class="gw-weapon-card">${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="" loading="lazy">` : '<span class="gw-weapon-placeholder"></span>'}<div><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.type || 'Equipment')}</p><div class="gw-weapon-power">${escapeHtml(item.power ?? 'Unavailable')}</div></div></div></article>`;
}

function renderMods(items = []) {
  const visible = items.length ? items : Array.from({length: 8}, (_, index) => ({name:`Mod ${index + 1}`}));
  return `<div class="gw-mod-grid">${visible.slice(0, 8).map(item => `<button class="gw-mod-dot" type="button" data-selection-id="${escapeHtml(item.id || item.name)}" data-selection-name="${escapeHtml(item.name)}" data-selection-detail="${escapeHtml(item.description || 'Armour mod')}">${escapeHtml(item.symbol || '◇')}</button>`).join('')}</div>`;
}

function renderStats(items = []) {
  return items.map(item => `<div class="gw-stat-row"><span>${escapeHtml(item.name)}</span><span class="gw-stat-bar"><i style="width:${clamp(item.value)}%"></i></span><strong>${escapeHtml(item.value)}</strong></div>`).join('');
}

function renderArmourRail(items = []) {
  return items.map(item => `<button class="gw-armour-chip" type="button" data-selection-id="${escapeHtml(item.id || item.name)}" data-selection-name="${escapeHtml(item.name)}" data-selection-detail="${escapeHtml(item.description || item.slot || 'Equipped armour')}">${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="" loading="lazy">` : ''}<strong>${escapeHtml(item.power ?? '')}</strong><span>${escapeHtml(item.slot || '')}</span></button>`).join('');
}

function renderStageStats(items = []) {
  return items.map(item => `<div class="gw-stage-stat"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('');
}

function renderActivity(activity) {
  if (!activity) return '<p class="gw-analysis-copy">No activity selected.</p>';
  return `<div class="gw-activity-card"><strong>${escapeHtml(activity.name)}</strong><p>${escapeHtml(activity.location || '')}</p><p>Champions: ${escapeHtml((activity.champions || []).join(', ') || 'None')}</p><p>Surge: ${escapeHtml(activity.surge || 'None')}</p></div>`;
}

function renderGuardian(root, state) {
  const globalRoot = document;
  const accent = state.subclass?.element?.accent || '#9f64ff';
  const rgb = state.subclass?.element?.accentRgb || '159,100,255';
  document.documentElement.style.setProperty('--gw-accent', accent);
  document.documentElement.style.setProperty('--gw-accent-rgb', rgb);

  setText(globalRoot, '[data-gw-account]', `${state.player?.displayName || 'Player'}${state.player?.membershipCode ? `#${state.player.membershipCode}` : ''}`);
  setText(globalRoot, '[data-gw-season]', state.player?.seasonLabel || 'DESTINY 2');
  setText(root, '[data-gw-notice]', state.notice || 'Guardian data ready');
  setText(root, '[data-gw-subclass]', state.subclass?.name || 'Subclass');
  setText(root, '[data-gw-class]', state.character?.className || 'Character');
  setText(root, '[data-gw-element]', state.subclass?.element?.name ? `· ${state.subclass.element.name}` : '');
  setText(root, '[data-gw-power]', state.character?.power ?? 'Unavailable');
  setText(root, '[data-gw-title]', state.character?.title || 'Guardian');
  setText(root, '[data-gw-score]', state.analysis?.score ?? '--');
  setText(root, '[data-gw-loop-summary]', state.analysis?.summary || 'Connect a Bungie account to generate a verified personal explanation.');

  const crest = query(root, '[data-gw-crest]');
  if (crest) crest.src = state.subclass?.element?.crestUrl || '';

  const render = query(root, '[data-gw-render]');
  if (render) {
    render.innerHTML = state.character?.renderUrl
      ? `<img src="${escapeHtml(state.character.renderUrl)}" alt="${escapeHtml(state.character.className || 'Guardian')} character render">`
      : `<div class="gw-render-fallback"><img src="${escapeHtml(state.subclass?.element?.crestUrl || '')}" alt="${escapeHtml(state.subclass?.element?.name || 'Subclass')} crest"></div>`;
  }

  const supers = state.subclass?.supers || [];
  const aspects = state.subclass?.aspects || [];
  const fragments = state.subclass?.fragments || [];
  const artifact = state.subclass?.artifact?.perks || [];
  const elementCrest = state.subclass?.element?.crestUrl || '';

  setText(root, '[data-gw-super-count]', `${supers.filter(item => item.equipped).length} equipped`);
  setText(root, '[data-gw-aspect-count]', `${aspects.filter(item => item.equipped).length} / ${state.subclass?.aspectCapacity ?? aspects.length}`);
  setText(root, '[data-gw-fragment-count]', `${fragments.filter(item => item.equipped).length} / ${state.subclass?.fragmentCapacity ?? fragments.length}`);
  setText(root, '[data-gw-artifact-count]', `${state.subclass?.artifact?.unlockedCount ?? artifact.filter(item => item.unlocked).length} unlocked`);

  query(root, '[data-gw-supers]').innerHTML = supers.map(item => tile(item)).join('');
  query(root, '[data-gw-abilities]').innerHTML = (state.subclass?.abilities || []).map(item => tile(item, {meta:item.slot, fallbackUrl:elementCrest})).join('');
  query(root, '[data-gw-aspects]').innerHTML = aspects.map(item => tile(item, {meta:`${item.fragmentSlots ?? 0} fragment slots`})).join('');
  query(root, '[data-gw-fragments]').innerHTML = fragments.map(item => tile(item, {meta:item.statText, fallbackUrl:elementCrest})).join('');
  query(root, '[data-gw-artifact]').innerHTML = artifact.map(item => tile({...item,equipped:item.active}, {meta:item.active ? 'Active' : item.unlocked ? 'Unlocked' : 'Locked', fallbackUrl:elementCrest})).join('');

  query(root, '[data-gw-measures]').innerHTML = renderMeasures(state.analysis?.measures || []);
  query(root, '[data-gw-coverage]').innerHTML = renderCoverage(state.analysis?.coverage || {});
  query(root, '[data-gw-path]').innerHTML = renderPath(state.analysis?.primaryLoop);
  query(root, '[data-gw-recommendations]').innerHTML = renderRecommendations(state.analysis?.recommendations || []);
  query(root, '[data-gw-activity]').innerHTML = renderActivity(state.activity);
  query(root, '[data-gw-activity-dock]').innerHTML = renderActivity(state.activity);

  query(root, '[data-gw-weapons]').innerHTML = (state.equipment?.weapons || []).slice(0,3).map(weaponCard).join('');
  query(root, '[data-gw-mods]').innerHTML = renderMods(state.equipment?.mods || []);
  query(root, '[data-gw-stats]').innerHTML = renderStats(state.equipment?.stats || []);
  query(root, '[data-gw-armour-rail]').innerHTML = renderArmourRail(state.equipment?.armour || []);
  query(root, '[data-gw-stage-stats]').innerHTML = renderStageStats(state.equipment?.stats || []);

  root.addEventListener('click', event => {
    const target = event.target.closest('[data-selection-id]');
    if (!target || !root.contains(target)) return;
    queryAll(root, '[data-focused=true]').forEach(node => node.removeAttribute('data-focused'));
    target.setAttribute('data-focused', 'true');
    const name = target.dataset.selectionName || target.dataset.selectionId;
    const detail = target.dataset.selectionDetail || 'No additional detail supplied.';
    const selection = query(root, '[data-gw-selection]');
    if (selection) selection.innerHTML = `<strong>${escapeHtml(name)}</strong><p class="gw-analysis-copy">${escapeHtml(detail)}</p>`;
  }, {once:false});
}

export async function mountGuardianWorkspace(options = {}) {
  const root = options.root ?? document.querySelector('[data-guardian-workspace]');
  if (!root) throw new Error('Guardian Build Forge root not found.');
  const url = options.previewUrl ?? './guardian-workspace.preview.json';
  window.ForgeLoader?.set(20);
  window.ForgeLoader?.status('Loading Guardian Journey data');
  const response = await fetch(url, {cache:'no-store'});
  if (!response.ok) throw new Error(`Unable to load Guardian Build Forge state: ${response.status}`);
  window.ForgeLoader?.set(52);
  window.ForgeLoader?.status('Resolving Guardian Journey state');
  const state = await response.json();
  window.ForgeLoader?.set(72);
  window.ForgeLoader?.status('Painting Guardian Journey');
  renderGuardian(root, state);
  window.ForgeLoader?.set(88);
  return {root, state, render(nextState){renderGuardian(root, nextState);}};
}
