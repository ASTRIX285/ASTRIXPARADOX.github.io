# Gladiator level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Gladiator builds do at each level, every synergy between Gladiator skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/gladiator.json` ascent), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account). 1,740 Gladiator skill builds listed, 900 served; full detail read for 555 builds from 382 authors.
- Players clone popular builds, so the 555 hold only 182 distinct configurations. **Every count below is over 141 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says "with copies".
- Tooltip data: questlog's game database for all 40 Gladiator skill ids (unlock level, training table, cooldown, MP cost, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- 209 Daevanion plans read (104 distinct and non-empty), plus builds 9181, 10896 (skill) and 3576, 5406 (Daevanion).
- Caveat (REPORTED by three build authors): a questlog skill level is the total level (trained plus Daevanion, rings, gear and Arcana), not trained points alone. Builds have no character level field, so level bands combine build titles, the training tables and guide advice.
- 54 of the 141 list 5 or more stigmas, which Global does not allow: stigma counts mean "chosen", not "equipped".

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37, four on Global | CONFIRMED (tooltip, two guides) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20. Lv 16 opens a fifth option (Overhead Slam Remove cooldown), not a new slot | CONFIRMED (builder data on 555 builds, tooltip option levels) |
| Trainer levels | Skill Lv 8 and Lv 10 are sold only from a character level: Keen Strike, Rending Blow, Leaping Slam 19 and 25; Overhead Slam 22 and 28; Mocking Blade 21 and 27; Sword Aura Rampage 23 and 29; Ankle Slice 25 and 31; Crushing Wave 26 and 32; Rush Strike 28 and 34; Ruinous Blow 32 and 38; Defiance 34 and 40 | CONFIRMED (tooltip training tables) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). Every source read says the trained cap is 10 | **Ruling needed** (see section 6) |
| Daevanion | Boards open at Lv 12, 20, 30, 40, 45. One +1 node per active skill on each of the first four boards, so at most +4 per skill. 415 points as the Season 1 cap comes from one build title only | Boards CONFIRMED; 415 REPORTED; points earned per character level UNKNOWN |
| Stigma points | 5 at Lv 27, 10 at 32, 15 at 37, 19 at 40, 29 at 45. Stigma Specialties unlock by themselves at stigma Lv 5, 10, 15, 20 | REPORTED (one guide) |
| Skill unlocks | Keen Strike, Rending Blow, Leaping Slam 1; Mocking Blade 3; Overhead Slam 4; Sword Aura Rampage 5; Ankle Slice 7; Crushing Wave 8; Rush Strike 10; Aerial Snare 12; Ruinous Blow 14; Defiance 16. Passives: Experienced Counterstrike 21 | CONFIRMED |

## 2. Trends by level (counts over 141 distinct builds)

### Core skills, all levels
- Rending Blow, Ruinous Blow and Overhead Slam are in 141 of 141. Overhead Slam is levelled highest (median 20, Lv 16 or more in 109).
- First active skill in the priority list: Overhead Slam 58 of 100, Rending Blow 15, Keen Strike 10, Ruinous Blow 8.
- Macro: "Rage Burst, Overhead Slam, Rending Blow" in 11 distinct builds (135 with copies). Other lines: Rage Burst alone 11, Rage Burst then Ruinous Blow 7, Sword Aura Rampage 7, Zikel's Blessing 6, Rage Burst then Ruinous Blow then Lunge Stance 5 (102 with copies).

### Lv 1 to 10
- No Specialty is reachable by training (the earliest trained Lv 8 is at character Lv 19).
- Guides (REPORTED, 3): Keen Strike and Rending Blow first; hold Keen Strike on left click for MP.
- Levelling build 9181: Rending Blow, Keen Strike, Ruinous Blow and Overhead Slam highest.

### Lv 10 to 20
- Nezekan opens at 12, Zikel at 20. Levelling builds (18): Overhead Slam, Rending Blow, Ruinous Blow and Keen Strike Lv 12 or more in 15 of 18 each.
- First picks in levelling builds: Rending Blow mobile 16 of 16, Overhead Slam Upward Strike 15 of 16, Ruinous Blow extra damage 16 of 16, Keen Strike Multi-Hit 10 of 16 and its Ruinous Blow cooldown cut 10 of 16.

### Lv 20 to 30 (stigmas at 22)
- Levelling stigmas (18): Rage Burst 18, Lunge Stance 18, Zikel's Blessing 16, Focused Block 14, Lifestealing Blade 10.
- Guides: Rage Burst is the key stigma because it opens Overhead Slam (REPORTED, 3). One editorial plan slots Zikel's Blessing first at 22, then Lunge Stance, Lifestealing Blade, Rage Burst (REPORTED, 1).

### Lv 30 to 45
- All stigmas: Rage Burst 129, Lunge Stance 125, Zikel's Blessing 124, Focused Block 82, Lifestealing Blade 65, Blade Toss 37, Wave Armor 25, Tenaciousness 21. Top 151 Lv 45 players (one stats site): Lunge Stance 91%, Zikel's Blessing 91%, Rage Burst 73%, Focused Block 62%.
- Specialty picks: Overhead Slam Upward Strike 112, Critical Hit 92, Remove cooldown 91. Rending Blow mobile 120, fewer-targets damage 91, MP on crit 64, +200 Block 8. Ruinous Blow extra damage 105, +30% crit 75, faster speed 43. Keen Strike Ruinous Blow cut 87, Multi-Hit 62, more MP 37.
- Daevanion (72 plans of 300 to 470 points): all four +1 nodes on Ruinous Blow 69, Overhead Slam 68, Rending Blow 67, Keen Strike 52. Early plans (150 points or fewer, 7): Overhead Slam +1 in 7 of 7.

### Tank (9 distinct builds)
- Rage Burst 9 of 9, Focused Block 8, Zikel's Blessing 6, Lunge Stance 6, Wave Armor 2.
- Rending Blow +200 Block 3 of 8, Keen Strike Ruinous Blow cut 8 of 8. No taunt: Enmity comes from Keen Strike, Rending Blow and Overhead Slam (tooltip: "increases Enmity", CONFIRMED). Block the first big hit with Focused Block for the party buff (REPORTED, 3).

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Rage Burst makes Overhead Slam ready on the target for 10 s | Rage Burst slotted | CONFIRMED |
| 2 | Overhead Slam fires only on a knocked-down target (7% on Incapacitated Immunity) | base | CONFIRMED |
| 3 | Mocking Blade knocks down for 3 s, so Overhead Slam can fire | base (Lv 12 option +1 s) | CONFIRMED |
| 4 | Rush Strike knocks down NPC targets every time | base | CONFIRMED |
| 5 | Ankle Slice can knock down (30%) | its first Lv 8 option | CONFIRMED |
| 6 | Wrath Wave and Assault Strike knock down | stigma, base | CONFIRMED |
| 7 | Aerial Snare fires only on a knocked-down target | base | CONFIRMED |
| 8 | Sword Aura Rampage fires only on a staggered target | base | CONFIRMED |
| 9 | Overhead Slam has no cooldown | its Lv 16 option | CONFIRMED |
| 10 | Keen Strike cuts Ruinous Blow by 1 s a hit | Keen Strike Lv 12 option | CONFIRMED |
| 11 | Sword Aura Rampage cuts all cooldowns by 1 s a hit | its Lv 16 option | CONFIRMED |
| 12 | Lunge Stance: 50% chance on a crit to cut all cooldowns by 1 s | stigma Lv 20 | CONFIRMED |
| 13 | Crushing Wave resets on a crit | its Lv 12 option | CONFIRMED |
| 14 | Leaping Slam resets on a kill | its Lv 8 option | CONFIRMED |
| 15 | Rage Burst cooldown 45 s to 30 s | stigma Lv 5 | CONFIRMED |
| 16 | Keen Strike restores 100 MP a hit, no cooldown | base | CONFIRMED |
| 17 | Rending Blow restores 50 MP on a crit (costs 120 MP) | its Lv 16 option | CONFIRMED |
| 18 | Focused Block: 110 MP and stamina on a parry | base | CONFIRMED |
| 19 | Experienced Counterstrike: a block gives you and the party +5.4% PvE damage for 20 s; does not stack with the Templar's Fury | Lv 21 passive | CONFIRMED |
| 20 | Focused Block sets off Experienced Counterstrike | stigma | REPORTED (the tooltip only says it guarantees a parry; whether a parry counts as a block is UNKNOWN) |
| 21 | Rending Blow +200 Block feeds Experienced Counterstrike | its Lv 8 option | REPORTED |
| 22 | Wave Armor makes Experienced Counterstrike count 1.5 times | stigma Lv 10 | CONFIRMED |
| 23 | Ruinous Blow: Prepare for Battle, +20% PvE damage and +100 Critical Hit for 20 s | base | CONFIRMED |
| 24 | Zikel's Blessing +50% stagger gauge damage, so more Sword Aura Rampage | stigma Lv 5 | effect CONFIRMED, link REPORTED |
| 25 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 26 | "Lunge Stance costs 20% less MP" | | REPORTED by one guide, not in the tooltip: not used |
| 27 | "Leaping Slam's knockdown sets up Overhead Slam" | | REPORTED by one site, not in the tooltip (no knockdown): not used |

## 4. The logic check on each trend

The planner scores every choice by the role and team weights over each skill's values (damage, Enmity, survival, party buff, MP), counts a value only once what it rests on is in place (a skill level, a stigma in a slot, a passive unlocked), and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| Main line Rage Burst, Overhead Slam, Rending Blow (11, 135 with copies) | Rage Burst opens Overhead Slam (synergy 1); Rending Blow is always ready, so it sits on top and blocks nothing | PASSED. The planner's line from the slot that holds Rage Burst |
| Before Rage Burst: no line in any build | Overhead Slam needs a knockdown (2). Mocking Blade knocks down (3) and is not an own-key skill | Logic adds Mocking Blade in Rage Burst's row from Lv 4 until Rage Burst is slotted (Lv 22 DPS, 27 main tank) |
| Rush Strike as the opener for Overhead Slam (4) | A dash: own key, the macro would pull you out of position | REJECTED for the line; it stays on the movement key |
| Rage Burst then Ruinous Blow as the macro (7) | Ruinous Blow is a dash (own key) | REJECTED: "It belongs on its own key" |
| Lunge Stance in the macro (5, 102 with copies) | A 10 s burst buff, own key | REJECTED |
| Zikel's Blessing as a macro line (6) | Burst buff, own key | REJECTED |
| Sword Aura Rampage as a macro line (7) | Fires only on stagger; own key | REJECTED |
| Rage Burst as the first stigma (18 of 18 levelling) | Opens the main line's hardest hit | PASSED for DPS, off-tank and solo. For a main tank Focused Block scores higher at Lv 22 (its block buff counts, synergy 19), so Rage Burst goes in slot 2 at Lv 27 |
| Zikel's Blessing first at Lv 22 (one editorial plan) | Worth less than Rage Burst, which opens Overhead Slam | REJECTED |
| Keen Strike and Rending Blow first while levelling (guides) | Before Rage Burst, Overhead Slam fires only after a knockdown, so its value is low | PASSED to Lv 21: the planner levels Rending Blow, then Keen Strike or Overhead Slam |
| Overhead Slam levelled first (58 of 100) | Once Rage Burst is slotted, Overhead Slam fires every pass in the window | PASSED from Lv 22 (DPS) |
| Experienced Counterstrike second for a tank (build 10896) | Its party buff counts only with no Templar | PASSED for a main tank; lower for an off-tank with a Templar and when solo |
| Rending Blow +200 Block for a tank (3 of 8) | Survival and the party buff (21) | PASSED for a main tank; solo picks mobile (no party to buff) |
| Ruinous Blow faster speed at Lv 8 (our DPS build, 43 builds) | +30% crit is worth more damage (75 builds agree) | REJECTED: the planner picks +30% crit |
| Rending Blow mobile for DPS (120) | Keeps the macro from rooting you | PASSED |
| Lifestealing Blade (65) | No tooltip values recorded for it yet | Not a candidate yet (UNKNOWN value) |
| Crushing Wave in the line's empty row (1 build) | Too few builds; the published line leaves row 2 empty on purpose | Not offered |

## 5. What the planner gives (by hand, no Daeva)

| Level | DPS | Tank, main tank | Tank, off-tank with a Templar | Tank, solo |
|---|---|---|---|---|
| 1 | Line: Rending Blow. Level Rending Blow, Keen Strike | same | same | same |
| 5 | Line: Mocking Blade, Overhead Slam, Rending Blow | same | same | same |
| 22 | Rage Burst in slot 1, line Rage Burst, Overhead Slam, Rending Blow; level Overhead Slam | Focused Block in slot 1; Mocking Blade stays; Experienced Counterstrike levelled second | Rage Burst in slot 1 | Rage Burst in slot 1 |
| 27 | Lunge Stance in slot 2 | Rage Burst in slot 2 | Focused Block in slot 2 | Zikel's Blessing in slot 2 |
| 45 | Rage Burst, Lunge Stance, Zikel's Blessing, Focused Block | Focused Block, Rage Burst, Zikel's Blessing, Wave Armor | Rage Burst, Focused Block, Zikel's Blessing, Lunge Stance | Rage Burst, Zikel's Blessing, Lunge Stance, Focused Block |

## 6. Open points

1. Mastery cap: our record holds 11 from Miguel's in-game capture; every source read says 10. In-game check: the Mastery window's highest buyable level for one skill.
2. Daevanion points earned per character level: UNKNOWN, so by hand the plan names the board and its first nodes, not how many points you have.
3. Whether a Focused Block parry counts as a block for Experienced Counterstrike: UNKNOWN from the tooltip.
4. Lifestealing Blade, Wrath Wave, Armor of Balance, Assault Strike and the passives other than Experienced Counterstrike have no catalogue record yet, so the planner gives them no value.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (555 Gladiator builds, 382 authors; grobmotoriker builds 9181, 10896), game database skill tooltips (40 Gladiator ids), Daevanion planner (209 plans; builds 3576, 5406).
- MetaBot: Gladiator build data (151 top players), class page, stigma guide (updated 15 Oct 2026).
- Destructoid Gladiator build (1 Oct 2026); GAMES.GG Gladiator PvE build (4 Oct 2026); GamesFuze Gladiator build (2 Oct 2026); MMOEXP PvE and tank guides (1 Oct 2026, a Kinah seller, treated with care); AllThingsHow (12 Oct 2026); KeenGamer best PvE builds (6 Oct 2026); Power Up Gaming Daevanion builds (1 Oct 2026); Vortex Gaming; aion2vault builds.
- Not readable: thegameswiki (429), mobalytics (403), exitlag (403). Not found: expcarry, dbaion2, daevaguides, mein-mmo Gladiator guides.
- Our records: `GLADIATOR-TANK.md`, `MACRO-RESEARCH.md`.
