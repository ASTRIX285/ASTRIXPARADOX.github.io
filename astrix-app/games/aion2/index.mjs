/**
 * The AION 2 game module (The Aetherium).
 *
 * Translates AION 2 concepts into the generic ASTRIX PARADOX platform contract
 * (platform/contracts/game-module.mjs). It holds no game values of its own: the
 * character comes from the public armory through engine/armory-adapter.mjs and
 * class data from the catalogue (data/). Anything not sourced yet is pending.
 */
import {
  adaptCharacter,
  adaptGear,
  adaptSkills,
  adaptPetWing
} from './engine/armory-adapter.mjs';

export const AION2_REGIONS = Object.freeze(['eu']);

export const AION2_CONCEPTS = Object.freeze({
  gear: 'equipment',
  accessory: 'equipment',
  pet: 'equipment',
  wings: 'equipment',
  skill: 'ability',
  stigma: 'ability',
  passiveSkill: 'passive-modifier',
  daevanionNode: 'passive-modifier',
  contentMode: 'encounter-requirement'
});

const pending = reason => ({ pending: true, reason });

/**
 * @param {object} catalogue  { slots, classes: { [className]: { skills, stigmas } } } from data/.
 *                            May be absent; lookups that need it then return pending.
 */
export function createAion2Module(catalogue = null) {
  const slots = catalogue?.slots ?? [];
  const needSlots = () => {
    if (!slots.length) throw new TypeError('The AION 2 gear slot catalogue (data/gear-slots.json) is not loaded.');
    return slots;
  };

  return Object.freeze({
    getMetadata() {
      return {
        id: 'aion2',
        name: 'AION 2',
        productName: 'The Aetherium',
        version: '0.1.0',
        regions: AION2_REGIONS,
        concepts: AION2_CONCEPTS
      };
    },

    normalisePlayer(raw) {
      return {
        gameId: 'aion2',
        identitySource: 'armory',
        accountLinked: false,
        characterCount: raw?.info ? 1 : 0
      };
    },

    /** raw = { info, equipment, items?, boards? }; context = { region, capturedOn }. */
    normaliseCharacter(raw, context = {}) {
      return adaptCharacter(raw, { ...context, slots: needSlots() });
    },

    normaliseEquipment(raw) {
      return { gear: adaptGear(raw.equipment, needSlots(), raw.items ?? {}), ...adaptPetWing(raw.equipment) };
    },

    normaliseAbilities(raw) {
      return adaptSkills(raw.equipment).filter(skill => skill.category !== 'Passive');
    },

    normalisePassives(raw) {
      return adaptSkills(raw.equipment).filter(skill => skill.category === 'Passive');
    },

    normaliseEncounter() {
      return pending('Content modes (PvE, Abyss, Arena) arrive with the Ascent Plan.');
    },

    /** The class catalogue record for a skill or stigma id, or pending when it is not sourced yet. */
    resolveSkill(className, skillId) {
      const entry = catalogue?.classes?.[className];
      if (!entry) return pending(`No ${className} catalogue is loaded.`);
      return [...(entry.skills ?? []), ...(entry.stigmas ?? [])].find(record => record.id === skillId)
        ?? pending(`Skill ${skillId} is not in the ${className} catalogue yet.`);
    },

    explainRecommendation() {
      return pending('Recommendations arrive with the Ascent Plan.');
    }
  });
}

export const AION2_GAME_MODULE = createAion2Module();
