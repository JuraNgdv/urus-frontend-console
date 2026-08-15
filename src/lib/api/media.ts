import { apiFetch, apiUpload } from "./client";
import type { MediaAttachmentResponse, MediaEntityType, MediaResponse } from "../types";

export function uploadMedia(tenantId: string, file: File, token: string) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<MediaResponse>(`/tenants/${tenantId}/media`, formData, token);
}

export function attachMedia(
  tenantId: string,
  entityType: MediaEntityType,
  entityId: string,
  mediaId: string,
  orderIndex: number,
  token: string,
) {
  return apiFetch<MediaAttachmentResponse>(`/tenants/${tenantId}/media-attachments/${entityType}/${entityId}`, {
    method: "POST",
    body: { media_id: mediaId, order_index: orderIndex },
    token,
  });
}

export function listMediaAttachments(tenantId: string, entityType: MediaEntityType, entityId: string, token: string) {
  return apiFetch<MediaAttachmentResponse[]>(`/tenants/${tenantId}/media-attachments/${entityType}/${entityId}`, {
    token,
  });
}

export function mediaUrl(media: MediaResponse): string {
  if (/^https?:\/\//.test(media.path)) return media.path;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
  const path = media.path.startsWith("/") ? media.path : `/${media.path}`;
  return `${base}/media_storage${path}`;
}
