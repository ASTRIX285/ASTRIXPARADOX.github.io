const SOURCE=location.pathname.includes('/paradox-build-space/')?'build':'character';
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
let context={characterId:'',membershipId:'',membershipType:''};

const text=value=>String(value??'').trim();

function buildBinding(detail={}){
  const membership=detail?.membership||{};
  return {
    characterId:text(detail.characterId),
    membershipId:text(detail.membershipId||detail.bungieMembershipId||membership.membershipId),
    membershipType:text(detail.membershipType||membership.membershipType)
  };
}

function storedCharacterId(){
  try{return text(sessionStorage.getItem(SELECTED_CHARACTER_KEY));}
  catch{return '';}
}

function mergeContext(detail={}){
  const incoming=buildBinding(detail);
  context={
    characterId:incoming.characterId||context.characterId||storedCharacterId(),
    membershipId:incoming.membershipId||context.membershipId,
    membershipType:incoming.membershipType||context.membershipType
  };
  updateRibbonLink();
}

function forgeLoaderTargetUrl(slot=null){
  const url=new URL('/astrix-app/pages/forge-loader/',location.origin);
  url.searchParams.set('from',SOURCE);
  const binding={...context,characterId:context.characterId||storedCharacterId()};
  for(const [key,value] of Object.entries(binding))if(value)url.searchParams.set(key,value);
  if(Number.isInteger(Number(slot))&&Number(slot)>=0){
    const slotKeys=['helmet','gauntlets','chest','legs','class-item'];
    url.searchParams.set('slot',slotKeys[Number(slot)]||'all');
  }
  return url;
}

function forgeLoaderUrl(slot=null){
  return forgeLoaderTargetUrl(slot);
}

function updateRibbonLink(){
  const link=[...document.querySelectorAll('.apx-destination-ribbon a')].find(anchor=>new URL(anchor.href,location.href).pathname==='/astrix-app/pages/forge-loader/');
  if(link)link.href=forgeLoaderUrl();
}

function installStyles(){
  if(document.getElementById('guardianVaultAccessStyles'))return;
  const style=document.createElement('style');
  style.id='guardianVaultAccessStyles';
  style.textContent='.guardian-vault-select{display:flex;align-items:center;justify-content:center;width:100%;margin-top:.75rem;padding:.7rem .8rem;border:1px solid rgba(201,168,76,.58);color:#f4dda0;background:linear-gradient(135deg,rgba(123,7,18,.92),rgba(30,7,10,.96));font:800 .62rem/1.2 Orbitron,system-ui,sans-serif;letter-spacing:.08em;text-decoration:none}.guardian-vault-select:hover,.guardian-vault-select:focus-visible{border-color:#e2c567;outline:none;box-shadow:0 0 1rem rgba(139,0,0,.3)}';
  document.head.appendChild(style);
}

function mountDrawerLink(slot){
  const panel=document.querySelector('[data-panel="build"]');
  if(!panel)return;
  panel.querySelector('.guardian-vault-select')?.remove();
  const link=document.createElement('a');
  link.className='guardian-vault-select';
  link.href=forgeLoaderUrl(slot);
  link.textContent='OPEN FORGE LOADER';
  link.addEventListener('click',()=>{
    globalThis.ForgeLoader?.mount?.();
    globalThis.ForgeLoader?.status?.('Opening Forge Loader…');
  });
  panel.appendChild(link);
}

function handleArmourActivation(event){
  const arm=event.target.closest('.gear-slot .arm');
  if(!arm)return;
  const slot=Number(arm.closest('[data-armour-index]')?.dataset.armourIndex);
  if(!Number.isInteger(slot))return;
  if(SOURCE==='build'){
    event.preventDefault();
    globalThis.ForgeLoader?.mount?.();
    globalThis.ForgeLoader?.status?.('Opening Forge Loader…');
    location.href=forgeLoaderUrl(slot);
    return;
  }
  requestAnimationFrame(()=>mountDrawerLink(slot));
}

function handleArmourKey(event){
  if(SOURCE!=='build'||!['Enter',' '].includes(event.key))return;
  if(!event.target.closest('.gear-slot .arm'))return;
  event.preventDefault();
  handleArmourActivation(event);
}

function preserveCharacterBuild(event){
  if(SOURCE!=='character')return;
  const link=event.target.closest('a');
  if(!link)return;
  if(new URL(link.href,location.href).pathname!=='/astrix-app/pages/forge-loader/')return;
  document.dispatchEvent(new CustomEvent('forge:vault-open'));
}

function install(){
  installStyles();
  mergeContext();
  updateRibbonLink();
  document.addEventListener('click',preserveCharacterBuild,true);
  document.addEventListener('click',handleArmourActivation);
  document.addEventListener('keydown',handleArmourKey);
  document.addEventListener('forge:character-selected',event=>mergeContext(event.detail||{}));
  document.addEventListener('forge:guardian-selection-changed',event=>mergeContext(event.detail||{}));
  document.addEventListener('forge:guardian-loadout-context',event=>mergeContext(event.detail||{}));
  document.addEventListener('forge:build-render-complete',updateRibbonLink);
  const ribbon=document.querySelector('[data-forge-destination-ribbon]');
  if(ribbon)new MutationObserver(updateRibbonLink).observe(ribbon,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();

export {buildBinding,forgeLoaderTargetUrl,forgeLoaderUrl};
