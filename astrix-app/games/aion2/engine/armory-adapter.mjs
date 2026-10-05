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
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireShape(value, key, what) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    throw new TypeError(`${what} response has no ${key}; the armory shape changed.`);
  }
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
    raceName: p.raceName,
    server: { id: p.serverId, name: p.serverName },
    title: p.titleName ?? null,
    combatPower: p.combatPower,
    itemLevel: Number.isFinite(itemLevelRow?.value)
      ? itemLevelRow.value
      : pending('The armory sent no item level row for this character.')
  };
}

/**
 * Gear from /api/character/equipment, one entry per known slot.
 * @param slots   Gear slot records (data/gear-slots.json): { slotPos, slotPosName }.
 * @param items   Optional map of slotPos to the /api/character/equipment/item response.
 *                maxEnchant and manastoneSlots come only from that detail call.
 */
export function adaptGear(equipment, slots, items = {}) {
  requireShape(equipment, 'equipment', 'Equipment');
  const worn = new Map((equipment.equipment.equipmentList ?? []).map(item => [item.slotPos, item]));
  const known = new Set(slots.map(slot => slot.slotPos));
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
      grade: item.grade,
      enchant: item.enchantLevel,
      maxEnchant: sameItem && Number.isFinite(detail.maxEnchantLevel)
        ? detail.maxEnchantLevel
        : pending('Max enchant comes from the item detail call, which has not been read for this slot.'),
      manastoneSlots: sameItem && Number.isFinite(detail.magicStoneSlotCount)
        ? detail.magicStoneSlotCount
        : pending('Manastone slot count comes from the item detail call, which has not been read for this slot.')
    };
  };
  const gear = slots.map(slot => entry(slot.slotPos, slot.slotPosName, worn.get(slot.slotPos)));
  // A worn item in a slot the catalogue does not list yet (for example an accessory) is kept, never dropped.
  for (const [slotPos, item] of worn) {
    if (!known.has(slotPos)) gear.push(entry(slotPos, item.slotPosName, item));
  }
  return gear;
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
    open: board.open === 1,
    nodesTaken: board.openNodeCount,
    nodesTotal: board.totalNodeCount
  }));
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

export function adaptPetWing(equipment) {
  const petwing = equipment?.petwing ?? {};
  return {
    pet: petwing.pet
      ? { id: petwing.pet.id, name: petwing.pet.name, level: petwing.pet.level }
      : pending('The armory sent no equipped pet.'),
    wings: petwing.wing
      ? { id: petwing.wing.id, name: petwing.wing.name, grade: petwing.wing.grade, enchant: petwing.wing.enchantLevel }
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
  return {
    profile: adaptProfile(raw.info),
    gear: adaptGear(raw.equipment, slots, raw.items ?? {}),
    accessorySlots: pending('The armory lists a slot only when an item is worn there. Accessory slot names and positions need an equipped accessory or an in-game capture.'),
    skills: adaptSkills(raw.equipment),
    daevanion,
    ...adaptPetWing(raw.equipment),
    source: { kind: 'armory', region, capturedOn }
  };
}
