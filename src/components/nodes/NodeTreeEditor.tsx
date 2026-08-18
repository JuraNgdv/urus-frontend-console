"use client";

import { useState } from "react";
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
import { deleteTranslation, getTranslationsBatch, getTranslationsForKey, putTranslation } from "@/lib/api/i18n";
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

// Bulk import creates exactly one flat level of direct children under
// whichever node is currently open — no nesting, so the input format can be
// much simpler than an outline: a "format" (one field per line, e.g.
// "name.en" or "name.en" + "price") plus a "data" block where each line
// fills the next field in that format, cycling back to field 1 after a node's
// last field. E.g. format ["name.en", "price"] over data
// ["Centrum", "20", "Jozefowiec", "30"] makes two nodes. A blank data line
// still consumes a slot (an explicitly empty value for that field) rather
// than being skipped — that's what lets a paste like "Brynów" / "" (no
// price) line up correctly with the next node's "name.en" rather than
// shifting every field after it by one. Only a run of fully blank lines at
// the very end (a trailing-newline paste artifact) is trimmed.
const BULK_KNOWN_STATIC_FIELDS = new Set(["price", "discount_value", "discount_type", "order_index"]);

function parseBulkImportFormat(formatText: string): string[] {
  const keys = formatText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (keys.length === 0) throw new Error('Specify at least one field in the format, e.g. "name.en".');
  for (const key of keys) {
    if (!key.startsWith("name.") && !key.startsWith("desc.") && !BULK_KNOWN_STATIC_FIELDS.has(key)) {
      throw new Error(`Unknown field "${key}" in format.`);
    }
  }
  if (!keys.some((k) => k.startsWith("name."))) {
    throw new Error('Format needs at least one "name.<locale>" field.');
  }
  return keys;
}

function parseBulkImportData(formatKeys: string[], dataText: string): { nodes: BulkImportNode[]; warning: string | null } {
  const lines = dataText.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  const nodes: BulkImportNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const slot = i % formatKeys.length;
    if (slot === 0) nodes.push({ name: {} });
    const value = lines[i].trim();
    if (!value) continue;

    const key = formatKeys[slot];
    const node = nodes[nodes.length - 1];
    const lineNo = i + 1;
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
    }
  }

  const remainder = lines.length % formatKeys.length;
  const warning =
    remainder !== 0
      ? `Last item only has ${remainder} of ${formatKeys.length} fields — check the data lines up with the format.`
      : null;

  return { nodes, warning };
}

const BULK_FORMAT_PLACEHOLDER = `name.en
price`;

const BULK_DATA_PLACEHOLDER = `Centrum
20
Jozefowiec
30
Brynów

Ligota
`;

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
  // Blocks drill-down past this node in customer browse, independent of
  // whether it actually has children — see NodeResponse.is_final.
  isFinal: boolean;
  // What is_final was when the modal opened — lets saveMutation omit is_final
  // from the PATCH entirely when it's untouched. The backend rejects any
  // is_final assignment (even a same-value one) on a node that has children,
  // so editing e.g. just a translation on such a node must not resend it.
  originalIsFinal: boolean;
}

function autoDescKey(nameKey: string): string {
  const trimmed = nameKey.trim();
  return trimmed ? `${trimmed.toLowerCase()}_desc` : "";
}

// No more manually-typed "Name key" field — sent as-is (no client-side
// slugifying) from whichever name translation is filled in, preferring
// English (stable even if the English copy later gets tweaked) and falling
// back to the first other filled-in locale otherwise. The backend slugifies
// this into the real name_key and returns it on the create response — see
// saveMutation, which writes translations under that returned key, not this
// raw one.
function deriveNameKey(nameTranslations: Record<string, string>): string {
  const en = nameTranslations.en?.trim();
  return en || Object.values(nameTranslations).find((v) => v?.trim())?.trim() || "";
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
      isFinal: false,
      originalIsFinal: false,
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
    isFinal: node.is_final,
    originalIsFinal: node.is_final,
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
  const [bulkImportFormat, setBulkImportFormat] = useState("name.en");
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportIsFinal, setBulkImportIsFinal] = useState(false);
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportResultRow[] | null>(null);

  function switchType(type: NodeType) {
    setNodeType(type);
    setCurrentParentId(null);
  }

  // Opens the edit modal immediately (blank translation fields, as before),
  // then fills them in once the per-key locale dicts come back. Guarded by
  // reference equality against the blank objects draftFromNode handed out —
  // onChange always replaces that reference with a new object, so if the
  // admin already started typing before the fetch resolved, this leaves
  // their edits alone instead of clobbering them.
  async function openEditNode(node: NodeResponse) {
    const draft = draftFromNode(node, currentParentId);
    const blankNameTranslations = draft.nameTranslations;
    const blankDescTranslations = draft.descTranslations;
    setNodeDraft(draft);
    try {
      const [nameLocales, descLocales] = await Promise.all([
        getTranslationsForKey(tenantId, `nodes.${node.name_key}`, token!),
        node.desc_key ? getTranslationsForKey(tenantId, `nodes.${node.desc_key}`, token!) : Promise.resolve({}),
      ]);
      setNodeDraft((prev) =>
        prev && prev.id === node.id
          ? {
              ...prev,
              nameTranslations: prev.nameTranslations === blankNameTranslations ? nameLocales : prev.nameTranslations,
              descTranslations: prev.descTranslations === blankDescTranslations ? descLocales : prev.descTranslations,
            }
          : prev,
      );
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("console.locations.toast.loadTranslationsFailed"));
    }
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

  const toggleFinalMutation = useMutation({
    mutationFn: (node: NodeResponse) => updateNode(tenantId, node.id, { is_final: !node.is_final }, token!),
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

      // On create, name_key is sent raw (unslugified — see deriveNameKey)
      // and desc_key isn't sent at all; the backend slugifies/derives both
      // itself and returns the real values on the response. Translations go
      // under those returned keys, not the client-side draft ones.
      //
      // On update, neither is sent at all — this UI has no field to change
      // either one while editing (both are frozen from the loaded node, see
      // draftFromNode/openEditNode), so they're always the same value the
      // node already has. Resending them anyway used to reslugify/regenerate
      // name_key server-side on every save (same failure mode as is_final:
      // the backend treats mere presence in the PATCH as "change this", not
      // "here's its current value") — silently drifting the node's real
      // name_key away from the one its translations are stored under, e.g.
      // just bumping the price would orphan every existing translation.
      let nameKey: string;
      let descKey: string | null;

      if (draft.id) {
        nameKey = draft.nameKey;
        descKey = draft.descKey.trim() || null;
        await updateNode(
          tenantId,
          draft.id,
          {
            price,
            discount_value: discountValue,
            discount_type: discountType,
            is_active: draft.isActive,
            // Only sent when actually toggled — the backend rejects any
            // is_final assignment (even a same-value no-op) on a node that
            // has children, so an unrelated edit (e.g. just a translation)
            // must not resend the untouched value.
            ...(draft.isFinal !== draft.originalIsFinal ? { is_final: draft.isFinal } : {}),
          },
          token!,
        );
      } else {
        const created = await createNode(
          tenantId,
          nodeType,
          {
            parent_id: draft.parentId,
            name_key: draft.nameKey,
            order_index: children.length,
            price,
            discount_value: discountValue,
            discount_type: discountType,
            is_final: draft.isFinal,
          },
          token!,
        );
        nameKey = created.name_key;
        descKey = created.desc_key;
      }

      for (const l of LOCALES) {
        const nameVal = draft.nameTranslations[l.code]?.trim();
        if (nameVal) await putTranslation(tenantId, "nodes", nameKey, l.code, nameVal, token!);
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
    mutationFn: async ({ items: rootItems, isFinal }: { items: BulkImportNode[]; isFinal: boolean }) => {
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
          // and is_final need a follow-up PATCH on the node it just created.
          if (source.price !== undefined || source.discountValue !== undefined || source.discountType !== undefined || isFinal) {
            try {
              await updateNode(
                tenantId,
                r.node.id,
                {
                  price: source.price ?? null,
                  discount_value: source.discountValue ?? null,
                  discount_type: source.discountType ?? null,
                  ...(isFinal ? { is_final: true } : {}),
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

  let bulkImportFormatKeys: string[] | null = null;
  let bulkImportError: string | null = null;
  try {
    bulkImportFormatKeys = parseBulkImportFormat(bulkImportFormat);
  } catch (err) {
    bulkImportError = err instanceof Error ? err.message : t("console.locations.invalidInput");
  }

  let bulkImportParsed: BulkImportNode[] | null = null;
  let bulkImportWarning: string | null = null;
  if (bulkImportFormatKeys && bulkImportText.trim()) {
    try {
      const result = parseBulkImportData(bulkImportFormatKeys, bulkImportText);
      bulkImportParsed = result.nodes;
      bulkImportWarning = result.warning;
    } catch (err) {
      bulkImportError = err instanceof Error ? err.message : t("console.locations.invalidInput");
    }
  }

  // Compact per-node summary for the real-time bulk import preview — lets the
  // admin confirm the format/data pairing lined up correctly before submitting.
  function bulkNodePreviewLabel(node: BulkImportNode): string {
    const name = node.name.en ?? node.name.uk ?? Object.values(node.name).find((v) => v?.trim()) ?? t("console.locations.unnamed");
    const extras: string[] = [];
    if (node.price) extras.push(`price ${node.price}`);
    if (node.discountValue) extras.push(`-${node.discountValue}${node.discountType === "percent" ? "%" : ""}`);
    if (node.desc && Object.values(node.desc).some((v) => v?.trim())) extras.push("desc");
    return extras.length ? `${name} · ${extras.join(" · ")}` : name;
  }

  const hasAnyNameTranslation = !!nodeDraft && Object.values(nodeDraft.nameTranslations).some((v) => v?.trim());
  // Editing an existing node keeps its already-derived key regardless of
  // whether any translation field is (re)filled in this session — see
  // draftFromNode. A new node has no key yet, so at least one translation
  // must be filled in to derive one from (see deriveNameKey).
  const nameKeyValid = !!nodeDraft && (nodeDraft.id ? nodeDraft.nameKey.trim() !== "" : hasAnyNameTranslation);

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
                setBulkImportIsFinal(false);
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
                    <span>{name}</span>
                    <span className="urus-perm-key">{node.name_key}</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" style={ghostBtn()} onClick={() => setCurrentParentId(node.id)}>
                      {t("console.locations.open")}
                    </button>
                    <button type="button" style={ghostBtn()} onClick={() => openEditNode(node)}>
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
                    <button
                      type="button"
                      style={toggleStyle(node.is_final)}
                      onClick={() => toggleFinalMutation.mutate(node)}
                    >
                      {node.is_final ? t("console.locations.final") : t("console.locations.notFinal")}
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
          <div className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldNameTranslations")}</span>
            <LocaleTranslationFields
              values={nodeDraft.nameTranslations}
              onChange={(code, value) => {
                const nameTranslations = { ...nodeDraft.nameTranslations, [code]: value };
                const nameKey = nodeDraft.id ? nodeDraft.nameKey : deriveNameKey(nameTranslations);
                setNodeDraft({
                  ...nodeDraft,
                  nameTranslations,
                  nameKey,
                  descKey: nodeDraft.descKeyAuto ? autoDescKey(nameKey) : nodeDraft.descKey,
                });
              }}
            />
            <span className="urus-field-hint">
              {nodeDraft.id
                ? t("console.common.translationHintEditable")
                : hasAnyNameTranslation
                  ? t("console.locations.nameKeyHint", { key: nodeDraft.nameKey })
                  : t("console.locations.nameTranslationRequired")}
            </span>
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
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={nodeDraft.isFinal}
              onChange={(e) => setNodeDraft({ ...nodeDraft, isFinal: e.target.checked })}
            />
            <span className="urus-field-label" style={{ marginBottom: 0 }}>
              {t("console.locations.fieldIsFinal")}
            </span>
          </label>
          <span className="urus-field-hint">{t("console.locations.isFinalHint")}</span>
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
                onClick={() =>
                  bulkImportParsed && bulkImportMutation.mutate({ items: bulkImportParsed, isFinal: bulkImportIsFinal })
                }
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
          <p className="urus-field-hint">{t("console.locations.bulkFlatHint")}</p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
            <input type="checkbox" checked={bulkImportIsFinal} onChange={(e) => setBulkImportIsFinal(e.target.checked)} />
            <span className="urus-field-label" style={{ marginBottom: 0 }}>
              {t("console.locations.bulkMarkAllFinal")}
            </span>
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldBulkFormat")}</span>
            <textarea
              className="urus-input urus-input-mono"
              rows={3}
              value={bulkImportFormat}
              onChange={(e) => setBulkImportFormat(e.target.value)}
              placeholder={BULK_FORMAT_PLACEHOLDER}
            />
            <span className="urus-field-hint">{t("console.locations.bulkFormatHint")}</span>
          </label>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.locations.fieldBulkData")}</span>
            <textarea
              className="urus-input urus-input-mono"
              rows={14}
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              placeholder={BULK_DATA_PLACEHOLDER}
            />
            <span className="urus-field-hint">{t("console.locations.bulkDataHint")}</span>
            {bulkImportError && <span className="urus-field-hint">{bulkImportError}</span>}
            {bulkImportWarning && <span className="urus-field-hint">{bulkImportWarning}</span>}
          </label>

          {bulkImportParsed && bulkImportParsed.length > 0 && (
            <div className="urus-field">
              <span className="urus-field-label">
                {t("console.locations.bulkNodesDetected", { count: bulkImportParsed.length })}
              </span>
              <div className="urus-card-list">
                {bulkImportParsed.map((n, i) => (
                  <div key={i} className="urus-card-tags" style={{ padding: "4px 0" }}>
                    <span className="urus-tag-outline-soft">
                      {i + 1}. {bulkNodePreviewLabel(n)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
