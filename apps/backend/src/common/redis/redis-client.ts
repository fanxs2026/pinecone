import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * 共享 Redis 客户端（2026-08-19，F-4/F-5 修复基础）。
 *
 * - 惰性单例：仅在 REDIS_URL 配置且首次调用时创建连接
 * - 多实例共享状态：API Token 限流计数、WS 连接数等跨实例一致（消灭"每实例各计各的"绕过）
 * - 优雅降级：Redis 未配置/连接失败时返回 null，调用方自行回退内存实现（单实例仍可用）
 *
 * 用法：
 *   const redis = getRedisClient();
 *   if (redis) { await redis.incr(key); ... } else { /* 内存回退 *\/ }
 */
const logger = new Logger('Redis');
let client: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client === undefined) {
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        connectTimeout: 3_000,
        // 最多重试 5 次后放弃（避免无限重连打满日志）；恢复后自动重连
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1_000)),
      });
      client.on('error', (e) => logger.warn(`Redis error (will degrade to in-memory): ${e.message}`));
    } catch {
      client = null;
    }
  }
  return client;
}

/** 关闭客户端（测试/优雅退出用） */
export async function closeRedisClient(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* noop */
    }
    client = undefined;
  }
}
