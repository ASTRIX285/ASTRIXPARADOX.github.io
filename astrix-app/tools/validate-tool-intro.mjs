import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TOOL_INTROS,toolIntroConfig} from '../pages/tool-intro/tool-intro-config.mjs';

const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const html=read('astrix-app/pages/tool-intro/index.html');
const css=read('astrix-app/pages/tool-intro/tool-intro.css');
const runtime=read('astrix-app/pages/tool-intro/tool-intro.mjs');
const ribbon=read('astrix-app/shared/astrix-destination-ribbon.js');
const access=read('astrix-app/pages/guardian-workspace-v2/guardian-vault-access.mjs');
const provenance=read('ARTWORK_PROVENANCE.md');
const logo=read('img/brands/bungie-logo.svg').trim();

assert.deepEqual(Object.keys(TOOL_INTROS),['destiny-2'],'The first tool intro must be registered by game id');
const destiny=toolIntroConfig('destiny-2');
for(const key of ['title','purpose','limitations','ctaLabel','keyArt','developerLogo','disclaimer'])assert.ok(destiny[key],`Destiny 2 intro is missing ${key}`);
assert.equal(toolIntroConfig('unregistered-game'),null,'Unregistered games must never inherit fabricated Destiny content');
assert.equal(destiny.keyArt,'/img/games/D2_JB.jpg');
assert.equal(destiny.developerLogo,'/img/brands/bungie-logo.svg');
assert.match(destiny.disclaimer,/not officially affiliated with Bungie/);
assert.equal(destiny.title,'Guardian Journey');
assert.equal(destiny.ctaLabel,'ENTER FORGE');
assert.match(destiny.purpose,/understand your Guardian's journey so far in Destiny 2/);
assert.match(destiny.loadingLabel,/preparing your Guardian data and opening Journey/);
assert.doesNotMatch(Object.values(destiny).join(' '),/—|–/,'Tool intro copy must not contain em or en dashes');
assert.doesNotMatch(Object.values(destiny).join(' '),/\b(?:alpha|beta|preview|authenticated|version)\b/i,'Tool intro copy must describe the finished Forge experience');

assert.match(html,/id="toolIntroArt"[\s\S]*?id="toolIntroTitle"[\s\S]*?id="toolIntroPurpose"[\s\S]*?id="toolIntroLimitations"[\s\S]*?id="toolIntroCta"/,'Intro page must expose the data driven content slots');
assert.match(html,/Game developed by[\s\S]*?img\/brands\/bungie-logo\.svg[\s\S]*?not officially affiliated with Bungie/,'Intro page must show Bungie attribution, the official wordmark and the affiliation disclaimer');
assert.match(css,/\.tool-intro-art\{object-fit:cover;object-position:center\}/,'Key art must be placed without recolouring');
assert.doesNotMatch(css,/\.tool-intro-art[^}]*filter:|\.tool-intro-credit img[^}]*filter:/,'Official art and developer logo must not be recoloured');
assert.match(css,/@media\(max-width:800px\)/,'Intro page must provide a mobile composition');

assert.match(runtime,/const seenKey=`astrix_intro_seen_\$\{gameId\}`/,'Seen state must be namespaced per game');
assert.match(runtime,/fetch\(`\$\{AUTH_ORIGIN\}\/session`,\{[\s\S]*?credentials:'include'[\s\S]*?headers:\{Accept:'application\/json'\}[\s\S]*?signal:controller\.signal/,'Intro must run the verified Bungie session request');
assert.match(runtime,/setTimeout\(\(\)=>controller\.abort\(\),12000\)/,'Intro must retain the verified session timeout');
assert.match(runtime,/response\.status===401[\s\S]*?response\.ok[\s\S]*?response\.json\(\)/,'Intro must retain the verified session response handling');
assert.match(runtime,/location\.hostname===SANDBOX_HOST[\s\S]*?new URL\('\/__astrix\/bungie\/start',location\.origin\)[\s\S]*?start\.searchParams\.set\('return',returnUrl\)/,'Sandbox visitors must use the existing sandbox Bungie start route');
assert.match(runtime,/function openJourney\(\)\{\s*location\.replace\(JOURNEY_URL\);\s*\}/,'Connected visitors must replace the intro with Journey');
assert.match(runtime,/const session=await getBungieSession\(\);[\s\S]*?if\(session\?\.authenticated\)[\s\S]*?openJourney\(\)[\s\S]*?location\.assign\(authStartUrl\(\)\)/,'Intro must check the session before choosing Journey or Bungie approval');
assert.match(runtime,/import \{preloadForgeLoaderPayload\} from '\.\.\/forge-loader\/forge-loader-preload\.mjs[^']*'/,'The tool intro must reuse the shared Forge Loader prepared-page client.');
assert.ok(runtime.indexOf("await preloadForgeLoaderPayload(session,{force:true,reason:'tool-intro'})")<runtime.indexOf('openJourney();'),'The authenticated intro must make Forge Loader data resident before opening Journey.');
assert.match(runtime,/rememberIntro\(\)[\s\S]*?classList\.add\('is-transitioning'\)[\s\S]*?continueToGuardianJourney\(\)/,'CTA must remember the game, start the transition and run the real handoff');
assert.match(runtime,/if\(hasSeenIntro\(\)\)void continueToGuardianJourney\(\)/,'Seen intros must immediately run the Journey handoff');
assert.doesNotMatch(runtime,/prepareForgeLoaderEntry|forgeLoaderTargetUrl|loadPreparedPagePayload/,'The Journey intro must not fork the shared Forge Loader preload implementation');

assert.match(ribbon,/key:'forge-loader'[\s\S]*?href:'\/astrix-app\/pages\/forge-loader\/'/,'Internal Forge Loader navigation must remain direct');
assert.match(access,/function forgeLoaderUrl\(slot=null\)\{\s*return forgeLoaderTargetUrl\(slot\);\s*\}/,'Armour entry must remain a direct Forge Loader route');
assert.equal(existsSync(new URL('../pages/guardian-alpha/index.html',import.meta.url)),false,'Retired Guardian Alpha HTML must stay deleted');
assert.equal(existsSync(new URL('../pages/guardian-alpha/guardian-alpha.mjs',import.meta.url)),false,'Retired Guardian Alpha runtime must stay deleted');

assert.match(provenance,/bungie-logo\.svg[\s\S]*?bungie_logo_basic\.svg/,'Bungie logo provenance must name the official source asset');
assert.match(logo,/<title>Bungie<\/title>/);
assert.equal(createHash('sha256').update(logo).digest('hex'),'5ed902dcbedce8e87871144fcbcfb3fd6b62c8b105a2761dbbb78651deb4a4fa','Bungie logo must match the official source bytes apart from its final newline');
assert.doesNotMatch([html,runtime].join('\n'),/bungie\/manifest\/definition/,'Intro must never issue live definition requests');

console.log('TOOL_INTRO_DATA_DRIVEN_ROUTE=PASS');
console.log('TOOL_INTRO_SEEN_ONCE=PASS');
console.log('TOOL_INTRO_JOURNEY_HANDOFF=PASS');
console.log('TOOL_INTRO_OFFICIAL_ARTWORK=PASS');
