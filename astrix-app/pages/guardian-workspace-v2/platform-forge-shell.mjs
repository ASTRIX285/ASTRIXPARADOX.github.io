const SHELL_CLASS = 'forge-platform-shell';
const VIEWPORT_CLASS = 'forge-viewport';
const STYLE_MARKER = 'forge-platform-shell-style';

function ensureShellStyles(){
  if(document.querySelector(`link[data-${STYLE_MARKER}]`)) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('./platform-forge-shell.css',import.meta.url).toString();
  link.dataset.astrixPlatformForgeShell='true';
  document.head.appendChild(link);
}

function mediaRail(side,{gameId,developerName,gameName}){
  const rail=document.createElement('aside');
  rail.className=`developer-media-rail developer-media-rail--${side}`;
  rail.dataset.mediaSide=side;
  rail.dataset.mediaState='empty';
  rail.dataset.game=gameId;
  rail.setAttribute('aria-label',`${developerName || gameName || 'Game developer'} media — ${side}`);

  const slot=document.createElement('div');
  slot.className='developer-media-slot';
  slot.dataset.mediaSlot=side;
  slot.dataset.game=gameId;
  slot.setAttribute('aria-hidden','true');
  rail.appendChild(slot);
  return rail;
}

function mountForgeShell({
  rootSelector='.workspace',
  gameId='destiny-2',
  gameName='Destiny 2',
  developerName='Bungie',
  layout='workspace'
}={}){
  ensureShellStyles();
  const root=document.querySelector(rootSelector);
  if(!root) return null;
  root.dataset.forgePageShell='true';
  root.dataset.game=gameId;
  document.documentElement.dataset.astrixGame=gameId;
  if(layout==='destination'){
    document.dispatchEvent(new CustomEvent('forge:forge-shell-mounted',{
      detail:{gameId,gameName,developerName,shell:root,viewport:root,leftRail:null,rightRail:null}
    }));
    return root;
  }
  const existing=root.closest(`.${SHELL_CLASS}`);
  if(existing) return existing;

  const shell=document.createElement('div');
  shell.className=SHELL_CLASS;
  shell.dataset.game=gameId;
  shell.dataset.developer=developerName;

  const viewport=document.createElement('div');
  viewport.className=VIEWPORT_CLASS;
  viewport.dataset.forgeViewport='true';

  const left=mediaRail('left',{gameId,developerName,gameName});
  const right=mediaRail('right',{gameId,developerName,gameName});

  root.parentNode.insertBefore(shell,root);
  shell.append(left,viewport,right);
  viewport.appendChild(root);

  document.dispatchEvent(new CustomEvent('forge:forge-shell-mounted',{
    detail:{gameId,gameName,developerName,shell,viewport,leftRail:left,rightRail:right}
  }));
  return shell;
}

function setDeveloperMedia(side,{content=null,state='ready',ariaLabel=''}={}){
  const rail=document.querySelector(`.${SHELL_CLASS} .developer-media-rail--${side}`);
  const slot=rail?.querySelector('.developer-media-slot');
  if(!rail||!slot) return false;
  if(content instanceof Node){slot.replaceChildren(content);}
  else if(typeof content==='string'){slot.innerHTML=content;}
  else if(content===null){slot.replaceChildren();}
  rail.dataset.mediaState=state;
  slot.setAttribute('aria-hidden',String(state==='empty'));
  if(ariaLabel) rail.setAttribute('aria-label',ariaLabel);
  return true;
}

export {mountForgeShell,setDeveloperMedia};
