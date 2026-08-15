import { apiFetch } from "./client";
import type { ConfigDefinitionResponse, ConfigEntryResponse } from "../types";

// Both proxied server-side through src/app/api/tenants/[tenantId]/... Route
// Handlers, which hold the bff_token and check configs.manage themselves —
// the backend's TMA config endpoints only verify the tenant exists, so this
// BFF layer is the actual enforcement point, not just a client-side nicety.
export function listConfigDefinitions(tenantId: string, token: string) {
  return apiFetch<ConfigDefinitionResponse[]>(`/tenants/${tenantId}/config-definitions`, { token });
}

export function listTenantConfigs(tenantId: string, token: string) {
  return apiFetch<ConfigEntryResponse[]>(`/tenants/${tenantId}/configs`, { token });
}

// Goes straight through the plain /api rewrite to the backend, not proxied —
// PUT uses the caller's own JWT; configs.manage is enforced by this screen's
// visibility, same convention as every other permission-gated area.
export function updateTenantConfig(tenantId: string, key: string, value: unknown, token: string) {
  return apiFetch<ConfigEntryResponse>(`/tenants/${tenantId}/configs/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { value },
    token,
  });
}

// Also unproxied, like the PUT above — a single known key isn't the
// is_visible-enumeration risk the bulk list is, so this isn't known to need
// the bff_token the way listTenantConfigs does. Used for read-only display
// formatting (e.g. balance_precision) by screens that don't hold configs.manage.
export function getTenantConfig(tenantId: string, key: string, token: string) {
  return apiFetch<ConfigEntryResponse>(`/tenants/${tenantId}/configs/${encodeURIComponent(key)}`, { token });
}
