import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { enqueueTranscription } from "@/lib/queues";
import { log } from "@/lib/logs";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

// GET /api/videos/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const video = await db.video.findUnique({
      where: { id },
      include: { playlist: true, formatJobs: { orderBy: { createdAt: "desc" } } },
    });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ video });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch video", details: err?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/videos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const video = await db.video.findUnique({ where: { id } });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove audio file from disk if exists
    if (video.audioPath) {
      try {
        await fs.unlink(video.audioPath);
      } catch {
        /* ignore — file may already be gone */
      }
    }

    await db.video.delete({ where: { id } });
    await log("Video deleted", { source: "api", videoId: id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to delete video", details: err?.message },
      { status: 500 }
    );
  }
}

// PATCH /api/videos/[id]  body: { action: "retry" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "retry") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const video = await db.video.findUnique({ where: { id } });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await db.video.update({
      where: { id },
      data: {
        status: "pending",
        progress: 0,
        attempts: 0,
        error: null,
        statusText: "Re-queued",
        startedAt: null,
        completedAt: null,
        workerId: null,
      },
    });

    try {
      await enqueueTranscription(id);
    } catch {
      /* ignore — DB record still reset */
    }

    await log("Video re-queued for transcription", {
      source: "api",
      videoId: id,
    });
    return NextResponse.json({ video: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to retry video", details: err?.message },
      { status: 500 }
    );
  }
}
