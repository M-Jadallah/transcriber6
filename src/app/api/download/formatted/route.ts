import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { createZipBuffer } from "@/lib/zip";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic";

// RFC 5987 helper for Arabic filename encoding
function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^\x20-\x7E]/g, "").replace(/["\\/]/g, "").trim() || "file";
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const url = req.nextUrl;
    const id = url.searchParams.get("id");
    const idsParam = url.searchParams.get("ids");

    // Bulk download as zip
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: "No ids provided" }, { status: 400 });
      }
      const jobs = await db.formatJob.findMany({
        where: { id: { in: ids } },
        include: { video: true },
      });
      const files: { filename: string; content: Buffer }[] = [];
      for (const job of jobs) {
        if (!job.outputPath) continue;
        try {
          const buf = await fs.readFile(job.outputPath);
          const baseName = `${sanitizeName(job.video?.title || job.id)}.docx`;
          files.push({ filename: baseName, content: buf });
        } catch {
          // skip missing files
        }
      }
      if (files.length === 0) {
        return NextResponse.json({ error: "No files available for selected jobs" }, { status: 404 });
      }
      const singleFileBuffer = files.length === 1 ? files[0].content : null;
      if (singleFileBuffer) {
        return new NextResponse(new Uint8Array(singleFileBuffer) as BodyInit, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": contentDisposition(files[0].filename),
            "Content-Length": String(singleFileBuffer.length),
          },
        });
      }
      const zip = await createZipBuffer(files);
      return new NextResponse(new Uint8Array(zip) as BodyInit, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": contentDisposition("formatted-documents.zip"),
          "Content-Length": String(zip.length),
        },
      });
    }

    // Single download
    if (!id) {
      return NextResponse.json({ error: "id or ids parameter is required" }, { status: 400 });
    }
    const job = await db.formatJob.findUnique({
      where: { id },
      include: { video: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "completed" || !job.outputPath) {
      return NextResponse.json({ error: "Document not ready" }, { status: 409 });
    }
    try {
      const buf = await fs.readFile(job.outputPath);
      const baseName = `${sanitizeName(job.video?.title || job.id)}.docx`;
      return new NextResponse(new Uint8Array(buf) as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": contentDisposition(baseName),
          "Content-Length": String(buf.length),
        },
      });
    } catch {
      return NextResponse.json({ error: "Output file missing on disk" }, { status: 404 });
    }
  } catch (err) {
    console.error("[download/formatted]", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
