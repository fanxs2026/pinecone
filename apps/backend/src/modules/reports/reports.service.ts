import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { enrichScore } from '../../common/scoring';

// 2026-08-15 G1-P0 报表补强：新增 burndown / velocity / timeReports 三端点。
// 全部基于现有 Prisma 聚合（不引入数仓）。Decimal 一律 Number() 转 number 后返回。

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** 概览报表：Sprint 进度 + 测试通过率趋势 + 缺陷创建/关闭趋势 */
  async overview(workspaceId: string, days: number = 30) {
    // P0-P2-6 修复：days 非法（NaN/负值/超界）一律兜底 30，避免 Prisma Invalid Date 500
    const safeDays = Number.isFinite(days) && days > 0 && days <= 3650 ? Math.floor(days) : 30;
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    // ── 1) Sprint 燃尽/进度（各 Sprint 完成比例）──
    const sprints = await this.prisma.sprint.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        stories: { select: { status: true } },
      },
      take: 10,
    });
    const sprintProgress = sprints.map((sp) => {
      const total = sp.stories.length;
      const done = sp.stories.filter((s) => s.status === 'DONE').length;
      return {
        id: sp.id,
        name: sp.name,
        status: sp.status,
        total,
        done,
        percent: total ? Math.round((done / total) * 100) : 0,
      };
    });

    // ── 2) 测试通过率趋势（按天：PASS/FAIL/BLOCKED）──
    const testRuns = await this.prisma.testRun.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { status: true, createdAt: true },
    });
    const testTrend = this.byDay(testRuns, safeDays, (r) => {
      if (r.status === 'PASS') return 'pass';
      if (r.status === 'FAIL') return 'fail';
      return 'other';
    });

    // ── 3) 缺陷趋势（按天：创建 vs 关闭）──
    const defects = await this.prisma.support.findMany({
      where: {
        workspaceId,
        createdAt: { gte: since },
        type: { in: ['DEFECT', 'BUG'] },
      },
      select: { createdAt: true, status: true, updatedAt: true },
    });
    const defectTrend = this.byDay(defects, safeDays, (d) => 'created', (d) =>
      ['CLOSED', 'RESOLVED'].includes(d.status) ? 'closed' : null,
    );

    return {
      days: safeDays,
      sprintProgress,
      testTrend,
      defectTrend,
    };
  }

  /**
   * 迭代燃尽图：Sprint 范围内「剩余工作量」随时间下降 + 理想线。
   * 口径（2026-08-15 产品决策）：
   * - 主指标：storyPoints（标准敏捷口径）；若该 Sprint 所有 story 都未填点数（totalScope=0），
   *   自动降级为 estimateHours，避免全零曲线。
   * - 完成日期：DONE story 以 updatedAt 近似归因到天（sprint 区间外的 updatedAt 不额外 clamp，
   *   早于 startDate 完成的在第 0 天即扣除，晚于 endDate 完成的不计数——见 P2-1 已知局限）。
   * - 剩余[day] = totalScope − 截止 day 已完成的点数/工时。
   * 单位混算（点数+工时）无算术意义，实际工时对比由 timeReports 端点承载。
   */
  async burndown(workspaceId: string, sprintId: string) {
    // P1-1 修复（QA 2026-08-16）：findUnique → findFirst 并带 workspaceId，杜绝跨工作区 IDOR 读取
    const sprint = await this.prisma.sprint.findFirst({
      where: { id: sprintId, workspaceId },
      include: {
        stories: {
          where: { deletedAt: null },
          select: { status: true, storyPoints: true, estimateHours: true, updatedAt: true },
        },
      },
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const start = new Date(sprint.startDate ?? sprint.createdAt);
    const end = new Date(sprint.endDate ?? new Date());
    if (start > end) {
      // 数据异常兜底：日期倒挂时以创建时间重建区间
      start.setDate(end.getDate() - 1);
    }

    // P0-P2-2 时区统一：日期序列按本地日期（此前标签用 UTC toISOString、dayEnd 用本地 setHours，
    // 中国时区下跨日边界有 1 桶偏移——标签与截止点现在同源）
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(fmt(d));
    }
    const totalDays = Math.max(1, dates.length - 1);

    // 主指标选择：有点数用点数，否则用工时
    const totalPoints = sprint.stories.reduce(
      (sum, s) => sum + Number(s.storyPoints ?? 0),
      0,
    );
    const totalHours = sprint.stories.reduce(
      (sum, s) => sum + Number(s.estimateHours ?? 0),
      0,
    );
    const metric: 'points' | 'hours' = totalPoints > 0 ? 'points' : 'hours';
    const totalScope = metric === 'points' ? totalPoints : totalHours;
    const valueOf = (s: (typeof sprint.stories)[number]) =>
      metric === 'points' ? Number(s.storyPoints ?? 0) : Number(s.estimateHours ?? 0);

    // P0-P2-1 clamp：DONE 归因日期 clamp 到 [start, end]（start 前完成→第 0 天扣；end 后完成→末日扣，曲线首尾归零）
    const clampTime = (t: Date) => Math.min(Math.max(t.getTime(), start.getTime()), end.getTime());

    // 每天剩余：totalScope − 截止当日已完成的累计值
    const points = dates.map((label, i) => {
      const [y, m, day] = label.split('-').map(Number);
      const dayEnd = new Date(y, m - 1, day, 23, 59, 59, 999);
      const doneCum = sprint.stories
        .filter((s) => s.status === 'DONE' && new Date(clampTime(s.updatedAt)) <= dayEnd)
        .reduce((sum, s) => sum + valueOf(s), 0);
      const remaining = Math.max(0, totalScope - doneCum);
      const ideal = totalScope * (1 - i / totalDays);
      return {
        date: label.slice(5, 10),
        remaining: this.r2(remaining),
        ideal: this.r2(ideal),
      };
    });

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        status: sprint.status,
        startDate: sprint.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: sprint.endDate?.toISOString().slice(0, 10) ?? null,
      },
      metric,
      totalScope: this.r2(totalScope),
      totalDays,
      points,
    };
  }

  /** 速率图：每 Sprint 完成故事点/任务数 + 滚动均值（预测产能） */
  async velocity(workspaceId: string, window: number = 3) {
    const w = Math.max(1, Math.min(12, window || 3));
    const sprints = await this.prisma.sprint.findMany({
      // P0-P2-3 修复：排除 PLANNED（未开始的迭代不贡献产能，避免 0 点拉低均值并挤占 X 轴）
      where: { workspaceId, status: { not: 'PLANNED' } },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        stories: {
          where: { deletedAt: null },
          select: { status: true, storyPoints: true },
        },
      },
    });

    const items = sprints.map((sp) => {
      const done = sp.stories.filter((s) => s.status === 'DONE');
      const completedPoints = done.reduce((sum, s) => sum + Number(s.storyPoints ?? 0), 0);
      return {
        id: sp.id,
        name: sp.name,
        status: sp.status,
        startDate: sp.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: sp.endDate?.toISOString().slice(0, 10) ?? null,
        completedPoints,
        completedCount: done.length,
        avgPoints: 0,
      };
    });

    // 滚动均值：取当前及之前 w-1 个 Sprint（不足则取全部）
    items.forEach((it, i) => {
      const from = Math.max(0, i - w + 1);
      const slice = items.slice(from, i + 1);
      const sum = slice.reduce((s, x) => s + x.completedPoints, 0);
      it.avgPoints = this.r2(sum / slice.length);
    });

    const totals = items.reduce(
      (acc, it) => {
        acc.sprints += 1;
        acc.points += it.completedPoints;
        acc.count += it.completedCount;
        return acc;
      },
      { sprints: 0, points: 0, count: 0 },
    );

    return {
      window: w,
      items,
      totals: {
        ...totals,
        avgPerSprint: this.r2(items.length ? totals.points / items.length : 0),
      },
    };
  }

  /**
   * 工时报表：预估（Story.estimateHours） vs 实际（TimeEntry.hours）。
   * 归因口径（保证两侧可比，统一从 story 维度归因）：
   * - person：Story.assigneeName（未分配 → '未分配'）；无 story 的工时 → '未关联'
   * - feature：Story.feature.title（无功能 → '未关联功能'）
   * - release：Story.release.name（无发布 → '未排期'）
   * 无 story 的 TimeEntry（entityType/entityId 挂 IDEA/SUPPORT 等）归入 '未关联'。
   */
  async timeReports(workspaceId: string, groupBy: string = 'person', days: number = 90) {
    const gb = ['person', 'feature', 'release'].includes(groupBy) ? groupBy : 'person';
    // P0-P2-4 修复：加时间窗（默认近 90 天），避免全量加载性能风险
    const safeDays = Number.isFinite(days) && days > 0 ? Math.min(3650, Math.floor(days)) : 90;
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    const [stories, entries] = await Promise.all([
      this.prisma.story.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          id: true,
          estimateHours: true,
          assigneeName: true,
          featureId: true,
          releaseId: true,
        },
      }),
      this.prisma.timeEntry.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: {
          hours: true,
          storyId: true,
          userId: true,
        },
      }),
    ]);

    // 维度 key 解析：feature/release 需要标题/名称
    const featureIds = [...new Set(stories.map((s) => s.featureId))];
    const releaseIds = [
      ...new Set(
        stories.map((s) => s.releaseId).filter((x): x is string => !!x),
      ),
    ];
    const [features, releases, storylessUsers] = await Promise.all([
      featureIds.length
        ? this.prisma.feature.findMany({
            where: { id: { in: featureIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      releaseIds.length
        ? this.prisma.release.findMany({
            where: { id: { in: releaseIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      gb === 'person'
        ? this.prisma.user.findMany({
            where: {
              id: {
                in: [
                  ...new Set(
                    entries.filter((e) => !e.storyId).map((e) => e.userId),
                  ),
                ],
              },
            },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const featureTitle = new Map(features.map((f) => [f.id, f.title]));
    const releaseName = new Map(releases.map((r) => [r.id, r.name]));
    const userName = new Map(
      storylessUsers.map((u) => [u.id, u.name || u.email]),
    );

    const storyMap = new Map(stories.map((s) => [s.id, s]));
    const keyOfStory = (s: (typeof stories)[number]): string => {
      if (gb === 'person') return s.assigneeName || '未分配';
      if (gb === 'feature') return (s.featureId && featureTitle.get(s.featureId)) || '未关联功能';
      return (s.releaseId && releaseName.get(s.releaseId)) || '未排期';
    };
    const keyOfStorylessEntry = (e: (typeof entries)[number]): string => {
      if (gb === 'person') return userName.get(e.userId) || '未关联';
      return '未关联';
    };

    const estimated = new Map<string, number>();
    const actual = new Map<string, number>();
    const bump = (m: Map<string, number>, key: string, v: number) => {
      if (v <= 0) return;
      m.set(key, (m.get(key) || 0) + v);
    };

    for (const s of stories) {
      const h = Number(s.estimateHours ?? 0);
      if (h > 0) bump(estimated, keyOfStory(s), h);
    }
    for (const e of entries) {
      const h = Number(e.hours ?? 0);
      if (h <= 0) continue;
      const story = e.storyId ? storyMap.get(e.storyId) : undefined;
      bump(actual, story ? keyOfStory(story) : keyOfStorylessEntry(e), h);
    }

    const keys = new Set([...estimated.keys(), ...actual.keys()]);
    const items = [...keys]
      .map((key) => {
        const estimatedHours = this.r2(estimated.get(key) || 0);
        const actualHours = this.r2(actual.get(key) || 0);
        return {
          key,
          estimatedHours,
          actualHours,
          variance: this.r2(actualHours - estimatedHours),
        };
      })
      .sort((a, b) => b.actualHours - a.actualHours);

    return {
      groupBy: gb,
      items,
      totals: {
        estimatedHours: this.r2([...estimated.values()].reduce((s, v) => s + v, 0)),
        actualHours: this.r2([...actual.values()].reduce((s, v) => s + v, 0)),
      },
    };
  }

  /** 保留两位小数 */
  // ================= G1-P1/P2 报表（2026-08-16）=================

  /**
   * 产品发现报表（差异化，Zentao/ONES 结构性没有）：
   * 投票 Top 实体榜（IDEA/SUPPORT/FEATURE 各自 Top5）+ 主题榜（按主题聚合投票）+ RICE/ICE 评分分布 + 反馈→缺陷转化率
   */
  async discoveryReports(workspaceId: string) {
    // ── 1) 投票聚合（实体维度）──
    const voteRows = await this.prisma.vote.groupBy({
      by: ['entityType', 'entityId'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const voteMap = new Map<string, Map<string, number>>();
    for (const v of voteRows) {
      const t = v.entityType as string;
      if (!voteMap.has(t)) voteMap.set(t, new Map());
      voteMap.get(t)!.set(v.entityId, v._count._all);
    }

    // 批量解析实体标题（只查有投票的实体）
    const entityTypes: Array<'IDEA' | 'SUPPORT' | 'FEATURE'> = ['IDEA', 'SUPPORT', 'FEATURE'];
    const titleMap = new Map<string, Map<string, string>>();
    for (const t of entityTypes) {
      const ids = [...(voteMap.get(t)?.keys() ?? [])];
      if (ids.length === 0) continue;
      const modelKey = (t === 'FEATURE' ? 'feature' : t === 'SUPPORT' ? 'support' : 'idea') as
        | 'feature'
        | 'support'
        | 'idea';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await (this.prisma as any)[modelKey].findMany({
        where: { workspaceId, id: { in: ids }, deletedAt: null },
        select: { id: true, title: true },
      })) as Array<{ id: string; title: string }>;
      const m = new Map<string, string>();
      rows.forEach((r) => m.set(r.id, r.title));
      titleMap.set(t, m);
    }

    const topEntities = entityTypes
      .map((t) => {
        const counts = [...(voteMap.get(t)?.entries() ?? [])]
          .filter(([id]) => titleMap.get(t)?.has(id))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, votes]) => ({ id, title: titleMap.get(t)!.get(id)!, votes }));
        return { type: t, items: counts };
      })
      .filter((g) => g.items.length > 0);

    // ── 2) 主题榜（聚合旗下实体投票；P2-1 修复：过滤已删实体，与 Top 榜口径一致）──
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, deletedAt: null },
      include: { entities: true },
    });
    const linkedIds: Record<string, string[]> = { IDEA: [], SUPPORT: [], FEATURE: [] };
    for (const th of themes) {
      for (const e of th.entities) {
        const t = e.entityType as string;
        if (!linkedIds[t]) linkedIds[t] = [];
        if (!linkedIds[t].includes(e.entityId)) linkedIds[t].push(e.entityId);
      }
    }
    const liveIds = new Map<string, Set<string>>();
    for (const t of entityTypes) {
      const ids = linkedIds[t] ?? [];
      if (ids.length === 0) continue;
      const modelKey = (t === 'FEATURE' ? 'feature' : t === 'SUPPORT' ? 'support' : 'idea') as
        | 'feature'
        | 'support'
        | 'idea';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await (this.prisma as any)[modelKey].findMany({
        where: { workspaceId, id: { in: ids }, deletedAt: null },
        select: { id: true },
      })) as Array<{ id: string }>;
      liveIds.set(t, new Set(rows.map((r) => r.id)));
    }
    const themeList = themes.map((th) => {
      let votes = 0;
      let entityCount = 0;
      for (const e of th.entities) {
        const t = e.entityType as string;
        if (liveIds.get(t) && !liveIds.get(t)!.has(e.entityId)) continue; // 已删实体不计
        const cnt = voteMap.get(t)?.get(e.entityId) ?? 0;
        if (cnt > 0) {
          votes += cnt;
          entityCount++;
        }
      }
      return { id: th.id, title: th.title, color: th.color, entityCount, votes };
    });

    // ── 3) RICE/ICE 评分分布（按 model 分桶）──
    // H 修复（2026-08-19 上线前全检）：RICE+autoReach 的加权分是"读取时用当前票数动态重算"，
    // 这里必须走 enrichScore（复用上方 voteMap 的当前票数），否则用存储快照与线上 UI 分布不一致。
    const scores = await this.prisma.score.findMany({
      where: { workspaceId },
      select: { model: true, weightedScore: true, dimensions: true, entityType: true, entityId: true },
    });
    const byModel = new Map<string, number[]>();
    scores.forEach((s) => {
      const enriched = enrichScore(s, voteMap.get(s.entityType)?.get(s.entityId));
      if (!byModel.has(enriched.model)) byModel.set(enriched.model, []);
      byModel.get(enriched.model)!.push(Number(enriched.weightedScore));
    });
    const buckets = [0, 2, 4, 6, 8];
    const scoreDistribution = [...byModel.entries()].map(([model, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const sum = vals.reduce((a, b) => a + b, 0);
      const dist = buckets.map((b, i) => ({
        label: `${b}-${i === buckets.length - 1 ? '∞' : buckets[i + 1]}`,
        count: vals.filter((v) => v >= b && (i === buckets.length - 1 || v < buckets[i + 1])).length,
      }));
      return {
        model,
        count: vals.length,
        avg: this.r2(sum / vals.length),
        max: this.r2(sorted[sorted.length - 1] ?? 0),
        min: this.r2(sorted[0] ?? 0),
        distribution: dist,
      };
    });

    // ── 4) 反馈→缺陷转化率 + severity/phase 分布 ──
    const supports = await this.prisma.support.findMany({
      where: { workspaceId, deletedAt: null },
      select: { type: true, severity: true, discoveryPhase: true, status: true },
    });
    const total = supports.length;
    const defectRows = supports.filter((s) => s.type === 'DEFECT' || s.type === 'BUG');
    // P2-2 修复：severity 加 UNLABELED 桶（与 quality 报表口径对齐，null severity 不再静默丢弃）
    const severity = { CRITICAL: 0, MAJOR: 0, MINOR: 0, TRIVIAL: 0, UNLABELED: 0 };
    const phases = { TEST: 0, PRODUCTION: 0, CUSTOMER: 0, UNLABELED: 0 };
    defectRows.forEach((d) => {
      const sev = d.severity as keyof typeof severity;
      if (sev && sev in severity) severity[sev]++;
      else severity.UNLABELED++;
      const ph = d.discoveryPhase as keyof typeof phases;
      if (ph && ph in phases) phases[ph]++;
      else phases.UNLABELED++;
    });
    const openDefects = defectRows.filter((d) => !['CLOSED', 'RESOLVED'].includes(d.status)).length;

    return {
      topEntities,
      themes: themeList.sort((a, b) => b.votes - a.votes),
      scoreDistribution,
      conversion: {
        total,
        defectCount: defectRows.length,
        defectRate: total ? this.r2((defectRows.length / total) * 100) : 0,
        openDefects,
        severity,
        phases,
      },
    };
  }

  /**
   * 发布质量报表（release 维度）：测试执行分布/通过率 + 缺陷 severity/逃逸率/MTTR
   * 逃逸口径（2026-08-16 决策）：discoveryPhase=TEST 计测试发现；PRODUCTION/CUSTOMER 计逃逸；NULL 未标注不计
   * MTTR：CLOSED/RESOLVED 缺陷的 (updatedAt - createdAt) 平均小时（无独立关闭时间字段，近似）
   */
  async qualityReports(workspaceId: string, releaseId?: string) {
    // P2-3 修复：去掉 take 截断，全部 release 参与统计（避免旧 release 的 releaseId 返回 selected=null 误导）
    const releases = await this.prisma.release.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'desc' },
    });

    // P 修复（2026-08-19）：去 N+1——原先每 release 各查 2 次（releases×2 查询），改为 2 条批量查询 + 内存分组
    const releaseIds = releases.map((r) => r.id);
    const [allRuns, allDefects] = await Promise.all([
      this.prisma.testRun.findMany({
        where: { workspaceId, releaseId: { in: releaseIds } },
        select: { releaseId: true, status: true, createdAt: true },
      }),
      this.prisma.support.findMany({
        where: { workspaceId, releaseId: { in: releaseIds }, type: { in: ['DEFECT', 'BUG'] }, deletedAt: null },
        select: { releaseId: true, status: true, severity: true, discoveryPhase: true, createdAt: true, updatedAt: true },
      }),
    ]);
    const runsByRelease = new Map<string, typeof allRuns>();
    const defectsByRelease = new Map<string, typeof allDefects>();
    for (const run of allRuns) {
      if (!run.releaseId) continue;
      if (!runsByRelease.has(run.releaseId)) runsByRelease.set(run.releaseId, []);
      runsByRelease.get(run.releaseId)!.push(run);
    }
    for (const d of allDefects) {
      if (!d.releaseId) continue;
      if (!defectsByRelease.has(d.releaseId)) defectsByRelease.set(d.releaseId, []);
      defectsByRelease.get(d.releaseId)!.push(d);
    }
    const stats = releases.map((r) => ({
      release: r,
      runs: runsByRelease.get(r.id) ?? [],
      defects: defectsByRelease.get(r.id) ?? [],
    }));

    const items = stats.map(({ release: r, runs, defects }) => {
      const countBy = (arr: Array<{ status?: string | null }>, key: string) =>
        arr.filter((x) => x.status === key).length;
      const testStats = {
        total: runs.length,
        pass: countBy(runs, 'PASS'),
        fail: countBy(runs, 'FAIL'),
        blocked: countBy(runs, 'BLOCKED'),
        untested: countBy(runs, 'UNTESTED'),
        passRate: runs.length ? this.r2((countBy(runs, 'PASS') / runs.length) * 100) : 0,
      };
      const severity = { CRITICAL: 0, MAJOR: 0, MINOR: 0, TRIVIAL: 0, UNLABELED: 0 };
      defects.forEach((d) => {
        const sev = d.severity as keyof typeof severity;
        if (sev && sev in severity) severity[sev]++;
        else severity.UNLABELED++;
      });
      const testFound = defects.filter((d) => d.discoveryPhase === 'TEST').length;
      const escaped = defects.filter((d) => d.discoveryPhase === 'PRODUCTION' || d.discoveryPhase === 'CUSTOMER').length;
      const closedDefects = defects.filter((d) => ['CLOSED', 'RESOLVED'].includes(d.status));
      const mttrMs =
        closedDefects.length > 0
          ? closedDefects.reduce((sum, d) => sum + (d.updatedAt.getTime() - d.createdAt.getTime()), 0) /
            closedDefects.length
          : 0;
      return {
        id: r.id,
        name: r.name,
        version: r.version,
        status: r.status,
        startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
        productionDate: r.productionDate?.toISOString().slice(0, 10) ?? null,
        testStats,
        defects: {
          total: defects.length,
          open: defects.filter((d) => !['CLOSED', 'RESOLVED'].includes(d.status)).length,
          severity,
          testFound,
          escaped,
          escapeRate: testFound + escaped > 0 ? this.r2((escaped / (testFound + escaped)) * 100) : 0,
          mttrHours: this.r2(mttrMs / 3600000),
        },
      };
    });

    let selected: (typeof items)[number] | null = null;
    if (releaseId) {
      selected = items.find((i) => i.id === releaseId) ?? null;
    }
    return { releases: items, selected };
  }

  /**
   * 透视表/交叉分析：实体 × 行维度 × 列维度 计数矩阵
   * 维度白名单（service 二次校验，防任意字段注入）：
   *   STORY: status / priority / assigneeName / kind
   *   SUPPORT: status / severity / type / discoveryPhase
   *   IDEA: status / assigneeName / category
   */
  async pivotReports(workspaceId: string, dto: { entity: string; rowField: string; colField: string }) {
    const DIMENSIONS: Record<string, string[]> = {
      STORY: ['status', 'priority', 'assigneeName', 'kind'],
      SUPPORT: ['status', 'severity', 'type', 'discoveryPhase'],
      IDEA: ['status', 'assigneeName', 'category'],
    };
    const dims = DIMENSIONS[dto.entity];
    if (!dims) throw new NotFoundException('Unsupported pivot entity');
    if (!dims.includes(dto.rowField) || !dims.includes(dto.colField) || dto.rowField === dto.colField) {
      throw new NotFoundException('Invalid pivot dimensions');
    }
    const modelName = (dto.entity === 'STORY' ? 'story' : dto.entity === 'SUPPORT' ? 'support' : 'idea') as
      | 'story'
      | 'support'
      | 'idea';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await (this.prisma as any)[modelName].findMany({
      where: { workspaceId, deletedAt: null },
      select: { [dto.rowField]: true, [dto.colField]: true },
    })) as Array<Record<string, string | null>>;

    const disp = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : '(none)');
    // OBS-1 修复：按出现顺序（Set 保持插入序），(none) 置末（此前字典序会把 (none) 排首位）
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const cell = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const rk = disp(r[dto.rowField]);
      const ck = disp(r[dto.colField]);
      rowSet.add(rk);
      colSet.add(ck);
      if (!cell.has(rk)) cell.set(rk, new Map());
      const m = cell.get(rk)!;
      m.set(ck, (m.get(ck) ?? 0) + 1);
    }
    const sortKeys = (a: string, b: string) => (a === '(none)' ? 1 : b === '(none)' ? -1 : 0);
    const rowKeys = [...rowSet].sort(sortKeys);
    const colKeys = [...colSet].sort(sortKeys);

    const matrix = rowKeys.map((rk) => ({
      rowKey: rk,
      cells: colKeys.map((ck) => ({ colKey: ck, value: cell.get(rk)?.get(ck) ?? 0 })),
      rowTotal: [...(cell.get(rk)?.values() ?? [])].reduce((a, b) => a + b, 0),
    }));
    const colTotals = colKeys.map((ck) => ({
      colKey: ck,
      value: rowKeys.reduce((sum, rk) => sum + (cell.get(rk)?.get(ck) ?? 0), 0),
    }));
    const grandTotal = matrix.reduce((s, m) => s + m.rowTotal, 0);

    return {
      entity: dto.entity,
      rowField: dto.rowField,
      colField: dto.colField,
      rowKeys,
      colKeys,
      matrix,
      colTotals,
      grandTotal,
    };
  }

  private r2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** 按天分桶聚合 */
  private byDay<T extends { createdAt: Date }>(
    rows: T[],
    days: number,
    bucket: (r: T) => string,
    closedBucket?: (r: T) => string | null,
  ) {
    const labels: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toISOString().slice(5, 10));
    }
    const map = new Map<string, Record<string, number>>();
    labels.forEach((l) => map.set(l, {}));
    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(5, 10);
      const entry = map.get(key);
      if (!entry) continue;
      const b = bucket(r);
      entry[b] = (entry[b] || 0) + 1;
      if (closedBucket) {
        const cb = closedBucket(r);
        if (cb) entry[cb] = (entry[cb] || 0) + 1;
      }
    }
    return labels.map((label) => ({ date: label, ...map.get(label)! }));
  }

  // ===== I5 测试覆盖率报表（2026-08-18 P1，竞品差距 G5）=====

  /**
   * 测试覆盖率（口径：Story 的 TestCase 存在 PASS TestRun 才算已覆盖，老板 08-18 拍板）。
   * 返回：总量/已覆盖/覆盖率 + 按 release 分组 + 按 TestCase.type 分布 + 未覆盖 Story TOP20。
   */
  async coverageReport(workspaceId: string, releaseId?: string) {
    const releaseWhere = releaseId ? { id: releaseId } : {};
    const [releases, stories] = await Promise.all([
      this.prisma.release.findMany({
        where: { workspaceId, ...releaseWhere },
        select: { id: true, name: true, version: true },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.story.findMany({
        where: { workspaceId, deletedAt: null, ...(releaseId ? { releaseId } : {}) },
        select: { id: true, code: true, title: true, releaseId: true },
      }),
    ]);

    // 有 PASS TestRun 的 TestCase → storyId 集合（distinct testCaseId 防重复 run）
    const passedRuns = await this.prisma.testRun.findMany({
      where: { workspaceId, status: 'PASS', testCase: { storyId: { not: null } } },
      select: { testCase: { select: { storyId: true } } },
      distinct: ['testCaseId'],
    });
    const coveredStoryIds = new Set<string>(
      passedRuns.map((r) => r.testCase.storyId).filter((v): v is string => Boolean(v)),
    );

    // 全量 ACTIVE TestCase（storyId + type）→ 类型分布
    const testCases = await this.prisma.testCase.findMany({
      where: { workspaceId, deletedAt: null, storyId: { not: null }, status: 'ACTIVE' },
      select: { type: true, storyId: true },
    });
    const typeTotal = new Map<string, number>();
    const typeCovered = new Map<string, number>();
    for (const tc of testCases) {
      typeTotal.set(tc.type, (typeTotal.get(tc.type) || 0) + 1);
      if (tc.storyId && coveredStoryIds.has(tc.storyId)) {
        typeCovered.set(tc.type, (typeCovered.get(tc.type) || 0) + 1);
      }
    }

    const byRelease = releases.map((r) => {
      const list = stories.filter((s) => s.releaseId === r.id);
      const covered = list.filter((s) => coveredStoryIds.has(s.id)).length;
      return {
        id: r.id,
        name: r.name,
        version: r.version,
        total: list.length,
        covered,
        rate: list.length ? this.r2((covered / list.length) * 100) : 0,
      };
    });

    const covered = stories.filter((s) => coveredStoryIds.has(s.id)).length;
    const releaseMap = new Map(releases.map((r) => [r.id, r.name]));
    const uncovered = stories
      .filter((s) => !coveredStoryIds.has(s.id))
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        release: s.releaseId ? releaseMap.get(s.releaseId) || null : null,
      }));

    return {
      total: stories.length,
      covered,
      coverageRate: stories.length ? this.r2((covered / stories.length) * 100) : 0,
      byRelease,
      byType: [...typeTotal.entries()].map(([type, total]) => ({
        type,
        total,
        covered: typeCovered.get(type) || 0,
        rate: total ? this.r2(((typeCovered.get(type) || 0) / total) * 100) : 0,
      })),
      uncovered,
    };
  }
}
