import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { ActivitiesService } from '../activities/activities.service';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';

@Injectable()
export class TimeTrackingService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { storyId?: string; userId?: string; from?: string; to?: string; entityType?: string; entityId?: string },
    skip: number = 0,
    take: number = 50,
  ): Promise<PaginatedResult<any>> {
    const where: any = { workspaceId };

    if (query.storyId) where.storyId = query.storyId;
    if (query.userId) where.userId = query.userId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, name: true } },
          story: { select: { id: true, title: true, code: true, parentId: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    // P3-4 修复：Decimal hours → number（JSON 序列化后契约一致，前端不再需要 toHoursNumber 兼容）
    const normalized = items.map((e: any) => ({ ...e, hours: Number(e.hours) }));

    // 2026-08-14：无 story 的实体绑定工时（IDEA/FEATURE/SUPPORT）→ 补 entity 标题，
    // 前端表格显示实体 code/title（否则「—」）
    const entityRecords = normalized.filter((e: any) => !e.storyId && e.entityType && e.entityId);
    if (entityRecords.length > 0) {
      const byType = new Map<string, string[]>();
      for (const e of entityRecords) {
        const list = byType.get(e.entityType) ?? [];
        list.push(e.entityId);
        byType.set(e.entityType, list);
      }
      const titleMap = new Map<string, string>();
      for (const [type, ids] of byType) {
        let rows: Array<{ id: string; code: string | null; title: string }> = [];
        if (type === 'IDEA') {
          rows = await this.prisma.idea.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true } });
        } else if (type === 'FEATURE') {
          rows = await this.prisma.feature.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true } });
        } else if (type === 'SUPPORT') {
          rows = await this.prisma.support.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true } });
        }
        for (const row of rows) {
          titleMap.set(`${type}:${row.id}`, `${row.code || ''} ${row.title}`.trim());
        }
      }
      for (const e of normalized) {
        if (!e.storyId && e.entityType && e.entityId) {
          e.entity = { type: e.entityType, label: titleMap.get(`${e.entityType}:${e.entityId}`) ?? null };
        }
      }
    }

    return { items: normalized, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, workspaceId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        story: { select: { id: true, title: true, code: true, parentId: true } },
      },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    // TT-1 修复：hours Decimal → number（契约一致）
    return { ...entry, hours: Number(entry.hours) };
  }

  async create(workspaceId: string, dto: CreateTimeEntryDto, userId: string) {
    // Validate: either storyId or (entityType + entityId) must be provided
    if (!dto.storyId && (!dto.entityType || !dto.entityId)) {
      throw new BadRequestException('Either storyId or entityType+entityId must be provided');
    }
    if (dto.storyId) {
      const story = await this.prisma.story.findFirst({
        where: { id: dto.storyId, workspaceId },
      });
      if (!story) throw new BadRequestException('Story not found in this workspace');
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        workspaceId,
        storyId: dto.storyId || null,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        userId,
        description: dto.description ?? '',
        hours: dto.hours,
        date: new Date(dto.date),
        billable: dto.billable ?? true,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        story: { select: { id: true, title: true, code: true, parentId: true } },
      },
    });

    // Log TIME_LOGGED activity for the bound entity
    const activityEntityType: EntityType | null = dto.storyId
      ? EntityType.STORY
      : (Object.values(EntityType) as string[]).includes(dto.entityType!)
        ? (dto.entityType as EntityType)
        : null;

    if (activityEntityType) {
      const metadata: Prisma.InputJsonValue = {
        hours: dto.hours,
        description: dto.description,
        billable: dto.billable ?? true,
        date: dto.date,
        timeEntryId: entry.id,
      };
      try {
        await this.activitiesService.log(
          activityEntityType,
          dto.storyId ?? dto.entityId!,
          ActionType.TIME_LOGGED,
          userId,
          workspaceId,
          metadata,
        );
      } catch {
        // Activity logging must never block the time entry itself
      }
    }

    // TT-1 修复：hours Decimal → number（契约一致）
    return { ...entry, hours: Number(entry.hours) };
  }

  async update(workspaceId: string, id: string, dto: UpdateTimeEntryDto, userId: string) {
    const entry = await this.findOne(workspaceId, id);
    if (entry.userId !== userId) {
      throw new ForbiddenException('You can only update your own time entries');
    }

    const updateData: any = { ...dto };
    if (dto.date) updateData.date = new Date(dto.date);
    if (dto.storyId) {
      const story = await this.prisma.story.findFirst({
        where: { id: dto.storyId, workspaceId },
      });
      if (!story) throw new BadRequestException('Story not found in this workspace');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, name: true } },
        story: { select: { id: true, title: true, code: true, parentId: true } },
      },
    });
    // TT-1 修复：hours Decimal → number（契约一致）
    return { ...updated, hours: Number(updated.hours) };
  }

  async remove(workspaceId: string, id: string, userId: string, role?: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const entry = await this.findOne(workspaceId, id);
    // Owner can delete their own entry; workspace admins can delete any
    if (entry.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own time entries');
    }
    await this.prisma.timeEntry.delete({ where: { id } });
  }
}
