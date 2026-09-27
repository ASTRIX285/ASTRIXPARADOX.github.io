let worker=null,next=0,ready=false,bootTimer=null,active=0;
const pending=new Map();
function reset(error){
  worker?.terminate();worker=null;ready=false;active=0;clearTimeout(bootTimer);bootTimer=null;
  for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();
}
function dispatch(){
  if(!worker||!ready||active||!pending.size)return;
  const [id,task]=pending.entries().next().value;active=id;
  // The processing deadline covers execution, not module downloads or another task's queue time.
  task.timer=setTimeout(()=>reset(new Error('Profile processing timed out. Retry loading the profile.')),4000);
  try{worker.postMessage({id,type:task.type,...task.input});}
  catch(error){clearTimeout(task.timer);pending.delete(id);active=0;task.reject(error);dispatch();}
}
export function runProfileTask(type,input){
  return new Promise((resolve,reject)=>{
    const id=++next;pending.set(id,{type,input,resolve,reject,timer:null});
    if(!worker){
      try{
        const current=worker=new Worker(new URL('./engine-profile-worker.mjs?v=20260927-1&recovery=20260927-4',import.meta.url),{type:'module',name:'paradox-profile'});
        bootTimer=setTimeout(()=>reset(new Error('Profile worker startup timed out. Retry loading the profile.')),15000);
        current.onmessage=({data})=>{
          if(worker!==current)return;
          if(data.type==='ready'){ready=true;clearTimeout(bootTimer);bootTimer=null;dispatch();return;}
          if(data.id!==active)return;
          const task=pending.get(data.id);if(!task)return;
          pending.delete(data.id);active=0;clearTimeout(task.timer);
          if(data.error){const error=new Error(data.error);if(data.errorName==='SyntaxError')error.name='SyntaxError';task.reject(error);}
          else task.resolve(data.result);
          dispatch();
        };
        current.onerror=()=>{if(worker===current)reset(new Error('Profile worker failed. Retry loading the profile.'));};
      }catch(error){reset(error);return;}
    }
    dispatch();
  });
}
