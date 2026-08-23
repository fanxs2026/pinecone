import { Test } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenGuard } from './api-token.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_SCOPES_KEY } from '../../common/decorators/require-scopes.decorator';

// F/F-4 回归：守卫级测试（B1 相关的 CI 越权见 ci.service.spec.ts）。
// 强制走内存限流路径（mock redis-client → null），保证测试确定、无网络。
jest.mock('../../common/redis/redis-client', () => ({
  getRedisClient: jest.fn(() => null),
  closeRedisClient: jest.fn(),
}));

describe('ApiTokenGuard (P0)', () => {
  let guard: ApiTokenGuard;
  let prisma: any;

  const makeCtx = (token: string | undefined, requiredScopes?: string[]) => {
    const request = { headers: token ? { authorization: `Bearer ${token}` } : {}, apiToken: undefined };
    const handler = () => {};
    if (requiredScopes) Reflect.defineMetadata(REQUIRED_SCOPES_KEY, requiredScopes, handler);
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;
  };

  beforeEach(async () => {
    prisma = {
      apiToken: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiTokenGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: new Reflector() },
      ],
    }).compile();
    guard = moduleRef.get(ApiTokenGuard);
  });

  it('401 when token missing', async () => {
    await expect(guard.canActivate(makeCtx(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('401 when token invalid', async () => {
    prisma.apiToken.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx('tok'))).rejects.toThrow('Invalid API token');
  });

  it('401 when token expired', async () => {
    prisma.apiToken.findFirst.mockResolvedValue({ id: 't', expiresAt: new Date(Date.now() - 1000), scopes: [] });
    await expect(guard.canActivate(makeCtx('tok'))).rejects.toThrow('API token expired');
  });

  it('403 when required scope missing', async () => {
    prisma.apiToken.findFirst.mockResolvedValue({ id: 't', expiresAt: null, scopes: [] });
    await expect(guard.canActivate(makeCtx('tok', ['ci:write']))).rejects.toThrow(ForbiddenException);
  });

  it('accepts valid token with required scope', async () => {
    prisma.apiToken.findFirst.mockResolvedValue({ id: 't', expiresAt: null, scopes: ['ci:write'] });
    await expect(guard.canActivate(makeCtx('tok', ['ci:write']))).resolves.toBe(true);
  });

  it('403 when exceeding per-token rate limit (memory window)', async () => {
    const prev = process.env.API_TOKEN_RATE_LIMIT;
    process.env.API_TOKEN_RATE_LIMIT = '2';
    try {
      prisma.apiToken.findFirst.mockResolvedValue({ id: 't', expiresAt: null, scopes: [] });
      await guard.canActivate(makeCtx('tok'));
      await guard.canActivate(makeCtx('tok'));
      await expect(guard.canActivate(makeCtx('tok'))).rejects.toThrow(ForbiddenException);
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN_RATE_LIMIT;
      else process.env.API_TOKEN_RATE_LIMIT = prev;
    }
  });
});
