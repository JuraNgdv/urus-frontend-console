"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { ThemeProvider, useTenantTheme } from "@/lib/theme/ThemeContext";
import { computeThemeVars } from "@/lib/theme/tokens";

function Inner({ children }: { children: React.ReactNode }) {
  const { theme } = useTenantTheme();
  return (
    <div style={computeThemeVars(theme)}>
      <div className="urus-page">{children}</div>
    </div>
  );
}

// Applies the tenant theme's --t-* CSS variables at the app root, exactly
// like the mockup's outer themeStyle() wrapper div — before login this is
// just the default theme; once signed in it becomes the tenant's saved theme.
export function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { claims } = useAuth();
  return (
    <ThemeProvider tenantId={claims?.tenant_id ?? null}>
      <Inner>{children}</Inner>
    </ThemeProvider>
  );
}
