// Socket.io client for browser — environment-aware
// In sandbox dev: uses Caddy XTransformPort=3001 pattern
// In Coolify prod: uses NEXT_PUBLIC_REALTIME_URL (separate FQDN)

function getRealtimeUrl(): string {
  if (process.env.NEXT_PUBLIC_REALTIME_URL) {
    return process.env.NEXT_PUBLIC_REALTIME_URL;
  }
  // dev sandbox — same origin, Caddy routes via XTransformPort query
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export function getSocketPath(): string {
  // In sandbox dev, Caddy needs /?XTransformPort=3001
  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return "/";
  }
  return "/";
}

export function getSocketQuery(): Record<string, string> {
  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return { XTransformPort: "3001" };
  }
  return {};
}

export const REALTIME_URL = getRealtimeUrl();
export const SOCKET_PATH = getSocketPath();
export const SOCKET_QUERY = getSocketQuery();
