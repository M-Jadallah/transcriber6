// Logging helper — writes to DB (LogEntry) for the Logs page
import { db } from "./db";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogSource =
  | "system"
  | "transcription"
  | "formatting"
  | "auth"
  | "api"
  | "worker"
  | "opencode"
  | "yt-dlp"
  | "deepgram";

export interface LogOptions {
  level?: LogLevel;
  source?: LogSource;
  videoId?: string;
  jobId?: string;
  workerId?: string;
  details?: unknown;
}

export async function log(message: string, options: LogOptions = {}): Promise<void> {
  const { level = "info", source = "system", videoId, jobId, workerId, details } = options;
  try {
    await db.logEntry.create({
      data: {
        level,
        source,
        message,
        videoId: videoId ?? null,
        jobId: jobId ?? null,
        workerId: workerId ?? null,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (err) {
    // logging must never throw
    console.error("[log-failed]", err, message);
  }
}

export const logger = {
  info: (msg: string, opts: LogOptions = {}) => log(msg, { ...opts, level: "info" }),
  warn: (msg: string, opts: LogOptions = {}) => log(msg, { ...opts, level: "warn" }),
  error: (msg: string, opts: LogOptions = {}) => log(msg, { ...opts, level: "error" }),
  debug: (msg: string, opts: LogOptions = {}) => log(msg, { ...opts, level: "debug" }),
};
