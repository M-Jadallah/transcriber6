// Emit progress events to the realtime service (Socket.io) via HTTP
// The realtime mini-service exposes an internal HTTP endpoint to broadcast events.
// In dev sandbox: http://localhost:3001 (via direct fetch, since both run locally)
// In Coolify prod: http://realtime:3001 (Docker DNS) — internal network

const REALTIME_INTERNAL_URL =
  process.env.REALTIME_INTERNAL_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://realtime:3001"
    : "http://localhost:3001");

const REALTIME_SECRET =
  process.env.REALTIME_SECRET || process.env.SERVICE_PASSWORD_64_NEXTAUTH || "dev-secret";

export interface ProgressEvent {
  type: "video" | "format";
  id: string;
  status: string;
  progress: number;
  statusText?: string;
  error?: string;
}

export async function emitProgress(event: ProgressEvent): Promise<void> {
  try {
    await fetch(`${REALTIME_INTERNAL_URL}/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": REALTIME_SECRET,
      },
      body: JSON.stringify(event),
      // short timeout so it never blocks the main flow
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // realtime service might be down — non-critical
  }
}
