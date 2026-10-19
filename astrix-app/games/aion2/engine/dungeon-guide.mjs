/**
 * The Guide's dungeons for AION 2 (The Aetherium, phase 4): the overview table, a dungeon's entry check for a Daeva,
 * the difficulty to aim for next, everything that resets and the countdown to the next reset. Pure functions, no
 * network and no storage: the page passes in the data, the Daeva's level and typed item level, and the time.
 *
 * Data it reads:
 *   dungeons.json: resets (weekly and daily, UTC), categories (the at a glance rows) and records (one per dungeon:
 *   difficulties with level and item level, players, cycle, reward focus, boss notes, status and provenance).
 *   gear-sources.json (phase 3, optional): loot for a dungeon, found by the record's lootRef.
 * A level or item level of null means the source gives none: the page says pending, never a guess.
 */

const HOUR = 3600000;
const DAY = 24 * HOUR;
const listOf = value => (Array.isArray(value) ? value : []);
const known = value => Number.isFinite(value) && value >= 0;

export const GUIDE_DUNGEONS_ROOT = '/hub/aetherium/guide/dungeons/';
export const dungeonHref = id => `${GUIDE_DUNGEONS_ROOT}${id}/`;

/** The records in the data's order. */
export const dungeonRecords = data => listOf(data?.records).slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export const findDungeon = (data, id) => listOf(data?.records).find(record => record?.id === id) ?? null;

/** "1 to 5", "2 to 5", "1", "8", or null when the source gives no count. */
export function playersText(players) {
  if (!players || !Number.isFinite(players.min)) return null;
  return players.max && players.max !== players.min ? `${players.min} to ${players.max}` : String(players.min);
}

/** The lowest level and item level any difficulty of a dungeon asks for (record values first). Null when not known. */
export function entryOf(record) {
  const diffs = listOf(record?.difficulties);
  const levels = [record?.level, ...diffs.map(item => item.level)].filter(known);
  const items = [record?.itemLevel, ...diffs.filter(item => !item.suggested).map(item => item.itemLevel)].filter(known);
  return { level: levels.length ? Math.min(...levels) : null, itemLevel: items.length ? Math.min(...items) : null };
}

const fmt = value => (known(value) ? value.toLocaleString('en-GB') : null);

/** Entry level and item level in words for the overview table: per difficulty when they differ. */
export function entryText(record) {
  const diffs = listOf(record?.difficulties).filter(item => !item.suggested);
  const levelOf = item => (known(item.level) ? item.level : record.level);
  const itemOf = item => (known(item.itemLevel) ? item.itemLevel : record.itemLevel);
  const levels = [...new Set(diffs.map(levelOf).filter(known))];
  const items = [...new Set(diffs.map(itemOf).filter(known))];
  const level = levels.length > 1 ? diffs.map(levelOf).map(fmt).join(' / ') : fmt(levels[0] ?? record?.level);
  const itemLevel = items.length > 1 ? diffs.map(itemOf).map(fmt).join(' / ') : fmt(items[0] ?? record?.itemLevel);
  return { level, itemLevel };
}

/** The at a glance rows: one per dungeon, in order, with its category's entry cycle. */
export function overviewRows(data) {
  const categories = new Map(listOf(data?.categories).map(item => [item.id, item]));
  return dungeonRecords(data).map(record => {
    const category = categories.get(record.category) ?? null;
    const entry = entryText(record);
    return {
      id: record.id,
      name: record.name,
      href: dungeonHref(record.id),
      category: category?.name ?? record.category,
      players: playersText(record.players) ?? category?.players ?? null,
      cycle: category?.entryCycle ?? null,
      rewards: record.rewardFocus ?? category?.mainRewards ?? null,
      level: entry.level,
      itemLevel: entry.itemLevel,
      status: record.status
    };
  });
}

/**
 * Can this Daeva enter a dungeon, and which difficulty next? { verdict, difficulties, aim, text }
 *   verdict: 'open' (some difficulty is open), 'level' (level too low), 'item-level' (item level too low),
 *   'unknown' (level fine, item level not typed), 'pending' (the source gives no gate) or 'no-daeva'.
 *   difficulties: each with levelOk, itemOk (null when the item level is not known) and open.
 *   aim: the difficulty to aim for next: the first one not open yet, with what it still needs.
 * A suggested item level (Nightmare) is not a gate: it only steers the aim.
 */
export function entryCheck(record, { level = null, itemLevel = null } = {}) {
  const hasLevel = known(level);
  const hasItem = known(itemLevel);
  const diffs = listOf(record?.difficulties).length ? listOf(record.difficulties) : [{ id: 'entry', name: 'Entry', level: record?.level, itemLevel: record?.itemLevel }];
  const rows = diffs.map(item => {
    const needLevel = known(item.level) ? item.level : known(record?.level) ? record.level : null;
    const needItem = known(item.itemLevel) ? item.itemLevel : null;
    const levelOk = needLevel === null ? true : hasLevel ? level >= needLevel : null;
    const itemOk = needItem === null || item.suggested ? true : hasItem ? itemLevel >= needItem : null;
    return { id: item.id, name: item.name, level: needLevel, itemLevel: needItem, suggested: Boolean(item.suggested), levelOk, itemOk, open: levelOk === true && itemOk === true,
      needsLevel: needLevel !== null && hasLevel ? Math.max(0, needLevel - level) : null,
      needsItemLevel: needItem !== null && hasItem ? Math.max(0, needItem - itemLevel) : null };
  });
  const noGate = rows.every(row => row.level === null && row.itemLevel === null);
  const aim = rows.find(row => !row.open && row.levelOk !== false) ?? rows.find(row => !row.open) ?? null;
  let verdict;
  if (record?.status === 'pending' || noGate) verdict = 'pending';
  else if (!hasLevel) verdict = 'no-daeva';
  else if (rows.some(row => row.open)) verdict = 'open';
  else if (rows.every(row => row.levelOk === false)) verdict = 'level';
  else if (rows.some(row => row.levelOk === true && row.itemOk === null)) verdict = 'unknown';
  else verdict = 'item-level';
  return { verdict, difficulties: rows, aim: verdict === 'pending' ? null : aim, text: checkText(record, verdict, rows, aim, { level, itemLevel }) };
}

function checkText(record, verdict, rows, aim, { level, itemLevel }) {
  const name = record?.name ?? 'This dungeon';
  if (verdict === 'pending') return `${name} has no entry level or item level in any source yet: pending.`;
  if (verdict === 'no-daeva') return 'Link a Daeva to check whether you can enter.';
  if (verdict === 'level') {
    const lowest = Math.min(...rows.map(row => row.level).filter(known));
    return `Not yet: ${name} opens at Lv ${lowest}. You are Lv ${level}.`;
  }
  if (verdict === 'unknown') return `Your level is enough. Type your item level to see which difficulty you can enter.`;
  if (verdict === 'item-level') {
    const first = rows.find(row => row.levelOk === true && row.needsItemLevel > 0);
    return first ? `Not yet: ${first.name} needs item level ${fmt(first.itemLevel)}. You have ${fmt(itemLevel)}, ${fmt(first.needsItemLevel)} to go.` : `Not yet.`;
  }
  const suggested = rows.filter(row => row.suggested);
  if (suggested.length) {
    const fits = known(itemLevel) ? suggested.filter(row => row.itemLevel !== null && itemLevel >= row.itemLevel).at(-1) : null;
    if (fits) return `You can enter. At item level ${fmt(itemLevel)} you are ready for ${fits.name} (suggested from item level ${fmt(fits.itemLevel)}).`;
    return known(itemLevel) ? `You can enter. Your item level is below every suggestion, so start with ${suggested[0].name} at challenge level 1.` : `You can enter. Type your item level to see which bosses suit you.`;
  }
  const open = rows.filter(row => row.open).map(row => row.name);
  const openText = open.length ? `You can enter ${open.join(' and ')}.` : 'You can enter.';
  if (!aim) return `${openText} Every difficulty is open to you.`;
  if (aim.levelOk === false) return `${openText} ${aim.name} opens at Lv ${aim.level}.`;
  if (aim.needsItemLevel > 0) return `${openText} Aim next for ${aim.name}: item level ${fmt(aim.itemLevel)}, ${fmt(aim.needsItemLevel)} to go.`;
  if (aim.itemOk === null) return `${openText} Type your item level to check ${aim.name} (item level ${fmt(aim.itemLevel)}).`;
  return openText;
}

/* Resets. The data's resets win; Wednesday (3) 07:00 UTC weekly and 07:00 UTC daily are Miguel's ruling. */
function resetRule(data) {
  const r = data?.resets ?? {};
  return {
    weekday: Number.isInteger(r.weekly?.day) ? r.weekly.day : 3,
    weeklyHour: Number.isFinite(r.weekly?.hourUtc) ? r.weekly.hourUtc : 7,
    dailyHour: Number.isFinite(r.daily?.hourUtc) ? r.daily.hourUtc : 7
  };
}

/** The next reset strictly after now (a Date or ms) for 'weekly' or 'daily', as ms since 1970 (UTC). */
export function nextReset(now, cycle, data = null) {
  const t = +now;
  const rule = resetRule(data);
  const day = new Date(t);
  const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  if (cycle === 'weekly') {
    let at = base + ((rule.weekday - day.getUTCDay() + 7) % 7) * DAY + rule.weeklyHour * HOUR;
    if (at <= t) at += 7 * DAY;
    return at;
  }
  let at = base + rule.dailyHour * HOUR;
  if (at <= t) at += DAY;
  return at;
}

/** Time left until a moment: { ms, days, hours, minutes, seconds, text } where text reads "2d 4h 05m". */
export function countdown(now, until) {
  const ms = Math.max(0, +until - +now);
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  const text = days ? `${days}d ${hours}h ${pad(minutes)}m` : `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return { ms, days, hours, minutes, seconds, text };
}

const CYCLE_ORDER = { weekly: 0, daily: 1, none: 2 };

/** Everything that resets, grouped: { weekly: [...], daily: [...], none: [...] }, each { id, name, href, cycle, text, status }. */
export function resetList(data) {
  const groups = { weekly: [], daily: [], none: [] };
  for (const record of dungeonRecords(data)) {
    const cycle = record.cycle ?? null;
    const key = cycle?.resets === 'weekly' || cycle?.resets === 'daily' ? cycle.resets : 'none';
    groups[key].push({ id: record.id, name: record.name, href: dungeonHref(record.id), kind: cycle?.kind ?? null, text: cycle?.text ?? null, perWeek: cycle?.perWeek ?? null, perDay: cycle?.perDay ?? null, cap: cycle?.cap ?? null, status: record.status === 'pending' ? 'pending' : cycle?.status ?? record.status });
  }
  return groups;
}

export const cycleOrder = key => CYCLE_ORDER[key] ?? 9;

/**
 * Loot for a dungeon from phase 3's gear-sources.json, when that file exists. It accepts records keyed by
 * source, sourceId or dungeon, or a sources map. Returns a list of { name, slot, grade, level } or null.
 */
export function lootFor(record, gearSources) {
  if (!record?.lootRef || !gearSources) return null;
  const id = record.lootRef;
  const byMap = gearSources.sources && !Array.isArray(gearSources.sources) ? gearSources.sources[id] : null;
  const rows = byMap ? listOf(byMap.items ?? byMap.loot ?? byMap) : listOf(gearSources.records).filter(item => [item?.source, item?.sourceId, item?.dungeon, item?.id].includes(id)).flatMap(item => listOf(item.items ?? item.loot ?? [item]));
  const items = rows.filter(item => item && typeof item.name === 'string').map(item => ({ name: item.name, slot: item.slot ?? item.type ?? null, grade: item.grade ?? null, level: item.level ?? item.itemLevel ?? null }));
  return items.length ? items : null;
}
