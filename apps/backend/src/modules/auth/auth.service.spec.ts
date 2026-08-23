import { Test } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { scrypt, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

// Mock secrets access: unit tests must not depend on JWT_* env vars.
jest.mock('../../common/config/env-secrets', () => ({
  getSecret: jest.fn(() => 'test-secret-0123456789abcdef0123456789abcdef'),
}));

/** Build a real scrypt hash matching the format used by AuthService ($scrypt$N$salt$hash) */
function scryptHash(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(32);
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`$scrypt$16384$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;

  const baseUser = {
    id: 'u1',
    email: 'a@b.com',
    name: 'A',
    passwordHash: null as string | null,
    refreshTokenHash: null as string | null,
    workspaceMembers: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workspaceMember: {
        findFirst: jest.fn(),
      },
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'a@b.com' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: MailService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ── login (SECURITY regression: no password reset on failure) ──

  it('login: wrong password throws Unauthorized and does NOT reset the password', async () => {
    const user = { ...baseUser, passwordHash: await scryptHash('correct-password') };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      service.login({ email: 'a@b.com', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);

    // The critical assertion: a failed login must never write a new hash
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('login: unknown email throws Unauthorized and never writes', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@x.com', password: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('login: malformed stored hash throws Unauthorized and never writes', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: 'not-a-valid-hash' });

    await expect(
      service.login({ email: 'a@b.com', password: 'anything' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('login: correct password returns tokens and sanitized user', async () => {
    const user = { ...baseUser, passwordHash: await scryptHash('correct-password') };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.login({ email: 'a@b.com', password: 'correct-password' });

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.id).toBe('u1');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHash');
    // generateTokens() writes the refreshTokenHash via updateMany (atomic rotation)…
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1' }),
        data: expect.objectContaining({ refreshTokenHash: expect.any(String) }),
      }),
    );
    // …but login must NEVER write passwordHash (P0 regression guard)
    const passwordWrites = prisma.user.updateMany.mock.calls.filter(
      (call: any[]) => call[0]?.data?.passwordHash !== undefined,
    );
    expect(passwordWrites).toHaveLength(0);
  });

  it('login: legacy bcrypt hash is transparently migrated only after successful verification', async () => {
    const bcryptHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: bcryptHash });

    await service.login({ email: 'a@b.com', password: 'correct-password' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ passwordHash: expect.stringContaining('$scrypt$') }),
      }),
    );
  });

  // ── register ──

  it('register: duplicate email throws ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: 'x' });

    await expect(
      service.register({ email: 'a@b.com', password: 'password123' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('register: new user creates scrypt hash and returns tokens', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      ...baseUser,
      passwordHash: await scryptHash('password123'),
    });

    const result = await service.register({ email: 'new@b.com', password: 'password123', name: 'New' });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: expect.stringContaining('$scrypt$'),
        }),
      }),
    );
    expect(result.accessToken).toBe('signed-token');
  });

  // ── refresh ──

  it('refresh: valid refresh token rotates and returns new tokens', async () => {
    const user = { ...baseUser, refreshTokenHash: 'PRESENTED-TOKEN-HASH' };
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.refresh('signed-token');

    expect(result.accessToken).toBe('signed-token');
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1' }),
        data: expect.objectContaining({ refreshTokenHash: expect.any(String) }),
      }),
    );
  });

  it('refresh: token whose stored hash was rotated is rejected', async () => {
    // Stored hash does not match the presented token → findFirst returns null → Unauthorized
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.refresh('signed-token')).rejects.toThrow(UnauthorizedException);
  });

  // ── logout ──

  it('logout: clears the refresh token hash', async () => {
    await service.logout('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshTokenHash: null },
    });
  });
});
