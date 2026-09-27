import {createForgeLoaderBuildSnapshot} from '../pages/forge-loader/forge-loader-build-handoff.mjs?v=20260906-review-layout-1';
import {createEnginePrecomputer} from './engine-precompute.mjs?v=20260927-1&recovery=20260927-1';
const prepare=createEnginePrecomputer();
export function handleEngineHandoff({id,build,binding},post){
  try{const index=prepare(build);post({id,result:createForgeLoaderBuildSnapshot(build,binding),counts:{hashes:index.inventoryByHash.size,weaponModels:index.weaponModels.size,armourStats:index.armourStats.size}});}
  catch(error){post({id,error:error?.message||'Build handoff preparation failed.'});}
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>handleEngineHandoff(event.data,message=>self.postMessage(message));
