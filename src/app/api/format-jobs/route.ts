import { NextRequest, NextResponse } from "next/server";
import type { FormatJob, Video } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { enqueueFormatting } from "@/lib/queues";
import { log } from "@/lib/logs";

export const dynamic = "force-dynamic";

// GET /api/format-jobs?status=&videoId=
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const url = req.nextUrl;
    const status = url.searchParams.get("status") || undefined;
    const videoId = url.searchParams.get("videoId") || undefined;

    const where: { status?: string; videoId?: string } = {};
    if (status) where.status = status;
    if (videoId) where.videoId = videoId;

    const jobs = await db.formatJob.findMany({
      where,
      include: { video: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error("[format-jobs GET]", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

// POST /api/format-jobs { videoIds, skillId, modelProvider, modelName }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { videoIds, skillId, modelProvider, modelName } = body as {
      videoIds: string[];
      skillId: string;
      modelProvider: string;
      modelName: string;
    };

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json({ error: "videoIds must be a non-empty array" }, { status: 400 });
    }
    if (!skillId) {
      return NextResponse.json({ error: "skillId is required" }, { status: 400 });
    }
    if (!modelProvider || !modelName) {
      return NextResponse.json({ error: "modelProvider and modelName are required" }, { status: 400 });
    }

    const validProviders = ["openrouter", "openai", "codex", "deepseek"];
    if (!validProviders.includes(modelProvider)) {
      return NextResponse.json({ error: "Invalid modelProvider" }, { status: 400 });
    }

    const skill = await db.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Validate videos exist and have completed transcripts
    const videos = await db.video.findMany({
      where: { id: { in: videoIds } },
      select: { id: true, title: true, status: true, transcriptText: true },
    });
    if (videos.length === 0) {
      return NextResponse.json({ error: "No valid videos found" }, { status: 404 });
    }

    const created: Array<FormatJob & { video: Video }> = [];
    for (const v of videos) {
      const job = await db.formatJob.create({
        data: {
          videoId: v.id,
          skillId: skill.id,
          skillName: skill.name,
          modelProvider,
          modelName,
          status: "pending",
        },
        include: { video: true },
      });
      await enqueueFormatting(job.id);
      await log(`Format job created for video "${v.title}" with skill "${skill.name}" (${modelProvider}/${modelName})`, {
        source: "formatting",
        level: "info",
        videoId: v.id,
        jobId: job.id,
        details: { skillId: skill.id, modelProvider, modelName },
      });
      created.push(job);
    }

    return NextResponse.json({ jobs: created }, { status: 201 });
  } catch (err) {
    console.error("[format-jobs POST]", err);
    return NextResponse.json({ error: "Failed to create jobs" }, { status: 500 });
  }
}
