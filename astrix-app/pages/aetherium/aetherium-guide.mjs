/**
 * The guide (The Aetherium): one short step at a time, the thing to look at lit up on the page. One component
 * for every page: the Ascent Plan screens, the Daeva Card's first visit and the Ascent Plan menu.
 *
 * mountGuide(el, steps, options) draws the guide into el (an <aside class="ae-guide">) and handles its buttons.
 * A step is { text, target, onShow }: target is a selector for the thing to light up, onShow runs before it shows.
 * Options: onDone(kind) runs when the player finishes ('done'), skips ('skip') or, on the plan screens, presses
 * Done to go back to the menu ('menu'); doneAction names that last button's data-guide value; skip adds a Skip
 * button to every step but the last. Nothing is remembered here: the page decides when a guide shows again.
 */
import { esc } from './aetherium-ui.mjs';

const guides = new WeakMap();

function clearTargets() {
  document.querySelectorAll('.ae-guide-target').forEach(node => node.classList.remove('ae-guide-target'));
}

function showStep(el, index, scroll = true) {
  const guide = guides.get(el);
  if (!guide || !guide.steps.length) return;
  guide.index = Math.max(0, Math.min(guide.steps.length - 1, index));
  const step = guide.steps[guide.index];
  clearTargets();
  step.onShow?.();
  const target = step.target ? document.querySelector(step.target) : null;
  target?.classList.add('ae-guide-target');
  if (scroll && target) target.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const last = guide.index === guide.steps.length - 1;
  const count = `Guide · step ${guide.index + 1} of ${guide.steps.length}`;
  el.innerHTML = `
    <span class="ae-guide-pill" role="button" tabindex="0" data-guide="show">${esc(count)}</span>
    <span class="ae-guide-mark" aria-hidden="true"></span>
    <div class="ae-guide-copy">
      <p class="ae-guide-count">${esc(count)}</p>
      <p class="ae-guide-text">${esc(step.text)}</p>
    </div>
    <span class="ae-guide-hide" role="button" tabindex="0" data-guide="hide" aria-label="Hide the guide">▾</span>
    <div class="ae-guide-nav">
      <button type="button" class="ae-guide-btn" data-guide="back"${guide.index === 0 ? ' disabled' : ''}>Back</button>
      ${guide.skip && !last ? '<button type="button" class="ae-guide-btn" data-guide="skip">Skip</button>' : ''}
      <button type="button" class="ae-guide-btn is-next ae-primary" data-guide="${last ? guide.doneAction : 'next'}">${last ? 'Done' : 'Next'}</button>
    </div>`;
}

/** Closes the guide (the lit-up target goes back to normal) and tells the page how it ended. */
export function closeGuide(el, kind = 'done') {
  const guide = guides.get(el);
  clearTargets();
  el.hidden = true;
  el.classList.remove('is-min');
  guide?.onDone?.(kind);
}

function onAction(el, action) {
  const guide = guides.get(el);
  if (!guide) return;
  if (action === 'hide') { el.classList.add('is-min'); return; }
  if (action === 'show') { el.classList.remove('is-min'); return; }
  if (action === 'next') { showStep(el, guide.index + 1); return; }
  if (action === 'back') { showStep(el, guide.index - 1); return; }
  closeGuide(el, action);
}

function bind(el) {
  if (el.dataset.guideBound) return;
  el.dataset.guideBound = 'true';
  el.addEventListener('click', event => {
    const control = event.target.closest('[data-guide]');
    if (control && !control.disabled) onAction(el, control.dataset.guide);
  });
  el.addEventListener('keydown', event => {
    const control = event.target.closest?.('[role="button"][data-guide]');
    if (control && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onAction(el, control.dataset.guide); }
  });
}

/** Draws the guide into el and shows its first step. With no steps the guide stays hidden. Returns true when it shows. */
export function mountGuide(el, steps, { onDone = null, doneAction = 'done', skip = false, scroll = false } = {}) {
  if (!el) return false;
  bind(el);
  guides.set(el, { steps: steps.filter(Boolean), index: 0, onDone, doneAction, skip });
  el.classList.remove('is-min');
  el.hidden = !steps.length;
  if (!steps.length) { clearTargets(); return false; }
  showStep(el, 0, scroll);
  return true;
}

/** Moves the mounted guide to a step (the page's own buttons, or a test, can drive it). */
export function goToStep(el, index) {
  showStep(el, index);
}

/* Which guides this device has seen, so each first-visit guide shows once. Storage may be blocked: then every visit is a first visit. */
const SEEN_KEY = 'aetherium.guides.v1';
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') ?? {}; } catch { return {}; } };
export const guideSeen = name => Boolean(readSeen()[name]);
export function markGuideSeen(name) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [name]: true })); } catch { /* private mode: shown again next visit */ }
}
