import {
  BUILD_DATA_URL,
  CANONICAL_SUBCLASSES,
  availableFilters
} from './build-rules.js';

const subclassSelect = document.querySelector('[data-filter-subclass]');
const buildEmpty = document.querySelector('[data-build-empty]');
const emptyHeading = buildEmpty?.querySelector('h3');
const emptyText = buildEmpty?.querySelector('p');
const filterControls = document.querySelectorAll(
  '[data-filter-class], [data-filter-subclass], [data-filter-activity], [data-filter-role], [data-filter-difficulty]'
);

const DEFAULT_EMPTY_HEADING = 'No matching builds';
const DEFAULT_EMPTY_TEXT = 'The three current seed records do not match this exact combination. Clear one or more filters to widen the results.';

let subclassCounts = Object.fromEntries(
  CANONICAL_SUBCLASSES.map((subclass) => [subclass, 0])
);

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function expectedOptionSignature() {
  return [
    'all:All subclasses',
    ...CANONICAL_SUBCLASSES.map(
      (subclass) => `${subclass}:${subclass} (${subclassCounts[subclass] ?? 0})`
    )
  ].join('|');
}

function currentOptionSignature() {
  if (!subclassSelect) return '';
  return [...subclassSelect.options]
    .map((item) => `${item.value}:${item.textContent}`)
    .join('|');
}

function renderCanonicalSubclassOptions() {
  if (!subclassSelect) return;
  if (currentOptionSignature() === expectedOptionSignature()) return;

  const selected = subclassSelect.value || 'all';
  subclassSelect.replaceChildren(
    option('all', 'All subclasses'),
    ...CANONICAL_SUBCLASSES.map((subclass) =>
      option(subclass, `${subclass} (${subclassCounts[subclass] ?? 0})`)
    )
  );

  subclassSelect.value = CANONICAL_SUBCLASSES.includes(selected)
    ? selected
    : 'all';
}

function renderHonestEmptyState() {
  if (!buildEmpty || !emptyHeading || !emptyText || buildEmpty.hidden) return;

  const selectedSubclass = subclassSelect?.value;
  const hasNoSubclassBuilds =
    CANONICAL_SUBCLASSES.includes(selectedSubclass) &&
    subclassCounts[selectedSubclass] === 0;

  if (hasNoSubclassBuilds) {
    emptyHeading.textContent = `No builds yet for ${selectedSubclass}`;
    emptyText.textContent = `The public catalogue does not yet contain a ${selectedSubclass} build. No unrelated build has been substituted.`;
    return;
  }

  emptyHeading.textContent = DEFAULT_EMPTY_HEADING;
  emptyText.textContent = DEFAULT_EMPTY_TEXT;
}

function scheduleEmptyStateUpdate() {
  queueMicrotask(renderHonestEmptyState);
}

async function loadSubclassCoverage() {
  window.ForgeLoader?.set(22);
  window.ForgeLoader?.status('Resolving subclass coverage');
  try {
    const response = await fetch(BUILD_DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Build data returned ${response.status}`);

    const catalogue = await response.json();
    const builds = Array.isArray(catalogue.builds) ? catalogue.builds : [];
    subclassCounts = availableFilters(builds).subclassCounts;
    renderCanonicalSubclassOptions();
    renderHonestEmptyState();
  } catch (error) {
    console.error('Unable to load subclass coverage', error);
    renderCanonicalSubclassOptions();
  }
  window.ForgeLoader?.set(88);
  document.dispatchEvent(new CustomEvent('forge:subclass-filter-rendered'));
}

if (subclassSelect) {
  const optionObserver = new MutationObserver(renderCanonicalSubclassOptions);
  optionObserver.observe(subclassSelect, { childList: true });
}

if (buildEmpty) {
  const emptyObserver = new MutationObserver(renderHonestEmptyState);
  emptyObserver.observe(buildEmpty, {
    attributes: true,
    attributeFilter: ['hidden']
  });
}

filterControls.forEach((control) => {
  control.addEventListener('change', scheduleEmptyStateUpdate);
});

document.querySelectorAll('[data-filter-reset], [data-empty-reset]').forEach((button) => {
  button.addEventListener('click', scheduleEmptyStateUpdate);
});

loadSubclassCoverage();
