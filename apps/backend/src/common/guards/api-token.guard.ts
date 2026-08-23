import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_SCOPES_KEY } from '../../common/decorators/require-scopes.decorator';
import { getRedisClient } from '../../common/redis/redis-client';

/**
 * API Token 鉴权守卫（Phase 0-3 + P2 强化 2026-08-19）。
 *
 * - 校验 `Authorization: Bearer <api_token>`（SHA-256 存储，防库泄即 token 泄）
 * - P2 scope 强制：端点标注 @RequireScopes(...) 后，token.scopes 必须包含全部所需 scope，否则 403
 * - P2 token 级限流：Redis 共享固定窗口（默认 600 req/min/token，env API_TOKEN_RATE_LIMIT），
 *   多实例一致；Redis 不可用时回退进程内存窗口（单实例仍生效），与全局 Throttler（IP 级）互补
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly rateLimitMap = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) {
      throw new UnauthorizedException('API token required');
    }

    const tokenHash = this.hashToken(token);
    const record = await this.prisma.apiToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid API token');
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('API token expired');
    }

    // P2 token 级限流：优先 Redis（多实例共享），失败/未配置回退内存窗口
    await this.enforceRateLimit(tokenHash);

    // P2 scope 强制：端点要求 vs token 已授权 scopes（空 scopes 的 token 不能访问有 scope 要求的端点）
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      const tokenScopes = (record.scopes ?? []) as string[];
      const missing = required.filter((s) => !tokenScopes.includes(s));
      if (missing.length > 0) {
        throw new ForbiddenException(`API token missing required scope(s): ${missing.join(', ')}`);
      }
    }

    // 刷新 lastUsedAt（异步，失败不影响主流程）
    void this.prisma.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    request.apiToken = record;
    return true;
  }

  private async enforceRateLimit(tokenHash: string): Promise<void> {
    const limit = Number(process.env.API_TOKEN_RATE_LIMIT || 600);
    const redis = getRedisClient();
    if (redis) {
      try {
        // F 修复（2026-08-19）：Redis 固定窗口，多实例计数一致
        const key = `rl:apitoken:${tokenHash}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 60);
        if (count > limit) throw new ForbiddenException('API token rate limit exceeded');
        return;
      } catch (e) {
        if (e instanceof ForbiddenException) throw e;
        // Redis 异常 → 回退内存窗口（保可用性）
      }
    }
    this.enforceRateLimitMemory(tokenHash, limit);
  }

  private enforceRateLimitMemory(tokenHash: string, limit: number): void {
    const now = Date.now();
    const windowMs = 60_000;
    const entry = this.rateLimitMap.get(tokenHash);
    if (!entry || entry.resetAt < now) {
      this.rateLimitMap.set(tokenHash, { count: 1, resetAt: now + windowMs });
      // 防内存膨胀：每窗口清理一次过期条目
      if (this.rateLimitMap.size > 10_000) {
        for (const [k, v] of this.rateLimitMap) {
          if (v.resetAt < now) this.rateLimitMap.delete(k);
        }
      }
      return;
    }
    entry.count++;
    if (entry.count > limit) {
      throw new ForbiddenException('API token rate limit exceeded');
    }
  }
}
