// Build Review step 1: the complete shared build. Pure HTML from the view model.
// What came from the sharer and what Paradox picked from the user's gear are
// always labelled apart. Anything unresolved shows its hash.
import {TITLE_MATCH_LABEL,ARMOUR_SLOT_NAMES} from '../../core/dim-import/fill.mjs';
import {elementName} from './build-review-model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const NO_EXOTIC='This share pins no exotic armour.';
export const NO_WEAPONS='This share has no weapons.';
export const NO_STAT_TARGETS='This share sets no stat targets, so the armour picks are not checked against any.';
export const NO_ARTIFACT='None in this share.';
const TAG={share:'From the share',inventory:'Picked from your inventory',suggestion:'Suggestion',title:TITLE_MATCH_LABEL};
const nameOr=(row,kind='definition')=>row?.name?esc(row.name):`Unresolved ${kind} ${esc(row?.hash)}`;
const icon=(src,size=40)=>src?`<img src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy">`:`<span class="br-item-icon" aria-hidden="true"></span>`;
const tag=(key,text=TAG[key])=>`<span class="br-tag is-${key}">${esc(text)}</span>`;
const reasons=list=>list?.length?`<ul class="br-reasons">${list.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:'';
const section=(id,title,body)=>`<section class="br-section" aria-labelledby="${id}"><h2 id="${id}" class="br-kicker">${esc(title)}</h2>${body}</section>`;
const callout=text=>`<p class="br-callout">${esc(text)}</p>`;

function plugList(plugs){return `<ul class="br-plugs">${plugs.map(plug=>`<li class="br-plug"${plug.description?` title="${esc(plug.description)}"`:''}>${icon(plug.icon,32)}<span>${nameOr(plug)}</span></li>`).join('')}</ul>`;}

function subclassSection(view){
  const sub=view.subclass;
  const groups=view.subclassGroups.map(group=>`<div class="br-group"><h3 class="br-group-label">${esc(group.label)}</h3>${plugList(group.plugs)}</div>`).join('');
  return section('brSubclassTitle','SUBCLASS',`<div class="br-subclass" data-element="${esc(sub.element)}"><span class="br-diamond" aria-hidden="true"></span><div><p class="br-kicker">${tag('share')} ${view.className?esc(view.className.toUpperCase()):''}</p><p class="br-subclass-name">${esc([elementName(sub.element),sub.name].filter(Boolean).join(' · ')||'Subclass')}</p></div></div><div class="br-groups">${groups}</div>`);
}

function gearRow({icon:src,name,hash,slot,tags,status,detail,reasons:why,mods,exotic}){
  return `<li class="br-gear${exotic?' is-exotic':''}">${icon(src,48)}<div class="br-gear-text"><span class="br-item-slot">${esc(slot||'')}${exotic?' · Exotic':''}</span><strong>${name?esc(name):`Unresolved item ${esc(hash)}`}</strong><span class="br-tags">${tags.join('')}</span>${status?`<span class="br-item-status">${esc(status)}</span>`:''}${detail||''}${reasons(why)}${mods?.length?`<p class="br-mods-on"><span>Mods for this slot:</span> ${mods.map(mod=>esc(mod.name||`Unresolved mod ${mod.hash}`)).join(', ')}</p>`:''}</div></li>`;
}

function exoticSection(fill){
  const exotic=fill.exotic;
  if(exotic.pinned){
    const pinned=exotic.pinned;
    return section('brExoticTitle','EXOTIC ARMOUR',`<ul class="br-gear-list">${gearRow({icon:pinned.icon,name:pinned.name,hash:pinned.hash,slot:pinned.source==='pinned'?'Pinned in the share':'In the share',tags:[tag('share')],status:pinned.owned?'In your inventory':'Missing from your inventory',exotic:true})}</ul>`);
  }
  const titled=exotic.titleMatches.map(match=>gearRow({icon:match.icon,name:match.name,slot:match.slot,tags:[tag('title')],status:match.owned?match.location:'Not in your inventory',reasons:match.reasons,exotic:true})).join('');
  const ranked=exotic.suggestions.map(row=>gearRow({icon:row.icon,name:row.name,slot:row.slot,tags:[tag('suggestion')],status:row.location,detail:row.perk?`<p class="br-perk">${esc(row.perk.name)}</p>`:'',reasons:row.reasons,exotic:true})).join('');
  return section('brExoticTitle','EXOTIC ARMOUR',`${callout(NO_EXOTIC)}${titled?`<ul class="br-gear-list">${titled}</ul>`:''}<h3 class="br-group-label">Paradox's ranked picks from your inventory</h3>${ranked?`<ul class="br-gear-list">${ranked}</ul>`:'<p class="br-muted">You own no Exotic armour for this class.</p>'}`);
}

function weaponsSection(view,weapons={}){
  const shared=view.weapons.filter(row=>row.status!=='empty');
  if(shared.length)return section('brWeaponsTitle','WEAPONS',`<ul class="br-gear-list">${shared.map(row=>gearRow({icon:row.icon,name:row.name,slot:row.label,tags:[tag('share')],status:row.statusLabel,reasons:row.status==='substituted'?row.reasons:[],exotic:row.isExotic})).join('')}</ul>`);
  const body=weapons.state==='ready'
    ?`${weapons.rows.length?`<ul class="br-gear-list">${weapons.rows.map(row=>gearRow({icon:row.icon,name:row.name,slot:row.slot,tags:[tag('suggestion','Suggestion from your inventory')],reasons:row.reasons.length?row.reasons:['Paradox found no perk or element link for this pick.'],exotic:row.isExotic})).join('')}</ul>`:'<p class="br-muted">No weapon suggestion could be resolved from your inventory.</p>'}${(weapons.limitations||[]).length?`<ul class="br-reasons">${weapons.limitations.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:''}`
    :weapons.state==='error'?`<p class="br-muted" role="status">${esc(weapons.message||'Weapon suggestions are unavailable.')}</p>`
    :'<p class="br-muted" role="status">Ranking weapons from your inventory…</p>';
  return section('brWeaponsTitle','WEAPONS',`${callout(NO_WEAPONS)}<h3 class="br-group-label">Paradox's ranked picks from your inventory</h3>${body}`);
}

function armourSection(fill){
  const rows=fill.armour.rows.map(row=>gearRow({icon:row.icon,name:row.name,hash:row.itemHash,slot:row.slot,exotic:row.isExotic,
    tags:[row.from==='share'?tag('share'):row.from==='inventory'?tag('inventory'):tag('none','No pick from your inventory')],
    status:row.from==='share'?(row.status==='matched'?'In your inventory':row.status==='substituted'?`Missing from your inventory. Paradox's pick from your inventory: ${row.selectedName}`:'Missing from your inventory'):row.from==='none'?'Nothing in your inventory fits':'',
    reasons:row.reasons,mods:row.mods}));
  const lede=fill.armour.source==='inventory'?'<p class="br-muted">The share has no armour. These five pieces are Paradox\'s picks from your inventory.</p>':'';
  return section('brArmourTitle','ARMOUR',`${lede}<ul class="br-gear-list">${rows.join('')}</ul>`);
}

function statsSection(fill){
  const {targets,totals}=fill.stats;
  const target=targets.length?`<table class="br-table"><thead><tr><th scope="col">Stat</th><th scope="col">Target</th><th scope="col">Picks reach</th><th scope="col">Result</th></tr></thead><tbody>${targets.map(row=>`<tr><th scope="row">${nameOr(row,'stat')}</th><td>${row.min} to ${row.max}</td><td>${row.reached??'Not available'}</td><td>${row.met===null?'Not checked':row.met?'Meets':row.reached<row.min?`Misses: ${row.min-row.reached} short`:`Misses: ${row.reached-row.max} over`}</td></tr>`).join('')}</tbody></table>`:callout(NO_STAT_TARGETS);
  const reach=totals.length?`<h3 class="br-group-label">Your armour picks reach</h3><ul class="br-stats">${totals.map(row=>`<li><span>${nameOr(row,'stat')}</span><strong>${row.value??'Not available'}</strong></li>`).join('')}</ul><p class="br-muted">Armour stats only, before mods, subclass fragments and masterwork changes.</p>`:'';
  return section('brStatsTitle','STAT TARGETS',target+reach);
}

function setsSection(fill){
  const requested=fill.sets.requested.length?`<ul class="br-facts">${fill.sets.requested.map(row=>`<li>${nameOr(row,'set')}: ${row.reached??0} of ${row.required} requested pieces</li>`).join('')}</ul>`:'<p class="br-muted">This share requests no set bonuses.</p>';
  const formed=fill.sets.formed.length?`<h3 class="br-group-label">Your picks form</h3><ul class="br-facts">${fill.sets.formed.map(row=>`<li>${nameOr(row,'set')}: ${row.count} piece${row.count===1?'':'s'}${row.perks.length?` · ${row.perks.map(perk=>`${perk.required}-piece ${esc(perk.name)} ${perk.active?'(active)':'(not active)'}`).join(', ')}`:''}</li>`).join('')}</ul>`:'';
  return section('brSetsTitle','SET BONUSES',requested+formed);
}

function modsSection(fill){
  const all=fill.mods.all;
  const list=all.length?`<ul class="br-plugs is-list">${all.map(mod=>`<li class="br-plug">${icon(mod.icon,32)}<span>${nameOr(mod,'mod')}</span><span class="br-muted">${esc(ARMOUR_SLOT_NAMES[mod.slot]||'Slot not stated')}</span></li>`).join('')}</ul>`:'<p class="br-muted">This share has no mods.</p>';
  const perks=fill.mods.perks.length?`<h3 class="br-group-label">Armour perks</h3>${plugList(fill.mods.perks)}`:'';
  return section('brModsTitle',`SHARED MODS (${all.length})`,`<p class="br-muted">${tag('share')} Placed by the slot each mod's own definition names.</p>${list}${perks}`);
}

function artifactSection(fill){
  return section('brArtifactTitle','ARTIFACT UNLOCKS',fill.artifact.unlocks.length?plugList(fill.artifact.unlocks):callout(NO_ARTIFACT));
}
function emblemSection(fill){
  if(!fill.emblem)return '';
  return section('brEmblemTitle','LOADOUT EMBLEM',plugList(fill.emblem));
}

/** Every group the share carries, plus Paradox's labelled picks. */
export function renderSharedBuild(view,{weapons}={}){
  const fill=view?.fill;if(!fill)return subclassSection(view);
  return [subclassSection(view),exoticSection(fill),weaponsSection(view,weapons),armourSection(fill),statsSection(fill),setsSection(fill),modsSection(fill),artifactSection(fill),emblemSection(fill)].join('');
}
