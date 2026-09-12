import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ROOT=new URL('../pages/guardian-workspace-v2/',import.meta.url);
const sources={
  shared:await readFile(new URL('guardian-left-rail-shared.css',ROOT),'utf8'),
  adaptive:await readFile(new URL('guardian-adaptive-layout.css',ROOT),'utf8'),
  characters:await readFile(new URL('guardian-character-cards.css',ROOT),'utf8'),
  gear:await readFile(new URL('guardian-gear-layout.css',ROOT),'utf8'),
  layout:await readFile(new URL('guardian-layout-final.css',ROOT),'utf8'),
  leftLock:await readFile(new URL('guardian-left-panel-lock.css',ROOT),'utf8'),
  mobile:await readFile(new URL('guardian-mobile.css',ROOT),'utf8'),
  super:await readFile(new URL('guardian-super-formation.css',ROOT),'utf8'),
  items:await readFile(new URL('paradox-item-cards.css',ROOT),'utf8'),
  build:await readFile(new URL('paradox-build-space/paradox-build-space.css',ROOT),'utf8')
};
const mainHtml=await readFile(new URL('index.html',ROOT),'utf8');
const buildHtml=await readFile(new URL('paradox-build-space/index.html',ROOT),'utf8');
const densityCss=await readFile(new URL('../../shared/astrix-desktop-density.css',ROOT),'utf8');
const sharedHeroCss=await readFile(new URL('../../shared/astrix-hero-cards.css',ROOT),'utf8');
const destinationRibbonCss=await readFile(new URL('../../shared/astrix-destination-ribbon.css',ROOT),'utf8');
const journeyCss=await readFile(new URL('../journey/journey-2560-visual.css',ROOT),'utf8');
const missionCss=await readFile(new URL('../mission-reports/mission-reports.css',ROOT),'utf8');
const forgeLoaderCss=await readFile(new URL('../forge-loader/forge-loader.css',ROOT),'utf8');
const appPages=[
  ['Journey',await readFile(new URL('../journey/index.html',ROOT),'utf8')],
  ['Character',mainHtml],
  ['Build Forge',buildHtml],
  ['Mission Reports',await readFile(new URL('../mission-reports/index.html',ROOT),'utf8')],
  ['Vault',await readFile(new URL('../vault/index.html',ROOT),'utf8')],
  ['Forge Loader',await readFile(new URL('../forge-loader/index.html',ROOT),'utf8')],
  ['Loadout',await readFile(new URL('../loadout/index.html',ROOT),'utf8')]
];
const combined=Object.values(sources).join('\n');

const squareOwners=Object.entries(sources).filter(([,source])=>/--guardian-square\s*:/.test(source)).map(([name])=>name);
assert.deepEqual(squareOwners,['shared'],'The Guardian square token must have one stylesheet owner');
assert.match(sources.shared,/--guardian-square:clamp\(40px,3\.2vw,64px\);[\s\S]*?--guardian-square-gap:6px;[\s\S]*?--guardian-square-radius:6px;/,'The shared responsive square contract drifted');
assert.match(sources.shared,/guardian-left-rail[\s\S]*?width:var\(--guardian-square\)!important;[\s\S]*?height:var\(--guardian-square\)!important/,'Left-rail sockets must consume the shared square token');
assert.match(sources.gear,/\.gear-mods\{[^}]*repeat\(3,var\(--guardian-square\)\)[^}]*repeat\(2,var\(--guardian-square\)\)[^}]*gap:var\(--guardian-square-gap\)/,'Armour mods must consume the same square and gap tokens');
assert.match(sources.gear,/\.gear-columns\{[^}]*repeat\(auto-fit,minmax\(min\(220px,100%\),1fr\)\)/,'Shared armour cards must wrap before their mod grids can overlap');
assert.match(sources.gear,/\.gear-weapons\{[\s\S]*?--gear-weapon-art:var\(--apx-icon-gear-art-width\);[\s\S]*?--gear-weapon-socket:var\(--apx-icon-weapon-socket\)/,'Weapon art and sockets must consume the shared equipment tokens');
assert.match(sources.gear,/\.gear-weapons \.weap\{[\s\S]*?grid-template-areas:"art cap" "art perks" "art support" "art empty"!important/,'Every weapon card must use the shared art, perks and mod composition');
assert.match(sources.gear,/\.weapon-perk-matrix\.is-compact \.weapon-perk-row\{grid-template-columns:repeat\(var\(--weapon-perk-columns\),var\(--gear-weapon-socket\)\)/,'Compact weapon models must keep their tier-defined perk columns aligned');
assert.match(sources.gear,/\.weapon-support-icon\{width:var\(--gear-weapon-socket\)!important;height:var\(--gear-weapon-socket\)!important/,'Weapon mod and masterwork sockets must match perk sizing');
assert.doesNotMatch(sources.build,/--guardian-square\s*:|--pf-mod-size\s*:|\.gear-slot \.gear-mods\s*\{/,'Build must not create a second socket-size owner');
assert.match(sources.items,/\.paradox-item-card\{[\s\S]*?border:1px solid rgba\(224,185,79,\.42\)/,'Weapon and armour inspectors must share one Paradox card frame');
assert.match(sources.items,/\.paradox-item-card \.weapon-perk-cell\{[^}]*border:2px solid/,'Detailed weapon perks must retain circular socket emphasis');
assert.match(sources.items,/\.paradox-socket-icon\{[^}]*border-radius:8px/,'Armour mods and cosmetics must retain square sockets');
assert.match(sources.items,/@media\(max-width:700px\)\{[\s\S]*?\.weapon-detail-drawer\.paradox-item-shell,\.armour-drawer\.paradox-item-shell\{inset:0;width:100%;height:100dvh/,'Both item-card inspectors must become contained full-screen mobile surfaces');
assert.match(mainHtml,/paradox-item-cards\.css\?v=20260908-icon-hover-1/,'Character must load the shared Paradox item-card and hover framework');
assert.match(buildHtml,/paradox-item-cards\.css\?v=20260908-icon-hover-1/,'Build Forge must load the same Paradox item-card and hover framework');

assert.match(sources.shared,/guardian-loadouts-strip\{[\s\S]*?overflow-x:auto!important/,'The 1–20 loadout strip must contain its own narrow-screen overflow');
assert.match(sources.shared,/guardian-loadouts-grid\{[\s\S]*?grid-template-columns:repeat\(20,minmax\(32px,1fr\)\)!important;[\s\S]*?min-width:720px!important/,'The Bungie 1–20 loadout row must remain fluid and single-row');
assert.match(sources.shared,/guardian-loadout-slot\{[\s\S]*?aspect-ratio:1!important/,'Every loadout slot must remain square');

assert.doesNotMatch(combined,/(?:^|[;{])\s*zoom\s*:/m,'Page-level CSS zoom is forbidden');
const pageLayoutCss=[sources.adaptive,sources.gear,sources.layout,sources.leftLock,sources.mobile,sources.shared,sources.super,sources.build].join('\n');
assert.doesNotMatch(pageLayoutCss,/(?:html|body|\.workspace|\.build-space|\.design-canvas|\.guardian-left-rail)\s*\{[^{}]*transform\s*:\s*scale\(/,'Page containers must not be scaled to simulate responsiveness');
assert.doesNotMatch(densityCss,/--forge-desktop-density|(?:^|[;{])\s*zoom\s*:/m,'The shared interface must render at native scale instead of shrinking every tool');
assert.match(densityCss,/--apx-workspace-left:minmax\(360px,20%\);[\s\S]*?--apx-workspace-centre:minmax\(720px,1fr\);[\s\S]*?--apx-workspace-right:minmax\(420px,24%\);[\s\S]*?--apx-workspace-compact-columns:392px minmax\(0,1fr\);/,'The shared workspace track contract must retain the approved Journey proportions');
assert.match(densityCss,/--apx-font-copy:"bahnschrift"[\s\S]*?--apx-font-display:"bahnschrift-semicondensed"[\s\S]*?--apx-type-section-title:1rem;[\s\S]*?--apx-type-body:\.875rem;[\s\S]*?--apx-type-label:\.75rem;[\s\S]*?--apx-type-meta:\.75rem;/,'All tools must inherit one readable typography scale');
for(const token of [
  '--apx-icon-stat:1.25rem;',
  '--apx-icon-season:1.125rem;',
  '--apx-icon-vault-selection:2.5rem;',
  '--apx-icon-set-head:2.8rem;',
  '--apx-icon-card:3.5rem;',
  '--apx-icon-stage:3.8rem;',
  '--apx-icon-record:3rem;',
  '--apx-icon-catalog:8rem;',
  '--apx-icon-weapon-card:clamp(2.75rem,4.2cqi,3.5rem);',
  '--apx-icon-selector:4.25rem;',
  '--apx-icon-inspect:7rem;',
  '--apx-icon-gear-art-width:96px;',
  '--apx-icon-gear-art-height:calc(var(--apx-icon-gear-art-width) * 1.22);'
])assert.ok(densityCss.includes(token),`Shared item icon token drifted: ${token}`);
assert.match(densityCss,/@media \(max-width:720px\)\{[\s\S]*?--apx-icon-gear-art-width:76px/,'Shared gear art must retain the approved fixed 76px phone breakpoint');
assert.match(densityCss,/body\.apx-destination-page \.apx-page-shell\{width:100%;max-width:none\}/,'Scaffold destinations must use the full desktop monitor');
assert.doesNotMatch(densityCss,/transform\s*:\s*scale\(/,'The shared density layer must not use transform scaling');

assert.match(sources.characters,/html body \.topbar\{[\s\S]*?position:sticky!important/,'The character-card ribbon must remain anchored to the tool header');
assert.match(sources.characters,/@media\s*\(max-width:860px\)\{[\s\S]*?#guardianCharacterCards\.guardian-character-cards\{[^}]*display:grid!important;[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important;[^}]*overflow:hidden!important/,'All three character cards must remain fixed and contained in the phone ribbon');
assert.doesNotMatch(sources.characters,/scroll-snap-type|overflow-x:auto/,'The fixed character-card ribbon must not become a separate scrolling container');
assert.match(sharedHeroCss,/@media\(max-width:720px\)\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important;[\s\S]*?\.guardian-character-card__stats\{display:none!important\}/,'Shared phone hero cards must retain all three Guardians without compressing six stat groups into each card');
assert.match(destinationRibbonCss,/@media\(max-width:720px\)\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\);grid-template-rows:repeat\(2,42px\);[\s\S]*?overflow:hidden/,'Phone destination navigation must show every route in a contained two-row grid');
assert.match(sources.build,/@media\(max-width:1100px\)\{\.build-space\{grid-template-columns:1fr\}/,'Build must share the single-column compact breakpoint');
assert.match(sources.build,/@media\s*\(max-width:720px\)\{[\s\S]*?\.build-space\{grid-template-columns:1fr/,'Build must collapse to one document-flow column on phones');
assert.match(sources.build,/@media\(max-width:720px\)\{[\s\S]*?\.design-canvas \.gear-weapons \.weap-grid\{grid-template-columns:1fr!important\}/,'Build weapon models must use their complete single-column composition on phones');
for(const [label,source] of [['Journey',journeyCss],['Build Forge',sources.build],['Mission Reports',missionCss]]){
  assert.match(source,/grid-template-columns:var\(--apx-workspace-columns,/u,label+' must consume the shared wide workspace tracks');
  assert.match(source,/grid-template-columns:var\(--apx-workspace-compact-columns,/u,label+' must consume the shared compact workspace tracks');
}
assert.match(forgeLoaderCss,/grid-template-columns:minmax\(360px,20%\) minmax\(640px,44%\) minmax\(560px,1fr\)/u,'Forge Loader alone must reserve a narrower directive track and a wider output track');
assert.match(forgeLoaderCss,/grid-template-columns:var\(--apx-workspace-compact-columns,/u,'Forge Loader must retain the shared compact workspace tracks');
assert.match(forgeLoaderCss,/\.forge-exotic-grid\{[^}]*minmax\(var\(--apx-icon-selector\),1fr\)/u,'Forge Loader Exotic selection must consume the shared selector icon token');
assert.match(forgeLoaderCss,/\.forge-staged-slot\{[^}]*grid-template-columns:var\(--apx-icon-stage\)/u,'Forge Loader staged items must consume the exact shared stage icon tier');
assert.match(forgeLoaderCss,/\.forge-matrix-exotic\{[^}]*width:var\(--apx-icon-selector\);height:var\(--apx-icon-selector\)/u,'Forge Loader Matrix Exotics must match the shared Exotic selector tile size');
assert.match(forgeLoaderCss,/\.forge-inspect-main\{[^}]*grid-template-columns:var\(--apx-icon-inspect\)[\s\S]*?\.forge-inspect-main img\{width:var\(--apx-icon-inspect\);height:var\(--apx-icon-inspect\)/u,'Forge Loader inspection must consume the shared inspect icon token');
assert.match(sources.build,/\.recommended-weapons-summary\{--gear-weapon-art:var\(--apx-icon-gear-art-width\)/u,'Build Forge recommendations must consume the shared portrait gear-art token');
assert.doesNotMatch(sources.gear,/\.weapon-detail-icon\{[^}]*width:/u,'Guardian gear layout must not override the canonical item-detail icon size');
assert.match(sources.items,/body \.paradox-item-header \.weapon-detail-icon\{width:var\(--paradox-equipment-width\);height:var\(--paradox-equipment-height\)/u,'Item cards must retain the single canonical detail icon size source');
assert.match(sources.layout,/grid-template-columns:var\(--apx-workspace-left,[^;]+\) var\(--apx-workspace-centre,[^;]+\)!important/,'Character must consume the shared rail and centre tracks');
assert.match(sources.shared,/\.workspace>\.stage-companion,[\s\S]*?\.workspace>\.stage,[\s\S]*?\.workspace>\.right\{display:none!important\}/,'Character must retain but visually remove the two obsolete stage areas');
assert.match(sources.shared,/grid-template-areas:"rail equipment"!important/,'Character equipment must align with the rail top, with its action below');
assert.match(sources.shared,/grid-template-areas:"loadouts" "armour" "weapons" "action"!important/,'Character equipment must render Loadouts, Armour, then Weapons');
assert.match(sources.shared,/grid-template-rows:repeat\(4,max-content\)!important;[\s\S]*?grid-auto-rows:max-content!important;/,'Character equipment rows must grow to their complete rendered content');
for(const [label,area] of [['Loadouts','loadouts'],['Armour','armour'],['Weapons','weapons']]){
  const selector=label==='Loadouts'?'guardian-loadouts-container':label==='Armour'?'gear-combined':'gear-weapons';
  const block=sources.shared.match(new RegExp(`body\\.guardian-main-page \\.equip\\.gear-layout-active>\\.${selector}\\{([^}]*)\\}`))?.[1]||'';
  assert.match(block,new RegExp(`grid-area:${area}!important`),`${label} must keep its named Character equipment area`);
  assert.doesNotMatch(block,/grid-(?:row|column):/u,`${label} must not override its named equipment row`);
}
assert.match(sources.shared,/body\.guardian-main-page>\.actionbar\{[^}]*position:static!important;[^}]*width:100%!important;/,'Character actions must remain in document flow instead of covering equipment');
assert.match(sources.shared,/\.gear-combined \.gear-columns\{[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/,'Character Armour must retain five equal columns');
assert.match(sources.shared,/body\.guardian-main-page \.gear-combined \.gear-slot\{[^}]*height:auto!important;[^}]*min-height:calc\(120px \+ \(var\(--guardian-square\) \* 2\) \+ var\(--guardian-square-gap\)\)!important;[^}]*overflow:visible!important;/,'Character Armour cards must reserve both complete mod rows before Weapons');
assert.match(sources.super,/@media\s*\(max-width:720px\)\{[\s\S]*?\.super-feature \.super-feature__cluster\{width:min\(300px,100%\)!important\}/,'Super geometry must scale inside its container at narrow widths');

for(const [label,html] of [['Main',mainHtml],['Build',buildHtml]]){
  assert.match(html,/<meta\s+name="viewport"\s+content="[^"]*width=device-width[^"]*initial-scale=1(?:\.0)?[^"]*"\s*\/?>/,label+' must declare a device-width viewport');
  assert.doesNotMatch(html,/guardian-resolution-adaptive\.css/,label+' must not load the rejected broad scaling override');
}
for(const [label,html] of appPages){
  const styles=[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match=>match[1]);
  assert.match(html,/https:\/\/use\.typekit\.net\/tnp6kbq\.css/,label+' must load the shared Adobe Fonts web project');
  assert.match(html,/\/css\/astrix-site-typography\.css/,label+' must load the shared Forge typography layer');
  assert.doesNotMatch(html,/fonts\.(?:googleapis|gstatic)\.com/,label+' must not load a competing interface font service');
  assert.match(styles.at(-1)||'',/astrix-desktop-density\.css(?:\?[^"']*)?$/,label+' must load the shared desktop density layer last');
  assert.match(html,/astrix-destination-ribbon\.css\?v=(?:20260904-mobile-crosscheck-1|20260906-page-refresh-1)/,label+' must load the current contained mobile destination navigation');
  assert.match(html,/astrix-hero-cards\.css\?v=20260904-mobile-crosscheck-1/,label+' must load the current shared mobile hero cards');
}

console.log('RESPONSIVE_SINGLE_OWNER=PASS');
console.log('RESPONSIVE_NO_TRANSFORM_PAGE_SCALE=PASS');
console.log('RESPONSIVE_NATIVE_SCALE=PASS');
console.log('RESPONSIVE_LOADOUT_ROW=PASS');
console.log('RESPONSIVE_TABLET_PHONE_SOURCE=PASS');
