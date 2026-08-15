import { apiFetch } from "./client";
import type {
  ButtonCreateRequest,
  ButtonFull,
  ButtonUpdateRequest,
  KeyboardFullResponse,
  KeyboardResponse,
  RowCreateRequest,
  RowFull,
} from "../types";

export function listKeyboards(tenantId: string, token: string) {
  return apiFetch<KeyboardResponse[]>(`/tenants/${tenantId}/keyboards`, { token });
}

export function getKeyboardFull(tenantId: string, key: string, token: string) {
  return apiFetch<KeyboardFullResponse>(`/tenants/${tenantId}/keyboards/${encodeURIComponent(key)}/full`, { token });
}

export function createRow(tenantId: string, kbKey: string, req: RowCreateRequest, token: string) {
  return apiFetch<RowFull>(`/tenants/${tenantId}/keyboards/${encodeURIComponent(kbKey)}/rows`, {
    method: "POST",
    body: req,
    token,
  });
}

export function deleteRow(tenantId: string, kbKey: string, rowId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/keyboards/${encodeURIComponent(kbKey)}/rows/${rowId}`, {
    method: "DELETE",
    token,
  });
}

export function createButton(
  tenantId: string,
  kbKey: string,
  rowId: string,
  req: ButtonCreateRequest,
  token: string,
) {
  return apiFetch<ButtonFull>(
    `/tenants/${tenantId}/keyboards/${encodeURIComponent(kbKey)}/rows/${rowId}/buttons`,
    { method: "POST", body: req, token },
  );
}

export function updateButton(
  tenantId: string,
  kbKey: string,
  rowId: string,
  buttonId: string,
  req: ButtonUpdateRequest,
  token: string,
) {
  return apiFetch<ButtonFull>(
    `/tenants/${tenantId}/keyboards/${encodeURIComponent(kbKey)}/rows/${rowId}/buttons/${buttonId}`,
    { method: "PATCH", body: req, token },
  );
}

export function deleteButton(tenantId: string, kbKey: string, rowId: string, buttonId: string, token: string) {
  return apiFetch<void>(
    `/tenants/${tenantId}/keyboards/${encodeURIComponent(kbKey)}/rows/${rowId}/buttons/${buttonId}`,
    { method: "DELETE", token },
  );
}
