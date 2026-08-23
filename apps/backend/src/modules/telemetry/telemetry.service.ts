import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * 用量统计（P3-B）：
 * - 接收端：POST /telemetry/ping（公开）——供应商侧聚合各实例的匿名上报
 * - 上报端：本实例启动时若配置 TELEMETRY_ENDPOINT + TELEMETRY_ENABLED=true，则匿名上报
 * 匿名性：instanceId 随机生成持久化，不包含邮箱/用户名/任何实体标题。
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private instanceId = '';

  constructor(private prisma: PrismaService) {}

  // ===== 接收端 =====

  async record(body: {
    instanceId: string;
    edition?: string;
    version?: string;
    counts?: Record<string, number>;
  }) {
    if (!body?.instanceId) return { ok: false, reason: 'missing instanceId' };
    await this.prisma.telemetryReport.create({
      data: {
        instanceId: body.instanceId,
        edition: body.edition || 'COMMUNITY',
        version: body.version || null,
        counts: (body.counts ?? {}) as any,
      },
    });
    return { ok: true };
  }

  /** 聚合视图：总实例数 / 近 30 天活跃 / 版本分布（供管理端查看） */
  async summary() {
    const [totalInstances, totalReports, active30d, editions, recent] = await Promise.all([
      this.prisma.telemetryReport.groupBy({
        by: ['instanceId'],
        _count: { _all: true },
      }),
      this.prisma.telemetryReport.count(),
      this.prisma.telemetryReport.findMany({
        where: { reportedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
        distinct: ['instanceId'],
        select: { instanceId: true },
      }),
      this.prisma.telemetryReport.groupBy({
        by: ['edition'],
        _count: { _all: true },
      }),
      this.prisma.telemetryReport.findMany({
        orderBy: { reportedAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      totalInstances: totalInstances.length,
      totalReports,
      activeInstances30d: active30d.length,
      editions: editions.map((e) => ({ edition: e.edition, reports: e._count._all })),
      recent: recent.map((r) => ({
        id: r.id,
        instanceId: r.instanceId.slice(0, 8),
        edition: r.edition,
        version: r.version,
        counts: r.counts as Record<string, number>,
        reportedAt: r.reportedAt,
      })),
    };
  }

  // ===== 方案 B：更新检查通道（社区版+企业版统一）=====

  /**
   * GET /updates/check —— 实例侧调用：
   * 1) 顺带记录心跳（instanceId/version/edition/lastSeenAt）→ 活跃数据
   * 2) 返回最新版本信息（客户感知为「检查更新」，受益者是他自己）
   */
  async checkUpdate(query: { instanceId?: string; version?: string; edition?: string }) {
    if (query.instanceId) {
      const existing = await this.prisma.instanceHeartbeat.findUnique({
        where: { instanceId: query.instanceId },
      });
      if (existing) {
        await this.prisma.instanceHeartbeat.update({
          where: { instanceId: query.instanceId },
          data: {
            version: query.version || existing.version,
            edition: (query.edition || existing.edition).toUpperCase(),
            lastSeenAt: new Date(),
            checkCount: { increment: 1 },
          },
        });
      } else {
        await this.prisma.instanceHeartbeat.create({
          data: {
            instanceId: query.instanceId,
            version: query.version || null,
            edition: (query.edition || 'COMMUNITY').toUpperCase(),
          },
        });
      }
    }

    // 最新版本：优先取配置，缺省用当前部署版本
    const latest = process.env.UPDATE_LATEST_VERSION || '3.1.0';
    const changelog = process.env.UPDATE_CHANGELOG || 'Check the release notes on the official site.';
    return {
      latest,
      changelog,
      updateAvailable: query.version ? this.isNewer(latest, query.version) : false,
      checkIntervalHours: 24,
    };
  }

  private isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
    const a = parse(latest);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  /** 管理端聚合：活跃实例列表（lastSeen 倒序） */
  async listInstances({ page = 1, pageSize = 50 }: { page?: number; pageSize?: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.instanceHeartbeat.findMany({
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.instanceHeartbeat.count(),
    ]);
    const active30d = await this.prisma.instanceHeartbeat.count({
      where: { lastSeenAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });
    const active7d = await this.prisma.instanceHeartbeat.count({
      where: { lastSeenAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    });
    return { items, total, active30d, active7d, page, pageSize };
  }

  // ===== 上报端 =====

  /**
   * 启动时调用：
   * 1) 更新检查（方案 B）——默认开启（除非 DISABLE_UPDATE_CHECK=true），向 UPDATE_CHECK_ENDPOINT
   *    发送 instanceId/version，换取「有无新版本」；服务器顺带记录心跳
   * 2) 完整用量上报——仅当 TELEMETRY_ENABLED=true + TELEMETRY_ENDPOINT（客户可关）
   */
  async reportOnStartup() {
    await this.updateCheckOnStartup();
    const enabled = process.env.TELEMETRY_ENABLED === 'true';
    const endpoint = process.env.TELEMETRY_ENDPOINT;
    if (!enabled || !endpoint) return;

    const instanceId = this.getOrCreateInstanceId();
    const counts = await this.collectCounts();
    const payload = {
      instanceId,
      edition: (process.env.EDITION || 'COMMUNITY').toUpperCase(),
      version: process.env.APP_VERSION || 'dev',
      counts,
    };

    try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/telemetry/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      this.logger.log(`Telemetry reported (${res.status})`);
    } catch (err: any) {
      this.logger.warn(`Telemetry report failed: ${err?.message}`);
    }
  }

  /** 方案 B：更新检查（默认开启，客户可 DISABLE_UPDATE_CHECK=true 关闭） */
  private async updateCheckOnStartup() {
    if (process.env.DISABLE_UPDATE_CHECK === 'true') return;
    const endpoint = process.env.UPDATE_CHECK_ENDPOINT;
    if (!endpoint) return;

    const instanceId = this.getOrCreateInstanceId();
    const version = process.env.APP_VERSION || 'dev';
    const edition = (process.env.EDITION || 'COMMUNITY').toUpperCase();
    try {
      const url = `${endpoint.replace(/\/$/, '')}/telemetry/updates/check?instanceId=${instanceId}&version=${version}&edition=${edition}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        if (data?.updateAvailable) {
          this.logger.log(`Update available: ${data.latest} (current ${version})`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Update check failed: ${err?.message}`);
    }
  }

  private getOrCreateInstanceId(): string {
    if (this.instanceId) return this.instanceId;
    const file = join(process.cwd(), '.telemetry-instance-id');
    if (existsSync(file)) {
      this.instanceId = readFileSync(file, 'utf8').trim();
    } else {
      this.instanceId = randomBytes(16).toString('hex');
      try {
        writeFileSync(file, this.instanceId, 'utf8');
      } catch {
        // 只读环境忽略
      }
    }
    return this.instanceId;
  }

  private async collectCounts() {
    const [workspaces, stories, features, ideas, supports, members] = await Promise.all([
      this.prisma.workspace.count(),
      this.prisma.story.count({ where: { deletedAt: null } }),
      this.prisma.feature.count({ where: { deletedAt: null } }),
      this.prisma.idea.count({ where: { deletedAt: null } }),
      this.prisma.support.count({ where: { deletedAt: null } }),
      this.prisma.workspaceMember.count(),
    ]);
    return { workspaces, stories, features, ideas, supports, members };
  }
}
