import { json } from './web.ts';
import { readBounded } from './compressed-json.ts';
const pending = new Map<string, Promise<Response>>();
const MAX_SHARE_BYTES = 1024 * 1024;
/** Public shares only. No caller cookies, auth headers or arbitrary upstream URLs. */
export async function dimShareRoute(request: Request, cache: Pick<Cache, 'match' | 'put'>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url), match = /^\/dim\/share\/([a-z0-9]{7,64})$/i.exec(url.pathname);
  if (request.method !== 'GET') return json({error: 'method_not_allowed'}, 405);
  if (!match) return json({error: 'invalid_share_id'}, 400);
  const id = match[1].toLowerCase(), key = new Request(`https://astrixparadox.com/dim/share/${id}`);
  const cached = await cache.match(key).catch(() => undefined);
  if (cached) return cached;
  let task = pending.get(id);
  if (!task) {
    task = (async () => {
      try {
        const upstream = await fetchImpl(`https://api.destinyitemmanager.com/loadout_share?shareId=${id}`, {headers: {Accept: 'application/json'}, credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(12000)});
        let response: Response;
        if (upstream.status === 404 || upstream.status === 410) response = json({error: 'expired_link'}, upstream.status, {'Cache-Control': 'public, max-age=60'});
        else if (!upstream.ok || !upstream.body) response = json({error: 'dim_unreachable'}, 503, {'Cache-Control': 'public, max-age=15'});
        else {
          const payload = JSON.parse(new TextDecoder().decode(await readBounded(upstream.body, MAX_SHARE_BYTES)));
          const loadout = payload?.loadout;
          if (!loadout || typeof loadout.name !== 'string' || !Array.isArray(loadout.equipped) || ![0,1,2,3].includes(loadout.classType)) throw new Error('invalid_dim_share');
          // A public share is immutable. Keep the account-independent payload at the edge.
          response = json({loadout}, 200, {'Cache-Control': 'public, max-age=604800'});
        }
        await cache.put(key, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        console.error('dim_share_proxy_failed', {message: error instanceof Error ? error.message : String(error)});
        return json({error: 'dim_unreachable'}, 503);
      }
    })().finally(() => pending.delete(id));
    pending.set(id, task);
  }
  return (await task).clone();
}
