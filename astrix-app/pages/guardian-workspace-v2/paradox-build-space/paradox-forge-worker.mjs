import {createEnginePrecomputer} from '../../../core/engine-precompute.mjs?v=20260927-1&recovery=20260927-3';
import {beginEngineTiming} from '../../../core/engine-timing.mjs?v=20260927-1';
import {prepareForgeSequence} from './paradox-forge-sequence.mjs?v=20260916-weapon-combinations-2&entry=20260921-direct-1&plain=20260925-2&flow=20260926-1&perf=20260927-1&anchor=20260927-1';
import {forgePreparationKey as keyOf} from './paradox-forge-preparation.mjs?v=20260916-weapon-combinations-2&entry=20260921-direct-1&plain=20260925-2&flow=20260926-1&perf=20260927-1&anchor=20260927-1';

const objectives=new Set(['balanced','dps','add-clear','survivability','ability-uptime']);

// One CPU job at a time; no persistent storage, credentials or live equip calls.
export function createForgeWorkerHandler(post,{compute=prepareForgeSequence}={}){
  const precompute=createEnginePrecomputer();
  let context=null,queue=[],running=false,runningKey='';
  const prepared=new Set();
  async function pump(){
    if(running||!context||!queue.length)return;
    running=true;
    const job=queue.shift(),snapshot=context,key=keyOf(job);
    runningKey=key;
    post({type:'started',revision:snapshot.revision,key});
    try{
      if(!objectives.has(job.objective||'balanced'))throw new Error('Unsupported build objective.');
      const candidate=snapshot.candidates.find(item=>item.element===job.element)?.candidate;
      if(!candidate)throw new Error('No compatible subclass for this element.');
      const timing=beginEngineTiming('generate.worker');
      const precomputed=precompute(snapshot.build);timing.mark('precompute');
      const result=await compute({...snapshot,...job,candidate,precomputed,currentSeasonNumber:snapshot.season},{onProgress:message=>{timing.mark(message);post({type:'progress',revision:snapshot.revision,key,message});}});
      const measured=timing.end();
      if(context===snapshot){
        if(prepared.size>=32)prepared.delete(prepared.values().next().value);
        prepared.add(key);
        const selection=result.patch?.weaponSelectionRecommendation;
        if(selection?.combinations?.length>1){
          const first={...result,patch:{...result.patch,weaponSelectionRecommendation:{...selection,combinations:selection.combinations.slice(0,1)}}};
          post({type:'first',revision:snapshot.revision,key,result:first,timing:measured});
          await new Promise(resolve=>setTimeout(resolve,0));
          if(context!==snapshot)return;
        }
        post({type:'ready',revision:snapshot.revision,key,result,timing:measured,bytes:new TextEncoder().encode(JSON.stringify(result)).byteLength});
      }
    }catch(error){if(context===snapshot)post({type:'error',revision:snapshot.revision,key,message:error?.message||'Background build preparation failed.'});}
    finally{running=false;runningKey='';setTimeout(pump,0);}
  }
  return message=>{
    if(message.type==='init'){context=message;queue=[];prepared.clear();return;}
    if(!context||message.revision!==context.revision)return;
    if(message.type==='prepare'){
      const incoming=(message.jobs||[]).slice(0,12);
      const keys=new Set(incoming.map(keyOf));
      queue=[...incoming.filter(job=>keyOf(job)!==runningKey&&(message.requested||!prepared.has(keyOf(job)))),...queue.filter(job=>!keys.has(keyOf(job)))].slice(0,12);
      void pump();
    }
  };
}

if(typeof self!=='undefined'&&typeof self.postMessage==='function'&&typeof document==='undefined'){
  const receive=createForgeWorkerHandler(message=>self.postMessage(message));
  self.addEventListener('message',event=>receive(event.data));
}
