// Keep the latest profile's packed handoff ready while the player browses.
export class EngineHandoffClient{
  constructor({workerFactory=()=>new Worker(new URL('./engine-handoff-worker.mjs?v=20260927-1',import.meta.url),{type:'module',name:'paradox-handoff'})}={}){this.workerFactory=workerFactory;this.next=0;this.pending=new Map();this.worker=null;}
  prepare(build,binding){
    const bindingKey=JSON.stringify(binding);
    if(this.build===build&&this.bindingKey===bindingKey&&this.promise)return this.promise;
    this.build=build;this.bindingKey=bindingKey;
    if(!this.worker){this.worker=this.workerFactory();this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;this.pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(new Error(data.error)):task.resolve(data.result);};this.worker.onerror=()=>this.dispose('Build handoff worker failed.');}
    const id=++this.next;
    this.promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Build handoff exceeded 4 seconds.'));},4000);this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,build,binding});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}}).catch(error=>{if(this.build===build)this.promise=null;throw error;});
    return this.promise;
  }
  dispose(message='Build handoff closed.'){this.worker?.terminate();this.worker=null;for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(new Error(message));}this.pending.clear();this.promise=null;this.build=null;}
}
