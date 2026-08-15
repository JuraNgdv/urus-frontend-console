import { apiFetch } from "./client";
import type { UserPermissionsResponse } from "../types";

// GET /tenants/{tenant_id}/me/permissions — added to the backend specifically
// so a signed-in user can resolve their own permission set without needing role.read.
export function getMyPermissions(tenantId: string, token: string) {
  return apiFetch<UserPermissionsResponse>(`/tenants/${tenantId}/me/permissions`, { token });
}
