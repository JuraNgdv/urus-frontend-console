import { headers } from "next/headers";
import { resolveTenantSlug } from "@/lib/server/tenantResolve";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const tenant = await resolveTenantSlug(host);

  return (
    <>
      <header className="urus-header">
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Tenant Console
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--t-muted, #605d5d)" }}>
          BFF / Admin
        </div>
      </header>
      <main className="urus-auth-main">
        <section>
          <div className="urus-eyebrow">Step 01</div>
          <h1 className="urus-display">Sign in to your tenant</h1>
          <div className="urus-rule" />
          <p className="urus-lede">
            Access to each area is granted by permission. After signing in you only see the controls your
            roles allow — a user without <span className="urus-input-mono">menus.manage</span> sees no menu
            settings at all.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-muted, #605d5d)", maxWidth: "46ch" }}>
            The tenant is resolved automatically from the domain you&apos;re signing in on.
          </p>
        </section>
        <section className="urus-auth-card">
          {tenant.ok ? (
            <LoginForm tenantSlug={tenant.tenantSlug} />
          ) : (
            <div className="urus-form-col">
              <div className="urus-error">
                Couldn&apos;t resolve a tenant for this domain{tenant.host ? ` (${tenant.host})` : ""}. Check the
                URL or contact your administrator.
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
