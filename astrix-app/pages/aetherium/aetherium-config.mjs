/**
 * The Aetherium page config. One place for the armory Worker address.
 *
 * AETHERIUM_WORKER_URL stays null until aetherium-worker is deployed. While it is null the
 * pages show the ASTRIX285 fixtures as a labelled demo. Once live, set it to the Worker origin
 * (for example "https://aion2.astrixparadox.com") with no trailing slash.
 */
export const AETHERIUM_WORKER_URL = null;

export const AETHERIUM_REGION = 'eu';

/** The labelled demo: Miguel's own character, captured from the public EU armory (#451). */
export const AETHERIUM_DEMO = Object.freeze({
  capturedOn: '2026-10-05',
  name: 'ASTRIX285',
  fixtures: '/astrix-app/tools/fixtures/aion2/eu/'
});

export const AETHERIUM_ROSTER_KEY = 'aetherium.roster.v1';
export const AETHERIUM_ROSTER_SLOTS = 8;
