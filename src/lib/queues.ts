import { Queue, Worker, QueueEvents } from "bullmq";
import { getRedis } from "./redis";

export const TRANSCRIPTION_QUEUE = "transcription";
export const FORMATTING_QUEUE = "formatting";

let _transcriptionQueue: Queue | null = null;
let _formattingQueue: Queue | null = null;
let _transcriptionEvents: QueueEvents | null = null;
let _formattingEvents: QueueEvents | null = null;

async function getConnection() {
  const redis = await getRedis();
  if (!redis) return null;
  // BullMQ needs a raw ioredis-compatible connection; our redis client works.
  return { connection: redis };
}

export async function getTranscriptionQueue(): Promise<Queue | null> {
  if (_transcriptionQueue) return _transcriptionQueue;
  const conn = await getConnection();
  if (!conn) return null;
  _transcriptionQueue = new Queue(TRANSCRIPTION_QUEUE, {
    connection: conn.connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return _transcriptionQueue;
}

export async function getFormattingQueue(): Promise<Queue | null> {
  if (_formattingQueue) return _formattingQueue;
  const conn = await getConnection();
  if (!conn) return null;
  _formattingQueue = new Queue(FORMATTING_QUEUE, {
    connection: conn.connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return _formattingQueue;
}

export async function getTranscriptionEvents(): Promise<QueueEvents | null> {
  if (_transcriptionEvents) return _transcriptionEvents;
  const conn = await getConnection();
  if (!conn) return null;
  _transcriptionEvents = new QueueEvents(TRANSCRIPTION_QUEUE, { connection: conn.connection });
  return _transcriptionEvents;
}

export async function getFormattingEvents(): Promise<QueueEvents | null> {
  if (_formattingEvents) return _formattingEvents;
  const conn = await getConnection();
  if (!conn) return null;
  _formattingEvents = new QueueEvents(FORMATTING_QUEUE, { connection: conn.connection });
  return _formattingEvents;
}

// Add a transcription job (graceful if redis unavailable — DB record still created by caller)
export async function enqueueTranscription(videoId: string, workerIndex?: number): Promise<boolean> {
  const q = await getTranscriptionQueue();
  if (!q) return false;
  try {
    await q.add("transcribe", { videoId, workerIndex }, { jobId: `video-${videoId}` });
    return true;
  } catch {
    return false;
  }
}

export async function enqueueFormatting(jobId: string): Promise<boolean> {
  const q = await getFormattingQueue();
  if (!q) return false;
  try {
    await q.add("format", { jobId }, { jobId: `format-${jobId}` });
    return true;
  } catch {
    return false;
  }
}

// List jobs for UI (graceful fallback returns empty)
export async function listQueueJobs(
  queueName: "transcription" | "formatting"
): Promise<{ id: string; state: string; progress: number; data: unknown }[]> {
  const q = queueName === "transcription" ? await getTranscriptionQueue() : await getFormattingQueue();
  if (!q) return [];
  try {
    const jobs = await q.getJobs(["waiting", "active", "delayed", "completed", "failed"], 0, 200);
    return jobs.map((j) => ({
      id: j.id ?? "",
      state: "unknown",
      progress: typeof j.progress === "number" ? j.progress : 0,
      data: j.data,
    }));
  } catch {
    return [];
  }
}
