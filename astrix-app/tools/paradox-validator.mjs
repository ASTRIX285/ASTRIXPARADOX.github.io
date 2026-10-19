// The PARADOX validator: every suite below, run by validator-runner.mjs (18 Oct 2026).
//   node astrix-app/tools/paradox-validator.mjs            changed areas on a branch (every suite on main and in CI)
//   node astrix-app/tools/paradox-validator.mjs --all      every suite (the GitHub check validate-paradox.yml runs this)
//   --serial runs one by one and stops at the first failure, as before; --jobs=N sets the pool size.
// Mark a suite browser(...) when it starts Chromium (1 at a time on 8 cores or fewer, 2 above, --browsers=N up to 3), and {name,serial:true} when it cannot share
// the machine: it times itself against a fixed limit, or writes files inside the repo while it runs.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main} from './validator-runner.mjs';

const browser=name=>({name,browser:true});
export const validators=[
  'validate-scope-guard.mjs',
  'test-scope-guard.mjs',
  'test-paradox-validator-runner.mjs', // The validator runner: pool, --serial, --changed areas, result lines.
  'test-game-folders.mjs',
  'validate-game-folders.mjs',
  'test-division-validator.mjs',
  'validate-division.mjs',
  'test-division-build-format.mjs',
  'test-division-ubisoft-adapter.mjs',
  browser('test-aetherium-pages.mjs'), // The Aetherium Daeva Card and Gear page: demo, live, roster, faction, Worker down, layout.
  {name:'test-aetherium-character.mjs',browser:true,serial:true}, // The Aetherium character menu, Gear, Skills and Daevanion pages: cards, tabs, hover card, board totals, layout. Serial: its Gear tile look check failed under load (18 Oct 2026).
  'test-aetherium-worker.mjs', // AION 2 armory Worker: whitelist, cache, rate limit, CORS, 502.
  browser('test-hub-cards.mjs'), // The Hub: full-bleed card art, text backdrop, spare card map image.
  'test-aion2-adapter.mjs', // AION 2 armory adapter: ASTRIX285 fixtures to the character model.
  'test-aion2-advisor.mjs', // AION 2 Ascent Plan advisor: data coverage, sources, level-aware plans.
  {name:'test-aetherium-ascent.mjs',browser:true,serial:true}, // The Aetherium Ascent Plan page: by hand, with a Daeva, Worker down, layout. Serial: its title and data line layout check failed under load (18 Oct 2026).
  browser('test-aetherium-guide.mjs'), // The Aetherium AION 2 Guide: shell, home grid, class roles table, class pages, setup flag, layout.
  browser('test-aetherium-guide-general.mjs'), // The Aetherium Guide, General section and FAQ: facts with sources, resets in the local zone, layout.
  'test-workbench-editor.mjs',
  'validate-local-preview.mjs',
  'validate-ribbon-buttons.mjs',
  'test-game-footers.mjs',
  'validate-bungie-footer.mjs',
  'test-clips-design.mjs', // Clips: builder keeps the page design, no inline handlers or reveals.
  browser('test-clips-cards.mjs'), // Clips cards: visible at rest, clean picture, readable sizes, player, filters, thumbnail fallbacks.
  browser('test-forge-tint.mjs'), // The Forge: faint steel-blue background and edges, Ember actions, public pages neutral.
  browser('test-capsule-buttons.mjs'), // Buttons: reactor capsule with the dial on headline actions; locked stream buttons unchanged.
  'test-reports-data.mjs',
  'test-reports-drilldown.mjs',
  'test-reports-three-stage.mjs',
  'test-reports-boxes.mjs',
  {name:'test-background-prebuild.mjs',browser:true,serial:true}, // feature/background-page-prebuild: tabs and Reports sections open from what was built. Serial: fixed 100 ms open limits.
  'validate-reports-catalogue.mjs',
  'validate-no-dashes.mjs', // Forge final pass: no en or em dash in visible copy.
  browser('test-recovery-states.mjs'), // Forge final pass: one recovery panel, three states.
  'validate-plain-language.mjs', // Prompt 19: copy-only language contract.
  'validate-forge-internal-rename.mjs',
  'validate-site-typography.mjs',
  'validate-guardian-adaptive-layout.py',
  'validate-guardian-character-cards.py',
  'validate-guardian-complete-loadout.py',
  'validate-main-page-today.mjs',
  'test-character-loadout-status.mjs',
  'test-loadout-details.mjs', // Prompt 3: resolved view and guarded actions.
  'test-loadout-details-backend.mjs',
  'test-dim-import.mjs',
  'test-dim-adaptation.mjs',
  'test-dim-import-cache.mjs',
  'test-dim-manifest-smoke.mjs',
  'test-worker-limits.mjs',
  'test-dim-tether.mjs',
  'validate-super-formation.mjs',
  'validate-responsive-layout-contract.mjs',
  'validate-destination-theming.mjs',
  'test-gloss-controls.mjs',
  'validate-portal-loader.mjs',
  'validate-single-loader.mjs',
  browser('validate-single-module-urls.mjs'),
  {name:'test-portal-single-skin.mjs',browser:true,serial:true}, // Serial: its 200 ms breach readiness window failed under load (18 Oct 2026).
  browser('test-seamless-transitions.mjs'), // feature/seamless-tool-transitions: no frame before readiness.
  browser('test-home-browser.mjs'),
  browser('test-asset-weight.mjs'), // perf/asset-weight: no first-load image over 300 KB, no full manifest.
  'validate-tools-hub.mjs',
  'validate-sitemap.mjs', // sitemap.xml and robots.txt match the public pages.
  'validate-tool-intro.mjs',
  'validate-auth-session.mjs',
  'test-profile-size.mjs',
  'test-profile-cache-budget.mjs',
  'test-profile-worker-lifecycle.mjs',
  'validate-visible-release-state.mjs',
  'validate-vault-foundation.mjs',
  'validate-forge-loader.mjs',
  'test-forge-loader-residency.mjs',
  'validate-journey-visual-pass.mjs',
  'test-europa-marker-sources.mjs', // Europa sourcing request: reject incomplete markers.
  'test-journey-maps.mjs', // Prompt 24: marker and chest contrast contracts.
  'validate-public-deep-space.mjs',
  'validate-live-artifact-contract.mjs',
  'test-artifact-provenance.mjs',
  'test-artifact-recommender.mjs',
  'test-forge-artifact-selection.mjs',
  'test-forge-background.mjs',
  {name:'test-engine-budget.mjs',serial:true}, // Serial: engine timing budgets, and it writes temporary engine copies inside the repo.
  'test-engine-stream-review.mjs',
  'test-forge-super-synergy.mjs',
  'test-forge-weapon-anchor.mjs',
  'validate-manifest-service.mjs',
  'test-manifest-service.mjs',
  'test-backend-data.mjs',
  'test-manifest-coverage.py',
  'test-manifest-retirement.mjs',
  'test-active-profile-refresh.mjs',
  'validate-prepared-page-refresh.mjs',
  'validate-page-ready-performance.mjs',
  'validate-shared-page-load.mjs',
  'validate-renderable-page-data.mjs',
  'test-forge-index-transport.mjs',
  'test-weapon-catalogue.mjs',
  'test-weapon-stat-mapping.mjs',
  'test-weapon-stat-apply.mjs',
  'test-apply-refresh-regressions.mjs',
  'test-forge-set-list.mjs',
  'test-weapon-diagnostics.mjs',
  'test-weapon-presentation.mjs',
  'test-champion-overlays.mjs',
  'test-journey-collections.mjs',
  'test-journey-records.mjs',
  'validate-paradox-item-cards.mjs',
  'test-build-space-character-isolation.mjs',
  'test-build-forge-equipped-entry.mjs',
  browser('test-build-forge-zoom.mjs'),
  'test-build-review.mjs',
  'test-dim-fit-status.mjs',
  'test-forge-weapon-variety.mjs',
  'test-apply-stale-socket-changes.mjs',
  'test-apply-readback-lag.mjs',
  'test-forge-exotic-weapon-synergy.mjs',
  'test-character-live-data.mjs',
  'test-recommended-build-reveal.mjs',
  'validate-paradox-build-space.mjs',
  'test-manual-build-editor.mjs',
  'validate-live-actions-worker.mjs',
  'validate-guardian-semantics.mjs',
  'validate-weapon-perk-apply.mjs',
  'validate-weapon-rolls.mjs'
];

// Run only when called as the command, so the runner test can import the list.
const self=fileURLToPath(import.meta.url).toLowerCase();
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===self)process.exit(await main(process.argv.slice(2),validators));
