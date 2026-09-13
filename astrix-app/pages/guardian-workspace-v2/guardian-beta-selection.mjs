import {guardianManifest} from './guardian-manifest-service.mjs?v=20260906-page-payload-1';

const MANIFEST_URL='../../data/paradox-forge/beta/beta-bungie-manifest-cache.json';
const BUNGIE_ROOT='https://www.bungie.net';
const ARTIFACT_SELECTION_KEY='astrix-paradox-beta-artifact-selection';
const CLASS_RENDER={
  hunter:'./guardian-hero-transparent.png',
  titan:'./guardian-hero-titan.png',
  warlock:'./guardian-hero-warlock.png'
};

const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const absIcon=v=>{const s=String(v??'').trim();return !s?'':s.startsWith('http')?s:`${BUNGIE_ROOT}${s}`};

let manifest=null;
let fixtures=[];
let currentClass='hunter';
let currentFixture=null;
let artifactDef=null;
let artifactHash=null;
let selectedArtifactHashes=[];

function toast(message){
  let el=qs('#astrixBetaToast');
  if(!el){el=document.createElement('div');el.id='astrixBetaToast';el.setAttribute('role','status');document.body.appendChild(el)}
  el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2400);
}

function modal(title,body){
  qs('#astrixClassArtifactModal')?.remove();
  const wrap=document.createElement('div');
  wrap.id='astrixClassArtifactModal';wrap.className='beta-modal-backdrop';
  wrap.innerHTML=`<section class="beta-modal beta-selection-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><small>GUARDIAN BUILD FORGE</small><h2>${esc(title)}</h2></div><button type="button" data-close aria-label="Close">✕</button></header><div class="beta-modal-body">${body}</div></section>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-close]'))wrap.remove()});
  return wrap;
}

async function ensureData(){
  if(!manifest){
    const [response]=await Promise.all([fetch(MANIFEST_URL,{cache:'no-store'}),guardianManifest.ready()]);
    if(!response.ok)throw new Error(`Manifest cache load failed: ${response.status}`);
    manifest=await response.json();
    const curated=Object.values(manifest.artifacts??{})[0]??null;
    artifactHash=Number(curated?.bungieHash??curated?.hash);
    artifactDef=Number.isFinite(artifactHash)?await guardianManifest.getAsync('DestinyArtifactDefinition',artifactHash):null;
  }
  const api=globalThis.ForgeBetaFixtures;
  if(api?.list)fixtures=await api.list();
}

function inventoryIdentity(hash){
  const row=guardianManifest.get('DestinyInventoryItemDefinition',hash);
  if(!row)return {hash:Number(hash),name:`Unresolved Destiny definition ${hash}`,description:'',icon:'',unresolved:true};
  return {...guardianManifest.identity(hash),hash:Number(hash),definition:row};
}

function artifactIdentity(){
  if(!artifactDef)return null;
  const display=guardianManifest.identity(artifactDef.hash??artifactHash,'DestinyArtifactDefinition');
  return {
    hash:Number(artifactDef.hash??artifactHash),
    name:display.name,
    description:display.description,
    icon:display.icon
  };
}

function allArtifactTiers(){
  return (artifactDef?.tiers??[]).map((tier,index)=>({
    tier:Number(tier.tier??index+1),
    perks:(tier.items??[]).map(item=>item?.itemHash).filter(Number.isFinite).map(inventoryIdentity)
  }));
}

function selectedArtifactPerks(){return selectedArtifactHashes.map(inventoryIdentity).filter(x=>x.icon||x.name)}

function renderArtifactSelection(){
  const artifact=artifactIdentity();
  if(!artifact)return;
  const name=qs('#artName'),icon=qs('#artIcon');
  if(name)name.textContent=artifact.name;
  if(icon){icon.src=artifact.icon;icon.alt=artifact.name;icon.style.opacity='1'}
  const perks=selectedArtifactPerks();
  const host=qs('#artPerks');
  if(host){
    host.innerHTML=Array.from({length:7},(_,i)=>{
      const p=perks[i];
      if(!p)return '<span class="artifact-perk empty" title="Select Artifact perk"><span class="ph-glyph">◆</span></span>';
      const title=[p.name,p.description].filter(Boolean).join(' — ');
      return `<span class="artifact-perk" tabindex="0" title="${esc(title)}"><img src="${esc(p.icon)}" alt="${esc(p.name)}"><span class="ph-glyph" style="display:none">◆</span></span>`;
    }).join('');
  }
  document.dispatchEvent(new CustomEvent('forge:artifact-selection-changed',{detail:{artifact,perks,source:'beta-tester-selection'}}));
}

function openArtifactPicker(){
  const tiers=allArtifactTiers();
  if(!tiers.length)return toast('Artifact catalogue is not available.');
  const body=`<p class="beta-note">DIM does not preserve Artifact selections in the shared build. Choose perks here so Guardian Build Forge can evaluate the build with an Artifact configuration. Selection is limited to 12 perks.</p><div class="beta-artifact-summary"><b>${esc(artifactIdentity()?.name||'Seasonal Artifact')}</b><span id="betaArtifactCount">${selectedArtifactHashes.length}/12 selected</span></div><div class="beta-artifact-tiers">${tiers.map(t=>`<section><h3>TIER ${t.tier}</h3><div class="beta-artifact-grid">${t.perks.map(p=>`<button type="button" class="beta-artifact-choice ${selectedArtifactHashes.includes(p.hash)?'selected':''}" data-artifact-hash="${p.hash}" title="${esc(p.description)}"><span>${p.icon?`<img src="${esc(p.icon)}" alt="">`:'◆'}</span><b>${esc(p.name)}</b></button>`).join('')}</div></section>`).join('')}</div><div class="beta-artifact-actions"><button type="button" class="beta-menu-item" id="betaArtifactClear">CLEAR</button><button type="button" class="beta-primary" id="betaArtifactApply">APPLY ARTIFACT</button></div>`;
  const wrap=modal('Artifact Loadout',body);
  qsa('[data-artifact-hash]',wrap).forEach(btn=>btn.addEventListener('click',()=>{
    const hash=Number(btn.dataset.artifactHash);
    const at=selectedArtifactHashes.indexOf(hash);
    if(at>=0){selectedArtifactHashes.splice(at,1);btn.classList.remove('selected')}
    else if(selectedArtifactHashes.length<12){selectedArtifactHashes.push(hash);btn.classList.add('selected')}
    else return toast('Artifact selection supports 12 perks.');
    const count=qs('#betaArtifactCount',wrap);if(count)count.textContent=`${selectedArtifactHashes.length}/12 selected`;
  }));
  qs('#betaArtifactClear',wrap)?.addEventListener('click',()=>{selectedArtifactHashes=[];qsa('.beta-artifact-choice',wrap).forEach(x=>x.classList.remove('selected'));const count=qs('#betaArtifactCount',wrap);if(count)count.textContent='0/12 selected'});
  qs('#betaArtifactApply',wrap)?.addEventListener('click',()=>{sessionStorage.setItem(ARTIFACT_SELECTION_KEY,JSON.stringify(selectedArtifactHashes));renderArtifactSelection();wrap.remove();toast('Artifact loadout applied for analysis')});
}

function groupFixturesByClass(){
  const result={hunter:[],titan:[],warlock:[]};
  fixtures.forEach(f=>{const key=String(f.className??'').toLowerCase();if(result[key])result[key].push(f)});
  return result;
}

function updateClassRender(className){
  currentClass=String(className??'hunter').toLowerCase();
  const render=qs('#guardianRender');
  if(!render)return;
  const src=CLASS_RENDER[currentClass];
  render.dataset.guardianClass=currentClass;
  render.onerror=()=>{
    render.style.display='none';
    const hero=qs('#guardianHero');
    if(hero){hero.dataset.missingClassRender=currentClass;hero.setAttribute('aria-label',`${currentClass} Guardian render unavailable`)}
  };
  render.onload=()=>{render.style.display='block';qs('#guardianHero')?.removeAttribute('data-missing-class-render')};
  render.src=src;
}

function openGuardianPicker(){
  const grouped=groupFixturesByClass();
  const classes=['hunter','titan','warlock'];
  const body=`<p class="beta-note">Choose a Guardian class, then load one of the available builds for that class.</p><div class="beta-class-tabs">${classes.map(c=>`<button type="button" data-guardian-class="${c}" class="${c===currentClass?'active':''}">${c.toUpperCase()} <small>${grouped[c].length} BUILDS</small></button>`).join('')}</div><div id="betaClassLoadouts" class="beta-class-loadouts"></div>`;
  const wrap=modal('Choose Guardian',body);
  const renderList=cls=>{
    const host=qs('#betaClassLoadouts',wrap);if(!host)return;
    host.innerHTML=grouped[cls].length?grouped[cls].map(f=>`<button type="button" class="beta-loadout-row ${f.fixtureId===currentFixture?'active':''}" data-class-fixture="${f.fixtureId}"><b>${esc(f.displayName)}</b><span>${esc(f.subclassName)} · ${esc(f.element)}</span></button>`).join(''):'<p class="beta-note">No builds are available for this class yet.</p>';
    qsa('[data-class-fixture]',host).forEach(btn=>btn.addEventListener('click',async()=>{await globalThis.ForgeBetaFixtures.load(btn.dataset.classFixture);wrap.remove()}));
  };
  qsa('[data-guardian-class]',wrap).forEach(btn=>btn.addEventListener('click',()=>{
    const cls=btn.dataset.guardianClass;qsa('[data-guardian-class]',wrap).forEach(x=>x.classList.toggle('active',x===btn));renderList(cls);
  }));
  renderList(currentClass);
}

function installStyles(){
  if(qs('#astrixBetaSelectionStyles'))return;
  const style=document.createElement('style');style.id='astrixBetaSelectionStyles';
  style.textContent=`
    .gear-layout-active>.gear-weapons{height:var(--pf-bottom-panel-height,auto)!important;min-height:var(--pf-bottom-panel-height,0)!important;align-self:stretch!important}
    .artifact-row{cursor:pointer}.artifact-row:focus-visible{outline:1px solid #9e60ff;outline-offset:4px}
    .beta-selection-modal{width:min(980px,95vw)!important}.beta-class-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.beta-class-tabs button{padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.025);color:#fff;font:700 11px Orbitron}.beta-class-tabs button small{display:block;margin-top:4px;color:#777}.beta-class-tabs button.active{border-color:#9e60ff;background:rgba(158,96,255,.12)}.beta-class-loadouts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.beta-artifact-summary{display:flex;justify-content:space-between;align-items:center;margin:10px 0 16px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:8px}.beta-artifact-summary span{color:#9e60ff}.beta-artifact-tiers{display:grid;gap:12px}.beta-artifact-tiers section{padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:10px}.beta-artifact-tiers h3{margin:0 0 8px;color:#a87aff;font:700 10px Orbitron}.beta-artifact-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.beta-artifact-choice{display:grid;gap:5px;justify-items:center;min-width:0;padding:7px 4px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.02);color:#ddd}.beta-artifact-choice span{width:42px;height:42px;display:grid;place-items:center;border-radius:7px;background:#16111f}.beta-artifact-choice img{width:100%;height:100%;object-fit:contain}.beta-artifact-choice b{max-width:100%;font:600 8px Rajdhani;line-height:1.05;text-align:center}.beta-artifact-choice.selected{border-color:#33d6c7;box-shadow:inset 0 0 0 1px rgba(51,214,199,.25);background:rgba(51,214,199,.06)}.beta-artifact-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}#guardianHero[data-missing-class-render]:after{content:attr(aria-label);position:absolute;inset:45% auto auto 50%;transform:translate(-50%,-50%);padding:10px 14px;border:1px solid rgba(158,96,255,.3);border-radius:8px;background:rgba(10,7,16,.8);color:#aaa;font:600 10px Orbitron;letter-spacing:.08em}@media(max-width:900px){.beta-artifact-grid{grid-template-columns:repeat(4,1fr)}.beta-class-loadouts{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function syncBottomHeight(){
  const armour=qs('.gear-combined');
  if(!armour)return;
  requestAnimationFrame(()=>{const h=Math.ceil(armour.getBoundingClientRect().height);if(h>0)document.documentElement.style.setProperty('--pf-bottom-panel-height',`${h}px`)});
}

function installInteractions(){
  const old=qs('#astrixBetaFixtureSelect');if(old)old.style.pointerEvents='none';
  const char=qs('.char-switch');if(char){char.style.cursor='pointer';char.addEventListener('click',e=>{if(e.target.closest('select'))return;openGuardianPicker()})}
  const art=qs('.artifact-row');if(art){art.tabIndex=0;art.setAttribute('role','button');art.setAttribute('aria-label','Configure Artifact loadout');art.addEventListener('click',openArtifactPicker);art.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openArtifactPicker()}})}
  window.addEventListener('resize',syncBottomHeight);
  document.addEventListener('forge:guardian-selection-changed',e=>{
    currentFixture=e.detail?.fixtureId??currentFixture;
    const cls=String(e.detail?.className??e.detail?.characterClass??currentClass).toLowerCase();
    updateClassRender(cls);setTimeout(()=>{const s=qs('#astrixBetaFixtureSelect');if(s)s.style.pointerEvents='none';syncBottomHeight()},40);
  });
}

async function start(){
  installStyles();
  try{selectedArtifactHashes=JSON.parse(sessionStorage.getItem(ARTIFACT_SELECTION_KEY)||'[]').map(Number).filter(Number.isFinite)}catch{selectedArtifactHashes=[]}
  try{await ensureData();renderArtifactSelection()}catch(error){console.error('[Paradox beta class/artifact selector]',error)}
  installInteractions();
  setTimeout(syncBottomHeight,250);
}

start();
