// Inline-size containment deliberately hides intrinsic widths from the parent.
// Resolve the existing socket/art/mod tokens, then size all cards explicitly.
const installed=new WeakMap();
const number=value=>Number.parseFloat(value)||0;
const horizontal=style=>number(style.paddingLeft)+number(style.paddingRight)+number(style.borderLeftWidth)+number(style.borderRightWidth);
export function sizeBuildWeaponCards(grid){
  if(!grid)return;
  const section=grid.closest('.weapon-design-section');
  if(!section)return;
  if(installed.has(grid)){installed.get(grid)();return;}
  const rules=document.createElement('style');
  rules.dataset.buildWeaponCardLayout='';document.head.append(rules);
  let lastWidth=0,lastThreshold=0,frame=0;
  const update=()=>{
    const cards=[...grid.querySelectorAll('.weap')];
    if(!cards.length)return;
    let content=0,padding=0;
    for(const card of cards){
      padding=Math.max(padding,horizontal(getComputedStyle(card)));
      const art=card.querySelector('.art');
      if(art)content=Math.max(content,number(getComputedStyle(art).width));
      for(const matrix of card.querySelectorAll('.weapon-perk-matrix')){
        const row=matrix.querySelector('.weapon-perk-row'),cell=row?.querySelector('.weapon-perk-cell');
        if(!cell)continue;
        // Cells consume the matrix's --gear-weapon-socket; width resolves cqi/calc.
        // Use the rendered socket columns of this weapon, never an assumed eight-column loadout.
        const columns=row.querySelectorAll('.weapon-perk-cell').length;
        const socket=number(getComputedStyle(cell).width),gap=number(getComputedStyle(row).columnGap);
        const strip=matrix.closest('.weapon-perk-strip');
        content=Math.max(content,horizontal(getComputedStyle(strip||matrix))+columns*socket+Math.max(0,columns-1)*gap+horizontal(getComputedStyle(matrix)));
        // Explicit block contribution prevents contained subgrid cards from
        // sizing the shared perks track to only the first weapon's row count.
        const rows=[...matrix.querySelectorAll('.weapon-perk-row')],style=getComputedStyle(matrix);
        const height=rows.reduce((sum,row)=>sum+Math.max(...[...row.querySelectorAll('.weapon-perk-cell')].map(cell=>cell.getBoundingClientRect().height),0),0)
          +Math.max(0,rows.length-1)*number(style.rowGap)+number(style.paddingTop)+number(style.paddingBottom)
          +number(style.borderTopWidth)+number(style.borderBottomWidth);
        if(strip)strip.style.minHeight=`${Math.ceil(height)}px`;
      }
      const mods=card.querySelector('.weapon-support-icons');
      if(mods){
        const children=[...mods.children],style=getComputedStyle(mods);
        content=Math.max(content,children.reduce((sum,child)=>sum+number(getComputedStyle(child).width),0)+Math.max(0,children.length-1)*number(style.columnGap)+horizontal(style));
      }
    }
    const width=Math.ceil(content+padding),gap=number(getComputedStyle(grid).columnGap),threshold=3*width+2*gap,twoThreshold=2*width+gap;
    if(width!==lastWidth){grid.style.setProperty('--build-weapon-card',`${width}px`);lastWidth=width;}
    if(threshold!==lastThreshold){
      // Size queries cannot reference custom properties. Emit the resolved
      // threshold from the same card width used by both layouts.
      rules.textContent=`@container build-weapon-section (width < ${threshold}px){.design-canvas .weapon-design-section .gear-weapons .weap-grid{grid-template-columns:repeat(2,var(--build-weapon-card))!important;}}
@container build-weapon-section (width < ${twoThreshold}px){.design-canvas .weapon-design-section .gear-weapons .weap-grid{grid-template-columns:var(--build-weapon-card)!important;}}`;
      lastThreshold=threshold;
    }
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
  new ResizeObserver(schedule).observe(section);
  new MutationObserver(schedule).observe(grid,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);
  installed.set(grid,update);update();
}
