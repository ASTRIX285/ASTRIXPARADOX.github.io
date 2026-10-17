# Chanter level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Chanter builds do at each level and in each role (support, healer, DPS), every synergy between Chanter skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/chanter.json` ascent), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account). 1,688 Chanter skill builds listed, 900 served; full detail read for 940 builds from 747 authors (every public build of each author).
- Players clone popular builds, so the 940 hold 345 distinct configurations. **Every count below is over 281 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says "with copies".
- Roles, by tag and stigma set: **healer** 41 (tag "healer", or Healing Touch or Barrier Spell chosen), **DPS** 75 (tag "dps", or Guardian Blessing, Fracturing Blow, Obliterate or Assault Shock chosen), **support** 165 (the rest). 27 builds are named for levelling ("Leveling", "Early").
- 265 builds hold a skill bar. A bar position is "key.row": key 11 is left click, key 12 the macro key, and "3.0", "3.1" are two rows on key 3.
- Tooltip data: questlog's game database for all 35 Chanter skill ids (unlock level, training table, cooldown, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- 444 Daevanion plans read (268 distinct and non-empty; 178 of 300 points or more, 39 of 150 or fewer).
- Caveats (REPORTED, as for the Gladiator): a questlog skill level is the total level (Mastery plus Daevanion, gear and Arcana), and builds have no character level field, so level bands combine build titles, the training tables and the skill unlock levels. Stigma counts mean "chosen" (140 of the 281 list 5 or more): where a build has a bar, the stigmas on the bar are counted.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37 | CONFIRMED (shared fact, Gladiator record) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20. Each active skill has three Lv 8 options, one Lv 12 and one Lv 16 | CONFIRMED (tooltip option levels; builder data: skills at 12 to 19 hold 2 picks, at 20 hold 3) |
| Trainer levels (skill Lv 8 and 10) | Onslaught, Incandescent Blow, Rushing Smash 19 and 25; Impactful Crush 21 and 27; Dark Crush 22 and 28; Gust Rampage 23 and 29; Heat Wave Blow 25 and 31; Recuperation 26 and 32; Tremor Crush 28 and 34; Wave Blow 30 and 36; Spinning Strike 32 and 38; Defiance 34 and 40 | CONFIRMED (tooltip training tables; every skill level is gated, one more each 3 character levels) |
| Skill unlocks | Onslaught, Incandescent Blow, Rushing Smash 1; Impactful Crush 3; Dark Crush 4; Gust Rampage 5; Heat Wave Blow 7; Recuperation 8; Tremor Crush 10; Wave Blow 12; Spinning Strike 14; Defiance 16. Passives: Blessing of Life 1, Crossguard 6, Protection Circle 9, Inspiring Spell 11, Attack Preparation 13, Impact Hit 15, Raging Spell 17, Earth's Promise 21, Survival Willpower 23, Wind's Promise 25 | CONFIRMED |
| Cooldowns | Onslaught, Incandescent Blow, Gust Rampage 0; Dark Crush 5 s; Heat Wave Blow 10; Impactful Crush, Rushing Smash, Recuperation 15; Tremor Crush, Wave Blow 20; Spinning Strike 30; Defiance 60. Stigmas: Undefeated and Sprint Mantra 5 (toggles), Focused Defense 20, Marchutan's Wrath and Healing Touch 30, Fracturing Blow 45, Obliterate and Ensnaring Mark 60, Impeding Authority 90, Power of the Storm, Guardian Blessing, Assault Shock 120, Barrier Spell 180 | CONFIRMED |
| Stigma levels | Each stigma level costs 1 stigma point for Lv 1 to 5, 2 for 6 to 10, 4 for 11 to 15, 8 for 16 to 20. Stigma Specialties unlock by themselves at stigma Lv 5, 10, 15, 20 (one option each, nothing to pick) | CONFIRMED (tooltip) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). The tooltip training table stops at 10 | Ruling needed (the same open point as the Gladiator record) |
| Daevanion | Boards 81 to 84 open at Lv 12, 20, 30, 40; each holds one +1 node for every Chanter skill and passive | CONFIRMED (node data) |
| Published median skill levels (all builds) | Dark Crush 20; Onslaught, Incandescent Blow, Spinning Strike, Recuperation 16; Rushing Smash 13; Impactful Crush, Wave Blow, Heat Wave Blow, Tremor Crush, Gust Rampage 12 | REPORTED |

## 2. Trends by level (counts over 281 distinct builds)

### Core skills, all levels
- In nearly every build: Onslaught 269, Incandescent Blow 268, Dark Crush 268, Spinning Strike 266, Impactful Crush 265, Rushing Smash 261, Recuperation 261.
- First active skill in the priority list: Dark Crush 84 of 138, Onslaught 32, Spinning Strike 6, Rushing Smash 6.
- Left click: Onslaught in 258 of 265 bars.
- Macro key (key 12): Dark Crush, Spinning Strike, Impactful Crush, Incandescent Blow in 95 of 247 bars (the most common by far). Next: Incandescent Blow alone 45; Dark Crush, Impactful Crush, Marchutan's Wrath, Incandescent Blow 11; with Marchutan's Wrath second 6.
- Macros (144 builds with one): Dark Crush alone 47 (190 with copies); Dark Crush then Onslaught 13; Dark Crush then Incandescent Blow 10; Onslaught then Dark Crush 8 (101 with copies). Dark Crush is the first step in 104 of 138.
- Shared own keys: Tremor Crush then Wave Blow 84; Rushing Smash then Tremor Crush 49; Undefeated then Sprint Mantra 49; Rushing Smash then Heat Wave Blow 28; Wave Blow then Heat Wave Blow 22; Gust Rampage then Heat Wave Blow 18.
- Alone on a key: Recuperation 228, Undefeated Mantra 145, Power of the Storm 143, Sprint Mantra 139, Rushing Smash 137, Gust Rampage 82, Marchutan's Wrath 76.

### Lv 1 to 10
- No Specialty is reachable by training (the earliest trained Lv 8 is at character Lv 19).
- Unlocked: Onslaught, Incandescent Blow, Rushing Smash at 1; Impactful Crush 3; Dark Crush 4; Gust Rampage 5; Heat Wave Blow 7; Recuperation 8; Tremor Crush 10.
- Levelling builds (27): first active skill Dark Crush 10, Onslaught 5 (of 18 with a priority list).

### Lv 10 to 20
- Nezekan opens at 12 (Daevanion), Wave Blow at 12, Spinning Strike at 14, Defiance at 16.
- Early Daevanion plans (150 points or fewer, 39): +1 on Dark Crush 32, Spinning Strike 29, Onslaught 26, Rushing Smash 26. On Nezekan alone: Spinning Strike 25, Attack Preparation 20, Dark Crush, Onslaught, Rushing Smash 19.
- Specialty picks (all builds): Dark Crush always crit 188; Spinning Strike 5 s shorter cooldown 190 and more damage on fewer targets 182; Incandescent Blow more damage on fewer targets 199 (MP cost 57); Onslaught Multi-Hit 138 (MP 38); Impactful Crush mobile 160 (AoE 76); Recuperation two uses 201. At skill Lv 12: Onslaught cuts Spinning Strike 207, Dark Crush Piercing Strike 192, Rushing Smash reset on a kill 169, Impactful Crush skill speed 166, Wave Blow PvE damage cut 113.

### Lv 20 to 30 (stigmas at 22 and 27)
- Levelling builds (27): Undefeated Mantra 27, Sprint Mantra 24, Marchutan's Wrath 24, Power of the Storm 20.
- The guide set (one source) slots Undefeated Mantra, then Sprint Mantra, Power of the Storm, Marchutan's Wrath.

### Lv 30 to 45, by role
- All builds: Undefeated Mantra 263, Sprint Mantra 247, Power of the Storm 223, Marchutan's Wrath 207, Guardian Blessing 86, Focused Defense 85, Impeding Authority 84, Fracturing Blow 79, Healing Touch 73, Ensnaring Mark 50, Barrier Spell 44, Obliterate 41, Assault Shock 20.
- **Support (165):** Undefeated 152, Sprint 144, Marchutan's Wrath 117, Power of the Storm 117, Focused Defense 26, Impeding Authority 17.
- **Healer (41):** Undefeated 40, Sprint 34, Healing Touch 30, Power of the Storm 20, Marchutan's Wrath 13, Barrier Spell 12, Impeding Authority 11. First active skill: Dark Crush 12 of 20, Spinning Strike 3.
- **DPS (75):** Undefeated 69, Sprint 59, Power of the Storm 51, Marchutan's Wrath 41, Guardian Blessing 37, Fracturing Blow 27.
- Daevanion (178 plans of 300 to 802 points): all four +1 nodes on Dark Crush 150, Onslaught 145, Spinning Strike 143, Incandescent Blow 139, Wind's Promise 137, Attack Preparation 137, Recuperation 134. Only one plan is named for healing: no healer plan is sourced.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Impactful Crush makes Dark Crush ready for 2 s | base | CONFIRMED |
| 2 | Spinning Strike makes Dark Crush ready for 2 s | base | CONFIRMED |
| 3 | Marchutan's Wrath makes Dark Crush ready for 3 s | stigma | CONFIRMED |
| 4 | Ensnaring Mark makes Dark Crush ready for 3 s | stigma | CONFIRMED |
| 5 | Spinning Strike: your Critical Damage +15% for 30 s, two stacks, so every Dark Crush crit hits harder | base (Dark Crush always crits from its Lv 8 option) | effect CONFIRMED, link logic |
| 6 | Onslaught cuts Spinning Strike by 1 s a hit | Onslaught Lv 12 option | CONFIRMED |
| 7 | Spinning Strike cooldown 25 s keeps both stacks up | its Lv 8 option | CONFIRMED |
| 8 | Dark Crush has no cooldown | its Lv 16 option | CONFIRMED |
| 9 | Wave Blow fires only on a stunned target | base | CONFIRMED |
| 10 | Impactful Crush stuns NPC targets every time, so Wave Blow can fire | base | CONFIRMED |
| 11 | Tremor Crush stuns NPC targets, so Wave Blow can fire | base | REPORTED (the tooltip ties the Stun to a Dodge or flying; whether NPCs need that is UNKNOWN). 84 bars share the key |
| 12 | Heat Wave Blow can stun (100% on NPCs), so Wave Blow can fire | its Lv 8 option | CONFIRMED |
| 13 | Marchutan's Wrath stuns (100% on NPCs), so Wave Blow can fire | stigma Lv 10 | CONFIRMED |
| 14 | Assault Shock stuns NPC targets | stigma | CONFIRMED |
| 15 | Gust Rampage fires only on a staggered target | base | CONFIRMED |
| 16 | Gust Rampage cuts every cooldown by 1 s a hit | its Lv 16 option | CONFIRMED |
| 17 | Rushing Smash: 50% chance to set off Heat Wave Blow | its Lv 8 option | CONFIRMED |
| 18 | Rushing Smash resets on a kill | its Lv 12 option | CONFIRMED |
| 19 | Power of the Storm: cooldowns 20% shorter for you, 10% for the party, 10 s | stigma (cooldown 90 s at stigma Lv 5) | CONFIRMED |
| 20 | Undefeated Mantra: PvE damage and Damage Tolerance +10.5% for you and the party | stigma | CONFIRMED |
| 21 | Undefeated Mantra does not stack with the Cleric's Light of Protection (the higher level wins) | stigma | CONFIRMED |
| 22 | Power of the Storm does not reach a member with the Cleric's Earth's Blessing | stigma | CONFIRMED |
| 23 | Wave Blow's PvE damage cut does not apply with the Cleric's Debilitating Mark | its Lv 12 option | CONFIRMED |
| 24 | Earth's Promise's Tolerance cut does not apply with the Cleric's Chain of Torment | Lv 21 passive | CONFIRMED |
| 25 | Guardian Blessing makes Crossguard 1.5 times as strong (Lv 10) and Wind's Promise (Lv 15) | stigma Lv 10, 15 | CONFIRMED |
| 26 | Dark Crush extra damage, Fracturing Blow +20%, Raging Spell extra damage on a target under an Impact-type effect; Impact Hit and Rushing Smash (Lv 8 option) make those effects land more | various | effects CONFIRMED; which effects count as Impact-type is UNKNOWN, so the planner gives the link no value |
| 27 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 28 | "Undefeated Mantra and Sprint Mantra on one key" (49 bars) | | REPORTED, not used: both are toggles; a stacked key fires the lowest ready one and could switch a mantra off |

## 4. The logic check on each trend

The planner scores every choice by the role weights over each skill's values (damage, Enmity, survival, party buff, MP), counts a value only once what it rests on is in place, and uses trends only as a small tie-breaker.

Role weights (REPORTED, from how each role is played): support damage 2, party buff 3, survival 1, MP 1; healer survival 3, party buff 2, damage 1, MP 1; DPS (solo and AoE) damage 3, survival 1, MP 1, party buff 0.

| Trend | Logic check | Result |
|---|---|---|
| Main line Dark Crush, Spinning Strike, Impactful Crush, Incandescent Blow (95 of 247 bars) | Dark Crush on the bottom row catches every reset (synergies 1 to 3); Incandescent Blow has no cooldown, so it sits last and blocks nothing | PASSED. The line for every role; it grows with the level (Lv 1 Incandescent Blow, Lv 3 Impactful Crush, Lv 4 Dark Crush, Lv 14 Spinning Strike) |
| Onslaught on left click (258 of 265) | No cooldown, 100 MP a hit | PASSED |
| Onslaught then Dark Crush as the macro (101 with copies) | Onslaught is the main attack, held with the macro key | REJECTED for the line: it stays on left click |
| Marchutan's Wrath in the macro key (17 bars) | The key holds four; Spinning Strike's crit buff is worth more than the swap. A 30 s hit you aim | REJECTED: own key, press it and the line fires Dark Crush next |
| Heat Wave Blow (5) or Wave Blow (4) in the macro | The line is full; Wave Blow needs a stun first | REJECTED: own keys |
| Tremor Crush then Wave Blow on one key (84) | The stun on the bottom row, Wave Blow on the stunned target above (synergies 9, 11) | PASSED: shared key from Lv 12 (Tremor Crush alone from Lv 10) |
| Undefeated Mantra first (263; 40 of 41 healers) | Party damage and Tolerance, always on: the biggest value for every role | PASSED for every role at Lv 22 |
| Sprint Mantra second at Lv 27 (the guide set) | Support: Power of the Storm gives the party more; DPS: Marchutan's Wrath is more damage | REJECTED. Support slot 2 Power of the Storm, slot 3 Marchutan's Wrath, slot 4 Sprint Mantra. DPS slot 2 Marchutan's Wrath, then Power of the Storm, Sprint Mantra |
| Sprint Mantra for a healer (34 of 41) | A 15% heal on a hit is less than a big party heal, a party shield or Barrier Spell | REJECTED: healer set Undefeated Mantra, Healing Touch, Impeding Authority, Barrier Spell |
| Healing Touch for a healer (30 of 41) | The biggest party heal | PASSED: slot 2 at Lv 27 |
| Guardian Blessing for DPS (37 of 75, and the guide set) | +5.4% Max HP for you only is worth less than Power of the Storm (51 of 75) | REJECTED |
| Fracturing Blow for DPS (27 of 75) | A 45 s dash and Defence cut; Sprint Mantra is always on | REJECTED |
| Dark Crush levelled first (84 of 138) | Hardest hit, made ready by three skills | PASSED for support and DPS from Lv 4. REJECTED for the healer: Recuperation goes first once it is out (Lv 8) |
| Onslaught levelled first (32 of 138) | Before Dark Crush (Lv 4) it is the best hit with MP | PASSED to Lv 3 |
| Incandescent Blow lower MP cost (the guide's early pick, 57) | Onslaught already gives 100 MP a hit; more damage on fewer targets (199) is worth more | REJECTED: the planner picks more damage |
| Spinning Strike 5 s shorter cooldown (190) | Keeps both crit stacks up and Dark Crush ready more often | PASSED for every role (the healer's Heal Boost option lifts only your own heals) |
| Earth's Promise | Lowers the target's Tolerance for the whole party | Levelled for support; not for solo DPS |
| Focused Defense (85), Ensnaring Mark (50) | Not in any role set and no role weighs them high enough | Recorded with values; not offered |

## 5. What the planner gives (by hand, no Daeva)

| Level | Support | Healer | DPS |
|---|---|---|---|
| 1 | Line: Incandescent Blow. Level Onslaught | same | same |
| 5 | Line: Dark Crush, Impactful Crush, Incandescent Blow. Level Dark Crush | same, Mastery without Incandescent Blow | same as support |
| 12 | Tremor Crush and Wave Blow share a key; Recuperation on its own key | Recuperation levelled first | as support |
| 22 | Spinning Strike in the line; Undefeated Mantra in slot 1 | same; Recuperation first | same |
| 27 | Power of the Storm in slot 2 | Healing Touch | Marchutan's Wrath |
| 45 | Undefeated, Power of the Storm, Marchutan's Wrath, Sprint Mantra | Undefeated, Healing Touch, Impeding Authority, Barrier Spell | Undefeated, Marchutan's Wrath, Power of the Storm, Sprint Mantra |

## 6. Open points

1. Mastery cap: 11 from Miguel's capture; the tooltip training table stops at 10. In-game check: the Mastery window's highest buyable level for one skill.
2. Healer Daevanion plan: one published plan only. Pending.
3. Team variants: the Chanter's party buffs overlap the Cleric's (synergies 21 to 24). The planner's teams are fixed to the tank teams, so "with a Cleric" cannot be a team yet. Ruling needed if the Chanter should get one.
4. Whether Tremor Crush stuns NPCs without a Dodge first (synergy 11).
5. Which effects count as Impact-type (synergy 26).

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (940 Chanter builds, 747 authors), game database skill tooltips (35 Chanter ids), Daevanion planner (444 plans) and node data.
- Our records: `builds/chanter.json` guides (ExpCarry Chanter guide, MetaBot Chanter build and stigma guide, AION2 Vault macros), `MACRO-RESEARCH.md`.
