// Guardian Home copy. Every line is a fixed template chosen by thresholds from real
// numbers. Nothing is generated per player, and no line claims more than its number.

// Extended edition runtimes of The Lord of the Rings trilogy:
// The Fellowship of the Ring 228 min + The Two Towers 235 min + The Return of the King 263 min.
export const LOTR_EXTENDED_TRILOGY_MINUTES=726;

const LINES={
  Warlock:['Space wizard confirmed.','Rifts, robes and absolutely no regrets.','The Traveler speaks. You take notes.'],
  Hunter:['Cloak on, knife out, no witnesses.','Dodge first, apologise never.','Style points are real points.'],
  Titan:['Punch first, physics later.','You are the wall. The wall is you.','Barricade up, ego higher.'],
  weaponLow:['A promising start to a beautiful friendship.','Early days, but the chemistry is there.'],
  weaponMid:['You two have clearly been through things.','Loyal, reliable, slightly obsessive.'],
  weaponHigh:['You and this weapon should probably make it official.','At this point it has its own locker.','Emotional support, fully certified.'],
  grenade:['Throw first, ask questions never.','Why aim when you can bounce?'],
  melee:['Up close and very personal.','Personal space is a suggestion.'],
  super:['You save it for the big moments. All of them.','Main character energy, on cooldown.'],
  pve:['The Vanguard would like to thank you personally.','You live out here now.'],
  pvp:['Shaxx knows your name.','The Crucible is your second home.'],
  selfLow:['Mostly graceful. Mostly.','A few ledges have won. Not many.'],
  selfHigh:['We blame the ledges.','Gravity has filed a complaint.','Your Ghost has stopped counting out loud.']
};

// Same account, same day, same lines: a refresh never reshuffles the page.
export function dailySeed(accountKey,date=new Date()){
  const text=`${accountKey}|${date.toISOString().slice(0,10)}`;let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
const pick=(list,seed,salt)=>list[(seed+salt*7919)%list.length];
export const format=n=>Math.round(Number(n)).toLocaleString('en-GB');

export function timeCopy(timePlayed){
  if(!timePlayed)return null;
  const {minutes,days,hours}=timePlayed;
  const headline=days>=1?{value:`${format(days)} ${days===1?'day':'days'}`,prefix:'You have spent',suffix:'in Destiny.'}:{value:'less than a day',prefix:'You have spent',suffix:'in Destiny. So far.'};
  const trilogy=Math.floor(minutes/LOTR_EXTENDED_TRILOGY_MINUTES);
  const detail=trilogy>=2
    ?`That is ${format(hours)} hours. Long enough to watch the extended Lord of the Rings trilogy ${format(trilogy)} times. The Traveler thanks you for your service.`
    :`That is ${format(hours)} ${hours===1?'hour':'hours'}. Every one of them well spent.`;
  return {headline,detail};
}
export function classLine(className,seed){return LINES[className]?pick(LINES[className],seed,1):null;}
export function weaponLine(kills,seed){return pick(kills>=10000?LINES.weaponHigh:kills>=1000?LINES.weaponMid:LINES.weaponLow,seed,2);}
export function abilityCopy(abilityKills,seed){
  if(!abilityKills)return null;
  const rows=[['grenade','Grenades'],['melee','Melee'],['super','Supers']].map(([key,label])=>({key,label,kills:abilityKills[key]})).filter(row=>row.kills!==null&&row.kills!==undefined);
  if(!rows.length)return null;
  rows.sort((a,b)=>b.kills-a.kills);
  const [top,...rest]=rows;
  if(top.kills<=0)return null;
  return {label:top.label,kills:top.kills,line:pick(LINES[top.key],seed,3),others:rest.map(row=>`${row.label} ${format(row.kills)}`).join(' · ')};
}
export function modeCopy(modes,seed){
  if(!modes||(modes.pve??0)+(modes.pvp??0)<=0)return null;
  const pvp=(modes.pvp??0)>(modes.pve??0);
  return {label:pvp?'Crucible':'PvE',count:pvp?modes.pvp:modes.pve,unit:pvp?'matches':'activities',line:pick(pvp?LINES.pvp:LINES.pve,seed,4)};
}
export function selfCopy(count,seed){
  if(count===null||count===undefined)return null;
  return {count,line:pick(count>=100?LINES.selfHigh:LINES.selfLow,seed,5)};
}
export function sinceCopy(period,now=Date.now()){
  const ms=now-Date.parse(period);if(!Number.isFinite(ms)||ms<0)return null;
  const minutes=Math.floor(ms/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
  if(minutes<60)return `${Math.max(1,minutes)} ${minutes===1?'minute':'minutes'} ago`;
  if(hours<24)return `${hours} ${hours===1?'hour':'hours'} ago`;
  return `${days} ${days===1?'day':'days'} ago`;
}
export function durationCopy(seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return null;
  const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=Math.floor(seconds%60);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
