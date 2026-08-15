"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { LOCALES } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { ghostBtn, primaryBtn, smallPrimaryBtn, cardStyle } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { createBlock, deleteBlock, updateBlock } from "@/lib/api/menus";
import { listKeyboards } from "@/lib/api/keyboards";
import { getTranslationsBatch, putTranslation, splitRefIntoNamespaceKey } from "@/lib/api/i18n";
import { attachMedia, listMediaAttachments, mediaUrl, uploadMedia } from "@/lib/api/media";
import { buildBlockContent, getBlockRef } from "@/lib/blockContent";
import { conditionToText, textToCondition } from "@/lib/condition";
import { permsToText, textToPerms } from "@/lib/permList";
import {
  blockToSegment,
  blockTypeForKind,
  createSegment,
  richGroupOf,
  sanitizeTelegramHtml,
  tableRowsToPreHtml,
} from "@/lib/richMessage";
import type { RichSegment, RichSegmentKind, MediaSegment } from "@/lib/richMessage";
import type { BlockCreateRequest, BlockFull } from "@/lib/types";

interface GroupSettings {
  keyboardId: string;
  conditionText: string;
  permissionsText: string;
  persistent: boolean;
  separate: boolean;
}

function groupSettingsFrom(group: BlockFull[] | null): GroupSettings {
  const first = group?.[0];
  if (!first) return { keyboardId: "", conditionText: "", permissionsText: "", persistent: false, separate: true };
  return {
    keyboardId: first.keyboard_id ?? "",
    conditionText: conditionToText(first.condition),
    permissionsText: permsToText(first.permissions),
    persistent: first.persistent,
    separate: first.is_separate,
  };
}

// Namespace is always the constant "menus" — mirrors generateBlockRef's
// scheme for single-block refs, e.g. "menus.main.rich_a1b2c3d4_0".
function nextRef(menuKey: string, groupId: string, index: number): string {
  return `menus.${menuKey}.rich_${groupId.slice(0, 8)}_${index}`;
}

function wrapSelection(textareaId: string, before: string, after: string, onChange: (next: string) => void) {
  const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  if (!el) return;
  const { selectionStart, selectionEnd, value } = el;
  const selected = value.slice(selectionStart, selectionEnd);
  onChange(value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd));
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = selectionStart + before.length;
    el.selectionEnd = selectionStart + before.length + selected.length;
  });
}

const FORMAT_BUTTONS: { label: string; before: string; after: string }[] = [
  { label: "B", before: "<b>", after: "</b>" },
  { label: "I", before: "<i>", after: "</i>" },
  { label: "U", before: "<u>", after: "</u>" },
  { label: "S", before: "<s>", after: "</s>" },
  { label: "</>", before: "<code>", after: "</code>" },
  { label: "❝", before: "<blockquote>", after: "</blockquote>" },
  { label: "•", before: "<tg-spoiler>", after: "</tg-spoiler>" },
];

function RichTextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useSystemT();

  return (
    <div className="urus-field">
      <span className="urus-field-label">{label}</span>
      <div className="urus-rich-toolbar">
        {FORMAT_BUTTONS.map((b) => (
          <button key={b.label} type="button" style={ghostBtn()} onClick={() => wrapSelection(id, b.before, b.after, onChange)}>
            {b.label}
          </button>
        ))}
        <button
          type="button"
          style={ghostBtn()}
          onClick={() => {
            const url = window.prompt(t("console.richMessage.urlPrompt"));
            if (!url) return;
            wrapSelection(id, `<a href="${url.replace(/"/g, "&quot;")}">`, "</a>", onChange);
          }}
        >
          🔗
        </button>
      </div>
      <textarea
        id={id}
        className="urus-input urus-input-mono urus-rich-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
      {value && <div className="urus-rich-preview" dangerouslySetInnerHTML={{ __html: sanitizeTelegramHtml(value) }} />}
    </div>
  );
}

function TableGridEditor({ rows, onChange }: { rows: string[][]; onChange: (rows: string[][]) => void }) {
  const t = useSystemT();
  const cols = rows[0]?.length ?? 0;

  function setCell(r: number, c: number, v: string) {
    const next = rows.map((row) => row.slice());
    next[r][c] = v;
    onChange(next);
  }

  return (
    <div className="urus-rich-table">
      <table className="urus-rich-table-grid">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>
                  <input className="urus-input" value={cell} onChange={(e) => setCell(r, c, e.target.value)} />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  style={ghostBtn()}
                  disabled={rows.length <= 1}
                  onClick={() => onChange(rows.filter((_, i) => i !== r))}
                >
                  {t("console.richMessage.tableRemoveRow")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" style={ghostBtn()} onClick={() => onChange([...rows, Array(cols).fill("")])}>
          {t("console.richMessage.tableAddRow")}
        </button>
        <button type="button" style={ghostBtn()} onClick={() => onChange(rows.map((row) => [...row, ""]))}>
          {t("console.richMessage.tableAddCol")}
        </button>
        <button
          type="button"
          style={ghostBtn()}
          disabled={cols <= 1}
          onClick={() => onChange(rows.map((row) => row.slice(0, -1)))}
        >
          {t("console.richMessage.tableRemoveCol")}
        </button>
      </div>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

function MediaSegmentEditor({ segment, onChange }: { segment: MediaSegment; onChange: (next: MediaSegment) => void }) {
  const t = useSystemT();
  const objectUrl = useObjectUrl(segment.file);
  const existing = segment.existing[0];

  if (segment.entityType !== "block") {
    return <p className="urus-field-hint">{t("console.richMessage.mediaDynamic", { entityType: segment.entityType })}</p>;
  }

  if (existing) {
    return (
      <div className="urus-rich-media-preview">
        {segment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(existing.media)} alt="" />
        ) : (
          <video src={mediaUrl(existing.media)} controls />
        )}
        <span className="urus-field-hint">
          {t("console.richMessage.mediaReplaceUnsupported", {
            filename: existing.media.original_filename ?? existing.media.id,
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="urus-rich-media-preview">
      {objectUrl &&
        (segment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt="" />
        ) : (
          <video src={objectUrl} controls />
        ))}
      <input
        type="file"
        accept={segment.kind === "image" ? "image/*" : "video/*"}
        onChange={(e) => onChange({ ...segment, file: e.target.files?.[0] ?? null })}
      />
    </div>
  );
}

export function RichMessageEditor({
  menuKey,
  group,
  onClose,
}: {
  menuKey: string;
  group: BlockFull[] | null;
  onClose: () => void;
}) {
  const { token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";
  const canI18n = permissions.includes("translations.manage");

  const [groupId] = useState(() => (group?.[0] ? (richGroupOf(group[0]) ?? crypto.randomUUID()) : crypto.randomUUID()));
  const [segments, setSegments] = useState<RichSegment[] | null>(group ? null : []);
  const [groupSettings, setGroupSettings] = useState<GroupSettings>(() => groupSettingsFrom(group));

  const keyboardsQuery = useQuery({
    queryKey: ["keyboards", tenantId],
    queryFn: () => listKeyboards(tenantId, token!),
    enabled: !!token && !!tenantId,
  });

  const refs = Array.from(new Set((group ?? []).map((b) => getBlockRef(b.type, b.content)).filter(Boolean)));
  // One query per content locale — segment text/caption fields edit every
  // language at once, so every language's current value has to be loaded up front.
  const translationsByLocaleQueries = useQueries({
    queries: LOCALES.map((l) => ({
      queryKey: ["translationsBatch", tenantId, l.code, refs],
      queryFn: () => getTranslationsBatch(tenantId, l.code, refs, token!),
      enabled: !!token && !!tenantId && !!group,
    })),
  });

  const mediaBlocks = (group ?? []).filter((b) => b.type === "PHOTO" || b.type === "VIDEO");
  const attachmentsQueries = useQueries({
    queries: mediaBlocks.map((b) => ({
      queryKey: ["mediaAttachments", tenantId, b.id],
      queryFn: () => listMediaAttachments(tenantId, "block", b.id, token!),
      enabled: !!token && !!tenantId,
    })),
  });

  useEffect(() => {
    if (!group || segments !== null) return;
    if (translationsByLocaleQueries.some((q) => q.isLoading)) return;
    if (attachmentsQueries.some((q) => q.isLoading)) return;
    const attachmentsByBlockId = new Map(mediaBlocks.map((b, i) => [b.id, attachmentsQueries[i]?.data ?? []]));
    const next = group.map((block) => {
      const ref = getBlockRef(block.type, block.content);
      const textByLocale: Record<string, string> = {};
      LOCALES.forEach((l, i) => {
        textByLocale[l.code] = translationsByLocaleQueries[i]?.data?.translations[ref] ?? "";
      });
      return blockToSegment(block, textByLocale, attachmentsByBlockId.get(block.id) ?? []);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSegments(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, segments, translationsByLocaleQueries, attachmentsQueries]);

  const applyReorder = useDragReorder((from, to) => {
    setSegments((prev) => (prev ? reorder(prev, from, to) : prev));
  });

  function addSegment(kind: RichSegmentKind) {
    setSegments((prev) => {
      const list = prev ?? [];
      return [...list, createSegment(kind, nextRef(menuKey, groupId, list.length))];
    });
  }

  function updateSegment(index: number, next: RichSegment) {
    setSegments((prev) => (prev ?? []).map((s, i) => (i === index ? next : s)));
  }

  function removeSegment(index: number) {
    setSegments((prev) => (prev ?? []).filter((_, i) => i !== index));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const list = segments ?? [];
      const keyboardId = groupSettings.keyboardId || null;
      const condition = textToCondition(groupSettings.conditionText);
      const permissionsList = textToPerms(groupSettings.permissionsText);
      const originalMeta = new Map((group ?? []).map((b) => [b.id, b.meta ?? {}]));
      const kept = new Set(list.filter((s) => s.blockId).map((s) => s.blockId as string));

      for (const block of group ?? []) {
        if (!kept.has(block.id)) await deleteBlock(tenantId, menuKey, block.id, token!);
      }

      for (let i = 0; i < list.length; i++) {
        const segment = list[i];
        const type = blockTypeForKind(segment.kind);
        const content = buildBlockContent(
          type,
          segment.ref,
          segment.kind === "image" || segment.kind === "video" ? segment.entityType : undefined,
        );
        const baseMeta = segment.blockId ? (originalMeta.get(segment.blockId) ?? {}) : {};
        const meta: Record<string, unknown> = { ...baseMeta, rich_group: groupId };
        if (segment.kind === "table") meta.table_grid = segment.rows;
        else delete meta.table_grid;

        const common = {
          content,
          keyboard_id: keyboardId,
          is_separate: i === 0 ? groupSettings.separate : false,
          persistent: groupSettings.persistent,
          condition,
          permissions: permissionsList,
          meta,
        };

        let blockId = segment.blockId;
        if (blockId) {
          await updateBlock(tenantId, menuKey, blockId, common, token!);
        } else {
          const created = await createBlock(tenantId, menuKey, { type, ...common } as BlockCreateRequest, token!);
          blockId = created.id;
        }

        if ((segment.kind === "image" || segment.kind === "video") && segment.entityType === "block" && segment.file) {
          const media = await uploadMedia(tenantId, segment.file, token!);
          await attachMedia(tenantId, "block", blockId, media.id, 0, token!);
        }

        if (canI18n && segment.ref) {
          const { namespace, key } = splitRefIntoNamespaceKey(segment.ref);
          if (segment.kind === "table") {
            // Table cells aren't per-locale (see richMessage.ts) — the same
            // rendered grid saves under every content locale.
            const value = tableRowsToPreHtml(segment.rows);
            if (value) {
              for (const l of LOCALES) await putTranslation(tenantId, namespace, key, l.code, value, token!);
            }
          } else {
            const byLocale = segment.kind === "text" ? segment.html : segment.caption;
            for (const l of LOCALES) {
              const value = byLocale[l.code]?.trim();
              if (value) await putTranslation(tenantId, namespace, key, l.code, sanitizeTelegramHtml(value), token!);
            }
          }
        }
      }
    },
    onSuccess: () => {
      flash(group ? t("console.richMessage.toast.saved") : t("console.richMessage.toast.added"));
      queryClient.invalidateQueries({ queryKey: ["menu", tenantId, menuKey] });
      queryClient.invalidateQueries({ queryKey: ["translationsBatch", tenantId] });
      onClose();
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.richMessage.toast.saveFailed")),
  });

  if (group && segments === null) {
    return (
      <Modal title={t("console.richMessage.loadingTitle")} onClose={onClose}>
        <p className="urus-lede">{t("console.common.loading")}</p>
      </Modal>
    );
  }

  const list = segments ?? [];

  return (
    <Modal
      title={group ? t("console.richMessage.editTitle") : t("console.richMessage.newTitle")}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={primaryBtn()} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t("console.common.save")}
          </button>
          <button type="button" style={ghostBtn()} onClick={onClose}>
            {t("console.common.cancel")}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={smallPrimaryBtn()} onClick={() => addSegment("text")}>
          {t("console.richMessage.addText")}
        </button>
        <button type="button" style={smallPrimaryBtn()} onClick={() => addSegment("image")}>
          {t("console.richMessage.addPhoto")}
        </button>
        <button type="button" style={smallPrimaryBtn()} onClick={() => addSegment("video")}>
          {t("console.richMessage.addVideo")}
        </button>
        <button type="button" style={smallPrimaryBtn()} onClick={() => addSegment("table")}>
          {t("console.richMessage.addTable")}
        </button>
      </div>

      <div className="urus-card-list">
        {list.map((segment, i) => {
          const { draggable, onDragStart, onDragOver, onDrop, onDragEnd, dragging } = applyReorder(i);
          return (
            <div key={segment.key} onDragOver={onDragOver} onDrop={onDrop} style={cardStyle(dragging)}>
              <div className="urus-card-head">
                <span
                  className="urus-card-index"
                  draggable={draggable}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  style={{ cursor: "grab" }}
                >
                  ☰ {i}
                </span>
                <span className="urus-card-type">{segment.kind.toUpperCase()}</span>
                <div style={{ flex: 1 }} />
                <button type="button" style={ghostBtn()} onClick={() => removeSegment(i)}>
                  {t("console.common.delete")}
                </button>
              </div>
              {segment.kind === "text" &&
                LOCALES.map((l) => (
                  <RichTextField
                    key={l.code}
                    id={`rich-text-${segment.key}-${l.code}`}
                    label={t("console.richMessage.textFieldLabel", { locale: l.label })}
                    value={segment.html[l.code] ?? ""}
                    onChange={(html) => updateSegment(i, { ...segment, html: { ...segment.html, [l.code]: html } })}
                  />
                ))}
              {segment.kind === "table" && <TableGridEditor rows={segment.rows} onChange={(rows) => updateSegment(i, { ...segment, rows })} />}
              {(segment.kind === "image" || segment.kind === "video") && (
                <>
                  <label className="urus-field">
                    <span className="urus-field-label">{t("console.richMessage.fieldEntityType")}</span>
                    <input
                      className="urus-input urus-input-mono"
                      value={segment.entityType}
                      onChange={(e) => updateSegment(i, { ...segment, entityType: e.target.value, file: null })}
                      placeholder="block"
                    />
                    <span className="urus-field-hint">{t("console.richMessage.entityTypeHint")}</span>
                  </label>
                  <MediaSegmentEditor segment={segment} onChange={(next) => updateSegment(i, next)} />
                  {LOCALES.map((l) => (
                    <RichTextField
                      key={l.code}
                      id={`rich-caption-${segment.key}-${l.code}`}
                      label={t("console.richMessage.captionFieldLabel", { locale: l.label })}
                      value={segment.caption[l.code] ?? ""}
                      onChange={(caption) =>
                        updateSegment(i, { ...segment, caption: { ...segment.caption, [l.code]: caption } })
                      }
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="urus-lede">{t("console.richMessage.noSegments")}</p>}
      </div>

      <label className="urus-field">
        <span className="urus-field-label">{t("console.menus.fieldKeyboard")}</span>
        <select
          className="urus-select"
          value={groupSettings.keyboardId}
          onChange={(e) => setGroupSettings({ ...groupSettings, keyboardId: e.target.value })}
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
          value={groupSettings.conditionText}
          onChange={(e) => setGroupSettings({ ...groupSettings, conditionText: e.target.value })}
          placeholder={t("console.common.conditionPlaceholder")}
        />
      </label>
      <label className="urus-field">
        <span className="urus-field-label">{t("console.common.fieldPermissions")}</span>
        <input
          className="urus-input"
          value={groupSettings.permissionsText}
          onChange={(e) => setGroupSettings({ ...groupSettings, permissionsText: e.target.value })}
          placeholder={t("console.common.permissionsPlaceholderVisibleAll")}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={groupSettings.separate}
          onChange={(e) => setGroupSettings({ ...groupSettings, separate: e.target.checked })}
        />
        <span className="urus-field-label" style={{ marginBottom: 0 }}>
          {t("console.common.separateMessage")}
        </span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={groupSettings.persistent}
          onChange={(e) => setGroupSettings({ ...groupSettings, persistent: e.target.checked })}
        />
        <span className="urus-field-label" style={{ marginBottom: 0 }}>
          {t("console.common.persistent")}
        </span>
      </label>
      {!canI18n && <p className="urus-field-hint">{t("console.richMessage.readonlyNotice")}</p>}
    </Modal>
  );
}
