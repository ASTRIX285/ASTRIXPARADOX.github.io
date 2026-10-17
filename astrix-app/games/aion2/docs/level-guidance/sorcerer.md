# Sorcerer level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Sorcerer builds do at each level, every synergy between Sorcerer skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/sorcerer.json` ascent), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

The Sorcerer plays one role, DPS. It has no team variants: the team a Sorcerer is in does not change its stigmas or keys in any source read.

## 0. How the builds were read

- questlog.gg public read API (no account). 1,218 Sorcerer skill builds listed, 900 served; full detail read for 914 builds from 686 authors.
- Players clone popular builds, so the 914 hold only 346 distinct configurations. **Every count below is over 242 distinct configurations** (at least 3 active skills with a Specialty pick, clones and empty builds removed) unless it says otherwise. 152 of them carry a skill priority list, 149 a macro, 225 at least one chain (a key with two or more skills stacked).
- Tooltip data: questlog's game database for all 38 Sorcerer skill ids (unlock level, training table, cooldown, MP cost, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- 341 Daevanion plans read (206 distinct and non-empty), and the node list of the Sorcerer Nezekan board (89 nodes, kept as `tools/fixtures/aion2/sorcerer-nezekan-board.json`).
- MetaBot Sorcerer build page: 150 tracked top players at Lv 45 (skills, stigmas, Daevanion skill nodes), plus its editorial levelling and PvP builds.
- Caveat (REPORTED, as for the Gladiator): a questlog skill level is the total level (trained plus Daevanion, gear and Arcana), not trained points alone. Builds have no character level field, so level bands combine build titles (18 levelling builds), the training tables and guide advice.
- 99 of the 242 list 5 or more stigmas, which Global does not allow: stigma counts mean "chosen", not "equipped". 126 list exactly four.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37, four on Global | CONFIRMED (tooltip, MetaBot, ExpCarry) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20. Lv 16 opens a fifth option, not a new slot | CONFIRMED (tooltip option levels; MetaBot and ExpCarry agree) |
| Trainer levels | Skill Lv 8 and Lv 10 are sold only from a character level: Flame Arrow, Ice Chain, Firestorm 19 and 25; Bittercold Wind 21 and 27; Blaze 22 and 28; Flame Scattershot 23 and 29; Frost 25 and 31; Winter's Shackles 26 and 32; Frost Burst 28 and 34; Wish of Concentration 30 and 36; Hellfire 32 and 38; Defiance 34 and 40 | CONFIRMED (tooltip training tables) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). MetaBot says 10 with points | **Ruling needed** (the open Gladiator point; see section 6) |
| Daevanion | Boards open at Lv 12, 20, 30, 40, 45. One +1 node per key skill on each of the first four boards, so at most +4 per skill | Boards CONFIRMED; points earned per character level UNKNOWN |
| Skill unlocks | Flame Arrow, Ice Chain, Firestorm 1; Bittercold Wind 3; Blaze 4; Flame Scattershot 5; Frost 7; Winter's Shackles 8; Frost Burst 10; Wish of Concentration 12; Hellfire 14; Defiance 16. Passives: Fire Mark 1, Robe of Earth 6, Cold Snap 9, Robe of Flame 11, Absorb Essence 13, Grace of Resistance 15, Robe of Cold 17, Grace of Enhancement 21, Revitalization Contract 23, Vitality Evaporation 25 | CONFIRMED |
| Cooldowns | Flame Arrow, Ice Chain, Flame Scattershot 0 s; Firestorm, Blaze 5 s; Frost Burst 10 s; Bittercold Wind 15 s; Frost 30 s; Winter's Shackles, Hellfire 45 s; Wish of Concentration, Defiance 60 s. Stigmas: Delayed Explosion 30 s; Element Enhancement, Fire Wall, Cold Storm, Steel Barrier 60 s; Arctic Armor 90 s; Hibernation 180 s | CONFIRMED (tooltip). These replace the pending cooldowns in our data |
| Hellfire | Charged, 3 charge levels. A macro fires stage 1 only | Charge CONFIRMED (tooltip); stage 1 in a macro REPORTED (daevaguides, aion2vault: 98% of public macros leave it out) |

## 2. Trends by level (counts over 242 distinct builds)

### Core skills, all levels
- Nearly every build levels Firestorm, Blaze, Hellfire, Flame Arrow, Bittercold Wind and Wish of Concentration (skill Lv 8 or more in 233 to 240 of 242, median Lv 16). Winter's Shackles median 15 (233 of 242 at Lv 8 or more). Frost, Frost Burst and Ice Chain median 12. Top players (MetaBot, 150): all of these on the bar, Hellfire, Flame Arrow, Firestorm, Blaze highest (average Lv 13.7).
- First active skill in the priority list (152 lists): Firestorm 59, Wish of Concentration 32, Hellfire 22, Flame Arrow 21. In the top three: Hellfire 99, Firestorm 91, Blaze 89, Wish of Concentration 56. Average rank: Firestorm 2.6, Blaze 3.1, Hellfire 3.1, Wish of Concentration 3.4, Flame Arrow 5.0, Bittercold Wind 5.2, Winter's Shackles 6.0.
- One guide (ExpCarry, a boost seller, read with care): Hellfire first, then Firestorm, Wish of Concentration, Blaze, Bittercold Wind.
- Chains (225 builds): Element Enhancement, Fire Wall, Cold Storm, Delayed Explosion 42; Blaze then Frost Burst 40; Winter's Shackles, Bittercold Wind, Frost, Firestorm 38; Frost then Frost Burst 34; Wish of Concentration then Element Enhancement 22; Frost Burst then Frost 21. In any chain: Frost Burst 177, Frost 154, Wish of Concentration 101, Ice Chain 64, Hellfire 42, Flame Arrow 4. On a key of its own: Flame Arrow 221, Hellfire 184.

### Lv 1 to 10
- No Specialty is reachable by training (the earliest trained Lv 8 is at character Lv 19).
- Levelling builds (18): Firestorm first in 8 of 17 priority lists. ExpCarry and MetaBot's editorial levelling build: keep Flame Arrow for MP, Fire first (Flame Arrow, Firestorm, Blaze on the marked target), slow packs with Ice Chain and Winter's Shackles (REPORTED, 2).

### Lv 10 to 20
- Nezekan opens at 12, Zikel at 20. Early Daevanion plans (150 points or fewer, 22): Firestorm +1 in 15, Robe of Flame 15, Fire Mark 11, Hellfire 10, Bittercold Wind 10.
- Levelling builds' picks: Wish of Concentration extra Attack 18 of 18, Hellfire skill speed 17, Winter's Shackles damage boost 17, Firestorm Hellfire cut 16, Blaze delayed damage 16.

### Lv 20 to 30 (stigmas at 22)
- Levelling stigmas (18): Element Enhancement 18, Delayed Explosion 18, Fire Wall 15, Cold Storm 14, Steel Barrier 5.
- MetaBot's levelling build and its top players: Element Enhancement in slot 1 at Lv 22, Delayed Explosion in slot 2 at Lv 27 (REPORTED).

### Lv 30 to 45
- All stigmas: Element Enhancement 225, Delayed Explosion 192, Fire Wall 177, Cold Storm 157, Steel Barrier 96, Glacial Smite 59, Arctic Armor 58, Soul Freeze 55, Divine Burst 55, Hibernation 51. Exactly four (126): Element Enhancement, Delayed Explosion, Fire Wall, Cold Storm as a set in 86. Top 150 players (MetaBot): Element Enhancement 93%, Delayed Explosion 83%, Fire Wall 76%, Cold Storm 43%, Steel Barrier 35%, Divine Burst 34%.
- Specialty picks: Wish of Concentration extra Attack 218, Combat Speed 189, all cooldowns 10 s shorter 163. Firestorm Hellfire cut 215, skill speed 161, more damage per fireball 147. Winter's Shackles damage boost 211, mobile 73, Frost 40. Flame Arrow Pyroclasm Fire boost 193, Blaze reset 144, Multi-Hit 118, MP 42. Hellfire skill speed 192, cooldown 149, Multi-Hit 144, mobile 70, burn 39. Blaze Multi-Hit 178, Wish cut 148, delayed damage 141, heal 56, MP 22. Bittercold Wind sure crit 166, longer wind 160, mobile 116, pull 62.
- Daevanion (154 plans of 300 points or more): all four +1 nodes on Firestorm 131, Blaze 130, Flame Arrow 129, Wish of Concentration 127, Hellfire 127, Bittercold Wind 124, Winter's Shackles 123. Top players (MetaBot): Hellfire, Blaze, Flame Arrow, Firestorm and Wish of Concentration +1 nodes in 94 to 98%.

### PvP (38 builds titled PvP, Abyss or Arena)
- Stigmas: Element Enhancement 33, Soul Freeze 31, Hibernation 29, Arctic Armor 25, Steel Barrier 22. The planner has no PvP role, so these are recorded only (section 4).

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Fire Mark (passive): every Fire hit marks the target for 5 s | base | CONFIRMED |
| 2 | Blaze fires only on a target with Fire Mark | base | CONFIRMED |
| 3 | Flame Arrow, the held main attack, is a Fire hit, so it keeps Fire Mark up for Blaze | base | CONFIRMED (1 and the Flame Arrow tooltip) |
| 4 | Flame Arrow restores 100 MP a hit, no cooldown | base | CONFIRMED |
| 5 | Blaze restores 100 MP a hit | base | CONFIRMED |
| 6 | Firestorm cuts Hellfire by 2 s per fireball | Firestorm Lv 12 option | CONFIRMED |
| 7 | Blaze cuts Wish of Concentration by 3 s a hit | Blaze Lv 16 option | CONFIRMED |
| 8 | Wish of Concentration cuts all cooldowns by 10 s while it lasts | its Lv 16 option | CONFIRMED |
| 9 | Pyroclasm (Flame Arrow's follow-up) resets Blaze | Flame Arrow Lv 16 option | CONFIRMED |
| 10 | Frost freezes NPC targets for 3 s (100%) | base | CONFIRMED |
| 11 | Frost Burst fires only on a frozen target | base | CONFIRMED |
| 12 | Frost resets Frost Burst when it lands | Frost Lv 8 option | CONFIRMED |
| 13 | Winter's Shackles freezes NPCs (100%) | its Lv 8 Frost option | CONFIRMED |
| 14 | Winter's Shackles: +20% PvE damage for 5 s when it lands | its Lv 8 option | CONFIRMED |
| 15 | Ice Chain cuts Winter's Shackles by 1 s a hit | Ice Chain Lv 12 option | CONFIRMED |
| 16 | Bittercold Wind cuts Frost by 1 s a hit | its Lv 16 option | CONFIRMED |
| 17 | Flame Scattershot fires only on a staggered target, and cuts all cooldowns by 1 s a hit | base; cut at its Lv 16 option | CONFIRMED |
| 18 | Element Enhancement: Fire Attack and Water Attack +20% for 10 s | stigma | CONFIRMED |
| 19 | Element Enhancement makes Robe of Flame count 1.5 times, then Grace of Enhancement | stigma Lv 10, 15 | CONFIRMED |
| 20 | Delayed Explosion: the target takes 15% more from you for 4 s, then the hit lands | stigma | CONFIRMED |
| 21 | Delayed Explosion restores 200 MP; cooldown 20 s | stigma Lv 5; Lv 10 | CONFIRMED |
| 22 | Grace of Enhancement: +20% PvE damage while MP is 25% or more | Lv 21 passive | CONFIRMED |
| 23 | Robe of Earth: +105 Critical Hit while MP is 50% or more | Lv 6 passive | CONFIRMED |
| 24 | Cold Snap: 50% chance of extra damage on a slowed target (Ice Chain, Winter's Shackles, Cold Storm slow) | Lv 9 passive | CONFIRMED |
| 25 | Arctic Armor sends part of the damage to MP while MP is 50% or more | stigma | CONFIRMED |
| 26 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 27 | "Cast a full Hellfire right after Delayed Explosion" (20) | | REPORTED (one build author): follows from 20, not a game rule |

## 4. The logic check on each trend

The planner scores every choice by the role weights over each skill's values (damage 3, survival 1, party buff 1, MP 1), counts a value only once what it rests on is in place (a skill level, a stigma in a slot), and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| Element Enhancement, Delayed Explosion, Fire Wall, Cold Storm as the four (86 of 126; 93, 83, 76, 43% of top players) | Element Enhancement raises every Sorcerer hit (all are Fire or Water); Delayed Explosion raises all your damage on the target; Fire Wall and Cold Storm are damage over time | PASSED, in that slot order: Lv 22, 27, 32, 37 |
| Steel Barrier (96; 35% of top players) | Survival only; worth less than the four to a DPS | Kept as the swap ("if you keep dying"); ranked 5th |
| PvP stigmas (Soul Freeze, Hibernation, Arctic Armor in PvP builds) | No PvP role in the planner | Recorded only. Arctic Armor and Hibernation stay as own-key swaps |
| Firestorm levelled first (59 of 152) | Lv 1 to 3: the best skill you have | PASSED at Lv 1 to 3 |
| Firestorm first, Lv 4 to 13 | Blaze is the same 5 s Fire hit and also restores 100 MP | REJECTED: Blaze first from Lv 4 |
| Hellfire levelled first (22 of 152; one guide; in the top three of 99) | From Lv 14 it is the hardest hit; its Lv 8 pick is a damage pick | PASSED from Lv 14 |
| Frost in the frost stack (154; 38 as Winter's Shackles, Bittercold Wind, Frost, Firestorm) | Our layout keeps Frost and Frost Burst as a pair on their own keys | REJECTED by the planner: "It belongs on its own key". **Ruling needed** (section 6): the published chain is a valid layout too |
| Frost Burst in a chain (177; 40 as Blaze then Frost Burst) | Fires only on a frozen target; our layout presses it after Frost by hand | REJECTED: own key. Same ruling |
| Ice Chain in a chain (64) | The held Flame Arrow already fills every gap and restores MP; Ice Chain costs 120 MP | REJECTED: own key (slow packs while levelling) |
| Wish of Concentration in a chain (101) | A 60 s burst buff: kept for the boss, pressed right after Hellfire once its Lv 16 option cuts all cooldowns (REPORTED, one author) | REJECTED: own key |
| Hellfire in a chain (42) | Charged: a macro fires stage 1 only | REJECTED: own key |
| Wish of Concentration extra Attack at Lv 8 (218) | +10% more Attack against small MP options | PASSED |
| Firestorm skill speed at Lv 8 (161) | More casts against cheaper casts (MP is worth less than damage) | PASSED |
| Winter's Shackles damage boost at Lv 8 (211) | +20% PvE damage for 5 s against mobility or a freeze that only matters for Frost Burst | PASSED |
| Flame Arrow Multi-Hit at Lv 8 (118) | Damage against 20 more MP a hit | PASSED |
| Blaze delayed damage at Lv 8 (141) | A second hit against a small heal or MP | PASSED |
| Bittercold Wind longer wind at Lv 8 (160) | Damage against mobility or a pull | PASSED |
| Hellfire skill speed at Lv 8 (192) | The tooltip gives no numbers to weigh it against the burn (39); both count as damage | Tie: the trend decides |
| Daevanion: Firestorm +1 first (15 of 22 early plans), then Hellfire, Blaze, Flame Arrow, Wish of Concentration (94 to 98% of top players) | Firestorm is learned at Lv 1; Hellfire waits for Lv 14 | PASSED |
| The PR #510 stacks (fire: Element Enhancement, Delayed Explosion, Fire Wall, Blaze; frost: Winter's Shackles, Cold Storm, Bittercold Wind, Firestorm) | No published build has these two stacks. The rows follow the stack rule and every skill in them is in the published chains | The "Not confirmed yet" tag stays on the Skill Bar and Macro screens |

## 5. What the planner gives (by hand, no Daeva)

| Level | Fire stack | Frost stack | Stigmas | Level first | Next |
|---|---|---|---|---|---|
| 1 | (none) | Firestorm | none | Firestorm | Lv 3: Bittercold Wind joins the frost stack |
| 5 | Blaze | Bittercold Wind, Firestorm | none | Blaze | Lv 7: Frost on its own key |
| 12 | Blaze | Winter's Shackles, Bittercold Wind, Firestorm | none | Blaze | Lv 14: Hellfire on its own key |
| 22 | Element Enhancement, Blaze | Winter's Shackles, Bittercold Wind, Firestorm | Element Enhancement | Hellfire | Lv 27: Delayed Explosion |
| 27 | Element Enhancement, Delayed Explosion, Blaze | same | + Delayed Explosion | Hellfire | Lv 30: Vaizel board |
| 32 | Element Enhancement, Delayed Explosion, Fire Wall, Blaze | same | + Fire Wall | Hellfire | Lv 37: Cold Storm |
| 37 and 45 | same | Winter's Shackles, Cold Storm, Bittercold Wind, Firestorm | + Cold Storm | Hellfire | Lv 40 board, then none at 45 |

Flame Arrow is the held main attack at every level. Hellfire, Wish of Concentration, Frost, Frost Burst, Flame Scattershot, Ice Chain and Defiance each have a key of their own from the level they unlock.

## 6. Open points

1. Mastery cap: our record holds 11 from Miguel's in-game capture; MetaBot says 10 with points. In-game check: the Mastery window's highest buyable level for one skill.
2. The stacks: keep the PR #510 two-stack layout, or move to the published chains (Winter's Shackles, Bittercold Wind, Frost, Firestorm; Blaze then Frost Burst)? Needs Miguel's call; the tag stays until then.
3. Daevanion points earned per character level: UNKNOWN, so by hand the plan names the board and its first nodes, not how many points you have.
4. Hellfire's Lv 8 picks (skill speed against the burn): the tooltip gives no numbers, so the trend decides.
5. The planner ranks a Mastery step the trainer cannot sell yet (Hellfire Lv 8 before character Lv 32) next to steps you can buy now. It says so on the step. Raised as a planner follow-up, not changed here.
6. The setup strip names one stack (the first named one), so a Sorcerer sees the fire stack there, not both. A page follow-up, not changed here.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (914 Sorcerer builds, 686 authors; shr1kn's levelling build 8398), game database skill tooltips (38 Sorcerer ids), Daevanion planner (341 plans) and node list (board 61).
- MetaBot: Sorcerer build planner and top-player data (150 tracked; 1,559 top players for combat power), editorial levelling and PvP builds.
- ExpCarry Sorcerer build guide (updated 12 Oct 2026; a boost seller, treated with care).
- AION2 Vault most common macros by class (checked 14 Oct 2026); Daeva Guides macros guide (EUTOPIA and Antochi Sorcerer videos cited there).
- Our records: `MACRO-RESEARCH.md` (the Sorcerer stacks, section 6), `gladiator.md` (method).
