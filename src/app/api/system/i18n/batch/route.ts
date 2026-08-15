import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bffFetchJson } from "@/lib/server/configProxy";
import type { TranslationBatchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Proxies the backend's BFF-only GET /system/i18n/batch (admin-console UI
// copy, not tenant content) so BFF_TOKEN never reaches the browser. Unlike
// the tenant config proxy, this endpoint isn't permission-gated on the
// backend either — it's the same generic UI strings for every signed-in admin.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");
  const keys = searchParams.getAll("keys");
  if (!locale || keys.length === 0) {
    return NextResponse.json<TranslationBatchResponse>({ translations: {} });
  }

  const query = new URLSearchParams();
  query.set("locale", locale);
  for (const key of keys) query.append("keys", key);

  const result = await bffFetchJson<TranslationBatchResponse>(`/system/i18n/batch?${query.toString()}`);
  if (!result.ok) return result.response;
  return NextResponse.json(result.data);
}
