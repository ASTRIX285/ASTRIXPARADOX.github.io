/**
 * Manual adapter: the player builds by hand, slot by slot. Every change goes
 * through the Division game module, so an item with no sourced catalogue record
 * (pending) can't be equipped.
 */
import { createBuild, normaliseBuild } from '../../../core/build-format/build.mjs';
import { DIVISION_GAME_MODULE } from '../../../games/division/index.mjs';

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const blocked = record => ({ ok: false, state: 'pending', reason: record.reason });

export function createManualAdapter({ module = DIVISION_GAME_MODULE, title = 'td2', catalogueVersion = null } = {}) {
  const change = (build, edit) => {
    const next = normaliseBuild(build);
    edit(next);
    return { ok: true, build: normaliseBuild(next) };
  };

  return Object.freeze({
    id: 'manual',
    label: 'Enter by hand',

    status() {
      return { available: true, state: 'ready', reason: 'Build it slot by slot from the catalogue.' };
    },

    async load() {
      return { ok: true, build: createBuild({ game: 'division', title, catalogueVersion }) };
    },

    equip(build, slotId, itemId, { attributes, talentId, modIds } = {}) {
      const record = module.resolveItem(itemId);
      if (isPending(record)) return blocked(record);
      if (typeof module.canEquip === 'function') {
        const check = module.canEquip(slotId, itemId);
        if (!check.ok) return { ok: false, state: 'pending', reason: check.reason };
      }
      return change(build, next => {
        next.slots[slotId] = { itemId, ...(attributes ? { attributes } : {}), ...(talentId ? { talentId } : {}), ...(modIds ? { modIds } : {}) };
      });
    },

    /** Set one attribute roll on an equipped slot. Only values inside the catalogue min and max are accepted. */
    setAttribute(build, slotId, attributeId, value) {
      const slot = normaliseBuild(build).slots[slotId];
      if (!slot) return { ok: false, state: 'empty', reason: 'Equip an item in this slot first.' };
      const range = module.attributeRange(attributeId);
      if (isPending(range)) return blocked(range);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) {
        return { ok: false, state: 'out-of-range', reason: `Enter a value from ${range.min} to ${range.max}.` };
      }
      return change(build, next => { next.slots[slotId] = { ...next.slots[slotId], attributes: { ...(next.slots[slotId].attributes ?? {}), [attributeId]: value } }; });
    },

    /** Remove one attribute roll from an equipped slot. */
    clearAttribute(build, slotId, attributeId) {
      return change(build, next => {
        const slot = next.slots[slotId];
        if (!slot?.attributes) return;
        const { [attributeId]: removed, ...rest } = slot.attributes;
        next.slots[slotId] = { ...slot };
        if (Object.keys(rest).length) next.slots[slotId].attributes = rest; else delete next.slots[slotId].attributes;
      });
    },

    unequip(build, slotId) {
      return change(build, next => { delete next.slots[slotId]; });
    },

    setAbility(build, index, abilityId) {
      const [ability] = module.normaliseAbilities({ abilities: [abilityId] });
      if (isPending(ability.record)) return blocked(ability.record);
      return change(build, next => {
        const abilities = [...next.abilities];
        abilities[index] = abilityId;
        next.abilities = abilities.filter(Boolean);
      });
    },

    select(build, key, id) {
      if (key === 'specialization') {
        const { specialization } = module.normaliseCharacter({ selections: { specialization: id } });
        if (isPending(specialization)) return blocked(specialization);
      }
      return change(build, next => { next.selections[key] = id; });
    },

    rename(build, name) {
      return change(build, next => { next.name = name; });
    },

    setObjective(build, objective) {
      return change(build, next => { next.objective = objective; });
    }
  });
}

export const MANUAL_ADAPTER = createManualAdapter();
