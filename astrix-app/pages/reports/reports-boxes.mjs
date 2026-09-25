// Presentation only: keep raw missing data intact and never invent release dates.
export function boxRows(activity){
 return activity.difficulties.map(row=>({...row,difficulty:row.difficulty==='-'?'Normal':row.difficulty}))
  .sort((a,b)=>(b.cleared??0)-(a.cleared??0)||
   (b.releaseOrder??activity.releaseOrder??0)-(a.releaseOrder??activity.releaseOrder??0));
}
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
