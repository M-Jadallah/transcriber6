import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logs";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    // Get completed videos to attach format jobs to
    const videos = await db.video.findMany({ where: { status: "completed" }, take: 5 });
    if (videos.length === 0) {
      return NextResponse.json({ error: "No completed videos found. Seed videos first." }, { status: 400 });
    }

    // Ensure a demo skill exists
    let skill = await db.skill.findFirst({ where: { name: "تنسيق المحاضرات" } });
    if (!skill) {
      skill = await db.skill.create({
        data: {
          name: "تنسيق المحاضرات",
          gitRepo: "https://github.com/example/lecture-format-skill",
          branch: "main",
          description: "مهارة لتنسيق تفريغ المحاضرات إلى ملف Word منسّق مع عناوين وفقرات",
          defaultModelProvider: "openrouter",
          defaultModelName: "anthropic/claude-3.5-sonnet",
          isActive: true,
        },
      });
    }

    // Sample model providers/names
    const models = [
      { provider: "openrouter", name: "anthropic/claude-3.5-sonnet" },
      { provider: "openai", name: "gpt-4o" },
      { provider: "deepseek", name: "deepseek-chat" },
      { provider: "codex", name: "codex-mini-latest" },
      { provider: "openrouter", name: "google/gemini-2.0-flash-exp" },
    ];

    const statuses = ["pending", "processing", "completed", "completed", "failed"];
    const progress = [0, 45, 100, 100, 0];
    const statusTexts = [null, "Applying skill via OpenCode...", null, null, "OpenCode not installed"];
    const errors = [null, null, null, null, "OpenCode not installed in this environment"];

    let created = 0;
    for (let i = 0; i < Math.min(videos.length, 5); i++) {
      const existing = await db.formatJob.findFirst({
        where: { videoId: videos[i].id },
      });
      if (existing) continue;

      await db.formatJob.create({
        data: {
          videoId: videos[i].id,
          skillId: skill.id,
          skillName: skill.name,
          modelProvider: models[i].provider,
          modelName: models[i].name,
          status: statuses[i],
          progress: progress[i],
          statusText: statusTexts[i],
          error: errors[i],
          attempts: statuses[i] === "failed" ? 2 : 0,
          startedAt: statuses[i] !== "pending" ? new Date(Date.now() - 3600000) : null,
          completedAt: statuses[i] === "completed" ? new Date(Date.now() - 1800000) : null,
        },
      });
      created++;
    }

    await logger.info(`Seeded ${created} format jobs for dev`, { source: "api" });
    return NextResponse.json({ ok: true, seeded: created, skillId: skill.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
