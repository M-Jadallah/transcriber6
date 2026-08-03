import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { logger } from "@/lib/logs";

// GET /api/cookies — list all cookies (without content)
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const rows = await db.cookie.findMany({ orderBy: { order: "asc" } });
    const data = rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      order: r.order,
      isActive: r.isActive,
      lastUsedAt: r.lastUsedAt,
      lastError: r.lastError,
      createdAt: r.createdAt,
    }));
    return NextResponse.json({ cookies: data });
  } catch (err) {
    await logger.error("Failed to list cookies", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to list cookies" }, { status: 500 });
  }
}

// POST /api/cookies — multipart/form-data upload (field "file")
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded (field name: file)" }, { status: 400 });
    }

    const filename = file.name || "cookies.txt";
    const content = await file.text();

    // Basic validation: Netscape cookies.txt format usually starts with "# Netscape" or contains tab-separated lines
    if (content.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // Determine next order
    const maxRow = await db.cookie.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    const nextOrder = (maxRow?.order ?? -1) + 1;

    const created = await db.cookie.create({
      data: {
        filename,
        content,
        order: nextOrder,
        isActive: true,
      },
    });

    await logger.info(`Cookie uploaded: ${filename}`, {
      source: "api",
      details: { cookieId: created.id, filename, size: content.length, order: nextOrder },
    });

    return NextResponse.json({
      ok: true,
      cookie: {
        id: created.id,
        filename: created.filename,
        order: created.order,
        isActive: created.isActive,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    await logger.error("Failed to upload cookie", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to upload cookie" }, { status: 500 });
  }
}

// PATCH /api/cookies?id=... — body: { isActive?, order? }
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json();
    const data: { isActive?: boolean; order?: number } = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.order === "number") data.order = body.order;

    const updated = await db.cookie.update({ where: { id }, data });
    await logger.info(`Cookie updated: ${updated.filename}`, {
      source: "api",
      details: { cookieId: id, ...data },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logger.error("Failed to update cookie", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to update cookie" }, { status: 500 });
  }
}

// DELETE /api/cookies?id=...
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const deleted = await db.cookie.delete({ where: { id } });
    await logger.info(`Cookie deleted: ${deleted.filename}`, {
      source: "api",
      details: { cookieId: id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logger.error("Failed to delete cookie", { source: "api", details: String(err) });
    return NextResponse.json({ error: "Failed to delete cookie" }, { status: 500 });
  }
}
