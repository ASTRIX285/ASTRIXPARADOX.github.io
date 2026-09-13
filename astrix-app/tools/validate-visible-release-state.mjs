import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`,'utf8');

const activePages=[
  'tools/index.html',
  'astrix-app/index.html',
  'astrix-app/components/guardian-workspace/guardian-workspace.html',
  'astrix-app/pages/guardian-workspace-v1/index.html',
  'astrix-app/pages/guardian-workspace-v2/index.html',
  'astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html',
  'astrix-app/pages/guardian-workspace-v2/shooting-range-test/index.html',
  'astrix-app/pages/journey/index.html',
  'astrix-app/pages/mission-reports/index.html',
  'astrix-app/pages/vault/index.html',
  'astrix-app/pages/forge-loader/index.html',
  'astrix-app/pages/tool-intro/index.html',
  'astrix-app/pages/loadout/index.html'
];

function visibleHtml(source){
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&(?:nbsp|copy);/gi,' ');
}

const releaseState=/\b(?:alpha|beta|authenticated|version|preview)\b|\bv\d+(?:\.\d+)+(?:[ .][a-z0-9]+)?/i;
for(const page of activePages){
  assert.doesNotMatch(visibleHtml(read(page)),releaseState,`${page} must not show a release state, authentication state or version marker`);
}

const renderedSources=[
  'astrix-app/components/guardian-workspace/guardian-workspace.mjs',
  'astrix-app/components/guardian-workspace/guardian-workspace.preview.json',
  'astrix-app/pages/guardian-workspace-v1/guardian-workspace-v1.mjs',
  'astrix-app/pages/guardian-workspace-v1/guardian-workspace-v1.preview.json',
  'astrix-app/pages/guardian-workspace-v2/guardian-artifact.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-beta-readiness.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-beta-runtime.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-beta-selection.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-bungie-profile.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-portal-progress.mjs',
  'astrix-app/pages/guardian-workspace-v2/guardian-vault-access.mjs',
  'astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',
  'astrix-app/pages/journey/journey.mjs',
  'astrix-app/pages/mission-reports/mission-reports.mjs',
  'astrix-app/pages/vault/vault.mjs',
  'astrix-app/pages/forge-loader/forge-loader.mjs',
  'astrix-app/pages/tool-intro/tool-intro-config.mjs',
  'astrix-app/pages/tool-intro/tool-intro.mjs'
].map(read).join('\n');

const retiredLabels=/ALPHA NOTE|BUNGIE SECURED|GUARDIAN BUILD FORGE (?:ALPHA|BETA)|ENTER (?:DESTINY )?ALPHA|Alpha · Invitation Only|AUTHENTICATED JOURNEY|BUNGIE CONNECTED|Public v1|Public static version|Season Preview|PREVIEW GUARDIAN|Loading verified preview state|v1\.0\.0-alpha|Preview data only|Beta Loadouts|selected for alpha preview|Copy this beta link|Telemetry synchronized from Paradox beta fixture|Waiting for authenticated Guardian build|Loading authenticated account inventory|Resolving authenticated Bungie inventory|Fixture\/DIM builds can supply Artifact selections here/i;
assert.doesNotMatch(renderedSources,retiredLabels,'Runtime rendered copy must not restore retired release or authentication labels');

const readiness=read('astrix-app/pages/guardian-workspace-v2/guardian-beta-readiness.mjs');
assert.doesNotMatch(readiness,/<small>\$\{f\.fixtureId\}<\/small>/,'Internal fixture identifiers must not be rendered');
assert.doesNotMatch(readiness,/tester access code|Alpha access code|alphaAccessForm|alphaAccessCode|accessGate/i,'Legacy tester access controls must stay absent');

const manifest=read('astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs');
assert.doesNotMatch(manifest,/label:`Bungie manifest \$\{version\}/,'Manifest progress must not render a version marker');

assert.equal(existsSync(`${root}astrix-app/pages/guardian-alpha/index.html`),false,'Retired Guardian Alpha HTML must stay deleted');
assert.equal(existsSync(`${root}astrix-app/pages/guardian-alpha/guardian-alpha.mjs`),false,'Retired Guardian Alpha runtime must stay deleted');

console.log('VISIBLE_RELEASE_STATE_REMOVED=PASS');
console.log('VISIBLE_AUTH_STATUS_REMOVED=PASS');
console.log('VISIBLE_VERSION_MARKERS_REMOVED=PASS');
