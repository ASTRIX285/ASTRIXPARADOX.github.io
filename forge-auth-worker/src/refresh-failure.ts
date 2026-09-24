// Bungie Exceptions.PlatformErrorCodes, https://bungie-net.github.io/multi/schema_Exceptions-PlatformErrorCodes.html
// DIM authenticated-fetch.ts handleRefreshTokenError (af544ef6f0ee361136afcdf896f1da8ee8e2b692).
// OAuth invalid_grant: RFC 6749 section 5.2, referenced by Bungie's OAuth documentation.
// AccessTokenHasExpired / RefreshTokenNotYetValid are not proof that the grant was revoked.
const invalidGrants: Record<string, number> = {
  AuthorizationCodeInvalid: 2106,
  ProvidedTokenNotValidRefreshToken: 2117,
  RefreshTokenExpired: 2118,
  AuthorizationRecordInvalid: 2119,
  TokenPreviouslyRevoked: 2120,
  AuthorizationCodeStale: 2122,
  AuthorizationRecordExpired: 2123,
  AuthorizationRecordRevoked: 2124
};

export function refreshFailure(status: number, body: unknown): { revoke: boolean; code: string } {
  if (!body || typeof body !== "object") return { revoke: false, code: "unparseable_error" };
  const value = body as Record<string, unknown>;
  const named = Object.keys(invalidGrants).find(name => value.ErrorStatus === name || value.error_description === name || value.ErrorCode === invalidGrants[name]);
  const code = value.error === "invalid_grant" ? "invalid_grant" : named ||
    (typeof value.ErrorCode === "number" ? String(value.ErrorCode) : value.error_description === "SystemDisabled" ? "SystemDisabled" : "unclassified_error");
  // A service failure or rate limit never revokes, even with a contradictory body.
  return { revoke: status >= 400 && status < 500 && status !== 429 && (code === "invalid_grant" || Boolean(named)), code };
}
