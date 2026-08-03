import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { generateTextDocx } from "@/lib/docx-gen";
import { createZipBuffer } from "@/lib/zip";

export const dynamic = "force-dynamic";

// RFC 5987 percent-encoding for Content-Disposition filenames (Arabic safe)
function rfc5987Encode(s: string): string {
  return encodeURIComponent(s)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A")
    .replace(/%(?:7C|60|5E)/g, escape);
}

function sanitizeFilename(s: string): string {
  // strip characters problematic on common filesystems
  return (s || "").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "transcript";
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Format = "txt" | "docx" | "json";

function parseFormat(raw: string | null): Format {
  if (raw === "docx") return "docx";
  if (raw === "json") return "json";
  return "txt"; // default
}

function buildTxt(title: string, transcriptText: string | null): string {
  const header = title ? `${title}\n${"=".repeat(Math.min(title.length, 60))}\n\n` : "";
  return header + (transcriptText || "(لا يوجد نص بعد)");
}

function buildJson(video: {
  id: string;
  youtubeId: string;
  title: string;
  url: string;
  transcriptText: string | null;
  transcriptJson: string | null;
  duration?: number | null;
}): unknown {
  if (video.transcriptJson) {
    try {
      return JSON.parse(video.transcriptJson);
    } catch {
      /* fall through */
    }
  }
  return {
    video: {
      id: video.id,
      youtubeId: video.youtubeId,
      title: video.title,
      url: video.url,
      duration: video.duration ?? null,
    },
    text: video.transcriptText || "",
  };
}

// GET /api/download/transcript?id=<id>&format=txt|docx|json
// GET /api/download/transcript?ids=<id1,id2,...>&format=txt|docx|json   (returns ZIP)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const singleId = searchParams.get("id");
  const idsRaw = searchParams.get("ids");
  const format = parseFormat(searchParams.get("format"));
  const ids = parseIds(idsRaw);

  // ─── Single download ───
  if (singleId && ids.length === 0) {
    let video;
    try {
      video = await db.video.findUnique({ where: { id: singleId } });
    } catch (err: any) {
      return NextResponse.json(
        { error: "DB error", details: err?.message },
        { status: 500 }
      );
    }
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const safeTitle = sanitizeFilename(video.title);
    const txt = buildTxt(video.title, video.transcriptText);

    if (format === "txt") {
      const buf = Buffer.from(txt, "utf-8");
      const filename = `${safeTitle}.txt`;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="transcript.txt"; filename*=UTF-8''${rfc5987Encode(filename)}`,
          "Content-Length": String(buf.length),
        },
      });
    }

    if (format === "docx") {
      try {
        const buf = await generateTextDocx(txt, { title: video.title, rtl: true });
        const filename = `${safeTitle}.docx`;
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="transcript.docx"; filename*=UTF-8''${rfc5987Encode(filename)}`,
            "Content-Length": String(buf.length),
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: "Failed to generate docx", details: err?.message },
          { status: 500 }
        );
      }
    }

    // json
    const payload = buildJson(video);
    const buf = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
    const filename = `${safeTitle}.json`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="transcript.json"; filename*=UTF-8''${rfc5987Encode(filename)}`,
        "Content-Length": String(buf.length),
      },
    });
  }

  // ─── Bulk download (ZIP) ───
  if (ids.length > 0) {
    let videos;
    try {
      videos = await db.video.findMany({ where: { id: { in: ids } } });
    } catch (err: any) {
      return NextResponse.json(
        { error: "DB error", details: err?.message },
        { status: 500 }
      );
    }

    const files: { filename: string; content: Buffer }[] = [];
    const usedNames = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
      let n = `${base}.${ext}`;
      let i = 1;
      while (usedNames.has(n)) {
        n = `${base}_${i++}.${ext}`;
      }
      usedNames.add(n);
      return n;
    };

    for (const v of videos) {
      const safe = sanitizeFilename(v.title);
      const txt = buildTxt(v.title, v.transcriptText);
      if (format === "txt") {
        files.push({ filename: uniqueName(safe, "txt"), content: Buffer.from(txt, "utf-8") });
      } else if (format === "json") {
        const payload = buildJson(v);
        files.push({
          filename: uniqueName(safe, "json"),
          content: Buffer.from(JSON.stringify(payload, null, 2), "utf-8"),
        });
      } else {
        // docx — generate per video
        try {
          const buf = await generateTextDocx(txt, { title: v.title, rtl: true });
          files.push({ filename: uniqueName(safe, "docx"), content: buf });
        } catch {
          // skip on failure
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No transcripts available to download" },
        { status: 404 }
      );
    }

    try {
      const zipBuf = await createZipBuffer(files);
      const filename = `transcripts-${new Date().toISOString().slice(0, 10)}.zip`;
      return new NextResponse(new Uint8Array(zipBuf), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="transcripts.zip"; filename*=UTF-8''${rfc5987Encode(filename)}`,
          "Content-Length": String(zipBuf.length),
        },
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: "Failed to create ZIP", details: err?.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Provide ?id= or ?ids= query parameter" },
    { status: 400 }
  );
}
