import {loadoutIcon,bindLoadoutIconDetails} from '../../shared/loadout-icon-layout.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TICK='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROSS='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
// Green tick: the shared item is in this inventory. Red cross and darkened:
// it is not, and the replacement (if any) is the adaptation's own pick.
function fitSlot(item,state){
  const badge=state==='ok'?`<span class="apx-dim-badge is-ok" role="img" aria-label="In your inventory">${TICK}</span>`:state==='gone'?`<span class="apx-dim-badge is-gone" role="img" aria-label="Not in your inventory">${CROSS}</span>`:'';
  return `<span class="apx-dim-slot is-${state}">${loadoutIcon(item,{large:true})}${badge}</span>`;
}
// One horizontal row, in DIM order: subclass, weapons, armour.
const SLOT_ORDER=[3284755031,1498876634,2465295065,953998645,3448274439,3551918588,14239492,20886954,1585787867];
const slotIndex=row=>{const index=SLOT_ORDER.indexOf(Number(row.bucketHash));return index<0?SLOT_ORDER.length:index;};
// Paradox's own picks for slots the share left empty. Never shown as the sharer's item.
const PICK_LABELS={picked:'Picked from your inventory',suggested:'Suggestion from your inventory',unfilled:'Nothing in your inventory fits'};
// Build Fit decisions: the user's own answer for a shared item they do not own.
const DECIDED_LABELS={approved:'Approved replacement',chosen:'Your choice',empty:'Left empty'};
function fitTile(row){
  if(PICK_LABELS[row.status])return `<li class="apx-dim-tile is-${esc(row.status)}">${row.selected?fitSlot(row.selected,'pick'):'<span class="apx-dim-empty">No match</span>'}<span class="apx-dim-tile-label">${esc(PICK_LABELS[row.status])}</span></li>`;
  const matched=row.status==='matched',substituted=row.status==='substituted';
  const label=matched?'In your inventory':DECIDED_LABELS[row.status]||(substituted?'Replacement suggested':'No replacement');
  return `<li class="apx-dim-tile is-${esc(row.status)}">${fitSlot(row.target,matched?'ok':'gone')}${matched?'':`<span class="apx-dim-tile-pick">${row.selected?`<span class="apx-dim-arrow" aria-hidden="true">↓</span>${fitSlot(row.selected,'pick')}`:'<span class="apx-dim-empty">No match</span>'}</span>`}<span class="apx-dim-tile-label">${esc(label)}</span></li>`;
}
function fitNotes(rows){
  const notes=rows.filter(row=>row.status!=='matched').map(row=>{
    if(PICK_LABELS[row.status])return `<li>${esc(`${PICK_LABELS[row.status]}${row.selected?.name?`: ${row.selected.name}`:''}. ${row.reasons.join(' · ')}`)}</li>`;
    const name=row.target?.name||'Shared item';
    const text=row.status==='empty'?`${name} is not in your inventory. You left this slot empty.`:DECIDED_LABELS[row.status]?`${name} is not in your inventory. ${DECIDED_LABELS[row.status]}: ${row.selected?.name||''}. ${row.reasons.join(' ')}`:row.status==='substituted'?`${name} is not in your inventory. Replacement: ${row.selected?.name||''}. ${row.reasons.join(' · ')}`:`${name} is not in your inventory and nothing you have fits this slot.`;
    return `<li>${esc(text)}${row.missingSockets.length?` ${esc(`Unavailable sockets: ${row.missingSockets.join(', ')}`)}`:''}</li>`;
  });
  return notes.length?`<ul class="apx-dim-notes">${notes.join('')}</ul>`:'';
}
function fitRow(rows){
  const ordered=[...rows].sort((a,b)=>slotIndex(a)-slotIndex(b));
  return `<ul class="apx-dim-fit-row" aria-label="Shared items against your inventory">${ordered.map(fitTile).join('')}</ul>${fitNotes(ordered)}`;
}
function fitSummary(all=[]){
  const rows=all.filter(row=>!PICK_LABELS[row.status]),picks=all.length-rows.length;
  const count=status=>rows.filter(row=>row.status===status).length,found=count('matched');
  const decided=rows.filter(row=>['approved','chosen'].includes(row.status)).length;
  return `<p class="apx-dim-summary"><b>${found} of ${rows.length}</b> in your inventory${decided?` · ${decided} replacement${decided===1?'':'s'} you decided`:''}${count('empty')?` · ${count('empty')} left empty`:''}${picks?` · ${picks} slot${picks===1?'':'s'} filled by Paradox from your inventory`:''}${count('substituted')?` · ${count('substituted')} replacement${count('substituted')===1?'':'s'} suggested`:''}${count('missing')?` · ${count('missing')} with no replacement`:''}</p>`;
}
// Where each shared mod went, and every mod that could not go anywhere, with its reason.
function fitMods(report){
  const mods=report.mods;if(!mods)return '';
  const total=mods.placed.reduce((n,row)=>n+row.mods.length,0)+mods.unplaced.length;
  return `<h3>Shared mods and cosmetics (${total})</h3><ul class="apx-dim-mods">${mods.placed.map(row=>`<li><b>${esc(row.slot)}: ${esc(row.item)}</b><span class="apx-icon-strip">${row.mods.map(mod=>loadoutIcon({name:mod.name,icon:mod.icon,description:mod.cost?`Energy ${mod.cost}`:''})).join('')}</span></li>`).join('')}</ul>${mods.unplaced.length?`<p>Not placed:</p><ul>${mods.unplaced.map(mod=>`<li>${esc(mod.name)} (${esc(String(mod.hash))}): ${esc(mod.reason)}</li>`).join('')}</ul>`:''}`;
}
function fitArtifact(report){
  const unlocks=report.sharedBuild?.artifact?.unlocks||[];
  return unlocks.length?`<h3>Shared artifact picks (${unlocks.length})</h3><div class="apx-icon-strip">${unlocks.map(item=>loadoutIcon(item)).join('')}</div>`:'';
}
export function renderDimComparison(build){
  const report=build?.dimAdaptation;if(!report)return '';
  const original=build.dimTarget;
  const current=[...(build.weapons||[]),...(build.armour||[]),build.subclassItem].filter(Boolean);
  const changed=report.comparisons.some(row=>String(current.find(item=>item.bucketHash===row.bucketHash)?.itemInstanceId||'')!==String(row.selected?.itemInstanceId||''));
  return `<h2>SHARED BUILD FIT</h2><p>${esc(report.sourceName)} · ${esc(report.characterClass)}</p><p>Comparison captured when this import was matched to your inventory.</p>${changed?'<p>The Working Build has changed since import. This comparison records the initial recommendation.</p>':''}<div class="apx-icon-strip" aria-label="Original Exotic and Super anchors">${(report.anchors||[]).map(item=>loadoutIcon(item)).join('')}</div>${fitSummary(report.comparisons)}<div class="apx-dim-comparison">${fitRow(report.comparisons)}</div>${report.blockers.length?`<ul>${report.blockers.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>`:''}${report.setTargets.length?`<h3>Set targets</h3><ul>${report.setTargets.map(row=>`<li>${esc(row.name)}: ${row.current}/${row.required} pieces</li>`).join('')}</ul>`:''}${report.statTargets.length?`<h3>Stat targets</h3><p>Current item totals, before changes to mods or subclass bonuses.</p><ul>${report.statTargets.map(row=>`<li>${esc(row.name)}: ${row.legacy?'Legacy target, not applied':`${row.current??'Unavailable'} · target ${row.min} to ${row.max}`}</li>`).join('')}</ul>`:''}${fitMods(report)}${fitArtifact(report)}${report.parameterSteps.length&&!report.fit?`<details><summary>Mods, cosmetics and artifact targets</summary><p>Retained from the share. Review placement, unlocks and energy costs in Destiny; these have not been applied.</p>${report.parameterSteps.map(group=>`<p>${esc(group.label)}: ${group.items.map(item=>esc(item.name)+(item.retired?' (retired)':item.availableOn?.length?` (socket option on ${esc(item.availableOn.join(', '))})`:' (placement or unlock not confirmed)')).join('; ')}</p>`).join('')}</details>`:''}<details><summary>How this fit was selected</summary><p>${esc(report.method)}</p><p>The shared original is preserved${original?' in this build':''}. A suggested replacement can differ in effects; missing Exotic effects are never treated as equivalent.</p></details>`;
}
let dispose=()=>{};
export function mountDimComparison(build,host){
  if(!host)return;dispose();host.hidden=!build?.dimAdaptation;host.innerHTML=renderDimComparison(build);dispose=bindLoadoutIconDetails(host);
}
