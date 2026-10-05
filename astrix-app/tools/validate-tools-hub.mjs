import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`,'utf8');

const publicPages=new Map([
  // The Hub (3 Oct 2026): the Tools page moved to /hub/; /tools/ redirects there.
  ['index.html','href="hub/">The Hub</a>'],
  ['pages/reviews.html','href="../hub/">The Hub</a>'],
  ['pages/news.html','href="../hub/">The Hub</a>'],
  ['pages/clips.html','href="../hub/">The Hub</a>'],
  ['pages/games.html','href="../hub/">The Hub</a>'],
  ['pages/join.html','href="../hub/">The Hub</a>']
]);

for(const [path,toolsLink] of publicPages){
  const html=read(path);
  assert.ok(html.includes(toolsLink),`${path} must link to The Hub`);
}

const mobileNavigationPages=[
  ['index.html',''],
  ['pages/reviews.html','../'],
  ['pages/news.html','../'],
  ['pages/clips.html','../'],
  ['pages/games.html','../'],
  ['pages/join.html','../'],
  ['pages/rebrand.html','../'],
  ['hub/index.html','../']
];
for(const [path,prefix] of mobileNavigationPages){
  const html=read(path);
  // PR #246 refreshed the palette entry points; PR #256 brings Clips onto the same approved version.
  const cssVersion='20260917-approved-palette-1&amp;gloss=20260926-4';
  assert.ok(html.includes(`href="${prefix}css/style.css?v=${cssVersion}"`),`${path} must load the current mobile-navigation CSS`);
  assert.ok(html.includes(`src="${prefix}js/main.js?v=20260913-mobile-nav-1"`),`${path} must load the current mobile-navigation controller`);
  assert.match(html,/<button class="nav-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="site-navigation">/,`${path} hamburger must expose its closed state and controlled menu`);
  assert.match(html,/<div class="nav-links" id="site-navigation">/,`${path} navigation links must provide the hamburger target`);
}

const publicHome=read('index.html');
const publicCss=read('css/style.css');
const publicJs=read('js/main.js');
assert.match(publicHome,/<a class="nav-logo" href="\/" aria-label="ASTRIX PARADOX home">[\s\S]*?<\/a>[\s\S]*?<button class="nav-toggle"/, 'Homepage logo must close before the mobile navigation button');
assert.doesNotMatch(publicHome,/class="logo"\s+<span/, 'Homepage must not restore the malformed logo anchor that captures mobile navigation taps');
assert.match(publicJs,/function setMenuOpen\(open\)[\s\S]*?aria-expanded[\s\S]*?String\(open\)/, 'Mobile navigation controller must keep its expanded state synchronized');
assert.match(publicJs,/event\.key === 'Escape'[\s\S]*?setMenuOpen\(false\)[\s\S]*?toggle\.focus\(\)/, 'Mobile navigation must close accessibly with Escape');
assert.match(publicCss,/@media \(max-width: 768px\)[\s\S]*?\.nav-links \{[\s\S]*?position: absolute;[\s\S]*?z-index: 1002;[\s\S]*?pointer-events: auto;/, 'Mobile navigation links must occupy a protected tappable layer');
assert.match(publicCss,/@media \(max-width: 768px\)[\s\S]*?\.nav-links a \{[\s\S]*?min-height: 48px;[\s\S]*?touch-action: manipulation;/, 'Mobile navigation destinations must provide reliable phone tap targets');

const tools=read('hub/index.html');
const toolsCss=read('hub/tools.css');
const toolsMission=read('hub/tools.mjs');
assert.ok(tools.includes('href="index.html" class="active">The Hub</a>'),'The Hub navigation item must be active');
assert.ok(tools.includes('href="tools.css?v=20260830-mission-popup&amp;hub=20261005-1"'),'The Hub must request its stylesheet without stale cache reuse');
assert.ok(tools.includes('<title>The Hub | ASTRIX PARADOX</title>')&&tools.includes('<link rel="canonical" href="https://astrixparadox.com/hub/">'),'The Hub title and canonical');
const redirect=read('tools/index.html');
assert.ok(redirect.includes("location.replace('/hub/'+location.search+location.hash)")&&redirect.includes('content="0; url=/hub/"')&&redirect.includes('<link rel="canonical" href="https://astrixparadox.com/hub/">'),'/tools/ redirects to /hub/ keeping the query and hash');
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
// Cards come from one data list (HUB_TOOLS): The Forge, WorkBench (coming soon, disabled), The Aetherium and the future slot.
const list=tools.slice(tools.indexOf('var HUB_TOOLS=['),tools.indexOf('];',tools.indexOf('var HUB_TOOLS=[')));
assert.match(list,/name:'The Forge'[\s\S]*?action:\{label:'Enter The Forge',href:'\.\.\/astrix-app\/pages\/home\/'\}/,'The Forge card enters the Destiny 2 tool by its unchanged route');
assert.match(list,/name:'WorkBench'[\s\S]*?status:'Coming soon'[\s\S]*?action:\{label:'Enter WorkBench'\}/,'WorkBench card is coming soon with no link');
assert.match(list,/\{kind:'future'\}/,'The future slot card stays');
assert.equal((tools.match(/ENTER THE FORGE/g)??[]).length,1,'The mission popup keeps its Forge action');
assert.equal((tools.match(/data-mission-close/g)??[]).length,3,'Mission popup must provide backdrop, icon and button close controls');
assert.ok(tools.includes('<script type="module" src="tools.mjs"></script>'),'Tools page must load its isolated mission controller');
assert.ok(list.includes("game:'Destiny 2'")&&list.includes("game:'The Division'"),'Each card names its game');
assert.equal((tools.match(/\.\.\/astrix-app\/pages\/home\//g)??[]).length,3,'The Forge card, its no-script link and the mission popup enter Guardian Home, the light landing page');
assert.ok(tools.includes('class="btn-primary forge-entry-link"'),'Tools page must use a clear Enter Forge button');
assert.doesNotMatch(tools,/guardian-alpha|ENTER (?:DESTINY )?ALPHA|Alpha · Invitation Only/,'Tools page must not expose retired Alpha state');
assert.ok(list.indexOf("name:'The Aetherium'")<list.indexOf("name:'The Forge'"),'The Aetherium card sits first, top left');
assert.ok(read('ARTWORK_PROVENANCE.md').includes("`img/games/aion2-the-aetherium.jpg` is NCSOFT's artwork, not ours."),'The Aetherium card art is recorded as NCSOFT artwork');
assert.equal((list.match(/\{kind:'/g)??[]).length,4,'One card per tool: The Forge, WorkBench, The Aetherium and the future slot');
// The Aetherium (AION 2, 5 Oct 2026): live card into the Daeva Card. Art is NCSOFT's own share image, stored with Miguel's
// approval and recorded in ARTWORK_PROVENANCE.md.
assert.match(list,/game:'AION 2',name:'The Aetherium',art:'\/img\/games\/aion2-the-aetherium\.jpg'[\s\S]*?action:\{label:'Enter The Aetherium',href:'\/hub\/aetherium\/'\}/,'The Aetherium card enters the Daeva Card');
assert.ok(tools.includes('class="platform-card platform-card-active'),'Tools use the active platform card');
assert.ok(tools.includes('class="platform-card platform-card-coming'),'Future slot must use the reusable platform card');
assert.ok(tools.includes('src="../img/logo.png"'),'Future tool card must use the official ASTRIX PARADOX logo');
assert.ok(tools.includes('WATCH THIS SPACE'),'Future tool card must carry the approved brand message');
assert.doesNotMatch(tools,/platform-note/,'Current tool card must remain short and direct');
assert.doesNotMatch(tools,/The first platform we are building is for Destiny 2\./,'Removed Destiny opening sentence must not return');
assert.doesNotMatch(tools,/destination-heading|destination-grid|Six parts of the same Guardian story/,'Destiny destinations must not appear publicly on the Tools page');
assert.doesNotMatch(tools,/tools-future|Future route pattern|astrixparadox\.com\/tools\/\{game\}|More than one game/,'Generic future-game section must remain removed');
assert.doesNotMatch(tools,/astrix-portal-loader|ForgeLoader|APX_AUTO_READY/,'Public Tools hub must open directly; only entering an actual tool loads the portal');
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
assert.doesNotMatch(games,/guardian-alpha|tools-section|The Forge/,'Universes page must remain separate from the Tools catalogue');
assert.ok(games.includes('Gaming <span class="accent">Universes</span>'),'Universes page must keep its own purpose');

const workspaceReadiness=read('astrix-app/pages/guardian-workspace-v2/guardian-beta-readiness.mjs');
assert.doesNotMatch(workspaceReadiness,/PARADOX285|astrix-paradox-beta-access|beta-access-gate|Enter the tester access code|accessGate/,'Workspace must not restore the tester access-code overlay');
assert.match(workspaceReadiness,/waitForBungieAuthentication\(\)\.then\(wireControls\);/,'Workspace controls must initialise after Bungie authentication without a tester gate');
assert.doesNotMatch(workspaceReadiness,/THE FORGE (?:ALPHA|BETA)|Alpha Settings|Alpha Help|Beta Loadouts|alpha preview|beta link/i,'Workspace controls must not render test state labels');

console.log('MULTI_GAME_TOOLS_HUB=PASS');
console.log('COMPACT_TOOLS_INTRO=PASS');
console.log('REUSABLE_PLATFORM_CARD_GRID=PASS');
console.log('TOOLS_NATIVE_LARGE_SCREEN_SCALE=PASS');
console.log('TOOLS_MISSION_POPUP=PASS');
console.log('TESTER_ACCESS_GATE_REMOVED=PASS');
console.log('TOOLS_INTRO_ROUTE=PASS');
console.log('RESPONSIVE_TOOLS_FORGE_CONTRACT=PASS');
console.log('MOBILE_NAVIGATION=PASS');
