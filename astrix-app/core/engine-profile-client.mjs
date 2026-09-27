let worker=null,next=0;
const pending=new Map();
export function runProfileTask(type,input){
  if(!worker){
    worker=new Worker(new URL('./engine-profile-worker.mjs?v=20260927-1&recovery=20260927-1',import.meta.url),{type:'module',name:'paradox-profile'});
    worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(new Error(data.error)):task.resolve(data.result);};
    worker.onerror=()=>{worker?.terminate();worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Profile worker failed. Retry loading the profile.'));}pending.clear();};
  }
  return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Profile processing timed out.'));},4000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,type,...input});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
}
