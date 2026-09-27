import type { SessionRecord } from './auth-record';

// Reports responses deliberately bypass Durable Object and edge caches.
export async function reportsRead(request: Request, session: SessionRecord, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let member = session.activeDestinyMembership;
  if (!member) return Response.json({error:'destiny_membership_not_found'}, {status:404});
  const input = new URL(request.url);
  const subjectId = input.searchParams.get('subjectId');
  const subjectType = input.searchParams.get('subjectType');
  const external = subjectId !== null || subjectType !== null;
  if (external) {
    if (!/^\d+$/.test(subjectId || '') || !/^(1|2|3|5|6|10)$/.test(subjectType || '')) return Response.json({error:'invalid_reports_subject'}, {status:400});
    member = {...member, membershipId:subjectId!, membershipType:Number(subjectType)};
  }
  const kind = input.searchParams.get('kind');
  const character = input.searchParams.get('characterId') || '';
  const root = `https://www.bungie.net/Platform/Destiny2/${member.membershipType}`;
  let url: URL;
  if (kind === 'definition') {
    const type = input.searchParams.get('definition') || '';
    const hash = input.searchParams.get('hash') || '';
    if (!['DestinyActivityDefinition','DestinyActivitySelectableSkullCollectionDefinition'].includes(type) || !/^\d+$/.test(hash)) return Response.json({error:'invalid_reports_definition'}, {status:400});
    url = new URL(`https://www.bungie.net/Platform/Destiny2/Manifest/${type}/${hash}/`);
  } else if (kind === 'profile') {
    url = new URL(`${root}/Profile/${encodeURIComponent(member.membershipId)}/`);
    url.searchParams.set('components', external ? '100,200' : '100,200,202,900');
  } else if (kind === 'aggregate' && /^\d+$/.test(character)) {
    url = new URL(`${root}/Account/${encodeURIComponent(member.membershipId)}/Character/${character}/Stats/AggregateActivityStats/`);
  } else if (kind === 'history' && /^\d+$/.test(character)) {
    const page = input.searchParams.get('page') || '0';
    if (!/^\d+$/.test(page) || !Number.isSafeInteger(Number(page))) {
      return Response.json({error:'invalid_reports_request'}, {status:400});
    }
    url = new URL(`${root}/Account/${encodeURIComponent(member.membershipId)}/Character/${character}/Stats/Activities/`);
    url.searchParams.set('count', '250');
    url.searchParams.set('mode', '0');
    url.searchParams.set('page', page);
  } else {
    return Response.json({error:'invalid_reports_request'}, {status:400});
  }
  try {
    const response = await fetchImpl(url, {
      headers: external || kind === 'definition' ? {'X-API-Key':apiKey} : {Authorization:`Bearer ${session.accessToken}`, 'X-API-Key':apiKey},
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
