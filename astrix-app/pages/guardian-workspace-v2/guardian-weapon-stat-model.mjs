import {weaponStatRows} from './guardian-weapon-stat-definitions.mjs';

// Investment values are not display values (notably magazine size and RPM).
export function displayStat(value, display){
  const points=display?.displayInterpolation;
  if(!points?.length)return null;
  value=Math.min(value,display.maximumValue);
  let end=points.findIndex(point=>point.value>value);
  if(end<0)end=points.length-1;
  const a=points[Math.max(0,end-1)],b=points[end];
  const result=b.value===a.value?a.weight:a.weight+(value-a.value)*(b.weight-a.weight)/(b.value-a.value);
  const rounded=Math.round(result);
  return Number(display.statHash)===3871231066?rounded:Math.abs(result)%1===0.5?(rounded%2===0?rounded:rounded-1):rounded;
}

export function weaponStatBreakdown(item, choices={}){
  const semantics=item?.weaponSemantics||{},definition=item?.definition||{},group=definition.resolvedStatGroup;
  const raw=weaponStatRows(semantics.stats||item?.weaponStats||{});
  const sockets=semantics.statSockets||item?.socketCoverage?.plugs;
  if(!group||!sockets)return raw.map(row=>({...row,base:null,bonus:null,verified:false}));
  const base=new Map((definition.investmentStats||[]).filter(row=>!row.isConditionallyActive).map(row=>[Number(row.statTypeHash),Number(row.value)]));
  const totals=new Map(base),reductions=new Map(),uncertain=new Set();
  const tier=Number(semantics.gearTier);
  for(const socket of sockets){
    const plug=choices[socket.socketIndex]||socket;
    if(plug.isEnabled===false||plug.enabled===false)continue;
    const def=plug.definition;
    if(!def||!Object.keys(def).length){for(const hash of base.keys())uncertain.add(hash);continue;}
    const tiered=def.plug?.uiPlugLabel==='masterwork'&&tier>0&&(def.investmentStats||[]).some(stat=>stat.isConditionallyActive&&stat.value===0);
    for(const stat of def.investmentStats||[]){
      const hash=Number(stat.statTypeHash);
      if(!totals.has(hash))continue;
      if(stat.isConditionallyActive&&!tiered){uncertain.add(hash);continue;}
      const delta=stat.isConditionallyActive&&tiered?tier:Number(stat.value);
      totals.set(hash,totals.get(hash)+delta);
      if(plug.semanticRole==='intrinsic')base.set(hash,base.get(hash)+delta);
      else if(delta<0)reductions.set(hash,(reductions.get(hash)||0)+delta);
    }
  }
  return raw.map(row=>{
    const display=group.scaledStats?.find(stat=>Number(stat.statHash)===row.hash);
    const original=displayStat(base.get(row.hash),display),value=displayStat(totals.get(row.hash),display);
    if(uncertain.has(row.hash)||!Number.isFinite(original)||!Number.isFinite(value))return {...row,base:null,bonus:null,verified:false};
    const barBase=displayStat(base.get(row.hash)+(reductions.get(row.hash)||0),display);
    return {...row,value,base:original,barBase:Math.min(value,barBase),bonus:value-original,verified:true};
  });
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=value=>Math.max(0,Math.min(100,value));
export function weaponStatMarkup(rows){
  return rows.map(row=>{
    const white=clamp(row.verified?row.barBase:row.value),yellow=row.verified?Math.max(0,clamp(row.value)-white):0;
    const label=row.verified?`Base ${row.base}; net socket change ${row.bonus>=0?'+':''}${row.bonus}; total ${row.value}`:`Bungie total ${row.value}; bonus breakdown unavailable`;
    const enhanced=row.verified&&row.bonus>0;
    return `<div class="weapon-stat${enhanced?' has-enhanced-value':''}" data-bungie-hash="${row.hash}" data-bungie-definition-type="DestinyStatDefinition" data-paradox-id="${esc(row.paradoxId)}" title="${esc(label)}"><span>${esc(row.name)}</span><i><b class="weapon-stat-base" style="width:${white}%"></b><b class="weapon-stat-bonus" style="left:${white}%;width:${yellow}%"></b></i><strong>${esc(row.value)}</strong></div>`;
  }).join('');
}
