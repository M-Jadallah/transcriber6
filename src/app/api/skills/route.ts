import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { log } from "@/lib/logs";

export const dynamic = "force-dynamic";

// GET /api/skills
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const skills = await db.skill.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ skills });
  } catch (err) {
    console.error("[skills GET]", err);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}

// POST /api/skills { name, gitRepo, branch?, description?, defaultModelProvider?, defaultModelName? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { name, gitRepo, branch, description, defaultModelProvider, defaultModelName } = body as {
      name: string;
      gitRepo: string;
      branch?: string;
      description?: string;
      defaultModelProvider?: string;
      defaultModelName?: string;
    };

    if (!name || !gitRepo) {
      return NextResponse.json({ error: "name and gitRepo are required" }, { status: 400 });
    }

    if (defaultModelProvider) {
      const valid = ["openrouter", "openai", "codex", "deepseek"];
      if (!valid.includes(defaultModelProvider)) {
        return NextResponse.json({ error: "Invalid defaultModelProvider" }, { status: 400 });
      }
    }

    const skill = await db.skill.create({
      data: {
        name,
        gitRepo,
        branch: branch || "main",
        description: description || null,
        defaultModelProvider: defaultModelProvider || null,
        defaultModelName: defaultModelName || null,
      },
    });

    await log(`Skill created: ${name} (${gitRepo})`, {
      source: "system",
      level: "info",
      details: { skillId: skill.id, gitRepo, branch },
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    console.error("[skills POST]", err);
    const message = err instanceof Error ? err.message : "Failed to create skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/skills?id=
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }
    const skill = await db.skill.findUnique({ where: { id } });
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    await db.skill.delete({ where: { id } });
    await log(`Skill deleted: ${skill.name}`, {
      source: "system",
      level: "info",
      details: { skillId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[skills DELETE]", err);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
