import Redis from 'ioredis';
import logger from './logger';

export const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => {
    if (times > 5) {
      logger.error('Redis connection failed after 5 retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

redisClient.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

// ─── Cache Helpers ────────────────────────────────────────────
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const value = await redisClient.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
};

export const cacheDel = async (key: string): Promise<void> => {
  await redisClient.del(key);
};

export const cacheDelPattern = async (pattern: string): Promise<void> => {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
};

// ─── Pub/Sub Clients (for Socket.io Redis Adapter) ────────────
export const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
});

export const subClient = pubClient.duplicate();
