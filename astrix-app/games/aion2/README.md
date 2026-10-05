# The Aetherium (AION 2)

The Aetherium is the ASTRIX PARADOX build advisor for AION 2. EU first.

```
astrix-app/games/aion2/
  index.mjs                 game module (platform contract)
  engine/armory-adapter.mjs raw armory responses to the character model (pure, no network)
  schema/                   character model, catalogue skill and gear slot schemas
  data/gear-slots.json      gear slot positions and names, from the armory
  data/gladiator/           Gladiator skills and stigmas
  docs/SCOPE.md             project scope
```

Raw armory fixtures and the endpoint notes live in `astrix-app/tools/fixtures/aion2/eu/` (`ENDPOINTS.md`).

## Rules

- No network calls in this folder. Pages fetch through the armory Worker and pass the JSON in.
- Every data record has a `provenance` block (`platform/contracts/provenance.schema.json`): `armory` for values read from the public armory, `in-game-capture` for values Miguel reads in game.
- A field with no source yet is `{ "pending": true, "reason": "..." }`. Never a guessed value.
- Page names: Daeva Card, Gear Ledger, Workshop, Ascent Plan, Ladder Watch, Atreia Atlas. No Destiny tool names.

## Checks

```
node astrix-app/tools/test-aion2-adapter.mjs
node astrix-app/tools/test-aion2-eu-fixtures.mjs
node astrix-app/tools/validate-game-folders.mjs
node astrix-app/tools/test-game-folders.mjs
```
