import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { enqueueFormatting } from "@/lib/queues";
import { log } from "@/lib/logs";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic";

// GET /api/format-jobs/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const job = await db.formatJob.findUnique({
      where: { id },
      include: { video: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (err) {
    console.error("[format-job GET]", err);
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

// DELETE /api/format-jobs/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const job = await db.formatJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    // Remove output file if exists
    if (job.outputPath) {
      try {
        await fs.unlink(job.outputPath);
      } catch {
        // ignore
      }
    }
    if (job.inputPath) {
      try {
        await fs.unlink(job.inputPath);
      } catch {
        // ignore
      }
    }
    await db.formatJob.delete({ where: { id } });
    await log(`Format job deleted (skill=${job.skillName})`, {
      source: "formatting",
      level: "info",
      videoId: job.videoId,
      jobId: job.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[format-job DELETE]", err);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}

// PATCH /api/format-jobs/[id] { action: "retry" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body as { action?: string };

    if (action !== "retry") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const job = await db.formatJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Reset job state and re-enqueue
    const updated = await db.formatJob.update({
      where: { id },
      data: {
        status: "pending",
        progress: 0,
        statusText: null,
        error: null,
        attempts: job.attempts + 1,
        startedAt: null,
        completedAt: null,
        workerId: null,
      },
      include: { video: true },
    });

    await enqueueFormatting(job.id);
    await log(`Format job retried (skill=${job.skillName})`, {
      source: "formatting",
      level: "info",
      videoId: job.videoId,
      jobId: job.id,
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    console.error("[format-job PATCH]", err);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
