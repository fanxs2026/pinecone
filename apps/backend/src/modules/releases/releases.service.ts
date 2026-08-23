import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { UpdateReleaseStatusDto } from './dto/update-release-status.dto';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { EventsService } from '../events/events.service';
import { publishEntityCreated, publishStatusChanged } from '../../common/entity-events';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class ReleasesService {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
  ) {}

  /** 甘特数据（Phase 3-③）：日期字段 + 任务/功能/缺陷计数，仅含已排期或未排期但存在的发布 */
  async gantt(workspaceId: string) {
    const releases = await this.prisma.release.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'asc' },
      include: { dependsOn: { select: { name: true } } },
    });
    return Promise.all(releases.map(async (release) => {
      const [storyCount, featureCount, supportCount] = await Promise.all([
        this.prisma.story.count({ where: { workspaceId, releaseId: release.id, deletedAt: null } }),
        this.prisma.feature.count({ where: { workspaceId, releaseId: release.id, deletedAt: null } }),
        this.prisma.support.count({ where: { workspaceId, releaseId: release.id, deletedAt: null } }),
      ]);
      return {
        id: release.id,
        name: release.name,
        version: release.version,
        status: release.status,
        startDate: release.startDate,
        endDate: release.endDate,
        stageDate: release.stageDate,
        productionDate: release.productionDate,
        dependsOnId: release.dependsOnId,
        dependsOnName: release.dependsOn ? release.dependsOn.name : null,
        storyCount,
        featureCount,
        supportCount,
      };
    }));
  }

  async findAll(
    workspaceId: string,
    query: { status?: string },
    skip: number = 0,
    take: number = 50,
  ): Promise<PaginatedResult<any>> {
    const where: any = { workspaceId };
    if (query.status) where.status = query.status;

    const [releases, total] = await this.prisma.$transaction([
      this.prisma.release.findMany({
        where,
        skip,
        take,
        include: {
          _count: { select: { features: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.release.count({ where }),
    ]);

    // Sort by version ascending (localeCompare with numeric)
    releases.sort((a, b) => (a.version || '').localeCompare(b.version || '', undefined, { numeric: true }) || new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime());

    const items = await Promise.all(releases.map(async (release) => {
      const storyAgg = await this.prisma.story.aggregate({
        where: {
          feature: { releaseId: release.id },
        },
        _count: true,
        _sum: { storyPoints: true },
      });
      return {
        ...release,
        storyCount: storyAgg._count,
        totalStoryPoints: storyAgg._sum.storyPoints || 0,
      };
    }));

    return { items, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const release = await this.prisma.release.findFirst({
      where: { id, workspaceId },
      include: {
        features: {
          include: {
            _count: { select: { stories: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!release) throw new NotFoundException('Release not found');
    return release;
  }

  async create(workspaceId: string, dto: CreateReleaseDto) {
    if (dto.startDate && dto.endDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }
    // G8 甘特依赖：依赖目标必须存在且属于同一工作区
    if (dto.dependsOnId) {
      await this.assertDependencyInWorkspace(workspaceId, dto.dependsOnId);
    }

    const release = await this.prisma.release.create({
      data: {
        workspaceId,
        name: dto.name,
        version: dto.version,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        stageDate: dto.stageDate ? new Date(dto.stageDate) : null,
        productionDate: dto.productionDate ? new Date(dto.productionDate) : null,
        totalCapacity: dto.totalCapacity ?? null,
        dependsOnId: dto.dependsOnId ?? null,
      },
    });
    await publishEntityCreated(this.eventsService, workspaceId, 'RELEASE', release as any);
    return release;
  }

  /** G8：校验依赖目标存在且属于同一工作区 */
  private async assertDependencyInWorkspace(workspaceId: string, dependsOnId: string) {
    const target = await this.prisma.release.findFirst({ where: { id: dependsOnId, workspaceId } });
    if (!target) throw new BadRequestException('Depends-on release not found in this workspace');
  }

  async update(workspaceId: string, id: string, dto: UpdateReleaseDto) {
    const release = await this.findOne(workspaceId, id);

    if (release.status === 'CLOSED') {
      throw new BadRequestException('Cannot update a closed release');
    }
    // G8 甘特依赖：依赖目标同工作区校验（仅当提供时）
    if (dto.dependsOnId) {
      await this.assertDependencyInWorkspace(workspaceId, dto.dependsOnId);
    }

    const updated = await this.prisma.release.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.stageDate ? { stageDate: new Date(dto.stageDate) } : {}),
        ...(dto.productionDate ? { productionDate: new Date(dto.productionDate) } : {}),
        totalCapacity: dto.totalCapacity !== undefined ? dto.totalCapacity : undefined,
      },
    });

    // P2：状态变更事件（Webhook/Slack 订阅）
    if (release.status !== updated.status) {
      await publishStatusChanged(this.eventsService, workspaceId, 'RELEASE', updated as any, release.status, updated.status);
    }
    return updated;
  }

  async updateStatus(workspaceId: string, id: string, dto: UpdateReleaseStatusDto) {
    const release = await this.findOne(workspaceId, id);

    const allowed = VALID_TRANSITIONS[release.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${release.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.release.update({
      where: { id },
      data: { status: dto.status },
    });

    // P2：状态变更事件（Webhook/Slack 订阅）
    if (release.status !== updated.status) {
      await publishStatusChanged(this.eventsService, workspaceId, 'RELEASE', updated as any, release.status, updated.status);
    }
    return updated;
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.release.delete({ where: { id } });
  }
}
