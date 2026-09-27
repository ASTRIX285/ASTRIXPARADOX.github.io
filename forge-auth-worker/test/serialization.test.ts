import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json } from '../src/web.ts';
import { boundedStringify, jsonByteLength } from '../../astrix-app/core/bounded-json.mjs';

test('oversized worker response becomes retryable 503 before allocating its expanded JSON', t => {
  const logs: unknown[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  let value: any = { description: 'x'.repeat(1024) };
  for (let i=0;i<20;i++) value={ left: value, right: value };
  assert.ok(jsonByteLength(value,{limit:Infinity})>512*1024*1024);
  assert.throws(()=>boundedStringify(value,'private account'),(error: any)=>error.code==='profile_payload_too_large');
  const response=json({profile:value});
  assert.equal(response.status,503);
  assert.equal(response.headers.has('set-cookie'),false);
  assert.equal(response.headers.has('location'),false);
  assert.match(JSON.stringify(logs),/profile_payload_too_large/);
  assert.doesNotMatch(JSON.stringify(logs),/xxxxxxxx/);
  return response.json().then((body: any)=>{assert.equal(body.error,'profile_payload_too_large');assert.equal(body.authenticated,undefined);});
});
