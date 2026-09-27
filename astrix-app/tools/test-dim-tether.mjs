import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dimShareRoute} from '../../forge-auth-worker/src/dim-share.ts';
import {resolveDimLoadout} from '../core/dim-import/resolve.mjs';
const read=name=>readFile(new URL(`./fixtures/dim-import/${name}.json`,import.meta.url),'utf8').then(JSON.parse);
const fixture=await read('tether'),snapshot=await read('tether-manifest');
let loadout=fixture.loadout;
if(process.env.DIM_LIVE_SMOKE==='1'){
 const {execFileSync}=await import('node:child_process');
 const upstream=async url=>{const raw=execFileSync('curl',['-fsS','--max-time','20',String(url)],{maxBuffer:1024*1024});return new Response(raw,{headers:{'Content-Type':'application/json'}});};
 const cache={match:async()=>undefined,put:async()=>{}};
 const request=new Request('https://auth.astrixparadox.com/dim/share/qq4sfyi');
 const response=process.env.DIM_SMOKE_BASE_URL?await upstream(new URL('/dim/share/qq4sfyi',process.env.DIM_SMOKE_BASE_URL)):await dimShareRoute(request,cache,upstream);
 assert.equal(response.status,200);loadout=(await response.json()).loadout;
 assert.equal(loadout.name,'Tether Perfected');
}
assert.equal(loadout.parameters.artifactUnlocks.seasonNumber,26);
const model=resolveDimLoadout(loadout,{snapshot});
assert.equal(model.coverage.rate,1);assert.deepEqual(model.coverage.unresolved,[]);
const retired=model.items.find(row=>row.kind==='parameters').groups.find(row=>row.label==='Artifact unlocks').plugs;
assert.equal(retired.length,12);for(const plug of retired){assert.equal(plug.retired,true);assert.match(plug.name,/^Retired: .+/);assert.notEqual(plug.unresolved,true);}
console.log(`DIM_TETHER=PASS resolved=${model.coverage.resolved}/${model.coverage.requested} unknowns=0 retired_artifact_perks=${retired.length} mode=${process.env.DIM_LIVE_SMOKE==='1'?(process.env.DIM_SMOKE_BASE_URL?'deployed-route':'worker-route-live-upstream'):'offline'}`);
