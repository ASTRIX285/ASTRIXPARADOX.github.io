// Bungie item icons in order (perf, 26 Nov 2026). Forge Loader and Armoury rendered every icon at
// once, so on a phone 50 to 70 bungie.net requests started in one burst and held up the page.
// Markup from bungieIconAttributes() carries the icon URL in data-bungie-icon with its width and
// height, so the tile keeps its size before the file arrives. Icons on screen load first, the rest
// as they come within reach of the screen, never more than MAX_IN_FLIGHT at a time. An icon this
// page has already shown is set at once, so a re-render never blinks. The icon file is used as
// Bungie serves it: never recoloured, cropped or edited.
const MAX_IN_FLIGHT=6;
const NEAR_SCREEN='200px 0px';
const shown=new Set(),queue=[];
let inFlight=0,observer=null;

const escapeAttribute=value=>String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// Attributes for an <img> that shows a Bungie icon: alt and classes stay with the caller.
export function bungieIconAttributes(src,{width=96,height=96}={}){
  return `data-bungie-icon="${escapeAttribute(src)}" width="${Number(width)}" height="${Number(height)}" decoding="async"`;
}

function load(img){
  const src=img.dataset.bungieIcon;
  delete img.dataset.bungieIcon;
  if(!src||img.getAttribute('src')===src)return false;
  img.src=src;
  return true;
}

function pump(){
  while(inFlight<MAX_IN_FLIGHT&&queue.length){
    const img=queue.shift();
    if(!img.isConnected||!img.dataset.bungieIcon)continue;
    const src=img.dataset.bungieIcon;
    if(!load(img))continue;
    inFlight++;
    const settle=()=>{img.removeEventListener('load',settle);img.removeEventListener('error',settle);inFlight--;shown.add(src);pump();};
    img.addEventListener('load',settle);img.addEventListener('error',settle);
  }
}

function watch(img){
  const src=img.dataset.bungieIcon;
  if(!src)return;
  if(shown.has(src)||typeof IntersectionObserver!=='function'){load(img);return;}
  observer||=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.push(entry.target);}
    pump();
  },{rootMargin:NEAR_SCREEN});
  observer.observe(img);
}

function scan(node){
  if(node.nodeType!==1)return;
  if(node.matches('img[data-bungie-icon]'))watch(node);
  for(const img of node.querySelectorAll('img[data-bungie-icon]'))watch(img);
}

if(typeof document!=='undefined'&&typeof MutationObserver==='function'){
  // Runs before the next paint, so an icon shown before is back in the same frame.
  const forget=node=>{
    if(!observer||node.nodeType!==1)return;
    if(node.matches('img[data-bungie-icon]'))observer.unobserve(node);
    for(const img of node.querySelectorAll('img[data-bungie-icon]'))observer.unobserve(img);
  };
  new MutationObserver(records=>{for(const record of records){for(const node of record.removedNodes)forget(node);for(const node of record.addedNodes)scan(node);}})
    .observe(document.documentElement,{childList:true,subtree:true});
  scan(document.documentElement);
}
