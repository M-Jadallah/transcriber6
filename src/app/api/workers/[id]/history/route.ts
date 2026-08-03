import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/workers/[id]/history — recent jobs processed by this worker
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id: workerId } = await params;

  try {
    // Get recent videos processed by this worker
    const videos = await db.video.findMany({
      where: { workerId },
      select: {
        id: true,
        title: true,
        youtubeId: true,
        status: true,
        progress: true,
        attempts: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Get recent format jobs processed by this worker
    const formatJobs = await db.formatJob.findMany({
      where: { workerId },
      select: {
        id: true,
        skillName: true,
        modelProvider: true,
        modelName: true,
        status: true,
        progress: true,
        attempts: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        video: { select: { title: true, youtubeId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Get recent logs for this worker
    const logs = await db.logEntry.findMany({
      where: { workerId },
      select: {
        id: true,
        level: true,
        source: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Combine into a unified history timeline
    type HistoryItem = {
      id: string;
      type: "video" | "format" | "log";
      title: string;
      subtitle: string;
      status: string;
      timestamp: string;
    };

    const history: HistoryItem[] = [
      ...videos.map((v) => ({
        id: "v-" + v.id,
        type: "video" as const,
        title: v.title,
        subtitle: `فيديو • ${v.youtubeId}${v.attempts > 0 ? ` • محاولات: ${v.attempts}` : ""}`,
        status: v.status,
        timestamp: (v.completedAt || v.startedAt || v.createdAt).toISOString(),
      })),
      ...formatJobs.map((j) => ({
        id: "f-" + j.id,
        type: "format" as const,
        title: j.skillName,
        subtitle: `تنسيق • ${j.video?.title || "—"} • ${j.modelProvider}/${j.modelName}`,
        status: j.status,
        timestamp: (j.completedAt || j.startedAt || j.createdAt).toISOString(),
      })),
      ...logs.map((l) => ({
        id: "l-" + l.id,
        type: "log" as const,
        title: l.message.slice(0, 100),
        subtitle: `سجل • ${l.source}`,
        status: l.level,
        timestamp: l.createdAt.toISOString(),
      })),
    ];

    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Stats
    const stats = {
      totalVideos: videos.length,
      completedVideos: videos.filter((v) => v.status === "completed").length,
      failedVideos: videos.filter((v) => v.status === "failed").length,
      totalFormatJobs: formatJobs.length,
      completedFormatJobs: formatJobs.filter((j) => j.status === "completed").length,
      failedFormatJobs: formatJobs.filter((j) => j.status === "failed").length,
      totalLogs: logs.length,
      errorLogs: logs.filter((l) => l.level === "error").length,
    };

    return NextResponse.json({
      workerId,
      history: history.slice(0, 20),
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
