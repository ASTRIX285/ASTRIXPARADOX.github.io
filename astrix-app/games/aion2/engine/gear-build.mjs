/**
 * The gear build (feature/aetherium-gear-build, 24 Oct 2026): the Gear Ledger as the gear half of the Builder, judged
 * against the same build the Ascent Plan uses (class, role, team). Pure: it reads what the other engines already work out,
 * never the page.
 *   - slotVerdict: one worn piece against the build. Suits your build, Close fit, Replace it, or Wear it for now, with the
 *     reason. No verdict when the piece is not judged yet (its detail is still loading, or the class has no stat order):
 *     never a guess.
 *   - gearBuild: every worn piece's verdict, the count that suit the build, and the next moves across the whole set in the
 *     order the Enhancement record gives (Growth to +10 first, then past +10, Soul Binding, manastones, Theostone), with a
 *     piece to replace placed after the safe Growth steps, at the drop that replaces it. The short list always holds one
 *     piece to replace when there is one.
 */
import { assessItem } from './item-assessor.mjs';
import { STEP_RANK } from './enhancement-advisor.mjs';

/** The four verdicts, in the words every card and tile uses. */
export const VERDICTS = Object.freeze({
  best: 'Suits your build',
  close: 'Close fit',
  replace: 'Replace it',
  hold: 'Wear it for now'
});

/** A replace move sits after the safe Growth steps and before the risky ones: a better drop beats stones on a piece you will lose. */
const REPLACE_RANK = (STEP_RANK.growth + STEP_RANK['growth-risky']) / 2;
/** The order slots are worked on when two moves have the same rank: weapon, guard, armour, accessories. */
const SLOT_ORDER = ['MAINHAND', 'SUBHAND', 'HELMET', 'SHOULDER', 'TORSO', 'PANTS', 'GLOVES', 'BOOTS', 'CAPE', 'NECKLACE', 'EARRING1', 'EARRING2', 'RING1', 'RING2', 'BRACELET1', 'BRACELET2', 'BELT', 'AMULET'];
const slotKey = slot => String(slot?.slot ?? '').toUpperCase().replace(/[\s_]/g, '');
const slotRank = slot => { const at = SLOT_ORDER.indexOf(slotKey(slot)); return at < 0 ? SLOT_ORDER.length : at; };

/**
 * One piece against the build.
 * assessment: assessItem's result. advice: enchantAdvice for the slot (or null).
 * Returns { level, label, why } or null when there is nothing to judge it by yet.
 */
export function slotVerdict({ assessment = null, advice = null } = {}) {
  if (advice?.action === 'replace') return { level: 'replace', label: VERDICTS.replace, why: advice.why };
  if (advice?.action === 'hold') return { level: 'hold', label: VERDICTS.hold, why: advice.why };
  if (assessment?.verdict === 'good') return { level: 'best', label: VERDICTS.best, why: assessment.reasons[0] ?? null };
  if (assessment?.verdict === 'weak') return { level: 'close', label: VERDICTS.close, why: assessment.reasons[0] ?? null };
  return null;
}

/**
 * The whole gear build for one Daeva.
 * model: the character model. build: the picked build (buildFor). stats: stats.json. adviceOf(slot): enchantAdvice.
 * judged(slot): true once the slot's detail has landed (its lines are known). plan: enhancementPlan. where(slot): the
 * whereToGet entry for the slot (gear-sources.mjs), or null.
 * Returns { slots: [{ index, slotPos, name, verdict }], worn, judged, suits, moves }.
 */
export function gearBuild({ model, build = null, stats = null, adviceOf = () => null, judged = () => true, plan = null, where = () => null, limit = 3 } = {}) {
  const gear = model?.gear ?? [];
  const slots = [];
  for (const [index, slot] of gear.entries()) {
    if (!slot || slot.empty || /^arcana\d$/i.test(slotKey(slot))) continue;
    const advice = adviceOf(slot);
    const ready = judged(slot);
    const assessment = ready ? assessItem({ slot, advice, build, stats }) : null;
    // A piece to replace or hold is judged by the grade rule alone, before its detail lands.
    const verdict = ready || advice?.action === 'replace' || advice?.action === 'hold' ? slotVerdict({ assessment, advice }) : null;
    slots.push({ index, slotPos: slot.slotPos, name: slot.name, slot: slot.slot, verdict });
  }
  const moves = [];
  for (const item of plan?.items ?? []) {
    const step = item.next ? item.steps?.find(entry => entry.tab === item.next.tab) ?? item.steps?.[0] : null;
    if (step) moves.push({ kind: 'enhance', slotPos: item.slotPos, index: item.index, name: item.name, tab: step.tab, title: step.title, why: step.why, rank: step.rank, order: slotRank(gear[item.index]) });
  }
  for (const entry of slots) {
    if (entry.verdict?.level !== 'replace') continue;
    const source = where(gear[entry.index]);
    const best = source?.best ?? null;
    moves.push({ kind: 'replace', slotPos: entry.slotPos, index: entry.index, name: entry.name, tab: null, title: 'Replace it',
      why: best ? `From ${best.highlight}.` : source?.goal ? `Once you can enter: ${source.goal.highlight}.` : entry.verdict.why,
      source: best ?? source?.goal ?? null, rank: REPLACE_RANK, order: slotRank(gear[entry.index]) });
  }
  moves.sort((a, b) => a.rank - b.rank || a.order - b.order);
  // The short list always shows one piece to replace when there is one: a set of safe Growth steps on keepers can
  // otherwise push every replacement off it, and replacing is the bigger gain.
  const firstReplace = moves.findIndex(move => move.kind === 'replace');
  if (firstReplace >= limit && limit > 0) moves.splice(limit - 1, 0, moves.splice(firstReplace, 1)[0]);
  const worn = slots.length;
  const judgedCount = slots.filter(entry => entry.verdict).length;
  return {
    slots,
    worn,
    judged: judgedCount,
    suits: slots.filter(entry => entry.verdict?.level === 'best').length,
    moves: moves.slice(0, limit),
    more: Math.max(0, moves.length - limit)
  };
}
