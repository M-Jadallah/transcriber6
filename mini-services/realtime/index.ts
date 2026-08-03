/**
 * mini-services/realtime/index.ts
 * ------------------------------
 * Realtime Socket.IO mini-service.
 *
 * - Listens on port 3001 (HARDCODED — per project rules: do NOT use the PORT env).
 * - Socket.IO path is "/" so the Caddy gateway can route browser connections
 *   through "/?XTransformPort=3001" (see Caddyfile in repo root).
 * - Internal HTTP endpoint POST /emit (protected by x-internal-secret header)
 *   lets backend workers broadcast progress events to all connected browsers.
 * - GET /health — basic liveness probe.
 *
 * Implementation note:
 *   Engine.IO's `attach()` wraps the http server's "request" handler with a
 *   wrapper that intercepts every request whose URL starts with the path. With
 *   path "/" that intercepts EVERY request, which would prevent the /emit and
 *   /health HTTP routes from running. We work around this by capturing
 *   engine.io's wrapper after `new Server(httpServer, …)`, removing it from
 *   the listener list, and replacing it with our own dispatcher that runs our
 *   HTTP routes first and falls through to engine.io for everything else
 *   (including the real socket.io polling/websocket handshakes).
 *
 * Browser clients connect with:
 *   io(ORIGIN, { path: "/", query: { XTransformPort: "3001" },
 *                transports: ["websocket","polling"] })
 * and listen for:
 *   - "video:progress"  { type:"video", id, status, progress, statusText?, error? }
 *   - "format:progress" { type:"format", id, status, progress, statusText?, error? }
 *
 * Backend workers (transcribe.ts / format.ts) call:
 *   fetch("http://localhost:3001/emit", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json", "x-internal-secret": <secret> },
 *     body: JSON.stringify({ type, id, status, progress, statusText?, error? })
 *   })
 * (see src/lib/realtime-emit.ts).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server, type Socket } from "socket.io";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = 3001; // hardcoded per project rules
const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN ||
  process.env.SERVICE_FQDN_APP ||
  "*";
const REALTIME_SECRET =
  process.env.REALTIME_SECRET ||
  process.env.SERVICE_PASSWORD_64_NEXTAUTH ||
  "dev-secret";

// ---------------------------------------------------------------------------
// HTTP server (created WITHOUT a handler — we'll attach our own after engine.io)
// ---------------------------------------------------------------------------

const httpServer = createServer();

// ---------------------------------------------------------------------------
// Socket.IO server
// ---------------------------------------------------------------------------

const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses "/" + XTransformPort query param
  // to route browser connections to this service.
  path: "/",
  cors: {
    origin: ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN.split(","),
    methods: ["GET", "POST"],
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  connectTimeout: 10_000,
});

// Engine.IO just installed its own "request" wrapper. Capture it, then
// replace it with our own dispatcher so we can handle /emit and /health
// before falling through to engine.io for actual socket.io traffic.
const engineRequestListener = httpServer.listeners("request")[0];
httpServer.removeAllListeners("request");

httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
  // CORS headers for all responses (browser clients may probe /health).
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-internal-secret"
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = (req.url || "").split("?")[0];

  // POST /emit — broadcast a progress event to all connected browsers.
  if (req.method === "POST" && pathname === "/emit") {
    handleEmit(req, res);
    return;
  }

  // GET /health — liveness probe.
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "realtime",
        port: PORT,
        clients: io.engine.clientsCount,
        uptime: process.uptime(),
      })
    );
    return;
  }

  // Everything else (including /?EIO=4&transport=...) → engine.io.
  if (engineRequestListener) {
    try {
      engineRequestListener.call(httpServer, req, res);
    } catch (err) {
      console.error("[realtime] engine.io listener threw:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal error" }));
      }
    }
    return;
  }

  // No engine.io listener (shouldn't happen) — 404.
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ---------------------------------------------------------------------------
// POST /emit handler
// ---------------------------------------------------------------------------

interface EmitEvent {
  type?: string;
  id?: string;
  status?: string;
  progress?: number;
  statusText?: string;
  error?: string;
}

async function handleEmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = req.headers["x-internal-secret"];
  if (secret !== REALTIME_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let body = "";
  try {
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        // 1MB hard limit — protect against abuse.
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
    }
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read body" }));
    return;
  }

  let event: EmitEvent;
  try {
    event = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  if (!event.type || !event.id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required fields: type, id" }));
    return;
  }

  const eventName =
    event.type === "format" ? "format:progress" : "video:progress";
  io.emit(eventName, event);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      broadcast: eventName,
      clients: io.engine.clientsCount,
    })
  );
}

// ---------------------------------------------------------------------------
// Socket.IO connection logging
// ---------------------------------------------------------------------------

io.on("connection", (socket: Socket) => {
  const count = io.engine.clientsCount;
  console.log(
    `[realtime] Client connected: ${socket.id} (total=${count}) origin=${socket.handshake.headers.origin || "?"}`
  );

  // Greet the new client so they know the connection is healthy.
  socket.emit("hello", {
    service: "realtime",
    timestamp: new Date().toISOString(),
    clients: count,
  });

  socket.on("disconnect", (reason) => {
    console.log(`[realtime] Client disconnected: ${socket.id} (${reason})`);
  });

  socket.on("error", (err) => {
    console.error(`[realtime] Socket error (${socket.id}):`, err);
  });
});

io.engine.on("connection_error", (err: unknown) => {
  // These are usually non-socket.io requests that hit the engine.io
  // listener (e.g. browser dev tools probing "/"). Log at debug level.
  if (process.env.DEBUG_REALTIME) {
    console.error("[realtime] engine.io connection_error:", err);
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(
    `[realtime] Service listening on port ${PORT} (CORS origin: ${ALLOWED_ORIGIN})`
  );
  console.log(
    `[realtime] Socket.IO path: "/?EIO=4&transport=...  (browser connects via "/?XTransformPort=${PORT}")`
  );
  console.log(
    `[realtime] Internal emit endpoint: POST /emit  (requires x-internal-secret header)`
  );
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[realtime] ${signal} received — shutting down`);

  // Tell all connected clients we're going away.
  try {
    io.emit("server:shutdown", {
      reason: signal,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore
  }

  // Force-close socket.io after 2s if it doesn't drain on its own.
  const forceTimer = setTimeout(() => {
    io.close();
  }, 2000);

  try {
    await io.close();
  } catch {
    // ignore
  }
  clearTimeout(forceTimer);

  httpServer.close(() => {
    console.log("[realtime] HTTP server closed");
    process.exit(0);
  });

  // Hard exit if something hangs.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[realtime] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[realtime] Unhandled rejection:", reason);
});
