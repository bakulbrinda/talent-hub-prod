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
// All helpers are wrapped in try/catch so a Redis outage degrades gracefully:
// cacheGet returns null (triggers re-computation), cacheSet/cacheDel/cacheDelPattern
// log and continue so callers are never blocked by a cache failure (S10 fix).

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err: any) {
    logger.warn(`cacheGet failed for key "${key}":`, err.message);
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  try {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err: any) {
    logger.warn(`cacheSet failed for key "${key}":`, err.message);
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
  } catch (err: any) {
    logger.warn(`cacheDel failed for key "${key}":`, err.message);
  }
};

export const cacheDelPattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (err: any) {
    logger.warn(`cacheDelPattern failed for pattern "${pattern}":`, err.message);
  }
};

// ─── Pub/Sub Clients (for Socket.io Redis Adapter) ────────────
// IMPORTANT: These MUST have error listeners. Without them, a dropped Redis
// connection emits an unhandled 'error' event which crashes the Node.js process.
export const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
});
pubClient.on('error', (err) => {
  logger.error('Redis pubClient error:', err.message);
});

export const subClient = pubClient.duplicate();
subClient.on('error', (err) => {
  logger.error('Redis subClient error:', err.message);
});
