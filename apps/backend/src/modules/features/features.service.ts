import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { SortFeatureDto } from './dto/sort-feature.dto';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { withCodeRetry } from '../../common/code-generator';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { attachVotesAndScores, attachVotesAndScoresToSingle, filterAndSortByMetrics, METRIC_FETCH_LIMIT } from '../../common/entity-metrics';
import { EventsService } from '../events/events.service';
import { publishEntityCreated, publishStatusChanged } from '../../common/entity-events';

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
    private eventsService: EventsService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { releaseId?: string; status?: string; assigneeId?: string; priority?: string; parentFeatureId?: string; isEpic?: boolean; teamId?: string; sortBy?: string; themeId?: string; minScore?: number },
    skip: number = 0,
    take: number = 50,
    visibility?: { userId?: string; role?: string },
  ): Promise<PaginatedResult<any>> {
    const where: any = { workspaceId, deletedAt: null };
    if (query.releaseId) where.releaseId = query.releaseId;
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.priority) where.priority = query.priority;
    if (query.parentFeatureId) where.parentFeatureId = query.parentFeatureId;
    if (query.isEpic) where.isEpic = true;
    if (query.teamId) where.teamId = query.teamId;
    // P0-④ 团队隔离：非管理员只能看自己团队 + 未归属实体
    if (visibility?.role !== 'ADMIN' && visibility?.userId) {
      const tms = await this.prisma.teamMember.findMany({
        where: { team: { workspaceId }, userId: visibility.userId },
        select: { teamId: true },
      });
      where.AND = [{ OR: [{ teamId: null }, { teamId: { in: tms.map((t) => t.teamId) } }] }];
    }

    // 2026-08-15：命中指标过滤（排序/主题/最低分）时改为「全量拉取→attach→过滤排序→再分页」
    const needsMetricsFilter = !!(query.sortBy || query.themeId || (query.minScore ?? 0) > 0);
    if (needsMetricsFilter) {
      const all = await this.prisma.feature.findMany({
        where,
        take: METRIC_FETCH_LIMIT,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
          release: { select: { id: true, name: true, version: true } },
          _count: { select: { stories: true } },
        },
      });
      const enriched = await attachVotesAndScores(this.prisma, workspaceId, 'FEATURE', all);
      const filtered = filterAndSortByMetrics(enriched, {
        sortBy: query.sortBy,
        themeId: query.themeId,
        minScore: query.minScore,
      });
      return { items: filtered.slice(skip, skip + take), total: filtered.length, skip, take };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.feature.findMany({
        where,
        skip,
        take,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          assignee: { select: { id: true, email: true, name: true } },
          release: { select: { id: true, name: true, version: true } },
          _count: { select: { stories: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.feature.count({ where }),
    ]);

    // P0：附加票数/评分/主题
    const enriched = await attachVotesAndScores(this.prisma, workspaceId, 'FEATURE', items);

    return { items: enriched, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const feature = await this.prisma.feature.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
        release: { select: { id: true, name: true, version: true, status: true } },
        stories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            createdBy: { select: { id: true, email: true, name: true } },
            assignee: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });
    if (!feature) throw new NotFoundException('Feature not found');
    return attachVotesAndScoresToSingle(this.prisma, workspaceId, 'FEATURE', feature);
  }

  async create(workspaceId: string, dto: CreateFeatureDto, userId: string) {
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

    const maxSort = await this.prisma.feature.aggregate({
      where: { workspaceId, deletedAt: null },
      _max: { sortOrder: true },
    });

    const feature = await withCodeRetry(this.prisma, workspaceId, 'FEATURE', (code) =>
      this.prisma.feature.create({
        data: {
          workspaceId,
          code,
          title: dto.title,
          description: dto.description,
          releaseId: dto.releaseId,
          parentFeatureId: dto.parentFeatureId ?? null,
          isEpic: dto.isEpic ?? false,
          priority: dto.priority || 'P3',
          assigneeId: dto.assigneeId,

          ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),

          teamId: dto.teamId ?? null,
          assigneeName,
          createdById: userId,
          effortEstimate: dto.effortEstimate || null,
          effortUnit: dto.effortUnit || 'HOURS',
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          tags: dto.tags ?? [],
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          release: { select: { id: true, name: true } },
        },
      }),
    );
    await publishEntityCreated(this.eventsService, workspaceId, 'FEATURE', feature);
    return feature;
  }
  async update(workspaceId: string, id: string, dto: UpdateFeatureDto, userId: string) {
    const existing = await this.findOne(workspaceId, id);
    // 工作流校验（P0-② 可配置工作流）
    if (dto.status !== undefined) {
      if (!(await this.workflowsService.validateStatus(workspaceId, 'FEATURE', dto.status))) {
        throw new BadRequestException('Invalid status: ' + dto.status);
      }
      if (dto.status !== existing.status && !(await this.workflowsService.canTransition(workspaceId, 'FEATURE', existing.status, dto.status))) {
        throw new BadRequestException('Transition not allowed: ' + existing.status + ' → ' + dto.status);
      }
    }

    if (dto.releaseId) {
      const release = await this.prisma.release.findFirst({
        where: { id: dto.releaseId, workspaceId },
      });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }

    // SECURITY: assignee must be a member of this workspace (prevents
    // assigning entities to arbitrary user UUIDs).
    if (dto.assigneeId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: dto.assigneeId },
      });
      if (!member) throw new BadRequestException('Assignee is not a member of this workspace');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (dto.title !== undefined && dto.title !== existing.title) {
      changes.title = { old: existing.title, new: dto.title };
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      changes.description = { old: existing.description, new: dto.description };
    }
    if (dto.priority !== undefined && dto.priority !== existing.priority) {
      changes.priority = { old: existing.priority, new: dto.priority };
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      changes.assignee = { old: existing.assigneeId, new: dto.assigneeId };
    }
    if (dto.releaseId !== undefined && dto.releaseId !== existing.releaseId) {
      changes.releaseId = { old: existing.releaseId, new: dto.releaseId };
    }
    if (dto.tags !== undefined && JSON.stringify(dto.tags) !== JSON.stringify(existing.tags)) {
      changes.tags = { old: existing.tags, new: dto.tags };
    }
    if (dto.effortEstimate !== undefined && Number(dto.effortEstimate) !== Number(existing.effortEstimate)) {
      changes.effortEstimate = { old: existing.effortEstimate, new: dto.effortEstimate };
    }
    if (dto.effortUnit !== undefined && dto.effortUnit !== existing.effortUnit) {
      changes.effortUnit = { old: existing.effortUnit, new: dto.effortUnit };
    }

    const updateData: Record<string, unknown> = {};
    for (const key of Object.keys(dto) as (keyof UpdateFeatureDto)[]) {
      const value = dto[key];
      // assigneeName is ALWAYS derived from assigneeId server-side
      if (key === 'assigneeName') continue;
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // Handle date and empty-string-to-null transforms
    if (typeof updateData.effortEstimate === 'string' && updateData.effortEstimate === '') {
      delete updateData.effortEstimate;
    }
    if (updateData.effortEstimate === null) {
      delete updateData.effortEstimate;
    }

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

    const result = await this.prisma.feature.update({
      where: { id },
      data: updateData as Prisma.FeatureUpdateInput,
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
        release: { select: { id: true, name: true } },
      },
    });

    if (Object.keys(changes).length > 0) {
      await this.activitiesService.log(
        EntityType.FEATURE,
        id,
        ActionType.UPDATED,
        userId,
        workspaceId,
        { changes } as unknown as Prisma.InputJsonValue,
      );
    }

    // P2：状态变更事件（Webhook/Slack 订阅）+ P1-D：通知投票人
    if (existing.status !== result.status) {
      await publishStatusChanged(this.eventsService, workspaceId, 'FEATURE', result, existing.status, result.status);
      await this.notificationsService.notifyVotersOnStatusChange({
        workspaceId, actorId: userId, entityType: 'FEATURE', entityId: id,
        entityTitle: result.title || id, fromStatus: existing.status, toStatus: result.status,
      }).catch((e: any) => this.logger.warn(`voter-notify failed: ${e?.message}`));
    }

    // 指派变更 → 通知新负责人（ASSIGNED）
    if (changes.assignee && dto.assigneeId) {
      await this.notificationsService.notifyAssigned({
        workspaceId,
        actorId: userId,
        entityType: 'FEATURE',
        entityId: id,
        entityTitle: result.title,
        assigneeId: dto.assigneeId,
      });
    }

    return result;
  }

  async updateSortOrder(workspaceId: string, id: string, dto: SortFeatureDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.feature.update({
      where: { id },
      data: { sortOrder: dto.sortOrder },
    });
  }

  async remove(workspaceId: string, id: string) {
    const feature = await this.findOne(workspaceId, id);

    const storyCount = await this.prisma.story.count({ where: { featureId: id, deletedAt: null } });
    if (storyCount > 0) {
      throw new BadRequestException('Cannot delete feature with active stories. Move or delete stories first.');
    }

    await this.prisma.feature.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
