/**
 * The Aetherium page config. One place for the armory Worker address.
 *
 * The aetherium-worker origin, no trailing slash (deployed by Miguel, 5 Oct 2026). If the Worker
 * answers with an error or can't be reached, the pages fall back to the ASTRIX285 fixtures as a
 * labelled demo. Set it to null to run the pages on the demo only.
 */
export const AETHERIUM_WORKER_URL = 'https://aetherium-worker.astrix285.workers.dev';

export const AETHERIUM_REGION = 'eu';

/** The labelled demo: Miguel's own character, captured from the public EU armory (#451). */
export const AETHERIUM_DEMO = Object.freeze({
  capturedOn: '2026-10-05',
  name: 'ASTRIX285',
  fixtures: '/astrix-app/tools/fixtures/aion2/eu/'
});

export const AETHERIUM_ROSTER_KEY = 'aetherium.roster.v1';
export const AETHERIUM_ROSTER_SLOTS = 8;
