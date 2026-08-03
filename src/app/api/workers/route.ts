import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { logger } from "@/lib/logs";

// Known worker IDs
export const KNOWN_WORKERS: Array<{ workerId: string; type: "transcribe" | "format" }> = [
  { workerId: "transcribe-1", type: "transcribe" },
  { workerId: "transcribe-2", type: "transcribe" },
  { workerId: "transcribe-3", type: "transcribe" },
  { workerId: "transcribe-4", type: "transcribe" },
  { workerId: "transcribe-5", type: "transcribe" },
  { workerId: "opencode-1", type: "format" },
  { workerId: "opencode-2", type: "format" },
];

const STALE_THRESHOLD_MS = 60_000; // 60s

// GET /api/workers — list all worker statuses, creating missing ones
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const existing = await db.workerStatus.findMany();
    const map = new Map(existing.map((w) => [w.workerId, w]));

    // Create missing worker records
    for (const known of KNOWN_WORKERS) {
      if (!map.has(known.workerId)) {
        const created = await db.workerStatus.create({
          data: {
            workerId: known.workerId,
            type: known.type,
            status: "idle",
            enabled: true,
          },
        });
        map.set(known.workerId, created);
      }
    }

    const now = Date.now();
    const data = KNOWN_WORKERS.map((known) => {
      const w = map.get(known.workerId)!;
      const lastHeartbeatMs = w.lastHeartbeat ? new Date(w.lastHeartbeat).getTime() : 0;
      const isStale =
        w.enabled &&
        w.status !== "disabled" &&
        w.lastHeartbeat !== null &&
        now - lastHeartbeatMs > STALE_THRESHOLD_MS;

      return {
        workerId: w.workerId,
        type: w.type,
        status: w.status,
        enabled: w.enabled,
        currentJobId: w.currentJobId,
        currentVideoId: w.currentVideoId,
        lastHeartbeat: w.lastHeartbeat,
        lastError: w.lastError,
        isStale: !!isStale,
      };
    });

    return NextResponse.json({ workers: data });
  } catch (err) {
    await logger.error("Failed to fetch workers", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to fetch workers" }, { status: 500 });
  }
}

// PATCH /api/workers — body: { workerId, enabled } — toggle enabled
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { workerId, enabled } = body as { workerId?: string; enabled?: boolean };
    if (!workerId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Missing workerId or enabled" }, { status: 400 });
    }

    // Ensure record exists
    const known = KNOWN_WORKERS.find((w) => w.workerId === workerId);
    if (!known) {
      return NextResponse.json({ error: "Unknown worker" }, { status: 400 });
    }

    const updated = await db.workerStatus.upsert({
      where: { workerId },
      update: { enabled, status: enabled ? "idle" : "disabled" },
      create: { workerId, type: known.type, enabled, status: enabled ? "idle" : "disabled" },
    });

    await logger.info(`Worker ${workerId} ${enabled ? "enabled" : "disabled"}`, {
      source: "api",
      workerId,
      details: { enabled },
    });

    return NextResponse.json({
      ok: true,
      worker: {
        workerId: updated.workerId,
        type: updated.type,
        status: updated.status,
        enabled: updated.enabled,
      },
    });
  } catch (err) {
    await logger.error("Failed to update worker", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to update worker" }, { status: 500 });
  }
}
