"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT, type SystemT, type SystemStringKey } from "@/lib/i18n/SystemI18nContext";
import { ghostBtn } from "@/components/ui/styles";
import { getUser, listUsers } from "@/lib/api/users";
import type { UserSortBy } from "@/lib/api/users";
import type { UserListItem, UserProfileEnriched } from "@/lib/types";
import { formatBalance, useBalancePrecision } from "./useBalancePrecision";

const SORT_OPTIONS: { value: UserSortBy; labelKey: SystemStringKey }[] = [
  { value: "created_at", labelKey: "console.users.sortCreatedAt" },
  { value: "username", labelKey: "console.users.sortUsername" },
  { value: "balance", labelKey: "console.users.sortBalance" },
  { value: "bonus_balance", labelKey: "console.users.sortBonusBalance" },
  { value: "purchases_count", labelKey: "console.users.sortPurchases" },
  { value: "wins_count", labelKey: "console.users.sortWins" },
  { value: "total_spent", labelKey: "console.users.sortTotalSpent" },
  { value: "sales_count", labelKey: "console.users.sortSales" },
  { value: "products_added_count", labelKey: "console.users.sortProductsAdded" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function copyUserId(id: string, flash: (msg: string) => void, t: SystemT, e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  navigator.clipboard
    .writeText(id)
    .then(() => flash(t("console.users.toast.idCopied")))
    .catch(() => flash(t("console.users.toast.copyFailed")));
}

// The id-search path hits GET .../users/{user_id}, which returns the richer
// UserProfileEnriched shape (stats renamed user_stats, extra profile fields)
// rather than the list item shape — reshaped here so the row renderer only
// has to deal with one shape.
function normalizeEnriched(u: UserProfileEnriched): UserListItem {
  return {
    id: u.id,
    tenant_id: u.tenant_id,
    user_id: u.user_id,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    balance: u.balance,
    bonus_balance: u.bonus_balance,
    stats: u.user_stats,
    seller_stats: u.seller_stats,
    roles: u.roles,
    created_at: u.created_at,
  };
}

// The list's last column shows whatever field is currently sorted on, rather
// than fixed Balance/Bonus columns.
function sortValue(u: UserListItem, sortBy: UserSortBy, precision: number): string {
  switch (sortBy) {
    case "created_at":
      return new Date(u.created_at).toLocaleDateString();
    case "username":
      return u.username ?? "—";
    case "balance":
      return formatBalance(u.balance, precision);
    case "bonus_balance":
      return formatBalance(u.bonus_balance, precision);
    case "purchases_count":
      return String(u.stats.purchases_count);
    case "wins_count":
      return String(u.stats.wins_count);
    case "total_spent":
      return formatBalance(u.stats.total_spent, precision);
    case "sales_count":
    case "products_added_count": {
      // seller_stats' internal field names aren't documented — assumed to
      // match the sort_by key exactly, same as every other stat here.
      const v = (u.seller_stats as Record<string, unknown> | null)?.[sortBy];
      return typeof v === "number" || typeof v === "string" ? String(v) : "—";
    }
    default:
      return "—";
  }
}

export function UsersEditor() {
  const { token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const tenantId = claims?.tenant_id ?? "";
  const canRead = permissions.includes("users.read");
  const balancePrecision = useBalancePrecision(tenantId, token);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<UserSortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  // The docs only say `search` matches username/first_name/last_name (ilike),
  // not user_id — so an id-shaped query is routed to the single-user GET
  // instead, rather than assuming the backend's search covers ids too.
  const isIdSearch = UUID_RE.test(search);

  const usersQuery = useQuery({
    queryKey: ["users", tenantId, search, sortBy, sortDir, limit, offset],
    queryFn: () => listUsers(tenantId, { search, sortBy, sortDir, limit, offset }, token!),
    enabled: !!token && !!tenantId && canRead && !isIdSearch,
  });

  const userByIdQuery = useQuery({
    queryKey: ["userById", tenantId, search],
    queryFn: () => getUser(tenantId, search, token!),
    enabled: !!token && !!tenantId && canRead && isIdSearch,
    retry: false,
  });

  const users: UserListItem[] = isIdSearch
    ? userByIdQuery.data
      ? [normalizeEnriched(userByIdQuery.data)]
      : []
    : (usersQuery.data?.items ?? []);
  const total = isIdSearch ? (userByIdQuery.data ? 1 : 0) : (usersQuery.data?.total ?? 0);
  const isLoading = isIdSearch ? userByIdQuery.isLoading : usersQuery.isLoading;
  const isError = isIdSearch ? userByIdQuery.isError : usersQuery.isError;
  const pageCount = total > 0 ? Math.ceil(total / limit) : 1;
  const currentPage = Math.floor(offset / limit) + 1;

  function applySearch() {
    setSearch(searchDraft.trim());
    setOffset(0);
  }

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.users.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.areas.users.label")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.areas.users.description")}
          </p>
        </div>
      </div>

      {!canRead && <p className="urus-lede">{t("console.users.noPermission")}</p>}

      {canRead && (
        <>
          <div className="urus-editor-toolbar">
            <span className="urus-toolbar-label">{t("console.common.filters")}</span>
            <button type="button" style={ghostBtn()} onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? t("console.common.hideFilters") : t("console.common.showFilters")}
            </button>
          </div>

          {filtersOpen && (
            <div className="urus-list-actions" style={{ marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
              <input
                className="urus-input"
                style={{ maxWidth: 260 }}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
                placeholder={t("console.users.searchPlaceholder")}
              />
              <button type="button" style={ghostBtn()} onClick={applySearch}>
                {t("console.users.search")}
              </button>
              <select
                className="urus-select"
                value={sortBy}
                disabled={isIdSearch}
                onChange={(e) => {
                  setSortBy(e.target.value as UserSortBy);
                  setOffset(0);
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
              <select
                className="urus-select"
                value={sortDir}
                disabled={isIdSearch}
                onChange={(e) => {
                  setSortDir(e.target.value as "asc" | "desc");
                  setOffset(0);
                }}
              >
                <option value="asc">{t("console.common.ascending")}</option>
                <option value="desc">{t("console.common.descending")}</option>
              </select>
              <select
                className="urus-select"
                value={limit}
                disabled={isIdSearch}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
              >
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="urus-table-card">
            <div className="urus-users-header-row">
              <span>{t("console.users.columnId")}</span>
              <span>{t("console.users.columnUsername")}</span>
              <span>{t("console.users.columnName")}</span>
              <span>{t("console.users.columnRoles")}</span>
              <span style={{ textAlign: "right" }}>
                {SORT_OPTIONS.find((o) => o.value === sortBy) ? t(SORT_OPTIONS.find((o) => o.value === sortBy)!.labelKey) : t("console.users.columnSortValueFallback")}
              </span>
            </div>
            {isLoading && <div className="urus-table-empty">{t("console.common.loading")}</div>}
            {isError && <div className="urus-table-empty">{isIdSearch ? t("console.users.notFoundById") : t("console.list.failed")}</div>}
            {!isLoading && !isError && users.length === 0 && <div className="urus-table-empty">{t("console.users.empty")}</div>}
            {users.map((u) => (
              <Link key={u.id} href={`/users/${u.user_id}`} className="urus-users-row">
                <span
                  className="urus-perm-key"
                  style={{ cursor: "pointer" }}
                  title={t("console.users.copyIdTitle", { id: u.user_id })}
                  onClick={(e) => copyUserId(u.user_id, flash, t, e)}
                >
                  {u.user_id.slice(0, 8)}…
                </span>
                <span className="urus-mono-accent">{u.username ?? "—"}</span>
                <span>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</span>
                <span className="urus-muted">{u.roles.length > 0 ? u.roles.join(", ") : "—"}</span>
                <span className="urus-tabnum" style={{ textAlign: "right" }}>
                  {sortValue(u, sortBy, balancePrecision)}
                </span>
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-4)" }}>
            <button
              type="button"
              style={ghostBtn()}
              disabled={offset === 0 || isIdSearch}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              {t("console.common.prev")}
            </button>
            <span className="urus-tabnum">{t("console.common.pageInfo", { page: currentPage, pageCount, total })}</span>
            <button
              type="button"
              style={ghostBtn()}
              disabled={offset + limit >= total || isIdSearch}
              onClick={() => setOffset(offset + limit)}
            >
              {t("console.common.next")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
