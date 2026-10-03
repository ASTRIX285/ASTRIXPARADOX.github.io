import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boxRows} from '../pages/reports/reports-boxes.mjs';
import {slimCatalogue,viewModel,SERIES} from '../pages/reports/reports-model.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/reports-catalogue-current.json',import.meta.url),'utf8'));
const snapshot={characters:[],aggregates:{},catalogue:slimCatalogue(raw.activities)};
const raids=viewModel(snapshot,'raids').activities;
const pantheon=raids.find(row=>row.name==='The Pantheon');
// Completed only (3 Oct 2026): rows with clears; Normal and Standard are one Standard; encounters
// (Pantheon bosses) collapse to one total.
for(const activity of raids)assert.deepEqual(boxRows(activity),[],'No clears, no rows');
assert.deepEqual(boxRows({difficulties:[{difficulty:'-',cleared:2},{difficulty:'Master',cleared:5},{difficulty:'Expert',cleared:5},{difficulty:'Legend',cleared:0}]}).map(row=>row.difficulty),['Expert','Master','Total']);
assert.deepEqual(boxRows({difficulties:[{difficulty:'Normal',cleared:1,fastest:300},{difficulty:'Standard',cleared:2,fastest:200}]}).map(row=>[row.difficulty,row.cleared,row.fastest]),[['Standard',3,200]]);
assert.deepEqual(boxRows({difficulties:pantheon.difficulties.map((row,i)=>({...row,cleared:i<2?1:0}))}).map(row=>[row.difficulty,row.cleared]),[['Total',2]]);
assert.equal(pantheon.difficulties.length,14,'Presentation never mutates source rows');
const exotic=viewModel(snapshot,'exotic').activities;
assert.deepEqual(exotic.find(row=>row.name==='Oblation').difficulties.map(row=>row.difficulty).sort(),['-','Bloodline','Immolation','Soulfed'].sort());
assert.ok(exotic.find(row=>row.name==="Kell's Fall").difficulties.some(row=>row.difficulty==='Diffraction · Expert'));
assert.ok(exotic.find(row=>row.name==='Encore').difficulties.some(row=>row.difficulty==='Coda · Standard'));
for(const name of ['Oblation','Encore','Presage'])assert.ok(!exotic.find(row=>row.name===name).image.endsWith('/placeholder.jpg'),name);
const synthetic=slimCatalogue([
 {hash:'1',series:'story',name:'A',difficulty:'-',pgcrImage:'/img/shared.jpg',releaseOrder:1},
 {hash:'2',series:'story',name:'A: Chapter',difficulty:'Expert',pgcrImage:'/img/a.jpg',releaseOrder:2},
 {hash:'3',series:'story',name:'B',difficulty:'Normal',pgcrImage:'/img/shared.jpg',releaseOrder:1},
 {hash:'4',series:'story',name:'Unknown: Chapter',difficulty:'Normal',pgcrImage:'/img/b.jpg',releaseOrder:1}
]);
assert.equal(synthetic.length,3);assert.equal(synthetic.find(row=>row.name==='A').variants.length,2);
assert.equal(synthetic.find(row=>row.name==='A').releaseOrder,1);
assert.equal(synthetic.find(row=>row.name==='A').image,'https://www.bungie.net/img/a.jpg');
assert.ok(synthetic.some(row=>row.name==='Unknown: Chapter'));
// Art (3 Oct 2026): no two activities on one tab share an image unless Bungie gives every one of them
// that pgcrImage. Bungie's generic placeholder.jpg never shows; a Conquest borrows its base strike's art.
const shared=[];
for(const series of SERIES){
 const groups=snapshot.catalogue.filter(row=>row.series===series.id&&row.image),byImage=new Map();
 for(const group of groups){if(!byImage.has(group.image))byImage.set(group.image,[]);byImage.get(group.image).push(group);}
 for(const [image,list] of byImage)if(list.length>1){
  assert.ok(list.every(group=>group.imageCandidates.includes(image)),`${series.id}: ${list.map(g=>g.name).join(', ')} share ${image}, which Bungie did not give all of them`);
  shared.push(`${series.id}: ${image.split('/').pop()} (${list.map(g=>g.name).join(', ')})`);
 }
 assert.ok(!groups.some(group=>/\/placeholder\.jpg$/.test(group.image)),`${series.id}: no generic placeholder art on a tile`);
}
assert.equal(snapshot.catalogue.find(row=>row.id==='conquests:arms dealer').image,'https://www.bungie.net/img/destiny_content/pgcr/strike_the_arms_dealer.jpg','A Conquest uses its base strike art');
assert.equal(snapshot.catalogue.find(row=>row.id==='conquests:defiant edz').artFallback,true,'No Bungie art: series fallback');
console.log(`REPORTS_ART_SHARED_BY_BUNGIE=${shared.length}${shared.length?`\n  ${shared.join('\n  ')}`:''}`);
console.log(`REPORTS_ART_FALLBACK=${snapshot.catalogue.filter(row=>row.artFallback&&row.series!=='story').map(row=>`${row.series}/${row.name}`).join(', ')}; story ${snapshot.catalogue.filter(row=>row.artFallback&&row.series==='story').length}`);
console.log('REPORTS_BOXES=PASS');
