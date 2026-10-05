# AION 2 EU armory: Phase 0 data proof

Captured 5 Oct 2026 from the public NCSOFT armory. No login, no key, no cookies sent.
Character: ASTRIX285 (Miguel's own), EU, server Meslamtaeda. JSON is pretty-printed, values unchanged.

Endpoint shapes come from the open source client [nuriland/aion2-api](https://github.com/nuriland/aion2-api)
(`config.go`, `endpoint.go`). Every call below was checked live against EU.

## Base URLs and region code

- Region code: `region=eu` (Global shard). Language: `lang=en-US` (search uses `localeInfo=en-US`).
- Game site and character API: `https://aion2.plaync.com`
- Character search: `https://api-search.plaync.com/aion2global/search/v2`
- Icons: `https://assets.playnccdn.com/static-aion2-gamedata/resources/`
- Portraits: `https://profileimg.plaync.com`

## Endpoints captured

| Fixture | Request |
| --- | --- |
| `servers.json` | `GET /en-us/api/gameinfo/servers?lang=en-US&region=eu` |
| `classes.json` | `GET /en-us/api/gameinfo/classes?lang=en-US&region=eu` |
| `astrix285-search.json` | `GET {search}/character?keyword=ASTRIX285&page=1&size=40&region=eu&localeInfo=en-US` |
| `astrix285-info.json` | `GET /api/character/info?lang=en-US&region=eu&serverId=1308&characterId=<id>` |
| `astrix285-equipment.json` | `GET /api/character/equipment?<same>` |
| `astrix285-item-mainhand.json` | `GET /api/character/equipment/item?<same>&id=110150028&enchantLevel=2&slotPos=1` |
| `astrix285-daevanion-11.json` | `GET /api/character/daevanion/detail?<same>&boardId=11` |

`characterId` is the search result's id, sent URL-encoded once. Server ids: Elyos 13xx, Asmodian 23xx.

## What comes through

| System | In the armory data | Where |
| --- | --- | --- |
| Profile: class, level, faction, server, title, combat power | Yes | `info.profile` |
| Primary and god stats | Names only, every value 0 at Lv 12 | `info.stat.statList` |
| Item level | Yes (label untranslated: `아이템레벨`) | last row of `info.stat.statList` |
| Daevanion boards | Yes: 5 boards, open state, node counts; per board node grid with effects | `info.daevanion`, `daevanion/detail` |
| Equipped gear | Yes: slot, item, grade, enchant | `equipment.equipment.equipmentList` |
| Item detail | Yes: main stats, sub stats, manastone slots, max enchant, sources | `equipment/item` |
| Skills | Yes: all 35 class skills with unlock level, skill level, acquired, equipped | `equipment.skill.skillList` |
| Stigmas | Yes: 13 skills with category `Dp`, all need Lv 22 | `equipment.skill.skillList` |
| Pet | Yes: equipped pet name and level only, no collection or Pet Insight | `equipment.petwing.pet` |
| Wings | Yes | `equipment.petwing.wing` |
| Ranking | Field present, `null` for this character | `info.ranking` |
| Specialty picks | Not seen | |
| Macros or hotbar | Not seen | |
| Genus Insight | Not seen | |
| Accessories | None equipped on this character, so slot names are still unconfirmed | |

## Findings for the brief

- Faction is Elyos (`raceId` 1, `raceName` Elyos).
- Lv 12 skills acquired include Keen Strike, Rending Blow and Overhead Slam, so the macro example holds.
- Ruinous Blow unlocks at Lv 14, so it is not yet available at Lv 12.
- Macros are not in the data, so the macro advisor is recommendation-only.
