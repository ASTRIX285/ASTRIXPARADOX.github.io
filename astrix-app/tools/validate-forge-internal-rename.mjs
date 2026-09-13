import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

const renamedDirectories=[
  '.forge-community',
  'forge-auth-worker',
  'forge-destiny-backend',
  'forge-manifest-worker',
  'forge-sandbox',
  'forge-worker'
];
const retiredDirectories=[
  '.astrix-community',
  'astrix-auth-worker',
  'astrix-destiny-backend',
  'astrix-manifest-worker',
  'astrix-sandbox',
  'astrix-worker'
];

for(const path of renamedDirectories)assert.ok(existsSync(new URL(`../../${path}/`,import.meta.url)),`${path} must exist`);
for(const path of retiredDirectories)assert.ok(!existsSync(new URL(`../../${path}/`,import.meta.url)),`${path} must be retired`);

const renamedWorkflows=[
  'deploy-forge-sandbox.yml',
  'deploy-forge-worker.yml',
  'forge-build-validation.yml',
  'forge-probe-artifact-sandbox-perks.yml',
  'forge-probe-current-artifact-v2.yml',
  'forge-probe-current-artifact.yml',
  'forge-probe-damage-types.yml',
  'forge-probe-s28-localdb.yml',
  'forge-probe-s28-perks-simple.yml',
  'forge-worker-check.yml'
];
for(const workflow of renamedWorkflows)assert.ok(existsSync(new URL(`../../.github/workflows/${workflow}`,import.meta.url)),`${workflow} must exist`);
const retiredWorkflows=renamedWorkflows.map(workflow=>workflow.replaceAll('forge','astrix'));
for(const workflow of retiredWorkflows)assert.ok(!existsSync(new URL(`../../.github/workflows/${workflow}`,import.meta.url)),`${workflow} must be retired`);

const authWrangler=read('forge-auth-worker/wrangler.toml');
const manifestWrangler=read('forge-manifest-worker/wrangler.toml');
const sandboxWrangler=read('forge-sandbox/wrangler.toml');
const legacyWrangler=read('forge-worker/wrangler.toml');
assert.match(authWrangler,/^name = "astrix-destiny-backend"/m,'The verified auth service name must stay pinned until a separate cutover');
assert.match(manifestWrangler,/^name = "astrix-manifest-data"/m,'The verified manifest service name must stay pinned until a separate cutover');
assert.match(sandboxWrangler,/^name = "astrix-paradox-sandbox"/m,'The verified sandbox service name must stay pinned');
assert.match(legacyWrangler,/^name = "forge-worker"/m,'The legacy source worker must use its Forge internal name');
assert.match(sandboxWrangler,/service = "astrix-destiny-backend"/,'The sandbox service binding must keep the verified deployed auth target');
assert.match(authWrangler,/service = "astrix-manifest-data"/,'The auth service binding must keep the verified deployed manifest target');

const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const textExtensions=/\.(?:css|html|js|json|md|mjs|py|toml|ts|txt|ya?ml)$/i;
const scanPaths=tracked.filter(path=>textExtensions.test(path)&&existsSync(new URL(`../../${path}`,import.meta.url))&&!path.startsWith('ASTRIX285.github.io/')&&path!=='astrix-app/tools/validate-forge-internal-rename.mjs');
const source=scanPaths.map(path=>`${path}\n${readFileSync(new URL(`../../${path}`,import.meta.url),'utf8')}`).join('\n');
const forbidden=[
  ['AstrixLoader',/\bAstrixLoader\b/],
  ['AstrixDestinations',/\bAstrixDestinations\b/],
  ['ASTRIX runtime global',/(?:globalThis|window)\.ASTRIX[A-Za-z0-9_]*/],
  ['ASTRIX environment variable',/\bASTRIX_(?:AUTH_ORIGIN|BUNGIE_SESSION|BUNGIE_SESSION_PROMISE|GAME_COMPONENTS_URL|HERO_PROFILE_PAYLOAD|HERO_PROFILE_PROMISE|LOCATION_VISUALS|ACTIVITY_HISTORY_ENDPOINT|PGCR_ENDPOINT|FORGE_LOADER_PRELOAD_PAYLOAD|FORGE_LOADER_PRELOAD_PROMISE|CACHE)\b/],
  ['ASTRIX log prefix',/\[ASTRIX(?:\]|\s)/],
  ['ASTRIX data attribute',/data-astrix-/],
  ['ASTRIX CSS custom property',/--astrix-/],
  ['ASTRIX worker source path',/(?:^|[^a-z])astrix-(?:auth-worker|manifest-worker|sandbox|worker)(?:\/|\b)/m],
  ['ASTRIX internal host',/astrix-auth\.internal/],
  ['ASTRIX public package name',/astrix-destiny-public-v1/],
  ['ASTRIX saved loadout provider',/provider\s*:\s*['"]astrix-paradox/],
  ['ASTRIX event namespace',/(?:addEventListener|CustomEvent)\s*\(\s*['"]astrix:/]
];
for(const [label,pattern] of forbidden)assert.doesNotMatch(source,pattern,`${label} must be renamed to Forge`);

const workflows=scanPaths.filter(path=>path.startsWith('.github/workflows/')).map(read).join('\n');
assert.doesNotMatch(workflows,/^name:.*ASTRIX/im,'CI workflow names must use Forge');
assert.doesNotMatch(workflows,/^\s*group:\s*astrix-/im,'CI concurrency groups must use Forge');

assert.match(read('astrix-app/pages/tool-intro/tool-intro.mjs'),/astrix_intro_seen_\$\{gameId\}/,'The required per game intro compatibility key must remain unchanged');
assert.match(read('forge-auth-worker/src/index.ts'),/const SESSION_COOKIE = "astrix_session"/,'The active login cookie must remain unchanged to avoid forcing a new Bungie sign in');
assert.ok(existsSync(new URL('../../astrix-app/',import.meta.url)),'The browser visible astrix-app path must remain unchanged');
assert.ok(existsSync(new URL('../../astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-artifact-selection.mjs',import.meta.url)),'The protected Artifact module must remain present');
assert.ok(existsSync(new URL('../../video/Digital Growth 4.mov',import.meta.url)),'The protected video must remain present');

console.log('FORGE_INTERNAL_RENAME=PASS');
console.log('DEPLOYED_SERVICE_AUTH=astrix-destiny-backend');
console.log('DEPLOYED_SERVICE_MANIFEST=astrix-manifest-data');
console.log('DEPLOYED_SERVICE_SANDBOX=astrix-paradox-sandbox');
