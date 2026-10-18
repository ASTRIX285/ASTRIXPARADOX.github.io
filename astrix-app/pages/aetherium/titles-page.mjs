/**
 * Titles page (The Aetherium, hub/aetherium/gear/titles/), laid out like the game's Title window. At the top the title the
 * Daeva shows (profile.titleName: cosmetic). Then the three equipped effects, one per category in the game's order
 * (Offensive, Defensive, Other, from the data's equipCategory Attack, Defense, Etc), each with owned of total and a bar,
 * and the title set there with its two kinds of effect: the equip effect (equipStatList, only while set as the effect)
 * and the line that is always on once owned (statList). That reading is confirmed in game (mechanics.json title-effects,
 * Miguel, 12 Oct 2026). No overall total: the data's overall count does not match the game's yet. Each
 * effect that names a stat the stats record knows is tagged High, Useful or Low for the Daeva's class (the class's stat
 * order, the same chain as the Gear page's stats), so a player sees which title is worth wearing.
 * First paint needs only /aion2/character; the stats record and the class's build are small static files.
 */
import { loadBuilds, loadGrades, loadMechanics, loadStats, rolePick } from './aetherium-data.mjs';
import { $, esc, isPending, number, TITLE_CATEGORY_NAMES } from './aetherium-ui.mjs';
import { failPage, startCharacterPage, windowBar } from './character-page.mjs';
import { buildFor, gradeInfo, indexGrades, indexMechanics } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { effectTag, indexStats, rankPointStats, statOrder } from '/astrix-app/games/aion2/engine/stat-advisor.mjs';

const TAG_WORD = { high: 'High', useful: 'Useful', low: 'Low' };
/* The title has no icon in the data: the same laurel badge the Gear page draws, never game art. */
const LAUREL = '<svg class="ae-title-badge" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40c-7-2-13-8-14-17M24 40c7-2 13-8 14-17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 30c-3 0-5-2-5-4 3 0 5 1 5 4zM10 23c-3-1-4-3-4-5 3 1 4 3 4 5zM11 16c-2-1-3-4-2-6 2 1 3 3 2 6zM36 30c3 0 5-2 5-4-3 0-5 1-5 4zM38 23c3-1 4-3 4-5-3 1-4 3-4 5zM37 16c2-1 3-4 2-6-2 1-3 3-2 6z" fill="currentColor"/><path d="M24 12l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor"/></svg>';

const listWords = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** One effect line with its tag for the class, when it names a stat the record knows. */
function effectRows(lines, ctx) {
  return lines.map(line => {
    const tag = ctx.rank ? effectTag(line, ctx.rank, ctx.build, ctx.stats) : null;
    return `<li${tag ? ` data-line-tag="${tag}"` : ''}><span>${esc(line)}</span>${tag ? `<i class="ae-stat-tag is-${tag}">${TAG_WORD[tag]}</i>` : ''}</li>`;
  }).join('');
}

/** What to do with the worn title, in one line, from its tags and the class's first two stats. */
function adviceLine(worn, ctx, categoryName) {
  if (!ctx.rank) return null;
  const tags = worn.effect.map(line => effectTag(line, ctx.rank, ctx.build, ctx.stats));
  const top = (statOrder(ctx.build, ctx.stats) ?? []).slice(0, 2).flatMap(entry => entry.combat);
  if (tags.includes('high')) return `Keep it set: its equip effect gives a stat ${ctx.className} wants most.`;
  if (tags.includes('useful')) return `Good for now: its equip effect gives a stat ${ctx.className} uses.`;
  return top.length ? `Its equip effect does little for ${ctx.className}. Look in game for a title in this category with ${listWords(top)}.` : null;
}

function categoryHtml(category, ctx) {
  const name = TITLE_CATEGORY_NAMES[category.id];
  const counted = Number.isFinite(category.owned) && Number.isFinite(category.total) && category.total > 0;
  const percent = counted ? Math.round((category.owned / category.total) * 100) : Number.isFinite(category.percent) ? category.percent : null;
  const worn = category.worn;
  const grade = worn?.grade ? gradeInfo(worn.grade, ctx.grades) : null;
  const advice = worn ? adviceLine(worn, ctx, name) : null;
  return `<section class="ae-panel ae-tcat" data-title-category="${esc(category.id)}" aria-labelledby="aeTcat-${esc(category.id)}">
      <div class="ae-tcat-head">
        <h2 class="ae-section-title" id="aeTcat-${esc(category.id)}">${esc(name)}</h2>
        ${counted ? `<p class="ae-tcat-count" data-title-count><b>${number(category.owned)}</b> of ${number(category.total)} collected</p>` : ''}
      </div>
      ${percent !== null ? `<div class="ae-tbar" role="img" aria-label="${esc(name)}: ${percent}% collected"><span style="inline-size:${Math.max(0, Math.min(100, percent))}%"></span></div>` : ''}
      ${worn ? `<div class="ae-tworn" data-title-worn="${esc(worn.id)}">
          <span class="ae-gtile ae-tworn-badge"${grade?.id ? ` data-grade="${esc(grade.id)}"` : ''} aria-hidden="true">${LAUREL}</span>
          <div class="ae-tworn-body">
            <p class="ae-eyebrow">Set as the effect</p>
            <h3 class="ae-tworn-name ae-grade-name"${grade?.id ? ` data-grade="${esc(grade.id)}"` : ''}>${esc(worn.name)}</h3>
            ${grade ? `<p class="ae-tworn-grade">${esc(grade.name)}</p>` : ''}
          </div>
        </div>
        ${worn.effect.length ? `<div class="ae-item-block" data-title-list="effect" data-rule-status="${ctx.ruleStatus('equip-effect')}"><p class="ae-item-sec">Equip effect${ctx.ruleTag('equip-effect')}</p><ul class="ae-teffects">${effectRows(worn.effect, ctx)}</ul></div>` : ''}
        ${worn.alsoGives.length ? `<div class="ae-item-block" data-title-list="owned" data-rule-status="${ctx.ruleStatus('owned-effect')}"><p class="ae-item-sec">Always on once collected${ctx.ruleTag('owned-effect')}</p><ul class="ae-teffects is-owned">${effectRows(worn.alsoGives, ctx)}</ul></div>` : ''}
        ${advice ? `<p class="ae-card-line ae-tadvice" data-title-advice>${esc(advice)}</p>` : ''}`
    : '<p class="ae-empty" data-title-none>No title set as this effect</p>'}
    </section>`;
}

/** The title the Daeva shows: one name, cosmetic. Only when the data has one. */
function shownHtml(profile, ctx) {
  if (!profile.title) return '';
  const grade = profile.titleGrade ? gradeInfo(profile.titleGrade, ctx.grades) : null;
  return `<section class="ae-panel ae-tshown" id="aeTitleShown" aria-labelledby="aeTitleShownTitle">
      <span class="ae-gtile ae-tworn-badge"${grade?.id ? ` data-grade="${esc(grade.id)}"` : ''} aria-hidden="true">${LAUREL}</span>
      <div class="ae-tworn-body">
        <h2 class="ae-section-title" id="aeTitleShownTitle">Title shown</h2>
        <p class="ae-tworn-name ae-grade-name"${grade?.id ? ` data-grade="${esc(grade.id)}"` : ''} data-title-shown="${esc(profile.titleId ?? '')}">${esc(profile.title)}</p>
        <p class="ae-tworn-grade">${grade ? `${esc(grade.name)} · ` : ''}The name other players see. It gives no effect on its own.</p>
      </div>
    </section>`;
}

function render(model, ref, ctx) {
  const titles = model.titles;
  const none = isPending(titles) || !titles.categories.length;
  $('#aeStage').innerHTML = `<div class="ae-gw ae-titles-window">
    ${windowBar({ title: 'Titles', model, ref })}
    <div class="ae-gw-body">
      ${shownHtml(model.profile, ctx)}
      ${none ? '<p class="ae-empty" id="aeTitlesNone">The official AION 2 site sends no titles for this Daeva.</p>' : `
      <h2 class="ae-section-title ae-titles-head" id="aeEffectsTitle">Equipped effects</h2>
      <div class="ae-titles-intro">
        <p class="ae-note">Set one title as the effect in each category. Its equip effect works only while it is set. Its always on line works from the moment you collect the title.</p>
        <p class="ae-note" id="aeTitlesTags">${ctx.rank ? `High, Useful and Low say how much a line helps a ${esc(ctx.className)}, from the class's stat order. A line with no tag names a stat the plan does not rank.` : `No stat order for ${esc(ctx.className)} yet, so the lines show without a tag.`}</p>
      </div>
      <div class="ae-tcats" id="aeTitleCats" aria-labelledby="aeEffectsTitle">${titles.categories.map(category => categoryHtml(category, ctx)).join('')}</div>`}
    </div>
  </div>`;
}

startCharacterPage({
  prefetch: className => { loadGrades().catch(() => {}); loadStats().catch(() => {}); loadMechanics().catch(() => {}); if (className) loadBuilds(className).catch(() => {}); },
  async render({ model, ref }) {
    const [grades, stats, builds, mechanics] = await Promise.all([loadGrades().catch(() => null), loadStats().catch(() => null), loadBuilds(model.profile.class).catch(() => null), loadMechanics().catch(() => null)]);
    // The two kinds of title effect, from the title-effects rule (mechanics.json).
    const rule = mechanics ? indexMechanics(mechanics, null)['title-effects'] : null;
    const partOf = id => rule?.parts?.find(part => part.id === id) ?? null;
    const ruleStatus = id => partOf(id)?.status ?? 'unconfirmed';
    const ruleTag = () => '';
    const build = builds ? buildFor(builds, rolePick(ref)) : null;
    const index = stats ? indexStats(stats) : null;
    const rank = index && build ? rankPointStats(build, index) : null;
    render(model, ref, { grades: grades ? indexGrades(grades) : null, stats: index, build, rank, className: model.profile.class, ruleStatus, ruleTag });
  }
}).catch(error => failPage('Titles page', error));
