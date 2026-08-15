"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME, type TenantTheme } from "./tokens";

interface ThemeContextValue {
  theme: TenantTheme;
  setTheme: (patch: Partial<TenantTheme>) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function storageKey(tenantId: string | null) {
  return `urus_admin_theme_${tenantId ?? "anon"}`;
}

// There is no documented appearance-persistence endpoint (see plan gap #3),
// so the theme is kept per-tenant in localStorage until a real endpoint exists.
export function ThemeProvider({
  tenantId,
  children,
}: {
  tenantId: string | null;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<TenantTheme>(DEFAULT_THEME);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey(tenantId)) : null;
    // Rehydrating from localStorage (an external store) whenever the tenant
    // changes — the canonical exception the lint rule's own description
    // carves out, not a derived-state anti-pattern.
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeState({ ...DEFAULT_THEME, ...JSON.parse(raw) });
        return;
      } catch {
        // fall through to default
      }
    }
    setThemeState(DEFAULT_THEME);
  }, [tenantId]);

  const setTheme = useCallback(
    (patch: Partial<TenantTheme>) => {
      setThemeState((prev) => {
        const next = { ...prev, ...patch };
        localStorage.setItem(storageKey(tenantId), JSON.stringify(next));
        return next;
      });
    },
    [tenantId],
  );

  const resetTheme = useCallback(() => {
    localStorage.removeItem(storageKey(tenantId));
    setThemeState(DEFAULT_THEME);
  }, [tenantId]);

  return <ThemeContext.Provider value={{ theme, setTheme, resetTheme }}>{children}</ThemeContext.Provider>;
}

export function useTenantTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTenantTheme must be used within ThemeProvider");
  return ctx;
}
