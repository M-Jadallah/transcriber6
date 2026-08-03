/**
 * workers/format.ts
 * -----------------
 * OpenCode formatting worker.
 *
 * Runs as a standalone Node/Bun process (NOT inside Next.js):
 *   bun workers/format.ts
 *
 * Pipeline (per BullMQ job on the "formatting" queue):
 *   1. Load FormatJob (with video + skill). Skip if not found / already completed.
 *   2. Honor WorkerStatus.enabled — if disabled, re-delay the job 30s.
 *   3. Mark "processing" (progress 5) + emitProgress + log.
 *   4. CLONE / UPDATE SKILL:
 *        - If skill.localPath is null OR skill.clonedAt is null:
 *          git clone --depth 1 --branch <branch> <gitRepo> <SKILLS_DIR>/<skill.id>
 *          (falls back to clone without --branch if the branch doesn't exist).
 *          Update skill.localPath + skill.clonedAt.
 *        - Else: git -C <path> pull --ff-only (best-effort update).
 *        - On clone failure: fail the job with "Failed to clone skill repo".
 *   5. Write video.transcriptText to <workingDir>/input.txt.
 *   6. Build model string: `${modelProvider}/${modelName}`.
 *   7. Read SKILL.md (or AGENTS.md / skill.md / README.md fallback) from the
 *      cloned skill path — this is the formatting instruction set.
 *   8. Create working dir <JOBS_DIR>/<jobId>/ + write input.txt there.
 *      Output path = <workingDir>/output.docx.
 *   9. INVOKE OPENCODE as a subprocess:
 *        opencode run --auto --model <provider/model> --cwd <workingDir> "<prompt>"
 *      The prompt embeds the skill contents + instructs opencode to read
 *      input.txt, apply the skill, and write output.docx.
 *      Provider API keys are injected via env vars:
 *        - openrouter → OPENROUTER_API_KEY (from DB AIProvider)
 *        - openai     → OPENAI_API_KEY
 *        - deepseek   → DEEPSEEK_API_KEY
 *        - codex      → no key (uses auth.json)
 *      Progress (30-80) emitted periodically while opencode runs.
 *      On ENOENT (opencode not installed): fail gracefully with
 *      "OpenCode not installed in this environment".
 *  10. Verify output.docx exists → mark "completed" (progress 100) + outputPath.
 *
 * On any uncaught error: increment FormatJob.attempts. If attempts >= 2 →
 *   status "failed", error = message. Else → throw (BullMQ retries).
 *
 * Heartbeat (every 15s): upsert WorkerStatus { lastHeartbeat, status }.
 * Graceful shutdown on SIGTERM/SIGINT.
 *
 * Env:
 *   WORKER_ID            — default "opencode-1" (or "opencode-2")
 *   SKILLS_DIR           — shared volume mount point for cloned skills
 *                          (default <cwd>/data/skills)
 *   JOBS_DIR             — working dirs for opencode runs
 *                          (default <cwd>/data/jobs)
 *   OPENCODE_AUTH_JSON   — multiline string written to
 *                          ~/.local/share/opencode/auth.json on startup.
 *                          (Alternative: DB Setting key "opencode_auth_json".)
 */

import { Worker, type Job } from "bullmq";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { spawn, execFile, type ChildProcess } from "child_process";
import { promisify } from "util";

import { db } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { FORMATTING_QUEUE } from "../src/lib/queues";
import { log, logger } from "../src/lib/logs";
import { getSetting } from "../src/lib/settings";
import { emitProgress } from "../src/lib/realtime-emit";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_ID = process.env.WORKER_ID || "opencode-1";
const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.cwd(), "data", "skills");
const JOBS_DIR = process.env.JOBS_DIR || path.join(process.cwd(), "data", "jobs");
const HEARTBEAT_MS = 15_000;
const DISABLED_RETRY_MS = 30_000;
const MAX_ATTEMPTS = 2;
const OPENCODE_AUTH_PATH = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
  "auth.json"
);

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
        type: "format",
        status: "idle",
        enabled: true,
        lastHeartbeat: new Date(),
      },
      update: {
        lastHeartbeat: new Date(),
        type: "format",
      },
    });

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

function truncate(s: string, n: number): string {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function updateProgress(
  jobId: string,
  progress: number,
  status: string,
  statusText: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.formatJob.update({
      where: { id: jobId },
      data: { progress, status, statusText, ...extra },
    });
  } catch (err) {
    console.error("[update-progress-failed]", err);
  }
  await emitProgress({ type: "format", id: jobId, status, progress, statusText });
}

/**
 * Write OpenCode's auth.json (~/.local/share/opencode/auth.json) from either
 * the OPENCODE_AUTH_JSON env var or the DB Setting "opencode_auth_json".
 * Required for the "codex" provider; harmless for others.
 */
async function writeOpenCodeAuth(): Promise<void> {
  const fromEnv = process.env.OPENCODE_AUTH_JSON;
  const fromDb = fromEnv ? null : await getSetting("opencode_auth_json").catch(() => "");
  const content = fromEnv || fromDb;
  if (!content) {
    logger.warn(
      `No OPENCODE_AUTH_JSON configured — codex provider will not work`,
      { source: "opencode", workerId: WORKER_ID }
    );
    return;
  }
  try {
    await fs.mkdir(path.dirname(OPENCODE_AUTH_PATH), { recursive: true });
    await fs.writeFile(OPENCODE_AUTH_PATH, content, "utf-8");
    logger.info(`Wrote OpenCode auth.json to ${OPENCODE_AUTH_PATH}`, {
      source: "opencode",
      workerId: WORKER_ID,
    });
  } catch (err) {
    logger.error(`Failed to write OpenCode auth.json: ${(err as Error).message}`, {
      source: "opencode",
      workerId: WORKER_ID,
    });
  }
}

/**
 * Clone (or update) the skill's git repo into SKILLS_DIR/<skill.id>.
 * Returns the local filesystem path of the cloned skill.
 */
async function cloneOrUpdateSkill(skill: {
  id: string;
  name: string;
  gitRepo: string;
  branch: string;
  localPath: string | null;
  clonedAt: Date | null;
}): Promise<string> {
  const skillPath = skill.localPath || path.join(SKILLS_DIR, skill.id);
  await fs.mkdir(SKILLS_DIR, { recursive: true });

  const exists = await fs.stat(skillPath).then(() => true).catch(() => false);

  if (!exists || !skill.clonedAt) {
    // Fresh clone (or re-clone after the admin clicked "re-clone").
    if (exists) {
      await fs.rm(skillPath, { recursive: true, force: true }).catch(() => {});
    }
    try {
      await execFileAsync("git", [
        "clone",
        "--depth",
        "1",
        "--branch",
        skill.branch,
        skill.gitRepo,
        skillPath,
      ]);
    } catch {
      // The branch may not exist on a fresh repo — retry without --branch.
      try {
        await execFileAsync("git", [
          "clone",
          "--depth",
          "1",
          skill.gitRepo,
          skillPath,
        ]);
      } catch (err2) {
        const e = err2 as Error & { stderr?: string };
        throw new Error(`git clone failed: ${truncate(e.stderr || e.message, 300)}`);
      }
    }
    await db.skill.update({
      where: { id: skill.id },
      data: { localPath: skillPath, clonedAt: new Date() },
    });
    logger.info(`Cloned skill "${skill.name}" → ${skillPath}`, {
      source: "opencode",
      workerId: WORKER_ID,
    });
  } else {
    // Best-effort pull.
    try {
      await execFileAsync("git", ["-C", skillPath, "pull", "--ff-only"]);
      logger.info(`Pulled skill "${skill.name}"`, {
        source: "opencode",
        workerId: WORKER_ID,
      });
    } catch (err) {
      logger.warn(
        `Failed to git pull skill "${skill.name}" — using existing: ${(err as Error).message}`,
        { source: "opencode", workerId: WORKER_ID }
      );
    }
  }

  return skillPath;
}

/**
 * Look up the AIProvider row for the given provider and return the env vars
 * to inject into the opencode subprocess.
 */
async function getProviderEnv(provider: string): Promise<Record<string, string>> {
  if (provider === "codex") return {}; // uses auth.json
  const map: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };
  const envVar = map[provider];
  if (!envVar) {
    throw new Error(`Unknown model provider: ${provider}`);
  }
  const row = await db.aIProvider.findUnique({ where: { provider } });
  if (!row || !row.isActive || !row.apiKey) {
    throw new Error(
      `Provider "${provider}" is not configured or is inactive — set its API key in Settings.`
    );
  }
  return { [envVar]: row.apiKey };
}

/**
 * Read the skill's instruction file (SKILL.md, AGENTS.md, skill.md,
 * agents.md, or README.md) — whichever exists first.
 */
async function readSkillInstructions(skillPath: string): Promise<string> {
  const candidates = [
    "SKILL.md",
    "AGENTS.md",
    "skill.md",
    "agents.md",
    "README.md",
  ];
  for (const f of candidates) {
    const p = path.join(skillPath, f);
    const content = await fs.readFile(p, "utf-8").catch(() => null);
    if (content && content.trim().length > 0) return content;
  }
  throw new Error(
    `No SKILL.md / AGENTS.md / README.md found in skill repo at ${skillPath}`
  );
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

interface FormattingJobData {
  jobId: string;
}

async function processJob(
  job: Job<FormattingJobData>,
  token?: string
): Promise<void> {
  const { jobId } = job.data;

  // 1. Load FormatJob (with video). Skill is loaded separately because
  //    FormatJob only stores skillId + skillName snapshot (no relation).
  const formatJob = await db.formatJob.findUnique({
    where: { id: jobId },
    include: { video: true },
  });
  if (!formatJob) {
    logger.warn(`FormatJob ${jobId} not found — skipping`, {
      source: "formatting",
      workerId: WORKER_ID,
      jobId,
    });
    return;
  }
  if (formatJob.status === "completed") {
    logger.info(`FormatJob ${jobId} already completed — skipping`, {
      source: "formatting",
      workerId: WORKER_ID,
      jobId,
    });
    return;
  }

  const skill = await db.skill.findUnique({ where: { id: formatJob.skillId } });
  if (!skill) {
    await handleJobError(jobId, new Error(`Skill ${formatJob.skillId} not found in DB`));
    return;
  }

  // 2. Defensive enabled check
  const ws = await db.workerStatus.findUnique({ where: { workerId: WORKER_ID } });
  if (ws && !ws.enabled) {
    logger.warn(`Worker ${WORKER_ID} disabled — re-delaying job ${job.id}`, {
      source: "formatting",
      workerId: WORKER_ID,
      jobId,
    });
    try {
      await job.moveToDelayed(Date.now() + DISABLED_RETRY_MS, token);
      return;
    } catch {
      throw new Error(`Worker ${WORKER_ID} disabled — will retry`);
    }
  }

  try {
    await runFormattingPipeline({ ...formatJob, skill });
  } catch (err) {
    await handleJobError(jobId, err);
    throw err;
  }
}

/**
 * The actual formatting pipeline (steps 3–10 in the docstring above).
 */
async function runFormattingPipeline(formatJob: {
  id: string;
  modelProvider: string;
  modelName: string;
  video: { transcriptText: string | null; title: string; youtubeId: string };
  skill: {
    id: string;
    name: string;
    gitRepo: string;
    branch: string;
    localPath: string | null;
    clonedAt: Date | null;
    isActive: boolean;
  };
}): Promise<void> {
  const { id: jobId, modelProvider, modelName, video, skill } = formatJob;

  if (!skill.isActive) {
    throw new Error(`Skill "${skill.name}" is inactive — re-enable it or pick another skill.`);
  }
  if (!video.transcriptText) {
    throw new Error("Video has no transcript text — transcribe it first.");
  }

  // 3. Mark "processing"
  await updateProgress(jobId, 5, "processing", "بدء التنسيق...", {
    startedAt: new Date(),
    workerId: WORKER_ID,
    error: null,
  });
  await log(`Worker ${WORKER_ID} starting formatting for job ${jobId}`, {
    level: "info",
    source: "formatting",
    workerId: WORKER_ID,
    jobId,
  });

  // 4. Clone / update skill
  let skillPath: string;
  try {
    skillPath = await cloneOrUpdateSkill(skill);
  } catch (err) {
    throw new Error(`Failed to clone skill repo: ${(err as Error).message}`);
  }

  // 5. Write transcript to input.txt in the working dir
  const workingDir = path.join(JOBS_DIR, jobId);
  await fs.mkdir(workingDir, { recursive: true });
  const inputPath = path.join(workingDir, "input.txt");
  const outputPath = path.join(workingDir, "output.docx");
  await fs.writeFile(inputPath, video.transcriptText, "utf-8");
  await db.formatJob.update({ where: { id: jobId }, data: { inputPath } });

  // 6. Model string
  const modelStr = `${modelProvider}/${modelName}`;

  // 7. Read skill instructions
  const skillInstructions = await readSkillInstructions(skillPath);

  // 8. Build prompt (embeds the skill content directly so opencode doesn't
  //    need to discover the skill file itself).
  const prompt = [
    "You are applying a formatting skill to a transcript file.",
    "",
    `Read the file at: ${inputPath}`,
    "This file contains the raw transcript (Arabic, possibly with speaker turns).",
    "",
    "Apply the formatting skill defined below to the transcript.",
    "The skill is a set of instructions for how to structure, format, and present the transcript.",
    "",
    "=== SKILL DEFINITION START ===",
    skillInstructions,
    "=== SKILL DEFINITION END ===",
    "",
    `Write the formatted result as a Word document (.docx) to: ${outputPath}`,
    "",
    "Important constraints:",
    "- The transcript text is in Arabic — preserve RTL formatting in the output.",
    "- The output MUST be a valid .docx file at exactly the path above.",
    "- Do NOT modify the input.txt file.",
    "- After writing output.docx, your task is complete — you may stop.",
  ].join("\n");

  // 9. Invoke OpenCode
  await updateProgress(jobId, 20, "processing", "بدء OpenCode...");

  const providerEnv = await getProviderEnv(modelProvider);

  let currentProgress = 25;
  const progressTimer = setInterval(async () => {
    currentProgress = Math.min(currentProgress + 3, 80);
    try {
      await db.formatJob.update({
        where: { id: jobId },
        data: { progress: currentProgress, statusText: "OpenCode يعمل..." },
      });
      await emitProgress({
        type: "format",
        id: jobId,
        status: "processing",
        progress: currentProgress,
        statusText: "OpenCode يعمل...",
      });
    } catch {
      // ignore
    }
  }, 4000);

  let stdoutBuf = "";
  let stderrBuf = "";

  try {
    const proc: ChildProcess = spawn(
      "opencode",
      ["run", "--auto", "--model", modelStr, "--cwd", workingDir, prompt],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...providerEnv },
      }
    );

    proc.stdout?.on("data", (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderrBuf += c.toString();
    });

    const result = await new Promise<{ exitCode: number | null; err: Error | null }>(
      (resolve) => {
        let settled = false;
        proc.on("close", (code) => {
          if (settled) return;
          settled = true;
          resolve({ exitCode: code, err: null });
        });
        proc.on("error", (err) => {
          if (settled) return;
          settled = true;
          resolve({ exitCode: null, err });
        });
      }
    );

    if (result.err) {
      const code = (result.err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error("OpenCode not installed in this environment");
      }
      throw new Error(`Failed to spawn opencode: ${result.err.message}`);
    }
    if (result.exitCode !== 0) {
      const tail = (stderrBuf || stdoutBuf).trim();
      throw new Error(
        `OpenCode failed (exit ${result.exitCode})${tail ? `: ${truncate(tail, 500)}` : ""}`
      );
    }
  } finally {
    clearInterval(progressTimer);
  }

  // 10. Verify output + mark completed
  const outputExists = await fs
    .stat(outputPath)
    .then(() => true)
    .catch(() => false);
  if (!outputExists) {
    throw new Error(
      "OpenCode reported success but output.docx was not created — check the skill instructions."
    );
  }

  await db.formatJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      outputPath,
      completedAt: new Date(),
      statusText: "اكتمل التنسيق",
    },
  });
  await emitProgress({
    type: "format",
    id: jobId,
    status: "completed",
    progress: 100,
    statusText: "اكتمل التنسيق",
  });
  await log(`FormatJob ${jobId} completed by ${WORKER_ID}`, {
    level: "info",
    source: "formatting",
    workerId: WORKER_ID,
    jobId,
    details: { provider: modelProvider, model: modelName, skill: skill.name },
  });
}

/**
 * Error handler — increments attempts and marks the job as failed once
 * attempts >= MAX_ATTEMPTS. Otherwise re-throws for BullMQ retry.
 */
async function handleJobError(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  try {
    const formatJob = await db.formatJob.findUnique({ where: { id: jobId } });
    if (!formatJob) return;

    const attempts = (formatJob.attempts || 0) + 1;
    const isFinal = attempts >= MAX_ATTEMPTS;

    await db.formatJob.update({
      where: { id: jobId },
      data: {
        attempts,
        status: isFinal ? "failed" : formatJob.status,
        error: truncate(message, 500),
        statusText: isFinal ? "فشل التنسيق" : formatJob.statusText,
      },
    });

    await emitProgress({
      type: "format",
      id: jobId,
      status: isFinal ? "failed" : formatJob.status,
      progress: formatJob.progress,
      error: truncate(message, 200),
    });

    await log(
      `FormatJob ${jobId} ${isFinal ? "permanently failed" : "failed (will retry)"}`,
      {
        level: isFinal ? "error" : "warn",
        source: "formatting",
        workerId: WORKER_ID,
        jobId,
        details: { err: message, stack, attempts, maxAttempts: MAX_ATTEMPTS },
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
    `[format] Starting ${WORKER_ID} (queue "${FORMATTING_QUEUE}", skills=${SKILLS_DIR}, jobs=${JOBS_DIR})`
  );

  // Connect to Redis — required for BullMQ
  const redis = await getRedis();
  if (!redis) {
    console.error("[format] Redis unavailable — exiting");
    process.exit(1);
  }

  // Ensure dirs
  await fs.mkdir(SKILLS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(JOBS_DIR, { recursive: true }).catch(() => {});

  // Write auth.json (if configured)
  await writeOpenCodeAuth();

  // Initial heartbeat + interval
  await heartbeat();
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

  // Start BullMQ worker
  worker = new Worker(FORMATTING_QUEUE, processJob, {
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
        data: { status: "idle", currentJobId: null },
      });
    } catch (err) {
      console.error("[completed-status-update-failed]", err);
    }
    if (job) {
      logger.debug(`Job ${job.id} completed`, {
        source: "formatting",
        workerId: WORKER_ID,
        jobId: (job.data as FormattingJobData)?.jobId,
      });
    }
  });

  worker.on("failed", async (job, err) => {
    logger.error(`Job ${job?.id ?? "?"} failed in BullMQ: ${err.message}`, {
      source: "formatting",
      workerId: WORKER_ID,
      jobId: (job?.data as FormattingJobData)?.jobId,
      details: { stack: err.stack },
    });
    try {
      await db.workerStatus.update({
        where: { workerId: WORKER_ID },
        data: {
          status: "idle",
          currentJobId: null,
          lastError: truncate(err.message, 500),
        },
      });
    } catch (e) {
      console.error("[failed-status-update-failed]", e);
    }
  });

  worker.on("error", (err) => {
    logger.error(`Worker ${WORKER_ID} runtime error: ${err.message}`, {
      source: "formatting",
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
  console.log(`[format] ${signal} received — shutting down ${WORKER_ID}`);

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
      data: { status: "idle", currentJobId: null },
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
  console.error("[format] Fatal:", err);
  process.exit(1);
});
