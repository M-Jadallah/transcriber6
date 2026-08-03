# syntax=docker/dockerfile:1
# =============================================================================
# Dockerfile — realtime mini-service (Socket.io + internal /emit HTTP endpoint)
# =============================================================================
# Base: oven/bun:1 (Debian-based, has apt-get)
# Listens on port 3001.
# =============================================================================

FROM oven/bun:1

WORKDIR /app

# curl for healthcheck (oven/bun:1 is Debian-based)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests + install
COPY package.json bun.lock* ./

# Install with retry logic (small dep tree, but be resilient)
RUN bun install --frozen-lockfile 2>&1 \
    || (echo "[realtime] bun --frozen-lockfile failed, retrying..." && bun install 2>&1)

# Copy source
COPY index.ts ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "index.ts"]
