// yt-dlp integration — downloads audio from YouTube as MP3
// Optimized for PUBLIC videos (no cookies needed when Deno JS runtime is available).
// Cookies are OPTIONAL — only for age-restricted / member-only / private videos.
//
// Key optimizations:
//   - player_client=web,android (web first with JS challenge via Deno, android fallback)
//   - --retries 10 + --fragment-retries 10 (automatic yt-dlp internal retries)
//   - --print for reliable output path detection (no stderr parsing)
//   - Format fallback chain: bestaudio/best → best
//   - Player client fallback: web,android → android → web

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";

export interface YtDlpAudioOptions {
  bitrate?: number; // kbps, default 64
  channels?: "mono" | "stereo"; // default mono
  cookiesPath?: string;
  outputDir: string;
  format?: string; // yt-dlp format string, default "bestaudio/best"
  playerClient?: string; // youtube player_client, default "web,android"
}

export interface YtDlpProgress {
  percent: number;
  speed?: string;
  eta?: string;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration?: number;
  thumbnail?: string;
}

// ─── Error classification ────────────────────────────────────────────────────
// IMPORTANT: Be specific — "sign in" alone is too generic and catches
// YouTube's IP-based rate limiting ("Sign in to confirm you're not a bot")
// which is NOT a cookie problem (cookies won't help; IP rotation will).
const COOKIE_ERROR_SIGNATURES = [
  "sign in to confirm your age",
  "age restricted",
  "members-only",
  "members only",
  "this video is private",
  "private video",
  "cookies.txt does not look like a netscape format",
  "login required to view this video",
  "this video requires age verification",
];

export function isCookieError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return COOKIE_ERROR_SIGNATURES.some((sig) => lower.includes(sig));
}

// IP-based rate limiting — NOT a cookie problem. Cookies won't help.
// The only fix is to wait or use a different IP (proxy/VPN).
export function isRateLimitError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("sign in to confirm you") ||
    lower.includes("you are being rate limited") ||
    lower.includes("too many requests") ||
    lower.includes("http error 429")
  );
}

export function isVideoUnavailable(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  // IMPORTANT: "Requested format is not available" is a FORMAT error, NOT a
  // video unavailable error. The video IS available, just the requested format
  // isn't. So we check for specific video-unavailable signatures only.
  return (
    lower.includes("video unavailable") ||
    lower.includes("video has been removed") ||
    lower.includes("does not exist") ||
    lower.includes("private video") ||
    lower.includes("members-only") ||
    lower.includes("this video is not available") ||
    lower.includes("account associated with this video has been terminated")
  );
}

// Format-specific errors — the video IS available, but the requested format
// isn't. Retrying with a broader format string (e.g. "bestaudio/best") will
// usually succeed.
export function isFormatError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("requested format is not available") ||
    lower.includes("no video formats found") ||
    lower.includes("format not available")
  );
}

// Network/transient errors — retryable
export function isNetworkError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("connection reset") ||
    lower.includes("connection refused") ||
    lower.includes("timed out") ||
    lower.includes("network is unreachable") ||
    lower.includes("ssl: certificate_verification") ||
    lower.includes("unable to download")
  );
}

// ─── Download audio as MP3 ───────────────────────────────────────────────────
export function downloadAudio(
  url: string,
  options: YtDlpAudioOptions,
  onProgress?: (p: YtDlpProgress) => void
): { process: ChildProcess; promise: Promise<string> } {
  const {
    bitrate = 64,
    channels = "mono",
    cookiesPath,
    outputDir,
    format = "bestaudio/best",
    playerClient = "web,android",
  } = options;
  const ac = channels === "mono" ? "1" : "2";
  const outTemplate = path.join(outputDir, "%(id)s.%(ext)s");

  const args = [
    "-f",
    format,
    "-x",
    "--audio-format",
    "mp3",
    "--ppa",
    `ExtractAudio+ffmpeg_o:-ac ${ac} -b:a ${bitrate}k`,
    "-o",
    outTemplate,
    "--no-playlist",
    "--no-warnings",
    "--newline",
    // ── Reliability flags ──
    "--retries",
    "10", // retry download fragments up to 10 times
    "--fragment-retries",
    "10", // retry each fragment 10 times
    "--retry-sleep",
    "5", // 5s between retries
    // ── Progress reporting ──
    "--progress-template",
    "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
    // ── Output file path (reliable — no stderr parsing needed) ──
    "--print",
    "after_move:%(filepath)s",
    // ── Player client: web first (with JS challenge via Deno), android fallback ──
    // This allows downloading most public videos WITHOUT cookies.
    "--extractor-args",
    `youtube:player_client=${playerClient}`,
  ];

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  // Polite rate limiting (avoids YouTube IP bans)
  args.push("--sleep-requests", "1", "--sleep-interval", "1", "--max-sleep-interval", "3");

  args.push(url);

  const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

  const promise = new Promise<string>((resolve, reject) => {
    let stderrBuf = "";
    let stdoutBuf = "";
    let lastProgress = 0;

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuf += text;
      for (const line of text.split("\n")) {
        if (line.startsWith("download:")) {
          const rest = line.slice("download:".length).trim();
          const [pct, speed, eta] = rest.split("|");
          const percentStr = (pct || "").trim().replace("%", "").trim();
          const percent = parseFloat(percentStr) || lastProgress;
          lastProgress = percent;
          onProgress?.({ percent, speed: (speed || "").trim(), eta: (eta || "").trim() });
        } else if (line.startsWith("[ExtractAudio]") || line.includes("Destination:")) {
          onProgress?.({ percent: 100 });
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Try to extract output path from --print output (most reliable)
        const printLine = stdoutBuf
          .split("\n")
          .find((l) => l.trim() && !l.startsWith("download:") && !l.startsWith("[") && path.isAbsolute(l.trim()));

        if (printLine) {
          const audioPath = printLine.trim();
          // Verify file exists
          fs.access(audioPath)
            .then(() => resolve(audioPath))
            .catch(() => findAudioFile(outputDir, stderrBuf, resolve, reject));
        } else {
          findAudioFile(outputDir, stderrBuf, resolve, reject);
        }
      } else {
        reject(new YtDlpError(stderrBuf, code ?? 1));
      }
    });

    proc.on("error", (err) => {
      reject(new YtDlpError(err.message + "\n" + stderrBuf, -1));
    });
  });

  return { process: proc, promise };
}

// Helper: find the audio file in outputDir (fallback when --print fails)
function findAudioFile(
  outputDir: string,
  stderrBuf: string,
  resolve: (path: string) => void,
  reject: (err: Error) => void
) {
  // Try parsing "Destination:" from stderr
  const destMatch = stderrBuf.match(/Destination:\s*(\S+\.mp3)/);
  if (destMatch) {
    resolve(destMatch[1]);
    return;
  }
  // Fallback: list mp3 files in outputDir
  fs.readdir(outputDir)
    .then((files) => {
      const mp3 = files.find((f) => f.endsWith(".mp3"));
      if (mp3) resolve(path.join(outputDir, mp3));
      else reject(new Error("Audio file not found after download. stderr: " + stderrBuf));
    })
    .catch(() => reject(new Error("Audio file not found. stderr: " + stderrBuf)));
}

export class YtDlpError extends Error {
  stderr: string;
  exitCode: number;
  constructor(stderr: string, exitCode: number) {
    super(`yt-dlp exited with code ${exitCode}`);
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.name = "YtDlpError";
  }
  isCookieRelated() {
    return isCookieError(this.stderr);
  }
  isVideoUnavailable() {
    return isVideoUnavailable(this.stderr);
  }
  isFormatError() {
    return isFormatError(this.stderr);
  }
  isRateLimit() {
    return isRateLimitError(this.stderr);
  }
  isNetworkError() {
    return isNetworkError(this.stderr);
  }
}

// ─── Fetch playlist metadata WITHOUT downloading ────────────────────────────
export async function fetchPlaylistInfo(
  playlistUrl: string,
  cookiesPath?: string
): Promise<{ title?: string; entries: PlaylistEntry[] }> {
  const args = [
    "--flat-playlist",
    "-J",
    "--skip-download",
    // Use web client (with JS challenge support via Deno) for public playlists
    "--extractor-args",
    "youtube:player_client=web,android",
    "--retries",
    "5",
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);
  args.push(playlistUrl);

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr?.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new YtDlpError(stderr, code ?? 1));
        return;
      }
      try {
        const json = JSON.parse(stdout);
        const entries: PlaylistEntry[] = (json.entries || [])
          .filter((e: any) => e && (e.id || e.url))
          .map((e: any) => ({
            id: e.id,
            title: e.title || e.id,
            url: e.url
              ? e.url.startsWith("http")
                ? e.url
                : `https://www.youtube.com/watch?v=${e.id}`
              : `https://www.youtube.com/watch?v=${e.id}`,
            duration: e.duration,
            thumbnail: e.thumbnails?.[0]?.url,
          }));
        resolve({ title: json.title, entries });
      } catch (err: any) {
        reject(new Error("Failed to parse playlist JSON: " + err.message));
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

// ─── Fetch single video metadata ─────────────────────────────────────────────
export async function fetchVideoInfo(
  videoUrl: string,
  cookiesPath?: string
): Promise<{ id: string; title: string; duration?: number; thumbnail?: string; url: string }> {
  const args = [
    "-J",
    "--no-playlist",
    "--skip-download",
    // Use web client (with JS challenge support via Deno) for public videos
    "--extractor-args",
    "youtube:player_client=web,android",
    "--retries",
    "5",
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);
  args.push(videoUrl);

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr?.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new YtDlpError(stderr, code ?? 1));
        return;
      }
      try {
        const json = JSON.parse(stdout);
        resolve({
          id: json.id,
          title: json.title || json.id,
          duration: json.duration,
          thumbnail: json.thumbnail,
          url: videoUrl,
        });
      } catch (err: any) {
        reject(new Error("Failed to parse video JSON: " + err.message));
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

// Detect if a URL is a playlist
export function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/.test(url) || /\/playlist\?/.test(url);
}
