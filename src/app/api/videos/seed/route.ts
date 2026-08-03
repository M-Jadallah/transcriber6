import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// POST /api/videos/seed — DEV ONLY helper to populate mock data
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seed endpoint is disabled in production" },
      { status: 403 }
    );
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const now = new Date();
  const isoFromMinutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const samples = [
    {
      youtubeId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "محاضرة في الفلسفة - مناقشة أفكار أرسطو",
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      duration: 212,
      status: "completed",
      progress: 100,
      statusText: "Transcription complete",
      transcriptText:
        "بسم الله الرحمن الرحيم، نبدأ محاضرتنا اليوم بمقدمة عن الفلسفة اليونانية.\nأرسطو تلميذ أفلاطون، وأفلاطون تلميذ سقراط...\nونرى في هذا المقطع كيف تطورت المدرسة المشائية.",
      completedAt: isoFromMinutesAgo(10),
      startedAt: isoFromMinutesAgo(15),
    },
    {
      youtubeId: "9bZkp7q19f0",
      url: "https://www.youtube.com/watch?v=9bZkp7q19f0",
      title: "شرح درس الرياضيات: حساب التفاضل والتكامل",
      thumbnail: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
      duration: 645,
      status: "transcribing",
      progress: 45,
      statusText: "Uploading to Deepgram...",
      startedAt: isoFromMinutesAgo(3),
    },
    {
      youtubeId: "kJQP7kiw5Fk",
      url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      title: "حلقة نقاشية حول أدب العصر الجاهلي",
      thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
      duration: 1830,
      status: "downloading",
      progress: 22,
      statusText: "Downloading audio...",
      startedAt: isoFromMinutesAgo(1),
    },
    {
      youtubeId: "OPf0YbXqDm0",
      url: "https://www.youtube.com/watch?v=OPf0YbXqDm0",
      title: "مقدمة في علم الاجتماع السياسي",
      thumbnail: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg",
      duration: 540,
      status: "pending",
      progress: 0,
      statusText: "Queued",
    },
    {
      youtubeId: "fJ9rUzIMcZQ",
      url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
      title: "محاضرة في الفيزياء الكمية - مبدأ عدم اليقين",
      thumbnail: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
      duration: 980,
      status: "failed",
      progress: 0,
      statusText: "Failed",
      error:
        "yt-dlp exited with code 1: ERROR: [youtube] fJ9rUzIMcZQ: Video unavailable. This video is no longer available because the YouTube account associated with this video has been terminated.",
      attempts: 3,
      cookieUsed: "cookies-1.txt",
    },
    {
      youtubeId: "3JZ_D3ELwOQ",
      url: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
      title: "ندوة حول اقتصاد السوق والتنمية المستدامة",
      thumbnail: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg",
      duration: 4250,
      status: "completed",
      progress: 100,
      statusText: "Transcription complete",
      transcriptText:
        "نرحب بكم في هذه الندوة التي تناقش مستقبل الاقتصاد الرقمي في المنطقة العربية.\nويشاركنا اليوم نخبة من الأساتذة والباحثين...",
      completedAt: isoFromMinutesAgo(120),
      startedAt: isoFromMinutesAgo(135),
    },
    {
      youtubeId: "hY7m5jjJ9mM",
      url: "https://www.youtube.com/watch?v=hY7m5jjJ9mM",
      title: "درس في اللغة العربية: النحو والصرف",
      thumbnail: "https://i.ytimg.com/vi/hY7m5jjJ9mM/hqdefault.jpg",
      duration: 760,
      status: "uploading",
      progress: 65,
      statusText: "Uploading to Deepgram...",
      startedAt: isoFromMinutesAgo(2),
    },
    {
      youtubeId: "CevxZvSJLk8",
      url: "https://www.youtube.com/watch?v=CevxZvSJLk8",
      title: "مقدمة في علم النفس التربوي",
      thumbnail: "https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg",
      duration: 332,
      status: "pending",
      progress: 0,
      statusText: "Queued",
    },
  ];

  try {
    const created = await db.video.createMany({
      data: samples.map((s) => ({
        youtubeId: s.youtubeId,
        url: s.url,
        title: s.title,
        thumbnail: s.thumbnail,
        duration: s.duration,
        status: s.status,
        progress: s.progress,
        statusText: s.statusText,
        transcriptText: s.transcriptText ?? null,
        error: s.error ?? null,
        attempts: s.attempts ?? 0,
        cookieUsed: s.cookieUsed ?? null,
        startedAt: s.startedAt ?? null,
        completedAt: s.completedAt ?? null,
      })),
    });
    return NextResponse.json({ ok: true, seeded: created.count });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Seed failed", details: err?.message },
      { status: 500 }
    );
  }
}
