import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { isPlaylistUrl, fetchPlaylistInfo, fetchVideoInfo } from "@/lib/ytdlp";
import { enqueueTranscription } from "@/lib/queues";
import { log } from "@/lib/logs";

export const dynamic = "force-dynamic";

// GET /api/videos?status=&playlistId=&limit=&offset=
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const playlistId = searchParams.get("playlistId") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  // Map UI filter -> DB statuses
  let statusFilter: string[] | undefined;
  if (status && status !== "all") {
    if (status === "processing") {
      statusFilter = ["downloading", "uploading", "transcribing"];
    } else if (status === "pending") {
      statusFilter = ["pending"];
    } else if (status === "completed") {
      statusFilter = ["completed"];
    } else if (status === "failed") {
      statusFilter = ["failed"];
    } else {
      statusFilter = [status];
    }
  }

  const where: Record<string, unknown> = {};
  if (statusFilter && statusFilter.length > 0) {
    where.status = { in: statusFilter };
  }
  if (playlistId) where.playlistId = playlistId;

  try {
    const [total, videos] = await Promise.all([
      db.video.count({ where }),
      db.video.findMany({
        where,
        include: { playlist: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);
    return NextResponse.json({ total, count: videos.length, limit, offset, videos });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch videos", details: err?.message },
      { status: 500 }
    );
  }
}

// POST /api/videos  body: { url }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }

  try {
    if (isPlaylistUrl(url)) {
      // ─── Playlist ───
      const playlist = await db.playlist.create({
        data: { url, status: "fetching" },
      });

      let entries: { id: string; title: string; url: string; duration?: number; thumbnail?: string }[] = [];
      let playlistTitle: string | undefined;
      try {
        const info = await fetchPlaylistInfo(url);
        entries = info.entries;
        playlistTitle = info.title;
      } catch (err: any) {
        await db.playlist.update({
          where: { id: playlist.id },
          data: { status: "failed" },
        });
        await log("Playlist fetch failed", {
          level: "error",
          source: "yt-dlp",
          details: { url, error: err?.message },
        });
        return NextResponse.json(
          { error: "Failed to fetch playlist info", details: err?.message, playlistId: playlist.id },
          { status: 502 }
        );
      }

      // Create video records and enqueue
      const created: { id: string }[] = [];
      for (const e of entries) {
        const v = await db.video.create({
          data: {
            youtubeId: e.id,
            url: e.url,
            title: e.title || e.id,
            thumbnail: e.thumbnail,
            duration: e.duration,
            playlistId: playlist.id,
            status: "pending",
          },
        });
        created.push({ id: v.id });
        // best-effort enqueue (redis may be down in dev)
        try {
          await enqueueTranscription(v.id);
        } catch {
          /* ignore — DB record still exists */
        }
      }

      await db.playlist.update({
        where: { id: playlist.id },
        data: { status: "queued", title: playlistTitle, videoCount: created.length },
      });

      await log(`Playlist queued with ${created.length} videos`, {
        source: "api",
        details: { playlistId: playlist.id, url },
      });

      return NextResponse.json(
        {
          kind: "playlist",
          playlist: { id: playlist.id, url, title: playlistTitle, videoCount: created.length },
          videoCount: created.length,
        },
        { status: 201 }
      );
    }

    // ─── Single video ───
    // Try to fetch metadata for nicer title/thumbnail; fall back to URL parsing.
    let meta: { id: string; title: string; thumbnail?: string; duration?: number } | null = null;
    try {
      meta = await fetchVideoInfo(url);
    } catch {
      meta = null;
    }
    // Fallback: parse YouTube ID from URL
    let ytId = meta?.id || "";
    if (!ytId) {
      const m =
        url.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ||
        url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
        url.match(/embed\/([A-Za-z0-9_-]{6,})/);
      ytId = m ? m[1] : url;
    }

    const video = await db.video.create({
      data: {
        youtubeId: ytId,
        url,
        title: meta?.title || `فيديو يوتيوب ${ytId}`,
        thumbnail: meta?.thumbnail,
        duration: meta?.duration,
        status: "pending",
      },
    });

    try {
      await enqueueTranscription(video.id);
    } catch {
      /* ignore */
    }

    await log("Video created and queued", {
      source: "api",
      videoId: video.id,
      details: { youtubeId: ytId, url },
    });

    return NextResponse.json({ kind: "video", video }, { status: 201 });
  } catch (err: any) {
    await log("Failed to create video", {
      level: "error",
      source: "api",
      details: { url, error: err?.message },
    });
    return NextResponse.json(
      { error: "Failed to create video", details: err?.message },
      { status: 500 }
    );
  }
}
