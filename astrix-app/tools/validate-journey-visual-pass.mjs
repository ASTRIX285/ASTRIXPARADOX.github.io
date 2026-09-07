import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`,'utf8');
const html=read('astrix-app/pages/journey/index.html');
const css=read('astrix-app/pages/journey/journey-2560-visual.css');
const journey=read('astrix-app/pages/journey/journey.mjs');
const mapModule=read('astrix-app/pages/journey/journey-location-maps.mjs');
const ribbon=read('astrix-app/shared/astrix-destination-ribbon.js');
const ribbonCss=read('astrix-app/shared/astrix-destination-ribbon.css');
const heroCss=read('astrix-app/shared/astrix-hero-cards.css');
const heroModule=read('astrix-app/shared/astrix-hero-cards.mjs');
const guardianAuth=read('astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs');
const mapBackgroundCss=read('astrix-app/shared/astrix-paradox-background.css');
const characterHtml=read('astrix-app/pages/guardian-workspace-v2/index.html');
const buildForgeHtml=read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html');
const missionReportsHtml=read('astrix-app/pages/mission-reports/index.html');
const missionReportsCss=read('astrix-app/pages/mission-reports/mission-reports.css');
const missionReportsData=read('astrix-app/pages/mission-reports/mission-reports-data.mjs');
const vaultHtml=read('astrix-app/pages/vault/index.html');
const forgeLoaderHtml=read('astrix-app/pages/forge-loader/index.html');
const loadoutHtml=read('astrix-app/pages/loadout/index.html');
const globalHeroPages=[
  html,
  characterHtml,
  buildForgeHtml,
  missionReportsHtml,
  vaultHtml,
  forgeLoaderHtml,
  loadoutHtml
];
const mapBackgroundPages=[characterHtml,buildForgeHtml,missionReportsHtml,vaultHtml,forgeLoaderHtml,loadoutHtml];
const cosmodromeMap=readFileSync(`${root}astrix-app/pages/journey/assets/maps/cosmodrome-director-map-4k.webp`);
const cosmodromeDetailMap=readFileSync(`${root}astrix-app/pages/journey/assets/maps/cosmodrome-director-map-6k.webp`);
const placeholderMap=readFileSync(`${root}astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-4k.webp`);
const placeholderDetailMap=readFileSync(`${root}astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp`);

assert.ok(html.includes('class="apx-destination-page journey-page"'),'Journey must own its large-screen visual scope');
assert.ok(html.includes('href="./journey-2560-visual.css?v=20260903-command-header-1"'),'Journey must load the shared command-header cleanup without stale page CSS');
assert.ok(html.includes('src="./journey.mjs?v=20260906-page-data-recovery-1"'),'Journey must load the prepared page payload runtime');
assert.match(journey,/const manifestReady=Promise\.resolve\(guardianManifest\)/,'Journey startup must not download the heavyweight Character and Build equipment manifest');
assert.doesNotMatch(journey,/const manifestReady=guardianManifest\.ready\(\)/,'Journey must keep the full equipment manifest off its critical loading path');
assert.match(heroModule,/IS_JOURNEY_PAGE[\s\S]*?FORGE_HERO_PROFILE_PROMISE/,'Journey hero cards must expose their prepared authenticated page request');
assert.match(heroModule,/function heroProfilePage\(\)[\s\S]*?'journey'[\s\S]*?loadPreparedPagePayload\(session,page/,'Journey hero cards must resolve the prepared Journey route through the shared page client');
assert.match(journey,/waitWithin\(globalThis\.FORGE_HERO_PROFILE_PROMISE,JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS\)/,'Journey must reuse the hero-card profile instead of issuing a second blocking profile request');
assert.doesNotMatch(journey,/import\('\.\.\/guardian-workspace-v2\/guardian-bungie-profile\.mjs/,'Journey must not import the heavyweight Character profile resolver');
assert.doesNotMatch(journey,/guardianManifest\.hydratePayload\(payload\)/,'Journey refresh must not hydrate every vault and equipment definition before showing Triumph data');
assert.match(journey,/profilePresentationNodes\?\.data\?\.nodes&&payload\?\.profile\?\.profileRecords\?\.data/,'Journey must accept verified Triumph components without requiring optional Metrics and Craftables data');
assert.match(journey,/const JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS=12\*1000;[\s\S]*?const JOURNEY_BOOTSTRAP_UI_WAIT_MS=6\*1000;[\s\S]*?const JOURNEY_LOADER_READY_WAIT_MS=6\*1000;/,'Journey bootstrap must bound profile, UI and final-image waits');
assert.match(journey,/function showSignedOut\(\)\{[\s\S]*?ForgeLoader\.authResolved\(\);[\s\S]*?finishJourneyLoader\(signedOut\)/,'Disconnected Journey must reveal its own Bungie connection screen instead of trapping the portal at 12 percent');
assert.match(journey,/const profilePromise=readVerifiedProfile\(session\);[\s\S]*?waitWithin\(profilePromise,JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS\)[\s\S]*?profilePromise\.then\(lateProfile/,'Journey must render after the bounded profile wait and bind verified data when it arrives later');
assert.match(journey,/waitWithin\(heroCardsReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS\)[\s\S]*?waitWithin\(mapReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS\)[\s\S]*?waitWithin\(waitForJourneyAtmosphere\(\),JOURNEY_BOOTSTRAP_UI_WAIT_MS\)/,'Noncritical Hero, map and atmosphere tasks must not hold the Journey loader indefinitely');
assert.doesNotMatch(html,/GUARDIAN JOURNEY · SUMMARY HUB|Your top-line Guardian record|VERIFIED DATA ONLY/,'Journey must not repeat its title in a standalone dashboard banner');
assert.match(heroCss,/header\.forge-command-header:has\(>\[data-forge-hero-cards\]\) \.apx-destination-header-copy\{[^}]*display:grid!important;[^}]*justify-items:center!important/,'Every page purpose line must sit beneath its centred command title');
assert.match(heroCss,/header\.forge-command-header:has\(>\[data-forge-hero-cards\]\) \.apx-destination-header-copy strong\{[^}]*color:var\(--apx-crimson-bright,#b22222\)!important;[^}]*font:800 1\.25rem\/1 bahnschrift-semicondensed/,'Every page name must use the shared compact crimson treatment');
assert.match(heroCss,/header\.forge-command-header:has\(>\[data-forge-hero-cards\]\) \.apx-destination-header-copy small\{[^}]*color:var\(--apx-gold,#c9a84c\)!important/,'Every page purpose line must use the shared gold treatment');
assert.match(heroCss,/\.apx-destination-header-state\{[^}]*position:absolute!important;[^}]*clip-path:inset\(50%\)!important/,'Runtime header state must remain accessible without displaying redundant copy beside the avatar');
assert.doesNotMatch(html,/id="journeyAccountVisual"|id="journeyAccountAvatar"/,'Journey must not duplicate the shared Bungie account visual');
assert.match(guardianAuth,/\.bungie-account-visual\{[\s\S]*?background:conic-gradient\(from 218deg,#063d2e[\s\S]*?#16bd82[\s\S]*?#9dffda/,'The shared Bungie account visual must use a complete green connected-state ring');
assert.match(guardianAuth,/\.bungie-account-visual::before\{[\s\S]*?rgba\(237,198,83,\.76\)[\s\S]*?rgba\(126,10,23,\.82\)/,'The account avatar must retain an Forge crimson-and-gold inner treatment');
assert.doesNotMatch(journey,/balanceJourneyHeader|--journey-command-centre/,'Journey must not retain a page-specific header positioning layer');
assert.match(guardianAuth,/function bungieAvatarUrl\(path\)[\s\S]*?url\.protocol==="https:"[\s\S]*?hostname\.endsWith\("\.bungie\.net"\)/,'The shared account visual must constrain avatar assets to Bungie HTTPS hosts');
assert.match(guardianAuth,/fetch\(new URL\("\/bungie\/account",AUTH_ORIGIN\)[\s\S]*?setAccountVisual\(control,account,session\)/,'Every destination must request Bungie’s own profile picture for the current session');
assert.match(guardianAuth,/if\(session\?\.authenticated\)\{[\s\S]*?control\.button\.hidden=true;[\s\S]*?control\.visual\.hidden=false;/,'Connected destinations must replace the text button with only the account visual');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card\.is-selected\{[\s\S]*?box-shadow:[\s\S]*?rgba\(201,168,76,\.48\)[\s\S]*?opacity:1!important/,'The active Journey Guardian card must use an opaque glow-backed treatment');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card\.is-selected::before\{[\s\S]*?opacity:1!important;[\s\S]*?filter:none!important/,'The active Journey Guardian card must retain fully visible emblem artwork');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card::after\{[\s\S]*?inset:0 0 0 42%!important/,'Journey card shading must stay on a narrow telemetry field instead of covering the emblem');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card__identity\{[\s\S]*?top:50%!important;[\s\S]*?left:50%!important;[\s\S]*?text-align:center!important;[\s\S]*?translate\(-50%,-50%\)/,'Journey class labels must be centred vertically and horizontally');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card__power\{[\s\S]*?top:50%!important;[\s\S]*?right:\.625rem!important;[\s\S]*?translateY\(-50%\)/,'Journey Power must be vertically centred on the right edge');
assert.match(css,/body\.journey-page[\s\S]*?\.guardian-character-card__stats\{[\s\S]*?display:none!important/,'Journey hero cards must move their stat strip into the selected Guardian identity panel');
assert.match(journey,/characterCraftables\?\.data[\s\S]*?craftingRootNodeHash/,'Journey patterns must use the verified character Craftables component');
assert.match(journey,/presentationLeafCategories\(rootHash,nodes,'records'\)[\s\S]*?verifiedCraftablePatternTypes/,'Journey patterns must follow the official Craftables presentation root to its current Record leaves');
assert.match(journey,/profile\?\.metrics\?\.data[\s\S]*?DestinyMetricDefinition[\s\S]*?trackingObjectiveHash/,'Journey Stat Trackers must join verified Metrics to their manifest and objective definitions');
assert.match(journey,/name:`\$\{group\.name\} · ALL`/,'Every official Stat Tracker activity group must expose an ALL summary');
assert.doesNotMatch(journey,/gilded:row\.gilded\|\|row\.complete/,'Journey must not infer gilding from completion');
assert.doesNotMatch(journey,/VIEW MISSION REPORTS|missionReportFilters|missionReportHref/,'Journey records must not link to the separately designed Mission Reports page');
assert.match(html,/Account playtime[\s\S]*?id="journeyTotalPlaytime"/,'Journey must identify total playtime as an account-wide value');
assert.doesNotMatch(html,/Account age|Journey level|XP source unavailable/,'Journey must remove unverified account age, generic Journey level and XP placeholders');
assert.match(journey,/accountMinutes=characters\.map[\s\S]*?reduce\(\(sum,minutes\)=>sum\+minutes,0\)/,'Journey account playtime must sum all verified Bungie character totals');
assert.match(journey,/lifetimeHighestGuardianRank[\s\S]*?currentGuardianRank,profile\.renewedGuardianRank/,'Journey must prefer the lifetime-highest completed Guardian Rank with verified fallbacks');
assert.match(journey,/DestinyGuardianRankConstantsDefinition[\s\S]*?DestinyGuardianRankDefinition[\s\S]*?bungiePresentationIcon/,'Journey must resolve official Guardian Rank names and badge icons from the Bungie manifest');
assert.match(html,/id="journeyGuardianRankSummary"[\s\S]*?VIEW GUARDIAN RANK DETAILS/,'Journey must copy the Guardian Rank detail-card style into its account summary and link to the full details');
assert.match(html,/data-journey-equipped-title[\s\S]*?id="journeyTitleSeal"[\s\S]*?id="journeyEquippedTitleDetailsLink"/,'Journey must copy the title detail-card style into the equipped-title summary');
assert.match(css,/\.journey-page \.journey-left-summaries \.journey-equipped-title-summary,[\s\S]*?grid-template-columns:4\.25rem minmax\(0,1fr\)/,'Equipped and next-title artwork must share the compact seal-card layout');
assert.match(journey,/profileRecords\?\.data\?\.recordSealsRootNodeHash[\s\S]*?titlePresentationCatalog/,'Journey Titles must start from Bungie’s authoritative Triumph Seals root');
assert.match(journey,/const hookedRows=isTitleCollection\?null:journeyRecordHookRows\(payload,view\)/,'The complete title catalogue must not be replaced by a partial supplied row list');
assert.match(journey,/titlePresentationCatalog[\s\S]*?definition\?\.children\?\.presentationNodes[\s\S]*?completionRecordHash/,'Journey must traverse the complete manifest seal hierarchy rather than only returned progress nodes');
assert.match(journey,/profileTitlePresentationCandidates[\s\S]*?profilePresentationNodes\?\.data\?\.nodes[\s\S]*?DestinyPresentationNodeDefinition/,'Journey must map verified returned title nodes before the complete seal traversal finishes');
assert.match(journey,/bindTitleTriumphPanel[\s\S]*?resolvedProfileTitleCollection[\s\S]*?SYNCING COMPLETE CATALOGUE[\s\S]*?resolvedTitleCollection/,'Journey must progressively render verified profile Titles and then reconcile the complete catalogue');
assert.match(journey,/requirementStates[\s\S]*?\(state&4\)!==4[\s\S]*?requirementEntries\.length/,'Missing presentation-node totals must be derived from verified title requirement records');
assert.match(journey,/const earned=view==='titles'&&state!==null&&\(state&64\)===64/,'Journey must use Bungie’s CanEquipTitle record state for earned titles');
assert.match(journey,/recordsStatus\.textContent=view==='titles'\?`\$\{titles\.length\} TITLES · \$\{earned\} EARNED`/,'Titles status must distinguish the complete catalogue from the earned subset');
assert.match(journey,/titleHash=finiteNumber\(character\?\.titleRecordHash\)[\s\S]*?titles\.find\(title=>title\.completionRecordHash===titleHash\)[\s\S]*?renderEquippedTitleSummary\(equipped\)/,'The summary must resolve the selected Guardian’s equipped title from the complete catalogue');
assert.match(journey,/journeyEquippedTitleDetailsLink[\s\S]*?showGuardianRecordPanel\('titles'\)[\s\S]*?showTitleDetail\(equippedTitleSummary,'titles'\)/,'The equipped title summary must open its full verified title details');
assert.match(html,/data-journey-next-title[\s\S]*?id="journeyTitleProgress"[\s\S]*?id="journeyNextTitleDetailsLink"/,'Journey must render next-title progress in the same linked detail-card pattern');
assert.match(journey,/renderNextTitleSummary\(next\|\|null\)[\s\S]*?journeyNextTitleDetailsLink[\s\S]*?showTitleDetail\(nextTitleSummary,'titles'\)/,'The closest incomplete title must link to its full requirement details');
assert.match(html,/id="journeyGuardianUsage"[\s\S]*?id="journeySeasonRank"/,'Journey must replace generic navigation with Guardian class usage and Current Season Rank blocks');
assert.doesNotMatch(html,/journey-section-nav|journey-time-filter|TIME FILTER|MILESTONES &amp; ACHIEVEMENTS/,'Journey must not retain generic navigation or non-functional time filters');
assert.match(journey,/CLASS_USAGE_COLOURS[\s\S]*?item\.percent=item\.minutes\/total\*100[\s\S]*?journey-usage-chart[\s\S]*?formatPlaytime\(item\.minutes\)/,'Guardian class usage must show all three verified playtime percentages and exact durations');
assert.match(journey,/seasonRankProgress\(payload[\s\S]*?XP TO RANK/,'Season Rank must use the tested profile/character progression join');
assert.match(journey,/journey-triumph-total[\s\S]*?journey-triumph-breakdown[\s\S]*?ACTIVE[\s\S]*?LEGACY/,'Triumph statistics must emphasise the total and split Active and Legacy scores');
assert.match(html,/id="journeyGuardianStats"[\s\S]*?aria-label="Selected Guardian statistics"/,'The identity panel must own the selected Guardian stat strip');
assert.doesNotMatch(html,/VERIFIED GUARDIAN|id="journeyVerifiedGuardian"/,'Journey must remove the redundant visible verified-Guardian label');
assert.match(journey,/const STAT_ORDER=\[2996146975,392767087,1943323491,1735777505,144602215,4244567218\];[\s\S]*?function bindGuardianStats[\s\S]*?payload\?\.statDefinitions[\s\S]*?character\?\.stats/,'The identity stat strip must bind all six official Bungie stats for the selected Guardian');
assert.match(css,/\.journey-page \.journey-identity-stats\{[\s\S]*?left:33\.333%;[\s\S]*?grid-template-columns:repeat\(6,minmax\(0,1fr\)\)[\s\S]*?overflow:hidden/,'Selected Guardian stats must remain inside the lower identity-card boundary');
assert.match(html,/journey-vault-card[\s\S]*?>Vault inventory<[\s\S]*?id="journeyVault"/,'Journey must present Vault inventory as a dedicated data card');
assert.match(journey,/function bindVault[\s\S]*?ARMOUR_ITEM_TYPE[\s\S]*?journey-vault-total[\s\S]*?>ALL<[\s\S]*?journey-vault-breakdown[\s\S]*?>ARMOUR<[\s\S]*?WEAPONS &amp; EQUIPMENT/,'Vault inventory must split its verified total into Armour and Weapons & Equipment');
assert.match(journey,/if\(postmasterMax>=18\)[\s\S]*?POSTMASTER NEAR CAPACITY/,'Postmaster must appear only as a conditional near-capacity warning');
assert.match(css,/\.journey-page \.journey-vault-summary\{[\s\S]*?linear-gradient[\s\S]*?\.journey-page \.journey-vault-breakdown\{[\s\S]*?grid-template-columns/,'Vault inventory must use a distinctive crimson-and-gold split-card treatment');
assert.match(journey,/function createRankBadge[\s\S]*?journey-rank-badge[\s\S]*?renderGuardianRankSummary[\s\S]*?createRankBadge\(rank/,'Guardian Rank summaries must use the custom crimson-and-gold number medallion');
assert.match(css,/\.journey-page \.journey-rank-badge\{[\s\S]*?background:radial-gradient[\s\S]*?\.journey-page \.journey-rank-badge strong\{[\s\S]*?color:#b51222/,'Rank medallions must use the requested gold/crimson background and crimson number');
assert.match(journey,/if\(!lateProfile\?\.profile\?\.characters\?\.data\)\{void refreshJourneyProfile\(\)\.catch/,'Journey must retry its lightweight profile feed when the deferred initial profile returns empty');
assert.ok(html.includes('src="../../shared/astrix-hero-cards.mjs?v=20260906-page-data-recovery-1"'),'Journey must load the shared prepared-profile hero-card renderer');
assert.ok(html.indexOf('journey-2560-visual.css')<html.indexOf('astrix-desktop-density.css'),'Shared desktop density must remain the final stylesheet');
assert.ok(html.includes('data-forge-destination-ribbon data-active-destination="journey"'),'Journey must retain the shared six-page ribbon mount');
assert.doesNotMatch(html,/journeyDestinations|apx-destination-links|apx-destination-link/,'Journey must not duplicate the shared ribbon at the bottom of the page');

for(const id of [
  'journeyAuthStatus',
  'journeyResolving',
  'journeySignedOut',
  'journeyDashboard',
  'journeyConnectAction',
  'guardianCharacterCards',
  'journeyLocationSelector',
  'journeyLocationDetail'
])assert.ok(html.includes(`id="${id}"`),`Journey data mount ${id} must remain available`);

assert.equal((html.match(/class="apx-scaffold-card(?:\s[^"]*)?"/g)??[]).length,10,'Journey must retain all ten Guardian data regions');
assert.doesNotMatch(html,/id="journeyOverview"|MILESTONE RECORD|id="journeyMilestoneTimeline"/,'Journey must not duplicate the Mission Reports milestone record');
assert.doesNotMatch(journey,/new URL\('\/bungie\/activity-history',AUTH_ORIGIN\)/,'Journey must not issue a follow up activity history request');
assert.match(journey,/function fetchJourneyActivityEvidence[\s\S]*?cached\?\.status==='ok'[\s\S]*?Date\.now\(\)-cached\.fetchedAt<PREPARED_PAGE_REFRESH_MS[\s\S]*?preparedAccountData\?\.activityHistoryByCharacter[\s\S]*?normaliseActivityHistory\(prepared\)[\s\S]*?buildMissionReportView\(activities\)/,'Journey must normalize the prepared activity evidence once and cache its shared view model');
assert.match(journey,/function renderJourneyActivityEvidence[\s\S]*?renderRecentActivity\(activities\)[\s\S]*?renderCurrentForm\(view\)[\s\S]*?renderEvidenceConfidence\(view\?\.confidence\|\|null\)[\s\S]*?renderMissionHighlights\(activities,view\)[\s\S]*?renderMostUsed\(activities\)/,'Recent Activity, Current Form, confidence, Mission highlights and build usage must share one evidence model');
assert.match(journey,/await bindJourneyActivityEvidence\(journeySession,\{force:true\}\)/,'The silent ten-minute refresh must also update activity-backed Journey summaries');
assert.match(html,/id="journeyConfidenceDonutValue"[\s\S]*?id="journeyConfidenceHighPercent"[\s\S]*?id="journeyConfidenceHigh"[\s\S]*?id="journeyConfidenceMedium"[\s\S]*?id="journeyConfidenceLow"/,'Evidence Confidence must expose live activity-backed display mounts');
assert.match(journey,/function renderEvidenceConfidence[\s\S]*?confidence\.highPercent[\s\S]*?confidence\.mediumPercent[\s\S]*?confidence\.lowPercent/,'Evidence Confidence must render only calculated live-source coverage');
assert.match(journey,/const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';[\s\S]*?const BUILD_SNAPSHOT_KEY='astrix:guardian-build-snapshot:v1';[\s\S]*?const LAST_LOADOUT_KEY='astrix:paradox-last-bungie-loadout:v1';/,'Journey must recognize every existing Build Forge handoff source');
assert.match(journey,/validateHandoffEnvelope[\s\S]*?function readJourneyBuildState[\s\S]*?expectedCharacterId[\s\S]*?expectedMembershipId[\s\S]*?expectedMembershipType[\s\S]*?allowLegacy:false/,'Build Forge summaries must reject stale, legacy or cross-account build state');
assert.match(journey,/function captureEvidenceRows[\s\S]*?readCapture\(\)[\s\S]*?readCaptureArchive\(\)[\s\S]*?const completed=[\s\S]*?capture\?\.status!=='collected'/,'Most-used build tracking must count only completed verified Build Test evidence');
assert.match(journey,/function renderMostUsed[\s\S]*?activity\?\.buildSnapshot[\s\S]*?winner\.count\/evidence\.length\*100/,'Most-used build tracking must combine future Mission Report snapshots with verified Build Test samples');
assert.match(html,/id="journeyMostUsed"[\s\S]*?No verified Build Test or Mission Report loadout evidence[\s\S]*?id="journeyBuildSummary"[\s\S]*?No verified Build Forge state[\s\S]*?id="journeyMissionHighlights"[\s\S]*?No verified activity history/,'Unreturned cross-page evidence must retain explicit honest empty states');
assert.match(css,/\.journey-column-summaries \.journey-evidence-rows[\s\S]*?grid-template-columns:minmax\(0,\.8fr\) minmax\(0,1\.2fr\)/,'Connected Journey evidence must remain readable inside the existing compact cards');
assert.equal((ribbon.match(/Object\.freeze\(\{key:/g)??[]).length,7,'Shared Journey ribbon must retain all seven destination routes');
assert.ok(ribbon.indexOf("key:'forge-loader'")<ribbon.indexOf("key:'build-forge'"),'Forge Loader must appear before Build Forge');
for(const page of globalHeroPages){
  assert.equal((page.match(/data-forge-hero-cards/g)??[]).length,1,'Every destination page must contain exactly one shared hero-card mount');
  assert.ok(page.includes('astrix-hero-cards.css?v=20260904-mobile-crosscheck-1'),'Every destination page must load the current centred, mobile-contained command-header presentation');
  assert.equal((page.match(/forge-command-header/g)??[]).length,1,'Every destination page must contain exactly one shared command header');
}
assert.equal((globalHeroPages.filter(page=>page.includes('astrix-hero-cards.mjs?v=20260906-page-data-recovery-1'))).length,4,'Journey, Vault, Forge Loader and Loadout must load the recovered Guardian renderer');
assert.ok(loadoutHtml.includes('astrix-hero-cards.mjs?v=20260906-page-data-recovery-1'),'Loadout must retain its current prepared profile renderer');
assert.ok(forgeLoaderHtml.includes('astrix-hero-cards.mjs?v=20260906-page-data-recovery-1'),'Forge Loader must load the persistent refresh Guardian renderer');
assert.ok(characterHtml.includes('guardian-workspace-v2.mjs?v=20260906-page-data-recovery-1'),'Character must load the prepared page payload module graph');
assert.ok(buildForgeHtml.includes('paradox-build-space.mjs?v=20260906-live-equip-1'),'Build Forge must load the repaired Apply and review layout module graph');
assert.ok(missionReportsHtml.includes('mission-reports.mjs?v=20260906-page-payload-1'),'Mission Reports must load the prepared page payload module graph');
assert.ok(missionReportsHtml.includes('href="./mission-reports.css?v=20260831-fixed-topbar"'),'Mission Reports must load the cache-busted fixed topbar correction');
assert.match(missionReportsCss,/\.mission-topbar\.topbar\{[\s\S]*?position:fixed!important;[\s\S]*?top:0!important;[\s\S]*?z-index:90!important;/,'Mission Reports must not override the global Guardian ribbon with document-flow positioning');
assert.doesNotMatch(missionReportsCss,/\.mission-topbar\.topbar\{[\s\S]*?position:relative!important;[\s\S]*?top:auto!important;/,'Mission Reports must not reattach the Guardian ribbon to its report columns');
assert.match(heroCss,/position:fixed!important;[\s\S]*?top:0!important;[\s\S]*?left:0!important;[\s\S]*?right:0!important;/,'Every hero-card topbar must remain fixed to the viewport top');
assert.match(heroCss,/grid-template-columns:minmax\(0,1fr\) 910px minmax\(0,1fr\)!important;/,'The command header must keep its three-card Guardian rail centred in the page');
assert.match(heroCss,/\.apx-destination-header-copy\{position:absolute!important;top:50%!important;left:calc\(25% - 5rem\)!important;[^}]*transform:translate\(-50%,-50%\)!important/,'The compact page identity must sit midway between the brand and the first Guardian card');
assert.match(heroCss,/grid-template-columns:repeat\(3,300px\)!important;/,'The desktop hero track must retain three equal Character-format cards');
assert.match(heroCss,/header:has\(>\[data-forge-hero-cards\]\) \.guardian-character-card\.is-selected\{[^}]*border-color:rgba\(201,168,76,\.92\);[^}]*box-shadow:[^}]*rgba\(201,168,76,\.5\)[^}]*opacity:1\}/,'Every destination must use the same fully opaque gold-and-crimson selected Guardian glow');
assert.match(heroCss,/header:has\(>\[data-forge-hero-cards\]\) \.guardian-character-card\.is-selected::before\{opacity:1;filter:none\}/,'Every selected Guardian card must retain fully visible verified emblem artwork');
assert.match(heroCss,/body:has\(header>\[data-forge-hero-cards\]\)\{zoom:1\}/,'Hero-card destination pages must remain at native 100 percent scale');
assert.match(heroCss,/body:has\(header>\[data-forge-hero-cards\]\)>\[data-forge-destination-ribbon\]\{[\s\S]*?position:fixed!important;[\s\S]*?top:120px!important;[\s\S]*?left:0!important;[\s\S]*?right:0!important;/,'The shared destination buttons must remain fixed beneath the hero topbar');
assert.match(heroCss,/header:has\(>\[data-forge-hero-cards\]\)\{[\s\S]*?background:#060606!important;/,'Every hero destination header must form an opaque scrolling boundary');
assert.match(heroCss,/body:has\(header>\[data-forge-hero-cards\]\)\{[\s\S]*?padding-top:180px!important;/,'The fixed global stack must preserve document space below the viewport anchors');
assert.match(heroCss,/\[data-forge-destination-ribbon\] \.apx-destination-ribbon\{[\s\S]*?background:transparent!important;/,'The second ribbon container must remain transparent');
assert.match(heroCss,/\[data-forge-destination-ribbon\] \.apx-destination-ribbon a\{[\s\S]*?background:rgba\(6,6,6,\.8\);/,'Only the destination buttons may retain the dark background');
assert.match(heroCss,/\[data-forge-destination-ribbon\]::after\{[\s\S]*?width:100vw;[\s\S]*?background:transparent;[\s\S]*?backdrop-filter:blur\(8px\) brightness\(\.58\);[\s\S]*?mask-image:linear-gradient\(to bottom,#000,transparent\);/,'The transparent second ribbon edge must fade scrolling content across the viewport');
assert.doesNotMatch(heroCss,/\[data-forge-destination-ribbon\]::(?:before|after)\{[\s\S]*?background:linear-gradient\(180deg,#060606/,'The second ribbon must not restore a full-width black strip');
assert.match(ribbonCss,/@media\(min-width:981px\)\{[\s\S]*?width:min\(1180px,calc\(100% - 64px\)\);[\s\S]*?grid/s,'All pages must use the shared centred desktop destination-button presentation');
assert.match(heroModule,/const CLASS_ORDER=\{hunter:0,warlock:1,titan:2\}/,'Warlock must remain the middle card in the shared roster');
for(const [page,title,purpose] of [
  [html,'JOURNEY','GUARDIAN COMMAND CONSOLE'],
  [characterHtml,'CHARACTER','INSPECT YOUR LIVE GUARDIAN LOADOUT'],
  [forgeLoaderHtml,'FORGE LOADER','SELECT AND MAXIMISE VERIFIED ARMOUR'],
  [buildForgeHtml,'BUILD FORGE','OPTIMISE, ANALYSE AND TEST YOUR GUARDIAN BUILD'],
  [missionReportsHtml,'MISSION REPORTS','REVIEW VERIFIED GUARDIAN ACTIVITY'],
  [vaultHtml,'VAULT','BROWSE VERIFIED OWNED GEAR'],
  [loadoutHtml,'LOADOUT','REVIEW SAVED GUARDIAN BUILDS']
])assert.match(page,new RegExp(`<strong>${title}<\\/strong><small>${purpose}<\\/small>`),`${title} must expose its page-specific name and purpose inside the shared command header`);
assert.doesNotMatch(forgeLoaderHtml,/<div class="apx-page-heading">[\s\S]*?<h1>Forge Loader<\/h1>/,'Forge Loader must not repeat its page identity in an oversized content hero');
assert.match(forgeLoaderHtml,/<span class="apx-visually-hidden" id="forgeConnectionState"/,'Forge Loader must preserve its connection-state hook after removing the oversized hero');
assert.doesNotMatch(vaultHtml,/<div class="apx-page-heading">[\s\S]*?<h1>Vault<\/h1>/,'Vault must not repeat its page identity below the shared command header');
assert.match(vaultHtml,/<span class="apx-visually-hidden" id="vaultConnectionState"/,'Vault must preserve its connection-state hook after removing the duplicate heading');
assert.doesNotMatch(loadoutHtml,/<div class="apx-page-heading">[\s\S]*?<h1>Loadout<\/h1>/,'Loadout must not repeat its page identity below the shared command header');
assert.doesNotMatch(characterHtml,/class="top-icons"/,'Character must leave only the Bungie account control in the header action position');
assert.doesNotMatch(missionReportsHtml,/mission-utility-actions/,'Mission Reports must leave only the Bungie account control in the header action position');
assert.match(heroModule,/from ['"][^'"]*prepared-page-client\.mjs[^'"]*['"][\s\S]*?loadPreparedPagePayload\(session,page/,'Shared hero cards must use the confidential prepared page endpoint through the shared client');
assert.match(heroModule,/function mostRecentCharacterId\(characters\)[\s\S]*?dateLastPlayed[\s\S]*?const selectedId=mostRecentCharacterId\(characters\)/,'Shared hero cards must automatically select Bungie’s newest dateLastPlayed Guardian');
assert.doesNotMatch(heroModule,/sessionStorage\.getItem\(SELECTED_CHARACTER_KEY\)/,'A prior tab choice must not replace the newest Bungie Guardian during fresh hero-card startup');
assert.match(missionReportsData,/preferredCharacterId\|\|mostRecentCharacterId\(rawCharacters\)/,'Mission Reports must use latest-played by default while preserving explicit in-page selection');
assert.match(heroCss,/var\(--character-emblem\) 28px center\/cover no-repeat/,'Shared hero cards must centre the emblem focal icon horizontally and vertically');
assert.match(heroCss,/\.guardian-character-card__stat\{[^}]*min-height:32px[\s\S]*?\.guardian-character-card__stat \.guardian-stat-icon\{[^}]*width:var\(--apx-icon-stat,1\.25rem\);height:var\(--apx-icon-stat,1\.25rem\);flex:0 0 var\(--apx-icon-stat,1\.25rem\)[\s\S]*?\.guardian-character-card__stat b\{[^}]*font:800 13px/,'Shared Character-format stat cells, icons and values must use the shared enlarged contained treatment');
assert.doesNotMatch(heroModule,/from ['"][^'"]*(?:guardian-bungie-profile|guardian-manifest-service|paradox-build)[^'"]*['"]|CLIENT_SECRET|API_KEY/,'Shared hero cards must not import or alter Character, manifest, Build Forge or secret internals');
for(const page of mapBackgroundPages){
  assert.ok(page.includes('astrix-paradox-background.css?v=20260830-global-map-background'),'Each approved page must load the shared ASTRIX PARADOX map background');
}
for(const page of [missionReportsHtml,vaultHtml,forgeLoaderHtml,loadoutHtml]){
  assert.ok(page.includes('forge-paradox-map-background'),'Mission Reports, Vault, Forge Loader and Loadout must mount the shared map background layer');
}
assert.doesNotMatch(html,/astrix-paradox-background|forge-paradox-map-background/,'Journey must retain its existing destination background');
assert.match(mapBackgroundCss,/astrix-paradox-map-placeholder-4k\.webp/,'Shared page backgrounds must use the approved 4K ASTRIX PARADOX map');
assert.match(mapBackgroundCss,/astrix-paradox-map-placeholder-6k\.webp/,'High-density page backgrounds must use the approved 6K ASTRIX PARADOX map');
assert.equal((mapBackgroundCss.match(/filter:blur\(2px\)/g)??[]).length,2,'Both shared background layers must use only a slight 2px blur');
assert.doesNotMatch(mapBackgroundCss,/D2_JB|DESTINATION MAP PENDING/,'Shared page backgrounds must not use the old artwork or removed subtitle');
assert.ok(journey.includes('initLocationSelector({'),'Journey must retain the location-selector wiring');
assert.ok(journey.includes("mount:document.getElementById('journeyLocationSelector')"),'Journey selector mount must remain unchanged');
assert.ok(journey.includes("detail:document.getElementById('journeyLocationDetail')"),'Journey detail mount must remain unchanged');
assert.ok(journey.includes('const session=await getBungieSession();'),'Journey authentication must remain unchanged');
assert.ok(journey.includes("from './journey-location-maps.mjs?v=20260905-journey-repair-1'"),'Journey must load its current versioned page-owned destination data registry');
assert.ok(journey.includes('initJourneyLocationMaps('),'Journey must initialise its page-owned interactive map layer');
assert.ok(mapModule.includes("src:'./assets/maps/astrix-paradox-map-placeholder-4k.webp'"),'Journey must mount the shared 4K ASTRIX PARADOX placeholder');
assert.ok(mapModule.includes("detailSrc:'./assets/maps/astrix-paradox-map-placeholder-6k.webp'"),'Journey must provide the shared 6K ASTRIX PARADOX placeholder for zoom');
for(const key of ['pale-heart','dreaming-city','neomuna','europa','throne-world','nessus','edz','moon']){
  assert.ok(mapModule.includes(`'${key}':JOURNEY_PLACEHOLDER_MAP`),`Journey must retain the ${key} placeholder registration`);
}
assert.equal((mapModule.match(/:JOURNEY_PLACEHOLDER_MAP/g)??[]).length,8,'Journey must use one shared placeholder for exactly eight pending destination maps');
assert.ok(mapModule.includes("src:'./assets/maps/cosmodrome-director-map-4k.webp'"),'Journey map registry must mount the page-owned Cosmodrome map asset');
assert.ok(mapModule.includes("detailSrc:'./assets/maps/cosmodrome-director-map-6k.webp'"),'Journey map registry must provide its high-resolution zoom asset');
assert.ok(mapModule.includes("if(state.scale>1)requestDetailSource();"),'Journey map must request its high-resolution asset only after zoom begins');
assert.ok(mapModule.includes("addEventListener('pointermove'"),'Journey map must support pointer panning');
assert.ok(mapModule.includes("addEventListener('wheel'"),'Journey map must support wheel zooming');
for(const marker of [
  ['grasp-of-avarice','Grasp of Avarice'],
  ['skywatch-landing-zone','Skywatch'],
  ['the-disgraced','The Disgraced'],
  ['the-devils-lair',"The Devils' Lair"],
  ['fallen-saber','Fallen S.A.B.E.R.'],
  ['veles-labyrinth','Veles Labyrinth'],
  ['shaw-han','Shaw Han'],
  ['the-steppes-landing-zone','The Steppes'],
  ['exodus-garden-2a','Exodus Garden 2A']
]){
  assert.ok(mapModule.includes(`key:'${marker[0]}'`),`Journey map must retain the ${marker[1]} marker key`);
  assert.ok(mapModule.includes(`name:${JSON.stringify(marker[1])}`)||mapModule.includes(`name:'${marker[1]}'`),`Journey map must retain the ${marker[1]} label`);
}
assert.equal((mapModule.match(/Object\.freeze\(\{key:[^}]*type:/g)??[]).length,9,'Cosmodrome pilot must contain exactly nine permanent static markers');
assert.equal((mapModule.match(/type:'strike'/g)??[]).length,3,'Cosmodrome pilot must contain the three verified strikes');
assert.equal((mapModule.match(/type:'lost-sector'/g)??[]).length,2,'Cosmodrome pilot must contain the two verified Lost Sectors');
assert.equal((mapModule.match(/type:'landing'/g)??[]).length,2,'Cosmodrome pilot must contain the two verified landing zones');
assert.equal((mapModule.match(/type:'dungeon'/g)??[]).length,1,'Cosmodrome pilot must contain Grasp of Avarice');
assert.equal((mapModule.match(/type:'vendor'/g)??[]).length,1,'Cosmodrome pilot must contain Shaw Han');
assert.doesNotMatch(mapModule,/type:'raid'|fetch\(|setInterval\(|getBungieSession|Date\(/,'Cosmodrome pilot must not invent a raid or add live activity mechanics');
assert.ok(mapModule.includes("stage.style.transform=`translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`"),'Map image and static markers must pan and zoom as one stage');
assert.ok(mapModule.includes("stage.style.setProperty('--journey-marker-scale',String(1/state.scale))"),'Static marker labels must retain a readable screen size while zooming');
assert.ok(mapModule.includes("const label=globalThis.ForgeDestinations?.labelOf(key)||key;"),'Journey map labels must come from the selected destination registry');
assert.ok(mapModule.includes("viewport.append(stage,createRegionChestOverlay(key,label))"),'Regional chest progress must remain outside the moving map stage and receive the selected destination label');
assert.ok(mapModule.includes("const REGION_CHEST_EVENT='forge:journey-region-chests'"),'Regional chest progress must accept a verified data event');
assert.equal((mapModule.match(/<strong data-region-chest-(?:discovered|missing|total)>--<\/strong>/g)??[]).length,3,'Regional chest progress must keep three honest pending placeholders before live records arrive');
assert.equal((mapModule.match(/Object\.freeze\(\{key:'(?:triumphs|records|quests|endgame)',label:/g)??[]).length,4,'Every destination must expose the four generic data buttons');
assert.ok(mapModule.includes("back.textContent='Back to Map'"),'Destination data must provide Back to Map navigation');
assert.ok(mapModule.includes("heading.textContent=`${label.toLocaleUpperCase('en-GB')} ${section.label}`"),'Destination data headings must retain the selected destination context');
assert.ok(mapModule.includes('mapFigure.hidden=true')&&mapModule.includes('mapFigure.hidden=false'),'Destination data selection must swap the panel without resetting the map state');
assert.ok(mapModule.includes('lostSectorTotal:2'),'Cosmodrome must retain its two verified Lost Sector locations');
assert.equal((mapModule.match(/lostSectorTotal:/g)??[]).length,1,'Pending destinations must not invent Lost Sector totals');
assert.doesNotMatch(mapModule,/PERMANENT COSMODROME TRIUMPHS|ACTIVE COSMODROME QUEST OBJECTIVES|Additional permanent Cosmodrome progress indicators/,'Shared progress markup must not hard-code Cosmodrome');
assert.doesNotMatch(mapModule,/total\s*:\s*15|discovered\s*:\s*\d+/,'Regional chest progress must not hard-code unverified counts');
assert.equal(cosmodromeMap.subarray(0,4).toString('ascii'),'RIFF','Cosmodrome map must be a valid WebP asset');
assert.equal(cosmodromeMap.subarray(8,12).toString('ascii'),'WEBP','Cosmodrome map must be a valid WebP asset');
assert.equal(cosmodromeMap.subarray(12,16).toString('ascii'),'VP8 ','Cosmodrome map must use the validated WebP encoding');
assert.equal(cosmodromeMap.readUInt16LE(26)&0x3fff,3840,'Cosmodrome map must be exactly 3840px wide');
assert.equal(cosmodromeMap.readUInt16LE(28)&0x3fff,2160,'Cosmodrome map must be exactly 2160px high');
assert.equal(cosmodromeDetailMap.subarray(0,4).toString('ascii'),'RIFF','Cosmodrome zoom map must be a valid WebP asset');
assert.equal(cosmodromeDetailMap.subarray(8,12).toString('ascii'),'WEBP','Cosmodrome zoom map must be a valid WebP asset');
assert.equal(cosmodromeDetailMap.subarray(12,16).toString('ascii'),'VP8 ','Cosmodrome zoom map must use the validated WebP encoding');
assert.equal(cosmodromeDetailMap.readUInt16LE(26)&0x3fff,5760,'Cosmodrome zoom map must be exactly 5760px wide');
assert.equal(cosmodromeDetailMap.readUInt16LE(28)&0x3fff,3240,'Cosmodrome zoom map must be exactly 3240px high');
assert.equal(placeholderMap.subarray(0,4).toString('ascii'),'RIFF','Journey placeholder map must be a valid WebP asset');
assert.equal(placeholderMap.subarray(8,12).toString('ascii'),'WEBP','Journey placeholder map must be a valid WebP asset');
assert.equal(placeholderMap.readUInt16LE(26)&0x3fff,3840,'Journey placeholder map must be exactly 3840px wide');
assert.equal(placeholderMap.readUInt16LE(28)&0x3fff,2160,'Journey placeholder map must be exactly 2160px high');
assert.equal(placeholderDetailMap.subarray(0,4).toString('ascii'),'RIFF','Journey placeholder zoom map must be a valid WebP asset');
assert.equal(placeholderDetailMap.subarray(8,12).toString('ascii'),'WEBP','Journey placeholder zoom map must be a valid WebP asset');
assert.equal(placeholderDetailMap.readUInt16LE(26)&0x3fff,5760,'Journey placeholder zoom map must be exactly 5760px wide');
assert.equal(placeholderDetailMap.readUInt16LE(28)&0x3fff,3240,'Journey placeholder zoom map must be exactly 3240px high');

assert.match(css,/@media \(min-width:1500px\)\{[\s\S]*?body\.journey-page\.apx-destination-page\{[\s\S]*?zoom:1!important;/,'Journey must force native scale on large monitors');
assert.match(css,/body\.journey-page\.apx-destination-page \.apx-atmo\{[\s\S]*?width:100vw;[\s\S]*?max-width:none;/,'Journey atmosphere must cover the full viewport');
assert.match(css,/\.journey-page \.apx-atmo-base\{[\s\S]*?-webkit-mask-image:linear-gradient\(to bottom,#000 0%,#000 46%,rgba\(0,0,0,\.72\) 65%,rgba\(0,0,0,\.22\) 86%,transparent 100%\);[\s\S]*?mask-image:linear-gradient\(to bottom,#000 0%,#000 46%,rgba\(0,0,0,\.72\) 65%,rgba\(0,0,0,\.22\) 86%,transparent 100%\);/,'Journey deep-space base must fade toward the bottom without altering location art');
assert.match(css,/\.journey-page \.apx-atmo-photo\{[\s\S]*?filter:blur\(5px\) brightness\(\.67\) saturate\(1\.08\);/,'Journey location art must remain softly recognisable on large screens');
assert.match(css,/body\.journey-page\.apx-destination-page \.apx-page-shell\{[\s\S]*?width:calc\(100% - 2rem\);[\s\S]*?max-width:none;/,'Journey columns must expand toward the viewport margins');
assert.match(css,/\.journey-console\{[\s\S]*?grid-template-columns:var\(--apx-workspace-columns,minmax\(360px,20%\) minmax\(720px,1fr\) minmax\(420px,24%\)\);/,'Journey must consume the shared proportional workspace columns');
assert.match(css,/@media\(max-width:1760px\)\{[\s\S]*?\.journey-console\{grid-template-columns:var\(--apx-workspace-compact-columns,392px minmax\(0,1fr\)\)\}/,'Journey must consume the shared two-column fallback before its mobile stack');
assert.match(css,/@media\(max-width:1100px\)\{[\s\S]*?\.journey-console\{grid-template-columns:1fr\}/,'Journey must reflow to one column without shrinking its text');
assert.match(css,/\.journey-page \.apx-card-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/,'Journey future data cards must form complete large-screen rows');
assert.match(css,/\.journey-page \.apx-loc-layout\{[\s\S]*?grid-template-columns:220px minmax\(0,1fr\);/,'Journey destination selector must remain a compact left rail beside the map');
assert.match(css,/\.journey-page \.apx-loc-list\{[\s\S]*?display:flex;[\s\S]*?flex-direction:column;/,'Journey destinations must remain a vertical left-side list');
assert.match(css,/\.journey-page \.apx-loc-meta\{[\s\S]*?display:none/,'Journey destination buttons must not repeat awaiting-data labels');
assert.match(css,/\.journey-location-centre \.apx-loc-select-head\{[\s\S]*?align-items:flex-start;[\s\S]*?flex-direction:column;[\s\S]*?text-align:left;/,'Select to focus must remain a subtitle beneath Destinations');
const fixedReadableFontSize=rule=>{
  const match=rule.match(/font-size:\s*(\d*\.?\d+)(rem|px)\s*(?:;|})/i);
  return Boolean(match)&&(match[2].toLowerCase()==='rem'||Number(match[1])>=15);
};
const journeyRootFontRule=css.match(/html\{[^}]*\}/)?.[0]??'';
const journeyBaseFontRule=css.match(/\.journey-page\{[^}]*\}/)?.[0]??'';
const journeyEmptyStateFontRule=css.match(/\.journey-page \.apx-empty-state\{[^}]*\}/)?.[0]??'';
assert.ok(fixedReadableFontSize(journeyRootFontRule),'Journey root font must use a fixed rem value or at least 15px');
assert.ok(fixedReadableFontSize(journeyBaseFontRule),'Journey base font must use a fixed rem value or at least 15px');
assert.ok(fixedReadableFontSize(journeyEmptyStateFontRule),'Journey empty states must use a fixed readable rem or pixel size');
assert.doesNotMatch(`${journeyRootFontRule}\n${journeyBaseFontRule}`,/\d*\.?\d+vw\b/i,'Journey root and base font rules must not use viewport-width sizing');
assert.match(css,/@media \(min-width:981px\)\{[\s\S]*?\.journey-page \[data-forge-destination-ribbon\]\{[\s\S]*?width:min\(1180px,calc\(100% - 64px\)\);[\s\S]*?background:transparent;/,'Journey ribbon must be compact, centred and transparent beneath the main header');
assert.match(css,/\.journey-page \.apx-destination-ribbon a:hover,[\s\S]*?border-color:rgba\(201,168,76,\.68\);[\s\S]*?box-shadow:/,'Journey ribbon must provide the approved block hover state');
assert.match(css,/\.journey-map-stage\{[\s\S]*?position:absolute;[\s\S]*?transform-origin:center;/,'Map image and markers must share one anchored stage');
assert.match(css,/\.journey-map-marker\{[\s\S]*?transform:translate\(-50%,-50%\) scale\(var\(--journey-marker-scale\)\);/,'Static activity markers must remain anchored and legible while zooming');
assert.match(css,/\.journey-region-chests\{[\s\S]*?position:absolute;[\s\S]*?top:18px;[\s\S]*?left:18px;[\s\S]*?width:35%;[\s\S]*?background:rgba\(4,6,7,\.05\);[\s\S]*?pointer-events:auto;/,'Regional chest progress must retain its approved interactive top-left overlay with 95 percent transparency');
assert.doesNotMatch(css,/body\.journey-page[^}]*transform\s*:\s*scale\(|\.apx-page-shell[^}]*position\s*:\s*absolute/,'Journey page layout must remain in document flow without transform scaling');

console.log('JOURNEY_2560_NATIVE_SCALE=PASS');
console.log('JOURNEY_FULL_VIEWPORT_ATMOSPHERE=PASS');
console.log('JOURNEY_DEEP_SPACE_BOTTOM_FADE=PASS');
console.log('JOURNEY_LOCATION_ART_RECOGNISABLE=PASS');
console.log('JOURNEY_BALANCED_DATA_REGIONS=PASS');
console.log('JOURNEY_COMPACT_RIBBON=PASS');
console.log('JOURNEY_DUPLICATE_DESTINATIONS_REMOVED=PASS');
console.log('JOURNEY_DATA_MECHANICS_UNCHANGED=PASS');
console.log('JOURNEY_COSMODROME_MAP_4K=PASS');
console.log('JOURNEY_COSMODROME_MAP_CRISP_ZOOM=PASS');
console.log('JOURNEY_COSMODROME_MAP_INTERACTIVE=PASS');
console.log('JOURNEY_COSMODROME_STATIC_ACTIVITY_MARKERS=PASS');
console.log('JOURNEY_REGION_CHEST_OVERLAY=PASS');
console.log('JOURNEY_REGION_CHEST_DATA_HONEST=PASS');
console.log('JOURNEY_COSMODROME_PROGRESS_INDICATORS=PASS');
console.log('JOURNEY_ALL_DESTINATION_PROGRESS_INDICATORS=PASS');
console.log('JOURNEY_PARAMETERISED_DESTINATION_LABELS=PASS');
console.log('JOURNEY_PLACEHOLDER_MAP_4K=PASS');
console.log('JOURNEY_PLACEHOLDER_MAP_CRISP_ZOOM=PASS');
console.log('JOURNEY_COSMODROME_LIVE_ACTIVITY_LAYER_DEFERRED=PASS');
console.log('GLOBAL_HERO_CARDS=PASS');
console.log('GLOBAL_HERO_WARLOCK_CENTRED=PASS');
console.log('GLOBAL_HERO_TOPBAR_ANCHORED=PASS');
console.log('GLOBAL_TOP_STACK_SCROLL_WALL=PASS');
console.log('GLOBAL_DESTINATION_BUTTONS=PASS');
console.log('JOURNEY_WIDE_SIDE_RAILS=PASS');
console.log('JOURNEY_DESTINATION_LEFT_RAIL=PASS');
console.log('GLOBAL_PARADOX_MAP_BACKGROUND=PASS');
console.log('GLOBAL_PARADOX_MAP_SLIGHT_BLUR=PASS');
