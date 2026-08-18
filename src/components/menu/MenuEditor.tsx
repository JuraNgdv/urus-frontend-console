"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { LOCALES, emptyTranslations } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { LocaleTranslationFields } from "@/components/ui/LocaleTranslationFields";
import { cardStyle, ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { createBlock, deleteBlock, getMenuFull, moveBlock, updateBlock } from "@/lib/api/menus";
import { getKeyboardFull, listKeyboards } from "@/lib/api/keyboards";
import { getTranslationsBatch, getTranslationsForKey, putTranslation, splitRefIntoNamespaceKey } from "@/lib/api/i18n";
import { buildBlockContent, generateBlockRef, getBlockRef } from "@/lib/blockContent";
import { conditionToText, textToCondition } from "@/lib/condition";
import { permsToText, textToPerms } from "@/lib/permList";
import { groupBlocksByRichGroup, richGroupOf } from "@/lib/richMessage";
import { RichMessageEditor } from "./RichMessageEditor";
import type { BlockCreateRequest, BlockFull, BlockUpdateRequest, MenuBlockType } from "@/lib/types";

const BLOCK_TYPES: MenuBlockType[] = [
  "TEXT",
  "PHOTO",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "POLL",
  "ALBUM",
  "RICH_TEXT",
  "LOCATION",
];

type RenderItem = { kind: "block"; block: BlockFull } | { kind: "group"; groupId: string; blocks: BlockFull[] };

interface DraftBlock {
  id: string | null;
  type: MenuBlockType;
  // Auto-generated (new blocks) or loaded as-is (existing blocks) — never
  // hand-edited, so there's no field for it in the modal.
  ref: string;
  translations: Record<string, string>;
  keyboardId: string;
  conditionText: string;
  permissionsText: string;
  separate: boolean;
  persistent: boolean;
}

function draftFromBlock(block: BlockFull | null, menuKey: string): DraftBlock {
  if (!block) {
    return {
      id: null,
      type: "TEXT",
      ref: generateBlockRef(menuKey),
      translations: emptyTranslations(),
      keyboardId: "",
      conditionText: "",
      permissionsText: "",
      separate: true,
      persistent: false,
    };
  }
  return {
    id: block.id,
    type: block.type,
    ref: getBlockRef(block.type, block.content),
    translations: emptyTranslations(),
    keyboardId: block.keyboard_id ?? "",
    conditionText: conditionToText(block.condition),
    permissionsText: permsToText(block.permissions),
    separate: block.is_separate,
    persistent: block.persistent,
  };
}

export function MenuEditor({ menuKey }: { menuKey: string }) {
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

  const menuQuery = useQuery({
    queryKey: ["menu", tenantId, menuKey],
    queryFn: () => getMenuFull(tenantId, menuKey, token!),
    enabled: !!token && !!tenantId,
  });

  const keyboardsQuery = useQuery({
    queryKey: ["keyboards", tenantId],
    queryFn: () => listKeyboards(tenantId, token!),
    enabled: !!token && !!tenantId,
  });

  const blocks = useMemo(
    () => (menuQuery.data?.blocks ?? []).slice().sort((a, b) => a.order_index - b.order_index),
    [menuQuery.data],
  );

  const richGroups = useMemo(() => groupBlocksByRichGroup(blocks), [blocks]);

  // Blocks that belong to the same rich message collapse into a single
  // render item so the block list stays readable and has one edit entry
  // point instead of N separate RICH_TEXT/PHOTO/VIDEO cards.
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const seen = new Set<string>();
    for (const block of blocks) {
      const group = richGroupOf(block);
      if (group) {
        if (seen.has(group)) continue;
        seen.add(group);
        items.push({ kind: "group", groupId: group, blocks: richGroups.get(group) ?? [block] });
      } else {
        items.push({ kind: "block", block });
      }
    }
    return items;
  }, [blocks, richGroups]);

  const keyboardIdToKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const kb of keyboardsQuery.data ?? []) map.set(kb.id, kb.key);
    return map;
  }, [keyboardsQuery.data]);

  const referencedKeyboardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const b of blocks) {
      if (b.keyboard_id) {
        const key = keyboardIdToKey.get(b.keyboard_id);
        if (key) keys.add(key);
      }
    }
    return Array.from(keys);
  }, [blocks, keyboardIdToKey]);

  const keyboardFullQueries = useQueries({
    queries: referencedKeyboardKeys.map((key) => ({
      queryKey: ["keyboardFull", tenantId, key],
      queryFn: () => getKeyboardFull(tenantId, key, token!),
      enabled: !!token && !!tenantId,
    })),
  });

  const keyboardsByKey = useMemo(() => {
    const map = new Map<string, (typeof keyboardFullQueries)[number]["data"]>();
    referencedKeyboardKeys.forEach((key, i) => {
      const data = keyboardFullQueries[i]?.data;
      if (data) map.set(key, data);
    });
    return map;
  }, [referencedKeyboardKeys, keyboardFullQueries]);

  const translationRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const b of blocks) {
      const ref = getBlockRef(b.type, b.content);
      if (ref) refs.add(ref);
    }
    for (const kb of keyboardsByKey.values()) {
      for (const row of kb?.rows ?? []) {
        for (const btn of row.buttons) refs.add(`${btn.text_namespace}.${btn.text_key}`);
      }
    }
    return Array.from(refs);
  }, [blocks, keyboardsByKey]);

  const translationsQuery = useQuery({
    queryKey: ["translationsBatch", tenantId, contentLocale, translationRefs],
    queryFn: () => getTranslationsBatch(tenantId, contentLocale, translationRefs, token!),
    enabled: !!token && !!tenantId && translationRefs.length > 0,
  });

  // Tenant content lookup (block/button text by ref) — distinct from `t()`
  // above, which is this UI's own copy (see SystemI18nContext).
  function blockText(ref: string): string {
    if (!ref) return "";
    return translationsQuery.data?.translations[ref] ?? "";
  }

  const [modalBlock, setModalBlock] = useState<DraftBlock | null>(null);
  const [richGroup, setRichGroup] = useState<BlockFull[] | null | undefined>(undefined);

  // Opens the edit modal immediately (blank translation fields, as before),
  // then fills them in once the per-ref locale dict comes back. Guarded by
  // reference equality against the blank object draftFromBlock handed out —
  // onChange always replaces that reference with a new object, so if the
  // admin already started typing before the fetch resolved, this leaves
  // their edits alone instead of clobbering them.
  async function openEditBlock(block: BlockFull) {
    const draft = draftFromBlock(block, menuKey);
    const blankTranslations = draft.translations;
    setModalBlock(draft);
    if (!draft.ref) return;
    try {
      const locales = await getTranslationsForKey(tenantId, draft.ref, token!);
      setModalBlock((prev) =>
        prev && prev.id === block.id
          ? { ...prev, translations: prev.translations === blankTranslations ? locales : prev.translations }
          : prev,
      );
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("console.menus.toast.loadTranslationsFailed"));
    }
  }

  const moveMutation = useMutation({
    mutationFn: async ({ blockIds, startIndex }: { blockIds: string[]; startIndex: number }) => {
      for (let i = 0; i < blockIds.length; i++) {
        await moveBlock(tenantId, menuKey, blockIds[i], startIndex + i, token!);
      }
    },
    onSuccess: () => {
      flash(t("console.menus.toast.blockMoved"));
      queryClient.invalidateQueries({ queryKey: ["menu", tenantId, menuKey] });
    },
  });

  // Dragging a merged rich-message item moves every underlying block
  // together, landing them at consecutive target indexes so the group stays
  // contiguous (required for it to keep collapsing into one card).
  const applyReorder = useDragReorder((from, to) => {
    if (!menuQuery.data) return;
    const previous = menuQuery.data;
    const reorderedItems = reorder(renderItems, from, to);
    const nextBlocks = reorderedItems.flatMap((item) => (item.kind === "group" ? item.blocks : [item.block]));
    queryClient.setQueryData(["menu", tenantId, menuKey], { ...previous, blocks: nextBlocks });

    const movedItem = reorderedItems[to];
    const movedIds = movedItem.kind === "group" ? movedItem.blocks.map((b) => b.id) : [movedItem.block.id];
    const startIndex = nextBlocks.findIndex((b) => b.id === movedIds[0]);

    moveMutation.mutate(
      { blockIds: movedIds, startIndex },
      {
        onError: () => {
          queryClient.setQueryData(["menu", tenantId, menuKey], previous);
          flash(t("console.menus.toast.moveFailed"));
        },
      },
    );
  });

  const deleteMutation = useMutation({
    mutationFn: (blockId: string) => deleteBlock(tenantId, menuKey, blockId, token!),
    onSuccess: () => {
      flash(t("console.menus.toast.blockDeleted"));
      queryClient.invalidateQueries({ queryKey: ["menu", tenantId, menuKey] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.menus.toast.deleteFailed")),
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: DraftBlock) => {
      const content = buildBlockContent(draft.type, draft.ref);
      if (draft.id) {
        const update: BlockUpdateRequest = {
          content,
          keyboard_id: draft.keyboardId || null,
          is_separate: draft.separate,
          persistent: draft.persistent,
          condition: textToCondition(draft.conditionText),
          permissions: textToPerms(draft.permissionsText),
        };
        await updateBlock(tenantId, menuKey, draft.id, update, token!);
      } else {
        const create: BlockCreateRequest = {
          type: draft.type,
          content,
          keyboard_id: draft.keyboardId || null,
          is_separate: draft.separate,
          persistent: draft.persistent,
          condition: textToCondition(draft.conditionText),
          permissions: textToPerms(draft.permissionsText),
        };
        await createBlock(tenantId, menuKey, create, token!);
      }
      if (canI18n && draft.ref) {
        const { namespace, key } = splitRefIntoNamespaceKey(draft.ref);
        for (const l of LOCALES) {
          const val = draft.translations[l.code]?.trim();
          if (val) await putTranslation(tenantId, namespace, key, l.code, val, token!);
        }
      }
    },
    onSuccess: (_data, draft) => {
      flash(draft.id ? t("console.menus.toast.blockSaved") : t("console.menus.toast.blockAdded"));
      queryClient.invalidateQueries({ queryKey: ["menu", tenantId, menuKey] });
      queryClient.invalidateQueries({ queryKey: ["translationsBatch", tenantId, contentLocale] });
      setModalBlock(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.menus.toast.saveFailed")),
  });

  if (menuQuery.isLoading) {
    return (
      <main className="urus-editor-main">
        <p className="urus-lede">{t("console.common.loading")}</p>
      </main>
    );
  }
  if (menuQuery.isError || !menuQuery.data) {
    return (
      <main className="urus-editor-main">
        <p className="urus-lede">{t("console.menus.notFound")}</p>
      </main>
    );
  }

  const menu = menuQuery.data;

  return (
    <main className="urus-editor-main">
      <section>
        <button type="button" className="urus-back-link" onClick={() => router.push("/menus")}>
          ← {t("console.list.menus")}
        </button>
        <h1 className="urus-editor-title">
          {menu.key}
          <span className="urus-version-tag">v{menu.version}</span>
        </h1>
        <p className="urus-lede" style={{ maxWidth: "60ch" }}>
          {menu.description}
        </p>

        <div className="urus-editor-toolbar">
          <span className="urus-toolbar-label">{t("console.menus.toolbarBlocks")}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={smallPrimaryBtn()} onClick={() => setRichGroup(null)}>
              {t("console.menus.addRichMessage")}
            </button>
            <button type="button" style={smallPrimaryBtn()} onClick={() => setModalBlock(draftFromBlock(null, menuKey))}>
              {t("console.menus.addBlock")}
            </button>
          </div>
        </div>

        <div className="urus-card-list">
          {renderItems.map((item, i) => {
            const { dragging, ...dragProps } = applyReorder(i);

            if (item.kind === "group") {
              const groupBlocks = item.blocks;
              return (
                <div key={item.groupId} {...dragProps} style={cardStyle(dragging)}>
                  <div className="urus-card-head">
                    <span className="urus-card-index">☰ {i}</span>
                    <span className="urus-card-type">{t("console.menus.richMessageCount", { count: groupBlocks.length })}</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" style={ghostBtn()} onClick={() => setRichGroup(groupBlocks)}>
                      {t("console.common.edit")}
                    </button>
                    <button
                      type="button"
                      style={ghostBtn()}
                      onClick={() => groupBlocks.forEach((b) => deleteMutation.mutate(b.id))}
                    >
                      {t("console.common.delete")}
                    </button>
                  </div>
                  <p className="urus-card-text">
                    {groupBlocks.map((b) => blockText(getBlockRef(b.type, b.content)) || b.type).join(" · ")}
                  </p>
                </div>
              );
            }

            const block = item.block;
            const ref = getBlockRef(block.type, block.content);
            const kb = block.keyboard_id ? keyboardIdToKey.get(block.keyboard_id) : null;
            return (
              <div key={block.id} {...dragProps} style={cardStyle(dragging)}>
                <div className="urus-card-head">
                  <span className="urus-card-index">☰ {i}</span>
                  <span className="urus-card-type">{block.type}</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" style={ghostBtn()} onClick={() => openEditBlock(block)}>
                    {t("console.common.edit")}
                  </button>
                  <button type="button" style={ghostBtn()} onClick={() => deleteMutation.mutate(block.id)}>
                    {t("console.common.delete")}
                  </button>
                </div>
                <p className="urus-card-text">{blockText(ref) || t("console.menus.noTranslation")}</p>
                <div className="urus-card-tags">
                  {kb && (
                    <button
                      type="button"
                      className="urus-tag-accent-outline"
                      onClick={() => router.push(`/keyboards/${encodeURIComponent(kb)}`)}
                    >
                      ⌨ {kb} →
                    </button>
                  )}
                  {block.condition && (
                    <span className="urus-tag-dashed">
                      {t("console.menus.ifCondition", { condition: conditionToText(block.condition) })}
                    </span>
                  )}
                  {block.permissions && block.permissions.length > 0 && (
                    <span className="urus-tag-outline-soft">🔒 {block.permissions.join(", ")}</span>
                  )}
                </div>
              </div>
            );
          })}
          {renderItems.length === 0 && <p className="urus-lede">{t("console.menus.noBlocks")}</p>}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {blocks.map((block) => {
            const ref = getBlockRef(block.type, block.content);
            const kb = block.keyboard_id ? keyboardIdToKey.get(block.keyboard_id) : null;
            const kbFull = kb ? keyboardsByKey.get(kb) : null;
            return (
              <div key={block.id} className="urus-preview-block">
                {block.type !== "TEXT" && block.type !== "RICH_TEXT" && (
                  <div className="urus-preview-media">{block.type}</div>
                )}
                <div className="urus-preview-text">{blockText(ref) || ref || "—"}</div>
                {kbFull && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", maxWidth: 320 }}>
                    {kbFull.rows.map((row) => (
                      <div key={row.id} className="urus-preview-kb-row">
                        {row.type === "DYNAMIC" ? (
                          <span className="urus-preview-kb-btn">· {row.source} ·</span>
                        ) : (
                          row.buttons.map((btn) => (
                            <span key={btn.id} className="urus-preview-kb-btn">
                              {blockText(`${btn.text_namespace}.${btn.text_key}`) || btn.text_key}
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
      </aside>

      {modalBlock && (
        <Modal
          title={modalBlock.id ? t("console.menus.editBlockTitle") : t("console.menus.newBlockTitle")}
          onClose={() => setModalBlock(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate(modalBlock)}
              >
                {t("console.common.save")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setModalBlock(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <label className="urus-field">
            <span className="urus-field-label">{t("console.menus.fieldType")}</span>
            <select
              className="urus-select"
              value={modalBlock.type}
              disabled={!!modalBlock.id}
              onChange={(e) => setModalBlock({ ...modalBlock, type: e.target.value as MenuBlockType })}
            >
              {BLOCK_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
            {modalBlock.id && <span className="urus-field-hint">{t("console.menus.typeLocked")}</span>}
          </label>
          <div className="urus-field">
            <span className="urus-field-label">{t("console.common.translations")}</span>
            <LocaleTranslationFields
              values={modalBlock.translations}
              disabled={!canI18n}
              onChange={(code, value) =>
                setModalBlock({ ...modalBlock, translations: { ...modalBlock.translations, [code]: value } })
              }
            />
            <span className="urus-field-hint">
              {canI18n ? t("console.common.translationHintEditable") : t("console.common.translationHintReadonly")}
            </span>
          </div>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.menus.fieldKeyboard")}</span>
            <select
              className="urus-select"
              value={modalBlock.keyboardId}
              onChange={(e) => setModalBlock({ ...modalBlock, keyboardId: e.target.value })}
            >
              <option value="">—</option>
              {(keyboardsQuery.data ?? []).map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.key}
                </option>
              ))}
            </select>
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.common.fieldCondition")}</span>
            <input
              className="urus-input"
              value={modalBlock.conditionText}
              onChange={(e) => setModalBlock({ ...modalBlock, conditionText: e.target.value })}
              placeholder={t("console.common.conditionPlaceholder")}
            />
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.common.fieldPermissions")}</span>
            <input
              className="urus-input"
              value={modalBlock.permissionsText}
              onChange={(e) => setModalBlock({ ...modalBlock, permissionsText: e.target.value })}
              placeholder={t("console.common.permissionsPlaceholderVisibleAll")}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={modalBlock.separate}
              onChange={(e) => setModalBlock({ ...modalBlock, separate: e.target.checked })}
            />
            <span className="urus-field-label" style={{ marginBottom: 0 }}>
              {t("console.common.separateMessage")}
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={modalBlock.persistent}
              onChange={(e) => setModalBlock({ ...modalBlock, persistent: e.target.checked })}
            />
            <span className="urus-field-label" style={{ marginBottom: 0 }}>
              {t("console.common.persistent")}
            </span>
          </label>
        </Modal>
      )}

      {richGroup !== undefined && <RichMessageEditor menuKey={menuKey} group={richGroup} onClose={() => setRichGroup(undefined)} />}
    </main>
  );
}
