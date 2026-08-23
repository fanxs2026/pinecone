import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateIdeaDto } from './dto/create-idea.dto';
import { UpdateIdeaDto } from './dto/update-idea.dto';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { withCodeRetry } from '../../common/code-generator';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { attachVotesAndScores, attachVotesAndScoresToSingle, filterAndSortByMetrics, METRIC_FETCH_LIMIT } from '../../common/entity-metrics';
import { EventsService } from '../events/events.service';
import { publishEntityCreated, publishStatusChanged } from '../../common/entity-events';

@Injectable()
export class IdeasService {
  private readonly logger = new Logger(IdeasService.name);
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
    private eventsService: EventsService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { status?: string; category?: string; search?: string; teamId?: string; sortBy?: string; themeId?: string; minScore?: number },
    skip: number = 0,
    take: number = 50,
    visibility?: { userId?: string; role?: string },
  ): Promise<PaginatedResult<any>> {
    const where: any = { workspaceId, deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.teamId) where.teamId = query.teamId;
    // P0-④ 团队隔离
    if (visibility?.role !== 'ADMIN' && visibility?.userId) {
      const tms = await this.prisma.teamMember.findMany({
        where: { team: { workspaceId }, userId: visibility.userId },
        select: { teamId: true },
      });
      where.AND = [{ OR: [{ teamId: null }, { teamId: { in: tms.map((t) => t.teamId) } }] }];
    }
    if (query.category) where.category = query.category;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // 2026-08-15：命中指标过滤（排序/主题/最低分）时改为「全量拉取→attach→过滤排序→再分页」，
    // 消除近似分页（total 也是过滤后的真实数量）
    const needsMetricsFilter = !!(query.sortBy || query.themeId || (query.minScore ?? 0) > 0);
    if (needsMetricsFilter) {
      const all = await this.prisma.idea.findMany({
        where,
        take: METRIC_FETCH_LIMIT,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
        },
      });
      const enriched = await attachVotesAndScores(this.prisma, workspaceId, 'IDEA', all);
      const filtered = filterAndSortByMetrics(enriched, {
        sortBy: query.sortBy,
        themeId: query.themeId,
        minScore: query.minScore,
      });
      return { items: filtered.slice(skip, skip + take), total: filtered.length, skip, take };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.idea.findMany({
        where,
        skip,
        take,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.idea.count({ where }),
    ]);

    // P0：附加票数/评分/主题
    const enriched = await attachVotesAndScores(this.prisma, workspaceId, 'IDEA', items);

    return { items: enriched, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const idea = await this.prisma.idea.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    });
    if (!idea) throw new NotFoundException('Idea not found');
    return attachVotesAndScoresToSingle(this.prisma, workspaceId, 'IDEA', idea);
  }

  async create(workspaceId: string, dto: CreateIdeaDto, userId: string) {
    if (dto.status !== undefined && !(await this.workflowsService.validateStatus(workspaceId, 'IDEA', dto.status))) {
      throw new BadRequestException('Invalid status: ' + dto.status);
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

    const idea = await withCodeRetry(this.prisma, workspaceId, 'IDEA', (code) =>
      this.prisma.idea.create({
        data: {
          workspaceId,
          code,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          status: dto.status || 'OPEN',
          assigneeId: dto.assigneeId || null,
          teamId: dto.teamId ?? null,
          assigneeName,
          createdById: userId,
          tags: dto.tags ?? [],
        },
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
        },
      }),
    );
    await publishEntityCreated(this.eventsService, workspaceId, 'IDEA', idea);
    return idea;
  }

  async update(workspaceId: string, id: string, dto: UpdateIdeaDto, userId: string) {
    const existing = await this.findOne(workspaceId, id);
    // 工作流校验（P0-② 可配置工作流）
    if (dto.status !== undefined) {
      if (!(await this.workflowsService.validateStatus(workspaceId, 'IDEA', dto.status))) {
        throw new BadRequestException('Invalid status: ' + dto.status);
      }
      if (dto.status !== existing.status && !(await this.workflowsService.canTransition(workspaceId, 'IDEA', existing.status, dto.status))) {
        throw new BadRequestException('Transition not allowed: ' + existing.status + ' → ' + dto.status);
      }
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    // SECURITY: assignee must be a member of this workspace
    if (dto.assigneeId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: dto.assigneeId },
      });
      if (!member) throw new BadRequestException('Assignee is not a member of this workspace');
    }
    if (dto.title !== undefined && dto.title !== existing.title) {
      changes.title = { old: existing.title, new: dto.title };
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      changes.description = { old: existing.description, new: dto.description };
    }
    if (dto.category !== undefined && dto.category !== existing.category) {
      changes.category = { old: existing.category, new: dto.category };
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      changes.status = { old: existing.status, new: dto.status };
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      changes.assignee = { old: existing.assigneeId, new: dto.assigneeId };
    }
    if (dto.tags !== undefined && JSON.stringify(dto.tags) !== JSON.stringify(existing.tags)) {
      changes.tags = { old: existing.tags, new: dto.tags };
    }

    // assigneeName is ALWAYS derived from assigneeId server-side; ignore any
    // client-supplied value to prevent display spoofing.
    const updateData: Record<string, unknown> = { ...dto };
    delete updateData.assigneeName;

    // Sync denormalized assigneeName when assigneeId changes
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        const assigneeUser = await this.prisma.user.findUnique({
          where: { id: dto.assigneeId },
          select: { name: true, email: true },
        });
        updateData.assigneeName = assigneeUser ? (assigneeUser.name || assigneeUser.email) : null;
      } else {
        updateData.assigneeName = null;
      }
    }

    const result = await this.prisma.idea.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    });

    if (Object.keys(changes).length > 0) {
      await this.activitiesService.log(
        EntityType.IDEA,
        id,
        ActionType.UPDATED,
        userId,
        workspaceId,
        { changes } as unknown as Prisma.InputJsonValue,
      );
    }

    // P2：状态变更事件（Webhook/Slack 订阅）+ P1-D：通知投票人
    if (existing.status !== result.status) {
      await publishStatusChanged(this.eventsService, workspaceId, 'IDEA', result, existing.status, result.status);
      await this.notificationsService.notifyVotersOnStatusChange({
        workspaceId, actorId: userId, entityType: 'IDEA', entityId: id,
        entityTitle: result.title || id, fromStatus: existing.status, toStatus: result.status,
      }).catch((e: any) => this.logger.warn(`voter-notify failed: ${e?.message}`));
    }

    // 指派变更 → 通知新负责人（ASSIGNED）
    if (changes.assignee && dto.assigneeId) {
      await this.notificationsService.notifyAssigned({
        workspaceId,
        actorId: userId,
        entityType: 'IDEA',
        entityId: id,
        entityTitle: result.title,
        assigneeId: dto.assigneeId,
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
      });
    }

    return result;
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.idea.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
