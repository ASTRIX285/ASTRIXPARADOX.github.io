import { BungieDefinitionFetchError, fetchBungieDefinitions } from './bungie-definition-fetch.ts';
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
export const REPORTS_SCHEMA = `3-${RELEASE_ORDER_VERSION}`;
const difficulties = ['Normal','Standard','Advanced','Expert','Legend','Legendary','Master','Prestige','Grandmaster','Contest','Challenge Mode','Explorer','Eternity','Ultimatum','Epic'];
const difficultyPattern = difficulties.join('|');
const suffix = new RegExp(`(?::\\s*|\\s*\\()(${difficultyPattern})\\)?$`, 'i');
export function activityIdentity(def: ActivityDefinition): {name: string; difficulty: string} {
  const displayed = (def.displayProperties?.name || def.originalDisplayProperties?.name || '').trim();
  let name = displayed.replace(/\s*\(Matchmade\)$/i, '');
  const match = name.match(suffix);
  let difficulty = /^Nightfall Grandmaster:/i.test(displayed) ? 'Grandmaster' : match ? difficulties.find(value => value.toLowerCase() === match[1].toLowerCase())! : '-';
  name = name.replace(/^(?:Nightfall(?: Grandmaster)?|(?:Grandmaster|Master) Conquest):\s*/i, '').replace(suffix, '').replace(/: Level \d+$/i, '').replace(/: (?:Customize|Matchmade)$/i, '').trim();
  // Prompt 20a-fix2: Epic belongs to the base raid, including Epic: Contest.
  if (/\s*\(Epic\)$/i.test(name)) { name = name.replace(/\s*\(Epic\)$/i, ''); difficulty = 'Epic'; }
  const pantheon = name.match(/^(?:The )?Pantheon:\s*(.+)$/i);
  const featured = name.match(/^Featured (?:Encore|Reprise):\s*(.+?):\s*(?:The Pantheon|Atraks Sovereign)$/i);
  if (pantheon || featured) return {name: 'The Pantheon', difficulty: (pantheon || featured)![1]};
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
export function buildReportsCatalogue(definitions: Record<string, ActivityDefinition>, version: string, logMissing: (message: string) => void = console.warn) {
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
  // Prompt 20a-fix2: CI is strict; a new live activity cannot break Reports.
  // Dedupe within this version's build; edge-cache hits do not rebuild or log.
  const reported = new Set<string>(), labelled = new Set<string>();
  for (const row of activities) {
    const key = `${row.series}:${row.name}`;
    if (row.difficulty !== '-') labelled.add(key);
    if (['raids','dungeons','exotic'].includes(row.series) && row.releaseOrder === null && !reported.has(key)) {
      reported.add(key); logMissing(`Missing Reports release order: ${key}`);
    }
  }
  for (const row of activities) if (row.difficulty === '-' && labelled.has(`${row.series}:${row.name}`)) row.difficulty = row.series === 'vanguard' ? 'Standard' : 'Normal';
  activities.sort((a,b) => a.series.localeCompare(b.series) || (['raids','dungeons','exotic'].includes(a.series) ? (b.releaseOrder ?? Number.MAX_SAFE_INTEGER) - (a.releaseOrder ?? Number.MAX_SAFE_INTEGER) : 0) || a.name.localeCompare(b.name) || a.hash.localeCompare(b.hash));
  return {schema: REPORTS_SCHEMA, version, activities};
}
export type CatalogueStage = 'manifest' | 'fetch' | 'size' | 'parse' | 'build' | 'cache';
export class ReportsCatalogueFailure extends Error {
  stage: CatalogueStage;
  bungieStatus: number | null;
  constructor(stage: CatalogueStage, bungieStatus: number | null = null) {
    // Fixed messages only: upstream exceptions may contain URLs or credentials.
    super(stage === 'size' ? 'Activity definitions unavailable or too large' : `Reports catalogue ${stage} unavailable`);
    this.stage = stage;
    this.bungieStatus = bungieStatus;
  }
}
async function atStage<T>(stage: CatalogueStage, operation: () => T | Promise<T>, bungieStatus: number | null = null): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ReportsCatalogueFailure) throw error;
    throw new ReportsCatalogueFailure(stage, error instanceof BungieDefinitionFetchError ? error.bungieStatus : bungieStatus);
  }
}
async function boundedDefinitions(response: Response): Promise<Record<string, ActivityDefinition>> {
  const limit = 24 * 1024 * 1024;
  const text = await atStage('size', async () => {
    if (!response.body || Number(response.headers.get('Content-Length')) > limit) {
      await response.body?.cancel();
      throw new Error('Activity definitions unavailable');
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let size = 0, text = '';
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Activity definitions too large'); }
        text += decoder.decode(value, {stream: true});
      }
      return text + decoder.decode();
    } finally { reader.releaseLock(); }
  }, response.status);
  return atStage('parse', () => JSON.parse(text), response.status);
}
export async function reportsCatalogue(request: Request, manifest: ReportsManifest, cache: Pick<Cache, 'match' | 'put'>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!manifest.version) throw new ReportsCatalogueFailure('manifest');
  const key = new URL('/bungie/reports/catalogue', request.url);
  key.searchParams.set('schema', REPORTS_SCHEMA); key.searchParams.set('version', manifest.version);
  const cacheRequest = new Request(key);
  const cached = await atStage('cache', () => cache.match(cacheRequest));
  // The stable public URL must revalidate its manifest version on later visits.
  const clientResponse = (response: Response) => { const headers = new Headers(response.headers); headers.set('Cache-Control', 'public, max-age=300'); return new Response(response.body, {status: response.status, headers}); };
  if (cached) return clientResponse(cached);
  const path = manifest.jsonWorldComponentContentPaths?.en?.DestinyActivityDefinition;
  if (!path?.startsWith('/common/destiny2_content/json/') || path.includes('..')) throw new ReportsCatalogueFailure('manifest');
  const response = await atStage('fetch', () => fetchBungieDefinitions(new URL(path, 'https://www.bungie.net'), fetchImpl));
  const definitions = await boundedDefinitions(response);
  const slim = await atStage('build', () => {
    const result = buildReportsCatalogue(definitions, manifest.version!);
    return new Response(JSON.stringify(result), {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=31536000', 'ETag': `"${REPORTS_SCHEMA}-${manifest.version}"`}});
  }, response.status);
  await atStage('cache', () => cache.put(cacheRequest, slim.clone()), response.status);
  return clientResponse(slim);
}
/** The route boundary keeps diagnostic stages consistent, including manifest loading. */
export async function reportsCatalogueResponse(request: Request, loadManifest: () => Promise<ReportsManifest>, cache: Pick<Cache, 'match' | 'put'>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  try {
    const manifest = await atStage('manifest', loadManifest);
    return await reportsCatalogue(request, manifest, cache, fetchImpl);
  } catch (error) {
    const failure = error instanceof ReportsCatalogueFailure ? error : new ReportsCatalogueFailure('build');
    const {stage, message, bungieStatus} = failure;
    console.error('reports_catalogue_failed', {stage, message, bungieStatus});
    return Response.json({error: 'reports_catalogue_unavailable', stage}, {status: 502, headers: {'Cache-Control': 'no-store'}});
  }
}
