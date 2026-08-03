# Deployment Guide — Coolify

دليل النشر على Coolify · A complete reference for deploying this multi-service YouTube transcription + formatting platform on [Coolify](https://coolify.io).

---

## Table of Contents · الفهرس

1. [Architecture · المعمارية](#1-architecture--المعمارية)
2. [Prerequisites · المتطلبات الأساسية](#2-prerequisites--المتطلبات-الأساسية)
3. [Step-by-step deployment · خطوات النشر](#3-step-by-step-deployment--خطوات-النشر)
4. [Environment variables · متغيرات البيئة](#4-environment-variables--متغيرات-البيئة)
5. [OpenCode (Codex Plus) setup · إعداد OpenCode](#5-opencode-codex-plus-setup--إعداد-opencode)
6. [Resource recommendations · متطلبات الموارد](#6-resource-recommendations--متطلبات-الموارد)
7. [Viewing logs · عرض السجلات](#7-viewing-logs--عرض-السجلات)
8. [Scaling · التوسع](#8-scaling--التوسع)
9. [Troubleshooting · استكشاف الأخطاء](#9-troubleshooting--استكشاف-الأخطاء)

---

## 1. Architecture · المعمارية

The app is a multi-service Docker Compose stack with **11 services**:

| # | Service | Role | Exposed? |
|---|---------|------|----------|
| 1 | `app` | Next.js standalone server (UI + API) | ✅ Yes (via Coolify FQDN) |
| 2 | `realtime` | Socket.io server for live progress | ✅ Yes (own FQDN) |
| 3–7 | `worker-t1`..`worker-t5` | Transcription workers (yt-dlp + Deepgram) | ❌ Internal |
| 8–9 | `opencode-1`, `opencode-2` | Formatting workers (OpenCode CLI) | ❌ Internal |
| 10 | `postgres` | PostgreSQL 17 (database) | ❌ Internal |
| 11 | `redis` | Redis 7 (BullMQ queue + cache) | ❌ Internal |

**Traffic flow:**
- Browser → Traefik (Coolify's proxy) → `app` (port 3000) for the UI/API
- Browser → Traefik → `realtime` (port 3001) for WebSocket live progress
- `app` / workers → `realtime:3001/emit` (internal HTTP POST) to broadcast progress events
- Workers ↔ `redis` (BullMQ job queue) and `postgres` (job/video state)
- `opencode-N` ↔ `skills-shared` volume (clone skill repos, write outputs)

المعمارية عبارة عن مجموعة Docker Compose متعددة الخدمات تحتوي على 11 خدمة. التطبيق وواجهة الويب يتواصلان عبر الإنترنت، بينما تبقى الخدمات الأخرى داخلية. يتدفق الزيارات كالتالي: المتصفح ← Traefik ← التطبيق؛ المتصفح ← Traefik ← خدمة Realtime لتحديثات التقدّم المباشرة.

---

## 2. Prerequisites · المتطلبات الأساسية

- A **Coolify v4.x** instance (self-hosted on a VPS or managed Coolify Cloud).
- A **GitHub repository** containing this code (push all files including `docker-compose.yml`, `Dockerfile`, `Dockerfile.opencode`, `mini-services/realtime/`, `workers/`, `prisma/`, `src/`, `package.json`, `bun.lock`).
- A **domain** with a wildcard DNS A record pointing to your Coolify server (e.g. `*.yourdomain.com → COOLIFY_IP`). Coolify auto-assigns subdomains.
- **Deepgram API keys** — 5 keys (one per worker) from [console.deepgram.com](https://console.deepgram.com/). You can use the same key 5 times if you're on a plan that allows it.
- **(Optional)** OpenCode auth.json — see [§5](#5-opencode-codex-plus-setup--إعداد-opencode).
- **Server resources**: minimum 2 vCPU / 4 GB RAM (8 GB recommended). See [§6](#6-resource-recommendations--متطلبات-الموارد).

المتطلبات: خادم Coolify يعمل، مستودع GitHub يحتوي على الكود، نطاق مع DNS عام، 5 مفاتيح Deepgram، وموارد خادم لا تقل عن 2 معالج و4GB ذاكرة.

---

## 3. Step-by-step deployment · خطوات النشر

### Step 1 — Push code to GitHub · ارفع الكود إلى GitHub

```bash
git init
git add .
git commit -m "Multi-service app for Coolify"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Make sure these files are committed at the repo root:
- `docker-compose.yml`
- `Dockerfile`
- `Dockerfile.opencode`
- `docker-entrypoint.sh`
- `opencode-entrypoint.sh`
- `.dockerignore`
- `package.json` + `bun.lock`
- `prisma/schema.postgres.prisma`
- `next.config.ts`
- `src/` (Next.js app)
- `workers/transcribe.ts` + `workers/format.ts`
- `mini-services/realtime/` (Dockerfile + index.ts + package.json)

ارفع الكود إلى مستودع GitHub. تأكد أن جميع الملفات المذكورة أعلاه موجودة في جذر المستودع.

### Step 2 — Create a new Docker Compose resource in Coolify · أنشئ موردًا جديدًا

1. In the Coolify dashboard, click **+ New Resource**.
2. Choose **Docker Compose Empty** (or paste your compose file) OR **Public Repository** (if your repo is public) OR **Private Repository** (with GitHub integration).
3. Select your repository + branch (`main`).
4. Coolify auto-detects `docker-compose.yml` at the repo root.

في لوحة تحكم Coolify: ← "مورد جديد" ← اختر "Docker Compose" ← اختر المستودع والفرع. سيكتشف Coolify ملف `docker-compose.yml` تلقائيًا.

### Step 3 — Configure the build pack · إعداد البناء

- **Build Pack**: Docker Compose (auto-detected)
- **Base Directory**: `/` (root)
- **Docker Compose Location**: `/docker-compose.yml` (default)
- Coolify will list all 11 services it found in the compose file.

نوع البناء: Docker Compose. سيقوم Coolify بسرد جميع الخدمات الـ11.

### Step 4 — Set environment variables · ضبط متغيرات البيئة

Navigate to the **Environment Variables** tab. Add the following:

| Variable | Value | Notes |
|----------|-------|-------|
| `ADMIN_USERNAME` | `admin` (or your choice) | Runtime + Build (default) |
| `ADMIN_PASSWORD` | `<strong password>` | Runtime + Build, mark as **Locked Secret** |
| `DEEPGRAM_API_KEY_1` | `<key>` | Runtime only, Locked Secret |
| `DEEPGRAM_API_KEY_2` | `<key>` | Runtime only, Locked Secret |
| `DEEPGRAM_API_KEY_3` | `<key>` | Runtime only, Locked Secret |
| `DEEPGRAM_API_KEY_4` | `<key>` | Runtime only, Locked Secret |
| `DEEPGRAM_API_KEY_5` | `<key>` | Runtime only, Locked Secret |
| `OPENCODE_AUTH_JSON` | `<multiline JSON>` | **Optional**. Enable the **Multiline** checkbox. |

**Do NOT set** the `SERVICE_*` vars — Coolify auto-generates them.

في تبويب "Environment Variables"، أضف المتغيرات السبعة المذكورة أعلاه. لا تضف متغيرات `SERVICE_*` — سيولّدها Coolify تلقائيًا.

### Step 5 — Coolify auto-generates magic vars · Coolify يولّد المتغيرات السحرية

On the **first deploy**, Coolify auto-generates and persists these (visible in the .env tab after deploy):

- `SERVICE_FQDN_APP_3000` — public URL for the Next.js app
- `SERVICE_FQDN_REALTIME_3001` — public URL for the realtime service
- `SERVICE_PASSWORD_POSTGRES` — postgres password
- `SERVICE_PASSWORD_REDIS` — redis password
- `SERVICE_PASSWORD_64_NEXTAUTH` — 64-char secret (used for both NextAuth and realtime internal auth)

These are stable across redeploys — same value every time.

عند أول نشر، يولّد Coolify تلقائيًا متغيرات `SERVICE_*` ويحفظها. تبقى ثابتة عبر إعادة النشر.

### Step 6 — Deploy · انشر

Click **Deploy**. Watch the build logs — Coolify will:
1. Pull the repo.
2. Run `docker compose build` for `app`, `realtime`, `worker-t1..t5`, `opencode-1`, `opencode-2`.
3. Pull `postgres:17-alpine` and `redis:7-alpine`.
4. Start services in dependency order: postgres → redis → realtime → app + workers.

Wait for all healthchecks to pass (the app's healthcheck has a 40-second `start_period` to allow Prisma migrations + Next.js boot).

انقر "Deploy". راقب سجلات البناء. انتظر حتى تنجح جميع فحوصات الصحة (healthchecks).

### Step 7 — Visit the app · افتح التطبيق

1. Find the `app` service's FQDN in Coolify (the `SERVICE_FQDN_APP_3000` value, e.g. `https://app-abc123.yourdomain.com`).
2. Open it in your browser.
3. Log in with your `ADMIN_USERNAME` + `ADMIN_PASSWORD`.
4. Verify the realtime connection: open browser DevTools → Network → WS — you should see a WebSocket connection to the realtime FQDN with status 101.

افتح رابط التطبيق في المتصفح. سجّل الدخول باستخدام بيانات المسؤول. تحقق من اتصال WebSocket عبر أدوات المطور.

### Step 8 — (Optional) Set up OpenCode (Codex Plus) · إعداد OpenCode

To enable AI-powered document formatting via OpenCode:

1. On your local machine (NOT the Coolify server), install OpenCode CLI:
   ```bash
   npm install -g opencode-ai@latest
   ```
2. Log in with your ChatGPT Plus/Pro account:
   ```bash
   opencode auth login --provider openai --method "ChatGPT Plus/Pro"
   ```
3. Open the URL it prints in your browser, complete the OAuth flow.
4. Read the auth file:
   ```bash
   cat ~/.local/share/opencode/auth.json
   ```
5. Copy the **entire JSON content**.
6. In Coolify's Environment Variables tab, edit `OPENCODE_AUTH_JSON`:
   - Paste the JSON content as the value.
   - Enable the **Multiline** checkbox.
   - Save.
7. **Redeploy** the stack (or just restart `opencode-1` + `opencode-2`):
   - In Coolify, click **Redeploy** — this recreates containers with the new env.
   - The `opencode-entrypoint.sh` script writes the env var to `/root/.local/share/opencode/auth.json` on container start.

After this, formatting jobs will succeed. Without this step, formatting jobs will fail with an OpenCode auth error.

لتفعيل التنسيق عبر OpenCode: ثبّت OpenCode محليًا، سجّل الدخول بحساب ChatGPT Plus/Pro، انسخ محتوى `auth.json`، ثم الصقه في متغير `OPENCODE_AUTH_JSON` في Coolify مع تفعيل خيار "Multiline". أعد النشر.

---

## 4. Environment variables · متغيرات البيئة

### User-provided (you set these) · التي تضبطها أنت

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_USERNAME` | ✅ | Admin login username |
| `ADMIN_PASSWORD` | ✅ | Admin login password |
| `DEEPGRAM_API_KEY_1` | ✅ | Deepgram key for `worker-t1` |
| `DEEPGRAM_API_KEY_2` | ✅ | Deepgram key for `worker-t2` |
| `DEEPGRAM_API_KEY_3` | ✅ | Deepgram key for `worker-t3` |
| `DEEPGRAM_API_KEY_4` | ✅ | Deepgram key for `worker-t4` |
| `DEEPGRAM_API_KEY_5` | ✅ | Deepgram key for `worker-t5` |
| `OPENCODE_AUTH_JSON` | ⬜ optional | Multiline JSON for OpenCode auth |

### Auto-generated by Coolify (do NOT set) · المُولّدة تلقائيًا

| Variable | Description |
|----------|-------------|
| `SERVICE_FQDN_APP_3000` | App's public FQDN (Traefik routes port 3000) |
| `SERVICE_FQDN_REALTIME_3001` | Realtime service's public FQDN (port 3001) |
| `SERVICE_PASSWORD_POSTGRES` | Postgres password (internal) |
| `SERVICE_PASSWORD_REDIS` | Redis password (internal) |
| `SERVICE_PASSWORD_64_NEXTAUTH` | 64-char secret for NextAuth + realtime internal auth |

---

## 5. OpenCode (Codex Plus) setup · إعداد OpenCode

OpenCode is the AI CLI used by the formatting workers (`opencode-1`, `opencode-2`) to convert transcripts into formatted Word documents using a Codex Plus/Pro subscription.

### How auth works · كيف تعمل المصادقة

- The `opencode-entrypoint.sh` script runs at container startup.
- If `OPENCODE_AUTH_JSON` env var is set, it writes the value to `/root/.local/share/opencode/auth.json`.
- OpenCode CLI reads this file on every invocation.
- The file is also persisted in the `opencode-auth` named volume, so it survives container restarts (but is overwritten by the env var on each restart if set).

### Rotating the auth token · تدوير رمز المصادقة

1. Update `OPENCODE_AUTH_JSON` in Coolify UI with the new JSON.
2. Click **Redeploy** (or restart `opencode-1` + `opencode-2` services).
3. The entrypoint rewrites `auth.json` on next container start.

### Without OpenCode auth · بدون مصادقة OpenCode

If `OPENCODE_AUTH_JSON` is not set:
- The opencode workers still start (they connect to Redis + DB).
- They pick up formatting jobs from the queue.
- Each job fails with an OpenCode auth error and is marked as `failed`.
- Transcription still works — only formatting is affected.

---

## 6. Resource recommendations · متطلبات الموارد

| Tier | CPU | RAM | Disk | Concurrent transcriptions |
|------|-----|-----|------|---------------------------|
| **Minimum** | 2 vCPU | 4 GB | 20 GB | 2–3 |
| **Recommended** | 4 vCPU | 8 GB | 40 GB | 5 (full capacity) |
| **Heavy** | 8 vCPU | 16 GB | 80 GB | 5 + fast formatting |

**Notes:**
- Coolify itself uses ~300–400 MB RAM.
- Each transcription worker peaks at ~512 MB during yt-dlp download + Deepgram upload.
- Each OpenCode worker peaks at ~1 GB during formatting.
- Postgres + Redis together: ~300 MB.
- The Next.js build step needs ~1.5 GB RAM — if your server is <4 GB, builds may OOM. Set `NODE_OPTIONS=--max-old-space-size=1024` in the build env, or build images in CI and push to a registry.

الحد الأدنى: 2 معالج و4GB ذاكرة. الموصى به: 4 معالج و8GB ذاكرة. البناء يحتاج ~1.5GB ذاكرة.

---

## 7. Viewing logs · عرض السجلات

### Per-service logs in Coolify · سجلات كل خدمة

1. Open your resource in Coolify.
2. Click the **Logs** tab (or the terminal icon).
3. Select a service from the dropdown (`app`, `worker-t1`, `postgres`, etc.).
4. Logs stream in real-time.

### Application logs (in-DB) · سجلات التطبيق

The app writes structured logs to the `LogEntry` table in Postgres. View them at:
- **URL**: `https://<app-fqdn>/logs`
- **API**: `GET /api/logs?level=&source=&limit=200`

### Docker logs via SSH · سجلات Docker عبر SSH

SSH into your Coolify server and run:
```bash
# List all containers in this stack
docker compose -f /data/coolify/applications/<uuid>/docker-compose.yml ps

# Tail logs for a specific service
docker logs -f <stack-name>-app-1
docker logs -f <stack-name>-worker-t1-1
docker logs -f <stack-name>-opencode-1-1

# See all containers
docker ps --filter "label=com.docker.compose.project=<stack-name>"
```

### Worker heartbeat · نبضات العامل

Each worker writes a heartbeat to the `WorkerStatus` table every 30 seconds. View the worker status page at `https://<app-fqdn>/settings` (Workers tab). If a heartbeat is stale (>60s), the worker is marked as offline.

---

## 8. Scaling · التوسع

### Adding more transcription workers · إضافة عمال تفريغ

To scale beyond 5 transcription workers:

1. Add `worker-t6` (and `worker-t7`, etc.) blocks to `docker-compose.yml`, mirroring `worker-t5` but with `WORKER_INDEX=6`, `WORKER_ID=transcribe-6`, and `DEEPGRAM_API_KEY_6`.
2. Add `DEEPGRAM_API_KEY_6` to Coolify env vars.
3. Redeploy.

### Adding more formatting workers · إضافة عمال تنسيق

To scale beyond 2 OpenCode workers:

1. Add `opencode-3` to `docker-compose.yml`, mirroring `opencode-2` but with `WORKER_ID=opencode-3`.
2. Redeploy.

### Why NOT `deploy.replicas`? · لماذا لا نستخدم replicas؟

Docker Compose standalone (without Swarm) `replicas` doesn't load-balance properly — all replicas share the same container name and can't have distinct `WORKER_ID` env vars. Named services (one per worker) is the correct pattern. See RESEARCH-6 for details.

---

## 9. Troubleshooting · استكشاف الأخطاء

### `non-string key in services.X.environment: 0`

**Symptoms**: Deployment fails at the `docker compose ... build` step with:
```
Error: non-string key in services.app.environment: 0
Deployment failed: Command execution failed (exit code 1)
```

**Cause**: The `environment:` block used YAML **list syntax** (`- VAR`) mixed with declaration-only entries (e.g. `- SERVICE_FQDN_APP_3000` with no value). When Coolify parses the compose file and converts the list to a map, the declaration-only entries produce numeric keys (`0`, `1`, ...) instead of string keys, which Docker Compose rejects.

**Fix**: Use **map syntax** for ALL `environment:` blocks. The current `docker-compose.yml` already uses map syntax. If you edit it, ensure every entry is `KEY: value` (not `- KEY=value`). For magic variable declarations (to trigger Coolify auto-generation), use:
```yaml
environment:
  SERVICE_FQDN_APP_3000:      # empty value = declaration only
  NODE_ENV: production
  DATABASE_URL: postgresql://...
```
**NOT** list syntax:
```yaml
# ❌ WRONG — causes "non-string key" error
environment:
  - SERVICE_FQDN_APP_3000
  - NODE_ENV=production
```

### "No Available Server" (503) on the app FQDN

**Cause**: Traefik can't reach the app container.
**Fixes**:
1. Check the app's health status in Coolify — if unhealthy, the container may be crashing. Check logs.
2. Verify `HOSTNAME=0.0.0.0` is in the app's env (it is, via the Dockerfile + compose).
3. Verify the healthcheck endpoint works: `docker exec <app-container> curl -f http://localhost:3000/api/health`.
4. Make sure no `networks:` block was added to the compose (Coolify rule — custom networks cause Traefik dual-IP bugs).

### WebSocket doesn't connect (realtime)

**Symptoms**: UI shows but progress doesn't update in real-time.
**Fixes**:
1. Verify the realtime service is healthy in Coolify.
2. Open browser DevTools → Console — look for socket.io errors.
3. Check that `NEXT_PUBLIC_REALTIME_URL` was substituted at build time (the build log shows it as a build-arg).
4. Verify CORS: the realtime service allows the app's origin (`ALLOWED_ORIGIN` env var).

### Postgres won't start

**Symptoms**: `initdb: cannot create directory` or permission denied.
**Cause**: Bind-mounted pgdata on a host where UID 999 lacks write perms. **Fix**: Use a named volume (the compose file already does this — `pgdata:`). If you modified it to a bind mount, revert.

### `prisma migrate deploy` fails

**Symptoms**: App container restarts in a loop.
**Cause**: Either DATABASE_URL is wrong, or the postgres container isn't ready.
**Fixes**:
1. Verify `DATABASE_URL` contains `postgresql://app:${SERVICE_PASSWORD_POSTGRES}@postgres:5432/app?schema=public`.
2. Check that `postgres` is healthy before `app` starts (the compose uses `depends_on: { condition: service_healthy }`).
3. SSH in and run `docker exec <app-container> npx prisma migrate deploy --schema=prisma/schema.postgres.prisma` to see the error directly.

### OpenCode formatting fails

**Symptoms**: FormatJob status = `failed`, error mentions "auth" or "unauthorized".
**Cause**: `OPENCODE_AUTH_JSON` not set, or invalid JSON.
**Fixes**:
1. Verify `OPENCODE_AUTH_JSON` is set in Coolify UI with the Multiline checkbox on.
2. Redeploy `opencode-1` + `opencode-2`.
3. SSH in: `docker exec <opencode-1-container> cat /root/.local/share/opencode/auth.json` — should print valid JSON.

### Build OOMs (especially on small servers)

**Symptoms**: `bun run build` exits with code 137 (SIGKILL = OOM).
**Fix**: Either upgrade server RAM, or build images in CI and push to a registry, then change the compose to use `image:` instead of `build:`.

### `${VAR}` appears literally in the running container

**Cause**: Coolify didn't substitute the var (it was never declared).
**Fix**: Declare the magic var (`- SERVICE_PASSWORD_FOO`) in some service's `environment:` block, then reference it (`${SERVICE_PASSWORD_FOO}`) elsewhere.

---

## Quick reference · مرجع سريع

```bash
# Local validation (no Docker required)
python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"

# Validate env var substitution
docker compose config     # shows the rendered compose with env vars substituted

# Build + run locally (requires Docker)
docker compose build
docker compose up

# Check service health
docker compose ps
docker compose logs -f app
docker compose logs -f worker-t1
```

---

**Document version**: 1.0 · **Last updated**: 2026-08
