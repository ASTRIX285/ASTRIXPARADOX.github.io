# The Caster (WoW Forever)

The Caster is the ASTRIX PARADOX build advisor for World of Warcraft: Forever.

```
astrix-app/games/wow-forever/
  index.mjs          game module (platform contract)
  docs/SCOPE.md      project scope
  schema/            JSON schemas for generated records, rule values and saved builds
  engine/            rules engine: talents, Legacy, stat totals (pure functions)
  data/              rules.json (official sources), stat-types.json, generated/ (after the first reviewed run)
  pipeline/          client data importer, pinned build config, tests on synthetic fixtures
```

## Rules

- No game values in code. Talents, items and spells come from the generated database; rule values come from `data/rules.json`.
- Every record has a `provenance` block (`platform/contracts/provenance.schema.json`). Client data rows carry product, build, table, row id and source sha256. Rule values carry an `official-post` source.
- A value with no source is `{ "pending": true, "reason": "..." }` or left out so the engine reports a pending check. Never a guess.
- No Wowhead scraping, no QuestieDB, no Retail or Classic Era data in place of Forever data.
- No Battle.net sign-in, session tokens or scraping. Account import waits for official Forever profile APIs.

## Checks

```
node astrix-app/games/wow-forever/pipeline/test-build-forever-db.mjs
node astrix-app/tools/validate-game-folders.mjs
```

The first runs on every PR that touches this folder through `.github/workflows/refresh-wow-forever-data.yml`. The second runs inside `paradox-validator.mjs`.
