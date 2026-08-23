import { Injectable, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService, type SmtpOptions } from './mail.service';
import { encryptSecret, decryptSecret } from '../../common/utils/secret-cipher';

const SMTP_SETTINGS_KEY = 'smtp';

export interface SmtpConfigDto {
  configured: boolean;
  source: 'db' | 'env' | 'none';
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  /** 是否已保存授权码（脱敏，不返回明文） */
  hasPass: boolean;
}

export interface SaveSmtpDto {
  host: string;
  port: number;
  user: string;
  /** 留空 = 保留已存密码；首次配置或更换时必填 */
  pass?: string;
  from?: string;
}

interface StoredSmtp {
  host: string;
  port: number;
  user: string;
  passEnc: string;
  from?: string;
}

/**
 * 平台级 SMTP 配置（2026-08-21）
 * - 存储：settings['smtp']（JSON，授权码经 secret-cipher AES-256-GCM 加密）
 * - 优先级：DB 配置 > .env 兜底（env 保证首跑/未配置时可用）
 * - 管理权限：REGISTRATION_ADMIN_EMAILS 名单（与 license 管理端一致，老板开箱即用）
 */
@Injectable()
export class SmtpSettingsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = await this.loadFromDb();
    if (cfg) {
      this.mailService.reconfigure(cfg);
    }
  }

  /** 读取 DB 配置（解密），无记录/表缺失返回 null（不阻断应用启动） */
  private async loadFromDb(): Promise<SmtpOptions | null> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: SMTP_SETTINGS_KEY } });
      if (!row?.value) return null;
      try {
        const parsed = JSON.parse(row.value) as StoredSmtp;
        if (!parsed.host || !parsed.user || !parsed.passEnc) return null;
        return {
          host: parsed.host,
          port: parsed.port,
          user: parsed.user,
          pass: decryptSecret(parsed.passEnc),
          from: parsed.from,
        };
      } catch {
        return null; // 密文损坏/密钥变更：回退 env，不阻断启动
      }
    } catch {
      // 表不存在（迁移未应用）等异常：回退 env，不阻断启动
      return null;
    }
  }

  /** 当前生效配置（脱敏视图）：DB 优先，env 兜底 */
  async getConfig(): Promise<SmtpConfigDto> {
    const db = await this.loadFromDb();
    if (db) {
      return {
        configured: true,
        source: 'db',
        host: db.host,
        port: db.port,
        user: db.user,
        from: db.from,
        hasPass: true,
      };
    }
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USER;
    if (host && user && process.env.EMAIL_PASS) {
      return {
        configured: true,
        source: 'env',
        host,
        port: Number(process.env.EMAIL_PORT || 465),
        user,
        from: process.env.EMAIL_FROM,
        hasPass: true,
      };
    }
    return { configured: false, source: 'none', hasPass: false };
  }

  /** 保存配置（pass 留空保留旧密码）并立即生效 */
  async saveConfig(dto: SaveSmtpDto): Promise<SmtpConfigDto> {
    const existing = await this.prisma.setting.findUnique({ where: { key: SMTP_SETTINGS_KEY } });
    let passEnc: string;
    if (dto.pass && dto.pass.trim().length > 0) {
      passEnc = encryptSecret(dto.pass.trim());
    } else {
      // 未提供新密码：复用已存密文；无存密文则回退 env（仅迁移场景）
      if (existing?.value) {
        try {
          const parsed = JSON.parse(existing.value) as StoredSmtp;
          passEnc = parsed.passEnc;
        } catch {
          passEnc = encryptSecret(process.env.EMAIL_PASS || '');
        }
      } else {
        passEnc = encryptSecret(process.env.EMAIL_PASS || '');
      }
    }

    const stored: StoredSmtp = {
      host: dto.host.trim(),
      port: dto.port,
      user: dto.user.trim(),
      passEnc,
      from: dto.from?.trim() || undefined,
    };
    const value = JSON.stringify(stored);

    await this.prisma.setting.upsert({
      where: { key: SMTP_SETTINGS_KEY },
      create: { key: SMTP_SETTINGS_KEY, value, isSecret: true },
      update: { value, isSecret: true },
    });

    // 立即重建 transporter（密码解密）
    this.mailService.reconfigure({
      host: stored.host,
      port: stored.port,
      user: stored.user,
      pass: decryptSecret(stored.passEnc),
      from: stored.from,
    });

    return this.getConfig();
  }

  /** 发送测试邮件到指定邮箱；SMTP 不可用时返回错误信息而非抛异常 */
  async sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
    if (!this.mailService.isConfigured()) {
      return { ok: false, message: 'SMTP 未配置（DB 与 .env 均无有效配置）' };
    }
    try {
      const ok = await this.mailService.sendNotificationEmail(toEmail, {
        actorName: '系统',
        typeLabel: 'SMTP 测试',
        entityTitle: '邮件服务配置验证',
        snippet: '这是一封来自 Pinecone 的 SMTP 测试邮件。如果您收到它，说明邮件服务配置正确。',
        link: 'https://localhost:6173',
      });
      return ok
        ? { ok: true, message: '发送成功' }
        : { ok: false, message: '发送失败（详见后端日志）' };
    } catch (e) {
      return { ok: false, message: `发送异常: ${(e as Error).message}` };
    }
  }

  /** 管理权限判定：REGISTRATION_ADMIN_EMAILS 名单（与 license 管理端一致） */
  isAdmin(user: { email: string }): boolean {
    const admins = (process.env.REGISTRATION_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (admins.length === 0) return false;
    return admins.includes((user.email || '').toLowerCase());
  }

  assertAdmin(user: { email: string }): void {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('You are not authorized to manage SMTP settings');
    }
  }
}
