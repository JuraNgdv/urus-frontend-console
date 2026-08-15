"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/locale/LocaleContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { Modal } from "@/components/ui/Modal";
import { cardStyle, ghostBtn, primaryBtn, smallPrimaryBtn } from "@/components/ui/styles";
import { reorder, useDragReorder } from "@/components/ui/useDragReorder";
import { ApiError } from "@/lib/api/client";
import { getTranslationsBatch } from "@/lib/api/i18n";
import { listMediaAttachments, mediaUrl, uploadMedia } from "@/lib/api/media";
import { getNode } from "@/lib/api/nodes";
import { listProducts, updateProduct } from "@/lib/api/products";
import { NodePicker } from "./NodePicker";
import type {
  DiscountType,
  MediaResponse,
  NodeResponse,
  ProductResponse,
  ProductSortBy,
  ProductStatus,
  ProductUpdateRequest,
} from "@/lib/types";
import type { SystemStringKey } from "@/lib/i18n/SystemI18nContext";

const STATUSES: ProductStatus[] = [
  "created",
  "available",
  "reserved",
  "sold",
  "gifted",
  "won",
  "replacement",
  "defective",
];

const SORT_OPTIONS: { value: ProductSortBy; labelKey: SystemStringKey }[] = [
  { value: "created_at", labelKey: "console.products.sortCreatedAt" },
  { value: "sold_price", labelKey: "console.products.sortSoldPrice" },
  { value: "status", labelKey: "console.products.sortStatus" },
  { value: "latitude", labelKey: "console.products.sortLatitude" },
  { value: "longitude", labelKey: "console.products.sortLongitude" },
];

interface CommittedFilters {
  locationId: string;
  categoryId: string;
  status: "" | ProductStatus;
  actorId: string;
  eventStatus: "" | ProductStatus;
  recipientId: string;
  sortBy: ProductSortBy;
  sortOrder: "asc" | "desc";
  limit: number;
  offset: number;
}

function defaultFilters(): CommittedFilters {
  return {
    locationId: "",
    categoryId: "",
    status: "",
    actorId: "",
    eventStatus: "",
    recipientId: "",
    sortBy: "created_at",
    sortOrder: "desc",
    limit: 50,
    offset: 0,
  };
}

interface EditDraft {
  description: string;
  latitude: string;
  longitude: string;
  status: ProductStatus;
  discountValue: string;
  discountType: "" | DiscountType;
  media: MediaResponse[];
}

function EditProductModal({
  product,
  tenantId,
  token,
  canSetDiscount,
  onClose,
  onSaved,
}: {
  product: ProductResponse;
  tenantId: string;
  token: string;
  canSetDiscount: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const flash = useToast();
  const t = useSystemT();

  // Product has no media_id — its media lives in media_attachments, so the
  // full MediaResponse objects (needed for thumbnails/reorder) have to be
  // fetched separately before the draft can be initialized.
  const attachmentsQuery = useQuery({
    queryKey: ["productMediaAttachments", tenantId, product.id],
    queryFn: () => listMediaAttachments(tenantId, "product", product.id, token),
    enabled: !!token && !!tenantId,
  });

  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (draft || !attachmentsQuery.data) return;
    const sorted = attachmentsQuery.data.slice().sort((a, b) => a.order_index - b.order_index);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({
      description: product.description ?? "",
      latitude: product.latitude ?? "",
      longitude: product.longitude ?? "",
      status: product.status,
      discountValue: product.discount_value ?? "",
      discountType: product.discount_type ?? "",
      media: sorted.map((a) => a.media),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentsQuery.data, draft]);

  const applyReorder = useDragReorder((from, to) => {
    setDraft((prev) => (prev ? { ...prev, media: reorder(prev.media, from, to) } : prev));
  });

  const [uploading, setUploading] = useState(false);
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !draft) return;
    setUploading(true);
    try {
      const uploaded: MediaResponse[] = [];
      for (const file of Array.from(files)) uploaded.push(await uploadMedia(tenantId, file, token));
      setDraft({ ...draft, media: [...draft.media, ...uploaded] });
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("console.products.toast.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Draft not loaded");
      const body: ProductUpdateRequest = {
        description: draft.description.trim() || null,
        latitude: draft.latitude.trim() || null,
        longitude: draft.longitude.trim() || null,
        status: draft.status,
        media_ids: draft.media.map((m) => m.id),
      };
      if (canSetDiscount) {
        body.discount_value = draft.discountValue.trim() || null;
        body.discount_type = draft.discountType || null;
      }
      return updateProduct(tenantId, product.id, body, token);
    },
    onSuccess: () => {
      flash(t("console.products.toast.saved"));
      onSaved();
      onClose();
    },
    onError: (err) => flash(err instanceof ApiError ? err.message : t("console.products.toast.saveFailed")),
  });

  return (
    <Modal
      title={t("console.products.editProductTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            style={primaryBtn()}
            disabled={!draft || draft.media.length === 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t("console.common.save")}
          </button>
          <button type="button" style={ghostBtn()} onClick={onClose}>
            {t("console.common.cancel")}
          </button>
        </>
      }
    >
      {!draft && <p className="urus-lede">{t("console.common.loading")}</p>}
      {draft && (
        <>
          <label className="urus-field">
            <span className="urus-field-label">{t("console.products.fieldDescription")}</span>
            <textarea
              className="urus-input"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>

          <label className="urus-field">
            <span className="urus-field-label">{t("console.products.fieldStatus")}</span>
            <select
              className="urus-select"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as ProductStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <label className="urus-field" style={{ flex: 1 }}>
              <span className="urus-field-label">{t("console.products.fieldLatitude")}</span>
              <input
                className="urus-input"
                type="number"
                step="any"
                value={draft.latitude}
                onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
              />
            </label>
            <label className="urus-field" style={{ flex: 1 }}>
              <span className="urus-field-label">{t("console.products.fieldLongitude")}</span>
              <input
                className="urus-input"
                type="number"
                step="any"
                value={draft.longitude}
                onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
              />
            </label>
          </div>

          {canSetDiscount ? (
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <label className="urus-field" style={{ flex: 1 }}>
                <span className="urus-field-label">{t("console.common.fieldDiscountValue")}</span>
                <input
                  className="urus-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.discountValue}
                  onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
                />
              </label>
              <label className="urus-field" style={{ flex: 1 }}>
                <span className="urus-field-label">{t("console.common.fieldDiscountType")}</span>
                <select
                  className="urus-select"
                  value={draft.discountType}
                  onChange={(e) => setDraft({ ...draft, discountType: e.target.value as "" | DiscountType })}
                >
                  <option value="">—</option>
                  <option value="percent">{t("console.common.percent")}</option>
                  <option value="fixed">{t("console.common.fixed")}</option>
                </select>
              </label>
            </div>
          ) : (
            (product.discount_value || product.discount_type) && (
              <p className="urus-field-hint">
                {t("console.products.discountReadonlyHint", {
                  value: `${product.discount_value}${product.discount_type === "percent" ? "%" : ""}`,
                })}
              </p>
            )
          )}

          <div className="urus-field">
            <span className="urus-field-label">{t("console.products.fieldMedia")}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {draft.media.map((m, i) => {
                const { dragging, ...dragProps } = applyReorder(i);
                return (
                  <div key={m.id} {...dragProps} style={{ ...cardStyle(dragging), padding: 4, width: 88 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(m)}
                      alt=""
                      style={{ width: "100%", height: 64, objectFit: "cover", display: "block" }}
                    />
                    <button
                      type="button"
                      style={{ ...ghostBtn(), width: "100%", marginTop: 4 }}
                      onClick={() => setDraft({ ...draft, media: draft.media.filter((x) => x.id !== m.id) })}
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
        </>
      )}
    </Modal>
  );
}

export function ProductsEditor() {
  const { token, claims, permissions } = useAuth();
  const { locale } = useLocale();
  const t = useSystemT();
  const queryClient = useQueryClient();
  const tenantId = claims?.tenant_id ?? "";

  const canManage = permissions.includes("products.manage");
  const canUpdateAny = permissions.includes("products.update.any");
  const canUpdateMy = permissions.includes("products.update.my");
  const canSetDiscount = permissions.includes("products.set_discount");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [committed, setCommitted] = useState<CommittedFilters>(defaultFilters());
  // Location/category are independent of each other and of the text filters —
  // picking one doesn't require the other, and nothing takes effect until Apply.
  const [locationDraft, setLocationDraft] = useState<NodeResponse | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<NodeResponse | null>(null);
  const [actorIdDraft, setActorIdDraft] = useState("");
  const [eventStatusDraft, setEventStatusDraft] = useState<"" | ProductStatus>("");
  const [recipientIdDraft, setRecipientIdDraft] = useState("");
  const [editingProduct, setEditingProduct] = useState<ProductResponse | null>(null);
  // NodePicker owns its own drill-down state internally; bumping this forces
  // both pickers to remount (and drop back to their root dropdown) on Reset.
  const [pickerResetKey, setPickerResetKey] = useState(0);

  function patchCommitted(patch: Partial<CommittedFilters>) {
    setCommitted((prev) => ({ ...prev, ...patch, offset: 0 }));
  }

  function applyFilters() {
    patchCommitted({
      locationId: locationDraft?.id ?? "",
      categoryId: categoryDraft?.id ?? "",
      actorId: actorIdDraft.trim(),
      eventStatus: eventStatusDraft,
      recipientId: recipientIdDraft.trim(),
    });
  }

  function resetFilters() {
    setLocationDraft(null);
    setCategoryDraft(null);
    setPickerResetKey((k) => k + 1);
    setActorIdDraft("");
    setEventStatusDraft("");
    setRecipientIdDraft("");
    setCommitted(defaultFilters());
  }

  const listQuery = useQuery({
    queryKey: ["products", tenantId, committed],
    queryFn: () =>
      listProducts(
        tenantId,
        {
          locationId: committed.locationId || undefined,
          categoryId: committed.categoryId || undefined,
          status: committed.status || undefined,
          actorId: committed.actorId || undefined,
          eventStatus: committed.eventStatus || undefined,
          recipientId: committed.recipientId || undefined,
          sortBy: committed.sortBy,
          sortOrder: committed.sortOrder,
          limit: committed.limit,
          offset: committed.offset,
        },
        token!,
      ),
    enabled: !!token && !!tenantId && canManage,
  });

  const products = listQuery.data ?? [];

  // Products only carry raw location_id/category_id UUIDs — resolve each
  // unique one seen on this page to a readable, translated node name.
  const uniqueNodeIds = Array.from(new Set(products.flatMap((p) => [p.location_id, p.category_id])));
  const nodeQueries = useQueries({
    queries: uniqueNodeIds.map((id) => ({
      queryKey: ["productNode", tenantId, id],
      queryFn: () => getNode(tenantId, id, token!),
      enabled: !!token && !!tenantId,
    })),
  });
  const nodeById = new Map<string, NodeResponse>();
  uniqueNodeIds.forEach((id, i) => {
    const data = nodeQueries[i]?.data;
    if (data) nodeById.set(id, data);
  });
  const nodeNameRefs = Array.from(new Set(Array.from(nodeById.values()).map((n) => `nodes.${n.name_key}`)));
  const nodeNamesQuery = useQuery({
    queryKey: ["productNodeNames", tenantId, locale, nodeNameRefs],
    queryFn: () => getTranslationsBatch(tenantId, locale, nodeNameRefs, token!),
    enabled: !!token && !!tenantId && nodeNameRefs.length > 0,
  });
  function nodeName(id: string): string {
    const node = nodeById.get(id);
    if (!node) return `${id.slice(0, 8)}…`;
    return nodeNamesQuery.data?.translations[`nodes.${node.name_key}`] || node.name_key;
  }

  function invalidateList() {
    queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
  }

  // added_by is gone from the response, so per-row ownership can't be checked
  // client-side anymore — .my-only staff see Edit on every row and the
  // backend's own ownership check (403 on someone else's product) is what
  // actually enforces it, surfaced through the same ApiError flash as any
  // other failed save.
  const canEditAnyProduct = canUpdateAny || canUpdateMy;

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.products.eyebrow")}</div>
          <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
            {t("console.areas.products.label")}
          </h1>
          <p className="urus-lede" style={{ maxWidth: "60ch" }}>
            {t("console.products.description")}
          </p>
        </div>
      </div>

      {!canManage && <p className="urus-lede">{t("console.products.noPermission")}</p>}

      {canManage && (
        <>
          <div className="urus-editor-toolbar">
            <span className="urus-toolbar-label">{t("console.common.filters")}</span>
            <button type="button" style={ghostBtn()} onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? t("console.common.hideFilters") : t("console.common.showFilters")}
            </button>
          </div>

          {filtersOpen && (
                <div
                  style={{
                    border: "2px solid var(--t-line, #201e1d)",
                    padding: "var(--space-4)",
                    marginBottom: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-4)",
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px" }}>
                      <span className="urus-field-label">{t("console.products.fieldLocation")}</span>
                      <NodePicker
                        key={`location-${pickerResetKey}`}
                        nodeType="location"
                        tenantId={tenantId}
                        token={token!}
                        locale={locale}
                        requireLeaf={false}
                        onChange={setLocationDraft}
                      />
                    </div>
                    <div style={{ flex: "1 1 220px" }}>
                      <span className="urus-field-label">{t("console.products.fieldCategory")}</span>
                      <NodePicker
                        key={`category-${pickerResetKey}`}
                        nodeType="category"
                        tenantId={tenantId}
                        token={token!}
                        locale={locale}
                        requireLeaf={false}
                        onChange={setCategoryDraft}
                      />
                    </div>
                    <label className="urus-field" style={{ flex: "1 1 160px" }}>
                      <span className="urus-field-label">{t("console.products.fieldStatus")}</span>
                      <select
                        className="urus-select"
                        value={committed.status}
                        onChange={(e) => patchCommitted({ status: e.target.value as "" | ProductStatus })}
                      >
                        <option value="">{t("console.products.any")}</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.products.fieldActorId")}</span>
                      <input
                        className="urus-input urus-input-mono"
                        value={actorIdDraft}
                        onChange={(e) => setActorIdDraft(e.target.value)}
                        placeholder={t("console.products.actorIdPlaceholder")}
                      />
                    </label>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.products.fieldEventStatus")}</span>
                      <select
                        className="urus-select"
                        value={eventStatusDraft}
                        onChange={(e) => setEventStatusDraft(e.target.value as "" | ProductStatus)}
                      >
                        <option value="">{t("console.products.anyAction")}</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.products.fieldRecipientId")}</span>
                      <input
                        className="urus-input urus-input-mono"
                        value={recipientIdDraft}
                        onChange={(e) => setRecipientIdDraft(e.target.value)}
                        placeholder={t("console.products.recipientIdPlaceholder")}
                      />
                    </label>
                    <button type="button" style={smallPrimaryBtn()} onClick={applyFilters}>
                      {t("console.common.apply")}
                    </button>
                  </div>
                  <p className="urus-field-hint" style={{ marginBottom: "var(--space-2)" }}>
                    {t("console.products.filterHint")}
                  </p>

                  <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.common.fieldSortBy")}</span>
                      <select
                        className="urus-select"
                        value={committed.sortBy}
                        onChange={(e) => patchCommitted({ sortBy: e.target.value as ProductSortBy })}
                      >
                        {SORT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.common.fieldOrder")}</span>
                      <select
                        className="urus-select"
                        value={committed.sortOrder}
                        onChange={(e) => patchCommitted({ sortOrder: e.target.value as "asc" | "desc" })}
                      >
                        <option value="asc">{t("console.common.ascending")}</option>
                        <option value="desc">{t("console.common.descending")}</option>
                      </select>
                    </label>
                    <label className="urus-field">
                      <span className="urus-field-label">{t("console.products.fieldPageSize")}</span>
                      <select
                        className="urus-select"
                        value={committed.limit}
                        onChange={(e) => patchCommitted({ limit: Number(e.target.value) })}
                      >
                        {[10, 25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" style={ghostBtn()} onClick={resetFilters}>
                      {t("console.products.resetAll")}
                    </button>
                  </div>
                </div>
              )}

          <div className="urus-card-list">
            {products.map((p) => (
              <div key={p.id} style={cardStyle(false)}>
                <div className="urus-card-head">
                  <span className="urus-card-type">{p.status}</span>
                  <span className="urus-card-ref">{nodeName(p.location_id)}</span>
                  <span className="urus-card-ref">{nodeName(p.category_id)}</span>
                  <div style={{ flex: 1 }} />
                  {canEditAnyProduct && (
                    <button type="button" style={ghostBtn()} onClick={() => setEditingProduct(p)}>
                      {t("console.common.edit")}
                    </button>
                  )}
                </div>
                {p.description && <p className="urus-card-text">{p.description}</p>}
                <div className="urus-card-tags">
                  <span className="urus-tag-outline-soft">{t("console.products.mediaCount", { count: p.media_ids.length })}</span>
                  {p.discount_value && (
                    <span className="urus-tag-dashed">
                      −{p.discount_value}
                      {p.discount_type === "percent" ? "%" : ""}
                    </span>
                  )}
                  {p.sold_price && (
                    <span className="urus-tag-outline-soft">{t("console.products.soldAt", { price: p.sold_price })}</span>
                  )}
                  <span className="urus-muted">
                    {t("console.products.createdOn", { date: new Date(p.created_at).toLocaleDateString() })}
                  </span>
                </div>
              </div>
            ))}
            {listQuery.isLoading && <p className="urus-lede">{t("console.common.loading")}</p>}
            {listQuery.isError && <p className="urus-lede">{t("console.products.loadFailed")}</p>}
            {!listQuery.isLoading && !listQuery.isError && products.length === 0 && (
              <p className="urus-lede">{t("console.products.empty")}</p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-4)" }}>
            <button
              type="button"
              style={ghostBtn()}
              disabled={committed.offset === 0}
              onClick={() => setCommitted((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            >
              {t("console.common.prev")}
            </button>
            <span className="urus-tabnum">
              {products.length > 0 ? `${committed.offset + 1}–${committed.offset + products.length}` : "0"}
            </span>
            <button
              type="button"
              style={ghostBtn()}
              disabled={products.length < committed.limit}
              onClick={() => setCommitted((prev) => ({ ...prev, offset: prev.offset + prev.limit }))}
            >
              {t("console.common.next")}
            </button>
          </div>
        </>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          tenantId={tenantId}
          token={token!}
          canSetDiscount={canSetDiscount}
          onClose={() => setEditingProduct(null)}
          onSaved={invalidateList}
        />
      )}
    </main>
  );
}
