import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withCodeRetry } from '../../common/code-generator';
import { randomBytes, randomInt } from 'crypto';

const PORTAL_EMAIL = 'portal@pinecone.local';
const PORTAL_NAME = '反馈门户';
const CAPTCHA_TTL_MS = 5 * 60_000;

/** 客户反馈门户（P0）：免登录提交反馈 + 投票，令牌为工作区级，复用 @Public() 模式 */
@Injectable()
export class FeedbackPortalService {
  constructor(private prisma: PrismaService) {}

  /** 轻量算术验证码（内存，5 分钟过期，一次性；单实例自托管够用） */
  private captchas = new Map<string, { answer: number; expiresAt: number }>();

  /** 校验门户 token → 工作区（不存在/未启用均拒绝） */
  private async resolveWorkspaceByToken(token: string) {
    const ws = await this.prisma.workspace.findFirst({ where: { feedbackPortalToken: token } });
    if (!ws) throw new NotFoundException('Portal not found');
    if (!ws.feedbackPortalEnabled) throw new ForbiddenException('Portal disabled');
    return ws;
  }

  /** 生成算术验证码 */
  async generateCaptcha(token: string) {
    await this.resolveWorkspaceByToken(token);
    const a = randomInt(1, 10);
    const b = randomInt(1, 10);
    const id = randomBytes(8).toString('hex');
    this.captchas.set(id, { answer: a + b, expiresAt: Date.now() + CAPTCHA_TTL_MS });
    return { captchaId: id, question: `${a} + ${b} = ?` };
  }

  /** 校验验证码（一次性，错误/过期/不存在均拒绝） */
  private verifyCaptcha(captchaId?: string, captchaAnswer?: string) {
    if (!captchaId || captchaAnswer === undefined || captchaAnswer === null || captchaAnswer === '') {
      throw new BadRequestException('Captcha is required');
    }
    const rec = this.captchas.get(captchaId);
    if (!rec) throw new BadRequestException('Captcha invalid or expired');
    this.captchas.delete(captchaId);
    if (rec.expiresAt < Date.now()) throw new BadRequestException('Captcha expired');
    if (Number(captchaAnswer) !== rec.answer) throw new BadRequestException('Captcha answer incorrect');
  }

  /** 门户主页：配置 + 反馈列表（含票数、主题） */
  async view(token: string) {
    const ws = await this.resolveWorkspaceByToken(token);

    const entityType = (ws.feedbackPortalTarget || 'SUPPORT') as 'SUPPORT' | 'IDEA';
    const items = entityType === 'SUPPORT'
      ? await this.prisma.support.findMany({
          where: { workspaceId: ws.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { id: true, code: true, title: true, description: true, status: true, type: true, tags: true, createdAt: true },
        })
      : await this.prisma.idea.findMany({
          where: { workspaceId: ws.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { id: true, code: true, title: true, description: true, status: true, category: true, tags: true, createdAt: true },
        });

    const ids = items.map((i) => i.id);
    const [voteRows, themeLinks, themes] = await Promise.all([
      ids.length
        ? this.prisma.vote.groupBy({
            by: ['entityId'],
            where: { workspaceId: ws.id, entityType: entityType as any, entityId: { in: ids } },
            _count: { _all: true },
          })
        : [],
      ids.length
        ? this.prisma.entityTheme.findMany({ where: { workspaceId: ws.id, entityType: entityType as any, entityId: { in: ids } } })
        : [],
      this.prisma.theme.findMany({ where: { workspaceId: ws.id, deletedAt: null }, select: { id: true, title: true } }),
    ]);
    const voteMap = new Map(voteRows.map((r) => [r.entityId, r._count._all]));
    const themeMap = new Map(themes.map((t) => [t.id, t.title]));

    return {
      workspaceName: ws.name,
      requireEmail: ws.feedbackPortalRequireEmail,
      target: entityType,
      items: items.map((i) => ({
        ...i,
        voteCount: voteMap.get(i.id) ?? 0,
        themes: themeLinks.filter((l) => l.entityId === i.id).map((l) => themeMap.get(l.themeId)).filter(Boolean),
      })),
    };
  }

  /** 门户提交：落 Support（默认）或 Idea（工作区配置）。需通过算术验证码 */
  async submit(token: string, dto: { title: string; description?: string; type?: string; voterEmail?: string; voterName?: string; captchaId?: string; captchaAnswer?: string }) {
    const ws = await this.resolveWorkspaceByToken(token);
    this.verifyCaptcha(dto.captchaId, dto.captchaAnswer);
    if (ws.feedbackPortalRequireEmail && !dto.voterEmail) {
      throw new BadRequestException('Email is required');
    }

    const bot = await this.getPortalUser();
    const target = (ws.feedbackPortalTarget || 'SUPPORT') as 'SUPPORT' | 'IDEA';
    const tags = ['portal'];
    if (dto.voterEmail) tags.push(`voter:${dto.voterEmail}`);

    if (target === 'SUPPORT') {
      return withCodeRetry(this.prisma, ws.id, 'SUPPORT', (code) =>
        this.prisma.support.create({
          data: {
            workspaceId: ws.id,
            code,
            title: dto.title,
            description: dto.description,
            type: dto.type || 'SUPPORT_REQUEST',
            status: 'OPEN',
            createdById: bot.id,
            tags,
          },
          select: { id: true, code: true, title: true, status: true, createdAt: true },
        }),
      );
    }
    return withCodeRetry(this.prisma, ws.id, 'IDEA', (code) =>
      this.prisma.idea.create({
        data: {
          workspaceId: ws.id,
          code,
          title: dto.title,
          description: dto.description,
          status: 'OPEN',
          createdById: bot.id,
          tags,
        },
        select: { id: true, code: true, title: true, status: true, createdAt: true },
      }),
    );
  }

  /** 门户投票：按邮箱去重。需通过算术验证码 */
  async vote(token: string, dto: { entityType: string; entityId: string; voterEmail?: string; voterName?: string; captchaId?: string; captchaAnswer?: string }) {
    const ws = await this.resolveWorkspaceByToken(token);
    this.verifyCaptcha(dto.captchaId, dto.captchaAnswer);
    if (ws.feedbackPortalRequireEmail && !dto.voterEmail) {
      throw new BadRequestException('Email is required');
    }

    const entity = await this.findEntity(ws.id, dto.entityType, dto.entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    try {
      await this.prisma.vote.create({
        data: {
          workspaceId: ws.id,
          entityType: dto.entityType as any,
          entityId: dto.entityId,
          voterEmail: dto.voterEmail || null,
          voterName: dto.voterName || null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: true, alreadyVoted: true };
      throw e;
    }
    return { ok: true, alreadyVoted: false };
  }

  /** 门户系统用户（懒创建，仅用于标记来源，不可登录） */
  private async getPortalUser() {
    const existing = await this.prisma.user.findUnique({ where: { email: PORTAL_EMAIL } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        email: PORTAL_EMAIL,
        name: PORTAL_NAME,
        passwordHash: '$scrypt$disabled$' + randomBytes(32).toString('hex'),
        active: true,
      },
    });
  }

  // ===== 工作区侧：门户设置（ADMIN）=====

  async getSettings(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return {
      enabled: ws.feedbackPortalEnabled,
      token: ws.feedbackPortalToken ?? null,
      requireEmail: ws.feedbackPortalRequireEmail,
      target: ws.feedbackPortalTarget || 'SUPPORT',
      portalUrl: ws.feedbackPortalToken ? `/feedback/${ws.feedbackPortalToken}` : null,
    };
  }

  async updateSettings(
    workspaceId: string,
    dto: { enabled?: boolean; requireEmail?: boolean; target?: 'SUPPORT' | 'IDEA' },
  ) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    let token = ws.feedbackPortalToken;
    const enabling = dto.enabled === true || (dto.enabled === undefined && ws.feedbackPortalEnabled);
    if (enabling && !token) {
      token = randomBytes(16).toString('hex');
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        feedbackPortalEnabled: dto.enabled ?? ws.feedbackPortalEnabled,
        feedbackPortalRequireEmail: dto.requireEmail ?? ws.feedbackPortalRequireEmail,
        feedbackPortalTarget: dto.target ?? (ws.feedbackPortalTarget as any) ?? 'SUPPORT',
        ...(token ? { feedbackPortalToken: token } : {}),
      },
    });
    return this.getSettings(workspaceId);
  }

  async regenerateToken(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const token = randomBytes(16).toString('hex');
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { feedbackPortalToken: token },
    });
    return this.getSettings(workspaceId);
  }

  private async findEntity(workspaceId: string, entityType: string, entityId: string) {
    const base = { id: entityId, workspaceId, deletedAt: null };
    switch (entityType) {
      case 'IDEA': return this.prisma.idea.findFirst({ where: base });
      case 'SUPPORT': return this.prisma.support.findFirst({ where: base });
      case 'FEATURE': return this.prisma.feature.findFirst({ where: base });
      default: return null;
    }
  }
}
