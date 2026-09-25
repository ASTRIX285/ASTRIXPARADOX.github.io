import { RELEASE_ORDER_VERSION, releaseOrder } from './reports-release-order.ts';

export interface ActivityDefinition {
  hash: number; displayProperties?: { name?: string }; originalDisplayProperties?: { name?: string };
  activityModeTypes?: number[]; activityTypeHash?: number; pgcrImage?: string;
  redacted?: boolean; isPlaylist?: boolean;
}
export interface ReportsActivity {
  hash: string; name: string; series: string; difficulty: string;
  pgcrImage: string; releaseOrder: number | null;
}
export interface ReportsManifest { version?: string; jsonWorldComponentContentPaths?: { en?: Record<string, string> } }
export const REPORTS_SCHEMA = `2-${RELEASE_ORDER_VERSION}`;
const difficulties = ['Normal','Standard','Advanced','Expert','Legend','Legendary','Master','Prestige','Grandmaster','Contest','Challenge Mode','Explorer','Eternity','Ultimatum'];
const difficultyPattern = difficulties.join('|');
const suffix = new RegExp(`(?::\\s*|\\s*\\()(${difficultyPattern})\\)?$`, 'i');
export function activityIdentity(def: ActivityDefinition): {name: string; difficulty: string} {
  const displayed = (def.displayProperties?.name || def.originalDisplayProperties?.name || '').trim();
  let name = displayed.replace(/\s*\(Matchmade\)$/i, '');
  const match = name.match(suffix);
  const difficulty = /^Nightfall Grandmaster:/i.test(displayed) ? 'Grandmaster' : match ? difficulties.find(value => value.toLowerCase() === match[1].toLowerCase())! : '-';
  name = name.replace(/^(?:Nightfall(?: Grandmaster)?|(?:Grandmaster|Master) Conquest):\s*/i, '').replace(suffix, '').replace(/: Level \d+$/i, '').replace(/: (?:Customize|Matchmade)$/i, '').trim();
  return {name, difficulty};
}
function seriesFor(def: ActivityDefinition): string | null {
  const modes = def.activityModeTypes || [], name = def.displayProperties?.name || '';
  if (/\bConquest\b/i.test(name)) return 'conquests';
  if (modes.includes(4) || def.activityTypeHash === 2043403989) return 'raids';
  if (modes.includes(82) || def.activityTypeHash === 608898761) return 'dungeons';
  if (modes.includes(87)) return 'lost-sectors';
  if (def.activityTypeHash === 1227821118 || /^(?:\/\/node\.ovrd\.AVALON\/\/|Presage|Harbinger|The Whisper|Zero Hour|Vox Obscura|Operation: Seraph's Shield|Starcrossed|Encore|Kell's Fall|Derealize|Dual Destiny|Heliostat|Oblation)(?::|$)/i.test(name)) return 'exotic';
  if (modes.some(mode => [3,16,17,18,46,47].includes(mode))) return 'vanguard';
  if (modes.includes(2) || def.activityTypeHash === 1686739444) return 'story';
  return null;
}
export function validateReleaseCoverage(activities: ReportsActivity[]): void {
  for (const row of activities) {
    if (['raids','dungeons','exotic'].includes(row.series) && releaseOrder(row.series, row.name) === null) throw new Error(`Missing Reports release order: ${row.series}/${row.name}`);
    if (row.releaseOrder !== releaseOrder(row.series, row.name)) throw new Error(`Reports release order mismatch: ${row.name}`);
  }
}
export function buildReportsCatalogue(definitions: Record<string, ActivityDefinition>, version: string) {
  const values = Object.values(definitions);
  const lostSectors = new Set(values.filter(def => def.activityModeTypes?.includes(87)).map(def => activityIdentity(def).name));
  const activities: ReportsActivity[] = [];
  for (const def of values) {
    const {name, difficulty} = activityIdentity(def);
    const series = lostSectors.has(name) ? 'lost-sectors' : seriesFor(def);
    if (!series || !name || def.redacted || def.isPlaylist) continue;
    // Only Bungie relative art paths cross the public catalogue boundary.
    const pgcrImage = def.pgcrImage?.startsWith('/img/') ? def.pgcrImage : '';
    activities.push({hash: String(def.hash), name, series, difficulty, pgcrImage, releaseOrder: releaseOrder(series, name)});
  }
  validateReleaseCoverage(activities);
  activities.sort((a,b) => a.series.localeCompare(b.series) || (b.releaseOrder || 0) - (a.releaseOrder || 0) || a.name.localeCompare(b.name) || a.hash.localeCompare(b.hash));
  return {schema: REPORTS_SCHEMA, version, activities};
}
async function boundedDefinitions(response: Response): Promise<Record<string, ActivityDefinition>> {
  const limit = 24 * 1024 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get('Content-Length')) > limit) throw new Error('Activity definitions unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Activity definitions too large'); }
      text += decoder.decode(value, {stream: true});
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { reader.releaseLock(); }
}
export async function reportsCatalogue(request: Request, manifest: ReportsManifest, cache: Pick<Cache, 'match' | 'put'>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!manifest.version) throw new Error('Manifest version unavailable');
  const key = new URL('/bungie/reports/catalogue', request.url);
  key.searchParams.set('schema', REPORTS_SCHEMA); key.searchParams.set('version', manifest.version);
  const cacheRequest = new Request(key);
  const cached = await cache.match(cacheRequest);
  // The stable public URL must revalidate its manifest version on later visits.
  const clientResponse = (response: Response) => { const headers = new Headers(response.headers); headers.set('Cache-Control', 'public, max-age=300'); return new Response(response.body, {status: response.status, headers}); };
  if (cached) return clientResponse(cached);
  const path = manifest.jsonWorldComponentContentPaths?.en?.DestinyActivityDefinition;
  if (!path?.startsWith('/common/destiny2_content/json/') || path.includes('..')) throw new Error('Activity definitions unavailable');
  const response = await fetchImpl(new URL(path, 'https://www.bungie.net'), {redirect: 'error', signal: AbortSignal.timeout(30_000)});
  const result = buildReportsCatalogue(await boundedDefinitions(response), manifest.version);
  const slim = new Response(JSON.stringify(result), {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=31536000', 'ETag': `"${REPORTS_SCHEMA}-${manifest.version}"`}});
  await cache.put(cacheRequest, slim.clone());
  return clientResponse(slim);
}
