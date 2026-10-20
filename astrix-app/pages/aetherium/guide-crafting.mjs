/**
 * The Guide's Crafting pages (design/aetherium-guide-crafting, 20 Oct 2026): the Overview's tips, end goal and first steps,
 * Professions, Gathering and the Crafted gear ladder, drawn as pictures first. guide-equipment.mjs draws the shell and the
 * topic tiles, then puts in the markup these builders return. Every name and number comes from equipment-guide.json.
 *
 * Icons: only real game icons from the NCSOFT CDN or the rendered PNGs in images/. An item, material or profession shows
 * its icon only when its data entry carries one ({ icon }); with none the card shows its name alone, never a drawn icon.
 * Screens: SHOTS holds the in-game screenshots this section can show, { src, alt, width, height, caption }. A slot draws
 * only when its entry is set, so an empty frame never shows on the site.
 */
import { esc, gradeTile } from './aetherium-ui.mjs';
import { GUIDE_ROOT } from './guide-shell.mjs';

const IMAGES = '/astrix-app/pages/aetherium/images/';
const CRAFTING = `${GUIDE_ROOT}crafting/`;

/* Rendered icons from images/, and the one real game icon these pages use: the wings from the armory capture
   (tools/fixtures/aion2/eu/astrix285-equipment.json, petwing.wing). */
const ART = Object.freeze({
  crafting: { src: `${IMAGES}section-icons/crafting.png`, width: 512, height: 512 },
  market: { src: `${IMAGES}topic-icons/market.png`, width: 512, height: 512 },
  wings: { src: 'https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WingB_006.png', name: 'Lesser Daeva Wings' }
});

/* Miguel's screenshots: the craft window (images/crafting/craft-window.jpg) and one photo per gathering node. */
const SHOTS = Object.freeze({
  craftWindow: null,
  nodes: { ore: null, wood: null, herb: null, odyle: null }
});

const byId = list => Object.fromEntries((list ?? []).map(item => [item.id, item]));
const block = (id, title, inner, cls = '') => `<section class="ae-gx-block ae-gc-block${cls ? ` ${cls}` : ''}" id="${esc(id)}" aria-labelledby="${esc(id)}Title"><h2 class="ae-gx-h2" id="${esc(id)}Title">${esc(title)}</h2>${inner}</section>`;
const art = (item, size, alt = '') => (item?.src ? `<img class="ae-gc-art" src="${esc(item.src)}" alt="${esc(alt)}" width="${size}" height="${size}" loading="lazy" decoding="async">` : '');
/** A real game icon in its grade frame, or nothing. */
const itemIcon = (entry, size = 48, grade = null) => (entry?.icon ? gradeTile({ icon: entry.icon, grade: entry.grade ?? grade, size, alt: '' }) : '');
/** "62 (70)" or "18 (Splendent 22)": the item level and its Splendent version. */
function levels(value) {
  const found = String(value ?? '').match(/(\d+)\D+(\d+)/);
  return found ? { base: found[1], splendent: found[2] } : null;
}
/** A gold edged tip: its icon (if any), a short title and the fact. */
const tipHtml = ({ id, icon = '', title, text, extra = '', gold = false }) => `<div class="ae-gc-tip${gold ? ' is-gold' : ''}" data-tip-id="${esc(id)}">${icon ? `<span class="ae-gc-tip-icon">${icon}</span>` : ''}<div class="ae-gc-tip-copy"><h4 class="ae-gc-tip-title">${esc(title)}</h4><p>${esc(text)}</p>${extra}</div></div>`;
const shotHtml = (shot, cls) => (shot?.src ? `<figure class="ae-gc-shot ${cls}"><img src="${esc(shot.src)}" alt="${esc(shot.alt)}" width="${esc(shot.width)}" height="${esc(shot.height)}" loading="lazy" decoding="async">${shot.caption ? `<figcaption>${esc(shot.caption)}</figcaption>` : ''}</figure>` : '');
/** The steps of the ladder we can show: a step whose place in the global client is disputed stays off. */
const shownSteps = ladder => (ladder?.steps ?? []).filter(step => step.status !== 'disputed');

/* ----- Overview ----- */

/** Soul Binding lines as markers: crafted Dragon Lord against a dungeon drop. */
function bindingHtml(lines) {
  if (!lines) return '';
  const most = Math.max(lines.crafted, ...lines.drops);
  const row = (label, filled, maybe, key) => `<div class="ae-gc-lines" data-lines="${esc(key)}"><span class="ae-gc-lines-label">${esc(label)}</span><span class="ae-gc-marks" aria-hidden="true">${Array.from({ length: most }, (_, n) => `<i class="ae-gc-mark${n < filled ? ' is-on' : n < maybe ? ' is-maybe' : ''}"></i>`).join('')}</span><b>${esc(maybe > filled ? `${filled} or ${maybe}` : filled)}</b></div>`;
  const low = Math.min(...lines.drops);
  const high = Math.max(...lines.drops);
  return `<div class="ae-gc-binding" role="img" aria-label="Soul Binding lines: crafted Dragon Lord ${esc(lines.crafted)}, dungeon drops ${esc(low)} or ${esc(high)}">${row('Crafted Dragon Lord', lines.crafted, lines.crafted, 'crafted')}${row('Dungeon drop', low, high, 'drop')}</div>`;
}

export function craftingHomeHtml(text) {
  const professions = text.professions;
  const ladder = text['crafted-ladder'];
  const before = byId(professions?.facts)['before-35'];
  const dragon = byId(ladder?.facts)['dragon-lord'];
  const steps = shownSteps(ladder);
  const top = steps.find(step => step.name === 'Dragon Lord');
  const lower = steps.filter(step => step !== top && Number.isFinite(step.proficiency));
  const tips = [
    before ? tipHtml({ id: 'before-35', gold: true, icon: art(ART.crafting, 64), title: 'Gather and level crafting early', text: before.text }) : '',
    dragon ? tipHtml({ id: 'dragon-lord', icon: itemIcon(top, 64, 'unique'), title: 'Dragon Lord has one more line', text: dragon.text, extra: bindingHtml(dragon.soulBindingLines) }) : ''
  ].join('');
  const level = levels(top?.bowItemLevel);
  const goal = top ? `<div class="ae-gc-goal" data-grade="${esc((top.grade ?? '').toLowerCase())}" data-goal>
      ${itemIcon(top, 80, 'unique')}
      <div class="ae-gc-goal-copy">
        <h3 class="ae-gc-card-title">${esc(top.name)}</h3>
        <p class="ae-gc-goal-names">${esc(top.example)}</p>
        <dl class="ae-gc-stats">
          ${top.grade ? `<div><dt>Grade</dt><dd><span class="ae-grade-name" data-grade="${esc(top.grade.toLowerCase())}">${esc(top.grade)}</span></dd></div>` : ''}
          ${level ? `<div><dt>Bow item level</dt><dd>${esc(level.base)}</dd></div><div><dt>Splendent</dt><dd>${esc(level.splendent)}</dd></div>` : ''}
        </dl>
      </div>
    </div>` : '';
  const gather = text.gathering;
  const path = [
    gather ? { title: 'Gather as you quest', text: gather.lede, href: `${CRAFTING}gathering/` } : null,
    lower.length ? { title: 'Climb with combos', text: lower.map(step => `${step.name} at proficiency ${step.proficiency}`).join(', ') + '.', href: `${CRAFTING}crafted-gear/` } : null,
    top ? { title: `Make ${top.name}`, text: 'The top of the crafted ladder.', href: `${CRAFTING}crafted-gear/` } : null
  ].filter(Boolean);
  return `${tips ? block('aeCraftWhy', 'Why craft', `<div class="ae-gc-tips">${tips}</div>`) : ''}
    ${goal ? block('aeCraftGoal', 'Your end goal', goal) : ''}
    ${path.length ? block('aeCraftPath', 'What to craft first', `<ol class="ae-gd-steps ae-gc-path">${path.map((step, index) => `<li><a class="ae-gd-step" href="${esc(step.href)}" data-craft-step="${index + 1}"><span class="ae-gd-step-n" aria-hidden="true">${index + 1}</span><strong>${esc(step.title)}</strong><small>${esc(step.text)}</small></a></li>`).join('')}</ol>`) : ''}`;
}

/* ----- Professions ----- */

function professionCard(item) {
  const makes = item.makesList ?? [];
  return `<li class="ae-gc-prof" data-profession="${esc(item.id)}">
      ${item.icon ? `<span class="ae-gc-prof-icon">${itemIcon(item, 64)}</span>` : ''}
      <h3 class="ae-gc-card-title">${esc(item.name)}</h3>
      <h4 class="ae-gc-h4">Makes</h4>
      <ul class="ae-gc-makes">${makes.map(entry => (typeof entry === 'object' && entry.icon
        ? `<li title="${esc(entry.name)}">${itemIcon(entry, 40)}<span class="ae-sr">${esc(entry.name)}</span></li>`
        : `<li class="ae-gc-chip">${esc(typeof entry === 'object' ? entry.name : entry)}</li>`)).join('')}</ul>
      ${item.refines ? `<h4 class="ae-gc-h4">Refines</h4><p class="ae-gc-refines">${esc(item.refines)}</p>` : ''}
    </li>`;
}

function proficiencyHtml(record) {
  const bar = record.proficiencyBar;
  const facts = byId(record.facts);
  if (!bar) return '';
  const promo = (bar.noviceTo / bar.max) * 100;
  return `<figure class="ae-gc-bar" aria-label="${esc(facts.proficiency?.text ?? '')}" data-proficiency-bar>
      <div class="ae-gc-bar-track">
        <span class="ae-gc-bar-open" data-opens><b>Lv ${esc(bar.opensAtLevel)}</b><small>Character level</small></span>
        <span class="ae-gc-bar-segs">
        <span class="ae-gc-bar-seg is-novice" style="flex:${promo} 1 0"><b>Novice</b><small>1 to ${esc(bar.noviceTo)}</small></span>
        <span class="ae-gc-bar-promo" style="left:${promo}%" data-promotion><i aria-hidden="true"></i><b>Promotion quest</b></span>
        <span class="ae-gc-bar-seg is-pro" style="flex:${100 - promo} 1 0"><b>After promotion</b><small>${esc(bar.noviceTo + 1)} to ${esc(bar.max)}</small></span>
        </span>
      </div>
      <p class="ae-gc-bar-text">${esc(facts.unlock?.text ?? '')}</p>
    </figure>`;
}

const RULE_LEADS = { fail: 'Fail', hit: 'Hit or move', core: 'Core', combo: 'Combo' };

function rulesHtml(rules) {
  const facts = byId(rules?.facts);
  const [failText, hitText] = String(facts.failure?.text ?? '').split(/(?<=\.)\s+/);
  const steps = [facts.gauges, facts.chance].filter(Boolean);
  const keys = [
    failText ? { id: 'fail', text: failText } : null,
    hitText ? { id: 'hit', text: hitText } : null,
    facts['no-100'] ? { id: 'core', text: facts['no-100'].text } : null,
    facts.combo ? { id: 'combo', text: facts.combo.text, extra: `<div class="ae-gc-combo" aria-hidden="true"><span class="ae-gc-combo-item">The item</span><span class="ae-gc-combo-arrow">to</span><span class="ae-gc-combo-item is-up">Splendent<small>one grade up</small></span></div>` } : null
  ].filter(Boolean);
  const shot = shotHtml(SHOTS.craftWindow, 'is-craft');
  return `<div class="ae-gc-how${shot ? ' has-shot' : ''}"><ol class="ae-gc-numbered">${steps.map((fact, index) => `<li data-fact="${esc(fact.id)}"><span class="ae-gc-num" aria-hidden="true">${index + 1}</span><p>${esc(fact.text)}</p></li>`).join('')}</ol>${shot}</div>
    <ul class="ae-gc-keys">${keys.map(key => `<li class="ae-gc-key" data-key="${esc(key.id)}"><b class="ae-gc-key-lead">${esc(RULE_LEADS[key.id])}</b><p>${esc(key.text)}</p>${key.extra ?? ''}</li>`).join('')}</ul>`;
}

export function professionsHtml(text) {
  const record = text.professions;
  const facts = byId(record.facts);
  const free = facts.free;
  return `${block('aeProf', 'The five professions', `<p class="ae-gc-lede">${esc(record.lede)}</p><ul class="ae-gc-profs">${record.professions.map(professionCard).join('')}</ul>
      ${free ? tipHtml({ id: 'free', gold: true, icon: art(ART.market, 56), title: 'Free to craft', text: free.text }) : ''}`)}
    ${block('aeProfBar', 'Proficiency', proficiencyHtml(record))}
    ${block('aeCraftRules', 'How a craft works', rulesHtml(text['craft-rules']))}
    ${block('aeCraftFirst', 'Which first: our pick for your class', `<ul class="ae-gc-picks">${record.players.map((item, n) => `<li data-fact="players-${n + 1}"><p>${esc(item.text)}</p></li>`).join('')}</ul>`)}`;
}

/* ----- Gathering ----- */

const PROFESSION_NAMES = text => Object.fromEntries((text.professions?.professions ?? []).map(item => [item.id, item]));
const NODE_SHOT = { Ore: 'ore', Wood: 'wood', Herbs: 'herb', Odyle: 'odyle' };

function materialCard(type, names) {
  const shot = shotHtml(SHOTS.nodes[NODE_SHOT[type.name]], 'is-node');
  /* A type that is its own material (Odyle) lists it only when it has an icon to show. */
  const materials = (type.materials ?? []).filter(mat => mat.name !== type.name || mat.icon);
  return `<li class="ae-gc-mat" data-material="${esc(type.name)}">
      ${shot}
      <h3 class="ae-gc-card-title">${esc(type.name)}</h3>
      ${materials.length ? `<ul class="ae-gc-mat-list">${materials.map(mat => `<li>${itemIcon(mat, 40)}<span class="ae-gc-mat-name">${esc(mat.name)}</span>${mat.faction ? `<span class="ae-gc-faction" data-faction="${esc(mat.faction.toLowerCase())}">${esc(mat.faction)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <h4 class="ae-gc-h4">Used for</h4>
      <p class="ae-gc-use">${esc(type.usedFor)}</p>
      ${(type.professions ?? []).length ? `<ul class="ae-gc-makes">${type.professions.map(id => names[id]).filter(Boolean).map(prof => `<li class="ae-gc-chip${prof.icon ? ' has-icon' : ''}" data-for="${esc(prof.id)}">${itemIcon(prof, 24)}${esc(prof.name)}</li>`).join('')}</ul>` : ''}
    </li>`;
}

const GATHER_TIPS = {
  odyle: { title: 'Odyle needs wings', icon: () => `<img class="ae-gc-art is-game" src="${esc(ART.wings.src)}" alt="" title="${esc(ART.wings.name)}" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">` },
  skills: { title: 'Gathering skills' },
  nodes: { title: 'Nodes' },
  where: { title: 'Where to look' },
  leather: { title: 'Raw Leather' },
  merchant: { title: 'Additives' }
};

export function gatheringHtml(text) {
  const record = text.gathering;
  const names = PROFESSION_NAMES(text);
  const facts = byId(record.facts);
  const qualities = record.qualities?.list ?? [];
  const tips = Object.entries(GATHER_TIPS).filter(([id]) => facts[id]).map(([id, tip]) => tipHtml({ id, icon: tip.icon?.() ?? '', title: tip.title, text: facts[id].text })).join('');
  return `${block('aeGatherTypes', 'What you gather', `<p class="ae-gc-lede">${esc(record.lede)}</p><ul class="ae-gc-mats">${record.types.map(type => materialCard(type, names)).join('')}</ul>`)}
    ${qualities.length ? block('aeGatherQuality', 'Four qualities', `<ol class="ae-gc-quality" data-qualities>${qualities.map((name, index) => `<li><span class="ae-gc-num" aria-hidden="true">${index + 1}</span><b>${esc(name)}</b></li>`).join('')}</ol>
      <p class="ae-gc-note">${esc(record.qualities.text)}</p>
      ${facts.conversion ? `<p class="ae-gc-note">${esc(facts.conversion.text)}</p>` : ''}`) : ''}
    ${tips ? block('aeGatherFacts', 'Good to know', `<div class="ae-gc-tips is-grid">${tips}</div>`) : ''}`;
}

/* ----- Crafted gear ----- */

export function craftedGearHtml(text) {
  const record = text['crafted-ladder'];
  const steps = shownSteps(record);
  const rung = step => {
    const level = levels(step.bowItemLevel);
    const grade = step.grade ? step.grade.toLowerCase() : null;
    return `<li class="ae-gc-rung"${grade ? ` data-grade="${esc(grade)}"` : ''} data-rung="${esc(step.name)}">
        ${itemIcon(step, 56, grade)}
        <div class="ae-gc-rung-copy">
          <h3 class="ae-gc-rung-name">${esc(step.name)}${step.grade ? ` <span class="ae-grade-name" data-grade="${esc(grade)}">${esc(step.grade)}</span>` : ''}</h3>
          <p class="ae-gc-rung-eg">${esc(step.example)}</p>
          <p class="ae-gc-rung-meta"><span>Proficiency ${esc(step.proficiency)}</span>${level ? `<span>Item level ${esc(level.base)}</span>` : ''}</p>
        </div>
        ${level ? `<span class="ae-gc-rung-splendent"><small>Splendent</small><b>${esc(level.splendent)}</b></span>` : ''}
      </li>`;
  };
  const combo = (from, to) => `<li class="ae-gc-link" aria-hidden="true" data-combo="${esc(from.name)}"><span class="ae-gc-link-arrow"></span><span>Splendent ${esc(from.name)} makes ${esc(to.name)}</span></li>`;
  const items = [];
  steps.forEach((step, index) => {
    items.push(rung(step));
    if (steps[index + 1]) items.push(combo(step, steps[index + 1]));
  });
  return `${block('aeLadder', 'The ladder', `<p class="ae-gc-lede">${esc(record.lede)}</p><ol class="ae-gc-ladder">${items.reverse().join('')}</ol><p class="ae-gc-note">Item levels are for the bow.</p>`)}
    ${block('aeLadderFacts', 'What to know', `<ul class="ae-gc-picks">${record.facts.map(fact => `<li data-fact="${esc(fact.id)}"><p>${esc(fact.text)}</p></li>`).join('')}</ul>`)}
    ${block('aeLadderNext', 'Then enhance it', `<p>A crafted Dragon Lord piece is Unique, so it follows the Unique steps.</p><p class="ae-gx-cta"><a class="ae-gd-btn is-gold" href="${GUIDE_ROOT}equipment/enhancement/" data-enhance-next>What to enhance, and when</a></p>`)}`;
}
