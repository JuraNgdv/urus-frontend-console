"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { LOCALES, emptyTranslations } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { LocaleTranslationFields } from "@/components/ui/LocaleTranslationFields";
import { cardStyle, ghostBtn, primaryBtn, smallPrimaryBtn, tabStyle, toggleStyle } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { deleteTranslation, getTranslationsBatch, putTranslation } from "@/lib/api/i18n";
import {
  bulkCreateNodes,
  createNode,
  deleteNode,
  getNodePath,
  listNodeChildren,
  reorderNodes,
  updateNode,
} from "@/lib/api/nodes";
import type { DiscountType, NodeBulkCreateItem, NodeResponse, NodeType } from "@/lib/types";

interface BulkImportNode {
  name: Record<string, string>;
  desc?: Record<string, string>;
  order_index?: number;
  price?: string;
  discountValue?: string;
  discountType?: DiscountType;
  children?: BulkImportNode[];
}

interface BulkImportResultRow {
  label: string;
  success: boolean;
  error: string | null;
}

// Textarea input is an indented outline, not JSON — nesting comes from
// leading whitespace, exactly like the example the format was designed
// around:
//
//   node Київ
//     name.en: Kyiv
//     desc.uk: Столиця України
//
//     node Оболонь
//       price: 20
//
// A "node <text>" line starts a node, setting its name for whichever locale
// is currently active in the toolbar; `key: value` / `key.locale: value`
// lines below it (until the next "node" line at the same or shallower
// indent) set its other properties. Blank lines are purely cosmetic.
function parseBulkImportOutline(text: string, currentLocale: string): BulkImportNode[] {
  const roots: BulkImportNode[] = [];
  const stack: { indent: number; node: BulkImportNode }[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();
    const lineNo = i + 1;

    if (content.startsWith("node ") || content === "node") {
      const name = content.slice(4).trim();
      if (!name) throw new Error(`Line ${lineNo}: "node" needs a name after it.`);
      const node: BulkImportNode = { name: { [currentLocale]: name } };
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
      if (stack.length === 0) roots.push(node);
      else {
        const parent = stack[stack.length - 1].node;
        parent.children = parent.children ?? [];
        parent.children.push(node);
      }
      stack.push({ indent, node });
      continue;
    }

    if (stack.length === 0) {
      throw new Error(`Line ${lineNo}: property line before any "node" line.`);
    }
    const node = stack[stack.length - 1].node;
    const colon = content.indexOf(":");
    if (colon === -1) throw new Error(`Line ${lineNo}: expected "key: value".`);
    const key = content.slice(0, colon).trim();
    const value = content.slice(colon + 1).trim();

    if (key.startsWith("name.")) node.name[key.slice(5)] = value;
    else if (key.startsWith("desc.")) node.desc = { ...node.desc, [key.slice(5)]: value };
    else if (key === "price") node.price = value;
    else if (key === "discount_value") node.discountValue = value;
    else if (key === "discount_type") {
      if (value !== "percent" && value !== "fixed") {
        throw new Error(`Line ${lineNo}: discount_type must be "percent" or "fixed".`);
      }
      node.discountType = value;
    } else if (key === "order_index") {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`Line ${lineNo}: order_index must be a number.`);
      node.order_index = n;
    } else {
      throw new Error(`Line ${lineNo}: unknown property "${key}".`);
    }
  }

  return roots;
}

const BULK_IMPORT_PLACEHOLDER = `node heparine
  name.en: Heparine💉
  name.ru: Гепарин💉
  name.uk: Гепарин💉
  desc.en: Natural anticoagulant
  desc.ru: Природный антикоагулянт
  desc.uk: Природний антикоагулянт

  node 20mg
    name.en: 20mg
    name.ru: 20мг
    name.uk: 20мг
    price: 20

  node 100mg
    name.en: 100mg
    name.ru: 100мг
    name.uk: 100мг
    price: 90

node vitamin_d
  name.en: Vitamin D💊
  name.ru: Витамин Д💊
  name.uk: Вітамін Д💊
  desc.en: Fat-soluble vitamin
  desc.ru: Жрорастворимый витамин
  desc.uk: Жиророзчинний вітамін
  ...`;

// Real multi-cursor editing isn't something a plain <textarea> can do — no
// amount of JS gets a second caret; that needs a full code-editor component
// (CodeMirror/Monaco), which is a much bigger dependency than this admin
// screen warrants. What a textarea *can* do is block indent/outdent (Tab /
// Shift+Tab over a selection) and rewriting every selected line at once —
// together they cover the actual workflow (paste names, select them, indent,
// stamp a prefix on all of them) without a new editor library.
function applyToSelectedLines(el: HTMLTextAreaElement, onChange: (v: string) => void, rewrite: (line: string) => string) {
  const { selectionStart, selectionEnd, value } = el;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const changed = lines.map(rewrite);
  const nextBlock = changed.join("\n");
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  onChange(next);

  const firstLineDelta = changed[0].length - lines[0].length;
  const totalDelta = nextBlock.length - block.length;
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = Math.max(lineStart, selectionStart + firstLineDelta);
    el.selectionEnd = selectionEnd + totalDelta;
  });
}

function indentLine(line: string, direction: 1 | -1): string {
  if (direction === 1) return "  " + line;
  if (line.startsWith("  ")) return line.slice(2);
  if (line.startsWith(" ")) return line.slice(1);
  return line;
}

interface NodeDraft {
  id: string | null;
  parentId: string | null;
  nameKey: string;
  nameTranslations: Record<string, string>;
  // Auto-generated from nameKey (see autoDescKey) for a new node, hidden from
  // the UI entirely; an existing node keeps whatever key it already has.
  descKey: string;
  // True only for a brand-new node — keeps descKey in sync with
  // `${name_key}_desc` as the name key changes. False (frozen) once loaded
  // from an existing node, since there's no field to re-derive it from anymore.
  descKeyAuto: boolean;
  descTranslations: Record<string, string>;
  price: string;
  discountValue: string;
  discountType: "" | DiscountType;
  isActive: boolean;
}

function autoDescKey(nameKey: string): string {
  const trimmed = nameKey.trim();
  return trimmed ? `${trimmed.toLowerCase()}_desc` : "";
}

// Translation fields start blank even when editing — same convention as MenuEditor's
// draftFromBlock: the card list already shows the current translated value, and a
// blank field just skips the PUT rather than clearing anything.
function draftFromNode(node: NodeResponse | null, parentId: string | null): NodeDraft {
  if (!node) {
    return {
      id: null,
      parentId,
      nameKey: "",
      nameTranslations: emptyTranslations(),
      descKey: "",
      descKeyAuto: true,
      descTranslations: emptyTranslations(),
      price: "",
      discountValue: "",
      discountType: "",
      isActive: true,
    };
  }
  return {
    id: node.id,
    parentId: node.parent_id,
    nameKey: node.name_key,
    nameTranslations: emptyTranslations(),
    descKey: node.desc_key ?? "",
    descKeyAuto: false,
    descTranslations: emptyTranslations(),
    price: node.price ?? "",
    discountValue: node.discount_value ?? "",
    discountType: node.discount_type ?? "",
    isActive: node.is_active,
  };
}

export function NodeTreeEditor() {
  const { token, claims, permissions } = useAuth();
  // Display locale for this editor's translation preview — independent of
  // the admin interface's own language (see LocaleContext).
  const [contentLocale, setContentLocale] = useState(LOCALES[0].code);
  const flash = useToast();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";
  const canManage = permissions.includes("locations.manage");

  const [nodeType, setNodeType] = useState<NodeType>("location");
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [levelLabelDraft, setLevelLabelDraft] = useState<Record<string, string> | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportResultRow[] | null>(null);
  const [bulkImportPrefix, setBulkImportPrefix] = useState("name.en: ");
  const bulkImportRef = useRef<HTMLTextAreaElement | null>(null);

  function handleBulkImportKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    applyToSelectedLines(e.currentTarget, setBulkImportText, (line) => indentLine(line, e.shiftKey ? -1 : 1));
  }

  function prefixSelectedBulkImportLines() {
    if (!bulkImportRef.current) return;
    applyToSelectedLines(bulkImportRef.current, setBulkImportText, (line) => (line.trim() ? bulkImportPrefix + line : line));
  }

  function switchType(type: NodeType) {
    setNodeType(type);
    setCurrentParentId(null);
  }

  const childrenQuery = useQuery({
    queryKey: ["nodeChildren", tenantId, nodeType, currentParentId],
    queryFn: () => listNodeChildren(tenantId, nodeType, currentParentId ?? undefined, token!),
    enabled: !!token && !!tenantId && canManage,
  });

  const children = (childrenQuery.data ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  const pathQuery = useQuery({
    queryKey: ["nodePath", tenantId, currentParentId],
    queryFn: () => getNodePath(tenantId, currentParentId!, token!),
    enabled: !!token && !!tenantId && canManage && !!currentParentId,
  });

  const breadcrumb = currentParentId ? (pathQuery.data ?? []) : [];
  const breadcrumbReady = !currentParentId || pathQuery.data !== undefined;
  const childDepth = !currentParentId ? 0 : breadcrumbReady ? breadcrumb[breadcrumb.length - 1].depth + 1 : null;

  const translationRefs = Array.from(
    new Set([
      ...children.map((n) => `nodes.${n.name_key}`),
      ...children.filter((n) => n.desc_key).map((n) => `nodes.${n.desc_key}`),
      ...breadcrumb.map((n) => `nodes.${n.name_key}`),
      ...(childDepth !== null ? [`node_levels.${nodeType}.level_${childDepth}`] : []),
    ]),
  );

  const translationsQuery = useQuery({
    queryKey: ["nodeTranslations", tenantId, contentLocale, translationRefs],
    queryFn: () => getTranslationsBatch(tenantId, contentLocale, translationRefs, token!),
    enabled: !!token && !!tenantId && translationRefs.length > 0,
  });

  // Tenant content lookup (node name/desc by ref) — distinct from `t()`
  // above, which is this UI's own copy (see SystemI18nContext).
  function nodeText(ref: string): string {
    return translationsQuery.data?.translations[ref] ?? "";
  }

  const levelType = nodeType === "location" ? t("console.locations.location") : t("console.locations.category");
  const levelLabel =
    childDepth !== null
      ? nodeText(`node_levels.${nodeType}.level_${childDepth}`) ||
        t("console.locations.levelFallback", { type: levelType, depth: childDepth })
      : "";

  const reorderMutation = useMutation({
    mutationFn: ({ items }: { items: { node_id: string; order_index: number }[] }) =>
      reorderNodes(tenantId, items, token!),
  });

  const applyReorder = useDragReorder((from, to) => {
    const previous = children;
    const reordered = reorder(children, from, to).map((n, i) => ({ ...n, order_index: i }));
    queryClient.setQueryData(["nodeChildren", tenantId, nodeType, currentParentId], reordered);
    reorderMutation.mutate(
      { items: reordered.map((n) => ({ node_id: n.id, order_index: n.order_index })) },
      {
        onError: () => {
          queryClient.setQueryData(["nodeChildren", tenantId, nodeType, currentParentId], previous);
          flash(t("console.locations.toast.reorderFailed"));
        },
      },
    );
  });

  const levelLabelMutation = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      const key = `${nodeType}.level_${childDepth}`;
      for (const l of LOCALES) {
        const val = values[l.code]?.trim();
        if (val) await putTranslation(tenantId, "node_levels", key, l.code, val, token!);
      }
    },
    onSuccess: () => {
      flash(t("console.locations.toast.levelLabelSaved"));
      queryClient.invalidateQueries({ queryKey: ["nodeTranslations", tenantId, contentLocale] });
      setLevelLabelDraft(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.locations.toast.levelLabelSaveFailed")),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (node: NodeResponse) => updateNode(tenantId, node.id, { is_active: !node.is_active }, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodeChildren", tenantId, nodeType, currentParentId] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.locations.toast.updateNodeFailed")),
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: NodeDraft) => {
      const price = draft.price.trim() || null;
      const discountValue = draft.discountValue.trim() || null;
      const discountType = draft.discountType || null;
      const descKey = draft.descKey.trim() || null;

      if (draft.id) {
        await updateNode(
          tenantId,
          draft.id,
          {
            name_key: draft.nameKey,
            desc_key: descKey,
            price,
            discount_value: discountValue,
            discount_type: discountType,
            is_active: draft.isActive,
          },
          token!,
        );
      } else {
        await createNode(
          tenantId,
          nodeType,
          {
            parent_id: draft.parentId,
            name_key: draft.nameKey,
            desc_key: descKey,
            order_index: children.length,
            price,
            discount_value: discountValue,
            discount_type: discountType,
          },
          token!,
        );
      }

      for (const l of LOCALES) {
        const nameVal = draft.nameTranslations[l.code]?.trim();
        if (nameVal) await putTranslation(tenantId, "nodes", draft.nameKey, l.code, nameVal, token!);
      }
      if (descKey) {
        for (const l of LOCALES) {
          const descVal = draft.descTranslations[l.code]?.trim();
          if (descVal) await putTranslation(tenantId, "nodes", descKey, l.code, descVal, token!);
        }
      }
    },
    onSuccess: (_data, draft) => {
      flash(draft.id ? t("console.locations.toast.nodeSaved") : t("console.locations.toast.nodeCreated"));
      queryClient.invalidateQueries({ queryKey: ["nodeChildren", tenantId, nodeType, currentParentId] });
      queryClient.invalidateQueries({ queryKey: ["nodeTranslations", tenantId, contentLocale] });
      setNodeDraft(null);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.locations.toast.saveNodeFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (node: NodeResponse) => {
      await deleteNode(tenantId, node.id, token!);
      for (const l of LOCALES) {
        await deleteTranslation(tenantId, "nodes", node.name_key, l.code, token!).catch(() => {});
        if (node.desc_key) await deleteTranslation(tenantId, "nodes", node.desc_key, l.code, token!).catch(() => {});
      }
    },
    onSuccess: () => {
      flash(t("console.locations.toast.nodeDeleted"));
      queryClient.invalidateQueries({ queryKey: ["nodeChildren", tenantId, nodeType, currentParentId] });
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.locations.toast.deleteNodeFailed")),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (rootItems: BulkImportNode[]) => {
      interface LevelEntry {
        source: BulkImportNode;
        parentId: string | null;
        siblingIndex: number;
      }
      const allResults: BulkImportResultRow[] = [];
      let level: LevelEntry[] = rootItems.map((source, i) => ({ source, parentId: currentParentId, siblingIndex: i }));

      // One request per depth — parents must exist (with real UUIDs) before
      // their children's parent_id can be sent. A failed parent's children
      // are skipped entirely since there's nothing to attach them to.
      while (level.length > 0) {
        const items: NodeBulkCreateItem[] = level.map(({ source, parentId, siblingIndex }) => ({
          parent_id: parentId,
          name: source.name,
          desc: source.desc,
          order_index: source.order_index ?? siblingIndex,
        }));
        const result = await bulkCreateNodes(tenantId, nodeType, items, token!);

        const nextLevel: LevelEntry[] = [];
        for (let i = 0; i < result.results.length; i++) {
          const r = result.results[i];
          const { source } = level[i];
          const label = source.name.en ?? source.name.uk ?? Object.values(source.name)[0] ?? t("console.locations.unnamed");
          allResults.push({ label, success: r.success, error: r.error });
          if (!r.success || !r.node) continue;

          // Bulk create only accepts name/desc/order_index — price/discount
          // need a follow-up PATCH on the node it just created.
          if (source.price !== undefined || source.discountValue !== undefined || source.discountType !== undefined) {
            try {
              await updateNode(
                tenantId,
                r.node.id,
                {
                  price: source.price ?? null,
                  discount_value: source.discountValue ?? null,
                  discount_type: source.discountType ?? null,
                },
                token!,
              );
            } catch (err) {
              allResults.push({
                label: `${label} (price/discount)`,
                success: false,
                error: err instanceof ApiError ? err.message : t("console.locations.toast.bulkPriceDiscountFailed"),
              });
            }
          }

          if (source.children?.length) {
            source.children.forEach((child, childIndex) => {
              nextLevel.push({ source: child, parentId: r.node!.id, siblingIndex: childIndex });
            });
          }
        }
        level = nextLevel;
      }
      return allResults;
    },
    onSuccess: (results) => {
      setBulkImportResults(results);
      const allOk = results.every((r) => r.success);
      flash(allOk ? t("console.locations.toast.bulkComplete") : t("console.locations.toast.bulkPartial"));
      queryClient.invalidateQueries({ queryKey: ["nodeChildren", tenantId, nodeType, currentParentId] });
      if (allOk) setBulkImportText("");
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.locations.toast.bulkFailed")),
  });

  let bulkImportParsed: BulkImportNode[] | null = null;
  let bulkImportError: string | null = null;
  if (bulkImportText.trim()) {
    try {
      bulkImportParsed = parseBulkImportOutline(bulkImportText, contentLocale);
    } catch (err) {
      bulkImportError = err instanceof Error ? err.message : t("console.locations.invalidInput");
    }
  }

  const nameKeyValid = !!nodeDraft && nodeDraft.nameKey.trim() !== "" && !/\s/.test(nodeDraft.nameKey);

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.locations.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.locations.title")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.locations.description")}
          </p>
        </div>
        <label className="urus-locale-field">
          {t("console.common.preview")}
          <select value={contentLocale} onChange={(e) => setContentLocale(e.target.value)}>
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!canManage && <p className="urus-lede">{t("console.locations.noPermission")}</p>}

      {canManage && (
        <>
          <div className="urus-list-actions" style={{ marginBottom: "var(--space-4)" }}>
            <div className="urus-tabbar" style={{ marginBottom: 0 }}>
              <button type="button" style={tabStyle(nodeType === "location")} onClick={() => switchType("location")}>
                {t("console.locations.tabLocations")}
              </button>
              <button type="button" style={tabStyle(nodeType === "category")} onClick={() => switchType("category")}>
                {t("console.locations.tabCategories")}
              </button>
            </div>
            <button
              type="button"
              style={smallPrimaryBtn()}
              onClick={() => setNodeDraft(draftFromNode(null, currentParentId))}
            >
              {t("console.locations.newNode")}
            </button>
            <button
              type="button"
              style={ghostBtn()}
              onClick={() => {
                setBulkImportText("");
                setBulkImportResults(null);
                setBulkImportOpen(true);
              }}
            >
              {t("console.locations.bulkImport")}
            </button>
          </div>

          <div className="urus-card-tags" style={{ marginBottom: "var(--space-2)" }}>
            <button
              type="button"
              className="urus-tag-accent-outline"
              disabled={!currentParentId}
              onClick={() => setCurrentParentId(null)}
            >
              {t("console.locations.root", {
                type: nodeType === "location" ? t("console.locations.tabLocations") : t("console.locations.tabCategories"),
              })}
            </button>
            {breadcrumb.map((ancestor) => (
              <button
                key={ancestor.id}
                type="button"
                className="urus-tag-accent-outline"
                onClick={() => setCurrentParentId(ancestor.id)}
              >
                {nodeText(`nodes.${ancestor.name_key}`) || ancestor.name_key} →
              </button>
            ))}
          </div>

          {childDepth !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
              <span className="urus-toolbar-label">{levelLabel}</span>
              <button type="button" style={ghostBtn()} onClick={() => setLevelLabelDraft(emptyTranslations())}>
                {t("console.locations.editLabel")}
              </button>
            </div>
          )}

          <div className="urus-card-list">
            {children.map((node, i) => {
              const { dragging, ...dragProps } = applyReorder(i);
              const name = nodeText(`nodes.${node.name_key}`) || node.name_key;
              return (
                <div key={node.id} {...dragProps} style={cardStyle(dragging)}>
                  <div className="urus-card-head">
                    <span className="urus-card-index">☰ {i}</span>
                    <span className="urus-card-ref">{name}</span>
                    <span className="urus-perm-key">{node.name_key}</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" style={ghostBtn()} onClick={() => setCurrentParentId(node.id)}>
                      {t("console.locations.open")}
                    </button>
                    <button type="button" style={ghostBtn()} onClick={() => setNodeDraft(draftFromNode(node, currentParentId))}>
                      {t("console.common.edit")}
                    </button>
                    <button type="button" style={ghostBtn()} onClick={() => deleteMutation.mutate(node)}>
                      {t("console.common.delete")}
                    </button>
                  </div>
                  <div className="urus-card-tags">
                    <button
                      type="button"
                      style={toggleStyle(node.is_active)}
                      onClick={() => toggleActiveMutation.mutate(node)}
                    >
                      {node.is_active ? t("console.locations.active") : t("console.locations.inactive")}
                    </button>
                    {node.price && <span className="urus-tag-outline-soft">{node.price}</span>}
                    {node.discount_value && (
                      <span className="urus-tag-dashed">
                        −{node.discount_value}
                        {node.discount_type === "percent" ? "%" : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {childrenQuery.isLoading && <p className="urus-lede">{t("console.common.loading")}</p>}
            {!childrenQuery.isLoading && children.length === 0 && (
              <p className="urus-lede">
                {nodeType === "location" ? t("console.locations.emptyLocations") : t("console.locations.emptyCategories")}
              </p>
            )}
          </div>
        </>
      )}

      {nodeDraft && (
        <Modal
          title={nodeDraft.id ? t("console.locations.editNodeTitle") : t("console.locations.newNodeTitle")}
          onClose={() => setNodeDraft(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={!nameKeyValid || saveMutation.isPending}
                onClick={() => saveMutation.mutate(nodeDraft)}
              >
                {t("console.common.save")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setNodeDraft(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <label className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldNameKey")}</span>
            <input
              className="urus-input urus-input-mono"
              value={nodeDraft.nameKey}
              onChange={(e) => {
                const nameKey = e.target.value;
                setNodeDraft({
                  ...nodeDraft,
                  nameKey,
                  descKey: nodeDraft.descKeyAuto ? autoDescKey(nameKey) : nodeDraft.descKey,
                });
              }}
              placeholder={t("console.locations.nameKeyPlaceholder")}
            />
            {!nameKeyValid && nodeDraft.nameKey && (
              <span className="urus-field-hint">{t("console.locations.noSpaces")}</span>
            )}
          </label>
          <div className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldNameTranslations")}</span>
            <LocaleTranslationFields
              values={nodeDraft.nameTranslations}
              onChange={(code, value) =>
                setNodeDraft({ ...nodeDraft, nameTranslations: { ...nodeDraft.nameTranslations, [code]: value } })
              }
            />
            <span className="urus-field-hint">{t("console.common.translationHintEditable")}</span>
          </div>
          <div className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldDescTranslations")}</span>
            <LocaleTranslationFields
              values={nodeDraft.descTranslations}
              disabled={!nodeDraft.descKey.trim()}
              onChange={(code, value) =>
                setNodeDraft({ ...nodeDraft, descTranslations: { ...nodeDraft.descTranslations, [code]: value } })
              }
            />
            <span className="urus-field-hint">
              {nodeDraft.descKey
                ? t("console.locations.descKeyHint", { key: nodeDraft.descKey })
                : t("console.locations.descKeyMissing")}
            </span>
          </div>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldPrice")}</span>
            <input
              className="urus-input"
              type="number"
              min="0"
              step="0.01"
              value={nodeDraft.price}
              onChange={(e) => setNodeDraft({ ...nodeDraft, price: e.target.value })}
            />
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.common.fieldDiscountValue")}</span>
            <input
              className="urus-input"
              type="number"
              min="0"
              step="0.01"
              value={nodeDraft.discountValue}
              onChange={(e) => setNodeDraft({ ...nodeDraft, discountValue: e.target.value })}
            />
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.common.fieldDiscountType")}</span>
            <select
              className="urus-select"
              value={nodeDraft.discountType}
              onChange={(e) => setNodeDraft({ ...nodeDraft, discountType: e.target.value as "" | DiscountType })}
            >
              <option value="">—</option>
              <option value="percent">{t("console.common.percent")}</option>
              <option value="fixed">{t("console.common.fixed")}</option>
            </select>
          </label>
          {nodeDraft.id && (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={nodeDraft.isActive}
                onChange={(e) => setNodeDraft({ ...nodeDraft, isActive: e.target.checked })}
              />
              <span className="urus-field-label" style={{ marginBottom: 0 }}>
                {t("console.locations.active")}
              </span>
            </label>
          )}
        </Modal>
      )}

      {levelLabelDraft && childDepth !== null && (
        <Modal
          title={t("console.locations.levelLabelTitle")}
          onClose={() => setLevelLabelDraft(null)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={levelLabelMutation.isPending}
                onClick={() => levelLabelMutation.mutate(levelLabelDraft)}
              >
                {t("console.common.save")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setLevelLabelDraft(null)}>
                {t("console.common.cancel")}
              </button>
            </>
          }
        >
          <div className="urus-field">
            <span className="urus-field-label">
              {t("console.locations.levelLabelFor", { type: levelType, depth: childDepth })}
            </span>
            <LocaleTranslationFields
              values={levelLabelDraft}
              onChange={(code, value) => setLevelLabelDraft({ ...levelLabelDraft, [code]: value })}
            />
            <span className="urus-field-hint">{t("console.locations.levelLabelHint")}</span>
          </div>
        </Modal>
      )}

      {bulkImportOpen && (
        <Modal
          title={t("console.locations.bulkImport")}
          onClose={() => setBulkImportOpen(false)}
          footer={
            <>
              <button
                type="button"
                style={primaryBtn()}
                disabled={!bulkImportParsed || bulkImportParsed.length === 0 || bulkImportMutation.isPending}
                onClick={() => bulkImportParsed && bulkImportMutation.mutate(bulkImportParsed)}
              >
                {bulkImportMutation.isPending ? t("console.locations.importing") : t("console.locations.importAction")}
              </button>
              <button type="button" style={ghostBtn()} onClick={() => setBulkImportOpen(false)}>
                {t("console.common.close")}
              </button>
            </>
          }
        >
          <p className="urus-field-hint">
            {t("console.locations.attachUnder")}{" "}
            {currentParentId
              ? nodeText(`nodes.${breadcrumb[breadcrumb.length - 1]?.name_key}`) ||
                breadcrumb[breadcrumb.length - 1]?.name_key
              : t("console.locations.root", {
                  type: nodeType === "location" ? t("console.locations.tabLocations") : t("console.locations.tabCategories"),
                })}
          </p>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldOutline")}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <input
                className="urus-input urus-input-mono"
                style={{ flex: 1 }}
                value={bulkImportPrefix}
                onChange={(e) => setBulkImportPrefix(e.target.value)}
                placeholder={t("console.locations.prefixPlaceholder")}
              />
              <button type="button" style={ghostBtn()} onClick={prefixSelectedBulkImportLines}>
                {t("console.locations.prefixButton")}
              </button>
            </div>
            <textarea
              ref={bulkImportRef}
              className="urus-input urus-input-mono"
              rows={14}
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              onKeyDown={handleBulkImportKeyDown}
              placeholder={BULK_IMPORT_PLACEHOLDER}
            />
            <span className="urus-field-hint">{t("console.locations.outlineHint1")}</span>
            <span className="urus-field-hint">{t("console.locations.outlineHint2", { locale: contentLocale })}</span>
            {bulkImportError && <span className="urus-field-hint">{bulkImportError}</span>}
          </label>

          {bulkImportResults && (
            <div className="urus-card-list">
              {bulkImportResults.map((r, i) => (
                <div key={i} className="urus-card-tags" style={{ padding: "6px 0" }}>
                  <span className={r.success ? "urus-tag-outline-soft" : "urus-tag-dashed"}>
                    {r.label}: {r.success ? t("console.locations.created") : r.error}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
