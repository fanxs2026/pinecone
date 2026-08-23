import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MailService } from '../mail/mail.service';

/**
 * 通知中心服务（P0-①：@提及 + 指派变更）。
 * - 站内通知落库 + WS 实时推送（realtime.emitToUser）
 * - @提及/MENTION 额外发邮件（SMTP 未配置时静默跳过）
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** P1-D：voter 状态通知频控（实体 → 最近通知时间戳；1 小时节流，终态必发） */
  private readonly voterNotifyMap = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private mail: MailService,
  ) {}

  // ===== 查询 =====

  async listMine(
    workspaceId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    const where = { workspaceId, userId };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async unreadCount(workspaceId: string, userId: string) {
    const n = await this.prisma.notification.count({
      where: { workspaceId, userId, read: false },
    });
    return { count: n };
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(workspaceId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { workspaceId, userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  // ===== 写 =====

  /** 创建通知 + WS 推送 + 邮件（可选） */
  async notify(params: {
    workspaceId: string;
    userId: string; // 接收者
    actorId: string;
    type: 'MENTION' | 'ASSIGNED' | 'STATUS_CHANGED';
    entityType: string;
    entityId: string;
    entityTitle?: string;
    snippet?: string;
    sendEmail?: boolean;
  }) {
    const { workspaceId, userId, actorId, type, entityType, entityId, sendEmail } = params;
    if (userId === actorId) return; // 不通知自己

    const n = await this.prisma.notification.create({
      data: {
        workspaceId,
        userId,
        actorId,
        type,
        entityType,
        entityId,
        entityTitle: params.entityTitle ?? null,
        snippet: params.snippet ? params.snippet.slice(0, 200) : null,
      },
      include: { actor: { select: { id: true, email: true, name: true } } },
    });

    // WS 实时推送
    this.realtime.emitToUser(userId, 'notification:new', n);

    // 邮件（MENTION 默认发；ASSIGNED 可配）
    if (sendEmail !== false) {
      const recipient = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (recipient?.email) {
        const actorName = n.actor?.name || n.actor?.email || '同事';
        const typeLabel =
          type === 'MENTION' ? '有人在评论中提到了您'
          : type === 'ASSIGNED' ? '您被分配了任务'
          : '您投票的条目状态已变更';
        const link = `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:6173'}/${entityType.toLowerCase()}/${entityId}`;
        void this.mail.sendNotificationEmail(recipient.email, {
          actorName,
          typeLabel,
          entityTitle: params.entityTitle || entityId,
          snippet: params.snippet,
          link,
        });
      }
    }
    return n;
  }

  /** 解析文本中的 @提及 → 通知被提及成员（排除操作者自己） */
  async parseMentionsAndNotify(params: {
    workspaceId: string;
    text: string;
    actorId: string;
    entityType: string;
    entityId: string;
    entityTitle?: string;
  }) {
    const { workspaceId, text, actorId, entityType, entityId } = params;
    const entityTitle =
      params.entityTitle ?? (await this.resolveEntityTitle(workspaceId, entityType, entityId));
    const tokens = text.match(/@([^\s@，。；：！？,!?；]+)/g) || [];
    if (tokens.length === 0) return [];

    // 提取候选名（@后面的部分，忽略纯数字/过短）
    const candidates = [...new Set(tokens.map((t) => t.slice(1).trim()).filter((t) => t.length >= 1))];
    if (candidates.length === 0) return [];

    // 从工作区成员匹配（name 精确/前缀 或 email 前缀）
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 200,
    });

    const notified: string[] = [];
    for (const c of candidates) {
      const cLower = c.toLowerCase();
      const hit = members.find(
        (m) =>
          m.user.id !== actorId &&
          ((m.user.name && m.user.name.toLowerCase() === cLower) ||
            (m.user.email && m.user.email.toLowerCase().startsWith(cLower))),
      );
      if (hit && !notified.includes(hit.user.id)) {
        notified.push(hit.user.id);
        await this.notify({
          workspaceId,
          userId: hit.user.id,
          actorId,
          type: 'MENTION',
          entityType,
          entityId,
          entityTitle,
          snippet: text.slice(0, 120),
          sendEmail: true,
        });
      }
    }
    if (notified.length > 0) {
      this.logger.log(`@mention: ${notified.length} notified in ${entityType}:${entityId}`);
    }
    return notified;
  }

  /** 指派变更通知（新负责人收到 ASSIGNED） */
  async notifyAssigned(params: {
    workspaceId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    entityTitle?: string;
    assigneeId: string;
  }) {
    return this.notify({
      workspaceId: params.workspaceId,
      userId: params.assigneeId,
      actorId: params.actorId,
      type: 'ASSIGNED',
      entityType: params.entityType,
      entityId: params.entityId,
      entityTitle: params.entityTitle,
      sendEmail: true,
    });
  }

  /**
   * P1-D：实体状态变更 → 通知投票人。
   * - 内部投票人（voterUserId）→ 站内 STATUS_CHANGED 通知（不重发邮件，站内已够）
   * - 外部投票人（门户 email）→ 邮件
   * - 频控：同实体 1 小时 1 次；进入终态（CLOSED/SHIPPED/DONE/REJECTED）必发
   */
  async notifyVotersOnStatusChange(params: {
    workspaceId: string;
    actorId: string;
    entityType: 'IDEA' | 'SUPPORT' | 'FEATURE';
    entityId: string;
    entityTitle: string;
    fromStatus: string;
    toStatus: string;
  }) {
    const { workspaceId, actorId, entityType, entityId, entityTitle, fromStatus, toStatus } = params;

    // 频控
    const now = Date.now();
    const terminal = ['CLOSED', 'SHIPPED', 'DONE', 'REJECTED', 'CANCELLED'];
    const last = this.voterNotifyMap.get(entityId);
    if (last && now - last < 3600_000 && !terminal.includes(toStatus)) return;
    this.voterNotifyMap.set(entityId, now);

    const votes = await this.prisma.vote.findMany({
      where: { entityType, entityId },
      select: { voterUserId: true, voterEmail: true, voterName: true },
    });
    if (votes.length === 0) return;

    const snippet = `状态变更：${fromStatus} → ${toStatus}`;
    const notifiedUsers = new Set<string>();

    // 内部投票人 → 站内通知
    for (const v of votes) {
      if (v.voterUserId && !notifiedUsers.has(v.voterUserId) && v.voterUserId !== actorId) {
        notifiedUsers.add(v.voterUserId);
        await this.notify({
          workspaceId,
          userId: v.voterUserId,
          actorId,
          type: 'STATUS_CHANGED',
          entityType,
          entityId,
          entityTitle,
          snippet,
          sendEmail: false,
        });
      }
    }

    // 外部投票人 → 邮件（站内无通道，Notification.userId 必填且 FK 内部 User）
    const external = new Map<string, string>(); // email -> name
    for (const v of votes) {
      if (v.voterEmail && !v.voterUserId) external.set(v.voterEmail, v.voterName || '');
    }
    if (external.size > 0) {
      const link = `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:6173'}/${entityType.toLowerCase()}s/${entityId}`;
      for (const [email] of external) {
        void this.mail
          .sendNotificationEmail(email, {
            actorName: 'Pinecone',
            typeLabel: '您投票的条目状态已变更',
            entityTitle,
            snippet,
            link,
          })
          .catch((e) => this.logger.warn(`voter email failed ${email}: ${e?.message}`));
      }
    }

    this.logger.log(`voter-notify: ${entityType}:${entityId} ${fromStatus}→${toStatus} (${notifiedUsers.size} in-app, ${external.size} email)`);
  }

  /** 按实体类型解析标题（用于通知展示） */
  private async resolveEntityTitle(
    workspaceId: string,
    entityType: string,
    entityId: string,
  ): Promise<string | undefined> {
    const key = entityType.toLowerCase();
    try {
      if (key === 'story') {
        const r = await this.prisma.story.findFirst({ where: { id: entityId, workspaceId }, select: { title: true } });
        return r?.title ?? undefined;
      }
      if (key === 'idea') {
        const r = await this.prisma.idea.findFirst({ where: { id: entityId, workspaceId }, select: { title: true } });
        return r?.title ?? undefined;
      }
      if (key === 'feature') {
        const r = await this.prisma.feature.findFirst({ where: { id: entityId, workspaceId }, select: { title: true } });
        return r?.title ?? undefined;
      }
      if (key === 'support') {
        const r = await this.prisma.support.findFirst({ where: { id: entityId, workspaceId }, select: { title: true } });
        return r?.title ?? undefined;
      }
    } catch {
      // 实体可能已删除，忽略标题
    }
    return undefined;
  }
}
