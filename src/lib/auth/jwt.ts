import type { JwtClaims } from "../types";

// Reads claims from the access_token client-side. No signature verification —
// the token is only ever sent back to the backend, which verifies it there.
// Confirmed payload shape: { sub, exp, tenant_id, tenant_slug, provider }.
export function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims): boolean {
  return claims.exp * 1000 <= Date.now();
}
