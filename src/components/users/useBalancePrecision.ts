"use client";

import { useQuery } from "@tanstack/react-query";
import { getTenantConfig } from "@/lib/api/configs";

const DEFAULT_PRECISION = 2;

// balance_precision isn't in the seeded config list documented in
// docs/config-system.md, but the backend has it. Falls back to 2dp (the
// standard for currency) if it's missing, not a number, or the fetch fails —
// this only affects display rounding, never what's actually sent to the API.
export function useBalancePrecision(tenantId: string, token: string | null): number {
  const query = useQuery({
    queryKey: ["tenantConfig", tenantId, "balance_precision"],
    queryFn: () => getTenantConfig(tenantId, "balance_precision", token!),
    enabled: !!token && !!tenantId,
  });
  const value = query.data?.value;
  return typeof value === "number" ? value : DEFAULT_PRECISION;
}

export function formatBalance(value: string, precision: number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(precision) : value;
}
