import {getBungieSession} from "./guardian-bungie-auth.mjs?v=20260905-manual-editor-1";

const SAVED_KEY="astrix-paradox-saved-loadouts";

const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];

function toast(message){
  let el=qs('#astrixBetaToast');
  if(!el){
    el=document.createElement('div');
    el.id='astrixBetaToast';
    el.setAttribute('role','status');
    document.body.appendChild(el);
  }
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove('show'),2600);
}

function modal(title,body,actions=''){
  qs('#astrixBetaModal')?.remove();
  const wrap=document.createElement('div');
  wrap.id='astrixBetaModal';
  wrap.className='beta-modal-backdrop';
  wrap.innerHTML=`<section class="beta-modal" role="dialog" aria-modal="true" aria-label="${title}">
    <header><div><small>GUARDIAN BUILD FORGE</small><h2>${title}</h2></div><button type="button" data-beta-close aria-label="Close">✕</button></header>
    <div class="beta-modal-body">${body}</div>
    ${actions?`<footer>${actions}</footer>`:''}
  </section>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-beta-close]'))wrap.remove()});
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){wrap.remove();document.removeEventListener('keydown',esc)}});
  return wrap;
}

function currentFixture(){
  return globalThis.ForgeBetaFixtures?.current?.()||'PF-BETA-03';
}

async function openLoadouts(){
  const api=globalThis.ForgeBetaFixtures;
  if(!api?.list)return toast('Loadout data is still initialising.');
  const fixtures=await api.list();
  const body=`<div class="beta-loadout-list">${fixtures.map(f=>`<button type="button" data-fixture="${f.fixtureId}" class="beta-loadout-row ${f.fixtureId===currentFixture()?'active':''}"><b>${f.displayName}</b><span>${f.className} · ${f.subclassName} · ${f.element}</span></button>`).join('')}</div>`;
  const m=modal('Loadouts',body);
  qsa('[data-fixture]',m).forEach(btn=>btn.addEventListener('click',async()=>{
    await api.load(btn.dataset.fixture);
    m.remove();
    toast(`${btn.querySelector('b')?.textContent||'Loadout'} loaded`);
  }));
}

async function openCompare(){
  const api=globalThis.ForgeBetaFixtures;
  if(!api?.list)return toast('Loadout data is still initialising.');
  const fixtures=await api.list();
  const options=fixtures.map(f=>`<option value="${f.fixtureId}">${f.displayName} · ${f.className} · ${f.subclassName}</option>`).join('');
  const m=modal('Compare Loadouts',`<p class="beta-note">Comparison switches between available loadouts without inventing performance scores.</p><div class="beta-compare-grid"><label>Current<select id="betaCompareA">${options}</select></label><label>Compare with<select id="betaCompareB">${options}</select></label></div><div id="betaCompareResult" class="beta-compare-result"></div>`,`<button type="button" class="beta-primary" id="betaCompareRun">COMPARE</button>`);
  qs('#betaCompareA',m).value=currentFixture();
  qs('#betaCompareB',m).selectedIndex=Math.min(1,fixtures.length-1);
  qs('#betaCompareRun',m).addEventListener('click',()=>{
    const a=fixtures.find(f=>f.fixtureId===qs('#betaCompareA',m).value);
    const b=fixtures.find(f=>f.fixtureId===qs('#betaCompareB',m).value);
    qs('#betaCompareResult',m).innerHTML=`<div><b>${a.displayName}</b><span>${a.className} · ${a.subclassName} · ${a.element}</span></div><strong>VS</strong><div><b>${b.displayName}</b><span>${b.className} · ${b.subclassName} · ${b.element}</span></div>`;
  });
}

function openRecommendations(){
  const strengths=qsa('.sw-card.str li').map(x=>x.textContent.trim());
  const weaknesses=qsa('.sw-card.weak li').map(x=>x.textContent.trim());
  const improvement=qs('.improve p')?.textContent?.trim()||'No recommendation loaded.';
  modal('Build Recommendations',`<p class="beta-note">This view shows only the recommendation data already loaded into Paradox Analysis.</p><div class="beta-rec-grid"><section><h3>STRENGTHS</h3>${strengths.map(x=>`<p>✓ ${x}</p>`).join('')}</section><section><h3>WEAK LINKS</h3>${weaknesses.map(x=>`<p>• ${x}</p>`).join('')}</section></div><div class="beta-improvement"><small>TODAY'S IMPROVEMENT</small><p>${improvement}</p></div>`);
}

function improveGuardian(){
  openRecommendations();
}

function destinationOptionsMarkup(){
  const api=globalThis.ForgeDestinations;
  const selected=api?.current?.()||'';
  return (api?.options?.()||[{key:'',label:'Default atmosphere'}]).map(option=>
    `<option value="${option.key}"${option.key===selected?' selected':''}>${option.label}</option>`
  ).join('');
}

function saveLoadout(){
  const id=currentFixture();
  const saved=new Set(JSON.parse(localStorage.getItem(SAVED_KEY)||'[]'));
  saved.add(id);
  localStorage.setItem(SAVED_KEY,JSON.stringify([...saved]));
  toast(`${id} saved to this browser`);
}

async function shareLoadout(){
  const url=new URL(location.href);
  url.searchParams.set('fixture',currentFixture());
  try{
    await navigator.clipboard.writeText(url.toString());
    toast('Share link copied');
  }catch{
    modal('Share Loadout',`<p>Copy this share link:</p><input class="beta-share-input" value="${url.toString().replaceAll('"','&quot;')}" readonly>`);
  }
}

function changeActivity(){
  const choices=['Grandmaster Nightfall','Raid / Dungeon','General PvE','Onslaught / Horde','PvP'];
  const m=modal('Activity Profile',`<p class="beta-note">Choose the destination atmosphere independently from the activity profile. This changes only the controlled background tint.</p><label class="destination-control"><span>DESTINATION</span><select id="betaDestination" aria-label="Destination">${destinationOptionsMarkup()}</select></label><div class="beta-activity-list">${choices.map((x,i)=>`<button type="button" data-activity="${x}" class="${i===0?'active':''}">${x}</button>`).join('')}</div>`);
  qs('#betaDestination',m)?.addEventListener('change',event=>{
    const api=globalThis.ForgeDestinations;
    const key=api?.set?.(event.target.value)||'';
    const label=api?.labelOf?.(key)||'Default atmosphere';
    const location=qs('.activity .act-hero small');
    if(location)location.textContent=label;
    toast(`${label} atmosphere selected`);
  });
  qsa('[data-activity]',m).forEach(btn=>btn.addEventListener('click',()=>{
    const label=qs('.activity .act-hero b');
    if(label)label.textContent=btn.dataset.activity;
    m.remove();
    toast(`${btn.dataset.activity} selected`);
  }));
}

function betaUnavailable(feature){
  modal(feature,`<p class="beta-note">This control is not available yet.</p><p>Your current Guardian data remains unchanged.</p>`);
}

function wireControls(){
  qs('.btn-rec')?.addEventListener('click',openRecommendations);
  qs('.improve-cta')?.addEventListener('click',improveGuardian);
  qs('.btn-change')?.addEventListener('click',changeActivity);

  qsa('.actionbar .ab-btn').forEach(btn=>{
    const text=btn.textContent.trim().toUpperCase();
    if(text.includes('LOADOUTS'))btn.addEventListener('click',openLoadouts);
    else if(text.includes('COMPARE'))btn.addEventListener('click',openCompare);
    else if(text.includes('SAVE LOADOUT'))btn.addEventListener('click',saveLoadout);
    else if(text.includes('SHARE'))btn.addEventListener('click',shareLoadout);
    else btn.addEventListener('click',()=>modal('More',`<button type="button" class="beta-menu-item" id="betaSaved">VIEW SAVED LOADOUTS</button><button type="button" class="beta-menu-item" id="betaFeedback">FORGE HELP</button>`));
  });

  qs('.view3d')?.setAttribute('role','button');
  qs('.view3d')?.setAttribute('tabindex','0');
  qs('.view3d')?.addEventListener('click',()=>betaUnavailable('View in 3D'));

  const top=qsa('.top-icons .ib');
  top[0]?.addEventListener('click',()=>toast('No new notifications'));
  top[1]?.addEventListener('click',()=>modal('Settings','<p>Bungie account settings are available through the account controls.</p>'));
  top[2]?.addEventListener('click',()=>modal('Help','<p>Use CHARACTER or LOADOUTS to switch Guardians and saved loadouts. Hover sourced icons for Bungie details. Use SHARE to copy a link.</p>'));

  qs('.gtag')?.addEventListener('click',()=>betaUnavailable('Guardian Account'));

}

function installStyles(){
  if(qs('#astrixBetaReadinessStyle'))return;
  const style=document.createElement('style');
  style.id='astrixBetaReadinessStyle';
  style.textContent=`
    #astrixBetaToast{position:fixed;left:50%;bottom:78px;z-index:300;transform:translate(-50%,20px);opacity:0;pointer-events:none;padding:10px 16px;border:1px solid rgba(158,96,255,.5);border-radius:10px;background:#120d20;color:#fff;font:600 13px Rajdhani;box-shadow:0 12px 40px #000;transition:.18s ease}#astrixBetaToast.show{opacity:1;transform:translate(-50%,0)}
    .beta-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:24px;background:rgba(2,2,8,.78);backdrop-filter:blur(8px)}.beta-modal{width:min(760px,94vw);max-height:82vh;overflow:auto;border:1px solid rgba(158,96,255,.34);border-radius:16px;background:linear-gradient(180deg,#171022,#09070f);box-shadow:0 30px 80px #000;color:#fff}.beta-modal header{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08)}.beta-modal header small{font:600 9px Orbitron;letter-spacing:.16em;color:#9e60ff}.beta-modal h2{margin:4px 0 0;font:700 18px Orbitron;letter-spacing:.08em}.beta-modal header button{width:36px;height:36px;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#aaa;background:transparent}.beta-modal-body{padding:18px 20px}.beta-modal footer{display:flex;justify-content:flex-end;padding:0 20px 18px}.beta-primary,.beta-menu-item{padding:10px 14px;border:1px solid rgba(158,96,255,.55);border-radius:8px;background:rgba(158,96,255,.14);color:#fff;font:700 11px Orbitron;letter-spacing:.08em}.beta-note{color:#aaa}.beta-loadout-list{display:grid;gap:7px}.beta-loadout-row{display:grid;grid-template-columns:1fr auto;gap:3px 16px;text-align:left;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.02);color:#fff}.beta-loadout-row span{color:#aaa}.beta-loadout-row small{grid-column:2;grid-row:1/3;color:#7956b8;align-self:center}.beta-loadout-row.active{border-color:#9e60ff}.beta-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.beta-compare-grid label{display:grid;gap:5px;color:#aaa}.beta-compare-grid select{padding:9px;background:#0d0915;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:8px}.beta-compare-result{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;margin-top:18px}.beta-compare-result div{display:grid;gap:4px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:9px}.beta-compare-result span{color:#aaa}.beta-rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.beta-rec-grid section,.beta-improvement{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}.beta-rec-grid h3,.beta-improvement small{font:700 10px Orbitron;letter-spacing:.1em;color:#a87aff}.beta-activity-list{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.beta-activity-list button{padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:rgba(255,255,255,.025);color:#fff}.beta-activity-list button.active{border-color:#9e60ff}.beta-share-input{width:100%;padding:10px;background:#08060d;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:8px}
  `;
  document.head.appendChild(style);
}

async function waitForBungieAuthentication(){
  const session=await getBungieSession();
  if(session?.authenticated)return session;
  return new Promise(resolve=>{
    globalThis.addEventListener("forge:bungie-session",event=>resolve(event.detail),{once:true});
  });
}

installStyles();
waitForBungieAuthentication().then(wireControls);
