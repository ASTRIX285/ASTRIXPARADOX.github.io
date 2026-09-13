import { BUILD_DATA_URL, availableFilters, findBuildById, selectBuilds } from './build-rules.js';

const ARMOR_STATS = ['Weapons', 'Health', 'Class', 'Grenade', 'Super', 'Melee'];
const PENDING_TEXT = 'Pending in-game verification';

const tabs = document.querySelectorAll('.nav-tab');
const mobileToggle = document.querySelector('.mobile-toggle');
const primaryNav = document.querySelector('.primary-nav');
const buildGrid = document.querySelector('[data-build-grid]');
const buildStatus = document.querySelector('[data-build-status]');
const buildEmpty = document.querySelector('[data-build-empty]');
const buildDialog = document.querySelector('[data-build-dialog]');
const buildDetail = document.querySelector('[data-build-detail]');
const closeDialogButton = document.querySelector('[data-dialog-close]');
const resetButtons = document.querySelectorAll('[data-filter-reset], [data-empty-reset]');

const filters = {
  className: document.querySelector('[data-filter-class]'),
  subclass: document.querySelector('[data-filter-subclass]'),
  activity: document.querySelector('[data-filter-activity]'),
  role: document.querySelector('[data-filter-role]'),
  difficulty: document.querySelector('[data-filter-difficulty]')
};

let buildCatalogue = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function titleCase(value) {
  return String(value ?? '')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activateView(view) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  const target = document.getElementById(view);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  primaryNav?.classList.remove('open');
  mobileToggle?.setAttribute('aria-expanded', 'false');
}

tabs.forEach((tab) => tab.addEventListener('click', () => activateView(tab.dataset.view)));
document.querySelectorAll('[data-jump]').forEach((button) => button.addEventListener('click', () => activateView(button.dataset.jump)));
mobileToggle?.addEventListener('click', () => {
  const open = primaryNav.classList.toggle('open');
  mobileToggle.setAttribute('aria-expanded', String(open));
});

const observedSections = [...document.querySelectorAll('main section[id]')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === visible.target.id));
}, { rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.35, 0.6] });
observedSections.forEach((section) => observer.observe(section));

function option(value, label = value) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function populateSelect(select, allLabel, values) {
  select?.replaceChildren(
    option('all', allLabel),
    ...values.map((value) => option(value, titleCase(value)))
  );
}

function populateFilters(builds) {
  const available = availableFilters(builds);
  populateSelect(filters.className, 'All classes', available.classes);
  populateSelect(filters.subclass, 'All subclasses', available.subclasses);
  populateSelect(filters.activity, 'All activities', available.activities);
  populateSelect(filters.role, 'All roles', available.roles);
  populateSelect(filters.difficulty, 'All difficulties', available.difficulties);
}

function currentFilters() {
  return Object.fromEntries(
    Object.entries(filters).map(([key, select]) => [key, select?.value || 'all'])
  );
}

function resetFilters() {
  Object.values(filters).forEach((select) => {
    if (select) select.value = 'all';
  });
  renderBuilds();
}

function verificationLabel(verified) {
  return verified ? 'Verified' : 'Pending verification';
}

function verificationBadge(verified) {
  const state = verified ? 'verified' : 'pending';
  return `<span class="verification-badge ${state}">${verificationLabel(verified)}</span>`;
}

function statSummary(statTargets) {
  return Object.entries(statTargets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => `${escapeHtml(name)} ${escapeHtml(value)}`)
    .join(' · ');
}

function buildCard(build) {
  const article = document.createElement('article');
  article.className = `build-card ${build.subclass.toLowerCase()}`;
  const reviewCount = build.reviewNotes?.length || 0;

  article.innerHTML = `
    <div class="build-art">
      <span class="class-symbol">${escapeHtml(build.class.charAt(0))}</span>
      <div class="element-glow"></div>
    </div>
    <div class="build-body">
      <div class="build-tags">
        <span>${escapeHtml(titleCase(build.activityTags[0]))}</span>
        <span>${escapeHtml(build.class.toUpperCase())}</span>
        <span>${escapeHtml(verificationLabel(build.verified).toUpperCase())}</span>
      </div>
      <h3>${escapeHtml(build.name)}</h3>
      <p>${escapeHtml(build.summary)}</p>
      <p><strong>${escapeHtml(build.exoticArmor.name)}</strong> · ${statSummary(build.armor3.statTargets)}</p>
      <div class="build-footer">
        <span>${build.role.map(titleCase).map(escapeHtml).join(' · ')}</span>
        <button type="button" data-open-build="${escapeHtml(build.id)}">Open build · ${reviewCount} checks</button>
      </div>
    </div>`;

  article.querySelector('[data-open-build]')?.addEventListener('click', () => openBuild(build.id));
  return article;
}

function listOrPending(items, formatter = (item) => escapeHtml(item)) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="pending-empty">${PENDING_TEXT}</p>`;
  }

  return `<ul>${items.map((item) => `<li>${formatter(item)}</li>`).join('')}</ul>`;
}

function sectionHeader(title, verified) {
  return `<div class="detail-section-heading"><h3>${escapeHtml(title)}</h3>${verificationBadge(Boolean(verified))}</div>`;
}

function detailSection(title, verified, content) {
  return `<section class="detail-section">${sectionHeader(title, verified)}${content}</section>`;
}

function statGrid(build) {
  return `<div class="detail-stat-grid">${ARMOR_STATS.map((stat) => `
    <div><span>${escapeHtml(stat)}</span><strong>${escapeHtml(build.armor3.statTargets[stat] ?? PENDING_TEXT)}</strong></div>
  `).join('')}</div>`;
}

function subclassDetails(setup) {
  const abilities = [
    ['Super', setup.super],
    ['Class ability', setup.classAbility],
    ['Movement', setup.movement],
    ['Melee', setup.melee],
    ['Grenade', setup.grenade]
  ];

  return `
    <dl class="detail-definition-list">
      ${abilities.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || PENDING_TEXT)}</dd></div>`).join('')}
    </dl>
    <h4>Aspects</h4>
    ${listOrPending(setup.aspects)}
    <h4>Fragments</h4>
    ${listOrPending(setup.fragments)}
    <p class="detail-note">${escapeHtml(setup.notes || PENDING_TEXT)}</p>`;
}

function modsDetails(mods) {
  const slots = [
    ['Helmet', mods.helmet],
    ['Arms', mods.arms],
    ['Chest', mods.chest],
    ['Legs', mods.legs],
    ['Class item', mods.classItem]
  ];

  return `
    <div class="detail-slot-grid">
      ${slots.map(([slot, items]) => `<div><h4>${escapeHtml(slot)}</h4>${listOrPending(items)}</div>`).join('')}
    </div>
    <p class="detail-note">${escapeHtml(mods.notes || PENDING_TEXT)}</p>`;
}

function sourcesDetails(sources) {
  return listOrPending(sources, (source) => {
    const title = escapeHtml(source.title || 'Untitled source');
    const publisher = escapeHtml(source.publisher || 'Publisher not recorded');
    const date = escapeHtml(source.date || 'Date not recorded');
    return `<strong>${title}</strong><span>${publisher} · ${date}</span>`;
  });
}

function buildDetailMarkup(build) {
  const archetypes = listOrPending(build.armor3.preferredArchetypes);
  const setBonuses = listOrPending(build.armor3.setBonuses);
  const artifactPerks = listOrPending(build.artifact.perks);
  const weaponRequirements = listOrPending(build.weapons.requirements);
  const weaponExamples = listOrPending(build.weapons.examples);
  const reviewNotes = listOrPending(build.reviewNotes);

  return `
    <header class="detail-hero ${escapeHtml(build.subclass.toLowerCase())}">
      <div>
        <p class="eyebrow">${escapeHtml(build.class)} · ${escapeHtml(build.subclass)}</p>
        <h2 id="build-detail-title">${escapeHtml(build.name)}</h2>
        <p>${escapeHtml(build.summary)}</p>
      </div>
      ${verificationBadge(build.verified)}
    </header>

    <div class="detail-meta">
      <span>Activities: ${build.activityTags.map(titleCase).map(escapeHtml).join(', ')}</span>
      <span>Roles: ${build.role.map(titleCase).map(escapeHtml).join(', ')}</span>
      <span>Difficulty: ${build.difficultyTags.map(titleCase).map(escapeHtml).join(', ')}</span>
    </div>

    ${detailSection('Exotic armor', build.exoticArmor.verified, `
      <h4>${escapeHtml(build.exoticArmor.name)}</h4>
      <p>${escapeHtml(build.exoticArmor.reason || PENDING_TEXT)}</p>`)}

    ${detailSection('Armor 3.0 targets', build.armor3.verified, `
      ${statGrid(build)}
      <div class="detail-columns">
        <div><h4>Preferred archetypes</h4>${archetypes}</div>
        <div><h4>Minimum gear tier</h4><p>${escapeHtml(build.armor3.minimumGearTier ?? PENDING_TEXT)}</p></div>
      </div>
      <h4>Set bonuses</h4>
      ${setBonuses}
      <p class="detail-note">${escapeHtml(build.armor3.setBonusNotes || PENDING_TEXT)}</p>`)}

    ${detailSection('Subclass setup', build.subclassSetup.verified, subclassDetails(build.subclassSetup))}

    ${detailSection('Armor mods', build.mods.verified, modsDetails(build.mods))}

    ${detailSection('Artifact', build.artifact.verified, `
      <p><strong>Required:</strong> ${build.artifact.required ? 'Yes' : 'No'}</p>
      <h4>Perks</h4>
      ${artifactPerks}
      <p class="detail-note">${escapeHtml(build.artifact.notes || PENDING_TEXT)}</p>`)}

    ${detailSection('Weapon requirements', build.weapons.verified, `
      <h4>Requirements</h4>
      ${weaponRequirements}
      <h4>Examples</h4>
      ${weaponExamples}`)}

    ${detailSection('Gameplay loop', build.verified, listOrPending(build.gameplayLoop))}

    ${detailSection('Sources', true, sourcesDetails(build.sources))}

    ${detailSection('Human review still required', build.verified, reviewNotes)}
  `;
}

function openBuild(buildId) {
  const build = findBuildById(buildCatalogue, buildId);
  if (!build || !buildDialog || !buildDetail) return;

  buildDetail.innerHTML = buildDetailMarkup(build);
  if (typeof buildDialog.showModal === 'function') {
    buildDialog.showModal();
  } else {
    buildDialog.setAttribute('open', '');
  }
}

function closeBuild() {
  if (!buildDialog) return;
  if (typeof buildDialog.close === 'function') buildDialog.close();
  else buildDialog.removeAttribute('open');
}

function renderBuilds() {
  if (!buildGrid) return;
  const builds = selectBuilds(buildCatalogue, currentFilters());

  buildGrid.replaceChildren(...builds.map(buildCard));
  buildGrid.hidden = builds.length === 0;
  if (buildEmpty) buildEmpty.hidden = builds.length !== 0;

  if (buildStatus) {
    const unverified = builds.filter((build) => !build.verified).length;
    buildStatus.textContent = builds.length === 0
      ? 'No builds match the selected filters.'
      : `${builds.length} build${builds.length === 1 ? '' : 's'} shown · ${unverified} awaiting human verification`;
  }
}

async function loadBuilds() {
  window.ForgeLoader?.set(18);
  window.ForgeLoader?.status('Fetching build catalogue');
  try {
    const response = await fetch(BUILD_DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Build data returned ${response.status}`);
    window.ForgeLoader?.set(46);
    window.ForgeLoader?.status('Reading build definitions');
    const data = await response.json();
    buildCatalogue = Array.isArray(data.builds) ? data.builds : [];
    window.ForgeLoader?.set(66);
    window.ForgeLoader?.status('Painting build cards');
    populateFilters(buildCatalogue);
    renderBuilds();
  } catch (error) {
    console.error('Unable to load static build catalogue', error);
    if (buildStatus) buildStatus.textContent = 'Build catalogue unavailable. Check the committed JSON file.';
    buildGrid?.replaceChildren();
    if (buildEmpty) {
      buildEmpty.hidden = false;
      buildEmpty.querySelector('h3').textContent = 'Build catalogue unavailable';
      buildEmpty.querySelector('p').textContent = 'The committed static JSON could not be loaded.';
    }
  }
  window.ForgeLoader?.set(82);
  document.dispatchEvent(new CustomEvent('forge:build-catalogue-rendered'));
}

Object.values(filters).forEach((select) => select?.addEventListener('change', renderBuilds));
resetButtons.forEach((button) => button.addEventListener('click', resetFilters));
closeDialogButton?.addEventListener('click', closeBuild);
buildDialog?.addEventListener('click', (event) => {
  if (event.target === buildDialog) closeBuild();
});
buildDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeBuild();
});

document.querySelectorAll('[data-activity-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    if (filters.activity) filters.activity.value = button.dataset.activityFilter;
    renderBuilds();
    activateView('builds');
  });
});

loadBuilds();
