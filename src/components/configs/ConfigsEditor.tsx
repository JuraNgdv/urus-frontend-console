"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT, useDynamicSystemT, type SystemT } from "@/lib/i18n/SystemI18nContext";
import { cardStyle, ghostBtn, primaryBtn } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import { listConfigDefinitions, listTenantConfigs, updateTenantConfig } from "@/lib/api/configs";
import type { ConfigDefinitionResponse, ConfigEntryResponse, ConfigValidationRules } from "@/lib/types";

function parseListInput(text: string, rules: ConfigValidationRules | null): unknown[] {
  const items = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  // Per the contract, list validation_rules are either numeric bounds (min/max)
  // or a string regex — never both, so this is enough to tell element type apart.
  if (rules && (rules.min !== undefined || rules.max !== undefined)) {
    return items.map(Number);
  }
  return items;
}

function listHint(rules: ConfigValidationRules | null, t: SystemT): string {
  const parts = [t("console.configs.listCommaSeparated")];
  if (rules?.max_length !== undefined) parts.push(t("console.configs.listUpTo", { max: rules.max_length }));
  if (rules?.min !== undefined || rules?.max !== undefined) {
    parts.push(t("console.configs.listRange", { min: rules?.min ?? "-∞", max: rules?.max ?? "∞" }));
  }
  if (rules?.regex) parts.push(t("console.configs.listRegex", { regex: rules.regex }));
  return parts.join(" ");
}

export function ConfigsEditor() {
  const { token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";
  const canManage = permissions.includes("configs.manage");

  // Both proxied through Route Handlers that hold the bff_token and check
  // configs.manage server-side — see src/lib/server/configProxy.ts. Definitions
  // arrive already filtered to is_visible ones, so a hidden config (e.g.
  // telegram_bot_token) never shows up here at all, for any tenant admin.
  const definitionsQuery = useQuery({
    queryKey: ["configDefinitions", tenantId],
    queryFn: () => listConfigDefinitions(tenantId, token!),
    enabled: !!token && !!tenantId && canManage,
  });

  const valuesQuery = useQuery({
    queryKey: ["tenantConfigs", tenantId],
    queryFn: () => listTenantConfigs(tenantId, token!),
    enabled: !!token && !!tenantId && canManage,
  });

  const definitions = definitionsQuery.data ?? [];
  const valuesByKey = new Map((valuesQuery.data ?? []).map((e) => [e.key, e.value]));
  // description_id is itself a system translation key the admin typed in when
  // defining the config — not display text — so it's resolved, not shown raw.
  const describeConfig = useDynamicSystemT(definitions.map((d) => d.description_id));

  // Same lifted pending/dirty pattern as PermissionsEditor's role-permission
  // matrix — avoids per-row local state ever going stale against a background
  // refetch, since "current" is always freshly derived from pending ?? query data.
  const [pendingByKey, setPendingByKey] = useState<Record<string, unknown>>({});

  function originalValueFor(def: ConfigDefinitionResponse): unknown {
    return valuesByKey.has(def.key) ? valuesByKey.get(def.key) : def.default_value;
  }

  function currentValueFor(def: ConfigDefinitionResponse): unknown {
    return def.key in pendingByKey ? pendingByKey[def.key] : originalValueFor(def);
  }

  function setPending(key: string, value: unknown) {
    setPendingByKey((prev) => ({ ...prev, [key]: value }));
  }

  function resetPending(key: string) {
    setPendingByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function isDirty(def: ConfigDefinitionResponse): boolean {
    return def.key in pendingByKey && JSON.stringify(pendingByKey[def.key]) !== JSON.stringify(originalValueFor(def));
  }

  // List values edit as a raw comma string while dirty, parsed to an array only on Save.
  function listDisplayValue(def: ConfigDefinitionResponse): string {
    if (def.key in pendingByKey) return pendingByKey[def.key] as string;
    const original = originalValueFor(def);
    return Array.isArray(original) ? original.join(", ") : "";
  }

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateTenantConfig(tenantId, key, value, token!),
    onSuccess: (entry, { key }) => {
      flash(t("console.configs.toast.saved"));
      resetPending(key);
      queryClient.setQueryData<ConfigEntryResponse[]>(["tenantConfigs", tenantId], (prev) =>
        (prev ?? []).map((e) => (e.key === key ? entry : e)),
      );
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.configs.toast.saveFailed")),
  });

  function handleSave(def: ConfigDefinitionResponse) {
    const pending = pendingByKey[def.key];
    const value = def.type === "list" ? parseListInput(pending as string, def.validation_rules) : pending;
    saveMutation.mutate({ key: def.key, value });
  }

  const loading = definitionsQuery.isLoading || valuesQuery.isLoading;
  const failed = definitionsQuery.isError || valuesQuery.isError;

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.configs.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.areas.cfg.label")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.configs.description")}
          </p>
        </div>
      </div>

      {!canManage && <p className="urus-lede">{t("console.configs.noPermission")}</p>}

      {canManage && loading && <p className="urus-lede">{t("console.common.loading")}</p>}
      {canManage && !loading && failed && <p className="urus-lede">{t("console.configs.loadFailed")}</p>}

      {canManage && !loading && !failed && (
        <div className="urus-card-list">
          {definitions.map((def) => {
            const editable = def.is_editable;
            const current = currentValueFor(def);
            return (
              <div key={def.key} style={cardStyle(false)}>
                <div className="urus-card-head">
                  <span className="urus-perm-key">{def.key}</span>
                  <span className="urus-card-type">{def.type}</span>
                  {def.description_id && <span className="urus-tag-outline-soft">{describeConfig(def.description_id)}</span>}
                  {!editable && <span className="urus-tag-dashed">{t("console.configs.notEditable")}</span>}
                </div>

                <div style={{ marginTop: "var(--space-2)", maxWidth: 420 }}>
                  {def.type === "checkbox" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!current}
                        disabled={!editable}
                        onChange={(e) => setPending(def.key, e.target.checked)}
                      />
                      <span className="urus-field-label" style={{ marginBottom: 0 }}>
                        {current ? t("console.configs.on") : t("console.configs.off")}
                      </span>
                    </label>
                  )}

                  {def.type === "select" && (
                    <select
                      className="urus-select"
                      value={String(current ?? "")}
                      disabled={!editable}
                      onChange={(e) => setPending(def.key, e.target.value)}
                    >
                      {(def.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {def.type === "multiselect" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(def.options ?? []).map((opt) => {
                        const selected = ((current as string[] | null) ?? []).includes(opt);
                        return (
                          <label key={opt} className="urus-checkbox">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!editable}
                              onChange={() => {
                                const arr = ((current as string[] | null) ?? []).slice();
                                const i = arr.indexOf(opt);
                                if (i === -1) arr.push(opt);
                                else arr.splice(i, 1);
                                setPending(def.key, arr);
                              }}
                            />
                            <span className="urus-checkbox-box" />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {def.type === "text" && (
                    <>
                      <input
                        className="urus-input"
                        value={String(current ?? "")}
                        disabled={!editable}
                        onChange={(e) => setPending(def.key, e.target.value)}
                      />
                      {def.validation_rules?.regex && (
                        <span className="urus-field-hint">
                          {t("console.configs.mustMatch", { regex: def.validation_rules.regex })}
                        </span>
                      )}
                    </>
                  )}

                  {def.type === "number" && (
                    <input
                      className="urus-input"
                      type="number"
                      min={def.validation_rules?.min}
                      max={def.validation_rules?.max}
                      value={current === null || current === undefined ? "" : String(current)}
                      disabled={!editable}
                      onChange={(e) => setPending(def.key, e.target.value === "" ? null : Number(e.target.value))}
                    />
                  )}

                  {def.type === "list" && (
                    <>
                      <input
                        className="urus-input urus-input-mono"
                        value={listDisplayValue(def)}
                        disabled={!editable}
                        onChange={(e) => setPending(def.key, e.target.value)}
                      />
                      <span className="urus-field-hint">{listHint(def.validation_rules, t)}</span>
                    </>
                  )}
                </div>

                {isDirty(def) && (
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                    <button
                      type="button"
                      style={primaryBtn()}
                      disabled={saveMutation.isPending}
                      onClick={() => handleSave(def)}
                    >
                      {t("console.common.save")}
                    </button>
                    <button type="button" style={ghostBtn()} onClick={() => resetPending(def.key)}>
                      {t("console.common.reset")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {definitions.length === 0 && <p className="urus-lede">{t("console.configs.empty")}</p>}
        </div>
      )}
    </main>
  );
}
