import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * 更新检查通道（方案 B）—— 社区版 + 企业版统一：
 * - 实例侧启动/每日调用 `GET /telemetry/updates/check` 换取最新版本信息
 * - 服务端顺带记录 instanceId/version/edition 心跳（`instanceHeartbeat` 走 upsert，
 *   每实例恒定一行，不会膨胀）
 * 匿名性：instanceId 随机生成并持久化，不含邮箱/用户名/任何实体标题。
 *
 * 2026-11-28 精简（发布软件不提供厂商侧运营能力）：
 * - 移除平台级查询：`GET /telemetry/instances`、`GET /telemetry/summary`
 * - 下线接收端：`POST /telemetry/ping` —— 无消费方，且 telemetry_report 逐条 insert
 *   会无限增长，等于白送一个匿名写库入口
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private instanceId = '';

  constructor(private prisma: PrismaService) {}

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

  // ===== 本实例侧：启动任务 =====

  /**
   * 启动时调用：只做更新检查（方案 B）。
   * 默认开启（除非 DISABLE_UPDATE_CHECK=true），向 UPDATE_CHECK_ENDPOINT 发送
   * instanceId/version/edition，换取「有无新版本」；服务端顺带记录心跳。
   *
   * 2026-11-28 精简：原先还有一段「完整用量上报」（TELEMETRY_ENABLED +
   * TELEMETRY_ENDPOINT → POST /telemetry/ping）。因发布软件不面向厂商运营，
   * 接收端无消费方、且 telemetry_report 逐条 insert 会无限增长，已整体下线。
   */
  async runStartupTasks() {
    await this.updateCheckOnStartup();
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
}
