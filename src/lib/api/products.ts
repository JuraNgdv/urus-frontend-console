import { apiFetch } from "./client";
import type {
  ProductBulkCreateRequest,
  ProductBulkResult,
  ProductResponse,
  ProductSortBy,
  ProductStatus,
  ProductUpdateRequest,
} from "../types";

// Permission: products.add. Each element is validated and processed independently —
// a bad location_id/category_id in one item doesn't stop the rest (see ProductBulkResult).
export function bulkCreateProducts(tenantId: string, req: ProductBulkCreateRequest, token: string) {
  return apiFetch<ProductBulkResult>(`/tenants/${tenantId}/products`, { method: "POST", body: req, token });
}

// bought_by/added_by were replaced by an event-based filter set:
//  - actor_id alone           → any action by that user
//  - actor_id + event_status  → a specific action by that user
//  - actor_id + recipient_id (+ optional event_status) → one event where
//    both hold at once (e.g. "X gifted to Y")
//  - recipient_id alone       → who ended up with the product, any way
// All of these AND with `status` (the product's current state), which is a
// separate, independent filter.
export interface ProductListParams {
  locationId?: string;
  categoryId?: string;
  status?: ProductStatus;
  actorId?: string;
  eventStatus?: ProductStatus;
  recipientId?: string;
  sortBy?: ProductSortBy;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Permission: products.manage. Full tenant-wide list with filters — the admin view.
export function listProducts(tenantId: string, params: ProductListParams, token: string) {
  return apiFetch<ProductResponse[]>(`/tenants/${tenantId}/products`, {
    token,
    query: {
      location_id: params.locationId || undefined,
      category_id: params.categoryId || undefined,
      status: params.status || undefined,
      actor_id: params.actorId || undefined,
      event_status: params.eventStatus || undefined,
      recipient_id: params.recipientId || undefined,
      sort_by: params.sortBy,
      sort_order: params.sortOrder,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

// Permission: products.manage.
export function getProduct(tenantId: string, productId: string, token: string) {
  return apiFetch<ProductResponse>(`/tenants/${tenantId}/products/${productId}`, { token });
}

// Permission: products.update.any (any product) or products.update.my (only
// products you added — the backend still enforces ownership even though
// added_by is no longer in the response). discount_value/discount_type
// additionally require products.set_discount.
export function updateProduct(tenantId: string, productId: string, req: ProductUpdateRequest, token: string) {
  return apiFetch<ProductResponse>(`/tenants/${tenantId}/products/${productId}`, {
    method: "PATCH",
    body: req,
    token,
  });
}

// Permission: products.view_added. Newest first.
export function listMyAddedProducts(tenantId: string, limit: number, offset: number, token: string) {
  return apiFetch<ProductResponse[]>(`/tenants/${tenantId}/products/my/added`, {
    token,
    query: { limit, offset },
  });
}

// Permission: products.view_bought. Newest first.
export function listMyBoughtProducts(tenantId: string, limit: number, offset: number, token: string) {
  return apiFetch<ProductResponse[]>(`/tenants/${tenantId}/products/my/bought`, {
    token,
    query: { limit, offset },
  });
}
