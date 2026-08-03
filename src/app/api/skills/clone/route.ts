import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { logger } from "@/lib/logs";

// POST /api/skills/clone — body: { skillId }
// Marks the skill for re-clone (sets clonedAt = null). The actual cloning
// happens in the worker.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { skillId } = body as { skillId?: string };
    if (!skillId) {
      return NextResponse.json({ error: "Missing skillId" }, { status: 400 });
    }

    const skill = await db.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    await db.skill.update({
      where: { id: skillId },
      data: { clonedAt: null },
    });

    await logger.info(`Skill re-clone requested: ${skill.name}`, {
      source: "api",
      details: { skillId, gitRepo: skill.gitRepo, branch: skill.branch },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logger.error("Failed to mark skill for re-clone", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to mark skill for re-clone" }, { status: 500 });
  }
}
