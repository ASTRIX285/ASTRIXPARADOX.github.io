// WorkBench editor (brief 6): every gear slot takes and drops an item, pending items are
// blocked, rolls stay inside catalogue min and max, share links and reloads keep the build,
// and the page carries the required disclaimers and no unapproved art.
// Fixture items below are synthetic and exist only in this test; the page never sees them.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {CATALOGUE_FILES, buildCatalogue} from '../games/division/catalogue.mjs';
import {createDivisionModule} from '../games/division/index.mjs';
import {createManualAdapter} from '../platform/adapters/division/manual.mjs';
import {OBJECTIVES, STORAGE_KEY, coreCounts, openingBuild, pieceCounts, saveBuild, shareLink} from '../pages/workbench/workbench-state.mjs';

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
let {build}=await adapter.load();
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
const fromLink=await openingBuild({search:link.slice(link.indexOf('?')),storage:null,adapter});
assert.deepEqual(fromLink,{build,source:'link',notice:''},'Opening a share link gives back the identical build');

const store=new Map();
const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
assert.equal(saveBuild(storage,build),true);
assert.ok(store.has(STORAGE_KEY));
const reloaded=await openingBuild({search:'',storage,adapter});
assert.deepEqual(reloaded,{build,source:'saved',notice:''},'A reload brings back the saved build');
const broken=await openingBuild({search:'?b=1.not-a-build',storage,adapter});
assert.equal(broken.source,'saved','A broken link falls back to the saved build');
assert.match(broken.notice,/could not be read/,'A broken link says so');
const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
assert.equal(saveBuild(blocked,build),false,'Blocked storage is reported, not thrown');
assert.equal((await openingBuild({search:'',storage:blocked,adapter})).source,'new','Blocked storage opens a new build');

// The page: disclaimers, no unapproved art, typography, plain module path.
const page=readFileSync(new URL('../../hub/workbench/td2/index.html',import.meta.url),'utf8');
assert.ok(page.includes('Unofficial fan-made tool. Not affiliated with or endorsed by Ubisoft or Massive Entertainment.'),'Unofficial Ubisoft disclaimer in the footer');
assert.ok(page.includes('Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.'),'Site-wide Bungie attribution kept');
const images=[...page.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match=>match[1]);
assert.ok(images.every(src=>src==='/img/ax-logo-160.webp'),`Only the ASTRIX logo, no game art: ${images.join(', ')}`);
assert.doesNotMatch(page,/divition|ubisoft[^"]*\.(?:jpe?g|png|webp)|url\(/i,'No Ubisoft or Division image on the page');
assert.ok(page.includes('https://use.typekit.net/tnp6kbq.css')&&page.includes('/css/astrix-site-typography.css'),'Site typography loaded');
assert.ok(page.includes('<script type="module" src="/astrix-app/pages/workbench/workbench.mjs"></script>'),'One module entry, plain path');
assert.doesNotMatch(page,/\.mjs\?v=/,'No hand-written ?v= on a JS import');
for(const name of CATALOGUE_FILES.td2)assert.ok(page.includes(`<link rel="preload" href="/astrix-app/games/division/td2/data/${name}" as="fetch" crossorigin>`),`${name} is preloaded, so the catalogue does not wait for the modules`);
const css=readFileSync(new URL('../pages/workbench/workbench.css',import.meta.url),'utf8');
assert.doesNotMatch(css,/url\(/,'No background art in the WorkBench styles');
assert.doesNotMatch(page+css+readFileSync(new URL('../pages/workbench/workbench.mjs',import.meta.url),'utf8'),/[\u2013\u2014]/,'No en or em dashes in WorkBench copy');

console.log('WORKBENCH_EDITOR=PASS every gear slot, pending blocked, rolls in range, share link and reload round trips');
