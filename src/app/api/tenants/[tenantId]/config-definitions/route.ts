import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bffFetchJson, requireConfigsManage } from "@/lib/server/configProxy";
import type { ConfigDefinitionResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  const denied = await requireConfigsManage(request, tenantId);
  if (denied) return denied;

  const result = await bffFetchJson<ConfigDefinitionResponse[]>(`/tenants/${tenantId}/config-definitions`);
  if (!result.ok) return result.response;

  // Belt-and-suspenders: the backend endpoint already pre-filters to
  // is_visible entries, but this BFF is the one place that's supposed to
  // guarantee hidden configs never reach the browser, so it filters again.
  return NextResponse.json(result.data.filter((d) => d.is_visible));
}
