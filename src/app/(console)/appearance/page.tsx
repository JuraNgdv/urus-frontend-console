"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { useTenantTheme } from "@/lib/theme/ThemeContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { chipStyle, ghostBtn, primaryBtn, swatchStyle } from "@/components/ui/styles";
import { ACCENTS, BACKGROUNDS, DARK_SURFACES, FONTS, LIGHT_SURFACES } from "@/lib/theme/tokens";

export default function AppearancePage() {
  const { claims } = useAuth();
  const { theme, setTheme, resetTheme } = useTenantTheme();
  const flash = useToast();
  const t = useSystemT();

  const surfaces = theme.scheme === "dark" ? DARK_SURFACES : LIGHT_SURFACES;

  return (
    <main className="urus-appearance-main">
      <section>
        <div className="urus-eyebrow">{t("console.appearance.eyebrow")}</div>
        <h1 className="urus-display-sm" style={{ marginBottom: "var(--space-2)" }}>
          {t("console.areas.appearance.label")}
        </h1>
        <p className="urus-lede" style={{ maxWidth: "56ch" }}>
          {t("console.appearance.description")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div>
            <div className="urus-app-section-title">{t("console.appearance.scheme")}</div>
            <div className="urus-swatch-row">
              <button
                type="button"
                style={chipStyle(theme.scheme === "light")}
                onClick={() => setTheme({ scheme: "light", surface: LIGHT_SURFACES[0] })}
              >
                {t("console.appearance.light")}
              </button>
              <button
                type="button"
                style={chipStyle(theme.scheme === "dark")}
                onClick={() => setTheme({ scheme: "dark", surface: DARK_SURFACES[0] })}
              >
                {t("console.appearance.dark")}
              </button>
            </div>
          </div>

          <div>
            <div className="urus-app-section-title">{t("console.appearance.accent")}</div>
            <div className="urus-swatch-row">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  style={swatchStyle(c, theme.accent === c)}
                  onClick={() => setTheme({ accent: c })}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="urus-app-section-title">{t("console.appearance.surface")}</div>
            <div className="urus-swatch-row">
              {surfaces.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  style={swatchStyle(c, theme.surface === c)}
                  onClick={() => setTheme({ surface: c })}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="urus-app-section-title">{t("console.appearance.background")}</div>
            <div className="urus-swatch-row" style={{ marginBottom: "var(--space-3)" }}>
              {BACKGROUNDS.map((b) => (
                <button key={b.id} type="button" style={chipStyle(theme.bg === b.id)} onClick={() => setTheme({ bg: b.id })}>
                  {t(b.labelKey)}
                </button>
              ))}
            </div>
            <label className="urus-field">
              <span className="urus-field-label">{t("console.appearance.bgImage")}</span>
              <input
                className="urus-input urus-input-mono"
                value={theme.bgUrl}
                onChange={(e) => setTheme({ bgUrl: e.target.value, bg: e.target.value ? "image" : theme.bg })}
                placeholder={t("console.appearance.imageUrlPlaceholder")}
                spellCheck={false}
              />
              <span className="urus-field-hint">{t("console.appearance.imageUrlHint")}</span>
            </label>
            <label className="urus-field" style={{ marginTop: "var(--space-3)" }}>
              <span className="urus-field-label">{t("console.appearance.overlayLabel", { overlay: theme.overlay })}</span>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={theme.overlay}
                onChange={(e) => setTheme({ overlay: Number(e.target.value) })}
                style={{ accentColor: "var(--t-accent, #ec3013)" }}
              />
            </label>
          </div>

          <div>
            <div className="urus-app-section-title">{t("console.appearance.typeface")}</div>
            <div className="urus-swatch-row">
              {FONTS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  style={chipStyle(theme.font === f.value)}
                  onClick={() => setTheme({ font: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="urus-app-section-title">{t("console.appearance.wordmark")}</div>
            <input
              className="urus-input"
              value={theme.logo}
              onChange={(e) => setTheme({ logo: e.target.value })}
              spellCheck={false}
            />
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryBtn()}
              onClick={() => flash(t("console.appearance.toast.saved", { slug: claims?.tenant_slug ?? "" }))}
            >
              {t("console.appearance.saveTheme")}
            </button>
            <button
              type="button"
              style={ghostBtn()}
              onClick={() => {
                resetTheme();
                flash(t("console.appearance.toast.reset"));
              }}
            >
              {t("console.appearance.resetDefault")}
            </button>
          </div>
        </div>
      </section>

      <aside className="urus-aside" style={{ position: "sticky", top: "var(--space-4)" }}>
        <div className="urus-aside-title">{t("console.appearance.liveSample")}</div>
        <div style={{ border: "2px solid var(--t-line, #201e1d)" }}>
          <div className="urus-live-sample-head">
            <span style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{theme.logo}</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--t-muted, #605d5d)" }}>
              {claims?.tenant_slug}
            </span>
          </div>
          <div className="urus-live-sample-body">
            <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1, letterSpacing: "-0.03em", textTransform: "uppercase" }}>
              {t("console.appearance.sampleHeading")}
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--t-muted, #605d5d)" }}>{t("console.appearance.sampleBody")}</p>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={primaryBtn()}>{t("console.appearance.samplePrimary")}</span>
              <span style={ghostBtn()}>{t("console.appearance.sampleSecondary")}</span>
            </div>
          </div>
        </div>
        <p className="urus-endpoint-hint">PUT /tenants/{"{tenant_id}"}/configs/appearance (not documented — stub)</p>
      </aside>
    </main>
  );
}
