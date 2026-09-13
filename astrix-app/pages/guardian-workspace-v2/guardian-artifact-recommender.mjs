const CHAMPION_LABELS = [
  ['barrier', /\bBarrier Champions?\b/i],
  ['overload', /\bOverload Champions?\b/i],
  ['unstoppable', /\bUnstoppable Champions?\b/i]
];

const ELEMENTS = ['Kinetic', 'Arc', 'Solar', 'Void', 'Stasis', 'Strand'];
const LEGACY_ARTIFACT_PLAN_LIMIT = 12;
const MECHANICS = [
  ['grenade', /\bgrenades?\b/i],
  ['melee', /\bmelee\b/i],
  ['super', /\bsuper\b/i],
  ['class ability', /\bclass abilit(?:y|ies)\b/i],
  ['Armour Charge', /\barmo(?:u)?r charge\b/i],
  ['Orb of Power', /\borbs? of power\b/i],
  ['elemental pickup', /\belemental pickups?\b/i],
  ['precision', /\bprecision\b/i],
  ['reload', /\breload(?:ing)?\b/i],
  ['finisher', /\bfinishers?\b/i],
  ['scorch', /\bscorch(?:ed|ing)?\b/i],
  ['ignite', /\bignit(?:e|es|ed|ing|ion)\b/i],
  ['jolt', /\bjolt(?:ed|ing)?\b/i],
  ['blind', /\bblind(?:ed|ing)?\b/i],
  ['amplified', /\bamplif(?:y|ied)\b/i],
  ['volatile', /\bvolatile\b/i],
  ['weaken', /\bweaken(?:ed|ing)?\b/i],
  ['suppress', /\bsuppress(?:ed|ing|ion)?\b/i],
  ['Devour', /\bdevour\b/i],
  ['invisibility', /\binvisib(?:le|ility)\b/i],
  ['overshield', /\bovershields?\b/i],
  ['restoration', /\brestoration\b/i],
  ['freeze', /\bfreez(?:e|es|ing)|\bfrozen\b/i],
  ['slow', /\bslow(?:ed|ing)?\b/i],
  ['shatter', /\bshatter(?:ed|ing)?\b/i],
  ['suspend', /\bsuspend(?:ed|ing)?\b/i],
  ['unravel', /\bunravel(?:ed|ing)?\b/i],
  ['sever', /\bsever(?:ed|ing)?\b/i],
  ['Woven Mail', /\bwoven mail\b/i],
  ['Threadling', /\bthreadlings?\b/i],
  ['Bolt Charge', /\bbolt charge\b/i]
];

const STAT_PATTERNS = Object.freeze({
  health:/\bhealth\b|\bheal(?:s|ed|ing)?\b|\bdamage resistance\b|\bovershields?\b|\brestoration\b|\bdevour\b/i,
  melee:/\bmelee\b/i,
  grenade:/\bgrenades?\b/i,
  super:/\bsuper\b/i,
  class:/\bclass abilit(?:y|ies)\b/i,
  weapon:/\bweapons?\b|\bammo\b|\breload(?:ing)?\b|\bprecision\b|\bfinal blows?\b/i
});

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function finiteInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pluralPattern(value) {
  const type = text(value);
  if (!type) return null;
  const escapedType = escaped(type);
  const plural = /y$/i.test(type) ? `${escapedType.slice(0, -1)}(?:y|ies)` : `${escapedType}s?`;
  return new RegExp(`\\b${plural}\\b`, 'i');
}

function championType(description) {
  for (const [type, pattern] of CHAMPION_LABELS) {
    if (pattern.test(description)) return type;
  }
  return null;
}

function mentionsWeaponType(description, weaponType) {
  const pattern = pluralPattern(weaponType);
  return Boolean(pattern && pattern.test(description));
}

function normalizedElement(value) {
  const found = ELEMENTS.find(element => lower(element) === lower(value));
  return found ?? null;
}

function elementOf(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return ELEMENTS.find(element => new RegExp(`\\b${element}\\b`, 'i').test(value)) ?? null;
  }
  return normalizedElement(value.element)
    ?? normalizedElement(value.damageType)
    ?? normalizedElement(value.superElement)
    ?? elementOf(value.elementDefinition?.displayProperties?.name)
    ?? elementOf(value.name)
    ?? elementOf(value.displayName);
}

function explicitElementWeaponMatch(description, element) {
  if (!element) return false;
  const escapedElement = escaped(element);
  return new RegExp(`\\b${escapedElement}\\b.{0,32}\\bweapons?\\b|\\bweapons?\\b.{0,32}\\b${escapedElement}\\b`, 'i').test(description);
}

function superMatchingWeapon(description, weapon, subclassElement) {
  if (!/\bweapon matching your equipped Super\b/i.test(description)) return false;
  return Boolean(weapon.element && subclassElement && weapon.element === subclassElement);
}

function hashOf(value) {
  return finiteInteger(value?.hash ?? value?.itemHash ?? value?.bungieHash ?? value?.perkHash);
}

function displayDescription(value) {
  return text(value?.description ?? value?.definition?.displayProperties?.description ?? value?.displayProperties?.description);
}

function normalizeWeapon(weapon) {
  const selected = [
    ...(Array.isArray(weapon?.weaponSemantics?.selectedPerks) ? weapon.weaponSemantics.selectedPerks : []),
    ...(Array.isArray(weapon?.selectedPerks) ? weapon.selectedPerks : []),
    ...(Array.isArray(weapon?.mods) ? weapon.mods : []),
    weapon?.intrinsicTrait,
    weapon?.catalyst
  ].filter(Boolean);
  return {
    hash: hashOf(weapon),
    name: text(weapon?.name),
    weaponType: text(weapon?.weaponType ?? weapon?.itemTypeDisplayName ?? weapon?.definition?.itemTypeDisplayName),
    element: elementOf(weapon),
    selectedEffects: selected.map(row => ({
      hash: hashOf(row),
      name: text(row?.name ?? row?.definition?.displayProperties?.name),
      description: displayDescription(row)
    })).filter(row => row.name || row.description)
  };
}

function perkCitation(perk) {
  return {
    hash: perk.hash,
    perkHash: perk.perkHash,
    sandboxPerkHash: perk.sandboxPerkHash,
    name: perk.name,
    description: perk.description,
    icon: text(perk?.source?.icon ?? perk?.source?.definition?.displayProperties?.icon),
    tierIndex: perk.tierIndex,
    column: perk.column,
    order: perk.order,
    minimumUnlockPointsUsedRequirement: perk.minimumUnlockPointsUsedRequirement
  };
}

function equippedCitation(weapons) {
  return weapons.map(weapon => ({
    hash: weapon.hash,
    name: weapon.name,
    weaponType: weapon.weaponType,
    element: weapon.element
  }));
}

function artifactState(artifactData, currentSeasonNumber) {
  if (!artifactData || artifactData.state === 'state-unavailable' || !Array.isArray(artifactData.perks) || artifactData.perks.length === 0) {
    return { status: 'missing-artifact', blocker: 'Current Artifact data is missing or unavailable.' };
  }
  if (artifactData.availabilityModel === 'artifact-2-socket-buckets') {
    if (!Array.isArray(artifactData.selectionSlots) || artifactData.selectionSlots.length === 0) {
      return { status: 'missing-artifact-slots', blocker: 'Artifact 2.0 socket-bucket evidence is unavailable.' };
    }
    return { status: 'current', blocker: null };
  }
  const artifactSeason = finiteInteger(artifactData.seasonNumber);
  const currentSeason = finiteInteger(currentSeasonNumber);
  if (artifactSeason === null) {
    return { status: 'artifact-season-unresolved', blocker: 'The active Artifact season could not be verified.' };
  }
  if (currentSeason === null) {
    return { status: 'current-season-unresolved', blocker: 'Current season metadata was not supplied; Artifact freshness cannot be verified.' };
  }
  if (artifactSeason !== currentSeason) {
    return { status: 'stale-artifact', blocker: `Artifact season ${artifactSeason} does not match current season ${currentSeason}.` };
  }
  return { status: 'current', blocker: null };
}

function normalizePerk(perk, index, strictLiveEvidence) {
  const hash = hashOf(perk);
  const tierIndex = finiteInteger(perk?.tierIndex) ?? Math.max(0, (finiteInteger(perk?.column) ?? 1) - 1);
  const order = finiteInteger(perk?.order) ?? finiteInteger(perk?.itemIndex) ?? index + 1;
  const requirement = finiteInteger(perk?.minimumUnlockPointsUsedRequirement ?? perk?.pointsToUnlock) ?? 0;
  const active = perk?.isActive === true;
  const visible = strictLiveEvidence ? perk?.isVisible === true : perk?.isVisible !== false;
  const tierUnlocked = strictLiveEvidence ? (perk?.tierUnlocked === true || active) : perk?.tierUnlocked !== false;
  const description = displayDescription(perk);
  const verified = hash !== null && Boolean(description) && perk?.unresolved !== true && perk?.displayResolved !== false;
  return {
    source: perk,
    hash,
    perkHash: finiteInteger(perk?.perkHash) ?? hash,
    sandboxPerkHash: finiteInteger(perk?.sandboxPerkHash),
    name: text(perk?.name ?? perk?.definition?.displayProperties?.name) || `Artifact perk ${hash}`,
    description,
    tierIndex,
    column: finiteInteger(perk?.column) ?? tierIndex + 1,
    order,
    minimumUnlockPointsUsedRequirement: Math.max(0, requirement),
    active,
    visible,
    tierUnlocked,
    verified,
    eligible: verified && visible && tierUnlocked
  };
}

function effectSources(build, weapons) {
  const decision = build?.forgeLoaderDecision ?? {};
  const sources = [];
  const add = (kind, value, weight) => {
    if (!value) return;
    const description = displayDescription(value);
    const name = text(value?.name ?? value?.displayName ?? value?.setName);
    const sourceText = [name, description].filter(Boolean).join(' — ');
    if (sourceText) sources.push({ kind, name: name || kind, text: sourceText, weight });
  };
  add('selected Exotic', decision?.buildAnchor?.perk, 46);
  for (const row of decision?.setProtocol ?? []) add(`${row.count}-piece armour set`, row?.trait ?? row, 44);
  add('selected Super', build?.subclassBuild?.super ?? build?.super, 32);
  for (const ability of build?.subclassBuild?.abilities ?? build?.abilities ?? []) add('selected ability', ability, 28);
  for (const aspect of build?.subclassBuild?.aspects ?? build?.aspects ?? []) add('selected Aspect', aspect, 28);
  for (const fragment of build?.subclassBuild?.fragments ?? build?.fragments ?? []) add('selected Fragment', fragment, 24);
  for (const step of build?.loadoutIntent?.sequence ?? []) add(`build-loop step ${step.order ?? ''}`.trim(), step, Number(step.weight ?? 38));
  for (const armour of build?.armour ?? []) {
    for (const mod of [...(armour?.generalMods ?? []), ...(armour?.slotMods ?? [])]) add(`${text(armour?.name) || 'armour'} mod`, mod, 30);
  }
  for (const weapon of weapons) {
    for (const effect of weapon.selectedEffects) add(`${weapon.name || 'equipped weapon'} perk`, effect, 24);
  }
  return sources;
}

function scorePerk(perk, build, weapons, sources, subclassElement) {
  const reasons = [];
  const reasonKeys = new Set();
  const add = (code, label, score, evidence = null) => {
    const key = `${code}:${label}`;
    if (reasonKeys.has(key)) return;
    reasonKeys.add(key);
    reasons.push({ code, label, score, evidence });
  };
  const description = perk.description;
  const champion = championType(description);

  for (const weapon of weapons) {
    if (weapon.weaponType && mentionsWeaponType(description, weapon.weaponType)) {
      add(`weapon-type:${weapon.hash}`, `Supports equipped ${weapon.weaponType}${weapon.name ? ` · ${weapon.name}` : ''}`, 48, equippedCitation([weapon])[0]);
      if (champion) add(`champion:${champion}:${weapon.hash}`, `${champion.toUpperCase()} coverage from the equipped ${weapon.weaponType}`, 58, equippedCitation([weapon])[0]);
    }
    if (explicitElementWeaponMatch(description, weapon.element) || superMatchingWeapon(description, weapon, subclassElement)) {
      add(`weapon-element:${weapon.hash}`, `${weapon.element} weapon match${weapon.name ? ` · ${weapon.name}` : ''}`, 42, equippedCitation([weapon])[0]);
    }
  }

  if (subclassElement && new RegExp(`\\b${escaped(subclassElement)}\\b`, 'i').test(description)) {
    add('subclass-element', `${subclassElement} subclass/Super match`, 36, { element: subclassElement });
  }

  for (const source of sources) {
    let matched = 0;
    for (const [mechanic, pattern] of MECHANICS) {
      if (matched >= 3) break;
      if (pattern.test(description) && pattern.test(source.text)) {
        add(`mechanic:${source.kind}:${mechanic}`, `${mechanic} synergy with ${source.kind} · ${source.name}`, source.weight, { sourceKind: source.kind, sourceName: source.name, mechanic });
        matched += 1;
      }
    }
    for (const element of ELEMENTS) {
      const pattern = new RegExp(`\\b${element}\\b`, 'i');
      if (pattern.test(description) && pattern.test(source.text)) {
        add(`effect-element:${source.kind}:${element}`, `${element} synergy with ${source.kind} · ${source.name}`, Math.max(24, source.weight - 8), { sourceKind: source.kind, sourceName: source.name, element });
      }
    }
  }

  const priorities = build?.forgeLoaderDecision?.statDirective?.priorities ?? {};
  const targets = build?.forgeLoaderDecision?.statDirective?.targets ?? {};
  for (const [stat, pattern] of Object.entries(STAT_PATTERNS)) {
    if (!pattern.test(description)) continue;
    const rank = finiteInteger(priorities?.[stat]);
    if (rank !== null && rank >= 1 && rank <= 6) {
      add(`priority:${stat}`, `Priority ${rank} ${stat.toUpperCase()} directive`, 56 - ((rank - 1) * 7), { stat, rank, target: Number(targets?.[stat] ?? 0) });
    } else if (Number(targets?.[stat] ?? 0) > 0) {
      add(`target:${stat}`, `${stat.toUpperCase()} target support`, 14, { stat, target: Number(targets[stat]) });
    }
  }

  reasons.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  return { score: reasons.reduce((sum, reason) => sum + reason.score, 0), reasons };
}

function compareRanked(left, right) {
  return right.score - left.score
    || Number(right.active) - Number(left.active)
    || left.perk.tierIndex - right.perk.tierIndex
    || left.perk.order - right.perk.order
    || left.perk.hash - right.perk.hash;
}

function selectLegalConfiguration(rows, limit) {
  const selected = [];
  const remaining = new Set(rows.map(row => row.perk.hash));
  while (selected.length < limit) {
    const candidates = rows.filter(row => remaining.has(row.perk.hash) && row.perk.minimumUnlockPointsUsedRequirement <= selected.length).sort(compareRanked);
    if (!candidates.length) break;
    const chosen = candidates[0];
    selected.push(chosen);
    remaining.delete(chosen.perk.hash);
  }
  return selected;
}

function selectSocketBucketConfiguration(rows, slots) {
  const selected=[];
  const selectedHashes=new Set();
  const shortages=[];
  for(const slot of slots){
    const capacity=Math.max(0,finiteInteger(slot?.capacity)??0);
    const permitted=new Set((slot?.perkHashes||[]).map(finiteInteger).filter(hash=>hash!==null));
    const candidates=rows.filter(row=>permitted.has(row.perk.hash)&&!selectedHashes.has(row.perk.hash)).sort(compareRanked);
    const chosen=candidates.slice(0,capacity);
    chosen.forEach(row=>{selected.push(row);selectedHashes.add(row.perk.hash);});
    if(chosen.length<capacity)shortages.push({tierIndex:finiteInteger(slot?.tierIndex),capacity,resolved:chosen.length});
  }
  return {selected,shortages,selectionLimit:slots.reduce((sum,slot)=>sum+Math.max(0,finiteInteger(slot?.capacity)??0),0)};
}

export function resolveBuildWeapons(weaponHashes, manifestDefinitions, curatedTags = {}) {
  const getDefinition=typeof manifestDefinitions?.get==='function'
    ?hash=>manifestDefinitions.get('DestinyInventoryItemDefinition',hash)
    :hash=>manifestDefinitions?.[String(hash)]??null;
  const tags = curatedTags?.inventoryItems ?? {};
  const weapons = [];
  const unresolved = [];
  for (const rawHash of weaponHashes ?? []) {
    const hash = Number(rawHash);
    const definition=getDefinition(hash);
    const row = tags[String(hash)];
    if (!definition || definition.itemType !== 3 || !row?.weaponType || !row?.element) {
      unresolved.push(hash);
      continue;
    }
    weapons.push({
      hash,
      name: definition.displayProperties?.name ?? `Unnamed Destiny definition ${hash}`,
      weaponType: row.weaponType,
      element: row.element
    });
  }
  return { weapons, unresolved };
}

export function recommendArtifactPerks(build, artifactData, { currentSeasonNumber, planFullBuild = false } = {}) {
  const state = artifactState(artifactData, currentSeasonNumber);
  const effectiveSeason = finiteInteger(artifactData?.seasonNumber);
  const artifactHash = hashOf(artifactData) ?? finiteInteger(artifactData?.artifactHash);
  if (state.status !== 'current') {
    return {
      status: state.status,
      selectionStatus: 'blocked',
      seasonNumber: effectiveSeason,
      currentSeasonNumber: finiteInteger(currentSeasonNumber),
      artifactHash,
      selectionLimit: 0,
      selectedPerkHashes: [],
      selectionSequence: [],
      recommendations: [],
      blockers: [state.blocker]
    };
  }

  const artifactTwo=artifactData?.availabilityModel === 'artifact-2-socket-buckets';
  const strictLiveEvidence = !artifactTwo&&(artifactData?.provenance === 'bungie-character-progressions-202' || artifactData?.artifactConfiguration?.provenance?.component === 202);
  const normalized = artifactData.perks.map((perk, index) => normalizePerk(perk, index, strictLiveEvidence));
  const eligible = normalized.filter(perk => planFullBuild ? perk.verified : perk.eligible);
  const weapons = (build?.weapons ?? []).map(normalizeWeapon).filter(weapon => weapon.hash !== null);
  const subclassElement = elementOf(build?.subclassBuild?.super) ?? elementOf(build?.subclass) ?? elementOf(build?.subclassName);
  const sources = effectSources(build, weapons);
  const rows = eligible.map(perk => ({ perk, active: perk.active, ...scorePerk(perk, build, weapons, sources, subclassElement) }));
  const activeCount = normalized.filter(perk => perk.active).length;
  const pointsUsed = finiteInteger(artifactData?.pointsUsed);
  const socketSelection=artifactTwo?selectSocketBucketConfiguration(rows,artifactData.selectionSlots):null;
  const liveSelectionLimit=Math.min(eligible.length,Math.max(0,pointsUsed??activeCount));
  const selectionLimit = artifactTwo?socketSelection.selectionLimit:(planFullBuild?Math.min(eligible.length,LEGACY_ARTIFACT_PLAN_LIMIT):liveSelectionLimit);
  const selected = artifactTwo?socketSelection.selected:selectLegalConfiguration(rows, selectionLimit);
  const selectedHashes = new Set(selected.map(row => row.perk.hash));
  const selectionOrder = new Map(selected.map((row, index) => [row.perk.hash, index + 1]));
  const recommendations = rows.filter(row => row.score > 0).sort(compareRanked).map(row => ({
    artifactPerk: perkCitation(row.perk),
    score: row.score,
    reasons: row.reasons,
    selected: selectedHashes.has(row.perk.hash),
    selectionOrder: selectionOrder.get(row.perk.hash) ?? null
  }));
  const selectedMatchedCount = selected.filter(row => row.score > 0).length;
  const selectionSequence=selected.map((row,index)=>({
    order:index+1,
    artifactPerk:perkCitation(row.perk),
    score:row.score,
    reason:row.reasons?.[0]?.label||`Legal pick for Artifact bucket ${row.perk.column}.`
  }));
  const blockers = [];
  if (selectionLimit === 0) blockers.push(artifactTwo?'Artifact 2.0 exposes no selectable socket buckets.':planFullBuild?'No verified current Artifact perks are available for a target build plan.':'Bungie reports no Artifact unlock points available for this configuration.');
  if (socketSelection?.shortages.length) blockers.push('One or more Artifact 2.0 buckets could not be filled from verified manifest perk choices.');
  if (selected.length < selectionLimit) blockers.push(`Only ${selected.length} of ${selectionLimit} legal Artifact selections could be resolved from verified tier evidence.`);
  if (!recommendations.length) blockers.push('No explicit match was found between verified Artifact descriptions and the staged Forge Loader build.');
  const selectionStatus = blockers.length ? (selected.length === selectionLimit && selectionLimit > 0 ? 'no-verified-match' : 'partial') : 'ready';

  return {
    status: 'current',
    selectionStatus,
    seasonNumber: effectiveSeason,
    currentSeasonNumber: finiteInteger(currentSeasonNumber),
    artifactHash,
    artifactName:text(artifactData?.name),
    selectionModel:artifactTwo?'artifact-2-socket-buckets':'legacy-character-progression-points',
    planMode:planFullBuild&&!artifactTwo?'full-build-target':'current-availability',
    liveSelectionLimit,
    selectionSlots:artifactTwo?artifactData.selectionSlots.map(slot=>({tierIndex:finiteInteger(slot?.tierIndex),bucket:finiteInteger(slot?.bucket),capacity:finiteInteger(slot?.capacity),perkHashes:(slot?.perkHashes||[]).map(finiteInteger).filter(hash=>hash!==null)})):null,
    selectionLimit,
    selectedPerkHashes: selected.map(row => row.perk.hash),
    selectionSequence,
    selectedMatchedCount,
    totalScore: selected.reduce((sum, row) => sum + row.score, 0),
    eligiblePerkCount: eligible.length,
    unresolvedPerkHashes: normalized.filter(perk => !perk.verified && perk.hash !== null).map(perk => perk.hash),
    recommendations,
    blockers
  };
}

export function recommendArtifactLoadout(build, artifacts, {currentSeasonNumber}={}){
  const candidates=(Array.isArray(artifacts)?artifacts:[])
    .filter(artifact=>artifact?.availabilityModel==='artifact-2-socket-buckets')
    .map(artifact=>({artifact,result:recommendArtifactPerks(build,artifact,{currentSeasonNumber})}));
  if(!candidates.length)return recommendArtifactPerks(build,build?.artifact,{currentSeasonNumber});
  const readiness=result=>result.selectionStatus==='ready'?2:result.selectionStatus==='no-verified-match'?1:0;
  candidates.sort((left,right)=>readiness(right.result)-readiness(left.result)
    ||Number(right.result.selectedMatchedCount||0)-Number(left.result.selectedMatchedCount||0)
    ||Number(right.result.totalScore||0)-Number(left.result.totalScore||0)
    ||String(left.artifact.name||'').localeCompare(String(right.artifact.name||''))
    ||Number(left.artifact.hash||0)-Number(right.artifact.hash||0));
  const best=candidates[0];
  return {
    ...best.result,
    artifactHash:hashOf(best.artifact),
    artifactName:text(best.artifact?.name),
    artifactCandidateCount:candidates.length,
    artifactCandidates:candidates.map(({artifact,result})=>({
      artifactHash:hashOf(artifact),
      artifactName:text(artifact?.name),
      selectionStatus:result.selectionStatus,
      selectedMatchedCount:result.selectedMatchedCount,
      totalScore:result.totalScore,
      selectionLimit:result.selectionLimit
    }))
  };
}
