import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  try {
    const [videos, formatJobs, logs, skills] = await Promise.all([
      db.video.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { youtubeId: { contains: q } },
            { statusText: { contains: q } },
            { error: { contains: q } },
          ],
        },
        select: {
          id: true,
          title: true,
          youtubeId: true,
          status: true,
          progress: true,
          createdAt: true,
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.formatJob.findMany({
        where: {
          OR: [
            { skillName: { contains: q } },
            { modelName: { contains: q } },
            { modelProvider: { contains: q } },
            { error: { contains: q } },
          ],
        },
        select: {
          id: true,
          skillName: true,
          modelProvider: true,
          modelName: true,
          status: true,
          progress: true,
          createdAt: true,
          video: { select: { title: true, youtubeId: true } },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.logEntry.findMany({
        where: {
          OR: [
            { message: { contains: q } },
            { source: { contains: q } },
          ],
        },
        select: {
          id: true,
          level: true,
          source: true,
          message: true,
          createdAt: true,
          videoId: true,
          jobId: true,
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.skill.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { gitRepo: { contains: q } },
            { description: { contains: q } },
          ],
        },
        select: {
          id: true,
          name: true,
          gitRepo: true,
          description: true,
          isActive: true,
          createdAt: true,
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const results = [
      ...videos.map((v) => ({
        type: "video" as const,
        id: v.id,
        title: v.title,
        subtitle: `فيديو • ${v.youtubeId}`,
        status: v.status,
        href: "/transcription",
        createdAt: v.createdAt.toISOString(),
      })),
      ...formatJobs.map((j) => ({
        type: "format" as const,
        id: j.id,
        title: j.skillName,
        subtitle: `تنسيق • ${j.video?.title || "فيديو محذوف"} • ${j.modelProvider}/${j.modelName}`,
        status: j.status,
        href: "/formatting",
        createdAt: j.createdAt.toISOString(),
      })),
      ...logs.map((l) => ({
        type: "log" as const,
        id: l.id,
        title: l.message.slice(0, 100),
        subtitle: `سجل • ${l.source}${l.videoId ? ` • فيديو: ${l.videoId.slice(0, 8)}` : ""}${l.jobId ? ` • مهمة: ${l.jobId.slice(0, 8)}` : ""}`,
        status: l.level,
        href: "/logs",
        createdAt: l.createdAt.toISOString(),
      })),
      ...skills.map((s) => ({
        type: "skill" as const,
        id: s.id,
        title: s.name,
        subtitle: `مهارة • ${s.gitRepo}${s.description ? ` • ${s.description.slice(0, 60)}` : ""}`,
        status: s.isActive ? "active" : "inactive",
        href: "/settings",
        createdAt: s.createdAt.toISOString(),
      })),
    ];

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      results: results.slice(0, limit * 2),
      query: q,
      counts: {
        videos: videos.length,
        formatJobs: formatJobs.length,
        logs: logs.length,
        skills: skills.length,
        total: results.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
