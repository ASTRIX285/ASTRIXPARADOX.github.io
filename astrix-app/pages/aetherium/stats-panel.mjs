/**
 * The Gear page's Stats section (The Aetherium): the 6 main and 10 deity stats as tiles, each with this Daeva's points,
 * the official effect line (the game's own words from the character data) and a High, Useful or Low tag for the class.
 * Tap a tile for what it does, why it matters for this class, where points come from and what to look for on gear.
 * The explanations come from data/advisor/stats.json; the official line always wins for the player's own numbers.
 */
import { loadMainBuilds } from './aetherium-data.mjs';
import { $, esc, infoCardHtml, number, openInfo } from './aetherium-ui.mjs';
import { AION2_CLASSES } from '/astrix-app/games/aion2/engine/ascent-advisor.mjs';
import { boardSources, classesWanting, indexStats, mostlyLow, rankPointStats, statReason } from '/astrix-app/games/aion2/engine/stat-advisor.mjs';

const TAG_WORD = { high: 'High', useful: 'Useful', low: 'Low' };
const SOURCE_WORDS = { weapon: 'weapons', armour: 'armour', accessory: 'accessories' };
const panel = { stats: null, rank: null, build: null, className: null, live: [], boards: [], mainBuilds: null };

const notConfirmed = test => `<span class="ae-tag is-unconfirmed">Not confirmed yet</span>${test ? ` <span class="ae-tag-test">Check: ${esc(test)}</span>` : ''}`;
const listWords = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const liveOf = stat => panel.live.find(row => row.type === stat.type) ?? { value: 0, effects: [] };
/** The effect line on a tile: the game's own words when the data sends them, else what one point gives, from our record. */
const effectLine = stat => {
  const row = liveOf(stat);
  return row.effects.length ? row.effects.join(', ') : `Each point: ${stat.effects.value.map(name => `${name} +${stat.perPoint.value}%`).join(', ')}`;
};

function tileHtml(stat) {
  const row = liveOf(stat);
  const rank = panel.rank?.[stat.id] ?? null;
  const tag = rank ? `<span class="ae-stat-tag is-${rank.tag}" data-stat-tag="${rank.tag}">${TAG_WORD[rank.tag]}</span>` : '';
  return `<div class="ae-stat" data-stat="${esc(stat.id)}"${rank ? ` data-tag="${rank.tag}"` : ''}>
      <dt><button type="button" class="ae-stat-open" data-stat-open="${esc(stat.id)}" aria-haspopup="dialog">${esc(stat.name)}</button>${tag}
        <span class="ae-stat-effect${row.effects.length ? ' is-official' : ''}">${esc(effectLine(stat))}</span></dt>
      <dd>${number(row.value)}</dd>
    </div>`;
}

/** Fills the Stats section. stats: stats.json; build: the class's main build (null when it has none). */
export function renderStatsPanel({ model, stats, build, boards }) {
  Object.assign(panel, { stats: indexStats(stats), build, className: model.profile.class, live: model.stats, boards: boards ?? [] });
  panel.rank = rankPointStats(build, panel.stats);
  $('#aeStats').innerHTML = panel.stats.main.map(tileHtml).join('');
  $('#aeDeity').innerHTML = panel.stats.deity.map(tileHtml).join('');
  $('#aeStatsLow').hidden = !mostlyLow(model.stats, panel.stats);
  $('#aeStatsOrder').hidden = Boolean(panel.rank);
  $('#aeStatsNone').hidden = model.stats.length > 0;
  $('#aeStatsPanel').addEventListener('click', event => {
    const open = event.target.closest('[data-stat-open]');
    if (open) openStat(open.dataset.statOpen, open).catch(error => console.error(error));
  });
}

async function openStat(id, from) {
  const stat = panel.stats.byId.get(id);
  const row = liveOf(stat);
  const rank = panel.rank?.[id] ?? null;
  panel.mainBuilds ??= await loadMainBuilds(AION2_CLASSES).catch(() => ({}));
  const others = rank ? classesWanting(id, panel.mainBuilds, panel.stats, panel.className) : [];
  const does = stat.effects.value.map(name => {
    const combat = panel.stats.combatByName.get(name);
    const cap = combat?.cap ? ` It tops out at ${combat.cap.value}%. ${combat.cap.status === 'confirmed' ? '' : notConfirmed('Check the cap in the stat window tooltip.')}` : '';
    return `<li><b>${esc(name)}</b>: ${esc(combat?.meaning.value ?? '')}${cap}</li>`;
  }).join('');
  const sources = stat.from.value.map(source => panel.stats.byId.get(source)).filter(Boolean);
  const where = stat.kind === 'main'
    ? `<li>Sub stat lines on ${esc(listWords(stat.from.value.map(source => SOURCE_WORDS[source] ?? source)))}.</li>${panel.stats.rules.map(rule => `<li>${esc(rule.text)}</li>`).join('')}`
    : sources.map(source => `<li><b>${esc(source.label)}</b>: ${esc(source.text ?? '')}</li>`).join('');
  const boards = boardSources(stat, panel.boards, panel.stats);
  const boardLine = boards.length ? `<li>Daevanion: ${esc(listWords(boards.map(board => `${board.name} nodes (${board.names.join(', ')})`)))}.</li>` : '';
  const look = stat.kind === 'main'
    ? `Look for ${stat.name} lines on ${listWords(stat.from.value.map(source => SOURCE_WORDS[source] ?? source))}.`
    : `Look for ${stat.name} on Arcana and the Abyssal Bracelet.`;
  const lines = row.effects.length ? row.effects : [];
  openInfo(infoCardHtml({
    title: stat.name,
    sub: `${stat.kind === 'main' ? 'Main stat' : 'Deity stat'} · ${number(row.value)} ${row.value === 1 ? 'point' : 'points'}`,
    status: rank ? [rank.tag === 'low' ? 'lock' : rank.tag === 'high' ? 'go' : 'keep', `${TAG_WORD[rank.tag]} for ${panel.className}`] : null,
    body: `
      ${lines.length ? `<div class="ae-item-block"><p class="ae-item-sec">Your points give</p><ul class="ae-odds-list">${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul></div>` : ''}
      <div class="ae-item-block"><p class="ae-item-sec">What it does</p><p class="ae-card-line">Each point gives ${esc(stat.perPoint.value)}% to each of these.</p><ul class="ae-odds-list">${does}</ul></div>
      <div class="ae-item-block"><p class="ae-item-sec">For ${esc(panel.className)}</p><p class="ae-card-line" data-stat-reason>${esc(rank ? statReason(stat, rank, panel.className, others) : `No stat order for ${panel.className} yet, so this shows what the stat does only.`)}</p></div>
      <div class="ae-item-block"><p class="ae-item-sec">Where points come from ${stat.from.status === 'confirmed' ? '' : notConfirmed('Check the sub stat lines on your gear and your Arcana in game.')}</p><ul class="ae-odds-list">${where}${boardLine}</ul></div>
      <div class="ae-item-block"><p class="ae-item-sec">On your gear</p><p class="ae-card-line">${esc(look)}</p></div>`
  }), from);
}
