/**
 * The Aetherium page config. One place for the Worker address and the regions.
 *
 * The aetherium-worker origin, no trailing slash (deployed by Miguel, 5 Oct 2026). If the Worker
 * answers with an error or can't be reached, the pages fall back to the ASTRIX285 fixtures as a
 * labelled demo. Set it to null to run the pages on the demo only.
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
/** The region a link without one opens in, and the region first-time visitors see. */
export const AETHERIUM_REGION = 'eu';
/** Where the last region used is kept on this device. */
export const AETHERIUM_REGION_KEY = 'aetherium.region.v1';

/** The labelled demo: Miguel's own character, captured from the public Europe site (#451). */
export const AETHERIUM_DEMO = Object.freeze({
  capturedOn: '2026-10-05',
  name: 'ASTRIX285',
  fixtures: '/astrix-app/tools/fixtures/aion2/eu/'
});

export const AETHERIUM_ROSTER_KEY = 'aetherium.roster.v1';
export const AETHERIUM_ROSTER_SLOTS = 8;
