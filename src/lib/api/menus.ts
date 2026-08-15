import { apiFetch } from "./client";
import type { BlockCreateRequest, BlockFull, BlockUpdateRequest, MenuFullResponse, MenuResponse } from "../types";

export function listMenus(tenantId: string, token: string) {
  return apiFetch<MenuResponse[]>(`/tenants/${tenantId}/menus`, { token });
}

export function getMenuFull(tenantId: string, key: string, token: string) {
  return apiFetch<MenuFullResponse>(`/tenants/${tenantId}/menus/${encodeURIComponent(key)}/full`, { token });
}

export function createBlock(tenantId: string, menuKey: string, req: BlockCreateRequest, token: string) {
  return apiFetch<BlockFull>(`/tenants/${tenantId}/menus/${encodeURIComponent(menuKey)}/blocks`, {
    method: "POST",
    body: req,
    token,
  });
}

export function updateBlock(
  tenantId: string,
  menuKey: string,
  blockId: string,
  req: BlockUpdateRequest,
  token: string,
) {
  return apiFetch<BlockFull>(`/tenants/${tenantId}/menus/${encodeURIComponent(menuKey)}/blocks/${blockId}`, {
    method: "PATCH",
    body: req,
    token,
  });
}

export function deleteBlock(tenantId: string, menuKey: string, blockId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/menus/${encodeURIComponent(menuKey)}/blocks/${blockId}`, {
    method: "DELETE",
    token,
  });
}

export function moveBlock(tenantId: string, menuKey: string, blockId: string, targetIndex: number, token: string) {
  return apiFetch<BlockFull>(
    `/tenants/${tenantId}/menus/${encodeURIComponent(menuKey)}/blocks/${blockId}/move`,
    { method: "POST", body: { target_index: targetIndex }, token },
  );
}
