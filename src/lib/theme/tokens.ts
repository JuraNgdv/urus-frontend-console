import type { CSSProperties } from "react";
import type { SystemStringKey } from "@/lib/i18n/SystemI18nContext";

// Ported 1:1 from Admin Console.dc.html's Component.theme()/themeStyle() —
// pure color math, no reason to redesign it.

export type Scheme = "light" | "dark";
export type BackgroundKind = "none" | "grid" | "diagonal" | "image";

export interface TenantTheme {
  scheme: Scheme;
  accent: string;
  surface: string;
  bg: BackgroundKind;
  bgUrl: string;
  overlay: number;
  font: string;
  logo: string;
}

export const DEFAULT_THEME: TenantTheme = {
  scheme: "light",
  accent: "#ec3013",
  surface: "#ffffff",
  bg: "none",
  bgUrl: "",
  overlay: 40,
  font: "Archivo",
  logo: "Tenant Console",
};

export const ACCENTS = ["#ec3013", "#1f5cf0", "#0f8a5f", "#7b3fe4", "#c98a00"];
export const LIGHT_SURFACES = ["#ffffff", "#f3f2f2", "#eae7e7", "#efeae2"];
export const DARK_SURFACES = ["#232120", "#1b1f24", "#201b26", "#14201c"];

export const FONTS = [
  { label: "Archivo", value: "Archivo" },
  { label: "IBM Plex Sans", value: "IBM Plex Sans" },
  { label: "Space Grotesk", value: "Space Grotesk" },
];

export const BACKGROUNDS: { id: BackgroundKind; labelKey: SystemStringKey }[] = [
  { id: "none", labelKey: "console.appearance.bgNone" },
  { id: "grid", labelKey: "console.appearance.bgGrid" },
  { id: "diagonal", labelKey: "console.appearance.bgDiagonal" },
  { id: "image", labelKey: "console.appearance.bgImage" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `rgb(${out.join(",")})`;
}

function rgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex).join(",")},${alpha})`;
}

export function computeThemeVars(theme: TenantTheme): CSSProperties {
  const dark = theme.scheme === "dark";
  const ink = dark ? "#f3f2f2" : "#201e1d";
  const ground = dark ? "#141312" : "#f3f2f2";
  const line = dark ? rgba("#f3f2f2", 0.42) : rgba("#201e1d", 0.42);
  const lineSoft = dark ? rgba("#f3f2f2", 0.16) : rgba("#201e1d", 0.16);
  const muted = dark ? mix("#f3f2f2", "#141312", 0.42) : mix("#201e1d", "#f3f2f2", 0.42);
  const accentOnBg = dark
    ? luminance(theme.accent) < 0.3
      ? mix(theme.accent, "#ffffff", 0.45)
      : theme.accent
    : luminance(theme.accent) > 0.55
      ? mix(theme.accent, "#000000", 0.35)
      : theme.accent;

  let image = "none";
  if (theme.bg === "grid") {
    image = `repeating-linear-gradient(0deg, ${lineSoft} 0 1px, transparent 1px 56px), repeating-linear-gradient(90deg, ${lineSoft} 0 1px, transparent 1px 56px)`;
  } else if (theme.bg === "diagonal") {
    image = `repeating-linear-gradient(45deg, ${rgba(theme.accent, 0.12)} 0 2px, transparent 2px 18px)`;
  } else if (theme.bg === "image" && theme.bgUrl) {
    image = `url("${theme.bgUrl}")`;
  }
  const scrim =
    theme.bg === "image" && theme.bgUrl
      ? dark
        ? rgba("#141312", theme.overlay / 100)
        : rgba("#f3f2f2", theme.overlay / 100)
      : "transparent";

  return {
    "--t-text": ink,
    "--t-bg-solid": ground,
    "--t-surface": theme.surface,
    "--t-line": line,
    "--t-line-soft": lineSoft,
    "--t-muted": muted,
    "--t-accent": theme.accent,
    "--t-accent-ink-on-bg": accentOnBg,
    "--t-accent-ink": luminance(theme.accent) > 0.55 ? "#201e1d" : "#ffffff",
    "--t-tint": rgba(theme.accent, 0.1),
    "--t-scrim": scrim,
    "--t-font": `"${theme.font}"`,
    backgroundColor: ground,
    backgroundImage: image,
    backgroundSize: theme.bg === "image" ? "cover" : "auto",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  } as CSSProperties;
}
