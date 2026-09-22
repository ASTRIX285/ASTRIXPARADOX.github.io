export type SnapshotFailureReason = "timeout" | "fetch_failed" | "body_read_failed" | "invalid_json" | "http_error" | "bungie_error" | "missing_response" | "snapshot_internal_error";
export type SnapshotDiagnostics = {
  reason: SnapshotFailureReason;
  upstreamStatus: number | null;
  errorCode: number | null;
  errorStatus: string | null;
};

export class ProfileSnapshotError extends Error {
  readonly diagnostics: SnapshotDiagnostics;
  constructor(diagnostics: SnapshotDiagnostics) {
    super("snapshot_upstream_failed");
    this.name = "ProfileSnapshotError";
    this.diagnostics = diagnostics;
  }
}

export function snapshotDiagnostics(error: unknown): SnapshotDiagnostics {
  return error instanceof ProfileSnapshotError ? error.diagnostics : {
    reason: "snapshot_internal_error", upstreamStatus: null, errorCode: null, errorStatus: null
  };
}

// Preserve only diagnostic fields, never upstream bodies, tokens or request URLs.
export async function fetchProfileSnapshot(url: URL, headers: HeadersInit, fetchImpl: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(30_000)): Promise<string> {
  let upstreamStatus: number | null = null;
  let phase: SnapshotFailureReason = "fetch_failed";
  try {
    const response = await fetchImpl(url, { headers, signal });
    upstreamStatus = response.status;
    phase = "body_read_failed";
    const body = await response.text();
    phase = response.ok ? "invalid_json" : "http_error";
    const payload = JSON.parse(body);
    const diagnostics: SnapshotDiagnostics = {
      reason: !response.ok ? "http_error" : payload?.ErrorCode !== 1 ? "bungie_error" : "missing_response",
      upstreamStatus,
      errorCode: typeof payload?.ErrorCode === "number" && Number.isFinite(payload.ErrorCode) ? payload.ErrorCode : null,
      errorStatus: typeof payload?.ErrorStatus === "string" ? payload.ErrorStatus.slice(0, 256) : null
    };
    if (!response.ok || !payload?.Response || payload.ErrorCode !== 1) throw new ProfileSnapshotError(diagnostics);
    return body;
  } catch (error) {
    const failure = error instanceof ProfileSnapshotError ? error : new ProfileSnapshotError({
      reason: signal.aborted && signal.reason?.name === "TimeoutError" ? "timeout" : phase,
      upstreamStatus, errorCode: null, errorStatus: null
    });
    console.error("profile_snapshot_upstream_failed", failure.diagnostics);
    throw failure;
  }
}

export function profileFailureDetails(status: number, payload: { ErrorCode?: number; ErrorStatus?: string; diagnostics?: SnapshotDiagnostics } | null) {
  return {
    status,
    errorCode: payload?.diagnostics?.errorCode ?? payload?.ErrorCode ?? null,
    errorStatus: payload?.diagnostics?.errorStatus ?? payload?.ErrorStatus ?? null,
    ...(payload?.diagnostics ? { reason: payload.diagnostics.reason, upstreamStatus: payload.diagnostics.upstreamStatus } : {})
  };
}
