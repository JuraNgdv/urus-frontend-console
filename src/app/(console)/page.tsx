"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { visibleAreas, type AreaDef } from "@/lib/areas";

export default function HomePage() {
  const router = useRouter();
  const flash = useToast();
  const t = useSystemT();
  const { permissions, permissionsLoaded } = useAuth();
  const areas = visibleAreas(permissions);

  function handleNavigate(area: AreaDef) {
    if (area.href) {
      router.push(area.href);
      return;
    }
    flash(t("console.common.notReady", { label: t(area.labelKey) }));
  }

  if (permissionsLoaded && areas.length === 0) {
    return (
      <main className="urus-home">
        <div className="urus-home-inner">
          <div className="urus-eyebrow">{t("console.home.eyebrow")}</div>
          <h1 className="urus-display">{t("console.home.emptyTitle")}</h1>
          <div className="urus-rule" />
          <p className="urus-lede" style={{ maxWidth: "52ch" }}>
            {t("console.home.emptyBody")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="urus-home">
      <div className="urus-home-inner">
        <div className="urus-eyebrow">{t("console.home.eyebrow")}</div>
        <h1 className="urus-display">{t("console.common.manage")}</h1>
        <div className="urus-rule" />
        <p className="urus-lede" style={{ maxWidth: "52ch" }}>
          {t("console.home.body")}
        </p>
        <div className="urus-home-areas">
          {!permissionsLoaded && <span className="urus-mono-chip">{t("console.home.loading")}</span>}
          {areas.map((area) => (
            <button key={area.id} type="button" className="urus-area-card" onClick={() => handleNavigate(area)}>
              <span className="urus-area-card-label">{t(area.labelKey)}</span>
              <span className="urus-area-card-desc">{t(area.descriptionKey)}</span>
              <span className="urus-area-card-perm">{area.permission}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
