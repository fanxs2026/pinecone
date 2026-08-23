import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { withCodeRetry } from '../../common/code-generator';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';

/** 主题聚合（P0）：把多条反馈归并为产品主题，显示票数总量，可一键提升为特性/想法 */
@Injectable()
export class ThemesService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
  ) {}

  /** 主题列表 + 关联数 + 票数总量（关联实体票数之和） */
  async findAll(workspaceId: string) {
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // 收集主题下所有 (entityType, entityId)
    const links = await this.prisma.entityTheme.findMany({
      where: { workspaceId, themeId: { in: themes.map((t) => t.id) } },
      select: { themeId: true, entityType: true, entityId: true },
    });
    const entityPairs = links.map((l) => ({ entityType: l.entityType, entityId: l.entityId }));

    // 票数按 (entityType, entityId) 聚合，一次查询
    const voteRows = entityPairs.length
      ? await this.prisma.vote.groupBy({
          by: ['entityType', 'entityId'],
          where: { workspaceId, OR: entityPairs.map((p) => ({ entityType: p.entityType, entityId: p.entityId })) },
          _count: { _all: true },
        })
      : [];
    const voteMap = new Map(voteRows.map((r) => [`${r.entityType}:${r.entityId}`, r._count._all]));

    // 关联实体标题（供主题卡片展示）
    const titleMap = await this.fetchTitles(workspaceId, entityPairs);

    const byTheme = new Map<string, { count: number; votes: number }>();
    for (const l of links) {
      const cur = byTheme.get(l.themeId) ?? { count: 0, votes: 0 };
      cur.count += 1;
      cur.votes += voteMap.get(`${l.entityType}:${l.entityId}`) ?? 0;
      byTheme.set(l.themeId, cur);
    }

    return themes.map((t) => ({
      ...t,
      linkedCount: byTheme.get(t.id)?.count ?? 0,
      voteCount: byTheme.get(t.id)?.votes ?? 0,
      entities: links.filter((l) => l.themeId === t.id).map((l) => ({
        entityType: l.entityType,
        entityId: l.entityId,
        title: titleMap.get(`${l.entityType}:${l.entityId}`) ?? '',
      })),
    }));
  }

  async create(workspaceId: string, dto: { title: string; description?: string; color?: string }) {
    return this.prisma.theme.create({
      data: { workspaceId, title: dto.title, description: dto.description, color: dto.color },
    });
  }

  async update(workspaceId: string, id: string, dto: { title?: string; description?: string; color?: string }) {
    const theme = await this.findOne(workspaceId, id);
    return this.prisma.theme.update({
      where: { id: theme.id },
      data: { ...dto },
    });
  }

  async remove(workspaceId: string, id: string) {
    const theme = await this.findOne(workspaceId, id);
    await this.prisma.theme.update({ where: { id: theme.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  async link(workspaceId: string, themeId: string, entityType: string, entityId: string) {
    const theme = await this.findOne(workspaceId, themeId);
    const entity = await this.findEntity(workspaceId, entityType, entityId);
    if (!entity) throw new NotFoundException('Entity not found');
    try {
      await this.prisma.entityTheme.create({
        data: { workspaceId, themeId: theme.id, entityType: entityType as any, entityId },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: true, alreadyLinked: true };
      throw e;
    }
    return { ok: true, alreadyLinked: false };
  }

  async unlink(workspaceId: string, themeId: string, entityType: string, entityId: string) {
    await this.findOne(workspaceId, themeId);
    await this.prisma.entityTheme.deleteMany({
      where: { workspaceId, themeId, entityType: entityType as any, entityId },
    });
    return { ok: true };
  }

  /** 提升：以主题创建 Feature/Idea，并把主题下关联实体与新品建立 RELATED 关系 */
  async promote(workspaceId: string, themeId: string, userId: string, targetType: 'FEATURE' | 'IDEA', releaseId?: string) {
    const theme = await this.findOne(workspaceId, themeId);
    const links = await this.prisma.entityTheme.findMany({
      where: { workspaceId, themeId: theme.id },
    });

    let created: any;
    if (targetType === 'FEATURE') {
      const maxSort = await this.prisma.feature.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
      created = await withCodeRetry(this.prisma, workspaceId, 'FEATURE', (code) =>
        this.prisma.feature.create({
          data: {
            workspaceId,
            code,
            title: theme.title,
            description: theme.description,
            releaseId: releaseId ?? null,
            createdById: userId,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          },
          include: { release: { select: { id: true, name: true } } },
        }),
      );
    } else {
      created = await withCodeRetry(this.prisma, workspaceId, 'IDEA', (code) =>
        this.prisma.idea.create({
          data: {
            workspaceId,
            code,
            title: theme.title,
            description: theme.description,
            createdById: userId,
          },
          include: { createdBy: { select: { id: true, email: true, name: true } } },
        }),
      );
    }

    // 关联实体 → 新品：RELATED
    if (links.length) {
      await this.prisma.entityRelation.createMany({
        data: links.map((l) => ({
          workspaceId,
          sourceEntityType: l.entityType,
          sourceEntityId: l.entityId,
          targetEntityType: targetType as any,
          targetEntityId: created.id,
          relationType: 'RELATED',
        })),
        skipDuplicates: true,
      });
    }

    await this.activitiesService.log(
      targetType === 'FEATURE' ? EntityType.FEATURE : EntityType.IDEA,
      created.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { action: 'PROMOTED_FROM_THEME', themeId: theme.id } as unknown as Prisma.InputJsonValue,
    );

    return created;
  }

  private async findOne(workspaceId: string, id: string) {
    const theme = await this.prisma.theme.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!theme) throw new NotFoundException('Theme not found');
    return theme;
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

  private async fetchTitles(workspaceId: string, pairs: { entityType: string; entityId: string }[]) {
    const map = new Map<string, string>();
    const byType: Record<string, string[]> = {};
    for (const p of pairs) {
      (byType[p.entityType] ??= []).push(p.entityId);
    }
    const [ideas, supports, features] = await Promise.all([
      byType.IDEA?.length ? this.prisma.idea.findMany({ where: { workspaceId, id: { in: byType.IDEA } }, select: { id: true, title: true } }) : Promise.resolve([]),
      byType.SUPPORT?.length ? this.prisma.support.findMany({ where: { workspaceId, id: { in: byType.SUPPORT } }, select: { id: true, title: true } }) : Promise.resolve([]),
      byType.FEATURE?.length ? this.prisma.feature.findMany({ where: { workspaceId, id: { in: byType.FEATURE } }, select: { id: true, title: true } }) : Promise.resolve([]),
    ]);
    for (const i of ideas) map.set(`IDEA:${i.id}`, i.title);
    for (const s of supports) map.set(`SUPPORT:${s.id}`, s.title);
    for (const f of features) map.set(`FEATURE:${f.id}`, f.title);
    return map;
  }
}
