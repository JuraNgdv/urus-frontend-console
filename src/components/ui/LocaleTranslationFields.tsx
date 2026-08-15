"use client";

import { LOCALES } from "@/lib/locale/LocaleContext";

// One row per available content language — used wherever a piece of tenant
// content (menu/keyboard text, node names, level labels, ...) needs a
// translation per locale. Independent of the admin interface's own display
// language (see LocaleContext's useLocale) — this always lists every
// content locale, regardless of which one the admin UI itself is shown in.
export function LocaleTranslationFields({
  values,
  onChange,
  disabled,
}: {
  values: Record<string, string>;
  onChange: (code: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {LOCALES.map((l) => (
        <div key={l.code} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, fontSize: 12, textTransform: "uppercase", color: "var(--t-muted, #605d5d)" }}>
            {l.code}
          </span>
          <input
            className="urus-input urus-input-mono"
            style={{ flex: 1 }}
            value={values[l.code] ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(l.code, e.target.value)}
            placeholder={l.label}
          />
        </div>
      ))}
    </div>
  );
}
