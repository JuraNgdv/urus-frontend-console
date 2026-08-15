import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Server-only: reads BACKEND_ORIGIN/BFF_TOKEN, which must never reach the
// browser bundle. Only ever imported from src/app/api/**/route.ts handlers.

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN;
const BFF_TOKEN = process.env.BFF_TOKEN;

function backendUrl(path: string): string {
  if (!BACKEND_ORIGIN) throw new Error("BACKEND_ORIGIN is not configured");
  return `${BACKEND_ORIGIN}${path}`;
}

function errorResponse(status: number, detail: string): NextResponse {
  return NextResponse.json({ detail }, { status });
}

// The backend's TMA config endpoints only check the tenant exists (get_tenant_or_404) —
// they don't enforce configs.manage. So before this BFF spends its privileged bff_token
// on the caller's behalf, it re-verifies the caller's own permissions itself, using their
// forwarded JWT against /me/permissions (never trusting a client-supplied permission list).
export async function requireConfigsManage(request: NextRequest, tenantId: string): Promise<NextResponse | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return errorResponse(401, "Missing bearer token");
  }

  let res: Response;
  try {
    res = await fetch(backendUrl(`/tenants/${tenantId}/me/permissions`), {
      headers: { Authorization: auth },
      cache: "no-store",
    });
  } catch {
    return errorResponse(502, "Couldn't reach the backend");
  }

  if (!res.ok) {
    return errorResponse(res.status === 401 ? 401 : 502, "Couldn't verify permissions");
  }

  const data = (await res.json()) as { permissions?: string[] };
  if (!data.permissions?.includes("configs.manage")) {
    return errorResponse(403, "configs.manage required");
  }
  return null;
}

type BffFetchResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function bffFetchJson<T>(path: string): Promise<BffFetchResult<T>> {
  if (!BFF_TOKEN) {
    return { ok: false, response: errorResponse(500, "BFF_TOKEN is not configured") };
  }

  let res: Response;
  try {
    res = await fetch(backendUrl(path), { headers: { "X-BFF-Token": BFF_TOKEN }, cache: "no-store" });
  } catch {
    return { ok: false, response: errorResponse(502, "Couldn't reach the backend") };
  }

  const text = await res.text();
  if (!res.ok) {
    const passthrough = new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
    return { ok: false, response: passthrough };
  }

  return { ok: true, data: (text ? JSON.parse(text) : undefined) as T };
}
