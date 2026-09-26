import {isJourneyPreview} from '../../shared/local-preview.mjs?v=20260925-local-preview-1';
const SAMPLE_STATS=['Weapons','Health','Class','Grenade','Super','Melee'];
// Deliberately fabricated visual fixture. These are not Bungie hashes or records.
export function createJourneyPreviewPayload(location=globalThis.location){
  if(!isJourneyPreview(location))return null;
  return {
    preview:true,source:'LOCAL SAMPLE ONLY',displayName:'Sample Guardian',
    characters:['Titan','Hunter','Warlock'].map((name,index)=>({characterId:`sample-${index}`,name:`Sample ${name}`,power:1000,minutesPlayed:600,stats:SAMPLE_STATS.map(name=>({name,value:100}))})),
    vault:{total:100,armour:50,equipment:50},seasonRank:100,guardianRank:5,
    title:'Sample Title',progress:{completed:50,total:100},
    activities:[{name:'Sample Activity',clears:10,kills:100,deaths:10}],
    description:'Fabricated local preview. No Bungie account or activity data.'
  };
}
export async function mountJourneyPreview(){
  const payload=createJourneyPreviewPayload();if(!payload)return false;
  const doc=globalThis.document;
  const badge=doc.createElement('strong');badge.id='localPreviewBadge';badge.textContent='PREVIEW DATA';badge.setAttribute('role','status');badge.title=payload.description;
  // Use existing tokens, without changing the page's stylesheet or brand system.
  badge.style.cssText='position:fixed;top:12px;left:12px;z-index:2147483647;padding:8px 12px;border:2px solid currentColor;border-radius:8px;background:var(--apx-colour-canvas,Canvas);color:var(--apx-colour-text,CanvasText);font:bold 16px sans-serif;pointer-events:none';
  doc.body.append(badge);
  const text=(id,value)=>{const node=doc.getElementById(id);if(node)node.textContent=value;};
  for(const id of ['journeyResolving','journeySignedOut']){const node=doc.getElementById(id);if(node)node.hidden=true;}
  doc.getElementById('journeyDashboard').hidden=false;
  text('journeyAuthStatus','PREVIEW DATA · Sample Guardian');
  text('journeyFeedStatus',payload.description);
  const refresh=doc.getElementById('journeyRefreshButton');if(refresh)refresh.hidden=true;
  const cards=doc.getElementById('guardianCharacterCards');cards.replaceChildren();
  const renderCharacter=character=>{
    text('journeyGuardianClass',character.name);text('journeyGuardianSubclass','Sample Subclass');
    text('journeyTotalPlaytime','30h 0m');
    const stats=doc.getElementById('journeyGuardianStats');
    if(stats){stats.replaceChildren();for(const stat of character.stats){const cell=doc.createElement('span');cell.textContent=`${stat.name} ${stat.value}`;stats.append(cell);}}
    cards.querySelectorAll('button').forEach(button=>{const selected=button.dataset.characterId===character.characterId;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});
  };
  for(const character of payload.characters){
    const button=doc.createElement('button');button.type='button';button.className='guardian-character-card';button.dataset.characterId=character.characterId;
    const heading=doc.createElement('span');heading.className='guardian-character-card__head';
    const name=doc.createElement('strong');name.textContent=character.name;
    const power=doc.createElement('span');power.className='guardian-character-card__power';power.textContent=String(character.power);heading.append(name,power);
    const stats=doc.createElement('span');stats.className='guardian-character-card__stats';
    for(const stat of character.stats){const cell=doc.createElement('span');cell.className='guardian-character-card__stat';cell.title=`Sample ${stat.name}`;cell.textContent=String(stat.value);stats.append(cell);}
    button.append(heading,stats);button.addEventListener('click',()=>renderCharacter(character));cards.append(button);
  }
  renderCharacter(payload.characters[0]);
  const sampleCard=(id,rows)=>{
    const node=doc.getElementById(id);if(!node)return;
    node.replaceChildren();
    for(const [name,value] of rows){const row=doc.createElement('p');row.textContent=`${name}: ${value}`;node.append(row);}
  };
  sampleCard('journeyGuardianUsage',payload.characters.map(character=>[character.name,'10h 0m']));
  sampleCard('journeyVault',[['Sample items',payload.vault.total],['Sample armour',payload.vault.armour],['Sample equipment',payload.vault.equipment]]);
  sampleCard('journeySeasonRank',[['Sample season rank',payload.seasonRank]]);
  sampleCard('journeyGuardianRankSummary',[['Sample Guardian rank',payload.guardianRank]]);
  sampleCard('journeyTitleSeal',[['Sample title',payload.title]]);
  sampleCard('journeyTitleProgress',[['Sample progress',`${payload.progress.completed} / ${payload.progress.total}`]]);
  sampleCard('journeyRecentActivity',payload.activities.map(row=>[row.name,`${row.clears} clears, ${row.kills} kills, ${row.deaths} deaths`]));
  for(const id of ['journeyMostUsed','journeyBuildSummary','journeyMissionHighlights','journeyTriumphStats'])sampleCard(id,[['Sample data','100']]);
  text('journeyMetricActivities','10');text('journeyMetricCompletion','50%');text('journeyMetricPve','50%');text('journeyMetricPvp','50%');
  text('journeyFocusStatus','PREVIEW DATA · Sample destination');
  text('journeyConfidenceStatus',payload.description);text('journeyConfidenceHighPercent','50%');
  text('journeyConfidenceHigh','50');text('journeyConfidenceMedium','30');text('journeyConfidenceLow','20');
  text('journeyTrendEmpty','Sample chart area. No real activity history.');
  // Map layout may use the existing local artwork; it receives no account state.
  const [{initLocationSelector},{initJourneyLocationMaps}]=await Promise.all([
    import('../../shared/astrix-location-selector.mjs?v=20260920-map-links-1'),
    import('./journey-location-maps.mjs?v=20260920-zoom-chests-3')
  ]);
  initLocationSelector({mount:doc.getElementById('journeyLocationSelector'),detail:doc.getElementById('journeyLocationDetail')});
  await initJourneyLocationMaps(doc.getElementById('journeyLocationDetail'));
  globalThis.ForgeLoader?.authResolved();await globalThis.ForgeLoader?.ready();globalThis.ForgeLoader?.done();
  return true;
}
