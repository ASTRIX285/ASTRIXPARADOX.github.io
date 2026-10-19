/**
 * The Guide's Dungeons, weekly loop and World pages (The Aetherium, phase 4, feature/aetherium-guide-dungeons,
 * 18 Oct 2026). The page says which one it is on <body data-guide-page="dungeons|dungeon|weekly|world"> and, on a
 * dungeon page, data-dungeon="<id>". Static: dungeons.json and world.json (ours), gear-sources.json (phase 3) when it
 * exists. No call to the official site.
 *
 * For a linked Daeva the dungeon pages check entry: the level from the roster card and the item level the player typed
 * (aetherium-memory.mjs, field itemLevel, phase 2). Both can be changed by hand on the page for a what if check; that
 * check is never saved. A Daeva below a gate is told what it lacks; nothing is ever blocked.
 */
import { $, esc } from './aetherium-ui.mjs';
import { getMemory, memoryAge } from './aetherium-memory.mjs';
import { GUIDE_ROOT, renderGuideShell, startGuidePage } from './guide-shell.mjs';
import { GUIDE_DUNGEONS_ROOT, countdown, dungeonHref, dungeonRecords, entryCheck, findDungeon, lootFor, nextReset, overviewRows, playersText, resetList } from '/astrix-app/games/aion2/engine/dungeon-guide.mjs';

const DATA = '/astrix-app/games/aion2/data/advisor/';
const WEEKLY_HREF = `${GUIDE_ROOT}weekly/`;
const WORLD_HREF = `${GUIDE_ROOT}world/`;
const WHERE_HREF = `${GUIDE_ROOT}equipment/`;

const cache = new Map();
function getJson(name, optional = false) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`${DATA}${name}`, { credentials: 'omit' }).then(response => {
      if (!response.ok) { if (optional) return null; throw new Error(`${name} ${response.status}`); }
      return response.json();
    }).catch(error => { if (optional) return null; cache.delete(name); throw error; }));
  }
  return cache.get(name);
}

const fmt = value => (Number.isFinite(value) ? value.toLocaleString('en-GB') : null);
const cap = text => (text ? text[0].toUpperCase() + text.slice(1) : text);
const pending = (text = 'Pending') => `<span class="ae-gd-pending">${esc(text)}</span>`;
const orPending = value => (value === null || value === undefined || value === '' ? pending() : esc(value));
const STARS = n => `<span class="ae-gd-stars" role="img" aria-label="${n} of 3 stars">${'★'.repeat(n)}<i aria-hidden="true">${'★'.repeat(3 - n)}</i></span>`;

const VERDICT = {
  open: { word: 'Open', tone: 'is-open' },
  level: { word: 'Level too low', tone: 'is-closed' },
  'item-level': { word: 'Item level too low', tone: 'is-closed' },
  unknown: { word: 'Type your item level', tone: 'is-unknown' },
  pending: { word: 'Pending', tone: 'is-pending' },
  'no-daeva': { word: 'No Daeva linked', tone: 'is-unknown' }
};

/** Level and typed item level for the linked Daeva: { name, level, itemLevel, savedAge }. */
function daevaOf(linked) {
  if (!linked) return null;
  const memory = getMemory(linked.ref);
  const typed = Number(memory?.itemLevel);
  return {
    name: linked.entry?.name ?? null,
    level: Number.isFinite(linked.entry?.level) ? linked.entry.level : null,
    itemLevel: Number.isFinite(typed) && typed > 0 ? typed : null,
    savedAge: Number.isFinite(typed) && typed > 0 ? memoryAge(memory) : null
  };
}

/* Sources stay in the data, never on the page (Miguel, 19 Oct 2026). */
function sourcesHtml() {
  return '';
}

/* Where sources disagree stays in the data; the page shows no data-check notes (Miguel, 18 Oct 2026). */
function conflictsHtml() {
  return '';
}

/* Countdowns: every [data-countdown] counts down to its ISO time, once a second while the page is open. */
let ticking = 0;
function startCountdowns(data) {
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll('[data-countdown]').forEach(node => {
      let until = Date.parse(node.dataset.countdown);
      if (until <= now) {
        until = nextReset(now, node.dataset.cycle, data);
        node.dataset.countdown = new Date(until).toISOString();
        const when = node.closest('[data-reset]')?.querySelector('[data-reset-when]');
        if (when) when.textContent = whenText(until);
      }
      node.textContent = countdown(now, until).text;
    });
  };
  tick();
  clearInterval(ticking);
  ticking = setInterval(tick, 1000);
}

const whenText = at => new Date(at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

function resetCardHtml(cycle, data, now = Date.now()) {
  const at = nextReset(now, cycle, data);
  const rule = data.resets?.[cycle];
  return `<div class="ae-gd-reset" data-reset="${cycle}">
      <p class="ae-gd-reset-label">${cycle === 'weekly' ? 'Weekly reset' : 'Daily reset'}</p>
      <p class="ae-gd-reset-count"><b data-countdown="${new Date(at).toISOString()}" data-cycle="${cycle}">${esc(countdown(now, at).text)}</b></p>
      <p class="ae-gd-reset-when"><span data-reset-when>${esc(whenText(at))}</span></p>
      ${rule?.text ? `<p class="ae-gd-reset-note">${esc(rule.text)}</p>` : ''}
    </div>`;
}

/* ---------- Dungeons overview ---------- */

function overviewHtml(data, daeva) {
  const rows = overviewRows(data);
  const checkCell = row => {
    if (!daeva || !Number.isFinite(daeva.level)) return '';
    const check = entryCheck(findDungeon(data, row.id), daeva);
    const v = VERDICT[check.verdict];
    return `<td data-label="You"><span class="ae-gd-verdict ${v.tone}" data-verdict="${check.verdict}">${esc(v.word)}</span></td>`;
  };
  const you = daeva && Number.isFinite(daeva.level);
  return `<section class="ae-gd-block" aria-labelledby="aeGlanceTitle">
      <h2 class="ae-gd-h2" id="aeGlanceTitle">At a glance</h2>
      <p class="ae-gd-note">Item level is the game's entry gate. Where a dungeon has two difficulties the table shows both, easiest first. Many groups ask for more than the minimum.</p>
      ${you ? `<p class="ae-gd-note" data-guide-you>Checked for <b>${esc(daeva.name ?? 'your Daeva')}</b>, Lv ${esc(daeva.level)}${daeva.itemLevel ? `, item level ${esc(fmt(daeva.itemLevel))} (${esc(daeva.savedAge ?? 'typed')})` : ', item level not typed yet'}.</p>` : ''}
      <table class="ae-gd-table" id="aeDungeonTable">
        <thead><tr><th scope="col">Content</th><th scope="col">Players</th><th scope="col">Entry cycle</th><th scope="col">Main rewards</th><th scope="col">Level</th><th scope="col">Item level</th>${you ? '<th scope="col">You</th>' : ''}</tr></thead>
        <tbody>${rows.map(row => `<tr data-dungeon-row="${esc(row.id)}"${row.status === 'pending' ? ' data-status="pending"' : ''}>
          <th scope="row" data-label="Content"><a href="${esc(row.href)}">${esc(row.name)}</a>${row.category !== row.name ? `<small>${esc(row.category)}</small>` : ''}</th>
          <td data-label="Players">${orPending(row.players)}</td>
          <td data-label="Entry cycle">${orPending(row.cycle)}</td>
          <td data-label="Main rewards" class="ae-gd-reward">${orPending(row.rewards)}</td>
          <td data-label="Level">${row.level ? esc(row.level) : pending('Not listed')}</td>
          <td data-label="Item level">${row.itemLevel ? esc(row.itemLevel) : pending('Not listed')}</td>
          ${checkCell(row)}
        </tr>`).join('')}</tbody>
      </table>
    </section>
    <section class="ae-gd-block" aria-labelledby="aeTypesTitle">
      <h2 class="ae-gd-h2" id="aeTypesTitle">Kinds of content</h2>
      <ul class="ae-gd-cards">${(data.categories ?? []).map(category => `<li class="ae-gd-card" data-category="${esc(category.id)}">
        <h3>${esc(category.name)}</h3>
        <p><b>Players</b> ${esc(category.players)}. <b>Cycle</b> ${esc(category.entryCycle)}.</p>
        <p>${esc(category.mainRewards)}</p>
        <ul class="ae-gd-links">${dungeonRecords(data).filter(record => record.category === category.id).map(record => `<li><a href="${esc(dungeonHref(record.id))}">${esc(record.name)}</a></li>`).join('')}</ul>
      </li>`).join('')}</ul>
      <p class="ae-gd-more"><a class="ae-btn" href="${WEEKLY_HREF}">The weekly loop and reset times</a></p>
    </section>`;
}

/* ---------- One dungeon ---------- */

function factsHtml(record, data) {
  const category = (data.categories ?? []).find(item => item.id === record.category);
  const players = playersText(record.players);
  const zone = record.entrance === 'abyss' ? `<a href="${WORLD_HREF}#abyss">The Abyss</a> (PvP zone)` : record.zone === 'tolbas-forest' ? `<a href="${WORLD_HREF}#tolbas-forest">Tolbas Forest</a>` : null;
  const rows = [
    ['Type', esc(category?.name ?? record.category)],
    ['Players', players ? esc(players) : pending()],
    record.stars ? ['Difficulty', STARS(record.stars)] : null,
    record.mainQuest !== undefined ? ['Main quest', record.mainQuest ? 'On the main quest route' : 'Optional, off the main quest route'] : null,
    zone ? ['Entrance', zone] : null,
    record.seasonal ? ['Runs', 'Seasonal'] : null
  ].filter(Boolean);
  return `<dl class="ae-gd-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function checkPanelHtml(record, daeva) {
  const level = daeva?.level ?? null;
  const itemLevel = daeva?.itemLevel ?? null;
  return `<section class="ae-gd-block ae-gd-check" id="aeEntry" aria-labelledby="aeEntryTitle">
      <h2 class="ae-gd-h2" id="aeEntryTitle">Can you enter?</h2>
      ${daeva ? `<p class="ae-gd-note">For <b>${esc(daeva.name ?? 'your Daeva')}</b>${itemLevel ? `: item level ${esc(fmt(itemLevel))} as you typed it, ${esc(daeva.savedAge ?? 'saved earlier')}. Saved data is not live: change it below if your gear moved on.` : '. Your item level is not typed yet; add it below to check each difficulty.'}</p>` : '<p class="ae-gd-note">Link a Daeva on the Daeva Card for an automatic check, or type a level and item level here.</p>'}
      <form class="ae-gd-check-form" id="aeCheckForm" novalidate>
        <label>Level <input type="number" inputmode="numeric" min="1" max="99" name="level" value="${level ?? ''}" autocomplete="off"></label>
        <label>Item level <input type="number" inputmode="numeric" min="0" max="9999" name="itemLevel" value="${itemLevel ?? ''}" autocomplete="off"></label>
      </form>
      <div id="aeCheckResult" aria-live="polite"></div>
    </section>`;
}

function checkResultHtml(record, values) {
  const check = entryCheck(record, values);
  const v = VERDICT[check.verdict];
  return `<p class="ae-gd-check-line"><span class="ae-gd-verdict ${v.tone}" data-verdict="${check.verdict}">${esc(v.word)}</span> <span data-check-text>${esc(check.text)}</span></p>
    ${check.verdict === 'pending' || check.verdict === 'no-daeva' ? '' : `<ul class="ae-gd-check-list">${check.difficulties.map(row => `<li data-check-diff="${esc(row.id)}" class="${row.open ? 'is-open' : 'is-closed'}${check.aim?.id === row.id ? ' is-aim' : ''}">
      <b>${esc(cap(row.name))}</b>
      <span>${row.levelOk === false ? `Needs Lv ${esc(row.level)}` : row.suggested ? `Suggested item level ${esc(fmt(row.itemLevel))}` : row.itemOk === null ? `Item level ${esc(fmt(row.itemLevel))}: type yours` : row.itemOk === false ? `Item level ${esc(fmt(row.itemLevel))}, ${esc(fmt(row.needsItemLevel))} to go` : 'Open'}</span>
      ${check.aim?.id === row.id ? '<i>Aim next</i>' : ''}
    </li>`).join('')}</ul>`}`;
}

function wireCheck(record) {
  const form = $('#aeCheckForm');
  const out = $('#aeCheckResult');
  if (!form || !out) return;
  const read = () => {
    const level = Number(form.level.value);
    const itemLevel = Number(form.itemLevel.value);
    return { level: form.level.value !== '' && Number.isFinite(level) ? level : null, itemLevel: form.itemLevel.value !== '' && Number.isFinite(itemLevel) ? itemLevel : null };
  };
  const draw = () => { out.innerHTML = checkResultHtml(record, read()); };
  form.addEventListener('input', draw);
  form.addEventListener('submit', event => event.preventDefault());
  draw();
}

function difficultiesHtml(record) {
  const diffs = record.difficulties ?? [];
  if (!diffs.length) return `<section class="ae-gd-block" aria-labelledby="aeDiffTitle"><h2 class="ae-gd-h2" id="aeDiffTitle">How to enter</h2><p>${record.entryPending ? esc(record.entryPending) : pending('Not listed yet.')}</p></section>`;
  const stage = record.category === 'transcendence';
  return `<section class="ae-gd-block" aria-labelledby="aeDiffTitle">
      <h2 class="ae-gd-h2" id="aeDiffTitle">${stage ? 'Stages' : 'Difficulties'}</h2>
      ${record.levelNote ? `<p class="ae-gd-note">${esc(record.levelNote)}</p>` : ''}
      ${record.itemLevelNote ? `<p class="ae-gd-note">${esc(record.itemLevelNote)}</p>` : ''}
      <table class="ae-gd-table is-diff" id="aeDiffTable">
        <thead><tr><th scope="col">${stage ? 'Stage' : 'Difficulty'}</th><th scope="col">Level</th><th scope="col">${diffs.some(item => item.suggested) ? 'Suggested item level' : 'Item level'}</th>${stage ? '<th scope="col">Arcana</th><th scope="col">Effect</th>' : '<th scope="col">Notes</th>'}</tr></thead>
        <tbody>${diffs.map(item => `<tr data-diff="${esc(item.id)}">
          <th scope="row" data-label="${stage ? 'Stage' : 'Difficulty'}">${esc(cap(item.name))}</th>
          <td data-label="Level">${Number.isFinite(item.level ?? record.level) ? esc(item.level ?? record.level) : pending('Not listed')}</td>
          <td data-label="Item level">${Number.isFinite(item.itemLevel) ? `${esc(fmt(item.itemLevel))}${Number.isFinite(item.itemLevelTo) ? ` to ${esc(fmt(item.itemLevelTo))}` : '+'}` : pending()}</td>
          ${stage ? `<td data-label="Arcana">${esc(item.arcanaGrades)}${item.guaranteedUnique ? '<br><b class="ae-gd-hi">One Unique Arcana guaranteed</b>' : ''}</td><td data-label="Effect">${item.effect ? `<b>${esc(item.effect.name)}</b>: ${esc(item.effect.text)}` : 'None'}</td>` : `<td data-label="Notes">${esc(item.note ?? '')}${item.players ? ` ${esc(playersText(item.players))} players.` : ''}</td>`}
        </tr>`).join('')}</tbody>
      </table>
      ${record.rank ? `<p class="ae-gd-note">${esc(record.rank)}</p>` : ''}
      ${record.rotation ? `<p class="ae-gd-note">The dungeon changes each week between ${record.rotation.map(esc).join(' and ')}. Check the in game menu for this week's.</p>` : ''}
    </section>`;
}

function rewardsHtml(record, gearSources) {
  const loot = lootFor(record, gearSources);
  return `<section class="ae-gd-block" aria-labelledby="aeRewardTitle">
      <h2 class="ae-gd-h2" id="aeRewardTitle">What it rewards</h2>
      <p class="ae-gd-reward-focus" data-reward-focus><span class="ae-gd-hi-tag">Why you go</span> ${record.status === 'pending' ? pending(record.rewardFocus ?? 'Pending') : esc(record.rewardFocus ?? 'Pending')}</p>
      ${record.arcanaSlots ? `<p>Arcana slots here: ${record.arcanaSlots.map(slot => `<b class="${record.onlyHere?.includes(slot) ? 'ae-gd-hi' : ''}">${esc(slot)}</b>`).join(', ')}.${record.onlyHere?.length ? ` ${esc(record.onlyHere.join(' and '))} drop only in this dungeon.` : ''}</p>` : ''}
      ${loot ? `<ul class="ae-gd-loot" data-loot>${loot.map(item => `<li${item.grade ? ` data-grade="${esc(String(item.grade).toLowerCase())}"` : ''}><b>${esc(item.name)}</b>${item.slot ? ` <span>${esc(item.slot)}</span>` : ''}${item.level ? ` <span>Lv ${esc(item.level)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${(record.extraRewards ?? []).map(text => `<p>${esc(text)}</p>`).join('')}
      ${record.daevaGauge ? `<p>${esc(record.daevaGauge)}</p>` : ''}
      ${record.category === 'expedition' || record.lootRef ? `<p class="ae-gd-more"><a class="ae-btn" href="${WHERE_HREF}" data-where-link>Where to get each piece of gear</a></p>` : ''}
    </section>`;
}

function cycleHtml(record, data) {
  const cycle = record.cycle;
  if (!cycle) return '';
  const resets = cycle.resets === 'weekly' || cycle.resets === 'daily';
  return `<section class="ae-gd-block" aria-labelledby="aeCycleTitle">
      <h2 class="ae-gd-h2" id="aeCycleTitle">${cycle.resets === 'daily' ? 'Daily cycle' : cycle.resets === 'weekly' ? 'Weekly cycle' : 'How often'}</h2>
      <p>${esc(cycle.text)}</p>
      ${cycle.note ? `<p class="ae-gd-note">${esc(cycle.note)}</p>` : ''}
      ${resets ? `<div class="ae-gd-resets">${resetCardHtml(cycle.resets, data)}</div>` : ''}
    </section>`;
}

function bossesHtml(record) {
  if (!record.bosses?.length) return '';
  const role = { mid: 'Mid boss', final: 'Final boss', mechanic: 'Mechanic' };
  return `<section class="ae-gd-block" aria-labelledby="aeBossTitle">
      <h2 class="ae-gd-h2" id="aeBossTitle">Boss notes</h2>
      ${record.prepare ? `<p class="ae-gd-note">${esc(record.prepare)}</p>` : ''}
      <ol class="ae-gd-bosses">${record.bosses.map(boss => `<li data-boss-role="${esc(boss.role)}"><p><b>${esc(boss.name)}</b> <span class="ae-gd-role">${role[boss.role] ?? ''}</span></p><p>${esc(boss.note)}</p></li>`).join('')}</ol>
      ${record.category === 'expedition' ? '<p class="ae-gd-note">Beat the mid bosses before the final boss: their rewards join the final reward cube.</p>' : ''}
    </section>`;
}

function neighboursHtml(data, record) {
  const list = dungeonRecords(data);
  const i = list.findIndex(item => item.id === record.id);
  const prev = list[i - 1];
  const next = list[i + 1];
  return `<nav class="ae-gd-pager" aria-label="Other dungeons">
      ${prev ? `<a class="ae-btn" href="${esc(dungeonHref(prev.id))}" rel="prev"><span aria-hidden="true">‹</span> ${esc(prev.name)}</a>` : '<span></span>'}
      <a class="ae-btn" href="${GUIDE_DUNGEONS_ROOT}">All dungeons</a>
      ${next ? `<a class="ae-btn" href="${esc(dungeonHref(next.id))}" rel="next">${esc(next.name)} <span aria-hidden="true">›</span></a>` : '<span></span>'}
    </nav>`;
}

function dungeonHtml(record, data, daeva, gearSources) {
  return `<p class="ae-gd-lede">${esc(record.summary)}</p>
    ${record.status === 'pending' ? `<p class="ae-gd-pending-box">${esc(record.entryPending ?? 'Not listed yet.')}</p>` : ''}
    ${factsHtml(record, data)}
    ${checkPanelHtml(record, daeva)}
    ${difficultiesHtml(record)}
    ${rewardsHtml(record, gearSources)}
    ${cycleHtml(record, data)}
    ${bossesHtml(record)}
    ${conflictsHtml(record.conflicts)}
    ${sourcesHtml(record.provenance)}
    ${neighboursHtml(data, record)}`;
}

/* ---------- Weekly loop ---------- */

/** Items that share one rule (every Expedition spends Odyle Energy the same way) show as one row with all their links. */
function sameRule(items) {
  const rows = [];
  for (const item of items) {
    const row = item.text ? rows.find(entry => entry.item.text === item.text) : null;
    if (row) row.all.push(item);
    else rows.push({ item, all: [item] });
  }
  return rows;
}

function weeklyHtml(data) {
  const groups = resetList(data);
  const groupHtml = (key, title, intro) => groups[key].length ? `<section class="ae-gd-block" aria-labelledby="aeLoop-${key}" data-reset-group="${key}">
      <h2 class="ae-gd-h2" id="aeLoop-${key}">${title}</h2>
      <p class="ae-gd-note">${intro}</p>
      <ul class="ae-gd-loop">${sameRule(groups[key]).map(({ item, all }) => `<li data-loop-item="${esc(item.id)}"${item.status === 'pending' ? ' data-status="pending"' : ''}>
        ${all.map(one => `<a href="${esc(one.href)}">${esc(one.name)}</a>`).join('')}
        ${item.perWeek ? `<b class="ae-gd-count">${esc(item.perWeek)} a week</b>` : item.perDay ? `<b class="ae-gd-count">${esc(item.perDay)} a day${item.cap ? `, up to ${esc(item.cap)}` : ''}</b>` : ''}
        <p>${item.text ? esc(item.text) : pending()}</p>
      </li>`).join('')}</ul>
    </section>` : '';
  return `<p class="ae-gd-lede">Everything at Lv 45 that refills on a timer, and how long until it does. All times are UTC.</p>
    <div class="ae-gd-resets is-big" id="aeResets">${resetCardHtml('weekly', data)}${resetCardHtml('daily', data)}</div>
    ${conflictsHtml(data.resets?.conflicts)}
    ${groupHtml('weekly', 'Resets on Wednesday', 'Use what is left before Wednesday 07:00 UTC: unused weekly entries do not carry over.')}
    ${groupHtml('daily', 'Refills every day', 'Daily attempts and keys stack up to a cap. Once full, a new day adds nothing, so spend them before they top out.')}
    ${groupHtml('none', 'Once only', 'These do not reset. Clear each one once.')}
    ${sourcesHtml([...(data.resets?.weekly?.provenance ?? []), ...(data.resets?.daily?.provenance ?? [])])}`;
}

/* ---------- World ---------- */

const WORLD_GROUPS = [
  { kind: 'zone', title: 'Zones' },
  { kind: 'exploration', title: 'Sealed Dungeons and Strongholds' },
  { kind: 'abyss', title: 'The Abyss' },
  { kind: 'rift', title: 'Crossing to the other faction' },
  { kind: 'event', title: 'Events' }
];

function worldHtml(world, data) {
  const records = world.records ?? [];
  return `<p class="ae-gd-lede">Where things are in AION 2: the zones, the Abyss, the exploration spots on the map and the timed events.</p>
    ${WORLD_GROUPS.map(group => {
      const list = records.filter(record => record.kind === group.kind);
      if (!list.length) return '';
      return `<section class="ae-gd-block" aria-labelledby="aeWorld-${group.kind}">
        <h2 class="ae-gd-h2" id="aeWorld-${group.kind}">${esc(group.title)}</h2>
        <ul class="ae-gd-cards">${list.map(record => `<li class="ae-gd-card" id="${esc(record.id)}" data-world="${esc(record.id)}"${record.status === 'pending' ? ' data-status="pending"' : ''}>
          <h3>${esc(record.name)}${record.status === 'pending' ? ` ${pending()}` : ''}</h3>
          ${record.region ? `<p class="ae-gd-where">${esc(record.region)}</p>` : ''}
          <p>${esc(record.text)}</p>
          ${record.dungeons?.length ? `<ul class="ae-gd-links">${record.dungeons.map(id => findDungeon(data, id)).filter(Boolean).map(item => `<li><a href="${esc(dungeonHref(item.id))}">${esc(item.name)}</a></li>`).join('')}</ul>` : ''}
          ${sourcesHtml(record.provenance)}
        </li>`).join('')}</ul>
      </section>`;
    }).join('')}`;
}

/* ---------- Pages ---------- */

const GUIDES_CRUMB = { label: 'Guides', href: `${GUIDE_ROOT}guides/` };
const DUNGEONS_CRUMB = { label: 'Dungeons', href: GUIDE_DUNGEONS_ROOT };

startGuidePage(async linked => {
  const page = document.body.dataset.guidePage;
  const daeva = daevaOf(linked);
  if (page === 'world') {
    const [world, data] = await Promise.all([getJson('world.json'), getJson('dungeons.json')]);
    renderGuideShell({ section: 'world', title: 'World', crumbs: [{ label: 'World' }] }).insertAdjacentHTML('beforeend', worldHtml(world, data));
    return;
  }
  const data = await getJson('dungeons.json');
  if (page === 'weekly') {
    renderGuideShell({ section: 'guides', title: 'The weekly loop', crumbs: [GUIDES_CRUMB, { label: 'Weekly loop' }] }).insertAdjacentHTML('beforeend', weeklyHtml(data));
    startCountdowns(data);
    return;
  }
  if (page === 'dungeon') {
    const record = findDungeon(data, document.body.dataset.dungeon);
    if (!record) throw new Error(`No dungeon ${document.body.dataset.dungeon}`);
    const gearSources = await getJson('gear-sources.json', true);
    renderGuideShell({ section: 'guides', title: record.name, crumbs: [GUIDES_CRUMB, DUNGEONS_CRUMB, { label: record.name }] }).insertAdjacentHTML('beforeend', dungeonHtml(record, data, daeva, gearSources));
    wireCheck(record);
    startCountdowns(data);
    return;
  }
  renderGuideShell({ section: 'guides', title: 'Dungeons', crumbs: [GUIDES_CRUMB, { label: 'Dungeons' }], lede: 'Every dungeon and repeatable run in AION 2: who can go, how often, what it gives and the item level it asks for.' }).insertAdjacentHTML('beforeend', overviewHtml(data, daeva));
});
