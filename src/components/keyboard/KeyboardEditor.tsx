"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { LOCALES, emptyTranslations } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { LocaleTranslationFields } from "@/components/ui/LocaleTranslationFields";
import { cardStyle, ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { createButton, createRow, deleteButton, deleteRow, getKeyboardFull, updateButton } from "@/lib/api/keyboards";
import { listMenus } from "@/lib/api/menus";
import { getTranslationsBatch, getTranslationsForKey, putTranslation } from "@/lib/api/i18n";
import { buildActionPayload, describeAction, payloadFromButton } from "@/lib/buttonPayload";
import { permsToText, textToPerms } from "@/lib/permList";
import type { ButtonActionType, ButtonCreateRequest, ButtonFull, ButtonStyle, ButtonType, ButtonUpdateRequest } from "@/lib/types";

const ACTION_TYPES: ButtonActionType[] = ["NAVIGATE", "HOOK", "URL", "BACK"];
const BUTTON_TYPES: ButtonType[] = ["INLINE", "URL", "CONTACT", "WEB_APP"];
const BUTTON_STYLES: ButtonStyle[] = ["PRIMARY", "SUCCESS", "DANGER"];

interface DraftButton {
  id: string | null;
  rowId: string;
  // Auto-generated (new buttons) or loaded as-is (existing buttons) — never
  // hand-edited, so there's no field for either in the modal.
  textKey: string;
  namespace: string;
  translations: Record<string, string>;
  actionType: ButtonActionType;
  navigateMenu: string;
  hookHandler: string;
  url: string;
  buttonType: ButtonType;
  style: ButtonStyle | "";
  permissionsText: string;
}

// Namespace is always the constant "keyboards", with the keyboard key + a
// random slug as the key, e.g. "keyboards.main_menu.btn_a1b2c3d4" — mirrors
// generateBlockRef's scheme for menu blocks.
function generateButtonKey(kbKey: string): { namespace: string; textKey: string } {
  return { namespace: "keyboards", textKey: `${kbKey}.btn_${crypto.randomUUID().slice(0, 8)}` };
}

function draftFromButton(rowId: string, btn: ButtonFull | null, kbKey: string): DraftButton {
  if (!btn) {
    const generated = generateButtonKey(kbKey);
    return {
      id: null,
      rowId,
      textKey: generated.textKey,
      namespace: generated.namespace,
      translations: emptyTranslations(),
      actionType: "NAVIGATE",
      navigateMenu: "",
      hookHandler: "",
      url: "",
      buttonType: "INLINE",
      style: "",
      permissionsText: "",
    };
  }
  const payload = payloadFromButton(btn.action_type, btn.action_payload);
  return {
    id: btn.id,
    rowId,
    textKey: btn.text_key,
    namespace: btn.text_namespace,
    translations: emptyTranslations(),
    actionType: btn.action_type,
    navigateMenu: payload.navigateMenu,
    hookHandler: payload.hookHandler,
    url: payload.url,
    buttonType: btn.type,
    style: btn.style ?? "",
    permissionsText: permsToText(btn.permissions),
  };
}

export function KeyboardEditor({ kbKey }: { kbKey: string }) {
  const router = useRouter();
  const { token, claims, permissions } = useAuth();
  // Display locale for this editor's translation preview — independent of
  // the admin interface's own language (see LocaleContext).
  const [contentLocale, setContentLocale] = useState(LOCALES[0].code);
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";
  const canI18n = permissions.includes("translations.manage");

  const kbQuery = useQuery({
    queryKey: ["keyboardFull", tenantId, kbKey],
    queryFn: () => getKeyboardFull(tenantId, kbKey, token!),
    enabled: !!token && !!tenantId,
  });

  const menusQuery = useQuery({
    queryKey: ["menus", tenantId],
    queryFn: () => listMenus(tenantId, token!),
    enabled: !!token && !!tenantId,
  });

  const rows = useMemo(
    () => (kbQuery.data?.rows ?? []).slice().sort((a, b) => a.order_index - b.order_index),
    [kbQuery.data],
  );

  const translationRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const row of rows) {
      for (const btn of row.buttons) refs.add(`${btn.text_namespace}.${btn.text_key}`);
    }
    return Array.from(refs);
  }, [rows]);

  const translationsQuery = useQuery({
    queryKey: ["translationsBatch", tenantId, contentLocale, translationRefs],
    queryFn: () => getTranslationsBatch(tenantId, contentLocale, translationRefs, token!),
    enabled: !!token && !!tenantId && translationRefs.length > 0,
  });

  // Tenant content lookup (button text by namespace+key) — distinct from
  // `t()` above, which is this UI's own copy (see SystemI18nContext).
  function buttonText(namespace: string, key: string): string {
    return translationsQuery.data?.translations[`${namespace}.${key}`] ?? "";
  }

  const [modalButton, setModalButton] = useState<DraftButton | null>(null);

  // Opens the edit modal immediately (blank translation fields, as before),
  // then fills them in once the per-ref locale dict comes back. Guarded by
  // reference equality against the blank object draftFromButton handed out —
  // onChange always replaces that reference with a new object, so if the
  // admin already started typing before the fetch resolved, this leaves
  // their edits alone instead of clobbering them.
  async function openEditButton(rowId: string, btn: ButtonFull) {
    const draft = draftFromButton(rowId, btn, kbKey);
    const blankTranslations = draft.translations;
    setModalButton(draft);
    try {
      const locales = await getTranslationsForKey(tenantId, `${draft.namespace}.${draft.textKey}`, token!);
      setModalButton((prev) =>
        prev && prev.id === btn.id
          ? { ...prev, translations: prev.translations === blankTranslations ? locales : prev.translations }
          : prev,
      );
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("console.keyboards.toast.loadTranslationsFailed"));
    }
  }

  // No documented move endpoint for keyboard rows (see plan gap #1) — reorder
  // locally only, until a real persistence route exists.
  const applyReorder = useDragReorder((from, to) => {
    if (!kbQuery.data) return;
    const nextRows = reorder(rows, from, to);
    queryClient.setQueryData(["keyboardFull", tenantId, kbKey], { ...kbQuery.data, rows: nextRows });
    flash(t("console.keyboards.toast.reorderNotPersisted"));
  });

  const addRowMutation = useMutation({
    mutationFn: () => createRow(tenantId, kbKey, { type: "STATIC", buttons_per_row: 2, source: null }, token!),
    onSuccess: () => {
      flash(t("console.keyboards.toast.rowAdded"));
      queryClient.invalidateQueries({ queryKey: ["keyboardFull", tenantId, kbKey] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.keyboards.toast.addRowFailed")),
  });

  const deleteRowMutation = useMutation({
    mutationFn: (rowId: string) => deleteRow(tenantId, kbKey, rowId, token!),
    onSuccess: () => {
      flash(t("console.keyboards.toast.rowDeleted"));
      queryClient.invalidateQueries({ queryKey: ["keyboardFull", tenantId, kbKey] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.keyboards.toast.deleteRowFailed")),
  });

  const deleteButtonMutation = useMutation({
    mutationFn: ({ rowId, buttonId }: { rowId: string; buttonId: string }) =>
      deleteButton(tenantId, kbKey, rowId, buttonId, token!),
    onSuccess: () => {
      flash(t("console.keyboards.toast.buttonDeleted"));
      queryClient.invalidateQueries({ queryKey: ["keyboardFull", tenantId, kbKey] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.keyboards.toast.deleteButtonFailed")),
  });

  const saveButtonMutation = useMutation({
    mutationFn: async (draft: DraftButton) => {
      const actionPayload = buildActionPayload(draft.actionType, draft);
      if (draft.id) {
        const update: ButtonUpdateRequest = {
          text_key: draft.textKey,
          text_namespace: draft.namespace,
          action_type: draft.actionType,
          action_payload: actionPayload,
          type: draft.buttonType,
          style: draft.style || null,
          permissions: textToPerms(draft.permissionsText),
        };
        await updateButton(tenantId, kbKey, draft.rowId, draft.id, update, token!);
      } else {
        const create: ButtonCreateRequest = {
          text_key: draft.textKey,
          text_namespace: draft.namespace,
          action_type: draft.actionType,
          action_payload: actionPayload,
          type: draft.buttonType,
          style: draft.style || null,
          permissions: textToPerms(draft.permissionsText),
        };
        await createButton(tenantId, kbKey, draft.rowId, create, token!);
      }
      if (canI18n && draft.textKey) {
        for (const l of LOCALES) {
          const val = draft.translations[l.code]?.trim();
          if (val) await putTranslation(tenantId, draft.namespace, draft.textKey, l.code, val, token!);
        }
      }
    },
    onSuccess: (_data, draft) => {
      flash(draft.id ? t("console.keyboards.toast.buttonSaved") : t("console.keyboards.toast.buttonAdded"));
      queryClient.invalidateQueries({ queryKey: ["keyboardFull", tenantId, kbKey] });
      queryClient.invalidateQueries({ queryKey: ["translationsBatch", tenantId, contentLocale] });
      setModalButton(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.keyboards.toast.saveButtonFailed")),
  });

  if (kbQuery.isLoading) {
    return (
      <main className="urus-editor-main">
        <p className="urus-lede">{t("console.common.loading")}</p>
      </main>
    );
  }
  if (kbQuery.isError || !kbQuery.data) {
    return (
      <main className="urus-editor-main">
        <p className="urus-lede">{t("console.keyboards.notFound")}</p>
      </main>
    );
  }

  const kb = kbQuery.data;

  return (
    <main className="urus-editor-main">
      <section>
        <button type="button" className="urus-back-link" onClick={() => router.push("/keyboards")}>
          ← {t("console.list.keyboards")}
        </button>
        <h1 className="urus-editor-title">
          {kb.key}
          <span className="urus-version-tag">
            {kb.type} · v{kb.version}
          </span>
        </h1>
        <p className="urus-lede" style={{ maxWidth: "60ch" }}>
          {kb.description}
        </p>

        <div className="urus-editor-toolbar">
          <span className="urus-toolbar-label">{t("console.keyboards.toolbarRows")}</span>
          <button type="button" style={smallPrimaryBtn()} onClick={() => addRowMutation.mutate()}>
            {t("console.keyboards.addRow")}
          </button>
        </div>

        <div className="urus-card-list">
          {rows.map((row, i) => {
            const { dragging, ...dragProps } = applyReorder(i);
            return (
              <div key={row.id} {...dragProps} style={cardStyle(dragging)}>
                <div className="urus-card-head" style={{ marginBottom: "var(--space-3)" }}>
                  <span className="urus-card-index">☰ {i}</span>
                  <span className="urus-card-type">{row.type}</span>
                  <span className="urus-muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {row.type === "DYNAMIC"
                      ? t("console.keyboards.sourceLabel", { source: row.source ?? "" })
                      : t("console.keyboards.buttonsCount", { count: row.buttons.length })}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    style={ghostBtn()}
                    onClick={() => setModalButton(draftFromButton(row.id, null, kbKey))}
                  >
                    {t("console.keyboards.addButton")}
                  </button>
                  <button type="button" style={ghostBtn()} onClick={() => deleteRowMutation.mutate(row.id)}>
                    {t("console.common.delete")}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {row.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => openEditButton(row.id, btn)}
                      style={{
                        textAlign: "left",
                        background: "transparent",
                        border: "2px solid var(--t-line-soft, rgba(32,30,29,0.18))",
                        padding: "6px 10px",
                        cursor: "pointer",
                        color: "inherit",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 150,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{buttonText(btn.text_namespace, btn.text_key) || btn.text_key}</span>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--t-muted, #605d5d)" }}>
                        {describeAction(btn)}
                      </span>
                    </button>
                  ))}
                  {row.type === "DYNAMIC" && (
                    <span className="urus-tag-dashed">{t("console.keyboards.generatedFrom", { source: row.source ?? "" })}</span>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="urus-lede">{t("console.keyboards.noRows")}</p>}
        </div>
      </section>

      <aside className="urus-aside">
        <div className="urus-aside-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>{t("console.common.preview")}</span>
          <select
            className="urus-select"
            style={{ width: "auto" }}
            value={contentLocale}
            onChange={(e) => setContentLocale(e.target.value)}
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((row) => (
            <div key={row.id} className="urus-preview-kb-row">
              {row.type === "DYNAMIC" ? (
                <span className="urus-preview-kb-btn">· {row.source} ·</span>
              ) : (
                row.buttons.map((btn) => (
                  <span key={btn.id} className="urus-preview-kb-btn">
                    {buttonText(btn.text_namespace, btn.text_key) || btn.text_key}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
        
      </aside>

      {modalButton && (
        <Modal
          title={modalButton.id ? t("console.keyboards.editButtonTitle") : t("console.keyboards.newButtonTitle")}
          onClose={() => setModalButton(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={saveButtonMutation.isPending}
                onClick={() => saveButtonMutation.mutate(modalButton)}
              >
                {t("console.common.save")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setModalButton(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <div className="urus-field">
            <span className="urus-field-label">{t("console.common.translations")}</span>
            <LocaleTranslationFields
              values={modalButton.translations}
              disabled={!canI18n}
              onChange={(code, value) =>
                setModalButton({ ...modalButton, translations: { ...modalButton.translations, [code]: value } })
              }
            />
            <span className="urus-field-hint">
              {canI18n ? t("console.common.translationHintEditable") : t("console.common.translationHintReadonly")}
            </span>
          </div>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.keyboards.fieldActionType")}</span>
            <select
              className="urus-select"
              value={modalButton.actionType}
              onChange={(e) => setModalButton({ ...modalButton, actionType: e.target.value as ButtonActionType })}
            >
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {modalButton.actionType === "NAVIGATE" && (
            <label className="urus-field">
              <span className="urus-field-label">{t("console.keyboards.fieldTargetMenu")}</span>
              <select
                className="urus-select"
                value={modalButton.navigateMenu}
                onChange={(e) => setModalButton({ ...modalButton, navigateMenu: e.target.value })}
              >
                <option value="">—</option>
                {(menusQuery.data ?? []).map((m) => (
                  <option key={m.id} value={m.key}>
                    {m.key}
                  </option>
                ))}
              </select>
            </label>
          )}
          {modalButton.actionType === "HOOK" && (
            <label className="urus-field">
              <span className="urus-field-label">{t("console.keyboards.fieldHandler")}</span>
              <input
                className="urus-input urus-input-mono"
                value={modalButton.hookHandler}
                onChange={(e) => setModalButton({ ...modalButton, hookHandler: e.target.value })}
                placeholder={t("console.keyboards.handlerPlaceholder")}
              />
            </label>
          )}
          {modalButton.actionType === "URL" && (
            <label className="urus-field">
              <span className="urus-field-label">{t("console.keyboards.fieldUrl")}</span>
              <input
                className="urus-input urus-input-mono"
                value={modalButton.url}
                onChange={(e) => setModalButton({ ...modalButton, url: e.target.value })}
                placeholder={t("console.keyboards.urlPlaceholder")}
              />
            </label>
          )}
          <label className="urus-field">
            <span className="urus-field-label">{t("console.keyboards.fieldButtonType")}</span>
            <select
              className="urus-select"
              value={modalButton.buttonType}
              onChange={(e) => setModalButton({ ...modalButton, buttonType: e.target.value as ButtonType })}
            >
              {BUTTON_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.keyboards.fieldStyle")}</span>
            <select
              className="urus-select"
              value={modalButton.style}
              onChange={(e) => setModalButton({ ...modalButton, style: e.target.value as ButtonStyle | "" })}
            >
              <option value="">—</option>
              {BUTTON_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.common.fieldPermissions")}</span>
            <input
              className="urus-input"
              value={modalButton.permissionsText}
              onChange={(e) => setModalButton({ ...modalButton, permissionsText: e.target.value })}
              placeholder={t("console.keyboards.permissionsPlaceholder")}
            />
          </label>
          {modalButton.id && (
            <button
              type="button"
              style={ghostBtn()}
              onClick={() => {
                deleteButtonMutation.mutate({ rowId: modalButton.rowId, buttonId: modalButton.id! });
                setModalButton(null);
              }}
            >
              {t("console.keyboards.deleteButtonAction")}
            </button>
          )}
        </Modal>
      )}
    </main>
  );
}
