import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';

const ENTITY_TYPES = ['STORY', 'IDEA', 'FEATURE', 'SUPPORT', 'RELEASE'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

/** 访客分享（P2-⑭）：工作区成员创建分享链接，无账号访客凭 token 只读查看实体/路线图 */
@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {}

  // ===== 成员侧：创建/撤销 =====

  async create(
    workspaceId: string,
    entityType: string,
    entityId: string,
    userId: string,
    days?: number,
    opts?: { brandTitle?: string; brandColor?: string; viewMode?: string },
  ) {
    if (!ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new BadRequestException('Invalid entity type');
    }
    // 校验实体存在且属于该工作区
    const entity = await this.findEntity(workspaceId, entityType, entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    const viewMode = opts?.viewMode || 'FULL';
    if (!['SIMPLE', 'FULL', 'NARRATIVE'].includes(viewMode)) {
      throw new BadRequestException('Invalid viewMode');
    }

    // 已存在且品牌配置相同则复用
    const existing = await this.prisma.shareLink.findFirst({
      where: { workspaceId, entityType, entityId, viewMode },
    });
    if (existing) {
      return { token: existing.token, expiresAt: existing.expiresAt };
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = days ? new Date(Date.now() + days * 86400000) : null;
    await this.prisma.shareLink.create({
      data: {
        workspaceId, entityType, entityId, token, expiresAt, createdById: userId,
        brandTitle: opts?.brandTitle?.trim() || null,
        brandColor: opts?.brandColor || null,
        viewMode,
      },
    });
    return { token, expiresAt };
  }

  async revoke(workspaceId: string, entityType: string, entityId: string) {
    await this.prisma.shareLink.deleteMany({ where: { workspaceId, entityType, entityId } });
    return { ok: true };
  }

  // ===== 公开侧：无鉴权读取（@Public）=====

  /** RELEASE 分享：按功能状态分组（P1-D 叙事视图） */
  private groupFeatures(features: any[]) {
    const groups = [
      { key: 'exploring', label: '探索中', statuses: ['OPEN', 'READY_FOR_GROOMING'], items: [] as any[] },
      { key: 'building', label: '开发中', statuses: ['DECOMPOSITION', 'IN_DEVELOPING'], items: [] as any[] },
      { key: 'verifying', label: '验证中', statuses: ['IN_VERIFICATION'], items: [] as any[] },
      { key: 'shipped', label: '已发布', statuses: ['CLOSED'], items: [] as any[] },
      { key: 'other', label: '其他', statuses: [], items: [] as any[] },
    ];
    for (const f of features) {
      const g = groups.find((gr) => gr.statuses.includes(f.status));
      (g || groups[groups.length - 1]).items.push(f);
    }
    return groups.filter((g) => g.items.length > 0);
  }

  async view(token: string, includeSiblings = false) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    // F-7 修复（2026-08-19 上线前全检）：不存在与过期统一返回 404，避免枚举（403/404 差异化泄露链接存在性）
    if (!link || (link.expiresAt && link.expiresAt < new Date())) {
      throw new NotFoundException('Share link not found');
    }
    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 } },
    });

    const entity = await this.findEntity(link.workspaceId, link.entityType, link.entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: link.workspaceId },
      select: { id: true, name: true, slug: true },
    });

    const result: Record<string, any> = {
      workspaceName: workspace?.name ?? '',
      entityType: link.entityType,
      entity,
      // P2 品牌化路线图分享
      brandTitle: link.brandTitle ?? null,
      brandColor: link.brandColor ?? null,
      viewMode: link.viewMode ?? 'FULL',
    };

    // P1-D：RELEASE 分享增强（叙事分组 + 相邻 release 聚合）
    if (link.entityType === 'RELEASE') {
      const rel = entity as any; // RELEASE 分支已含 features 关联（联合类型收窄用断言）
      result.featureGroups = this.groupFeatures(rel.features ?? []);
      result.releaseMeta = { milestone: rel.milestone ?? null, narrative: rel.narrative ?? null };
      delete rel.features; // 避免重复（已按组返回）
      if (includeSiblings) {
        const siblings = await this.prisma.release.findMany({
          where: { workspaceId: link.workspaceId },
          select: { id: true, name: true, version: true, status: true, milestone: true, startDate: true, endDate: true, _count: { select: { features: true } } },
          orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
        });
        result.releases = siblings;
      }
    }

    return result;
  }

  private async findEntity(workspaceId: string, entityType: string, entityId: string) {
    const base = { where: { id: entityId, workspaceId, deletedAt: null } };
    switch (entityType) {
      case 'STORY':
        return this.prisma.story.findFirst({ ...base, include: { assignee: { select: { name: true, email: true } }, feature: { select: { id: true, title: true } } } });
      case 'IDEA':
        return this.prisma.idea.findFirst({ ...base, include: { assignee: { select: { name: true, email: true } } } });
      case 'FEATURE':
        return this.prisma.feature.findFirst({ ...base, include: { assignee: { select: { name: true, email: true } } } });
      case 'SUPPORT':
        return this.prisma.support.findFirst({ ...base, include: { assignee: { select: { name: true, email: true } } } });
      case 'RELEASE':
        return this.prisma.release.findFirst({
          where: { id: entityId, workspaceId },
          include: {
            features: {
              where: { deletedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: { id: true, code: true, title: true, status: true, priority: true, description: true },
            },
          },
        });
      default:
        return null;
    }
  }
}
