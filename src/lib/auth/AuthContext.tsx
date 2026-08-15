"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as authApi from "../api/auth";
import * as permissionsApi from "../api/permissions";
import { onUnauthorized } from "../api/client";
import { decodeJwtPayload, isExpired } from "./jwt";
import type { IdentityProvider, JwtClaims } from "../types";

const STORAGE_KEY = "urus_admin_session";

interface StoredSession {
  token: string;
  identifier: string;
}

interface AuthState {
  token: string | null;
  claims: JwtClaims | null;
  identifier: string;
  permissions: string[];
  permissionsLoaded: boolean;
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  login: (tenantSlug: string, provider: IdentityProvider, identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_STATE: AuthState = {
  token: null,
  claims: null,
  identifier: "",
  permissions: [],
  permissionsLoaded: false,
  ready: false,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(EMPTY_STATE);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...EMPTY_STATE, ready: true });
  }, []);

  const loadPermissions = useCallback(async (token: string, claims: JwtClaims) => {
    if (!claims.tenant_id) return;
    try {
      const res = await permissionsApi.getMyPermissions(claims.tenant_id, token);
      setState((s) => (s.token === token ? { ...s, permissions: res.permissions, permissionsLoaded: true } : s));
    } catch {
      setState((s) => (s.token === token ? { ...s, permissions: [], permissionsLoaded: true } : s));
    }
  }, []);

  const applyToken = useCallback(
    (token: string, identifier: string) => {
      const claims = decodeJwtPayload(token);
      if (!claims || isExpired(claims)) {
        clear();
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, identifier } satisfies StoredSession));
      setState({ token, claims, identifier, permissions: [], permissionsLoaded: false, ready: true });
      void loadPermissions(token, claims);
    },
    [clear, loadPermissions],
  );

  useEffect(() => {
    onUnauthorized(() => clear());
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredSession;
        // Rehydrating from localStorage (an external store) on mount — the
        // canonical exception the lint rule's own description carves out.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        applyToken(stored.token, stored.identifier);
      } catch {
        setState((s) => ({ ...s, ready: true }));
      }
    } else {
      setState((s) => ({ ...s, ready: true }));
    }
    // Runs once on mount to rehydrate the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (tenantSlug: string, provider: IdentityProvider, identifier: string, password: string) => {
      const res = await authApi.login(tenantSlug, {
        provider,
        identifier,
        password: provider === "telegram" ? null : password,
      });
      applyToken(res.access_token, identifier);
    },
    [applyToken],
  );

  const logout = useCallback(() => {
    clear();
    router.replace("/login");
  }, [clear, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
