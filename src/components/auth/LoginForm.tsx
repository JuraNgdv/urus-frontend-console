"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/client";
import { primaryBtn } from "@/components/ui/styles";

export function LoginForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const { token, ready, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace("/");
  }, [ready, token, router]);

  async function handleSubmit() {
    if (!identifier) return setError("Username or email is required.");
    if (!password) return setError("Password is required.");
    setError("");
    setSubmitting(true);
    try {
      // Provider is inferred from the identifier shape — no separate field for it.
      const provider = identifier.includes("@") ? "email" : "username";
      await login(tenantSlug, provider, identifier, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="urus-form-col">
      <label className="urus-field">
        <span className="urus-field-label">Username or email</span>
        <input
          className="urus-input urus-input-mono"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setError("");
          }}
          placeholder="j.doe"
          spellCheck={false}
          autoComplete="username"
        />
      </label>
      <label className="urus-field">
        <span className="urus-field-label">Password</span>
        <input
          type="password"
          className="urus-input urus-input-mono"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </label>
      {error && <div className="urus-error">{error}</div>}
      <button type="button" style={primaryBtn()} disabled={submitting} onClick={handleSubmit}>
        {submitting ? "…" : "Sign in"}
      </button>
      <p className="urus-endpoint-hint">POST /auth/{tenantSlug}/login</p>
      <p className="urus-field-hint">Sign-in via Telegram bot is coming soon.</p>
    </div>
  );
}
