import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EventPayload {
  [key: string]: unknown;
}

/** outbox 事件行（消费侧视角，字段已 camelCase 化） */
export interface OutboxEvent {
  id: string;
  workspaceId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

/** 崩溃恢复：CLAIMED 超过该时长视为孤儿，重新入队 */
const CLAIM_STALE_MS = 10 * 60_000;

/**
 * 事件总线服务（outbox 模式）。
 *
 * publish()：业务侧在事务内调用，写入 event_outbox（PENDING）。
 * claimPending()：后台 consumer 原子认领 PENDING（B5 修复：UPDATE...RETURNING +
 *   FOR UPDATE SKIP LOCKED，多消费者不重复投递；CLAIMED 超时自动回收防崩溃卡死）。
 * markDelivered/markFailed：成功归档 / 失败指数退避重试（上限后永久 FAILED）。
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 发布一个事件到 outbox。
   * 建议在业务事务内调用（与业务写同一事务，保证"业务成功则事件必达"）。
   */
  async publish(params: {
    workspaceId?: string;
    entityType: string;
    entityId?: string;
    action: string;
    payload?: EventPayload | null;
  }): Promise<void> {
    const { workspaceId, entityType, entityId, action, payload } = params;
    await this.prisma.eventOutbox.create({
      data: {
        workspaceId: workspaceId ?? null,
        entityType,
        entityId: entityId ?? null,
        action,
        payload: (payload as any) ?? undefined,
        status: 'PENDING',
        attempts: 0,
      },
    });
  }

  /**
   * B5 修复：原子认领一批待投递事件。
   * - PENDING（且 nextRetryAt 已到）→ 原子迁移为 CLAIMED（UPDATE...RETURNING + FOR UPDATE SKIP LOCKED），
   *   多消费者/多实例并发时同事件只会被认领一次（消灭重复投递）
   * - 崩溃恢复：CLAIMED 超过 CLAIM_STALE_MS 视为孤儿，重新纳入认领（防卡死）
   * 调用方负责投递并调用 markDelivered/markFailed。
   */
  async claimPending(limit = 100): Promise<OutboxEvent[]> {
    if (limit <= 0) return [];
    const maxAttempts = this.maxAttempts();
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE "event_outbox"
      SET status = 'CLAIMED', "claimedAt" = now()
      WHERE id IN (
        SELECT id FROM "event_outbox"
        WHERE (status = 'PENDING' AND attempts < ${maxAttempts} AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now()))
           OR (status = 'CLAIMED' AND "claimedAt" IS NOT NULL AND "claimedAt" < now() - interval '10 minutes')
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "workspaceId", "entityType", "entityId", action, payload,
                status, attempts, "lastError", "deliveredAt", "createdAt"
    `;
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: r.workspaceId ? String(r.workspaceId) : null,
      entityType: String(r.entityType),
      entityId: r.entityId ? String(r.entityId) : null,
      action: String(r.action),
      payload: r.payload as unknown,
      status: String(r.status),
      attempts: Number(r.attempts),
      lastError: r.lastError ? String(r.lastError) : null,
      deliveredAt: r.deliveredAt ? new Date(r.deliveredAt as string) : null,
      createdAt: new Date(r.createdAt as string),
    }));
  }

  /**
   * 拉取一批待投递事件（兼容旧调用方；不原子，仅用于只读场景）。
   * 新消费循环请使用 claimPending。
   */
  async fetchPending(limit = 100): Promise<any[]> {
    return this.prisma.eventOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markDelivered(id: string): Promise<void> {
    await this.prisma.eventOutbox.update({
      where: { id },
      data: { status: 'DELIVERED', deliveredAt: new Date(), claimedAt: null, nextRetryAt: null },
    });
  }

  /**
   * B5 修复：失败不直接判死——指数退避重试（30s→60s→…→1h 封顶），
   * 达到 WEBHOOK_MAX_ATTEMPTS（默认 8）后标记永久 FAILED（不再重投）。
   */
  async markFailed(id: string, error: string): Promise<void> {
    const maxAttempts = this.maxAttempts();
    const current = await this.prisma.eventOutbox.findUnique({
      where: { id },
      select: { attempts: true },
    });
    const attempts = (current?.attempts ?? 0) + 1;
    if (attempts >= maxAttempts) {
      await this.prisma.eventOutbox.update({
        where: { id },
        data: { status: 'FAILED', lastError: error.slice(0, 2000), attempts, claimedAt: null, nextRetryAt: null },
      });
      this.logger.warn(`Event ${id} permanently failed after ${attempts} attempts: ${error}`);
      return;
    }
    const backoffMs = Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);
    await this.prisma.eventOutbox.update({
      where: { id },
      data: {
        status: 'PENDING',
        lastError: error.slice(0, 2000),
        attempts,
        claimedAt: null,
        nextRetryAt: new Date(Date.now() + backoffMs),
      },
    });
    this.logger.warn(`Event ${id} requeued (attempt ${attempts}/${maxAttempts}, retry in ${Math.round(backoffMs / 1000)}s): ${error}`);
  }

  private maxAttempts(): number {
    const v = Number(process.env.WEBHOOK_MAX_ATTEMPTS || 8);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 8;
  }
}
