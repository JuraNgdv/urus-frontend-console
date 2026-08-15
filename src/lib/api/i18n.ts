import { apiFetch } from "./client";
import type { TranslationBatchResponse } from "../types";

export function getTranslationsBatch(tenantId: string, locale: string, keys: string[], token: string) {
  if (keys.length === 0) return Promise.resolve<TranslationBatchResponse>({ translations: {} });
  const unique = Array.from(new Set(keys));
  return apiFetch<TranslationBatchResponse>(`/i18n/batch`, {
    token,
    // FastAPI's `keys: Annotated[list[str], Query()]` expects the query
    // param repeated as plain `keys=a&keys=b`, not bracketed `keys[]=`.
    query: { tenant_id: tenantId, locale, keys: unique },
  });
}

// GET /system/i18n/batch — admin-console UI copy (see SystemI18nContext), not
// tenant content, so no tenant_id and no token: it's proxied server-side
// (src/app/api/system/i18n/batch/route.ts) using the BFF token instead.
export function getSystemTranslationsBatch(locale: string, keys: string[]) {
  if (keys.length === 0) return Promise.resolve<TranslationBatchResponse>({ translations: {} });
  const unique = Array.from(new Set(keys));
  return apiFetch<TranslationBatchResponse>(`/system/i18n/batch`, {
    query: { locale, keys: unique },
  });
}

export function putTranslation(
  tenantId: string,
  namespace: string,
  key: string,
  locale: string,
  value: string,
  token: string,
) {
  return apiFetch<{ value: string }>(
    `/tenants/${tenantId}/i18n/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`,
    { method: "PUT", body: { value }, token, query: { locale } },
  );
}

export function deleteTranslation(tenantId: string, namespace: string, key: string, locale: string, token: string) {
  return apiFetch<void>(`/tenants/${tenantId}/i18n/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, {
    method: "DELETE",
    token,
    query: { locale },
  });
}

// Buttons carry an explicit text_namespace field, so their PUT target is unambiguous.
// Menu blocks only store a single flat `text_ref` (e.g. "menus.main.welcome") with no
// separate namespace field in the documented content schema — this splits it as
// namespace = text before the first dot, key = the remainder. Flagged in the plan as
// an assumption to confirm against the real backend's i18n key convention.
export function splitRefIntoNamespaceKey(ref: string): { namespace: string; key: string } {
  const dot = ref.indexOf(".");
  if (dot === -1) return { namespace: ref, key: ref };
  return { namespace: ref.slice(0, dot), key: ref.slice(dot + 1) };
}
