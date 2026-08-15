"use client";

import { useSystemT } from "@/lib/i18n/SystemI18nContext";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useSystemT();

  return (
    <div className="urus-modal-backdrop">
      <div className="urus-modal">
        <div className="urus-modal-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} className="urus-modal-close" aria-label={t("console.common.close")}>
            ×
          </button>
        </div>
        <div className="urus-modal-body">{children}</div>
        {footer && <div className="urus-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
