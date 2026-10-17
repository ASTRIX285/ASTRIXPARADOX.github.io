# Templar level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Templar builds do at each level, every synergy between Templar skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/templar.json` ascent and macro block), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account), the same procedures as the Gladiator record. The list reports 1,575 Templar skill builds and serves 1,080; full detail read for every author of those (671 authors), which returned 951 Templar builds.
- Players clone popular builds: the 951 hold 405 distinct configurations. 330 have at least 3 Specialty picks; 43 of those are PvP only. **Every count below is over 287 distinct PvE configurations** unless it says otherwise.
- Role split by title, tags and description: tank 44, DPS (offensive, solo, farm, AoE) 41, both 27, not stated 175. Levelling builds (title or tags say levelling, early, story): 35.
- Stacks: a build's `slotId` is "key.row", so the builder records which skills share a key and in which row. Row 0 fires first. This is the best record of real stacks; the macro steps are fewer and messier.
- Tooltip data: questlog's game database for all 35 Templar skill ids (unlock level, training table, cooldown, MP cost, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- Top players: one stats site's Templar page (153 top Lv 45 players with a bar read, 1,561 tracked), read 17 Oct 2026.
- Daevanion: 445 Templar plans from the same authors, 267 distinct and non-empty, with every board and node cost.
- Caveat (REPORTED, Gladiator record): a questlog skill level is the total level (trained plus Daevanion, gear and Arcana). Builds have no character level field, so level bands come from titles, the training tables and guide advice.
- Questlog lets a build list more than 4 stigmas; only 115 of 287 list exactly four. Stigma sets below use those 115 (tank 23, DPS 14, levelling 14).

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37 | CONFIRMED (tooltip; stats site) |
| Specialty slots | Skill Lv 8, 12, 20 (the stats site says the same) | CONFIRMED |
| Trainer levels (skill Lv 8 and 10) | Vicious Strike, Pummel, Poach 19 and 25; Shield Smite 21 and 27; Judgment 22 and 28; Flash Rampage 23 and 29; Debilitating Smash 25 and 31; Warding Strike 26 and 32; Shield Rush 28 and 34; Annihilate 30 and 36; Punishment 32 and 38; Defiance 34 and 40; Insulting Roar 35 and 41; Fury every level at 21 | CONFIRMED (tooltip training tables) |
| Skill unlocks | Vicious Strike, Pummel, Poach 1; Shield Smite 3; Judgment 4; Flash Rampage 5; Debilitating Smash 7; Warding Strike 8; Shield Rush 10; Annihilate 12; Punishment 14; Defiance 16. Passives: Insulting Roar 17, Fury 21 | CONFIRMED |
| Cooldowns | Vicious Strike, Pummel, Flash Rampage 0; Judgment 5; Shield Smite, Debilitating Smash 10; Poach 15; Annihilate, Shield Rush, Shield of Protection 20; Warding Strike, Punishment, Doom Shield, Taunt 30; Executing Blade 45; Defiance, Empyrean Lord's Punishment, Nezekan's Shield 60; Battlefield Banner, Second Skin 90; Noble Armor 120 (seconds) | CONFIRMED |
| MP | Vicious Strike restores 100 a hit; Pummel costs 120; Shield Smite 100; Warding Strike, Annihilate, Punishment, Empyrean Lord's Punishment 200 | CONFIRMED |
| Mastery cap | The same open point as the Gladiator record: we hold 11, sources say 10 | Ruling needed (Gladiator record, section 6) |
| Daevanion | Boards Nezekan 12, Zikel 20, Vaizel 30, Triniel 40, Azphel 45; one +1 node per active skill and passive on each of the first four | CONFIRMED |

## 2. Trends by level (counts over 287 distinct PvE builds)

### All levels
- Every active skill but Defiance is in 250 or more of 287 (Flash Rampage 196, Defiance 136).
- Published stacks (rows from row 0): "Doom Shield, Judgment, Shield Smite, Warding Strike" 36; "Debilitating Smash, Annihilate, Pummel" 36; "Judgment, Shield Smite, Warding Strike, Pummel" 33; "Judgment, Warding Strike, Shield Smite, Pummel" 28; "Judgment, Shield Smite, Warding Strike" 20; "Debilitating Smash, Annihilate" 19.
- Judgment is in row 0 of a stack in 150 builds. Pummel is the last row of its stack in 181 of 197.
- Own keys: Vicious Strike 257 (left click), Poach 218, Punishment 171, Shield Rush 171, Shield of Protection 116.
- First active skill in a priority list: Judgment 102 of 172, Vicious Strike 13, Pummel 7. Commonest start "Judgment, Vicious Strike, Punishment" (24).
- Top players (153): every active but Defiance on the bar in 88% or more; average skill Lv: Judgment 13.8, Vicious Strike 13.6, Punishment, Warding Strike, Pummel 13.3.

### Lv 1 to 10
- No Specialty is reachable by training before character Lv 19 (Vicious Strike, Pummel, Poach Lv 8).
- Levelling build copied 66 times (REPORTED): "Spam Pummel and the macro; swap to Vicious Strike and Warding Strike once Vicious Strike and Judgment are Lv 12".
- Levelling priority lists (31): Judgment first 15, Pummel 5, Vicious Strike 4, Warding Strike 4.

### Lv 10 to 20
- Levelling builds take Poach's "reset on kill" Lv 8 option for questing (one guide, REPORTED; 58 builds overall).
- Daevanion plans of 150 points or fewer (26): +1 on Judgment 17, Vicious Strike 15, Pummel 14, Punishment 12.

### Lv 20 to 30 (stigmas at 22)
- Levelling four-stigma sets (14): Doom Shield 12, Noble Armor 11, Taunt 11, Battlefield Banner 6, Shield of Protection 6, Empyrean Lord's Punishment 6.
- Editorial levelling plan on the stats site: Taunt at 22, Empyrean Lord's Punishment 27, Battlefield Banner 32, Doom Shield 37 (REPORTED, 1).
- A guide built on a Korean early-game guide (REPORTED, 1): Shield of Protection, Noble Armor, Taunt, plus Doom Shield in daily dungeons; Empyrean Lord's Punishment in stagger dungeons.

### Lv 30 to 45
- All four-stigma sets (115): Doom Shield 84, Noble Armor 81, Battlefield Banner 79, Taunt 72, Shield of Protection 49, Empyrean Lord's Punishment 35, Nezekan's Shield 20, Executing Blade 18. Top players: Taunt 76%, Empyrean Lord's Punishment 67%, Battlefield Banner 65%, Doom Shield 61%, Shield of Protection 61%, Noble Armor 37%, Nezekan's Shield 24%, Executing Blade 19%.
- Specialty picks: Punishment +30% Skill Speed 217; Vicious Strike Warding Strike cut 205; Shield Smite -2 s 196; Annihilate -10 s 195; Warding Strike -5 s 192; Shield Rush -10 s 190 and +10 m 187; Pummel Punishment cut 182; Judgment extra damage on hit 179, Critical Hit 175, Remove cooldown 148; Debilitating Smash +3 s Debilitate 170; Shield Smite sets off Debilitating Smash 159; Vicious Strike +50% Multi-Hit 138.
- Daevanion (162 plans of 300 to 470 points): all four +1 nodes on Judgment 148, Warding Strike 133, Fury 131, Pummel 129, Vicious Strike 126, Punishment 126, Insulting Roar 123. Top players: Punishment +1 (Zikel) 98%, Judgment +1 (Nezekan) 97%, Vicious Strike +1 (Zikel) 96%, Warding Strike +1 (Nezekan) 95%.

### Tank (44 builds; 23 with four stigmas)
- Taunt 21 of 23, Noble Armor 17, Shield of Protection 11, Doom Shield 11, Battlefield Banner 10, Empyrean Lord's Punishment 7, Nezekan's Shield 7. Commonest set: Battlefield Banner, Noble Armor, Shield of Protection, Taunt (5).
- First stigma in a tank priority list: Shield of Protection 9, Noble Armor 5, Taunt 4.
- Taunt's Lv 5 option (target takes 10% more PvE damage) 33 of 44.
- A tank guide (REPORTED, 1): Taunt after a res (aggro resets), Doom Shield when aggro is stable, Shield of Protection and Nezekan's Shield only for a boss that needs them.

### DPS (41 builds; 14 with four stigmas)
- Doom Shield 13 of 14, Battlefield Banner 12, Noble Armor 12, Empyrean Lord's Punishment 7, Shield of Protection 5, Taunt 3. Commonest set: Battlefield Banner, Doom Shield, Empyrean Lord's Punishment, Noble Armor (5; 12 over all roles).
- Battlefield Banner and Noble Armor share a key in 71 of 287 builds.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Shield Smite makes Judgment ready for 2 s | base | CONFIRMED |
| 2 | Warding Strike makes Judgment ready for 2 s | base | CONFIRMED |
| 3 | Shield Rush makes Judgment ready for 2 s | base | CONFIRMED |
| 4 | Doom Shield makes Judgment ready for 3 s | stigma | CONFIRMED |
| 5 | Judgment fires once a shield skill has made it ready (three guides; 150 builds put it in row 0 above the skills that ready it, 148 take Remove cooldown, which only works if it waits on that) | base | REPORTED (the tooltip says the shield skills "trigger" it; whether it can fire without them is UNKNOWN) |
| 6 | Judgment has no cooldown | its Lv 16 option | CONFIRMED |
| 7 | Annihilate fires only on a stunned or knocked-down target (5% on Incapacitated Immunity) | base | CONFIRMED |
| 8 | Shield Smite stuns NPCs every time, so Annihilate can fire | base | CONFIRMED |
| 9 | Shield Rush stuns NPCs every time | base | CONFIRMED |
| 10 | Doom Shield knocks NPCs down every time | stigma | CONFIRMED |
| 11 | Empyrean Lord's Punishment stuns NPCs every time | stigma | CONFIRMED |
| 12 | Debilitating Smash stuns NPCs | its Lv 8 option | CONFIRMED |
| 13 | Poach stuns NPCs | its Lv 16 option | CONFIRMED |
| 14 | Doom Shield resets Annihilate on hit | stigma Lv 5 | CONFIRMED |
| 15 | Vicious Strike cuts Warding Strike by 2 s a hit | its Lv 12 option | CONFIRMED |
| 16 | Pummel cuts Punishment by 1 s a hit | its Lv 12 option | CONFIRMED |
| 17 | Flash Rampage fires only on a staggered target | base | CONFIRMED |
| 18 | Flash Rampage cuts all cooldowns by 1 s a hit | its Lv 16 option | CONFIRMED |
| 19 | Shield Smite sets off Debilitating Smash half the time | its Lv 8 option | CONFIRMED |
| 20 | Fury: a Block gives you and the party +5.5% PvE damage for 20 s | Lv 21 passive | CONFIRMED |
| 21 | Shield of Protection guarantees a Block, so it sets off Fury | stigma | CONFIRMED (both tooltips say Block) |
| 22 | Fury does not stack with a Gladiator's Experienced Counterstrike | | CONFIRMED (Gladiator tooltip, Gladiator record) |
| 23 | Taunt's Shrink does not stack with a Gladiator's Wounded (Rage Burst) | | CONFIRMED (Gladiator tooltip) |
| 24 | Noble Armor: Insulting Roar counts 1.5 times | stigma Lv 10 | CONFIRMED |
| 25 | Noble Armor: Fury counts 1.5 times | stigma Lv 15 | CONFIRMED |
| 26 | Noble Armor adds Defense +5%; Battlefield Banner gives Attack in proportion to Defense | stigma Lv 5 | effects CONFIRMED, the link REPORTED (71 builds share a key for the two) |
| 27 | Warding Strike +100 Block, Doom Shield +200 Block, Warding Shield +200 Block, Second Skin +20% Block feed Fury | options and passive | effects CONFIRMED, more Fury procs REPORTED |
| 28 | Punishment: Executor, Accuracy +200 and PvE damage +20% for 20 s | base | CONFIRMED |
| 29 | Insulting Roar: Enmity Boost +100% | Lv 17 passive | CONFIRMED |
| 30 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 31 | "Pummel has to be on top of Judgment" | | REPORTED by one guide; the wording does not match the row rule (row 0 fires first) and 181 builds put Pummel last: not used |

## 4. The logic check on each trend

The planner scores every choice by the role weights over each skill's values (damage, Enmity, survival, party buff, MP), counts a value only once what it rests on is in place (a skill level, a stigma in a slot, a passive unlocked), and uses trends only as a small tie-breaker. Tank weights: damage 2, Enmity 3, survival 2, party buff 3, MP 1. DPS weights (solo and AoE): damage 3, Enmity 0, survival 1, party buff 0, MP 1.

| Trend | Logic check | Result |
|---|---|---|
| Shield stack "Judgment, Shield Smite, Warding Strike" (Judgment row 0 in 150) | Judgment waits until a shield skill readies it, so in row 0 it never blocks; Shield Smite and Warding Strike sit on the same key and ready it | PASSED. The planner's shield stack |
| Doom Shield on top of the Judgment stack (49 builds; it was row 0 of stack A in our data from PR #510) | A 20 m dash: in a macro it pulls you across the room. Three guides that explain their bar keep it on its own key ("you don't want to dash into bosses randomly"), and 62 builds do. Same rule as the Gladiator's Ruinous Blow | REJECTED for the stack: Doom Shield has its own dash key. Data changed: stack A no longer holds it |
| Smash stack "Debilitating Smash, Annihilate, Pummel" (36) | Pummel has no cooldown, so it goes last; Annihilate waits on a stun, which Shield Smite in the other stack gives (both stacks run in the same macro) | PASSED |
| Flash Rampage in a stack (78; under Pummel in 29), own key (63) | It fires only on a staggered target and has no cooldown: in a stack it never blocks, and it fires the moment a boss staggers | PASSED: Flash Rampage sits above Pummel in the smash stack from Lv 5 |
| Taunt in a stack or the macro (99 stacks, 24 macros) | A pull of Enmity you time: on the pull and after a res | REJECTED: "It belongs on its own key" |
| Battlefield Banner and Noble Armor on one key (71) | Fine in game by the builds, but the app's bar rule allows a stigma only on stack A or B | Kept on two keys. Ruling needed (section 6) |
| Judgment levelled first (102 of 172) | Your main hit, made ready by every shield skill | PASSED from Lv 4, both roles |
| Pummel levelled first while levelling (copied 66 times) | Before Lv 4 there is no Judgment; from Lv 4 Judgment is worth more | REJECTED from Lv 4. At Lv 1 to 3 the DPS levels Pummel first, the tank Vicious Strike (Enmity) |
| Warding Strike first for a tank (6 of 35) | Survival counts, but Judgment holds Enmity and damage | REJECTED: Judgment first |
| Taunt in 21 of 23 tank sets, 76% of top players | Enmity and Shrink for the party | PASSED for the tank, slot 2 at Lv 27 |
| Taunt at Lv 22 (editorial plan) | From Lv 21 Fury makes Shield of Protection's sure Block a party buff, which a tank weighs most | REJECTED: slot 1 takes Shield of Protection |
| Shield of Protection (tank 11 of 23, top 61%) | Sure Block, MP, Fury's party buff | PASSED for the tank, slot 1 at Lv 22 |
| Noble Armor (tank 17 of 23, DPS 12 of 14) | 120 s of extra HP; later multiplies Insulting Roar and Fury (tank) | PASSED for both, slot 4 at Lv 37 |
| Doom Shield (DPS 13 of 14, tank 11 of 23) | Readies Judgment, knocks NPCs down for Annihilate | PASSED: DPS slot 1 at Lv 22, tank slot 3 at Lv 32 |
| Empyrean Lord's Punishment (top 67%; DPS 7 of 14, tank 7 of 23) | A heavy AoE hit that opens Annihilate | PASSED for the DPS (slot 2 at Lv 27). REJECTED for the tank: ranks 6th, the tank's four are worth more |
| Battlefield Banner (top 65%; tank 10 of 23) | Attack from Defense for 10 s | PASSED for the DPS (slot 3 at Lv 32). REJECTED for the tank: ranks 7th |
| Taunt for a DPS (3 of 14) | No Enmity to hold in a solo or AoE role | REJECTED |
| Shield of Protection for a DPS (5 of 14) | No party for Fury; survival weighs little | REJECTED: ranks 5th |
| Punishment +30% Skill Speed (217) over damage over time (117) | Equal damage value; the trend breaks the tie | PASSED |
| Judgment extra damage on hit (179) over extra damage on Impact-type status (2) | On-hit always counts; which statuses are Impact-type is UNKNOWN | PASSED |
| Warding Strike -5 s (192) over heal over time (111) | More Warding and more Judgment | PASSED for both roles |
| Vicious Strike +50% Multi-Hit (138) over absorb HP (48) | Damage for the DPS; for the tank the two tie and the trend picks Multi-Hit | PASSED |
| Second Punishment and Warding Strike picks at Lv 8 (damage over time 117, heal over time 111) | The planner holds one pick per option level, so slot 2 takes the Lv 12 option | Not expressible yet (section 6) |
| Daevanion +1 on Judgment, Vicious Strike, Punishment, Pummel, Warding Strike | The five key skills | PASSED: they are both roles' skill nodes; Fury and Insulting Roar +1 named for the tank |

## 5. What the planner gives (by hand, no Daeva)

| Level | Tank | DPS |
|---|---|---|
| 1 | Smash stack: Pummel. Hold Vicious Strike. Level Vicious Strike, then Pummel | Same bar. Level Pummel, then Vicious Strike |
| 5 | Shield stack: Judgment, Shield Smite. Smash stack: Flash Rampage, Pummel. Level Judgment first | Same bar. Level Judgment, then Pummel |
| 12 | Shield stack: Judgment, Shield Smite, Warding Strike. Smash stack: Debilitating Smash, Annihilate, Flash Rampage, Pummel | Same stacks; Annihilate levelled before Warding Strike |
| 22 | Shield of Protection in slot 1; Insulting Roar and Fury join the Mastery list | Doom Shield in slot 1 (own dash key) |
| 27 | Taunt in slot 2 | Empyrean Lord's Punishment in slot 2 |
| 45 | Shield of Protection, Taunt, Doom Shield, Noble Armor | Doom Shield, Empyrean Lord's Punishment, Battlefield Banner, Noble Armor |

Own keys: tank Noble Armor, Punishment, Taunt, Poach, Shield of Protection, Defiance, Doom Shield, Shield Rush. DPS Battlefield Banner, Noble Armor, Punishment, Empyrean Lord's Punishment, Poach, Defiance, Doom Shield, Shield Rush. A key whose skill comes later stays free, so no key moves as you level.

## 6. Open points

1. Battlefield Banner and Noble Armor share a key in 71 builds; the app's bar rule allows a stigma in a stack only on stack A or B. Ruling: does the game allow stigmas in an own-key stack?
2. Before Lv 21 the tank's plan names Taunt for stigma slot 1; at Lv 22 the slot takes Shield of Protection, because Fury (Lv 21) only counts once you have it. The planner ranks future slots at today's level. Planner follow-up, not a data change.
3. Annihilate's condition (a stunned or knocked-down target) is held as a value and its openers, not as a condition record: the planner looks for an opener on the same key, and Annihilate's opener, Shield Smite, sits on the other stack of the same macro. Recording the condition would make the planner copy Shield Smite into the smash stack. Planner follow-up.
4. Specialty slot 2 can take a second Lv 8 option (Punishment damage over time 117, Warding Strike heal over time 111). The planner holds one pick per option level. Planner follow-up.
5. Passives have no Specialty options, but the Mastery list says "opens Specialty slot 1" for Insulting Roar and Fury (the Gladiator's Experienced Counterstrike reads the same). Planner follow-up.
6. Whether Judgment can fire without a shield skill readying it: UNKNOWN. In-game check: use Judgment with no shield skill used first.
7. Which statuses count as Impact-type (Judgment Lv 8, Executing Blade): UNKNOWN.
8. Templar team variants: none recorded. The tank role is the main tank; solo play is the DPS role. Two Templars in one party would not stack Fury (UNKNOWN; same-buff rule not in the tooltip).
9. Punishing Strike (Pummel's follow-up), Threatening Blow (Vicious Strike's), Capture (Defiance's), Grapple, Comrade in Arms, Assault Fury, Armor of Balance and the passives other than Fury and Insulting Roar have no values yet, so the planner gives them none.
10. Mastery cap: as the Gladiator record, section 6.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: Templar skill build list and build detail (951 builds, 671 authors; among them builds 10480, 12466, 12972, 12462, 15782, 11151, 13658, 5529, 19026 and the levelling set 18524 to 18526), game database skill tooltips (35 Templar ids), Daevanion planner (445 plans) with board and node data.
- Stats site Templar page: top-player meta (153 players with a bar read, 1,561 tracked), editorial levelling and PvP builds.
- Our records: `builds/templar.json` provenance (ExpCarry Templar guide 5 Oct 2026, the stats site stigma guide, the most common macros page), `MACRO-RESEARCH.md`, the Gladiator record `gladiator.md`.
