/** Public definition downloads share Bungie's accepted client header and redirects. */
export const BUNGIE_DEFINITION_USER_AGENT = 'ASTRIX-PARADOX/alpha (+https://astrixparadox.com)';
export class BungieDefinitionFetchError extends Error {
  bungieStatus: number | null;
  constructor(bungieStatus: number | null = null) {
    super('Activity definitions unavailable');
    this.bungieStatus = bungieStatus;
  }
}
export async function fetchBungieDefinitions(url: URL, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (url.origin !== 'https://www.bungie.net') throw new BungieDefinitionFetchError();
  let response: Response;
  try {
    // Default redirect following matches the working manifest table download.
    response = await fetchImpl(url, {
      headers: {'User-Agent': BUNGIE_DEFINITION_USER_AGENT},
      signal: AbortSignal.timeout(30_000)
    });
  } catch { throw new BungieDefinitionFetchError(); }
  let allowed = false;
  try { allowed = new URL(response.url).origin === 'https://www.bungie.net'; } catch { /* Missing final URL is not an origin check. */ }
  if (!allowed || !response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new BungieDefinitionFetchError(response.status);
  }
  return response;
}
