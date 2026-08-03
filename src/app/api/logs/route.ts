import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { log, type LogLevel, type LogSource } from "@/lib/logs";

export const dynamic = "force-dynamic";

const VALID_LEVELS: LogLevel[] = ["info", "warn", "error", "debug"];
const VALID_SOURCES: LogSource[] = [
  "system",
  "transcription",
  "formatting",
  "auth",
  "api",
  "worker",
  "opencode",
  "yt-dlp",
  "deepgram",
];

// GET /api/logs?level=&source=&limit=&offset=&before=
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const url = req.nextUrl;
    const level = url.searchParams.get("level") || undefined;
    const source = url.searchParams.get("source") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1000);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    const beforeRaw = url.searchParams.get("before") || undefined;
    const afterRaw = url.searchParams.get("after") || undefined;

    const where: {
      level?: string;
      source?: string;
      createdAt?: { lt?: Date; gt?: Date };
    } = {};
    if (level && VALID_LEVELS.includes(level as LogLevel)) where.level = level;
    if (source && VALID_SOURCES.includes(source as LogSource)) where.source = source;
    if (beforeRaw) {
      const before = new Date(beforeRaw);
      if (!isNaN(before.getTime())) {
        where.createdAt = { ...where.createdAt, lt: before };
      }
    }
    if (afterRaw) {
      const after = new Date(afterRaw);
      if (!isNaN(after.getTime())) {
        where.createdAt = { ...where.createdAt, gt: after };
      }
    }

    const [logs, total] = await Promise.all([
      db.logEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.logEntry.count({ where }),
    ]);

    return NextResponse.json(
      { logs, total, hasMore: offset + logs.length < total },
      { headers: { "x-total-count": String(total) } }
    );
  } catch (err) {
    console.error("[logs GET]", err);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

// POST /api/logs { message, level?, source?, videoId?, jobId?, details? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { message, level, source, videoId, jobId, details } = body as {
      message: string;
      level?: string;
      source?: string;
      videoId?: string;
      jobId?: string;
      details?: unknown;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const safeLevel: LogLevel =
      level && VALID_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : "info";
    const safeSource: LogSource =
      source && VALID_SOURCES.includes(source as LogSource)
        ? (source as LogSource)
        : "api";

    await log(message, {
      level: safeLevel,
      source: safeSource,
      videoId: videoId || undefined,
      jobId: jobId || undefined,
      details,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[logs POST]", err);
    return NextResponse.json({ error: "Failed to create log" }, { status: 500 });
  }
}
