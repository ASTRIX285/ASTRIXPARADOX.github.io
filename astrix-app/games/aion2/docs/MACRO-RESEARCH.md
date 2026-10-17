# AION 2 macros: how they work and how to build the best one (research record, 16 Oct 2026)

For The Aetherium's Macro screen. Status on every fact: CONFIRMED (seen in game by Miguel), REPORTED (two or more guides agree), DISPUTED (guides disagree), UNKNOWN. Sources stay in this record and the repo, never on a page.

## 1. How the macro system works

| # | Fact | Status |
|---|---|---|
| 1 | A key holds a skill line of up to 4 skills in rows 0 to 3. Each press fires the first ready skill, starting at row 0. | CONFIRMED (10 Oct) |
| 2 | A macro is a list of steps. Each step is a whole key (its full skill line), not one skill. | REPORTED (daevaguides, mein-mmo, allthings.how) |
| 3 | One macro holds up to 8 entries. | CONFIRMED (Miguel, 11 Oct). Two guides say 20 steps. Recheck in game: is 8 the visible list or the hard cap? |
| 4 | 3 macro sets (1, 2, 3). Each of the 3 skill presets keeps its own macro. | CONFIRMED (6 Oct) |
| 5 | Steps run in listed order while the key is held, with a delay between each. Default delay 10 ms (was 50 ms before a patch). | CONFIRMED (6 Oct) |
| 6 | A step whose skills are all on cooldown, short of MP or lacking a target is skipped. The macro does not wait. | REPORTED (aion2vault, daevaguides, allthings.how) |
| 7 | The game itself warns the order of steps is not guaranteed: the macro keeps trying to move on. | REPORTED (daevaguides, aion2vault) |
| 8 | A skill pressed by hand takes priority over the macro. | CONFIRMED (in our record) |
| 9 | The macro reads the key slot, not the skill: change the skill on that key and the macro changes too. | REPORTED (allthings.how) |
| 10 | The macro key is unbound by default: Settings, Key Settings, General, Gameplay, Macro. Mouse buttons do not bind in AION 1 control mode. | CONFIRMED path; mouse note REPORTED |
| 11 | A charged skill in a macro fires at its first charge stage only (Sorcerer Hellfire about 5,000 in a macro against about 35,000 fully charged). | REPORTED (daevaguides, dbaion2, aion2vault) |
| 12 | A toggle (mantras, auras) in a macro turns itself off on the next pass. | REPORTED (daevaguides, allthings.how) |
| 13 | Skill Queue setting: some players turn it off because long-animation and cooldown skills misfire with it on; others keep it on. | DISPUTED. Test both. |
| 14 | A skill at level 0 still costs animation time in the macro. Only put levelled skills in. | REPORTED (allthings.how) |

## 1b. The layout that works (Miguel, 16 Oct 2026, CONFIRMED from an in-game Templar setup)

- The right-hand block of the skill bar holds the stacked keys: **stack A, then the main attack, then stack B**. Each stack holds up to 4 skills (rows 0 to 3).
- The macro has **two entries only: stack A and stack B**, the two keys either side of the main attack. Each entry fires its stack's first ready skill. Delay 10 ms on each.
- The main attack sits between them on its own key and is not a macro entry (Templar: Vicious Strike, instant, no cooldown, Mobile, restores 100 MP and cuts Warding Strike's cooldown by 2 s on hit).
- Example (Templar): macro entry 1 is the stack with Doom Shield in row 0; entry 2 is the stack with Debilitating Smash in row 0. This matches the two most common Templar lines in section 3 (Doom Shield line 41%, Debilitating Smash line 38%).
- So the macro covers up to 8 skills: 2 stacks of 4. Check with Miguel whether his "8 entries" on 11 Oct meant 8 skills across the two stacks.

## 2. The most effective way to build one (the rules)

1. **Two stacks, two entries.** Build two damage stacks on the right-hand block, one either side of the main attack, and make those two keys the macro's only entries (section 1b). Start with one if you are new. 91 percent of public macros use one line and 95 percent have five steps or fewer (aion2vault, 3,169 public Global macros, read 14 Oct). More steps means each strong skill waits longer to come round again. Daevaguides on the Gladiator: "do not add skills to this line; each delay on Overhead Slam costs more than an extra skill gives."
2. **Order the line by cooldown.** Row 0 is the strongest skill with the longest cooldown, down to the shortest, and the no-cooldown filler in row 3. A no-cooldown skill in row 0 blocks everything above it.
3. **Keep the basic attack out of the macro and hold it with the macro key.** Hold the macro key and left click together: the game weaves basic attacks between skills, which restores MP and cancels the end of each animation. Putting the basic attack inside the macro weaves it less often and loses damage. A dark trailing shadow on your character shows the cancel is working. (REPORTED, mein-mmo, daevaguides, dbaion2, aion2vault.)
4. **Keep these off the macro, on their own keys:**
   - Charged skills (fire at stage 1 only)
   - Toggles: mantras and auras (switch off on the next pass)
   - Dashes and gap closers (pull you out of position)
   - Long buffs and ultimates of 45 to 60 seconds (wasted on trash, and they stall a short loop)
   - Defensives, heals, crowd-control breaks and dodges (you need them at a chosen moment)
5. **Delay:** 10 ms. Raise it to 40 to 50 ms only if skills fail to fire, which is more likely on 80 ms ping and above. Do not copy someone else's delay.
6. **Lock a target first.** Some skills will not fire without one.
7. **Test on the training dummy** with Combat Analysis (Ctrl+X, REPORTED): 20 seconds macro with left click held against macro alone, and Skill Queue on against off. Keep the higher number.
8. **Rebuild at 45.** Skill levels and specialisations change what the line should hold (Gladiator: once Overhead Slam and Rending Blow are both at 16, some players drop left click and run the macro alone).

## 3. Most common lines per class (public Global builds)

Source: aion2vault.com/builds/macros, counting questlog.gg public Global skill builds (6,322 builds, 3,169 with a macro), read 14 Oct 2026. This shows what players save, not measured damage.

| Class | Most common line (share) | Common additions | Keep off the macro |
|---|---|---|---|
| Gladiator | Rage Burst, Overhead Slam, Rending Blow (56%). Daevaguides adds Sword Aura Rampage in row 2 (only fires on a staggered target). | Lunge Stance, Zikel's Blessing (23%); Ruinous Blow, Lifestealing Blade (21%) | Leaping Slam, Rush Strike, Focused Block, Keen Strike |
| Templar | Doom Shield, Judgment, Shield Smite, Warding Strike (41%) | Debilitating Smash, Annihilate, Pummel (38%) | Shield Rush, Poach, Punishment, Vicious Strike |
| Assassin | Insignia Explosion, Ambush, Storm Rampage, Savage Roar (27%) | Insignia Explosion, Heart Gore, Savage Roar (21%); Savage Fang, Insignia Explosion, Heart Gore, Savage Roar (20%) | Shadowstrike, Flash Slice, Infiltrate, Quick Slice |
| Ranger | Gale Arrow, Drill Dart, Tempest Shot (53%) | Griffon Arrow, Snare Shot, Burst Arrow (26%); Snare Shot, Explosive Arrow, Burst Arrow (25%) | Explosion Trap, Snipe, Deadshot, Marking Shot |
| Sorcerer | Element Enhancement, Fire Wall, Cold Storm, Delayed Explosion (57 to 60%) | Winter's Shackles, Bittercold Wind, Frost, Firestorm; Blaze, Frost Burst | Hellfire, Flame Scattershot |
| Spiritmaster | Jointstrike: Curse, Elemental Fusion, Dimensional Control, Combustion (52%) | Cold Shock as its own step (61%) | Rapid Scattershot, Soul's Cry, Destructive Attack, Ancient Spirit, Spirit's Benediction |
| Cleric | Judgment Thunder (51%) | Chain of Torment, Condemnation (40%); Divine Aura (40%); Debilitating Mark (37%) | Radiant Recovery, Bolt, Light of Protection |
| Chanter | Dark Crush, Spinning Strike, Impactful Crush, Incandescent Blow (64%) | Onslaught as its own step (31%) | Recuperation, Undefeated Mantra, Sprint Mantra, Power of the Storm, Rushing Smash |

### Gladiator detail (dbaion2, daevaguides)
- Ruinous Blow: 45 s cooldown, dashes to the target, grants Prepare for Battle for 20 s (+20% PvE damage, +100 Critical Hit). A dash, so it belongs on its own key, pressed to open and again before the buff runs out.
- Rage Burst: stigma, 45 s cooldown (30 s at skill Lv 5). Row 0 of the line.
- Rending Blow: take the mobile option at Lv 8 or it roots you while the macro runs. Lv 20 option: 50 MP back on a Critical Hit.
- Sword Aura Rampage: only hits a staggered target.
- Overhead Slam specialisations: no cooldown, Upward Strike chain, or guaranteed Critical Hit.

## 4. What The Aetherium shows today, and what is wrong (main at 838e27b, Lv 45, all classes)

The Macro screen builds Macro 1 from each build's rotation, then fills up to 8 with other damage keys (#491). Against the rules above:

| Class | Today's Macro 1 | Problem |
|---|---|---|
| Gladiator | Key 1 (Ruinous Blow, Overhead Slam, Rending Blow), key 7 Rage Burst, key 2 Crushing Wave, key 4 Mocking Blade | Ruinous Blow is a dash in row 0. Extra keys slow the main line (rule 1). Rage Burst belongs in row 0 of the main line. |
| Templar | Key 1 (Pummel, Judgment), Q Punishment, LMB Vicious Strike | Punishment is charged. Vicious Strike is the basic attack (rule 3). |
| Assassin | Key 7 Savage Fang, key 1 (Insignia Explosion, Heart Gore, Savage Roar) | Close to the community line. |
| Ranger | Nothing (rotation pending) | Community line exists. |
| Sorcerer | Nothing (rotation pending) | Community line exists. |
| Spiritmaster | "Keep a spirit summoned", key 1 line, key 2 Elemental Fusion | A non-skill note as an entry. |
| Cleric | Key 7 Earth Punishment, key 1 line, Q Bolt | Bolt is charged. |
| Chanter | Key 5 Undefeated Mantra, key 1 line | Undefeated Mantra is a toggle. |

The fill to 8 from #491 works against rule 1. The macro should be the two stacks either side of the main attack: 2 entries covering up to 8 skills.

## 5. In-game checks for Miguel

1. Macro window: is 8 the hard cap, or does the list scroll to 20?
2. Hold the macro key with every skill in the line on cooldown: does it skip or wait?
3. The Skill Queue setting: its exact name and menu path.
4. Combat Analysis: does Ctrl+X open it, and does it show total damage over a set time?
5. Training dummy, 20 s each: macro alone against macro plus left click held. Which is higher at your ping?
6. Does the trailing shadow show when the cancel works?

## Sources
- aion2vault.com/builds/macros (published 14 Oct 2026, updated 15 Oct)
- daevaguides.com/en/guides/macros
- allthings.how/aion-2-how-to-use-macros-and-pick-the-right-delay
- dbaion2.ru/en/guides/makrosy-umeniy and /gayd-gladiator
- mein-mmo.de macro trick (30 Sep 2026)
- Our records: progression.json macro-order, mechanics.json skill-stack

## 6. Best DPS sequences by trigger and cooldown (16 Oct 2026)

Method: every Lv 45 PvE skill's cooldown, MP, conditions and triggers, from thegameswiki (tooltip data), metabot.gg skill pages, games.gg, mobalytics, EZG, gamesfuze and the class guides, checked against our skills.json. Each stack puts the skill that opens a window before the skill that uses it, then the longest cooldown, then short hitters, with the no-cooldown or condition-only skill last so nothing above it is blocked. Skills are split so the A, B, A, B loop keeps both stacks firing. Row 0 is the bottom row in the game window and fires first (KeenGamer's "bottom fires first" means the same thing). Status: REPORTED unless marked. Walk-throughs assume about 1 s per skill.

Cross-class point: several triggers come from skill Lv 16 specialties. Mastery stops at 11 and Daevanion nodes add some, but gear also rolls skill levels (Miguel's gear shows "Impact Hit Lv +1", "Blood Absorption Lv +1"), so 16 is reachable on core skills. The page must show a Lv 16 trigger only when the Daeva's skill level reaches it.

### Gladiator
SUPERSEDED 17 Oct 2026: top players run one main line, Rage Burst / Overhead Slam / (empty) / Rending Blow, as Macro 1. See aion2-gladiator-tank-hybrid-17oct2026.md section 5. The two-stack design below over-built the class. Treat the other four classes' designs as unverified until checked against a published top-player build the same way.

| | Row 0 | Row 1 | Row 2 | Row 3 |
|---|---|---|---|---|
| Stack A (burst) | Rage Burst (45 s, 30 s at Lv 5): opens a 10 s window where Overhead Slam is ready | Overhead Slam (5 s; no cooldown at Lv 16): fires every A pass inside the window | Mocking Blade (20 s): knockdown makes Overhead Slam ready again | Ankle Slice (10 s): only after a Focused Block parry |
| Main attack | Keen Strike, held: +100 MP, cancels animations, Lv 12 cuts Ruinous Blow by 1 s per hit | | | |
| Stack B (sustain) | Blade Toss (20 s): target Defence minus 30% for 10 s before the hits | Crushing Wave (20 s; Lv 12 crit resets it) | Sword Aura Rampage (no cooldown): only on a staggered target, cuts cooldowns | Rending Blow (no cooldown, filler; take the mobile option) |
| Own keys | Ruinous Blow (dash, Prepare for Battle 20 s: press before Rage Burst), Lunge Stance and Zikel's Blessing (burst buffs), Focused Block, Defiance, Leaping Slam, Rush Strike | | | |

Opener: Zikel's Blessing, Lunge Stance, Ruinous Blow, then hold the macro and Keen Strike. 0 s Rage Burst, 1 s Blade Toss, 2 s Overhead Slam, 3 s Crushing Wave, then Overhead Slam every A pass and Rending Blow every B pass until 10 s, Mocking Blade at 10 s. Flex: Focused Block in place of Blade Toss if the party needs its buff.
Differs from our build data: Ruinous Blow leaves the stack for its own key; Rage Burst moves to row 0.

### Assassin
SUPERSEDED 17 Oct 2026: published builds run one main line, Savage Fang / Insignia Explosion / Heart Gore / Savage Roar, with Quick Slice held. See level-guidance/assassin.md sections 2 and 4. The two-stack design below is kept for the record.

| | Row 0 | Row 1 | Row 2 | Row 3 |
|---|---|---|---|---|
| Stack A (build) | Savage Fang (60 s): 5 Insignia at once | Ambush (10 s): +30% from behind, 2 Insignia | Storm Rampage (no cooldown): only on stagger, cuts all cooldowns | Savage Roar (no cooldown): 1 Insignia per step |
| Main attack | Quick Slice, held: +100 MP, Lv 12 cuts Insignia Explosion by 1 s per hit | | | |
| Stack B (spend) | Insignia Explosion (10 s, 7 s at Lv 16): spends up to 5 stacks, fires right after Fang | Triniel's Dagger (45 s): Lv 10 cuts all cooldowns by 10% on hit | Heart Gore (5 s): after a crit; no cooldown during Illusive Clone | empty (Quick Slice fills) |
| Own keys | Illusive Clone and Swift Contract (press together just before Fang), Shadowstrike, Flash Slice, Infiltrate, Shadow Fall, Defiance, Evasion Stance | | | |

Insignia Explosion sits above Heart Gore because Heart Gore has no cooldown during Clone and would block it.

### Ranger
| | Row 0 | Row 1 | Row 2 | Row 3 |
|---|---|---|---|---|
| Stack A | Snare Shot (15 s): Slow 5 s (7 s at Lv 16) so B's next pass lands on a slowed target | Gale Arrow (20 s, 10 s at Lv 16): +7% PvE damage and speed 10 s | Drill Dart (5 s): bleed, MP back on crit | Tempest Shot (no cooldown, filler) |
| Main attack | Snipe, held: +120 MP, Lv 12 cuts Deadshot by 1 s per hit | | | |
| Stack B | Explosive Arrow (45 s): +20% on a slowed target | Burst Arrow (20 s): only on a slowed or rooted target | Griffon Arrow (45 s): fire damage over time | Arrow Scattershot (no cooldown): only on stagger |
| Own keys | Deadshot (charged: fire it full after Marking Shot's Precision), Marking Shot (moves you), Vaizel's Authority, Bow of Blessing, Supporting Fire (burst buffs together), Arrow Storm (stagger), Explosion Trap, Defiance, Mother Nature's Breath | | | |

### Sorcerer
| | Row 0 | Row 1 | Row 2 | Row 3 |
|---|---|---|---|---|
| Stack A (fire) | Element Enhancement (60 s): +20% Fire and Water 10 s | Delayed Explosion (30 s): target takes +15% from you for 4 s, then explodes | Fire Wall (60 s): burn over time | Blaze (5 s): needs Fire Mark, which Flame Arrow applies |
| Main attack | Flame Arrow, held: +100 MP, Fire Mark, can reset Blaze | | | |
| Stack B (frost) | Winter's Shackles (45 s, 30 s at Lv 16): +20% PvE damage 5 s | Cold Storm (60 s): 7 s storm, Frostbite | Bittercold Wind (15 s): sure crit at Lv 12 | Firestorm (5 s): each fireball cuts Hellfire by 2 s at Lv 12 |
| Own keys | Hellfire (charged: about 5,000 from a macro against 35,000 full), Wish of Concentration (buff, all cooldowns minus 10 s), Frost and Frost Burst (optional pair), Flame Scattershot, Ice Chain, Defiance, Steel Barrier, Arctic Armor, Hibernation | | | |

The 60 s skills (Element Enhancement, Fire Wall, Cold Storm) return together, so each burst stacks every buff. Charge Hellfire by hand inside Element Enhancement. Element Enhancement is a buff in the macro, against rule 4: kept because it lines up with the 60 s skills. Test it on its own key too.

### Spiritmaster
| | Row 0 | Row 1 | Row 2 | Row 3 |
|---|---|---|---|---|
| Stack A | Jointstrike: Curse (10 s, 8 s at Lv 12): damage over time, keeps the +50% on DoT targets passive running | Summon: Earth Spirit (15 s): element stack, opens Dimensional Control | Summon: Water Spirit (15 s): same, plus MP | Summon: Fire Spirit (15 s): last, so Fire stays out |
| Main attack | Cold Shock, held: +100 MP, +2% Attack per hit up to 5 at Lv 12 | | | |
| Stack B | Jointstrike: Corrode (45 s): +10% spirit damage taken, 20 s | Dimensional Control (no cooldown): only in a short window after a spirit skill | Elemental Fusion (no cooldown): only with Four Elements; skip the Lv 12 charge option | Combustion (no cooldown, spender) |
| Own keys | Spirit's Benediction, Flame Blessing, then Summon: Ancient Spirit (burst, in that order), Destructive Attack (charged), Rapid Scattershot (stagger only), Soul's Cry (fear scatters mobs), Defiance | | | |

### Shared in-game tests (one dummy session covers all)
1. A skill whose condition is not met (Overhead Slam without the window, Burst Arrow without Slow, Blaze without Fire Mark): skipped, or does it hold up the stack?
2. Does a chain skill (Upward Strike, Tempest Arrow, Ashy Call) fire from the same stack slot?
3. Gladiator: is Overhead Slam's Lv 16 no-cooldown permanent or only in the Rage Burst window?
4. Spiritmaster: do the three summons share one 15 s cooldown or have one each?
5. Combat Analysis: these stacks against the most common line in section 3, 20 s each.

### Sources added
thegameswiki.com/aion-2/wiki/{gladiator,assassin,ranger,sorcerer,spiritmaster}-skills; thegameswiki gladiator-global-pve-build; metabot.gg skill pages (rage-burst, lunge-stance, zikels-blessing, gale-arrow, snare-shot, burst-arrow, arrow-scattershot, tempest-shot, drill-dart, snipe, marking-shot, deadshot, combustion, elemental-fusion, dimensional-control, rapid-scattershot, jointstrike-corrode, jointstrike-destructive-attack); games.gg class guides; mobalytics.gg class builds; ezg.com assassin; gamesfuze gladiator and assassin; expcarry gladiator; skycoach spiritmaster; gameplay.tips ranger and spiritmaster; wikily cold-storm; keengamer macro guide.
