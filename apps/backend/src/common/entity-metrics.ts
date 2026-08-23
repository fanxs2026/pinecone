// P0：实体列表/详情聚合投票数与评分（复用 loggedHours 的 groupBy 批量模式，避免 N+1）
import type { PrismaService } from '../prisma/prisma.service';
import { enrichScore } from './scoring';

/** 指标过滤（排序/主题/最低分）时全量拉取的上限保护 */
export const METRIC_FETCH_LIMIT = 5000;

export async function attachVotesAndScores(
  prisma: PrismaService,
  workspaceId: string,
  entityType: 'IDEA' | 'SUPPORT' | 'FEATURE',
  items: any[],
): Promise<any[]> {
  const ids = items.map((i) => i.id);
  if (!ids.length) return items;

  const [voteRows, scoreRows, themeRows, themeList] = await Promise.all([
    prisma.vote.groupBy({
      by: ['entityId'],
      where: { workspaceId, entityType: entityType as any, entityId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.score.findMany({ where: { workspaceId, entityType: entityType as any, entityId: { in: ids } } }),
    prisma.entityTheme.findMany({ where: { workspaceId, entityType: entityType as any, entityId: { in: ids } } }),
    prisma.theme.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true, title: true } }),
  ]);

  const voteMap = new Map(voteRows.map((r) => [r.entityId, r._count._all]));
  // 2026-08-15：评分读取时动态重算（RICE 自动 reach → 当前票数），不再是保存时快照
  const scoreMap = new Map(scoreRows.map((r) => [r.entityId, enrichScore(r, voteMap.get(r.entityId))]));
  const themeMap = new Map(themeList.map((t) => [t.id, t.title]));
  const themeByEntity = new Map<string, { id: string; title: string }[]>();
  for (const tr of themeRows) {
    const list = themeByEntity.get(tr.entityId) ?? [];
    list.push({ id: tr.themeId, title: themeMap.get(tr.themeId) ?? '' });
    themeByEntity.set(tr.entityId, list);
  }

  return items.map((item) => ({
    ...item,
    voteCount: voteMap.get(item.id) ?? 0,
    score: scoreMap.get(item.id) ?? null,
    themes: themeByEntity.get(item.id) ?? [],
  }));
}

/** 详情页单条：附加 voteCount + score + themes */
export async function attachVotesAndScoresToSingle(
  prisma: PrismaService,
  workspaceId: string,
  entityType: 'IDEA' | 'SUPPORT' | 'FEATURE',
  item: any,
): Promise<any> {
  if (!item) return item;
  const [enriched] = await attachVotesAndScores(prisma, workspaceId, entityType, [item]);
  return enriched;
}

/** 列表内过滤/排序（票数、评分、主题）——P0 简化版：分页后再处理，主题/最低分过滤为近似 */
export function filterAndSortByMetrics(
  items: any[],
  opts: { sortBy?: string; themeId?: string; minScore?: number },
): any[] {
  let result = items;
  if (opts.themeId) {
    result = result.filter((i) => (i.themes ?? []).some((t: any) => t.id === opts.themeId));
  }
  if (opts.minScore !== undefined && opts.minScore > 0) {
    result = result.filter((i) => (i.score?.weightedScore ?? 0) >= opts.minScore!);
  }
  if (opts.sortBy === 'voteCount') {
    result = [...result].sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0));
  } else if (opts.sortBy === 'priorityScore') {
    result = [...result].sort((a, b) => (b.score?.weightedScore ?? -1) - (a.score?.weightedScore ?? -1));
  }
  return result;
}
