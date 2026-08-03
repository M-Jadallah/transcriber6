import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { log } from "@/lib/logs";

export const dynamic = "force-dynamic";

function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

// GET /api/providers
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const providers = await db.aIProvider.findMany({
      orderBy: { provider: "asc" },
    });
    // Mask the apiKey
    const masked = providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
      hasKey: !!p.apiKey,
    }));
    return NextResponse.json({ providers: masked });
  } catch (err) {
    console.error("[providers GET]", err);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}

// POST /api/providers { provider, apiKey }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { provider, apiKey } = body as { provider: string; apiKey: string };

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider and apiKey are required" }, { status: 400 });
    }

    const valid = ["openrouter", "openai", "codex", "deepseek"];
    if (!valid.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const result = await db.aIProvider.upsert({
      where: { provider },
      update: { apiKey, isActive: true },
      create: { provider, apiKey, isActive: true },
    });

    await log(`AI provider ${provider} credentials updated`, {
      source: "system",
      level: "info",
      details: { provider },
    });

    return NextResponse.json({
      provider: { ...result, apiKey: maskApiKey(result.apiKey), hasKey: true },
    });
  } catch (err) {
    console.error("[providers POST]", err);
    return NextResponse.json({ error: "Failed to save provider" }, { status: 500 });
  }
}

// PATCH /api/providers { id, isActive }
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { id, isActive } = body as { id: string; isActive: boolean };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.aIProvider.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const updated = await db.aIProvider.update({
      where: { id },
      data: { isActive: !!isActive },
    });

    await log(`AI provider ${updated.provider} ${isActive ? "enabled" : "disabled"}`, {
      source: "system",
      level: "info",
      details: { providerId: id, isActive },
    });

    return NextResponse.json({
      provider: { ...updated, apiKey: maskApiKey(updated.apiKey), hasKey: !!updated.apiKey },
    });
  } catch (err) {
    console.error("[providers PATCH]", err);
    return NextResponse.json({ error: "Failed to update provider" }, { status: 500 });
  }
}

// DELETE /api/providers?id=
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }
    const existing = await db.aIProvider.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    await db.aIProvider.delete({ where: { id } });
    await log(`AI provider ${existing.provider} deleted`, {
      source: "system",
      level: "info",
      details: { providerId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[providers DELETE]", err);
    return NextResponse.json({ error: "Failed to delete provider" }, { status: 500 });
  }
}
