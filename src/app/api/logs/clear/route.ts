import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { log } from "@/lib/logs";

export const dynamic = "force-dynamic";

// POST /api/logs/clear — delete all logs
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const result = await db.logEntry.deleteMany({});
    // Re-add a single "cleared" entry so the audit trail is preserved
    await log(`All logs cleared (${result.count} entries removed)`, {
      source: "system",
      level: "warn",
      details: { removed: result.count },
    });
    return NextResponse.json({ ok: true, removed: result.count });
  } catch (err) {
    console.error("[logs/clear]", err);
    return NextResponse.json({ error: "Failed to clear logs" }, { status: 500 });
  }
}
