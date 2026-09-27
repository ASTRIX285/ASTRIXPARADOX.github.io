/** Guardian Home: one small, honest career summary built from real Bungie data.
 * Every field is null when Bungie did not return it. Nothing is estimated. */

export type HomeRead = (input: { kind: string; characterId?: string; count?: number; page?: number }) => Promise<any | null>;
export type HomeDefinition = (type: 'DestinyInventoryItemDefinition' | 'DestinyActivityDefinition', hash: number) => Promise<any | null>;

const CLASS_NAMES = ['Titan', 'Hunter', 'Warlock'];
const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const statValue = (group: any, name: string): number | null => num(group?.allTime?.[name]?.basic?.value);
const icon = (path: unknown): string | null => typeof path === 'string' && path.startsWith('/') ? `https://www.bungie.net${path}` : null;

export type HomeInputs = {
  profile: any | null;
  stats: any | null;
  uniqueWeapons: Record<string, any | null>;
  activities: Record<string, any | null>;
};

export function summariseHome(inputs: HomeInputs) {
  const profile = inputs.profile?.Response || null;
  const userInfo = profile?.profile?.data?.userInfo || null;
  const characters = Object.values(profile?.characters?.data || {}) as any[];

  const perCharacter = characters
    .map(row => ({ characterId: String(row.characterId), classType: num(row.classType), minutes: num(row.minutesPlayedTotal), emblem: icon(row.emblemPath), lastPlayed: String(row.dateLastPlayed || '') }))
    .filter(row => row.classType !== null && row.classType >= 0 && row.classType <= 2 && row.minutes !== null);
  const totalMinutes = perCharacter.length ? perCharacter.reduce((sum, row) => sum + (row.minutes as number), 0) : null;

  // Split play time by class (an account can have two characters of one class).
  const byClass = [0, 1, 2].map(classType => ({
    className: CLASS_NAMES[classType],
    minutes: perCharacter.filter(row => row.classType === classType).reduce((sum, row) => sum + (row.minutes as number), 0)
  })).filter(row => row.minutes > 0);
  const classShares = totalMinutes && totalMinutes > 0
    ? byClass.map(row => ({ ...row, share: Math.round(row.minutes / totalMinutes * 100) })).sort((a, b) => b.minutes - a.minutes)
    : [];

  const stats = inputs.stats?.Response || null;
  const pve = stats?.allPvE || null, pvp = stats?.allPvP || null, raid = stats?.raid || null;
  const sum = (name: string) => {
    const values = [statValue(pve, name), statValue(pvp, name)];
    return values.every(value => value === null) ? null : values.reduce((total, value) => (total as number) + (value ?? 0), 0);
  };
  const abilityKills = { grenade: sum('weaponKillsGrenade'), melee: sum('weaponKillsMelee'), super: sum('weaponKillsSuper') };
  const hasAbilities = Object.values(abilityKills).some(value => value !== null);
  const pveEntered = statValue(pve, 'activitiesEntered'), pvpEntered = statValue(pvp, 'activitiesEntered');

  // Bungie's unique weapon history covers Exotic weapons only.
  const weaponKills = new Map<number, number>();
  for (const payload of Object.values(inputs.uniqueWeapons)) {
    for (const weapon of payload?.Response?.weapons || []) {
      const hash = num(weapon?.referenceId), kills = num(weapon?.values?.uniqueWeaponKills?.basic?.value);
      if (hash === null || kills === null) continue;
      weaponKills.set(hash, (weaponKills.get(hash) || 0) + kills);
    }
  }
  const topWeapon = [...weaponKills.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || null;

  let lastActivity: any = null;
  for (const payload of Object.values(inputs.activities)) {
    const row = payload?.Response?.activities?.[0];
    if (!row?.period) continue;
    if (!lastActivity || Date.parse(row.period) > Date.parse(lastActivity.period)) lastActivity = row;
  }

  return {
    displayName: userInfo?.bungieGlobalDisplayName
      ? `${userInfo.bungieGlobalDisplayName}${num(userInfo.bungieGlobalDisplayNameCode) !== null ? `#${String(userInfo.bungieGlobalDisplayNameCode).padStart(4, '0')}` : ''}`
      : (userInfo?.displayName || null),
    timePlayed: totalMinutes === null ? null : { minutes: totalMinutes, hours: Math.floor(totalMinutes / 60), days: Math.floor(totalMinutes / 1440) },
    classShares,
    mainCharacter: classShares[0] ? { className: classShares[0].className, share: classShares[0].share } : null,
    topExoticWeapon: topWeapon ? { hash: topWeapon[0], kills: topWeapon[1] } : null,
    abilityKills: hasAbilities ? abilityKills : null,
    modes: pveEntered === null && pvpEntered === null ? null : { pve: pveEntered, pvp: pvpEntered },
    selfEliminations: sum('suicides'),
    raidClears: statValue(raid, 'activitiesCleared'),
    lastActivity: lastActivity ? {
      hash: num(lastActivity.activityDetails?.directorActivityHash) ?? num(lastActivity.activityDetails?.referenceId),
      period: lastActivity.period,
      completed: num(lastActivity.values?.completed?.basic?.value) === 1,
      durationSeconds: num(lastActivity.values?.activityDurationSeconds?.basic?.value)
    } : null,
    characterIds: perCharacter.map(row => row.characterId)
  };
}

export async function buildHomeSummary(read: HomeRead, definition: HomeDefinition) {
  const [profile, stats] = await Promise.all([read({ kind: 'home-profile' }), read({ kind: 'home-stats' })]);
  const characterIds = Object.keys(profile?.Response?.characters?.data || {}).filter(id => /^\d+$/.test(id));
  const uniqueWeapons: Record<string, any> = {}, activities: Record<string, any> = {};
  await Promise.all(characterIds.flatMap(characterId => [
    read({ kind: 'unique-weapons', characterId }).then(value => { uniqueWeapons[characterId] = value; }),
    read({ kind: 'activity-history', characterId, count: 1, page: 0 }).then(value => { activities[characterId] = value; })
  ]));
  const summary = summariseHome({ profile, stats, uniqueWeapons, activities });
  const [weaponDefinition, activityDefinition] = await Promise.all([
    summary.topExoticWeapon ? definition('DestinyInventoryItemDefinition', summary.topExoticWeapon.hash) : null,
    summary.lastActivity?.hash ? definition('DestinyActivityDefinition', summary.lastActivity.hash) : null
  ]);
  const weaponName = weaponDefinition?.displayProperties?.name;
  const activityName = activityDefinition?.displayProperties?.name;
  const { characterIds: _ids, ...rest } = summary;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...rest,
    // A card without a real name is dropped rather than shown with a guess.
    topExoticWeapon: summary.topExoticWeapon && weaponName
      ? { name: weaponName, icon: icon(weaponDefinition?.displayProperties?.icon), kills: summary.topExoticWeapon.kills }
      : null,
    lastActivity: summary.lastActivity && activityName
      ? { name: activityName, period: summary.lastActivity.period, completed: summary.lastActivity.completed, durationSeconds: summary.lastActivity.durationSeconds }
      : null
  };
}
