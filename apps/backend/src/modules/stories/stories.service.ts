import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { SortStoryDto } from './dto/sort-story.dto';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { withCodeRetry } from '../../common/code-generator';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { EventsService } from '../events/events.service';
import { publishEntityCreated, publishStatusChanged } from '../../common/entity-events';

@Injectable()
export class StoriesService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
    private eventsService: EventsService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { featureId?: string; status?: string; assigneeId?: string; priority?: string; teamId?: string; sprintId?: string; backlog?: boolean; parentId?: string; isSubtask?: boolean },
    skip: number = 0,
    take: number = 50,
    visibility?: { userId?: string; role?: string },
  ): Promise<PaginatedResult<any>> {
    const where: any = { workspaceId, deletedAt: null };
    if (query.featureId) where.featureId = query.featureId;
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.priority) where.priority = query.priority;
    if (query.teamId) where.teamId = query.teamId;
    if (query.sprintId) where.sprintId = query.sprintId;
    if (query.backlog) where.sprintId = null;
    if (query.parentId) where.parentId = query.parentId;
    if (query.isSubtask) where.parentId = { not: null };
    // 2026-08-14：默认只查顶级 Story（parentId=null）——子任务不进入看板/列表，
    // 仅 story 详情页抽屉通过显式 parentId 查询。要查全部子任务用 isSubtask=1。
    if (!query.parentId && !query.isSubtask) where.parentId = null;
    // P0-④ 团队隔离：非管理员只能看自己团队 + 未归属实体
    if (visibility?.role !== 'ADMIN' && visibility?.userId) {
      const tms = await this.prisma.teamMember.findMany({
        where: { team: { workspaceId }, userId: visibility.userId },
        select: { teamId: true },
      });
      where.AND = [{ OR: [{ teamId: null }, { teamId: { in: tms.map((t) => t.teamId) } }] }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.story.findMany({
        where,
        skip,
        take,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
          feature: { select: { id: true, title: true } },
          release: { select: { id: true, name: true, version: true, status: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.story.count({ where }),
    ]);

    // 2026-08-14：批量聚合每条的「实际已记录工时」→ loggedHours（含子任务工时汇总）
    const loggedHoursMap = await this.sumLoggedHoursWithSubtasks(items.map((s) => s.id));
    const itemsWithHours = items.map((s) => ({
      ...s,
      loggedHours: loggedHoursMap.get(s.id) ?? 0,
    }));

    return { items: itemsWithHours, total, skip, take };
  }

  /**
   * 聚合指定 story 的「实际已记录工时」，含所有子任务工时之和（2026-08-14）。
   * story 总工时 = story 自身 timeEntries + 全部子任务（parentId=story.id）的 timeEntries。
   * 返回 Map<storyId, totalHours>；TimeEntry.hours 是 Decimal，统一转 Number。
   */
  private async sumLoggedHoursWithSubtasks(storyIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (storyIds.length === 0) return result;

    // 查所有直接子任务（parentId ∈ storyIds）
    const subtasks = await this.prisma.story.findMany({
      where: { parentId: { in: storyIds }, deletedAt: null },
      select: { id: true, parentId: true },
    });

    // 自身 + 子任务 全部 id 的工时聚合
    const allIds = [...storyIds, ...subtasks.map((s) => s.id)];
    const agg = await this.prisma.timeEntry.groupBy({
      by: ['storyId'],
      where: { storyId: { in: allIds } },
      _sum: { hours: true },
    });

    const sumByStory = new Map<string, number>();
    for (const row of agg) {
      const sid = row.storyId!;
      sumByStory.set(sid, (sumByStory.get(sid) ?? 0) + Number(row._sum.hours ?? 0));
    }
    for (const id of storyIds) {
      result.set(id, sumByStory.get(id) ?? 0);
    }
    for (const st of subtasks) {
      const pid = st.parentId!;
      result.set(pid, (result.get(pid) ?? 0) + (sumByStory.get(st.id) ?? 0));
    }
    return result;
  }

  async findOne(workspaceId: string, id: string) {
    const story = await this.prisma.story.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
        feature: { select: { id: true, title: true } },
        release: { select: { id: true, name: true, version: true, status: true } },
      },
    });
    if (!story) throw new NotFoundException('Story not found');
    // 2026-08-14：详情返回 loggedHours（含子任务工时），前端工时汇总用
    const hoursMap = await this.sumLoggedHoursWithSubtasks([id]);
    return { ...story, loggedHours: hoursMap.get(id) ?? 0 };
  }

  async create(workspaceId: string, dto: CreateStoryDto, userId: string) {
    if (dto.featureId) {
      const feature = await this.prisma.feature.findFirst({
        where: { id: dto.featureId, workspaceId },
      });
      if (!feature) throw new BadRequestException('Feature not found in this workspace');
    }
    if (dto.releaseId) {
      const release = await this.prisma.release.findFirst({
        where: { id: dto.releaseId, workspaceId },
      });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }
    // SECURITY: assignee must be a member of this workspace
    if (dto.assigneeId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: dto.assigneeId },
      });
      if (!member) throw new BadRequestException('Assignee is not a member of this workspace');
    }
    // Derive assigneeName from the assignee user — never trust a
    // client-supplied value (prevents display spoofing).
    let assigneeName: string | null = null;
    if (dto.assigneeId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
        select: { name: true, email: true },
      });
      assigneeName = u ? (u.name || u.email) : null;
    }

    const maxSort = await this.prisma.story.aggregate({
      where: { workspaceId, deletedAt: null },
      _max: { sortOrder: true },
    });

    const story = await withCodeRetry(this.prisma, workspaceId, 'STORY', (code) =>
      this.prisma.story.create({
        data: {
          workspaceId,
          code,
          featureId: dto.featureId,
          releaseId: dto.releaseId ?? null,
          title: dto.title,
          description: dto.description,
          acceptanceCriteria: dto.acceptanceCriteria,
          storyPoints: dto.storyPoints,
          priority: dto.priority || 'P3',
          status: 'OPEN',
          assigneeId: dto.assigneeId,
          sprintId: dto.sprintId ?? null,
          parentId: dto.parentId ?? null,

          // P2#9（2026-08-21）：删除死代码——原 188 行 spread 会被本行立即覆盖（对象字面量后者胜出），纯无效
          teamId: dto.teamId ?? null,
          assigneeName,
          createdById: userId,
          estimateHours: dto.estimateHours,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          feature: { select: { id: true, title: true } },
          release: { select: { id: true, name: true, version: true, status: true } },
        },
      }),
    );
    await publishEntityCreated(this.eventsService, workspaceId, 'STORY', story);
    return story;
  }

  async update(workspaceId: string, id: string, dto: UpdateStoryDto, userId: string) {
    const existing = await this.findOne(workspaceId, id);
    // 工作流校验（P0-② 可配置工作流）
    if (dto.status !== undefined) {
      if (!(await this.workflowsService.validateStatus(workspaceId, 'STORY', dto.status))) {
        throw new BadRequestException('Invalid status: ' + dto.status);
      }
      if (dto.status !== existing.status && !(await this.workflowsService.canTransition(workspaceId, 'STORY', existing.status, dto.status))) {
        throw new BadRequestException('Transition not allowed: ' + existing.status + ' → ' + dto.status);
      }
    }

    // I6 CI 门禁（2026-08-18 P1，软+可配硬拦）：CI_GATE_ENABLED=true 时，
    // release 最新构建 FAILURE/UNSTABLE 阻止 Story 转 DONE（默认软提示不拦截）
    if (dto.status === 'DONE' && existing.status !== 'DONE' && process.env.CI_GATE_ENABLED === 'true') {
      const releaseId = dto.releaseId !== undefined ? dto.releaseId : existing.releaseId;
      if (releaseId) {
        const latest = await this.prisma.ciBuild.findFirst({
          where: { workspaceId, releaseId },
          orderBy: { createdAt: 'desc' },
          select: { status: true, name: true },
        });
        if (latest && ['FAILURE', 'UNSTABLE'].includes(latest.status)) {
          throw new BadRequestException(
            `CI 门禁拦截：release 最新构建「${latest.name}」为 ${latest.status}，无法标记完成（CI_GATE_ENABLED=false 可关闭硬拦）`,
          );
        }
      }
    }

    if (dto.featureId) {
      const feature = await this.prisma.feature.findFirst({
        where: { id: dto.featureId, workspaceId },
      });
      if (!feature) throw new BadRequestException('Feature not found in this workspace');
    }
    // releaseId 为 null 表示清除发布周期，仅当传入具体值时校验归属
    if (dto.releaseId !== undefined && dto.releaseId !== null) {
      const release = await this.prisma.release.findFirst({
        where: { id: dto.releaseId, workspaceId },
      });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }
    // SECURITY: assignee must be a member of this workspace
    if (dto.assigneeId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: dto.assigneeId },
      });
      if (!member) throw new BadRequestException('Assignee is not a member of this workspace');
    }

    // P1-1（2026-08-21）：parentId 重挂校验——防祖先环（此前 ...dto 直写可造环致前端树死循环）
    // 新父节点不能是：① 自己；② 不在本 workspace；③ 自己的后代（上溯祖先链命中自身即成环）
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Story cannot be its own parent');
      }
      if (dto.parentId) {
        const parent = await this.prisma.story.findFirst({
          where: { id: dto.parentId, workspaceId },
          select: { id: true, parentId: true },
        });
        if (!parent) throw new BadRequestException('Parent story not found in this workspace');
        let cursor: string | null = parent.parentId;
        while (cursor) {
          if (cursor === id) {
            throw new BadRequestException('Cannot reparent: would create a cycle');
          }
          const anc = await this.prisma.story.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });
          cursor = anc?.parentId ?? null;
        }
      }
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (dto.title !== undefined && dto.title !== existing.title) {
      changes.title = { old: existing.title, new: dto.title };
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      changes.description = { old: existing.description, new: dto.description };
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      changes.assignee = { old: existing.assigneeId, new: dto.assigneeId };
    }

    // Derive assigneeName from assigneeId server-side (never trust client value)
    let derivedAssigneeName: string | null | undefined;
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        const u = await this.prisma.user.findUnique({
          where: { id: dto.assigneeId },
          select: { name: true, email: true },
        });
        derivedAssigneeName = u ? (u.name || u.email) : null;
      } else {
        derivedAssigneeName = null;
      }
    }

    const result = await this.prisma.story.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.estimateHours !== undefined ? { estimateHours: dto.estimateHours } : {}),
        ...(derivedAssigneeName !== undefined ? { assigneeName: derivedAssigneeName } : {}),
      },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
        feature: { select: { id: true, title: true } },
        release: { select: { id: true, name: true, version: true, status: true } },
      },
    });

    if (Object.keys(changes).length > 0) {
      await this.activitiesService.log(
        EntityType.STORY,
        id,
        ActionType.UPDATED,
        userId,
        workspaceId,
        { changes } as unknown as Prisma.InputJsonValue,
      );
    }

    // P2：状态变更事件（Webhook/Slack 订阅）+ Activity 审计（P1-2，2026-08-21 补齐，
    // 对齐 test-cases 的 ActionType.STATUS_CHANGED 全局口径，不再只记 Webhook 事件）
    if (existing.status !== result.status) {
      await publishStatusChanged(this.eventsService, workspaceId, 'STORY', result, existing.status, result.status);
      await this.activitiesService.log(
        EntityType.STORY,
        id,
        ActionType.STATUS_CHANGED,
        userId,
        workspaceId,
        { oldStatus: existing.status, newStatus: result.status } as unknown as Prisma.InputJsonValue,
      );
    }

    // 指派变更 → 通知新负责人（ASSIGNED）
    if (changes.assignee && dto.assigneeId) {
      await this.notificationsService.notifyAssigned({
        workspaceId,
        actorId: userId,
        entityType: 'STORY',
        entityId: id,
        entityTitle: result.title,
        assigneeId: dto.assigneeId,
      });
    }

    return result;
  }

  async updateSortOrder(workspaceId: string, id: string, dto: SortStoryDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.story.update({
      where: { id },
      data: { sortOrder: dto.sortOrder },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.story.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
