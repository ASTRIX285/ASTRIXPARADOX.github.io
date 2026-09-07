import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {expandForgeArmourIndex} from '../core/forge-index-transport.mjs';

const ROOT=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,ROOT),'utf8');
const forgeIndexSource=await read('data/forge-armour-index.json').catch(()=>null);
const forgeIndex=forgeIndexSource?expandForgeArmourIndex(JSON.parse(forgeIndexSource)):null;
const [service,sessionCache,profile,preparedClient,portal,build,interceptor,resolver,fixture,artifact,beta,recommender,worker,wrapper]=await Promise.all([
  read('pages/guardian-workspace-v2/guardian-manifest-service.mjs'),
  read('pages/guardian-workspace-v2/guardian-session-cache.mjs'),
  read('pages/guardian-workspace-v2/guardian-bungie-profile.mjs'),
  read('core/prepared-page-client.mjs'),
  read('pages/guardian-workspace-v2/guardian-portal-progress.mjs'),
  read('pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs'),
  read('pages/guardian-workspace-v2/guardian-semantic-interceptor.mjs'),
  read('pages/guardian-workspace-v2/guardian-semantic-resolver.mjs'),
  read('pages/guardian-workspace-v2/guardian-fixture-loader.mjs'),
  read('pages/guardian-workspace-v2/guardian-artifact.mjs'),
  read('pages/guardian-workspace-v2/guardian-beta-selection.mjs'),
  read('pages/guardian-workspace-v2/guardian-artifact-recommender.mjs'),
  read('../forge-auth-worker/src/index.ts'),
  read('../forge-auth-worker/src/semantic-wrapper.ts')
]);

for(const type of ['DestinyInventoryItemDefinition','DestinySandboxPerkDefinition','DestinyArtifactDefinition','DestinyPlugSetDefinition','DestinyStatDefinition','DestinySocketCategoryDefinition','DestinyEquipableItemSetDefinition']){
  assert.match(service,new RegExp(`"${type}"`),`${type} is missing from the browser manifest service`);
  assert.match(worker,new RegExp(`"${type}"`),`${type} is missing from the Worker allowlist`);
}
assert.match(sessionCache,/DB_VERSION=2/,'Manifest store requires the IndexedDB schema upgrade');
assert.match(sessionCache,/MANIFEST_STORE_NAME="manifest-data"/,'Manifest data must use a store beside the Guardian session cache');
assert.match(service,/manifest:\$\{version\}:\$\{type\}/,'Manifest tables must be keyed by version and component type');
assert.match(service,/current\?\.version===version[\s\S]*?readTable\(version,type\)/,'Matching versions must load all component tables from IndexedDB');
assert.match(service,/versionMatched=true[\s\S]*?Bungie manifest loaded from local cache/,'Version match skips must be observable without showing a manifest version');
assert.match(service,/commitVersion\(version\)[\s\S]*?removeOtherVersions\(version\)/,'The current marker must commit only after all component writes');
assert.doesNotMatch(service,/bungie\/manifest\/definition/,'Browser definition service must not retain a single definition route');
assert.match(service,/const allowNetwork=!this\.backend&&options\.allowNetwork!==false/,'Prepared page payloads must disable browser definition network expansion by construction');
assert.match(service,/this\.backend\?"prepared-page-payload"[\s\S]*?"prepared-bulk-manifest"/,'Prepared page payload resolution must be observable');
assert.match(service,/initialiseCached\(\)[\s\S]*?Backend manifest current · resolving owned armour only/,'Forge pages must be able to inspect an existing manifest cache without starting a full component download');
assert.match(service,/loadForgeArmourIndex[\s\S]*?manifestVersion[\s\S]*?version!==this\.version/,'The compact Forge index must be rejected unless it matches the current Bungie manifest version');
assert.match(service,/requestUrl\.searchParams\.set\("manifest",this\.version\)/,'The compact Forge index request must bypass stale static-asset caches when Bungie changes manifest version.');
assert.match(service,/applyForgeArmourIndex[\s\S]*?hourly-compact-manifest/,'The compact Forge index must merge only as an explicit verified payload source');
assert.match(service,/payload\.artifactCatalog=index\.artifactCatalog[\s\S]*?artifactCatalogCoverage=\{model:"artifact-2-socket-buckets"/,'The compact Forge join must carry the complete verified Artifact 2.0 catalogue into the private Guardian payload.');
assert.match(service,/options\.waitForManifest!==false/,'Selective payload hydration must be able to proceed without waiting for every full manifest table');
assert.match(service,/allowNetwork=!this\.backend&&options\.allowNetwork!==false/,'The compact Forge join must forbid live definition expansion for prepared page payloads.');
assert.match(service,/const profile=payload\?\.profile\|\|\{\};[\s\S]*?profile\?\.profilePlugSets/,'Reusable plug-set hydration must read from the current private profile without an undeclared runtime binding.');
if(forgeIndex){
  assert.equal(forgeIndex.schemaVersion,4,'The compact Forge armour and Artifact index schema must remain explicit.');
  assert.ok(Object.keys(forgeIndex.definitions).length>5000,'The compact Forge index must contain the complete verified armour definition catalogue.');
  assert.ok(Object.values(forgeIndex.definitions).every(row=>row.itemType===2),'The compact Forge index must never include non-armour inventory definitions.');
  assert.ok(Object.keys(forgeIndex.plugDefinitions).length>0,'The compact Forge index must carry pre-resolved armour plug definitions so Forge Loader never expands them one request at a time.');
  assert.ok(Object.keys(forgeIndex.socketCategoryDefinitions).length>0,'The compact Forge index must carry the socket-category evidence used to classify installed armour mods.');
  assert.ok(Object.keys(forgeIndex.socketLayouts).length>0,'Repeated armour socket layouts must be deduplicated into a shared index.');
  assert.ok(Array.isArray(forgeIndex.artifactCatalog)&&forgeIndex.artifactCatalog.length>0,'The compact Forge index must contain the verified Artifact 2.0 catalogue.');
  assert.ok(forgeIndex.artifactCatalog.every(row=>row.availabilityModel==='artifact-2-socket-buckets'&&row.selectionLimit>0&&row.selectionSlots?.length&&row.perks?.length),'Every compact Artifact record must contain its legal socket buckets and perk definitions.');
  assert.ok(Buffer.byteLength(forgeIndexSource)<7*1024*1024,'The Forge index must remain small enough to replace the multi-table browser bootstrap.');
}

assert.match(worker,/Destiny2\/Manifest\//,'Worker must call GetDestinyManifest with the Bungie API key');
assert.match(worker,/jsonWorldComponentContentPaths\?\.en/,'Worker must use English JSON world component paths');
assert.match(worker,/new Response\(upstream\.body/,'Large manifest components must stream through the Worker without buffering');
assert.doesNotMatch(worker,/manifestComponentRoute[\s\S]{0,2600}upstream\.json/,'Manifest component proxy must not buffer the table as JSON');
assert.match(worker,/manifest_version_changed/,'Component downloads must reject a stale requested version');
assert.match(worker,/MANIFEST_METADATA_TTL_SECONDS = 60 \* 60/,'The Worker manifest metadata cache must refresh hourly.');
assert.match(worker,/scheduled\([\s\S]*?refreshDestinyManifestMetadata/,'The Worker must silently warm the current Bungie manifest version on its cron trigger.');
assert.match(worker,/manifest-definition-v2\/\$\{requestedVersion \? "versioned" : "current"\}\/\$\{encodeURIComponent\(manifest\.version \|\| "unknown"\)\}/,'Single-definition cache entries must isolate manifest versions and versioned cache lifetimes.');
assert.match(worker,/https:\/\/manifest\/resolve/,'Worker page payloads must resolve definitions through the prepared bulk manifest service');
assert.match(worker,/url\.pathname\.startsWith\("\/bungie\/page\/"\)/,'Worker must expose dedicated prepared page routes');
assert.match(worker,/definitions"\) === "client-manifest"/,'Profile and loadout routes must expose raw client-manifest mode');
assert.match(wrapper,/definitions"\) === "client-manifest"/,'Semantic wrapper must skip per-hash enrichment in client-manifest mode');

assert.match(profile,/guardianManifest\.hydratePayload/,'Profile and loadout payloads must hydrate from the manifest service');
assert.match(profile,/const page=currentPagePayloadKind\(\)[\s\S]*?loadPreparedPagePayload\(session,page/,'Profile loading must delegate to the shared prepared page client');
assert.match(preparedClient,/new URL\(`\/bungie\/page\/\$\{pageKind\(page\)\}`/,'The shared page client must use the dedicated prepared route that demotes Worker per-hash enrichment');
assert.match(profile,/Unresolved Destiny item \$\{hash\}/,'Missing item hashes must have a labelled placeholder');
assert.match(profile,/payload\?\.statDefinitions/,'Stat names and icons must resolve from DestinyStatDefinition');
assert.match(profile,/socketCategoryDefinitions/,'Socket-category evidence must reach equipped plug resolution');
assert.match(interceptor,/socketCategoryHash[\s\S]*?socketCategoryDefinition/,'Alternative weapon columns must retain socket-category evidence');
assert.match(resolver,/socketCategory\(plug\)[\s\S]*?weapon-mod[\s\S]*?perk/,'Weapon perk-versus-mod classification must consult the socket category first');
assert.match(portal,/forge:manifest-progress/,'Main portal loader must show manifest progress');
assert.match(portal,/await manifestReady/,'Main portal must not clear before the manifest is ready');
assert.match(build,/guardianManifest\.ready\(\)\.finally/,'Build portal must not clear before the manifest is ready');

for(const [label,source] of [['fixture',fixture],['artifact',artifact],['beta selector',beta]]){
  assert.match(source,/guardianManifest/ ,`${label} must resolve display definitions through the full manifest service`);
  assert.doesNotMatch(source,/inventoryItems\?\.\[String\(hash\)\][\s\S]{0,300}\.display/,`${label} must not use curated inventory display data`);
}
assert.match(fixture,/function curatedSemantics/,'Fixture identities must retain the curated tags layer');
assert.match(fixture,/directionEvidence/,'Curated official descriptions must remain available as reasoning evidence');
assert.match(recommender,/curatedTags\?\.inventoryItems/,'Artifact reasoning must retain curated weapon tags');
assert.match(recommender,/definition\.displayProperties\?\.name/,'Artifact reasoning display identity must come from full definitions');
assert.doesNotMatch(recommender,/row\.display/,'Artifact reasoning must not use curated display identity');

console.log('MANIFEST_VERSION_CACHE_CONTRACT=PASS');
console.log('MANIFEST_WORKER_STREAM_CONTRACT=PASS');
console.log('MANIFEST_PROFILE_ARTIFACT_RESOLUTION=PASS');
console.log('MANIFEST_CURATED_TAGS_ONLY=PASS');
console.log('MANIFEST_LOADER_AND_PREPARED_PAYLOAD=PASS');
