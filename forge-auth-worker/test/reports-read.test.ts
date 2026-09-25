import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportsRead} from '../src/reports-read.ts';
import type {SessionRecord} from '../src/auth-record.ts';
const session={activeDestinyMembership:{membershipId:'123',membershipType:3},accessToken:'fixture-token'} as SessionRecord;
test('Reports streams aggregate responses without server caching and binds membership to session',async()=>{
  let calls=0;
  const response=await reportsRead(new Request('https://auth.test/bungie/reports?kind=aggregate&characterId=456&membershipId=999'),session,'fixture-key',async(input,init)=>{
    calls++;assert.equal(String(input),'https://www.bungie.net/Platform/Destiny2/3/Account/123/Character/456/Stats/AggregateActivityStats/');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer fixture-token');
    return Response.json({ErrorCode:1,Response:{activities:[]}});
  });
  assert.equal(calls,1);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(await response.json(),{ErrorCode:1,Response:{activities:[]}});
});
test('Reports preserves throttle envelope, status and retry header',async()=>{
  const response=await reportsRead(new Request('https://auth.test/bungie/reports?kind=profile'),session,'fixture-key',async(input)=>{
    assert.equal(new URL(String(input)).searchParams.get('components'),'100,200,202,900');
    return Response.json({ErrorCode:36,ThrottleSeconds:12},{status:429,headers:{'Retry-After':'12'}});
  });
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'12');assert.equal((await response.json()).ThrottleSeconds,12);
});
test('Reports rejects invalid kinds and characters without upstream requests',async()=>{
  for(const query of ['kind=aggregate&characterId=../1','kind=delete','kind=aggregate']){
    const response=await reportsRead(new Request(`https://auth.test/bungie/reports?${query}`),session,'fixture-key',async()=>{throw new Error('Must not fetch');});assert.equal(response.status,400);
  }
});
