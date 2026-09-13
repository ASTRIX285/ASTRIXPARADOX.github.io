import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`,'utf8');

const publicPages=new Map([
  ['index.html','href="tools/">Tools</a>'],
  ['pages/reviews.html','href="../tools/">Tools</a>'],
  ['pages/news.html','href="../tools/">Tools</a>'],
  ['pages/clips.html','href="../tools/">Tools</a>'],
  ['pages/games.html','href="../tools/">Tools</a>'],
  ['pages/join.html','href="../tools/">Tools</a>']
]);

for(const [path,toolsLink] of publicPages){
  const html=read(path);
  assert.ok(html.includes(toolsLink),`${path} must link to the Tools hub`);
}

const tools=read('tools/index.html');
const toolsCss=read('tools/tools.css');
const toolsMission=read('tools/tools.mjs');
assert.ok(tools.includes('href="index.html" class="active">Tools</a>'),'Tools navigation item must be active');
assert.ok(tools.includes('href="tools.css?v=20260830-mission-popup"'),'Tools page must request the mission-popup stylesheet without stale cache reuse');
assert.ok(tools.includes('Tools for the games we play'),'Tools page must explain the multi-game purpose');
assert.doesNotMatch(tools,/astrix-desktop-density\.css/,'Public Tools page must remain at native scale on large monitors');
assert.equal((tools.match(/<section class="tools-hero">/g)??[]).length,1,'Tools introduction must use one hero section');
assert.doesNotMatch(tools,/<section class="tools-principles"/,'Tools purpose must not be split into a second section');
assert.ok(tools.indexOf('Better tools.')<tools.indexOf('Useful information.'),'Tools purpose must be presented inside the combined introduction');
assert.ok(tools.includes('ASTRIX PARADOX builds focused companion tools'),'Tools introduction must use the approved concise purpose copy');
assert.ok(tools.includes('class="tools-intro-summary"'),'Tools introduction must use one concise summary block');
assert.doesNotMatch(tools,/principle-grid|<article class="principle /,'Separate principle cards must remain removed');
assert.ok(tools.indexOf('class="tools-actions"')>tools.indexOf('class="tools-intro-summary"'),'Tools actions must follow the complete introduction');
assert.ok(tools.includes('class="btn-primary tools-mission-trigger"'),'Primary Tools action must open the ASTRIX PARADOX mission');
assert.ok(tools.includes('aria-controls="toolsMissionDialog"'),'Mission trigger must identify its dialog');
assert.ok(tools.includes('id="toolsMissionDialog" role="dialog" aria-modal="true"'),'Mission message must be exposed as a modal dialog');
assert.ok(tools.includes('Gaming is better with<br><span>an intelligent partner.</span>'),'Mission popup must carry the approved campaign headline');
assert.ok(tools.includes('The goal is not to play the game for you.'),'Mission popup must explain the AI partner boundary');
assert.equal((tools.match(/ENTER FORGE/g)??[]).length,2,'Tools card and mission popup must use the finished Forge action');
assert.equal((tools.match(/data-mission-close/g)??[]).length,3,'Mission popup must provide backdrop, icon and button close controls');
assert.ok(tools.includes('<script type="module" src="tools.mjs"></script>'),'Tools page must load its isolated mission controller');
assert.ok(tools.includes('Destiny 2 Guardian Platform'),'Tools page must identify the current platform');
assert.equal((tools.match(/\.\.\/astrix-app\/pages\/tool-intro\/\?game=destiny-2/g)??[]).length,2,'Tools card and mission popup must route through the Destiny 2 intro');
assert.ok(tools.includes('class="btn-primary forge-entry-link"'),'Tools page must use a clear Enter Forge button');
assert.doesNotMatch(tools,/guardian-alpha|ENTER (?:DESTINY )?ALPHA|Alpha · Invitation Only/,'Tools page must not expose retired Alpha state');
assert.equal((tools.match(/<article class="platform-card /g)??[]).length,2,'Tools catalogue must use one active card and one reusable future card');
assert.ok(tools.includes('class="platform-card platform-card-active'),'Current tool must use the active platform card');
assert.ok(tools.includes('class="platform-card platform-card-coming'),'Future slot must use the reusable platform card');
assert.ok(tools.includes('src="../img/logo.png"'),'Future tool card must use the official ASTRIX PARADOX logo');
assert.ok(tools.includes('WATCH THIS SPACE'),'Future tool card must carry the approved brand message');
assert.doesNotMatch(tools,/platform-note/,'Current tool card must remain short and direct');
assert.doesNotMatch(tools,/The first platform we are building is for Destiny 2\./,'Removed Destiny opening sentence must not return');
assert.doesNotMatch(tools,/destination-heading|destination-grid|Six parts of the same Guardian story/,'Destiny destinations must not appear publicly on the Tools page');
assert.doesNotMatch(tools,/tools-future|Future route pattern|astrixparadox\.com\/tools\/\{game\}|More than one game/,'Generic future-game section must remain removed');
assert.doesNotMatch(tools,/astrix-portal-loader|APX_LOGO/,'Public Tools hub must not mount the application loader');
assert.doesNotMatch(tools,/—|–|&mdash;|&ndash;/,'Tools page must not use em or en dashes');
assert.match(toolsCss,/\.tools-hero-inner,[\s\S]*?\.tools-shell\s*\{[\s\S]*?max-width:\s*1680px;/,'Tools content must use the approved wider desktop shell');
assert.match(toolsCss,/\.tools-intro-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.05fr\) minmax\(440px, 0\.95fr\);/,'Combined Tools introduction must use the approved wider desktop composition');
assert.match(toolsCss,/\.section-copy\s*\{[\s\S]*?font-size:\s*clamp\(17px, 0\.78vw, 20px\);/,'Public Tools summary must scale for high-resolution monitors');
assert.match(toolsCss,/\.tools-actions \.btn-primary,[\s\S]*?font-size:\s*clamp\(11px, 0\.52vw, 13px\);/,'Public Tools actions must remain legible on high-resolution monitors');
assert.match(toolsCss,/\.tools-mission-dialog\s*\{[\s\S]*?width:\s*min\(1080px, calc\(100vw - 48px\)\);/,'Mission popup must use the approved readable desktop width');
assert.match(toolsCss,/\.tools-mission-copy p\s*\{[\s\S]*?font-size:\s*clamp\(18px, 0\.85vw, 22px\);/,'Mission popup copy must scale for high-resolution monitors');
assert.match(toolsCss,/\.platform-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,'Tool catalogue must use two equal desktop columns');
assert.match(toolsCss,/\.platform-card\s*\{[\s\S]*?min-height:\s*340px;/,'Tool cards must use the approved compact height');
assert.doesNotMatch(toolsCss,/\.principle-grid|\.platform-overview/,'Retired long-form presentation rules must remain removed');
assert.match(toolsCss,/@media \(max-width: 1100px\)[\s\S]*?\.platform-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,'Tool cards must stack before their content becomes cramped');
assert.match(toolsCss,/@media \(max-width: 768px\)[\s\S]*?\.tools-intro-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,'Tools introduction must stack on phone and tablet widths');
assert.match(toolsCss,/@media \(max-width: 560px\)[\s\S]*?\.platform-card-active\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,'Active tool card must stack at phone widths');
assert.match(toolsCss,/@media \(max-width: 560px\)[\s\S]*?\.tools-mission-dialog\s*\{[\s\S]*?width:\s*calc\(100vw - 24px\);/,'Mission popup must fit phone widths');
assert.ok(toolsMission.includes("trigger.addEventListener('click',openMission)"),'Primary action must open the mission popup');
assert.ok(toolsMission.includes("event.key==='Escape'"),'Mission popup must close with Escape');
assert.ok(toolsMission.includes("event.key!=='Tab'"),'Mission popup must manage keyboard focus');
assert.ok(toolsMission.includes("document.body.classList.add('tools-mission-open')"),'Mission popup must prevent background scrolling');

const games=read('pages/games.html');
assert.doesNotMatch(games,/guardian-alpha|tools-section|Guardian Build Forge/,'Universes page must remain separate from the Tools catalogue');
assert.ok(games.includes('Gaming <span class="accent">Universes</span>'),'Universes page must keep its own purpose');

const workspaceReadiness=read('astrix-app/pages/guardian-workspace-v2/guardian-beta-readiness.mjs');
assert.doesNotMatch(workspaceReadiness,/PARADOX285|astrix-paradox-beta-access|beta-access-gate|Enter the tester access code|accessGate/,'Workspace must not restore the tester access-code overlay');
assert.match(workspaceReadiness,/waitForBungieAuthentication\(\)\.then\(wireControls\);/,'Workspace controls must initialise after Bungie authentication without a tester gate');
assert.doesNotMatch(workspaceReadiness,/GUARDIAN BUILD FORGE (?:ALPHA|BETA)|Alpha Settings|Alpha Help|Beta Loadouts|alpha preview|beta link/i,'Workspace controls must not render test state labels');

console.log('MULTI_GAME_TOOLS_HUB=PASS');
console.log('COMPACT_TOOLS_INTRO=PASS');
console.log('REUSABLE_PLATFORM_CARD_GRID=PASS');
console.log('TOOLS_NATIVE_LARGE_SCREEN_SCALE=PASS');
console.log('TOOLS_MISSION_POPUP=PASS');
console.log('TESTER_ACCESS_GATE_REMOVED=PASS');
console.log('TOOLS_INTRO_ROUTE=PASS');
console.log('RESPONSIVE_TOOLS_FORGE_CONTRACT=PASS');
