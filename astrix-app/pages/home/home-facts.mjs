// Guardian Home fresh facts (3 Oct 2026). Every number comes from the player's own Bungie data: the
// /bungie/home summary and Bungie's account historical stats (/bungie/historical-stats). A fact whose
// stat is missing or zero is skipped, never estimated. Comparisons use only the table below.
import {LOTR_EXTENDED_TRILOGY_MINUTES} from './home-copy.mjs';

// Comparison constants, each with its source. A comparison is used only when the rounded result is
// between 1 and 100,000.
export const COMPARISONS=Object.freeze({
  lotrTrilogyMinutes:{value:LOTR_EXTENDED_TRILOGY_MINUTES,unit:'minutes',source:'Extended editions: The Fellowship of the Ring 228 + The Two Towers 235 + The Return of the King 263 minutes'},
  londonNewYorkFlightMinutes:{value:480,unit:'minutes',source:'Typical scheduled flight time, London Heathrow to New York JFK: about 8 hours'},
  marathonMinutes:{value:240,unit:'minutes',source:'A steady marathon finish time of 4 hours'},
  workingYearMinutes:{value:124800,unit:'minutes',source:'A working year: 52 weeks x 5 days x 8 hours = 2,080 hours'},
  wembleyCapacity:{value:90000,unit:'people',source:'Wembley Stadium capacity, 90,000 (wembleystadium.com)'},
  footballPitchMetres:{value:105,unit:'metres',source:'Recommended football pitch length, 105 metres (FIFA)'},
  bohemianRhapsodySeconds:{value:355,unit:'seconds',source:'Queen, Bohemian Rhapsody (1975 single): 5 minutes 55 seconds'}
});
export const COMPARISON_MIN=1,COMPARISON_MAX=100000;
// Rounded comparison, or null when the result is not a sensible number of things.
export function compare(amount,key){
  const per=COMPARISONS[key]?.value;
  if(!Number.isFinite(amount)||!per)return null;
  const times=Math.round(amount/per);
  return times>=COMPARISON_MIN&&times<=COMPARISON_MAX?times:null;
}
export const format=n=>Math.round(Number(n)).toLocaleString('en-GB');
const plural=(n,one,many)=>`${format(n)} ${Math.round(n)===1?one:many}`;
const positive=value=>Number.isFinite(value)&&value>0;

// Bungie's account historical stats, all characters merged. Totals add PvE and PvP; bests take the max.
const BEST=new Set(['longestKillSpree','longestSingleLife','longestKillDistance','bestSingleGameKills']);
export function historicalStat(historical,name){
  const results=historical?.Response?.mergedAllCharacters?.results??historical?.mergedAllCharacters?.results??null;
  const read=group=>{const value=Number(results?.[group]?.allTime?.[name]?.basic?.value);return Number.isFinite(value)?value:null;};
  const values=[read('allPvE'),read('allPvP')].filter(value=>value!==null);
  if(!values.length)return null;
  return BEST.has(name)?Math.max(...values):values.reduce((sum,value)=>sum+value,0);
}
// Weapon type names for Bungie's per-type kill stats. Types not listed here are left out rather than guessed.
const WEAPON_TYPES=Object.freeze({AutoRifle:'Auto Rifle',Bow:'Bow',FusionRifle:'Fusion Rifle',HandCannon:'Hand Cannon',TraceRifle:'Trace Rifle',MachineGun:'Machine Gun',
  PulseRifle:'Pulse Rifle',RocketLauncher:'Rocket Launcher',ScoutRifle:'Scout Rifle',Shotgun:'Shotgun',Sniper:'Sniper Rifle',Submachinegun:'Submachine Gun',
  SideArm:'Sidearm',Sword:'Sword',GrenadeLauncher:'Grenade Launcher',Glaive:'Glaive'});

// Every template: id, group (one fact per group per visit), label, and make(data) returning
// {value,rest} or null. The full sentence is value + rest.
export const TEMPLATES=Object.freeze([
  {id:'time-lotr',group:'time',label:'TIME SERVED',make:d=>{const n=compare(d.minutes,'lotrTrilogyMinutes');return positive(d.minutes)&&n?{value:plural(d.hours,'hour','hours'),rest:` in Destiny. That's the extended Lord of the Rings trilogy ${format(n)} ${n===1?'time':'times'} back to back.`}:null;}},
  {id:'time-flights',group:'time',label:'TIME SERVED',make:d=>{const n=compare(d.minutes,'londonNewYorkFlightMinutes');return positive(d.minutes)&&n?{value:plural(d.hours,'hour','hours'),rest:` in Destiny. You could have flown London to New York ${format(n)} ${n===1?'time':'times'}.`}:null;}},
  {id:'time-marathons',group:'time',label:'TIME SERVED',make:d=>{const n=compare(d.minutes,'marathonMinutes');return positive(d.minutes)&&n?{value:plural(d.hours,'hour','hours'),rest:` in Destiny. That's ${format(n)} ${n===1?'marathon':'marathons'} at a steady 4 hours each.`}:null;}},
  {id:'time-workyears',group:'time',label:'TIME SERVED',make:d=>{const n=compare(d.minutes,'workingYearMinutes');return positive(d.minutes)&&n?{value:plural(d.hours,'hour','hours'),rest:` in Destiny. That's ${format(n)} full ${n===1?'year':'years'} of 8-hour working days.`}:null;}},
  {id:'time-days',group:'time',label:'TIME SERVED',make:d=>d.days>=1?{value:plural(d.days,'full day','full days'),rest:' in Destiny. Your Ghost has stopped asking about sleep.'}:null},
  {id:'class-main',group:'class',label:'MAIN CHARACTER',make:d=>{const top=d.classes[0],n=top&&compare(top.minutes,'lotrTrilogyMinutes');return top&&n?{value:plural(Math.floor(top.minutes/60),'hour','hours'),rest:` as a ${top.className}. That's ${format(n)} extended Lord of the Rings ${n===1?'trilogy':'trilogies'}.`}:null;}},
  {id:'class-split',group:'class',label:'MAIN CHARACTER',make:d=>{const [a,b]=d.classes;return a&&b&&a.share>0&&b.share>0?{value:`${a.share}% ${a.className}`,rest:`, ${b.share}% ${b.className}. Loyal, but not exclusive.`}:null;}},
  {id:'grenade',group:'ability',label:'SIGNATURE MOVE',make:d=>positive(d.grenade)?{value:plural(d.grenade,'grenade kill','grenade kills'),rest:'. Why aim when you can bounce?'}:null},
  {id:'melee',group:'ability',label:'SIGNATURE MOVE',make:d=>positive(d.melee)?{value:plural(d.melee,'melee kill','melee kills'),rest:'. Personal space is a suggestion.'}:null},
  {id:'super',group:'ability',label:'SIGNATURE MOVE',make:d=>positive(d.super)?{value:plural(d.super,'Super kill','Super kills'),rest:'. Main character energy, on cooldown.'}:null},
  {id:'kills-wembley',group:'kills',label:'BODY COUNT',make:d=>{const n=compare(d.kills,'wembleyCapacity');return positive(d.kills)&&n?{value:plural(d.kills,'kill','kills'),rest:`. Enough to fill Wembley Stadium ${format(n)} ${n===1?'time':'times'} over.`}:null;}},
  {id:'kills-per-hour',group:'kills',label:'BODY COUNT',make:d=>{if(!positive(d.kills)||!positive(d.minutes))return null;const n=Math.round(d.kills/(d.minutes/60));return n>=1?{value:plural(n,'kill','kills'),rest:' for every hour you have played. Busy, busy.'}:null;}},
  {id:'precision',group:'precision',label:'EYES ON TARGET',make:d=>positive(d.precision)?{value:plural(d.precision,'precision kill','precision kills'),rest:'. Headshots are a lifestyle.'}:null},
  {id:'precision-share',group:'precision',label:'EYES ON TARGET',make:d=>{if(!positive(d.precision)||!positive(d.kills))return null;const n=Math.round(d.precision/d.kills*100);return n>=1&&n<=100?{value:`${n}%`,rest:' of your kills were precision kills. Eyes on the prize.'}:null;}},
  {id:'deaths',group:'deaths',label:'BACK FROM THE DEAD',make:d=>positive(d.deaths)?{value:plural(d.deaths,'death','deaths'),rest:'. Your Ghost deserves a pay rise.'}:null},
  {id:'kd',group:'deaths',label:'BACK FROM THE DEAD',make:d=>{if(!positive(d.kills)||!positive(d.deaths))return null;const kd=Math.round(d.kills/d.deaths*10)/10;return kd>=0.1?{value:`${kd.toLocaleString('en-GB',{minimumFractionDigits:1,maximumFractionDigits:1})} kills`,rest:' for every death. The maths is on your side.'}:null;}},
  {id:'revives',group:'revives',label:'TEAM PLAYER',make:d=>positive(d.revives)?{value:plural(d.revives,'revive','revives'),rest:'. Your fireteam owes you, big time.'}:null},
  {id:'revived',group:'revives',label:'TEAM PLAYER',make:d=>positive(d.revived)?{value:plural(d.revived,'time','times'),rest:' a friend picked you back up. Say thank you.'}:null},
  {id:'assists',group:'revives',label:'TEAM PLAYER',make:d=>positive(d.assists)?{value:plural(d.assists,'assist','assists'),rest:'. Teamwork makes the dream work.'}:null},
  {id:'spree',group:'spree',label:'ON A ROLL',make:d=>positive(d.spree)?{value:plural(d.spree,'kill','kills'),rest:' in your longest kill spree. Nobody was safe.'}:null},
  {id:'best-game',group:'spree',label:'ON A ROLL',make:d=>positive(d.bestGame)?{value:plural(d.bestGame,'kill','kills'),rest:' in a single activity. Personal best, and a busy day.'}:null},
  {id:'longest-life',group:'life',label:'STAYING ALIVE',make:d=>{const n=compare(d.longestLife,'bohemianRhapsodySeconds');return positive(d.longestLife)&&n?{value:plural(Math.floor(d.longestLife/60),'minute','minutes'),rest:` in your longest life. That's Bohemian Rhapsody ${format(n)} ${n===1?'time':'times'} on repeat.`}:null;}},
  {id:'kill-distance',group:'distance',label:'LONG SHOT',make:d=>{const n=compare(d.killDistance,'footballPitchMetres');return positive(d.killDistance)&&n?{value:plural(d.killDistance,'metre','metres'),rest:` away, your longest kill. That's ${format(n)} football ${n===1?'pitch':'pitches'}.`}:null;}},
  {id:'orbs-made',group:'orbs',label:'ORB FACTORY',make:d=>positive(d.orbsMade)?{value:plural(d.orbsMade,'Orb of Power','Orbs of Power'),rest:' made. Free Super for everyone.'}:null},
  {id:'orbs-collected',group:'orbs',label:'ORB FACTORY',make:d=>positive(d.orbsCollected)?{value:plural(d.orbsCollected,'Orb of Power','Orbs of Power'),rest:' collected. Waste not, want not.'}:null},
  {id:'public-events',group:'events',label:'OUT IN THE WORLD',make:d=>positive(d.publicEvents)?{value:plural(d.publicEvents,'public event','public events'),rest:' done. The Cabal keep calling.'}:null},
  {id:'heroic-events',group:'events',label:'OUT IN THE WORLD',make:d=>positive(d.heroicEvents)?{value:plural(d.heroicEvents,'heroic public event','heroic public events'),rest:'. You always pick the hard way.'}:null},
  {id:'weapon-type',group:'weapon',label:'WEAPON OF CHOICE',make:d=>d.weaponType&&positive(d.weaponType.kills)?{value:plural(d.weaponType.kills,`${d.weaponType.label} kill`,`${d.weaponType.label} kills`),rest:'. Your favourite kind of weapon, by a mile.'}:null},
  {id:'exotic',group:'weapon',label:'WEAPON OF CHOICE',make:d=>d.exotic&&positive(d.exotic.kills)?{value:plural(d.exotic.kills,'kill','kills'),rest:` with ${d.exotic.name}. You two should probably make it official.`}:null},
  {id:'raid-clears',group:'endgame',label:'ENDGAME',make:d=>positive(d.raidClears)?{value:plural(d.raidClears,'raid clear','raid clears'),rest:'. That is a lot of jumping puzzles.'}:null},
  {id:'pve-cleared',group:'endgame',label:'ENDGAME',make:d=>positive(d.pveCleared)?{value:plural(d.pveCleared,'activity','activities'),rest:' completed. Finishing what you start.'}:null},
  {id:'pve-entered',group:'modes',label:'WHERE YOU LIVE NOW',make:d=>positive(d.pve)?{value:plural(d.pve,'PvE activity','PvE activities'),rest:'. The Vanguard would like to thank you personally.'}:null},
  {id:'crucible',group:'modes',label:'WHERE YOU LIVE NOW',make:d=>positive(d.pvp)?{value:plural(d.pvp,'Crucible match','Crucible matches'),rest:'. Shaxx knows your name.'}:null},
  {id:'self-elims',group:'gravity',label:'GRAVITY INCIDENTS',make:d=>positive(d.selfElims)?{value:plural(d.selfElims,'self elimination','self eliminations'),rest:'. We blame the ledges.'}:null}
]);

// One flat record of the player's numbers. Missing values stay null.
export function factData(summary,historical){
  const h=name=>historicalStat(historical,name),minutes=summary?.timePlayed?.minutes??h('secondsPlayed')/60;
  const types=Object.entries(WEAPON_TYPES).map(([key,label])=>({label,kills:h(`weaponKills${key}`)})).filter(row=>positive(row.kills)).sort((a,b)=>b.kills-a.kills);
  const ability=summary?.abilityKills||{};
  return {
    minutes:positive(minutes)?minutes:null,hours:positive(minutes)?Math.floor(minutes/60):null,days:positive(minutes)?Math.floor(minutes/1440):null,
    classes:(summary?.classShares||[]).filter(row=>positive(row.minutes)),
    grenade:ability.grenade??h('weaponKillsGrenade'),melee:ability.melee??h('weaponKillsMelee'),super:ability.super??h('weaponKillsSuper'),
    kills:h('kills'),precision:h('precisionKills'),deaths:h('deaths'),revives:h('resurrectionsPerformed'),revived:h('resurrectionsReceived'),assists:h('assists'),
    spree:h('longestKillSpree'),bestGame:h('bestSingleGameKills'),longestLife:h('longestSingleLife'),killDistance:h('longestKillDistance'),
    orbsMade:h('orbsDropped'),orbsCollected:h('orbsGathered'),publicEvents:h('publicEventsCompleted'),heroicEvents:h('heroicPublicEventsCompleted'),
    weaponType:types[0]||null,exotic:summary?.topExoticWeapon?.name?summary.topExoticWeapon:null,
    raidClears:summary?.raidClears??null,pveCleared:h('activitiesCleared'),pve:summary?.modes?.pve??null,pvp:summary?.modes?.pvp??null,selfElims:summary?.selfEliminations??null
  };
}
// Every fact the player has data for.
export function buildFacts(summary,historical){
  const data=factData(summary,historical);
  return TEMPLATES.flatMap(template=>{const made=template.make(data);return made?[{id:template.id,group:template.group,label:template.label,value:made.value,rest:made.rest,text:`${made.value}${made.rest}`}]:[];});
}
// Up to count facts, none from the excluded ids, at most one per group, in random order.
export function pickFacts(facts,excluded=new Set(),count=3,random=Math.random,{oneEachGroup=true}={}){
  const pool=facts.filter(fact=>!excluded.has(fact.id));
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const chosen=[],groups=new Set();
  for(const fact of pool){if(chosen.length>=count)break;if(oneEachGroup&&groups.has(fact.group))continue;groups.add(fact.group);chosen.push(fact);}
  return chosen;
}
// Miguel (3 Oct 2026): no fact comes back for at least 5 visits.
// Three facts for this visit, none shown in the last 5 visits. Only when the player has too few facts
// does it relax, in this order: allow two facts from one group, then let the oldest visit's facts back.
export function chooseForVisit(facts,visits,count=3,random=Math.random){
  for(let keep=visits.length;keep>=0;keep--){
    const excluded=recentIds(visits.slice(visits.length-keep));
    const strict=pickFacts(facts,excluded,count,random);if(strict.length>=count)return strict;
    const loose=pickFacts(facts,excluded,count,random,{oneEachGroup:false});if(loose.length>=count)return loose;
  }
  return pickFacts(facts,new Set(),count,random,{oneEachGroup:false});
}
// The fact ids shown on the last 5 visits, per account, in this browser only.
export const HISTORY_VISITS=5;
const historyKey=account=>`astrix_home_facts_v1:${account}`;
export function readHistory(account,storage=globalThis.localStorage){
  try{const visits=JSON.parse(storage?.getItem(historyKey(account))||'[]');return Array.isArray(visits)?visits.filter(Array.isArray).slice(-HISTORY_VISITS):[];}catch{return [];}
}
export function writeHistory(account,ids,storage=globalThis.localStorage){
  const visits=[...readHistory(account,storage),ids].slice(-HISTORY_VISITS);
  try{storage?.setItem(historyKey(account),JSON.stringify(visits));}catch{}
  return visits;
}
export const recentIds=visits=>new Set(visits.flat());
