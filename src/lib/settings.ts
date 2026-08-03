// Settings helper — reads/writes the Setting table with in-memory cache + redis cache
import { db } from "./db";
import { redisCacheGet, redisCacheSet, redisCacheDel } from "./redis";

const CACHE_PREFIX = "setting:";

export const DEFAULT_SETTINGS: Record<string, string> = {
  deepgram_model: "whisper-large",
  deepgram_language: "ar",
  audio_channels: "mono", // mono | stereo
  audio_bitrate: "64", // kbps
  active_transcription_workers: "5", // 0-5
  active_formatting_workers: "2", // 0-2
  max_retry_attempts: "3",
};

export async function getSetting(key: string): Promise<string> {
  // try redis cache
  const cached = await redisCacheGet<string>(CACHE_PREFIX + key);
  if (cached !== null && cached !== undefined) return cached;
  // DB
  const row = await db.setting.findUnique({ where: { key } });
  const value = row?.value ?? DEFAULT_SETTINGS[key] ?? "";
  await redisCacheSet(CACHE_PREFIX + key, value, 300);
  return value;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const result: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) result[r.key] = r.value;
  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  await redisCacheDel(CACHE_PREFIX + key);
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(key, value);
  }
}

export async function getDeepgramSettings() {
  const [model, language] = await Promise.all([
    getSetting("deepgram_model"),
    getSetting("deepgram_language"),
  ]);
  return { model, language };
}

export async function getAudioSettings() {
  const [channels, bitrate] = await Promise.all([
    getSetting("audio_channels"),
    getSetting("audio_bitrate"),
  ]);
  return { channels: channels as "mono" | "stereo", bitrate: parseInt(bitrate, 10) };
}
