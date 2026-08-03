import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const VALID_LEVELS = ["info", "warn", "error", "debug"];
const VALID_SOURCES = [
  "system", "transcription", "formatting", "auth", "api",
  "worker", "opencode", "yt-dlp", "deepgram",
];

function escapeCSV(value: string): string {
  if (!value) return "";
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const escaped = value.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "csv";
  const level = searchParams.get("level") || undefined;
  const source = searchParams.get("source") || undefined;
  const afterRaw = searchParams.get("after") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "5000", 10), 10000);

  const where: {
    level?: string;
    source?: string;
    createdAt?: { gt?: Date };
  } = {};
  if (level && VALID_LEVELS.includes(level)) where.level = level;
  if (source && VALID_SOURCES.includes(source)) where.source = source;
  if (afterRaw) {
    const after = new Date(afterRaw);
    if (!isNaN(after.getTime())) {
      where.createdAt = { gt: after };
    }
  }

  const logs = await db.logEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (format === "json") {
    const body = JSON.stringify(logs, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="logs-${Date.now()}.json"`,
      },
    });
  }

  if (format === "txt") {
    const lines = logs.map((l) => {
      const ts = l.createdAt.toISOString();
      const details = l.details ? ` | ${l.details}` : "";
      return `[${ts}] ${l.level.toUpperCase().padEnd(5)} ${l.source.padEnd(12)} | ${l.message}${details}`;
    });
    const body = lines.join("\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="logs-${Date.now()}.txt"`,
      },
    });
  }

  // CSV (default)
  const headers = ["timestamp", "level", "source", "message", "details", "videoId", "jobId", "workerId"];
  const rows = logs.map((l) =>
    [
      l.createdAt.toISOString(),
      l.level,
      l.source,
      escapeCSV(l.message),
      escapeCSV(l.details || ""),
      l.videoId || "",
      l.jobId || "",
      l.workerId || "",
    ].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="logs-${Date.now()}.csv"`,
    },
  });
}
