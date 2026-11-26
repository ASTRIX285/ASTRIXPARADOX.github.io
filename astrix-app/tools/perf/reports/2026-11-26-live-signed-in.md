# The Forge: phone speed and app readiness, 26 Nov 2026

Measure and report only. Nothing in the site or the Worker is changed by this report.

## How it was measured

- **Signed in:** Miguel's own Chrome on his PC, signed in by Miguel, `perf-measure.mjs --mode attach --profiles desktop,phone --runs 3` (results file written 26 Nov 2026 21:39). 96 loads, no errors.
- **Signed out:** headless Chromium with its own empty profile (never signed in), `perf-measure.mjs --mode launch --profiles desktop,phone --runs 3`, output outside the repo.
- **iPhone stability:** the new `astrix-app/tools/test-forge-loader-webkit.mjs`.

Phone profile: 390x844 at 3x, Lighthouse Slow 4G applied throttling (562.5 ms latency, 1474.56 Kbps down, 675 Kbps up), 4x CPU slowdown. Desktop: 1600x900, no throttling. Usable: the page's forge:portal-ready signal when it fires, otherwise the moment network and DOM went quiet for 2 s (capped at 60 s); the signal of the median run is shown. Median is the middle of the three runs, the slowest run is in brackets. Requests and KB are from the median run. KB is transferred size. The 2 Oct baseline (`2026-10-02-live-baseline.md`) is one signed-in run per row and calls the Builder "Build Forge". Cold clears the HTTP cache only; data the pages keep in browser storage stays, so a cold load can paint from stored account data before the Worker answers.

## Summary

- Phone cold: 1 of 8 pages within the 4 s rule (Home, 3.50 s). 7 over 4 s. Reports hit the 60 s cap on all 3 runs, as on 2 Oct.
- Phone warm: 3 of 8 under 3 s (Home 0.97 s, Journey 1.54 s, Storage 1.58 s). 5 over 4 s: Builder 5.47 s, Character 7.32 s, Armoury 8.18 s, Forge Loader 9.28 s, Reports 22.08 s.
- Against 2 Oct, every phone cold page is faster except Reports (still capped). Phone warm is slower on Builder (+1.79 s) and Reports (+17.53 s).
- Desktop: every page is under 4.3 s cold except Reports (7.47 s); Forge Loader desktop cold is 4.28 s.
- Forge Loader under WebKit: no crash, no render loop, heap flat from 30 to 60 s.

## Comparison with 2 Oct (signed in)

| Page | Profile | 2 Oct usable | Today median (slowest) | Change | Requests | KB | Signal | 4 s rule |
|---|---|---|---|---|---|---|---|---|
| Home | Phone cold | 6.09 s | 3.50 s (5.07 s) | -2.59 s | 89 | 407.1 | forge:portal-ready | 3 to 4 s |
| Home | Phone warm | 1.00 s | 0.97 s (1.00 s) | -0.03 s | 42 | 17.9 | forge:portal-ready | under 3 s |
| Home | Desktop cold | 1.19 s | 0.56 s (1.21 s) | -0.63 s | 101 | 708.5 | forge:portal-ready | - |
| Home | Desktop warm | 0.37 s | 0.34 s (0.38 s) | -0.03 s | 101 | 673.5 | forge:portal-ready | - |
| Journey | Phone cold | 18.10 s | 6.04 s (6.47 s) | -12.06 s | 70 | 416.1 | network and DOM quiet | over 4 s |
| Journey | Phone warm | 12.53 s | 1.54 s (2.62 s) | -10.98 s | 69 | 1.1 | network and DOM quiet | under 3 s |
| Journey | Desktop cold | 11.18 s | 0.64 s (0.64 s) | -10.54 s | 70 | 373.1 | network and DOM quiet | - |
| Journey | Desktop warm | 0.64 s | 0.45 s (0.96 s) | -0.19 s | 69 | 1.1 | network and DOM quiet | - |
| Character | Phone cold | 27.17 s | 12.96 s (20.67 s) | -14.21 s | 232 | 997.5 | forge:portal-ready | over 4 s |
| Character | Phone warm | 36.27 s | 7.32 s (7.89 s) | -28.95 s | 239 | 38.8 | forge:portal-ready | over 4 s |
| Character | Desktop cold | 10.55 s | 2.45 s (3.16 s) | -8.10 s | 336 | 1975.6 | forge:portal-ready | - |
| Character | Desktop warm | 2.57 s | 1.98 s (2.23 s) | -0.59 s | 336 | 312.5 | forge:portal-ready | - |
| Forge Loader | Phone cold | 21.45 s | 16.89 s (24.39 s) | -4.56 s | 225 | 1191 | forge:portal-ready | over 4 s |
| Forge Loader | Phone warm | 38.61 s | 9.28 s (9.41 s) | -29.33 s | 226 | 172.7 | forge:portal-ready | over 4 s |
| Forge Loader | Desktop cold | 10.80 s | 4.28 s (4.53 s) | -6.53 s | 234 | 1484.7 | forge:portal-ready | - |
| Forge Loader | Desktop warm | 2.78 s | 3.24 s (4.04 s) | +0.46 s | 233 | 3.8 | forge:portal-ready | - |
| Builder | Phone cold | 12.10 s | 10.91 s (11.29 s) | -1.19 s | 130 | 1227.4 | network and DOM quiet | over 4 s |
| Builder | Phone warm | 3.68 s | 5.47 s (5.71 s) | +1.79 s | 129 | 2.3 | network and DOM quiet | over 4 s |
| Builder | Desktop cold | 12.61 s | 2.40 s (2.60 s) | -10.21 s | 130 | 1014.7 | network and DOM quiet | - |
| Builder | Desktop warm | 4.58 s | 1.94 s (2.05 s) | -2.65 s | 129 | 2.3 | network and DOM quiet | - |
| Reports | Phone cold | 60.16 s (60 s cap) | 60.02 s (60.24 s) (3 of 3 hit 60 s cap) | -0.14 s | 153 | 10373.1 | timeout 60 s | over 4 s |
| Reports | Phone warm | 4.55 s | 22.08 s (24.13 s) | +17.53 s | 186 | 3837.8 | network and DOM quiet | over 4 s |
| Reports | Desktop cold | 9.94 s | 7.47 s (7.82 s) | -2.47 s | 415 | 39740.1 | forge:portal-ready | - |
| Reports | Desktop warm | 0.51 s | 0.40 s (0.48 s) | -0.11 s | 412 | 121.3 | forge:portal-ready | - |
| Storage | Phone cold | 60.03 s (60 s cap) | 6.05 s (9.74 s) | -53.98 s | 70 | 630.9 | network and DOM quiet | over 4 s |
| Storage | Phone warm | 12.83 s | 1.58 s (1.60 s) | -11.25 s | 69 | 2.1 | network and DOM quiet | under 3 s |
| Storage | Desktop cold | 8.64 s | 0.67 s (0.67 s) | -7.97 s | 70 | 536.5 | network and DOM quiet | - |
| Storage | Desktop warm | 1.90 s | 0.45 s (0.47 s) | -1.45 s | 69 | 2.1 | network and DOM quiet | - |
| Armoury | Phone cold | 13.23 s | 12.07 s (12.38 s) | -1.16 s | 191 | 828.9 | forge:portal-ready | over 4 s |
| Armoury | Phone warm | 8.39 s | 8.18 s (8.96 s) | -0.21 s | 188 | 268.6 | forge:portal-ready | over 4 s |
| Armoury | Desktop cold | 5.06 s | 3.88 s (4.08 s) | -1.18 s | 198 | 1265.5 | forge:portal-ready | - |
| Armoury | Desktop warm | 2.69 s | 2.55 s (2.63 s) | -0.14 s | 197 | 6.2 | forge:portal-ready | - |

## Phone cold pages over 4 s: single biggest cause (signed in, median run)

- **Journey (6.04 s):** the JS/CSS chain. 55 code requests, 240.6 KB, from 632 ms to 5389 ms. `/bungie/page/journey` starts only at 5013 ms and had delivered 0 KB when the page went quiet.
- **Character (12.96 s):** client work after the code has loaded. The JS/CSS chain (114 requests, 431.2 KB) is done at 7711 ms, but usable comes at 12962 ms. No Worker page data arrives in that gap: `/bungie/page/character` starts at 12983 ms. The other 118 requests (Bungie icons among them, one ending at 9800 ms) fill it. Slowest run 20.67 s.
- **Forge Loader (16.89 s):** a burst of Bungie item icons. The JS/CSS chain is done at 4781 ms, then the five slowest requests of the load are `bungie.net` icon images (5.2 to 6.8 KB each), all starting at 9.9 s and taking 4.87 to 5.29 s each under Slow 4G. 225 requests in the load against 60 code requests. `/bungie/page/loadout` starts at 14621 ms, after the icons. Slowest run 24.39 s.
- **Builder (10.91 s):** the JS/CSS chain. 112 code requests, 534.6 KB, module depth 4, ending at 9412 ms (`paradox-build-space.mjs` 40.7 KB takes 3877 ms alone). `/bungie/page/build-forge` starts at 5713 ms and was still streaming (212.6 KB) when measured.
- **Reports (60.02 s, cap on all 3 runs):** the Worker call `/bungie/page/journey`. It starts at 3789 ms, runs 29672 ms and returns 0 KB (the 30 s client timeout). After it, Bungie pgcr activity art loads eagerly: 10373 KB in the median run, single images up to 570.5 KB.
- **Storage (6.05 s):** the map placeholder `astrix-paradox-map-placeholder-6k.webp`, 208.1 KB, the largest request, from 2668 ms to 4997 ms. `/bungie/page/vault` (starts 4049 ms) had delivered 0 KB when the page went quiet. Slowest run 9.74 s.
- **Armoury (12.07 s):** Bungie item icons after a late `/paradox/loadouts` call. The JS/CSS chain is done at 4745 ms. The icons start at 9535 ms and take up to 3037 ms (the largest is 50.5 KB, ending at 11620 ms). `/paradox/loadouts` is called twice, at 10506 ms and 12083 ms.

Also seen on every phone page: `/bungie/account` takes about 0.6 s and starts only after the code (3.4 to 5.5 s in). Every `/bungie/page/*` call except Builder's had delivered 0 KB when the page was measured.

## Signed out, today (3 runs, headless, own empty profile)

No run timed out or hit the 60 s cap. Every row used the "network and DOM quiet" signal: forge:portal-ready never fired signed out, so these times include the sign-in state settling, not a usable tool. They are a floor for the page shell, not a measure of the signed-in 4 s rule.

| Page | Profile | Median usable | Slowest run | Runs (ms) | Requests | KB | First paint | 4 s rule (phone) |
|---|---|---|---|---|---|---|---|---|
| Home | Phone cold | 4.74 s | 4.96 s | 4958, 4744, 4738 | 36 | 468.4 | 2.01 s | over 4 s |
| Home | Phone warm | 0.66 s | 0.67 s | 673, 664, 658 | 36 | 1.1 | 0.12 s | under 3 s |
| Home | Desktop cold | 0.17 s | 3.82 s | 3821, 172, 168 | 36 | 374 | 0.12 s | - |
| Home | Desktop warm | 0.07 s | 0.09 s | 86, 64, 65 | 36 | 1 | 0.08 s | - |
| Journey | Phone cold | 5.72 s | 5.74 s | 5740, 5703, 5724 | 66 | 412.1 | 3.82 s | over 4 s |
| Journey | Phone warm | 0.72 s | 0.72 s | 717, 724, 724 | 66 | 1 | 0.12 s | under 3 s |
| Journey | Desktop cold | 0.20 s | 0.55 s | 550, 195, 139 | 66 | 412.2 | 0.16 s | - |
| Journey | Desktop warm | 0.07 s | 0.08 s | 80, 44, 74 | 66 | 1 | 0.05 s | - |
| Character | Phone cold | 9.52 s | 9.60 s | 9602, 9524, 9466 | 136 | 1016 | 5.08 s | over 4 s |
| Character | Phone warm | 1.42 s | 1.43 s | 1425, 1415, 1338 | 136 | 5.4 | 0.26 s | under 3 s |
| Character | Desktop cold | 0.35 s | 1.27 s | 1273, 354, 303 | 137 | 1037 | 0.24 s | - |
| Character | Desktop warm | 0.14 s | 0.14 s | 136, 128, 142 | 137 | 5.4 | 0.20 s | - |
| Forge Loader | Phone cold | 6.86 s | 6.89 s | 6854, 6886, 6855 | 69 | 647 | 4.07 s | over 4 s |
| Forge Loader | Phone warm | 0.76 s | 0.77 s | 763, 770, 739 | 69 | 1 | 0.22 s | under 3 s |
| Forge Loader | Desktop cold | 0.21 s | 0.46 s | 461, 204, 209 | 69 | 552.6 | 0.16 s | - |
| Forge Loader | Desktop warm | 0.09 s | 0.09 s | 85, 86, 49 | 69 | 1 | 0.11 s | - |
| Builder | Phone cold | 8.86 s | 8.87 s | 8871, 8849, 8857 | 126 | 1031.5 | 5.25 s | over 4 s |
| Builder | Phone warm | 1.42 s | 1.45 s | 1424, 1452, 1370 | 126 | 1.6 | 0.28 s | under 3 s |
| Builder | Desktop cold | 0.46 s | 0.64 s | 641, 456, 435 | 126 | 1031.1 | 0.25 s | - |
| Builder | Desktop warm | 0.32 s | 0.33 s | 318, 334, 318 | 126 | 1.6 | 0.21 s | - |
| Reports | Phone cold | 5.29 s | 5.30 s | 5274, 5285, 5296 | 46 | 296 | 3.40 s | over 4 s |
| Reports | Phone warm | 0.70 s | 0.71 s | 699, 701, 706 | 46 | 1 | 0.11 s | under 3 s |
| Reports | Desktop cold | 0.35 s | 0.46 s | 349, 147, 464 | 46 | 296.4 | 0.35 s | - |
| Reports | Desktop warm | 0.04 s | 0.04 s | 41, 41, 40 | 46 | 1 | 0.05 s | - |
| Storage | Phone cold | 6.85 s | 6.86 s | 6856, 6854, 6853 | 67 | 647.8 | 3.94 s | over 4 s |
| Storage | Phone warm | 1.33 s | 1.34 s | 1343, 1330, 1268 | 67 | 1.6 | 0.18 s | under 3 s |
| Storage | Desktop cold | 0.36 s | 0.42 s | 361, 170, 418 | 67 | 553.3 | 0.34 s | - |
| Storage | Desktop warm | 0.09 s | 0.10 s | 82, 101, 89 | 67 | 1.5 | 0.12 s | - |
| Armoury | Phone cold | 6.92 s | 6.93 s | 6925, 6929, 6903 | 73 | 663.9 | 4.13 s | over 4 s |
| Armoury | Phone warm | 1.27 s | 1.27 s | 1268, 1267, 1258 | 73 | 1.6 | 0.17 s | under 3 s |
| Armoury | Desktop cold | 0.38 s | 0.60 s | 597, 376, 365 | 73 | 569.5 | 0.17 s | - |
| Armoury | Desktop warm | 0.30 s | 0.30 s | 294, 301, 296 | 73 | 1.6 | 0.10 s | - |

Note on desktop cold: the first run of each page is slower than runs 2 and 3 (Home 3.82 s against 0.17 s); the median removes that first-start effect, the slowest column keeps it visible.

## Phone cold pages over 4 s when signed out

- **Home (4.74 s):** the JS/CSS chain, 25 code requests, 113.6 KB, from 607 ms to 4583 ms; usable follows at 4744 ms. All fonts and `astrix-destination-ribbon.js` (2089 ms on its own) queue behind it.
- **Journey (5.72 s):** the JS/CSS chain, 55 code requests, 240.6 KB, ending at 4467 ms, then `/img/ax-logo-640.webp` ends at 5142 ms; first paint waits until 3816 ms.
- **Character (9.52 s):** the JS/CSS chain, 120 code requests, 497.1 KB, module depth 5, ending at 8938 ms. The map placeholders 6k (208.1 KB, end 8460 ms) and 4k (113.8 KB, end 7911 ms) both load as well.
- **Forge Loader (6.86 s):** the map placeholder `astrix-paradox-map-placeholder-6k.webp`, 208.1 KB, the largest request, ending at 6274 ms; the JS/CSS chain (57 requests, 271 KB) is done at 4725 ms.
- **Builder (8.86 s):** the JS/CSS chain, 112 code requests, 534.6 KB, module depth 4, ending at 7837 ms (`paradox-build-space.mjs` 40.7 KB alone takes 3879 ms). Both map placeholders (6k and 4k) load too, the 6k ending at 8267 ms.
- **Reports (5.29 s):** the JS/CSS chain, 36 code requests, 152 KB, ending at 4020 ms, then `/img/ax-logo-640.webp` ends at 4703 ms and Typekit fonts at about 4.2 s.
- **Storage (6.85 s):** the map placeholder 6k webp, 208.1 KB, starts only at 3908 ms and ends at 6269 ms; the JS/CSS chain is done at 4608 ms.
- **Armoury (6.93 s):** the map placeholder 6k webp, 208.1 KB, ending at 6343 ms; the JS/CSS chain is done at 4777 ms.

Every phone cold page also spends about 600 ms on the HTML request alone (562.5 ms throttled latency).

## iPhone stability: Forge Loader under WebKit

Test: `node astrix-app/tools/test-forge-loader-webkit.mjs`. Playwright WebKit 26.5 (webkit v2336), iPhone 15 profile at 393 px and deviceScaleFactor 3, full Warlock inventory fixture plus the real prepared armour index, held open 60 s from the load event. Bungie art is a local stand-in, no network leaves the machine. WebKit in Playwright gives no JS heap reading, so the heap comes from the same page and profile in Chromium after a forced garbage collection.

| | 0 s | 30 s | 60 s |
|---|---|---|---|
| WebKit DOM nodes | 390 | 538 | 538 |
| Chromium JS heap (KB, after GC) | 1240 | 26216 | 26221 |
| Chromium DOM nodes | 390 | 538 | 538 |

- Crashed: no. Uncaught page errors: none.
- Render loop: settled. 4 animation frames and 133 DOM mutations in the first 5 s, then 0 frames and 0 mutations in every 5 s window to 60 s.
- Heap: the 0 s reading is at the load event, before the page has built its data; it then holds flat from 30 to 60 s (+5 KB). No steady growth.
- Result: `FORGE_LOADER_WEBKIT=PASS`. The old "Can't open this page" crash does **not** reproduce here. Limits: desktop WebKit on Windows does not enforce the iOS per tab memory limit, the fixture is one Warlock (the live account may hold more), and Bungie art is not downloaded. A real iPhone check is still needed before closing `fix/forge-loader-mobile`.

## App readiness (report only, checked on main at 22ba581b, after #604 The Aetherium PWA)

- **Manifest:** `/site.webmanifest` is linked by every Forge page: Home, Journey, Character, Forge Loader, Forge Loader results, Builder, Reports, Storage, Armoury, and by The Hub. Not linked: `sign-in/`, `guardian-workspace-v1/`, `guardian-workspace-v2/shooting-range-test/`, and the redirect stubs `tool-intro/` and `mission-reports/`. Since #604 the site manifest has `id: "/"` and `start_url: "/"` (the home page, not a Forge page) and still no `scope`; its description now leads with AION 2. The Forge has no manifest of its own. The Aetherium has its own (`hub/aetherium/aetherium.webmanifest`, scope `/hub/aetherium/`).
- **viewport-fit=cover:** no Forge page sets it. Only The Aetherium pages under `hub/aetherium/` set it (added by #604).
- **Service worker:** none for The Forge. The only one is The Aetherium's `hub/aetherium/sw.js`, registered with scope `/hub/aetherium/` (`astrix-app/pages/aetherium/aetherium-app.mjs`), so it does not cover `/astrix-app/`.
- **OAuth redirect:** the auth Worker reads `env.OAUTH_REDIRECT_URI` (`forge-auth-worker/src/index.ts`, typed in `src/env.d.ts`). It is a plain Wrangler var in `forge-auth-worker/wrangler.toml` `[vars]`, set to `https://auth.astrixparadox.com/bungie/callback`, not a secret. After sign-in the Worker returns to a URL on an origin listed in `APP_ORIGINS`, else to `DEFAULT_RETURN_URL` (Journey) (`forge-auth-worker/src/web.ts`). Bungie keys stay in Worker secrets (`BUNGIE_API_KEY`, `BUNGIE_CLIENT_ID`, `BUNGIE_CLIENT_SECRET`); values not read.

## Verdict

**Not ready:** signed in, 7 of 8 phone cold pages are over 4 s (Forge Loader 16.89 s, Reports capped at 60 s), 5 of 8 phone warm pages are over 4 s, and The Forge has no service worker.

Fixes needed before a PWA, from the causes above:
1. Reports Worker call timing out at 30 s.
2. Bungie icon bursts on Forge Loader and Armoury.
3. The JS/CSS chain on Builder and Journey.
4. The late, 0 KB prepared page calls.
5. App shell for The Forge: a service worker covering `/astrix-app/`, a manifest with a Forge `start_url` and `scope`, and `viewport-fit=cover` (The Aetherium has all three since #604).
6. A real iPhone check of Forge Loader.

## perf-report.mjs output, signed in, 26 Nov 2026 (first run of each row)

Measured with `astrix-app/tools/perf/perf-measure.mjs` in Miguel's own Chrome (signed in by Miguel, attached over CDP).
Phone: 390x844 at 3x, Lighthouse Slow 4G applied throttling (562.5 ms latency, 1474.56 Kbps down, 675 Kbps up), 4x CPU slowdown. Desktop: 1600x900, no throttling.
Cold: browser cache cleared before the load (cookies kept). Warm: the next load with the cache kept.
First paint: first contentful paint. Usable: the page's forge:portal-ready signal when it fires, otherwise the moment network and DOM went quiet for 2 s (capped at 60 s); the signal used is shown per row.
KB is transferred size (compressed). Paths only; query strings are never recorded.

### Per page

| Page | Profile | Cache | Requests | KB | First paint | Usable | Usable signal |
|---|---|---|---|---|---|---|---|
| Home | phone | cold | 43 | 451.3 | 2.06 s | 5.07 s | forge:portal-ready |
| Home | phone | warm | 41 | 15.9 | 0.25 s | 1.00 s | forge:portal-ready |
| Home | desktop | cold | 103 | 1251.9 | 0.19 s | 1.21 s | forge:portal-ready |
| Home | desktop | warm | 101 | 673.5 | 0.07 s | 0.34 s | forge:portal-ready |
| Journey | phone | cold | 70 | 388.1 | 3.48 s | 5.84 s | network and DOM quiet |
| Journey | phone | warm | 69 | 21.5 | 0.78 s | 2.62 s | network and DOM quiet |
| Journey | desktop | cold | 70 | 373.1 | 0.24 s | 0.64 s | network and DOM quiet |
| Journey | desktop | warm | 69 | 1.1 | 0.06 s | 0.96 s | network and DOM quiet |
| Character | phone | cold | 243 | 1724.9 | 5.21 s | 20.67 s | forge:portal-ready |
| Character | phone | warm | 241 | 13.1 | 0.43 s | 7.15 s | forge:portal-ready |
| Character | desktop | cold | 337 | 2868.2 | 0.32 s | 3.16 s | forge:portal-ready |
| Character | desktop | warm | 336 | 83.9 | 0.09 s | 2.23 s | forge:portal-ready |
| Forge Loader | phone | cold | 230 | 1616.6 | 6.56 s | 24.39 s | forge:portal-ready |
| Forge Loader | phone | warm | 225 | 159.6 | 0.34 s | 9.41 s | forge:portal-ready |
| Forge Loader | desktop | cold | 235 | 2023.9 | 0.54 s | 4.53 s | forge:portal-ready |
| Forge Loader | desktop | warm | 233 | 3.7 | 0.10 s | 4.04 s | forge:portal-ready |
| Builder | phone | cold | 131 | 1259.8 | 5.74 s | 11.29 s | network and DOM quiet |
| Builder | phone | warm | 129 | 31.7 | 0.46 s | 5.44 s | network and DOM quiet |
| Builder | desktop | cold | 130 | 1014.9 | 0.54 s | 2.60 s | network and DOM quiet |
| Builder | desktop | warm | 129 | 2.3 | 0.12 s | 2.05 s | network and DOM quiet |
| Reports | phone | cold | 151 | 10128 | 3.43 s | 60.24 s | timeout 60 s |
| Reports | phone | warm | 186 | 3837.8 | 0.21 s | 22.08 s | network and DOM quiet |
| Reports | desktop | cold | 51 | 311.1 | 0.36 s | 0.74 s | network and DOM quiet |
| Reports | desktop | warm | 50 | 33.5 | 0.05 s | 0.48 s | network and DOM quiet |
| Storage | phone | cold | 70 | 630.9 | 5.20 s | 9.74 s | network and DOM quiet |
| Storage | phone | warm | 69 | 2.1 | 0.23 s | 1.56 s | network and DOM quiet |
| Storage | desktop | cold | 70 | 536.6 | 0.32 s | 0.67 s | network and DOM quiet |
| Storage | desktop | warm | 69 | 2.1 | 0.07 s | 0.47 s | network and DOM quiet |
| Armoury | phone | cold | 189 | 775.4 | 4.06 s | 11.70 s | forge:portal-ready |
| Armoury | phone | warm | 188 | 268.6 | 0.34 s | 8.18 s | forge:portal-ready |
| Armoury | desktop | cold | 198 | 1265.5 | 0.32 s | 3.88 s | forge:portal-ready |
| Armoury | desktop | warm | 197 | 6.2 | 0.14 s | 2.55 s | forge:portal-ready |

### Time split per stage (cold loads)

Times are from the first request of the load. HTML: document request start to end. JS/CSS: first code request start to last code response end. Worker data: prepared page payload and live profile from auth.astrixparadox.com, first start to last end, with bytes (streamed bytes counted) and calls still open when the load was measured. Render: usable minus the last Worker data response.

| Page | Profile | HTML | JS/CSS requests | JS/CSS KB | JS/CSS span | Module depth | Worker calls | Worker data span | Render after data | Usable |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | phone | 2-598 ms | 22 | 115.7 | 600-5070 ms | 2 | 3 | none | - | 5.07 s |
| Home | desktop | 3-42 ms | 81 | 301.5 | 46-1525 ms | 3 | 5 | 1311-1656 ms, 655.1 KB, 1 still open | 0 ms | 1.21 s |
| Journey | phone | 3-353 ms | 56 | 223.2 | 53-4682 ms | 1 | 2 | 4300-? ms, 0 KB, 1 still open | 5845 ms | 5.84 s |
| Journey | desktop | 3-25 ms | 55 | 197.4 | 31-419 ms | 1 | 2 | 456-? ms, 0 KB, 1 still open | 636 ms | 0.64 s |
| Character | phone | 4-619 ms | 122 | 497.1 | 629-10147 ms | 5 | 4 | 5464-12571 ms, 656.9 KB, 1 still open | 8096 ms | 20.67 s |
| Character | desktop | 3-37 ms | 127 | 515.9 | 43-3356 ms | 5 | 4 | 514-929 ms, 655.9 KB, 1 still open | 2230 ms | 3.16 s |
| Forge Loader | phone | 3-797 ms | 62 | 260.9 | 128-7074 ms | 2 | 3 | 6756-10691 ms, 540.6 KB, 1 still open | 13697 ms | 24.39 s |
| Forge Loader | desktop | 2-167 ms | 64 | 289.8 | 262-4595 ms | 3 | 4 | 795-1190 ms, 540.8 KB, 2 still open | 3342 ms | 4.53 s |
| Builder | phone | 4-632 ms | 113 | 534.5 | 91-9682 ms | 4 | 4 | 6058-? ms, 244.9 KB, 1 still open | 11291 ms | 11.29 s |
| Builder | desktop | 3-166 ms | 112 | 534.5 | 190-1061 ms | 4 | 4 | 786-? ms, 0 KB, 1 still open | 2596 ms | 2.60 s |
| Reports | phone | 3-586 ms | 36 | 152 | 627-4050 ms | 1 | 2 | 3757-33460 ms, 0 KB | 26785 ms | 60.24 s |
| Reports | desktop | 2-170 ms | 36 | 151.9 | 189-364 ms | 1 | 4 | 397-? ms, 0 KB, 1 still open | 736 ms | 0.74 s |
| Storage | phone | 3-878 ms | 53 | 248.6 | 879-5812 ms | 1 | 3 | 5274-? ms, 0 KB, 1 still open | 9740 ms | 9.74 s |
| Storage | desktop | 3-26 ms | 53 | 248.6 | 36-302 ms | 1 | 3 | 453-? ms, 0 KB, 1 still open | 672 ms | 0.67 s |
| Armoury | phone | 17-610 ms | 62 | 289 | 614-4711 ms | 2 | 2 | none | - | 11.70 s |
| Armoury | desktop | 4-60 ms | 67 | 307.8 | 73-3941 ms | 3 | 4 | 3986-? ms, 0 KB, 1 still open | 3877 ms | 3.88 s |

### Worker calls (phone, cold)

**Home**: /session at 2693 ms, 575 ms, 1 KB; /bungie/home at 4472 ms, 584 ms, 1 KB; /bungie/historical-stats at 5063 ms, still open (last byte - ms), 0 KB

**Journey**: /bungie/account at 4091 ms, 569 ms, 0.6 KB; /bungie/page/journey at 4300 ms, still open (last byte - ms), 0 KB

**Character**: /session at 5275 ms, 620 ms, 1 KB; /bungie/account at 5277 ms, 626 ms, 0.6 KB; /bungie/page/character at 5464 ms, 7107 ms, 656.9 KB; /bungie/page/character at 20449 ms, still open (last byte - ms), 0 KB

**Forge Loader**: /bungie/account at 6468 ms, 575 ms, 0.6 KB; /bungie/page/loadout at 6756 ms, 3935 ms, 540.6 KB; /bungie/page/loadout at 21887 ms, still open (last byte - ms), 0 KB

**Builder**: /bungie/account at 5879 ms, 617 ms, 0.6 KB; /bungie/page/build-forge at 6058 ms, still open (last byte 13958 ms), 244.9 KB; /paradox/loadouts at 8899 ms, 570 ms, 0.7 KB; /paradox/loadouts at 10406 ms, 875 ms, 0.5 KB

**Reports**: /bungie/account at 3436 ms, 583 ms, 0.6 KB; /bungie/page/journey at 3757 ms, 29703 ms, 0 KB

**Storage**: /bungie/account at 5121 ms, 613 ms, 0.6 KB; /session at 5132 ms, 634 ms, 1 KB; /bungie/page/vault at 5274 ms, still open (last byte - ms), 0 KB

**Armoury**: /bungie/account at 4057 ms, 599 ms, 0.6 KB; /paradox/loadouts at 11498 ms, still open (last byte - ms), 0 KB

### Five slowest requests per page (phone, cold)

**Home**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 606 ms | 2074 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 606 ms | 2034 ms | 6.2 |
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 2002 ms | 1790 ms | 208.1 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 602 ms | 1609 ms | 23.4 |
| /fonts/barlow-semi-condensed-600.woff2 | Font | 602 ms | 1592 ms | 23.2 |

**Journey**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 365 ms | 2769 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 365 ms | 2609 ms | 6.2 |
| /astrix-app/shared/astrix-location-visuals.js | Script | 365 ms | 2506 ms | 1.9 |
| /astrix-app/shared/astrix-destination-theme.js | Script | 365 ms | 2483 ms | 1.8 |
| /astrix-app/pages/journey/journey.mjs | Script | 361 ms | 2185 ms | 31.3 |

**Character**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/character | Fetch | 5464 ms | 7107 ms | 656.9 |
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 5026 ms | 4835 ms | 208.1 |
| /img/ax-logo-160.webp | Image | 650 ms | 4347 ms | 6.2 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 650 ms | 4124 ms | 10.6 |
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp | Image | 5257 ms | 3714 ms | 113.8 |

**Forge Loader**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 811 ms | 5182 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 811 ms | 4921 ms | 6.2 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 801 ms | 4613 ms | 23.4 |
| /fonts/barlow-semi-condensed-600.woff2 | Font | 801 ms | 4604 ms | 23.2 |
| www.bungie.net/common/destiny2_content/icons/d63292c9248c5e3ae823605307140199.jpg | Image | 19765 ms | 4563 ms | 0 |

**Builder**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /img/ax-logo-160.webp | Image | 674 ms | 5409 ms | 6.2 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 674 ms | 5123 ms | 10.6 |
| /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs | Script | 665 ms | 4504 ms | 40.7 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 656 ms | 4306 ms | 23.5 |
| /fonts/barlow-semi-condensed-600.woff2 | Font | 656 ms | 4298 ms | 23.2 |

**Reports**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/page/journey | Fetch | 3757 ms | 29703 ms | 0 |
| www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg | Image | 41419 ms | 8286 ms | 248 |
| www.bungie.net/img/destiny_content/pgcr/patrol_edz.jpg | Image | 47093 ms | 8161 ms | 179.2 |
| www.bungie.net/img/destiny_content/pgcr/solo_luna.jpg | Image | 24929 ms | 7913 ms | 165.2 |
| www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg | Image | 44129 ms | 7778 ms | 224.3 |

**Storage**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp | Image | 3455 ms | 5663 ms | 208.1 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 890 ms | 3865 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 890 ms | 3619 ms | 6.2 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 881 ms | 3350 ms | 23.5 |
| /fonts/barlow-semi-condensed-600.woff2 | Font | 881 ms | 3224 ms | 23.2 |

**Armoury**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 624 ms | 2871 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 624 ms | 2839 ms | 6.2 |
| /fonts/barlow-semi-condensed-700.woff2 | Font | 615 ms | 2618 ms | 23.4 |
| /fonts/barlow-semi-condensed-600.woff2 | Font | 615 ms | 2602 ms | 23.2 |
| /astrix-app/pages/loadout/paradox-loadouts.mjs | Script | 621 ms | 2555 ms | 17.8 |

### Five largest requests per page (phone, cold)

**Home**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; /fonts/barlow-400.woff2 22.4 KB; use.typekit.net/af/b697ec/0000000000000000775ab3ad/31/l 20.8 KB

**Journey**: /astrix-app/pages/journey/journey.mjs 31.3 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB; use.typekit.net/af/e43add/0000000000000000775ab3af/31/l 21.2 KB

**Character**: auth.astrixparadox.com/bungie/page/character 656.9 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; www.bungie.net/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png 29 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB

**Forge Loader**: auth.astrixparadox.com/bungie/page/loadout 540.6 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB

**Builder**: auth.astrixparadox.com/bungie/page/build-forge 244.9 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs 40.7 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB

**Reports**: www.bungie.net/img/destiny_content/pgcr/calzones.jpg 536 KB; www.bungie.net/img/destiny_content/pgcr/raid_beanstalk.jpg 248 KB; www.bungie.net/img/destiny_content/pgcr/rituals_a_deadly_trial.jpg 224.3 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_encore.jpg 203 KB; www.bungie.net/img/destiny_content/pgcr/pinnacle_ops_exotic_starcrossed.jpg 197.3 KB

**Storage**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; /fonts/barlow-500.woff2 22.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB

**Armoury**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.2 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB; use.typekit.net/af/e43add/0000000000000000775ab3af/31/l 21.2 KB

### Five slowest requests per page (desktop, cold)

**Home**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/home | Fetch | 556 ms | 653 ms | 1 |
| auth.astrixparadox.com/bungie/page/character | Fetch | 1311 ms | 344 ms | 655.1 |
| /astrix-app/pages/journey/ | Fetch | 1211 ms | 270 ms | 10 |
| /astrix-app/pages/forge-loader/ | Other | 1235 ms | 248 ms | 6.6 |
| /astrix-app/pages/journey/ | Other | 1234 ms | 246 ms | 0 |

**Journey**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/account | Fetch | 399 ms | 205 ms | 0.6 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 33 ms | 147 ms | 10.6 |
| /astrix-app/shared/astrix-location-visuals.js | Script | 33 ms | 143 ms | 1.9 |
| /img/ax-logo-160.webp | Image | 33 ms | 143 ms | 6.2 |
| /astrix-app/shared/astrix-destination-theme.js | Script | 33 ms | 142 ms | 1.8 |

**Character**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/common/destiny2_content/icons/4255d1a8072565741e8aef86c38be122.jpg | Image | 3054 ms | 618 ms | 1.7 |
| www.bungie.net/common/destiny2_content/icons/afd8d014a0cf2e76a73172beae7ef0ee.jpg | Image | 3039 ms | 597 ms | 3.5 |
| www.bungie.net/common/destiny2_content/icons/178bb0e78e55c5b960aa6f42660b9b66.jpg | Image | 3039 ms | 594 ms | 5.9 |
| www.bungie.net/common/destiny2_content/icons/5a8a03d4876d34a89db6aedf6189ab86.jpg | Image | 3039 ms | 476 ms | 4.9 |
| auth.astrixparadox.com/bungie/page/character | Fetch | 514 ms | 416 ms | 655.9 |

**Forge Loader**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/common/destiny2_content/icons/9caeff89015f02ad52e6fefe95398b01.jpg | Image | 2812 ms | 1546 ms | 6.4 |
| www.bungie.net/common/destiny2_content/icons/3ae064e4a93ea26a394ff35171193eed.jpg | Image | 2812 ms | 1378 ms | 6.4 |
| www.bungie.net/common/destiny2_content/icons/de34570a93281dc201690cfd146e6d24.jpg | Image | 2813 ms | 1307 ms | 5.6 |
| www.bungie.net/common/destiny2_content/icons/e47c31826843f6fd0aa863eac6fd093e.jpg | Image | 2813 ms | 1298 ms | 5.8 |
| www.bungie.net/common/destiny2_content/icons/6acdff9af5ae274c70055f816aab2389.jpg | Image | 2813 ms | 1296 ms | 4.8 |

**Builder**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/paradox/loadouts | Fetch | 1566 ms | 1029 ms | 0.5 |
| auth.astrixparadox.com/bungie/account | Fetch | 551 ms | 305 ms | 0.6 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 193 ms | 244 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 193 ms | 243 ms | 6.2 |
| /astrix-app/pages/guardian-workspace-v2/paradox-build-space/ | Document | 0 ms | 166 ms | 13 |

**Reports**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/account | Fetch | 335 ms | 249 ms | 0.6 |
| auth.astrixparadox.com/bungie/reports/catalogue | Fetch | 382 ms | 194 ms | 32.3 |
| /astrix-app/pages/reports/ | Document | 0 ms | 170 ms | 4.1 |
| /img/ax-logo-160.webp | Image | 190 ms | 81 ms | 6.2 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 190 ms | 81 ms | 10.6 |

**Storage**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| auth.astrixparadox.com/bungie/account | Fetch | 283 ms | 244 ms | 0.6 |
| /astrix-app/shared/astrix-destination-ribbon.css | Stylesheet | 37 ms | 190 ms | 4 |
| /astrix-app/shared/astrix-destination-ribbon.js | Script | 37 ms | 87 ms | 10.6 |
| /img/ax-logo-160.webp | Image | 37 ms | 86 ms | 6.2 |
| /site.webmanifest | Manifest | 45 ms | 73 ms | 1 |

**Armoury**

| Request | Type | Start | Duration | KB |
|---|---|---|---|---|
| www.bungie.net/common/destiny2_content/icons/7feccda2bcb49a1667e206d53616931c.png | Image | 2471 ms | 1378 ms | 6.2 |
| www.bungie.net/common/destiny2_content/icons/6a0118280ba432e796048648993d7765.jpg | Image | 2469 ms | 1061 ms | 5.6 |
| auth.astrixparadox.com/paradox/loadouts | Fetch | 1820 ms | 928 ms | 0.5 |
| www.bungie.net/common/destiny2_content/icons/6df50890b5e91f346630ab461cd78388.png | Image | 2471 ms | 876 ms | 8.3 |
| www.bungie.net/common/destiny2_content/icons/32759b0ce261d185ac8a06b7dc9cafb4.png | Image | 2471 ms | 871 ms | 5.7 |

### Five largest requests per page (desktop, cold)

**Home**: auth.astrixparadox.com/bungie/page/character 655.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; /astrix-app/pages/journey/journey.mjs 31.3 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB

**Journey**: /astrix-app/pages/journey/journey.mjs 31.4 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB; use.typekit.net/af/e43add/0000000000000000775ab3af/31/l 21.2 KB

**Character**: auth.astrixparadox.com/bungie/page/character 655.9 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; www.bungie.net/common/destiny2_content/icons/e9dc1cc0179cda4d2445845cf8992a7e.png 57.3 KB; www.bungie.net/common/destiny2_content/icons/feb001db8e9776bc822007c74564c1b6.png 56.5 KB

**Forge Loader**: auth.astrixparadox.com/bungie/page/loadout 540.8 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; www.bungie.net/common/destiny2_content/icons/415756ba775da748e7045deb076ebc6b.jpg 21.4 KB

**Builder**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp 208.1 KB; /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; /astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs 40.7 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB

**Reports**: auth.astrixparadox.com/bungie/reports/catalogue 32.3 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; use.typekit.net/af/ff7c14/0000000000000000775ab3ac/31/l 20.8 KB; use.typekit.net/af/b697ec/0000000000000000775ab3ad/31/l 20.8 KB

**Storage**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; /fonts/barlow-semi-condensed-700.woff2 23.4 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB; /fonts/barlow-500.woff2 22.2 KB; use.typekit.net/af/c252f0/0000000000000000775ab3a5/31/l 21.2 KB

**Armoury**: /astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp 113.8 KB; www.bungie.net/common/destiny2_content/icons/b1efa0eaa710653d85e2fcf5321047fb.png 50.5 KB; www.bungie.net/common/destiny2_content/icons/b54195b2d82a31ae970ca85fb7fb0be7.png 36.6 KB; /fonts/barlow-semi-condensed-700.woff2 23.5 KB; /fonts/barlow-semi-condensed-600.woff2 23.2 KB

### Files requested under more than one URL

Same file, different ?v= query. Each extra URL is a separate download and a separate module instance.

**Home** (3 files)

- /astrix-app/shared/astrix-destination-ribbon.js: 2 URLs
- /astrix-app/shared/astrix-portal-loader.css: 2 URLs
- /astrix-app/shared/astrix-portal-loader.js: 2 URLs

**Journey** (0 files)

- none

**Character** (0 files)

- none

**Forge Loader** (0 files)

- none

**Builder** (0 files)

- none

**Reports** (0 files)

- none

**Storage** (0 files)

- none

**Armoury** (0 files)

- none

### Signed out, for comparison (headless, own profile)

| Page | Profile | Cache | Requests | KB | First paint | Usable |
|---|---|---|---|---|---|---|
| Home | phone | cold | 36 | 463.8 | 2.23 s | 4.96 s |
| Home | phone | warm | 36 | 0.8 | 0.14 s | 0.67 s |
| Home | desktop | cold | 38 | 389.1 | 3.19 s | 3.82 s |
| Home | desktop | warm | 38 | 18.6 | 0.09 s | 0.09 s |
| Journey | phone | cold | 66 | 412.2 | 3.83 s | 5.74 s |
| Journey | phone | warm | 66 | 1 | 0.12 s | 0.72 s |
| Journey | desktop | cold | 66 | 412.1 | 0.45 s | 0.55 s |
| Journey | desktop | warm | 66 | 1 | 0.05 s | 0.08 s |
| Character | phone | cold | 136 | 1015.9 | 5.12 s | 9.60 s |
| Character | phone | warm | 136 | 5.4 | 0.27 s | 1.43 s |
| Character | desktop | cold | 137 | 1036.8 | 0.51 s | 1.27 s |
| Character | desktop | warm | 137 | 5.4 | 0.20 s | 0.14 s |
| Forge Loader | phone | cold | 69 | 647.1 | 4.08 s | 6.85 s |
| Forge Loader | phone | warm | 69 | 1 | 0.22 s | 0.76 s |
| Forge Loader | desktop | cold | 69 | 552.8 | 0.37 s | 0.46 s |
| Forge Loader | desktop | warm | 69 | 1 | 0.11 s | 0.09 s |
| Builder | phone | cold | 126 | 1031.3 | 5.32 s | 8.87 s |
| Builder | phone | warm | 126 | 1.6 | 0.28 s | 1.42 s |
| Builder | desktop | cold | 126 | 1031.2 | 0.38 s | 0.64 s |
| Builder | desktop | warm | 126 | 1.6 | 0.21 s | 0.32 s |
| Reports | phone | cold | 46 | 296.5 | 3.40 s | 5.27 s |
| Reports | phone | warm | 46 | 1 | 0.10 s | 0.70 s |
| Reports | desktop | cold | 46 | 296.4 | 0.35 s | 0.35 s |
| Reports | desktop | warm | 46 | 1 | 0.05 s | 0.04 s |
| Storage | phone | cold | 67 | 647.8 | 3.96 s | 6.86 s |
| Storage | phone | warm | 67 | 1.5 | 0.20 s | 1.34 s |
| Storage | desktop | cold | 67 | 553.3 | 0.34 s | 0.36 s |
| Storage | desktop | warm | 67 | 1.6 | 0.12 s | 0.08 s |
| Armoury | phone | cold | 73 | 663.9 | 4.13 s | 6.92 s |
| Armoury | phone | warm | 73 | 1.6 | 0.17 s | 1.27 s |
| Armoury | desktop | cold | 73 | 569.7 | 0.34 s | 0.60 s |
| Armoury | desktop | warm | 73 | 1.6 | 0.12 s | 0.29 s |
