# Journey map integration

Prepared 20 September 2026 from main `d0e596d3c5b460637a35f3d98e8b628de862fec8`.
Original branch: `codex/journey-map-node-links`, merged as PR #272.

## Director presentation correction

Follow-up branch: `codex/journey-director-fidelity`, from main
`4b90b17239d7c4007c838d7e201da70402a297fd`.

Pale Heart's visible artwork uses the 4K canvas rectangle x=0, y=472,
width=3840, height=1216. The viewer crops the export's broad black padding with
CSS. The image and every point share the same coordinate transform at both
resolutions. The source images and original coordinates are unchanged.
Expand Map uses native full screen where supported to make the panorama easier
to read. Escape or Close Map returns to the Journey page.

Hand-drawn symbols and numbered clusters are removed. The renderer uses only
official Bungie icon URLs attached to the point's own definition or activity
variants. It rejects missing-icon placeholders and external URLs. Missing or
failed icons leave a transparent, keyboard-operable map target with its name on
hover, focus or selection. Every point remains in the searchable catalogue.
This is not a claim that every in-game Director icon is available: the pinned
manifest does not publish artwork for many campaign, landing and vendor points.
Those need original icon assets before an exact in-game visual match is possible.

The map test verifies all 18 asset hashes, catalogue coverage and every Pale
Heart point's coordinate round-trip at 4K and 6K. Scope guard still rejects the
previously introduced map model, explorer, map test and this documentation path.
Its allowlist is unchanged; this correction must not be reported as release-ready
on the strength of the unrelated Guardian workflow.

## Changes

The approved EDZ, Pale Heart, Throne World, Kepler, Dreaming City, Moon, Neomuna,
Europa and Nessus map pairs replace Journey's placeholders. The initial image
is 3840 x 2160; zoom requests the 5760 x 3240 version. The previously missing
Nessus 4K file and the two corner-filled EDZ exports are included. All 18 files
decode at the declared dimensions and match the approved export checksums.
These are enlarged exports from smaller cleaned masters.

Kepler is selectable. Nessus matches the official destination name Arcadian
Valley. Existing Cosmodrome artwork and all nine approved pin coordinates are
retained. Tower and Lawless Frontier are not added as geographic maps.

Every named node in the ten canonical destination graphs has a catalogue entry.
The list also includes all named destination bubbles, and named location releases
for those destination hashes, grouped by type and name. Search, type filters,
keyboard-operable map targets, point details, activity variants
and Show on map use the same entries. Region chests join the explorer only when
the existing profile pipeline publishes verified progress. A new destination or
Guardian data load clears previously displayed chest progress.

Catalogue membership establishes neither current availability nor completion.
The UI states this explicitly. Historical and rotating activities remain in the
catalogue. Unnamed graph nodes are recorded in provenance and are not given
invented names. Locations without supported coordinates remain searchable with
"Map position unavailable". This does not claim a map pin for every possible
collectible, underground area, changing vendor position or seasonal activity.

## Coverage and coordinate evidence

| Destination | Public catalogue entries | Supported positions |
| --- | ---: | ---: |
| EDZ | 50 | 12 |
| Nessus | 61 | 10 |
| Dreaming City | 30 | 8 |
| Moon | 54 | 22 |
| Throne World | 51 | 23 |
| Neomuna | 47 | 17 |
| Europa | 51 | 20 |
| Pale Heart | 52 | 18 |
| Kepler | 26 | 19 |
| Cosmodrome | 25 | 9 approved existing pins |

There are 447 public catalogue entries and 158 supported positions, including
the nine existing Cosmodrome pins. The renderer supplements the Cosmodrome
catalogue with existing approved markers where no same-name entry is present.
Live regional chests are additional, and do not receive inferred coordinates.

`data/journey-map-calibration.json` records the measured screenshot icon controls
and exact text matches used for artwork label positions. Graph-to-screenshot
controls have maximum residuals between 0 and 4.59 preview pixels. Cleaned
artwork registration uses affine feature matching, with its matrices and fit
evidence recorded in `journey-map-registration.json` and
`journey-map-provenance.json`. Europa's weak automatic fit is replaced by six
manual label controls; its maximum control residual is 35.90 master pixels.
All new mapped positions are explicitly approximate in the point details.
These fits do not prove that generated artwork preserves every source feature.
Independent visual review of the pins remains required, especially on Europa.

Both export sizes use the same normalized positions, including Pale Heart's
content offset. No screenshot-to-stitch transform is treated as a transform
onto generated artwork. Asset hashes bind the calibration to this approved batch.

## Public-data provenance and rebuilding

The official Bungie manifest version is `244213.26.06.29.2000-1-bnet.65864`.
The exact component URLs and SHA-256 checksums for destination, activity graph,
location and activity-type definitions are in `data/journey-map-provenance.json`.
Activity variants use the repository's matching Journey index. The builder rejects
mixed manifest versions. Public catalogue imports are per destination and do not
fetch an authenticated profile or a full runtime manifest.

Rebuild with Python, NumPy and Pillow:

```sh
python astrix-app/tools/build-journey-map-data.py \
  --manifest-dir /path/to/map-inspection \
  --review-dir /path/to/ASTRIX-Map-Review-2026-09-20
```

The manifest directory contains `bungie-map-manifest.json` with `version` and
`paths`, and a `bungie/` subdirectory containing the four full component tables
listed in provenance. The review directory is the approved review ZIP contents.
Registration matrices and measured controls are versioned in this repository.

## Validation and release blockers

Passing checks, exit 0:

- `node astrix-app/tools/test-journey-maps.mjs`: all ten destinations, complete
  named graph-node coverage, IDs, bounds, known/unknown completion separation,
  search, clustering, Cosmodrome coordinates, 18 asset checksums and WebP headers.
- Independent Pillow decoding: 18 of 18 exports at their declared dimensions.
- `test-journey-destinations.mjs`, `test-journey-records.mjs`,
  `test-journey-collections.mjs`, `test-journey-summary-css.mjs` and
  `validate-prepared-page-refresh.mjs`.
- JavaScript syntax checks for changed modules and `git diff --check`.

Existing release validators were not modified. Comparison against a clean
worktree at the base commit gives these results:

| Validator | Clean base | This branch | Reason |
| --- | ---: | ---: | --- |
| Scope guard | 0 | 1 | New map assets, public catalogues, calibration and test files are outside its locked allowlist. |
| Destination theming | 0 | 1 | It requires exactly the previous ten shared destinations, including Tower; Kepler adds an eleventh. |
| Journey visual pass | 1 | 1 | Base fails its Vault inventory assertion. This branch first fails exact cache-URL assertions; later assertions also require eight placeholders, the old module URL and the static Cosmodrome-only renderer. |
| Page-ready performance | 1 | 1 | Both fail the same pre-existing Guardian module invalidation assertion. |

`paradox-validator.mjs` stops at the scope guard on this branch. Do not report
the complete release gate as passing. The independent reviewer must reconcile
intentional scope and roster changes with the project owner before the locked
assertions are updated. Forge Loader files are unchanged.

The browser integration test is prepared at `tools/test-journey-map-browser.mjs`.
It covers destination switching, real image dimensions, lazy 6K, search, keyboard
activation, zoom, filters, chest reset and mobile overflow. It could not execute
here: the installed Playwright package had no Chromium executable and the
official browser downloads timed out. This is a pending check, not a pass.
Run it in an environment with Playwright and Chromium installed:

```sh
node astrix-app/tools/test-journey-map-browser.mjs
```

Optional environment variables: `JOURNEY_BROWSER_PATH` for an existing Chromium
binary and `JOURNEY_SCREENSHOT_DIR` for desktop/mobile captures. The test serves
the real map modules and assets locally; it needs no Bungie account. Authenticated
Guardian, record and quest checks still require the independent live review.

The project workflow requires independent Claude review and same-day approval
before merge. No deployment is included in this candidate.
