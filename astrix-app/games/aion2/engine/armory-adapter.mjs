/**
 * AION 2 armory adapter (The Aetherium).
 *
 * Pure functions that turn raw NCSOFT armory responses (character info, equipment,
 * equipped item detail, Daevanion board detail) into the one normalised character
 * model in schema/character.schema.json. No network calls: the caller fetches
 * (through the armory Worker) and passes the parsed JSON in.
 *
 * Nothing is guessed. A value the armory does not send comes out as
 * { pending: true, reason }.
 */

export const ITEM_LEVEL_LABEL = '아이템레벨';
export const SKILL_CATEGORIES = Object.freeze(['Active', 'Passive', 'Dp']);

const pending = reason => ({ pending: true, reason });
const icon = value => (typeof value === 'string' && value.startsWith('https://') ? value : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireShape(value, key, what) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    throw new TypeError(`${what} response has no ${key}; the armory shape changed.`);
  }
}

/** Race ids the official data uses: 1 Elyos, 2 Asmodian. The name ("Asmodians" in the data) is only the fallback. */
const RACES = Object.freeze({ 1: 'Elyos', 2: 'Asmodian' });
function raceOf(profile) {
  if (Object.hasOwn(RACES, profile.raceId)) return RACES[profile.raceId];
  return /^asmodian/i.test(String(profile.raceName ?? '')) ? 'Asmodian' : 'Elyos';
}

function titleEffects(info, titleId) {
  const title = (info.title?.titleList ?? []).find(entry => entry.id === titleId);
  return title ? [...(title.equipStatList ?? []), ...(title.statList ?? [])].map(line => line?.desc).filter(desc => typeof desc === 'string' && desc !== '') : [];
}

/** Profile block from /api/character/info. Item level comes from the untranslated stat row. */
export function adaptProfile(info) {
  requireShape(info, 'profile', 'Character info');
  const p = info.profile;
  const itemLevelRow = (info.stat?.statList ?? []).find(row => row.name === ITEM_LEVEL_LABEL);
  return {
    name: p.characterName,
    class: p.className,
    level: p.characterLevel,
    raceName: raceOf(p),
    raceId: Object.hasOwn(RACES, p.raceId) ? p.raceId : (raceOf(p) === 'Asmodian' ? 2 : 1),
    server: { id: p.serverId, name: p.serverName },
    characterId: p.characterId,
    portrait: icon(p.profileImage),
    // The legion, as the official character page shows it beside the server. The data names it regionName and sends
    // an empty string for a Daeva with no legion (ENDPOINTS.md, 12 Oct 2026); that comes out as null.
    legion: typeof p.regionName === 'string' && p.regionName.trim() ? p.regionName.trim() : null,
    title: p.titleName ?? null,
    titleGrade: p.titleGrade ?? null,
    // The worn title's effects, when the owned-title list carries it (its equip and owned lines, as the site words them).
    titleEffects: titleEffects(info, p.titleId),
    combatPower: p.combatPower,
    itemLevel: Number.isFinite(itemLevelRow?.value)
      ? itemLevelRow.value
      : pending('The armory sent no item level row for this character.')
  };
}

/**
 * Gear from /api/character/equipment, one entry per known slot.
 * @param slots   Gear slot records (data/gear-slots.json): { slotPos, slotPosName, listed }. A slot with listed false
 *                (accessories, runes, Arcana) is only in the gear when worn: the site never sends it empty.
 * @param items   Optional map of slotPos to the /api/character/equipment/item response.
 *                maxEnchant and manastoneSlots come only from that detail call.
 */
export function adaptGear(equipment, slots, items = {}) {
  requireShape(equipment, 'equipment', 'Equipment');
  const worn = new Map((equipment.equipment.equipmentList ?? []).map(item => [item.slotPos, item]));
  const listed = slots.filter(slot => slot.listed !== false);
  const known = new Set(listed.map(slot => slot.slotPos));
  const names = new Map(slots.map(slot => [slot.slotPos, slot.slotPosName]));
  const entry = (slotPos, slotPosName, item) => {
    if (!item) return { slot: slotPosName, slotPos, empty: true };
    const detail = items[slotPos];
    const sameItem = detail && detail.id === item.id;
    return {
      slot: slotPosName,
      slotPos,
      empty: false,
      itemId: item.id,
      name: item.name,
      icon: icon(item.icon),
      grade: item.grade,
      enchant: item.enchantLevel,
      // Exceed level (the official page's step past the enchant cap). Sent on every worn item, 0 when none.
      exceed: Number.isFinite(item.exceedLevel) ? item.exceedLevel : 0,
      maxEnchant: sameItem && Number.isFinite(detail.maxEnchantLevel)
        ? detail.maxEnchantLevel
        : pending('Max enchant comes from the item detail call, which has not been read for this slot.'),
      manastoneSlots: sameItem && Number.isFinite(detail.magicStoneSlotCount)
        ? detail.magicStoneSlotCount
        : pending('Manastone slot count comes from the item detail call, which has not been read for this slot.')
    };
  };
  const gear = listed.map(slot => entry(slot.slotPos, slot.slotPosName, worn.get(slot.slotPos)));
  // A worn item in a slot the catalogue does not list yet (for example an accessory) is kept, never dropped.
  for (const [slotPos, item] of worn) {
    if (!known.has(slotPos)) gear.push(entry(slotPos, item.slotPosName ?? names.get(slotPos), item));
  }
  return gear;
}

/** The six main stats by the data's type code. The other point stats in the list are the ten deity stats. */
export const MAIN_STAT_TYPES = Object.freeze(['STR', 'DEX', 'INT', 'CON', 'AGI', 'WIS']);

/**
 * The 6 main and 10 deity stats from /api/character/info, without the item level row (that is profile.itemLevel).
 * effects is the game's own statSecondList: what this character's points give ('Attack increase +1.5%'). The site
 * sends null for a stat at 0 points, which comes out as an empty list.
 */
export function adaptStats(info) {
  requireShape(info, 'stat', 'Character info');
  return (info.stat.statList ?? [])
    .filter(row => row.name !== ITEM_LEVEL_LABEL && row.type !== 'ItemLevel')
    .map(row => ({
      type: row.type,
      name: row.name,
      value: row.value,
      kind: MAIN_STAT_TYPES.includes(row.type) ? 'main' : 'deity',
      effects: Array.isArray(row.statSecondList) ? row.statSecondList.filter(line => typeof line === 'string' && line.trim()) : []
    }));
}

/** One worn item from /api/character/equipment/item, for the item detail card. */
export function adaptItemDetail(detail) {
  requireShape(detail, 'id', 'Item detail');
  const stat = row => ({ name: row.name, value: row.value, ...(row.extra && row.extra !== '0' ? { extra: row.extra } : {}) });
  return {
    id: detail.id,
    name: detail.name,
    icon: icon(detail.icon),
    grade: detail.grade,
    category: detail.categoryName ?? null,
    level: detail.level ?? null,
    enchant: detail.enchantLevel,
    maxEnchant: Number.isFinite(detail.maxEnchantLevel) ? detail.maxEnchantLevel : pending('The armory sent no max enchant for this item.'),
    manastoneSlots: Number.isFinite(detail.magicStoneSlotCount) ? detail.magicStoneSlotCount : pending('The armory sent no manastone slot count for this item.'),
    soulBindRate: detail.soulBindRate ?? null,
    mainStats: (detail.mainStats ?? []).map(stat),
    subStats: (detail.subStats ?? []).map(stat),
    sources: detail.sources ?? [],
    equipLevel: Number.isFinite(detail.equipLevel) ? detail.equipLevel : null,
    classes: detail.classNames ?? [],
    // Skill perks rolled on the item (a skill and its +level), and how many it can hold.
    skillPerks: (detail.subSkills ?? []).map(perk => ({ name: perk.name, level: perk.level, icon: icon(perk.icon) })),
    skillPerkSlots: Number.isFinite(detail.subSkillCountMax) ? detail.subSkillCountMax : 0,
    bonusStatSlots: Number.isFinite(detail.subStatCount) ? detail.subStatCount : 0,
    bonusStatsRandom: Boolean(detail.subStatRandom),
    appearance: detail.costumes?.[0] ?? null,
    description: typeof detail.desc === 'string' && detail.desc.trim() ? detail.desc.trim() : null
  };
}

/** Character search rows from the armory search. Names arrive wrapped in highlight tags. */
export function adaptSearch(search) {
  requireShape(search, 'list', 'Character search');
  return (search.list ?? []).map(row => ({
    name: String(row.name).replace(/<\/?strong>/g, ''),
    characterId: decodeURIComponent(row.characterId),
    serverId: row.serverId,
    serverName: row.serverName,
    level: row.level,
    portrait: row.profileImageUrl ? `https://profileimg.plaync.com${row.profileImageUrl}` : null
  }));
}

/** All class skills from /api/character/equipment. Category Dp is a stigma. */
export function adaptSkills(equipment) {
  requireShape(equipment, 'skill', 'Equipment');
  return (equipment.skill.skillList ?? []).map(skill => {
    if (!SKILL_CATEGORIES.includes(skill.category)) {
      throw new TypeError(`Skill ${skill.id} has unknown category ${skill.category}; the armory shape changed.`);
    }
    return {
      id: skill.id,
      name: skill.name,
      icon: icon(skill.icon),
      category: skill.category,
      needLevel: skill.needLevel,
      skillLevel: skill.skillLevel,
      acquired: skill.acquired === 1,
      equipped: skill.equip === 1
    };
  });
}

/** Daevanion board summary from /api/character/info. */
export function adaptDaevanion(info) {
  requireShape(info, 'daevanion', 'Character info');
  return (info.daevanion.boardList ?? []).map(board => ({
    id: board.id,
    name: board.name,
    icon: icon(board.icon),
    open: board.open === 1,
    nodesTaken: board.openNodeCount,
    nodesTotal: board.totalNodeCount,
    // The official page's percent complete for the board; null when the data sends none.
    percent: Number.isFinite(board.openPercent) ? board.openPercent : null
  }));
}

/** Daevanion progress over every board in the data, by nodes taken, as a whole percent. null with no nodes. */
export function daevanionPercent(boards) {
  const total = (boards ?? []).reduce((sum, board) => sum + (Number.isFinite(board.nodesTotal) ? board.nodesTotal : 0), 0);
  const taken = (boards ?? []).reduce((sum, board) => sum + (Number.isFinite(board.nodesTaken) ? board.nodesTaken : 0), 0);
  return total > 0 ? Math.round((taken / total) * 100) : null;
}

/** Node grid of one board from /api/character/daevanion/detail. Empty grid cells and blank effect lines (the Start node) are skipped. */
export function adaptDaevanionBoard(detail) {
  requireShape(detail, 'nodeList', 'Daevanion detail');
  return detail.nodeList
    .filter(node => node.type !== 'None')
    .map(node => ({
      nodeId: node.nodeId,
      boardId: node.boardId,
      row: node.row,
      col: node.col,
      type: node.type,
      grade: node.grade,
      name: node.name,
      taken: node.open === 1,
      effects: (node.effectList ?? []).map(effect => effect.desc).filter(desc => typeof desc === 'string' && desc !== '')
    }));
}

/** The title categories in the official page's order. equipCategory is the data's own code. */
export const TITLE_CATEGORIES = Object.freeze([
  { id: 'attack', code: 'Attack' },
  { id: 'defense', code: 'Defense' },
  { id: 'other', code: 'Etc' }
]);
const descs = list => (Array.isArray(list) ? list.map(line => line?.desc).filter(desc => typeof desc === 'string' && desc.trim()).map(desc => desc.trim()) : []);

/**
 * Titles from /api/character/info (info.title). One entry per category: owned of total, and the title worn in that
 * category with its two effect lists as the data sends them (equipStatList as effect, statList as alsoGives).
 * A category the data does not send is left out, never shown as 0. Pending when the data has no title block.
 */
export function adaptTitles(info) {
  const block = info?.title;
  if (!block || !Array.isArray(block.titleList)) return pending('The official data sent no title list for this character.');
  const categories = TITLE_CATEGORIES.map(category => {
    const entry = block.titleList.find(item => item?.equipCategory === category.code);
    if (!entry) return null;
    return {
      id: category.id,
      code: category.code,
      owned: Number.isFinite(entry.ownedCount) ? entry.ownedCount : null,
      total: Number.isFinite(entry.totalCount) ? entry.totalCount : null,
      percent: Number.isFinite(entry.ownedPercent) ? entry.ownedPercent : null,
      worn: Number.isFinite(entry.id) && typeof entry.name === 'string' && entry.name.trim()
        ? { id: entry.id, name: entry.name.trim(), grade: entry.grade ?? null, effect: descs(entry.equipStatList), alsoGives: descs(entry.statList) }
        : null
    };
  }).filter(Boolean);
  return {
    owned: Number.isFinite(block.ownedCount) ? block.ownedCount : null,
    total: Number.isFinite(block.totalCount) ? block.totalCount : null,
    categories
  };
}

/** The five Arcana slots (Arcana1 to Arcana5 in the slot list), each the gear entry when worn, else empty. */
export function arcanaSlots(gear, slots) {
  return slots.filter(slot => /^Arcana\d$/.test(slot.slotPosName)).map(slot => gear.find(entry => entry.slotPos === slot.slotPos && !entry.empty)
    ?? { slot: slot.slotPosName, slotPos: slot.slotPos, empty: true });
}

/**
 * Appearance from /api/character/equipment: gear skins (equipment.skinList) and the wing skin (petwing.wingSkin).
 * Only what the data sends; an empty list and no wing skin means nothing to show.
 */
export function adaptAppearance(equipment) {
  const skins = (equipment?.equipment?.skinList ?? []).filter(skin => skin && typeof skin.name === 'string').map(skin => ({
    slot: skin.slotPosName ?? null,
    slotPos: skin.slotPos ?? null,
    itemId: skin.id,
    name: skin.name,
    icon: icon(skin.icon),
    grade: skin.grade ?? null
  }));
  const wing = equipment?.petwing?.wingSkin;
  return {
    skins,
    wingSkin: wing && typeof wing.name === 'string' ? { id: wing.id, name: wing.name, icon: icon(wing.icon), grade: wing.grade ?? null } : null
  };
}

export function adaptPetWing(equipment) {
  const petwing = equipment?.petwing ?? {};
  return {
    pet: petwing.pet
      ? { id: petwing.pet.id, name: petwing.pet.name, icon: icon(petwing.pet.icon), level: petwing.pet.level }
      : pending('The armory sent no equipped pet.'),
    wings: petwing.wing
      ? { id: petwing.wing.id, name: petwing.wing.name, icon: icon(petwing.wing.icon), grade: petwing.wing.grade, enchant: petwing.wing.enchantLevel }
      : pending('The armory sent no equipped wings.')
  };
}

/**
 * The whole character model.
 * @param raw     { info, equipment, items?: {slotPos: itemResponse}, boards?: {boardId: detailResponse} }
 * @param context { slots, region, capturedOn }
 */
export function adaptCharacter(raw, { slots, region, capturedOn }) {
  if (!Array.isArray(slots) || !slots.length) throw new TypeError('adaptCharacter needs the gear slot list.');
  if (!region) throw new TypeError('adaptCharacter needs the region.');
  if (!DATE.test(capturedOn ?? '')) throw new TypeError('adaptCharacter needs capturedOn as YYYY-MM-DD.');
  const daevanion = adaptDaevanion(raw.info);
  for (const board of daevanion) {
    const detail = raw.boards?.[board.id];
    if (detail) board.nodes = adaptDaevanionBoard(detail);
  }
  const gear = adaptGear(raw.equipment, slots, raw.items ?? {});
  return {
    profile: adaptProfile(raw.info),
    gear,
    arcana: arcanaSlots(gear, slots),
    accessorySlots: pending('The armory lists a slot only when an item is worn there. Accessory slot names and positions need an equipped accessory or an in-game capture.'),
    stats: adaptStats(raw.info),
    skills: adaptSkills(raw.equipment),
    daevanion,
    titles: adaptTitles(raw.info),
    appearance: adaptAppearance(raw.equipment),
    ...adaptPetWing(raw.equipment),
    source: { kind: 'armory', region, capturedOn }
  };
}
