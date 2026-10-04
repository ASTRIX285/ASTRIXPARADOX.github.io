/**
 * Manual adapter: the player builds by hand, slot by slot. Every change goes
 * through the Division game module, so an item with no sourced catalogue record
 * (pending) can't be equipped.
 */
import { PLATFORMS, createBuild, isPlatform, normaliseBuild } from '../../../core/build-format/build.mjs';
import { DIVISION_GAME_MODULE } from '../../../games/division/index.mjs';

const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);
const blocked = record => ({ ok: false, state: 'pending', reason: record.reason });

export function createManualAdapter({ module = DIVISION_GAME_MODULE, title = 'td2', catalogueVersion = null, platform = null } = {}) {
  const needsPlatform = { ok: false, state: 'needs-platform', reason: `Choose your platform: ${PLATFORMS.join(', ')}.` };
  const place = (build, slotId, entry) => {
    const errors = typeof module.validateSlot === 'function' ? module.validateSlot(slotId, entry) : [];
    if (errors.length) return { ok: false, state: 'invalid', reason: errors[0], errors };
    return change(build, next => { next.slots[slotId] = entry; });
  };
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

    /** A new, empty build on a platform. Without a valid platform it asks for one instead of assuming. */
    async load({ platform: chosen = platform } = {}) {
      if (!isPlatform(chosen)) return { ...needsPlatform };
      return { ok: true, build: createBuild({ game: 'division', title, platform: chosen, catalogueVersion }) };
    },

    /** A copy of a build (for example a shared one) on another platform. The original is unchanged. */
    duplicate(build, toPlatform) {
      if (!isPlatform(toPlatform)) return { ...needsPlatform };
      return change(build, next => { next.platform = toPlatform; });
    },

    /**
     * Put an item instance in a slot. The instance may carry a core roll, attribute rolls, a talent,
     * mods, an expertise level and an item level; the game module refuses anything the item cannot
     * carry (exotics are fixed, named items keep their locked talent or attribute) or any roll
     * outside the catalogue min and max.
     */
    equip(build, slotId, itemId, instance = {}) {
      const record = module.resolveItem(itemId);
      if (isPending(record)) return blocked(record);
      const entry = { itemId };
      for (const key of ['core', 'attributes', 'talentId', 'modIds', 'expertise', 'itemLevel']) if (instance[key] !== undefined) entry[key] = instance[key];
      return place(build, slotId, entry);
    },

    /** Change part of the instance already in a slot (for example its core roll or expertise level). */
    update(build, slotId, changes) {
      const current = normaliseBuild(build).slots[slotId];
      if (!current) return { ok: false, state: 'empty', reason: 'Equip an item in this slot first.' };
      const entry = { ...current };
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'itemId') continue;
        if (value === undefined || value === null) delete entry[key]; else entry[key] = value;
      }
      return place(build, slotId, entry);
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
