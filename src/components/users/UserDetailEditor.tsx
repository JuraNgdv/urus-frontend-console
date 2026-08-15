"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import { assignRoleToUser, listManageableRoles, revokeRoleFromUser } from "@/lib/api/rbac";
import { adjustUserBalance, getUser, getUserBalanceHistory } from "@/lib/api/users";
import type { TransactionSortBy } from "@/lib/api/users";
import type { BalanceType, RoleResponse } from "@/lib/types";
import { formatBalance, useBalancePrecision } from "./useBalancePrecision";

const TX_LIMIT = 50;

interface AdjustDraft {
  balanceType: BalanceType;
  amount: string;
}

export function UserDetailEditor({ userId }: { userId: string }) {
  const router = useRouter();
  const { token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";

  const canRead = permissions.includes("users.read");
  const canReadMain = permissions.includes("balance.main.read");
  const canReadBonus = permissions.includes("balance.bonus.read");
  const canManageMain = permissions.includes("balance.main.manage");
  const canManageBonus = permissions.includes("balance.bonus.manage");
  const canReadAnyBalance = canReadMain || canReadBonus;
  const canAssignRole = permissions.includes("role.assign");
  const canRevokeRole = permissions.includes("role.revoke");
  const canManageRoles = canAssignRole || canRevokeRole;
  const balancePrecision = useBalancePrecision(tenantId, token);

  const profileQuery = useQuery({
    queryKey: ["userProfile", tenantId, userId],
    queryFn: () => getUser(tenantId, userId, token!),
    enabled: !!token && !!tenantId && canRead,
  });
  const profile = profileQuery.data;

  // role.assign/role.revoke are delegation-filtered — /roles/manageable, not
  // the unrestricted /roles, since a non-TMA caller may not hold role.read.
  const manageableRolesQuery = useQuery({
    queryKey: ["manageableRoles", tenantId],
    queryFn: () => listManageableRoles(tenantId, token!),
    enabled: !!token && !!tenantId && canManageRoles,
  });
  const manageableRoles = manageableRolesQuery.data ?? [];
  const manageableRoleNames = new Set(manageableRoles.map((r) => r.name));
  const otherRoles = profile ? profile.roles.filter((name) => !manageableRoleNames.has(name)) : [];

  const roleMutation = useMutation({
    mutationFn: ({ role, assign }: { role: RoleResponse; assign: boolean }) =>
      assign ? assignRoleToUser(tenantId, userId, role.id, token!) : revokeRoleFromUser(tenantId, userId, role.id, token!),
    onSuccess: () => {
      flash(t("console.users.toast.rolesUpdated"));
      queryClient.invalidateQueries({ queryKey: ["userProfile", tenantId, userId] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.users.toast.roleUpdateFailed")),
  });

  // Collapsed by default — history isn't fetched until opened, and its
  // filter panel is a second, independent click behind that.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [txFiltersOpen, setTxFiltersOpen] = useState(false);

  const [balanceTypeFilter, setBalanceTypeFilter] = useState<"" | BalanceType>("");
  // Only meaningful when both read permissions are held — with just one, the
  // backend auto-restricts to it regardless of what's requested.
  const effectiveBalanceType: BalanceType | undefined =
    canReadMain && canReadBonus ? balanceTypeFilter || undefined : canReadMain ? "main" : canReadBonus ? "bonus" : undefined;

  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [txSortBy, setTxSortBy] = useState<TransactionSortBy>("created_at");
  const [txSortDir, setTxSortDir] = useState<"asc" | "desc">("desc");
  const [txOffset, setTxOffset] = useState(0);

  function applyDateFilters() {
    setDateFrom(dateFromDraft ? `${dateFromDraft}T00:00:00Z` : undefined);
    setDateTo(dateToDraft ? `${dateToDraft}T23:59:59Z` : undefined);
    setTxOffset(0);
  }

  const transactionsQuery = useQuery({
    queryKey: ["userBalanceHistory", tenantId, userId, effectiveBalanceType, dateFrom, dateTo, txSortBy, txSortDir, txOffset],
    queryFn: () =>
      getUserBalanceHistory(
        tenantId,
        userId,
        {
          balanceType: effectiveBalanceType,
          dateFrom,
          dateTo,
          sortBy: txSortBy,
          sortDir: txSortDir,
          limit: TX_LIMIT,
          offset: txOffset,
        },
        token!,
      ),
    enabled: !!token && !!tenantId && canReadAnyBalance && historyOpen,
  });
  const transactions = transactionsQuery.data?.items ?? [];
  const txTotal = transactionsQuery.data?.total ?? 0;
  const txPageCount = txTotal > 0 ? Math.ceil(txTotal / TX_LIMIT) : 1;
  const txPage = Math.floor(txOffset / TX_LIMIT) + 1;

  const [adjustDraft, setAdjustDraft] = useState<AdjustDraft | null>(null);

  const adjustMutation = useMutation({
    mutationFn: (draft: AdjustDraft) =>
      adjustUserBalance(
        tenantId,
        userId,
        { balance_type: draft.balanceType, amount: draft.amount.trim()},
        token!,
      ),
    onSuccess: (tx) => {
      flash(
        t("console.users.toast.adjustSaved", {
          type: tx.balance_type === "main" ? t("console.users.mainOption") : t("console.users.bonusOption"),
          amount: tx.balance_after,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ["userProfile", tenantId, userId] });
      queryClient.invalidateQueries({ queryKey: ["userBalanceHistory", tenantId, userId] });
      setAdjustDraft(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.users.toast.adjustFailed")),
  });

  return (
    <main className="urus-editor-main">
      <section>
        <button type="button" className="urus-back-link" onClick={() => router.push("/users")}>
          ← {t("console.areas.users.label")}
        </button>

        {!canRead && <p className="urus-lede">{t("console.users.noPermission")}</p>}

        {canRead && profileQuery.isLoading && <p className="urus-lede">{t("console.common.loading")}</p>}
        {canRead && profileQuery.isError && <p className="urus-lede">{t("console.users.userNotFound")}</p>}

        {canRead && profile && (
          <>
            <h1 className="urus-editor-title">{profile.username ?? profile.user_id}</h1>
            <div className="urus-card-tags" style={{ marginBottom: "var(--space-4)" }}>
              <span className="urus-tag-outline-soft">
                {[profile.first_name, profile.last_name].filter(Boolean).join(" ") || t("console.users.noName")}
              </span>
              <span className="urus-tag-outline-soft">{t("console.users.langTag", { lang: profile.lang })}</span>
              {profile.referral_id && (
                <span className="urus-tag-outline-soft">
                  {t("console.users.referredBy", { id: profile.referral_id.slice(0, 8) })}
                </span>
              )}
              {profile.identities.length > 0 && (
                <span className="urus-tag-outline-soft">
                  {t("console.users.viaIdentities", { identities: profile.identities.join(", ") })}
                </span>
              )}
              <span className="urus-muted">
                {t("console.users.joined", { date: new Date(profile.created_at).toLocaleDateString() })}
              </span>
            </div>

            <div style={{ marginBottom: "var(--space-6)" }}>
              <div className="urus-toolbar-label" style={{ marginBottom: "var(--space-2)" }}>
                {t("console.users.rolesLabel")}
              </div>

              {!canManageRoles && (
                <div className="urus-card-tags">
                  {profile.roles.length > 0 ? (
                    profile.roles.map((r) => (
                      <span key={r} className="urus-tag-outline-soft">
                        {r}
                      </span>
                    ))
                  ) : (
                    <span className="urus-muted">{t("console.users.noRoles")}</span>
                  )}
                </div>
              )}

              {canManageRoles && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {manageableRoles.map((role) => {
                      const has = profile.roles.includes(role.name);
                      const disabled = (has && !canRevokeRole) || (!has && !canAssignRole) || roleMutation.isPending;
                      return (
                        <label key={role.id} className="urus-checkbox">
                          <input
                            type="checkbox"
                            checked={has}
                            disabled={disabled}
                            onChange={() => roleMutation.mutate({ role, assign: !has })}
                          />
                          <span className="urus-checkbox-box" />
                          {role.name}
                        </label>
                      );
                    })}
                    {manageableRolesQuery.isLoading && <p className="urus-lede">{t("console.users.loadingRoles")}</p>}
                    {!manageableRolesQuery.isLoading && manageableRoles.length === 0 && (
                      <p className="urus-lede">{t("console.users.noManageableRoles")}</p>
                    )}
                  </div>
                  {otherRoles.length > 0 && (
                    <p className="urus-field-hint">{t("console.users.otherRoles", { roles: otherRoles.join(", ") })}</p>
                  )}
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
              <div className="urus-aside" style={{ flex: "1 1 220px" }}>
                <div className="urus-aside-title">{t("console.users.mainBalance")}</div>
                <div className="urus-display-sm" style={{ marginBottom: "var(--space-3)" }}>
                  {formatBalance(profile.balance, balancePrecision)}
                </div>
                {canManageMain && (
                  <button
                    type="button"
                    style={smallPrimaryBtn()}
                    onClick={() => setAdjustDraft({ balanceType: "main", amount: ""})}
                  >
                    {t("console.users.adjust")}
                  </button>
                )}
              </div>
              <div className="urus-aside" style={{ flex: "1 1 220px" }}>
                <div className="urus-aside-title">{t("console.users.bonusBalance")}</div>
                <div className="urus-display-sm" style={{ marginBottom: "var(--space-3)" }}>
                  {formatBalance(profile.bonus_balance, balancePrecision)}
                </div>
                {canManageBonus && (
                  <button
                    type="button"
                    style={smallPrimaryBtn()}
                    onClick={() => setAdjustDraft({ balanceType: "bonus", amount: ""})}
                  >
                    {t("console.users.adjust")}
                  </button>
                )}
              </div>
            </div>

            {!canReadAnyBalance && <p className="urus-lede">{t("console.users.balanceReadHidden")}</p>}

            {canReadAnyBalance && (
              <section>
                <div className="urus-editor-toolbar">
                  <span className="urus-toolbar-label">{t("console.users.transactionHistory")}</span>
                  <button type="button" style={ghostBtn()} onClick={() => setHistoryOpen((v) => !v)}>
                    {historyOpen ? t("console.users.hideHistory") : t("console.users.showHistory")}
                  </button>
                </div>

                {historyOpen && (
                  <>
                    <div style={{ marginBottom: "var(--space-4)" }}>
                      <button type="button" style={ghostBtn()} onClick={() => setTxFiltersOpen((v) => !v)}>
                        {txFiltersOpen ? t("console.common.hideFilters") : t("console.common.showFilters")}
                      </button>
                    </div>

                    {txFiltersOpen && (
                      <div
                        style={{
                          display: "flex",
                          gap: "var(--space-4)",
                          flexWrap: "wrap",
                          alignItems: "flex-end",
                          marginBottom: "var(--space-4)",
                        }}
                      >
                        {canReadMain && canReadBonus && (
                          <label className="urus-field">
                            <span className="urus-field-label">{t("console.users.fieldBalanceType")}</span>
                            <select
                              className="urus-select"
                              value={balanceTypeFilter}
                              onChange={(e) => {
                                setBalanceTypeFilter(e.target.value as "" | BalanceType);
                                setTxOffset(0);
                              }}
                            >
                              <option value="">{t("console.users.both")}</option>
                              <option value="main">{t("console.users.mainOption")}</option>
                              <option value="bonus">{t("console.users.bonusOption")}</option>
                            </select>
                          </label>
                        )}
                        <label className="urus-field">
                          <span className="urus-field-label">{t("console.users.fieldFrom")}</span>
                          <input
                            className="urus-input"
                            type="date"
                            value={dateFromDraft}
                            onChange={(e) => setDateFromDraft(e.target.value)}
                          />
                        </label>
                        <label className="urus-field">
                          <span className="urus-field-label">{t("console.users.fieldTo")}</span>
                          <input
                            className="urus-input"
                            type="date"
                            value={dateToDraft}
                            onChange={(e) => setDateToDraft(e.target.value)}
                          />
                        </label>
                        <button type="button" style={smallPrimaryBtn()} onClick={applyDateFilters}>
                          {t("console.common.apply")}
                        </button>
                        <label className="urus-field">
                          <span className="urus-field-label">{t("console.common.fieldSortBy")}</span>
                          <select
                            className="urus-select"
                            value={txSortBy}
                            onChange={(e) => {
                              setTxSortBy(e.target.value as TransactionSortBy);
                              setTxOffset(0);
                            }}
                          >
                            <option value="created_at">{t("console.users.sortCreatedAt")}</option>
                            <option value="amount">{t("console.users.amount")}</option>
                          </select>
                        </label>
                        <label className="urus-field">
                          <span className="urus-field-label">{t("console.common.fieldOrder")}</span>
                          <select
                            className="urus-select"
                            value={txSortDir}
                            onChange={(e) => {
                              setTxSortDir(e.target.value as "asc" | "desc");
                              setTxOffset(0);
                            }}
                          >
                            <option value="desc">{t("console.common.descending")}</option>
                            <option value="asc">{t("console.common.ascending")}</option>
                          </select>
                        </label>
                      </div>
                    )}

                    <div className="urus-table-card">
                      <div className="urus-table-header-row">
                        <span>{t("console.users.columnType")}</span>
                        <span>{t("console.users.amount")}</span>
                        <span>{t("console.users.columnBalanceAfter")}</span>
                        <span style={{ textAlign: "right" }}>{t("console.users.columnWhen")}</span>
                      </div>
                      {transactionsQuery.isLoading && <div className="urus-table-empty">{t("console.common.loading")}</div>}
                      {transactionsQuery.isError && <div className="urus-table-empty">{t("console.list.failed")}</div>}
                      {!transactionsQuery.isLoading && !transactionsQuery.isError && transactions.length === 0 && (
                        <div className="urus-table-empty">{t("console.users.noTransactions")}</div>
                      )}
                      {transactions.map((tx) => (
                        <div key={tx.id} className="urus-table-row" style={{ cursor: "default" }}>
                          <span className="urus-mono-accent">
                            {tx.balance_type} · {tx.action}
                            {tx.reference_id && (
                              <>
                                <br />
                                <span className="urus-muted" style={{ fontSize: 11 }}>
                                  {tx.reference_type}: {tx.reference_id.slice(0, 8)}…
                                </span>
                              </>
                            )}
                          </span>
                          <span className={tx.amount.trim().startsWith("-") ? "urus-tag-dashed" : "urus-tag-outline-soft"}>
                            {formatBalance(tx.amount, balancePrecision)}
                          </span>
                          <span>{formatBalance(tx.balance_after, balancePrecision)}</span>
                          <span className="urus-tabnum" style={{ textAlign: "right" }}>
                            {new Date(tx.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-4)" }}>
                      <button
                        type="button"
                        style={ghostBtn()}
                        disabled={txOffset === 0}
                        onClick={() => setTxOffset(Math.max(0, txOffset - TX_LIMIT))}
                      >
                        {t("console.common.prev")}
                      </button>
                      <span className="urus-tabnum">
                        {t("console.common.pageInfo", { page: txPage, pageCount: txPageCount, total: txTotal })}
                      </span>
                      <button
                        type="button"
                        style={ghostBtn()}
                        disabled={txOffset + TX_LIMIT >= txTotal}
                        onClick={() => setTxOffset(txOffset + TX_LIMIT)}
                      >
                        {t("console.common.next")}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </section>

      {adjustDraft && (
        <Modal
          title={t("console.users.adjustTitle", {
            type: adjustDraft.balanceType === "main" ? t("console.users.mainOption") : t("console.users.bonusOption"),
          })}
          onClose={() => setAdjustDraft(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={!adjustDraft.amount.trim() || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate(adjustDraft)}
              >
                {t("console.common.submit")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setAdjustDraft(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <label className="urus-field">
            <span className="urus-field-label">{t("console.users.amount")}</span>
            <input
              className="urus-input"
              type="number"
              step="0.01"
              value={adjustDraft.amount}
              onChange={(e) => setAdjustDraft({ ...adjustDraft, amount: e.target.value })}
              placeholder={t("console.users.amountPlaceholder")}
            />
            <span className="urus-field-hint">{t("console.users.amountHint")}</span>
          </label>
        </Modal>
      )}
    </main>
  );
}
