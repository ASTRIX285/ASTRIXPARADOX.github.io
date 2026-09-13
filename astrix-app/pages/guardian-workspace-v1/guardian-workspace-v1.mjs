const $=(selector,root=document)=>root.querySelector(selector);
const all=(selector,root=document)=>[...root.querySelectorAll(selector)];
const safe=value=>String(value??'').replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));

function hexToRgb(hex){const value=String(hex||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(value))return '159,102,255';return `${parseInt(value.slice(0,2),16)},${parseInt(value.slice(2,4),16)},${parseInt(value.slice(4,6),16)}`;}
function setText(selector,value){const node=$(selector);if(node)node.textContent=value??'';}
function setImage(selector,url,alt=''){const node=$(selector);if(!node)return;node.src=url||'';node.alt=alt;node.hidden=!url;}
function setHidden(node,hidden){if(node)node.hidden=Boolean(hidden);}

function card(item,meta=''){
  const icon=item.iconUrl?`<img src="${safe(item.iconUrl)}" alt="${safe(item.name)}">`:'<div class="icon-fallback" aria-hidden="true"></div>';
  return `<button class="build-card${item.equipped?' is-equipped':''}" data-inspect="${safe(item.id)}" data-description="${safe(item.description||meta||'')}" type="button">${item.equipped?'<span class="equipped-dot">✓</span>':''}${icon}<strong>${safe(item.name)}</strong><small>${safe(meta||item.state||'Available')}</small></button>`;
}
function renderMeters(items=[]){return items.map(item=>`<div class="meter"><label>${safe(item.label)}</label><span class="meter-track"><i style="width:${Math.max(0,Math.min(100,Number(item.value)||0))}%"></i></span><b>${safe(item.value)}%</b></div>`).join('');}
function renderCoverage(items=[]){return items.map(item=>`<div class="coverage-row"><span>${safe(item.label)}</span><strong class="${item.covered?'status-good':'status-bad'}">${item.covered?'✓ Covered':'✕ Missing'}</strong></div>`).join('');}
function renderPath(nodes=[]){return nodes.map((node,index)=>`${index?'<span class="path-arrow">→</span>':''}<button class="path-node" type="button" data-path-node="${safe(node)}">${safe(node)}</button>`).join('');}
function renderRecommendations(items=[]){return items.map(item=>`<article class="recommendation"><strong>${safe(item.title)}</strong><p>${safe(item.reason)}</p></article>`).join('');}
function renderInsights(items=[]){return items.map(item=>`<div class="insight-row">${safe(item)}</div>`).join('');}
function renderArmour(items=[]){return items.map(item=>`<button class="armour-item" data-inspect="${safe(item.id)}" data-description="${safe(item.description||item.name)}" title="${safe(item.name)}">${item.iconUrl?`<img src="${safe(item.iconUrl)}" alt="">`:safe(item.shortLabel||item.slot)}</button>`).join('');}
function renderStageStats(stats=[]){return stats.map(item=>`<div>${safe(item.value)} · ${safe(item.name)}</div>`).join('');}
function dockCard(item){return `<article class="dock-card" data-inspect="${safe(item.id)}" data-description="${safe(item.description||item.type||'Equipment')}"><h3>${safe(item.slot)}</h3><div class="dock-main">${item.iconUrl?`<img src="${safe(item.iconUrl)}" alt="${safe(item.name)}">`:'<span class="dock-image-fallback"></span>'}<div><strong>${safe(item.name)}</strong><small>${safe(item.type||'Equipment')}</small><b>${item.power?safe(item.power):'Unavailable'}</b></div></div></article>`;}
function statsCard(stats=[]){return `<article class="dock-card"><h3>Stats</h3>${stats.map(item=>`<div class="stat-row"><span>${safe(item.name)}</span><span><i style="width:${Math.min(100,Number(item.value)||0)}%"></i></span><b>${safe(item.value)}</b></div>`).join('')}</article>`;}
function modsCard(mods=[]){const values=mods.length?mods:Array.from({length:8},(_,i)=>({name:`Mod ${i+1}`}));return `<article class="dock-card"><h3>Armor Mods</h3><div class="mods-grid">${values.map(mod=>`<button class="mod-box" type="button" data-inspect="${safe(mod.id||mod.name)}" data-description="${safe(mod.description||'Mod details load from Guardian data.')}" title="${safe(mod.name)}">${mod.iconUrl?`<img src="${safe(mod.iconUrl)}" alt="">`:'◇'}</button>`).join('')}</div></article>`;}
function activityCard(activity){return `<article class="dock-card"><h3>Activity</h3><strong>${safe(activity?.name||'No activity selected')}</strong><p>${activity?`Champions: ${safe((activity.champions||[]).join(', ')||'None')}<br>Surge: ${safe(activity.surge||'None')}<br>${safe(activity.location||'')}`:'Select an activity to adapt recommendations.'}</p></article>`;}

function bindInspection(){
  all('[data-inspect]').forEach(node=>node.addEventListener('click',()=>{
    all('[data-inspect]').forEach(item=>item.classList.remove('is-focused'));
    node.classList.add('is-focused');
    const label=node.querySelector('strong')?.textContent||node.title||node.dataset.inspect;
    const description=node.dataset.description||'This component is ready for manifest, ownership and reasoning bindings.';
    setText('[data-selection]',`${label}: ${description}`);
  }));
  all('[data-path-node]').forEach(node=>node.addEventListener('click',()=>setText('[data-selection]',`${node.dataset.pathNode}: this is one verified step in the build's directed cause-and-effect chain.`)));
}

function render(state){
  const accent=state.theme?.accent||state.subclass.element.accent||'#9f66ff';
  document.documentElement.style.setProperty('--accent',accent);
  document.documentElement.style.setProperty('--accent-rgb',state.theme?.accentRgb||hexToRgb(accent));
  document.body.dataset.element=String(state.subclass.element.name||'void').toLowerCase();

  setText('[data-account]',`${state.player.displayName}${state.player.membershipCode?`#${state.player.membershipCode}`:''}`);
  setText('[data-season]',state.player.seasonLabel||'DESTINY 2');
  setText('[data-preview-banner]',state.notice||'Guardian data ready');
  setText('[data-subclass-name]',state.subclass.name);
  setText('[data-class-name]',`${state.character.className} SUBCLASS`);
  setText('[data-element]',state.subclass.element.name);
  setText('[data-power]',state.character.power??'UNAVAILABLE');
  setText('[data-stage-power]',state.character.power??'UNAVAILABLE');
  setText('[data-guardian-name]',state.player.displayName);
  setText('[data-guardian-class]',state.character.className);
  setText('[data-guardian-subclass]',state.subclass.name);
  setText('[data-title]',state.character.title||'GUARDIAN');
  setText('[data-guardian-rank]',state.character.guardianRank??'Unavailable');
  setText('[data-triumph-score]',state.character.triumphScore??'Unavailable');
  setText('[data-emblem]',state.character.emblemName||'Unavailable');
  setImage('[data-subclass-crest]',state.subclass.element.crestUrl,`${state.subclass.element.name} crest`);
  setImage('[data-fallback-crest]',state.subclass.element.crestUrl,`${state.subclass.element.name} crest`);

  const renderNode=$('[data-guardian-render]');
  const fallback=$('[data-guardian-fallback]');
  if(state.character.renderUrl&&renderNode){
    renderNode.src=state.character.renderUrl;
    setHidden(renderNode,false);
    setHidden(fallback,true);
  }else{
    setHidden(renderNode,true);
    setHidden(fallback,false);
  }

  const supers=$('[data-supers]');if(supers)supers.innerHTML=state.subclass.supers.map(item=>card(item,item.equipped?'Equipped':'Available')).join('');
  const abilities=$('[data-abilities]');if(abilities)abilities.innerHTML=state.subclass.abilities.map(item=>card(item,item.slot)).join('');
  const aspects=$('[data-aspects]');if(aspects)aspects.innerHTML=state.subclass.aspects.map(item=>card(item,`${item.fragmentSlots||0} fragment slots`)).join('');
  const fragments=$('[data-fragments]');if(fragments)fragments.innerHTML=state.subclass.fragments.map(item=>card(item,item.statText||'Fragment')).join('');
  const artifact=$('[data-artifact]');if(artifact)artifact.innerHTML=state.subclass.artifact.perks.map(item=>card({...item,equipped:item.active},item.active?'Active':'Unlocked')).join('');
  setText('[data-aspect-count]',`${state.subclass.aspects.filter(item=>item.equipped).length} / ${state.subclass.aspects.length}`);
  setText('[data-fragment-count]',`${state.subclass.fragments.filter(item=>item.equipped).length} / ${state.subclass.fragments.length}`);
  setText('[data-artifact-count]',`${state.subclass.artifact.unlockedCount??state.subclass.artifact.perks.length} unlocked`);

  const armour=$('[data-armour]');if(armour)armour.innerHTML=renderArmour(state.equipment.armour);
  const stageStats=$('[data-stage-stats]');if(stageStats)stageStats.innerHTML=renderStageStats(state.equipment.stats);
  setText('[data-build-score]',state.analysis.buildScore??'--');
  setText('[data-health-grade]',state.analysis.health?.grade||'--');
  setText('[data-health-label]',state.analysis.health?.label||'Analysing');
  setText('[data-health-summary]',state.analysis.health?.summary||'Connect Bungie for a verified personal assessment.');
  const measures=$('[data-measures]');if(measures)measures.innerHTML=renderMeters(state.analysis.measures);
  const coverage=$('[data-coverage]');if(coverage)coverage.innerHTML=renderCoverage(state.analysis.coverage);
  setText('[data-loop-summary]',state.analysis.loopSummary);
  const evidencePath=$('[data-evidence-path]');if(evidencePath)evidencePath.innerHTML=renderPath(state.analysis.primaryLoop.nodes);
  const strengths=$('[data-strengths]');if(strengths)strengths.innerHTML=renderInsights(state.analysis.strengths||[]);
  const weaknesses=$('[data-weaknesses]');if(weaknesses)weaknesses.innerHTML=renderInsights(state.analysis.weaknesses||[]);
  const recommendations=$('[data-recommendations]');if(recommendations)recommendations.innerHTML=renderRecommendations(state.analysis.recommendations);
  const activity=$('[data-activity]');if(activity)activity.innerHTML=`<strong>${safe(state.activity.name)}</strong><p>${safe(state.activity.location||'')}<br>Champions: ${safe(state.activity.champions.join(', '))}<br>Surge: ${safe(state.activity.surge)}</p>`;

  const bottomDock=$('[data-bottom-dock]');if(bottomDock)bottomDock.innerHTML=state.equipment.weapons.map(dockCard).join('')+modsCard(state.equipment.mods)+statsCard(state.equipment.stats)+activityCard(state.activity);
  bindInspection();
  $('[data-improve]')?.addEventListener('click',()=>setText('[data-selection]','Improve My Guardian: deployment validation, ownership checks and Bungie push planning will start here after account connection.'));
}

async function init(){
  try{
    const response=await fetch('./guardian-workspace-v1.preview.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`Guardian data request failed: ${response.status}`);
    render(await response.json());
  }catch(error){
    console.error(error);
    setText('[data-preview-banner]',`Unable to load Guardian Build Forge: ${error.message}`);
  }
}

init();
