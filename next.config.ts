import type { NextConfig } from "next";

// In dev/self-hosted prod, proxy /api/* to the real backend so the browser
// only ever talks same-origin (avoids CORS). If the app is served behind the
// same reverse proxy as the backend, BACKEND_ORIGIN can be left unset and
// /api will just resolve directly.
//
// The browser-facing "/api" prefix is just a local routing convention to
// tell proxied API calls apart from Next.js pages — it is stripped here
// because the real backend (e.g. urusback.apisrelay.cc) serves routes
// directly at "/auth/{tenant_slug}/login" etc., with no "/api" segment.
const backendOrigin = process.env.BACKEND_ORIGIN;

const nextConfig: NextConfig = {
  // Minimal, self-contained runtime for the Docker image — see Dockerfile.
  output: "standalone",
  async rewrites() {
    if (!backendOrigin) return [];
    return {
      // `fallback` (not the default afterFiles) so this only catches paths that
      // don't match one of our own dynamic app routes first — afterFiles rewrites
      // run *before* dynamic routes are matched, which would otherwise let this
      // catch-all shadow e.g. src/app/api/tenants/[tenantId]/configs/route.ts and
      // silently proxy straight to the backend without its bff_token header.
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendOrigin}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
