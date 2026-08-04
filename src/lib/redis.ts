import Redis from "ioredis";

// Redis connection — graceful fallback when not available (dev sandbox)
// IMPORTANT: maxRetriesPerRequest MUST be null for BullMQ compatibility.
// BullMQ Workers use blocking commands (BRPOPLPUSH) that require unlimited retries.
let _redis: Redis | null = null;
let _redisAvailable = false;

const REDIS_URL =
  process.env.REDIS_URL ||
  (process.env.SERVICE_PASSWORD_REDIS
    ? `redis://:${process.env.SERVICE_PASSWORD_REDIS}@${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || "6379"}`
    : "redis://localhost:6379");

export async function getRedis(): Promise<Redis | null> {
  if (_redis) return _redis;
  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // REQUIRED by BullMQ — must be null, not a number
      retryStrategy: (times) => {
        if (times > 10) return null; // give up after 10 retries
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
      connectTimeout: 5000,
      enableOfflineQueue: true, // queue commands while connecting
    });
    await client.ping();
    _redis = client;
    _redisAvailable = true;
    return client;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return _redisAvailable;
}

export async function redisCacheGet<T>(key: string): Promise<T | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    const v = await r.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export async function redisCacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // ignore
  }
}

export async function redisCacheDel(key: string): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // ignore
  }
}
