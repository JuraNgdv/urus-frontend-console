"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "../locale/LocaleContext";
import { getSystemTranslationsBatch } from "../api/i18n";
import systemStrings from "./system-strings.json";

// The JSON file is the authoritative key list *and* the English fallback —
// every key the admin console UI (outside the login page) uses is registered
// here, in English. Keys are added gradually as screens get migrated; nothing
// reads text straight from this UI's own hardcoded strings once migrated.
const STRINGS: Record<string, string> = systemStrings;
export type SystemStringKey = keyof typeof systemStrings;

export type SystemT = (key: SystemStringKey, vars?: Record<string, string | number>) => string;

function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
}

const SystemI18nContext = createContext<SystemT | null>(null);

// Sourced from the admin's own interface locale (see LocaleContext — distinct
// from tenant content locales). English never round-trips through the
// backend since system-strings.json already *is* the English set.
export function SystemI18nProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const keys = Object.keys(STRINGS);

  const query = useQuery({
    queryKey: ["systemI18n", locale],
    queryFn: () => getSystemTranslationsBatch(locale, keys),
    enabled: locale !== "en",
  });

  const t: SystemT = (key, vars) => {
    const fallback = STRINGS[key] ?? key;
    const raw = locale === "en" ? fallback : (query.data?.translations[key] ?? fallback);
    return interpolate(raw, vars);
  };

  return <SystemI18nContext.Provider value={t}>{children}</SystemI18nContext.Provider>;
}

export function useSystemT(): SystemT {
  const ctx = useContext(SystemI18nContext);
  if (!ctx) throw new Error("useSystemT must be used within SystemI18nProvider");
  return ctx;
}

// For admin-entered i18n keys that aren't part of the static system-strings.json
// set — e.g. a permission's or config definition's `description_id`, which the
// tenant admin typed in themselves when creating it. Resolved through the same
// /system/i18n/batch endpoint as useSystemT, but always fetched (there's no
// local English fallback for a key we don't know ahead of time) and falls back
// to the raw key itself while loading or if untranslated.
export function useDynamicSystemT(keys: (string | null | undefined)[]): (key: string | null | undefined) => string {
  const { locale } = useLocale();
  const unique = Array.from(new Set(keys.filter((k): k is string => !!k)));

  const query = useQuery({
    queryKey: ["systemI18nDynamic", locale, unique],
    queryFn: () => getSystemTranslationsBatch(locale, unique),
    enabled: unique.length > 0,
  });

  return (key) => {
    if (!key) return "";
    return query.data?.translations[key] ?? key;
  };
}
