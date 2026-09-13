// One raw display snapshot per requested scope; definitions are never retained here.
const snapshots=new Map();
const pending=new Map();
let generation=0,activeBinding='';
globalThis.addEventListener?.('forge:bungie-session',event=>{
  const session=event.detail,membership=session?.activeDestinyMembership;
  const next=session?.authenticated?`${membership?.membershipType}:${membership?.membershipId}`:'';
  if(next!==activeBinding){generation++;activeBinding=next;snapshots.clear();pending.clear();}
});
export async function fetchDisplayProfile(input,{fetchImpl=globalThis.fetch.bind(globalThis),signal}={}){
  const url=new URL(input),key=`${url.origin}:${url.searchParams.get('scope')||'all'}`;
  if(pending.has(key))return pending.get(key);
  const started=generation;
  const task=(async()=>{
    const previous=snapshots.get(key);
    url.searchParams.set('freshness','display');url.searchParams.set('delivery','sections');
    if(previous)url.searchParams.set('since',JSON.stringify(previous.revisions));
    const response=await fetchImpl(url,{credentials:'include',headers:{Accept:'application/json'},signal});
    const payload=await response.json();
    if(started!==generation)throw new Error('Bungie account changed while loading.');
    if(!response.ok){snapshots.delete(key);throw new Error(payload.error||`Bungie profile request failed (${response.status}).`);}
    if(!payload.profileSections)return payload; // Safe rolling deployment compatibility.
    const binding=`${payload.membership?.membershipType}:${payload.membership?.membershipId}`;
    const {revisions,changed}=payload.profileSections;
    const profile={};
    for(const name of Object.keys(revisions)){
      if(Object.hasOwn(changed,name))profile[name]=changed[name];
      else if(previous?.binding===binding&&previous.revisions[name]===revisions[name])profile[name]=previous.profile[name];
      else{snapshots.delete(key);throw new Error('Account snapshot changed; refresh the page to reload it.');}
    }
    while(snapshots.size>=3&&!snapshots.has(key))snapshots.delete(snapshots.keys().next().value);
    snapshots.set(key,{binding,revisions,profile});
    const {profileSections,...rest}=payload;
    return {...rest,profile,changedSections:Object.keys(changed)};
  })();
  pending.set(key,task);
  try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
}
