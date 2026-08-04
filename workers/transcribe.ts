/**
 * workers/transcribe.ts
 * ---------------------
 * YouTube audio download + Deepgram transcription worker.
 *
 * Runs as a standalone Node/Bun process (NOT inside Next.js):
 *   bun workers/transcribe.ts
 *
 * Each worker container has its own Deepgram API key. WORKER_INDEX (1-5)
 * selects which env var to read: DEEPGRAM_API_KEY_<INDEX>.
 *
 * Pipeline (per BullMQ job on the "transcription" queue):
 *   1. Load Video from DB. Skip if not found / already completed.
 *   2. Honor WorkerStatus.enabled — if disabled, re-delay the job 30s.
 *   3. Mark "downloading" (progress 5) + emitProgress + log.
 *   4. Load audio settings + active cookies (ordered by `order` asc).
 *   5. yt-dlp download with multi-cookie fallback:
 *        - For each cookie: write temp cookies.txt → downloadAudio().
 *          On success: record cookieUsedId, break.
 *          On YtDlpError.isCookieRelated(): mark cookie lastError, try next.
 *          On YtDlpError.isVideoUnavailable(): fail permanently.
 *        - If no cookies configured: try once without cookies.
 *        - If all cookies fail: fail with "All cookies failed — please update cookies in settings".
 *      Progress is mapped from yt-dlp's 0-100 → video 5-50, emitted live.
 *   6. Mark "uploading" (progress 55) + audioPath + cookieUsed + audioBitrate/Channels.
 *   7. Read audio file into Buffer.
 *   8. Mark "transcribing" (progress 70) → call transcribeWithDeepgram() with
 *      the worker's own API key (DEEPGRAM_API_KEY_<INDEX>).
 *      On DeepgramError:
 *        - isAuthError → permanent fail (bad key).
 *        - isQuota → permanent fail (quota exhausted).
 *        - isRateLimit → throw (BullMQ retries with backoff).
 *        - else → throw (BullMQ retries).
 *   9. Mark "completed" (progress 100) + transcriptText + transcriptJson + completedAt.
 *  10. Cleanup temp cookie files (in finally).
 *
 * On any uncaught error: increment video.attempts. If attempts >= maxAttempts →
 *   status "failed", error = message, emitProgress, log. Else → throw (BullMQ retries).
 *
 * Heartbeat (every 15s): upsert WorkerStatus { lastHeartbeat, status }.
 *   If WorkerStatus.enabled === false → pause BullMQ worker (and re-delay any
 *   in-flight job defensively). Resume when re-enabled.
 *
 * Graceful shutdown: SIGTERM/SIGINT → close worker, set status "idle", exit.
 */

import { Worker, type Job } from "bullmq";
import path from "path";
import fs from "fs/promises";
import os from "os";

import { db } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { TRANSCRIPTION_QUEUE } from "../src/lib/queues";
import { log, logger } from "../src/lib/logs";
import { getAudioSettings, getDeepgramSettings, getSetting } from "../src/lib/settings";
import { downloadAudio, YtDlpError } from "../src/lib/ytdlp";
import { transcribeWithDeepgram, DeepgramError } from "../src/lib/deepgram";
import { emitProgress } from "../src/lib/realtime-emit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_INDEX = parseInt(process.env.WORKER_INDEX || "1", 10);
const WORKER_ID = process.env.WORKER_ID || `transcribe-${WORKER_INDEX}`;
const AUDIO_DIR = process.env.AUDIO_DIR || path.join(process.cwd(), "data", "audio");
const HEARTBEAT_MS = 15_000;
const DISABLED_RETRY_MS = 30_000;
const MAX_ATTEMPTS_FALLBACK = 3;

if (!Number.isFinite(WORKER_INDEX) || WORKER_INDEX < 1) {
  console.error(`[transcribe] Invalid WORKER_INDEX: ${process.env.WORKER_INDEX}`);
  process.exit(1);
}

let worker: Worker | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

async function heartbeat(): Promise<void> {
  try {
    const updated = await db.workerStatus.upsert({
      where: { workerId: WORKER_ID },
      create: {
        workerId: WORKER_ID,
        type: "transcribe",
        status: "idle",
        enabled: true,
        lastHeartbeat: new Date(),
      },
      update: {
        lastHeartbeat: new Date(),
        type: "transcribe",
      },
    });

    // Pause / resume the BullMQ worker based on the enabled flag.
    if (worker) {
      if (!updated.enabled && !worker.isPaused()) {
        logger.warn(`Worker ${WORKER_ID} disabled by admin — pausing`, {
          source: "worker",
          workerId: WORKER_ID,
        });
        try {
          await worker.pause();
        } catch (err) {
          console.error("[heartbeat] pause failed:", err);
        }
      } else if (updated.enabled && worker.isPaused()) {
        logger.info(`Worker ${WORKER_ID} re-enabled — resuming`, {
          source: "worker",
          workerId: WORKER_ID,
        });
        try {
          await worker.resume();
        } catch (err) {
          console.error("[heartbeat] resume failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[heartbeat-failed]", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateProgress(
  videoId: string,
  progress: number,
  status: string,
  statusText: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.video.update({
      where: { id: videoId },
      data: { progress, status, statusText, ...extra },
    });
  } catch (err) {
    console.error("[update-progress-failed]", err);
  }
  await emitProgress({ type: "video", id: videoId, status, progress, statusText });
}

function truncate(s: string, n: number): string {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

interface TranscriptionJobData {
  videoId: string;
  workerIndex?: number;
}

async function processJob(
  job: Job<TranscriptionJobData>,
  token?: string
): Promise<void> {
  const { videoId } = job.data;

  // 1. Load video (skip silently if not found / already completed).
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) {
    logger.warn(`Video ${videoId} not found — skipping`, {
      source: "transcription",
      workerId: WORKER_ID,
      videoId,
    });
    return;
  }
  if (video.status === "completed") {
    logger.info(`Video ${videoId} already completed — skipping`, {
      source: "transcription",
      workerId: WORKER_ID,
      videoId,
    });
    return;
  }

  // 2. Defensive enabled check (heartbeat already pauses the worker, but a
  //    job could have been picked up just before the pause kicked in).
  const ws = await db.workerStatus.findUnique({ where: { workerId: WORKER_ID } });
  if (ws && !ws.enabled) {
    logger.warn(`Worker ${WORKER_ID} disabled — re-delaying job ${job.id}`, {
      source: "transcription",
      workerId: WORKER_ID,
      videoId,
    });
    try {
      await job.moveToDelayed(Date.now() + DISABLED_RETRY_MS, token);
      return;
    } catch {
      throw new Error(`Worker ${WORKER_ID} disabled — will retry`);
    }
  }

  try {
    await runTranscriptionPipeline(video);
  } catch (err) {
    await handleJobError(videoId, err);
    throw err;
  }
}

/**
 * The actual transcription pipeline (steps 3–9 in the docstring above).
 * Wrapped in try/catch by processJob so we can increment attempts uniformly.
 */
async function runTranscriptionPipeline(video: {
  id: string;
  youtubeId: string;
  url: string;
}): Promise<void> {
  const { id: videoId } = video;

  // 3. Mark "downloading"
  await updateProgress(videoId, 5, "downloading", "جارٍ التنزيل...", {
    startedAt: new Date(),
    workerId: WORKER_ID,
    deepgramKey: WORKER_INDEX,
    error: null,
  });
  await log(`Worker ${WORKER_ID} starting transcription for video ${video.youtubeId}`, {
    level: "info",
    source: "transcription",
    workerId: WORKER_ID,
    videoId,
  });

  // 4. Load audio settings + cookies
  const audioSettings = await getAudioSettings();
  const cookies = await db.cookie.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  // 5. DOWNLOAD with cookie fallback
  let audioPath: string | null = null;
  let cookieUsedId: string | null = null;
  let lastErr: unknown = null;

  const tryDownload = async (cookiesPath?: string): Promise<string> => {
    const { promise } = downloadAudio(
      video.url,
      {
        bitrate: audioSettings.bitrate,
        channels: audioSettings.channels,
        cookiesPath,
        outputDir: AUDIO_DIR,
      },
      (p) => {
        const mapped = 5 + Math.floor((p.percent / 100) * 45);
        const statusText = `تنزيل ${Math.floor(p.percent)}%`;
        updateProgress(videoId, mapped, "downloading", statusText).catch(() => {});
      }
    );
    return promise;
  };

  // Fallback download with the most generic format string ("best")
  // Used when the default "bestaudio/best" fails with a format error.
  const tryDownloadWithFallback = async (cookiesPath?: string): Promise<string> => {
    const { promise } = downloadAudio(
      video.url,
      {
        bitrate: audioSettings.bitrate,
        channels: audioSettings.channels,
        cookiesPath,
        outputDir: AUDIO_DIR,
        format: "best",  // most generic — accepts any available format
      },
      (p) => {
        const mapped = 5 + Math.floor((p.percent / 100) * 45);
        const statusText = `تنزيل ${Math.floor(p.percent)}%`;
        updateProgress(videoId, mapped, "downloading", statusText).catch(() => {});
      }
    );
    return promise;
  };

  if (cookies.length === 0) {
    // No cookies configured — try once without
    logger.warn("No active cookies configured — downloading without cookies", {
      source: "transcription",
      workerId: WORKER_ID,
      videoId,
    });
    try {
      audioPath = await tryDownload();
    } catch (err) {
      lastErr = err;
      if (err instanceof YtDlpError && err.isVideoUnavailable()) {
        throw new Error(`Video unavailable: ${truncate(err.stderr, 200)}`);
      }
      if (err instanceof YtDlpError && err.isFormatError()) {
        // Format error — retry once with a broader format string
        logger.warn("Format error — retrying with fallback format", {
          source: "transcription",
          workerId: WORKER_ID,
          videoId,
        });
        try {
          audioPath = await tryDownloadWithFallback();
        } catch (err2) {
          lastErr = err2;
          if (err2 instanceof YtDlpError && err2.isVideoUnavailable()) {
            throw new Error(`Video unavailable: ${truncate(err2.stderr, 200)}`);
          }
        }
      }
    }
  } else {
    for (const cookie of cookies) {
      const cookiePath = path.join(os.tmpdir(), `cookie-${cookie.id}.txt`);
      try {
        await fs.writeFile(cookiePath, cookie.content, "utf-8");
      } catch (err) {
        logger.error(`Failed to write cookie file for ${cookie.filename}`, {
          source: "transcription",
          workerId: WORKER_ID,
          videoId,
          details: { err: (err as Error).message },
        });
        continue;
      }

      try {
        audioPath = await tryDownload(cookiePath);
        cookieUsedId = cookie.id;
        await db.cookie
          .update({
            where: { id: cookie.id },
            data: { lastUsedAt: new Date(), lastError: null },
          })
          .catch(() => {});
        break;
      } catch (err) {
        lastErr = err;
        if (err instanceof YtDlpError) {
          if (err.isVideoUnavailable()) {
            await db.cookie
              .update({
                where: { id: cookie.id },
                data: { lastError: "Video unavailable" },
              })
              .catch(() => {});
            throw new Error(`Video unavailable: ${truncate(err.stderr, 200)}`);
          }
          if (err.isCookieRelated()) {
            await db.cookie
              .update({
                where: { id: cookie.id },
                data: { lastError: truncate(err.stderr, 500) },
              })
              .catch(() => {});
            logger.warn(`Cookie ${cookie.filename} failed (cookie-related) — trying next`, {
              source: "transcription",
              workerId: WORKER_ID,
              videoId,
            });
            continue;
          }
          if (err.isFormatError()) {
            // Format error — retry with broader format string
            logger.warn(`Format error with ${cookie.filename} — retrying with fallback format`, {
              source: "transcription",
              workerId: WORKER_ID,
              videoId,
            });
            try {
              audioPath = await tryDownloadWithFallback(cookiePath);
              cookieUsedId = cookie.id;
              await db.cookie
                .update({
                  where: { id: cookie.id },
                  data: { lastUsedAt: new Date(), lastError: null },
                })
                .catch(() => {});
              break;
            } catch (err2) {
              lastErr = err2;
              if (err2 instanceof YtDlpError && err2.isVideoUnavailable()) {
                throw new Error(`Video unavailable: ${truncate(err2.stderr, 200)}`);
              }
              // If fallback also fails, try next cookie
              continue;
            }
          }
        }
        // Other error — try the next cookie as a best effort.
        logger.error(`Download error with cookie ${cookie.filename}`, {
          source: "transcription",
          workerId: WORKER_ID,
          videoId,
          details: { err: (err as Error).message },
        });
        continue;
      } finally {
        await fs.unlink(cookiePath).catch(() => {});
      }
    }

    if (!audioPath) {
      throw new Error(
        `All cookies failed — please update cookies in settings${
          lastErr ? `: ${truncate((lastErr as Error).message, 200)}` : ""
        }`
      );
    }
  }

  if (!audioPath) {
    throw new Error(
      `Audio download failed: ${lastErr ? truncate((lastErr as Error).message, 200) : "unknown error"}`
    );
  }

  // 6. Mark "uploading"
  await updateProgress(videoId, 55, "uploading", "جارٍ الرفع إلى Deepgram...", {
    audioPath,
    cookieUsed: cookieUsedId,
    audioBitrate: audioSettings.bitrate,
    audioChannels: audioSettings.channels,
  });

  // 7. Read audio file
  const audioBuffer = await fs.readFile(audioPath);

  // 8. TRANSCRIBE
  await updateProgress(videoId, 70, "transcribing", "جارٍ التفريغ...");

  const deepgramSettings = await getDeepgramSettings();
  const apiKey = process.env[`DEEPGRAM_API_KEY_${WORKER_INDEX}`];
  if (!apiKey) {
    throw new Error(`DEEPGRAM_API_KEY_${WORKER_INDEX} env var not set`);
  }

  let result;
  try {
    result = await transcribeWithDeepgram(audioBuffer, apiKey, {
      model: deepgramSettings.model,
      language: deepgramSettings.language,
    });
  } catch (err) {
    if (err instanceof DeepgramError) {
      if (err.isAuthError()) {
        throw new Error(
          `Deepgram auth error (key ${WORKER_INDEX}): ${err.reason}`
        );
      }
      if (err.isQuota()) {
        throw new Error(
          `Deepgram quota exhausted (key ${WORKER_INDEX}): ${err.reason}`
        );
      }
      // Rate limit (429) or other → throw for BullMQ retry with backoff.
      throw err;
    }
    throw err;
  }

  // 9. Mark "completed"
  await db.video.update({
    where: { id: videoId },
    data: {
      status: "completed",
      progress: 100,
      transcriptText: result.text,
      transcriptJson: JSON.stringify(result.raw),
      completedAt: new Date(),
      statusText: "اكتمل التفريغ",
    },
  });
  await emitProgress({
    type: "video",
    id: videoId,
    status: "completed",
    progress: 100,
    statusText: "اكتمل التفريغ",
  });
  await log(
    `Worker ${WORKER_ID} transcribed video ${video.youtubeId} (${result.text.length} chars)`,
    {
      level: "info",
      source: "transcription",
      workerId: WORKER_ID,
      videoId,
      details: { model: deepgramSettings.model, language: deepgramSettings.language },
    }
  );
}

/**
 * Error handler invoked whenever the pipeline throws.
 * Increments video.attempts; when attempts >= maxAttempts the video is
 * permanently marked "failed" and we return (so BullMQ sees the job as done).
 * Otherwise we re-throw so BullMQ retries with its exponential backoff.
 */
async function handleJobError(videoId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  try {
    const video = await db.video.findUnique({ where: { id: videoId } });
    if (!video) return;

    const attempts = (video.attempts || 0) + 1;
    const maxAttempts = Math.max(
      video.maxAttempts ||
        parseInt(await getSetting("max_retry_attempts"), 10) ||
        MAX_ATTEMPTS_FALLBACK,
      1
    );
    const isFinal = attempts >= maxAttempts;

    await db.video.update({
      where: { id: videoId },
      data: {
        attempts,
        status: isFinal ? "failed" : video.status,
        error: truncate(message, 500),
        statusText: isFinal ? "فشل التفريغ" : video.statusText,
      },
    });

    await emitProgress({
      type: "video",
      id: videoId,
      status: isFinal ? "failed" : video.status,
      progress: video.progress,
      error: truncate(message, 200),
    });

    await log(
      `Video ${video.youtubeId} ${isFinal ? "permanently failed" : "failed (will retry)"}`,
      {
        level: isFinal ? "error" : "warn",
        source: "transcription",
        workerId: WORKER_ID,
        videoId,
        details: { err: message, stack, attempts, maxAttempts },
      }
    );
  } catch (logErr) {
    console.error("[handle-job-error-failed]", logErr);
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `[transcribe] Starting ${WORKER_ID} (index ${WORKER_INDEX}, queue "${TRANSCRIPTION_QUEUE}")`
  );

  // Connect to Redis — required for BullMQ
  const redis = await getRedis();
  if (!redis) {
    console.error("[transcribe] Redis unavailable — exiting");
    process.exit(1);
  }

  // Ensure audio dir
  await fs.mkdir(AUDIO_DIR, { recursive: true }).catch(() => {});

  // Initial heartbeat + interval
  await heartbeat();
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

  // Start BullMQ worker
  worker = new Worker(TRANSCRIPTION_QUEUE, processJob, {
    connection: redis,
    concurrency: 1,
  });

  worker.on("active", async (job) => {
    try {
      await db.workerStatus.update({
        where: { workerId: WORKER_ID },
        data: {
          status: "active",
          currentJobId: job.id ?? null,
          currentVideoId: (job.data as TranscriptionJobData)?.videoId ?? null,
        },
      });
    } catch (err) {
      console.error("[active-status-update-failed]", err);
    }
  });

  worker.on("completed", async (job) => {
    try {
      await db.workerStatus.update({
        where: { workerId: WORKER_ID },
        data: { status: "idle", currentJobId: null, currentVideoId: null },
      });
    } catch (err) {
      console.error("[completed-status-update-failed]", err);
    }
    if (job) {
      logger.debug(`Job ${job.id} completed`, {
        source: "transcription",
        workerId: WORKER_ID,
        videoId: (job.data as TranscriptionJobData)?.videoId,
      });
    }
  });

  worker.on("failed", async (job, err) => {
    // The catch block inside processJob already marks the video as failed
    // when attempts >= maxAttempts. BullMQ's `failed` event fires when the
    // job exhausts BullMQ's own attempts. We just log + reset worker status.
    logger.error(`Job ${job?.id ?? "?"} failed in BullMQ: ${err.message}`, {
      source: "transcription",
      workerId: WORKER_ID,
      videoId: (job?.data as TranscriptionJobData)?.videoId,
      details: { stack: err.stack },
    });
    try {
      await db.workerStatus.update({
        where: { workerId: WORKER_ID },
        data: {
          status: "idle",
          currentJobId: null,
          currentVideoId: null,
          lastError: truncate(err.message, 500),
        },
      });
    } catch (e) {
      console.error("[failed-status-update-failed]", e);
    }
  });

  worker.on("error", (err) => {
    logger.error(`Worker ${WORKER_ID} runtime error: ${err.message}`, {
      source: "transcription",
      workerId: WORKER_ID,
      details: { stack: err.stack },
    });
  });

  logger.info(`Worker ${WORKER_ID} online`, {
    source: "worker",
    workerId: WORKER_ID,
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[transcribe] ${signal} received — shutting down ${WORKER_ID}`);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (worker) {
    try {
      await worker.close();
    } catch (err) {
      console.error("[shutdown] worker.close failed:", err);
    }
  }

  try {
    await db.workerStatus.update({
      where: { workerId: WORKER_ID },
      data: {
        status: "idle",
        currentJobId: null,
        currentVideoId: null,
      },
    });
  } catch (err) {
    console.error("[shutdown] status update failed:", err);
  }

  await db.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("[transcribe] Fatal:", err);
  process.exit(1);
});
