import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { enqueueTranscription } from "@/lib/queues";
import { log } from "@/lib/logs";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

// POST /api/videos/bulk  body: { ids: string[], action: "retry" | "delete" }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { ids?: string[]; action?: "retry" | "delete" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = (body.ids || []).filter(Boolean);
  const action = body.action;
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }
  if (action !== "retry" && action !== "delete") {
    return NextResponse.json({ error: "action must be 'retry' or 'delete'" }, { status: 400 });
  }

  try {
    if (action === "delete") {
      // Collect audio paths to delete from disk
      const videos = await db.video.findMany({
        where: { id: { in: ids } },
        select: { id: true, audioPath: true },
      });
      for (const v of videos) {
        if (v.audioPath) {
          try {
            await fs.unlink(v.audioPath);
          } catch {
            /* ignore */
          }
        }
      }
      const result = await db.video.deleteMany({ where: { id: { in: ids } } });
      await log(`Bulk deleted ${result.count} videos`, {
        source: "api",
        details: { ids },
      });
      return NextResponse.json({ ok: true, deleted: result.count });
    }

    // action === "retry"
    const updated = await db.video.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "pending",
        progress: 0,
        attempts: 0,
        error: null,
        statusText: "Re-queued (bulk)",
        startedAt: null,
        completedAt: null,
        workerId: null,
      },
    });
    // Best-effort re-enqueue each
    for (const id of ids) {
      try {
        await enqueueTranscription(id);
      } catch {
        /* ignore */
      }
    }
    await log(`Bulk retried ${updated.count} videos`, {
      source: "api",
      details: { ids },
    });
    return NextResponse.json({ ok: true, retried: updated.count });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Bulk operation failed", details: err?.message },
      { status: 500 }
    );
  }
}
