import {toolIntroConfig} from '../pages/tool-intro/tool-intro-config.mjs';
export function showToolWelcome({document=globalThis.document,storage,gameId='destiny-2'}={}){
  const config=toolIntroConfig(gameId),key=`astrix_intro_seen_${gameId}`;
  if(!config||document.getElementById('toolWelcome'))return;
  try{storage=storage||globalThis.localStorage;if(storage.getItem(key)==='1')return;}catch{}
  const note=document.createElement('aside');note.id='toolWelcome';note.className='tool-welcome';note.setAttribute('aria-label',config.title);
  const heading=document.createElement('h2');heading.textContent=config.title;note.append(heading);
  for(const text of [config.purpose,config.limitations]){const paragraph=document.createElement('p');paragraph.textContent=text;note.append(paragraph);}
  const close=document.createElement('button');close.type='button';close.textContent='Got it';close.addEventListener('click',()=>{try{storage.setItem(key,'1');}catch{}note.remove();});note.append(close);
  const host=document.querySelector('main')||document.body;host.append(note);
}
if(typeof document!=='undefined'){
  const show=()=>showToolWelcome();
  if(globalThis.ForgeLoader?.completed)show();else document.addEventListener('forge:portal-ready',show,{once:true});
}
