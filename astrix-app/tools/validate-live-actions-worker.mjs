#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const worker=await readFile(new URL('../../forge-auth-worker/src/index.ts',import.meta.url),'utf8');
const web=await readFile(new URL('../../forge-auth-worker/src/web.ts',import.meta.url),'utf8');
const sessionRecord=await readFile(new URL('../../forge-auth-worker/src/auth-record.ts',import.meta.url),'utf8');

assert.match(worker,/const DESTINY_ACTION_CAPABILITIES = Object\.freeze\(\{[\s\S]*?captureSnapshot: true[\s\S]*?transferItems: true[\s\S]*?equipItems: true[\s\S]*?insertSocketPlugFree: true[\s\S]*?verifyFinalState: true[\s\S]*?clearLoadout: true/,'The Worker must advertise the exact live-action capability contract.');
assert.match(worker,/transferItems: true[\s\S]*?pullFromPostmaster: true[\s\S]*?equipItems: true/,'The live capability contract must explicitly advertise the approved Postmaster executor beside transfer and equip.');
assert.match(worker,/async function sessionRoute[\s\S]*?csrfToken: session\.csrfToken[\s\S]*?capabilities: \{ destinyActions: DESTINY_ACTION_CAPABILITIES \}/,'Authenticated sessions must return a CSRF token and explicit route capabilities.');
assert.match(sessionRecord,/verifiedCharacterIds\?: string\[\][\s\S]*?verifiedCharactersAt\?: number/,'The session record must retain the short-lived verified Guardian binding.');

assert.match(worker,/async function actionRequestBody[\s\S]*?Content-Length[\s\S]*?> 32_768[\s\S]*?request\.text\(\)[\s\S]*?TextEncoder\(\)\.encode\(raw\)\.byteLength > 32_768[\s\S]*?JSON\.parse\(raw\)/,'Action bodies must remain JSON-only and size-bounded even when Content-Length is absent.');
assert.match(worker,/function mutationOriginAllowed[\s\S]*?allowedOrigins\(env\)\.includes\(origin\)/,'Every mutation must require an allow-listed browser Origin.');
assert.match(worker,/async function bungieActionRoute[\s\S]*?mutationOriginAllowed[\s\S]*?authenticatedSession[\s\S]*?X-CSRF-Token[\s\S]*?csrf_validation_failed[\s\S]*?membership_mismatch[\s\S]*?verifySessionCharacter[\s\S]*?character_binding_mismatch/,'Mutation routes must enforce Origin, session, CSRF, membership and Guardian binding before contacting Bungie.');
assert.match(worker,/async function verifySessionCharacter[\s\S]*?VERIFIED_CHARACTER_TTL_MS[\s\S]*?components", "200"[\s\S]*?verifiedCharacterIds\.includes\(characterId\)/,'Guardian binding must be refreshed from the authenticated membership rather than trusted from the request.');

for(const [kind,path] of [
  ['equip-items','/Destiny2/Actions/Items/EquipItems/'],
  ['transfer-item','/Destiny2/Actions/Items/TransferItem/'],
  ['pull-from-postmaster','/Destiny2/Actions/Items/PullFromPostmaster/'],
  ['socket-plug-free','/Destiny2/Actions/Items/InsertSocketPlugFree/'],
  ['loadout-equip','/Destiny2/Actions/Loadouts/EquipLoadout/'],
  ['loadout-snapshot','/Destiny2/Actions/Loadouts/SnapshotLoadout/'],
  ['loadout-identifiers','/Destiny2/Actions/Loadouts/UpdateLoadoutIdentifiers/'],
  ['loadout-clear','/Destiny2/Actions/Loadouts/ClearLoadout/']
])assert.ok(worker.includes(`"${kind}"`)&&worker.includes(`"${path}"`),`${kind} must map to its one allow-listed Bungie operation.`);

assert.match(worker,/itemIds\.length > 12[\s\S]*?itemIds\.length !== \(body\.itemIds as unknown\[\]\)\.length/,'Equip requests must reject oversized, duplicate or malformed item lists.');
assert.match(worker,/stackSize !== 1[\s\S]*?typeof body\.transferToVault !== "boolean"/,'Transfer requests must remain exact single-item moves.');
assert.match(worker,/kind === "pull-from-postmaster"[\s\S]*?stackSize < 1 \|\| stackSize > 9_999[\s\S]*?PullFromPostmaster/,'Postmaster requests must remain exact, bounded, allow-listed mutations.');
assert.match(worker,/socketIndex < 0 \|\| socketIndex > 99[\s\S]*?!\[0, 1\]\.includes\(socketArrayType\)/,'Socket requests must constrain index and Bungie socket-array type.');
assert.match(worker,/loadoutIndex < 0 \|\| loadoutIndex > 19/,'Bungie loadout actions must remain inside slots 1–20.');
assert.match(worker,/const upstream = await fetch\(`\$\{BUNGIE_PLATFORM\}\$\{action\.path\}`[\s\S]*?JSON\.stringify\(action\.body\)/,'Only the validated allow-listed payload may be forwarded upstream.');
assert.doesNotMatch(worker,/console\.(?:log|warn|error)\([^\n]*(?:accessToken|refreshToken|csrfToken|requestBody|action\.body)/,'Mutation logging must not expose credentials, CSRF tokens or action bodies.');

assert.match(web,/Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token"/,'CORS preflight must allow the CSRF header used by authenticated action calls.');
assert.match(web,/Access-Control-Allow-Credentials": "true"/,'CORS preflight must preserve the authenticated HttpOnly session cookie.');

console.log('LIVE_ACTION_WORKER_ALLOWLIST=PASS');
console.log('LIVE_ACTION_WORKER_CSRF_BINDING=PASS');
console.log('LIVE_ACTION_WORKER_REQUEST_LIMITS=PASS');
