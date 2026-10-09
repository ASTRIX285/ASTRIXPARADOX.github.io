# AION 2 regions (The Aetherium)

Checked live on the official search page (aion2.plaync.com/en-us/characters/index) on 9 Oct 2026, with one real Lv 45 character per region. The page offers five regions. They all use the same hosts as Europe, so only the region code changes.

| Region (official name) | Code | Servers | Server ids (Elyos 1x, Asmodian 2x) | Checked with |
| --- | --- | --- | --- | --- |
| North America - West | `naw` | 10 | 12xx / 22xx | Lv 45 Spiritmaster |
| North America - East | `nae` | 16 | 11xx / 21xx | Lv 45 Assassin |
| Europe | `eu` | 46 | 13xx / 23xx | Lv 45 Gladiator |
| South America | `la` | 12 | 14xx / 24xx | Lv 45 Sorcerer |
| Asia | `as` | 18 | 15xx / 25xx | Lv 45 Ranger |

## Same hosts and shape in every region

- Character API: `https://aion2.plaync.com` (`/api/character/info`, `/equipment`, `/equipment/item`, `/daevanion/detail`).
- Search: `https://api-search.plaync.com/aion2global/search/v2/character`.
- Server list: `https://aion2.plaync.com/en-us/api/gameinfo/servers?lang=en-US&region=<code>`.
- Always `lang=en-US` and `localeInfo=en-US`.
- In every region all seven calls (servers, classes, search, character info, equipment, item detail, Daevanion detail) answered 200 with the same JSON shape as Europe. Each class has 35 skills. Each Daevanion board has 225 cells.
- Skill ids follow the same class pattern as Europe, so the English skill data matches by id: Gladiator 11xxxxxx, Assassin 13xxxxxx, Sorcerer 15xxxxxx, Spiritmaster 16xxxxxx, Ranger 14xxxxxx.

## Warnings

- An unknown region code on `gameinfo/servers` does not fail. It silently answers with the North America East list. The Worker therefore only ever passes the five codes above, and refuses anything else with `invalid_region` before any upstream call.
- `na`, `kr`, `tw`, `asia` and `sa` are not valid codes.
- Korea and Taiwan are not part of this work.

## Two things in the official data

- The race name is plural: `raceName` is "Asmodians" (raceId 2) and "Elyos" (raceId 1). The pages key the faction on `raceId` and only fall back to the name, accepting both spellings.
- Asmodian Daevanion boards use ids 31, 32, 33, 34 and 36 (Elyos 11, 12, 13, 14 and 16). The boards have the same names, so the pages match a board by id or name and use the character's own id for the board call and every link.

## About the fixtures

- `eu/` holds the raw captures from the #451 work.
- There are no raw captures for the other four regions. The tests build one fixture per region (and per race) with `derive-region-fixtures.mjs`. **These are derived from the Europe captures, not raw captures.** The helper changes the region, server ids, server names, class and race (and, for Asmodians, the board ids) to match the table above. Server and character names are synthetic. Skills and gear stay the Europe capture's, so they prove the region plumbing and the adapter, not region-specific game data.
