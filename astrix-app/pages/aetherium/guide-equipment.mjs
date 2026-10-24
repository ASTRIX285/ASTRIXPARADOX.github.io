/**
 * The Guide's Equipment and Crafting sections (feature/aetherium-guide-equipment, 18 Oct 2026), and Where to get it.
 * The page says which one it is on <body data-guide-section="equipment|crafting" data-guide-page="<topic>">. Every fact
 * comes from a data record (grades.json, enhancement.json, gear-sources.json, equipment-guide.json) with its status
 * tag; nothing is written here that the data does not hold. Where to get it reads the linked Daeva once (the one
 * character call, then item details already kept or within the usual budget) and asks gear-sources.mjs what drops better
 * for each slot. It is a guide: a slot that strays is flagged with what it costs, never blocked.
 */
import { $, esc, gradeTile, number, showNotice, showSource, slotLabel } from './aetherium-ui.mjs';
import { ArmoryUnavailable, cardUrl, explain, gearPageUrl, loadBuilds, loadCharacter, loadEnhancement, loadGrades, loadProgression, preloadItemDetails, refFromUrl, rolePick, titlesUrl } from './aetherium-data.mjs';
import { GUIDE_ROOT, overviewHtml, renderGuideShell, startGuidePage } from './guide-shell.mjs';
import { craftedGearHtml, craftingHomeHtml, gatheringHtml, professionsHtml } from './guide-crafting.mjs';
import { buildFor, indexGrades, uniqueGearLevel } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { gearSourcePlan, indexGearSources, slotGroupOf } from '/astrix-app/games/aion2/engine/gear-sources.mjs';

const ADVISOR = '/astrix-app/games/aion2/data/advisor/';
const EQUIPMENT = `${GUIDE_ROOT}equipment/`;
const CRAFTING = `${GUIDE_ROOT}crafting/`;
export const WHERE_TO_GET = `${EQUIPMENT}where-to-get/`;

const cache = new Map();
const getJson = path => {
  if (!cache.has(path)) cache.set(path, fetch(path).then(response => { if (!response.ok) throw new Error(`${path}: ${response.status}`); return response.json(); }).catch(error => { cache.delete(path); throw error; }));
  return cache.get(path);
};
const loadSources = () => getJson(`${ADVISOR}gear-sources.json`);
const loadGuideText = () => getJson(`${ADVISOR}equipment-guide.json`);
const byId = data => Object.fromEntries((data?.records ?? []).map(record => [record.id, record]));

/** A Daeva's query string (serverId, characterId, region), from the shared address helper. */
const daevaQuery = ref => (ref ? cardUrl(ref).split('?')[1] ?? '' : '');
/** Where to get it for a Daeva, optionally at one slot. */
export const whereToGetUrl = (ref, slotPos = null) => `${WHERE_TO_GET}${ref ? `?${daevaQuery(ref)}` : ''}${Number.isFinite(slotPos) ? `#slot-${slotPos}` : ''}`;
const enhanceTabUrl = ref => {
  const base = gearPageUrl(ref);
  return `${base}${base.includes('?') ? '&' : '?'}view=enhance`;
};

/* The topics of each section, in order. Each is its own short page. */
const TOPICS = {
  equipment: [
    { id: 'slots', label: 'Slots and grades', blurb: 'Every gear slot, the item grades and how far each one enhances.' },
    { id: 'enhancement', label: 'Enhancement', blurb: 'The five tabs of the Enhancement window and what to enhance, when.' },
    { id: 'manastones', label: 'Manastones', blurb: 'Manastones on weapons and armour, Soulstones on accessories.' },
    { id: 'theostones', label: 'Theostones', blurb: 'One proc stone each on your weapon and guard.' },
    { id: 'arcana', label: 'Arcana', blurb: 'Five card slots from Transcendence that raise item level and skill levels.' },
    { id: 'pets-wings', label: 'Pets and wings', blurb: 'Collections that give permanent stats, worn or not.' },
    { id: 'titles', label: 'Titles', blurb: 'Where titles come from and what they give.' },
    { id: 'where-to-get', label: 'Where to get it', blurb: 'For your Daeva: where each slot drops a better piece, and the gate.' }
  ],
  crafting: [
    { id: 'professions', label: 'Professions', blurb: 'The five crafts, what each makes, and how a craft works.' },
    { id: 'gathering', label: 'Gathering', blurb: 'The materials, their qualities and where to find them.' },
    { id: 'crafted-gear', label: 'Crafted gear', blurb: 'The crafted gear ladder up to Dragon Lord.' }
  ]
};
const SECTION = { equipment: { label: 'Equipment', href: EQUIPMENT }, crafting: { label: 'Crafting', href: CRAFTING } };
const topicHref = (section, id) => `${SECTION[section].href}${id}/`;

/** Facts show as plain text (Miguel, 18 Oct 2026: no status tags on any page). Status stays in the data. */
export function statusTag() {
  return '';
}
const factLi = item => `<li class="ae-gx-fact" data-fact="${esc(item.id ?? '')}"><span>${esc(item.text)}</span> ${statusTag(item.status)}</li>`;
const factsHtml = (facts, cls = '') => (facts?.length ? `<ul class="ae-gx-facts${cls ? ` ${cls}` : ''}">${facts.map(factLi).join('')}</ul>` : '');
const sectionHtml = (id, title, inner, tag = '') => `<section class="ae-gx-block" id="${esc(id)}" aria-labelledby="${esc(id)}Title"><h2 class="ae-gx-h2" id="${esc(id)}Title">${esc(title)}${tag ? ` ${tag}` : ''}</h2>${inner}</section>`;
const pendingText = value => (value && typeof value === 'object' && value.pending ? value.reason : null);

/** The other topics of the section as pills, the current one lit, so every page leads on without going back. */
function topicNav(section, current) {
  return `<nav class="ae-gx-topicnav" aria-label="${esc(SECTION[section].label)} topics"><ul>${TOPICS[section].map(topic => `<li><a class="ae-btn" href="${esc(topicHref(section, topic.id))}" data-guide-topic-link="${esc(topic.id)}"${topic.id === current ? ' aria-current="page"' : ''}>${esc(topic.label)}</a></li>`).join('')}</ul></nav>`;
}

function shell(section, page) {
  const topic = TOPICS[section].find(item => item.id === page) ?? null;
  const crumbs = topic ? [{ label: SECTION[section].label, href: SECTION[section].href }, { label: topic.label }] : [{ label: SECTION[section].label }];
  const body = renderGuideShell({ section, title: topic?.label ?? SECTION[section].label, crumbs, lede: topic?.blurb ?? null });
  if (topic) body.insertAdjacentHTML('beforeend', topicNav(section, page));
  return body;
}

/* ----- Section home pages ----- */

/** The section's topics as the shared Overview cards (guide-shell.mjs), each with its real game icon where we have one. */
const tilesHtml = section => overviewHtml(section, TOPICS[section].map(topic => ({ id: topic.id, label: topic.label, href: topicHref(section, topic.id), blurb: topic.blurb })));

/** Where each slot group drops, from every Expedition's Conquest loot: the table the Equipment home shows to everyone. */
export function dropTableHtml(sources) {
  const index = indexGearSources(sources);
  const groups = index.byId.get('slot-groups')?.groups.filter(group => ['weapon', 'guard', 'armour', 'accessory'].includes(group.id)) ?? [];
  const rows = [];
  for (const source of index.expeditions) {
    const conquest = source.difficulties.find(entry => entry.id === 'conquest');
    for (const item of Array.isArray(conquest?.loot) ? conquest.loot.filter(entry => entry.group) : []) {
      const group = groups.find(entry => entry.id === item.group);
      rows.push(`<tr data-drop="${esc(source.id)}:${esc(item.group)}"><th scope="row">${esc(source.name)}</th><td>${esc(group?.name ?? item.group)}${group && group.status !== 'confirmed' ? '<span class="ae-gx-star" aria-hidden="true">*</span>' : ''}</td><td>${esc(item.grade)}</td><td>${esc(item.itemLevel ?? '-')}</td><td>Lv ${esc(conquest.level)}, ${esc(number(conquest.entryItemLevel))}+</td></tr>`);
    }
  }
  return `<div class="ae-gx-tablewrap"><table class="ae-gx-table" id="aeDropTable"><caption>Expedition Conquest drops, with every boss defeated ${statusTag('reported')}</caption>
      <thead><tr><th scope="col">Expedition</th><th scope="col">Slots</th><th scope="col">Grade</th><th scope="col">Item level</th><th scope="col">Entry</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <p class="ae-gx-note"><span aria-hidden="true">*</span> Armour and accessory drops come as a series.</p>`;
}

async function renderEquipmentHome(linked) {
  const body = shell('equipment', null);
  body.insertAdjacentHTML('beforeend', tilesHtml('equipment'));
  const sources = await loadSources();
  const ref = refFromUrl() ?? linked?.ref ?? null;
  const name = linked?.entry?.name;
  body.insertAdjacentHTML('beforeend', sectionHtml('aeWhereHome', 'Where gear drops', `
      <p>Each Expedition drops its own slots. Pick the one that drops the slot you need, at an entry gate you can meet.</p>
      ${dropTableHtml(sources)}
      <p class="ae-gx-cta"><a class="ae-btn" href="${esc(whereToGetUrl(ref))}" data-where-link>${ref ? `Where to get it for ${esc(name ?? 'your Daeva')}` : 'Where to get it for your Daeva'}</a></p>`));
}

async function renderCraftingHome() {
  const body = shell('crafting', null);
  body.insertAdjacentHTML('beforeend', tilesHtml('crafting'));
  body.insertAdjacentHTML('beforeend', craftingHomeHtml(byId(await loadGuideText())));
}

/* ----- Equipment topic pages ----- */

async function renderSlots() {
  const body = shell('equipment', 'slots');
  const [grades, progression, text] = await Promise.all([loadGrades(), loadProgression(), loadGuideText()]);
  const slots = byId(text).slots;
  const uniqueFrom = uniqueGearLevel(progression);
  const groups = slots.groups.map(group => `<li class="ae-gx-card" data-slot-group="${esc(group.id)}"><strong>${esc(group.name)}</strong><span class="ae-gx-slotnames">${group.slots.map(name => esc(slotLabel(name))).join(', ')}</span><span>${esc(group.text)}</span></li>`).join('');
  const rows = (grades.records ?? []).filter(record => record.code && record.name).map(record => {
    const cap = record.cap?.pending ? `${esc(record.cap.reason)} ${statusTag('pending')}` : `+${esc(record.cap.value)} ${statusTag(record.cap.status)}`;
    return `<tr data-grade-row="${esc(record.id)}"><th scope="row"><span class="ae-grade-name" data-grade="${esc(record.id)}">${esc(record.name.value)}</span></th><td><span class="ae-gx-swatch" data-grade="${esc(record.id)}" aria-hidden="true"></span>${esc(record.label)}</td><td>${cap}</td></tr>`;
  }).join('');
  const caps = (grades.records ?? []).find(record => record.id === 'slot-caps');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeSlotsList', 'The slots', `<p>${esc(slots.lede)}</p><ul class="ae-gx-cards">${groups}</ul>${factsHtml(slots.facts)}`)}
    ${sectionHtml('aeGrades', 'Grades and enhance caps', `<p>Grades run from lowest to highest. The tile colour in game tells you the grade at a glance.</p>
      <div class="ae-gx-tablewrap"><table class="ae-gx-table"><thead><tr><th scope="col">Grade</th><th scope="col">Tile</th><th scope="col">Enhance cap</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${caps ? factsHtml([{ id: 'slot-caps', text: caps.text, status: 'confirmed' }]) : ''}`)}
    ${sectionHtml('aeUniqueFrom', `Unique gear starts at Lv ${uniqueFrom}`, factsHtml([{ id: 'unique-gear-level', text: progression.records.find(record => record.id === 'unique-gear-level')?.text ?? '', status: 'confirmed' }]) + `<p><a href="${esc(topicHref('equipment', 'enhancement'))}">What to enhance, and when</a></p>`)}`);
}

const TAB_ICONS = {
  growth: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  manastone: '<path d="M8 2l5 4-5 8-5-8z"/>',
  theostone: '<circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/>',
  'soul-binding': '<path d="M5 8a3 3 0 1 1 3 3M11 8a3 3 0 1 1-3-3"/>',
  transfer: '<path d="M2 6h10l-3-3M14 10H4l3 3"/>'
};
const tabIcon = id => `<svg class="ae-gx-tabicon" viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TAB_ICONS[id] ?? ''}</svg>`;

async function renderEnhancement(linked) {
  const body = shell('equipment', 'enhancement');
  const [enhancement, sources] = await Promise.all([loadEnhancement(), loadSources()]);
  const records = byId(enhancement);
  const ref = refFromUrl() ?? linked?.ref ?? null;
  const tabs = records.tabs.tabs.map(tab => `<li class="ae-gx-tab" data-tab="${esc(tab.id)}">${tabIcon(tab.id)}<strong>${esc(tab.name)}</strong><span>${esc(tab.purpose)}</span></li>`).join('');
  const logic = records.logic;
  const gates = logic.gates.map(gate => `<li class="ae-gx-gate" data-gate="${esc(gate.id)}"><strong>${esc(gate.question)}</strong>${gate.answer ? `<span>${esc(gate.answer)}</span>` : `<span><b>No:</b> ${esc(gate.no)}</span><span><b>Yes:</b> ${esc(gate.yes)}</span>`}</li>`).join('');
  const steps = logic.steps.map(step => `<li data-step-tab="${esc(step.tab)}"><strong>${esc(step.title)}</strong><span>${esc(step.text)}</span></li>`).join('');
  const stones = records['enhance-stone-sources'];
  const index = indexGearSources(sources);
  const cycleLine = id => {
    const cycle = index.cycles.get(id);
    return cycle ? `${esc(cycle.text)} ${statusTag(cycle.status)}` : '';
  };
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeTabs', 'The Enhancement window', `<p>The game's Enhancement window has five tabs, in this order.</p><ol class="ae-gx-tabs">${tabs}</ol>
      <p class="ae-gx-cta"><a class="ae-btn" href="${esc(enhanceTabUrl(ref))}" data-enhance-link>${ref ? 'Open your Enhance tab' : 'Open the Enhance tab on the Gear page'}</a></p>
      <p class="ae-gx-note">The Gear page's Enhance tab goes through your own gear piece by piece, with the next tab lit for each.</p>`)}
    ${sectionHtml('aeLogic', 'What to enhance, and when', `<p>${esc(logic.text)}</p><ol class="ae-gx-gates">${gates}</ol>`, statusTag(logic.status))}
    ${sectionHtml('aeSteps', 'The steps for each Unique piece', `<ol class="ae-gx-steps">${steps}</ol>${factsHtml(logic.exceptions.map(item => ({ id: 'own-scrolls', text: item.text, status: 'confirmed' })))}`)}
    ${sectionHtml('aeGrowth', 'Growth', factsHtml(records.growth.facts))}
    ${sectionHtml('aeBinding', 'Soul Binding', factsHtml(records['soul-binding'].facts) + (records['soul-binding'].codexSources ? `<p>Soul Codices come from: ${esc(records['soul-binding'].codexSources.list.join(', '))}. ${statusTag(records['soul-binding'].codexSources.status)}</p>` : ''))}
    ${sectionHtml('aeTransfer', 'Transfer', factsHtml(records.transfer.facts))}
    ${sectionHtml('aeStones', 'Where Enhance Stones come from', `<ul class="ae-gx-list">${stones.sources.map(item => `<li><strong>${esc(item.name)}</strong>${item.note ? `<span>${esc(item.note)}</span>` : ''}</li>`).join('')}</ul>
      <p>${cycleLine('daily-dungeon-weekly')}</p><p>${cycleLine('one-time')}</p>`, statusTag(stones.status))}`);
}

const ROLE_NAMES = { tank: 'Tank', dps: 'DPS', healer: 'Healer', support: 'Support' };
function rolesHtml(roles, render) {
  return `<ul class="ae-gx-cards">${Object.entries(roles ?? {}).map(([role, value]) => `<li class="ae-gx-card" data-role="${esc(role)}"><strong>${esc(ROLE_NAMES[role] ?? role)}</strong>${pendingText(value) ? `<span>${esc(pendingText(value))} ${statusTag('pending')}</span>` : `${render(value)} ${statusTag(value.status)}`}</li>`).join('')}</ul>`;
}

/** Content that gives a reward by name: "Deus Research Base (Transcendence): Manastones". */
function rewardSources(sources, names) {
  const out = [];
  for (const record of sources.records) {
    const list = record.kind === 'transcendence' ? record.other ?? [] : (record.rewards && Array.isArray(record.rewards) ? record.rewards.map(item => item.for && /Manastone|Soulstone/.test(item.for) ? `${item.name} (${item.for})` : item.name) : []);
    const hits = list.filter(name => names.some(word => name.includes(word)));
    if (hits.length) out.push({ name: record.name ?? record.label, hits, status: record.status });
  }
  return out;
}
const rewardList = rows => `<ul class="ae-gx-list">${rows.map(row => `<li><strong>${esc(row.name)}</strong><span>${esc(row.hits.join(', '))}</span> ${statusTag(row.status)}</li>`).join('')}</ul>`;

/* Manastones and Theostones in the Arcana page's language (design/aetherium-stones-pages, 23 Oct 2026). Slot counts and the
   Manastone icon come from the official character data; facts marked unknown and roles with no advice stay off the page. */
const known = facts => (facts ?? []).filter(item => !['pending', 'unknown'].includes(item.status));
const givenRoles = roles => Object.entries(roles ?? {}).filter(([, value]) => !pendingText(value) && !value?.pending);
const keyFacts = facts => (facts.length ? `<ul class="ae-pw-tips">${facts.map(item => `<li data-fact="${esc(item.id)}">${esc(item.text)}</li>`).join('')}</ul>` : '');
const whereRows = rows => `<ul class="ae-st-where">${rows.map(row => `<li><h3>${esc(row.name)}</h3><p class="ae-st-hits">${esc(row.hits.join(', '))}</p></li>`).join('')}</ul>`;

export function manastonesHtml(record, where, alchemy) {
  const slots = record.slots;
  const top = slots?.byGrade?.[0];
  const sockets = n => Array.from({ length: n }, () => `<span class="ae-st-socket"><img src="${esc(slots.icon)}" alt="" width="64" height="64" loading="lazy" decoding="async"></span>`).join('');
  const grades = (slots?.byGrade ?? []).map(row => `<li class="ae-st-row" data-grade="${esc(row.grade.toLowerCase())}">
      <div class="ae-st-row-head"><span class="ae-st-grade">${esc(row.grade)}</span><span class="ae-st-pieces">${esc(row.pieces)}</span></div>
      <div class="ae-st-sockets" aria-label="${esc(row.manastones)} Manastone slots${row.theostone ? ` and ${row.theostone} Theostone slot` : ''}">${sockets(row.manastones)}${row.theostone ? `<span class="ae-st-theo">+${esc(row.theostone)} Theostone</span>` : ''}</div>
      <b class="ae-st-count">${esc(row.manastones)}</b>
    </li>`).join('');
  const roles = givenRoles(record.roles).map(([role, value]) => `<li class="ae-st-role" data-role="${esc(role)}">
      <h3>${esc(ROLE_NAMES[role] ?? role)}<span class="ae-st-yours" data-mana-yours hidden>Your role</span></h3>
      <ol>${value.stones.map((stone, n) => `<li class="ae-st-pick" data-stone="${esc(stone.id ?? '')}">${stone.id ? `<a class="ae-st-open" href="#mana-${esc(stone.id)}" data-mana-open="${esc(stone.id)}" aria-haspopup="dialog" aria-label="${esc(`${stone.name} Manastone, see the details`)}">` : '<span class="ae-st-open">'}<span class="ae-st-rank">${n + 1}</span><span class="ae-st-stone">${esc(stone.name)}</span><span class="ae-st-top">top ${esc(stone.top)}</span>${stone.id ? '</a>' : '</span>'}</li>`).join('')}</ol>
      ${value.note ? `<p class="ae-st-note">${esc(value.note)}</p>` : ''}
    </li>`).join('');
  return `${top ? `<ul class="ae-arc-stats" aria-label="Manastones at a glance">${slots.byGrade.map(row => `<li><b>${esc(row.manastones)}</b><span>Slots on ${esc(row.grade)}</span></li>`).join('')}</ul>` : ''}
    ${slots ? `<section class="ae-gx-block ae-arc-block" id="aeManaSlots" aria-labelledby="aeManaSlotsTitle">
      <h2 class="ae-gx-h2" id="aeManaSlotsTitle">Slots by grade</h2>
      <p class="ae-arc-sub">The better the piece, the more stones it holds. ${esc(slots.none)}</p>
      <ol class="ae-st-rows">${grades}</ol>
    </section>` : ''}
    <section class="ae-gx-block ae-arc-block" id="aeManaFacts" aria-labelledby="aeManaFactsTitle">
      <h2 class="ae-gx-h2" id="aeManaFactsTitle">How engraving works</h2>
      ${keyFacts(known(record.facts))}
      <p class="ae-arc-note">${esc(record.accessories.text)}</p>
    </section>
    ${roles ? `<section class="ae-gx-block ae-arc-block" id="aeManaRoles" aria-labelledby="aeManaRolesTitle">
      <h2 class="ae-gx-h2" id="aeManaRolesTitle">Best stones by role</h2>
      <p class="ae-arc-sub">In this order. The number is the best roll the stat reaches. Tap a stone for its card.</p>
      <ul class="ae-st-roles">${roles}</ul>
    </section>` : ''}
    <section class="ae-gx-block ae-arc-block" id="aeManaWhere" aria-labelledby="aeManaWhereTitle">
      <h2 class="ae-gx-h2" id="aeManaWhereTitle">Where they come from</h2>
      ${whereRows(where)}
      ${alchemy ? `<p class="ae-arc-note">Alchemy makes them too: ${esc(alchemy.makes)}. <a href="${esc(topicHref('crafting', 'professions'))}">The five professions</a></p>` : ''}
    </section>`;
}

/** How well a Manastone suits a role, from the role order in the data: the first two are the pick, the next two come
 *  after. Null when the data has no order for the role (healer and support today), so the card says nothing. */
export function manaFit(record, role, stoneId) {
  const rules = record.fit?.roles?.[role];
  if (!rules) return null;
  const level = rules.best.includes(stoneId) ? 'best' : rules.close.includes(stoneId) ? 'close' : 'other';
  return { level, why: rules.why[level], label: FIT_LABEL[level] };
}

/** The detail card for one Manastone: its best roll, where each role ranks it, and, with a Daeva linked, whether it suits
 *  the build that Daeva plays and why. */
export function manaDetailHtml(record, stoneId, who = null) {
  const ranked = givenRoles(record.roles).flatMap(([role, value]) => value.stones.map((stone, n) => ({ role, stone, n, of: value.stones.length, note: value.note })));
  const hits = ranked.filter(row => row.stone.id === stoneId);
  const stone = hits[0]?.stone;
  if (!stone) return '';
  const rolls = stone.names?.length > 1 ? `Rolls as ${stone.names.slice(0, -1).join(', ')} or ${stone.names[stone.names.length - 1]}. ` : '';
  const ranks = hits.map(row => `<li data-role="${esc(row.role)}"><span>${esc(ROLE_NAMES[row.role] ?? row.role)}</span><b>${esc(row.n + 1)}</b><em>of ${esc(row.of)}</em></li>`).join('');
  const slots = (record.slots?.byGrade ?? []).map(row => `${row.grade} ${row.manastones}`).join(', ');
  const notes = [...new Set(hits.map(row => row.note).filter(Boolean))];
  const fit = who?.role ? manaFit(record, who.role, stoneId) : null;
  return `<div class="ae-th-detail ae-md-detail" data-grade="unique">
      <header><img src="${esc(record.slots?.icon ?? '')}" alt="" width="96" height="96">
        <div><p class="ae-th-kind">Manastone</p><h2 id="aeManaDetailTitle">${esc(stone.name)}</h2></div>
        <button type="button" class="ae-btn ae-th-close" data-detail-close aria-label="Close">Close</button></header>
      <p class="ae-th-what">${esc(rolls)}Best roll ${esc(stone.top)}.</p>
      <ol class="ae-th-ladder ae-md-ranks" aria-label="Where each role ranks it">${ranks}</ol>
      <ul class="ae-th-facts">${slots ? `<li><span>Slots per piece</span><b>${esc(slots)}</b></li>` : ''}<li><span>Engrave on</span><b>Weapons and armour</b></li></ul>
      ${notes.map(note => `<p class="ae-th-rule">${esc(note)}</p>`).join('')}
      ${verdictHtml(fit, who, 'stone')}
    </div>`;
}

async function renderManastones(linked) {
  const body = shell('equipment', 'manastones');
  const [enhancement, sources, text] = await Promise.all([loadEnhancement(), loadSources(), loadGuideText()]);
  const alchemy = byId(text).professions.professions.find(item => item.id === 'alchemy');
  const record = byId(enhancement).manastone;
  body.insertAdjacentHTML('beforeend', manastonesHtml(record, rewardSources(sources, ['Manastone', 'Soulstone']), alchemy));
  const who = await daevaWho(linked);
  /* With a Daeva linked, its role's list is marked and the stones that suit it carry the tag. */
  if (who?.role && record.fit?.roles?.[who.role]) {
    const column = body.querySelector(`.ae-st-role[data-role="${who.role}"]`);
    if (column) { column.dataset.yours = 'true'; column.querySelector('[data-mana-yours]').hidden = false; }
    for (const pick of body.querySelectorAll('.ae-st-role[data-yours] .ae-st-pick')) {
      const fit = manaFit(record, who.role, pick.dataset.stone);
      if (fit && fit.level !== 'other') pick.dataset.fit = fit.level;
    }
  }
  detailDialog(body, {
    id: 'aeManaDetail', title: 'aeManaDetailTitle', open: '[data-mana-open]', prefix: 'mana',
    key: open => open.dataset.manaOpen,
    render: open => manaDetailHtml(record, open.dataset.manaOpen, who),
    deep: /^#mana-([a-z-]+)$/, find: match => `[data-mana-open="${match[1]}"]`
  });
}

/* ----- The shared detail card (design/aetherium-theostone-cards, then Manastones and Arcana, 24 Oct 2026) ----- */

const FIT_LABEL = { best: 'Suits your build', close: 'Close fit', other: 'Not the pick for your build' };

/** The verdict box at the foot of every detail card. No Daeva: an offer to link one. A Daeva but no advice in the data for
 *  its role: nothing at all, never a guess. */
function verdictHtml(fit, who, thing) {
  if (!who) return `<div class="ae-th-verdict"><p>Link your Daeva to see if this ${esc(thing)} suits the build you play.</p><a class="ae-gd-btn is-gold" href="/hub/aetherium/#aeSearch">Find your Daeva</a></div>`;
  if (!fit) return '';
  return `<div class="ae-th-verdict" data-fit="${esc(fit.level)}"><span class="ae-th-verdict-tag">${esc(fit.label)}</span>
        <p><b>${esc(who.name)}</b>, ${esc(who.className)} ${esc(ROLE_NAMES[who.role] ?? who.role)}${who.buildLabel ? ` (${esc(who.buildLabel)})` : ''}</p><p>${esc(fit.why)}</p></div>`;
}

/**
 * One dialog per page for its detail cards: opened from any item that matches `open`, closed with its button, Escape or a
 * click outside, focus back on the item. Each card has its own address (#<prefix>-<key>), and a page opened at one opens
 * that card.
 */
function detailDialog(body, { id, title, open: selector, prefix, key, render, deep, find }) {
  body.insertAdjacentHTML('beforeend', `<dialog class="ae-th-dialog" id="${id}" aria-labelledby="${title}"></dialog>`);
  const dialog = body.querySelector(`#${id}`);
  let opener = null;
  body.addEventListener('click', event => {
    const open = event.target.closest(selector);
    if (open) {
      const html = render(open);
      if (!html) return;
      event.preventDefault();
      opener = open;
      dialog.innerHTML = html;
      dialog.showModal();
      history.replaceState(null, '', `${location.pathname}${location.search}#${prefix}-${key(open)}`);
      dialog.querySelector('[data-detail-close]')?.focus();
      return;
    }
    if (event.target.closest('[data-detail-close]') || event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => { opener?.focus(); if (location.hash.startsWith(`#${prefix}-`)) history.replaceState(null, '', location.pathname + location.search); });
  const match = deep.exec(location.hash);
  if (match) body.querySelector(find(match))?.click();
  return dialog;
}

const THEO_ART = '/astrix-app/pages/aetherium/images/theostones/';
const fmt = value => Number(value).toLocaleString('en-GB');
/** One Theostone card for one grade: the game's icon, the effect, its size, its chance and, for damage, the average per hit. */
function theoCard(effect, grade, group) {
  const g = grade.toLowerCase();
  const chance = effect.chance[grade];
  const big = effect.duration ? `${effect.duration[grade]}s` : fmt(effect.damage[grade]);
  const unit = effect.duration ? 'lasts' : effect.every ? `every ${effect.every}s for ${effect.lasts}s` : group.targets ? `damage to up to ${group.targets} targets` : 'damage';
  const average = effect.damage && !effect.every ? Math.round(effect.damage[grade] * chance / 100) : null;
  return `<li class="ae-th-card" data-grade="${esc(g)}" data-effect="${esc(effect.id)}">
      <a class="ae-th-open" href="#theo-${esc(g)}-${esc(effect.id)}" data-theo-open="${esc(effect.id)}" data-theo-at="${esc(g)}" aria-haspopup="dialog" aria-label="${esc(`${grade} ${effect.label} Theostone, see the details`)}">
      <img src="${THEO_ART}${esc(g)}-${esc(effect.id)}.jpg" alt="" width="120" height="120" loading="lazy" decoding="async">
      <span class="ae-th-text"><span class="ae-th-name">${esc(effect.label)}</span>
        <span class="ae-th-big"><b>${esc(big)}</b> <span>${esc(unit)}</span></span>
        <span class="ae-th-chance">${esc(chance)}% chance on attack${average ? ` <em>${esc(fmt(average))} ${group.targets ? 'a target' : 'a hit'} on average</em>` : ''}</span></span>
      <span class="ae-th-fit" data-theo-fit hidden></span>
      </a>
    </li>`;
}

/** How well a Theostone suits a role, from the role advice in the data: best, close, or other. Null when the data has no
 *  advice for the role, so the card says nothing rather than guess. */
export function theoFit(record, role, effectId, groupId) {
  const rules = record.fit?.roles?.[role];
  if (!rules) return null;
  const level = rules.best.includes(effectId) ? 'best' : rules.close.includes(effectId) ? 'close' : 'other';
  const why = level === 'best' && role === 'dps' ? (groupId === 'area' ? rules.why.bestArea : rules.why.bestSingle) ?? rules.why.best : rules.why[level];
  return { level, why, label: FIT_LABEL[level] };
}

/** The detail card for one Theostone: the stone at every grade, what it does, and, with a Daeva linked, whether it suits
 *  the build that Daeva plays and why. */
export function theoDetailHtml(record, effectId, gradeId, who = null) {
  const cat = record.catalogue;
  const group = cat.groups.find(item => item.effects.some(effect => effect.id === effectId));
  const effect = group.effects.find(item => item.id === effectId);
  const grade = cat.grades.find(item => item.toLowerCase() === gradeId) ?? cat.grades[cat.grades.length - 1];
  const size = g => (effect.duration ? `${effect.duration[g]}s` : fmt(effect.damage[g]));
  const average = g => (effect.damage && !effect.every ? Math.round(effect.damage[g] * effect.chance[g] / 100) : null);
  const what = effect.duration ? `Inflicts ${effect.label} for ${effect.duration[grade]}s` : effect.every ? `${fmt(effect.damage[grade])} ${effect.label} damage every ${effect.every}s for ${effect.lasts}s` : `${fmt(effect.damage[grade])} ${effect.label} damage${group.targets ? ` to up to ${group.targets} targets` : ' to one target'}`;
  const ladder = cat.grades.map(g => `<li data-grade="${esc(g.toLowerCase())}"${g === grade ? ' aria-current="true"' : ''}><span>${esc(g)}</span><b>${esc(size(g))}</b>${average(g) ? `<em>${esc(fmt(average(g)))} avg</em>` : ''}</li>`).join('');
  const fit = who?.role ? theoFit(record, who.role, effect.id, group.id) : null;
  return `<div class="ae-th-detail" data-grade="${esc(grade.toLowerCase())}">
      <header><img src="${THEO_ART}${esc(grade.toLowerCase())}-${esc(effect.id)}.jpg" alt="" width="120" height="120">
        <div><p class="ae-th-kind">${esc(grade)} Theostone, ${esc(group.label)}</p><h2 id="aeTheoDetailTitle">${esc(effect.label)}</h2></div>
        <button type="button" class="ae-btn ae-th-close" data-detail-close aria-label="Close">Close</button></header>
      <p class="ae-th-what">${esc(what)}, ${esc(effect.chance[grade])}% chance on attack.</p>
      <ol class="ae-th-ladder" aria-label="At each grade">${ladder}</ol>
      <ul class="ae-th-facts"><li><span>Cooldown</span><b>${esc(effect.cooldown)}s</b></li><li><span>Engrave on</span><b>${esc(cat.engravable)}</b></li>${average(grade) ? `<li><span>Average</span><b>${esc(fmt(average(grade)))} ${group.targets ? 'a target' : 'a hit'}</b></li>` : ''}</ul>
      <p class="ae-th-rule">${esc(cat.rule)}</p>
      ${verdictHtml(fit, who, 'stone')}
    </div>`;
}

export function theostonesHtml(record, where) {
  const odds = record.combineOdds ?? [];
  const cat = record.catalogue;
  const grades = cat?.grades ?? [];
  const top = grades[grades.length - 1];
  const chain = odds.length ? [odds[0].from, ...odds.map(step => step.to)] : [];
  const combine = chain.map((grade, n) => `<li class="ae-st-gem" data-grade="${esc(grade.toLowerCase())}"><span>${esc(grade)}</span></li>${odds[n] ? `<li class="ae-st-odds" aria-label="${esc(odds[n].chance)}% chance"><b>${esc(odds[n].chance)}%</b></li>` : ''}`).join('');
  const roles = givenRoles(record.roles).map(([role, value]) => `<li class="ae-st-role" data-role="${esc(role)}"><h3>${esc(ROLE_NAMES[role] ?? role)}</h3><p class="ae-st-note">${esc(value.text)}</p></li>`).join('');
  const facts = known(record.facts).filter(item => item.id !== 'combine-chance');
  const effects = (cat?.groups ?? []).flatMap(group => group.effects);
  /* How much harder each grade hits than the one below, from the single target stones. */
  const single = cat?.groups.find(group => group.id === 'single')?.effects[0];
  const step = single ? grades.slice(1).map((grade, n) => single.damage[grade] / single.damage[grades[n]]) : [];
  const stepText = n => (n === 2 ? 'double' : n === 1.5 ? 'half as much again' : `${n.toFixed(2)} times`);
  const groups = (cat?.groups ?? []).map(group => {
    const hits = group.effects.filter(effect => effect.damage && !effect.every);
    const same = hits.length > 1 && grades.every(grade => new Set(hits.map(effect => Math.round(effect.damage[grade] * effect.chance[grade] / 100))).size === 1);
    return `<section class="ae-gx-block ae-arc-block ae-th-group" id="aeTheo-${esc(group.id)}" aria-labelledby="aeTheo-${esc(group.id)}Title">
      <h2 class="ae-gx-h2" id="aeTheo-${esc(group.id)}Title">${esc(group.label)}</h2>
      <p class="ae-arc-sub">${esc(group.text)} Cooldown ${esc(group.effects[0].cooldown)}s.${same ? ' Every stone here averages the same damage, so pick rare big hits for a boss or small frequent ones for steady damage.' : ''}</p>
      <ul class="ae-th-cards">${group.effects.map(effect => grades.map(grade => theoCard(effect, grade, group)).join('')).join('')}</ul>
    </section>`;
  }).join('');
  return `<ul class="ae-arc-stats" aria-label="Theostones at a glance">
      ${cat ? `<li><b>${esc(effects.length)}</b><span>Effects</span></li><li><b>${esc(grades.length)}</b><span>Grades</span></li>` : ''}
      <li><b>1</b><span>Per slot</span></li>
    </ul>
    ${cat ? `<div class="ae-th-pick" role="group" aria-label="Grade">
      ${grades.map(grade => `<button type="button" class="ae-btn" data-theo-grade="${esc(grade.toLowerCase())}" aria-pressed="${grade === top}">${esc(grade)}</button>`).join('')}
    </div>` : ''}
    <div class="ae-th" data-theo-show="${esc((top ?? '').toLowerCase())}">${groups}</div>
    ${combine ? `<section class="ae-gx-block ae-arc-block" id="aeTheoCombine" aria-labelledby="aeTheoCombineTitle">
      <h2 class="ae-gx-h2" id="aeTheoCombineTitle">Combine raises the grade</h2>
      <p class="ae-arc-sub">Each step up is a low chance, so most tries stay the same grade.${step.length === 2 ? ` It pays: ${esc(grades[1])} hits ${esc(stepText(step[0]))} ${esc(grades[0])}, and ${esc(grades[2])} adds ${esc(stepText(step[1]))}. Crowd control lasts 1s longer each grade.` : ''}</p>
      <ol class="ae-st-combine">${combine}</ol>
    </section>` : ''}
    <section class="ae-gx-block ae-arc-block" id="aeTheoFacts" aria-labelledby="aeTheoFactsTitle">
      <h2 class="ae-gx-h2" id="aeTheoFactsTitle">How Theostones work</h2>
      ${record.slots ? `<p class="ae-arc-sub">${esc(record.slots.text)}</p>` : ''}
      ${keyFacts([...facts, ...(cat ? [{ id: 'identical', text: cat.rule }] : [])])}
    </section>
    ${roles ? `<section class="ae-gx-block ae-arc-block" id="aeTheoRoles" aria-labelledby="aeTheoRolesTitle">
      <h2 class="ae-gx-h2" id="aeTheoRolesTitle">Which one for your role</h2>
      <ul class="ae-st-roles">${roles}</ul>
    </section>` : ''}
    <section class="ae-gx-block ae-arc-block" id="aeTheoWhere" aria-labelledby="aeTheoWhereTitle">
      <h2 class="ae-gx-h2" id="aeTheoWhereTitle">Where they come from</h2>
      ${whereRows(where)}
    </section>`;
}

/** The linked Daeva as the detail cards judge it: name, class and the role it plays (the picked role, else the class's
 *  main build). From the saved roster entry and the class's build file, so it needs no call to the official site. */
async function daevaWho(linked) {
  const entry = linked?.entry;
  if (!entry?.className) return null;
  const builds = await loadBuilds(entry.className).catch(() => null);
  const picked = rolePick(linked.ref).role;
  const build = builds ? buildFor(builds, { role: picked }) : null;
  return { name: entry.name, className: entry.className, role: picked ?? build?.role ?? null, buildLabel: build?.label ?? null };
}

async function renderTheostones(linked) {
  const body = shell('equipment', 'theostones');
  const [enhancement, sources] = await Promise.all([loadEnhancement(), loadSources()]);
  const record = byId(enhancement).theostone;
  body.insertAdjacentHTML('beforeend', theostonesHtml(record, rewardSources(sources, ['Theostone'])));
  const who = await daevaWho(linked);
  /* With a Daeva linked, every card says how it fits that Daeva's build. */
  if (who?.role && record.fit?.roles?.[who.role]) {
    for (const card of body.querySelectorAll('.ae-th-card')) {
      const group = card.closest('.ae-th-group')?.id.replace('aeTheo-', '');
      const fit = theoFit(record, who.role, card.dataset.effect, group);
      const tag = card.querySelector('[data-theo-fit]');
      if (fit && tag && fit.level !== 'other') { tag.textContent = fit.label; tag.dataset.fit = fit.level; tag.hidden = false; card.dataset.fit = fit.level; }
    }
  }
  detailDialog(body, {
    id: 'aeTheoDetail', title: 'aeTheoDetailTitle', open: '[data-theo-open]', prefix: 'theo',
    key: open => `${open.dataset.theoAt}-${open.dataset.theoOpen}`,
    render: open => theoDetailHtml(record, open.dataset.theoOpen, open.dataset.theoAt, who),
    deep: /^#theo-(rare|epic|unique)-([a-z-]+)$/, find: match => `[data-theo-open="${match[2]}"][data-theo-at="${match[1]}"]`
  });
  const show = body.querySelector('.ae-th');
  body.querySelector('.ae-th-pick')?.addEventListener('click', event => {
    const button = event.target.closest('[data-theo-grade]');
    if (!button || !show) return;
    show.dataset.theoShow = button.dataset.theoGrade;
    for (const other of body.querySelectorAll('[data-theo-grade]')) other.setAttribute('aria-pressed', String(other === button));
  });
}

/* Arcana art cut from Miguel's own screens of the Arcana window (design/aetherium-arcana-page, 22 Oct 2026). */
const ARCANA_ART = '/astrix-app/pages/aetherium/images/arcana/';
const arcArt = (file, alt, width, height, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${ARCANA_ART}${file}" alt="${esc(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async">`;
const medallion = (id, alt = '') => arcArt(`${id}.webp`, alt, 260, 260, 'ae-arc-med-img');
const cardBack = (alt = '') => arcArt('card-back.jpg', alt, 273, 410);
const unique = (alt = '') => arcArt('chalice-of-vigor.jpg', alt, 280, 418);
const gradeId = grade => grade.toLowerCase();
const top = list => list[list.length - 1];
const pips = (on, alt) => `<span class="ae-arc-pips" role="img" aria-label="${esc(alt)}">${[0, 1, 2, 3].map(n => `<span class="ae-arc-pip${n < on ? ' is-on' : ''}" aria-hidden="true">${cardBack()}</span>`).join('')}</span>`;

/** Arcana as the game shows it: the five card medallions, the grade climb on real card backs, the two set lines with their
 *  art, where they drop with each dungeon's three cards and the stage track, then Extract and Transmute as pictures. */
export function arcanaHtml(record, index, arcWindow = null) {
  const slotName = id => record.slots.find(slot => slot.id === id)?.name ?? id;
  const where = id => index.byId.get(id)?.name ?? id;
  const both = slot => slot.from.length > 1;
  const cards = record.slots.map(slot => `<li class="ae-arc-card${both(slot) ? ' is-both' : ''}" data-arcana-slot="${esc(slot.id)}">
      <a class="ae-arc-open" href="#arcana-${esc(slot.id)}" data-arc-open="${esc(slot.id)}" aria-haspopup="dialog" aria-label="${esc(`${slot.name} Arcana, see the details`)}">
      <span class="ae-arc-disc">${medallion(slot.id, `${slot.name} card symbol`)}</span>
      <h3>${esc(slot.name)}</h3>
      <span class="ae-arc-kind">${esc(slot.skills)}</span>
      <p class="ae-arc-from">${both(slot) ? `Both dungeons. ${esc(slot.note ?? '')}` : esc(slot.from.map(where).join(', '))}</p>
      </a>
    </li>`).join('');
  const last = record.grades.length - 1;
  const climb = record.grades.map((entry, n) => `<li class="ae-arc-grade" data-grade="${esc(gradeId(entry.grade))}" style="--ae-arc-step:${n}">
      <span class="ae-arc-frame">${n === last ? unique(`A ${entry.grade} card, Chalice of Vigor`) : cardBack(`A ${entry.grade} card`)}</span>
      <b class="ae-arc-num">+${esc(entry.itemLevel)}</b><span class="ae-arc-unit">item level</span>
      <span class="ae-arc-gname">${esc(entry.grade)}</span>
    </li>`).join('');
  const lines = record.lines.map(line => `<li class="ae-arc-set" data-arcana-line="${esc(line.id)}">
      <div class="ae-arc-set-art" style="--ae-arc-art:url('${ARCANA_ART}${esc(line.id)}.jpg')"><h3>${esc(line.name)}</h3></div>
      <p class="ae-arc-tier">${pips(2, `2 of 4 ${line.name} cards`)}<span><b>2 cards</b> ${esc(line.set2)}</span></p>
      <p class="ae-arc-tier">${pips(4, `4 of 4 ${line.name} cards`)}<span><b>4 cards</b> ${esc(line.set4)}</span></p>
    </li>`).join('');
  const dungeons = index.transcendence;
  const places = dungeons.map(dungeon => `<li class="ae-arc-place" data-transcendence="${esc(dungeon.id)}">
      <h3>${esc(dungeon.name)}</h3>
      <span class="ae-arc-trio">${dungeon.arcana.map(id => medallion(id, slotName(id))).join('')}</span>
      <p class="ae-arc-from">${esc(dungeon.arcana.map(slotName).join(', '))}</p>
    </li>`).join('');
  /* The stages are the same in both dungeons; draw them once, from the first, and say so only if they ever differ. */
  const same = dungeons.every(dungeon => JSON.stringify(dungeon.stages) === JSON.stringify(dungeons[0]?.stages));
  const stageList = (dungeons[0]?.stages ?? []).map(stage => `<li class="ae-arc-stage${stage.guaranteed ? ' is-top' : ''}">
      <span class="ae-arc-stage-n">${esc(stage.stage)}</span>
      <b>Item level ${esc(number(stage.entryItemLevel))}+</b>
      <span class="ae-arc-up" data-grade="${esc(gradeId(top(stage.arcanaGrades)))}">${stage.guaranteed ? esc(stage.guaranteed.replace(/ Arcana$/, '')) + ' guaranteed' : `Up to ${esc(top(stage.arcanaGrades))}`}</span>
    </li>`).join('');
  const weekly = index.cycles.get('transcendence-weekly');
  const loop = arcWindow ? `<section class="ae-gx-block ae-arc-block" id="aeArcLoop" aria-labelledby="aeArcLoopTitle">
      <h2 class="ae-gx-h2" id="aeArcLoopTitle">Spare cards become crystals</h2>
      <p class="ae-arc-sub">Nothing you pull is wasted. Cards you do not need become the crystal that reworks the ones you keep.</p>
      <ol class="ae-arc-loop">
        <li>${cardBack('A spare Arcana card')}<h3>Extract</h3><p>${esc(arcWindow.extract.text)}</p></li>
        <li class="ae-arc-arrow" aria-hidden="true"></li>
        <li>${arcArt('mysterious-crystal.webp', arcWindow.extract.item, 484, 533)}<h3>${esc(arcWindow.extract.item.replace(/ \(Bound\)$/, ''))}</h3><p>It is Bound to you, so it cannot be traded.</p></li>
        <li class="ae-arc-arrow" aria-hidden="true"></li>
        <li class="is-glow">${unique('Chalice of Vigor, a Unique card')}<h3>Transmute</h3><p>${esc(arcWindow.transmute.text)}</p>
          <span class="ae-arc-cost">${arcArt('mysterious-crystal-icon.jpg', '', 128, 128)}${esc(arcWindow.transmute.cost.count)} crystals</span></li>
      </ol>
    </section>` : factsHtml([{ id: 'transmute', text: record.transmute.text, status: record.transmute.status }]);
  return `<ul class="ae-arc-stats" aria-label="Arcana at a glance">
      <li><b>${esc(record.slots.length)}</b><span>Card slots</span></li>
      <li><b>+${esc(record.grades[last].itemLevel)}</b><span>Item level at ${esc(record.grades[last].grade)}</span></li>
      <li><b>${esc(record.lines.length)}</b><span>Set lines</span></li>
    </ul>
    <section class="ae-gx-block ae-arc-block" id="aeArcSlots" aria-labelledby="aeArcSlotsTitle">
      <h2 class="ae-gx-h2" id="aeArcSlotsTitle">The five cards</h2>
      <p class="ae-arc-sub">One of each goes in your five slots. The symbol on the card back tells you which slot it fills. Tap a card for where it drops and what each grade adds.</p>
      <ul class="ae-arc-cards">${cards}</ul>
    </section>
    <section class="ae-gx-block ae-arc-block" id="aeArcGrades" aria-labelledby="aeArcGradesTitle">
      <h2 class="ae-gx-h2" id="aeArcGradesTitle">Grade sets the item level</h2>
      <p class="ae-arc-sub">The frame colour is the grade. A ${esc(record.grades[last].grade)} card adds ${esc(record.grades[last].itemLevel / record.grades[0].itemLevel)} times what a ${esc(record.grades[0].grade)} one does.</p>
      <ol class="ae-arc-climb">${climb}</ol>
    </section>
    <section class="ae-gx-block ae-arc-block" id="aeArcLines" aria-labelledby="aeArcLinesTitle">
      <h2 class="ae-gx-h2" id="aeArcLinesTitle">Build a set</h2>
      <p class="ae-arc-sub">Every card belongs to one of two lines. Two or four cards from the same line add its bonus.</p>
      <ul class="ae-arc-sets">${lines}</ul>
    </section>
    <section class="ae-gx-block ae-arc-block" id="aeArcWhere" aria-labelledby="aeArcWhereTitle">
      <h2 class="ae-gx-h2" id="aeArcWhereTitle">Where they drop</h2>
      <p class="ae-arc-sub">Both Transcendence dungeons drop Arcana. Each one has its own three cards.</p>
      <div class="ae-arc-drops">
        <figure class="ae-arc-art">${arcArt('transcendence.jpg', 'A Transcendence boss in heavy armour', 307, 224)}<figcaption>Transcendence</figcaption></figure>
        <div>
          <ul class="ae-arc-places">${places}</ul>
          ${same ? `<ol class="ae-arc-stages" aria-label="Stages, the same in both dungeons">${stageList}</ol>` : ''}
          <p class="ae-arc-note">${esc(dungeons[0]?.stagesNote ?? '')} ${esc(weekly?.text ?? '')}</p>
        </div>
      </div>
    </section>
    ${loop}`;
}

/** The detail card for one Arcana slot: where it drops, what each grade adds, the first Stage that can drop the top grade
 *  and the set lines. The data holds no Arcana advice for a role or class, so this card gives no build verdict. */
export function arcanaDetailHtml(record, index, slotId) {
  const slot = record.slots.find(item => item.id === slotId);
  if (!slot) return '';
  const last = record.grades[record.grades.length - 1];
  const dungeons = index.transcendence.filter(dungeon => slot.from.includes(dungeon.id));
  const where = dungeons.map(dungeon => dungeon.name);
  const firstTop = dungeons.map(dungeon => (dungeon.stages ?? []).find(stage => (stage.arcanaGrades ?? []).includes(last.grade))).filter(Boolean)
    .sort((a, b) => a.stage - b.stage)[0];
  const ladder = record.grades.map(entry => `<li data-grade="${esc(gradeId(entry.grade))}"${entry === last ? ' aria-current="true"' : ''}><span>${esc(entry.grade)}</span><b>+${esc(entry.itemLevel)}</b><em>item level</em></li>`).join('');
  const lines = record.lines.map(line => `<li><span>${esc(line.name)}</span><b>2: ${esc(line.set2)}</b><b>4: ${esc(line.set4)}</b></li>`).join('');
  return `<div class="ae-th-detail ae-ad-detail" data-grade="${esc(gradeId(last.grade))}">
      <header>${medallion(slot.id)}
        <div><p class="ae-th-kind">Arcana, ${esc(slot.skills.toLowerCase())} skills</p><h2 id="aeArcDetailTitle">${esc(slot.name)}</h2></div>
        <button type="button" class="ae-btn ae-th-close" data-detail-close aria-label="Close">Close</button></header>
      <p class="ae-th-what">Drops in ${esc(where.length > 1 ? `both ${where.join(' and ')}` : where[0] ?? 'Transcendence')}.${slot.note ? ` ${esc(slot.note)}` : ''}</p>
      <ol class="ae-th-ladder ae-ad-ladder" aria-label="Item level at each grade">${ladder}</ol>
      <ul class="ae-th-facts">${firstTop ? `<li><span>${esc(last.grade)} from</span><b>Stage ${esc(firstTop.stage)}, item level ${esc(number(firstTop.entryItemLevel))}+</b></li>` : ''}<li><span>Slot</span><b>${esc(slot.name)}, one of five</b></li></ul>
      <p class="ae-th-rule">Every card belongs to one of two lines. Two or four from the same line add its bonus.</p>
      <ul class="ae-ad-lines">${lines}</ul>
    </div>`;
}

async function renderArcana() {
  const body = shell('equipment', 'arcana');
  const [sources, text] = await Promise.all([loadSources(), loadGuideText()]);
  const index = indexGearSources(sources);
  const record = index.byId.get('arcana-grades');
  body.insertAdjacentHTML('beforeend', arcanaHtml(record, index, byId(text)['arcana-window'] ?? null));
  detailDialog(body, {
    id: 'aeArcDetail', title: 'aeArcDetailTitle', open: '[data-arc-open]', prefix: 'arcana',
    key: open => open.dataset.arcOpen,
    render: open => arcanaDetailHtml(record, index, open.dataset.arcOpen),
    deep: /^#arcana-([a-z-]+)$/, find: match => `[data-arc-open="${match[1]}"]`
  });
}

/* Pets and wings art cut from Miguel's own Pets and Wings windows (design/aetherium-pets-wings-page, 22 Oct 2026). */
const PW_ART = '/astrix-app/pages/aetherium/images/pets-wings/';
const pwArt = (file, alt, width, height, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${PW_ART}${file}" alt="${esc(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async">`;
const PET_SHOTS = 14;
const WING_SHOTS = [['superior', 'Superior Daeva Wings'], ['lesser', 'Lesser Daeva Wings'], ['intermediate', 'Intermediate Daeva Wings'], ['aullaeu', 'Aullaeu Wings']];
const shown = facts => (facts ?? []).filter(item => item.status !== 'pending');

/** Pets and wings as the game shows them: a wall of real pet portraits, the souls climb, the four genera sized by how many
 *  pets each holds, then the wing collection, one wing's two effects, and where wings come from. */
export function petsWingsHtml(pets, wings) {
  const facts = id => shown(pets.facts).find(item => item.id === id);
  const wall = Array.from({ length: PET_SHOTS }, (_, n) => `<li>${pwArt(`pet-${String(n + 1).padStart(2, '0')}.jpg`, '', 135, 115)}</li>`).join('');
  const souls = pets.souls?.levels ?? [];
  const climb = souls.map((step, n) => `<li class="ae-pw-lv" style="--ae-pw-step:${n}">
      <span class="ae-pw-lv-art">${pwArt('pet-01.jpg', `A pet at level ${step.level}`, 135, 115)}</span>
      <b class="ae-pw-num">${esc(step.souls)}</b><span class="ae-pw-unit">souls in all</span><span class="ae-pw-lv-name">Level ${esc(step.level)}</span>
    </li>`).join('');
  const most = Math.max(...pets.genera.map(genus => genus.pets));
  const genera = pets.genera.map(genus => `<li class="ae-pw-genus" data-genus="${esc(genus.name.toLowerCase())}">
      <h3>${esc(genus.name)}</h3>
      <span class="ae-pw-bar" style="--ae-pw-fill:${(genus.pets / most).toFixed(3)}"><b>${esc(genus.pets)}</b> pets</span>
      <p>${esc(genus.perPet)}</p>
    </li>`).join('');
  const tips = ['source-tab', 'insight', 'growth-chest', 'special'].map(facts).filter(Boolean).map(item => `<li data-fact="${esc(item.id)}">${esc(item.text)}</li>`).join('');
  const shared = facts('shared');
  const ex = wings.example;
  const wingRow = WING_SHOTS.map(([id, name]) => `<li>${pwArt(`wing-${id}.jpg`, name, 92, 92)}<span>${esc(name)}</span></li>`).join('');
  const wingFacts = shown(wings.facts).filter(item => item.id !== 'collection').map(item => `<li data-fact="${esc(item.id)}">${esc(item.text)}</li>`).join('');
  return `<ul class="ae-arc-stats" aria-label="Pets and wings at a glance">
      <li><b>${esc(pets.collection?.total ?? '')}</b><span>Monster pets</span></li>
      <li><b>${esc(pets.genera.length)}</b><span>Genera</span></li>
      <li><b>${esc(souls.length)}</b><span>Pet levels</span></li>
    </ul>
    <section class="ae-gx-block ae-arc-block" id="aePets" aria-labelledby="aePetsTitle">
      <h2 class="ae-gx-h2" id="aePetsTitle">Collect them all</h2>
      <p class="ae-arc-sub">${esc(pets.lede)}${shared ? ` ${esc(shared.text)}` : ''}</p>
      <ul class="ae-pw-wall" aria-label="Some of the pets you can collect">${wall}</ul>
    </section>
    ${souls.length ? `<section class="ae-gx-block ae-arc-block" id="aePetSouls" aria-labelledby="aePetSoulsTitle">
      <h2 class="ae-gx-h2" id="aePetSoulsTitle">Souls raise a pet</h2>
      <p class="ae-arc-sub">A monster pet comes from its souls. These are the totals for each level.</p>
      <ol class="ae-pw-climb">${climb}</ol>
    </section>` : ''}
    <section class="ae-gx-block ae-arc-block" id="aePetGenera" aria-labelledby="aePetGeneraTitle">
      <h2 class="ae-gx-h2" id="aePetGeneraTitle">Four genera</h2>
      <p class="ae-arc-sub">${esc(pets.generaNote)}</p>
      <ul class="ae-pw-genera">${genera}</ul>
      ${tips ? `<ul class="ae-pw-tips">${tips}</ul>` : ''}
    </section>
    <section class="ae-gx-block ae-arc-block" id="aeWings" aria-labelledby="aeWingsTitle">
      <h2 class="ae-gx-h2" id="aeWingsTitle">Wings</h2>
      <p class="ae-arc-sub">${esc(wings.lede)}</p>
      <ul class="ae-pw-wings">${wingRow}</ul>
      ${ex ? `<div class="ae-pw-wing" data-wing-example>
        ${pwArt('wing-superior-big.jpg', ex.name, 235, 199)}
        <div><h3>${esc(ex.name)}</h3>
          <div class="ae-pw-effects"><div><span class="ae-pw-eff-h">When worn</span><ul>${ex.equipped.map(line => `<li>${esc(line)}</li>`).join('')}</ul></div>
          <div class="is-owned"><span class="ae-pw-eff-h">Just for owning it</span><ul>${ex.owned.map(line => `<li>${esc(line)}</li>`).join('')}</ul></div></div></div>
      </div>` : ''}
      ${wingFacts ? `<h3 class="ae-pw-h3">Where wings come from</h3><ul class="ae-pw-tips">${wingFacts}</ul>` : ''}
    </section>`;
}

async function renderPetsWings() {
  const body = shell('equipment', 'pets-wings');
  const text = byId(await loadGuideText());
  body.insertAdjacentHTML('beforeend', petsWingsHtml(text.pets, text.wings));
}

async function renderTitles(linked) {
  const body = shell('equipment', 'titles');
  const text = byId(await loadGuideText());
  const ref = refFromUrl() ?? linked?.ref ?? null;
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeTitles', 'Where titles come from', `<p>${esc(text.titles.lede)}</p>${factsHtml(text.titles.facts)}
      <p class="ae-gx-cta"><a class="ae-btn" href="${esc(titlesUrl(ref))}" data-titles-link>${ref ? 'See your titles' : 'See a Daeva\'s titles'}</a></p>`)}`);
}

/* ----- Crafting topic pages (their markup lives in guide-crafting.mjs) ----- */

const craftingPage = (page, html) => async () => {
  const body = shell('crafting', page);
  body.insertAdjacentHTML('beforeend', html(byId(await loadGuideText())));
};
const renderProfessions = craftingPage('professions', professionsHtml);
const renderGathering = craftingPage('gathering', gatheringHtml);
const renderCraftedGear = craftingPage('crafted-gear', craftedGearHtml);

/* ----- Where to get it ----- */

/*
 * Built around the goal: the end gear first (the top Expedition drops), then the climb to it (the Expeditions by the item
 * level they drop, top step first), then, for a linked Daeva, each slot's own path from what they wear to the end goal.
 * Every name, level and gate comes from gear-sources.json, every one line description from dungeons.json. Item icons show
 * only when they are real: a piece the linked Daeva wears. No placeholder frames and no drawn icons.
 */
const DUNGEON_PAGES = `${GUIDE_ROOT}dungeons/`;
const loadDungeons = () => getJson(`${ADVISOR}dungeons.json`);
/** The end goal in the order a player reads their gear: weapon, armour, accessories, then the guard. */
const GOAL_ORDER = ['weapon', 'armour', 'accessory', 'guard'];
/** Armour and accessory drops come as a series that fills several slots: those get the Set tag. */
const SET_GROUPS = new Set(['armour', 'accessory']);
const firstSentence = text => String(text ?? '').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? String(text ?? '');
const gateText = (level, itemLevel) => [Number.isFinite(level) ? `Lv ${level}` : null, Number.isFinite(itemLevel) ? `item level ${number(itemLevel)}+` : null].filter(Boolean).join(', ');
const needText = (itemLevel, levelShort = null) => `Need ${[Number.isFinite(levelShort) ? `Lv ${levelShort}` : null, Number.isFinite(itemLevel) ? `item level ${number(itemLevel)}` : null].filter(Boolean).join(', ')}`;
const dungeonLink = (id, name, dungeons) => (dungeons.has(id) ? `<a href="${esc(`${DUNGEON_PAGES}${id}/`)}" data-dungeon-link="${esc(id)}">${esc(name)}</a>` : esc(name));

/** The worn piece's real game icon when the Daeva wears a piece of this drop ("Enraged Kromede Weapon series"), else null. */
function wornIcon(model, groupId, lootName, sources) {
  if (!model) return null;
  const stem = String(lootName ?? '').replace(/\s+(?:Weapon|Armour|Accessory)\s+series$/i, '').trim().toLowerCase();
  if (!stem) return null;
  const hit = model.gear.find(slot => {
    const name = String(slot.name ?? '').toLowerCase();
    return !slot.empty && slot.icon && slotGroupOf(slot.slot, sources)?.id === groupId && name.startsWith(stem) && (name.length === stem.length || /[^a-z0-9]/.test(name[stem.length]));
  });
  return hit?.icon ?? null;
}

/** The Expeditions as steps by the item level their Conquest drops, lowest first: { step, itemLevel, level, gate, runs }. */
export function climbSteps(sources) {
  const index = indexGearSources(sources);
  const byLevel = new Map();
  for (const source of index.expeditions) {
    const conquest = source.difficulties.find(entry => entry.id === 'conquest');
    const loot = Array.isArray(conquest?.loot) ? conquest.loot.filter(item => item.group && Number.isFinite(item.itemLevel)) : [];
    if (!loot.length) continue;
    const itemLevel = Math.max(...loot.map(item => item.itemLevel));
    if (!byLevel.has(itemLevel)) byLevel.set(itemLevel, []);
    byLevel.get(itemLevel).push({ source, conquest, exploration: source.difficulties.find(entry => entry.id === 'exploration') ?? null, loot });
  }
  return [...byLevel.keys()].sort((a, b) => a - b).map((itemLevel, at) => {
    const runs = byLevel.get(itemLevel);
    const gates = runs.map(run => run.conquest.entryItemLevel).filter(Number.isFinite);
    const levels = runs.map(run => run.conquest.level).filter(Number.isFinite);
    return { step: at + 1, itemLevel, level: levels.length ? Math.min(...levels) : null, gate: gates.length ? Math.min(...gates) : null, runs };
  });
}

/** Where a linked Daeva stands on the climb: the step they are on, which runs are open, and the next run to go for. */
function climbState(steps, plan) {
  const itemLevel = plan?.itemLevelKnown ? plan.itemLevel : null;
  if (itemLevel === null) return null;
  const level = plan.level;
  const levelOk = need => !Number.isFinite(need) || !Number.isFinite(level) || level >= need;
  const reached = (need, gate) => levelOk(need) && Number.isFinite(gate) && itemLevel >= gate;
  const here = [...steps].reverse().find(step => reached(step.level, step.gate))?.step ?? null;
  // The next run: the open Expedition that is the best place now for the most slots, the higher drops first.
  const tally = new Map();
  for (const entry of plan.upgrades) {
    const best = entry.best;
    if (best?.kind !== 'expedition') continue;
    const row = tally.get(best.sourceId) ?? { id: best.sourceId, count: 0, itemLevel: best.itemLevel ?? 0 };
    row.count += 1;
    tally.set(best.sourceId, row);
  }
  const next = [...tally.values()].sort((a, b) => b.itemLevel - a.itemLevel || b.count - a.count)[0]?.id ?? null;
  return { itemLevel, level, here, next, open: run => reached(run.conquest.level, run.conquest.entryItemLevel), reached };
}

/** Your end goal: the top step's drops, one card per slot group, on the Unique edge. */
function endGoalHtml(steps, sources, model) {
  const top = steps[steps.length - 1];
  if (!top) return '';
  const groups = new Map((indexGearSources(sources).byId.get('slot-groups')?.groups ?? []).map(group => [group.id, group]));
  const drops = top.runs.flatMap(run => run.loot.map(item => ({ item, run })))
    .filter(({ item }) => GOAL_ORDER.includes(item.group))
    .sort((a, b) => GOAL_ORDER.indexOf(a.item.group) - GOAL_ORDER.indexOf(b.item.group));
  const card = ({ item, run }) => {
    const icon = wornIcon(model, item.group, item.name, sources);
    return `<li class="ae-wg-goal" data-grade="unique" data-goal="${esc(item.group)}" data-source="${esc(run.source.id)}">
        ${icon ? gradeTile({ icon, grade: 'unique', size: 72, alt: '' }) : ''}
        <span class="ae-wg-goal-name">${esc(item.name)}</span>
        <span class="ae-wg-goal-meta">Item level ${esc(item.itemLevel)}</span>
        <span class="ae-wg-goal-slot">${esc(groups.get(item.group)?.name ?? item.group)}</span>
      </li>`;
  };
  return sectionHtml('aeWhereGoal', 'Your end goal', `<p class="ae-wg-lede">The best gear Expeditions drop in Season 1.</p><ul class="ae-wg-goals">${drops.map(card).join('')}</ul>`);
}

/** One Expedition on the climb: its card with Exploration and Conquest side by side, and its drops. */
function runHtml(run, { state, dungeons, sources, model }) {
  const { source, conquest, exploration } = run;
  const locked = state ? !state.open(run) : false;
  const isNext = state?.next === source.id;
  const short = locked && Number.isFinite(conquest.level) && Number.isFinite(state.level) && state.level < conquest.level ? conquest.level : null;
  const conquestGate = locked ? needText(conquest.entryItemLevel, short) : gateText(conquest.level, conquest.entryItemLevel);
  const sameGate = exploration && exploration.level === conquest.level && exploration.entryItemLevel === conquest.entryItemLevel;
  const drops = run.loot.map(item => {
    const icon = wornIcon(model, item.group, item.name, sources);
    return `<li class="ae-wg-drop" data-grade="unique" data-drop="${esc(source.id)}:${esc(item.group)}">${icon ? gradeTile({ icon, grade: 'unique', size: 48, alt: '' }) : ''}<span>${esc(item.name)}</span>${SET_GROUPS.has(item.group) ? '<b class="ae-wg-set" data-set>Set</b>' : ''}</li>`;
  }).join('');
  const gateLine = (which, text) => `<p class="ae-wg-gate${locked && which !== 'exploration' ? ' is-need' : ''}" data-gate="${esc(which)}">${esc(text)}</p>`;
  const conquestCol = `<div class="ae-wg-mode" data-mode="conquest"><h5 class="ae-wg-mode-name">Conquest</h5><ul class="ae-wg-drops">${drops}</ul>${sameGate ? '' : gateLine('conquest', conquestGate)}</div>`;
  const exploreCol = exploration && !sameGate ? `<div class="ae-wg-mode" data-mode="exploration"><h5 class="ae-wg-mode-name">Exploration</h5>${gateLine('exploration', gateText(exploration.level, exploration.entryItemLevel))}</div>` : '';
  const record = dungeons.get(source.id);
  return `<li class="ae-wg-run" data-run="${esc(source.id)}"${state ? ` data-open="${locked ? 'no' : 'yes'}"` : ''}${isNext ? ' data-next' : ''}>
      <div class="ae-wg-run-head"><h4 class="ae-wg-run-name">${dungeonLink(source.id, source.name, dungeons)}</h4>${isNext ? '<span class="ae-wg-flag is-next" data-next-run>Run this next</span>' : ''}</div>
      ${record?.summary ? `<p class="ae-wg-run-text">${esc(firstSentence(record.summary))}</p>` : ''}
      <div class="ae-wg-modes">${exploreCol}${conquestCol}</div>
      ${sameGate ? gateLine('both', `Exploration and Conquest: ${locked ? conquestGate.replace(/^Need/, 'need') : conquestGate}`) : ''}
      ${dungeons.has(source.id) ? `<p class="ae-wg-run-link"><a class="ae-gd-btn" href="${esc(`${DUNGEON_PAGES}${source.id}/`)}" data-run-guide>${esc(source.name)} guide</a></p>` : ''}
    </li>`;
}

/** The climb: the steps as a vertical ladder, the top step first, joined by a thin gold line. */
function climbHtml(steps, { plan, dungeons, sources, model }) {
  const state = climbState(steps, plan);
  const index = indexGearSources(sources);
  const cycle = index.cycles.get('odyle-energy');
  const reset = index.cycles.get('weekly-reset');
  const cube = index.byId.get('conquest-cube');
  const lootNote = steps[0]?.runs[0]?.conquest.lootNote ?? null;
  const step = entry => {
    const here = state?.here === entry.step;
    const locked = state ? !state.reached(entry.level, entry.gate) : false;
    const short = locked && Number.isFinite(entry.level) && Number.isFinite(state.level) && state.level < entry.level ? entry.level : null;
    const gate = locked ? needText(entry.gate, short) : `Entry ${gateText(entry.level, entry.gate)}`;
    return `<li class="ae-wg-step" data-step="${esc(entry.step)}"${here ? ' data-here' : ''}${locked ? ' data-locked' : ''}>
        <div class="ae-wg-step-head">
          <span class="ae-wg-step-n" aria-hidden="true">${esc(entry.step)}</span>
          <h3 class="ae-wg-step-title">Step ${esc(entry.step)}: item level ${esc(entry.itemLevel)}</h3>
          <p class="ae-wg-step-gate${locked ? ' is-need' : ''}">${esc(gate)}</p>
          ${here ? '<span class="ae-wg-flag is-here" data-you-are-here>You are here</span>' : ''}
        </div>
        <ul class="ae-wg-runs">${entry.runs.map(run => runHtml(run, { state, dungeons, sources, model })).join('')}</ul>
      </li>`;
  };
  const notes = [cube?.text, cycle ? firstSentence(cycle.text) : null, reset?.text].filter(Boolean);
  return sectionHtml('aeWhereClimb', 'The climb', `${lootNote ? `<p class="ae-wg-lede">Every drop here is Unique. ${esc(lootNote)}</p>` : ''}
      <ol class="ae-wg-ladder">${[...steps].reverse().map(step).join('')}</ol>
      ${notes.length ? `<ul class="ae-wg-notes">${notes.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}`);
}

/** One stop on a slot's path: the label, the real icon (worn piece) or the item level in its grade frame, and the words. */
function nodeHtml(kind, label, { icon = null, grade = null, enchant = null, name, itemLevel = null, where = '', state = '' }) {
  const art = icon
    ? gradeTile({ icon, grade, enchant, size: 64, alt: '' })
    : Number.isFinite(itemLevel) ? `<span class="ae-wg-level"${grade ? ` data-grade="${esc(grade)}"` : ''}><b>${esc(itemLevel)}</b><small>item level</small></span>` : '';
  return `<li class="ae-wg-node" data-node="${esc(kind)}"${state ? ` data-open="${esc(state)}"` : ''}>
      <span class="ae-wg-node-label">${esc(label)}</span>
      ${art}
      <span class="ae-wg-node-copy"><b class="ae-wg-node-name">${esc(name)}</b>${icon && Number.isFinite(itemLevel) ? `<span>Item level ${esc(itemLevel)}</span>` : ''}${where ? `<span>${where}</span>` : ''}</span>
    </li>`;
}

function offerNode(kind, label, offer, dungeons) {
  if (!offer) return '';
  const grade = offer.grade ? String(offer.grade).toLowerCase() : null;
  const where = `${dungeonLink(offer.sourceId, offer.source, dungeons)}${offer.difficulty ? `, ${esc(offer.difficulty)}` : ''}`;
  const short = offer.gap?.level ? offer.gate.level : null;
  const flag = offer.open === true
    ? '<em class="ae-wg-enter" data-enter="yes">You can enter</em>'
    : offer.open === false ? `<em class="ae-wg-enter" data-enter="no">${esc(needText(offer.gate.itemLevel, short))}</em>`
      : Number.isFinite(offer.gate?.itemLevel) ? `<em class="ae-wg-enter" data-enter="unknown">Entry ${esc(gateText(null, offer.gate.itemLevel))}</em>` : '';
  return nodeHtml(kind, label, { grade, name: offer.item ?? offer.reward, itemLevel: offer.itemLevel, where: `${where}${flag}`, state: offer.open === true ? 'yes' : offer.open === false ? 'no' : '' });
}

/** A slot as a gear path: what is worn, Best now, Next goal, End goal, joined by a thin gold line. */
function slotPathHtml(entry, dungeons, sharedLookFor = '') {
  const current = entry.worn
    ? nodeHtml('current', 'Current', { icon: entry.worn.icon, grade: entry.worn.gradeId, enchant: entry.worn.enchant, name: entry.worn.name, itemLevel: entry.worn.level })
    : nodeHtml('current', 'Current', { name: 'Nothing worn' });
  const top = entry.offers.filter(offer => offer.kind === 'expedition').sort((a, b) => (b.itemLevel ?? 0) - (a.itemLevel ?? 0))[0] ?? null;
  const goalIsTop = Boolean(entry.goal) && entry.goal === top;
  const path = [
    offerNode('best', 'Best now', entry.best, dungeons),
    entry.goal ? offerNode(goalIsTop ? 'end' : 'goal', goalIsTop ? 'End goal' : 'Next goal', entry.goal, dungeons) : '',
    top && top !== entry.best && top !== entry.goal ? offerNode('end', 'End goal', top, dungeons) : ''
  ].join('');
  const note = !entry.best && !entry.goal ? '<p class="ae-wg-slot-note">No listed drop is open to you yet.</p>' : '';
  const hold = entry.hold ? `<p class="ae-wg-slot-note">${esc(entry.hold.text)}</p>` : '';
  const stray = entry.stray ? `<p class="ae-gx-stray" data-stray><b>Strays from the plan:</b> ${esc(entry.stray.text)}</p>` : '';
  // The look-for list shows on the card only when it differs from the one line under the heading.
  const lookFor = entry.lookFor.length && entry.lookFor.join(', ') !== sharedLookFor ? `<p class="ae-wg-slot-note" data-look-for>On the next piece, look for: ${esc(entry.lookFor.join(', '))}.</p>` : '';
  return `<li class="ae-wg-slot" id="slot-${esc(entry.slotPos)}" data-slot="${esc(entry.slot)}" data-where-status="${esc(entry.status)}">
      <h4 class="ae-wg-slot-name">${esc(slotLabel(entry.slot))}</h4>
      <ol class="ae-wg-path">${current}${path}</ol>
      ${hold}${stray}${note}${lookFor}
    </li>`;
}

/** Slots with nothing to go for, grouped by the reason so each reason is said once: the worn pieces in a row, then the reason. */
function otherSlotsHtml(others) {
  const groups = new Map();
  for (const entry of others) {
    const reason = entry.status === 'pending' ? entry.pending.reason : 'Nothing we know drops a better piece for this slot.';
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(entry);
  }
  return [...groups.entries()].map(([reason, entries]) => `<li class="ae-wg-slot is-group">
      <ol class="ae-wg-path is-row">${entries.map(entry => `<li class="ae-wg-node" id="slot-${esc(entry.slotPos)}" data-slot="${esc(entry.slot)}" data-where-status="${esc(entry.status)}">
          <span class="ae-wg-node-label">${esc(slotLabel(entry.slot))}</span>
          ${entry.worn ? gradeTile({ icon: entry.worn.icon, grade: entry.worn.gradeId, enchant: entry.worn.enchant, size: 64, alt: '' }) : ''}
          <span class="ae-wg-node-copy"><b class="ae-wg-node-name">${esc(entry.worn?.name ?? 'Nothing worn')}</b></span>
        </li>`).join('')}</ol>
      <p class="ae-wg-slot-note">${esc(reason)}</p>
      ${entries.filter(entry => entry.stray).map(entry => `<p class="ae-gx-stray" data-stray><b>${esc(slotLabel(entry.slot))} strays from the plan:</b> ${esc(entry.stray.text)}</p>`).join('')}
    </li>`).join('');
}

/** The linked Daeva's slots: every slot to upgrade as a path, then the slots with nothing to go for. */
export function whereToGetHtml(plan, { dungeons = new Map() } = {}) {
  const upgrades = plan.slots.filter(entry => entry.status === 'offers');
  const others = plan.slots.filter(entry => entry.status !== 'offers');
  // The look-for list most slots share, said once under the heading.
  const counts = new Map();
  for (const entry of upgrades) if (entry.lookFor.length) counts.set(entry.lookFor.join(', '), (counts.get(entry.lookFor.join(', ')) ?? 0) + 1);
  const shared = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return `<div class="ae-gx-where" id="aeWhere">
      <h2 class="ae-gx-h2" id="aeWhereUp">Slots to upgrade (${upgrades.length})</h2>
      ${shared ? `<p class="ae-wg-lede" data-look-for-all>On the next piece, look for: ${esc(shared)}.</p>` : ''}
      <ol class="ae-wg-slots" aria-labelledby="aeWhereUp">${upgrades.map(entry => slotPathHtml(entry, dungeons, shared)).join('')}</ol>
      ${others.length ? `<h2 class="ae-gx-h2" id="aeWhereRest">Other slots</h2><ol class="ae-wg-slots is-rest" aria-labelledby="aeWhereRest">${otherSlotsHtml(others)}</ol>` : ''}
    </div>`;
}

const whoHtml = (plan, model) => `<p class="ae-gx-who" data-where-who>${esc(model.profile.name)}, ${esc(model.profile.class)} Lv ${esc(plan.level ?? '-')}${plan.itemLevelKnown ? `, item level ${esc(number(plan.itemLevel))}` : ''}.</p>`;

async function renderWhereToGet(linked) {
  const body = shell('equipment', 'where-to-get');
  const ref = refFromUrl() ?? linked?.ref ?? null;
  const [sources, dungeonData] = await Promise.all([loadSources(), loadDungeons().catch(() => null)]);
  const dungeons = new Map((dungeonData?.records ?? []).map(record => [record.id, record]));
  const steps = climbSteps(sources);
  body.insertAdjacentHTML('beforeend', '<div class="ae-wg" id="aeWhereHolder"></div>');
  const holder = $('#aeWhereHolder');
  const plain = `${endGoalHtml(steps, sources, null)}${climbHtml(steps, { plan: null, dungeons, sources, model: null })}`;
  if (!ref) {
    holder.innerHTML = `${plain}<section class="ae-gx-block ae-wg-find" id="aeWhereFind" aria-labelledby="aeWhereFindTitle"><h2 class="ae-gx-h2" id="aeWhereFindTitle">Your own path</h2><p>Link a Daeva and each slot you wear shows its path from what you have now to the end goal.</p><p class="ae-gx-cta"><a class="ae-gd-btn is-gold" href="/hub/aetherium/#aeSearch" data-find-daeva>Find your Daeva</a></p></section>`;
    return;
  }
  holder.innerHTML = `${plain}<p class="ae-muted" id="aeWhereReading">Reading your Daeva.</p>`;
  let loaded;
  try {
    loaded = await loadCharacter(ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    $('#aeWhereReading')?.remove();
    showNotice(explain(error), 'warn', { retry: () => location.reload() });
    return;
  }
  const { model, source } = loaded;
  showSource(source);
  const [grades, progression, builds] = await Promise.all([loadGrades(), loadProgression(), loadBuilds(model.profile.class).catch(() => null)]);
  const build = builds ? buildFor(builds, rolePick(ref)) : null;
  const gradeIndex = indexGrades(grades);
  const draw = () => {
    const plan = gearSourcePlan(model, { data: sources, grades: gradeIndex, progression, build });
    holder.innerHTML = `${whoHtml(plan, model)}${endGoalHtml(steps, sources, model)}${climbHtml(steps, { plan, dungeons, sources, model })}${whereToGetHtml(plan, { dungeons })}`;
    // A #slot-N link lands on its slot, again after a redraw moves it.
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
  };
  draw();
  // The shell settles the page (side menu, topic list) once this render is done: land the #slot-N link again then.
  if (location.hash) document.addEventListener('forge:portal-ready', () => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), { once: true });
  // Item levels come with each item's detail: the kept ones are free, the rest load in the usual budget, then the panel redraws.
  const wanted = model.gear.filter(slot => !slot.empty && slotGroupOf(slot.slot, sources) && !['belt', 'arcana'].includes(slotGroupOf(slot.slot, sources).id));
  let changed = false;
  await preloadItemDetails(model, wanted, { onDetail: (slot, result) => { if (result?.detail && Number.isFinite(result.detail.level)) { slot.level = result.detail.level; changed = true; } } });
  if (changed) draw();
}

const PAGES = {
  equipment: { home: renderEquipmentHome, slots: renderSlots, enhancement: renderEnhancement, manastones: renderManastones, theostones: renderTheostones, arcana: renderArcana, 'pets-wings': renderPetsWings, titles: renderTitles, 'where-to-get': renderWhereToGet },
  crafting: { home: renderCraftingHome, professions: renderProfessions, gathering: renderGathering, 'crafted-gear': renderCraftedGear }
};

startGuidePage(async linked => {
  const section = document.body.dataset.guideSection;
  const page = document.body.dataset.guidePage || 'home';
  const render = PAGES[section]?.[page] ?? PAGES.equipment.home;
  await render(linked);
});
