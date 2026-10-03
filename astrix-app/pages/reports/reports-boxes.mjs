import {combine} from './reports-model.mjs';
// Presentation only: keep raw missing data intact and never invent release dates.
// Bungie's tier names. "Normal" and "Standard" are both Bungie's names for the base tier; Reports
// shows one name, Standard, as current Bungie raids and dungeons do (for example "Salvation's Edge: Standard").
export const TIERS=Object.freeze(['Standard','Advanced','Expert','Legend','Legendary','Master','Prestige','Grandmaster','Contest','Challenge Mode','Explorer','Eternity','Ultimatum','Epic']);
export const tierName=label=>String(label).replace(/(^| · )Normal$/,'$1Standard');
// An encounter is a named part of an activity rather than a tier: a Pantheon boss ("Morgeth Surpassing"),
// an Exotic mission section ("Coda · Standard", "Bloodline"). Unlabelled ("-") is the activity itself.
export const isEncounter=label=>{const name=tierName(label);return name!=='-'&&!TIERS.includes(name);};
const cleared=row=>Number.isFinite(row.cleared)&&row.cleared>0;
// Tile rows (3 Oct 2026, completed only): one row per tier with at least one clear, Normal and Standard
// merged as Standard; encounters collapse into one totals row; an unlabelled activity shows "Total".
export function boxRows(activity){
 const tiers=new Map(),encounters=[];
 for(const row of activity.difficulties){
  if(isEncounter(row.difficulty)){encounters.push(row);continue;}
  const name=row.difficulty==='-'?'Total':tierName(row.difficulty);
  if(!tiers.has(name))tiers.set(name,[]);tiers.get(name).push(row);
 }
 const rows=[...tiers].map(([difficulty,list])=>({difficulty,...combine(list)}));
 if(encounters.length)rows.push({difficulty:rows.length?'Encounters':'Total',...combine(encounters)});
 return rows.filter(cleared).sort((a,b)=>(b.cleared??0)-(a.cleared??0)||TIERS.indexOf(a.difficulty)-TIERS.indexOf(b.difficulty));
}
export const completed=activity=>cleared(activity.totals||{});
export function packReportCards(grid){
 if(!grid.clientWidth)return;
 const cards=[...grid.querySelectorAll('.reports-card')];if(!cards.length)return;
 const width=cards[0].getBoundingClientRect().width,gap=12;
 const columns=Math.max(1,Math.floor((grid.clientWidth+gap)/(width+gap))),bottoms=Array(columns).fill(0);
 grid.classList.add('is-packed');
 for(const card of cards){
  const column=bottoms.indexOf(Math.min(...bottoms));
  card.style.transform=`translate(${column*(width+gap)}px,${bottoms[column]}px)`;
  bottoms[column]+=card.getBoundingClientRect().height+gap;
 }
 grid.style.height=`${Math.max(...bottoms)-gap}px`;
}
