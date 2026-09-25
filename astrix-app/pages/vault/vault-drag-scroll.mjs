// Drag-only scrolling. Inventory layout and Bungie requests are not involved.
export function createVaultDragScroll({onScroll=()=>{}}={}){
  let frame=0,point=null;
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;point=null;}
  function velocity(){
    if(!point||point.x<0||point.x>innerWidth||point.y<0||point.y>innerHeight)return 0;
    let top=0;
    for(const node of document.querySelectorAll('.apx-destination-header,[data-forge-destination-ribbon]')){
      if(!['fixed','sticky'].includes(getComputedStyle(node).position))continue;
      const box=node.getBoundingClientRect();
      if(box.top<innerHeight&&box.bottom>0)top=Math.max(top,box.bottom);
    }
    if(point.y<top+80)return -20*Math.min(1,Math.max(0,(top+80-point.y)/80));
    if(point.y>innerHeight-80)return 20*Math.min(1,(point.y-(innerHeight-80))/80);
    return 0;
  }
  function tick(){
    frame=0;const speed=velocity();if(!speed){stop();return;}
    const before=scrollY;window.scrollBy({top:speed,left:0,behavior:'instant'});
    if(scrollY===before){stop();return;}
    onScroll(point.x,point.y);frame=requestAnimationFrame(tick);
  }
  function update(x,y){
    point={x,y};if(!velocity()){stop();return;}
    if(!frame)frame=requestAnimationFrame(tick);
  }
  return {update,stop};
}
