import { apiFetch } from "./client";
import type { ProfileResponse, ProfileUpdateRequest } from "../types";

// GET /tenants/{tenant_id}/me — the signed-in admin's own profile.
export function getMyProfile(tenantId: string, token: string) {
  return apiFetch<ProfileResponse>(`/tenants/${tenantId}/me`, { token });
}

export function updateMyProfile(tenantId: string, body: ProfileUpdateRequest, token: string) {
  return apiFetch<ProfileResponse>(`/tenants/${tenantId}/me`, { method: "PATCH", body, token });
}
