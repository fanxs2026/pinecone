import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, timingSafeEqual, scrypt, createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { getEffectiveRegistrationMode } from '../../common/config/registration-mode';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { getSecret } from '../../common/config/env-secrets';

// Promisified scrypt: use a thin wrapper since Node's promisify
// doesn't handle the overloaded scrypt function cleanly.
// NOTE: must pass maxmem explicitly — Node's default is 32MB which is
// exceeded by N=32768,r=8 (~33.5MB) and N=131072,r=8 (~128MB).
function scryptAsync(password: string, salt: Buffer, keylen: number, N: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// scrypt parameters: N=2^15 (32768), r=8, p=1, keylen=64 (OWASP 2023 interactive: N >= 2^15)
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1 } as const;
// 密码重置令牌有效期：30 分钟
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function getAccessSecret(): string {
  return getSecret('JWT_ACCESS_SECRET', 32);
}

// Opaque refresh token: 48 random bytes, base64url (no user info embedded).
// Stored as SHA-256 to avoid holding the raw token in the DB and to
// guarantee constant-time comparison semantics (bcrypt truncates at 72 bytes,
// which made JWT refresh rotation cryptographically broken — old tokens
// stayed valid forever).
const REFRESH_TOKEN_BYTES = 48;

function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hash a password with scrypt (memory-hard KDF).
 * Format: $scrypt$N$salt$hash
 *   - N: cost factor (e.g., 16384)
 *   - salt: hex-encoded 32-byte random salt
 *   - hash: hex-encoded derived key
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS.N);
  return `$scrypt$${SCRYPT_OPTIONS.N}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a hash. Supports both scrypt (current) and
 * bcrypt (legacy). If a bcrypt hash verifies successfully, the hash is
 * automatically upgraded to scrypt via the provided `upgrade` callback.
 */
async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsMigration: boolean }> {
  // New scrypt hash: $scrypt$N$salt$hash
  if (storedHash.startsWith('$scrypt$')) {
    const [, , n, salt, expectedHash] = storedHash.split('$');
    const N = parseInt(n, 10) || SCRYPT_OPTIONS.N;
    const derivedKey = await scryptAsync(password, Buffer.from(salt, 'hex'), SCRYPT_KEYLEN, N);
    const valid = timingSafeEqual(derivedKey, Buffer.from(expectedHash, 'hex'));
    // needsMigration: hash was derived with a lower cost factor than current
    return { valid, needsMigration: valid && N < SCRYPT_OPTIONS.N };
  }

  // Legacy bcrypt hash: $2a$... or $2b$...
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, needsMigration: valid };
  }

  // Unknown format
  return { valid: false, needsMigration: false };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  /**
   * 有效注册模式（open|whitelist|invite）。
   * fail-closed（发布门禁 Fix#2）+ trim/白名单校验（F-001）——统一复用公共 helper，
   * 与 registration-admin 管理端保持一致（P1-2/F-005）。
   */
  private getEffectiveMode(): string {
    return getEffectiveRegistrationMode();
  }

  /** 当前注册模式（open|whitelist|invite）——注册页据此提示是否需要邀请码 */
  getRegistrationMode(): string {
    return this.getEffectiveMode();
  }

  async register(dto: RegisterDto) {
    // H4 修复：邮箱统一小写（防大小写变体重复账号）
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // 注册模式控制：open（默认，任何人可注册）/ whitelist（仅白名单邮箱）/ invite（需邀请码）
    const mode = this.getEffectiveMode();
    if (mode === 'whitelist') {
      const whitelisted = await this.prisma.registrationWhitelist.findUnique({
        where: { email },
      });
      if (!whitelisted) {
        throw new ForbiddenException('Registration is restricted. Contact your administrator.');
      }
    } else if (mode === 'invite') {
      const code = dto.inviteCode?.trim();
      if (!code) {
        throw new ForbiddenException('An invitation code is required to register');
      }
      // 条件原子消费（防 TOCTOU 并发超用）：
      // 原生参数化 SQL 条件更新——仅当 active 且未过期且 used_count < max_uses 时递增，
      // 数据库行级锁保证并发竞争时只有一个请求成功（影响行数=1），其余返回 0
      const consume = await this.prisma.$executeRaw`
        UPDATE invite_codes
        SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
        WHERE code = ${code}
          AND "active" = true
          AND ("expiresAt" IS NULL OR "expiresAt" > now())
          AND "usedCount" < "maxUses"
      `;
      if (consume === 0) {
        throw new ForbiddenException('Invalid or expired invitation code');
      }
      try {
        const user = await this.createUser(dto, email);
        return user;
      } catch (e) {
        // 用户创建失败则回滚邀请码用量
        await this.prisma.inviteCode.updateMany({
          where: { code },
          data: { usedCount: { decrement: 1 } },
        }).catch(() => {});
        throw e;
      }
    }

    return this.createUser(dto, email);
  }

  private async createUser(dto: RegisterDto, email: string) {
    const passwordHash = await hashPassword(dto.password);
    let user: any;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name,
          passwordHash,
        },
      });
    } catch (e: any) {
      // P3-2 修复：并发注册同邮箱 → 唯一约束冲突（P2002）→ 409 而非 500
      if (e?.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  /**
   * 忘记密码：生成一次性重置令牌。
   * - 无论邮箱是否存在都返回成功（防用户枚举）；仅当用户存在时生成令牌
   * - 令牌 30 分钟有效、一次性，重置后作废
   * - 已配置 SMTP：发送重置邮件，响应不返回 token（emailSent: true）
   * - 未配置 SMTP（演示模式）：响应直接返回 resetToken 供前端展示
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { id: true },
    });
    if (!user) {
      // 防枚举：统一响应成功
      return { emailSent: false, mode: 'demo' };
    }

    // 作废该用户所有未使用的旧令牌
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashRefreshToken(token); // SHA-256，DB 不存明文
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // 配置了 SMTP → 发送邮件（不返回 token）
    if (this.mailService.isConfigured()) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:6173';
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;
      const sent = await this.mailService.sendPasswordResetEmail(dto.email, resetLink);
      if (!sent) {
        // 安全修复（H-03）：SMTP 失败禁止回落 resetToken——
        // 否则攻击者在邮件故障窗口可对受害者触发 forgot-password 直接拿令牌 → 账户接管
        console.error(`[AuthService] reset email to ${dto.email} failed (SMTP); token NOT exposed`);
        return { emailSent: false, mode: 'smtp-error' };
      }
      return { emailSent: true, mode: 'smtp' };
    }

    // 演示模式（未配置 SMTP）：仅开发环境可返回 token 供前端展示；
    // F-04 修复：生产环境禁止返回 resetToken（防止生产误配未设 EMAIL_* 时账户接管）
    if (process.env.NODE_ENV === 'production') {
      console.error(`[AuthService] SMTP not configured in production; reset email to ${dto.email} skipped, token NOT exposed`);
      return { emailSent: false, mode: 'smtp-not-configured' };
    }
    return { emailSent: false, mode: 'demo', resetToken: token };
  }

  /**
   * 重置密码：校验令牌（存在/未使用/未过期）→ 更新密码 → 作废令牌 → 强制所有会话下线。
   */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashRefreshToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('重置链接无效或已过期');
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      // 1. 更新密码
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // 2. 令牌一次性作废
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // 3. 清空 refresh token → 所有已登录会话强制下线
      this.prisma.user.update({
        where: { id: record.userId },
        data: { refreshTokenHash: null },
      }),
    ]);

    return { success: true };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // SECURITY: verification failure must NEVER reset the password.
    // (The previous "temporary recovery patch" allowed account takeover:
    // anyone knowing an email could set the victim's password to any value.)
    let valid = false;
    let needsMigration = false;
    try {
      const result = await verifyPassword(dto.password, user.passwordHash);
      valid = result.valid;
      needsMigration = result.needsMigration;
    } catch {
      // Malformed stored hash — treat as invalid credentials, never reset.
      valid = false;
    }

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 账号禁用校验：管理员可停用用户，禁用后禁止登录
    if (user.active === false) {
      throw new UnauthorizedException('Account is disabled. Contact your administrator.');
    }

    // Only after a SUCCESSFUL verification, transparently upgrade a legacy
    // bcrypt hash to scrypt (safe: the caller proved knowledge of the password).
    if (needsMigration) {
      const newHash = await hashPassword(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashRefreshToken(refreshToken);

    const user = await this.prisma.user.findFirst({
      where: { refreshTokenHash: tokenHash },
    });
    if (!user) {
      // Token unknown: either forged or a replayed old token whose hash was
      // already rotated away. Rotation is enforced atomically below, so a
      // replayed token can never succeed twice.
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 账号被禁用：刷新 token 也拒绝（使现有会话在 token 过期前也无法续期）
    if (user.active === false) {
      throw new UnauthorizedException('Account is disabled. Contact your administrator.');
    }

    const tokens = await this.generateTokens(user.id, user.email, tokenHash);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  /** F-01：凭 refresh token（cookie）撤销会话——access token 已过期时也能注销 */
  async logoutByRefreshToken(refreshToken: string) {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.prisma.user.updateMany({
      where: { refreshTokenHash: tokenHash },
      data: { refreshTokenHash: null },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMembers: {
          include: { workspace: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return this.sanitizeUser(user);
  }

  private async generateTokens(userId: string, email: string, expectedTokenHash?: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload);

    // Opaque refresh token, stored hashed. Rotation is an atomic
    // compare-and-swap: the update only succeeds if the stored hash still
    // matches the presented token, so concurrent replays race for a single
    // slot — only one wins, the others get 401.
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const updated = await this.prisma.user.updateMany({
      where: { id: userId, ...(expectedTokenHash ? { refreshTokenHash: expectedTokenHash } : {}) },
      data: { refreshTokenHash },
    });
    if (updated.count === 0) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  /**
   * SSO/OIDC 登录复用：为已存在（或刚创建）的用户签发 access + refresh token。
   * 不要求密码，供 SsoService 回调完成后直接发 cookie。
   */
  async issueTokens(userId: string, email: string) {
    return this.generateTokens(userId, email);
  }
}
