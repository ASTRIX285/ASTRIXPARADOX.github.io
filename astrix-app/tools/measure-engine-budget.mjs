import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {build,candidates,variant} from './fixtures/engine-budget.mjs';
import {prepareForgeSequence} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-sequence.mjs';
import {selectOwnedWeapons} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {createForgeLoaderBuildSnapshot} from '../pages/forge-loader/forge-loader-build-handoff.mjs';
import {loadPreparedPagePayload,requestPreparedPagePayload} from '../core/prepared-page-client.mjs';
import {PAGE_PROFILE_DATA,PAGE_VIEWS} from '../core/page-ready-contract.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const forge=JSON.parse(await readFile(new URL('../data/forge-armour-index.json',import.meta.url),'utf8'));
const profile={};for(const path of PAGE_PROFILE_DATA.character){let target=profile;const keys=path.split('.');for(const key of keys.slice(0,-1))target=target[key]||=( {});target[keys.at(-1)]={};}
profile.characters.data={'1':{characterId:'1',classType:0,stats:{}}};
export const payload={profile,definitions:Object.fromEntries(Object.entries({...forge.definitions,...forge.plugDefinitions}).slice(0,4000)),statDefinitions:forge.statDefinitions,artifactCatalog:forge.artifactCatalog,definitionCoverage:{complete:true,unresolved:[]},characterBuildCoverage:{schemaVersion:2,complete:true,missing:[]},pageReady:{page:'character',definitionSource:'prepared-bulk-manifest',manifestVersion:forge.manifestVersion,views:PAGE_VIEWS.character,coverage:{complete:true,missing:[]}}};
const wire=JSON.stringify(payload);
export const largeBuild={...build,ownedWeapons:Array.from({length:600},(_,i)=>({...build.ownedWeapons[i%build.ownedWeapons.length],itemInstanceId:String(900000+i)}))};
const measure=async(fn,n=5)=>{const rows=[];for(let i=0;i<n;i++){const start=performance.now();await fn();rows.push(performance.now()-start);}return {maxMs:+Math.max(...rows).toFixed(2),medianMs:+rows.sort((a,b)=>a-b)[Math.floor(n/2)].toFixed(2)};};
export async function measureEngine(){
 const result={};
 result.profileCold=await measure(()=>requestPreparedPagePayload('character',{quiet:true,fetchImpl:async()=>{await wait(200);return {ok:true,json:async()=>JSON.parse(wire)};}}));
 result.profileWarm=await measure(()=>loadPreparedPagePayload({},'character',{quiet:true,publish:false,sharedPayload:payload}));
 result.handoffPack=await measure(()=>createForgeLoaderBuildSnapshot(largeBuild,build));
 result.weaponRanking=await measure(()=>selectOwnedWeapons({build:largeBuild,objective:'dps'}));
 result.generate=await measure(()=>prepareForgeSequence({build:largeBuild,candidate:candidates[0].candidate,...variant,currentSeasonNumber:31},{advise:async()=>{}}));
 return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log('ENGINE_TIMINGS',JSON.stringify(await measureEngine()));
