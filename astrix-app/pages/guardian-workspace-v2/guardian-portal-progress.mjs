import {guardianManifest} from "./guardian-manifest-service.mjs?v=20260906-all-page-data-1";
import {PORTAL_TRANSITION_KEY} from "./guardian-session-cache.mjs?v=20260906-all-page-data-1";
import {PREPARED_PAGE_STAGES} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';

const loader=window.ForgeLoader;
const manifestReady=guardianManifest.ready();
const isBuildSpace=Boolean(document.querySelector('.build-space'));
const BACKGROUND_DECODE_TIMEOUT_MS=5*1000;
let buildRenderStatus='',profileSettled=false,profileFailed=false,finishRevision=0;
const buildHeaderSettled=()=>!document.querySelector('#guardianCharacterCards .is-pending');
const maybeFinishBuild=()=>{
  if(!isBuildSpace||!buildHeaderSettled())return;
  if(buildRenderStatus==='ready')finishAfterPaint('Build Forge rendered');
  else if(buildRenderStatus==='pending'&&profileSettled)finishAfterPaint(profileFailed?'Build Forge recovery available':'Guardian selection ready');
};
const set=(percent,label)=>{loader?.set(percent);if(label)loader?.status(label);};
const setStage=stage=>{const row=PREPARED_PAGE_STAGES[stage];set(row.percent,row.label);};
const sceneBackgroundUrls=()=>{
  const urls=new Set();
  const pattern=/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/g;
  document.querySelectorAll('.scene.immersive').forEach(node=>{
    const value=getComputedStyle(node).backgroundImage||'';
    for(const match of value.matchAll(pattern)){
      const path=String(match[1]||match[2]||match[3]||'').trim();
      if(path&&!path.startsWith('data:'))urls.add(new URL(path,document.baseURI).href);
    }
  });
  return [...urls];
};
const decodeBackground=url=>new Promise(resolve=>{
  const image=new Image();
  let settled=false;
  const finish=()=>{
    if(settled)return;
    settled=true;
    clearTimeout(timeout);
    resolve();
  };
  const timeout=setTimeout(finish,BACKGROUND_DECODE_TIMEOUT_MS);
  image.decoding='async';
  image.addEventListener('load',async()=>{try{await image.decode();}catch{}finish();},{once:true});
  image.addEventListener('error',finish,{once:true});
  image.src=url;
});
const sceneBackgroundReady=Promise.all(sceneBackgroundUrls().map(decodeBackground));
const finishAfterPaint=async label=>{
  const revision=++finishRevision;
  await manifestReady;
  await sceneBackgroundReady;
  if(revision!==finishRevision)return;
  void label;
  setStage('ready');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(revision===finishRevision)loader?.done();}));
};

try{
  const transition=JSON.parse(sessionStorage.getItem(PORTAL_TRANSITION_KEY)||'null');
  sessionStorage.removeItem(PORTAL_TRANSITION_KEY);
  if(transition&&Date.now()-Number(transition.armedAt||0)<30_000)set(0,transition.label||'Opening Build Forge');
}catch{}

setStage('start');
document.addEventListener('forge:manifest-progress',()=>setStage('request'));
document.addEventListener('forge:prepared-page-progress',event=>set(Number(event.detail?.percent)||PREPARED_PAGE_STAGES.start.percent,event.detail?.label||PREPARED_PAGE_STAGES.start.label));
document.addEventListener('forge:guardian-loading',()=>{finishRevision++;profileSettled=false;profileFailed=false;setStage('session');});
window.addEventListener('forge:bungie-session',event=>{
  if(event.detail?.authenticated)setStage('session');
  else setStage('start');
});
document.addEventListener('forge:bungie-profile-loaded',event=>{
  profileSettled=Boolean(event.detail?.pendingSelection);queueMicrotask(maybeFinishBuild);
  if(event.detail?.pendingSelection&&!isBuildSpace)finishAfterPaint('Guardian selection ready');
  else setStage('join');
});
document.addEventListener('forge:guardian-selection-changed',()=>setStage('render'));
document.addEventListener('forge:beta-fixture-loaded',()=>setStage('render'));
document.addEventListener('forge:guardian-render-complete',()=>{if(!isBuildSpace)finishAfterPaint('Guardian build rendered');},{once:true});
document.addEventListener('forge:build-render-complete',event=>{
  finishRevision++;buildRenderStatus=event.detail?.status||'';
  if(buildRenderStatus==='pending')setStage('session');
  maybeFinishBuild();
});
document.addEventListener('forge:bungie-character-roster',()=>queueMicrotask(maybeFinishBuild));
document.addEventListener('forge:guardian-loadout-context',()=>{finishRevision++;profileSettled=false;});
document.addEventListener('forge:guardian-error',()=>{profileSettled=true;profileFailed=true;if(isBuildSpace)queueMicrotask(maybeFinishBuild);else finishAfterPaint('Guardian state rendered');});

const currentSession=window.FORGE_BUNGIE_SESSION;
if(!isBuildSpace&&document.documentElement.dataset.guardianRenderComplete==='true')finishAfterPaint('Guardian build rendered');
else if(currentSession?.authenticated)setStage('session');
else if(currentSession)setStage('start');
