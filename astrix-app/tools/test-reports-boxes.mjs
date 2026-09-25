import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boxRows} from '../pages/reports/reports-boxes.mjs';
import {slimCatalogue,viewModel} from '../pages/reports/reports-model.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/reports-catalogue-current.json',import.meta.url),'utf8'));
const snapshot={characters:[],aggregates:{},catalogue:slimCatalogue(raw.activities)};
const raids=viewModel(snapshot,'raids').activities;
const pantheon=raids.find(row=>row.name==='The Pantheon');assert.equal(boxRows(pantheon).length,14);
for(const activity of raids)assert.ok(boxRows(activity).every(row=>row.difficulty!=='-'));
for(const name of ['Deep Stone Crypt','Garden of Salvation','Scourge of the Past'])assert.ok(boxRows(raids.find(row=>row.name===name)).some(row=>row.difficulty==='Normal'),name);
assert.deepEqual(boxRows({difficulties:[{difficulty:'-',cleared:2,releaseOrder:1},{difficulty:'Master',cleared:5,releaseOrder:1},{difficulty:'Expert',cleared:5,releaseOrder:2}]}).map(row=>row.difficulty),['Expert','Master','Normal']);
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
console.log('REPORTS_BOXES=PASS');
