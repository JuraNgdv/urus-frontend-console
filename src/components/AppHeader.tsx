"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale, LOCALES } from "@/lib/locale/LocaleContext";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { useTenantTheme } from "@/lib/theme/ThemeContext";

export function AppHeader({
  hasAnyArea,
  onToggleDrawer,
}: {
  hasAnyArea: boolean;
  onToggleDrawer: () => void;
}) {
  const { claims, identifier, logout } = useAuth();
  const { locale, setLocale } = useLocale();
  const t = useSystemT();
  const { theme } = useTenantTheme();

  return (
    <header className="urus-header">
      {hasAnyArea && (
        <button type="button" onClick={onToggleDrawer} aria-label="Open menu" className="urus-hamburger">
          <span />
          <span />
          <span />
        </button>
      )}
      <Link href="/" className="urus-logo-btn">
        {theme.logo}
      </Link>
      <div className="urus-tenant-chip">{claims?.tenant_slug}</div>
      <div style={{ flex: 1 }} />
      <label className="urus-locale-field">
        {t("console.header.localeLabel")}
        <select value={locale} onChange={(e) => setLocale(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <div className="urus-identifier">{identifier}</div>
      <button type="button" onClick={logout} className="urus-outline-btn">
        {t("console.header.signOut")}
      </button>
    </header>
  );
}
