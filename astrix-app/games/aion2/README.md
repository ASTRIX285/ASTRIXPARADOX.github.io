# The Aetherium (AION 2)

The Aetherium is the ASTRIX PARADOX build advisor for AION 2. EU first.

```
astrix-app/games/aion2/
  index.mjs                 game module (platform contract)
  engine/armory-adapter.mjs raw armory responses to the character model (pure, no network)
  engine/ascent-advisor.mjs the Ascent Plan: class, role and level to a plan (pure, no network)
  engine/daevanion-planner.mjs a Daevanion board to a numbered route with point costs and reasons (pure)
  schema/                   character model, catalogue skill, gear slot and advisor build schemas
  data/gear-slots.json      gear slot positions and names, from the armory
  data/gladiator/           Gladiator skills and stigmas, from the armory
  data/advisor/             Ascent Plan data: progression facts, core skills, role builds per class
  docs/SCOPE.md             project scope
```

Raw armory fixtures and the endpoint notes live in `astrix-app/tools/fixtures/aion2/eu/` (`ENDPOINTS.md`).

## Rules

- No network calls in this folder. Pages fetch through the armory Worker and pass the JSON in.
- Every data record has a `provenance` block (`platform/contracts/provenance.schema.json`): `armory` for values read from the public armory, `in-game-capture` for values Miguel reads in game, `community-guide` for build advice from public guides (MetaBot, ExpCarry and others).
- Sources stay in the data and are never shown or linked on a page (Miguel, 6 Oct 2026: players stay on the site). Advisor fields cite their sources with `refs`; every ref must be listed in the record's provenance and every listed source must be cited (`test-aion2-advisor.mjs`).
- Advisor data is generated from the class research note (project doc `claude/aion2-class-research-6oct2026.md`). When a guide changes, update the record and its `retrievedOn` date.
- A field with no source yet is `{ "pending": true, "reason": "..." }`. Never a guessed value.
- Page names: Daeva Card, Gear Ledger, Workshop, Ascent Plan, Ladder Watch, Atreia Atlas. No Destiny tool names.

## Checks

```
node astrix-app/tools/test-aion2-adapter.mjs
node astrix-app/tools/test-aion2-advisor.mjs
node astrix-app/tools/test-aetherium-ascent.mjs
node astrix-app/tools/test-aion2-eu-fixtures.mjs
node astrix-app/tools/validate-game-folders.mjs
node astrix-app/tools/test-game-folders.mjs
```
