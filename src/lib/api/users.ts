import { apiFetch } from "./client";
import type {
  BalanceAdjustRequest,
  BalanceType,
  PaginatedTransactions,
  PaginatedUsers,
  TransactionResponse,
  UserProfileEnriched,
} from "../types";

export type UserSortBy =
  | "created_at"
  | "username"
  | "balance"
  | "bonus_balance"
  | "purchases_count"
  | "wins_count"
  | "total_spent"
  | "sales_count"
  | "products_added_count";
export type TransactionSortBy = "created_at" | "amount";

export interface ListUsersParams {
  search?: string;
  sortBy?: UserSortBy;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Permission: users.read.
export function listUsers(tenantId: string, params: ListUsersParams, token: string) {
  return apiFetch<PaginatedUsers>(`/tenants/${tenantId}/users`, {
    token,
    query: {
      search: params.search || undefined,
      sort_by: params.sortBy,
      sort_dir: params.sortDir,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

// Permission: users.read. Richer than a list item — see UserProfileEnriched.
export function getUser(tenantId: string, userId: string, token: string) {
  return apiFetch<UserProfileEnriched>(`/tenants/${tenantId}/users/${userId}`, { token });
}

export interface BalanceHistoryParams {
  balanceType?: BalanceType;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: TransactionSortBy;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Permission: dynamic — balance.main.read and/or balance.bonus.read depending
// on balanceType (see the doc); if balanceType is omitted and only one of the
// two is held, the backend auto-restricts to that type.
export function getUserBalanceHistory(tenantId: string, userId: string, params: BalanceHistoryParams, token: string) {
  return apiFetch<PaginatedTransactions>(`/tenants/${tenantId}/users/${userId}/balance/history`, {
    token,
    query: {
      balance_type: params.balanceType,
      date_from: params.dateFrom || undefined,
      date_to: params.dateTo || undefined,
      sort_by: params.sortBy,
      sort_dir: params.sortDir,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

// Permission: balance.main.manage (balance_type "main") or balance.bonus.manage
// (balance_type "bonus"). Positive amount credits, negative debits; a debit
// that would take the balance below zero is rejected with 422.
export function adjustUserBalance(tenantId: string, userId: string, req: BalanceAdjustRequest, token: string) {
  return apiFetch<TransactionResponse>(`/tenants/${tenantId}/users/${userId}/balance`, {
    method: "POST",
    body: req,
    token,
  });
}
