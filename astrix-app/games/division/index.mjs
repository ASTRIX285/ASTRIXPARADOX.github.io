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

/**
 * @param {object} catalogue  Loaded title catalogue: { title, catalogueVersion, items, brands, gearSets, skills, specializations }.
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

    /** The catalogue record for an item id, or a pending value when it is not sourced yet. */
    resolveItem(itemId) {
      return lookup(items, itemId, 'Item');
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
