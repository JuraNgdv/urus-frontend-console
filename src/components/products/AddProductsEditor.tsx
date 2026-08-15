"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { cardStyle, ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { getTranslationsBatch } from "@/lib/api/i18n";
import { mediaUrl, uploadMedia } from "@/lib/api/media";
import { bulkCreateProducts } from "@/lib/api/products";
import { NodePicker } from "./NodePicker";
import type { MediaResponse, NodeResponse, ProductBulkResult, ProductCreateRequest } from "@/lib/types";

interface ProductDraft {
  key: string;
  description: string;
  latitude: string;
  longitude: string;
  media: MediaResponse[];
}

function emptyProductDraft(): ProductDraft {
  return { key: crypto.randomUUID(), description: "", latitude: "", longitude: "", media: [] };
}

function ProductDraftCard({
  draft,
  index,
  tenantId,
  token,
  onChange,
  onRemove,
  canRemove,
}: {
  draft: ProductDraft;
  index: number;
  tenantId: string;
  token: string;
  onChange: (next: ProductDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const flash = useToast();
  const t = useSystemT();
  const [uploading, setUploading] = useState(false);
  const applyReorder = useDragReorder((from, to) => onChange({ ...draft, media: reorder(draft.media, from, to) }));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: MediaResponse[] = [];
      for (const file of Array.from(files)) uploaded.push(await uploadMedia(tenantId, file, token));
      onChange({ ...draft, media: [...draft.media, ...uploaded] });
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("console.products.toast.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={cardStyle(false)}>
      <div className="urus-card-head">
        <span className="urus-card-type">{t("console.productsAdd.productIndex", { index: index + 1 })}</span>
        <div style={{ flex: 1 }} />
        {canRemove && (
          <button type="button" style={ghostBtn()} onClick={onRemove}>
            {t("console.common.remove")}
          </button>
        )}
      </div>

      <label className="urus-field">
        <span className="urus-field-label">{t("console.products.fieldDescription")}</span>
        <textarea
          className="urus-input"
          rows={2}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </label>

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <label className="urus-field" style={{ flex: 1 }}>
          <span className="urus-field-label">{t("console.products.fieldLatitude")}</span>
          <input
            className="urus-input"
            type="number"
            step="any"
            value={draft.latitude}
            onChange={(e) => onChange({ ...draft, latitude: e.target.value })}
          />
        </label>
        <label className="urus-field" style={{ flex: 1 }}>
          <span className="urus-field-label">{t("console.products.fieldLongitude")}</span>
          <input
            className="urus-input"
            type="number"
            step="any"
            value={draft.longitude}
            onChange={(e) => onChange({ ...draft, longitude: e.target.value })}
          />
        </label>
      </div>

      <div className="urus-field">
        <span className="urus-field-label">{t("console.products.fieldMedia")}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {draft.media.map((m, i) => {
            const { dragging, ...dragProps } = applyReorder(i);
            return (
              <div key={m.id} {...dragProps} style={{ ...cardStyle(dragging), padding: 4, width: 88 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(m)} alt="" style={{ width: "100%", height: 64, objectFit: "cover", display: "block" }} />
                <button
                  type="button"
                  style={{ ...ghostBtn(), width: "100%", marginTop: 4 }}
                  onClick={() => onChange({ ...draft, media: draft.media.filter((x) => x.id !== m.id) })}
                >
                  {t("console.common.remove")}
                </button>
              </div>
            );
          })}
        </div>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={uploading}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading && <span className="urus-field-hint">{t("console.products.uploading")}</span>}
        {draft.media.length === 0 && <span className="urus-field-hint">{t("console.products.mediaRequired")}</span>}
      </div>
    </div>
  );
}

export function AddProductsEditor() {
  const { token, claims, permissions } = useAuth();
  const { locale } = useLocale();
  const flash = useToast();
  const t = useSystemT();
  const tenantId = claims?.tenant_id ?? "";
  const canAdd = permissions.includes("products.add");

  const [selectedLocation, setSelectedLocation] = useState<NodeResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<NodeResponse | null>(null);
  const [products, setProducts] = useState<ProductDraft[]>(() => [emptyProductDraft()]);
  const [lastResult, setLastResult] = useState<ProductBulkResult | null>(null);

  const selectedRefs = [selectedLocation, selectedCategory]
    .filter((n): n is NodeResponse => !!n)
    .map((n) => `nodes.${n.name_key}`);
  const selectedNamesQuery = useQuery({
    queryKey: ["productSelectedNodeNames", tenantId, locale, selectedRefs],
    queryFn: () => getTranslationsBatch(tenantId, locale, selectedRefs, token!),
    enabled: !!token && !!tenantId && selectedRefs.length > 0,
  });
  function selectedName(node: NodeResponse): string {
    return selectedNamesQuery.data?.translations[`nodes.${node.name_key}`] || node.name_key;
  }

  function updateProduct(key: string, next: ProductDraft) {
    setProducts((prev) => prev.map((p) => (p.key === key ? next : p)));
  }

  function removeProduct(key: string) {
    setProducts((prev) => prev.filter((p) => p.key !== key));
  }

  const canSubmit =
    !!selectedLocation && !!selectedCategory && products.length > 0 && products.every((p) => p.media.length > 0);

  const submitMutation = useMutation({
    mutationFn: () => {
      const body = {
        products: products.map(
          (p): ProductCreateRequest => ({
            location_id: selectedLocation!.id,
            category_id: selectedCategory!.id,
            description: p.description.trim() || null,
            media_ids: p.media.map((m) => m.id),
            latitude: p.latitude.trim() || null,
            longitude: p.longitude.trim() || null,
          }),
        ),
      };
      return bulkCreateProducts(tenantId, body, token!);
    },
    onSuccess: (result) => {
      setLastResult(result);
      const allOk = result.results.every((r) => r.success);
      flash(allOk ? t("console.productsAdd.toast.allAdded") : t("console.productsAdd.toast.someFailed"));
      if (allOk) setProducts([emptyProductDraft()]);
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.productsAdd.toast.addFailed")),
  });

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.locations.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.areas.productsAdd.label")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.productsAdd.description")}
          </p>
        </div>
      </div>

      {!canAdd && <p className="urus-lede">{t("console.productsAdd.noPermission")}</p>}

      {canAdd && (
        <>
          <section style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-6)", marginBottom: "var(--space-6)" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div className="urus-editor-toolbar">
                <span className="urus-toolbar-label">{t("console.products.fieldLocation")}</span>
              </div>
              {selectedLocation ? (
                <div className="urus-card-tags">
                  <span className="urus-tag-outline-soft">{selectedName(selectedLocation)}</span>
                  <button type="button" style={ghostBtn()} onClick={() => setSelectedLocation(null)}>
                    {t("console.productsAdd.change")}
                  </button>
                </div>
              ) : (
                <NodePicker nodeType="location" tenantId={tenantId} token={token!} locale={locale} onSelect={setSelectedLocation} />
              )}
            </div>

            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div className="urus-editor-toolbar">
                <span className="urus-toolbar-label">{t("console.products.fieldCategory")}</span>
              </div>
              {selectedCategory ? (
                <div className="urus-card-tags">
                  <span className="urus-tag-outline-soft">{selectedName(selectedCategory)}</span>
                  <button type="button" style={ghostBtn()} onClick={() => setSelectedCategory(null)}>
                    {t("console.productsAdd.change")}
                  </button>
                </div>
              ) : (
                <NodePicker nodeType="category" tenantId={tenantId} token={token!} locale={locale} onSelect={setSelectedCategory} />
              )}
            </div>
          </section>

          {selectedLocation && selectedCategory && (
            <section>
              <div className="urus-editor-toolbar">
                <span className="urus-toolbar-label">{t("console.areas.products.label")}</span>
                <button type="button" style={smallPrimaryBtn()} onClick={() => setProducts((prev) => [...prev, emptyProductDraft()])}>
                  {t("console.productsAdd.addAnother")}
                </button>
              </div>

              <div className="urus-card-list">
                {products.map((draft, i) => (
                  <ProductDraftCard
                    key={draft.key}
                    draft={draft}
                    index={i}
                    tenantId={tenantId}
                    token={token!}
                    onChange={(next) => updateProduct(draft.key, next)}
                    onRemove={() => removeProduct(draft.key)}
                    canRemove={products.length > 1}
                  />
                ))}
                {products.length === 0 && <p className="urus-lede">{t("console.productsAdd.emptyBatch")}</p>}
              </div>

              <div style={{ marginTop: "var(--space-4)" }}>
                <button
                  type="button"
                  style={primaryBtn()}
                  disabled={!canSubmit || submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending
                    ? t("console.productsAdd.adding")
                    : t("console.productsAdd.addSubmit", { count: products.length, plural: products.length === 1 ? "" : "s" })}
                </button>
              </div>

              {lastResult && (
                <div className="urus-card-list" style={{ marginTop: "var(--space-4)" }}>
                  <div className="urus-toolbar-label">{t("console.productsAdd.lastSubmission")}</div>
                  {lastResult.results.map((r) => (
                    <div key={r.index} className="urus-card-tags" style={{ padding: "6px 0" }}>
                      <span className={r.success ? "urus-tag-outline-soft" : "urus-tag-dashed"}>
                        #{r.index + 1}: {r.success ? t("console.productsAdd.created", { id: r.product?.id ?? "" }) : r.error}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
