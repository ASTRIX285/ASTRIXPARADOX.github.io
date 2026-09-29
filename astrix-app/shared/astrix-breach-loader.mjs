/* ASTRIX PARADOX entry skin: the approved hero and loader concept (28 Sep 2026).
   Bevelled slabs form the X of ASTRIX across the whole screen, a strobe runs
   along their lit edges, the chrome ASTRIX wordmark with the red X sits in the
   centre, and the loading bar lives in a notched tab on the bottom edge.
   Replaces the glass breach: no shards, no glass and no gold.

   Used as the shared portal's entry skin on tool pages. Plain DOM and SVG, no
   libraries. The controller keeps its still fallback when this module cannot
   load in time or the player prefers reduced motion. Styles live in
   astrix-portal-loader.css under .apx-xscene. */

const SVG_NS='http://www.w3.org/2000/svg';
// Geometry copied from the approved concept board (1280 x 720 frame).
const FRONT=[['-80,-20 90,-20 700,590 530,590',[90,-20,700,590]],['1360,-20 1190,-20 580,590 750,590',[1190,-20,580,590]]];
const BACK=[['-80,740 90,740 520,310 350,310',[90,740,520,310]],['1360,740 1190,740 760,310 930,310',[1190,740,760,310]]];

function svgNode(tag,attributes={}){
  const node=document.createElementNS(SVG_NS,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}

function buildScene(){
  const svg=svgNode('svg',{viewBox:'0 0 1280 720',preserveAspectRatio:'xMidYMid slice','aria-hidden':'true',focusable:'false'});
  const defs=svgNode('defs');
  const slab=svgNode('linearGradient',{id:'apxXSlab',x1:0,y1:0,x2:0,y2:1});
  slab.append(svgNode('stop',{offset:0,'stop-color':'#211e19'}),svgNode('stop',{offset:1,'stop-color':'#0e0c09'}));
  const grid=svgNode('pattern',{id:'apxXGrid',width:48,height:48,patternUnits:'userSpaceOnUse'});
  grid.append(svgNode('path',{d:'M48 0H0V48',fill:'none',stroke:'#ffffff','stroke-opacity':.05,'stroke-width':1}));
  const fade=svgNode('radialGradient',{id:'apxXFade',cx:.5,cy:.5,r:.5});
  fade.append(svgNode('stop',{offset:0,'stop-color':'#fff','stop-opacity':1}),svgNode('stop',{offset:1,'stop-color':'#fff','stop-opacity':0}));
  const mask=svgNode('mask',{id:'apxXGridMask'});
  mask.append(svgNode('rect',{x:0,y:0,width:1280,height:720,fill:'url(#apxXFade)'}));
  defs.append(slab,grid,fade,mask);
  svg.append(defs,svgNode('rect',{x:340,y:120,width:600,height:480,fill:'url(#apxXGrid)',mask:'url(#apxXGridMask)'}));
  const [left,right]=FRONT;
  svg.append(svgNode('polygon',{points:left[0],fill:'url(#apxXSlab)'}));
  svg.append(svgNode('line',{x1:-80,y1:-20,x2:530,y2:590,stroke:'#050403','stroke-width':2}));
  svg.append(svgNode('polygon',{points:right[0],fill:'url(#apxXSlab)'}));
  for(const [points] of BACK)svg.append(svgNode('polygon',{points,fill:'url(#apxXSlab)',opacity:.75}));
  [...FRONT,...BACK].forEach(([,edge],index)=>{
    const [x1,y1,x2,y2]=edge;
    svg.append(svgNode('line',{class:`apx-xscene-edge apx-xscene-d${index}`,x1,y1,x2,y2}));
    // Front slabs: the light runs up the edge. Back slabs: it runs inwards.
    const [sx1,sy1,sx2,sy2]=index<2?[x2,y2,x1,y1]:[x1,y1,x2,y2];
    svg.append(svgNode('line',{class:`apx-xscene-streak apx-xscene-d${index}`,pathLength:1000,x1:sx1,y1:sy1,x2:sx2,y2:sy2}));
  });
  return svg;
}

export async function createBreach({host,signal}={}){
  signal?.throwIfAborted?.();
  // The wordmark face must be ready so the scene never flashes a fallback font.
  await Promise.race([document.fonts?.load?.('400 118px Michroma'),new Promise(resolve=>setTimeout(resolve,600))]).catch(()=>{});
  signal?.throwIfAborted?.();

  const scene=document.createElement('div');
  scene.className='apx-xscene';
  scene.append(buildScene());

  const word=document.createElement('div');
  word.className='apx-xscene-word';
  word.innerHTML='<span class="apx-xscene-kicker">AI GAMING INTELLIGENCE</span><span class="apx-xscene-top"><span class="apx-xscene-chrome">ASTRI</span><b>X</b></span><span class="apx-xscene-sub">PARADOX</span>';

  const tab=document.createElement('div');
  tab.className='apx-xscene-tab';
  const label=document.createElement('span');
  label.className='apx-xscene-label';label.textContent='LOADING YOUR GUARDIAN';
  const track=document.createElement('span');
  track.className='apx-xscene-track';
  const bar=document.createElement('span');
  bar.className='apx-xscene-bar';
  track.append(bar);tab.append(label,track);

  scene.append(word,tab);
  host.append(scene);
  requestAnimationFrame(()=>scene.classList.add('is-on'));

  const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
  return {
    setProgress(value){bar.style.transform=`scaleX(${clamp01(value)})`;},
    dispose(){scene.remove();}
  };
}
