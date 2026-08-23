import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { MailService } from '../mail/mail.service';
import { UpsertDashboardDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './dashboards.dto';

// G1-P1-③ 自定义仪表盘 + G1-P2-③ 定时报表订阅（2026-08-16 老板决策：DB 工作区级共享 / 站内通知）
// P1 多仪表盘（2026-08-19）：每工作区多盘 + 订阅邮件投递

/** S 修复：订阅周期白名单（防脏 schedule 进入 cron 判定） */
const SCHEDULE_WHITELIST = ['DAILY', 'WEEKLY'];

@Injectable()
export class DashboardsService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
    private mailService: MailService,
  ) {}

  // ── 仪表盘（P1：每工作区多盘）──
  async listDashboards(workspaceId: string) {
    return this.prisma.dashboard.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDashboardById(workspaceId: string, id: string) {
    const dash = await this.prisma.dashboard.findFirst({ where: { id, workspaceId } });
    if (!dash) throw new NotFoundException('Dashboard not found');
    return dash;
  }

  async createDashboard(workspaceId: string, userId: string, name: string) {
    return this.prisma.dashboard.create({
      data: { workspaceId, name: name || '我的报表', config: { cards: [] } as object, createdById: userId },
    });
  }

  async updateDashboard(workspaceId: string, id: string, dto: UpsertDashboardDto) {
    const dash = await this.prisma.dashboard.findFirst({ where: { id, workspaceId } });
    if (!dash) throw new NotFoundException('Dashboard not found');
    return this.prisma.dashboard.update({
      where: { id },
      data: {
        name: dto.name ?? dash.name,
        config: (dto.config ?? dash.config) as object,
      },
    });
  }

  async deleteDashboard(workspaceId: string, id: string) {
    const dash = await this.prisma.dashboard.findFirst({ where: { id, workspaceId } });
    if (!dash) throw new NotFoundException('Dashboard not found');
    await this.prisma.dashboard.delete({ where: { id } });
    return { ok: true };
  }

  // ── 兼容旧逻辑：单盘（默认盘，upsert）──
  async getDashboard(workspaceId: string) {
    return this.prisma.dashboard.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
  }

  async upsertDashboard(workspaceId: string, userId: string, dto: UpsertDashboardDto) {
    const existing = await this.prisma.dashboard.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
    if (existing) {
      return this.prisma.dashboard.update({
        where: { id: existing.id },
        data: {
          name: dto.name ?? existing.name,
          config: (dto.config ?? (existing.config as object)) as object,
        },
      });
    }
    return this.prisma.dashboard.create({
      data: {
        workspaceId,
        name: dto.name ?? '我的报表',
        config: (dto.config ?? { cards: [] }) as object,
        createdById: userId,
      },
    });
  }

  // ── 订阅 ──
  async listSubscriptions(workspaceId: string) {
    return this.prisma.reportSubscription.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createSubscription(workspaceId: string, userId: string, dto: CreateSubscriptionDto) {
    // S 修复：schedule 白名单校验（DAILY/WEEKLY）
    const schedule = dto.schedule ?? 'DAILY';
    if (!SCHEDULE_WHITELIST.includes(schedule)) {
      throw new BadRequestException(`schedule must be one of ${SCHEDULE_WHITELIST.join('|')}`);
    }
    return this.prisma.reportSubscription.create({
      data: {
        workspaceId,
        name: dto.name,
        schedule,
        createdById: userId,
      },
    });
  }

  async updateSubscription(workspaceId: string, id: string, dto: UpdateSubscriptionDto) {
    const sub = await this.prisma.reportSubscription.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (dto.schedule !== undefined && !SCHEDULE_WHITELIST.includes(dto.schedule)) {
      throw new BadRequestException(`schedule must be one of ${SCHEDULE_WHITELIST.join('|')}`);
    }
    return this.prisma.reportSubscription.update({
      where: { id },
      data: {
        name: dto.name ?? sub.name,
        schedule: dto.schedule ?? sub.schedule,
        enabled: dto.enabled ?? sub.enabled,
      },
    });
  }

  async deleteSubscription(workspaceId: string, id: string) {
    const sub = await this.prisma.reportSubscription.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.prisma.reportSubscription.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Cron 日报聚合：enabled 订阅 → 站内 Notification + 邮件（P1 邮件投递）──
  async runDailyDigest() {
    const subs = await this.prisma.reportSubscription.findMany({
      where: { enabled: true, deletedAt: null },
      include: { createdBy: { select: { email: true } } },
    });
    const today = new Date();
    const isMonday = today.getDay() === 1;
    const eligible = subs.filter((s) => s.schedule !== 'WEEKLY' || isMonday);
    if (eligible.length === 0) return 0;
    // T 修复（2026-08-19）：同一 workspace 的 digest 只聚合一次（原每订阅各 buildDigest = 串行重查询）；
    // 各订阅投递并行执行（Promise.allSettled），单订阅失败不阻塞其余
    const digestCache = new Map<string, string>();
    let delivered = 0;
    const tasks = eligible.map(async (s) => {
      try {
        if (!digestCache.has(s.workspaceId)) {
          digestCache.set(s.workspaceId, await this.buildDigest(s.workspaceId));
        }
        const snippet = digestCache.get(s.workspaceId)!;
        await this.prisma.notification.create({
          data: {
            workspaceId: s.workspaceId,
            userId: s.createdById,
            actorId: s.createdById,
            type: 'REPORT',
            entityType: 'WORKSPACE',
            entityId: s.workspaceId,
            entityTitle: s.name,
            snippet,
          },
        });
        // P1 邮件投递：收件人 = 订阅创建者邮箱（SMTP 未配置时静默跳过）
        if (s.createdBy?.email) {
          await this.mailService.sendReportDigestEmail(s.createdBy.email, s.name, snippet);
        }
        delivered++;
      } catch (e) {
        // 单订阅失败不阻塞其余
        console.error(`[ReportCron] digest failed for ${s.id}: ${(e as Error).message}`);
      }
    });
    await Promise.allSettled(tasks);
    return delivered;
  }

  /** 聚合工作区关键指标 → 一行摘要 */
  async buildDigest(workspaceId: string) {
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    const [velocity, openDefects, totalRuns, passRuns, discovery] = await Promise.all([
      this.reportsService.velocity(workspaceId, 3),
      this.prisma.support.count({
        where: {
          workspaceId,
          type: { in: ['DEFECT', 'BUG'] },
          deletedAt: null,
          status: { notIn: ['CLOSED', 'RESOLVED'] },
        },
      }),
      this.prisma.testRun.count({ where: { workspaceId, createdAt: { gte: since30 } } }),
      this.prisma.testRun.count({ where: { workspaceId, createdAt: { gte: since30 }, status: 'PASS' } }),
      this.reportsService.discoveryReports(workspaceId),
    ]);
    const passRate = totalRuns ? Math.round((passRuns / totalRuns) * 100) : 0;
    return (
      `近 3 迭代完成 ${velocity.totals.points} 点 / ${velocity.totals.count} 任务 · ` +
      `开放缺陷 ${openDefects} · 30 天测试通过率 ${passRate}%（${passRuns}/${totalRuns}）· ` +
      `缺陷转化率 ${discovery.conversion.defectRate}%`
    );
  }
}
