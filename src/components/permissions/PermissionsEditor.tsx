"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT, useDynamicSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import {
  PERMISSION_KEY_PATTERN,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  getRolePermissions,
  listPermissions,
  listRoles,
  setRolePermissions,
} from "@/lib/api/rbac";
import type { PermissionResponse, RoleResponse } from "@/lib/types";

function Checkbox({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label className="urus-checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="urus-checkbox-box" />
      {children}
    </label>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

interface PermissionDraft {
  key: string;
  group: string;
  descriptionId: string;
}

interface RoleDraft {
  name: string;
  descriptionId: string;
  permissionIds: Set<string>;
}

export function PermissionsEditor() {
  const { token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";

  const canCreatePermission = permissions.includes("permission.create");
  const canDeletePermission = permissions.includes("permission.delete");
  const canReadRoles = permissions.includes("role.read");
  const canCreateRole = permissions.includes("role.create");
  const canDeleteRole = permissions.includes("role.delete");
  const canSetRolePermissions = permissions.includes("role.permissions.update");

  const permissionsQuery = useQuery({
    queryKey: ["permissions", tenantId],
    queryFn: () => listPermissions(tenantId, token!),
    enabled: !!token && !!tenantId,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles", tenantId],
    queryFn: () => listRoles(tenantId, token!),
    enabled: !!token && !!tenantId && canReadRoles,
  });

  const allPermissions = permissionsQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const permissionGroups = groupBy(allPermissions, (p) => p.group);
  // description_id is itself a system translation key the admin typed in when
  // defining the permission — not display text — so it's resolved, not shown raw.
  const describePermission = useDynamicSystemT(allPermissions.map((p) => p.description_id));

  const [permDraft, setPermDraft] = useState<PermissionDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [pendingByRole, setPendingByRole] = useState<Record<string, Set<string>>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Only one role is shown at a time, so only its permissions need fetching —
  // scales fine to many roles instead of firing one request per role up front.
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null;

  const rolePermissionsQuery = useQuery({
    queryKey: ["rolePermissions", tenantId, selectedRole?.id],
    queryFn: () => getRolePermissions(tenantId, selectedRole!.id, token!),
    enabled: !!token && !!tenantId && canReadRoles && !!selectedRole,
  });

  function isRoleLoaded(role: RoleResponse): boolean {
    return queryClient.getQueryData<PermissionResponse[]>(["rolePermissions", tenantId, role.id]) !== undefined;
  }

  function loadedIdsFor(role: RoleResponse): Set<string> {
    const data = queryClient.getQueryData<PermissionResponse[]>(["rolePermissions", tenantId, role.id]);
    return new Set((data ?? []).map((p) => p.id));
  }

  function selectedIdsFor(role: RoleResponse): Set<string> {
    return pendingByRole[role.id] ?? loadedIdsFor(role);
  }

  function isRoleDirty(role: RoleResponse): boolean {
    const pending = pendingByRole[role.id];
    return !!pending && isRoleLoaded(role) && !setsEqual(pending, loadedIdsFor(role));
  }

  function toggleRolePermission(role: RoleResponse, permissionId: string) {
    setPendingByRole((prev) => {
      const current = prev[role.id] ?? loadedIdsFor(role);
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return { ...prev, [role.id]: next };
    });
  }

  const createPermissionMutation = useMutation({
    mutationFn: (draft: PermissionDraft) =>
      createPermission(tenantId, { key: draft.key, group: draft.group, description_id: draft.descriptionId }, token!),
    onSuccess: () => {
      flash(t("console.permissions.toast.permCreated"));
      queryClient.invalidateQueries({ queryKey: ["permissions", tenantId] });
      setPermDraft(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.permissions.toast.permCreateFailed")),
  });

  const deletePermissionMutation = useMutation({
    mutationFn: (permissionId: string) => deletePermission(tenantId, permissionId, token!),
    onSuccess: () => {
      flash(t("console.permissions.toast.permDeleted"));
      queryClient.invalidateQueries({ queryKey: ["permissions", tenantId] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.permissions.toast.permDeleteFailed")),
  });

  const createRoleMutation = useMutation({
    mutationFn: (draft: RoleDraft) =>
      createRole(
        tenantId,
        {
          name: draft.name,
          description_id: draft.descriptionId || null,
          permission_ids: Array.from(draft.permissionIds),
        },
        token!,
      ),
    onSuccess: () => {
      flash(t("console.permissions.toast.roleCreated"));
      queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
      setRoleDraft(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.permissions.toast.roleCreateFailed")),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(tenantId, roleId, token!),
    onSuccess: () => {
      flash(t("console.permissions.toast.roleDeleted"));
      queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.permissions.toast.roleDeleteFailed")),
  });

  const saveRolePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      setRolePermissions(tenantId, roleId, { permission_ids: permissionIds }, token!),
    onSuccess: (data, { roleId }) => {
      flash(t("console.permissions.toast.rolePermsSaved"));
      setPendingByRole((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
      queryClient.setQueryData(["rolePermissions", tenantId, roleId], data);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.permissions.toast.rolePermsSaveFailed")),
  });

  const permKeyValid = !!permDraft && PERMISSION_KEY_PATTERN.test(permDraft.key);

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.permissions.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.areas.rbac.label")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.permissions.description")}
          </p>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <div>
          <div className="urus-editor-toolbar">
            <span className="urus-toolbar-label">{t("console.permissions.permissionsLabel")}</span>
            {canCreatePermission && (
              <button
                type="button"
                style={smallPrimaryBtn()}
                onClick={() => setPermDraft({ key: "", group: "", descriptionId: "" })}
              >
                {t("console.permissions.newPermission")}
              </button>
            )}
          </div>
          <div className="urus-card-list">
            {Array.from(permissionGroups.entries()).map(([group, perms]) => (
              <div key={group}>
                <div className="urus-perm-group">{group}</div>
                {perms.map((p) => (
                  <div key={p.id} className="urus-card-tags" style={{ padding: "6px 0" }}>
                    <span className="urus-perm-key">{p.key}</span>
                    {p.description_id && <span className="urus-tag-outline-soft">{describePermission(p.description_id)}</span>}
                    {p.created_by === null && <span className="urus-tag-dashed">{t("console.permissions.system")}</span>}
                    {canDeletePermission && p.created_by !== null && (
                      <button type="button" style={ghostBtn()} onClick={() => deletePermissionMutation.mutate(p.id)}>
                        {t("console.common.delete")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {permissionsQuery.isLoading && <p className="urus-lede">{t("console.common.loading")}</p>}
            {!permissionsQuery.isLoading && allPermissions.length === 0 && <p className="urus-lede">{t("console.permissions.empty")}</p>}
          </div>
        </div>

        <div>
          <div className="urus-editor-toolbar">
            <span className="urus-toolbar-label">{t("console.permissions.rolesSection")}</span>
            {canCreateRole && (
              <button
                type="button"
                style={smallPrimaryBtn()}
                onClick={() => setRoleDraft({ name: "", descriptionId: "", permissionIds: new Set() })}
              >
                {t("console.permissions.newRole")}
              </button>
            )}
          </div>

          {!canReadRoles && <p className="urus-lede">{t("console.permissions.noRoleReadPermission")}</p>}

          {canReadRoles && rolesQuery.isLoading && <p className="urus-lede">{t("console.common.loading")}</p>}

          {canReadRoles && !rolesQuery.isLoading && roles.length === 0 && <p className="urus-lede">{t("console.permissions.noRoles")}</p>}

          {canReadRoles && selectedRole && (
            <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="urus-role-list">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    className={`urus-role-item${role.id === selectedRole.id ? " is-active" : ""}`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <span>{role.name}</span>
                    {isRoleDirty(role) && <span className="urus-role-dot" aria-label={t("console.permissions.unsavedDot")} />}
                  </button>
                ))}
              </div>

              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div className="urus-card-head" style={{ marginBottom: "var(--space-3)" }}>
                  <span style={{ fontWeight: 800, fontSize: 20 }}>{selectedRole.name}</span>
                  {selectedRole.created_by === null && <span className="urus-tag-dashed">{t("console.permissions.system")}</span>}
                  {canDeleteRole && (
                    <button
                      type="button"
                      style={ghostBtn()}
                      onClick={() => deleteRoleMutation.mutate(selectedRole.id)}
                    >
                      {t("console.permissions.deleteRole")}
                    </button>
                  )}
                </div>

                {rolePermissionsQuery.isLoading && <p className="urus-lede">{t("console.permissions.loadingPermissions")}</p>}

                {rolePermissionsQuery.isError && <p className="urus-lede">{t("console.permissions.loadRoleFailed")}</p>}

                {!rolePermissionsQuery.isLoading && isRoleLoaded(selectedRole) && (
                  <>
                    <div className="urus-card-list">
                      {Array.from(permissionGroups.entries()).map(([group, perms]) => (
                        <div key={group}>
                          <div className="urus-perm-group">{group}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                            {perms.map((p) => (
                              <Checkbox
                                key={p.id}
                                checked={selectedIdsFor(selectedRole).has(p.id)}
                                disabled={!canSetRolePermissions}
                                onChange={() => toggleRolePermission(selectedRole, p.id)}
                              >
                                <span className="urus-perm-key">{p.key}</span>
                              </Checkbox>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {isRoleDirty(selectedRole) && (
                      <div className="urus-perm-dirty-row" style={{ marginTop: "var(--space-4)" }}>
                        <span>{t("console.permissions.unsavedRow")}</span>
                        <button
                          type="button"
                          style={primaryBtn()}
                          disabled={saveRolePermissionsMutation.isPending}
                          onClick={() =>
                            saveRolePermissionsMutation.mutate({
                              roleId: selectedRole.id,
                              permissionIds: Array.from(selectedIdsFor(selectedRole)),
                            })
                          }
                        >
                          {t("console.common.save")}
                        </button>
                        <button
                          type="button"
                          style={ghostBtn()}
                          onClick={() =>
                            setPendingByRole((prev) => {
                              const next = { ...prev };
                              delete next[selectedRole.id];
                              return next;
                            })
                          }
                        >
                          {t("console.common.reset")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {permDraft && (
        <Modal
          title={t("console.permissions.newPermission")}
          onClose={() => setPermDraft(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={!permKeyValid || !permDraft.group || createPermissionMutation.isPending}
                onClick={() => createPermissionMutation.mutate(permDraft)}
              >
                {t("console.permissions.create")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setPermDraft(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <label className="urus-field">
            <span className="urus-field-label">{t("console.permissions.fieldKey")}</span>
            <input
              className="urus-input urus-input-mono"
              value={permDraft.key}
              onChange={(e) => setPermDraft({ ...permDraft, key: e.target.value })}
              placeholder={t("console.permissions.keyPlaceholder")}
            />
            {!permKeyValid && permDraft.key && <span className="urus-field-hint">{t("console.permissions.keyHint")}</span>}
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.permissions.fieldGroup")}</span>
            <input
              className="urus-input"
              value={permDraft.group}
              onChange={(e) => setPermDraft({ ...permDraft, group: e.target.value })}
              placeholder={t("console.permissions.groupPlaceholder")}
            />
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.permissions.fieldDescriptionId")}</span>
            <input
              className="urus-input urus-input-mono"
              value={permDraft.descriptionId}
              onChange={(e) => setPermDraft({ ...permDraft, descriptionId: e.target.value })}
              placeholder={t("console.permissions.descIdPlaceholderPerm")}
            />
          </label>
        </Modal>
      )}

      {roleDraft && (
        <Modal
          title={t("console.permissions.newRole")}
          onClose={() => setRoleDraft(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={!roleDraft.name || createRoleMutation.isPending}
                onClick={() => createRoleMutation.mutate(roleDraft)}
              >
                {t("console.permissions.create")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setRoleDraft(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <label className="urus-field">
            <span className="urus-field-label">{t("console.permissions.fieldName")}</span>
            <input
              className="urus-input"
              value={roleDraft.name}
              onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })}
              placeholder={t("console.permissions.namePlaceholder")}
            />
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.permissions.fieldDescriptionId")}</span>
            <input
              className="urus-input urus-input-mono"
              value={roleDraft.descriptionId}
              onChange={(e) => setRoleDraft({ ...roleDraft, descriptionId: e.target.value })}
              placeholder={t("console.permissions.descIdPlaceholderRole")}
            />
          </label>
          <div className="urus-field">
            <span className="urus-field-label">{t("console.permissions.permissionsLabel")}</span>
            {Array.from(permissionGroups.entries()).map(([group, perms]) => (
              <div key={group} style={{ marginBottom: "var(--space-2)" }}>
                <div className="urus-perm-group">{group}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {perms.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={roleDraft.permissionIds.has(p.id)}
                      onChange={(checked) => {
                        const next = new Set(roleDraft.permissionIds);
                        if (checked) next.add(p.id);
                        else next.delete(p.id);
                        setRoleDraft({ ...roleDraft, permissionIds: next });
                      }}
                    >
                      <span className="urus-perm-key">{p.key}</span>
                    </Checkbox>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}
