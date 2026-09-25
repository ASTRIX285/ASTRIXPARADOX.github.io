export const SERIES=Object.freeze([
  {id:'raids',name:'Raids',description:'Six-player encounters and clears.'},
  {id:'dungeons',name:'Dungeons',description:'Three-player expeditions and clears.'},
  {id:'vanguard',name:'Vanguard Strikes',description:'Strikes, Nightfalls and Grandmasters.'},
  {id:'conquests',name:'Conquests',description:'Conquest activities and results.'},
  {id:'lost-sectors',name:'Lost Sectors',description:'Lost Sector runs across destinations.'},
  {id:'exotic',name:'Exotic Missions',description:'Missions for Exotic rewards.'},
  {id:'story',name:'Story Missions',description:'Campaign missions and replays.'}
]);
const DIFFICULTIES=['Normal','Standard','Advanced','Expert','Legend','Legendary','Master','Prestige','Grandmaster','Contest','Challenge Mode','Explorer','Eternity','Ultimatum','Epic'];
const EXOTIC=/^(?:\/\/node\.ovrd\.AVALON\/\/|Presage|Harbinger|The Whisper|Zero Hour|Vox Obscura|Operation: Seraph's Shield|Starcrossed|Encore|Kell's Fall|Derealize|Dual Destiny)(?::|$)/i;
export function bungieImage(path){
  if(!path)return '';
  try{const url=new URL(path,'https://www.bungie.net');return url.origin==='https://www.bungie.net'&&url.protocol==='https:'?url.href:'';}catch{return '';}
}
export function classifyActivity(def){
  const modes=def.activityModeTypes||[],name=def.displayProperties?.name||'';
  if(/\bConquest\b/i.test(name))return 'conquests';
  if(modes.includes(4)||def.activityTypeHash===2043403989)return 'raids';
  if(modes.includes(82)||def.activityTypeHash===608898761)return 'dungeons';
  if(modes.includes(87))return 'lost-sectors';
  if(def.activityTypeHash===1227821118||EXOTIC.test(name))return 'exotic';
  if(modes.some(mode=>[3,16,17,18,46,47].includes(mode)))return 'vanguard';
  if(modes.includes(2)||def.activityTypeHash===1686739444)return 'story';
  return null;
}
export function variantIdentity(def){
  let name=String(def.displayProperties?.name||def.originalDisplayProperties?.name||'').trim();
  const displayed=String(def.displayProperties?.name||'');
  const match=displayed.match(/(?:[:(]\s*|\b)(Challenge Mode|Contest|Grandmaster|Prestige|Master|Legendary|Legend|Expert|Advanced|Standard|Normal)(?:\s*\))?$/i);
  let difficulty=match?DIFFICULTIES.find(value=>value.toLowerCase()===match[1].toLowerCase()):null;
  if(/^Nightfall Grandmaster:/i.test(displayed))difficulty='Grandmaster';
  name=name.replace(/^(?:Nightfall(?: Grandmaster)?|(?:Grandmaster|Master) Conquest):\s*/i,'')
    .replace(/(?::\s*|\s*\()(?:Challenge Mode|Contest|Grandmaster|Prestige|Master|Legendary|Legend|Expert|Advanced|Standard|Normal)\)?$/i,'').trim();
  name=name.replace(/: Level \d+$/i,'').replace(/: (?:Customize|Matchmade)$/i,'');
  // Unlabelled definitions have no asserted difficulty. Missing remains '-'.
  return {name,difficulty:difficulty||'-'};
}
export function catalogue(definitions){
  const groups=new Map();
  const lostSectors=new Set(Object.values(definitions||{}).filter(def=>def.activityModeTypes?.includes(87)).map(def=>variantIdentity(def).name));
  for(const def of Object.values(definitions||{})){
    const {name,difficulty}=variantIdentity(def);
    const series=lostSectors.has(name)?'lost-sectors':classifyActivity(def);
    if(!series||!name||def.redacted||def.isPlaylist)continue;
    const key=`${series}:${name.toLocaleLowerCase('en')}`;
    if(!groups.has(key))groups.set(key,{id:key,series,name,image:bungieImage(def.pgcrImage),releaseTime:null,variants:[]});
    const group=groups.get(key);
    group.image ||= bungieImage(def.pgcrImage);
    if(Number(def.releaseTime)>0)group.releaseTime=Math.max(group.releaseTime||0,Number(def.releaseTime));
    group.variants.push({hash:String(def.hash),difficulty});
  }
  return [...groups.values()].sort((a,b)=>(b.releaseTime||0)-(a.releaseTime||0)||a.name.localeCompare(b.name));
}
// Prompt 20a-fix: production receives only the Worker projection, never full definitions.
export function slimCatalogue(activities){
  const groups=new Map();
  // Prompt 20c: only split a prefix that is a known complete activity in this series.
  // A colon alone (for example Operation: Seraph's Shield) is not a grouping rule.
  const names=new Map(SERIES.map(series=>[series.id,new Set(activities.filter(row=>row.series===series.id).map(row=>row.name))]));
  for(const row of activities){
    const bases=[...(names.get(row.series)||[])].filter(name=>row.name.startsWith(`${name}: `)).sort((a,b)=>a.length-b.length);
    const name=bases[0]||row.name,variant=name===row.name?'':row.name.slice(name.length+2);
    const id=`${row.series}:${name.toLocaleLowerCase('en')}`;
    if(!groups.has(id))groups.set(id,{id,series:row.series,name,image:'',imageCandidates:[],releaseOrder:row.releaseOrder,variants:[]});
    const group=groups.get(id),image=bungieImage(row.pgcrImage);
    if(image&&!group.imageCandidates.includes(image))group.imageCandidates.push(image);
    // Use the base's public debut order when it is present, independent of input order.
    if(!variant)group.releaseOrder=row.releaseOrder;
    group.variants.push({hash:String(row.hash),difficulty:row.difficulty,variant});
  }
  // Prefer the first image belonging to this box alone, across all series.
  const owners=new Map();
  for(const group of groups.values())for(const image of group.imageCandidates){
    if(!owners.has(image))owners.set(image,new Set());owners.get(image).add(group.id);
  }
  for(const group of groups.values())group.image=[...group.imageCandidates].sort((a,b)=>owners.get(a).size-owners.get(b).size)[0]||'';
  // If no globally distinct image exists, avoid a same-series duplicate when possible.
  for(const group of groups.values()){
    const others=[...groups.values()].filter(other=>other!==group&&other.series===group.series);
    if(others.some(other=>other.image===group.image))group.image=group.imageCandidates.find(image=>!others.some(other=>other.image===image))||group.image;
  }
  // Prompt 20a-fix2: retain unknown labels only for entirely unlabelled activities.
  for(const group of groups.values())if(group.variants.some(row=>row.difficulty!=='-')){
    for(const row of group.variants)if(row.difficulty==='-')row.difficulty=group.series==='vanguard'?'Standard':'Normal';
  }
  return [...groups.values()].sort((a,b)=>a.series.localeCompare(b.series)||(['raids','dungeons','exotic'].includes(a.series)?(b.releaseOrder??Number.MAX_SAFE_INTEGER)-(a.releaseOrder??Number.MAX_SAFE_INTEGER):0)||a.name.localeCompare(b.name));
}
export const STAT_KEYS={entered:'activitiesEntered',cleared:'activityCompletions',kills:'activityKills',deaths:'activityDeaths',time:'activitySecondsPlayed',fastest:'fastestCompletionMsForActivity',score:'bestSingleGameScore'};
export function stat(stats,key){const value=stats?.[key]?.basic?.value;return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
export function aggregateRow(row){
  const stats=row?.values||{};
  const result=Object.fromEntries(Object.entries(STAT_KEYS).map(([name,key])=>[name,stat(stats,key)]));
  result.fastest=result.fastest===null?null:result.fastest/1000;
  if(result.cleared===0)result.fastest=null;
  result.flawless=null; // Aggregate stats do not expose a flawless run count.
  return result;
}
export function combine(rows){
  const result={};
  for(const key of [...Object.keys(STAT_KEYS),'flawless']){
    const values=rows.map(row=>row[key]);
    // Never present a partial character total as the account total.
    if(!values.length||values.some(value=>value===null||value===undefined)){result[key]=null;continue;}
    result[key]=key==='fastest'?Math.min(...values.filter(value=>value>0)):key==='score'?Math.max(...values):values.reduce((sum,value)=>sum+value,0);
    if(!Number.isFinite(result[key]))result[key]=null;
  }
  // Missing fastest on an unplayed variant must not hide another variant's best run.
  const fastest=rows.map(row=>row.fastest).filter(value=>Number.isFinite(value)&&value>0);
  result.fastest=fastest.length?Math.min(...fastest):null;
  const scores=rows.map(row=>row.score).filter(Number.isFinite);
  result.score=scores.length?Math.max(...scores):null;
  return result;
}
const absent=()=>({entered:0,cleared:0,kills:0,deaths:0,time:0,fastest:null,score:null,flawless:null});
const unknown=()=>Object.fromEntries([...Object.keys(STAT_KEYS),'flawless'].map(key=>[key,null]));
export function viewModel(snapshot,series,characterId='all'){
  const characters=characterId==='all'?snapshot.characters:snapshot.characters.filter(row=>row.characterId===characterId);
  const indexed=new Map(characters.map(character=>[character.characterId,new Map((snapshot.aggregates[character.characterId]?.activities||[]).map(row=>[String(row.activityHash),row]))]));
  const activities=snapshot.catalogue.filter(row=>row.series===series).map(group=>{
    const difficulties=new Map();
    for(const variant of group.variants){
      const rows=characters.map(character=>{
        if(!snapshot.aggregates[character.characterId])return unknown();
        const row=indexed.get(character.characterId).get(variant.hash);return row?aggregateRow(row):absent();
      });
      const label=variant.variant?[variant.variant,variant.difficulty==='-'?'':variant.difficulty].filter(Boolean).join(' · '):variant.difficulty;
      if(!difficulties.has(label))difficulties.set(label,[]);
      difficulties.get(label).push(...rows);
    }
    const rows=[...difficulties].map(([difficulty,values])=>({difficulty,...combine(values)}))
      .sort((a,b)=>DIFFICULTIES.indexOf(a.difficulty)-DIFFICULTIES.indexOf(b.difficulty));
    return {...group,difficulties:rows,totals:combine(rows)};
  });
  return {activities,totals:combine(activities.map(row=>row.totals))};
}
export function display(value){return Number.isFinite(value)?value.toLocaleString('en-GB'):'-';}
export function duration(value){if(!Number.isFinite(value)||value<=0)return '-';const s=Math.floor(value);return `${Math.floor(s/3600)?Math.floor(s/3600)+':':''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
