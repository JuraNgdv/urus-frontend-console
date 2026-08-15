import type { CSSProperties } from "react";

// Ported from Admin Console.dc.html's Component style-helper methods
// (tab, primaryBtn, ghostBtn, chipStyle, swatchStyle, cardStyle, toggleStyle).
// Kept as inline-style-producing functions rather than CSS classes so they
// stay reactive to the live --t-* theme variables exactly like the mockup.

export function tabStyle(active: boolean): CSSProperties {
  return {
    background: "transparent",
    border: "none",
    borderBottom: `4px solid ${active ? "var(--t-accent, #ec3013)" : "transparent"}`,
    color: active ? "var(--t-text, #201e1d)" : "var(--t-muted, #605d5d)",
    fontWeight: 700,
    fontSize: 17,
    textTransform: "uppercase",
    letterSpacing: "-0.01em",
    padding: "0 0 8px",
    marginBottom: -2,
    cursor: "pointer",
  };
}

export function primaryBtn(): CSSProperties {
  return {
    display: "inline-block",
    background: "var(--t-accent, #ec3013)",
    color: "var(--t-accent-ink, #fff)",
    border: "2px solid var(--t-accent, #ec3013)",
    padding: "10px 16px",
    cursor: "pointer",
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: 13,
    fontWeight: 600,
  };
}

export function smallPrimaryBtn(): CSSProperties {
  return {
    background: "var(--t-accent, #ec3013)",
    color: "var(--t-accent-ink, #fff)",
    border: "2px solid var(--t-accent, #ec3013)",
    padding: "5px 11px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: 12,
    fontWeight: 600,
  };
}

export function ghostBtn(): CSSProperties {
  return {
    display: "inline-block",
    background: "transparent",
    color: "inherit",
    border: "2px solid var(--t-line, #201e1d)",
    padding: "5px 11px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: 12,
    fontWeight: 600,
  };
}

export function chipStyle(active: boolean): CSSProperties {
  return {
    background: active ? "var(--t-accent, #ec3013)" : "transparent",
    color: active ? "var(--t-accent-ink, #fff)" : "inherit",
    border: `2px solid ${active ? "var(--t-accent, #ec3013)" : "var(--t-line, #201e1d)"}`,
    padding: "7px 13px",
    cursor: "pointer",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
  };
}

export function swatchStyle(color: string, active: boolean): CSSProperties {
  return {
    width: 40,
    height: 40,
    background: color,
    border: `${active ? 4 : 2}px solid var(--t-line, #201e1d)`,
    cursor: "pointer",
    padding: 0,
  };
}

export function cardStyle(dragging: boolean): CSSProperties {
  return {
    border: `2px solid ${dragging ? "var(--t-accent, #ec3013)" : "var(--t-line-soft, rgba(32,30,29,0.18))"}`,
    padding: "var(--space-4)",
    background: "var(--t-surface, #fff)",
    opacity: dragging ? 0.55 : 1,
  };
}

export function toggleStyle(on: boolean): CSSProperties {
  return {
    alignSelf: "flex-start",
    background: on ? "var(--t-accent, #ec3013)" : "transparent",
    color: on ? "var(--t-accent-ink, #fff)" : "var(--t-muted, #605d5d)",
    border: `2px solid ${on ? "var(--t-accent, #ec3013)" : "var(--t-line, #201e1d)"}`,
    padding: "5px 12px",
    fontSize: 13,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}
