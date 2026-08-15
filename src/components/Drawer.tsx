"use client";

import type { AreaDef } from "@/lib/areas";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";

export function Drawer({
  areas,
  onClose,
  onNavigate,
}: {
  areas: AreaDef[];
  onClose: () => void;
  onNavigate: (area: AreaDef) => void;
}) {
  const t = useSystemT();

  return (
    <>
      <div className="urus-drawer-backdrop" onClick={onClose} />
      <aside className="urus-drawer">
        <div className="urus-drawer-head">
          <div className="urus-drawer-title">{t("console.common.manage")}</div>
          <button type="button" onClick={onClose} aria-label={t("console.common.close")} className="urus-modal-close">
            ×
          </button>
        </div>
        <nav className="urus-drawer-nav">
          {areas.map((area) => (
            <button key={area.id} type="button" className="urus-drawer-item" onClick={() => onNavigate(area)}>
              <span className="urus-drawer-item-label">{t(area.labelKey)}</span>
              <span className="urus-drawer-item-desc">{t(area.descriptionKey)}</span>
              <span className="urus-drawer-item-perm">{area.permission}</span>
            </button>
          ))}
        </nav>
        <p className="urus-drawer-footnote">{t("console.drawer.footnote")}</p>
      </aside>
    </>
  );
}
