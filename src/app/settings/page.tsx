import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { SettingsView } from "@/components/settings-view";

// Known worker IDs (kept in sync with /api/workers)
const KNOWN_WORKERS: Array<{ workerId: string; type: "transcribe" | "format" }> = [
  { workerId: "transcribe-1", type: "transcribe" },
  { workerId: "transcribe-2", type: "transcribe" },
  { workerId: "transcribe-3", type: "transcribe" },
  { workerId: "transcribe-4", type: "transcribe" },
  { workerId: "transcribe-5", type: "transcribe" },
  { workerId: "opencode-1", type: "format" },
  { workerId: "opencode-2", type: "format" },
];

const STALE_THRESHOLD_MS = 60_000;

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(20, key.length - 8))}${key.slice(-4)}`;
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetch all initial data in parallel
  const [settings, cookiesRows, skillsRows, providersRows, workerRows] = await Promise.all([
    getAllSettings(),
    db.cookie.findMany({ orderBy: { order: "asc" } }),
    db.skill.findMany({ orderBy: { createdAt: "desc" } }),
    db.aIProvider.findMany(),
    db.workerStatus.findMany(),
  ]);

  // Workers: ensure all known workers have a row (read-only here; API will create on-demand)
  const workerMap = new Map(workerRows.map((w) => [w.workerId, w]));
  const now = Date.now();
  const workers = KNOWN_WORKERS.map((known) => {
    const w = workerMap.get(known.workerId);
    const lastHeartbeatMs = w?.lastHeartbeat ? new Date(w.lastHeartbeat).getTime() : 0;
    const isStale =
      !!w &&
      w.enabled &&
      w.status !== "disabled" &&
      w.lastHeartbeat !== null &&
      now - lastHeartbeatMs > STALE_THRESHOLD_MS;
    return {
      workerId: known.workerId,
      type: known.type,
      status: w?.status ?? "idle",
      enabled: w?.enabled ?? true,
      currentJobId: w?.currentJobId ?? null,
      currentVideoId: w?.currentVideoId ?? null,
      lastHeartbeat: w?.lastHeartbeat ? new Date(w.lastHeartbeat).toISOString() : null,
      lastError: w?.lastError ?? null,
      isStale,
    };
  });

  const cookies = cookiesRows.map((r) => ({
    id: r.id,
    filename: r.filename,
    order: r.order,
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
  }));

  const providers = providersRows.map((p) => ({
    id: p.id,
    provider: p.provider,
    apiKeyMasked: maskKey(p.apiKey),
    apiKeyLength: p.apiKey.length,
    isActive: p.isActive,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const skills = skillsRows.map((s) => ({
    id: s.id,
    name: s.name,
    gitRepo: s.gitRepo,
    branch: s.branch,
    description: s.description,
    defaultModelProvider: s.defaultModelProvider,
    defaultModelName: s.defaultModelName,
    clonedAt: s.clonedAt ? s.clonedAt.toISOString() : null,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
  }));

  // Whether OPENCODE_AUTH_JSON is set via env (production path)
  const opencodeAuthJsonEnvSet = !!process.env.OPENCODE_AUTH_JSON;
  const opencodeAuthJsonFromDb = settings.opencode_auth_json ?? "";
  const opencodeAuthJsonSet = opencodeAuthJsonEnvSet || !!opencodeAuthJsonFromDb;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">إعدادات المنصة والمفاتيح والعمال</p>
        </div>
      </div>

      <SettingsView
        initialSettings={settings}
        initialCookies={cookies}
        initialSkills={skills}
        initialProviders={providers}
        initialWorkers={workers}
        opencodeAuthJsonEnvSet={opencodeAuthJsonEnvSet}
        opencodeAuthJsonFromDb={opencodeAuthJsonFromDb}
        opencodeAuthJsonSet={opencodeAuthJsonSet}
      />
    </div>
  );
}
