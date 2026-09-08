import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tools=fileURLToPath(new URL('./',import.meta.url));
const validators=[
  'validate-scope-guard.mjs',
  'validate-forge-internal-rename.mjs',
  'validate-site-typography.mjs',
  'validate-guardian-adaptive-layout.py',
  'validate-guardian-character-cards.py',
  'validate-guardian-complete-loadout.py',
  'validate-main-page-today.mjs',
  'validate-super-formation.mjs',
  'validate-responsive-layout-contract.mjs',
  'validate-destination-theming.mjs',
  'validate-portal-loader.mjs',
  'validate-tools-hub.mjs',
  'validate-tool-intro.mjs',
  'validate-visible-release-state.mjs',
  'validate-vault-foundation.mjs',
  'validate-forge-loader.mjs',
  'validate-journey-visual-pass.mjs',
  'validate-public-deep-space.mjs',
  'validate-live-artifact-contract.mjs',
  'test-artifact-provenance.mjs',
  'test-artifact-recommender.mjs',
  'test-forge-artifact-selection.mjs',
  'test-forge-background.mjs',
  'validate-manifest-service.mjs',
  'test-manifest-service.mjs',
  'test-backend-data.mjs',
  'validate-prepared-page-refresh.mjs',
  'validate-page-ready-performance.mjs',
  'validate-shared-page-load.mjs',
  'validate-renderable-page-data.mjs',
  'test-forge-index-transport.mjs',
  'test-weapon-catalogue.mjs',
  'test-weapon-stat-mapping.mjs',
  'test-weapon-diagnostics.mjs',
  'test-journey-collections.mjs',
  'test-journey-records.mjs',
  'validate-paradox-item-cards.mjs',
  'test-build-space-character-isolation.mjs',
  'test-recommended-build-reveal.mjs',
  'validate-paradox-build-space.mjs',
  'test-manual-build-editor.mjs',
  'validate-live-actions-worker.mjs',
  'validate-guardian-semantics.mjs',
  'validate-weapon-perk-apply.mjs',
  'validate-weapon-rolls.mjs'
];

for(const validator of validators){
  const executable=validator.endsWith('.py')?'python3':process.execPath;
  const result=spawnSync(executable,[`${tools}${validator}`],{cwd:fileURLToPath(new URL('../../',import.meta.url)),stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}

console.log('PARADOX_VALIDATOR=PASS');
