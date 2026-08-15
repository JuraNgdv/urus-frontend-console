# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# --- deps: install dependencies only (cached separately from source changes) ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build the Next.js app ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked in at build time: NEXT_PUBLIC_* is inlined into the client bundle,
# and BACKEND_ORIGIN is resolved into the rewrites() manifest (next.config.ts)
# during `next build` — setting them only at runtime has no effect on either.
ARG NEXT_PUBLIC_API_BASE_URL
ARG BACKEND_ORIGIN
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN

RUN npm run build

# --- runner: minimal production image (output: "standalone") ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
