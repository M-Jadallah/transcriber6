// yt-dlp integration — downloads audio from YouTube as MP3
// Command for 64kbps mono MP3:
//   yt-dlp -f "ba" -x --audio-format mp3 \
//     --ppa "ExtractAudio+ffmpeg_o:-ac 1 -b:a 64k" \
//     -o "%(id)s.%(ext)s" "URL"
// The _o suffix on --ppa is CRITICAL (passes args to ffmpeg as OUTPUT args).

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";

export interface YtDlpAudioOptions {
  bitrate?: number; // kbps, default 64
  channels?: "mono" | "stereo"; // default mono
  cookiesPath?: string;
  outputDir: string;
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

// Cookie-related error signatures (stderr substring match)
const COOKIE_ERROR_SIGNATURES = [
  "sign in to confirm",
  "age restricted",
  "members-only",
  "members only",
  "private video",
  "this video is private",
  "cookies.txt does not look like a Netscape format",
  "login required",
  "sign in",
];

export function isCookieError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return COOKIE_ERROR_SIGNATURES.some((sig) => lower.includes(sig));
}

export function isVideoUnavailable(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("video unavailable") ||
    lower.includes("removed") ||
    lower.includes("does not exist") ||
    lower.includes("not available")
  );
}

// Download audio as MP3 with specified bitrate/channels. Returns output path.
export function downloadAudio(
  url: string,
  options: YtDlpAudioOptions,
  onProgress?: (p: YtDlpProgress) => void
): { process: ChildProcess; promise: Promise<string> } {
  const { bitrate = 64, channels = "mono", cookiesPath, outputDir } = options;
  const ac = channels === "mono" ? "1" : "2";
  const outTemplate = path.join(outputDir, "%(id)s.%(ext)s");

  const args = [
    "-f",
    "ba",
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
    "--progress-template",
    "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
  ];

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  // polite rate limiting
  args.push("--sleep-requests", "1", "--sleep-interval", "1", "--max-sleep-interval", "3");

  args.push(url);

  const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

  const promise = new Promise<string>((resolve, reject) => {
    let stderrBuf = "";
    let lastProgress = 0;

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
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
        // find the output file
        // Expected: <outputDir>/<youtubeId>.mp3 — we parse it from stderr "Destination:" line
        const destMatch = stderrBuf.match(/Destination:\s*(\S+\.mp3)/);
        const audioPath = destMatch ? destMatch[1] : "";
        if (audioPath) {
          resolve(audioPath);
        } else {
          // fallback: list mp3 files in outputDir
          fs.readdir(outputDir)
            .then((files) => {
              const mp3 = files.find((f) => f.endsWith(".mp3"));
              if (mp3) resolve(path.join(outputDir, mp3));
              else reject(new Error("Audio file not found after download. stderr: " + stderrBuf));
            })
            .catch(() => reject(new Error("Audio file not found. stderr: " + stderrBuf)));
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
}

// Fetch playlist metadata WITHOUT downloading
export async function fetchPlaylistInfo(
  playlistUrl: string,
  cookiesPath?: string
): Promise<{ title?: string; entries: PlaylistEntry[] }> {
  const args = ["--flat-playlist", "-J", "--skip-download"];
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

// Fetch single video metadata
export async function fetchVideoInfo(
  videoUrl: string,
  cookiesPath?: string
): Promise<{ id: string; title: string; duration?: number; thumbnail?: string; url: string }> {
  const args = ["-J", "--no-playlist", "--skip-download"];
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
