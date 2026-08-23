import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// 各实体"未完成 / 进行中"状态集合（用于统计卡片 open 数）
const OPEN_STATUS: Record<string, string[]> = {
  IDEA: ['OPEN', 'IN_REVIEW', 'PLANNED', 'DRAFT'],
  FEATURE: ['OPEN', 'READY_FOR_GROOMING', 'DECOMPOSITION', 'IN_DEVELOPING', 'IN_VERIFICATION'],
  STORY: ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED'],
  SUPPORT: ['OPEN', 'IN_REVIEW'],
  RELEASE: ['PLANNING', 'IN_PROGRESS'],
};

interface EntityMeta {
  id: string;
  code: string | null;
  title: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(workspaceId: string) {
    const now = new Date();
    // 本周一 00:00（getDay()=0 是周日 → 归 7）
    const day = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day + 1);
    weekStart.setHours(0, 0, 0, 0);
    // 本月 1 号 00:00
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const p = this.prisma;
    const [ideas, features, stories, supports, releases, weekCreated, hoursAgg, recentActivities] =
      await Promise.all([
        this.countOpen(p, 'idea', workspaceId, OPEN_STATUS.IDEA),
        this.countOpen(p, 'feature', workspaceId, OPEN_STATUS.FEATURE),
        this.countOpen(p, 'story', workspaceId, OPEN_STATUS.STORY),
        this.countOpen(p, 'support', workspaceId, OPEN_STATUS.SUPPORT),
        this.countOpen(p, 'release', workspaceId, OPEN_STATUS.RELEASE),
        this.countWeekCreated(p, workspaceId, weekStart),
        p.timeEntry.aggregate({
          where: { workspaceId, date: { gte: monthStart } },
          _sum: { hours: true },
        }),
        p.activity.findMany({
          where: { workspaceId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, email: true, name: true } } },
        }),
      ]);

    // 批量查最近活动涉及实体的 code/title（避免 N+1）
    const byType = (type: string) =>
      recentActivities.filter((a) => a.entityType === type).map((a) => a.entityId);
    const [ideaMap, featureMap, storyMap, supportMap] = await Promise.all([
      this.idMap(p.idea, byType('IDEA')),
      this.idMap(p.feature, byType('FEATURE')),
      this.idMap(p.story, byType('STORY')),
      this.idMap(p.support, byType('SUPPORT')),
    ]);
    const findMeta = (type: string, id: string): EntityMeta | null => {
      const m =
        type === 'IDEA'
          ? ideaMap.get(id)
          : type === 'FEATURE'
            ? featureMap.get(id)
            : type === 'STORY'
              ? storyMap.get(id)
              : supportMap.get(id);
      return m ?? null;
    };

    return {
      entities: { ideas, features, stories, supports, releases },
      thisWeek: { created: weekCreated },
      thisMonth: { hours: Number(hoursAgg._sum.hours ?? 0) },
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        entityCode: findMeta(a.entityType, a.entityId)?.code ?? null,
        entityTitle: findMeta(a.entityType, a.entityId)?.title ?? null,
        action: a.action,
        metadata: a.metadata,
        createdAt: a.createdAt,
        user: a.user ? { id: a.user.id, email: a.user.email, name: a.user.name } : null,
      })),
    };
  }

  private async countOpen(
    p: PrismaService,
    model: 'idea' | 'feature' | 'story' | 'support' | 'release',
    workspaceId: string,
    statuses: string[],
  ) {
    const d = p[model] as unknown as {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
    const [total, open] = await Promise.all([
      d.count({ where: { workspaceId } }),
      d.count({ where: { workspaceId, status: { in: statuses } } }),
    ]);
    return { total, open };
  }

  private async countWeekCreated(p: PrismaService, workspaceId: string, weekStart: Date) {
    const where = { workspaceId, createdAt: { gte: weekStart } };
    const [i, f, s, su] = await Promise.all([
      p.idea.count({ where }),
      p.feature.count({ where }),
      p.story.count({ where }),
      p.support.count({ where }),
    ]);
    return i + f + s + su;
  }

  private async idMap(
    model: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: { id: true; code: true; title: true };
      }) => Promise<EntityMeta[]>;
    },
    ids: string[],
  ) {
    const items = ids.length
      ? await model.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true } })
      : [];
    return new Map(items.map((x) => [x.id, x]));
  }
}
