async function revealRecommendedBuild({build,dialog,body,renderReview,paint,onRenderError,focusTarget}={}){
  if(!build?.recommendationGeneratedAt||!dialog)return {opened:false,renderError:null};
  dialog.hidden=false;
  dialog.setAttribute?.('aria-hidden','false');
  body?.classList?.add('recommended-build-open');
  await Promise.resolve(paint?.());
  let renderError=null;
  try{renderReview?.(build);}
  catch(error){renderError=error instanceof Error?error:new Error(String(error));onRenderError?.(renderError);}
  focusTarget?.focus?.();
  return {opened:true,renderError};
}

function weaponCombinationsMarkup(recommendation={}){
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const combinations=recommendation.combinations||[];
  if(!combinations.length)return '<p>No complete owned weapon alternatives are available. Refresh the inventory and generate again.</p>';
  return `<h4>OWNED WEAPON COMBINATIONS</h4><p>${Number(recommendation.eligibleCandidateCount||0)} eligible instances · ${Number(recommendation.legalCombinationCount||0).toLocaleString('en')} legal combinations compared · ${esc(String(recommendation.objective||'balanced').toUpperCase())} / ${esc(String(recommendation.activity||'activity not selected').toUpperCase())}</p><div class="weapon-combination-list">${combinations.map((combo,index)=>`<article class="weapon-combination${combo.selected?' is-selected':''}"><header><b>${combo.selected?'SELECTED COMBINATION':`ALTERNATIVE ${index}`}</b><span>${Number(combo.exoticCount||0)}/1 EXOTIC</span></header><ul class="weapon-combination-items">${combo.weapons.map(item=>{
    const icon=String(item.icon||''),src=icon.startsWith('/')?`https://www.bungie.net${icon}`:/^https:\/\//.test(icon)?icon:'';
    return `<li>${src?`<img src="${esc(src)}" alt="" loading="lazy">`:''}<span><b>${esc(item.name)}</b><small>${esc(item.element?item.element.toUpperCase():'')} · ${['AMMO UNRESOLVED','PRIMARY','SPECIAL','HEAVY'][Number(item.ammoType)||0]}</small></span></li>`;
  }).join('')}</ul><p>${esc(combo.reasons?.find(reason=>reason.kind==='ammo-coverage')?.label||'Ammo-role evidence is incomplete.')}</p><p>${esc(combo.reasons?.find(reason=>reason.kind==='objective'||reason.kind==='activity'||reason.kind==='perk-synergy')?.label||'No active-perk description match was found for this objective.')}</p>${combo.selected?'':`<button type="button" data-weapon-combination="${index}" aria-label="Use alternative ${index}">USE COMBINATION</button>`}</article>`).join('')}</div><small>Fit uses owned perks and ammo roles; damage output is not measured. Choosing a combination recalculates Artifact picks, armour mods and perk advice.</small>`;
}

export {revealRecommendedBuild,weaponCombinationsMarkup};
