import { DurableObject } from "cloudflare:workers";
import { ProfileSnapshotCache } from "./profile-snapshot-cache";

const BUNGIE_TOKEN = "https://www.bungie.net/platform/app/oauth/token/";
const TOKEN_RENEWAL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RENEWAL_LEEWAY_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ALARM_DELAY_MS = 5 * 60 * 1000;
const OAUTH_RECORD_TTL_MS = 15 * 60 * 1000;
const RECOVERY_RECORD_TTL_MS = 5 * 60 * 1000;

export type Membership = { membershipType: number; membershipId: string; displayName?: string };
export type OAuthTransaction = { kind: "oauth-transaction"; state: string; createdAt: number; returnUrl: string; used: boolean; accessIdentityKey?: string };
export type RecoveryTransaction = { kind: "recovery-transaction"; ticket: string; createdAt: number; returnUrl: string; sessionId: string; accessIdentityKey: string; used: boolean };
export type AccessBindingRecord = { kind: "access-binding"; sessionId: string; createdAt: number; expiresAt: number };
export type SessionRecord = { kind: "session"; createdAt: number; lastUsedAt: number; absoluteExpiresAt: number; accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number | null; bungieMembershipId: string | null; destinyMemberships: Membership[]; primaryMembershipId: string | null; activeDestinyMembership: Membership | null; csrfToken: string; accessIdentityKey?: string; verifiedCharacterIds?: string[]; verifiedCharactersAt?: number };
export type AuthRecordValue = OAuthTransaction | RecoveryTransaction | AccessBindingRecord | SessionRecord;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
};
type PreparedReadRequest = {
  kind: "activity-history" | "historical-stats" | "pgcr";
  characterId?: string;
  count?: number;
  page?: number;
  instanceId?: string;
};

function nextRenewalAt(session: SessionRecord, now = Date.now()): number | null {
  if (!session.refreshToken || session.absoluteExpiresAt <= now) return null;
  if (session.refreshExpiresAt !== null && session.refreshExpiresAt <= now) return null;
  const beforeRefreshExpiry = session.refreshExpiresAt === null
    ? now + TOKEN_RENEWAL_INTERVAL_MS
    : session.refreshExpiresAt - TOKEN_RENEWAL_LEEWAY_MS;
  return Math.max(
    now + MIN_ALARM_DELAY_MS,
    Math.min(now + TOKEN_RENEWAL_INTERVAL_MS, beforeRefreshExpiry, session.absoluteExpiresAt)
  );
}

export class AuthRecord extends DurableObject<Env> {
  private snapshots = new ProfileSnapshotCache(this.ctx.storage);
  private deferSnapshotWrite(task: Promise<void>): void {
    this.ctx.waitUntil(task.catch(error => console.warn("prepared_account_cache_write_failed", { error: String(error) })));
  }

  private async preparedRead(record: SessionRecord, input: PreparedReadRequest): Promise<Response> {
    const membership = record.activeDestinyMembership;
    if (!membership) return new Response(null, { status: 401 });
    let url: URL;
    let key: string;
    if (input.kind === "activity-history") {
      const characterId = String(input.characterId || "");
      const count = Number(input.count ?? 25);
      const page = Number(input.page ?? 0);
      if (!/^\d+$/.test(characterId) || !Number.isInteger(count) || count < 1 || count > 25 || !Number.isInteger(page) || page < 0) return new Response(null, { status: 400 });
      url = new URL(`https://www.bungie.net/Platform/Destiny2/${membership.membershipType}/Account/${encodeURIComponent(membership.membershipId)}/Character/${encodeURIComponent(characterId)}/Stats/Activities/`);
      url.searchParams.set("count", String(count));
      url.searchParams.set("page", String(page));
      key = `activity:${characterId}:${count}:${page}`;
    } else if (input.kind === "historical-stats") {
      url = new URL(`https://www.bungie.net/Platform/Destiny2/${membership.membershipType}/Account/${encodeURIComponent(membership.membershipId)}/Stats/`);
      url.searchParams.set("groups", "1");
      key = "historical:1";
    } else {
      const instanceId = String(input.instanceId || "");
      if (!/^\d+$/.test(instanceId)) return new Response(null, { status: 400 });
      url = new URL(`https://www.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${encodeURIComponent(instanceId)}/`);
      key = `pgcr:${instanceId}`;
    }
    try {
      const snapshot = await this.snapshots.read(key, async () => {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${record.accessToken}`, "X-API-Key": this.env.BUNGIE_API_KEY },
          signal: AbortSignal.timeout(30_000)
        });
        const body = await response.text();
        const payload = JSON.parse(body);
        if (!response.ok || !payload?.Response || payload.ErrorCode !== 1) throw new Error("prepared_read_upstream_failed");
        return body;
      }, Date.now(), task => this.deferSnapshotWrite(task));
      return new Response(snapshot.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Forge-Account-Source": snapshot.source, "X-Forge-Account-Fetched-At": String(snapshot.fetchedAt) } });
    } catch {
      return Response.json({ error: "prepared_account_data_unavailable" }, { status: 502 });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    // Internal Durable Object route, never exposed by the public Worker router.
    if (request.method === "POST" && path === "/profile-snapshot") {
      const record = await this.ctx.storage.get<AuthRecordValue>("record");
      if (!record || record.kind !== "session" || record.absoluteExpiresAt <= Date.now() || record.accessExpiresAt <= Date.now() || !record.activeDestinyMembership) return new Response(null, { status: 401 });
      const { components } = await request.json<{ components: number[] }>();
      if (!Array.isArray(components) || components.length > 32 || !components.every(Number.isInteger)) return new Response(null, { status: 400 });
      const membership = record.activeDestinyMembership;
      const key = `${membership.membershipType}:${membership.membershipId}:${[...components].sort((a,b)=>a-b).join(",")}`;
      try {
        const snapshot = await this.snapshots.read(key, async () => {
          const url = new URL(`https://www.bungie.net/Platform/Destiny2/${membership.membershipType}/Profile/${encodeURIComponent(membership.membershipId)}/`);
          url.searchParams.set("components", components.join(","));
          const response = await fetch(url, { headers: { Authorization: `Bearer ${record.accessToken}`, "X-API-Key": this.env.BUNGIE_API_KEY }, signal: AbortSignal.timeout(30_000) });
          const body = await response.text();
          const payload = JSON.parse(body);
          if (!response.ok || !payload?.Response || payload.ErrorCode !== 1) throw new Error("snapshot_upstream_failed");
          return body;
        }, Date.now(), task => this.deferSnapshotWrite(task));
        return new Response(snapshot.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Forge-Profile-Source": snapshot.source, "X-Forge-Profile-Fetched-At": String(snapshot.fetchedAt) } });
      } catch { return Response.json({ error: "profile_snapshot_unavailable" }, { status: 502 }); }
    }
    if (request.method === "POST" && path === "/prepared-read") {
      const record = await this.ctx.storage.get<AuthRecordValue>("record");
      if (!record || record.kind !== "session" || record.absoluteExpiresAt <= Date.now() || record.accessExpiresAt <= Date.now()) return new Response(null, { status: 401 });
      return this.preparedRead(record, await request.json<PreparedReadRequest>());
    }
    if (request.method === "PUT" && path === "/record") {
      const record = await request.json<AuthRecordValue>();
      await this.ctx.storage.put("record", record);
      if (record.kind === "session") {
        const renewalAt = nextRenewalAt(record);
        if (renewalAt !== null) await this.ctx.storage.setAlarm(renewalAt);
      } else if (record.kind === "access-binding") {
        await this.ctx.storage.setAlarm(Math.max(Date.now() + MIN_ALARM_DELAY_MS, record.expiresAt));
      } else {
        const ttl = record.kind === "oauth-transaction" ? OAUTH_RECORD_TTL_MS : RECOVERY_RECORD_TTL_MS;
        await this.ctx.storage.setAlarm(Math.max(Date.now() + MIN_ALARM_DELAY_MS, record.createdAt + ttl));
      }
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && path === "/record") {
      const record = await this.ctx.storage.get<AuthRecordValue>("record");
      return record ? Response.json(record, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 404 });
    }
    if (request.method === "POST" && path === "/take-oauth") {
      const record = await this.ctx.storage.get<AuthRecordValue>("record");
      if (!record || record.kind !== "oauth-transaction" || record.used) return new Response(null, { status: 404 });
      const used: OAuthTransaction = { ...record, used: true };
      await this.ctx.storage.put("record", used);
      return Response.json(used, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "POST" && path === "/take-recovery") {
      const record = await this.ctx.storage.get<AuthRecordValue>("record");
      if (!record || record.kind !== "recovery-transaction" || record.used) return new Response(null, { status: 404 });
      const used: RecoveryTransaction = { ...record, used: true };
      await this.ctx.storage.put("record", used);
      return Response.json(used, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "DELETE" && path === "/record") {
      await this.ctx.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }

  async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<AuthRecordValue>("record");
    const now = Date.now();
    if (!record || record.kind !== "session" || record.absoluteExpiresAt <= now) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (!record.refreshToken || (record.refreshExpiresAt !== null && record.refreshExpiresAt <= now)) {
      await this.ctx.storage.deleteAll();
      return;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: record.refreshToken,
      client_id: this.env.BUNGIE_CLIENT_ID,
      client_secret: this.env.BUNGIE_CLIENT_SECRET
    });
    const response = await fetch(BUNGIE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (response.status === 400 || response.status === 401) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (!response.ok) throw new Error(`bungie_token_alarm_refresh_failed:${response.status}`);

    const token = await response.json<TokenResponse>();
    if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
      throw new Error("bungie_token_alarm_refresh_invalid");
    }
    const refreshed: SessionRecord = {
      ...record,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || record.refreshToken,
      accessExpiresAt: now + token.expires_in * 1000,
      refreshExpiresAt: token.refresh_expires_in ? now + token.refresh_expires_in * 1000 : record.refreshExpiresAt
    };
    await this.ctx.storage.put("record", refreshed);
    const renewalAt = nextRenewalAt(refreshed, now);
    if (renewalAt !== null) await this.ctx.storage.setAlarm(renewalAt);
  }
}
