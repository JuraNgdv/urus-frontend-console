import { apiFetch } from "./client";
import type {
  PermissionCreateRequest,
  PermissionResponse,
  PermissionUpdateRequest,
  RoleCreateRequest,
  RoleResponse,
  RoleUpdateRequest,
  SetRolePermissionsRequest,
} from "../types";

// System + tenant custom permissions — any authenticated user, no specific permission required.
export function listPermissions(tenantId: string, token: string) {
  return apiFetch<PermissionResponse[]>(`/tenants/${tenantId}/permissions`, { token });
}

export function createPermission(tenantId: string, req: PermissionCreateRequest, token: string) {
  return apiFetch<PermissionResponse>(`/tenants/${tenantId}/permissions`, { method: "POST", body: req, token });
}

export function updatePermission(tenantId: string, permissionId: string, req: PermissionUpdateRequest, token: string) {
  return apiFetch<PermissionResponse>(`/tenants/${tenantId}/permissions/${permissionId}`, {
    method: "PATCH",
    body: req,
    token,
  });
}

export function deletePermission(tenantId: string, permissionId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/permissions/${permissionId}`, { method: "DELETE", token });
}

// Requires role.read.
export function listRoles(tenantId: string, token: string) {
  return apiFetch<RoleResponse[]>(`/tenants/${tenantId}/roles`, { token });
}

// Requires role.assign OR role.revoke — filtered by delegation, unlike the
// unrestricted listRoles above. Use this (not listRoles) to populate an
// assign/revoke UI, since a non-TMA caller may not hold role.read at all.
export function listManageableRoles(tenantId: string, token: string) {
  return apiFetch<RoleResponse[]>(`/tenants/${tenantId}/roles/manageable`, { token });
}

export function createRole(tenantId: string, req: RoleCreateRequest, token: string) {
  return apiFetch<RoleResponse>(`/tenants/${tenantId}/roles`, { method: "POST", body: req, token });
}

export function updateRole(tenantId: string, roleId: string, req: RoleUpdateRequest, token: string) {
  return apiFetch<RoleResponse>(`/tenants/${tenantId}/roles/${roleId}`, { method: "PATCH", body: req, token });
}

export function deleteRole(tenantId: string, roleId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/roles/${roleId}`, { method: "DELETE", token });
}

// A role's current permissions aren't embedded in RoleResponse — fetch separately.
export function getRolePermissions(tenantId: string, roleId: string, token: string) {
  return apiFetch<PermissionResponse[]>(`/tenants/${tenantId}/roles/${roleId}/permissions`, { token });
}

// Full replace, per the contract — always send the complete permission id set for the role.
// Returns the resulting permission set.
export function setRolePermissions(tenantId: string, roleId: string, req: SetRolePermissionsRequest, token: string) {
  return apiFetch<PermissionResponse[]>(`/tenants/${tenantId}/roles/${roleId}/permissions`, {
    method: "PUT",
    body: req,
    token,
  });
}

// `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` per the contract — at least two dot-separated segments, lowercase only.
export const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

// Requires role.assign; subject to delegation.
export function assignRoleToUser(tenantId: string, userId: string, roleId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/users/${userId}/roles`, {
    method: "POST",
    body: { role_id: roleId },
    token,
  });
}

// Requires role.revoke; subject to delegation.
export function revokeRoleFromUser(tenantId: string, userId: string, roleId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/users/${userId}/roles/${roleId}`, { method: "DELETE", token });
}
