import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { ProfileSnapshotCache } from "../src/profile-snapshot-cache.ts";
import { fetchProfileSnapshot, snapshotDiagnostics, profileFailureDetails, type SnapshotDiagnostics } from "../src/profile-snapshot-error.ts";

const url = new URL("https://www.bungie.net/Platform/Destiny2/3/Profile/123/");
const headers = { Authorization: "Bearer private-test-token", "X-API-Key": "private-test-key" };

test("actual AuthRecord snapshot handler returns diagnostics on a miss and does not cache the error", async t => {
  t.mock.method(console, "error", () => {});
  const source = readFileSync(new URL("../src/auth-record.ts", import.meta.url), "utf8");
  const runtime = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, "")).replace(/export /g, "");
  class StubDurableObject { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } }
  const AuthRecord = new Function("DurableObject", "ProfileSnapshotCache", "PreparedPageCache", "fetchProfileSnapshot", "snapshotDiagnostics", `${runtime}; return AuthRecord;`)(StubDurableObject, ProfileSnapshotCache, class {}, fetchProfileSnapshot, snapshotDiagnostics);
  const rows = new Map<string, unknown>([["record", { kind: "session", absoluteExpiresAt: Date.now() + 60000, accessExpiresAt: Date.now() + 60000, accessToken: "private-test-token", activeDestinyMembership: { membershipId: "123", membershipType: 3 } }]]);
  const writes: Promise<void>[] = [];
  const storage = { get: async (key: string) => rows.get(key), put: async (key: string, value: unknown) => { rows.set(key, value); }, delete: async (key: string) => rows.delete(key) };
  const record = new AuthRecord({ storage, waitUntil: (task: Promise<void>) => writes.push(task) }, { BUNGIE_API_KEY: "private-test-key" });
  const upstream = t.mock.method(globalThis, "fetch", async () => Response.json({ ErrorCode: 5, ErrorStatus: "SystemDisabled" }));
  const request = () => new Request("https://internal/profile-snapshot", { method: "POST", body: JSON.stringify({ components: [100, 200] }) });
  const failed = await record.fetch(request());
  assert.equal(failed.status, 502);
  const payload = await failed.json();
  assert.equal(payload.error, "profile_snapshot_unavailable");
  assert.deepEqual(profileFailureDetails(failed.status, payload), { status: 502, reason: "bungie_error", upstreamStatus: 200, errorCode: 5, errorStatus: "SystemDisabled" });
  assert.equal(rows.size, 1, "No failed profile response may enter snapshot storage.");
  upstream.mock.mockImplementation(async () => Response.json({ ErrorCode: 1, Response: { characters: { data: {} } } }));
  const success = await record.fetch(request());
  assert.equal(success.status, 200);
  assert.equal(upstream.mock.callCount(), 2);
  await Promise.all(writes);
});

for (const [status, payload, reason] of [
  [503, { ErrorCode: 5, ErrorStatus: "SystemDisabled" }, "http_error"],
  [200, { ErrorCode: 5, ErrorStatus: "SystemDisabled" }, "bungie_error"],
  [200, { ErrorCode: 31, ErrorStatus: "ThrottleLimitExceeded" }, "bungie_error"],
  [200, { ErrorCode: 1, ErrorStatus: "Success" }, "missing_response"],
  [502, {}, "http_error"]
] as const) {
  test(`preserves upstream ${status} ${JSON.stringify(payload)} through the DO response boundary`, async t => {
    const log = t.mock.method(console, "error", () => {});
    let captured: unknown;
    try { await fetchProfileSnapshot(url, headers, async () => Response.json(payload, { status })); }
    catch (error) { captured = error; }
    assert.ok(captured instanceof Error);
    const diagnostics = snapshotDiagnostics(captured);
    assert.deepEqual(diagnostics, { reason, upstreamStatus: status, errorCode: "ErrorCode" in payload ? payload.ErrorCode : null, errorStatus: "ErrorStatus" in payload ? payload.ErrorStatus : null });
    const serialized = await Response.json({ error: "profile_snapshot_unavailable", diagnostics }, { status: 502 }).json() as { diagnostics: SnapshotDiagnostics };
    assert.deepEqual(profileFailureDetails(502, serialized), { status: 502, ...diagnostics });
    assert.deepEqual(log.mock.calls[0].arguments, ["profile_snapshot_upstream_failed", diagnostics]);
    assert.ok(!JSON.stringify(log.mock.calls).includes("private-test"));
  });
}

test("distinguishes rejected fetch from a real deadline abort", async t => {
  t.mock.method(console, "error", () => {});
  await assert.rejects(fetchProfileSnapshot(url, headers, async () => { throw new TypeError("private-test-token"); }), error => {
    assert.deepEqual(snapshotDiagnostics(error), { reason: "fetch_failed", upstreamStatus: null, errorCode: null, errorStatus: null });
    return true;
  });
  const controller = new AbortController();
  controller.abort(new DOMException("deadline", "TimeoutError"));
  await assert.rejects(fetchProfileSnapshot(url, headers, async (_url, init) => { throw init?.signal?.reason; }, controller.signal), error => {
    assert.equal(snapshotDiagnostics(error).reason, "timeout");
    return true;
  });
});

test("keeps HTTP status for invalid JSON and body failures without exposing bodies", async t => {
  t.mock.method(console, "error", () => {});
  for (const status of [200, 502]) {
    await assert.rejects(fetchProfileSnapshot(url, headers, async () => new Response("private upstream HTML", { status })), error => {
      assert.deepEqual(snapshotDiagnostics(error), { reason: status === 200 ? "invalid_json" : "http_error", upstreamStatus: status, errorCode: null, errorStatus: null });
      return true;
    });
  }
  const broken = new Response(new ReadableStream({ start(controller) { controller.error(new Error("body failed")); } }), { status: 200 });
  await assert.rejects(fetchProfileSnapshot(url, headers, async () => broken), error => {
    assert.equal(snapshotDiagnostics(error).reason, "body_read_failed");
    assert.equal(snapshotDiagnostics(error).upstreamStatus, 200);
    return true;
  });
});

test("successful payload and request retain the existing contract", async () => {
  const body = JSON.stringify({ ErrorCode: 1, Response: { characters: { data: {} } } });
  assert.equal(await fetchProfileSnapshot(url, headers, async (input, init) => {
    assert.equal(input, url);
    assert.deepEqual(init?.headers, headers);
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(body);
  }), body);
});

test("internal errors and the direct live-profile path remain distinct", () => {
  assert.equal(snapshotDiagnostics(new Error("storage failure")).reason, "snapshot_internal_error");
  assert.deepEqual(profileFailureDetails(401, { ErrorCode: 10, ErrorStatus: "AuthenticationInvalid" }), { status: 401, errorCode: 10, errorStatus: "AuthenticationInvalid" });
  assert.deepEqual(profileFailureDetails(502, null), { status: 502, errorCode: null, errorStatus: null });
});
