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
    { id: 'theostones', label: 'Theostones', blurb: 'One proc stone on the weapon you keep.' },
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

async function renderManastones() {
  const body = shell('equipment', 'manastones');
  const [enhancement, sources, text] = await Promise.all([loadEnhancement(), loadSources(), loadGuideText()]);
  const record = byId(enhancement).manastone;
  const alchemy = byId(text).professions.professions.find(item => item.id === 'alchemy');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeManaFacts', 'How engraving works', factsHtml(record.facts))}
    ${sectionHtml('aeSoul', 'Soulstones on accessories', factsHtml([{ id: 'accessories', text: record.accessories.text, status: record.accessories.status }]))}
    ${sectionHtml('aeManaRoles', 'Best stones by role', rolesHtml(record.roles, value => `<span>${esc(value.stones.map(stone => `${stone.name} (top ${stone.top})`).join(', '))}</span>${value.note ? `<span>${esc(value.note)}</span>` : ''}`))}
    ${sectionHtml('aeManaWhere', 'Where they come from', `${rewardList(rewardSources(sources, ['Manastone', 'Soulstone']))}
      <p>Alchemy makes them too: ${esc(alchemy.makes)}. ${statusTag(alchemy.status)} <a href="${esc(topicHref('crafting', 'professions'))}">The five professions</a></p>`)}`);
}

async function renderTheostones() {
  const body = shell('equipment', 'theostones');
  const [enhancement, sources] = await Promise.all([loadEnhancement(), loadSources()]);
  const record = byId(enhancement).theostone;
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeTheoFacts', 'How Theostones work', factsHtml(record.facts))}
    ${sectionHtml('aeTheoRoles', 'Which one for your role', rolesHtml(record.roles, value => `<span>${esc(value.text)}</span>`))}
    ${sectionHtml('aeTheoWhere', 'Where they come from', rewardList(rewardSources(sources, ['Theostone'])))}`);
}

async function renderArcana() {
  const body = shell('equipment', 'arcana');
  const sources = await loadSources();
  const index = indexGearSources(sources);
  const record = index.byId.get('arcana-grades');
  const name = id => index.byId.get(id)?.name ?? id;
  const slotRows = record.slots.map(slot => `<tr data-arcana-slot="${esc(slot.id)}"><th scope="row">${esc(slot.name)}</th><td>${esc(slot.skills)}</td><td>${esc(slot.from.map(name).join(', '))}${slot.note ? ` <small>${esc(slot.note)}</small>` : ''}</td></tr>`).join('');
  const gradeRows = record.grades.map(entry => `<li><span class="ae-grade-name" data-grade="${esc(entry.grade.toLowerCase())}">${esc(entry.grade)}</span><b>+${esc(entry.itemLevel)} item level</b></li>`).join('');
  const lines = record.lines.map(line => `<li class="ae-gx-card"><strong>${esc(line.name)}</strong><span>2 pieces: ${esc(line.set2)}</span><span>4 pieces: ${esc(line.set4)}</span></li>`).join('');
  const dungeons = index.transcendence.map(dungeon => `<li class="ae-gx-card" data-transcendence="${esc(dungeon.id)}"><strong>${esc(dungeon.name)}</strong><span>${esc(dungeon.arcana.map(id => record.slots.find(slot => slot.id === id)?.name ?? id).join(', '))} Arcana</span>
      <ol class="ae-gx-stages">${dungeon.stages.map(stage => `<li><b>Stage ${esc(stage.stage)}</b><span>item level ${esc(number(stage.entryItemLevel))}+</span><span>${esc(stage.arcanaGrades[0])} to ${esc(stage.arcanaGrades[stage.arcanaGrades.length - 1])}${stage.guaranteed ? `, ${esc(stage.guaranteed.toLowerCase())} guaranteed` : ''}</span></li>`).join('')}</ol>
      <span>${esc(dungeon.stagesNote)}</span></li>`).join('');
  const weekly = index.cycles.get('transcendence-weekly');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeArcSlots', 'The five Arcana slots', `<div class="ae-gx-tablewrap"><table class="ae-gx-table"><thead><tr><th scope="col">Slot</th><th scope="col">Skills</th><th scope="col">Drops in</th></tr></thead><tbody>${slotRows}</tbody></table></div>`, statusTag(record.status))}
    ${sectionHtml('aeArcGrades', 'Item level by grade', `<ul class="ae-gx-grades">${gradeRows}</ul>`)}
    ${sectionHtml('aeArcLines', 'Lines and set effects', `<p>Every Arcana belongs to one of two lines. Two or four of the same line add a set effect.</p><ul class="ae-gx-cards">${lines}</ul>`)}
    ${sectionHtml('aeArcWhere', 'Where they drop: Transcendence', `<ul class="ae-gx-cards">${dungeons}</ul><p>${esc(weekly.text)} ${statusTag(weekly.status)}</p>${factsHtml([{ id: 'transmute', text: record.transmute.text, status: record.transmute.status }])}`)}`);
}

async function renderPetsWings() {
  const body = shell('equipment', 'pets-wings');
  const text = byId(await loadGuideText());
  const pets = text.pets;
  const genera = pets.genera.map(genus => `<tr><th scope="row">${esc(genus.name)}</th><td>${esc(genus.pets)}</td><td>${esc(genus.perPet)}</td></tr>`).join('');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aePets', 'Pets', `<p>${esc(pets.lede)}</p>${factsHtml(pets.facts)}
      <div class="ae-gx-tablewrap"><table class="ae-gx-table"><caption>${esc(pets.generaNote)} ${statusTag('reported')}</caption><thead><tr><th scope="col">Genus</th><th scope="col">Pets</th><th scope="col">Each at level 3</th></tr></thead><tbody>${genera}</tbody></table></div>`)}
    ${sectionHtml('aeWings', 'Wings', `<p>${esc(text.wings.lede)}</p>${factsHtml(text.wings.facts)}`)}`);
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
function slotPathHtml(entry, dungeons) {
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
  const lookFor = entry.lookFor.length && entry.status === 'offers' ? `<p class="ae-wg-slot-note">On the next piece, look for: ${esc(entry.lookFor.join(', '))}.</p>` : '';
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
  return `<div class="ae-gx-where" id="aeWhere">
      <h2 class="ae-gx-h2" id="aeWhereUp">Slots to upgrade (${upgrades.length})</h2>
      <ol class="ae-wg-slots" aria-labelledby="aeWhereUp">${upgrades.map(entry => slotPathHtml(entry, dungeons)).join('')}</ol>
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
