import {createForgeLoaderBuildSnapshot} from '../pages/forge-loader/forge-loader-build-handoff.mjs?v=b90a8f2688';
import {createEnginePrecomputer} from './engine-precompute.mjs?v=d92f1302b8';
const prepare=createEnginePrecomputer();
export function handleEngineHandoff({id,build,binding},post){
  try{const index=prepare(build);post({id,result:createForgeLoaderBuildSnapshot(build,binding),counts:{hashes:index.inventoryByHash.size,weaponModels:index.weaponModels.size,armourStats:index.armourStats.size}});}
  catch(error){post({id,error:error?.message||'Build handoff preparation failed.'});}
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>handleEngineHandoff(event.data,message=>self.postMessage(message));
