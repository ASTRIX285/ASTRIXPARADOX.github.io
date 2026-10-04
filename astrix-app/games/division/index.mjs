/**
 * The Division game module (WorkBench).
 *
 * Translates Division concepts into the generic ASTRIX PARADOX platform contract
 * (platform/contracts/game-module.mjs). It holds no game values of its own: every
 * id, name and number comes from a title catalogue (td2/data/) or the player's
 * build (core/build-format, the neutral build). Until the catalogue holds a
 * record, every lookup returns pending.
 */

export const DIVISION_TITLES = Object.freeze(['td2']);

export const DIVISION_CONCEPTS = Object.freeze({
  weapon: 'equipment',
  gear: 'equipment',
  skill: 'ability',
  skillVariant: 'ability',
  specialization: 'passive-modifier',
  brandBonus: 'passive-modifier',
  gearSetBonus: 'passive-modifier',
  talent: 'passive-modifier',
  activity: 'encounter-requirement'
});

const pending = reason => ({ pending: true, reason });
const isPending = value => Boolean(value && typeof value === 'object' && value.pending === true);

/**
 * @param {object} catalogue  Loaded title catalogue (games/division/catalogue.mjs):
 *                            { title, catalogueVersion, slots, attributes, items, brands, gearSets, skills, specializations }.
 *                            May be partial or absent; lookups then return pending values.
 */
export function createDivisionModule(catalogue = null) {
  const title = catalogue?.title ?? 'td2';
  const index = key => new Map((catalogue?.[key] ?? []).map(record => [record.id, record]));
  const items = index('items');
  const brands = index('brands');
  const gearSets = index('gearSets');
  const skills = index('skills');
  const specializations = index('specializations');
  const slots = index('slots');
  const attributes = index('attributes');

  const lookup = (map, id, what) => {
    if (!catalogue) return pending(`${what} needs the ${title} catalogue, which is not loaded.`);
    return map.get(id) ?? pending(`${what} ${id} is not in the ${title} catalogue yet.`);
  };

  return Object.freeze({
    getMetadata() {
      return {
        id: 'division',
        name: 'The Division',
        productName: 'WorkBench',
        version: '0.1.0',
        title,
        titles: DIVISION_TITLES,
        catalogueVersion: catalogue?.catalogueVersion ?? null,
        concepts: DIVISION_CONCEPTS
      };
    },

    normalisePlayer(build) {
      return { gameId: 'division', title, identitySource: 'manual', accountLinked: false, buildCount: build ? 1 : 0 };
    },

    /**
     * The catalogue record for something that can sit in a gear or weapon slot: a named
     * or exotic item, or a brand or gear set piece. Pending when it is not sourced yet.
     */
    resolveItem(itemId) {
      if (!catalogue) return lookup(items, itemId, 'Item');
      return items.get(itemId) ?? brands.get(itemId) ?? gearSets.get(itemId) ?? pending(`Item ${itemId} is not in the ${title} catalogue yet.`);
    },

    /** Slots of one group (gear, weapon, skill), or a pending value when the catalogue has no sourced slot list. */
    listSlots(group) {
      if (group === 'gear' && slots.size) return [...slots.values()];
      const what = { gear: 'Gear slot list', weapon: 'Weapon slot list', skill: 'Skill slot list' }[group] ?? `${group} slot list`;
      return pending(`${what} is not in the ${title} catalogue yet. It needs an official source or an in-game capture.`);
    },

    /** Specializations in the catalogue whose name is sourced. */
    listSpecializations() {
      return [...specializations.values()].filter(record => !isPending(record.name));
    },

    /** Core attributes from the catalogue, in catalogue order. */
    listCoreAttributes() {
      return [...attributes.values()].filter(record => record.kind === 'core');
    },

    /** Every record that could go in a slot, each with whether it can be equipped there and why not. */
    listOptions(slotId) {
      const rows = [];
      const fits = record => {
        const slotIds = record.slotIds;
        if (isPending(slotIds) || slotIds === undefined) return pending(`Which slots ${record.name} covers is not sourced yet.`);
        return slotIds.includes(slotId) ? true : null;
      };
      for (const record of brands.values()) rows.push({ type: 'brand', record, fit: fits(record) });
      for (const record of gearSets.values()) rows.push({ type: 'gear-set', record, fit: fits(record) });
      for (const record of items.values()) {
        const fit = isPending(record.slotId) ? pending(`The slot for ${record.name} is not sourced yet.`) : record.slotId === slotId ? true : null;
        rows.push({ type: record.rarity, record, fit });
      }
      return rows.filter(row => row.fit !== null).map(row => ({
        id: row.record.id,
        name: isPending(row.record.name) ? row.record.id : row.record.name,
        type: row.type,
        equippable: row.fit === true,
        reason: row.fit === true ? '' : row.fit.reason
      }));
    },

    /** Whether an item can go in a slot. Anything pending or missing is blocked with a reason. */
    canEquip(slotId, itemId) {
      const record = this.resolveItem(itemId);
      if (isPending(record)) return { ok: false, reason: record.reason };
      const option = this.listOptions(slotId).find(row => row.id === itemId);
      if (!option) return { ok: false, reason: `${record.name} does not go in the ${slotId} slot.` };
      return option.equippable ? { ok: true, reason: '' } : { ok: false, reason: option.reason };
    },

    /** Min, max and unit for an attribute roll, or a pending value when the catalogue does not hold them. */
    attributeRange(attributeId) {
      const record = attributes.get(attributeId);
      if (!record) return pending(`Attribute ${attributeId} is not in the ${title} catalogue yet.`);
      const roll = record.roll;
      if (!roll || isPending(roll)) return pending(roll?.reason ?? `The roll range for ${record.name} is not sourced yet.`);
      if ([roll.min, roll.max, roll.unit].some(isPending)) return pending(`Part of the roll range for ${record.name} is not sourced yet.`);
      return { min: roll.min, max: roll.max, unit: roll.unit };
    },

    normaliseCharacter(build) {
      const specializationId = build?.selections?.specialization;
      return {
        gameId: 'division',
        title,
        specialization: specializationId ? lookup(specializations, specializationId, 'Specialization') : null,
        objective: build?.objective ?? null,
        catalogueVersion: build?.catalogueVersion ?? null
      };
    },

    normaliseEquipment(build) {
      return Object.entries(build?.slots ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slot, { itemId }]) => {
          const record = lookup(items, itemId, 'Item');
          return { slot, itemId, concept: 'equipment', record, evidence: record.pending ? [] : [record.provenance] };
        });
    },

    normaliseAbilities(build) {
      return (build?.abilities ?? []).map(skillId => {
        const record = lookup(skills, skillId, 'Skill');
        return { skillId, concept: 'ability', record, evidence: record.pending ? [] : [record.provenance] };
      });
    },

    normalisePassives(build) {
      const counts = new Map();
      for (const { itemId } of Object.values(build?.slots ?? {})) {
        if (brands.has(itemId) || gearSets.has(itemId)) { counts.set(itemId, (counts.get(itemId) ?? 0) + 1); continue; }
        const item = items.get(itemId);
        for (const key of ['brandId', 'gearSetId']) if (item?.[key] && !item[key].pending) counts.set(item[key], (counts.get(item[key]) ?? 0) + 1);
      }
      return [...counts.entries()].map(([id, equipped]) => {
        const record = brands.get(id) ?? gearSets.get(id) ?? lookup(brands, id, 'Brand or gear set');
        return { concept: 'passive-modifier', id, equipped, record, evidence: record.pending ? [] : [record.provenance] };
      });
    },

    normaliseEncounter(encounter) {
      return { gameId: 'division', id: encounter?.id ?? null, requirements: pending('Activity and enemy requirements are not modelled yet.') };
    },

    explainRecommendation(rec) {
      const evidence = Array.isArray(rec?.evidence) ? rec.evidence.filter(Boolean) : [];
      if (!evidence.length) return pending('No evidence path, so no recommendation is shown.');
      return { summary: rec.summary, because: rec.because ?? [], tradeOffs: rec.tradeOffs ?? [], evidence };
    }
  });
}

export const DIVISION_GAME_MODULE = createDivisionModule();
