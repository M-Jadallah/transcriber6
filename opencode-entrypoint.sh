#!/bin/sh
# =============================================================================
# opencode-entrypoint.sh — OpenCode worker entrypoint
# =============================================================================
# Writes OPENCODE_AUTH_JSON env var (multiline JSON) to the file OpenCode CLI
# expects: /root/.local/share/opencode/auth.json
#
# Then exec's the CMD (default: bun workers/format.ts).
#
# The env var takes precedence over any DB-stored Setting.opencode_auth_json
# (the worker code may also read from the DB as a fallback).
# =============================================================================

set -e

AUTH_DIR="/root/.local/share/opencode"
AUTH_FILE="${AUTH_DIR}/auth.json"

echo "[opencode-entrypoint] Container starting as $(id -un) (uid=$(id -u))"
echo "[opencode-entrypoint] WORKER_ID=${WORKER_ID:-unset}"
echo "[opencode-entrypoint] DATABASE_URL is set: ${DATABASE_URL:+yes}${DATABASE_URL:-no}"

# Ensure the auth dir exists (it was created in the Dockerfile, but the volume
# mount may have shadowed it — recreate just in case).
mkdir -p "${AUTH_DIR}"

# Write auth.json from env var if provided
if [ -n "${OPENCODE_AUTH_JSON}" ]; then
  printf '%s' "${OPENCODE_AUTH_JSON}" > "${AUTH_FILE}"
  chmod 600 "${AUTH_FILE}"
  echo "[opencode-entrypoint] ✓ OpenCode auth.json written to ${AUTH_FILE}"
  echo "[opencode-entrypoint]   size: $(wc -c < "${AUTH_FILE}") bytes"
else
  echo "[opencode-entrypoint] ⚠ OPENCODE_AUTH_JSON env var is NOT set."
  echo "[opencode-entrypoint]   If a previous deploy wrote auth.json, it will be reused."
  echo "[opencode-entrypoint]   OpenCode formatting jobs will fail until auth is configured."
fi

# Hand off to CMD
echo "[opencode-entrypoint] Execing CMD: $*"
exec "$@"
