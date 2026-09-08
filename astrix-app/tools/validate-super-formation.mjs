import assert from 'node:assert/strict';
import {access,readdir,readFile} from 'node:fs/promises';

const ROOT=new URL('../',import.meta.url);
const PAGE_ROOT=new URL('pages/guardian-workspace-v2/',ROOT);
const SHARED_CSS_URL=new URL('guardian-super-formation.css',PAGE_ROOT);
const PICKER_CSS_URL=new URL('subclass-picker.css',PAGE_ROOT);
const SHARED_MODULE_URL=new URL('guardian-super-formation.mjs',PAGE_ROOT);
const CATALOG_MODULE_URL=new URL('guardian-super-catalog.mjs',PAGE_ROOT);
const LOADOUT_DEFINITIONS_URL=new URL('guardian-loadout-definitions.mjs',PAGE_ROOT);
const MAIN_HTML_URL=new URL('index.html',PAGE_ROOT);
const BUILD_HTML_URL=new URL('paradox-build-space/index.html',PAGE_ROOT);
const MAIN_MODULE_URL=new URL('guardian-workspace-v2.mjs',PAGE_ROOT);
const SYNC_MODULE_URL=new URL('guardian-super-feature-sync.mjs',PAGE_ROOT);
const BUILD_MODULE_URL=new URL('paradox-build-space/paradox-build-space.mjs',PAGE_ROOT);
const read=url=>readFile(url,'utf8');

const [css,pickerCss,moduleSource,catalogSource,mainHtml,buildHtml,mainModule,syncModule,buildModule,{LOADOUT_DEFINITIONS},catalogApi]=await Promise.all([
  read(SHARED_CSS_URL),
  read(PICKER_CSS_URL),
  read(SHARED_MODULE_URL),
  read(CATALOG_MODULE_URL),
  read(MAIN_HTML_URL),
  read(BUILD_HTML_URL),
  read(MAIN_MODULE_URL),
  read(SYNC_MODULE_URL),
  read(BUILD_MODULE_URL),
  import(LOADOUT_DEFINITIONS_URL.href),
  import(CATALOG_MODULE_URL.href)
]);

const expectedColours={
  void:'#8B4DFF',
  arc:'#4FC3FF',
  solar:'#FF7A18',
  strand:'#4DFF73',
  stasis:'#4C8DFF',
  prismatic:'#E84CFF'
};
for(const [key,colour] of Object.entries(expectedColours)){
  assert.match(css,new RegExp(`\\[data-super-subclass="${key}"\\]\\{--super-accent:${colour}`,'i'),`${key} Super colour drifted`);
  assert.match(css,new RegExp(`\\[data-subclass="${key}"\\]\\{--super-accent:${colour}`,'i'),`${key} subclass header colour drifted`);
}

const expectedGeometry={
  equipped:{left:'50.25%',top:'34.50%',width:'41.45%'},
  alt1:{left:'19.62%',top:'49.75%'},
  alt2:{left:'80.38%',top:'50.12%'},
  alt3:{left:'34.62%',top:'65.12%'},
  alt4:{left:'65.38%',top:'65.38%'},
  alt5:{left:'50.00%',top:'80.38%'}
};
for(const [slot,values] of Object.entries(expectedGeometry)){
  const selector=slot==='equipped'?'.super-diamond--equipped':`.super-diamond--${slot}`;
  const block=css.match(new RegExp(`${selector.replaceAll('.','\\.')}\\{([^}]*)\\}`))?.[1]||'';
  assert.ok(block,`${slot} geometry rule is missing`);
  for(const [property,value] of Object.entries(values))assert.match(block,new RegExp(`${property}:${value.replace('.','\\.')}`),`${slot} ${property} drifted`);
}
assert.match(css,/\.super-diamond--alt\{width:20\.51%!important/,'Alternate Super width drifted');
const equippedBevel=Number(css.match(/--super-equipped-bevel:(\d+(?:\.\d+)?)px/)?.[1]);
const alternateBevel=Number(css.match(/--super-alternate-bevel:(\d+(?:\.\d+)?)px/)?.[1]);
assert.equal(equippedBevel,5,`Equipped Super bevel is ${equippedBevel||0}px; expected 5px`);
assert.equal(alternateBevel,2.5,`Alternate Super bevel is ${alternateBevel||0}px; expected 2.5px`);
const rotatedBounds=(left,top,width)=>{
  const halfDiagonal=width*Math.SQRT2/2;
  return {left:left-halfDiagonal,right:left+halfDiagonal,top:top-halfDiagonal,bottom:top+halfDiagonal};
};
for(const [slot,values] of Object.entries(expectedGeometry)){
  const width=Number((values.width||'20.51%').replace('%',''));
  const bounds=rotatedBounds(Number(values.left.replace('%','')),Number(values.top.replace('%','')),width);
  for(const [edge,value] of Object.entries(bounds))assert.ok(value>=0&&value<=100,`${slot} rotated ${edge} edge escapes the scalable cluster: ${value.toFixed(2)}%`);
}

assert.match(css,/transform:translate\(-50%,-50%\) rotate\(45deg\)!important/,'Diamond transform drifted');
assert.match(css,/aspect-ratio:1 \/ 1!important/,'Formation must remain square');
const gap=Number(css.match(/gap:clamp\((\d+)px,3vw,40px\)!important/)?.[1]);
assert.ok(gap>=32,`Subclass/Super minimum gap is ${gap||0}px; expected at least 32px`);
assert.match(css,/@media\(max-width:720px\)\{[\s\S]*?gap:32px!important/,'Phone/tablet rule must preserve the 32px subclass-to-Super gap');
assert.match(css,/@media\(max-width:720px\)\{[\s\S]*?\.super-feature \.super-feature__cluster\{width:min\(300px,100%\)!important\}/,'Phone/tablet cluster must scale to its container without page zoom');
assert.match(css,/\.super-feature \.super-feature__name\{[\s\S]*?font:700 var\(--apx-type-subsection-title,\.875rem\)\/1\.3 bahnschrift[\s\S]*?white-space:normal!important;[\s\S]*?overflow:visible!important;[\s\S]*?text-overflow:clip!important;/,'Super name must stay readable and fully visible on Main and Build Forge');

assert.match(css,/flex:0 0 auto!important;/,'Equipped subclass/Super wrapper must not collapse inside the scroll rail');

for(const [label,html,entryModule] of [
  ['Main',mainHtml,/guardian-workspace-v2\.mjs\?v=20260906-page-data-recovery-1/],
  ['Build',buildHtml,/paradox-build-space\.mjs\?v=20260908-icon-hover-1/]
]){
  assert.match(html,/guardian-super-formation\.css/,`${label} does not load the shared stylesheet`);
  assert.match(html,entryModule,`${label} does not load the current profile-scoped entry module`);
  assert.match(html,/equipped-subclass-stack/,`${label} does not use the equipped-only subclass stack`);
  assert.equal((html.match(/data-super-slot=/g)||[]).length,6,`${label} must expose six fixed Super slots`);
  assert.doesNotMatch(html,/class="subclass-rail"|id="subclassSummary"|data-subclass-option=/,`${label} still contains the removed subclass selector panel`);
}
assert.match(mainModule,/guardian-super-formation\.mjs\?v=20260829-subclass-identity-1/,'Main does not load the strict subclass identity mapper');
assert.match(buildModule,/guardian-super-formation\.mjs\?v=20260829-subclass-identity-1/,'Build does not load the strict subclass identity mapper');

assert.match(moduleSource,/function renderEquippedSubclass/,'Shared equipped subclass renderer is missing');
assert.equal(LOADOUT_DEFINITIONS.icons?.[814121290]?.iconImagePath,'/common/destiny2_content/icons/8f8283c4f518dbd2239ba1f60b91d14f.png','Prismatic header icon hash 814121290 drifted');
assert.match(moduleSource,/PRISMATIC_HEADER_ICON_HASH=814121290/,'Shared renderer does not use the Bungie Prismatic loadout icon hash');
assert.match(moduleSource,/key==='prismatic'\?PRISMATIC_HEADER_ICON:icon/,'Prismatic header is not routed through the shared class-neutral icon');
assert.match(moduleSource,/prismatic:PRISMATIC_HEADER_ICON/,'Lower Prismatic picker is not routed through the same class-neutral icon');
assert.match(moduleSource,/iconPath=SUBCLASS_PICKER_ICONS\[element\]/,'Subclass picker does not bind artwork to the selected subclass identity');
assert.doesNotMatch(moduleSource,/resolvedSuperIcon\(option\)/,'Subclass picker can still substitute a stale Super icon');
assert.match(pickerCss,/\.subclass-picker \.el\[data-element="prismatic"\] \.icon\{background-size:78% 78%\}/,'Lower Prismatic picker icon scale drifted');
assert.match(css,/\.equipped-subclass:not\(\[data-subclass="prismatic"\]\) \.equipped-subclass__crest img\{[\s\S]*?position:absolute;[\s\S]*?left:50%;[\s\S]*?top:50%;[\s\S]*?transform:translate\(-50%,-50%\) rotate\(-45deg\);/,'Non-Prismatic header artwork is not explicitly centred');
assert.match(moduleSource,/function renderSuperFormation/,'Shared Super renderer is missing');
assert.match(moduleSource,/function resolveSuperFormationSlots/,'Shared Super slot mapper is missing');
assert.match(moduleSource,/holder\.replaceChildren\(\)/,'Empty Super slots must clear placeholder glyphs');
assert.match(moduleSource,/slot\.hidden=false/,'Every PSD Super frame must remain visible');
assert.match(moduleSource,/is-empty-super/,'Unresolved Super frames must remain transparent and explicit');
assert.match(css,/\.super-diamond--equipped>span\{[\s\S]*?inset:-20\.7107%!important;[\s\S]*?width:141\.4214%!important;[\s\S]*?height:141\.4214%!important/,'Equipped Super artwork must fill the rotated diamond without inner padding');

for(const [label,source] of [['Main renderer',mainModule],['Main sync bridge',syncModule],['Build renderer',buildModule]]){
  assert.match(source,/subclassCatalog:/,`${label} does not pass the verified subclass catalogue to the shared Super mapper`);
  assert.match(source,/characterClass(?::|,)/,`${label} does not bind Super hashes to the selected character class`);
}
assert.match(moduleSource,/strand:'\/common\/destiny2_content\/icons\/41c0024ce809085ac16f4e0777ea0ac4\.png'/,'Shared subclass picker lost its verified Strand fallback');
assert.doesNotMatch(syncModule,/applyManifestElementIcons/,'Character sync can still overwrite verified subclass picker artwork');

const {renderSubclassPicker,resolveSuperFormationSlots}=await import(SHARED_MODULE_URL.href);
const {CLASS_NAMES,ELEMENT_ORDER,MANIFEST_VERSION,mergeSubclassCatalog,mergeSuperOptions,subclassDefinitionsFor,superDefinitionsFor}=catalogApi;
assert.equal(MANIFEST_VERSION,'244213.26.06.29.2000-1-bnet.65583','Audited Bungie manifest version drifted');
assert.match(catalogSource,/Source: Bungie DestinyInventoryItemDefinition manifest/,'Super hash catalogue lost its Bungie provenance');
const expectedSuperHashes={
  hunter:{arc:[3769507632,3769507633,3769507635],solar:[375052468,375052469,375052471],void:[2722573681,2722573682,2722573683],stasis:[2625980631],strand:[2463983862],prismatic:[2370269384,2370269388,2370269389,2370269390,2370269391]},
  titan:{arc:[119041298,119041299],solar:[2747500760,2747500761],void:[4260353952,4260353953,4260353955],stasis:[2021620139],strand:[3574662354],prismatic:[2529942642,2529942644,2529942645,2529942646,2529942647]},
  warlock:{arc:[1081893460,1081893461],solar:[2274196884,2274196886,2274196887],void:[1656118680,1656118681,1656118682],stasis:[3683904166],strand:[1885339915],prismatic:[1869939001,1869939004,1869939005,1869939006,1869939007]}
};
const expectedSubclassHashes={
  hunter:[2328211300,2240888816,2453351420,873720784,3785442599,4282591831],
  titan:[2932390016,2550323932,2842471112,613647804,242419885,1616346845],
  warlock:[3168997075,3941205951,2849050827,3291545503,4204413574,3893112950]
};
const expectedSubclassIcons={
  arc:'949af7a61d60a8e6071282daafa9e6e9.png',
  solar:'fedcb91b7ab0584c12f0e9fec730702b.png',
  void:'32b112a9460e6f0e2b9ee15dc53fe1c1.png',
  stasis:'6e441ffa8c8171ce9caf71e51b72fc19.png',
  strand:'41c0024ce809085ac16f4e0777ea0ac4.png',
  prismatic:'8f8283c4f518dbd2239ba1f60b91d14f.png'
};
const expectedClassTotals={hunter:16,titan:14,warlock:15};
assert.equal(CLASS_NAMES.length,3,'All three Destiny character classes must be represented');
for(const characterClass of CLASS_NAMES){
  const subclasses=subclassDefinitionsFor(characterClass);
  assert.equal(subclasses.length,6,`${characterClass} must expose all six subclasses`);
  assert.deepEqual(subclasses.map(item=>item.hash),expectedSubclassHashes[characterClass],`${characterClass} subclass hashes drifted`);
  const total=ELEMENT_ORDER.reduce((count,element)=>count+superDefinitionsFor(characterClass,element).length,0);
  assert.equal(total,expectedClassTotals[characterClass],`${characterClass} Super total drifted`);
  for(const element of ELEMENT_ORDER){
    const options=superDefinitionsFor(characterClass,element);
    assert.deepEqual(options.map(item=>item.hash),expectedSuperHashes[characterClass][element],`${characterClass} ${element} Super hashes drifted`);
    for(const item of options){
      assert.ok(Number.isInteger(item.hash)&&item.hash>0,`${characterClass} ${element} contains an invalid Super hash`);
      assert.match(item.icon,/^\/common\/destiny2_content\/icons\/[a-f0-9]+\.png$/,`${item.name} lost its Bungie icon path`);
      assert.equal(item.bungieHash,item.hash,`${item.name} does not expose its exact Bungie hash`);
    }
  }
  const pickerIcons=new Map();
  const pickerButtons=ELEMENT_ORDER.map(element=>{
    const icon={style:{}};
    const button={dataset:{element},classList:{toggle(){}},querySelector:selector=>selector==='.icon'?icon:null,setAttribute(){},removeAttribute(){}};
    pickerIcons.set(element,{icon,button});
    return button;
  });
  renderSubclassPicker({root:{querySelectorAll:()=>pickerButtons},characterClass,subclass:'arc',subclassOptions:mergeSubclassCatalog([],characterClass)});
  for(const [index,element] of ELEMENT_ORDER.entries()){
    const {icon,button}=pickerIcons.get(element);
    assert.match(icon.style.backgroundImage,new RegExp(expectedSubclassIcons[element].replace('.','\\.')),`${characterClass} ${element} picker uses the wrong subclass artwork`);
    assert.equal(button.dataset.bungieHash,String(expectedSubclassHashes[characterClass][index]),`${characterClass} ${element} picker uses the wrong subclass hash`);
    assert.equal(button.disabled,false,`${characterClass} ${element} picker is not clickable`);
  }
}
assert.equal(Object.values(expectedClassTotals).reduce((sum,count)=>sum+count,0),45,'Exactly 45 current Super plug hashes must be audited');
const fallbackIcon={style:{}};
const strandButton={
  dataset:{element:'strand'},
  classList:{toggle(){}},
  querySelector:selector=>selector==='.icon'?fallbackIcon:null,
  setAttribute(){},
  removeAttribute(){}
};
const hunterCatalog=mergeSubclassCatalog([],'hunter');
renderSubclassPicker({root:{querySelectorAll:()=>[strandButton]},characterClass:'hunter',subclass:'solar',subclassOptions:hunterCatalog});
assert.match(fallbackIcon.style.backgroundImage,/41c0024ce809085ac16f4e0777ea0ac4\.png/,'Strand subclass diamond does not retain its Bungie fallback icon');
assert.equal(strandButton.disabled,false,'Verified Strand subclass must be active and clickable');
assert.equal(strandButton.dataset.bungieHash,'3785442599','Strand picker must expose the Hunter Threadrunner hash');

const prismaticIcon={style:{}};
const prismaticButton={
  dataset:{element:'prismatic'},
  classList:{toggle(){}},
  querySelector:selector=>selector==='.icon'?prismaticIcon:null,
  setAttribute(){},
  removeAttribute(){}
};
renderSubclassPicker({root:{querySelectorAll:()=>[prismaticButton]},characterClass:'titan',subclass:'void',subclassOptions:mergeSubclassCatalog([],'titan')});
assert.match(prismaticIcon.style.backgroundImage,/8f8283c4f518dbd2239ba1f60b91d14f\.png/,'Lower Prismatic picker does not use generic loadout icon hash 814121290');
assert.equal(prismaticButton.dataset.bungieArtworkHash,'814121290','Lower Prismatic picker lost its exact loadout icon hash');
assert.equal(prismaticButton.dataset.bungieArtworkSource,'DestinyLoadoutIconDefinition','Lower Prismatic picker reports the wrong manifest definition type');

const titanThundercrash=superDefinitionsFor('titan','arc')[0];
const corruptedTitanVoid=mergeSubclassCatalog([{
  hash:2932390016,
  bungieHash:2932390016,
  name:'Void Titan',
  element:'void',
  icon:'/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png',
  definition:{itemType:16,itemTypeDisplayName:'Subclass',displayProperties:{name:'Striker',icon:'/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png'}},
  subclassBuild:{super:titanThundercrash,superOptions:[titanThundercrash]}
}],'titan').find(item=>item.element==='void');
assert.equal(corruptedTitanVoid.hash,2842471112,'Titan Void accepted the stale Arc subclass hash');
assert.equal(corruptedTitanVoid.icon,'/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png','Titan Void accepted the stale Arc subclass icon');
assert.equal(corruptedTitanVoid.subclassBuild.super.hash,4260353952,'Titan Void accepted Thundercrash as its equipped Super');
assert.deepEqual(corruptedTitanVoid.subclassBuild.superOptions.map(item=>item.hash),expectedSuperHashes.titan.void,'Titan Void alternatives contain a cross-subclass Super');
const correctedTitanVoid=resolveSuperFormationSlots({activeSuper:titanThundercrash,superOptions:[titanThundercrash],subclass:'void',subclassCatalog:[corruptedTitanVoid],characterClass:'titan'});
assert.equal(correctedTitanVoid.activeSuper.hash,4260353952,'Arc-to-Void switch can still leave Thundercrash in the large and bottom diamonds');
assert.ok(correctedTitanVoid.superOptions.every(item=>expectedSuperHashes.titan.void.includes(item.hash)),'Titan Void formation still contains an Arc Super');

const everySuper=CLASS_NAMES.flatMap(characterClass=>ELEMENT_ORDER.flatMap(element=>superDefinitionsFor(characterClass,element)));
for(const characterClass of CLASS_NAMES){
  const subclassCatalog=mergeSubclassCatalog([],characterClass);
  for(const element of ELEMENT_ORDER){
    const expected=expectedSuperHashes[characterClass][element];
    const foreign=everySuper.find(item=>!expected.includes(item.hash));
    const compatible=mergeSuperOptions(characterClass,element,[foreign]);
    assert.deepEqual(compatible.map(item=>item.hash),expected,`${characterClass} ${element} accepted a foreign Super hash`);
    const mapped=resolveSuperFormationSlots({activeSuper:foreign,superOptions:[foreign],subclass:element,subclassCatalog,characterClass});
    assert.ok(expected.includes(mapped.activeSuper.hash),`${characterClass} ${element} rendered a foreign Super as active`);
    assert.ok(mapped.superOptions.every(item=>expected.includes(item.hash)),`${characterClass} ${element} rendered a foreign alternate Super`);
  }
}

for(const characterClass of CLASS_NAMES){
  const subclassCatalog=mergeSubclassCatalog([],characterClass);
  for(const element of ELEMENT_ORDER){
    const options=superDefinitionsFor(characterClass,element);
    for(const selected of options){
      const mapped=resolveSuperFormationSlots({activeSuper:selected,superOptions:options,subclass:element,subclassCatalog,characterClass});
      const bySlot=Object.fromEntries(mapped.entries.map(entry=>[entry.slot,entry]));
      assert.equal(bySlot.equipped.item.hash,selected.hash,`${characterClass} ${element}: large diamond did not accept ${selected.name}`);
      assert.equal(bySlot['alternate-5'].item.hash,selected.hash,`${characterClass} ${element}: bottom diamond did not accept ${selected.name}`);
      assert.equal(bySlot['alternate-5'].selected,true,`${characterClass} ${element}: bottom diamond lost selected state`);
      assert.equal(mapped.entries.filter(entry=>entry.selected).length,1,`${characterClass} ${element}: selected state must have one owner`);
      const sideItems=mapped.entries.filter(entry=>entry.role==='alternate-super'&&entry.item).map(entry=>entry.item.hash).sort((a,b)=>a-b);
      const expectedAlternates=options.filter(item=>item.hash!==selected.hash).map(item=>item.hash).sort((a,b)=>a-b);
      assert.deepEqual(sideItems,expectedAlternates,`${characterClass} ${element}: compatible alternatives disappeared or crossed subclasses`);
      for(const next of options.filter(item=>item.hash!==selected.hash)){
        const swapped=resolveSuperFormationSlots({activeSuper:next,superOptions:options,subclass:element,subclassCatalog,characterClass});
        const swappedBySlot=Object.fromEntries(swapped.entries.map(entry=>[entry.slot,entry]));
        assert.equal(swappedBySlot.equipped.item.hash,next.hash,`${characterClass} ${element}: clicked Super did not replace the large diamond`);
        assert.equal(swappedBySlot['alternate-5'].item.hash,next.hash,`${characterClass} ${element}: clicked Super did not replace the bottom diamond`);
        assert.ok(swapped.entries.some(entry=>entry.role==='alternate-super'&&entry.item?.hash===selected.hash),`${characterClass} ${element}: previous Super did not return to a side diamond`);
      }
    }
  }
}
assert.match(syncModule,/onSelect:item=>\{const nextBuild=/,'Character page does not stage clicked Super state');
assert.match(syncModule,/dispatchGuardianSelection/,'Character page does not publish clicked subclass/Super state');
assert.match(buildModule,/working\.super=candidate/,'Build Forge does not synchronise its top-level Super after a click');

const obsoleteFiles=[
  'guardian-main-correction.css',
  'guardian-subclass-super-polish.css',
  'guardian-subclass-super-polish.mjs',
  'guardian-diamond-formation-final.css'
];
for(const filename of obsoleteFiles){
  await assert.rejects(access(new URL(filename,PAGE_ROOT)),`${filename} still exists and can fight the shared owner`);
}

const cssFiles=(await readdir(PAGE_ROOT)).filter(name=>name.endsWith('.css')&&name!=='guardian-super-formation.css');
for(const filename of cssFiles){
  const source=await read(new URL(filename,PAGE_ROOT));
  assert.doesNotMatch(source,/super-feature__cluster|super-diamond--(?:equipped|alt[1-5])/,`${filename} still owns Super geometry`);
}

console.log('SUPER_FORMATION_SHARED_OWNER=PASS');
console.log('SUPER_FORMATION_PSD_RATIOS=PASS');
console.log('SUPER_FORMATION_MAIN_BUILD_PARITY=PASS');
console.log('SUPER_FORMATION_ALL_CLASS_HASH_CATALOG=PASS');
console.log('SUPER_FORMATION_CROSS_SUBCLASS_REJECTION=PASS');
console.log('TITAN_VOID_STALE_ARC_REJECTION=PASS');
console.log('SUPER_FORMATION_CLICK_SWAP=PASS');
console.log('SUPER_FORMATION_EQUIPPED_DUPLICATION=PASS');
console.log('SUBCLASS_PICKER_STRAND_MAPPING=PASS');
console.log('SUBCLASS_PICKER_ALL_CLASS_HASHES=PASS');
console.log('SUBCLASS_PICKER_PRISMATIC_GENERIC_HASH=PASS');
console.log('EQUIPPED_SUBCLASS_HEADER_AND_PADDING=PASS');
console.log('SUPER_FORMATION_ROTATED_BOUNDS=PASS');
console.log('SUPER_FORMATION_RESPONSIVE_SOURCE=PASS');
console.log('SUBCLASS_HEADER_ICON_PROVENANCE=PASS');
console.log('SUBCLASS_HEADER_ICON_ALIGNMENT=PASS');
