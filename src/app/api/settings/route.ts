import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getAllSettings, setSettings } from "@/lib/settings";
import { logger } from "@/lib/logs";

// GET /api/settings — return all settings as { key: value }
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const settings = await getAllSettings();
    return NextResponse.json(settings);
  } catch (err) {
    await logger.error("Failed to fetch settings", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PUT /api/settings — body: { key: value, ... } — update multiple settings
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Expected object body" }, { status: 400 });
    }

    // Only accept string values (settings are key-value strings)
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      entries[k] = String(v);
    }

    if (Object.keys(entries).length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    await setSettings(entries);
    await logger.info("Settings updated", {
      source: "api",
      details: { keys: Object.keys(entries) },
    });

    return NextResponse.json({ ok: true, updated: Object.keys(entries) });
  } catch (err) {
    await logger.error("Failed to update settings", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
