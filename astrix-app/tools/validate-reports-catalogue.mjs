import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REPORTS_SCHEMA,validateReleaseCoverage} from '../../forge-auth-worker/src/reports-catalogue.ts';
import {releaseOrder} from '../../forge-auth-worker/src/reports-release-order.ts';
const raw=await readFile(new URL('./fixtures/reports-catalogue-current.json',import.meta.url));
const catalogue=JSON.parse(raw);
assert.equal(catalogue.schema,REPORTS_SCHEMA);
assert.ok(catalogue.version);
validateReleaseCoverage(catalogue.activities);
assert.ok(catalogue.activities.some(row=>row.series==='raids'));
assert.ok(catalogue.activities.some(row=>row.series==='dungeons'));
for(const row of catalogue.activities){
  assert.deepEqual(Object.keys(row).sort(),['difficulty','hash','name','pgcrImage','releaseOrder','series']);
  assert.match(row.hash,/^\d+$/);
  assert.ok(row.pgcrImage===''||row.pgcrImage.startsWith('/img/'));
  if(['raids','dungeons','exotic'].includes(row.series))assert.equal(row.releaseOrder,releaseOrder(row.series,row.name));
}
assert.throws(()=>validateReleaseCoverage([{series:'raids',name:'Missing raid',releaseOrder:null}]),/Missing Reports release order/);
assert.throws(()=>validateReleaseCoverage([{series:'dungeons',name:'Missing dungeon',releaseOrder:null}]),/Missing Reports release order/);
console.log(`REPORTS_CATALOGUE=PASS version=${catalogue.version} bytes=${raw.byteLength} activities=${catalogue.activities.length}`);
