"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { LocaleProvider } from "@/lib/locale/LocaleContext";
import { SystemI18nProvider, useSystemT } from "@/lib/i18n/SystemI18nContext";
import { AppHeader } from "@/components/AppHeader";
import { Drawer } from "@/components/Drawer";
import { visibleAreas, type AreaDef } from "@/lib/areas";

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, token, claims, permissions } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  if (!ready || !token || !claims) return null;

  const areas = visibleAreas(permissions);
  // The home page already lists every accessible area as its main content,
  // so the hamburger/drawer shortcut is only useful (and only shown) elsewhere.
  const isHome = pathname === "/";

  function handleNavigate(area: AreaDef) {
    setDrawerOpen(false);
    if (area.href) {
      router.push(area.href);
      return;
    }
    flash(t("console.common.notReady", { label: t(area.labelKey) }));
  }

  return (
    <>
      <AppHeader hasAnyArea={!isHome && areas.length > 0} onToggleDrawer={() => setDrawerOpen((v) => !v)} />
      <div className="urus-content">{children}</div>
      {drawerOpen && <Drawer areas={areas} onClose={() => setDrawerOpen(false)} onNavigate={handleNavigate} />}
    </>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <SystemI18nProvider>
        <ConsoleShell>{children}</ConsoleShell>
      </SystemI18nProvider>
    </LocaleProvider>
  );
}
