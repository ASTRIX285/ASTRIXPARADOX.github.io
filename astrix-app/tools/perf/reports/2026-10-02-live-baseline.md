# Tool page load, live astrixparadox.com, signed in

Measured with `astrix-app/tools/perf/perf-measure.mjs` in Miguel's own Chrome (signed in by Miguel, attached over CDP).
Phone: 390x844 at 3x, Lighthouse Slow 4G applied throttling (562.5 ms latency, 1474.56 Kbps down, 675 Kbps up), 4x CPU slowdown. Desktop: 1600x900, no throttling.
Cold: browser cache cleared before the load (cookies kept). Warm: the next load with the cache kept.
First paint: first contentful paint. Usable: the page's forge:portal-ready signal when it fires, otherwise the moment network and DOM went quiet for 2 s (capped at 60 s); the signal used is shown per row.
KB is transferred size (compressed). Paths only; query strings are never recorded.

## Findings

1. **The Worker prepared page payload is the bottleneck.** On desktop with no throttling the JS/CSS chain finishes in 0.4 to 0.7 s on most pages, but `/bungie/page/*` takes 6.0 to 9.2 s to stream: Storage 6.0 s (1260 KB), Build Forge 7.2 s (1359 KB), Forge Loader 7.3 s (535 KB), Character 7.9 s (644 KB), Journey 9.2 s (1580 KB). A second `/bungie/page/*` call starts at about 10 s and is still open when the page is measured. Signed-in 3 to 4 s cannot be reached by front-end changes alone. The Worker is not changed here; Miguel decides.
2. **On phone the Worker data starts only after the JS chain.** Prepared payload requests start at 4.5 to 9.7 s (Character 9.7 s) and then stream for 7 to 20 s. Starting them in parallel with the JS (PR 4) saves up to the JS/CSS span, but not the streaming time.
3. **Reports and Storage hit the 30 s client timeout on phone.** Reports: `/bungie/page/journey` ran 29.7 s and returned 0 KB. Storage: `/bungie/page/vault` ran 30.0 s with 0 KB, was retried at 34.5 s and was still streaming at 60 s. Both pages reached the 60 s measurement cap.
4. **`/bungie/account` is called 2 to 4 times per page load** (Character phone: 3 calls, two of them within 1 ms).
5. **Files fetched under more than one URL** (same file, different `?v=`): Home 4, Journey 2, Character 16, Forge Loader 8, Build Forge 20, Reports 3, Storage 6, Armoury 6. Full list below. PR 2 targets these.
6. **Heavy images.** `/img/logo.png` 729 KB on desktop pages. Bungie pgcr activity art loaded eagerly at 100 to 760 KB each (Reports phone cold 9.9 MB, Storage 9.2 MB). Map placeholder 6k webp 160 KB on Home, Character, Build Forge and Armoury. Journey desktop: `nessus.png` 3250 KB, `edz.png` 2410 KB, `pale-heart-director-map-6k.webp` 1444 KB, `pale-heart.jpeg` 1398 KB. Character loads `beta-bungie-manifest-cache.json` (260 KB compressed). PR 3 targets these.
7. **Module depth is 4 to 5 levels** on every page; on phone the JS/CSS span ends at 5.4 to 14.6 s (Character 144 requests, Build Forge 141). PR 4 targets this.

## Per page

| Page | Profile | Cache | Requests | KB | First paint | Usable | Usable signal |
|---|---|---|---|---|---|---|---|
| Home | phone | cold | 40 | 338.4 | 1.54 s | 6.09 s | forge:portal-ready |
| Home | phone | warm | 39 | 8.2 | 0.33 s | 1.00 s | forge:portal-ready |
| Home | desktop | cold | 67 | 436.2 | 0.14 s | 1.19 s | forge:portal-ready |
| Home | desktop | warm | 66 | 79.7 | 0.05 s | 0.37 s | forge:portal-ready |
| Journey | phone | cold | 103 | 2347.4 | 2.63 s | 18.10 s | network and DOM quiet |
| Journey | phone | warm | 126 | 1977.3 | 0.89 s | 12.53 s | network and DOM quiet |
| Journey | desktop | cold | 466 | 54356 | 0.36 s | 11.18 s | forge:portal-ready |
| Journey | desktop | warm | 101 | 34.8 | 0.07 s | 0.64 s | forge:portal-ready |
| Character | phone | cold | 195 | 3553.6 | 4.82 s | 27.17 s | network and DOM quiet |
| Character | phone | warm | 355 | 5739.3 | 0.44 s | 36.27 s | forge:portal-ready |
| Character | desktop | cold | 694 | 41384.9 | 0.30 s | 10.55 s | forge:portal-ready |
| Character | desktop | warm | 696 | 1243.1 | 0.14 s | 2.57 s | forge:portal-ready |
| Forge Loader | phone | cold | 115 | 2762.4 | 5.96 s | 21.45 s | network and DOM quiet |
| Forge Loader | phone | warm | 318 | 5156.6 | 0.39 s | 38.61 s | forge:portal-ready |
| Forge Loader | desktop | cold | 604 | 43245.2 | 0.37 s | 10.80 s | forge:portal-ready |
| Forge Loader | desktop | warm | 246 | 181.6 | 0.10 s | 2.78 s | forge:portal-ready |
| Build Forge | phone | cold | 175 | 1670.3 | 3.89 s | 12.10 s | network and DOM quiet |
| Build Forge | phone | warm | 183 | 713 | 0.36 s | 3.68 s | network and DOM quiet |
| Build Forge | desktop | cold | 692 | 45400.9 | 0.21 s | 12.61 s | forge:portal-ready |
| Build Forge | desktop | warm | 688 | 642.4 | 0.16 s | 4.58 s | forge:portal-ready |
| Reports | phone | cold | 150 | 9929.8 | 3.79 s | 60.16 s | timeout 60 s |
| Reports | phone | warm | 155 | 1080.9 | 0.28 s | 4.55 s | network and DOM quiet |
| Reports | desktop | cold | 418 | 41697.2 | 0.24 s | 9.94 s | forge:portal-ready |
| Reports | desktop | warm | 417 | 2.6 | 0.06 s | 0.51 s | forge:portal-ready |
| Storage | phone | cold | 172 | 9249.6 | 4.20 s | 60.03 s | timeout 60 s |
| Storage | phone | warm | 186 | 2450.1 | 0.23 s | 12.83 s | network and DOM quiet |
| Storage | desktop | cold | 604 | 35383.5 | 0.20 s | 8.64 s | forge:portal-ready |
| Storage | desktop | warm | 350 | 233.4 | 0.22 s | 1.90 s | forge:portal-ready |
| Armoury | phone | cold | 199 | 735.3 | 4.10 s | 13.23 s | forge:portal-ready |
| Armoury | phone | warm | 205 | 842.1 | 0.32 s | 8.39 s | forge:portal-ready |
| Armoury | desktop | cold | 332 | 14526.9 | 1.73 s | 5.06 s | forge:portal-ready |
| Armoury | desktop | warm | 349 | 3030.4 | 0.14 s | 2.69 s | forge:portal-ready |

## Time split per stage (cold loads)

Times are from the first request of the load. HTML: document request start to end. JS/CSS: first code request start to last code response end. Worker data: prepared page payload and live profile from auth.astrixparadox.com, first start to last end, with bytes (streamed bytes counted) and calls still open when the load was measured. Render: usable minus the last Worker data response.

| Page | Profile | HTML | JS/CSS requests | JS/CSS KB | JS/CSS span | Module depth | Worker calls | Worker data span | Render after data | Usable |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | phone | 3-584 ms | 22 | 76.5 | 591-6131 ms | 4 | 2 | none | - | 6.09 s |
| Home | desktop | 4-33 ms | 47 | 160.4 | 36-1667 ms | 4 | 4 | none | - | 1.19 s |
| Journey | phone | 3-252 ms | 59 | 236.9 | 253-6847 ms | 5 | 3 | 5209-? ms, 209.7 KB, 1 still open | 18101 ms | 18.10 s |
| Journey | desktop | 3-20 ms | 61 | 241.3 | 27-10801 ms | 5 | 12 | 578-9805 ms, 1580.3 KB, 1 still open | 1378 ms | 11.18 s |
| Character | phone | 3-880 ms | 144 | 619.4 | 881-14581 ms | 5 | 6 | 9671-? ms, 478 KB, 1 still open | 27170 ms | 27.17 s |
| Character | desktop | 3-108 ms | 145 | 619.6 | 128-729 ms | 5 | 12 | 698-8573 ms, 644 KB, 1 still open | 1977 ms | 10.55 s |
| Forge Loader | phone | 2-692 ms | 70 | 309.1 | 699-8814 ms | 4 | 4 | 6981-? ms, 410.5 KB, 1 still open | 21451 ms | 21.45 s |
| Forge Loader | desktop | 4-160 ms | 71 | 309.3 | 192-460 ms | 4 | 10 | 420-7678 ms, 534.8 KB, 1 still open | 3119 ms | 10.80 s |
| Build Forge | phone | 3-623 ms | 141 | 701.3 | 631-11032 ms | 4 | 7 | 8782-? ms, 55.7 KB, 1 still open | 12095 ms | 12.10 s |
| Build Forge | desktop | 2-21 ms | 142 | 701.5 | 32-673 ms | 4 | 17 | 647-7852 ms, 1358.9 KB, 1 still open | 4762 ms | 12.61 s |
| Reports | phone | 3-684 ms | 38 | 135 | 705-5436 ms | 4 | 4 | 5067-34755 ms, 0 KB | 25406 ms | 60.16 s |
| Reports | desktop | 5-20 ms | 38 | 135 | 109-402 ms | 4 | 2 | none | - | 9.94 s |
| Storage | phone | 2-749 ms | 63 | 277.2 | 749-7090 ms | 4 | 6 | 4486-34471 ms, 615.8 KB, 1 still open | 25556 ms | 60.03 s |
| Storage | desktop | 3-20 ms | 64 | 277.2 | 33-422 ms | 4 | 6 | 381-6410 ms, 1259.5 KB, 1 still open | 2233 ms | 8.64 s |
| Armoury | phone | 3-656 ms | 65 | 289.3 | 676-7332 ms | 4 | 4 | none | - | 13.23 s |
| Armoury | desktop | 5-19 ms | 65 | 289.3 | 1531-2061 ms | 4 | 5 | none | - | 5.06 s |

## Worker calls (phone, cold)

**Home**: /session at 3522 ms, 568 ms, 1 KB; /bungie/home at 5516 ms, 568 ms, 1 KB

**Journey**: /bungie/account at 5066 ms, 572 ms, 0.6 KB; /bungie/page/journey at 5209 ms, still open (last byte 20566 ms), 209.7 KB; /bungie/account at 6851 ms, 568 ms, 0.6 KB

**Character**: /session at 9464 ms, 602 ms, 1 KB; /bungie/account at 9467 ms, 608 ms, 0.6 KB; /bungie/account at 9468 ms, 1202 ms, 0.6 KB; /bungie/page/character at 9671 ms, still open (last byte 29873 ms), 478 KB; /bungie/manifest/import/status at 13903 ms, 654 ms, 12.8 KB; /bungie/account at 14585 ms, 679 ms, 0.6 KB

**Forge Loader**: /bungie/account at 6849 ms, 629 ms, 0.6 KB; /bungie/page/loadout at 6981 ms, still open (last byte 24088 ms), 410.5 KB; /bungie/account at 8119 ms, 583 ms, 0.6 KB; /bungie/account at 8971 ms, 574 ms, 0.6 KB

**Build Forge**: /bungie/account at 8573 ms, 569 ms, 0.6 KB; /bungie/account at 8574 ms, 1139 ms, 0.6 KB; /bungie/page/build-forge at 8782 ms, still open (last byte 16120 ms), 55.7 KB; /paradox/loadouts at 11428 ms, 574 ms, 0.7 KB; /bungie/account at 11458 ms, 568 ms, 0.6 KB; /bungie/manifest/import/status at 15612 ms, still open (last byte - ms), 0 KB; /paradox/loadouts at 15646 ms, still open (last byte - ms), 0 KB

**Reports**: /paradox/loadouts at 595 ms, still open (last byte - ms), 0 KB; /bungie/account at 4744 ms, 614 ms, 0.6 KB; /bungie/account at 4755 ms, 1237 ms, 0.6 KB; /bungie/page/journey at 5067 ms, 29687 ms, 0 KB

**Storage**: /bungie/account at 4464 ms, 678 ms, 0.6 KB; /bungie/page/vault at 4486 ms, 29985 ms, 0 KB; /session at 6348 ms, 590 ms, 1 KB; /bungie/account at 6349 ms, 598 ms, 0.6 KB; /bungie/account at 7160 ms, 573 ms, 0.6 KB; /bungie/page/vault at 34470 ms, still open (last byte 60327 ms), 615.8 KB

**Armoury**: /bungie/account at 4550 ms, 675 ms, 0.6 KB; /bungie/account at 6142 ms, 641 ms, 0.6 KB; /bungie/account at 8582 ms, 585 ms, 0.6 KB; /paradox/loadouts at 12732 ms, 569 ms, 0.7 KB

## Five slowest requests per page (phone, cold)

**Home**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 1478 ms | 1958 ms | 160.3 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 596 ms | 1569 ms | 8.9 |
| /img/ax-logo-160.webp | Image | 596 ms | 1562 ms | 6.2 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 1479 ms | 1195 ms | 23.5 |
| /fonts/barlow-400.woff2 | Font | 1479 ms | 1179 ms | 22.4 |

**Journey**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/img/destiny_content/pgcr/dungeon_equilibrium.jpg | Image | 6985 ms | 6396 ms | 106.8 |
| www.bungie.net/img/destiny_content/pgcr/exotic_seize.jpg | Image | 14422 ms | 6270 ms | 119.8 |
| www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg | Image | 6985 ms | 5862 ms | 133.6 |
| www.bungie.net/img/destiny_content/pgcr/season_21_mission_midnight.jpg | Image | 13611 ms | 4488 ms | 97.7 |
| www.bungie.net/img/destiny_content/pgcr/30th-anniversary-grasp-of-avarice.jpg | Image | 12318 ms | 4288 ms | 94.3 |

**Character**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/img/destiny_content/pgcr/dungeon_equilibrium.jpg | Image | 14735 ms | 7547 ms | 106.8 |
| www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg | Image | 14735 ms | 7070 ms | 133.6 |
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 4634 ms | 6895 ms | 160.3 |
| www.bungie.net/img/destiny_content/pgcr/exotic_seize.jpg | Image | 23518 ms | 6138 ms | 119.8 |
| www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg | Image | 14734 ms | 4860 ms | 128.5 |

**Forge Loader**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/img/destiny_content/pgcr/dungeon_equilibrium.jpg | Image | 9169 ms | 7473 ms | 106.7 |
| www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg | Image | 9169 ms | 6916 ms | 133.6 |
| www.bungie.net/img/destiny_content/pgcr/exotic_seize.jpg | Image | 17786 ms | 6143 ms | 119.8 |
| /img/logo.png | Image | 704 ms | 5216 ms | 0 |
| www.bungie.net/img/destiny_content/pgcr/dungeon_spire_of_the_watcher.jpg | Image | 13114 ms | 4848 ms | 71.3 |

**Build Forge**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 3673 ms | 5253 ms | 160.3 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 3684 ms | 4456 ms | 23.4 |
| use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l | Font | 3683 ms | 4235 ms | 21.2 |
| www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg | Image | 11625 ms | 4200 ms | 128.5 |
| use.typekit.net/af/b697ec/0000000000000000775ab3ad/31/l | Font | 3683 ms | 4155 ms | 20.8 |

**Reports**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/journey | Fetch | 5067 ms | 29687 ms | 0 |
| www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_encore.jpg | Image | 14028 ms | 8780 ms | 208.9 |
| www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg | Image | 42956 ms | 8359 ms | 248 |
| www.bungie.net/img/destiny_content/pgcr/patrol_edz.jpg | Image | 48979 ms | 7882 ms | 184.2 |
| www.bungie.net/img/destiny_content/pgcr/dungeon_equilibrium.jpg | Image | 5178 ms | 7522 ms | 106.7 |

**Storage**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/vault | Fetch | 4486 ms | 29985 ms | 0 |
| www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg | Image | 47549 ms | 9924 ms | 247.9 |
| www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_encore.jpg | Image | 15816 ms | 9138 ms | 209 |
| www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg | Image | 51268 ms | 9105 ms | 224.3 |
| www.bungie.net/img/destiny_content/pgcr/dreaming_city_bay_of_drowned_wishes.jpg | Image | 23725 ms | 8103 ms | 187.5 |

**Armoury**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 4083 ms | 5306 ms | 160.3 |
| /img/logo.png | Image | 681 ms | 3433 ms | 0 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 681 ms | 2948 ms | 8.9 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 4101 ms | 2547 ms | 23.4 |
| use.typekit.net/af/b697ec/0000000000000000775ab3ad/31/l | Font | 4085 ms | 2355 ms | 20.8 |

## Five largest requests per page (phone, cold)

**Home**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 160.3 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-400.woff2 22.4 KB; use.typekit.net/af/b697ec/0000000000000000775ab3ad/31/l 20.8 KB; /fonts/michroma-400.woff2 18.2 KB

**Journey**: auth.astrixparadox.com/bungie/page/journey 209.7 KB; www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg 133.6 KB; www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg 128.5 KB; www.bungie.net/img/destiny_content/pgcr/exotic_seize.jpg 119.8 KB; www.bungie.net/img/destiny_content/pgcr/dungeon_ridgeline.jpg 118.4 KB

**Character**: auth.astrixparadox.com/bungie/page/character 478 KB; /astrix-app/data/paradox-forge/beta/beta-bungie-manifest-cache.json 260.3 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 160.3 KB; www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg 133.6 KB; www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg 128.5 KB

**Forge Loader**: auth.astrixparadox.com/bungie/page/loadout 410.5 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 160.3 KB; www.bungie.net/img/destiny_content/pgcr/season_20_mission_avalon.jpg 133.6 KB; www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg 128.6 KB; www.bungie.net/img/destiny_content/pgcr/exotic_seize.jpg 119.8 KB

**Build Forge**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 160.3 KB; www.bungie.net/img/destiny_content/pgcr/season_22_offensive_spire.jpg 128.5 KB; www.bungie.net/img/destiny_content/pgcr/cosmodrome_fallen_saber.jpg 100.9 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_mirrorbox.jpg 94.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 90.1 KB

**Reports**: www.bungie.net/img/destiny_content/pgcr/calzones.jpg 606.3 KB; www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg 248 KB; www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg 224.3 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_encore.jpg 208.9 KB; www.bungie.net/img/destiny_content/pgcr/mission_overwhelm.jpg 203.9 KB

**Storage**: auth.astrixparadox.com/bungie/page/vault 615.8 KB; www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg 247.9 KB; www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg 224.3 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_encore.jpg 209 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_starcrossed.jpg 201.8 KB

**Armoury**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 160.3 KB; www.bungie.net/common/destiny2_content/icons/b1efa0eaa710653d85e2fcf5321047fb.png 50.5 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB; use.typekit.net/af/e43add/0000000000000000775ab3af/31/l 21.2 KB

## Five slowest requests per page (desktop, cold)

**Home**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/home | Fetch | 549 ms | 642 ms | 1 |
| /astrix-app/pages/journey/journey-2560-visual.css | Fetch | 1314 ms | 195 ms | 8.9 |
| /astrix-app/shared/astrix-destination-ribbon.css | Fetch | 1314 ms | 192 ms | 4 |
| /astrix-app/shared/tool-welcome.css | Fetch | 1314 ms | 143 ms | 1 |
| /astrix-app/core/prepared-page-client.mjs | Script | 1510 ms | 137 ms | 5.3 |

**Journey**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/journey | Fetch | 578 ms | 9227 ms | 1580.3 |
| www.bungie.net/img/destiny_content/pgcr/template_strike.jpg | Image | 7886 ms | 1790 ms | 692.2 |
| auth.astrixparadox.com/bungie/reports | Fetch | 731 ms | 1676 ms | 151.6 |
| www.bungie.net/img/destiny_content/pgcr/exploring_corridors_of_time.jpg | Image | 4314 ms | 1495 ms | 115.4 |
| www.bungie.net/img/destiny_content/pgcr/aphix_conduit.jpg | Image | 7728 ms | 1384 ms | 105.4 |

**Character**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/character | Fetch | 698 ms | 7875 ms | 644 |
| www.bungie.net/img/destiny_content/pgcr/mission_binding.jpg | Image | 6431 ms | 2314 ms | 136.4 |
| www.bungie.net/img/destiny_content/pgcr/mission_aground.jpg | Image | 8000 ms | 2223 ms | 208.8 |
| www.bungie.net/img/destiny_content/pgcr/mission_reveal.jpg | Image | 3811 ms | 2072 ms | 82.2 |
| www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg | Image | 7396 ms | 2041 ms | 756.4 |

**Forge Loader**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/loadout | Fetch | 420 ms | 7258 ms | 534.8 |
| www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg | Image | 6179 ms | 2173 ms | 756.6 |
| www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg | Image | 2543 ms | 1971 ms | 747.3 |
| www.bungie.net/img/destiny_content/pgcr/calzones.jpg | Image | 1457 ms | 1880 ms | 619.1 |
| www.bungie.net/img/destiny_content/pgcr/season_12_coup_de_grace.jpg | Image | 2591 ms | 1632 ms | 127.9 |

**Build Forge**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/build-forge | Fetch | 647 ms | 7205 ms | 1358.9 |
| www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg | Image | 3243 ms | 1998 ms | 747.2 |
| www.bungie.net/img/destiny_content/pgcr/calzones.jpg | Image | 2245 ms | 1861 ms | 619.1 |
| www.bungie.net/img/destiny_content/pgcr/season_12_coup_de_grace.jpg | Image | 3280 ms | 1858 ms | 127.8 |
| www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg | Image | 7494 ms | 1718 ms | 756.4 |

**Reports**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg | Image | 1878 ms | 2297 ms | 747.4 |
| www.bungie.net/img/destiny_content/pgcr/campaign_tree_of_probabilities.jpg | Image | 7207 ms | 2015 ms | 132.8 |
| www.bungie.net/img/destiny_content/pgcr/season_14_expunge_corrupted_styx.jpg | Image | 3440 ms | 1931 ms | 170.9 |
| www.bungie.net/img/destiny_content/pgcr/calzones.jpg | Image | 935 ms | 1689 ms | 619.2 |
| www.bungie.net/img/destiny_content/pgcr/mission_reveal.jpg | Image | 2068 ms | 1638 ms | 82.1 |

**Storage**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/vault | Fetch | 381 ms | 6029 ms | 1259.5 |
| www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg | Image | 5766 ms | 3095 ms | 756.4 |
| www.bungie.net/img/destiny_content/pgcr/calzones.jpg | Image | 789 ms | 2255 ms | 619 |
| www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg | Image | 1486 ms | 1773 ms | 747.3 |
| www.bungie.net/img/destiny_content/pgcr/corridors_of_time_part_1.jpg | Image | 1504 ms | 1721 ms | 205 |

**Armoury**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/img/destiny_content/pgcr/scavengers_den.jpg | Image | 3105 ms | 1676 ms | 135.8 |
| www.bungie.net/img/destiny_content/pgcr/calzones.jpg | Image | 3362 ms | 1601 ms | 619.3 |
| www.bungie.net/common/destiny2_content/icons/e5427942d0a661bf44fd723bb69e4b47.jpg | Image | 3908 ms | 1193 ms | 7.3 |
| www.bungie.net/img/destiny_content/pgcr/mission_overwhelm.jpg | Image | 3402 ms | 1175 ms | 219.4 |
| www.bungie.net/img/destiny_content/pgcr/season_21_mission_final_dive.jpg | Image | 3445 ms | 1075 ms | 136 |

## Five largest requests per page (desktop, cold)

**Home**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 90.1 KB; auth.astrixparadox.com/bungie/reports/catalogue 32 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; /fonts/barlow-400.woff2 22.4 KB

**Journey**: /astrix-app/shared/locations/nessus.png 3249.7 KB; /astrix-app/shared/locations/edz.png 2410.2 KB; auth.astrixparadox.com/bungie/page/journey 1580.3 KB; /astrix-app/pages/journey/assets/maps/pale-heart-director-map-6k.webp 1444 KB; /astrix-app/shared/locations/pale-heart.jpeg 1398.3 KB

**Character**: www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg 756.4 KB; www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg 747.2 KB; /img/logo.png 728.8 KB; auth.astrixparadox.com/bungie/page/character 644 KB; www.bungie.net/img/destiny_content/pgcr/calzones.jpg 619.2 KB

**Forge Loader**: www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg 756.6 KB; www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg 747.3 KB; /img/logo.png 728.8 KB; www.bungie.net/img/destiny_content/pgcr/calzones.jpg 619.1 KB; auth.astrixparadox.com/bungie/page/loadout 534.8 KB

**Build Forge**: auth.astrixparadox.com/bungie/page/build-forge 1358.9 KB; www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg 756.4 KB; www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg 747.2 KB; /img/logo.png 728.8 KB; www.bungie.net/img/destiny_content/pgcr/template_strike.jpg 692.2 KB

**Reports**: www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg 756.5 KB; www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg 747.4 KB; /img/logo.png 728.8 KB; www.bungie.net/img/destiny_content/pgcr/template_strike.jpg 692.5 KB; www.bungie.net/img/destiny_content/pgcr/calzones.jpg 619.2 KB

**Storage**: auth.astrixparadox.com/bungie/page/vault 1259.5 KB; www.bungie.net/img/destiny_content/pgcr/escalation_shire.jpg 756.4 KB; www.bungie.net/img/destiny_content/pgcr/schism_trophy_hall.jpg 747.3 KB; /img/logo.png 728.8 KB; www.bungie.net/img/destiny_content/pgcr/calzones.jpg 619 KB

**Armoury**: /img/logo.png 728.8 KB; www.bungie.net/img/destiny_content/pgcr/calzones.jpg 619.3 KB; www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg 248 KB; www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg 224.3 KB; www.bungie.net/img/destiny_content/pgcr/mission_overwhelm.jpg 219.4 KB

## Files requested under more than one URL

Same file, different ?v= query. Each extra URL is a separate download and a separate module instance.

**Home** (4 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 2 URLs
- /astrix-app/shared/astrix-destination-ribbon.js: 2 URLs
- /astrix-app/shared/astrix-portal-loader.css: 2 URLs
- /astrix-app/shared/astrix-portal-loader.js: 2 URLs

**Journey** (2 files)

- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 2 URLs

**Character** (16 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs: 4 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-semantic-resolver.mjs: 4 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-build-binding.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-item-hover.mjs: 3 URLs
- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/core/dim-import/cache.mjs: 2 URLs
- /astrix-app/core/page-ready-contract.mjs: 2 URLs
- /astrix-app/core/prepared-page-client.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-gear-layout.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-perk-tooltip.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-super-catalog.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-presentation.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-stat-model.mjs: 2 URLs
- /astrix-app/shared/guardian-inventory-workspace.mjs: 2 URLs

**Forge Loader** (8 files)

- /astrix-app/core/prepared-page-client.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 3 URLs
- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/pages/forge-loader/forge-loader-model.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-perk-tooltip.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-stat-model.mjs: 2 URLs
- /astrix-app/pages/vault/vault-armour-matcher.mjs: 2 URLs

**Build Forge** (20 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs: 4 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-semantic-resolver.mjs: 4 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-perk-change-plan.mjs: 3 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-super-catalog.mjs: 3 URLs
- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/core/dim-import/cache.mjs: 2 URLs
- /astrix-app/core/page-ready-contract.mjs: 2 URLs
- /astrix-app/core/prepared-page-client.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-perk-tooltip.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-semantic-ui.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-presentation.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-roll-advisor.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-stat-model.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-build-binding.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/paradox-item-hover.mjs: 2 URLs

**Reports** (3 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 2 URLs
- /astrix-app/pages/reports/reports-data.mjs: 2 URLs
- /astrix-app/shared/reports-preload.mjs: 2 URLs

**Storage** (6 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 3 URLs
- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/core/page-ready-contract.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-live-actions.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-weapon-stat-model.mjs: 2 URLs
- /astrix-app/shared/guardian-inventory-workspace.mjs: 2 URLs

**Armoury** (6 files)

- /astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs: 3 URLs
- /astrix-app/core/bungie-item-identity.mjs: 2 URLs
- /astrix-app/core/page-ready-contract.mjs: 2 URLs
- /astrix-app/core/prepared-page-client.mjs: 2 URLs
- /astrix-app/pages/guardian-workspace-v2/guardian-perk-change-plan.mjs: 2 URLs
- /astrix-app/shared/guardian-inventory-workspace.mjs: 2 URLs

## Signed out, for comparison (headless, own profile)

| Page | Profile | Cache | Requests | KB | First paint | Usable |
|---|---|---|---|---|---|---|
| Home | phone | cold | 28 | 356.8 | 1.94 s | 5.37 s |
| Home | phone | warm | 28 | 0.4 | 0.12 s | 0.65 s |
| Home | desktop | cold | 28 | 286.7 | 0.15 s | 0.30 s |
| Home | desktop | warm | 28 | 0.4 | 0.07 s | 0.03 s |
| Journey | phone | cold | 66 | 392.9 | 3.10 s | 7.31 s |
| Journey | phone | warm | 66 | 0.6 | 0.10 s | 0.73 s |
| Journey | desktop | cold | 66 | 1121.9 | 0.24 s | 0.74 s |
| Journey | desktop | warm | 66 | 0.6 | 0.06 s | 0.07 s |
| Character | phone | cold | 162 | 1060.2 | 3.81 s | 9.84 s |
| Character | phone | warm | 165 | 710.1 | 0.21 s | 1.99 s |
| Character | desktop | cold | 305 | 15305.8 | 0.17 s | 5.43 s |
| Character | desktop | warm | 305 | 274.7 | 0.20 s | 1.80 s |
| Forge Loader | phone | cold | 80 | 622.9 | 3.11 s | 5.75 s |
| Forge Loader | phone | warm | 79 | 1.1 | 0.17 s | 1.27 s |
| Forge Loader | desktop | cold | 79 | 552.4 | 0.11 s | 0.22 s |
| Forge Loader | desktop | warm | 79 | 1.1 | 0.11 s | 0.08 s |
| Build Forge | phone | cold | 162 | 1663 | 3.42 s | 12.10 s |
| Build Forge | phone | warm | 167 | 414.6 | 0.44 s | 2.21 s |
| Build Forge | desktop | cold | 300 | 15115.7 | 0.26 s | 5.25 s |
| Build Forge | desktop | warm | 300 | 14.4 | 0.16 s | 1.87 s |
| Reports | phone | cold | 48 | 276.2 | 3.12 s | 5.52 s |
| Reports | phone | warm | 48 | 1.1 | 0.13 s | 1.30 s |
| Reports | desktop | cold | 48 | 1005 | 0.20 s | 0.39 s |
| Reports | desktop | warm | 48 | 1.1 | 0.04 s | 0.05 s |
| Storage | phone | cold | 74 | 613.8 | 3.14 s | 5.81 s |
| Storage | phone | warm | 74 | 1.6 | 0.20 s | 1.85 s |
| Storage | desktop | cold | 74 | 1272.3 | 0.20 s | 0.31 s |
| Storage | desktop | warm | 74 | 1.6 | 0.09 s | 0.07 s |
| Armoury | phone | cold | 74 | 601.7 | 3.19 s | 5.76 s |
| Armoury | phone | warm | 74 | 1.6 | 0.17 s | 1.85 s |
| Armoury | desktop | cold | 74 | 1260.5 | 0.22 s | 0.46 s |
| Armoury | desktop | warm | 74 | 1.6 | 0.12 s | 0.29 s |

