import type { SessionRecord } from './auth-record';

// Reports responses deliberately bypass Durable Object and edge caches.
export async function reportsRead(request: Request, session: SessionRecord, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const member = session.activeDestinyMembership;
  if (!member) return Response.json({error:'destiny_membership_not_found'}, {status:404});
  const input = new URL(request.url);
  const kind = input.searchParams.get('kind');
  const character = input.searchParams.get('characterId') || '';
  const root = `https://www.bungie.net/Platform/Destiny2/${member.membershipType}`;
  let url: URL;
  if (kind === 'profile') {
    url = new URL(`${root}/Profile/${encodeURIComponent(member.membershipId)}/`);
    url.searchParams.set('components', '100,200,202,900');
  } else if (kind === 'aggregate' && /^\d+$/.test(character)) {
    url = new URL(`${root}/Account/${encodeURIComponent(member.membershipId)}/Character/${character}/Stats/AggregateActivityStats/`);
  } else {
    return Response.json({error:'invalid_reports_request'}, {status:400});
  }
  try {
    const response = await fetchImpl(url, {
      headers: {Authorization:`Bearer ${session.accessToken}`, 'X-API-Key':apiKey},
      signal:AbortSignal.timeout(30_000)
    });
    // Preserve Bungie ErrorCode/ThrottleSeconds and HTTP Retry-After verbatim.
    const headers = new Headers({'Content-Type':'application/json', 'Cache-Control':'private, no-store', 'Access-Control-Expose-Headers':'Retry-After'});
    if (response.headers.has('Retry-After')) headers.set('Retry-After', response.headers.get('Retry-After')!);
    return new Response(response.body, {status:response.status, headers});
  } catch {
    return Response.json({error:'reports_unavailable'}, {status:502, headers:{'Cache-Control':'no-store'}});
  }
}
