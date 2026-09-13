import {prepareForgeSequence} from './paradox-forge-sequence.mjs?v=20260910-generate-termination-1';

const objectives=new Set(['balanced','dps','add-clear','survivability','ability-uptime']);
const keyOf=v=>JSON.stringify([v.element,v.objective||'balanced',Number(v.superHash)||0]);

// One CPU job at a time; no persistent storage, credentials or live equip calls.
export function createForgeWorkerHandler(post,{compute=prepareForgeSequence}={}){
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
      if(!candidate)throw new Error('No compatible verified subclass for this element.');
      const result=await compute({...snapshot,...job,candidate,currentSeasonNumber:snapshot.season},{onProgress:message=>post({type:'progress',revision:snapshot.revision,key,message})});
      if(context===snapshot){
        if(prepared.size>=32)prepared.delete(prepared.values().next().value);
        prepared.add(key);
        post({type:'ready',revision:snapshot.revision,key,result,bytes:new TextEncoder().encode(JSON.stringify(result)).byteLength});
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
