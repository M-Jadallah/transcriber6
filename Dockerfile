# syntax=docker/dockerfile:1
# =============================================================================
# Dockerfile — Next.js app + transcription workers (shared base image)
# =============================================================================
# Used by:
#   - app           (default CMD: docker-entrypoint.sh → prisma migrate → node server.js)
#   - worker-t1..t5 (command override: bun workers/transcribe.ts)
#
# Multi-stage build:
#   1. deps    — install bun, bun install (with retry + npm fallback)
#   2. builder — prisma generate (postgres schema) + next build (standalone)
#   3. runtime — node:22-slim + ffmpeg + python3 + yt-dlp + git + curl + bun
# =============================================================================

# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Install bun (for install + worker runtime)
RUN npm install -g bun

COPY package.json bun.lock package-lock.json* ./

# Install deps with retry logic.
# `bun install --frozen-lockfile` can fail on transient CDN errors when
# extracting large native tarballs (e.g. @swc/core-linux-x64-gnu ~40MB).
# We prefer npm ci (most stable with native binaries), then bun as fallback.
RUN npm ci --no-audit --no-fund 2>&1 \
    || (echo "[deps] npm ci failed, trying bun install --frozen-lockfile..." \
        && bun install --frozen-lockfile 2>&1) \
    || (echo "[deps] bun frozen failed, trying bun install..." \
        && bun install 2>&1) \
    || (echo "[deps] bun install failed, trying npm install..." \
        && npm install --no-audit --no-fund 2>&1)

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

RUN npm install -g bun

# Prisma generate needs a DATABASE_URL even though it doesn't connect
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1

# Build arg for the realtime FQDN — inlined into client bundle at build time.
ARG NEXT_PUBLIC_REALTIME_URL=""
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client using the POSTGRES schema (prod schema)
RUN npx prisma generate --schema=prisma/schema.postgres.prisma

# Build Next.js (package.json build script: next build + copy static/public into standalone)
# Disable turbopack during build to avoid @swc/core native binary issues.
RUN bun run build

# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Skips the prisma generate postinstall (we already generated in builder)
ENV BUN_IGNORE_SCRIPTS=true

# System deps:
#   ffmpeg        — audio extraction / conversion for transcription workers
#   python3 + pip — runtime for yt-dlp (YouTube downloader)
#   yt-dlp        — YouTube audio downloader (installed via pip)
#   git           — required by some node native build steps + workers
#   curl          — healthcheck
#   ca-certificates — TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      git \
      curl \
      ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Install bun in runtime (workers run via bun)
RUN npm install -g bun

# Create non-root user (UID 1001)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 app

# Copy standalone Next.js output (server.js, .next/static, public, minimal node_modules)
COPY --from=builder --chown=app:nodejs /app/.next/standalone ./

# Overwrite minimal node_modules with FULL node_modules from builder
# (workers need: bullmq, ioredis, @prisma/client, docx, archiver, etc.)
COPY --from=builder --chown=app:nodejs /app/node_modules ./node_modules

# Copy source dirs needed by workers (workers import from @/lib/* → src/lib/*)
COPY --from=builder --chown=app:nodejs /app/workers ./workers
COPY --from=builder --chown=app:nodejs /app/src ./src
COPY --from=builder --chown=app:nodejs /app/prisma ./prisma
COPY --from=builder --chown=app:nodejs /app/package.json ./package.json
COPY --from=builder --chown=app:nodejs /app/tsconfig.json ./tsconfig.json

# Create + chown data directories (named volumes inherit ownership on first mount)
RUN mkdir -p /data/skills /data/audio /data/jobs /app/data && \
    chown -R app:nodejs /data /app/data

# Copy entrypoint (chmod 0755 via COPY --chmod)
COPY --chmod=0755 docker-entrypoint.sh ./docker-entrypoint.sh

USER app

EXPOSE 3000

# Healthcheck: hit /api/health (returns 200 OK JSON)
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=40s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Default CMD: run migrations then start Next.js standalone server.
# Workers override `command:` in docker-compose (skips entrypoint entirely).
CMD ["./docker-entrypoint.sh"]
