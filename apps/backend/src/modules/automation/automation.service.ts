import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';

export type RuleTrigger = 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED';
export type ActionType = 'NOTIFY' | 'SET_STATUS';

export interface RuleAction {
  type: ActionType;
  /** NOTIFY: ASSIGNEE | CREATOR | ALL_MEMBERS | ROLE:ADMIN/MEMBER/VIEWER | USER:<userId> */
  target?: string;
  message?: string;
  /** SET_STATUS: 目标状态名 */
  status?: string;
}

/**
 * 自动化规则引擎（P0-③：当…则…）。
 * - 触发器：实体创建（CREATED）/ 状态变更为指定值（STATUS_CHANGED）/ 被指派（ASSIGNED）
 * - 动作：NOTIFY（站内通知）/ SET_STATUS（自动流转状态，标记 automated 防递归）
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
  ) {}

  // ===== 规则 CRUD =====

  async list(workspaceId: string) {
    return this.prisma.automationRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    workspaceId: string,
    dto: {
      name: string;
      entityType: string;
      trigger: RuleTrigger;
      triggerValue?: string;
      actions: RuleAction[];
    },
  ) {
    if (!dto.name) throw new BadRequestException('规则名称不能为空');
    if (!dto.actions?.length) throw new BadRequestException('至少需要一个动作');
    if (!['STORY', 'IDEA', 'FEATURE', 'SUPPORT', 'ALL'].includes(dto.entityType)) {
      throw new BadRequestException('entityType 无效');
    }
    for (const a of dto.actions) {
      if (a.type === 'SET_STATUS' && !a.status) throw new BadRequestException('SET_STATUS 动作需要 status');
    }
    return this.prisma.automationRule.create({
      data: {
        workspaceId,
        name: dto.name,
        entityType: dto.entityType,
        trigger: dto.trigger,
        triggerValue: dto.triggerValue ?? null,
        actions: dto.actions as unknown as object,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: Partial<{ name: string; enabled: boolean; trigger: RuleTrigger; triggerValue?: string; actions: RuleAction[] }>) {
    const rule = await this.prisma.automationRule.findFirst({ where: { id, workspaceId } });
    if (!rule) throw new NotFoundException('Rule not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.trigger !== undefined) data.trigger = dto.trigger;
    if (dto.triggerValue !== undefined) data.triggerValue = dto.triggerValue;
    if (dto.actions !== undefined) data.actions = dto.actions as unknown as object;
    return this.prisma.automationRule.update({ where: { id }, data });
  }

  async remove(workspaceId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({ where: { id, workspaceId } });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.prisma.automationRule.delete({ where: { id } });
    return { ok: true };
  }

  // ===== 规则评估 =====

  /**
   * 评估并执行匹配规则。
   * @param automated 由规则触发的变更（SET_STATUS 自动流转）→ 不再次评估，防递归
   */
  async evaluate(params: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    entityTitle?: string;
    actorId: string;
    trigger: RuleTrigger;
    triggerValue?: string;
    automated?: boolean;
  }) {
    if (params.automated) return; // 防递归：规则触发的变更不再评估
    const { workspaceId, entityType, entityId, entityTitle, actorId, trigger, triggerValue } = params;

    const rules = await this.prisma.automationRule.findMany({
      where: { workspaceId, enabled: true },
    });

    for (const rule of rules) {
      // 实体匹配（ALL 或精确实体）
      if (rule.entityType !== 'ALL' && rule.entityType !== entityType) continue;
      // 触发匹配
      if (rule.trigger !== trigger) continue;
      if (trigger === 'STATUS_CHANGED' && rule.triggerValue && rule.triggerValue !== triggerValue) continue;

      const actions = (rule.actions as unknown as RuleAction[]) ?? [];
      for (const action of actions) {
        try {
          if (action.type === 'NOTIFY') {
            await this.notifyTargets(workspaceId, actorId, entityType, entityId, entityTitle, action);
          } else if (action.type === 'SET_STATUS' && action.status && !params.automated) {
            // 自动流转状态（复用实体 update 逻辑由调用方处理；这里发事件让调用方感知）
            this.logger.log(`[Automation] ${rule.name} → SET_STATUS ${action.status} on ${entityType}:${entityId}`);
            await this.applyStatusChange(workspaceId, entityType, entityId, action.status);
          }
        } catch (e: any) {
          this.logger.warn(`[Automation] action failed (${rule.name}): ${e?.message}`);
        }
      }
      this.logger.log(`[Automation] rule "${rule.name}" fired on ${entityType}:${entityId}`);
    }
  }

  private async notifyTargets(
    workspaceId: string,
    actorId: string,
    entityType: string,
    entityId: string,
    entityTitle: string | undefined,
    action: RuleAction,
  ) {
    const target = action.target ?? 'ASSIGNEE';
    let userIds: string[] = [];

    if (target.startsWith('USER:')) {
      userIds = [target.slice(5)];
    } else if (target === 'CREATOR') {
      const entity = await this.getEntity(workspaceId, entityType, entityId);
      if (entity?.createdById) userIds = [entity.createdById];
    } else if (target === 'ALL_MEMBERS' || target.startsWith('ROLE:')) {
      const role = target.startsWith('ROLE:') ? target.slice(5) : undefined;
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId, ...(role ? { role: role as never } : {}) },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
    } else {
      // ASSIGNEE
      const entity = await this.getEntity(workspaceId, entityType, entityId);
      if ((entity as any)?.assigneeId) userIds = [(entity as any).assigneeId];
    }

    const message = action.message ?? `【自动化】${entityType}`;
    for (const uid of [...new Set(userIds)]) {
      await this.notificationsService.notify({
        workspaceId,
        userId: uid,
        actorId,
        type: 'MENTION',
        entityType,
        entityId,
        entityTitle,
        snippet: message,
        sendEmail: false,
      });
    }
  }

  /** 自动流转状态（直接写 DB，标记 automated 由调用方判断——此处直接更新并跳过重评估） */
  private async applyStatusChange(workspaceId: string, entityType: string, entityId: string, status: string) {
    const key = entityType.toLowerCase();
    const data = { status };
    if (key === 'story') await this.prisma.story.update({ where: { id: entityId }, data });
    else if (key === 'idea') await this.prisma.idea.update({ where: { id: entityId }, data });
    else if (key === 'feature') await this.prisma.feature.update({ where: { id: entityId }, data });
    else if (key === 'support') await this.prisma.support.update({ where: { id: entityId }, data });
  }

  private async getEntity(workspaceId: string, entityType: string, entityId: string) {
    const key = entityType.toLowerCase();
    try {
      if (key === 'story') return await this.prisma.story.findFirst({ where: { id: entityId, workspaceId } });
      if (key === 'idea') return await this.prisma.idea.findFirst({ where: { id: entityId, workspaceId } });
      if (key === 'feature') return await this.prisma.feature.findFirst({ where: { id: entityId, workspaceId } });
      if (key === 'support') return await this.prisma.support.findFirst({ where: { id: entityId, workspaceId } });
    } catch {
      return null;
    }
    return null;
  }
}
