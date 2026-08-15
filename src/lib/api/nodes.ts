import { apiFetch } from "./client";
import type {
  NodeBulkCreateItem,
  NodeBulkResult,
  NodeCreateRequest,
  NodeReorderItem,
  NodeResponse,
  NodeType,
  NodeUpdateRequest,
} from "../types";

// Requires locations.manage on every endpoint in this module, per the contract.

export function listNodeChildren(tenantId: string, nodeType: NodeType, parentId: string | undefined, token: string) {
  return apiFetch<NodeResponse[]>(`/tenants/${tenantId}/nodes/${nodeType}`, 
    { token, query: { parent_id: parentId } });
}

// Singular "node" in the path — matches the doc, distinct from the plural list/create routes.
export function getNode(tenantId: string, nodeId: string, token: string) {
  return apiFetch<NodeResponse>(`/tenants/${tenantId}/node/${nodeId}`, 
    { token });
}

// Type-agnostic children lookup — handy when only a UUID is known.
export function getNodeChildren(tenantId: string, nodeId: string, token: string) {
  return apiFetch<NodeResponse[]>(`/tenants/${tenantId}/nodes/${nodeId}/children`, 
    { token });
}

export function getNodePath(tenantId: string, nodeId: string, token: string) {
  return apiFetch<NodeResponse[]>(`/tenants/${tenantId}/nodes/${nodeId}/path`, 
    { token });
}

export function createNode(tenantId: string, nodeType: NodeType, req: Omit<NodeCreateRequest, "node_type">, token: string) {
  return apiFetch<NodeResponse>(`/tenants/${tenantId}/nodes/${nodeType}`, {
    method: "POST", body: { ...req, node_type: nodeType }, token,});
}

export function updateNode(tenantId: string, nodeId: string, req: NodeUpdateRequest, token: string) {
  return apiFetch<NodeResponse>(`/tenants/${tenantId}/nodes/${nodeId}`, 
    { method: "PATCH", body: req, token });
}

export function reorderNodes(tenantId: string, items: NodeReorderItem[], token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/nodes/reorder`, 
    { method: "PUT", body: { items }, token });
}

export function deleteNode(tenantId: string, nodeId: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/nodes/${nodeId}`,
    { method: "DELETE", token });
}

// Server generates name_key/desc_key and writes the translations itself —
// see NodeBulkCreateItem. Building a tree needs one call per depth level,
// sequenced by the caller (parents must exist before their children's
// parent_id can be sent).
export function bulkCreateNodes(tenantId: string, nodeType: NodeType, items: NodeBulkCreateItem[], token: string) {
  return apiFetch<NodeBulkResult>(`/tenants/${tenantId}/nodes/${nodeType}/bulk`, {
    method: "POST",
    body: { items },
    token,
  });
}
