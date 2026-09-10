const keyOf=v=>JSON.stringify([v.element,v.objective||'balanced',Number(v.superHash)||0]);
const INPUT_FIELDS=['version','source','characterId','membershipId','membershipType','characterClass','selectedLoadoutIndex','subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments','artifact','artifactConfiguration','artifactRecommendation','artifactValidation','availableArtifacts','artifactOptions','currentSeasonNumber','currentSeason','weapons','ownedWeapons','vaultWeapons','inventoryWeapons','armour','mods','stats','hashCoverage','statModel','coverage','semanticCoverage','paradoxEvidence','forgeLoaderDecision','objective','activityContext','activityProfile','activity','beta','buildFocus','locks'];

export class ForgePreparationClient{
  constructor({workerFactory=()=>new Worker(new URL('./paradox-forge-worker.mjs?v=20260910-generate-termination-1',import.meta.url),{type:'module',name:'paradox-forge'}),onStatus=()=>{},maxEntries=4,maxBytes=8*1024*1024,timeoutMs=120000}={}){
    Object.assign(this,{workerFactory,onStatus,maxEntries,maxBytes,timeoutMs});
    this.revision=0;this.cache=new Map();this.pending=new Map();this.bytes=0;this.worker=null;this.input=null;this.runningKey='';
  }
  setInput(build,candidates,season){
    if(this.build===build&&this.input?.season===season)return;
    this.invalidate();this.build=build;
    this.input={type:'init',revision:this.revision,build:Object.fromEntries(INPUT_FIELDS.filter(key=>Object.hasOwn(build,key)).map(key=>[key,build[key]])),candidates,season};
    this.launch();
  }
  launch(){
    this.worker?.terminate();this.runningKey='';
    const worker=this.workerFactory();this.worker=worker;
    worker.onmessage=event=>{if(this.worker===worker)this.receive(event.data);};
    worker.onerror=()=>{if(this.worker===worker)this.fail('Background preparation could not start. Try Generate Max Loadout again.');};
    worker.onmessageerror=()=>{if(this.worker===worker)this.fail('The prepared build could not be read. Try again.');};
    try{worker.postMessage(this.input);}catch(error){this.fail(error?.message||'Unable to send the build to background preparation.');throw error;}
  }
  receive(message){
    if(message.revision!==this.revision)return;
    if(message.type==='started')this.runningKey=message.key;
    if(message.type==='ready'){
      this.runningKey='';
      const size=Number(message.bytes)||0;
      if(this.cache.has(message.key)){this.bytes-=this.cache.get(message.key).bytes;this.cache.delete(message.key);}
      if(size<=this.maxBytes){
        while(this.cache.size&&(this.cache.size>=this.maxEntries||this.bytes+size>this.maxBytes)){const oldest=[...this.cache.keys()].find(key=>key!==this.preferredKey)||this.cache.keys().next().value;this.bytes-=this.cache.get(oldest).bytes;this.cache.delete(oldest);}
        this.cache.set(message.key,{result:message.result,bytes:size});this.bytes+=size;
      }
      const pending=this.pending.get(message.key);
      if(pending){clearTimeout(pending.timer);this.pending.delete(message.key);pending.resolve(message.result);}
    }
    if(message.type==='error'){
      this.runningKey='';const pending=this.pending.get(message.key);
      if(pending){clearTimeout(pending.timer);this.pending.delete(message.key);pending.reject(new Error(message.message));}
    }
    this.onStatus(message);
  }
  warm(jobs){this.preferredKey=jobs[0]?keyOf(jobs[0]):'';if(this.input&&this.worker)this.worker.postMessage({type:'prepare',revision:this.revision,jobs:jobs.slice(0,12)});}
  get(variant){
    const key=keyOf(variant),hit=this.cache.get(key);
    if(hit){this.cache.delete(key);this.cache.set(key,hit);return Promise.resolve(hit.result);}
    if(this.pending.has(key))return this.pending.get(key).promise;
    if(!this.input)return Promise.reject(new Error('Stage a verified Forge Loader result first.'));
    // Stop speculative work immediately when a requested variant is not ready.
    if(!this.worker||(this.runningKey&&this.runningKey!==key))this.launch();
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const budget=this.timeoutMs===120000?'120 second':`${this.timeoutMs} millisecond`,timer=setTimeout(()=>this.fail(`Build preparation exceeded the ${budget} worker budget. No recommendation was generated. Retry this selection.`),this.timeoutMs);
    this.pending.set(key,{promise,resolve,reject,timer});
    this.worker.postMessage({type:'prepare',revision:this.revision,jobs:[variant],requested:true});
    return promise;
  }
  fail(message){
    this.worker?.terminate();this.worker=null;this.runningKey='';
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error(message));}this.pending.clear();
    this.onStatus({type:'unavailable',message});
  }
  invalidate(){this.fail('The build inputs changed. Generate again for the current selection.');this.revision++;this.cache.clear();this.bytes=0;this.input=null;this.build=null;}
  dispose(){this.invalidate();}
}

export function preparationVariants(candidates,selected){
  const jobs=[selected];
  for(const row of candidates)jobs.push({element:row.element,objective:selected.objective,superHash:0});
  for(const objective of ['balanced','dps','add-clear','survivability','ability-uptime'])jobs.push({...selected,objective});
  const sb=candidates.find(row=>row.element===selected.element)?.candidate?.subclassBuild;
  for(const item of sb?.superOptions||[])jobs.push({...selected,superHash:Number(item.hash??item.bungieHash)||0});
  const seen=new Set();return jobs.filter(job=>{const key=keyOf(job);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
}
