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

## Item grades (captured 11 Oct 2026, Lv 45)

A Lv 45 Gladiator read through the live Worker (`/aion2/character`, then `/aion2/item` for each of the 17 worn items).
Saved under a test name with no gamer tag, character id or portrait: `lv45-info.json`, `lv45-equipment.json` and
`lv45-items.json` (the item detail for each worn slot, keyed by `slotPos`).

| Field | Equipment list (`equipment.equipmentList[]`) | Item detail (`equipment/item`) |
| --- | --- | --- |
| `grade` | Internal code: `Common`, `Rare`, `Legend`, `Unique` | The same internal code |
| `gradeName` | Not sent | The client name: `Rare`, `Epic`, `Unique` |
| `maxEnchantLevel` | Not sent | Sent on every item |
| `enchantable` | Not sent | `true` on every worn item |
| `exceedLevel` | `0` on every item | Not sent |

What the detail sends for each internal grade seen:

| `grade` | `gradeName` | `maxEnchantLevel` | Items |
| --- | --- | --- | --- |
| `Unique` | `Unique` | 15 | Greatsword, Guard |
| `Legend` | `Epic` | 10 | Armour, cloak, necklace, earrings, a ring |
| `Rare` | `Rare` | 5 | Ring, bracelet |
| `Rare` | `Rare` | 10 | Amulet, belt (their own cap) |
| `Common` | not seen | not seen | Only on the Lv 12 capture, in the equipment list. The detail call answers `invalid_id` for an item no longer worn. |

So the data's internal `Legend` is the game's Epic. The internal `Epic` (the game's Heroic, by the research) was not
seen on global gear. Pages show `gradeName` when the detail has it, and the name from `data/advisor/grades.json`
otherwise. They never show `Legend`.

The amulet and belt details also say in their text that they enhance with their own scrolls (Amulet Enhance Scroll,
Belt Enhance Scroll). No item detail sends an enchant cost in Kina or stones.
