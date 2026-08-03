import Redis from "ioredis";

// Redis connection — graceful fallback when not available (dev sandbox)
let _redis: Redis | null = null;
let _redisAvailable = false;

const REDIS_URL =
  process.env.REDIS_URL ||
  (process.env.SERVICE_PASSWORD_REDIS
    ? `redis://:${process.env.SERVICE_PASSWORD_REDIS}@${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || "6379"}`
    : "redis://localhost:6379");

export async function getRedis(): Promise<Redis | null> {
  if (_redis) return _redis;
  if (_redisAvailable === false && _redis === null) {
    // first attempt
  }
  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 2) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: false,
      connectTimeout: 2000,
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
