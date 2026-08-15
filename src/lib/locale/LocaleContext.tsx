"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "../api/client";
import { getMyProfile, updateMyProfile } from "../api/profile";

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "uk", label: "Ukrainian" },
];

// One blank slot per available content language — the shared shape for any
// per-locale translation draft (menu/keyboard text, node names, ...).
// Unrelated to `useLocale()` below, which is the admin interface's own
// display language, not a content language.
export function emptyTranslations(): Record<string, string> {
  return Object.fromEntries(LOCALES.map((l) => [l.code, ""]));
}

interface LocaleContextValue {
  locale: string;
  setLocale: (locale: string) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// The admin interface's own display language — sourced from the signed-in
// admin's own profile (`lang`, GET /tenants/{tenant_id}/me) and saved back
// via PATCH on change. Independent of LOCALES/content translations.
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { token, claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;
  const flash = useToast();
  const [locale, setLocaleState] = useState(LOCALES[0].code);

  useEffect(() => {
    if (!token || !tenantId) return;
    let cancelled = false;
    getMyProfile(tenantId, token)
      .then((profile) => {
        if (!cancelled && profile.lang) setLocaleState(profile.lang);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, tenantId]);

  function setLocale(next: string) {
    const previous = locale;
    setLocaleState(next);
    if (!token || !tenantId) return;
    updateMyProfile(tenantId, { lang: next }, token).catch((err) => {
      setLocaleState(previous);
      flash(err instanceof ApiError ? err.message : "Failed to save language");
    });
  }

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
