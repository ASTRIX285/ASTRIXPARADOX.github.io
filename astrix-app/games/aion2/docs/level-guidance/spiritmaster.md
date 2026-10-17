# Spiritmaster level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Spiritmaster builds do at each level, every synergy between Spiritmaster skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/spiritmaster.json` ascent), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account; the Spiritmaster's class id there is `elementalist`). 879 Spiritmaster skill builds listed, all served; full detail read for 878 builds from 677 authors.
- Players clone popular builds, so the 878 hold only 251 distinct configurations. **Every count below is over 167 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says "with copies".
- Tooltip data: questlog's game database for all 35 Spiritmaster skill ids (unlock level, training table, cooldown, MP cost, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- 298 Daevanion plans read (150 distinct and non-empty), from the same 677 authors.
- Levelling builds: four builds titled Lv 20, 30, 40 and 45 from three authors, plus three titled "Leveling". Builds have no character level field, so level bands combine these titles, the training tables and guide advice.
- Caveat (REPORTED, Gladiator record): a questlog skill level is the total level (trained plus Daevanion, rings, gear and Arcana), not trained points alone.
- 74 of the 167 list 5 or more stigmas, which Global does not allow: stigma counts mean "chosen", not "equipped". 72 list exactly four.
- Slots: questlog slot 11 is the left click (Cold Shock in 143 of 143 builds that place it), slot 12 the macro key beside it (137 builds use it), slots 1 to 4 the stacked keys.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37, four on Global | CONFIRMED (Gladiator record; two guides) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20; Lv 16 opens a fifth option | CONFIRMED (tooltip option levels, Gladiator record) |
| Trainer levels | Skill Lv 8 and Lv 10 sold from character level: Cold Shock, Combustion, Fire Spirit, Spirit Strike 19 and 25; Water Spirit 21 and 27; Jointstrike: Curse 22 and 28; Rapid Scattershot 23 and 29; Earth Spirit 25 and 31; Dimensional Control 26 and 32; Soul's Cry 30 and 36; Elemental Fusion 32 and 38; Defiance 34 and 40 | CONFIRMED (tooltip training tables) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026); the Gladiator record's ruling on 10 against 11 is still open | Ruling open (Gladiator record, section 6) |
| Daevanion | Boards open at Lv 12, 20, 30, 40, 45. One +1 node per active skill and per passive on each of the first four boards (two for some passives) | CONFIRMED (questlog node data, boards 51 to 56) |
| Skill unlocks | Cold Shock, Combustion, Fire Spirit 1; Water Spirit 3; Jointstrike: Curse 4; Rapid Scattershot 5; Earth Spirit 7; Dimensional Control 8; Wind Spirit 10; Soul's Cry 12; Elemental Fusion 14; Defiance 16. Passives: Spirit Strike 1, Spirit Protection 6, Spirit's Descent 9, Corrode 11, Spirit Revitalization 13, Mental Focus 15, Consecutive Countercurrent 17, Spirit Communion 21, Revitalization Contract 23, Element Unification 25 | CONFIRMED |
| Cooldowns | Cold Shock, Combustion, Dimensional Control, Elemental Fusion, Rapid Scattershot 0; Curse 10 s; each summon 15 s; Corrode 45 s; Soul's Cry 45 s; Benediction, Flame Blessing, Destructive Attack, Defiance 60 s; Ancient Spirit 90 s | CONFIRMED (tooltip) |
| Elements | Each spirit skill gives one element; four give Four Elements, which Elemental Fusion spends. No new element while you hold Four Elements | CONFIRMED (tooltip) |
| Do the summons share one cooldown? | Each tooltip shows its own 15 s | UNKNOWN in game (MACRO-RESEARCH test 4) |
| How long Dimensional Control stays usable after a spirit skill | "Triggered briefly" | UNKNOWN (no number in the tooltip) |

## 2. Trends by level (counts over 167 distinct builds)

### Core skills, all levels
- Elemental Fusion 162, Combustion 161, Jointstrike: Curse 161, Dimensional Control 159, Fire Spirit 158, Cold Shock 157, Water Spirit 156, Earth Spirit 156, Rapid Scattershot 135, Soul's Cry 127, Wind Spirit 124, Defiance 105.
- Median levels: Elemental Fusion 16, Combustion 16, Curse 14, Fire Spirit 14, Cold Shock 14, Dimensional Control 13, Water Spirit 13, Earth Spirit 12.
- First active skill in the priority list (71 builds have one): Elemental Fusion 22, Combustion 21, Cold Shock 11, Fire Spirit 3. In the top three: Combustion 50, Fire Spirit 44, Elemental Fusion 42, Cold Shock 26, Dimensional Control 7, Curse 6.
- Top players (one stats site, 151 players, "low sample"): every core active 99%, average level 13.2 to 13.7; Rapid Scattershot 89%, Soul's Cry 85%, Wind Spirit 83% (REPORTED).

### Lv 1 to 10
- No Specialty is reachable by training (the earliest trained Lv 8 is at character Lv 19).
- Levelling build titled Lv 20: Combustion, Cold Shock and Fire Spirit at 8, Dimensional Control 6, Curse and Elemental Fusion 5; macro Cold Shock then Curse (REPORTED, 1 author, 21 copies).
- Guides: level the core skills first, do not spread points (REPORTED, 1); MP options early because the class burns MP (REPORTED, 2).

### Lv 10 to 20
- Levelling priority lists, all four builds and three authors: Combustion, Cold Shock, Fire Spirit, Elemental Fusion, Dimensional Control, Curse (REPORTED).
- Lv 30 build: Combustion 12, Fire Spirit 11, Cold Shock 10, Curse and Elemental Fusion 9, Dimensional Control 8 (REPORTED, 14 copies).

### Lv 20 to 30 (stigmas at 22 and 27)
- The Lv 30 levelling build holds two stigmas: Ancient Spirit (stigma Lv 5) and Spirit's Benediction (Lv 4); Ancient Spirit first in its priority list (REPORTED).
- First stigma in the 71 priority lists: Ancient Spirit 29, Benediction 19, Corrode 8 (REPORTED).
- Guides: Ancient Spirit first (REPORTED, 2: one calls it the most important stigma); Corrode first, to stigma Lv 5 (REPORTED, 1, a Kinah seller, treated with care).

### Lv 30 to 45
- All stigmas: Benediction 153, Ancient Spirit 148, Corrode 141, Flame Blessing 100, Destructive Attack 74, Siphon 61, Command: Proxy 36, Seize Magic 36. Top players: Ancient Spirit 96%, Benediction 95%, Corrode 83%, Flame Blessing 74%, Destructive Attack 30% (REPORTED).
- Four-stigma builds (72): Ancient Spirit, Benediction, Corrode, Flame Blessing in 40; Destructive Attack in place of Flame Blessing in 19.
- Lv 40 and 45 levelling builds: Ancient Spirit, Benediction, Corrode, Destructive Attack (REPORTED, 1 author).
- Specialty picks: Combustion +20% speed 118, fewer-targets damage 101, Ashy Call 92, Accuracy 36, MP 10. Elemental Fusion Element Boost 117, extra damage after 3 s 95, regain Four Elements 86, charge 31, AoE 21. Curse cooldown 94, mobile 85, duration 50, crit 48, Multi-Hit 46. Dimensional Control extra damage 100, Multi-Hit 98. Fire Spirit crit damage 106, skill chance 99, stats 75. Cold Shock Attack stack 106, Multi-Hit 81, HP 42, MP 39. Water Spirit Attack 111. Earth Spirit skill chance 96, spirit Damage Tolerance 61.
- Passives: Spirit Strike 96 (median 16), Spirit Revitalization 92, Element Unification 88, Corrode 86, Mental Focus 86. Top players level Spirit Strike highest (14.4). Guides: Spirit Strike first (REPORTED, 3).
- Daevanion (65 plans of 300 to 470 points): all four +1 nodes on Fire Spirit 53, Combustion 51, Cold Shock 48, Spirit Strike 47, Elemental Fusion 46, Curse 46, Mental Focus 46. Top players' most-picked nodes: Combustion, Elemental Fusion, Spirit Strike, Cold Shock, Fire Spirit (REPORTED). Early plans (150 points or fewer, 25): Combustion 19, Elemental Fusion 16, Spirit Strike 16.

### Macro and keys
- The macro key (slot 12, 137 builds): Combustion on the top row in 116. Most common stacks: Curse, Elemental Fusion, Dimensional Control, Combustion (25); Elemental Fusion, Dimensional Control, Curse, Combustion (19); Corrode, Curse, Dimensional Control, Combustion (13).
- Curse sits on the macro key in 94 builds and on a spirit key in 15.
- Elemental Fusion below Dimensional Control (fires first) in 59 builds, the other way in 4.
- Spirit keys (99 builds stack spirits): Fire Spirit summoned last in 57. Most common: Water Spirit, Corrode, Earth Spirit, Fire Spirit (14). Wind Spirit in a spirit stack in 42.
- Game macros (75 builds): Cold Shock in 29 (147 with copies), Elemental Fusion in 46, Water Spirit 30, Curse 23, Corrode 19, Benediction 15 (24 with copies), Ancient Spirit 9.
- Guides: Fire Spirit last so it stays out (REPORTED, 1); buffs by hand, out of the macro (REPORTED, 1), though another guide's sample macro starts with Benediction and Flame Blessing (REPORTED, 1); Destructive Attack never in a macro, it needs a timed release (REPORTED, 1).

### Solo and groups
- Guides: Fire Spirit for farming and charges, Water Spirit when MP is short, Earth Spirit for Enmity, Wind Spirit for HP back (REPORTED, 1). The builds carry no team field. See section 6, point 2.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Each spirit skill gives one element; four give Four Elements, and only then is Elemental Fusion usable | base | CONFIRMED |
| 2 | Holding Four Elements stops new elements: spend Elemental Fusion promptly | base | CONFIRMED |
| 3 | Summon: Ancient Spirit gives Four Elements each time it uses its skill (after 7 basic attacks, 5 at stigma Lv 15) | stigma, base | CONFIRMED |
| 4 | Dimensional Control is usable only briefly after a spirit uses its skill | base | CONFIRMED (window length UNKNOWN) |
| 5 | Fire, Water and Earth Spirit Lv 8 option: 10% more chance to use the spirit skill, so more elements and more Dimensional Control windows | each summon's Lv 8 option | CONFIRMED |
| 6 | Elemental Fusion Lv 16 option: 25% chance to regain Four Elements | its Lv 16 option | CONFIRMED |
| 7 | Curse and Corrode deal damage over time, so Consecutive Countercurrent (extra damage on a target under damage over time) fires | base; passive Lv 17 | CONFIRMED |
| 8 | Corrode: spirits deal 10% more to the target for 20 s; +15% more at stigma Lv 5 | stigma, stigma Lv 5 | CONFIRMED |
| 9 | Benediction: Spirit Strike's Damage Boost counts 1.5 times | stigma Lv 10 | CONFIRMED |
| 10 | Ancient Spirit: Spirit's Descent lasts 30 s, 1.5 times at stigma Lv 10 | stigma | CONFIRMED |
| 11 | Destructive Attack's first hit resets Curse and Corrode | stigma Lv 20 | CONFIRMED |
| 12 | Curse cooldown 10 s to 8 s | its Lv 12 option | CONFIRMED |
| 13 | Rapid Scattershot hits only a staggered target; at Lv 16 each hit cuts all cooldowns by 1 s | base, Lv 16 option | CONFIRMED |
| 14 | Cold Shock restores 100 MP a hit; Dimensional Control 100 MP; each Water Spirit hit 20 MP | base | CONFIRMED |
| 15 | Cold Shock Lv 12 option: each Earth Tremor (its third hit) +2% Attack, up to 5 | its Lv 12 option | CONFIRMED |
| 16 | Element Unification: each spirit skill that lands, +1.1% Critical Damage Boost for 10 s, up to 5 | passive Lv 25 | CONFIRMED |
| 17 | Spirit's Descent: extra damage for 10 s after a summon | passive Lv 9 | CONFIRMED |
| 18 | Spirit Revitalization: 11% chance a hit cuts the summon cooldowns by 1 s | passive Lv 13 | CONFIRMED (not used: no value recorded) |
| 19 | "Dimensional Control before the Earth Spirit is slightly worse" | | REPORTED by one guide, untested: not used |
| 20 | "Rapid Scattershot's cooldown cut may reset buffs after a stagger" | | REPORTED by one guide as still being tested: not used |

How the data holds them: synergy 3 is an `opens` link (Ancient Spirit is a stigma on its own key, so the planner only counts it for the stigma slots). Synergies 1, 4, 5 and 7 link a skill on the spirit line to a skill on the main line, so they are recorded as `feeds` (shown in the data, ignored by the planner): see section 6, point 1.

## 4. The logic check on each trend

The planner scores every choice by the role weights over each skill's values (damage 3, survival 1, MP 1, Enmity and party buff 0: the spirits take the hits and the kit has no party buff), counts a value only once what it rests on is in place, and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| Combustion levelled first while levelling (4 levelling builds, 2 guides) | Always ready, so it is the skill you cast most | PASSED to Lv 13. From Lv 14 Elemental Fusion, the hardest hit, comes first (verdict shown) |
| Elemental Fusion levelled first (22 of 71) | Hardest regular hit, every Four Elements | PASSED from Lv 14 |
| Ancient Spirit as the first stigma (29 of 71 lists, 2 guides, the Lv 30 levelling build) | Gives Four Elements, so it opens Elemental Fusion (synergy 3) | PASSED: slot 1 at Lv 22 |
| Corrode first (one guide) | Worth less than Ancient Spirit, which opens Elemental Fusion | REJECTED: "Slot 1 takes Summon: Ancient Spirit" |
| The four: Ancient Spirit, Benediction, Corrode, Flame Blessing (40 of 72) | Benediction +20% damage for you and the spirit, Corrode +10% spirit damage for 20 s of 45, Flame Blessing extra hits for 10 s | PASSED: slots 2, 3, 4 at Lv 27, 32, 37 |
| Destructive Attack in place of Flame Blessing (19 of 72) | A charged single hit, 60 s, own key; worth less damage over a minute | Ranked 5: listed as a swap, its key kept free |
| Combustion on the macro key's top row (116 of 137) | Always ready: it would block anything above it | PASSED (it sits last) |
| Fire Spirit summoned last (57 of 99, 1 guide) | The last summon is the one that stays out; Fire hits hardest | PASSED |
| Cold Shock in the macro (29 of 75) | It is the main attack, held with the macro key | REJECTED |
| Benediction in the macro (15 of 75) | A 10 s burst buff, own key | REJECTED |
| Rapid Scattershot alone on the macro key (4) | Hits a staggered target only, own key | REJECTED |
| Wind Spirit in the spirit stack (42) | The key holds four already; Wind heals you, worth less than damage for a DPS | REJECTED: "No free row" |
| Curse on the macro key, not the spirit key (94 against 15) | Either key fires it when ready; both stacks pass the stack rule | Not applied: the PR #510 stacks stay; ruling, section 6 |
| Elemental Fusion below Dimensional Control (59 against 4) | Holding Four Elements stops new elements (synergy 2), so spending it first keeps elements flowing; Dimensional Control's window comes back with every spirit skill | Logic agrees with the builds; not applied (it changes the PR #510 stack); ruling, section 6 |
| Fire Spirit Lv 8: critical damage (106) | The skill chance option (99) also feeds elements and Dimensional Control (synergy 5) | REJECTED: the planner picks the skill chance |
| Elemental Fusion charge option (31) | A charge skill cannot sit in a macro | REJECTED (not picked) |
| Curse mobile at Lv 8 (85) | Ties Multi-Hit; keeps the macro from rooting you | PASSED |
| Combustion fewer-targets damage (101) against less MP (10, 2 guides early) | Damage weighs 3, MP 1 | PASSED (damage) |
| Cold Shock Multi-Hit (81) against more MP (39) | Damage weighs 3, MP 1 | PASSED (Multi-Hit) |
| Spirit Strike levelled early (3 guides, top players' highest passive) | +6% PvE Damage Boost for you and your spirit | PASSED: it is the passive the planner levels |
| Daevanion: Combustion, Elemental Fusion, Spirit Strike first | Matches the top players' most-picked nodes | Kept |

## 5. What the planner gives (by hand, no Daeva)

| Level | Spirit line | Main line | Stigmas | Level first | Next |
|---|---|---|---|---|---|
| 1 | Fire Spirit | Combustion (Cold Shock on left click) | from Lv 22: Ancient Spirit | Combustion | Lv 3: Water Spirit joins |
| 5 | Curse, Water Spirit, Fire Spirit | Combustion | none yet | Combustion | Lv 7: Earth Spirit joins |
| 12 | Curse, Earth, Water, Fire Spirit | Dimensional Control, Combustion | none yet | Combustion | Lv 14: Elemental Fusion joins |
| 22 | same | Dimensional Control, Elemental Fusion, Combustion | Ancient Spirit | Elemental Fusion | Lv 27: Benediction in slot 2 |
| 27 | same | same | + Benediction | Elemental Fusion | Lv 30: Vaizel board |
| 32 | same | Corrode, Dimensional Control, Elemental Fusion, Combustion | + Corrode | Elemental Fusion | Lv 37: Flame Blessing in slot 4 |
| 37 | same | same | + Flame Blessing | Elemental Fusion | Lv 40: Triniel board |
| 45 | same | same | Ancient Spirit, Benediction, Corrode, Flame Blessing | Elemental Fusion | none |

One role (DPS), so one answer. The stacks at Lv 45 are the PR #510 stacks unchanged; they keep the "Not confirmed yet" tag (section 6).

## 6. Open points

1. Planner limit: an `opens` link from a skill on one stack to a conditional skill on the other makes the planner put a second copy of the opener on that stack (it looks for an opener in the same stack only). So the spirit links to Elemental Fusion and Dimensional Control are stored as `feeds`, which the planner ignores. Not changed here (brief: no planner changes).
2. Planner limit: the teams are fixed to the tank ones (main tank, off-tank with a Templar, solo). A Spiritmaster solo against in a group (Earth Spirit for Enmity solo, Fire Spirit in a group) cannot be expressed. The guides give no counts for it, so nothing is lost yet.
3. Ruling: move Curse to the main line and fire Elemental Fusion before Dimensional Control, as most builds do (section 4)? Until then the stacks stay as PR #510 set them and the page keeps "Not confirmed yet" on them.
4. Ruling: the Mastery cap, 10 or 11 (Gladiator record).
5. The Daevanion setup line counts only actives and bar skills as "known", so Spirit Strike (a passive) is listed as waiting even when learned; the page shows only the known nodes, so Spirit Strike is left out of "+1 on". Engine side, not changed.
6. In game: do the summons share one cooldown; how long does Dimensional Control stay usable.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (878 Spiritmaster builds, 677 authors; levelling builds 13704, 16290, 10525, 10571), game database skill tooltips (35 Spiritmaster ids plus Cold Shock), Daevanion planner (298 plans) and node data (boards 51 to 56).
- MetaBot: Spiritmaster build data (151 top players, "low sample").
- GAMES.GG Spiritmaster guide (4 Oct 2026); GamesFuze Spiritmaster build (2 Oct 2026); MMOEXP Spirit Master PvE guide (12 Oct 2026, a Kinah seller, treated with care).
- Our records: `MACRO-RESEARCH.md` (Spiritmaster stacks), `level-guidance/gladiator.md` (shared facts).
