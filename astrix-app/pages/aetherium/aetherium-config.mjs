/**
 * The Aetherium page config. One place for the Worker address and the regions.
 *
 * The aetherium-worker origin, no trailing slash (deployed by Miguel, 5 Oct 2026). If the Worker
 * answers with an error or can't be reached, the pages say so and offer a retry. No page ever shows
 * a stand-in character. With null the pages run with no live data at all (the search says so).
 */
export const AETHERIUM_WORKER_URL = 'https://aetherium-worker.astrix285.workers.dev';

/** The five regions of the official AION 2 search page, with the names it uses. Only these codes are ever sent. */
export const AETHERIUM_REGIONS = Object.freeze([
  Object.freeze({ code: 'naw', name: 'North America - West' }),
  Object.freeze({ code: 'nae', name: 'North America - East' }),
  Object.freeze({ code: 'eu', name: 'Europe' }),
  Object.freeze({ code: 'la', name: 'South America' }),
  Object.freeze({ code: 'as', name: 'Asia' })
]);
/** Short labels for roster cards and the roster heading only. The full official names stay on the Daeva Card chip and the Region picker. */
export const AETHERIUM_REGION_SHORT = Object.freeze({ naw: 'NA West', nae: 'NA East', eu: 'EU', la: 'SA', as: 'Asia' });
/** The region a link without one opens in, and the region first-time visitors see. */
export const AETHERIUM_REGION = 'eu';
/** Where the last region used is kept on this device. */
export const AETHERIUM_REGION_KEY = 'aetherium.region.v1';

/** The saved server list for every region: first paint and the fallback. The live list from the Worker wins whenever it answers. */
export const AETHERIUM_SERVERS = '/astrix-app/games/aion2/data/servers.json';

/** The stat icon sprite: our own art, one symbol per stat (ae-stat-<id>), named by each stat's icon field in stats.json. Never NCSOFT's stat icons. */
export const AETHERIUM_STAT_ICONS = '/astrix-app/pages/aetherium/icons/stats.svg?v=20261011-1';

/** The official art the intro shows (class renders and the NPC guide), hotlinked from the NCSOFT CDN, with provenance. */
export const AETHERIUM_INTRO_ART = '/astrix-app/games/aion2/data/intro-art.json';
/** The only host intro art may come from. An entry on any other host is never shown. */
export const AETHERIUM_ART_HOST = 'https://assets.playnccdn.com/';

/** The roster is kept per server (the public data cannot tell which characters share an account). v1 was one list for the device. */
export const AETHERIUM_ROSTER_KEY = 'aetherium.roster.v2';
export const AETHERIUM_ROSTER_KEY_V1 = 'aetherium.roster.v1';
/** Slots per server (AION 2 allows 8 characters on a server). */
export const AETHERIUM_ROSTER_SLOTS = 8;
