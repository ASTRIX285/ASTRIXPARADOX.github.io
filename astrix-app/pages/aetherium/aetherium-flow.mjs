/**
 * The first-visit flow of The Aetherium: three steps a new player follows, always in view.
 *   1 Find your Daeva (the Daeva Card)   2 See your setup (the Gear Ledger)   3 Your next moves (the Ascent Plan)
 * Every page draws the step bar under the tab ribbon (renderStepBar) and ends with one Next button (renderNext),
 * so there is always a next click. With no Daeva, steps 2 and 3 wait: "Find your Daeva first".
 */
import { ascentUrl, gearUrl } from './aetherium-data.mjs';
import { $, esc } from './aetherium-ui.mjs';

export const STEPS = Object.freeze([
  Object.freeze({ id: 'find', label: 'Find your Daeva' }),
  Object.freeze({ id: 'setup', label: 'See your setup' }),
  Object.freeze({ id: 'moves', label: 'Your next moves' })
]);

const FIND_FIRST = 'Find your Daeva first';
const TICK = '<svg class="ae-step-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The page of each step, for this Daeva. Step 1 with a Daeva opens that Daeva's card. */
export function stepHref(id, ref, className = null) {
  if (id === 'find') return ref ? `/hub/aetherium/?${new URLSearchParams({ serverId: ref.serverId, characterId: ref.characterId, region: ref.region ?? 'eu' })}` : '/hub/aetherium/#aeSearch';
  if (id === 'setup') return gearUrl(ref);
  return ascentUrl(ref, className);
}

/**
 * Draws the step bar into #aeSteps. current is 'find', 'setup' or 'moves'; with a Daeva (ref) the steps before the
 * current one are done and every step is a link. Without one, steps 2 and 3 are greyed and say "Find your Daeva first".
 * help, when given, is what the "How this works" link does (it reopens the page's guide).
 */
export function renderStepBar({ current, ref = null, className = null, help = null }) {
  const bar = $('#aeSteps');
  if (!bar) return;
  const index = Math.max(0, STEPS.findIndex(step => step.id === current));
  const items = STEPS.map((step, i) => {
    const isCurrent = i === index;
    // On the Daeva Card a found Daeva ticks step 1 while it is still the current step.
    const done = Boolean(ref) && (i < index || (isCurrent && current === 'find'));
    // Without a Daeva steps 2 and 3 wait, the current one included: it is marked current, but it is not a link.
    const locked = !ref && i > 0;
    const state = `${isCurrent ? ' is-current' : ''}${done ? ' is-done' : ''}${locked ? ' is-locked' : ''}`;
    const num = `<span class="ae-step-num" aria-hidden="true">${done ? TICK : i + 1}</span>`;
    const text = `<span class="ae-step-label">${esc(step.label)}</span>`;
    const sr = done ? '<span class="ae-sr">Done: </span>' : '';
    if (locked) return `<li><span class="ae-step${state}" aria-disabled="true"${isCurrent ? ' aria-current="step"' : ''} title="${FIND_FIRST}">${num}${sr}${text}<span class="ae-step-note">${FIND_FIRST}</span></span></li>`;
    return `<li><a class="ae-step${state}" href="${esc(stepHref(step.id, ref, className))}" data-step="${step.id}"${isCurrent ? ' aria-current="step"' : ''}>${num}${sr}${text}</a></li>`;
  });
  bar.innerHTML = `<ol class="ae-steps-list">${items.join('')}</ol>${help ? '<button type="button" class="ae-linkish ae-steps-help" id="aeHowThisWorks" data-how-this-works>How this works</button>' : ''}`;
  bar.dataset.current = STEPS[index].id;
  bar.dataset.daeva = ref ? 'true' : 'false';
  if (help) $('#aeHowThisWorks')?.addEventListener('click', help);
}

/** The one Next button at the end of the page. note says where it goes, in a few words; with no href the row stays hidden. */
export function renderNext({ label, href, note = null } = {}) {
  const row = $('#aeNext');
  if (!row) return;
  if (!href) { row.hidden = true; row.innerHTML = ''; return; }
  row.hidden = false;
  row.innerHTML = `${note ? `<span class="ae-next-note">${esc(note)}</span>` : ''}<a class="btn ae-primary ae-next-btn" href="${esc(href)}" data-next>${esc(label)} <span aria-hidden="true">›</span></a>`;
}

/** The Next row when there is no Daeva yet: the only way on is the search. */
export function renderFindFirstNext() {
  renderNext({ label: 'Find your Daeva', href: '/hub/aetherium/#aeSearch', note: 'Next step' });
}
