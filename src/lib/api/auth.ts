import { apiFetch } from "./client";
import type { LoginRequest, TokenResponse } from "../types";

export function login(tenantSlug: string, req: LoginRequest) {
  return apiFetch<TokenResponse>(`/auth/${encodeURIComponent(tenantSlug)}/login`, {
    method: "POST",
    body: req,
  });
}
