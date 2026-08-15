// `||` (not `??`) so an empty-string override in .env — e.g. an unset-looking
// `NEXT_PUBLIC_API_BASE_URL=` line — also falls back to the default, since an
// empty base would silently stop matching the /api/* dev proxy rewrite below.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

type QueryValue = string | number | boolean | string[] | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  query?: Record<string, QueryValue>;
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, "Session expired — please sign in again.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const detail = data && typeof data === "object" ? (data as Record<string, unknown>).detail : undefined;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? JSON.stringify(detail) : res.statusText;
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }

  return data as T;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, query } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(res);
}

// Multipart upload — no Content-Type header so the browser sets the
// multipart boundary itself; everything else mirrors apiFetch.
export async function apiUpload<T>(path: string, formData: FormData, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse<T>(res);
}
