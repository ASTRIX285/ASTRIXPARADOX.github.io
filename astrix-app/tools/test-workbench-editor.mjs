// WorkBench editor (brief 6): every gear slot takes and drops an item, pending items are
// blocked, rolls stay inside catalogue min and max, share links and reloads keep the build,
// and the page carries the required disclaimers and no unapproved art.
// Fixture items below are synthetic and exist only in this test; the page never sees them.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {CATALOGUE_FILES, buildCatalogue} from '../games/division/catalogue.mjs';
import {createDivisionModule} from '../games/division/index.mjs';
import {createManualAdapter} from '../platform/adapters/division/manual.mjs';
import {OBJECTIVES, PLATFORM_KEY, STORAGE_KEY, coreCounts, loadPlatform, openingBuild, pieceCounts, saveBuild, savePlatform, shareLink} from '../pages/workbench/workbench-state.mjs';
import {PLATFORMS} from '../core/build-format/build.mjs';

const dataDir=new URL('../games/division/td2/data/',import.meta.url);
const files=readdirSync(dataDir).filter(name=>name.endsWith('.json')).sort();
assert.deepEqual([...CATALOGUE_FILES.td2].sort(),files,'catalogue.mjs lists every TD2 data file, so nothing added to the catalogue is missed by the page');
const texts=CATALOGUE_FILES.td2.map(name=>readFileSync(new URL(name,dataDir),'utf8'));
const real=buildCatalogue('td2',texts);
assert.match(real.catalogueVersion,/^td2-[0-9a-f]{8}$/,'Catalogue version is a fingerprint of the catalogue files');
assert.equal(buildCatalogue('td2',texts).catalogueVersion,real.catalogueVersion,'Same files give the same catalogue version');

// The real catalogue: six sourced gear slots, three core attributes, everything else pending.
const realModule=createDivisionModule(real);
const gearSlots=realModule.listSlots('gear');
assert.deepEqual(gearSlots.map(slot=>slot.id),['mask','chest','holster','backpack','gloves','kneepads'],'Gear slots come from the catalogue');
assert.deepEqual(realModule.listCoreAttributes().map(core=>core.id),['weapon-damage','armor','skill-tier']);
for(const group of ['weapon','skill'])assert.equal(realModule.listSlots(group).pending,true,`${group} slots stay pending until sourced`);
assert.deepEqual(realModule.listSpecializations(),[],'No specializations until sourced');
for(const slot of gearSlots)assert.deepEqual(realModule.listOptions(slot.id),[],`No items for ${slot.id} until sourced`);
assert.equal(realModule.attributeRange('weapon-damage').pending,true,'Weapon Damage roll stays pending');
assert.deepEqual(realModule.attributeRange('skill-tier'),{min:1,max:1,unit:'tier'},'Skill Tier roll comes from the catalogue');

// Fixture catalogue: the real slots and attributes plus synthetic test items.
const capture={kind:'in-game-capture',capturedBy:'Test',capturedOn:'2026-10-05',gameVersion:'TU-test',where:'Test fixture',note:'Synthetic, test only.'};
const fixture={...real,
  items:[
    ...gearSlots.map(slot=>({id:`fixture-${slot.id}`,name:`Fixture ${slot.name}`,provenance:capture,rarity:'named',itemType:'gear',slotId:slot.id})),
    {id:'fixture-unsourced-slot',name:'Fixture Unsourced',provenance:capture,rarity:'exotic',itemType:'gear',slotId:{pending:true,reason:'Slot not captured yet.'}}
  ],
  brands:[
    {id:'fixture-brand',name:'Fixture Brand',provenance:capture,slotIds:gearSlots.map(slot=>slot.id)},
    {id:'fixture-brand-pending',name:'Fixture Pending Brand',provenance:capture,slotIds:{pending:true,reason:'Slots not captured yet.'}}
  ]
};
const module=createDivisionModule(fixture);
const adapter=createManualAdapter({module,title:'td2',catalogueVersion:fixture.catalogueVersion});
let {build}=await adapter.load({platform:'pc'});
assert.equal(build.platform,'pc','A new build carries the device platform');
assert.equal(build.catalogueVersion,fixture.catalogueVersion,'A new build records the catalogue it was made against');

// Add and remove an item in every gear slot.
for(const slot of gearSlots){
  const added=adapter.equip(build,slot.id,`fixture-${slot.id}`);
  assert.equal(added.ok,true,`${slot.id}: a sourced item equips`);
  assert.equal(added.build.slots[slot.id].itemId,`fixture-${slot.id}`);
  const removed=adapter.unequip(added.build,slot.id);
  assert.deepEqual(removed.build.slots,{},`${slot.id}: remove empties the slot`);
}
assert.equal(adapter.equip(build,'mask','fixture-chest').ok,false,'An item cannot go in another slot');

// Pending and missing items are blocked with a reason.
for(const [slot,item,why] of [['mask','fixture-unsourced-slot','slot pending'],['mask','fixture-brand-pending','brand slots pending'],['mask','not-in-catalogue','missing']]){
  const result=adapter.equip(build,slot,item);
  assert.equal(result.ok,false,`${why}: blocked`);
  assert.ok(result.reason.length>0,`${why}: says why`);
}
const options=module.listOptions('mask');
assert.ok(options.find(row=>row.id==='fixture-unsourced-slot'&&!row.equippable&&row.reason),'The picker shows pending items as not equippable, with the reason');
assert.ok(options.find(row=>row.id==='fixture-brand'&&row.equippable),'A brand covering the slot can be picked');

// Brand pieces count up; core attributes count up only inside catalogue ranges.
for(const slot of ['mask','chest','holster'])build=adapter.equip(build,slot,'fixture-brand').build;
assert.deepEqual(pieceCounts(build,module),[{id:'fixture-brand',name:'Fixture Brand',count:3,pending:false}],'Three brand pieces counted');
let step=adapter.setAttribute(build,'mask','skill-tier',1);
assert.equal(step.ok,true,'Skill Tier 1 is inside the catalogue range');
build=step.build;
assert.equal(adapter.setAttribute(build,'chest','skill-tier',2).ok,false,'A roll above the catalogue max is refused');
assert.equal(adapter.setAttribute(build,'chest','weapon-damage',10).ok,false,'A roll with no sourced range is refused');
assert.equal(adapter.setAttribute(build,'gloves','skill-tier',1).ok,false,'An empty slot cannot take a roll');
assert.deepEqual(coreCounts(build,module).map(row=>[row.id,row.count]),[['weapon-damage',0],['armor',0],['skill-tier',1]],'Core counts follow the rolls');
build=adapter.clearAttribute(build,'mask','skill-tier').build;
assert.equal(coreCounts(build,module).find(row=>row.id==='skill-tier').count,0,'Clearing a roll lowers the count');
build=adapter.rename(build,'Fixture build').build;
build=adapter.setObjective(build,OBJECTIVES[0].id).build;
assert.equal(OBJECTIVES.length,5,'Five objectives');

// Share link round trip, and a reload keeps the build.
const link=shareLink(build,'https://astrixparadox.com');
assert.match(link,/^https:\/\/astrixparadox\.com\/hub\/workbench\/td2\/\?b=1\.[A-Za-z0-9_-]+$/,'Share link uses the WorkBench route');
const fromLink=await openingBuild({search:link.slice(link.indexOf('?')),storage:null,adapter,platform:'pc'});
assert.deepEqual(fromLink,{build,source:'link',notice:'',foreign:false},'Opening a share link gives back the identical build');

const store=new Map();
const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
assert.equal(saveBuild(storage,build),true);
assert.ok(store.has(STORAGE_KEY));
const reloaded=await openingBuild({search:'',storage,adapter,platform:'pc'});
assert.deepEqual(reloaded,{build,source:'saved',notice:'',foreign:false},'A reload brings back the saved build');
assert.equal(JSON.parse(store.get(STORAGE_KEY)).platform,'pc','The saved build carries its platform');
const broken=await openingBuild({search:'?b=1.not-a-build',storage,adapter,platform:'pc'});
assert.equal(broken.source,'saved','A broken link falls back to the saved build');
assert.match(broken.notice,/could not be read/,'A broken link says so');
const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
assert.equal(saveBuild(blocked,build),false,'Blocked storage is reported, not thrown');
assert.equal((await openingBuild({search:'',storage:blocked,adapter,platform:'xbox'})).source,'new','Blocked storage opens a new build');

// Platform: remembered per device, never assumed, carried by every saved build and share link.
const device=new Map();
const deviceStore={getItem:key=>device.get(key)??null,setItem:(key,value)=>device.set(key,value)};
assert.equal(loadPlatform(deviceStore),null,'No platform until the player picks one');
const firstVisit=await openingBuild({search:'',storage:deviceStore,adapter,platform:loadPlatform(deviceStore)});
assert.deepEqual({build:firstVisit.build,source:firstVisit.source},{build:null,source:'needs-platform'},'A first visit asks for a platform instead of assuming one');
assert.equal(savePlatform(deviceStore,'switch'),false,'An unknown platform is not remembered');
assert.equal(savePlatform(deviceStore,'playstation'),true);
assert.equal(device.get(PLATFORM_KEY),'playstation');
assert.equal(loadPlatform(deviceStore),'playstation','The platform is remembered on this device');
assert.equal(loadPlatform(blocked),null,'Blocked storage gives no platform rather than a guess');
const mine=(await openingBuild({search:'',storage:deviceStore,adapter,platform:'playstation'})).build;
assert.equal(mine.platform,'playstation','A new build is made on the remembered platform');
for(const platform of PLATFORMS){
  const onPlatform=adapter.duplicate(build,platform).build;
  const opened=await openingBuild({search:shareLink(onPlatform,'https://astrixparadox.com').replace(/^[^?]+/,''),storage:null,adapter,platform:'playstation'});
  assert.equal(opened.build.platform,platform,`A ${platform} share link opens on ${platform}`);
  assert.equal(opened.foreign,platform!=='playstation',`A ${platform} build is ${platform==='playstation'?'yours':'shared from another platform'} on a PlayStation device`);
  const store2=new Map();
  saveBuild({setItem:(key,value)=>store2.set(key,value)},onPlatform);
  assert.equal(JSON.parse(store2.get(STORAGE_KEY)).platform,platform,`A saved ${platform} build keeps its platform`);
}
const sharedPc=(await openingBuild({search:shareLink(build,'https://astrixparadox.com').replace(/^[^?]+/,''),storage:null,adapter,platform:'xbox'}));
assert.equal(sharedPc.foreign,true,'A PC build opened on an Xbox device opens as a shared build');
const copied=adapter.duplicate(sharedPc.build,'xbox');
assert.equal(copied.build.platform,'xbox','It can be duplicated onto your platform');
assert.deepEqual({...copied.build,platform:'pc'},sharedPc.build,'The duplicate keeps everything else');
assert.equal(sharedPc.build.platform,'pc','The shared build itself is unchanged');

// The page: disclaimers, no unapproved art, typography, plain module path.
const page=readFileSync(new URL('../../hub/workbench/td2/index.html',import.meta.url),'utf8');
const divisionFooter=JSON.parse(readFileSync(new URL('../games/division/footer.json',import.meta.url),'utf8'));
for(const line of divisionFooter.lines)assert.ok(page.includes(line),`Division footer line present word for word: ${line.slice(0,50)}`);
assert.doesNotMatch(page,/Bungie/,'No Bungie line on a Division page');
const images=[...page.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match=>match[1]);
assert.ok(images.every(src=>src==='/img/ax-logo-160.webp'),`Only the ASTRIX logo, no game art: ${images.join(', ')}`);
assert.doesNotMatch(page,/divition|ubisoft[^"]*\.(?:jpe?g|png|webp)|url\(/i,'No Ubisoft or Division image on the page');
assert.ok(page.includes('https://use.typekit.net/tnp6kbq.css')&&page.includes('/css/astrix-site-typography.css'),'Site typography loaded');
assert.match(page,/<script type="importmap" data-module-versions>/,'The page carries a generated import map like every other tool page');
assert.match(page,/<script type="module" src="\/astrix-app\/pages\/workbench\/workbench\.mjs\?v=[0-9a-f]{10}"><\/script>/,'One module entry, stamped by build-module-versions.mjs');
for(const name of CATALOGUE_FILES.td2)assert.ok(page.includes(`<link rel="preload" href="/astrix-app/games/division/td2/data/${name}" as="fetch" crossorigin>`),`${name} is preloaded, so the catalogue does not wait for the modules`);
const css=readFileSync(new URL('../pages/workbench/workbench.css',import.meta.url),'utf8');
assert.doesNotMatch(css,/url\(/,'No background art in the WorkBench styles');
assert.doesNotMatch(page+css+readFileSync(new URL('../pages/workbench/workbench.mjs',import.meta.url),'utf8'),/[\u2013\u2014]/,'No en or em dashes in WorkBench copy');

console.log('WORKBENCH_EDITOR=PASS every gear slot, pending blocked, rolls in range, share link and reload round trips');
