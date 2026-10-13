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

## Item level and the full slot list (checked 11 Oct 2026)

Read through the live Worker for field shapes only; nothing from these reads is saved.

- **Item level.** The equipment list sends none. In the item detail, `level` is the item level and `levelValue` is the
  enchant level (it always equals `enchantLevel`). Checked on every grade worn:

  | Grade | Item | `level` | `levelValue` | `enchantLevel` |
  | --- | --- | --- | --- | --- |
  | Unique | Spiritforged Greatsword | 45 | 3 | 3 |
  | Unique | Wisdom Guard | 36 | 11 | 11 |
  | Epic (`Legend`) | Pilgrim Helm | 41 | 0 | 0 |
  | Rare | Noble Belt | 13 | 6 | 6 |
  | Common | a Lv 11 Daeva's worn armour | 9 | 0 | 0 |
  | Common | the same Daeva's weapon at +1 | 1 | 1 | 1 |

  `equipLevel` is the level needed to wear it, a third value. The Gear page shows `level` on the tile's top corner, and only
  once the detail has been read. To confirm in game: open the tooltip of an item and compare its item level.
- **Common in the detail.** `gradeName` is `Common` and `maxEnchantLevel` is 5.
- **Every worn slot the data uses**, read from several Lv 45 Daevas:

  | Range | Slots |
  | --- | --- |
  | 1 to 8 | the eight main slots, the only ones listed even when empty |
  | 10 to 17 | Necklace, Earring1, Earring2, Ring1, Ring2, Bracelet1, Bracelet2, Belt |
  | 19, 22 | Cape, Amulet |
  | 23, 24 | Rune1, Rune2: item detail grade `Special`, category Rune, cap 10 |
  | 41 to 45 | Arcana1 to Arcana5: category such as Chalice, grade such as `Rare`, cap 3 |

  That is 25 worn slots. 9, 18, 20 and 21 were not seen. `data/gear-slots.json` lists all 25 and marks the 17 outside
  the main eight `listed: false`, so an unworn accessory, rune or Arcana is never an empty slot to fill.
## Stats (checked 11 Oct 2026)

`info.stat.statList` has 17 rows on both Daevas read through the live Worker: a Lv 45 Gladiator (the renamed
`lv45-info.json`) and a Lv 10 Sorcerer (shape only, nothing saved).

| Rows | `type` | Notes |
| --- | --- | --- |
| 6 main stats | `STR`, `DEX`, `INT`, `CON`, `AGI`, `WIS` (Might, Dexterity, Intelligence, Constitution, Precision, Willpower) | |
| 10 deity stats | `Justice`, `Freedom`, `Illusion`, `Life`, `Time`, `Destruction`, `Death`, `Wisdom`, `Destiny`, `Space` | names carry the lord: `Time [Siel]` |
| Item level | `ItemLevel`, name in Korean (`아이템레벨`) | the profile's item level; not a stat |

Each stat row with points carries `statSecondList`: the game's own words for what those points give, for example
Might 15 gives `Attack increase +1.5%`, Time [Siel] 37 gives `Combat Speed +3.7%` and `Double Resist +3.7%`. Every effect is
0.1% per point. A stat at 0 sends `statSecondList: null` (every row on the Lv 10 Daeva). The adapter keeps all 16 stats with
these lines as `effects` and drops the ItemLevel row.

## More character info (captured 12 Oct 2026, Lv 45)

`lv45-character.json` is one `/aion2/character` response (info, equipment and meta together) for a Lv 45 Elyos
Gladiator on Meslamtaeda, EU. Miguel opened the Worker link in Chrome and saved it with Ctrl+S; this cloud session could
not reach the Worker. It is renamed: TESTDAEVA, a test character id, no portrait, legion TESTLEGION.

| Field | What it holds | Where |
| --- | --- | --- |
| Legion | `profile.regionName`: the legion name; an empty string with no legion (5 Oct and 11 Oct captures) | `info.profile` |
| Title shown | `titleName`, `titleId`, `titleGrade`: the one name the Daeva shows, cosmetic | `info.profile` |
| Equipped effects | `title.titleList`: one entry per `equipCategory` (`Attack`, `Defense`, `Etc`), the title set there, its `equipStatList` and `statList`, and `ownedCount` / `totalCount` / `ownedPercent` for that category | `info.title` |
| Title counts | `title.ownedCount` 59, `title.totalCount` 297 overall | `info.title` |
| Exceed level | `exceedLevel` on every worn item, `0` on all of them here | `equipment.equipment.equipmentList[]` |
| Gear skins | `skinList`: five skins with slot, name, grade and icon | `equipment.equipment` |
| Wing skin | `wingSkin` (the same wings here) | `equipment.petwing` |
| Board percent | `openPercent` per board (Nezekan 51, Zikel 48, Vaizel 24) | `info.daevanion.boardList[]` |
| Ranking | `rankingList: null` | `info.ranking` |
| Arcana | none worn: no slot 41 to 45 in the list | `equipment.equipment.equipmentList[]` |

Title effects (confirmed in game by Miguel, 12 Oct 2026): `equipStatList` works only while the title is set as the
equipped effect for its category; `statList` is always on once the title is owned. In the game's Title window a title not
set as an effect shows its top lines greyed and its bottom line lit. Recorded in `data/advisor/mechanics.json`
(`title-effects`).

Counts do not agree yet: the game's Title window shows "Total Collection Status 16/95" while this capture says 59 of 297
overall and 25 of 99, 19 of 103, 15 of 95 per category. Pages show the per-category owned of total only, never an overall
total, until one category is checked in game.

Not built, no data: ranking (null in every capture). Arcana slots show empty until a capture has one worn.
