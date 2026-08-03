import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { redisCacheGet, redisCacheSet } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const cacheKey = "stats:overview";
  const cached = await redisCacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const [
      totalVideos,
      pendingVideos,
      processingVideos,
      completedVideos,
      failedVideos,
      totalPlaylists,
      totalFormatJobs,
      pendingFormatJobs,
      processingFormatJobs,
      completedFormatJobs,
      failedFormatJobs,
      totalSkills,
      activeSkills,
      totalCookies,
      activeCookies,
      totalLogs,
      errorLogs,
      transcriptionWorkers,
      formatWorkers,
      recentVideos,
      recentLogs,
      recentFormatJobs,
    ] = await Promise.all([
      db.video.count(),
      db.video.count({ where: { status: "pending" } }),
      db.video.count({ where: { status: { in: ["downloading", "uploading", "transcribing"] } } }),
      db.video.count({ where: { status: "completed" } }),
      db.video.count({ where: { status: "failed" } }),
      db.playlist.count(),
      db.formatJob.count(),
      db.formatJob.count({ where: { status: "pending" } }),
      db.formatJob.count({ where: { status: "processing" } }),
      db.formatJob.count({ where: { status: "completed" } }),
      db.formatJob.count({ where: { status: "failed" } }),
      db.skill.count(),
      db.skill.count({ where: { isActive: true } }),
      db.cookie.count(),
      db.cookie.count({ where: { isActive: true } }),
      db.logEntry.count(),
      db.logEntry.count({ where: { level: "error" } }),
      // Ensure known workers exist before querying
      (async () => {
        const known: Array<{ workerId: string; type: "transcribe" | "format" }> = [
          { workerId: "transcribe-1", type: "transcribe" },
          { workerId: "transcribe-2", type: "transcribe" },
          { workerId: "transcribe-3", type: "transcribe" },
          { workerId: "transcribe-4", type: "transcribe" },
          { workerId: "transcribe-5", type: "transcribe" },
          { workerId: "opencode-1", type: "format" },
          { workerId: "opencode-2", type: "format" },
        ];
        for (const w of known) {
          await db.workerStatus.upsert({
            where: { workerId: w.workerId },
            update: {},
            create: { workerId: w.workerId, type: w.type, status: "idle", enabled: true },
          });
        }
        return await db.workerStatus.findMany({ where: { type: "transcribe" } });
      })(),
      db.workerStatus.findMany({ where: { type: "format" } }),
      db.video.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { playlist: true } }),
      db.logEntry.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      db.formatJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { video: { select: { title: true, youtubeId: true } } },
      }),
    ]);

    // Calculate avg progress for processing videos
    const processingVideoRecords = await db.video.findMany({
      where: { status: { in: ["downloading", "uploading", "transcribing"] } },
      select: { progress: true },
    });
    const avgProgress =
      processingVideoRecords.length > 0
        ? Math.round(processingVideoRecords.reduce((sum, v) => sum + (v.progress || 0), 0) / processingVideoRecords.length)
        : 0;

    const activeTranscriptionWorkers = transcriptionWorkers.filter((w) => w.enabled).length;
    const activeFormatWorkers = formatWorkers.filter((w) => w.enabled).length;
    const transcribeActive = transcriptionWorkers.filter((w) => w.status === "active").length;
    const formatActive = formatWorkers.filter((w) => w.status === "active").length;

    // Success rate
    const successRate = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

    // ── 7-day trend: videos created + completed per day ──
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [recentCreatedVideos, recentCompletedVideos, recentFormatJobsCreated] = await Promise.all([
      db.video.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, status: true },
      }),
      db.video.findMany({
        where: { completedAt: { gte: sevenDaysAgo } },
        select: { completedAt: true },
      }),
      db.formatJob.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, status: true },
      }),
    ]);

    // Build 7-day array
    const trend: Array<{ date: string; label: string; videosCreated: number; videosCompleted: number; formatJobs: number }> = [];
    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const dateStr = d.toISOString().slice(0, 10);
      const label = dayNames[d.getDay()];
      const videosCreated = recentCreatedVideos.filter((v) => v.createdAt >= d && v.createdAt < next).length;
      const videosCompleted = recentCompletedVideos.filter((v) => v.completedAt && v.completedAt >= d && v.completedAt < next).length;
      const formatJobs = recentFormatJobsCreated.filter((v) => v.createdAt >= d && v.createdAt < next).length;
      trend.push({ date: dateStr, label, videosCreated, videosCompleted, formatJobs });
    }

    // ── Activity timeline (combined recent events) ──
    type ActivityItem = {
      id: string;
      type: "video" | "format" | "log";
      title: string;
      subtitle: string;
      status?: string;
      level?: string;
      timestamp: string;
    };
    const toISO = (d: Date | string | null | undefined): string =>
      d instanceof Date ? d.toISOString() : (d ?? new Date().toISOString());
    const activity: ActivityItem[] = [];

    for (const v of recentVideos) {
      activity.push({
        id: "v-" + v.id,
        type: "video",
        title: v.title,
        subtitle: `فيديو • ${v.youtubeId}`,
        status: v.status,
        timestamp: toISO(v.createdAt),
      });
    }
    for (const j of recentFormatJobs) {
      activity.push({
        id: "f-" + j.id,
        type: "format",
        title: j.skillName,
        subtitle: `تنسيق • ${j.video?.title || "فيديو محذوف"}`,
        status: j.status,
        timestamp: toISO(j.createdAt),
      });
    }
    for (const l of recentLogs.slice(0, 5)) {
      activity.push({
        id: "l-" + l.id,
        type: "log",
        title: l.message.slice(0, 80),
        subtitle: `سجل • ${l.source}`,
        level: l.level,
        timestamp: toISO(l.createdAt),
      });
    }
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const stats = {
      videos: {
        total: totalVideos,
        pending: pendingVideos,
        processing: processingVideos,
        completed: completedVideos,
        failed: failedVideos,
        successRate,
        avgProgress,
      },
      playlists: totalPlaylists,
      formatJobs: {
        total: totalFormatJobs,
        pending: pendingFormatJobs,
        processing: processingFormatJobs,
        completed: completedFormatJobs,
        failed: failedFormatJobs,
      },
      skills: { total: totalSkills, active: activeSkills },
      cookies: { total: totalCookies, active: activeCookies },
      logs: { total: totalLogs, errors: errorLogs },
      workers: {
        transcription: {
          total: transcriptionWorkers.length,
          enabled: activeTranscriptionWorkers,
          active: transcribeActive,
        },
        format: {
          total: formatWorkers.length,
          enabled: activeFormatWorkers,
          active: formatActive,
        },
        details: [...transcriptionWorkers, ...formatWorkers].map((w) => ({
          workerId: w.workerId,
          type: w.type,
          status: w.status,
          enabled: w.enabled,
          currentJobId: w.currentJobId,
          currentVideoId: w.currentVideoId,
          lastHeartbeat: w.lastHeartbeat,
          lastError: w.lastError,
        })),
      },
      recentVideos,
      recentLogs,
      recentFormatJobs,
      trend,
      activity: activity.slice(0, 12),
      generatedAt: new Date().toISOString(),
    };

    await redisCacheSet(cacheKey, stats, 15); // 15s cache
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
