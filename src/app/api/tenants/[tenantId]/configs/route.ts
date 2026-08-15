import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bffFetchJson, requireConfigsManage } from "@/lib/server/configProxy";
import type { ConfigEntryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Only intercepts GET /tenants/{tenantId}/configs (this exact path depth) —
// PUT /tenants/{tenantId}/configs/{key} is one segment deeper, so it doesn't
// match this route file and falls through to the plain next.config.ts rewrite,
// going straight to the backend with the caller's own JWT as intended.
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  const denied = await requireConfigsManage(request, tenantId);
  if (denied) return denied;

  const result = await bffFetchJson<ConfigEntryResponse[]>(`/tenants/${tenantId}/configs`);
  if (!result.ok) return result.response;

  return NextResponse.json(result.data);
}
