/**
 * The Guide's Classes section (feature/aetherium-guide-home, 18 Oct 2026): the Classes page (the class roles table, a card
 * per class, role suggestions, choosing a class) and the eight class pages (overview, the class's row of the table, each
 * build by role, links into the Ascent Plan, and "Your setup vs the build" for a linked Daeva of that class).
 * <body data-guide="classes"> or <body data-guide="class" data-guide-class="Templar">.
 *
 * Everything comes from the build data (data/advisor/builds/<class>.json) and the role ratings record
 * (data/advisor/class-roles.json, each rating tagged Reported and cited). No rating is guessed: a cell no source rates
 * shows what our build data says. The setup check reuses the engine (ascent-advisor.mjs, item-assessor.mjs) and only
 * advises: it never blocks a choice. Character data shows its age; saved notes show theirs (aetherium-memory.mjs).
 */
import { $, esc, iconImg, showNotice, slotLabel } from './aetherium-ui.mjs';
import { ArmoryUnavailable, ascentUrl, explain, gearPageUrl, loadAdvisor, loadBuilds, loadCharacter, rolePick, sourceLabel } from './aetherium-data.mjs';
import { classArt } from './daevanion-board.mjs';
import { getMemory, memoryAge, setMemory } from './aetherium-memory.mjs';
import { GUIDE_CLASSES, GUIDE_ROOT, classHref, renderGuideShell, startGuidePage } from './guide-shell.mjs';

const ADVISOR = '/astrix-app/games/aion2/data/advisor/';
const ROLE_ORDER = ['tank', 'healer', 'support', 'dps'];
const ROLE_LABEL = { tank: 'Tank', healer: 'Healer', support: 'Support', dps: 'DPS' };
const BEGINNER_ORDER = ['very high', 'high', 'medium', 'low'];
const SCREENS = [['mastery', 'Mastery'], ['skill-bar', 'Skill Bar'], ['stigma', 'Stigmas'], ['daevanion', 'Daevanion'], ['macro', 'Macro'], ['stats', 'Stats']];
const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const cap = text => String(text ?? '').replace(/^./, c => c.toUpperCase());
const firstSentence = text => { const s = String(text ?? ''); const end = s.search(/[.:](\s|$)/); return end > 0 ? s.slice(0, end + 1).replace(/:$/, '.') : s; };

/* Data. Every class's builds (8 small files, fetched together and cached), the ratings record, one class's skill icons. */
const loadAll = () => Promise.all(GUIDE_CLASSES.map(name => loadBuilds(name).then(file => [name, file.records ?? []]).catch(() => [name, null]))).then(Object.fromEntries);
let ratingsFile;
const loadRatings = () => (ratingsFile ??= fetch(`${ADVISOR}class-roles.json`).then(response => (response.ok ? response.json() : null)).catch(() => null));
const loadIcons = name => fetch(`${ADVISOR}icons/${name.toLowerCase()}.json`).then(response => (response.ok ? response.json() : null)).catch(() => null);

/** The ratings record as { cls: { role: { rating, evidence, ref } } } plus the sources by ref, numbered for footnotes. */
function indexRatings(file) {
  const byClass = {};
  const sources = new Map();
  for (const record of file?.records ?? []) {
    for (const source of record.provenance ?? []) if (source.ref && !sources.has(source.ref)) sources.set(source.ref, source);
    byClass[record.class] = record.ratings ?? {};
  }
  const numbers = new Map([...sources.keys()].map((ref, index) => [ref, index + 1]));
  return { byClass, sources, numbers };
}

/** One cell: a cited rating when a source gives one, else what our build data says (main role, can play, pending, or a dash). */
function cell(records, name, role, ratings) {
  const build = (records ?? []).find(item => item.role === role) ?? null;
  const ours = !records ? 'Pending' : !build ? '-' : build.main ? 'Main role' : build.status === 'pending' ? 'Pending' : 'Can play';
  const rated = ratings.byClass[name]?.[role];
  if (rated && !isPending(rated) && rated.rating) {
    const n = ratings.numbers.get(rated.ref);
    return { kind: 'reported', html: `<b class="ae-gd-rating" data-rating="${esc(String(rated.rating).toLowerCase())}">${esc(rated.rating)}</b><span class="ae-tag is-reported">Reported</span>${n ? `<a class="ae-gd-ref" href="#aeRoleSrc${n}" aria-label="Source ${n}">[${n}]</a>` : ''}<small class="ae-gd-ours">Our build: ${esc(ours === '-' ? 'none' : ours)}</small>`, ours };
  }
  return { kind: ours === '-' ? 'none' : 'data', html: ours === '-' ? '<span aria-label="Not played">-</span>' : `<b class="ae-gd-rating" data-ours="${esc(ours.toLowerCase())}">${esc(ours)}</b>`, ours };
}

function rolesTableHtml(all, ratings, only = null) {
  const names = only ? [only] : GUIDE_CLASSES;
  return `<div class="ae-gd-table-wrap"><table class="ae-gd-roles" data-roles-table>
      <caption class="ae-sr">Class roles: what each class plays</caption>
      <thead><tr><th scope="col">Class</th>${ROLE_ORDER.map(role => `<th scope="col">${ROLE_LABEL[role]}</th>`).join('')}</tr></thead>
      <tbody>${names.map(name => `<tr data-class="${esc(name)}"><th scope="row"><a href="${esc(classHref(name))}">${esc(name)}</a></th>${ROLE_ORDER.map(role => {
        const c = cell(all[name], name, role, ratings);
        return `<td data-role="${role}" data-kind="${c.kind}" data-ours="${esc(c.ours)}">${c.html}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function rolesKeyHtml(ratings) {
  const used = [...ratings.sources.values()];
  return `<div class="ae-gd-key">
      <p><b>Main role</b>: the role the class's main build plays. <b>Can play</b>: we have a build for it. <b>Pending</b>: a build is being sourced. <b>-</b>: no build for that role.${used.length ? ' A rating marked <span class="ae-tag is-reported">Reported</span> comes from the source named under it; it is that source\'s view, not ours.' : ''}</p>
      ${used.length ? `<ol class="ae-gd-sources">${used.map(source => `<li id="aeRoleSrc${ratings.numbers.get(source.ref)}"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>, ${esc(source.publisher)} (read ${esc(source.retrievedOn)})</li>`).join('')}</ol>` : ''}
    </div>`;
}

const mainOf = records => (records ?? []).find(item => item.main) ?? (records ?? [])[0] ?? null;
const artImg = (name, size = 72) => { const src = classArt(name); return src ? `<img class="ae-gd-art" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''; };

function galleryHtml(all) {
  return `<ul class="ae-gd-gallery" data-class-gallery>${GUIDE_CLASSES.map(name => {
    const main = mainOf(all[name]);
    return `<li><a class="ae-menu-card ae-btn ae-gd-class" href="${esc(classHref(name))}" data-class="${esc(name)}">
        <span class="ae-menu-art">${artImg(name, 84)}</span>
        <span class="ae-menu-name">${esc(name)}</span>
        <span class="ae-menu-status">${main ? esc(ROLE_LABEL[main.role]) : 'Pending'}</span>
        <span class="ae-gd-tagline">${main ? esc(firstSentence(main.summary)) : 'Builds pending.'}</span>
      </a></li>`;
  }).join('')}</ul>`;
}

/** Which classes suit each role, and the solo and party picks the builds name, all from the build data. */
function suggestionsHtml(all) {
  const builds = GUIDE_CLASSES.flatMap(name => (all[name] ?? []).map(build => ({ ...build, cls: name })));
  const byBeginner = list => [...list].sort((a, b) => BEGINNER_ORDER.indexOf(a.beginner) - BEGINNER_ORDER.indexOf(b.beginner));
  const link = build => `<a href="${esc(classHref(build.cls))}">${esc(build.cls)}</a>`;
  const roles = ROLE_ORDER.map(role => {
    const list = builds.filter(build => build.role === role && build.status !== 'pending');
    const main = list.filter(build => build.main);
    const also = list.filter(build => !build.main);
    const easiest = byBeginner(list)[0];
    return `<li data-suggest-role="${role}"><h3>${ROLE_LABEL[role]}</h3>
        <p>${main.length ? `Main role for ${main.map(link).join(', ')}.` : 'No class plays it as its main role.'}${also.length ? ` Also played by ${also.map(link).join(', ')}.` : ''}</p>
        ${easiest?.beginner ? `<p class="ae-muted">Easiest start: ${link(easiest)} (new player friendly: ${esc(easiest.beginner)}).</p>` : ''}</li>`;
  }).join('');
  const solo = builds.filter(build => /solo/i.test(build.label ?? '') || build.teamVariants?.solo);
  const mainTank = builds.filter(build => build.role === 'tank' && (build.main || build.teamVariants?.['main-tank']));
  const offTank = builds.filter(build => build.teamVariants?.['off-tank-templar']);
  const activity = (title, list, words) => (list.length ? `<li data-suggest-activity="${esc(title)}"><h3>${esc(title)}</h3><p>${list.map(build => `${link(build)}: ${esc(build.teamVariants?.[words]?.label ?? build.label)}`).join('. ')}.</p></li>` : '');
  return `<ul class="ae-gd-suggest">${roles}</ul>
    <h3 class="ae-gd-h3">By activity</h3>
    <ul class="ae-gd-suggest">${activity('Solo and levelling', solo, 'solo')}${activity('Party: main tank', mainTank, 'main-tank')}${activity('Party: off-tank next to a Templar', offTank, 'off-tank-templar')}</ul>`;
}

function choosingHtml(all) {
  const easy = GUIDE_CLASSES.filter(name => ['very high', 'high'].includes(mainOf(all[name])?.beginner));
  return `<ol class="ae-gd-choose">
      <li><b>Pick the job you enjoy.</b> Holding the boss (Tank), keeping the party alive (Healer), making everyone stronger (Support) or dealing the damage (DPS). The table above shows who plays what.</li>
      ${easy.length ? `<li><b>New to AION 2?</b> Our build data rates these main builds the friendliest to learn: ${easy.map(name => `<a href="${esc(classHref(name))}">${esc(name)}</a>`).join(', ')}.</li>` : ''}
      <li><b>Check the class page.</b> Each one lists its builds by role, the key skills, the stat order and the manastones, with links into your Ascent Plan.</li>
      <li><b>Link your Daeva.</b> Find your character on the Daeva Card and the class page shows where your setup differs from the build, and what that costs you. It never stops you playing your way.</li>
    </ol>`;
}

async function renderClasses() {
  const body = renderGuideShell({ section: 'character', title: 'Classes', crumbs: [{ label: 'Character', href: `${GUIDE_ROOT}character/` }, { label: 'Classes' }], lede: 'AION 2 has eight classes. Each has a main role and some can play another. Start with the table, then open a class to see its builds.' });
  const [all, ratingsData] = await Promise.all([loadAll(), loadRatings()]);
  const ratings = indexRatings(ratingsData);
  body.insertAdjacentHTML('beforeend', `
    <section class="ae-gd-sec" aria-labelledby="aeRolesTitle"><h2 id="aeRolesTitle">Class roles</h2>${rolesTableHtml(all, ratings)}${rolesKeyHtml(ratings)}</section>
    <section class="ae-gd-sec" aria-labelledby="aeGalleryTitle"><h2 id="aeGalleryTitle">The classes</h2>${galleryHtml(all)}</section>
    <section class="ae-gd-sec" aria-labelledby="aeSuggestTitle"><h2 id="aeSuggestTitle">Which class for which role</h2>${suggestionsHtml(all)}</section>
    <section class="ae-gd-sec" aria-labelledby="aeChooseTitle"><h2 id="aeChooseTitle">Choosing a class</h2>${choosingHtml(all)}</section>`);
}

/* A class page. */
function ascentLinks(name, role, linked) {
  const mine = linked?.entry?.className === name ? linked.ref : null;
  return `<nav class="ae-gd-ascent" aria-label="${esc(ROLE_LABEL[role])} build in your Ascent Plan"><p>${mine ? 'Open this build in your Ascent Plan' : 'Open this build in the Ascent Plan'}:</p><ul>${SCREENS.map(([screen, label]) => `<li><a class="ae-btn" data-ascent="${screen}" href="${esc(mine ? ascentUrl(mine, name, { screen, role }) : `/hub/aetherium/ascent/${screen}/?class=${name.toLowerCase()}&role=${role}`)}">${label}</a></li>`).join('')}</ul></nav>`;
}

function buildHtml(name, build, icons, linked) {
  const skills = [...(build.coreSkills ?? [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const iconOf = skill => { const found = icons?.records?.[0]?.skills?.find(item => item.name === skill); return found ? `${icons.records[0].iconBase}${found.icon}` : null; };
  const stats = isPending(build.stats) ? null : build.stats;
  const stones = stats?.manastones && !isPending(stats.manastones) ? stats.manastones : null;
  const sources = new Map((build.provenance ?? []).filter(source => source.url).map(source => [source.publisher, source.url]));
  return `<article class="ae-gd-build" id="build-${esc(build.role)}" data-build="${esc(build.id)}" data-role="${esc(build.role)}" aria-labelledby="aeBuild${esc(build.role)}">
      <header class="ae-gd-build-head">
        <h3 id="aeBuild${esc(build.role)}"><span class="ae-gd-build-role">${esc(ROLE_LABEL[build.role])}</span> ${esc(build.label)}</h3>
        <p class="ae-gd-chips">${build.main ? '<span class="ae-tag is-main">Main role</span>' : ''}${build.beginner ? `<span class="ae-tag" data-beginner="${esc(build.beginner)}">New player friendly: ${esc(cap(build.beginner))}</span>` : ''}${build.status === 'partial' ? '<span class="ae-tag is-reported">Partly sourced</span>' : ''}${build.status === 'pending' ? '<span class="ae-tag">Pending</span>' : ''}</p>
      </header>
      <p>${esc(build.summary ?? '')}</p>
      <div class="ae-gd-build-grid">
        <section aria-label="Key skills"><h4>Key skills</h4><ol class="ae-gd-skills">${skills.map(skill => `<li data-skill="${esc(skill.name)}">${iconImg(iconOf(skill.name), '', 40)}<span><b>${esc(skill.name)}</b><small>${esc(skill.why ?? '')}</small></span></li>`).join('')}</ol></section>
        <section aria-label="Stat order"><h4>Stat order</h4>${stats?.order?.length ? `<ol class="ae-gd-stats">${stats.order.map(stat => `<li>${esc(stat)}</li>`).join('')}</ol>` : `<p class="ae-muted">${esc(isPending(build.stats) ? build.stats.reason : 'Not sourced yet.')}</p>`}
          <h4>Manastones</h4>${stones ? `<p>${esc(stones.advice ?? '')}</p>${stones.caps?.length ? `<ul class="ae-coming-list">${stones.caps.map(item => `<li><b>${esc(item.stat)}</b>${esc(item.cap)}</li>`).join('')}</ul>` : ''}` : `<p class="ae-muted">${esc(isPending(stats?.manastones) ? stats.manastones.reason : 'No manastone advice for this build yet.')}</p>`}
          ${!isPending(build.stigmas) && build.stigmas?.slots?.length ? `<h4>Stigmas</h4><ol class="ae-gd-stats">${build.stigmas.slots.map(slot => `<li>${esc(slot.name)} <small class="ae-muted">slot Lv ${esc(slot.slotLevel)}</small></li>`).join('')}</ol>` : ''}
        </section>
      </div>
      ${ascentLinks(name, build.role, linked)}
      ${sources.size ? `<p class="ae-gd-cite">Sources: ${[...sources].map(([publisher, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(publisher)}</a>`).join(', ')}</p>` : ''}
    </article>`;
}

async function renderClass(name, linked) {
  const body = renderGuideShell({ section: 'character', title: name, crumbs: [{ label: 'Character', href: `${GUIDE_ROOT}character/` }, { label: 'Classes', href: `${GUIDE_ROOT}classes/` }, { label: name }] });
  const [all, ratingsData, icons] = await Promise.all([loadAll(), loadRatings(), loadIcons(name)]);
  const ratings = indexRatings(ratingsData);
  const records = [...(all[name] ?? [])].sort((a, b) => Number(b.main) - Number(a.main) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const main = mainOf(records);
  body.insertAdjacentHTML('beforeend', `
    <section class="ae-gd-overview" aria-labelledby="aeOverviewTitle">
      <span class="ae-gd-overview-art">${artImg(name, 96)}</span>
      <div>
        <h2 id="aeOverviewTitle">${esc(name)} overview</h2>
        <p class="ae-gd-lede">${main ? esc(main.summary) : 'Builds for this class are pending.'}</p>
        <p>${main ? `Main role: <b>${esc(ROLE_LABEL[main.role])}</b>.` : ''}${records.length > 1 ? ` Also plays: ${records.filter(build => !build.main).map(build => `<a href="#build-${esc(build.role)}">${esc(ROLE_LABEL[build.role])}</a>`).join(', ')}.` : ''}</p>
      </div>
    </section>
    <section class="ae-panel ae-gd-setup" id="aeSetup" aria-labelledby="aeSetupTitle" aria-live="polite"></section>
    <section class="ae-gd-sec" aria-labelledby="aeRolesTitle"><h2 id="aeRolesTitle">${esc(name)} roles</h2>${rolesTableHtml(all, ratings, name)}${rolesKeyHtml(ratings)}</section>
    <section class="ae-gd-sec" aria-labelledby="aeBuildsTitle"><h2 id="aeBuildsTitle">Builds by role</h2>${records.map(build => buildHtml(name, build, icons, linked)).join('') || '<p class="ae-muted">Builds for this class are pending.</p>'}</section>
    <p class="ae-gd-more"><a class="ae-btn" href="${GUIDE_ROOT}classes/">All classes</a></p>`);
  renderSetup(name, records, linked);
}

/* Your setup vs the build. */
const setupBox = () => $('#aeSetup');

function renderSetup(name, records, linked) {
  const box = setupBox();
  const entry = linked?.entry;
  if (!linked) {
    box.innerHTML = `<h2 id="aeSetupTitle">Your setup vs the build</h2><p>Link your Daeva and this page shows where your stigmas, key skills and gear differ from the ${esc(name)} build, and what that costs you.</p><p><a class="ae-btn" href="/hub/aetherium/#aeSearch">Find your Daeva</a></p>`;
    box.dataset.setup = 'none';
    return;
  }
  if (entry?.className && entry.className !== name) {
    box.innerHTML = `<h2 id="aeSetupTitle">Your setup vs the build</h2><p>Your linked Daeva <b>${esc(entry.name)}</b> is a ${esc(entry.className)}, so there is nothing to compare here.</p><p><a class="ae-btn" href="${esc(classHref(entry.className))}">Open the ${esc(entry.className)} page</a></p>`;
    box.dataset.setup = 'other-class';
    return;
  }
  checkSetup(name, records, linked);
}

async function checkSetup(name, records, linked) {
  const box = setupBox();
  const before = getMemory(linked.ref)?.guide ?? null;
  const saved = before && getMemory(linked.ref);
  box.dataset.setup = 'loading';
  box.innerHTML = `<h2 id="aeSetupTitle">Your setup vs the build</h2><p class="ae-muted">Reading ${esc(linked.entry?.name ?? 'your Daeva')} from the official AION 2 site.</p>`;
  let loaded;
  try {
    loaded = await loadCharacter(linked.ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    box.dataset.setup = 'down';
    box.innerHTML = `<h2 id="aeSetupTitle">Your setup vs the build</h2><p>${esc(explain(error))}</p>${saved ? `<p class="ae-muted" data-setup-memory>Last check on this device (${esc(memoryAge(saved))}): ${esc(before.flags)} difference${before.flags === 1 ? '' : 's'} from the ${esc(ROLE_LABEL[before.role] ?? '')} build.</p>` : ''}<p><button type="button" class="ae-btn" data-setup-retry>Try again</button></p>`;
    box.querySelector('[data-setup-retry]').addEventListener('click', () => checkSetup(name, records, linked));
    return;
  }
  const { model, source } = loaded;
  if (model.profile.class !== name) { renderSetup(name, records, { ...linked, entry: { ...(linked.entry ?? {}), name: model.profile.name, className: model.profile.class } }); return; }
  const [data, engine, assessor] = await Promise.all([loadAdvisor(name), import('/astrix-app/games/aion2/engine/ascent-advisor.mjs'), import('/astrix-app/games/aion2/engine/item-assessor.mjs')]);
  const pick = rolePick(linked.ref);
  const plan = engine.buildAscentPlan({ className: name, role: pick.role, team: pick.team, level: model.profile.level, data, model });
  const build = engine.buildFor(data.builds, { role: plan.role, team: pick.team });
  const flags = setupFlags({ plan, build, model, data, engine, assessor, records });
  const record = setMemory(linked.ref, { guide: { className: name, role: plan.role, flags: flags.length, readAt: source.fetchedAt ?? null } });
  box.dataset.setup = flags.length ? 'flags' : 'clear';
  box.innerHTML = `<h2 id="aeSetupTitle">Your setup vs the build</h2>
    <p><b>${esc(model.profile.name)}</b>, ${esc(name)} Lv ${esc(model.profile.level)}, against the <a href="#build-${esc(plan.role)}">${esc(ROLE_LABEL[plan.role])}: ${esc(plan.build.label)}</a> build${pick.role ? ' (the role saved in your Ascent Plan)' : ' (the class\'s main role)'}.</p>
    <p class="ae-gd-age" data-setup-source>${esc(sourceLabel(source))}</p>
    ${flags.length ? `<ul class="ae-gd-flags">${flags.map(flag => `<li data-flag="${esc(flag.kind)}"><b>${esc(flag.title)}</b><span>${esc(flag.cost)}</span></li>`).join('')}</ul>` : '<p data-setup-clear>Your stigmas, key skills and worn gear match the build. Nothing to change.</p>'}
    <p class="ae-muted">This is a guide: play your way. The flags say what you give up, nothing is locked.${before && record ? ` Last check on this device: ${esc(before.flags)} difference${before.flags === 1 ? '' : 's'} (${esc(memoryAge(saved))}).` : ''}</p>
    <p class="ae-gd-actions"><a class="ae-btn" href="${esc(ascentUrl(linked.ref, name, { role: plan.role }))}">Fix it in your Ascent Plan</a><a class="ae-btn" href="${esc(gearPageUrl(linked.ref))}">Judge every piece on the Gear Ledger</a></p>`;
}

/** What strays from the build, each with what it costs. Built only from the engine's own verdicts. */
function setupFlags({ plan, build, model, data, engine, assessor }) {
  const flags = [];
  if (plan.roleFallback) flags.push({ kind: 'role', title: `${cap(plan.roleRequested)} is not a ${plan.className} build`, cost: `There is no ${plan.className} build for that role, so the Guide judges you against the ${ROLE_LABEL[plan.role]} build.` });
  const stigmas = plan.stigmas && !plan.stigmas.pending ? plan.stigmas : null;
  const slotWhy = new Map((stigmas?.slots ?? []).map(slot => [slot.name, slot.why]));
  for (const item of stigmas?.equippedNow ?? []) {
    if (item.verdict !== 'out') continue;
    flags.push({ kind: 'stigma', title: `${item.name} is not in the build`, cost: item.for ? `It takes ${item.for}'s place, so you give up ${item.for}${slotWhy.get(item.for) ? `: ${slotWhy.get(item.for)}` : '.'}` : 'It takes a slot the build fills with one of its own stigmas.' });
  }
  const standIns = new Set((stigmas?.equippedNow ?? []).map(item => item.for).filter(Boolean));
  for (const slot of stigmas?.slots ?? []) {
    if (slot.open && slot.equipped === false && !standIns.has(slot.name)) flags.push({ kind: 'stigma', title: `Stigma slot ${stigmas.slots.indexOf(slot) + 1} has no ${slot.name}`, cost: `The build slots ${slot.name} here${slot.acquired === false ? ' (not learned yet)' : ''}${slot.why ? `: ${slot.why}` : '.'}` });
  }
  for (const skill of plan.skills ?? []) {
    if (skill.unlocked === false) continue;
    if (skill.skillLevel === null && skill.unlocked) flags.push({ kind: 'skill', title: `${skill.name} not learned yet`, cost: `A key skill in this build. You give up: ${skill.why ?? 'its part in the rotation.'}` });
    else if (skill.skillLevel !== null && skill.equipped === false) flags.push({ kind: 'skill', title: `${skill.name} is not on your skill bar`, cost: `A key skill in this build. You give up: ${skill.why ?? 'its part in the rotation.'}` });
  }
  for (const slot of model.gear ?? []) {
    if (slot.empty) continue;
    const advice = engine.enchantAdvice(slot, { level: model.profile.level, grades: data.grades, progression: data.progression });
    const verdict = assessor.assessItem({ slot, advice, build, stats: data.stats });
    if (verdict.verdict === 'replace' || verdict.verdict === 'weak') flags.push({ kind: 'gear', title: `${slotLabel(slot.slot)}: ${verdict.title}`, cost: verdict.reasons.join(' ') });
  }
  return flags;
}

startGuidePage(async linked => {
  const kind = document.body.dataset.guide;
  const name = document.body.dataset.guideClass;
  if (kind === 'class' && GUIDE_CLASSES.includes(name)) await renderClass(name, linked);
  else await renderClasses();
}).catch(error => { showNotice('The classes could not load. Refresh the page to try again.', 'error'); console.error(error); });
