import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { redisCacheGet, redisCacheSet } from "@/lib/redis";
import os from "os";

export const dynamic = "force-dynamic";

// Process start time for uptime calculation
const PROCESS_START = Date.now();

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const cacheKey = "system:metrics";
  const cached = await redisCacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // DB table counts + estimated sizes
    const [
      videoCount, playlistCount, formatJobCount, skillCount,
      cookieCount, logCount, workerCount, providerCount, settingCount,
      completedVideos, failedVideos, completedJobs, failedJobs,
    ] = await Promise.all([
      db.video.count(),
      db.playlist.count(),
      db.formatJob.count(),
      db.skill.count(),
      db.cookie.count(),
      db.logEntry.count(),
      db.workerStatus.count(),
      db.aIProvider.count(),
      db.setting.count(),
      db.video.count({ where: { status: "completed" } }),
      db.video.count({ where: { status: "failed" } }),
      db.formatJob.count({ where: { status: "completed" } }),
      db.formatJob.count({ where: { status: "failed" } }),
    ]);

    // System info
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptimeMs = Date.now() - PROCESS_START;
    const systemUptime = os.uptime();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuCount = os.cpus().length;
    const loadAvg = os.loadavg();

    // Estimate DB size (rough: count rows × average row size)
    const estimatedDbSize =
      videoCount * 2000 +       // videos have large transcriptText
      formatJobCount * 500 +
      logCount * 300 +
      cookieCount * 3000 +      // cookies have large content
      skillCount * 500 +
      playlistCount * 200 +
      workerCount * 200 +
      providerCount * 100 +
      settingCount * 200;

    const metrics = {
      database: {
        tables: {
          videos: videoCount,
          playlists: playlistCount,
          formatJobs: formatJobCount,
          skills: skillCount,
          cookies: cookieCount,
          logs: logCount,
          workers: workerCount,
          providers: providerCount,
          settings: settingCount,
        },
        completedVideos,
        failedVideos,
        completedJobs,
        failedJobs,
        estimatedSizeBytes: estimatedDbSize,
        estimatedSizeMB: Math.round((estimatedDbSize / (1024 * 1024)) * 100) / 100,
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        processUptimeMs: uptimeMs,
        processUptime: formatUptime(uptimeMs),
        systemUptimeSec: systemUptime,
        systemUptime: formatUptime(systemUptime * 1000),
        cpuCount,
        loadAvg: loadAvg.map((l) => Math.round(l * 100) / 100),
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          usedPercent: Math.round((usedMem / totalMem) * 100),
          totalGB: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
          usedGB: Math.round((usedMem / (1024 ** 3)) * 100) / 100,
        },
        process: {
          rss: memUsage.rss,                    // Resident Set Size
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          rssMB: Math.round((memUsage.rss / (1024 ** 2)) * 100) / 100,
          heapUsedMB: Math.round((memUsage.heapUsed / (1024 ** 2)) * 100) / 100,
          cpuUser: cpuUsage.user,
          cpuSystem: cpuUsage.system,
        },
      },
      generatedAt: new Date().toISOString(),
    };

    await redisCacheSet(cacheKey, metrics, 30); // 30s cache
    return NextResponse.json(metrics);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}ي ${hours}س ${minutes}د`;
  if (hours > 0) return `${hours}س ${minutes}د ${secs}ث`;
  if (minutes > 0) return `${minutes}د ${secs}ث`;
  return `${secs}ث`;
}
