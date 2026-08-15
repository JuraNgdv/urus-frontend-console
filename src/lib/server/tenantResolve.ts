// Server-only: resolves the tenant slug for the current request's host by
// calling the backend's public /tenants/resolve endpoint. Only ever imported
// from src/app/login/page.tsx (a Server Component), so this fetch never runs
// in the browser — see AGENTS.md's requirement that resolution stay server-side.

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN;
// Local-dev override: when set (e.g. in .env.local while developing on
// localhost, which has no tenant subdomain to resolve), this skips the
// network call entirely and the given slug is used as-is.
const TENANT_SLUG = process.env.TENANT_SLUG;

export type TenantResolveResult = { ok: true; tenantSlug: string } | { ok: false; host: string };

export async function resolveTenantSlug(host: string): Promise<TenantResolveResult> {
  if (TENANT_SLUG) return { ok: true, tenantSlug: TENANT_SLUG };

  if (!BACKEND_ORIGIN || !host) return { ok: false, host };

  try {
    const res = await fetch(`${BACKEND_ORIGIN}/tenants/resolve?host=${encodeURIComponent(host)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, host };

    const data = (await res.json()) as { tenant_slug?: string };
    if (!data.tenant_slug) return { ok: false, host };
    return { ok: true, tenantSlug: data.tenant_slug };
  } catch {
    return { ok: false, host };
  }
}
