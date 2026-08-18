"use client";

import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ghostBtn } from "@/components/ui/styles";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { getTranslationsBatch } from "@/lib/api/i18n";
import { listNodeChildren } from "@/lib/api/nodes";
import type { NodeResponse, NodeType } from "@/lib/types";

// A node is only valid to attach a product to once an admin has explicitly
// marked it `is_final` in the node tree editor — that's the deliberate
// "stop here" signal (see NodeResponse.is_final), not just "happens to have
// no children yet" (a childless-but-not-final node can still grow children
// later, so it isn't a safe attachment point). Rendered as one cascading
// dropdown per depth (root, then that choice's children, and so on) rather
// than a breadcrumb + card list — much more compact, which matters when this
// sits inside an already-crowded filter panel.
//
// Two interaction modes, picked via `requireLeaf`:
//  - true (default, used by AddProductsEditor): a product can only attach to
//    a final node, so `onSelect` fires exactly once, only once one is chosen.
//  - false (used by ProductsEditor's filters): any node — final or not — is
//    a valid filter value and nothing needs confirming, so `onChange` fires
//    on every selection (and on Clear) with whatever's currently picked.
export function NodePicker({
  nodeType,
  tenantId,
  token,
  locale,
  requireLeaf = true,
  onSelect,
  onChange,
}: {
  nodeType: NodeType;
  tenantId: string;
  token: string;
  locale: string;
  requireLeaf?: boolean;
  onSelect?: (node: NodeResponse) => void;
  onChange?: (node: NodeResponse | null) => void;
}) {
  const t = useSystemT();
  const [path, setPath] = useState<NodeResponse[]>([]);

  // One children query per level already chosen, plus one more for the next level down.
  const parentIds: (string | undefined)[] = [undefined, ...path.map((n) => n.id)];
  const levelQueries = useQueries({
    queries: parentIds.map((parentId) => ({
      queryKey: ["productPickerLevel", tenantId, nodeType, parentId ?? "root"],
      queryFn: () => listNodeChildren(tenantId, nodeType, parentId, token),
      enabled: !!token && !!tenantId,
    })),
  });
  const levels = parentIds.map((_, i) =>
    (levelQueries[i]?.data ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  );

  const optionRefs = Array.from(new Set(levels.flat().map((n) => `nodes.${n.name_key}`)));
  const translationsQuery = useQuery({
    queryKey: ["productPickerTranslations", tenantId, locale, optionRefs],
    queryFn: () => getTranslationsBatch(tenantId, locale, optionRefs, token),
    enabled: !!token && !!tenantId && optionRefs.length > 0,
  });
  // Tenant content lookup (node name) — distinct from `t()` above, which is
  // this UI's own copy (see SystemI18nContext).
  function nodeLabel(node: NodeResponse): string {
    return translationsQuery.data?.translations[`nodes.${node.name_key}`] || node.name_key;
  }

  const deepestDepth = path.length;
  const deepestQuery = levelQueries[deepestDepth];
  const deepestChildren = levels[deepestDepth] ?? [];
  const deepestNode = path[path.length - 1] ?? null;
  const deepestIsFinal = !!deepestNode?.is_final;
  const deepestIsDeadEnd =
    requireLeaf && !!deepestNode && !deepestIsFinal && !deepestQuery?.isLoading && deepestChildren.length === 0;

  function choose(depth: number, node: NodeResponse) {
    setPath([...path.slice(0, depth), node]);
    if (!requireLeaf) onChange?.(node);
  }

  function clear() {
    setPath([]);
    if (!requireLeaf) onChange?.(null);
  }

  // requireLeaf mode only: is_final is a property of the chosen node itself,
  // not something that needs its children fetched first — no need to wait
  // on deepestQuery here the way a "children came back empty" check would.
  useEffect(() => {
    if (!requireLeaf) return;
    if (deepestNode?.is_final) onSelect?.(deepestNode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireLeaf, deepestNode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {levels.map((options, depth) => {
        // Once the deepest chosen node is final, stop drilling into it even
        // if it happens to have children — is_final means "attach here."
        if (deepestIsFinal && depth === path.length) return null;
        if (options.length === 0) return null;
        return (
          <select
            key={depth}
            className="urus-select"
            value={path[depth]?.id ?? ""}
            disabled={levelQueries[depth]?.isLoading}
            onChange={(e) => {
              const node = options.find((n) => n.id === e.target.value);
              if (node) choose(depth, node);
            }}
          >
            <option value="" disabled>
              {depth === 0
                ? nodeType === "location"
                  ? t("console.products.selectLocation")
                  : t("console.products.selectCategory")
                : t("console.products.selectGeneric")}
            </option>
            {options.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)}
              </option>
            ))}
          </select>
        );
      })}
      {!requireLeaf && path.length > 0 && (
        <button type="button" style={ghostBtn()} onClick={clear}>
          {t("console.products.clear")}
        </button>
      )}
      {levels[0].length === 0 && !levelQueries[0]?.isLoading && (
        <p className="urus-lede">
          {nodeType === "location" ? t("console.products.noLocationsYet") : t("console.products.noCategoriesYet")}
        </p>
      )}
      {deepestIsDeadEnd && <p className="urus-lede">{t("console.products.notFinalYet")}</p>}
    </div>
  );
}
