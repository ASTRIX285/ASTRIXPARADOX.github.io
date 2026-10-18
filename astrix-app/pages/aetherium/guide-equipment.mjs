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
import { GUIDE_ROOT, renderGuideShell, startGuidePage } from './guide-shell.mjs';
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

/* Our own line icons for the topic tiles (24 px grid, currentColor). Game icons go in tiles that show a real item. */
const ICONS = {
  slots: '<rect x="4" y="3" width="7" height="7"/><rect x="13" y="3" width="7" height="7"/><rect x="4" y="14" width="7" height="7"/><rect x="13" y="14" width="7" height="7"/>',
  enhancement: '<path d="M12 3v18M5 10l7-7 7 7"/>',
  manastones: '<path d="M12 3l7 6-7 12-7-12z"/><path d="M5 9h14"/>',
  theostones: '<circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/>',
  arcana: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M12 8l2 4-2 4-2-4z"/>',
  'pets-wings': '<path d="M12 12c-3-6-8-6-9-3 2 0 5 1 9 3zM12 12c3-6 8-6 9-3-2 0-5 1-9 3z"/><path d="M12 12v8"/>',
  titles: '<path d="M6 4h12v6a6 6 0 0 1-12 0z"/><path d="M9 20h6M12 16v4"/>',
  'where-to-get': '<circle cx="12" cy="10" r="3"/><path d="M12 21c-4-5-7-8-7-11a7 7 0 0 1 14 0c0 3-3 6-7 11z"/>',
  professions: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L3.5 14.5a2 2 0 0 0 0 3l3 3a2 2 0 0 0 3 0L17 13"/>',
  gathering: '<path d="M5 20c0-8 6-14 14-15-1 8-7 14-14 15z"/><path d="M5 20l8-8"/>',
  'crafted-gear': '<path d="M14.5 3.5l6 6-9 9H5.5v-6z"/><path d="M12 7l5 5M4 20l3-3"/>'
};
const icon = id => `<svg class="ae-gx-icon" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id] ?? ''}</svg>`;

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

function tilesHtml(section) {
  return `<ul class="ae-gx-tiles">${TOPICS[section].map(topic => `<li class="ae-gx-tile" data-guide-topic="${esc(topic.id)}"><a href="${esc(topicHref(section, topic.id))}">${icon(topic.id)}<span class="ae-gx-tile-name">${esc(topic.label)}</span><span class="ae-gx-tile-blurb">${esc(topic.blurb)}</span></a></li>`).join('')}</ul>`;
}

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
    <p class="ae-gx-note"><span aria-hidden="true">*</span> The wiki names armour and accessory drops as a series; which slots a series covers is our reading ${statusTag('unconfirmed')}. Exploration drops are not listed yet ${statusTag('pending')}.</p>`;
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
  const text = byId(await loadGuideText());
  const before = text.professions?.facts?.find(item => item.id === 'before-35');
  if (before) body.insertAdjacentHTML('beforeend', sectionHtml('aeCraftWhy', 'Why craft before Lv 35', `${factsHtml([before])}${factsHtml(text['crafted-ladder']?.facts?.filter(item => item.id === 'dragon-lord'))}`));
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

/* ----- Crafting topic pages ----- */

async function renderProfessions() {
  const body = shell('crafting', 'professions');
  const text = byId(await loadGuideText());
  const record = text.professions;
  const cards = record.professions.map(item => `<li class="ae-gx-card" data-profession="${esc(item.id)}"><strong>${esc(item.name)}</strong><span><b>Makes:</b> ${esc(item.makes)}</span><span><b>Refines:</b> ${esc(item.refines ?? 'nothing')}</span></li>`).join('');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeProf', 'The five professions', `<p>${esc(record.lede)}</p><ul class="ae-gx-cards">${cards}</ul>${factsHtml(record.facts)}`, statusTag(record.status))}
    ${sectionHtml('aeCraftRules', 'How a craft works', factsHtml(text['craft-rules'].facts))}
    ${sectionHtml('aeCraftFirst', 'Which first: what players say', `<p>Players disagree on the order. These are their reasons, not a rule.</p>${factsHtml(record.players.map((item, n) => ({ id: `players-${n + 1}`, ...item })))}`)}`);
}

async function renderGathering() {
  const body = shell('crafting', 'gathering');
  const record = byId(await loadGuideText()).gathering;
  const rows = record.types.map(type => `<tr><th scope="row">${esc(type.name)}</th><td>${esc(type.examples)}</td><td>${esc(type.usedFor)}</td></tr>`).join('');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeGatherTypes', 'What you gather', `<p>${esc(record.lede)}</p><div class="ae-gx-tablewrap"><table class="ae-gx-table"><thead><tr><th scope="col">Type</th><th scope="col">Examples</th><th scope="col">Used for</th></tr></thead><tbody>${rows}</tbody></table></div>${factsHtml([{ id: 'qualities', text: record.qualities.text, status: record.qualities.status }])}`, statusTag(record.status))}
    ${sectionHtml('aeGatherFacts', 'Nodes, places and skills', factsHtml(record.facts))}`);
}

async function renderCraftedGear() {
  const body = shell('crafting', 'crafted-gear');
  const record = byId(await loadGuideText())['crafted-ladder'];
  const steps = record.steps.map(step => `<li class="ae-gx-rung" data-rung="${esc(step.name)}"><strong>${esc(step.name)}</strong><span>${esc(step.example)}</span><span>${step.proficiency ? `Proficiency ${esc(step.proficiency)}` : 'Transfer crafting'}${step.grade ? `, <span class="ae-grade-name" data-grade="${esc(step.grade.toLowerCase())}">${esc(step.grade)}</span>` : ''}</span><span>Bow item level ${esc(step.bowItemLevel)}</span>${step.status ? statusTag(step.status) : ''}</li>`).join('');
  body.insertAdjacentHTML('beforeend', `
    ${sectionHtml('aeLadder', 'The ladder', `<p>${esc(record.lede)}</p><ol class="ae-gx-ladder">${steps}</ol><p class="ae-gx-note">Steps ${statusTag(record.stepsStatus)} Item levels ${statusTag(record.itemLevelsStatus)}</p>`)}
    ${sectionHtml('aeLadderFacts', 'What to know', factsHtml(record.facts))}
    ${sectionHtml('aeLadderNext', 'Then enhance it', `<p>A crafted Dragon Lord piece is Unique, so it follows the Unique steps. <a href="${esc(topicHref('equipment', 'enhancement'))}">What to enhance, and when</a></p>`)}`);
}

/* ----- Where to get it ----- */

const gateText = gate => [Number.isFinite(gate?.level) ? `Lv ${gate.level}` : null, Number.isFinite(gate?.itemLevel) ? `item level ${number(gate.itemLevel)}+` : null].filter(Boolean).join(', ');
const cycleChip = cycle => (cycle ? `<span class="ae-gx-cycle" data-cycle="${esc(cycle.id)}" title="${esc(cycle.text)}">${esc(cycle.label)}${cycle.reset ? `, resets ${esc(cycle.reset.day)} ${esc(cycle.reset.timeUtc)} UTC` : ''}</span>` : '');

function offerHtml(offer, kind) {
  if (!offer) return '';
  const label = { best: 'Best now', goal: 'Next goal' }[kind] ?? 'Also';
  const gap = offer.gap && (offer.gap.level || offer.gap.itemLevel) ? `<span class="ae-gx-gap">${[offer.gap.level ? `${offer.gap.level} more levels` : null, Number.isFinite(offer.gap.itemLevel) && offer.gap.itemLevel > 0 ? `${number(offer.gap.itemLevel)} more item level` : null].filter(Boolean).join(' and ')} to enter</span>` : '';
  const open = offer.open === true ? '<span class="ae-gx-open" data-open="yes">You can enter</span>' : offer.open === null ? '<span class="ae-gx-open" data-open="unknown">Item level not read</span>' : '<span class="ae-gx-open" data-open="no">Locked</span>';
  return `<li class="ae-gx-offer" data-offer="${esc(kind)}" data-source="${esc(offer.sourceId)}">
      <span class="ae-gx-offer-kind">${esc(label)}</span>
      <strong class="ae-gx-highlight">${esc(offer.highlight)}</strong>
      <span class="ae-gx-offer-meta">${offer.item ? `${esc(offer.item)}${Number.isFinite(offer.itemLevel) ? `, item level ${esc(offer.itemLevel)}` : ''}. ` : ''}${gateText(offer.gate) ? `Entry ${esc(gateText(offer.gate))}. ` : ''}${open} ${gap}</span>
      ${offer.text ? `<span class="ae-gx-offer-meta">${esc(offer.text)}</span>` : ''}
      ${offer.claimsNeeded?.pending ? `<span class="ae-gx-offer-meta">${esc(offer.claimsNeeded.reason)} ${statusTag('pending')}</span>` : ''}
      <span class="ae-gx-offer-meta">${cycleChip(offer.cycle)} ${statusTag(offer.status)}</span>
    </li>`;
}

function slotRowHtml(entry) {
  const gradeId = entry.worn?.gradeId ?? null;
  const tile = gradeTile({ icon: entry.worn?.icon ?? null, grade: gradeId, enchant: entry.worn?.enchant ?? null, size: 56, alt: entry.worn?.name ?? '' });
  const worn = entry.worn
    ? `<span class="ae-gx-worn"><b>${esc(entry.worn.name)}</b> <span class="ae-grade-name"${gradeId ? ` data-grade="${esc(gradeId)}"` : ''}>${esc(entry.worn.grade)}</span>${Number.isFinite(entry.worn.level) ? `, item level ${esc(entry.worn.level)}` : ''}</span>`
    : '<span class="ae-gx-worn">Nothing worn here.</span>';
  let inner;
  if (entry.status === 'pending') inner = `<p class="ae-gx-pending">${esc(entry.pending.reason)} ${statusTag('pending')}</p>`;
  else if (entry.status === 'top') inner = '<p class="ae-gx-top">Nothing we know drops a better piece for this slot.</p>';
  else {
    const rest = entry.offers.filter(offer => offer !== entry.best && offer !== entry.goal);
    inner = `<ul class="ae-gx-offers">${offerHtml(entry.best, 'best')}${offerHtml(entry.goal, 'goal')}</ul>
      ${rest.length ? `<details class="ae-gx-more"><summary>${rest.length} more place${rest.length === 1 ? '' : 's'}</summary><ul class="ae-gx-offers">${rest.map(offer => offerHtml(offer, 'also')).join('')}</ul></details>` : ''}
      ${!entry.best && !entry.goal ? '<p class="ae-gx-top">No listed drop is open to you yet.</p>' : ''}`;
  }
  const hold = entry.hold ? `<p class="ae-gx-hold">${esc(entry.hold.text)}</p>` : '';
  const stray = entry.stray ? `<p class="ae-gx-stray" data-stray><b>Strays from the plan:</b> ${esc(entry.stray.text)}</p>` : '';
  const lookFor = entry.lookFor.length && entry.status === 'offers' ? `<p class="ae-gx-lookfor">On the next piece, look for: ${esc(entry.lookFor.join(', '))}.</p>` : '';
  const groupTag = entry.group && entry.group.status !== 'confirmed' ? ` ${statusTag(entry.group.status)}` : '';
  return `<li class="ae-gx-slot" id="slot-${esc(entry.slotPos)}" data-slot="${esc(entry.slot)}" data-where-status="${esc(entry.status)}">
      <div class="ae-gx-slot-head">${tile}<span class="ae-gx-slot-copy"><strong>${esc(slotLabel(entry.slot))}</strong>${worn}${entry.group ? `<span class="ae-gx-group">${esc(entry.group.name)} drops${groupTag}</span>` : ''}</span></div>
      ${hold}${stray}${inner}${lookFor}
    </li>`;
}

/** The Where to get it panel for a plan (gearSourcePlan). The Gear page's Enhance tab links here, one slot at a time. */
export function whereToGetHtml(plan, { model }) {
  const head = `<p class="ae-gx-who" data-where-who>${esc(model.profile.name)}, ${esc(model.profile.class)} Lv ${esc(plan.level ?? '-')}, item level ${plan.itemLevelKnown ? esc(number(plan.itemLevel)) : `not sent ${statusTag('pending')}`}.</p>`;
  const upgrades = plan.slots.filter(entry => entry.status === 'offers');
  const others = plan.slots.filter(entry => entry.status !== 'offers');
  const reset = plan.weeklyReset ? `<p class="ae-gx-reset">Weekly reset: ${esc(plan.weeklyReset.day)} ${esc(plan.weeklyReset.timeUtc)} UTC. ${esc(plan.weeklyReset.text.split('. ').slice(1).join('. '))} ${statusTag(plan.weeklyReset.status)}</p>` : '';
  const side = plan.sideMissions ? `<p class="ae-gx-side" data-side-missions>Side missions: ${esc(plan.sideMissions.reason)} ${statusTag('pending')}</p>` : '';
  return `<div class="ae-gx-where" id="aeWhere">
      ${head}
      <p>Each slot below shows the best place to get a better piece that you can enter now, and the next goal. Expeditions cost Odyle Energy only when you claim the reward.</p>
      ${reset}${side}
      <h2 class="ae-gx-h2" id="aeWhereUp">Slots to upgrade (${upgrades.length})</h2>
      <ol class="ae-gx-slots" aria-labelledby="aeWhereUp">${upgrades.map(entry => slotRowHtml(entry)).join('')}</ol>
      ${others.length ? `<h2 class="ae-gx-h2" id="aeWhereRest">Other slots</h2><ol class="ae-gx-slots" aria-labelledby="aeWhereRest">${others.map(entry => slotRowHtml(entry)).join('')}</ol>` : ''}
    </div>`;
}

async function renderWhereToGet(linked) {
  const body = shell('equipment', 'where-to-get');
  const ref = refFromUrl() ?? linked?.ref ?? null;
  const sources = await loadSources();
  if (!ref) {
    body.insertAdjacentHTML('beforeend', `<section class="ae-gx-block ae-gx-find" id="aeWhereFind"><h2 class="ae-gx-h2">Find your Daeva first</h2><p>Link a Daeva and this page lists, for each slot you wear, the content that drops a better piece, the entry gate and the reward cycle.</p><p class="ae-gx-cta"><a class="ae-btn" href="/hub/aetherium/#aeSearch">Find your Daeva</a></p></section>
      ${sectionHtml('aeWhereAll', 'Where gear drops', dropTableHtml(sources))}`);
    return;
  }
  body.insertAdjacentHTML('beforeend', '<div id="aeWhereHolder"><p class="ae-muted">Reading your Daeva.</p></div>');
  let loaded;
  try {
    loaded = await loadCharacter(ref);
  } catch (error) {
    if (!(error instanceof ArmoryUnavailable)) throw error;
    $('#aeWhereHolder').innerHTML = `<p class="ae-gx-pending">${esc(explain(error))}</p>${dropTableHtml(sources)}`;
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
    $('#aeWhereHolder').innerHTML = whereToGetHtml(plan, { model });
  };
  draw();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
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
