/**
 * WoW Forever game module.
 *
 * Translates Forever concepts into the generic ASTRIX PARADOX platform contract
 * (platform/contracts/game-module.mjs). It holds no game values of its own:
 * every id, name and number comes from the generated database (data/generated/)
 * or the user's saved build. Anything missing is returned as pending.
 */

export const WOW_FOREVER_CONCEPTS = Object.freeze({
  item: 'equipment',
  classSpell: 'ability',
  activeTalent: 'ability',
  passiveTalent: 'passive-modifier',
  legacyPerk: 'passive-modifier',
  setBonus: 'passive-modifier',
  itemProc: 'passive-modifier',
  bossMechanic: 'encounter-requirement',
  resistanceCheck: 'encounter-requirement'
});

const pending = reason => ({ pending: true, reason });
const isPending = v => Boolean(v && typeof v === 'object' && v.pending === true);

/**
 * @param {object} db  Generated database: { manifest, classes, items, itemSets, talentTrees, spells }.
 *                     May be partial or absent; lookups then return pending values.
 */
export function createWowForeverModule(db = null) {
  const index = key => new Map((db?.[key] ?? []).map(r => [r.id, r]));
  const items = index('items');
  const sets = index('itemSets');
  const spells = index('spells');
  const classes = index('classes');
  const talents = new Map();
  for (const tree of db?.talentTrees ?? []) for (const t of tree.talents) talents.set(t.id, { ...t, tree });

  const needDb = what => pending(`${what} needs the generated Forever database, which is not loaded.`);

  return Object.freeze({
    getMetadata() {
      return {
        id: 'wow-forever',
        name: 'World of Warcraft: Forever',
        productName: 'The Caster',
        version: '0.1.0',
        dataBuild: db?.manifest?.build ?? null,
        concepts: WOW_FOREVER_CONCEPTS
      };
    },

    normalisePlayer(build) {
      return { gameId: 'wow-forever', identitySource: 'manual', accountLinked: false, buildCount: build ? 1 : 0 };
    },

    normaliseCharacter(build) {
      const cls = classes.get(build.classId);
      return {
        gameId: 'wow-forever',
        classId: build.classId,
        className: cls ? cls.name : (db ? pending(`Class ${build.classId} is not in the pinned build.`) : needDb('Class name')),
        level: build.level,
        ruleset: build.ruleset ?? null,
        goal: build.goal ?? null,
        dataBuild: build.dataBuild
      };
    },

    normaliseEquipment(build) {
      return Object.entries(build.gear ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([slot, itemId]) => {
        const item = items.get(itemId);
        return {
          slot,
          itemId,
          concept: 'equipment',
          record: item ?? (db ? pending(`Item ${itemId} is not in the pinned build.`) : needDb('Item details')),
          setId: item && !isPending(item.itemSetId) && item.itemSetId > 0 ? item.itemSetId : null,
          evidence: item ? [item.provenance] : []
        };
      });
    },

    normaliseAbilities(build) {
      return Object.entries(build.talents ?? {}).map(([id, rank]) => ({ id: Number(id), rank }))
        .map(({ id, rank }) => {
          const t = talents.get(id);
          if (!t) return { talentId: id, rank, concept: 'ability', record: db ? pending(`Talent ${id} is not in the pinned build.`) : needDb('Talent details') };
          const spellId = Array.isArray(t.rankSpellIds) ? t.rankSpellIds[rank - 1] : undefined;
          return {
            talentId: id,
            rank,
            concept: 'ability',
            spell: spellId ? (spells.get(spellId) ?? pending(`Spell ${spellId} is not in the generated spells.`)) : pending(`Rank ${rank} is above this talent's max rank.`),
            evidence: [t.provenance]
          };
        });
    },

    normalisePassives(build) {
      const counts = new Map();
      for (const itemId of Object.values(build.gear ?? {})) {
        const setId = items.get(itemId)?.itemSetId;
        if (Number.isInteger(setId) && setId > 0) counts.set(setId, (counts.get(setId) ?? 0) + 1);
      }
      const setBonuses = [...counts.entries()].flatMap(([setId, equipped]) => {
        const set = sets.get(setId);
        if (!set) return [{ concept: 'passive-modifier', kind: 'setBonus', setId, record: pending(`Item set ${setId} is not in the pinned build.`) }];
        return set.bonuses.map(b => ({
          concept: 'passive-modifier',
          kind: 'setBonus',
          setId,
          threshold: b.threshold,
          equipped,
          active: equipped >= b.threshold,
          spell: spells.get(b.spellId) ?? pending(`Spell ${b.spellId} is not in the generated spells.`),
          evidence: [set.provenance, b.provenance]
        }));
      });
      const legacy = Object.keys(build.legacy ?? {}).length
        ? [{ concept: 'passive-modifier', kind: 'legacy', record: pending('Legacy tree contents are not published in the client tables yet.') }]
        : [];
      return [...setBonuses, ...legacy];
    },

    normaliseEncounter(encounter) {
      return { gameId: 'wow-forever', id: encounter?.id ?? null, requirements: pending('Encounter requirements are not modelled yet.') };
    },

    explainRecommendation(rec) {
      const evidence = Array.isArray(rec?.evidence) ? rec.evidence.filter(e => e && e.table && e.build) : [];
      if (!evidence.length) return pending('No evidence path, so no recommendation is shown.');
      return { summary: rec.summary, because: rec.because ?? [], tradeOffs: rec.tradeOffs ?? [], evidence };
    }
  });
}

export const WOW_FOREVER_GAME_MODULE = createWowForeverModule();
