#!/bin/sh
# =============================================================================
# docker-entrypoint.sh — app container entrypoint
# =============================================================================
# Runs Prisma db push against the POSTGRES schema, then starts the Next.js
# standalone server (node server.js).
#
# This is the default CMD for the app service. Worker services override
# `command:` in docker-compose.yml and bypass this entrypoint.
# =============================================================================

set -e

echo "[entrypoint] Container starting as $(id -un) (uid=$(id -u))"
echo "[entrypoint] Working directory: $(pwd)"
echo "[entrypoint] DATABASE_URL is set: ${DATABASE_URL:+yes}${DATABASE_URL:-no}"

# ─── Run Prisma db push (creates/updates tables to match schema) ────────────
# We use `db push` instead of `migrate deploy` because we don't ship a
# prisma/migrations/ folder. db push is idempotent and safe for initial deploy.
echo "[entrypoint] Running prisma db push (postgres schema)..."

if npx prisma db push \
  --schema=prisma/schema.postgres.prisma \
  --accept-data-loss \
  --skip-generate 2>&1; then
  echo "[entrypoint] ✓ Database schema applied successfully."
else
  push_rc=$?
  echo "[entrypoint] ⚠ prisma db push exited with $push_rc"
  echo "[entrypoint] Retrying in 5s (postgres might still be starting)..."
  sleep 5
  npx prisma db push \
    --schema=prisma/schema.postgres.prisma \
    --accept-data-loss \
    --skip-generate
  echo "[entrypoint] ✓ Database schema applied on retry."
fi

# ─── Start Next.js standalone server ──────────────────────────────────────────
echo "[entrypoint] Starting Next.js standalone server (node server.js)..."
echo "[entrypoint]   HOSTNAME=${HOSTNAME:-0.0.0.0}"
echo "[entrypoint]   PORT=${PORT:-3000}"
echo "[entrypoint]   NODE_ENV=${NODE_ENV:-production}"

exec node server.js
